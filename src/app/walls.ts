/**
 * The surfaces a foot stands on and the walls it cannot walk through,
 * gathered from every streamer that knows what is standing. Each source
 * answers only for its own, so pushes are summed and a free spot is asked of
 * each in turn.
 */
import * as THREE from 'three';
import type { Fleet } from '../fleet.ts';
import type { App } from './context.ts';

type Collide = (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean;
type FreeSpot = (point: THREE.Vector3, radius: number, out: THREE.Vector3) => boolean;

export interface Walls {
  /**
   * The highest made surface here (a town's floor, a road's carriageway, a
   * monument's steps, a railway's bed), or 0 off all of them. The player
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
  /** Adds the fleet's vehicles as walls, once the fleet exists. */
  setFleet(fleet: Fleet): void;
}

export function createWalls(app: App): Walls {
  const { settlements, roads, monuments, railway, vegetation, launchPads, townsfolk, life, personRadius } = app;
  const stillWalls = [settlements, monuments, vegetation, launchPads] as const;
  let vehicleWalls: Collide | null = null;
  let vehicleSpot: FreeSpot | null = null;
  const vehiclePush = new THREE.Vector3();
  const stillPush = new THREE.Vector3();
  const freeFrom = new THREE.Vector3();
  const freeTo = new THREE.Vector3();

  return {
    madeHeightAt: (point) =>
      Math.max(settlements.madeHeightAt(point), roads.ribbonHeightAt(point), monuments.madeHeightAt(point), railway?.bedHeightAt(point) ?? 0),

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
  };
}
