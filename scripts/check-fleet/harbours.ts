/**
 * The harbours: where each coastal town's pier or quay runs, the boats at its
 * berths, what is laid round it, and all of it drawn.
 *
 * The planner is asked as the game asks it (`takenBy` of the town's own sites),
 * so the harbours here are the ones drawn; each must start on the coastline and
 * run over open water, its berths afloat, out of their town's square and clear
 * of every other vessel, and each berth must be the fleet's own site. Every
 * deck stands over the water or on the shore's lip at a sane height and none
 * on the land's interior or under its ground; every boat floats clear of the
 * decks and the berths; a wooden deck is a roof to a swimmer but at a ladder.
 * A sample of each size is built twice: the same buffer, a proper frame, every
 * pile down to the sea floor, every prop on its deck, and a triangle budget.
 */
import { Vector3, Matrix4 } from 'three';
import { world, places, monuments, check } from './setup.ts';
import { sites } from './sites.ts';
import { createHarbourPlanner, deckRadiusAt, deckHeightAt, DECK_LIFT } from '../../src/harbours/plan.ts';
import type { Harbour } from '../../src/harbours/plan.ts';
import { buildHarbour } from '../../src/harbours/build.ts';
import { HARBOUR_BERTH, takenBy } from '../../src/fleet/site-harbours.ts';
import { SITE_ROOM } from '../../src/fleet/site-rules.ts';
import { createContext } from '../../src/monuments/contract.ts';
import { mergeMeshes } from '../../src/merge.ts';
import { prepareSeaFloor, seaDepthAt } from '../../src/sea-floor.ts';
import { SHORE_LIP } from '../../src/terrain.ts';
import type { MergePiece } from '../../src/merge.ts';
import type { HarbourSize } from '../../src/harbours/types.ts';
import { PLANET_RADIUS, groundRadius } from '../../src/globe.ts';
import { isWater } from '../../src/vehicles.ts';
import { latOf, lonOf } from '../../src/sphere.ts';
import { townOf, townOffset } from '../../src/roads.ts';
import type { FleetSite } from '../../src/fleet.ts';

console.log('\nharbours:');
prepareSeaFloor(world);
const planner = createHarbourPlanner({ world, places, monuments });
const byPlace = new Map<number, FleetSite[]>();
for (const site of sites) {
  let list = byPlace.get(site.place);
  if (list === undefined) byPlace.set(site.place, (list = []));
  list.push(site);
}
const harbours: Harbour[] = [];
const planStart = performance.now();
for (const [p, own] of byPlace) {
  const harbour = planner.harbourOf(p, takenBy(own));
  if (harbour !== null) harbours.push(harbour);
}
const planMs = (performance.now() - planStart) / Math.max(1, byPlace.size);
const wetAt = (p: Vector3): boolean => world.countryAt(latOf(p.y), lonOf(p.x, p.z)) === 0;
const point = new Vector3();
const along = (h: Harbour, d: number, side = 0): Vector3 =>
  point.copy(h.root).addScaledVector(h.out, d / PLANET_RADIUS).addScaledVector(h.across, side / PLANET_RADIUS).normalize();

let offCoast = 0;
let dryRun = 0;
let dryBerth = 0;
let inSquare = 0;
let crowded = 0;
let unsited = 0;
let berths = 0;
const quays = harbours.filter((h) => h.kind === 'quay').length;
for (const h of harbours) {
  if (wetAt(along(h, -1)) || !wetAt(along(h, 1))) offCoast++;
  for (let d = 12; d <= h.length; d += 2) if (!wetAt(along(h, d))) dryRun++;
  const town = townOf(places[h.place]!);
  const own = byPlace.get(h.place) ?? [];
  h.berths.forEach((berth, n) => {
    berths++;
    if (!wetAt(berth.at) || !isWater(groundRadius(world, point.copy(berth.at).multiplyScalar(PLANET_RADIUS)))) dryBerth++;
    const offset = townOffset(town, berth.at, { x: 0, z: 0 });
    if (Math.abs(offset.x) < town.grid.half && Math.abs(offset.z) < town.grid.half) inSquare++;
    const site = own.find((entry) => entry.id === `${berth.model}:${h.place}:${HARBOUR_BERTH + n}`);
    if (site === undefined || !site.at.equals(berth.at)) unsited++;
    for (const other of own) {
      if (other.id.endsWith(`:${HARBOUR_BERTH + n}`) && other.model === berth.model) continue;
      if (Number(other.id.slice(other.id.lastIndexOf(':') + 1)) >= HARBOUR_BERTH) continue;
      if (other.at.angleTo(berth.at) * PLANET_RADIUS < SITE_ROOM[other.kind]) crowded++;
    }
  });
}
console.log(`  ${harbours.length} harbours (${quays} quays, ${harbours.length - quays} piers), ${berths} boats at their berths`);
check(harbours.length > 200, 'coastal towns keep harbours', `${harbours.length}`);
check(offCoast === 0, 'every pier and quay starts on its coastline', `${offCoast} do not`);
check(dryRun === 0, 'and runs out over open water', `${dryRun} points of a run over land`);
check(dryBerth === 0 && inSquare === 0, 'every berth is afloat and out of its town\'s square', `${dryBerth} on land, ${inSquare} in a square`);
check(crowded === 0, 'and clear of every other vessel the town keeps', `${crowded}`);
check(unsited === 0, 'and holds a fleet site of its own, which can be taken', `${unsited} without one`);

// What is laid round each run: decks over the water or on the shore's lip, boats afloat and clear.
const local = (h: Harbour, x: number, z: number): Vector3 => along(h, z, x);
let badDeck = 0;
let buried = 0;
let inland = 0;
let sunk = 0;
let aground = 0;
let onDeck = 0;
let byBerth = 0;
let noRoof = 0;
let noLadder = 0;
const sizes: Record<HarbourSize, Harbour[]> = { village: [], town: [], port: [] };
const pieces = { waterfront: 0, breakwater: 0, piers: 0, slip: 0, stilt: 0, boats: 0 };
for (const h of harbours) {
  sizes[h.size].push(h);
  if (h.waterfront !== null) pieces.waterfront++;
  if (h.breakwater !== null) pieces.breakwater++;
  if (h.slip !== null) pieces.slip++;
  if (h.stilt !== null) pieces.stilt++;
  pieces.piers += h.piers.length;
  pieces.boats += h.moorings.length;
  if (h.deck < SHORE_LIP + DECK_LIFT - 1e-6 || h.deck > 12) {
    badDeck++;
    if (badDeck <= 3) console.log(`    deck ${h.deck.toFixed(2)} at ${places[h.place]!.name}`);
  }
  for (const d of h.decks) {
    for (let z = d.z0; z <= d.z1 + 1e-6; z += Math.max(1, (d.z1 - d.z0) / 12)) {
      for (const x of [d.x0, (d.x0 + d.x1) / 2, d.x1]) {
        if (wetAt(local(h, x, z))) continue;
        const height = d.h0 + ((d.h1 - d.h0) * (z - d.z0)) / Math.max(1e-6, d.z1 - d.z0);
        if (world.elevationAt(local(h, x, z).multiplyScalar(PLANET_RADIUS)) > height + 0.06) {
          buried++;
          if (buried <= 4) console.log(`    buried: ${places[h.place]!.name} ${d.kind} x ${x.toFixed(1)} z ${z.toFixed(1)} of ${d.z0.toFixed(1)}..${d.z1.toFixed(1)}, ground ${world.elevationAt(local(h, x, z).multiplyScalar(PLANET_RADIUS)).toFixed(2)} deck ${height.toFixed(2)}`);
        }
        if (![4, 8, 12, 16].some((d) => wetAt(local(h, x, z + d)) || wetAt(local(h, x + d, z)) || wetAt(local(h, x - d, z)))) {
          inland++;
          if (inland <= 4) console.log(`    inland: ${places[h.place]!.name} ${d.kind} x ${x.toFixed(1)} z ${z.toFixed(1)} of ${d.x0.toFixed(1)}..${d.x1.toFixed(1)} ${d.z0.toFixed(1)}..${d.z1.toFixed(1)}`);
        }
      }
    }
  }
  for (const m of h.moorings) {
    if (m.hauled !== undefined) {
      if (m.hauled < 0.3) sunk++;
      continue;
    }
    const c = Math.cos(m.yaw);
    const sn = Math.sin(m.yaw);
    for (const [u, v] of [[0, 0], [1, 0], [-1, 0], [0.7, 1], [-0.7, -1]] as const) {
      const x = m.x + (u * m.length * sn) / 2 + (v * m.beam * c) / 2;
      const z = m.z + (u * m.length * c) / 2 - (v * m.beam * sn) / 2;
      if (!wetAt(local(h, x, z)) || !isWater(groundRadius(world, local(h, x, z).multiplyScalar(PLANET_RADIUS)))) aground++;
      if (deckHeightAt(h, x, z) !== null) onDeck++;
      for (const berth of h.berths) if (berth.at.angleTo(local(h, x, z)) * PLANET_RADIUS < 4) byBerth++;
    }
  }
  // A swimmer under the main run's middle passes; at its end ladder he climbs out.
  if (h.kind === 'pier') {
    const under = local(h, 0, h.length / 2).multiplyScalar(PLANET_RADIUS - 1.5);
    if (deckRadiusAt(h, under) > 0) noRoof++;
    const atLadder = local(h, 0, h.length - 0.4).multiplyScalar(PLANET_RADIUS - 1.5);
    if (deckRadiusAt(h, atLadder) !== PLANET_RADIUS + h.deck) noLadder++;
  }
}
console.log(`  ${sizes.village.length} villages, ${sizes.town.length} towns, ${sizes.port.length} ports: ${pieces.waterfront} waterfronts, ${pieces.breakwater} breakwaters, ${pieces.piers} more piers, ${pieces.slip} slipways, ${pieces.stilt} stilt huts, ${pieces.boats} boats nobody takes`);
check(badDeck === 0, 'every deck stands at a sane height over the sea', `${badDeck}`);
check(buried === 0 && inland === 0, 'and only on the water or the shore\'s lip: never under the ground, never inland', `${buried} buried, ${inland} inland`);
check(sunk === 0 && aground === 0, 'every boat floats, or is drawn up clear of the water', `${sunk} sunk on a slip, ${aground} points aground`);
check(onDeck === 0 && byBerth === 0, 'and clear of every deck and of the fleet\'s berths', `${onDeck} under a deck, ${byBerth} on a berth`);
check(noRoof === 0 && noLadder === 0, 'a swimmer passes under a pier and climbs out at its ladder', `${noRoof} without a way under, ${noLadder} without a ladder`);
check(pieces.waterfront > 0 && pieces.breakwater > 0 && pieces.slip > 0 && pieces.boats > harbours.length, 'harbours have their quays, breakwaters, slipways and boats');

// A sample of each size built: the same buffer twice, a proper frame, piles to the floor, props on their decks, a budget.
const BUDGET: Record<HarbourSize, number> = { village: 9000, town: 24000, port: 45000 };
const context = createContext();
let differ = 0;
let mirrored = 0;
let noDeck = 0;
let shortPile = 0;
let floating = 0;
let overBudget = 0;
const basis = new Matrix4();
const triangles: Record<HarbourSize, number[]> = { village: [], town: [], port: [] };
const mergePieces: MergePiece[] = [];
const sample = (Object.keys(sizes) as HarbourSize[]).flatMap((size) => sizes[size].filter((_, i) => i % Math.max(1, Math.floor(sizes[size].length / 10)) === 0));
let buildMs = 0;
for (const h of sample) {
  const began = performance.now();
  const built = buildHarbour(context, h);
  const a = mergeMeshes(built.group, mergePieces);
  buildMs += performance.now() - began;
  if (mergePieces.some((piece) => piece.mirrored || piece.matrix.determinant() <= 0)) mirrored++;
  const b = mergeMeshes(buildHarbour(context, h).group).position;
  if (a.position.length !== b.length || a.position.some((v, i) => v !== b[i])) differ++;
  basis.makeBasis(h.across, h.root, h.out);
  if (basis.determinant() <= 0) mirrored++;
  if (deckRadiusAt(h, along(h, h.length / 2)) !== PLANET_RADIUS + h.deck || deckRadiusAt(h, along(h, h.extent + 5)) !== 0) noDeck++;
  for (const pile of built.piles) if (pile.foot > -seaDepthAt(local(h, pile.x, pile.z)) - 0.5 || pile.top < h.deck - 2) shortPile++;
  for (const prop of built.props) if (Math.abs(prop.y - (deckHeightAt(h, prop.x, prop.z) ?? -99)) > 1e-6) floating++;
  triangles[h.size].push(a.triangles);
  if (a.triangles > BUDGET[h.size]) overBudget++;
}
check(differ === 0 && mirrored === 0, 'a harbour is built the same twice, in a proper frame, no piece mirrored', `${differ} differ, ${mirrored} mirrored`);
check(noDeck === 0, 'its deck is stood on along the run and not past its extent', `${noDeck}`);
check(shortPile === 0, 'every pile reaches the sea floor and holds its deck', `${shortPile}`);
check(floating === 0, 'every prop stands on its deck', `${floating} floating or sunk`);
const summary = (Object.keys(triangles) as HarbourSize[]).map((size) => {
  const list = triangles[size];
  return `${size} ${list.length ? Math.round(list.reduce((t, n) => t + n, 0) / list.length) : 0} mean, ${list.length ? Math.max(...list) : 0} most`;
});
check(overBudget === 0, `each within its triangle budget, one mesh a harbour (${summary.join('; ')})`, `${overBudget} over`);
const showing = (Object.keys(sizes) as HarbourSize[]).map((size) => {
  const score = (h: Harbour): number => h.moorings.length + h.piers.length * 3 + (h.breakwater ? 6 : 0) + (h.waterfront ? 6 : 0) + (h.slip ? 3 : 0);
  const h = [...sizes[size]].sort((x, y) => score(y) - score(x) || x.place - y.place)[0];
  return h === undefined ? `no ${size}` : `${size} ${places[h.place]!.name} (${latOf(h.root.y).toFixed(4)}, ${lonOf(h.root.x, h.root.z).toFixed(4)})`;
});
console.log(`  e.g. ${showing.join('; ')}`);
console.log(`  planned in ${planMs.toFixed(2)} ms a coastal town, built and merged in ${(buildMs / Math.max(1, sample.length)).toFixed(1)} ms a harbour`);
