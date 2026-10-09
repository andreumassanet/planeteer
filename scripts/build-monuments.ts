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
) as { monuments: Source[]; notes?: Record<string, string>; shore?: string[]; plazas?: string[] };
const shoreIds = new Set(source.shore ?? []);
const plazaIds = new Set(source.plazas ?? []);

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
 * Each monument's footprint radius and its **plan**, off its own model.
 *
 * The footprint used to be scanned out of the model file as text, because the
 * registry's `import.meta.glob` is Vite's; the model files themselves import
 * nothing Node cannot load (`pnpm solids` builds all of them headless), so
 * each is imported and built here, once, and measured. A landmark with no
 * model yet gets the largest footprint any tier allows and no plan, which is
 * the safe assumption — it reserves the room its model might turn out to need.
 *
 * The plan is the box the model's own triangles stand in, in its own north-up
 * frame (`landmark-ground.ts`), rounded out to half a unit. It leaves here in
 * `monuments.json`, because everything downstream that asks what ground a
 * landmark takes needs it and none of it can build a model: `terrain.ts` cuts
 * the level pad to it, the towns leave it unbuilt, the roads keep off it and
 * the seat pass below keeps it dry. The footprint still rides beside it for
 * the separation, whose result is only explicable next to the numbers it used.
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
   * How much same-shelf ground the seat pass below found round the plan, in
   * units past its edge and capped at `SHORE_CLEAR`: negative where the plan
   * itself reaches the water, which only a `shore` landmark may.
   */
  clearance?: number;
  /** The model's plan; see `plans`. */
  plan?: Plan;
  /** Stands in or at the water by what it is; the source's `shore`. */
  shore?: true;
  /**
   * Stands in a paved square of its own, the source's `plazas`: `plaza` out
   * in the country, `parcel` in a block of its town's own cells.
   */
  setting?: 'plaza' | 'parcel';
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
    ...(plans.has(m.id) ? { plan: plans.get(m.id)! } : {}),
    ...(shoreIds.has(m.id) ? { shore: true as const } : {}),
    ...(plazaIds.has(m.id) ? { setting: 'plaza' as const } : {}),
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
          // ...and if it does not walk a seated monument back onto the coast.
          // Only a monument that *was* seated is protected: one the coastline
          // never had room for has to stay movable, or a pair on a headland
          // could not be separated at all.
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
 * Moves a monument off the coastline until its plan and a margin stand on one
 * shelf — and, for a landmark defined by the water it stands in, only as far
 * as a short move will seat it.
 *
 * `snapToLand` above causes most of it and could not have avoided it: it takes
 * the *first* land it finds, which is by construction a point on the coastline
 * itself — the worst place on the planet to stand a 55-unit model. The rest are
 * landmarks that really are at the water's edge, and at 1:400 a building a
 * kilometre from the sea is a building whose model reaches into it: the
 * Sagrada Familia stood 30 units of its 38 over the Mediterranean.
 *
 * **Two rules, and the source says which a landmark gets.**
 *
 * - **Every landmark on dry land is seated, however far that takes.** Its plan
 *   grown by `DRY_MARGIN` — the level pad `terrain.ts` cuts under it — has to
 *   stand on the shelf its centre stands on, so neither the model nor the
 *   ground levelled for it reaches the water. The search walks rings out from
 *   where the landmark stands, a few units at a time, to the first that holds
 *   a spot in its own country, clear of every other landmark's footprint and
 *   of every town's gates (`townTaken`), that seats it — and on a little
 *   further (`SHORE_DETOUR`) for one with room to meet the shore as a slope.
 *   Where no spot within `SEAT_REACH` has the whole margin it takes the most
 *   of it one has; where none has the plan itself dry the bake refuses,
 *   because a landmark that has to overhang the water is one to list as
 *   `shore`, not one to leave overhanging.
 * - **A `shore` landmark keeps the old all-or-nothing budget**: it is moved
 *   only if `SEAT_BUDGET` seats its plan outright, and left where it is
 *   otherwise. The Golden Gate spans a strait, Mont-Saint-Michel is a tidal
 *   island, the Hassan II Mosque is built out over the Atlantic and Easter
 *   Island is *narrower* than the moai standing on it: no distance exists that
 *   would seat them, and every distance that tried walked them off what they
 *   are. The budget is 20 units — three avatars when it was picked, while a
 *   person was 6.8 units — and it was picked by sweeping it (2026-09-09, over
 *   the circle the footprint used to be measured on): 19 overhung at 0, 14 at
 *   12, 13 at 20, 10 at 30 and 8 at 55, and what the tail buys was not worth
 *   what it cost — at 55 Mont-Saint-Michel walked 22 km inland off its island.
 *
 * **The plan and not the footprint's disc is what has to be dry.** The disc is
 * the furthest vertex in any direction, and for a model longer than it is deep
 * it holds a crescent of water the model never reaches: the Brandenburg Gate
 * is 86 units by 20.
 */
const SEAT_BUDGET = 20;
/**
 * The furthest the seat pass walks a landmark on dry land, in world units: 64
 * km. On the bake of 2026-09-25 the furthest any walked, from where the snap
 * and the separation had put it, was Table Mountain's 51 km, off the Cape
 * peninsula; the table this writes lists them all.
 */
const SEAT_REACH = 160;
/** Spacing of the probe rings, both round the plan and out from the landmark. */
const SEAT_STEP = 4;
/**
 * Dry ground past the plan a landmark on dry land has to have, in world units:
 * `PAD_MARGIN`, so the level pad under it is on land to its rim. `clearance`
 * is measured further, to `SHORE_CLEAR`, which is what `SHORE_DETOUR` buys.
 */
const DRY_MARGIN = PAD_MARGIN;
/**
 * How much further than the nearest spot that seats it a landmark that has to
 * move anyway may go for `SHORE_CLEAR` of dry ground, in world units: 13 km.
 * Its pad then meets the coast as the shore ramp does rather than as a bank.
 * A landmark that stands where it may is not moved for it.
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
 * The shelf under a point: its ring's own cliff height, and 0 over water.
 *
 * `elevationAt` is the shelf plus the relief and there is no way to ask it for
 * either half, so the relief is subtracted back off — normalised exactly the
 * way `geo.ts` normalises it, or the two evaluations of the noise differ in
 * their last bits and every point on the planet reports a shelf of its own.
 */
function shelfAtPoint(point: Vector3): number {
  // A probe exactly on the antimeridian is asked a hair east of it: the rings
  // are cut along it, and the seam itself belongs to neither side — which the
  // South Pole's rings, every one of them crossing it, found.
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

/**
 * A step smaller than this is not a step. Chosen while a person was 6.8 units
 * tall; a person is 3.77 since 2026-09-24, and a stair's riser 0.32.
 */
const SEAT_TOLERANCE = 0.5;

/** Steps `distance` units along `bearing` (0 is north) from a coordinate. */
function step(lat: number, lon: number, distance: number, bearing: number): [number, number] {
  const degrees = distance / UNITS_PER_DEGREE;
  const y = Math.max(-89.99, Math.min(89.99, lat + degrees * Math.cos(bearing)));
  const x = ((lon + (degrees * Math.sin(bearing)) / Math.max(0.02, Math.cos(lat * DEG)) + 540) % 360) - 180;
  return [y, x];
}

/**
 * The points of the plan grown by `d` — shrunk, for a negative `d` — at most
 * `SEAT_STEP` apart along its outline, in the landmark's frame. The plan is
 * the box and the disc together (`PlanShape`), so the outline is the part of
 * each one's that lies inside the other. The ring of the smallest `d` the pass
 * asks is the plan's own spine, so the rings from there out cover all of it.
 */
function ringOf(shape: PlanShape, d: number): [number, number][] {
  const inside = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) > shape.radius + d + 1e-6) return false;
    if (d >= 0) {
      return Math.hypot(Math.max(Math.abs(x - shape.cx) - shape.hx, 0), Math.max(Math.abs(z - shape.cz) - shape.hz, 0)) <= d + 1e-6;
    }
    return Math.abs(x - shape.cx) <= shape.hx + d + 1e-6 && Math.abs(z - shape.cz) <= shape.hz + d + 1e-6;
  };
  const points: [number, number][] = [];
  const keep = (x: number, z: number): void => {
    if (inside(x, z)) points.push([x, z]);
  };
  // The disc's outline.
  const around = Math.max(0, shape.radius + d);
  const n = Math.max(24, Math.ceil((2 * Math.PI * around) / SEAT_STEP));
  for (let k = 0; k < n; k++) keep(Math.cos((k / n) * Math.PI * 2) * around, Math.sin((k / n) * Math.PI * 2) * around);
  // The box's: four sides pushed out by `bend` and a quarter arc round each corner.
  if (Number.isFinite(shape.hx)) {
    const hx = Math.max(0, shape.hx + Math.min(d, 0));
    const hz = Math.max(0, shape.hz + Math.min(d, 0));
    const bend = Math.max(0, d);
    const edge = (x0: number, z0: number, x1: number, z1: number): void => {
      const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / SEAT_STEP));
      for (let i = 0; i < count; i++) keep(x0 + ((x1 - x0) * i) / count, z0 + ((z1 - z0) * i) / count);
    };
    edge(shape.cx + hx + bend, shape.cz - hz, shape.cx + hx + bend, shape.cz + hz);
    edge(shape.cx + hx, shape.cz + hz + bend, shape.cx - hx, shape.cz + hz + bend);
    edge(shape.cx - hx - bend, shape.cz + hz, shape.cx - hx - bend, shape.cz - hz);
    edge(shape.cx - hx, shape.cz - hz - bend, shape.cx + hx, shape.cz - hz - bend);
    if (bend > 0) {
      const arc = Math.max(2, Math.ceil((bend * Math.PI) / 2 / SEAT_STEP));
      for (const [sx, sz, from] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]] as const) {
        for (let i = 1; i < arc; i++) {
          const angle = from + ((Math.PI / 2) * i) / arc;
          keep(shape.cx + sx * hx + Math.cos(angle) * bend, shape.cz + sz * hz + Math.sin(angle) * bend);
        }
      }
    }
  }
  return points;
}

/** The offset the rings start from: the plan's own spine, a whole number of steps in. */
function innermost(shape: PlanShape): number {
  return -Math.floor(Math.min(shape.radius, shape.hx, shape.hz) / SEAT_STEP) * SEAT_STEP;
}

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
 * How much same-shelf ground surrounds a landmark's plan, in units past its
 * edge and capped at `limit`: the last ring out from the plan's spine that
 * stood wholly on the centre's shelf. Negative where the plan itself does not.
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
 * Whether the plan grown by `need` stands on one shelf. The outermost ring
 * first, because that is where the water is when there is any, so a spot on
 * the coast is refused on its first ring rather than its tenth.
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
 * The nearest spot that seats a landmark: rings out from where it stands, and
 * on the first ring that has any, the one with the most dry ground round it.
 * Null where none within `reach` does.
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
    // The first ring that seats it says how far it has to go; a little further
    // may buy the room its pad needs to meet the shore as a slope.
    if (best !== null) until = Math.min(until, distance + SHORE_DETOUR);
    if (bestRoom >= Math.max(need, SHORE_CLEAR)) break;
  }
  return best;
}

/**
 * The built towns, and the one a landmark standing at a spot would take the
 * middle or most of the gates of — or null.
 *
 * **A landmark stood wherever its coordinate said, and a town smaller than it
 * was its square**: Granada's whole square was the Alhambra's, Bilbao's the
 * Guggenheim's, Djenné's its mosque's, and the roads arrived at gates inside
 * the model. The road bake shuts a gate a landmark stands on
 * (`gateUnderLandmark`), which ends the roads in the walls and, where the
 * landmark held every gate, leaves the town with no road at all. So a landmark
 * may not take more than half a town's gates (`landmarkTakes`, the road bake's
 * own test), and one that would is moved to the nearest spot that leaves the
 * town the rest: beside its town, the way the Alhambra stands over Granada,
 * rather than on top of it. **Its middle is not asked about**: the Forbidden
 * City in the middle of Beijing, with every gate of the city free, is the
 * town wrapping round its landmark, and it is right.
 */
const allPlaces = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
const builtTowns = allPlaces.filter(isShown);
const townUnit = builtTowns.map((place) => unitAt(place.lat, place.lon, new Vector3()));
const takenAt = new Vector3();
/**
 * The gates each town's roads would come in by with no landmark in the way:
 * `candidateGates` over the road bake's own candidate graph, the gates it
 * gives every pair before it tests one. **A landmark may not take all of
 * them**, whatever share of the town's gates they are: Mount Fuji, walked off
 * Suruga Bay, came down on the two gates Kofu's roads to Tokyo and Shizuoka
 * use, and Kofu was left with no road while three of its gates stood free
 * facing nobody. Taking some of them is the town wrapping round its landmark,
 * and the road bake sends those roads to the next gate round.
 */
const wantedGates = new Map<Place, Set<number>>();
/** Every pair of built towns the road bake will try to join, for the narrows a bridge may not stand in the way of. */
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

/** Whether a landmark at a spot stands where it may: dry enough, and taking no town. */
function standsWell(point: Placed, lat: number, lon: number, need: number): boolean {
  return dryTo(lat, lon, point.id, need) && townTaken(point.id, lat, lon) === null;
}

function seatAll(): { id: string; km: number }[] {
  const seated: { id: string; km: number }[] = [];
  for (const point of placed) {
    const shore = shoreIds.has(point.id);
    // A shore landmark is held to no more water than it stands in now when a
    // town moves it, so walking it off a town never walks it into the sea.
    const now = shore ? Math.min(0, clearance(point.lat, point.lon, point.id, 0)) : 0;
    const need = shore ? now : needOf(point);
    if (standsWell(point, point.lat, point.lon, need)) continue;
    let spot = shore ? seatNear(point, 0, SEAT_BUDGET) : null;
    for (let less = shore ? now : need; spot === null && less >= (shore ? now : 0); less -= SEAT_STEP) {
      // Where no spot within reach has the whole margin, the most of it one
      // does — the plan itself dry, always, off the shore — rather than a
      // landmark walked a hundred kilometres for the last few units of level
      // ground round it.
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

/**
 * Where a landmark stands against the towns: **in a parcel of its own, or out
 * of the town altogether.**
 *
 * A landmark used to stand wherever the passes above left it, and a town it
 * reached wrapped round it cell by cell: the cells under its plan were paved,
 * the streets ran on into its square and stopped at its kerb, a yard half
 * under it kept its lawn, and the square the landmark brought with it lay over
 * all of it at a height of its own. It read as a model dropped on a town. So
 * now there are two answers and nothing between them:
 *
 * - **A landmark that stands in a paved square** (the source's `plazas`) and
 *   fits in one quarter of its town — between the main streets and the edge,
 *   so no main street runs into it — is stood in the middle of a block of the
 *   town's own cells, with at least `PARCEL_KEEP` of ground round its plan and
 *   less than half a cell more (`landmarkParcel` in `scenery/grid.ts`, which
 *   the town and the road bake read). The town paves that block as one square
 *   and keeps the streets round it. Its `setting` becomes `parcel`.
 * - **Every other landmark that reaches a town** — one too big for a quarter
 *   of it, a mountain, a ruin, a bridge — is walked out of the town's square
 *   until its plan is `OUTSIDE_GAP` clear of it, to the nearest spot that is
 *   dry, in its country and clear of the others, and stands in the country
 *   beside the town.
 *
 * A `shore` landmark is walked out of a town too, but only to a spot with at
 * least as much water under its plan as it stands in now: the water is what
 * it is made of (`shoreOutsideNear`).
 */
const OUTSIDE_GAP = 10;
/** How far a landmark may be walked out of a town, in world units, before it is left where it was. */
const OUTSIDE_REACH = 400;

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

/** The runs of cells a parcel may take along one axis of a square: one quarter, either side of the main street. */
function quarters(grid: TownGrid): [number, number][] {
  const n = grid.cells;
  if (n < 2) return [];
  if (n % 2 === 1) {
    const m = (n - 1) / 2;
    return m > 0 ? [[0, m - 1], [m + 1, n - 1]] : [];
  }
  return [[0, n / 2 - 1], [n / 2, n - 1]];
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
 * The nearest spot out of every town where the landmark stands, rings out from
 * where it is: out of every road's way (`inTheWay`) if a spot that is lies
 * within `WAY_DETOUR` further out than the nearest, and the nearest otherwise.
 * Further was the Colosseum and St Peter's a hundred kilometres from Rome.
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
/**
 * The nearest spot out of every town for a `shore` landmark: one that keeps at
 * least the water it stands in now under its plan, so walking it off a town
 * never walks it off its shore.
 */
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
 * Whether a spot is on the way of a road the road bake will try to build: the
 * chord between two towns it joins passing within `ROAD_ROOM` of the plan
 * (a carriageway's clearance and `LANDMARK_KEEP` past it, and a little). The
 * road is a curve near that chord, and one that has to go round a landmark goes
 * the long way or not at all: on the Sacramento delta the Golden Gate took the
 * crossing Stockton's road to Fairfield was built over, and walked out of San
 * Francisco onto its neighbours' way it sent two of its roads round it to
 * cross each other on bridges of their own.
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
    // Along the chord a few units at a time, on the straight line between the
    // two directions, which over a few hundred units is the great circle.
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
  // The ground a landmark that has been dry so far keeps; one the coast
  // never had room for stands no worse than it does.
  const need = dryTo(point.lat, point.lon, point.id, needOf(point)) ? needOf(point) : 0;
  let done = false;
  if (point.setting === 'plaza' && hosts.length === 1) {
    for (const [lat, lon] of parcelSpots(point, hosts[0]!, point.lat, point.lon)) {
      // In this town's parcel and no other's.
      if (hostsNear(point.id, lat, lon, OUTSIDE_GAP).length !== 1) continue;
      // In a town the town's own floor is the ground round the plan, so only
      // the parcel has to be dry, not the pad's whole margin.
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

// Recorded rather than recomputed by every reader: `check-world.ts` measures it
// again from the outlines and fails if the two disagree, which is what says the
// coastline or a model's footprint moved and the bake did not.
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

if (parcelled.length > 0) {
  console.log(`\nstood in a parcel of their town (${parcelled.length}):`);
  for (const s of parcelled) console.log(`  ${s.id.padEnd(24)} ${s.town.padEnd(20)} ${s.km.toFixed(1)} km`);
}
if (walkedOut.length > 0) {
  console.log(`\nwalked out of a town into the country beside it (${walkedOut.length}):`);
  for (const s of walkedOut.sort((a, b) => b.km - a.km)) console.log(`  ${s.id.padEnd(24)} ${s.town.padEnd(20)} ${s.km.toFixed(1)} km`);
}
if (leftIn.length > 0) console.log(`\nleft reaching a town, with no spot out of it within ${OUTSIDE_REACH} units: ${leftIn.join(', ')}`);

if (seated.length > 0) {
  console.log(`\nmoved off the coast until the plan and its margin stand on one shelf (${seated.length}):`);
  for (const s of seated.sort((a, b) => b.km - a.km)) {
    console.log(`  ${s.id.padEnd(24)} ${s.km.toFixed(1)} km`);
  }
}

// The shore landmarks the coastline has no room for, and how far into their
// plan the water comes. A table rather than a failure: the Golden Gate spans a
// strait and Easter Island is narrower than its own moai, so this number is
// never going to zero — but it is the number that must not quietly grow, and
// only a landmark listed as `shore` may be on it at all.
const overhanging = placed
  .filter((p) => (p.clearance ?? 0) < 0)
  .map((p) => ({ id: p.id, short: -(p.clearance ?? 0) }))
  .sort((a, b) => b.short - a.short);
console.log(`\nshore landmarks standing over the water (${overhanging.length}), the water this far into the plan:`);
for (const o of overhanging) console.log(`  ${o.id.padEnd(24)} ${o.short.toFixed(0)} units`);
