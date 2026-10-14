import { PLANET_RADIUS } from '../../src/globe.ts';
import { ROAD_CLASSES } from '../../src/roads/classes.ts';
import { courseOf, emptyCourse } from '../../src/roads/course.ts';
import { emptyRamp, rampReach } from '../../src/roads/crown.ts';
import { rampOf } from '../../src/roads/gates.ts';
import type { BakeContext, Row } from './context.ts';
import { componentsOf, degreesOf } from './graph-stats.ts';
import type { Refusal } from './trial.ts';

/** What the road bake prints about the network it made. */

const EARTH_KM = 6371;

/** A network's size, classes, degrees and islands, as three report lines. */
export function measure(ctx: BakeContext, rows: readonly Row[]): string {
  const degrees = degreesOf(ctx, rows);
  const islands = componentsOf(ctx, rows);
  const byClass = [0, 0, 0];
  let km = 0;
  for (const row of rows) {
    byClass[row.cls]!++;
    km += (ctx.chord(row.a, row.b) / PLANET_RADIUS) * EARTH_KM;
  }
  return (
    `  ${rows.length.toLocaleString()} roads, ${Math.round(km).toLocaleString()} km · ` +
    `${ROAD_CLASSES.map((c, k) => `${c.name} ${byClass[k]!.toLocaleString()}`).join(' · ')}\n` +
    `  degree: mean ${degrees.mean}  median ${degrees.median}  p90 ${degrees.p90}  max ${degrees.max}  ` +
    `${degrees.share}\n` +
    `  ${islands.count.toLocaleString()} components, largest ${islands.largest.toLocaleString()} towns, ` +
    `${degrees.isolated.toLocaleString()} with no road ` +
    `(${((degrees.isolated / ctx.built.length) * 100).toFixed(1)}%)`
  );
}

export interface GroundTally {
  trials: number;
  probes: number;
  testMs: number;
  candidates: number;
  refused: Record<Refusal | 'shut', number>;
  saved: Record<Refusal, number>;
  savedByGate: number;
  searchesCut: number;
  rescuesCut: number;
}

/** What the ground tests refused and what the search saved. */
export function reportGround(tally: GroundTally): void {
  const { refused, saved } = tally;
  console.log(
    `the ground: ${tally.trials.toLocaleString()} trials, ${tally.probes.toLocaleString()} probes along the courses in ${tally.testMs} ms`,
  );
  console.log(
    `  of ${tally.candidates.toLocaleString()} candidates, ${refused.shut.toLocaleString()} end at a town with no open gate, ` +
      `${refused.ramp.toLocaleString()} cannot climb to both gates, ${refused.fold.toLocaleString()} would fold their ribbon, ` +
      `${refused.wet.toLocaleString()} went to sea, ` +
      `${refused.own.toLocaleString()} back through their own town, ${refused.through.toLocaleString()} through a third town, ` +
      `${refused.landmark.toLocaleString()} through a landmark and ${refused.steep.toLocaleString()} over a mountain`,
  );
  console.log(
    `  the bow saved ${saved.wet.toLocaleString()} round water, ${saved.through.toLocaleString()} round a town, ` +
      `${saved.landmark.toLocaleString()} round a landmark, ` +
      `${saved.steep.toLocaleString()} round a mountain, ${saved.own.toLocaleString()} round its own square and ` +
      `${saved.fold.toLocaleString()} out of a hairpin; ` +
      `another gate saved ${tally.savedByGate.toLocaleString()}; the gate search ran out on ` +
      `${tally.searchesCut.toLocaleString()} roads and the rescue on ${tally.rescuesCut.toLocaleString()} towns`,
  );
}

/**
 * Throws if the rescue made the map worse. It only adds an edge between two
 * places that had none, so nothing can be split or stranded that was not.
 */
export function assertConnectivity(ctx: BakeContext, kept: readonly Row[], network: readonly Row[]): void {
  const before = componentsOf(ctx, kept);
  const after = componentsOf(ctx, network);
  const strandedBefore = degreesOf(ctx, kept).isolated;
  const strandedAfter = degreesOf(ctx, network).isolated;
  const better =
    after.count <= before.count &&
    after.largest >= before.largest &&
    strandedAfter <= strandedBefore;
  console.log(
    `  connectivity: components ${before.count} -> ${after.count}, ` +
      `largest ${before.largest.toLocaleString()} -> ${after.largest.toLocaleString()}, ` +
      `no road ${strandedBefore} -> ${strandedAfter}`,
  );
  if (!better) throw new Error('the rescue took connectivity away; see `rescueOrphans`');
}

/** The gates as they ship: shared gates, how far the ramps into them climb, and the depth layers. */
export function reportGates(ctx: BakeContext, network: readonly Row[], moved: number, stayed: number, layersMs: number): void {
  const ends = new Map<string, number>();
  for (const row of network) {
    for (const key of [`${row.a}:${row.gateA}`, `${row.b}:${row.gateB}`]) ends.set(key, (ends.get(key) ?? 0) + 1);
  }
  let shared = 0;
  for (const count of ends.values()) if (count > 1) shared += count;
  const course = emptyCourse();
  const ramp = emptyRamp();
  const rises: number[] = [];
  for (const row of network) {
    rampOf(row, courseOf(row, ctx.places, course), ctx.places, ctx.world, ramp);
    rises.push(Math.abs(ramp.riseA), Math.abs(ramp.riseB));
  }
  rises.sort((x, y) => x - y);
  const at = (q: number): string => rises[Math.min(rises.length - 1, Math.floor(rises.length * q))]!.toFixed(2);
  console.log(
    `\ngates: ${moved.toLocaleString()} roads moved to a better gate once the network was known, ` +
      `${stayed.toLocaleString()} kept the one they had; ${shared.toLocaleString()} of ` +
      `${(network.length * 2).toLocaleString()} road ends share a gate`,
  );
  console.log(
    `  rise to the gate: median ${at(0.5)}, p90 ${at(0.9)}, p99 ${at(0.99)}, worst ${rises.at(-1)!.toFixed(2)} units ` +
      `(a ramp of ${rampReach(rises.at(-1)!).toFixed(0)} units at the worst)`,
  );
  let layered = 0;
  let deepest = 0;
  for (const row of network) {
    if (row.layer > 0) layered++;
    if (row.layer > deepest) deepest = row.layer;
  }
  console.log(
    `  depth layers: ${layered.toLocaleString()} roads drawn behind a road they overlap, ` +
      `the deepest on layer ${deepest}, in ${layersMs} ms`,
  );
}
