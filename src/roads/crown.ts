import { GIRDER } from '../roadside/constants.ts';
import { RAMP_GRADE } from '../scenery/ground.ts';

/** How high a road's crown rides: the one height law the ribbon, the foot, the traffic and `pnpm check` read. */

/**
 * How far the ribbon is laid above `elevationAt`, in world units: clear of the
 * land mesh where it stands over the relief, and equal to `GROUND_LIFT`, so on
 * flat ground a road meets its town's paving with no ramp.
 */
export const RIBBON_LIFT = 3.0;

/**
 * The ribbon's climb to a gate's paving, rise over run, added to the relief's
 * own slope (shared with a town street's ramp, `scenery/ground.ts`).
 */
export { RAMP_GRADE };

/**
 * What a road's two ends ask of its height, worked out once per road: `rise`,
 * how far the gate's paving stands over the ordinary crown at the kerb;
 * `level`, how far out the section levels its cross-slope (the approach);
 * `walk`, the pavement carried out of the gate (`gateMouth`); `carriage`,
 * the gate street's carriageway half-width, which the road eases to at the
 * kerb; `kerb`, the paving's radius. An end whose town is not built asks for
 * nothing (0).
 */
export interface RoadRamp {
  riseA: number;
  riseB: number;
  levelA: number;
  levelB: number;
  walkA: number;
  walkB: number;
  carriageA: number;
  carriageB: number;
  kerbA: number;
  kerbB: number;
  /** The bridge's wet span along the path (both 0 for none), and the crown's elevation where each ramp leaves the land. */
  bridgeFrom: number;
  bridgeTo: number;
  deckA: number;
  deckB: number;
}

export function emptyRamp(): RoadRamp {
  return { riseA: 0, riseB: 0, levelA: 0, levelB: 0, walkA: 0, walkB: 0, carriageA: 0, carriageB: 0, kerbA: 0, kerbB: 0, bridgeFrom: 0, bridgeTo: 0, deckA: 0, deckB: 0 };
}

/**
 * A road may bridge water no wider than `BRIDGE_SPAN` (about 48 km of Earth)
 * once, with `BRIDGE_LAND` of dry road before each shore. The deck climbs from
 * the land's lift at `BRIDGE_GRADE` to `DECK_HEIGHT`, and `crownLift` takes it
 * where it is higher than the road.
 */
export const BRIDGE_SPAN = 120;
export const BRIDGE_LAND = 40;
export const BRIDGE_GRADE = 0.18;
/** The deck's highest, as an elevation over the sea: boats pass under the middle. */
export const DECK_HEIGHT = 24;
/** How deep the deck's edge girder is under the crown: `roadside.ts`'s, whose piers stand under it. */
export { GIRDER };

/** The crown's elevation a bridge asks for `sA` along the road, or -Infinity off its ramps. */
export function bridgeDeck(ramp: RoadRamp, sA: number): number {
  if (ramp.bridgeTo <= ramp.bridgeFrom) return -Infinity;
  const start = ramp.bridgeFrom - BRIDGE_LAND;
  const end = ramp.bridgeTo + BRIDGE_LAND;
  if (sA <= start || sA >= end) return -Infinity;
  // Level at `DECK_HEIGHT`, or at the higher shore's crown where that is
  // higher, so the deck never steps down off a cliff.
  const top = Math.max(DECK_HEIGHT, ramp.deckA, ramp.deckB);
  return Math.min(top, ramp.deckA + BRIDGE_GRADE * (sA - start), ramp.deckB + BRIDGE_GRADE * (end - sA));
}

/** Whether `sA` is over a bridge's water, where the ribbon's shoulders are girders. */
export function onBridge(ramp: RoadRamp, sA: number): boolean {
  return ramp.bridgeTo > ramp.bridgeFrom && sA > ramp.bridgeFrom && sA < ramp.bridgeTo;
}

/** How far a ramp of `rise` reaches out from its kerb, in world units. */
export function rampReach(rise: number): number {
  return Math.abs(rise) / RAMP_GRADE;
}

/** What is left of a kerb's rise `s` units out from it. */
function riseLeft(rise: number, s: number): number {
  const left = Math.abs(rise) - RAMP_GRADE * s;
  return left > 0 ? Math.sign(rise) * left : 0;
}

/** How much of the relief's cross-slope is still being levelled out `s` units from a kerb. */
function levelling(level: number, s: number): number {
  return level > 0 && s < level ? 1 - s / level : 0;
}

/**
 * How far the crown stands over the relief at a point `sA` and `sB` units from
 * the two gates: `RIBBON_LIFT`, plus each gate's `rise` decaying at
 * `RAMP_GRADE` (so the centre line arrives at exactly `gateLevel +
 * GROUND_LIFT`), less the cross-slope (`ground - centre`), taken off in full
 * at the kerb and faded back in over the approach; or the bridge deck where
 * higher. `ground` and `centre` may be radii or elevations alike.
 */
export function crownLift(ramp: RoadRamp, sA: number, sB: number, ground: number, centre: number): number {
  const lift = RIBBON_LIFT + riseLeft(ramp.riseA, sA) + riseLeft(ramp.riseB, sB);
  const road = lift - (levelling(ramp.levelA, sA) + levelling(ramp.levelB, sB)) * (ground - centre);
  const deck = bridgeDeck(ramp, sA);
  return deck > ground + road ? deck - ground : road;
}

/** Whether `crownLift` reads `centre` here at all: only over an approach into a built town. */
export function needsCentre(ramp: RoadRamp, sA: number, sB: number): boolean {
  return levelling(ramp.levelA, sA) + levelling(ramp.levelB, sB) > 0;
}
