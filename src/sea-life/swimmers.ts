// Where each swimmer is, as a pure function of its seed and the sky's clock.
// Nothing here is stored or random, so two players at the same reef see the same
// fish in the same places: the schools and the big swimmers belong to the floor's
// tiles (`tileLife` in `sea-floor.ts`), and the dolphins and whales are passes
// decided by a coarse cell and a slot of time (`podIn`).
//
// A fish is not a boid: a school is a centre on a lazy round and its fish hold
// places about it that turn with it, each on a wobble of its own. Nothing asks
// its neighbours anything, which is what makes a hundred and sixty of them cost
// less than a tenth of a millisecond.

import type * as THREE from 'three';
import type { CruiserKind, TileLife } from '../sea-floor.ts';
import type { SeaLifeFrame, SeaLifeOptions } from '../sea-life.ts';
import { createSwimContext } from './context.ts';
import { createPods } from './pods.ts';
import { createSchools } from './schools.ts';

export { MAX_DOLPHINS, MAX_WHALES } from './pods.ts';
export { MAX_CRUISERS, MAX_FISH } from './schools.ts';

/** The instanced meshes the swimmers are written into. */
export interface SwimmerMeshes {
  fish: THREE.InstancedMesh;
  cruisers: Record<CruiserKind, THREE.InstancedMesh>;
  dolphins: THREE.InstancedMesh;
  whales: THREE.InstancedMesh;
}

export interface Swimmers {
  /** Starts a frame at `seconds` as seen from `camera`: clears the counters. */
  begin(seconds: number, camera: THREE.Vector3): void;
  /** One tile's schools and big swimmers, as they are at the frame's time. */
  visitTile(tile: TileLife): void;
  /** The dolphins and the whales passing near the camera. */
  pods(frame: SeaLifeFrame, t: number, dt: number): void;
  readonly fishCount: () => number;
  readonly schoolCount: () => number;
  /** How many of each big swimmer this frame, by kind. */
  readonly bigCount: Record<string, number>;
  /** Every swimmer's position, rounded and sorted: the same clock gives the same list. */
  snapshot(): string[];
}

export function createSwimmers(
  meshes: SwimmerMeshes,
  options: SeaLifeOptions,
  bubble: (from: THREE.Vector3, rise: number, spread: number, life: number) => void,
): Swimmers {
  const ctx = createSwimContext();
  const schools = createSchools(ctx, meshes);
  const pods = createPods(ctx, meshes, options, bubble);
  const { eye, clock, bigCount, seenKinds, seenAt } = ctx;

  return {
    begin(seconds, camera) {
      clock.now = seconds;
      eye.copy(camera);
      schools.reset();
      for (const kind of Object.keys(meshes.cruisers)) bigCount[kind] = 0;
      bigCount.dolphin = 0;
      bigCount.whale = 0;
      seenKinds.length = 0;
      seenAt.length = 0;
    },
    visitTile: schools.visitTile,
    pods,
    fishCount: schools.fishCount,
    schoolCount: schools.schoolCount,
    bigCount,
    snapshot() {
      return seenKinds
        .map((kind, i) => `${kind} ${seenAt[i * 3]!.toFixed(3)},${seenAt[i * 3 + 1]!.toFixed(3)},${seenAt[i * 3 + 2]!.toFixed(3)}`)
        .sort();
    },
  };
}
