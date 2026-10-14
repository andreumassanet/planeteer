import { packedBend } from '../../src/pack.ts';
import { classOf } from '../../src/roads/classes.ts';
import { MAX_ROAD_LENGTH, bendFor } from '../../src/roads/graph.ts';
import type { Road } from '../../src/roads/types.ts';
import type { BakeContext, Row } from './context.ts';
import { BEND_TRIES } from './trial.ts';
import type { RoadTrials } from './trial.ts';

/**
 * How many trials one orphan's rescue may spend over all the towns it tries:
 * four towns' worth, each through the orphan's two best gates and the far
 * town's best free one, with every bow. A rescue that succeeds does so at one
 * of the nearest towns.
 */
const RESCUE_BUDGET = 4 * 2 * (2 * BEND_TRIES + 1);

/**
 * One road for each built town the proximity graph left alone.
 *
 * A Gabriel graph can isolate a town for purely geometric reasons (a larger
 * neighbour between it and everything else), so a town with no road after the
 * tests gets one, to the nearest built town within `MAX_ROAD_LENGTH` it can
 * reach by a path that passes every ground test. The orphan uses its gate
 * nearest the bearing; the far town its nearest gate that none of its roads
 * already uses. Largest orphans first, so the order is a function of the data.
 */
export function rescueOrphans(
  ctx: BakeContext, trials: RoadTrials, rows: readonly Row[],
): { put: Row[]; joined: number; tried: number; cut: number } {
  const { places, built, chord } = ctx;
  const degree = new Int32Array(places.length);
  const used = new Map<number, Set<number>>();
  const use = (place: number, gate: number): void => {
    let set = used.get(place);
    if (set === undefined) used.set(place, (set = new Set()));
    set.add(gate);
  };
  for (const row of rows) {
    degree[row.a]!++;
    degree[row.b]!++;
    use(row.a, row.gateA);
    use(row.b, row.gateB);
  }
  const orphans = built.filter((i) => degree[i] === 0);
  const identity = (i: number): string => `${places[i]!.name}@${places[i]!.lat},${places[i]!.lon}`;
  orphans.sort((x, y) => places[y]!.pop - places[x]!.pop || (identity(x) < identity(y) ? -1 : 1));

  const put: Row[] = [];
  let joined = 0;
  let cut = 0;
  for (const orphan of orphans) {
    if (degree[orphan]! > 0) continue;
    if (!trials.openGates(orphan).some(Boolean)) continue;
    // Every built town within reach, nearest first: the first that works wins.
    const near = built
      .filter((i) => i !== orphan && chord(orphan, i) <= MAX_ROAD_LENGTH)
      .sort((x, y) => chord(orphan, x) - chord(orphan, y) || (identity(x) < identity(y) ? -1 : 1));
    const began = trials.trials;
    search: for (const target of near) {
      if (trials.trials - began >= RESCUE_BUDGET) {
        cut++;
        break;
      }
      const a = Math.min(orphan, target);
      const b = Math.max(orphan, target);
      const mine = trials.gatesToward(orphan, target).slice(0, 2);
      const taken = used.get(target) ?? new Set<number>();
      const toward = trials.gatesToward(target, orphan);
      const theirs = [...toward.filter((g) => !taken.has(g)), ...toward.filter((g) => taken.has(g))].slice(0, 1);
      const cls = classOf(places[a]!, places[b]!);
      const natural = packedBend(bendFor(places[a]!, places[b]!));
      for (const gm of mine) {
        for (const gt of theirs) {
          const road: Road = {
            a, b, cls, bend: natural,
            gateA: a === orphan ? gm : gt,
            gateB: a === orphan ? gt : gm,
            layer: 0,
            bridgeFrom: 0,
            bridgeTo: 0,
          };
          const bend = trials.bendThatWorks(road, chord(a, b), natural);
          if (bend === null) continue;
          put.push({ ...road, bend: Number(bend.toFixed(4)) });
          degree[a]!++;
          degree[b]!++;
          use(a, road.gateA);
          use(b, road.gateB);
          joined++;
          break search;
        }
      }
    }
  }
  return { put, joined, tried: orphans.length, cut };
}
