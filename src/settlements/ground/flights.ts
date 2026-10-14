import { flightHeight, flightRun, floorLiftAt } from '../../scenery/floor.ts';
import type { Flight } from '../../scenery/floor.ts';
import { cellCentre, cellIndex } from '../../scenery/grid.ts';
import { DASH, LINE_HALF, MARKED_STREET, cellKey, pavementOf } from '../../scenery/ground.ts';
import { KERB_INK } from './job.ts';
import type { GroundJob } from './job.ts';
import { litAround } from './writer.ts';

/**
 * The ramps and flights of steps where a street crosses a riser. Every face is
 * in a plane nothing else in the town uses (a tread is a step above the paving,
 * a side is inset from the house fronts), except a side on a band's midline,
 * which is cut to stand only above what is beside it.
 */

type At = (s: number, t: number, elevation: number, into: number[]) => number[];

/** The points one flight is drawn with, reused. */
const fp0: number[] = [0, 0, 0];
const fp1: number[] = [0, 0, 0];
const fp2: number[] = [0, 0, 0];
const fp3: number[] = [0, 0, 0];

/** A point of a flight `s` along its climb and `t` across it, at an elevation. */
function pointsOf(job: GroundJob, flight: Flight): At {
  return (s, t, elevation, into) =>
    flight.axis === 0
      ? job.frame.pointIn(flight.at + flight.into * s, t, elevation, into)
      : job.frame.pointIn(t, flight.at + flight.into * s, elevation, into);
}

export function* flightSteps(job: GroundJob): Generator<void, void, void> {
  const { frame, field, pitch, grid } = job;
  for (const list of field.flights?.values() ?? []) {
    yield;
    for (const flight of list) {
      const col = Math.floor(flight.cell / 1024) - 512;
      const row = (flight.cell % 1024) - 512;
      const a = frame.cornerAt(col, row);
      const c = frame.cornerAt(col + 1, row + 1);
      job.writer.lit = litAround(job.emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);
      if (flight.ramp) {
        drawRamp(job, flight);
        continue;
      }
      drawStairs(job, flight, frame.blocked(cellCentre(grid, col), cellCentre(grid, row)));
    }
  }
}

/**
 * A ramp: the street's section (carriageway, dashed line, a pavement each
 * hand) tilted as one plane from the higher terrace to the lower, then its
 * sides.
 */
function drawRamp(job: GroundJob, flight: Flight): void {
  const { colours } = job;
  const at = pointsOf(job, flight);
  const height = (s: number): number => flightHeight(flight, s);
  const walk = pavementOf(flight.half);
  const lined = job.marked && flight.half * 2 >= MARKED_STREET;
  const across = new Set<number>([flight.from, flight.to]);
  for (const t of [
    flight.centre - (flight.half - walk), flight.centre + (flight.half - walk),
    ...(lined ? [flight.centre - LINE_HALF, flight.centre + LINE_HALF] : []),
  ]) {
    if (t > flight.from + 1e-6 && t < flight.to - 1e-6) across.add(t);
  }
  const ts = [...across].sort((m, n) => m - n);
  // Along: its two ends, and where the dashes start and stop, on the town's own plane coordinate.
  const s0 = -flight.back;
  const s1 = flight.run;
  const along = new Set<number>([s0, s1]);
  if (lined) {
    const c0 = Math.min(flight.at + flight.into * s0, flight.at + flight.into * s1);
    const c1 = Math.max(flight.at + flight.into * s0, flight.at + flight.into * s1);
    for (let k = Math.ceil(c0 / DASH); k * DASH < c1; k++) along.add((k * DASH - flight.at) * flight.into);
  }
  const ss = [...along].filter((s) => s >= s0 - 1e-9 && s <= s1 + 1e-9).sort((m, n) => m - n);
  for (let i = 0; i + 1 < ss.length; i++) {
    const sa = ss[i]!;
    const sb = ss[i + 1]!;
    if (sb - sa < 1e-6) continue;
    const coordinate = flight.at + flight.into * (sa + sb) * 0.5;
    for (let j = 0; j + 1 < ts.length; j++) {
      const ta = ts[j]!;
      const tb = ts[j + 1]!;
      if (tb - ta < 1e-6) continue;
      const lateral = Math.abs((ta + tb) * 0.5 - flight.centre);
      const tint = lateral > flight.half - walk
        ? colours.walk
        : lined && lateral < LINE_HALF && Math.floor(coordinate / DASH + 1e-6) % 2 === 0 ? colours.line : colours.road;
      job.writer.pushQuad(
        job.out,
        at(sa, ta, height(sa), fp0), at(sb, ta, height(sb), fp1),
        at(sb, tb, height(sb), fp2), at(sa, tb, height(sa), fp3),
        tint, tint, tint, tint,
      );
    }
  }
  rampSides(job, flight, at, s0, s1);
}

/**
 * A ramp's sides: from the surface down to what is beyond it, or from what is
 * beyond down to the surface, whichever is higher; a retaining wall along the
 * cut and the side of the fill. What is beyond is asked at both ends of every
 * piece, and pieces break at every cell edge and at both ends of any ramp
 * beside it (on a band, its twin slopes just as it does).
 */
function rampSides(job: GroundJob, flight: Flight, at: At, s0: number, s1: number): void {
  const { field, grid, levels, pitch, colours } = job;
  const height = (s: number): number => flightHeight(flight, s);
  const beside: Flight[] = [];
  for (const list of field.touching?.values() ?? []) {
    for (const other of list) if (other !== flight && other.axis === flight.axis && !beside.includes(other)) beside.push(other);
  }
  for (const [t, sign] of [[flight.from, -1], [flight.to, 1]] as const) {
    const probe = t + sign * 1e-3;
    const beyond = (s: number): number => {
      const x = flight.axis === 0 ? flight.at + flight.into * s : probe;
      const z = flight.axis === 0 ? probe : flight.at + flight.into * s;
      if (!levels.has(cellKey(cellIndex(grid, x), cellIndex(grid, z)))) return s < 0 ? flight.high : flight.low;
      return floorLiftAt(field, x, z, 0);
    };
    const marks = [s0, s1];
    for (let k = Math.ceil((s0 + 1e-6) / pitch); k * pitch < s1 - 1e-6; k++) marks.push(k * pitch);
    for (const other of beside) {
      if (probe < other.from || probe > other.to) continue;
      for (const end of [other.at - other.into * other.back, other.at + other.into * flightRun(other)]) {
        const s = (end - flight.at) * flight.into;
        if (s > s0 + 1e-6 && s < s1 - 1e-6) marks.push(s);
      }
    }
    marks.sort((m, n) => m - n);
    const side = (sa: number, sb: number, ha: number, hb: number, oa: number, ob: number): void => {
      // The fill stands over what is beside it and faces out; the cut is under it and faces in.
      const fill = ha + hb >= oa + ob;
      const face = fill ? sign : -sign;
      job.writer.pushWall(
        job.out,
        at(sa, t, Math.max(ha, oa), fp0), at(sa, t, Math.min(ha, oa), fp1),
        at(sb, t, Math.min(hb, ob), fp2), at(sb, t, Math.max(hb, ob), fp3),
        colours.kerbTop, colours.kerbFoot, colours.kerbFoot, colours.kerbTop,
        flight.axis === 0 ? 0 : face, flight.axis === 0 ? face : 0,
      );
    };
    for (let m = 0; m + 1 < marks.length; m++) {
      const sa = marks[m]!;
      const sb = marks[m + 1]!;
      if (sb - sa < 1e-6) continue;
      const inset = Math.min(1e-4, (sb - sa) * 0.01);
      const oa = beyond(sa + inset);
      const ob = beyond(sb - inset);
      const ha = height(sa);
      const hb = height(sb);
      const da = ha - oa;
      const db = hb - ob;
      if (Math.abs(da) < 1e-4 && Math.abs(db) < 1e-4) continue;
      if (da * db < 0) {
        // The surface passes through what is beside it: two wedges meeting at nothing.
        const u = da / (da - db);
        const sm = sa + (sb - sa) * u;
        const hm = ha + (hb - ha) * u;
        side(sa, sm, ha, hm, oa, hm);
        side(sm, sb, hm, hb, hm, ob);
      } else {
        side(sa, sb, ha, hb, oa, ob);
      }
    }
  }
}

/**
 * A flight of steps: risers facing down the stairs, treads in the pavement's
 * stone (a landmark's plaza stone in its parcel), and a side on each hand down
 * to whatever is beside it.
 */
function drawStairs(job: GroundJob, flight: Flight, inPlaza: boolean): void {
  const { colours } = job;
  const tint = inPlaza ? colours.plaza : colours.walk;
  colours.step.copy(tint).lerp(KERB_INK, 0.3);
  const run = flightRun(flight);
  const rise = (flight.high - flight.low) / flight.steps;
  const downX = flight.axis === 0 ? flight.into : 0;
  const downZ = flight.axis === 0 ? 0 : flight.into;
  const at = pointsOf(job, flight);
  for (let k = 0; k < flight.steps; k++) {
    const s = k * flight.tread;
    const top = flight.high - k * rise;
    job.writer.pushWall(
      job.out,
      at(s, flight.from, top, fp0), at(s, flight.from, top - rise, fp1),
      at(s, flight.to, top - rise, fp2), at(s, flight.to, top, fp3),
      colours.step, colours.step, colours.step, colours.step, downX, downZ,
    );
  }
  for (let k = 1; k < flight.steps; k++) {
    const h = flight.high - k * rise;
    const s0 = (k - 1) * flight.tread;
    const s1 = k * flight.tread;
    job.writer.pushQuad(
      job.out,
      at(s0, flight.from, h, fp0), at(s1, flight.from, h, fp1),
      at(s1, flight.to, h, fp2), at(s0, flight.to, h, fp3),
      tint, tint, tint, tint,
    );
  }
  stairSides(job, flight, at, run);
}

/**
 * A flight's sides, just past each edge: down to this cell's own paving on the
 * side it is inset from, or to the other half of the street, broken at every
 * tread of its own and of a twin flight beside it.
 */
function stairSides(job: GroundJob, flight: Flight, at: At, run: number): void {
  const { field, grid, levels, colours } = job;
  for (const [t, sign] of [[flight.from, -1], [flight.to, 1]] as const) {
    const probe = t + sign * 1e-3;
    const cellBeyond = (s: number): number => flight.axis === 0
      ? cellKey(cellIndex(grid, flight.at + flight.into * s), cellIndex(grid, probe))
      : cellKey(cellIndex(grid, probe), cellIndex(grid, flight.at + flight.into * s));
    const beyond = (s: number): number => {
      const cell = cellBeyond(s);
      if (cell === flight.cell || !levels.has(cell)) return flight.low;
      const x = flight.axis === 0 ? flight.at + flight.into * s : probe;
      const z = flight.axis === 0 ? probe : flight.at + flight.into * s;
      return Math.max(flight.low, floorLiftAt(field, x, z, 0));
    };
    const marks = [0, run];
    for (let k = 1; k < flight.steps - 1; k++) marks.push(k * flight.tread);
    for (const other of field.flights?.get(cellBeyond(run * 0.5)) ?? []) {
      if (other === flight || other.axis !== flight.axis || Math.abs(other.at - flight.at) > 1e-6) continue;
      for (let k = 1; k < other.steps; k++) {
        if (k * other.tread < run) marks.push(k * other.tread);
      }
    }
    marks.sort((m, n) => m - n);
    for (let m = 0; m + 1 < marks.length; m++) {
      const s0 = marks[m]!;
      const s1 = marks[m + 1]!;
      if (s1 - s0 < 1e-6) continue;
      const mid = (s0 + s1) * 0.5;
      const own = flightHeight(flight, mid);
      const bottom = beyond(mid);
      if (own - bottom < 1e-6) continue;
      job.writer.pushWall(
        job.out,
        at(s0, t, own, fp0), at(s0, t, bottom, fp1), at(s1, t, bottom, fp2), at(s1, t, own, fp3),
        colours.kerbTop, colours.kerbFoot, colours.kerbFoot, colours.kerbTop,
        flight.axis === 0 ? 0 : sign, flight.axis === 0 ? sign : 0,
      );
    }
  }
}
