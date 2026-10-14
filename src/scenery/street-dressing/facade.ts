import { STOREY } from '../contract.ts';
import type { FacadeSource } from './types.ts';

/** One window on a building's front, in the variant's own space. */
export interface Window {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** The glass's plane, and the face in front of which anything hung on the wall must stand. */
  z: number;
  wall: number;
}

export interface Facade {
  front: number;
  windows: Window[];
  /** The top of the ground floor's openings, or a storey's worth where none was found. */
  groundTop: number;
  /** The ground floor's openings, which the shop's awnings go over. */
  ground: Window[];
  /** The upper floors' windows. */
  upper: Window[];
  /** The front wall across its ground floor: its plane and its reach along x. */
  wall: number;
  minX: number;
  maxX: number;
}

export const facades = new WeakMap<FacadeSource, Facade>();

/**
 * A variant's front: its windows and its wall, read off its own triangles.
 *
 * A window is glass, and glass is what the town lights after dark: every lit
 * mesh and every patch a painted building numbers as a window carries a
 * brightness or a bedtime byte (`flatten`'s `roll`), and nothing else does. So
 * the front-facing triangles with either byte set, gathered into patches that
 * touch, are the building's windows, and the front-facing triangles without,
 * round each of them, are the wall it sits in. The same variant is read once
 * and kept.
 */
export function facadeOf(flat: FacadeSource): Facade {
  const known = facades.get(flat);
  if (known !== undefined) return known;
  const p = flat.position;
  const n = flat.normal;
  const g = flat.glow;
  const front = flat.box.maxZ;
  interface Patch {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    z: number;
    /** Its area seen from the front. */
    area: number;
  }
  const glass: Patch[] = [];
  const walls: Patch[] = [];
  for (let t = 0; t + 8 < p.length; t += 9) {
    const v = t / 3;
    const nz = (n[t + 2]! + n[t + 5]! + n[t + 8]!) / 3;
    if (nz < 0.8) continue;
    const patch: Patch = {
      x0: Math.min(p[t]!, p[t + 3]!, p[t + 6]!),
      x1: Math.max(p[t]!, p[t + 3]!, p[t + 6]!),
      y0: Math.min(p[t + 1]!, p[t + 4]!, p[t + 7]!),
      y1: Math.max(p[t + 1]!, p[t + 4]!, p[t + 7]!),
      z: (p[t + 2]! + p[t + 5]! + p[t + 8]!) / 3,
      area: Math.abs((p[t + 3]! - p[t]!) * (p[t + 7]! - p[t + 1]!) - (p[t + 6]! - p[t]!) * (p[t + 4]! - p[t + 1]!)) / 2,
    };
    if (patch.z < front - 2) continue;
    let lit = false;
    for (let k = 0; k < 3; k++) {
      if (g[(v + k) * 2]! > 0 || g[(v + k) * 2 + 1]! > 0) lit = true;
    }
    (lit ? glass : walls).push(patch);
  }
  // Patches of glass that touch are one window. Few enough a building that
  // the square join is nothing.
  const JOIN = 0.14;
  const windows: Patch[] = [];
  for (const piece of glass) {
    let into: Patch | null = null;
    for (const window of windows) {
      if (
        piece.x0 <= window.x1 + JOIN && piece.x1 >= window.x0 - JOIN &&
        piece.y0 <= window.y1 + JOIN && piece.y1 >= window.y0 - JOIN &&
        Math.abs(piece.z - window.z) < 0.3
      ) {
        into = window;
        break;
      }
    }
    if (into === null) windows.push({ ...piece });
    else {
      into.x0 = Math.min(into.x0, piece.x0);
      into.x1 = Math.max(into.x1, piece.x1);
      into.y0 = Math.min(into.y0, piece.y0);
      into.y1 = Math.max(into.y1, piece.y1);
      into.z = Math.max(into.z, piece.z);
    }
  }
  const found: Window[] = [];
  for (const w of windows) {
    if (w.z < front - 1.2 || w.x1 - w.x0 < 0.35 || w.y1 - w.y0 < 0.35) continue;
    // The wall: the frontmost face round the window, within a hand of its glass.
    let wall = w.z;
    for (const face of walls) {
      if (face.x1 < w.x0 - 0.7 || face.x0 > w.x1 + 0.7 || face.y1 < w.y0 - 0.4 || face.y0 > w.y1 + 0.4) continue;
      if (face.z < w.z - 0.6 || face.z > w.z + 0.35) continue;
      wall = Math.max(wall, face.z);
    }
    found.push({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, z: w.z, wall });
  }
  found.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lowest = found.length > 0 ? found[0]!.y0 : Infinity;
  const ground = found.filter((w) => w.y0 < Math.min(STOREY * 0.7, lowest + 0.5));
  const groundTop = ground.length > 0 ? Math.max(...ground.map((w) => w.y1)) : STOREY * 0.8;
  // A curtain wall's glass runs floors together, and nothing hangs under it.
  const upper = found.filter((w) => !ground.includes(w) && w.y0 > groundTop - 0.05 && w.y0 > 1.5 && w.y1 - w.y0 < 1.6 * STOREY);
  // The ground floor's wall: the plane most of the front's area across the
  // band a shop's awning hangs in is in — not the frontmost face, which on a
  // house is its porch or its doorstep and would hang an awning in the air —
  // and how far along the front that plane reaches.
  const byDepth = new Map<number, number>();
  for (const face of walls) {
    if (face.y1 < 0.3 || face.y0 > groundTop + 0.6 || face.z < front - 1.5) continue;
    const bucket = Math.round(face.z / 0.05);
    byDepth.set(bucket, (byDepth.get(bucket) ?? 0) + face.area);
  }
  let wall = front;
  let most = 0;
  for (const [bucket, area] of byDepth) {
    if (area > most || (area === most && bucket * 0.05 > wall)) {
      most = area;
      wall = bucket * 0.05;
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  for (const face of walls) {
    if (face.y1 < 0.3 || face.y0 > groundTop + 0.6 || Math.abs(face.z - wall) > 0.06) continue;
    wall = Math.max(wall, face.z);
    minX = Math.min(minX, face.x0);
    maxX = Math.max(maxX, face.x1);
  }
  if (minX > maxX) {
    minX = flat.box.minX;
    maxX = flat.box.maxX;
  }
  const facade: Facade = { front, windows: found, groundTop, ground, upper, wall, minX, maxX };
  facades.set(flat, facade);
  return facade;
}
