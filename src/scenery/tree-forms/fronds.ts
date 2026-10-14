import * as THREE from 'three';
import { CONE_RAGGED, crownNormal, hash, type Crown } from './crowns.ts';
import { UP, push, scaled, type CardSoup, type RGB, type Soup } from './soup.ts';

export interface FrondSpec {
  base: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  width: number;
  /** How far it falls over its length, as a share of it. */
  droop: number;
  segments: number;
  /** How far the normal is turned toward the sky: a frond is lit as the crown's top. */
  upward: number;
  /** How far its two halves fold down from the midrib, radians. */
  fold: number;
  /** Its width at the tip against the base; 1 keeps it, and the atlas shapes it. */
  taper: number;
  colour: (s: number) => RGB;
}

/**
 * A frond as rows of three points across — the two edges and the midrib — at
 * `segments + 1` stations along it, each row with its normal. It goes straight
 * out along `dir`, falling as the square of the way along.
 */
export function frondRows(spec: FrondSpec): { rows: THREE.Vector3[][]; normals: THREE.Vector3[] } {
  const p = spec.dir.clone().normalize();
  const side = new THREE.Vector3().crossVectors(p, UP);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const rows: THREE.Vector3[][] = [];
  const normals: THREE.Vector3[] = [];
  for (let i = 0; i <= spec.segments; i++) {
    const s = i / spec.segments;
    const x = spec.base.clone().addScaledVector(p, s * spec.length);
    x.y -= spec.droop * s * s * spec.length;
    const c = p.clone();
    c.y -= 2 * spec.droop * s;
    c.normalize();
    const n = new THREE.Vector3().crossVectors(side, c).normalize();
    if (n.y < 0) n.negate();
    n.lerp(UP, spec.upward).normalize();
    const half = (spec.width / 2) * (1 + (spec.taper - 1) * s);
    const drop = n.clone().multiplyScalar(-half * Math.sin(spec.fold));
    rows.push([
      x.clone().addScaledVector(side, -half * Math.cos(spec.fold)).add(drop),
      x,
      x.clone().addScaledVector(side, half * Math.cos(spec.fold)).add(drop),
    ]);
    normals.push(n);
  }
  return { rows, normals };
}

/** A frond as a card strip, the atlas's `rect` along it, stem up the middle. */
export function frondCard(out: CardSoup, spec: FrondSpec, rect: readonly number[], flutter: number, random: number): void {
  const { rows, normals } = frondRows(spec);
  const [u0, v0, u1, v1] = rect as readonly [number, number, number, number];
  const us = [u0, (u0 + u1) / 2, u1];
  const vertex = (i: number, k: number): void => {
    const s = i / spec.segments;
    push(out, rows[i]![k]!, normals[i]!, spec.colour(s));
    out.uv.push(us[k]!, v0 + (v1 - v0) * s);
    out.leaf.push(flutter * (0.3 + 0.7 * s), random);
  };
  for (let i = 0; i < spec.segments; i++) {
    for (const [a, b] of [[0, 1], [1, 2]] as const) {
      vertex(i, a);
      vertex(i, b);
      vertex(i + 1, a);
      vertex(i + 1, a);
      vertex(i, b);
      vertex(i + 1, b);
    }
  }
}

/**
 * A frond as solid strips, for a far crown: both faces, since the kit's
 * materials are one-sided, the underside's normal the top's turned down.
 */
export function frondSolid(out: Soup, spec: FrondSpec): void {
  const { rows, normals } = frondRows(spec);
  const under = new THREE.Vector3();
  for (let i = 0; i < spec.segments; i++) {
    const c0 = spec.colour(i / spec.segments);
    const c1 = spec.colour((i + 1) / spec.segments);
    for (const [a, b] of [[0, 1], [1, 2]] as const) {
      const quad: [THREE.Vector3, THREE.Vector3, RGB][] = [
        [rows[i]![a]!, normals[i]!, c0],
        [rows[i]![b]!, normals[i]!, c0],
        [rows[i + 1]![a]!, normals[i + 1]!, c1],
        [rows[i + 1]![b]!, normals[i + 1]!, c1],
      ];
      // Which way round is up depends on the frond's own heading: wind it by
      // its normal rather than by a rule.
      const e1 = quad[1]![0].clone().sub(quad[0]![0]);
      const e2 = quad[2]![0].clone().sub(quad[0]![0]);
      const faceUp = e1.cross(e2).dot(normals[i]!) > 0;
      const top = faceUp ? [0, 1, 2, 2, 1, 3] : [0, 2, 1, 1, 2, 3];
      for (const k of top) push(out, quad[k]![0], quad[k]![1], quad[k]![2]);
      const bottom = faceUp ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 2, 1, 3];
      for (const k of bottom) push(out, quad[k]![0], under.copy(quad[k]![1]).negate(), scaled(quad[k]![2], 0.7));
    }
  }
}

/** A cone for a far conifer's tier: `sides` round, its skirt at `y0`, its point at `y1`, its underside closed. */
export function cone(out: Soup, y0: number, y1: number, radius: number, sides: number, colour: RGB, under: RGB | null, crown: Crown): void {
  const apex = new THREE.Vector3(0, y1, 0);
  const centre = new THREE.Vector3(0, y0, 0);
  const slope = radius / Math.max(1e-3, y1 - y0);
  const down = new THREE.Vector3(0, -1, 0);
  const whole = new THREE.Vector3();
  // A ragged skirt: every other corner of the rim pulled in, each one moved
  // in and out and up and down by a hash of where it is — the silhouette of
  // a fir's boughs at a distance, not a toy's cone.
  const rim: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2;
    const h = hash(y0 * 3.1 + k, radius * 1.7, y1);
    const reach = radius * (k % 2 === 0 ? 1 : 0.72) * (1 + CONE_RAGGED * (h * 2 - 1));
    // Never under 0.75: a slice of bare trunk is what a trunk's disc is measured from.
    const y = Math.max(0.75, y0 + radius * 0.18 * (hash(k, y0, 1.3) - 0.5) - (k % 2 === 0 ? radius * 0.08 : 0));
    const p = new THREE.Vector3(Math.cos(a) * reach, y, Math.sin(a) * reach);
    const n = new THREE.Vector3(Math.cos(a), slope, Math.sin(a)).normalize();
    n.multiplyScalar(0.6).addScaledVector(crownNormal(crown, p, whole), 0.4).normalize();
    rim.push({ p, n });
  }
  const top = new THREE.Vector3(0, 1, 0).addScaledVector(crownNormal(crown, apex, whole), 0.5).normalize();
  for (let k = 0; k < sides; k++) {
    const a = rim[k]!;
    const b = rim[(k + 1) % sides]!;
    // Wound (rim, apex, next) with the angle rising: outward (see `tube`'s frame).
    push(out, a.p, a.n, scaled(colour, 0.9 + 0.2 * hash(k, y1, 7)));
    push(out, apex, top, scaled(colour, 1.15));
    push(out, b.p, b.n, scaled(colour, 0.9 + 0.2 * hash(k + 1, y1, 7)));
    if (under === null) continue;
    push(out, a.p, down, under);
    push(out, b.p, down, under);
    push(out, centre, down, under);
  }
}
