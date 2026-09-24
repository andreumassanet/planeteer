/**
 * The effects, headless: the pools, not the pictures.
 *
 * `effects.ts` draws wakes, smoke, dust and debris out of three fixed pools,
 * and what can go wrong with a pool is invisible in a screenshot and obvious
 * in a table: a cap that does not hold, a particle that never dies, an
 * instance matrix that is a reflection (the ink draws a mirrored hull as a
 * solid blob), foam that drifts off the water, a draw call more than the four
 * the design allows. So this drives the real module with a stand-in player —
 * a launch at full boost, a car in the desert into a wall, a plane, a balloon
 * climbing, a swimmer, another player's boat — and asks each of those.
 *
 *   node scripts/check-effects.ts
 */
import { InstancedMesh, Matrix4, Mesh, Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { BufferAttribute } from 'three';
import { MAX_DEBRIS, MAX_FOAM, MAX_PUFFS, createEffects, dustOf } from '../src/effects.ts';
import type { EffectsSubject } from '../src/effects.ts';
import type { CraftKind, CraftModel, PlayerState } from '../src/craft/contract.ts';
import { PLANET_RADIUS } from '../src/globe.ts';
import { unitAt } from '../src/sphere.ts';
import { BOAT_BOOST, CAR_BOOST, PLANE_CRUISE_LOW } from '../src/vehicles.ts';

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

const camera = new PerspectiveCamera();
function frames(effects: ReturnType<typeof createEffects>, s: Stand, seconds: number, each: (i: number) => void = () => {}): number[] {
  const times: number[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    each(i);
    camera.position.copy(s.position).addScaledVector(s.up, 8).addScaledVector(s.forward, -20);
    camera.updateMatrixWorld();
    effects.update(DT, s, camera);
    times.push(effects.stats.updateMs);
    worst.calls = Math.max(worst.calls, effects.stats.calls);
    worst.puffs = Math.max(worst.puffs, effects.stats.puffs);
    worst.foam = Math.max(worst.foam, effects.stats.foam);
    worst.debris = Math.max(worst.debris, effects.stats.debris);
    audit(effects);
  }
  return times;
}

const worst = { calls: 0, puffs: 0, foam: 0, debris: 0, reflected: 0, offWater: 0, nonFinite: 0 };
const foamRadius = PLANET_RADIUS + 0.8;

/** Every live instance matrix a rotation times a positive scale, every foam vertex on the water. */
function audit(effects: ReturnType<typeof createEffects>): void {
  const anchor = effects.group.position;
  const m = new Matrix4();
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
      const drawn = (mesh.geometry.drawRange.count / 48) * 16;
      const p = new Vector3();
      for (let v = 0; v < Math.min(drawn, positions.count); v++) {
        p.fromBufferAttribute(positions, v).add(anchor);
        // A disc of a few units is flat on a sphere of 16,000: its rim sits a
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
  s.ride = { model: model('boat', [8, 3, 3]) };
  frames(effects, s, 8, () => move(s, BOAT_BOOST, DT, 0, 0.3));
  check(effects.stats.foam > 100, 'a launch at full boost leaves a wake', `${effects.stats.foam} discs`);
  check(effects.stats.puffs > 0, 'and throws spray off its bow', `${effects.stats.puffs} puffs`);

  // A car in the desert, flat out, into a wall.
  s.ride = { model: model('car', [5, 2.4, 2]) };
  effects.setGround(false, 'desert');
  s.position.setLength(PLANET_RADIUS + 20);
  frames(effects, s, 3, () => move(s, CAR_BOOST * 0.9, DT, 0, 0.5));
  check(effects.stats.puffs > 20, 'a car on sand raises dust and smokes', `${effects.stats.puffs} puffs`);
  effects.event('crashed', CAR_BOOST);
  check(effects.stats.debris === 0, 'debris waits for the frame');
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
  s.ride = { model: model('plane', [11, 14, 4]) };
  s.airborne = true;
  frames(effects, s, 3, () => move(s, PLANE_CRUISE_LOW * 3, DT, 20));
  check(effects.stats.puffs > 20, 'a plane leaves a trail of smoke balls', `${effects.stats.puffs} puffs`);

  // A balloon climbing: the burner's flame is lit.
  s.ride = { model: model('balloon', [8, 8, 20], [5, 6]) };
  frames(effects, s, 1, () => move(s, 8, DT, 6));
  const puffs = effects.group.getObjectByName('effects-puffs') as InstancedMesh;
  const glow = puffs.geometry.getAttribute('fxGlow') as BufferAttribute;
  let lit = 0;
  for (let i = 0; i < puffs.count; i++) if (glow.getX(i) === 1) lit++;
  check(lit > 0, 'a balloon climbing lights its burner', `${lit} flames`);

  // A swimmer, and a jump into the water.
  s.ride = null;
  s.airborne = false;
  s.state = 'swim';
  s.position.setLength(PLANET_RADIUS + 0.5);
  effects.event('swim', 0);
  frames(effects, s, 3, () => move(s, 3, DT));
  check(effects.stats.foam > 0, 'a swimmer leaves rings');

  // Everything stops, and everything goes.
  s.state = 'foot';
  s.position.setLength(PLANET_RADIUS + 20);
  frames(effects, s, 12);
  check(effects.stats.puffs === 0 && effects.stats.foam === 0 && effects.stats.debris === 0, 'twelve seconds still and every pool is empty',
    `${effects.stats.puffs} / ${effects.stats.foam} / ${effects.stats.debris}`);
  check(effects.stats.calls === 0, 'and draws nothing');

  // The caps: a hundred crashes in one place.
  for (let i = 0; i < 100; i++) effects.burst('crash');
  for (let i = 0; i < 400; i++) effects.burst('ripple');
  const times = frames(effects, s, 0.5);
  check(worst.puffs <= MAX_PUFFS && worst.foam <= MAX_FOAM && worst.debris <= MAX_DEBRIS, 'no pool ever passes its cap',
    `puffs ${worst.puffs}/${MAX_PUFFS}, foam ${worst.foam}/${MAX_FOAM}, debris ${worst.debris}/${MAX_DEBRIS}`);
  check(effects.stats.dropped > 0, 'and a full pool refuses, and counts it', `${effects.stats.dropped} refused`);
  times.sort((a, b) => a - b);
  const median = times[times.length >> 1]!;
  check(median < 1, 'full pools update in under a millisecond (0.3 is the browser budget)', `median ${median.toFixed(3)} ms`);

  // Off is off.
  effects.enabled = false;
  frames(effects, s, DT);
  check(effects.group.children.every((child) => !child.visible), 'switched off, nothing is drawn');
  effects.event('crashed', CAR_BOOST);
  effects.enabled = true;
  frames(effects, s, DT);
  check(effects.stats.debris === 0, 'and nothing is made while it is');
}

console.log('everybody else');
{
  const effects = createEffects();
  const s = stand(36.1, -5.35, 0.5);
  const boat = new Object3D();
  const followed = stand(36.1, -5.35, 0.5);
  move(followed, 0, DT);
  let present = true;
  effects.setOthers((visit) => {
    if (present) visit(boat, 'boat', null);
  });
  frames(effects, s, 4, () => {
    move(followed, 17, DT);
    boat.position.copy(followed.position);
    boat.lookAt(boat.position.clone().add(followed.forward));
    boat.updateMatrixWorld();
  });
  check(effects.stats.foam > 10, 'a boat of the traffic leaves a wake', `${effects.stats.foam} discs`);
  check(effects.stats.tracked === 1, 'and is followed');
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
  check(far.stats.foam === 0, 'a boat out of reach leaves nothing');
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
