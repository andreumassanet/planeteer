/**
 * The light plane, headless, over flat ground. Travel, the default, climbs to
 * the ceiling and comes down from it over seconds; the mode key switches to
 * aerobatics and back without a snap. In aerobatics level flight holds its
 * height at the cruise, a high one included, a loop at full throttle never runs past the
 * top speed nor jumps between frames, the frame rate does not change the
 * flight, a bank turns it, and a stall drops the nose.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(here, '../public');
(globalThis as Record<string, unknown>).fetch = async (url: string) => {
  const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
await import('./kit-node.ts');
const { loadWorld, loadLakes } = await import('../src/geo.ts');
const { PLANET_RADIUS, UNITS_PER_DEGREE } = await import('../src/globe.ts');
const { modelsFrom, rigFrom } = await import('../src/kit.ts');
const { craftFrom } = await import('../src/craft/index.ts');
const { horseMaterial } = await import('../src/craft/horse.ts');
const { prepareAvatar } = await import('../src/avatar.ts');
const { createPlayer } = await import('../src/player.ts');
const { writePose } = await import('../src/fleet.ts');
const { unitAt } = await import('../src/sphere.ts');
const { PLANE_CEILING, PLANE_CRUISE_LOW, PLANE_SPEED_RATE, PLANE_THROTTLE_UP } = await import('../src/vehicles.ts');
const { airAt } = await import('../src/player/aerobatics.ts');
const { AERO_GRAVITY, AERO_LIFT_SPEED, AERO_MAX_ACCEL, AERO_STALL, AERO_THRUST } = await import('../src/player/constants.ts');

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const horseRig = await rigFrom(readFileSync(resolve(PUBLIC, 'models/fauna/horse.bin')), 'horse', horseMaterial());
const craft = craftFrom(await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin'))), horseRig);
await prepareAvatar();
const plane = [...craft.values()].find((model) => model.kind === 'plane')!;

/** Flat dry ground, so nothing but the model decides the flight. */
const FLOOR = PLANET_RADIUS + 60;
const LAT = 30;
const LON = 100;

type Keys = { x?: number; y?: number; climb?: boolean; dive?: boolean; pitch?: number; roll?: number; flightMode?: boolean };

/** A plane up and level in the low air, flown at `fps` frames a second. */
async function flying(fps: number) {
  const events: string[] = [];
  const player = createPlayer(world, LAT, LON, { groundAt: () => FLOOR, onEvent: (event) => events.push(event) });
  const heading = new Vector3();
  const dt = 1 / fps;
  const step = (seconds: number, keys: Keys, each?: () => void): void => {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      heading.copy(player.forward);
      player.update(dt, {
        move: { x: keys.x ?? 0, y: keys.y ?? 0 },
        run: false,
        jump: false,
        heading,
        climb: keys.climb ?? false,
        dive: keys.dive ?? false,
        attitude: { pitch: keys.pitch ?? 0, roll: keys.roll ?? 0 },
        flightMode: (keys.flightMode ?? false) && t === 0,
      });
      each?.();
    }
  };
  const at = unitAt(LAT, LON, new Vector3());
  const north = new Vector3(0, 1, 0).projectOnPlane(at).normalize();
  player.board({ vehicle: `${plane.id}:0:0`, seat: 0, model: plane, group: plane.build(0) }, writePose(at.clone().multiplyScalar(FLOOR), north, at, []));
  for (let t = 0; t < 10 && !events.includes('took-off'); t += dt) step(dt, { y: 1 });
  for (let t = 0; t < 60 && player.position.length() - FLOOR < 400; t += dt) step(dt, { climb: true });
  step(4, {});
  return { player, events, step };
}

const over = (player: { position: Vector3 }): number => player.position.length() - FLOOR;

console.log('flight:');
{
  // Travel: the default, up to the ceiling, and down again over seconds.
  const { player, events, step } = await flying(60);
  check(!player.aerobatic, 'a plane takes off in travel');
  for (let t = 0; t < 60 && player.altitude < PLANE_CEILING - 10; t += 1 / 60) step(1 / 60, { climb: true });
  step(2, {});
  const top = player.altitude;
  let seconds = 0;
  let fastest = 0;
  let last = player.altitude;
  for (; seconds < 40 && over(player) > 300; seconds += 1 / 60) {
    step(1 / 60, { dive: true });
    fastest = Math.max(fastest, (last - player.altitude) * 60);
    last = player.altitude;
  }
  check(top > PLANE_CEILING - 20 && seconds > 6 && seconds < 12,
    'held, the descent from the ceiling to the low air takes several seconds', `${seconds.toFixed(1)} s from ${top.toFixed(0)}, ${fastest.toFixed(0)} units/s down at the most`);
  for (seconds = 0; seconds < 120 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
  check(player.grounded && !events.includes('crashed'), 'and holding it lands the plane', `after ${seconds} s more`);
}
{
  // The mode key at the ceiling: aerobatics without a snap, slowing to its own gentle speeds; and back.
  const { player, events, step } = await flying(60);
  for (let t = 0; t < 60 && player.altitude < PLANE_CEILING - 10; t += 1 / 60) step(1 / 60, { climb: true });
  step(2, {});
  const was = player.attitude.clone();
  let jump = 0;
  let turn = 0;
  let last = player.speed;
  const watch = (): void => {
    jump = Math.max(jump, Math.abs(player.speed - last));
    turn = Math.max(turn, was.angleTo(player.attitude));
    last = player.speed;
    was.copy(player.attitude);
  };
  step(1 / 60, { flightMode: true }, watch);
  check(events.includes('aerobatics') && player.aerobatic, 'the mode key switches to aerobatics, and says so');
  step(40, {}, watch);
  const gentle = PLANE_CRUISE_LOW * (1 + PLANE_THROTTLE_UP) * airAt(player.altitude);
  check(player.speed < gentle, 'high up aerobatics slows to its own speeds, not travel\'s', `${player.speed.toFixed(0)} units/s against ${gentle.toFixed(0)}`);
  step(1 / 60, { roll: 1 }, watch);
  step(0.6, { roll: 1 }, watch);
  step(1 / 60, { flightMode: true }, watch);
  step(4, {}, watch);
  check(events.includes('travel') && !player.aerobatic, 'and back to travel, levelling the plane on the way');
  check(jump <= Math.max(AERO_MAX_ACCEL, PLANE_SPEED_RATE) / 60 + 1e-6 && turn < 0.08, 'neither switch snaps the speed or the attitude',
    `${jump.toFixed(2)} units/s and ${turn.toFixed(3)} rad a frame at the most`);
}
{
  // Into full control with a touch of roll, then hands off: the wings come
  // back level and it holds its height at the cruise.
  const { player, step } = await flying(60);
  check(!player.grounded && over(player) > 300, 'the plane takes off and climbs into the low air', `${over(player).toFixed(0)} up`);
  step(1 / 60, { roll: 1 });
  step(20, {});
  const from = over(player);
  step(10, {});
  const cruise = PLANE_CRUISE_LOW * airAt(player.altitude);
  check(player.aerobatic && Math.abs(over(player) - from) < 15 && Math.abs(player.speed - cruise) < cruise * 0.05,
    'let go in full control it flies level, holding its height at the cruise',
    `${(over(player) - from).toFixed(1)} units in 10 s, ${player.speed.toFixed(0)} of ${cruise.toFixed(0)} units/s`);
}
{
  // Loops at full throttle: never past the top speed a dive allows, never a jump.
  const { player, step } = await flying(60);
  step(1 / 60, { roll: 1 });
  step(3, {});
  let fastest = 0;
  let jump = 0;
  let stride = 0;
  let top = 0;
  let highest = 0;
  let last = player.speed;
  const was = player.position.clone();
  step(16, { pitch: 1, y: 1 }, () => {
    fastest = Math.max(fastest, player.speed);
    jump = Math.max(jump, Math.abs(player.speed - last));
    stride = Math.max(stride, player.position.distanceTo(was) / Math.max(player.speed, 1) * 60);
    top = Math.max(top, Math.abs(player.nosePitch));
    highest = Math.max(highest, player.altitude);
    last = player.speed;
    was.copy(player.position);
  });
  const air = airAt(highest);
  const terminal = PLANE_CRUISE_LOW * (1 + PLANE_THROTTLE_UP) * air * Math.sqrt(1 + AERO_GRAVITY / (AERO_THRUST * air));
  check(top > 2.8, 'holding the nose up at full throttle flies loops', `nose to ${top.toFixed(2)} rad`);
  check(fastest < terminal * 1.05, 'and never runs past the top speed of a dive at full throttle', `${fastest.toFixed(0)} against ${terminal.toFixed(0)} units/s`);
  check(jump <= AERO_MAX_ACCEL / 60 + 1e-6, 'nor changes its speed by more than a step allows between two frames', `${jump.toFixed(2)} units/s a frame at the most`);
  check(stride < 1.02, 'and covers no more ground in a frame than its speed', `${stride.toFixed(3)} of a frame's flight at the most`);
}
{
  // The frame rate does not change the flight.
  const runs = [];
  for (const fps of [30, 144]) {
    const { player, step } = await flying(fps);
    step(1 / fps, { roll: 1 });
    step(2, {});
    const start = player.position.clone();
    step(6, { pitch: 1, roll: 0.3, y: 1 });
    runs.push({ speed: player.speed, height: over(player), way: player.position.distanceTo(start) });
  }
  const [a, b] = runs as [typeof runs[0], typeof runs[0]];
  check(Math.abs(a.speed - b.speed) < a.speed * 0.03 && Math.abs(a.height - b.height) < 12 && Math.abs(a.way - b.way) < a.way * 0.03,
    'the same keys fly the same way at 30 and at 144 frames a second',
    `${a.speed.toFixed(1)} / ${b.speed.toFixed(1)} units/s, ${a.height.toFixed(1)} / ${b.height.toFixed(1)} up, ${a.way.toFixed(0)} / ${b.way.toFixed(0)} away`);
}
{
  // A bank turns it: rolled right, the heading comes round to the right.
  const { player, step } = await flying(60);
  const start = player.forward.clone();
  const up = player.up.clone();
  step(0.5, { roll: 1 });
  step(2, {});
  const turned = Math.atan2(new Vector3().crossVectors(start, player.forward).dot(up), start.dot(player.forward));
  check(turned < -0.1, 'a bank to the right turns the plane to the right', `${(turned * 180 / Math.PI).toFixed(1)} degrees`);
}
{
  // Up to the vertical with the throttle shut, then let go: it slows past the stall and the nose falls through.
  const { player, step } = await flying(60);
  for (let t = 0; t < 4 && player.nosePitch < 1.3; t += 1 / 60) step(1 / 60, { pitch: 1, y: -1 });
  const stall = AERO_LIFT_SPEED * AERO_STALL * airAt(player.altitude);
  let slowest = Infinity;
  let peak = -Infinity;
  let lowest = Infinity;
  step(12, { y: -1 }, () => {
    slowest = Math.min(slowest, player.speed);
    peak = Math.max(peak, player.nosePitch);
    if (slowest < stall) lowest = Math.min(lowest, player.nosePitch);
  });
  check(slowest < stall && lowest < peak - 0.6, 'a stall drops the nose',
    `${slowest.toFixed(0)} units/s at the slowest against a stall at ${stall.toFixed(0)}, the nose from ${peak.toFixed(2)} to ${lowest.toFixed(2)}`);
}

console.log(failures === 0 ? '\nflight: all ok' : `\nflight: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
