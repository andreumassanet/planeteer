/**
 * Bakes GeoNames' populated places into the list every settlement, tree, street
 * and road is positioned from.
 *
 *   node scripts/build-places.mjs [cities5000.txt]
 *
 * **The source changed, and the reason is the one `MIN_RING_AREA` already
 * recorded: no filter recovers what is not in the file.** This used to read
 * Natural Earth's `ne_10m_populated_places`, which is a *cartographic* file —
 * the labels a world map can fit, not a gazetteer of where people live. It gives
 * **Spain 48 places, Germany 58, Japan 69, Italy 57**, against about eight
 * thousand Spanish municipalities, and nothing in this script was dropping them:
 * 7,320 of the source's 7,342 features survived. A country you can walk across
 * for four minutes and pass two villages does not read as inhabited, and the
 * repair was the same as the one that fixed the Balearics — find a better file.
 *
 * GeoNames' `cities5000` is that file: every settlement over about 5,000 people
 * or seat of an administrative division, 69,622 of them, with real populations
 * and coordinates good to a few metres. **It is CC BY 4.0, not public domain** —
 * see the credit on the loading screen, on the settings card and in `CREDITS.md`,
 * which is the whole of what the licence asks and is not optional.
 *
 * Four decisions are baked in here and each is measured. The numbers are from
 * the run this file was written against.
 *
 * **cities5000, and the tier above it was tried first and is a regression.** The
 * tiers are nested, so this looks like a straight trade of payload for density
 * (thinned as below, gzipped as JSON, which is what both files were when this
 * was measured — see the note under the second table):
 *
 * ```
 *   source            places   thinned   gzipped   Spain  Germany  Japan  Italy
 *   NE 1:10m           7,342     7,320    140 KB      48       58     69     57
 *   cities15000       31,712    14,113    254 KB     173      238    243    174
 *   cities5000        64,229    23,867    430 KB     334      424    320    312
 *   cities1000       149,395    40,023    713 KB   1,388      619    423    803
 * ```
 *
 * It is not a straight trade, and the column that says so is not in that table.
 * **A population threshold is a tax on thinly urbanised countries**, and at
 * 15,000 it deletes more of them than the gazetteer adds:
 *
 * ```
 *                NE   15000   5000          NE   15000   5000
 *   Norway       35      28     65     Australia    224      76    188
 *   Iceland       9       3      8     Canada       254     126    310
 *   Switzerland  28      19     40     New Zealand   51      24     52
 *   Estonia       6       5     20     Botswana      20      19     39
 * ```
 *
 * Eleven of sixteen countries checked came out of cities15000 *worse than the
 * file it replaces* — Australia at a third, Iceland at a third, Canada at half —
 * because a country whose towns are five thousand people has no towns at all
 * above fifteen. Natural Earth's file is cartographic and therefore hand-spread;
 * a threshold is not, and the fix for a threshold that is too high is a lower
 * threshold and not a better filter. cities5000 is at or above the baseline
 * everywhere tested and Iceland's 9 -> 8 is the only place it is not.
 *
 * cities1000 was rejected on the wire, and **the rule that rejected it has been
 * overtaken by the format**. It read *the client's biggest download stays the
 * outlines*, and cities5000's 430 KB cleared `countries.json`'s 446 only because
 * the population is rounded to three significant figures. Both files are binary
 * now — see `src/pack.ts` — and they did not shrink by the same factor: **the
 * outlines went 456 KB to 170 and the places 440 to 266**, because 97,280
 * coordinates are a delta away from nothing and 23,867 *names* are the one thing
 * in either file with no redundancy left in them. The places are the biggest
 * download now, so the old rule would condemn the decision it was written to
 * defend.
 *
 * What survives is the arithmetic rather than the ordering, and the conclusion
 * does not move. Every column that grows in this file grows with the row count,
 * so cities1000's 40,023 rows would be about 450 KB of places and another 290 of
 * roads — a first load near 1.1 MB against 612 KB. The tier is still rejected,
 * on the **total** rather than on which file is largest, and the rounding still
 * pays for itself: 36 KB for a fourth digit that was never real.
 *
 * **Every place is thinned so that no two settlements are built on top of each
 * other, and that is what makes a gazetteer usable at all.** A cartographic file
 * lists one row per city; a gazetteer lists one per municipality, so a metro
 * area arrives as forty rows and `radiusFor` puts a 30-unit disc of houses on
 * each. Measured on the raw tier: **60% of places have a neighbour inside their
 * own built radius**, against 5.8% in the file this replaces. The thinning is
 * `minimap.ts`'s own rule — greedy, largest first, and the survivor of a cluster
 * is the one you would actually walk to — with the separation taken from
 * `radiusFor` itself rather than from a constant: a place is kept only if its
 * buildings would not stand in another's. 64,229 -> 23,867, and **overlap goes
 * to zero**, which is better than the world this replaces rather than a cost of
 * it. `pnpm check` asserts it, so a change to `radiusFor` fails the check and
 * says re-bake rather than quietly overlapping the towns.
 *
 * What the thinning costs is written down: it is the same compression
 * `build-monuments.ts` makes when it pushes the Sphinx off the Pyramids. Madrid
 * claims 103 units under `radiusFor`'s `0.465 * pop^0.36` and deletes the real
 * towns 45 km out of it. Keep the ordering, give up the ratio.
 *
 * **93 places over a million people lose their ground to a neighbour**
 * (2026-09-21; it was 140 until the thinning began fitting cities rather than
 * deleting them, and 117 under the old radius law) **and most of those are
 * right**: they are city districts and dormitory suburbs — Brooklyn, Giza,
 * Yokohama, Bekasi, Soweto, Pudong — which is exactly what a 1:400 planet
 * should do with them. The ones that were not right were two genuine cities
 * standing closer than the sum of their radii — **Kyoto inside Osaka, Shenzhen
 * inside Guangzhou, Tianjin inside Beijing, Düsseldorf inside Köln, San Diego
 * inside Tijuana** — and those are kept now, smaller: see `FIT_POPULATION`.
 * What is left is where no square fits. **Kobe** is 73 units from Osaka and
 * **Manila** 22 from Quezon City, and Manila is the sharper case, because there
 * the *smaller* name is the famous one and it loses on a municipal census;
 * both are aliases of the town that stands (`ALIAS_POPULATION`), so the menu
 * finds them.
 *
 * **A rename was tried for exactly that and it is measured as wrong.** The rule
 * was: when the absorbed place outranks its host in GeoNames' own `PPLC > PPLA >
 * PPLA2` hierarchy, is in the same country and is within a factor of two on
 * population, the surviving row takes its name. It fixes Quezon City -> Manila,
 * Zapopan -> Guadalajara and Al Muharraq -> Manama, and then it renames **Köln
 * to Düsseldorf**, Minneapolis to Saint Paul, Gijón to Oviedo and Nijmegen to
 * Arnhem, over 661 rows. Administrative rank is not fame: Düsseldorf is a Land
 * capital and Köln is not, and no threshold on that ordering separates the three
 * good cases from the four bad ones. The honest fix is a source that carries an
 * *agglomeration* figure the way `POP_MAX` did, and this one does not.
 *
 * **Population is carried to three significant figures**, which is 36 KB of the
 * wire and no information at all: every consumer of it is a slow curve.
 * `radiusFor` is a power law with an exponent of 0.36 and `urbanityOf` is a
 * log, so rounding Madrid's 3,255,944 to 3,260,000 moves its built radius by
 * 0.05 units, and the worst place in the file, Longyan, by **0.12** (2026-09-21)
 * — a sixtieth of an avatar, a twentieth of a house. The figures are census counts of a dozen different
 * vintages and estimates besides; the fourth digit was never real.
 *
 * **Six fields survive** — `name`, `lat`, `lon`, `pop`, `iso` and `zone`, plus
 * `capital` on the national capitals. What was dropped and why is at `parse()`
 * below.
 * **And three are computed.** `radius`, on the 113 rows the thinning built
 * smaller than `radiusFor` says (`FIT_POPULATION`), and `aliases`, the names it
 * folded into a row (`ALIAS_POPULATION`; 2,395 on 771 rows, 2026-09-21). And
 * `prominence`, the distance to the nearest place at twice the rank, which is
 * what decides whether a place is *built* — the footprint thinning above says
 * no two towns overlap and nothing about whether all of them should exist. It
 * is a field and not a filter so that `roads.bin`'s indices stay valid and the
 * radius stays a runtime knob; the study and the numbers are on
 * `PROMINENCE_RADIUS` in `places.ts`.
 *
 * **Coordinates are rounded before they are tested, not after.** See PRECISION.
 *
 * **Places in the sea are snapped to land here, once**, against the actual
 * coastline the world is drawn from, so no client repeats the search.
 * That is the job `build-monuments.ts` does for landmarks and it uses the same
 * search; the difference is what happens when it comes up empty, at MAX_SNAP_KM.
 *
 * **Re-baking this invalidates `roads.bin`**, which is indices into this array.
 * Run `pnpm roads` after `pnpm places`, always; `pnpm check` asserts the two
 * were baked against each other and fails loudly if they were not.
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
 * Decimal places kept on a coordinate: about 110 m, or 0.28 world units against
 * a 3.77-unit person.
 *
 * `build-countries.mjs` picks its precision per ring by how much quantising
 * distorts a *shape*. A city is a point and has no shape, so the constraint is
 * different: rounding must not move a place across the coastline it was just
 * checked against. Measured on the file this replaced, 2 decimals (~1.1 km)
 * pushed 19 places that were on land into the sea; 3 decimals pushed 2.
 *
 * Those two are handled by rounding *first* and testing the rounded value, so
 * what ships is what was verified — including inside `snapToLand`, which
 * quantises every candidate before asking whether it is land.
 */
const PRECISION = 3;
const round = (v) => Number(v.toFixed(PRECISION));

/**
 * How far the snap will look for land before giving up, in kilometres.
 *
 * The snap corrects a coastline drawn at national-atlas scale against
 * coordinates that are good to a few metres, so almost every move is short —
 * median 2.2 km, re-measured against 1:10m (2026-09-09; it was "under three
 * kilometres" against 1:50m, not a number this run kept). The tail is where
 * the number matters. Below
 * it a place is still in its own neighbourhood — 100 km is 250 world units,
 * under two median gaps between neighbouring places. Above it the place is not
 * beside a coast that was drawn coarsely, it is on an island that was not
 * drawn at all, and moving it there invents a location rather than correcting
 * one. Those are
 * dropped: this planet does not have that island, and saying so is better than
 * putting the town on the wrong one.
 *
 * `build-monuments.ts` searches out to 3 degrees with no such cut, because a
 * landmark is worth relocating to keep. A city is one of twenty-four thousand.
 */
const MAX_SNAP_KM = 100;
/** Kilometres per degree of latitude, which is the unit the search steps in. */
const KM_PER_DEGREE = 111.19;

const countriesPath = resolve(here, '../public/data/countries.bin');
const outlines = readFileSync(countriesPath);
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// Two files now, so the stub has to look at the URL; see `build-lakes.mjs`.
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
 * GeoNames keys countries by ISO alpha-2 and this project keys them by the
 * `ADM0_A3` the outlines carry, so the two need joining for exactly one purpose:
 * the snap's first pass, which prefers to land a place back inside the country
 * that declared it. The shipped `iso` is `countryAt`'s answer and never this.
 *
 * `countryInfo.txt` is the join, from the same source and the same licence, and
 * like the source it is a build input that is never shipped.
 */
const alpha3 = new Map();
for (const line of readFileSync(COUNTRY_INFO, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const f = line.split('\t');
  if (f.length > 2) alpha3.set(f[0], f[1]);
}

/** Great-circle separation in world units, which is the unit that decides things here. */
function unitsBetween(aLat, aLon, bLat, bLon) {
  const h =
    Math.sin(((bLat - aLat) * DEG) / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(((bLon - aLon) * DEG) / 2) ** 2;
  return 2 * PLANET_RADIUS * Math.asin(Math.sqrt(h));
}
/** One world unit is 0.4 km: the planet is about 1:400 against Earth. */
const KM_PER_UNIT = 6371 / PLANET_RADIUS;

/**
 * Nearest point that is land, searched outward in rings. Lifted from
 * `build-monuments.ts`, including the division of the longitude step by
 * cos(lat) that keeps a ring round on the ground rather than on the chart —
 * without it a search near the poles sweeps a band a few kilometres tall and
 * thousands wide, which is exactly where the Arctic towns are.
 *
 * The one change: candidates are quantised to PRECISION before being tested, so
 * the coordinate that ships is the coordinate that came back land.
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
 * The GeoNames dump is tab-separated with nineteen columns and no header. What
 * survives, and what does not:
 *
 * - `name` is the field, not `asciiname`. It is the English exonym where English
 *   has one (Munich, Rome, Vienna, Prague, Warsaw, Lisbon, Athens) and the local
 *   name otherwise, which is the same mix `NAME_EN` gave and the right one — the
 *   alternative strips the accents off Málaga and Nîmes for nothing. Every name
 *   is Latin script; the median is 8 characters and the longest 57.
 * - `population` is the municipality, where Natural Earth's `POP_MAX` was the
 *   agglomeration. **It matters less than it looks**, and that is worth
 *   knowing before anyone tries to reconstruct one: `radiusFor` is a power law
 *   with an exponent of 0.36, so Madrid's 3.3 M against a metro 5.6 M is 103
 *   units of radius against 125 — about a fifth, where the old law's exponent
 *   of 0.1876 made it a tenth. It is rounded to three significant
 *   figures here rather than at the write, so what the thinning measures is what
 *   ships.
 * - `feature code` decides two things and then does not survive. It carries
 *   `capital`, from `PPLC` — the one signal population does not: a capital gets
 *   a parliament at any size. And it is what **drops the 5,316 rows that are not
 *   settlements**: `PPLX` is GeoNames' own word for a *section* of a populated
 *   place, so Puxi, Kowloon, the New Territories, Ra's Bayrut and Al Mawsil al
 *   Jadidah are districts of cities that are already in the file, and left in
 *   they win their own city's ground on a municipal census — Mosul lost to its
 *   own new town. `PPLQ`, `PPLW` and `PPLH` are abandoned, destroyed and
 *   historical, which is the rule the old bake wrote as *nothing to generate for
 *   a ghost town*; GeoNames gives those a population, so `pop > 0` no longer
 *   catches them and the code has to. Everything else stays, including `PPLA`
 *   through `PPLA5` — the admin seats are most of the file's small towns and
 *   separate almost nothing.
 * - `timezone` survives, and it used to be dropped on purpose: `src/timezone.ts`
 *   answered the clock from the country and a meridian, with no per-place
 *   payload. The meridians were wrong wherever a zone boundary is a province
 *   line rather than a longitude — Calgary read Vancouver's time, Kazan and
 *   Nizhny Novgorod read an hour ahead of Moscow, Chukotka read Kaliningrad's,
 *   Indianapolis read Chicago's, Pohnpei read Chuuk's — and GeoNames already
 *   names the zone of every row. So the chip reads the nearest town's zone and
 *   the meridians are the fallback. It ships as a byte a row into its
 *   country's list of zones; see `encodePlaces`.
 * - `geonameid`, `alternatenames` (the bulk of the file: 200 translations a
 *   row), `cc2`, the four `admin` codes, `elevation`, `dem` and the
 *   modification date are all dropped.
 */
/**
 * Three significant figures; see the population note in the header.
 *
 * Multiply by the reciprocal and 16,000,000 comes back as
 * 15,999,999.999999998, which then ships as twenty characters of float. Divide
 * by the step and multiply, and every answer is an integer.
 */
function significant(n) {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 2);
  return Math.round(n / step) * step;
}

/** A section of a city, and a place nobody lives in any more. See `parse`. */
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

  /**
   * The country is the one the ground reports, not the one the source declares.
   *
   * The two disagree in three shapes and none of them is a coordinate typed a
   * degree off, which is what the same check catches for monuments: a town
   * within a few kilometres of a border that even a national-atlas-scale
   * frontier puts on the wrong side, a microstate `MIN_RING_AREA` never drew
   * (Monaco, the Vatican, Gibraltar and Macau are absent from `countries.bin`,
   * so their cities stand in the neighbour), and a territory whose
   * administration is disputed.
   *
   * A landmark declares its country as a claim; a city just reports the
   * administration it belongs to, and three kilometres of coastline error is not
   * a claim being broken. So this bake reports the disagreement and moves
   * nothing to resolve it. The report is grouped rather than listed because at
   * this volume the shape is the information and the rows are not.
   *
   * Taking `countryAt`'s answer also means `iso` always joins against
   * `countries.bin`, which the source's own code does not, and always agrees
   * with what the player standing there is told. That is what makes "a house in
   * Japan is not a house in Morocco" a table lookup and not a geometry query.
   */
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
 * The thinning, and the whole of what makes a gazetteer usable.
 *
 * Greedy, largest first, and a candidate is kept only when its built disc
 * touches no kept one — `units >= radiusOf(a) + radiusOf(b)`, the law's
 * `radiusFor` from `places.ts` wherever the fit below has not built a place
 * smaller, so there is exactly one definition of how big a settlement is.
 * Two consequences follow and both are deliberate:
 *
 * - **A duplicate cannot survive.** Two rows for the same city are zero units
 *   apart and the second is always blocked, which is why there is no Wikidata
 *   pass here any more. The file this replaced needed one; a gazetteer keyed on
 *   `geonameid` plus this rule does not.
 * - **A big city clears a big ring**, because the separation carries *its* own
 *   radius too. Madrid at 103 units deletes a 30-unit town — about 106,000
 *   people — anywhere within 53 km. That is
 *   the 1:400 compression, stated once, and it is the same one every monument
 *   and every crop in the contract makes.
 *
 * **A national capital is ranked as a place of at least `CAPITAL_RANK`**, which
 * is the one departure from pure population order and it is a bound rather than
 * a preference. Straight population order lost 26 capitals to a larger
 * neighbour, and most of those are right at 1:400 — New Delhi is inside Delhi,
 * the Vatican is inside Rome — but nine of them were **the only named place in
 * their country**: Malta became San Pawl il-Bahar, Liechtenstein became Buchs,
 * Guam became Dededo Village, Bermuda became Pembroke Parish.
 *
 * Ranking a capital higher can only ever delete a place smaller than the rank
 * itself, so the constant *is* the worst case, and the sweep is what picks it:
 *
 * ```
 *   rank      capitals lost   worst town it deletes to do so
 *   none            26 of 239  —
 *   50,000          17         Dededo Village 45k, a suburb of Hagatna
 *   100,000         15         Nasinu 92k, a suburb of Suva
 *   250,000         12         **Rimini 149k**, which is not San Marino's suburb
 *   500,000         10         **Nice 343k**, which is not Monaco's
 * ```
 *
 * At 100,000 all 69 places a capital displaces are that capital's own suburbs —
 * the whole of Malta losing to Valletta is the right answer at this scale, and
 * so is the whole of Guam losing to Hagatna. At 250,000 it starts taking real
 * cities that merely stand near a tiny capital, which is the failure the rank
 * exists to avoid. So 100,000, and the 15 capitals still lost are reported: they
 * are the ones genuinely standing inside a much larger city, which is what the
 * compression is supposed to do.
 *
 * The other order was tried and is worse: capitals *first*, so a capital always
 * claims its ground, hands Hong Kong the whole of Shenzhen and hands Putrajaya
 * Kuala Lumpur. A floor bounds the damage; a pass does not.
 *
 * The grid is half-degree cells, which is 139 world units — wider than the
 * largest separation this can ask for (`BIGGEST_SETTLEMENT` twice) divided by
 * the cells it searches, so nothing is missed at the seam. **That bound is
 * imported and was a literal `100`**, which was the old law's cap: a law with a
 * bigger cap would have searched too few cells and let a city stand inside a
 * larger one, silently and only near the very largest places.
 */
/**
 * **A big place that collides is fitted, not deleted** (2026-09-21).
 *
 * Deleting the lower-ranked of two colliding discs is right for a suburb and
 * wrong for a city, and the rule above cannot tell them apart: it took the
 * ground of 140 places over a million people, and among the districts it
 * should take — Brooklyn, Giza, Pudong — were Kyoto, Tianjin, Shenzhen, San
 * Diego, Mecca and Pretoria, for every one of which the menu's search answered
 * *nothing by that name that is built*. So a place of `FIT_POPULATION` or more,
 * or a national capital, is kept *smaller* rather than deleted, by the first of
 * two steps that works, and every other place is thinned exactly as before:
 *
 * - **It takes the room the kept discs leave it**: the largest radius that
 *   clears every one of them by the rule above, floored to a whole unit, if
 *   that is at least `FIT_RADIUS`. Tianjin stands at 121 units beside Beijing's
 *   150, and Mecca at 49 beside Jeddah.
 * - **Otherwise a neighbour gives it ground**, if the neighbour is across a
 *   national border, or is a *peer* — under `PROMINENCE_RATIO` times its rank,
 *   the ratio that already decides which twins both stand — or the place is a
 *   capital. The two split the distance between them in proportion to their
 *   own radii, the host keeping at least `HOST_KEEPS` of its own (across a
 *   border, only `FIT_RADIUS`: a border is where the rule was most plainly
 *   wrong, San Diego deleted by Tijuana and Amritsar by Lahore). Osaka keeps 65
 *   of its 97 units and Kyoto stands at 43; San Diego and Tijuana share their
 *   70 units 33 and 37. Across a border the smaller of the two need not reach
 *   `FIT_POPULATION` itself, because both of a border pair survive if either is
 *   that big — San Cristóbal takes ground from Cúcuta. **A national capital
 *   never gives ground**: it is the one place a country is sure to have, and
 *   without this Singapore went from 125 units to 59, and lost its only road,
 *   to Mukim Pulai, a Johor subdistrict the source gives 506,000 people.
 *
 * The share runs inside the greedy loop and not in a pass before it, because a
 * pass cannot know which of a pair a third place will take anyway, and inside
 * the loop it does not have to: **shrinking a kept disc can never make two
 * discs overlap**, so a host that yields after smaller places were thinned
 * against it at full size leaves empty ground between them, and does not bring
 * back what it absorbed. Neither step is taken where a host would *hide* the
 * place anyway (`shadeOf`, `isShown`): a city kept small and never built is a
 * deletion with extra steps, and its name is better as an alias.
 *
 * The three numbers were swept together over this file, by replaying this loop
 * before anything was re-baked. `absent` is places over a million with nothing
 * built at them, `lost` the towns built before and not after (of them, over
 * half a million), and the rows and built towns are the file's:
 *
 * ```
 *   FIT_POPULATION  FIT_RADIUS  HOST_KEEPS        rows   built   absent  capitals lost   lost (>500k)
 *   (delete all)         —           —          29,614   9,749     140        15           —
 *   250,000             24         2/3          29,663   9,813      93        12          64 (3)
 *   1,000,000           24         2/3          29,639   9,770      93        12          37 (5)
 *   500,000             20         2/3          29,647   9,799      91        12          48 (3)
 *   500,000             30         2/3          29,649   9,792      93        14          50 (3)
 *   500,000             24     (borders only)    29,612   9,774     105        15          44 (3)
 *   500,000             24         1/2          29,655   9,799      91        13          49 (3)
 *   500,000             24         3/4          29,639   9,788      97        15          46 (3)
 *   500,000             24         2/3          29,651   9,796      93        12          50 (3)
 * ```
 *
 * - **500,000**, because the cities over a million come back the same at any
 *   threshold (93 absent either way) and what the threshold decides is the half
 *   million to a million: at 500,000 Düsseldorf, Antwerp, Dortmund,
 *   Kitakyushu, Jammu and 30 more stand that 1,000,000 leaves unbuilt, and at
 *   250,000 the fit starts carving towns out of a metro's own ring — 64 towns
 *   lost against 50 — for places nobody searches for.
 * - **24 units**, because it is the smallest square `townGrid` cuts three
 *   cells a side, with a street down the middle. 20 brings back Gujranwala and
 *   Jinhua as two-by-two squares, four lots under the name of a city of two
 *   million; 30 loses Macau and Porto-Novo, both capitals, for no city.
 * - **Two thirds**, because with a share only across borders Kyoto, Tainan and
 *   Pretoria stay deleted (Osaka leaves Kyoto 11 units, and it takes 24); at
 *   three quarters Pretoria, Dongguan and Macau are deleted again; and at a half
 *   Osaka gives Kobe 24 units and shrinks to 49, and Kyoto then fits at 59 — a
 *   city bigger than the one it was folded into.
 *
 * What it costs, against the file before it (2026-09-21), is two lists. **50
 * towns that were built are not**: most are the restored city's own districts
 * and satellites (Tanggu in Tianjin, Nilüfer in Bursa, Sumaré in Campinas,
 * Hikone hidden by Kyoto); a few are towns in their own right that a restored
 * city now outranks (Hạ Long beside Haiphong, Shimonoseki across the strait
 * from Kitakyushu); and one is a GeoNames artefact — Puyang, a county seat the
 * source gives 3.59 M, fits beside Hangzhou and takes Yiwu. **And 27 cities
 * that were built are smaller**: the 21 hosts that gave ground, and six a
 * restored neighbour now comes before — Hong Kong goes from 138 units to 38
 * beside Shenzhen, and has no road now where it had one, and Wuxi from 115 to
 * 46 beside Suzhou. Where they are big enough to be looked for, what the fit
 * takes and what it still cannot fit are at least names: see
 * `ALIAS_POPULATION`.
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

// `rankOf` and its `CAPITAL_RANK` live in `places.ts` now: the prominence field
// below ranks the same rows, and two copies of the number would be two answers
// to "which of these is bigger". The sweep that chose 100,000 is above.

/**
 * Whether `host`, built at `built` and `units` away, would hide `p` — the
 * question `isShown` asks at the shipped radius, with `shadeOf` for a host
 * built smaller than its population. Only the hosts `p` collides with are
 * asked: they are the neighbours a fit or a share is about.
 */
function hides(host, built, units, p) {
  if (p.capital || units >= PROMINENCE_RADIUS) return false;
  const radius = built === radiusFor(host.pop) ? undefined : built;
  return shadeOf({ pop: host.pop, capital: host.capital, radius }) >= PROMINENCE_RATIO * rankOf(p);
}

/**
 * The radius `p` is kept at among the kept places it collides with, and what
 * each host that gives it ground shrinks to — or null, and it is absorbed. See
 * `FIT_POPULATION`.
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
 * Largest first. Stable across re-bakes like `countries.bin`'s alphabetical
 * order, and useful in a way alphabetical is not: a consumer working to a budget
 * takes a prefix and gets the world's biggest cities rather than its Aachens.
 * `roads.bin` indexes into this array, so the order is part of the contract
 * between the two files and `pnpm check` asserts they agree.
 */
places.sort((a, b) => b.pop - a.pop || a.name.localeCompare(b.name, 'en'));

/** What ships as `Place.radius`: the built radius, only where it is not the law's. */
const storedRadius = (p) => (p.built === radiusFor(p.pop) ? undefined : p.built);

/**
 * **The names the thinning took are kept as aliases of the place that took
 * them**, so the menu's search answers them: every absorbed place of this
 * many people or more, and every absorbed national capital whatever its size
 * — Monaco finds Nice, the Vatican Rome — on the row of the host it overlapped
 * deepest, biggest first. `Places.aliases` points a name whose host is itself
 * hidden at the built town nearest it in the same country. One alias a name —
 * the biggest place that had it — and none that only repeats its host's own
 * name.
 *
 * 100,000 is where a name starts being one somebody types, and it is what the
 * aliases cost that says so. Over this file (2026-09-21), on a `places.bin` of
 * 381 KB gzipped, the capitals counted at every threshold:
 *
 * ```
 *   threshold    aliases   on the wire
 *      50,000      5,281   +31.3 KB
 *     100,000      2,395   +15.3 KB
 *     250,000        754    +5.5 KB
 *   1,000,000        103    +0.8 KB
 * ```
 *
 * At 250,000 Mainz, Halle, Oviedo, Portsmouth, Tsukuba and Scottsdale are not
 * answers, and each is a name a player would type; at 50,000 the list more
 * than doubles for Roubaix, Saint-Denis, Compton and Dearborn — the districts
 * and dormitory towns of the city they were folded into, which is what the
 * thinning is right about — for twice the bytes. They live in `places.bin`
 * rather than beside it because the menu needs them at the front door, which
 * is the first load either way, and a second file indexing this one would be
 * a second freshness contract like `roads.bin`'s.
 */
const ALIAS_POPULATION = 100_000;

/**
 * **A district of its host is not an alias.** `PPLX` is dropped at `parse`,
 * but GeoNames files most of a big city's districts as plain `PPL` or as an
 * admin seat — Ciudad Lineal and Chamartín in Madrid, the arrondissements of
 * Paris, Islington and Westminster in London, Tokyo's special wards, Pudong,
 * Iztapalapa, Brooklyn — and every one of them over 100,000 people passed the
 * threshold. A search that offers Paris 15 Vaugirard offers a street map, and
 * the name goes to the host's own centre anyway, so what it offers is noise.
 * An absorbed place is a district when it is not a national capital and
 * either
 *
 * - **it is in its host's own municipality**: the host's admin codes, down to
 *   the third level or deeper, are all the place's too (Madrid's 28079 is
 *   Ciudad Lineal's; Paris's 75056 is every arrondissement's). The third level
 *   and not the second, because the second is a county in the United States
 *   and a prefecture in China, which hold separate cities (Chandler in
 *   Phoenix's Maricopa, Cixi in Ningbo); or
 * - **it is within `DISTRICT_KM` of its host's point**, which is the inner
 *   city of anything big enough to absorb a place of 100,000: Brooklyn,
 *   Manhattan and Jersey City from New York, Giza from Cairo, Villeurbanne
 *   from Lyon. A separate town that close is a contiguous part of the same
 *   city, and its name still finds only the host.
 *
 * Over this file (2026-10-01) it took the aliases from 2,395 on 771 rows to
 * 1,787 on 622, and left every row of `places.bin` as it was. What is left are the separate towns the thinning folded in, which are names a
 * player types for a town — Yokohama, Móstoles, Reading, Kobe — and the
 * capitals, Vatican City and Monaco among them.
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
 * The prominence field: how far each place is from the nearest place at least
 * `PROMINENCE_RATIO` times its rank, which is what decides whether anything is
 * *built* there. See `PROMINENCE_RADIUS` in `places.ts` for the study; the
 * function is shared with `pnpm check`, which recomputes the field from the
 * shipped rows and asserts it byte for byte. It runs after the sort so the
 * check can replay it over exactly the array the file carries — with the
 * radius as the file carries it, only where it was fitted, because that is
 * what `shadeOf` reads.
 */
const prominenceBegan = Date.now();
const prominence = prominenceField(
  places.map((p) => ({ lat: p.lat, lon: p.lon, pop: p.pop, capital: p.capital, radius: storedRadius(p) })),
  PLANET_RADIUS,
);
const prominenceMs = Date.now() - prominenceBegan;

/**
 * The shipped rows, and then the file, which is binary and gzipped.
 *
 * **The names are the file and everything else was packaging.** As JSON a row
 * spent about seventy characters on five fields; here the coordinates are two
 * three-byte integers at the thousandth of a degree the rounding above already
 * chose, the country is one byte into a 228-entry table, the population is a
 * delta down a list that is already sorted by it, and `capital` and `snappedKm`
 * are index lists rather than a field repeated 23,867 times to say "no". What is
 * left is 23,867 names, which is what this file is *for* and is the one part of
 * it that cannot be made smaller without making it worse.
 *
 * The bake decodes its own output and compares before writing: a coordinate that
 * came back a thousandth of a degree out is a third of a world unit, which would
 * be invisible and would break the one assertion this whole file is arranged
 * around — that every place stands on land.
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

/** The gap distribution is what says whether the world reads as inhabited. */
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

/**
 * The hierarchy, read back the way the world reads it. Mallorca is the island
 * the rule was chosen on and the row to look at after a re-bake: it should say
 * Palma and nothing else.
 */
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

/**
 * What the fit kept, and what gave it room: the rows to read after a re-bake
 * next to the list below. A city fitted small is the compression working; a
 * host that gave up a third of its radius is the cost of it.
 */
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

/**
 * The list to read after a re-bake. A district losing to its own city is the
 * thinning working; a city losing to another city is the 1:400 compression, and
 * it is the only thing here that could ever be a surprise.
 */
const big = absorbed.filter((a) => a.pop >= 1e6).sort((x, y) => y.pop - x.pop);
console.log(`\n${absorbed.length} thinned away, ${big.length} of them over a million; the largest:`);
for (const a of big.slice(0, 12)) {
  console.log(`  ${`${a.name} (${a.pop})`.padEnd(40)} inside ${a.into.name}`);
}

const shape = [...mismatches.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(`\n${shape.reduce((n, [, v]) => n + v.n, 0)} disagree with the source's own country:`);
for (const [k, v] of shape.slice(0, 14)) console.log(`  ${String(v.n).padStart(4)}  ${k}  e.g. ${v.example}`);
if (shape.length > 14) console.log(`  ... and ${shape.length - 14} more pairs`);
