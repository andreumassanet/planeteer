/**
 * The horse you can ride: Quaternius's horse (Ultimate Animated Animals, CC0),
 * the herds' own rig, saddled, with a seat on its back.
 *
 * **It is the herds' horse, at the herds' size.** The rig and the coats are
 * the herds' (`fauna/parts/horse.ts`), and so is the scale (`rigScale`):
 * fitted by its length, as the herds once were, a horse's back stood 1.28
 * bodies up, a saddle at a person's crown, which is a draught horse under a
 * child. A horse's withers are 1.6 m against a 1.75 m person, 0.91 of him,
 * and a horse somebody sits on reads by that ratio before it reads by
 * anything else; so the rig is scaled until the top of its back is `WITHERS`
 * of `AVATAR_HEIGHT`, a little over life, since the rider's legs have to reach
 * down its sides, and the herds' horses stand at the same number. What makes it a craft is a
 * saddle and a seat: the seat is found on the rig itself — the top of the
 * back, a little ahead of the middle, where the barrel is highest behind the
 * withers — and the saddle is laid there with its top on the hip.
 *
 * **It jumps.** `Space` sends it up (`player.ts`), and the motion plays the
 * pack's `Gallop_Jump` for a leap at speed and `Jump_toIdle` from a standstill
 * (`craft/motion.ts`), both baked for it (`pnpm kit`).
 *
 * **It walks and gallops.** The rig is a child named `'rig'` carrying its
 * skinned body and its mixer, and the motion plays it (`craft/motion.ts`):
 * idle standing, the walk clip under a trot, the gallop over it, each at the
 * rate that keeps the hooves from sliding. The saddle and the seats ride the
 * back as it rises and falls, through the bone under the saddle, which is
 * named on the rig (`userData.back`) for the motion to follow.
 *
 * Six coats, by variant: bay, chestnut, black, grey, dun and palomino.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import { makeRigged, modelMaterial } from '../models.ts';
import type { Rig } from '../models.ts';
import { rigPaint, rigScale } from '../fauna/contract.ts';
import type { AnimalShape } from '../fauna/contract.ts';
import { FAUNA_STYLES } from '../fauna/regions.ts';
import { horse as horseAnimal, WITHERS } from '../fauna/parts/horse.ts';
import { rngFrom } from '../scenery/random.ts';
import type { CraftModel, Seat } from './contract.ts';
import { JUMP_CLIPS } from './motion.ts';
import type { JumpCurve } from './motion.ts';
import { assemble, craftContext, finish, soupOf } from './build.ts';

const H = AVATAR_HEIGHT;

/** The top of the back under the saddle, as a share of `AVATAR_HEIGHT`: the herds' horse's, see above. */
export { WITHERS };

/** Coat, the belly's and the mane's, tail's and hooves': the six a riding stable has. */
const COATS: readonly [number, number, number][] = [
  [PALETTE.brown, PALETTE.brown, PALETTE.bark],
  [PALETTE.clay, PALETTE.clay, PALETTE.brown],
  [PALETTE.bark, PALETTE.bark, PALETTE.ink],
  [PALETTE.bone, PALETTE.tan, PALETTE.steel],
  [PALETTE.tan, PALETTE.brown, PALETTE.bark],
  [PALETTE.sand, PALETTE.tan, PALETTE.cream],
];

let material: THREE.MeshToonMaterial | null = null;
/** The rig's material: the herds' recipe (vertex colours, the ink along `outlineNormal`) on the craft's ramp. */
export function horseMaterial(): THREE.MeshToonMaterial {
  if (material !== null) return material;
  const ink = craftContext().toon(PALETTE.ink);
  material = modelMaterial(ink.gradientMap!, ink.userData.outlineParameters as { thickness: number; color: [number, number, number] });
  material.name = 'horse';
  return material;
}

/** The horse's shape for a coat: the species' own, with the coat put on. */
function shapeOf(variant: number): AnimalShape {
  const base = horseAnimal.shape(rngFrom('craft-horse', variant), FAUNA_STYLES['atlantic-europe']);
  const [coat, under, point] = COATS[((variant % COATS.length) + COATS.length) % COATS.length]!;
  return { ...base, coat, under, point, face: coat };
}

/** The herds' own scale for the rig, which puts its back at `WITHERS`. */
function herdScale(rig: Rig): number {
  const choice = horseAnimal.rigs!.find((entry) => entry.id === rig.name) ?? horseAnimal.rigs![0]!;
  return rigScale(choice, rig);
}

/**
 * The rig at scale `k`, its feet on y = 0 and its middle on the axis, as
 * `life.ts` stands one.
 */
function fitted(rig: Rig, variant: number, k: number): { holder: THREE.Group; scale: number } {
  const choice = horseAnimal.rigs!.find((entry) => entry.id === rig.name) ?? horseAnimal.rigs![0]!;
  const rigged = makeRigged(rig, rigPaint(shapeOf(variant), choice));
  rigged.root.position.set(-(rig.box.min.x + rig.box.max.x) / 2, -rig.box.min.y, -(rig.box.min.z + rig.box.max.z) / 2);
  const holder = new THREE.Group();
  holder.name = 'rig';
  holder.scale.setScalar(k);
  holder.add(rigged.root);
  holder.userData.rigged = rigged;
  rigged.body.castShadow = true;
  rigged.body.receiveShadow = true;
  return { holder, scale: k };
}

/** Where the seat goes and which bone carries it: measured once off the rig at rest. */
interface Back {
  /** The top of the back under the saddle, in the craft's frame. */
  top: THREE.Vector3;
  /** Half the barrel's width there. */
  half: number;
  /** The bone nearest the saddle, by name. */
  bone: string;
}

function measureBack(rig: Rig, k: number): Back {
  const { holder } = fitted(rig, 0, k);
  holder.updateMatrixWorld(true);
  const rigged = holder.userData.rigged as ReturnType<typeof makeRigged>;
  const body = rigged.body;
  body.skeleton.update();
  const box = new THREE.Box3().setFromObject(holder, true);
  const length = box.max.z - box.min.z;
  // A little ahead of the middle: behind the withers, on the highest of the barrel.
  const at = (box.min.z + box.max.z) / 2 + length * 0.1;
  const band = length * 0.05;
  const point = new THREE.Vector3();
  let top = -Infinity;
  let half = 0;
  const count = body.geometry.getAttribute('position').count;
  for (let i = 0; i < count; i++) {
    body.getVertexPosition(i, point);
    point.applyMatrix4(body.matrixWorld);
    if (Math.abs(point.z - at) > band) continue;
    if (Math.abs(point.x) < length * 0.05) top = Math.max(top, point.y);
    half = Math.max(half, Math.abs(point.x));
  }
  const seat = new THREE.Vector3(0, top, at);
  let bone = '';
  let nearest = Infinity;
  const where = new THREE.Vector3();
  for (const candidate of body.skeleton.bones) {
    const d = candidate.getWorldPosition(where).distanceTo(seat);
    if (d < nearest) {
      nearest = d;
      bone = candidate.name;
    }
  }
  return { top: seat, half, bone };
}

/** Samples a jump clip is measured at. */
const JUMP_SAMPLES = 32;
/** How high the lowest hoof has to be, in units, for the horse to count as off the ground in a clip. */
const OFF_THE_GROUND = 0.15;

/**
 * The pack's jumps lift the whole horse, which a ridden one must not do: the
 * player's own jump already lifts it (`player.ts`), and the two together are
 * twice the leap. So each jump clip is measured once, here, for how high its
 * lowest hoof is through it, and the motion lowers the rig by that as it plays
 * (`craft/motion.ts`): the legs gather and stretch as the pack drew them, and
 * the height is the player's.
 */
function measureJumps(rig: Rig, k: number): Record<string, JumpCurve> {
  const { holder } = fitted(rig, 0, k);
  const rigged = holder.userData.rigged as ReturnType<typeof makeRigged>;
  const body = rigged.body;
  const point = new THREE.Vector3();
  const count = body.geometry.getAttribute('position').count;
  const curves: Record<string, JumpCurve> = {};
  for (const name of JUMP_CLIPS) {
    const action = rigged.actions.get(name);
    if (action === undefined) continue;
    for (const other of rigged.actions.values()) other.stop();
    action.reset().play();
    const duration = action.getClip().duration;
    const feet = new Float32Array(JUMP_SAMPLES + 1);
    for (let i = 0; i <= JUMP_SAMPLES; i++) {
      rigged.mixer.setTime((duration * i) / JUMP_SAMPLES);
      holder.updateMatrixWorld(true);
      body.skeleton.update();
      let lowest = Infinity;
      // Every third vertex: a hoof is dozens of them.
      for (let v = 0; v < count; v += 3) {
        body.getVertexPosition(v, point);
        point.applyMatrix4(body.matrixWorld);
        lowest = Math.min(lowest, point.y);
      }
      feet[i] = Math.max(0, lowest);
    }
    let off = -1;
    let on = -1;
    for (let i = 0; i <= JUMP_SAMPLES; i++) {
      if (feet[i]! <= OFF_THE_GROUND) continue;
      if (off < 0) off = i;
      on = i;
    }
    if (off < 0) continue;
    curves[name] = { feet, duration, off: (duration * (off - 1)) / JUMP_SAMPLES, on: (duration * (on + 1)) / JUMP_SAMPLES };
  }
  return curves;
}

/** The ridden horse, off its rig; null without one. */
export function horseModel(rig: Rig | null): CraftModel | null {
  if (rig === null) return null;
  if (!rig.clips.some((clip) => clip.name === 'Walk')) return null;
  // The herds' scale, which is the one that puts the back at `WITHERS`.
  const k = herdScale(rig);
  const back = measureBack(rig, k);
  const jumps = measureJumps(rig, k);
  // The saddle a twenty-fifth of a body thick on the back, its top the hip.
  const hip = back.top.y + 0.04 * H;
  const seats: Seat[] = [
    {
      x: 0,
      y: hip,
      z: back.top.z,
      yaw: 0,
      pose: 'ride',
      shown: true,
      // The reins over the withers; the stirrups down the barrel's side.
      grip: [0, 0.16 * H, 0.3 * H],
      feet: [back.half + 0.05 * H, -0.36 * H, 0.05 * H],
    },
  ];
  const build = (variant: number): THREE.Group => {
    const ctx = craftContext();
    const saddle = new THREE.Group();
    const pad = ctx.box(back.half * 1.5, 0.03 * H, 0.3 * H, PALETTE.crimson);
    pad.position.set(0, back.top.y - 0.02 * H, back.top.z);
    saddle.add(pad);
    const seat = ctx.box(back.half * 1.05, 0.06 * H, 0.22 * H, PALETTE.bark);
    seat.position.set(0, hip - 0.06 * H, back.top.z);
    saddle.add(seat);
    const pommel = ctx.box(back.half * 0.6, 0.06 * H, 0.05 * H, PALETTE.bark);
    pommel.position.set(0, hip - 0.02 * H, back.top.z + 0.12 * H);
    saddle.add(pommel);
    const group = assemble('horse', [soupOf(saddle)]);
    const { holder } = fitted(rig, variant, k);
    holder.userData.back = back.bone;
    holder.userData.jumps = jumps;
    group.add(holder);
    group.updateMatrixWorld(true);
    return group;
  };
  return finish({ id: 'horse', kind: 'horse', medium: 'road', seats, draft: 0, variants: COATS.length, build });
}
