/**
 * Another world's sky: its sun at the size and brightness its distance gives
 * it, its day and night on its own rotation, the stars and the other planets
 * where they really are, its moons where their orbits have them, and the
 * light all of it casts.
 *
 * ## One rotation carries the whole sky
 *
 * Everything celestial is placed once, in the **inertial** frame — the world
 * frame of `system/contract.ts`'s `eclipticToWorld`, y at the ecliptic's north
 * — and hung in one group whose rotation is the body's own: the turn that
 * carries its **pole** (`poleOf`: the IAU's, J2000) onto the world's +y,
 * then its spin about that pole, `-theta` for a turn of `theta`. The sun, the
 * stars and the planets therefore rise and set together and in the right
 * order, a retrograde world (Venus, Uranus: `rotationHours < 0`) turns the
 * other way without a special case, and the sun's height over the horizon —
 * day and night, and the seasons, which are which way the pole leans — is
 * read off the same rotation rather than computed beside it.
 *
 * The moons are not in that group: they go round the planet's equator, not
 * the ecliptic, and they are near enough for where the traveller stands to
 * move them (Phobos sets below 70 degrees of latitude, Io is larger overhead
 * than on the horizon). Each is placed per frame in the body-fixed frame, from
 * its orbit, and seen from the traveller's own position. So is Earth from the
 * Moon.
 *
 * ## A locked world
 *
 * The Moon turns once an orbit (`Body.locked`). Its spin is not a clock of
 * its own but its **mean longitude** round Earth: the prime meridian faces
 * where Earth would be on a circular orbit, so the real Earth stands near
 * the zenith of 0 N 0 E and only rocks round it — a few degrees east and west
 * with the orbit's eccentricity, north and south with its inclination — while
 * the Sun goes round once a month and Earth's phases with it. Its clock
 * (`setHour`) moves the **date**, not the spin: an hour of lunar day is
 * twenty-nine and a half of ours.
 *
 * The group is centred on the camera and scaled inside its far plane, so the
 * sky is always behind everything and never clipped.
 *
 * ## How bright
 *
 * The inverse-square law is real and a screen cannot show it: Neptune gets a
 * nine-hundredth of Earth's sunlight, which is a black frame. So the light
 * falls as the distance to the **0.18 power**, floored at 0.62 — Mars 0.93 of
 * Earth's, Jupiter 0.74, Neptune 0.62 — because at the 0.45 power the outer
 * worlds read as murk rather than as far away, and the sun's disc shrinks
 * truly (Neptune's is a thirtieth of Earth's across, floored to a bright
 * point), which is the cue a player reads distance from. `SkySpec.exposure`
 * is the planet file's lever.
 *
 * Space is black. Where there is no air (`air` 0: the Moon, Mercury) the sky
 * at noon is the same black as at midnight, and only an atmosphere's night —
 * airglow and scattered starlight — is allowed a trace of blue.
 *
 * ## An overcast sky
 *
 * Venus is the one sky nobody sees out of (`SkySpec.overcast`): no disc, no
 * halo, no stars, planets or moons; the dome brightest at the horizon, and
 * the light coming down from the whole of it, following the hidden Sun's
 * height for day and night.
 *
 * ## Layers
 *
 * A world's own sky — Saturn's rings and aurora, the faint rings of Uranus
 * and Neptune — is a `SkyLayer` (`contract.ts`): made once with the walkable
 * radius, its object hung in the eye-centred group in the body-fixed frame,
 * told each frame where the traveller and the Sun are, and returning how much
 * of the Sun reaches the traveller through it, which dims the light.
 */

import * as THREE from 'three';
import type { SkyLayer, SkyMoon, WorldSpec } from './contract.ts';
import { linearOf } from './terrain.ts';
import { eclipticToWorld, poleOf, surfaceRadiusOf } from '../system/contract.ts';
import { ELEMENTS, heliocentric, moonMeanLongitude, moonPosition, periodOf } from '../system/orbits.ts';
import { rngFrom } from '../scenery/random.ts';
import { lonOf, unitAt } from '../sphere.ts';
import { NIGHT_MOOD, PALETTE } from '../theme.ts';
import { MOON_OFFSET, SUN_SHADOW, castSunShadow } from '../sun.ts';

/** The world's pole, which the moon's lantern is turned about, as Earth's is (`sun.ts`). */
const POLE = new THREE.Vector3(0, 1, 0);

const DEG = Math.PI / 180;
/** The Sun's angular radius from 1 au, degrees. */
const SUN_RADIUS_DEG = 0.2666;
/** The smallest the disc is drawn, degrees: under it a far sun is a point you cannot find. */
const SUN_MIN_DEG = 0.12;
/**
 * The smallest a moon's disc is drawn, radius in degrees: a pixel or two, so
 * Deimos (0.018) is the bright star it is from Mars rather than nothing.
 */
const MOON_MIN_DEG = 0.035;
const STARS = 1800;
/** J2000.0, the instant the orbits and the moons' epochs are measured from. */
const J2000_MS = Date.UTC(2000, 0, 1, 12);
/** Earth's mean radius, km, for its disc in the Moon's sky. */
const EARTH_RADIUS_KM = 6371;

export interface SkyState {
  /** Unit vector toward the sun in the world (body-fixed) frame. */
  sun: THREE.Vector3;
  /** 0 night to 1 day, at the observer. */
  day: number;
  /** The sun's elevation at the observer, radians. */
  elevation: number;
  /** Local solar hour at the observer, 0 to 24. */
  hour: number;
  /** Distance from the Sun, au. */
  au: number;
  /** What the layers let through of the Sun, 0 to 1: Saturn's rings' shadow. */
  shade: number;
}

/** A moon (or Earth, from the Moon) as the traveller sees it this frame. */
export interface MoonView {
  name: string;
  /** Unit vector from the traveller, body-fixed frame. */
  direction: THREE.Vector3;
  /** Angular radius as seen, degrees, before the drawing's floor. */
  radiusDeg: number;
  /** The lit fraction of the disc, 0 new to 1 full. */
  lit: number;
}

export interface Sky {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  hemisphere: THREE.HemisphereLight;
  state: SkyState;
  /** The moons (and Earth, from the Moon), as of the last `update`. */
  moons: readonly MoonView[];
  /** The world's own sky layers, made from its spec. */
  layers: readonly SkyLayer[];
  /** The haze colour, for the fog, linear. */
  haze: THREE.Color;
  /**
   * Moves the sky to the instant `date` (plus the clock offset) for an
   * observer at `position`, the camera at `eye`, its far plane `far`.
   */
  update(date: Date, position: THREE.Vector3, eye: THREE.Vector3, far: number): void;
  /** Turns the clock so it is `hour` local solar time at `position` now. */
  setHour(hour: number, date: Date, position: THREE.Vector3): void;
  dispose(): void;
}

const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const DOME_FRAGMENT = /* glsl */ `
uniform vec3 uUp;
uniform vec3 uSun;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSpace;
uniform vec3 uGlow;
uniform float uDay;
uniform float uAir;
uniform float uOvercast;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float e = dot(d, uUp);
  float h = smoothstep(-0.05, 0.55, e);
  vec3 sky = mix(uHorizon, uZenith, h);
  float s = max(dot(d, uSun), 0.0);
  float open = 1.0 - uOvercast;
  // The glow round the sun is the air's: none on an airless world, and none
  // under a deck that hides the sun.
  sky += uGlow * (pow(s, 24.0) * 0.6 + pow(s, 4.0) * 0.12) * uAir * open;
  // Dusk reddens the horizon a little toward the sun.
  float dusk = (1.0 - abs(uDay - 0.5) * 2.0) * uAir * open;
  sky = mix(sky, uGlow * 0.9, dusk * pow(s, 3.0) * (1.0 - h) * 0.6);
  // An overcast is brightest low down, where the eye looks through the most
  // lit cloud.
  sky *= 1.0 + uOvercast * 0.3 * (1.0 - h);
  vec3 colour = mix(uSpace, sky, clamp(uDay * uAir * 1.4, 0.0, 1.0));
  // Under the horizon the ground hides it; what shows at a cliff's foot is haze.
  colour = mix(colour, uHorizon * mix(0.2, 0.7, uDay), smoothstep(0.0, -0.2, e) * uAir);
  gl_FragColor = vec4(colour, 1.0);
}`;

const DISC_VERTEX = /* glsl */ `
varying vec2 vAt;
void main() {
  vAt = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * A lit ball, drawn as a disc facing the eye: the sphere's normal under each
 * point is `(x, y, sqrt(1 - r^2))` in the disc's own frame (+z toward the
 * eye), and `uSun` is the Sun's direction in that frame. Two bands and a soft
 * terminator, the cel look; the night side is drawn dark where the sky
 * behind it is dark (it hides the stars, as a moon does) and left out where
 * the day sky would show through it.
 */
const DISC_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSun;
uniform float uOpacity;
uniform float uDark;
varying vec2 vAt;
void main() {
  float r2 = dot(vAt, vAt);
  if (r2 > 1.0) discard;
  vec3 n = vec3(vAt, sqrt(1.0 - r2));
  float lit = dot(n, uSun);
  float light = smoothstep(-0.03, 0.05, lit);
  float band = mix(0.72, 1.0, step(0.35, lit));
  vec3 colour = uColor * light * band * (0.86 + 0.14 * n.z);
  float alpha = uOpacity * max(light, uDark) * smoothstep(1.0, 0.96, r2);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(colour, alpha);
}`;

interface Disc {
  mesh: THREE.Mesh;
  uniforms: { uColor: { value: THREE.Color }; uSun: { value: THREE.Vector3 }; uOpacity: { value: number }; uDark: { value: number } };
}

function litDisc(color: number, gain: number): Disc {
  const uniforms = {
    uColor: { value: new THREE.Color().fromArray(linearOf(color)).multiplyScalar(gain) },
    uSun: { value: new THREE.Vector3(0, 0, 1) },
    uOpacity: { value: 1 },
    uDark: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DISC_VERTEX,
    fragmentShader: DISC_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40), material);
  // After the stars and the planets, with the sun; before the layers, so a
  // ring in front of a moon hides it.
  mesh.renderOrder = -8;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function createSky(spec: WorldSpec, scene: THREE.Scene): Sky {
  const body = spec.body;
  const sky = spec.sky;
  const overcast = sky.overcast;
  const group = new THREE.Group();
  group.name = 'world-sky';
  /** The inertial frame, rotated as the body turns. */
  const celestial = new THREE.Group();
  group.add(celestial);

  const horizon = new THREE.Color().fromArray(linearOf(sky.horizon));
  const zenith = new THREE.Color().fromArray(linearOf(sky.zenith));
  // The night: black in vacuum, a trace of blue under air, the deck's own
  // murk under an overcast.
  const space = overcast
    ? horizon.clone().multiplyScalar(0.04)
    : new THREE.Color(0.006, 0.008, 0.02).multiplyScalar(Math.min(1, sky.air * 2.5));
  const uniforms = {
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uHorizon: { value: horizon.clone() },
    uZenith: { value: zenith.clone().multiplyScalar(0.8) },
    uSpace: { value: space },
    uGlow: { value: new THREE.Color().fromArray(linearOf(PALETTE.cream)) },
    uDay: { value: 1 },
    uAir: { value: sky.air },
    uOvercast: { value: overcast ? 1 : 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  );
  dome.name = 'world-dome';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // The stars: fixed in the inertial frame, so they wheel with the sun. With
  // no air between them and the eye they are sharper and brighter.
  const airless = sky.air < 0.05;
  const rng = rngFrom('worlds', 'stars');
  const starPositions = new Float32Array(STARS * 3);
  const starColors = new Float32Array(STARS * 3);
  for (let k = 0; k < STARS; k++) {
    const z = rng.range(-1, 1);
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    starPositions.set([r * Math.cos(a) * 0.98, z * 0.98, r * Math.sin(a) * 0.98], k * 3);
    const b = Math.min(1, (Math.pow(rng.unit(), 3) * 0.9 + 0.1) * (airless ? 1.35 : 1));
    const warm = rng.range(-0.15, 0.15);
    starColors.set([b * (1 + warm), b, b * (1 - warm)], k * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMaterial = new THREE.PointsMaterial({
    size: airless ? 2 : 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  stars.visible = !overcast;
  celestial.add(stars);

  // The sun: a disc and a halo, on the dome.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.8), fog: false, depthWrite: false, transparent: true }),
  );
  sunDisc.renderOrder = -8;
  sunDisc.frustumCulled = false;
  const halo = haloSprite();
  sunDisc.visible = !overcast;
  halo.visible = !overcast;
  celestial.add(sunDisc, halo);

  // The planets, as points. From the Moon, Earth is a disc of its own below.
  const others = Object.keys(ELEMENTS).filter((id) => id !== body.orbit);
  const planetPositions = new Float32Array(others.length * 3);
  const planetColors = new Float32Array(others.length * 3);
  const planetGeometry = new THREE.BufferGeometry();
  planetGeometry.setAttribute('position', new THREE.BufferAttribute(planetPositions, 3));
  planetGeometry.setAttribute('color', new THREE.BufferAttribute(planetColors, 3));
  const planetMaterial = new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false });
  const planets = new THREE.Points(planetGeometry, planetMaterial);
  planets.frustumCulled = false;
  planets.renderOrder = -9;
  planets.visible = !overcast;
  celestial.add(planets);

  // The moons, and Earth over the Moon: lit discs in the body-fixed frame.
  interface Satellite {
    name: string;
    radiusKm: number;
    disc: Disc;
    /** Its centre from the planet's, km, body-fixed: written each frame. */
    at: THREE.Vector3;
    moon: SkyMoon | null;
  }
  const satellites: Satellite[] = sky.moons.map((moon) => ({
    name: moon.name,
    radiusKm: moon.radiusKm,
    disc: litDisc(moon.color, 1.15),
    at: new THREE.Vector3(),
    moon,
  }));
  if (body.kind === 'moon' && body.orbit === 'earth') {
    satellites.push({ name: 'Earth', radiusKm: EARTH_RADIUS_KM, disc: litDisc(PALETTE.skyBlue, 1.6), at: new THREE.Vector3(), moon: null });
  }
  for (const one of satellites) {
    one.disc.mesh.name = `sky:${one.name}`;
    one.disc.mesh.visible = !overcast;
    group.add(one.disc.mesh);
  }
  const views: MoonView[] = satellites.map((one) => ({ name: one.name, direction: new THREE.Vector3(), radiusDeg: 0, lit: 0 }));

  // The world's own layers.
  const radius = surfaceRadiusOf(body.radiusKm);
  const layers = sky.layers.map((make) => make(radius));
  for (const layer of layers) group.add(layer.object);

  // The light.
  const lightColor = new THREE.Color().fromArray(linearOf(sky.light));
  const sun = new THREE.DirectionalLight(lightColor, 2.6);
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  const hemisphere = new THREE.HemisphereLight(horizon.clone(), new THREE.Color().fromArray(linearOf(spec.palette.base)), 0.4);
  // Earth's moon (`sun.ts`): a lantern hung opposite the sun, offset west so
  // it cross-lights the ground, always full and always up at midnight — a
  // night with nothing to see by is not a night anybody can walk in, and on
  // Earth it is the moon that keeps a direction for the ramp to step across.
  const moon = new THREE.DirectionalLight(NIGHT_MOOD.moon, 0);
  scene.add(sun, sun.target, moon, moon.target, ambient, hemisphere);
  // Earth's shadow, cast the same way (`castSunShadow`).
  castSunShadow(sun);

  const moonward = new THREE.Vector3();
  const state: SkyState = { sun: new THREE.Vector3(0, 1, 0), day: 1, elevation: 1, hour: 12, au: 1, shade: 1 };
  const haze = horizon.clone();
  /** The clock's offset, hours: the spin's on a turning world, the date's on a locked one. */
  let offset = 0;
  const locked = body.locked === true;
  /**
   * A solar day, hours: the turn against the Sun's. A locked world's clock
   * moves the date a twenty-fourth of it for each hour of its local time.
   */
  const solarDay = Math.abs(1 / (1 / body.rotationHours - 1 / (periodOf(body.orbit ?? 'earth') * 24)));

  const Y = new THREE.Vector3(0, 1, 0);
  const pole = poleOf(body);
  const P = new THREE.Vector3(pole.x, pole.y, pole.z).normalize();
  /** The inertial frame onto the body's: its pole onto +y, by the shortest turn. */
  const align = new THREE.Quaternion().setFromUnitVectors(P, Y);
  /**
   * The planet's equinox, where the Sun crosses its equator going north: the
   * line its equator and the ecliptic share, which the shortest turn leaves
   * where it is. Its longitude in the aligned frame is where the moons'
   * angles start.
   */
  const node = new THREE.Vector3().crossVectors(P, Y);
  if (node.lengthSq() < 1e-12) node.set(1, 0, 0);
  node.normalize();
  const equinox = lonOf(node.x, node.z) * DEG;
  const spin = new THREE.Quaternion();
  /** A circle's face, and the way back to the eye from a point on the dome. */
  const FACING = new THREE.Vector3(0, 0, 1);
  const inward = new THREE.Vector3();
  const sunInertial = new THREE.Vector3();
  const up = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const across = new THREE.Vector3();
  const local = new THREE.Quaternion();
  const observer = new THREE.Vector3();
  let turn = 0;
  let lastMs = Number.NaN;
  let elapsed = 0;

  /** Where the body is, au, in the world frame. The Moon rides with Earth. */
  function bodyAt(date: Date): THREE.Vector3 {
    const orbit = body.orbit ?? 'earth';
    const h = heliocentric(orbit, date);
    const v = eclipticToWorld(h);
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  /** The body's turn at `date`, radians: the angle `spin` turns the aligned frame back by. */
  function turnAt(date: Date): number {
    if (locked) {
      // The prime meridian faces the mean Earth: the Moon's mean longitude
      // turned round, in the ecliptic, seen in the aligned frame.
      unitAt(0, moonMeanLongitude(date) + 180, scratch).applyQuaternion(align);
      return lonOf(scratch.x, scratch.z) * DEG;
    }
    const hours = (date.getTime() - J2000_MS) / 3600000 + offset;
    return (2 * Math.PI * hours) / body.rotationHours;
  }

  /** When the planets were last moved, ms of the sky's clock, and how often they are. */
  let planetsAt = Number.NaN;
  const PLANETS_EVERY_MS = 20 * 60000;
  others.forEach((id, k) => {
    const tint = id === 'earth' ? linearOf(PALETTE.skyBlue) : id === 'mars' ? linearOf(PALETTE.salmon) : linearOf(PALETTE.cream);
    planetColors[k * 3] = tint[0] * 1.6;
    planetColors[k * 3 + 1] = tint[1] * 1.6;
    planetColors[k * 3 + 2] = tint[2] * 1.6;
  });
  planetGeometry.getAttribute('color').needsUpdate = true;

  function place(date: Date): void {
    const here = bodyAt(date);
    state.au = here.length();
    sunInertial.copy(here).multiplyScalar(-1).normalize();
    turn = turnAt(date);
    spin.setFromAxisAngle(Y, -turn);
    celestial.quaternion.copy(spin).multiply(align);

    const discDeg = Math.max(SUN_MIN_DEG, SUN_RADIUS_DEG / state.au);
    sunDisc.position.copy(sunInertial).multiplyScalar(0.95);
    sunDisc.scale.setScalar(Math.tan(discDeg * DEG) * 0.95);
    // Facing the eye, which is this group's origin: `lookAt` would aim in
    // world space, at the planet's centre.
    sunDisc.quaternion.setFromUnitVectors(FACING, inward.copy(sunInertial).negate());
    halo.position.copy(sunDisc.position);
    halo.scale.setScalar(Math.tan(Math.max(discDeg * 9, 1.6) * DEG) * 0.95);

    // The planets, from here: they crawl across the sky over days, so they
    // are moved every `PLANETS_EVERY_MS` of the sky's clock, and their
    // colours, which never change, were laid once.
    if (!(Math.abs(date.getTime() - planetsAt) < PLANETS_EVERY_MS)) {
      planetsAt = date.getTime();
      others.forEach((id, k) => {
        const h = heliocentric(id, date);
        const w = eclipticToWorld(h);
        const v = scratch.set(w.x, w.y, w.z).sub(here).normalize();
        planetPositions[k * 3] = v.x * 0.96;
        planetPositions[k * 3 + 1] = v.y * 0.96;
        planetPositions[k * 3 + 2] = v.z * 0.96;
      });
      planetGeometry.getAttribute('position').needsUpdate = true;
    }

    // The moons' centres, km from the planet's, body-fixed.
    const days = (date.getTime() - J2000_MS) / 86400000;
    const sense = Math.sign(body.rotationHours) || 1;
    for (const one of satellites) {
      const moon = one.moon;
      if (moon === null) {
        // Earth, from the Moon: the Moon's own geocentric place turned round.
        // Ecliptic latitude and longitude are the world's (`eclipticToWorld`
        // keeps longitude), so `unitAt` is the ecliptic direction too.
        const lunar = moonPosition(date);
        unitAt(lunar.lat, lunar.lon, one.at).negate().applyQuaternion(celestial.quaternion).multiplyScalar(lunar.distance);
        continue;
      }
      const ascending = equinox / DEG + (moon.node ?? 0);
      const u = moon.epoch + ((moon.retrograde === true ? -sense : sense) * 360 * days) / moon.period;
      const w = (u - (moon.node ?? 0)) * DEG;
      const i = moon.inclination * DEG;
      // The node's direction in the equator, the direction a quarter turn on
      // from it tipped up out of the equator by the inclination, and the
      // orbit between the two.
      unitAt(0, ascending, scratch);
      across.crossVectors(Y, scratch).multiplyScalar(Math.cos(i)).addScaledVector(Y, Math.sin(i));
      one.at.copy(scratch).multiplyScalar(Math.cos(w)).addScaledVector(across, Math.sin(w));
      one.at.applyQuaternion(spin).multiplyScalar(moon.distanceKm);
    }
  }

  return {
    group,
    sun,
    ambient,
    hemisphere,
    state,
    moons: views,
    layers,
    haze,
    update(date, position, eye, far) {
      const when = locked ? new Date(date.getTime() + offset * 3600000) : date;
      place(when);
      state.sun.copy(sunInertial).applyQuaternion(celestial.quaternion);
      up.copy(position).normalize();
      const sinE = state.sun.dot(up);
      state.elevation = Math.asin(Math.max(-1, Math.min(1, sinE)));
      // Under a deck the dusk is long: the light comes down from the whole
      // sky, so it goes as the Sun's height over the cloud, not over the hill.
      state.day = overcast ? THREE.MathUtils.smoothstep(sinE, -0.2, 0.3) : THREE.MathUtils.smoothstep(sinE, -0.12, 0.18);
      // The hour is the hour angle: how far round the pole the observer's
      // meridian is from the sun's, in the world's own longitudes (the pole is
      // the world's y, because it is the sky that turns). East of the
      // subsolar meridian it is afternoon on a world that turns eastward, and
      // morning on one that turns the other way.
      const sense = Math.sign(body.rotationHours) || 1;
      let angle = lonOf(up.x, up.z) - lonOf(state.sun.x, state.sun.z);
      angle = ((angle + 540) % 360) - 180;
      state.hour = (((12 + (sense * angle) / 15) % 24) + 24) % 24;

      group.position.copy(eye);
      group.scale.setScalar(far * 0.9);
      uniforms.uUp.value.copy(up);
      uniforms.uSun.value.copy(state.sun);
      uniforms.uDay.value = state.day;

      // Light falls as the distance to the 0.18 power: see the header.
      const reach = Math.min(1.4, Math.max(0.62, Math.pow(state.au, -0.18))) * sky.exposure;
      const fade = Math.max(1 - sky.air * state.day * 1.3, 0.06);
      starMaterial.opacity = fade;
      planetMaterial.opacity = fade;

      // The moons, from where the traveller stands.
      observer.copy(position).multiplyScalar(body.radiusKm / radius);
      const moonOpacity = 1 - 0.55 * sky.air * state.day;
      const dark = 1 - Math.min(1, sky.air * state.day * 1.5);
      satellites.forEach((one, k) => {
        const view = views[k]!;
        const rel = scratch.copy(one.at).sub(observer);
        const distance = rel.length();
        view.direction.copy(rel).divideScalar(distance);
        view.radiusDeg = Math.asin(Math.min(1, one.radiusKm / distance)) / DEG;
        view.lit = (1 - view.direction.dot(state.sun)) / 2;
        const mesh = one.disc.mesh;
        const drawn = Math.max(MOON_MIN_DEG, view.radiusDeg);
        mesh.position.copy(view.direction).multiplyScalar(0.93);
        mesh.scale.setScalar(Math.tan(drawn * DEG) * 0.93);
        mesh.quaternion.setFromUnitVectors(FACING, inward.copy(view.direction).negate());
        local.copy(mesh.quaternion).invert();
        one.disc.uniforms.uSun.value.copy(state.sun).applyQuaternion(local);
        one.disc.uniforms.uOpacity.value = moonOpacity;
        one.disc.uniforms.uDark.value = dark;
      });

      // The layers, and what they let through.
      const ms = date.getTime();
      if (Number.isFinite(lastMs)) elapsed += Math.min(1, Math.max(0, (ms - lastMs) / 1000));
      lastMs = ms;
      let through = 1;
      for (const layer of layers) {
        through *= layer.update({
          observer: position,
          sun: state.sun,
          day: state.day,
          time: elapsed,
          haze,
          light: Math.min(1.2, Math.max(0.35, reach * 1.6)),
          date: when,
          turn: turn - equinox,
        });
      }
      state.shade = through;

      if (overcast) {
        // The light comes down from the deck: overhead, soft, and mostly fill.
        sun.position.copy(position).addScaledVector(up, SUN_SHADOW.distance);
        sun.intensity = 0.9 * reach * state.day;
        // A light through a cloud deck throws no edge.
        sun.shadow.intensity = 0;
        ambient.intensity = 0.12 + 0.4 * state.day * reach;
        hemisphere.intensity = 0.08 + 0.7 * state.day;
      } else {
        sun.position.copy(position).addScaledVector(state.sun, SUN_SHADOW.distance);
        sun.intensity = 2.6 * reach * THREE.MathUtils.smoothstep(sinE, -0.04, 0.1) * through;
        // Faded as Earth's: with a low sun, and with the eye climbing away.
        const elevationDeg = state.elevation / DEG;
        const eyeHeight = Math.max(0, eye.length() - position.length());
        sun.shadow.intensity =
          SUN_SHADOW.intensity *
          THREE.MathUtils.smoothstep(elevationDeg, SUN_SHADOW.sunFade[0], SUN_SHADOW.sunFade[1]) *
          (1 - THREE.MathUtils.smoothstep(eyeHeight, SUN_SHADOW.eyeFade[0], SUN_SHADOW.eyeFade[1]));
        // Fill: the air scatters light into the shade, and an airless world's
        // shade is lit only by the ground. Night keeps a floor so the ground is
        // there to walk on.
        ambient.intensity = 0.1 + (0.24 + 0.2 * sky.air) * state.day * reach;
        hemisphere.intensity = 0.06 + 0.36 * state.day * (0.4 + sky.air * 0.6);
      }
      sun.target.position.copy(position);
      moonward.copy(state.sun).negate().applyAxisAngle(POLE, MOON_OFFSET);
      moon.position.copy(position).addScaledVector(moonward, SUN_SHADOW.distance);
      moon.target.position.copy(position);
      // Under a deck the whole sky glows a little instead.
      moon.intensity = NIGHT_MOOD.moonIntensity * (1 - state.day) * (overcast ? 0.4 : 1);
      hemisphere.position.copy(up);
      haze.copy(horizon).multiplyScalar(0.12 + 0.88 * state.day);
    },
    setHour(hour, date, position) {
      offset = 0;
      // On a turning world the offset turns the body and leaves the orbit
      // where the date has it, so an hour of local time is a twenty-fourth of
      // a *sidereal* turn and the step is exact; on a locked one it moves the
      // date by a twenty-fourth of the solar day, which the librations make
      // nearly exact. The loop absorbs the rest and the wrap at midnight.
      const step = locked ? solarDay : Math.abs(body.rotationHours);
      for (let pass = 0; pass < 8; pass++) {
        this.update(date, position, position, 1);
        let delta = hour - state.hour;
        delta = ((delta + 36) % 24) - 12;
        if (Math.abs(delta) < 0.005) break;
        offset += (delta / 24) * step;
      }
    },
    dispose() {
      dome.geometry.dispose();
      (dome.material as THREE.Material).dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      planetGeometry.dispose();
      planetMaterial.dispose();
      sunDisc.geometry.dispose();
      (sunDisc.material as THREE.Material).dispose();
      for (const one of satellites) {
        one.disc.mesh.geometry.dispose();
        (one.disc.mesh.material as THREE.Material).dispose();
      }
      for (const layer of layers) layer.dispose();
      // The halo's drawn texture, and the lights: the sun's shadow map is a
      // 2048-square render target the renderer made on its first shadow and
      // frees only here, so every visit to a world kept one on the card.
      halo.material.map?.dispose();
      halo.material.dispose();
      sun.dispose();
      moon.dispose();
      scene.remove(sun, sun.target, moon, moon.target, ambient, hemisphere);
    },
  };
}

/** A soft round glow, as a sprite whose texture is drawn once. */
function haloSprite(): THREE.Sprite {
  const size = 64;
  let texture: THREE.Texture;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,240,215,0.9)');
    gradient.addColorStop(0.25, 'rgba(255,225,180,0.35)');
    gradient.addColorStop(1, 'rgba(255,210,160,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
    texture = new THREE.CanvasTexture(canvas);
  } else {
    texture = new THREE.Texture();
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, color: 0xffffff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
  );
  sprite.renderOrder = -8;
  sprite.frustumCulled = false;
  return sprite;
}
