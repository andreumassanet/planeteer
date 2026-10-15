/**
 * Puts the modelled monuments on the planet: their baked positions, and a
 * streamer that builds the ones near the viewer (each merged into one mesh),
 * seats them on the drawn land or a town's floor, and measures their walls.
 *
 * The parts live in `placement/`: `reach.ts` (how far to build), `slots.ts`,
 * `builder.ts` (geometry and material), `seating.ts` and `walls.ts`.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import { createContext } from './monuments/contract.ts';
import type { MonumentContext } from './monuments/contract.ts';
import { DATA_URL } from './pack.ts';
import { createLandmarkLights } from './landmark-lights.ts';
import type { LandmarkLights, NightBake } from './landmark-lights.ts';
import { proxyOf } from './warm.ts';
import { createFader, fadeTwin } from './fade.ts';
import { NEAR_BUILD, createViewCone, detailPixels, frameOpenFor } from './view.ts';
import type { Plan } from './landmark-ground.ts';
import { createBuilder } from './placement/builder.ts';
import { LANDMARK_RANGE, MIN_APPARENT_PIXELS, PIXELS_PER_RADIAN, RAISES_PER_FRAME, WIDEST_FOOTPRINT, keepAllWithin, rangeFor } from './placement/reach.ts';
import { createSeating } from './placement/seating.ts';
import { createSlots } from './placement/slots.ts';
import type { SurfaceSpec } from './placement/surfaces.ts';
import type { Slot } from './placement/slots.ts';
import { SOLID_REACH, createWalls } from './placement/walls.ts';

export { LANDMARK_RANGE, reachFor } from './placement/reach.ts';

/**
 * Where a monument stands, as baked by `scripts/build-monuments.ts`. The
 * position is data (curated, snapped to the coastline, checked against the
 * country outlines); the model is code, so a landmark can exist in the
 * dataset before its model does.
 */
export interface Placement {
  id: string;
  name: string;
  iso: string;
  lat: number;
  lon: number;
  /**
   * The model's own footprint radius, copied out of its file by the bake so
   * that `terrain.ts` can size the pad under it without importing the monument
   * registry. Absent means the widest the contract allows.
   */
  footprint?: number;
  /**
   * Same-shelf ground the bake found around it: past the plan's edge, capped
   * at the pad's margin, and negative where the plan itself reaches water.
   * `terrain.ts` holds a pad down to the shore lip where it is short.
   */
  clearance?: number;
  /**
   * The box the model stands in, in its own frame, measured by the bake: the
   * ground the pad is cut to, the towns leave unbuilt and the roads keep off
   * (`landmark-ground.ts`). Absent, the footprint's disc stands for it.
   */
  plan?: Plan;
  /** Stands in or at the water by what it is, and may overhang it. */
  shore?: true;
  /**
   * Stands in a square of its own, the source's `plazas`: `parcel` in a block
   * of its town's cells, which the town paves (`landmarkParcel`), `plaza` in
   * the country, with a ring of lamps (`landmark-setting.ts`).
   */
  setting?: 'plaza' | 'parcel';
  /** Which way the square's path leaves, as `atan2(x, z)` in degrees in the model's frame. */
  toward?: number;
  height?: number;
  year?: number;
  /** One sentence for the card that greets you there; `notes` in the source. */
  note?: string;
  snappedKm?: number;
}

// Under the deploy's base, as `kit.ts` and `cast.ts` fetch theirs, so a build
// served from a sub-path finds its data. Node has no `import.meta.env`.
export async function loadPlacements(url = `${DATA_URL}monuments.json`): Promise<Placement[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return ((await response.json()) as { monuments: Placement[] }).monuments;
}

/**
 * The monument registry, handed in rather than imported: `monuments/index.ts`
 * is an eager glob over every model file, and none of it is needed for the
 * first frame, so `main.ts` imports it later. Structural, so this file names
 * only what it uses.
 */
export interface MonumentKit {
  /** `MONUMENTS`. The ids, and what each is built of (`placement/surfaces.ts`). */
  readonly monuments: readonly ({ readonly id: string } & SurfaceSpec)[];
  /** `buildMonument`: builds one, or throws if it breaks the contract. */
  build(id: string, ctx: MonumentContext): THREE.Group;
}

export interface Monuments {
  group: THREE.Group;
  /** Placements with no model yet. */
  missing: Placement[];
  /** Anything that refused to build, with the contract's complaint. */
  broken: string[];
  /**
   * Call each frame. Builds what is close and drops what is not. Without a
   * camera the range is a plain radius. `time` is the sky's clock, which the
   * Eiffel Tower's sparkle keeps (`landmark-lights.ts`).
   */
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera, time?: Date): void;
  /** The nearest landmark within `range` of a point (`LANDMARK_RANGE` unless given), or null. */
  landmarkNear(point: THREE.Vector3, range?: number): Placement | null;
  /** One mesh per program this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Object3D[];
  /** The standing monuments near a point as walls: `settlements.collide`'s contract. */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** `settlements.freeSpotNear`'s contract, against the same walls. */
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /** Whether a point is inside a monument's walls and under its roof. For the camera. */
  blocksSight(point: THREE.Vector3): boolean;
  /**
   * How high a monument's own floor stands here (a plinth, a step, a plaza), as
   * a radius from the planet's centre, or 0. Only what is lower than a person
   * is a floor (`HEAD` in `scenery/occupancy.ts`).
   */
  madeHeightAt(point: THREE.Vector3): number;
  /** Monuments standing with walls, and the rectangles they hold: for the console. */
  solidStats(): { walled: number; rects: number };
  /** The standing landmarks' plaza lamps near a point, chained after the roads' (`roads.lampsNear`'s contract). */
  lampsNear(viewer: THREE.Vector3, radius: number, out: Float32Array, count: number): number;
  /** Their night: the red lights (`night.beacons`, to add to the scene), the sparkle's override and the stats. */
  night: LandmarkLights;
}

/**
 * Builds the monuments lazily and drops them again when you leave.
 *
 * `madeHeightAt` is how high the ground people made stands (`settlements.ts`),
 * so a landmark inside a terraced town stands on its floor; it is asked at
 * `raise`, since the town under a monument is streamed. `floorChanges` is
 * `settlements.ts`'s version counter: a town can arrive after the monument, and
 * every floor raised or dropped re-seats the monuments it reaches. `land` is the
 * drawn land, which a landmark stands on the lowest of under its plan once the
 * land probe has it; before that it stands on the relief's pad.
 */
export function createMonuments(
  world: World,
  placements: Placement[],
  kit: MonumentKit,
  ctx: MonumentContext = createContext(),
  madeHeightAt?: (point: THREE.Vector3) => number,
  floorChanges?: (since: number, into: number[]) => number,
  land?: THREE.Mesh,
): Monuments {
  const group = new THREE.Group();
  group.name = 'monuments';

  const known = new Set(kit.monuments.map((entry) => entry.id));
  /** Each country's continent, for the region a landmark's square is paved in. */
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const missing = placements.filter((p) => !known.has(p.id));
  const broken: string[] = [];
  const slots = createSlots(world, placements, known);

  const cone = createViewCone(keepAllWithin);
  const north = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  /** Landmarks arriving and leaving by dissolving; see `fade.ts`. */
  const fader = createFader();
  /** The standing landmarks' lamps and red lights after dark. */
  const night = createLandmarkLights();
  const walls = createWalls();
  const builder = createBuilder(kit, ctx, continentOf, slots, broken);

  /** A standing landmark's baked marks, placed where its model now is. */
  function standNight(slot: Slot, model: THREE.Mesh): void {
    const bake = model.geometry.userData.atlasNight as NightBake | undefined;
    if (bake !== undefined) night.stand(slot.placement.id, slot.placement, model, bake);
  }

  const seating = createSeating({ slots, madeHeightAt, floorChanges, land, unwall: walls.unwall, standNight });

  function raise(slot: Slot): void {
    if (slot.object !== null || slot.failed) return;
    const geometry = builder.geometryOf(slot);
    if (geometry === null) return;
    const model = new THREE.Mesh(geometry, builder.material);
    model.name = `monument:${slot.placement.id}`;

    // The contract says the group faces +Z with its base at y = 0, so placing it
    // is one basis: up is the surface normal, and +Z points at the north pole
    // along the ground. Every monument therefore faces the same way relative to
    // the world.
    facing.copy(north).projectOnPlane(slot.direction);
    if (facing.lengthSq() < 1e-8) facing.set(1, 0, 0).projectOnPlane(slot.direction);
    facing.normalize();
    right.crossVectors(slot.direction, facing).normalize();
    basis.makeBasis(right, slot.direction, facing);
    // `right = up x facing`, so the basis is proper by construction; asserted
    // anyway, because a reflection here is a landmark drawn as a blob of ink
    // and `setFromRotationMatrix` would hide it by silently discarding it.
    if (basis.determinant() <= 0) {
      slot.failed = true;
      broken.push(`${slot.placement.id}: placement basis has determinant ${basis.determinant()}`);
      return;
    }

    seating.seat(slot, model);
    model.quaternion.setFromRotationMatrix(basis);
    model.castShadow = true;
    model.receiveShadow = true;
    group.add(model);
    fader.in(model);
    slot.object = model;
    standNight(slot, model);
  }

  function drop(slot: Slot): void {
    const model = slot.object;
    if (model === null) return;
    walls.unwall(slot);
    slot.object = null;
    night.leave(slot.placement.id);
    // Dissolved away (`fade.ts`). The GPU's copy goes after; the arrays stay
    // cached for the next raise, and a raise during the fade shares them, so
    // the copy stays too.
    fader.out(model, () => {
      group.remove(model);
      if (slot.object?.geometry !== model.geometry) model.geometry.dispose();
    });
  }

  function update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera, time?: Date): void {
    fader.update();
    // First, so a monument raised below stands on whatever the floors are
    // now, and one already standing follows a floor that moved this frame.
    seating.reseat();
    // And once the land probe has the ground under one seated on the relief.
    const probe = seating.landProbe;
    if (probe !== null) {
      for (const slot of slots) {
        if (slot.object !== null && !slot.onDrawn && probe.covers(slot.direction) && seating.drawnUnder(slot) !== null) seating.seat(slot, slot.object);
      }
    }
    const range = rangeFor(altitude);
    // Hysteresis: without it a monument at exactly the edge rebuilds every frame.
    const keep = range * 1.25;
    const pixelFloor = detailPixels(MIN_APPARENT_PIXELS);
    cone.aim(camera);
    let raised = 0;
    for (const slot of slots) {
      const distance = slot.anchor.distanceTo(viewer);
      const footprint = slot.placement.footprint ?? WIDEST_FOOTPRINT;
      // Big enough to read, and on the screen. Both are hysteretic: the wide
      // cone and the 1.25 range keep a monument standing well past the point
      // where it would not be started.
      const legible = PIXELS_PER_RADIAN * 2 * footprint >= pixelFloor * Math.max(1, distance);
      // The contract allows 140 units of height against 55 of footprint, so a
      // sphere at the footprint alone would cull a tall spire at the top of the frame.
      const bound = footprint + 150;
      if (distance < range && legible && cone.admits(slot.anchor, bound)) {
        if (slot.object === null && !slot.failed && raised < RAISES_PER_FRAME && frameOpenFor(raised, distance - footprint < NEAR_BUILD, 'landmarks')) {
          raise(slot);
          raised++;
        }
      } else if (distance > keep || !legible || !cone.keeps(slot.anchor, bound)) drop(slot);
      // Near enough to walk into: measured, one a frame, in the frame's allowance.
      if (slot.object !== null && slot.walls === null && distance < footprint + SOLID_REACH && raised < RAISES_PER_FRAME && frameOpenFor(raised, true)) {
        walls.wall(slot);
        raised++;
      }
    }
    night.update(time);
  }

  return {
    group,
    missing,
    broken,
    update,
    collide: walls.collide,
    freeSpotNear: walls.freeSpotNear,
    blocksSight: walls.blocksSight,
    madeHeightAt: walls.madeHeightAt,
    solidStats: walls.stats,
    proxies: () => [proxyOf(builder.material), proxyOf(fadeTwin(builder.material)), ...night.proxies()],
    lampsNear: (viewer, radius, out, count) => night.lampsNear(viewer, radius, out, count),
    night,
    landmarkNear(point, range = LANDMARK_RANGE) {
      let best: Placement | null = null;
      let bestDistance = range;
      for (const slot of slots) {
        const distance = slot.anchor.distanceTo(point);
        if (distance <= bestDistance) [best, bestDistance] = [slot.placement, distance];
      }
      return best;
    },
  };
}
