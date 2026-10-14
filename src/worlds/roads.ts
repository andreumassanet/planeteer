/**
 * The roads of another world: every town joined to its natural neighbours, as
 * Earth's towns are, by a carriageway that leaves by the end of a main street
 * facing its way, runs straight out over the town's levelled pad, and crosses
 * the country to the next town's gate.
 *
 * The network (`roads/network.ts`) is pure: a function of the towns and the
 * ground, so every visitor drives the same roads and the towns know which of
 * their streets go somewhere (`ends`). The ribbon (`roads/ribbon.ts`) rides
 * Earth's railway crown and road bank; `surfaceAt` reads the same top and bank
 * back, which the foot and the wheels stand on (`index.ts`'s `groundAt`).
 * Streamed in chunks round the traveller, merged into one buffer a chunk.
 *
 * On a cloud deck the road is a bridge: the same network and crown, a lift over
 * the clouds, a steel fascia and rail instead of banks, and pylons sinking out
 * of sight. The towns' platforms float, and the skyways between them are what
 * the traffic drives.
 */

import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import type { Terrain } from './terrain.ts';
import type { Site } from './settlements.ts';
import { chunksOf, createSurfaceIndex } from './roads/chunks.ts';
import type { Chunk } from './roads/chunks.ts';
import { createRoadMaterial, roadLook } from './roads/look.ts';
import { layChunk } from './roads/mesh.ts';
import type { RoadNetwork } from './roads/network.ts';
import { gateStepOf, linesOf, nearestOnRoads, placeOnRoad, roadsNear, sweepRoads } from './roads/queries.ts';
import { STEP, crownOf, makeRibbons } from './roads/ribbon.ts';
import type { RibbonEnv } from './roads/ribbon.ts';

export { CARRIAGE_TOP, roadNetwork } from './roads/network.ts';
export type { Gate, Road, RoadNetwork } from './roads/network.ts';

/** Built within this of the traveller, dropped past the second, units, at the render distance's default. */
const BUILD_REACH = 3000;
const DROP_REACH = 3800;
/** How long a frame may spend building chunks, ms; the nearest one is always built. */
const BUILD_MS = 4;

export interface Roads {
  group: THREE.Group;
  readonly network: RoadNetwork;
  /** Builds the chunks near `eye` and drops the far ones; `reach` is the render distance's multiple. */
  update(eye: THREE.Vector3, reach: number): void;
  /**
   * The road's surface over the direction `x, y, z` (a unit vector) as a
   * height over the walkable radius — the top, or the bank falling from it —
   * or null off every built road. What a foot and a wheel stand on.
   */
  surfaceAt(x: number, y: number, z: number): number | null;
  /**
   * Every road as a line of `[lat, lon]` a few tens of units a point, for the
   * map: class 1, a road, Earth's middle one.
   */
  lines(): { cls: number; points: [number, number][] }[];
  /** The roads with a point within `within` units of `point`, and how far along each that nearest point is. */
  near(point: THREE.Vector3, within: number): { road: number; s: number }[];
  /** How long a road is, units, gate to gate. */
  lengthOf(road: number): number;
  /** The carriageway's half-width on a road, units. */
  halfOf(road: number): number;
  /**
   * The point on a road's top `s` units from gate A and `lateral` units to
   * its right, written into `at`, and the way the road runs there (from A to
   * B) into `along`: what the traffic drives on.
   */
  place(road: number, s: number, lateral: number, at: THREE.Vector3, along: THREE.Vector3): void;
  /** The nearest point on any road's crown to `point`, within `within` units, and the road's heading there; null past it. */
  nearest(point: THREE.Vector3, within: number): { at: THREE.Vector3; along: THREE.Vector3 } | null;
  /**
   * Every built piece's top read back between its points and across its
   * width, against the drawn ground there: what a check holds the crown to.
   * `each` gets the top's height and the ground's, over the walkable radius.
   */
  sweep(each: (top: number, ground: number) => void): void;
  readonly stats: { roads: number; steep: number; chunks: number; triangles: number };
  /** The worst step between a road's crown at its gate and the town street it meets, units: for the checks. */
  gateStep(): number;
  dispose(): void;
}

export function createRoads(spec: WorldSpec, terrain: Terrain, sites: readonly Site[], network: RoadNetwork, gradientMap: THREE.Texture): Roads {
  const R = terrain.radius;
  const env: RibbonEnv = { terrain, R, deck: spec.ground === 'cloud-deck' };
  const group = new THREE.Group();
  group.name = 'world-roads';
  const material = createRoadMaterial(gradientMap);
  const look = roadLook(spec);
  const ribbons = makeRibbons(env, network, sites);
  const chunks = chunksOf(ribbons, R);
  const surface = createSurfaceIndex(env, ribbons);
  const stats = { roads: ribbons.length, steep: network.steep, chunks: 0, triangles: 0 };

  function build(chunk: Chunk): void {
    const ribbon = ribbons[chunk.road]!;
    crownOf(env, ribbon, chunk.from, chunk.to);
    surface.index(chunk);
    const made = layChunk(env, look, ribbon, chunk, material);
    group.add(made.mesh);
    chunk.mesh = made.mesh;
    stats.chunks++;
    stats.triangles += made.triangles;
  }

  function drop(chunk: Chunk): void {
    if (chunk.mesh === null) return;
    group.remove(chunk.mesh);
    stats.triangles -= chunk.mesh.geometry.getAttribute('position').count / 3;
    chunk.mesh.geometry.dispose();
    chunk.mesh = null;
    stats.chunks--;
  }

  return {
    group,
    network,
    stats,
    update(eye, reach) {
      const near = BUILD_REACH * Math.max(0.5, reach);
      const far = DROP_REACH * Math.max(0.5, reach);
      // The far ones let go, then the nearest of the wanted built first: a
      // traveller set down on a road sees the road under them first.
      const wanted: { chunk: Chunk; d: number }[] = [];
      for (const chunk of chunks) {
        const d = chunk.centre.distanceTo(eye);
        if (chunk.mesh !== null && d > far) drop(chunk);
        else if (chunk.mesh === null && d < near) wanted.push({ chunk, d });
      }
      wanted.sort((a, b) => a.d - b.d);
      const began = performance.now();
      for (const one of wanted) {
        build(one.chunk);
        if (performance.now() - began > BUILD_MS) break;
      }
    },
    surfaceAt: surface.surfaceAt,
    sweep: (each) => sweepRoads(env, ribbons, chunks, each),
    gateStep: () => gateStepOf(env, ribbons),
    lines: () => linesOf(ribbons),
    near: (point, within) => roadsNear(env, ribbons, point, within),
    lengthOf: (road) => (ribbons[road]!.dirs.length - 1) * STEP,
    halfOf: (road) => ribbons[road]!.half,
    place: (road, s, lateral, at, along) => placeOnRoad(env, ribbons[road]!, s, lateral, at, along),
    nearest: (point, within) => nearestOnRoads(env, ribbons, point, within),
    dispose() {
      for (const chunk of chunks) drop(chunk);
      group.removeFromParent();
      material.dispose();
    },
  };
}
