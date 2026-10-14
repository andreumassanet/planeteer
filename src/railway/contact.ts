import * as THREE from 'three';
import { sitAhead } from '../bench.ts';
import type { Bench } from '../bench.ts';
import { crownAt } from '../rails/crown.ts';
import {
  BED_FOOT, BED_HALF, HALL_DEPTH, HALL_FROM, HALL_LENGTH, PLATFORM_FROM, PLATFORM_INNER, PLATFORM_LENGTH, PLATFORM_RISE,
  PLATFORM_WIDTH, SHOULDER_DROP,
} from '../rails/line.ts';
import type { RailNetwork } from '../rails/network.ts';
import type { StationFrame } from '../rails/stations.ts';
import { CAR_PITCH, CAR_WIDTH } from '../rails/trains.ts';
import { STATION_BENCH_BACK, STATION_BENCH_X, STATION_BENCH_ZS, STATION_SIT_ALONG } from './constants.ts';
import type { Train } from './trains.ts';

/** What a body meets on the railway: the ballast and platforms underfoot, the cars and halls as walls, the station benches. */

/** A station standing in the world. */
export interface DrawnStation {
  key: string;
  group: THREE.Group;
  frame: StationFrame;
  level: number;
  seen: number;
}

const hit = { line: 0, s: 0, off: 0 };
const probeDir = new THREE.Vector3();
const local = new THREE.Vector3();
const inverse = new THREE.Matrix4();

/** How high the ballast or a platform stands at `point`, as a radius, or 0 off them. */
export function bedHeightAt(network: RailNetwork, stations: Iterable<DrawnStation>, point: THREE.Vector3): number {
  probeDir.copy(point).normalize();
  let best = 0;
  const found = network.nearest(probeDir, BED_FOOT, hit);
  if (found !== null) {
    const crown = crownAt(network.crown(found.line), found.s);
    const fall = found.off <= BED_HALF ? 0 : ((found.off - BED_HALF) / (BED_FOOT - BED_HALF)) * SHOULDER_DROP;
    best = crown - fall;
  }
  for (const station of stations) {
    inverse.copy(station.group.matrixWorld).invert();
    local.copy(point).applyMatrix4(inverse);
    const sx = station.frame.hand > 0 ? -local.x : local.x;
    if (local.z >= PLATFORM_FROM && local.z <= PLATFORM_FROM + PLATFORM_LENGTH && sx >= PLATFORM_INNER && sx <= PLATFORM_INNER + PLATFORM_WIDTH) {
      best = Math.max(best, station.level + PLATFORM_RISE);
    }
  }
  return best;
}

/** The trains' cars and the station halls as walls: true if a body of `radius` at `point` overlaps one, and `push` the way out. */
export function collideRailway(
  trains: Iterable<Train>, stations: Iterable<DrawnStation>, point: THREE.Vector3, radius: number, push: THREE.Vector3,
): boolean {
  let hitAny = false;
  push.set(0, 0, 0);
  const test = (object: THREE.Object3D, halfX: number, halfZ: number, height: number, centreX: number, centreZ: number): void => {
    inverse.copy(object.matrixWorld).invert();
    local.copy(point).applyMatrix4(inverse);
    if (local.y < -1 || local.y > height) return;
    const dx = local.x - centreX;
    const dz = local.z - centreZ;
    const ox = halfX + radius - Math.abs(dx);
    const oz = halfZ + radius - Math.abs(dz);
    if (ox <= 0 || oz <= 0) return;
    // Out along the shallower side, in the object's frame, then back to the world's.
    const out = ox < oz ? new THREE.Vector3(Math.sign(dx || 1) * ox, 0, 0) : new THREE.Vector3(0, 0, Math.sign(dz || 1) * oz);
    out.applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
    push.add(out);
    hitAny = true;
  };
  for (const train of trains) {
    for (const car of train.cars) {
      if (car.holder.position.distanceToSquared(point) > (CAR_PITCH + radius) ** 2) continue;
      test(car.holder, CAR_WIDTH / 2, car.half, car.height, 0, 0);
    }
  }
  for (const station of stations) {
    if (station.group.position.distanceToSquared(point) > 120 * 120) continue;
    const sign = station.frame.hand > 0 ? -1 : 1;
    test(station.group, HALL_DEPTH / 2, HALL_LENGTH / 2, 12, sign * (PLATFORM_INNER + PLATFORM_WIDTH + HALL_DEPTH / 2 - 0.2), HALL_FROM + HALL_LENGTH / 2);
  }
  return hitAny;
}

/** The standing stations' benches whose sitter's spot is inside `radius` of `point`, pushed onto `out`. */
export function stationBenchesNear(stations: Iterable<DrawnStation>, point: THREE.Vector3, radius: number, out: Bench[]): void {
  for (const station of stations) {
    if (station.group.position.distanceToSquared(point) > (radius + 120) ** 2) continue;
    const sign = station.frame.hand > 0 ? -1 : 1;
    const matrix = station.group.matrixWorld;
    // The sitter's root, `sitAhead` of the back's front, on the deck.
    const spotX = sign * (STATION_BENCH_X - sitAhead(STATION_BENCH_BACK));
    STATION_BENCH_ZS.forEach((z, bench) => {
      for (const [k, along] of STATION_SIT_ALONG.entries()) {
        const position = new THREE.Vector3(spotX, PLATFORM_RISE, z + along).applyMatrix4(matrix);
        if (position.distanceTo(point) > radius) continue;
        const facing = new THREE.Vector3(-sign, 0, 0).transformDirection(matrix);
        out.push({ position, facing, sink: 0, key: `station:${station.key}:${bench}:${k}` });
      }
    });
  }
}
