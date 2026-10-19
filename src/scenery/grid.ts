/**
 * A town's square: how big it is, the cells it is cut into, where its streets
 * run, which level each cell is cut to, and where a road may come into it.
 *
 * All pure functions of a place's built radius (`radiusOf`), so the town that
 * stands on the square (`settlements.ts`) and the roads that arrive at it
 * (`roads.ts`, the bake, `pnpm check`) cannot disagree about its edge, its
 * gates or its levels. The parts live in `grid/`; this is their one entry.
 */

export {
  CARRIAGEWAY_HALF,
  COUNTRY_RING,
  GATE_CUT,
  TOWN_PITCH,
  cellCentre,
  cellIndex,
  cornerOffset,
  countryReach,
  gateFlare,
  gateGlow,
  gateMouth,
  gridAround,
  gatesOf,
  inGrid,
  isAvenue,
  offsetDirection,
  streetBand,
  streetSide,
  townFrame,
  townGrid,
} from './grid/square.ts';
export type { Gate, GateMouth, TownGrid } from './grid/square.ts';
export { PARCEL_KEEP, inParcel, landmarkParcel } from './grid/parcels.ts';
export type { Parcel } from './grid/parcels.ts';
export {
  THROUGH_HALF_WIDTH,
  THROUGH_TURN,
  hasThroughStreets,
  isMainGate,
  mainStreetHalf,
  onThroughRoad,
  throughClear,
  throughLane,
} from './grid/through.ts';
export { gateLevel, gateUsable, groundOf, partnerOf, townTerraces } from './grid/terraces.ts';
export type { TownGround } from './grid/terraces.ts';
export { GATE_FACING, assignGates } from './grid/assign.ts';
export { OUTSKIRT_CUT, OUTSKIRT_MIN_CELLS, OUTSKIRT_RING, outskirtScore, outskirtsOf } from './grid/outskirts.ts';
