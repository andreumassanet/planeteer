import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { DAY_MOOD, NIGHT_MOOD, ORBIT_LOOK, TWILIGHT_MOOD, setToonMood, type Mood } from './theme.ts';
import { unitAt } from './sphere.ts';
import { GALACTIC, equatorialBasis } from './celestial.ts';

/**
 * The real sun, at the real time.
 *
 * The sun used to travel with the player, and the reason was sound: on a planet
 * you walk all the way around, so a fixed sun leaves half the surface in the
 * dark. This chooses that darkness instead, which means it also has to answer
 * what the dark half looks like. That answer is in `theme.ts` as three moods,
 * and the only thing this file decides is which blend of them you are standing
 * in.
 *
 * The astronomy is NOAA's low-precision solar position: declination and the
 * equation of time from a UTC timestamp, good to about a hundredth of a degree
 * over any year this project will run in. No data, no dependency, and every
 * step of it is checkable against a fact — an equinox terminator through both
 * poles, the sun overhead at 23.44 N in June, solar noon where your longitude
 * meets the subsolar one.
 */

const DEG = Math.PI / 180;

/** What both discs are mixed towards, so neither ever goes as dim as its light. */
const WHITE = new THREE.Color(0xffffff);

/**
 * The sun's direction, published as a live uniform.
 *
 * `Mood` answers "what is the light like *where the player stands*", which is
 * the right question for the air around you and the wrong one for anything seen
 * from the air: the terminator is in the frame, so a shader that wants to know
 * whether a *point* is in daylight has to ask at that point. `lights.ts` owns
 * exactly this for what the world emits; this is the same fact for what it is
 * shaded by, and it lives here because here is where the direction is computed.
 * Written once a frame by `update`, so anything holding it is a frame behind
 * nothing.
 */
export const sunUniform = { value: new THREE.Vector3(0, 1, 0) };

/** Where the sun is straight up, and by how much the clock lies about it. */
export interface Solar {
  /** Latitude of the subsolar point, degrees. Between -23.44 and +23.44. */
  declination: number;
  /** Longitude of the subsolar point, degrees east of Greenwich. */
  subsolarLon: number;
  /** Apparent solar time minus mean solar time, minutes. +-16 over a year. */
  equationOfTime: number;
}

const norm360 = (x: number): number => x - 360 * Math.floor(x / 360);

/**
 * The fields the climb overrides, written once so that adding a term to
 * `OrbitLook` cannot be half-applied.
 *
 * The two lists are split because a colour lerps through `Color` and a scalar
 * does not, which is the only reason `blend` is thirty lines rather than one.
 */
const ORBIT_INTENSITIES = [
  'ambientIntensity',
  'hemisphereIntensity',
  'sunIntensity',
  'moonIntensity',
  'rampShadow',
  'rampGamma',
] as const;

const ORBIT_COLORS = ['ambient', 'hemisphereSky', 'hemisphereGround', 'sun', 'moon'] as const;

/**
 * NOAA's solar position, term for term.
 *
 * The one line worth reading twice is the equation of time. Without it the sun
 * is up to sixteen minutes wrong — four degrees of longitude, 1,100 units on
 * this planet — and the error is seasonal, so it never looks like a bug. It is
 * also the only reason a sundial and a clock disagree, which is exactly the
 * fact this whole file exists to model.
 */
export function solarPosition(
  date: Date,
  // Written in place when given: `createSky` asks every frame.
  out: Solar = { declination: 0, subsolarLon: 0, equationOfTime: 0 },
): Solar {
  const julian = date.getTime() / 86400000 + 2440587.5;
  const t = (julian - 2451545) / 36525;

  const meanLon = norm360(280.46646 + t * (36000.76983 + t * 0.0003032));
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  // Equation of the centre: the orbit is an ellipse, so the sun runs ahead of
  // its own average by up to two degrees.
  const m = meanAnomaly * DEG;
  const centre =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;

  // Nutation, as one term. Worth the line: it is the difference between "close
  // enough" and an equinox that lands on the right minute.
  const omega = (125.04 - 1934.136 * t) * DEG;
  const apparentLon = (meanLon + centre - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;
  const obliquity =
    (23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 +
      0.00256 * Math.cos(omega)) *
    DEG;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLon)) / DEG;

  const y = Math.tan(obliquity / 2) ** 2;
  const l = meanLon * DEG;
  const equationOfTime =
    (4 *
      (y * Math.sin(2 * l) -
        2 * eccentricity * Math.sin(m) +
        4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l) -
        0.5 * y * y * Math.sin(4 * l) -
        1.25 * eccentricity * eccentricity * Math.sin(2 * m))) /
    DEG;

  // Solar noon is where apparent solar time reads 12:00, and apparent time is
  // the clock plus the equation of time plus four minutes per degree east.
  const minutes = ((julian + 0.5) % 1) * 1440;
  const subsolarLon = ((((720 - minutes - equationOfTime) / 4 + 180) % 360) + 360) % 360 - 180;

  out.declination = declination;
  out.subsolarLon = subsolarLon;
  out.equationOfTime = equationOfTime;
  return out;
}

/** The surface normal at a subsolar point already found; see `sunDirection`. */
function directionOf(solar: Solar, target: THREE.Vector3): THREE.Vector3 {
  return unitAt(solar.declination, solar.subsolarLon, target);
}
const solarScratch: Solar = { declination: 0, subsolarLon: 0, equationOfTime: 0 };

/**
 * The sun's direction: the surface normal at the subsolar point.
 *
 * Same convention as `onSphere` in `globe.ts` and `toLatLon` in `geo.ts`. If
 * this ever disagrees with them the sun rises in the west, which is the kind of
 * thing that looks fine in a screenshot.
 */
export function sunDirection(date: Date, target: THREE.Vector3): THREE.Vector3 {
  return directionOf(solarPosition(date, solarScratch), target);
}

/** Degrees of the sun above the horizon for someone standing at `up`. */
function sunElevation(sun: THREE.Vector3, up: THREE.Vector3): number {
  return Math.asin(THREE.MathUtils.clamp(sun.dot(up), -1, 1)) / DEG;
}

/**
 * Elevations the three moods are keyed at.
 *
 * -12 is nautical twilight, where the last of the glow leaves the sky, and +10
 * is roughly where the light stops being golden. Between them everything is a
 * blend, which is what keeps dawn from arriving as a switch. The whole sweep
 * takes about ninety minutes at this latitude — thousands of frames, so nothing
 * can pop.
 */
const NIGHT_ELEVATION = -12;
const DAY_ELEVATION = 10;

/**
 * The twilight ladder: the faintest star the eye finds overhead, as a visual
 * magnitude, against the sun's elevation in degrees.
 *
 * **This is what makes a dusk bring the stars out brightest first**, and it
 * is the one thing the old sky could not do: its hashed dots came up at a
 * quarter strength all at once as the sun set. The catalogue is sorted by
 * magnitude (`pack.ts`), so the stars drawn are a prefix of it — everything
 * brighter than this number — and at the knots below the evening goes the
 * way an almanac says it goes: Venus a few minutes after sunset, Jupiter and
 * Sirius by -3, the first-magnitude stars as civil twilight ends at -6, the
 * constellations by nautical dusk at -12 and the full sky, 6.4, by
 * astronomical dusk at -18. The numbers are the naked-eye limits of the
 * twilight literature (Schaefer's) rounded to what a player can tell apart;
 * they carry on past `NIGHT_ELEVATION`, where the colours stop changing,
 * because the stars really do.
 *
 * It is the limit for a clear sky at the zenith. `update` takes the weather,
 * the moon and the altitude off it (`SkyState.limit`), and `night-sky.ts`
 * adds each star's own airmass and glare.
 */
const TWILIGHT_LADDER: readonly (readonly [number, number])[] = [
  [4, -6],
  [0, -4],
  [-2, -2.2],
  [-4, -0.3],
  [-6, 1.5],
  [-8, 3],
  [-10, 4.3],
  [-12, 5.3],
  [-14, 5.9],
  [-16, 6.2],
  [-18, 6.4],
];

/** `TWILIGHT_LADDER` read at an elevation: straight between the knots, flat past the ends. */
export function twilightLimit(elevation: number): number {
  const first = TWILIGHT_LADDER[0]!;
  if (elevation >= first[0]) return first[1];
  for (let i = 1; i < TWILIGHT_LADDER.length; i++) {
    const [e1, m1] = TWILIGHT_LADDER[i]!;
    if (elevation >= e1) {
      const [e0, m0] = TWILIGHT_LADDER[i - 1]!;
      return m0 + ((m1 - m0) * (elevation - e0)) / (e1 - e0);
    }
  }
  return TWILIGHT_LADDER[TWILIGHT_LADDER.length - 1]![1];
}

/**
 * What the lantern moon costs the stars when it is up: magnitudes off the
 * limit, and the share of the Milky Way it washes out.
 *
 * A real full moon takes a dark site from 6.5 to about 5 and the Milky Way
 * with it, and this moon is full every night — so a physical one would never
 * once show the sky this file now draws. It is **half** of that on purpose:
 * enough that the sky before moonrise and after moonset is visibly deeper
 * than under it, which is a real thing to notice on a real planet, and not so
 * much that the lantern — which is a decision about the light, see
 * `MOON_OFFSET` — becomes a decision about the stars as well.
 */
const MOON_LIMIT = 0.7;
const MOON_WASH = 0.4;

/**
 * Magnitudes the weather takes off: a closed overcast all of them — the
 * stars go behind a storm's grey dome, which they used to shine through —
 * and a fog three.
 */
const OVERCAST_LIMIT = 7;
const MIST_LIMIT = 3;

/** The limit above the air, where nothing is in the way but the sun. */
const SPACE_LIMIT = 6.5;

/**
 * The Milky Way is a faint thing, and it comes after the stars: none while
 * the limit is under 4.6, all of it once it passes 6.2 — so it rises out of
 * a sky already full of stars, deep in astronomical twilight, and goes first
 * when the weather or the moon comes.
 */
const MILKY_WAY_LIMITS: readonly [number, number] = [4.6, 6.2];

/**
 * A moon that is a lantern hung opposite the sun, not an ephemeris.
 *
 * The real moon is somewhere else, is often new, and is often below the horizon
 * — which would buy a correctness nobody can check and hand back nights with no
 * light in them, on a planet whose entire look is a light stepping across a
 * ramp. This one is always full, always up at local midnight, and offset west
 * of the anti-solar point so it cross-lights the ground instead of flatly
 * mirroring the sun.
 */
const MOON_OFFSET = 22 * DEG;
const NORTH = new THREE.Vector3(0, 1, 0);

/**
 * The sun's shadow map, and the box it covers.
 *
 * A planet cannot have one shadow map: 2048 texels over 32,000 units is a texel
 * every 15.6 units, seven people. So the map covers a box that **follows the
 * player** — `SHADOW_REACH` either side of where you stand, 45 people — and
 * inside it a texel is `2 * 170 / 2048 = 0.166` units across the sun's bearing,
 * which is 23 texels up a 3.77-unit body. It was 300 either side while a person
 * was 6.8 units, the same 23 texels; the box came down with the body
 * (2026-09-24: 100 while a person was 2.22, then 170 at 3.77), and so did the
 * bias pair below, which scales with the texel. That is the reference's own ratio (a
 * 2048 map over ±24 on a planet of radius 14 is 26 texels a character), and it
 * is what keeps a hat's brim and a leg apart in the shadow at the distance the
 * camera actually sits. Along the bearing a texel stretches by
 * `1 / sin(elevation)`: 0.33 units at 30 degrees, 1.2 at 8, which is the
 * arithmetic behind the fade below.
 *
 * Moving a directional light along its own direction changes nothing in the
 * shading — three reads it as `normalize(position - target)` — so the light is
 * put at `focus + direction * SHADOW_DISTANCE` with its target *on* the focus
 * and the shadow camera comes along for free. The focus is **snapped to whole
 * texels** in the shadow camera's own frame first, because a box that slides
 * with the player re-rasterises every edge in it each step and every shadow
 * shimmers. The frame is rebuilt here exactly as `Matrix4.lookAt` builds it —
 * right is `up x direction` with `up` the camera's default world Y — so the
 * rounding happens in the basis three will actually render with. And the
 * lattice it rounds to has to hold still itself, which one built on the live
 * sun does not: see `SHADOW_STEP`.
 *
 * `SHADOW_DEPTH` is derived, not chosen. The land never casts (see `globe.ts`:
 * a shadow pass over it is a second draw of the whole planet), so the map only
 * ever holds what *stands* on the ground, and what it has to reach along the
 * light is the ground inside the box — `SHADOW_REACH / tan(elevation)` at the
 * elevation the fade completes at — plus `SHADOW_RELIEF` of hill either side of
 * the focus, since peaks reach 620 units and the focus can be on one. Below the
 * fade's floor the ends of that footprint fall out of the range, and what is
 * lost there is a faint shadow at the far edge of a box you cannot see the end
 * of. The depth texture is 24-bit, so the range costs nothing in precision.
 *
 * The bias pair is in world units here and converted once, because three's
 * `bias` is a fraction of the depth range and a number that changes meaning
 * with `SHADOW_DEPTH` is exactly the kind this project keeps mis-stating.
 */
const SHADOW_MAP_SIZE = 2048;
const SHADOW_REACH = 170;
const SHADOW_RELIEF = 700;
/**
 * Degrees of sun elevation the shadow fades over: none from a sun on the
 * horizon, whose shadows are texels stretched to 2 units and a kilometre long,
 * full by the time the mood is fully day (`DAY_ELEVATION` is 10). Halfway at 8.
 */
const SHADOW_SUN_FADE: readonly [number, number] = [4, 12];
/**
 * Units of eye height above the ground under the player the shadow fades over.
 *
 * The box is 340 units across (600 until 2026-09-24) and its edge is a line
 * where the shadows stop. Standing on the ground you cannot see it — the
 * ground at the box's edge is seen at a few degrees of grazing and a shadow
 * there is a pixel or two tall — and from the plane's circuit you can: at 320
 * units up the camera looks down at the far edge of the box at about sixty
 * degrees (fifty while the box was 300 either side), and every tree's shadow ends on
 * the same moving line. So the fade is keyed to the plane: full on foot (the
 * camera is 15 up) and in the boat (20), and gone by the circuit altitude,
 * where the camera sits 18 above a plane 320 above the ground. Measured
 * against the ground under the *player* rather than sea level, so that a
 * mountain top keeps its shadows.
 */
const SHADOW_EYE_FADE: readonly [number, number] = [60, 240];
const SHADOW_DEPTH = SHADOW_REACH / Math.tan(SHADOW_SUN_FADE[1] * DEG) + SHADOW_RELIEF;
const SHADOW_DISTANCE = 2 * SHADOW_DEPTH;
const SHADOW_TEXEL = (2 * SHADOW_REACH) / SHADOW_MAP_SIZE;
/**
 * How far from the player a caster can stand and still be in the box: its
 * corner, plus a bus's length for what stands astride the edge. `main.ts`
 * redraws the map every frame while something that moves is inside this, and
 * on the slow cadence otherwise — a car 600 units off is not in the map at all.
 */
export const SHADOW_COVER = SHADOW_REACH * Math.SQRT2 + 20;
/**
 * Degrees the sun moves before the shadow light follows it.
 *
 * Snapping the box to whole texels keeps the shadows still while the player
 * walks only if the texel lattice holds still itself, and one built on the
 * live sun does not. Its axes turn with the sun, 15 degrees an hour, and with
 * the snap measured from the planet's centre 16,000 units away that turn slid
 * the lattice across the ground at up to `16,000 * 7.27e-5 * cos(lat)`, 1.16
 * cos(lat) units a second: four texels. Every redraw — 45 or 180 ms apart, see
 * `main.ts` — then rasterised each edge at a new sub-texel phase, and the
 * small shadows on a roof, a chimney's or a parapet's or a ridge cap's,
 * crawled by a texel at the redraw rate, standing still or not.
 *
 * Two things stop it and it takes both. The light's direction is the sun's as
 * of the last whole step, so between steps the axes do not turn; and the
 * lattice is pinned to the last focus instead of to the centre (`pin` in
 * `createSky`), so when a step does turn it, it turns about the player. At
 * 0.03 degrees a step is 7.2 seconds of sun, and it moves the lattice under a
 * shadow 60 units away by at most 0.03 units, a tenth of a texel. Measured
 * headless through three's own `shadow.matrix` at Palma, 2026-09-13, standing
 * a minute at the 180 ms cadence: a point 40 units off changed sub-texel phase
 * on all 333 redraws, by up to 0.46 of a texel, and now changes on the 8 that
 * follow a step, by up to 0.034.
 */
const SHADOW_STEP = 0.03;
/** `SHADOW_STEP` as clock time: the sun's hour angle runs 360 degrees a day. */
const SHADOW_STEP_MS = (SHADOW_STEP / 360) * 86_400_000;
/**
 * How dark a cast shadow is, as the fraction of the sun's term it removes.
 *
 * `MeshToonMaterial` multiplies the *whole* directional term by the shadow, ramp
 * floor included, so a shadowed surface keeps `1 - intensity` of its sunlight
 * plus every bit of the ambient and hemisphere fill — which is why a cast
 * shadow can go darker than the ramp's own shadow band without going to the
 * neutral black that reads as mud. Measured at Palma, 2026-09-05, sun at 47
 * degrees, sRGB luminance of the same paving: in the sun 226, in the ramp's
 * shadow band 154, in a cast shadow 134 at 0.65.
 */
const SHADOW_INTENSITY = 0.65;
/** Units the receiving surface is pushed along its normal before the test. */
const SHADOW_NORMAL_BIAS = 0.34;
/** Units of depth the receiver is pulled towards the light. Negative is towards. */
const SHADOW_BIAS = -0.145;
/**
 * Texels of blur across the shadow's edge. **One, not four.** r182's PCF path
 * samples a hardware `sampler2DShadow` (bilinear comparison already, so the
 * edge is soft at 1) on a 3x3 grid spread `radius` texels apart, and at 4 the
 * taps straddle the shadow instead of sampling it: measured at Palma,
 * 2026-09-05, sun at 20 degrees, the same tower's shadow on the same paving was
 * a hard-edged shape at 1, a faint band at 2 and, at 4, a wash the eye read as
 * "no shadows at all" — a whole afternoon of hunting for a light that was fine.
 * The reference this was copied from is on an older three with a software PCF.
 */
const SHADOW_RADIUS = 1;

/**
 * How far out the two discs hang, and it is not a taste.
 *
 * The moon used to sit at two radii from the *camera*, which is fine standing
 * on the ground and wrong from the plane's ceiling: up there the camera is 2.45
 * radii from the centre, so the far limb of the planet is 35,800 units away and
 * a moon at 32,000 in that bearing is drawn **in front of the Earth**, pasted
 * on its rim. The bound is the furthest point of the planet from the furthest
 * the camera goes — 39,200 + 16,000 — so anything past 55,200 is always behind
 * the world and the depth buffer sorts the rest. Five radii, comfortably inside
 * the camera's 160,000 far plane and inside the dome's own six.
 */
export const SKY_DISTANCE = PLANET_RADIUS * 5;

/**
 * Angular radius of both discs, and they get the same one on purpose.
 *
 * The real sun and the real moon subtend almost exactly the same half a degree
 * — which is why an eclipse is a ring and not a smudge — and that equality is
 * the fact worth keeping. What is not kept is the absolute size: half a degree
 * on a 55 degree lens is a 13-pixel speck, smaller than some of the stars the
 * dome hashes out, and from the plane it would be nothing at all. So both are
 * drawn at 1.1 degrees, which is the exaggeration the moon already had and is
 * the same crop every monument in this project makes. Matched, not corrected.
 */
const DISC_ANGLE = 1.1 * DEG;
const DISC_RADIUS = SKY_DISTANCE * Math.tan(DISC_ANGLE);

/**
 * The maria, as three flat circles floating a thousandth of a radius off the
 * moon's own face.
 *
 * Without them the moon is a cream dot, and a cream dot at this size is a star
 * that got fat rather than a moon. They are the cheapest way to say which body
 * this is, and they are drawn the way everything else here is drawn — flat
 * fill, ink round the edge. Floating rather than inlaid because two coplanar
 * meshes get no ink between them; a circle standing off a curved surface gets
 * its own line the whole way round.
 */
const MARIA: readonly (readonly [number, number, number])[] = [
  [-0.30, 0.26, 0.27],
  [0.24, 0.34, 0.19],
  [0.14, -0.32, 0.24],
];

const skyVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
  }
`;

/**
 * How much light the Milky Way adds at its brightest, in the dome's linear
 * units, before `milky`: the Sagittarius cloud on a moonless night comes to
 * about two and a half of this. Tuned against the night dome's own zenith,
 * `NIGHT_MOOD.skyTop`, which is 0.008 of luminance: the band has to read
 * against it without ever turning the night blue grey.
 */
const MILKY_WAY_BRIGHTNESS = 0.018;

/**
 * A galactic direction as a GLSL constant, in `GALACTIC`'s layout — `(cos b
 * cos l, cos b sin l, sin b)`. `unitAt` lays a direction out the way the
 * world lays out a globe, so `y` and `z` trade places on the way in; the
 * shader cannot import, and this keeps the one conversion in `sphere.ts`.
 */
function galacticAt(l: number, b: number): string {
  const v = unitAt(b, l, { x: 0, y: 0, z: 0 });
  return `vec3(${v.x.toFixed(5)}, ${(-v.z).toFixed(5)}, ${v.y.toFixed(5)})`;
}

/**
 * The Milky Way, painted.
 *
 * **Shapes, not a photograph**, for the reason the rest of this world is not
 * one: a band, a bulge, the dust lanes and the clouds, each a soft analytic
 * shape in galactic coordinates, with two octaves of noise over the sphere to
 * break the band into clouds the way a brush would. A baked texture was the
 * alternative and it was not taken: megabytes for a glow that is two
 * gradients and a dozen places, and a photograph's grain on a sky that has
 * none anywhere else. Each place is where it is on the real sky, and the list
 * is the one an observer names: the bulge toward Sagittarius and its star
 * clouds, the Great Rift splitting the band from Cygnus to Scorpius, the
 * Coalsack beside the Southern Cross, the star clouds of Scutum, Cygnus and
 * Carina, and the two Magellanic Clouds, with Andromeda as the faint smudge it
 * is. The noise is taken on the galactic direction itself rather than on
 * `(l, b)`, so it has no seam.
 *
 * Warm toward the centre and cool along the arms — which is the colour the
 * bulge's old stars really give it against the arms' young ones — and written
 * straight out as linear, like everything else here: see the note at the end
 * of the dome. How bright is `milky`, set by `update`: 0 by day and in the
 * weather, and see `MILKY_WAY_LIMITS` and `MOON_WASH` for the rest.
 */
const MILKY_WAY_GLSL = /* glsl */ `
  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  // A soft round cloud, size in degrees, about a galactic direction.
  float cloud(vec3 g, vec3 at, float size) {
    return exp(-(1.0 - dot(g, at)) / (size * size * 3.0462e-4));
  }

  vec3 milkyWay(vec3 g) {
    float b = asin(clamp(g.z, -1.0, 1.0)) * 57.29578;
    float l = atan(g.y, g.x) * 57.29578;
    float toward = 0.5 + 0.5 * g.x / max(length(g.xy), 1e-4);
    float n = valueNoise(g * 7.0) * 0.6 + valueNoise(g * 19.0) * 0.4;

    float width = mix(4.0, 7.0, toward * toward) * (0.8 + 0.4 * n);
    float band = exp(-0.5 * b * b / (width * width)) * mix(0.36, 1.0, toward * sqrt(toward));
    float skirt = exp(-0.5 * b * b / (width * width * 7.0)) * mix(0.1, 0.3, toward);
    float bulge = exp(-0.5 * ((l * l) / 200.0 + (b + 2.0) * (b + 2.0) / 81.0));
    float clouds = 0.9 * cloud(g, ${galacticAt(1.5, -4)}, 3.2)
      + 0.5 * cloud(g, ${galacticAt(12, -1)}, 1.2)
      + 0.55 * cloud(g, ${galacticAt(27, -2.5)}, 2.0)
      + 0.5 * cloud(g, ${galacticAt(77, 1.5)}, 4.5)
      + 0.5 * cloud(g, ${galacticAt(287, -1)}, 3.0)
      + 0.3 * cloud(g, ${galacticAt(330, -2)}, 2.5);
    float light = band * (0.45 + 0.55 * n) * (1.0 + clouds) + skirt + 1.2 * bulge * (0.7 + 0.3 * n);

    // The dust. The Great Rift runs a few degrees north of the plane from
    // Cygnus to Ophiuchus; the Coalsack sits below the Cross.
    float riftAt = mix(1.2, 4.5, smoothstep(60.0, 5.0, l)) + (n - 0.5) * 2.2;
    float rift = exp(-0.5 * (b - riftAt) * (b - riftAt) / 2.6) * smoothstep(-14.0, 0.0, l) * smoothstep(88.0, 72.0, l);
    float dust = max(0.8 * rift, 0.85 * cloud(g, ${galacticAt(301, -1)}, 2.3));
    light *= 1.0 - dust;

    vec3 tint = mix(vec3(0.66, 0.7, 1.0), vec3(1.0, 0.86, 0.7), clamp(toward * toward * 0.7 + bulge * 0.6, 0.0, 1.0));
    float neighbours = 0.8 * cloud(g, ${galacticAt(280.5, -32.9)}, 2.8)
      + 0.55 * cloud(g, ${galacticAt(302.8, -44.3)}, 1.5)
      + 0.2 * cloud(g, ${galacticAt(121.2, -21.6)}, 0.8);
    return tint * light + vec3(0.86, 0.86, 1.0) * neighbours * (0.8 + 0.4 * n);
  }
`;

/**
 * The dome.
 *
 * Three changes from the gradient this replaced. It runs from the *local*
 * horizon to the local zenith — `dot(dir, up)`, not world Y, which only agreed
 * with the horizon while you stood near the north pole. It carries a warm flare
 * around the sun's own bearing and a cool band away from it, which is what makes
 * a dawn a direction rather than an overall tint. And it fades to space with
 * altitude, which is the one thing the plane's ceiling needed: a cream horizon
 * band painted behind the globe washes out the very terminator you climbed up
 * there to look at.
 *
 * **The stars are not here any more.** They were hashed out of the view
 * direction until 2026-09-30 — no buffers, no points to sort, nothing for the
 * outline pass to hull — and each of those reasons had an answer: one static
 * buffer of 8,404 directions, additive light that needs no sorting, and the
 * outline pass's own opt-out. What the hash could not do was be the sky: the
 * same dots stood at the same altitude and azimuth every night of the year,
 * fixed to the ground, and the time-lapse turned the sun and the moon past
 * them. They are the Bright Star Catalogue now, drawn as points by
 * `night-sky.ts` just after this dome. What stays in the dome is the glow
 * that is not points: the Milky Way (`MILKY_WAY_GLSL`).
 */
const skyFragment = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 glowColor;
  uniform vec3 sunDir;
  uniform vec3 moonDir;
  uniform vec3 upDir;
  uniform float glow;
  uniform float milky;
  uniform mat3 galactic;
  uniform float space;
  uniform float dip;
  varying vec3 vWorld;

  const vec3 SPACE = vec3(0.016, 0.024, 0.055);
  const float MILKY_WAY = ${MILKY_WAY_BRIGHTNESS.toFixed(4)};

  float hash(vec3 cell) {
    vec3 p = fract(cell * 0.1031 + vec3(0.71, 0.113, 0.419));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  ${MILKY_WAY_GLSL}

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float h = dot(dir, upDir);
    // Height above the horizon you can actually see, which at altitude is the
    // limb and not the level plane through your feet. Measuring from zero
    // instead painted the whole lower sky the horizon colour from the air: at
    // dawn, a brown wash over half the frame.
    float above = clamp((h - dip) / (1.0 - dip), 0.0, 1.0);

    // The horizon band is warm only on the sun's side of the compass. A dusk
    // that is apricot all the way round is not a dusk, it is a filter: half the
    // sky at sunrise is the cold one you have just come out of.
    float sunward = smoothstep(-0.4, 0.7, dot(dir, sunDir));
    vec3 low = mix(mix(horizon, top, 0.7), horizon, sunward);
    vec3 color = mix(low, top, pow(above, 0.7));

    // Warm the sun's own bearing, and mostly near the horizon: at dusk the glow
    // is a direction you can walk towards, not a wash over everything.
    float toward = max(dot(dir, sunDir), 0.0);
    float band = 1.0 - smoothstep(0.0, 0.4, abs(h));
    color = mix(color, glowColor, glow * (0.25 + 0.75 * band) * (0.5 * pow(toward, 4.0) + 0.5 * pow(toward, 26.0)));

    // A small solar aureole in the existing sky pass. No bloom target or blur.
    float aureole = smoothstep(0.985, 1.0, toward);
    color = mix(color, glowColor, aureole * aureole * (0.16 + 0.22 * glow));

    // Everything below the dip is planet, so the sky at altitude starts at the
    // limb. Holding the horizon colour in a band just above it leaves an
    // atmosphere around the globe instead of a hard cut into black.
    //
    // Its width is an angle, not a step in the cosine: 0.06 of the cosine is 3.4
    // degrees at the horizon and 26 at the limb seen from the ceiling, which
    // drowned the whole frame in dawn.
    float halo = 1.0 - smoothstep(dip, dip + 0.06 * sqrt(1.0 - dip * dip), h);
    color = mix(color, SPACE, space * (1.0 - 0.8 * halo));

    // The Milky Way comes with the dark or with the altitude, whichever
    // arrives first. The air thins it toward the horizon and the moon near
    // its own bearing; above the air neither does.
    if (milky > 0.0) {
      float air = 1.0 - space;
      float thin = mix(1.0, smoothstep(0.0, 0.35, above), air);
      float moonlit = 1.0 - 0.6 * air * smoothstep(0.82, 0.995, dot(dir, moonDir));
      color += milkyWay(galactic * dir) * (MILKY_WAY * milky * thin * moonlit);
    }

    // Written straight out, with no colour-space conversion, and that is the look
    // rather than an oversight. The uniforms arrive linear, so what the screen
    // shows is darker and more saturated than the hex in \`theme.ts\` — and every
    // sky this project was tuned against was drawn this way. Converting was tried
    // on 2026-09-10 and reverted on 2026-09-13: the dome went to the palette's
    // own pale cyan, and the cream clouds and the buildings lost the ground they
    // were read against.
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** What the world is being lit by this frame. On `atlas.sky` for poking at. */
export interface SkyState {
  /** UTC instant the sky is drawn for. */
  time: Date;
  /** Degrees above the player's horizon. Negative is night. */
  elevation: number;
  /** 0 full night, 1 full day. */
  daylight: number;
  /**
   * 0 in the air, 1 out of it: the fade the dome takes to space as the camera
   * climbs, none over the plane's circuit and all of it a third of a radius
   * up. The light shafts go out on it (`shafts.ts`).
   */
  space: number;
  /**
   * Unit vector towards the sun, in world space. Live: the same object every
   * frame.
   *
   * Published because `elevation` above is the sun's height **where the player
   * stands**, and anything that lights itself has to ask that question at its
   * own position instead — a town on the day side and a town on the night side
   * are in the same frame from the air. `src/lights.ts` takes this and computes
   * the terminator per vertex. See the note there.
   */
  sun: THREE.Vector3;
  solar: Solar;
  /**
   * How much of the sun's cast shadow is on, 0 to 1: the product of the two
   * fades on `SHADOW_INTENSITY`. `main.ts` reads it to skip the shadow pass
   * when there is nothing to draw into it.
   */
  shadow: number;
  /** Unit vector towards the lantern moon (`MOON_OFFSET`), world space. Live. */
  moon: THREE.Vector3;
  /**
   * The J2000 sky in tonight's world: `celestial.ts`'s `equatorialBasis` at
   * `time`, rebuilt every frame. Live. A catalogue direction times this is
   * where that star stands now; `night-sky.ts` carries it as its matrix.
   */
  celestial: THREE.Matrix4;
  /**
   * The faintest star the eye finds at the zenith, as a visual magnitude:
   * the twilight ladder (`twilightLimit`) at `elevation`, less the weather and
   * the lantern moon, going to `SPACE_LIMIT` with the altitude. Below -4 by
   * day, so the sky draws nothing; 6.4 on a clear moonless night.
   */
  limit: number;
}

/**
 * Something drawn in the sky's own frame and on its clock, which `update`
 * hands the finished state to at the end of every frame — so the world's
 * loop, the menu's and the menu's review sheet all drive it without knowing
 * it exists. `night-sky.ts` is the one there is.
 */
export type SkyLayer = (state: SkyState) => void;

/**
 * The dome's uniforms that a layer shares **by reference**, so a star and the
 * sky behind it never disagree about which way is up, where the limb is or
 * how much air is left: the same objects, written once a frame by `update`.
 */
export interface SkyUniforms {
  upDir: { value: THREE.Vector3 };
  dip: { value: number };
  space: { value: number };
  sunDir: { value: THREE.Vector3 };
  moonDir: { value: THREE.Vector3 };
}

export interface Sky {
  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  /**
   * Call once a frame, after the player and the camera have moved.
   *
   * `eyeHeight` is how far the camera is above the ground *under the player*,
   * in units; it fades the cast shadows out on the way up (`SHADOW_EYE_FADE`).
   * The menu passes its camera's altitude, which is 1.47 radii and fades them
   * to nothing.
   */
  update(playerPosition: THREE.Vector3, cameraPosition: THREE.Vector3, eyeHeight: number): void;
  /**
   * Put the sun light where the shadow map wants it: on the player, snapped to
   * the map's own texels, `SHADOW_DISTANCE` up the solar direction as of the
   * last `SHADOW_STEP`.
   *
   * **Call it in the frame the shadow map is redrawn, and only then.** The map
   * is drawn from the light's position at that moment and the shading looks the
   * map up through the matrix of that same moment; a light that moves between
   * two redraws — even the 0.3 units a second the real sun gives it — hands the
   * shader a matrix the map was not drawn for. Measured 2026-09-05 at Palma,
   * sun at 47 degrees: re-placed every frame there was no cast shadow on the
   * screen at all; pinned between redraws, every building, lamp and person had
   * one. `update` therefore leaves the light alone while `state.shadow` is on
   * and `main.ts` calls this beside `shadowMap.needsUpdate`. While the shadow is
   * off (night, the air) `update` moves the light itself, since nothing is
   * looked up through it and the terminator still has to track the sun.
   */
  placeShadow(): void;
  state: SkyState;
  /** The blend of the three moods currently on screen. Read-only in practice. */
  mood: Mood;
  /**
   * Debug clock. `setTime('2026-09-04T05:20:00Z')` freezes the world at that
   * instant and keeps it running from there; `setTime(null)` goes back to the
   * real one. `setRate(600)` runs ten minutes a second, which is how you watch
   * a dawn without waiting for one.
   *
   * **A time that is not a time is refused, and the clock keeps the one it
   * had.** `?time=bad` used to reach the anchor as `NaN`: the sky drew an
   * `Invalid Date` at an elevation of `NaN`, the traffic and the clouds were
   * handed the same `NaN`, and the chip's `Intl.DateTimeFormat` threw a
   * `RangeError` every frame. `setTime` returns whether it took the time, so a
   * caller that tracks "the clock is live" can leave it live; `setRate`
   * ignores a rate that is not finite for the same reason.
   */
  setTime(when: Date | string | number | null): boolean;
  setRate(rate: number): void;
  /**
   * What the weather does to the light, written by `weather-view.ts` and
   * applied on top of the mood each `update` — a multiplier over whatever the
   * moods say, so a storm at night is the night's own dark, darker.
   *
   * `overcast` 0 to 1 takes the sun off the ground (and its shadow with it)
   * and greys the sky and the haze; `flash` 0 to 1 is lightning, a blink of
   * cold light over everything; `mist` 0 to 1 pales the haze toward the
   * colour of fog. All three fade out of the sky as the camera climbs, which
   * is the weather's own business, not this file's.
   */
  weather: { overcast: number; flash: number; mist: number };
  /** See `SkyUniforms`. */
  uniforms: SkyUniforms;
  /** Adds a `SkyLayer`, called at the end of every `update` from then on. */
  attach(layer: SkyLayer): void;
}

/** The grey a clouded sky goes, as a fraction of the mood's own brightness. */
const OVERCAST_GREY = new THREE.Color(0.52, 0.54, 0.58);
/** Lightning's colour, on the sky and the fill light. */
const FLASH_COLOR = new THREE.Color(0.86, 0.87, 1);
/** Fog's colour by day, before the mood's brightness. */
const MIST_COLOR = new THREE.Color(0.8, 0.81, 0.83);

/**
 * Builds the sky dome, the sun, the moon and the fill light, and drives all of
 * them from the clock. The scene owns them; nothing else has to know the time.
 */
export function createSky(scene: THREE.Scene, fog: THREE.Fog): Sky {
  const uniforms = {
    top: { value: new THREE.Color(DAY_MOOD.skyTop) },
    horizon: { value: new THREE.Color(DAY_MOOD.skyHorizon) },
    glowColor: { value: new THREE.Color(DAY_MOOD.skyGlow) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
    upDir: { value: new THREE.Vector3(0, 1, 0) },
    glow: { value: 0 },
    milky: { value: 0 },
    galactic: { value: new THREE.Matrix3() },
    space: { value: 0 },
    dip: { value: 0 },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
  });
  skyMaterial.userData.outlineParameters = { visible: false };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS * 6, 32, 16), skyMaterial);
  // Opaque geometry fills depth first: shade only the sky that remains visible.
  // The vertex shader pins depth to the far plane, including behind both discs.
  dome.renderOrder = 1000;
  dome.name = 'sky';
  scene.add(dome);

  // Deliberately little ambient: with flat light the `gradientMap` has no range
  // to step across and the cel shading vanishes. The step needs shadow.
  const ambient = new THREE.AmbientLight(DAY_MOOD.ambient, DAY_MOOD.ambientIntensity);
  const hemisphere = new THREE.HemisphereLight(
    DAY_MOOD.hemisphereSky,
    DAY_MOOD.hemisphereGround,
    DAY_MOOD.hemisphereIntensity,
  );
  // A `HemisphereLight` takes its up axis from its own position, and the
  // default is world Y — the north pole. Sky light therefore arrived sideways
  // everywhere except the Arctic. Pointing it at the local up is one line and
  // makes true the thing half the monument files already assume.
  hemisphere.position.set(0, 1, 0);

  // Colour and intensity come from the mood; see `Mood.sun` for why a fixed star
  // is allowed to dim. The *direction* is the part that is never anything but
  // real.
  const sun = new THREE.DirectionalLight(DAY_MOOD.sun, DAY_MOOD.sunIntensity);
  const moon = new THREE.DirectionalLight(DAY_MOOD.moon, 0);
  scene.add(ambient, hemisphere, sun, sun.target, moon, moon.target);

  // The sun casts and the moon does not: one shadow pass, one map. `castShadow`
  // stays true whatever the fade says, because toggling it changes the light
  // count every toon material was compiled against and recompiles the world;
  // a faded shadow is `intensity = 0`, which the shader mixes away.
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.radius = SHADOW_RADIUS;
  sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
  // Three's bias is a fraction of the depth range: units over the range.
  sun.shadow.bias = SHADOW_BIAS / (2 * SHADOW_DEPTH);
  sun.shadow.intensity = 0;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -SHADOW_REACH;
  shadowCamera.right = SHADOW_REACH;
  shadowCamera.bottom = -SHADOW_REACH;
  shadowCamera.top = SHADOW_REACH;
  shadowCamera.near = SHADOW_DISTANCE - SHADOW_DEPTH;
  shadowCamera.far = SHADOW_DISTANCE + SHADOW_DEPTH;
  shadowCamera.updateProjectionMatrix();

  // No fade in or out on either of them: they set behind the planet at your
  // dawn like anything else in the sky, because they are genuinely out there
  // and the depth buffer knows it.
  const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f0e4, fog: false });
  const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(DISC_RADIUS, 20, 14), moonMaterial);
  moonDisc.name = 'moon';
  const mareMaterial = new THREE.MeshBasicMaterial({ color: 0xc9c4bd, fog: false });
  for (const [x, y, radius] of MARIA) {
    const mare = new THREE.Mesh(new THREE.CircleGeometry(DISC_RADIUS * radius, 14), mareMaterial);
    mare.position.set(DISC_RADIUS * x, DISC_RADIUS * y, DISC_RADIUS * 1.002);
    moonDisc.add(mare);
  }
  scene.add(moonDisc);

  // The sun had no disc at all, which left the one object in the sky that
  // everything else is lit by as the only thing you could not look at.
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6e2, fog: false });
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(DISC_RADIUS, 20, 14), sunMaterial);
  sunDisc.name = 'sun';
  scene.add(sunDisc);

  const solarDirection = new THREE.Vector3(0, 1, 0);
  const moonDirection = new THREE.Vector3(0, -1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const cameraUp = new THREE.Vector3(0, 1, 0);
  const mix = new THREE.Color();
  const other = new THREE.Color();
  const weather = { overcast: 0, flash: 0, mist: 0 };
  const greyed = new THREE.Color();
  // The shadow camera's frame and the snapped focus. Scratch: nothing allocates.
  const shadowRight = new THREE.Vector3();
  const shadowUp = new THREE.Vector3();
  const focus = new THREE.Vector3();
  /** Where the player stood at the last `update`; what `placeShadow` centres on. */
  const shadowFocus = new THREE.Vector3();
  /** The sun as of the last whole `SHADOW_STEP`, which is where the light points. */
  const lightDirection = new THREE.Vector3(0, 1, 0);
  let lightStep = Number.NaN;
  const stepTime = new Date(0);
  /**
   * A point of the texel lattice, which the next placement snaps against. It is
   * the last focus, so moving it there every time moves the lattice not at all
   * — until the light's direction steps, and then the lattice turns about the
   * player instead of about the centre of the planet. See `SHADOW_STEP`.
   */
  const pin = new THREE.Vector3();
  let pinned = false;

  function placeShadow(): void {
    // The shadow box, on the player and snapped to its own texels — see the
    // notes on `SHADOW_REACH` and `SHADOW_STEP`. The light sits
    // `SHADOW_DISTANCE` up its own direction from there.
    shadowRight.crossVectors(NORTH, lightDirection).normalize();
    shadowUp.crossVectors(lightDirection, shadowRight);
    if (!pinned) {
      pin.copy(shadowFocus);
      pinned = true;
    }
    focus.copy(shadowFocus).sub(pin);
    const alongRight = focus.dot(shadowRight);
    const alongUp = focus.dot(shadowUp);
    focus
      .copy(shadowFocus)
      .addScaledVector(shadowRight, Math.round(alongRight / SHADOW_TEXEL) * SHADOW_TEXEL - alongRight)
      .addScaledVector(shadowUp, Math.round(alongUp / SHADOW_TEXEL) * SHADOW_TEXEL - alongUp);
    pin.copy(focus);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(lightDirection, SHADOW_DISTANCE);
  }

  const mood: Mood = { ...DAY_MOOD, rampShadowTint: [...DAY_MOOD.rampShadowTint], rampLightTint: [...DAY_MOOD.rampLightTint] };
  const state: SkyState = {
    time: new Date(),
    elevation: 90,
    daylight: 1,
    space: 0,
    sun: solarDirection,
    solar: { declination: 0, subsolarLon: 0, equationOfTime: 0 },
    shadow: 0,
    moon: moonDirection,
    celestial: new THREE.Matrix4(),
    limit: twilightLimit(90),
  };
  const layers: SkyLayer[] = [];
  /** Said once: a mirrored sky would say it every frame. */
  let warnedMirror = false;

  // The clock, as an offset and a rate rather than a stored instant, so that a
  // scrubbed time keeps running instead of freezing the world at one minute.
  let anchor = Date.now();
  let anchorReal = anchor;
  let rate = 1;
  let lastShadow = -1;
  let lastGamma = -1;

  const colorAt = (a: number, b: number, t: number): number =>
    mix.setHex(a).lerp(other.setHex(b), t).getHex();
  /** A colour taken `t` of the way to the overcast grey at its own brightness, times `dim`. */
  const greyOf = (hex: number, t: number, dim: number): number => {
    mix.setHex(hex);
    const light = (mix.r + mix.g + mix.b) / 3;
    greyed.copy(OVERCAST_GREY).multiplyScalar((light / 0.55) * dim);
    return mix.lerp(greyed, t).getHex();
  };
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  function blend(a: Mood, b: Mood, t: number): void {
    mood.skyTop = colorAt(a.skyTop, b.skyTop, t);
    mood.skyHorizon = colorAt(a.skyHorizon, b.skyHorizon, t);
    mood.skyGlow = colorAt(a.skyGlow, b.skyGlow, t);
    mood.glow = lerp(a.glow, b.glow, t);
    mood.stars = lerp(a.stars, b.stars, t);
    mood.fog = colorAt(a.fog, b.fog, t);
    mood.ambient = colorAt(a.ambient, b.ambient, t);
    mood.ambientIntensity = lerp(a.ambientIntensity, b.ambientIntensity, t);
    mood.hemisphereSky = colorAt(a.hemisphereSky, b.hemisphereSky, t);
    mood.hemisphereGround = colorAt(a.hemisphereGround, b.hemisphereGround, t);
    mood.hemisphereIntensity = lerp(a.hemisphereIntensity, b.hemisphereIntensity, t);
    mood.sun = colorAt(a.sun, b.sun, t);
    mood.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
    mood.moon = colorAt(a.moon, b.moon, t);
    mood.moonIntensity = lerp(a.moonIntensity, b.moonIntensity, t);
    mood.rampShadow = lerp(a.rampShadow, b.rampShadow, t);
    mood.rampGamma = lerp(a.rampGamma, b.rampGamma, t);
    const shadowTint = mood.rampShadowTint as [number, number, number];
    const lightTint = mood.rampLightTint as [number, number, number];
    for (let c = 0; c < 3; c++) {
      shadowTint[c] = lerp(a.rampShadowTint[c]!, b.rampShadowTint[c]!, t);
      lightTint[c] = lerp(a.rampLightTint[c]!, b.rampLightTint[c]!, t);
    }
  }

  function update(playerPosition: THREE.Vector3, cameraPosition: THREE.Vector3, eyeHeight: number): void {
    // One `Date` and one solar record, written in place: this runs every frame
    // and the position is asked once, not once for the record and again for
    // the direction. Nothing holds either past the frame.
    const time = state.time;
    time.setTime(anchor + (Date.now() - anchorReal) * rate);
    directionOf(solarPosition(time, state.solar), solarDirection);
    const step = Math.floor(time.getTime() / SHADOW_STEP_MS);
    if (step !== lightStep) {
      lightStep = step;
      stepTime.setTime(step * SHADOW_STEP_MS);
      sunDirection(stepTime, lightDirection);
    }

    // Where you stand is what decides whether it is day. The camera only gets a
    // vote on which way the horizon runs.
    up.copy(playerPosition).normalize();
    cameraUp.copy(cameraPosition).normalize();
    const elevation = sunElevation(solarDirection, up);
    state.elevation = elevation;

    if (elevation <= 0) {
      const t = THREE.MathUtils.smoothstep(elevation, NIGHT_ELEVATION, 0);
      blend(NIGHT_MOOD, TWILIGHT_MOOD, t);
      state.daylight = t * 0.5;
    } else {
      const t = THREE.MathUtils.smoothstep(elevation, 0, DAY_ELEVATION);
      blend(TWILIGHT_MOOD, DAY_MOOD, t);
      state.daylight = 0.5 + t * 0.5;
    }

    // Fades over the plane's own climb: still sky over its circuit at 320
    // units, wholly space a third of a radius up, which is well below the
    // ceiling and about where the horizon stops being a line and becomes a limb.
    const distance = cameraPosition.length();
    const orbit = THREE.MathUtils.smoothstep(
      distance - PLANET_RADIUS,
      PLANET_RADIUS * 0.04,
      PLANET_RADIUS * 0.35,
    );
    state.space = orbit;

    /**
     * From orbit the *light* goes to `ORBIT_LOOK` whatever the local hour, and
     * the sky colours do not.
     *
     * Both halves of that matter. Ambient fill and a raised ramp floor are the
     * air around you, and standing in the Sahara at noon they are correct; seen
     * from the ceiling they light the night hemisphere as flatly as the day one
     * and there is no terminator to look at, which is the whole reason for
     * climbing. The sky keeps the local colours because what is left of it up
     * there is the halo around the limb — and at dawn that halo *is* the dawn.
     *
     * **The target is its own record and not `NIGHT_MOOD`, and that was a bug
     * for as long as it was.** Every number in a mood is a *ground* number: it
     * says what somebody standing outside can see, and the moon at 0.9 (0.6 since 2026-09-25) is the
     * whole reason night down there is a second look rather than a dimmer. Aimed
     * at the ceiling the same 0.9 made the dark side 59% as bright as the lit
     * one. `theme.ts`'s `ORBIT_LOOK` carries the measurement and the reasoning.
     */
    for (const key of ORBIT_INTENSITIES) mood[key] = lerp(mood[key], ORBIT_LOOK[key], orbit);
    for (const key of ORBIT_COLORS) mood[key] = colorAt(mood[key], ORBIT_LOOK[key], orbit);
    const shadowTint = mood.rampShadowTint as [number, number, number];
    const lightTint = mood.rampLightTint as [number, number, number];
    for (let c = 0; c < 3; c++) {
      shadowTint[c] = lerp(shadowTint[c]!, ORBIT_LOOK.rampShadowTint[c]!, orbit);
      lightTint[c] = lerp(lightTint[c]!, ORBIT_LOOK.rampLightTint[c]!, orbit);
    }

    // The weather over the mood: see `Sky.weather`. On the numbers the lights
    // are about to take, so nothing it does outlives the frame.
    const overcast = weather.overcast;
    if (overcast > 0) {
      mood.sunIntensity *= 1 - 0.72 * overcast;
      mood.moonIntensity *= 1 - 0.8 * overcast;
      mood.ambientIntensity *= 1 - 0.2 * overcast;
      mood.hemisphereIntensity *= 1 - 0.3 * overcast;
      mood.skyTop = greyOf(mood.skyTop, 0.75 * overcast, 0.8);
      mood.skyHorizon = greyOf(mood.skyHorizon, 0.7 * overcast, 0.85);
      mood.fog = greyOf(mood.fog, 0.65 * overcast, 0.85);
      mood.glow *= 1 - overcast;
    }
    if (weather.mist > 0) {
      mix.setHex(mood.fog);
      const light = Math.max(mix.r, mix.g, mix.b);
      mood.fog = mix.lerp(other.copy(MIST_COLOR).multiplyScalar(Math.min(1, light * 1.25)), 0.6 * weather.mist).getHex();
    }
    if (weather.flash > 0) {
      const f = weather.flash;
      // A blink of fill, not a white-out: through the tone map and the bloom
      // the old 2.4 took every surface on the screen past white.
      mood.ambientIntensity += 0.9 * f;
      mood.ambient = colorAt(mood.ambient, FLASH_COLOR.getHex(), f);
      mood.skyTop = colorAt(mood.skyTop, FLASH_COLOR.getHex(), 0.55 * f);
      mood.skyHorizon = colorAt(mood.skyHorizon, FLASH_COLOR.getHex(), 0.65 * f);
      mood.fog = colorAt(mood.fog, FLASH_COLOR.getHex(), 0.5 * f);
    }

    sunUniform.value.copy(solarDirection);
    sun.color.setHex(mood.sun);
    sun.intensity = mood.sunIntensity;

    // Two fades and a product: no shadow from a sun on the horizon, and none
    // from the air, where the box cannot cover what the camera sees.
    state.shadow =
      THREE.MathUtils.smoothstep(elevation, SHADOW_SUN_FADE[0], SHADOW_SUN_FADE[1]) *
      (1 - THREE.MathUtils.smoothstep(eyeHeight, SHADOW_EYE_FADE[0], SHADOW_EYE_FADE[1])) *
      // No sun through a bank: the shadow goes as the sun does.
      (1 - THREE.MathUtils.smoothstep(overcast, 0.3, 0.8));
    sun.shadow.intensity = SHADOW_INTENSITY * state.shadow;
    // The light is placed by `placeShadow`, in the frame the map is redrawn —
    // see its note. With the shadow off nothing is looked up through the map,
    // so the light is free to follow the sun, by its steps, every frame.
    shadowFocus.copy(playerPosition);
    if (state.shadow === 0) placeShadow();
    // The moon lights the hemisphere the sun does not, so the terminator seen
    // from the air is warm on one side and cool on the other rather than warm
    // and empty.
    moonDirection.copy(solarDirection).negate().applyAxisAngle(NORTH, MOON_OFFSET);
    moon.position.copy(moonDirection).multiplyScalar(PLANET_RADIUS * 4);
    moon.color.setHex(mood.moon);
    moon.intensity = mood.moonIntensity;

    // Both discs ride the camera, which is what makes them read as distant:
    // walk a thousand units and they do not shift a pixel, because a bearing is
    // all either of them is. What is *not* camera-relative is the depth — see
    // `SKY_DISTANCE` — so the planet still eclipses them both.
    sunDisc.position.copy(cameraPosition).addScaledVector(solarDirection, SKY_DISTANCE);
    moonDisc.position.copy(cameraPosition).addScaledVector(moonDirection, SKY_DISTANCE);
    // The maria have to face you. `NORTH` and not the local up as the roll
    // reference: the moon's declination is the sun's negated, so the bearing is
    // never within 66 degrees of the pole and the case that would degenerate
    // cannot arise.
    moonDisc.up.copy(NORTH);
    moonDisc.lookAt(cameraPosition);
    // The sun is the brightest thing in the frame at every hour, so its own
    // colour is the mood's sunlight taken half way to white: a low sun goes
    // orange with the light it is casting, without going as dim as the light
    // does. Dimming a star is a lie the fog tells for it; see `Mood.sun`.
    sunMaterial.color.setHex(mood.sun).lerp(WHITE, 0.45);
    moonMaterial.color.setHex(mood.moon).lerp(WHITE, 0.72);
    mareMaterial.color.copy(moonMaterial.color).multiplyScalar(0.84);

    ambient.color.setHex(mood.ambient);
    ambient.intensity = mood.ambientIntensity;
    hemisphere.color.setHex(mood.hemisphereSky);
    hemisphere.groundColor.setHex(mood.hemisphereGround);
    hemisphere.intensity = mood.hemisphereIntensity;
    hemisphere.position.copy(cameraUp);

    fog.color.setHex(mood.fog);
    uniforms.top.value.setHex(mood.skyTop);
    uniforms.horizon.value.setHex(mood.skyHorizon);
    uniforms.glowColor.value.setHex(mood.skyGlow);
    uniforms.sunDir.value.copy(solarDirection);
    uniforms.upDir.value.copy(cameraUp);
    uniforms.moonDir.value.copy(moonDirection);
    uniforms.glow.value = mood.glow;
    uniforms.space.value = orbit;
    uniforms.dip.value = -Math.sqrt(Math.max(0, 1 - (PLANET_RADIUS / distance) ** 2));

    // The stars' frame and how deep into them the night reaches. See
    // `TWILIGHT_LADDER` and the constants under it for every number here.
    equatorialBasis(time, state.celestial);
    if (!warnedMirror && state.celestial.determinant() <= 0) {
      // A reflection would put every constellation back to front and rising
      // in the west, and it would render. Say so rather than draw it quietly.
      warnedMirror = true;
      console.warn('sky: the celestial basis is a reflection', state.celestial.determinant());
    }
    uniforms.galactic.value.setFromMatrix4(state.celestial).transpose().premultiply(GALACTIC);
    const moonUp = THREE.MathUtils.smoothstep(moonDirection.dot(up), -0.05, 0.2);
    const dark = twilightLimit(elevation) - OVERCAST_LIMIT * THREE.MathUtils.smoothstep(overcast, 0.2, 0.7) - MIST_LIMIT * weather.mist;
    state.limit = lerp(dark - MOON_LIMIT * moonUp, SPACE_LIMIT, orbit);
    // `NIGHT_MOOD.stars` is the art's say, the ladder the sky's and the moon
    // the lantern's; above the air, only the altitude's. It goes before the
    // camera leaves the dome (`DOME_EXIT` in `main.ts`), so that edge is not a pop.
    const deep = THREE.MathUtils.smoothstep(dark, MILKY_WAY_LIMITS[0], MILKY_WAY_LIMITS[1]);
    uniforms.milky.value =
      Math.max(mood.stars * deep * (1 - MOON_WASH * moonUp), orbit) *
      (1 - THREE.MathUtils.smoothstep(distance, PLANET_RADIUS * 4.5, PLANET_RADIUS * 5.5));

    // Five 4x1 textures, so this is cheap — but it is an upload, and the ramp
    // moves by a hundredth of a step a minute. Gate it.
    if (Math.abs(mood.rampShadow - lastShadow) > 0.002 || Math.abs(mood.rampGamma - lastGamma) > 0.01) {
      lastGamma = mood.rampGamma;
      lastShadow = mood.rampShadow;
      setToonMood(mood);
    }

    for (const layer of layers) layer(state);
  }

  return {
    sun,
    moon,
    state,
    mood,
    update,
    placeShadow,
    weather,
    uniforms,
    attach(layer) {
      layers.push(layer);
    },
    setTime(when) {
      const next = when === null ? Date.now() : new Date(when).getTime();
      if (!Number.isFinite(next)) return false;
      anchor = next;
      anchorReal = Date.now();
      return true;
    },
    setRate(next) {
      if (!Number.isFinite(next)) return;
      anchor = anchor + (Date.now() - anchorReal) * rate;
      anchorReal = Date.now();
      rate = next;
    },
  };
}
