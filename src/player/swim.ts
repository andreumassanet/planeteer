/**
 * Swimming and diving: going into the water, and the depth of a diver for the frame.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { WATERLINE } from '../vehicles.ts';
import {
  DIVE_BUOYANCY,
  DIVE_EASE,
  DIVE_FLOOR_CLEAR,
  DIVE_SPEED,
  RISE_SPEED,
  SWIM_SPLASH,
  SWIM_SPRINT,
} from './constants.ts';
import { approach, clamp } from './math.ts';
import type { PlayerCore } from './core.ts';
import type { Splash } from './splash.ts';

export function createSwim(core: PlayerCore, ring: Splash) {
  const { controls, motion, options, position } = core;
  const s = core.fields;
  const { spray } = ring;

  /** Into the water from the land, or from a fall. */
  function enterWater(): void {
    s.state = 'swim';
    s.height = PLANET_RADIUS + WATERLINE;
    position.setLength(s.height);
    s.vertical = 0;
    s.airborne = false;
    motion.clampLength(0, SWIM_SPRINT);
    s.dive = 0;
    s.diveRate = 0;
    spray(PLANET_RADIUS + WATERLINE, SWIM_SPLASH);
    options.onEvent?.('swim', 0);
  }

  /** How deep a swimmer may dive here: down to the sea floor less a clearance, and not at all where nobody has said where the floor is. */
  function diveFloor(at: THREE.Vector3): number {
    if (options.seaFloorAt === undefined) return 0;
    return Math.max(0, PLANET_RADIUS + WATERLINE - (options.seaFloorAt(at) + DIVE_FLOOR_CLEAR));
  }

  /**
   * The swimmer's depth for the frame: down on the descend key, up on the climb
   * key, a slow drift up with neither, eased like a body in water; never through the
   * floor, and pushed up by a floor that rises under him.
   */
  function diveOn(dt: number): void {
    const lift = controls.lift;
    const wanted = lift < 0 ? DIVE_SPEED : lift > 0 ? -RISE_SPEED : s.dive > 0 ? -DIVE_BUOYANCY : 0;
    s.diveRate += (wanted - s.diveRate) * approach(1 / DIVE_EASE, dt);
    const floor = diveFloor(position);
    s.dive = clamp(s.dive + s.diveRate * dt, 0, floor);
    // Held at the surface or on the floor, the way on is spent.
    if (s.dive === 0 && s.diveRate < 0) s.diveRate = 0;
    if (s.dive === floor && s.diveRate > 0) s.diveRate = 0;
  }

  return { enterWater, diveOn };
}

export type Swim = ReturnType<typeof createSwim>;
