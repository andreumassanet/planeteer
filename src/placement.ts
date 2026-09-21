import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, groundRadius } from './globe.ts';
import { createContext } from './monuments/contract.ts';
import { DATA_URL } from './pack.ts';
import { mergeMeshes } from './merge.ts';
import { proxyOf } from './warm.ts';
import { createFader, fadeTwin } from './fade.ts';
import type { MonumentContext } from './monuments/contract.ts';
import { NEAR_BUILD, createViewCone, detailPixels, detailReach, fogFar, frameOpen, horizonAt, slantRange } from './view.ts';

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

/**
 * Monuments raised in one frame. A landmark is the largest single build in the
 * world, and a climb or a jump brings several into range at once: they arrive
 * one a frame, in the list's order, and only while the frame has room for
 * them (`frameOpen` in `view.ts`).
 */
const RAISES_PER_FRAME = 1;

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
  /** Ids the player has stood in, across sessions. */
  visited: ReadonlySet<string>;
  /** True while this id has been found. Shape the minimap asks for. */
  isVisited(id: string): boolean;
  /**
   * Records anything within range of a point. Returns what was found for the
   * first time this call, so the caller can make an event of it.
   */
  recordVisits(point: THREE.Vector3): Placement[];
  /** One mesh per program this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Object3D[];
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
  /**
   * `settlements.ts`'s `floorChanges`, for the half of that sentence `raise`
   * cannot see: **the town can arrive after the monument does.** The monument's
   * reach is wider than the town's at every detail, so walking towards Beijing
   * raised the Forbidden City on the relief first and the paving came up round
   * it a few hundred units later, `GROUND_LIFT` over its feet — a landmark
   * sunk into its own square until something dropped and raised it again. So
   * every floor that is raised or dropped re-seats the standing monuments it
   * reaches, which is a handful of dot products on the frame a town arrives
   * and nothing on any other.
   */
  floorChanges?: (since: number, into: number[]) => number,
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
    /** The monument, merged into one mesh, while it stands. */
    object: THREE.Mesh | null;
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

  /**
   * On the town's floor where there is one, and on the ground where there is
   * not; see `madeHeightAt` in the arguments. `slot.anchor` is the ground point
   * and the floor is a radius, so the lift is the difference of the two along
   * the same direction. Asked at `raise` and again whenever a floor near it
   * changes (`floorChanges`), never per frame.
   */
  function seat(slot: Slot, model: THREE.Object3D): void {
    model.position.copy(slot.anchor);
    const made = madeHeightAt?.(slot.direction) ?? 0;
    if (made > slot.anchor.length()) model.position.copy(slot.direction).multiplyScalar(made);
  }

  /** What `floorChanges` last answered, and where it writes. */
  let floorsSeen = 0;
  const changed: number[] = [];

  /**
   * Re-seats every standing monument a changed floor reaches. A reader that
   * fell behind the ring (`-1`) re-seats them all, which is what "everything
   * changed" costs: one `madeHeightAt` per standing landmark.
   */
  function reseat(): void {
    if (floorChanges === undefined) return;
    const version = floorChanges(floorsSeen, changed);
    if (version === floorsSeen) return;
    floorsSeen = version;
    const all = changed[0] === -1;
    for (const slot of slots) {
      if (slot.object === null) continue;
      let touched = all;
      for (let c = 0; !touched && c + 3 < changed.length; c += 4) {
        const dot = slot.direction.x * changed[c]! + slot.direction.y * changed[c + 1]! + slot.direction.z * changed[c + 2]!;
        touched = dot >= Math.cos(changed[c + 3]! / PLANET_RADIUS);
      }
      if (touched) seat(slot, slot.object);
    }
  }

  /**
   * **A monument is one mesh in the world, and it was a median of 89.** The
   * contract builds it of `ctx` helpers, a mesh each — 29 to 124 over the 85
   * models, counted headless on 2026-09-21 — and each was a draw call, twice
   * with the ink and again in the shadow pass, so a dozen landmarks standing
   * from the air were thousands of draws. Every material in one came from
   * `ctx.toon` (`validate` refuses anything else), so its colour is a stamp on
   * the material and the whole model merges the way a town does
   * (`merge.ts`): one buffer, one material, one draw. None of the 85 has a
   * mirrored piece, which the merge would rewind if one did.
   *
   * The merged geometry is kept per monument, because the model is
   * deterministic by contract and building it is the expensive half of a
   * raise — 2.3 ms at the median and 13 at the worst in the same count: a
   * landmark dropped and raised again, on a turn of the camera or a climb,
   * costs a buffer upload and nothing else. `drop` frees the GPU's copy and
   * keeps the arrays; the oldest of those not standing go past `KEEP_BUILT`.
   */
  const built = new Map<string, THREE.BufferGeometry>();
  const KEEP_BUILT = 24;
  /** Landmarks arriving and leaving by dissolving; see `fade.ts`. */
  const fader = createFader();
  // One material for every monument, drawn on the context's own ramp so a
  // landmark steps through the same four bands it always did.
  const inked = ctx.toon(ctx.palette.ink);
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: inked.gradientMap });
  material.userData.outlineParameters = {
    ...(inked.userData.outlineParameters as object),
    // Every merged buffer carries the ink's normals, as every town does.
    outlineNormal: true,
  };

  function geometryOf(slot: Slot): THREE.BufferGeometry | null {
    const id = slot.placement.id;
    const known = built.get(id);
    if (known !== undefined) {
      // Most recently used last, which is the order `KEEP_BUILT` evicts in.
      built.delete(id);
      built.set(id, known);
      return known;
    }
    let model: THREE.Group;
    try {
      model = kit.build(id, ctx);
    } catch (error) {
      // A monument that breaks the contract is a bug in one file, not a reason
      // for the planet to be missing. Record it and carry on.
      slot.failed = true;
      broken.push(`${id}: ${String(error)}`);
      return null;
    }
    const merged = mergeMeshes(model);
    // The vertices are copied out; the helpers' geometries are this build's.
    // Materials are the shared cache's and must not be touched.
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    const outline = new Int8Array(merged.outline.length);
    for (let i = 0; i < outline.length; i++) outline[i] = Math.round(merged.outline[i]! * 127);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
    geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline, 3, true));
    geometry.computeBoundingSphere();
    built.set(id, geometry);
    if (built.size > KEEP_BUILT) {
      for (const [key, cached] of built) {
        if (built.size <= KEEP_BUILT) break;
        if (slots.some((other) => other.object?.geometry === cached)) continue;
        built.delete(key);
      }
    }
    return geometry;
  }

  function raise(slot: Slot): void {
    if (slot.object !== null || slot.failed) return;
    const geometry = geometryOf(slot);
    if (geometry === null) return;
    const model = new THREE.Mesh(geometry, material);
    model.name = `monument:${slot.placement.id}`;

    // The contract says the group faces +Z with its base at y = 0, so placing it
    // is one basis: up is the surface normal, and +Z points at the north pole
    // along the ground. Every monument therefore faces the same way relative to
    // the world, which is what stops a street of them looking scattered.
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

    seat(slot, model);
    model.quaternion.setFromRotationMatrix(basis);
    model.castShadow = true;
    model.receiveShadow = true;
    group.add(model);
    fader.in(model);
    slot.object = model;
  }

  function drop(slot: Slot): void {
    const model = slot.object;
    if (model === null) return;
    slot.object = null;
    // Dissolved away (`fade.ts`). The GPU's copy goes after; the arrays stay in
    // `built` for the next raise — and a raise during the fade shares them, so
    // the copy stays too.
    fader.out(model, () => {
      group.remove(model);
      if (slot.object?.geometry !== model.geometry) model.geometry.dispose();
    });
  }

  return {
    group,
    missing,
    broken,
    update(viewer, altitude, camera) {
      fader.update();
      // First, so a monument raised below stands on whatever the floors are
      // now, and one already standing follows a floor that moved this frame.
      reseat();
      const range = rangeFor(altitude);
      // Hysteresis: without it a monument at exactly the edge rebuilds every
      // frame, which is the one thing streaming must never do.
      const keep = range * 1.25;
      const pixelFloor = detailPixels(MIN_APPARENT_PIXELS);
      cone.aim(camera);
      let raised = 0;
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
        if (distance < range && legible && cone.admits(slot.anchor, bound)) {
          if (slot.object === null && !slot.failed && raised < RAISES_PER_FRAME && frameOpen(distance - footprint < NEAR_BUILD)) {
            raise(slot);
            raised++;
          }
        } else if (distance > keep || !legible || !cone.keeps(slot.anchor, bound)) drop(slot);
      }
    },
    visited,
    isVisited: (id) => visited.has(id),
    proxies: () => [proxyOf(material), proxyOf(fadeTwin(material))],
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
  };
}
