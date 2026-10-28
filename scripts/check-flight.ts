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
const { unitAt } = await import('../src/sphere.ts');
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

type Keys = {
  x?: number; y?: number; climb?: boolean; dive?: boolean; pitch?: number; roll?: number; flightMode?: boolean;
  assist?: { target: Vector3; strength: number } | null;
};

/** An aircraft of `model` standing on the ground, flown at `fps` frames a second. */
function aboard(model: typeof plane, fps: number, groundAt: () => number = () => FLOOR) {
  const events: string[] = [];
  const player = createPlayer(world, LAT, LON, { groundAt, onEvent: (event) => events.push(event) });
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
async function flying(fps: number, upTo = 400, groundAt?: () => number) {
  const flight = aboard(plane, fps, groundAt);
  const { player, events, step, dt } = flight;
  for (let t = 0; t < 10 && !events.includes('took-off'); t += dt) step(dt, { y: 1 });
  for (let t = 0; t < 60 && over(player) < upTo; t += dt) step(dt, { climb: true });
  step(4, {});
  return flight;
}

/** The same plane taken into aerobatics by the mode key, and settled there. */
async function aerobatic(fps: number) {
  const flight = await flying(fps);
  flight.step(flight.dt, { flightMode: true });
  flight.step(2, {});
  return flight;
}

/** A helicopter up and hovering `upTo` over the ground. */
async function hovering(fps: number, upTo = 120) {
  const flight = aboard(helicopter, fps);
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

console.log(failures === 0 ? '\nflight: all ok' : `\nflight: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
