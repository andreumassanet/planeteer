/**
 * Bakes GeoNames' `cities5000` into `public/data/places.bin`, the list every
 * settlement, tree and road is positioned from.
 *
 *   node scripts/build-places.mjs [cities5000.txt]
 *
 * cities5000 lists every settlement over about 5,000 people or admin seat.
 * A higher threshold empties thinly urbanised countries (Australia, Iceland,
 * Canada); a lower one roughly doubles the download. The source is CC BY 4.0
 * and is credited in the game and in `CREDITS.md`.
 *
 * Steps:
 * - Parse, dropping city sections and abandoned places, with population
 *   rounded to three significant figures (every consumer is a slow curve, so
 *   the fourth digit buys nothing) and coordinates rounded to `PRECISION`.
 * - Snap places in the sea onto the drawn coastline (`MAX_SNAP_KM`); the
 *   shipped country is whatever `countryAt` reports there.
 * - Thin greedily, largest first, so no two built discs (`radiusFor`)
 *   overlap; a big place that collides is fitted smaller instead of deleted
 *   (`FIT_POPULATION`). `pnpm check` asserts there is no overlap.
 * - Keep the names of absorbed places as aliases of their host
 *   (`ALIAS_POPULATION`), and bake the prominence field `isShown` reads.
 *
 * `roads.bin` stores indices into this array, so re-run `pnpm roads` after
 * this; `pnpm check` asserts the two were baked together.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { decodePlaces, encodePlaces, inflate } from '../src/pack.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import {
  BIGGEST_SETTLEMENT,
  PROMINENCE_CAP,
  PROMINENCE_RADIUS,
  PROMINENCE_RATIO,
  isShown,
  prominenceField,
  radiusFor,
  rankOf,
  shadeOf,
} from '../src/places.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.argv[2] ?? resolve(here, '../../.cache/cities5000.txt');
const COUNTRY_INFO = resolve(here, '../../.cache/countryInfo.txt');
const OUT = resolve(here, '../public/data/places.bin');

/**
 * Decimal places kept on a coordinate: about 110 m. Rounding happens before
 * the land test (including inside `snapToLand`), so what ships is what was
 * verified to be on land.
 */
const PRECISION = 3;
const round = (v) => Number(v.toFixed(PRECISION));

/**
 * How far the snap looks for land, in kilometres. Most moves are a couple of
 * kilometres (a coarse coast against precise coordinates); a place further
 * out is on an island the planet does not draw, and is dropped rather than
 * moved onto the wrong one.
 */
const MAX_SNAP_KM = 100;
/** Kilometres per degree of latitude, the unit the search steps in. */
const KM_PER_DEGREE = 111.19;

const countriesPath = resolve(here, '../public/data/countries.bin');
const outlines = readFileSync(countriesPath);
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// `loadWorld` and `loadLakes` fetch their files; serve them from disk.
globalThis.fetch = async (url) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
});

const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const isoOf = (id) => (id > 0 ? world.countries[id - 1].iso : '');
const nameOf = (id) => (id > 0 ? world.countries[id - 1].name : 'open ocean');

const DEG = Math.PI / 180;

/**
 * GeoNames' alpha-2 country codes to the outlines' alpha-3, from
 * `countryInfo.txt`. Used only so the snap prefers the declared country; the
 * shipped `iso` is always `countryAt`'s answer.
 */
const alpha3 = new Map();
for (const line of readFileSync(COUNTRY_INFO, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const f = line.split('\t');
  if (f.length > 2) alpha3.set(f[0], f[1]);
}

/** Great-circle separation in world units. */
function unitsBetween(aLat, aLon, bLat, bLon) {
  const h =
    Math.sin(((bLat - aLat) * DEG) / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(((bLon - aLon) * DEG) / 2) ** 2;
  return 2 * PLANET_RADIUS * Math.asin(Math.sqrt(h));
}
/** Kilometres per world unit (about 0.4). */
const KM_PER_UNIT = 6371 / PLANET_RADIUS;

/**
 * Nearest land, searched outward in rings that are round on the ground
 * (longitude steps divided by cos(lat)). Candidates are quantised to
 * `PRECISION` before being tested.
 */
function snapToLand(lat, lon, wantIso) {
  const preferred = (id) => isoOf(id) === wantIso;
  // Two passes: first insist on the declared country, then accept any land.
  for (const accept of [preferred, (id) => id > 0]) {
    for (let radius = 0.02; radius <= MAX_SNAP_KM / KM_PER_DEGREE; radius += 0.02) {
      const steps = Math.max(16, Math.round(radius * 240));
      for (let k = 0; k < steps; k++) {
        const angle = (k / steps) * Math.PI * 2;
        const y = round(lat + radius * Math.sin(angle));
        if (Math.abs(y) > 90) continue;
        const dLon = (radius * Math.cos(angle)) / Math.max(0.02, Math.cos(lat * DEG));
        const x = round(((lon + dLon + 540) % 360) - 180);
        if (accept(world.countryAt(y, x))) return { lat: y, lon: x };
      }
    }
  }
  return null;
}

/**
 * Parsing the GeoNames dump: tab-separated, nineteen columns, no header.
 *
 * - `name` (not `asciiname`): the English exonym where one exists, otherwise
 *   the local name with its accents.
 * - `population` is the municipality, not the agglomeration.
 * - `feature code` gives `capital` (`PPLC`) and drops non-settlements:
 *   `PPLX` is a section of a city already in the file, and `PPLQ`, `PPLW`,
 *   `PPLH` are abandoned, destroyed and historical places.
 * - `timezone` ships, as a byte into its country's zone list (`encodePlaces`).
 * - The admin codes are kept only to recognise districts (`isDistrict`).
 * - Everything else is dropped.
 */
/**
 * Three significant figures. Divides by the step (rather than multiplying by
 * its reciprocal) so every result is an exact integer.
 */
function significant(n) {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 2);
  return Math.round(n / step) * step;
}

/** City sections and abandoned, destroyed or historical places. */
const NOT_A_SETTLEMENT = new Set(['PPLX', 'PPLQ', 'PPLW', 'PPLH']);

function parse(line) {
  const f = line.split('\t');
  const raw = Number(f[14]);
  if (!(raw > 0)) return null;
  if (NOT_A_SETTLEMENT.has(f[7])) return null;
  const pop = significant(raw);
  return {
    name: f[1],
    /** The declared country, alpha-3, used by the snap and then thrown away. */
    iso: alpha3.get(f[8]) ?? f[8],
    lat: round(Number(f[4])),
    lon: round(Number(f[5])),
    pop,
    capital: f[7] === 'PPLC',
    zone: f[17],
    /** The four admin codes, used to tell a district from a town (`isDistrict`) and then thrown away. */
    admin: [f[10], f[11], f[12], f[13]],
  };
}

const lines = readFileSync(SOURCE, 'utf8').split('\n');
const candidates = [];
for (const line of lines) {
  if (!line) continue;
  const row = parse(line);
  if (row === null) continue;
  if (!row.zone) throw new Error(`${row.name} has no time zone in the source`);
  candidates.push(row);
}

const onLand = [];
const sea = [];
const stranded = [];
const mismatches = new Map();

for (const p of candidates) {
  let hit = world.countryAt(p.lat, p.lon);
  let movedKm = 0;

  if (hit === 0) {
    const snapped = snapToLand(p.lat, p.lon, p.iso);
    if (snapped === null) {
      stranded.push(`${p.name}, ${p.iso} (pop ${p.pop})`);
      continue;
    }
    movedKm = unitsBetween(p.lat, p.lon, snapped.lat, snapped.lon) * KM_PER_UNIT;
    p.lat = snapped.lat;
    p.lon = snapped.lon;
    hit = world.countryAt(p.lat, p.lon);
    sea.push({ text: `${p.name}, ${p.iso} -> ${nameOf(hit)}`, km: movedKm });
  }

  // The country is the one the ground reports, not the one the source declares
  // (they differ near borders, in undrawn microstates and disputed territories).
  // Disagreements are reported, not resolved.
  const ground = isoOf(hit);
  if (ground !== p.iso) {
    const key = `${p.iso} -> ${ground} (${nameOf(hit)})`;
    const seen = mismatches.get(key);
    if (seen === undefined) mismatches.set(key, { n: 1, example: p.name });
    else seen.n++;
  }

  onLand.push({
    name: p.name,
    iso: ground,
    lat: p.lat,
    lon: p.lon,
    pop: p.pop,
    capital: p.capital,
    zone: p.zone,
    admin: p.admin,
    movedKm,
  });
}

/**
 * The thinning: greedy, largest first (by `rankOf`, which ranks a national
 * capital as at least `CAPITAL_RANK`), keeping a candidate only if its built
 * disc touches no kept one. This removes duplicates and folds districts and
 * suburbs into their city.
 *
 * A place of `FIT_POPULATION` or more, or a national capital, is fitted
 * smaller rather than deleted, by the first of two steps that works:
 *
 * - It takes the room the kept discs leave it, floored to a whole unit, if
 *   that is at least `FIT_RADIUS`.
 * - Otherwise a neighbour gives it ground, if the neighbour is across a
 *   national border, is a peer (under `PROMINENCE_RATIO` times its rank), or
 *   the place is a capital. The two split the distance in proportion to their
 *   radii, the host keeping at least `HOST_KEEPS` of its own (across a border,
 *   only `FIT_RADIUS`). A national capital never gives ground.
 *
 * Shrinking a kept disc can never create an overlap, so the share runs inside
 * the greedy loop. Neither step is taken where the host would hide the place
 * anyway (`hides`); its name becomes an alias instead.
 *
 * The three constants were swept together: 500,000 restores the half-million
 * to million cities without carving towns out of a metro's ring; 24 units is
 * the smallest square `townGrid` cuts three cells a side; two thirds keeps a
 * host bigger than the city fitted beside it.
 *
 * The grid is half-degree cells, searched far enough to cover
 * `BIGGEST_SETTLEMENT` twice.
 */
const FIT_POPULATION = 500_000;
/** The smallest radius a place is fitted to, in world units; see `FIT_POPULATION`. */
const FIT_RADIUS = 24;
/** How much of its own radius a host keeps when it gives a peer or a capital ground; see `FIT_POPULATION`. */
const HOST_KEEPS = 2 / 3;

const CELL = 0.5;
const key = (a, b) => a * 2000 + (((b % 720) + 720) % 720);
const grid = new Map();
const places = [];
const absorbed = [];
const fitted = [];
const shares = [];

/**
 * Whether `host`, built at `built` and `units` away, would hide `p`: the
 * question `isShown` asks, with `shadeOf` for a host built smaller than the law.
 */
function hides(host, built, units, p) {
  if (p.capital || units >= PROMINENCE_RADIUS) return false;
  const radius = built === radiusFor(host.pop) ? undefined : built;
  return shadeOf({ pop: host.pop, capital: host.capital, radius }) >= PROMINENCE_RATIO * rankOf(p);
}

/**
 * The radius `p` is kept at among the kept places it collides with, and what
 * each host that gives it ground shrinks to; null if it is absorbed.
 */
function fit(p, natural, hosts) {
  const big = p.capital || p.pop >= FIT_POPULATION;
  // A capital smaller than a fitted town is kept whole or not at all.
  const least = Math.min(FIT_RADIUS, natural);
  let room = natural;
  for (const { host, units } of hosts) room = Math.min(room, units - host.built);
  room = Math.floor(room);
  if (big && room >= least && !hosts.some(({ host, units }) => hides(host, host.built, units, p))) {
    return { built: room, yielding: [] };
  }
  let take = natural;
  const yielding = [];
  for (const { host, units } of hosts) {
    const across = host.iso !== p.iso && (p.pop >= FIT_POPULATION || host.pop >= FIT_POPULATION);
    const peer = big && (p.capital || rankOf(host) < PROMINENCE_RATIO * rankOf(p));
    if (host.capital || (!across && !peer)) {
      take = Math.min(take, units - host.built);
      continue;
    }
    const own = radiusFor(host.pop);
    const keeps = Math.min(host.built, across ? FIT_RADIUS : Math.max(FIT_RADIUS, Math.ceil(HOST_KEEPS * own)));
    const share = (units * natural) / (natural + own);
    take = Math.min(take, Math.max(share, units - host.built), units - keeps);
    yielding.push({ host, units });
  }
  take = Math.floor(take);
  if (yielding.length === 0 || take < least) return null;
  // A host shrinks only as far as it must, to a whole unit.
  const after = ({ host, units }) =>
    yielding.some((y) => y.host === host) && host.built > units - take ? Math.floor(units - take) : host.built;
  if (hosts.some((h) => hides(h.host, after(h), h.units, p))) return null;
  return { built: take, yielding: yielding.map((y) => ({ host: y.host, built: after(y) })) };
}

for (const p of onLand.slice().sort((a, b) => rankOf(b) - rankOf(a) || a.name.localeCompare(b.name, 'en'))) {
  const natural = radiusFor(p.pop);
  const a = Math.floor((p.lat + 90) / CELL);
  const b = Math.floor((p.lon + 180) / CELL);
  // The furthest a conflict can be: this radius plus the largest one anywhere.
  const dLat = Math.ceil((natural + BIGGEST_SETTLEMENT) / (PLANET_RADIUS * DEG) / CELL);
  const span = Math.min(360, Math.ceil(dLat / Math.max(0.02, Math.cos(p.lat * DEG))));
  const hosts = [];
  for (let da = -dLat; da <= dLat; da++) {
    for (let db = -span; db <= span; db++) {
      const bucket = grid.get(key(a + da, b + db));
      if (bucket === undefined) continue;
      for (const q of bucket) {
        const units = unitsBetween(p.lat, p.lon, q.lat, q.lon);
        if (units < natural + q.built) hosts.push({ host: q, units });
      }
    }
  }
  const kept = hosts.length === 0 ? { built: natural, yielding: [] } : fit(p, natural, hosts);
  if (kept === null) {
    // The host it is folded into is the one it overlaps deepest.
    let deepest = hosts[0];
    for (const h of hosts) if (h.units - h.host.built < deepest.units - deepest.host.built) deepest = h;
    absorbed.push({ name: p.name, iso: p.iso, pop: p.pop, capital: p.capital, lat: p.lat, lon: p.lon, admin: p.admin, into: deepest.host });
    continue;
  }
  if (hosts.length > 0) fitted.push({ place: p, built: kept.built, natural });
  for (const { host, built } of kept.yielding) {
    if (built >= host.built) continue;
    shares.push({ to: p.name, from: host, was: host.built, now: built, across: host.iso !== p.iso });
    host.built = built;
  }
  const row = { ...p, built: kept.built };
  places.push(row);
  const cell = key(a, b);
  let bucket = grid.get(cell);
  if (bucket === undefined) grid.set(cell, (bucket = []));
  bucket.push(row);
}

/**
 * Largest first, so a consumer on a budget can take a prefix. `roads.bin`
 * indexes into this array, so the order is part of its contract.
 */
places.sort((a, b) => b.pop - a.pop || a.name.localeCompare(b.name, 'en'));

/** What ships as `Place.radius`: the built radius, only where it is not the law's. */
const storedRadius = (p) => (p.built === radiusFor(p.pop) ? undefined : p.built);

/**
 * Names the thinning absorbed are kept as aliases of the host they overlapped
 * deepest, so the menu's search finds them: every absorbed place of this many
 * people or more, and every absorbed national capital. One alias per name
 * (the biggest place that had it), never one repeating its host's name.
 * Lowering the threshold mostly adds suburbs at a few KB per halving.
 */
const ALIAS_POPULATION = 100_000;

/**
 * A district of its host is not an alias (GeoNames files many districts as
 * plain places). An absorbed non-capital is a district when either:
 *
 * - its admin codes match all of its host's, which must go at least three
 *   levels deep (the second level is a county or prefecture, which holds
 *   separate cities), in the same country; or
 * - it is within `DISTRICT_KM` of its host's point.
 */
const DISTRICT_KM = 12;
function isDistrict(a) {
  if (a.capital) return false;
  if (unitsBetween(a.lat, a.lon, a.into.lat, a.into.lon) * KM_PER_UNIT < DISTRICT_KM) return true;
  const host = a.into.admin;
  let depth = 0;
  for (let level = 0; level < 4; level++) if (host[level]) depth = level + 1;
  if (depth < 3 || a.iso !== a.into.iso) return false;
  for (let level = 0; level < depth; level++) if (a.admin[level] !== host[level]) return false;
  return true;
}

const aliasByName = new Map();
let districts = 0;
for (const a of absorbed) {
  if ((a.pop < ALIAS_POPULATION && !a.capital) || a.name === a.into.name) continue;
  if (isDistrict(a)) {
    districts++;
    continue;
  }
  const seen = aliasByName.get(a.name);
  if (seen === undefined || a.pop > seen.pop) aliasByName.set(a.name, a);
}
const aliasesOf = new Map();
for (const a of [...aliasByName.values()].sort((x, y) => y.pop - x.pop || x.name.localeCompare(y.name, 'en'))) {
  let list = aliasesOf.get(a.into);
  if (list === undefined) aliasesOf.set(a.into, (list = []));
  list.push(a.name);
}

/**
 * The prominence field: how far each place is from the nearest place of at
 * least `PROMINENCE_RATIO` times its rank (`PROMINENCE_RADIUS` in `places.ts`).
 * Computed after the sort, with the radius as shipped, because `pnpm check`
 * recomputes it from the shipped rows and compares.
 */
const prominenceBegan = Date.now();
const prominence = prominenceField(
  places.map((p) => ({ lat: p.lat, lon: p.lon, pop: p.pop, capital: p.capital, radius: storedRadius(p) })),
  PLANET_RADIUS,
);
const prominenceMs = Date.now() - prominenceBegan;

/**
 * The shipped rows, packed and gzipped. The bake decodes its own output and
 * compares before writing, since a coordinate off by a thousandth of a degree
 * could put a place in the sea.
 */
const shipped = places.map((p, i) => ({
  name: p.name,
  iso: p.iso,
  lat: p.lat,
  lon: p.lon,
  pop: p.pop,
  // Before the optional keys, because the decoder builds its rows in this
  // order and the round-trip below compares them as JSON.
  prominence: prominence[i],
  zone: p.zone,
  ...(p.capital ? { capital: true } : {}),
  ...(p.movedKm > 0 ? { snappedKm: Number(p.movedKm.toFixed(1)) } : {}),
  ...(storedRadius(p) !== undefined ? { radius: storedRadius(p) } : {}),
  ...(aliasesOf.has(p) ? { aliases: aliasesOf.get(p) } : {}),
}));
const packed = gzipSync(encodePlaces(shipped), { level: 9 });
if (JSON.stringify(decodePlaces(await inflate(packed))) !== JSON.stringify(shipped)) {
  throw new Error('places.bin does not decode back to what was baked');
}
writeFileSync(OUT, packed);
rmSync(resolve(here, '../public/data/places.json'), { force: true });

// ---------------------------------------------------------------------------
// The report. Everything below only prints.
// ---------------------------------------------------------------------------

const kb = (readFileSync(OUT).length / 1024).toFixed(0);
const capitals = places.filter((p) => p.capital).length;
console.log(
  `${candidates.length} in the source -> ${onLand.length} on land -> ` +
  `${places.length} places, ${capitals} capitals -> ${kb} KB gzipped`,
);
console.log(
  `  ${lines.filter(Boolean).length - candidates.length} with no population or not a settlement · ` +
  `${sea.length} snapped ashore · ${stranded.length} stranded · ` +
  `${absorbed.length} inside another settlement`,
);

/** Gap to the nearest neighbour, for the report. */
const gaps = [];
let overlapping = 0;
for (const p of places) {
  const a = Math.floor((p.lat + 90) / CELL);
  const b = Math.floor((p.lon + 180) / CELL);
  let best = Infinity;
  const span = Math.min(360, Math.ceil(2 / Math.max(0.02, Math.cos(p.lat * DEG))));
  for (let da = -2; da <= 2; da++) {
    for (let db = -span; db <= span; db++) {
      for (const q of grid.get(key(a + da, b + db)) ?? []) {
        if (q === p) continue;
        const d = unitsBetween(p.lat, p.lon, q.lat, q.lon);
        if (d < best) best = d;
      }
    }
  }
  gaps.push(best);
  if (best < p.built) overlapping++;
}
gaps.sort((x, y) => x - y);
const at = (f) => gaps[Math.floor(f * (gaps.length - 1))];
const radii = places.map((p) => p.built).sort((x, y) => x - y);
console.log(
  `\ngap to the nearest neighbour: p10 ${at(0.1).toFixed(0)}u · ` +
  `median ${at(0.5).toFixed(0)}u · p90 ${at(0.9).toFixed(0)}u ` +
  `(median radius ${radii[radii.length >> 1].toFixed(0)}u, ` +
  `${overlapping} standing inside a neighbour)`,
);

const perCountry = new Map();
for (const p of places) perCountry.set(p.iso, (perCountry.get(p.iso) ?? 0) + 1);
const sample = ['ESP', 'DEU', 'JPN', 'ITA', 'FRA', 'GBR', 'USA', 'IND', 'BRA', 'NOR', 'MAR', 'ISL'];
console.log('  ' + sample.map((c) => `${c} ${perCountry.get(c) ?? 0}`).join(' · '));

/** Which places are built, with a few islands as a spot check (Mallorca should be Palma alone). */
{
  const shownCount = shipped.filter(isShown).length;
  const atCap = prominence.filter((v) => v >= PROMINENCE_CAP).length;
  const hiddenCapitals = shipped.filter((p) => p.capital && !isShown(p)).length;
  const sorted = Float64Array.from(prominence).sort();
  const at = (f) => sorted[Math.floor(f * (sorted.length - 1))];
  console.log(
    `\nprominence (nearest place at ${PROMINENCE_RATIO}x the rank): p10 ${at(0.1)}u · median ${at(0.5)}u · ` +
    `p90 ${at(0.9)}u · ${atCap} at the ${PROMINENCE_CAP}u cap · ${prominenceMs} ms`,
  );
  console.log(
    `  shown at ${PROMINENCE_RADIUS}u: ${shownCount} of ${places.length} ` +
    `(${((100 * shownCount) / places.length).toFixed(1)}%) · ${hiddenCapitals} capitals hidden`,
  );
  const island = (name, lat0, lat1, lon0, lon1) => {
    const rows = shipped.filter((p) => p.lat >= lat0 && p.lat <= lat1 && p.lon >= lon0 && p.lon <= lon1);
    const built = rows.filter(isShown).map((p) => p.name);
    console.log(`  ${name.padEnd(9)} ${rows.length} places, built: ${built.join(', ') || '—'}`);
  };
  island('Mallorca', 39.25, 39.98, 2.28, 3.5);
  island('Menorca', 39.8, 40.1, 3.75, 4.35);
  island('Ibiza', 38.6, 39.13, 1.2, 1.65);
}

if (sea.length) {
  console.log(`\n${sea.length} in the sea against the actual coastline, snapped to land; furthest:`);
  for (const s of sea.sort((a, b) => b.km - a.km).slice(0, 8)) {
    console.log(`  ${s.text.padEnd(52)} ${s.km.toFixed(1)} km`);
  }
  const far = sea.filter((s) => s.km > 10).length;
  console.log(`  median ${sea[sea.length >> 1].km.toFixed(1)} km, ${far} moved more than 10 km`);
}

if (stranded.length) {
  console.log(`\nno land within ${MAX_SNAP_KM} km — an island this planet does not draw; dropped:`);
  for (const s of stranded.slice(0, 20)) console.log('  ' + s);
  if (stranded.length > 20) console.log(`  ... and ${stranded.length - 20} more`);
}

const lostCapitals = absorbed.filter((a) => a.capital);
if (lostCapitals.length) {
  console.log(`\n${lostCapitals.length} national capitals stand inside a larger neighbour:`);
  for (const c of lostCapitals) console.log(`  ${c.name} (pop ${c.pop}) inside ${c.into.name}`);
}

/** What the fit kept smaller, and which hosts gave it room. */
{
  const restored = fitted.filter((f) => f.place.pop >= 1e6).sort((x, y) => y.place.pop - x.place.pop);
  console.log(
    `\n${fitted.length} kept smaller rather than deleted (${fitted.filter((f) => f.place.capital).length} capitals), ` +
    `${restored.length} of them over a million; ${shares.length} hosts gave ground:`,
  );
  const line = (f) => `${f.place.name} ${f.built}/${f.natural.toFixed(0)}`;
  for (let k = 0; k < restored.length; k += 6) console.log('  ' + restored.slice(k, k + 6).map(line).join(' · '));
  for (const g of shares) {
    console.log(
      `  ${g.from.name.padEnd(16)} ${g.was.toFixed(0).padStart(3)} -> ${String(g.now).padStart(3)}  for ${g.to}` +
      `${g.across ? ', across a border' : ''}`,
    );
  }
  const names = [...aliasesOf.values()].reduce((n, list) => n + list.length, 0);
  const bare = gzipSync(encodePlaces(shipped.map(({ aliases, ...row }) => row)), { level: 9 }).length;
  console.log(
    `  ${names} names absorbed at ${ALIAS_POPULATION.toLocaleString('en')} or more, or capitals, kept as aliases of ` +
    `${aliasesOf.size} places, +${((readFileSync(OUT).length - bare) / 1024).toFixed(1)} KB gzipped; ` +
    `${districts} districts of their host left out (DISTRICT_KM)`,
  );
}

/** The largest places thinned away. */
const big = absorbed.filter((a) => a.pop >= 1e6).sort((x, y) => y.pop - x.pop);
console.log(`\n${absorbed.length} thinned away, ${big.length} of them over a million; the largest:`);
for (const a of big.slice(0, 12)) {
  console.log(`  ${`${a.name} (${a.pop})`.padEnd(40)} inside ${a.into.name}`);
}

const shape = [...mismatches.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(`\n${shape.reduce((n, [, v]) => n + v.n, 0)} disagree with the source's own country:`);
for (const [k, v] of shape.slice(0, 14)) console.log(`  ${String(v.n).padStart(4)}  ${k}  e.g. ${v.example}`);
if (shape.length > 14) console.log(`  ... and ${shape.length - 14} more pairs`);
