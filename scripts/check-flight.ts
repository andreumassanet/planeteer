/**
 * The light plane and the helicopter, headless, over flat ground. Travel, the
 * default, answers a climb key within a third of a second, climbs to the
 * ceiling and comes down from it over seconds; the stick keys aloft stay
 * travel's (a roll key turns, a pitch key climbs) and only the mode key goes
 * to aerobatics, and back without a snap. A course's pull (`assist`) eases a
 * plane or a helicopter onto a ring without overshooting, lets any key win at
 * once, does nothing at no strength, and flies the same at any frame rate; a
 * hovering helicopter turns to face the ring and strafes on the roll keys.
 * In aerobatics level flight holds its height at the cruise, a high one
 * included, a loop at full throttle never runs past the top speed nor jumps
 * between frames, the frame rate does not change the flight, a bank turns it,
 * and a stall drops the nose.
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
const { unitAt, latOf } = await import('../src/sphere.ts');
const { createCameraRig } = await import('../src/camera.ts');
const { FOUNDER_DRAG, FOUNDER_TIME, HELI_SPOOL, PLANE_DITCH_SPEED, PLANE_CEILING, PLANE_CLIMB_MIN, PLANE_CLIMB_RATE, PLANE_CLIMB_SLOPE, PLANE_CRUISE_LOW, PLANE_SPEED_RATE, PLANE_THROTTLE_UP } = await import('../src/vehicles.ts');
const { airAt } = await import('../src/player/aerobatics.ts');
const { AERO_GRAVITY, AERO_LIFT_SPEED, AERO_MAX_ACCEL, AERO_STALL, AERO_THRUST, ASSIST_NEAR, PLANE_BANK } = await import('../src/player/constants.ts');
const { COURSE_RING_RADIUS, PERFECT_SHARE } = await import('../src/rings/layout.ts');

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
const helicopter = [...craft.values()].find((model) => model.kind === 'helicopter')!;

/** Flat dry ground, so nothing but the model decides the flight. */
const FLOOR = PLANET_RADIUS + 60;
const LAT = 30;
const LON = 100;
const DEG = Math.PI / 180;
/** A pass this near a ring's centre is a perfect one (`rings/layout.ts`). */
const PERFECT = COURSE_RING_RADIUS * PERFECT_SHARE;

type Collide = (point: Vector3, radius: number, push: Vector3) => boolean;
type Walls = { collide: Collide; collideAloft: Collide; strike?: (from: Vector3, to: Vector3, radius: number) => number };

type Keys = {
  x?: number; y?: number; climb?: boolean; dive?: boolean; pitch?: number; roll?: number; flightMode?: boolean;
  assist?: { target: Vector3; strength: number } | null;
};

/** An aircraft of `model` standing on the ground, flown at `fps` frames a second. */
function aboard(model: typeof plane, fps: number, groundAt: (point: Vector3) => number = () => FLOOR, walls?: Walls) {
  const events: string[] = [];
  const player = createPlayer(world, LAT, LON, { groundAt, onEvent: (event) => events.push(event), ...(walls ?? {}) });
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
        assist: keys.assist ?? null,
      });
      each?.();
    }
  };
  const at = unitAt(LAT, LON, new Vector3());
  const north = new Vector3(0, 1, 0).projectOnPlane(at).normalize();
  player.board({ vehicle: `${model.id}:0:0`, seat: 0, model, group: model.build(0) }, writePose(at.clone().multiplyScalar(FLOOR), north, at, []));
  return { player, events, step, dt };
}

/** A plane up and level in the low air, `upTo` over the ground. */
async function flying(fps: number, upTo = 400, groundAt?: (point: Vector3) => number, walls?: Walls) {
  const flight = aboard(plane, fps, groundAt, walls);
  const { player, events, step, dt } = flight;
  for (let t = 0; t < 10 && !events.includes('took-off'); t += dt) step(dt, { y: 1 });
  for (let t = 0; t < 60 && over(player) < upTo; t += dt) step(dt, { climb: true });
  step(4, {});
  return flight;
}

/** The same plane taken into aerobatics by the mode key, and settled there. */
async function aerobatic(fps: number, groundAt?: (point: Vector3) => number) {
  const flight = await flying(fps, 400, groundAt);
  flight.step(flight.dt, { flightMode: true });
  flight.step(2, {});
  return flight;
}

/** A helicopter up and hovering `upTo` over the ground. */
async function hovering(fps: number, upTo = 120, groundAt?: (point: Vector3) => number, walls?: Walls) {
  const flight = aboard(helicopter, fps, groundAt, walls);
  const { player, step, dt } = flight;
  for (let t = 0; t < HELI_SPOOL + 30 && over(player) < upTo; t += dt) step(dt, { climb: true });
  step(2, {});
  return flight;
}

const over = (player: { position: Vector3 }): number => player.position.length() - FLOOR;

/** A ring's centre `ahead` units along the ground, `left` radians off the bow, `rise` over the aircraft. */
function ringAt(player: { position: Vector3; forward: Vector3; up: Vector3 }, ahead: number, left: number, rise: number): Vector3 {
  const dir = player.forward.clone().applyAxisAngle(player.up, left);
  return player.position.clone().addScaledVector(dir, ahead).setLength(player.position.length() + rise);
}

/** The ring's bearing off the bow, radians, positive to the left; and its distance along the ground. */
function bearingTo(player: { position: Vector3; forward: Vector3; up: Vector3 }, target: Vector3): { bearing: number; distance: number } {
  const toward = target.clone().sub(player.position);
  toward.addScaledVector(player.up, -toward.dot(player.up));
  const distance = toward.length();
  toward.normalize();
  const cross = new Vector3().crossVectors(player.forward, toward);
  return { bearing: Math.atan2(cross.dot(player.up), player.forward.dot(toward)), distance };
}

/**
 * Flies `seconds` on `keys` towards `target`, judged up to the pass (the ring
 * once behind is another ring's business): the nearest pass and where it was,
 * the bearing's worst swing back once it had settled, and the height's worst
 * overshoot.
 */
function pursue(flight: Awaited<ReturnType<typeof flying>>, target: Vector3, seconds: number, keys: Keys) {
  const { player, step } = flight;
  const targetRadius = target.length();
  const startRadius = player.position.length();
  const rising = targetRadius > startRadius;
  let nearest = Infinity;
  const passAt = new Vector3();
  let settled = false;
  let passed = false;
  let swing = 0;
  let overshoot = 0;
  step(seconds, { ...keys, assist: { target, strength: keys.assist?.strength ?? 1 } }, () => {
    if (passed) return;
    const apart = player.position.distanceTo(target);
    if (apart < nearest) {
      nearest = apart;
      passAt.copy(player.position);
    }
    const { bearing, distance } = bearingTo(player, target);
    if (Math.abs(bearing) > 90 * DEG) passed = true;
    else if (distance > 150) {
      if (Math.abs(bearing) < 2 * DEG) settled = true;
      if (settled) swing = Math.max(swing, Math.abs(bearing));
    }
    const past = rising ? player.position.length() - targetRadius : targetRadius - player.position.length();
    overshoot = Math.max(overshoot, past);
  });
  return { nearest, passAt, settled, swing, overshoot };
}

console.log('flight:');
{
  // Travel: the default; a climb key answered within a third of a second; up
  // to the ceiling, and down again over seconds.
  const { player, events, step } = await flying(60);
  check(!player.aerobatic, 'a plane takes off in travel');
  const asked = Math.max(PLANE_CLIMB_MIN, player.speed * PLANE_CLIMB_SLOPE, over(player) * PLANE_CLIMB_RATE);
  let last = player.altitude;
  let rate = 0;
  step(0.3, { climb: true }, () => {
    rate = (player.altitude - last) * 60;
    last = player.altitude;
  });
  check(rate > asked * 0.55, 'the climb key is answered within a third of a second', `${rate.toFixed(0)} of ${asked.toFixed(0)} units/s after 0.3 s`);
  for (let t = 0; t < 60 && player.altitude < PLANE_CEILING - 10; t += 1 / 60) step(1 / 60, { climb: true });
  step(2, {});
  const top = player.altitude;
  let seconds = 0;
  let fastest = 0;
  last = player.altitude;
  for (; seconds < 40 && over(player) > 300; seconds += 1 / 60) {
    step(1 / 60, { dive: true });
    fastest = Math.max(fastest, (last - player.altitude) * 60);
    last = player.altitude;
  }
  check(top > PLANE_CEILING - 20 && seconds > 3.5 && seconds < 10,
    'held, the descent from the ceiling to the low air takes several seconds', `${seconds.toFixed(1)} s from ${top.toFixed(0)}, ${fastest.toFixed(0)} units/s down at the most`);
  for (seconds = 0; seconds < 120 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
  check(player.grounded && !events.includes('crashed'), 'and holding it lands the plane', `after ${seconds} s more`);
}
{
  // The stick keys aloft are travel's own: a roll key turns like the movement
  // keys, a pitch key climbs and descends, and none of them switches the mode.
  const { player, events, step } = await flying(60);
  const start = player.forward.clone();
  const up = player.up.clone();
  step(1.5, { roll: 1 });
  const turned = Math.atan2(new Vector3().crossVectors(start, player.forward).dot(up), start.dot(player.forward));
  check(!player.aerobatic && !events.includes('aerobatics') && turned < -20 * DEG,
    'the roll key aloft turns the plane in travel and does not switch the mode', `${(turned / DEG).toFixed(1)} degrees`);
  step(1, {});
  const from = player.altitude;
  step(1.5, { pitch: 1 });
  const climbed = player.altitude - from;
  step(1.5, { pitch: -1 });
  check(!player.aerobatic && climbed > 20 && player.altitude < from + climbed - 20,
    'the pitch keys climb and descend in travel', `${climbed.toFixed(0)} up, then ${(from + climbed - player.altitude).toFixed(0)} down`);
}
for (const fps of [30, 60, 144]) {
  // The bank in travel eases in and out: as the roll key goes down and comes
  // up, the bank's rate builds from nothing rather than jumping, at any frame
  // rate, and it comes back level without swinging past it.
  const { player, step, dt } = await flying(fps);
  const level = new Vector3();
  const bankOf = (): number => {
    level.set(1, 0, 0).applyQuaternion(player.attitude);
    return Math.atan2(level.y, level.x);
  };
  let last = bankOf();
  let rate = 0;
  let jerk = 0;
  let past = 0;
  let deepest = 0;
  const watch = (): void => {
    const bank = bankOf();
    const now = (bank - last) / dt;
    jerk = Math.max(jerk, Math.abs(now - rate));
    rate = now;
    last = bank;
    deepest = Math.max(deepest, Math.abs(bank));
  };
  step(1.2, { roll: 1 }, watch);
  const held = bankOf();
  step(2, {}, () => {
    watch();
    if (Math.sign(last) === -Math.sign(held)) past = Math.max(past, Math.abs(last));
  });
  // No frame changes the bank's rate by more than a share of what a roll eased
  // at a fifth of a second (a snap) takes in its very first frame.
  const snap = (PLANE_BANK * (1 - Math.exp(-dt / 0.2))) / dt;
  check(jerk < 0.4 * snap && deepest > 0.4, `${fps} fps: the bank eases into a turn and out of it, no snap`,
    `${jerk.toFixed(2)} rad/s of change in a frame at most against a snap's ${snap.toFixed(2)}, ${(deepest / DEG).toFixed(0)} degrees of bank`);
  check(past < 0.5 * DEG && Math.abs(bankOf()) < 0.5 * DEG, `${fps} fps: and levels without swinging past level`, `${(past / DEG).toFixed(2)} degrees past`);
}
{
  // Let down onto the sea with the descend key, a plane comes down on the
  // water instead of going round, skids on a little and founders.
  let sea = false;
  const { player, events, step } = await flying(60, 300, () => (sea ? PLANET_RADIUS : FLOOR));
  sea = true;
  let downAt: Vector3 | null = null;
  let seconds = 0;
  for (; seconds < 120 && !events.includes('foundered'); seconds += 1 / 60) step(1 / 60, { dive: true });
  downAt = player.position.clone();
  check(events.includes('foundered') && !events.includes('water-refused'), 'a plane let down onto the sea comes down on it', `after ${seconds.toFixed(1)} s`);
  step(FOUNDER_TIME + 0.2, {});
  const skid = downAt.distanceTo(player.position);
  check(skid > 10 && skid < PLANE_DITCH_SPEED * FOUNDER_DRAG * 1.2, 'skids on a little', `${skid.toFixed(0)} units`);
  check(player.sunk && player.position.length() < PLANET_RADIUS, 'and founders under the water');
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
  // Into aerobatics travel's ceiling speed is braked over about a second, not kept and not snapped.
  const fast = player.speed;
  let braking = 0;
  const brake = (): void => {
    braking = Math.max(braking, (last - player.speed) / Math.max(last, 1));
    last = player.speed;
    was.copy(player.attitude);
  };
  step(1 / 60, { flightMode: true }, brake);
  check(events.includes('aerobatics') && player.aerobatic, 'the mode key switches to aerobatics, and says so');
  step(1.5, {}, brake);
  const quick = PLANE_CRUISE_LOW * (1 + PLANE_THROTTLE_UP) * airAt(player.altitude) * 1.5;
  check(player.speed < quick && braking < 0.06, 'from travel\'s ceiling speed aerobatics brakes to its own within seconds, without a snap',
    `${fast.toFixed(0)} to ${player.speed.toFixed(0)} units/s in 1.5 s against ${quick.toFixed(0)}, at most ${(braking * 100).toFixed(1)}% a frame`);
  step(40, {}, watch);
  jump = 0;
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
  // A ring ahead and to the left, lower: holding the throttle alone, the plane
  // banks onto it, settles on its bearing without swinging back, comes down to
  // its height without going under it, and passes through its middle.
  const flight = await flying(60);
  const { player } = flight;
  const target = ringAt(player, 900, 35 * DEG, -90);
  const { nearest, settled, swing, overshoot } = pursue(flight, target, 9, { y: 1 });
  check(nearest < PERFECT, 'with the throttle alone held, the pull threads the ring', `${nearest.toFixed(1)} from its centre, a perfect pass under ${PERFECT.toFixed(1)}`);
  check(settled && swing < 4 * DEG, 'settling on its bearing without overshooting', `${(swing / DEG).toFixed(2)} degrees back at the most`);
  check(overshoot < 6, 'and onto its height without overshooting', `${overshoot.toFixed(1)} units past it at the most`);
}
{
  // The keys win at once: the stick turns away from the ring and the climb key
  // climbs away from it; and at no strength the pull does nothing.
  const flight = await flying(60);
  const { player, step } = flight;
  const target = ringAt(player, 750, 40 * DEG, -90);
  const from = player.altitude;
  const start = player.forward.clone();
  const up = player.up.clone();
  step(2, { x: 1, climb: true, assist: { target, strength: 1 } });
  const turned = Math.atan2(new Vector3().crossVectors(start, player.forward).dot(up), start.dot(player.forward));
  check(turned < -60 * DEG && player.altitude > from + 100, 'a key held wins over the pull at once',
    `${(turned / DEG).toFixed(0)} degrees away from the ring, ${(player.altitude - from).toFixed(0)} up from it`);
  const other = await flying(60);
  const faced = other.player.forward.clone();
  const height = other.player.altitude;
  other.step(3, { y: 1, assist: { target: ringAt(other.player, 750, 40 * DEG, -90), strength: 0 } });
  const strayed = Math.atan2(new Vector3().crossVectors(faced, other.player.forward).dot(other.player.up), faced.dot(other.player.forward));
  check(Math.abs(strayed) < 0.5 * DEG && Math.abs(other.player.altitude - height) < 1, 'and at no strength it leaves the flight alone',
    `${(strayed / DEG).toFixed(2)} degrees and ${(other.player.altitude - height).toFixed(2)} units off in 3 s`);
}
{
  // The pull flies the same at 30 and at 144 frames a second.
  const runs = [];
  for (const fps of [30, 144]) {
    const flight = await flying(fps);
    const start = flight.player.position.clone();
    const target = ringAt(flight.player, 750, 40 * DEG, -90);
    const { nearest, passAt } = pursue(flight, target, 6, { y: 1 });
    runs.push({ nearest, way: passAt.distanceTo(start), height: passAt.length() - FLOOR });
  }
  const [a, b] = runs as [typeof runs[0], typeof runs[0]];
  check(a.nearest < PERFECT && b.nearest < PERFECT && Math.abs(a.way - b.way) < a.way * 0.02 && Math.abs(a.height - b.height) < 6,
    'the pull flies the same way at 30 and at 144 frames a second',
    `${a.nearest.toFixed(1)} / ${b.nearest.toFixed(1)} from the centre, the pass ${a.way.toFixed(0)} / ${b.way.toFixed(0)} away and ${a.height.toFixed(1)} / ${b.height.toFixed(1)} up`);
}
{
  // The helicopter: hovering, it turns to face the ring; with the cyclic
  // forward alone it climbs to it and flies through its middle; and the roll
  // keys strafe it.
  const flight = await hovering(60);
  const { player, step } = flight;
  check(!player.grounded && over(player) > 100, 'a helicopter lifts off and climbs', `${over(player).toFixed(0)} up`);
  const target = ringAt(player, 500, 90 * DEG, 40);
  const stood = player.position.clone();
  step(5, { assist: { target, strength: 1 } });
  const { bearing } = bearingTo(player, target);
  // Along the ground: the pull also lifts it to the ring's height where it hovers.
  const drifted = player.position.clone().sub(stood);
  drifted.addScaledVector(player.up, -drifted.dot(player.up));
  check(Math.abs(bearing) < 5 * DEG && drifted.length() < 5 && over(player) > 150, 'hovering, the pull turns it to face the ring where it stands, and lifts it to the ring\'s height',
    `${(bearing / DEG).toFixed(1)} degrees off, ${drifted.length().toFixed(1)} units along the ground, ${over(player).toFixed(0)} up`);
  const { nearest, overshoot } = pursue(flight, target, 14, { y: 1 });
  check(nearest < COURSE_RING_RADIUS * 0.6 && overshoot < 6, 'and with the cyclic forward alone it flies through the ring',
    `${nearest.toFixed(1)} from its centre, ${overshoot.toFixed(1)} past its height at the most`);
  step(3, {});
  const before = player.position.clone();
  const ahead = player.forward.clone();
  const right = new Vector3().crossVectors(player.forward, player.up).normalize();
  step(2, { roll: 1 });
  const moved = player.position.clone().sub(before);
  check(moved.dot(right) > 20 && Math.abs(moved.dot(ahead)) < 5, 'the roll key strafes it sideways',
    `${moved.dot(right).toFixed(1)} to the right, ${moved.dot(ahead).toFixed(1)} ahead`);
  check(ASSIST_NEAR > COURSE_RING_RADIUS, 'the pull lets go only inside a ring\'s opening', `${ASSIST_NEAR} against ${COURSE_RING_RADIUS}`);
}
{
  // Into full control, then hands off: it holds its height at the cruise.
  const { player, step } = await aerobatic(60);
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
  const { player, step } = await aerobatic(60);
  step(1, {});
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
    const { player, step } = await aerobatic(fps);
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
  const { player, step } = await aerobatic(60);
  const start = player.forward.clone();
  const up = player.up.clone();
  step(0.5, { roll: 1 });
  step(2, {});
  const turned = Math.atan2(new Vector3().crossVectors(start, player.forward).dot(up), start.dot(player.forward));
  check(turned < -0.1, 'a bank to the right turns the plane to the right', `${(turned * 180 / Math.PI).toFixed(1)} degrees`);
}
{
  // Up to the vertical with the throttle shut, then let go: it slows past the stall and the nose falls through.
  const { player, step } = await aerobatic(60);
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

console.log('smooth, and wrecked:');
/** How far north of `from` a point is along the ground, units. */
const northOf = (point: Vector3, from: number): number => (latOf(point.y / point.length()) - from) * (PLANE_CEILING > 0 ? UNITS_PER_DEGREE : 0);
/** A tall wall across the way north, `ahead` units north of latitude `from`, as both a low and an aloft wall. */
function wallNorth(from: () => number, ahead: number): Walls {
  const collide: Collide = (point, radius, push) => {
    const into = northOf(point, from()) + radius - ahead;
    if (into <= 0 || into > 60) return false;
    const up = point.clone().normalize();
    push.set(0, 1, 0).projectOnPlane(up).normalize().multiplyScalar(-into);
    return true;
  };
  return { collide, collideAloft: collide };
}
{
  // The same manoeuvre at 30 and at 144 frames a second: a bank in and out, a
  // climb, a descent and a ring's pull. The attitude's angular acceleration
  // stays bounded and does not grow with the frame rate (an ease that jumps
  // its rate would), and the lens chasing it neither.
  // The measure is how much a rate changes from one frame to the next: a
  // motion whose rate is continuous changes it less the shorter the frame, a
  // kink by the same whatever the frame.
  const runs: { attitude: number; lens: number; fov: number }[] = [];
  for (const fps of [30, 144]) {
    const flight = await flying(fps, 300);
    const { player, step, dt } = flight;
    const rig = createCameraRig();
    const ground = (): number => FLOOR;
    rig.snap(player, ground);
    const lastQ = player.attitude.clone();
    const lastLook = new Vector3();
    rig.camera.getWorldDirection(lastLook);
    let rate = 0;
    let lookRate = 0;
    let fovRate = 0;
    let lastFov = rig.camera.fov;
    const worst = { attitude: 0, lens: 0, fov: 0 };
    let frames = 0;
    const look = new Vector3();
    const watch = (): void => {
      rig.follow(dt, player, ground);
      const now = lastQ.angleTo(player.attitude) / dt;
      rig.camera.getWorldDirection(look);
      const turning = look.angleTo(lastLook) / dt;
      const widening = (rig.camera.fov - lastFov) / dt;
      if (frames++ > 2) {
        worst.attitude = Math.max(worst.attitude, Math.abs(now - rate));
        worst.lens = Math.max(worst.lens, Math.abs(turning - lookRate));
        worst.fov = Math.max(worst.fov, Math.abs(widening - fovRate));
      }
      rate = now;
      lookRate = turning;
      fovRate = widening;
      lastQ.copy(player.attitude);
      lastLook.copy(look);
      lastFov = rig.camera.fov;
    };
    step(0.5, {}, watch);
    step(1.2, { roll: 1 }, watch);
    step(1.5, {}, watch);
    step(1, { climb: true }, watch);
    step(1.5, {}, watch);
    step(1, { dive: true }, watch);
    step(1.5, {}, watch);
    // A ring flown through punches the lens open at once (`thrills.ts`).
    rig.rush = 0.8;
    const target = ringAt(player, 700, -30 * DEG, 40);
    step(4, { y: 1, assist: { target, strength: 1 } }, watch);
    rig.rush = 0;
    step(1, {}, watch);
    runs.push(worst);
  }
  const [a, b] = runs as [typeof runs[0], typeof runs[0]];
  check(b.attitude < 0.5 * a.attitude + 0.01 && b.attitude < 0.25,
    'the attitude turns without a kink: its rate changes less a frame the shorter the frame', `${a.attitude.toFixed(3)} / ${b.attitude.toFixed(3)} rad/s a frame at 30 / 144 fps`);
  check(b.lens < 0.5 * a.lens + 0.01 && b.lens < 0.1,
    'and so does the chasing lens', `${a.lens.toFixed(3)} / ${b.lens.toFixed(3)} rad/s a frame`);
  check(b.fov < 0.5 * a.fov + 0.5 && b.fov < 15, 'and its field of view opens by a punch of the rush without a jump', `${a.fov.toFixed(1)} / ${b.fov.toFixed(1)} degrees/s a frame`);
}
{
  // Low over the ground towards a ridge: the plane climbs for it before it
  // arrives, at any frame rate, rather than being snapped up its face.
  const worst: number[] = [];
  for (const fps of [30, 144]) {
    let from = Infinity;
    const ridge = (point: Vector3): number => FLOOR + Math.min(90, Math.max(0, northOf(point, from) - 500) * 0.35);
    const { player, events, step } = await flying(fps, 30, ridge);
    from = latOf(player.position.y / player.position.length());
    let last = player.climb;
    let jolt = 0;
    let lowest = Infinity;
    step(8, {}, () => {
      jolt = Math.max(jolt, Math.abs(player.climb - last));
      last = player.climb;
      lowest = Math.min(lowest, player.position.length() - ridge(player.position));
    });
    worst.push(jolt);
    check(!events.includes('exploded') && lowest > 0 && northOf(player.position, from) > 800,
      `${fps} fps: low over a ridge, the plane climbs over it`, `${lowest.toFixed(1)} over it at the lowest`);
  }
  check(worst[1]! < 0.5 * worst[0]! + 0.05 && worst[1]! < 1.5, 'with no jolt: its climb rate changes less a frame the shorter the frame', `${worst[0]!.toFixed(2)} / ${worst[1]!.toFixed(2)} units/s a frame at 30 / 144 fps`);
}
{
  // Into a cliff low in travel: a wreck. The body is thrown out and falls under a canopy.
  let from = Infinity;
  const cliff = (point: Vector3): number => FLOOR + Math.min(300, Math.max(0, northOf(point, from) - 300) * 6);
  const { player, events, step } = await flying(60, 20, cliff);
  from = latOf(player.position.y / player.position.length());
  for (let t = 0; t < 6 && !events.includes('exploded'); t += 1 / 60) step(1 / 60, {});
  check(events.includes('exploded') && player.ride === null && player.parachute, 'into a cliff it explodes and the body is thrown out under a canopy', events.slice(-3).join(', '));
  step(20, {});
  check(!player.parachute && player.position.length() >= cliff(player.position) - 0.5, 'and comes down on the ground');
}
{
  // Into a building in travel: a wreck, not the knock a slow graze is.
  let from = Infinity;
  const { player, events, step } = await flying(60, 40, undefined, wallNorth(() => from, 400));
  from = latOf(player.position.y / player.position.length());
  let wrecked = 0;
  for (let t = 0; t < 6 && !events.includes('exploded'); t += 1 / 60) step(1 / 60, {}, () => { if (player.wrecked) wrecked++; });
  check(events.includes('exploded') && !events.includes('crashed') && player.ride === null, 'flown into a building it explodes and the body is thrown out');
  step(1 / 60, {});
  check(wrecked === 1 && !player.wrecked, 'and says so for one frame, for the fleet to take the craft away', `${wrecked} frames`);
}
{
  // Low into a tree's crown in travel: the tree goes over and the plane flies on.
  let from = Infinity;
  let felled = false;
  const near = (point: Vector3, reach: number): boolean => Math.abs(northOf(point, from) - 400) < 4 + reach && point.length() - FLOOR < 80;
  const collide: Collide = (point, radius, push) => {
    if (felled || !near(point, radius)) return false;
    push.set(0, 1, 0).projectOnPlane(point.clone().normalize()).normalize().multiplyScalar(-radius);
    return true;
  };
  // The tree as `strike` knocks it: met anywhere up its height, its wall down.
  const strike = (a: Vector3, b: Vector3, radius: number): number => {
    if (felled || !(near(a, radius) || near(b, radius) || near(a.clone().lerp(b, 0.5), radius))) return 0;
    felled = true;
    return 0.22;
  };
  const { player, events, step } = aboard(plane, 60, () => FLOOR, { collide, collideAloft: collide, strike });
  for (let t = 0; t < 10 && !events.includes('took-off'); t += 1 / 60) step(1 / 60, { y: 1 });
  for (let t = 0; t < 60 && over(player) < 20; t += 1 / 60) step(1 / 60, { climb: true });
  step(4, {});
  from = latOf(player.position.y / player.position.length());
  for (let t = 0; t < 6 && northOf(player.position, from) < 500; t += 1 / 60) step(1 / 60, {});
  check(felled && events.includes('broke') && !events.includes('exploded') && !events.includes('crashed') && player.ride !== null,
    'flown into a tree\'s crown, the plane knocks it over and flies on', `${over(player).toFixed(0)} up; ${events.slice(-3).join(', ')}`);
}
{
  // A steep dive onto a roof: a wreck, though the wall's push is sideways.
  let built = false;
  const roof = FLOOR + 40;
  const block: Collide = (point, radius, push) => {
    if (!built || point.length() > roof) return false;
    push.set(0, 1, 0).projectOnPlane(point.clone().normalize()).normalize().multiplyScalar(radius);
    return true;
  };
  const flight = aboard(plane, 60, () => FLOOR, { collide: block, collideAloft: block });
  const { player, events, step } = flight;
  for (let t = 0; t < 10 && !events.includes('took-off'); t += 1 / 60) step(1 / 60, { y: 1 });
  for (let t = 0; t < 60 && over(player) < 400; t += 1 / 60) step(1 / 60, { climb: true });
  step(3, {});
  step(1 / 60, { flightMode: true });
  step(2, {});
  built = true;
  for (let t = 0; t < 4 && player.nosePitch > -1.2; t += 1 / 60) step(1 / 60, { pitch: -1 });
  for (let t = 0; t < 20 && !events.includes('exploded'); t += 1 / 60) step(1 / 60, {});
  check(events.includes('exploded') && player.position.length() > roof - 20, 'a steep dive onto a roof explodes on it', events.slice(-3).join(', '));
}
{
  // A slow touch: a wall met at a glancing angle is a knock, not a wreck.
  let start: Vector3 | null = null;
  let normal: Vector3 | null = null;
  const side: Collide = (point, radius, push) => {
    if (start === null || normal === null) return false;
    const into = point.clone().sub(start).dot(normal) + radius - 20;
    if (into <= 0) return false;
    push.copy(normal).multiplyScalar(-into);
    return true;
  };
  const { player, events, step } = await flying(60, 50, undefined, { collide: side, collideAloft: side });
  start = player.position.clone();
  normal = new Vector3().crossVectors(player.forward, player.up).normalize();
  player.forward.applyAxisAngle(player.up, -3 * DEG);
  for (let t = 0; t < 10 && !events.includes('crashed') && !events.includes('exploded'); t += 1 / 60) step(1 / 60, {});
  check(events.includes('crashed') && !events.includes('exploded') && player.ride !== null, 'a wall brushed at a glancing angle is a knock, not a wreck', events.slice(-3).join(', '));
}
{
  // Nose down into the ground in aerobatics: a wreck.
  const { player, events, step } = await aerobatic(60);
  for (let t = 0; t < 4 && player.nosePitch > -1; t += 1 / 60) step(1 / 60, { pitch: -1 });
  for (let t = 0; t < 30 && !events.includes('exploded'); t += 1 / 60) step(1 / 60, {});
  check(events.includes('exploded') && player.ride === null, 'dived nose first into the ground in aerobatics, it explodes', events.slice(-3).join(', '));
}
{
  // Nose down into the sea in aerobatics: in, and under.
  let sea = false;
  const { player, events, step } = await aerobatic(60, () => (sea ? PLANET_RADIUS : FLOOR));
  sea = true;
  for (let t = 0; t < 4 && player.nosePitch > -1; t += 1 / 60) step(1 / 60, { pitch: -1 });
  for (let t = 0; t < 30 && !events.includes('plunged'); t += 1 / 60) step(1 / 60, {});
  check(events.includes('plunged') && !events.includes('exploded') && !events.includes('crashed'), 'dived into the sea in aerobatics, it plunges in', events.slice(-3).join(', '));
  step(FOUNDER_TIME - 1, {});
  check(player.sunk && player.position.length() < PLANET_RADIUS, 'and goes down at once', `${(player.position.length() - PLANET_RADIUS).toFixed(1)}`);
}
{
  // A helicopter brought down onto the sea goes in and sinks; flown into a wall fast it explodes.
  let sea = false;
  const { player, events, step } = await hovering(60, 60, () => (sea ? PLANET_RADIUS : FLOOR));
  sea = true;
  for (let t = 0; t < 30 && !events.includes('plunged'); t += 1 / 60) step(1 / 60, { dive: true });
  check(events.includes('plunged') && !events.includes('water-refused'), 'a helicopter let down onto the sea goes in', events.slice(-3).join(', '));
  step(FOUNDER_TIME, {});
  check(player.sunk, 'and sinks');
  let from = Infinity;
  const walled = await hovering(60, 30, undefined, wallNorth(() => from, 200));
  from = latOf(walled.player.position.y / walled.player.position.length());
  for (let t = 0; t < 12 && !walled.events.includes('exploded'); t += 1 / 60) walled.step(1 / 60, { y: 1 });
  check(walled.events.includes('exploded') && walled.player.ride === null, 'flown into a wall at speed, a helicopter explodes', walled.events.slice(-3).join(', '));
}

console.log(failures === 0 ? '\nflight: all ok' : `\nflight: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
