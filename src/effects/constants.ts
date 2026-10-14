/** Pool sizes, ranges and the kinds of vehicle that leave each kind of mark. */
import { PALETTE } from '../theme.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { BiomeId } from '../biome.ts';
import type { CraftKind } from '../craft/contract.ts';
import { BALLOON_CLIMB, BALLOON_SPEED, CAR_BOOST, topSpeedOf } from '../vehicles.ts'; 

export const H = AVATAR_HEIGHT;

/** Pool sizes: the caps the whole world shares. */
export const MAX_PUFFS = 384;
export const MAX_DISCS = 256;
export const MAX_DEBRIS = 40;
/** Ribbons, three to a boat: the player's own and seven other boats'. */
export const MAX_RIBBONS = 24;
/** Points one ribbon holds: a stern trail at full boost needs about 120 of them. */
export const RIBBON_POINTS = 192;
/** Round a foam disc: sides, which is what the silhouette of one reads as. */
export const DISC_SIDES = 8;
/** Vertices a disc writes, and a ribbon segment: two bands of two triangles. */
export const DISC_VERTICES = DISC_SIDES * 6;
export const SEGMENT_VERTICES = 12;
export const FOAM_VERTEX_CAP = MAX_DISCS * DISC_VERTICES + MAX_RIBBONS * RIBBON_POINTS * SEGMENT_VERTICES;
/**
 * The foam's height over the sea's own sphere. The shallows ride up to 0.75
 * over it at a coast, so this clears them everywhere; `polygonOffset` does the
 * rest where the sphere's own facets bow.
 */
export const FOAM_LIFT = 0.8;
export const FOAM_RADIUS = PLANET_RADIUS + FOAM_LIFT;
/**
 * Foam and spray are white. The palette's own `white` is a warm cream that on
 * the sea reads as sand, and the reference's foam is the whitest thing on the
 * screen.
 */
export const FOAM_COLOR = 0xffffff;
/** How far from the camera anybody else's vehicle still leaves anything. */
export const REACH = 700;
/** How far from the camera a rocket's exhaust is still drawn: a launch is seen from the next town. */
export const PLUME_REACH = 3000;
/** Gravity on spray and debris, in units a second squared: brisk, as a comic's is. */
export const FALL = 30;
/**
 * The most of anything one emitter makes in one frame. Well over what the
 * slowest frame the loop allows (a tenth of a second) owes at any rate here,
 * so it never shapes a trail; it only bounds a pathological one.
 */
export const FRAME_BURST = 48;
/** Faster than anybody runs, for the foot's pose-jump guard. */
export const FOOT_TOP = 40;

/** The fastest a kind of vehicle goes, with room: a move faster than this in a frame is a jump. */
export function topSpeed(kind: CraftKind | null): number {
  if (kind === null) return FOOT_TOP;
  if (kind === 'balloon') return (BALLOON_SPEED + BALLOON_CLIMB) * 2;
  return topSpeedOf(kind) * 1.3;
}

/**
 * What a kind leaves behind it, by how it goes: a hull's wake on the water;
 * an engine's exhaust and its wheels' dust on the ground; only the dust off a
 * bicycle's tyres and a horse's hooves.
 */
export const HULLS: ReadonlySet<CraftKind> = new Set<CraftKind>(['boat', 'jetski', 'sailboat', 'submarine']);
/** Deeper than this under the surface a hull or a swimmer leaves no mark on it, units. */
export const SUBMERGED = 1.2;
export const ENGINES: ReadonlySet<CraftKind> = new Set<CraftKind>(['car', 'van', 'bus', 'tractor', 'jeep', 'tuktuk', 'motorbike']);
export const QUIET: ReadonlySet<CraftKind> = new Set<CraftKind>(['bicycle', 'horse']);
/** A helicopter's downwash reaches the ground from this high, in units, and is strongest on it. */
export const WASH_REACH = 30;

/** Whether a move of `run` units in `dt` seconds is a jump rather than travel. */
export const isJump = (run: number, dt: number, kind: CraftKind | null): boolean => run > topSpeed(kind) * dt + 1;
/** Puffs a second off a fire. */
export const SMOKE_RATE = 2.2;

/**
 * The dust a wheel or a foot raises on a biome's bare ground, or null where
 * the ground is grown over: sand in a desert, the tan of dry earth on rock,
 * the steppe and the savanna, snow in the cold. The grass, the woods and the
 * jungle raise nothing.
 */
export function dustOf(biome: BiomeId): number | null {
  switch (biome) {
    case 'desert':
      return PALETTE.sand;
    case 'rock':
    case 'steppe':
    case 'savanna':
      return PALETTE.tan;
    case 'ice':
    case 'tundra':
      return PALETTE.white;
    default:
      return null;
  }
}

/** How hard a crash is felt, 0 to 1, from the speed the knock took off: a quarter at the threshold, all of it at full boost. */
export function crashStrength(lost: number): number {
  return Math.min(1, Math.max(0.25, (lost / CAR_BOOST) * 1.4));
}

