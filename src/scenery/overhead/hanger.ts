import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { POLE_HEIGHT, POLE_WIDTH } from '../../roadside.ts';
import type { Rng } from '../random.ts';
import { cellCentre, cornerOffset } from '../grid.ts';
import type { TownGrid } from '../grid.ts';
import { onStreet, probe } from './anchors.ts';
import type { Street } from './anchors.ts';
import { ARM_REACH, OVERHEAD_CLEAR, SIDE_CLEAR } from './config.ts';
import type { Hang, Profile } from './config.ts';
import { inHost } from './geometry.ts';
import type { Out, Placed } from './geometry.ts';
import { banner, bulbs, lanterns, laundry, marigolds, pennants, picado, sail } from './pieces.ts';
import type { Overhead, OverheadSite } from './anchors.ts';

/** A pole's foot: its floor and where it stands along its street. */
export interface PoleSpot {
  x: number;
  y: number;
  z: number;
  at: number;
}

/**
 * The state one town's overhead is hung with: what has been built so far and
 * the questions every span asks (the floor under it, the clearance over it,
 * where a pole may stand).
 */
export interface Hanger {
  readonly site: OverheadSite;
  readonly profile: Profile;
  readonly grid: TownGrid;
  readonly hosts: Placed[];
  readonly out: Out;
  readonly streets: Street[];
  /** 0.8 to 1.1: how much of a town's streets are strung, by its urbanity. */
  readonly urban: number;
  readonly counts: Map<Hang, number>;
  spans: number;
  readonly cells: Overhead['cells'];
  poles: number;
  masts: number;
  wires: number;
  /** Where a pole or a mast already stands, so two never share a spot. */
  readonly taken: [number, number][];
  /** The highest floor under a line across a street at `at0` and `at1`, or null where any of it is off the floor. */
  floorUnder(street: Street, at0: number, at1: number): number | null;
  /**
   * How high the lowest thing hung between `a` and `b` over `street` has to
   * clear its floor: `OVERHEAD_CLEAR` over a main street, `SIDE_CLEAR` over
   * any other, and over a parked vehicle its own height and a quarter of a
   * person.
   */
  clearUnder(street: Street, a: THREE.Vector3, b: THREE.Vector3): number;
  /**
   * A pole's foot at `at` along `street`, `across` from its line, with its
   * arm (or none) reaching `(armX, armZ)`: its floor, or null where it would
   * stand on a lamp, a bench, a parked car or a person, off the floor, or up
   * through a wall.
   */
  standPole(street: Street, across: number, at: number, armX: number, armZ: number): PoleSpot | null;
  /** Draws one hung span of `kind` and counts it. */
  hang(kind: Hang, a: THREE.Vector3, b: THREE.Vector3, sag: number, draw: Rng, a1?: THREE.Vector3, b1?: THREE.Vector3): void;
}

export function createHanger(
  site: OverheadSite,
  profile: Profile,
  hosts: Placed[],
  out: Out,
  streets: Street[],
): Hanger {
  const { grid } = site;
  const keep = site.keep;
  const poleAt = new THREE.Vector3();

  /** Whether `at` along a street is in a street crossing it, or within a pace of one: no pole stands in a carriageway. */
  const crossing = (at: number): boolean => {
    for (let c = 0; c < grid.cells; c++) {
      if (grid.avenue[c] === 1 && Math.abs(at - cellCentre(grid, c)) < grid.pitch * 0.5 + 0.6) return true;
      if (c + 1 < grid.cells && grid.high[c] === 1 && Math.abs(at - cornerOffset(grid, c + 1)) < site.band + 0.6) return true;
    }
    return false;
  };

  const hanger: Hanger = {
    site,
    profile,
    grid,
    hosts,
    out,
    streets,
    urban: 0.8 + 0.3 * Math.max(0, Math.min(1, site.urbanity)),
    counts: new Map<Hang, number>(),
    spans: 0,
    cells: { main: 0, mainHung: 0, side: 0, sideHung: 0 },
    poles: 0,
    masts: 0,
    wires: 0,
    taken: [],
    floorUnder(street, at0, at1) {
      let high = -Infinity;
      for (const [across, at] of [[0, (at0 + at1) / 2], [-street.half * 0.7, at0], [street.half * 0.7, at1]] as const) {
        onStreet(street, across, at, 0, probe);
        const y = site.floorAt(probe.x, probe.z);
        if (y === null) return null;
        high = Math.max(high, y);
      }
      return high;
    },
    clearUnder(street, a, b) {
      let clear = street.main ? OVERHEAD_CLEAR : SIDE_CLEAR;
      const parked = site.parked;
      const lx = b.x - a.x;
      const lz = b.z - a.z;
      const length2 = Math.max(1e-9, lx * lx + lz * lz);
      for (let i = 0; i + 3 < parked.length; i += 4) {
        const px = parked[i]!;
        const pz = parked[i + 1]!;
        const t = Math.max(0, Math.min(1, ((px - a.x) * lx + (pz - a.z) * lz) / length2));
        if (Math.hypot(a.x + lx * t - px, a.z + lz * t - pz) > parked[i + 2]! + 0.5) continue;
        clear = Math.max(clear, parked[i + 3]! + AVATAR_HEIGHT * 0.25);
      }
      return clear;
    },
    standPole(street, across, at, armX, armZ) {
      if (Math.abs(at) > grid.half - 1) return null;
      if (crossing(at)) return null;
      onStreet(street, across, at, 0, poleAt);
      const floor = site.floorAt(poleAt.x, poleAt.z);
      if (floor === null) return null;
      for (let i = 0; i + 2 < keep.length; i += 3) {
        if (Math.hypot(keep[i]! - poleAt.x, keep[i + 1]! - poleAt.z) < keep[i + 2]!) return null;
      }
      for (const [x, z] of hanger.taken) {
        if (Math.hypot(x - poleAt.x, z - poleAt.z) < 2) return null;
      }
      for (let h = 0.5; h < POLE_HEIGHT + 0.3; h += 1.5) {
        if (inHost(hosts, poleAt.x, floor + h, poleAt.z, -POLE_WIDTH)) return null;
        if (inHost(hosts, poleAt.x + armX * ARM_REACH, floor + h, poleAt.z + armZ * ARM_REACH, -0.1)) return null;
      }
      return { x: poleAt.x, y: floor, z: poleAt.z, at };
    },
    hang(kind, a, b, sag, draw, a1, b1) {
      const { profile: p } = hanger;
      if (kind === 'pennants') pennants(out, a, b, sag, p.colours, draw);
      else if (kind === 'picado') picado(out, a, b, sag, p.colours, draw);
      else if (kind === 'laundry') laundry(out, a, b, sag, draw);
      else if (kind === 'marigolds') marigolds(out, a, b, sag, draw);
      else if (kind === 'lanterns') lanterns(out, a, b, sag, p.colours, draw);
      else if (kind === 'bulbs') bulbs(out, a, b, sag, draw);
      else if (kind === 'banner') banner(out, a, b, sag, p.colours, draw);
      else if (a1 !== undefined && b1 !== undefined) sail(out, a, a1, b, b1, sag, p.colours, draw);
      hanger.spans++;
      hanger.counts.set(kind, (hanger.counts.get(kind) ?? 0) + 1);
    },
  };
  return hanger;
}
