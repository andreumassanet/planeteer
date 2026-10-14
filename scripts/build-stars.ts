/**
 * Bakes the Yale Bright Star Catalogue (5th Revised Ed., CDS V/50) into
 * `public/data/stars.bin`, the stars the night sky draws.
 *
 *   node scripts/build-stars.ts                 # from ../.cache/bsc5-catalog.dat
 *   node scripts/build-stars.ts path/to/catalog # from anywhere else
 *   node scripts/build-stars.ts --dry           # report, and write nothing
 *
 * Kept: every star of V 6.5 or brighter (the naked-eye sky), with its
 * position, V and B-V. No names, proper motions or parallaxes.
 *
 * - A missing B-V is derived from the spectral class (`TYPICAL`) and counted.
 * - The galactic frame (`GALACTIC` in `celestial.ts`, which paints the Milky
 *   Way) is checked against the galactic coordinates in every record; the
 *   bake refuses to write if they disagree.
 * - Stars are sorted brightest first, then by HR number (see `StarCatalogue`
 *   in `src/pack.ts`), and the output is decoded and compared before writing.
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

/** Faintest magnitude kept: the catalogue's own limit, and a dark site's. */
const V_LIMIT = 6.5;

/**
 * Degrees a star's galactic direction may differ from the catalogue's own
 * `l, b`. Those are printed to 0.01 degrees and computed from B1950
 * positions, so stars are carried back along their proper motions first;
 * the worst residual is then a fraction of this. A wrong or transposed matrix
 * is off by tens of degrees.
 */
const GALACTIC_TOLERANCE = 0.03;
/** Tolerance on the median difference, which tests the frame rather than single records. */
const GALACTIC_MEDIAN = 0.005;
/** Years from the epoch of the catalogue's galactic coordinates to its positions'. */
const GALACTIC_EPOCH_GAP = 50;

/**
 * B-V of a main-sequence star by spectral class, at digits 0 and 5 of each
 * letter (Schmidt-Kaler's intrinsic colours). Used for stars the catalogue
 * gives no colour; for a giant it runs a little blue. C, N, R and S are the
 * carbon and zirconium stars, all deep red.
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
