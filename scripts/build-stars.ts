/**
 * Bakes the Yale Bright Star Catalogue into the stars the night sky draws.
 *
 *   node scripts/build-stars.ts                 # from ../.cache/bsc5-catalog.dat
 *   node scripts/build-stars.ts path/to/catalog # from anywhere else
 *   node scripts/build-stars.ts --dry           # report, and write nothing
 *
 * The source is the Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren,
 * 1991; CDS catalogue V/50), `catalog.gz` gunzipped: 9,110 fixed-width records
 * of 197 bytes, of which 9,096 are stars — the other fourteen are novae and
 * galaxies the 1908 edition numbered, kept to preserve the numbering and with
 * no position. `pnpm sources` fetches it; `scripts/sources.json` records where
 * from, under what terms and which copy this was last run against.
 *
 * **What is kept is the naked-eye sky and nothing past it**: every star of V
 * 6.5 or brighter, which is the catalogue's own definition of its scope and a
 * dark site's limit. The 692 fainter records are stars the compilers carried
 * for completeness (a double's fainter half, a star since re-measured) and no
 * one has seen from a field. Three columns per star besides the position — V,
 * B-V, and nothing else: no names (this sky names nothing, like the menu's
 * "Where to look tonight"), no proper motions (a minute of arc since 2000 at
 * the very most) and no parallaxes.
 *
 * Three decisions, and the checks that hold them:
 *
 * 1. **A missing B-V is derived, and counted.** 310 records have no colour —
 *    mostly faint doubles — and a star with no colour would be drawn white,
 *    which is a colour. The spectral class says roughly what it is, so the
 *    typical dwarf colour of its letter and digit stands in (`TYPICAL`), and
 *    the bake prints how many it made up.
 * 2. **The galactic frame is checked against the file.** Every record carries
 *    its own galactic longitude and latitude, computed by the compilers from
 *    their positions, and the Milky Way in `sun.ts` is painted in
 *    `celestial.ts`'s `GALACTIC`. The two are different routes to the same
 *    direction, so every star is asked whether they agree, and the bake
 *    refuses to write if one does not — a transposed matrix would paint the
 *    Milky Way across the wrong half of the sky and nothing else would say so.
 * 3. **Brightest first**, then by HR number, so the file reads the same twice.
 *    See `StarCatalogue` in `src/pack.ts` for why the order is the format.
 *
 * The round trip is proved before a byte is written, as every bake here does:
 * the gzipped bytes are inflated and decoded by the client's own code and
 * compared with what was meant to be stored.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { decodeStars, encodeStars, inflate } from '../src/pack.ts';
import type { StarCatalogue } from '../src/pack.ts';
import { GALACTIC } from '../src/celestial.ts';
import { unitAt } from '../src/sphere.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes('--dry');
const SOURCE = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? resolve(here, '../../.cache/bsc5-catalog.dat');
const OUT = resolve(here, '../public/data/stars.bin');

/** The catalogue's own limit, and a dark site's. See the header. */
const V_LIMIT = 6.5;

/**
 * Degrees two routes to a star's galactic direction may disagree by.
 *
 * The catalogue prints its galactic coordinates to a hundredth of a degree, so
 * rounding alone is 0.007, and **they are of the star where it was in 1950**,
 * not in 2000: the galactic system is defined on B1950 positions and the
 * compilers computed `l, b` from those. Measured 2026-09-30 against the J2000
 * positions as given, the worst was 0.094 degrees, at HR 4550 — Groombridge
 * 1830, seven arcseconds a year of proper motion, 48 years of it — and the
 * eight worst were all the fastest movers in the file. Carried back fifty
 * years along their own proper motions the median is 0.0037 degrees, the
 * 99th percentile 0.0064 and the worst 0.023 (HR 7705, a star that barely
 * moves, so a digit in the record rather than a frame). A wrong matrix is
 * tens of degrees, a transposed one the whole Milky Way in the wrong half of
 * the sky, so this is loose by the one record and still a hundred times too
 * tight for a frame error to pass.
 */
const GALACTIC_TOLERANCE = 0.03;
/** And the median, which is what says the frame is right rather than that no star is wrong. */
const GALACTIC_MEDIAN = 0.005;
/** Years from the epoch of the catalogue's galactic coordinates to its positions'. */
const GALACTIC_EPOCH_GAP = 50;

/**
 * B-V of a main-sequence star by spectral class, at digit 0 and 5 of each
 * letter (Schmidt-Kaler's intrinsic colours, rounded to the hundredth the
 * catalogue gives). A guess for a giant, whose colour at a given letter runs
 * redder, and it says so: this is the colour of a star the catalogue did not
 * measure, and the dwarf value is the honest middle of what it could be.
 * C, N, R and S are the carbon and zirconium stars, which are all deep red.
 */
const TYPICAL: Record<string, readonly [number, number]> = {
  O: [-0.33, -0.33],
  B: [-0.3, -0.17],
  A: [-0.02, 0.15],
  F: [0.3, 0.44],
  G: [0.58, 0.68],
  K: [0.81, 1.15],
  M: [1.4, 1.64],
  C: [2.5, 2.5],
  N: [2.5, 2.5],
  R: [2.0, 2.0],
  S: [1.8, 1.8],
};
const NEXT: Record<string, string> = { O: 'B', B: 'A', A: 'F', F: 'G', G: 'K', K: 'M' };

/** The typical B-V of a spectral type such as `gK2`, `A1Vm` or `dF`, or null. */
function typicalColor(type: string): number | null {
  const found = /([OBAFGKMCNRS])(\d(?:\.\d)?)?/.exec(type.replace(/^(?:sg|sd|g|d|c)/, ''));
  if (found === null) return null;
  const letter = found[1]!;
  const [zero, five] = TYPICAL[letter]!;
  const digit = found[2] === undefined ? 5 : Number(found[2]);
  if (digit <= 5) return zero + ((five - zero) * digit) / 5;
  // Past 5, toward the next letter's 0.
  const next = NEXT[letter];
  const ten = next === undefined ? five : TYPICAL[next]![0];
  return five + ((ten - five) * (digit - 5)) / 5;
}

const field = (line: string, from: number, to: number): string => line.slice(from - 1, to).trim();

interface Row {
  hr: number;
  ra: number;
  dec: number;
  mag: number;
  color: number;
  glon: number;
  glat: number;
  /** Proper motion, arcseconds a year: along the parallel (already times cos dec) and the meridian. */
  pmRa: number;
  pmDec: number;
}

const text = readFileSync(SOURCE, 'latin1');
const rows: Row[] = [];
let records = 0;
let noPosition = 0;
let fainter = 0;
let derived = 0;
let unclassed = 0;
for (const raw of text.split('\n')) {
  if (raw.trim() === '') continue;
  records++;
  // The file is fixed-width with its trailing blanks trimmed.
  const line = raw.padEnd(197);
  // Byte columns from the catalogue's ReadMe: RA 76-83, Dec 84-90, GLON and
  // GLAT 91-102, V 103-107, B-V 110-114, the spectral type 128-147.
  if (field(line, 76, 77) === '') {
    noPosition++;
    continue;
  }
  const mag = Number(field(line, 103, 107));
  if (!Number.isFinite(mag)) throw new Error(`HR ${field(line, 1, 4)} has a position and no V`);
  if (mag > V_LIMIT) {
    fainter++;
    continue;
  }
  const ra = (Number(field(line, 76, 77)) + Number(field(line, 78, 79)) / 60 + Number(field(line, 80, 83)) / 3600) * 15;
  const sign = field(line, 84, 84) === '-' ? -1 : 1;
  const dec = sign * (Number(field(line, 85, 86)) + Number(field(line, 87, 88)) / 60 + Number(field(line, 89, 90)) / 3600);
  let color = Number(field(line, 110, 114));
  if (field(line, 110, 114) === '') {
    derived++;
    const guess = typicalColor(field(line, 128, 147));
    if (guess === null) unclassed++;
    // A star with neither is drawn as the Sun is, which is the least wrong
    // colour for a star of unknown kind.
    color = guess ?? 0.65;
  }
  rows.push({
    hr: Number(field(line, 1, 4)),
    ra,
    dec,
    mag,
    color,
    glon: Number(field(line, 91, 96)),
    glat: Number(field(line, 97, 102)),
    pmRa: Number(field(line, 149, 154) || 0),
    pmDec: Number(field(line, 155, 160) || 0),
  });
}
if (records !== 9110) throw new Error(`the catalogue has 9,110 records and this file has ${records} — is it V/50's catalog?`);

// ---------------------------------------------------------------------------
// The galactic frame, against the catalogue's own
// ---------------------------------------------------------------------------

let worst = 0;
let worstHr = 0;
let median = 0;
{
  const mine = new Vector3();
  const theirs = new Vector3();
  const DEG = Math.PI / 180;
  const offs: number[] = [];
  for (const row of rows) {
    // Where the star was in 1950, which is where the compilers measured
    // `l, b` from; see `GALACTIC_TOLERANCE`.
    const dec = row.dec - (row.pmDec * GALACTIC_EPOCH_GAP) / 3600;
    const ra = row.ra - (row.pmRa * GALACTIC_EPOCH_GAP) / 3600 / Math.cos(row.dec * DEG);
    unitAt(dec, ra, mine).applyMatrix3(GALACTIC);
    // The catalogue's `(l, b)` as the galactic frame's own unit vector, in
    // the astronomers' layout that `GALACTIC`'s rows produce.
    const cb = Math.cos(row.glat * DEG);
    theirs.set(cb * Math.cos(row.glon * DEG), cb * Math.sin(row.glon * DEG), Math.sin(row.glat * DEG));
    const off = mine.angleTo(theirs) / DEG;
    offs.push(off);
    if (off > worst) {
      worst = off;
      worstHr = row.hr;
    }
  }
  offs.sort((a, b) => a - b);
  median = offs[Math.floor(offs.length / 2)]!;
}
if (worst > GALACTIC_TOLERANCE || median > GALACTIC_MEDIAN) {
  throw new Error(
    `GALACTIC disagrees with the catalogue's own galactic coordinates: median ${median.toFixed(4)} deg, ` +
      `worst ${worst.toFixed(3)} at HR ${worstHr}`,
  );
}

// ---------------------------------------------------------------------------
// Sorted, packed and proved
// ---------------------------------------------------------------------------

rows.sort((a, b) => a.mag - b.mag || a.hr - b.hr);
const stars: StarCatalogue = {
  count: rows.length,
  ra: Float64Array.from(rows, (row) => row.ra),
  dec: Float64Array.from(rows, (row) => row.dec),
  mag: Float64Array.from(rows, (row) => row.mag),
  color: Float64Array.from(rows, (row) => row.color),
};
const packed = gzipSync(encodeStars(stars), { level: 9 });
const back = decodeStars(await inflate(packed));
{
  // What the format promises: positions to 20 arcseconds, V and B-V exact to
  // the catalogue's hundredth, the order unchanged.
  let moved = 0;
  for (let i = 0; i < stars.count; i++) {
    const dRa = Math.abs(((back.ra[i]! - stars.ra[i]! + 540) % 360) - 180) * Math.cos((stars.dec[i]! * Math.PI) / 180);
    if (dRa > 0.003 || Math.abs(back.dec[i]! - stars.dec[i]!) > 0.0015) moved++;
    if (Math.round(back.mag[i]! * 100) !== Math.round(stars.mag[i]! * 100)) moved++;
    if (Math.round(back.color[i]! * 100) !== Math.round(stars.color[i]! * 100)) moved++;
  }
  if (back.count !== stars.count || moved > 0) throw new Error(`stars.bin does not decode back to what was baked: ${moved} values moved`);
}
if (!dry) writeFileSync(OUT, packed);

console.log(
  `${stars.count.toLocaleString('en')} stars of V ${V_LIMIT} or brighter from ${records.toLocaleString('en')} records ` +
    `(${noPosition} with no position, ${fainter} fainter) -> ${(packed.length / 1024).toFixed(1)} KB gzipped${dry ? ' (dry run, nothing written)' : ''}`,
);
console.log(`  ${derived} colours derived from the spectral class (${unclassed} with no class, drawn as the Sun)`);
console.log(`  galactic frame against the catalogue's own l, b (1950 positions): median ${median.toFixed(4)} deg, worst ${worst.toFixed(4)} (HR ${worstHr})`);
console.log(`  brightest ${back.mag[0]!.toFixed(2)} at RA ${back.ra[0]!.toFixed(3)} Dec ${back.dec[0]!.toFixed(3)}; faintest ${back.mag[back.count - 1]!.toFixed(2)}`);
