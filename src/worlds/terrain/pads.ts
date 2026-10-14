/**
 * The pads: every settlement and landmark has a disc of ground levelled to a
 * plane. The plane is the one tangent to the sphere at the pad's centre, not a
 * constant height: a town is built on a flat floor in its own frame, and over a
 * 150-unit town on Mars the sphere falls 1.3 units away from that floor at the
 * edge. Levelled to the plane, everything a town stands up in its own frame is
 * on the ground, and the foot finds the same plane.
 */

import { townRadii } from '../../system/contract.ts';
import { latOf, lonOf, toUnit } from '../../sphere.ts';
import type { WorldSpec } from '../contract.ts';
import { smooth } from './color.ts';
import type { Pad } from './types.ts';

/** Pads hashed by a coarse lattice of latitude and longitude, as the bare spots are. */
const PAD_CELL = 2;
const NO_PADS: Pad[] = [];
const padCellOf = (lat: number, lon: number): number => Math.floor((lat + 90) / PAD_CELL) * 4096 + Math.floor((((lon % 360) + 540) % 360) / PAD_CELL);

export interface Pads {
  pads: Pad[];
  /** Levels the height `h` at a direction toward every pad whose levelling reaches it. */
  level(h: number, x: number, y: number, z: number, lat: number, lon: number): number;
  /** The pad a direction stands in, if any. */
  padAt(x: number, y: number, z: number): Pad | null;
}

/** Two unit tangents at a pad's centre. */
function tangentOf(pad: { x: number; y: number; z: number }): { e: { x: number; y: number; z: number }; n: { x: number; y: number; z: number } } {
  const ref = Math.abs(pad.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const d = ref.x * pad.x + ref.y * pad.y + ref.z * pad.z;
  const n = { x: ref.x - pad.x * d, y: ref.y - pad.y * d, z: ref.z - pad.z * d };
  const ln = Math.hypot(n.x, n.y, n.z);
  n.x /= ln;
  n.y /= ln;
  n.z /= ln;
  const e = { x: n.y * pad.z - n.z * pad.y, y: n.z * pad.x - n.x * pad.z, z: n.x * pad.y - n.y * pad.x };
  return { e, n };
}

/** Lays out the pads (levelled to `raw`, the field before any pad) and indexes them. */
export function createPads(spec: WorldSpec, radius: number, raw: (x: number, y: number, z: number, lat: number, lon: number) => number): Pads {
  const body = spec.body;
  const relief = spec.relief;
  const pads: Pad[] = [];
  const unit = [0, 0, 0];
  const addPad = (id: string, lat: number, lon: number, built: number): void => {
    toUnit(lat, lon, unit);
    const [x, y, z] = unit as [number, number, number];
    const reach = built * relief.padReach;
    pads.push({
      id,
      x,
      y,
      z,
      radius: built,
      reach,
      height: raw(x, y, z, lat, lon),
      cosInner: Math.cos(built / radius),
      cosOuter: Math.cos(reach / radius),
    });
  };
  const built = townRadii(body, spec.landmarks);
  for (const place of body.settlements) addPad(place.id, place.lat, place.lon, built.get(place.id)!);
  for (const landmark of spec.landmarks) addPad(landmark.id, landmark.lat, landmark.lon, landmark.radius);
  if (relief.padGrade !== undefined && relief.padGrade > 0) widenOnSlopes(relief.padGrade);

  // Every height asked of the ground would otherwise go through every pad on
  // the world (six hundred on Neptune); this hash leaves the few whose
  // levelling reaches its cell.
  const padCells = new Map<number, Pad[]>();
  for (const pad of pads) {
    const lat = latOf(pad.y);
    const lon = lonOf(pad.x, pad.z);
    const span = (Math.acos(Math.min(1, pad.cosOuter)) * 180) / Math.PI;
    // Widened for the cap's highest latitude, where a degree of longitude is shortest.
    const widen = 1 / Math.max(0.05, Math.cos((Math.min(89.9, Math.abs(lat) + span) * Math.PI) / 180));
    for (let dLat = -span; dLat <= span + PAD_CELL; dLat += PAD_CELL) {
      for (let dLon = -span * widen; dLon <= span * widen + PAD_CELL; dLon += PAD_CELL) {
        const key = padCellOf(Math.max(-90, Math.min(89.999, lat + dLat)), lon + dLon);
        const list = padCells.get(key);
        if (list === undefined) padCells.set(key, [pad]);
        else if (list[list.length - 1] !== pad) list.push(pad);
      }
    }
    // Near a pole a cell is every longitude: a pad there reaches them all.
    if (Math.abs(lat) + span > 90 - PAD_CELL) {
      for (let l = -180; l < 180; l += PAD_CELL) {
        for (let r = Math.max(-90, lat - span); r <= Math.min(89.999, lat + span + PAD_CELL); r += PAD_CELL) {
          const key = padCellOf(Math.min(89.999, r), l);
          const list = padCells.get(key);
          if (list === undefined) padCells.set(key, [pad]);
          else if (!list.includes(pad)) list.push(pad);
        }
      }
    }
  }
  const padsNear = (lat: number, lon: number): Pad[] => padCells.get(padCellOf(Math.max(-90, Math.min(89.999, lat)), lon)) ?? NO_PADS;

  /**
   * A pad on a slope reaches as far as the land needs to come back to it at
   * `grade`: the worst rise or fall between the pad's plane and the raw ground
   * eight ways round, at the default reach, sets the run. Then no two pads may
   * meet, so where two widened pads would, both give back what they gained in
   * proportion — never below the default reach, which the layout already
   * keeps apart.
   */
  function widenOnSlopes(grade: number): void {
    const p = { x: 0, y: 0, z: 0 };
    const wanted = pads.map((pad) => {
      const out = tangentOf(pad);
      let worst = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const along = pad.reach / radius;
        const c = Math.cos(along);
        const sn = Math.sin(along);
        p.x = pad.x * c + (out.e.x * Math.cos(a) + out.n.x * Math.sin(a)) * sn;
        p.y = pad.y * c + (out.e.y * Math.cos(a) + out.n.y * Math.sin(a)) * sn;
        p.z = pad.z * c + (out.e.z * Math.cos(a) + out.n.z * Math.sin(a)) * sn;
        worst = Math.max(worst, Math.abs(raw(p.x, p.y, p.z, latOf(p.y), lonOf(p.x, p.z)) - pad.height));
      }
      return Math.min(pad.radius * 4, Math.max(pad.reach, pad.radius + worst / grade));
    });
    const reach = [...wanted];
    for (let a = 0; a < pads.length; a++) {
      for (let b = a + 1; b < pads.length; b++) {
        const A = pads[a]!;
        const B = pads[b]!;
        const d = Math.acos(Math.min(1, A.x * B.x + A.y * B.y + A.z * B.z)) * radius;
        if (d >= reach[a]! + reach[b]!) continue;
        const room = Math.max(0, d - A.reach - B.reach) * 0.98;
        const gainA = reach[a]! - A.reach;
        const gainB = reach[b]! - B.reach;
        const share = gainA + gainB > 0 ? room / (gainA + gainB) : 0;
        reach[a] = A.reach + Math.min(gainA, gainA * share);
        reach[b] = B.reach + Math.min(gainB, gainB * share);
      }
    }
    pads.forEach((pad, k) => {
      pad.reach = reach[k]!;
      pad.cosOuter = Math.cos(pad.reach / radius);
    });
  }

  function level(h: number, x: number, y: number, z: number, lat: number, lon: number): number {
    for (const pad of padsNear(lat, lon)) {
      const dot = x * pad.x + y * pad.y + z * pad.z;
      if (dot <= pad.cosOuter) continue;
      const w = smooth(pad.cosOuter, pad.cosInner, dot);
      // Level means a plane, the one tangent to the sphere at the pad's
      // centre, and not a constant height: a town is built on a flat floor in
      // its own frame, and over a 150-unit town on Mars the sphere falls 1.3
      // units away from that floor at the edge. Levelled to the plane, every
      // building, paving stone and person the town stands up in its own
      // frame is on the ground, and the foot finds the same plane.
      const plane = (radius + pad.height) / dot - radius;
      h += (plane - h) * w;
    }
    return h;
  }

  function padAt(x: number, y: number, z: number): Pad | null {
    const length = Math.hypot(x, y, z) || 1;
    for (const pad of padsNear(latOf(y / length), lonOf(x, z))) {
      if ((x * pad.x + y * pad.y + z * pad.z) / length > pad.cosInner) return pad;
    }
    return null;
  }

  return { pads, level, padAt };
}
