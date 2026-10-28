import type * as THREE from 'three';
import type { Bench } from '../bench.ts';
import type { FolkAnchor } from '../folk.ts';
import type { Merged } from '../merge.ts';
import type { MonumentContext } from '../monuments/contract.ts';
import type { Placement } from '../placement.ts';
import type { Place } from '../places.ts';
import type { Road } from '../roads.ts';
import type { FloorField } from '../scenery/floor.ts';
import type { TownGrid } from '../scenery/grid.ts';
import type { GroundStyle } from '../scenery/ground.ts';
import type { RegionStyle } from '../scenery/index.ts';
import type { Solid, SolidField } from '../scenery/solids.ts';
import type { Breakables, PropHost } from '../breakables/types.ts';
import type { PlanShape } from '../landmark-ground.ts';

/** The public and internal records the settlement modules share. */

export interface SettlementStats {
  /** Settlements standing in the world right now. */
  resident: number;
  /** Wanted, and waiting for a frame with room to build them. */
  pending: number;
  /** Triangles of resident geometry. `OutlineEffect` draws them twice. */
  triangles: number;
  /** Buildings, trees and rocks standing. */
  parts: number;
  /** Megabytes of vertex buffers held by resident settlements. */
  megabytes: number;
  /** Settlements built since the world loaded. Rising while you stand still is a bug. */
  built: number;
  /** Milliseconds the last build took. */
  lastBuildMs: number;
  /** How far a settlement is currently built, in world units of slant distance. */
  range: number;
  /** And the same along the ground, which is the number with a meaning in the air. */
  reach: number;
}

export interface Settlements {
  group: THREE.Group;
  stats: SettlementStats;
  /**
   * Where every place stands, as `places.length * 3` floats on the ground.
   * Shared with `lights.ts` so a city's light hangs over the same point.
   */
  anchors: Float32Array;
  /** Parts a region table names that the registry has no file for. */
  missing: string[];
  /** Anything that refused to build, with the contract's complaint. */
  broken: string[];
  /**
   * Call each frame. Streams towns in and out and spends a few ms building.
   * Without a camera the streamer admits by radius alone, which is what a
   * headless check or a first frame needs.
   */
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
  /**
   * The people of every standing town inside `radius` of `viewer`, in world
   * space, for `folk.ts` to stand skinned characters on. Appends to `out`.
   */
  folkNear(viewer: THREE.Vector3, radius: number, out: FolkAnchor[]): void;
  /**
   * The street lamps of every standing town inside `radius` of `viewer`, the
   * nearest first, written into `out` as `x, y, z, distance` in world space;
   * returns how many were written, at most `out.length / 4`. See
   * `setNearLamps` in `lights.ts`.
   */
  lampsNear(viewer: THREE.Vector3, radius: number, out: Float32Array): number;
  /**
   * The cars parked in every standing town inside `radius` of `viewer` that
   * can be taken and have not been, in world space. Appends to `out`.
   */
  parkedNear(viewer: THREE.Vector3, radius: number, out: ParkedCar[]): void;
  /** The benches of every standing town whose sitter's spot is inside `radius` of `viewer`. Appends to `out`. */
  benchesNear(viewer: THREE.Vector3, radius: number, out: Bench[]): void;
  /** The bicycle-rack slots of every standing town inside `radius` of `viewer`. Appends to `out`. */
  bikeSlotsNear(viewer: THREE.Vector3, radius: number, out: BikeSlot[]): void;
  /**
   * Every standing town with traffic lights inside `radius` of `viewer`: its
   * place index and its lamps, `SIGNAL_HEAD` numbers a light, in world space.
   */
  signalsNear(viewer: THREE.Vector3, radius: number, visit: (town: number, heads: Float32Array) => void): void;
  /**
   * A parked car has been taken: its vertices in the town's buffer are folded
   * away and its wall comes down. Idempotent, and nothing when its town is not
   * standing.
   */
  hideParked(id: string): void;
  /** Puts a folded car back by building its town again, which leaves out whatever the fleet still has. */
  showParked(id: string): void;
  /** The body colour a parked vehicle is painted, by its id alone; null for the craft's own look. */
  parkedPaint(id: string): number | null;
  /** Whether a parked car has been taken, asked by every build of a town. Until set, nothing has been. */
  setParkedTaken(test: (id: string) => boolean): void;
  /**
   * How high the made ground stands here, as a radius from the planet's centre,
   * or 0 if this point is not on a standing town's floor. `player.ts` stands
   * on the higher of this, the road ribbon and the relief.
   */
  madeHeightAt(point: THREE.Vector3): number;
  /**
   * Where the grass may stand at `direction` (a unit vector), given the drawn
   * land's radius there: a standing town's lawn, the land wherever no standing
   * floor covers it, or null. A radius from the planet's centre.
   */
  swardAt(direction: THREE.Vector3, landRadius: number, margin: number): number | null;
  /** Collects where the trees and bushes round the edge of every town built from now go, into `into`; null stops. */
  recordSeats(into: TownSeat[] | null): void;
  /**
   * The floors raised or dropped since `since` (a version this returned
   * before), each as `[x, y, z, reach]` (the town's up and its floor's reach)
   * in `into`; returns the version now. A reader more than the ring behind
   * gets `-1` in `into[0]` and should treat everything as changed.
   */
  floorChanges(since: number, into: number[]): number;
  /**
   * Pushes a body of `radius` out of every building it overlaps at `point`:
   * writes the world-space displacement along the ground into `push` and
   * returns whether anything was hit.
   */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** `collide` for a body in the air: only buildings whose roofs are over `point`'s own height push it. */
  collideAloft(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** Whether a point is inside a building's walls and under its roof. For the camera. */
  blocksSight(point: THREE.Vector3): boolean;
  /**
   * The crowns of the near towns' trees within `range` units of `point`, as
   * `(list, offset)` into flat lists of `CROWN_STRIDE` floats (`placeCrown`):
   * `vegetation.crownsNear`'s contract, for `ambient.ts`.
   */
  crownsNear(point: THREE.Vector3, range: number, visit: (list: Float32Array, offset: number) => void): void;
  /** The nearest point to `point` where a body of `radius` stands clear of every building, into `out`; false if already clear. */
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /** Builds a named settlement and reports it, merged against instanced. */
  compare(name?: string): unknown;
  /**
   * Builds every `step`th settlement and reports the distribution: parts,
   * buildings, paving, terracing, and where a foot lands on what was built.
   * Every town it builds is dropped again unless it was already standing.
   */
  survey(step?: number, near?: boolean): unknown;
  /** One mesh per program this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Object3D[];
  /**
   * A town as the map draws it (`map-features.ts`), as it stands near.
   * `undefined` while it is being worked out (a far job of its own,
   * `'townplans'`); null where the place builds nothing or is not one.
   */
  townPlan(index: number): TownPlan | null | undefined;
  /** The same, worked out now in one go: for the checks and the console. */
  townPlanNow(index: number): TownPlan | null;
}

/**
 * A town's plan for the map: what `raiseSteps` stands, without a mesh.
 *
 * Lengths are in the town's frame (`townFrame`: `+z` north, `+x` `across`,
 * which is west), world units about its centre. The map projects it through
 * the frame's own three vectors.
 */
export interface TownPlan {
  index: number;
  up: THREE.Vector3;
  across: THREE.Vector3;
  north: THREE.Vector3;
  /** `townGrid(radiusOf(place))`, the square the cells are of. */
  grid: TownGrid;
  /**
   * Each cell, `row * cells + col`: 0 not paved, 1 a yard, 2 paving under a
   * block, 3 a yard of the land's own ground at the edge, 4 a landmark's plaza.
   */
  cells: Uint8Array;
  /** The street's half-width on a band between two cells (`streetBand`), and a pavement's (`pavementOf`). */
  band: number;
  walk: number;
  /** sRGB: the carriageway, the pavement, a yard, the land, a plaza. */
  colours: { road: number; walk: number; yard: number; land: number; plaza: number };
  /** Each building's footprint as `solids.ts` holds it: x, z, cos, sin, hx, hz. */
  buildings: Float32Array;
  /** Its kind: 0 a dwelling, 1 a block, 2 a civic building. */
  kinds: Uint8Array;
  /** And its roof, sRGB: the up-facing triangles of its own variant, by area. */
  roofs: Uint32Array;
  /** The trees in the yards and round the edge: x, z, radius. */
  trees: Float32Array;
}

/**
 * A vehicle standing still that somebody can take: a car at a town's kerb, a
 * bicycle in a rack, a farm's tractor (`vegetation.ts`).
 *
 * It is merged into the buffer it stands in; when taken, the town folds its
 * vertices away (`hideParked`) and leaves it out of later builds. What stands
 * is the craft that takes its place, in the look and paint its id decides
 * (`craft/parked.ts`). `id` is `<model>:<placeIndex>:<n>`, `n` counting from
 * `PARKED_SLOT` along the town's bays and then its racks.
 */
export interface ParkedCar {
  id: string;
  /** The craft that takes its place: `PARKED_CRAFT` of the traffic kit's vehicle, or `bicycle` in a rack. */
  model: string;
  /** On the floor it stands on, in the world. */
  position: THREE.Vector3;
  /** The way it faces: a unit tangent. */
  forward: THREE.Vector3;
  /** Its body colour, a function of its id (`Settlements.parkedPaint`); null for the craft's own look. */
  paint: number | null;
}

/**
 * A slot in a near town's bicycle racks (`scenery/street-dressing.ts`) where
 * a bicycle that can be taken may stand; a share of them (`RACK_FILL`) hold
 * one. They exist while the town stands peopled.
 */
export interface BikeSlot {
  /** `rack:<place>:<n>`, `n` counting the town's slots in the order they were placed. */
  id: string;
  /** The town: its index in `places`, as a fleet id's `<place>` is. */
  place: number;
  /** The middle of where the bicycle stands, between its wheels, on the paving, in the world. */
  position: THREE.Vector3;
  /** The way its front points: a unit tangent, into the rack, away from the street it faces. */
  forward: THREE.Vector3;
}

/** Where a tree or a bush round a town's edge was seated, for `pnpm seated`: its base, the reach it was bedded over, and whether on the drawn land. */
export interface TownSeat {
  id: string;
  /** Its direction from the planet's centre, and its base's distance from it. */
  x: number;
  y: number;
  z: number;
  radius: number;
  reach: number;
  drawn: boolean;
}

export interface SettlementOptions {
  /** Share the monument context, so one material cache serves the whole world. */
  context?: MonumentContext;
  /** Monuments, so nothing is built inside one. */
  monuments?: readonly Placement[];
  /**
   * The network, for which gates of each town a road comes in by: each carries
   * a light (`gateGlow`) that the floor and the road's ribbon share.
   */
  roads?: readonly Road[];
  /**
   * The drawn land (`buildLand`), which the trees round a town's edge stand on
   * where the land probe has it. Without it, or before the probe arrives, they
   * stand on the relief, and the town is built again once it does.
   */
  land?: THREE.Mesh;
  /** Where a standing town registers what a vehicle may knock over (`breakables.ts`). Without it nothing in a town breaks. */
  breakables?: PropSink;
}

/** The part of `Breakables` a streamer talks to. */
export type PropSink = Pick<Breakables, 'register' | 'forget'>;

// ---------------------------------------------------------------------------
// Internal records
// ---------------------------------------------------------------------------

/**
 * One built variant, reduced to the arrays a town is assembled from: the
 * material colour moved into the vertices, which is what makes a town one mesh.
 */
export interface FlatVariant {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  /** The ink's normals: a painted part's welded `outlineNormal`, a code-built part's own normal. */
  outline: Float32Array;
  /** Two bytes a vertex: how lit it is after dark, and the hour it goes out (`lightWindows`, `bedtimeByte`). */
  glow: Uint8Array;
  /** True if any vertex of this variant emits. */
  emits: boolean;
  /** The bedtime byte of the variant's brightest window: when the light it spills on the ground goes out. */
  litBed: number;
  triangles: number;
  height: number;
  /** A parked vehicle's body colour, as its id decides it; null for the craft's own look, absent otherwise. */
  paint?: number | null;
  /**
   * The variant's plan box in its own frame before any yaw: what `fitIn` fits
   * it to a cell with, and its wall for `solids.ts`.
   */
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Vertices of each source mesh, for `compare()` to price the instanced version. */
  pieceVertices: number[];
  /** A parked vehicle's see-through glass, drawn apart in the glass material; absent without glass. */
  glass?: Merged;
}

/** A building lighting the ground round it: where, how wide, how bright and when it goes out. */
export interface LitPlot {
  x: number;
  z: number;
  radius: number;
  strength: number;
  bed: number;
}

/** A landmark's ground in a town's frame: its point, its plan about that point, and `radius` kept clear past the plan. */
export interface Keepout {
  x: number;
  z: number;
  shape: PlanShape;
  radius: number;
}

/** A rectangle in the town's plane, in world units. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A `ParkedCar` and where it is in its town's buffer, its glass's, and its wall. */
export interface Bay extends ParkedCar {
  start: number;
  count: number;
  glassStart: number;
  glassCount: number;
  solid: Solid;
  hidden: boolean;
}

/** What a standing town's floor is to a point query, in the frame it was laid in. */
export interface SlotFloor {
  up: THREE.Vector3;
  across: THREE.Vector3;
  north: THREE.Vector3;
  field: FloorField;
  /** Angular bound of the paved set plus its one course of edge slope, for the cheap gate. */
  cosBound: number;
  /** One box per standing wall (buildings, benches, parked vehicles), or null when nothing has a wall. */
  solids: SolidField | null;
  /** The square and its street band, for `swardAt`. */
  grid: TownGrid;
  band: number;
  /** `Ground.lawn`, kept with the floor it was cut from. */
  lawn: Uint8Array | null;
  /** `Ground.mouths`, likewise. */
  mouths: readonly (readonly [number, number, number, number])[];
}

/** One place the streamer may build, and what of it stands. */
export interface Slot {
  place: Place;
  /** Index into the places this streamer was given, which is what a vehicle id names. */
  index: number;
  style: RegionStyle;
  /** What the ground here is made of. Keyed on `style.id`. */
  ground: GroundStyle;
  /** `radiusOf(place)`, asked once. */
  radius: number;
  seed: string;
  /** Unit vector at the settlement, so the distance test costs no trigonometry. */
  direction: THREE.Vector3;
  anchor: THREE.Vector3;
  mesh: THREE.Mesh | null;
  triangles: number;
  parts: number;
  bytes: number;
  /** What the plan asked for, and where the plots that did not make it went. */
  planned: number;
  drowned: number;
  buried: number;
  /** Buildings standing, as opposed to `parts`, which counts trees, lamps and vehicles too. */
  buildings: number;
  /** Cells of floor under it. */
  paved: number;
  /** The floor this town stands on, for `madeHeightAt`, or null while it is not standing. */
  floor: SlotFloor | null;
  failed: boolean;
  /** Whether this town should be built with people, parked vehicles and the kit's near assets. */
  peopled: boolean;
  /** What the standing mesh was built with, which `peopled` may have left behind. */
  builtPeopled: boolean;
  /** What hangs over its streets, as last built (`scenery/overhead.ts`). Null for none. */
  overhead: { triangles: number; spans: number; poles: number; masts: number; wires: number; cells: { main: number; mainHung: number; side: number; sideHung: number }; ms: number } | null;
  /** What dresses its street level, as last built (`scenery/street-dressing.ts`). Null for none. */
  dressing: { triangles: number; solids: number; counts: Record<string, number>; ms: number } | null;
  /** Standing, but worth building again; it stays drawn until its replacement stands. */
  stale: boolean;
  /** Built with trees round its edge on the relief because the land probe had not gathered there yet. */
  onRelief: boolean;
  /** Where this town's people stand, in world space, while it stands; `folk.ts` dresses the nearest. */
  folk: FolkAnchor[];
  /** The heads of its street lamps, in world space, three floats each, for `lampsNear`. */
  lampHeads: Float32Array | null;
  /** The parked vehicles in the standing mesh that can be taken. */
  parked: Bay[];
  /** Its benches, in world space. */
  benches: Bench[];
  /** Its bicycle racks' slots, in world space. */
  bikeSlots: BikeSlot[];
  /** Its traffic lights' lamps, in world space, `SIGNAL_HEAD` numbers each; null where it has none. */
  signalHeads: Float32Array | null;
  /** What in the standing mesh may be knocked over, as registered; null while nothing is. */
  host: PropHost | null;
}
