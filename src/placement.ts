import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, groundRadius } from './globe.ts';
import { createContext } from './monuments/contract.ts';
import { DATA_URL } from './pack.ts';
import { mergeMeshes } from './merge.ts';
import { proxyOf } from './warm.ts';
import { createFader, fadeTwin } from './fade.ts';
import type { MonumentContext } from './monuments/contract.ts';
import { NEAR_BUILD, createViewCone, detailPixels, detailReach, fogFar, frameOpenFor, horizonAt, slantRange } from './view.ts';
import { unitAt } from './sphere.ts';
import { enclosed, freeSpot, pushOut, solidField, yawed } from './scenery/solids.ts';
import type { SolidField } from './scenery/solids.ts';
import { floorAt, occupancyOf } from './scenery/occupancy.ts';
import type { Occupancy } from './scenery/occupancy.ts';
import { planShape } from './landmark-ground.ts';
import type { Plan } from './landmark-ground.ts';
import { drawnFootprint, landProbeOf } from './land-probe.ts';
import type { DrawnFootprint } from './land-probe.ts';
import { buildSetting } from './landmark-setting.ts';
import { regionFor } from './scenery/regions.ts';
import { groundStyleFor } from './scenery/ground.ts';

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
   * Same-shelf ground the bake found around it: past the plan's edge, capped
   * at the pad's margin, and negative where the plan itself reaches water.
   *
   * Here for the same reason `footprint` is, and it goes to the same place: a
   * placement short of its own plan is a model standing over water, and
   * `terrain.ts` holds its pad down to the shore lip rather than letting it
   * stand the coast back up under the model. Declared rather than left to ride
   * along untyped, because the row reaches `setFlattenSites` whole and a field
   * nobody names is a field the next edit drops.
   */
  clearance?: number;
  /**
   * The box the model stands in, in its own frame, measured by the bake:
   * the ground the pad is cut to, the towns leave unbuilt and the roads keep
   * off (`landmark-ground.ts`). Absent, the footprint's disc stands for it.
   */
  plan?: Plan;
  /** Stands in or at the water by what it is, and may overhang it. */
  shore?: true;
  /** Stands in a paved square of its own; see `landmark-setting.ts`. */
  setting?: 'plaza';
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
 * `start()` runs at all. So `main.ts` fires `import('./monuments/index.ts')`
 * once the data is in and hands the result down — the same trade `createLife`
 * already makes with `src/traffic/index.ts`, which has the same shape and the
 * same second reason: a module that never imports the registry can be run in
 * Node, where `import.meta.glob` does not exist.
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
  /**
   * The standing monuments near a point as walls: `settlements.collide`'s
   * contract, the displacement along the ground in `push`. See `SOLID_REACH`.
   */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** `settlements.freeSpotNear`'s contract, against the same walls. */
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /** Whether a point is inside a monument's walls and under its roof. For the camera. */
  blocksSight(point: THREE.Vector3): boolean;
  /**
   * How high a monument's own floor stands here — a plinth, a step, a
   * plaza — as a radius from the planet's centre, or 0. Only what is lower
   * than a person is a floor (`HEAD` in `scenery/occupancy.ts`).
   */
  madeHeightAt(point: THREE.Vector3): number;
  /** Monuments standing with walls, and the rectangles they hold: for the console. */
  solidStats(): { walled: number; rects: number };
}

/**
 * How near a standing monument has to be before its walls are measured.
 *
 * **A monument's walls are its own triangles** (`scenery/occupancy.ts`): what
 * occupies the band a body moves through, from the knee to the head, so the
 * passages under the Arc de Triomphe and the ground between the Eiffel
 * Tower's legs stay open. The measure is up to 11 ms on the dearest of the 85
 * (the Colosseum, measured headless on 2026-09-24), which is a build, not a query:
 * it is done once per landmark, only when one is this near past its own
 * footprint, one a frame and inside the frame's build allowance, and kept.
 * 300 units is fifteen seconds at a run and three at a car's top speed.
 */
const SOLID_REACH = 300;
/** Measured monuments kept after they drop; the oldest go first. */
const KEEP_MEASURED = 16;
/** Past a monument's widest rectangle, how far a query may still reach its walls. */
const SOLID_MARGIN = 10;

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
  /**
   * The drawn land (`buildLand`). A landmark stands on the lowest of it under
   * its plan where the land probe has it, and on the pad `terrain.ts` levels
   * in the relief where it does not yet: the mesh is laid between points of
   * the relief and is up to a few units off the pad, and a landmark on the
   * relief stood on a sliver of sky on one side of its plan (48 of 85 more
   * than 0.15 units over the lowest of it, 4 more than one, the worst 2.2 at
   * Abu Simbel; 2026-09-28, `pnpm seated`).
   */
  land?: THREE.Mesh,
): Monuments {
  const group = new THREE.Group();
  group.name = 'monuments';

  const known = new Set(kit.monuments.map((entry) => entry.id));
  /** Each country's continent, for the region a landmark's square is paved in. */
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const missing = placements.filter((p) => !known.has(p.id));
  const broken: string[] = [];

  interface Slot {
    placement: Placement;
    /** Unit vector at its position, so the distance test costs no trigonometry. */
    direction: THREE.Vector3;
    anchor: THREE.Vector3;
    /** Seated on the drawn land, rather than on the relief's pad while the probe had not gathered under it. */
    onDrawn: boolean;
    /** The monument, merged into one mesh, while it stands. */
    object: THREE.Mesh | null;
    failed: boolean;
    /** Its walls, while it stands and once it is near; see `SOLID_REACH`. */
    walls: Walls | null;
  }

  /** A standing monument's solids, in its own frame: `x` along `right`, `z` along `facing`. */
  interface Walls {
    field: SolidField;
    floor: Occupancy['floor'];
    right: THREE.Vector3;
    facing: THREE.Vector3;
    /** The model's base, as a radius: its `y = 0`. */
    base: number;
    cosBound: number;
  }

  const slots: Slot[] = placements
    .filter((p) => known.has(p.id))
    .map((placement) => {
      const direction = unitAt(placement.lat, placement.lon, new THREE.Vector3());
      // The ground is asked once, here: the relief does not move, and asking per
      // frame would put a point-in-polygon query behind every monument.
      const anchor = direction.clone().multiplyScalar(groundRadius(world, direction));
      return { placement, direction, anchor, onDrawn: false, object: null, failed: false, walls: null };
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
    const drawn = drawnUnder(slot);
    slot.onDrawn = drawn !== null;
    const ground = drawn === null ? slot.anchor.length() : drawn - LANDMARK_BURY;
    const made = madeHeightAt?.(slot.direction) ?? 0;
    model.position.copy(slot.direction).multiplyScalar(Math.max(ground, made));
    // The walls carry their roofs as radii, so a monument that moved is measured again.
    unwall(slot);
  }

  const landProbe = land === undefined ? null : landProbeOf(land);
  /**
   * How far a landmark on the drawn land is bedded under the lowest of its
   * plan's nine points: the land between two of them can dip lower still, by
   * a fifth of a unit under the Sagrada Familia's.
   */
  const LANDMARK_BURY = 0.25;
  const seatFacing = new THREE.Vector3();
  const seatRight = new THREE.Vector3();
  const seatPoint = new THREE.Vector3();
  /**
   * The lowest of the drawn land under a landmark's plan — its corners, the
   * middles of its sides and its middle, in the frame `raise` stands it in —
   * or null where the probe has not gathered all of it. A landmark with no
   * plan asks a ring at seven tenths of its footprint, as a tree does.
   */
  function drawnUnder(slot: Slot): number | null {
    if (landProbe === null) return null;
    const up = slot.direction;
    seatFacing.copy(north).projectOnPlane(up);
    if (seatFacing.lengthSq() < 1e-8) seatFacing.set(1, 0, 0).projectOnPlane(up);
    seatFacing.normalize();
    seatRight.crossVectors(up, seatFacing).normalize();
    const shape = planShape(slot.placement);
    if (!Number.isFinite(shape.hx)) {
      return drawnFootprint(landProbe, up, seatRight, seatFacing, shape.radius * 0.7, seatDrawn) === 'drawn' ? seatDrawn.lowest : null;
    }
    let lowest = Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        seatPoint
          .copy(up)
          .addScaledVector(seatRight, (shape.cx + i * shape.hx) / PLANET_RADIUS)
          .addScaledVector(seatFacing, (shape.cz + j * shape.hz) / PLANET_RADIUS)
          .normalize();
        if (!landProbe.covers(seatPoint)) return null;
        const radius = landProbe.radiusAt(seatPoint);
        // Over the water at a shore landmark's edge: the land there has gone under the shelf.
        if (radius !== null && radius < lowest) lowest = radius;
      }
    }
    return Number.isFinite(lowest) ? lowest : null;
  }
  const seatDrawn: DrawnFootprint = { centre: 0, lowest: 0, highest: 0 };

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
    // Its square, where the source gives it one (`landmark-setting.ts`): after
    // the contract has passed the model, because the square is the world's
    // and not the model's, and merged with it so it is no draw call of its own.
    if (slot.placement.setting === 'plaza') {
      const region = regionFor(slot.placement.iso, continentOf.get(slot.placement.iso) ?? '', slot.placement.lat).id;
      const square = buildSetting(ctx, slot.placement, groundStyleFor(region), region);
      if (square !== null) model.add(square);
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

  // ------------------------------------------------------------------
  // The walls
  // ------------------------------------------------------------------

  /** Each monument's measure, by id; see `SOLID_REACH`. Most recently used last. */
  const measured = new Map<string, Occupancy>();
  /** The slots with walls now: a handful at most. */
  const walled: Slot[] = [];

  function unwall(slot: Slot): void {
    if (slot.walls === null) return;
    slot.walls = null;
    walled.splice(walled.indexOf(slot), 1);
  }

  /** Measures a standing monument's walls, or takes them from `measured`. */
  function wall(slot: Slot): void {
    const model = slot.object;
    if (model === null || slot.walls !== null) return;
    const id = slot.placement.id;
    let occupancy = measured.get(id);
    if (occupancy === undefined) {
      const position = model.geometry.getAttribute('position').array as Float32Array;
      occupancy = occupancyOf(position, true);
    } else measured.delete(id);
    measured.set(id, occupancy);
    if (measured.size > KEEP_MEASURED) {
      for (const key of measured.keys()) {
        if (measured.size <= KEEP_MEASURED) break;
        if (walled.some((other) => other.placement.id === key)) continue;
        measured.delete(key);
      }
    }
    const base = model.position.length();
    const rects = occupancy.rects;
    const solids = [];
    let widest = 0;
    for (let i = 0; i < rects.length; i += 5) {
      const x = rects[i]!;
      const z = rects[i + 1]!;
      solids.push(yawed(x, z, 0, rects[i + 2]!, rects[i + 3]!, base + rects[i + 4]!));
      widest = Math.max(widest, Math.hypot(Math.abs(x) + rects[i + 2]!, Math.abs(z) + rects[i + 3]!));
    }
    const floor = occupancy.floor;
    if (floor !== null) {
      widest = Math.max(widest, Math.hypot(Math.abs(floor.minX), Math.abs(floor.minZ)));
      widest = Math.max(widest, Math.hypot(floor.minX + floor.cols * floor.cell, floor.minZ + floor.rows * floor.cell));
    }
    // The model's own axes, off the rotation `raise` gave it.
    slot.walls = {
      field: solidField(solids),
      floor,
      right: new THREE.Vector3(1, 0, 0).applyQuaternion(model.quaternion),
      facing: new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion),
      base,
      cosBound: Math.cos((widest + SOLID_MARGIN) / PLANET_RADIUS),
    };
    walled.push(slot);
  }

  const wallDir = new THREE.Vector3();
  const wallPush = { x: 0, z: 0 };

  /** The slot's walls if `point` may meet them, with `wallDir` its direction. */
  function near(slot: Slot, point: THREE.Vector3): Walls | null {
    const walls = slot.walls!;
    wallDir.copy(point).normalize();
    return wallDir.dot(slot.direction) < walls.cosBound ? null : walls;
  }

  function drop(slot: Slot): void {
    const model = slot.object;
    if (model === null) return;
    unwall(slot);
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
      // And once the land probe has the ground under one seated on the relief.
      if (landProbe !== null) {
        for (const slot of slots) {
          if (slot.object !== null && !slot.onDrawn && landProbe.covers(slot.direction) && drawnUnder(slot) !== null) seat(slot, slot.object);
        }
      }
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
          if (slot.object === null && !slot.failed && raised < RAISES_PER_FRAME && frameOpenFor(raised, distance - footprint < NEAR_BUILD)) {
            raise(slot);
            raised++;
          }
        } else if (distance > keep || !legible || !cone.keeps(slot.anchor, bound)) drop(slot);
        // Near enough to walk into: measured, one a frame, in the frame's allowance.
        if (slot.object !== null && slot.walls === null && distance < footprint + SOLID_REACH && raised < RAISES_PER_FRAME && frameOpenFor(raised, true)) {
          wall(slot);
          raised++;
        }
      }
    },
    collide(point, radius, push) {
      push.set(0, 0, 0);
      let hit = false;
      for (const slot of walled) {
        const walls = near(slot, point);
        if (walls === null) continue;
        if (!pushOut(walls.field, point.dot(walls.right), point.dot(walls.facing), radius, wallPush)) continue;
        push.addScaledVector(walls.right, wallPush.x).addScaledVector(walls.facing, wallPush.z);
        hit = true;
      }
      return hit;
    },
    freeSpotNear(point, radius, out) {
      for (const slot of walled) {
        const walls = near(slot, point);
        if (walls === null) continue;
        const x = point.dot(walls.right);
        const z = point.dot(walls.facing);
        if (!freeSpot(walls.field, x, z, radius, wallPush)) continue;
        out.copy(point).addScaledVector(walls.right, wallPush.x - x).addScaledVector(walls.facing, wallPush.z - z);
        out.setLength(point.length());
        return true;
      }
      return false;
    },
    blocksSight(point) {
      const height = point.length();
      for (const slot of walled) {
        const walls = near(slot, point);
        if (walls !== null && enclosed(walls.field, point.dot(walls.right), point.dot(walls.facing), height)) return true;
      }
      return false;
    },
    madeHeightAt(point) {
      let highest = 0;
      for (const slot of walled) {
        const walls = near(slot, point);
        if (walls === null || walls.floor === null) continue;
        const f = floorAt(walls.floor, point.dot(walls.right), point.dot(walls.facing));
        if (f === f) highest = Math.max(highest, walls.base + f);
      }
      return highest;
    },
    solidStats: () => ({ walled: walled.length, rects: walled.reduce((sum, slot) => sum + slot.walls!.field.solids.length, 0) }),
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
