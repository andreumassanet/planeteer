/**
 * A road as the ribbon draws it: its centre line, and the crown worked out a
 * chunk at a time.
 *
 * The crown is the ground under the centre line plus `LIFT`, or its moving
 * average over `SMOOTH` points either side where that is higher (a road runs
 * over a dip on an embankment rather than down into it), and never under
 * either edge's own ground plus the lift, so on a hillside the top leans with
 * the hill (`tilt`, smoothed and bounded). At each gate the top comes down to
 * the street it carries on (`CARRIAGE_TOP`) at Earth's `RAMP_GRADE`, level
 * across. Like Earth's railway crown (`crownProfile` in `rails.ts`).
 */

import * as THREE from 'three';
import type { Terrain } from '../terrain.ts';
import type { Site } from '../settlements.ts';
import { RAMP_GRADE } from '../../scenery/ground.ts';
import { CARRIAGE_TOP, courseOf, gateHeight } from './network.ts';
import type { RoadNetwork } from './network.ts';

/** Units between two points of a road's ribbon. */
export const STEP = 5;
/** How far over the ground the crown rides, units: an embankment a person's knee high. */
const LIFT = 1.5;
/** The crown's moving average, points either side: 30 units each way. */
const SMOOTH = 6;
/** The steepest the top may lean across, rise over run: a camber, not a hillside. */
const MAX_TILT = 0.12;
/** The gravel either side of the carriageway, at its height, before the bank. */
export const SHOULDER = 0.9;
/** What a road keeps clear of rocks either side of its top, units: its bank and a boulder's half beyond. */
const VERGE = 8;
/** Over this many units out of a gate the pavement carries on beside the carriageway, then narrows to the shoulder over the second, as Earth's does. */
const PAVEMENT_RUN = 8;
const PAVEMENT_TAPER = 6;
/** On a deck the crown rides this high over the clouds, so the skyway reads as a bridge on its pylons. */
const DECK_LIFT = 7;

/** What the ribbon's maths needs of the world. */
export interface RibbonEnv {
  terrain: Terrain;
  /** The planet's radius. */
  R: number;
  /** Whether the roads are bridges over a cloud deck. */
  deck: boolean;
}

export interface Ribbon {
  /** Unit directions of the centre line, `STEP` apart. */
  dirs: THREE.Vector3[];
  /** The carriageway's half-width, and the pavement's width at each gate. */
  half: number;
  walkA: number;
  walkB: number;
  /** The street's top at each gate, over the walkable radius. */
  gateA: number;
  gateB: number;
  /** The ground under the centre and either edge of the top, NaN until asked. */
  ground: Float64Array;
  left: Float64Array;
  right: Float64Array;
  /** The same three halfway to the next point: a bump between two points is under a piece drawn straight across it. */
  midGround: Float64Array;
  midLeft: Float64Array;
  midRight: Float64Array;
  /** The crown's height over the centre line and its lean (rise a unit to the right), NaN until worked out. */
  crown: Float64Array;
  tilt: Float64Array;
}

/** A town's pavement, `walk` wide at its gate, `s` units out along the road from it. */
function pavementAt(walk: number, s: number): number {
  if (s <= PAVEMENT_RUN) return walk;
  return Math.max(0, walk * (1 - (s - PAVEMENT_RUN) / PAVEMENT_TAPER));
}

const tangent = new THREE.Vector3();
const side = new THREE.Vector3();
const probe = new THREE.Vector3();
const mid = new THREE.Vector3();

/** One ribbon a road of the network, nothing yet asked of the ground. Keeps decorations off each road's top and verge. */
export function makeRibbons(env: RibbonEnv, network: RoadNetwork, sites: readonly Site[]): Ribbon[] {
  const { terrain, R } = env;
  const mainWalk = (site: Site): number => site.town!.streets.find((street) => street.main)?.walk ?? 0;
  const ribbons: Ribbon[] = [];
  for (const road of network.roads) {
    const A = sites[road.a]!;
    const B = sites[road.b]!;
    const curve = courseOf(A, road.gateA, B, road.gateB, road.bend, R);
    const count = Math.max(2, Math.ceil(curve.getLength() / STEP));
    const dirs: THREE.Vector3[] = [];
    for (let k = 0; k <= count; k++) dirs.push(curve.getPointAt(k / count, new THREE.Vector3()).normalize());
    const half = A.town!.mainCarriage;
    const blank = (): Float64Array => new Float64Array(dirs.length).fill(NaN);
    ribbons.push({
      dirs,
      half,
      walkA: mainWalk(A),
      walkB: mainWalk(B),
      gateA: gateHeight(A, road.gateA, R),
      gateB: gateHeight(B, road.gateB, R),
      ground: blank(),
      left: blank(),
      right: blank(),
      midGround: blank(),
      midLeft: blank(),
      midRight: blank(),
      crown: blank(),
      tilt: blank(),
    });
    // Nothing lies about on it: the decorations keep off the top and a verge
    // either side (`Terrain.keepBare`), before a tile is laid.
    for (let k = 0; k < dirs.length; k += 2) {
      const d = dirs[k]!;
      terrain.keepBare(d.x, d.y, d.z, half + SHOULDER + VERGE);
    }
  }
  return ribbons;
}

/** The road's right at point `k`: across the centre line, in the tangent plane. */
export function sideAt(ribbon: Ribbon, k: number, out: THREE.Vector3): THREE.Vector3 {
  const { dirs } = ribbon;
  tangent.subVectors(dirs[Math.min(dirs.length - 1, k + 1)]!, dirs[Math.max(0, k - 1)]!);
  return out.crossVectors(tangent, dirs[k]!).normalize();
}

/** The edge of the top, from the centre line, at point `k`: the shoulder, or out of a gate the pavement carried on. */
export function edgeOf(ribbon: Ribbon, k: number): number {
  const walk = Math.max(pavementAt(ribbon.walkA, k * STEP), pavementAt(ribbon.walkB, (ribbon.dirs.length - 1 - k) * STEP));
  return ribbon.half + Math.max(SHOULDER, walk);
}

/** How far from the nearer gate point `k` is, units. */
const fromGate = (ribbon: Ribbon, k: number): number => Math.min(k, ribbon.dirs.length - 1 - k) * STEP;

/** The ground under point `k` and the two edges of its top, read once. */
function groundOf(env: RibbonEnv, ribbon: Ribbon, k: number): void {
  const { terrain, R } = env;
  if (!Number.isNaN(ribbon.ground[k]!)) return;
  const d = ribbon.dirs[k]!;
  sideAt(ribbon, k, side).multiplyScalar(edgeOf(ribbon, k) / R);
  ribbon.ground[k] = terrain.heightAt(d.x, d.y, d.z);
  probe.copy(d).sub(side).normalize();
  ribbon.left[k] = terrain.heightAt(probe.x, probe.y, probe.z);
  probe.copy(d).add(side).normalize();
  ribbon.right[k] = terrain.heightAt(probe.x, probe.y, probe.z);
  if (k === ribbon.dirs.length - 1) return;
  mid.copy(d).add(ribbon.dirs[k + 1]!).normalize();
  ribbon.midGround[k] = terrain.heightAt(mid.x, mid.y, mid.z);
  probe.copy(mid).sub(side).normalize();
  ribbon.midLeft[k] = terrain.heightAt(probe.x, probe.y, probe.z);
  probe.copy(mid).add(side).normalize();
  ribbon.midRight[k] = terrain.heightAt(probe.x, probe.y, probe.z);
}

/**
 * The crown at points `from` to `to`: the moving average where it is higher
 * than the ground's lift, never under either edge's, down to each gate's
 * street at `RAMP_GRADE`. Reads the ground `SMOOTH` points beyond.
 */
export function crownOf(env: RibbonEnv, ribbon: Ribbon, from: number, to: number): void {
  const last = ribbon.dirs.length - 1;
  for (let k = Math.max(0, from - SMOOTH); k <= Math.min(last, to + SMOOTH); k++) groundOf(env, ribbon, k);
  for (let k = from; k <= to; k++) {
    if (!Number.isNaN(ribbon.crown[k]!)) continue;
    const s = k * STEP;
    const out = fromGate(ribbon, k);
    // The lift itself climbs out of a gate from the street's top.
    const lift = Math.min(env.deck ? DECK_LIFT : LIFT, CARRIAGE_TOP + RAMP_GRADE * out);
    let sum = 0;
    let lean = 0;
    let n = 0;
    for (let j = Math.max(0, k - SMOOTH); j <= Math.min(last, k + SMOOTH); j++) {
      sum += ribbon.ground[j]!;
      lean += (ribbon.right[j]! - ribbon.left[j]!) / (2 * edgeOf(ribbon, j));
      n++;
    }
    // Level across at a gate, as the street it meets is.
    const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, lean / n)) * Math.min(1, out / (LIFT / RAMP_GRADE + PAVEMENT_RUN + PAVEMENT_TAPER));
    const edge = edgeOf(ribbon, k);
    // No higher than each gate's street plus the grade back to it.
    const cap = Math.min(ribbon.gateA + RAMP_GRADE * s, ribbon.gateB + RAMP_GRADE * (last * STEP - s));
    // Never under the ground plus the lift, here, at either neighbour or
    // halfway to it, under the centre or either edge: a piece is drawn
    // straight across whatever rises between two points.
    let floor = -Infinity;
    for (let j = Math.max(0, k - 1); j <= Math.min(last, k + 1); j++) {
      floor = Math.max(floor, ribbon.ground[j]!, ribbon.left[j]! + tilt * edge, ribbon.right[j]! - tilt * edge);
      if (j < k || (j === k && k < last)) floor = Math.max(floor, ribbon.midGround[j]!, ribbon.midLeft[j]! + tilt * edge, ribbon.midRight[j]! - tilt * edge);
    }
    // And no lower than each gate's street less the grade back to it: a town
    // standing higher than the ground round it (a giant's platform over its
    // deck) is climbed up to, or the road would meet its street a step under
    // the kerb.
    const low = Math.max(ribbon.gateA - RAMP_GRADE * s, ribbon.gateB - RAMP_GRADE * (last * STEP - s));
    // At the gate itself, exactly the street: a road ends on its town's kerb
    // line at its paving's height, as Earth's do.
    const crown = k === 0 ? ribbon.gateA : k === last ? ribbon.gateB : Math.max(floor + lift, low, Math.min(sum / n + lift, cap));
    ribbon.crown[k] = crown;
    ribbon.tilt[k] = tilt;
  }
}
