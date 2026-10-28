import { AVATAR_HEIGHT } from '../../stature.ts';
import { M } from './config.ts';
import type { Furniture } from './styles.ts';

/**
 * What a piece is modelled to: the numbers are fractions of a body. A piece is
 * read at five metres by the body standing next to it, so each is sized against
 * `AVATAR_HEIGHT` (`H`) rather than in metres: a post box is waist-to-chest, a
 * bin about the hip, a vending machine a head over the crown, a café table at
 * the hand. Triangles go on a separate base, body and lid, a few facets where
 * the thing is round, insets and slots stepped proud of the face they are on,
 * and two or three tones of one colour for its bands.
 */
export const H = AVATAR_HEIGHT;

export interface Footprint {
  /** Along the building line and into the plot, in units. */
  width: number;
  depth: number;
  /** The most triangles it comes to (`pnpm scenery` prints the dearest), so a town out of allowance does not draw it to throw it away. */
  cost: number;
  /** The wall a body meets, if any: a box of `hx` by `hz` about the item's centre, or a disc. */
  solid: { hx: number; hz: number; height: number; round?: boolean } | null;
}

/**
 * Every piece's plan, cost and wall. The costs are the dearest build `pnpm
 * scenery` measures, with a little over; the post box is the dearest of its
 * four shapes, the planter and the hydrant their CC0 models.
 */
export const FOOTPRINTS: Record<Furniture | 'postbox' | 'kiosk' | 'clock' | 'bollard', Footprint> = {
  cafe: { width: 2.3 * M, depth: 1.1 * M, cost: 460, solid: { hx: 0.4 * M, hz: 0.4 * M, height: 0.76 * M } },
  // Walked through, as a fence is: its slots are where the fleet's bicycles
  // stand, and each of those is a wall of its own (`Fleet.collide`).
  rack: { width: 1.8 * M, depth: 1.75 * M, cost: 160, solid: null },
  vending: { width: 0.5 * H, depth: 0.42 * H, cost: 160, solid: { hx: 0.24 * H, hz: 0.19 * H, height: 1.13 * H } },
  bin: { width: 0.34 * H, depth: 0.34 * H, cost: 230, solid: { hx: 0.15 * H, hz: 0.15 * H, height: 0.5 * H, round: true } },
  planter: { width: 1.3 * M, depth: 0.95 * M, cost: 310, solid: { hx: 0.6 * M, hz: 0.45 * M, height: 0.5 * M } },
  pots: { width: 1.1 * M, depth: 0.5 * M, cost: 480, solid: null },
  stall: { width: 2.1 * M, depth: 1.25 * M, cost: 520, solid: { hx: 1.0 * M, hz: 0.55 * M, height: 2.2 * M } },
  newsbox: { width: 1.05 * M, depth: 0.5 * M, cost: 210, solid: { hx: 0.5 * M, hz: 0.22 * M, height: 1.05 * M } },
  hydrant: { width: 0.5 * M, depth: 0.5 * M, cost: 200, solid: { hx: 0.15 * M, hz: 0.15 * M, height: 0.72 * M, round: true } },
  postbox: { width: 0.36 * H, depth: 0.34 * H, cost: 260, solid: { hx: 0.15 * H, hz: 0.15 * H, height: 0.66 * H, round: true } },
  kiosk: { width: 1.9 * M, depth: 1.8 * M, cost: 200, solid: { hx: 0.9 * M, hz: 0.85 * M, height: 2.7 * M } },
  clock: { width: 0.5 * M, depth: 0.5 * M, cost: 240, solid: { hx: 0.1 * M, hz: 0.1 * M, height: 3.2 * M, round: true } },
  // Walked through, as a shrub is: it stands on the pavement, which the crowd and the player walk.
  bollard: { width: 0.15 * M, depth: 0.15 * M, cost: 130, solid: null },
};

export type Piece = keyof typeof FOOTPRINTS;

/** How tall the pieces with no wall stand, for what knocks them over: a rack's hoops, a pot's flowers, a bollard's post. */
export const LOOSE_HEIGHT: Readonly<Record<'rack' | 'pots' | 'bollard', number>> = {
  rack: 0.78 * M,
  pots: 0.6 * M,
  bollard: 1.0 * M,
};

/** Where a rack's three bicycles stand, across it: between its hoops and either side of them. */
export const RACK_SLOTS = [-0.75 * M, 0, 0.75 * M] as const;
