import * as THREE from 'three';
import type { Rng } from './random.ts';
import type { SceneryContext } from './contract.ts';

/**
 * What a tree is: a trunk and its limbs, and a crown made of clusters of leaf
 * cards — alpha-cut quads painted from one runtime atlas (`foliage.ts`) — the
 * way a painted game draws a wood, and not a faceted lump of plastic.
 *
 * **One generator, three things out of it**, and they are one tree because
 * they come out of one pass over one `Rng`:
 *
 * - `trunk` — the bole, and for the forked species (the acacia, the palm)
 *   what a far eye still sees of the wood;
 * - `limbs` — the boughs a near eye sees through the leaves;
 * - `crown` — the leaves as a few smooth lumps, coloured as the cards average,
 *   for a far tile and for a town, which merge one material and draw no cards;
 * - `cards` — the leaves themselves, with a texture coordinate on the atlas
 *   and what the wind needs to move each one.
 *
 * A near tile (`vegetation.ts`) draws `trunk + limbs` and `cards`; a far one,
 * the scenic part's own build, `trunk + crown`. So the part stays a group of
 * one painted mesh under the kit's contract (`validatePart`), and the same
 * seed is the same tree at both distances, only drawn differently.
 *
 * **The light is in the geometry, as the reference paints it.** Every card
 * carries the crown's normal at the card rather than its own — out from the
 * crown's middle, flattened to the crown's shape — so the whole mass takes the
 * sun as one ball of foliage, lit on one side and cool on the other; and every
 * card's colour is darker the deeper and lower in the crown it hangs (a
 * cluster's own shade, and the crown's), and cooler there. What is left for
 * the shader is the wrap, the light through the leaves, and the wind.
 *
 * Everything is in the part's own frame: y up, standing on y = 0, the axis
 * through the origin, and inside the footprint the part declares.
 */

/** Where each kind of card is painted on the leaf atlas, as `[u0, v0, u1, v1]`. */
export const LEAF_ATLAS = {
  /** A round cluster of broad leaves: the oak, the beech, a bush. */
  broadleaf: [0, 0.5, 0.5, 1],
  /** A cluster of small leaves: the birch, the acacia, the cypress's scale. */
  fine: [0.5, 0.5, 1, 1],
  /** A drooping bough of needles: the conifer's tiers. */
  needles: [0, 0, 0.5, 0.5],
  /** A palm frond, stem up the middle. */
  frond: [0.5, 0, 1, 0.5],
} as const satisfies Record<string, readonly [number, number, number, number]>;
/**
 * The mean linear lightness of the atlas's painted leaves, which a solid crown
 * is drawn at so a tile swapping cards for lumps keeps its colour. The atlas
 * paints each leaf at an sRGB grey of 0.78 to 1 (`foliage.ts`), most near the
 * middle, and the mean of those decoded is about this: an estimate from the
 * painting's own numbers, not a read of the canvas.
 */
export const LEAF_TEXTURE_MEAN = 0.78;
/**
 * What the crown's shade is lifted by, so that a crown averages about four
 * fifths of the region's green (a pack's canopy was drawn at 0.8 to 1.12 of
 * it) rather than the half the shade and the atlas together would leave:
 * the deep leaves at under half of it, the lit top a third over.
 */
const LEAF_GAIN = 1.3;

/** Triangles as flat arrays, three vertices each; colours linear. */
export interface Soup {
  position: number[];
  normal: number[];
  color: number[];
}

/** And the cards': a texture coordinate, and two numbers for the wind. */
export interface CardSoup extends Soup {
  uv: number[];
  /** Two a vertex: how free it is to flutter, 0 at the twig to 1 at the rim; and a number per card, for its phase. */
  leaf: number[];
}

export type Species = 'broadleaf' | 'birch' | 'conifer' | 'cypress' | 'palm' | 'acacia' | 'bush';

export interface TreeForm {
  species: Species;
  /** The tallest of the solid drawing, which is what the kit measures. */
  height: number;
  trunk: Soup;
  limbs: Soup;
  crown: Soup;
  cards: CardSoup;
}

/** What a part hands the generator: its size and its colours, palette hex. */
export interface FormSpec {
  height: number;
  /** The most anything may reach from the axis: the part's footprint, less a hair. */
  reach: number;
  /** Two of the region's foliage greens, mixed per cluster. */
  leaf: number;
  leaf2: number;
  bark: number;
}

type RGB = readonly [number, number, number];

const soup = (): Soup => ({ position: [], normal: [], color: [] });
const cardSoup = (): CardSoup => ({ position: [], normal: [], color: [], uv: [], leaf: [] });

function linear(hex: number): RGB {
  const colour = new THREE.Color(hex);
  return [colour.r, colour.g, colour.b];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scaled(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function push(out: Soup, p: THREE.Vector3, n: THREE.Vector3, c: RGB): void {
  out.position.push(p.x, p.y, p.z);
  out.normal.push(n.x, n.y, n.z);
  out.color.push(c[0], c[1], c[2]);
}

const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// The wood
// ---------------------------------------------------------------------------

/**
 * A tube along a path: rings of `sides` round each point, carried along by
 * parallel transport so a bent limb does not twist, smooth normals out of the
 * axis. `(f, T x f, T)` is a right-handed frame, so a ring's quads wind
 * outward. No caps: a trunk ends in its crown, a limb in its leaves.
 */
function tube(out: Soup, points: readonly THREE.Vector3[], radius: (t: number) => number, sides: number, colour: (t: number, ring: number) => RGB): void {
  const n = points.length;
  const along = [0];
  for (let i = 1; i < n; i++) along.push(along[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
  const total = along[n - 1]! || 1;
  const tangent = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const f = new THREE.Vector3();
  const b = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const rings: { p: THREE.Vector3; n: THREE.Vector3 }[][] = [];
  const colours: RGB[] = [];
  for (let i = 0; i < n; i++) {
    tangent.subVectors(points[Math.min(n - 1, i + 1)]!, points[Math.max(0, i - 1)]!).normalize();
    if (i === 0) {
      f.set(1, 0, 0);
      if (Math.abs(tangent.x) > 0.9) f.set(0, 0, 1);
      f.addScaledVector(tangent, -f.dot(tangent)).normalize();
    } else {
      turn.setFromUnitVectors(previous, tangent);
      f.applyQuaternion(turn);
      f.addScaledVector(tangent, -f.dot(tangent)).normalize();
    }
    previous.copy(tangent);
    b.crossVectors(tangent, f).normalize();
    const t = along[i]! / total;
    const r = radius(t);
    const ring: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const dir = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a)).normalize();
      ring.push({ p: points[i]!.clone().addScaledVector(dir, r), n: dir });
    }
    rings.push(ring);
    colours.push(colour(t, i));
  }
  for (let i = 0; i + 1 < n; i++) {
    for (let k = 0; k < sides; k++) {
      const a = rings[i]![k]!;
      const bb = rings[i]![(k + 1) % sides]!;
      const c = rings[i + 1]![k]!;
      const d = rings[i + 1]![(k + 1) % sides]!;
      push(out, a.p, a.n, colours[i]!);
      push(out, bb.p, bb.n, colours[i]!);
      push(out, c.p, c.n, colours[i + 1]!);
      push(out, bb.p, bb.n, colours[i]!);
      push(out, d.p, d.n, colours[i + 1]!);
      push(out, c.p, c.n, colours[i + 1]!);
    }
  }
}

/** A smooth path through control points, `segments` pieces long. */
function path(points: readonly THREE.Vector3[], segments: number): THREE.Vector3[] {
  return new THREE.CatmullRomCurve3([...points], false, 'centripetal').getPoints(segments);
}

/** A limb from `from` to `to`, arching up through its middle. */
function limb(out: Soup, from: THREE.Vector3, to: THREE.Vector3, radius: number, bark: RGB, rise: number): void {
  const middle = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, rise, 0));
  tube(out, [from, middle, to], (t) => radius * (1 - t * 0.6), 4, (t) => scaled(bark, 0.85 + 0.2 * t));
}

// ---------------------------------------------------------------------------
// The crown
// ---------------------------------------------------------------------------

/** A cluster of leaves: a centre, a radius, how squat, and its own green. */
interface Cluster {
  c: THREE.Vector3;
  r: number;
  /** Height against width. */
  squat: number;
  colour: RGB;
}

/** A crown's middle and its half-extents, which the light and the shade are worked out against. */
interface Crown {
  c: THREE.Vector3;
  r: THREE.Vector3;
}

/**
 * How lit a point of a crown is before any light falls on it: darker low and
 * deep, lighter high and at the rim — the reference's cluster shade, as a
 * lightness — and a touch cooler inside.
 */
function crownShade(crown: Crown, p: THREE.Vector3, base: RGB): RGB {
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
function crownNormal(crown: Crown, p: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  return target
    .set((p.x - crown.c.x) / (crown.r.x * crown.r.x), (p.y - crown.c.y) / (crown.r.y * crown.r.y), (p.z - crown.c.z) / (crown.r.z * crown.r.z))
    .normalize();
}

/** A number in [0, 1) from three: deterministic, and drawing nothing from any `Rng`. */
function hash(a: number, b: number, c: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
}
/** How far a far lump's corners are pushed in and out, as a share of it. */
const LUMP_RAGGED = 0.14;
/** And a far cone's rim. */
const CONE_RAGGED = 0.18;

/** The unit icosahedron, as three draws it: non-indexed, wound outward. */
const ICOSAHEDRON = new THREE.IcosahedronGeometry(1, 0).getAttribute('position').array as Float32Array;

/**
 * A cluster as a lump for the far crown: the icosahedron stretched to it, its
 * normals most of the way to the crown's own so the lumps shade as one mass
 * and not as twenty facets each.
 */
function lump(out: Soup, cluster: Cluster, crown: Crown, shrink: number): void {
  const p = new THREE.Vector3();
  const local = new THREE.Vector3();
  const whole = new THREE.Vector3();
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
    local.multiplyScalar(0.4).addScaledVector(whole, 0.6).normalize();
    push(out, p, local, crownShade(crown, p, colour));
  }
}

/** A random direction on the sphere. */
function onSphere(rng: Rng, target: THREE.Vector3): THREE.Vector3 {
  const y = rng.unit() * 2 - 1;
  const a = rng.unit() * Math.PI * 2;
  const s = Math.sqrt(1 - y * y);
  return target.set(Math.cos(a) * s, y, Math.sin(a) * s);
}

const cardA = new THREE.Vector3();
const cardB = new THREE.Vector3();
const cardQ = new THREE.Vector3();
const cardJ = new THREE.Vector3();
const cardP = new THREE.Vector3();

/**
 * One card: a square `size` across at `centre`, facing `facing` and rolled by
 * `roll` about it, its texture the atlas's `rect`, every corner carrying the
 * crown's `normal`. Its bottom edge a fifth darker than its top, which is the
 * shade a cluster casts on itself.
 */
function card(out: CardSoup, centre: THREE.Vector3, facing: THREE.Vector3, roll: number, size: number, rect: readonly number[], normal: THREE.Vector3, colour: RGB, flutter: number, random: number): void {
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
function clusterCards(out: CardSoup, rng: Rng, clusters: readonly Cluster[], crown: Crown, rect: readonly number[], target: number, size: number, reach: number, facingUp = 0): void {
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
function keepInside(clusters: Cluster[], reach: number): void {
  for (const cluster of clusters) {
    const flat = Math.hypot(cluster.c.x, cluster.c.z);
    const room = Math.max(0, reach - cluster.r);
    if (flat > room && flat > 1e-6) {
      cluster.c.x *= room / flat;
      cluster.c.z *= room / flat;
    }
  }
}

// ---------------------------------------------------------------------------
// Fronds: the palm's leaves and the conifer's boughs
// ---------------------------------------------------------------------------

interface FrondSpec {
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
 * `segments + 1` stations along it, each row with its normal. The reference's
 * frond: straight out along `dir`, falling as the square of the way along.
 */
function frondRows(spec: FrondSpec): { rows: THREE.Vector3[][]; normals: THREE.Vector3[] } {
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
function frondCard(out: CardSoup, spec: FrondSpec, rect: readonly number[], flutter: number, random: number): void {
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
function frondSolid(out: Soup, spec: FrondSpec): void {
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
function cone(out: Soup, y0: number, y1: number, radius: number, sides: number, colour: RGB, under: RGB | null, crown: Crown): void {
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

// ---------------------------------------------------------------------------
// The species
// ---------------------------------------------------------------------------

/** The trunk's colour up its length: darker at the root, where the ground's shade is. */
const barkAlong = (bark: RGB) => (t: number): RGB => scaled(bark, 0.72 + 0.35 * t);

/** A round broadleaf: a leaning bole into a crown of ten or so clusters, three or four limbs up into them. */
function broadleaf(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const trunkTop = H * rng.range(0.36, 0.44);
  const crownRy = (H - trunkTop) / 1.75;
  const crownR = Math.min(spec.reach - 0.4, (crownRy / 0.9) * rng.range(0.92, 1.08));
  const lean = rng.range(0, Math.PI * 2);
  const leanBy = H * rng.range(0, 0.045);
  const lx = Math.cos(lean) * leanBy;
  const lz = Math.sin(lean) * leanBy;
  const crown: Crown = { c: new THREE.Vector3(lx, trunkTop + crownRy * 0.75, lz), r: new THREE.Vector3(crownR, crownRy, crownR) };
  const tint = (): RGB => scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.9, 1.1));

  const clusters: Cluster[] = [];
  clusters.push({ c: crown.c.clone().add(new THREE.Vector3(rng.jitter() * 0.1 * crownR, crownRy * 0.45, rng.jitter() * 0.1 * crownR)), r: crownR * rng.range(0.46, 0.54), squat: 0.85, colour: tint() });
  const ring = rng.pick([5, 6, 6, 7]);
  const turn = rng.range(0, Math.PI * 2);
  for (let i = 0; i < ring; i++) {
    const a = turn + (i / ring) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = crownR * rng.range(0.48, 0.6);
    clusters.push({ c: new THREE.Vector3(crown.c.x + Math.cos(a) * d, crown.c.y + crownRy * rng.range(-0.1, 0.4), crown.c.z + Math.sin(a) * d), r: crownR * rng.range(0.4, 0.5), squat: 0.8, colour: tint() });
  }
  const solidCount = clusters.length;
  const low = rng.pick([3, 4]);
  for (let i = 0; i < low; i++) {
    const a = turn + 0.5 + (i / low) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = crownR * rng.range(0.3, 0.45);
    clusters.push({ c: new THREE.Vector3(crown.c.x + Math.cos(a) * d, crown.c.y - crownRy * rng.range(0.3, 0.5), crown.c.z + Math.sin(a) * d), r: crownR * rng.range(0.36, 0.44), squat: 0.75, colour: scaled(tint(), 0.9) });
  }
  keepInside(clusters, spec.reach);

  const r0 = H * rng.range(0.027, 0.035);
  const bole = path([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lx * 0.15, trunkTop * 0.35, lz * 0.15),
    new THREE.Vector3(lx * 0.55, trunkTop * 0.72, lz * 0.55),
    new THREE.Vector3(lx, trunkTop, lz),
    new THREE.Vector3(lx * 1.1, crown.c.y, lz * 1.1),
  ], 4);
  tube(form.trunk, bole, (t) => r0 * (1 - t * 0.6) * (1 + 0.8 * Math.max(0, 1 - t / 0.12) ** 2), 6, barkAlong(bark));

  const limbs = rng.pick([3, 4, 4]);
  for (let i = 0; i < limbs; i++) {
    const to = clusters[1 + ((i * 2) % (clusters.length - 1))]!;
    const from = bole[Math.min(bole.length - 1, Math.floor(rng.range(0.55, 0.85) * (bole.length - 1)))]!.clone();
    limb(form.limbs, from, to.c.clone().lerp(crown.c, 0.25), r0 * 0.4, bark, crownRy * 0.2);
  }
  for (let i = 0; i < solidCount; i++) lump(form.crown, clusters[i]!, crown, 0.92);
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.broadleaf, 48, 1.45, spec.reach);
}

/** A birch or a poplar: a pale, slender bole, small clusters stacked up it, fine leaves. */
function birch(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const lean = rng.range(0, Math.PI * 2);
  const leanBy = H * rng.range(0, 0.05);
  const lx = Math.cos(lean) * leanBy;
  const lz = Math.sin(lean) * leanBy;
  const r0 = H * rng.range(0.016, 0.021);
  const bole = path([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lx * 0.2 + rng.jitter() * 0.1, H * 0.3, lz * 0.2),
    new THREE.Vector3(lx * 0.6, H * 0.62, lz * 0.6 + rng.jitter() * 0.1),
    new THREE.Vector3(lx, H * 0.9, lz),
  ], 5);
  tube(form.trunk, bole, (t) => r0 * (1 - t * 0.7) * (1 + 0.5 * Math.max(0, 1 - t / 0.08) ** 2), 5, (t, ring) => scaled(bark, (ring % 2 === 0 ? 1 : 0.86) * (0.8 + 0.2 * t)));
  const width = Math.min(spec.reach - 0.3, H * rng.range(0.17, 0.21));
  const crown: Crown = { c: new THREE.Vector3(lx * 0.8, H * 0.66, lz * 0.8), r: new THREE.Vector3(width, H * 0.32, width) };
  const clusters: Cluster[] = [];
  const count = rng.pick([5, 6, 6, 7]);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y = H * (0.42 + 0.5 * t);
    const at = bole[Math.min(bole.length - 1, Math.round((y / H / 0.9) * (bole.length - 1)))]!;
    const a = rng.range(0, Math.PI * 2);
    const off = (1 - t) * width * rng.range(0.25, 0.5);
    clusters.push({
      c: new THREE.Vector3(at.x + Math.cos(a) * off, y, at.z + Math.sin(a) * off),
      r: width * (0.95 - 0.4 * t) * rng.range(0.9, 1.1),
      squat: 0.9,
      colour: scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.92, 1.12)),
    });
  }
  keepInside(clusters, spec.reach);
  for (let i = 0; i < 3; i++) {
    const to = clusters[i]!;
    const from = bole[Math.max(1, Math.floor((to.c.y / H / 0.9 - 0.08) * (bole.length - 1)))]!.clone();
    limb(form.limbs, from, to.c.clone(), r0 * 0.35, bark, 0.3);
  }
  for (const cluster of clusters) lump(form.crown, cluster, crown, 0.85);
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.fine, 44, 1.55, spec.reach);
}

/** A Mediterranean cypress: a dark flame of small clusters up a short bole. */
function cypress(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = scaled(linear(spec.leaf), 0.82);
  const green2 = scaled(linear(spec.leaf2), 0.82);
  const r0 = H * 0.022;
  tube(form.trunk, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H * 0.4, 0), new THREE.Vector3(0, H * 0.8, 0)], (t) => r0 * (1 - 0.6 * t), 5, barkAlong(bark));
  const widest = Math.min(spec.reach - 0.25, H * rng.range(0.1, 0.125));
  const from = H * 0.07;
  const crown: Crown = { c: new THREE.Vector3(0, H * 0.45, 0), r: new THREE.Vector3(widest, H * 0.5, widest) };
  const flame = (t: number): number => Math.sin(Math.PI * (0.12 + 0.88 * t)) ** 0.7 * (1 - 0.35 * t) + 0.08;
  const clusters: Cluster[] = [];
  const count = rng.between(7, 9);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const r = widest * flame(t) * rng.range(0.92, 1.05);
    const y = from + (H - from - r * 0.9) * t;
    clusters.push({
      c: new THREE.Vector3(rng.jitter() * 0.12 * r, Math.max(y, r * 0.9 + from * 0.5), rng.jitter() * 0.12 * r),
      r,
      squat: 1.15,
      colour: scaled(mix(green, green2, rng.range(0, 0.4)), rng.range(0.9, 1.08)),
    });
  }
  keepInside(clusters, spec.reach);
  // The far flame: a lathe through the clusters' widths, six round, its rings
  // ragged; and the near one's dark core, the same lathe at seven tenths.
  const sides = 6;
  const flameOf = (out: Soup, share: number, colourAt: (p: THREE.Vector3) => RGB): void => {
    const stations = clusters.map((cluster) => ({ y: cluster.c.y, r: cluster.r * share }));
    stations.unshift({ y: from, r: clusters[0]!.r * share * 0.5 });
    stations.push({ y: H * (share > 0.8 ? 1 : 0.94), r: 0.05 });
    const lathe = stations.map(({ y, r }, i) => {
      const below = stations[Math.max(0, i - 1)]!;
      const above = stations[Math.min(stations.length - 1, i + 1)]!;
      const slope = (below.r - above.r) / Math.max(0.1, above.y - below.y);
      const ring: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
      for (let k = 0; k < sides; k++) {
        const a = -(k / sides) * Math.PI * 2;
        const rr = r * (1 + CONE_RAGGED * (hash(i, k, share) * 2 - 1));
        ring.push({ p: new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), n: new THREE.Vector3(Math.cos(a), slope, Math.sin(a)).normalize() });
      }
      return ring;
    });
    for (let i = 0; i + 1 < lathe.length; i++) {
      for (let k = 0; k < sides; k++) {
        const a = lathe[i]![k]!;
        const b = lathe[i]![(k + 1) % sides]!;
        const c = lathe[i + 1]![k]!;
        const d = lathe[i + 1]![(k + 1) % sides]!;
        for (const v of [a, b, c, b, d, c]) push(out, v.p, v.n, colourAt(v.p));
      }
    }
  };
  const flameGreen = mix(green, green2, 0.25);
  flameOf(form.crown, 0.95, (p) => crownShade(crown, p, scaled(flameGreen, LEAF_TEXTURE_MEAN)));
  flameOf(form.limbs, 0.68, (p) => crownShade(crown, p, scaled(flameGreen, LEAF_TEXTURE_MEAN * 0.45)));
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.fine, 58, 1.6, spec.reach);
}

/**
 * A conifer: a spire, and nine to eleven tiers of drooping boughs round it,
 * fewer and shorter up it, each tier's tips falling past the next one's
 * roots so no sky shows between them but at the ragged edge; and inside the
 * boughs, a dark core of cones, so a near fir is never a pole with twigs on
 * it however the cards fall. Far off, a stack of ragged cones, one a tier.
 */
function conifer(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  // A fir's green is bluer than a meadow's, and bluer still in its shade.
  const cool = (c: RGB, k: number): RGB => [c[0] * (1 - 0.12 * k), c[1] * (1 - 0.02 * k), c[2] * (1 + 0.22 * k)];
  const green = cool(linear(spec.leaf), 1);
  const green2 = cool(linear(spec.leaf2), 1);
  const r0 = H * rng.range(0.022, 0.028);
  tube(form.trunk, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H * 0.35, 0), new THREE.Vector3(0, H * 0.7, 0), new THREE.Vector3(0, H * 0.97, 0)], (t) => r0 * (1 - 0.85 * t) * (1 + 0.6 * Math.max(0, 1 - t / 0.1) ** 2), 5, barkAlong(bark));
  const widest = Math.min(spec.reach - 0.2, H * rng.range(0.28, 0.33));
  const bottom = H * rng.range(0.12, 0.17);
  const tiers = rng.between(9, 11);
  const crown: Crown = { c: new THREE.Vector3(0, (bottom + H) / 2, 0), r: new THREE.Vector3(widest, (H - bottom) / 2, widest) };
  const rect = LEAF_ATLAS.needles;
  let previousTop = H;
  let coreTop = H * 0.9;
  for (let i = tiers - 1; i >= 0; i--) {
    // Built top down, so each cone knows where the one above starts.
    const t = i / (tiers - 1);
    const y = bottom + (H - bottom - H * 0.08) * t ** 0.92;
    const R = Math.max(0.6, widest * (1 - 0.82 * t ** 0.85)) * rng.range(0.94, 1.06);
    const droop = rng.range(0.45, 0.6);
    const lift = rng.range(0, 0.15);
    const fronds = Math.max(4, Math.round(8 - 4 * t));
    const turn = rng.range(0, Math.PI * 2);
    const shade = 0.7 + 0.34 * t;
    const tierColour = scaled(mix(green, green2, rng.range(0, 0.5)), shade * rng.range(0.93, 1.07));
    for (let k = 0; k < fronds; k++) {
      const a = turn + (k / fronds) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const dir = new THREE.Vector3(Math.cos(a), lift, Math.sin(a)).normalize();
      const length = Math.min((R * rng.range(0.92, 1.1)) / Math.hypot(1, lift), spec.reach - 0.3);
      const base = new THREE.Vector3(Math.cos(a) * r0 * 0.5, y + rng.range(-0.2, 0.2), Math.sin(a) * r0 * 0.5);
      // Dark and blue at the root, light at the tip.
      const colour = (s: number): RGB => crownShade(crown, base.clone().addScaledVector(dir, s * length), cool(scaled(tierColour, 0.62 + 0.55 * s), 1 - s));
      // The three lowest tiers, the longest boughs and the ones at eye level,
      // bend along their length; the rest are one straight piece, which is
      // half the triangles and at their size reads the same.
      const segments = i < 3 ? 2 : 1;
      frondCard(form.cards, { base, dir, length, width: length * rng.range(0.85, 1.05), droop: segments === 2 ? droop : droop * 0.6, segments, upward: 0.35, fold: 0.75, taper: 1, colour }, rect, 0.5 + 0.5 * (1 - t), rng.unit());
    }
    // Open underneath: a far fir is seen from the side and above, and its
    // skirts' undersides were half its triangles.
    // Kept off the ground by a slice of bare trunk, which is what the trunk's
    // disc is measured from (`partShape`).
    const skirt = Math.max(0.8, y - droop * R * 0.75);
    const far = cool(scaled(tierColour, LEAF_TEXTURE_MEAN * 0.9), 0.5);
    cone(form.crown, skirt, Math.min(previousTop, y + R * 1.3), Math.min(R * 0.95, spec.reach / (1 + CONE_RAGGED)), 8, far, null, crown);
    previousTop = y + R * 0.45;
    // The near core, every other tier: the far cone at seven tenths, in the
    // shade's colour, so what shows between the boughs is the dark of a fir.
    if ((tiers - 1 - i) % 2 === 0 || i === 0) {
      const core = cool(scaled(tierColour, LEAF_TEXTURE_MEAN * 0.5), 1);
      cone(form.limbs, Math.max(0.9, y - droop * R * 0.4), Math.min(coreTop, y + R * 1.2), R * 0.68, 6, core, scaled(core, 0.6), crown);
      coreTop = y + R * 0.5;
    }
  }
  // The leader: a few short boughs standing up round the top.
  for (let k = 0; k < 3; k++) {
    const a = rng.range(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize();
    const base = new THREE.Vector3(0, H * 0.84, 0);
    const colour = (s: number): RGB => scaled(green, 0.95 + 0.2 * s);
    frondCard(form.cards, { base, dir, length: H * 0.16, width: H * 0.08, droop: 0.05, segments: 1, upward: 0.3, fold: 0.3, taper: 1, colour }, rect, 0.8, rng.unit());
  }
}

/** A palm: a curving, ringed trunk and a head of drooping fronds. */
function palm(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const trunkH = H - H * rng.range(0.07, 0.1);
  const bend = H * rng.range(0.06, 0.16);
  const heading = rng.range(0, Math.PI * 2);
  const bx = Math.cos(heading);
  const bz = Math.sin(heading);
  const bole = path([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bx * bend * 0.1, trunkH * 0.35, bz * bend * 0.1),
    new THREE.Vector3(bx * bend * 0.45, trunkH * 0.7, bz * bend * 0.45),
    new THREE.Vector3(bx * bend, trunkH, bz * bend),
  ], 6);
  const r0 = H * rng.range(0.022, 0.027);
  tube(form.trunk, bole, (t) => r0 * (1 - 0.35 * t) * (1 + 0.5 * Math.max(0, 1 - t / 0.08) ** 2), 6, (t, ring) => scaled(bark, (ring % 2 === 0 ? 1 : 0.8) * (0.78 + 0.3 * t)));
  const top = bole[bole.length - 1]!.clone();
  const count = rng.pick([9, 10, 11, 12]);
  const room = spec.reach - Math.hypot(top.x, top.z) - 0.3;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const lift = i % 2 === 0 ? rng.range(0.35, 0.6) : rng.range(0.05, 0.3);
    const dir = new THREE.Vector3(Math.cos(a), lift, Math.sin(a)).normalize();
    const length = Math.min(room / Math.max(0.5, Math.hypot(dir.x, dir.z)), H * rng.range(0.3, 0.37));
    const droop = rng.range(0.28, 0.45);
    const tone = scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.9, 1.1));
    const colour = (s: number): RGB => scaled(tone, (0.7 + 0.35 * s) * 1.15);
    const frond = { base: top.clone().add(new THREE.Vector3(0, 0.1, 0)), dir, length, width: length * rng.range(0.42, 0.5), droop, segments: 4, upward: 0.55, fold: 0.6, taper: 1, colour };
    frondCard(form.cards, frond, LEAF_ATLAS.frond, 1, rng.unit());
    if (i % 5 !== 4) frondSolid(form.crown, { ...frond, segments: 2, width: frond.width * 0.5, taper: 0.35, colour: (s) => scaled(colour(s), LEAF_TEXTURE_MEAN * 1.1) });
  }
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize();
    frondCard(form.cards, { base: top.clone(), dir, length: H * 0.13, width: H * 0.06, droop: 0.1, segments: 2, upward: 0.3, fold: 0.3, taper: 1, colour: () => scaled(green, 0.85) }, LEAF_ATLAS.frond, 0.6, rng.unit());
  }
}

/** An umbrella acacia: a bole that forks into two or three limbs under a flat crown. */
function acacia(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const bark = linear(spec.bark);
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const fork = H * rng.range(0.35, 0.48);
  const r0 = H * rng.range(0.028, 0.034);
  const crownR = Math.min(spec.reach - 0.3, H * rng.range(0.44, 0.52));
  const crownY = H * 0.86;
  const crownRy = H * 0.1;
  const crown: Crown = { c: new THREE.Vector3(0, crownY, 0), r: new THREE.Vector3(crownR, crownRy * 1.6, crownR) };
  const forkAt = new THREE.Vector3(rng.jitter() * 0.3, fork, rng.jitter() * 0.3);
  tube(form.trunk, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(forkAt.x * 0.4, fork * 0.5, forkAt.z * 0.4), forkAt], (t) => r0 * (1 - 0.25 * t) * (1 + 0.6 * Math.max(0, 1 - t / 0.12) ** 2), 5, barkAlong(bark));
  const limbs = rng.pick([2, 3, 3]);
  const turn = rng.range(0, Math.PI * 2);
  const clusters: Cluster[] = [];
  for (let i = 0; i < limbs; i++) {
    const a = turn + (i / limbs) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const to = new THREE.Vector3(Math.cos(a) * crownR * 0.45, crownY - crownRy * 0.6, Math.sin(a) * crownR * 0.45);
    // The forks are what a far eye sees of an acacia's wood: on the trunk.
    tube(form.trunk, [forkAt, forkAt.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.2, 0)), to], (t) => r0 * 0.7 * (1 - 0.5 * t), 4, (t) => scaled(bark, 0.9 + 0.2 * t));
  }
  const tint = (): RGB => scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.9, 1.1));
  clusters.push({ c: new THREE.Vector3(0, crownY + crownRy * 0.3, 0), r: crownR * 0.5, squat: 0.36, colour: tint() });
  const ring = rng.between(5, 6);
  for (let i = 0; i < ring; i++) {
    const a = turn + 0.4 + (i / ring) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const d = crownR * rng.range(0.5, 0.62);
    clusters.push({ c: new THREE.Vector3(Math.cos(a) * d, crownY + crownRy * rng.range(-0.3, 0.2), Math.sin(a) * d), r: crownR * rng.range(0.36, 0.44), squat: 0.4, colour: tint() });
  }
  keepInside(clusters, spec.reach);
  for (let i = 0; i < limbs; i++) {
    const to = clusters[1 + i]!;
    limb(form.limbs, new THREE.Vector3(Math.cos(turn + i * 2.1) * crownR * 0.4, crownY - crownRy * 0.6, Math.sin(turn + i * 2.1) * crownR * 0.4), to.c.clone(), r0 * 0.3, bark, 0.1);
  }
  for (const cluster of clusters) lump(form.crown, cluster, crown, 0.9);
  // A dark, flat core under the leaves, so the umbrella is not lace from below.
  lump(form.limbs, { c: new THREE.Vector3(0, crownY, 0), r: crownR * 0.62, squat: 0.28, colour: scaled(clusters[0]!.colour, 0.5) }, crown, 1);
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.fine, 48, 1.3, spec.reach, 0.9);
}

/** A bush: two to four clusters on the ground and no wood to speak of. */
function bush(rng: Rng, spec: FormSpec, form: TreeForm): void {
  const H = spec.height;
  const green = linear(spec.leaf);
  const green2 = linear(spec.leaf2);
  const width = Math.min(spec.reach, H * rng.range(0.9, 1.3));
  const crown: Crown = { c: new THREE.Vector3(0, H * 0.45, 0), r: new THREE.Vector3(width, H * 0.55, width) };
  const clusters: Cluster[] = [];
  const count = rng.between(2, 4);
  const turn = rng.range(0, Math.PI * 2);
  for (let i = 0; i < count; i++) {
    const main = i === 0;
    const r = main ? Math.min(H * 0.62, width * 0.7) : Math.min(H * 0.5, width * 0.5) * rng.range(0.8, 1.05);
    const a = turn + (i / count) * Math.PI * 2;
    const d = main ? 0 : width - r;
    clusters.push({ c: new THREE.Vector3(Math.cos(a) * d, r * 0.72, Math.sin(a) * d), r, squat: 0.82, colour: scaled(mix(green, green2, rng.range(0, 0.5)), rng.range(0.9, 1.1)) });
  }
  keepInside(clusters, spec.reach - 0.05);
  for (const cluster of clusters) lump(form.crown, cluster, crown, 0.92);
  clusterCards(form.cards, rng.fork('cards'), clusters, crown, LEAF_ATLAS.broadleaf, 14, 1.6, spec.reach);
}

const SPECIES: Record<Species, (rng: Rng, spec: FormSpec, form: TreeForm) => void> = {
  broadleaf,
  birch,
  conifer,
  cypress,
  palm,
  acacia,
  bush,
};

/**
 * One tree of `species` from `rng`, at `spec`'s size and in its colours.
 * Deterministic in the two and nothing else; the cards draw from forks, so a
 * change to how the leaves hang moves no trunk.
 */
export function treeForm(species: Species, rng: Rng, spec: FormSpec): TreeForm {
  const form: TreeForm = { species, height: 0, trunk: soup(), limbs: soup(), crown: soup(), cards: cardSoup() };
  SPECIES[species](rng, spec, form);
  // Stood on y = 0, whatever the lowest lump came to: a bush has no trunk to stand on.
  let low = Infinity;
  let high = 0;
  for (const part of [form.trunk, form.crown]) {
    for (let i = 1; i < part.position.length; i += 3) {
      low = Math.min(low, part.position[i]!);
      high = Math.max(high, part.position[i]!);
    }
  }
  if (Number.isFinite(low) && Math.abs(low) > 1e-6) {
    for (const part of [form.trunk, form.limbs, form.crown, form.cards]) {
      for (let i = 1; i < part.position.length; i += 3) part.position[i]! -= low;
    }
    high -= low;
  }
  form.height = high;
  return form;
}

/** A near tile's share of a tree: its wood as flat arrays, and its cards. */
export interface NearArrays {
  wood: { position: Float32Array; normal: Float32Array; color: Float32Array };
  leaves: LeafArrays;
}

/** Leaf cards as flat arrays: three a vertex but for `uv` and `leaf`, two. */
export interface LeafArrays {
  /** Whose cards they are, for what sheds them (`crownOf`). */
  species: Species;
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  uv: Float32Array;
  leaf: Float32Array;
}

/** A form as a near tile merges it: the trunk and limbs, and the cards. */
export function nearArrays(form: TreeForm): NearArrays {
  return {
    wood: {
      position: Float32Array.from([...form.trunk.position, ...form.limbs.position]),
      normal: Float32Array.from([...form.trunk.normal, ...form.limbs.normal]),
      color: Float32Array.from([...form.trunk.color, ...form.limbs.color]),
    },
    leaves: {
      species: form.species,
      position: Float32Array.from(form.cards.position),
      normal: Float32Array.from(form.cards.normal),
      color: Float32Array.from(form.cards.color),
      uv: Float32Array.from(form.cards.uv),
      leaf: Float32Array.from(form.cards.leaf),
    },
  };
}

/**
 * How much of its leaf a species lets go, 0 to 1: what a crown sheds all year
 * and more in its autumn (`ambient.ts`), and what lies under it. A birch and a
 * broadleaf drop theirs; a bush keeps most, being low and close; an acacia
 * sheds a few small leaves; a conifer and a cypress keep their needles and
 * scales and a palm its fronds, which do not come down as leaves.
 */
export const SHED: Readonly<Record<Species, number>> = {
  broadleaf: 1,
  birch: 0.9,
  bush: 0.35,
  acacia: 0.3,
  conifer: 0,
  cypress: 0,
  palm: 0,
};

/**
 * A crown as the small life sees it (`ambient.ts`): where its leaves hang and
 * what colour they are, in the part's own frame (y up, standing on y = 0,
 * the axis through the origin).
 */
export interface CrownShape {
  species: Species;
  shed: number;
  /** The middle of the cards' box. */
  x: number;
  y: number;
  z: number;
  /** Half the box across, the larger of its two sides, and half its height. */
  radius: number;
  half: number;
  /** The cards' mean vertex colour, linear: the region's green as the crown carries it. */
  r: number;
  g: number;
  b: number;
}

const crowns = new WeakMap<LeafArrays, CrownShape | null>();

/**
 * A tree's crown from its cards: the box they fill and their mean colour,
 * worked out once per variant and kept against the arrays themselves. Null
 * for a species that sheds nothing, or a tree with no cards.
 */
export function crownOf(leaves: LeafArrays): CrownShape | null {
  const known = crowns.get(leaves);
  if (known !== undefined) return known;
  const shed = SHED[leaves.species];
  const count = leaves.position.length / 3;
  let value: CrownShape | null = null;
  if (shed > 0 && count > 0) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity;
    let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < count; i++) {
      const x = leaves.position[i * 3]!;
      const y = leaves.position[i * 3 + 1]!;
      const z = leaves.position[i * 3 + 2]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
      r += leaves.color[i * 3]!;
      g += leaves.color[i * 3 + 1]!;
      b += leaves.color[i * 3 + 2]!;
    }
    // The cards are painted a grey under their colour (`LEAF_TEXTURE_MEAN`):
    // a leaf off the crown is the colour the crown is seen at.
    const k = LEAF_TEXTURE_MEAN / count;
    value = {
      species: leaves.species,
      shed,
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      z: (z0 + z1) / 2,
      radius: Math.max(x1 - x0, z1 - z0) / 2,
      half: (y1 - y0) / 2,
      r: r * k,
      g: g * k,
      b: b * k,
    };
  }
  crowns.set(leaves, value);
  return value;
}

/** Floats a placed crown takes in a list of them (`placeCrown`). */
export const CROWN_STRIDE = 9;

const crownPoint = new THREE.Vector3();

/**
 * A crown placed by a part's matrix into a flat list, `CROWN_STRIDE` floats:
 * its middle in the matrix's space, its radius and half height scaled by it,
 * its colour, and how much it sheds. The matrix is the plant's, uniform in
 * scale (`vegetation.ts`, `settlements.ts`); a crown that sheds nothing adds
 * nothing.
 */
export function placeCrown(leaves: LeafArrays, matrix: THREE.Matrix4, out: number[]): void {
  const crown = crownOf(leaves);
  if (crown === null) return;
  const e = matrix.elements;
  const scale = Math.hypot(e[0]!, e[1]!, e[2]!);
  crownPoint.set(crown.x, crown.y, crown.z).applyMatrix4(matrix);
  out.push(crownPoint.x, crownPoint.y, crownPoint.z, crown.radius * scale, crown.half * scale, crown.r, crown.g, crown.b, crown.shed);
}

/** A soup as geometry: position, normal and colour, non-indexed. */
export function soupGeometry(...parts: readonly Soup[]): THREE.BufferGeometry {
  const position: number[] = [];
  const normal: number[] = [];
  const color: number[] = [];
  for (const part of parts) {
    position.push(...part.position);
    normal.push(...part.normal);
    color.push(...part.color);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return geometry;
}

/**
 * The scenic part's build: the trunk and the solid crown as one painted mesh,
 * which is what a town merges and a far tile draws.
 */
export function solidTree(ctx: SceneryContext, form: TreeForm): THREE.Group {
  const group = new THREE.Group();
  const mesh = ctx.coloured(soupGeometry(form.trunk, form.crown));
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}
