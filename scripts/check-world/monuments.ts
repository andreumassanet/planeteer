/**
 * The placed monuments against the bake, the model files and the towns.
 *
 * `build-monuments.ts` already snapped them; this guards against the data
 * moving underneath them later (re-baked outlines, a changed model, a source
 * edit never re-baked).
 */
import { at, check, here } from './harness.ts';
import type { PlacedMonument, WorldContext } from './context.ts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { isShown, radiusOf } from '../../src/places.ts';
import { placeDirection, APPROACH, landmarkTakes } from '../../src/roads.ts';
import { MAX_FOOTPRINT, createContext } from '../../src/monuments/contract.ts';
import { LANDMARK_KEEP, planReach, planShape } from '../../src/landmark-ground.ts';
import { mergeMeshes } from '../../src/merge.ts';
import { fightsIn } from '../z-fight.ts';
import { isModelFile, loadMonumentModels, modelDir } from './monument-models.ts';
import { checkCoastClearance, checkLevelGround } from './monument-ground.ts';
import { checkMonumentsAtNight } from './monument-night.ts';

/** How far `build-monuments.ts`'s seat pass may walk a landmark: its `SEAT_REACH`. */
const SEAT_REACH = 160;

/**
 * Two faces closer than this to one plane z-fight. A monument is seen from
 * further than a house: with a near plane of about 1.8 units, a 24-bit depth
 * buffer's step at 1,250 units is about 0.05. `PROUD` in
 * `monuments/contract.ts` is the step that clears it.
 */
const MONUMENT_COPLANAR = 0.05;
/** Tapers and struts are not exactly parallel to what they meet. */
const MONUMENT_PARALLEL = 1e-4;

export async function checkMonuments(ctx: WorldContext): Promise<void> {
  const { world, placed } = ctx;
  if (placed.length === 0) {
    console.log('\nmonuments: not built yet (run `pnpm monuments`)');
    return;
  }
  console.log('\nmonuments');
  const monuments = placed;
  let wrong = 0;
  const offenders: string[] = [];
  for (const m of monuments) {
    const id = world.countryAt(m.lat, m.lon);
    const iso = id > 0 ? world.countries[id - 1]!.iso : 'SEA';
    if (iso !== m.iso) {
      wrong++;
      if (offenders.length < 5) offenders.push(`${m.id} -> ${iso}, wanted ${m.iso}`);
    }
  }
  check(
    wrong === 0,
    `all ${monuments.length} monuments on land in their own country`,
    offenders.join('; '),
  );

  checkSourceBaked(monuments);
  checkSeparation(monuments);
  await checkPlans(monuments);
  checkLevelGround(ctx);
  checkCoastClearance(ctx);
  checkGatesKept(ctx);
  await checkMonumentsAtNight(ctx);
}

/**
 * `monuments.json` is `monuments.source.json`, baked: the same landmarks in
 * the same order with the same name, country, height, year, note and shore
 * and plaza flags, and each placed coordinate no further from its source than
 * its recorded snap plus what the bake's separation and seat pass may ask
 * (`CLEARANCE` and `SEAT_REACH` in `build-monuments.ts`).
 */
function checkSourceBaked(monuments: PlacedMonument[]): void {
  const sourceFile = JSON.parse(readFileSync(resolve(here, 'monuments.source.json'), 'utf8')) as {
    monuments: { id: string; name: string; iso: string; lat: number; lon: number; height?: number; year?: number }[];
    notes?: Record<string, string>;
    shore?: string[];
    plazas?: string[];
  };
  const shoreList = new Set(sourceFile.shore ?? []);
  const plazaList = new Set(sourceFile.plazas ?? []);
  const sourceList = sourceFile.monuments;
  const stale: string[] = [];
  if (sourceList.length !== monuments.length) stale.push(`${sourceList.length} in the source, ${monuments.length} placed`);
  const KM_PER_UNIT = 6371 / PLANET_RADIUS;
  let furthest = 0;
  let furthestId = '';
  sourceList.forEach((want, i) => {
    const got = monuments[i];
    if (got === undefined || got.id !== want.id) {
      stale.push(`row ${i} is ${got?.id ?? 'missing'}, the source says ${want.id}`);
      return;
    }
    for (const key of ['name', 'iso', 'height', 'year'] as const) {
      if (got[key] !== want[key]) stale.push(`${want.id} ${key} ${String(got[key])} vs ${String(want[key])}`);
    }
    if ((got.shore === true) !== shoreList.has(want.id)) stale.push(`${want.id} shore ${String(got.shore)} vs the source's list`);
    if ((got.setting !== undefined) !== plazaList.has(want.id)) stale.push(`${want.id} setting ${String(got.setting)} vs the source's plazas`);
    // The card's sentence rides the same bake.
    const note = sourceFile.notes?.[want.id];
    if ((got as { note?: string }).note !== note) stale.push(`${want.id} note differs from the source`);
    if (note === undefined) stale.push(`${want.id} has no note in the source`);
    const km = (at(want.lat, want.lon).angleTo(at(got.lat, got.lon)) * PLANET_RADIUS) * KM_PER_UNIT;
    const spread = km - (got.snappedKm ?? 0);
    const reach = ((got.footprint ?? MAX_FOOTPRINT) + MAX_FOOTPRINT + 12 + SEAT_REACH) * KM_PER_UNIT;
    if (spread > reach) stale.push(`${want.id} is ${km.toFixed(1)} km from its source, ${(got.snappedKm ?? 0).toFixed(1)} of it snapped`);
    if (spread > furthest) {
      furthest = spread;
      furthestId = want.id;
    }
  });
  check(
    stale.length === 0,
    'monuments.json is the source, baked',
    stale.length > 0 ? stale.slice(0, 5).join('; ') : `furthest moved past its snap: ${furthestId}, ${furthest.toFixed(1)} km`,
  );
}

/**
 * No two monuments overlap by the footprints their model files declare, and
 * each placement carries its model's footprint (what the pad is cut with and
 * the bake separated by). Either failing means the bake is stale.
 */
function checkSeparation(monuments: PlacedMonument[]): void {
  const declared = new Map<string, number>();
  for (const file of existsSync(modelDir) ? readdirSync(modelDir) : []) {
    if (!isModelFile(file)) continue;
    const text = readFileSync(resolve(modelDir, file), 'utf8');
    const id = text.match(/\bid\s*:\s*'([^']+)'/)?.[1];
    const footprint = text.match(/\bfootprint\s*:\s*([\d.]+)/)?.[1];
    if (id !== undefined && footprint !== undefined) declared.set(id, Number(footprint));
  }
  const overlaps: string[] = [];
  for (let i = 0; i < monuments.length; i++) {
    for (let j = i + 1; j < monuments.length; j++) {
      const a = monuments[i]!;
      const b = monuments[j]!;
      const gap = at(a.lat, a.lon).angleTo(at(b.lat, b.lon)) * PLANET_RADIUS;
      const need = (declared.get(a.id) ?? MAX_FOOTPRINT) + (declared.get(b.id) ?? MAX_FOOTPRINT);
      if (gap < need) overlaps.push(`${a.id}/${b.id} ${gap.toFixed(0)} < ${need.toFixed(0)}`);
    }
  }
  check(
    overlaps.length === 0,
    'no two monuments stand inside each other',
    overlaps.length > 0 ? `${overlaps.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : '',
  );

  const wrongFootprint: string[] = [];
  for (const m of monuments) {
    const want = declared.get(m.id) ?? MAX_FOOTPRINT;
    if (Math.abs((m.footprint ?? MAX_FOOTPRINT) - want) > 1e-6) {
      wrongFootprint.push(`${m.id} ${m.footprint ?? 'absent'} vs ${want}`);
    }
  }
  check(
    wrongFootprint.length === 0,
    'every placement carries its model\'s footprint',
    wrongFootprint.length > 0 ? `${wrongFootprint.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : '',
  );
}

/**
 * Each model, built and merged, against its baked plan (the vertex box
 * rounded out to half a unit: what the pad is cut to and the towns and roads
 * keep off), and against z-fighting: no two faces of different colours in
 * one plane (`fightsIn`, the kit's rule).
 */
async function checkPlans(monuments: PlacedMonument[]): Promise<void> {
  const modelContext = createContext();
  const wrongPlan: string[] = [];
  const fighting: string[] = [];
  let measured = 0;
  for (const model of await loadMonumentModels()) {
    const position = mergeMeshes(model.build(modelContext)).position;
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
    const want = [Math.floor(x0 * 2) / 2, Math.ceil(x1 * 2) / 2, Math.floor(z0 * 2) / 2, Math.ceil(z1 * 2) / 2];
    const got = monuments.find((m) => m.id === model.id)?.plan;
    measured++;
    if (got === undefined || got.some((v, i) => v !== want[i])) wrongPlan.push(`${model.id} ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
    const fought = fightsIn(model.build(modelContext), { coplanar: MONUMENT_COPLANAR, parallel: MONUMENT_PARALLEL });
    if (fought.length > 0) {
      fought.sort((a, b) => b.exposed - a.exposed);
      const worst = fought[0]!;
      fighting.push(`${model.id} (${fought.length}: ${worst.exposed.toFixed(2)} u² at y ${worst.y.toFixed(1)}, ${worst.a} against ${worst.b})`);
    }
  }
  check(
    wrongPlan.length === 0 && measured > 0,
    `every placement carries its model's plan`,
    wrongPlan.length > 0 ? `${wrongPlan.slice(0, 3).join('; ')} — run \`pnpm monuments\`` : `${measured} models built and measured`,
  );
  check(
    fighting.length === 0 && measured > 0,
    'no monument draws two colours in one plane',
    fighting.length > 0 ? `${fighting.length} of ${measured}:\n      ${fighting.join('\n      ')}` : `${measured} models`,
  );
}

/**
 * No landmark takes more than half a town's gates. A gate under a landmark is
 * shut (`gateUnderLandmark`), and the bake moves a landmark that would take
 * too many (`landmarkTakes`); every built town near every landmark is asked
 * again.
 */
function checkGatesKept(ctx: WorldContext): void {
  const { placed: monuments, placesRaw } = ctx;
  const takers: string[] = [];
  let asked = 0;
  let partly = 0;
  for (const m of monuments) {
    const shape = planShape(m);
    const up = at(m.lat, m.lon).normalize();
    for (const place of placesRaw) {
      if (!isShown(place)) continue;
      const reach = radiusOf(place) + planReach(shape) + APPROACH + LANDMARK_KEEP;
      if (placeDirection(place, new Vector3()).angleTo(up) * PLANET_RADIUS > reach) continue;
      asked++;
      const taken = landmarkTakes(place, up, shape);
      if (taken.gates.length > 0) partly++;
      if (taken.gates.length * 2 > taken.of) takers.push(`${m.id} takes ${taken.gates.length} of ${place.name}'s ${taken.of} gates`);
    }
  }
  check(
    takers.length === 0,
    'no landmark takes more than half a town\'s gates',
    takers.length > 0 ? `${takers.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : `${asked} towns near a landmark, ${partly} with a gate under one`,
  );
}

/**
 * The model files agree with `monuments.source.json` on each monument's
 * coordinate, country and height (`realHeight`, which the card reads).
 *
 * The files are read as text, field by field; a field the scan cannot find
 * fails the check rather than passing silently, and so does a scan that
 * compared nothing.
 */
export function checkMonumentModels(): void {
  const monumentDir = resolve(here, '../src/monuments');
  if (!existsSync(monumentDir)) return;
  console.log('\nmonument models');
  const source = JSON.parse(readFileSync(resolve(here, 'monuments.source.json'), 'utf8')) as {
    monuments: { id: string; iso: string; lat: number; lon: number }[];
  };
  const byId = new Map(source.monuments.map((m) => [m.id, m]));
  const sourceHeight = new Map(
    (JSON.parse(readFileSync(resolve(here, 'monuments.source.json'), 'utf8')) as {
      monuments: { id: string; height?: number }[];
    }).monuments.map((m) => [m.id, m.height]),
  );
  const field = (text: string, name: string): string | null =>
    text.match(new RegExp(`\\b${name}\\s*:\\s*(-?[\\d.]+|'[^']*')`))?.[1] ?? null;

  const drifted: string[] = [];
  const unchecked: string[] = [];
  const orphans: string[] = [];
  let compared = 0;

  for (const file of readdirSync(monumentDir)) {
    if (!isModelFile(file)) continue;
    const text = readFileSync(resolve(monumentDir, file), 'utf8');
    const id = field(text, 'id')?.replace(/'/g, '');
    if (id === undefined || id === null) {
      unchecked.push(file);
      continue;
    }
    const placement = byId.get(id);
    if (placement === undefined) {
      orphans.push(`${file} builds '${id}', which is not in monuments.source.json`);
      continue;
    }
    const lat = field(text, 'lat');
    const lon = field(text, 'lon');
    const iso = field(text, 'iso')?.replace(/'/g, '');
    if (lat === null || lon === null || iso === undefined || iso === null) {
      unchecked.push(file);
      continue;
    }
    compared++;
    if (Math.abs(Number(lat) - placement.lat) > 1e-6) drifted.push(`${id} lat ${lat} vs ${placement.lat}`);
    if (Math.abs(Number(lon) - placement.lon) > 1e-6) drifted.push(`${id} lon ${lon} vs ${placement.lon}`);
    if (iso !== placement.iso) drifted.push(`${id} iso ${iso} vs ${placement.iso}`);
    const realHeight = field(text, 'realHeight');
    const height = sourceHeight.get(id);
    if ((realHeight === null ? undefined : Number(realHeight)) !== height) {
      drifted.push(`${id} realHeight ${realHeight ?? 'none'} vs height ${height ?? 'none'}`);
    }
  }

  check(
    drifted.length === 0 && compared > 0 && unchecked.length === 0,
    `${compared} model files match the placement data`,
    [...drifted, ...(unchecked.length > 0 ? [`could not scan: ${unchecked.join(', ')}`] : [])].join('; '),
  );
  check(orphans.length === 0, 'every model has a placement', orphans.join('; '));
}
