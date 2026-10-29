import * as THREE from 'three';
import { shadeByClouds } from '../cloud-shade.ts';
import { FADE_MS, createFader } from '../fade.ts';
import type { World } from '../geo.ts';
import { HAZE_RADIUS } from '../globe.ts';
import { isShown, prominenceVersion } from '../places.ts';
import { createToonRamp } from '../theme.ts';
import { cellAt } from '../tile-grid.ts';
import { NEAR_BUILD, createViewCone, detailScale, detailVersion, fogFar, mayBuild, slantRange } from '../view.ts';
import { RESCAN_MOVE, RESCAN_SHARE, RESCAN_TURN, keepAllWithin } from './budget.ts';
import { BOX_TRIANGLES, estimateBoxes, skylineTileSteps } from './skyline-build.ts';
import type { SkylineSite, SkylineTile } from './skyline-build.ts';
import type { Slot } from './types.ts';

/**
 * The far towns: every built place as a few boxes (`skyline-build.ts`), out
 * to the haze, whether or not anyone has been near it. Grouped by the
 * quadtree's coarsest tile (`tile-grid.ts`), one buffer and one draw call a
 * tile, built nearest first out of the frame's far share (`'skyline'`).
 *
 * A town's boxes fold under the ground while its real town stands (once that
 * one has dissolved in) and within `NEAR_BUILD` of the viewer, where the real
 * one is built whatever it costs; so the two are never drawn over each other
 * for longer than a fade, and a town the real streamer refuses for its budget
 * is still on the horizon.
 */
export interface SkylineStats {
  tiles: number;
  towns: number;
  folded: number;
  boxes: number;
  triangles: number;
  megabytes: number;
  pending: number;
  /** Ground reach, world units. */
  reach: number;
  built: number;
  lastBuildMs: number;
}

export interface Skyline {
  readonly group: THREE.Group;
  readonly stats: SkylineStats;
  readonly material: THREE.MeshToonMaterial;
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
}

/** The quadtree level a tile is: 2.5 degrees of latitude, about 1,400 units. */
const TILE_LEVEL = 3;
/**
 * Triangles standing at the default knob. The towns under the haze go as its
 * square, so the budget does too, up to `TRIANGLE_CEILING`; a folded town
 * still counts, since its vertices are still drawn.
 */
const TRIANGLE_BUDGET = 60_000;
const TRIANGLE_CEILING = 800_000;
/** Tiles standing, one draw call each (twice with the ink). */
const MAX_TILES = 90;
/** Milliseconds of the far share a frame may take before the next town waits. */
const BUILD_MS = 2;
/** Past the haze by this share, so a town on the edge is in before the haze lets it be seen. */
const HAZE_MARGIN = 1.05;

/** How far along the ground the skyline stands: the haze's own distance. */
export function skylineReach(altitude: number): number {
  return fogFar(altitude, HAZE_RADIUS) * HAZE_MARGIN;
}

export function skylineMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  material.name = 'skyline';
  // The towns' own pen, so a far town is inked as the near one beside it.
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01], outlineNormal: true };
  return shadeByClouds(material);
}

interface Tile {
  readonly key: string;
  readonly towns: number[];
  readonly centre: THREE.Vector3;
  bound: number;
  estimate: number;
  standing: { mesh: THREE.Mesh; tile: SkylineTile } | null;
}

export function createSkyline(world: World, slots: readonly Slot[], sites: readonly SkylineSite[]): Skyline {
  const group = new THREE.Group();
  group.name = 'skyline';
  const material = skylineMaterial();
  const fader = createFader();
  const cone = createViewCone(keepAllWithin);
  const stats: SkylineStats = { tiles: 0, towns: 0, folded: 0, boxes: 0, triangles: 0, megabytes: 0, pending: 0, reach: 0, built: 0, lastBuildMs: 0 };
  let tiles: Tile[] = [];
  let indexedProminence = -1;
  let queue: Tile[] = [];
  let job: { tile: Tile; steps: Generator<void, SkylineTile | null, void> } | null = null;
  const scannedAt = new THREE.Vector3(Infinity, Infinity, Infinity);
  const scannedAxis = new THREE.Vector3(0, 0, 1);
  let scannedRange = -1;
  let scannedDetail = -1;

  /** Every built place by its tile; again whenever the prominence knob moves what is built. */
  function index(): void {
    for (const tile of tiles) release(tile);
    job = null;
    queue = [];
    const byKey = new Map<string, Tile>();
    for (const slot of slots) {
      if (!isShown(slot.place)) continue;
      const { row, column } = cellAt(slot.place.lat, slot.place.lon, TILE_LEVEL);
      const key = `${row}:${column}`;
      let tile = byKey.get(key);
      if (tile === undefined) {
        tile = { key, towns: [], centre: new THREE.Vector3(), bound: 0, estimate: 0, standing: null };
        byKey.set(key, tile);
      }
      tile.towns.push(slot.index);
      tile.centre.add(slot.anchor);
      tile.estimate += estimateBoxes(slot) * BOX_TRIANGLES;
    }
    tiles = [...byKey.values()];
    for (const tile of tiles) {
      tile.centre.divideScalar(tile.towns.length);
      for (const i of tile.towns) tile.bound = Math.max(tile.bound, tile.centre.distanceTo(slots[i]!.anchor) + slots[i]!.radius);
      // A tall tower and the edge of a square past its disc.
      tile.bound += 60;
    }
    indexedProminence = prominenceVersion();
  }

  function release(tile: Tile): void {
    const standing = tile.standing;
    if (standing === null) return;
    tile.standing = null;
    const mesh = standing.mesh;
    fader.out(mesh, () => {
      group.remove(mesh);
      mesh.geometry.dispose();
    });
  }

  function scan(viewer: THREE.Vector3, range: number): void {
    const found: { tile: Tile; distance: number }[] = [];
    for (const tile of tiles) {
      const distance = tile.centre.distanceTo(viewer);
      if (distance - tile.bound > range) continue;
      const admitted = tile.standing !== null || job?.tile === tile ? cone.keeps(tile.centre, tile.bound) : cone.admits(tile.centre, tile.bound);
      if (admitted) found.push({ tile, distance });
    }
    found.sort((a, b) => a.distance - b.distance);
    const budget = Math.min(TRIANGLE_CEILING, TRIANGLE_BUDGET * detailScale() * detailScale());
    const wanted = new Set<Tile>();
    let triangles = 0;
    for (const { tile } of found) {
      if (wanted.size >= MAX_TILES) break;
      const cost = tile.standing?.tile.triangles ?? tile.estimate;
      if (triangles + cost > budget && wanted.size > 0) continue;
      triangles += cost;
      wanted.add(tile);
    }
    for (const tile of tiles) if (tile.standing !== null && !wanted.has(tile)) release(tile);
    if (job !== null && !wanted.has(job.tile)) {
      job.steps.return(null);
      job = null;
    }
    queue = found.filter(({ tile }) => wanted.has(tile) && tile.standing === null).map(({ tile }) => tile);
  }

  function build(): void {
    const began = performance.now();
    let built = false;
    while ((job !== null || queue.length > 0) && mayBuild(began, BUILD_MS, false, 'skyline')) {
      if (job === null) {
        const tile = queue.shift()!;
        job = { tile, steps: skylineTileSteps(world, slots, tile.towns, sites, tile.centre) };
      }
      const step = job.steps.next();
      if (step.done !== true) continue;
      const { tile } = job;
      job = null;
      built = true;
      if (step.value === null) continue;
      const mesh = new THREE.Mesh(step.value.geometry, material);
      mesh.name = `skyline:${tile.key}`;
      mesh.position.copy(tile.centre);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      tile.standing = { mesh, tile: step.value };
      // A real town already standing has long since dissolved in: folded at once.
      for (const run of step.value.runs) run.standingSince = slots[run.index]!.mesh === null ? -1 : began - FADE_MS;
      group.add(mesh);
      fader.in(mesh);
      stats.built++;
    }
    if (built) stats.lastBuildMs = Number((performance.now() - began).toFixed(2));
  }

  /** Folds each town whose real one stands, or is about to, and unfolds the rest. */
  function fold(viewer: THREE.Vector3): void {
    const now = performance.now();
    let folded = 0;
    for (const tile of tiles) {
      const standing = tile.standing;
      if (standing === null) continue;
      const attribute = standing.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const positions = attribute.array as Float32Array;
      let changed = false;
      for (const run of standing.tile.runs) {
        const slot = slots[run.index]!;
        if (slot.mesh === null) run.standingSince = -1;
        else if (run.standingSince < 0) run.standingSince = now;
        const want =
          slot.failed ||
          (run.standingSince >= 0 && now - run.standingSince >= FADE_MS) ||
          slot.anchor.distanceTo(viewer) - slot.radius < NEAR_BUILD;
        if (want) folded++;
        if (want === run.folded) continue;
        run.folded = want;
        changed = true;
        const from = run.first * 3;
        const to = (run.first + run.count) * 3;
        if (want) {
          for (let k = from; k < to; k += 3) {
            positions[k] = run.buried.x;
            positions[k + 1] = run.buried.y;
            positions[k + 2] = run.buried.z;
          }
        } else positions.set(standing.tile.original.subarray(from, to), from);
        attribute.addUpdateRange(from, to - from);
      }
      if (changed) attribute.needsUpdate = true;
    }
    stats.folded = folded;
  }

  function count(): void {
    let standingTiles = 0;
    let towns = 0;
    let boxes = 0;
    let triangles = 0;
    let bytes = 0;
    for (const tile of tiles) {
      if (tile.standing === null) continue;
      standingTiles++;
      towns += tile.standing.tile.runs.length;
      boxes += tile.standing.tile.boxes;
      triangles += tile.standing.tile.triangles;
      bytes += tile.standing.tile.bytes;
    }
    stats.tiles = standingTiles;
    stats.towns = towns;
    stats.boxes = boxes;
    stats.triangles = triangles;
    stats.megabytes = Number((bytes / 1048576).toFixed(1));
    stats.pending = queue.length + (job === null ? 0 : 1);
  }

  return {
    group,
    stats,
    material,
    update(viewer, altitude, camera) {
      fader.update();
      if (indexedProminence !== prominenceVersion()) {
        index();
        scannedDetail = -1;
      }
      const reach = skylineReach(altitude);
      const range = slantRange(altitude, reach);
      stats.reach = Math.round(reach);
      cone.aim(camera);
      if (
        viewer.distanceToSquared(scannedAt) > (RESCAN_MOVE + scannedRange * RESCAN_SHARE) ** 2 ||
        Math.abs(range - scannedRange) > scannedRange * 0.1 ||
        cone.turnFrom(scannedAxis) > RESCAN_TURN ||
        scannedDetail !== detailVersion()
      ) {
        scan(viewer, range);
        scannedAt.copy(viewer);
        scannedAxis.copy(cone.axis);
        scannedRange = range;
        scannedDetail = detailVersion();
      }
      build();
      fold(viewer);
      count();
    },
  };
}
