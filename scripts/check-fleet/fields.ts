import { type Slope, gradeAt } from '../../src/terrain.ts';
import { byKind, point, units, pathOf, ground, townsAround, monumentPlans, shown, sites } from './sites.ts';
import { Vector3 } from 'three';
import { roads, places, check } from './setup.ts';
import { unitAt } from '../../src/sphere.ts';
import { distanceToPath, SITE_ROOM, stripPoint, STRIP_LENGTH, STRIP_BACK, STRIP_HALF, stripKeepouts, type FleetSite, STRIP_DRAWN } from '../../src/fleet.ts';
import { roadClearance } from '../../src/roads.ts';
import { isWater } from '../../src/vehicles.ts';
import { north, across } from './cars.ts';
import { radiusOf } from '../../src/places.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { siteGap } from '../../src/landmark-ground.ts';
import { onStrip } from '../../src/craft/airstrip.ts';

// --- fields -------------------------------------------------------------------------

export const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
function fieldCheck(kind: 'plane' | 'balloon' | 'horse' | 'tractor' | 'helicopter', reach: number, grade: number): void {
  const list = byKind.get(kind) ?? [];
  let wet = 0;
  let steep = 0;
  let nearTown = 0;
  let nearRoad = 0;
  let nearMonument = 0;
  const roadIndexNear = (at: Vector3): number => {
    let best = Infinity;
    for (let r = 0; r < roads.length; r++) {
      const road = roads[r]!;
      const a = places[road.a]!;
      const b = places[road.b]!;
      // Cheap reject on the two ends: no course strays a thousand units off both.
      const ea = unitAt(a.lat, a.lon, point);
      if (units(ea, at) > 1400) {
        const eb = unitAt(b.lat, b.lon, point);
        if (units(eb, at) > 1400) continue;
      }
      best = Math.min(best, distanceToPath(pathOf(r), at) - roadClearance(road.cls));
    }
    return best;
  };
  for (const site of list) {
    if (isWater(ground(site.at))) wet++;
    north.set(0, 1, 0).projectOnPlane(site.at).normalize();
    across.crossVectors(site.at, north).normalize();
    if (gradeAt(site.at, across, north, reach, slope).grade > grade) steep++;
    for (const town of townsAround(site.at)) {
      if (units(town.at, site.at) < radiusOf(town.place) + reach) {
        nearTown++;
        break;
      }
    }
    if (roadIndexNear(site.at) < reach) nearRoad++;
    // Off each landmark's plan, which is what the sites keep clear of.
    for (const m of monumentPlans) {
      if (m.up.x * site.at.x + m.up.y * site.at.y + m.up.z * site.at.z < Math.cos((m.reach + reach + 1) / PLANET_RADIUS)) continue;
      if (siteGap(m, point.copy(site.at).normalize(), PLANET_RADIUS) < reach) {
        nearMonument++;
        break;
      }
    }
  }
  check(wet === 0, `every ${kind} stands on land`, `${wet} of ${list.length} do not`);
  check(steep === 0, `every ${kind}'s field is flatter than ${((Math.atan(grade) * 180) / Math.PI).toFixed(0)} degrees`, `${steep}`);
  check(nearTown === 0, `no ${kind} stands in a town`, `${nearTown}`);
  check(nearRoad === 0, `no ${kind} stands on a road`, `${nearRoad}`);
  check(nearMonument === 0, `no ${kind} stands on a landmark`, `${nearMonument}`);
}
console.log('\nlight aircraft:');
fieldCheck('plane', SITE_ROOM.plane, Math.tan((8 * Math.PI) / 180));
const bigTowns = shown.filter((t) => t.place.pop >= 400_000 || t.place.capital === true).length;
console.log(`       ${byKind.get('plane')?.length ?? 0} of the ${bigTowns} towns over 400,000 or capitals found a field`);

// --- airstrips ----------------------------------------------------------------------
//
// Every plane stands at the near end of a strip it can take off down. This walks
// each strip at half the search's spacing, on its centre line and both edges,
// with its own town, road and landmark tests: no water, no town, no road, no
// landmark on it, and nowhere steeper than a plane may be set down on. The
// search's own law is 8 degrees over the strip's width at its own samples; in
// between, the check allows the landing grade, 12.

console.log('\nairstrips:');
{
  const planes = byKind.get('plane') ?? [];
  const STEP = 10;
  const edge = new Vector3();
  const across = new Vector3();
  const landing = Math.tan((12 * Math.PI) / 180);
  let wetStrips = 0;
  let steepStrips = 0;
  let townStrips = 0;
  let roadStrips = 0;
  let monumentStrips = 0;
  let worstGrade = 0;
  const bad: string[] = [];
  const nearRoads = (at: Vector3, clear: number): boolean => {
    for (let r = 0; r < roads.length; r++) {
      const road = roads[r]!;
      const a = places[road.a]!;
      const b = places[road.b]!;
      const ea = unitAt(a.lat, a.lon, point);
      if (units(ea, at) > 1400) {
        const eb = unitAt(b.lat, b.lon, point);
        if (units(eb, at) > 1400) continue;
      }
      if (distanceToPath(pathOf(r), at) < roadClearance(road.cls) + clear) return true;
    }
    return false;
  };
  for (const site of planes) {
    let wetHere = false;
    let steepHere = false;
    let townHere = false;
    let roadHere = false;
    let monumentHere = false;
    across.crossVectors(site.forward, site.at).normalize();
    const mid = stripPoint(site, STRIP_LENGTH / 2, 0, new Vector3());
    const towns = townsAround(mid);
    for (let along = -STRIP_BACK; along <= STRIP_LENGTH + 1e-6; along += STEP) {
      const centre = stripPoint(site, along, 0, new Vector3());
      for (const lateral of [-STRIP_HALF, 0, STRIP_HALF]) {
        if (isWater(ground(stripPoint(site, along, lateral, edge)))) wetHere = true;
      }
      const grade = gradeAt(centre, across, site.forward, STRIP_HALF, slope).grade;
      worstGrade = Math.max(worstGrade, grade);
      if (grade > landing) steepHere = true;
      for (const town of towns) if (units(town.at, centre) < radiusOf(town.place) + STRIP_HALF) townHere = true;
      if (!roadHere && nearRoads(centre, STRIP_HALF)) roadHere = true;
      for (const m of monumentPlans) {
        if (m.up.x * centre.x + m.up.y * centre.y + m.up.z * centre.z < Math.cos((m.reach + STRIP_HALF + 1) / PLANET_RADIUS)) continue;
        if (siteGap(m, point.copy(centre).normalize(), PLANET_RADIUS) < STRIP_HALF) monumentHere = true;
      }
    }
    if (wetHere) wetStrips++;
    if (steepHere) steepStrips++;
    if (townHere) townStrips++;
    if (roadHere) roadStrips++;
    if (monumentHere) monumentStrips++;
    if ((wetHere || steepHere || townHere || roadHere || monumentHere) && bad.length < 5) {
      bad.push(`${site.id}${wetHere ? ' wet' : ''}${steepHere ? ' steep' : ''}${townHere ? ' town' : ''}${roadHere ? ' road' : ''}${monumentHere ? ' landmark' : ''}`);
    }
  }
  check(wetStrips === 0, 'no airstrip crosses water, edge to edge', `${wetStrips} of ${planes.length}; ${bad.join(', ')}`);
  check(townStrips === 0, 'no airstrip crosses a town', `${townStrips}`);
  check(roadStrips === 0, 'no airstrip crosses a road', `${roadStrips}`);
  check(monumentStrips === 0, 'no airstrip crosses a landmark', `${monumentStrips}`);
  check(steepStrips === 0, 'no airstrip is steeper than a landing anywhere along it', `${steepStrips}; the steepest ${((Math.atan(worstGrade) * 180) / Math.PI).toFixed(1)} degrees`);
  // The discs the wood keeps off cover the whole strip.
  let uncovered = 0;
  for (const site of planes.filter((_, i) => i % 10 === 0)) {
    const discs = stripKeepouts(site);
    for (let along = -STRIP_BACK; along <= STRIP_LENGTH + 1e-6; along += 5) {
      for (const lateral of [-STRIP_HALF, -STRIP_HALF / 2, 0, STRIP_HALF / 2, STRIP_HALF]) {
        stripPoint(site, along, lateral, edge);
        if (!discs.some((disc) => units(disc.at, edge) <= disc.radius + 1e-3)) uncovered++;
      }
    }
  }
  check(uncovered === 0, "an airstrip's keepout discs cover all of it", `${uncovered} points outside every disc`);
  // No two strips cross. Two drawn strips in one place are two coplanar
  // surfaces, and they fight for the depth buffer wherever they overlap. The
  // witness is the drawing's own rectangle (`onStrip`), not the search's test:
  // each strip's drawn rectangle is sampled every `GRID` units and asked
  // whether the other's, grown by `GRID`, holds it, both ways round.
  const GRID = 4;
  const sample = new Vector3();
  const crosses = (a: FleetSite, b: FleetSite): boolean => {
    for (let along = -STRIP_BACK - 4; along <= STRIP_LENGTH + 4 + 1e-6; along += GRID) {
      for (let lateral = -STRIP_DRAWN; lateral <= STRIP_DRAWN + 1e-6; lateral += GRID) {
        if (onStrip(b, stripPoint(a, along, lateral, sample), GRID)) return true;
      }
    }
    return false;
  };
  const pairs: string[] = [];
  const reach = 2 * (STRIP_LENGTH + STRIP_BACK + 8 + STRIP_HALF);
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      const a = planes[i]!;
      const b = planes[j]!;
      if (units(a.at, b.at) > reach) continue;
      if (crosses(a, b) || crosses(b, a)) pairs.push(`${places[a.place]!.name}/${places[b.place]!.name} (stands ${units(a.at, b.at).toFixed(0)} apart)`);
    }
  }
  check(pairs.length === 0, 'no two airstrips overlap, worldwide', `${pairs.length} pairs of ${planes.length} strips${pairs.length ? `: ${pairs.slice(0, 12).join(', ')}` : ''}`);
}

console.log('\nballoons:');
fieldCheck('balloon', SITE_ROOM.balloon, Math.tan((14 * Math.PI) / 180));
console.log('\nhorses, tractors and helicopters:');
fieldCheck('horse', SITE_ROOM.horse, Math.tan((20 * Math.PI) / 180));
fieldCheck('tractor', SITE_ROOM.tractor, Math.tan((14 * Math.PI) / 180));
fieldCheck('helicopter', SITE_ROOM.helicopter, Math.tan((8 * Math.PI) / 180));
{
  // A town's fields keep off each other: no horse, tractor or helicopter in
  // another field of its town, or on its airstrip.
  const fielded = sites.filter((site) => site.kind === 'horse' || site.kind === 'tractor' || site.kind === 'helicopter');
  let overlapping = 0;
  for (const site of fielded) {
    for (const other of sites) {
      if (other === site || other.place !== site.place) continue;
      if (other.kind === 'plane') {
        if (stripKeepouts(other).some((disc) => units(disc.at, site.at) < disc.radius + SITE_ROOM[site.kind])) overlapping++;
      } else if ((other.kind === 'balloon' || fielded.includes(other)) && units(other.at, site.at) < SITE_ROOM[other.kind] + SITE_ROOM[site.kind]) overlapping++;
    }
  }
  check(overlapping === 0, "no horse, tractor or helicopter stands in another of its town's fields", `${overlapping}`);
  const million = shown.filter((t) => t.place.pop >= 1_000_000).length;
  console.log(`       ${byKind.get('helicopter')?.length ?? 0} of the ${million} cities of a million found a pad`);
}
