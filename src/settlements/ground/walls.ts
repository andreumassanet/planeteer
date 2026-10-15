import * as THREE from 'three';
import { PLANET_RADIUS, groundColorAt } from '../../globe.ts';
import { apronCorner } from '../../scenery/floor.ts';
import type { Flight } from '../../scenery/floor.ts';
import { cornerOffset } from '../../scenery/grid.ts';
import { GROUND_LIFT, KERB_DROP, cellKey, cellTone } from '../../scenery/ground.ts';
import type { Corner } from '../frame.ts';
import type { GroundJob } from './job.ts';
import { litAround } from './writer.ts';

/** The floor's vertical faces, and the edge slope round it. */

/** Draws vertical faces in the kerb's colours, from the paving's side. */
interface WallPen {
  /** A face along a cell edge, from a height of its own at each corner down to one of its own at each. */
  wall(p: Corner, q: Corner, topP: number, topQ: number, footP: number, footQ: number, outX: number, outZ: number): void;
  /** A riser along `p`–`q`, less the stretch each flight standing below it has taken (its top step is the riser there). */
  riser(p: Corner, q: Corner, top: number, foot: number, outX: number, outZ: number, below: readonly Flight[] | undefined): void;
}

function wallPen(job: GroundJob): WallPen {
  const { frame, colours, writer, out } = job;
  const wallTop: number[] = [0, 0, 0];
  const wallFoot: number[] = [0, 0, 0];
  const wallFoot2: number[] = [0, 0, 0];
  const wallTop2: number[] = [0, 0, 0];
  const wall = (
    p: Corner, q: Corner, topP: number, topQ: number, footP: number, footQ: number, outX: number, outZ: number,
  ): void => {
    if (topP - footP < 1e-6 && topQ - footQ < 1e-6) return;
    writer.pushWall(
      out,
      frame.pointAt(p, topP, wallTop), frame.pointAt(p, footP, wallFoot),
      frame.pointAt(q, footQ, wallFoot2), frame.pointAt(q, topQ, wallTop2),
      colours.kerbTop, colours.kerbFoot, colours.kerbFoot, colours.kerbTop, outX, outZ,
    );
  };
  const riser = (
    p: Corner, q: Corner, top: number, foot: number, outX: number, outZ: number,
    below: readonly Flight[] | undefined,
  ): void => {
    const axis = outX !== 0 ? 0 : 1;
    const line = axis === 0 ? p.x : p.z;
    const gaps: [number, number][] = [];
    for (const flight of below ?? []) {
      if (flight.axis === axis && Math.abs(flight.at - line) < 1e-6) gaps.push([flight.from, flight.to]);
    }
    if (gaps.length === 0) {
      wall(p, q, top, top, foot, foot, outX, outZ);
      return;
    }
    gaps.sort((m, n) => m[0] - n[0]);
    const piece = (s0: number, s1: number): void => {
      if (s1 - s0 < 1e-6) return;
      const x0 = axis === 0 ? line : s0;
      const z0 = axis === 0 ? s0 : line;
      const x1 = axis === 0 ? line : s1;
      const z1 = axis === 0 ? s1 : line;
      writer.pushWall(
        out,
        frame.pointIn(x0, z0, top, wallTop), frame.pointIn(x0, z0, foot, wallFoot),
        frame.pointIn(x1, z1, foot, wallFoot2), frame.pointIn(x1, z1, top, wallTop2),
        colours.kerbTop, colours.kerbFoot, colours.kerbFoot, colours.kerbTop, outX, outZ,
      );
    };
    let from = axis === 0 ? p.z : p.x;
    for (const [g0, g1] of gaps) {
      piece(from, Math.max(from, g0));
      from = Math.max(from, g1);
    }
    piece(from, axis === 0 ? q.z : q.x);
  };
  return { wall, riser };
}

/**
 * The faces the floor still draws vertical, each by its higher cell: a riser
 * down to a lower terrace (cut round any flight that climbs it), a quay down
 * to `KERB_DROP` under the ground where the sea or a landmark is next door,
 * and the face down to a slope laid from a lower terrace.
 */
export function* wallSteps(job: GroundJob): Generator<void, void, void> {
  const { frame, levels, field, pitch } = job;
  const pen = wallPen(job);
  for (const [key, level] of levels) {
    yield;
    const col = Math.floor(key / 1024) - 512;
    const row = (key % 1024) - 512;
    const a = frame.cornerAt(col, row);
    const b = frame.cornerAt(col + 1, row);
    const c = frame.cornerAt(col + 1, row + 1);
    const d = frame.cornerAt(col, row + 1);
    job.writer.lit = litAround(job.emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);
    const top = level + GROUND_LIFT;
    const edge = (p: Corner, q: Corner, dc: number, dr: number): void => {
      const near = cellKey(col + dc, row + dr);
      const beside = levels.get(near);
      if (beside !== undefined) {
        if (beside < level) pen.riser(p, q, top, beside + GROUND_LIFT, dc, dr, field.flights?.get(near));
        return;
      }
      const apron = field.aprons?.get(near);
      if (apron !== undefined) {
        pen.wall(p, q, top, top, apron.top, apron.top, dc, dr);
        return;
      }
      // A quay: a corner in the water is on the water (`cornerAt`), so its face runs under sea level.
      pen.wall(p, q, top, top, p.elevation - KERB_DROP, q.elevation - KERB_DROP, dc, dr);
    };
    job.writer.cut = job.cutFor(key);
    edge(a, d, -1, 0);
    edge(b, c, 1, 0);
    edge(a, b, 0, -1);
    edge(d, c, 0, 1);
    job.writer.cut = null;
  }
}

/**
 * The edge slope: one course of cells round the paving, each two triangles
 * from its owner's paving down to its foot under the ground, along the
 * diagonal `buildFloor` chose, in the land's own colour at each corner and the
 * cell's mosaic tone. Where two slope cells start from different terraces they
 * meet in a wedge, and where one runs against a quay or a landmark it gets a
 * side down to the ground; both drawn by the higher side.
 */
export function* apronSteps(job: GroundJob): Generator<void, void, void> {
  const { frame, world, levels, field, pitch, grid, slot, colours } = job;
  const pen = wallPen(job);
  const sa: number[] = [0, 0, 0];
  const sb: number[] = [0, 0, 0];
  const sc: number[] = [0, 0, 0];
  const sd: number[] = [0, 0, 0];
  const dir = new THREE.Vector3();
  /** `groundColorAt` at lattice corner `(i, j)`, each corner asked once. */
  const groundColors = new Map<number, THREE.Color>();
  const groundAtCorner = (i: number, j: number): THREE.Color => {
    const key = cellKey(i, j);
    let found = groundColors.get(key);
    if (found === undefined) {
      frame.directionAt(cornerOffset(grid, i), cornerOffset(grid, j), dir);
      found = groundColorAt(world, dir.multiplyScalar(PLANET_RADIUS), new THREE.Color());
      groundColors.set(key, found);
    }
    return found;
  };
  const [k0, k1, k2, k3] = colours.apron;
  for (const [key, apron] of field.aprons ?? []) {
    yield;
    const col = Math.floor(key / 1024) - 512;
    const row = (key % 1024) - 512;
    const a = frame.cornerAt(col, row);
    const b = frame.cornerAt(col + 1, row);
    const c = frame.cornerAt(col + 1, row + 1);
    const d = frame.cornerAt(col, row + 1);
    job.writer.lit = litAround(job.emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);
    frame.pointAt(a, apronCorner(field, apron, col, row), sa);
    frame.pointAt(b, apronCorner(field, apron, col + 1, row), sb);
    frame.pointAt(c, apronCorner(field, apron, col + 1, row + 1), sc);
    frame.pointAt(d, apronCorner(field, apron, col, row + 1), sd);
    const tone = cellTone(slot.seed, col, row);
    k0.copy(groundAtCorner(col, row)).multiplyScalar(tone);
    k1.copy(groundAtCorner(col + 1, row)).multiplyScalar(tone);
    k2.copy(groundAtCorner(col + 1, row + 1)).multiplyScalar(tone);
    k3.copy(groundAtCorner(col, row + 1)).multiplyScalar(tone);
    if (apron.diagonal === 0) job.writer.pushQuad(job.out, sa, sb, sc, sd, k0, k1, k2, k3);
    else job.writer.pushQuad(job.out, sb, sc, sd, sa, k1, k2, k3, k0);

    const side = (p: Corner, q: Corner, pi: number, pj: number, qi: number, qj: number, dc: number, dr: number): void => {
      const near = cellKey(col + dc, row + dr);
      if (levels.has(near)) return;
      const hp = apronCorner(field, apron, pi, pj);
      const hq = apronCorner(field, apron, qi, qj);
      const other = field.aprons?.get(near);
      if (other !== undefined) {
        if (other.top >= apron.top) return;
        pen.wall(p, q, hp, hq, apronCorner(field, other, pi, pj), apronCorner(field, other, qi, qj), dc, dr);
        return;
      }
      pen.wall(p, q, hp, hq, Math.min(hp, p.elevation - KERB_DROP), Math.min(hq, q.elevation - KERB_DROP), dc, dr);
    };
    side(a, d, col, row, col, row + 1, -1, 0);
    side(b, c, col + 1, row, col + 1, row + 1, 1, 0);
    side(a, b, col, row, col + 1, row, 0, -1);
    side(d, c, col, row + 1, col + 1, row + 1, 0, 1);
  }
}
