/**
 * **More towns than anybody wrote by hand.** A world's file names its
 * capitals and its landmarks' towns — a couple of dozen — and a planet with a
 * couple of dozen towns on it is a planet nobody lives on: from the air the
 * map was empty between them, and a road from one to the next would have been
 * a thousand kilometres long. So every nation is filled out with towns of its
 * own, as Earth's countries are with theirs: more in a big nation than in a
 * small one, most of them small, a few of them cities.
 *
 * Pure and deterministic — a function of the body's id, its nations and the
 * towns its file names — so every visitor walks the same towns, the menu
 * lists them, the map draws them and the passport stamps them. A grown town
 * keeps clear of every other by the two levelled pads and a road's length
 * (`ROAD_ROOM`), stands in the nation `nationAt` says it does, and is named
 * in the world's own sound: syllables of its file's own town names, and a word
 * after them now and then.
 */

import type { Body, Nation, Settlement } from './contract.ts';
import { angularDistance, nationAt, surfaceRadiusOf, worldTownLaw } from './contract.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Rng } from '../scenery/random.ts';

/** Grown towns a square degree of nation, at the most, before the spacing says no. */
const PER_SQUARE_DEGREE = 0.012;
/** Never fewer than this in a nation, nor more than the second. */
const NATION_MIN = 3;
const NATION_MAX = 16;
/** What two towns keep between their levelled pads (each 1.5 of the built radius), units: room for a road and the land it crosses. */
const ROAD_ROOM = 180;
/** How far from a pole a town is grown, degrees: nobody builds on the axis. */
const POLE_CLEAR = 6;
/** Attempts at a town's site before the nation is called full. */
const TRIES = 60;

/** The words a grown town's name may end with, as the file's own names do. */
const SUFFIXES = ['Rise', 'Hollow', 'Reach', 'Landing', 'Crossing', 'Wells', 'Station', 'Fold', 'Ridge', 'Basin', 'Gate', 'Field', 'Spur', 'Haven', 'Point', 'Terrace'];

/** What a grown town is built from: what a body file has before its towns are grown. */
export interface Unpopulated {
  id: string;
  radiusKm: number;
  nations: readonly Nation[];
  settlements: readonly Settlement[];
}

/** The syllables of a world's own town names: what a grown name is spoken in. */
function syllablesOf(names: readonly string[]): string[] {
  const out = new Set<string>();
  for (const name of names) {
    for (const word of name.split(/[\s-]+/)) {
      if (word.length < 3 || SUFFIXES.includes(word)) continue;
      // Consonants then vowels: the cut a speaker would make.
      const parts = word.toLowerCase().match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy](?![aeiouy]))?/g) ?? [];
      for (const part of parts) if (part.length >= 2 && part.length <= 4) out.add(part);
    }
  }
  const list = [...out];
  return list.length >= 6 ? list : [...list, 'ka', 'ro', 'vel', 'an', 'thi', 'mor', 'sa', 'lun'];
}

function nameOf(rng: Rng, syllables: readonly string[], taken: Set<string>): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const count = rng.chance(0.55) ? 2 : 3;
    let word = '';
    let last = '';
    for (let k = 0; k < count; k++) {
      // Never the same syllable twice running: "Cricri" is a stammer.
      let next = rng.pick(syllables);
      for (let again = 0; next === last && again < 4; again++) next = rng.pick(syllables);
      word += next;
      last = next;
    }
    word = word.replace(/(.)\1\1+/g, '$1$1');
    if (word.length < 4 || word.length > 11) continue;
    const head = word[0]!.toUpperCase() + word.slice(1);
    const name = rng.chance(0.38) ? `${head} ${rng.pick(SUFFIXES)}` : head;
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
  const fallback = `${rng.pick(syllables)}${taken.size}`;
  taken.add(fallback);
  return fallback[0]!.toUpperCase() + fallback.slice(1);
}

/** A grown town's population: most small, a few big — a long tail, as towns are everywhere. */
function populationOf(rng: Rng, nationTop: number): number {
  const u = rng.unit();
  // Log-uniform under the nation's own capital, weighted to the small end.
  const low = Math.log(9000);
  const high = Math.log(Math.max(30000, nationTop * 0.8));
  return Math.round(Math.exp(low + (high - low) * Math.pow(u, 1.5)) / 100) * 100;
}

/**
 * The body's towns: the ones its file names, then the grown ones, nation by
 * nation. Call it where the body's `settlements` are set, once.
 */
export function grownTowns(body: Unpopulated): Settlement[] {
  const named = [...body.settlements];
  if (body.nations.length === 0 || named.length === 0) return named;
  const perDegree = (surfaceRadiusOf(body.radiusKm) * Math.PI) / 180;
  const syllables = syllablesOf(named.map((one) => one.name));
  const taken = new Set(named.map((one) => one.name));
  const all: Settlement[] = [...named];
  const fakeBody = { ...body, settlements: named } as unknown as Body;
  const fits = (lat: number, lon: number, population: number): boolean => {
    const r = worldTownLaw(population) * 1.5;
    for (const other of all) {
      const apart = angularDistance(lat, lon, other.lat, other.lon) * perDegree;
      if (apart < r + worldTownLaw(other.population) * 1.5 + ROAD_ROOM) return false;
    }
    return true;
  };
  for (const nation of body.nations) {
    const rng = rngFrom('system', body.id, 'towns', nation.id);
    const area = Math.PI * nation.radius * nation.radius;
    const want = Math.max(NATION_MIN, Math.min(NATION_MAX, Math.round(area * PER_SQUARE_DEGREE)));
    const top = Math.max(20000, ...named.filter((one) => one.nation === nation.id).map((one) => one.population));
    let made = 0;
    for (let attempt = 0; attempt < want * TRIES && made < want; attempt++) {
      // Uniform over the nation's cap.
      const d = nation.radius * Math.sqrt(rng.unit());
      const bearing = rng.range(0, Math.PI * 2);
      const lat0 = (nation.lat * Math.PI) / 180;
      const lon0 = (nation.lon * Math.PI) / 180;
      const delta = (d * Math.PI) / 180;
      const lat = Math.asin(Math.sin(lat0) * Math.cos(delta) + Math.cos(lat0) * Math.sin(delta) * Math.cos(bearing));
      const lon = lon0 + Math.atan2(Math.sin(bearing) * Math.sin(delta) * Math.cos(lat0), Math.cos(delta) - Math.sin(lat0) * Math.sin(lat));
      const latDeg = (lat * 180) / Math.PI;
      let lonDeg = (lon * 180) / Math.PI;
      lonDeg = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
      if (Math.abs(latDeg) > 90 - POLE_CLEAR) continue;
      // In the nation the map says it is in, which is the smallest cap round it.
      if (nationAt(fakeBody, latDeg, lonDeg)?.id !== nation.id) continue;
      const population = populationOf(rng, top);
      if (!fits(latDeg, lonDeg, population)) continue;
      const lat2 = Math.round(latDeg * 100) / 100;
      const lon2 = Math.round(lonDeg * 100) / 100;
      all.push({
        id: `${nation.id}-town-${made}`,
        name: nameOf(rng, syllables, taken),
        lat: lat2,
        lon: lon2,
        population,
        nation: nation.id,
        grown: true,
      });
      made++;
    }
  }
  return all;
}
