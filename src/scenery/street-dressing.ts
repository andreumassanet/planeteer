/**
 * What a near town's streets hold besides its buildings, lamps and people:
 * dressing on the ground floors that face a street, furniture along the
 * building line, and marks painted on the paving.
 *
 * Everything is written straight into flat arrays in the town's own frame
 * (`street-dressing/sink.ts`) and returned as one buffer that the settlement
 * merges into its own. A town is dressed in three phases, each within a
 * larger share of the triangle allowance (`DressInput.budget`): façades, the
 * building line, then paint. What does not fit is dropped, nearest the edge
 * first. Everything is a pure function of the town's seed, its square and what
 * stands on it, so every client builds the same street.
 *
 * - Façade pieces hang on the building's own geometry (`facadeOf`): awnings,
 *   signs, flower boxes, shutters, air conditioners.
 * - Furniture stands inside the plot's rectangle, backed onto the street it
 *   faces, never on the pavement.
 * - Paint is decals `DECAL_LIFT` over the floor: tactile strips, warning pads,
 *   manholes and drains.
 */
import { dressingStats, FACADE_SHARE, LINE_SHARE } from './street-dressing/config.ts';
import { createDresser } from './street-dressing/dresser.ts';
import { dressFronts } from './street-dressing/dress-fronts.ts';
import { layBuildingLine } from './street-dressing/frontage.ts';
import { paintStreets } from './street-dressing/paint-streets.ts';
import type { DressInput, Dressed } from './street-dressing/types.ts';

export { DECAL_LIFT, dressingStats, streetDressingEnabled } from './street-dressing/config.ts';
export type { Anchor, DressFront, DressInput, DressSeat, Dressed, FacadeSource } from './street-dressing/types.ts';
export { facadeOf } from './street-dressing/facade.ts';
export { propModels } from './street-dressing/models.ts';
export type { ModelArrays, PropModels } from './street-dressing/models.ts';
export { DRESSING_REGIONS, pieceCost, sampleDressing } from './street-dressing/sample.ts';
export type { SamplePiece } from './street-dressing/sample.ts';

/** Dresses one town. Pure: the same input is the same buffer, bit for bit. */
export function dressTown(input: DressInput): Dressed {
  const started = performance.now();
  const d = createDresser(input);

  // The façades first: a street reads by its fronts, and a mark on the paving
  // is the cheapest thing to lose.
  d.cap = d.budget * FACADE_SHARE;
  const facades = dressFronts(d);
  const facadeDone = performance.now();
  dressingStats.facadeMs += facadeDone - started;

  d.cap = d.budget * LINE_SHARE;
  const items = layBuildingLine(d);
  const lineDone = performance.now();
  dressingStats.lineMs += lineDone - facadeDone;

  d.cap = d.budget;
  paintStreets(d);

  const { sink } = d;
  const triangles = sink.triangles;
  const vertices = triangles * 3;
  const out: Dressed = {
    position: new Float32Array(sink.position),
    normal: new Float32Array(sink.normal),
    color: new Float32Array(sink.color),
    glow: new Uint8Array(sink.glow),
    triangles,
    emits: sink.glow.some((value, i) => i % 2 === 0 && value > 0),
    solids: d.solids,
    seats: d.seats,
    anchors: sink.anchors,
    counts: d.counts,
  };
  if (out.position.length !== vertices * 3 || out.glow.length !== vertices * 2) {
    throw new Error('street-dressing: the buffers came out different lengths');
  }
  dressingStats.towns++;
  dressingStats.triangles += triangles;
  dressingStats.items += items;
  dressingStats.facades += facades;
  dressingStats.decals += d.decals;
  dressingStats.dropped += d.dropped;
  dressingStats.paintMs += performance.now() - lineDone;
  dressingStats.ms += performance.now() - started;
  return out;
}
