/**
 * Turns the curated landmark list into placed positions the world can use.
 *
 * Two jobs, and both are the kind of thing that is invisible until it is wrong:
 *
 * 1. **Snapping to land.** A coastline this side of a survey is not the real
 *    coastline, so a landmark on a shore, an island or a bridge lands in the
 *    sea: the Statue of Liberty is on an island Natural Earth does not draw at
 *    any published scale, and the Golden Gate spans water by definition.
 *    Placing them at runtime would mean every client redoing the same search,
 *    so it happens once, here.
 * 2. **Checking the country.** Each entry declares the country it should be in.
 *    If the outlines disagree, the coordinate is wrong — that is the only way to
 *    catch a landmark typed a degree off, short of looking at all 85 by hand.
 *
 *   node scripts/build-monuments.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { reliefAt } from '../src/terrain.ts';
import { MAX_FOOTPRINT } from '../src/monuments/contract.ts';

const here = dirname(fileURLToPath(import.meta.url));
const countriesPath = resolve(here, '../public/data/countries.bin');
const outlines = readFileSync(countriesPath);
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// The lakes are a second file and the stub has to know which one is being
// asked for. It used to answer every URL with the outlines, which was fine
// while there was one; handing `decodeLakes` the outlines throws on the magic
// rather than misreading them, which is the whole reason the format carries it.
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

interface Source {
  id: string;
  name: string;
  iso: string;
  lat: number;
  lon: number;
  height?: number;
  year?: number;
}

const source = JSON.parse(
  readFileSync(resolve(here, 'monuments.source.json'), 'utf8'),
) as { monuments: Source[]; notes?: Record<string, string> };

const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const isoOf = (id: number): string => (id > 0 ? world.countries[id - 1]!.iso : '');
const nameOf = (id: number): string => (id > 0 ? world.countries[id - 1]!.name : 'Open ocean');

/** Great-circle distance in kilometres, for reporting only. */
const EARTH_KM = 6371;
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const d = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * d) / 2) ** 2 +
    Math.cos(aLat * d) * Math.cos(bLat * d) * Math.sin(((bLon - aLon) * d) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/**
 * Nearest point that is land, searched outward in rings.
 *
 * Longitude steps are divided by cos(lat) so a ring is round on the ground
 * rather than on the chart; without that, a search near the poles would sweep a
 * band a few kilometres tall and thousands wide.
 */
function snapToLand(lat: number, lon: number, wantIso: string): { lat: number; lon: number } | null {
  const preferred = (id: number): boolean => isoOf(id) === wantIso;
  // Two passes: first insist on the declared country, then accept any land.
  for (const accept of [preferred, (id: number) => id > 0]) {
    for (let radius = 0.02; radius <= 3; radius += 0.02) {
      const steps = Math.max(16, Math.round(radius * 240));
      for (let k = 0; k < steps; k++) {
        const angle = (k / steps) * Math.PI * 2;
        const dLat = radius * Math.sin(angle);
        const dLon = (radius * Math.cos(angle)) / Math.max(0.02, Math.cos(lat * (Math.PI / 180)));
        const y = lat + dLat;
        const x = ((lon + dLon + 540) % 360) - 180;
        if (Math.abs(y) > 90) continue;
        if (accept(world.countryAt(y, x))) return { lat: y, lon: x };
      }
    }
  }
  return null;
}

/**
 * Each monument's declared footprint radius, scanned out of its model file.
 *
 * Read as text rather than imported: the registry uses `import.meta.glob`, which
 * is Vite's and does not exist in Node. A landmark with no model yet gets the
 * largest footprint any tier allows, which is the safe assumption — it reserves
 * the room its model might turn out to need.
 *
 * It leaves here in `monuments.json`, because two things downstream need it and
 * neither can read a `.ts` file: the separation below, whose result is only
 * explicable next to the numbers it used, and `terrain.ts`, which cuts the level
 * pad under each model. Without it every pad was the widest one the contract
 * allows — Big Ben declares 10 and stood in the middle of 150 units of level
 * ground.
 */
const footprints = new Map<string, number>();
for (const file of readdirSync(resolve(here, '../src/monuments'))) {
  if (!file.endsWith('.ts') || file === 'contract.ts' || file === 'index.ts') continue;
  const text = readFileSync(resolve(here, '../src/monuments', file), 'utf8');
  const id = text.match(/\bid\s*:\s*'([^']+)'/)?.[1];
  const footprint = text.match(/\bfootprint\s*:\s*([\d.]+)/)?.[1];
  if (id !== undefined && footprint !== undefined) footprints.set(id, Number(footprint));
}
const footprintOf = (id: string): number => footprints.get(id) ?? MAX_FOOTPRINT;

/** Breathing room between two footprints, in world units. */
const CLEARANCE = 12;

/** One row of `monuments.json`. */
interface Placed {
  id: string;
  name: string;
  iso: string;
  lat: number;
  lon: number;
  footprint: number;
  height?: number;
  year?: number;
  /** The card's sentence, from the source's `notes`. */
  note?: string;
  snappedKm?: number;
  /** Radius of same-shelf ground the seat pass below managed to find. */
  clearance?: number;
}

const placed: Placed[] = [];
const notes: string[] = [];
/**
 * What makes the bake refuse to write. A landmark with no land within three
 * degrees used to be dropped with a note and the file written without it, and
 * one that snapped into the wrong country was written with a `!` beside it:
 * both reached `monuments.json`, and only `pnpm check` said so afterwards.
 */
const refused: string[] = [];

for (const m of source.monuments) {
  const hit = world.countryAt(m.lat, m.lon);
  let lat = m.lat;
  let lon = m.lon;
  let movedKm = 0;

  if (isoOf(hit) !== m.iso) {
    const snapped = snapToLand(m.lat, m.lon, m.iso);
    if (!snapped) {
      refused.push(`${m.id}: no land within 3 degrees`);
      continue;
    }
    lat = snapped.lat;
    lon = snapped.lon;
    movedKm = distanceKm(m.lat, m.lon, lat, lon);
    const landed = world.countryAt(lat, lon);
    const how = hit === 0 ? 'was in the sea' : `was in ${nameOf(hit)}`;
    const ok = isoOf(landed) === m.iso;
    if (!ok) refused.push(`${m.id}: the nearest land is ${nameOf(landed)}, not ${m.iso}`);
    notes.push(`${m.id.padEnd(24)} ${how.padEnd(22)} -> ${nameOf(landed).padEnd(26)} ${movedKm.toFixed(1)} km`);
  }

  placed.push({
    id: m.id,
    name: m.name,
    iso: m.iso,
    lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)),
    footprint: footprintOf(m.id),
    ...(m.height === undefined ? {} : { height: m.height }),
    ...(m.year === undefined ? {} : { year: m.year }),
    ...(source.notes?.[m.id] === undefined ? {} : { note: source.notes[m.id] }),
    ...(movedKm > 0 ? { snappedKm: Number(movedKm.toFixed(1)) } : {}),
  });
}

/**
 * Pushes monuments apart until their footprints stop overlapping.
 *
 * One world unit is 0.4 km here, so the planet is about 1:400 against Earth and
 * anything closer than a few tens of kilometres is, to the geometry, the same
 * point. The Sphinx stands 1.5 units from the Pyramids and Sydney's bridge 1.7
 * from its opera house — their models interpenetrate outright.
 *
 * This is a deliberate distortion and it is the same one every crop in the
 * monument contract makes: the compression that makes a planet walkable also
 * collapses a city into a point, and a landmark you cannot stand in front of
 * without standing inside another one is worse than a landmark a few kilometres
 * from where it really is. Pairs are separated along the great circle between
 * them, both ends moving equally, and each end is re-checked against the
 * outlines so nobody is pushed into the sea.
 *
 * **"Not in the sea" turned out to be the wrong test, and `settlements.ts` had
 * already written down why.** A push away from one obstacle is a push into the
 * next, and it fails silently because the thing you pushed away from is now
 * correctly clear. St Peter's declares the widest footprint the contract allows
 * and the Colosseum is 8.5 units away, so the pair wants 111 units between them
 * and each end walked 22 km: the Colosseum east into the Apennines and **St
 * Peter's west onto the beach at Fiumicino**, where it stood at the waterline
 * with 31 units of its footprint over the Tyrrhenian. It passed every test here
 * because Fiumicino is in Italy. Measured at the source coordinate against the
 * placed one, it was the only monument of the sixty-five that this pass took
 * from fully seated to overhanging — so the guard is that a step may not unseat
 * a monument the seat pass had seated, and the other end takes the whole
 * deficit on the pass after, which is what the twenty-four passes are for.
 */
const DEG = Math.PI / 180;
const toVector = (lat: number, lon: number): number[] => [
  Math.cos(lat * DEG) * Math.cos(lon * DEG),
  Math.sin(lat * DEG),
  -Math.cos(lat * DEG) * Math.sin(lon * DEG),
];
const RADIUS = PLANET_RADIUS;

function separate(): string[] {
  const moved = new Set<string>();
  for (let pass = 0; pass < 24; pass++) {
    let worst = 0;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const want = footprintOf(a.id) + footprintOf(b.id) + CLEARANCE;
        const va = toVector(a.lat, a.lon);
        const vb = toVector(b.lat, b.lon);
        const dot = Math.min(1, Math.max(-1, va[0]! * vb[0]! + va[1]! * vb[1]! + va[2]! * vb[2]!));
        const gap = Math.acos(dot) * RADIUS;
        if (gap >= want) continue;
        worst = Math.max(worst, want - gap);

        // Half the deficit each, along the line joining them. Degenerate when
        // two landmarks share a coordinate exactly, so fall back to due north.
        const step = ((want - gap) / 2 / RADIUS) / DEG;
        let dLat = b.lat - a.lat;
        let dLon = (b.lon - a.lon) * Math.cos(a.lat * DEG);
        const length = Math.hypot(dLat, dLon) || 1;
        if (Math.hypot(dLat, dLon) < 1e-9) { dLat = 1; dLon = 0; }
        const unitLat = dLat / length;
        const unitLon = dLon / length / Math.max(0.02, Math.cos(a.lat * DEG));
        for (const [point, sign] of [[a, -1], [b, 1]] as [typeof a, number][]) {
          const lat = Math.max(-89.99, Math.min(89.99, point.lat + sign * step * unitLat));
          const lon = ((point.lon + sign * step * unitLon + 540) % 360) - 180;
          // Only accept the move if it stays on the country it belongs to.
          if (isoOf(world.countryAt(lat, lon)) !== point.iso) continue;
          // ...and if it does not walk a seated monument back onto the coast.
          // Only a monument that *was* seated is protected: one the coastline
          // never had room for has to stay movable, or a pair on a headland
          // could not be separated at all.
          const foot = footprintOf(point.id);
          if (
            clearance(point.lat, point.lon, foot).radius >= foot &&
            clearance(lat, lon, foot).radius < foot
          ) continue;
          const rounded = [Number(lat.toFixed(4)), Number(lon.toFixed(4))] as const;
          if (rounded[0] === point.lat && rounded[1] === point.lon) continue;
          point.lat = rounded[0];
          point.lon = rounded[1];
          moved.add(point.id);
        }
      }
    }
    if (worst < 0.5) break;
  }
  return [...moved];
}

/**
 * Nudges a monument off the coastline until its whole footprint stands on one
 * shelf, and leaves it alone when it cannot.
 *
 * The land is a shelf `LAND_HEIGHT` above the water with a vertical cliff at
 * its edge, so a footprint that crosses the coast has a 20-unit step under the
 * model and no terrain flattening can help: `terrain.ts` shapes the relief on
 * top of the shelf, and over water there is no shelf and no mesh to shape. The
 * anchor is where `placement.ts` samples the ground once, so the part of the
 * model beyond the coast is left standing on air, three avatars up.
 *
 * `snapToLand` above causes most of it and could not have avoided it: it takes
 * the *first* land it finds, which is by construction a point on the coastline
 * itself — the worst place on the planet to stand a 55-unit model. The rest are
 * landmarks that really are at the water's edge.
 *
 * The move is all-or-nothing, and that is the whole design. A monument is
 * pushed inland only if `SEAT_BUDGET` is enough to seat it completely; a
 * monument that would still overhang after spending the budget is put back
 * where it was, because a distortion that does not buy a fix is pure cost. So
 * the ones that move are the ones the coastline had room for all along, and the
 * ones that stay are the landmarks defined by the water they stand in — the
 * Golden Gate spans a strait, Mont-Saint-Michel is a tidal island, and Easter
 * Island is *narrower* than the moai standing on it, so no distance exists that
 * would seat them.
 *
 * The budget is three avatars, and it was picked by sweeping it. Re-swept
 * 2026-09-09 against the current outlines and landmark list, because the
 * figures on file matched neither any more — 19 overhang at 0, 14 at 12, 13 at
 * 20, 10 at 30, 8 at 55, against 29/23/20/16/10 today. What the tail buys is
 * still not worth what it costs — at 55 the pass moves Mont-Saint-Michel 22 km
 * inland off its own island, and Sydney's harbour bridge, held clear of the
 * opera house through every round of separation, ends 55 km from where it
 * started. At 20 nine monuments move rather than the six on file, up to 8 km:
 * the Space Needle, Tokyo Tower, Himeji, the Burj, the Little Mermaid and
 * Moeraki as before, joined by the Guggenheim, the Avenue of the Baobabs and
 * the CN Tower.
 */
const SEAT_BUDGET = 20;
/** Spacing of the probe rings, and how many bearings each one carries. */
const SEAT_STEP = 4;
const SEAT_BEARINGS = 24;

/**
 * The shelf under a point: its ring's own cliff height, and 0 over water.
 *
 * `elevationAt` is the shelf plus the relief and there is no way to ask it for
 * either half, so the relief is subtracted back off — normalised exactly the
 * way `geo.ts` normalises it, or the two evaluations of the noise differ in
 * their last bits and every point on the planet reports a shelf of its own.
 */
function shelfAt(lat: number, lon: number): number {
  if (world.countryAt(lat, lon) === 0) return 0;
  const [x, y, z] = toVector(lat, lon) as [number, number, number];
  const length = Math.hypot(x, y, z) || 1;
  return world.elevationAt(new Vector3(x, y, z)) - reliefAt(x / length, y / length, z / length);
}

/** A step smaller than this is not a step: an avatar is 6.8 units tall. */
const SEAT_TOLERANCE = 0.5;

/** Steps `distance` units along `bearing` (0 is north) from a coordinate. */
function step(lat: number, lon: number, distance: number, bearing: number): [number, number] {
  const degrees = distance / UNITS_PER_DEGREE;
  const y = Math.max(-89.99, Math.min(89.99, lat + degrees * Math.cos(bearing)));
  const x = ((lon + (degrees * Math.sin(bearing)) / Math.max(0.02, Math.cos(lat * DEG)) + 540) % 360) - 180;
  return [y, x];
}

/**
 * How much level, same-shelf ground surrounds a point, and which way to walk to
 * get more of it. Capped at `limit`, because nothing past the model's own edge
 * is being asked to hold it up.
 *
 * The escape bearing is the sum of the directions *away* from every break in
 * the disc, each weighted by how far inside the footprint it lies, rather than
 * simply away from the nearest one. On a straight coast the two are the same
 * answer; in a bay they are not, and walking away from the nearest break alone
 * walks straight into the other arm of the bay.
 */
function clearance(lat: number, lon: number, limit: number): { radius: number; bearing: number } {
  const shelf = shelfAt(lat, lon);
  let radius = limit;
  let escapeX = 0;
  let escapeY = 0;
  for (let distance = SEAT_STEP; distance <= limit; distance += SEAT_STEP) {
    for (let k = 0; k < SEAT_BEARINGS; k++) {
      const bearing = (k / SEAT_BEARINGS) * Math.PI * 2;
      const [y, x] = step(lat, lon, distance, bearing);
      if (Math.abs(shelfAt(y, x) - shelf) <= SEAT_TOLERANCE) continue;
      radius = Math.min(radius, distance - SEAT_STEP);
      const weight = limit - distance + SEAT_STEP;
      escapeY -= weight * Math.cos(bearing);
      escapeX -= weight * Math.sin(bearing);
    }
  }
  return { radius, bearing: Math.atan2(escapeX, escapeY) };
}

function seatAll(): { id: string; km: number }[] {
  const seated: { id: string; km: number }[] = [];
  for (const point of placed) {
    const footprint = footprintOf(point.id);
    let lat = point.lat;
    let lon = point.lon;
    let spent = 0;
    // Six is generous: each pass walks the whole remaining deficit, so it only
    // takes more than one where the coast curves away under the model.
    for (let pass = 0; pass < 6; pass++) {
      const probe = clearance(lat, lon, footprint);
      if (probe.radius >= footprint) break;
      const push = Math.min(footprint - probe.radius, SEAT_BUDGET - spent);
      if (push <= 0) break;
      const [y, x] = step(lat, lon, push, probe.bearing);
      if (isoOf(world.countryAt(y, x)) !== point.iso) break;
      lat = Number(y.toFixed(4));
      lon = Number(x.toFixed(4));
      spent += push;
    }
    if (spent === 0 || clearance(lat, lon, footprint).radius < footprint) continue;
    const km = distanceKm(point.lat, point.lon, lat, lon);
    point.lat = lat;
    point.lon = lon;
    seated.push({ id: point.id, km });
  }
  return seated;
}

const before = placed.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }));
// Seating and separating pull against each other — a monument nudged inland can
// walk into its neighbour, and a monument pushed off its neighbour can walk back
// to the coast — so they take turns until neither has anything left to say.
//
// **Until neither, not until the seat pass is idle.** The loop used to stop the
// first round seating moved nothing, which is also a round in which separation
// may just have pushed a monument back onto its coast — and `separate` said
// nothing either way, because the list it returned was never filled.
const seatedBy = new Map<string, number>();
for (let round = 0; round < 4; round++) {
  const moved = seatAll();
  const pushed = separate();
  for (const m of moved) seatedBy.set(m.id, (seatedBy.get(m.id) ?? 0) + m.km);
  if (moved.length === 0 && pushed.length === 0) break;
}
const seated = [...seatedBy].map(([id, km]) => ({ id, km }));
const spread = placed
  .map((p, i) => ({ id: p.id, km: distanceKm(before[i]!.lat, before[i]!.lon, p.lat, p.lon) }))
  .filter((p) => p.km > 0.05);

// Recorded rather than recomputed by every reader: `check-world.ts` measures it
// again from the outlines and fails if the two disagree, which is what says the
// coastline or a model's footprint moved and the bake did not.
for (const point of placed) {
  point.clearance = clearance(point.lat, point.lon, footprintOf(point.id)).radius;
}

if (refused.length > 0) {
  throw new Error(`monuments.json not written:\n  ${refused.join('\n  ')}`);
}
writeFileSync(resolve(here, '../public/data/monuments.json'), JSON.stringify({ monuments: placed }, null, 1));

console.log(`${placed.length} of ${source.monuments.length} monuments placed\n`);
if (notes.length) {
  console.log('snapped to land, each into the country it declares:');
  for (const n of notes) console.log('  ' + n);
}
const far = placed.filter((p) => (p.snappedKm ?? 0) > 60);
console.log(`\n${notes.length} needed snapping, ${far.length} moved more than 60 km`);

if (spread.length > 0) {
  console.log(`\nspread apart so their footprints clear (${spread.length} monuments):`);
  for (const s of spread.sort((a, b) => b.km - a.km)) {
    console.log(`  ${s.id.padEnd(24)} ${s.km.toFixed(1)} km`);
  }
}

if (seated.length > 0) {
  console.log(`\nnudged off the coast so the whole footprint stands on one shelf (${seated.length}):`);
  for (const s of seated.sort((a, b) => b.km - a.km)) {
    console.log(`  ${s.id.padEnd(24)} ${s.km.toFixed(1)} km`);
  }
}

// The ones the coastline has no room for, and how much of the model is left
// hanging over the drop. A table rather than a failure: the Golden Gate spans a
// strait and Easter Island is narrower than its own moai, so this number is
// never going to zero — but it is the number that must not quietly grow.
const overhanging = placed
  .filter((p) => (p.clearance ?? 0) < p.footprint)
  .map((p) => ({ id: p.id, short: p.footprint - (p.clearance ?? 0) }))
  .sort((a, b) => b.short - a.short);
console.log(`\nstill standing on the coastline (${overhanging.length}), short of clearance by:`);
for (const o of overhanging) console.log(`  ${o.id.padEnd(24)} ${o.short.toFixed(0)} units`);
