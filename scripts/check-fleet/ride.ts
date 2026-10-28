import './link.ts';
import { resolve } from 'node:path';
import { here, check, world, places } from './setup.ts';
import { readFileSync } from 'node:fs';
import { SITE_ROOM, type FleetSite, writePose, STRIP_LENGTH, createLocalLink, createSiteIndex } from '../../src/fleet.ts';
import { Vector3, Object3D } from 'three';
import { sites, ground, units, byKind, source } from './sites.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { latOf, lonOf, unitAt } from '../../src/sphere.ts';
import { cars } from './cars.ts';
import { shoreDistance } from '../../src/terrain.ts';
import { isWater } from '../../src/vehicles.ts';
import { airAt } from '../../src/player/aerobatics.ts';
import { AERO_LIFT_SPEED, AERO_STALL } from '../../src/player/constants.ts';

// --- the ride, headless -------------------------------------------------------------------
//
// The real player on the real planet, with the real models, stepped at 60 Hz:
// into the water and out of it, and into each kind of vehicle, driven, and
// out again. No made ground (the ribbon and the towns are streamers), so a car
// drives the relief here; what is checked is the state machine, not the lawn.

console.log('\nthe ride, headless:');
{
  const g = globalThis as Record<string, unknown>;
  const PUBLIC = resolve(here, '../public');
  g.fetch = async (url: string) => {
    const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  await import('../kit-node.ts');
  const { modelsFrom, rigFrom } = await import('../../src/kit.ts');
  const { craftFrom } = await import('../../src/craft/index.ts');
  const { horseMaterial } = await import('../../src/craft/horse.ts');
  const { prepareAvatar } = await import('../../src/avatar.ts');
  const { createPlayer, SWIM_SPEED } = await import('../../src/player.ts');
  const { ROAD_HANDLING, WATER_HANDLING, HELI_SPEED, HELI_SPOOL } = await import('../../src/vehicles.ts');
  const horseRig = await rigFrom(readFileSync(resolve(PUBLIC, 'models/fauna/horse.bin')), 'horse', horseMaterial());
  const craft = craftFrom(await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin'))), horseRig);
  await prepareAvatar();

  // The sites keep room for the models without reading them (`SITE_ROOM`), so
  // the models are held to the room here.
  const size = (id: string): readonly [number, number, number] => craft.get(id)!.size;
  const carLength = Math.max(size('hatchback')[0], size('van')[0]);
  check(SITE_ROOM.car >= carLength / 2, 'a parked car fits its room out of the square', `${SITE_ROOM.car} against half of ${carLength.toFixed(2)}`);
  check(SITE_ROOM.boat >= size('launch')[0] / 2 + 2, 'a launch fits its ring of water with room to spare', `${SITE_ROOM.boat} against half of ${size('launch')[0].toFixed(2)}`);
  check(SITE_ROOM.plane >= Math.max(size('light-plane')[0], size('light-plane')[1]) / 2, 'a plane fits its field', `${SITE_ROOM.plane} against half of ${Math.max(size('light-plane')[0], size('light-plane')[1]).toFixed(2)}`);
  check(SITE_ROOM.balloon >= size('balloon')[1] / 2, 'a balloon fits its field', `${SITE_ROOM.balloon} against half of ${size('balloon')[1].toFixed(2)}`);
  {
    // Every other model against its kind's room: the longer of its length and
    // width for a field or a mooring, and half its length along a road.
    const short: string[] = [];
    for (const model of craft.values()) {
      if (['hatchback', 'van', 'launch', 'light-plane', 'balloon'].includes(model.id)) continue;
      const along = model.kind === 'bicycle' ? model.size[1] / 2 : model.size[0] / 2;
      const need = model.medium === 'water' || model.kind === 'horse' || model.kind === 'tractor' || model.kind === 'helicopter' ? Math.max(model.size[0], model.size[1]) / 2 : along;
      if (SITE_ROOM[model.kind] < need) short.push(`${model.id} ${SITE_ROOM[model.kind]} < ${need.toFixed(2)}`);
    }
    check(short.length === 0, 'every other model fits the room its kind keeps', short.join(', '));
  }
  const events: string[] = [];
  const player = createPlayer(world, 41.39, 2.17, { onEvent: (event) => events.push(event) });
  const heading = new Vector3();
  const step = (seconds: number, input: { x?: number; y?: number; run?: boolean; climb?: boolean; dive?: boolean; jump?: boolean; pitch?: number; roll?: number; flightMode?: boolean }): void => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      heading.copy(player.forward);
      player.update(1 / 60, {
        move: { x: input.x ?? 0, y: input.y ?? 0 },
        run: input.run ?? false,
        // An edge: the first frame only.
        jump: (input.jump ?? false) && t === 0,
        heading,
        climb: input.climb ?? false,
        dive: input.dive ?? false,
        attitude: { pitch: input.pitch ?? 0, roll: input.roll ?? 0 },
        flightMode: (input.flightMode ?? false) && t === 0,
      });
    }
  };
  const find = (id: string): FleetSite => sites.find((site) => site.id === id) ?? sites.find((site) => site.model === id.split(':')[0])!;
  const board = (site: FleetSite): void => {
    const model = craft.get(site.model)!;
    const r = site.kind === 'boat' ? PLANET_RADIUS + 0.5 : ground(site.at);
    player.board({ vehicle: site.id, seat: 0, model, group: model.build(0) }, writePose(site.at.clone().multiplyScalar(r), site.forward, site.at, []));
  };

  // Afloat, and out again.
  const boat = find('launch:232:0');
  player.goTo(latOf(boat.at.y), lonOf(boat.at.x, boat.at.z));
  check(player.state === 'swim' && player.sink > 0, 'put on the water, the player swims', `${player.state}, sink ${player.sink.toFixed(2)}`);
  const surface = player.position.length() - PLANET_RADIUS;
  step(2, { y: 1 });
  check(Math.abs(player.velocity - SWIM_SPEED) < 0.3 && Math.abs(player.position.length() - PLANET_RADIUS - surface) < 1e-6, 'swims at SWIM_SPEED, on the surface', `${player.velocity.toFixed(2)} units/s against ${SWIM_SPEED.toFixed(2)}`);
  // Swim back towards the town until the shore takes him.
  const town = unitAt(places[boat.place]!.lat, places[boat.place]!.lon, new Vector3());
  let seconds = 0;
  for (; seconds < 120 && player.state === 'swim'; seconds += 0.5) {
    player.forward.copy(town).sub(player.position.clone().normalize()).projectOnPlane(player.up).normalize();
    step(0.5, { y: 1, run: true });
  }
  check(player.state === 'foot' && events.includes('ashore'), 'swimming at the shore climbs out onto it', `${player.state} after ${seconds} s`);

  // A car: forward along its road, and out beside it.
  const car = find(cars[0]!.id);
  board(car);
  check(player.state === 'seated' && player.mode === 'car', 'a car is taken at the wheel', player.mode);
  const start = player.position.clone();
  step(3, { y: 1 });
  const driven = units(start.clone().normalize(), player.position.clone().normalize());
  check(driven > 30 || player.velocity === 0, 'W drives it', `${driven.toFixed(1)} units in 3 s, ${player.velocity.toFixed(1)} units/s now`);
  check(Math.abs(player.position.length() - ground(player.position.clone().normalize())) < 1.5, 'on the ground it drives over', `${(player.position.length() - ground(player.position.clone().normalize())).toFixed(2)} off it`);
  step(3, { y: -1 });
  const left = player.leave();
  check(left !== null && player.state === 'foot' && player.ride === null, 'E gets out beside it, on foot');
  // Out of it under way: over the side, going, and down in a roll.
  board(car);
  step(3, { y: 1 });
  const way = player.speed;
  player.leave();
  const thrown = player.velocity;
  check(player.state === 'foot' && player.airborne && thrown > 3, 'out of a car under way is a jump, with some of its speed', `${thrown.toFixed(1)} units/s off ${way.toFixed(1)}`);
  step(3, {});
  check(!player.airborne && player.state !== 'seated', 'and down again on foot', `${player.velocity.toFixed(1)} units/s`);

  // A car in the water: it floats a moment, goes down nose first, and once
  // it has gone (`FOUNDER_TIME`) the fleet puts the driver out swimming.
  {
    const { FOUNDER_TIME, founderDepth } = await import('../../src/vehicles.ts');
    const hatchback = craft.get('hatchback')!;
    const afloat = boat.at.clone().multiplyScalar(PLANET_RADIUS + 0.5);
    player.board({ vehicle: car.id, seat: 0, model: hatchback, group: hatchback.build(0) }, writePose(afloat, boat.forward, boat.at, []));
    events.length = 0;
    step(1 / 60, {});
    const floating = player.position.length() - PLANET_RADIUS;
    step(FOUNDER_TIME * 0.5, { y: 1 });
    const half = player.position.length() - PLANET_RADIUS;
    check(events.includes('foundered') && !player.sunk && half < floating - 0.5, 'a car in the water founders: it splashes and goes down', `${floating.toFixed(2)} to ${half.toFixed(2)} over the waterline`);
    step(FOUNDER_TIME * 0.5 + 0.1, { y: 1 });
    check(player.sunk && player.ride !== null, 'and at FOUNDER_TIME it has sunk', `${(player.position.length() - PLANET_RADIUS).toFixed(2)}, ${founderDepth(FOUNDER_TIME).toFixed(2)} down`);
    player.leave();
    check(player.state === 'swim' && player.ride === null && !player.sunk, 'the driver is put out swimming at the surface', player.state);
    player.goTo(41.39, 2.17);
  }

  // The launch, out of the harbour.
  board(boat);
  step(2, { y: 1 });
  check(player.mode === 'boat' && Math.abs(player.position.length() - PLANET_RADIUS - 0.5) < 1e-6, 'a launch sails on the waterline', `${player.velocity.toFixed(1)} units/s`);
  const ashore = player.leave();
  check(ashore !== null && (player.state === 'foot' || player.state === 'swim'), 'and is left for the shore or the water', player.state);

  // The plane: a take-off run, a climb, and down again.
  // One far inland: the flight below runs a few thousand units down the
  // strip's heading, and has to come down on land.
  const plane =
    sites.find((site) => site.kind === 'plane' && shoreDistance(latOf(site.at.y), lonOf(site.at.x, site.at.z)) > 8) ?? byKind.get('plane')![0]!;
  board(plane);
  check(player.mode === 'plane' && player.grounded && !player.airborne, 'a plane is taken on the ground', `${plane.id}, ${places[plane.place]!.name}`);
  check(player.leave() !== null, 'and can be left there');
  board(plane);
  events.length = 0;
  let liftOff = -1;
  let firstSecond = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    step(1 / 60, { climb: true });
    if (liftOff < 0 && events.includes('took-off')) {
      liftOff = player.altitude;
      // The run has to fit the strip it starts on, with room to spare.
      const run = units(plane.at, player.position.clone().normalize());
      check(run < STRIP_LENGTH - 30, 'a take-off run leaves the ground well inside its strip', `${run.toFixed(0)} units of ${STRIP_LENGTH}`);
    }
    else if (liftOff >= 0 && firstSecond < 60) firstSecond++;
    if (firstSecond === 60) {
      check(player.altitude - liftOff < 15, 'a take-off climbs gently off the ground, not to a circuit', `${(player.altitude - liftOff).toFixed(1)} units in its first second`);
      firstSecond++;
    }
  }
  check(events.includes('took-off') && player.airborne, 'holding the climb key takes off', `${player.altitude.toFixed(0)} up, ${player.velocity.toFixed(0)} units/s`);
  step(3, { climb: true });
  const climbed = player.altitude;
  step(3, {});
  const held = player.altitude;
  step(2, {});
  check(Math.abs(player.altitude - held) < held * 0.01 && held >= climbed, 'letting go of the climb levels off', `${climbed.toFixed(0)} then ${held.toFixed(0)} then ${player.altitude.toFixed(0)}`);
  step(1, { run: true });
  check(player.altitude < held - 3, 'the run key descends in the air', `${held.toFixed(0)} then ${player.altitude.toFixed(0)}`);
  // Down with the throttle held open all the way, as a hand on `W` does.
  for (seconds = 0; seconds < 120 && !player.grounded; seconds += 1 / 60) step(1 / 60, { run: true, y: 1 });
  check(player.grounded && events.some((event) => event === 'landed'), 'holding the run key lands it', `after ${seconds.toFixed(1)} s; ${events.join(', ')}`);
  // Landed with the throttle still open: it rolls out, it does not take off again.
  events.length = 0;
  step(4, { y: 1 });
  check(player.grounded && !events.includes('took-off'), 'a landing with the throttle held rolls out rather than taking off again', `${player.velocity.toFixed(0)} units/s`);
  step(4, { y: -1 });
  check(player.leave() !== null && player.state !== 'seated', 'and it is left on the ground');

  // The take-off on the throttle alone: held, it runs and lifts off by itself, inside its strip, and climbs out.
  board(plane);
  events.length = 0;
  let throttleRun = -1;
  for (let t = 0; t < 8 && throttleRun < 0; t += 1 / 60) {
    step(1 / 60, { y: 1 });
    if (events.includes('took-off')) throttleRun = units(plane.at, player.position.clone().normalize());
  }
  const lifted = player.altitude;
  step(3, { y: 1 });
  check(throttleRun > 0 && throttleRun < STRIP_LENGTH - 30 && player.altitude > lifted + 15,
    'holding the throttle alone takes off inside its strip and climbs out', `${throttleRun.toFixed(0)} units of ${STRIP_LENGTH}, ${(player.altitude - lifted).toFixed(0)} up in 3 s`);
  for (seconds = 0; seconds < 120 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
  check(player.grounded, 'and the descend key lands it too', `after ${seconds} s`);
  check(player.leave() !== null, 'and it is left there');

  // Full control: the stick pitches and rolls the plane, through a loop and
  // upside down, a stall drops the nose, the mode key hands it back, and the
  // ground takes a fair touchdown and knocks off a bad one.
  {
    board(plane);
    const radial = (): Vector3 => player.position.clone().normalize();
    // Up into the low air, where the loops are flown, and level there.
    const over = (): number => player.position.length() - ground(radial());
    const climbTo = (height: number): void => {
      for (let t = 0; t < 60 && over() < height; t += 1 / 60) step(1 / 60, { climb: true });
      step(3, {});
    };
    climbTo(450);
    const wire: number[] = [];
    const upness = (): number => {
      player.pose(wire);
      return new Vector3(wire[6], wire[7], wire[8]).dot(radial());
    };
    // Only the mode key takes the plane into full control: the stick in travel turns and climbs.
    step(1, { flightMode: true });
    const startForward = player.forward.clone();
    events.length = 0;
    let top = 0;
    let turned = 0;
    for (let t = 0; t < 8; t += 1 / 60) {
      step(1 / 60, { pitch: 1 });
      top = Math.max(top, Math.abs(player.nosePitch));
      turned = Math.max(turned, startForward.angleTo(player.forward.clone().projectOnPlane(player.up)));
    }
    check(player.aerobatic && top > 2.8 && !events.includes('crashed'),
      'holding the nose up flies a loop, in full control', `nose to ${top.toFixed(2)} rad, ${player.altitude.toFixed(0)} up`);
    check(turned < 0.35, 'and the heading the camera chases holds through it', `${(turned * 180 / Math.PI).toFixed(1)} degrees`);
    step(1, { flightMode: true });
    step(8, {});
    check(!player.aerobatic && Math.abs(upness() - 1) < 0.05, 'the mode key levels it and hands back travel', `up ${upness().toFixed(3)}`);
    step(1, { flightMode: true });
    let inverted = 1;
    for (let t = 0; t < 1.6; t += 1 / 60) {
      step(1 / 60, { roll: 1 });
      inverted = Math.min(inverted, upness());
    }
    check(player.aerobatic && inverted < -0.9, 'rolling takes it upside down, and the pose sent says so', `up ${inverted.toFixed(2)} at the least`);
    step(1, { flightMode: true });
    step(8, {});
    // Up to the vertical with the throttle shut, then let go: it slows, stalls and the nose falls through.
    climbTo(600);
    const stallFrom = player.altitude;
    const stallSpeed = AERO_LIFT_SPEED * AERO_STALL * airAt(stallFrom);
    step(1, { flightMode: true });
    for (let t = 0; t < 4 && player.nosePitch < 1.3; t += 1 / 60) step(1 / 60, { pitch: 1, y: -1 });
    let slowest = Infinity;
    let peak = -Infinity;
    let lowestNose = Infinity;
    for (let t = 0; t < 15; t += 1 / 60) {
      step(1 / 60, { y: -1 });
      slowest = Math.min(slowest, player.speed);
      peak = Math.max(peak, player.nosePitch);
      if (slowest < stallSpeed) lowestNose = Math.min(lowestNose, player.nosePitch);
    }
    check(slowest < stallSpeed && lowestNose < peak - 0.6, 'pulled up to the vertical with the throttle shut it stalls and the nose drops',
      `${slowest.toFixed(0)} units/s at the slowest, the nose from ${peak.toFixed(2)} to ${lowestNose.toFixed(2)}, from ${stallFrom.toFixed(0)} up`);
    step(1, { flightMode: true });
    step(10, {});
    // Upside down into the ground: a knock, told, and still flying over it.
    events.length = 0;
    climbTo(450);
    step(1, { flightMode: true });
    for (let t = 0; t < 1.2; t += 1 / 60) step(1 / 60, { roll: 1 });
    // On its back the pull takes the nose to the ground; then let go.
    step(1, { pitch: 1 });
    let lowest = Infinity;
    for (let t = 0; t < 40 && !events.includes('crashed'); t += 1 / 60) {
      step(1 / 60, {});
      lowest = Math.min(lowest, player.position.length() - ground(radial()));
    }
    check(events.includes('crashed') && player.airborne && !player.grounded && lowest > -0.01,
      'flown into the ground upside down it knocks off it, and is never under it', `${events.join(', ')}; lowest ${lowest.toFixed(2)}`);
    step(1, { flightMode: true });
    step(10, {});
    for (seconds = 0; seconds < 180 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
    check(!player.aerobatic && player.grounded && player.leave() !== null, 'levelled, it lands in travel and is left', `after ${seconds} s`);
  }

  // Out of a plane in flight: a fall, a canopy near the ground, and down.
  board(plane);
  step(24, { climb: true });
  const bailedAt = player.altitude - (ground(player.position.clone().normalize()) - PLANET_RADIUS);
  check(player.leave() !== null && player.state === 'foot' && player.parachute && player.airborne && player.ride === null && bailedAt > 150,
    'out of a plane in flight is a jump, with a parachute', `${bailedAt.toFixed(0)} units over the ground`);
  check(!player.canopy, 'the fall starts with the canopy packed');
  step(0.5, { jump: true });
  const opened = player.canopy;
  step(0.5, { jump: true });
  check(opened && !player.canopy && player.parachute, 'the jump key opens the canopy, and stows it again high up');
  let underCanopy = 0;
  let forced = false;
  let stowedLow = false;
  for (seconds = 0; seconds < 120 && player.parachute; seconds += 1 / 60) {
    const over = player.position.length() - ground(player.position.clone().normalize());
    if (!forced && player.canopy && over < 120) {
      // Opened by itself near the ground, and the jump key cannot take it away.
      forced = true;
      step(1 / 60, { jump: true });
      stowedLow = !player.canopy;
    }
    step(1 / 60, { y: 1 });
    const left = player.position.length() - ground(player.position.clone().normalize());
    if (player.parachute && left < 40) underCanopy = Math.max(underCanopy, -player.climb);
  }
  check(forced && !stowedLow, 'near the ground the canopy opens by itself, and stays open', `${forced} ${stowedLow}`);
  check(!player.parachute && !player.airborne && (player.state === 'foot' || player.state === 'swim') && underCanopy < 10,
    'and comes down under its canopy, slowly, on the ground or in the water', `after ${seconds.toFixed(1)} s, ${player.state}, sinking ${underCanopy.toFixed(1)} units/s at the end`);

  // The balloon: up, not out, down, out.
  const balloon = byKind.get('balloon')![0]!;
  board(balloon);
  events.length = 0;
  step(4, { climb: true });
  check(player.airborne && player.altitude - (ground(balloon.at) - PLANET_RADIUS) > 10, 'a balloon rises on the climb key', `${(player.altitude - (ground(balloon.at) - PLANET_RADIUS)).toFixed(1)} over the ground`);
  for (seconds = 0; seconds < 60 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
  check(player.grounded, 'sinks until it sets down', `after ${seconds} s`);
  check(player.leave() !== null && player.state !== 'seated', 'and is left where it landed');

  // The rest: each taken where the fleet stands it, driven on `W` a few
  // seconds, and left. The speeds are on the relief with no made ground, so a
  // kind that keeps less of its pace off a road keeps all of it here.
  const faster = (id: string, want: number, run = false, settle = 1.3): void => {
    const site = sites.find((entry) => entry.model === id && !isWater(ground(entry.at)));
    if (site === undefined) {
      check(false, `a ${id} stands somewhere`);
      return;
    }
    board(site);
    const start = player.position.clone();
    // Long enough for the throttle's ease to all but close: three of its time constants.
    const seconds = Math.max(4, 3 * settle);
    step(seconds, { y: 1, run });
    const went = units(start.clone().normalize(), player.position.clone().normalize());
    const off = Math.abs(player.position.length() - ground(player.position.clone().normalize()));
    check(player.state === 'seated' && (Math.abs(player.velocity - want) < want * 0.12 || went < 20), `a ${id} is driven at its own pace`, `${player.velocity.toFixed(1)} units/s against ${want}, ${went.toFixed(0)} units in ${seconds.toFixed(1)} s, ${off.toFixed(2)} off the ground`);
    step(4, { y: -1 });
    check(player.leave() !== null && player.state !== 'seated', `and the ${id} is left`, player.mode);
  };
  faster('bicycle', ROAD_HANDLING.bicycle!.speed);
  check(player.mode === 'foot', 'off the bicycle, on foot again', player.mode);
  faster('bicycle', ROAD_HANDLING.bicycle!.boost, true);
  faster('motorbike', ROAD_HANDLING.motorbike!.speed);
  faster('scooter', ROAD_HANDLING.motorbike!.speed);
  faster('tuk-tuk', ROAD_HANDLING.tuktuk!.speed);
  faster('bus', ROAD_HANDLING.bus!.speed, false, ROAD_HANDLING.bus!.accelerationTime);
  faster('jeep', ROAD_HANDLING.jeep!.speed);
  faster('tractor', ROAD_HANDLING.tractor!.speed);
  faster('horse', ROAD_HANDLING.horse!.speed);
  faster('horse', ROAD_HANDLING.horse!.boost, true);
  {
    // A horse turns on the spot, which nothing on wheels does.
    const horse = sites.find((entry) => entry.model === 'horse')!;
    board(horse);
    const facing = player.forward.clone();
    step(1, { x: 1 });
    check(facing.angleTo(player.forward) > 0.3, 'a horse turns standing still', `${facing.angleTo(player.forward).toFixed(2)} rad in a second`);
    player.leave();
  }
  for (const id of ['jet-ski', 'sailboat']) {
    const hull = sites.find((entry) => entry.model === id)!;
    board(hull);
    step(3, { y: 1 });
    const want = WATER_HANDLING[craft.get(id)!.kind]!;
    check(player.mode === (id === 'jet-ski' ? 'jetski' : 'sailboat') && Math.abs(player.position.length() - PLANET_RADIUS - 0.5) < 1e-6 && player.velocity > 0,
      `a ${id} sails on the waterline`, `${player.velocity.toFixed(1)} units/s of ${want.speed}`);
    const off = player.leave();
    check(off !== null && player.state !== 'seated', `and the ${id} is left for the shore or the water`, player.state);
  }
  {
    // The helicopter: straight up once the rotor has wound up, a hover, a
    // run forward, not out in the air, and down again.
    // One far inland, so the flight comes down on land.
    const pad =
      sites.find((site) => site.kind === 'helicopter' && shoreDistance(latOf(site.at.y), lonOf(site.at.x, site.at.z)) > 4) ?? byKind.get('helicopter')![0]!;
    board(pad);
    check(player.mode === 'helicopter' && player.grounded, 'a helicopter is taken on its pad', `${pad.id}, ${places[pad.place]!.name}`);
    events.length = 0;
    const floor = player.altitude;
    step(HELI_SPOOL * 0.5, { climb: true });
    check(player.grounded, 'it does not lift before its rotor has wound up');
    step(HELI_SPOOL + 2, { climb: true });
    const lifted = player.altitude - floor;
    check(events.includes('took-off') && player.airborne && lifted > 10, 'holding the climb key lifts it straight up', `${lifted.toFixed(1)} units up`);
    check(units(pad.at, player.position.clone().normalize()) < 3, 'and straight up means where it stood', `${units(pad.at, player.position.clone().normalize()).toFixed(2)} units off its pad`);
    step(2, {});
    const hovering = player.altitude;
    step(2, {});
    check(Math.abs(player.altitude - hovering) < 1 && player.velocity < 1, 'let go, it hovers', `${(player.altitude - hovering).toFixed(2)} units and ${player.velocity.toFixed(2)} units/s`);
    step(4, { y: 1 });
    check(Math.abs(player.velocity - HELI_SPEED) < HELI_SPEED * 0.1, 'W flies it forward at its cruise', `${player.velocity.toFixed(1)} units/s`);
    step(3, { y: -1 });
    let seconds = 0;
    for (; seconds < 60 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
    const wet = isWater(ground(player.position.clone().normalize()));
    check(player.grounded || wet, 'holding descend sets it down', `after ${seconds} s${wet ? ', over water' : ''}; ${events.join(', ')}`);
    if (player.grounded) check(player.leave() !== null && player.state !== 'seated', 'and it is left on the ground');
    else player.goTo(latOf(pad.at.y), lonOf(pad.at.x, pad.at.z));
  }

  // A car into a wall: it stops at it, comes back off it, and says so.
  {
    const hits: { event: string; strength: number }[] = [];
    const up = car.at.clone();
    const wallAt = car.at.clone().addScaledVector(car.forward, 40 / PLANET_RADIUS).normalize();
    const normal = car.forward.clone().negate();
    const crashing = createPlayer(world, 41.39, 2.17, {
      onEvent: (event, strength) => hits.push({ event, strength }),
      collide: (point, radius, push) => {
        // A wall square across the road, 40 units ahead of the car's site.
        const gap = point.clone().normalize().sub(wallAt).dot(normal) * PLANET_RADIUS;
        if (gap >= radius) return false;
        push.copy(normal).multiplyScalar(radius - gap);
        return true;
      },
    });
    const model = craft.get(car.model)!;
    crashing.board({ vehicle: car.id, seat: 0, model, group: model.build(0) }, writePose(up.clone().multiplyScalar(ground(car.at)), car.forward, up, []));
    for (let t = 0; t < 4; t += 1 / 60) {
      heading.copy(crashing.forward);
      crashing.update(1 / 60, { move: { x: 0, y: 1 }, run: true, jump: false, heading });
    }
    const beyond = crashing.position.clone().normalize().sub(wallAt).dot(normal) * PLANET_RADIUS;
    const crash = hits.find((hit) => hit.event === 'crashed');
    check(crash !== undefined && crash.strength > 0, 'a car driven into a wall crashes, and says how hard', crash === undefined ? hits.map((hit) => hit.event).join(', ') : `${crash.strength.toFixed(1)} units/s lost`);
    check(beyond > 0, 'and does not pass through it', `${beyond.toFixed(2)} units short of it`);
  }

  // A craft in the air against a building: a wall square across its way, and
  // behind it everything under a roof `roof` over the ground. Near the ground
  // `collide` answers for it, higher `collideAloft`, which a roof passes under.
  {
    type Push = (point: Vector3, radius: number, push: Vector3) => boolean;
    const wallOf = (site: FleetSite, ahead: number, roof: number): { collide: Push; collideAloft: Push; gap: (point: Vector3) => number } => {
      const wallAt = site.at.clone().addScaledVector(site.forward, ahead / PLANET_RADIUS).normalize();
      const normal = site.forward.clone().negate();
      const gap = (point: Vector3): number => point.clone().normalize().sub(wallAt).dot(normal) * PLANET_RADIUS;
      const collide: Push = (point, radius, push) => {
        const g = gap(point);
        if (g >= radius) return false;
        push.copy(normal).multiplyScalar(radius - g);
        return true;
      };
      return {
        collide,
        collideAloft: (point, radius, push) => {
          if (point.length() >= roof) {
            push.set(0, 0, 0);
            return false;
          }
          return collide(point, radius, push);
        },
        gap,
      };
    };
    const fly = (who: ReturnType<typeof createPlayer>, seconds: number, input: { y?: number; climb?: boolean; dive?: boolean }, each?: () => void): void => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        heading.copy(who.forward);
        who.update(1 / 60, { move: { x: 0, y: input.y ?? 0 }, run: false, jump: false, heading, climb: input.climb ?? false, dive: input.dive ?? false });
        each?.();
      }
    };
    const balloonModel = craft.get(balloon.model)!;
    const basket = balloonModel.size[1] / 9;
    const floor = ground(balloon.at);

    // Low, into the wall: it stops at it and never enters it.
    {
      const roof = floor + 60;
      const wall = wallOf(balloon, 30, roof);
      const drifting = createPlayer(world, 41.39, 2.17, { collide: wall.collide, collideAloft: wall.collideAloft });
      drifting.board({ vehicle: balloon.id, seat: 0, model: balloonModel, group: balloonModel.build(0) }, writePose(balloon.at.clone().multiplyScalar(floor), balloon.forward, balloon.at, []));
      fly(drifting, 2.5, { climb: true });
      let nearest = Infinity;
      fly(drifting, 12, { y: 1 }, () => { nearest = Math.min(nearest, wall.gap(drifting.position)); });
      check(drifting.airborne && nearest >= basket - 0.05, 'a balloon drifted into a wall stops at it and never enters it',
        `${nearest.toFixed(2)} units off it at the nearest, a basket ${basket.toFixed(2)} across the half; ${(drifting.position.length() - floor).toFixed(1)} up`);
    }

    // High, over the roof, then down onto it: it passes over, and the roof
    // holds it up rather than letting it be set down inside the building.
    {
      const roof = floor + 18;
      const wall = wallOf(balloon, 30, roof);
      const events: string[] = [];
      const over = createPlayer(world, 41.39, 2.17, { collide: wall.collide, collideAloft: wall.collideAloft, onEvent: (event) => events.push(event) });
      over.board({ vehicle: balloon.id, seat: 0, model: balloonModel, group: balloonModel.build(0) }, writePose(balloon.at.clone().multiplyScalar(floor), balloon.forward, balloon.at, []));
      for (let t = 0; t < 30 && over.position.length() < roof + 25; t += 0.5) fly(over, 0.5, { climb: true });
      fly(over, 1.5, {});
      let seconds = 0;
      for (; seconds < 20 && wall.gap(over.position) > -40; seconds += 0.5) fly(over, 0.5, { y: 1 });
      const across = wall.gap(over.position);
      let lowest = Infinity;
      fly(over, 25, { dive: true }, () => { lowest = Math.min(lowest, over.position.length()); });
      check(across < -basket && lowest >= roof - 0.05 && !over.grounded && !events.includes('landed'),
        'a balloon passes over a roof it clears, and sinking onto it is held up by it, never set down inside',
        `${(-across).toFixed(1)} units past the wall, lowest ${(lowest - roof).toFixed(2)} over the roof, ${over.grounded ? 'landed' : 'aloft'}`);
    }

    // A plane flown low into a tower knocks off it, says so, and is not through it.
    {
      const planeModel = craft.get(plane.model)!;
      const floorAt = ground(plane.at);
      const wall = wallOf(plane, 1400, floorAt + 5000);
      const hits: { event: string; strength: number }[] = [];
      const pilot = createPlayer(world, 41.39, 2.17, {
        collide: wall.collide, collideAloft: wall.collideAloft,
        onEvent: (event, strength) => hits.push({ event, strength }),
      });
      pilot.board({ vehicle: plane.id, seat: 0, model: planeModel, group: planeModel.build(0) }, writePose(plane.at.clone().multiplyScalar(floorAt), plane.forward, plane.at, []));
      fly(pilot, 8, { climb: true });
      let nearest = Infinity;
      fly(pilot, 25, {}, () => { nearest = Math.min(nearest, wall.gap(pilot.position)); });
      const crash = hits.find((hit) => hit.event === 'crashed');
      check(crash !== undefined && crash.strength > 0 && nearest > 0 && pilot.airborne,
        'a plane flown into a tower knocks off it, still flying, and never through it',
        crash === undefined ? `${hits.map((hit) => hit.event).join(', ')}; ${nearest.toFixed(1)} off it` : `${crash.strength.toFixed(0)} units/s lost, ${nearest.toFixed(2)} off it at the nearest`);
    }
  }

  // A vehicle standing in the world is a wall to anybody on foot.
  {
    const { createFleet } = await import('../../src/fleet.ts');
    const walker = createPlayer(world, latOf(car.at.y), lonOf(car.at.x, car.at.z));
    const fleet = createFleet({ ...source, models: craft, link: createLocalLink('check'), player: walker });
    for (let i = 0; i < 20; i++) fleet.update(0.1);
    const standing = fleet.group.children.find((child) => child.name === 'vehicle:' + craft.get(car.model)!.id);
    const push = new Vector3();
    const inside = standing === undefined ? false : fleet.collide(standing.position.clone(), 1.3, push);
    const pushed = push.length();
    const away = standing === undefined ? true : fleet.collide(standing.position.clone().normalize().multiplyScalar(PLANET_RADIUS + 999), 1.3, push);
    const clear = standing === undefined ? true : fleet.collide(standing.position.clone().applyAxisAngle(new Vector3(0, 1, 0), 30 / PLANET_RADIUS), 1.3, push);
    check(standing !== undefined && inside && pushed > 1 && !away && !clear, 'a parked car pushes a body out of itself, and nothing near it or over it', `${fleet.stats.built} built, push ${pushed.toFixed(2)}`);
  }

  // What stands still until it is taken — a farm's tractor, a town's car, a
  // rack's bicycle — taken with the use key: the fleet's vehicle where it
  // stood and on its ground, in the look and the paint its id decides, which
  // is what the town or the tile merged (`craft/parked.ts`), and folded out
  // of what drew it. A car parked in a colour of its own must come out of its
  // bay in that colour.
  {
    const { createFleet } = await import('../../src/fleet.ts');
    const { countryVehicleId, fleetVariant, parkedArrays, parkedModel } = await import('../../src/craft/parked.ts');
    const { mergeMeshes } = await import('../../src/merge.ts');
    const { PALETTE } = await import('../../src/theme.ts');
    const side = new Vector3().crossVectors(car.at, car.forward).normalize();
    const at = car.at.clone().addScaledVector(side, 25 / PLANET_RADIUS).normalize();
    const cases = [
      { id: countryVehicleId('tractor', 131, 290, 0)!, model: 'tractor', paint: null },
      { id: `hatchback:${car.place}:12`, model: 'hatchback', paint: PALETTE.crimson },
      { id: `bicycle:${car.place}:17`, model: 'bicycle', paint: null },
    ];
    const wrong: string[] = [];
    for (const still of cases) {
      const walker = createPlayer(world, latOf(at.y), lonOf(at.x, at.z));
      const hidden: string[] = [];
      const bay = { id: still.id, model: still.model, position: at.clone().multiplyScalar(ground(at)), forward: car.forward.clone(), paint: still.paint };
      const fleet = createFleet({
        ...source,
        models: craft,
        link: createLocalLink(`still-${still.model}`),
        player: walker,
        parked: {
          near: (_viewer, _radius, out) => {
            if (!hidden.includes(bay.id)) out.push(bay);
          },
          hide: (id) => hidden.push(id),
          paintOf: (id) => (id === bay.id ? still.paint : null),
        },
      });
      for (let i = 0; i < 5; i++) fleet.update(0.1);
      fleet.use();
      // The one of its model nearest the spot: the fleet stands its own sites round the town too.
      const taken = fleet.group.children
        .filter((child) => child.name === `vehicle:${still.model}`)
        .sort((a, b) => a.position.distanceTo(bay.position) - b.position.distanceTo(bay.position))[0];
      const model = parkedModel(still.model)!;
      // Glazed, its glass apart, as a town stands it: the craft whole, its
      // cabin and glass included (a farm's tile paints the same glass opaque
      // and leaves the cabin out, which is `pnpm craft`'s to hold).
      const stood = parkedArrays(model, fleetVariant(still.id, model.variants), still.paint ?? undefined, 1, true);
      const expected = new Float32Array([...stood.color, ...(stood.glass?.color ?? [])]);
      const colours = taken === undefined ? null : mergeMeshes(taken).color;
      // As a multiset of the vertices' colours: the motion hangs the body
      // and the wheels on springs of its own (`craft/motion.ts`), which
      // changes the order a merge walks them in and nothing else.
      const sorted = (array: Float32Array): string[] => {
        const out: string[] = [];
        for (let i = 0; i < array.length; i += 3) out.push(`${array[i]},${array[i + 1]},${array[i + 2]}`);
        return out.sort();
      };
      const same = colours !== null && sorted(colours).join('|') === sorted(expected).join('|');
      const off = taken === undefined ? Infinity : taken.position.distanceTo(bay.position);
      const lift = taken === undefined ? Infinity : taken.position.length() - ground(at);
      if (!same || !hidden.includes(still.id) || off > 0.5 || Math.abs(lift) > 0.5) {
        wrong.push(`${still.id}: ${taken === undefined ? 'not taken' : `${same ? 'same' : 'other'} colours, ${off.toFixed(2)} off its spot, ${lift.toFixed(2)} over the ground`}${hidden.includes(still.id) ? '' : ', not folded away'}`);
      }
    }
    check(wrong.length === 0, "a tractor, a town's car and a rack's bicycle taken are the ones that stood there, where they stood", wrong.join('; ') || cases.map((c) => c.id).join(', '));
  }

  // A car jumped out of goes on without anybody, slows, and is parked where it stops.
  {
    const { createFleet } = await import('../../src/fleet.ts');
    const driver = createPlayer(world, latOf(car.at.y), lonOf(car.at.x, car.at.z));
    const coastLink = createLocalLink('coast');
    const fleet = createFleet({ ...source, models: craft, link: coastLink, player: driver });
    const tick = (seconds: number, y: number): void => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        driver.update(1 / 60, { move: { x: 0, y }, run: false, jump: false, heading: driver.forward.clone() });
        fleet.update(1 / 60);
      }
    };
    const took = await fleet.board(car.id);
    tick(3, 1);
    const going = driver.speed;
    const from = driver.position.clone();
    fleet.use();
    const out = fleet.current() === null && driver.state !== 'seated';
    const pose: number[] = [];
    let seconds = 0;
    for (; seconds < 30 && (coastLink.moved.get(car.id)?.seats[0] ?? null) !== null; seconds += 0.5) tick(0.5, 0);
    fleet.poseOf(car.id, pose);
    const ran = units(from.clone().normalize(), new Vector3(pose[0], pose[1], pose[2]).normalize());
    check(took && out && going > 10 && ran > 5 && (coastLink.moved.get(car.id)?.seats[0] ?? null) === null,
      'a car jumped out of runs on alone, slows, and is parked where it stops', `${ran.toFixed(0)} units on from ${going.toFixed(0)} units/s, parked after ${seconds} s`);
  }

  // And one jumped out of is the jumper's to take again while it still rolls,
  // going as it was.
  {
    const { createFleet } = await import('../../src/fleet.ts');
    const driver = createPlayer(world, latOf(car.at.y), lonOf(car.at.x, car.at.z));
    const rollLink = createLocalLink('roll');
    const fleet = createFleet({ ...source, models: craft, link: rollLink, player: driver });
    const tick = (seconds: number, y: number): void => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        driver.update(1 / 60, { move: { x: 0, y }, run: false, jump: false, heading: driver.forward.clone() });
        fleet.update(1 / 60);
      }
    };
    await fleet.board(car.id);
    tick(3, 1);
    fleet.use();
    tick(0.05, 0);
    const offered = fleet.prompt?.vehicle === car.id && fleet.prompt.seat === 0;
    // `E` is acted on once in `USE_INTERVAL_MS`, by the clock.
    await new Promise((resolve) => setTimeout(resolve, 320));
    fleet.use();
    await Promise.resolve();
    const back = fleet.current()?.vehicle === car.id && driver.state === 'seated';
    const going = driver.speed;
    check(offered && back && going > 5, 'a car jumped out of can be taken again while it still rolls, going as it was',
      `offered ${offered}, back ${back}, ${going.toFixed(1)} units/s`);
  }

  // Every vehicle stands, drawn and solid, well before anybody reaches it, and
  // nothing comes into being in front of anybody. The real fleet, a player
  // run straight at a site from well outside its reach at a run and at a
  // motorbike's boost, with a lens behind him looking the way he goes, round
  // the most crowded regions the sites have: the streamer caps what stands,
  // and the cap must not be a wall (a car at a gate in Utrecht stood 11 units
  // off a motorbike's nose, or never stood at all). Stepped at 30 Hz, which the fleet's scans and builds do not notice.
  {
    const { createFleet } = await import('../../src/fleet.ts');
    const { PerspectiveCamera } = await import('three');
    /** How near a vehicle may still be unbuilt: 1.5 s at a motorbike's boost, 3.3 s at a car's. */
    const STANDS_BY = 120;
    /** How near anything may come into being once the player is under way: a body's reach, many times over. */
    const ARRIVES_BEYOND = 60;
    const index = createSiteIndex(source);
    const crowded: [string, number, number][] = [['Utrecht', 52.09, 5.12], ['the Ruhr', 51.45, 7.0], ['Zhengzhou', 34.75, 113.62], ['Kolkata', 22.57, 88.36], ['Milan', 45.46, 9.19], ['Iowa', 41.6, -93.6]];
    const DT = 1 / 30;
    const late: string[] = [];
    const sudden: string[] = [];
    let runs = 0;
    let nearestStand = Infinity;
    let nearestArrival = Infinity;
    for (const [name, lat, lon] of crowded) {
      const centre = unitAt(lat, lon, new Vector3());
      const around = index.near(centre, 600, []).filter((site) => units(site.at, centre) < 600).sort((a, b) => (a.id < b.id ? -1 : 1));
      const targets = around.filter((_, i) => i % Math.max(1, Math.floor(around.length / 4)) === 0).slice(0, 4);
      for (const speed of [20, 82]) {
        for (const [k, target] of targets.entries()) {
          runs++;
          const up = target.at.clone();
          const east = new Vector3(0, 1, 0).cross(up).normalize();
          const north = up.clone().cross(east).normalize();
          const bearing = (k * 2.4 + speed) % (Math.PI * 2);
          const axis = up.clone().cross(east.multiplyScalar(Math.cos(bearing)).addScaledVector(north, Math.sin(bearing))).normalize();
          const walker = { position: new Vector3(), state: 'walking', ride: null, airborne: false, velocity: new Vector3(), speed: 0 };
          const fleet = createFleet({ ...source, sites: index, models: craft, link: createLocalLink(`approach-${runs}`), player: walker as never });
          const lens = new PerspectiveCamera(45, 16 / 9, 0.5, 20000);
          const pose: number[] = [];
          const push = new Vector3();
          const ahead = new Vector3();
          let standing = -1;
          let before = new Set<Object3D>();
          let frame = 0;
          for (let angle = 1200 / PLANET_RADIUS; angle > -20 / PLANET_RADIUS; angle -= (speed * DT) / PLANET_RADIUS) {
            const at = up.clone().applyAxisAngle(axis, angle);
            walker.position.copy(at).multiplyScalar(ground(at));
            ahead.copy(up).applyAxisAngle(axis, angle - 30 / PLANET_RADIUS);
            lens.position.copy(walker.position).addScaledVector(at, 5).addScaledVector(ahead.clone().sub(at).normalize(), -12);
            lens.up.copy(at);
            lens.lookAt(ahead.multiplyScalar(ground(ahead)));
            fleet.update(DT, lens);
            // What came into being this frame, once the first second of arriving is over.
            const now = new Set(fleet.group.children.filter((child) => child.name.startsWith('vehicle:')));
            if (frame++ > 30) {
              for (const child of now) {
                if (before.has(child)) continue;
                const gap = child.position.distanceTo(walker.position);
                nearestArrival = Math.min(nearestArrival, gap);
                if (gap < ARRIVES_BEYOND) sudden.push(`${child.name} ${gap.toFixed(0)} units off at ${speed} near ${name}`);
              }
            }
            before = now;
            if (standing < 0 && fleet.poseOf(target.id, pose)) {
              const spot = new Vector3(pose[0], pose[1], pose[2]);
              if (fleet.collide(spot, 0.05, push)) standing = spot.distanceTo(walker.position);
            }
          }
          if (standing >= 0) nearestStand = Math.min(nearestStand, standing);
          if (standing < STANDS_BY) late.push(`${target.id} near ${name} at ${speed}: ${standing < 0 ? 'never stood' : `stood ${standing.toFixed(0)} units off`}`);
        }
      }
    }
    check(late.length === 0, `every vehicle run at stands, drawn and solid, before it is ${STANDS_BY} units off`, late.join('; ') || `${runs} runs round ${crowded.length} regions, the nearest ${nearestStand.toFixed(0)} units off`);
    check(sudden.length === 0, `nothing comes into being within ${ARRIVES_BEYOND} units of a player under way`, sudden.slice(0, 5).join('; ') || `the nearest ${nearestArrival.toFixed(0)} units off`);
  }

  // A body put down on a vehicle — a jump, a spawn, a car arriving round
  // somebody standing still — is given the nearest spot clear of it.
  {
    const { createFleet } = await import('../../src/fleet.ts');
    const walker = createPlayer(world, latOf(car.at.y), lonOf(car.at.x, car.at.z));
    const fleet = createFleet({ ...source, models: craft, link: createLocalLink('free'), player: walker });
    for (let i = 0; i < 5; i++) fleet.update(0.1);
    const standing = fleet.group.children.find((child) => child.name.startsWith('vehicle:'));
    const spot = new Vector3();
    const push = new Vector3();
    const freed = standing !== undefined && fleet.freeSpotNear(standing.position.clone(), 1.3, spot);
    const clear = freed && !fleet.collide(spot, 1.3, push);
    const gap = freed ? spot.distanceTo(standing!.position) : 0;
    const already = standing !== undefined && !fleet.freeSpotNear(standing.position.clone().applyAxisAngle(new Vector3(0, 1, 0), 40 / PLANET_RADIUS), 1.3, spot);
    check(freed && clear && already && gap < 12, 'a body inside a vehicle is given the nearest clear spot, and one clear of it is left where it is', `${standing?.name} ${gap.toFixed(2)} units out${clear ? '' : ', and still inside'}${already ? '' : ', and one clear of it moved'}`);
  }

  // A teleport out of a seat is a teleport: on foot, the vehicle let go.
  board(car);
  player.goTo(41.39, 2.17);
  check(player.ride === null && player.state !== 'seated', 'a teleport leaves the vehicle behind');
}
