/**
 * Places the curated landmarks (`monuments.source.json`) on the planet and
 * writes `public/data/monuments.json`.
 *
 * Each landmark is snapped onto land in its declared country (a coordinate
 * that lands elsewhere is a typo), pushed clear of its neighbours, moved off
 * the coast until its plan stands on dry ground, and finally either stood in
 * a parcel of its town or walked out of the town altogether. The bake refuses
 * to write if any landmark cannot be placed.
 *
 *   node scripts/build-monuments.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, WORLD_SCALE } from '../src/globe.ts';
import { PAD_MARGIN, SHORE_CLEAR, reliefAt } from '../src/terrain.ts';
import { latLonOf, toUnit, unitAt } from '../src/sphere.ts';
import { MAX_FOOTPRINT, createContext } from '../src/monuments/contract.ts';
import type { Monument } from '../src/monuments/contract.ts';
import { mergeMeshes } from '../src/merge.ts';
import { LANDMARK_KEEP, planGapToBox, planReach, planShape, plannedSite, siteGap } from '../src/landmark-ground.ts';
import type { Plan, PlanShape } from '../src/landmark-ground.ts';
import { PARCEL_KEEP, cellCentre, landmarkParcel, offsetDirection, townFrame, townGrid } from '../src/scenery/grid.ts';
import type { TownGrid } from '../src/scenery/grid.ts';
import { decodePlaces, inflate } from '../src/pack.ts';
import { BIGGEST_SETTLEMENT, isShown, radiusOf } from '../src/places.ts';
import type { Place } from '../src/places.ts';
import { APPROACH, MAX_ROAD_LENGTH, builtGraph, candidateGates, landmarkTakes } from '../src/roads.ts';
import { DEG, SEAT_STEP, distanceKm, innermost, quarters, ringOf, step } from './build-monuments/geometry.ts';
import { printReport } from './build-monuments/report.ts';

const here = dirname(fileURLToPath(import.meta.url));
const countriesPath = resolve(here, '../public/data/countries.bin');
const outlines = readFileSync(countriesPath);
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// `loadWorld` and `loadLakes` fetch their files; serve them from disk.
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
) as { monuments: Source[]; notes?: Record<string, string>; shore?: string[]; plazas?: string[] };
const shoreIds = new Set(source.shore ?? []);
const plazaIds = new Set(source.plazas ?? []);

const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const isoOf = (id: number): string => (id > 0 ? world.countries[id - 1]!.iso : '');
const nameOf = (id: number): string => (id > 0 ? world.countries[id - 1]!.name : 'Open ocean');


/**
 * Nearest land, searched outward in rings that are round on the ground
 * (longitude steps divided by cos(lat)).
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
 * Each monument's footprint radius and plan, measured by building its model.
 * The plan is the box its triangles stand in, in its own north-up frame,
 * rounded out to half a unit; everything downstream (the terrain pad, towns,
 * roads, the seat pass) reads it from `monuments.json`. A landmark with no
 * model yet gets the largest footprint and no plan.
 */
const footprints = new Map<string, number>();
const plans = new Map<string, Plan>();
{
  const ctx = createContext();
  for (const file of readdirSync(resolve(here, '../src/monuments')).sort()) {
    if (!file.endsWith('.ts') || file === 'contract.ts' || file === 'index.ts') continue;
    const module = (await import(`../src/monuments/${file}`)) as Record<string, unknown>;
    const monument = Object.values(module).find(
      (value): value is Monument => typeof (value as Monument | undefined)?.build === 'function' && typeof (value as Monument).id === 'string',
    );
    if (monument === undefined) continue;
    const position = mergeMeshes(monument.build(ctx)).position;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < position.length; i += 3) {
      x0 = Math.min(x0, position[i]!);
      x1 = Math.max(x1, position[i]!);
      z0 = Math.min(z0, position[i + 2]!);
      z1 = Math.max(z1, position[i + 2]!);
    }
    footprints.set(monument.id, monument.footprint);
    plans.set(monument.id, [Math.floor(x0 * 2) / 2, Math.ceil(x1 * 2) / 2, Math.floor(z0 * 2) / 2, Math.ceil(z1 * 2) / 2]);
  }
}
const footprintOf = (id: string): number => footprints.get(id) ?? MAX_FOOTPRINT;
const shapeOf = (id: string): PlanShape => planShape({ footprint: footprintOf(id), plan: plans.get(id) });

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
  /**
   * Same-shelf ground round the plan, in units past its edge, capped at
   * `SHORE_CLEAR`; negative where the plan reaches the water (`shore` only).
   */
  clearance?: number;
  /** The model's plan; see `plans`. */
  plan?: Plan;
  /** Stands in or at the water by what it is; the source's `shore`. */
  shore?: true;
  /** From the source's `plazas`: `plaza` in the country, `parcel` in a block of its town's cells. */
  setting?: 'plaza' | 'parcel';
}

const placed: Placed[] = [];
const notes: string[] = [];
/** Reasons the bake refuses to write. */
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
    ...(plans.has(m.id) ? { plan: plans.get(m.id)! } : {}),
    ...(shoreIds.has(m.id) ? { shore: true as const } : {}),
    ...(plazaIds.has(m.id) ? { setting: 'plaza' as const } : {}),
  });
}

/**
 * Pushes monuments apart until their footprints clear. At this scale nearby
 * landmarks (the Sphinx and the Pyramids) would interpenetrate, so pairs are
 * separated along the great circle between them, both ends moving equally.
 * A step is refused if it leaves the country, unseats a monument that was
 * dry, or puts it on a town it had left standing; the other end then takes
 * the deficit on a later pass.
 */
const toVector = (lat: number, lon: number): number[] => {
  const v = [0, 0, 0];
  toUnit(lat, lon, v);
  return v;
};
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
          // ...and does not walk a seated monument back onto the coast. One
          // that was never seated stays movable, or a pair on a headland could
          // not be separated.
          const need = needOf(point);
          if (dryTo(point.lat, point.lon, point.id, need) && !dryTo(lat, lon, point.id, need)) continue;
          // ...nor onto a town it had left standing.
          if (townTaken(point.id, point.lat, point.lon) === null && townTaken(point.id, lat, lon) !== null) continue;
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
 * Moving landmarks off the coast. `snapToLand` lands on the coastline itself,
 * and at this scale a building near the sea reaches into it, so:
 *
 * - A landmark on dry land is walked out in rings until its plan grown by
 *   `DRY_MARGIN` (the terrain pad) stands on the shelf its centre stands on,
 *   in its country, clear of other landmarks and of town gates, and a little
 *   further (`SHORE_DETOUR`) for room to meet the shore as a slope. If no spot
 *   within `SEAT_REACH` has the whole margin it takes the best it finds; if
 *   none keeps even the plan dry the bake refuses.
 * - A `shore` landmark (a bridge, a tidal island, a mosque over the sea) is
 *   moved only if `SEAT_BUDGET` units seats its plan outright, since no
 *   distance would seat it without walking it off what it is.
 *
 * The plan, not the footprint disc, is what must be dry: the disc of a long,
 * narrow model holds water the model never reaches.
 */
/** How far a `shore` landmark may move to be seated, in units; chosen by sweeping. */
const SEAT_BUDGET = 20;
/** The furthest the seat pass walks a landmark on dry land, in units: 160 nominal, 64 km. */
const SEAT_REACH = 160 * WORLD_SCALE;
/** Dry ground needed past the plan: `PAD_MARGIN`, so the level pad is on land to its rim. */
const DRY_MARGIN = PAD_MARGIN;
/**
 * How much further than the nearest seating spot a landmark that must move
 * anyway may go for `SHORE_CLEAR` of dry ground, in units (13 km), so its
 * pad meets the coast as a slope rather than a bank.
 */
const SHORE_DETOUR = 32;

/** What a landmark has to have past its plan: a shore landmark only its plan. */
const needOf = (point: Placed): number => (shoreIds.has(point.id) ? 0 : DRY_MARGIN);

const frameUp = new Vector3();
const frameAcross = new Vector3();
const frameNorth = new Vector3();
const probe = new Vector3();
const seam = { lat: 0, lon: 0 };

/**
 * The shelf under a point: its ring's cliff height, 0 over water. This is
 * `elevationAt` minus the relief, normalised exactly as `geo.ts` does so the
 * two noise evaluations agree to the last bit.
 */
function shelfAtPoint(point: Vector3): number {
  // The rings are cut along the antimeridian, which belongs to neither side,
  // so a probe exactly on it is nudged off.
  const { lat, lon } = latLonOf(point, seam);
  if (Math.abs(lon) === 180) unitAt(lat, 179.9999999, point);
  if (world.countryAtPoint(point) === 0) return 0;
  const length = point.length() || 1;
  return world.elevationAt(point) - reliefAt(point.x / length, point.y / length, point.z / length);
}

function shelfAt(lat: number, lon: number): number {
  unitAt(lat, lon, probe);
  return shelfAtPoint(probe);
}

/** Shelf differences under this many units count as the same shelf. */
const SEAT_TOLERANCE = 0.5;

/** Whether every point of the ring at `d` stands on `shelf`. */
function ringDry(lat: number, lon: number, shape: PlanShape, d: number, shelf: number): boolean {
  unitAt(lat, lon, frameUp);
  townFrame(frameUp, frameAcross, frameNorth);
  for (const [x, z] of ringOf(shape, d)) {
    offsetDirection(frameUp, frameAcross, frameNorth, x, z, probe);
    if (Math.abs(shelfAtPoint(probe) - shelf) > SEAT_TOLERANCE) return false;
  }
  return true;
}

/**
 * Same-shelf ground round a landmark's plan, in units past its edge, capped at
 * `limit`; negative where the plan itself is not on one shelf.
 */
function clearance(lat: number, lon: number, id: string, limit: number): number {
  const shape = shapeOf(id);
  const shelf = shelfAt(lat, lon);
  for (let d = innermost(shape); d <= limit; d += SEAT_STEP) {
    if (!ringDry(lat, lon, shape, d, shelf)) return d - SEAT_STEP;
  }
  return limit;
}

/**
 * Whether the plan grown by `need` stands on one shelf. Tests the outermost
 * ring first, where any water would be, so coastal spots fail fast.
 */
function dryTo(lat: number, lon: number, id: string, need: number): boolean {
  const shape = shapeOf(id);
  const shelf = shelfAt(lat, lon);
  for (let d = need; d >= innermost(shape); d -= SEAT_STEP) {
    if (!ringDry(lat, lon, shape, d, shelf)) return false;
  }
  return true;
}

/** Whether a spot keeps a landmark's footprint clear of every other one's. */
function clearOfOthers(point: Placed, lat: number, lon: number): boolean {
  unitAt(lat, lon, probe);
  for (const other of placed) {
    if (other === point) continue;
    const want = footprintOf(point.id) + footprintOf(other.id) + CLEARANCE;
    unitAt(other.lat, other.lon, frameUp);
    if (probe.angleTo(frameUp) * RADIUS < want) return false;
  }
  return true;
}

/**
 * The nearest spot that seats a landmark, searched in rings outward; among
 * candidates, the one with the most dry ground round it. Null if none within
 * `reach`.
 */
function seatNear(point: Placed, need: number, reach: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestRoom = -Infinity;
  let until = reach;
  for (let distance = SEAT_STEP; distance <= until; distance += SEAT_STEP) {
    const bearings = Math.max(24, Math.ceil((2 * Math.PI * distance) / SEAT_STEP));
    for (let k = 0; k < bearings; k++) {
      const [y, x] = step(point.lat, point.lon, distance, (k / bearings) * Math.PI * 2);
      const lat = Number(y.toFixed(4));
      const lon = Number(x.toFixed(4));
      if (isoOf(world.countryAt(lat, lon)) !== point.iso) continue;
      if (!clearOfOthers(point, lat, lon)) continue;
      if (!dryTo(lat, lon, point.id, need)) continue;
      if (townTaken(point.id, lat, lon) !== null) continue;
      const room = clearance(lat, lon, point.id, Math.max(need, SHORE_CLEAR));
      if (room > bestRoom) {
        bestRoom = room;
        best = [lat, lon];
      }
    }
    // Once seated, search a little further for room to meet the shore as a slope.
    if (best !== null) until = Math.min(until, distance + SHORE_DETOUR);
    if (bestRoom >= Math.max(need, SHORE_CLEAR)) break;
  }
  return best;
}

/**
 * Built towns, for `townTaken`: a landmark may not take more than half a
 * town's gates (`landmarkTakes`, the road bake's own test), nor every gate the
 * town's roads would use; one that would is moved beside the town instead.
 * Standing in the middle of a town with its gates free is fine.
 */
const allPlaces = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
const builtTowns = allPlaces.filter(isShown);
const townUnit = builtTowns.map((place) => unitAt(place.lat, place.lon, new Vector3()));
const takenAt = new Vector3();
/**
 * The gates each town's roads would use with no landmark in the way
 * (`candidateGates` over the road bake's candidate graph). A landmark may take
 * some of them, and the road bake reroutes, but not all.
 */
const wantedGates = new Map<Place, Set<number>>();
/** Every pair of built towns the road bake will try to join. */
const candidateRoads = builtGraph(allPlaces, 'gabriel', MAX_ROAD_LENGTH);
{
  const candidates = candidateRoads;
  const given = candidateGates(allPlaces, candidates, world);
  candidates.forEach((edge, i) => {
    for (const [end, gate] of [[edge.a, given[i * 2]!], [edge.b, given[i * 2 + 1]!]] as const) {
      if (gate < 0) continue;
      const place = allPlaces[end]!;
      const set = wantedGates.get(place) ?? new Set<number>();
      set.add(gate);
      wantedGates.set(place, set);
    }
  });
}

function townTaken(id: string, lat: number, lon: number): string | null {
  const shape = shapeOf(id);
  unitAt(lat, lon, takenAt);
  const near = Math.cos((BIGGEST_SETTLEMENT * Math.SQRT2 + planReach(shape) + APPROACH + LANDMARK_KEEP) / RADIUS);
  for (let i = 0; i < builtTowns.length; i++) {
    if (townUnit[i]!.dot(takenAt) < near) continue;
    const place = builtTowns[i]!;
    const reach = radiusOf(place) + planReach(shape) + APPROACH + LANDMARK_KEEP;
    if (townUnit[i]!.angleTo(takenAt) * RADIUS > reach) continue;
    const taken = landmarkTakes(place, takenAt, shape);
    if (taken.gates.length * 2 > taken.of) return place.name;
    const wanted = wantedGates.get(place);
    if (wanted !== undefined && [...wanted].every((gate) => taken.gates.includes(gate))) return place.name;
  }
  return null;
}

/** Whether a landmark at a spot is dry enough and takes no town. */
function standsWell(point: Placed, lat: number, lon: number, need: number): boolean {
  return dryTo(lat, lon, point.id, need) && townTaken(point.id, lat, lon) === null;
}

function seatAll(): { id: string; km: number }[] {
  const seated: { id: string; km: number }[] = [];
  for (const point of placed) {
    const shore = shoreIds.has(point.id);
    // A shore landmark moved off a town may not end up with more water under it.
    const now = shore ? Math.min(0, clearance(point.lat, point.lon, point.id, 0)) : 0;
    const need = shore ? now : needOf(point);
    if (standsWell(point, point.lat, point.lon, need)) continue;
    let spot = shore ? seatNear(point, 0, SEAT_BUDGET) : null;
    for (let less = shore ? now : need; spot === null && less >= (shore ? now : 0); less -= SEAT_STEP) {
      // Accept a smaller margin rather than walking far for the last few units;
      // the plan itself must always be dry off the shore.
      if (less < need && standsWell(point, point.lat, point.lon, less)) break;
      if (shore && townTaken(point.id, point.lat, point.lon) === null) break;
      spot = seatNear(point, less, SEAT_REACH);
    }
    if (spot === null) continue;
    const km = distanceKm(point.lat, point.lon, spot[0], spot[1]);
    point.lat = spot[0];
    point.lon = spot[1];
    seated.push({ id: point.id, km });
  }
  return seated;
}

const before = placed.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }));
// Seating and separating can undo each other, so alternate until neither moves anything.
const seatedBy = new Map<string, number>();
for (let round = 0; round < 4; round++) {
  const moved = seatAll();
  const pushed = separate();
  for (const m of moved) seatedBy.set(m.id, (seatedBy.get(m.id) ?? 0) + m.km);
  if (moved.length === 0 && pushed.length === 0) break;
}
const seated = [...seatedBy].map(([id, km]) => ({ id, km }));

/**
 * A landmark is either in a parcel of its town or out of it, never half in:
 *
 * - A `plazas` landmark that fits one quarter of its town (between the main
 *   streets and the edge) is stood in the middle of a block of the town's
 *   cells (`landmarkParcel` in `scenery/grid.ts`, which the town and the road
 *   bake also read); its `setting` becomes `parcel`.
 * - Any other landmark reaching a town is walked out until its plan is
 *   `OUTSIDE_GAP` clear of the square.
 * - A `shore` landmark is walked out only to a spot with at least as much
 *   water under its plan (`shoreOutsideNear`).
 */
const OUTSIDE_GAP = 10;
/** How far a landmark may be walked out of a town, in world units (400 nominal, as a town's size), before it is left where it was. */
const OUTSIDE_REACH = 400 * WORLD_SCALE;

/** The built towns near a spot: the square of each, in its own frame, and the landmark's point in it. */
interface Host {
  place: Place;
  grid: TownGrid;
  up: Vector3;
  across: Vector3;
  north: Vector3;
  /** The landmark's point in the town's frame. */
  x: number;
  z: number;
  /** How far the plan is outside the square, 0 or less where it reaches in. */
  gap: number;
}

function hostsNear(id: string, lat: number, lon: number, within: number): Host[] {
  const shape = shapeOf(id);
  unitAt(lat, lon, takenAt);
  const near = Math.cos((BIGGEST_SETTLEMENT + planReach(shape) + within) / RADIUS);
  const out: Host[] = [];
  for (let i = 0; i < builtTowns.length; i++) {
    const up = townUnit[i]!;
    if (up.dot(takenAt) < near) continue;
    const place = builtTowns[i]!;
    const grid = townGrid(radiusOf(place));
    const across = new Vector3();
    const north = new Vector3();
    townFrame(up, across, north);
    const x = takenAt.dot(across) * RADIUS;
    const z = takenAt.dot(north) * RADIUS;
    const gap = planGapToBox(shape, -grid.half - x, grid.half - x, -grid.half - z, grid.half - z);
    if (gap < within) out.push({ place, grid, up, across, north, x, z, gap });
  }
  return out;
}

/** Whether a spot is somewhere a landmark may stand at all: its country, dry, clear of the others, taking no town. */
function standsAt(point: Placed, lat: number, lon: number, need: number): boolean {
  return isoOf(world.countryAt(lat, lon)) === point.iso
    && clearOfOthers(point, lat, lon)
    && dryTo(lat, lon, point.id, need)
    && townTaken(point.id, lat, lon) === null;
}

/** The parcels of a town a landmark fits, nearest `(lat, lon)` first, as spots. */
function parcelSpots(point: Placed, host: Host, lat: number, lon: number): [number, number][] {
  const shape = shapeOf(point.id);
  const grid = host.grid;
  const span = (half: number): number => Math.ceil((2 * half + 2 * PARCEL_KEEP) / grid.pitch - 1e-9);
  const w = span(shape.hx);
  const h = span(shape.hz);
  const spots: { lat: number; lon: number; d: number }[] = [];
  const at = new Vector3();
  const here = unitAt(lat, lon, new Vector3());
  for (const [a0, a1] of quarters(grid)) {
    for (const [b0, b1] of quarters(grid)) {
      for (let c0 = a0; c0 + w - 1 <= a1; c0++) {
        for (let r0 = b0; r0 + h - 1 <= b1; r0++) {
          const c1 = c0 + w - 1;
          const r1 = r0 + h - 1;
          const x = (cellCentre(grid, c0) + cellCentre(grid, c1)) / 2 - shape.cx;
          const z = (cellCentre(grid, r0) + cellCentre(grid, r1)) / 2 - shape.cz;
          const parcel = landmarkParcel(grid, x, z, shape);
          if (parcel === null || parcel.c0 !== c0 || parcel.c1 !== c1 || parcel.r0 !== r0 || parcel.r1 !== r1) continue;
          offsetDirection(host.up, host.across, host.north, x, z, at);
          const spot = latLonOf(at);
          spots.push({ lat: Number(spot.lat.toFixed(4)), lon: Number(spot.lon.toFixed(4)), d: at.angleTo(here) });
        }
      }
    }
  }
  return spots.sort((p, q) => p.d - q.d).map((s) => [s.lat, s.lon]);
}

/** Whether a spot leaves every town's square `OUTSIDE_GAP` clear of the plan. */
function outOfTowns(id: string, lat: number, lon: number): boolean {
  return hostsNear(id, lat, lon, OUTSIDE_GAP).length === 0;
}

/**
 * The nearest spot out of every town where the landmark may stand, preferring
 * one out of every road's way (`inTheWay`) within `WAY_DETOUR` further.
 */
const WAY_DETOUR = 40;
function outsideNear(point: Placed, need: number): [number, number] | null {
  let fallback: [number, number] | null = null;
  let until = OUTSIDE_REACH;
  for (let distance = SEAT_STEP; distance <= until; distance += SEAT_STEP) {
    const bearings = Math.max(24, Math.ceil((2 * Math.PI * distance) / SEAT_STEP));
    for (let k = 0; k < bearings; k++) {
      const [y, x] = step(point.lat, point.lon, distance, (k / bearings) * Math.PI * 2);
      const lat = Number(y.toFixed(4));
      const lon = Number(x.toFixed(4));
      if (!outOfTowns(point.id, lat, lon)) continue;
      if (!standsAt(point, lat, lon, need)) continue;
      if (fallback === null) {
        fallback = [lat, lon];
        until = Math.min(until, distance + WAY_DETOUR);
      }
      if (!inTheWay(point.id, lat, lon)) return [lat, lon];
    }
  }
  return fallback;
}

const parcelled: { id: string; town: string; km: number }[] = [];
const walkedOut: { id: string; town: string; km: number }[] = [];
const leftIn: string[] = [];
/** The nearest spot out of every town for a `shore` landmark that keeps at least its current water. */
function shoreOutsideNear(point: Placed): [number, number] | null {
  const wet = Math.min(0, clearance(point.lat, point.lon, point.id, 0));
  if (wet >= 0) return null;
  for (let distance = SEAT_STEP; distance <= OUTSIDE_REACH; distance += SEAT_STEP) {
    const bearings = Math.max(24, Math.ceil((2 * Math.PI * distance) / SEAT_STEP));
    for (let k = 0; k < bearings; k++) {
      const [y, x] = step(point.lat, point.lon, distance, (k / bearings) * Math.PI * 2);
      const lat = Number(y.toFixed(4));
      const lon = Number(x.toFixed(4));
      if (isoOf(world.countryAt(lat, lon)) !== point.iso) continue;
      if (!outOfTowns(point.id, lat, lon)) continue;
      if (!clearOfOthers(point, lat, lon) || townTaken(point.id, lat, lon) !== null) continue;
      if (clearance(lat, lon, point.id, 0) > wet) continue;
      return [lat, lon];
    }
  }
  return null;
}

/**
 * Whether a spot is in the way of a road the road bake will try to build: the
 * chord between two joined towns passes within `ROAD_ROOM` of the plan (a
 * carriageway's clearance plus `LANDMARK_KEEP`, with a little to spare).
 */
const ROAD_ROOM = 16;
const chordA = new Vector3();
const chordB = new Vector3();
function inTheWay(id: string, lat: number, lon: number): boolean {
  const site = plannedSite({ lat, lon, footprint: footprintOf(id), plan: plans.get(id) });
  const reach = (site.reach + ROAD_ROOM) / RADIUS;
  const sample = new Vector3();
  for (const edge of candidateRoads) {
    unitAt(allPlaces[edge.a]!.lat, allPlaces[edge.a]!.lon, chordA);
    if (chordA.dot(site.up as Vector3) < Math.cos(edge.length / RADIUS + reach)) continue;
    unitAt(allPlaces[edge.b]!.lat, allPlaces[edge.b]!.lon, chordB);
    // Sample the chord every few units; over this length it is the great circle.
    const steps = Math.ceil(edge.length / 4);
    for (let k = 0; k <= steps; k++) {
      sample.copy(chordA).lerp(chordB, k / steps).normalize();
      if (sample.dot(site.up as Vector3) < Math.cos(reach)) continue;
      if (siteGap(site, sample, RADIUS) < ROAD_ROOM) return true;
    }
  }
  return false;
}

for (const point of placed) {
  if (shoreIds.has(point.id)) {
    const hosts = hostsNear(point.id, point.lat, point.lon, OUTSIDE_GAP);
    if (hosts.length === 0) continue;
    const spot = shoreOutsideNear(point);
    const town = hosts.map((host) => host.place.name).join(', ');
    if (spot === null) {
      leftIn.push(`${point.id} (${town})`);
      continue;
    }
    walkedOut.push({ id: point.id, town, km: distanceKm(point.lat, point.lon, spot[0], spot[1]) });
    point.lat = spot[0];
    point.lon = spot[1];
    continue;
  }
  const hosts = hostsNear(point.id, point.lat, point.lon, OUTSIDE_GAP);
  if (hosts.length === 0) continue;
  const was = { lat: point.lat, lon: point.lon };
  const town = hosts.map((host) => host.place.name).join(', ');
  // Keep the margin if it already has it; otherwise stand no worse than now.
  const need = dryTo(point.lat, point.lon, point.id, needOf(point)) ? needOf(point) : 0;
  let done = false;
  if (point.setting === 'plaza' && hosts.length === 1) {
    for (const [lat, lon] of parcelSpots(point, hosts[0]!, point.lat, point.lon)) {
      // In this town's parcel and no other's.
      if (hostsNear(point.id, lat, lon, OUTSIDE_GAP).length !== 1) continue;
      // Inside a town only the parcel has to be dry, not the pad's whole margin.
      if (!standsAt(point, lat, lon, Math.min(need, PARCEL_KEEP))) continue;
      point.lat = lat;
      point.lon = lon;
      point.setting = 'parcel';
      parcelled.push({ id: point.id, town, km: distanceKm(was.lat, was.lon, lat, lon) });
      done = true;
      break;
    }
  }
  if (done) continue;
  const spot = outsideNear(point, need);
  if (spot === null) {
    leftIn.push(`${point.id} (${town})`);
    continue;
  }
  point.lat = spot[0];
  point.lon = spot[1];
  walkedOut.push({ id: point.id, town, km: distanceKm(was.lat, was.lon, spot[0], spot[1]) });
}
const spread = placed
  .map((p, i) => ({ id: p.id, km: distanceKm(before[i]!.lat, before[i]!.lon, p.lat, p.lon) }))
  .filter((p) => p.km > 0.05);

// Recorded so `check-world.ts` can recompute it and catch a stale bake.
for (const point of placed) {
  point.clearance = clearance(point.lat, point.lon, point.id, SHORE_CLEAR);
}
for (const point of placed) {
  if (shoreIds.has(point.id) || point.clearance! >= 0) continue;
  refused.push(`${point.id}: no spot within ${SEAT_REACH} units stands its plan on land; list it as shore or move its source`);
}
for (const id of [...shoreIds, ...plazaIds]) {
  if (!placed.some((point) => point.id === id)) refused.push(`${id}: listed in the source's shore or plazas and not a landmark`);
}

if (refused.length > 0) {
  throw new Error(`monuments.json not written:\n  ${refused.join('\n  ')}`);
}
writeFileSync(resolve(here, '../public/data/monuments.json'), JSON.stringify({ monuments: placed }, null, 1));

printReport({
  placed,
  total: source.monuments.length,
  notes,
  spread,
  parcelled,
  walkedOut,
  leftIn,
  outsideReach: OUTSIDE_REACH,
  seated,
});
