import './placing.ts';
import { resolve } from 'node:path';
import { here, places, roads, world, check, monuments } from './setup.ts';
import { existsSync, readFileSync } from 'node:fs';
import { inflate } from '../../src/pack.ts';
import { byKind, source, units, point, pathOf, townsAround, monumentPlans, ground } from './sites.ts';
import { createSiteIndex, type FleetSite, STRIP_BACK, STRIP_LENGTH, STRIP_HALF, distanceToPath } from '../../src/fleet.ts';
import { Vector3, Object3D } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { unitAt, latOf, lonOf } from '../../src/sphere.ts';
import { roadClearance } from '../../src/roads.ts';
import { radiusOf } from '../../src/places.ts';
import { siteGap } from '../../src/landmark-ground.ts';
import { isWater } from '../../src/vehicles.ts';
import { gradeAt } from '../../src/terrain.ts';
import { slope } from './fields.ts';

// --- rockets beside the airstrips -------------------------------------------------------
//
// Half the towns with a strip keep a rocket on a pad beside it (`launch-pads.ts`),
// chosen by a roll of the town's index and stood at the first clear spot of a
// fixed list. This asks for the pads twice and backwards and wants the same
// answer, then holds every pad to its own witnesses — the drawn strips' ground,
// the towns' discs, the roads walked whole, the landmarks' plans, the railway,
// the outlines and the relief under it, every other pad — and builds the wood
// round a sample of them to see nothing stands on one. Then a rocket is built
// headless beside one, walked into, boarded and launched.

console.log('\nrockets beside the airstrips:');
{
  const { createPadIndex, createLaunchPads, keepsRocket, PAD_GRADE, PAD_FALL, PAD_KEEP, PAD_MARGIN, PAD_SHARE } = await import('../../src/launch-pads.ts');
  const { ROCKET_HEIGHT, ROCKET_REACH, ROCKET_WALL } = await import('../../src/rocket.ts');
  const { createRailNetwork, joinFields, railFields } = await import('../../src/rails.ts');
  const { decodeRails } = await import('../../src/pack.ts');
  const railsPath = resolve(here, '../public/data/rails.bin');
  const railData = existsSync(railsPath) ? decodeRails(await inflate(readFileSync(railsPath))) : null;
  const network = railData !== null && railData.places === places.length && railData.roads === roads.length ? createRailNetwork(railData.lines, places, world) : null;
  check(network !== null, 'rails.bin was baked against these places and roads, so the pads can keep off the line');
  const railGround = network === null ? null : railFields(network);
  const planes = byKind.get('plane') ?? [];
  const index = createSiteIndex(source);
  const began = performance.now();
  const padIndex = createPadIndex({ world, sites: index, rails: railGround });
  const pads = planes.map((strip) => padIndex.padOf(strip));
  const padMs = performance.now() - began;
  const keepers = planes.filter((strip) => keepsRocket(strip.place));
  const standing = pads.filter((pad): pad is NonNullable<typeof pad> => pad !== null);
  const refusals = new Map<string, number>();
  for (const strip of keepers) for (const why of padIndex.refusals(strip) ?? []) refusals.set(why, (refusals.get(why) ?? 0) + 1);
  const spots = new Map<number, number>();
  for (const pad of standing) spots.set(pad.spot, (spots.get(pad.spot) ?? 0) + 1);
  console.log(`       ${keepers.length} of the ${planes.length} strips' towns keep a rocket (${(PAD_SHARE * 100).toFixed(0)}% by roll), ${standing.length} found a spot, ${Math.round(padMs)} ms`);
  console.log(`       spots taken: ${[...spots].sort((a, b) => a[0] - b[0]).map(([spot, n]) => `#${spot} ${n}`).join(', ')}`);
  console.log(`       spots refused, of the ${keepers.length - standing.length} towns with none: ${[...refusals].map(([why, n]) => `${why} ${n}`).join(', ') || 'none'}`);
  // A roll of a fair coin per town: within three standard deviations of half.
  const sigma = Math.sqrt(planes.length) / 2;
  check(Math.abs(keepers.length - planes.length / 2) <= 3 * sigma, 'about half the airstrips keep a rocket', `${keepers.length} of ${planes.length}, half is ${(planes.length / 2).toFixed(0)} +- ${(3 * sigma).toFixed(0)}`);
  check(standing.length >= keepers.length * 0.85, 'nearly every town that keeps one finds a spot beside its strip', `${standing.length} of ${keepers.length}`);
  check(pads.every((pad, i) => pad === null || (pad.strip === planes[i] && keepsRocket(pad.place) && pad.id === `rocket:${pad.place}`)), 'a pad is its own strip town\'s, rocket:<placeIndex>');

  // Determinism: another index, asked backwards, and the near lookup.
  const twin = createPadIndex({ world, sites: createSiteIndex(source), rails: railGround });
  const backwards = [...planes].reverse().map((strip) => twin.padOf(strip)).reverse();
  const same = pads.every((pad, i) => {
    const other = backwards[i] ?? null;
    return pad === null ? other === null : other !== null && pad.at.equals(other.at) && pad.heading.equals(other.heading) && pad.spot === other.spot;
  });
  check(same, 'two indices, one asked backwards, give the same pads bit for bit');
  let lookups = 0;
  let missed = 0;
  for (const pad of standing.filter((_, i) => i % 7 === 0)) {
    lookups++;
    const found = twin.padsNear(pad.at, 5, []);
    if (!found.some((other) => other.id === pad.id)) missed++;
    if (twin.fieldsNear(pad.at, 0, []).length === 0) missed++;
  }
  check(missed === 0, 'every pad is found by padsNear and kept by fieldsNear round its own centre', `${lookups} pads, ${missed} missed`);

  // The maps' ask (`padsWithin`), on a cold index and a few steps of work an
  // ask: never a pad `padsNear` would not give, and once it says it is done,
  // every one it would, however small the steps. And `planesNear`, which
  // works out the plane towns alone, finds every strip on a cold index too.
  {
    const cold = createPadIndex({ world, sites: createSiteIndex(source), rails: railGround });
    const coldSites = createSiteIndex(source);
    let asks = 0;
    let strays = 0;
    let unfinished = 0;
    let short = 0;
    let stripsMissed = 0;
    const centres = standing.filter((_, i) => i % 61 === 0);
    for (const pad of centres) {
      const reach = 3000;
      const all = new Set(twin.padsNear(pad.at, reach, []).map((other) => other.id));
      if (!coldSites.planesNear(pad.strip.at, 1, []).some((strip) => strip.id === pad.strip.id)) stripsMissed++;
      let done = false;
      let got = new Set<string>();
      for (let ask = 0; ask < 50_000 && !done; ask++) {
        asks++;
        let steps = 8;
        const out: typeof standing = [];
        done = cold.padsWithin(pad.at, reach, out, () => steps-- > 0);
        got = new Set(out.map((other) => other.id));
        for (const id of got) if (!all.has(id)) strays++;
      }
      if (!done) unfinished++;
      else if (got.size !== all.size) short++;
    }
    check(strays === 0 && unfinished === 0 && short === 0, 'the maps\' ask gives a subset of padsNear while it works, and all of it once done', `${centres.length} places, ${asks} asks, ${strays} strays, ${unfinished} unfinished, ${short} short`);
    check(stripsMissed === 0, 'planesNear finds each strip from a cold index', `${stripsMissed} of ${centres.length} missed`);
  }

  // The witnesses: the pad's disc, its centre and sixteen points round it at `PAD_KEEP`.
  const disc = (at: Vector3): Vector3[] => {
    const up = at.clone().normalize();
    const north = new Vector3(0, 1, 0).projectOnPlane(up).normalize();
    const east = new Vector3().crossVectors(up, north).normalize();
    const out = [up];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      out.push(up.clone().addScaledVector(east, (Math.cos(a) * PAD_KEEP) / PLANET_RADIUS).addScaledVector(north, (Math.sin(a) * PAD_KEEP) / PLANET_RADIUS).normalize());
    }
    return out;
  };
  const stripFrame = new Vector3();
  /** How far inside a strip's ground a point is, positive inside: its back end to its far end, `STRIP_HALF` either side. */
  const inStrip = (strip: FleetSite, at: Vector3): number => {
    stripFrame.crossVectors(strip.forward, strip.at).normalize();
    const d = at.clone().sub(strip.at);
    const along = d.dot(strip.forward) * PLANET_RADIUS;
    const lateral = d.dot(stripFrame) * PLANET_RADIUS;
    return Math.min(along + STRIP_BACK, STRIP_LENGTH - along, STRIP_HALF - Math.abs(lateral));
  };
  const roadNear = (at: Vector3, clear: number): boolean => {
    for (let r = 0; r < roads.length; r++) {
      const road = roads[r]!;
      if (units(unitAt(places[road.a]!.lat, places[road.a]!.lon, point), at) > 1400 && units(unitAt(places[road.b]!.lat, places[road.b]!.lon, point), at) > 1400) continue;
      if (distanceToPath(pathOf(r), at) < roadClearance(road.cls) + clear) return true;
    }
    return false;
  };
  const faults = { strip: 0, town: 0, road: 0, landmark: 0, rail: 0, water: 0, steep: 0, pads: 0 };
  const bad: string[] = [];
  let steepest = 0;
  let worstFall = 0;
  const across = new Vector3();
  const north = new Vector3();
  let name = '';
  const fault = (kind: keyof typeof faults): void => {
    faults[kind]++;
    if (bad.length < 8) bad.push(`${name} ${kind}`);
  };
  for (const pad of standing) {
    const ring = disc(pad.at);
    name = places[pad.place]!.name;
    // Every strip near it, its own too: none of the pad's ground on any.
    if (planes.some((strip) => units(strip.at, pad.at) < STRIP_LENGTH * 2 && ring.some((p) => inStrip(strip, p) > 0))) fault('strip');
    if (townsAround(pad.at).some((town) => units(town.at, pad.at) < radiusOf(town.place) + PAD_KEEP)) fault('town');
    if (ring.some((p) => roadNear(p, 0))) fault('road');
    if (monumentPlans.some((m) => m.up.x * pad.at.x + m.up.y * pad.at.y + m.up.z * pad.at.z > Math.cos((m.reach + PAD_KEEP + 1) / PLANET_RADIUS) && ring.some((p) => siteGap(m, p, PLANET_RADIUS) < 0))) fault('landmark');
    if (railGround !== null && railGround.fieldsNear(pad.at, PAD_KEEP, []).length > 0) fault('rail');
    if (ring.some((p) => isWater(ground(p)))) fault('water');
    north.set(0, 1, 0).projectOnPlane(pad.at).normalize();
    across.crossVectors(pad.at, north).normalize();
    const grade = gradeAt(pad.at, across, north, PAD_KEEP, slope);
    steepest = Math.max(steepest, grade.grade);
    // The relief under the ring, against the drum's reach less the lift.
    const heights = ring.map((p) => ground(p));
    const fall = Math.max(...heights) - Math.min(...heights);
    worstFall = Math.max(worstFall, fall);
    if (grade.grade > PAD_GRADE * 1.5 || fall > PAD_FALL * 2) fault('steep');
  }
  // No two pads meet: two towns' pads are kept apart by `PAD_RIVAL` alone.
  const sorted = [...standing].sort((a, b) => a.at.x - b.at.x);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && (sorted[j]!.at.x - sorted[i]!.at.x) * PLANET_RADIUS < 2 * PAD_KEEP; j++) {
      if (units(sorted[i]!.at, sorted[j]!.at) < 2 * PAD_KEEP) {
        name = `${places[sorted[i]!.place]!.name}/${places[sorted[j]!.place]!.name}`;
        fault('pads');
      }
    }
  }
  check(faults.strip === 0, 'no pad stands on any airstrip\'s ground, its own or another\'s (and so none on a windsock)', `${faults.strip}; ${bad.join(', ')}`);
  check(faults.town === 0, 'no pad stands in a built town\'s disc', `${faults.town}`);
  check(faults.road === 0, 'no pad stands on a road or its verge, every road walked', `${faults.road}`);
  check(faults.landmark === 0, 'no pad stands on a landmark\'s plan', `${faults.landmark}`);
  check(faults.rail === 0, 'no pad stands on the railway', `${faults.rail}`);
  check(faults.water === 0, 'no pad stands over water, rim to rim', `${faults.water}`);
  check(faults.steep === 0, 'no pad stands on ground its drum cannot reach', `${faults.steep}; the steepest ${((Math.atan(steepest) * 180) / Math.PI).toFixed(1)} degrees, the worst fall across the pad ${worstFall.toFixed(2)} (the search's law ${PAD_FALL.toFixed(2)})`);
  check(faults.pads === 0, 'no two pads meet, worldwide', `${faults.pads} pairs of ${standing.length} pads`);
  check(standing.every((pad) => index.takenAt(pad.at, PAD_KEEP + PAD_MARGIN) === null), 'every pad passes the fleet\'s own town, road and landmark test with its margin');

  // The wood and the countryside keep off a pad as they keep off a strip:
  // the vegetation built headless over the joined fields, tiles raised at a
  // sample of pads, and no vertex of a plant or a piece inside a pad's disc.
  {
    const { createVegetation } = await import('../../src/vegetation.ts');
    const taken = joinFields(joinFields(createSiteIndex(source), createPadIndex({ world, sites: index, rails: railGround })), railGround);
    const wood = createVegetation(world, { places, monuments: monuments as never, roads, fields: taken });
    const probes = standing.filter((_, i) => i % Math.max(1, Math.floor(standing.length / 24)) === 0);
    const vertex = new Vector3();
    let tiles = 0;
    let nearby = 0;
    const intruded: string[] = [];
    for (const pad of probes) {
      const seen = new Set<string>();
      for (let level = 0; level < 4; level++) {
        const mesh = wood.raiseTile(latOf(pad.at.y), lonOf(pad.at.x, pad.at.z), level);
        if (mesh === null) continue;
        const key = `${level}:${mesh.position.x.toFixed(1)}:${mesh.position.z.toFixed(1)}`;
        if (seen.has(key)) {
          mesh.geometry.dispose();
          continue;
        }
        seen.add(key);
        tiles++;
        const position = mesh.geometry.getAttribute('position');
        let nearest = Infinity;
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).normalize();
          nearest = Math.min(nearest, units(vertex, pad.at));
        }
        if (nearest < PAD_KEEP + 40) nearby++;
        if (nearest < PAD_KEEP) intruded.push(`${places[pad.place]!.name} level ${level}: ${nearest.toFixed(1)} units from the pad's centre`);
        mesh.geometry.dispose();
      }
    }
    check(intruded.length === 0, `no plant, farm or piece of the country stands on a pad (${probes.length} pads, ${tiles} tiles, ${nearby} with something within 40 units of the disc)`, intruded.slice(0, 4).join('; '));
  }

  // A rocket built headless beside a pad: streamed in, a wall, boarded,
  // stepped out of, lit and launched to the curtain, and an unmanned one gone.
  {
    const { Texture, PerspectiveCamera } = await import('three');
    const pad = standing.find((one) => places[one.place]!.name === 'Barcelona') ?? standing[0]!;
    const streamer = createLaunchPads({ world, pads: padIndex, gradientMap: new Texture() });
    const body = new Object3D();
    const besides = pad.at.clone().applyAxisAngle(new Vector3(0, 1, 0).cross(pad.at).normalize(), (ROCKET_WALL + 2) / PLANET_RADIUS);
    const at = besides.clone().multiplyScalar(ground(besides));
    const frame = { dt: 1 / 30, player: at, listener: at, hold: false, effects: null, sound: null };
    for (let i = 0; i < 10; i++) streamer.update(frame);
    const rocket = streamer.standing().sort((a, b) => a.position.distanceTo(at) - b.position.distanceTo(at))[0];
    const own = rocket !== undefined && units(rocket.position.clone().normalize(), pad.at) < 0.01;
    check(own && streamer.stats.standing <= 4, `a rocket stands on ${places[pad.place]!.name}'s pad once the player is beside it, and no more than four round it`, `${streamer.stats.standing} standing of ${streamer.stats.wanted} wanted`);
    if (rocket !== undefined) {
      const push = new Vector3();
      const into = rocket.position.clone().add(new Vector3().copy(pad.heading).multiplyScalar(ROCKET_WALL * 0.5));
      const walled = streamer.collide(into, 1.3, push);
      const freed = streamer.freeSpotNear(into, 1.3, push) && !streamer.collide(push, 1.3, new Vector3());
      check(walled && freed, 'the pad and its tower are a wall, and a body inside is given the nearest spot clear of it');
      const tall = rocket.position.clone().addScaledVector(pad.at, ROCKET_HEIGHT * 0.5);
      check(streamer.collideAloft(tall, 2, push) && streamer.blocksSight(tall), 'an aircraft and the camera meet it up its height');
      const offered = streamer.offer(at);
      check(offered !== null && offered.rocket === rocket && offered.gap < ROCKET_REACH, 'beside it, `E` is offered the rocket', offered === null ? 'none' : `gap ${offered.gap.toFixed(1)}`);
      streamer.board(rocket, body);
      const out = new Vector3();
      const stepped = streamer.riding === rocket && !body.visible && streamer.leave(out) && body.visible && streamer.riding === null;
      check(stepped && out.distanceTo(rocket.position) > ROCKET_WALL, 'boarded it hides the body, and on its pad `E` steps out clear of its wall', `${out.distanceTo(rocket.position).toFixed(1)} units from its axis`);
      streamer.board(rocket, body);
      const lens = new PerspectiveCamera(45, 16 / 9, 0.5, 40000);
      let seconds = 0;
      for (; seconds < 60 && rocket.curtain < 1; seconds += frame.dt) {
        streamer.update({ ...frame, hold: true });
        streamer.frame(lens, frame.dt);
      }
      const late = streamer.leave(out);
      // The lens watches from the strip's side, which is open ground.
      const lensOver = lens.position.clone().normalize();
      const overStrip = inStrip(pad.strip, lensOver) > -STRIP_HALF;
      check(rocket.curtain >= 1 && rocket.state === 'flying' && !late, 'held, it lights, lifts and climbs to the curtain, and cannot be left once it has', `${seconds.toFixed(1)} s to the curtain, ${rocket.height.toFixed(0)} units up`);
      check(overStrip, 'the lens watches the launch from over its airstrip, which is open ground', `${inStrip(pad.strip, lensOver).toFixed(1)} units inside the strip's ground`);
      rocket.reset();
      // Nobody in it: it goes and is gone, and its pad stands empty until it is back.
      const far = { ...frame, player: rocket.position.clone().applyAxisAngle(new Vector3(0, 1, 0).cross(pad.at).normalize(), 300 / PLANET_RADIUS) };
      const lit = rocket.autolaunch();
      let gone = false;
      for (let t = 0; t < 40 && !gone; t += frame.dt) {
        streamer.update(far);
        gone = rocket.state === 'gone';
      }
      check(lit && gone, 'an unmanned launch goes up and is gone, nobody aboard');
    }
  }
}
