import type { Gate } from './square.ts';

/**
 * How far a gate may face from where its road is going and still be given to
 * that road for its own, in radians, seen from the gate to the far town. A gate
 * facing further off is never handed to a road while one within this is open,
 * so a road does not leave by the back of a town and turn round.
 */
export const GATE_FACING = Math.PI / 2;

/**
 * Which gate each road comes in by.
 *
 * `leaving` is each road's direction out of the town, as `(x, z)` in the
 * town's frame, and `toward` where it is going, as an offset in world units;
 * `usable` says whether a gate can be used at all. The cheapest pairing by
 * angle wins among gates facing the road's way within `GATE_FACING`, one road
 * to a gate while gates last; a road left over shares the open gate that faces
 * its way best. Deterministic in the order handed in. Returns an index into
 * `gates` per road, or -1 when nothing is usable.
 */
export function assignGates(
  gates: readonly Gate[],
  leaving: readonly (readonly [number, number])[],
  toward: readonly (readonly [number, number])[],
  usable: (gate: Gate, index: number) => boolean,
): number[] {
  const open = gates.map((gate, index) => usable(gate, index));
  const pairs: { road: number; gate: number; cost: number }[] = [];
  const costOf = (road: number, gate: number): number => {
    const [x, z] = leaving[road]!;
    const g = gates[gate]!;
    const along = Math.atan2(z, x);
    const toward = Math.atan2(g.z, g.x);
    let delta = Math.abs(along - toward) % (Math.PI * 2);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    return delta;
  };
  /**
   * The turn a road makes out of a gate: the angle between the side's outward
   * normal and the far town as seen from the gate — `gatesToward`'s measure in
   * the bake, and not the bearing from the centre, which for a gate near the
   * corner of a city is off by forty degrees.
   */
  const facingOf = (road: number, gate: number): number => {
    const [x, z] = toward[road]!;
    const g = gates[gate]!;
    const dx = x - g.x;
    const dz = z - g.z;
    return Math.acos(Math.max(-1, Math.min(1, (dx * g.outX + dz * g.outZ) / (Math.hypot(dx, dz) || 1))));
  };
  for (let road = 0; road < leaving.length; road++) {
    for (let gate = 0; gate < gates.length; gate++) {
      if (open[gate] && facingOf(road, gate) <= GATE_FACING) pairs.push({ road, gate, cost: costOf(road, gate) });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost || a.road - b.road || a.gate - b.gate);
  const chosen = new Array<number>(leaving.length).fill(-1);
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (chosen[pair.road] !== -1 || taken.has(pair.gate)) continue;
    chosen[pair.road] = pair.gate;
    taken.add(pair.gate);
  }
  // The rest — more roads than gates facing their way — share the open gate
  // that faces their way best.
  for (let road = 0; road < leaving.length; road++) {
    if (chosen[road] !== -1) continue;
    let best = -1;
    let facing = Infinity;
    for (let gate = 0; gate < gates.length; gate++) {
      if (!open[gate]) continue;
      const f = facingOf(road, gate);
      if (f < facing) {
        facing = f;
        best = gate;
      }
    }
    chosen[road] = best;
  }
  return chosen;
}
