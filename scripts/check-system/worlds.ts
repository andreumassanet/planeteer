import { bodies, moons, speciesById } from './scale.ts';
import { validateBody, type GroundSample } from '../../src/system/contract.ts';
import { fail, DEG } from './setup.ts';
import { WALKABLE, buildGeography, oklabOf, POLITICAL_CONTRAST, solarDayHours, localHour } from '../../src/system/geography.ts';
import { TIME_SCALE } from '../time-scale.ts';
import { unitAt, latLonOf } from '../../src/sphere.ts';

// --- the countries and the cities -----------------------------------------

console.log('\n\n=== the worlds ===\n');
for (const body of [...bodies, ...moons]) {
  for (const problem of validateBody(body)) fail(`${body.id}: ${problem}`);
  if (body.kind !== 'moon' && body.species !== null && !speciesById.has(body.species)) {
    fail(`${body.id} names species '${body.species}' and no file declares it`);
  }
  const inhabited = body.nations.length > 0;
  console.log(
    `  ${body.name.padEnd(10)} ${body.kind.padEnd(6)} ${body.nations.length} countries, ${body.settlements.length} cities, ` +
      `${body.ground === null ? 'no ground model' : `${Object.keys(body.ground.biomes).length} biomes on ${body.ground.secondAxis}`}` +
      `${body.species === null ? ', nobody lives there' : `, ${body.species}`}`,
  );
  // A country with no city in it is a pin on a map that leads to nothing —
  // exactly what a monument row with no model file is, and the bake places
  // those happily.
  if (inhabited) {
    for (const nation of body.nations) {
      if (!body.settlements.some((s) => s.nation === nation.id)) {
        fail(`${body.id}: '${nation.id}' has no city in it — a name on the map that leads nowhere`);
      }
    }
  }
  // Every city resolving to the country it declares is `validateBody`'s job and
  // it is done above — through the smallest-containing-cap rule rather than
  // through the name, so an enclave resolves the way Lesotho does.
}

// --- the ground models ----------------------------------------------------

/**
 * Named places against the biome the ground model gives them.
 *
 * This is `check-world.ts`'s 25-Terran-places assertion, one planet over, and
 * the reason it can exist at all is that **every coordinate in `mars.ts` is a
 * real one.** Olympus Mons is where Olympus Mons is, Syrtis Major is the dark
 * patch Huygens drew in 1659, and a reader can check this table against an
 * atlas. On a body with invented coordinates there would be nothing to check.
 */
const GROUND_EXPECTED: Record<string, [string, number, number, string][]> = {
  mercury: [
    // The two cold traps and the two hot poles: the four places on Mercury that
    // are what they are for a reason anyone can state, and the only four on the
    // planet whose ground a model this crude has any business predicting.
    ['north cold trap', 89, 0, 'ice'],
    ['south cold trap', -89, 180, 'ice'],
    ['hot pole, lon 0', 0, 0, 'slag'],
    ['hot pole, lon 180', 0, 180, 'slag'],
    ['warm pole, lon 90', 0, 90, 'regolith'],
    ['Caloris Planitia', 30.5, 170.2, 'ash'],
    ['Caloris Montes', 30.5, 155, 'scarp'],
    ['Rembrandt', -32.9, 87.9, 'ash'],
    ['Beagle Rupes', -2.1, 101.2, 'scarp'],
  ],
  venus: [
    // Maxwell is the highest ground on the planet and the metal frost is on it;
    // Alpha Regio is the type locality for tessera, the deformed highland
    // Venera radar found and nobody has a good explanation for; Atla is one of
    // the two places most likely to be erupting now.
    ['Maxwell Montes', 65.2, 3.3, 'frost'],
    ['Alpha Regio', -25.5, 4.5, 'tessera'],
    ['Lakshmi Planum', 68.6, -20.7, 'tessera'],
    ['Atla Regio', 0.9, -165.5, 'sulphur'],
    ['Atalanta Planitia', 46, 166, 'crust'],
    ['Diana Chasma', -14.7, 156, 'plain'],
    ['Guinevere Planitia', 22, -35, 'crust'],
  ],
  neptune: [
    // 1989 coordinates, which is when anything was last seen here. The Great
    // Dark Spot was gone by 1994 and the point of putting it in a check is
    // that the model reproduces the *Voyager* map, which is the only map there
    // is.
    ['Great Dark Spot', -22, 15, 'storm'],
    ['Scooter', -42, -60, 'cirrus'],
    ['South Polar Collar', -80, 0, 'collar'],
    ['North Polar Collar', 80, 180, 'collar'],
    ['the equatorial jet', 0, 150, 'storm'],
    ['the northern band', 40, -140, 'deck'],
  ],
  mars: [
    ['Olympus Mons summit', 18.65, -133.8, 'rock'],
    ['Ascraeus Mons', 11.8, -104.5, 'rock'],
    ['Elysium Mons', 25.02, 147.2, 'lava'],
    ['Syrtis Major', 8.4, 69.5, 'basalt'],
    ['Meridiani Planum', 0, 0, 'basalt'],
    ['Acidalia Planitia', 46.7, -22, 'basalt'],
    ['Terra Sirenum', -35, -155, 'basalt'],
    ['Arabia Terra', 21, 6, 'dust'],
    ['Amazonis Planitia', 24.8, -164, 'dust'],
    ['Hellas Planitia', -42.4, 70.5, 'dust'],
    ['Argyre Planitia', -49.7, -44, 'dust'],
    ['Valles Marineris', -13.4, -61, 'chasma'],
    ['Planum Boreum', 88, 0, 'ice'],
    ['Planum Australe', -87, 160, 'ice'],
    ['Vastitas Borealis', 70, 120, 'frost'],
  ],
};

console.log('\n  the ground, at named places:');
const sample: GroundSample = { id: '', warmth: 0, second: 0, elevation: 0 };
for (const body of [...bodies, ...moons]) {
  if (body.ground === null) continue;
  const expected = GROUND_EXPECTED[body.id];
  console.log(`\n    ${body.name} — warmth against ${body.ground.secondAxis}`);
  const places =
    expected ??
    // No table for this world: sample it on a spiral instead, so the check at
    // least says the classifier reaches more than one answer. A body whose
    // whole surface is one biome is the flat world all over again.
    Array.from({ length: 24 }, (_, i) => {
      const lat = (Math.asin(1 - (2 * (i + 0.5)) / 24) * 180) / Math.PI;
      const lon = (((i * 2.399963) % (2 * Math.PI)) * 180) / Math.PI - 180;
      return [`${lat.toFixed(0)},${lon.toFixed(0)}`, lat, lon, ''] as [string, number, number, string];
    });
  const seen = new Set<string>();
  for (const [name, lat, lon, want] of places) {
    const elevation = body.ground.relief(lat, lon);
    body.ground.at(lat, lon, elevation, sample);
    seen.add(sample.id);
    if (want === '') continue;
    const ok = sample.id === want;
    if (!ok) fail(`${body.id}: ${name} comes out ${sample.id} and should be ${want}`);
    console.log(
      `      ${ok ? ' ' : '!'} ${name.padEnd(22)} elev ${elevation.toFixed(0).padStart(5)}` +
        `  warmth ${sample.warmth.toFixed(2)}  ${body.ground.secondAxis} ${sample.second.toFixed(2)}   ${sample.id}`,
    );
  }
  if (expected === undefined) {
    console.log(`      ${seen.size} of ${Object.keys(body.ground.biomes).length} biomes reached over 24 spiral samples: ${[...seen].sort().join(', ')}`);
  }
  if (seen.size < 3) fail(`${body.id}'s ground model reaches only ${seen.size} biome(s) — the world is one texture`);
}

// --- the political map ----------------------------------------------------

/**
 * The outlines `geography.ts` draws from the caps, held to the truth they
 * were drawn from.
 *
 * Every assertion here is a way the shared map, the HUD and the passport
 * could be wrong on another world while looking right: a town that reports
 * its neighbour's country, a ring wound the wrong way round (the land on the
 * left, which `geo.ts`'s shore and wall code would read inside out), a
 * frontier drawn twice in different places so a sliver belongs to both or to
 * neither, ground that is nobody's, a ring so wide the lon/lat ray casting is
 * no longer a fair question. And the time, because the menu waits on it.
 */
console.log('\n  the political map, from the caps:');
console.log('    body        nations  towns  rings  frontiers   points    ms   off truth  near a frontier');
{
  const walkable = WALKABLE.map((one) => one.id);
  const expected = [...bodies, ...moons].filter((one) => one.ground !== null && one.nations.length > 0).map((one) => one.id);
  for (const id of expected) if (!walkable.includes(id)) fail(`${id} can be walked and is not in geography.ts's WALKABLE`);
  // Warm the code once, so the first body is not timed compiling it.
  buildGeography(WALKABLE[0]!);
  // Mars has two hundred towns and the map's places and outlines grow with
  // them. The menu makes every world's map while the title is up
  // (`Menu.prepare`), so a click never waits on it.
  const BUDGET_MS = 220 * TIME_SCALE;
  const SAMPLES = 10000;
  const NEAR = 0.6;
  let state = 0x9e3779b9;
  const random = (): number => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 2 ** 32;
  };
  for (const body of WALKABLE) {
    if (body.nations.length < 6 || body.nations.length > 15) {
      fail(`${body.id} has ${body.nations.length} nations — a world's map wants six to fifteen`);
    }
    const t0 = performance.now();
    const geo = buildGeography(body);
    const ms = performance.now() - t0;
    if (ms > BUDGET_MS) fail(`${body.id}'s map took ${ms.toFixed(0)} ms against ${BUDGET_MS}`);

    // Determinism: a second build is the same map to the last digit.
    const again = buildGeography(body);
    if (JSON.stringify(again.countries) !== JSON.stringify(geo.countries)) fail(`${body.id}: two builds of the map differ`);

    // Whose ground the named places are.
    geo.places.forEach((place) => {
      const want = geo.countries.findIndex((country) => country.iso === place.iso) + 1;
      const got = geo.world.countryAt(place.lat, place.lon);
      if (got !== want) fail(`${body.id}: ${place.name} stands in ${geo.countries[got - 1]?.name ?? 'nothing'}, not ${geo.countries[want - 1]?.name}`);
    });
    geo.countries.forEach((country, i) => {
      const got = geo.world.countryAt(country.lat, country.lon);
      if (got !== i + 1) fail(`${body.id}: ${country.name}'s label point is in ${geo.countries[got - 1]?.name ?? 'nothing'}`);
      if (country.rings.length === 0) fail(`${body.id}: ${country.name} has no ground at all`);
      if (country.iso !== `${body.id}:${body.nations[i]!.id}`) fail(`${body.id}: ${country.name} is keyed '${country.iso}'`);
    });
    // The political colours: no two nations that share a frontier alike.
    for (const frontier of geo.frontiers) {
      const one = geo.countries[frontier.left - 1]!;
      const two = geo.countries[frontier.right - 1]!;
      const a = oklabOf(one.color!);
      const b = oklabOf(two.color!);
      const apart = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (apart < POLITICAL_CONTRAST) fail(`${body.id}: ${one.name} and ${two.name} touch and are ${apart.toFixed(3)} apart in colour, under ${POLITICAL_CONTRAST}`);
    }
    for (const nation of body.nations) {
      const capitals = geo.places.filter((place) => place.iso === `${body.id}:${nation.id}` && place.capital === true);
      if (capitals.length !== 1) fail(`${body.id}: ${nation.name} has ${capitals.length} capitals`);
    }

    // The rings: wound with the land on the right, inside one tile, and every
    // frontier step shared by exactly two rings, once each way.
    const seen = new Map<string, number>();
    const step = (a: number[], b: number[]): string => `${a[0]},${a[1]}>${b[0]},${b[1]}`;
    let ringCount = 0;
    let points = 0;
    for (const country of geo.countries) {
      for (const ring of country.rings) {
        ringCount++;
        points += ring.length;
        let area = 0;
        let minLon = Infinity;
        let maxLon = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          area += a[0]! * b[1]! - b[0]! * a[1]!;
          minLon = Math.min(minLon, a[0]!);
          maxLon = Math.max(maxLon, a[0]!);
          minLat = Math.min(minLat, a[1]!);
          maxLat = Math.max(maxLat, a[1]!);
          const key = step(a, b);
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
        if (area >= 0) fail(`${body.id}: a ring of ${country.name} is wound with the land on its left`);
        if (maxLon - minLon > 90 || maxLat - minLat > 90) {
          fail(`${body.id}: a ring of ${country.name} spans ${(maxLon - minLon).toFixed(1)} by ${(maxLat - minLat).toFixed(1)} degrees`);
        }
      }
    }
    let unmatched = 0;
    for (const [key, count] of seen) {
      if (count !== 1) {
        fail(`${body.id}: the step ${key} is in ${count} rings the same way round`);
        continue;
      }
      const [from, to] = key.split('>') as [string, string];
      const [lon0, lat0] = from.split(',').map(Number) as [number, number];
      const [lon1, lat1] = to.split(',').map(Number) as [number, number];
      // The pole and the seam are the edge of the map, not a frontier: nothing
      // lies past them to share the step with.
      const pole = Math.abs(lat0) === 90 && lat0 === lat1;
      const seam = Math.abs(lon0) === 180 && lon0 === lon1;
      if (!pole && !seam && seen.get(`${to}>${from}`) !== 1) unmatched++;
    }
    if (unmatched > 0) fail(`${body.id}: ${unmatched} ring steps have no neighbour running them the other way`);

    // Random ground: always someone's, and the rings' answer the truth's
    // except within half a degree of a frontier.
    let off = 0;
    let offAway = 0;
    let nobody = 0;
    const unit = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < SAMPLES; k++) {
      const lat = Math.asin(2 * random() - 1) / DEG;
      const lon = random() * 360 - 180;
      const got = geo.world.countryAt(lat, lon);
      if (got === 0) nobody++;
      const truth = geo.truthAt(lat, lon);
      if (got === truth) continue;
      off++;
      // Is a frontier within NEAR degrees? Look round the point at that distance.
      let border = false;
      for (let a = 0; a < 16 && !border; a++) {
        const bearing = (a / 16) * 2 * Math.PI;
        const lat2 = Math.asin(Math.sin(lat * DEG) * Math.cos(NEAR * DEG) + Math.cos(lat * DEG) * Math.sin(NEAR * DEG) * Math.cos(bearing));
        const lon2 = lon * DEG + Math.atan2(Math.sin(bearing) * Math.sin(NEAR * DEG) * Math.cos(lat * DEG), Math.cos(NEAR * DEG) - Math.sin(lat * DEG) * Math.sin(lat2));
        unitAt(lat2 / DEG, lon2 / DEG, unit);
        const there = latLonOf(unit);
        if (geo.truthAt(there.lat, there.lon) !== truth) border = true;
      }
      if (!border) offAway++;
    }
    if (nobody > 0) fail(`${body.id}: ${nobody} of ${SAMPLES} random points are nobody's ground`);
    if (off > SAMPLES / 100) fail(`${body.id}: the rings disagree with the truth at ${off} of ${SAMPLES} points`);
    if (offAway > 0) fail(`${body.id}: ${offAway} points disagree with the truth more than ${NEAR} degrees from any frontier`);
    console.log(
      `    ${body.id.padEnd(10)} ${String(body.nations.length).padStart(7)} ${String(geo.places.length).padStart(6)} ${String(ringCount).padStart(6)}` +
        ` ${String(geo.frontiers.length).padStart(10)} ${String(points).padStart(8)} ${ms.toFixed(0).padStart(5)}` +
        ` ${(off / (SAMPLES / 100)).toFixed(2).padStart(9)}%  ${offAway === 0 ? 'all of them' : `${offAway} not`}`,
    );
  }
}

// --- the local clock ------------------------------------------------------

/**
 * `localHour` against the sky's own construction from the other side: on a
 * world that turns, the hour at a longitude runs through half a day in half
 * a solar day, and on a body that turns backwards the afternoon is west of the
 * Sun. A locked Moon's hour moves with the date by one lunar day.
 */
console.log('\n  the local clock:');
{
  const when = new Date(Date.UTC(2026, 0, 1, 0));
  for (const body of WALKABLE) {
    const day = solarDayHours(body);
    const h0 = localHour(body, 0, when);
    const later = new Date(when.getTime() + (day / 2) * 3600000);
    const h1 = localHour(body, 0, later);
    const advance = (((h1 - h0) % 24) + 24) % 24;
    // Half a solar day later the clock has gone round twelve hours. Half and
    // not a quarter: Mercury's Sun stops and runs backwards near perihelion,
    // so its clock keeps the mean hour only over whole orbits, and half its
    // solar day is one of them.
    if (Math.abs(advance - 12) > 0.25) fail(`${body.id}: half a solar day moved the clock ${advance.toFixed(2)} h`);
    // Fifteen degrees east is an hour later where the world turns eastward
    // and an hour earlier where it turns backwards.
    const east = (((localHour(body, 15, when) - h0) % 24) + 24) % 24;
    const want = body.rotationHours < 0 ? 23 : 1;
    if (Math.abs(east - want) > 1e-6) fail(`${body.id}: fifteen degrees east is ${east.toFixed(3)} h on, not ${want}`);
    console.log(`    ${body.id.padEnd(9)} solar day ${day.toFixed(1).padStart(8)} h   at lon 0: ${h0.toFixed(2).padStart(5)} h, half a day on ${h1.toFixed(2).padStart(5)} h`);
  }
}
