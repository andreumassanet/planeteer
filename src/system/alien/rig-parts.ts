import type { Bone, BufferGeometry, Mesh, Object3D } from 'three';
import type { SceneryContext } from '../../scenery/contract.ts';
import type { Alien, Morph } from '../contract.ts';
import type { Frame } from './frame.ts';
import { type Ring, type Three, blob, joined, lathe, limb, scaled } from './geometry.ts';
import type { ArmRig, LegRig } from './types.ts';

/** What the part builders share: the scene context, the species' numbers and the joint and mesh makers. */
export interface Build {
  ctx: SceneryContext;
  T: Three;
  morph: Morph;
  alien: Alien;
  f: Frame;
  joint(parent: Object3D, name: string, x: number, y: number, z: number): Bone;
  /** A section painted counter-shaded: lighter underneath and in front, darker over the back. */
  painted(geometry: BufferGeometry, shade: (x: number, y: number, z: number) => number): Mesh;
  solid(geometry: BufferGeometry, color: number): Mesh;
}

/** A hide colour as linear RGB, for the painted sections. */
function linear(T: Three, hex: number): [number, number, number] {
  const c = new T.Color().setHex(hex);
  return [c.r, c.g, c.b];
}

/** A limb's shade: darker toward its far end, the light falling off it. */
export const limbShade = (length: number) => (_x: number, y: number, z: number): number => 1.02 - 0.1 * Math.min(1, -y / Math.max(1e-6, length)) + (z > 0 ? 0.03 : -0.02);

export function createBuild(ctx: SceneryContext, morph: Morph, alien: Alien, f: Frame): Build {
  const T = ctx.THREE;
  // The hide is painted a vertex at a time, so the figure is modelled by its
  // colour as well as by the light; `shade` is unit-free, about 0.86 to 1.12.
  const hide = linear(T, alien.hide);
  return {
    ctx,
    T,
    morph,
    alien,
    f,
    joint(parent, name, x, y, z) {
      const bone = new T.Bone();
      bone.name = name;
      bone.position.set(x, y, z);
      parent.add(bone);
      return bone;
    },
    painted(geometry, shade) {
      const p = geometry.getAttribute('position');
      const colors = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const s = shade(p.getX(i), p.getY(i), p.getZ(i));
        colors[i * 3] = Math.min(1, hide[0] * s);
        colors[i * 3 + 1] = Math.min(1, hide[1] * s);
        colors[i * 3 + 2] = Math.min(1, hide[2] * s);
      }
      geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
      return ctx.coloured(geometry);
    },
    solid: (geometry, color) => new T.Mesh(geometry, ctx.toon(color)),
  };
}

/** The legs, one or two pairs, each hip to ankle with a foot. */
export function addLegs(b: Build, root: Bone): LegRig[] {
  const { T, morph, alien, f, joint, painted, solid } = b;
  const legs: LegRig[] = [];
  const legPairs = morph.legPairs;
  for (let pair = 0; pair < legPairs; pair++) {
    // Two pairs stand under the trunk fore and aft, the back pair slightly
    // narrower: a stance, not a copy. Widening it instead reads as a table.
    const z = legPairs === 1 ? 0 : (pair === 0 ? 1 : -1) * Math.max(f.depth * 0.6, f.limbR * 2.5);
    const narrow = pair === 0 ? 1 : 0.86;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const x = sign * f.legX * narrow;
      const hip = joint(root, `hip${pair}${side}`, x, f.hip, z);
      hip.add(painted(limb(T, f.limbR * 1.18, f.limbR * 0.92, f.thigh, 6), limbShade(f.thigh)));
      const knee = joint(hip, `knee${pair}${side}`, 0, -f.thigh, 0);
      knee.add(painted(limb(T, f.limbR * 0.94, f.limbR * 0.7, f.shin, legPairs === 1 ? 6 : 5), limbShade(f.shin)));
      const ankle = joint(knee, `ankle${pair}${side}`, 0, -f.shin, 0);
      // The foot: a lozenge reaching forward of the ankle, sole flat at
      // `-ankle`, in the trim colour like a boot.
      const foot = solid(blob(T, f.limbR * 1.25, f.ankle * 0.5, f.limbR * 2.3, 6, 1), alien.trim);
      foot.position.set(0, -f.ankle * 0.5, f.limbR * 0.9);
      ankle.add(foot);
      legs.push({ hip, knee, ankle, pair, side, sign, sole: f.ankle, x });
    }
  }
  return legs;
}

/** The trunk on its own joint: rounded segments, counter-shaded. */
export function addTrunk(b: Build, root: Bone): { upper: Bone; run: number; trunkTop: number } {
  const { T, morph, f, joint, painted } = b;
  const upper = joint(root, 'upper', 0, f.hip, 0);
  const run = f.shoulder - f.hip;
  const segments = morph.segments;
  const trunk: BufferGeometry[] = [];
  // An egg, broad at the shoulder: unit radius, from pole to pole.
  const EGG: readonly Ring[] = [[0, -1], [0.8, -0.62], [1, 0.02], [0.88, 0.62], [0, 1]];
  for (let n = 0; n < segments; n++) {
    // Segments taper upward on a one-segment body and *outward* on a
    // three-segment one, which is what makes an insect read as an insect
    // rather than as a person with lines drawn on them.
    const t0 = n / segments;
    const t1 = (n + 1) / segments;
    const wide = segments === 1 ? 1 : 0.82 + 0.36 * Math.sin((t0 + t1) * 0.5 * Math.PI);
    const bottom = n === 0 ? -Math.min(f.thigh * 0.3, run * 0.25) : run * t0 - run * 0.06;
    const top = n === segments - 1 ? run + f.limbR * 1.2 : run * t1 + run * 0.06;
    const half0 = segments === 1 ? f.hipHalf * 1.05 : (f.hipHalf + (f.shoulderHalf - f.hipHalf) * t0) * wide;
    const half1 = segments === 1 ? f.shoulderHalf * 1.08 : (f.hipHalf + (f.shoulderHalf - f.hipHalf) * t1) * wide;
    const depth = f.depth * (segments === 1 ? 1.02 : wide);
    const egg = lathe(T, EGG, segments === 1 ? 8 : 7);
    const p = egg.getAttribute('position');
    const mid = (bottom + top) / 2;
    const span = (top - bottom) / 2;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getY(i) + 1) / 2;
      const half = half0 + (half1 - half0) * u;
      p.setXYZ(i, p.getX(i) * half, mid + p.getY(i) * span, p.getZ(i) * depth);
    }
    egg.computeVertexNormals();
    trunk.push(egg);
  }
  const trunkTop = run + f.limbR * 1.2;
  // Counter-shaded: a pale belly and chest in front, a darker back.
  upper.add(painted(joined(T, trunk), (_x, y, z) => 0.95 + 0.12 * Math.max(0, z / Math.max(1e-6, f.depth)) - 0.06 * Math.max(0, -z / Math.max(1e-6, f.depth)) + 0.03 * (y / Math.max(1e-6, run))));
  return { upper, run, trunkTop };
}

/**
 * The arms. Every pair after the first hangs lower and slightly shorter: the
 * lower pair carries, the upper gestures, which is how four arms read as four.
 */
export function addArms(b: Build, upper: Bone, run: number): ArmRig[] {
  const { T, morph, f, joint, painted } = b;
  const arms: ArmRig[] = [];
  for (let pair = 0; pair < morph.armPairs; pair++) {
    const drop = pair * run * 0.3;
    const shrink = pair === 0 ? 1 : 0.84;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const shoulder = joint(upper, `shoulder${pair}${side}`, sign * f.armX, run - drop - f.limbR * 0.6, 0);
      shoulder.add(painted(limb(T, f.limbR * 1.05, f.limbR * 0.82, f.upperArm * shrink, 6), limbShade(f.upperArm)));
      const elbow = joint(shoulder, `elbow${pair}${side}`, 0, -f.upperArm * shrink, 0);
      elbow.add(painted(limb(T, f.limbR * 0.84, f.limbR * 0.64, f.forearm * shrink, 5), limbShade(f.forearm)));
      const hand = painted(blob(T, f.limbR * 1.05, f.hand * shrink * 0.6, f.limbR * 0.85, 5, 1), () => 0.96);
      hand.position.y = -f.forearm * shrink - f.hand * shrink * 0.45;
      elbow.add(hand);
      arms.push({ shoulder, elbow, pair, side, sign, reach: f.forearm * shrink + f.hand * shrink * 0.45 });
    }
  }
  return arms;
}

/** The neck, the skull and the face; returns the head joint and the skull's proportions. */
export function addHead(b: Build, upper: Bone, run: number): { head: Bone; wx: number; wz: number; forward: number } {
  const { T, morph, f, joint, painted } = b;
  if (morph.neck !== 'none') {
    const neck = painted(limb(T, f.limbR * 1.3, f.limbR * 1.05, f.neck + f.limbR, 6), () => 0.97);
    // A hanging section turned a half turn stands up from its joint.
    neck.rotation.x = Math.PI;
    neck.position.y = run;
    upper.add(neck);
  }
  // With no neck the head sits down into the shoulders.
  const head = joint(upper, 'head', 0, morph.neck === 'none' ? run - f.head * 0.14 : run + f.neck, 0);
  // Under four sides the head is a wedge — a leading edge, longer front to
  // back and narrower — and from six up an egg; between, between.
  const wedge = Math.min(1, Math.max(0, (6 - morph.headSides) / 3));
  const wx = f.headHalf * (1 - 0.2 * wedge);
  const wz = f.headHalf * 1.1 * (1 + 0.35 * wedge);
  const forward = f.headHalf * 0.2 * wedge;
  const SKULL: readonly Ring[] = [[0, 0], [0.8, 0.15], [1, 0.5], [0.75, 0.88], [0, 1]];
  const skull = scaled(lathe(T, SKULL, 8), wx, f.head, wz);
  skull.translate(0, 0, forward);
  // A paler muzzle: the face is lit and the crown is not.
  head.add(painted(skull, (_x, y, z) => 0.94 + 0.12 * Math.max(0, z / wz) - 0.04 * (y / f.head)));
  return { head, wx, wz, forward };
}
