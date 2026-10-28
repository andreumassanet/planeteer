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
import type { Dresser } from './street-dressing/dresser.ts';
import { dressFrontsSteps } from './street-dressing/dress-fronts.ts';
import { layBuildingLineSteps } from './street-dressing/frontage.ts';
import { paintStreetsSteps } from './street-dressing/paint-streets.ts';
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
  const steps = dressTownSteps(input);
  for (;;) {
    const step = steps.next();
    if (step.done === true) return step.value;
  }
}

/** `dressTown` in steps, a front, a strip or a cell at a time, for a town raised over frames. */
export function* dressTownSteps(input: DressInput): Generator<void, Dressed, void> {
  let ms = 0;
  const d = timed(() => createDresser(input), (spent) => (ms += spent));

  // The façades first: a street reads by its fronts, and a mark on the paving
  // is the cheapest thing to lose.
  d.cap = d.budget * FACADE_SHARE;
  const facades = yield* timedSteps(dressFrontsSteps(d), (spent) => {
    dressingStats.facadeMs += spent;
    ms += spent;
  });

  d.cap = d.budget * LINE_SHARE;
  const items = yield* timedSteps(layBuildingLineSteps(d), (spent) => {
    dressingStats.lineMs += spent;
    ms += spent;
  });

  d.cap = d.budget;
  const out = yield* timedSteps(paintAndClose(d), (spent) => {
    dressingStats.paintMs += spent;
    ms += spent;
  });
  dressingStats.towns++;
  dressingStats.triangles += out.triangles;
  dressingStats.items += items;
  dressingStats.facades += facades;
  dressingStats.decals += d.decals;
  dressingStats.dropped += d.dropped;
  dressingStats.ms += ms;
  return out;
}

/** The paint, then everything laid copied out into one buffer. */
function* paintAndClose(d: Dresser): Generator<void, Dressed, void> {
  yield* paintStreetsSteps(d);
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
    pieces: d.pieces,
    anchors: sink.anchors,
    counts: d.counts,
  };
  if (out.position.length !== vertices * 3 || out.glow.length !== vertices * 2) {
    throw new Error('street-dressing: the buffers came out different lengths');
  }
  return out;
}

/** A call, its milliseconds handed to `spend`. */
function timed<T>(call: () => T, spend: (ms: number) => void): T {
  const began = performance.now();
  const value = call();
  spend(performance.now() - began);
  return value;
}

/** Steps passed through, the milliseconds of each handed to `spend`: the time spent working, not waiting between frames. */
function* timedSteps<T>(steps: Generator<void, T, void>, spend: (ms: number) => void): Generator<void, T, void> {
  for (;;) {
    const began = performance.now();
    const step = steps.next();
    spend(performance.now() - began);
    if (step.done === true) return step.value;
    yield;
  }
}
