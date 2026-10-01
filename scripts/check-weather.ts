/**
 * The weather, headless: the model, not the picture.
 *
 * `weather.ts` is a pure function of a place and an instant, and everything
 * that can go wrong with one is invisible in a screenshot and obvious in a
 * table: two clients disagreeing about the same storm, rain that jumps on as
 * you take a step, a Sahara that drizzles every afternoon, snow at twenty
 * degrees, a snowline that puts the Alps under ice to their feet or leaves the
 * Himalaya bare. So this loads the real world — the coast field, the biomes,
 * the relief — and asks the model the questions an atlas can answer, then
 * holds the drawing's two pieces of arithmetic to their contracts: every drop
 * stays inside the box round the camera, and every face of a lightning bolt
 * faces out, because its ink is a back-face hull. And the light shafts, which
 * the weather gates: none at night, under a bank, from orbit or under the sea,
 * no pop anywhere in a real day, and the sun put on the screen where it is.
 *
 *   node scripts/check-weather.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BufferAttribute, BufferGeometry, Quaternion, Vector3 } from 'three';
import { loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, lyingSnowAt } from '../src/globe.ts';
import { decodeLakes, inflate } from '../src/pack.ts';
import { reliefAt, setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { biomeAt, biomeSample, continentalityAt } from '../src/biome.ts';
import { THRESHOLD, coverageAt, deckTurn } from '../src/clouds.ts';
import { unitAt } from '../src/sphere.ts';
import { STRIKE_CELL, STRIKE_ODDS, STRIKE_SLOT_MS, seasonOf, strikeCandidate, weatherAt, weatherSample } from '../src/weather.ts';
import type { Strike, WeatherSample } from '../src/weather.ts';
import { BOLT_VERTICES, MAX_DROPS, RAIN_BOX, SNOW_BOX, dropGeometry, dropOffset, writeBolt } from '../src/weather-view.ts';
import { Fog, PerspectiveCamera, Scene, Vector2 } from 'three';
import { SKY_DISTANCE, createSky } from '../src/sun.ts';
import { SHAFT_FLOOR, SHAFT_SKY, shaftStrength, sunOnScreen } from '../src/shafts.ts';
import type { ShaftInput } from '../src/shafts.ts';
import { TIME_SCALE } from './time-scale.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// The relief without the towns' valleys or the monuments' pads: the weather
// reads the height only for its lapse, and a valley is a few degrees at most.
setFlattenSites([]);
setDetailSites([]);
const world = await loadWorld(UNITS_PER_DEGREE, decodeLakes(await inflate(lakes)));

const unit = { x: 0, y: 0, z: 0 };
const elevationAt = (lat: number, lon: number): number => {
  unitAt(lat, lon, unit);
  return Math.max(0, reliefAt(unit.x, unit.y, unit.z));
};
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const YEAR0 = Date.UTC(2026, 0, 1);
/** Mid-month of the year 2026, as an instant. */
const month = (m: number): number => Date.UTC(2026, m, 15);

const a = weatherSample();
const b = weatherSample();

console.log('determinism');
{
  // The same question twice, and once more after a thousand others: nothing in
  // the model may remember what it was asked last.
  let differ = 0;
  const places: [number, number][] = [[51.5, -0.1], [19, 72.9], [-3, -60], [55.7, 37.6], [35.7, 139.7]];
  for (const [lat, lon] of places) {
    for (let h = 0; h < 48; h += 5) {
      const t = month(6) + h * HOUR;
      weatherAt(lat, lon, elevationAt(lat, lon), t, a);
      for (let i = 0; i < 50; i++) weatherAt(-lat, lon + i, 10, t + i * 777, b);
      weatherAt(lat, lon, elevationAt(lat, lon), t, b);
      if (JSON.stringify(a) !== JSON.stringify(b)) differ++;
    }
  }
  check(differ === 0, 'the same place and instant give the same weather, whatever was asked between', `${differ} differ`);

  const s: Strike = { lat: 0, lon: 0, at: 0, seed: 0 };
  const t: Strike = { lat: 0, lon: 0, at: 0, seed: 0 };
  let strikeDiffer = 0;
  for (let i = 0; i < 500; i++) {
    const r1 = strikeCandidate(i % 37, -i % 91, 1_000_000 + i, s);
    const r2 = strikeCandidate(i % 37, -i % 91, 1_000_000 + i, t);
    if (r1 !== r2 || JSON.stringify(s) !== JSON.stringify(t)) strikeDiffer++;
    const slot = 1_000_000 + i;
    if (s.at < slot * STRIKE_SLOT_MS || s.at >= (slot + 1) * STRIKE_SLOT_MS) strikeDiffer++;
  }
  check(strikeDiffer === 0, 'a strike is a pure function of its cell and its slot, and falls inside its slot');
}

console.log('\ncontinuity');
{
  // A step and a tick: 0.004 degrees is 1.1 units, a third of a person, and a
  // second is four of the view's samples. Neither may move the rain by more
  // than a sliver or the temperature by more than a tenth of a degree. (The
  // deck drifts 1.5 units a second at the equator, so a second of time is a
  // step and a half of space; ten seconds move a bank's edge by a quarter.)
  let worstStep = 0;
  let worstTick = 0;
  let worstTemp = 0;
  let worstCover = 0;
  for (let i = 0; i < 3000; i++) {
    const lat = Math.asin(2 * ((i * 0.618034) % 1) - 1) * (180 / Math.PI) * 0.95;
    const lon = ((i * 0.7548776) % 1) * 360 - 180;
    const t = YEAR0 + ((i * 0.3819) % 1) * 365 * DAY;
    const e = elevationAt(lat, lon);
    weatherAt(lat, lon, e, t, a);
    weatherAt(lat + 0.004, lon, e, t, b);
    worstStep = Math.max(worstStep, Math.abs(a.precipitation - b.precipitation));
    worstCover = Math.max(worstCover, Math.abs(a.cover - b.cover));
    weatherAt(lat, lon, e, t + 1000, b);
    worstTick = Math.max(worstTick, Math.abs(a.precipitation - b.precipitation));
    worstTemp = Math.max(worstTemp, Math.abs(a.temperatureC - b.temperatureC));
  }
  check(worstStep < 0.08, 'a step moves the rain by a sliver', `worst ${worstStep.toFixed(3)} over 3,000 places`);
  check(worstCover < 0.15, 'and the cloud overhead', `worst ${worstCover.toFixed(3)}`);
  check(worstTick < 0.05, 'a second moves the rain by a sliver', `worst ${worstTick.toFixed(3)}`);
  check(worstTemp < 0.1, 'and the temperature by under a tenth of a degree', `worst ${worstTemp.toFixed(3)} C`);
}

console.log('\nthe clouds are the weather');
{
  // Where it rains there is a bank overhead in the deck as drawn: the deck's
  // field at the point turned back through the deck's own turn.
  const turn = new Quaternion();
  const d = new Vector3();
  let rainWithout = 0;
  let rained = 0;
  for (let i = 0; i < 6000; i++) {
    const lat = Math.asin(2 * ((i * 0.618034) % 1) - 1) * (180 / Math.PI);
    const lon = ((i * 0.7548776) % 1) * 360 - 180;
    const t = YEAR0 + ((i * 0.2718) % 1) * 365 * DAY;
    weatherAt(lat, lon, 0, t, a);
    if (a.precipitation <= 0) continue;
    rained++;
    unitAt(lat, lon, d);
    deckTurn(t, turn);
    d.applyQuaternion(turn.invert());
    if (coverageAt(d.x, d.y, d.z) <= THRESHOLD) rainWithout++;
  }
  check(rained > 0 && rainWithout === 0, 'it rains only under a bank of the drawn deck', `${rained} raining, ${rainWithout} under open sky`);
}

/** Share of three-hourly samples over a year that are each kind, at a place. */
function climate(lat: number, lon: number, months: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
  const e = elevationAt(lat, lon);
  let n = 0;
  let wet = 0;
  let snow = 0;
  let storm = 0;
  let fog = 0;
  let snowWarm = 0;
  let temperature = 0;
  for (const m of months) {
    const start = Date.UTC(2026, m, 1);
    for (let h = 0; h < 30 * 24; h += 3) {
      weatherAt(lat, lon, e, start + h * HOUR, a);
      n++;
      temperature += a.temperatureC;
      if (a.kind === 'rain' || a.kind === 'drizzle' || a.kind === 'storm' || a.kind === 'snow') wet++;
      if (a.kind === 'snow') {
        snow++;
        if (a.temperatureC > 2) snowWarm++;
      }
      if (a.kind === 'storm') storm++;
      if (a.kind === 'fog') fog++;
    }
  }
  return { wet: wet / n, snow: snow / n, storm: storm / n, fog: fog / n, snowWarm, temperature: temperature / n };
}
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

console.log('\nclimate');
{
  const sahara = climate(25, 14);
  const london = climate(51.5, -0.1);
  const mumbaiWet = climate(19, 72.9, [5, 6, 7, 8]);
  const mumbaiDry = climate(19, 72.9, [11, 0, 1, 2]);
  const moscowWinter = climate(55.7, 37.6, [11, 0, 1]);
  const moscowSummer = climate(55.7, 37.6, [5, 6, 7]);
  const singapore = climate(1.3, 103.8);
  const sahel = [climate(13, 2, [6, 7, 8]), climate(13, 2, [0, 1, 2])];
  console.log(
    `  --   wet share: Sahara ${pct(sahara.wet)} · London ${pct(london.wet)} · Mumbai Jun-Sep ${pct(mumbaiWet.wet)}, Dec-Mar ${pct(mumbaiDry.wet)} · ` +
      `Moscow winter ${pct(moscowWinter.wet)} (snow ${pct(moscowWinter.snow)}) · Singapore ${pct(singapore.wet)} (storms ${pct(singapore.storm)})`,
  );
  check(sahara.wet < 0.03, 'the Sahara rarely rains', pct(sahara.wet));
  check(london.wet > 0.08, 'London often does', pct(london.wet));
  check(london.wet > sahara.wet * 8, 'London several times the Sahara');
  check(mumbaiWet.wet > mumbaiDry.wet * 3 && mumbaiWet.wet > 0.12, 'India has a monsoon: the wet season several times the dry', `${pct(mumbaiWet.wet)} against ${pct(mumbaiDry.wet)}`);
  check(sahel[0]!.wet > sahel[1]!.wet * 3, 'the Sahel rains in its summer and not its winter', `${pct(sahel[0]!.wet)} against ${pct(sahel[1]!.wet)}`);
  check(moscowWinter.snow > 0.05 && moscowWinter.snow > moscowWinter.wet * 0.7, 'Moscow’s winter falls as snow', `${pct(moscowWinter.snow)} of ${pct(moscowWinter.wet)}`);
  check(moscowSummer.snow === 0, 'and its summer never does');
  check(singapore.snow === 0 && sahara.snow === 0, 'no snow in Singapore or the Sahara');
  check(singapore.storm > 0.01, 'the tropics have their thunderstorms', pct(singapore.storm));
  check(moscowSummer.temperature > moscowWinter.temperature + 12, 'Moscow’s summer is warmer than its winter', `${moscowSummer.temperature.toFixed(1)} against ${moscowWinter.temperature.toFixed(1)} C`);

  // The morning mist: a common sight on a cool humid coast, never a desert's.
  const mornings = (lat: number, lon: number): number => {
    let n = 0;
    let fog = 0;
    for (let t = YEAR0; t < YEAR0 + 365 * DAY; t += HOUR) {
      const hour = (((t / HOUR + lon / 15) % 24) + 24) % 24;
      if (hour < 5 || hour > 9) continue;
      weatherAt(lat, lon, elevationAt(lat, lon), t, a);
      n++;
      if (a.kind === 'fog') fog++;
    }
    return fog / n;
  };
  const londonMist = mornings(51.5, -0.12);
  const saharaMist = mornings(25, 14);
  check(londonMist > 0.03 && londonMist < 0.25, 'London has its misty mornings', `${pct(londonMist)} of mornings`);
  check(saharaMist < 0.01, 'the Sahara has none', pct(saharaMist));

  // Snow only in the cold, over the whole planet and the whole year.
  let snowSamples = 0;
  let snowWarm = 0;
  let warmest = -Infinity;
  for (let i = 0; i < 20000; i++) {
    const lat = Math.asin(2 * ((i * 0.618034) % 1) - 1) * (180 / Math.PI);
    const lon = ((i * 0.7548776) % 1) * 360 - 180;
    const t = YEAR0 + ((i * 0.41421) % 1) * 365 * DAY;
    weatherAt(lat, lon, elevationAt(lat, lon), t, a);
    if (a.kind !== 'snow') continue;
    snowSamples++;
    warmest = Math.max(warmest, a.temperatureC);
    if (a.temperatureC > 1.5) snowWarm++;
  }
  check(snowSamples > 0 && snowWarm === 0, 'snow falls only at or below freezing', `${snowSamples} snowing, warmest ${warmest.toFixed(1)} C`);
}

console.log('\nthe snowline');
{
  const sample = biomeSample();
  const biomeOf = (lat: number, lon: number, elevation: number) => {
    unitAt(lat, lon, unit);
    return biomeAt(unit.x, unit.y, unit.z, lat, lon, elevation, sample);
  };
  /** The highest ground within `r` degrees of a point. */
  const summit = (lat: number, lon: number, r: number): { lat: number; lon: number; elevation: number } => {
    let best = { lat, lon, elevation: -Infinity };
    const step = r / 40;
    for (let dy = -r; dy <= r; dy += step) {
      for (let dx = -r; dx <= r; dx += step) {
        const e = elevationAt(lat + dy, lon + dx);
        if (e > best.elevation) best = { lat: lat + dy, lon: lon + dx, elevation: e };
      }
    }
    return best;
  };
  const snowlineOf = (lat: number, lon: number): number => {
    // The lowest height at which the biome is ice at this place.
    let low = 0;
    let high = 800;
    for (let i = 0; i < 30; i++) {
      const mid = (low + high) / 2;
      if (biomeOf(lat, lon, mid).id === 'ice') high = mid;
      else low = mid;
    }
    return high;
  };
  const tops: [string, number, number, number][] = [
    ['the Alps', 46.5, 9, 2],
    ['the Himalaya', 29, 84, 5],
    ['the Andes', -20, -70, 14],
    ['the Rockies', 45, -113, 10],
  ];
  const white: string[] = [];
  let bare = 0;
  for (const [name, lat, lon, r] of tops) {
    const top = summit(lat, lon, r);
    const id = biomeOf(top.lat, top.lon, top.elevation).id;
    white.push(`${name} ${id} at ${Math.round(top.elevation)}u`);
    if (id !== 'ice') bare++;
  }
  check(bare === 0, 'the highest ground of the great ranges is snow', white.join(' · '));
  const lines = [['equator', -1, -78], ['Himalaya', 28, 86.9], ['Rockies', 45, -113], ['Alps', 46, 9], ['Scandes', 64, 13]] as const;
  const heights = lines.map(([, lat, lon]) => snowlineOf(lat, lon));
  console.log(`  --   snowline, units (metres): ${lines.map(([name], i) => `${name} ${Math.round(heights[i]!)} (${Math.round((heights[i]! * 8000) / 680)})`).join(' · ')}`);
  // The dry subtropics hold the highest line on Earth, the Himalaya's above
  // the wet equator's; past them it falls toward the pole.
  check(
    Math.min(heights[0]!, heights[1]!) > heights[2]! && heights[2]! > heights[4]! && heights[3]! > heights[4]!,
    'the snowline falls from the tropics to the pole',
  );
  check(biomeOf(46, 9, 40).id !== 'ice' && biomeOf(-1, -78, 200).id !== 'ice', 'and a valley under it is not snow');
  check(biomeOf(73, 100, 10).id === 'tundra', 'northern Siberia thaws in summer and stays tundra');
  check(biomeOf(74, -40, 60).id === 'ice' && biomeOf(-78, 30, 60).id === 'ice', 'Greenland and Antarctica are ice');
}

console.log('\nlying snow');
{
  const lie = (lat: number, lon: number, m: number): number =>
    lyingSnowAt(lat, elevationAt(lat, lon), continentalityAt(lat, lon), seasonOf(month(m)));
  const cases: [string, number, boolean][] = [
    ['Moscow in January', lie(55.7, 37.6, 0), true],
    ['Winnipeg in January', lie(49.9, -97.1, 0), true],
    ['Moscow in July', lie(55.7, 37.6, 6), false],
    ['London in January', lie(51.5, -0.1, 0), false],
    ['Madrid in January', lie(40.4, -3.7, 0), false],
    ['Sydney in July', lie(-33.9, 151.2, 6), false],
    ['Singapore', lie(1.3, 103.8, 0), false],
  ];
  const wrong = cases.filter(([, value, want]) => (want ? value < 0.7 : value > 0.2));
  console.log(`  --   ${cases.map(([name, value]) => `${name} ${value.toFixed(2)}`).join(' · ')}`);
  check(wrong.length === 0, 'the winter lies where it should and nowhere else', wrong.map(([name]) => name).join(', '));
}

console.log('\nlightning');
{
  // A year of stormy afternoons, found by asking: how often a strike lands
  // within reach of somebody standing under a storm, and never in a clear sky.
  const strike: Strike = { lat: 0, lon: 0, at: 0, seed: 0 };
  let underStorm = 0;
  let strikesNear = 0;
  let clearSlots = 0;
  let strikesClear = 0;
  const probe: WeatherSample = weatherSample();
  for (let i = 0; i < 4000 && underStorm < 40; i++) {
    const lat = ((i * 0.618034) % 1) * 40 - 20;
    const lon = ((i * 0.7548776) % 1) * 360 - 180;
    if (world.countryAt(lat, lon) === 0) continue;
    const t = YEAR0 + ((i * 0.3819) % 1) * 365 * DAY;
    weatherAt(lat, lon, elevationAt(lat, lon), t, a);
    const stormy = a.storm > 0.5;
    const clear = a.cover < 0.05;
    if (!stormy && !(clear && clearSlots < 40)) continue;
    // Thirty slots — a minute — of the nine cells round the point.
    let count = 0;
    const row0 = Math.floor(lat / STRIKE_CELL);
    const col0 = Math.floor(lon / STRIKE_CELL);
    for (let s = 0; s < 30; s++) {
      const slot = Math.floor(t / STRIKE_SLOT_MS) + s;
      for (let r = row0 - 1; r <= row0 + 1; r++) {
        for (let c = col0 - 1; c <= col0 + 1; c++) {
          const roll = strikeCandidate(r, c, slot, strike);
          if (roll >= STRIKE_ODDS) continue;
          weatherAt(strike.lat, strike.lon, elevationAt(strike.lat, strike.lon), strike.at, probe);
          if (roll < STRIKE_ODDS * probe.storm) count++;
        }
      }
    }
    if (stormy) {
      underStorm++;
      strikesNear += count;
    } else {
      clearSlots++;
      // A strike nine cells round a clear point is somebody else's storm; one
      // in the point's own cell is not allowed.
      for (let s = 0; s < 30; s++) {
        const slot = Math.floor(t / STRIKE_SLOT_MS) + s;
        const roll = strikeCandidate(row0, col0, slot, strike);
        weatherAt(strike.lat, strike.lon, elevationAt(strike.lat, strike.lon), strike.at, probe);
        if (roll < STRIKE_ODDS * probe.storm && Math.hypot(strike.lat - lat, strike.lon - lon) < 0.2) strikesClear++;
      }
    }
  }
  const perMinute = underStorm > 0 ? strikesNear / underStorm : 0;
  check(underStorm >= 10, 'storms are found in the tropics', `${underStorm} places`);
  check(perMinute > 0.5 && perMinute < 30, 'under a storm the sky strikes a few times a minute', `${perMinute.toFixed(1)} a minute within ${Math.round(STRIKE_CELL * 1.5 * UNITS_PER_DEGREE)} units`);
  check(strikesClear === 0, 'and never beside you out of a clear sky', `${strikesClear} over ${clearSlots} clear places`);
}

console.log('\nthe drawing');
{
  const geometry = dropGeometry();
  const seeds = geometry.getAttribute('seed') as BufferAttribute;
  const index = geometry.getIndex()!;
  check(seeds.count === MAX_DROPS * 4 && index.count === MAX_DROPS * 6, 'one quad a drop', `${MAX_DROPS} drops`);
  // The volume: every seed, under any shift and fall, lands inside the box.
  let outside = 0;
  const out = [0, 0, 0];
  const seed = [0, 0, 0, 0];
  for (const box of [RAIN_BOX, SNOW_BOX]) {
    for (let trial = 0; trial < 20; trial++) {
      const shift = [((trial * 7.3) % 1) * box, ((trial * 3.1) % 1) * box, ((trial * 5.7) % 1) * box];
      const layer = ((trial * 0.37) % 1) * box;
      for (let i = 0; i < seeds.count; i += 4) {
        seed[0] = seeds.getX(i);
        seed[1] = seeds.getY(i);
        seed[2] = seeds.getZ(i);
        seed[3] = seeds.getW(i);
        dropOffset(seed, shift, layer, box, out);
        if (Math.abs(out[0]!) > box / 2 + 1e-6 || Math.abs(out[1]!) > box / 2 + 1e-6 || Math.abs(out[2]!) > box / 2 + 1e-6) outside++;
      }
    }
  }
  check(outside === 0, 'every drop stays inside the box round the camera', `${outside} outside`);
  // A layer's wrap is invisible: a whole box, so the drop lands where it was.
  let seams = 0;
  const before = [0, 0, 0];
  for (let i = 0; i < seeds.count; i += 4 * 97) {
    seed[0] = seeds.getX(i);
    seed[1] = seeds.getY(i);
    seed[2] = seeds.getZ(i);
    seed[3] = seeds.getW(i);
    dropOffset(seed, [1, 2, 3], RAIN_BOX, RAIN_BOX, before);
    dropOffset(seed, [1, 2, 3], 0, RAIN_BOX, out);
    if (Math.hypot(before[0]! - out[0]!, before[1]! - out[1]!, before[2]! - out[2]!) > 1e-6) seams++;
  }
  check(seams === 0, 'the fall wraps a whole box, so the rain has no seam');

  // The bolt's faces all face out: its ink is a back-face hull.
  const positions = new Float32Array(BOLT_VERTICES * 3);
  let inward = 0;
  let quads = 0;
  const base = new Vector3();
  const up = new Vector3();
  const centre = new Vector3();
  const p0 = new Vector3();
  const p1 = new Vector3();
  const p2 = new Vector3();
  const n = new Vector3();
  const e1 = new Vector3();
  const e2 = new Vector3();
  for (let s = 0; s < 40; s++) {
    const lat = ((s * 0.618) % 1) * 160 - 80;
    const lon = ((s * 0.754) % 1) * 360 - 180;
    unitAt(lat, lon, up);
    base.copy(up).multiplyScalar(PLANET_RADIUS + 30);
    writeBolt(positions, base, up, 850, 4, (s * 0.37) % 1);
    // Every segment is 24 vertices, four quads round one axis.
    for (let seg = 0; seg < BOLT_VERTICES / 24; seg++) {
      centre.set(0, 0, 0);
      for (let v = 0; v < 24; v++) centre.add(p0.fromArray(positions, (seg * 24 + v) * 3));
      centre.multiplyScalar(1 / 24);
      for (let tri = 0; tri < 8; tri++) {
        const at = (seg * 24 + tri * 3) * 3;
        p0.fromArray(positions, at);
        p1.fromArray(positions, at + 3);
        p2.fromArray(positions, at + 6);
        n.crossVectors(e1.subVectors(p1, p0), e2.subVectors(p2, p0));
        const mid = p0.add(p1).add(p2).multiplyScalar(1 / 3);
        quads++;
        if (n.dot(mid.sub(centre)) <= 0) inward++;
      }
    }
  }
  check(inward === 0, 'every face of a bolt faces out', `${inward} of ${quads} triangles inward`);
  const bolt = new BufferGeometry();
  bolt.setAttribute('position', new BufferAttribute(positions, 3));
  bolt.computeBoundingSphere();
  check(Number.isFinite(bolt.boundingSphere!.radius) && bolt.boundingSphere!.radius < 1000, 'a bolt is the height of the cloud base, not a planet', `radius ${bolt.boundingSphere!.radius.toFixed(0)}`);
}

console.log('\nthe light through the air');
{
  // The shafts' strength is a product of fades (`shafts.ts`), and each has a
  // place where it must be nothing and a place where it must be whole.
  const clear: ShaftInput = { elevation: 3, overcast: 0, mist: 0, space: 0, underwater: false };
  const at = (change: Partial<ShaftInput>): number => shaftStrength({ ...clear, ...change });
  const none = [at({ elevation: -10 }), at({ overcast: 0.8 }), at({ overcast: 1 }), at({ space: 1 }), at({ underwater: true }), at({ mist: 1 })];
  check(none.every((s) => s === 0), 'no shafts at night, under a bank, in a fog, from orbit or under the sea', none.map((s) => s.toFixed(3)).join(' '));
  check(at({}) > 0.8, 'a clear sky and a sun three degrees up give them nearly all they have', at({}).toFixed(3));
  check(Math.abs(at({ elevation: 60 }) - SHAFT_FLOOR) < 1e-6, 'and a midday sun keeps a floor, the rays through a canopy looking up', at({ elevation: 60 }).toFixed(3));
  let rises = 0;
  for (let e = 2; e < 60; e += 0.1) if (at({ elevation: e + 0.1 }) > at({ elevation: e }) + 1e-9) rises++;
  for (let o = 0; o < 1; o += 0.01) if (at({ overcast: o + 0.01 }) > at({ overcast: o }) + 1e-9) rises++;
  check(rises === 0, 'they never grow as the sun climbs past two degrees or the sky greys', `${rises} steps up`);

  // A real day at Palma through `sun.ts` itself, in two-second steps: no step
  // moves the strength by a pop, at the terminator, at the mood keys or
  // anywhere else. The fastest fade there is the rise's, 0.0019 a step as the
  // sun sets through it at 11.6 degrees an hour, so 0.005 is a jump and not a
  // slope. Under a clear sky, because the weather's own steps are
  // the continuity section's and the view eases them on top — a raw rain
  // cell crossing Palma at 16:53 that day moves the rain by 0.04 in ten
  // seconds, which is the model's business and not the shafts'.
  const sky = createSky(new Scene(), new Fog(0xffffff, 1, 2));
  sky.setRate(0);
  const palma = unitAt(39.5696, 2.6502, new Vector3()).multiplyScalar(PLANET_RADIUS);
  const eye = palma.clone().setLength(PLANET_RADIUS + 15);
  const day = Date.UTC(2026, 8, 10, 4);
  let worst = 0;
  let worstAt = day;
  let previous = -1;
  let peak = 0;
  let aloft = 0;
  for (let t = day; t <= day + 16 * HOUR; t += 2000) {
    sky.setTime(t);
    sky.update(palma, eye, 15);
    const s = shaftStrength({ ...clear, elevation: sky.state.elevation, space: sky.state.space });
    if (sky.state.space !== 0) aloft++;
    if (previous >= 0 && Math.abs(s - previous) > worst) {
      worst = Math.abs(s - previous);
      worstAt = t;
    }
    previous = s;
    peak = Math.max(peak, s);
  }
  check(aloft === 0 && peak > 0.5, 'a day at Palma has its shafts, and the ground is not space', `peak ${peak.toFixed(3)}`);
  check(worst < 0.005, 'and no two seconds of it moves them by a pop', `worst ${worst.toFixed(4)} at ${new Date(worstAt).toISOString().slice(11, 19)}Z`);

  // The climb: `state.space` is the dome's own fade, none over the plane's
  // circuit and whole well under the ceiling. Past it there are no shafts, so
  // the furthest ground they can ever see is from there, over the limb, off
  // a summit behind it (peaks reach 620 units; a thousand is allowed).
  let top = 0;
  for (let h = 0; h <= PLANET_RADIUS; h += 50) {
    sky.update(palma, palma.clone().setLength(PLANET_RADIUS + h), h);
    if (h === 320 && sky.state.space !== 0) top = -1;
    if (sky.state.space >= 1 && top === 0) top = h;
  }
  const limb = (d: number, r: number): number => Math.sqrt(Math.max(0, d * d - r * r));
  const furthest = limb(PLANET_RADIUS + top, PLANET_RADIUS) + limb(PLANET_RADIUS + 1000, PLANET_RADIUS);
  // The sky test is a depth, so along the view axis: the discs at the corner
  // of the widest lens (60 degrees, 21:9) are nearest it.
  const corner = Math.atan(Math.tan(30 * (Math.PI / 180)) * Math.hypot(1, 21 / 9));
  check(top > 0 && furthest < SHAFT_SKY && SKY_DISTANCE * Math.cos(corner) > SHAFT_SKY,
    'the sky test passes the discs and the dome and nothing standing on the planet',
    `space whole at ${top} units up; furthest ground then ${furthest.toFixed(0)}, sky past ${SHAFT_SKY}, discs at least ${(SKY_DISTANCE * Math.cos(corner)).toFixed(0)}`);

  // The sun on the screen: centred when ahead, nowhere behind, and a sweep
  // across the frame's edge and round behind the camera never jumps.
  const uv = new Vector2();
  const lens = (fov: number): PerspectiveCamera => {
    const camera = new PerspectiveCamera(fov, 16 / 9, 0.5, 160_000);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
  };
  const ahead = sunOnScreen(lens(60), new Vector3(0, 0, -1), uv);
  check(ahead === 1 && Math.abs(uv.x - 0.5) < 1e-9 && Math.abs(uv.y - 0.5) < 1e-9, 'a sun straight ahead is the middle of the frame', `fade ${ahead}, uv ${uv.x.toFixed(3)} ${uv.y.toFixed(3)}`);
  check(sunOnScreen(lens(60), new Vector3(0, 0, 1), uv) === 0, 'and a sun behind the camera is none of it');
  let jump = 0;
  let slide = 0;
  let behind = 0;
  const dir = new Vector3();
  const last = new Vector2();
  for (const fov of [45, 60]) {
    const camera = lens(fov);
    for (const across of [true, false]) {
      let before = 1;
      for (let deg = 0; deg <= 180; deg += 0.1) {
        const r = deg * (Math.PI / 180);
        if (across) dir.set(Math.sin(r), 0, -Math.cos(r));
        else dir.set(0, Math.sin(r), -Math.cos(r));
        const fade = sunOnScreen(camera, dir, uv);
        jump = Math.max(jump, Math.abs(fade - before));
        if (fade > 0 && before > 0 && deg > 0) slide = Math.max(slide, uv.distanceTo(last));
        if (deg >= 90 && fade !== 0) behind++;
        before = fade;
        last.copy(uv);
      }
    }
  }
  check(jump < 0.02 && slide < 0.01 && behind === 0, 'sweeping the sun off the frame and round behind it never jumps',
    `worst fade step ${jump.toFixed(4)} and uv step ${slide.toFixed(4)} per 0.1 degree, ${behind} lit from behind`);
}

console.log('\ncost');
{
  const began = performance.now();
  let calls = 0;
  for (let i = 0; i < 20000; i++) {
    const lat = ((i * 0.618034) % 1) * 170 - 85;
    const lon = ((i * 0.7548776) % 1) * 360 - 180;
    weatherAt(lat, lon, 50, YEAR0 + i * 60_000, a);
    calls++;
  }
  const us = ((performance.now() - began) * 1000) / calls;
  check(us < 40 * TIME_SCALE, 'a sample costs microseconds; the world asks four a second', `${us.toFixed(1)} us`);
}

console.log(failures === 0 ? '\nweather: all good' : `\nweather: ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
