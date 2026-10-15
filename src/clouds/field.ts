/** The cloud deck's constants, its turn with the wind, and the coverage field. */
import * as THREE from 'three';
import { PLANET_RADIUS, WORLD_SCALE } from '../globe.ts';
import { fbm } from '../terrain.ts';
import { latOf } from '../sphere.ts';

export const CLOUD_BASE = 1000;
/** How far the base wanders. Cumulus bases are flat, so this is gentle. */
export const BASE_SWING = 260;

/**
 * How far the belly of a bank's rim is lifted over the belly of its heart, so a
 * bank hangs lowest in the middle and is thin and high at the edge, which gives
 * the underside of the deck a shape.
 */
export const RIM_LIFT = 95;

/**
 * How finely the field is sampled: 20 * 4^DETAIL cells, 327,680 at 7, a cell 99
 * nominal units across (198 at `WORLD_SCALE` 2). A puff is seeded on a kept cell
 * and nowhere else, so this is the resolution of the weather's agreement with
 * the sky. The deck's widths are written at the nominal radius and multiplied by
 * `WORLD_SCALE`, so the field, its cells and the shade map baked from it keep
 * their proportions on any planet; its heights are the sky's and stay.
 */
export const DETAIL = 7;

/**
 * Wavelengths, in world units, the field is built from. Every frequency below
 * is `PLANET_RADIUS / wavelength`, because a direction is a unit vector and the
 * noise lattice lives in that space.
 */
const WEATHER_SPAN = 900 * WORLD_SCALE;
const WARP_SPAN = 7000 * WORLD_SCALE;
const BASE_SPAN = 5200 * WORLD_SCALE;

const WEATHER_FREQUENCY = PLANET_RADIUS / WEATHER_SPAN;
const WARP_FREQUENCY = PLANET_RADIUS / WARP_SPAN;
export const BASE_FREQUENCY = PLANET_RADIUS / BASE_SPAN;

/** How far the warp drags the weather field. In units of the weather lattice. */
const WARP_STRENGTH = 0.55;

/**
 * Where the cut falls, and how much the latitude moves it. A single global
 * threshold gives even coverage, which the Earth's cloud does not have: from
 * orbit it is a wet band at the equator, two clear belts over the deserts and a
 * stormy ring round each mid-latitude. That is a cosine,
 * `cos(lat * pi / 27.5)` (+1 at the equator, -1 at 27.5, +1 at 55), so it
 * costs one term and no table. It is a bias, not a rule: the noise still
 * decides.
 */
export const THRESHOLD = 0.575;
/**
 * How far past the cut a bank reaches its full depth, in the field's units. A
 * puff's size, a heap's height, how low its belly hangs and (in `weather.ts`)
 * how hard it rains all ride `(coverage - THRESHOLD) / DEPTH_SPAN`, so the
 * tallest cloud in the sky is the one raining on you.
 */
export const DEPTH_SPAN = 0.16;
const CLIMATE_BIAS = 0.042;
const CLIMATE_PERIOD = 27.5;

/**
 * The wind, as one rotation of the whole field. The field is a pure function of
 * direction, so drifting it means turning the group rather than rebuilding
 * anything. The period is not 24 hours, or the same cloud would sit over the
 * same coast at the same hour forever.
 */
const WIND_PERIOD_HOURS = 19;
const WIND_TILT = 17 * (Math.PI / 180);
/** The axis the deck turns about, in world space. */
export const DECK_AXIS = new THREE.Vector3(Math.sin(WIND_TILT), Math.cos(WIND_TILT), 0).normalize();
const DECK_PERIOD_MS = WIND_PERIOD_HOURS * 3600000;

/**
 * The deck's turn at an instant: an absolute angle, so the deck and the weather
 * `weather.ts` reads off it are pure functions of the clock.
 */
export function deckTurn(timeMs: number, target: THREE.Quaternion): THREE.Quaternion {
  const phase = ((timeMs % DECK_PERIOD_MS) + DECK_PERIOD_MS) % DECK_PERIOD_MS;
  return target.setFromAxisAngle(DECK_AXIS, (phase / DECK_PERIOD_MS) * Math.PI * 2);
}

/**
 * How big a puff is, horizontally: `PUFF_RIM` at a bank's edge, `PUFF_HEART`
 * where it is deepest, each varied by `PUFF_JITTER` either way: 85 and 300
 * nominal units. The rim's must still reach over its own cell (`DETAIL`).
 */
export const PUFF_RIM = 85 * WORLD_SCALE;
export const PUFF_HEART = 300 * WORLD_SCALE;
export const PUFF_JITTER = 0.22;
/**
 * How tall a puff is against how wide, at the rim and at the heart: 0.6 and
 * 0.95 of a nominal width, so a puff that widens with the planet keeps its height.
 */
export const TALL_RIM = 0.6 / WORLD_SCALE;
export const TALL_HEART = 0.95 / WORLD_SCALE;
/**
 * How much of its lower half a puff keeps: the belly is the sphere's bottom
 * squashed to this, so a bank's floor is nearly flat and a heap stands on it
 * rather than on a ball.
 */
export const BELLY = 0.3;
/**
 * The second and third tiers of a heap: where the bank is deeper than these a
 * smaller puff is stacked on the one below, leant toward the bank's heart, so
 * the middle towers and the rim is one low row.
 */
export const CROWN_FROM = 0.35;
export const TOWER_FROM = 0.72;

/**
 * How close two puffs may seed; it makes the sky and the weather agree. Cells
 * are taken deepest first and a cell is refused a puff of its own when it is
 * nearer an accepted puff's centre than `SPACING` of the smaller of the two
 * radii, or `COVERED` of the accepted one's. Either way a refused cell lies
 * inside an accepted puff's footprint, so every kept cell is under a drawn
 * puff.
 */
export const SPACING = 0.85;
export const COVERED = 0.7;
/** The hash grid those tests run on: at least the largest refusal distance. */
export const SEED_GRID = 320 * WORLD_SCALE;

/**
 * How a heap shades as one soft mass rather than a pile of balls. The upper
 * half of each puff's normal is bent toward the normal of a dome under it
 * (`HEAP_DROP` radii below the centre) and toward the slope of the bank there,
 * leaning out toward the rim by `LEAN_RIM` at the edge and `LEAN_HEART` in the
 * middle, so the crease where two lobes meet falls between two normals that
 * nearly agree.
 */
export const HEAP_DROP = 1.3;
export const HEAP_BLEND = 0.55;
export const LEAN_RIM = 0.85;
export const LEAN_HEART = 0.15;

/**
 * The levels a puff is drawn at, as `IcosahedronGeometry` details (180, 80 and
 * 20 triangles), and where they change. A level is chosen a sub-chunk at a time
 * on the nearest point of its cap (`Cap`): near inside `NEAR_RANGE`, the middle
 * out to `MID_RANGE`, the far shape out to `SPLIT_RANGE`. Past that a whole
 * base chunk is one draw of its own far set (`FAR_LEAST`), so the planet from
 * the ceiling is at most 20 draw calls.
 */
export const NEAR_DETAIL = 2;
export const MID_DETAIL = 1;
export const FAR_DETAIL = 0;
export const NEAR_RANGE = 2600;
export const MID_RANGE = 6000;
export const SPLIT_RANGE = 11000;
/** The sub-chunks the near levels are culled and chosen by: DETAIL-3 faces, 64 a base face, ~2,300 units across. */
export const SUB_LEVEL = 3;
/**
 * The smallest puff of the far set, 210 nominal units. From past `SPLIT_RANGE` a rim puff
 * is a few pixels and there are tens of thousands of them, so the far set
 * is seeded again over the same cells with no puff under this: a bank is the
 * same bank, a little fuller at its rim, from a fraction of the puffs.
 */
export const FAR_LEAST = 210 * WORLD_SCALE;

/**
 * The soft edge: how far a face must turn from the eye before it is drawn
 * whole. It is alpha to coverage (the multisampled target's own dither), so it
 * writes depth where it is drawn, needs no sort and has no hull to show
 * through. Wider near, where a puff has a soft rim; narrower at range, where a
 * wide fade is a hole.
 */
export const EDGE_NEAR = 0.5;
export const EDGE_FAR = 0.22;

/**
 * The paint: a warm crown where a lobe faces the sky, a cool blue belly where
 * it faces the ground (darker under a deep bank), a little light of its own
 * (the sky's colour), and the sun's own colour on the rim: a little where the
 * rim faces the sun and a lot when the sun is behind the cloud, the silver
 * lining, which is past `post.ts`'s bloom threshold on purpose.
 */
export const CROWN_TINT = [1.04, 1.01, 0.95] as const;
export const BELLY_TINT = [0.7, 0.77, 0.92] as const;
export const BELLY_DEEP = 0.22;
export const SELF_LIGHT = 0.12;
export const RIM_POWER = 3;
export const RIM_SIDE = 0.35;
export const RIM_BACK = 1.6;
export const BACK_POWER = 6;
export const SCATTER = 0.3;

/**
 * How much of the deck's own height survives at range. The limb is the only
 * place it matters: the deck is seen edge-on there, so the outer edge of the
 * ring is the tallest top along a chord crossing dozens of heaps and its wobble
 * against black space reads as a crust. The height is compressed toward the
 * deck's mean base in the vertex shader, after the instance matrix, on the
 * distance to the deck. It compresses toward a reference radius rather than
 * scaling the group, so it never moves the base (scaling would slide the deck
 * through the mountains on the way up).
 *
 * `mix(1.0, ..., 0.0)` is exactly 1.0, so at zero squash the near view is
 * untouched.
 */
const SQUASH_REFERENCE = PLANET_RADIUS + CLOUD_BASE;
const SQUASH_KEEP = 0.12;
const SQUASH_START_RANGE = 7000;
const SQUASH_FULL_RANGE = 13000;

export const SQUASH_GLSL = /* glsl */ `uniform float squash;

vec3 atlasVertex( vec3 p ) {
  float r = length( p );
  return p * mix( 1.0, ( ${SQUASH_REFERENCE.toFixed(1)} + ( r - ${SQUASH_REFERENCE.toFixed(1)} ) * ${SQUASH_KEEP.toFixed(3)} ) / r, squash );
}`;

export function squashAt(altitude: number): number {
  const range = Math.abs(altitude - CLOUD_BASE);
  return THREE.MathUtils.smoothstep(range, SQUASH_START_RANGE, SQUASH_FULL_RANGE);
}

/**
 * What a cloud on the night hemisphere is worth from orbit, as a fraction of
 * what it is worth on the day one. A pale sheet over the night side would take
 * away the city lights and the terminator, so it is pulled down toward the land
 * it stands over, not off. It rides `orbitDim`, so it does not exist on the
 * ground. The two thresholds are `lights.ts`'s own, so the cloud dims at the
 * terminator the windows come on at.
 */
export const NIGHT_FLOOR = 0.34;

/** How much of its light the heart of a bank loses under a storm (`setGrey` at 1). */
export const GREY_DEPTH = 0.58;

/**
 * How much of a cloud's own shape is allowed to shade it. A small pale object
 * with a lit and a dark side reads as a rock, and from the ceiling a puff is a
 * few pixels; from orbit a cloud reads as area and value, so the shading normal
 * is bent toward the local up with distance. It stops at `FLAT_MAX` rather than
 * 1 because a wholly flat deck shades its limb like its centre and the globe
 * stops being a sphere.
 */
const FLAT_FULL_RANGE = 4000;
const FLAT_GONE_RANGE = 16000;
export const FLAT_MAX = 0.9;

export function flattenAt(altitude: number): number {
  const range = Math.abs(altitude - CLOUD_BASE);
  return FLAT_MAX * THREE.MathUtils.smoothstep(range, FLAT_FULL_RANGE, FLAT_GONE_RANGE);
}


/**
 * How cloudy this direction is, before the cut. The domain warp turns blobs
 * into fronts and swirls (one extra `fbm` at build time), and the climate term
 * is the three-cell bias of `CLIMATE_BIAS`.
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
