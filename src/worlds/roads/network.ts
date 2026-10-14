/**
 * Which towns a road joins and where it runs. Two towns are joined when no
 * third is nearer both of them than they are to each other (the
 * relative-neighbourhood graph), so every town is reached, nobody's road passes
 * through a third town, and a town has three or four roads; a road longer than
 * `LONGEST` is left out. A road is never laid up a cliff: Earth's `MAX_SLOPE`
 * is asked of the ground along its course, a course that climbs steeper bows
 * round the hill (`BENDS`), and where no bow clears it the two towns are left
 * apart. Pure: a function of the towns and the ground.
 */

import * as THREE from 'three';
import type { WorldSpec } from '../contract.ts';
import type { Terrain } from '../terrain.ts';
import type { Site } from '../settlements.ts';
import { MAX_SLOPE } from '../../terrain.ts';

/** The longest road, units: past this two towns are left apart. */
const LONGEST = 2600;
/**
 * The run the slope test reads a grade over, units (a step's worth of rise
 * on a crater's rim is not a climb) and the bows tried round a hill, as
 * shares of the road's angle at its middle.
 */
const GRADE_RUN = 20;
const BENDS = [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36];

/**
 * The top of a town's carriageway over its floor: the street a road carries
 * on, which `settlements.ts` draws and a road's crown comes down to at a gate.
 */
export const CARRIAGE_TOP = 0.12;

/** Which end of a town's main streets a road leaves by: the town's frame's north, east, south, west. */
export type Gate = 'n' | 'e' | 's' | 'w';

/** One road: from a town's gate to another's, bowed `bend` off the great circle. */
export interface Road {
  a: number;
  b: number;
  gateA: Gate;
  gateB: Gate;
  bend: number;
}

export interface RoadNetwork {
  roads: Road[];
  /** Which main street ends of a town go somewhere, by the town's id. */
  ends: ReadonlyMap<string, ReadonlySet<Gate>>;
  /** Neighbours left apart because every course between them climbed past `MAX_SLOPE`. */
  steep: number;
}

/** A gate's direction in its town's frame (`frameAt`: +z north, +x = up x north, which is west). */
const GATE_DIRECTION: Readonly<Record<Gate, { x: number; z: number }>> = {
  n: { x: 0, z: 1 },
  s: { x: 0, z: -1 },
  w: { x: 1, z: 0 },
  e: { x: -1, z: 0 },
};

const scratchQ = new THREE.Quaternion();
const scratchV = new THREE.Vector3();

/** The gate of `site` that faces `toward` (a world direction) best. */
export function gateToward(site: Site, toward: THREE.Vector3): Gate {
  scratchV.copy(toward).sub(site.dir).applyQuaternion(scratchQ.copy(site.quaternion).invert());
  let best: Gate = 'n';
  let score = -Infinity;
  for (const gate of ['n', 'e', 's', 'w'] as const) {
    const d = GATE_DIRECTION[gate];
    const s = scratchV.x * d.x + scratchV.z * d.z;
    if (s > score) [best, score] = [gate, s];
  }
  return best;
}

/** A point `out` units past `site`'s gate along its main street, in the world (the town's frame, as `Settlements.toWorld`). */
export function gatePoint(site: Site, gate: Gate, out: number): THREE.Vector3 {
  const d = GATE_DIRECTION[gate];
  const half = site.town!.grid.half;
  return new THREE.Vector3(d.x * (half + out), 0, d.z * (half + out)).applyQuaternion(site.quaternion).add(site.origin);
}

/**
 * How high a town's street stands at its gate, over the walkable radius.
 * Measured at the gate, not at the town's middle: a town is built on the
 * plane tangent to the sphere at its middle, and at its edge that plane is
 * `d^2 / 2R` higher than the middle's height.
 */
export function gateHeight(site: Site, gate: Gate, R: number): number {
  const d = GATE_DIRECTION[gate];
  const half = site.town!.grid.half;
  return new THREE.Vector3(d.x * half, site.floor + CARRIAGE_TOP, d.z * half).applyQuaternion(site.quaternion).add(site.origin).length() - R;
}

/**
 * A road's centre line: out of the gate and straight across the pad, then
 * the country along the great circle (bowed sideways by `bend` of its angle
 * at the middle, easing to nothing at either end), then the other town's pad
 * and gate.
 */
export function courseOf(A: Site, gateA: Gate, B: Site, gateB: Gate, bend: number, R: number): THREE.CatmullRomCurve3 {
  const control: THREE.Vector3[] = [gatePoint(A, gateA, 0), gatePoint(A, gateA, A.radius * 0.5), gatePoint(A, gateA, A.radius * 1.1)];
  const from = control[control.length - 1]!.clone().normalize();
  const exitB = gatePoint(B, gateB, B.radius * 1.1);
  const to = exitB.clone().normalize();
  const angle = from.angleTo(to);
  const lateral = new THREE.Vector3().crossVectors(from, to).normalize();
  // A control point every 220 units, and at least three where the course bows.
  const inner = Math.max(Math.round((angle * R) / 220) - 1, bend === 0 ? 0 : 3);
  for (let k = 1; k <= inner; k++) {
    const t = k / (inner + 1);
    const p = new THREE.Vector3().copy(from).lerp(to, t).normalize();
    p.addScaledVector(lateral, bend * angle * Math.sin(Math.PI * t)).normalize();
    control.push(p.multiplyScalar(R));
  }
  control.push(exitB, gatePoint(B, gateB, B.radius * 0.5), gatePoint(B, gateB, 0));
  return new THREE.CatmullRomCurve3(control, false, 'centripetal');
}

/** The steepest the ground climbs along `curve`, over `GRADE_RUN`. */
function steepestOf(curve: THREE.CatmullRomCurve3, terrain: Terrain): number {
  const length = curve.getLength();
  const count = Math.max(2, Math.ceil(length / (GRADE_RUN / 2)));
  const p = new THREE.Vector3();
  const heights = new Float64Array(count + 1);
  for (let k = 0; k <= count; k++) {
    curve.getPointAt(k / count, p).normalize();
    heights[k] = terrain.heightAt(p.x, p.y, p.z);
  }
  const run = (2 * length) / count;
  let worst = 0;
  for (let k = 0; k + 2 <= count; k++) worst = Math.max(worst, Math.abs(heights[k + 2]! - heights[k]!) / run);
  return worst;
}

/** The towns' roads: a pure function of the towns and the ground. */
export function roadNetwork(_spec: WorldSpec, sites: readonly Site[], terrain: Terrain): RoadNetwork {
  const R = terrain.radius;
  const ends = new Map<string, Set<Gate>>();
  const roads: Road[] = [];
  let steep = 0;
  const towns = sites.map((site, k) => ({ site, k })).filter((one) => !one.site.landmark && one.site.town !== null);
  const n = towns.length;
  const apart = (i: number, j: number): number => towns[i]!.site.dir.angleTo(towns[j]!.site.dir) * R;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = apart(i, j);
      if (d > LONGEST) continue;
      let blocked = false;
      for (let k = 0; k < n && !blocked; k++) {
        if (k === i || k === j) continue;
        if (Math.max(apart(i, k), apart(j, k)) < d) blocked = true;
      }
      if (blocked) continue;
      const A = towns[i]!.site;
      const B = towns[j]!.site;
      const gateA = gateToward(A, B.dir);
      const gateB = gateToward(B, A.dir);
      // The straightest course the ground allows, or none.
      const bend = BENDS.find((one) => steepestOf(courseOf(A, gateA, B, gateB, one, R), terrain) <= MAX_SLOPE);
      if (bend === undefined) {
        steep++;
        continue;
      }
      roads.push({ a: towns[i]!.k, b: towns[j]!.k, gateA, gateB, bend });
      for (const [site, gate] of [[A, gateA], [B, gateB]] as const) {
        const set = ends.get(site.id) ?? new Set<Gate>();
        set.add(gate);
        ends.set(site.id, set);
      }
    }
  }
  return { roads, ends, steep };
}
