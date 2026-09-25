/**
 * The horse you can ride: Quaternius's horse (Ultimate Animated Animals, CC0),
 * the herds' own rig, saddled, with a seat on its back.
 *
 * **It is the herds' horse, at the herds' size** (`fauna/parts/horse.ts`,
 * fitted by its length as `life.ts` fits one), so a horse you ride away from
 * a farm is the horse that grazes beside it. What makes it a craft is a
 * saddle and a seat: the seat is found on the rig itself — the top of the
 * back, a little ahead of the middle, where the barrel is highest behind the
 * withers — and the saddle is laid there with its top on the hip.
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
import { rigPaint } from '../fauna/contract.ts';
import type { AnimalShape } from '../fauna/contract.ts';
import { FAUNA_STYLES } from '../fauna/regions.ts';
import { horse as horseAnimal } from '../fauna/parts/horse.ts';
import { rngFrom } from '../scenery/random.ts';
import type { CraftModel, Seat } from './contract.ts';
import { assemble, craftContext, finish, soupOf } from './build.ts';

const H = AVATAR_HEIGHT;

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

/**
 * The rig fitted to the herds' length, its feet on y = 0 and its middle on
 * the axis, as `life.ts` stands one.
 */
function fitted(rig: Rig, variant: number): { holder: THREE.Group; scale: number } {
  const choice = horseAnimal.rigs!.find((entry) => entry.id === rig.name) ?? horseAnimal.rigs![0]!;
  const rigged = makeRigged(rig, rigPaint(shapeOf(variant), choice));
  const size = rig.box.getSize(new THREE.Vector3());
  const k = horseAnimal.size[0] / size.z;
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

function measureBack(rig: Rig): Back {
  const { holder } = fitted(rig, 0);
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

/** The ridden horse, off its rig; null without one. */
export function horseModel(rig: Rig | null): CraftModel | null {
  if (rig === null) return null;
  if (!rig.clips.some((clip) => clip.name === 'Walk')) return null;
  const back = measureBack(rig);
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
    const { holder } = fitted(rig, variant);
    holder.userData.back = back.bone;
    group.add(holder);
    group.updateMatrixWorld(true);
    return group;
  };
  return finish({ id: 'horse', kind: 'horse', medium: 'road', seats, draft: 0, variants: COATS.length, build });
}
