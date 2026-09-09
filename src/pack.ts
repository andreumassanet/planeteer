/**
 * The wire format for the baked data files, written once and read once.
 *
 * **The first load was 1.2 MB of JSON before a triangle was drawn** — 456 KB of
 * outlines, 440 of places and 337 of roads, all gzipped — and almost none of it
 * was information. `[66.52,37.35]` is fourteen characters carrying nine bits of
 * coastline; `{"a":0,"b":48,"cls":2,"bend":-0.0007}` is thirty-eight carrying
 * about thirty-five. The numbers here are integers at the precision the bakes
 * already round to, delta-coded where the sequence is ordered and left alone
 * where it is not, and the file is gzipped by the bake rather than by the CDN.
 *
 * **Both halves of the format live in this one file on purpose.** A writer in
 * `scripts/` and a reader in `src/` is two definitions of one thing, which is
 * the shape of bug this project keeps writing down — and unlike a mirrored
 * planet it would not be self-consistent, it would simply be wrong. Every bake
 * round-trips its own output through the decoder here and refuses to write if
 * anything moved, so the two cannot drift without the bake failing.
 *
 * **The bake gzips and the client inflates**, rather than leaving it to the
 * server, and that is not thrift: a CDN compresses by content type and no CDN
 * compresses `application/octet-stream`, so a raw binary ships raw. Gzipping it
 * here makes the shipped size the same number on Vite's dev server, on Vercel
 * and in `ls -l`, which is the number this file exists to move.
 * `DecompressionStream` is the platform's own zlib in both Node and the
 * browser, so this costs no dependency and no JavaScript inflater.
 *
 * Nothing here is lossy. Every coordinate is stored as the integer the bake's
 * own `toFixed` produced and divided back by the same power of ten, and `n/10^d`
 * and `Number(v.toFixed(d))` are both the nearest double to the same decimal, so
 * the round trip is exact rather than close. `pnpm check` asserts it over all
 * 210,595 outline points, 29,604 places and 16,970 roads.
 */

import type { Country } from './geo.ts';
import type { Place } from './places.ts';
import type { Road, RoadData } from './roads.ts';

/** Bumped when the layout changes, so a stale file fails loudly rather than oddly. */
const VERSION = 1;

const MAGIC_COUNTRIES = 0x434c5441; // 'ATLC'
const MAGIC_PLACES = 0x504c5441; // 'ATLP'
const MAGIC_ROADS = 0x524c5441; // 'ATLR'
const MAGIC_LAKES = 0x4b4c5441; // 'ATLK'

/**
 * A road's bow is stored as ten-thousandths, and **the bake has to test the
 * number it is going to store, not the one it computed.**
 *
 * `build-roads.ts` walks a candidate road and asks what is underneath, then
 * writes the bend that came back dry. Between those two the encoder rounds it,
 * and the road that ships is a fractionally different curve from the road that
 * was tested. Cornwall to Malone is 98 units along the St. Lawrence: it was
 * asked at bend 0.00906937 and was dry, shipped at 0.0091, and one of its 48
 * samples then landed in the river. Three thousandths of a unit sideways, and
 * the only reason it mattered is that the water test got fine enough to see it.
 *
 * So the rounding is exported and the bake applies it before the walk. The path
 * that is drawn is then the path that was tested, which is what
 * `build-roads.ts` has always claimed and did not have.
 */
const BEND_SCALE = 10000;
export function packedBend(bend: number): number {
  return Math.round(bend * BEND_SCALE) / BEND_SCALE;
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

/**
 * A growing byte buffer with the two integer codings the format uses.
 *
 * LEB128 for anything whose magnitude varies — a coastline step is one byte and
 * a jump between rings is three — and zigzag on top of it for anything signed,
 * because a small negative must not cost five bytes of leading ones.
 */
class Writer {
  private data = new Uint8Array(1 << 16);
  private at = 0;

  private room(bytes: number): void {
    if (this.at + bytes <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < this.at + bytes) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.data.subarray(0, this.at));
    this.data = grown;
  }

  u8(value: number): void {
    this.room(1);
    this.data[this.at++] = value & 255;
  }

  raw(bytes: Uint8Array): void {
    this.room(bytes.length);
    this.data.set(bytes, this.at);
    this.at += bytes.length;
  }

  /** Unsigned LEB128. Guarded, because a value past 2^31 would silently truncate. */
  varint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0x7fffffff) {
      throw new Error(`varint out of range: ${value}`);
    }
    this.room(5);
    let v = value;
    while (v >= 0x80) {
      this.data[this.at++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    this.data[this.at++] = v;
  }

  /** Zigzag then LEB128: -1 is one byte, not five. */
  zigzag(value: number): void {
    this.varint(value < 0 ? -2 * value - 1 : 2 * value);
  }

  done(): Uint8Array {
    return this.data.slice(0, this.at);
  }
}

class Reader {
  private at = 0;
  private readonly data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  u8(): number {
    return this.data[this.at++]!;
  }

  raw(length: number): Uint8Array {
    const slice = this.data.subarray(this.at, this.at + length);
    this.at += length;
    return slice;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.data[this.at++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
    }
  }

  zigzag(): number {
    const v = this.varint();
    return v & 1 ? -(v + 1) / 2 : v / 2;
  }

  /** Bytes not yet read, so a reader can tell a short file from a stale one. */
  left(): number {
    return this.data.length - this.at;
  }
}

/**
 * A fixed-width integer column, stored as one plane of low bytes followed by one
 * plane of the next, and so on.
 *
 * **The transposition is the whole of it and it costs nothing to undo.** A
 * place's latitude is 18 bits of which the top two are almost always the same
 * two — a world whose cities are mostly between 20 and 60 degrees north — but
 * interleaved with the noisy low bytes gzip never sees the run. Split into
 * planes it sees a plane of three symbols and crushes it, and the plane that is
 * genuinely random is left at exactly its own size, which is what it should
 * cost. Measured on `roads.json`'s `b`: 89.0 KB interleaved against 84.6 split,
 * and on the bends 63.8 against 71.9 for the varint that looks cleverer.
 */
function writePlanes(out: Writer, values: readonly number[] | Int32Array, bytes: number, bias = 0): void {
  const n = values.length;
  const plane = new Uint8Array(n);
  for (let b = 0; b < bytes; b++) {
    const shift = b * 8;
    for (let i = 0; i < n; i++) plane[i] = ((values[i]! + bias) >>> shift) & 255;
    out.raw(plane);
  }
}

function readPlanes(reader: Reader, n: number, bytes: number, bias = 0): Int32Array {
  const values = new Int32Array(n);
  for (let b = 0; b < bytes; b++) {
    const plane = reader.raw(n);
    const shift = b * 8;
    for (let i = 0; i < n; i++) values[i]! |= plane[i]! << shift;
  }
  if (bias !== 0) for (let i = 0; i < n; i++) values[i]! -= bias;
  return values;
}

const utf8 = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Names as one blob with newline separators, and no length table beside it.
 *
 * A separate table of lengths is 12.4 KB gzipped for something the separator
 * already says. No place name or country name contains a newline — the bakes
 * assert it, because a name that did would silently split a row in two.
 */
function writeText(out: Writer, parts: readonly string[]): void {
  for (const part of parts) {
    if (part.includes('\n')) throw new Error(`a newline in "${part}" would split the blob`);
  }
  const blob = utf8.encode(parts.join('\n'));
  out.varint(blob.length);
  out.raw(blob);
}

function readText(reader: Reader, count: number): string[] {
  const blob = reader.raw(reader.varint());
  const parts = count === 0 ? [] : decoder.decode(blob).split('\n');
  if (parts.length !== count) throw new Error(`expected ${count} strings, got ${parts.length}`);
  return parts;
}

function magic(out: Writer, value: number): void {
  out.u8(value);
  out.u8(value >>> 8);
  out.u8(value >>> 16);
  out.u8(value >>> 24);
  out.u8(VERSION);
}

function expect(reader: Reader, value: number, what: string): void {
  const found = reader.u8() | (reader.u8() << 8) | (reader.u8() << 16) | (reader.u8() << 24);
  const version = reader.u8();
  if (found !== value || version !== VERSION) {
    throw new Error(`${what} is not an atlas v${VERSION} file — re-bake it`);
  }
}

// ---------------------------------------------------------------------------
// gzip, from the platform
// ---------------------------------------------------------------------------

/**
 * Inflate a baked file. The same call works in Node and in the browser, because
 * `DecompressionStream` is the platform's own zlib in both.
 *
 * The compressing half is deliberately *not* here: the bakes are Node and use
 * `zlib.gzipSync` at level 9, which `CompressionStream` gives no way to ask for
 * and which is worth about 2% of every file. Gzip is gzip, so the client still
 * reads what the bake wrote — and each bake round-trips its output through this
 * very function before writing, so the path the browser takes is the path the
 * bake proved.
 */
export async function inflate(data: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const body = data instanceof Uint8Array ? data : new Uint8Array(data);
  const stream = new Response(body as BodyInit).body!.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------------------
// countries
// ---------------------------------------------------------------------------

/**
 * How many decimals a ring's coordinates carry.
 *
 * `build-countries.mjs` chooses 2 for a ring over a square degree and 3 below
 * it — 1 km along a coastline thousands of km long, 110 m round Ibiza — and
 * gives a ring that will not untangle at that precision one more decimal, up to
 * 4. The choice cannot be recovered from the numbers, so it is stored. A byte a
 * ring, which gzip takes to nothing.
 */
export interface PackedRing {
  digits: number;
  points: number[][];
}

export interface PackedCountry extends Omit<Country, 'rings'> {
  rings: PackedRing[];
}

/**
 * One ring's coordinates, delta-coded along the ring and reset at its start.
 *
 * A coastline step is 0.05 to 0.2 degrees, which is one byte at either
 * precision; the jump from the end of one ring to the start of the next is
 * three, and there are 2,849 of those against 205,082 points. Shared by the
 * outlines and the lakes, which are the same numbers in the same shape — the
 * two files differ only in what is wrapped around them.
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
  writeText(out, countries.map((c) => `${c.iso}\t${c.name}\t${c.continent}`));

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
  const reader = new Reader(bytes);
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
  return countries;
}

// ---------------------------------------------------------------------------
// lakes
// ---------------------------------------------------------------------------

/**
 * The inland water: one flat list of rings and nothing else.
 *
 * It is `countries.bin`'s ring section with the country wrapper taken off,
 * because that is all a lake is — an outline the world reads as water. No name,
 * no code, no centroid: **nothing in the world can be *in* a lake**, since
 * `countryAt` answers open water there exactly as it does at sea, so there is
 * no chip to fill and no flag to draw. 412 names would have been about 2 KB on
 * the wire for a string nothing reads.
 *
 * It is its own file rather than a fourth section of `countries.bin` for two
 * reasons, and only one of them is about bytes. `sheets/flags.html` and
 * `sheets/scenery.html` call `loadCountries` for the country list alone and have
 * no use for 18,000 points of shoreline; and extending the outlines' layout
 * would have to bump `VERSION`, which invalidates `places.bin` and `roads.bin`
 * as well and forces a re-bake of files this change does not touch.
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
  const reader = new Reader(bytes);
  expect(reader, MAGIC_LAKES, 'lakes.bin');
  const count = reader.varint();
  const shape: { digits: number; length: number }[] = [];
  for (let i = 0; i < count; i++) shape.push({ digits: reader.u8(), length: reader.varint() });
  return shape.map(({ digits, length }) => readRingPoints(reader, digits, length));
}

// ---------------------------------------------------------------------------
// places
// ---------------------------------------------------------------------------

/**
 * Latitude and longitude in thousandths of a degree, biased positive so the
 * planes hold unsigned bytes: 0..180,000 and 0..360,000, three bytes each.
 *
 * **The third plane is the only one gzip can do anything with and that is the
 * point.** The places are ordered by population, so nothing about their
 * coordinates is sorted and the low two bytes are noise — 107.8 KB of it, which
 * is close to the entropy of 23,867 coordinates at 111 m. What the top plane
 * carries is that the world's cities sit in a band of latitude, and it comes out
 * at about a byte in eight.
 */
const LAT_BIAS = 90_000;
const LON_BIAS = 180_000;

export function encodePlaces(places: readonly Place[]): Uint8Array {
  const out = new Writer();
  const n = places.length;
  magic(out, MAGIC_PLACES);
  out.varint(n);

  writeText(out, places.map((p) => p.name));

  // The country codes are a 228-entry alphabet over 23,867 rows, so they are one
  // byte each into a table rather than three characters each.
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

  // The file is sorted by population, largest first, so the deltas are a run of
  // small non-positive numbers with long ties in the tail. 25.3 KB of varints,
  // 2.4 after gzip, against 47 KB of raw integers.
  let previous = 0;
  for (const place of places) {
    out.zigzag(place.pop - previous);
    previous = place.pop;
  }

  // 218 capitals and 662 snapped rows out of 23,867: a flag byte a row would be
  // 23.3 KB to say "no" 23,000 times, so both ship as delta-coded index lists.
  const capitals: number[] = [];
  const snapped: number[] = [];
  places.forEach((place, i) => {
    if (place.capital) capitals.push(i);
    if (place.snappedKm !== undefined) snapped.push(i);
  });
  out.varint(capitals.length);
  let at = 0;
  for (const i of capitals) {
    out.varint(i - at);
    at = i;
  }
  out.varint(snapped.length);
  at = 0;
  for (const i of snapped) {
    out.varint(i - at);
    at = i;
  }
  for (const i of snapped) out.varint(Math.round(places[i]!.snappedKm! * 10));

  // The prominence field, whole units capped at 4,000 by the bake: two byte
  // planes, and measured (2026-09-05) at **+32,965 B on the gzipped file** for
  // 29,545 rows — 330,588 to 363,553, 1.12 B a place, 10.0% — against about
  // 26 KB for one byte on a log scale, which would have quantised a 150-unit
  // knob to 2% steps. It is last so that a file baked before it existed fails
  // in `decodePlaces` by running out of bytes rather than by reading a plane
  // out of the snap list.
  const prominence = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const value = places[i]!.prominence;
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new Error(`prominence ${value} at ${places[i]!.name} will not fit a Uint16`);
    }
    prominence[i] = value;
  }
  writePlanes(out, prominence, 2);

  return out.done();
}

export function decodePlaces(bytes: Uint8Array): Place[] {
  const reader = new Reader(bytes);
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
    };
  }

  let at = 0;
  for (let k = reader.varint(); k > 0; k--) {
    at += reader.varint();
    places[at]!.capital = true;
  }
  const snapped: number[] = [];
  at = 0;
  for (let k = reader.varint(); k > 0; k--) {
    at += reader.varint();
    snapped.push(at);
  }
  for (const i of snapped) places[i]!.snappedKm = reader.varint() / 10;

  // Exactly two planes must be left. Fewer is a file baked before the field
  // existed; more is a layout this reader does not know. Both are re-bakes.
  if (reader.left() !== 2 * n) {
    throw new Error(`places.bin carries no prominence field (${reader.left()} bytes left) — re-bake it with \`pnpm places\``);
  }
  const prominence = readPlanes(reader, n, 2);
  for (let i = 0; i < n; i++) places[i]!.prominence = prominence[i]!;

  return places;
}

// ---------------------------------------------------------------------------
// roads
// ---------------------------------------------------------------------------

/**
 * The bow, in ten-thousandths, which is the four decimals `build-roads.ts`
 * rounds it to. It reaches +/-500 naturally and +/-4,950 on the roads the bake
 * bent round a bay, so it is two bytes and the high plane is almost all 0 or 255.
 *
 * **It is stored rather than recomputed and that is deliberate.** `bendFor` is a
 * pure function of the two places and 48,424 of the 49,287 roads carry exactly
 * its answer, so the column could be a bitset and 863 exceptions — 63.8 KB down
 * to about 6. It is not, for the reason `roadPoint` lives in `src/roads.ts` and
 * not in the script: **the bow is what decides whether the road crosses a bay**,
 * so the path the bake tested for water has to be the path that gets drawn, and
 * deriving it a second time at load is exactly the second copy that trap
 * forbids. It also measured 35 to 48 ms of string hashing in Node, which is a
 * bad trade for 58 KB on its own.
 */
export function encodeRoads(placeCount: number, graph: string, roads: readonly Road[]): Uint8Array {
  const out = new Writer();
  const n = roads.length;
  magic(out, MAGIC_ROADS);
  out.varint(placeCount);
  writeText(out, [graph]);
  out.varint(n);

  // `a` is non-decreasing — the bake walks the places in order — so the deltas
  // are a run of zeros and ones. 48.1 KB of varints, 8.7 after gzip.
  let previous = 0;
  for (const road of roads) {
    out.zigzag(road.a - previous);
    previous = road.a;
  }

  // `b` is not ordered at all: a Gabriel neighbour of a big city is any of
  // 23,867 towns, so this column is 49,287 x 14.5 bits of genuine entropy and
  // there is nothing to take out of it. Two planes of a `Uint16`.
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

  return out.done();
}

export function decodeRoads(bytes: Uint8Array): RoadData {
  const reader = new Reader(bytes);
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

  const roads: Road[] = new Array(n);
  for (let i = 0; i < n; i++) {
    roads[i] = { a: starts[i]!, b: ends[i]!, cls: classes[i]!, bend: bends[i]! / BEND_SCALE };
  }
  return { places, graph, roads };
}
