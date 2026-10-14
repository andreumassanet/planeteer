import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { isShown, radiusOf } from '../../src/places.ts';
import type { Place } from '../../src/places.ts';
import { latOf, lonOf, unitAt } from '../../src/sphere.ts';

const DEG = Math.PI / 180;

/**
 * The built towns in a two-degree grid, as `build-roads.ts` keeps them:
 * whether a point is within `clear` of a built town's disc.
 */
export function createTownGrid(places: readonly Place[]): (point: Vector3, clear: number) => boolean {
  const CELL = 2;
  const COLS = Math.round(360 / CELL);
  const ROWS = Math.round(180 / CELL);
  const cells: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const centres = places.map((place) => unitAt(place.lat, place.lon, new Vector3()));
  places.forEach((place, i) => {
    if (!isShown(place)) return;
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - place.lat) / CELL)));
    const col = ((Math.floor((place.lon + 180) / CELL) % COLS) + COLS) % COLS;
    cells[row * COLS + col]!.push(i);
  });
  return (point, clear) => {
    const lat = latOf(point.y);
    const lon = lonOf(point.x, point.z);
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
    const span = Math.ceil(1 / Math.max(0.02, Math.cos(lat * DEG)));
    const col = Math.floor((lon + 180) / CELL);
    for (let r = Math.max(0, row - 1); r <= Math.min(ROWS - 1, row + 1); r++) {
      for (let c = col - span; c <= col + span; c++) {
        for (const j of cells[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
          if (point.angleTo(centres[j]!) * PLANET_RADIUS < radiusOf(places[j]!) + clear) return true;
        }
      }
    }
    return false;
  };
}

export interface LaidGrid {
  /** Whether a point comes within `reach` plus a laid point's own reach of any laid point. */
  near(point: Vector3, reach: number): boolean;
  add(point: { at: Vector3; reach: number }): void;
}

/** What the lines already laid keep, in a one-degree grid. */
export function createLaidGrid(): LaidGrid {
  const LAID_CELL = 1;
  const LAID_COLS = Math.round(360 / LAID_CELL);
  const laidCells = new Map<number, { at: Vector3; reach: number }[]>();
  const laidKey = (lat: number, lon: number): number =>
    Math.min(179, Math.max(0, Math.floor((90 - lat) / LAID_CELL))) * LAID_COLS + ((Math.floor((lon + 180) / LAID_CELL) % LAID_COLS) + LAID_COLS) % LAID_COLS;
  return {
    near(point, reach) {
      const lat = latOf(point.y);
      const lon = lonOf(point.x, point.z);
      const cos = Math.max(0.05, Math.cos(lat * DEG));
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -Math.ceil(1 / cos); dc <= Math.ceil(1 / cos); dc++) {
          const list = laidCells.get(laidKey(lat + dr * LAID_CELL, lon + dc * LAID_CELL));
          if (list === undefined) continue;
          for (const other of list) if (point.angleTo(other.at) * PLANET_RADIUS < reach + other.reach) return true;
        }
      }
      return false;
    },
    add(point) {
      const key = laidKey(latOf(point.at.y), lonOf(point.at.x, point.at.z));
      let list = laidCells.get(key);
      if (list === undefined) laidCells.set(key, (list = []));
      list.push(point);
    },
  };
}
