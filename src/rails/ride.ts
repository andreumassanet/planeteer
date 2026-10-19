import * as THREE from 'three';
import { coursePoint } from '../roads/course.ts';
import { parameterAt } from '../roads/path.ts';
import { BENCH_DEPTH, BENCH_SEAT, sitAhead } from '../bench.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { crownAt } from './crown.ts';
import type { RailNetwork } from './network.ts';
import { CAR_GAP, CAR_PITCH, CAR_WIDTH, RAIL_TOP } from './trains.ts';
import type { ConsistKind, TrainState } from './trains.ts';

/**
 * Riding a train: where each car of a train stands, its carriage's seats, and
 * where a passenger sits, all pure functions of the line and the sky's clock,
 * so a rider is where every client draws the car.
 *
 * A train's cars keep their order along the line whichever way it runs: car 0
 * is always the one at terminus A's end, and every car but that one faces B,
 * so a carriage never turns round at a terminus and its passengers keep their
 * seats. The cab at A's end faces A: whichever end leads, a cab leads.
 */

/** A car's frame: `x` across (screen right when facing `z`), `y` up, `z` the way it faces; the origin on the rail head under its middle. */
export interface CarFrame {
  position: THREE.Vector3;
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
  /** +1 when the car faces B (along `s`), -1 when it faces A. */
  facing: 1 | -1;
}

export function emptyCarFrame(): CarFrame {
  return { position: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), facing: 1 };
}

/** A car's body length, buffer to buffer. */
export const CAR_BODY = CAR_PITCH - CAR_GAP;

/** A point `s` along a line at the rail head, over the planet's centre. */
export function railHeadAt(network: RailNetwork, line: number, s: number, out: THREE.Vector3): THREE.Vector3 {
  const path = network.path(line);
  const clamped = Math.min(path.length, Math.max(0, s));
  coursePoint(network.course(line), parameterAt(path, clamped), out);
  return out.multiplyScalar(crownAt(network.crown(line), clamped) + RAIL_TOP);
}

/** The middle of car `index` of a train `cars` long, as `s` along its line. */
export function carMiddle(state: TrainState, cars: number, index: number): number {
  const fromA = state.direction > 0 ? state.head - cars * CAR_PITCH : state.head;
  return fromA + (index + 0.5) * CAR_PITCH;
}

const ahead = new THREE.Vector3();
const behind = new THREE.Vector3();

/** Where car `index` of a line's train stands, and which way it faces. */
export function carFrame(network: RailNetwork, line: number, state: TrainState, cars: number, index: number, out: CarFrame): CarFrame {
  const middle = carMiddle(state, cars, index);
  const reach = (CAR_BODY / 2) * 0.8;
  railHeadAt(network, line, middle + reach, ahead);
  railHeadAt(network, line, middle - reach, behind);
  railHeadAt(network, line, middle, out.position);
  out.facing = index === 0 && cars > 1 ? -1 : 1;
  out.y.copy(out.position).normalize();
  out.z.subVectors(ahead, behind).multiplyScalar(out.facing);
  out.z.addScaledVector(out.y, -out.y.dot(out.z)).normalize();
  // `y x z` is the third axis of a proper rotation: `x` then `y` then `z`.
  out.x.crossVectors(out.y, out.z).normalize();
  return out;
}

/** The carriage's inside, in its car's frame: the floor over the rail head, the walls' and ends' insides, the ceiling's least height. */
export const CARRIAGE = {
  floor: 1.6,
  half: CAR_WIDTH / 2 - 0.35,
  end: CAR_BODY / 2 - 0.5,
  /** Over the floor; a car whose shell is lower takes its own (`carriageHeight`). */
  height: AVATAR_HEIGHT * 1.2,
  /** The window band over the floor, and the windows' run between the pillars. */
  sill: AVATAR_HEIGHT * 0.38,
  lintel: AVATAR_HEIGHT * 0.95,
  pane: 1.9,
} as const;

/** The seats a carriage holds, one each side of the aisle a row, all facing the way the car does. */
export const SEAT_ROWS = [-4.3, -1.6, 1.1, 3.8] as const;
export const SEAT_X = CARRIAGE.half - 1.05;
/** A seat's cushion top over the floor and its depth: a bench's, so the sitting clip fits it. */
export const SEAT_TOP = BENCH_SEAT;
export const SEAT_DEPTH = BENCH_DEPTH;
/** How far behind a seat's middle its back's front stands. */
export const SEAT_BACK = SEAT_DEPTH / 2 - 0.08;
export const SEATS_PER_CAR = SEAT_ROWS.length * 2;

/** A seat's middle in its car's frame (`y` the cushion's top): seat `n` is row `n >> 1`, the left side when even. */
export function seatMiddle(seat: number, out: THREE.Vector3): THREE.Vector3 {
  const row = SEAT_ROWS[seat >> 1]!;
  return out.set((seat & 1) === 0 ? SEAT_X : -SEAT_X, CARRIAGE.floor + SEAT_TOP, row);
}

/** Where a sitter's root goes on a seat, in its car's frame: on the floor, as far ahead as the sitting clip's hips put it. */
export function seatRoot(seat: number, out: THREE.Vector3): THREE.Vector3 {
  seatMiddle(seat, out);
  out.y = CARRIAGE.floor;
  out.z += sitAhead(SEAT_BACK);
  return out;
}

/** The cars of a consist a passenger may ride: none of a goods train, and not its cabs. */
export function carriagesOf(kind: ConsistKind, cars: number): number[] {
  if (kind === 'freight') return [];
  const out: number[] = [];
  for (let k = 1; k < cars - 1; k++) out.push(k);
  return out;
}

/** A car-frame point in the world. */
export function inCar(frame: CarFrame, local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(frame.position)
    .addScaledVector(frame.x, local.x)
    .addScaledVector(frame.y, local.y)
    .addScaledVector(frame.z, local.z);
}

/** A world point in a car's frame. */
export function toCar(frame: CarFrame, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  ahead.subVectors(point, frame.position);
  return out.set(ahead.dot(frame.x), ahead.dot(frame.y), ahead.dot(frame.z));
}

/** Whether a car-frame point is inside a carriage's box, `height` tall over the floor. */
export function insideCarriage(local: THREE.Vector3, height: number = CARRIAGE.height): boolean {
  return Math.abs(local.x) < CARRIAGE.half && Math.abs(local.z) < CARRIAGE.end && local.y > CARRIAGE.floor - 0.2 && local.y < CARRIAGE.floor + height;
}

/** A small hash in [0, 1), for who sits where on a given run. */
function rideHash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** How full a carriage is, on the average. */
export const PASSENGER_SHARE = 0.45;

/** Whether a townsperson sits on seat `seat` of car `car` of a line's train: pure in the line, the car and the seat. */
export function passengerOn(line: number, car: number, seat: number): boolean {
  return rideHash(line, car * 16 + seat, 7) < PASSENGER_SHARE;
}
