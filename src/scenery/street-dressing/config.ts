import { AVATAR_HEIGHT, PERSON_METRES } from '../../stature.ts';

export const M = AVATAR_HEIGHT / PERSON_METRES;

/**
 * How far a painted mark stands over the paving, in units.
 *
 * Decided by the depth buffer: a layer is about a thousandth of a unit at a
 * hundred units and grows with the square of the distance, so 0.05 is five
 * layers at 300 units, two at 500, and one at 700, where the largest mark (a
 * manhole 1.3 across) is under two pixels. A foot cannot find it: the floor a
 * foot stands on is `floorLiftAt`, which never sees a decal.
 */
export const DECAL_LIFT = 0.05;

/**
 * How deep into a plot the building line's furniture may reach, in units, and
 * the share of the plot's depth it may take: a rack of bicycles nosed in from
 * the street is the deepest thing here, at 3.8.
 */
export const FRONTAGE_DEPTH = 4;
export const FRONTAGE_SHARE = 0.6;
/** How far the furniture keeps behind the plot line, so nothing overhangs the pavement. */
export const LINE_BACK = 0.12;
/** How far apart two things on the building line stand, at least. */
export const ITEM_GAP = 0.3;
/** How far anything keeps from a building, a bench or a parked car it is not part of. */
export const CLEAR = 0.25;
/**
 * How far the building line's furniture keeps from a building's walls: room
 * to walk between, and nothing stood in front of a door or a window in them.
 */
export const WALL_CLEAR = 1.1;
/** The shares of a town's allowance the façades, then the façades and the building line, may spend. */
export const FACADE_SHARE = 0.55;
export const LINE_SHARE = 0.85;

/** Whether towns are dressed at all: the A/B, from the console or a check. */
export let enabled = true;
export function streetDressingEnabled(): boolean {
  return enabled;
}

/** What the dressing cost, over every town dressed since the last reset. */
export const dressingStats = {
  towns: 0,
  triangles: 0,
  items: 0,
  facades: 0,
  decals: 0,
  dropped: 0,
  ms: 0,
  /** The same, by phase: reading and dressing the fronts, the building line, the paint. */
  facadeMs: 0,
  lineMs: 0,
  paintMs: 0,
  reset(): void {
    this.towns = this.triangles = this.items = this.facades = this.decals = this.dropped = this.ms = 0;
    this.facadeMs = this.lineMs = this.paintMs = 0;
  },
};
