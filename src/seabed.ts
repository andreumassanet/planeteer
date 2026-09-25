import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS } from './globe.ts';
import { OCEAN_COLOR, PALETTE, createToonRamp } from './theme.ts';
import { FOAM_GLSL, SURF_COLOR, addGlint, addSeaWindow, ribbonColour, seaClock, seaWindow, surfaceLift, waterProfile } from './ocean.ts';
import {
  COLOUR_REACH,
  SEA_REACH,
  TILE_QUADS,
  TILE_UNITS,
  coastAt,
  coastSample,
  depthAtDistance,
  isSeaAt,
  prepareSeaFloor,
  seaDepthAt,
  seaZoneAt,
  tileLifeJob,
  tileOf,
  tilePoint,
} from './sea-floor.ts';
import type { Decor, DecorKind, SeaZone, TileLife, TileLifeJob } from './sea-floor.ts';
import { fbm } from './terrain.ts';
import { hash3 } from './weather.ts';
import { latOf } from './sphere.ts';
import { mayBuild } from './view.ts';
import { proxyOf } from './warm.ts';

/**
 * The sea floor round the player, and the clear water over it.
 *
 * **What it draws**: the floor `sea-floor.ts` defines, as a mesh on the cube
 * sphere's tiles near the player; the coral, the kelp, the seagrass, the rocks,
 * the starfish and the urchins standing on it, merged into one mesh with it;
 * and a water surface over both that is exactly as clear as the water under it
 * is shallow — sand showing turquoise at the beach, the reef through a few
 * body lengths of water, and the blue closing over it at the drop-off. Under
 * the surface it is the underwater look: a blue haze, the light moving on the
 * floor, and the surface seen from below.
 *
 * **Three draw calls, none of them inked.** The floor, the decor and the water
 * are one buffer each, cut into `SLOTS` fixed slots of one tile each, and a
 * tile coming or going rewrites its slot and nothing else. Ink would be a
 * second draw of each and it would buy nothing: under the water the surface
 * already hides a hull (it writes depth), and a coral's outline at the pen's
 * width is the coral.
 *
 * **Why the water is drawn twice near the player.** The sea is an opaque
 * sphere with an opaque ribbon over it along every coast (`ocean.ts`), and it
 * has to stay opaque: the sphere is inked, and a see-through fill shows its
 * hull through itself. So round the player the two step aside inside a window
 * (`seaWindow`), and this file draws the water there instead — the same
 * colour, the same surf at the same phase (`FOAM_GLSL`, `coastAt`'s phase
 * along the shore), the same height (`surfaceLift`) and the same glitter
 * (`addGlint`) — but transparent, with its depth written, so what is under it
 * shows and what is behind it does not. At the window's edge the two hand over
 * by the screen door, over water that is already opaque by then: the
 * clearness fades out well inside the window (`CLEAR_FROM`, `CLEAR_TO`), which
 * is also what a real sea does at a grazing angle.
 *
 * **Built a slice at a time**, under `view.ts`'s frame allowance, and the
 * window only opens over tiles that are ready: until then the sea is the
 * opaque sea it always was.
 */

/** How far from the player the window reaches, and its hand-over band, in units. */
const WINDOW = 340;
const BAND = 24;
/** The narrowest window worth opening, units: less is a keyhole, and the sea stays as it was. */
const WINDOW_MIN = 120;
/** How far out tiles are wanted, so they are ready before the window gets to them. */
const PREFETCH = 540;
/** Tiles resident at once: a disc of `PREFETCH` touches at most this many. */
const SLOTS = 16;
/** Past this much coast-free water round the player, or this high, nothing here is drawn. */
const ACTIVE_REACH = 820;
const ACTIVE_CEILING = 700;
/** The water's clearness fades out between these camera heights over the sea, in units. */
const CLEAR_HIGH_FROM = 140;
const CLEAR_HIGH_TO = 420;
/** And between these shares of the window's radius, measured from the player. */
const CLEAR_FROM = 0.5;
const CLEAR_TO = 0.82;
/**
 * The water's absorption length, in units of path through it: a floor this far
 * down, looked at straight down, is seen through `1/e` of the water. At 7, the
 * beach's two units read as sand, the reef flat's ten as coral under blue, and
 * the drop-off's thirty as the sea.
 */
const ABSORB = 7;
/** The caustics seen from above fade out between these camera heights, units. */
const CAUSTIC_HIGH_FROM = 6;
const CAUSTIC_HIGH_TO = 60;
/** How much of a frame this may spend building, milliseconds. */
const BUILD_SHARE = 0.8;
/** How often the wanted tiles are re-listed, seconds, or sooner after this much of a move. */
const WANT_EVERY = 0.5;
const WANT_MOVE = 40;

/** Under the surface: how far the haze lets you see, in units, and the backdrop that closes it. */
const UNDER_FAR = 95;
const UNDER_NEAR = 3;
const BACKDROP_RADIUS = 170;

/** Vertices a tile's grid has. */
const SIDE = TILE_QUADS + 1;
const GRID = SIDE * SIDE;
/** The decor a slot holds, in vertices; a tile with more keeps what fits. */
const DECOR_CAP = 16384;

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// The decor's shapes
// ---------------------------------------------------------------------------

/**
 * One piece of decor as loose triangles in its own frame (+Y up, on `y = 0`),
 * with, per vertex, which of its two colours it wears and how far it sways at
 * the tip, in units. Built once, copied into a tile per item.
 */
interface Shape {
  position: number[];
  part: number[];
  sway: number[];
  /** Its highest point, in its own units: what an item is shrunk by to stay under the surface. */
  top: number;
}

const newShape = (): Shape => ({ position: [], part: [], sway: [], top: 0 });

function tri(shape: Shape, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, part: number, sway: (y: number) => number): void {
  for (const v of [a, b, c]) {
    shape.position.push(v.x, v.y, v.z);
    shape.part.push(part);
    shape.sway.push(sway(v.y));
  }
}

const still = (): number => 0;

/** A faceted tube from `from` to `to`, `sides` round, tapering; closed at the top. */
function tube(shape: Shape, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, sides: number, part: number, sway: (y: number) => number = still): void {
  const axis = new THREE.Vector3().subVectors(to, from);
  const length = axis.length();
  axis.normalize();
  const side = new THREE.Vector3(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) side.set(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(axis, side).normalize();
  const w = new THREE.Vector3().crossVectors(axis, u).normalize();
  const ring = (centre: THREE.Vector3, r: number, k: number): THREE.Vector3 => {
    const a = (k / sides) * Math.PI * 2;
    return centre.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r);
  };
  const top = from.clone().addScaledVector(axis, length);
  for (let k = 0; k < sides; k++) {
    const a0 = ring(from, r0, k), a1 = ring(from, r0, k + 1);
    const b0 = ring(top, r1, k), b1 = ring(top, r1, k + 1);
    tri(shape, a0, b1, a1, part, sway);
    tri(shape, a0, b0, b1, part, sway);
    tri(shape, b0, top.clone().addScaledVector(axis, r1 * 0.4), b1, part === 0 ? 1 : part, sway);
  }
}

/** A faceted dome: `bands` rings of `sides`, squashed to `height` over a base of `radius`. */
function dome(shape: Shape, radius: number, height: number, sides: number, bands: number, part: number, lumpy = 0, seed = 0): void {
  const point = (band: number, k: number): THREE.Vector3 => {
    const phi = (band / bands) * (Math.PI / 2);
    const theta = (k / sides) * Math.PI * 2;
    const bump = 1 + lumpy * (hash3(seed, band, k % sides) - 0.5);
    const r = Math.cos(phi) * radius * bump;
    return new THREE.Vector3(Math.cos(theta) * r, Math.sin(phi) * height * bump, Math.sin(theta) * r);
  };
  for (let band = 0; band < bands; band++) {
    for (let k = 0; k < sides; k++) {
      const a0 = point(band, k), a1 = point(band, k + 1);
      const b0 = point(band + 1, k), b1 = point(band + 1, k + 1);
      tri(shape, a0, b1, a1, part, still);
      if (band + 1 < bands) tri(shape, a0, b0, b1, part, still);
    }
  }
}

/** A flat blade, double-sided by the material, from the ground to `tip`, `width` at its foot. */
function blade(shape: Shape, root: THREE.Vector3, tip: THREE.Vector3, width: number, across: THREE.Vector3, part: number, sway: (y: number) => number): void {
  const a = root.clone().addScaledVector(across, -width / 2);
  const b = root.clone().addScaledVector(across, width / 2);
  tri(shape, a, b, tip, part, sway);
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Every shape, each in a few builds so a reef is not one coral copied. */
function buildShapes(): Record<DecorKind, Shape[]> {
  const shapes = {} as Record<DecorKind, Shape[]>;

  shapes.branch = [0, 1, 2].map((seed) => {
    const s = newShape();
    // A trunk and forks, the tips in the lighter colour: staghorn, cartoon-thick.
    const trunk = V(0, 0.7, 0);
    tube(s, V(0, 0, 0), trunk, 0.22, 0.17, 5, 0);
    const forks = 4 + seed;
    for (let k = 0; k < forks; k++) {
      const a = (k / forks) * Math.PI * 2 + seed;
      const lean = 0.5 + 0.25 * hash3(seed, k, 1);
      const tip = V(Math.cos(a) * lean, 1.35 + 0.4 * hash3(seed, k, 2), Math.sin(a) * lean);
      tube(s, trunk, tip, 0.14, 0.09, 4, k % 2);
    }
    return s;
  });

  shapes.brain = [0, 1].map((seed) => {
    const s = newShape();
    dome(s, 0.75, 0.62, 7, 3, 0, 0.25, seed);
    return s;
  });

  shapes.fan = [0, 1].map((seed) => {
    const s = newShape();
    // A sea fan: a stalk and a flat fan across the current, swaying a little.
    const sway = (y: number): number => y * 0.06;
    tube(s, V(0, 0, 0), V(0, 0.35, 0), 0.08, 0.06, 4, 1);
    const spokes = 6;
    const centre = V(0, 0.35, 0);
    for (let k = 0; k < spokes; k++) {
      const a0 = Math.PI * (0.08 + (0.84 * k) / spokes);
      const a1 = Math.PI * (0.08 + (0.84 * (k + 1)) / spokes);
      const r = 1.2 + 0.2 * seed;
      tri(s, centre, V(Math.cos(a0) * r, 0.35 + Math.sin(a0) * r, 0), V(Math.cos(a1) * r, 0.35 + Math.sin(a1) * r, 0), k % 3 === 0 ? 1 : 0, sway);
    }
    return s;
  });

  shapes.tubes = [0, 1].map((seed) => {
    const s = newShape();
    const count = 4 + seed;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + 0.4 * seed;
      const d = k === 0 ? 0 : 0.3 + 0.15 * hash3(seed, k, 3);
      const h = 0.6 + 0.7 * hash3(seed, k, 4);
      tube(s, V(Math.cos(a) * d, 0, Math.sin(a) * d), V(Math.cos(a) * d * 1.3, h, Math.sin(a) * d * 1.3), 0.15, 0.19, 5, 0);
    }
    return s;
  });

  shapes.kelp = [0, 1, 2].map((seed) => {
    const s = newShape();
    // Stalks as ribbons that zig-zag up, a leaf off each joint; the sway is
    // the square of the height, so the holdfast stays put. Built one unit
    // tall and stretched to the water it stands in (`kelpHeight`).
    const sway = (y: number): number => y * y * 1.6;
    const stalks = 3 + (seed % 2);
    for (let k = 0; k < stalks; k++) {
      const a = (k / stalks) * Math.PI * 2 + seed;
      const base = V(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
      const across = V(-Math.sin(a), 0, Math.cos(a));
      let below = base;
      const joints = 5;
      for (let j = 1; j <= joints; j++) {
        const t = j / joints;
        const drift = 0.12 * Math.sin(j * 1.7 + k + seed);
        const at = V(base.x + drift, t * (0.85 + 0.15 * hash3(seed, k, 5)), base.z - drift);
        blade(s, below, at, 0.08, across, 0, sway);
        blade(s, at, below, 0.08, across, 0, sway);
        // A leaf, off to one side.
        const leafTip = at.clone().addScaledVector(across, (j % 2 === 0 ? 1 : -1) * 0.28).add(V(0, 0.05, 0));
        blade(s, at.clone().add(V(0, -0.1, 0)), leafTip, 0.1, V(0, 1, 0), 1, sway);
        below = at;
      }
    }
    return s;
  });

  shapes.grass = [0, 1].map((seed) => {
    const s = newShape();
    const sway = (y: number): number => y * 0.25;
    const blades = 7;
    for (let k = 0; k < blades; k++) {
      const a = (k / blades) * Math.PI * 2 + seed;
      const d = 0.15 + 0.3 * hash3(seed, k, 6);
      const root = V(Math.cos(a) * d, 0, Math.sin(a) * d);
      const tip = V(Math.cos(a) * (d + 0.15), 0.55 + 0.4 * hash3(seed, k, 7), Math.sin(a) * (d + 0.15));
      blade(s, root, tip, 0.12, V(-Math.sin(a), 0, Math.cos(a)), k % 3 === 0 ? 1 : 0, sway);
    }
    return s;
  });

  shapes.rock = [0, 1, 2].map((seed) => {
    const s = newShape();
    dome(s, 1, 0.7, 6, 2, seed % 2, 0.45, seed + 11);
    return s;
  });

  shapes.star = [0].map(() => {
    const s = newShape();
    // A five-armed star lying on the sand, a bump in the middle.
    const centre = V(0, 0.08, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const b0 = (a - 0.45);
      const b1 = (a + 0.45);
      const tip = V(Math.cos(a) * 0.5, 0.02, Math.sin(a) * 0.5);
      const l = V(Math.cos(b0) * 0.14, 0.03, Math.sin(b0) * 0.14);
      const r = V(Math.cos(b1) * 0.14, 0.03, Math.sin(b1) * 0.14);
      tri(s, centre, r, tip, 0, still);
      tri(s, centre, tip, l, 0, still);
    }
    return s;
  });

  shapes.urchin = [0].map(() => {
    const s = newShape();
    dome(s, 0.28, 0.24, 6, 2, 0);
    // Spines: thin spikes out of the dome.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const root = V(Math.cos(a) * 0.15, 0.12, Math.sin(a) * 0.15);
      const tip = V(Math.cos(a) * 0.5, 0.2 + 0.2 * (k % 2), Math.sin(a) * 0.5);
      blade(s, root, tip, 0.06, V(0, 1, 0), 1, still);
    }
    const top = V(0, 0.24, 0);
    blade(s, top, V(0.05, 0.6, 0.02), 0.06, V(1, 0, 0), 1, still);
    return s;
  });

  for (const variants of Object.values(shapes)) {
    for (const shape of variants) {
      for (let k = 1; k < shape.position.length; k += 3) shape.top = Math.max(shape.top, shape.position[k]!);
    }
  }
  return shapes;
}

/** How far under the surface the top of any piece stays, units. */
const HEADROOM = 0.45;

/** Each kind's two colours, by tone: the first is the body, the second the tips. */
const COLOURS: Readonly<Record<DecorKind, readonly (readonly [number, number])[]>> = {
  branch: [[PALETTE.pink, PALETTE.cream], [PALETTE.violet, PALETTE.pink], [PALETTE.apricot, PALETTE.gold], [PALETTE.salmon, PALETTE.cream], [PALETTE.crimson, PALETTE.pink]],
  brain: [[PALETTE.gold, PALETTE.apricot], [PALETTE.olive, PALETTE.gold], [PALETTE.salmon, PALETTE.blush], [PALETTE.green, PALETTE.olive], [PALETTE.apricot, PALETTE.gold]],
  fan: [[PALETTE.violet, PALETTE.pink], [PALETTE.crimson, PALETTE.salmon], [PALETTE.pink, PALETTE.cream], [PALETTE.orange, PALETTE.apricot]],
  tubes: [[0x3fb4a8, PALETTE.skyBlue], [PALETTE.violet, PALETTE.cream], [PALETTE.orange, PALETTE.gold], [PALETTE.pink, PALETTE.cream], [0x5cc6c0, PALETTE.green]],
  kelp: [[0x8a7a2e, 0xa89a3c], [0x6f6a2c, 0x9a8c34], [0x7d6a30, 0xb09a40]],
  grass: [[PALETTE.green, PALETTE.olive], [0x6f9a5c, PALETTE.green]],
  rock: [[0x8a8680, PALETTE.slate], [PALETTE.slate, 0x6e6a78], [0x7d7266, PALETTE.bone]],
  star: [[PALETTE.orange, PALETTE.orange], [PALETTE.red, PALETTE.red], [PALETTE.apricot, PALETTE.apricot], [PALETTE.violet, PALETTE.violet]],
  urchin: [[0x3a1f3f, 0x241028], [0x2c2233, 0x1e0603]],
};

/** How big each kind stands, units, before an item's own scale. */
const SIZE: Readonly<Record<DecorKind, number>> = {
  branch: 1.5, brain: 1.3, fan: 1.3, tubes: 1.3, kelp: 1, grass: 1.3, rock: 1.4, star: 1.1, urchin: 1.1,
};

/** A kelp's height, units: most of the water it stands in, and never longer than a tall tree. */
const kelpHeight = (depth: number): number => Math.min(14, Math.max(2.5, depth * 0.85));

// ---------------------------------------------------------------------------
// The floor's colour
// ---------------------------------------------------------------------------

const SAND: Readonly<Record<SeaZone, readonly [number, number]>> = {
  // The sand, then what darkens it in patches: coral rubble, weed beds, rock.
  reef: [new THREE.Color(PALETTE.sand).lerp(new THREE.Color(PALETTE.cream), 0.35).getHex(), PALETTE.blush],
  meadow: [new THREE.Color(PALETTE.sand).lerp(new THREE.Color(PALETTE.tan), 0.35).getHex(), 0x6f8a55],
  kelp: [new THREE.Color(PALETTE.tan).lerp(new THREE.Color(PALETTE.bone), 0.4).getHex(), 0x6a6458],
  barren: [new THREE.Color(PALETTE.bone).lerp(new THREE.Color(PALETTE.steel), 0.35).getHex(), PALETTE.slate],
};
const LAKE_BED: readonly [number, number] = [new THREE.Color(PALETTE.tan).lerp(new THREE.Color(PALETTE.brown), 0.4).getHex(), PALETTE.darkOlive];
const PATCH_FREQUENCY = 140;

// ---------------------------------------------------------------------------
// The materials
// ---------------------------------------------------------------------------

const floorUniforms = {
  uFloorTime: { value: 0 },
  uCaustic: { value: 0 },
  uAbove: { value: 1 },
  uDeepTint: { value: new THREE.Color(OCEAN_COLOR).multiplyScalar(0.7) },
};

/**
 * The floor's and the decor's material: toon, flat, unlinked from the pen,
 * with the light moving on it and the blue of the water over it.
 *
 * - **The caustics** are three sines in world space, crossed and run at
 *   different rates, their troughs kept as bright lines: the light a swell
 *   focuses onto the sand, strongest in the shallows and gone by the reef's
 *   foot. By day only (`uCaustic`), and free.
 * - **The blue** is the water's own tint over what is deep, applied only while
 *   the camera is above the surface; under it, the haze does it.
 * - **The sway** is the decor's: each vertex moves by its own `aSway` units
 *   across the current, so a kelp stalk's holdfast stays put and its crown
 *   swings.
 */
function floorMaterial(decor: boolean): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    side: decor ? THREE.DoubleSide : THREE.FrontSide,
  });
  // Faceted, as the land is: the toon ramp steps across facets, and a smooth
  // floor would be one flat band. Three's toon material reads the flag though
  // its type does not list it. The normal attribute is still there, radial,
  // for the shadow's offset.
  (material as { flatShading?: boolean }).flatShading = true;
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, floorUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aDepth;
${decor ? 'attribute float aSway;' : ''}
uniform float uFloorTime;
varying float vFloorDepth;
varying vec3 vFloorWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        decor
          ? `#include <begin_vertex>
  if (aSway > 0.0) {
    vec3 swayUp = normalize(position);
    vec3 swayEast = normalize(cross(vec3(0.0, 1.0, 0.0), swayUp) + vec3(1e-4, 0.0, 0.0));
    vec3 swayNorth = cross(swayUp, swayEast);
    float swayPhase = uFloorTime * 0.9 + dot(position, vec3(0.13, 0.11, 0.17));
    transformed += (swayEast * sin(swayPhase) + swayNorth * 0.5 * sin(swayPhase * 1.3 + 1.0)) * aSway;
  }`
          : '#include <begin_vertex>',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vFloorDepth = aDepth;
  vFloorWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uFloorTime;
uniform float uCaustic;
uniform float uAbove;
uniform vec3 uDeepTint;
varying float vFloorDepth;
varying vec3 vFloorWorld;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  diffuseColor.rgb = mix(diffuseColor.rgb, uDeepTint, (1.0 - exp(-vFloorDepth / 16.0)) * uAbove);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  if (uCaustic > 0.001) {
    vec3 cq = vFloorWorld * 0.42;
    float ct = uFloorTime;
    float cw = sin(cq.x + ct * 0.9 + sin(cq.z * 1.3 + ct * 0.6))
      + sin(cq.z + ct * 0.7 + sin(cq.y * 1.1 - ct * 0.5))
      + sin(cq.y + cq.x * 0.5 - ct * 0.8);
    // Thin lines, not wiggles: only the bottom of the troughs, and faint.
    float caustic = pow(clamp(1.0 - abs(cw) / 0.8, 0.0, 1.0), 7.0);
    totalEmissiveRadiance += vec3(0.85, 0.95, 1.0) * caustic * uCaustic * exp(-vFloorDepth / 6.0) * 0.2;
  }`,
      );
  };
  material.customProgramCacheKey = () => (decor ? 'atlas-sea-decor' : 'atlas-sea-floor');
  return material;
}

const waterUniforms = {
  uTime: seaClock,
  uFoam: { value: SURF_COLOR.clone() },
  uClarity: { value: 0 },
  uClearFrom: { value: 0 },
  uClearTo: { value: 1 },
  uUnder: { value: new THREE.Color(PALETTE.skyBlue).lerp(new THREE.Color(PALETTE.white), 0.35) },
};

/**
 * The water over the floor: the ribbon's toon, colour, surf and glitter, see-
 * through as far as the water is shallow. From above, the share of the floor
 * that shows is `exp(-path / ABSORB)`, the path the depth over the cosine of
 * the view — so a grazing look is opaque however shallow, which is what a real
 * sea does and what lets the window's edge be opaque; from below, it is the
 * surface lit from above, brighter the more steeply you look up at it.
 */
function waterMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aShore;
attribute float aDepth;
varying vec2 vWaterShore;
varying float vWaterDepth;
varying vec3 vWaterWorld;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vWaterShore = aShore;
  vWaterDepth = aDepth;
  vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform vec3 uFoam;
uniform float uClarity;
uniform float uClearFrom;
uniform float uClearTo;
uniform vec3 uUnder;
varying vec2 vWaterShore;
varying float vWaterDepth;
varying vec3 vWaterWorld;
${FOAM_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    float foam = atlasFoam(vWaterShore.x, vWaterShore.y);
    vec3 toEye = normalize(cameraPosition - vWaterWorld);
    float steep = abs(dot(toEye, normalize(vWaterWorld)));
    if (gl_FrontFacing) {
      float path = vWaterDepth / max(0.18, steep);
      float nearby = 1.0 - smoothstep(uClearFrom, uClearTo, length(vWaterWorld - uSeaCentre));
      float clear = exp(-path / ${ABSORB.toFixed(1)}) * uClarity * nearby;
      diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, foam);
      diffuseColor.a = max(1.0 - clear, foam);
    } else {
      diffuseColor.rgb = mix(uUnder, uFoam, foam * 0.5);
      diffuseColor.a = 0.5 + 0.4 * (1.0 - steep);
    }
  }`,
      );
  };
  material.customProgramCacheKey = () => 'atlas-sea-water';
  addGlint(material);
  addSeaWindow(material, 'show');
  return material;
}

// ---------------------------------------------------------------------------
// The tiles
// ---------------------------------------------------------------------------

type TileState = 'building' | 'ready' | 'skipped';

interface Tile {
  key: number;
  state: TileState;
  /** Its middle on the sphere, units, and how far its corners are from it. */
  centre: THREE.Vector3;
  reach: number;
  slot: number;
  /** Past everything any colour looks for: the whole tile is open sea, and asks nothing. */
  open: boolean;
  cursor: number;
  profiles: Float64Array;
  zone: SeaZone;
  lake: boolean;
  floor: Float32Array;
  floorColour: Uint8Array;
  floorDepth: Float32Array;
  water: Float32Array;
  waterNormal: Int8Array;
  waterColour: Uint8Array;
  waterShore: Float32Array;
  waterDepth: Float32Array;
  life: TileLifeJob;
  lived: TileLife | null;
  /** Seconds since it was last wanted, for letting it go. */
  unwanted: number;
}

export interface SeaFrame {
  /** The player: the window is centred here. */
  player: THREE.Vector3;
  /** The camera, world position. */
  camera: THREE.Vector3;
  /** `sky.state.daylight`, 0 to 1. */
  daylight: number;
  /** The scene's fog, which under the surface is the water's. */
  fog: THREE.Fog;
}

export interface SeaStats {
  enabled: boolean;
  active: boolean;
  underwater: boolean;
  /** The window's radius now, units: 0 is the opaque sea. */
  window: number;
  tiles: number;
  building: number;
  skipped: number;
  decor: number;
  triangles: number;
  /** Units under the surface the camera is, 0 above it. */
  cameraDepth: number;
  buildMs: number;
  updateMs: number;
}

export interface Sea {
  group: THREE.Group;
  /** Off leaves the sea as it was: opaque, no floor, no window. */
  enabled: boolean;
  /** Whether the camera is under the surface; the audio and the effects read it. */
  readonly underwater: boolean;
  /** How far under the surface the camera is, units. */
  readonly cameraDepth: number;
  readonly stats: SeaStats;
  update(dt: number, frame: SeaFrame): void;
  /** The radius of the floor under a point: what a diver, a submarine and an underwater camera stop on. */
  floorAt(point: THREE.Vector3): number;
  /** The life of the tiles standing now: what `sea-life.ts` swims. */
  eachLife(visit: (life: TileLife) => void): void;
  proxies(): THREE.Object3D[];
}

export function createSea(world: World): Sea {
  const group = new THREE.Group();
  group.name = 'sea floor';
  const shapes = buildShapes();

  const floorGeometry = new THREE.BufferGeometry();
  const floorPosition = new THREE.BufferAttribute(new Float32Array(SLOTS * GRID * 3), 3);
  const floorColour = new THREE.BufferAttribute(new Uint8Array(SLOTS * GRID * 3), 3, true);
  const floorDepth = new THREE.BufferAttribute(new Float32Array(SLOTS * GRID), 1);
  const floorNormal = new THREE.BufferAttribute(new Int8Array(SLOTS * GRID * 3), 3, true);
  for (const attribute of [floorPosition, floorColour, floorDepth, floorNormal]) attribute.setUsage(THREE.DynamicDrawUsage);
  floorGeometry.setAttribute('position', floorPosition);
  floorGeometry.setAttribute('normal', floorNormal);
  floorGeometry.setAttribute('color', floorColour);
  floorGeometry.setAttribute('aDepth', floorDepth);

  const waterGeometry = new THREE.BufferGeometry();
  const waterPosition = new THREE.BufferAttribute(new Float32Array(SLOTS * GRID * 3), 3);
  const waterNormal = new THREE.BufferAttribute(new Int8Array(SLOTS * GRID * 3), 3, true);
  const waterColour = new THREE.BufferAttribute(new Uint8Array(SLOTS * GRID * 3), 3, true);
  const waterShore = new THREE.BufferAttribute(new Float32Array(SLOTS * GRID * 2), 2);
  const waterDepth = new THREE.BufferAttribute(new Float32Array(SLOTS * GRID), 1);
  for (const attribute of [waterPosition, waterNormal, waterColour, waterShore, waterDepth]) attribute.setUsage(THREE.DynamicDrawUsage);
  waterGeometry.setAttribute('position', waterPosition);
  waterGeometry.setAttribute('normal', waterNormal);
  waterGeometry.setAttribute('color', waterColour);
  waterGeometry.setAttribute('aShore', waterShore);
  waterGeometry.setAttribute('aDepth', waterDepth);

  // One index for both grids: every slot's quads, wound so each faces out
  // (`U x W = N` on every face of the cube sphere).
  const index = new Uint16Array(SLOTS * TILE_QUADS * TILE_QUADS * 6);
  let at = 0;
  for (let slot = 0; slot < SLOTS; slot++) {
    const base = slot * GRID;
    for (let i = 0; i < TILE_QUADS; i++) {
      for (let j = 0; j < TILE_QUADS; j++) {
        const v00 = base + i * SIDE + j;
        const v10 = base + (i + 1) * SIDE + j;
        const v11 = base + (i + 1) * SIDE + j + 1;
        const v01 = base + i * SIDE + j + 1;
        index[at++] = v00; index[at++] = v10; index[at++] = v11;
        index[at++] = v00; index[at++] = v11; index[at++] = v01;
      }
    }
  }
  floorGeometry.setIndex(new THREE.BufferAttribute(index, 1));
  waterGeometry.setIndex(new THREE.BufferAttribute(index.slice(), 1));

  const decorGeometry = new THREE.BufferGeometry();
  const decorPosition = new THREE.BufferAttribute(new Float32Array(SLOTS * DECOR_CAP * 3), 3);
  const decorColour = new THREE.BufferAttribute(new Uint8Array(SLOTS * DECOR_CAP * 3), 3, true);
  const decorSway = new THREE.BufferAttribute(new Float32Array(SLOTS * DECOR_CAP), 1);
  const decorDepth = new THREE.BufferAttribute(new Float32Array(SLOTS * DECOR_CAP), 1);
  const decorNormal = new THREE.BufferAttribute(new Int8Array(SLOTS * DECOR_CAP * 3), 3, true);
  for (const attribute of [decorPosition, decorColour, decorSway, decorDepth, decorNormal]) attribute.setUsage(THREE.DynamicDrawUsage);
  decorGeometry.setAttribute('position', decorPosition);
  decorGeometry.setAttribute('normal', decorNormal);
  decorGeometry.setAttribute('color', decorColour);
  decorGeometry.setAttribute('aSway', decorSway);
  decorGeometry.setAttribute('aDepth', decorDepth);

  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial(false));
  floorMesh.name = 'sea-floor';
  floorMesh.receiveShadow = true;
  const decorMesh = new THREE.Mesh(decorGeometry, floorMaterial(true));
  decorMesh.name = 'sea-decor';
  const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial());
  waterMesh.name = 'sea-water';
  waterMesh.receiveShadow = true;
  // The buffers hold the whole resident disc and move with it; a bound would
  // be recomputed at every slot written, and the camera is always inside it.
  for (const mesh of [floorMesh, decorMesh, waterMesh]) {
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  /**
   * The backdrop under the surface: a sphere round the camera just past the
   * haze, in the haze's colour at its equator, lighter towards the surface
   * and darker towards the deep. It hides the sky, which has no fog, and the
   * far side of every sheet of water, which from under it is culled.
   */
  const backdropGeometry = new THREE.SphereGeometry(BACKDROP_RADIUS, 16, 12);
  const backdropColour = new Float32Array(backdropGeometry.getAttribute('position').count * 3);
  backdropGeometry.setAttribute('color', new THREE.BufferAttribute(backdropColour, 3));
  const backdrop = new THREE.Mesh(
    backdropGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: true }),
  );
  backdrop.name = 'sea-backdrop';
  (backdrop.material as THREE.Material).userData.outlineParameters = { visible: false };
  backdrop.visible = false;
  backdrop.frustumCulled = false;
  group.add(backdrop);

  const tiles = new Map<number, Tile>();
  const freeSlots: number[] = [];
  for (let slot = SLOTS - 1; slot >= 0; slot--) freeSlots.push(slot);
  const wanted: number[] = [];
  const wantedSet = new Set<number>();
  const wantFrom = new THREE.Vector3(Infinity, 0, 0);
  let wantClock = 0;
  let activeClock = 0;
  let active = false;
  let windowRadius = 0;
  let underwater = false;
  let cameraDepth = 0;
  let buildMs = 0;
  // The coast index now, while the world is still loading, rather than in
  // the first frame that asks for it: 46 ms (2026-09-25, Node), which the
  // first frame after the curtain used to pay on top of its own work.
  prepareSeaFloor(world);
  let prepared = true;

  const sample = coastSample();
  const unit = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const point = { x: 0, y: 0, z: 0 };
  const colour = new THREE.Color();
  const tint = new THREE.Color();
  const profile = new Float64Array(9);
  const quaternion = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);

  const stats: SeaStats = {
    enabled: true,
    active: false,
    underwater: false,
    window: 0,
    tiles: 0,
    building: 0,
    skipped: 0,
    decor: 0,
    triangles: 0,
    cameraDepth: 0,
    buildMs: 0,
    updateMs: 0,
  };

  function newTile(key: number): Tile {
    const centre = new THREE.Vector3();
    tilePoint(key, TILE_QUADS / 2, TILE_QUADS / 2, point);
    centre.set(point.x, point.y, point.z);
    tilePoint(key, 0, 0, point);
    const reach = centre.distanceTo(probe.set(point.x, point.y, point.z)) * PLANET_RADIUS;
    centre.multiplyScalar(PLANET_RADIUS);
    return {
      key,
      state: 'building',
      centre,
      reach,
      slot: -1,
      open: false,
      cursor: -1,
      profiles: new Float64Array(36),
      zone: 'meadow',
      lake: false,
      floor: new Float32Array(GRID * 3),
      floorColour: new Uint8Array(GRID * 3),
      floorDepth: new Float32Array(GRID),
      water: new Float32Array(GRID * 3),
      waterNormal: new Int8Array(GRID * 3),
      waterColour: new Uint8Array(GRID * 3),
      waterShore: new Float32Array(GRID * 2),
      waterDepth: new Float32Array(GRID),
      life: tileLifeJob(key),
      lived: null,
      unwanted: 0,
    };
  }

  /** The tile's first step: is any of it sea near a coast, and its colours at the corners. */
  function beginTile(tile: Tile): void {
    unit.copy(tile.centre).normalize();
    coastAt(unit.x, unit.y, unit.z, COLOUR_REACH + tile.reach, sample);
    tile.open = sample.distance === Infinity;
    tile.lake = sample.lake;
    tile.zone = seaZoneAt(latOf(unit.y), sample.lake);
    // Nothing within a tile's reach of its middle, and its middle is land: the
    // whole tile is land and under the land, and nothing of it is drawn.
    if (sample.distance > tile.reach * 1.1 && !isSeaAt(unit.x, unit.y, unit.z)) {
      tile.state = 'skipped';
      return;
    }
    for (let c = 0; c < 4; c++) {
      tilePoint(tile.key, (c & 1) * TILE_QUADS, (c >> 1) * TILE_QUADS, point);
      waterProfile(point.x, point.y, point.z, tile.profiles, c * 9);
    }
    tile.cursor = 0;
  }

  /** One vertex of a tile's floor and water. */
  function tileVertex(tile: Tile, v: number): void {
    const i = Math.floor(v / SIDE);
    const j = v % SIDE;
    tilePoint(tile.key, i, j, point);
    let distance = SEA_REACH;
    let phase = 0;
    if (!tile.open) {
      coastAt(point.x, point.y, point.z, COLOUR_REACH, sample);
      if (sample.distance !== Infinity) {
        distance = sample.distance;
        phase = sample.phase;
      } else distance = COLOUR_REACH;
    } else distance = COLOUR_REACH;
    const depth = depthAtDistance(point.x, point.y, point.z, Math.min(distance, SEA_REACH));
    const o = v * 3;
    const floorRadius = PLANET_RADIUS - depth;
    tile.floor[o] = point.x * floorRadius;
    tile.floor[o + 1] = point.y * floorRadius;
    tile.floor[o + 2] = point.z * floorRadius;
    tile.floorDepth[v] = depth;

    // The sand, patched: rubble, weed or rock by the zone, and a few percent
    // of mosaic a vertex, which with flat shading is the facet the eye sees.
    const [sand, patch] = tile.lake ? LAKE_BED : SAND[tile.zone];
    const patchy = smoothstep(0.5, 0.72, fbm(point.x * PATCH_FREQUENCY, point.y * PATCH_FREQUENCY, point.z * PATCH_FREQUENCY, 2));
    colour.setHex(sand).lerp(tint.setHex(patch), patchy * 0.55).multiplyScalar(0.94 + 0.08 * hash3(tile.key, v, 5));
    tile.floorColour[o] = Math.round(clamp(colour.r, 0, 1) * 255);
    tile.floorColour[o + 1] = Math.round(clamp(colour.g, 0, 1) * 255);
    tile.floorColour[o + 2] = Math.round(clamp(colour.b, 0, 1) * 255);

    // The water: the ribbon's colour for this distance, from the tile's
    // corners' profiles (they vary over thousands of units), at its height.
    const u = i / TILE_QUADS;
    const w = j / TILE_QUADS;
    const p = tile.profiles;
    for (let k = 0; k < 9; k++) {
      profile[k] = (p[k]! * (1 - u) + p[9 + k]! * u) * (1 - w) + (p[18 + k]! * (1 - u) + p[27 + k]! * u) * w;
    }
    ribbonColour(profile, 0, distance, colour);
    tile.waterColour[o] = Math.round(clamp(colour.r, 0, 1) * 255);
    tile.waterColour[o + 1] = Math.round(clamp(colour.g, 0, 1) * 255);
    tile.waterColour[o + 2] = Math.round(clamp(colour.b, 0, 1) * 255);
    const waterRadius = PLANET_RADIUS + surfaceLift(distance);
    tile.water[o] = point.x * waterRadius;
    tile.water[o + 1] = point.y * waterRadius;
    tile.water[o + 2] = point.z * waterRadius;
    tile.waterNormal[o] = Math.round(point.x * 127);
    tile.waterNormal[o + 1] = Math.round(point.y * 127);
    tile.waterNormal[o + 2] = Math.round(point.z * 127);
    tile.waterShore[v * 2] = distance;
    tile.waterShore[v * 2 + 1] = phase;
    tile.waterDepth[v] = depth + surfaceLift(distance);
  }

  /** Works on a tile until the deadline; true once it is ready to stand. */
  function stepTile(tile: Tile, deadline: number): boolean {
    if (tile.cursor < 0) {
      beginTile(tile);
      if (tile.state === 'skipped') return false;
    }
    while (tile.cursor < GRID) {
      tileVertex(tile, tile.cursor++);
      if ((tile.cursor & 31) === 0 && performance.now() > deadline) return false;
    }
    if (tile.lived === null) {
      tile.lived = tile.life.step(deadline);
      if (tile.lived === null) return false;
    }
    return true;
  }

  /** Where one decor item stands, as its frame's three axes and its foot. */
  const itemUp = new THREE.Vector3();
  const itemEast = new THREE.Vector3();
  const itemNorth = new THREE.Vector3();
  const itemFoot = new THREE.Vector3();
  const itemX = new THREE.Vector3();
  const itemZ = new THREE.Vector3();
  const body = new THREE.Color();
  const tip = new THREE.Color();

  /** A tile's decor, written straight into its slot of the decor buffer; returns the vertices used. */
  function writeDecor(tile: Tile, slot: number): number {
    const decor = tile.lived?.decor ?? [];
    const positions = decorPosition.array as Float32Array;
    const colours = decorColour.array as Uint8Array;
    const sways = decorSway.array as Float32Array;
    const depths = decorDepth.array as Float32Array;
    const normals = decorNormal.array as Int8Array;
    const base = slot * DECOR_CAP;
    let n = 0;
    for (const item of decor) {
      const variants = shapes[item.kind];
      const shape = variants[Math.floor(item.tone * 997) % variants.length]!;
      const count = shape.position.length / 3;
      if (n + count > DECOR_CAP) break;
      frameOf(item);
      const palette = COLOURS[item.kind];
      const pair = palette[Math.floor(item.tone * palette.length) % palette.length]!;
      body.setHex(pair[0]);
      tip.setHex(pair[1]);
      // Shrunk, whole, where the water is too shallow for it: a coral head
      // on the beach's first metre is a small one, not one through the surface.
      const natural = item.kind === 'kelp' ? kelpHeight(item.depth) : SIZE[item.kind] * item.scale;
      const fit = Math.min(1, Math.max(0, item.depth - HEADROOM) / (shape.top * natural));
      const size = SIZE[item.kind] * item.scale * fit;
      const tall = natural * fit;
      for (let k = 0; k < count; k++) {
        const lx = shape.position[k * 3]! * size;
        const ly = shape.position[k * 3 + 1]! * tall;
        const lz = shape.position[k * 3 + 2]! * size;
        const o = (base + n) * 3;
        positions[o] = itemFoot.x + itemX.x * lx + itemUp.x * ly + itemZ.x * lz;
        positions[o + 1] = itemFoot.y + itemX.y * lx + itemUp.y * ly + itemZ.y * lz;
        positions[o + 2] = itemFoot.z + itemX.z * lx + itemUp.z * ly + itemZ.z * lz;
        const c = shape.part[k] === 0 ? body : tip;
        // A little darker at the foot, which is the shade a clump casts on itself.
        const shade = 0.72 + 0.28 * clamp(shape.position[k * 3 + 1]! / 1.2, 0, 1);
        colours[o] = Math.round(clamp(c.r * shade, 0, 1) * 255);
        colours[o + 1] = Math.round(clamp(c.g * shade, 0, 1) * 255);
        colours[o + 2] = Math.round(clamp(c.b * shade, 0, 1) * 255);
        normals[o] = Math.round(itemUp.x * 127);
        normals[o + 1] = Math.round(itemUp.y * 127);
        normals[o + 2] = Math.round(itemUp.z * 127);
        sways[base + n] = shape.sway[k]! * (item.kind === 'kelp' ? tall / 10 : item.scale);
        depths[base + n] = Math.max(0, item.depth - ly);
        n++;
      }
    }
    positions.fill(0, (base + n) * 3, (base + DECOR_CAP) * 3);
    return n;
  }

  /** An item's frame: its foot a hair into the sand, +Y up, turned by its yaw. */
  function frameOf(item: Decor): void {
    itemUp.set(item.x, item.y, item.z);
    east.set(0, 1, 0).cross(itemUp);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    itemEast.copy(east).normalize();
    itemNorth.crossVectors(itemUp, itemEast).normalize();
    const c = Math.cos(item.yaw);
    const s = Math.sin(item.yaw);
    // Turned by its yaw in the tangent plane, and Z taken as `X x up` so the
    // frame is right-handed: a mirrored frame would turn every piece inside out.
    itemX.copy(itemEast).multiplyScalar(c).addScaledVector(itemNorth, s);
    itemZ.crossVectors(itemX, itemUp);
    itemFoot.copy(itemUp).multiplyScalar(PLANET_RADIUS - item.depth - 0.12);
  }

  function markRange(attribute: THREE.BufferAttribute, start: number, count: number): void {
    attribute.addUpdateRange(start * attribute.itemSize, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }

  /** A ready tile into a free slot. */
  function stand(tile: Tile): boolean {
    const slot = freeSlots.pop();
    if (slot === undefined) return false;
    tile.slot = slot;
    const base = slot * GRID;
    (floorPosition.array as Float32Array).set(tile.floor, base * 3);
    (floorColour.array as Uint8Array).set(tile.floorColour, base * 3);
    (floorDepth.array as Float32Array).set(tile.floorDepth, base);
    (floorNormal.array as Int8Array).set(tile.waterNormal, base * 3);
    (waterPosition.array as Float32Array).set(tile.water, base * 3);
    (waterNormal.array as Int8Array).set(tile.waterNormal, base * 3);
    (waterColour.array as Uint8Array).set(tile.waterColour, base * 3);
    (waterShore.array as Float32Array).set(tile.waterShore, base * 2);
    (waterDepth.array as Float32Array).set(tile.waterDepth, base);
    for (const attribute of [floorPosition, floorColour, floorDepth, floorNormal, waterPosition, waterNormal, waterColour, waterShore, waterDepth]) {
      markRange(attribute, base, GRID);
    }
    writeDecor(tile, slot);
    for (const attribute of [decorPosition, decorColour, decorSway, decorDepth, decorNormal]) markRange(attribute, slot * DECOR_CAP, DECOR_CAP);
    tile.state = 'ready';
    return true;
  }

  /** A tile out of its slot: its vertices collapsed to the centre, where nothing draws. */
  function retire(tile: Tile): void {
    if (tile.slot >= 0) {
      const base = tile.slot * GRID;
      (floorPosition.array as Float32Array).fill(0, base * 3, (base + GRID) * 3);
      (waterPosition.array as Float32Array).fill(0, base * 3, (base + GRID) * 3);
      (decorPosition.array as Float32Array).fill(0, tile.slot * DECOR_CAP * 3, (tile.slot + 1) * DECOR_CAP * 3);
      markRange(floorPosition, base, GRID);
      markRange(waterPosition, base, GRID);
      markRange(decorPosition, tile.slot * DECOR_CAP, DECOR_CAP);
      freeSlots.push(tile.slot);
      tile.slot = -1;
    }
    tiles.delete(tile.key);
  }

  /** Lists the tiles a disc of `PREFETCH` round the player touches, nearest first. */
  function listWanted(player: THREE.Vector3): void {
    unit.copy(player).normalize();
    north.set(0, 1, 0).projectOnPlane(unit);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(unit);
    north.normalize();
    east.crossVectors(north, unit).normalize();
    wanted.length = 0;
    wantedSet.clear();
    const step = TILE_UNITS / 3;
    const reach = Math.ceil(PREFETCH / step);
    for (let a = -reach; a <= reach; a++) {
      for (let b = -reach; b <= reach; b++) {
        if (Math.hypot(a, b) * step > PREFETCH + step) continue;
        probe.copy(unit).addScaledVector(east, (a * step) / PLANET_RADIUS).addScaledVector(north, (b * step) / PLANET_RADIUS).normalize();
        const key = tileOf(probe.x, probe.y, probe.z);
        if (wantedSet.has(key)) continue;
        wantedSet.add(key);
        wanted.push(key);
      }
    }
    // Nearest first, by each tile's middle.
    const centre = probe;
    const distances = new Map<number, number>();
    for (const key of wanted) {
      tilePoint(key, TILE_QUADS / 2, TILE_QUADS / 2, point);
      distances.set(key, centre.set(point.x, point.y, point.z).distanceTo(unit));
    }
    wanted.sort((p, q) => distances.get(p)! - distances.get(q)!);
    // At most as many as there are slots.
    if (wanted.length > SLOTS) {
      for (const key of wanted.splice(SLOTS)) wantedSet.delete(key);
    }
  }

  const playerPoint = new THREE.Vector3();
  const backdropUp = new THREE.Vector3();
  const underColour = new THREE.Color();
  const deepColour = new THREE.Color();
  const lightColour = new THREE.Color();
  const WARM_UNDER = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.45);
  const COLD_UNDER = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.green), 0.3).multiplyScalar(0.75);

  const sea: Sea = {
    group,
    enabled: true,
    get underwater() {
      return underwater;
    },
    get cameraDepth() {
      return cameraDepth;
    },
    stats,
    update(dt, frame) {
      const began = performance.now();
      stats.enabled = sea.enabled;
      if (!sea.enabled) {
        seaWindow.uSeaRadius.value = 0;
        group.visible = false;
        underwater = false;
        cameraDepth = 0;
        stats.updateMs = performance.now() - began;
        return;
      }
      group.visible = true;
      if (!prepared) {
        prepareSeaFloor(world);
        prepared = true;
      }
      floorUniforms.uFloorTime.value = (floorUniforms.uFloorTime.value + dt) % 6283.19;

      // Under the surface is a question about the camera, not the player: a
      // diver's camera a body behind him can still be above the water.
      const cameraRadius = frame.camera.length();
      cameraDepth = Math.max(0, PLANET_RADIUS + 0.3 - cameraRadius);
      underwater = cameraDepth > 0 && seaDepthAt(frame.camera) > 0 && isWaterUnder(frame.camera);
      if (!underwater) cameraDepth = 0;

      // Whether there is a floor worth drawing: near a coast, near the water.
      activeClock -= dt;
      if (activeClock <= 0) {
        activeClock = 0.5;
        unit.copy(frame.player).normalize();
        coastAt(unit.x, unit.y, unit.z, ACTIVE_REACH, sample);
        const over = cameraRadius - PLANET_RADIUS;
        active = over < ACTIVE_CEILING && (sample.distance < ACTIVE_REACH || underwater);
      }
      stats.active = active;

      if (active) {
        wantClock -= dt;
        if (wantClock <= 0 || wantFrom.distanceTo(frame.player) > WANT_MOVE) {
          wantClock = WANT_EVERY;
          wantFrom.copy(frame.player);
          listWanted(frame.player);
        }
        for (const key of wanted) if (!tiles.has(key)) tiles.set(key, newTile(key));
      } else if (wanted.length > 0) {
        wanted.length = 0;
        wantedSet.clear();
      }

      // Let go of what is no longer wanted after a moment, so a step back and
      // forth over a tile's edge does not rebuild it.
      for (const tile of tiles.values()) {
        tile.unwanted = wantedSet.has(tile.key) ? 0 : tile.unwanted + dt;
        if (tile.unwanted > 2) retire(tile);
      }

      // Build, nearest first, under the frame's allowance.
      const buildBegan = performance.now();
      for (const key of wanted) {
        if (!mayBuild(buildBegan, BUILD_SHARE, true)) break;
        const tile = tiles.get(key);
        if (tile === undefined || tile.state !== 'building') continue;
        if (stepTile(tile, buildBegan + BUILD_SHARE)) stand(tile);
      }
      buildMs = performance.now() - buildBegan;

      // The window: as wide as the tiles standing let it be.
      playerPoint.copy(frame.player).setLength(PLANET_RADIUS);
      let target = active ? WINDOW : 0;
      if (target > 0) {
        for (const key of wanted) {
          const tile = tiles.get(key);
          if (tile === undefined || tile.state !== 'building') continue;
          const clear = tile.centre.distanceTo(playerPoint) - tile.reach;
          if (clear < target) target = Math.max(0, clear);
        }
        if (target < WINDOW_MIN) target = 0;
      }
      // In at once, out gradually, so a tile arriving does not snap the edge.
      windowRadius = target < windowRadius ? target : windowRadius + (target - windowRadius) * Math.min(1, dt * 1.5);
      if (windowRadius < WINDOW_MIN) windowRadius = target < WINDOW_MIN ? 0 : windowRadius;
      seaWindow.uSeaCentre.value.copy(playerPoint);
      seaWindow.uSeaRadius.value = windowRadius;
      seaWindow.uSeaBand.value = BAND;
      waterUniforms.uClearFrom.value = windowRadius * CLEAR_FROM;
      waterUniforms.uClearTo.value = windowRadius * CLEAR_TO;
      const over = Math.max(0, cameraRadius - PLANET_RADIUS);
      waterUniforms.uClarity.value = 1 - smoothstep(CLEAR_HIGH_FROM, CLEAR_HIGH_TO, over);
      const shown = windowRadius > 0 || underwater;
      floorMesh.visible = shown;
      decorMesh.visible = shown;
      waterMesh.visible = windowRadius > 0;
      // From above they fade with height: a swimmer sees the light on the
      // sand, the plane going over does not see a net over the whole reef.
      floorUniforms.uCaustic.value = clamp(frame.daylight, 0, 1) * (underwater ? 1.2 : 1 - 0.85 * smoothstep(CAUSTIC_HIGH_FROM, CAUSTIC_HIGH_TO, over));
      floorUniforms.uAbove.value = underwater ? 0 : 1;

      // Under the surface: the water's haze and the backdrop that closes it.
      backdrop.visible = underwater;
      if (underwater) {
        unit.copy(frame.camera).normalize();
        coastAt(unit.x, unit.y, unit.z, SEA_REACH, sample);
        const warm = seaZoneAt(latOf(unit.y), sample.lake) === 'reef' ? 1 : 0.35;
        const light = 0.18 + 0.82 * clamp(frame.daylight, 0, 1);
        underColour.copy(COLD_UNDER).lerp(WARM_UNDER, warm).multiplyScalar(light * Math.exp(-cameraDepth / 70));
        frame.fog.color.copy(underColour);
        frame.fog.near = UNDER_NEAR;
        frame.fog.far = UNDER_FAR;
        backdrop.position.copy(frame.camera);
        backdropUp.copy(unit);
        quaternion.setFromUnitVectors(Y, backdropUp);
        backdrop.quaternion.copy(quaternion);
        deepColour.copy(underColour).multiplyScalar(0.35);
        lightColour.copy(underColour).lerp(waterUniforms.uUnder.value, 0.55 * light * Math.exp(-cameraDepth / 25));
        const positions = backdropGeometry.getAttribute('position');
        for (let v = 0; v < positions.count; v++) {
          const y = positions.getY(v) / BACKDROP_RADIUS;
          if (y >= 0) colour.copy(underColour).lerp(lightColour, smoothstep(0, 1, y));
          else colour.copy(underColour).lerp(deepColour, smoothstep(0, 1, -y));
          backdropColour[v * 3] = colour.r;
          backdropColour[v * 3 + 1] = colour.g;
          backdropColour[v * 3 + 2] = colour.b;
        }
        (backdropGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      }

      let standing = 0;
      let building = 0;
      let skipped = 0;
      let decor = 0;
      for (const tile of tiles.values()) {
        if (tile.state === 'ready') {
          standing++;
          decor += tile.lived?.decor.length ?? 0;
        } else if (tile.state === 'building') building++;
        else skipped++;
      }
      stats.underwater = underwater;
      stats.window = Math.round(windowRadius);
      stats.tiles = standing;
      stats.building = building;
      stats.skipped = skipped;
      stats.decor = decor;
      stats.triangles = standing * TILE_QUADS * TILE_QUADS * 4 + Math.round(decor * 24);
      stats.cameraDepth = Number(cameraDepth.toFixed(2));
      stats.buildMs = Number(buildMs.toFixed(2));
      stats.updateMs = performance.now() - began;
    },
    floorAt(point) {
      if (!prepared) {
        prepareSeaFloor(world);
        prepared = true;
      }
      return PLANET_RADIUS - seaDepthAt(point);
    },
    eachLife(visit) {
      for (const tile of tiles.values()) if (tile.state === 'ready' && tile.lived !== null) visit(tile.lived);
    },
    proxies() {
      return [proxyOf(floorMesh.material as THREE.Material), proxyOf(decorMesh.material as THREE.Material), proxyOf(waterMesh.material as THREE.Material)];
    },
  };

  /** Whether the water surface is over this point rather than land. */
  function isWaterUnder(point: THREE.Vector3): boolean {
    unit.copy(point).normalize();
    return world.elevationAt(unit.multiplyScalar(PLANET_RADIUS)) <= 0.5;
  }

  return sea;
}
