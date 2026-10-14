/**
 * A road vehicle driving through a standing town on the town's own floor,
 * and whether a drive through it is clear to be drawn.
 */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { townOf } from '../roads.ts';
import { THROUGH_HALF_WIDTH, offsetDirection } from '../scenery/grid.ts';
import { STREET_GRADE } from '../scenery/ground.ts';
import { flattenWeightAt } from '../terrain.ts';
import { streetCost, streetPose } from '../through.ts';
import type { StreetLeg, StreetPose } from '../through.ts';
import type { LifeOptions } from './api.ts';
import type { Frame } from './mover.ts';

/** Half the wheelbase a car on a town street is pitched over, in world units. */
const STREET_PITCH_REACH = 1.6;
/** Drives checked by `paved` per frame: each is a few dozen floor and wall queries. */
const PAVED_PER_FRAME = 1;
/** How often along a drive `paved` samples, in world units. */
const PAVED_STEP = 2.5;
/** How far one sample may rise over the last beyond what a ramp climbs: a lane change's lean. */
const PAVED_RISE = 0.5;

export interface TownDrive {
  /** A vehicle `q` units into a drive along a town's streets, driven out or, `back`, home. */
  streetFrame(town: number, legs: readonly StreetLeg[], q: number, back: boolean, key: string, out: Frame, ground: boolean): void;
  /** Whether the drive `key` through a standing town is clear; false until it has been checked. */
  paved(town: number, legs: readonly StreetLeg[], key: string): boolean;
  /** Lets `paved` check one more drive this frame. */
  beginFrame(): void;
  /** Forgets which drives are paved: the towns standing have changed. */
  clearPaved(): void;
}

export function createTownDrive(world: World, places: readonly Place[], streets: LifeOptions['streets']): TownDrive {
  const streetScratch: StreetPose = { x: 0, z: 0, fx: 0, fz: 1, mx: 0, mz: 1 };
  const pitchDir = new THREE.Vector3();

  /**
   * A vehicle on a town's streets, on the standing town's own floor. Drawn
   * only where the town stands and the drive was found clear by `paved`;
   * otherwise it is hidden while it crosses.
   */
  function streetFrame(
    town: number, legs: readonly StreetLeg[], q: number, back: boolean, key: string, out: Frame, ground: boolean,
  ): void {
    streetPose(legs, q, back, streetScratch);
    const square = townOf(places[town]!);
    offsetDirection(square.up, square.across, square.north, streetScratch.x, streetScratch.z, out.dir);
    out.forward.copy(square.across).multiplyScalar(streetScratch.fx).addScaledVector(square.north, streetScratch.fz);
    out.roll = 0;
    out.pitch = 0;
    if (!ground) {
      out.height = PLANET_RADIUS + 20;
      out.live = true;
      return;
    }
    const floor = streets?.floorAt(out.dir) ?? 0;
    out.live = floor > 0 && paved(town, legs, key);
    out.height = floor > 0 ? floor : PLANET_RADIUS + Math.max(0, world.elevationAt(out.dir));
    // Up a ramp nose first: the floor a wheelbase ahead against one behind.
    if (floor > 0 && out.live) {
      const sx = streetScratch.fx * STREET_PITCH_REACH;
      const sz = streetScratch.fz * STREET_PITCH_REACH;
      offsetDirection(square.up, square.across, square.north, streetScratch.x + sx, streetScratch.z + sz, pitchDir);
      const ahead = streets!.floorAt(pitchDir);
      offsetDirection(square.up, square.across, square.north, streetScratch.x - sx, streetScratch.z - sz, pitchDir);
      const behind = streets!.floorAt(pitchDir);
      if (ahead > 0 && behind > 0) out.pitch = Math.atan2(ahead - behind, 2 * STREET_PITCH_REACH);
    }
  }

  const pavedCache = new Map<string, boolean>();
  let pavedThisFrame = 0;
  const pavedPose: StreetPose = { x: 0, z: 0, fx: 0, fz: 1, mx: 0, mz: 1 };
  const pavedDir = new THREE.Vector3();
  const pavedPoint = new THREE.Vector3();

  /**
   * Whether a drive through a standing town is clear, found once per key:
   * every few units on paving, off every landmark's pad, outside every wall,
   * and with no rise between samples that a ramp does not make. A town that
   * is not standing is neither asked nor remembered.
   */
  function paved(town: number, legs: readonly StreetLeg[], key: string): boolean {
    const known = pavedCache.get(key);
    if (known !== undefined) return known;
    if (streets === undefined || pavedThisFrame >= PAVED_PER_FRAME) return false;
    const square = townOf(places[town]!);
    if (streets.floorAt(square.up) <= 0) return false;
    pavedThisFrame++;
    const cost = streetCost(legs);
    let length = 0;
    for (const leg of legs) length += leg.length;
    const steps = Math.max(2, Math.ceil(length / PAVED_STEP));
    let clear = true;
    const last = [NaN, NaN];
    for (let i = 0; i <= steps && clear; i++) {
      // Both ways: out on one lane and back on the other.
      for (const back of [false, true]) {
        streetPose(legs, (i / steps) * cost, back, pavedPose);
        offsetDirection(square.up, square.across, square.north, pavedPose.x, pavedPose.z, pavedDir);
        const floor = streets.floorAt(pavedDir);
        if (floor <= 0 || flattenWeightAt(pavedDir.x, pavedDir.y, pavedDir.z) > 0) { clear = false; break; }
        // A rise no ramp makes is a flight of steps: a street to walk, not drive.
        const lane = back ? 1 : 0;
        if (Math.abs(floor - last[lane]!) > (length / steps) * STREET_GRADE + PAVED_RISE) { clear = false; break; }
        last[lane] = floor;
        pavedPoint.copy(pavedDir).multiplyScalar(floor + 1);
        if (streets.blocked(pavedPoint, THROUGH_HALF_WIDTH)) { clear = false; break; }
      }
    }
    if (pavedCache.size > 4000) pavedCache.clear();
    pavedCache.set(key, clear);
    return clear;
  }

  return {
    streetFrame,
    paved,
    beginFrame() {
      pavedThisFrame = 0;
    },
    clearPaved() {
      pavedCache.clear();
    },
  };
}
