/**
 * Where a coastal town keeps its harbour: a pure function of the town, the
 * outlines and what already stands in the water there.
 *
 * A built town of `HARBOUR_POP` or more whose own coast comes within its
 * square, or a little past it, gets one (a smaller one by a roll): a wooden
 * pier on piles, or past `QUAY_POP` a stone quay, running straight out from
 * the coastline. It is tried on `BEARINGS` bearings out from the town's
 * middle, nearest coast first, and the first that stands is the town's: the
 * whole run in open water, with water either side wide enough for a boat at
 * each berth, clear of the town's other moored vessels (`taken`) and of every
 * landmark's plan.
 *
 * The boats at its berths are takeable fleet vehicles (`fleet/site-harbours.ts`),
 * so the fleet and the drawing ask the same planner, which keeps nothing but
 * its answers. Round the run, by the town's size, `layout.ts` lays the rest:
 * a waterfront quay, a breakwater, more piers, a slipway and the boats nobody
 * takes.
 */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { BUILT_CEILING, isShown, radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { SHORE_LIP, SHORE_WATERLINE } from '../terrain.ts';
import { plannedSite, siteGap } from '../landmark-ground.ts';
import type { LandmarkSite } from '../landmark-ground.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { rngFrom } from '../scenery/random.ts';
import { townOf, townOffset } from '../roads/town.ts';
import { regionFor } from '../scenery/regions.ts';
import type { RegionId } from '../scenery/regions.ts';
import { layoutHarbour } from './layout.ts';
import type { Berth, Harbour, HarbourKind, HarbourSize, Taken } from './types.ts';

export type { Berth, Deck, Harbour, HarbourKind, HarbourSize, Taken } from './types.ts';

/** The smallest town that keeps a harbour, the share of those under `SURE_POP` that do, and where a quay replaces a pier. */
export const HARBOUR_POP = 15000;
export const SURE_POP = 100000;
export const HARBOUR_SHARE = 0.55;
export const QUAY_POP = 250000;
/** Past this a harbour has a waterfront quay and more than its one pier. */
export const TOWN_POP = 50000;
/** Bearings tried out from a town's middle, and how far past its square the coast is looked for. */
const BEARINGS = 32;
const COAST_SEARCH = 40;
/** The step a run is walked in, in units. */
const STEP = 2;
/** A pier's and a quay's width and length, in units. */
export const PIER_WIDTH = 3.6;
export const QUAY_WIDTH = 9;
const PIER_LENGTH: readonly [number, number] = [30, 42];
const QUAY_LENGTH: readonly [number, number] = [40, 56];
/** How far the deck starts back on the land, so it meets the ground rather than its edge. */
export const LANDING = 3;
/** The deck's height over the land at its landing, in units. */
export const DECK_LIFT = 0.35;
/** The most a landing may stand over the shore's lip: past it the coast is a cliff and the bearing is passed over. */
const LANDING_RISE = 6;
/** Water either side of the run a berth needs: a boat's beam and room to come alongside. */
const BERTH_ROOM = 7;
/** How far past the end the water must reach. */
const END_ROOM = 8;
/** Kept off a landmark's plan and another vessel's room, in units. */
const LANDMARK_CLEAR = 12;
/** A berth's offset from the run's edge, by model: half a beam and a fender. */
export const BERTH_OFF: Readonly<Record<'launch' | 'sailboat', number>> = { launch: 2.2, sailboat: 2.8 };
/** Where the berths are along the run, from its end, in units. */
const BERTH_FROM_END = [7, 18] as const;
/** How far past the town's square a berth floats, and the longest a run grows to get it there. */
const SQUARE_CLEAR = 4;
const LONGEST = 80;

export interface HarbourSource {
  world: World;
  places: readonly Place[];
  monuments?: readonly LandmarkSite[];
}

export interface HarbourPlanner {
  /** The harbour of town `p`, or null; `taken` is what of its own already floats there. Kept after the first ask. */
  harbourOf(p: number, taken: readonly Taken[]): Harbour | null;
  /** A harbour already planned, or undefined if `harbourOf` has not been asked. */
  planned(p: number): Harbour | null | undefined;
}

export function createHarbourPlanner(source: HarbourSource): HarbourPlanner {
  const { world, places } = source;
  const landmarks = (source.monuments ?? []).map(plannedSite);
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const known = new Map<number, Harbour | null>();
  const centre = new THREE.Vector3();
  const north = new THREE.Vector3();
  const east = new THREE.Vector3();
  const way = new THREE.Vector3();
  const point = new THREE.Vector3();
  const square = { x: 0, z: 0 };
  /** The built towns in cells of `TOWN_CELL` degrees, filled on the first ask. */
  let townCells: Map<number, number[]> | null = null;
  const TOWN_CELL = 1;
  const cellKey = (row: number, col: number): number => row * 1000 + (((col % 360) + 360) % 360);

  /** Whether a point is in a built town's square, or within `margin` of it; town `except`'s is not asked. */
  function inAnySquare(at: THREE.Vector3, margin: number, except = -1): boolean {
    if (townCells === null) {
      townCells = new Map();
      places.forEach((place, q) => {
        if (!isShown(place)) return;
        const key = cellKey(Math.floor(place.lat / TOWN_CELL) + 90, Math.floor(place.lon / TOWN_CELL));
        const list = townCells!.get(key);
        if (list === undefined) townCells!.set(key, [q]);
        else list.push(q);
      });
    }
    const lat = latOf(at.y);
    const lon = lonOf(at.x, at.z);
    const reach = Math.ceil((BUILT_CEILING + margin) / (PLANET_RADIUS * (Math.PI / 180)) / TOWN_CELL / Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
    const row = Math.floor(lat / TOWN_CELL) + 90;
    const col = Math.floor(lon / TOWN_CELL);
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - reach; c <= col + reach; c++) {
        for (const q of townCells.get(cellKey(r, c)) ?? []) {
          if (q === except) continue;
          const town = townOf(places[q]!);
          if (at.dot(town.up) <= 0) continue;
          townOffset(town, at, square);
          const half = town.grid.half + margin;
          if (Math.abs(square.x) < half && Math.abs(square.z) < half) return true;
        }
      }
    }
    return false;
  }

  const wet = (p: THREE.Vector3): boolean => world.countryAt(latOf(p.y), lonOf(p.x, p.z)) === 0;
  /** A point `along` units out and `side` across from `from`, on the unit sphere. */
  const offset = (from: THREE.Vector3, out: THREE.Vector3, across: THREE.Vector3, along: number, side: number, target: THREE.Vector3): THREE.Vector3 =>
    target.copy(from).addScaledVector(out, along / PLANET_RADIUS).addScaledVector(across, side / PLANET_RADIUS).normalize();

  function plan(p: number, taken: readonly Taken[]): Harbour | null {
    const place = places[p]!;
    const rng = rngFrom('harbour', p);
    if (!keepsHarbour(place, rng)) return null;
    const kind: HarbourKind = place.pop >= QUAY_POP ? 'quay' : 'pier';
    const width = kind === 'quay' ? QUAY_WIDTH : PIER_WIDTH;
    const [shortest, longest] = kind === 'quay' ? QUAY_LENGTH : PIER_LENGTH;
    const rolled = Math.round(rng.range(shortest, longest));
    const radius = radiusOf(place);
    const town = townOf(place);
    const models: ('launch' | 'sailboat')[] = place.pop >= SURE_POP ? ['launch', 'sailboat'] : ['launch'];
    const firstBerth = BERTH_FROM_END[models.length - 1]!;
    unitAt(place.lat, place.lon, centre);
    north.set(0, 1, 0).projectOnPlane(centre);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(centre);
    north.normalize();
    east.crossVectors(north, centre).normalize();
    const start = rng.unit() * Math.PI * 2;

    // Where each bearing first meets the water, nearest first.
    const tries: { bearing: number; coast: number }[] = [];
    for (let k = 0; k < BEARINGS; k++) {
      const bearing = start + (k / BEARINGS) * Math.PI * 2;
      way.copy(north).multiplyScalar(Math.cos(bearing)).addScaledVector(east, Math.sin(bearing));
      for (let d = STEP; d <= radius + COAST_SEARCH; d += STEP) {
        offset(centre, way, east, d, 0, point);
        if (wet(point)) {
          tries.push({ bearing, coast: d });
          break;
        }
      }
    }
    tries.sort((a, b) => a.coast - b.coast || a.bearing - b.bearing);

    for (const { bearing, coast } of tries) {
      way.copy(north).multiplyScalar(Math.cos(bearing)).addScaledVector(east, Math.sin(bearing));
      // The coastline within a unit, walked back from the first wet step.
      let low = coast - STEP;
      let high = coast;
      for (let i = 0; i < 4; i++) {
        const mid = (low + high) / 2;
        if (wet(offset(centre, way, east, mid, 0, point))) high = mid;
        else low = mid;
      }
      const root = offset(centre, way, east, low, 0, new THREE.Vector3());
      const out = way.clone().projectOnPlane(root).normalize();
      const across = new THREE.Vector3().crossVectors(root, out).normalize();
      // Long enough that its berths float past the town's own square.
      let leaves = 0;
      const half = town.grid.half + SQUARE_CLEAR + width / 2 + BERTH_OFF.sailboat;
      while (leaves < LONGEST) {
        townOffset(town, offset(root, out, across, leaves, 0, point), square);
        if (Math.abs(square.x) >= half || Math.abs(square.z) >= half) break;
        leaves += STEP;
      }
      const length = Math.max(rolled, leaves + firstBerth);
      if (length > LONGEST || !standsAt(root, out, across, length, width, taken)) continue;
      // The deck at its landing's height, never under the lip of the shore.
      // The deck at its landing's height across its width, never under the lip of the shore; on a cliff, no harbour.
      let ground = SHORE_LIP;
      for (const side of [-width / 2, 0, width / 2]) {
        for (const back of [LANDING, LANDING / 2, 0]) ground = Math.max(ground, world.elevationAt(offset(root, out, across, -back, side, point).multiplyScalar(PLANET_RADIUS)));
      }
      if (ground > SHORE_LIP + LANDING_RISE) continue;
      const deck = ground + DECK_LIFT;
      const berths: Berth[] = [];
      models.forEach((model, n) => {
        const side = (n % 2 === 0 ? 1 : -1) * (width / 2 + BERTH_OFF[model]);
        const at = offset(root, out, across, length - BERTH_FROM_END[n]!, side, new THREE.Vector3());
        const forward = out.clone().projectOnPlane(at).normalize();
        berths.push({ model, at, forward });
      });
      // And out of every other town's square too.
      if (berths.some((berth) => inAnySquare(berth.at, SQUARE_CLEAR))) continue;
      return laidOut({ p, place, kind, root, out, across, length, width, deck, berths, taken, town });
    }
    return null;
  }

  /** The rest of the harbour round its run (`layout.ts`), asked of the world in the run's frame. */
  function laidOut(run: {
    p: number; place: Place; kind: HarbourKind; root: THREE.Vector3; out: THREE.Vector3; across: THREE.Vector3;
    length: number; width: number; deck: number; berths: Berth[]; taken: readonly Taken[]; town: ReturnType<typeof townOf>;
  }): Harbour {
    const { p, place, kind, root, out, across, length, width, deck, berths, taken, town } = run;
    const size: HarbourSize = kind === 'quay' ? 'port' : place.pop >= TOWN_POP ? 'town' : 'village';
    const region = regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat).id as RegionId;
    const probe = new THREE.Vector3();
    const at = (x: number, z: number): THREE.Vector3 => offset(root, out, across, z, x, probe);
    const local = berths.map((berth) => {
      probe.copy(berth.at).sub(root);
      return { x: probe.dot(across) * PLANET_RADIUS, z: probe.dot(out) * PLANET_RADIUS };
    });
    const layout = layoutHarbour({
      size, region, kind, length, width, deck, landing: LANDING, berths: local,
      wetAt: (x, z) => wet(at(x, z)),
      groundAt: (x, z) => world.elevationAt(at(x, z).multiplyScalar(PLANET_RADIUS)),
      clearAt: (x, z) => {
        const point = at(x, z);
        for (const thing of taken) if (thing.at.angleTo(point) * PLANET_RADIUS < thing.radius + 2) return false;
        for (const site of landmarks) {
          if (point.dot(site.up) < Math.cos((site.reach + LANDMARK_CLEAR) / PLANET_RADIUS)) continue;
          if (siteGap(site, point, PLANET_RADIUS) < LANDMARK_CLEAR) return false;
        }
        return !inAnySquare(point, 2, p);
      },
      ownSquare: (x, z) => {
        townOffset(town, at(x, z), square);
        return Math.abs(square.x) < town.grid.half && Math.abs(square.z) < town.grid.half;
      },
      rng: rngFrom('harbour-layout', p),
    });
    let extent = length;
    for (const d of layout.decks) extent = Math.max(extent, Math.hypot(Math.max(-d.x0, d.x1), Math.max(-d.z0, d.z1)));
    for (const m of layout.moorings) extent = Math.max(extent, Math.hypot(m.x, m.z) + m.length);
    return {
      place: p, kind, size, region, root, out, across, length, width, deck, berths, ...layout, extent,
    };
  }

  /** Whether a run of `length` from `root` stands: open water under it and either side, clear of what is taken and of landmarks. */
  function standsAt(root: THREE.Vector3, out: THREE.Vector3, across: THREE.Vector3, length: number, width: number, taken: readonly Taken[]): boolean {
    for (let d = SHORE_WATERLINE; d <= length + END_ROOM; d += STEP) {
      if (!wet(offset(root, out, across, d, 0, point))) return false;
      if (d < SHORE_WATERLINE + STEP * 2) continue;
      for (const side of [-1, 1]) {
        if (!wet(offset(root, out, across, d, side * (width / 2 + BERTH_ROOM), point))) return false;
      }
      for (const thing of taken) {
        if (thing.at.angleTo(offset(root, out, across, d, 0, point)) * PLANET_RADIUS < thing.radius + width / 2 + BERTH_OFF.sailboat + 1) return false;
      }
    }
    for (const site of landmarks) {
      for (let d = -LANDING; d <= length; d += STEP * 2) {
        offset(root, out, across, d, 0, point);
        if (point.dot(site.up) < Math.cos((site.reach + LANDMARK_CLEAR) / PLANET_RADIUS)) continue;
        if (siteGap(site, point, PLANET_RADIUS) < LANDMARK_CLEAR) return false;
      }
    }
    return true;
  }

  return {
    harbourOf(p, taken) {
      const had = known.get(p);
      if (had !== undefined) return had;
      const found = plan(p, taken);
      known.set(p, found);
      return found;
    },
    planned: (p) => known.get(p),
  };
}

/** Whether a town keeps a harbour at all: built, big enough, and under `SURE_POP` by a roll of its own. */
export function keepsHarbour(place: Place, rng: { chance(probability: number): boolean }): boolean {
  if (!isShown(place) || place.pop < HARBOUR_POP) return false;
  return place.pop >= SURE_POP || rng.chance(HARBOUR_SHARE);
}

/** How far over a ladder's foot a swimmer finds it, units. */
const LADDER_REACH = 1.8;
/** Under this far beneath a deck a body is under it, not on it. */
const UNDER_DECK = 1.2;

/**
 * The made surface at a point, as a radius, or 0 off every deck. A wooden
 * deck is a roof from below: a point under the sea's surface (a swimmer, a
 * wader) passes under it, except within reach of a ladder. A bare direction,
 * or a point at or over the surface, is asked from above.
 */
export function deckRadiusAt(harbour: Harbour, point: THREE.Vector3): number {
  const lengthSq = point.lengthSq();
  if (lengthSq === 0) return 0;
  const radius = Math.sqrt(lengthSq);
  const inv = 1 / radius;
  const dx = point.x * inv - harbour.root.x;
  const dy = point.y * inv - harbour.root.y;
  const dz = point.z * inv - harbour.root.z;
  const z = (dx * harbour.out.x + dy * harbour.out.y + dz * harbour.out.z) * PLANET_RADIUS;
  const x = (dx * harbour.across.x + dy * harbour.across.y + dz * harbour.across.z) * PLANET_RADIUS;
  if (x * x + z * z > harbour.extent * harbour.extent) return 0;
  const below = radius > 2 && radius < PLANET_RADIUS - 0.25;
  let best = 0;
  for (const deck of harbour.decks) {
    if (x < deck.x0 || x > deck.x1 || z < deck.z0 || z > deck.z1) continue;
    const height = deck.h0 === deck.h1 ? deck.h0 : deck.h0 + ((deck.h1 - deck.h0) * (z - deck.z0)) / (deck.z1 - deck.z0);
    if (below && deck.kind === 'wood' && radius < PLANET_RADIUS + height - UNDER_DECK
      && !harbour.ladders.some((ladder) => Math.hypot(ladder.x - x, ladder.z - z) < LADDER_REACH)) continue;
    if (PLANET_RADIUS + height > best) best = PLANET_RADIUS + height;
  }
  return best;
}

/** A deck's height at a point of the frame, or null off every deck: the drawing's and the check's question. */
export function deckHeightAt(harbour: Harbour, x: number, z: number): number | null {
  let best: number | null = null;
  for (const deck of harbour.decks) {
    if (x < deck.x0 || x > deck.x1 || z < deck.z0 || z > deck.z1) continue;
    const height = deck.h0 === deck.h1 ? deck.h0 : deck.h0 + ((deck.h1 - deck.h0) * (z - deck.z0)) / (deck.z1 - deck.z0);
    if (best === null || height > best) best = height;
  }
  return best;
}
