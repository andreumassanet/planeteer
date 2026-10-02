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
 * saddle and a seat: the seat is found on the rig itself — on the back a
 * third of the way from the forelegs to the hind legs, in the hollow behind
 * the withers where a saddle sits, never on the withers or the neck — and the
 * saddle is laid there, its seat on the hip.
 *
 * **The saddle is fitted to the barrel it sits on.** The rig's own cross
 * sections under it are measured at rest and each one wrapped in the
 * smallest superellipse that holds all its vertices (`Barrel`), so a cloth,
 * a seat, a girth and a flap laid a few hundredths out from it lie on the
 * horse rather than through it or over it: a saddle cloth down both flanks,
 * a leather seat over it rising to a pommel in front and a cantle behind, a
 * girth round the belly, and a stirrup on a leather down each side, where the
 * rider's feet are.
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
  /** The body's vertices at rest, x y z, in the craft's frame: what the saddle is fitted to. */
  points: Float32Array;
}

/** How far from the forelegs toward the hind legs the saddle's middle sits. */
const SADDLE_AT = 0.4;

function measureBack(rig: Rig, k: number): Back {
  const { holder } = fitted(rig, 0, k);
  holder.updateMatrixWorld(true);
  const rigged = holder.userData.rigged as ReturnType<typeof makeRigged>;
  const body = rigged.body;
  body.skeleton.update();
  const box = new THREE.Box3().setFromObject(holder, true);
  const length = box.max.z - box.min.z;
  // Between the legs, a third of the way back from the forelegs: behind the
  // withers, in the hollow of the back. The legs are found by their bones;
  // without them, a little behind the box's middle, which the neck and the
  // head pull forward of the barrel's.
  const where = new THREE.Vector3();
  const boneZ = (pattern: RegExp): number | null => {
    const found = body.skeleton.bones.find((candidate) => pattern.test(candidate.name));
    return found === undefined ? null : found.getWorldPosition(where).z;
  };
  const fore = boneZ(/^Front(Upper)?Leg/);
  const hind = boneZ(/^Back(Upper)?Leg/);
  const at = fore !== null && hind !== null ? fore + (hind - fore) * SADDLE_AT : (box.min.z + box.max.z) / 2 - length * 0.05;
  const band = length * 0.05;
  const point = new THREE.Vector3();
  let top = -Infinity;
  let half = 0;
  const count = body.geometry.getAttribute('position').count;
  const points = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    body.getVertexPosition(i, point);
    point.applyMatrix4(body.matrixWorld);
    point.toArray(points, i * 3);
    if (Math.abs(point.z - at) > band) continue;
    if (Math.abs(point.x) < length * 0.05) top = Math.max(top, point.y);
    half = Math.max(half, Math.abs(point.x));
  }
  const seat = new THREE.Vector3(0, top, at);
  let bone = '';
  let nearest = Infinity;
  for (const candidate of body.skeleton.bones) {
    const d = candidate.getWorldPosition(where).distanceTo(seat);
    if (d < nearest) {
      nearest = d;
      bone = candidate.name;
    }
  }
  return { top: seat, half, bone, points };
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

// ---------------------------------------------------------------------------
// The saddle
// ---------------------------------------------------------------------------

/** A saddle cloth's colours, by variant: what a stable puts under a saddle. */
const CLOTHS: readonly number[] = [PALETTE.crimson, PALETTE.skyBlue, PALETTE.cream, PALETTE.green, PALETTE.slate, PALETTE.gold];
/** The superellipse the barrel's sections are wrapped in: 2 is an ellipse, more is boxier. */
const ROUNDNESS = 2.6;

/** One cross-section of the barrel at a z, as the superellipse that holds it. */
interface Section {
  z: number;
  /** The middle of the section, and its half-width and half-height. */
  y: number;
  a: number;
  b: number;
}

/** The spine's top and the belly's bottom along the horse's middle line, by z. */
interface Profile {
  at(z: number): { top: number; belly: number };
}

const BIN = 0.03 * H;
const profiles = new WeakMap<Float32Array, Profile>();
/**
 * The spine and the belly, read off the vertices along the middle line in
 * bins of `BIN` and joined straight across the bins the coarse mesh leaves
 * empty. The legs are off the middle line, so they are not in it.
 */
function profileOf(points: Float32Array): Profile {
  const known = profiles.get(points);
  if (known !== undefined) return known;
  const MIDDLE = 0.05 * H;
  const bins = new Map<number, { top: number; belly: number }>();
  for (let i = 0; i < points.length; i += 3) {
    if (Math.abs(points[i]!) > MIDDLE) continue;
    const k = Math.round(points[i + 2]! / BIN);
    const bin = bins.get(k) ?? { top: -Infinity, belly: Infinity };
    bin.top = Math.max(bin.top, points[i + 1]!);
    bin.belly = Math.min(bin.belly, points[i + 1]!);
    bins.set(k, bin);
  }
  // A bin with only one of the two, or both too close, is a bin of the spine
  // or of the belly alone: it says nothing about the other.
  const keys = [...bins.keys()].sort((p, q) => p - q);
  const tops = keys.map((k) => [k * BIN, bins.get(k)!.top] as const);
  const bellies = keys.filter((k) => bins.get(k)!.top - bins.get(k)!.belly > 0.2 * H).map((k) => [k * BIN, bins.get(k)!.belly] as const);
  const lerp = (list: readonly (readonly [number, number])[], z: number): number => {
    if (list.length === 0) return 0;
    if (z <= list[0]![0]) return list[0]![1];
    for (let i = 1; i < list.length; i++) {
      const [z1, y1] = list[i]!;
      if (z > z1) continue;
      const [z0, y0] = list[i - 1]!;
      return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
    }
    return list[list.length - 1]![1];
  };
  // The spine's upper envelope only: a bin whose top is the belly's (no
  // spine vertex in it) would cut a notch, so a top under both neighbours'
  // line is dropped.
  const spine = tops.filter(([z, y], i) => {
    if (i === 0 || i === tops.length - 1) return true;
    const [z0, y0] = tops[i - 1]!;
    const [z1, y1] = tops[i + 1]!;
    return y >= y0 + ((y1 - y0) * (z - z0)) / (z1 - z0) - 0.1 * H;
  });
  const profile: Profile = { at: (z) => ({ top: lerp(spine, z), belly: lerp(bellies, z) }) };
  profiles.set(points, profile);
  return profile;
}

/**
 * The barrel under the saddle at `z`: the spine's top and the belly's bottom
 * there (`profileOf`), the widest of the vertices within `reach` of it between
 * the two — the legs below the belly are not barrel — and the scale of the
 * superellipse over them that leaves none of them outside, each measured
 * against the spine and the belly at its own z.
 */
function sectionAt(points: Float32Array, z: number, reach: number): Section {
  const profile = profileOf(points);
  const { top, belly } = profile.at(z);
  const y = (top + belly) / 2;
  const b = (top - belly) / 2;
  const near: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    if (Math.abs(points[i + 2]! - z) > reach) continue;
    const there = profile.at(points[i + 2]!);
    if (points[i + 1]! < there.belly || points[i + 1]! > there.top) continue;
    near.push(i);
  }
  let a = 0.1 * H;
  for (const i of near) a = Math.max(a, Math.abs(points[i]!));
  let scale = 1;
  for (const i of near) {
    const there = profile.at(points[i + 2]!);
    const yi = (there.top + there.belly) / 2;
    const bi = Math.max(0.05 * H, (there.top - there.belly) / 2);
    const u = Math.abs(points[i]!) / a;
    const v = Math.abs(points[i + 1]! - yi) / bi;
    scale = Math.max(scale, (u ** ROUNDNESS + v ** ROUNDNESS) ** (1 / ROUNDNESS));
  }
  return { z, y, a: a * scale, b: b * scale };
}

/** A point `out` off the section's surface at angle `theta` from the top, clockwise seen from behind. */
function onSection(section: Section, theta: number, out: number, into: THREE.Vector3): THREE.Vector3 {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const e = 2 / ROUNDNESS;
  const x = section.a * Math.sign(s) * Math.abs(s) ** e;
  const y = section.b * Math.sign(c) * Math.abs(c) ** e;
  // Out along the direction from the middle, which on a section this round is
  // near enough the normal for a few hundredths.
  const length = Math.hypot(x, y) || 1;
  return into.set(x + (x / length) * out, section.y + y + (y / length) * out, section.z);
}

/**
 * A shell laid over the barrel: a grid of `thetas` round it by `zs` along
 * it, its inside `inner(theta, z)` off the surface and its outside
 * `outer(theta, z)` off it, closed at all four edges, and underneath where
 * `under` says. The underside lies on the horse, in the hundredths between
 * the barrel and the section that holds it, but the cloth's flaps stand off
 * the flanks the section rounds past, and from the saddle or a low lens the
 * open shell showed the culled inside of every face, which read as nothing
 * there; so the cloth's inside is a face of its own, looking in. The seat's
 * lies on the cloth and the girth's on the belly, and nothing sees them.
 * Each triangle is wound to face the way its face looks — out, in, or along
 * the edge it closes.
 */
function shell(
  sections: (z: number) => Section,
  thetas: readonly number[],
  zs: readonly number[],
  inner: (theta: number, z: number) => number,
  outer: (theta: number, z: number) => number,
  color: number,
  under = false,
): THREE.Mesh {
  const grid = (offset: (theta: number, z: number) => number): THREE.Vector3[][] =>
    zs.map((z) => {
      const section = sections(z);
      return thetas.map((theta) => onSection(section, theta, offset(theta, z), new THREE.Vector3()));
    });
  const inside = grid(inner);
  const outside = grid(outer);
  const points: number[] = [];
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, want: THREE.Vector3): void => {
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (n.lengthSq() < 1e-12) return;
    const [p, q, r] = n.dot(want) >= 0 ? [a, b, c] : [a, c, b];
    points.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  };
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, want: THREE.Vector3): void => {
    tri(a, b, c, want);
    tri(a, c, d, want);
  };
  const want = new THREE.Vector3();
  const middle = (...corners: THREE.Vector3[]): THREE.Vector3 => {
    const m = new THREE.Vector3();
    for (const corner of corners) m.add(corner);
    return m.divideScalar(corners.length);
  };
  const last = thetas.length - 1;
  const end = zs.length - 1;
  for (let j = 0; j < end; j++) {
    const section = sections((zs[j]! + zs[j + 1]!) / 2);
    for (let i = 0; i < last; i++) {
      const o = [outside[j]![i]!, outside[j]![i + 1]!, outside[j + 1]![i + 1]!, outside[j + 1]![i]!] as const;
      const m = middle(...o);
      want.set(m.x, m.y - section.y, 0);
      quad(o[0], o[1], o[2], o[3], want);
      if (!under) continue;
      // The underside, the same cell on the inside grid, looking in.
      const u = [inside[j]![i]!, inside[j]![i + 1]!, inside[j + 1]![i + 1]!, inside[j + 1]![i]!] as const;
      const mu = middle(...u);
      want.set(-mu.x, section.y - mu.y, 0);
      quad(u[0], u[1], u[2], u[3], want);
    }
    // The two long edges, facing on round past them.
    for (const [i, toward] of [[0, 1], [last, last - 1]] as const) {
      want.subVectors(outside[j]![i]!, outside[j]![toward]!).setZ(0);
      quad(inside[j]![i]!, outside[j]![i]!, outside[j + 1]![i]!, inside[j + 1]![i]!, want);
    }
  }
  // The two ends, facing back and forward.
  for (const [j, sign] of [[0, -1], [end, 1]] as const) {
    want.set(0, 0, sign);
    for (let i = 0; i < last; i++) quad(inside[j]![i]!, inside[j]![i + 1]!, outside[j]![i + 1]!, outside[j]![i]!, want);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, craftContext().toon(color));
}

/** Evenly from `from` to `to`, `count` steps. */
const spread = (from: number, to: number, count: number): number[] =>
  Array.from({ length: count + 1 }, (_, k) => from + ((to - from) * k) / count);

/**
 * The saddle, fitted to the back measured at rest: a cloth down both flanks,
 * a leather seat over it rising to a pommel and a cantle, a girth round the
 * belly under them, and a stirrup down each side on its leather, at the
 * rider's feet. One group a variant; the cloth is the variant's colour.
 */
function buildSaddle(back: Back, hip: number, seat: Seat): (variant: number) => THREE.Group {
  const at = back.top.z;
  const cache = new Map<number, Section>();
  const sections = (z: number): Section => {
    const key = Math.round(z * 1000);
    let known = cache.get(key);
    if (known === undefined) cache.set(key, (known = sectionAt(back.points, z, 0.035 * H)));
    return known;
  };
  const DEG = Math.PI / 180;
  // The seat's own length and the cloth's, each a share of a body.
  const SEAT = 0.34 * H;
  const CLOTH = 0.44 * H;
  const seatZs = spread(at - SEAT * 0.62, at + SEAT * 0.38, 7);
  const clothZs = spread(at - CLOTH * 0.62, at + CLOTH * 0.34, 4);
  // Where the seat's surface stands over the back, so its middle is at the hip.
  const middle = sections(at);
  const backTop = middle.y + middle.b;
  const CLOTH_IN = 0.005 * H;
  const CLOTH_OUT = 0.018 * H;
  const seatBase = CLOTH_OUT;
  const seatTop = Math.max(seatBase + 0.012 * H, hip - backTop - 0.006 * H);
  /** How far the seat's top rises over its middle, along it: a cantle behind and a pommel in front. */
  const rise = (z: number): number => {
    const u = (z - (at - SEAT * 0.62)) / SEAT;
    const cantle = Math.max(0, 1 - u / 0.22) ** 1.6 * 0.07 * H;
    const pommel = Math.max(0, (u - 0.82) / 0.18) ** 1.4 * 0.045 * H;
    return cantle + pommel;
  };

  return (variant: number): THREE.Group => {
    const ctx = craftContext();
    const cloth = CLOTHS[((variant % CLOTHS.length) + CLOTHS.length) % CLOTHS.length]!;
    const leather = ctx.tone(PALETTE.brown, 0.66);
    const strap = PALETTE.bark;
    const group = new THREE.Group();

    // The cloth: over the back and down both flanks to a hand under the seat's flaps.
    group.add(shell(sections, spread(-84 * DEG, 84 * DEG, 12), clothZs, () => CLOTH_IN, () => CLOTH_OUT, cloth, true));
    // The seat: its top over the spine, falling to the flaps down the sides.
    group.add(
      shell(
        sections,
        spread(-66 * DEG, 66 * DEG, 12),
        seatZs,
        () => seatBase,
        (theta, z) => {
          const over = Math.max(0, 1 - Math.abs(theta) / (42 * DEG));
          return seatBase + 0.012 * H + (seatTop - seatBase - 0.012 * H + rise(z)) * Math.sin((over * Math.PI) / 2);
        },
        leather,
      ),
    );
    // The girth, round the belly from under one flap to under the other.
    const girthZ = at + SEAT * 0.22;
    group.add(shell(sections, spread(60 * DEG, 300 * DEG, 12), spread(girthZ - 0.025 * H, girthZ + 0.025 * H, 1), () => 0.004 * H, () => 0.014 * H, strap));

    // The stirrups: a leather from under the seat's edge to an iron at the foot.
    const foot = seat.feet!;
    for (const side of [-1, 1]) {
      const hang = onSection(middle, side * 70 * DEG, seatBase + 0.012 * H, new THREE.Vector3());
      const iron = new THREE.Vector3(side * foot[0], hip + foot[1], at + foot[2]);
      const tread = iron.clone().setY(iron.y - 0.03 * H);
      const top = tread.clone().setY(tread.y + 0.13 * H);
      group.add(ctx.strut(hang.setZ(at + foot[2] * 0.5), top, 0.012 * H, strap));
      for (const along of [-1, 1]) {
        group.add(ctx.strut(top, tread.clone().setZ(tread.z + along * 0.04 * H), 0.008 * H, PALETTE.steel));
      }
      const plate = ctx.box(0.05 * H, 0.008 * H, 0.1 * H, PALETTE.steel);
      plate.position.copy(tread).setY(tread.y - 0.004 * H);
      group.add(plate);
    }
    return group;
  };
}

/** The ridden horse, off its rig; null without one. */
export function horseModel(rig: Rig | null): CraftModel | null {
  if (rig === null) return null;
  if (!rig.clips.some((clip) => clip.name === 'Walk')) return null;
  // The herds' scale, which is the one that puts the back at `WITHERS`.
  const k = herdScale(rig);
  const back = measureBack(rig, k);
  const jumps = measureJumps(rig, k);
  // The saddle a twenty-fifth of a body thick on the back, its top the hip:
  // over the section the saddle is fitted to, which holds the back's top.
  const under = sectionAt(back.points, back.top.z, 0.035 * H);
  const hip = Math.max(back.top.y, under.y + under.b) + 0.04 * H;
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
  const saddleOf = buildSaddle(back, hip, seats[0]!);
  const build = (variant: number): THREE.Group => {
    const saddle = saddleOf(variant);
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
