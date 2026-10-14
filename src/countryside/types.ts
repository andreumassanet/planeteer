/** The countryside's public types: what a cell's plan holds, and the planner's interface. */
import type * as THREE from 'three';
import type { Place } from '../places.ts';
import type { Road } from '../roads.ts';
import type { FieldIndex } from '../fleet.ts';
import type { RegionStyle } from '../scenery/contract.ts';
import type { LandmarkSite } from '../landmark-ground.ts';
import type { Bench } from '../bench.ts';

/** The big thing a cell holds, if any: one a cell. */
export type FeatureKind =
  | 'farm'
  | 'windmill'
  | 'turbines'
  | 'lighthouse'
  | 'shrine'
  | 'stones'
  | 'ruin'
  | 'camp'
  | 'fishing'
  | 'oasis'
  | 'cairn';

export const FEATURE_KINDS: readonly FeatureKind[] = [
  'farm', 'windmill', 'turbines', 'lighthouse', 'shrine', 'stones', 'ruin', 'camp', 'fishing', 'oasis', 'cairn',
];

/** What a field grows, which is what it is drawn as. */
export type CropId =
  | 'wheat'
  | 'barley'
  | 'rapeseed'
  | 'greens'
  | 'ploughed'
  | 'maize'
  | 'vineyard'
  | 'olives'
  | 'paddy'
  | 'millet'
  | 'lavender'
  | 'pond';

/** One thing standing: a part, where, which way it faces, how big. */
export interface CountryPiece {
  /** A `COUNTRY_PARTS` id, or a scenic part's when `scenic`. */
  part: string;
  scenic: boolean;
  variant: number;
  /** Unit vector at its base. */
  at: THREE.Vector3;
  /** Radians about the local up, from north towards east: the way its +Z faces. */
  yaw: number;
  scale: number;
  /** Ground it takes, already scaled: what the wood and every other piece keep off. */
  footprint: number;
  /**
   * For a piece over water, its base over the sea's radius, fixed by the plan:
   * a jetty's deck at its land end's ground, a boat at the waterline. Absent,
   * the base is the ground's.
   */
  base?: number;
}

/** A field: a rectangle (or a round pond) of one crop, rows along its local Z. */
export interface CropField {
  crop: CropId;
  /** Unit vector at its centre. */
  at: THREE.Vector3;
  yaw: number;
  /** Half its extent across the rows (local X) and along them (local Z). */
  halfX: number;
  halfZ: number;
  round: boolean;
}

/** A fence or a dry-stone wall between two points. */
export interface CountryLine {
  kind: 'fence' | 'wall';
  from: THREE.Vector3;
  to: THREE.Vector3;
}

/** Ground where the grass is in flower; `ambient.ts`'s butterflies read it. */
export interface Meadow {
  at: THREE.Vector3;
  radius: number;
  /** Which of five flowers this meadow is, mostly. */
  petal: number;
}

export interface CountryPlan {
  key: string;
  kind: FeatureKind | null;
  style: RegionStyle;
  pieces: CountryPiece[];
  fields: CropField[];
  lines: CountryLine[];
  meadows: Meadow[];
}

export interface CountrysideStats {
  /** Plans worked out since the world loaded, and held now. */
  planned: number;
  cached: number;
  /** Milliseconds the slowest one took, and the mean. */
  slowestMs: number;
  meanMs: number;
  /** Features planned since load, by kind. */
  byKind: Record<string, number>;
  /**
   * Cells that drew nothing (`quiet`), that chose nothing, and that chose a
   * kind and found nowhere in the cell it could stand, by kind.
   */
  refused: Record<string, number>;
}

export interface CountrysideOptions {
  places?: readonly Place[];
  monuments?: readonly LandmarkSite[];
  roads?: readonly Road[];
  fields?: FieldIndex;
  /**
   * The dwellings a region builds, with their footprints: the farmhouse is one
   * of them. Without it a farm is the gabled house every region can build.
   */
  dwellings?: (style: RegionStyle) => readonly { item: string; weight: number; footprint: number }[];
}

export interface Countryside {
  stats: CountrysideStats;
  /** The plan of one finest cell of the tile grid. Cached. */
  plan(row: number, column: number): CountryPlan;
  /** Whether that plan is already worked out, so asking for it costs nothing. */
  has(row: number, column: number): boolean;
  /** The plan of the cell a point is in. */
  planAt(lat: number, lon: number): CountryPlan;
  /** The field over a point, if any (its crop and its own shape). */
  fieldAt(direction: THREE.Vector3): CropField | null;
  /** The meadow over a point, if any. */
  meadowAt(direction: THREE.Vector3): Meadow | null;
  /**
   * How much of the grass's height stands at a point for the pieces planned
   * round it: 0 on the bare ground a tent, a fire or a barn takes, 1 where
   * nothing has worn it, and between on the trodden ring round each. `spread`
   * (units) widens the bare ground as the grass's other keepouts are widened.
   */
  trodden(direction: THREE.Vector3, spread?: number): number;
  /**
   * Whether anything planned (a piece, a field, a fence) stands within
   * `radius` units of a point: what a herd keeps off, as it keeps off a road.
   */
  occupied(direction: THREE.Vector3, radius: number): boolean;
  /**
   * The benches planned within `radius` units of a point as somewhere to sit
   * (`bench.ts`), appended to `out`. The spot's radius is the sea's: whoever
   * sits there stands it on the ground.
   */
  benchesNear(direction: THREE.Vector3, radius: number, out: Bench[]): void;
  /** Forget every plan: the prominence knob moved, and which towns stand with it. */
  reset(): void;
  /**
   * The nearest feature of a kind to a point, searching outwards up to
   * `reach` degrees: where to go to see one. For the console and the checks.
   */
  find(kind: FeatureKind, lat: number, lon: number, reach?: number): { lat: number; lon: number; distance: number; region: string } | null;
}
