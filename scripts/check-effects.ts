/**
 * The effects, headless: the pools, not the pictures.
 *
 * `effects.ts` draws wakes, smoke, dust and debris out of fixed pools, and
 * what can go wrong with a pool is invisible in a screenshot and obvious in a
 * table: a cap that does not hold, a particle that never dies, an instance
 * matrix that is a reflection (the ink draws a mirrored hull as a solid
 * blob), foam that drifts off the water, a draw call more than the four the
 * design allows, a wake that is a trail at 120 frames a second and a scatter
 * at 10, a teleport that throws a burst. So this drives the real module with
 * a stand-in player — a launch at full boost, a car in the desert into a
 * wall, a plane, a balloon climbing, a swimmer, another player's boat — and
 * asks each of those.
 *
 *   node scripts/check-effects.ts
 */
import { InstancedMesh, Matrix4, Mesh, Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { BufferAttribute } from 'three';
import { MAX_DEBRIS, MAX_DISCS, MAX_PUFFS, MAX_RIBBONS, RIBBON_POINTS, createEffects, dustOf } from '../src/effects.ts';
import type { Effects, EffectsSubject } from '../src/effects.ts';
import type { CraftKind, CraftModel, PlayerState } from '../src/craft/contract.ts';
import { PLANET_RADIUS } from '../src/globe.ts';
import { unitAt } from '../src/sphere.ts';
import { BOAT_BOOST, CAR_BOOST, PLANE_CRUISE_LOW } from '../src/vehicles.ts';
import { TIME_SCALE } from './time-scale.ts';

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const DT = 1 / 60;

function model(kind: CraftKind, size: [number, number, number], burner?: [number, number]): CraftModel {
  return {
    id: kind,
    kind,
    medium: kind === 'boat' ? 'water' : kind === 'car' || kind === 'van' ? 'road' : 'air',
    size,
    seats: [],
    draft: 0,
    variants: 1,
    ...(burner === undefined ? {} : { burner }),
    build: () => new Object3D() as never,
  };
}
const LAUNCH = model('boat', [8, 3, 3]);
const CAR = model('car', [5, 2.4, 2]);
const PLANE = model('plane', [11, 14, 4]);
const BALLOON = model('balloon', [8, 8, 20], [5, 6]);
const JETSKI = model('jetski', [6.8, 2.6, 2.7]);
const BICYCLE = model('bicycle', [3.9, 1.3, 2.3]);
const HELICOPTER = model('helicopter', [14, 17, 5.7]);

interface Stand extends EffectsSubject {
  position: Vector3;
  forward: Vector3;
  up: Vector3;
  state: PlayerState;
  airborne: boolean;
  grounded: boolean;
  ride: { model: CraftModel } | null;
}

/** A body at a latitude and longitude, facing north, at `height` over the planet's radius. */
function stand(lat: number, lon: number, height: number): Stand {
  const up = unitAt(lat, lon, new Vector3());
  const north = unitAt(lat + 0.01, lon, new Vector3()).sub(up).projectOnPlane(up).normalize();
  return {
    position: up.clone().multiplyScalar(PLANET_RADIUS + height),
    forward: north,
    up,
    state: 'foot',
    airborne: false,
    grounded: false,
    ride: null,
  };
}

/** Along the ground at `speed` for `dt`, climbing at `climb`: rotates the frame as `player.ts` does. */
function move(s: Stand, speed: number, dt: number, climb = 0, turn = 0): void {
  if (turn !== 0) s.forward.applyAxisAngle(s.up, turn * dt).normalize();
  const radius = s.position.length();
  const axis = new Vector3().crossVectors(s.up, s.forward).normalize();
  const arc = (speed * dt) / radius;
  s.position.applyAxisAngle(axis, arc);
  s.forward.applyAxisAngle(axis, arc).normalize();
  s.up.copy(s.position).normalize();
  s.position.setLength(radius + climb * dt);
}

const worst = { calls: 0, puffs: 0, discs: 0, ribbonPoints: 0, debris: 0, reflected: 0, offWater: 0, nonFinite: 0 };
const foamRadius = PLANET_RADIUS + 0.8;
const camera = new PerspectiveCamera();

function frames(effects: Effects, s: Stand, seconds: number, each: (i: number) => void = () => {}, dt = DT): number[] {
  const times: number[] = [];
  for (let i = 0; i < Math.max(1, Math.round(seconds / dt)); i++) {
    each(i);
    camera.position.copy(s.position).addScaledVector(s.up, 8).addScaledVector(s.forward, -20);
    camera.updateMatrixWorld();
    effects.update(dt, s, camera);
    times.push(effects.stats.updateMs);
    worst.calls = Math.max(worst.calls, effects.stats.calls);
    worst.puffs = Math.max(worst.puffs, effects.stats.puffs);
    worst.discs = Math.max(worst.discs, effects.stats.discs);
    worst.ribbonPoints = Math.max(worst.ribbonPoints, effects.stats.ribbonPoints);
    worst.debris = Math.max(worst.debris, effects.stats.debris);
    audit(effects);
  }
  return times;
}

/** Every live instance matrix a rotation times a positive scale, every foam vertex on the water. */
function audit(effects: Effects): void {
  const anchor = effects.group.position;
  const m = new Matrix4();
  const p = new Vector3();
  for (const child of effects.group.children) {
    if ((child as InstancedMesh).isInstancedMesh) {
      const mesh = child as InstancedMesh;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        if (!Number.isFinite(m.elements[12]!)) worst.nonFinite++;
        if (m.determinant() <= 0) worst.reflected++;
      }
    } else if ((child as Mesh).isMesh) {
      const mesh = child as Mesh;
      const positions = mesh.geometry.getAttribute('position') as BufferAttribute;
      for (let v = 0; v < mesh.geometry.drawRange.count; v++) {
        p.fromBufferAttribute(positions, v).add(anchor);
        // A band of a few units is flat on a sphere of 16,000: its rim sits a
        // hair over the sphere, never more than a sagitta of a few mm.
        const off = p.length() - foamRadius;
        if (!(off > -0.01 && off < 0.05)) worst.offWater++;
      }
    }
  }
}

console.log('the pools');
{
  const effects = createEffects();
  check(effects.group.children.length === 3, 'three meshes: puffs, foam, debris');
  const s = stand(39.5, 2.6, 0.5);

  // A launch at full boost, turning.
  s.state = 'seated';
  s.ride = { model: LAUNCH };
  frames(effects, s, 15, () => move(s, BOAT_BOOST, DT, 0, 0.3));
  check(effects.stats.ribbons === 3 && effects.stats.ribbonPoints > 100, 'a launch at full boost lays three ribbons: the stern and the V',
    `${effects.stats.ribbons} ribbons, ${effects.stats.ribbonPoints} points`);
  check(effects.stats.puffs > 0, 'and throws spray off its bow', `${effects.stats.puffs} puffs`);
  check(effects.stats.dropped === 0, 'and fifteen seconds of it runs no pool out', `${effects.stats.dropped} refused`);

  // A car in the desert, flat out, into a wall.
  s.ride = { model: CAR };
  effects.setGround(false, 'desert');
  s.position.setLength(PLANET_RADIUS + 20);
  frames(effects, s, 3, () => move(s, CAR_BOOST * 0.9, DT, 0, 0.5));
  check(effects.stats.puffs > 20, 'a car on sand raises dust and smokes', `${effects.stats.puffs} puffs`);
  effects.event('crashed', CAR_BOOST);
  frames(effects, s, DT);
  check(effects.stats.debris >= 8, 'a crash at full boost throws debris', `${effects.stats.debris} pieces`);
  // And lands: the debris bounces on the ground it was thrown over.
  let under = 0;
  frames(effects, s, 1, () => {
    const debris = effects.group.getObjectByName('effects-debris') as InstancedMesh;
    const m = new Matrix4();
    for (let i = 0; i < debris.count; i++) {
      debris.getMatrixAt(i, m);
      const p = new Vector3().setFromMatrixPosition(m).add(effects.group.position);
      if (p.length() < PLANET_RADIUS + 20 - 0.01) under++;
    }
  });
  check(under === 0, 'no piece falls through the ground it bounces on', `${under} under`);

  // A plane, airborne and climbing.
  s.ride = { model: PLANE };
  s.airborne = true;
  frames(effects, s, 3, () => move(s, PLANE_CRUISE_LOW * 3, DT, 20));
  check(effects.stats.puffs > 20, 'a plane leaves a trail of smoke balls', `${effects.stats.puffs} puffs`);

  // A balloon climbing: the burner's flame is lit.
  s.ride = { model: BALLOON };
  frames(effects, s, 1, () => move(s, 8, DT, 6));
  const puffs = effects.group.getObjectByName('effects-puffs') as InstancedMesh;
  const glow = puffs.geometry.getAttribute('fxGlow') as BufferAttribute;
  let lit = 0;
  for (let i = 0; i < puffs.count; i++) if (glow.getX(i) === 1) lit++;
  check(lit > 0, 'a balloon climbing lights its burner', `${lit} flames`);

  // The rest of the fleet, each on a fresh set of pools: a jet ski's rooster
  // tail, a bicycle's silence on grass, a helicopter's downwash low over the
  // sea and none high over it.
  {
    const own = createEffects();
    const t = stand(39.5, 2.6, 0.5);
    t.state = 'seated';
    t.ride = { model: JETSKI };
    frames(own, t, 3, () => move(t, 70, DT, 0, 0.4));
    const tail = own.stats.puffs;
    check(own.stats.ribbons === 3 && tail > 40, 'a jet ski flat out leaves a wake and throws a rooster tail', `${own.stats.ribbons} ribbons, ${tail} puffs`);
    own.enabled = false;
    own.enabled = true;
    t.ride = { model: BICYCLE };
    own.setGround(false, 'temperate');
    t.position.setLength(PLANET_RADIUS + 20);
    frames(own, t, 3, () => move(t, 30, DT));
    check(own.stats.puffs === 0, 'a bicycle on grass leaves nothing: no exhaust, no dust', `${own.stats.puffs} puffs`);
    own.enabled = false;
    own.enabled = true;
    t.ride = { model: HELICOPTER };
    t.airborne = true;
    t.position.setLength(PLANET_RADIUS + 6);
    frames(own, { ...t, clearance: 5.5, overWater: true }, 2);
    check(own.stats.discs > 5, 'a helicopter low over the sea rings it with its downwash', `${own.stats.discs} discs`);
    own.enabled = false;
    own.enabled = true;
    t.position.setLength(PLANET_RADIUS + 200);
    frames(own, { ...t, clearance: 199.5, overWater: true }, 2);
    check(own.stats.discs === 0 && own.stats.puffs === 0, 'and high over it, nothing', `${own.stats.discs} discs, ${own.stats.puffs} puffs`);
  }

  // A swimmer, and a jump into the water.
  s.ride = null;
  s.airborne = false;
  s.state = 'swim';
  s.position.setLength(PLANET_RADIUS + 0.5);
  frames(effects, s, DT);
  effects.event('swim', 0);
  frames(effects, s, 3, () => move(s, 3, DT));
  check(effects.stats.discs > 0, 'a swimmer leaves rings');

  // Everything stops, and everything goes.
  s.state = 'foot';
  s.position.setLength(PLANET_RADIUS + 20);
  frames(effects, s, 12);
  check(effects.stats.puffs === 0 && effects.stats.discs === 0 && effects.stats.ribbonPoints === 0 && effects.stats.debris === 0,
    'twelve seconds still and every pool is empty',
    `${effects.stats.puffs} / ${effects.stats.discs} / ${effects.stats.ribbonPoints} / ${effects.stats.debris}`);
  check(effects.stats.calls === 0, 'and draws nothing');

  // The caps: a hundred crashes and four hundred ripples in one place.
  for (let i = 0; i < 100; i++) effects.burst('crash');
  for (let i = 0; i < 400; i++) effects.burst('ripple');
  const times = frames(effects, s, 0.5);
  check(worst.puffs <= MAX_PUFFS && worst.discs <= MAX_DISCS && worst.debris <= MAX_DEBRIS && worst.ribbonPoints <= MAX_RIBBONS * RIBBON_POINTS,
    'no pool ever passes its cap',
    `puffs ${worst.puffs}/${MAX_PUFFS}, discs ${worst.discs}/${MAX_DISCS}, wake points ${worst.ribbonPoints}, debris ${worst.debris}/${MAX_DEBRIS}`);
  check(effects.stats.dropped > 0, 'and a full pool refuses, and counts it', `${effects.stats.dropped} refused`);
  times.sort((a, b) => a - b);
  const median = times[times.length >> 1]!;
  check(median < TIME_SCALE, 'full pools update in under a millisecond (0.3 is the browser budget)', `median ${median.toFixed(3)} ms`);

  // Off is off.
  effects.enabled = false;
  frames(effects, s, DT);
  check(effects.group.children.every((child) => !child.visible), 'switched off, nothing is drawn');
  effects.event('crashed', CAR_BOOST);
  effects.enabled = true;
  frames(effects, s, DT);
  check(effects.stats.debris === 0, 'and nothing is made while it is');
}

console.log('the same at any frame rate');
{
  /** A launch at full boost in a straight line for four seconds at `fps`: what it leaves. */
  const wakeAt = (fps: number): { points: number; maxGap: number; segments: number } => {
    const effects = createEffects();
    const s = stand(39.4, 2.9, 0.5);
    s.state = 'seated';
    s.ride = { model: LAUNCH };
    const dt = 1 / fps;
    frames(effects, s, 4, () => move(s, BOAT_BOOST, dt), dt);
    return effects.probe();
  };
  const slow = wakeAt(10);
  const fast = wakeAt(120);
  const ratio = slow.points / Math.max(1, fast.points);
  check(ratio > 0.85 && ratio < 1.15, 'a wake at 10 fps holds as many points as at 120', `${slow.points} against ${fast.points}`);
  // The spacing at full boost is 2.1 units, and the V's points drift apart a
  // little as they spread: nothing joined may be longer than twice it.
  check(slow.maxGap < 4.2 && fast.maxGap < 4.2, 'and no joined segment is a gap at either', `longest ${slow.maxGap.toFixed(2)} / ${fast.maxGap.toFixed(2)} units`);
  check(slow.segments >= slow.points - 3, 'and the ribbons stay joined across long frames', `${slow.segments} segments of ${slow.points} points`);

  const trailAt = (fps: number): number => {
    const effects = createEffects();
    const s = stand(41, 2, 800);
    s.state = 'seated';
    s.ride = { model: PLANE };
    s.airborne = true;
    const dt = 1 / fps;
    frames(effects, s, 2, () => move(s, PLANE_CRUISE_LOW * 3, dt), dt);
    return effects.stats.puffs;
  };
  const slowTrail = trailAt(10);
  const fastTrail = trailAt(120);
  check(Math.abs(slowTrail - fastTrail) <= Math.max(3, fastTrail * 0.15), 'a plane leaves as many smoke balls at 10 fps as at 120', `${slowTrail} against ${fastTrail}`);
}

console.log('a jump is not a move');
{
  const effects = createEffects();
  const s = stand(39.5, 2.6, 0.5);
  // Walking up to the launch, then boarding it: the pose jumps from the quay
  // to the boat, and nothing may be laid along that.
  frames(effects, s, 1, () => move(s, 4, DT));
  const before = effects.stats.jumps;
  s.state = 'seated';
  s.ride = { model: LAUNCH };
  move(s, 12 / DT, DT);
  frames(effects, s, DT);
  check(effects.stats.jumps === before + 1, 'boarding is a jump');
  check(effects.stats.ribbonPoints === 0 && effects.stats.discs === 0 && effects.stats.puffs === 0, 'and leaves nothing on the water');
  // Under way, then teleported across the sea mid-wake.
  frames(effects, s, 2, () => move(s, BOAT_BOOST, DT));
  move(s, 300 / DT, DT);
  frames(effects, s, DT);
  frames(effects, s, 0.5, () => move(s, BOAT_BOOST, DT));
  check(effects.probe().maxGap < 4.2, 'a teleport mid-wake joins no ribbon across the jump', `longest ${effects.probe().maxGap.toFixed(2)} units`);
  // A car teleported: no burst of exhaust or dust.
  const car = createEffects();
  const c = stand(24.5, 39.6, 30);
  c.state = 'seated';
  c.ride = { model: CAR };
  car.setGround(false, 'desert');
  frames(car, c, 1);
  const idle = car.stats.puffs;
  for (let i = 0; i < 5; i++) {
    move(c, 5000 / DT, DT);
    frames(car, c, DT);
  }
  check(car.stats.puffs <= idle + 2, 'a car teleported five times throws no burst', `${idle} idling, ${car.stats.puffs} after`);
  check(car.stats.jumps >= 5, 'and every one counts as a jump', `${car.stats.jumps}`);
}

console.log('everybody else');
{
  const effects = createEffects();
  const s = stand(36.1, -5.35, 0.5);
  const boat = new Object3D();
  const followed = stand(36.1, -5.35, 0.5);
  let present = true;
  effects.setOthers((visit) => {
    if (present) visit(boat, 'boat', null);
  });
  const pose = (): void => {
    boat.position.copy(followed.position);
    boat.lookAt(boat.position.clone().add(followed.forward));
    boat.updateMatrixWorld();
  };
  pose();
  frames(effects, s, 4, () => {
    move(followed, 17, DT);
    pose();
  });
  check(effects.stats.ribbonPoints > 10, 'a boat of the traffic leaves a wake', `${effects.stats.ribbonPoints} points`);
  check(effects.stats.tracked === 1, 'and is followed');
  // A pooled group put to a boat a kilometre away: a jump, not a streak.
  const jumps = effects.stats.jumps;
  move(followed, 1000 / DT, DT);
  pose();
  frames(effects, s, DT);
  check(effects.stats.jumps === jumps + 1 && effects.probe().maxGap < 4.2, 'a pose that jumps lays nothing along the jump');
  present = false;
  frames(effects, s, DT);
  check(effects.stats.tracked === 0, 'and forgotten when it is gone');
  // Far off, nothing.
  const far = createEffects();
  const distant = stand(0, 0, 0.5);
  const away = stand(30, 30, 0.5);
  far.setOthers((visit) => visit(boat, 'boat', null));
  frames(far, distant, 2, () => {
    move(away, 17, DT);
    boat.position.copy(away.position);
    boat.updateMatrixWorld();
  });
  check(far.stats.ribbonPoints === 0 && far.stats.discs === 0, 'a boat out of reach leaves nothing');
}

console.log('the ground');
check(dustOf('desert') !== null && dustOf('temperate') === null && dustOf('tropical') === null, 'dust on sand, none on grass or in the jungle');

console.log('every frame');
check(worst.calls <= 4, 'never more than four draw calls', `worst ${worst.calls}`);
check(worst.reflected === 0, 'no instance matrix is a reflection', `${worst.reflected} reflected`);
check(worst.nonFinite === 0, 'every matrix is finite');
check(worst.offWater === 0, 'every foam vertex lies on the water', `${worst.offWater} off`);

if (failures > 0) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall effects checks passed');
