// roads.bin and rails.bin: the networks, as byte planes of their columns.

import type { Road, RoadData } from '../roads.ts';
import type { RailLine } from '../rails.ts';
import { Reader, Writer, expect, magic, readPlanes, readText, writePlanes, writeText } from './bytes.ts';

/**
 * 'ATLB'. A new magic rather than a new `VERSION`, because `VERSION` is shared
 * by every file and bumping it would invalidate files whose layout did not
 * change; a stale `roads.bin` then fails on its first four bytes.
 */
const MAGIC_ROADS = 0x424c5441; // 'ATLB'
/** 'ATLT': the railway's lines (`rails.ts`). */
const MAGIC_RAILS = 0x544c5441; // 'ATLT'

/**
 * A road's bow is stored as ten-thousandths, and the bake has to test the number
 * it is going to store, not the one it computed: between the walk that asks what
 * is underneath and the encoder's rounding, a road can become a fractionally
 * different curve and cross a river it was tested to miss. The rounding is
 * exported so the bake applies it before the walk.
 */
const BEND_SCALE = 10000;
export function packedBend(bend: number): number {
  return Math.round(bend * BEND_SCALE) / BEND_SCALE;
}

/**
 * The bow, in ten-thousandths: it reaches +/-500 naturally and +/-4,950 on the
 * roads the bake bent round a bay, so it is two bytes and the high plane is
 * almost all 0 or 255.
 *
 * It is stored rather than recomputed because the bow decides whether the road
 * crosses a bay: the path the bake tested for water has to be the path that gets
 * drawn, and deriving it a second time at load is a second copy.
 */
export function encodeRoads(placeCount: number, graph: string, roads: readonly Road[]): Uint8Array {
  const out = new Writer();
  const n = roads.length;
  magic(out, MAGIC_ROADS);
  out.varint(placeCount);
  writeText(out, [graph]);
  out.varint(n);

  // `a` is non-decreasing (the bake walks the places in order), so the deltas
  // are a run of zeros and ones.
  let previous = 0;
  for (const road of roads) {
    out.zigzag(road.a - previous);
    previous = road.a;
  }

  // `b` is not ordered at all: a Gabriel neighbour of a big city is any of tens
  // of thousands of rows, so this column is genuine entropy. Two planes of a
  // `Uint16`.
  const ends = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    ends[i] = roads[i]!.b;
    if (ends[i]! < 0 || ends[i]! > 0xffff) throw new Error(`place index ${ends[i]} will not fit a Uint16`);
  }
  writePlanes(out, ends, 2);

  const classes = new Uint8Array(n);
  for (let i = 0; i < n; i++) classes[i] = roads[i]!.cls;
  out.raw(classes);

  const bends = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    bends[i] = Math.round(roads[i]!.bend * BEND_SCALE);
    if (bends[i]! < -32768 || bends[i]! > 32767) throw new Error(`bend ${roads[i]!.bend} will not fit an Int16`);
  }
  writePlanes(out, bends, 2, 32768);

  // Which gate of each town the road comes in by: an index into
  // `gatesOf(townGrid(radiusOf(place)))`, so a byte. Stored for the bow's
  // reason: the gate the curve was tested through is the gate it is drawn
  // through. See `Road.gateA` in `src/roads.ts`.
  for (const column of ['gateA', 'gateB'] as const) {
    const gates = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const gate = roads[i]![column];
      if (!Number.isInteger(gate) || gate < 0 || gate > 255) throw new Error(`${column} ${gate} will not fit a byte`);
      gates[i] = gate;
    }
    out.raw(gates);
  }

  // The depth layer each road is drawn on, 0 in front: almost all 0. See `layersOf`.
  const layers = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const layer = roads[i]!.layer;
    if (!Number.isInteger(layer) || layer < 0 || layer > 255) throw new Error(`layer ${layer} will not fit a byte`);
    layers[i] = layer;
  }
  out.raw(layers);

  // Where a road crosses water on a bridge, as eighths of a unit along its path
  // from gate A: two planes of a `Uint16` each, and almost all 0.
  for (const column of ['bridgeFrom', 'bridgeTo'] as const) {
    const eighths = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      eighths[i] = Math.round(roads[i]![column] * BRIDGE_EIGHTHS);
      if (eighths[i]! < 0 || eighths[i]! > 0xffff) throw new Error(`${column} ${roads[i]![column]} will not fit a Uint16 of eighths`);
    }
    writePlanes(out, eighths, 2);
  }

  return out.done();
}

/** A bridge's ends are stored in eighths of a unit, and the bake tests the rounded ones: `packedSpan`. */
const BRIDGE_EIGHTHS = 8;
export function packedSpan(s: number): number {
  return Math.round(s * BRIDGE_EIGHTHS) / BRIDGE_EIGHTHS;
}

export function decodeRoads(bytes: Uint8Array): RoadData {
  const reader = new Reader(bytes, 'roads.bin');
  expect(reader, MAGIC_ROADS, 'roads.bin');
  const places = reader.varint();
  const graph = readText(reader, 1)[0]!;
  const n = reader.varint();

  const starts = new Int32Array(n);
  let previous = 0;
  for (let i = 0; i < n; i++) {
    previous += reader.zigzag();
    starts[i] = previous;
  }
  const ends = readPlanes(reader, n, 2);
  const classes = reader.raw(n);
  const bends = readPlanes(reader, n, 2, 32768);
  const gatesA = reader.raw(n);
  const gatesB = reader.raw(n);
  const layers = reader.raw(n);
  const bridgesFrom = readPlanes(reader, n, 2);
  const bridgesTo = readPlanes(reader, n, 2);

  const roads: Road[] = new Array(n);
  for (let i = 0; i < n; i++) {
    roads[i] = {
      a: starts[i]!,
      b: ends[i]!,
      cls: classes[i]!,
      bend: bends[i]! / BEND_SCALE,
      gateA: gatesA[i]!,
      gateB: gatesB[i]!,
      layer: layers[i]!,
      bridgeFrom: bridgesFrom[i]! / BRIDGE_EIGHTHS,
      bridgeTo: bridgesTo[i]! / BRIDGE_EIGHTHS,
    };
  }
  reader.finish();
  return { places, graph, roads };
}

/** What `rails.bin` holds: the lines, and the two files it was baked against. */
export interface RailData {
  /** How many places `places.bin` had, and roads `roads.bin`, when this was baked. */
  places: number;
  roads: number;
  lines: RailLine[];
}

/**
 * The lines, `a` ascending: `a` as deltas, `b` as two planes of a `Uint16`, the
 * two stations' bearings, sides and reaches a byte each, and the bow as
 * `roads.bin` stores a road's, rounded by `packedBend` before the bake walks it.
 */
export function encodeRails(placeCount: number, roadCount: number, lines: readonly RailLine[]): Uint8Array {
  const out = new Writer();
  const n = lines.length;
  magic(out, MAGIC_RAILS);
  out.varint(placeCount);
  out.varint(roadCount);
  out.varint(n);
  let previous = 0;
  for (const line of lines) {
    if (line.a < previous) throw new Error('rails.bin wants its lines in order of `a`');
    out.zigzag(line.a - previous);
    previous = line.a;
  }
  const ends = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    ends[i] = lines[i]!.b;
    if (ends[i]! < 0 || ends[i]! > 0xffff) throw new Error(`place index ${ends[i]} will not fit a Uint16`);
  }
  writePlanes(out, ends, 2);
  for (const column of ['bearingA', 'bearingB'] as const) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const bearing = lines[i]![column];
      if (!Number.isInteger(bearing) || bearing < 0 || bearing > 255) throw new Error(`${column} ${bearing} will not fit a byte`);
      bytes[i] = bearing;
    }
    out.raw(bytes);
  }
  for (const column of ['sideA', 'sideB'] as const) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = lines[i]![column] > 0 ? 1 : 0;
    out.raw(bytes);
  }
  for (const column of ['outA', 'outB'] as const) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const reach = lines[i]![column];
      if (!Number.isInteger(reach) || reach < 0 || reach > 255) throw new Error(`${column} ${reach} will not fit a byte`);
      bytes[i] = reach;
    }
    out.raw(bytes);
  }
  const bends = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    bends[i] = Math.round(lines[i]!.bend * BEND_SCALE);
    if (bends[i]! < -32768 || bends[i]! > 32767) throw new Error(`bend ${lines[i]!.bend} will not fit an Int16`);
  }
  writePlanes(out, bends, 2, 32768);
  return out.done();
}

export function decodeRails(bytes: Uint8Array): RailData {
  const reader = new Reader(bytes, 'rails.bin');
  expect(reader, MAGIC_RAILS, 'rails.bin');
  const places = reader.varint();
  const roads = reader.varint();
  const n = reader.varint();
  const starts = new Int32Array(n);
  let previous = 0;
  for (let i = 0; i < n; i++) {
    previous += reader.zigzag();
    starts[i] = previous;
  }
  const ends = readPlanes(reader, n, 2);
  const bearingsA = reader.raw(n);
  const bearingsB = reader.raw(n);
  const sidesA = reader.raw(n);
  const sidesB = reader.raw(n);
  const outsA = reader.raw(n);
  const outsB = reader.raw(n);
  const bends = readPlanes(reader, n, 2, 32768);
  const lines: RailLine[] = new Array(n);
  for (let i = 0; i < n; i++) {
    lines[i] = {
      a: starts[i]!,
      b: ends[i]!,
      bearingA: bearingsA[i]!,
      bearingB: bearingsB[i]!,
      sideA: sidesA[i]! > 0 ? 1 : -1,
      sideB: sidesB[i]! > 0 ? 1 : -1,
      outA: outsA[i]!,
      outB: outsB[i]!,
      bend: bends[i]! / BEND_SCALE,
    };
  }
  reader.finish();
  return { places, roads, lines };
}
