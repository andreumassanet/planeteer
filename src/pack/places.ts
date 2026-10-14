// places.bin: the towns, as byte planes and delta-coded index lists.

import type { Place } from '../places.ts';
import { Reader, Writer, decoder, expect, magic, readPlanes, readText, utf8, writePlanes, writeText } from './bytes.ts';

/** 'ATLA'. A stale `places.bin` fails on its first four bytes with "re-bake it". */
const MAGIC_PLACES = 0x414c5441; // 'ATLA'

/**
 * Latitude and longitude in thousandths of a degree, biased positive so the
 * planes hold unsigned bytes: three bytes each. The low two planes are noise
 * (the places are ordered by population); the top plane carries that the
 * world's cities sit in a band of latitude.
 */
const LAT_BIAS = 90_000;
const LON_BIAS = 180_000;


/** Appends an ascending index list as deltas. */
function writeIndexList(out: Writer, list: readonly number[]): void {
  out.varint(list.length);
  let at = 0;
  for (const i of list) {
    out.varint(i - at);
    at = i;
  }
}

function readIndexList(reader: Reader): number[] {
  const list: number[] = [];
  let at = 0;
  for (let k = reader.varint(); k > 0; k--) {
    at += reader.varint();
    list.push(at);
  }
  return list;
}

export function encodePlaces(places: readonly Place[]): Uint8Array {
  const out = new Writer();
  const n = places.length;
  magic(out, MAGIC_PLACES);
  out.varint(n);

  writeText(out, places.map((p) => p.name));

  // The country codes are an alphabet of a couple of hundred, so one byte each
  // into a table rather than three characters each.
  const table: string[] = [];
  const index = new Map<string, number>();
  for (const place of places) {
    if (index.has(place.iso)) continue;
    index.set(place.iso, table.length);
    table.push(place.iso);
  }
  if (table.length > 256) throw new Error(`${table.length} country codes will not fit a byte`);
  out.varint(table.length);
  out.raw(utf8.encode(table.join('')));
  if (table.some((iso) => iso.length !== 3)) throw new Error('a country code is not three characters');
  const codes = new Uint8Array(n);
  for (let i = 0; i < n; i++) codes[i] = index.get(places[i]!.iso)!;
  out.raw(codes);

  const lat = new Int32Array(n);
  const lon = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    lat[i] = Math.round(places[i]!.lat * 1000);
    lon[i] = Math.round(places[i]!.lon * 1000);
    if (lat[i]! < -LAT_BIAS || lat[i]! > LAT_BIAS) throw new Error(`latitude ${places[i]!.lat} is off the planet`);
    if (lon[i]! < -LON_BIAS || lon[i]! > LON_BIAS) throw new Error(`longitude ${places[i]!.lon} is off the planet`);
  }
  writePlanes(out, lat, 3, LAT_BIAS);
  writePlanes(out, lon, 3, LON_BIAS);

  // Sorted by population, largest first, so the deltas are a run of small
  // non-positive numbers with long ties in the tail.
  let previous = 0;
  for (const place of places) {
    out.zigzag(place.pop - previous);
    previous = place.pop;
  }
  // Capitals, snapped rows and the other sparse columns ship as delta-coded
  // index lists: a flag byte a row would say "no" tens of thousands of times.
  const capitals: number[] = [];
  const snapped: number[] = [];
  places.forEach((place, i) => {
    if (place.capital) capitals.push(i);
    if (place.snappedKm !== undefined) snapped.push(i);
  });
  writeIndexList(out, capitals);
  writeIndexList(out, snapped);
  for (const i of snapped) out.varint(Math.round(places[i]!.snappedKm! * 10));

  // The prominence field, whole units capped at 4,000 by the bake, in two byte
  // planes. It comes last so a file baked before it existed fails in
  // `decodePlaces` by running out of bytes rather than by misreading a plane.
  const prominence = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const value = places[i]!.prominence;
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new Error(`prominence ${value} at ${places[i]!.name} will not fit a Uint16`);
    }
    prominence[i] = value;
  }
  writePlanes(out, prominence, 2);

  // The time zone, GeoNames' IANA name for the row, as an index into its
  // country's list of zones rather than into one table of all of them: no
  // country has more than a few dozen, and each list is ordered by use, so the
  // column is almost all zeros. The lists are written in the country table's
  // order, each as a count, and their names as one blob after them.
  const zoneLists: string[][] = table.map(() => []);
  const zoneCounts = table.map(() => new Map<string, number>());
  for (const place of places) {
    if (place.zone === '' || place.zone.includes('\n')) throw new Error(`${place.name} has no usable zone`);
    const counts = zoneCounts[index.get(place.iso)!]!;
    counts.set(place.zone, (counts.get(place.zone) ?? 0) + 1);
  }
  zoneCounts.forEach((counts, k) => {
    zoneLists[k] = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([zone]) => zone);
    if (zoneLists[k]!.length > 256) throw new Error(`${table[k]} has ${zoneLists[k]!.length} zones, more than a byte`);
    out.varint(zoneLists[k]!.length);
  });
  writeText(out, zoneLists.flat());
  const zones = new Uint8Array(n);
  for (let i = 0; i < n; i++) zones[i] = zoneLists[index.get(places[i]!.iso)!]!.indexOf(places[i]!.zone);
  out.raw(zones);

  // The built radius, on the rows the bake built smaller than `radiusFor`: an
  // index list and a whole unit each. See `radiusOf`.
  const fitted: number[] = [];
  places.forEach((place, i) => {
    if (place.radius !== undefined) fitted.push(i);
  });
  writeIndexList(out, fitted);
  for (const i of fitted) {
    const value = places[i]!.radius!;
    if (!Number.isInteger(value) || value <= 0) throw new Error(`radius ${value} at ${places[i]!.name} is not a whole unit`);
    out.varint(value);
  }

  // The aliases: the rows that carry any as an index list, how many each
  // carries, and every name as one blob, in row order. See `Place.aliases`.
  const hosts: number[] = [];
  places.forEach((place, i) => {
    if (place.aliases === undefined) return;
    if (place.aliases.length === 0) throw new Error(`${place.name} carries an empty alias list`);
    hosts.push(i);
  });
  writeIndexList(out, hosts);
  for (const i of hosts) out.varint(places[i]!.aliases!.length);
  writeText(out, hosts.flatMap((i) => places[i]!.aliases!));

  return out.done();
}

export function decodePlaces(bytes: Uint8Array): Place[] {
  const reader = new Reader(bytes, 'places.bin');
  expect(reader, MAGIC_PLACES, 'places.bin');
  const n = reader.varint();
  const names = readText(reader, n);

  const isoCount = reader.varint();
  const blob = decoder.decode(reader.raw(isoCount * 3));
  const table: string[] = [];
  for (let i = 0; i < isoCount; i++) table.push(blob.slice(i * 3, i * 3 + 3));
  const codes = reader.raw(n);

  const lat = readPlanes(reader, n, 3, LAT_BIAS);
  const lon = readPlanes(reader, n, 3, LON_BIAS);

  const places: Place[] = new Array(n);
  let pop = 0;
  for (let i = 0; i < n; i++) {
    pop += reader.zigzag();
    places[i] = {
      name: names[i]!,
      iso: table[codes[i]!]!,
      lat: lat[i]! / 1000,
      lon: lon[i]! / 1000,
      pop,
      prominence: 0,
      zone: '',
    };
  }

  for (const i of readIndexList(reader)) places[i]!.capital = true;
  const snapped = readIndexList(reader);
  for (const i of snapped) places[i]!.snappedKm = reader.varint() / 10;

  const prominence = readPlanes(reader, n, 2);
  for (let i = 0; i < n; i++) places[i]!.prominence = prominence[i]!;

  const lengths: number[] = [];
  for (let k = 0; k < isoCount; k++) lengths.push(reader.varint());
  const zoneNames = readText(reader, lengths.reduce((sum, length) => sum + length, 0));
  const zoneLists: string[][] = [];
  let next = 0;
  for (const length of lengths) {
    zoneLists.push(zoneNames.slice(next, next + length));
    next += length;
  }
  const zones = reader.raw(n);
  for (let i = 0; i < n; i++) {
    const zone = zoneLists[codes[i]!]![zones[i]!];
    if (zone === undefined) throw new Error(`places.bin: row ${i} points past its country's zones`);
    places[i]!.zone = zone;
  }

  const fitted = readIndexList(reader);
  for (const i of fitted) places[i]!.radius = reader.varint();

  const hosts = readIndexList(reader);
  const counts = hosts.map(() => reader.varint());
  const aliases = readText(reader, counts.reduce((sum, count) => sum + count, 0));
  let from = 0;
  hosts.forEach((i, k) => {
    places[i]!.aliases = aliases.slice(from, from + counts[k]!);
    from += counts[k]!;
  });

  reader.finish();
  return places;
}
