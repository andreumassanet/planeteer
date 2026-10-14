import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { PALETTE } from '../theme.ts';
import { assemble, craftContext, soupOf } from '../craft/build.ts';
import { coursePoint, courseTangent } from '../roads/course.ts';
import { parameterAt } from '../roads/path.ts';
import { crownAt } from '../rails/crown.ts';
import { BED_FOOT } from '../rails/line.ts';
import type { RailNetwork } from '../rails/network.ts';
import type { Crossing } from './crossings.ts';
import { standAt } from './stand.ts';

/** A crossing lamp's position, and the line and distance along it it belongs to. */
export interface CrossingLamp {
  at: THREE.Vector3;
  line: number;
  s: number;
}

const p = new THREE.Vector3();
const t = new THREE.Vector3();

/**
 * The posts at a line's level crossings: one at each corner, with a
 * crossbuck and a lamp. Each lamp's position is pushed onto `lamps`.
 */
export function crossingProps(network: RailNetwork, line: number, here: Crossing[], lamps: CrossingLamp[]): THREE.Group | null {
  if (here.length === 0) return null;
  const holder = new THREE.Group();
  const ctx = craftContext();
  const crown = network.crown(line);
  for (const crossing of here) {
    const r = crownAt(crown, crossing.s);
    const course = network.course(line);
    const path = network.path(line);
    const tt = parameterAt(path, crossing.s);
    courseTangent(course, tt, t);
    coursePoint(course, tt, p);
    for (const along of [-1, 1]) {
      for (const acrossRoad of [-1, 1]) {
        // Out along the road past the bed's foot, then back along the rail past the carriageway.
        const at = p
          .clone()
          .addScaledVector(crossing.across, (acrossRoad * (BED_FOOT + 1.5)) / PLANET_RADIUS)
          .addScaledVector(t, (along * 0) / PLANET_RADIUS);
        const rail = at.clone().addScaledVector(t, (along * (crossing.half + 1.2)) / PLANET_RADIUS).normalize();
        const post = new THREE.Group();
        const pole = ctx.column(0.12, 4.2, PALETTE.white, 6);
        post.add(pole);
        for (const lean of [0.62, -0.62]) {
          const arm = ctx.box(1.9, 0.28, 0.08, PALETTE.white);
          arm.position.set(0, 3.55, 0.14);
          arm.rotation.z = lean;
          const stripe = ctx.box(0.5, 0.3, 0.1, PALETTE.red);
          stripe.position.set(0, 3.55, 0.15);
          stripe.rotation.z = lean;
          post.add(arm, stripe);
        }
        const lamp = ctx.box(0.5, 0.36, 0.3, PALETTE.ink);
        lamp.position.set(0, 2.7, 0.16);
        post.add(lamp);
        const assembled = assemble('crossing-post', [soupOf(post)]);
        standAt(assembled, rail, r - 0.3, crossing.across.clone().multiplyScalar(-acrossRoad));
        assembled.traverse((part) => {
          part.castShadow = false;
        });
        holder.add(assembled);
        lamps.push({ at: assembled.localToWorld(new THREE.Vector3(0, 2.9, 0.4)), line, s: crossing.s });
      }
    }
  }
  return holder;
}
