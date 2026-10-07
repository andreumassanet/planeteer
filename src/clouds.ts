import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { fbm } from './terrain.ts';
import { createToonRamp } from './theme.ts';
import { sunUniform } from './sun.ts';
import { latOf, unitAt } from './sphere.ts';
import { weatherHazeAt } from './view.ts';
import {
  CLOUD_MAP_HEIGHT,
  CLOUD_MAP_WIDTH,
  cloudMapByte,
  cloudShade,
  rayToDeck,
  setCloudMap,
  shadeCover,
  shadeDarkness,
  shadeGate,
  updateCloudShade,
} from './cloud-shade.ts';

/**
 * The weather, as a sky of painted cumulus.
 *
 * **A bank is a heap of puffs, not a shell.** The deck was a prism shell cut out
 * of a geodesic sphere — flat tops, vertical walls — which read as a cloud only
 * with the ink round it; without the pen it was beige faceted slabs. What a
 * painted cumulus is made of is lobes: round, soft-edged, a bright crown and a
 * cool flat belly. So every bank of the coverage field is filled with
 * flattened-bottomed spheres, big and stacked where the bank is deep and small
 * at its rim, drawn instanced from three shared icospheres.
 *
 * **The field is the same field.** `coverageAt`, `THRESHOLD`, `DEPTH_SPAN` and
 * `deckTurn` are untouched, and a puff is seeded only on a kept cell of the
 * `DETAIL` lattice the prism shell was cut from, laid so that every kept cell's
 * centre is under a puff (see `SPACING`). What that leaves is the rim between
 * cell centres: of 20,000 directions spread over the sphere (2026-09-28), 4,574
 * of the 4,591 where it can rain (depth 0.12 and up) are under a puff, the
 * deepest miss at a depth of 0.24, and weighted by how hard it rains there the
 * misses are 0.012% of the rain. 7% of the open sky is under a puff's rim.
 *
 * **It is built once, for the whole planet, and drawn at four levels.** A puff
 * is 180 triangles inside `NEAR_RANGE`, 80 to `MID_RANGE` and 20 to
 * `SPLIT_RANGE`, all three sharing a sub-chunk's instance buffers; past that a
 * base chunk is one draw of its own far set (`FAR_LEAST`). Measured headless
 * on 2026-09-28: 90,514 cells kept of 327,680; 51,474 puffs (38,065 of them a
 * heap's bottom tier) and 18,311 in the far set; 5.1 MB of instance data
 * against the prism shell's 17.1; built in 0.37 to 0.42 s against its 0.4;
 * 1,244 meshes, most of them off in any frame. Drawn, after the frustum, over
 * twelve views at each height: 99 k triangles in 23 calls standing on the
 * ground (the shell: 47,620), 150 k in 63 calls from 1,500 up, 216 k in 80
 * from 8,000, and 298 k in 16 from the ceiling (the shell: 226,888 in 19).
 * `stats.drawn` is the same count before the frustum; picking the levels is
 * under a third of a millisecond.
 *
 * **There is no pen on it.** A soft edge is the opposite of an ink line, and a
 * puff's hull would have to apply the instance matrix *and* the squash, which
 * `outline.ts`'s transform hook does in the wrong order for an instanced mesh.
 * The deck opts out (`visible: false`) even when `atlas.ink(true)` inks the rest.
 *
 * **Three of its uniforms ride the camera's distance to the deck**: the haze
 * it takes (`hazeAt`), how much of its own shape is allowed to shade it
 * (`flattenAt`) and how much of its own height it keeps (`squashAt`). A fourth,
 * the width of the soft edge, rides the flatten.
 *
 * **And it casts a shade, from the same field.** The ground under a bank is
 * darker where the bank's shadow falls — along the ray to the sun, as far as
 * the deck's sphere — and the shadow drifts with it: `createCloudBake` writes
 * `coverageAt` once into a texture in the deck's own frame, `update` bakes it a
 * slice a frame and hands the shaders the turn, and `cloud-shade.ts` draws it
 * on every surface the sun lights. `cloudShadeAt` is the same shade on the
 * exact field, for the checks and the weather's readout. `atlas.clouds.shadows`
 * is its A/B.
 */

/**
 * Base of the deck.
 *
 * **The altitude is not free: it is the size of a cloud against how big it
 * should look.** How big a cloud looks from underneath is `width / altitude`,
 * so a cumulus about 45 degrees across wants about 800 units of bank at a
 * thousand up. The other end of the clamp is orbit. The deck is drawn on a
 * sphere of `PLANET_RADIUS + this`, so from the plane's ceiling it stands proud
 * of the limb by exactly its own fraction of the radius — at 2,600 that is a
 * 16% halo, a ring of weather floating clear of the planet. Under about a
 * fifteenth of the radius it reads as an atmosphere instead.
 */
export const CLOUD_BASE = 1000;
/** How far the base wanders. Cumulus bases are flat, so this is gentle. */
const BASE_SWING = 260;

/**
 * How far the belly of a bank's rim is lifted over the belly of its heart, so a
 * bank hangs lowest in the middle — thin and high at the edge. From underneath,
 * which is where you spend most of your time, that is what gives the bottom of
 * the deck a shape.
 */
const RIM_LIFT = 95;

/**
 * How finely the field is sampled: 20 * 4^DETAIL cells, 327,680 at 7, a cell
 * 99 units across. The cells are what decides *where* cloud is — a puff is
 * seeded on a kept cell and nowhere else — so this is the resolution of the
 * weather's agreement with the sky, and it is the prism shell's own.
 */
const DETAIL = 7;

/**
 * Wavelengths, in world units, that the field is built from. Every frequency
 * below is `PLANET_RADIUS / wavelength`, because a direction is a unit vector
 * and the noise lattice lives in that space: dividing here is the only place
 * this file has to think about it.
 */
const WEATHER_SPAN = 900;
const WARP_SPAN = 7000;
const BASE_SPAN = 5200;

const WEATHER_FREQUENCY = PLANET_RADIUS / WEATHER_SPAN;
const WARP_FREQUENCY = PLANET_RADIUS / WARP_SPAN;
const BASE_FREQUENCY = PLANET_RADIUS / BASE_SPAN;

/** How far the warp drags the weather field. In units of the weather lattice. */
const WARP_STRENGTH = 0.55;

/**
 * Where the cut falls, and how much the latitude moves it.
 *
 * A single global threshold gives even coverage, which is the one thing the
 * Earth's cloud does not have: from orbit the planet is a wet band at the
 * equator, two clear belts over the deserts, and a stormy ring around each
 * mid-latitude. That is three cells of circulation and it is a cosine —
 * `cos(lat * pi / 27.5)` is +1 at the equator, -1 at 27.5, +1 at 55 — so the
 * whole of it costs one term and no table. It is a bias and not a rule: at
 * `CLIMATE_BIAS` the noise still decides, so the belts are where the weather is
 * likelier rather than where it is drawn.
 */
export const THRESHOLD = 0.575;
/**
 * How far past the cut a bank reaches its full depth, in the field's units.
 * How big a puff is, how high a heap stacks, how low its belly hangs and — in
 * `weather.ts` — how hard it rains all ride `(coverage - THRESHOLD) /
 * DEPTH_SPAN`, so the tallest cloud in the sky is the one raining on you.
 */
export const DEPTH_SPAN = 0.16;
const CLIMATE_BIAS = 0.042;
const CLIMATE_PERIOD = 27.5;

/**
 * The wind, as one rotation of the whole field.
 *
 * A rigid turn about a tilted axis is the entire model, and it is worth what it
 * costs (nothing): the field is a pure function of direction, so drifting it
 * means turning the group rather than rebuilding anything. The period is not 24
 * hours on purpose — locked to the day, the same cloud would sit over the same
 * coast at the same hour forever.
 */
const WIND_PERIOD_HOURS = 19;
const WIND_TILT = 17 * (Math.PI / 180);
/** The axis the deck turns about, in world space. */
export const DECK_AXIS = new THREE.Vector3(Math.sin(WIND_TILT), Math.cos(WIND_TILT), 0).normalize();
const DECK_PERIOD_MS = WIND_PERIOD_HOURS * 3600000;

/**
 * The deck's turn at an instant: an absolute angle, so the deck — and the
 * weather `weather.ts` reads off it — is a pure function of the clock.
 */
export function deckTurn(timeMs: number, target: THREE.Quaternion): THREE.Quaternion {
  const phase = ((timeMs % DECK_PERIOD_MS) + DECK_PERIOD_MS) % DECK_PERIOD_MS;
  return target.setFromAxisAngle(DECK_AXIS, (phase / DECK_PERIOD_MS) * Math.PI * 2);
}

/**
 * How big a puff is, horizontally: `PUFF_RIM` at a bank's edge, `PUFF_HEART`
 * where it is deepest, each varied by `PUFF_JITTER` either way. The rim's is
 * set by the lattice — a puff there must still reach over its own 99-unit cell
 * — and the heart's by the look from the ground: at a thousand units up a
 * 300-unit lobe is 33 degrees of sky, which is a cumulus and not a pebble.
 */
const PUFF_RIM = 85;
const PUFF_HEART = 300;
const PUFF_JITTER = 0.22;
/** How tall a puff is against how wide, at the rim and at the heart. */
const TALL_RIM = 0.6;
const TALL_HEART = 0.95;
/**
 * How much of its lower half a puff keeps: the belly is the sphere's bottom
 * squashed to this, so a bank's floor is nearly flat — the flat base a cumulus
 * has — and a heap stands on it rather than on a ball.
 */
const BELLY = 0.3;
/**
 * The second and third tiers of a heap: where the bank is deeper than these a
 * smaller puff is stacked on the one below, leant toward the bank's heart, so
 * the middle of a bank towers and its rim is one low row.
 */
const CROWN_FROM = 0.35;
const TOWER_FROM = 0.72;

/**
 * How close two puffs may seed, and it is what makes the sky and the weather
 * agree. Cells are taken deepest first and a cell is refused a puff of its own
 * when it is nearer an accepted puff's centre than `SPACING` of the smaller of
 * the two radii, or `COVERED` of the accepted one's. Either way a refused cell
 * lies inside an accepted puff's footprint at no more than 85% of its radius —
 * so every kept cell is under a drawn puff.
 */
const SPACING = 0.85;
const COVERED = 0.7;
/** The hash grid those tests run on: at least the largest refusal distance. */
const SEED_GRID = 320;

/**
 * How a heap shades as one soft mass rather than a pile of balls. The upper
 * half of each puff's normal is bent toward the normal of a dome under it —
 * `HEAP_DROP` radii below the centre — and toward the slope of the bank there,
 * leaning out toward the bank's rim by `LEAN_RIM` at the edge and `LEAN_HEART`
 * in the middle: the crease where two lobes meet then falls between two
 * normals that nearly agree.
 */
const HEAP_DROP = 1.3;
const HEAP_BLEND = 0.55;
const LEAN_RIM = 0.85;
const LEAN_HEART = 0.15;

/**
 * The levels a puff is drawn at, as `IcosahedronGeometry` details (180, 80 and
 * 20 triangles), and where they change. A level is chosen a sub-chunk at a
 * time on the nearest point of its cap (`Cap`): near inside `NEAR_RANGE`, the
 * middle out to `MID_RANGE`, the far shape out to `SPLIT_RANGE`. Past that a
 * whole base chunk is one draw of its own far set — see `FAR_LEAST` — so the
 * planet from the ceiling is at most 20 draw calls.
 */
const NEAR_DETAIL = 2;
const MID_DETAIL = 1;
const FAR_DETAIL = 0;
const NEAR_RANGE = 2600;
const MID_RANGE = 6000;
const SPLIT_RANGE = 11000;
/** The sub-chunks the near levels are culled and chosen by: DETAIL-3 faces, 64 a base face, ~2,300 units across. */
const SUB_LEVEL = 3;
/**
 * The smallest puff of the far set. From past `SPLIT_RANGE` a rim puff of 85
 * units is a few pixels and there are tens of thousands of them, so the far
 * set is seeded again over the same cells with no puff under this: a bank is
 * the same bank, a little fuller at its rim, from a fraction of the puffs.
 * By then the squash has taken most of the height, which is what hides the
 * crowns it leaves out.
 */
const FAR_LEAST = 210;

/**
 * The soft edge: how far a face must turn from the eye before it is drawn
 * whole. It is alpha to coverage — the multisampled target's own dither — so it
 * writes depth where it is drawn, needs no sort, and has no hull to show
 * through. Wider near, where a puff is big enough to have a soft rim; narrower
 * at range, where a puff is a few pixels and a wide fade is a hole.
 */
const EDGE_NEAR = 0.5;
const EDGE_FAR = 0.22;

/**
 * The paint: a warm crown where a lobe faces the sky, a cool blue belly where
 * it faces the ground (darker under a deep bank), a little light of its own —
 * the sky's colour — because a lit cloud is the brightest thing in a landscape,
 * and the sun's own colour on the rim: a little where the rim faces the sun,
 * and a lot when the sun is behind the cloud, which is the silver lining and
 * is past `post.ts`'s bloom threshold on purpose.
 */
const CROWN_TINT = [1.04, 1.01, 0.95] as const;
const BELLY_TINT = [0.7, 0.77, 0.92] as const;
const BELLY_DEEP = 0.22;
const SELF_LIGHT = 0.12;
const RIM_POWER = 3;
const RIM_SIDE = 0.35;
const RIM_BACK = 1.6;
const BACK_POWER = 6;
const SCATTER = 0.3;

/**
 * How much of the deck's own height survives at range, and **the limb is the
 * only place it matters.** The limb is the one place the deck is seen edge-on,
 * so the outer edge of the ring is the tallest top along a chord crossing
 * dozens of heaps, and its wobble against black space reads as a crust. So the
 * height is compressed toward the deck's own mean base, in the vertex shader,
 * after the instance matrix, on the distance to the deck. **What it must not do
 * is move the base**, which is why it compresses toward a reference radius
 * rather than scaling the group: scaling takes the whole deck down toward the
 * ground and slides it through the mountains on the way up.
 *
 * `mix(1.0, ..., 0.0)` is exactly 1.0, so at zero squash this multiplies every
 * vertex by one and the near view is untouched.
 */
const SQUASH_REFERENCE = PLANET_RADIUS + CLOUD_BASE;
const SQUASH_KEEP = 0.12;
const SQUASH_START_RANGE = 7000;
const SQUASH_FULL_RANGE = 13000;

const SQUASH_GLSL = /* glsl */ `uniform float squash;

vec3 atlasVertex( vec3 p ) {
  float r = length( p );
  return p * mix( 1.0, ( ${SQUASH_REFERENCE.toFixed(1)} + ( r - ${SQUASH_REFERENCE.toFixed(1)} ) * ${SQUASH_KEEP.toFixed(3)} ) / r, squash );
}`;

function squashAt(altitude: number): number {
  const range = Math.abs(altitude - CLOUD_BASE);
  return THREE.MathUtils.smoothstep(range, SQUASH_START_RANGE, SQUASH_FULL_RANGE);
}

/**
 * What a cloud on the night hemisphere is worth from orbit, as a fraction of
 * what it is worth on the day one. The night side carries the city lights and
 * the terminator, and a pale sheet over a quarter of it takes both away, so it
 * is pulled down toward the land it stands over — not off: a veil that hides
 * the lights under it is what weather at night does. It rides `orbitDim`, so it
 * does not exist standing on the ground. The two thresholds are `lights.ts`'s
 * own, to the digit, so the cloud dims on the terminator the windows come on at.
 */
const NIGHT_FLOOR = 0.34;

/** How much of its light the heart of a bank loses under a storm (`setGrey` at 1). */
const GREY_DEPTH = 0.58;

/**
 * How much of a cloud's own shape is allowed to shade it, and why it has to go
 * away at range: a small pale object with a lit side and a dark side is how you
 * draw a rock, and from the ceiling a puff is a few pixels. What a cloud reads
 * as from orbit is area and value, so the shading normal is bent toward the
 * local up with distance. It stops at `FLAT_MAX` rather than 1 because a wholly
 * flat deck shades its limb like its centre and the globe stops being a sphere.
 */
const FLAT_FULL_RANGE = 4000;
const FLAT_GONE_RANGE = 16000;
const FLAT_MAX = 0.9;

function flattenAt(altitude: number): number {
  const range = Math.abs(altitude - CLOUD_BASE);
  return FLAT_MAX * THREE.MathUtils.smoothstep(range, FLAT_FULL_RANGE, FLAT_GONE_RANGE);
}

export interface CloudStats {
  /** Cells of the lattice that came out cloudy, and the fraction they are. */
  cells: number;
  cover: number;
  /** Puffs in the deck, and how many of them are a heap's bottom tier (the far level's). */
  puffs: number;
  bottom: number;
  /** Puffs in the far set (`FAR_LEAST`). */
  farPuffs: number;
  /** Triangles if every puff were drawn at the near level, and the whole far set. */
  triangles: number;
  farTriangles: number;
  /** Triangles in the chunks the last update left on, before the frustum. */
  drawn: number;
  /** Instanced meshes in the deck, and how many the last update left on. */
  chunks: number;
  shown: number;
  megabytes: number;
  buildMs: number;
  /** Puffs whose matrix came out mirrored (determinant <= 0). Must be 0. */
  mirrored: number;
}

/**
 * Where the deck sits in the opaque list, and it is a number because something
 * has to be drawn *before* it.
 *
 * The frontiers in `borders.ts` are drawn with no depth test — nothing on the
 * ground may hide one from the air — so the only thing that decides what covers
 * them is the order. They take `CLOUD_ORDER - 1` and the deck takes this: the
 * land and the towns first, then the line over them, then the weather over the
 * line, depth-tested as it always was. Before this the frontier was drawn last
 * of all, as a transparent, and the dashes came out painted across the tops of
 * the clouds. It stays well under the sky dome's 1000, which is drawn last so
 * that only the sky left over is shaded.
 */
export const CLOUD_ORDER = 5;

export interface Clouds {
  group: THREE.Group;
  /**
   * Turns the deck into the wind, re-reaches its haze and picks each chunk's
   * level. Call once a frame, after `sky.update` has set the fog's colour and
   * `main.ts` its distances.
   */
  update(time: Date, cameraPosition: THREE.Vector3, fog: THREE.Fog): void;
  /**
   * How much of the deck you can see: 1 is the world's own solid deck, less is
   * a veil, and under a hundredth the group is not drawn at all.
   *
   * **For the start menu and nothing else**, which fades the deck out while you
   * choose a country and a town — a map you click on, where a cloud over
   * eastern Spain hid which coast Valencia's pin was on — and back in from
   * space. It is a material switch (transparent and one-sided) and so a
   * recompile, once, the first time it is asked for.
   */
  setVeil(opacity: number): void;
  /**
   * How much a bank's deep middle darkens, 0 to 1: the weather's say in how
   * the deck looks (`weather-view.ts`). 0 is the white deck; 1 is a storm's,
   * `GREY_DEPTH` darker at a bank's heart.
   */
  setGrey(value: number): void;
  /**
   * The deck's shade on the ground, 0 to 1: `atlas.clouds.shadows = 0` is the
   * world as it was before it — no shade, and the old cut of the whole
   * world's sun under a bank — and 1 the shade. For A/B, not a setting.
   */
  shadows: number;
  /** The shade's state: the bake's progress and cost, and the strength the shaders were handed. */
  readonly shade: { ready: boolean; rows: number; bakeMs: number; strength: number; share: number; weather: number };
  /**
   * The deck's shade at a world point, at the instant of the last `update`
   * and under its sun: `cloudShadeAt`, on the exact field and without the
   * strength. For the console and `pnpm graphics`' probe.
   */
  shadeAt(point: THREE.Vector3): CloudShadeSample;
  stats: CloudStats;
}

/**
 * How far into the haze a cloud is, and it is **not** the fog the land is in.
 *
 * `main.ts` closes the fog at about `1.35 * sqrt(2 R h)` — the distance to the
 * *land's* horizon — because that is the number that has to hide the edge of
 * the world. Standing on the ground that is 1,430 units, and a cloud 1,000
 * units overhead is 65% of the way into it: the entire deck comes out one flat
 * wash. Haze is a path length through air, and the path to something overhead
 * is the one direction that leaves the atmosphere immediately, which is why
 * the zenith is blue on the same afternoon the hills are grey.
 *
 * So the cloud is in the same haze, in the same colour, measured over the
 * horizon of *its own* sphere: `sqrt(2 R (h + CLOUD_BASE))`, times the same
 * `spread` that opens the fog as you climb. It closes with the weather's own
 * haze (`weatherHazeAt` in `view.ts`), so in a fog or a downpour the deck
 * overhead goes into the murk with the hills.
 */
function hazeAt(
  altitude: number,
  fog: THREE.Fog,
  haze: { color: { value: THREE.Color }; near: { value: number }; far: { value: number } },
): void {
  const above = Math.max(1, altitude);
  const horizon = Math.sqrt(2 * PLANET_RADIUS * (above + CLOUD_BASE));
  const far = horizon * (1.05 + (above / PLANET_RADIUS) * 6) * weatherHazeAt(altitude);
  haze.far.value = far;
  haze.near.value = far * 0.2;
  haze.color.value.copy(fog.color);
}

/**
 * A geodesic sphere, indexed, with the faces still grouped by the base face
 * they came out of, and each base face's descendants in subdivision order —
 * so a face's ancestor at any level is an integer division, which is how the
 * puffs are sorted into chunks and sub-chunks with no search.
 */
function icosphere(detail: number): {
  vertices: Float64Array;
  faces: Int32Array;
  /** Which of the 20 base faces each face descends from. */
  chunkOf: Int32Array;
} {
  const t = (1 + Math.sqrt(5)) / 2;
  const seed = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  // Wound counter-clockwise seen from outside, which is what makes a face's own
  // normal point away from the planet without anything having to check.
  const seedFaces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const count = 10 * 4 ** detail + 2;
  const vertices = new Float64Array(count * 3);
  let written = 0;
  for (const v of seed) {
    const length = Math.hypot(v[0]!, v[1]!, v[2]!);
    vertices[written * 3] = v[0]! / length;
    vertices[written * 3 + 1] = v[1]! / length;
    vertices[written * 3 + 2] = v[2]! / length;
    written++;
  }

  const midpoints = new Map<number, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? a * 1e6 + b : b * 1e6 + a;
    const found = midpoints.get(key);
    if (found !== undefined) return found;
    const x = vertices[a * 3]! + vertices[b * 3]!;
    const y = vertices[a * 3 + 1]! + vertices[b * 3 + 1]!;
    const z = vertices[a * 3 + 2]! + vertices[b * 3 + 2]!;
    const length = Math.hypot(x, y, z);
    const index = written++;
    vertices[index * 3] = x / length;
    vertices[index * 3 + 1] = y / length;
    vertices[index * 3 + 2] = z / length;
    midpoints.set(key, index);
    return index;
  };

  // Each base face is subdivided on its own so its descendants stay contiguous;
  // the midpoint cache is shared, so the seams still weld. A face's four
  // children are pushed together, so after L levels face k's descendants at
  // level L are 4^L k .. 4^L (k + 1) - 1 within the chunk.
  const perChunk = 4 ** detail;
  const faces = new Int32Array(20 * perChunk * 3);
  const chunkOf = new Int32Array(20 * perChunk);
  let out = 0;
  for (let base = 0; base < 20; base++) {
    let current = [seedFaces[base]!.slice()];
    for (let level = 0; level < detail; level++) {
      const next: number[][] = [];
      for (const [a, b, c] of current) {
        const ab = midpoint(a!, b!);
        const bc = midpoint(b!, c!);
        const ca = midpoint(c!, a!);
        next.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]);
      }
      current = next;
    }
    for (const face of current) {
      faces[out * 3] = face[0]!;
      faces[out * 3 + 1] = face[1]!;
      faces[out * 3 + 2] = face[2]!;
      chunkOf[out] = base;
      out++;
    }
  }
  return { vertices, faces, chunkOf };
}

/**
 * How cloudy this direction is, before the cut.
 *
 * Two things beyond plain noise, and both are there to stop the field reading
 * as noise. The domain warp is what turns blobs into fronts and swirls, which
 * is what weather looks like from orbit and is one extra `fbm` at build time.
 * The climate term is the three-cell bias described at `CLIMATE_BIAS`.
 */
export function coverageAt(x: number, y: number, z: number): number {
  const warpX = fbm(x * WARP_FREQUENCY + 19.7, y * WARP_FREQUENCY - 4.3, z * WARP_FREQUENCY + 31.1, 2);
  const warpY = fbm(x * WARP_FREQUENCY - 12.9, y * WARP_FREQUENCY + 27.5, z * WARP_FREQUENCY - 8.7, 2);
  const warpZ = fbm(x * WARP_FREQUENCY + 5.1, y * WARP_FREQUENCY + 14.2, z * WARP_FREQUENCY + 23.9, 2);
  const raw = fbm(
    x * WEATHER_FREQUENCY + (warpX - 0.5) * 2 * WARP_STRENGTH + 101.3,
    y * WEATHER_FREQUENCY + (warpY - 0.5) * 2 * WARP_STRENGTH - 57.9,
    z * WEATHER_FREQUENCY + (warpZ - 0.5) * 2 * WARP_STRENGTH + 8.4,
    4,
  );
  const lat = latOf(y);
  return raw + CLIMATE_BIAS * Math.cos((lat * Math.PI) / CLIMATE_PERIOD);
}

// ---------------------------------------------------------------------------
// The shade on the ground
// ---------------------------------------------------------------------------

/**
 * Milliseconds of a frame the bake may take, and it is `FLAG_BUILD_MS`'s four
 * for the same reason (`main.ts`): the whole bake is 0.6 s of `coverageAt`,
 * 2 M texels at 0.3 us, which in one piece is a stutter and at four
 * milliseconds a frame is 150 frames nobody sees. They are the menu's frames
 * as a rule — the deck is built at 'setting the weather' and the menu opens
 * right after, over seconds of the world building underneath it — so the
 * shade is there by the time anybody lands.
 */
const BAKE_MS = 4;
/** The frame the budget is a share of, and the most one call may take however late it was called. */
const BAKE_FRAME_MS = 1000 / 60;
const BAKE_CATCH_UP_CAP = 2 * BAKE_FRAME_MS;

export interface CloudBake {
  /**
   * Bakes rows for about `budgetMs`, and true once every row is done. The
   * budget is a share of a frame, not a sum: called late — a slow machine, a
   * throttled tab, a software renderer drawing a frame a second — it takes
   * the share of the gap since the last call, up to two frames, as the flag
   * layer's build does (`land-flags.ts`, `CATCH_UP_CAP`), or a bake that needs
   * 150 calls would take minutes to arrive. `Infinity` bakes the rest at once.
   */
  step(budgetMs: number): boolean;
  readonly done: boolean;
  /** Rows written, of `CLOUD_MAP_HEIGHT`, and the milliseconds they took. */
  readonly rows: number;
  readonly ms: number;
  /** The map: a byte a texel (`cloudMapByte`), row 0 at the south pole. */
  readonly data: Uint8Array;
}

/**
 * The field written into a texture in the deck's own frame: longitude across,
 * latitude up, a texel's centre each (`cloudMapUV` is the lookup). Never
 * stale: the deck is a rigid turn of it, which the shader undoes.
 */
export function createCloudBake(): CloudBake {
  const data = new Uint8Array(CLOUD_MAP_WIDTH * CLOUD_MAP_HEIGHT);
  // Each column's longitude as the unit vector on the equator, and each row's
  // latitude as its ring's radius and height: a texel is then two multiplies
  // and the field, and the conversion is `sphere.ts`'s.
  const columns = new Float64Array(CLOUD_MAP_WIDTH * 2);
  const unit = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < CLOUD_MAP_WIDTH; i++) {
    unitAt(0, -180 + ((i + 0.5) * 360) / CLOUD_MAP_WIDTH, unit);
    columns[i * 2] = unit.x;
    columns[i * 2 + 1] = unit.z;
  }
  let rows = 0;
  let ms = 0;
  let handedBack = 0;
  const row = (j: number): void => {
    unitAt(-90 + ((j + 0.5) * 180) / CLOUD_MAP_HEIGHT, 0, unit);
    const ring = unit.x;
    const y = unit.y;
    const at = j * CLOUD_MAP_WIDTH;
    for (let i = 0; i < CLOUD_MAP_WIDTH; i++) {
      data[at + i] = cloudMapByte(coverageAt(ring * columns[i * 2]!, y, ring * columns[i * 2 + 1]!));
    }
  };
  return {
    data,
    get done() {
      return rows >= CLOUD_MAP_HEIGHT;
    },
    get rows() {
      return rows;
    },
    get ms() {
      return ms;
    },
    step(budgetMs: number): boolean {
      if (rows >= CLOUD_MAP_HEIGHT) return true;
      const began = performance.now();
      const gap = handedBack === 0 ? BAKE_FRAME_MS : began - handedBack;
      const allowance = budgetMs === Infinity
        ? Infinity
        : Math.min(BAKE_CATCH_UP_CAP, Math.max(budgetMs, (budgetMs * gap) / BAKE_FRAME_MS));
      // Checked after each row, so a call may pass its allowance by one row:
      // 2,048 texels, about 0.6 ms.
      while (rows < CLOUD_MAP_HEIGHT) {
        row(rows++);
        if (performance.now() - began >= allowance) break;
      }
      ms += performance.now() - began;
      handedBack = performance.now();
      return rows >= CLOUD_MAP_HEIGHT;
    },
  };
}

/** The whole map at once, for the checks: `createCloudBake` run to the end. */
export function bakeCloudMap(): Uint8Array {
  const bake = createCloudBake();
  bake.step(Infinity);
  return bake.data;
}

/** The shade at a point, as `cloudShadeAt` reports it. */
export interface CloudShadeSample {
  /** How much of a bank is between the point and the sun, 0 to 1, the gates included. */
  cover: number;
  /** How deep into that bank, 0 at its edge to 1 at its heart. */
  depth: number;
  /** The share of the sun's term the cloud takes there: `cover` times the darkness at `depth`. */
  shade: number;
}

const shadeHit = new THREE.Vector3();
const shadeTurn = new THREE.Quaternion();

/**
 * The shade the shaders draw, on the exact field rather than the bake: the
 * ray from `point` to the sun (`sun`, a unit vector) as far as the deck's
 * sphere, turned back through the deck's turn at `timeMs` — `weatherAt`'s
 * convention — and the field there through the soft edge. The strength the
 * shaders are handed (the switch, the fade, the veil) is not in it; it is the
 * deck's, the same for every client at the same instant.
 */
export function cloudShadeAt(
  point: THREE.Vector3,
  sun: THREE.Vector3,
  timeMs: number,
  out: CloudShadeSample = { cover: 0, depth: 0, shade: 0 },
): CloudShadeSample {
  out.cover = 0;
  out.depth = 0;
  out.shade = 0;
  const r = point.length();
  const gate = r > 0 ? shadeGate(r, point.dot(sun) / r, PLANET_RADIUS) : 0;
  if (gate <= 0) return out;
  const t = rayToDeck(point, sun, PLANET_RADIUS + CLOUD_BASE);
  shadeHit.copy(point).addScaledVector(sun, t).normalize().applyQuaternion(deckTurn(timeMs, shadeTurn).invert());
  const field = coverageAt(shadeHit.x, shadeHit.y, shadeHit.z);
  out.cover = shadeCover(field, THRESHOLD) * gate;
  out.depth = Math.min(1, Math.max(0, (field - THRESHOLD) / DEPTH_SPAN));
  out.shade = out.cover * shadeDarkness(out.depth);
  return out;
}

/** A deterministic [0, 1) from an integer and a salt: the jitter every client agrees on. */
function hash01(n: number, salt: number): number {
  let h = Math.imul(n ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The puff all the others are instances of: an icosphere turned so a vertex is
 * at the top (a round crown, not a ridge), its lower half squashed to `BELLY`,
 * and the ellipsoid's own normals — smooth, never per face, because a lobe is
 * a gradient and not a facet.
 */
function puffGeometry(detail: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.rotateX(-Math.atan((1 + Math.sqrt(5)) / 2));
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = new Float32Array(position.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const below = y < 0;
    // The gradient of x^2 + (y/B)^2 + z^2 at (x, B y, z) is (x, y/B, z).
    n.set(x, below ? y / BELLY : y, z).normalize();
    if (below) position.setY(i, y * BELLY);
    normals[i * 3] = n.x;
    normals[i * 3 + 1] = n.y;
    normals[i * 3 + 2] = n.z;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.deleteAttribute('uv');
  geometry.computeBoundingSphere();
  return geometry;
}

/** A puff shape with a chunk's instance attributes on it. */
function levelOf(
  template: THREE.BufferGeometry,
  deep: THREE.InstancedBufferAttribute,
  puff: THREE.InstancedBufferAttribute,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  // The same attribute objects as the template, so the GPU holds one copy of
  // each puff shape however many chunks draw it.
  geometry.setAttribute('position', template.getAttribute('position'));
  geometry.setAttribute('normal', template.getAttribute('normal'));
  geometry.setAttribute('deep', deep);
  geometry.setAttribute('puff', puff);
  geometry.boundingSphere = template.boundingSphere!.clone();
  return geometry;
}

/** One instanced draw of a chunk. */
function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.InstancedBufferAttribute,
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, 0);
  mesh.instanceMatrix = matrices;
  mesh.count = matrices.count;
  mesh.computeBoundingSphere();
  mesh.name = name;
  mesh.renderOrder = CLOUD_ORDER;
  mesh.visible = false;
  // It sits at the group's origin and never moves in it: the deck's turn is
  // the group's, and the world matrix is all this mesh needs each frame.
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Where a chunk's puffs are, as a cap of the deck: the direction of its middle,
 * the angle out to its furthest puff's edge, and the radii its puffs span. A
 * bounding sphere of a piece of shell cuts deep under it and puts the nearest
 * point thousands of units too close; a cap does not.
 */
interface Cap {
  direction: THREE.Vector3;
  angle: number;
  low: number;
  high: number;
}

function capOf(matrices: Float32Array): Cap {
  const direction = new THREE.Vector3();
  const count = matrices.length / 16;
  for (let i = 0; i < count; i++) {
    const x = matrices[i * 16 + 12]!;
    const y = matrices[i * 16 + 13]!;
    const z = matrices[i * 16 + 14]!;
    const r = Math.hypot(x, y, z);
    direction.x += x / r;
    direction.y += y / r;
    direction.z += z / r;
  }
  direction.normalize();
  let angle = 0;
  let low = Infinity;
  let high = 0;
  for (let i = 0; i < count; i++) {
    const e = i * 16;
    const x = matrices[e + 12]!;
    const y = matrices[e + 13]!;
    const z = matrices[e + 14]!;
    const r = Math.hypot(x, y, z);
    // The largest of the three scales bounds the puff whichever way it faces.
    const size = Math.max(
      Math.hypot(matrices[e]!, matrices[e + 1]!, matrices[e + 2]!),
      Math.hypot(matrices[e + 4]!, matrices[e + 5]!, matrices[e + 6]!),
      Math.hypot(matrices[e + 8]!, matrices[e + 9]!, matrices[e + 10]!),
    );
    const cos = (direction.x * x + direction.y * y + direction.z * z) / r;
    angle = Math.max(angle, Math.acos(Math.max(-1, Math.min(1, cos))) + size / r);
    low = Math.min(low, r - size);
    high = Math.max(high, r + size);
  }
  return { direction, angle, low, high };
}

/**
 * A sub-chunk: one mesh whose geometry is swapped between the three levels.
 * The three geometries share the puff shapes with every other sub-chunk and
 * the instance buffers with each other, so a swap moves no data.
 */
interface Sub {
  mesh: THREE.InstancedMesh;
  levels: [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry];
  cap: Cap;
}

interface Base {
  far: THREE.InstancedMesh | null;
  farCap: Cap | null;
  subs: Sub[];
  cap: Cap | null;
  split: boolean;
}

/** Puffs as they are written, before they are sorted into chunks. */
interface Batch {
  chunk: number[];
  tier: number[];
  matrix: number[];
  deep: number[];
  shade: number[];
}

const batch = (): Batch => ({ chunk: [], tier: [], matrix: [], deep: [], shade: [] });

/**
 * Builds the deck: the field on the lattice, the puffs seeded on it, and the
 * chunks they are drawn in.
 */
export function createClouds(): Clouds {
  const began = performance.now();
  const { vertices, faces, chunkOf } = icosphere(DETAIL);
  const vertexCount = vertices.length / 3;
  const faceCount = faces.length / 3;

  // Everything a vertex is worth, evaluated once: a vertex is shared by six
  // faces, and six answers where the lattice needs one is a disagreement.
  const cover = new Float32Array(vertexCount);
  const floor = new Float32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const x = vertices[i * 3]!;
    const y = vertices[i * 3 + 1]!;
    const z = vertices[i * 3 + 2]!;
    cover[i] = coverageAt(x, y, z);
    floor[i] =
      CLOUD_BASE +
      (fbm(x * BASE_FREQUENCY + 61.3, y * BASE_FREQUENCY + 2.7, z * BASE_FREQUENCY - 44.1, 2) - 0.5) * BASE_SWING;
  }

  // The kept cells: the face's own coverage is the mean of its corners, as the
  // prism shell cut it. Deepest first, a little shuffled so equal depths do not
  // seed in lattice order.
  const depthOf = new Float32Array(faceCount);
  const kept: number[] = [];
  for (let f = 0; f < faceCount; f++) {
    const mean = (cover[faces[f * 3]!]! + cover[faces[f * 3 + 1]!]! + cover[faces[f * 3 + 2]!]!) / 3;
    if (mean <= THRESHOLD) continue;
    depthOf[f] = Math.min(1, (mean - THRESHOLD) / DEPTH_SPAN);
    kept.push(f);
  }
  const cells = kept.length;
  const rank = new Float32Array(faceCount);
  for (const f of kept) rank[f] = depthOf[f]! + (hash01(f, 1) - 0.5) * 0.08;
  kept.sort((a, b) => rank[b]! - rank[a]!);

  const DECK = PLANET_RADIUS + CLOUD_BASE;
  const POLE = new THREE.Vector3(0, 1, 0);
  const SIDEWAYS = new THREE.Vector3(1, 0, 0);
  /** East and north at a direction, into the two targets. */
  const tangents = (at: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3): void => {
    east.crossVectors(POLE, at);
    if (east.lengthSq() < 1e-6) east.crossVectors(SIDEWAYS, at);
    east.normalize();
    north.crossVectors(at, east);
  };

  /**
   * Dart-throwing over the kept cells, deepest first: `visit` is called for
   * each cell that seeds a puff, with the puff's direction and radius. See
   * `SPACING` for why a refused cell is still under a puff. `least` is the
   * smallest radius a puff may have, which is how the far level seeds fewer,
   * bigger puffs over the same cells.
   */
  const seed = (least: number, visit: (f: number, direction: THREE.Vector3, a: number) => void): void => {
    const grid = new Map<number, number[]>();
    const cell = Math.max(SEED_GRID, least * SPACING);
    const keyOf = (gx: number, gy: number, gz: number): number => ((gx + 256) * 512 + (gy + 256)) * 512 + (gz + 256);
    const seedX: number[] = [];
    const seedY: number[] = [];
    const seedZ: number[] = [];
    const seedA: number[] = [];
    const direction = new THREE.Vector3();
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    for (const f of kept) {
      direction
        .fromArray(vertices, faces[f * 3]! * 3)
        .add(east.fromArray(vertices, faces[f * 3 + 1]! * 3))
        .add(north.fromArray(vertices, faces[f * 3 + 2]! * 3))
        .normalize();
      // A little off the lattice, inside the cell.
      tangents(direction, east, north);
      const jitter = 22 / DECK;
      direction
        .addScaledVector(east, (hash01(f, 2) - 0.5) * 2 * jitter)
        .addScaledVector(north, (hash01(f, 3) - 0.5) * 2 * jitter)
        .normalize();
      const depth = depthOf[f]!;
      const smooth = depth * depth * (3 - 2 * depth);
      const a = Math.max(
        least,
        (PUFF_RIM + (PUFF_HEART - PUFF_RIM) * smooth) * (1 + (hash01(f, 4) - 0.5) * 2 * PUFF_JITTER),
      );
      const x = direction.x * DECK;
      const y = direction.y * DECK;
      const z = direction.z * DECK;
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      const gz = Math.floor(z / cell);
      let refused = false;
      for (let dx = -1; dx <= 1 && !refused; dx++) {
        for (let dy = -1; dy <= 1 && !refused; dy++) {
          for (let dz = -1; dz <= 1 && !refused; dz++) {
            const list = grid.get(keyOf(gx + dx, gy + dy, gz + dz));
            if (list === undefined) continue;
            for (const j of list) {
              const other = seedA[j]!;
              const limit = Math.max(SPACING * Math.min(a, other), COVERED * other);
              const ex = seedX[j]! - x;
              const ey = seedY[j]! - y;
              const ez = seedZ[j]! - z;
              if (ex * ex + ey * ey + ez * ez < limit * limit) {
                refused = true;
                break;
              }
            }
          }
        }
      }
      if (refused) continue;
      const key = keyOf(gx, gy, gz);
      const list = grid.get(key);
      if (list === undefined) grid.set(key, [seedX.length]);
      else list.push(seedX.length);
      seedX.push(x);
      seedY.push(y);
      seedZ.push(z);
      seedA.push(a);
      visit(f, direction, a);
    }
  };

  let mirrored = 0;
  const matrix = new THREE.Matrix4();
  const puffUp = new THREE.Vector3();
  const puffEast = new THREE.Vector3();
  const puffNorth = new THREE.Vector3();
  const axisX = new THREE.Vector3();
  const axisY = new THREE.Vector3();
  const axisZ = new THREE.Vector3();
  const writePuff = (
    into: Batch,
    chunk: number,
    tier: number,
    at: THREE.Vector3,
    a: number,
    b: number,
    stretch: number,
    yaw: number,
    depth: number,
    lean: THREE.Vector3,
    lift: number,
  ): void => {
    puffUp.copy(at).normalize();
    tangents(puffUp, puffEast, puffNorth);
    axisX.copy(puffEast).multiplyScalar(Math.cos(yaw)).addScaledVector(puffNorth, Math.sin(yaw));
    // x cross y = z, so the basis is a rotation and the determinant is the
    // product of the scales.
    axisZ.crossVectors(axisX, puffUp);
    const leanX = lean.dot(axisX);
    const leanZ = lean.dot(axisZ);
    matrix.makeBasis(
      axisX.multiplyScalar(a),
      axisY.copy(puffUp).multiplyScalar(b),
      axisZ.multiplyScalar(a * stretch),
    );
    matrix.setPosition(at);
    if (matrix.determinant() <= 0) mirrored++;
    into.chunk.push(chunk);
    into.tier.push(tier);
    for (let k = 0; k < 16; k++) into.matrix.push(matrix.elements[k]!);
    into.deep.push(Math.round(depth * 255));
    // The lean in the puff's own frame, pre-scaled so that after the normal
    // matrix's inverse scale it is the world slope it was measured as.
    into.shade.push(leanX * (a / b), leanZ * ((a * stretch) / b), lift);
  };

  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const gradient = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lean = new THREE.Vector3();
  /** Which way the bank thins at a cell: down the coverage's gradient, linear on the triangle. */
  const leanOf = (f: number, up: THREE.Vector3, depth: number): THREE.Vector3 => {
    const ia = faces[f * 3]!;
    const ib = faces[f * 3 + 1]!;
    const ic = faces[f * 3 + 2]!;
    pa.fromArray(vertices, ia * 3);
    pb.fromArray(vertices, ib * 3);
    pc.fromArray(vertices, ic * 3);
    normal.subVectors(pb, pa).cross(side.subVectors(pc, pa)).normalize();
    // The gradient of a barycentric coordinate is the opposite edge turned a
    // quarter inward, over twice the area; the area is common and drops out.
    gradient.set(0, 0, 0);
    gradient.addScaledVector(side.subVectors(pc, pb).applyAxisAngle(normal, Math.PI / 2), cover[ia]!);
    gradient.addScaledVector(side.subVectors(pa, pc).applyAxisAngle(normal, Math.PI / 2), cover[ib]!);
    gradient.addScaledVector(side.subVectors(pb, pa).applyAxisAngle(normal, Math.PI / 2), cover[ic]!);
    gradient.addScaledVector(up, -gradient.dot(up));
    const slope = gradient.length();
    if (slope > 1e-9) lean.copy(gradient).multiplyScalar(-(LEAN_RIM + (LEAN_HEART - LEAN_RIM) * depth) / slope);
    else lean.set(0, 0, 0);
    return lean;
  };
  const floorAt = (f: number, depth: number): number =>
    (floor[faces[f * 3]!]! + floor[faces[f * 3 + 1]!]! + floor[faces[f * 3 + 2]!]!) / 3 + RIM_LIFT * (1 - depth);

  const subsPerBase = 4 ** SUB_LEVEL;
  const perBase = 4 ** DETAIL;
  const perSub = 4 ** (DETAIL - SUB_LEVEL);
  const centre = new THREE.Vector3();
  const heart = new THREE.Vector3();
  const across = new THREE.Vector3();

  // The deck as it is seen near: every tier, by sub-chunk.
  const fine = batch();
  seed(0, (f, up, a) => {
    const depth = depthOf[f]!;
    const smooth = depth * depth * (3 - 2 * depth);
    const leaning = leanOf(f, up, depth);
    const sub = chunkOf[f]! * subsPerBase + Math.floor((f - chunkOf[f]! * perBase) / perSub);
    const yaw = hash01(f, 5) * Math.PI * 2;
    const stretch = 1 + hash01(f, 6) * 0.3;

    // The bottom tier: its belly on the bank's floor.
    const b = a * (TALL_RIM + (TALL_HEART - TALL_RIM) * smooth);
    centre.copy(up).multiplyScalar(PLANET_RADIUS + floorAt(f, depth) + BELLY * b);
    writePuff(fine, sub, 0, centre, a, b, stretch, yaw, depth, leaning, 0);

    // The crown and the tower, each on the one below and leant toward the
    // bank's heart, so a heap climbs toward the middle.
    tangents(up, across, heart);
    if (leaning.lengthSq() > 0) heart.copy(leaning).normalize().negate();
    across.crossVectors(up, heart);
    let reach = a;
    let height = b;
    for (const [tier, from, shrink] of [
      [1, CROWN_FROM, 0.68],
      [2, TOWER_FROM, 0.7],
    ] as const) {
      if (depth <= from) break;
      const grow = (depth - from) / (1 - from);
      const a2 = reach * shrink * (0.8 + 0.2 * grow);
      const b2 = a2 * TALL_HEART;
      centre
        .addScaledVector(up, height * (0.55 + 0.15 * grow))
        .addScaledVector(heart, reach * 0.25)
        .addScaledVector(across, (hash01(f, 7 + tier) - 0.5) * reach * 0.3);
      writePuff(fine, sub, tier, centre, a2, b2, stretch, yaw + tier * 2.1, depth, leaning, tier / 2);
      reach = a2;
      height = b2;
    }
  });

  // The deck as it is seen from far off: fewer, bigger puffs over the same
  // cells, the bottom tier only, by base chunk. See `FAR_LEAST`.
  const coarse = batch();
  seed(FAR_LEAST, (f, up, a) => {
    const depth = depthOf[f]!;
    const smooth = depth * depth * (3 - 2 * depth);
    const b = a * (TALL_RIM + (TALL_HEART - TALL_RIM) * smooth);
    centre.copy(up).multiplyScalar(PLANET_RADIUS + floorAt(f, depth) + BELLY * b);
    const leaning = leanOf(f, up, depth);
    writePuff(coarse, chunkOf[f]!, 0, centre, a, b, 1 + hash01(f, 6) * 0.3, hash01(f, 5) * Math.PI * 2, depth, leaning, 0);
  });
  const puffs = fine.chunk.length;
  let bottom = 0;
  for (const tier of fine.tier) if (tier === 0) bottom++;
  const ramp = createToonRamp(4);
  const haze = { color: { value: new THREE.Color(0xc6b6cf) }, near: { value: 1200 }, far: { value: 6000 } };
  const flatten = { value: 0 };
  const orbitDim = { value: 0 };
  const squash = { value: 0 };
  const grey = { value: 0 };
  const edgeSoft = { value: EDGE_NEAR };
  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    gradientMap: ramp,
    // The inside is a surface too: flying into a puff is the white-out it
    // should be, not the puff vanishing at the near plane.
    side: THREE.DoubleSide,
    // The soft edge, as coverage: see `EDGE_NEAR`.
    alphaToCoverage: true,
    // And the scene's fog is off, which is the one thing here that looks like
    // ignoring the world and is the opposite. See `hazeAt`.
    fog: false,
  });
  material.userData.outlineParameters = { visible: false };
  const vec = (c: readonly number[]): string => `vec3(${c.map((v) => v.toFixed(3)).join(', ')})`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hazeColor = haze.color;
    shader.uniforms.hazeNear = haze.near;
    shader.uniforms.hazeFar = haze.far;
    shader.uniforms.flatten = flatten;
    shader.uniforms.orbitDim = orbitDim;
    shader.uniforms.atlasSun = sunUniform;
    shader.uniforms.squash = squash;
    shader.uniforms.cloudGrey = grey;
    shader.uniforms.edgeSoft = edgeSoft;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        SQUASH_GLSL +
          '\nattribute float deep;\nattribute vec3 puff;\nvarying float vDeep;\nvarying float vHaze;\nvarying float vPuffY;\nvarying float vLift;\nvarying vec3 vRadial;\nvarying vec3 vUp;\n' +
          'void main() {\n  vDeep = deep;\n  vPuffY = position.y;\n  vLift = puff.z;',
      )
      // See `HEAP_DROP`: the upper half of the puff's normal bent toward a dome
      // under it and the bank's slope, in the puff's own frame, before the
      // instance matrix takes it into the deck's.
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\n' +
          '\t{\n' +
          `\t\tvec3 atlasHeap = normalize( position + vec3( 0.0, ${HEAP_DROP.toFixed(2)}, 0.0 ) );\n` +
          '\t\tvec3 atlasMass = normalize( vec3( puff.x, 1.0, puff.y ) );\n' +
          `\t\tobjectNormal = normalize( mix( objectNormal, normalize( atlasHeap + atlasMass ), smoothstep( -0.2, 0.55, objectNormal.y ) * ${HEAP_BLEND.toFixed(2)} ) );\n` +
          '\t}',
      )
      // The instance matrix first and the squash after it, because the squash
      // is radial about the planet and a puff's own frame is not.
      .replace(
        '#include <project_vertex>',
        'vec4 atlasDeck = vec4( transformed, 1.0 );\n' +
          '#ifdef USE_INSTANCING\n\tatlasDeck = instanceMatrix * atlasDeck;\n#endif\n' +
          'atlasDeck.xyz = atlasVertex( atlasDeck.xyz );\n' +
          'vec4 mvPosition = modelViewMatrix * atlasDeck;\n' +
          'gl_Position = projectionMatrix * mvPosition;\n' +
          // The chunks sit at the group's origin, the planet's centre, so the
          // deck-frame position normalised is the local up.
          'vHaze = -mvPosition.z;\n' +
          'vRadial = normalize( normalMatrix * normalize( atlasDeck.xyz ) );\n' +
          'vUp = normalize( ( modelMatrix * atlasDeck ).xyz );',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 hazeColor;\nuniform float hazeNear;\nuniform float hazeFar;\nuniform float flatten;\nuniform float orbitDim;\nuniform float cloudGrey;\nuniform float edgeSoft;\nuniform vec3 atlasSun;\n' +
          'varying float vDeep;\nvarying float vHaze;\nvarying float vPuffY;\nvarying float vLift;\nvarying vec3 vRadial;\nvarying vec3 vUp;\nvoid main() {',
      )
      // See `flattenAt`. The sign keeps a belly a belly: blending every normal
      // to +up would light the underside of the deck as though it faced the sky.
      // The shape's own normal is kept for the soft edge, which is geometry.
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n\tvec3 atlasShape = normal;\n\tvec3 atlasUp = normalize(vRadial) * (dot(normal, normalize(vRadial)) < 0.0 ? -1.0 : 1.0);\n\tnormal = normalize(mix(normal, atlasUp, flatten));',
      )
      .replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\n' +
          '\t{\n' +
          '\t\tvec3 cloudView = normalize( vViewPosition );\n' +
          '\t\tfloat cloudFacing = abs( dot( normalize( atlasShape ), cloudView ) );\n' +
          // See `CROWN_TINT`: by facing, by height in the puff and by tier.
          '\t\tfloat cloudCrown = smoothstep( -0.45, 0.8, 0.6 * dot( normal, normalize( vRadial ) ) + 0.4 * vPuffY + 0.35 * vLift );\n' +
          `\t\tvec3 cloudBelly = ${vec(BELLY_TINT)} * ( 1.0 - ${BELLY_DEEP.toFixed(2)} * vDeep * ( 1.0 - vLift ) );\n` +
          `\t\tgl_FragColor.rgb *= mix( cloudBelly, ${vec(CROWN_TINT)}, cloudCrown );\n` +
          '\t\tvec3 cloudSky = vec3( 0.55, 0.68, 0.85 );\n' +
          '\t\t#if NUM_HEMI_LIGHTS > 0\n\t\t\tcloudSky = hemisphereLights[ 0 ].skyColor;\n\t\t#endif\n' +
          `\t\tgl_FragColor.rgb += diffuseColor.rgb * cloudSky * ${SELF_LIGHT.toFixed(2)} * mix( 0.6, 1.0, cloudCrown );\n` +
          // The sun is the first directional light: it casts the shadow and
          // three puts shadow casters first.
          '\t\t#if NUM_DIR_LIGHTS > 0\n' +
          '\t\t\tvec3 cloudToSun = directionalLights[ 0 ].direction;\n' +
          '\t\t\tvec3 cloudSun = directionalLights[ 0 ].color;\n' +
          `\t\t\tfloat cloudRim = pow( 1.0 - cloudFacing, ${RIM_POWER.toFixed(1)} );\n` +
          `\t\t\tfloat cloudBack = pow( max( dot( -cloudView, cloudToSun ), 0.0 ), ${BACK_POWER.toFixed(1)} );\n` +
          '\t\t\tfloat cloudThin = 1.0 - 0.6 * vDeep;\n' +
          `\t\t\tgl_FragColor.rgb += cloudSun * ( cloudRim * ( ${RIM_SIDE.toFixed(2)} * max( dot( normal, cloudToSun ), 0.0 ) + ${RIM_BACK.toFixed(2)} * cloudBack * cloudThin ) + ${SCATTER.toFixed(2)} * cloudBack * cloudThin * ( 1.0 - 0.5 * cloudFacing ) );\n` +
          '\t\t#endif\n' +
          '\t\tgl_FragColor.a *= smoothstep( 0.02, edgeSoft, cloudFacing );\n' +
          '\t}\n' +
          // See `NIGHT_FLOOR`: after the light and before the haze, so what is
          // dimmed is the cloud and not the air in front of it.
          '\tfloat atlasNightSide = 1.0 - smoothstep(-0.104528, 0.034899, dot(vUp, atlasSun));\n\tgl_FragColor.rgb *= mix(1.0, ' +
          NIGHT_FLOOR.toFixed(3) +
          ', atlasNightSide * orbitDim);' +
          // See `setGrey`: the deep middle of a bank goes the grey of a rain
          // cloud, and its rim stays white, so a storm is a dark heart in a
          // pale bank rather than a grey sky.
          `\n\tgl_FragColor.rgb *= 1.0 - cloudGrey * ${GREY_DEPTH.toFixed(2)} * smoothstep(0.2, 0.85, vDeep);`,
      )
      // Before tone mapping, so the blend happens in the same linear space the
      // light was accumulated in.
      .replace(
        '#include <tonemapping_fragment>',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, smoothstep(hazeNear, hazeFar, vHaze));\n\t#include <tonemapping_fragment>',
      );
  };

  const group = new THREE.Group();
  group.name = 'clouds';

  const nearShape = puffGeometry(NEAR_DETAIL);
  const midShape = puffGeometry(MID_DETAIL);
  const farShape = puffGeometry(FAR_DETAIL);
  const trianglesOf = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
  const nearTriangles = trianglesOf(nearShape);
  const midTriangles = trianglesOf(midShape);
  const farTriangles = trianglesOf(farShape);

  /** A batch counting-sorted into its chunks: one matrix, depth and shade array a chunk. */
  const sortInto = (
    from: Batch,
    chunks: number,
  ): { matrices: Float32Array; deep: Uint8Array; shade: Float32Array }[] => {
    const count = new Int32Array(chunks);
    for (const c of from.chunk) count[c]!++;
    const out = Array.from(count, (n) => ({
      matrices: new Float32Array(n * 16),
      deep: new Uint8Array(n),
      shade: new Float32Array(n * 3),
    }));
    const cursor = new Int32Array(chunks);
    for (let i = 0; i < from.chunk.length; i++) {
      const c = from.chunk[i]!;
      const k = cursor[c]!++;
      const into = out[c]!;
      for (let e = 0; e < 16; e++) into.matrices[k * 16 + e] = from.matrix[i * 16 + e]!;
      into.deep[k] = from.deep[i]!;
      for (let e = 0; e < 3; e++) into.shade[k * 3 + e] = from.shade[i * 3 + e]!;
    }
    return out;
  };
  const subData = sortInto(fine, 20 * subsPerBase);
  const baseData = sortInto(coarse, 20);

  let bytes = 0;
  const bases: Base[] = [];
  for (let c = 0; c < 20; c++) {
    const subs: Sub[] = [];
    const every: Float32Array[] = [];
    for (let s = c * subsPerBase; s < (c + 1) * subsPerBase; s++) {
      const data = subData[s]!;
      if (data.deep.length === 0) continue;
      const matrices = new THREE.InstancedBufferAttribute(data.matrices, 16);
      const deep = new THREE.InstancedBufferAttribute(data.deep, 1, true);
      const shade = new THREE.InstancedBufferAttribute(data.shade, 3);
      const levels: Sub['levels'] = [
        levelOf(nearShape, deep, shade),
        levelOf(midShape, deep, shade),
        levelOf(farShape, deep, shade),
      ];
      const mesh = instanced(levels[0], material, matrices, `clouds-${s}`);
      group.add(mesh);
      subs.push({ mesh, levels, cap: capOf(data.matrices) });
      every.push(data.matrices);
      bytes += data.matrices.byteLength + data.deep.byteLength + data.shade.byteLength;
    }
    const data = baseData[c]!;
    let far: THREE.InstancedMesh | null = null;
    if (data.deep.length > 0) {
      far = instanced(
        levelOf(
          farShape,
          new THREE.InstancedBufferAttribute(data.deep, 1, true),
          new THREE.InstancedBufferAttribute(data.shade, 3),
        ),
        material,
        new THREE.InstancedBufferAttribute(data.matrices, 16),
        `clouds-${c}-far`,
      );
      group.add(far);
      bytes += data.matrices.byteLength + data.deep.byteLength + data.shade.byteLength;
    }
    let all: Float32Array | null = null;
    if (every.length > 0) {
      all = new Float32Array(every.reduce((n, m) => n + m.length, 0));
      let at = 0;
      for (const m of every) {
        all.set(m, at);
        at += m.length;
      }
    }
    bases.push({
      far,
      farCap: far === null ? null : capOf(data.matrices),
      subs,
      cap: all === null ? null : capOf(all),
      split: true,
    });
  }

  if (mirrored > 0) {
    console.warn(`clouds: ${mirrored} puffs came out with a mirrored matrix`);
  }

  const stats: CloudStats = {
    cells,
    cover: Number((cells / faceCount).toFixed(3)),
    puffs,
    bottom,
    farPuffs: coarse.chunk.length,
    triangles: puffs * nearTriangles,
    farTriangles: coarse.chunk.length * farTriangles,
    drawn: 0,
    chunks: group.children.length,
    shown: 0,
    megabytes: Number((bytes / 1048576).toFixed(1)),
    buildMs: Math.round(performance.now() - began),
    mirrored,
  };

  const turn = new THREE.Quaternion();
  const eye = new THREE.Vector3();
  /** The shade's map, a slice a frame (`BAKE_MS`), the veil it follows and the instant it was last turned to. */
  const bake = createCloudBake();
  let veil = 1;
  let turnedAt = 0;

  /**
   * How far the eye is from the nearest point of a cap, and whether any of it
   * can be over the planet's horizon. The planet is the occluder, so the far
   * side of the world costs nothing from the ceiling and the deck past the
   * horizon nothing from the ground.
   */
  let eyeLength = 0;
  let eyeHorizon = 0;
  const angleTo = (cap: Cap): number =>
    Math.acos(Math.max(-1, Math.min(1, cap.direction.dot(eye) / eyeLength)));
  const distanceTo = (cap: Cap): number => {
    const off = Math.max(0, angleTo(cap) - cap.angle);
    const r = Math.max(cap.low, Math.min(cap.high, eyeLength));
    return Math.sqrt(Math.max(0, eyeLength * eyeLength + r * r - 2 * eyeLength * r * Math.cos(off)));
  };
  const overHorizon = (cap: Cap): boolean =>
    angleTo(cap) - cap.angle <= eyeHorizon + Math.acos(Math.min(1, PLANET_RADIUS / cap.high));

  const place = (cameraPosition: THREE.Vector3): void => {
    // The eye in the deck's own frame, where every cap was measured.
    eye.copy(cameraPosition).applyQuaternion(turn.copy(group.quaternion).invert());
    eyeLength = Math.max(1, eye.length());
    eyeHorizon = Math.acos(Math.min(1, PLANET_RADIUS / Math.max(PLANET_RADIUS + 1, eyeLength)));
    let drawn = 0;
    let shown = 0;
    for (const base of bases) {
      const split = base.cap !== null && distanceTo(base.cap) < SPLIT_RANGE;
      if (!split) {
        if (base.split) {
          for (const sub of base.subs) sub.mesh.visible = false;
          base.split = false;
        }
        if (base.far !== null) {
          base.far.visible = overHorizon(base.farCap!);
          if (base.far.visible) {
            drawn += base.far.count * farTriangles;
            shown++;
          }
        }
        continue;
      }
      base.split = true;
      if (base.far !== null) base.far.visible = false;
      for (const sub of base.subs) {
        const seen = overHorizon(sub.cap);
        sub.mesh.visible = seen;
        if (!seen) continue;
        const range = distanceTo(sub.cap);
        const level = range < NEAR_RANGE ? 0 : range < MID_RANGE ? 1 : 2;
        sub.mesh.geometry = sub.levels[level];
        drawn += sub.mesh.count * (level === 0 ? nearTriangles : level === 1 ? midTriangles : farTriangles);
        shown++;
      }
    }
    stats.drawn = drawn;
    stats.shown = shown;
  };

  return {
    group,
    stats,
    setGrey(value: number): void {
      grey.value = Math.max(0, Math.min(1, value));
    },
    get shadows(): number {
      return cloudShade.shadows;
    },
    set shadows(value: number) {
      cloudShade.shadows = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    },
    get shade() {
      return {
        ready: cloudShade.ready,
        rows: bake.rows,
        bakeMs: Math.round(bake.ms),
        strength: Number(cloudShade.strength.toFixed(3)),
        share: Number(cloudShade.share.toFixed(3)),
        weather: cloudShade.weather,
      };
    },
    shadeAt(point: THREE.Vector3): CloudShadeSample {
      return cloudShadeAt(point, sunUniform.value, turnedAt);
    },
    setVeil(opacity: number): void {
      // The shade goes with the deck it is the shadow of (`updateCloudShade`).
      veil = opacity;
      group.visible = opacity > 0.01;
      const veiled = opacity < 0.999;
      if (veiled !== material.transparent) {
        material.transparent = veiled;
        // A veil blends, so its soft edge is the alpha itself and not the
        // coverage; one side, because a see-through deck drawn double-sided
        // shows its own bellies through its own crowns. It keeps writing
        // depth, so a puff behind another is not blended over it.
        material.alphaToCoverage = !veiled;
        material.side = veiled ? THREE.FrontSide : THREE.DoubleSide;
        material.needsUpdate = true;
      }
      material.opacity = veiled ? Math.max(0, opacity) : 1;
    },
    update(time: Date, cameraPosition: THREE.Vector3, fog: THREE.Fog): void {
      // An absolute angle, not an increment: the deck is then a pure function
      // of the clock, so `atlas.sky.setTime` scrubs the weather with the sun
      // and `setRate(600)` runs a front past you in seconds.
      deckTurn(time.getTime(), group.quaternion);
      turnedAt = time.getTime();
      // The shade: its map a slice at a time until it is whole, then the same
      // turn undone for the shaders, and the sun `sky.update` has just set.
      if (!bake.done && bake.step(BAKE_MS)) {
        setCloudMap(bake.data, { planet: PLANET_RADIUS, base: CLOUD_BASE, threshold: THRESHOLD, depthSpan: DEPTH_SPAN });
      }
      cloudShade.rows = bake.rows;
      cloudShade.bakeMs = bake.ms;
      updateCloudShade(group.quaternion, sunUniform.value, cameraPosition, veil);
      const altitude = cameraPosition.length() - PLANET_RADIUS;
      hazeAt(altitude, fog, haze);
      flatten.value = flattenAt(altitude);
      orbitDim.value = flatten.value / FLAT_MAX;
      edgeSoft.value = EDGE_NEAR + (EDGE_FAR - EDGE_NEAR) * orbitDim.value;
      squash.value = squashAt(altitude);
      place(cameraPosition);
    },
  };
}
