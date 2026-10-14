import * as THREE from 'three';
import { cellCentre, cornerOffset, type TownGrid } from '../grid.ts';
import { EMBED, ROOF_REACH, WALL_ABOVE } from './config.ts';
import { hungAt, inHost, wallHit, type OverheadHost, type Placed } from './geometry.ts';

export interface Street {
  /** 0: the street runs along z and `line` is an x; 1: along x, and `line` is a z. */
  axis: 0 | 1;
  line: number;
  /** Half its width: the band, or half the cell on an avenue. */
  half: number;
  main: boolean;
  index: number;
}

export function streetsOf(grid: TownGrid, band: number): Street[] {
  const found: Street[] = [];
  const { cells } = grid;
  if (cells < 2) return found;
  for (const axis of [0, 1] as const) {
    for (let c = 0; c < cells; c++) {
      if (grid.avenue[c] === 1) {
        found.push({ axis, line: cellCentre(grid, c), half: grid.pitch * 0.5, main: c * 2 === cells - 1, index: c });
      }
      if (c + 1 < cells && grid.high[c] === 1) {
        found.push({ axis, line: cornerOffset(grid, c + 1), half: band, main: cells % 2 === 0 && c + 1 === cells / 2, index: c + 0.5 });
      }
    }
  }
  return found;
}

/** A point on a street: `across` from its line and `at` along it, in the town's frame. */
export function onStreet(street: Street, across: number, at: number, y: number, into: THREE.Vector3): THREE.Vector3 {
  return street.axis === 0 ? into.set(street.line + across, y, at) : into.set(at, y, street.line + across);
}

export interface OverheadSite {
  region: string;
  seed: string | number;
  /** 0 for a hamlet to 1 for a metropolis: `urbanityOf` in `settlements.ts`. */
  urbanity: number;
  grid: TownGrid;
  /** The street band, `streetBand`. */
  band: number;
  hosts: readonly OverheadHost[];
  /** The made floor under a point of the town's frame, as a height in that frame, or null off the floor. */
  floorAt(x: number, z: number): number | null;
  /** Points a pole keeps off, as runs of `(x, z, radius)`: lamps, benches, signals, parked cars, people. */
  keep: readonly number[];
  /** The vehicles parked in the town, as runs of `(x, z, radius, height over its floor)`: a line over one clears it. */
  parked: readonly number[];
  /** The trees' crowns, as runs of `(x, y, z, radius, half height)`, their box's middle: no line passes through one. */
  crowns: readonly number[];
}

export interface Overhead {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  glow: Uint8Array;
  triangles: number;
  emits: boolean;
  spans: number;
  /** Service poles, and festival masts, counted apart. */
  poles: number;
  masts: number;
  wires: number;
  /** Where the poles and masts stand, as runs of `(x, z, radius)`, for what is laid on the paving after. */
  spots: number[];
  /**
   * The street cells, main and side: how many there are (a cell's stretch of
   * a street with a floor under it) and how many carry a string across.
   */
  cells: { main: number; mainHung: number; side: number; sideHung: number };
}

export const anchor = new THREE.Vector3();

/**
 * Where a line across `street` at `at`, height `y`, meets the building on
 * `side` (+1 or -1 across): into `into`, or false. The building has to be
 * within the street's own reach (its edge and a little set back), and the line
 * has to meet it on something with more of it under or over it: a wall that
 * carries on `WALL_ABOVE` higher at about the same depth, or anything with the
 * building no further back `WALL_ABOVE` lower (a cornice, the eaves, the slope
 * of a roof over its wall). It may not meet a tip or an edge standing out over
 * nothing.
 */
/** Whether any building's box reaches the line from `street`'s middle out to `side` at `at`, between `y0` and `y1`: the cheap test before the rays. */
export function anyToward(hosts: readonly Placed[], street: Street, at: number, side: number, y0: number, y1: number): boolean {
  const reach = street.half + ROOF_REACH;
  onStreet(street, 0, at, 0, anchor);
  const ex = anchor.x + (street.axis === 0 ? side * reach : 0);
  const ez = anchor.z + (street.axis === 0 ? 0 : side * reach);
  const x0 = Math.min(anchor.x, ex);
  const x1 = Math.max(anchor.x, ex);
  const z0 = Math.min(anchor.z, ez);
  const z1 = Math.max(anchor.z, ez);
  for (const host of hosts) {
    if (host.y1 < y0 || host.y0 > y1 || x1 < host.x0 || x0 > host.x1 || z1 < host.z0 || z0 > host.z1) continue;
    return true;
  }
  return false;
}

export function wallAnchor(hosts: readonly Placed[], street: Street, at: number, y: number, side: number, into: THREE.Vector3): boolean {
  const reach = street.half + ROOF_REACH;
  onStreet(street, 0, at, y, anchor);
  const dx = street.axis === 0 ? side : 0;
  const dz = street.axis === 0 ? 0 : side;
  const hit = wallHit(hosts, anchor.x, y, anchor.z, dx, dz, reach);
  if (!(hit <= reach) || hit < street.half * 0.5) return false;
  const above = wallHit(hosts, anchor.x, y + WALL_ABOVE, anchor.z, dx, dz, reach);
  const wall = above <= hit + 0.9 && above >= hit - 0.9;
  if (!wall) {
    const below = wallHit(hosts, anchor.x, y - WALL_ABOVE, anchor.z, dx, dz, reach);
    if (!(below <= hit + 0.9)) return false;
  }
  onStreet(street, side * (hit + EMBED), at, y, into);
  return true;
}

export const spanA = new THREE.Vector3();
export const spanB = new THREE.Vector3();
export const spanA1 = new THREE.Vector3();
export const spanB1 = new THREE.Vector3();
export const probe = new THREE.Vector3();

export const near: Placed[] = [];
/** The crowns of the town being hung, `OverheadSite.crowns`, and those near the line being tested. */
let crownsNow: readonly number[] = [];
export const nearCrowns: number[] = [];

/** Whether a host's box holds `p`, grown by `margin`: the building an end is tied to. */
export function holds(host: Placed, p: THREE.Vector3, margin: number): boolean {
  return p.x > host.x0 - margin && p.x < host.x1 + margin && p.z > host.z0 - margin && p.z < host.z1 + margin && p.y > host.y0 && p.y < host.y1 + margin;
}

/**
 * Whether a hung line from `a` to `b` stays out of every building and every
 * tree's crown, away from its two ends.
 *
 * A line tied to a building across `street` is tested against that building by
 * rays, not by its box, because a box includes the air in front of a roof's
 * slope. The two buildings its ends are tied to are asked the way the ends
 * were found (a ray from the street's line at each point, which must reach the
 * point before it meets the building); every other building is tested by its
 * box.
 */
export function clearOfHosts(hosts: readonly Placed[], a: THREE.Vector3, b: THREE.Vector3, sag: number, drop: number, street?: Street): boolean {
  // Only the buildings whose boxes reach the line's own.
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const z0 = Math.min(a.z, b.z);
  const z1 = Math.max(a.z, b.z);
  const y1 = Math.max(a.y, b.y);
  const y0 = Math.min(a.y, b.y) - sag - drop;
  near.length = 0;
  for (const host of hosts) {
    if (host.y1 < y0 || host.y0 > y1 || x1 < host.x0 || x0 > host.x1 || z1 < host.z0 || z0 > host.z1) continue;
    if (street !== undefined && (holds(host, a, 0.3) || holds(host, b, 0.3))) continue;
    near.push(host);
  }
  nearCrowns.length = 0;
  for (let i = 0; i + 4 < crownsNow.length; i += 5) {
    const r = crownsNow[i + 3]!;
    const h = crownsNow[i + 4]!;
    const cx = crownsNow[i]!;
    const cy = crownsNow[i + 1]!;
    const cz = crownsNow[i + 2]!;
    if (cx + r < x0 || cx - r > x1 || cz + r < z0 || cz - r > z1 || cy + h < y0 || cy - h > y1) continue;
    nearCrowns.push(cx, cy, cz, r, h);
  }
  const length = a.distanceTo(b);
  const samples = Math.max(4, Math.ceil(length / 1.2));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    hungAt(a, b, sag, t, probe);
    // By rays, against every building, the tied ones included, right up to the ends.
    if (street !== undefined) {
      const across = street.axis === 0 ? probe.x - street.line : probe.z - street.line;
      const at = street.axis === 0 ? probe.z : probe.x;
      const out = Math.abs(across);
      if (out > 0.3) {
        const side = Math.sign(across);
        const px = street.axis === 0 ? street.line : at;
        const pz = street.axis === 0 ? at : street.line;
        const dx = street.axis === 0 ? side : 0;
        const dz = street.axis === 0 ? 0 : side;
        const reach = out - EMBED - 0.02;
        if (wallHit(hosts, px, probe.y, pz, dx, dz, reach) < reach) return false;
        if (drop > 0 && wallHit(hosts, px, probe.y - drop, pz, dx, dz, reach) < reach) return false;
      }
    }
    if (t * length < 0.8 || (1 - t) * length < 0.8) continue;
    if (inHost(near, probe.x, probe.y, probe.z, 0.2)) return false;
    if (drop > 0 && inHost(near, probe.x, probe.y - drop, probe.z, 0.2)) return false;
    for (let c = 0; c < nearCrowns.length; c += 5) {
      if (Math.hypot(probe.x - nearCrowns[c]!, probe.z - nearCrowns[c + 2]!) > nearCrowns[c + 3]!) continue;
      const dy = nearCrowns[c + 1]!;
      const half = nearCrowns[c + 4]!;
      if (probe.y > dy - half && probe.y - drop < dy + half) return false;
    }
  }
  return true;
}

/** Sets the tree crowns the next `clearOfHosts` calls test against: those of the town being hung. */
export function useCrowns(crowns: readonly number[]): void {
  crownsNow = crowns;
}
