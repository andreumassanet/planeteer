// A tile of the sea floor: the cube-sphere cell's floor and clear-water grids,
// built a slice at a time under the frame's allowance.

import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { PALETTE } from '../theme.ts';
import { ribbonColour, surfaceLift, waterProfile } from '../ocean.ts';
import {
  COLOUR_REACH,
  SEA_REACH,
  TILE_QUADS,
  coastAt,
  coastSample,
  depthAtDistance,
  isSeaAt,
  seaZoneAt,
  tileLifeJob,
  tilePoint,
} from '../sea-floor.ts';
import type { SeaZone, TileLife, TileLifeJob } from '../sea-floor.ts';
import { fbm } from '../terrain.ts';
import { hash3 } from '../weather.ts';
import { latOf } from '../sphere.ts';
import { GRID, SIDE } from './constants.ts';

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const SAND: Readonly<Record<SeaZone, readonly [number, number]>> = {
  // The sand, then what darkens it in patches: coral rubble, weed beds, rock.
  reef: [new THREE.Color(PALETTE.sand).lerp(new THREE.Color(PALETTE.cream), 0.35).getHex(), PALETTE.blush],
  meadow: [new THREE.Color(PALETTE.sand).lerp(new THREE.Color(PALETTE.tan), 0.35).getHex(), 0x6f8a55],
  kelp: [new THREE.Color(PALETTE.tan).lerp(new THREE.Color(PALETTE.bone), 0.4).getHex(), 0x6a6458],
  barren: [new THREE.Color(PALETTE.bone).lerp(new THREE.Color(PALETTE.steel), 0.35).getHex(), PALETTE.slate],
};
const LAKE_BED: readonly [number, number] = [new THREE.Color(PALETTE.tan).lerp(new THREE.Color(PALETTE.brown), 0.4).getHex(), PALETTE.darkOlive];
const PATCH_FREQUENCY = 140;

export type TileState = 'building' | 'ready' | 'skipped';

export interface Tile {
  key: number;
  state: TileState;
  /** Its middle on the sphere, units, and how far its corners are from it. */
  centre: THREE.Vector3;
  reach: number;
  slot: number;
  /** Past everything any colour looks for: the whole tile is open sea, and asks nothing. */
  open: boolean;
  cursor: number;
  profiles: Float64Array;
  zone: SeaZone;
  lake: boolean;
  floor: Float32Array;
  floorColour: Uint8Array;
  floorDepth: Float32Array;
  water: Float32Array;
  waterNormal: Int8Array;
  waterColour: Uint8Array;
  waterShore: Float32Array;
  waterDepth: Float32Array;
  life: TileLifeJob;
  lived: TileLife | null;
  /** Seconds since it was last wanted, for letting it go. */
  unwanted: number;
}

/** Builds tiles. The scratch vectors are shared by every tile it builds. */
export interface TileBuilder {
  newTile(key: number): Tile;
  /** Works on a tile until the deadline; true once it is ready to stand. */
  stepTile(tile: Tile, deadline: number): boolean;
}

export function createTileBuilder(): TileBuilder {
  const sample = coastSample();
  const unit = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const point = { x: 0, y: 0, z: 0 };
  const colour = new THREE.Color();
  const tint = new THREE.Color();
  const profile = new Float64Array(9);

  function newTile(key: number): Tile {
    const centre = new THREE.Vector3();
    tilePoint(key, TILE_QUADS / 2, TILE_QUADS / 2, point);
    centre.set(point.x, point.y, point.z);
    tilePoint(key, 0, 0, point);
    const reach = centre.distanceTo(probe.set(point.x, point.y, point.z)) * PLANET_RADIUS;
    centre.multiplyScalar(PLANET_RADIUS);
    return {
      key,
      state: 'building',
      centre,
      reach,
      slot: -1,
      open: false,
      cursor: -1,
      profiles: new Float64Array(36),
      zone: 'meadow',
      lake: false,
      floor: new Float32Array(GRID * 3),
      floorColour: new Uint8Array(GRID * 3),
      floorDepth: new Float32Array(GRID),
      water: new Float32Array(GRID * 3),
      waterNormal: new Int8Array(GRID * 3),
      waterColour: new Uint8Array(GRID * 3),
      waterShore: new Float32Array(GRID * 2),
      waterDepth: new Float32Array(GRID),
      life: tileLifeJob(key),
      lived: null,
      unwanted: 0,
    };
  }

  /** The tile's first step: is any of it sea near a coast, and its colours at the corners. */
  function beginTile(tile: Tile): void {
    unit.copy(tile.centre).normalize();
    coastAt(unit.x, unit.y, unit.z, COLOUR_REACH + tile.reach, sample);
    tile.open = sample.distance === Infinity;
    tile.lake = sample.lake;
    tile.zone = seaZoneAt(latOf(unit.y), sample.lake);
    // Nothing within a tile's reach of its middle, and its middle is land: the
    // whole tile is land and under the land, and nothing of it is drawn.
    if (sample.distance > tile.reach * 1.1 && !isSeaAt(unit.x, unit.y, unit.z)) {
      tile.state = 'skipped';
      return;
    }
    for (let c = 0; c < 4; c++) {
      tilePoint(tile.key, (c & 1) * TILE_QUADS, (c >> 1) * TILE_QUADS, point);
      waterProfile(point.x, point.y, point.z, tile.profiles, c * 9);
    }
    tile.cursor = 0;
  }

  /** One vertex of a tile's floor and water. */
  function tileVertex(tile: Tile, v: number): void {
    const i = Math.floor(v / SIDE);
    const j = v % SIDE;
    tilePoint(tile.key, i, j, point);
    let distance = SEA_REACH;
    let phase = 0;
    if (!tile.open) {
      coastAt(point.x, point.y, point.z, COLOUR_REACH, sample);
      if (sample.distance !== Infinity) {
        distance = sample.distance;
        phase = sample.phase;
      } else distance = COLOUR_REACH;
    } else distance = COLOUR_REACH;
    const depth = depthAtDistance(point.x, point.y, point.z, Math.min(distance, SEA_REACH));
    const o = v * 3;
    const floorRadius = PLANET_RADIUS - depth;
    tile.floor[o] = point.x * floorRadius;
    tile.floor[o + 1] = point.y * floorRadius;
    tile.floor[o + 2] = point.z * floorRadius;
    tile.floorDepth[v] = depth;

    // The sand, patched: rubble, weed or rock by the zone, and a few percent
    // of mosaic a vertex, which with flat shading is the facet the eye sees.
    const [sand, patch] = tile.lake ? LAKE_BED : SAND[tile.zone];
    const patchy = smoothstep(0.5, 0.72, fbm(point.x * PATCH_FREQUENCY, point.y * PATCH_FREQUENCY, point.z * PATCH_FREQUENCY, 2));
    colour.setHex(sand).lerp(tint.setHex(patch), patchy * 0.55).multiplyScalar(0.94 + 0.08 * hash3(tile.key, v, 5));
    tile.floorColour[o] = Math.round(clamp(colour.r, 0, 1) * 255);
    tile.floorColour[o + 1] = Math.round(clamp(colour.g, 0, 1) * 255);
    tile.floorColour[o + 2] = Math.round(clamp(colour.b, 0, 1) * 255);

    // The water: the ribbon's colour for this distance, from the tile's
    // corners' profiles (they vary over thousands of units), at its height.
    const u = i / TILE_QUADS;
    const w = j / TILE_QUADS;
    const p = tile.profiles;
    for (let k = 0; k < 9; k++) {
      profile[k] = (p[k]! * (1 - u) + p[9 + k]! * u) * (1 - w) + (p[18 + k]! * (1 - u) + p[27 + k]! * u) * w;
    }
    ribbonColour(profile, 0, distance, colour);
    tile.waterColour[o] = Math.round(clamp(colour.r, 0, 1) * 255);
    tile.waterColour[o + 1] = Math.round(clamp(colour.g, 0, 1) * 255);
    tile.waterColour[o + 2] = Math.round(clamp(colour.b, 0, 1) * 255);
    const waterRadius = PLANET_RADIUS + surfaceLift(distance);
    tile.water[o] = point.x * waterRadius;
    tile.water[o + 1] = point.y * waterRadius;
    tile.water[o + 2] = point.z * waterRadius;
    tile.waterNormal[o] = Math.round(point.x * 127);
    tile.waterNormal[o + 1] = Math.round(point.y * 127);
    tile.waterNormal[o + 2] = Math.round(point.z * 127);
    tile.waterShore[v * 2] = distance;
    tile.waterShore[v * 2 + 1] = phase;
    tile.waterDepth[v] = depth + surfaceLift(distance);
  }

  /** Works on a tile until the deadline; true once it is ready to stand. */
  function stepTile(tile: Tile, deadline: number): boolean {
    if (tile.cursor < 0) {
      beginTile(tile);
      if (tile.state === 'skipped') return false;
    }
    while (tile.cursor < GRID) {
      tileVertex(tile, tile.cursor++);
      if ((tile.cursor & 31) === 0 && performance.now() > deadline) return false;
    }
    if (tile.lived === null) {
      tile.lived = tile.life.step(deadline);
      if (tile.lived === null) return false;
    }
    return true;
  }

  return { newTile, stepTile };
}
