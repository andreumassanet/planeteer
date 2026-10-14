import { world, places, roads, monuments, check } from './setup.ts';
import { plannedSite } from '../../src/landmark-ground.ts';
import { createSiteIndex, type FleetSite } from '../../src/fleet.ts';
import { isShown } from '../../src/places.ts';
import { CRAFT_KINDS } from '../../src/craft/contract.ts';
import { unitAt, latOf, lonOf } from '../../src/sphere.ts';
import { Vector3 } from 'three';
import { PLANET_RADIUS, groundRadius } from '../../src/globe.ts';
import { townOf, townOffset, type CoursePath, coursePath, courseOf } from '../../src/roads.ts';

// --- the sites, twice ----------------------------------------------------------

export const source = { world, places, roads, monuments };
export const monumentPlans = monuments.map(plannedSite);
let began = performance.now();
export const sites = createSiteIndex(source).all();
const firstMs = performance.now() - began;
began = performance.now();
const again = createSiteIndex(source).all();
const secondMs = performance.now() - began;

export const byKind = new Map<string, FleetSite[]>();
for (const site of sites) {
  let list = byKind.get(site.kind);
  if (list === undefined) byKind.set(site.kind, (list = []));
  list.push(site);
}
const shownCount = places.filter(isShown).length;
console.log('sites:');
for (const kind of CRAFT_KINDS) console.log(`  ${kind.padEnd(10)} ${byKind.get(kind)?.length ?? 0}`);
console.log(`  ${'total'.padEnd(8)} ${sites.length} over ${shownCount} built towns, ${Math.round(firstMs)} ms (again ${Math.round(secondMs)} ms)\n`);

console.log('determinism:');
const same =
  sites.length === again.length &&
  sites.every((site, i) => {
    const other = again[i]!;
    return site.id === other.id && site.at.equals(other.at) && site.forward.equals(other.forward);
  });
check(same, 'two builds give the same ids, positions and headings, bit for bit');
// And one town at a time, out of order, is the same as the whole planet in order.
const lazy = createSiteIndex(source);
const probeTowns = [...new Set(sites.map((site) => site.place))].filter((_, i) => i % 97 === 0).reverse();
const lazyOk = probeTowns.every((p) => {
  const mine = lazy.sitesOf(p);
  const theirs = sites.filter((site) => site.place === p);
  return mine.length === theirs.length && mine.every((site, i) => site.id === theirs[i]!.id && site.at.equals(theirs[i]!.at));
});
check(lazyOk, `a town's sites do not depend on which towns were asked first (${probeTowns.length} towns, backwards)`);
// And a warm-up in pieces — one stand of one town's search a call, as a frame
// hands it out — leaves the same strips behind as asking outright: the plane
// towns round three crowded places, warmed first and then read.
{
  const warm = createSiteIndex(source);
  const around = ['Shanghai', 'Wuhan', 'Delhi'].map((name) => places.findIndex((place) => place.name === name)).filter((p) => p >= 0);
  let calls = 0;
  for (const p of around) {
    const at = unitAt(places[p]!.lat, places[p]!.lon, new Vector3());
    for (let n = 0; ; ) {
      calls++;
      if (warm.warm(at, 1200, () => n++ % 2 === 0)) break;
    }
  }
  const warmedPlanes = sites.filter((site) => site.kind === 'plane' && around.some((p) => unitAt(places[p]!.lat, places[p]!.lon, new Vector3()).angleTo(unitAt(places[site.place]!.lat, places[site.place]!.lon, new Vector3())) * PLANET_RADIUS < 1200));
  const warmOk = warmedPlanes.every((site) => {
    const mine = warm.sitesOf(site.place).find((entry) => entry.id === site.id);
    return mine !== undefined && mine.at.equals(site.at) && mine.forward.equals(site.forward);
  });
  const extra = around.flatMap((p) => warm.planesNear(unitAt(places[p]!.lat, places[p]!.lon, new Vector3()), 300, [])).filter((site) => !sites.some((other) => other.id === site.id));
  check(warmOk && extra.length === 0 && warmedPlanes.length > 0, 'a warm-up in pieces leaves the same strips as asking outright', `${warmedPlanes.length} strips round ${around.length} cities, ${calls} calls`);
}
const ids = new Set(sites.map((site) => site.id));
check(ids.size === sites.length, 'ids are unique', `${ids.size} of ${sites.length}`);
const idForm = sites.every((site) => site.id === `${site.model}:${site.place}:${site.id.split(':')[2]}` && /^\d+$/.test(site.id.split(':')[2]!));
check(idForm, 'every id is <model>:<placeIndex>:<n>');
check(sites.every((site) => isShown(places[site.place]!)), 'every vehicle belongs to a built town');
check(sites.every((site) => lazy.byId(site.id)?.at.equals(site.at) === true), 'every id finds its own site again');

// --- an independent index of the built towns ------------------------------------

export const shown = places.map((place, i) => ({ place, i, at: unitAt(place.lat, place.lon, new Vector3()) })).filter((t) => isShown(t.place));
const buckets = new Map<string, typeof shown>();
const key = (lat: number, lon: number): string => `${Math.floor(lat)}:${Math.floor(lon)}`;
for (const town of shown) {
  const k = key(town.place.lat, town.place.lon);
  let list = buckets.get(k);
  if (list === undefined) buckets.set(k, (list = []));
  list.push(town);
}
export function townsAround(at: Vector3): typeof shown {
  const lat = latOf(at.y);
  const lon = lonOf(at.x, at.z);
  const out: typeof shown = [];
  const spanLon = Math.min(180, Math.ceil(2 / Math.max(0.05, Math.cos((lat * Math.PI) / 180))));
  for (let a = Math.floor(lat) - 2; a <= Math.floor(lat) + 2; a++) {
    for (let b = Math.floor(lon) - spanLon; b <= Math.floor(lon) + spanLon; b++) {
      const wrapped = ((b + 180) % 360 + 360) % 360 - 180;
      out.push(...(buckets.get(`${a}:${wrapped}`) ?? []));
    }
  }
  return out;
}
const offset = { x: 0, z: 0 };
export function insideSquare(at: Vector3, margin: number): string | null {
  for (const town of townsAround(at)) {
    const frame = townOf(town.place);
    if (at.dot(frame.up) <= 0) continue;
    townOffset(frame, at, offset);
    const half = frame.grid.half + margin;
    if (Math.abs(offset.x) < half && Math.abs(offset.z) < half) return town.place.name;
  }
  return null;
}
const paths = new Map<number, CoursePath>();
export const pathOf = (r: number): CoursePath => {
  let path = paths.get(r);
  if (path === undefined) paths.set(r, (path = coursePath(courseOf(roads[r]!, places))));
  return path;
};
export const units = (a: Vector3, b: Vector3): number => a.angleTo(b) * PLANET_RADIUS;
export const point = new Vector3();
export const ground = (at: Vector3): number => groundRadius(world, point.copy(at).multiplyScalar(PLANET_RADIUS));
