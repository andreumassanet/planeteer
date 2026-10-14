import { Vector3 } from 'three';
import type { World } from '../../src/geo.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { isShown } from '../../src/places.ts';
import type { Place } from '../../src/places.ts';
import { placeDirection } from '../../src/roads/town.ts';

/** What every stage of the road bake reads: the places, the world, the built towns and their unit vectors. */
export interface BakeContext {
  places: readonly Place[];
  world: World;
  /** Indices of the places that are built (`isShown`): the only vertex set the bake has. */
  built: readonly number[];
  /** Each place's unit vector, x y z. */
  unit: Float64Array;
  /** Chord distance between two places, in world units. Monotonic in the arc. */
  chord(i: number, j: number): number;
}

/** One road as the bake writes it. */
export interface Row {
  a: number;
  b: number;
  cls: number;
  bend: number;
  gateA: number;
  gateB: number;
  layer: number;
  bridgeFrom: number;
  bridgeTo: number;
}

export function createBakeContext(places: readonly Place[], world: World): BakeContext {
  const unit = new Float64Array(places.length * 3);
  const scratch = new Vector3();
  places.forEach((place, i) => {
    placeDirection(place, scratch);
    unit[i * 3] = scratch.x;
    unit[i * 3 + 1] = scratch.y;
    unit[i * 3 + 2] = scratch.z;
  });
  const built: number[] = [];
  for (let i = 0; i < places.length; i++) if (isShown(places[i]!)) built.push(i);
  const chord = (i: number, j: number): number => {
    const dx = unit[i * 3]! - unit[j * 3]!;
    const dy = unit[i * 3 + 1]! - unit[j * 3 + 1]!;
    const dz = unit[i * 3 + 2]! - unit[j * 3 + 2]!;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) * PLANET_RADIUS;
  };
  return { places, world, built, unit, chord };
}
