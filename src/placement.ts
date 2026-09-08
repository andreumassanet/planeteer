import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, groundRadius } from './globe.ts';
import { createContext } from './monuments/contract.ts';
import type { MonumentContext } from './monuments/contract.ts';
import { createViewCone, detailPixels, detailReach, fogFar, horizonAt, slantRange } from './view.ts';

/**
 * Where a monument stands, as baked by `scripts/build-monuments.ts`.
 *
 * Separate from the model on purpose: the position is data — curated, snapped to
 * the coastline, and checked against the country outlines — while the model is
 * code. A landmark can exist in the dataset with nobody having built it yet, and
 * that is the normal state of this project for a while.
 */
export interface Placement {
  id: string;
  name: string;
  iso: string;
  lat: number;
  lon: number;
  /**
   * The model's own footprint radius, copied out of its file by the bake.
   *
   * It is here so that `main.ts` can hand this array straight to
   * `setFlattenSites` — the pad under a monument is the model's own width plus a
   * margin, and the only other way for `terrain.ts` to learn that number would be
   * to import the monument registry, which would put the top of the stack under
   * the bottom of it. Absent means "the widest the contract allows", which is
   * what a landmark with no model yet has to reserve.
   */
  footprint?: number;
  /**
   * Same-shelf ground the bake found around it, capped at `footprint`.
   *
   * Here for the same reason `footprint` is, and it goes to the same place: a
   * placement short of its own footprint is a model standing over water, and
   * `terrain.ts` holds its pad down to the shore lip rather than letting it
   * stand the coast back up under the model. Declared rather than left to ride
   * along untyped, because the row reaches `setFlattenSites` whole and a field
   * nobody names is a field the next edit drops.
   */
  clearance?: number;
  height?: number;
  year?: number;
  snappedKm?: number;
}

export async function loadPlacements(url = '/data/monuments.json'): Promise<Placement[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return ((await response.json()) as { monuments: Placement[] }).monuments;
}

const DEG = Math.PI / 180;

/**
 * How far along the ground a monument is built, in world units.
 *
 * Tied to the horizon rather than fixed: from the ground you can see about 930
 * units, and there is no sense building something you cannot see.
 *
 * **The ceiling went from 8,000 to 24,000 and the size test below is what pays
 * for it.** The old number was one constant standing in for every landmark, and
 * it had to be set by the smallest: Stonehenge is 4.8 units across and is a
 * speck at 800, so a range that suited it wasted the Pyramids, which are 55
 * across and still eleven pixels wide at eleven thousand. One constant for
 * sixty-five objects that differ by a factor of eleven in size is the thing the
 * contact sheet keeps teaching, and the fix is the same every time: ask each one
 * what it is worth.
 */
function reachFor(altitude: number): number {
  return Math.min(fogFar(altitude, PLANET_RADIUS) * 1.1, detailReach(Math.min(24000, Math.max(1500, horizonAt(altitude, PLANET_RADIUS) * 2))));
}

/**
 * And the slant, because a monument is on the ground and the viewer may not be.
 *
 * See `view.ts`: a radius around a player at 6,000 units reaches 6,000 less far
 * along the ground than it says it does, and every streamer in this project made
 * the same mistake in the same line.
 */
function rangeFor(altitude: number): number {
  return slantRange(altitude, reachFor(altitude));
}

/**
 * Pixels across a monument has to be worth before it is built.
 *
 * `settlements.ts`'s test with the same constants, on the model's own declared
 * footprint out of `monuments.json` rather than on a town's radius. Six rather
 * than that file's twelve, because a landmark is a *recognisable silhouette* and
 * a town is a texture: the Eiffel Tower at six pixels is still the Eiffel Tower
 * and a hamlet at six pixels is three brown dots.
 */
const MIN_APPARENT_PIXELS = 6;
const PIXELS_PER_RADIAN = 937;
const WIDEST_FOOTPRINT = 55;

/**
 * The disc dressed whatever the camera is pointed at.
 *
 * Wider than `VISIT_RANGE` by a good margin, so a monument cannot be missing
 * from the frame you turn to look at it in, and cheap: there are sixty-five of
 * these on the planet and never more than a handful inside this.
 */
const KEEP_ALL_WITHIN = 1200;
/** Fixed, not scaled: see the same constant in `settlements.ts` for why. */
const keepAllWithin = (): number => KEEP_ALL_WITHIN;

/**
 * How close you have to get for a monument to count as found.
 *
 * The largest footprint the contract allows is 55 and its pad is 20 wider, so
 * this is roughly "you are standing in it". Deliberately not "you can see it":
 * from the air you can see half a continent, and a counter that filled itself
 * on a single flight would be worth nothing.
 */
const VISIT_RANGE = 140;

const STORAGE_KEY = 'atlas.visited';

/**
 * The monument registry, handed in rather than imported.
 *
 * `src/monuments/index.ts` is an eager `import.meta.glob` over seventy-seven
 * model files — 82 KB gzipped, a fifth of what the first load used to be — and
 * **none of it is needed to draw the first frame**: `main.ts` reads the
 * outlines, fills the ocean and raises the land before it asks for a single
 * landmark. Importing the registry here would put all of it in the initial
 * module graph, where the browser has to fetch and parse every byte before
 * `start()` runs at all — see the trap in `CLAUDE.md`. So `main.ts` fires
 * `import('./monuments/index.ts')` once the data is in and hands the result down
 * — the same trade `createLife` already makes with `src/traffic/index.ts`, which
 * has the same shape and the same second reason: a module that never imports the
 * registry can be run in Node, where `import.meta.glob` does not exist.
 *
 * Structural rather than `typeof import(...)` so that this file names what it
 * actually uses. It reads the ids and it builds; it does not know what else a
 * monument has on it.
 */
export interface MonumentKit {
  /** `MONUMENTS`. Only the ids are read here — the models are the registry's. */
  readonly monuments: readonly { readonly id: string }[];
  /** `buildMonument`: builds one, or throws if it breaks the contract. */
  build(id: string, ctx: MonumentContext): THREE.Group;
}

export interface Monuments {
  group: THREE.Group;
  /** Placements with no model yet. The gap between the dataset and the world. */
  missing: Placement[];
  /** Anything that refused to build, with the contract's complaint. */
  broken: string[];
  /**
   * Call each frame. Builds what is close and drops what is not.
   *
   * The camera is optional; without one the range is a plain radius, which is
   * what this did before `view.ts` and what a headless caller needs.
   */
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
  /** The nearest built monument to a point, for the HUD. */
  nearest(point: THREE.Vector3): { placement: Placement; distance: number } | null;
  /** Ids the player has stood in, across sessions. */
  visited: ReadonlySet<string>;
  /** True while this id has been found. Shape the minimap asks for. */
  isVisited(id: string): boolean;
  /**
   * Records anything within range of a point. Returns what was found for the
   * first time this call, so the caller can make an event of it.
   */
  recordVisits(point: THREE.Vector3): Placement[];
}

/**
 * Puts the modelled monuments on the planet.
 *
 * Built lazily and dropped again when you leave: 77 landmarks at a couple of
 * thousand triangles each is not the problem, but the contract allows 3,600 per
 * monument and the list is curated by where the map is empty, so it grows. Streaming is far
 * easier to design in now than to retrofit once something depends on them all
 * being resident.
 */
export function createMonuments(
  world: World,
  placements: Placement[],
  // The registry, not imported: see `MonumentKit` for why the seventy-seven
  // model files are not in the initial bundle.
  kit: MonumentKit,
  // Optional so this module still works alone, and passed in by `main.ts` so
  // that `settlements.ts` inks a house with the same material cache, the same
  // ramp and the same pen as the monument it stands behind. One world.
  ctx: MonumentContext = createContext(),
  /**
   * How high the ground people made stands here, or 0 — `settlements.ts`'s
   * `madeHeightAt`, handed in the same way and for a sharper reason.
   *
   * **A town is a terraced platform now** (`GROUND_LIFT`, `TERRACE_STEP`), and
   * 28 of the world's landmark cities have their landmark *inside* them:
   * Beijing stands 4 units from the Forbidden City, Berlin 4 from the
   * Brandenburg Gate, Athens 4 from the Parthenon. A monument left standing on
   * the relief while the town around it rose three units is a monument in a
   * pit, with the town's own retaining wall facing inwards at it.
   *
   * So a monument stands on the floor when there is one under it, and on the
   * ground when there is not — which is every landmark in open country, where
   * `terrain.ts` has already levelled a pad and there is nothing to be level
   * with. Optional, because the streamer and the sheet build monuments with no
   * settlements at all.
   *
   * It is asked at `raise` rather than when the slot is made: the town under a
   * monument is streamed and may not have been standing when the planet loaded.
   */
  madeHeightAt?: (point: THREE.Vector3) => number,
): Monuments {
  const group = new THREE.Group();
  group.name = 'monuments';

  const known = new Set(kit.monuments.map((entry) => entry.id));
  const missing = placements.filter((p) => !known.has(p.id));
  const broken: string[] = [];

  interface Slot {
    placement: Placement;
    /** Unit vector at its position, so the distance test costs no trigonometry. */
    direction: THREE.Vector3;
    anchor: THREE.Vector3;
    object: THREE.Group | null;
    failed: boolean;
  }

  const slots: Slot[] = placements
    .filter((p) => known.has(p.id))
    .map((placement) => {
      const lat = placement.lat * DEG;
      const lon = placement.lon * DEG;
      const direction = new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        -Math.cos(lat) * Math.sin(lon),
      );
      // The ground is asked once, here: the relief does not move, and asking per
      // frame would put a point-in-polygon query behind every monument.
      const anchor = direction.clone().multiplyScalar(groundRadius(world, direction));
      return { placement, direction, anchor, object: null, failed: false };
    });

  /**
   * Reading a corrupt or absent store must not cost you the world, so every
   * failure here is the same as never having visited anything. Private windows,
   * cleared site data and browsers with storage disabled all land in the catch.
   */
  const visited = new Set<string>(
    (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed: unknown = raw === null ? null : JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
      } catch {
        return [];
      }
    })(),
  );

  const remember = (): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
    } catch {
      // Not being able to remember is a worse session, not a broken one.
    }
  };

  const cone = createViewCone(keepAllWithin);
  const north = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  function raise(slot: Slot): void {
    if (slot.object !== null || slot.failed) return;
    let model: THREE.Group;
    try {
      model = kit.build(slot.placement.id, ctx);
    } catch (error) {
      // A monument that breaks the contract is a bug in one file, not a reason
      // for the planet to be missing. Record it and carry on.
      slot.failed = true;
      broken.push(`${slot.placement.id}: ${String(error)}`);
      return;
    }

    // The contract says the group faces +Z with its base at y = 0, so placing it
    // is one basis: up is the surface normal, and +Z points at the north pole
    // along the ground. Every monument therefore faces the same way relative to
    // the world, which is what stops a street of them looking scattered.
    facing.copy(north).projectOnPlane(slot.direction);
    if (facing.lengthSq() < 1e-8) facing.set(1, 0, 0).projectOnPlane(slot.direction);
    facing.normalize();
    right.crossVectors(slot.direction, facing).normalize();
    basis.makeBasis(right, slot.direction, facing);

    // On the town's floor where there is one, and on the ground where there is
    // not; see `madeHeightAt` in the arguments. `slot.anchor` is the ground
    // point and the floor is a radius, so the lift is the difference of the two
    // along the same direction.
    model.position.copy(slot.anchor);
    const made = madeHeightAt?.(slot.direction) ?? 0;
    if (made > slot.anchor.length()) model.position.copy(slot.direction).multiplyScalar(made);
    model.quaternion.setFromRotationMatrix(basis);
    // Every mesh in it casts and receives; three reads the flags per mesh, not
    // per group.
    model.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    group.add(model);
    slot.object = model;
  }

  function drop(slot: Slot): void {
    if (slot.object === null) return;
    group.remove(slot.object);
    slot.object.traverse((object) => {
      const mesh = object as THREE.Mesh;
      // Geometry is this build's; materials come from the shared context and
      // are reused by every monument, so disposing them would blank the rest.
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    slot.object = null;
  }

  return {
    group,
    missing,
    broken,
    update(viewer, altitude, camera) {
      const range = rangeFor(altitude);
      // Hysteresis: without it a monument at exactly the edge rebuilds every
      // frame, which is the one thing streaming must never do.
      const keep = range * 1.25;
      const pixelFloor = detailPixels(MIN_APPARENT_PIXELS);
      cone.aim(camera);
      for (const slot of slots) {
        const distance = slot.anchor.distanceTo(viewer);
        const footprint = slot.placement.footprint ?? WIDEST_FOOTPRINT;
        // Big enough to read, and on the screen. Both are hysteretic in the same
        // way and for the same reason: the wide cone and the 1.25 range keep a
        // monument standing well past the point where it would not be started.
        const legible = PIXELS_PER_RADIAN * 2 * footprint >= pixelFloor * Math.max(1, distance);
        // The contract allows 140 units of height against 55 of footprint, so a
        // sphere at the footprint alone would cull the Eiffel Tower by its own
        // spire at the top of the frame.
        const bound = footprint + 150;
        if (distance < range && legible && cone.admits(slot.anchor, bound)) raise(slot);
        else if (distance > keep || !legible || !cone.keeps(slot.anchor, bound)) drop(slot);
      }
    },
    visited,
    isVisited: (id) => visited.has(id),
    recordVisits(point) {
      const found: Placement[] = [];
      for (const slot of slots) {
        if (visited.has(slot.placement.id)) continue;
        if (slot.anchor.distanceTo(point) > VISIT_RANGE) continue;
        visited.add(slot.placement.id);
        found.push(slot.placement);
      }
      if (found.length > 0) remember();
      return found;
    },
    nearest(point) {
      let best: { placement: Placement; distance: number } | null = null;
      for (const slot of slots) {
        const distance = slot.anchor.distanceTo(point);
        if (best === null || distance < best.distance) best = { placement: slot.placement, distance };
      }
      return best;
    },
  };
}
