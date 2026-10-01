/**
 * The night sky: the Bright Star Catalogue and the five planets the eye can
 * find, where they really are tonight.
 *
 * **What it is.** 8,404 stars of V 6.5 or brighter (`scripts/build-stars.ts`),
 * turned under the Earth by sidereal time and precession (`celestial.ts`), and
 * Mercury, Venus, Mars, Jupiter and Saturn at their true geocentric places and
 * almanac magnitudes (`system/orbits.ts`, the same difference the menu's
 * planet cards read). One `THREE.Points` of 8,409 directions, one draw call,
 * drawn at infinity just after the dome. The Milky Way is not here: it is a
 * glow, not points, and the dome paints it (`sun.ts`).
 *
 * **What it is not, on purpose.** No constellation lines and no names — the
 * sky here is looked at, not labelled, as the menu's "Where to look tonight"
 * already decided — no light pollution, and **no real moon**: the lantern in
 * `sun.ts` stays exactly what it is, a decision about the light (see
 * `MOON_OFFSET` there), and against these stars it still sits in the zodiac,
 * within nine degrees of the ecliptic. What the stars take from it is a local
 * glare and a share of the night's depth, which is `sun.ts`'s business.
 *
 * # Painted, and still the sky
 *
 * The world is soft light and atmosphere, and a photograph's sky — a
 * thousand hard white pixels — fights it. So every star is a soft round dot,
 * two pixels wide at its faintest and five at its brightest, with a wider
 * glow drawn inside its own sprite for the few dozen that earn one (in full
 * for Sirius, Canopus, Venus and Jupiter); its colour is its own B-V as a
 * blackbody's, a little more saturated than an eye would see it, so Betelgeuse
 * and Antares read orange and Rigel and Spica blue at a glance; and how bright
 * it is compresses the real range — a first-magnitude star is about thirty
 * times a sixth-magnitude one here, peak by width squared, not a hundred — so
 * the faint stars are a texture and not a noise, and the bright ones are the
 * shapes of the constellations. **The peak is held under 0.85 of luminance**
 * for every star at every moment, twinkle included: the bloom's bright pass
 * runs at a quarter of the resolution (`post.ts` halves the buffer and
 * `UnrealBloomPass` halves it again) with a threshold of 0.92, and a
 * two-pixel dot above that would blink in and out of it as the camera turned.
 * The halos are drawn here so the bloom never has to.
 *
 * # Where the air comes in
 *
 * Each star is dimmed and reddened by the air along its own line of sight —
 * `EXTINCTION` magnitudes per airmass, the Rozenberg airmass, which is 40 at
 * the horizon — so the constellations sink into a warm haze rather than being
 * cut by the ground; it twinkles by an amount that grows with that airmass,
 * on the real clock and never the sky's (a time-lapse must not strobe),
 * never for a planet, never from above the air and never for somebody who
 * has asked their system for less motion; and it is lost near the sun's and
 * the moon's bearings. Every one of those is multiplied by `1 - space`, the
 * dome's own fade to orbit: the upward direction and the horizon are the
 * camera's, and far from the Earth they would dim a cone of sky round the
 * planet for no reason.
 *
 * # What it costs
 *
 * Measured headless on 2026-09-30: 8,404 directions, magnitudes and colours
 * are 161 KB of vertex buffer, uploaded once; the file is 43.1 KB gzipped and
 * decodes in a few milliseconds. The buffer is sorted by magnitude, so the
 * draw is a prefix of it — the stars brighter than the limit — and a day sky
 * draws the five planets' vertices and nothing else. One program, compiled by
 * `main.ts` before the points join the scene, so the first dusk is not also a
 * shader link.
 */

import * as THREE from 'three';
import type { StarCatalogue } from './pack.ts';
import type { Sky, SkyState } from './sun.ts';
import { ECLIPTIC_J2000 } from './celestial.ts';
import { toUnit } from './sphere.ts';
import { apparentMagnitude, geocentric } from './system/orbits.ts';
import type { OrbitId } from './system/orbits.ts';

/**
 * The planets, in the order the buffer holds them — first, ahead of the
 * catalogue, so hiding them is starting the draw five vertices later. Their
 * colours are the ones every observer describes, as sRGB: Mars's orange,
 * Saturn's pale gold, Jupiter's and Venus's cream, Mercury's grey.
 */
const PLANETS: readonly (readonly [OrbitId, number])[] = [
  ['mercury', 0xe2d6c8],
  ['venus', 0xfff4dc],
  ['mars', 0xffa878],
  ['jupiter', 0xffeed4],
  ['saturn', 0xffe2a8],
];

/**
 * Seconds of sky time a planet's position and magnitude are kept for. Mercury
 * moves fastest against the stars, about two degrees a day at its quickest,
 * which is five arcseconds a minute — a tenth of a pixel. At the 60x
 * time-lapse this is once a second.
 */
const PLANET_REFRESH = 60;

/**
 * The buffer height every size below is stated at, in pixels. A star is a
 * fixed share of the screen's height, so a 4K screen does not shrink the sky
 * to specks, and a narrow lens does not magnify it: a point source has no
 * size to magnify.
 */
const REFERENCE_HEIGHT = 900;

/**
 * Width of a star's dot, full width at half maximum in reference pixels: a
 * sixth-magnitude star is `WIDTH_FAINT`, and every magnitude brighter is
 * `10^WIDTH_PER_MAG` wider, up to `WIDTH_MAX`. The dome's hashed dots were 1
 * to 2.5 pixels on the same 900-pixel reference, so the faint end is where
 * the old sky was and only the bright end has grown.
 */
const WIDTH_FAINT = 1.9;
const WIDTH_PER_MAG = 0.055;
const WIDTH_MAX = 5;

/**
 * Brightness at the centre of the dot, in the scene's linear units: a
 * sixth-magnitude star is `PEAK_FAINT`, every magnitude brighter is
 * `10^PEAK_PER_MAG` more, and nothing passes `PEAK_MAX` — see the header for
 * why that number and not a higher one.
 */
const PEAK_FAINT = 0.06;
const PEAK_PER_MAG = 0.19;
const PEAK_MAX = 0.85;

/**
 * No dot narrower than this many device pixels. A pixel-wide point crawls as
 * the camera turns — it lands on one pixel and then between two — and at 1.5
 * the Gaussian always covers enough of them that its sum hardly changes. A
 * star narrowed below it is widened to it with its peak lowered to keep its
 * light, so the floor makes nothing brighter.
 */
const FLOOR_PX = 1.5;

/**
 * The glow round the brightest: none for a star fainter than magnitude 2
 * (`HALO_FROM`, counted as magnitudes brighter than sixth, like every size
 * here), all of `HALO` of the peak by -1.5 (`HALO_TO`, Sirius), and
 * `HALO_RADIUS` reference pixels to fall to a third, 15% wider for every
 * magnitude past the start, so Venus's is a third wider than Sirius's.
 * Painted into the sprite, so the bloom's threshold is never crossed.
 */
const HALO = 0.2;
const HALO_FROM = 4;
const HALO_TO = 7.5;
const HALO_RADIUS = 3.5;

/**
 * Magnitudes of extinction per airmass in V, and the same for the three
 * channels — the blue lost fastest, which is why a star low over the sea is
 * gold. 0.2 is a clear night at a good site near the sea — a mountain
 * observatory has 0.12, a hazy coast 0.3 — and the channels are its spread
 * across the spectrum, V's own in the middle. Relative to the zenith, so the
 * limit the ladder states is the zenith's.
 */
const EXTINCTION = 0.2;
const EXTINCTION_RGB: readonly [number, number, number] = [0.13, 0.2, 0.34];

/**
 * How much a star's brightness wavers: `TWINKLE_HIGH` of it overhead and
 * `TWINKLE_LOW` by twelve airmasses, five degrees up, where a bright star
 * flashes. Between 2.5 and 6 times a second.
 */
const TWINKLE_HIGH = 0.06;
const TWINKLE_LOW = 0.3;

/**
 * Magnitudes lost looking toward the sun (falling off as the eighth power of
 * the cosine, a third of it thirty degrees away) and toward the lantern moon
 * (the six-hundredth: a third at three degrees and nothing past six). The sun's
 * is what makes the first stars of a dusk come out opposite the sunset; the
 * moon's is what clears a disc of sky round it, as a bright moon does.
 */
const SUN_GLARE = 2.5;
const MOON_GLARE = 3.5;

/**
 * Magnitudes either side of the limit a star fades over. A star exactly at
 * the limit is at half.
 */
const LIMIT_SOFTNESS = 0.5;

/**
 * The limit while the menu shows the system: the diagram's back cloth, calm
 * enough that the planets on their rings are the busiest thing in it, with
 * every constellation still there. The planets' points go too, since the
 * orrery draws the planets themselves.
 */
const MENU_LIMIT = 5;

/**
 * A blackbody's colour through a B-V: Ballesteros' temperature for the index
 * and Mitchell Charity's sRGB for the temperature (D65 white), sampled into a
 * table at the colour indices of the classes — O and B blue-white, A white,
 * the Sun faintly warm, K peach, M orange, the carbon stars past 2 a deep
 * orange.
 */
const COLOR_KNOTS: readonly (readonly [number, number])[] = [
  [-0.33, 0x9bb2ff],
  [-0.2, 0xb8cfff],
  [0, 0xccdbff],
  [0.15, 0xdce5ff],
  [0.3, 0xecefff],
  [0.45, 0xfcf8ff],
  [0.6, 0xfff3ee],
  [0.8, 0xffe8d6],
  [1, 0xffdfc4],
  [1.2, 0xffd7b1],
  [1.4, 0xffd0a0],
  [1.6, 0xffc891],
  [1.85, 0xffbf7d],
  [2.2, 0xffb36a],
  [3, 0xff9d3f],
];

/**
 * How much further than a blackbody's the colours are pushed, around their
 * own luminance. The eye sees a star's colour faintly and a painting says it;
 * 1 is the table as measured.
 */
const COLOR_SATURATION = 1;

const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);

/** A star's colour, linear, written into `out` at `at`, from its B-V. */
function colorOf(bv: number, out: Float32Array, at: number, scratch: THREE.Color, other: THREE.Color): void {
  let k = 1;
  while (k < COLOR_KNOTS.length - 1 && COLOR_KNOTS[k]![0] < bv) k++;
  const [b0, c0] = COLOR_KNOTS[k - 1]!;
  const [b1, c1] = COLOR_KNOTS[k]!;
  const t = Math.min(1, Math.max(0, (bv - b0) / (b1 - b0)));
  scratch.setHex(c0).lerp(other.setHex(c1), t);
  const luma = scratch.r * LUMA.x + scratch.g * LUMA.y + scratch.b * LUMA.z;
  out[at] = luma + (scratch.r - luma) * COLOR_SATURATION;
  out[at + 1] = luma + (scratch.g - luma) * COLOR_SATURATION;
  out[at + 2] = luma + (scratch.b - luma) * COLOR_SATURATION;
}

const vertexShader = /* glsl */ `
  uniform vec3 upDir;
  uniform float dip;
  uniform float space;
  uniform vec3 sunDir;
  uniform vec3 moonDir;
  uniform float limit;
  uniform float scale;
  uniform float time;
  uniform float twinkle;
  attribute float aMagnitude;
  attribute vec3 aTint;
  attribute float aKind;
  varying vec3 vColor;
  varying float vSigma;
  varying float vHalo;
  varying float vHaloRadius;
  varying float vSize;

  void main() {
    vec3 dir = normalize(mat3(modelMatrix) * position);
    // At infinity, and on the far plane like the dome.
    gl_Position = projectionMatrix * (viewMatrix * vec4(dir, 0.0));
    gl_Position.z = gl_Position.w;

    float air = 1.0 - space;
    float above = (dot(dir, upDir) - dip) / (1.0 - dip);
    float s = max(above, 0.0);
    float airmass = 1.0 / (s + 0.025 * exp(-11.0 * s));
    float thick = (airmass - 1.0) * air;
    float glare = ${SUN_GLARE.toFixed(2)} * pow(max(dot(dir, sunDir), 0.0), 8.0)
      + ${MOON_GLARE.toFixed(2)} * pow(max(dot(dir, moonDir), 0.0), 600.0) * air;
    float m = aMagnitude + ${EXTINCTION.toFixed(3)} * thick + glare;
    float seen = smoothstep(limit + ${LIMIT_SOFTNESS.toFixed(2)}, limit - ${LIMIT_SOFTNESS.toFixed(2)}, m)
      * mix(smoothstep(-0.004, 0.012, above), 1.0, space);
    if (seen < 0.004) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      gl_PointSize = 1.0;
      return;
    }

    float excess = 6.0 - m;
    float width = clamp(${WIDTH_FAINT.toFixed(3)} * pow(10.0, ${WIDTH_PER_MAG.toFixed(3)} * excess), ${WIDTH_FAINT.toFixed(3)}, ${WIDTH_MAX.toFixed(3)}) * scale;
    float peak = min(${PEAK_FAINT.toFixed(3)} * pow(10.0, ${PEAK_PER_MAG.toFixed(3)} * excess), ${PEAK_MAX.toFixed(3)});
    if (width < ${FLOOR_PX.toFixed(2)}) {
      peak *= width * width / ${(FLOOR_PX * FLOOR_PX).toFixed(4)};
      width = ${FLOOR_PX.toFixed(2)};
    }

    // Twinkle: two waves on a phase of the star's own, stronger low.
    if (aKind < 0.5) {
      float phase = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2832;
      float rate = 2.5 + 3.5 * fract(phase * 3.7);
      float wave = 0.6 * sin(time * rate + phase) + 0.4 * sin(time * rate * 1.71 + phase * 2.3);
      float depth = mix(${TWINKLE_HIGH.toFixed(3)}, ${TWINKLE_LOW.toFixed(3)}, smoothstep(1.2, 12.0, airmass));
      peak *= 1.0 + wave * depth * air * twinkle;
    }

    vec3 tint = aTint / max(dot(aTint, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    tint *= pow(vec3(10.0), -0.4 * (vec3(${EXTINCTION_RGB.map((k) => (k - EXTINCTION).toFixed(3)).join(', ')})) * thick);
    // Held under the bloom's threshold whatever the twinkle and the tint did.
    float luma = dot(tint, vec3(0.2126, 0.7152, 0.0722)) * peak;
    peak *= min(1.0, ${PEAK_MAX.toFixed(3)} / max(luma, 1e-4));

    vSigma = width / 2.3548;
    vHalo = ${HALO.toFixed(3)} * smoothstep(${HALO_FROM.toFixed(2)}, ${HALO_TO.toFixed(2)}, excess);
    vHaloRadius = ${HALO_RADIUS.toFixed(2)} * scale * (1.0 + 0.15 * max(excess - ${HALO_FROM.toFixed(2)}, 0.0));
    float reach = max(3.0 * vSigma, vHalo > 0.0 ? vHaloRadius * 4.0 : 0.0);
    vSize = 2.0 * ceil(reach) + 1.0;
    gl_PointSize = vSize;
    vColor = tint * peak * seen;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vSigma;
  varying float vHalo;
  varying float vHaloRadius;
  varying float vSize;

  void main() {
    vec2 p = (gl_PointCoord - 0.5) * vSize;
    float r2 = dot(p, p);
    float light = exp(-0.5 * r2 / (vSigma * vSigma));
    if (vHalo > 0.0) light += vHalo * exp(-sqrt(r2) / vHaloRadius);
    if (light < 0.003) discard;
    gl_FragColor = vec4(vColor * light, 1.0);
  }
`;

export interface NightSky {
  /** In the world's scene from `main.ts`. `points.visible` is the A/B switch. */
  points: THREE.Points;
  /**
   * While the menu is up: the limit held at `MENU_LIMIT` and the planets'
   * points hidden, because the orrery draws the planets. `main.ts` clears it
   * when the world takes the sky back.
   */
  menu: boolean;
  /** Hand to `Sky.attach`: it reads the finished sky every frame. */
  update: (state: SkyState) => void;
  /** `atlas.night.stats`: what was drawn last frame, and the planets as of the last refresh. */
  stats: {
    stars: number;
    drawn: number;
    limit: number;
    planets: Record<string, number>;
  };
  dispose(): void;
}

/**
 * Builds the points from a decoded catalogue and the sky that turns them. The
 * caller adds `points` to the scene and hands `update` to `sky.attach`.
 */
export function createNightSky(catalogue: StarCatalogue, sky: Sky): NightSky {
  const planets = PLANETS.length;
  const total = planets + catalogue.count;
  const positions = new Float32Array(total * 3);
  const magnitudes = new Float32Array(total);
  const tints = new Float32Array(total * 3);
  const kinds = new Uint8Array(total);
  const scratch = new THREE.Color();
  const other = new THREE.Color();

  PLANETS.forEach(([, hex], i) => {
    scratch.setHex(hex);
    tints.set([scratch.r, scratch.g, scratch.b], i * 3);
    kinds[i] = 1;
    // Set by the first update, and nowhere until then.
    magnitudes[i] = 99;
    positions.set([0, 1, 0], i * 3);
  });
  for (let s = 0; s < catalogue.count; s++) {
    const i = planets + s;
    // The catalogue's frame is the J2000 sky laid out as the world lays out a
    // globe (`celestial.ts`): a declination is a latitude and a right
    // ascension a longitude, and `toUnit` is the one conversion.
    toUnit(catalogue.dec[s]!, catalogue.ra[s]!, positions, i * 3);
    magnitudes[i] = catalogue.mag[s]!;
    colorOf(catalogue.color[s]!, tints, i * 3, scratch, other);
  }

  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  const magnitude = new THREE.BufferAttribute(magnitudes, 1);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aMagnitude', magnitude);
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  // Directions, not places: a sphere that contains every one of them.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  geometry.setDrawRange(0, planets);

  const shared = sky.uniforms;
  const uniforms = {
    upDir: shared.upDir,
    dip: shared.dip,
    space: shared.space,
    sunDir: shared.sunDir,
    moonDir: shared.moonDir,
    limit: { value: -10 },
    scale: { value: 1 },
    time: { value: 0 },
    twinkle: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'night-sky',
    uniforms,
    vertexShader,
    fragmentShader,
    blending: THREE.AdditiveBlending,
    // In the opaque list, straight after the dome's 1000, so what is drawn
    // over the sky is drawn over the stars too — clouds, water, the planet.
    transparent: false,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  // A `Points` in the ink pass would be drawn twice, additively; see
  // `outline.ts`'s note on the city lights.
  material.userData.outlineParameters = { visible: false };

  const points = new THREE.Points(geometry, material);
  points.name = 'stars';
  points.renderOrder = 1001;
  points.frustumCulled = false;
  points.matrixAutoUpdate = false;

  const bufferSize = new THREE.Vector2();
  const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  points.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(bufferSize);
    uniforms.scale.value = Math.max(1, bufferSize.y) / REFERENCE_HEIGHT;
    // The real clock, wrapped before a float loses the sine's phase.
    uniforms.time.value = (performance.now() / 1000) % 3600;
    uniforms.twinkle.value = calm?.matches === true ? 0 : 1;
  };

  const stats: NightSky['stats'] = { stars: catalogue.count, drawn: 0, limit: -10, planets: {} };
  const toward = new THREE.Vector3();
  let planetsAt = Number.NaN;

  /** How many of the catalogue are no fainter than `m`: a binary search, the list being sorted. */
  function brighterThan(m: number): number {
    let lo = 0;
    let hi = catalogue.count;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (catalogue.mag[mid]! <= m) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function placePlanets(time: Date): void {
    PLANETS.forEach(([id], i) => {
      const seen = geocentric(id, time);
      toward.set(seen.x, seen.y, seen.z).applyMatrix3(ECLIPTIC_J2000).normalize();
      position.setXYZ(i, toward.x, toward.y, toward.z);
      const m = apparentMagnitude(id, time);
      magnitude.setX(i, m);
      stats.planets[id] = Number(m.toFixed(2));
    });
    position.clearUpdateRanges();
    position.addUpdateRange(0, planets * 3);
    position.needsUpdate = true;
    magnitude.clearUpdateRanges();
    magnitude.addUpdateRange(0, planets);
    magnitude.needsUpdate = true;
  }

  const night: NightSky = {
    points,
    menu: false,
    stats,
    update(state) {
      points.matrix.copy(state.celestial);
      points.matrixWorldNeedsUpdate = true;
      const time = state.time.getTime();
      if (!(Math.abs(time - planetsAt) < PLANET_REFRESH * 1000)) {
        planetsAt = time;
        placePlanets(state.time);
      }
      const limit = night.menu ? Math.min(state.limit, MENU_LIMIT) : state.limit;
      uniforms.limit.value = limit;
      const drawn = brighterThan(limit + LIMIT_SOFTNESS);
      const first = night.menu ? planets : 0;
      geometry.setDrawRange(first, planets + drawn - first);
      stats.drawn = drawn;
      stats.limit = Number(limit.toFixed(2));
    },
    dispose() {
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
  return night;
}
