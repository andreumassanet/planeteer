import * as THREE from 'three';
import { unitAt } from '../sphere.ts';
import { type SheetRing, ringsForTile } from '../map-outline.ts';
import { type Raster, toByte } from '../raster.ts';
import { BAKED_LEVELS, DEG, R2D, SHEET_HEIGHT, TAU, TILE, latOfV, lonOfU } from './projection.ts';

/** Pixels of mask painted round a tile, so the shallows do not stop at its edge. */
export const PAD = 12;
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
/** Rows of a tile composed between yields. */
const COMPOSE_ROWS = 16;
/**
 * The hill shade is stepped, as the land is lit: the light from the north-west
 * is cut into these bands (the world is one sun across a four-band ramp, and a
 * smooth relief under an inked map reads as a photograph pasted under a
 * drawing). The edges separate dark, shade, lit and the light's own slope.
 */
const SHADE_EDGES = [0.84, 0.95, 1.06] as const;
const SHADE_BANDS = [0.76, 0.9, 1.0, 1.1] as const;

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
  readonly oceanDeep: THREE.Color;
  readonly oceanShallow: THREE.Color;
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

/** The shallows: the land blurred twice, horizontally then vertically, read only on the water. */
function blurShallows(dry: boolean, land: Float32Array, anyLand: boolean): Float32Array {
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
  return { RS, RN, light };
}

/** Composes the tile's pixels, a band of rows at a time. */
function* compose(env: GroundEnv, geo: TileGeo, raster: Raster, mask: Mask, near: Float32Array, lat: Lattice, lit: Light): Generator<undefined, void, void> {
  const { nationRaster, oceanDeep, oceanShallow, fallbackLand, nationColour } = env;
  const { colourStep } = geo;
  const { land, coverage } = mask;
  const { GN, lattice, known } = lat;
  const { RS, RN, light } = lit;
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
  const near = blurShallows(dry, mask.land, mask.anyLand);
  yield;
  const lattice = yield* colourLattice(env, geo, mask.land, near, mask.anyLand);
  const light = yield* reliefLight(env, geo, mask.land, near, mask.anyLand);
  yield* compose(env, geo, raster, mask, near, lattice, light);
}
