/** What a standing vehicle's moving parts are doing: another player's vehicle going, or nobody's at rest. */
import * as THREE from 'three';
import { ROAD_HANDLING } from '../vehicles.ts';
import { AT_REST } from '../craft/motion.ts';
import type { MotionInput } from '../craft/motion.ts';
import { isAirKind } from '../craft/contract.ts';
import type { WirePose } from '../craft/contract.ts';
import { MOORED, MOOR_REACH } from './limits.ts';
import type { Placing } from './placing.ts';
import type { Drawn, FleetContext } from './state.ts';

export function createAnimator(ctx: FleetContext, placing: Placing) {
  const { options, link, point, up } = ctx;
  const { player } = options;
  const { landAt } = placing;
  const localPoint = new THREE.Vector3();
  const turned = new THREE.Vector3();
  const heading = new THREE.Vector3();
  /** What another player's vehicle's motion is handed, rewritten every frame. */
  const remote: MotionInput = { ...AT_REST };

  /**
   * Somebody else's vehicle, moving: its springs, wheels and propeller are
   * handed what its poses say it is doing, the speed along its nose and the
   * turn between this frame's heading and the last, smoothed over an eighth of
   * a second. The wheel is read back off the turn through the steering law
   * (`steerWheels` in `player/`), so a car turning on the spot does not show
   * full lock.
   */
  function animate(entry: Drawn, dt: number, at: WirePose): void {
    point.set(at[0]!, at[1]!, at[2]!);
    heading.set(at[3]!, at[4]!, at[5]!).normalize();
    if (entry.tracked && dt > 0) {
      up.copy(point).normalize();
      const along = localPoint.copy(point).sub(entry.last).dot(heading) / dt;
      const turn = Math.asin(Math.max(-1, Math.min(1, turned.crossVectors(entry.lastForward, heading).dot(up)))) / dt;
      const ease = 1 - Math.exp(-8 * dt);
      entry.speed += (along - entry.speed) * ease;
      entry.turn += (turn - entry.turn) * ease;
    }
    entry.last.copy(point);
    entry.lastForward.copy(heading);
    entry.tracked = true;
    const kind = entry.model.kind;
    const pace = Math.abs(entry.speed);
    remote.speed = entry.speed;
    remote.turnRate = entry.turn;
    remote.steering = 0;
    const handling = ROAD_HANDLING[kind];
    if (handling !== undefined) {
      const grip = Math.max(handling.pivot, Math.min(1, pace / handling.gripSpeed));
      const lock = 1 + (handling.fastLock - 1) * Math.min(1, pace / handling.boost);
      const reach = handling.turn * grip * lock;
      if (reach > 1e-3) remote.steering = Math.max(-1, Math.min(1, (-entry.turn / reach) * (entry.speed < 0 ? -1 : 1)));
    }
    // On the ground unless it flies, or its rider's own state is off it: a
    // horse's leap is the driver's jump, which the pose alone cannot tell
    // from a step off a terrace.
    remote.grounded = isAirKind(kind) ? point.length() - landAt(point) < 1.5 : !(link.leaping?.(entry.id) ?? false);
    remote.engine = true;
    remote.moored = false;
    remote.throttle = entry.speed > 0.5 ? 1 : 0;
    entry.motion.update(dt, remote);
  }

  /** A vehicle nobody is driving: a hull near enough to see rides its mooring and a horse idles, anything else eases to rest. */
  function settle(entry: Drawn, dt: number): void {
    entry.tracked = false;
    entry.speed = entry.turn = 0;
    const alive = entry.model.medium === 'water' || entry.model.kind === 'horse';
    if (alive && entry.group.position.distanceTo(player.position) < MOOR_REACH) entry.motion.update(dt, MOORED);
    else if (entry.motion.settling) entry.motion.update(dt, AT_REST);
  }

  return { animate, settle };
}
