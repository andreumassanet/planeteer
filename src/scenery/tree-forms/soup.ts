import * as THREE from 'three';

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
export const LEAF_GAIN = 1.3;

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

export type RGB = readonly [number, number, number];

export const soup = (): Soup => ({ position: [], normal: [], color: [] });
export const cardSoup = (): CardSoup => ({ position: [], normal: [], color: [], uv: [], leaf: [] });

export function linear(hex: number): RGB {
  const colour = new THREE.Color(hex);
  return [colour.r, colour.g, colour.b];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scaled(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function push(out: Soup, p: THREE.Vector3, n: THREE.Vector3, c: RGB): void {
  out.position.push(p.x, p.y, p.z);
  out.normal.push(n.x, n.y, n.z);
  out.color.push(c[0], c[1], c[2]);
}

export const UP = new THREE.Vector3(0, 1, 0);

// The wood

/**
 * A tube along a path: rings of `sides` round each point, carried along by
 * parallel transport so a bent limb does not twist, smooth normals out of the
 * axis. `(f, T x f, T)` is a right-handed frame, so a ring's quads wind
 * outward. No caps: a trunk ends in its crown, a limb in its leaves.
 */
export function tube(out: Soup, points: readonly THREE.Vector3[], radius: (t: number) => number, sides: number, colour: (t: number, ring: number) => RGB): void {
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
export function path(points: readonly THREE.Vector3[], segments: number): THREE.Vector3[] {
  return new THREE.CatmullRomCurve3([...points], false, 'centripetal').getPoints(segments);
}

/** A limb from `from` to `to`, arching up through its middle. */
export function limb(out: Soup, from: THREE.Vector3, to: THREE.Vector3, radius: number, bark: RGB, rise: number): void {
  const middle = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, rise, 0));
  tube(out, [from, middle, to], (t) => radius * (1 - t * 0.6), 4, (t) => scaled(bark, 0.85 + 0.2 * t));
}
