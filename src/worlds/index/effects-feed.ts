/** What the world hands Earth's effects: who they follow, the dust craft raise and the dust a foot kicks up. */

import * as THREE from 'three';
import type { Craft } from '../craft.ts';
import type { WorldPlayer } from '../player.ts';
import type { Terrain } from '../terrain.ts';
import { newSample } from '../terrain.ts';
import type { Traffic } from '../traffic.ts';
import type { Effects, EffectsSubject } from '../../effects.ts';
import type { RocketPads } from './rocket-pads.ts';

/** A ship lower than this over the ground blows a ring of dust out from under its hull. */
const THRUST_DUST = 24;
/** Craft farther than this from the traveller raise no dust. */
const DUST_NEAR = 160;

/** The traveller as the effects see them: on foot or seated, and which way they face. */
export function createEffectsSubject(player: WorldPlayer, pads: RocketPads): EffectsSubject {
  const up = new THREE.Vector3();
  return {
    get position() {
      return player.position;
    },
    get forward() {
      return player.facing;
    },
    get up() {
      return up.copy(player.position).normalize();
    },
    get state() {
      return player.craft === null && pads.riding === null ? 'foot' : 'seated';
    },
    get airborne() {
      return player.airborne;
    },
    grounded: true,
    ride: null,
  };
}

export interface Dust {
  /** A ship low over the ground blows dust out, and a rover under way throws a little off its back wheels. */
  raise(dt: number): void;
  /** Every 30 frames, the colour of the dust a foot raises: the ground's own, a little paler. */
  tint(): void;
}

export function createDust(deps: { effects: Effects; player: WorldPlayer; traffic: Traffic; terrain: Terrain; radius: number; groundAt: (point: THREE.Vector3) => number }): Dust {
  const { effects, player, traffic, terrain, radius: R, groundAt } = deps;
  let thrustClock = 0;
  let wheelClock = 0;
  const dustPoint = new THREE.Vector3();
  const dustSide = new THREE.Vector3();
  let dustAt = 0;
  const dustSample = newSample();
  const dustColor = new THREE.Color();
  const paler = new THREE.Color(0xffffff);
  const scratchUnit = new THREE.Vector3();
  return {
    raise(dt) {
      thrustClock -= dt;
      wheelClock -= dt;
      const thrust = thrustClock <= 0;
      const wheels = wheelClock <= 0;
      if (thrust) thrustClock = 0.09;
      if (wheels) wheelClock = 0.16;
      const visit = (craft: Craft): void => {
        if (craft.position.distanceTo(player.position) > DUST_NEAR) return;
        if (thrust && (craft.kind === 'lander' || craft.kind === 'ufo') && craft.airborne) {
          const ground = R + groundAt(craft.position);
          const clearance = craft.position.length() - ground;
          if (clearance > THRUST_DUST) return;
          const near = 1 - clearance / THRUST_DUST;
          const up = dustSide.copy(craft.position).normalize();
          dustPoint.copy(up).multiplyScalar(ground);
          effects.dustAt(dustPoint, craft.radius * (1 + clearance / THRUST_DUST), Math.round(2 + 5 * near));
        } else if (wheels && craft.kind === 'rover' && !craft.airborne && Math.abs(craft.speed) > 7) {
          dustPoint.copy(craft.position).addScaledVector(craft.heading, -craft.radius * 0.8 * Math.sign(craft.speed));
          dustPoint.setLength(R + groundAt(dustPoint));
          effects.dustAt(dustPoint, 1.4, Math.abs(craft.speed) > 16 ? 3 : 2);
        }
      };
      if (player.craft !== null) visit(player.craft);
      for (const rover of traffic.rovers) visit(rover.craft);
    },
    tint() {
      if (dustAt-- > 0) return;
      dustAt = 30;
      const unit = scratchUnit.copy(player.position).normalize();
      terrain.sample(unit.x, unit.y, unit.z, dustSample);
      dustColor.setRGB(dustSample.r, dustSample.g, dustSample.b, THREE.LinearSRGBColorSpace).lerp(paler, 0.25);
      effects.setDust(dustColor.getHex());
    },
  };
}
