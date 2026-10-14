import type * as THREE from 'three';
import { flightRect } from '../../scenery/floor.ts';
import { cellCentre } from '../../scenery/grid.ts';
import { DASH, GROUND_LIFT, LINE_HALF, MARKED_STREET, ZEBRA, ZEBRA_STRIPE, cellKey, cellTone, pavementOf } from '../../scenery/ground.ts';
import type { GroundJob, Mouth } from './job.ts';
import { litAround } from './writer.ts';

/**
 * The paving of every paved cell: a street plan drawn flush on its terrace.
 * A street is a band of the cell's own surface, coloured (carriageway, dashed
 * line, pavement), never a ribbon over it; the yard behind takes the cell's
 * tone; the middle crossing gets zebras; a street with nothing beyond it ends
 * in a kerb; and a ramp or a gate's mouth is a hole the paving leaves for the
 * surface drawn there.
 */

/** A street through a cell along one axis: its centre line as a share of the cell across it, and its half-width. */
interface Street {
  centre: number;
  half: number;
}

type Role = 'yard' | 'walk' | 'road' | 'line';

/** One cell's cut: where its pieces start and stop, and what each piece is. */
interface CellCut {
  x0: number;
  z0: number;
  plaza: boolean;
  crossing: boolean;
  /** Streets running along z (lateral axis u) and along x (lateral axis v). */
  alongZ: Street[];
  alongX: Street[];
  /** A dead end's kerb depth as a share of the cell, by side: +x, +z, -x, -z. */
  ends: number[];
  us: number[];
  vs: number[];
  holes: [number, number, number, number][];
}

/** The points a cell is drawn with, reused. */
interface PaveScratch {
  q: [number[], number[], number[], number[]];
  t: [number[], number[], number[], number[]];
  m: [number[], number[], number[], number[]];
}

const point3 = (): number[] => [0, 0, 0];

export function* pavingSteps(job: GroundJob, pavedCells: ReadonlySet<number>): Generator<void, void, void> {
  const scratch: PaveScratch = {
    q: [point3(), point3(), point3(), point3()],
    t: [point3(), point3(), point3(), point3()],
    m: [point3(), point3(), point3(), point3()],
  };
  for (const [key, level] of job.levels) {
    yield;
    paveCell(job, scratch, key, level, pavedCells);
  }
}

function paveCell(job: GroundJob, s: PaveScratch, key: number, level: number, pavedCells: ReadonlySet<number>): void {
  const { frame, grid, pitch, slot, colours } = job;
  const col = Math.floor(key / 1024) - 512;
  const row = (key % 1024) - 512;
  const a = frame.cornerAt(col, row);
  const b = frame.cornerAt(col + 1, row);
  const c = frame.cornerAt(col + 1, row + 1);
  const d = frame.cornerAt(col, row + 1);
  const top = level + GROUND_LIFT;
  frame.pointAt(a, top, s.t[0]);
  frame.pointAt(b, top, s.t[1]);
  frame.pointAt(c, top, s.t[2]);
  frame.pointAt(d, top, s.t[3]);
  job.writer.lit = litAround(job.emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);

  // The yard takes the land's mosaic tone, so the one made surface has the land's grain.
  colours.cell.copy(pavedCells.has(key) ? colours.walk : job.outerYard(col, row) ? colours.land : colours.yard).multiplyScalar(cellTone(slot.seed, col, row));
  const plaza = frame.blocked(cellCentre(grid, col), cellCentre(grid, row));
  // The middle of a town with a middle cell: an unmarked crossing with a zebra across each mouth.
  const crossing = !plaza && key === job.plazaKey;
  const cut = cutCell(job, key, col, row, plaza, crossing);
  drawPieces(job, s, cut);
  for (const mouth of job.mouthsIn.get(key) ?? []) drawMouth(job, s, mouth, level + GROUND_LIFT, colours.cell);
}

/**
 * The streets through a cell. A band is paved half by the cell on each side,
 * and only where both are town; a landmark's parcel has no street through it,
 * and paves its half of a band only where the cell across is the town's.
 */
function streetsOf(job: GroundJob, col: number, row: number, plaza: boolean, crossing: boolean): { alongZ: Street[]; alongX: Street[] } {
  const { grid, pitch, band, levels, frame } = job;
  const streetsOn = (index: number, across: (step: number) => boolean): Street[] => {
    const list: Street[] = [];
    if (grid.avenue[index] === 1) list.push({ centre: 0.5, half: pitch * 0.5 });
    else {
      if (grid.low[index] === 1 && across(-1)) list.push({ centre: 0, half: band });
      if (grid.high[index] === 1 && across(1)) list.push({ centre: 1, half: band });
    }
    return list;
  };
  const alongZ = crossing ? []
    : plaza ? streetsOn(col, (step) => levels.has(cellKey(col + step, row)) && !frame.parcelCell(col + step, row)).filter((street) => street.centre !== 0.5)
    : streetsOn(col, (step) => levels.has(cellKey(col + step, row)));
  const alongX = crossing ? []
    : plaza ? streetsOn(row, (step) => levels.has(cellKey(col, row + step)) && !frame.parcelCell(col, row + step)).filter((street) => street.centre !== 0.5)
    : streetsOn(row, (step) => levels.has(cellKey(col, row + step)));
  return { alongZ, alongX };
}

/** Where a cell is cut across one axis: the kerbs, pavements and lines of its streets, the dashes, and a crossing's zebras. */
function cutsFor(job: GroundJob, streets: Street[], lengthwise: boolean, origin: number, crossing: boolean): number[] {
  const { pitch, marked } = job;
  const list = new Set<number>([0, 1]);
  for (const street of streets) {
    const sign = street.centre === 0 ? 1 : street.centre === 1 ? -1 : 0;
    const edges = sign === 0 ? [-1, 1] : [sign];
    for (const e of edges) {
      list.add(street.centre + (e * street.half) / pitch);
      list.add(street.centre + (e * (street.half - pavementOf(street.half))) / pitch);
      if (marked && street.half * 2 >= MARKED_STREET) list.add(street.centre + (e * LINE_HALF) / pitch);
    }
  }
  // Along a marked street the dashes cut its length.
  if (lengthwise && marked) {
    for (let k = Math.ceil(origin / DASH); k * DASH < origin + pitch; k++) list.add((k * DASH - origin) / pitch);
  }
  if (crossing) {
    // The zebras: their depth in from each mouth, and their stripes across it.
    const walk = pavementOf(pitch * 0.5) / pitch;
    list.add(walk).add(1 - walk).add(ZEBRA / pitch).add(1 - ZEBRA / pitch);
    for (let t = walk + ZEBRA_STRIPE / pitch; t < 1 - walk - 1e-6; t += ZEBRA_STRIPE / pitch) list.add(t);
  }
  return [...list].filter((t) => t >= 0 && t <= 1).sort((m, n) => m - n);
}

/**
 * A street that runs off the town with no road beyond it ends in a kerb, a
 * pavement across its end as wide as its own: `ends[side]` is that depth as a
 * share of the cell, or 0 where the street goes on.
 */
function endsOf(job: GroundJob, col: number, row: number, alongX: Street[], alongZ: Street[], crossing: boolean): number[] {
  const { pitch, levels, frame } = job;
  const ends = [0, 0, 0, 0];
  /** Whether the street goes on: the next cell is town, and for a band so is the cell across the band from it. */
  const goesOn = (dc: number, dr: number, street: { centre: number }): boolean => {
    const nc = col + dc;
    const nr = row + dr;
    if (!levels.has(cellKey(nc, nr))) return false;
    // Into a landmark's parcel only along its edge, where the cell across is the town's.
    if (street.centre === 0.5) return !frame.parcelCell(nc, nr);
    const step = street.centre === 0 ? -1 : 1;
    const pc = dc !== 0 ? nc : col + step;
    const pr = dc !== 0 ? row + step : nr;
    return levels.has(cellKey(pc, pr)) && !(frame.parcelCell(nc, nr) && frame.parcelCell(pc, pr));
  };
  const endOf = (side: number, dc: number, dr: number, streets: Street[]): void => {
    if (job.roadEnds.has(cellKey(col, row) * 4 + side)) return;
    for (const street of streets) {
      if (goesOn(dc, dr, street)) continue;
      ends[side] = Math.max(ends[side]!, pavementOf(street.half) / pitch);
    }
  };
  endOf(0, 1, 0, alongX);
  endOf(2, -1, 0, alongX);
  endOf(1, 0, 1, alongZ);
  endOf(3, 0, -1, alongZ);
  // A crossing's four arms are avenues; one whose next cell is gone closes with a kerb.
  if (crossing) {
    const avenue = [{ centre: 0.5, half: pitch * 0.5 }];
    endOf(0, 1, 0, avenue);
    endOf(2, -1, 0, avenue);
    endOf(1, 0, 1, avenue);
    endOf(3, 0, -1, avenue);
  }
  return ends;
}

/**
 * Every cut of a cell, with its dead-end kerbs and its holes: a ramp is the
 * only surface over its footprint (its fill and cut are drawn by the ramp),
 * and a gate's mouth is drawn by `drawMouth`.
 */
function cutCell(job: GroundJob, key: number, col: number, row: number, plaza: boolean, crossing: boolean): CellCut {
  const { grid, pitch, field } = job;
  const x0 = cellCentre(grid, col) - pitch * 0.5;
  const z0 = cellCentre(grid, row) - pitch * 0.5;
  const { alongZ, alongX } = streetsOf(job, col, row, plaza, crossing);
  const dashedZ = alongZ.some((street) => street.half * 2 >= MARKED_STREET);
  const dashedX = alongX.some((street) => street.half * 2 >= MARKED_STREET);
  const us = cutsFor(job, alongZ, dashedX, x0, crossing);
  const vs = cutsFor(job, alongX, dashedZ, z0, crossing);
  const ends = endsOf(job, col, row, alongX, alongZ, crossing);
  const capCut = (list: number[], low: number, high: number): number[] => {
    if (low > 0) list.push(low);
    if (high > 0) list.push(1 - high);
    return [...new Set(list)].sort((m, n) => m - n);
  };
  const usCapped = capCut([...us], ends[2]!, ends[0]!);
  const vsCapped = capCut([...vs], ends[3]!, ends[1]!);
  const holes = (field.touching?.get(key) ?? []).filter((flight) => flight.ramp).map((flight) => flightRect(flight));
  for (const mouth of job.mouthsIn.get(key) ?? []) holes.push(mouth.rect);
  for (const [hx0, hx1, hz0, hz1] of holes) {
    for (const x of [hx0, hx1]) {
      const u = (x - x0) / pitch;
      if (u > 1e-6 && u < 1 - 1e-6) usCapped.push(u);
    }
    for (const z of [hz0, hz1]) {
      const v = (z - z0) / pitch;
      if (v > 1e-6 && v < 1 - 1e-6) vsCapped.push(v);
    }
  }
  if (holes.length > 0) {
    usCapped.sort((m, n) => m - n);
    vsCapped.sort((m, n) => m - n);
  }
  return { x0, z0, plaza, crossing, alongZ, alongX, ends, us: usCapped, vs: vsCapped, holes };
}

/** Where a point of the cell falls across the streets on one axis. */
function roleAcross(job: GroundJob, streets: Street[], t: number): Role {
  let best: Role = 'yard';
  for (const street of streets) {
    const lateral = Math.abs(t - street.centre) * job.pitch;
    if (lateral > street.half) continue;
    const role = lateral > street.half - pavementOf(street.half) ? 'walk' : job.marked && street.half * 2 >= MARKED_STREET && lateral < LINE_HALF ? 'line' : 'road';
    if (best === 'yard' || role === 'road' || role === 'line') best = role;
  }
  return best;
}

const dashOn = (coordinate: number): boolean => Math.floor(coordinate / DASH + 1e-6) % 2 === 0;

/** The colour of the piece centred at `(uc, vc)` of a cell. */
function tintOf(job: GroundJob, cut: CellCut, roleU: Role, roleV: Role, uc: number, vc: number): THREE.Color {
  const { pitch, colours } = job;
  const { ends } = cut;
  // Inside a dead end's kerb, across the street it closes.
  const cappedZ = roleU !== 'yard' && ((ends[3]! > 0 && vc < ends[3]!) || (ends[1]! > 0 && vc > 1 - ends[1]!));
  const cappedX = roleV !== 'yard' && ((ends[2]! > 0 && uc < ends[2]!) || (ends[0]! > 0 && uc > 1 - ends[0]!));
  if (cut.plaza && roleU === 'yard' && roleV === 'yard') return colours.plaza;
  if (cut.crossing) {
    const walk = pavementOf(pitch * 0.5) / pitch;
    const edgeU = uc < walk || uc > 1 - walk;
    const edgeV = vc < walk || vc > 1 - walk;
    // A zebra across every mouth that goes on; a closed one has its kerb instead.
    const mouthU = (uc < ZEBRA / pitch && ends[2] === 0) || (uc > 1 - ZEBRA / pitch && ends[0] === 0);
    const mouthV = (vc < ZEBRA / pitch && ends[3] === 0) || (vc > 1 - ZEBRA / pitch && ends[1] === 0);
    const stripe = (t: number) => Math.floor((t - walk) / (ZEBRA_STRIPE / pitch)) % 2 === 0;
    const closed = (ends[3]! > 0 && vc < ends[3]!) || (ends[1]! > 0 && vc > 1 - ends[1]!) ||
      (ends[2]! > 0 && uc < ends[2]!) || (ends[0]! > 0 && uc > 1 - ends[0]!);
    if ((edgeU && edgeV) || closed) return colours.walk;
    if (mouthV && !mouthU && !edgeU) return stripe(uc) ? colours.line : colours.road;
    if (mouthU && !mouthV && !edgeV) return stripe(vc) ? colours.line : colours.road;
    return colours.road;
  }
  if (roleU === 'yard' && roleV === 'yard') return colours.cell;
  if ((cappedZ && roleV === 'yard') || (cappedX && roleU === 'yard')) return colours.walk;
  if (roleU === 'yard' || roleV === 'yard') {
    // One street here: its own section, and its line dashed along it.
    const role = roleU === 'yard' ? roleV : roleU;
    const along = roleU === 'yard' ? cut.x0 + uc * pitch : cut.z0 + vc * pitch;
    return role === 'walk' ? colours.walk : role === 'line' && dashOn(along) ? colours.line : colours.road;
  }
  // Where two streets cross the pavement turns the corner and the carriageway is unmarked.
  return roleU === 'walk' && roleV === 'walk' ? colours.walk : colours.road;
}

/** Bilinear point inside a cell, from four points on its terrace. */
function inside(t: readonly number[][], u: number, v: number, target: number[]): number[] {
  const [a, b, c, d] = t as [number[], number[], number[], number[]];
  const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
  target[0] = a[0]! * w0 + b[0]! * w1 + c[0]! * w2 + d[0]! * w3;
  target[1] = a[1]! * w0 + b[1]! * w1 + c[1]! * w2 + d[1]! * w3;
  target[2] = a[2]! * w0 + b[2]! * w1 + c[2]! * w2 + d[2]! * w3;
  return target;
}

function drawPieces(job: GroundJob, s: PaveScratch, cut: CellCut): void {
  const { pitch } = job;
  const { us, vs, holes } = cut;
  const [q0, q1, q2, q3] = s.q;
  const inHole = (u: number, v: number): boolean => {
    const x = cut.x0 + u * pitch;
    const z = cut.z0 + v * pitch;
    return holes.some(([hx0, hx1, hz0, hz1]) => x > hx0 && x < hx1 && z > hz0 && z < hz1);
  };
  for (let iu = 0; iu < us.length - 1; iu++) {
    const u0 = us[iu]!;
    const u1 = us[iu + 1]!;
    if (u1 - u0 < 1e-6) continue;
    const uc = (u0 + u1) * 0.5;
    const roleU = roleAcross(job, cut.alongZ, uc);
    for (let iv = 0; iv < vs.length - 1; iv++) {
      const v0 = vs[iv]!;
      const v1 = vs[iv + 1]!;
      if (v1 - v0 < 1e-6) continue;
      const vc = (v0 + v1) * 0.5;
      if (holes.length > 0 && inHole(uc, vc)) continue;
      const roleV = roleAcross(job, cut.alongX, vc);
      inside(s.t, u0, v0, q0);
      inside(s.t, u1, v0, q1);
      inside(s.t, u1, v1, q2);
      inside(s.t, u0, v1, q3);
      const tint = tintOf(job, cut, roleU, roleV, uc, vc);
      job.writer.pushQuad(job.out, q0, q1, q2, q3, tint, tint, tint, tint);
    }
  }
}

/**
 * One cell's half of a gate's mouth, or the whole of an avenue's: over
 * `flare` in from the kerb, the carriageway runs from the road's half-width to
 * the street's and the pavement's outer edge from the road's to the street's,
 * so the road's kerb line turns into the street's at a slant. Beyond the
 * pavement is the plot's ground; the centre line is dashed on the street's
 * phase where marked. All level at the cell's paving.
 */
function drawMouth(job: GroundJob, s: PaveScratch, { gate, mouth, side }: Mouth, surface: number, yard: THREE.Color): void {
  const { colours, frame } = job;
  const [mp0, mp1, mp2, mp3] = s.m;
  const flare = mouth.flare;
  const inner = mouth.street - mouth.walk;
  const outer = Math.max(mouth.edge, mouth.street);
  const carriage = (s: number): number => mouth.carriage + (inner - mouth.carriage) * (s / flare);
  const edge = (s: number): number => mouth.edge + (Math.max(mouth.street, inner) - mouth.edge) * (s / flare);
  const pavement = (s: number): number => (gate.cells.length < 2 ? mouth.street : edge(s));
  const lined = job.marked && mouth.carriage * 2 >= MARKED_STREET;
  const point = (s: number, t: number, into: number[]): number[] =>
    gate.outX !== 0
      ? frame.pointIn(gate.x - gate.outX * s, gate.z + t, surface, into)
      : frame.pointIn(gate.x + t, gate.z - gate.outZ * s, surface, into);
  const cuts = new Set<number>([0, flare]);
  if (lined) {
    const along = gate.outX !== 0 ? gate.x : gate.z;
    const out = gate.outX !== 0 ? gate.outX : gate.outZ;
    for (let k = Math.ceil(Math.min(along, along - out * flare) / DASH); k * DASH < Math.max(along, along - out * flare); k++) {
      const s = (along - k * DASH) * out;
      if (s > 1e-6 && s < flare - 1e-6) cuts.add(s);
    }
  }
  const ss = [...cuts].sort((m, n) => m - n);
  for (const sign of side === 0 ? [-1, 1] : [side]) {
    for (let i = 0; i + 1 < ss.length; i++) {
      const sa = ss[i]!;
      const sb = ss[i + 1]!;
      const coordinate = gate.outX !== 0 ? gate.x - gate.outX * (sa + sb) * 0.5 : gate.z - gate.outZ * (sa + sb) * 0.5;
      const dashed = lined && Math.floor(coordinate / DASH + 1e-6) % 2 === 0;
      const bands: [number, number, number, number, THREE.Color][] = [
        [dashed ? LINE_HALF : 0, dashed ? LINE_HALF : 0, carriage(sa), carriage(sb), colours.road],
        [carriage(sa), carriage(sb), pavement(sa), pavement(sb), colours.walk],
        [pavement(sa), pavement(sb), outer, outer, yard],
      ];
      if (dashed) bands.unshift([0, 0, LINE_HALF, LINE_HALF, colours.line]);
      for (const [a0, a1, b0, b1, tint] of bands) {
        if (b0 - a0 < 1e-6 && b1 - a1 < 1e-6) continue;
        job.writer.pushQuad(
          job.out,
          point(sa, sign * a0, mp0), point(sb, sign * a1, mp1),
          point(sb, sign * b1, mp2), point(sa, sign * b0, mp3),
          tint, tint, tint, tint,
        );
      }
    }
  }
}
