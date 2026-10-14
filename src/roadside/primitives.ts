import * as THREE from 'three';
import { ALWAYS, DARK } from './constants.ts';
import type { Roadside } from './types.ts';

/** Triangle-soup primitives the roadside is built from, appended to a `Roadside`. */

const cornerA = new THREE.Vector3();
const cornerB = new THREE.Vector3();
const cornerC = new THREE.Vector3();
const cornerD = new THREE.Vector3();
const faceN = new THREE.Vector3();

function vertex(out: Roadside, p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, lit: number): void {
  out.position.push(p.x, p.y, p.z);
  out.normal.push(n.x, n.y, n.z);
  out.color.push(c.r, c.g, c.b);
  out.lit.push(lit, ALWAYS);
}

/** One quad, `a b c d` counter-clockwise seen from where `n` points. */
export function quad(
  out: Roadside, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3,
  n: THREE.Vector3, colour: THREE.Color, lit: number,
): void {
  vertex(out, a, n, colour, lit); vertex(out, b, n, colour, lit); vertex(out, c, n, colour, lit);
  vertex(out, a, n, colour, lit); vertex(out, c, n, colour, lit); vertex(out, d, n, colour, lit);
}

const triAB = new THREE.Vector3();
const triAC = new THREE.Vector3();

/** One triangle facing `n`, whatever order its corners come in. */
export function triangle(
  out: Roadside, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, colour: THREE.Color, lit: number,
): void {
  triAB.subVectors(b, a);
  triAC.subVectors(c, a);
  if (triAB.cross(triAC).dot(n) >= 0) {
    vertex(out, a, n, colour, lit); vertex(out, b, n, colour, lit); vertex(out, c, n, colour, lit);
  } else {
    vertex(out, a, n, colour, lit); vertex(out, c, n, colour, lit); vertex(out, b, n, colour, lit);
  }
}

const flatCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/**
 * A flat face in a sign's plane, corners `(u, v)` along `across` and
 * `upward` from `origin`, facing `n`: lettering, a chevron, a figure's stroke.
 */
export function flat(
  out: Roadside, origin: THREE.Vector3, across: THREE.Vector3, upward: THREE.Vector3, n: THREE.Vector3,
  corners: readonly (readonly [number, number])[], colour: THREE.Color, lit = DARK,
): void {
  for (let k = 0; k < 4; k++) {
    const [u, v] = corners[k]!;
    flatCorners[k]!.copy(origin).addScaledVector(across, u).addScaledVector(upward, v);
  }
  triangle(out, flatCorners[0]!, flatCorners[1]!, flatCorners[2]!, n, colour, lit);
  triangle(out, flatCorners[0]!, flatCorners[2]!, flatCorners[3]!, n, colour, lit);
}

/** A rectangle `flat`, centred on `(u, v)` with half-sizes `hu` and `hv`. */
export function panel(
  out: Roadside, origin: THREE.Vector3, across: THREE.Vector3, upward: THREE.Vector3, n: THREE.Vector3,
  u: number, v: number, hu: number, hv: number, colour: THREE.Color,
): void {
  flat(out, origin, across, upward, n, [[u - hu, v - hv], [u + hu, v - hv], [u + hu, v + hv], [u - hu, v + hv]], colour);
}

const discA = new THREE.Vector3();
const discB = new THREE.Vector3();
const discFarA = new THREE.Vector3();
const discFarB = new THREE.Vector3();
const discFront = new THREE.Vector3();
const discBack = new THREE.Vector3();
const discNormal = new THREE.Vector3();
const DISC_SIDES = 12;

/**
 * A round plate of `radius`, `depth` thick along `n`: the face in `colour`
 * and, unless `back` is null, a back in `back`. No rim; the outline draws it.
 */
export function disc(
  out: Roadside, centre: THREE.Vector3, across: THREE.Vector3, upward: THREE.Vector3, n: THREE.Vector3,
  radius: number, depth: number, colour: THREE.Color, back: THREE.Color | null,
): void {
  discFront.copy(centre).addScaledVector(n, depth * 0.5);
  discBack.copy(centre).addScaledVector(n, -depth * 0.5);
  discNormal.copy(n).negate();
  for (let k = 0; k < DISC_SIDES; k++) {
    const a0 = (k / DISC_SIDES) * Math.PI * 2;
    const a1 = ((k + 1) / DISC_SIDES) * Math.PI * 2;
    discA.copy(discFront).addScaledVector(across, Math.cos(a0) * radius).addScaledVector(upward, Math.sin(a0) * radius);
    discB.copy(discFront).addScaledVector(across, Math.cos(a1) * radius).addScaledVector(upward, Math.sin(a1) * radius);
    triangle(out, discFront, discA, discB, n, colour, DARK);
    if (back === null) continue;
    discFarA.copy(discA).addScaledVector(n, -depth);
    discFarB.copy(discB).addScaledVector(n, -depth);
    triangle(out, discBack, discFarA, discFarB, discNormal, back, DARK);
  }
}

/**
 * The seven strokes of a figure as `[u, v, hu, hv]` in a cell one wide and
 * two tall: top, upper right, lower right, bottom, lower left, upper left, middle.
 */
const STROKES: readonly (readonly [number, number, number, number])[] = [
  [0, 0.9, 0.5, 0.1], [0.4, 0.45, 0.1, 0.45], [0.4, -0.45, 0.1, 0.45],
  [0, -0.9, 0.5, 0.1], [-0.4, -0.45, 0.1, 0.45], [-0.4, 0.45, 0.1, 0.45], [0, 0, 0.5, 0.1],
];
/** Which strokes each digit lights, one bit per stroke in `STROKES` order. */
const FIGURES = [0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110, 0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111];

/** A number in strokes, `height` tall, centred on `(u, v)` of a face. */
export function figures(
  out: Roadside, origin: THREE.Vector3, across: THREE.Vector3, upward: THREE.Vector3, n: THREE.Vector3,
  value: number, u: number, v: number, height: number, colour: THREE.Color,
): void {
  const digits = String(value);
  const scale = height / 2;
  const pitch = scale * 1.35;
  const first = u - ((digits.length - 1) * pitch) / 2;
  for (let d = 0; d < digits.length; d++) {
    const mask = FIGURES[Number(digits[d])] ?? 0;
    for (let k = 0; k < STROKES.length; k++) {
      if ((mask & (1 << k)) === 0) continue;
      const [su, sv, hu, hv] = STROKES[k]!;
      panel(out, origin, across, upward, n, first + d * pitch + su * scale, v + sv * scale, hu * scale, hv * scale, colour);
    }
  }
}

const boxAxes: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const boxCentre = new THREE.Vector3();
const boxHalf = new THREE.Vector3();
const faceU = new THREE.Vector3();
const faceV = new THREE.Vector3();
const faceC = new THREE.Vector3();

/**
 * A box on the frame `(right, up, forward)`, which must be right-handed
 * (`right = up x forward`), centred on `centre` with half-sizes `hx, hy, hz`.
 * The bottom face is left out unless `bottom` is set.
 */
export function box(
  out: Roadside, centre: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, forward: THREE.Vector3,
  hx: number, hy: number, hz: number, colour: THREE.Color, lit = DARK, bottom = false,
): void {
  boxAxes[0]!.copy(right);
  boxAxes[1]!.copy(up);
  boxAxes[2]!.copy(forward);
  boxCentre.copy(centre);
  boxHalf.set(hx, hy, hz);
  // Each face as (normal axis, sign, u axis, v axis) with u x v the outward normal.
  const faces: [number, number, number, number][] = [[0, 1, 1, 2], [0, -1, 2, 1], [1, 1, 2, 0], [2, 1, 0, 1], [2, -1, 1, 0]];
  if (bottom) faces.push([1, -1, 0, 2]);
  for (const [axis, sign, u, v] of faces) {
    const h = boxHalf.getComponent(axis);
    faceC.copy(boxCentre).addScaledVector(boxAxes[axis]!, sign * h);
    faceU.copy(boxAxes[u]!).multiplyScalar(boxHalf.getComponent(u));
    faceV.copy(boxAxes[v]!).multiplyScalar(boxHalf.getComponent(v));
    faceN.copy(boxAxes[axis]!).multiplyScalar(sign);
    cornerA.copy(faceC).sub(faceU).sub(faceV);
    cornerB.copy(faceC).add(faceU).sub(faceV);
    cornerC.copy(faceC).add(faceU).add(faceV);
    cornerD.copy(faceC).sub(faceU).add(faceV);
    quad(out, cornerA, cornerB, cornerC, cornerD, faceN, colour, lit);
  }
}

const tubeAlong = new THREE.Vector3();
const tubeUp = new THREE.Vector3();
const tubeSide = new THREE.Vector3();
const tubeMid = new THREE.Vector3();

/** A square bar from `a` to `b`, `width` across, its sides squared to `up`. */
export function bar(out: Roadside, a: THREE.Vector3, b: THREE.Vector3, up: THREE.Vector3, width: number, colour: THREE.Color): void {
  tubeAlong.subVectors(b, a);
  const length = tubeAlong.length();
  if (length < 1e-6) return;
  tubeAlong.multiplyScalar(1 / length);
  tubeSide.crossVectors(up, tubeAlong).normalize();
  tubeUp.crossVectors(tubeAlong, tubeSide).normalize();
  tubeMid.addVectors(a, b).multiplyScalar(0.5);
  // (side, up, along) is right-handed.
  box(out, tubeMid, tubeSide, tubeUp, tubeAlong, width * 0.5, width * 0.5, length * 0.5, colour, DARK, true);
}

const prismAlong = new THREE.Vector3();
const prismU = new THREE.Vector3();
const prismV = new THREE.Vector3();
const prismN = new THREE.Vector3();
const prismCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const prismFar = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/** A wire from `a` to `b`: a three-sided prism `width` across, which the outline draws as a line. */
export function wire(out: Roadside, a: THREE.Vector3, b: THREE.Vector3, width: number, colour: THREE.Color): void {
  prismAlong.subVectors(b, a);
  if (prismAlong.lengthSq() < 1e-12) return;
  prismAlong.normalize();
  prismU.copy(a).normalize().cross(prismAlong);
  if (prismU.lengthSq() < 1e-12) return;
  prismU.normalize();
  prismV.crossVectors(prismAlong, prismU).normalize();
  const r = width * 0.577;
  for (let k = 0; k < 3; k++) {
    const angle = (k * Math.PI * 2) / 3;
    prismCorners[k]!.copy(a).addScaledVector(prismU, Math.cos(angle) * r).addScaledVector(prismV, Math.sin(angle) * r);
    prismFar[k]!.copy(prismCorners[k]!).add(b).sub(a);
  }
  for (let k = 0; k < 3; k++) {
    const j = (k + 1) % 3;
    const angle = ((k + 0.5) * Math.PI * 2) / 3;
    prismN.copy(prismU).multiplyScalar(Math.cos(angle)).addScaledVector(prismV, Math.sin(angle)).normalize();
    quad(out, prismCorners[k]!, prismCorners[j]!, prismFar[j]!, prismFar[k]!, prismN, colour, DARK);
  }
}
