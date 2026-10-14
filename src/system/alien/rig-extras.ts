import type { Bone, BufferGeometry, Mesh } from 'three';
import { PALETTE } from '../../theme.ts';
import { blob, joined, lathe, limb } from './geometry.ts';
import { type Build, limbShade } from './rig-parts.ts';

/**
 * Eyes in one row across the face, each a ball with an ink pupil: the whole of
 * the near read, and the pupils are what make one look at something.
 */
export function addEyes(b: Build, head: Bone, wx: number, wz: number, forward: number): void {
  const { T, morph, f, solid } = b;
  const eyeY = f.head * 0.58;
  // The skull's radius at the eyes' height, read off its own profile.
  const atEyes = 1 - 0.25 * ((eyeY / f.head - 0.5) / 0.38);
  const span = morph.eyes === 1 ? 0 : Math.min(1.7, 0.42 * (morph.eyes - 1));
  const eyeR = Math.min(f.headHalf * 0.26, morph.eyes === 1 ? f.headHalf * 0.3 : ((f.headHalf * span) / (morph.eyes - 1)) * 0.46);
  const balls: BufferGeometry[] = [];
  const pupils: BufferGeometry[] = [];
  for (let n = 0; n < morph.eyes; n++) {
    const a = morph.eyes === 1 ? 0 : -span / 2 + (n * span) / (morph.eyes - 1);
    const x = Math.sin(a) * wx * atEyes * 0.94;
    const z = Math.cos(a) * wz * atEyes * 0.94 + forward;
    const ball = blob(T, eyeR, eyeR * 1.12, eyeR * 0.85, 5, 1);
    ball.rotateY(a);
    ball.translate(x, eyeY, z);
    ball.computeVertexNormals();
    balls.push(ball);
    const pupil = blob(T, eyeR * 0.5, eyeR * 0.62, eyeR * 0.32, 4, 1);
    pupil.rotateY(a);
    pupil.translate(x + Math.sin(a) * eyeR * 0.66, eyeY, z + Math.cos(a) * eyeR * 0.66);
    pupil.computeVertexNormals();
    pupils.push(pupil);
  }
  head.add(solid(joined(T, balls), PALETTE.white));
  head.add(solid(joined(T, pupils), PALETTE.ink));
}

/** What is on the crown: a crest, horns or a frill. */
export function addCrown(b: Build, head: Bone, wx: number, wz: number, forward: number): void {
  const { T, morph, alien, f, solid } = b;
  if (morph.crown === 'crest') {
    // A fin along the sagittal plane: the one addition that changes the
    // silhouette from every bearing except dead ahead, which is where the
    // eyes already are.
    const crest = solid(blob(T, f.headHalf * 0.16, f.head * 0.34, wz * 0.85, 6, 2), alien.trim);
    crest.position.set(0, f.head * 0.92, forward - wz * 0.12);
    crest.rotation.x = -0.25;
    head.add(crest);
  } else if (morph.crown === 'horns') {
    for (const sign of [1, -1]) {
      const horn = solid(limb(T, f.headHalf * 0.2, f.headHalf * 0.05, f.head * 0.55, 5), alien.trim);
      // Up and out, swept a little back: a hanging section turned past level.
      horn.position.set(sign * wx * 0.55, f.head * 0.82, forward * 0.5);
      horn.rotation.set(Math.PI - 0.3, 0, sign * 0.45);
      head.add(horn);
    }
  } else if (morph.crown === 'frill') {
    // A membrane round the skull, flaring up and out: a closed shell read
    // counter-clockwise, so it faces outward on both sides.
    const r = f.headHalf;
    const y = f.head * 0.42;
    const frill = lathe(
      T,
      [[r * 0.92, y - f.head * 0.06], [r * 1.95, y + f.head * 0.12], [r * 0.9, y + f.head * 0.04], [r * 0.92, y - f.head * 0.06]],
      8,
    );
    frill.scale(wx / f.headHalf, 1, wz / f.headHalf);
    frill.translate(0, 0, forward);
    frill.computeVertexNormals();
    head.add(solid(frill, alien.trim));
  }
}

/** The tail's joints from the base out, or none. */
export function addTail(b: Build, root: Bone): Bone[] {
  const { T, morph, f, joint, painted } = b;
  const tail: Bone[] = [];
  if (morph.tail > 0) {
    const length = f.height * morph.tail;
    const base = joint(root, 'tail0', 0, f.hip * 0.96, -f.depth * 0.75);
    // Back and a little down, from the hanging convention: a quarter turn
    // less a third of a radian.
    base.rotation.x = Math.PI / 2 - 0.35;
    tail.push(base);
    if (morph.tail < 0.3) {
      // A stub is one section; only a long tail earns the joint that curls it.
      base.add(painted(limb(T, f.limbR * 1.15, f.limbR * 0.4, length, 5), limbShade(length)));
    } else {
      base.add(painted(limb(T, f.limbR * 1.15, f.limbR * 0.7, length * 0.55, 6), limbShade(length * 0.55)));
      const tip = joint(base, 'tail1', 0, -length * 0.55, 0);
      // The far half curls up, so a long tail never reaches the floor.
      tip.rotation.x = 0.45;
      tip.add(painted(limb(T, f.limbR * 0.72, f.limbR * 0.28, length * 0.45, 5), limbShade(length * 0.45)));
      tail.push(tip);
    }
  }
  return tail;
}

/**
 * What is worn. The wardrobe is the largest silhouette lever there is, so
 * each of these changes an outline rather than adding a detail. They are
 * bands round the trunk's own ellipse, so they hug it.
 */
export function addWear(b: Build, upper: Bone, run: number, trunkTop: number): void {
  const { T, ctx, morph, alien, f, solid } = b;
  const segments = morph.segments;
  const trunkHalf = (segments === 1 ? f.shoulderHalf * 1.08 : f.shoulderHalf) * 1.0;
  const band = (y0: number, y1: number, flare: number, color: number): Mesh => {
    const geometry = lathe(T, [[1.0, y0], [1.06 + flare * 0.5, (y0 + y1) / 2], [1.02 + flare, y1]], 8);
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * trunkHalf, p.getY(i), p.getZ(i) * f.depth * 1.04);
    geometry.computeVertexNormals();
    return solid(geometry, color);
  };
  if (alien.wear === 'wrap') {
    upper.add(band(run * 0.02, run * 0.5, 0.12, alien.accent));
  } else if (alien.wear === 'harness') {
    upper.add(band(run * 0.04, run * 0.16, 0.02, alien.trim));
    for (const sign of [1, -1]) {
      const strap = ctx.box(f.shoulderHalf * 0.3, run * 0.9, f.depth * 2.1, alien.accent);
      strap.position.set(sign * f.shoulderHalf * 0.42, run * 0.08, 0);
      strap.rotation.z = sign * 0.18;
      upper.add(strap);
    }
  } else if (alien.wear === 'cloak') {
    // Hem above the knee, which is a *hem* and therefore an outline. Behind
    // the body rather than around it: a cloak that wraps is a barrel.
    const top = trunkTop;
    const hem = -f.thigh * 0.5;
    const r0 = 1.02;
    const r1 = 1.38;
    const cloak = lathe(T, [[r1, hem], [r1 * 1.08, hem], [r0 * 1.1, top], [r0 * 0.98, top], [r1, hem]], 6, Math.PI, Math.PI / 2);
    const p = cloak.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * f.shoulderHalf, p.getY(i), p.getZ(i) * f.depth * 1.15);
    cloak.computeVertexNormals();
    upper.add(solid(cloak, alien.accent));
  } else if (alien.wear === 'suit') {
    upper.add(band(run * 0.9, run + f.limbR, 0.18, alien.accent));
    upper.add(band(run * 0.04, run * 0.14, 0.02, alien.trim));
  }
}

/**
 * What is carried is parented to the trunk and never to a hand: a hand's frame
 * turns with the forearm, so a load hung off one lies down when the elbow
 * bends. Returns the staff's joint, or null.
 */
export function addCarry(b: Build, root: Bone, upper: Bone, head: Bone, run: number): Bone | null {
  const { T, ctx, alien, f, joint, solid } = b;
  let staff: Bone | null = null;
  if (alien.carry === 'pack') {
    const pack = solid(blob(T, f.shoulderHalf * 0.72, run * 0.3, f.depth * 0.55, 6, 2), alien.trim);
    pack.position.set(0, run * 0.58, -f.depth * 1.12);
    upper.add(pack);
  } else if (alien.carry === 'staff') {
    // On a joint of its own under the root: planted beside the body in a
    // still, and carried along beside the hand by the walk.
    staff = joint(root, 'staff', f.armX * 1.3 + f.limbR * 2, 0, f.limbR * 2.4);
    const pole = ctx.column(f.limbR * 0.42, f.height * 0.9, alien.trim, 5);
    staff.add(pole);
    const knob = solid(blob(T, f.limbR * 1.1, f.limbR * 1.4, f.limbR * 1.1, 5, 1), alien.accent);
    knob.position.y = f.height * 0.9 + f.limbR * 0.9;
    staff.add(knob);
  } else if (alien.carry === 'vessel') {
    // Balanced on the crown: a pot, open at the top.
    const r = f.hipHalf * 0.8;
    const h = f.hipHalf * 1.2;
    const vessel = solid(lathe(T, [[0, 0], [r * 0.75, h * 0.08], [r, h * 0.55], [r * 0.62, h]], 7), alien.accent);
    vessel.position.y = f.head * 0.97;
    head.add(vessel);
  }
  return staff;
}
