// countries.bin and lakes.bin: outlines, delta-coded along each ring.

import type { Country } from '../geo.ts';
import { Reader, Writer, expect, magic, readText, writeFields } from './bytes.ts';

const MAGIC_COUNTRIES = 0x434c5441; // 'ATLC'
const MAGIC_LAKES = 0x4b4c5441; // 'ATLK'

/**
 * How many decimals a ring's coordinates carry. The bake gives every ring 3
 * (110 m) and a ring that will not untangle at that precision one more, up to 4;
 * the lakes choose 2 or 3 by size. The choice cannot be recovered from the
 * numbers, so it is stored, a byte a ring.
 */
export interface PackedRing {
  digits: number;
  points: number[][];
}

export interface PackedCountry extends Omit<Country, 'rings'> {
  rings: PackedRing[];
}

/**
 * One ring's coordinates, delta-coded along the ring and reset at its start. A
 * coastline step is one byte at either precision; the jump to the next ring is
 * three. Shared by the outlines and the lakes.
 */
function writeRingPoints(out: Writer, ring: PackedRing): void {
  const scale = 10 ** ring.digits;
  let lon = 0;
  let lat = 0;
  for (const point of ring.points) {
    const x = Math.round(point[0]! * scale);
    const y = Math.round(point[1]! * scale);
    out.zigzag(x - lon);
    out.zigzag(y - lat);
    lon = x;
    lat = y;
  }
}

function readRingPoints(reader: Reader, digits: number, length: number): number[][] {
  const scale = 10 ** digits;
  const points: number[][] = new Array(length);
  let lon = 0;
  let lat = 0;
  for (let p = 0; p < length; p++) {
    lon += reader.zigzag();
    lat += reader.zigzag();
    points[p] = [lon / scale, lat / scale];
  }
  return points;
}

export function encodeCountries(countries: readonly PackedCountry[]): Uint8Array {
  const out = new Writer();
  magic(out, MAGIC_COUNTRIES);
  out.varint(countries.length);

  // One text blob for the three strings a country carries. `iso` is three ASCII
  // characters and `continent` is one of seven, so the tabs cost less than a
  // second table would.
  // `iso` is three ASCII characters and `continent` one of seven, so tab-joined
  // text costs less than a second table.
  writeFields(out, countries.map((c) => [c.iso, c.name, c.continent]));

  // Centroids, at the two decimals the bake rounds them to.
  for (const country of countries) {
    out.zigzag(Math.round(country.lon * 100));
    out.zigzag(Math.round(country.lat * 100));
  }

  for (const country of countries) {
    out.varint(country.rings.length);
    for (const ring of country.rings) {
      out.u8(ring.digits);
      out.varint(ring.points.length);
    }
  }

  // The coordinates, delta-coded along each ring; see `writeRingPoints`.
  for (const country of countries) {
    for (const ring of country.rings) writeRingPoints(out, ring);
  }
  return out.done();
}

export function decodeCountries(bytes: Uint8Array): Country[] {
  const reader = new Reader(bytes, 'countries.bin');
  expect(reader, MAGIC_COUNTRIES, 'countries.bin');
  const count = reader.varint();
  const text = readText(reader, count);

  const countries: Country[] = [];
  for (let i = 0; i < count; i++) {
    const [iso, name, continent] = text[i]!.split('\t') as [string, string, string];
    countries.push({ iso, name, continent, lon: 0, lat: 0, rings: [] });
  }
  for (const country of countries) {
    country.lon = reader.zigzag() / 100;
    country.lat = reader.zigzag() / 100;
  }

  const shape: { digits: number; length: number }[][] = [];
  for (let i = 0; i < count; i++) {
    const rings = reader.varint();
    const list: { digits: number; length: number }[] = [];
    for (let r = 0; r < rings; r++) list.push({ digits: reader.u8(), length: reader.varint() });
    shape.push(list);
  }

  for (let i = 0; i < count; i++) {
    const rings: number[][][] = [];
    for (const { digits, length } of shape[i]!) rings.push(readRingPoints(reader, digits, length));
    countries[i]!.rings = rings;
  }
  reader.finish();
  return countries;
}

/**
 * The inland water: one flat list of rings, `countries.bin`'s ring section with
 * the country wrapper taken off. Nothing in the world can be in a lake (`countryAt`
 * answers open water there as at sea), so no name or code is stored. It is its
 * own file so `loadCountries` need not read the shoreline, and so that extending
 * the outlines' layout does not bump the `VERSION` every file shares.
 */
export function encodeLakes(rings: readonly PackedRing[]): Uint8Array {
  const out = new Writer();
  magic(out, MAGIC_LAKES);
  out.varint(rings.length);
  for (const ring of rings) {
    out.u8(ring.digits);
    out.varint(ring.points.length);
  }
  for (const ring of rings) writeRingPoints(out, ring);
  return out.done();
}

export function decodeLakes(bytes: Uint8Array): number[][][] {
  const reader = new Reader(bytes, 'lakes.bin');
  expect(reader, MAGIC_LAKES, 'lakes.bin');
  const count = reader.varint();
  const shape: { digits: number; length: number }[] = [];
  for (let i = 0; i < count; i++) shape.push({ digits: reader.u8(), length: reader.varint() });
  const rings = shape.map(({ digits, length }) => readRingPoints(reader, digits, length));
  reader.finish();
  return rings;
}
