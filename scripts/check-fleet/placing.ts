import './fields.ts';
import { byKind, pathOf, insideSquare, ground, shown, source, sites, units } from './sites.ts';
import { ROAD_CLASSES } from '../../src/roads.ts';
import { roads, check, world, here, places, monuments } from './setup.ts';
import { distanceToPath, SITE_ROOM, createSiteIndex, type FleetSite, STRIP_BACK, STRIP_LENGTH, STRIP_HALF, stripPoint } from '../../src/fleet.ts';
import { isWater } from '../../src/vehicles.ts';
import { latOf, lonOf } from '../../src/sphere.ts';
import { north, across, corner } from './cars.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { resolve } from 'node:path';
import { registerHooks } from 'node:module';
import { readdirSync } from 'node:fs';
import { Vector3 } from 'three';

// --- at the gates, and off the shore ------------------------------------------------
//
// The rest of the fleet: a rack of bicycles and a motorbike on the verge of a
// road out of town, a tuk-tuk, a jeep and a bus on its carriageway; a jet ski
// and a sailboat on open water near the town's launch. Each asked what its
// place asks of it: on its road or beside it, never in a square or the water
// — or on the water with room round it, never in a square.

console.log('\nat the gates:');
{
  for (const kind of ['bicycle', 'motorbike', 'tuktuk', 'jeep', 'bus'] as const) {
    const list = byKind.get(kind) ?? [];
    const verge = kind === 'bicycle' || kind === 'motorbike';
    let astray = 0;
    let onIt = 0;
    let squared = 0;
    let soaked = 0;
    let worst = 0;
    for (const site of list) {
      const half = ROAD_CLASSES[roads[site.road]!.cls]!.width / 2;
      const d = site.road < 0 ? Infinity : distanceToPath(pathOf(site.road), site.at);
      worst = Math.max(worst, d);
      if (verge) {
        if (d > half + 1.6 + SITE_ROOM[kind] + 1) astray++;
        if (d < half) onIt++;
      } else if (d > half) astray++;
      if (insideSquare(site.at, 0) !== null) squared++;
      if (isWater(ground(site.at))) soaked++;
    }
    check(astray === 0, verge ? `every ${kind} stands on the verge of its road` : `every ${kind} stands on its own carriageway`, `${astray} of ${list.length}; the furthest ${worst.toFixed(1)} units off the centre line`);
    if (verge) check(onIt === 0, `no ${kind} stands on the carriageway`, `${onIt}`);
    check(squared === 0 && soaked === 0, `no ${kind} stands in a town square or in the water`, `${squared} in a square, ${soaked} wet`);
  }
  const cycling = shown.filter((t) => ['NLD', 'DNK'].includes(t.place.iso) && roads.some((road) => road.a === t.i || road.b === t.i));
  const racked = cycling.filter((t) => (byKind.get('bicycle') ?? []).some((site) => site.place === t.i)).length;
  check(racked >= cycling.length * 0.9, 'nearly every Dutch and Danish town with a road keeps bicycles at its gate', `${racked} of ${cycling.length}`);
}

console.log('\noff the shore:');
{
  for (const kind of ['jetski', 'sailboat'] as const) {
    const list = byKind.get(kind) ?? [];
    let dryHere = 0;
    let crampedHere = 0;
    let squared = 0;
    for (const site of list) {
      const lat = latOf(site.at.y);
      const lon = lonOf(site.at.x, site.at.z);
      if (!isWater(ground(site.at)) || world.countryAt(lat, lon) !== 0) dryHere++;
      north.set(0, 1, 0).projectOnPlane(site.at).normalize();
      across.crossVectors(site.at, north).normalize();
      const room = SITE_ROOM[kind] * 0.8;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        corner.copy(site.at).addScaledVector(across, (Math.sin(a) * room) / PLANET_RADIUS).addScaledVector(north, (Math.cos(a) * room) / PLANET_RADIUS).normalize();
        if (!isWater(ground(corner))) {
          crampedHere++;
          break;
        }
      }
      if (insideSquare(site.at, 0) !== null) squared++;
    }
    check(dryHere === 0, `every ${kind} is on water`, `${dryHere} of ${list.length} are not`);
    check(crampedHere <= list.length * 0.01, `a ${kind} has water round it`, `${crampedHere} of ${list.length} touch land on one of sixteen bearings`);
    check(squared === 0, `no ${kind} is inside a town square`, `${squared}`);
  }
}

// --- the wood keeps off the fields ------------------------------------------------------
//
// The real vegetation streamer, headless, building the tiles over a few fields
// at every level and asking where every vertex of every plant landed: nothing
// may stand inside a plane's or a balloon's field. `vegetation.ts` reaches the
// scenery registry, which is an eager `import.meta.glob` — a Vite transform —
// so the one call is rewritten into the static imports Vite would have made.

console.log('\nthe wood keeps off the fields:');
{
  const scenery = resolve(here, '../src/scenery');
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (!url.endsWith('/src/scenery/index.ts')) return result;
      const files = readdirSync(resolve(scenery, 'parts')).filter((file) => file.endsWith('.ts')).sort();
      const imports = files.map((file, i) => `import * as part${i} from './parts/${file}';`).join('\n');
      const table = `{ ${files.map((file, i) => `'./parts/${file}': part${i}`).join(', ')} }`;
      const source = String(result.source);
      const glob = /import\.meta\.glob\s*(?:<.*?>)?\s*\('\.\/parts\/\*\.ts', \{ eager: true \}\)/;
      if (!glob.test(source)) throw new Error('check-fleet: the scenery registry no longer reads its parts the way this shim rewrites');
      return { ...result, source: `${imports}\n${source.replace(glob, table)}` };
    },
  });
  const { registerModelsFromDisk } = await import('../kit-node.ts');
  await registerModelsFromDisk();
  const { createVegetation } = await import('../../src/vegetation.ts');
  const fields = createSiteIndex(source);
  const wood = createVegetation(world, { places, monuments: monuments as never, roads, fields });
  const planes = byKind.get('plane') ?? [];
  const balloons = byKind.get('balloon') ?? [];
  const every = (kind: string, count: number): FleetSite[] => {
    const list = byKind.get(kind) ?? [];
    return list.filter((_, i) => i % Math.max(1, Math.floor(list.length / count)) === 0);
  };
  const probes = [
    sites.find((site) => site.id === 'light-plane:232:0'),
    ...planes.filter((_, i) => i % Math.max(1, Math.floor(planes.length / 8)) === 0),
    ...balloons.filter((_, i) => i % Math.max(1, Math.floor(balloons.length / 4)) === 0),
    ...every('horse', 3),
    ...every('tractor', 2),
    ...every('helicopter', 3),
  ].filter((site): site is FleetSite => site !== undefined);
  const vertex = new Vector3();
  let tiles = 0;
  let plantsNear = 0;
  const intruded: string[] = [];
  const side = new Vector3();
  /**
   * How far inside the ground a site keeps a point is: for a balloon, its
   * field's radius less the distance from its centre; for a plane, the least
   * of the distances to the strip's four sides, in the strip's own frame.
   * Positive is inside.
   */
  const inside = (site: FleetSite, at: Vector3): number => {
    if (site.kind !== 'plane') return SITE_ROOM[site.kind] - units(at, site.at);
    side.crossVectors(site.forward, site.at).normalize();
    const d = at.clone().sub(site.at);
    const along = d.dot(site.forward) * PLANET_RADIUS;
    const lateral = d.dot(side) * PLANET_RADIUS;
    return Math.min(along + STRIP_BACK, STRIP_LENGTH - along, STRIP_HALF - Math.abs(lateral));
  };
  const tileAt = new Vector3();
  for (const site of probes) {
    // A strip crosses more than one tile: its stand, its middle and its far end.
    const spots = site.kind === 'plane' ? [0, STRIP_LENGTH / 2, STRIP_LENGTH] : [0];
    const seen = new Set<string>();
    for (const along of spots) {
      stripPoint(site, along, 0, tileAt);
      for (let level = 0; level < 4; level++) {
        const mesh = wood.raiseTile(latOf(tileAt.y), lonOf(tileAt.x, tileAt.z), level);
        if (mesh === null) continue;
        const key = `${level}:${mesh.position.x.toFixed(1)}:${mesh.position.z.toFixed(1)}`;
        if (seen.has(key)) {
          mesh.geometry.dispose();
          continue;
        }
        seen.add(key);
        tiles++;
        const position = mesh.geometry.getAttribute('position');
        let worst = -Infinity;
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).normalize();
          const d = inside(site, vertex);
          if (d > worst) worst = d;
        }
        if (worst > -40) plantsNear++;
        if (worst > 0) intruded.push(`${site.id} level ${level}: a plant ${worst.toFixed(1)} units inside`);
        mesh.geometry.dispose();
      }
    }
  }
  check(
    probes.some((site) => site.id === 'light-plane:232:0'),
    "Barcelona's light plane is among the fields probed",
  );
  check(
    intruded.length === 0,
    `no plant stands on an airstrip or in a balloon's field (${probes.length} fields, ${tiles} tiles, ${plantsNear} with a plant within 40 units of the edge)`,
    intruded.slice(0, 4).join('; '),
  );
}
