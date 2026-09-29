import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { AVATAR_HEIGHT, PERSON_METRES } from '../stature.ts';
import { bedtimeByte } from '../lights.ts';
import { tone } from '../monuments/contract.ts';
import { BENCH_SEAT, sitAhead } from '../bench.ts';
import { GLASS_TONE, PROUD, STOREY } from './contract.ts';
import type { ModelFit, SceneryContext } from './contract.ts';
import type { Paint } from '../models.ts';
import { mergeMeshes } from '../merge.ts';
import { rngFrom } from './random.ts';
import type { Rng, Weighted } from './random.ts';
import { LINE_HALF, cellKey, pavementOf } from './ground.ts';
import { cellCentre, cellIndex } from './grid.ts';
import type { TownGrid } from './grid.ts';
import { flightAt } from './floor.ts';
import type { FloorField } from './floor.ts';
import { disc, yawed } from './solids.ts';
import type { Solid } from './solids.ts';

/**
 * What a near town's streets hold besides its buildings, its lamps and its
 * people: the dressing on the ground floors that face a street, the furniture
 * that stands along the building line, and the marks painted on the paving.
 *
 * **One buffer, merged into the town's**, because it is still and a still
 * thing merged costs no draw call (`settlements.ts`, *A merged mesh cannot
 * move*). Everything is written here straight into flat arrays, in the town's
 * own frame, rather than built as meshes and flattened: a city's dressing is a
 * few hundred small boxes, and a `THREE.Mesh` a box would be the whole of its
 * build time. So this file is its own tiny kit — `Sink` is a box, a quad, a
 * bar and a ring — and it keeps the kit's rules by hand: a flat face looks
 * the way its winding says (every face is emitted against an outward hint),
 * a piece standing proud of a wall steps off it, two colours never share a
 * plane, glass is `slate` toned and never black, and every matrix it writes
 * through is asserted to have a positive determinant.
 *
 * **Only a peopled town is dressed** (`PEOPLED_RANK`), which is the rank that
 * already rebuilds a town with its crowd, so a far town costs nothing extra.
 * Everything is a pure function of the town's seed, its square and what stands
 * on it, so every client builds the same street.
 *
 * Three families, and where each may stand is the whole of the design:
 *
 * - **On a façade** that faces a street: awnings and signs on a ground floor,
 *   flower boxes, shutters and air conditioners under and beside the windows
 *   above it. Found on the building's own geometry (`facadeOf`): its lit glass
 *   is its windows, the faces round them are its wall, so a flower box hangs
 *   under a window that is there. Nothing here touches the ground.
 * - **On the building line**, never on the pavement. A pavement is at most
 *   `SIDEWALK` (2.2) wide and a body is 1.44 across, and the crowd and the
 *   player walk it, so the furniture stands inside the plot's own rectangle —
 *   the slack beside a building fitted narrower than its cell, and the front
 *   of a cell with no building — backed onto the street it faces. A building's
 *   front is flush with its plot line (`fitIn`), so nothing here can stand in
 *   front of a door. What a body would walk into is a wall (`solids`); a pot,
 *   a chair, a bicycle rack and a bollard are walked through, as a shrub is.
 *   A café chair is sat on as a bench is, and a rack's slots are where the
 *   fleet stands its bicycles (`Anchor`).
 * - **On the paving**: tactile strips, the warning pads at a crossing,
 *   manhole covers and drains, as decals `DECAL_LIFT` over the floor, which
 *   no foot reads (`floorLiftAt` answers the field, not this) and no depth
 *   test confuses with it at a peopled town's range.
 *
 * What does not fit the town's allowance (`DressInput.budget`) is dropped,
 * nearest the edge first, and the town is not.
 */

/** Units a body-metre: what a person-sized thing is measured in. See `stature.ts`. */
const M = AVATAR_HEIGHT / PERSON_METRES;

/**
 * How far a painted mark stands over the paving, in units.
 *
 * Inside a town's frame a float steps by a ten-thousandth, so what decides it
 * is the depth buffer: a layer is about a thousandth of a unit at a hundred
 * units (*The street plan* in `docs/traps.md`) and grows with the square of
 * the distance, so 0.05 is five layers at 300 units, two at 500, and one at
 * 700, where the largest mark, a manhole 1.3 across, is under two pixels. A
 * foot cannot find it: the floor a foot stands on is `floorLiftAt`, which
 * never sees a decal.
 */
export const DECAL_LIFT = 0.05;

/**
 * How deep into a plot the building line's furniture may reach, in units, and
 * the share of the plot's depth it may take: a rack of bicycles nosed in from
 * the street is the deepest thing here, at 3.8.
 */
const FRONTAGE_DEPTH = 4;
const FRONTAGE_SHARE = 0.6;
/** How far the furniture keeps behind the plot line, so nothing overhangs the pavement. */
const LINE_BACK = 0.12;
/** How far apart two things on the building line stand, at least. */
const ITEM_GAP = 0.3;
/** How far anything keeps from a building, a bench or a parked car it is not part of. */
const CLEAR = 0.25;
/** The shares of a town's allowance the façades, then the façades and the building line, may spend. */
const FACADE_SHARE = 0.55;
const LINE_SHARE = 0.85;

/** Whether towns are dressed at all: the A/B, from the console or a check. */
let enabled = true;
export function setStreetDressing(on: boolean): void {
  enabled = on;
}
export function streetDressingEnabled(): boolean {
  return enabled;
}

/** What the dressing cost, over every town dressed since the last reset. */
export const dressingStats = {
  towns: 0,
  triangles: 0,
  items: 0,
  facades: 0,
  decals: 0,
  dropped: 0,
  ms: 0,
  /** The same, by phase: reading and dressing the fronts, the building line, the paint. */
  facadeMs: 0,
  lineMs: 0,
  paintMs: 0,
  reset(): void {
    this.towns = this.triangles = this.items = this.facades = this.decals = this.dropped = this.ms = 0;
    this.facadeMs = this.lineMs = this.paintMs = 0;
  },
};

// ---------------------------------------------------------------------------
// The input
// ---------------------------------------------------------------------------

/** A built variant as `settlements.ts` flattened it: what `facadeOf` reads. */
export interface FacadeSource {
  position: Float32Array;
  normal: Float32Array;
  glow: Uint8Array;
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  height: number;
}

/** One building facing a street: its variant, where it stands and its wall. */
export interface DressFront {
  flat: FacadeSource;
  /** Variant space to the town's frame: yaw, uniform scale, and the seat on its terrace. */
  matrix: THREE.Matrix4;
  solid: Solid;
  kind: string;
  /** A baked CC0 building (`RegionStyle.assets`), whose windows have no shutters of their own. */
  baked: boolean;
}

export interface DressInput {
  seed: string;
  /** `RegionStyle.id`. */
  region: string;
  /** The country, for the colour of its post boxes. */
  iso: string;
  /** `urbanityOf` the town's population, 0 to 1. */
  urbanity: number;
  grid: TownGrid;
  /** `streetBand` for the town's region. */
  band: number;
  /** Every paved cell's terrace, by `cellKey`: `Ground.terraces`. */
  levels: ReadonlyMap<number, number>;
  field: FloorField;
  /** The gates' mouths, which flare the street into the plots: kept clear. */
  mouths: readonly (readonly [number, number, number, number])[];
  fronts: readonly DressFront[];
  /** Everything that already stands as a wall: buildings, benches, parked cars. */
  solids: readonly Solid[];
  /** Round things in the way, as `x, z, radius` triples: lamps, lights, trees. */
  discs: readonly number[];
  /** Whether a landmark's ground reaches `(x, z)`. */
  blocked(x: number, z: number): boolean;
  /** The ground a building may take in a cell: `rectOf` for the one cell. */
  plotRect(col: number, row: number): { x0: number; x1: number; z0: number; z1: number };
  /** The paving at `(x, z)` on the terrace `level`, as a point of the town's frame, into `out`. */
  seat(x: number, z: number, level: number, out: number[]): void;
  /** The paving's distance from the planet's centre on the terrace `level`: a wall's base. */
  floorRadius(level: number): number;
  /** The most triangles the dressing may add. */
  budget: number;
  /** The region's carriageway colour (`GroundStyle.road`), which the ironwork on it is a darker tone of. */
  road: number;
  /** Where the CC0 pieces come from (`propModels`); null draws every piece in code. */
  models: PropModels | null;
}

export interface DressSeat {
  kind: string;
  /** The item's base on the paving, in the town's frame. */
  x: number;
  y: number;
  z: number;
  /** A decal's lift over the paving, which a seat check expects; 0 for what stands on it. */
  lift: number;
}

/**
 * Somewhere a piece offers: `'seat'`, a café chair's sitter's spot and the way
 * a sitter faces (what `Bench.position` and `Bench.facing` are); `'bike'`, a
 * rack's slot, the middle of where a bicycle stands and the way its front
 * points. On the paving, in the town's frame.
 */
export interface Anchor {
  kind: 'seat' | 'bike';
  x: number;
  y: number;
  z: number;
  fx: number;
  fz: number;
}

export interface Dressed {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  glow: Uint8Array;
  triangles: number;
  emits: boolean;
  solids: Solid[];
  seats: DressSeat[];
  /** The chairs' seats and the racks' slots. */
  anchors: Anchor[];
  counts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// The regions
// ---------------------------------------------------------------------------

type Furniture =
  | 'cafe'
  | 'rack'
  | 'vending'
  | 'bin'
  | 'planter'
  | 'pots'
  | 'stall'
  | 'newsbox'
  | 'hydrant';

interface DressStyle {
  /** Stripe pairs for awnings and parasols; a pair of one colour is a plain one. */
  fabrics: readonly (readonly [number, number])[];
  /** Sign boards. */
  signs: readonly number[];
  /** Signs that glow after dark, as a share of a window's byte: the neon regions. */
  signGlow: number;
  /** A projecting sign: none, a small square bracket sign, or a tall vertical board. */
  blade: 'none' | 'square' | 'tall';
  /** Chance a block's ground floor is a shop, and a two-storey house's in the centre. */
  shops: number;
  houseShops: number;
  /** Whether a house's shop hangs an awning, or only a sign: a machiya has its own eave. */
  houseAwnings: boolean;
  /** Chance an upper window gets a flower box, a baked building shutters, an upper window an air conditioner. */
  flowers: number;
  shutters: number;
  shutterColors: readonly number[];
  aircon: number;
  /** What stands on the building line, weighted. */
  furniture: readonly Weighted<Furniture>[];
  /** A parasol over a café table. */
  parasol: boolean;
  /** Guide strips along every pavement, and warning pads at every corner; else pads at the zebras only. */
  tactile: boolean;
  /** A kiosk and a street clock by the middle of a town. */
  kiosk: boolean;
  bins: readonly number[];
}

const P = PALETTE;

const EUROPE_FURNITURE: Weighted<Furniture>[] = [
  { item: 'cafe', weight: 2 },
  { item: 'rack', weight: 1.5 },
  { item: 'planter', weight: 2 },
  { item: 'bin', weight: 1.2 },
  { item: 'pots', weight: 1 },
];

const BASE: DressStyle = {
  fabrics: [[P.white, P.crimson], [P.cream, P.darkOlive]],
  signs: [P.darkOlive, P.crimson, P.bark, P.cream],
  signGlow: 0,
  blade: 'square',
  shops: 0.8,
  houseShops: 0.35,
  houseAwnings: true,
  flowers: 0,
  shutters: 0,
  shutterColors: [P.darkOlive],
  aircon: 0,
  furniture: EUROPE_FURNITURE,
  parasol: false,
  tactile: false,
  kiosk: false,
  bins: [P.darkOlive, P.steel],
};

/**
 * By region (`RegionStyle.id`). Every colour is a palette entry: the town's
 * one material reads vertex colours and the kit's rule is the palette.
 */
const STYLES: Record<string, DressStyle> = {
  nordic: {
    ...BASE,
    fabrics: [[P.white, P.steel], [P.white, P.crimson], [P.cream, P.cream]],
    flowers: 0.12,
    furniture: [
      { item: 'rack', weight: 3 },
      { item: 'planter', weight: 1.5 },
      { item: 'bin', weight: 1.2 },
      { item: 'cafe', weight: 1 },
    ],
  },
  'atlantic-europe': {
    ...BASE,
    fabrics: [[P.cream, P.darkOlive], [P.white, P.crimson], [P.cream, P.bark], [P.white, P.skyBlue]],
    flowers: 0.3,
    shutters: 0.35,
    shutterColors: [P.darkOlive, P.crimson, P.skyBlue, P.cream],
    parasol: false,
    kiosk: true,
  },
  'east-europe': {
    ...BASE,
    fabrics: [[P.cream, P.crimson], [P.white, P.darkOlive], [P.gold, P.gold]],
    flowers: 0.35,
    shutters: 0.45,
    shutterColors: [P.darkOlive, P.bark, P.brown],
    kiosk: true,
  },
  mediterranean: {
    ...BASE,
    fabrics: [[P.white, P.green], [P.white, P.crimson], [P.white, P.skyBlue], [P.cream, P.orange]],
    signs: [P.cream, P.darkOlive, P.skyBlue, P.bark],
    flowers: 0.45,
    shutters: 0.7,
    shutterColors: [P.darkOlive, P.skyBlue, P.brown, P.green],
    houseShops: 0.6,
    parasol: true,
    kiosk: true,
    furniture: [
      { item: 'cafe', weight: 3.5 },
      { item: 'pots', weight: 3 },
      { item: 'planter', weight: 1 },
      { item: 'bin', weight: 0.8 },
      { item: 'rack', weight: 0.3 },
    ],
  },
  maghreb: {
    ...BASE,
    fabrics: [[P.cream, P.clay], [P.sand, P.brown], [P.cream, P.orange], [P.skyBlue, P.cream]],
    signs: [P.skyBlue, P.cream, P.clay, P.darkOlive],
    blade: 'none',
    houseShops: 0.55,
    flowers: 0.1,
    parasol: true,
    furniture: [
      { item: 'stall', weight: 2.5 },
      { item: 'pots', weight: 2 },
      { item: 'cafe', weight: 1.2 },
    ],
    bins: [P.darkOlive],
  },
  'middle-east': {
    ...BASE,
    fabrics: [[P.cream, P.clay], [P.white, P.darkOlive], [P.sand, P.sand]],
    signs: [P.cream, P.darkOlive, P.crimson, P.skyBlue],
    blade: 'none',
    houseShops: 0.45,
    aircon: 0.35,
    furniture: [
      { item: 'stall', weight: 1.8 },
      { item: 'pots', weight: 1.2 },
      { item: 'cafe', weight: 1 },
      { item: 'bin', weight: 0.6 },
    ],
  },
  'sub-saharan': {
    ...BASE,
    fabrics: [[P.gold, P.green], [P.orange, P.cream], [P.skyBlue, P.white]],
    signs: [P.gold, P.skyBlue, P.crimson, P.green],
    blade: 'none',
    houseShops: 0.5,
    furniture: [
      { item: 'stall', weight: 3 },
      { item: 'pots', weight: 0.6 },
    ],
    bins: [P.darkOlive],
  },
  'south-asia': {
    ...BASE,
    fabrics: [[P.orange, P.gold], [P.pink, P.cream], [P.crimson, P.gold], [P.skyBlue, P.white]],
    signs: [P.gold, P.crimson, P.skyBlue, P.cream, P.green],
    signGlow: 0.5,
    blade: 'tall',
    houseShops: 0.65,
    aircon: 0.3,
    tactile: true,
    furniture: [
      { item: 'stall', weight: 3 },
      { item: 'pots', weight: 1 },
      { item: 'bin', weight: 0.4 },
    ],
    bins: [P.darkOlive, P.skyBlue],
  },
  'east-asia': {
    ...BASE,
    fabrics: [[P.skyBlue, P.white], [P.crimson, P.white], [P.darkOlive, P.darkOlive], [P.bark, P.bark]],
    signs: [P.crimson, P.white, P.gold, P.skyBlue, P.bark],
    signGlow: 0.6,
    blade: 'tall',
    houseShops: 0.6,
    houseAwnings: false,
    aircon: 0.4,
    tactile: true,
    furniture: [
      { item: 'vending', weight: 3 },
      { item: 'rack', weight: 2.5 },
      { item: 'pots', weight: 2.2 },
      { item: 'bin', weight: 0.5 },
    ],
    bins: [P.skyBlue, P.steel],
  },
  'southeast-asia': {
    ...BASE,
    fabrics: [[P.skyBlue, P.white], [P.orange, P.cream], [P.red, P.cream], [P.green, P.green]],
    signs: [P.crimson, P.gold, P.skyBlue, P.white],
    signGlow: 0.45,
    blade: 'tall',
    houseShops: 0.6,
    aircon: 0.3,
    furniture: [
      { item: 'stall', weight: 2.5 },
      { item: 'pots', weight: 2 },
      { item: 'vending', weight: 0.4 },
      { item: 'bin', weight: 0.4 },
    ],
  },
  'north-america': {
    ...BASE,
    fabrics: [[P.crimson, P.white], [P.darkOlive, P.cream], [P.bark, P.cream], [P.skyBlue, P.skyBlue]],
    signs: [P.crimson, P.cream, P.darkOlive, P.skyBlue, P.bark],
    signGlow: 0.35,
    furniture: [
      { item: 'bin', weight: 1.5 },
      { item: 'planter', weight: 1.5 },
      { item: 'newsbox', weight: 1.2 },
      { item: 'hydrant', weight: 1.4 },
      { item: 'cafe', weight: 1 },
      { item: 'rack', weight: 0.5 },
    ],
  },
  'latin-america': {
    ...BASE,
    fabrics: [[P.gold, P.crimson], [P.green, P.white], [P.orange, P.cream], [P.skyBlue, P.white], [P.pink, P.cream]],
    signs: [P.gold, P.skyBlue, P.crimson, P.green, P.cream],
    houseShops: 0.65,
    flowers: 0.25,
    shutters: 0.35,
    shutterColors: [P.crimson, P.skyBlue, P.green, P.bark],
    parasol: true,
    furniture: [
      { item: 'cafe', weight: 1.6 },
      { item: 'stall', weight: 1.6 },
      { item: 'pots', weight: 2 },
      { item: 'planter', weight: 0.8 },
    ],
  },
  oceania: {
    ...BASE,
    fabrics: [[P.darkOlive, P.cream], [P.crimson, P.white], [P.skyBlue, P.white]],
    furniture: [
      { item: 'cafe', weight: 1.6 },
      { item: 'planter', weight: 1.5 },
      { item: 'rack', weight: 1 },
      { item: 'bin', weight: 1 },
    ],
  },
  polar: {
    ...BASE,
    fabrics: [[P.crimson, P.white]],
    furniture: [
      { item: 'bin', weight: 1 },
      { item: 'planter', weight: 0.4 },
    ],
  },
};

/**
 * Post boxes in the country's own colour where it has one this palette can
 * say: red (the pillar boxes of Britain, Japan, India), yellow (Spain,
 * Germany, France), blue (the United States, Russia), green (Ireland, China).
 */
const POST_COLOURS: Record<string, number> = {
  GBR: P.red, JPN: P.red, IND: P.red, CAN: P.red, AUS: P.red, NZL: P.red, PRT: P.red, ITA: P.red,
  NOR: P.red, DNK: P.red, BEL: P.red, POL: P.red, KOR: P.red, ZAF: P.red, MYS: P.red, SGP: P.red,
  PAK: P.red, LKA: P.red, BGD: P.red, MLT: P.red, CYP: P.gold, ARG: P.red, MEX: P.red, CHL: P.red,
  ESP: P.gold, DEU: P.gold, FRA: P.gold, CHE: P.gold, AUT: P.gold, SWE: P.gold, FIN: P.gold, GRC: P.gold,
  TUR: P.gold, BRA: P.gold, CZE: P.orange, NLD: P.orange, HUN: P.crimson, ROU: P.gold,
  USA: P.skyBlue, RUS: P.skyBlue, UKR: P.skyBlue, BLR: P.skyBlue, PHL: P.crimson,
  IRL: P.green, CHN: P.green, HKG: P.green, TWN: P.green,
};

/** The shape a country's post box has; `'post'`, a box on a post, where it is not named. */
const POST_SHAPES: Record<string, 'pillar' | 'collection' | 'cabinet'> = {
  GBR: 'pillar', IRL: 'pillar', MLT: 'pillar', CYP: 'pillar', IND: 'pillar', PAK: 'pillar', LKA: 'pillar', BGD: 'pillar',
  MYS: 'pillar', SGP: 'pillar', HKG: 'pillar', NZL: 'pillar', ZAF: 'pillar',
  USA: 'collection', CAN: 'collection', MEX: 'collection', PHL: 'collection',
  JPN: 'cabinet', KOR: 'cabinet', CHN: 'cabinet', TWN: 'cabinet', THA: 'cabinet', VNM: 'cabinet',
};

const FLOWERS = [P.red, P.pink, P.white, P.crimson, P.violet, P.gold, P.salmon] as const;
const PRODUCE = [P.orange, P.red, P.green, P.gold, P.olive, P.apricot, P.crimson] as const;

// ---------------------------------------------------------------------------
// The sink: this file's kit
// ---------------------------------------------------------------------------

class Sink {
  readonly position: number[] = [];
  /** The seats and rack slots written so far, in the frame `place` takes things into. */
  readonly anchors: Anchor[] = [];
  readonly normal: number[] = [];
  readonly color: number[] = [];
  readonly glow: number[] = [];
  /** The current transform, column-major as Three's, and one over its scale. */
  private readonly e = new Float64Array(16);
  private inverseScale = 1;
  private readonly paintColor = new THREE.Color();
  private lit = 0;
  private bed = 0;

  constructor() {
    this.e[0] = this.e[5] = this.e[10] = this.e[15] = 1;
  }

  get triangles(): number {
    return this.position.length / 9;
  }

  /**
   * Everything after this is written through `matrix`. **Asserted proper**: a
   * reflection flips every face this file winds by hand, and the town's one
   * material would draw each one inside out.
   */
  place(matrix: THREE.Matrix4): void {
    const det = matrix.determinant();
    if (!(det > 0)) throw new Error(`street-dressing: a transform with determinant ${det}`);
    const m = matrix.elements;
    for (let i = 0; i < 16; i++) this.e[i] = m[i]!;
    const scale = Math.hypot(m[0]!, m[1]!, m[2]!);
    this.inverseScale = scale === 0 ? 0 : 1 / scale;
  }

  /**
   * A place something else goes, at `(x, z)` on the piece's floor facing
   * `(fx, fz)`, carried into the current frame: a café chair's sitter's spot
   * (`bench.ts`) or a rack's slot for a bicycle (`BikeSlot` in `settlements.ts`).
   */
  anchor(kind: Anchor['kind'], x: number, z: number, fx: number, fz: number): void {
    const e = this.e;
    const k = this.inverseScale;
    const dx = (e[0]! * fx + e[8]! * fz) * k;
    const dz = (e[2]! * fx + e[10]! * fz) * k;
    const length = Math.hypot(dx, dz) || 1;
    this.anchors.push({
      kind,
      x: e[0]! * x + e[8]! * z + e[12]!,
      y: e[1]! * x + e[9]! * z + e[13]!,
      z: e[2]! * x + e[10]! * z + e[14]!,
      fx: dx / length,
      fz: dz / length,
    });
  }

  /** The colour everything after this is painted in, and how it glows after dark (0 to 1). */
  paint(hex: number, glow = 0): void {
    this.paintColor.setHex(hex);
    this.lit = Math.round(Math.max(0, Math.min(1, glow)) * 255);
    // A sign burns all night, as a lamp does: it is a shop's and not a household's.
    this.bed = this.lit > 0 ? bedtimeByte(0, true) : 0;
  }

  /** Where a mark would roll back to: see `rollback`. */
  mark(): number {
    return this.position.length;
  }

  rollback(mark: number): void {
    this.position.length = mark;
    this.normal.length = mark;
    this.color.length = mark;
    this.glow.length = (mark / 3) * 2;
  }

  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    const e = this.e;
    this.position.push(
      e[0]! * x + e[4]! * y + e[8]! * z + e[12]!,
      e[1]! * x + e[5]! * y + e[9]! * z + e[13]!,
      e[2]! * x + e[6]! * y + e[10]! * z + e[14]!,
    );
    const k = this.inverseScale;
    this.normal.push(
      (e[0]! * nx + e[4]! * ny + e[8]! * nz) * k,
      (e[1]! * nx + e[5]! * ny + e[9]! * nz) * k,
      (e[2]! * nx + e[6]! * ny + e[10]! * nz) * k,
    );
    this.color.push(this.paintColor.r, this.paintColor.g, this.paintColor.b);
    this.glow.push(this.lit, this.bed);
  }

  /**
   * One triangle, wound so its face looks along `(hx, hy, hz)`: the hint is
   * the outside, and a triangle that came out facing in is turned round
   * rather than trusted.
   */
  tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    hx: number, hy: number, hz: number,
  ): void {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-12) return;
    nx /= length;
    ny /= length;
    nz /= length;
    if (nx * hx + ny * hy + nz * hz < 0) {
      this.vertex(ax, ay, az, -nx, -ny, -nz);
      this.vertex(cx, cy, cz, -nx, -ny, -nz);
      this.vertex(bx, by, bz, -nx, -ny, -nz);
    } else {
      this.vertex(ax, ay, az, nx, ny, nz);
      this.vertex(bx, by, bz, nx, ny, nz);
      this.vertex(cx, cy, cz, nx, ny, nz);
    }
  }

  /** A quad `a b c d` (in order round it), facing along the hint. */
  quad(q: readonly number[], hx: number, hy: number, hz: number): void {
    this.tri(q[0]!, q[1]!, q[2]!, q[3]!, q[4]!, q[5]!, q[6]!, q[7]!, q[8]!, hx, hy, hz);
    this.tri(q[0]!, q[1]!, q[2]!, q[6]!, q[7]!, q[8]!, q[9]!, q[10]!, q[11]!, hx, hy, hz);
  }

  /** The same quad seen from both sides: a sheet of fabric, a sign's face on a blade. */
  sheet(q: readonly number[], hx: number, hy: number, hz: number): void {
    this.quad(q, hx, hy, hz);
    this.quad(q, -hx, -hy, -hz);
  }

  /**
   * An axis-aligned box from `x0..x1`, `y0..y1`, `z0..z1`. `skip` names the
   * faces nobody sees — `'b'` the back (-z, against a wall), `'d'` the
   * bottom (on the ground) — so a box against a wall is five faces, and one
   * standing on the paving is five more of them.
   */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, skip = ''): void {
    if (!skip.includes('f')) this.quad([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], 0, 0, 1);
    if (!skip.includes('b')) this.quad([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], 0, 0, -1);
    if (!skip.includes('r')) this.quad([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], 1, 0, 0);
    if (!skip.includes('l')) this.quad([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], -1, 0, 0);
    if (!skip.includes('u')) this.quad([x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], 0, 1, 0);
    if (!skip.includes('d')) this.quad([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], 0, -1, 0);
  }

  /** A box centred on `(x, z)` standing on `y`: the kit's `ctx.box`. */
  post(x: number, z: number, width: number, depth: number, y: number, height: number, skip = 'd'): void {
    this.box(x - width / 2, x + width / 2, y, y + height, z - depth / 2, z + depth / 2, skip);
  }

  /**
   * A square bar from `a` to `b`, `t` thick, its four sides and no ends: a
   * bicycle's tube, a rack's hoop, a bracket.
   */
  bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number): void {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-9) return;
    const fx = dx / length, fy = dy / length, fz = dz / length;
    // Any vector off the axis, then two perpendiculars.
    let ox = 0, oy = 1, oz = 0;
    if (Math.abs(fy) > 0.9) {
      ox = 1;
      oy = 0;
    }
    let sx = fy * oz - fz * oy, sy = fz * ox - fx * oz, sz = fx * oy - fy * ox;
    const sl = Math.hypot(sx, sy, sz);
    sx /= sl;
    sy /= sl;
    sz /= sl;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    const h = t / 2;
    const corners = [
      [sx + ux, sy + uy, sz + uz],
      [-sx + ux, -sy + uy, -sz + uz],
      [-sx - ux, -sy - uy, -sz - uz],
      [sx - ux, sy - uy, sz - uz],
    ] as const;
    for (let i = 0; i < 4; i++) {
      const p = corners[i]!;
      const q = corners[(i + 1) % 4]!;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, mz = (p[2] + q[2]) / 2;
      this.quad([
        ax + p[0] * h, ay + p[1] * h, az + p[2] * h,
        ax + q[0] * h, ay + q[1] * h, az + q[2] * h,
        bx + q[0] * h, by + q[1] * h, bz + q[2] * h,
        bx + p[0] * h, by + p[1] * h, bz + p[2] * h,
      ], mx, my, mz);
    }
  }

  /**
   * A flat ring in the plane `x = x0`, centred at `(cy, cz)`, both faces: a
   * wheel seen from the side, which is all a parked bicycle shows.
   */
  wheel(x0: number, cy: number, cz: number, outer: number, inner: number, sides = 8): void {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const b = ((i + 1) / sides) * Math.PI * 2;
      const q = [
        x0, cy + Math.sin(a) * inner, cz + Math.cos(a) * inner,
        x0, cy + Math.sin(a) * outer, cz + Math.cos(a) * outer,
        x0, cy + Math.sin(b) * outer, cz + Math.cos(b) * outer,
        x0, cy + Math.sin(b) * inner, cz + Math.cos(b) * inner,
      ];
      this.sheet(q, 1, 0, 0);
    }
  }

  /** A flat polygon on `y`, centred at `(x, z)`, facing up: a decal, a table top. */
  disc(x: number, z: number, y: number, radius: number, sides = 8, turn = Math.PI / 8): void {
    for (let i = 0; i < sides; i++) {
      const a = turn + (i / sides) * Math.PI * 2;
      const b = turn + ((i + 1) / sides) * Math.PI * 2;
      this.tri(x, y, z, x + Math.cos(a) * radius, y, z + Math.sin(a) * radius, x + Math.cos(b) * radius, y, z + Math.sin(b) * radius, 0, 1, 0);
    }
  }

  /**
   * A solid of revolution about the vertical through `(cx, cz)`: `profile` is
   * `[radius, y]` pairs from the middle of its foot round to the middle of its
   * top, so a closed solid starts and ends at radius 0. Faceted, `sides`
   * flat faces round and one a step of the profile, and turned so a face and
   * not an edge looks down +Z, where a slot or a label goes. `squash` narrows
   * it along z.
   */
  lathe(cx: number, cz: number, profile: readonly (readonly [number, number])[], sides: number, squash = 1): void {
    const step = (Math.PI * 2) / sides;
    const start = Math.PI / 2 - step / 2;
    for (let j = 0; j + 1 < profile.length; j++) {
      const [r0, y0] = profile[j]!;
      const [r1, y1] = profile[j + 1]!;
      const dy = y1 - y0;
      const dr = r1 - r0;
      for (let i = 0; i < sides; i++) {
        const a = start + i * step;
        const b = a + step;
        const m = a + step / 2;
        const ca = Math.cos(a), sa = Math.sin(a) * squash, cb = Math.cos(b), sb = Math.sin(b) * squash;
        this.quad(
          [cx + r0 * ca, y0, cz + r0 * sa, cx + r0 * cb, y0, cz + r0 * sb, cx + r1 * cb, y1, cz + r1 * sb, cx + r1 * ca, y1, cz + r1 * sa],
          Math.cos(m) * dy, -dr, Math.sin(m) * dy,
        );
      }
    }
  }

  /**
   * An upright prism: the convex outline `poly` (`[x, z]` pairs round it)
   * from `y0` to `y1`, its sides and a lid and a floor fanned from its middle.
   * `skip` leaves out the lid (`'u'`) or the floor (`'d'`).
   */
  prism(poly: readonly (readonly [number, number])[], y0: number, y1: number, skip = ''): void {
    let cx = 0;
    let cz = 0;
    for (const [x, z] of poly) {
      cx += x;
      cz += z;
    }
    cx /= poly.length;
    cz /= poly.length;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i]!;
      const [bx, bz] = poly[(i + 1) % poly.length]!;
      this.quad([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az], (ax + bx) / 2 - cx, 0, (az + bz) / 2 - cz);
      if (!skip.includes('u')) this.tri(cx, y1, cz, ax, y1, az, bx, y1, bz, 0, 1, 0);
      if (!skip.includes('d')) this.tri(cx, y0, cz, ax, y0, az, bx, y0, bz, 0, -1, 0);
    }
  }

  /**
   * The same along z: the convex outline `poly` (`[x, y]` pairs round it)
   * from `z0` to `z1`, the front (`'f'`) and back (`'b'`) fanned. What an
   * arched lid, a clock's drum or a rounded cabinet top is.
   */
  slab(poly: readonly (readonly [number, number])[], z0: number, z1: number, skip = ''): void {
    let cx = 0;
    let cy = 0;
    for (const [x, y] of poly) {
      cx += x;
      cy += y;
    }
    cx /= poly.length;
    cy /= poly.length;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i]!;
      const [bx, by] = poly[(i + 1) % poly.length]!;
      this.quad([ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z1], (ax + bx) / 2 - cx, (ay + by) / 2 - cy, 0);
      if (!skip.includes('f')) this.tri(cx, cy, z1, ax, ay, z1, bx, by, z1, 0, 0, 1);
      if (!skip.includes('b')) this.tri(cx, cy, z0, ax, ay, z0, bx, by, z0, 0, 0, -1);
    }
  }

  /** A lump of leaves or a heap of fruit: a faceted ball `r` round and `h` tall, standing on `y`. */
  lump(x: number, y: number, z: number, r: number, h: number, sides = 6): void {
    this.lathe(x, z, [[0, y], [r * 0.82, y + h * 0.22], [r, y + h * 0.55], [r * 0.58, y + h * 0.88], [0, y + h]], sides);
  }

  /** A baked model's arrays, in the colours it was painted, through the current transform. */
  model(arrays: ModelArrays): void {
    const e = this.e;
    const k = this.inverseScale;
    const p = arrays.position;
    const n = arrays.normal;
    const c = arrays.color;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
      const nx = n[i]!, ny = n[i + 1]!, nz = n[i + 2]!;
      this.position.push(e[0]! * x + e[4]! * y + e[8]! * z + e[12]!, e[1]! * x + e[5]! * y + e[9]! * z + e[13]!, e[2]! * x + e[6]! * y + e[10]! * z + e[14]!);
      this.normal.push((e[0]! * nx + e[4]! * ny + e[8]! * nz) * k, (e[1]! * nx + e[5]! * ny + e[9]! * nz) * k, (e[2]! * nx + e[6]! * ny + e[10]! * nz) * k);
      this.color.push(c[i]!, c[i + 1]!, c[i + 2]!);
      this.glow.push(0, 0);
    }
  }
}

/** A rectangle `x0..x1` by `z0..z1` with its corners cut round in `segments` steps of radius `r`, as `[x, z]` pairs. */
function rounded(x0: number, x1: number, z0: number, z1: number, r: number, segments = 2): [number, number][] {
  const out: [number, number][] = [];
  const corners: [number, number, number][] = [[x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI], [x1 - r, z0 + r, Math.PI * 1.5]];
  for (const [cx, cz, from] of corners) {
    for (let s = 0; s <= segments; s++) {
      const a = from + (s / segments) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return out;
}

/** A cabinet's outline seen from the front: `x0..x1` wide, straight up to `y1` and arched over it by `rise`. */
function arched(x0: number, x1: number, y0: number, y1: number, rise: number, segments = 5): [number, number][] {
  const out: [number, number][] = [[x0, y0], [x1, y0]];
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const a = t * Math.PI;
    out.push([x1 - (x1 - x0) * t, y1 + Math.sin(a) * rise]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading a façade off the building
// ---------------------------------------------------------------------------

/** One window on a building's front, in the variant's own space. */
interface Window {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** The glass's plane, and the face in front of which anything hung on the wall must stand. */
  z: number;
  wall: number;
}

interface Facade {
  front: number;
  windows: Window[];
  /** The top of the ground floor's openings, or a storey's worth where none was found. */
  groundTop: number;
  /** The ground floor's openings, which the shop's awnings go over. */
  ground: Window[];
  /** The upper floors' windows. */
  upper: Window[];
  /** The front wall across its ground floor: its plane and its reach along x. */
  wall: number;
  minX: number;
  maxX: number;
}

const facades = new WeakMap<FacadeSource, Facade>();

/**
 * A variant's front: its windows and its wall, read off its own triangles.
 *
 * **A window is glass, and glass is what the town lights after dark**: every
 * lit mesh and every patch a painted building numbers as a window carries a
 * brightness or a bedtime byte (`flatten`'s `roll`), and nothing else does.
 * So the front-facing triangles with either byte set, gathered into patches
 * that touch, are the building's windows — a code-built casement's two panes
 * one window, a City Kit shopfront one — and the front-facing triangles
 * without, round each of them, are the wall it sits in. The same variant is
 * read once and kept.
 */
export function facadeOf(flat: FacadeSource): Facade {
  const known = facades.get(flat);
  if (known !== undefined) return known;
  const p = flat.position;
  const n = flat.normal;
  const g = flat.glow;
  const front = flat.box.maxZ;
  interface Patch {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    z: number;
    /** Its area seen from the front. */
    area: number;
  }
  const glass: Patch[] = [];
  const walls: Patch[] = [];
  for (let t = 0; t + 8 < p.length; t += 9) {
    const v = t / 3;
    const nz = (n[t + 2]! + n[t + 5]! + n[t + 8]!) / 3;
    if (nz < 0.8) continue;
    const patch: Patch = {
      x0: Math.min(p[t]!, p[t + 3]!, p[t + 6]!),
      x1: Math.max(p[t]!, p[t + 3]!, p[t + 6]!),
      y0: Math.min(p[t + 1]!, p[t + 4]!, p[t + 7]!),
      y1: Math.max(p[t + 1]!, p[t + 4]!, p[t + 7]!),
      z: (p[t + 2]! + p[t + 5]! + p[t + 8]!) / 3,
      area: Math.abs((p[t + 3]! - p[t]!) * (p[t + 7]! - p[t + 1]!) - (p[t + 6]! - p[t]!) * (p[t + 4]! - p[t + 1]!)) / 2,
    };
    if (patch.z < front - 2) continue;
    let lit = false;
    for (let k = 0; k < 3; k++) {
      if (g[(v + k) * 2]! > 0 || g[(v + k) * 2 + 1]! > 0) lit = true;
    }
    (lit ? glass : walls).push(patch);
  }
  // Patches of glass that touch are one window. Few enough a building that
  // the square join is nothing.
  const JOIN = 0.14;
  const windows: Patch[] = [];
  for (const piece of glass) {
    let into: Patch | null = null;
    for (const window of windows) {
      if (
        piece.x0 <= window.x1 + JOIN && piece.x1 >= window.x0 - JOIN &&
        piece.y0 <= window.y1 + JOIN && piece.y1 >= window.y0 - JOIN &&
        Math.abs(piece.z - window.z) < 0.3
      ) {
        into = window;
        break;
      }
    }
    if (into === null) windows.push({ ...piece });
    else {
      into.x0 = Math.min(into.x0, piece.x0);
      into.x1 = Math.max(into.x1, piece.x1);
      into.y0 = Math.min(into.y0, piece.y0);
      into.y1 = Math.max(into.y1, piece.y1);
      into.z = Math.max(into.z, piece.z);
    }
  }
  const found: Window[] = [];
  for (const w of windows) {
    if (w.z < front - 1.2 || w.x1 - w.x0 < 0.35 || w.y1 - w.y0 < 0.35) continue;
    // The wall: the frontmost face round the window, within a hand of its glass.
    let wall = w.z;
    for (const face of walls) {
      if (face.x1 < w.x0 - 0.7 || face.x0 > w.x1 + 0.7 || face.y1 < w.y0 - 0.4 || face.y0 > w.y1 + 0.4) continue;
      if (face.z < w.z - 0.6 || face.z > w.z + 0.35) continue;
      wall = Math.max(wall, face.z);
    }
    found.push({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, z: w.z, wall });
  }
  found.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lowest = found.length > 0 ? found[0]!.y0 : Infinity;
  const ground = found.filter((w) => w.y0 < Math.min(STOREY * 0.7, lowest + 0.5));
  const groundTop = ground.length > 0 ? Math.max(...ground.map((w) => w.y1)) : STOREY * 0.8;
  // A curtain wall's glass runs floors together, and nothing hangs under it.
  const upper = found.filter((w) => !ground.includes(w) && w.y0 > groundTop - 0.05 && w.y0 > 1.5 && w.y1 - w.y0 < 1.6 * STOREY);
  // The ground floor's wall: the plane most of the front's area across the
  // band a shop's awning hangs in is in — not the frontmost face, which on a
  // house is its porch or its doorstep and would hang an awning in the air —
  // and how far along the front that plane reaches.
  const byDepth = new Map<number, number>();
  for (const face of walls) {
    if (face.y1 < 0.3 || face.y0 > groundTop + 0.6 || face.z < front - 1.5) continue;
    const bucket = Math.round(face.z / 0.05);
    byDepth.set(bucket, (byDepth.get(bucket) ?? 0) + face.area);
  }
  let wall = front;
  let most = 0;
  for (const [bucket, area] of byDepth) {
    if (area > most || (area === most && bucket * 0.05 > wall)) {
      most = area;
      wall = bucket * 0.05;
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  for (const face of walls) {
    if (face.y1 < 0.3 || face.y0 > groundTop + 0.6 || Math.abs(face.z - wall) > 0.06) continue;
    wall = Math.max(wall, face.z);
    minX = Math.min(minX, face.x0);
    maxX = Math.max(maxX, face.x1);
  }
  if (minX > maxX) {
    minX = flat.box.minX;
    maxX = flat.box.maxX;
  }
  const facade: Facade = { front, windows: found, groundTop, ground, upper, wall, minX, maxX };
  facades.set(flat, facade);
  return facade;
}

// ---------------------------------------------------------------------------
// The pieces: each in its own space, +Z to the street, standing on y = 0
// ---------------------------------------------------------------------------

/**
 * **What a piece is modelled to, and why the numbers are fractions of a body.**
 * A piece is read at five metres by the body standing next to it, so each is
 * sized against `AVATAR_HEIGHT` (`H`) rather than in metres: a post box is
 * waist-to-chest, a bin about the hip, a vending machine a head over the
 * crown, a café table at the hand. What a piece spends its triangles on is
 * the kit's rule turned small: a separate base, body and lid, a chamfer or a
 * few facets where the thing is round, insets and slots stepped proud of the
 * face they are on, and two or three tones of one colour for its bands, so
 * nothing is two boxes.
 */
const H = AVATAR_HEIGHT;

/** A baked model as flat arrays in its own space, painted: what `Sink.model` draws. */
export interface ModelArrays {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  triangles: number;
}

/**
 * Where the pieces a CC0 model is better at come from: a model of the kit
 * (`scripts/build-kit.ts`, `buildings/kit.bin`) fitted, painted and merged,
 * or null while the kit is not registered, when the code piece stands in.
 */
export interface PropModels {
  get(id: string, fit: ModelFit, paint: Paint, key: string): ModelArrays | null;
}

/**
 * The models, fitted and merged once a paint and kept: a town's forty
 * planters are one merge. `fitted` throws for a model the kit does not have
 * or before the kit is registered, and that is the code piece for now, not a
 * town lost.
 */
export function propModels(ctx: SceneryContext): PropModels {
  const cache = new Map<string, ModelArrays | null>();
  return {
    get(id, fit, paint, key) {
      const known = cache.get(`${id}|${key}`);
      if (known !== undefined) return known;
      let arrays: ModelArrays | null = null;
      try {
        const group = ctx.fitted(id, fit, paint);
        group.updateMatrixWorld(true);
        const merged = mergeMeshes(group);
        arrays = { position: merged.position, normal: merged.normal, color: merged.color, triangles: merged.triangles };
      } catch {
        // Not kept: the kit may be registered by the next town.
        return null;
      }
      cache.set(`${id}|${key}`, arrays);
      return arrays;
    },
  };
}

/** How light a colour is, 0 to 1: which of a model's slots is its soil and which its stone. */
const lightness = (color: THREE.Color): number => Math.max(color.r, color.g, color.b);
const greenest = (color: THREE.Color): boolean => color.g > color.r * 1.15 && color.g > color.b;

/**
 * An awning: a striped sheet from the wall at `top` down to `top - drop` at
 * `reach` out, a scalloped valance off its front edge, the roller it winds on
 * along the wall and two folding arms under it. Two stripes a body-metre,
 * each a sheet over and under, and no sides — it is fabric.
 */
function awning(sink: Sink, x0: number, x1: number, wall: number, top: number, reach: number, drop: number, valance: number, fabric: readonly [number, number]): void {
  const stripes = Math.max(2, Math.round((x1 - x0) / (0.5 * M)));
  const step = (x1 - x0) / stripes;
  const back = wall + 0.1;
  const out = wall + reach;
  const low = top - drop;
  for (let i = 0; i < stripes; i++) {
    sink.paint(fabric[i % 2]!);
    const a = x0 + i * step;
    const b = a + step;
    // The slope's normal leans out and up.
    sink.sheet([a, top, back, b, top, back, b, low, out, a, low, out], 0, reach, drop);
    // The valance: a straight band and a point hanging from its middle.
    const m = (a + b) / 2;
    sink.sheet([a, low, out, b, low, out, b, low - valance * 0.6, out, a, low - valance * 0.6, out], 0, 0, 1);
    sink.tri(a, low - valance * 0.6, out, b, low - valance * 0.6, out, m, low - valance, out, 0, 0, 1);
    sink.tri(a, low - valance * 0.6, out, b, low - valance * 0.6, out, m, low - valance, out, 0, 0, -1);
  }
  // The roller box on the wall, and the arms.
  sink.paint(tone(P.steel, 0.9));
  sink.box(x0 - 0.05, x1 + 0.05, top - 0.02, top + 0.16, wall + 0.02, back + 0.04, 'b');
  sink.paint(tone(P.steel, 0.7));
  for (const x of [x0 + 0.15, x1 - 0.15]) sink.bar(x, top - drop * 2.2, wall + 0.05, x, low + 0.03, out - 0.05, 0.05);
}

/** Abstract lettering on a sign's face: two or three bars in a tone off its board, stepped proud of it. */
function glyphs(sink: Sink, rng: Rng, x0: number, x1: number, y0: number, y1: number, z: number, color: number, vertical: boolean): void {
  sink.paint(color);
  const count = rng.between(2, 3);
  if (vertical) {
    const h = (y1 - y0) / (count * 1.6);
    for (let i = 0; i < count; i++) {
      const top = y1 - h * 0.3 - i * h * 1.6;
      const inset = (x1 - x0) * rng.range(0.18, 0.3);
      sink.quad([x0 + inset, top - h, z, x1 - inset, top - h, z, x1 - inset, top, z, x0 + inset, top, z], 0, 0, 1);
    }
    return;
  }
  const height = (y1 - y0) * 0.42;
  const mid = (y0 + y1) / 2;
  let x = x0 + (x1 - x0) * rng.range(0.12, 0.2);
  const end = x1 - (x1 - x0) * rng.range(0.12, 0.2);
  for (let i = 0; i < count && x < end - 0.1; i++) {
    const w = Math.min(end - x, (end - x0) * rng.range(0.18, 0.34));
    sink.quad([x, mid - height / 2, z, x + w, mid - height / 2, z, x + w, mid + height / 2, z, x, mid + height / 2, z], 0, 0, 1);
    x += w + (x1 - x0) * 0.06;
  }
}

/** A board on the wall in a frame of its own darker tone, and its lettering. */
function fascia(sink: Sink, rng: Rng, style: DressStyle, x0: number, x1: number, y0: number, y1: number, wall: number): void {
  const board = rng.pick(style.signs);
  const depth = 0.12;
  const rim = 0.07;
  sink.paint(tone(board, 0.76));
  sink.box(x0, x1, y0, y1, wall + 0.02, wall + 0.02 + depth, 'b');
  sink.paint(board, style.signGlow);
  const face = wall + 0.02 + depth + PROUD / 4;
  sink.quad([x0 + rim, y0 + rim, face, x1 - rim, y0 + rim, face, x1 - rim, y1 - rim, face, x0 + rim, y1 - rim, face], 0, 0, 1);
  glyphs(sink, rng, x0 + rim, x1 - rim, y0 + rim, y1 - rim, face + PROUD / 4, letterOn(board), false);
}

/** A colour that reads on a board of this one. */
function letterOn(board: number): number {
  const light = board === P.white || board === P.cream || board === P.gold || board === P.sand || board === P.skyBlue;
  return light ? P.bark : P.white;
}

/**
 * A blade: a sign standing out from the wall on a bracket, its face along the
 * street, framed and lettered on both sides. Tall and narrow in east and
 * south Asia, where a street is read by its vertical boards; a small square
 * hung from a scroll of bracket elsewhere.
 */
function blade(sink: Sink, rng: Rng, style: DressStyle, x: number, wall: number, y0: number, height: number, reach: number): void {
  const board = rng.pick(style.signs);
  const t = 0.14;
  const out0 = wall + 0.25;
  const out1 = wall + 0.25 + reach;
  const tall = style.blade === 'tall';
  sink.paint(tone(P.bark, 0.9));
  // The bracket: a rail over the board and a stay under it to the wall.
  sink.bar(x, y0 + height + 0.12, wall + 0.02, x, y0 + height + 0.12, out1 + 0.05, 0.08);
  sink.bar(x, y0 + height * (tall ? 0.1 : -0.25), wall + 0.02, x, y0 + height + 0.1, out1 * 0.5 + out0 * 0.5, 0.06);
  sink.post(x, wall + 0.08, 0.14, 0.12, y0 - 0.05, height + 0.3, 'd');
  if (!tall) {
    // Two chains the square hangs from.
    for (const z of [out0 + 0.08, out1 - 0.08]) sink.bar(x, y0 + height + 0.12, z, x, y0 + height, z, 0.04);
  }
  sink.paint(tone(board, 0.76));
  sink.box(x - t / 2, x + t / 2, y0, y0 + height, out0, out1);
  const letter = letterOn(board);
  const rim = Math.min(0.08, reach * 0.12);
  for (const side of [1, -1]) {
    const face = x + side * (t / 2 + PROUD / 4);
    sink.paint(board, style.signGlow);
    sink.quad([face, y0 + rim, out0 + rim, face, y0 + rim, out1 - rim, face, y0 + height - rim, out1 - rim, face, y0 + height - rim, out0 + rim], side, 0, 0);
    sink.paint(letter);
    const count = tall ? rng.between(2, 4) : 2;
    const span = ((height - 2 * rim) * 0.9) / count;
    const lift = face + side * (PROUD / 4);
    for (let i = 0; i < count; i++) {
      const top = y0 + height - rim - span * 0.15 - i * span;
      const inset = reach * (tall ? 0.26 : 0.22);
      sink.quad([lift, top - span * 0.6, out0 + inset, lift, top - span * 0.6, out1 - inset, lift, top, out1 - inset, lift, top, out0 + inset], side, 0, 0);
    }
  }
}

/** A flower box under a window: a trough with a lip, brackets under it, leaves in lumps and flowers among them. */
function flowerBox(sink: Sink, rng: Rng, x0: number, x1: number, top: number, wall: number): void {
  const h = 0.16 * M;
  const d = 0.2 * M;
  const back = wall + 0.02;
  const trough = rng.chance(0.6) ? P.clay : P.bone;
  sink.paint(trough);
  sink.box(x0 + 0.03, x1 - 0.03, top - h, top - 0.05, back, back + d - 0.03, 'bu');
  sink.paint(tone(trough, 0.84));
  sink.box(x0, x1, top - 0.05, top, back, back + d, 'b');
  sink.paint(tone(P.bark, 0.8));
  for (const x of [x0 + 0.2, x1 - 0.2]) sink.bar(x, top - h - 0.25, back + 0.02, x, top - h + 0.02, back + d * 0.8, 0.05);
  const leaf = rng.chance(0.5) ? P.green : P.darkOlive;
  const lumps = Math.max(2, Math.round((x1 - x0) / (0.22 * M)));
  const flower = rng.pick(FLOWERS);
  for (let i = 0; i < lumps; i++) {
    const x = x0 + ((i + 0.5) / lumps) * (x1 - x0);
    const r = rng.range(0.08, 0.11) * M;
    sink.paint(i % 2 === 0 ? leaf : tone(leaf, 0.84));
    sink.lump(x, top - 0.02, back + d / 2 + rng.jitter() * 0.05, r, r * rng.range(1.4, 2), 4);
    if (rng.chance(0.75)) {
      sink.paint(rng.chance(0.85) ? flower : rng.pick(FLOWERS));
      const s = 0.05 * M;
      sink.lump(x + rng.jitter() * r * 0.5, top + r * 1.1, back + d * 0.62, s, s * 1.3, 3);
    }
  }
}

/** A pair of louvred shutters folded back beside a window, each in a frame of its own. */
function shutters(sink: Sink, w: Window, color: number): void {
  const width = (w.x1 - w.x0) / 2;
  const back = w.wall + 0.02;
  const depth = 0.07;
  const slats = Math.max(4, Math.round((w.y1 - w.y0) / 0.28));
  for (const [a, b] of [[w.x0 - width - 0.04, w.x0 - 0.04], [w.x1 + 0.04, w.x1 + width + 0.04]] as const) {
    sink.paint(color);
    sink.box(a, b, w.y0, w.y1, back, back + depth, 'b');
    // The louvres: bars across in the shutter's shade, stepped proud of it.
    sink.paint(tone(color, 0.76));
    const face = back + depth + PROUD / 4;
    const inset = Math.min(0.08, width * 0.15);
    const span = (w.y1 - w.y0 - 2 * inset) / slats;
    for (let i = 0; i < slats; i++) {
      const y = w.y0 + inset + (i + 0.3) * span;
      sink.quad([a + inset, y, face, b - inset, y, face, b - inset, y + span * 0.4, face, a + inset, y + span * 0.4, face], 0, 0, 1);
    }
  }
}

/** An air conditioner's outdoor unit on two brackets: a cabinet with a round grille, its fan's hub, and a pipe down the wall. */
function aircon(sink: Sink, x: number, top: number, wall: number): void {
  const w = 0.8 * M;
  const h = 0.55 * M;
  const d = 0.28 * M;
  const back = wall + 0.1;
  sink.paint(tone(P.steel, 0.8));
  for (const bx of [x - w * 0.35, x + w * 0.35]) sink.bar(bx, top - h - 0.02, wall + 0.02, bx, top - h - 0.02, back + d, 0.06);
  sink.paint(P.bone);
  sink.prism(rounded(x - w / 2, x + w / 2, back, back + d, 0.05, 1).map(([px, pz]) => [px, pz] as [number, number]), top - h, top);
  // The grille, the ring round it and the hub, each stepped off the last.
  const cx = x - w * 0.14;
  const cy = top - h / 2;
  const r = h * 0.38;
  const face = back + d + PROUD / 4;
  sink.paint(tone(P.bone, 0.84));
  sink.slab(Array.from({ length: 10 }, (_, i) => [cx + Math.cos((i / 10) * Math.PI * 2) * r * 1.12, cy + Math.sin((i / 10) * Math.PI * 2) * r * 1.12] as [number, number]), face - 0.02, face, 'b');
  sink.paint(tone(P.steel, 0.9));
  sink.slab(Array.from({ length: 10 }, (_, i) => [cx + Math.cos((i / 10) * Math.PI * 2) * r, cy + Math.sin((i / 10) * Math.PI * 2) * r] as [number, number]), face, face + 0.02, 'b');
  sink.paint(P.bone);
  sink.post(cx, face + 0.05, r * 0.4, 0.06, cy - r * 0.2, r * 0.4, 'b');
  // A service panel beside it, and the pipe that runs down the wall.
  sink.paint(tone(P.bone, 0.84));
  sink.quad([x + w * 0.2, top - h * 0.8, face, x + w * 0.42, top - h * 0.8, face, x + w * 0.42, top - h * 0.3, face, x + w * 0.2, top - h * 0.3, face], 0, 0, 1);
  sink.paint(P.white);
  sink.bar(x + w * 0.44, top - h * 0.5, back - 0.04, x + w * 0.44, top - h - 0.5 * M, wall + 0.06, 0.06);
}

interface Footprint {
  /** Along the building line and into the plot, in units. */
  width: number;
  depth: number;
  /** The most triangles it comes to (`pnpm scenery` prints the dearest), so a town out of allowance does not draw it to throw it away. */
  cost: number;
  /** The wall a body meets, if any: a box of `hx` by `hz` about the item's centre, or a disc. */
  solid: { hx: number; hz: number; height: number; round?: boolean } | null;
}

/**
 * Every piece's plan, cost and wall. The costs are the dearest build `pnpm
 * scenery` measured (2026-09-28) with a little over: the post box is the
 * dearest of its four shapes, the planter and the hydrant their CC0 models.
 */
const FOOTPRINTS: Record<Furniture | 'postbox' | 'kiosk' | 'clock' | 'bollard', Footprint> = {
  cafe: { width: 2.3 * M, depth: 1.1 * M, cost: 380, solid: { hx: 0.4 * M, hz: 0.4 * M, height: 0.76 * M } },
  // Walked through, as a fence is: its slots are where the fleet's bicycles
  // stand, and each of those is a wall of its own (`Fleet.collide`).
  rack: { width: 1.8 * M, depth: 1.75 * M, cost: 160, solid: null },
  vending: { width: 0.5 * H, depth: 0.42 * H, cost: 160, solid: { hx: 0.24 * H, hz: 0.19 * H, height: 1.13 * H } },
  bin: { width: 0.34 * H, depth: 0.34 * H, cost: 230, solid: { hx: 0.15 * H, hz: 0.15 * H, height: 0.5 * H, round: true } },
  planter: { width: 1.3 * M, depth: 0.95 * M, cost: 310, solid: { hx: 0.6 * M, hz: 0.45 * M, height: 0.5 * M } },
  pots: { width: 1.1 * M, depth: 0.5 * M, cost: 480, solid: null },
  stall: { width: 2.1 * M, depth: 1.25 * M, cost: 520, solid: { hx: 1.0 * M, hz: 0.55 * M, height: 2.2 * M } },
  newsbox: { width: 1.05 * M, depth: 0.5 * M, cost: 210, solid: { hx: 0.5 * M, hz: 0.22 * M, height: 1.05 * M } },
  hydrant: { width: 0.5 * M, depth: 0.5 * M, cost: 200, solid: { hx: 0.15 * M, hz: 0.15 * M, height: 0.72 * M, round: true } },
  postbox: { width: 0.36 * H, depth: 0.34 * H, cost: 260, solid: { hx: 0.15 * H, hz: 0.15 * H, height: 0.66 * H, round: true } },
  kiosk: { width: 1.9 * M, depth: 1.8 * M, cost: 200, solid: { hx: 0.9 * M, hz: 0.85 * M, height: 2.7 * M } },
  clock: { width: 0.5 * M, depth: 0.5 * M, cost: 240, solid: { hx: 0.1 * M, hz: 0.1 * M, height: 3.2 * M, round: true } },
  // Walked through, as a shrub is: it stands on the pavement, which the crowd and the player walk.
  bollard: { width: 0.15 * M, depth: 0.15 * M, cost: 130, solid: null },
};

type Piece = keyof typeof FOOTPRINTS;

/** Where a rack's three bicycles stand, across it: between its hoops and either side of them. */
const RACK_SLOTS = [-0.75 * M, 0, 0.75 * M] as const;

/**
 * A bistro chair facing +x (`facing` 1) or -x (-1): a round-cornered seat,
 * four splayed legs, two uprights and two rails. **It is sat on as a bench
 * is**: its seat's top is `BENCH_SEAT`, where the sitting clip's thighs rest,
 * and its sitter's spot is `sitAhead` of its back's front (`bench.ts`), written
 * as a `'seat'` anchor that `settlements.ts` hands `benchesNear` with the
 * town's benches.
 */
function chair(sink: Sink, x: number, z: number, facing: number, color: number): void {
  const seat = BENCH_SEAT;
  const s = 0.2 * M;
  const t = 0.04 * M;
  const leg = 0.03 * M;
  sink.paint(tone(color, 0.84));
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    sink.bar(x + dx * s * 0.8, seat - t, z + dz * s * 0.8, x + dx * s * 1.05, 0, z + dz * s * 1.05, leg);
  }
  sink.paint(color);
  sink.prism(rounded(x - s, x + s, z - s, z + s, s * 0.35, 1), seat - t, seat);
  const back = x - facing * s * 0.95;
  const top = seat + 0.42 * M;
  for (const dz of [-1, 1]) sink.bar(back, seat, z + dz * s * 0.85, back - facing * 0.04 * M, top, z + dz * s * 0.85, leg);
  sink.bar(back - facing * 0.04 * M, top, z - s * 0.9, back - facing * 0.04 * M, top, z + s * 0.9, 0.05 * M);
  sink.bar(back - facing * 0.02 * M, top - 0.14 * M, z - s * 0.85, back - facing * 0.02 * M, top - 0.14 * M, z + s * 0.85, 0.03 * M);
  // The uprights' front, behind the seat's middle: where the back of the hips goes.
  sink.anchor('seat', x + facing * sitAhead(s * 0.95 - leg / 2), z, facing, 0);
}

function drawPiece(sink: Sink, rng: Rng, piece: Piece, style: DressStyle, iso: string, models: PropModels | null): void {
  switch (piece) {
    case 'cafe': {
      // A round table on a pedestal, two bistro chairs facing across it, and
      // where the region sits out under one, a parasol on the table's pole.
      const top = 0.74 * M;
      const table = rng.pick([P.white, P.bark, P.darkOlive, P.steel]);
      sink.paint(tone(table, 0.84));
      sink.lathe(0, 0, [[0, 0], [0.22 * M, 0], [0.22 * M, 0.02 * M], [0.05 * M, 0.06 * M], [0.035 * M, top - 0.05 * M], [0, top - 0.05 * M]], 6);
      sink.paint(table);
      sink.lathe(0, 0, [[0, top - 0.05 * M], [0.34 * M, top - 0.05 * M], [0.38 * M, top - 0.02 * M], [0.38 * M, top], [0, top]], 10);
      const seat = rng.pick([P.white, P.bark, P.crimson, P.darkOlive, P.skyBlue]);
      chair(sink, -0.72 * M, 0, 1, seat);
      chair(sink, 0.72 * M, 0, -1, seat);
      if (style.parasol) {
        const fabric = rng.pick(style.fabrics);
        const height = 2.25 * M;
        const radius = 1.05 * M;
        const ribs = 8;
        sink.paint(P.white);
        sink.lathe(0, 0, [[0.025 * M, top], [0.025 * M, height + 0.3 * M], [0.05 * M, height + 0.32 * M], [0, height + 0.4 * M]], 6);
        for (let i = 0; i < ribs; i++) {
          const a = (i / ribs) * Math.PI * 2 + Math.PI / ribs;
          const b = ((i + 1) / ribs) * Math.PI * 2 + Math.PI / ribs;
          sink.paint(fabric[i % 2]!);
          const ax = Math.cos(a) * radius, az = Math.sin(a) * radius;
          const bx = Math.cos(b) * radius, bz = Math.sin(b) * radius;
          const apex = height + 0.3 * M;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          sink.tri(0, apex, 0, ax, height, az, bx, height, bz, mx * 0.3, radius, mz * 0.3);
          sink.tri(0, apex, 0, ax, height, az, bx, height, bz, -mx * 0.3, -radius, -mz * 0.3);
          // A scallop under each panel's edge.
          const drop = height - 0.12 * M;
          sink.tri(ax, height, az, bx, height, bz, mx * 0.97, drop, mz * 0.97, mx, 0, mz);
          sink.tri(ax, height, az, bx, height, bz, mx * 0.97, drop, mz * 0.97, -mx, 0, -mz);
        }
      }
      return;
    }
    case 'rack': {
      // A rack of two hoops set in a base rail, and three slots a bicycle
      // stands in: between the hoops and either side, its front nosed in
      // away from the street. **The bicycles are the fleet's** (`fleet.ts`):
      // takeable ones stand in these slots, so nothing merged stands there.
      sink.paint(P.steel);
      const hoop = 0.78 * M;
      const legs = 0.33 * M;
      for (const x of [-0.45 * M, 0.45 * M]) {
        const arc = 5;
        let pz = -legs;
        let py = 0;
        const points: [number, number][] = [[-legs, 0], [-legs, hoop - legs]];
        for (let s = 1; s < arc; s++) {
          const a = Math.PI - (s / arc) * Math.PI;
          points.push([Math.cos(a) * legs, hoop - legs + Math.sin(a) * legs]);
        }
        points.push([legs, hoop - legs], [legs, 0]);
        for (const [z, y] of points.slice(1)) {
          sink.bar(x, py, pz, x, y, z, 0.05 * M);
          pz = z;
          py = y;
        }
        // A foot plate under each leg.
        sink.paint(tone(P.steel, 0.7));
        for (const z of [-legs, legs]) sink.post(x, z, 0.12 * M, 0.12 * M, 0, 0.02 * M);
        sink.paint(P.steel);
      }
      for (const x of RACK_SLOTS) sink.anchor('bike', x, 0, 0, -1);
      return;
    }
    case 'vending': {
      // A cabinet a head over the body, its top arched, on a dark plinth: the
      // lit window of what it sells in rows, a column of buttons, the coin
      // panel with its slot, and the flap it drops a can through.
      const body = rng.pick([P.crimson, P.white, P.skyBlue, P.gold, P.red]);
      const w = 0.24 * H;
      const d = 0.19 * H;
      const h = 1.13 * H;
      const plinth = 0.04 * H;
      sink.paint(tone(P.steel, 0.7));
      sink.prism(rounded(-w + 0.03, w - 0.03, -d + 0.03, d - 0.03, 0.04, 1), 0, plinth, 'd');
      sink.paint(body);
      sink.prism(rounded(-w, w, -d, d, 0.07, 1), plinth, h - 0.06 * H, 'd');
      sink.paint(tone(body, 0.84));
      sink.slab(arched(-w, w, h - 0.06 * H, h - 0.06 * H, 0.06 * H, 4), -d, d);
      const front = d + PROUD / 2;
      // The window: a frame, the lit display, three shelves of cans on it.
      sink.paint(tone(body, 0.76));
      sink.quad([-w * 0.88, h * 0.46, front, w * 0.42, h * 0.46, front, w * 0.42, h * 0.9, front, -w * 0.88, h * 0.9, front], 0, 0, 1);
      sink.paint(P.cream, 0.9);
      sink.quad([-w * 0.8, h * 0.48, front + PROUD / 4, w * 0.34, h * 0.48, front + PROUD / 4, w * 0.34, h * 0.88, front + PROUD / 4, -w * 0.8, h * 0.88, front + PROUD / 4], 0, 0, 1);
      for (let row = 0; row < 3; row++) {
        const y = h * (0.52 + row * 0.12);
        for (let k = 0; k < 4; k++) {
          const x = -w * 0.72 + k * w * 0.27;
          sink.paint(rng.pick(PRODUCE), 0.5);
          sink.quad([x, y, front + PROUD / 2, x + w * 0.16, y, front + PROUD / 2, x + w * 0.16, y + h * 0.08, front + PROUD / 2, x, y + h * 0.08, front + PROUD / 2], 0, 0, 1);
        }
        sink.paint(tone(P.steel, 0.9));
        sink.quad([-w * 0.8, y - h * 0.012, front + PROUD / 2, w * 0.34, y - h * 0.012, front + PROUD / 2, w * 0.34, y, front + PROUD / 2, -w * 0.8, y, front + PROUD / 2], 0, 0, 1);
      }
      // The buttons, a coin panel and its slot, beside the window.
      sink.paint(tone(P.steel, 0.9));
      sink.box(w * 0.5, w * 0.86, h * 0.34, h * 0.9, d - 0.02, d + 0.05, 'b');
      for (let k = 0; k < 6; k++) {
        const y = h * (0.86 - k * 0.07);
        sink.paint(k % 2 === 0 ? P.white : P.red, 0.4);
        sink.quad([w * 0.6, y - h * 0.03, d + 0.07, w * 0.76, y - h * 0.03, d + 0.07, w * 0.76, y, d + 0.07, w * 0.6, y, d + 0.07], 0, 0, 1);
      }
      sink.paint(tone(P.bark, 0.6));
      sink.quad([w * 0.64, h * 0.38, d + 0.07, w * 0.72, h * 0.38, d + 0.07, w * 0.72, h * 0.44, d + 0.07, w * 0.64, h * 0.44, d + 0.07], 0, 0, 1);
      // The drop: a dark mouth in a frame, and its flap.
      sink.paint(tone(body, 0.76));
      sink.box(-w * 0.7, w * 0.3, h * 0.08, h * 0.22, d - 0.02, d + 0.06, 'b');
      sink.paint(tone(P.bark, 0.6));
      sink.quad([-w * 0.62, h * 0.1, d + 0.08, w * 0.22, h * 0.1, d + 0.08, w * 0.22, h * 0.2, d + 0.08, -w * 0.62, h * 0.2, d + 0.08], 0, 0, 1);
      sink.paint(tone(P.steel, 0.9));
      sink.quad([-w * 0.62, h * 0.155, d + 0.1, w * 0.22, h * 0.155, d + 0.1, w * 0.22, h * 0.2, d + 0.1, -w * 0.62, h * 0.2, d + 0.1], 0, 0, 1);
      return;
    }
    case 'bin': {
      // A street bin to the hip: a plinth, a tapered barrel in two tones with
      // a band, a domed lid with a dark mouth round it, and a post it hangs on.
      const color = rng.pick(style.bins);
      const r = 0.13 * H;
      const h = 0.5 * H;
      sink.paint(tone(color, 0.76));
      sink.lathe(0, 0, [[0, 0], [r * 0.95, 0], [r * 0.95, 0.04 * H], [0, 0.04 * H]], 10);
      sink.paint(color);
      sink.lathe(0, 0, [[r * 0.9, 0.04 * H], [r, h * 0.62], [0, h * 0.62]], 10);
      sink.paint(tone(color, 0.84));
      sink.lathe(0, 0, [[r * 1.04, h * 0.62], [r * 1.06, h * 0.72], [0, h * 0.72]], 10);
      sink.paint(color);
      sink.lathe(0, 0, [[r * 1.02, h * 0.72], [r * 1.04, h * 0.8], [0, h * 0.8]], 10);
      sink.paint(tone(P.bark, 0.6));
      sink.lathe(0, 0, [[r * 0.98, h * 0.8], [r * 0.98, h * 0.86], [0, h * 0.86]], 10);
      sink.paint(tone(color, 0.84));
      sink.lathe(0, 0, [[0, h * 0.86], [r * 1.08, h * 0.86], [r * 1.08, h * 0.9], [r * 0.7, h * 0.97], [0, h]], 10);
      return;
    }
    case 'planter': {
      // Kenney's planter (City Kit Suburban, CC0): a trough and three bushes.
      const stone = rng.pick([P.bone, P.tan, P.clay, P.sand]);
      const leaf = rng.chance(0.5) ? P.green : P.darkOlive;
      const model = models?.get(
        'prop-planter',
        { width: 1.25 * M },
        (_slot, original) => (greenest(original) ? leaf : lightness(original) > 0.5 ? tone(P.bark, 0.8) : stone),
        `${stone}/${leaf}`,
      );
      if (model !== null && model !== undefined) {
        sink.model(model);
        // Flowers in among the bushes.
        const flower = rng.pick(FLOWERS);
        for (let i = 0; i < 4; i++) {
          sink.paint(flower);
          sink.lump((-0.45 + i * 0.3) * M, 0.36 * M + rng.range(0, 0.1) * M, rng.jitter() * 0.12 * M, 0.06 * M, 0.08 * M, 4);
        }
        return;
      }
      const w = 0.62 * M;
      const d = 0.26 * M;
      const h = 0.45 * M;
      sink.paint(tone(stone, 0.84));
      sink.prism(rounded(-w, w, -d, d, 0.05 * M, 1), 0, 0.06 * M, 'd');
      sink.paint(stone);
      sink.prism(rounded(-w + 0.02 * M, w - 0.02 * M, -d + 0.02 * M, d - 0.02 * M, 0.04 * M, 1), 0.06 * M, h, 'd');
      for (let i = 0; i < 3; i++) {
        sink.paint(i === 1 ? tone(leaf, 0.84) : leaf);
        sink.lump((-0.4 + i * 0.4) * M, h - 0.05 * M, 0, 0.22 * M, 0.34 * M, 6);
      }
      return;
    }
    case 'pots': {
      // Two or three pots of a size on the doorstep, each with a rim and a
      // foot, a bush of lumps in it and some in flower.
      const count = rng.between(2, 3);
      for (let i = 0; i < count; i++) {
        const x = (i - (count - 1) / 2) * 0.36 * M;
        const r = rng.range(0.12, 0.16) * M;
        const h = rng.range(0.25, 0.38) * M;
        const clay = rng.pick([P.clay, P.salmon, P.bone, P.skyBlue, P.white]);
        sink.paint(clay);
        sink.lathe(x, 0, [[0, 0], [r * 0.7, 0], [r, h * 0.85], [r * 1.12, h * 0.86], [r * 1.12, h], [0, h * 0.92]], 6);
        const leaf = rng.pick([P.green, P.darkOlive, P.olive]);
        for (let k = 0; k < 2; k++) {
          sink.paint(k === 0 ? leaf : tone(leaf, 0.84));
          const a = k * Math.PI + rng.unit();
          const lr = r * rng.range(0.7, 0.95);
          sink.lump(x + Math.cos(a) * r * 0.35, h * 0.85, Math.sin(a) * r * 0.35, lr, lr * rng.range(1.6, 2.4), 5);
        }
        if (rng.chance(0.55)) {
          const flower = rng.pick(FLOWERS);
          sink.paint(flower);
          for (let k = 0; k < 2; k++) {
            const a = k * Math.PI + rng.unit();
            sink.lump(x + Math.cos(a) * r * 0.55, h + r * rng.range(0.9, 1.4), Math.sin(a) * r * 0.55, r * 0.3, r * 0.4, 4);
          }
        }
      }
      return;
    }
    case 'stall': {
      // A market stall: a counter with a cloth hung down its front, crates of
      // produce heaped on it, four posts and a striped canopy sloping to the
      // street with a scalloped edge.
      const w = 1.0 * M;
      const d = 0.55 * M;
      const counter = 0.85 * M;
      const wood = rng.pick([P.brown, P.bark, P.tan]);
      const fabric = rng.pick(style.fabrics);
      sink.paint(tone(wood, 0.84));
      sink.box(-w + 0.04 * M, w - 0.04 * M, 0, counter - 0.06 * M, -d + 0.04 * M, d - 0.04 * M, 'd');
      sink.paint(wood);
      sink.box(-w - 0.03 * M, w + 0.03 * M, counter - 0.06 * M, counter, -d - 0.03 * M, d + 0.03 * M, '');
      sink.paint(fabric[1]!);
      sink.quad([-w + 0.06 * M, 0.08 * M, d - 0.04 * M + PROUD / 2, w - 0.06 * M, 0.08 * M, d - 0.04 * M + PROUD / 2, w - 0.06 * M, counter - 0.1 * M, d - 0.04 * M + PROUD / 2, -w + 0.06 * M, counter - 0.1 * M, d - 0.04 * M + PROUD / 2], 0, 0, 1);
      const crates = rng.between(3, 4);
      for (let i = 0; i < crates; i++) {
        const cw = (2 * w) / crates;
        const x0 = -w + i * cw + 0.04 * M;
        const x1 = x0 + cw - 0.08 * M;
        const cz = -d * 0.8;
        const ch = 0.14 * M;
        sink.paint(tone(P.tan, 0.9));
        sink.box(x0, x1, counter, counter + ch, cz, d * 0.8, 'd');
        // The slats: two darker bands across its front, stepped proud.
        sink.paint(tone(P.tan, 0.76));
        for (const y of [counter + ch * 0.2, counter + ch * 0.62]) {
          sink.quad([x0 + 0.02, y, d * 0.8 + PROUD / 4, x1 - 0.02, y, d * 0.8 + PROUD / 4, x1 - 0.02, y + ch * 0.22, d * 0.8 + PROUD / 4, x0 + 0.02, y + ch * 0.22, d * 0.8 + PROUD / 4], 0, 0, 1);
        }
        // The heap: three or four fruit-sized lumps in one colour and its shade.
        const fruit = rng.pick(PRODUCE);
        const heaps = rng.between(2, 3);
        for (let k = 0; k < heaps; k++) {
          sink.paint(k % 2 === 0 ? fruit : tone(fruit, 0.84));
          const fx = x0 + ((k + 0.5) / heaps) * (x1 - x0);
          const fz = cz * 0.5 + rng.jitter() * d * 0.3;
          const fr = Math.min((x1 - x0) / heaps, 0.18 * M) * 0.6;
          sink.lump(fx, counter + ch - fr * 0.3, fz, fr, fr * 1.3, 4);
        }
      }
      // The posts and the canopy, sloping down to the street.
      const top = 2.25 * M;
      const low = 2.0 * M;
      sink.paint(tone(wood, 0.76));
      for (const [x, z, h] of [[-w, -d, top], [w, -d, top], [-w, d, low], [w, d, low]] as const) {
        sink.prism(rounded(x - 0.035 * M, x + 0.035 * M, z - 0.035 * M, z + 0.035 * M, 0.012 * M, 1), 0, h, 'd');
      }
      const stripes = 4;
      const edge = d + 0.25 * M;
      for (let i = 0; i < stripes; i++) {
        sink.paint(fabric[i % 2]!);
        const a = -w - 0.1 * M + ((2 * w + 0.2 * M) * i) / stripes;
        const b = a + (2 * w + 0.2 * M) / stripes;
        sink.sheet([a, top + 0.02, -d - 0.1 * M, b, top + 0.02, -d - 0.1 * M, b, low + 0.02, edge, a, low + 0.02, edge], 0, 1, 0.1);
        const m = (a + b) / 2;
        sink.sheet([a, low + 0.02, edge, b, low + 0.02, edge, b, low - 0.08 * M, edge, a, low - 0.08 * M, edge], 0, 0, 1);
        sink.tri(a, low - 0.08 * M, edge, b, low - 0.08 * M, edge, m, low - 0.16 * M, edge, 0, 0, 1);
        sink.tri(a, low - 0.08 * M, edge, b, low - 0.08 * M, edge, m, low - 0.16 * M, edge, 0, 0, -1);
      }
      return;
    }
    case 'newsbox': {
      // Two newspaper boxes on pedestals, each its own colour: a window onto
      // the day's front page, a coin box on top, a handle under the window.
      for (const x of [-0.25 * M, 0.25 * M]) {
        const color = rng.pick([P.skyBlue, P.crimson, P.gold, P.white, P.darkOlive]);
        const w = 0.21 * M;
        const d = 0.19 * M;
        sink.paint(tone(P.steel, 0.8));
        sink.prism(rounded(x - 0.06 * M, x + 0.06 * M, -0.06 * M, 0.06 * M, 0.02 * M, 1), 0, 0.35 * M, 'd');
        sink.post(x, 0, 0.3 * M, 0.26 * M, 0, 0.03 * M);
        sink.paint(color);
        sink.prism(rounded(x - w, x + w, -d, d, 0.03 * M, 1), 0.35 * M, 0.95 * M);
        sink.paint(tone(color, 0.76));
        sink.box(x - w * 0.85, x + w * 0.85, 0.58 * M, 0.9 * M, d - 0.02, d + 0.03, 'b');
        sink.paint(P.cream);
        sink.quad([x - w * 0.7, 0.61 * M, d + 0.05, x + w * 0.7, 0.61 * M, d + 0.05, x + w * 0.7, 0.87 * M, d + 0.05, x - w * 0.7, 0.87 * M, d + 0.05], 0, 0, 1);
        sink.paint(tone(P.bark, 0.8));
        for (const y of [0.8 * M, 0.72 * M]) sink.quad([x - w * 0.55, y, d + 0.07, x + w * 0.4, y, d + 0.07, x + w * 0.4, y + 0.03 * M, d + 0.07, x - w * 0.55, y + 0.03 * M, d + 0.07], 0, 0, 1);
        sink.paint(tone(P.steel, 0.9));
        sink.bar(x - w * 0.5, 0.53 * M, d + 0.06, x + w * 0.5, 0.53 * M, d + 0.06, 0.03 * M);
        sink.box(x - w * 0.5, x + w * 0.1, 0.95 * M, 1.02 * M, -d * 0.6, d * 0.6, 'd');
      }
      return;
    }
    case 'hydrant': {
      // KayKit's fire hydrant (City Builder Bits, CC0), in the country's colour.
      const color = iso === 'USA' || iso === 'CAN' ? rng.pick([P.red, P.gold, P.red]) : P.red;
      const model = models?.get('prop-hydrant', { height: 0.72 * M }, (_slot, original) => {
        // Its 33 swatches are one red at 33 lightnesses: kept as tones of this one.
        const k = Math.max(0.6, Math.min(1.3, lightness(original) / 0.75));
        return tone(color, Math.round(k * 20) / 20);
      }, `${color}`);
      if (model !== null && model !== undefined) {
        sink.model(model);
        return;
      }
      sink.paint(color);
      sink.lathe(0, 0, [[0, 0], [0.12 * M, 0], [0.12 * M, 0.06 * M], [0.08 * M, 0.08 * M], [0.08 * M, 0.55 * M], [0.1 * M, 0.58 * M], [0.06 * M, 0.7 * M], [0, 0.72 * M]], 8);
      return;
    }
    case 'postbox': {
      postbox(sink, iso);
      return;
    }
    case 'kiosk': {
      // An eight-sided kiosk: a stone plinth, a body in the town's green or
      // brown with its service window lit and a counter under it, a band of
      // the name round the top, an overhanging roof and a finial.
      const r = 0.92 * M;
      const h = 2.35 * M;
      const body = rng.pick([P.darkOlive, P.green, P.bark, P.skyBlue]);
      const sides = 8;
      const ring = (radius: number): [number, number][] =>
        Array.from({ length: sides }, (_, i) => {
          const a = Math.PI / 2 - Math.PI / sides + (i / sides) * Math.PI * 2;
          return [Math.cos(a) * radius, Math.sin(a) * radius];
        });
      sink.paint(P.bone);
      sink.prism(ring(r * 1.05), 0, 0.12 * M, 'd');
      sink.paint(body);
      sink.prism(ring(r), 0.12 * M, h, 'du');
      // The service window on the front face, its frame, and a shelf under it.
      const face = r * Math.cos(Math.PI / sides);
      const half = r * Math.sin(Math.PI / sides) * 0.8;
      sink.paint(tone(body, 0.76));
      sink.quad([-half, 1.0 * M, face + PROUD / 4, half, 1.0 * M, face + PROUD / 4, half, 1.9 * M, face + PROUD / 4, -half, 1.9 * M, face + PROUD / 4], 0, 0, 1);
      sink.paint(tone(P.slate, GLASS_TONE), 0.6);
      sink.quad([-half * 0.85, 1.06 * M, face + PROUD / 2, half * 0.85, 1.06 * M, face + PROUD / 2, half * 0.85, 1.84 * M, face + PROUD / 2, -half * 0.85, 1.84 * M, face + PROUD / 2], 0, 0, 1);
      sink.paint(tone(body, 0.84));
      sink.box(-half * 1.1, half * 1.1, 0.95 * M, 1.0 * M, face - 0.05, face + 0.25 * M, '');
      // Posters on two of the other faces.
      for (const k of [2, 6]) {
        const a = Math.PI / 2 + (k / sides) * Math.PI * 2;
        const cx = Math.cos(a) * (face + PROUD / 4);
        const cz = Math.sin(a) * (face + PROUD / 4);
        const tx = -Math.sin(a) * half * 0.8;
        const tz = Math.cos(a) * half * 0.8;
        sink.paint(rng.pick([P.cream, P.gold, P.salmon, P.white]));
        sink.quad([cx - tx, 0.7 * M, cz - tz, cx + tx, 0.7 * M, cz + tz, cx + tx, 1.8 * M, cz + tz, cx - tx, 1.8 * M, cz - tz], Math.cos(a), 0, Math.sin(a));
      }
      sink.paint(rng.pick([P.gold, P.cream, P.crimson]));
      sink.prism(ring(r * 1.03), h - 0.3 * M, h, 'd');
      sink.paint(tone(body, 0.76));
      sink.prism(ring(r * 1.25), h, h + 0.08 * M);
      sink.lathe(0, 0, [[0, h + 0.08 * M], [r * 1.1, h + 0.08 * M], [r * 0.3, h + 0.5 * M], [0.06 * M, h + 0.56 * M], [0.1 * M, h + 0.62 * M], [0, h + 0.7 * M]], sides);
      return;
    }
    case 'clock': {
      // A street clock: a plinth, a fluted column, a capital, and a drum of
      // two white faces with their hands, capped by a finial.
      const post = rng.pick([P.darkOlive, P.bark, P.steel]);
      const h = 2.9 * M;
      sink.paint(tone(post, 0.84));
      sink.lathe(0, 0, [[0, 0], [0.18 * M, 0], [0.18 * M, 0.08 * M], [0.12 * M, 0.14 * M], [0.12 * M, 0.3 * M], [0, 0.3 * M]], 8);
      sink.paint(post);
      sink.lathe(0, 0, [[0.07 * M, 0.3 * M], [0.055 * M, h - 0.1 * M], [0, h - 0.1 * M]], 8);
      sink.paint(tone(post, 0.84));
      sink.lathe(0, 0, [[0, h - 0.12 * M], [0.08 * M, h - 0.12 * M], [0.13 * M, h], [0, h]], 8);
      const r = 0.28 * M;
      const cy = h + r - 0.02 * M;
      const circle = (radius: number): [number, number][] =>
        Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * Math.PI * 2) * radius, cy + Math.sin((i / 12) * Math.PI * 2) * radius]);
      sink.paint(post);
      sink.slab(circle(r), -0.09 * M, 0.09 * M);
      for (const side of [1, -1]) {
        const z = side * (0.09 * M + PROUD / 4);
        sink.paint(P.white, 0.5);
        const face = circle(r * 0.84);
        for (let i = 0; i < face.length; i++) {
          const [ax, ay] = face[i]!;
          const [bx, by] = face[(i + 1) % face.length]!;
          sink.tri(0, cy, z, ax, ay, z, bx, by, z, 0, 0, side);
        }
        sink.paint(P.bark);
        const zz = z + side * (PROUD / 4);
        sink.quad([-0.02 * M, cy, zz, 0.02 * M, cy, zz, 0.02 * M, cy + 0.19 * M, zz, -0.02 * M, cy + 0.19 * M, zz], 0, 0, side);
        sink.quad([0, cy - 0.02 * M, zz, 0.14 * M, cy - 0.02 * M, zz, 0.14 * M, cy + 0.02 * M, zz, 0, cy + 0.02 * M, zz], 0, 0, side);
      }
      sink.paint(tone(post, 0.84));
      sink.lathe(0, 0, [[0, cy + r - 0.02], [0.06 * M, cy + r], [0.03 * M, cy + r + 0.14 * M], [0, cy + r + 0.2 * M]], 6);
      return;
    }
    case 'bollard': {
      // A bollard: a foot, a shaft with a light band near its top, a domed cap.
      const r = 0.07 * M;
      const h = 0.85 * M;
      const post = rng.pick([P.steel, P.bark, P.darkOlive]);
      sink.paint(tone(post, 0.76));
      sink.lathe(0, 0, [[r * 1.3, 0], [r * 1.3, 0.05 * M], [r, 0.08 * M], [0, 0.08 * M]], 8);
      sink.paint(post);
      sink.lathe(0, 0, [[r, 0.08 * M], [r, h * 0.72], [0, h * 0.72]], 8);
      sink.paint(post === P.steel ? P.white : P.gold);
      sink.lathe(0, 0, [[r * 1.02, h * 0.72], [r * 1.02, h * 0.8], [0, h * 0.8]], 8);
      sink.paint(post);
      sink.lathe(0, 0, [[r, h * 0.8], [r, h * 0.92], [r * 0.7, h * 0.98], [0, h]], 8);
      return;
    }
  }
}

/**
 * A post box in the shape the country's is: a pillar with a domed cap where
 * the pillar box is the thing (Britain and what took it from Britain, Japan's
 * old ones), a collection box on legs with its hood where the United States'
 * blue box is, a square box with a rounded top on a pedestal for Japan's and
 * Korea's and China's, and a box on a post everywhere else — Spain's, France's
 * and Germany's yellow. About waist to chest on the body.
 */
function postbox(sink: Sink, iso: string): void {
  const color = POST_COLOURS[iso] ?? P.red;
  const shape = POST_SHAPES[iso] ?? 'post';
  const slot = tone(P.bark, 0.6);
  if (shape === 'pillar') {
    const r = 0.14 * H;
    const h = 0.66 * H;
    sink.paint(tone(color, 0.76));
    sink.lathe(0, 0, [[0, 0], [r * 1.15, 0], [r * 1.15, 0.05 * H], [r, 0.07 * H], [0, 0.07 * H]], 12);
    sink.paint(color);
    sink.lathe(0, 0, [[r, 0.07 * H], [r, h * 0.8], [0, h * 0.8]], 12);
    sink.paint(tone(color, 0.84));
    sink.lathe(0, 0, [[0, h * 0.8], [r * 1.12, h * 0.8], [r * 1.12, h * 0.85], [r * 0.95, h * 0.88], [r * 0.7, h * 0.95], [r * 0.3, h * 0.99], [0, h]], 12);
    // The slot under the cap, its hood, and the plate with the collection times.
    const face = r * Math.cos(Math.PI / 12) + PROUD / 4;
    sink.paint(tone(color, 0.84));
    sink.box(-r * 0.42, r * 0.42, h * 0.68, h * 0.72, face - 0.04, face + 0.06, 'b');
    sink.paint(slot);
    sink.quad([-r * 0.36, h * 0.64, face, r * 0.36, h * 0.64, face, r * 0.36, h * 0.675, face, -r * 0.36, h * 0.675, face], 0, 0, 1);
    sink.paint(P.white);
    sink.quad([-r * 0.28, h * 0.44, face, r * 0.28, h * 0.44, face, r * 0.28, h * 0.58, face, -r * 0.28, h * 0.58, face], 0, 0, 1);
    sink.paint(P.gold);
    sink.quad([-r * 0.12, h * 0.73, face + PROUD / 4, r * 0.12, h * 0.73, face + PROUD / 4, r * 0.12, h * 0.78, face + PROUD / 4, -r * 0.12, h * 0.78, face + PROUD / 4], 0, 0, 1);
    return;
  }
  if (shape === 'collection') {
    // The United States' blue box: four legs, a body, a hood arched over the
    // pull-down handle, and a white label.
    const w = 0.16 * H;
    const d = 0.15 * H;
    const foot = 0.12 * H;
    const h = 0.62 * H;
    sink.paint(tone(color, 0.76));
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      sink.prism(rounded(x * w * 0.8 - 0.05, x * w * 0.8 + 0.05, z * d * 0.8 - 0.05, z * d * 0.8 + 0.05, 0.02, 1), 0, foot + 0.02, 'd');
    }
    sink.paint(color);
    sink.slab(arched(-w, w, foot, h - w * 0.5, w * 0.5, 6), -d, d);
    // The hood: a darker arch standing proud over the handle.
    sink.paint(tone(color, 0.76));
    sink.slab(arched(-w * 0.8, w * 0.8, h * 0.66, h * 0.72, w * 0.25, 5), d, d + 0.07, 'b');
    sink.paint(tone(P.steel, 0.9));
    sink.bar(-w * 0.45, h * 0.64, d + 0.06, w * 0.45, h * 0.64, d + 0.06, 0.04);
    sink.paint(P.white);
    sink.quad([-w * 0.55, h * 0.36, d + PROUD / 4, w * 0.55, h * 0.36, d + PROUD / 4, w * 0.55, h * 0.5, d + PROUD / 4, -w * 0.55, h * 0.5, d + PROUD / 4], 0, 0, 1);
    return;
  }
  if (shape === 'cabinet') {
    // East Asia's: a square box with a rounded top on a short pedestal, two
    // slots under their hoods, a white plate.
    const w = 0.15 * H;
    const d = 0.13 * H;
    const h = 0.64 * H;
    sink.paint(tone(color, 0.76));
    sink.prism(rounded(-w * 0.6, w * 0.6, -d * 0.6, d * 0.6, 0.03, 1), 0, 0.14 * H, 'd');
    sink.paint(color);
    sink.prism(rounded(-w, w, -d, d, 0.05, 2), 0.14 * H, h - w * 0.3, 'u');
    sink.slab(arched(-w, w, h - w * 0.3, h - w * 0.3, w * 0.3, 5), -d, d);
    for (const x of [-w * 0.45, w * 0.45]) {
      sink.paint(tone(color, 0.84));
      sink.box(x - w * 0.36, x + w * 0.36, h * 0.72, h * 0.77, d - 0.02, d + 0.06, 'b');
      sink.paint(slot);
      sink.quad([x - w * 0.3, h * 0.68, d + PROUD / 4, x + w * 0.3, h * 0.68, d + PROUD / 4, x + w * 0.3, h * 0.715, d + PROUD / 4, x - w * 0.3, h * 0.715, d + PROUD / 4], 0, 0, 1);
    }
    sink.paint(P.white);
    sink.quad([-w * 0.6, h * 0.42, d + PROUD / 4, w * 0.6, h * 0.42, d + PROUD / 4, w * 0.6, h * 0.56, d + PROUD / 4, -w * 0.6, h * 0.56, d + PROUD / 4], 0, 0, 1);
    return;
  }
  // A box on a post: an octagonal post in grey, a box with a rounded top,
  // the slot under its lip and the country's horn in the dark tone on its face.
  const w = 0.14 * H;
  const d = 0.1 * H;
  const bottom = 0.34 * H;
  const h = 0.66 * H;
  sink.paint(tone(P.steel, 0.9));
  sink.lathe(0, 0, [[0.05 * H, 0], [0.05 * H, 0.02 * H], [0.025 * H, 0.03 * H], [0.025 * H, bottom], [0, bottom]], 8);
  sink.paint(color);
  sink.slab(arched(-w, w, bottom, h - w * 0.35, w * 0.35, 5), -d, d);
  sink.paint(tone(color, 0.84));
  sink.box(-w * 0.8, w * 0.8, h * 0.78, h * 0.82, d - 0.02, d + 0.07, 'b');
  sink.paint(slot);
  sink.quad([-w * 0.66, h * 0.74, d + PROUD / 4, w * 0.66, h * 0.74, d + PROUD / 4, w * 0.66, h * 0.775, d + PROUD / 4, -w * 0.66, h * 0.775, d + PROUD / 4], 0, 0, 1);
  // The horn: a disc and its bell, simply.
  const cy = h * 0.6;
  const horn: [number, number][] = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2) * w * 0.32, cy + Math.sin((i / 8) * Math.PI * 2) * w * 0.32]);
  sink.slab(horn, d, d + 0.03, 'b');
  sink.paint(color);
  sink.slab(horn.map(([x, y]) => [x * 0.55, cy + (y - cy) * 0.55] as [number, number]), d + 0.03, d + 0.05, 'b');
}

// ---------------------------------------------------------------------------
// The ironwork on the road: marks laid flush, a mosaic of tones
// ---------------------------------------------------------------------------

/** Lays a point of the town's plane on the paving under a mark, lifted `DECAL_LIFT`: see `mark` in `dressTown`. */
type Put = (x: number, z: number) => [number, number, number];

/** How many a street's cell gets: a manhole in about one in eight, a gully at about one kerb in five. */
const MANHOLE_SHARE = 0.12;
const DRAIN_SHARE = 0.2;
/** Their triangles at most, which a town out of allowance does not start. */
const MANHOLE_COST = 132;
const GULLY_COST = 26;

/**
 * A colour's channels times `factor`, any colour: the road's own asphalt
 * darkened for its ironwork. Not `tone`, which holds a part to the palette
 * for its colour count; a mark is floor, and the floor is drawn in its
 * region's road colour times its own grain already.
 */
function shade(color: number, factor: number): number {
  const channel = (at: number): number => Math.max(0, Math.min(255, Math.round(((color >> at) & 255) * factor)));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** A flat rectangle of the plane. */
function flat(sink: Sink, put: Put, x0: number, x1: number, z0: number, z1: number): void {
  sink.quad([...put(x0, z1), ...put(x1, z1), ...put(x1, z0), ...put(x0, z0)], 0, 1, 0);
}

/** A flat ring of the plane from radius `r0` to `r1` round `(x, z)`, from angle `a0` to `a1`, in `sides` steps; `r0` 0 is a disc. */
function ring(sink: Sink, put: Put, x: number, z: number, r0: number, r1: number, sides: number, a0 = 0, a1 = Math.PI * 2): void {
  for (let i = 0; i < sides; i++) {
    const a = a0 + ((a1 - a0) * i) / sides;
    const b = a0 + ((a1 - a0) * (i + 1)) / sides;
    const inA = put(x + Math.cos(a) * r0, z + Math.sin(a) * r0);
    const inB = put(x + Math.cos(b) * r0, z + Math.sin(b) * r0);
    const outA = put(x + Math.cos(a) * r1, z + Math.sin(a) * r1);
    const outB = put(x + Math.cos(b) * r1, z + Math.sin(b) * r1);
    if (r0 <= 0) sink.tri(...inA, ...outA, ...outB, 0, 1, 0);
    else sink.quad([...inA, ...outA, ...outB, ...inB], 0, 1, 0);
  }
}

/**
 * A manhole cover: a rim ring in the road's own tone darkened a little, a
 * darker seat inside it, and the cover's pattern — concentric rings, or
 * spokes round a boss — in two tones between. Subtle on purpose: a cover is
 * the street's ironwork, not a hole in it. 84 to 132 triangles.
 */
function manhole(sink: Sink, put: Put, x: number, z: number, r: number, radial: boolean, iron: (factor: number) => number): void {
  const sides = 12;
  sink.paint(iron(0.8));
  ring(sink, put, x, z, r * 0.86, r, sides);
  sink.paint(iron(0.6));
  ring(sink, put, x, z, r * 0.74, r * 0.86, sides);
  if (radial) {
    for (let i = 0; i < sides; i++) {
      sink.paint(iron(i % 2 === 0 ? 0.7 : 0.62));
      ring(sink, put, x, z, r * 0.3, r * 0.74, 1, (i / sides) * Math.PI * 2, ((i + 1) / sides) * Math.PI * 2);
    }
  } else {
    const bands = [0.74, 0.6, 0.46, 0.3];
    for (let k = 0; k + 1 < bands.length; k++) {
      sink.paint(iron(k % 2 === 0 ? 0.7 : 0.62));
      ring(sink, put, x, z, r * bands[k + 1]!, r * bands[k]!, sides);
    }
  }
  sink.paint(iron(0.66));
  ring(sink, put, x, z, 0, r * 0.3, sides);
}

/**
 * A gully at the kerb: a frame in the road's tone darkened and, inside it,
 * slots across the flow with the bars between them, darker than the frame
 * and lighter than the slots. 26 triangles.
 */
function gully(sink: Sink, put: Put, box: Aabb, alongZ: boolean, iron: (factor: number) => number): void {
  const frame = Math.min(box.x1 - box.x0, box.z1 - box.z0) * 0.14;
  const x0 = box.x0 + frame, x1 = box.x1 - frame, z0 = box.z0 + frame, z1 = box.z1 - frame;
  sink.paint(iron(0.78));
  flat(sink, put, box.x0, box.x1, box.z0, z0);
  flat(sink, put, box.x0, box.x1, z1, box.z1);
  flat(sink, put, box.x0, x0, z0, z1);
  flat(sink, put, x1, box.x1, z0, z1);
  // Nine strips along the kerb, slot and bar in turn, each across the flow.
  const strips = 9;
  for (let i = 0; i < strips; i++) {
    sink.paint(iron(i % 2 === 0 ? 0.5 : 0.68));
    if (alongZ) flat(sink, put, x0, x1, z0 + ((z1 - z0) * i) / strips, z0 + ((z1 - z0) * (i + 1)) / strips);
    else flat(sink, put, x0 + ((x1 - x0) * i) / strips, x0 + ((x1 - x0) * (i + 1)) / strips, z0, z1);
  }
}

// ---------------------------------------------------------------------------
// The town
// ---------------------------------------------------------------------------

/** An axis-aligned box in the town's plane, what everything is tested as. */
interface Aabb {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

function aabbOf(s: Solid, grow: number): Aabb {
  const ex = s.round ? s.hx : Math.abs(s.cos) * s.hx + Math.abs(s.sin) * s.hz;
  const ez = s.round ? s.hx : Math.abs(s.sin) * s.hx + Math.abs(s.cos) * s.hz;
  return { x0: s.x - ex - grow, x1: s.x + ex + grow, z0: s.z - ez - grow, z1: s.z + ez + grow };
}

const overlapping = (a: Aabb, b: Aabb): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** The yaw that turns a piece's front (+Z) to each side: east, north, west, south. */
const FACING_YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI] as const;
const SIDE_OUT: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * Dresses one town. Pure: the same input is the same buffer, bit for bit.
 */
export function dressTown(input: DressInput): Dressed {
  const started = performance.now();
  const { grid, levels, field, band } = input;
  const style = STYLES[input.region] ?? BASE;
  const sink = new Sink();
  const solids: Solid[] = [];
  const seats: DressSeat[] = [];
  const counts: Record<string, number> = {};
  const count = (kind: string): void => {
    counts[kind] = (counts[kind] ?? 0) + 1;
  };
  const budget = Math.max(0, input.budget);
  let dropped = 0;
  /**
   * The allowance so far. **The façades may take `FACADE_SHARE` of it and the
   * building line up to `LINE_SHARE`, and the paint what is left**, in that
   * order, because a street reads by its fronts first and a mark on the
   * paving is the cheapest thing to lose. With the paint laid first, Jaipur's
   * 952 tactile strips, 100 manholes and 103 drains took about 2,900 of its
   * 7,000 before a front was dressed (2026-09-28).
   */
  let cap = budget * FACADE_SHARE;
  /** Writes one piece and keeps it only if the town can afford it. */
  const afford = (write: () => void): boolean => {
    const mark = sink.mark();
    const anchored = sink.anchors.length;
    write();
    if (sink.triangles <= cap) return true;
    sink.rollback(mark);
    sink.anchors.length = anchored;
    dropped++;
    return false;
  };
  const pitch = grid.pitch;
  const cells = grid.cells;
  const half = grid.half;
  const matrix = new THREE.Matrix4();
  const at: number[] = [];

  /** The terrace under `(x, z)`, if it is paved, clear of a landmark and of any flight by `margin`. */
  const levelAt = (x: number, z: number, margin: number): number | null => {
    const level = levels.get(cellKey(cellIndex(grid, x), cellIndex(grid, z)));
    if (level === undefined) return null;
    if (input.blocked(x, z)) return null;
    if (flightAt(field, x, z, margin) !== null) return null;
    return level;
  };
  /** One level under every corner of a box, or null: nothing straddles a riser. */
  const levelUnder = (box: Aabb, margin: number): number | null => {
    const level = levelAt(box.x0, box.z0, margin);
    if (level === null) return null;
    for (const [x, z] of [[box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1], [(box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2]] as const) {
      if (levelAt(x, z, margin) !== level) return null;
    }
    return level;
  };
  const inMouth = (box: Aabb): boolean =>
    input.mouths.some(([x0, x1, z0, z1]) => box.x0 < x1 + 0.5 && box.x1 > x0 - 0.5 && box.z0 < z1 + 0.5 && box.z1 > z0 - 0.5);

  // --- what the paint on the paving is laid with ----------------------------------

  const walkOf = pavementOf;
  const middle = cells % 2 === 1 && cells >= 3 ? grid.shift : -1;
  let decals = 0;
  /** The marks laid so far, by the cells each reaches: a thousand a city, and only a cell's own are ever near. */
  const painted = new Map<number, Aabb[]>();
  /** A flat mark on the paving: a quad from `x0..x1` by `z0..z1`, or a disc. */
  /**
   * Lays a painted mark over `box`, or refuses it: off the paving, over a
   * riser or a flight, in a gate's mouth, on another mark, or past the
   * allowance (`cost`, its triangles at most). `write` draws it in the town's
   * plane through `put`, which lays a point of that plane on the paving
   * `DECAL_LIFT` over it. Every piece of a mark is in that one plane and none
   * overlaps another: a mark is a mosaic, laid flush, and never two layers.
   */
  const mark = (box: Aabb, cost: number, write: (put: Put) => void): boolean => {
    // Once the allowance is spent, nothing more is asked of the ground.
    if (sink.triangles + cost > cap) {
      dropped++;
      return false;
    }
    const level = levelUnder(box, 0.2);
    if (level === null || inMouth(box)) return false;
    // Two marks at one lift are one plane: a mark that would lie on another is not laid.
    for (let col = cellIndex(grid, box.x0); col <= cellIndex(grid, box.x1); col++) {
      for (let row = cellIndex(grid, box.z0); row <= cellIndex(grid, box.z1); row++) {
        if (painted.get(cellKey(col, row))?.some((other) => overlapping(box, other))) return false;
      }
    }
    const cx = (box.x0 + box.x1) / 2;
    const cz = (box.z0 + box.z1) / 2;
    // The paving under the mark as a plane: its middle and a unit either way.
    // The town's frame is the tangent plane at its middle, and the paving is
    // the sphere: a hundred units out it leans by a third of a degree, half the
    // lift over a strip two units long, so the mark takes the lean of the
    // paving it is on. Over a mark's own few units the sphere bows from that
    // plane by a hundred-thousandth.
    input.seat(cx, cz, level, at);
    const c0 = at[0]!, c1 = at[1]!, c2 = at[2]!;
    input.seat(cx + 1, cz, level, at);
    const u0 = at[0]! - c0, u1 = at[1]! - c1, u2 = at[2]! - c2;
    input.seat(cx, cz + 1, level, at);
    const v0 = at[0]! - c0, v1 = at[1]! - c1, v2 = at[2]! - c2;
    const put: Put = (x, z) => {
      const dx = x - cx;
      const dz = z - cz;
      return [c0 + dx * u0 + dz * v0, c1 + dx * u1 + dz * v1 + DECAL_LIFT, c2 + dx * u2 + dz * v2];
    };
    matrix.identity();
    sink.place(matrix);
    return afford(() => {
      write(put);
      seats.push({ kind: 'decal', x: c0, y: c1, z: c2, lift: DECAL_LIFT });
      // Filed under every cell it reaches, so a mark over a cell's edge is met from both.
      for (let col = cellIndex(grid, box.x0); col <= cellIndex(grid, box.x1); col++) {
        for (let row = cellIndex(grid, box.z0); row <= cellIndex(grid, box.z1); row++) {
          const list = painted.get(cellKey(col, row));
          if (list === undefined) painted.set(cellKey(col, row), [box]);
          else list.push(box);
        }
      }
      decals++;
    });
  };
  /** A mark of one colour over the whole of `box`. */
  const decal = (box: Aabb, color: number): boolean =>
    mark(box, 2, (put) => {
      sink.paint(color);
      flat(sink, put, box.x0, box.x1, box.z0, box.z1);
    });
  /** The road's own colour, darkened: what its ironwork is painted in, so a cover is the street's and not a hole in it. */
  const iron = (factor: number): number => shade(input.road, factor);
  const tactile = tone(P.gold, 0.95);

  /**
   * The streets of one cell, as `buildGround` paves them: a band on a low or
   * high edge where the cell across it is town too, or the whole cell where it
   * is an avenue. `lateral` is the street's centre line on the axis across it.
   */
  interface Street {
    alongZ: boolean;
    line: number;
    half: number;
    /** Which side of the line this cell's share is: +1, -1, or 0 for an avenue's two. */
    side: number;
  }
  const streetsOf = (col: number, row: number): Street[] => {
    const list: Street[] = [];
    const x0 = cellCentre(grid, col) - pitch / 2;
    const z0 = cellCentre(grid, row) - pitch / 2;
    if (grid.avenue[col] === 1) list.push({ alongZ: true, line: x0 + pitch / 2, half: pitch / 2, side: 0 });
    else {
      if (grid.low[col] === 1 && levels.has(cellKey(col - 1, row))) list.push({ alongZ: true, line: x0, half: band, side: 1 });
      if (grid.high[col] === 1 && levels.has(cellKey(col + 1, row))) list.push({ alongZ: true, line: x0 + pitch, half: band, side: -1 });
    }
    if (grid.avenue[row] === 1) list.push({ alongZ: false, line: z0 + pitch / 2, half: pitch / 2, side: 0 });
    else {
      if (grid.low[row] === 1 && levels.has(cellKey(col, row - 1))) list.push({ alongZ: false, line: z0, half: band, side: 1 });
      if (grid.high[row] === 1 && levels.has(cellKey(col, row + 1))) list.push({ alongZ: false, line: z0 + pitch, half: band, side: -1 });
    }
    return list;
  };

  /** Every paved cell, nearest the middle first: what a town dresses first is its centre. */
  const order = [...levels.keys()]
    .map((key) => {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      return { key, col, row, d: Math.hypot(cellCentre(grid, col), cellCentre(grid, row)) };
    })
    .sort((a, b) => a.d - b.d || a.key - b.key);

  // --- the façades ---------------------------------------------------------

  let facadesDressed = 0;
  const fronts = [...input.fronts]
    .map((front, index) => ({ front, index, d: Math.hypot(front.solid.x, front.solid.z) }))
    .sort((a, b) => a.d - b.d || a.index - b.index);
  for (const { front, index, d } of fronts) {
    // The least a front comes to is a shutter's pair; past that, nothing more fits.
    if (sink.triangles + 12 > cap) break;
    if (front.kind === 'civic') continue;
    const facade = facadeOf(front.flat);
    const rng = rngFrom(input.seed, 'facade', index);
    const central = Math.max(0, 1 - d / Math.max(1, half));
    const height = front.flat.height;
    sink.place(front.matrix);
    const mark = sink.mark();
    let wrote = false;
    /** What this front got, counted only if it is kept. */
    const got: string[] = [];
    // A block's ground floor is a shop more often than not; a house's is in a
    // town's middle, and more in a city than in a village.
    const shop =
      height >= 1.8 * STOREY &&
      (front.kind === 'block'
        ? rng.chance(style.shops * (0.55 + 0.45 * central))
        : rng.chance(style.houseShops * (0.3 + 0.7 * central) * (0.5 + 0.5 * input.urbanity)));
    if (shop) {
      // The awning's lowest edge clears a head (`AVATAR_HEIGHT`), and its top
      // stays under the first floor's windows over it.
      const drop = 0.18 * M;
      const valance = 0.12 * M;
      const headroom = AVATAR_HEIGHT * 1.03;
      const openings = facade.ground.filter((w) => w.x1 - w.x0 > 0.6);
      const spans = openings.length > 0
        ? openings.slice(0, 3).map((w) => [w.x0 - 0.2, w.x1 + 0.2] as const)
        : [[facade.minX + (facade.maxX - facade.minX) * 0.18, facade.maxX - (facade.maxX - facade.minX) * 0.18] as const];
      const fabric = rng.pick(style.fabrics);
      const reach = Math.min(0.75 * M, 1.6);
      let awned = false;
      for (const [a0, a1] of front.kind === 'block' || style.houseAwnings ? spans : []) {
        const x0 = Math.max(facade.minX + 0.1, a0);
        const x1 = Math.min(facade.maxX - 0.1, a1);
        if (x1 - x0 < 0.8) continue;
        const ceiling = Math.min(
          height - 0.4,
          ...facade.upper.filter((w) => w.x1 > x0 && w.x0 < x1).map((w) => w.y0 - 0.15),
        );
        const top = Math.max(headroom + drop + valance, facade.groundTop + 0.2);
        // The roller box stands 0.16 over the awning's top: it too stays under the windows.
        if (top + 0.2 > ceiling) continue;
        awning(sink, x0, x1, facade.wall, top, reach, drop, valance, fabric);
        awned = true;
        got.push('awning');
      }
      // A board over the shop where the wall has room between its window heads
      // and the floor above; a blade where it has not.
      const boardLow = Math.max(facade.groundTop + 0.12, awned ? headroom + drop + valance + 0.1 : facade.groundTop + 0.12);
      const boardHigh = Math.min(
        height - 0.3,
        ...facade.upper.map((w) => w.y0 - 0.12),
      );
      if (boardHigh - boardLow >= 0.45 && !awned) {
        const x0 = facade.minX + (facade.maxX - facade.minX) * 0.15;
        const x1 = facade.maxX - (facade.maxX - facade.minX) * 0.15;
        fascia(sink, rng, style, x0, x1, boardLow, Math.min(boardHigh, boardLow + 0.4 * M), facade.wall);
        got.push('sign');
      } else if (style.blade !== 'none' && rng.chance(style.blade === 'tall' ? 0.85 : 0.5)) {
        const tall = style.blade === 'tall';
        const reachOut = (tall ? 0.45 : 0.5) * M;
        const signHeight = tall ? Math.min(height - headroom - 0.6, rng.range(1.2, 2.2) * M) : 0.5 * M;
        const x = rng.chance(0.5) ? facade.minX + 0.35 : facade.maxX - 0.35;
        const clearOfWindows = !facade.upper.some((w) => x > w.x0 - 0.3 && x < w.x1 + 0.3);
        if (signHeight > 0.8 && clearOfWindows) {
          blade(sink, rng, style, x, facade.wall, headroom + 0.25, signHeight, reachOut);
          got.push('blade');
        }
      }
      wrote = got.length > 0;
    }
    // The windows upstairs: a box of flowers under some, shutters beside a
    // baked building's, an air conditioner under others. Never two on one.
    let boxes = 0;
    let conditioned = 0;
    const shuttered = front.baked && style.shutters > 0 && rng.chance(style.shutters);
    const shutterColor = rng.pick(style.shutterColors);
    const flowerShare = style.flowers * (front.kind === 'dwelling' ? 1.2 : 0.8);
    for (const w of facade.upper) {
      const width = w.x1 - w.x0;
      if (shuttered && width < 2.4) {
        const room = width / 2 + 0.1;
        const clear = !facade.windows.some((o) => o !== w && o.y1 > w.y0 && o.y0 < w.y1 && o.x1 > w.x0 - room && o.x0 < w.x1 + room);
        if (clear && w.x0 - room > front.flat.box.minX && w.x1 + room < front.flat.box.maxX) {
          shutters(sink, w, shutterColor);
          got.push('shutters');
          wrote = true;
        }
      }
      const below = facade.windows.some((o) => o !== w && o.y1 > w.y0 - 0.5 * M && o.y1 < w.y0 && o.x1 > w.x0 && o.x0 < w.x1);
      if (boxes < 8 && flowerShare > 0 && !below && rng.chance(flowerShare)) {
        flowerBox(sink, rng, w.x0 - 0.08, w.x1 + 0.08, w.y0 - 0.03, w.wall);
        got.push('flowers');
        boxes++;
        wrote = true;
      } else if (conditioned < 4 && style.aircon > 0 && rng.chance(style.aircon)) {
        const x = rng.chance(0.5) ? w.x0 + 0.4 * M : w.x1 - 0.4 * M;
        const top = w.y0 - 0.12;
        const clear = !facade.windows.some((o) => o !== w && o.y1 > top - 0.6 * M && o.y0 < top && o.x1 > x - 0.45 * M && o.x0 < x + 0.45 * M);
        if (clear && top - 0.55 * M > (shop ? AVATAR_HEIGHT * 1.3 : 1)) {
          aircon(sink, x, top, w.wall);
          got.push('aircon');
          conditioned++;
          wrote = true;
        }
      }
    }
    if (!wrote) continue;
    if (sink.triangles > cap) {
      sink.rollback(mark);
      dropped++;
      continue;
    }
    facadesDressed++;
    for (const kind of got) count(kind);
  }

  // --- the building line ------------------------------------------------------

  const facadeDone = performance.now();
  dressingStats.facadeMs += facadeDone - started;
  cap = budget * LINE_SHARE;

  // Everything in the way, and what this places, bucketed by the cells each
  // box reaches: a city stands a thousand walls, and a strip asks about its own.
  const buckets = new Map<number, Aabb[]>();
  const file = (box: Aabb): void => {
    for (let col = cellIndex(grid, box.x0); col <= cellIndex(grid, box.x1); col++) {
      for (let row = cellIndex(grid, box.z0); row <= cellIndex(grid, box.z1); row++) {
        const key = cellKey(col, row);
        const list = buckets.get(key);
        if (list === undefined) buckets.set(key, [box]);
        else list.push(box);
      }
    }
  };
  for (const solid of input.solids) file(aabbOf(solid, CLEAR));
  for (let i = 0; i + 2 < input.discs.length; i += 3) {
    const r = input.discs[i + 2]! + CLEAR;
    file({ x0: input.discs[i]! - r, x1: input.discs[i]! + r, z0: input.discs[i + 1]! - r, z1: input.discs[i + 1]! + r });
  }
  /** What stood in the way of the last piece refused, so the next try can start past it. */
  const refused: { by: Aabb | null } = { by: null };
  const clearOf = (box: Aabb): boolean => {
    for (let col = cellIndex(grid, box.x0); col <= cellIndex(grid, box.x1); col++) {
      for (let row = cellIndex(grid, box.z0); row <= cellIndex(grid, box.z1); row++) {
        for (const other of buckets.get(cellKey(col, row)) ?? []) {
          if (!overlapping(box, other)) continue;
          refused.by = other;
          return false;
        }
      }
    }
    return true;
  };

  /** Stands one piece with its front on a street side; false if it did not fit. */
  const stand = (piece: Piece, x: number, z: number, side: number, rng: Rng): boolean => {
    refused.by = null;
    const foot = FOOTPRINTS[piece];
    if (sink.triangles + foot.cost > cap) return false;
    const across = side % 2 === 0;
    const hx = (across ? foot.depth : foot.width) / 2;
    const hz = (across ? foot.width : foot.depth) / 2;
    const box: Aabb = { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
    if (!clearOf({ x0: box.x0 - ITEM_GAP / 2, x1: box.x1 + ITEM_GAP / 2, z0: box.z0 - ITEM_GAP / 2, z1: box.z1 + ITEM_GAP / 2 })) return false;
    if (inMouth(box)) return false;
    const level = levelUnder(box, 0.4);
    if (level === null) return false;
    input.seat(x, z, level, at);
    const yaw = FACING_YAW[side]!;
    matrix.makeRotationY(yaw).setPosition(at[0]!, at[1]!, at[2]!);
    sink.place(matrix);
    const fits = afford(() => drawPiece(sink, rng, piece, style, input.iso, input.models));
    if (!fits) return false;
    file(box);
    seats.push({ kind: piece, x: at[0]!, y: at[1]!, z: at[2]!, lift: 0 });
    count(piece);
    const wall = foot.solid;
    if (wall !== null) {
      const top = input.floorRadius(level) + wall.height;
      solids.push(wall.round ? disc(x, z, wall.hx, top) : yawed(x, z, yaw, wall.hx, wall.hz, top));
    }
    return true;
  };

  /**
   * The strips along the building line: a cell's plot rectangle, `FRONTAGE_DEPTH`
   * in from each side a street runs along, nearest the middle first.
   */
  interface Strip {
    col: number;
    row: number;
    side: number;
    /** The plot line and the along-range, in the town's plane. */
    edge: number;
    from: number;
    to: number;
    depth: number;
    central: number;
  }
  const strips: Strip[] = [];
  for (const { col, row, d } of order) {
    if (col === middle && row === middle) continue;
    if (grid.avenue[col] === 1 || grid.avenue[row] === 1) continue;
    const rect = input.plotRect(col, row);
    if (rect.x1 - rect.x0 < 1 || rect.z1 - rect.z0 < 1) continue;
    const central = Math.max(0, 1 - d / Math.max(1, half));
    const street = (index: number, low: boolean, alongZ: boolean): boolean => {
      const flag = low ? grid.low[index] : grid.high[index];
      const next = low ? index - 1 : index + 1;
      if (flag === 1) return levels.has(alongZ ? cellKey(next, row) : cellKey(col, next));
      return next >= 0 && next < cells && grid.avenue[next] === 1;
    };
    const sides: [number, boolean][] = [
      [0, street(col, false, true)],
      [1, street(row, false, false)],
      [2, street(col, true, true)],
      [3, street(row, true, false)],
    ];
    for (const [side, open] of sides) {
      if (!open) continue;
      const alongZ = side % 2 === 0;
      const edge = side === 0 ? rect.x1 : side === 1 ? rect.z1 : side === 2 ? rect.x0 : rect.z0;
      const depth = Math.min(FRONTAGE_DEPTH, (alongZ ? rect.x1 - rect.x0 : rect.z1 - rect.z0) * FRONTAGE_SHARE);
      strips.push({ col, row, side, edge, from: alongZ ? rect.z0 : rect.x0, to: alongZ ? rect.z1 : rect.x1, depth, central });
    }
  }

  // The town's singles first, on the strips nearest its middle: a post box, and
  // where the region has them a kiosk and a street clock.
  const singles: Piece[] = ['postbox'];
  if (input.urbanity > 0.15) singles.push('postbox');
  if (style.kiosk && input.urbanity > 0.25) singles.push('kiosk', 'clock');
  const fill = Math.min(0.85, 0.3 + input.urbanity * 0.55);
  let items = 0;
  const most = Math.round(10 + input.urbanity * 70);
  for (const strip of strips) {
    if (items >= most || sink.triangles + 12 > cap) break;
    const rng = rngFrom(input.seed, 'frontage', strip.col, strip.row, strip.side);
    const [ox, oz] = SIDE_OUT[strip.side]!;
    const alongZ = strip.side % 2 === 0;
    // Village strips thin out towards the edge; a city's hardly do.
    const share = fill * (0.35 + 0.65 * strip.central) + input.urbanity * 0.15;
    let cursor = strip.from + 0.3;
    // A single is tried along a strip near the middle that is deep enough for it, and only there.
    let single = singles.length > 0 && strip.central > 0.3 && FOOTPRINTS[singles[0]!].depth <= strip.depth;
    while (cursor < strip.to - 0.3 && items < most) {
      const piece: Piece = single ? singles[0]! : rng.weighted(style.furniture);
      const foot = FOOTPRINTS[piece];
      if (foot.depth > strip.depth) {
        cursor += 0.6;
        continue;
      }
      const drawn = single || rng.chance(share);
      if (!drawn) {
        cursor += rng.range(1, 3);
        continue;
      }
      const inward = LINE_BACK + foot.depth / 2;
      const along = cursor + foot.width / 2;
      if (along + foot.width / 2 > strip.to - 0.2) break;
      const x = alongZ ? strip.edge - ox * inward : along;
      const z = alongZ ? along : strip.edge - oz * inward;
      if (stand(piece, x, z, strip.side, rng)) {
        items++;
        // One single a strip: the next waits for the next strip, so two post boxes never stand together.
        if (single) {
          singles.shift();
          single = false;
        }
        cursor += foot.width + ITEM_GAP + rng.range(0, 1.5);
      } else {
        // Past whatever was in the way — a building's whole front at once — or half a unit on.
        const by = refused.by;
        const past = by === null ? -Infinity : (alongZ ? by.z1 : by.x1) - (along - foot.width / 2) + ITEM_GAP;
        cursor += Math.max(0.5, past);
      }
    }
  }

  // Bollards along the kerbs of the four arms of a city's middle crossing, on
  // the pavement's outer edge where a car would mount it, the first few
  // metres out from the zebras.
  if (middle >= 0 && input.urbanity > 0.3 && levels.has(cellKey(middle, middle))) {
    const walk = walkOf(pitch * 0.5);
    const kerb = pitch * 0.5 - walk + 0.12 + FOOTPRINTS.bollard.depth / 2;
    const c = cellCentre(grid, middle);
    for (let side = 0; side < 4; side++) {
      const [ox, oz] = SIDE_OUT[side]!;
      const rng = rngFrom(input.seed, 'bollards', side);
      for (const across of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          // Out along the arm from the crossing's edge, and across it to the kerb.
          const out = pitch * 0.5 + 0.8 + k * 0.6 * M;
          const x = c + ox * out + (ox === 0 ? across * kerb : 0);
          const z = c + oz * out + (oz === 0 ? across * kerb : 0);
          stand('bollard', x, z, side, rng);
        }
      }
    }
  }

  // --- the paint, last: what is left of the allowance ---------------------------

  cap = budget;
  const lineDone = performance.now();
  dressingStats.lineMs += lineDone - facadeDone;
  // The warning pads on the pavement corners of the middle crossing, where the zebras are.
  if (middle >= 0 && levels.has(cellKey(middle, middle))) {
    const c = cellCentre(grid, middle);
    const walk = walkOf(pitch * 0.5);
    const inset = pitch * 0.5 - walk;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = c + sx * (inset + walk / 2);
        const z = c + sz * (inset + walk / 2);
        const r = walk / 2 - 0.15;
        if (r > 0.25 && decal({ x0: x - r, x1: x + r, z0: z - r, z1: z + r }, tactile)) count('tactile-pad');
      }
    }
  }

  for (const { col, row } of order) {
    if (col === middle && row === middle) continue;
    const rng = rngFrom(input.seed, 'street-paint', col, row);
    const streets = streetsOf(col, row);
    // Where the cell's streets cross, a street along one axis is carriageway
    // for the other's width: its own paint keeps to the stretch between.
    const x0 = cellCentre(grid, col) - pitch / 2;
    const z0 = cellCentre(grid, row) - pitch / 2;
    for (const street of streets) {
      const walk = walkOf(street.half);
      const cross = streets.filter((other) => other.alongZ !== street.alongZ);
      const start = street.alongZ ? z0 : x0;
      let from = start;
      let to = start + pitch;
      for (const other of cross) {
        if (other.side === 0) continue;
        // A band on the low edge of the cell: its carriageway is [line, line + half - walk].
        if (other.side > 0) from = Math.max(from, other.line + other.half - walk);
        else to = Math.min(to, other.line - other.half + walk);
      }
      if (cross.some((other) => other.side === 0)) continue;
      const shares = street.side === 0 ? [1, -1] : [street.side];
      for (const share of shares) {
        // The guide strip down the middle of the pavement, and its end at a corner.
        if (style.tactile) {
          const lateral = street.line + share * (street.half - walk / 2);
          const w = 0.2 * M;
          if (walk > w + 0.4) {
            let a = from + 0.15;
            const end = to - 0.15;
            // In runs of a body-metre, so a flight or a mouth only takes its own stretch.
            while (a < end - 0.3) {
              const b = Math.min(end, a + 1.2 * M);
              const box: Aabb = street.alongZ
                ? { x0: lateral - w / 2, x1: lateral + w / 2, z0: a, z1: b }
                : { x0: a, x1: b, z0: lateral - w / 2, z1: lateral + w / 2 };
              if (decal(box, tactile)) count('tactile-strip');
              a = b + 0.02;
            }
          }
        }
        // A gully at the kerb, in the carriageway's edge: one a street every few cells.
        if (street.half - walk > 1.2 && rng.chance(DRAIN_SHARE)) {
          const lateral = street.line + share * (street.half - walk - 0.3);
          const along = rng.range(from + 0.2 * pitch, to - 0.2 * pitch);
          const a = 0.22 * M;
          const b = 0.45 * M;
          const box: Aabb = street.alongZ
            ? { x0: lateral - a / 2, x1: lateral + a / 2, z0: along - b / 2, z1: along + b / 2 }
            : { x0: along - b / 2, x1: along + b / 2, z0: lateral - a / 2, z1: lateral + a / 2 };
          if (mark(box, GULLY_COST, (put) => gully(sink, put, box, street.alongZ, iron))) count('drain');
        }
      }
      // A manhole in the carriageway, off the centre line, and not in every cell.
      if (rng.chance(MANHOLE_SHARE)) {
        const r = 0.3 * M;
        const room = street.half - walk - r - 0.3;
        const inner = LINE_HALF + r + 0.25;
        if (room > inner) {
          const share = street.side === 0 ? (rng.chance(0.5) ? 1 : -1) : street.side;
          const lateral = street.line + share * rng.range(inner, room);
          const along = rng.range(from + 0.25 * pitch, to - 0.25 * pitch);
          const x = street.alongZ ? lateral : along;
          const z = street.alongZ ? along : lateral;
          const radial = rng.chance(0.5);
          if (mark({ x0: x - r, x1: x + r, z0: z - r, z1: z + r }, MANHOLE_COST, (put) => manhole(sink, put, x, z, r, radial, iron))) count('manhole');
        }
      }
    }
  }

  const triangles = sink.triangles;
  const vertices = triangles * 3;
  const out: Dressed = {
    position: new Float32Array(sink.position),
    normal: new Float32Array(sink.normal),
    color: new Float32Array(sink.color),
    glow: new Uint8Array(sink.glow),
    triangles,
    emits: sink.glow.some((value, i) => i % 2 === 0 && value > 0),
    solids,
    seats,
    anchors: sink.anchors,
    counts,
  };
  if (out.position.length !== vertices * 3 || out.glow.length !== vertices * 2) {
    throw new Error('street-dressing: the buffers came out different lengths');
  }
  dressingStats.towns++;
  dressingStats.triangles += triangles;
  dressingStats.items += items;
  dressingStats.facades += facadesDressed;
  dressingStats.decals += decals;
  dressingStats.dropped += dropped;
  dressingStats.paintMs += performance.now() - lineDone;
  dressingStats.ms += performance.now() - started;
  return out;
}

// ---------------------------------------------------------------------------
// A sample, for `pnpm scenery`
// ---------------------------------------------------------------------------

/** What `sampleDressing` laid, piece by piece: its name and how many triangles it came to. */
export interface SamplePiece {
  name: string;
  triangles: number;
}

/**
 * Every piece this file draws for one region, in a row on y = 0, and every
 * façade piece on a wall standing at z = 0 facing +Z — built by the same
 * functions a town is dressed with, so `pnpm scenery` can hold them to the
 * kit's rules (no two colours in one plane, normals that agree with their
 * winding, the same buffer twice) without raising a town.
 */
export function sampleDressing(region: string, iso: string, variant: number, models: PropModels | null = null): { dressed: Dressed; pieces: SamplePiece[] } {
  const style = STYLES[region] ?? BASE;
  const sink = new Sink();
  const pieces: SamplePiece[] = [];
  const matrix = new THREE.Matrix4();
  const rng = rngFrom('sample', region, variant);
  const record = (name: string, write: () => void): void => {
    const before = sink.triangles;
    write();
    pieces.push({ name, triangles: sink.triangles - before });
  };
  let x = 0;
  for (const piece of Object.keys(FOOTPRINTS) as Piece[]) {
    matrix.makeRotationY(variant * 0.7).setPosition(x, 0, 6 * M);
    sink.place(matrix);
    record(piece, () => drawPiece(sink, rng, piece, style, iso, models));
    x += FOOTPRINTS[piece].width + 2;
  }
  matrix.identity();
  sink.place(matrix);
  const wall = 0;
  const w: Window = { x0: -0.6, x1: 0.6, y0: 6, y1: 7.6, z: wall + 0.16, wall };
  record('awning', () => awning(sink, -3, 3, wall, AVATAR_HEIGHT * 1.03 + 0.3 * M, 0.75 * M, 0.18 * M, 0.12 * M, rng.pick(style.fabrics)));
  record('fascia', () => fascia(sink, rng, style, 4, 9, 4, 4 + 0.4 * M, wall));
  record('blade', () => blade(sink, rng, { ...style, blade: 'tall' }, 11, wall, AVATAR_HEIGHT, 2 * M, 0.45 * M));
  record('blade-square', () => blade(sink, rng, { ...style, blade: 'square' }, 13, wall, AVATAR_HEIGHT, 0.5 * M, 0.5 * M));
  record('flower-box', () => flowerBox(sink, rng, w.x0 - 0.08, w.x1 + 0.08, w.y0 - 0.03, wall));
  record('shutters', () => shutters(sink, { ...w, x0: 16, x1: 17.2 }, rng.pick(style.shutterColors)));
  record('aircon', () => aircon(sink, 21, 7, wall));
  // The ironwork, laid flush on a plane at y = 0 in the road's colour.
  const put: Put = (px, pz) => [px, DECAL_LIFT, pz + 12];
  const road = (factor: number): number => shade(P.slate, factor);
  record('manhole', () => manhole(sink, put, 2, 0, 0.3 * M, false, road));
  record('manhole-radial', () => manhole(sink, put, 5, 0, 0.3 * M, true, road));
  record('gully', () => gully(sink, put, { x0: 8, x1: 8 + 0.22 * M, z0: -0.5, z1: -0.5 + 0.45 * M }, true, road));
  record('gully-across', () => gully(sink, put, { x0: 11, x1: 11 + 0.45 * M, z0: -0.5, z1: -0.5 + 0.22 * M }, false, road));
  const triangles = sink.triangles;
  return {
    dressed: {
      position: new Float32Array(sink.position),
      normal: new Float32Array(sink.normal),
      color: new Float32Array(sink.color),
      glow: new Uint8Array(sink.glow),
      triangles,
      emits: sink.glow.some((value, i) => i % 2 === 0 && value > 0),
      solids: [],
      seats: [],
      anchors: sink.anchors,
      counts: {},
    },
    pieces,
  };
}

/** The most a piece on the building line comes to, by name, for the check; undefined for a façade's. */
export function pieceCost(name: string): number | undefined {
  return (FOOTPRINTS as Record<string, Footprint | undefined>)[name]?.cost;
}

/** The regions this file has a style for, for the check. */
export const DRESSING_REGIONS = Object.keys(STYLES);
