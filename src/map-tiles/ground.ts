import * as THREE from 'three';
import { unitAt } from '../sphere.ts';
import { MAX_RELIEF } from '../terrain.ts';
import { type Grain, contourInterval, grainAt, grainOf } from './texture.ts';
import { type SheetRing, ringsForTile } from '../map-outline.ts';
import { type Raster, toByte } from '../raster.ts';
import { BAKED_LEVELS, DEG, R2D, SHEET_HEIGHT, TAU, TILE, latOfV, lonOfU } from './projection.ts';

/** Pixels of mask painted round a tile, so the shallows and the open sea's shade do not stop at its edge. */
export const PAD = 28;
/** The mask's edge, pixels. */
const M = TILE + 2 * PAD;
/**
 * One `groundColorAt` every this many pixels, blended between, by level: the
 * baked levels use a finer lattice (they are painted offline), the sheet's
 * opening zooms a middle one, and from level 7 a lattice step is a few dozen
 * units and the colour does not move across it.
 */
const colourStepAt = (z: number): number => (z < BAKED_LEVELS ? 4 : z < 7 ? 8 : 16);
/** One `reliefAt` every this many pixels; the light is blended between. Coarser at the near levels, where the relief is smooth across a tile. */
const RELIEF_STEP = 2;
const NEAR_RELIEF_STEP = 4;
const NEAR_RELIEF_FROM = 7;
/** On a world with no sea the colour lattice is finer and the relief's coarser: its ground comes in patches, and its relief costs more a point. */
const DRY_COLOUR_STEP = 8;
const DRY_RELIEF_STEP = 4;
/** How much of a nation's colour its ground takes on a world with no sea, which has no coast to read a map by. */
const NATION_TINT = 0.5;
/** How far the shallows reach off a coast, in tile pixels, as two box passes. */
const SHALLOW_RADIUS = 5;
/** How far the coast's lee reaches before the sea is open and darkest, the same way: under `PAD` with both passes. */
const OPEN_RADIUS = 13;
/**
 * The swell drawn round a coast, as a chart and a game map draw it: two thin
 * lines where the blurred land falls to these values, one in the shallows'
 * field and one in the lee's, at this strength.
 */
const SWELL_NEAR = 0.07;
const SWELL_FAR = 0.1;
const SWELL_ALPHA = 0.42;
/** The wet line just off the sand: darker water a pixel or two wide. */
const WET_ALPHA = 0.35;
/** Rows of a tile composed between yields. */
const COMPOSE_ROWS = 16;
/**
 * The hill shade, from the north-west, held between these two and cut into
 * steps of `SHADE_STEP` (a ramp of many bands, as the land is lit), with the
 * contours inked over it, which are what keep it a drawing rather than a
 * photograph.
 */
const SHADE_MIN = 0.6;
const SHADE_MAX = 1.24;
const SHADE_STEP = 0.06;
/** How much the relief is exaggerated for the light over what the pixel's size alone asks. */
const HILL_LIFT = 3.2;
/** The contours' strength, an index line every `CONTOUR_INDEX` stronger, and the closest two lines are drawn, pixels. */
const CONTOUR_ALPHA = 0.42;
const CONTOUR_INDEX = 5;
const CONTOUR_INDEX_ALPHA = 0.65;
const CONTOUR_TIGHTEST = 2.5;
/** Snow over the high ground: from this share of the relief's ceiling to its whole. */
const SNOW_FROM = 0.66;
const SNOW_FULL = 0.85;
/**
 * The grain's strength on the land, its stipple on dry ground, the sea's
 * ripple, and how much of it the baked levels take: none, since they ship as
 * images and the grain is most of their size.
 */
const LAND_GRAIN = 0.2;
const STIPPLE = 0.16;
const SEA_GRAIN = 0.06;
const BAKED_GRAIN = 0;
/**
 * The height's own tint, as a relief map's: the ground turns towards the
 * upland's colour from `UPLAND_FROM` of the relief's ceiling to `UPLAND_FULL`,
 * at most `UPLAND_TINT`. Not on a world with no sea, whose ground is its
 * nations' colours and whose height is left to the light.
 */
const UPLAND_FROM = 0.06;
const UPLAND_FULL = 0.6;
const UPLAND_TINT = 0.5;

/** What a painter owns and every tile shares. */
export interface GroundEnv {
  readonly dry: boolean;
  readonly RADIUS: number;
  readonly UNITS_PER_DEG: number;
  readonly colourOf: (point: THREE.Vector3, out: THREE.Color) => THREE.Color;
  readonly reliefOf: (x: number, y: number, z: number) => number;
  readonly rings: () => SheetRing[];
  readonly ringsReady: () => Generator<undefined, void, void>;
  readonly maskRaster: Raster;
  readonly nationRaster: Raster | null;
  readonly colourScratch: THREE.Color;
  readonly pointScratch: THREE.Vector3;
  /** The sea from the open ocean in: the deep, the shelf, the shallows and the surf on them. */
  readonly oceanAbyss: THREE.Color;
  readonly oceanDeep: THREE.Color;
  readonly oceanShallow: THREE.Color;
  readonly oceanSurf: THREE.Color;
  /** The swell's lines, and the wet line along the sand. */
  readonly oceanSwell: THREE.Color;
  readonly oceanWet: THREE.Color;
  /** What high ground turns towards. */
  readonly upland: THREE.Color;
  /** And the highest of it. */
  readonly snow: THREE.Color;
  readonly fallbackLand: THREE.Color;
  readonly nationColour: THREE.Color;
}

/** A tile's place and the lattice steps its level uses. */
interface TileGeo {
  scaleZ: number;
  u0: number;
  v0: number;
  colourStep: number;
  reliefStep: number;
}

interface Mask {
  land: Float32Array;
  coverage: Float32Array;
  anyLand: boolean;
}

interface Lattice {
  GN: number;
  lattice: Float32Array;
  known: Uint8Array;
}

interface Light {
  RS: number;
  RN: number;
  light: Float32Array;
  /** The relief over its shelf in its own units, on the same lattice. */
  relief: Float32Array;
}

/** The land, filled from the outlines, and the lakes cut back out of it. */
function paintMask(env: GroundEnv, geo: TileGeo): Mask {
  const { dry, maskRaster, nationRaster, rings } = env;
  const { scaleZ, u0, v0 } = geo;
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
  return { land, coverage, anyLand };
}

/** The land blurred twice, horizontally then vertically, `R` pixels a pass: read only on the water. */
function blurLand(dry: boolean, land: Float32Array, anyLand: boolean, R: number): Float32Array {
  const near = new Float32Array(M * M);
  if (anyLand && !dry) {
    const row = new Float32Array(M * M);
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
  return near;
}

/** The colour, on a lattice, wherever there is land within reach of a lattice point. */
function* colourLattice(env: GroundEnv, geo: TileGeo, land: Float32Array, near: Float32Array, anyLand: boolean): Generator<undefined, Lattice, void> {
  const { RADIUS, colourOf, pointScratch, colourScratch } = env;
  const { scaleZ, u0, v0, colourStep } = geo;
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
  return { GN, lattice, known };
}

/** The relief, on a lattice of its own, and the light worked out on it. */
function* reliefLight(env: GroundEnv, geo: TileGeo, land: Float32Array, near: Float32Array, anyLand: boolean): Generator<undefined, Light, void> {
  const { UNITS_PER_DEG, reliefOf, pointScratch } = env;
  const { scaleZ, u0, v0, reliefStep } = geo;
  const RS = reliefStep;
  const RN = TILE / RS + 3;
  const relief = new Float32Array(RN * RN);
  const light = new Float32Array(RN * RN).fill(1);
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
      const lift = HILL_LIFT * Math.min(14, Math.max(1.6, Math.sqrt(unitsX / RS / 6)));
      for (let rx = 1; rx < RN - 1; rx++) {
        const k = ry * RN + rx;
        const sx = ((relief[k + 1]! - relief[k - 1]!) / (2 * unitsX)) * lift;
        const sy = ((relief[k + RN]! - relief[k - RN]!) / (2 * unitsY)) * lift;
        // n . L over L.z, so flat ground is exactly 1: L = (-1, -1, sqrt 2) / 2.
        const shade = (0.5 * sx + 0.5 * sy + 0.7071) / Math.sqrt(sx * sx + sy * sy + 1) / 0.7071;
        light[k] = Math.min(SHADE_MAX, Math.max(SHADE_MIN, 1 + (shade - 1) * 1.1));
      }
    }
  }
  return { RS, RN, light, relief };
}

/**
 * How much of a line of `half` pixels each side a field's level `c` draws at
 * pixel `m`: the distance to the level is the field's difference over its
 * gradient, so the line is as thin wherever the field is steep or shallow.
 */
function contour(field: Float32Array, m: number, c: number, half: number): number {
  const gx = (field[m + 1]! - field[m - 1]!) * 0.5;
  const gy = (field[m + M]! - field[m - M]!) * 0.5;
  const slope = Math.sqrt(gx * gx + gy * gy);
  if (slope < 1e-4) return 0;
  const d = Math.abs(field[m]! - c) / slope;
  return d >= half + 0.5 ? 0 : d <= half - 0.5 ? 1 : half + 0.5 - d;
}

/**
 * How far into a field's level `c` pixel `m` is, 0 outside and 1 inside, its
 * edge a pixel wide wherever the field is steep or shallow: a band's
 * anti-aliased edge.
 */
function band(field: Float32Array, m: number, c: number): number {
  const gx = (field[m + 1]! - field[m - 1]!) * 0.5;
  const gy = (field[m + M]! - field[m - M]!) * 0.5;
  const slope = Math.sqrt(gx * gx + gy * gy);
  const v = field[m]! - c;
  if (slope < 1e-4) return v > 0 ? 1 : 0;
  const t = v / slope + 0.5;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** What a tile's composition reads besides its fields: the grain and the contours' interval. */
interface Paper {
  coarse: Grain;
  middle: Grain;
  fine: Grain | null;
  /** How much of the grain is drawn: less on the baked levels, which ship as images and whose size it is. */
  grain: number;
  interval: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const mixInto = (c: Rgb, to: THREE.Color, t: number): void => {
  c.r += (to.r - c.r) * t;
  c.g += (to.g - c.g) * t;
  c.b += (to.b - c.b) * t;
};

/**
 * The sea at a pixel, in bands as a chart has them: the deep, the shelf in
 * the coast's lee, the shallows along it, each edge drawn by the swell's
 * line, and the wet line under the sand.
 */
function seaAt(env: GroundEnv, c: Rgb, m: number, mask: Mask, near: Float32Array, open: Float32Array, ripple: number): void {
  const { oceanAbyss, oceanDeep, oceanShallow, oceanSurf, oceanSwell, oceanWet } = env;
  const a = mask.land[m]!;
  const lee = open[m]!;
  c.r = oceanAbyss.r;
  c.g = oceanAbyss.g;
  c.b = oceanAbyss.b;
  if (lee > 0) {
    mixInto(c, oceanDeep, Math.min(1, lee / SWELL_FAR) * 0.4);
    mixInto(c, oceanDeep, band(open, m, SWELL_FAR));
    const lip = band(near, m, SWELL_NEAR);
    if (lip > 0) {
      mixInto(c, oceanShallow, lip);
      mixInto(c, oceanSurf, lip * Math.max(0, Math.min(1, (near[m]! - SWELL_NEAR) * 2.4)));
    }
    if (a < 1) {
      const swell = Math.max(contour(near, m, SWELL_NEAR, 0.55), contour(open, m, SWELL_FAR, 0.5) * 0.8) * SWELL_ALPHA * (1 - a);
      if (swell > 0) mixInto(c, oceanSwell, swell);
      const wet = contour(mask.land, m, 0.12, 0.9) * WET_ALPHA * (1 - a);
      if (wet > 0) mixInto(c, oceanWet, wet);
    }
  }
  const grain = 1 + (ripple - 0.5) * SEA_GRAIN;
  c.r *= grain;
  c.g *= grain;
  c.b *= grain;
}

/** The land's colour off the lattice at a pixel, blended between the points that know it. */
function latticeAt(env: GroundEnv, lat: Lattice, colourStep: number, x: number, y: number, c: Rgb): void {
  const { GN, lattice, known } = lat;
  const gx = x / colourStep;
  const gy = y / colourStep;
  const gx0 = Math.min(GN - 2, Math.floor(gx));
  const gy0 = Math.min(GN - 2, Math.floor(gy));
  const fx = gx - gx0;
  const fy = gy - gy0;
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let k = 0; k < 4; k++) {
    const idx = (gy0 + (k >> 1)) * GN + gx0 + (k & 1);
    if (known[idx] === 0) continue;
    const w = ((k & 1) === 1 ? fx : 1 - fx) * ((k >> 1) === 1 ? fy : 1 - fy) + 1e-4;
    r += lattice[idx * 3]! * w;
    g += lattice[idx * 3 + 1]! * w;
    b += lattice[idx * 3 + 2]! * w;
    weight += w;
  }
  if (weight > 0) {
    c.r = r / weight;
    c.g = g / weight;
    c.b = b / weight;
  } else {
    c.r = env.fallbackLand.r;
    c.g = env.fallbackLand.g;
    c.b = env.fallbackLand.b;
  }
}

/**
 * The land at a pixel: its colour, the height's tint and snow, a nation's
 * colour on a world with no sea, the paper's grain and a stipple on dry
 * ground, the light, and the contours inked over it.
 */
function landAt(env: GroundEnv, c: Rgb, m: number, x: number, y: number, mask: Mask, lit: Light, paper: Paper, nation: Uint8ClampedArray | undefined): void {
  const { upland, snow, nationColour } = env;
  const { RS, RN, light, relief } = lit;
  const lx = x / RS + 1;
  const ly = y / RS + 1;
  const lx0 = Math.floor(lx);
  const ly0 = Math.floor(ly);
  const fx = lx - lx0;
  const fy = ly - ly0;
  const k = ly0 * RN + lx0;
  const smooth = (light[k]! * (1 - fx) + light[k + 1]! * fx) * (1 - fy) + (light[k + RN]! * (1 - fx) + light[k + RN + 1]! * fx) * fy;
  const shade = Math.round(smooth / SHADE_STEP) * SHADE_STEP;
  const h00 = relief[k]!;
  const h10 = relief[k + 1]!;
  const h01 = relief[k + RN]!;
  const h11 = relief[k + RN + 1]!;
  const h = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  if (nation === undefined) {
    const rise = h / MAX_RELIEF;
    if (rise > UPLAND_FROM) mixInto(c, upland, UPLAND_TINT * Math.min(1, (rise - UPLAND_FROM) / (UPLAND_FULL - UPLAND_FROM)) ** 0.6);
    if (rise > SNOW_FROM) mixInto(c, snow, Math.min(1, (rise - SNOW_FROM) / (SNOW_FULL - SNOW_FROM)));
  } else {
    // The nation's own colour over its ground, before the light.
    nationColour.setRGB(nation[m * 4]! / 255, nation[m * 4 + 1]! / 255, nation[m * 4 + 2]! / 255, THREE.SRGBColorSpace);
    mixInto(c, nationColour, Math.min(1, mask.coverage[m]!) * NATION_TINT);
  }
  // The grain, and on dry ground (red over green) a stipple of darker specks.
  const fine = paper.fine === null ? 0.5 : grainAt(paper.fine, x, y);
  const grain = 0.5 * grainAt(paper.coarse, x, y) + 0.3 * grainAt(paper.middle, x, y) + 0.2 * fine;
  const dry = Math.max(0, Math.min(1, (c.r - c.g) * 7));
  const speck = fine > 0.78 ? STIPPLE * dry * Math.min(1, (fine - 0.78) * 12) : 0;
  let tone = shade * (1 + (grain - 0.5) * LAND_GRAIN * paper.grain) * (1 - speck);
  // The contours: the nearest level's distance over the relief's slope.
  const sx = ((h10 - h00) * (1 - fy) + (h11 - h01) * fy) / RS / paper.interval;
  const sy = ((h01 - h00) * (1 - fx) + (h11 - h10) * fx) / RS / paper.interval;
  const slope = Math.sqrt(sx * sx + sy * sy);
  if (slope > 1e-4) {
    const f = h / paper.interval;
    const level = Math.round(f);
    const spacing = 1 / slope;
    if (level >= 1 && spacing > CONTOUR_TIGHTEST) {
      const d = Math.abs(f - level) * spacing;
      const index = level % CONTOUR_INDEX === 0;
      const half = index ? 0.55 : 0.4;
      const cover = d >= half + 0.5 ? 0 : d <= half - 0.5 ? 1 : half + 0.5 - d;
      if (cover > 0) tone *= 1 - cover * (index ? CONTOUR_INDEX_ALPHA : CONTOUR_ALPHA) * Math.min(1, (spacing - CONTOUR_TIGHTEST) / 2);
    }
  }
  c.r *= tone;
  c.g *= tone;
  c.b *= tone;
}

/** Composes the tile's pixels, a band of rows at a time. */
function* compose(env: GroundEnv, geo: TileGeo, raster: Raster, mask: Mask, near: Float32Array, open: Float32Array, lat: Lattice, lit: Light, paper: Paper): Generator<undefined, void, void> {
  const nation = env.nationRaster?.data;
  const out = raster.data;
  const sea: Rgb = { r: 0, g: 0, b: 0 };
  const ground: Rgb = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < TILE; y++) {
    if (y > 0 && y % COMPOSE_ROWS === 0) yield;
    for (let x = 0; x < TILE; x++) {
      const m = (y + PAD) * M + (x + PAD);
      const a = mask.land[m]!;
      let r = 0;
      let g = 0;
      let b = 0;
      if (a < 1) {
        seaAt(env, sea, m, mask, near, open, 0.5 + (grainAt(paper.middle, x, y) - 0.5) * paper.grain);
        r = sea.r;
        g = sea.g;
        b = sea.b;
      }
      if (a > 0) {
        latticeAt(env, lat, geo.colourStep, x, y, ground);
        landAt(env, ground, m, x, y, mask, lit, paper, nation);
        r += (ground.r - r) * a;
        g += (ground.g - g) * a;
        b += (ground.b - b) * a;
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

/** One tile's ground, in steps. */
export function* ground(env: GroundEnv, z: number, i: number, j: number, raster: Raster): Generator<undefined, void, void> {
  yield* env.ringsReady();
  const dry = env.dry;
  const geo: TileGeo = {
    scaleZ: TILE * 2 ** z,
    u0: i / 2 ** z,
    v0: j / 2 ** z,
    colourStep: dry ? Math.min(DRY_COLOUR_STEP, colourStepAt(z)) : colourStepAt(z),
    reliefStep: dry ? DRY_RELIEF_STEP : z >= NEAR_RELIEF_FROM ? NEAR_RELIEF_STEP : RELIEF_STEP,
  };
  const mask = paintMask(env, geo);
  yield;
  const near = blurLand(dry, mask.land, mask.anyLand, SHALLOW_RADIUS);
  const open = blurLand(dry, mask.land, mask.anyLand, OPEN_RADIUS);
  yield;
  const lattice = yield* colourLattice(env, geo, mask.land, near, mask.anyLand);
  const light = yield* reliefLight(env, geo, mask.land, near, mask.anyLand);
  const paper: Paper = {
    coarse: grainOf(i, j, 32, 11),
    middle: grainOf(i, j, 8, 23),
    // The finest grain is left off the baked levels, whose images it would double.
    fine: z < BAKED_LEVELS ? null : grainOf(i, j, 2, 37),
    grain: z < BAKED_LEVELS ? BAKED_GRAIN : 1,
    interval: contourInterval(z, (360 / TILE) * env.UNITS_PER_DEG),
  };
  yield* compose(env, geo, raster, mask, near, open, lattice, light, paper);
}
