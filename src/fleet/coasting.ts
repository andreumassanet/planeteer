/**
 * A vehicle the player jumped out of goes on without anybody: it slows, glides
 * or sinks, and parks where it ends up, telling the link where it is every
 * frame so every client sees it go on.
 */
import * as THREE from 'three';
import { PLANET_RADIUS, groundRadius } from '../globe.ts';
import {
  FOUNDER_DRAG,
  FOUNDER_TIME,
  ROAD_HANDLING,
  WATERLINE,
  founderDepth,
  founderNose,
  founders,
  isWater,
} from '../vehicles.ts';
import { AT_REST } from '../craft/motion.ts';
import type { MotionInput } from '../craft/motion.ts';
import { isAirKind } from '../craft/contract.ts';
import { writePose } from '../player/pose.ts';
import {
  BALLOON_FALL,
  COAST_BOUNCE,
  COAST_DRAG,
  COAST_GRAVITY,
  COAST_MAX,
  COAST_STOP,
  GLIDE_RATIO,
  HELI_FALL,
  KNOCK_SPEED,
  WRECK_SPEED,
} from './limits.ts';
import { applyPose } from './pose.ts';
import type { Parking } from './parking.ts';
import type { Placing } from './placing.ts';
import type { FleetContext } from './state.ts';

export interface Coasting extends Parking {
  /** One frame of the vehicle going on alone. */
  coastOn(dt: number): void;
}

export function createCoasting(ctx: FleetContext, placing: Placing, parking: Parking): Coasting {
  const { options, link, state, point, up } = ctx;
  const { world, onEvent } = options;
  const { landAt, standingAt, seat } = placing;
  const { sinkCoast, finishCoast, coastPose } = parking;
  const sinkSide = new THREE.Vector3();
  const coasting: MotionInput = { ...AT_REST };
  const coastFrom = new THREE.Vector3();
  const coastAxis = new THREE.Vector3();
  const coastPush = new THREE.Vector3();

  /** One frame of the vehicle going on alone. */
  function coastOn(dt: number): void {
    const c = state.coast;
    if (c === null || dt <= 0) return;
    const model = c.entry.model;
    const kind = model.kind;
    c.age += dt;
    const ease = (rate: number): number => 1 - Math.exp(-rate * dt);
    if (c.flying) {
      if (kind === 'plane') c.vertical += (-Math.max(4, Math.abs(c.speed) / GLIDE_RATIO) - c.vertical) * ease(1.5);
      else {
        c.speed *= Math.exp(-dt / 3);
        c.vertical += (-(kind === 'balloon' ? BALLOON_FALL : HELI_FALL) - c.vertical) * ease(1);
      }
    } else {
      // On the ground an aircraft brakes hard; everything else runs on its own coast.
      const tau = isAirKind(kind) ? 1.5 : ROAD_HANDLING[kind]?.coastTime ?? 3;
      const sign = Math.sign(c.speed);
      c.speed = c.speed * Math.exp(-dt / tau) - sign * COAST_DRAG * dt;
      if (Math.sign(c.speed) !== sign) c.speed = 0;
    }
    // Along its bow, round the planet.
    coastFrom.copy(c.position);
    up.copy(c.position).normalize();
    const arc = (c.speed * dt) / c.position.length();
    if (Math.abs(arc) > 1e-12) {
      coastAxis.crossVectors(up, c.forward).normalize();
      c.position.applyAxisAngle(coastAxis, arc);
      c.forward.applyAxisAngle(coastAxis, arc);
      up.copy(c.position).normalize();
    }
    c.forward.projectOnPlane(up).normalize();
    // What is under it: a hull stops at the land and a horse at the water;
    // anything else rolls on into it and founders (`founders`).
    point.copy(up).multiplyScalar(PLANET_RADIUS);
    const relief = groundRadius(world, point);
    const wet = isWater(relief);
    const afloat = model.medium === 'water';
    const swamps = founders(kind, model.medium);
    if (!c.flying && (afloat ? !wet : wet && !swamps)) {
      c.position.copy(coastFrom);
      c.speed = 0;
      up.copy(c.position).normalize();
    }
    // A wall turns it back.
    if (!c.flying && options.collide !== undefined && Math.abs(c.speed) > 0) {
      point.copy(c.position).addScaledVector(c.forward, (Math.sign(c.speed) * model.size[0]) / 2);
      if (options.collide(point, model.size[1] / 2, coastPush)) {
        c.position.copy(coastFrom);
        up.copy(c.position).normalize();
        if (Math.abs(c.speed) > KNOCK_SPEED) onEvent?.('wrecked', model, c.position);
        c.speed = -c.speed * COAST_BOUNCE;
      }
    }
    // Its floor: the sea's line, or the ground its kind is parked on (`seat`):
    // the drawn land, and what is made over it for anything on wheels or legs.
    let floor: number;
    point.copy(up).multiplyScalar(PLANET_RADIUS);
    if (afloat || isWater(groundRadius(world, point))) floor = PLANET_RADIUS + WATERLINE;
    else floor = isAirKind(kind) ? landAt(point) : standingAt(point);
    let radius = c.position.length();
    // In the water: it floats a moment, then goes down nose first.
    if (!c.flying && swamps && isWater(groundRadius(world, point)) && radius <= floor + 0.05) {
      if (c.sinking < 0) {
        c.sinking = 0;
        onEvent?.('foundered', model, c.position);
      } else c.sinking += dt;
      c.speed *= Math.exp(-dt / FOUNDER_DRAG);
      c.vertical = 0;
      c.position.setLength(floor - founderDepth(c.sinking));
      up.copy(c.position).normalize();
      // The nose down about its own side: forward towards down, up towards forward.
      const nose = founderNose(c.sinking);
      sinkSide.copy(c.forward).multiplyScalar(Math.cos(nose)).addScaledVector(up, -Math.sin(nose));
      const tiltedUp = point.copy(up).multiplyScalar(Math.cos(nose)).addScaledVector(c.forward, Math.sin(nose));
      writePose(c.position, sinkSide, tiltedUp, coastPose);
      applyPose(coastPose, c.entry.group);
      link.drive(c.entry.id, coastPose, c.speed);
      coasting.speed = 0;
      coasting.grounded = true;
      c.entry.motion.update(dt, coasting);
      if (c.sinking >= FOUNDER_TIME) sinkCoast();
      return;
    }
    c.sinking = -1;
    if (!c.flying && radius > floor + 0.05) c.vertical -= COAST_GRAVITY * dt;
    radius += c.vertical * dt;
    if (radius <= floor) {
      if (c.flying || c.vertical < -WRECK_SPEED) {
        if (-c.vertical > WRECK_SPEED || kind === 'plane') onEvent?.('wrecked', model, c.position);
        c.speed *= kind === 'balloon' ? 0.2 : 0.5;
        c.flying = false;
      }
      radius = floor;
      c.vertical = 0;
    }
    c.position.setLength(radius);
    writePose(c.position, c.forward, up.copy(c.position).normalize(), coastPose);
    // On the ground, on its wheels as it will stand parked.
    if (!c.flying && radius <= floor + 0.05) seat(model, coastPose, coastPose);
    applyPose(coastPose, c.entry.group);
    link.drive(c.entry.id, coastPose, c.speed);
    coasting.speed = c.speed;
    coasting.grounded = !c.flying;
    c.entry.motion.update(dt, coasting);
    if ((!c.flying && Math.abs(c.speed) < COAST_STOP && c.vertical === 0) || c.age > COAST_MAX) finishCoast();
  }

  return { ...parking, coastOn };
}
