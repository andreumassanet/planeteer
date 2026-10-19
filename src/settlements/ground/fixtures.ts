import { BENCH_DEPTH, BENCH_SIT_AHEAD } from '../../bench.ts';
import { LAMP_POOL } from '../../lights.ts';
import { cellCentre, cellIndex, cornerOffset, gateGlow, gateMouth } from '../../scenery/grid.ts';
import { GROUND_LIFT, cellKey, pavementOf } from '../../scenery/ground.ts';
import { rngFrom } from '../../scenery/index.ts';
import {
  BENCH_CAP,
  BENCH_CHANCE,
  BENCH_FROM_LAMP,
  BENCH_OFF_LINE,
  CLEAR_LAMP,
  LAMP_CAP,
  LAMP_FLOOR,
  LAMP_MAX_CHANCE,
  LAMP_STRENGTH,
  WINDOW_SPILL,
} from '../rules.ts';
import { townHasSignals } from '../../signals.ts';
import { pavementAt } from './paving.ts';
import type { LitPlot } from '../types.ts';
import type { GroundJob } from './job.ts';

/** What the floor places on itself before it is drawn: gate mouths, lawns, lamps, benches, signals and its lights. */

/**
 * The mouths of the streets the roads come in by, by the gate cell each
 * reaches into: `gateFlare` in from the kerb and out to the wider of the road's
 * pavement and the street, on the cell's own side of the street's line.
 */
export function gateMouths(job: GroundJob): void {
  const { grid, band, gates, levels, frame, out } = job;
  for (const index of job.roads) {
    const gate = gates[index];
    if (gate === undefined) continue;
    const mouth = gateMouth(grid, gate, band);
    if (mouth.flare <= 0) continue;
    const outer = Math.max(mouth.edge, mouth.street);
    for (const [col, row] of gate.cells) {
      const key = cellKey(col, row);
      if (!levels.has(key) || frame.blocked(cellCentre(grid, col), cellCentre(grid, row))) continue;
      const across = gate.outX !== 0 ? cellCentre(grid, row) - gate.z : cellCentre(grid, col) - gate.x;
      const side = gate.cells.length < 2 ? 0 : Math.sign(across);
      const t0 = side > 0 ? 0 : -outer;
      const t1 = side < 0 ? 0 : outer;
      const s0 = gate.outX !== 0 ? gate.x - gate.outX * mouth.flare : gate.z - gate.outZ * mouth.flare;
      const along = gate.outX !== 0 ? gate.x : gate.z;
      const a0 = Math.min(along, s0);
      const a1 = Math.max(along, s0);
      const rect: [number, number, number, number] = gate.outX !== 0
        ? [a0, a1, gate.z + t0, gate.z + t1]
        : [gate.x + t0, gate.x + t1, a0, a1];
      const list = job.mouthsIn.get(key) ?? [];
      list.push({ gate, mouth, side, rect });
      job.mouthsIn.set(key, list);
      out.mouths.push(rect);
    }
  }
}

/** Marks the lawns: unpaved yards of the land's own ground, not the square and not under a landmark. */
export function markLawns(job: GroundJob, pavedCells: ReadonlySet<number>): void {
  const { style, cells, levels, grid, out } = job;
  if (style.yard === 'earth') return;
  out.lawn = new Uint8Array(cells * cells);
  for (let col = 0; col < cells; col++) {
    for (let row = 0; row < cells; row++) {
      const key = cellKey(col, row);
      if (!levels.has(key) || pavedCells.has(key) || key === job.plazaKey) continue;
      if (style.yard === 'paved' && !job.outerYard(col, row)) continue;
      if (job.frame.blocked(cellCentre(grid, col), cellCentre(grid, row))) continue;
      out.lawn[col * cells + row] = 1;
    }
  }
}

/**
 * The street lamps, at the corners of the street crossings on the kerb, on a
 * quarter of each crossing drawn from its own seed, with a bench beside some.
 */
export function placeLamps(job: GroundJob, urbanity: number): void {
  const { style, cells, grid, band, slot, out } = job;
  const chance = Math.min(
    LAMP_MAX_CHANCE,
    LAMP_FLOOR + (style.hardness - 0.3) * 0.8 + urbanity * 0.3,
  );
  /** Where the street along a lattice line sits, as an offset from that line to its kerb, or null. */
  const kerbOff = (line: number, sign: number): number | null => {
    if (line <= 0 || line >= cells) return null;
    if (grid.high[line - 1] === 1) return sign * (band - pavementOf(band) * 0.5);
    if (grid.avenue[line - 1] === 1) return 0.8;
    if (grid.avenue[line] === 1) return -0.8;
    return null;
  };
  const benches = { count: 0, spot: [] as number[] };
  let lamps = 0;
  for (let i = 1; i < cells && lamps < LAMP_CAP; i++) {
    for (let j = 1; j < cells && lamps < LAMP_CAP; j++) {
      const rng = rngFrom(slot.seed, 'lamp', i, j);
      const ox = kerbOff(i, rng.chance(0.5) ? 1 : -1);
      const oz = kerbOff(j, rng.chance(0.5) ? 1 : -1);
      if (ox === null || oz === null) continue;
      if (!rng.chance(chance)) continue;
      const lx = cornerOffset(grid, i) + ox;
      const lz = cornerOffset(grid, j) + oz;
      if (pavementAt(job, lx, lz) && job.spotAt(lx, lz, out.lamps, undefined, CLEAR_LAMP)) {
        lamps++;
        // The arm over the street along x, towards its line: local -z to world (-sign ox, 0).
        out.lampYaws.push(Math.atan2(Math.sign(ox), 0));
        if (rng.chance(BENCH_CHANCE)) benchBeside(job, benches, i, j, ox, oz, rng.chance(0.5));
      }
    }
  }
}

/**
 * A bench beside the lamp at lattice corner `(i, j)`, `BENCH_FROM_LAMP` along
 * the pavement away from the crossing, its back to the building line and its
 * face to the street: on line `i` or line `j` (`alongI` first), whichever has
 * a pavement there. Its sitter's spot must be on the same terrace and off any
 * flight, or there is no bench.
 */
function benchBeside(
  job: GroundJob, benches: { count: number; spot: number[] },
  i: number, j: number, ox: number, oz: number, alongI: boolean,
): void {
  const { grid, band, levels, out } = job;
  if (benches.count >= BENCH_CAP) return;
  const back = band - BENCH_DEPTH / 2 - BENCH_OFF_LINE;
  for (const onI of alongI ? [true, false] : [false, true]) {
    const off = onI ? ox : oz;
    const run = onI ? oz : ox;
    // A lamp on an avenue's line stands by its median: no pavement there.
    if (Math.abs(off) < 1) continue;
    const across = Math.sign(off) * back;
    const along = run + Math.sign(run) * BENCH_FROM_LAMP;
    const x = cornerOffset(grid, i) + (onI ? across : along);
    const z = cornerOffset(grid, j) + (onI ? along : across);
    // Facing the street's line: -sign(off) along the axis across it.
    const fx = onI ? -Math.sign(off) : 0;
    const fz = onI ? 0 : -Math.sign(off);
    const level = levels.get(cellKey(cellIndex(grid, x), cellIndex(grid, z)));
    if (level === undefined) continue;
    const sx = x + fx * BENCH_SIT_AHEAD;
    const sz = z + fz * BENCH_SIT_AHEAD;
    if (!job.standable(sx, sz, level)) continue;
    // The bench and the feet in front of it on the pavement, never out on the carriageway.
    if (!pavementAt(job, x, z) || !pavementAt(job, x + fx * BENCH_DEPTH, z + fz * BENCH_DEPTH)) continue;
    benches.spot.length = 0;
    if (!job.spotAt(x, z, benches.spot, Math.atan2(fx, fz), CLEAR_LAMP)) continue;
    out.benches.push(...benches.spot);
    benches.count++;
    return;
  }
}

/**
 * A kit-built city's traffic lights, one on each pavement corner of its middle
 * crossing in a pinwheel, each facing the traffic coming in by its mouth.
 */
export function placeSignals(job: GroundJob): void {
  const { grid, pitch, slot, out } = job;
  if (job.plazaKey < 0 || !townHasSignals(grid, slot.style, slot.place.pop)) return;
  const middle = cellCentre(grid, grid.shift);
  const inset = pitch * 0.5 - pavementOf(pitch * 0.5) * 0.5;
  const corners: [number, number, number, number][] = [
    [1, 1, 0, 1], [-1, 1, -1, 0], [-1, -1, 0, -1], [1, -1, 1, 0],
  ];
  for (const [sx, sz, fx, fz] of corners) {
    // The model's lamps face its -x: yaw so that -x lands on (fx, fz).
    job.spotAt(middle + sx * inset, middle + sz * inset, out.signals, Math.atan2(fz, -fx), CLEAR_LAMP);
  }
}

/**
 * Everything in the town that lights the ground. The gates first, so that
 * where one ties another at the peak its all-night hour is kept, placed at the
 * paving's height as `roads.ts` places it; then the lamps; then the buildings
 * with a window lit, their pools starting at the wall (`Emitter.inner`).
 */
export function collectEmitters(job: GroundJob, litPlots: readonly LitPlot[]): void {
  const { grid, band, gates, levels, emitters, out } = job;
  const gateAt: number[] = [0, 0, 0];
  for (const index of job.roads) {
    const gate = gates[index];
    const cell = gate?.cells[0];
    const level = cell === undefined ? undefined : levels.get(cellKey(cell[0], cell[1]));
    if (gate === undefined || level === undefined) continue;
    const glow = gateGlow(grid, gate, band);
    job.frame.pointIn(glow.x, glow.z, level + GROUND_LIFT, gateAt);
    emitters.push({ x: gateAt[0]!, z: gateAt[2]!, inner: glow.inner, reach: glow.reach, strength: 1, bed: 255 });
  }
  for (let i = 0; i + 2 < out.lamps.length; i += 3) {
    emitters.push({
      x: out.lamps[i]!,
      z: out.lamps[i + 2]!,
      inner: 0,
      reach: LAMP_POOL,
      strength: LAMP_STRENGTH,
      // Burns till dawn: `bedtimeByte`'s `BED_ALWAYS`.
      bed: 255,
    });
  }
  for (const plot of litPlots) {
    emitters.push({
      x: plot.x,
      z: plot.z,
      inner: plot.radius,
      reach: plot.radius + WINDOW_SPILL,
      strength: plot.strength,
      bed: plot.bed,
    });
  }
}
