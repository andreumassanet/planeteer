/** What the grass gathers round a point before it is asked about the points there: what is built, towns' squares, airstrips, and the ground under them. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import type { LandProbe } from '../land-probe.ts';
import { EDGE_RUN } from '../scenery/ground.ts';
import { STRIP_REACH } from '../craft/airstrip.ts';
import type { FleetSite } from '../fleet.ts';
import { createKeepoutSet } from './keepouts.ts';
import type { KeepoutSet, Keepouts } from './keepouts.ts';
import type { VegetationOptions } from './types.ts';

/** A town's square in its own frame, so the axes are computed once a gather and not once a texel. */
interface Square {
  ux: number; uy: number; uz: number;
  ax: number; ay: number; az: number;
  nx: number; ny: number; nz: number;
  /** Half the square with its edge slope, as an angle. */
  outer: number;
}

export interface GrassGather {
  /** The grass's own gather: a frame and the three lists. */
  set: KeepoutSet;
  /** The airstrips near the last gather, whose drawn rectangle grows no grass. */
  strips: FleetSite[];
  /**
   * The ground the grass stands on at `direction`, inside the last gather: the
   * drawn land, or where a town's square or its edge slope is, what the town
   * says (`swardAt`, keeping `margin` off its streets, walls and risers).
   */
  groundUnder(direction: THREE.Vector3, margin: number): number | null;
  /** Gathers what is built within `reach` of `direction`, into lists of its own so a tile built in between is undisturbed. */
  gather(direction: THREE.Vector3, reach: number): void;
}

export function createGrassGather(options: VegetationOptions, land: LandProbe, keepouts: Keepouts): GrassGather {
  const lawns = options.lawns;
  const set = createKeepoutSet(new THREE.Vector3(), new THREE.Vector3());
  const squares: Square[] = [];
  const squareUp = new THREE.Vector3();
  const squareNorth = new THREE.Vector3();
  const squareAcross = new THREE.Vector3();
  const strips: FleetSite[] = [];
  const stripHits: FleetSite[] = [];

  function groundUnder(direction: THREE.Vector3, margin: number): number | null {
    const radius = land.radiusAt(direction);
    if (radius === null) return null;
    for (const square of squares) {
      const offAcross = Math.abs(direction.x * square.ax + direction.y * square.ay + direction.z * square.az);
      const offNorth = Math.abs(direction.x * square.nx + direction.y * square.ny + direction.z * square.nz);
      if (offAcross >= square.outer || offNorth >= square.outer) continue;
      return lawns === undefined ? null : lawns.swardAt(direction, radius, margin);
    }
    return radius;
  }

  function gather(direction: THREE.Vector3, reach: number): void {
    set.north.set(0, 1, 0).projectOnPlane(direction);
    if (set.north.lengthSq() < 1e-8) set.north.set(1, 0, 0).projectOnPlane(direction);
    set.north.normalize();
    set.across.crossVectors(direction, set.north).normalize();
    keepouts.gather(direction, reach, set);
    squares.length = 0;
    for (const keepout of set.keepouts) {
      const half = keepouts.half[keepout.index]!;
      if (half <= 0) continue;
      const i = keepout.index * 3;
      squareUp.set(keepouts.unit[i]!, keepouts.unit[i + 1]!, keepouts.unit[i + 2]!);
      squareNorth.set(0, 1, 0).projectOnPlane(squareUp).normalize();
      squareAcross.crossVectors(squareUp, squareNorth).normalize();
      squares.push({
        ux: squareUp.x, uy: squareUp.y, uz: squareUp.z,
        ax: squareAcross.x, ay: squareAcross.y, az: squareAcross.z,
        nx: squareNorth.x, ny: squareNorth.y, nz: squareNorth.z,
        outer: (half + Math.max(EDGE_RUN, keepouts.pitch[keepout.index]!) + 1) / PLANET_RADIUS,
      });
    }
    // The airstrips whose drawn strip could reach into the gather.
    strips.length = 0;
    if (options.fields !== undefined) {
      stripHits.length = 0;
      for (const site of options.fields.planesNear(direction, reach + STRIP_REACH, stripHits)) {
        if (site.at.angleTo(direction) * PLANET_RADIUS < reach + STRIP_REACH) strips.push(site);
      }
    }
  }

  return { set, strips, groundUnder, gather };
}
