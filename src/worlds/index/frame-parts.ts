/** The parts of a world's frame that are a call each: the rockets, the grass under a body, the haze. */

import type * as THREE from 'three';
import type { WorldHost } from '../../world-host.ts';
import type { WorldPlayer } from '../player.ts';
import type { WorldRig } from '../camera.ts';
import type { Input } from '../../input.ts';
import type { Effects } from '../../effects.ts';
import type { Parts } from './parts.ts';
import type { RocketPads } from './rocket-pads.ts';

/**
 * How often a pad nobody is at launches on its own, on average, seconds a
 * pad: with the three or four pads in sight from a town, one goes up every
 * minute or so.
 */
const AUTO_LAUNCH = 240;
/** Nearer than this to the traveller a pad waits for them rather than launching. */
const AUTO_QUIET = 90;


/** Updates every rocket; true once the launch's curtain has covered the screen. */
export function stepRockets(host: WorldHost, rocketPads: RocketPads, player: WorldPlayer, effects: Effects, curtain: HTMLElement, dt: number, state: Input['state'], eye: THREE.Vector3, ride: RocketPads['riding']): boolean {
  const sound = host.sound();
  for (const rocket of rocketPads.rockets.values()) {
    const mine = rocket === ride;
    if (!mine && rocket.state === 'parked' && rocket.position.distanceTo(player.position) > AUTO_QUIET && Math.random() < dt / AUTO_LAUNCH) rocket.autolaunch();
    rocket.update(dt, mine && state.climb, eye, effects, sound);
  }
  if (ride === null) return false;
  curtain.style.opacity = ride.curtain.toFixed(3);
  curtain.style.display = ride.curtain > 0 ? '' : 'none';
  return ride.curtain >= 1;
}

/** Parts the grass for a body on foot, or a craft's footprint while it is down in it. */
export function updateSward(parts: Parts, player: WorldPlayer, rig: WorldRig, rocketPads: RocketPads): void {
  const { sward, swardPress, spec } = parts;
  if (sward === null) return;
  const craft = player.craft;
  let press: typeof swardPress | null = swardPress;
  if (craft === null) {
    swardPress.forward.copy(player.facing);
    swardPress.length = 0;
    swardPress.width = 0;
  } else if (craft.airborne) press = null;
  else {
    swardPress.forward.copy(craft.heading);
    swardPress.length = craft.radius;
    swardPress.width = craft.radius * 0.6;
  }
  const wind = spec.wind;
  sward.update({
    camera: rig.camera,
    player: player.position,
    press,
    height: rig.altitude,
    wind: { speed: (wind?.speed ?? 0) * (spec.sky.air > 0 ? 1 : 0), from: (((wind?.toward ?? 0) + 180) % 360) },
    hidden: rocketPads.riding !== null,
  });
}

/** Thicker air, nearer haze; never past the far plane, and further with the render distance as Earth's haze is. */
export function updateFog(parts: Parts, rig: WorldRig, rocketPads: RocketPads, reachScale: number): void {
  const { spec, R, scene, fog, sky } = parts;
  if (scene.fog === null) return;
  const riding = rocketPads.riding;
  const reach = Math.sqrt(2 * R * ((riding === null ? rig.altitude : riding.height) + 400));
  fog.far = Math.min(rig.camera.far, Math.max(600, reach * (0.55 + (1 - spec.sky.air) * 1.5) * reachScale));
  fog.near = fog.far * 0.12;
  fog.color.copy(sky.haze);
}
