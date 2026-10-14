/** The cell grid: rows by latitude, columns by longitude, and the small helpers the creatures share. */
import { UNITS_PER_DEGREE } from '../globe.ts';
import { seasonTurn } from '../weather.ts';
import * as THREE from 'three';
import { DEG } from './constants.ts';

/** The row of a latitude on a grid of cells `size` units tall. */
export function rowOf(lat: number, size: number): number {
  return Math.floor((lat * UNITS_PER_DEGREE) / size);
}

/** The latitude of a row's middle. */
export function rowLat(row: number, size: number): number {
  return ((row + 0.5) * size) / UNITS_PER_DEGREE;
}

/**
 * How many cells a row is cut into: as many as fit round the parallel at its
 * middle, so a cell is about `size` wide at every latitude and the columns of
 * a row never depend on where the player stands.
 */
export function columnsIn(row: number, size: number): number {
  const across = Math.cos(rowLat(row, size) * DEG);
  return Math.max(1, Math.floor((360 * UNITS_PER_DEGREE * Math.max(across, 0.02)) / size));
}

/** The column of a longitude in a row of `columns` cells. */
export function columnOf(lon: number, columns: number): number {
  const c = Math.floor(((lon + 180) / 360) * columns);
  return ((c % columns) + columns) % columns;
}

/** A cell's middle longitude. */
export function columnLon(column: number, columns: number): number {
  return ((column + 0.5) / columns) * 360 - 180;
}

/** One number per cell, unique on the planet at either size. */
export function cellKey(row: number, column: number): number {
  return (row + 8192) * 1048576 + column;
}

/* --- who lives where -------------------------------------------------------- */

export const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const fract = (t: number): number => t - Math.floor(t);

/**
 * Autumn at a latitude, 0 to 1: the fall of the hemisphere the point is in,
 * from late August to mid-December in the north and its mirror in the south.
 * The tropics have no autumn to speak of.
 */
export function autumnAt(timeMs: number, lat: number): number {
  const turn = Math.sin(seasonTurn(timeMs)) * (lat >= 0 ? 1 : -1);
  return smooth((turn - 0.55) / 0.35) * smooth((Math.abs(lat) - 24) / 8);
}


/** The frame at a unit vector: north along the meridian, east along the parallel. */
export function frameAt(up: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3): void {
  north.set(0, 1, 0).addScaledVector(up, -up.y);
  if (north.lengthSq() < 1e-10) north.set(1, 0, 0);
  north.normalize();
  east.crossVectors(north, up).normalize();
}
