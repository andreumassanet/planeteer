import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from './globe.ts';
import { MAX_RELIEF, MAX_SLOPE, gradeAt, reliefAt, shoreDistance } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { biomeAt, biomeSample } from './biome.ts';
import type { BiomeId } from './biome.ts';
import { isShown, radiusOf } from './places.ts';
import type { Place } from './places.ts';
import { countryReach } from './scenery/grid.ts';
import { roadClearance, roadGeometryFor, roadIndexFor } from './roads.ts';
import type { Road } from './roads.ts';
import type { FieldIndex, FieldKeepout } from './fleet.ts';
import { regionFor } from './scenery/regions.ts';
import type { RegionId } from './scenery/regions.ts';
import type { RegionStyle } from './scenery/contract.ts';
import { rngFrom } from './scenery/random.ts';
import type { Rng, Weighted } from './scenery/random.ts';
import { latOf, lonOf, unitAt } from './sphere.ts';
import { planGap, planGapToBox, planReach, planShape } from './landmark-ground.ts';
import type { LandmarkSite, PlanShape } from './landmark-ground.ts';
import { FIELD_CLEARANCE, MONUMENT_CLEARANCE, cellAt, cellBounds, rowsOf, stepOf } from './tile-grid.ts';
import type { CellBounds } from './tile-grid.ts';
import { COUNTRY_PARTS, COUNTRY_VARIANTS, ROTOR_RADIUS } from './countryside-kit.ts';
import { WATERLINE } from './vehicles.ts';
import { BENCH_SIT_AHEAD } from './bench.ts';
import { PIECE_BURY } from './countryside-tile.ts';
import type { Bench } from './bench.ts';

/**
 * What the country between the towns holds besides trees: farmsteads with
 * their fields, mills and turbines, a lighthouse on a headland, the wayside
 * shrine of whichever faith the region keeps, a camp, a jetty, a cairn — and,
 * smaller, rocks, a meadow in flower, a bench, a fingerpost by the road.
 *
 * **A plan is a pure function of the world and one cell of the tile grid**
 * (`tile-grid.ts`, the vegetation's finest tiles), so every client, every
 * level of the quadtree and every headless check builds the same farm in the
 * same place: `rngFrom('country', row, column)` draws everything, in an order
 * fixed before the world is asked anything, and what refuses a draw — water,
 * a town, a road, a landmark, a plane's field, a slope — refuses it the same
 * way every time. Nothing in a plan crosses its own cell, so no two plans can
 * put two things in one place and a tile of any level holds exactly the plans
 * of the finest cells under it.
 *
 * **It yields to everything built and the wood yields to it.** Towns keep
 * their whole country (`countryReach`, the ring of orchards a town grows past
 * its square), a landmark its plan (`landmark-ground.ts`), a road its drawn width, a plane or a
 * balloon its field; and `vegetation.ts` keeps its plants off every piece and
 * every field a plan holds, whatever level it is drawing.
 *
 * What a plan is *not* is geometry: pieces are a part, a place, a turn and a
 * size; fields are rectangles with a crop. `vegetation.ts` merges them into
 * its tiles, which is how they share the tiles' budgets, their levels of
 * detail and their dissolve.
 */

const DEG = Math.PI / 180;

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

/**
 * Ground where the grass is in flower: `ambient.ts`'s butterflies read it. The
 * sward drew its flowers from it until 2026-09-28; the grass draws none yet.
 */
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
   * of them. `vegetation.ts` answers it from the scenic kit; without it a farm
   * is the gabled house every region can build.
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
   * round it (`WORN`): 0 on the bare ground a tent, a fire or a barn takes, 1
   * where nothing has worn it, and between on the trodden ring round each.
   * `spread` (units) widens the bare ground, as the grass's other keepouts
   * are widened (`vegetation.ts`).
   */
  trodden(direction: THREE.Vector3, spread?: number): number;
  /**
   * Whether anything planned — a piece, a field, a fence — stands within
   * `radius` units of a point: what a herd (`life.ts`) keeps off, as it keeps
   * off a road.
   */
  occupied(direction: THREE.Vector3, radius: number): boolean;
  /**
   * The benches planned within `radius` units of a point — by a road, by a
   * lighthouse — as somewhere to sit (`bench.ts`), appended to `out`. The
   * spot's radius is the sea's: whoever sits there stands it on the ground.
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

// ---------------------------------------------------------------------------
// Where each thing belongs
// ---------------------------------------------------------------------------

/** How much a biome farms, 0 to 1. The desert has oases instead, the ice nothing. */
const FARMING: Record<BiomeId, number> = {
  ice: 0,
  tundra: 0,
  rock: 0,
  boreal: 0.35,
  temperate: 1,
  grassland: 1,
  steppe: 0.55,
  savanna: 0.7,
  tropical: 0.75,
  desert: 0,
};

/** What a region's fields grow, by weight. Paddies only where it is wet enough; see `cropsFor`. */
const CROPS: Record<RegionId, readonly Weighted<CropId>[]> = {
  nordic: [{ item: 'barley', weight: 3 }, { item: 'ploughed', weight: 2 }, { item: 'rapeseed', weight: 1 }, { item: 'greens', weight: 1 }],
  'atlantic-europe': [
    { item: 'wheat', weight: 3 }, { item: 'barley', weight: 2 }, { item: 'rapeseed', weight: 2 },
    { item: 'ploughed', weight: 1.5 }, { item: 'greens', weight: 1 }, { item: 'maize', weight: 1 },
  ],
  'east-europe': [
    { item: 'wheat', weight: 4 }, { item: 'ploughed', weight: 2 }, { item: 'maize', weight: 1.5 },
    { item: 'rapeseed', weight: 1 }, { item: 'greens', weight: 1 },
  ],
  mediterranean: [
    { item: 'wheat', weight: 3 }, { item: 'vineyard', weight: 2.5 }, { item: 'olives', weight: 2.5 },
    { item: 'ploughed', weight: 1.5 }, { item: 'greens', weight: 1 },
  ],
  maghreb: [{ item: 'olives', weight: 3 }, { item: 'wheat', weight: 2 }, { item: 'ploughed', weight: 1.5 }, { item: 'greens', weight: 1 }],
  'sub-saharan': [{ item: 'millet', weight: 3 }, { item: 'maize', weight: 2 }, { item: 'greens', weight: 1.5 }, { item: 'ploughed', weight: 1 }],
  'middle-east': [{ item: 'wheat', weight: 3 }, { item: 'ploughed', weight: 2 }, { item: 'olives', weight: 1 }, { item: 'greens', weight: 1 }],
  'south-asia': [{ item: 'paddy', weight: 3 }, { item: 'wheat', weight: 2 }, { item: 'greens', weight: 2 }, { item: 'millet', weight: 1 }],
  'east-asia': [{ item: 'paddy', weight: 4 }, { item: 'greens', weight: 2 }, { item: 'wheat', weight: 1.5 }, { item: 'maize', weight: 1 }],
  'southeast-asia': [{ item: 'paddy', weight: 5 }, { item: 'greens', weight: 1 }, { item: 'maize', weight: 1 }],
  'north-america': [{ item: 'maize', weight: 4 }, { item: 'wheat', weight: 3 }, { item: 'ploughed', weight: 1.5 }, { item: 'greens', weight: 1 }],
  'latin-america': [{ item: 'maize', weight: 3 }, { item: 'greens', weight: 2 }, { item: 'wheat', weight: 1 }, { item: 'vineyard', weight: 0.6 }],
  oceania: [{ item: 'wheat', weight: 3 }, { item: 'ploughed', weight: 2 }, { item: 'vineyard', weight: 1 }, { item: 'greens', weight: 1 }],
  polar: [{ item: 'ploughed', weight: 1 }],
};

/** Paddies want water: not in the dry north of China or on the Deccan's driest. */
function cropsFor(region: RegionId, biome: BiomeId, lat: number, iso: string): readonly Weighted<CropId>[] {
  const table = CROPS[region];
  const wet = (biome === 'tropical' || biome === 'temperate') && Math.abs(lat) < 38;
  const lavender = iso === 'FRA' && lat < 46;
  if (wet && !lavender) return table;
  const out = table.filter((entry) => wet || entry.item !== 'paddy');
  if (lavender) out.push({ item: 'lavender', weight: 1.5 });
  return out.length > 0 ? out : [{ item: 'greens', weight: 1 }];
}

/** Which regions keep a silo by the barn, and which a windpump on the range. */
const SILOS = new Set<RegionId>(['north-america', 'atlantic-europe', 'east-europe', 'oceania', 'latin-america', 'nordic']);
const BARNLESS = new Set<RegionId>(['sub-saharan', 'south-asia', 'southeast-asia']);
const WINDPUMPS = new Set<RegionId>(['oceania', 'north-america', 'latin-america']);
const WINDPUMP_ISO = new Set(['ZAF', 'NAM', 'BWA']);
/** Dry-stone walls round the fields rather than fences: the British Isles and the Mediterranean. */
const WALLED_ISO = new Set(['GBR', 'IRL', 'IMN']);

/** Mills, where mills still stand. The Low Countries have rows of them. */
function windmillWeight(iso: string, region: RegionId): number {
  if (STEPPE_NOMADS.has(iso)) return 0;
  if (iso === 'NLD') return 6;
  if (iso === 'BEL' || iso === 'DNK') return 1.2;
  if (iso === 'ESP' || iso === 'PRT' || iso === 'GRC') return 1.6;
  if (region === 'atlantic-europe' || region === 'east-europe') return 0.35;
  if (region === 'mediterranean') return 0.3;
  return 0;
}

/** Turbines, where wind farms are: the open plains and the windy coasts. */
function turbineWeight(iso: string, region: RegionId): number {
  if (iso === 'DEU' || iso === 'DNK' || iso === 'ESP' || iso === 'NLD') return 1.4;
  if (iso === 'CHN' || iso === 'USA' || iso === 'GBR') return 1.3;
  switch (region) {
    case 'atlantic-europe':
    case 'nordic':
    case 'north-america':
    case 'oceania':
      return 0.7;
    case 'east-europe':
    case 'latin-america':
    case 'mediterranean':
      return 0.4;
    default:
      return 0;
  }
}

const HIMALAYA = new Set(['NPL', 'BTN']);
const HIGH_ASIA = new Set(['CHN', 'IND', 'PAK', 'NPL', 'BTN']);
const SPIRIT_HOUSES = new Set(['THA', 'LAO', 'KHM', 'MMR', 'VNM']);
const STEPPE_NOMADS = new Set(['MNG', 'KAZ', 'KGZ']);
/**
 * Where a region's table would put the wrong faith's shrine: the Muslim
 * countries of regions whose shrine is a cross or a shikhara. A region is a
 * way of building, and belief does not follow it.
 */
const MUSLIM = new Set(['TUR', 'CYN', 'AZE', 'KAZ', 'KGZ', 'UZB', 'TKM', 'TJK', 'AFG', 'PAK', 'BGD', 'MDV', 'KOS', 'ALB']);

/** Which shrine keeps the way here, if any. */
function shrineFor(iso: string, region: RegionId, elevation: number, rng: Rng): { parts: string[]; weight: number } | null {
  const high = elevation > MAX_RELIEF * 0.28;
  if (HIMALAYA.has(iso) || (HIGH_ASIA.has(iso) && high)) return { parts: ['chorten', 'prayer-flags'], weight: 1.6 };
  if (iso === 'JPN') return { parts: ['torii'], weight: 1.4 };
  // An ovoo: the cairn of the steppe, hung with flags.
  if (iso === 'MNG') return { parts: ['cairn', 'prayer-flags'], weight: 1.2 };
  if (MUSLIM.has(iso)) return { parts: ['marabout'], weight: 0.6 };
  if (iso === 'LKA') return { parts: ['chorten'], weight: 1 };
  switch (region) {
    case 'east-asia':
      return { parts: ['road-shrine'], weight: 0.8 };
    case 'southeast-asia':
      return SPIRIT_HOUSES.has(iso) ? { parts: ['spirit-house'], weight: 1.2 } : { parts: ['marabout'], weight: 0.4 };
    case 'south-asia':
      return { parts: ['hindu-shrine'], weight: 0.9 };
    case 'maghreb':
    case 'middle-east':
      return { parts: ['marabout'], weight: 0.6 };
    case 'mediterranean':
    case 'latin-america':
    case 'east-europe':
      return { parts: [rng.chance(0.45) ? 'chapel' : 'wayside-cross'], weight: 0.9 };
    case 'atlantic-europe':
    case 'nordic':
      return { parts: [rng.chance(0.2) ? 'chapel' : 'wayside-cross'], weight: 0.8 };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

/** Keep-clear margins, in world units, past what each thing already claims. */
const TOWN_MARGIN = 6;
const ROAD_MARGIN = 2;
/** How far inside its own cell everything a plan holds stays. */
const CELL_MARGIN = 3;
/**
 * The ground a piece wears out of the grass (`trodden`), by part: bare within
 * `bare` of its footprint (the part's own, not the rotor's reach a mill's is
 * planned by), then trodden short over `worn` units more, growing back to
 * the field's height at its edge. A campfire's is its ring of stones and the
 * earth round it, trampled out to where the tents stand; a tent's the ground
 * it is pitched on and its door. What is not listed wears `WORN_DEFAULT`, and
 * a tree none: grass grows under a palm. The whole reach is held inside
 * `CELL_MARGIN` past the footprint, which is how far in its cell a plan keeps
 * everything, so a cell answers for its own ground.
 */
const WORN: Readonly<Record<string, { bare: number; worn: number }>> = {
  campfire: { bare: 1.7, worn: 2 },
  tent: { bare: 0.9, worn: 1.5 },
  ger: { bare: 0.95, worn: 1.5 },
  'nomad-tent': { bare: 0.9, worn: 1.5 },
  'hay-bale': { bare: 1, worn: 0.8 },
  bench: { bare: 0.7, worn: 1.2 },
  turbine: { bare: 0.6, worn: 1 },
  rocks: { bare: 0.6, worn: 0 },
  'standing-stone': { bare: 0.8, worn: 1 },
  cairn: { bare: 0.8, worn: 1 },
  'prayer-flags': { bare: 0, worn: 0 },
  palm: { bare: 0, worn: 0 },
  olive: { bare: 0, worn: 0 },
};
const WORN_DEFAULT = { bare: 0.85, worn: 1.5 };
/** How tall the grass stands at the bare edge of a piece's worn ground, of the field's. */
const TRODDEN = 0.35;

/** What `find` and the density both mean by far from a town. */
const NEAR_TOWN = 800;
const NEAR_ROAD = 220;
/** The steepest ground under each: a field, a building, a tower, a small thing. */
const FIELD_GRADE = 0.14;
const BUILDING_GRADE = 0.3;
const PROP_GRADE = MAX_SLOPE;
/**
 * The steepest ground each crop is grown on, where it is not `FIELD_GRADE`:
 * vines and olives climb the hills a plough cannot, and a paddy is a level
 * pool or nothing.
 */
const CROP_GRADE: Partial<Record<CropId, number>> = { vineyard: 0.3, olives: 0.3, paddy: 0.08, pond: 0.1 };
/** How far apart a field's ground is asked about: under the narrowest carriageway. */
const FIELD_PROBE = 7;

/**
 * The chance a cell holds any big thing at all, drawn before the world is
 * asked anything; the weights below then share it out, and `NOTHING` is the
 * weight of the empty cell against them. Tuned by `pnpm country`'s density:
 * walking two minutes through farmland there is always a farm or a mill in
 * sight, and a wilderness has something every few minutes.
 */
const ANY = 0.62;
const NOTHING = 1.4;
/** How many other kinds a cell tries when the one it drew cannot stand anywhere in it. */
const FALLBACKS = 2;

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

interface Disc {
  x: number;
  z: number;
  radius: number;
}

/** A landmark's plan in the cell's frame: its point there, and the plan kept `MONUMENT_CLEARANCE` off. */
interface PlanAt {
  x: number;
  z: number;
  shape: PlanShape;
}

/** Ground a plan has taken: a disc, or with `halfX` a rectangle turned by `yaw`. */
interface Claim extends Disc {
  yaw: number;
  halfX: number;
  halfZ: number;
}

interface Segment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  clearance: number;
}

export function createCountryside(world: World, options: CountrysideOptions = {}): Countryside {
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const stats: CountrysideStats = { planned: 0, cached: 0, slowestMs: 0, meanMs: 0, byKind: {}, refused: { quiet: 0, nothing: 0 } };
  let totalMs = 0;

  // --- the towns, bucketed by degree ---------------------------------------
  const BUCKET = 2;
  let towns = new Map<number, { x: number; y: number; z: number; reach: number }[]>();
  let widestTown = 0;
  const bucketKey = (a: number, b: number): number => a * 1000 + b;
  const indexTowns = (): void => {
    towns = new Map();
    widestTown = 0;
    for (const place of options.places ?? []) {
      if (!isShown(place)) continue;
      const reach = countryReach(radiusOf(place));
      widestTown = Math.max(widestTown, reach);
      const u = unitAt(place.lat, place.lon, new THREE.Vector3());
      const key = bucketKey(Math.floor((place.lat + 90) / BUCKET), Math.floor((place.lon + 180) / BUCKET));
      let list = towns.get(key);
      if (list === undefined) towns.set(key, (list = []));
      list.push({ x: u.x, y: u.y, z: u.z, reach });
    }
  };
  indexTowns();

  // By the ground each model takes, its plan, as the towns and the wood keep
  // off it; a site with none is its footprint's disc, as it always was.
  const monuments = (options.monuments ?? []).map((site) => {
    const shape = planShape(site);
    return { unit: unitAt(site.lat, site.lon, new THREE.Vector3()), shape, reach: planReach(shape) + MONUMENT_CLEARANCE };
  });

  const roads = options.roads;
  const roadIndex = roads !== undefined && options.places !== undefined && roads.length > 0 ? roadIndexFor(roads, options.places) : null;
  const roadGeometry = roadIndex !== null ? roadGeometryFor(roads!, options.places!) : null;
  const roadHits: number[] = [];
  const fieldHits: FieldKeepout[] = [];

  // --- the plan's own frame and what it keeps clear of ----------------------
  const up = new THREE.Vector3();
  const north = new THREE.Vector3();
  const east = new THREE.Vector3();
  const bounds: CellBounds = { south: 0, west: 0, dLat: 0, dLon: 0 };
  const townDiscs: Disc[] = [];
  const builtDiscs: Disc[] = [];
  const builtPlans: PlanAt[] = [];
  const roadSegments: Segment[] = [];
  const claimed: Claim[] = [];
  /**
   * Whether the whole cell is further from any water than it is wide, which
   * `shoreDistance` answers at once: then every point in it is land and the
   * point-in-polygon under each is skipped, as `vegetation.ts` skips it.
   */
  let inland = false;
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const scratch = new THREE.Vector3();
  const sample = biomeSample();

  /** A local offset (east, north) from the cell's centre as a unit vector. */
  function dirAt(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(up).addScaledVector(east, x / PLANET_RADIUS).addScaledVector(north, z / PLANET_RADIUS).normalize();
  }
  const localX = (u: THREE.Vector3): number => u.dot(east) * PLANET_RADIUS;
  const localZ = (u: THREE.Vector3): number => u.dot(north) * PLANET_RADIUS;

  function gather(radius: number): void {
    townDiscs.length = 0;
    builtDiscs.length = 0;
    builtPlans.length = 0;
    roadSegments.length = 0;
    claimed.length = 0;
    const lat = latOf(up.y);
    const lon = lonOf(up.x, up.z);
    const reachDeg = (radius + NEAR_TOWN + widestTown) / UNITS_PER_DEGREE;
    const rows = Math.ceil(reachDeg / BUCKET) + 1;
    const spread = Math.min(180, reachDeg / Math.max(Math.cos(lat * DEG), 0.05));
    const cols = Math.min(Math.ceil(360 / BUCKET), Math.ceil(spread / BUCKET) + 1);
    const a0 = Math.floor((lat + 90) / BUCKET);
    const b0 = Math.floor((lon + 180) / BUCKET);
    const wrap = Math.round(360 / BUCKET);
    const cos = Math.cos((radius + NEAR_TOWN + widestTown) / PLANET_RADIUS);
    for (let a = a0 - rows; a <= a0 + rows; a++) {
      for (let b = b0 - cols; b <= b0 + cols; b++) {
        const list = towns.get(bucketKey(a, ((b % wrap) + wrap) % wrap));
        if (list === undefined) continue;
        for (const town of list) {
          const dot = town.x * up.x + town.y * up.y + town.z * up.z;
          if (dot < cos) continue;
          scratch.set(town.x, town.y, town.z);
          townDiscs.push({ x: localX(scratch), z: localZ(scratch), radius: town.reach });
        }
      }
    }
    for (const site of monuments) {
      if (site.unit.dot(up) < Math.cos((radius + site.reach + 60) / PLANET_RADIUS)) continue;
      builtPlans.push({ x: localX(site.unit), z: localZ(site.unit), shape: site.shape });
    }
    if (options.fields !== undefined) {
      fieldHits.length = 0;
      for (const field of options.fields.fieldsNear(up, radius + FIELD_CLEARANCE + 40, fieldHits)) {
        builtDiscs.push({ x: localX(field.at), z: localZ(field.at), radius: field.radius + FIELD_CLEARANCE });
      }
    }
    if (roadIndex !== null && roadGeometry !== null) {
      roadIndex.near(up, radius + NEAR_ROAD + 40, roadHits);
      for (const hit of roadHits) {
        const path = roadGeometry.path(hit);
        const clearance = roadClearance(roads![hit]!.cls);
        let x0 = 0;
        let z0 = 0;
        for (let step = 0; step < path.count; step++) {
          scratch.set(path.xyz[step * 3]!, path.xyz[step * 3 + 1]!, path.xyz[step * 3 + 2]!);
          const x = localX(scratch);
          const z = localZ(scratch);
          if (step > 0) {
            const mx = (x0 + x) / 2;
            const mz = (z0 + z) / 2;
            const limit = radius + NEAR_ROAD + 100;
            if (mx * mx + mz * mz < limit * limit) roadSegments.push({ x0, z0, x1: x, z1: z, clearance });
          }
          x0 = x;
          z0 = z;
        }
      }
    }
  }

  /** How far a point is from the nearest town's country, negative inside it. */
  function townGap(x: number, z: number): number {
    let best = Infinity;
    for (const town of townDiscs) best = Math.min(best, Math.hypot(x - town.x, z - town.z) - town.radius);
    return best;
  }

  /** How far a point is from the nearest carriageway's edge, and which way that road runs there. */
  const roadNearest = { gap: Infinity, dx: 0, dz: 1, x: 0, z: 0 };
  function roadGap(x: number, z: number): typeof roadNearest {
    roadNearest.gap = Infinity;
    for (const road of roadSegments) {
      const dx = road.x1 - road.x0;
      const dz = road.z1 - road.z0;
      const lengthSq = dx * dx + dz * dz;
      let t = lengthSq > 1e-9 ? ((x - road.x0) * dx + (z - road.z0) * dz) / lengthSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = road.x0 + t * dx;
      const pz = road.z0 + t * dz;
      const gap = Math.hypot(x - px, z - pz) - road.clearance;
      if (gap < roadNearest.gap) {
        const length = Math.sqrt(lengthSq) || 1;
        roadNearest.gap = gap;
        roadNearest.dx = dx / length;
        roadNearest.dz = dz / length;
        roadNearest.x = px;
        roadNearest.z = pz;
      }
    }
    return roadNearest;
  }

  /** Whether a point is inside the plan's own cell, `margin` units in from its edge. */
  function inCell(x: number, z: number, margin: number): boolean {
    const u = dirAt(x, z, scratch);
    const lat = latOf(u.y);
    const lon = lonOf(u.x, u.z);
    const inset = (margin + CELL_MARGIN) / UNITS_PER_DEGREE;
    if (lat < bounds.south + inset || lat > bounds.south + bounds.dLat - inset) return false;
    let dLon = lon - bounds.west;
    dLon = ((dLon % 360) + 360) % 360;
    const insetLon = inset / Math.max(Math.cos(lat * DEG), 0.05);
    return dLon >= insetLon && dLon <= bounds.dLon - insetLon;
  }

  /**
   * Whether a disc of ground is free for something: in the cell, on land,
   * clear of every town's country, landmark, carriageway and field, of what
   * this plan already put down, and no steeper than `grade`.
   */
  function free(x: number, z: number, radius: number, grade: number, water = false): boolean {
    if (!inCell(x, z, radius)) return false;
    for (const town of townDiscs) {
      const r = town.radius + radius + TOWN_MARGIN;
      if ((x - town.x) ** 2 + (z - town.z) ** 2 < r * r) return false;
    }
    for (const disc of builtDiscs) {
      const r = disc.radius + radius;
      if ((x - disc.x) ** 2 + (z - disc.z) ** 2 < r * r) return false;
    }
    for (const plan of builtPlans) if (planGap(plan.shape, x - plan.x, z - plan.z) < radius + MONUMENT_CLEARANCE) return false;
    for (const claim of claimed) if (claimDistance(claim, x, z) < radius) return false;
    if (roadGap(x, z).gap < radius + ROAD_MARGIN) return false;
    if (water) return true;
    const u = dirAt(x, z, scratch);
    if (!inland && world.elevationAt(u) <= 0) return false;
    return gradeAt(u, east, north, Math.max(1.2, radius * 0.7), slope).grade <= grade;
  }

  /** How far a point is from a claim's ground: its disc, or its rectangle. */
  function claimDistance(claim: Claim, x: number, z: number): number {
    if (claim.halfX <= 0) return Math.hypot(x - claim.x, z - claim.z) - claim.radius;
    const c = Math.cos(claim.yaw);
    const s = Math.sin(claim.yaw);
    const dx = x - claim.x;
    const dz = z - claim.z;
    const lx = Math.abs(dx * c - dz * s) - claim.halfX;
    const lz = Math.abs(dx * s + dz * c) - claim.halfZ;
    return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0);
  }

  /** Two turned rectangles overlap unless one of their four axes separates them. */
  function rectsOverlap(a: Claim, b: Claim): boolean {
    const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
    for (const angle of axes) {
      const ax = Math.cos(angle);
      const az = -Math.sin(angle);
      const extent = (r: Claim): number =>
        r.halfX * Math.abs(Math.cos(r.yaw) * ax - Math.sin(r.yaw) * az) + r.halfZ * Math.abs(Math.sin(r.yaw) * ax + Math.cos(r.yaw) * az);
      const gap = Math.abs((a.x - b.x) * ax + (a.z - b.z) * az);
      if (gap >= extent(a) + extent(b)) return false;
    }
    return true;
  }

  /**
   * Whether a rectangle is free for a field: its corners in the cell, clear
   * of every town's country, landmark and plane's field, of what the plan
   * already holds, of the carriageways and the water at every point of a
   * lattice over it, and flat enough to plough.
   */
  const probeClaim: Claim = { x: 0, z: 0, radius: 0, yaw: 0, halfX: 0, halfZ: 0 };
  function fieldFits(x: number, z: number, yaw: number, halfX: number, halfZ: number, round: boolean, grade: number): boolean {
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const p = turn(x, z, yaw, u * halfX, v * halfZ);
      if (!inCell(p.x, p.z, 0)) return false;
    }
    Object.assign(probeClaim, { x, z, yaw, halfX, halfZ, radius: Math.hypot(halfX, halfZ) });
    for (const town of townDiscs) if (claimDistance(probeClaim, town.x, town.z) < town.radius + TOWN_MARGIN) return false;
    for (const disc of builtDiscs) if (claimDistance(probeClaim, disc.x, disc.z) < disc.radius) return false;
    if (builtPlans.length > 0) {
      // The field's own box in the cell's frame, which holds the turned field.
      const ex = Math.abs(halfX * Math.cos(yaw)) + Math.abs(halfZ * Math.sin(yaw));
      const ez = Math.abs(halfX * Math.sin(yaw)) + Math.abs(halfZ * Math.cos(yaw));
      for (const plan of builtPlans) {
        const dx = x - plan.x;
        const dz = z - plan.z;
        if (planGapToBox(plan.shape, dx - ex, dx + ex, dz - ez, dz + ez) < MONUMENT_CLEARANCE) return false;
      }
    }
    for (const claim of claimed) {
      if (claim.halfX > 0 ? rectsOverlap(claim, probeClaim) : claimDistance(probeClaim, claim.x, claim.z) < claim.radius) return false;
    }
    const across = Math.max(1, Math.ceil((2 * halfX) / FIELD_PROBE));
    const along = Math.max(1, Math.ceil((2 * halfZ) / FIELD_PROBE));
    for (let i = 0; i <= across; i++) {
      for (let j = 0; j <= along; j++) {
        const lx = -halfX + (i * 2 * halfX) / across;
        const lz = -halfZ + (j * 2 * halfZ) / along;
        if (round && (lx / halfX) ** 2 + (lz / halfZ) ** 2 > 1.0001) continue;
        const p = turn(x, z, yaw, lx, lz);
        if (roadGap(p.x, p.z).gap < ROAD_MARGIN) return false;
        if (!inland && world.elevationAt(dirAt(p.x, p.z, scratch)) <= 0) return false;
      }
    }
    const u = dirAt(x, z, new THREE.Vector3());
    if (gradeAt(u, east, north, Math.hypot(halfX, halfZ) * 0.7, slope).grade > grade) return false;
    return gradeAt(u, east, north, Math.min(halfX, halfZ) * 0.5, slope).grade <= grade * 1.3;
  }

  /** A fence or a wall is only drawn where every few units of it are free. */
  function lineFree(ax: number, az: number, bx: number, bz: number): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 5));
    for (let i = 0; i <= steps; i++) {
      if (!free(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps, 0.6, MAX_SLOPE)) return false;
    }
    return true;
  }

  // --- the plan -------------------------------------------------------------

  /**
   * The cells planned, least recently asked first: a hit moves its cell to
   * the back and a full cache lets go of the front one. Emptied whole, it
   * dropped the cells the tiles standing now had just planned, and every one
   * of them, the grass's texels and the herds' tests planned again at once.
   */
  const plans = new Map<string, CountryPlan>();
  const PLAN_CAP = 12_000;

  // The cell asked last, answered without the key or the cache: the grass
  // asks a question a texel, and a line of texels is in a handful of cells.
  let lastRow = NaN;
  let lastColumn = NaN;
  let lastPlan: CountryPlan | null = null;
  function plan(row: number, column: number): CountryPlan {
    if (row === lastRow && column === lastColumn && lastPlan !== null) return lastPlan;
    lastRow = row;
    lastColumn = column;
    lastPlan = planOf(row, column);
    return lastPlan;
  }
  function planOf(row: number, column: number): CountryPlan {
    cellBounds(0, row, column, bounds);
    const key = `${row}/${Math.round((bounds.west + 180) / bounds.dLon)}`;
    const known = plans.get(key);
    if (known !== undefined) {
      plans.delete(key);
      plans.set(key, known);
      return known;
    }
    const began = performance.now();
    const made = planCell(key, row);
    const ms = performance.now() - began;
    stats.planned++;
    totalMs += ms;
    stats.slowestMs = Math.max(stats.slowestMs, Number(ms.toFixed(2)));
    stats.meanMs = Number((totalMs / stats.planned).toFixed(3));
    if (made.kind !== null) stats.byKind[made.kind] = (stats.byKind[made.kind] ?? 0) + 1;
    if (plans.size >= PLAN_CAP) plans.delete(plans.keys().next().value!);
    plans.set(key, made);
    stats.cached = plans.size;
    return made;
  }

  function planCell(key: string, row: number): CountryPlan {
    // Every draw in a fixed order, before anything can refuse the cell.
    const rng = rngFrom('country', row, Math.round((bounds.west + 180) / bounds.dLon));
    const any = rng.unit();
    const pick = rng.unit();
    const u = rng.range(0.32, 0.68);
    const v = rng.range(0.32, 0.68);
    // Where else to try, if the first spot is taken: the cell's four quarters.
    const tries: [number, number][] = [[u, v]];
    for (const [a, b] of [[0.28, 0.28], [0.72, 0.28], [0.72, 0.72], [0.28, 0.72]] as const) {
      tries.push([a + rng.range(-0.08, 0.08), b + rng.range(-0.08, 0.08)]);
    }
    const minor = rng.fork('minor');
    const layout = rng.fork('layout');

    const centreLat = bounds.south + bounds.dLat / 2;
    const centreLon = bounds.west + bounds.dLon / 2;
    unitAt(centreLat, centreLon, up);
    north.set(0, 1, 0).projectOnPlane(up);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
    north.normalize();
    east.crossVectors(up, north).normalize();
    const halfNorth = (bounds.dLat * UNITS_PER_DEGREE) / 2;
    const halfEast = (bounds.dLon * Math.cos(centreLat * DEG) * UNITS_PER_DEGREE) / 2;

    const out: CountryPlan = { key, kind: null, style: regionFor('', '', centreLat), pieces: [], fields: [], lines: [], meadows: [] };

    // The cheap refusals first: open sea, ice and the poles have nothing.
    const anchorX = (u - 0.5) * 2 * halfEast;
    const anchorZ = (v - 0.5) * 2 * halfNorth;
    const anchor = dirAt(anchorX, anchorZ, new THREE.Vector3());
    const country = world.countryAtPoint(anchor);
    const coast = shoreDistance(latOf(anchor.y), lonOf(anchor.x, anchor.z));
    const cellDeg = Math.hypot(halfEast, halfNorth) / UNITS_PER_DEGREE;
    if (country <= 0 && coast > cellDeg + 0.05) return out;
    inland = country > 0 && shoreDistance(centreLat, centreLon) > cellDeg + 0.5;
    let iso = country > 0 ? world.countries[country - 1]!.iso : '';
    if (iso === '') {
      // An anchor at sea on a coastal cell: the country of the land in it.
      for (const [a, b] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]] as const) {
        const found = world.countryAtPoint(dirAt(a * 2 * halfEast * 0.6, b * 2 * halfNorth * 0.6, scratch));
        if (found > 0) {
          iso = world.countries[found - 1]!.iso;
          break;
        }
      }
      if (iso === '') return out;
    }
    const style = regionFor(iso, continentOf.get(iso) ?? '', centreLat);
    out.style = style;
    const region = style.id as RegionId;
    if (region === 'polar') return out;

    gather(Math.hypot(halfEast, halfNorth));
    const relief = reliefAt(anchor.x, anchor.y, anchor.z);
    const anchorLat = latOf(anchor.y);
    biomeAt(anchor.x, anchor.y, anchor.z, anchorLat, lonOf(anchor.x, anchor.z), relief, sample);
    const biome = sample.id;
    const landHere = country > 0;
    const nearTown = townGap(anchorX, anchorZ);
    const nearRoad = roadGap(anchorX, anchorZ).gap;
    const shore = coast < cellDeg;

    // --- the big thing ------------------------------------------------------
    if (any < ANY) {
      const choices: Weighted<FeatureKind>[] = [{ item: 'farm', weight: 0 }];
      const farming = FARMING[biome] * (landHere ? 1 : 0);
      if (farming > 0) choices[0]!.weight = farming * (nearTown < NEAR_TOWN ? 3.5 : nearRoad < NEAR_ROAD ? 2.2 : 0.5);
      const flat = biome === 'temperate' || biome === 'grassland' || biome === 'steppe';
      if (flat && landHere) {
        const mill = windmillWeight(iso, region);
        if (mill > 0) choices.push({ item: 'windmill', weight: mill });
        const turbines = turbineWeight(iso, region);
        if (turbines > 0 && nearTown > 120) choices.push({ item: 'turbines', weight: turbines });
      }
      if (shore) {
        choices.push({ item: 'lighthouse', weight: nearTown < 2500 ? 1.4 : 0.5 });
        if (nearTown > 150 && biome !== 'ice' && biome !== 'desert') choices.push({ item: 'fishing', weight: 1.1 });
      }
      if (landHere) {
        const shrine = shrineFor(iso, region, relief, layout.fork('shrine'));
        // A shrine is where people pass: few in the open desert.
        if (shrine !== null) choices.push({ item: 'shrine', weight: shrine.weight * (biome === 'desert' ? 0.25 : 1) });
        if (region === 'atlantic-europe' || region === 'nordic') choices.push({ item: 'stones', weight: 0.22 });
        choices.push({ item: 'ruin', weight: region === 'mediterranean' || region === 'maghreb' || region === 'middle-east' ? 0.3 : 0.1 });
        if (biome === 'boreal' || biome === 'temperate' || biome === 'grassland' || biome === 'steppe' || biome === 'tundra' || biome === 'desert') {
          choices.push({ item: 'camp', weight: STEPPE_NOMADS.has(iso) ? 1.4 : biome === 'desert' ? 0.4 : 0.35 });
        }
        if (biome === 'desert') choices.push({ item: 'oasis', weight: 1 });
        if (biome === 'rock' || biome === 'tundra' || relief > MAX_RELIEF * 0.32) choices.push({ item: 'cairn', weight: 1.2 });
        else if (relief > MAX_RELIEF * 0.16 && biome !== 'tropical') choices.push({ item: 'cairn', weight: 0.5 });
      }
      let total = NOTHING;
      for (const choice of choices) total += choice.weight;
      let target = pick * total;
      let kind: FeatureKind | null = null;
      for (const choice of choices) {
        target -= choice.weight;
        if (target < 0 && choice.weight > 0) {
          kind = choice.item;
          break;
        }
      }
      if (kind === null) stats.refused.nothing = (stats.refused.nothing ?? 0) + 1;
      else {
        // What was drawn, then the next likeliest two if it found nowhere to
        // stand: a hillside that will not take a farm will take a shrine.
        const order = [kind, ...choices.filter((choice) => choice.item !== kind && choice.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, FALLBACKS).map((choice) => choice.item)];
        for (const candidate of order) {
          // The first spot, then the quarters: a cell half covered by a
          // town's country still has a corner for a farm, and a fjord a strand.
          for (let attempt = 0; attempt < tries.length && out.kind === null; attempt++) {
            const [tu, tv] = tries[attempt]!;
            const context = { x: (tu - 0.5) * 2 * halfEast, z: (tv - 0.5) * 2 * halfNorth, iso, region, biome, relief, style, lat: anchorLat, halfEast, halfNorth };
            if (build(candidate, out, layout.fork(`${candidate}:${attempt}`), context)) out.kind = candidate;
            else {
              out.pieces.length = 0;
              out.fields.length = 0;
              out.lines.length = 0;
              claimed.length = 0;
            }
          }
          if (out.kind !== null) break;
          stats.refused[candidate] = (stats.refused[candidate] ?? 0) + 1;
        }
      }
    } else stats.refused.quiet = (stats.refused.quiet ?? 0) + 1;

    // --- and the small things, anywhere else in the cell ----------------------
    if (landHere) smallThings(out, minor, { x: anchorX, z: anchorZ, iso, region, biome, relief, style, lat: anchorLat, halfEast, halfNorth });
    return out;
  }

  interface Context {
    x: number;
    z: number;
    iso: string;
    region: RegionId;
    biome: BiomeId;
    relief: number;
    style: RegionStyle;
    lat: number;
    halfEast: number;
    halfNorth: number;
  }

  /** A local point turned by `yaw` about (ox, oz): a new one each call, because a plan holds several at once. */
  function turn(ox: number, oz: number, yaw: number, lx: number, lz: number): { x: number; z: number } {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return { x: ox + lx * c + lz * s, z: oz - lx * s + lz * c };
  }

  function put(plan: CountryPlan, part: string, x: number, z: number, yaw: number, footprint: number, rng: Rng, scale = 1, scenic = false, base?: number): void {
    const piece: CountryPiece = {
      part,
      scenic,
      variant: rng.int(COUNTRY_VARIANTS),
      at: dirAt(x, z, new THREE.Vector3()),
      yaw,
      scale,
      footprint: footprint * scale,
    };
    if (base !== undefined) piece.base = base;
    plan.pieces.push(piece);
    claimed.push({ x, z, radius: footprint * scale, yaw: 0, halfX: 0, halfZ: 0 });
  }

  /** Puts a part down if its ground is free; true if it stood. */
  function tryPut(plan: CountryPlan, part: string, x: number, z: number, yaw: number, rng: Rng, grade: number, scale = 1): boolean {
    const spec = COUNTRY_PARTS[part]!;
    const reach = Math.max(spec.footprint, spec.rotor !== undefined ? ROTOR_RADIUS[spec.rotor.kind] * 0.55 : 0) * scale;
    if (!free(x, z, reach, grade)) return false;
    put(plan, part, x, z, yaw, reach, rng, scale);
    return true;
  }

  function addField(plan: CountryPlan, crop: CropId, x: number, z: number, yaw: number, halfX: number, halfZ: number, round = false): boolean {
    if (!fieldFits(x, z, yaw, halfX, halfZ, round, CROP_GRADE[crop] ?? FIELD_GRADE)) return false;
    plan.fields.push({ crop, at: dirAt(x, z, new THREE.Vector3()), yaw, halfX, halfZ, round });
    claimed.push({ x, z, radius: Math.hypot(halfX, halfZ), yaw, halfX, halfZ });
    return true;
  }

  function fence(plan: CountryPlan, kind: 'fence' | 'wall', ax: number, az: number, bx: number, bz: number): void {
    if (!lineFree(ax, az, bx, bz)) return;
    plan.lines.push({ kind, from: dirAt(ax, az, new THREE.Vector3()), to: dirAt(bx, bz, new THREE.Vector3()) });
  }

  /** A wind direction a few degrees wide, shared by every turbine in it. */
  function windOf(lat: number, lon: number): number {
    return rngFrom('wind', Math.floor(lat / 4), Math.floor(lon / 4)).unit() * Math.PI * 2;
  }

  /**
   * The land point of a coastal cell with the most water round it, and the
   * way the water lies from it: a headland for a lighthouse, a strand for a
   * jetty. Sixteen candidates, eight looks each, only for a coastal cell that
   * has already drawn one of the two.
   */
  function coastPoint(c: Context, wantHeadland: boolean): { x: number; z: number; toWater: number } | null {
    let best: { x: number; z: number; toWater: number; score: number } | null = null;
    const look = 26;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = (-0.6 + (i * 1.2) / 3) * c.halfEast;
        const z = (-0.6 + (j * 1.2) / 3) * c.halfNorth;
        if (world.elevationAt(dirAt(x, z, scratch)) <= 0) continue;
        let wet = 0;
        let wx = 0;
        let wz = 0;
        for (let k = 0; k < 8; k++) {
          const angle = (k / 8) * Math.PI * 2;
          const ex = Math.sin(angle);
          const ez = Math.cos(angle);
          if (world.elevationAt(dirAt(x + ex * look, z + ez * look, scratch)) <= 0) {
            wet++;
            wx += ex;
            wz += ez;
          }
        }
        if (wet === 0 || wet === 8) continue;
        // A headland has water most of the way round; a strand on one side.
        const score = wantHeadland ? wet : 8 - Math.abs(wet - 3);
        if (best === null || score > best.score) best = { x, z, toWater: Math.atan2(wx, wz), score };
      }
    }
    return best;
  }

  function build(kind: FeatureKind, plan: CountryPlan, rng: Rng, c: Context): boolean {
    switch (kind) {
      case 'farm':
        return farm(plan, rng, c);
      case 'windmill': {
        const count = c.iso === 'NLD' ? rng.between(1, 3) : 1;
        const yaw = windOf(c.lat, lonOf(up.x, up.z)) + rng.range(-0.3, 0.3);
        const along = rng.range(0, Math.PI);
        let stood = 0;
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * 34;
          const p = turn(c.x, c.z, along, offset, 0);
          if (tryPut(plan, 'windmill', p.x, p.z, yaw, rng, BUILDING_GRADE, rng.range(0.9, 1.05))) stood++;
        }
        if (stood > 0 && rng.chance(0.5)) {
          const crop = rng.weighted(cropsFor(c.region, c.biome, c.lat, c.iso));
          const p = turn(c.x, c.z, along, 0, 30);
          addField(plan, crop, p.x, p.z, along, rng.range(12, 18), rng.range(10, 16));
        }
        return stood > 0;
      }
      case 'turbines': {
        const count = rng.between(2, 4);
        const yaw = windOf(c.lat, lonOf(up.x, up.z));
        // In a line across the wind, which is how a wind farm stands.
        let stood = 0;
        for (let i = 0; i < count; i++) {
          const p = turn(c.x, c.z, yaw + Math.PI / 2, 0, (i - (count - 1) / 2) * 44);
          if (tryPut(plan, 'turbine', p.x, p.z, yaw, rng, BUILDING_GRADE)) stood++;
        }
        return stood > 0;
      }
      case 'lighthouse': {
        const point = coastPoint(c, true);
        if (point === null) return false;
        const back = 5;
        const x = point.x - Math.sin(point.toWater) * back;
        const z = point.z - Math.cos(point.toWater) * back;
        // The keeper's house is behind the tower, so the tower faces the water.
        if (!tryPut(plan, 'lighthouse', x, z, point.toWater, rng, BUILDING_GRADE)) return false;
        if (rng.chance(0.4)) {
          const p = turn(x, z, point.toWater, rng.sign() * 9, -4);
          tryPut(plan, 'bench', p.x, p.z, point.toWater, rng, PROP_GRADE);
        }
        return true;
      }
      case 'fishing': {
        const point = coastPoint(c, false);
        if (point === null) return false;
        const facing = point.toWater;
        // The hut a little back from the water, the jetty out from the strand.
        const hut = turn(point.x, point.z, facing, rng.range(-6, 6), -9);
        if (!tryPut(plan, 'fishing-hut', hut.x, hut.z, facing, rng, BUILDING_GRADE)) return false;
        // The jetty runs from the last land out: find where the land stops.
        let land = 0;
        for (let step = 1; step <= 12; step++) {
          const p = turn(point.x, point.z, facing, 0, step * 2);
          if (world.elevationAt(dirAt(p.x, p.z, scratch)) <= 0) break;
          land = step * 2;
        }
        const start = turn(point.x, point.z, facing, 0, land - 1);
        const end = turn(point.x, point.z, facing, 0, land + 14);
        const startX = start.x;
        const startZ = start.z;
        if (world.elevationAt(dirAt(end.x, end.z, scratch)) > 0) return true;
        if (!inCell(end.x, end.z, 2) || !free(startX, startZ, 1.5, PROP_GRADE, true)) return true;
        const ground = world.elevationAt(dirAt(startX, startZ, scratch));
        if (ground <= 0) return true;
        put(plan, 'jetty', startX, startZ, facing, 1.6, rng, 1, false, ground);
        claimed.push({ x: end.x, z: end.z, radius: 3, yaw: 0, halfX: 0, halfZ: 0 });
        const boat = turn(point.x, point.z, facing, rng.sign() * 2.8, land + 9);
        if (world.elevationAt(dirAt(boat.x, boat.z, scratch)) <= 0) {
          put(plan, 'rowboat', boat.x, boat.z, facing + rng.range(-0.3, 0.3), 1.8, rng, 1, false, WATERLINE);
        }
        return true;
      }
      case 'shrine': {
        const shrine = shrineFor(c.iso, c.region, c.relief, rng.fork('shrine'));
        if (shrine === null) return false;
        // Beside a road where one passes near, facing it; else where it fell.
        const spots: { x: number; z: number; yaw: number }[] = [];
        const road = roadGap(c.x, c.z);
        const off = Math.hypot(c.x - road.x, c.z - road.z);
        if (road.gap < 150 && off > 1e-3) {
          // Across the carriageway's edge from the anchor's side, facing it.
          const nx = (c.x - road.x) / off;
          const nz = (c.z - road.z) / off;
          const edge = off - road.gap;
          spots.push({ x: road.x + nx * (edge + 7), z: road.z + nz * (edge + 7), yaw: Math.atan2(-nx, -nz) });
        }
        spots.push({ x: c.x, z: c.z, yaw: rng.range(0, Math.PI * 2) });
        const first = shrine.parts[0]!;
        const spot = spots.find((candidate) => tryPut(plan, first, candidate.x, candidate.z, candidate.yaw, rng, BUILDING_GRADE));
        if (spot === undefined) return false;
        for (const part of shrine.parts.slice(1)) {
          const p = turn(spot.x, spot.z, spot.yaw, rng.sign() * 7, -3);
          tryPut(plan, part, p.x, p.z, spot.yaw + Math.PI / 2, rng, PROP_GRADE);
        }
        return true;
      }
      case 'stones': {
        const count = rng.between(7, 11);
        const radius = rng.range(6.5, 9.5);
        if (!free(c.x, c.z, radius + 1.5, BUILDING_GRADE)) return false;
        claimed.push({ x: c.x, z: c.z, radius: radius + 1.5, yaw: 0, halfX: 0, halfZ: 0 });
        for (let i = 0; i < count; i++) {
          if (rng.chance(0.12)) continue; // a gap where one fell
          const angle = (i / count) * Math.PI * 2 + rng.range(-0.08, 0.08);
          const x = c.x + Math.sin(angle) * radius;
          const z = c.z + Math.cos(angle) * radius;
          put(plan, 'standing-stone', x, z, angle + Math.PI / 2 + rng.range(-0.3, 0.3), 1, rng, rng.range(0.85, 1.2));
        }
        return true;
      }
      case 'ruin': {
        const classical = c.region === 'mediterranean' || c.region === 'maghreb' || c.region === 'middle-east';
        const yaw = rng.range(0, Math.PI * 2);
        if (!free(c.x, c.z, 16, BUILDING_GRADE)) return false;
        let stood = 0;
        if (classical) {
          const count = rng.between(4, 6);
          for (let i = 0; i < count; i++) {
            if (i > 0 && rng.chance(0.25)) continue;
            const p = turn(c.x, c.z, yaw, (i - (count - 1) / 2) * 4.6, 0);
            if (tryPut(plan, 'ruin-column', p.x, p.z, yaw, rng, BUILDING_GRADE)) stood++;
          }
          const back = turn(c.x, c.z, yaw, rng.range(-4, 4), -8);
          if (tryPut(plan, 'ruin-wall', back.x, back.z, yaw, rng, BUILDING_GRADE)) stood++;
        } else {
          for (let i = 0; i < 3; i++) {
            const p = turn(c.x, c.z, yaw + (i * Math.PI) / 2, 0, -5);
            if (tryPut(plan, 'ruin-wall', p.x, p.z, yaw + (i * Math.PI) / 2, rng, BUILDING_GRADE)) stood++;
          }
        }
        return stood > 0;
      }
      case 'camp': {
        const nomads = STEPPE_NOMADS.has(c.iso) && c.biome !== 'desert';
        const desert = c.biome === 'desert';
        const shelter = nomads ? 'ger' : desert ? 'nomad-tent' : 'tent';
        const count = nomads ? rng.between(1, 3) : desert ? rng.between(1, 2) : rng.between(1, 3);
        if (!tryPut(plan, 'campfire', c.x, c.z, 0, rng, PROP_GRADE)) return false;
        let stood = 0;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
          const reach = rng.range(6, 9) * (nomads ? 1.4 : 1);
          const x = c.x + Math.sin(angle) * reach;
          const z = c.z + Math.cos(angle) * reach;
          // Facing the fire.
          if (tryPut(plan, shelter, x, z, angle + Math.PI, rng, PROP_GRADE)) stood++;
        }
        return stood > 0;
      }
      case 'oasis': {
        const radius = rng.range(9, 14);
        if (!addField(plan, 'pond', c.x, c.z, 0, radius, radius * rng.range(0.7, 1), true)) return false;
        const palms = rng.between(6, 10);
        for (let i = 0; i < palms; i++) {
          const angle = (i / palms) * Math.PI * 2 + rng.range(-0.25, 0.25);
          const reach = radius + rng.range(3, 8);
          tryPut(plan, 'palm', c.x + Math.sin(angle) * reach, c.z + Math.cos(angle) * reach, rng.range(0, Math.PI * 2), rng, PROP_GRADE, rng.range(0.85, 1.15));
        }
        const tents = rng.between(0, 2);
        for (let i = 0; i < tents; i++) {
          const angle = rng.range(0, Math.PI * 2);
          const reach = radius + rng.range(16, 22);
          tryPut(plan, 'nomad-tent', c.x + Math.sin(angle) * reach, c.z + Math.cos(angle) * reach, angle + Math.PI, rng, PROP_GRADE);
        }
        return true;
      }
      case 'cairn': {
        if (!tryPut(plan, 'cairn', c.x, c.z, rng.range(0, Math.PI * 2), rng, PROP_GRADE, rng.range(0.9, 1.4))) return false;
        if (HIGH_ASIA.has(c.iso) && rng.chance(0.6)) {
          tryPut(plan, 'prayer-flags', c.x + rng.range(-3, 3), c.z + 7, rng.range(0, Math.PI), rng, PROP_GRADE);
        }
        return true;
      }
    }
  }

  /**
   * A farmstead: the house (the region's own dwelling), a barn and a silo
   * where the region builds them, a fenced yard, a tractor and hay bales, and
   * two to five fields round it, all square to the road when one passes, as
   * farms are.
   */
  function farm(plan: CountryPlan, rng: Rng, c: Context): boolean {
    const road = roadGap(c.x, c.z);
    const yaw = road.gap < NEAR_ROAD * 1.5 ? Math.atan2(road.dx, road.dz) + (rng.chance(0.5) ? Math.PI : 0) : rng.range(0, Math.PI * 2);
    const crops = cropsFor(c.region, c.biome, c.lat, c.iso);
    const walled = WALLED_ISO.has(c.iso) || c.region === 'mediterranean';
    const barnless = BARNLESS.has(c.region);
    const houses = options.dwellings?.(c.style) ?? [{ item: 'gabled-house', weight: 1, footprint: 7.4 }];
    const house = rng.weighted(houses.map((entry) => ({ item: entry, weight: entry.weight })));
    const hx = barnless ? 12 : 20;
    const hz = barnless ? 11 : 15;

    // The yard first: if the house cannot stand, there is no farm.
    const houseAt = turn(c.x, c.z, yaw, barnless ? 0 : -9, 3);
    if (!free(houseAt.x, houseAt.z, house.footprint, BUILDING_GRADE)) return false;
    if (!free(c.x, c.z, Math.hypot(hx, hz) * 0.6, BUILDING_GRADE)) return false;
    put(plan, house.item, houseAt.x, houseAt.z, yaw, house.footprint, rng, 1, true);
    if (!barnless) {
      const barnAt = turn(c.x, c.z, yaw, 9.5, -2);
      tryPut(plan, 'barn', barnAt.x, barnAt.z, yaw - Math.PI / 2, rng, BUILDING_GRADE);
      if (SILOS.has(c.region) && rng.chance(0.7)) {
        const siloAt = turn(c.x, c.z, yaw, 14.5, 10.5);
        tryPut(plan, 'silo', siloAt.x, siloAt.z, 0, rng, BUILDING_GRADE);
      }
    }
    if (rng.chance(0.3)) {
      const t = turn(c.x, c.z, yaw, rng.range(-4, 4), -10);
      tryPut(plan, 'tractor', t.x, t.z, yaw + rng.range(-1, 1), rng, PROP_GRADE);
    }
    if ((WINDPUMPS.has(c.region) || WINDPUMP_ISO.has(c.iso)) && (c.biome === 'grassland' || c.biome === 'steppe' || c.biome === 'savanna') && rng.chance(0.55)) {
      const w = turn(c.x, c.z, yaw, -hx - 4, -hz + 2);
      tryPut(plan, 'windpump', w.x, w.z, windOf(c.lat, lonOf(up.x, up.z)), rng, BUILDING_GRADE);
    }
    // The yard's fence, with a gate in the front.
    if (!barnless || rng.chance(0.5)) {
      const kind = walled ? 'wall' : 'fence';
      const corner = (sx: number, sz: number): [number, number] => {
        const p = turn(c.x, c.z, yaw, sx * hx, sz * hz);
        return [p.x, p.z];
      };
      const [ax, az] = corner(-1, -1);
      const [bx, bz] = corner(1, -1);
      const [cx, cz] = corner(1, 1);
      const [dx, dz] = corner(-1, 1);
      const gate = turn(c.x, c.z, yaw, -3.5, hz);
      const gate2 = turn(c.x, c.z, yaw, 3.5, hz);
      const g1x = gate.x;
      const g1z = gate.z;
      fence(plan, kind, ax, az, bx, bz);
      fence(plan, kind, bx, bz, cx, cz);
      fence(plan, kind, cx, cz, gate2.x, gate2.z);
      fence(plan, kind, g1x, g1z, dx, dz);
      fence(plan, kind, dx, dz, ax, az);
    }
    claimed.push({ x: c.x, z: c.z, radius: Math.hypot(hx, hz), yaw, halfX: hx, halfZ: hz });

    // The fields, round the yard.
    const gap = 5;
    const slots: [number, number][] = [
      [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1],
    ];
    let fields = 0;
    const want = rng.between(2, 5);
    for (const [sx, sz] of slots) {
      if (fields >= want) break;
      const fx = rng.range(12, 22);
      const fz = rng.range(11, 20);
      const across = rng.chance(0.3);
      const halfX = across ? fz : fx;
      const halfZ = across ? fx : fz;
      const ox = sx * (hx + gap + fx);
      const oz = sz * (hz + gap + fz);
      const p = turn(c.x, c.z, yaw, ox, oz);
      const crop = rng.weighted(crops);
      const fieldYaw = yaw + (across ? Math.PI / 2 : 0);
      if (!addField(plan, crop, p.x, p.z, fieldYaw, halfX, halfZ)) continue;
      fields++;
      // Bales left in a field of straw.
      if ((crop === 'wheat' || crop === 'barley' || crop === 'millet') && rng.chance(0.55)) {
        const bales = rng.between(2, 5);
        for (let i = 0; i < bales; i++) {
          const b = turn(p.x, p.z, fieldYaw, rng.range(-0.7, 0.7) * halfX, rng.range(-0.7, 0.7) * halfZ);
          plan.pieces.push({
            part: 'hay-bale',
            scenic: false,
            variant: rng.int(COUNTRY_VARIANTS),
            at: dirAt(b.x, b.z, new THREE.Vector3()),
            yaw: rng.range(0, Math.PI * 2),
            scale: 1,
            footprint: COUNTRY_PARTS['hay-bale']!.footprint,
          });
        }
      }
      // A dry-stone wall down the far side of a field where walls are the way.
      if (walled && rng.chance(0.5)) {
        const a = turn(p.x, p.z, fieldYaw, -halfX - 1.5, -halfZ);
        const ax = a.x;
        const az = a.z;
        const b = turn(p.x, p.z, fieldYaw, -halfX - 1.5, halfZ);
        fence(plan, 'wall', ax, az, b.x, b.z);
      }
    }
    return true;
  }

  /** Rocks, a meadow in flower, a bench by the road, a fingerpost: each drawn in a fixed order. */
  function smallThings(plan: CountryPlan, rng: Rng, c: Context): void {
    const rockDraw = rng.unit();
    const rockX = rng.jitter() * c.halfEast * 0.8;
    const rockZ = rng.jitter() * c.halfNorth * 0.8;
    const meadowDraw = rng.unit();
    const meadowX = rng.jitter() * c.halfEast * 0.7;
    const meadowZ = rng.jitter() * c.halfNorth * 0.7;
    const meadowRadius = rng.range(18, 40);
    const petal = rng.int(5);
    const benchDraw = rng.unit();
    const signDraw = rng.unit();
    const side = rng.sign();
    const along = rng.range(-0.4, 0.4);

    const rocky: Partial<Record<BiomeId, number>> = { steppe: 0.4, savanna: 0.3, desert: 0.35, tundra: 0.45, rock: 0.5, grassland: 0.22, temperate: 0.12, boreal: 0.2 };
    if (rockDraw < (rocky[c.biome] ?? 0)) tryPut(plan, 'rocks', rockX, rockZ, rng.range(0, Math.PI * 2), rng, PROP_GRADE, rng.range(0.9, 1.6));

    const blooms: Partial<Record<BiomeId, number>> = { temperate: 0.35, grassland: 0.4, steppe: 0.15, boreal: 0.12, savanna: 0.1, tundra: 0.1 };
    if (meadowDraw < (blooms[c.biome] ?? 0) && inCell(meadowX, meadowZ, meadowRadius)) {
      plan.meadows.push({ at: dirAt(meadowX, meadowZ, new THREE.Vector3()), radius: meadowRadius, petal });
    }

    // By the road: the carriageway nearest the cell's middle, a little along it.
    const road = roadGap(0, 0);
    if (road.gap < Math.max(c.halfEast, c.halfNorth)) {
      const px = road.x + road.dx * along * c.halfNorth;
      const pz = road.z + road.dz * along * c.halfNorth;
      const near = roadGap(px, pz);
      const centreline = Math.hypot(px - near.x, pz - near.z);
      const clearance = centreline - near.gap;
      const nx = near.dz * side;
      const nz = -near.dx * side;
      const run = Math.atan2(near.dx, near.dz);
      const baseX = near.x;
      const baseZ = near.z;
      if (signDraw < 0.3) {
        // Boards along the part's X, so it faces across the road and points along it.
        tryPut(plan, 'signpost', baseX + nx * (clearance + 3), baseZ + nz * (clearance + 3), run + Math.PI / 2, rng, PROP_GRADE);
      } else if (benchDraw < 0.12) {
        // Its back to the road, looking out over the country.
        tryPut(plan, 'bench', baseX + nx * (clearance + 5), baseZ + nz * (clearance + 5), Math.atan2(nx, nz), rng, PROP_GRADE);
      }
    }
  }

  // --- the queries -----------------------------------------------------------

  const cellOf = (direction: THREE.Vector3): CountryPlan => planAt(latOf(direction.y), lonOf(direction.x, direction.z));
  function planAt(lat: number, lon: number): CountryPlan {
    const { row, column } = cellAt(lat, lon, 0);
    return plan(row, column);
  }
  /** A point in a field's own frame: across the rows and along them. */
  const fieldLocal = { x: 0, z: 0 };
  const fieldNorth = new THREE.Vector3();
  const fieldEast = new THREE.Vector3();
  function inField(field: CropField, direction: THREE.Vector3, margin: number): boolean {
    fieldNorth.set(0, 1, 0).projectOnPlane(field.at).normalize();
    fieldEast.crossVectors(field.at, fieldNorth).normalize();
    scratch.copy(direction).sub(field.at);
    const ex = scratch.dot(fieldEast) * PLANET_RADIUS;
    const nz = scratch.dot(fieldNorth) * PLANET_RADIUS;
    const c = Math.cos(field.yaw);
    const s = Math.sin(field.yaw);
    fieldLocal.x = ex * c - nz * s;
    fieldLocal.z = ex * s + nz * c;
    if (field.round) return (fieldLocal.x / (field.halfX + margin)) ** 2 + (fieldLocal.z / (field.halfZ + margin)) ** 2 <= 1;
    return Math.abs(fieldLocal.x) <= field.halfX + margin && Math.abs(fieldLocal.z) <= field.halfZ + margin;
  }

  const occupiedSeen: number[] = [];
  const occupiedPoint = new THREE.Vector3();
  /** A bench piece as somewhere to sit, made once a piece: the plans are cached, and so is this. */
  const benchOf = new WeakMap<CountryPiece, Bench>();
  const benchNorth = new THREE.Vector3();
  const benchAcross = new THREE.Vector3();
  function sittable(piece: CountryPiece, key: string): Bench {
    let bench = benchOf.get(piece);
    if (bench !== undefined) return bench;
    // The frame `countryside-tile.ts` stands a piece in: north, across (up x
    // north), up, spun by its yaw, which turns its +Z to this.
    benchNorth.set(0, 1, 0).projectOnPlane(piece.at);
    if (benchNorth.lengthSq() < 1e-8) benchNorth.set(1, 0, 0).projectOnPlane(piece.at);
    benchNorth.normalize();
    benchAcross.crossVectors(piece.at, benchNorth).normalize();
    const facing = benchAcross.multiplyScalar(Math.sin(piece.yaw)).addScaledVector(benchNorth, Math.cos(piece.yaw)).clone();
    const position = piece.at.clone().multiplyScalar(PLANET_RADIUS).addScaledVector(facing, BENCH_SIT_AHEAD * piece.scale);
    bench = { position, facing, sink: PIECE_BURY, key };
    benchOf.set(piece, bench);
    return bench;
  }

  return {
    stats,
    plan,
    has(row, column) {
      cellBounds(0, row, column, bounds);
      return plans.has(`${row}/${Math.round((bounds.west + 180) / bounds.dLon)}`);
    },
    planAt,
    fieldAt(direction) {
      const found = cellOf(direction);
      for (const field of found.fields) if (inField(field, direction, 0)) return field;
      return null;
    },
    meadowAt(direction) {
      const found = cellOf(direction);
      for (const meadow of found.meadows) {
        if (meadow.at.distanceTo(direction) * PLANET_RADIUS < meadow.radius) return meadow;
      }
      return null;
    },
    trodden(direction, spread = 0) {
      const found = cellOf(direction);
      let height = 1;
      for (const piece of found.pieces) {
        const wear = WORN[piece.part] ?? WORN_DEFAULT;
        if (wear.bare <= 0 && wear.worn <= 0) continue;
        const own = piece.scenic ? piece.footprint : (COUNTRY_PARTS[piece.part]?.footprint ?? piece.footprint) * piece.scale;
        const reach = Math.min(own * wear.bare + wear.worn, piece.footprint + CELL_MARGIN);
        const bare = Math.min(own * wear.bare + spread, reach);
        const distance = piece.at.distanceTo(direction) * PLANET_RADIUS;
        if (distance >= reach) continue;
        if (distance <= bare) return 0;
        const t = (distance - bare) / Math.max(reach - bare, 1e-6);
        height = Math.min(height, TRODDEN + (1 - TRODDEN) * t * t * (3 - 2 * t));
      }
      return height;
    },
    occupied(direction, radius) {
      const lat = latOf(direction.y);
      const lon = lonOf(direction.x, direction.z);
      // A plan stays inside its cell, so only the cells the disc touches can hold anything in it.
      const dLat = radius / UNITS_PER_DEGREE;
      const dLon = dLat / Math.max(Math.cos(lat * DEG), 0.05);
      const seen = occupiedSeen;
      seen.length = 0;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const { row, column } = cellAt(lat + a * dLat, lon + b * dLon, 0);
          const key = row * 100_000 + column;
          if (seen.includes(key)) continue;
          seen.push(key);
          const found = plan(row, column);
          for (const piece of found.pieces) {
            if (piece.at.distanceTo(direction) * PLANET_RADIUS < piece.footprint + radius) return true;
          }
          for (const field of found.fields) if (inField(field, direction, radius)) return true;
          for (const line of found.lines) {
            occupiedPoint.copy(line.from).lerp(line.to, 0.5).normalize();
            const half = line.from.distanceTo(line.to) * PLANET_RADIUS * 0.5;
            if (occupiedPoint.distanceTo(direction) * PLANET_RADIUS < half + radius + 1) return true;
          }
        }
      }
      return false;
    },
    benchesNear(direction, radius, out) {
      const lat = latOf(direction.y);
      const lon = lonOf(direction.x, direction.z);
      const dLat = radius / UNITS_PER_DEGREE;
      const dLon = dLat / Math.max(Math.cos(lat * DEG), 0.05);
      const seen = occupiedSeen;
      seen.length = 0;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const { row, column } = cellAt(lat + a * dLat, lon + b * dLon, 0);
          const key = row * 100_000 + column;
          if (seen.includes(key)) continue;
          seen.push(key);
          const found = plan(row, column);
          found.pieces.forEach((piece, index) => {
            if (piece.scenic || piece.part !== 'bench') return;
            if (piece.at.distanceTo(direction) * PLANET_RADIUS > radius + BENCH_SIT_AHEAD) return;
            out.push(sittable(piece, `bench:${found.key}:${index}`));
          });
        }
      }
    },
    reset() {
      plans.clear();
      lastPlan = null;
      indexTowns();
      stats.cached = 0;
    },
    find(kind, lat, lon, reach = 3) {
      const origin = unitAt(lat, lon, new THREE.Vector3());
      const { row } = cellAt(lat, lon, 0);
      const step = stepOf(0);
      const rings = Math.ceil(reach / step);
      const seen = new Set<string>();
      let best: { lat: number; lon: number; distance: number; region: string } | null = null;
      for (let ring = 0; ring <= rings && best === null; ring++) {
        for (let dr = -ring; dr <= ring; dr++) {
          const r = row + dr;
          if (r < 0 || r >= rowsOf(0)) continue;
          // A row's own columns: the cell count changes from one root band to the next.
          const rowLat = -90 + (r + 0.5) * step;
          const centre = cellAt(rowLat, lon, 0).column;
          cellBounds(0, r, centre, bounds);
          const spread = Math.ceil((ring * step) / Math.max(Math.cos(rowLat * DEG), 0.05) / bounds.dLon);
          for (let dc = -spread; dc <= spread; dc++) {
            cellBounds(0, r, centre + dc, bounds);
            const key = `${r}/${Math.round((bounds.west + 180) / bounds.dLon)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const found = plan(r, centre + dc);
            if (found.kind !== kind) continue;
            const at = found.pieces[0]?.at ?? found.fields[0]?.at;
            if (at === undefined) continue;
            const distance = at.distanceTo(origin) * PLANET_RADIUS;
            if (best === null || distance < best.distance) {
              best = { lat: Number(latOf(at.y).toFixed(4)), lon: Number(lonOf(at.x, at.z).toFixed(4)), distance: Math.round(distance), region: found.style.id };
            }
          }
        }
      }
      return best;
    },
  };
}
