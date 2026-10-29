import * as THREE from 'three';
import type { ShopDoor } from './street-folk.ts';
import type { World } from '../../geo.ts';
import type { DrawnFootprint, LandProbe } from '../../land-probe.ts';
import type { Placed, RegionStyle } from '../../scenery/index.ts';
import type { OverheadHost } from '../../scenery/overhead.ts';
import type { Solid } from '../../scenery/solids.ts';
import type { DressFront } from '../../scenery/street-dressing.ts';
import type { TownGrid } from '../../scenery/grid.ts';
import type { Slope } from '../../terrain.ts';
import type { TownFrame } from '../frame.ts';
import type { GroundBuilder } from '../ground/build.ts';
import type { MapPlans } from '../map-plans.ts';
import type { Registry } from '../registry.ts';
import type { Bench } from '../../bench.ts';
import type { FolkAnchor } from '../../folk.ts';
import type { Bay, BikeSlot, FlatVariant, LitPlot, PropSink, Slot, SlotFloor } from '../types.ts';
import type { LeafCard } from '../meshes.ts';
import type { PropKind } from '../../breakables/kinds.ts';
import type { Surface } from '../../surfaces.ts';
import type { Variants } from '../variants.ts';

/** The state one town's raise shares between its phases, and what it is raised with. */

/**
 * Something in a standing item a vehicle may knock over (`breakables.ts`):
 * which run of the item's own vertices it is, its foot in the town's frame,
 * its size and its wall. A tree or a lamp is its whole item; the street
 * dressing is one item holding many.
 */
export interface StandingProp {
  kind: PropKind;
  first: number;
  count: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  solid: Solid | null;
  /** A near tree's leaf cards, whose run the leaves' merge records. */
  leaf?: LeafCard;
  /** A building's box, for what clings to its fronts (`clingsIn`). */
  box?: BuildingBox;
}

/** A building's own box: the town frame into its part's, and the part's bounds there. */
export interface BuildingBox {
  inverse: THREE.Matrix4;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

/** A `StandingProp` placed in the town's buffer: its run's first vertex there. */
export interface TownProp extends StandingProp {
  start: number;
}

/** One thing standing in a town, as it goes into the merged buffer. */
export interface Standing {
  flat: FlatVariant;
  matrix: THREE.Matrix4;
  /** A parked vehicle that can be taken, whose vertices the merge records. */
  bay?: Bay;
  /** What in it a vehicle may knock over; absent for a building. */
  props?: StandingProp[];
  /** How much of the variant's window pattern this copy shows, 0 to 1: two copies of a house are two households. */
  glow: number;
  /** An offset on the variant's window bedtimes, in encoded steps; only a building has one. */
  bed?: number;
  /** What a building's walls are made of (`surfaces.ts`); absent on anything else. */
  surface?: Surface;
  /** The street dressing's one item, whose run the merge records (`RaiseJob.dressRun`). */
  dressing?: boolean;
  /** The overhead's lines, eight numbers each (`Overhead.lines`), whose runs the merge records (`RaiseJob.lines`). */
  lines?: number[];
}

/**
 * The raise's state, filled phase by phase. What the town publishes (its
 * floor, people, bays, benches and racks) is held here until the last step,
 * so the town standing meanwhile keeps answering for itself.
 */
export interface RaiseJob {
  readonly slot: Slot;
  /** Whether it is built with people, parked vehicles and near assets: `slot.peopled` when it began. */
  readonly peopled: boolean;
  /** The floor being laid, in the town's frame; on the slot once the town stands. */
  floor: SlotFloor | null;
  /** Its people, bays, benches and rack slots, in the town's frame until the mesh is placed. */
  readonly folk: FolkAnchor[];
  readonly parked: Bay[];
  readonly benches: Bench[];
  readonly bikeSlots: BikeSlot[];
  /** The street dressing's shop doorsteps, where a keeper may stand (`street-folk.ts`). */
  readonly shopDoors: ShopDoor[];
  /** Its traffic lights' lamps, `SIGNAL_HEAD` numbers each (`furniture.ts`), in the town's frame until the mesh is placed. */
  readonly signalHeads: number[];
  readonly grid: TownGrid;
  readonly placed: Placed[];
  readonly standing: Standing[];
  /** Everything a vehicle may knock over, where the merge put it. */
  readonly props: TownProp[];
  /** The street dressing's run in the buffer, once merged: what clings to a building is looked for in it. */
  dressRun: { start: number; count: number } | null;
  /** The overhead's lines in the buffer: first vertex, count and two ends, eight numbers each. */
  lines: number[];
  /** Vertices of everything standing, which sizes the buffer. */
  vertices: number;
  drowned: number;
  buried: number;
  onRelief: boolean;
  /** The cells a building actually came up on: the plan is what was asked, this is what stands. */
  readonly built: Set<number>;
  /** The cells a block or a civic building covers, whose yard is paving whatever the region's yards are. */
  readonly pavedCells: Set<number>;
  /** The buildings whose windows came out lit, so the floor carries what falls out of them. */
  readonly litPlots: LitPlot[];
  /** The walls of what stands, for `collide`. */
  readonly solids: Solid[];
  /** For the map's plan: each wall's variant and kind, and the trees. */
  readonly solidFlats: FlatVariant[];
  readonly solidKinds: number[];
  readonly treesAt: number[];
  /** The square's buildings as triangles, for what hangs between them. */
  readonly overheadHosts: OverheadHost[];
  /** The square's buildings with their fronts, for what dresses them. */
  readonly dressFronts: DressFront[];
  /** The parts this town builds from the kit's baked models. */
  readonly bakedParts: Set<string>;
  /** Every car parked, taken or not, as its spot, its reach and its roof: what is laid out after keeps off them. */
  readonly parkedLayout: number[];
  /** The walls of the cars taken, which the dressing still keeps off. */
  readonly parkedGhosts: Solid[];
  /** And their vertices, which the dressing's budget still counts. */
  takenVertices: number;
  /** Where the overhead's poles and masts stand, for the dressing to keep off. */
  readonly overheadSpots: number[];
}

/** Transform scratch the raise reuses. */
export interface RaiseScratch {
  readonly direction: THREE.Vector3;
  readonly local: THREE.Vector3;
  readonly at: THREE.Vector3;
  readonly parkedAt: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
  readonly transform: THREE.Matrix4;
  /** `gradeAt`'s answer for the country round a town. */
  readonly slope: Slope;
  /** What `drawnFootprint` fills for the country round a town. */
  readonly drawnSeat: DrawnFootprint;
}

export const AXIS_Y = new THREE.Vector3(0, 1, 0);

export function createRaiseScratch(): RaiseScratch {
  return {
    direction: new THREE.Vector3(),
    local: new THREE.Vector3(),
    at: new THREE.Vector3(),
    parkedAt: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    transform: new THREE.Matrix4(),
    slope: { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 },
    drawnSeat: { centre: 0, lowest: 0, highest: 0 },
  };
}

/** What a town is raised with. */
export interface RaiseKit {
  readonly world: World;
  readonly frame: TownFrame;
  readonly variants: Variants;
  readonly styleFor: (slot: Slot) => RegionStyle;
  readonly registry: Registry;
  readonly landProbe: LandProbe | null;
  readonly continentOf: ReadonlyMap<string, string>;
  readonly material: THREE.Material;
  readonly leaves: THREE.Material;
  readonly inTheCountry: WeakSet<Placed>;
  readonly buildGroundSteps: GroundBuilder;
  readonly squareSteps: (slot: Slot) => Generator<void, TownGrid | null, void>;
  readonly planTownSteps: (slot: Slot, grid: TownGrid) => Generator<void, { placed: Placed[] }, void>;
  readonly plans: MapPlans;
  readonly scratch: RaiseScratch;
  /** Where a standing town registers what may be knocked over; null and nothing breaks. */
  readonly breakables: PropSink | null;
}

/** Composes a part's transform at `position` with a yaw and a uniform scale, into the scratch matrix. */
export function compose(scratch: RaiseScratch, position: THREE.Vector3, yaw: number, scale: number): THREE.Matrix4 {
  scratch.quaternion.setFromAxisAngle(AXIS_Y, yaw);
  scratch.scale.setScalar(scale);
  return scratch.transform.compose(position, scratch.quaternion, scratch.scale);
}
