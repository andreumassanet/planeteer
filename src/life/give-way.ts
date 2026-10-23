/**
 * Road vehicles giving way: each looks down its own lane at the player, the
 * vehicles about, walkers, near animals, townsfolk and the other traffic, and
 * sets its pace, delay and lane for the frame. See `YIELD_REACH`.
 */
import * as THREE from 'three';
import type { LifeShared, LifeStats } from './api.ts';
import { GREEN, signalClock, signalLeft, signalLight, signalPace } from '../signals.ts';
import type { Herding } from './herd-types.ts';
import { WALKER_RADIUS, createLaneSearch } from './lane-search.ts';
import { BLOCK_ANIMAL, BLOCK_PERSON, BLOCK_PLAYER, BLOCK_TRAFFIC } from './mover.ts';
import type { Mover, Way } from './mover.ts';
import {
  ACCELERATE,
  BRAKE,
  CATCH_UP,
  CLOCK_JUMP,
  FOLLOW_GAP,
  GRIDLOCK,
  HORN_AFTER,
  HORN_AGAIN,
  LANE_CHANGE,
  LOOK_MARGIN,
  PASS_AFTER,
  PASS_CLEAR,
  STOP_GAP,
  YIELD_REACH,
} from './tuning.ts';

/**
 * Every road vehicle's pace, delay and lane for this frame, from what was
 * drawn the last. Called before the movers are placed, so each is placed at
 * `clock - delay`.
 */
export type GiveWay = (viewer: THREE.Vector3, clock: number, walkers: readonly Mover[], herds: readonly Herding[]) => void;

export function createGiveWay(movers: ReadonlyMap<string, Mover>, stats: LifeStats, shared: LifeShared): GiveWay {
  const search = createLaneSearch(shared);
  const { find, ahead } = search;
  /** The clock `giveWay` last ran at; NaN before the first. */
  let wayClock = NaN;
  const wayUp = new THREE.Vector3();
  const wayLeft = new THREE.Vector3();
  const wayProbe = new THREE.Vector3();
  const passFrom = new THREE.Vector3();

  /**
   * Out to pass something standing in the lane, and back in once past it.
   * Only on the open road; in a town, or turning, it keeps its lane.
   */
  function passLane(mover: Mover, way: Way): void {
    if (way.part !== 0) {
      way.shiftTo = 0;
      return;
    }
    if (way.shiftTo !== 0) {
      const along = wayProbe.subVectors(way.passing, mover.at).dot(way.facing);
      const clear = way.halfLength + way.passingRadius;
      // Past it; or held out there by something else with it still ahead: back in.
      const other = find.kind >= 0 && find.at.distanceTo(way.passing) > way.passingRadius + 1;
      if (along < -(clear + 3) || (other && way.waited > PASS_AFTER && along > clear + 2)) way.shiftTo = 0;
      return;
    }
    if (
      way.shift !== 0 || way.stillFor <= PASS_AFTER || find.kind < 0 || find.kind === BLOCK_TRAFFIC ||
      find.gap > STOP_GAP + 6
    ) return;
    const gap = find.gap;
    const kind = find.kind;
    const radius = find.radius;
    passFrom.copy(find.at);
    const offset = -2 * way.lane * way.keep;
    wayUp.copy(mover.at).normalize();
    wayLeft.crossVectors(wayUp, way.facing).normalize();
    wayProbe.copy(mover.at).addScaledVector(wayLeft, offset);
    ahead(mover, way, wayProbe, gap + way.halfLength + 2 * radius + PASS_CLEAR, way.halfLength * 2 + 4);
    const free = find.gap === Infinity;
    find.gap = gap;
    find.kind = kind;
    find.radius = radius;
    find.at.copy(passFrom);
    if (!free) return;
    way.shiftTo = offset;
    way.passing.copy(passFrom);
    way.passingRadius = radius;
    way.waited = 0;
  }

  /** A clock jump is a new world: everybody back on schedule. */
  function resetWay(way: Way): void {
    way.delay = 0;
    way.pace = 1;
    way.waited = 0;
    way.stillFor = 0;
    way.horn = 0;
    way.shift = 0;
    way.shiftTo = 0;
    way.ghost = false;
    way.blocker = -1;
  }

  /** Gathers the vehicles that look this frame; false when there is nothing to step. */
  function gather(viewer: THREE.Vector3, step: number, jump: boolean, walkers: readonly Mover[], herds: readonly Herding[]): boolean {
    search.cars.length = 0;
    const reach2 = YIELD_REACH * YIELD_REACH;
    for (const mover of movers.values()) {
      const way = mover.way;
      if (way === undefined) continue;
      if (jump) {
        resetWay(way);
        continue;
      }
      if (!way.shown) {
        way.shift = 0;
        way.shiftTo = 0;
      }
      if (way.shown && mover.at.distanceToSquared(viewer) < reach2) search.cars.push(mover);
    }
    if (jump || step === 0) return false;
    search.clearBodies(viewer);
    if (search.cars.length > 0) {
      shared.inTheWay?.each(search.addOutside);
      for (const walker of walkers) search.addBody(walker.at, WALKER_RADIUS, BLOCK_PERSON);
      for (const herd of herds) for (const head of herd.heads) search.addBody(head.world, head.halfLength, BLOCK_ANIMAL);
    }
    return true;
  }

  /** One vehicle's frame: look, then set its pace, delay, waits, horn and lane. */
  function stepWay(mover: Mover, way: Way, viewer: THREE.Vector3, step: number, lights: number): void {
    find.gap = Infinity;
    find.kind = -1;
    const looking = way.shown && mover.at.distanceToSquared(viewer) < YIELD_REACH * YIELD_REACH;
    if (looking) {
      const top = mover.speed * (1 + CATCH_UP);
      ahead(mover, way, mover.at, (top * top) / (2 * BRAKE) + LOOK_MARGIN, 0);
      // What it waits behind, and whether that has stood still.
      if (find.kind !== way.blocker) {
        way.blocker = find.kind;
        way.blockedAt.copy(find.at);
        way.waited = 0;
        way.stillFor = 0;
      } else if (find.kind >= 0 && find.at.distanceTo(way.blockedAt) > 0.75) {
        way.blockedAt.copy(find.at);
        way.stillFor = 0;
      }
      passLane(mover, way);
    }

    // The pace that stops it short of the gap, eased up and cut at once; never
    // more than the gap in one frame, whatever the frame rate.
    const top = way.delay > 0 ? 1 + CATCH_UP : 1;
    let target = top;
    if (find.gap < Infinity) {
      const free = find.gap - (find.kind === BLOCK_TRAFFIC ? FOLLOW_GAP : STOP_GAP);
      const allowed = free <= 0 ? 0 : Math.min(Math.sqrt(2 * BRAKE * free), free / step);
      target = Math.min(top, allowed / mover.speed);
    }
    // A city's red light: stopped on its line, never past it in a step.
    if (way.hold < Infinity) {
      const light = signalLight(way.holdTown, lights, way.holdAxis);
      const left = signalLeft(way.holdTown, lights, way.holdAxis);
      target = Math.min(target, signalPace(way.hold, light, left, way.pace, mover.speed, step));
      if (light !== GREEN && target < 0.1) stats.atLights++;
    }
    way.pace = target < way.pace ? target : Math.min(target, way.pace + (ACCELERATE * step) / mover.speed);
    way.delay = Math.max(0, way.delay + step * (1 - way.pace));

    if (way.pace < 0.1 && find.kind >= 0) {
      way.waited += step;
      way.stillFor += step;
    } else if (way.pace > 0.5) {
      way.waited = 0;
      way.stillFor = 0;
      way.ghost = false;
    }
    way.horn = Math.max(0, way.horn - step);
    if (find.kind === BLOCK_PLAYER && way.waited > HORN_AFTER && way.horn === 0) {
      way.horn = HORN_AGAIN;
      shared.inTheWay?.horn?.(mover.at);
    }
    if (find.kind === BLOCK_TRAFFIC && way.waited > GRIDLOCK) way.ghost = true;

    // Across at a pace that grows with the speed, so it steers out rather than slides.
    if (way.shift !== way.shiftTo) {
      const rate = (LANE_CHANGE + 0.2 * mover.speed * way.pace) * step;
      const d = way.shiftTo - way.shift;
      way.shift = Math.abs(d) <= rate ? way.shiftTo : way.shift + Math.sign(d) * rate;
    }

    if (find.kind >= 0 && way.pace < 0.98) stats.yielding++;
    if (find.kind >= 0 && way.pace < 0.1) stats.waiting++;
    if (way.shiftTo !== 0 || way.shift !== 0) stats.passing++;
    stats.delayed = Math.max(stats.delayed, way.delay);
  }

  return function giveWay(viewer, clock, walkers, herds) {
    const step = clock - wayClock;
    wayClock = clock;
    const jump = !(step >= 0 && step <= CLOCK_JUMP);
    stats.yielding = 0;
    stats.waiting = 0;
    stats.passing = 0;
    stats.delayed = 0;
    stats.atLights = 0;
    if (!gather(viewer, step, jump, walkers, herds)) return;
    const lights = signalClock();
    for (const mover of movers.values()) {
      const way = mover.way;
      if (way === undefined) continue;
      stepWay(mover, way, viewer, step, lights);
    }
  };
}
