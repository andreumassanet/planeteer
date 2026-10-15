import * as THREE from 'three';
import type { Rng } from '../random.ts';
import { LEAF_GAIN, LEAF_TEXTURE_MEAN, UP, push, scaled, type CardSoup, type RGB, type Soup } from './soup.ts';

/** A cluster of leaves: a centre, a radius, how squat, and its own green. */
export interface Cluster {
  c: THREE.Vector3;
  r: number;
  /** Height against width. */
  squat: number;
  colour: RGB;
}

/** A crown's middle and its half-extents, which the light and the shade are worked out against. */
export interface Crown {
  c: THREE.Vector3;
  r: THREE.Vector3;
}

/**
 * How lit a point of a crown is before any light falls on it: darker low and
 * deep, lighter high and at the rim, as a lightness, and a touch cooler inside.
 */
export function crownShade(crown: Crown, p: THREE.Vector3, base: RGB): RGB {
  const ux = (p.x - crown.c.x) / crown.r.x;
  const uy = (p.y - crown.c.y) / crown.r.y;
  const uz = (p.z - crown.c.z) / crown.r.z;
  const high = Math.min(1, Math.max(0, uy * 0.5 + 0.5));
  const out = Math.min(1.2, Math.hypot(ux, uy, uz));
  const lightness = LEAF_GAIN * Math.min(1.1, Math.max(0.45, 0.5 + 0.38 * high * high + 0.22 * out));
  const inside = 1 - Math.min(1, out);
  return [base[0] * lightness * (1 - 0.1 * inside), base[1] * lightness, base[2] * lightness * (1 + 0.12 * inside)];
}

/** The crown's normal at a point: out from its middle through its own ellipsoid, a little up. */
export function crownNormal(crown: Crown, p: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  return target
    .set((p.x - crown.c.x) / (crown.r.x * crown.r.x), (p.y - crown.c.y) / (crown.r.y * crown.r.y), (p.z - crown.c.z) / (crown.r.z * crown.r.z))
    .normalize();
}

/** A number in [0, 1) from three: deterministic, and drawing nothing from any `Rng`. */
export function hash(a: number, b: number, c: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
}
/** How far a far lump's corners are pushed in and out, as a share of it. */
export const LUMP_RAGGED = 0.14;
/** And a far cone's rim. */
export const CONE_RAGGED = 0.18;

/** The unit icosahedron, as three draws it: non-indexed, wound outward. */
export const ICOSAHEDRON = new THREE.IcosahedronGeometry(1, 0).getAttribute('position').array as Float32Array;

/**
 * How far a lump's shading normal may lean from its own surface's, as the
 * least cosine between them. A lump deep in the crown, where the crown's
 * normal turns right round across it, would otherwise shade its faces from
 * the far side.
 */
const LUMP_FACING = 0.6;

/**
 * A cluster as a lump for the far crown: the icosahedron stretched to it, its
 * normals most of the way to the crown's own so the lumps shade as one mass
 * and not as twenty facets each.
 */
export function lump(out: Soup, cluster: Cluster, crown: Crown, shrink: number): void {
  const p = new THREE.Vector3();
  const local = new THREE.Vector3();
  const whole = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const r = cluster.r * shrink;
  const ry = r * cluster.squat;
  // Each lump its own shade of the cluster's green, and its twelve corners
  // pushed in and out by a hash of where they are: the same corner of two
  // faces moves together, so the lump stays closed.
  const seed = cluster.c.x * 3.7 + cluster.c.y * 1.3 + cluster.c.z * 2.9;
  const colour = scaled(cluster.colour, LEAF_TEXTURE_MEAN * (0.92 + 0.16 * hash(seed, 1, 2)));
  for (let i = 0; i < ICOSAHEDRON.length; i += 3) {
    const x = ICOSAHEDRON[i]!;
    const y = ICOSAHEDRON[i + 1]!;
    const z = ICOSAHEDRON[i + 2]!;
    const k = 1 + LUMP_RAGGED * (hash(seed + x * 7.1, y * 5.3, z * 3.7) * 2 - 1);
    p.set(cluster.c.x + x * r * k, cluster.c.y + y * ry * k, cluster.c.z + z * r * k);
    local.set(x / r, y / ry, z / r).normalize();
    crownNormal(crown, p, whole);
    radial.copy(local);
    local.multiplyScalar(0.4).addScaledVector(whole, 0.6).normalize();
    // Never lean further than `LUMP_FACING` from the lump's own surface.
    for (let pull = 0; pull < 4 && local.dot(radial) < LUMP_FACING; pull++) local.add(radial).normalize();
    push(out, p, local, crownShade(crown, p, colour));
  }
}

/** A random direction on the sphere. */
export function onSphere(rng: Rng, target: THREE.Vector3): THREE.Vector3 {
  const y = rng.unit() * 2 - 1;
  const a = rng.unit() * Math.PI * 2;
  const s = Math.sqrt(1 - y * y);
  return target.set(Math.cos(a) * s, y, Math.sin(a) * s);
}

export const cardA = new THREE.Vector3();
export const cardB = new THREE.Vector3();
export const cardQ = new THREE.Vector3();
export const cardJ = new THREE.Vector3();
export const cardP = new THREE.Vector3();

/**
 * One card: a square `size` across at `centre`, facing `facing` and rolled by
 * `roll` about it, its texture the atlas's `rect`, every corner carrying the
 * crown's `normal`. Its bottom edge a fifth darker than its top, which is the
 * shade a cluster casts on itself.
 */
export function card(out: CardSoup, centre: THREE.Vector3, facing: THREE.Vector3, roll: number, size: number, rect: readonly number[], normal: THREE.Vector3, colour: RGB, flutter: number, random: number): void {
  const reference = Math.abs(facing.y) > 0.95 ? cardA.set(1, 0, 0) : cardA.set(0, 1, 0);
  cardQ.crossVectors(reference, facing).normalize();
  cardJ.crossVectors(facing, cardQ).normalize();
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  cardA.copy(cardQ).multiplyScalar(cos).addScaledVector(cardJ, sin);
  cardB.copy(cardJ).multiplyScalar(cos).addScaledVector(cardQ, -sin);
  const half = size / 2;
  const corners = [
    [-1, -1, rect[0]!, rect[1]!],
    [1, -1, rect[2]!, rect[1]!],
    [1, 1, rect[2]!, rect[3]!],
    [-1, 1, rect[0]!, rect[3]!],
  ] as const;
  const at = (k: number): void => {
    const [x, y, u, v] = corners[k]!;
    cardP.copy(centre).addScaledVector(cardA, x * half).addScaledVector(cardB, y * half);
    const shade = 0.8 + 0.2 * Math.min(1, Math.max(0, (cardP.y - (centre.y - half)) / size));
    push(out, cardP, normal, scaled(colour, shade));
    out.uv.push(u, v);
    out.leaf.push(flutter, random);
  };
  for (const k of [0, 1, 2, 0, 2, 3]) at(k);
}

/**
 * A crown's clusters as cards, `target` of them shared out by each cluster's
 * area: a card hangs somewhere in its cluster, mostly on the upper and outer
 * side, faces out with a random twist, and is lit as the crown.
 */
export function clusterCards(out: CardSoup, rng: Rng, clusters: readonly Cluster[], crown: Crown, rect: readonly number[], target: number, size: number, reach: number, facingUp = 0): void {
  let area = 0;
  for (const cluster of clusters) area += cluster.r * cluster.r;
  const dir = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const random = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (const cluster of clusters) {
    const count = Math.max(3, Math.round((target * cluster.r * cluster.r) / area));
    outward.subVectors(cluster.c, crown.c);
    if (outward.lengthSq() > 1e-4) outward.normalize();
    else outward.set(0, 0, 0);
    for (let i = 0; i < count; i++) {
      onSphere(rng, dir);
      // Most of the leaves on the upper half, and out from the crown's middle.
      dir.y = Math.abs(dir.y) * 0.8 + dir.y * 0.2;
      dir.addScaledVector(outward, 0.5).normalize();
      const depth = rng.range(0.3, 0.95);
      centre.copy(cluster.c).addScaledVector(dir, cluster.r * depth);
      centre.y = cluster.c.y + (centre.y - cluster.c.y) * cluster.squat;
      const s = size * cluster.r * rng.range(0.85, 1.2);
      // Inside the footprint, whatever the draw: a card's leaves fill about
      // two thirds of its half-width.
      const flat = Math.hypot(centre.x, centre.z);
      const room = reach - s * 0.34;
      if (flat > room && flat > 1e-6) {
        centre.x *= room / flat;
        centre.z *= room / flat;
      }
      centre.y = Math.max(centre.y, s * 0.3);
      facing.copy(dir).multiplyScalar(0.55).add(onSphere(rng, random).multiplyScalar(0.45));
      if (facingUp > 0) facing.addScaledVector(UP, facingUp);
      facing.normalize();
      crownNormal(crown, centre, normal).multiplyScalar(0.75).addScaledVector(dir, 0.4).add(cardB.set(0, 0.15, 0)).normalize();
      const u = Math.min(1, Math.hypot((centre.x - crown.c.x) / crown.r.x, (centre.y - crown.c.y) / crown.r.y, (centre.z - crown.c.z) / crown.r.z));
      const colour = scaled(crownShade(crown, centre, cluster.colour), rng.range(0.94, 1.06));
      card(out, centre, facing, rng.range(0, Math.PI * 2), s, rect, normal, colour, 0.4 + 0.6 * u, rng.unit());
    }
  }
}

/** Every cluster pulled in until it is inside the footprint. */
export function keepInside(clusters: Cluster[], reach: number): void {
  for (const cluster of clusters) {
    const flat = Math.hypot(cluster.c.x, cluster.c.z);
    const room = Math.max(0, reach - cluster.r);
    if (flat > room && flat > 1e-6) {
      cluster.c.x *= room / flat;
      cluster.c.z *= room / flat;
    }
  }
}
