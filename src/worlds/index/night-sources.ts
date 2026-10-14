/** What lights the night round the traveller: the towns' lamps and the headlights of the craft driven and the traffic. */

import * as THREE from 'three';
import type { Outposts } from '../outposts.ts';
import type { Settlements } from '../settlements.ts';
import type { Traffic, TrafficRover } from '../traffic.ts';
import type { WorldPlayer } from '../player.ts';
import { LAMP_FIELD } from '../night.ts';
import type { NightSources } from '../night.ts';

export function createNightSources(deps: { settlements: Settlements; outposts: Outposts; traffic: Traffic; player: WorldPlayer }): NightSources {
  const { settlements, outposts, traffic, player } = deps;
  const headUp = new THREE.Vector3();
  const headSide = new THREE.Vector3();
  const headAt = new THREE.Vector3();
  const headAim = new THREE.Vector3();
  /** The headlights written so far this frame, seven floats each (`burn`). */
  let headCount = 0;

  /** Two lamps at a craft's nose, a little apart, aimed down the way it is going, while `out` has room. */
  function burn(out: Float32Array, max: number, position: THREE.Vector3, heading: THREE.Vector3, radius: number, down: number): void {
    headUp.copy(position).normalize();
    headSide.crossVectors(heading, headUp).normalize();
    headAim.copy(heading).addScaledVector(headUp, -down).normalize();
    for (let side = -1; side <= 1; side += 2) {
      if (headCount >= max) return;
      headAt.copy(position).addScaledVector(heading, radius * 0.8).addScaledVector(headSide, side * radius * 0.3).addScaledVector(headUp, 1.3);
      const at = headCount * 7;
      out[at] = headAt.x;
      out[at + 1] = headAt.y;
      out[at + 2] = headAt.z;
      out[at + 3] = headAim.x;
      out[at + 4] = headAim.y;
      out[at + 5] = headAim.z;
      out[at + 6] = 1;
      headCount++;
    }
  }

  /** The traffic, nearest the traveller first, and each one's distance: kept, not made a frame. */
  const nearRovers: TrafficRover[] = [];
  const roverAway = new Map<TrafficRover, number>();
  const byAway = (a: TrafficRover, b: TrafficRover): number => roverAway.get(a)! - roverAway.get(b)!;
  let lampScratch = new Float32Array(64);
  const lampOrder: number[] = [];
  return {
    // The towns' lamps and the outposts', merged nearest first: filled one
    // after the other, a near outpost's door would lose its place to the far
    // lamps of a town.
    lampsNear(point, out, max) {
      if (lampScratch.length < max * 8) lampScratch = new Float32Array(max * 8);
      const towns = settlements.lampsNear(point, lampScratch, max);
      const all = outposts.lampsNear(point, lampScratch, towns, max * 2);
      const order = lampOrder;
      order.length = 0;
      for (let k = 0; k < all; k++) order.push(k);
      order.sort((a, b) => lampScratch[a * 4 + 3]! - lampScratch[b * 4 + 3]!);
      const n = Math.min(max, all);
      for (let k = 0; k < n; k++) {
        const from = order[k]! * 4;
        out[k * 4] = lampScratch[from]!;
        out[k * 4 + 1] = lampScratch[from + 1]!;
        out[k * 4 + 2] = lampScratch[from + 2]!;
        out[k * 4 + 3] = lampScratch[from + 3]!;
      }
      return n;
    },
    headlights(out, max) {
      headCount = 0;
      const craft = player.craft;
      // A saucer aloft shines straight down from under its belly, where its
      // beam is; a lander aloft down ahead of it; anything else down the road.
      if (craft !== null && craft.kind === 'ufo' && craft.airborne) burn(out, max, craft.position, craft.heading, craft.radius * 0.25, 6);
      else if (craft !== null) burn(out, max, craft.position, craft.heading, craft.radius, craft.kind === 'lander' && craft.airborne ? 0.9 : 0.12);
      // Then the traffic's, nearest first by distances taken once.
      const near = nearRovers;
      near.length = 0;
      for (const rover of traffic.rovers) near.push(rover);
      roverAway.clear();
      for (const rover of near) roverAway.set(rover, rover.position.distanceToSquared(player.position));
      near.sort(byAway);
      for (const rover of near) {
        if (headCount >= max || rover.position.distanceTo(player.position) > LAMP_FIELD * 1.5) break;
        burn(out, max, rover.position, rover.heading, rover.radius, 0.12);
      }
      return headCount;
    },
  };
}
