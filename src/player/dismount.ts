/**
 * Getting out of a seat: stepping out, or jumping out of a vehicle under way.
 */
import type { WirePose } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { SHORE_REACH, SUB_UNDER, WATERLINE, isWater } from '../vehicles.ts';
import {
  BAIL_CARRY,
  BAIL_HOP,
  BAIL_SHOVE,
  BAIL_SPEED,
  BODY_RADIUS,
  JUMP_SPEED,
  STEP_OFF_DIRECTIONS,
  SWIM_DEPTH,
  SWIM_SPLASH,
  SWIM_SPRINT,
  TAU,
  isAir,
} from './constants.ts';
import { writePose } from './pose.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { BailOut } from './bail-out.ts';
import type { Stance } from './stance.ts';
import type { BodyRig } from './body.ts';
import type { Splash } from './splash.ts';
import type { Publish } from './publish.ts';
import type { Presentation } from './presentation.ts';

export function createDismount(
  core: PlayerCore,
  frame: Frame,
  bail: BailOut,
  stance: Stance,
  body: BodyRig,
  ring: Splash,
  published: Publish,
  presentation: Presentation,
) {
  const {
    LOCAL_Y,
    LOCAL_Z,
    bow,
    collide,
    craft,
    direction,
    forward,
    freeSpotNear,
    motion,
    object,
    position,
    probe,
    pushed,
    query,
    side,
    spot,
    standingRadius,
    target,
    up,
    worldQuaternion,
  } = core;
  const s = core.fields;
  const { pointAhead } = frame;
  const { bailOut } = bail;
  const { still } = stance;
  const { dropRide, seatOf } = body;
  const { spray } = ring;
  const { publish } = published;
  const { pose } = presentation;

  /**
   * Out of the seat, beside the vehicle: the pose it is left at, or null when not
   * seated. Standing still it is stepping out; under way it is jumping out, over the
   * side with some of its speed; and in the air it is a fall with a parachute.
   */
  function leave(): WirePose | null {
    if (s.ride === null) return null;
    const held = s.ride;
    const kind = held.model.kind;
    // A submarine is left at the surface: under it there is nowhere to step.
    if (kind === 'submarine' && s.dive > SUB_UNDER) return null;
    const out = poseOut(new Array<number>(9));
    // In the air: out of the door and falling, a canopy to come.
    if (isAir(kind) && !s.grounded) {
      bailOut();
      return out;
    }
    // Under way, or in the air off a quay, a terrace, a cliff: over the
    // side with some of its way on. A passenger's speed is what carries him.
    const way = held.seat === 0 ? s.speed : s.velocity;
    const bailing = Math.abs(way) > BAIL_SPEED || s.airborne;
    // Aloft, the body leaves from the height the vehicle is at and keeps its
    // fall: the spot found below is only where it is over, or a car off a
    // ramp set its driver down on the ground under it in one frame.
    const midair = s.airborne;
    const fell = s.vertical;
    const from = position.length();
    bow.copy(forward);
    // Out on the side the seat is on — a model's +X is its left — then
    // round the vehicle, nearest that side first; land if there is any
    // within a step, and for a boat within `SHORE_REACH`, else into the
    // water beside the hull.
    const where = seatOf(held);
    const first = where.x >= 0 ? Math.PI / 2 : -Math.PI / 2;
    const beside = held.model.size[1] / 2 + BODY_RADIUS + 0.8;
    const reaches = held.model.medium === 'water' ? [beside, SHORE_REACH] : [beside, held.model.size[0] / 2 + BODY_RADIUS + 0.8];
    let landed = false;
    let wet = false;
    for (const reach of reaches) {
      for (let i = 0; i < STEP_OFF_DIRECTIONS && !landed; i++) {
        const angle = first + Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1) * (TAU / STEP_OFF_DIRECTIONS);
        direction.copy(forward).applyAxisAngle(up, angle).normalize();
        pointAhead(direction, reach / position.length(), probe);
        const ground = standingRadius(probe);
        if (isWater(ground)) continue;
        if (collide !== undefined && collide(probe, BODY_RADIUS, pushed)) continue;
        spot.copy(probe).setLength(ground);
        forward.copy(direction);
        landed = true;
      }
      if (landed) break;
    }
    if (!landed) {
      // No land in reach: over the side into the water, if that is where
      // the vehicle is, or beside it on whatever there is.
      direction.copy(forward).applyAxisAngle(up, first).normalize();
      pointAhead(direction, beside / position.length(), probe);
      wet = isWater(standingRadius(probe));
      spot.copy(probe).setLength(wet ? PLANET_RADIUS + WATERLINE : standingRadius(probe));
      forward.copy(direction);
    }
    dropRide();
    still();
    position.copy(spot);
    up.copy(position).normalize();
    forward.projectOnPlane(up).normalize();
    if (!wet && freeSpotNear !== undefined && freeSpotNear(query.copy(position), BODY_RADIUS, spot)) {
      position.copy(spot).normalize();
      up.copy(position);
      position.setLength(standingRadius(position));
    }
    // Falling, the water is met when the body comes down to it (`settle`).
    if (midair) {
      wet = false;
      position.setLength(Math.max(from, standingRadius(position)));
    }
    s.height = position.length();
    if (bailing) {
      // The way the vehicle was going, less what the jump leaves behind,
      // and a shove off its side: the body flies clear, and rolls.
      motion.copy(bow).projectOnPlane(up).normalize().multiplyScalar(way * BAIL_CARRY);
      side.copy(forward).projectOnPlane(up).normalize();
      motion.addScaledVector(side, BAIL_SHOVE);
      s.velocity = motion.length();
      if (!wet) {
        s.vertical = (midair ? fell : 0) + JUMP_SPEED * BAIL_HOP;
        s.airborne = true;
        s.tumbling = true;
      }
    }
    if (wet) {
      s.state = 'swim';
      s.sink = SWIM_DEPTH;
      s.dive = 0;
      s.diveRate = 0;
      // Into the water a swimmer is a swimmer, as `enterWater` holds one:
      // off a jet ski at full tilt the body skimmed away at twice a sprint.
      motion.clampLength(0, SWIM_SPRINT);
      s.velocity = motion.length();
      spray(PLANET_RADIUS + WATERLINE, SWIM_SPLASH);
    } else s.state = 'foot';
    publish();
    pose(0, 0);
    return out;
  }

  /** The vehicle's pose while seated, or the body's on foot. */
  function poseOut(out: WirePose): WirePose {
    if (s.ride === null) {
      side.copy(up);
      return writePose(position, forward, side, out);
    }
    // The vehicle's own frame: the surface frame and the ride's roll, nose
    // and swell on top of it, read off the groups that carry them.
    worldQuaternion.copy(object.quaternion).multiply(craft.quaternion);
    direction.copy(LOCAL_Z).applyQuaternion(worldQuaternion);
    side.copy(LOCAL_Y).applyQuaternion(worldQuaternion);
    target.copy(craft.position).applyQuaternion(object.quaternion).add(position);
    return writePose(target, direction, side, out);
  }

  return { leave, poseOut };
}

export type Dismount = ReturnType<typeof createDismount>;
