import { type WorldSpec } from '../../src/worlds/contract.ts';
import { type Terrain } from '../../src/worlds/terrain.ts';
import { createSettlements, type Site, arrivalOf } from '../../src/worlds/settlements.ts';
import { ctx, gradientMap } from './ground.ts';
import { roadNetwork, createRoads } from '../../src/worlds/roads.ts';
import { fail } from './setup.ts';
import { createOutposts } from '../../src/worlds/outposts.ts';
import { facePoint } from '../../src/worlds/cube.ts';
import * as THREE from 'three';
import { capitalOf, siteAt, parkingOf, PARKING_CLEAR } from '../../src/worlds/arrival.ts';
import { createSky } from '../../src/worlds/sky.ts';
import { BODY_RADIUS } from '../../src/worlds/player.ts';
import { fliesOf } from './actors.ts';
import { latLonOf, unitAt } from '../../src/sphere.ts';
import { localHour, geographyOf } from '../../src/system/geography.ts';
import { frontierEdges, surfaceOf, outlinesOf } from '../../src/worlds/surface.ts';
import { createFrontiers } from '../../src/worlds/frontiers.ts';

export function checkRoads(spec: WorldSpec, terrain: Terrain): void {
  const settlements = createSettlements(spec, terrain, ctx, gradientMap);
  const again = roadNetwork(spec, settlements.sites, terrain);
  if (JSON.stringify(again.roads) !== JSON.stringify(settlements.network.roads)) fail(`${spec.id}: the road network differs between two calls`);
  const roads = createRoads(spec, terrain, settlements.sites, settlements.network, gradientMap);
  // Built everywhere: from every town, until nothing more is wanted.
  for (let before = -1; before !== roads.stats.chunks; ) {
    before = roads.stats.chunks;
    for (const site of settlements.sites) roads.update(site.dir.clone().multiplyScalar(terrain.radius), 100);
  }
  let sections = 0;
  let under = 0;
  let worst = Infinity;
  roads.sweep((top, ground) => {
    sections++;
    worst = Math.min(worst, top - ground);
    if (top < ground) under++;
  });
  if (under > 0) fail(`${spec.id}: ${under} of ${sections} road sections under the drawn ground, worst ${(-worst).toFixed(2)}`);
  // A road meets its town's street flush, not a step above or under the kerb.
  const step = roads.gateStep();
  if (step > 0.05) fail(`${spec.id}: a road meets its town's street ${step.toFixed(2)} units off its level`);
  console.log(
    `  roads: ${roads.stats.roads}, ${roads.stats.steep} pairs left apart by the slope; ${sections} sections, the top at least ${Number.isFinite(worst) ? worst.toFixed(2) : '-'} over the ground`,
  );
  roads.dispose();
  settlements.dispose();
}

/**
 * What stands between the towns (`outposts.ts`): the same plan twice from
 * two builds, and none on ground the world keeps bare — tried on the tiles
 * round every town, where the squares and the roads are.
 */
export function checkOutposts(spec: WorldSpec, terrain: Terrain): void {
  const settlements = createSettlements(spec, terrain, ctx, gradientMap);
  const roads = createRoads(spec, terrain, settlements.sites, settlements.network, gradientMap);
  const one = createOutposts(spec, terrain);
  const two = createOutposts(spec, terrain);
  const size = 2 / (1 << terrain.levels);
  const point = { face: 0, u: 0, v: 0 };
  const seen = new Set<string>();
  let tiles = 0;
  let planned = 0;
  for (const site of settlements.sites) {
    facePoint(site.dir.x, site.dir.y, site.dir.z, point);
    const i0 = Math.floor((point.u + 1) / size);
    const j0 = Math.floor((point.v + 1) / size);
    for (let di = -6; di <= 6; di++) {
      for (let dj = -6; dj <= 6; dj++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= 1 << terrain.levels || j >= 1 << terrain.levels) continue;
        const key = { face: point.face, level: terrain.levels, i, j };
        const id = `${key.face}/${i}/${j}`;
        if (seen.has(id)) continue;
        seen.add(id);
        tiles++;
        const a = one.planOf(key);
        const b = two.planOf(key);
        if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${spec.id}: tile ${id}'s outpost differs between two builds`);
        if (a === null) continue;
        planned++;
        const at = a.at;
        if (terrain.bareAt(at.x, at.y, at.z)) fail(`${spec.id}: a ${a.kind} outpost stands on bare ground at tile ${id}`);
      }
    }
  }
  console.log(`  outposts: ${planned} on ${tiles} tiles round the towns`);
  roads.dispose();
  settlements.dispose();
}

export function checkArrivals(spec: WorldSpec, terrain: Terrain): void {
  const R = terrain.radius;
  const settlements = createSettlements(spec, terrain, ctx, gradientMap);
  const groundAt = (point: THREE.Vector3): number => {
    const n = point.clone().normalize();
    const floor = settlements.floorAt(n.x, n.y, n.z);
    const land = terrain.groundAt(n.x, n.y, n.z);
    return floor === null ? land : Math.max(land, floor);
  };
  const towns = settlements.sites.filter((site) => !site.landmark);
  if (towns.length > 0 && capitalOf(spec, settlements.sites) === null) fail(`${spec.id}: ?world= has no capital to land in`);
  const scene = new THREE.Scene();
  const sky = createSky(spec, scene);
  // Never turned: the clock the world starts on, before anyone sets an hour.
  const clockSky = createSky(spec, new THREE.Scene());
  const date = new Date('2026-10-01T12:00:00Z');
  const at = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const up = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  let worstSlope = 0;
  let nearestCraft = Infinity;
  let polarNights = 0;
  let worstClock = 0;
  const placed = (site: Site, x: number, z: number, out: THREE.Vector3): THREE.Vector3 => {
    settlements.toWorld(site, x, 0, z, out).normalize();
    return out.multiplyScalar(R + groundAt(out));
  };
  for (const site of towns) {
    settlements.prime(site.origin);
    if (site.mesh === null) continue;
    const name = `${spec.id}: the arrival in ${site.id}`;
    const point = arrivalOf(site);
    if (Math.hypot(point.x, point.z) > site.paving) fail(`${name} is off the town's paving`);
    placed(site, point.x, point.z, at);
    // The town it says it is in, as a remembered place or `/goto` would find it.
    if (siteAt(settlements.sites, R, at) !== site) fail(`${name} is not found in its own town`);
    if (settlements.collide(at.clone(), BODY_RADIUS)) fail(`${name} stands in a wall`);
    // The slope, from the ground two units either way.
    up.copy(at).normalize();
    east.set(0, 1, 0).cross(up);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    north.crossVectors(up, east).normalize();
    let rise = 0;
    for (const side of [east, north]) {
      const a = groundAt(probe.copy(at).addScaledVector(side, 2));
      const b = groundAt(probe.copy(at).addScaledVector(side, -2));
      rise = Math.max(rise, Math.abs(a - b) / 4);
    }
    const slope = (Math.atan(rise) * 180) / Math.PI;
    worstSlope = Math.max(worstSlope, slope);
    if (slope > 15) fail(`${name} stands on ground ${slope.toFixed(1)} degrees steep`);
    // The way in to the square: no wall on the line from the arrival to the
    // square's edge, but the centrepiece the traveller is looking at.
    {
      const into = Math.hypot(point.x, point.z);
      const edge = site.plaza * 0.9;
      const ex = (point.x / Math.max(1e-6, into)) * edge;
      const ez = (point.z / Math.max(1e-6, into)) * edge;
      for (const f of site.footprints) {
        if (Math.hypot(f.x, f.z) < f.radius) continue;
        const dx = ex - point.x;
        const dz = ez - point.z;
        const t = Math.max(0, Math.min(1, ((f.x - point.x) * dx + (f.z - point.z) * dz) / Math.max(1e-9, dx * dx + dz * dz)));
        if (Math.hypot(point.x + dx * t - f.x, point.z + dz * t - f.z) < f.radius) {
          fail(`${name} cannot see the square: a building ${(t * Math.hypot(dx, dz)).toFixed(1)} units in`);
          break;
        }
      }
    }
    // The craft that wait there.
    spec.vehicles.forEach((vehicle, k) => {
      const spot = parkingOf(site, k, fliesOf(vehicle));
      const gap = Math.hypot(spot.x - point.x, spot.z - point.z);
      nearestCraft = Math.min(nearestCraft, gap);
      if (gap < PARKING_CLEAR) fail(`${name}: craft ${k} waits ${gap.toFixed(1)} units off, under ${PARKING_CLEAR}`);
      if (settlements.collide(placed(site, spot.x, spot.z, probe), 2)) fail(`${name}: craft ${k} waits inside a wall`);
    });
    // The clock: the world starts on the menu's hour, and ten is daylight
    // wherever the sun rises that day.
    const { lat, lon } = latLonOf(at);
    clockSky.update(date, at, at, 1);
    worstClock = Math.max(worstClock, Math.abs(((clockSky.state.hour - localHour(spec.body, lon, date) + 36) % 24) - 12));
    sky.setHour(12, date, at);
    sky.update(date, at, at, 1);
    if (sky.state.elevation <= 0) {
      polarNights++;
      continue;
    }
    sky.setHour(10, date, at);
    sky.update(date, at, at, 1);
    if (sky.state.elevation <= 0 && Math.abs(lat) < 60) fail(`${name}: the sun is down at ten in the morning`);
  }
  if (worstClock > 0.05) fail(`${spec.id}: the world's clock starts ${worstClock.toFixed(2)} h off the menu's`);
  if (towns.length > 0) {
    console.log(
      `  arrivals: ${towns.length} towns, steepest ${worstSlope.toFixed(1)} degrees, nearest craft ${nearestCraft.toFixed(1)} units,` +
        ` clock within ${(worstClock * 60).toFixed(1)} min of the menu's${polarNights > 0 ? `, ${polarNights} in polar night today` : ''}`,
    );
  }
  sky.dispose();
  clockSky.dispose();
  settlements.dispose();
}

export function checkPolitical(spec: WorldSpec, terrain: Terrain): void {
  if (spec.body.nations.length === 0) return;
  const geography = geographyOf(spec.body);
  const world = geography.world;
  const edges = frontierEdges(world, geography);
  let frontier = 0;
  for (const flags of edges) for (const flag of flags) if (flag === 0) frontier++;
  let shared = 0;
  for (const line of geography.frontiers) shared += line.points.length - 1;
  if (frontier !== shared * 2) fail(`${spec.id}: ${frontier} ring edges are frontiers where the frontiers have ${shared}, each drawn by two rings`);
  const surface = surfaceOf(terrain, geography);
  if (surface.coastEdges(world) !== surface.coastEdges(world)) fail(`${spec.id}: the surface's edges are worked out twice`);
  // Every town stands in its own nation's colour.
  const point = new THREE.Vector3();
  for (const place of geography.places) {
    const id = world.countryAtPoint(unitAt(place.lat, place.lon, point));
    if (geography.countries[id - 1]?.iso !== place.iso) fail(`${spec.id}: ${place.name} is tinted as ${geography.countries[id - 1]?.iso ?? 'nobody'}, not ${place.iso}`);
  }
  // The outlines the minimap inks: each nation joined back along its cuts,
  // never more rings than it had, and every point still its own nation's.
  const outlines = outlinesOf(geography);
  let joined = 0;
  let kept = 0;
  outlines.countries.forEach((country, i) => {
    const before = geography.countries[i]!.rings.length;
    if (country.rings.length > before) fail(`${spec.id}: ${country.name}'s outline is ${country.rings.length} rings, from ${before}`);
    if (country === geography.countries[i] && before > 1) kept++;
    else joined += before - country.rings.length;
  });
  // The borders, built whole.
  const frontiers = createFrontiers(geography, terrain);
  const began = performance.now();
  frontiers.update(point.set(0, terrain.radius * 3, 0), 1, 1, 1, 2, Infinity);
  const ms = performance.now() - began;
  if (frontiers.stats.built !== frontiers.stats.total) fail(`${spec.id}: ${frontiers.stats.total - frontiers.stats.built} frontiers did not build`);
  if (frontiers.stats.samples > 40000) fail(`${spec.id}: the borders are ${frontiers.stats.samples} samples, over 40,000`);
  console.log(
    `  political: ${geography.countries.length} nations, ${geography.frontiers.length} frontiers, ${frontiers.stats.samples.toLocaleString('en')} border samples in ${ms.toFixed(0)} ms;` +
      ` outlines joined along ${joined} cuts${kept > 0 ? `, ${kept} nation${kept === 1 ? '' : 's'} drawn as cut` : ''}`,
  );
  frontiers.dispose();
}
