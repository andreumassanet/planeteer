import { at, check } from './harness.ts';
import { placesPath } from './context.ts';
import type { PlacedMonument, WorldContext } from './context.ts';
import { existsSync } from 'node:fs';
import { Vector3 } from 'three';
import { PLANET_RADIUS, groundRadius } from '../../src/globe.ts';
import { unitAt } from '../../src/sphere.ts';
import {
  BIGGEST_SETTLEMENT,
  PROMINENCE_CAP,
  PROMINENCE_RADIUS,
  PROMINENCE_RATIO,
  SMALLEST_SETTLEMENT,
  indexPlaces,
  isShown,
  labelRadiusOf,
  prominenceField,
  radiusFor,
  radiusOf,
} from '../../src/places.ts';
import type { Place, Places } from '../../src/places.ts';
import { ARRIVAL_CLEARANCE, clearOfPlans, plannedSite, siteGap } from '../../src/landmark-ground.ts';
import { isWater } from '../../src/vehicles.ts';
import { TIME_SCALE } from '../time-scale.ts';
import type { World } from '../../src/geo.ts';

/**
 * The settlements, checked against the coastline they were baked against.
 *
 * This is the assertion that goes stale: re-bake `countries.bin`, the coast
 * moves a little, and villages end up standing on water with nothing to say so.
 * `build-places.mjs` snapped 334 of them to land once, at bake time, precisely
 * so no client repeats that search — which means the snap is only as good as the
 * outlines it was computed against.
 */
export function checkSettlements(ctx: WorldContext): void {
  const { world, placed, placesRaw } = ctx;
  if (existsSync(placesPath)) {
    console.log('\nsettlements');
    checkPlaceRows(placesRaw, world, placed);
  } else {
    console.log('\nsettlements: not built yet (run `pnpm places`)');
  }
}

function checkPlaceRows(placesRaw: Place[], world: World, placed: PlacedMonument[]): void {
  const places = placesRaw;
  const isoOf = new Map(world.countries.map((c, i) => [i + 1, c.iso]));
  const known = new Set(world.countries.map((c) => c.iso));

  let inSea = 0;
  let wrongCountry = 0;
  let malformed = 0;
  const seaExamples: string[] = [];
  const isoExamples: string[] = [];
  for (const place of places) {
    const id = world.countryAt(place.lat, place.lon);
    if (id === 0) {
      inSea++;
      if (seaExamples.length < 4) seaExamples.push(place.name);
    } else if (isoOf.get(id) !== place.iso) {
      wrongCountry++;
      if (isoExamples.length < 4) isoExamples.push(`${place.name} ${place.iso}/${isoOf.get(id)}`);
    }
    if (
      !place.name ||
      !(place.pop > 0) ||
      !known.has(place.iso) ||
      Math.abs(place.lat * 1000 - Math.round(place.lat * 1000)) > 1e-6 ||
      Math.abs(place.lon * 1000 - Math.round(place.lon * 1000)) > 1e-6
    ) {
      malformed++;
    }
  }

  check(inSea === 0, `all ${places.length} places are on land`, seaExamples.join(', '));
  check(wrongCountry === 0, 'every place agrees with countryAt', isoExamples.join('; '));
  check(malformed === 0, 'names, populations, codes and precision are well formed', `${malformed} bad rows`);

  // A table rather than a boolean: a re-bake that quietly loses a region shows
  // up here as a number that moved, which no assertion would have caught.
  const perContinent = new Map<string, number>();
  for (const place of places) {
    const country = world.countries.find((c) => c.iso === place.iso);
    const key = country?.continent ?? 'unknown';
    perContinent.set(key, (perContinent.get(key) ?? 0) + 1);
  }
  const spread = [...perContinent.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  --   ' + spread.map(([k, n]) => `${k} ${n}`).join(' · '));

  /**
   * The place index, which the HUD reads to name where you are.
   *
   * The assertion is the cheapest one that can exist and it is aimed at exactly
   * one thing: `places.ts` converts lat/lon to xyz itself, which makes it the
   * sixteenth place in this repo to do so and therefore the sixteenth chance to
   * write `+cos(lat) * sin(lon)` and mirror the planet again. Standing on a
   * city and being told you are near a different one is what that looks like,
   * and a mirrored index would still return a plausible city every time.
   */
  const index = indexPlaces(places, PLANET_RADIUS);
  let misnamed = 0;
  const misnamedExamples: string[] = [];
  for (const place of places) {
    if (!isShown(place)) continue;
    const found = index.nearest(at(place.lat, place.lon));
    // Ties are real: `build-places.mjs` snapped several pairs onto the same
    // point, so what is asserted is the coordinate, not the row.
    if (found.units > 0.5) {
      misnamed++;
      if (misnamedExamples.length < 4) {
        misnamedExamples.push(`${place.name} -> ${found.place.name} ${found.units.toFixed(0)}u`);
      }
    }
  }
  check(misnamed === 0, 'every built place is its own nearest place', misnamedExamples.join(', '));

  /**
   * And a hidden one is never named as itself: nothing is built there, so the
   * chip standing in Manacor has to say *near Palma* — a built place, and one
   * whose label band reaches this far. The second half is nearly always true
   * rather than always: `PROMINENCE_RADIUS` is under the label band's
   * approach, so every hidden place is inside its *hider's* name — but the
   * hider can be hidden too, and then the nearest built town may be further.
   * A hidden place with no built town in reach (Kara-Kulja, Fort Irwin) falls
   * back to the country, which is honest. The band is five, so a re-bake that moves one is not a failure and a rule that leaves
   * hundreds unnamed is.
   */
  let namedHidden = 0;
  let unnamed = 0;
  const hiddenExamples: string[] = [];
  for (const place of places) {
    if (isShown(place)) continue;
    const found = index.nearest(at(place.lat, place.lon));
    if (isShown(found.place) && found.near) continue;
    if (!isShown(found.place)) namedHidden++;
    else unnamed++;
    if (hiddenExamples.length < 4) hiddenExamples.push(`${place.name} -> ${found.place.name} ${found.units.toFixed(0)}u`);
  }
  check(
    namedHidden === 0 && unnamed <= 5,
    'standing in a hidden place, the chip says "near" a built one',
    `${places.length - places.filter(isShown).length} hidden places, ${namedHidden} name a hidden place, ` +
      `${unnamed} fall back to the country${unnamed > 0 ? `: ${hiddenExamples.join(', ')}` : ''}`,
  );

  checkTownsClear(places);

  checkFittedRadii(places, index);

  checkArrivalsClear(placed, world, places);

  /**
   * The size law has a *hierarchy* in it, which is the thing it did not have.
   *
   * The old assertion checked the two clamps and nothing else, and the law it
   * was guarding — `3.97 * pop^0.1876` — passed while turning a population range
   * of 1,258 to 1 into a size range of 3.8 to 1: every settlement on Earth the
   * same mark. So the spread across the file's own ends is asserted too, and 8
   * is a floor on it rather than the value (it is 12.3 today), because what has
   * to be caught is a law flattening again and not a law being retuned.
   */
  check(
    radiusFor(1) === SMALLEST_SETTLEMENT
      && radiusFor(4e7) === BIGGEST_SETTLEMENT
      && radiusFor(24_900_000) / radiusFor(5_000) > 8
      && labelRadiusOf({ pop: 1 }) > radiusFor(1),
    'the settlement radius spreads, and the label band is outside it',
    `hamlet ${radiusFor(5_000).toFixed(0)}u built / ${labelRadiusOf({ pop: 5_000 }).toFixed(0)}u named, ` +
    `Shanghai ${radiusFor(24_900_000).toFixed(0)}u / ${labelRadiusOf({ pop: 24_900_000 }).toFixed(0)}u, ` +
    `spread ${(radiusFor(24_900_000) / radiusFor(5_000)).toFixed(1)}x`,
  );

  checkProminence(places);

  const nearStart = Date.now();
  const M = 20_000;
  const probe = at(0, 0);
  for (let i = 0; i < M; i++) {
    probe.copy(at((((i * 7) % 180) - 90) * 0.9, ((i * 13) % 360) - 180));
    index.nearest(probe);
  }
  const nearUs = ((Date.now() - nearStart) / M) * 1000;
  // Called once a frame from `main.ts`, so the budget is a frame, not a query.
  check(nearUs < 200 * TIME_SCALE, 'nearest place under 200 us', `${nearUs.toFixed(1)} us per query`);
}

/**
 * No two settlements are built on the same ground, the invariant the bake's
 * thinning exists to produce.
 *
 * `build-places.mjs` keeps a place only when its built disc touches no kept
 * one, with separation `radiusOf(a) + radiusOf(b)` imported from `places.ts`,
 * so the bake is a function of a constant that lives in `src/`. Widening
 * `radiusFor` changes nothing in the data but makes towns interpenetrate; this
 * assertion says to re-bake. It reads `radiusOf`, not the law, because a city
 * fitted between its neighbours is only clear of them at its fitted radius
 * (stored as a whole, floored unit, so the clearance survives the wire).
 *
 * The search goes out to `radiusOf(p) + BIGGEST_SETTLEMENT`, not to the
 * nearest neighbour: a hamlet 60 units away clears a 30-unit town and a
 * metropolis 120 units away does not.
 */
function checkTownsClear(places: Place[]): void {
  const CELL = 0.5;
  const cellKey = (a: number, b: number): number => a * 2000 + (((b % 720) + 720) % 720);
  const cells = new Map<number, number[]>();
  for (let i = 0; i < places.length; i++) {
    const p = places[i]!;
    const k = cellKey(Math.floor((p.lat + 90) / CELL), Math.floor((p.lon + 180) / CELL));
    let bucket = cells.get(k);
    if (bucket === undefined) cells.set(k, (bucket = []));
    bucket.push(i);
  }
  const DEG = Math.PI / 180;
  const arc = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
    const h =
      Math.sin(((b.lat - a.lat) * DEG) / 2) ** 2 +
      Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(((b.lon - a.lon) * DEG) / 2) ** 2;
    return 2 * PLANET_RADIUS * Math.asin(Math.sqrt(h));
  };
  let overlapping = 0;
  let worst = 0;
  const overlapExamples: string[] = [];
  for (let i = 0; i < places.length; i++) {
    const p = places[i]!;
    const radius = radiusOf(p);
    const a = Math.floor((p.lat + 90) / CELL);
    const b = Math.floor((p.lon + 180) / CELL);
    const dLat = Math.ceil((radius + BIGGEST_SETTLEMENT) / (PLANET_RADIUS * DEG) / CELL);
    const span = Math.min(360, Math.ceil(dLat / Math.max(0.02, Math.cos(p.lat * DEG))));
    for (let da = -dLat; da <= dLat; da++) {
      for (let db = -span; db <= span; db++) {
        for (const j of cells.get(cellKey(a + da, b + db)) ?? []) {
          if (j <= i) continue;
          const q = places[j]!;
          const want = radius + radiusOf(q);
          const got = arc(p, q);
          if (got >= want) continue;
          overlapping++;
          if (want - got > worst) worst = want - got;
          if (overlapExamples.length < 4) {
            overlapExamples.push(`${p.name}/${q.name} ${got.toFixed(0)}u apart, ${want.toFixed(0)} wanted`);
          }
        }
      }
    }
  }
  check(
    overlapping === 0,
    'no two settlements are built on the same ground',
    overlapping === 0
      ? `${places.length} discs, none touching`
      : `${overlapping} pairs overlap, worst by ${worst.toFixed(0)}u — re-bake with \`pnpm places\`: ${overlapExamples.join('; ')}`,
  );
}

/**
 * The two things the thinning writes beside a row rather than deriving from
 * it: a fitted radius and the names it folded in.
 *
 * A stored radius is only ever smaller than the law's (the bake fits a city
 * into the room its neighbours leave, and grows nothing) and a whole unit.
 * Every alias has to reach a built town in its own country through
 * `Places.aliases`, because the menu offers only built towns. The exception is
 * a country with no built town at all (Bahrain: Manama stands inside Al
 * Muharraq, which Dammam hides); the check lists it rather than failing.
 */
function checkFittedRadii(places: Place[], index: Places): void {
  const stored = places.filter((p) => p.radius !== undefined);
  const badRadius = stored.filter(
    (p) => !Number.isInteger(p.radius) || p.radius! >= radiusFor(p.pop) || p.radius! < SMALLEST_SETTLEMENT,
  );
  check(
    badRadius.length === 0,
    'a stored radius is a whole unit under the law’s',
    badRadius.length === 0
      ? `${stored.length} places built smaller than \`radiusFor\`, ${stored.filter(isShown).length} of them shown`
      : badRadius.slice(0, 4).map((p) => `${p.name} ${p.radius} against ${radiusFor(p.pop).toFixed(1)}`).join(', '),
  );
  const aliases = index.aliases();
  const builtIn = new Set(places.filter(isShown).map((p) => p.iso));
  let written = 0;
  const wrong: string[] = [];
  const unreached: string[] = [];
  for (const host of places) {
    for (const name of host.aliases ?? []) {
      written++;
      const town = aliases.get(name);
      if (town === undefined) {
        if (builtIn.has(host.iso)) wrong.push(`${name} unreached`);
        else unreached.push(`${name} (${host.iso})`);
      } else if (!isShown(places[town]!) || places[town]!.iso !== host.iso) {
        wrong.push(`${name} -> ${places[town]!.name}`);
      }
    }
  }
  check(
    wrong.length === 0,
    'every alias finds a built town in its own country',
    `${aliases.size} of ${written} names, to ${new Set(aliases.values()).size} towns` +
      (unreached.length > 0 ? `; ${unreached.length} in a country with none built: ${unreached.join(', ')}` : '') +
      (wrong.length > 0 ? `; ${wrong.slice(0, 4).join(', ')}` : ''),
  );
}

/**
 * Nobody arrives inside a landmark. Every arrival — the menu's town, a
 * link's `?at=`, `/goto` (a built town, a name folded into one or a
 * country's seat, which are all built towns), `/home`, `/tp`, the map's
 * join — is carried out of every landmark's plan by `clearOfPlans` before
 * the body is put down (`arrivalAt` in `main.ts`), because a monument's
 * walls are measured from outside and a body inside one has no way out.
 * Replayed here for every built town's own point, with the same dry-ground
 * preference; the count of towns whose point stood within the clearance is
 * what the rule saves.
 */
function checkArrivalsClear(placed: PlacedMonument[], world: World, places: Place[]): void {
  const sites = placed.map(plannedSite);
  const nearestGap = (p: { x: number; y: number; z: number }): number => {
    let best = Infinity;
    for (const site of sites) {
      if (p.x * site.up.x + p.y * site.up.y + p.z * site.up.z < Math.cos((site.reach + 4 * ARRIVAL_CLEARANCE) / PLANET_RADIUS)) continue;
      best = Math.min(best, siteGap(site, p, PLANET_RADIUS));
    }
    return best;
  };
  const probe = new Vector3();
  const dry = (p: { x: number; y: number; z: number }): boolean =>
    !isWater(groundRadius(world, probe.set(p.x, p.y, p.z).multiplyScalar(PLANET_RADIUS)));
  const point = { x: 0, y: 0, z: 0 };
  const before: string[] = [];
  let insidePlan = 0;
  let wet = 0;
  const after: string[] = [];
  for (const place of places) {
    if (!isShown(place)) continue;
    unitAt(place.lat, place.lon, point);
    const was = nearestGap(point);
    if (was >= ARRIVAL_CLEARANCE) continue;
    before.push(`${place.name} ${was.toFixed(0)}`);
    if (was <= 0) insidePlan++;
    clearOfPlans(point, sites, PLANET_RADIUS, point, ARRIVAL_CLEARANCE, dry);
    const now = nearestGap(point);
    if (now < ARRIVAL_CLEARANCE - 0.01) after.push(`${place.name} ${now.toFixed(1)}`);
    if (!dry(point)) wet++;
  }
  check(
    after.length === 0,
    'no arrival at a built town is inside a landmark’s plan',
    `${before.length} town points within ${ARRIVAL_CLEARANCE} units of a plan, ${insidePlan} inside one, all carried out` +
      (wet > 0 ? `, ${wet} onto water` : '') +
      (before.length > 0 ? ` (${before.slice(0, 6).join(', ')})` : '') +
      (after.length > 0 ? `; still in: ${after.slice(0, 4).join(', ')}` : ''),
  );
}

/**
 * The prominence field, and what it decides.
 *
 * `build-places.mjs` bakes it with `prominenceField` and this recomputes it
 * from the shipped rows with the same function — one definition, the way
 * `proximityGraph` is shared with the road bake — so a file whose field was
 * baked against a different ratio, a different rank or a different radius
 * fails here by name. The rest is the study that chose the rule, as
 * assertions: see `PROMINENCE_RADIUS` in `places.ts` for the table these rows
 * come from. Mallorca is the island the rule was written for and the pairs
 * are the ones a pure "bigger place nearby" rule got wrong.
 */
function checkProminence(places: Place[]): void {
  const began = Date.now();
  const field = prominenceField(places, PLANET_RADIUS);
  const fieldMs = Date.now() - began;
  let malformedField = 0;
  let capitalsOffCap = 0;
  let drift = 0;
  const driftExamples: string[] = [];
  for (let i = 0; i < places.length; i++) {
    const place = places[i]!;
    const value = place.prominence;
    if (!Number.isInteger(value) || value < 0 || value > PROMINENCE_CAP) malformedField++;
    if (place.capital && value !== PROMINENCE_CAP) capitalsOffCap++;
    if (value !== field[i]) {
      drift++;
      if (driftExamples.length < 4) driftExamples.push(`${place.name} ${value} baked, ${field[i]} now`);
    }
  }
  check(
    malformedField === 0 && capitalsOffCap === 0,
    `prominence is whole units up to the ${PROMINENCE_CAP}u cap, and every capital is at it`,
    `${malformedField} malformed, ${capitalsOffCap} capitals below the cap`,
  );
  check(
    drift === 0,
    `the field is what \`prominenceField\` computes over these rows (ratio ${PROMINENCE_RATIO})`,
    drift === 0 ? `${places.length} rows in ${fieldMs} ms` : `${drift} differ — re-bake with \`pnpm places\`: ${driftExamples.join('; ')}`,
  );

  const shown = places.filter(isShown);
  // A band, because a re-bake of the gazetteer moves the count by a few,
  // and a third of the file is the claim.
  check(
    shown.length > 9_400 && shown.length < 10_100,
    `about a third of the places are built at ${PROMINENCE_RADIUS}u`,
    `${shown.length} of ${places.length} (${((100 * shown.length) / places.length).toFixed(1)}%)`,
  );
  const hiddenCapitals = places.filter((p) => p.capital && !isShown(p));
  check(hiddenCapitals.length === 0, 'no capital is hidden', hiddenCapitals.map((p) => p.name).join(', '));

  const builtIn = (lat0: number, lat1: number, lon0: number, lon1: number): string[] =>
    shown
      .filter((p) => p.lat >= lat0 && p.lat <= lat1 && p.lon >= lon0 && p.lon <= lon1)
      .map((p) => p.name)
      .sort();
  const mallorca = builtIn(39.25, 39.98, 2.28, 3.5);
  const menorca = builtIn(39.8, 40.1, 3.75, 4.35);
  const ibiza = builtIn(38.6, 39.13, 1.2, 1.65);
  check(
    mallorca.length === 1 && mallorca[0] === 'Palma',
    'Mallorca builds Palma and nothing else',
    `${mallorca.join(', ')} of ${places.filter((p) => p.lat >= 39.25 && p.lat <= 39.98 && p.lon >= 2.28 && p.lon <= 3.5).length} places`,
  );
  check(
    menorca.length === 2 && menorca.includes('Ciutadella') && menorca.includes('Maó'),
    'Menorca keeps its twins, Ciutadella and Maó',
    menorca.join(', '),
  );
  check(ibiza.length === 1 && ibiza[0] === 'Ibiza', 'Ibiza builds Ibiza', ibiza.join(', '));

  const named = (name: string, iso: string): Place | undefined =>
    places.find((p) => p.name === name && p.iso === iso);
  const bothBuilt = (a: [string, string], b: [string, string]): boolean => {
    const p = named(...a);
    const q = named(...b);
    return p !== undefined && q !== undefined && isShown(p) && isShown(q);
  };
  check(
    bothBuilt(['Amsterdam', 'NLD'], ['Rotterdam', 'NLD']),
    'Amsterdam and Rotterdam are both built, at any radius',
    `ratio ${PROMINENCE_RATIO} keeps a pair at 1.17`,
  );
  check(
    bothBuilt(['Leeds', 'GBR'], ['Sheffield', 'GBR']) && bothBuilt(['Liverpool', 'GBR'], ['Manchester', 'GBR']),
    'peer cities stand together: Leeds and Sheffield, Liverpool and Manchester',
  );
  const manacor = named('Manacor', 'ESP');
  check(
    manacor !== undefined && !isShown(manacor) && manacor.prominence < PROMINENCE_RADIUS,
    'Manacor is hidden by Palma',
    manacor === undefined ? 'Manacor is not in places.bin' : `${manacor.prominence}u from a place at ${PROMINENCE_RATIO}x its rank`,
  );
}
