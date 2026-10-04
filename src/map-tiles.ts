/**
 * The map's paper: a pyramid of tiles painted from the world's own
 * definitions, shared by the disc in the corner (`minimap.ts`) and the sheet
 * behind `M` (`map.ts`), on Earth and on every other world alike.
 *
 * ## What a tile is
 *
 * **Miller cylindrical, 256 pixels square, a quadtree of levels** — the
 * sheet's own projection (`map.ts` explains why Miller), so a level-`z` tile
 * is a 1/2^z by 1/2^z square of the sheet, `u` east from the antimeridian
 * and `v` south from the pole. The disc reprojects the same tiles onto its
 * own orthographic paper a tile at a time (an affine each, from the tile's
 * corners through `setFrame`'s basis), so the two maps draw one paper and
 * cannot show two different worlds.
 *
 * **Painted, never photographed.** Nothing here renders the 3D world. The
 * ground is `groundColorAt` (the land's own colour law, lushed and blotted
 * as the land's shader does it: `lushOf`, `patchesOf`) or a world's
 * `surface.colorAt`, lit by a hill shade from `reliefAt` stepped into the
 * cel ramp's bands, with the water, the lakes and the shallows from the very
 * rings `countryAt` reads. Over it, from a zoom where they are a pixel wide,
 * a `MapFeatures` painter draws what stands: the roads on their own
 * `coursePath`, the railway, the towns as their plans — every building's
 * plan box with its roof's colour, the streets in the floor's colours — the
 * fields, the woods, the landmarks' plans, the strips and the pads
 * (`map-features.ts`, `worlds/map-features.ts`).
 *
 * The painter is pure and canvas-free (`raster.ts`): the same key gives the
 * same bytes in any browser and in Node, which is what lets
 * `scripts/build-maps.ts` pre-paint the planet-scale levels into
 * `public/maps/` and `scripts/check-maps.ts` hold a tile to its own repaint.
 *
 * ## What it costs, and where it is paid
 *
 * A ground tile is a lattice of `groundColorAt` (40 microseconds a point),
 * a lattice of `reliefAt` and a compose of 65,536 pixels; a near tile adds a
 * few hundred buildings. All of it is a generator that yields every few
 * rows or features, run by `pump` inside an allowance: the frame's near share
 * for the tiles the disc is showing now, the far share (`'maptiles'`, its own
 * turn in `view.ts`) for the rest, and the sheet's own while it is open.
 * Until a tile is painted its nearest painted ancestor stands in, scaled.
 *
 * **What was painted once is not painted again.** A finished tile is kept in
 * memory (least recently drawn let go past `MAX_TILES`) and written to
 * IndexedDB (`tile-store.ts`) under a key carrying the data's stamp and the
 * style's version, so a place seen yesterday opens painted; and the first
 * `BAKED_LEVELS` levels come from `public/maps/<world>/z<k>.png`, one image a
 * level, so the whole planet is there on the first open of `M`. Without
 * IndexedDB, or without the bake, everything still paints; it only costs
 * more.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import type { PlanetSurface } from './planet.ts';
import { PLANET_RADIUS, coastEdges, groundColorAt, lushOf, patchesOf } from './globe.ts';
import { reliefAt } from './terrain.ts';
import { OCEAN_COLOR, PALETTE } from './theme.ts';
import { type XYZ, latLonOf, unitAt } from './sphere.ts';
import { type SheetRing, ringsForTile } from './map-outline.ts';
import { Raster, toByte } from './raster.ts';
import { type TileStore, openTileStore } from './tile-store.ts';
import { mayBuild } from './view.ts';

const DEG = Math.PI / 180;
const R2D = 180 / Math.PI;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

/** Miller's `y` at a pole: `1.25 ln tan(pi/4 + 0.4 * pi/2)`. */
export const Y_MAX = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.2 * Math.PI));
/** The sheet's height when its width is 1. */
export const SHEET_HEIGHT = (2 * Y_MAX) / TAU;

export const uOf = (lon: number): number => (lon + 180) / 360;
export const vOf = (lat: number): number =>
  (Y_MAX - 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * Math.max(-89.999, Math.min(89.999, lat)) * DEG))) / TAU;
export const lonOfU = (u: number): number => {
  const lon = u * 360 - 180;
  return lon - 360 * Math.floor((lon + 180) / 360);
};
export const latOfV = (v: number): number =>
  (2.5 * Math.atan(Math.exp(0.8 * (Y_MAX - v * TAU))) - 0.625 * Math.PI) * R2D;

/** Tile edge, pixels. */
export const TILE = 256;
/**
 * The deepest level: 728 pixels a degree, 0.38 world units a pixel at the
 * equator — a house is twenty-odd pixels and its roof's colour reads. At
 * level 9 Paris was 250 pixels across the sheet's closest zoom and its
 * houses ten (2026-10-04, by eye); a level-10 tile costs no more than a
 * level-9 one, there are only four times as many of them on the screen.
 */
export const MAX_LEVEL = 10;
/** Rows of tiles at a level: the sheet is not square. */
export const rowsAt = (z: number): number => Math.ceil(SHEET_HEIGHT * 2 ** z);
/**
 * The levels pre-painted by `scripts/build-maps.ts`: 1 + 2 + 4 + 12 tiles —
 * the whole planet up to a screenful of it at 1,024 pixels, which is the
 * sheet's widest zoom on a laptop.
 */
export const BAKED_LEVELS = 3;
/**
 * The style's version: part of every stored tile's key and of the bake's
 * stamp. Bump it when anything here or in a features painter changes what a
 * tile looks like, or yesterday's tiles are drawn beside today's.
 */
export const MAP_STYLE = 'maps-1';

/** Pixels of mask painted round a tile, so the shallows do not stop at its edge. */
const PAD = 12;
/**
 * One `groundColorAt` every this many pixels, blended between, by level: the
 * baked levels at 4 (they are painted offline, and at 16 a level-2 lattice
 * point was 5.6 degrees and the Sahara came out in stripes), the sheet's
 * opening zooms at 8, and 16 from level 7, where a lattice step is a few
 * dozen units and the colour does not move across it.
 */
const colourStepAt = (z: number): number => (z < BAKED_LEVELS ? 4 : z < 7 ? 8 : 16);
/** One `reliefAt` every this many pixels; the light is blended between. Coarser at the near levels, where the relief is smooth across a tile. */
const RELIEF_STEP = 2;
const NEAR_RELIEF_STEP = 4;
const NEAR_RELIEF_FROM = 7;
/**
 * On a world with no sea (`PlanetSurface.sea`), the colour lattice is finer
 * and the relief's coarser: its ground's colour comes in patches the
 * 16-pixel blend smeared into a wash, and its relief costs three or four
 * times Earth's microsecond a point.
 */
const DRY_COLOUR_STEP = 8;
const DRY_RELIEF_STEP = 4;
/** How much of a nation's colour its ground takes on a world with no sea, which has no coast to read a map by. */
const NATION_TINT = 0.5;
/** How far the shallows reach off a coast, in tile pixels, as two box passes. */
const SHALLOW_RADIUS = 5;
/** Rows of a tile composed between yields: a step a few milliseconds long on a slow machine. */
const COMPOSE_ROWS = 16;
/**
 * **The hill shade is stepped, as the land is lit.** The world is one sun
 * across a four-band ramp (`theme.ts`), and a smooth shaded relief under an
 * inked map read as a photograph pasted under a drawing. So the light from
 * the north-west is cut into these bands — the lattice's values are the
 * bands, and the blend between two lattice points is the only softening, a
 * pixel or two at a band's edge — dark, shade, lit and the light's own
 * slope. Measured by eye on the Alps, the Atlas and the Andes (2026-10-04):
 * three bands lost the valleys, five read as contour lines.
 */
const SHADE_EDGES = [0.84, 0.95, 1.06] as const;
const SHADE_BANDS = [0.76, 0.9, 1.0, 1.1] as const;
/** Tiles held past the baked levels, the least recently drawn let go first. */
const MAX_TILES = 260;
/**
 * How long a tile may wait on a features painter's data (a town's plan,
 * worked out between the towns' own builds) before it is painted without
 * it, ms. Such a tile is drawn and not stored, and painted again the next
 * time it is wanted once `INCOMPLETE_KEEP_MS` has passed.
 */
const WAIT_LIMIT_MS = 6000;
/**
 * How long a stored tile's read may take before the tile is painted instead,
 * ms. A read is a few milliseconds of IndexedDB's own, but its answer waits
 * for the main thread, and in a software-rendered frame of half a second a
 * read took five (headless, 2026-10-04).
 */
const STORE_PATIENCE_MS = 4000;
const INCOMPLETE_KEEP_MS = 15000;

// ---------------------------------------------------------------------------
// What a features painter is handed
// ---------------------------------------------------------------------------

/** An affine from a local frame's `(x, z)`, world units, to tile pixels. */
export interface Affine {
  ox: number;
  oy: number;
  /** Pixels for one unit along local `x`, and along local `z`. */
  xx: number;
  xy: number;
  zx: number;
  zy: number;
}

/** One tile, as a features painter sees it. */
export interface TileView {
  readonly z: number;
  readonly i: number;
  readonly j: number;
  /** The tile's top-left corner on the sheet, and pixels per sheet unit. */
  readonly u0: number;
  readonly v0: number;
  readonly scale: number;
  /** Its extent in degrees: `west` may be under -180 by nothing; the tile is inside one copy of the sheet. */
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
  /** World units a pixel, east-west at the tile's middle latitude. */
  readonly unitsPerPixel: number;
  /** The planet's radius, world units. */
  readonly radius: number;
  /** A latitude and longitude to tile pixels, the longitude taken on the copy nearest the tile. */
  px(lat: number, lon: number, out: { x: number; y: number }): void;
  /** A point on the sphere (any length) to tile pixels. */
  at(point: XYZ, out: { x: number; y: number }): void;
  /**
   * A local frame — a town's, a landmark's — as an affine onto the tile,
   * from the frame's own three vectors: nothing here assumes which way its
   * `x` points (on this planet `across` is west; `landmarkFrame`).
   */
  frame(up: XYZ, across: XYZ, north: XYZ, out: Affine): Affine;
  /** Whether a point in pixels is within `margin` of the tile. */
  inside(x: number, y: number, margin: number): boolean;
  /** True once the tile has waited `WAIT_LIMIT_MS` for data: paint what is known and say so. */
  readonly hurry: boolean;
  /** Set by a painter that painted without data it waited for: the tile is not stored. */
  incomplete: boolean;
}

/**
 * What stands, painted over the ground. A generator so a tile with a city on
 * it yields between its streets: `undefined` is "more to do", `'wait'` is
 * "data I asked for is not there yet" — the tile is put back and the next
 * one painted meanwhile.
 */
export interface MapFeatures {
  /** Part of every stored tile's key: what the painter's data is (counts, versions). */
  readonly stamp: string;
  /** The first level anything is drawn at; the ground alone above it. */
  readonly fromLevel: number;
  paint(view: TileView, raster: Raster): Generator<'wait' | undefined, void, void>;
}

// ---------------------------------------------------------------------------
// The painter: pure, canvas-free
// ---------------------------------------------------------------------------

export interface TilePainterOptions {
  world: World;
  /** The body; Earth when omitted. */
  surface?: PlanetSurface;
  features?: MapFeatures;
}

export interface TilePainter {
  /** The rings on the sheet, which `map.ts` draws its coast and frontiers from. */
  rings(): SheetRing[];
  /** The ground's stamp: the style, the body and its outlines. What the bake is keyed on. */
  readonly groundStamp: string;
  /** And with the features': what a stored tile is keyed on. */
  readonly stamp: string;
  /** The first level the features painter draws at, or `Infinity` with none: under it a map draws its own roads and towns. */
  readonly fromLevel: number;
  /** One tile, in steps; `features` false paints the ground alone (the bake's levels). */
  paint(z: number, i: number, j: number, raster: Raster, view?: { hurry: boolean; incomplete: boolean }, features?: boolean): Generator<'wait' | undefined, void, void>;
  /** The same, to its end, waiting on nothing: for the bake and the checks. */
  paintNow(z: number, i: number, j: number, features?: boolean): { raster: Raster; incomplete: boolean };
}

/** The data's stamp: a body, its rings and their points, cheap enough to take at load. */
function outlineStamp(world: World): string {
  let points = 0;
  for (const ring of world.rings ?? []) points += ring.points.length;
  return `${(world.rings ?? []).length}r${points}p`;
}

/**
 * The world's rings on the sheet, once: what the tiles' land mask is filled
 * from and what `map.ts` inks its coast and frontiers with.
 */
export function sheetRingsOf(world: World, surface?: PlanetSurface): SheetRing[] {
  const steps = sheetRingSteps(world, surface);
  for (;;) {
    const step = steps.next();
    if (step.done === true) return step.value;
  }
}

/**
 * The same in steps, `RING_STEP` rings at a time: 2,875 rings and 188,507
 * points are 31 ms (headless, 2026-10-04), which a tile's first step must
 * not be. (`coastEdges` is the world's own, cached, and worked out at load.)
 */
function* sheetRingSteps(world: World, surface?: PlanetSurface): Generator<undefined, SheetRing[], void> {
  const source = world.rings ?? [];
  const dry = surface !== undefined && !surface.sea;
  const coast = source.length > 0 ? (surface === undefined ? coastEdges : surface.coastEdges)(world) : [];
  yield;
  const out: SheetRing[] = [];
  for (let r = 0; r < source.length; r++) {
    if (r > 0 && r % RING_STEP === 0) yield;
    out.push(sheetRing(world, source[r]!, coast[r], dry));
  }
  return out;
}

const RING_STEP = 240;

function sheetRing(world: World, ring: World['rings'][number], flags: Uint8Array | undefined, dry: boolean): SheetRing {
  {
    const n = ring.points.length;
    const u = new Float32Array(n);
    const v = new Float32Array(n);
    const edge = new Uint8Array(n);
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const [lon, lat] = ring.points[k]!;
      u[k] = uOf(lon!);
      v[k] = vOf(lat!);
      if (u[k]! < u0) u0 = u[k]!;
      if (u[k]! > u1) u1 = u[k]!;
      if (v[k]! < v0) v0 = v[k]!;
      if (v[k]! > v1) v1 = v[k]!;
    }
    for (let k = 0; k < n; k++) {
      const [lonA, latA] = ring.points[k]!;
      const [lonB, latB] = ring.points[(k + 1) % n]!;
      // Not an edge of anything: a ring's run along a pole, or the seam
      // where Natural Earth cut a country at the antimeridian. Drawn, both
      // are a line across the ice or down the Bering Strait.
      const seam =
        (Math.abs(latA!) > 89.9 && Math.abs(latB!) > 89.9) ||
        (Math.abs(lonA!) > 179.99 && Math.abs(lonB!) > 179.99);
      // A surface's `coastEdges` may say 2 itself: on a walked world, the
      // straight cut between two rings of one nation (`worlds/surface.ts`).
      edge[k] = seam || flags?.[k] === 2 ? 2 : ring.water || (flags?.[k] ?? 0) === 1 ? 1 : 0;
    }
    const color = dry ? world.countries[ring.country - 1]?.color : undefined;
    return {
      u, v, edge, u0, u1, v0, v1, water: ring.water, levels: [],
      ...(color === undefined ? {} : { fill: `#${color.toString(16).padStart(6, '0')}`, fillHex: color }),
    };
  }
}

/** A tile's view: the projection a features painter draws through. */
function tileView(z: number, i: number, j: number, radius: number): TileView & { hurry: boolean } {
  const n = 2 ** z;
  const scale = TILE * n;
  const u0 = i / n;
  const v0 = j / n;
  const west = u0 * 360 - 180;
  const east = west + 360 / n;
  const north = latOfV(v0);
  const south = latOfV(Math.min(SHEET_HEIGHT, v0 + 1 / n));
  const midLat = (north + south) / 2;
  const unitsPerPixel = ((360 / scale) * radius * DEG) * Math.max(0.02, Math.cos(midLat * DEG));
  const midU = u0 + 0.5 / n;
  const scratch = { lat: 0, lon: 0 };
  const px = (lat: number, lon: number, out: { x: number; y: number }): void => {
    let u = uOf(lon);
    u -= Math.round(u - midU);
    out.x = (u - u0) * scale;
    out.y = (vOf(lat) - v0) * scale;
  };
  const view = {
    z, i, j, u0, v0, scale, south, north, west, east, unitsPerPixel, radius,
    hurry: false,
    incomplete: false,
    px,
    at(point: XYZ, out: { x: number; y: number }) {
      latLonOf(point, scratch);
      px(scratch.lat, scratch.lon, out);
    },
    frame(up: XYZ, across: XYZ, northward: XYZ, out: Affine): Affine {
      // Three points of the frame through the projection, ten units apart:
      // on a 16,000-unit sphere the tangent plane is the ground to a
      // hundredth of a unit there, and the affine is the projection's own
      // derivative at the frame's centre.
      const step = 10 / radius;
      const o = { x: 0, y: 0 };
      const a = { x: 0, y: 0 };
      const b = { x: 0, y: 0 };
      view.at(up, o);
      view.at({ x: up.x + across.x * step, y: up.y + across.y * step, z: up.z + across.z * step }, a);
      view.at({ x: up.x + northward.x * step, y: up.y + northward.y * step, z: up.z + northward.z * step }, b);
      out.ox = o.x;
      out.oy = o.y;
      out.xx = (a.x - o.x) / 10;
      out.xy = (a.y - o.y) / 10;
      out.zx = (b.x - o.x) / 10;
      out.zy = (b.y - o.y) / 10;
      return out;
    },
    inside(x: number, y: number, margin: number) {
      return x >= -margin && y >= -margin && x <= TILE + margin && y <= TILE + margin;
    },
  };
  return view;
}

export function createTilePainter(options: TilePainterOptions): TilePainter {
  const { world, surface, features } = options;
  const RADIUS = surface?.radius ?? PLANET_RADIUS;
  const UNITS_PER_DEG = RADIUS * DEG;
  const dry = surface !== undefined && !surface.sea;
  const unitScratch = new THREE.Vector3();
  const colourOf = (point: THREE.Vector3, out: THREE.Color): THREE.Color => {
    if (surface !== undefined) return surface.colorAt(unitScratch.copy(point).normalize(), out);
    groundColorAt(world, point, out);
    // As the land's shader draws it: lushed, then blotted (`globe.ts`).
    lushOf(out);
    return patchesOf(out, point.x, point.y, point.z);
  };
  const reliefOf = surface === undefined ? reliefAt : surface.reliefAt;
  const groundStamp = `${MAP_STYLE}:${surface?.id ?? 'earth'}:${outlineStamp(world)}`;
  const stamp = `${groundStamp}:${features?.stamp ?? '-'}`;

  let sheetRings: SheetRing[] | null = null;
  const rings = (): SheetRing[] => (sheetRings ??= sheetRingsOf(world, surface));
  /** The rings built a slice at a time by whichever tile asks first; the rest wait on it. */
  let ringJob: Generator<undefined, SheetRing[], void> | null = null;
  function* ringsReady(): Generator<undefined, void, void> {
    while (sheetRings === null) {
      ringJob ??= sheetRingSteps(world, surface);
      const step = ringJob.next();
      if (step.done === true) {
        sheetRings = step.value;
        ringJob = null;
      } else yield;
    }
  }

  const M = TILE + 2 * PAD;
  const maskRaster = new Raster(M, M);
  const nationRaster = dry ? new Raster(M, M) : null;
  const colourScratch = new THREE.Color();
  const pointScratch = new THREE.Vector3();
  const oceanDeep = new THREE.Color(OCEAN_COLOR);
  const oceanShallow = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.62);
  const fallbackLand = new THREE.Color(PALETTE.green);
  const nationColour = new THREE.Color();

  function* ground(z: number, i: number, j: number, raster: Raster): Generator<undefined, void, void> {
    yield* ringsReady();
    const scaleZ = TILE * 2 ** z;
    const u0 = i / 2 ** z;
    const v0 = j / 2 ** z;
    const colourStep = dry ? Math.min(DRY_COLOUR_STEP, colourStepAt(z)) : colourStepAt(z);
    const reliefStep = dry ? DRY_RELIEF_STEP : z >= NEAR_RELIEF_FROM ? NEAR_RELIEF_STEP : RELIEF_STEP;

    // The land, filled from the outlines, and the lakes cut back out of it.
    // On a world with no sea every ring is filled in its nation's colour
    // instead, and the land is everywhere.
    const land = new Float32Array(M * M);
    const coverage = new Float32Array(M * M);
    const uMin = u0 - PAD / scaleZ;
    const uMax = u0 + (TILE + PAD) / scaleZ;
    const vMin = v0 - PAD / scaleZ;
    const vMax = v0 + (TILE + PAD) / scaleZ;
    nationRaster?.clear(0, 0, 0);
    // Each ring thinned to this tile's own zoom (`map-outline.ts`).
    for (const pass of [false, true]) {
      ringsForTile(rings(), scaleZ, uMin, uMax, vMin, vMax, pass, (level, wrap, ring) => {
        const n = level.u.length;
        for (let k = 0; k < n; k++) {
          const x = (level.u[k]! + wrap - u0) * scaleZ + PAD;
          const y = (level.v[k]! - v0) * scaleZ + PAD;
          if (k === 0) maskRaster.moveTo(x, y);
          else maskRaster.lineTo(x, y);
        }
        maskRaster.close();
        if (nationRaster !== null && !pass) {
          const fill = (ring as SheetRing & { fillHex?: number }).fillHex ?? 0xffffff;
          for (let k = 0; k < n; k++) {
            const x = (level.u[k]! + wrap - u0) * scaleZ + PAD;
            const y = (level.v[k]! - v0) * scaleZ + PAD;
            if (k === 0) nationRaster.moveTo(x, y);
            else nationRaster.lineTo(x, y);
          }
          // Stroked a pixel wide too, so the straight cuts between two rings
          // of one nation leave no hairline between them.
          nationRaster.close();
          nationRaster.outline(level.u.map((u) => (u + wrap - u0) * scaleZ + PAD), level.v.map((v) => (v - v0) * scaleZ + PAD), n, 0.75);
          nationRaster.fill((fill >> 16) & 0xff, (fill >> 8) & 0xff, fill & 0xff);
          maskRaster.outline(level.u.map((u) => (u + wrap - u0) * scaleZ + PAD), level.v.map((v) => (v - v0) * scaleZ + PAD), n, 0.75);
        }
        maskRaster.cover(coverage, pass);
      });
    }
    let anyLand = false;
    for (let k = 0; k < M * M; k++) {
      land[k] = dry ? 1 : coverage[k]!;
      if (land[k]! > 0) anyLand = true;
    }
    yield;

    // The shallows: the land blurred twice, horizontally then vertically,
    // read only on the water.
    const near = new Float32Array(M * M);
    if (anyLand && !dry) {
      const row = new Float32Array(M * M);
      const R = SHALLOW_RADIUS;
      for (let pass = 0; pass < 2; pass++) {
        const from = pass === 0 ? land : near;
        for (let y = 0; y < M; y++) {
          let sum = 0;
          for (let x = -R; x <= R; x++) sum += from[y * M + Math.min(M - 1, Math.max(0, x))]!;
          for (let x = 0; x < M; x++) {
            row[y * M + x] = sum / (2 * R + 1);
            sum += from[y * M + Math.min(M - 1, x + R + 1)]! - from[y * M + Math.max(0, x - R)]!;
          }
        }
        for (let x = 0; x < M; x++) {
          let sum = 0;
          for (let y = -R; y <= R; y++) sum += row[Math.min(M - 1, Math.max(0, y)) * M + x]!;
          for (let y = 0; y < M; y++) {
            near[y * M + x] = sum / (2 * R + 1);
            sum += row[Math.min(M - 1, y + R + 1) * M + x]! - row[Math.max(0, y - R) * M + x]!;
          }
        }
      }
    }
    yield;

    // The colour, on a lattice, wherever there is land within reach of a
    // lattice point. `groundColorAt` answers over the sea too — a colour for
    // the ground that is not there — which is what a blend across a coast
    // wants.
    const GN = TILE / colourStep + 1;
    const lattice = new Float32Array(GN * GN * 3);
    const known = new Uint8Array(GN * GN);
    if (anyLand) {
      for (let gy = 0; gy < GN; gy++) {
        for (let gx = 0; gx < GN; gx++) {
          const mx = Math.min(M - 1, gx * colourStep + PAD);
          const my = Math.min(M - 1, gy * colourStep + PAD);
          if (near[my * M + mx]! <= 0 && land[my * M + mx]! <= 0) continue;
          const lat = latOfV(Math.min(SHEET_HEIGHT, v0 + (gy * colourStep) / scaleZ));
          const lon = lonOfU(u0 + (gx * colourStep) / scaleZ);
          unitAt(lat, lon, pointScratch).multiplyScalar(RADIUS);
          colourOf(pointScratch, colourScratch);
          const g = gy * GN + gx;
          lattice[g * 3] = colourScratch.r;
          lattice[g * 3 + 1] = colourScratch.g;
          lattice[g * 3 + 2] = colourScratch.b;
          known[g] = 1;
        }
        yield;
      }
    }

    // The relief, on a lattice of its own a step round the tile so every
    // point inside has neighbours, and the light worked out on that lattice.
    // Where the lattice is over water the ground is taken as flat.
    const RS = reliefStep;
    const RN = TILE / RS + 3;
    const relief = new Float32Array(RN * RN);
    const light = new Float32Array(RN * RN).fill(SHADE_BANDS[2]);
    if (anyLand) {
      for (let ry = 0; ry < RN; ry++) {
        const py = (ry - 1) * RS;
        const lat = latOfV(Math.min(SHEET_HEIGHT, Math.max(0, v0 + py / scaleZ)));
        const my = Math.min(M - 1, Math.max(0, py + PAD));
        for (let rx = 0; rx < RN; rx++) {
          const px = (rx - 1) * RS;
          const mx = Math.min(M - 1, Math.max(0, px + PAD));
          if (land[my * M + mx]! <= 0 && near[my * M + mx]! < 0.02) continue;
          unitAt(lat, lonOfU(u0 + px / scaleZ), pointScratch);
          relief[ry * RN + rx] = Math.max(0, reliefOf(pointScratch.x, pointScratch.y, pointScratch.z));
        }
        if ((ry & 3) === 3) yield;
      }
      // The light is from the north-west, as every printed relief map has it,
      // and the exaggeration grows as the pixel does: at the world's scale a
      // pixel is 400 units and a 680-unit range is a two-pixel bump.
      for (let ry = 1; ry < RN - 1; ry++) {
        const lat = latOfV(Math.min(SHEET_HEIGHT, Math.max(0, v0 + ((ry - 1) * RS) / scaleZ)));
        const unitsX = ((360 * RS) / scaleZ) * Math.max(0.05, Math.cos(lat * DEG)) * UNITS_PER_DEG;
        const unitsY = ((TAU * RS * Math.cos(0.8 * lat * DEG)) / scaleZ) * R2D * UNITS_PER_DEG;
        const lift = Math.min(14, Math.max(1.6, Math.sqrt(unitsX / RS / 6)));
        for (let rx = 1; rx < RN - 1; rx++) {
          const k = ry * RN + rx;
          const sx = ((relief[k + 1]! - relief[k - 1]!) / (2 * unitsX)) * lift;
          const sy = ((relief[k + RN]! - relief[k - RN]!) / (2 * unitsY)) * lift;
          // n . L over L.z, so flat ground is exactly 1: L = (-1, -1, sqrt 2) / 2.
          const shade = (0.5 * sx + 0.5 * sy + 0.7071) / Math.sqrt(sx * sx + sy * sy + 1) / 0.7071;
          light[k] = shade < SHADE_EDGES[0] ? SHADE_BANDS[0] : shade < SHADE_EDGES[1] ? SHADE_BANDS[1] : shade < SHADE_EDGES[2] ? SHADE_BANDS[2] : SHADE_BANDS[3];
        }
      }
    }

    // Composed, a band of rows at a time.
    const out = raster.data;
    const nation = nationRaster?.data;
    for (let y = 0; y < TILE; y++) {
      if (y > 0 && y % COMPOSE_ROWS === 0) yield;
      const ly = y / RS + 1;
      const ly0 = Math.floor(ly);
      const lfy = ly - ly0;
      const gy = y / colourStep;
      const gy0 = Math.min(GN - 2, Math.floor(gy));
      const fy = gy - gy0;
      for (let x = 0; x < TILE; x++) {
        const m = (y + PAD) * M + (x + PAD);
        const a = land[m]!;
        let r = oceanDeep.r;
        let g = oceanDeep.g;
        let b = oceanDeep.b;
        const shallow = Math.min(1, near[m]! * 2.2);
        if (shallow > 0) {
          const s = Math.sqrt(shallow);
          r += (oceanShallow.r - r) * s;
          g += (oceanShallow.g - g) * s;
          b += (oceanShallow.b - b) * s;
        }
        if (a > 0) {
          const gx = x / colourStep;
          const gx0 = Math.min(GN - 2, Math.floor(gx));
          const fx = gx - gx0;
          let lr = 0;
          let lg = 0;
          let lb = 0;
          let weight = 0;
          for (let c = 0; c < 4; c++) {
            const cx = gx0 + (c & 1);
            const cy = gy0 + (c >> 1);
            const idx = cy * GN + cx;
            if (known[idx] === 0) continue;
            const w = ((c & 1) === 1 ? fx : 1 - fx) * ((c >> 1) === 1 ? fy : 1 - fy) + 1e-4;
            lr += lattice[idx * 3]! * w;
            lg += lattice[idx * 3 + 1]! * w;
            lb += lattice[idx * 3 + 2]! * w;
            weight += w;
          }
          if (weight > 0) {
            lr /= weight;
            lg /= weight;
            lb /= weight;
          } else {
            lr = fallbackLand.r;
            lg = fallbackLand.g;
            lb = fallbackLand.b;
          }
          const lx = x / RS + 1;
          const lx0 = Math.floor(lx);
          const lfx = lx - lx0;
          const k = ly0 * RN + lx0;
          const shade =
            (light[k]! * (1 - lfx) + light[k + 1]! * lfx) * (1 - lfy) +
            (light[k + RN]! * (1 - lfx) + light[k + RN + 1]! * lfx) * lfy;
          if (nation !== undefined) {
            // The nation's own colour over its ground, before the light.
            nationColour.setRGB(nation[m * 4]! / 255, nation[m * 4 + 1]! / 255, nation[m * 4 + 2]! / 255, THREE.SRGBColorSpace);
            const t = Math.min(1, coverage[m]!) * NATION_TINT;
            lr += (nationColour.r - lr) * t;
            lg += (nationColour.g - lg) * t;
            lb += (nationColour.b - lb) * t;
          }
          lr *= shade;
          lg *= shade;
          lb *= shade;
          r += (lr - r) * a;
          g += (lg - g) * a;
          b += (lb - b) * a;
        }
        const o = (y * TILE + x) * 4;
        // THREE's colours are linear; the tile is sRGB.
        out[o] = toByte(r);
        out[o + 1] = toByte(g);
        out[o + 2] = toByte(b);
        out[o + 3] = 255;
      }
    }
  }

  function* paint(
    z: number,
    i: number,
    j: number,
    raster: Raster,
    state: { hurry: boolean; incomplete: boolean } = { hurry: true, incomplete: false },
    withFeatures = true,
  ): Generator<'wait' | undefined, void, void> {
    yield* ground(z, i, j, raster);
    if (!withFeatures || features === undefined || z < features.fromLevel) return;
    const view = tileView(z, i, j, RADIUS);
    Object.defineProperty(view, 'hurry', { get: () => state.hurry });
    yield* features.paint(view, raster);
    if (view.incomplete) state.incomplete = true;
  }

  return {
    rings,
    groundStamp,
    stamp,
    fromLevel: features?.fromLevel ?? Infinity,
    paint,
    paintNow(z, i, j, withFeatures = true) {
      const raster = new Raster(TILE, TILE);
      const state = { hurry: true, incomplete: false };
      const steps = paint(z, i, j, raster, state, withFeatures);
      while (steps.next().done !== true) {
        // To its end: a painter asked to hurry never waits.
      }
      return { raster, incomplete: state.incomplete };
    },
  };
}

// ---------------------------------------------------------------------------
// The cache and the schedule: the browser's half
// ---------------------------------------------------------------------------

/** A tile held: its picture, or the job painting it. */
export interface MapTile {
  readonly z: number;
  readonly i: number;
  readonly j: number;
  /** The picture, and where in it the tile is: a baked level is one image for the whole level. */
  image: CanvasImageSource | null;
  sx: number;
  sy: number;
  state: 'new' | 'loading' | 'painting' | 'ready';
  job: Generator<'wait' | undefined, void, void> | null;
  raster: Raster | null;
  run: { hurry: boolean; incomplete: boolean } | null;
  /** When it began waiting on data, and when a tile painted without it may be painted again. */
  waitingSince: number;
  staleAfter: number;
  used: number;
  /** Milliseconds its job has run so far, waiting excluded. */
  work: number;
}

/** Where to draw a tile from: its own picture or an ancestor's corner of one. */
export interface TileSource {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  /** The source square's edge, in the image's pixels. */
  size: number;
  /** How many levels up it came from: 0 is the tile itself. */
  up: number;
}

export interface MapTilesOptions extends TilePainterOptions {
  /** Where the bake put this world's levels (`public/maps/<id>/`), or nothing to paint them. */
  baked?: string;
  /** The stored tiles (`tile-store.ts`): opened under the painter's stamp when omitted, none with null. */
  store?: TileStore | null;
}

export interface MapTilesStats {
  /** Tiles held with a picture, and how many that are wanted are still to come. */
  ready: number;
  pending: number;
  /** Of those, how many are being read (the bake, the store) and how many wait on a features painter's data. */
  loading: number;
  waiting: number;
  /** Painted here since load, read from the store, and from the bake. */
  painted: number;
  stored: number;
  baked: number;
  /** The bake: where it is read from, and whether its stamp was this painter's (null while asked). */
  bake: { from: string | null; current: boolean | null };
  /** The median and the slowest time to paint a tile, by level, in ms of work (not of waiting). */
  paintMs: Record<number, { median: number; worst: number; count: number }>;
  /**
   * The most one `pump` kept to the frame's allowance spent, ms (`frame`),
   * and the median of the last 120 that painted anything: what a frame pays
   * while tiles fill. An open sheet's own pumps are not in it.
   */
  worstPumpMs: number;
  medianPumpMs: number;
}

export interface MapTiles {
  readonly painter: TilePainter;
  /** Bumped whenever a tile becomes drawable: a consumer that drew an older one redraws. */
  readonly version: number;
  /** The tile, created the first time it is asked for; nothing is painted until a `want` lists it. */
  tile(z: number, i: number, j: number): MapTile;
  /**
   * What a consumer wants painted, nearest first, replacing what it wanted
   * last time: the disc's `'minimap'`, the sheet's `'map'`, its warming
   * `'warm'`. `pump` serves the lists in the order they are first given.
   * `near` says whose allowance a list's painting is out of, when `pump` is
   * asked to keep to the frame's (`view.ts`): the frame's near share for
   * what is on the screen now, the far share's turn (`'maptiles'`) for the
   * rest.
   */
  want(who: string, tiles: readonly MapTile[], near?: boolean): void;
  /**
   * Runs jobs for at most `budgetMs`, the first list first; true if a tile
   * became drawable. `frame` keeps each list to the frame's allowance as
   * well (`mayBuild`); the open sheet, which is all the player is looking
   * at, paints on its own budget.
   */
  pump(budgetMs: number, frame?: boolean): boolean;
  /** The picture to draw for a tile: its own, or the nearest ancestor's corner. */
  source(z: number, i: number, j: number, out: TileSource): boolean;
  readonly stats: MapTilesStats;
  /** Lets go of every tile held but the baked levels: what is wanted next comes from the store or is painted. For the console. */
  forget(): void;
  dispose(): void;
}

/**
 * A fetch tried again on a network failure, `BAKE_TRIES` times a
 * `BAKE_RETRY_MS` apart: entering a world from the solar system, the bake's
 * first request failed outright ("Failed to fetch", 2026-10-04, headless)
 * and a failure cached for the session painted every planet-scale tile.
 */
async function fetchRetry(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (attempt >= BAKE_TRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, BAKE_RETRY_MS * attempt));
    }
  }
}
const BAKE_TRIES = 4;
const BAKE_RETRY_MS = 1200;

/** The level whose pixels are no larger than a screen pixel at this many screen pixels a sheet unit. */
export function levelFor(pixelsPerUnit: number): number {
  return Math.min(MAX_LEVEL, Math.max(0, Math.ceil(Math.log2(pixelsPerUnit / TILE) - 0.15)));
}

export function createMapTiles(options: MapTilesOptions): MapTiles {
  const painter = createTilePainter(options);
  const store = options.store === undefined ? openTileStore(painter.stamp) : options.store;
  const tiles = new Map<number, MapTile>();
  const key = (z: number, i: number, j: number): number => z * 4_194_304 + i * 2048 + j;
  // In the order they are served: what the disc shows now, then the open
  // sheet's screenful, then what is warmed for a sheet not yet opened.
  const lists = new Map<string, readonly MapTile[]>([['minimap', []], ['map', []], ['warm', []]]);
  const nearLists = new Set<string>();
  let version = 0;
  let useClock = 0;
  let painted = 0;
  let stored = 0;
  let bakedCount = 0;
  let worstPumpMs = 0;
  const pumps: number[] = [];
  const times = new Map<number, number[]>();
  let disposed = false;

  // The bake: one image a level, fetched on the first ask; a level whose
  // image fails is painted like any other.
  const bakedLevels: (Promise<ImageBitmap | null> | ImageBitmap | null | undefined)[] = [];
  let bakeChecked: Promise<boolean> | boolean | null = null;
  function bakeOk(): Promise<boolean> | boolean {
    if (options.baked === undefined) return false;
    if (bakeChecked !== null) return bakeChecked;
    bakeChecked = fetchRetry(`${options.baked}stamp.txt`)
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => (bakeChecked = text.trim() === painter.groundStamp))
      .catch(() => (bakeChecked = false));
    return bakeChecked;
  }
  function bakedLevel(z: number): Promise<ImageBitmap | null> | ImageBitmap | null {
    const known = bakedLevels[z];
    if (known !== undefined) return known;
    const loading = Promise.resolve(bakeOk())
      .then((ok) => (ok ? fetchRetry(`${options.baked}z${z}.png`) : null))
      .then((response) => (response !== null && response.ok ? response.blob() : null))
      .then((blob) => (blob === null ? null : createImageBitmap(blob)))
      .catch(() => null)
      .then((bitmap) => (bakedLevels[z] = bitmap));
    bakedLevels[z] = loading;
    return loading;
  }

  let bakedAsked = false;
  const storeKey = (tile: MapTile): string => `${painter.stamp}/${tile.z}/${tile.i}/${tile.j}`;

  function ready(tile: MapTile, image: CanvasImageSource, sx: number, sy: number): void {
    if (disposed || tiles.get(key(tile.z, tile.i, tile.j)) !== tile) {
      // Let go meanwhile: its own bitmap goes with it, a baked level's stays.
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap && tile.z >= BAKED_LEVELS) image.close();
      return;
    }
    tile.image = image;
    tile.sx = sx;
    tile.sy = sy;
    tile.state = 'ready';
    tile.job = null;
    tile.raster = null;
    version++;
  }

  function begin(tile: MapTile): void {
    tile.state = 'painting';
    tile.raster = new Raster(TILE, TILE);
    tile.run = { hurry: false, incomplete: false };
    tile.waitingSince = 0;
    tile.job = painter.paint(tile.z, tile.i, tile.j, tile.raster, tile.run);
  }

  /** Starts a tile: the bake's level, the store, or a paint. */
  function start(tile: MapTile): void {
    tile.state = 'loading';
    if (tile.z < BAKED_LEVELS && options.baked !== undefined) {
      Promise.resolve(bakedLevel(tile.z)).then((bitmap) => {
        if (bitmap === null) begin(tile);
        else {
          bakedCount++;
          ready(tile, bitmap, tile.i * TILE, tile.j * TILE);
        }
      });
      return;
    }
    if (store === null) {
      begin(tile);
      return;
    }
    // A read that has not come back in `STORE_PATIENCE_MS` is given up on and
    // the tile painted: a store busy writing (or wedged) must not hold a tile.
    Promise.race([store.get(storeKey(tile)), new Promise<null>((resolve) => setTimeout(() => resolve(null), STORE_PATIENCE_MS))]).then(
      (blob) => {
        if (tile.state !== 'loading') return;
        if (blob === null) {
          begin(tile);
          return;
        }
        createImageBitmap(blob).then(
          (bitmap) => {
            stored++;
            ready(tile, bitmap, 0, 0);
          },
          () => begin(tile),
        );
      },
      () => begin(tile),
    );
  }

  /** A painted raster as a picture, drawn at once and stored when it is whole. */
  function finish(tile: MapTile, workMs: number): void {
    const raster = tile.raster!;
    const whole = tile.run?.incomplete !== true;
    painted++;
    const list = times.get(tile.z) ?? [];
    list.push(workMs);
    if (list.length > 64) list.shift();
    times.set(tile.z, list);
    const image = new ImageData(raster.data, TILE, TILE);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE;
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    ready(tile, canvas, 0, 0);
    if (!whole) tile.staleAfter = performance.now() + INCOMPLETE_KEEP_MS;
    // A bitmap when the browser has made one, and the canvas let go.
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(image).then(
        (bitmap) => {
          if (tile.image === canvas) tile.image = bitmap;
          else bitmap.close();
        },
        () => {
          // The canvas serves.
        },
      );
    }
    if (whole && store !== null) {
      canvas.toBlob((blob) => {
        if (blob !== null) store.put(storeKey(tile), blob);
      }, 'image/png');
    }
  }

  function drop(tile: MapTile): void {
    if (typeof ImageBitmap !== 'undefined' && tile.image instanceof ImageBitmap && tile.z >= BAKED_LEVELS) tile.image.close();
    tile.image = null;
    tile.job?.return(undefined);
    tile.job = null;
    tile.raster = null;
    tiles.delete(key(tile.z, tile.i, tile.j));
  }

  function evict(): void {
    if (tiles.size <= MAX_TILES + 40) return;
    const wanted = new Set<MapTile>();
    for (const list of lists.values()) for (const tile of list) wanted.add(tile);
    const loose = [...tiles.values()].filter((tile) => tile.z >= BAKED_LEVELS && !wanted.has(tile));
    loose.sort((a, b) => a.used - b.used);
    for (let k = 0; k < loose.length - MAX_TILES; k++) drop(loose[k]!);
  }

  function tileAt(z: number, i: number, j: number): MapTile {
    const k = key(z, i, j);
    let tile = tiles.get(k);
    if (tile !== undefined && tile.state === 'ready' && tile.staleAfter > 0 && performance.now() > tile.staleAfter) {
      // Painted without data it waited for, long enough ago: once more.
      drop(tile);
      tile = undefined;
    }
    if (tile === undefined) {
      tile = { z, i, j, image: null, sx: 0, sy: 0, state: 'new', job: null, raster: null, run: null, waitingSince: 0, staleAfter: 0, used: 0, work: 0 };
      tiles.set(k, tile);
    }
    tile.used = ++useClock;
    return tile;
  }

  const api: MapTiles = {
    painter,
    get version() {
      return version;
    },
    tile: tileAt,
    want(who, list, near = false) {
      // The baked levels, all of them, on the first ask: a fetch a level, and
      // every tile then has an ancestor to stand in for it from the start.
      if (!bakedAsked && options.baked !== undefined) {
        bakedAsked = true;
        for (let z = 0; z < BAKED_LEVELS; z++) {
          for (let j = 0; j < rowsAt(z); j++) for (let i = 0; i < 2 ** z; i++) start(tileAt(z, i, j));
        }
      }
      const was = lists.get(who) ?? [];
      lists.set(who, list);
      if (near) nearLists.add(who);
      else nearLists.delete(who);
      // **A tile nobody wants any more stops being painted, and lets go of
      // what its job holds** — its raster and its masks, a megabyte and a
      // quarter — or a quick pan left a trail of half-painted tiles each
      // holding one. It starts again from nothing if it is wanted again.
      if (was.length > 0) {
        const wanted = new Set<MapTile>();
        for (const other of lists.values()) for (const tile of other) wanted.add(tile);
        for (const tile of was) {
          if (wanted.has(tile) || tile.state !== 'painting') continue;
          tile.job?.return(undefined);
          tile.job = null;
          tile.raster = null;
          tile.run = null;
          tile.work = 0;
          tile.waitingSince = 0;
          tile.state = 'new';
        }
      }
      evict();
    },
    pump(budgetMs, frame = false) {
      const began = performance.now();
      let changed = false;
      const before = version;
      outer: for (const [who, list] of lists) {
        const near = nearLists.has(who);
        const open = (): boolean => (frame ? mayBuild(began, budgetMs, near, 'maptiles') : performance.now() - began < budgetMs);
        for (const tile of list) {
          if (!open()) {
            if (near) continue outer;
            break outer;
          }
          if (tile.state === 'new') start(tile);
          if (tile.state !== 'painting' || tile.job === null) continue;
          const now = performance.now();
          if (tile.waitingSince > 0) {
            if (now - tile.waitingSince > WAIT_LIMIT_MS) tile.run!.hurry = true;
          }
          const tileBegan = now;
          for (;;) {
            const step = tile.job.next();
            if (step.done === true) {
              tile.work += performance.now() - tileBegan;
              finish(tile, tile.work);
              break;
            }
            if (step.value === 'wait') {
              if (tile.waitingSince === 0) tile.waitingSince = performance.now();
              break;
            }
            if (!open()) break;
          }
          if (tile.state === 'painting') tile.work += performance.now() - tileBegan;
        }
      }
      changed = version !== before;
      const spent = performance.now() - began;
      if (frame && spent > 0.05) {
        worstPumpMs = Math.max(worstPumpMs, spent);
        pumps.push(spent);
        if (pumps.length > 120) pumps.shift();
      }
      return changed;
    },
    source(z, i, j, out) {
      const n = 2 ** z;
      const wrapI = ((i % n) + n) % n;
      for (let up = 0; up <= z; up++) {
        const tile = tiles.get(key(z - up, wrapI >> up, j >> up));
        if (tile?.image == null) continue;
        tile.used = ++useClock;
        const part = TILE / 2 ** up;
        out.image = tile.image;
        out.size = part;
        out.sx = tile.sx + (wrapI - ((wrapI >> up) << up)) * part;
        out.sy = tile.sy + (j - ((j >> up) << up)) * part;
        out.up = up;
        return true;
      }
      return false;
    },
    get stats() {
      let readyCount = 0;
      let pending = 0;
      let loading = 0;
      let waiting = 0;
      const wanted = new Set<MapTile>();
      for (const list of lists.values()) for (const tile of list) wanted.add(tile);
      for (const tile of tiles.values()) {
        if (tile.state === 'ready') readyCount++;
        else if (tile.state !== 'new' && (wanted.has(tile) || tile.z < BAKED_LEVELS)) pending++;
        if (tile.state === 'loading') loading++;
        if (tile.state === 'painting' && tile.waitingSince > 0) waiting++;
      }
      // What is wanted and not yet begun is pending too.
      for (const tile of wanted) if (tile.state === 'new') pending++;
      const paintMs: MapTilesStats['paintMs'] = {};
      for (const [z, list] of times) {
        const sorted = [...list].sort((a, b) => a - b);
        paintMs[z] = { median: Number((sorted[sorted.length >> 1] ?? 0).toFixed(1)), worst: Number((sorted[sorted.length - 1] ?? 0).toFixed(1)), count: list.length };
      }
      const sortedPumps = [...pumps].sort((a, b) => a - b);
      return {
        ready: readyCount,
        pending,
        loading,
        waiting,
        painted,
        stored,
        baked: bakedCount,
        bake: { from: options.baked ?? null, current: typeof bakeChecked === 'boolean' ? bakeChecked : null },
        paintMs,
        worstPumpMs: Number(worstPumpMs.toFixed(2)),
        medianPumpMs: Number((sortedPumps[sortedPumps.length >> 1] ?? 0).toFixed(2)),
      };
    },
    forget() {
      for (const tile of [...tiles.values()]) if (tile.z >= BAKED_LEVELS) drop(tile);
      for (const who of lists.keys()) lists.set(who, []);
      version++;
    },
    dispose() {
      disposed = true;
      for (const tile of [...tiles.values()]) drop(tile);
      for (const level of bakedLevels) if (level instanceof ImageBitmap) level.close();
      lists.clear();
    },
  };
  return api;
}
