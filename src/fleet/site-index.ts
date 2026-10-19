/**
 * The index of every vehicle's default place, worked out a town at a time on
 * first need. The whole planet's are about forty thousand vehicles and the
 * launches' search for open water is most of their cost, so the world pays for
 * the towns near the player; `SiteIndex.all()` is there for the check and the
 * console.
 */
import { PLANET_RADIUS } from '../globe.ts';
import { BUILT_CEILING, radiusOf } from '../places.ts';
import { STRIP_APPROACH, STRIP_LENGTH } from '../craft/airstrip.ts';
import { CRAFT_KINDS } from '../craft/contract.ts';
import type { CraftKind } from '../craft/contract.ts';
import { createNeighbourhood } from './site-hood.ts';
import { createFieldSearch } from './site-fields.ts';
import { createBoatSites } from './site-boats.ts';
import { createHarbourSites } from './site-harbours.ts';
import { createCarSites } from './site-cars.ts';
import { createGateSites } from './site-gates.ts';
import { createPlanes } from './site-planes.ts';
import { createTownFields } from './site-town-fields.ts';
import { createStripTests } from './site-strips.ts';
import { SITE_ROOM, SITE_SPREAD } from './site-rules.ts';
import type { FleetSite, FleetSource, SiteIndex } from './site-types.ts';
import { createSiteWorld } from './site-world.ts';
import { FIELD_SPREAD, STRIP_DISC } from './strip-rules.ts';

export function createSiteIndex(source: FleetSource): SiteIndex {
  const w = createSiteWorld(source);
  const { places, centres, shown, townsNear, nearRoad, nearMonument } = w;
  const hood = createNeighbourhood(w);
  const tests = createStripTests(w, hood);
  const search = createFieldSearch(w, hood, tests);
  const planes = createPlanes(w, search);
  const { keepsPlane, advanceFree, advanceFinal, neighboursOf, finals } = planes;
  const { fieldsOf, fieldsPer, NONE } = createTownFields(w, search, planes);
  const { discsOf } = tests;
  const { cars } = createCarSites(w);
  const { boats, moorings } = createBoatSites(w);
  const { gates } = createGateSites(w);
  const { harbourBoats } = createHarbourSites(w, source);

  const perPlace: (readonly FleetSite[] | undefined)[] = new Array(places.length);
  const counts = { ...(Object.fromEntries(CRAFT_KINDS.map((kind) => [kind, 0])) as Record<CraftKind, number>), towns: 0 };

  function sitesOf(p: number): readonly FleetSite[] {
    const known = perPlace[p];
    if (known !== undefined) return known;
    if (!shown[p]) return (perPlace[p] = NONE);
    const out: FleetSite[] = [];
    cars(p, out);
    boats(p, out);
    out.push(...fieldsOf(p));
    gates(p, out);
    moorings(p, out);
    harbourBoats(p, out);
    for (const entry of out) counts[entry.kind]++;
    counts.towns++;
    perPlace[p] = out;
    return out;
  }

  const townList: number[] = [];
  const nearTowns: number[] = [];
  const fieldTowns: number[] = [];

  return {
    sitesOf,
    fieldsNear(direction, radius, out) {
      // Its own list of towns: a field search asks `townsNear` again inside.
      for (const p of townsNear(direction, radius + FIELD_SPREAD, fieldTowns)) {
        for (const entry of fieldsOf(p)) {
          if (entry.kind === 'plane') {
            // The whole strip, if any of it is near: the stand is inside it.
            if (entry.at.angleTo(direction) * PLANET_RADIUS > radius + STRIP_LENGTH + STRIP_APPROACH + STRIP_DISC) continue;
            for (const disc of discsOf(entry)) {
              if (disc.at.angleTo(direction) * PLANET_RADIUS < radius + disc.radius) out.push(disc);
            }
            continue;
          }
          const room = SITE_ROOM[entry.kind];
          if (entry.at.angleTo(direction) * PLANET_RADIUS < radius + room) out.push({ at: entry.at, radius: room });
        }
      }
      return out;
    },
    planesNear(direction, radius, out) {
      // A town's plane is its strip alone (`planeOf`): the rest of a town's
      // fields are not worked out for it, so a wide ask — the maps' — costs
      // the plane towns and nothing else.
      for (const p of townsNear(direction, radius + FIELD_SPREAD, fieldTowns)) {
        if (!keepsPlane(p)) continue;
        advanceFinal(p);
        const plane = finals[p];
        if (plane !== null && plane !== undefined) out.push(plane);
      }
      return out;
    },
    near(direction, radius, out, fresh = Infinity) {
      townsNear(direction, radius + SITE_SPREAD, nearTowns);
      // With a limit on the towns worked out for the first time, the nearest
      // go first, so the town under the player does not wait behind a dozen
      // further off.
      if (fresh !== Infinity) nearTowns.sort((a, b) => centres[b]!.dot(direction) - centres[a]!.dot(direction) || a - b);
      for (const p of nearTowns) {
        if (perPlace[p] === undefined) {
          if (fresh <= 0) continue;
          fresh--;
        }
        out.push(...sitesOf(p));
      }
      return out;
    },
    warm(direction, radius, more) {
      const towns = townsNear(direction, radius, []).filter((q) => keepsPlane(q) && fieldsPer[q] === undefined);
      if (towns.length === 0) return true;
      const distance = towns.map((q) => centres[q]!.dot(direction));
      const order = towns.map((_, i) => i).sort((a, b) => distance[b]! - distance[a]! || towns[a]! - towns[b]!);
      // Nearest first, each in pieces a stand long: its own free strip and its
      // neighbours', which its own strip asks, then its own strip, then the
      // rest of its fields.
      for (const i of order) {
        const q = towns[i]!;
        if (!advanceFree(q, more)) return false;
        for (const r of neighboursOf(q)) if (!advanceFree(r, more)) return false;
        if (!advanceFinal(q, more)) return false;
        if (!more()) return false;
        fieldsOf(q);
      }
      return true;
    },
    all() {
      const out: FleetSite[] = [];
      for (let p = 0; p < places.length; p++) out.push(...sitesOf(p));
      return out;
    },
    takenAt(direction, clear) {
      // A town's disc is at most `BUILT_CEILING` round its centre, as in `localise`.
      for (const q of townsNear(direction, BUILT_CEILING + clear + 1, townList)) {
        if (centres[q]!.angleTo(direction) * PLANET_RADIUS < radiusOf(places[q]!) + clear) return 'town';
      }
      if (nearRoad(direction, clear)) return 'road';
      return nearMonument(direction, clear) ? 'landmark' : null;
    },
    byId(id) {
      const parts = id.split(':');
      const p = Number(parts[1]);
      if (parts.length !== 3 || !Number.isInteger(p) || p < 0 || p >= places.length) return null;
      return sitesOf(p).find((entry) => entry.id === id) ?? null;
    },
    counts,
  };
}
