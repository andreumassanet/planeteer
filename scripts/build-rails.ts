/**
 * Joins the big cities into a railway.
 *
 *   node scripts/build-rails.ts        # write public/data/rails.bin
 *   node scripts/build-rails.ts --dry  # report the network and write nothing
 *
 * Runs after `build-roads.ts`: a line crosses roads only at level crossings
 * and keeps off the fleet's fields along them, so a road re-bake is a rail
 * re-bake.
 *
 * - Every built town of `RAIL_POP` or more has a station.
 * - Candidate pairs are the relative neighbourhood graph over those cities,
 *   up to `RAIL_MAX_LENGTH`: lines and junctions rather than a lattice, and
 *   still holding the minimum spanning tree. Shortest first, so a short line
 *   gets the ground beside a city first.
 * - Each pair is walked by `rail-trial.ts` (repeated by `check-rails.ts`); the
 *   search varies each station's bearing, platform side and distance, and the
 *   bow. A pair nothing gets through is not joined.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { decodePlaces, decodeRoads, encodeRails, inflate, packedBend } from '../src/pack.ts';
import { indexPlaces, isShown, radiusOf, terrainSiteOf } from '../src/places.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { createSiteIndex } from '../src/fleet.ts';
import { RAIL_MAX_LENGTH, RAIL_POP, STATION_BEARINGS, STATION_OUT, STATION_RUN, STATION_TURN } from '../src/rails/line.ts';
import type { RailLine } from '../src/rails/line.ts';
import { bearingToward, emptyStation, stationFor } from '../src/rails/stations.ts';
import { unitAt } from '../src/sphere.ts';
import { createRailTrial } from './rail-trial.ts';
import type { RailRefusal } from './rail-trial.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes('--dry');
const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

const monuments = (JSON.parse(readFileSync(resolve(here, '../public/data/monuments.json'), 'utf8')) as {
  monuments: { id: string; iso: string; lat: number; lon: number; footprint?: number }[];
}).monuments;
setFlattenSites(monuments);
const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
setDetailSites(placesRaw.map(terrainSiteOf));
const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const places = indexPlaces(placesRaw, 0).all;
const roadData = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
if (roadData.places !== places.length) throw new Error('roads.bin was baked against another places.bin: run `pnpm roads` first');
const roads = roadData.roads;
const fields = createSiteIndex({ world, places, roads, monuments });

// ---------------------------------------------------------------------------
// The cities and the pairs
// ---------------------------------------------------------------------------

const stations: number[] = [];
for (let i = 0; i < places.length; i++) if (isShown(places[i]!) && places[i]!.pop >= RAIL_POP) stations.push(i);
const at = places.map((place) => unitAt(place.lat, place.lon, new Vector3()));
const distance = (i: number, j: number): number => at[i]!.angleTo(at[j]!) * PLANET_RADIUS;

/** Every other station within `RAIL_MAX_LENGTH` of one. */
const reachCos = Math.cos(RAIL_MAX_LENGTH / PLANET_RADIUS);
function neighbours(i: number): number[] {
  const out: number[] = [];
  for (const j of stations) if (j !== i && at[i]!.dot(at[j]!) >= reachCos) out.push(j);
  return out;
}

const began = Date.now();
/**
 * Room two cities need for a line: each station stands `STATION_OUT` past its
 * disc and runs `STATION_RUN` straight, and the runs need room to turn.
 */
const ROOM = 2 * (STATION_OUT + STATION_RUN) + 80;
const apart = (i: number, j: number): boolean => distance(i, j) >= radiusOf(places[i]!) + radiusOf(places[j]!) + ROOM;
const candidates: { a: number; b: number; length: number }[] = [];
for (const i of stations) {
  const near = neighbours(i);
  for (const j of near) {
    if (j <= i || !apart(i, j)) continue;
    const d = distance(i, j);
    // Relative neighbourhood: no third city nearer both ends that could itself be joined to both.
    if (near.some((k) => k !== j && distance(i, k) < d && distance(j, k) < d && apart(i, k) && apart(j, k))) continue;
    candidates.push({ a: i, b: j, length: d });
  }
}
candidates.sort((x, y) => x.length - y.length || x.a - y.a || x.b - y.b);
console.log(`stations: ${stations.length} cities of ${RAIL_POP.toLocaleString()} or more; ${candidates.length} candidate lines (${Date.now() - began} ms)`);

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

const trial = createRailTrial({ world, places, roads, fields });

/**
 * The stations a city may have on a line: bearings within `TURN_MAX` steps of
 * facing the other city, each distance in `REACHES` past its disc, either
 * platform side; nearest the facing and the city first.
 */
const TURN_MAX = 12;
const REACHES = [STATION_OUT, STATION_OUT + 40, STATION_OUT + 90, STATION_OUT + 150];
/** How many standing stations each end offers the search. */
const STATIONS_TRIED = 6;
/** The bows a line tries on each pair of stations, straight first. */
const BEND_STEP = 0.04;
const BEND_TRIES = 5;
/** How many whole walks one pair may cost before it is given up. */
const WALK_BUDGET = 48;

const refusals = new Map<RailRefusal, number>();
const lines: RailLine[] = [];
let walks = 0;
let crossings = 0;
const frame = emptyStation();

/** The first stations that stand at one end, as the line's own columns. */
function standing(place: number, other: number): { bearing: number; out: number; side: number }[] {
  const facing = bearingToward(places[place]!, places[other]!) / STATION_TURN;
  const options: { bearing: number; out: number; side: number; cost: number }[] = [];
  const nearest = Math.round(facing);
  for (let step = -TURN_MAX + 1; step <= TURN_MAX; step++) {
    const bearing = (((nearest + step) % STATION_BEARINGS) + STATION_BEARINGS) % STATION_BEARINGS;
    const off = Math.abs(nearest + step - facing);
    for (const out of REACHES) for (const side of [1, -1]) options.push({ bearing, out, side, cost: off + (out - STATION_OUT) / 40 });
  }
  options.sort((x, y) => x.cost - y.cost || x.bearing - y.bearing || x.out - y.out || y.side - x.side);
  const found: { bearing: number; out: number; side: number }[] = [];
  for (const option of options) {
    stationFor(places[place]!, places[other]!, option.bearing, option.side, option.out, frame);
    if (trial.station(frame, `${place}:${other}:${option.bearing}:${option.side}:${option.out}`) !== null) continue;
    found.push(option);
    if (found.length >= STATIONS_TRIED) break;
  }
  return found;
}

/**
 * A line that passes the walk for one candidate pair, trying each end's
 * standing stations and the bows straight first; otherwise the last refusal.
 */
function searchLine(candidate: { a: number; b: number; length: number }): { line: RailLine | null; last: RailRefusal | null } {
  let spent = 0;
  let last: RailRefusal | null = null;
  const ends = [standing(candidate.a, candidate.b), standing(candidate.b, candidate.a)];
  if (ends[0]!.length === 0 || ends[1]!.length === 0) last = 'station-road';
  const limit = Math.min(0.2, Math.max(0.06, 160 / candidate.length));
  for (const endA of ends[0]!) {
    for (const endB of ends[1]!) {
      for (let k = 0; k <= BEND_TRIES * 2; k++) {
        const bend = packedBend((k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2)) * BEND_STEP);
        if (Math.abs(bend) > limit) continue;
        const line: RailLine = {
          a: candidate.a, b: candidate.b,
          bearingA: endA.bearing, bearingB: endB.bearing,
          sideA: endA.side, sideB: endB.side,
          outA: endA.out, outB: endB.out,
          bend,
        };
        const verdict = trial.line(line);
        walks++;
        if (verdict.refusal === null) {
          crossings += verdict.crossings.length;
          return { line, last };
        }
        last = verdict.refusal;
        if (last === 'turn' && k > 2) break;
        if (++spent >= WALK_BUDGET) return { line: null, last };
      }
    }
  }
  return { line: null, last };
}

for (const candidate of candidates) {
  const { line, last } = searchLine(candidate);
  if (line !== null) {
    lines.push(line);
    trial.accept(trial.lay(line));
  } else if (last !== null) refusals.set(last, (refusals.get(last) ?? 0) + 1);
}

lines.sort((x, y) => x.a - y.a || x.b - y.b);
const served = new Set(lines.flatMap((line) => [line.a, line.b]));
let length = 0;
for (const line of lines) length += trial.geometry(line).path.length;
console.log(`lines: ${lines.length} of ${candidates.length}, ${Math.round(length).toLocaleString()} units of track, ${crossings} level crossings`);
console.log(`cities with a station: ${served.size} of ${stations.length}`);
console.log(`refused: ${[...refusals].sort((x, y) => y[1] - x[1]).map(([why, n]) => `${why} ${n}`).join(', ')}`);
console.log(`${walks.toLocaleString()} walks in ${((Date.now() - began) / 1000).toFixed(1)} s`);

if (!dry) {
  const packed = gzipSync(encodeRails(places.length, roads.length, lines), { level: 9 });
  writeFileSync(resolve(here, '../public/data/rails.bin'), packed);
  console.log(`wrote public/data/rails.bin, ${(packed.length / 1024).toFixed(1)} KB`);
}
