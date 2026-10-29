/**
 * The surfaces a foot stands on and the walls it cannot walk through,
 * gathered from every streamer that knows what is standing. Each source
 * answers only for its own, so pushes are summed and a free spot is asked of
 * each in turn.
 */
import * as THREE from 'three';
import type { Fleet } from '../fleet.ts';
import { BODY_JOLT, MAX_JOLT } from '../breakables.ts';
import type { App } from './context.ts';

/** How hard a full blast flings a body, as a vehicle's speed would (`flingOf`). */
const BLAST_BODY = 60;

type Collide = (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean;
type FreeSpot = (point: THREE.Vector3, radius: number, out: THREE.Vector3) => boolean;

export interface Walls {
  /**
   * The highest made surface here (a town's floor, a road's carriageway, a
   * monument's steps, a railway's bed, a harbour's deck), or 0 off all of them. The player
   * takes the higher of this and the ground.
   */
  madeHeightAt(point: THREE.Vector3): number;
  /** Everything that stops a body on foot: still walls, vehicles, trains, people and near animals. */
  collide: Collide;
  /** For a balloon or a plane higher up: only the roofs still over it, and the rockets. */
  collideAloft: Collide;
  /** What a driverless vehicle runs into: the still walls only (the fleet asks its own). */
  collideStill: Collide;
  /** The nearest spot clear of every still wall and vehicle. */
  freeSpotNear: FreeSpot;
  /**
   * A vehicle on wheels sweeping over the small things and the people: the
   * props are knocked over (`breakables.ts`), the townsfolk, the walkers and
   * the near animals knocked down; how hard it was all felt comes back.
   * See `PlayerOptions.strike`.
   */
  strike(from: THREE.Vector3, to: THREE.Vector3, radius: number, velocity: THREE.Vector3, punch: number): number;
  /**
   * A blast of `power` 0 to 1 at `point` reaching `radius` units: the props
   * and buildings in it brought down (`Breakables.blast`), the townsfolk, the
   * walkers and the near animals knocked flying outwards. Monuments stand.
   * How many went down comes back. This client's alone: nothing goes on the wire.
   */
  blast(point: THREE.Vector3, radius: number, power: number): number;
  /** Adds the fleet's vehicles as walls, once the fleet exists. */
  setFleet(fleet: Fleet): void;
}

export function createWalls(app: App): Walls {
  const { settlements, roads, monuments, railway, vegetation, launchPads, harbours, townsfolk, life, personRadius, breakables } = app;
  const stillWalls = [settlements, monuments, vegetation, launchPads, harbours] as const;
  let vehicleWalls: Collide | null = null;
  let vehicleSpot: FreeSpot | null = null;
  const vehiclePush = new THREE.Vector3();
  const stillPush = new THREE.Vector3();
  const freeFrom = new THREE.Vector3();
  const freeTo = new THREE.Vector3();
  const blastUp = new THREE.Vector3();

  return {
    madeHeightAt: (point) =>
      Math.max(
        settlements.madeHeightAt(point), roads.ribbonHeightAt(point), monuments.madeHeightAt(point), railway?.bedHeightAt(point) ?? 0,
        harbours.madeHeightAt(point),
      ),

    // A person gives no way, being where their town or route puts them; the body walking into them is pushed out.
    collide: (point, radius, push) => {
      let hit = settlements.collide(point, radius, push);
      for (let i = 1; i < stillWalls.length; i++) {
        if (!stillWalls[i]!.collide(point, radius, stillPush)) continue;
        if (hit) push.add(stillPush);
        else push.copy(stillPush);
        hit = true;
      }
      if (vehicleWalls !== null && vehicleWalls(point, radius, vehiclePush)) {
        if (hit) push.add(vehiclePush);
        else push.copy(vehiclePush);
        hit = true;
      }
      if (railway !== null && railway.collide(point, radius, vehiclePush)) {
        if (hit) push.add(vehiclePush);
        else push.copy(vehiclePush);
        hit = true;
      }
      const folkHit = townsfolk.collide(point, radius, push);
      if (folkHit) townsfolk.startle(point, false);
      const walkerHit = life.collide(point, radius, personRadius, push);
      return hit || folkHit || walkerHit;
    },

    collideAloft: (point, radius, push) => {
      const roof = settlements.collideAloft(point, radius, push);
      if (!launchPads.collideAloft(point, radius, vehiclePush)) return roof;
      if (roof) push.add(vehiclePush);
      else push.copy(vehiclePush);
      return true;
    },

    collideStill: (point, radius, push) => {
      let hit = false;
      push.set(0, 0, 0);
      for (const source of stillWalls) {
        if (!source.collide(point, radius, stillPush)) continue;
        push.add(stillPush);
        hit = true;
      }
      return hit;
    },

    // A spot one source frees may stand in another's, so each is asked from
    // where the last put the body, until a round moves it no more (at most four).
    freeSpotNear: (point, radius, out) => {
      freeFrom.copy(point);
      let moved = false;
      for (let round = 0; round < 4; round++) {
        let again = false;
        for (const source of stillWalls) {
          if (!source.freeSpotNear(freeFrom, radius, freeTo)) continue;
          freeFrom.copy(freeTo);
          again = moved = true;
        }
        if (vehicleSpot !== null && vehicleSpot(freeFrom, radius, freeTo)) {
          freeFrom.copy(freeTo);
          again = moved = true;
        }
        if (!again) break;
      }
      if (moved) out.copy(freeFrom);
      return moved;
    },

    setFleet(fleet) {
      vehicleWalls = (point, radius, push) => fleet.collide(point, radius, push);
      vehicleSpot = (point, radius, out) => fleet.freeSpotNear(point, radius, out);
    },

    blast(point, radius, power) {
      const down = breakables.blast(point, radius, power);
      // Straight down at the blast leans, along each body's own ground, away from it: flung outwards.
      blastUp.copy(point).normalize().multiplyScalar(-BLAST_BODY * power);
      return down + townsfolk.knock(point, point, radius, blastUp) + life.knock(point, point, radius, blastUp);
    },

    strike(from, to, radius, velocity, punch) {
      let jolt = breakables.strike(from, to, radius, velocity, punch);
      const bodies = townsfolk.knock(from, to, radius, velocity) + life.knock(from, to, radius, velocity);
      jolt += bodies * BODY_JOLT;
      return Math.min(MAX_JOLT, jolt);
    },
  };
}
