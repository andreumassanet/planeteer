/**
 * Sitting on a bench, and teleporting.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { unitAt } from '../sphere.ts';
import { WATERLINE, isWater } from '../vehicles.ts';
import { BODY_RADIUS, SPLASH_TIME, SWIM_DEPTH } from './constants.ts';
import type { PlayerCore } from './core.ts';
import type { Stance } from './stance.ts';
import type { BodyRig } from './body.ts';
import type { Publish } from './publish.ts';
import type { Presentation } from './presentation.ts';

export function createTeleport(
  core: PlayerCore,
  stance: Stance,
  body: BodyRig,
  published: Publish,
  presentation: Presentation,
) {
  const { avatar, direction, forward, freeSpotNear, position, query, splash, spot, standingRadius, target, up } = core;
  const s = core.fields;
  const { stand, still } = stance;
  const { dropRide } = body;
  const { publish } = published;
  const { pose } = presentation;

  /** Sits down on a bench (`bench.ts`), the root `drop` under the ground. False anywhere but on foot on the ground. */
  function sitOn(at: THREE.Vector3, facing: THREE.Vector3, drop: number): boolean {
    if (s.ride !== null || s.state !== 'foot' || s.airborne) return false;
    // The facing is tested before anything moves, so a refusal leaves the body where it was.
    direction.copy(at).normalize();
    if (target.copy(facing).projectOnPlane(direction).lengthSq() < 1e-8) return false;
    position.copy(at);
    up.copy(direction);
    forward.copy(target).normalize();
    still();
    s.height = standingRadius(position) - drop;
    position.setLength(s.height);
    if (!avatar.emote('sit')) return false;
    s.sitting = true;
    publish();
    pose(0, 0);
    return true;
  }

  /** Teleport. Leaves the player in a fully consistent state in one call, on foot or swimming. */
  function goTo(lat: number, lon: number): void {
    if (s.sitting) stand();
    dropRide();
    s.chute = false;
    s.canopy = 0;
    s.tumbling = false;
    unitAt(lat, lon, position);
    up.copy(position).normalize();
    // Never arrive inside a building. The town at the far end is usually not
    // standing yet, and the first frame it is pushes you out of it — see
    // `freeSpotNear` — but a jump into one that is costs only this call.
    if (freeSpotNear !== undefined && freeSpotNear(query.copy(up).multiplyScalar(PLANET_RADIUS), BODY_RADIUS, spot)) {
      position.copy(spot).normalize();
      up.copy(position);
    }

    // Height comes from the ground under the new position, not the old one.
    s.height = standingRadius(position);
    position.copy(up).setLength(s.height);

    // And the heading is rebuilt from scratch: carrying the old one across
    // the planet can leave it parallel to the new `up`, and normalising that
    // is a NaN that then spreads to the whole transform.
    forward.set(0, 1, 0).projectOnPlane(up);
    if (forward.lengthSq() < 1e-6) forward.set(1, 0, 0).projectOnPlane(up);
    forward.normalize();

    still();
    // The walk cycle, the airborne blend and the breath live in the avatar,
    // and a teleport has to clear them.
    avatar.reset();
    s.altitude = 0;
    s.state = 'foot';
    s.sink = 0;
    // Teleporting into the water has you swimming, for the same reason
    // walking into it does: there is nothing there to stand on.
    if (isWater(s.height)) {
      s.state = 'swim';
      s.sink = SWIM_DEPTH;
      s.dive = 0;
      s.diveRate = 0;
      s.height = PLANET_RADIUS + WATERLINE;
      position.setLength(s.height);
    }
    s.splashAge = SPLASH_TIME;
    splash.visible = false;
    publish();
    pose(0, 0);
  }

  return { sitOn, goTo };
}

export type Teleport = ReturnType<typeof createTeleport>;
