// Triangulating a ring: interior points, Delaunay flips and the relief-driven
// refinement. All of it works on indices into `unit` / `lonLat` / `relief`,
// which grow as points are added.

import * as THREE from 'three';
import { detailWeightAt, flattenWeightAt, reliefAt } from '../terrain.ts';
import { PLANET_RADIUS, onSphere } from './planet.ts';
import { DEG, MAX_EDGE, PAD_MIN_EDGE, floorFor, inlandAlong, sagFor } from './tessellation.ts';

/** Packs an ordered pair of vertex indices into one number. */
const EDGE_KEY = 8388608;

/** Spacing of the interior lattice, degrees of latitude: a little under `MAX_EDGE`. */
const STEINER_SPACING = (MAX_EDGE / DEG) * 0.85;

/** Below this `quality` a triangle is a needle, and the pass after the refinement flips it. */
const NEEDLE = 0.3;

/** A needle shorter than this, in world units, is left alone by the grading. */
const NEEDLE_MIN_EDGE = 45;

/** Rounds of circumcentres the grading puts in; each halves what is left. */
const GRADE_ROUNDS = 4;

/**
 * Points laid on a staggered lattice inside a ring and its holes, a third of a
 * spacing clear of every boundary, for `retriangulate` to put into the mesh.
 *
 * An ear clipper given only a boundary joins boundary to boundary, which leaves
 * fans of needles that flat shading turns into long ink lines. Interior points
 * give the triangulation something else to connect. Found by scanlines: each row
 * and the two beside it are cut by every boundary edge once.
 */
export function steinerPoints(rings: readonly (readonly number[][])[]): number[] {
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p[1]! < minLat) minLat = p[1]!;
      if (p[1]! > maxLat) maxLat = p[1]!;
    }
  }
  const out: number[] = [];
  const step = STEINER_SPACING;
  const margin = step * 0.34;
  if (maxLat - minLat < step) return out;
  const crossings = (lat: number, into: number[]): void => {
    into.length = 0;
    for (const ring of rings) {
      for (let i = 0, n = ring.length; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const ay = a[1]!;
        const by = b[1]!;
        if ((ay > lat) === (by > lat)) continue;
        into.push(a[0]! + ((lat - ay) / (by - ay)) * (b[0]! - a[0]!));
      }
    }
    into.sort((x, y) => x - y);
  };
  const inside = (xs: readonly number[], lon: number, clear: number): boolean => {
    let count = 0;
    for (const x of xs) {
      if (Math.abs(x - lon) < clear) return false;
      if (x < lon) count++;
    }
    return (count & 1) === 1;
  };
  const row: number[] = [];
  const below: number[] = [];
  const above: number[] = [];
  for (let lat = Math.ceil(minLat / step) * step; lat < maxLat; lat += step) {
    if (Math.abs(lat) > 88) continue;
    crossings(lat, row);
    if (row.length < 2) continue;
    crossings(lat - margin, below);
    crossings(lat + margin, above);
    const stride = step / Math.max(0.2, Math.cos(lat * DEG));
    const clear = margin / Math.max(0.2, Math.cos(lat * DEG));
    // Staggered half a step every other row, so the lattice is triangles.
    const shift = (Math.round(lat / step) & 1) * stride * 0.5;
    for (let lon = Math.ceil((row[0]! - shift) / stride) * stride + shift; lon < row[row.length - 1]!; lon += stride) {
      if (inside(row, lon, clear) && inside(below, lon, clear) && inside(above, lon, clear)) out.push(lon, lat);
    }
  }
  return out;
}

const orientOf = (lonLat: number[], a: number, b: number, c: number): number =>
  (lonLat[b * 2]! - lonLat[a * 2]!) * (lonLat[c * 2 + 1]! - lonLat[a * 2 + 1]!)
  - (lonLat[b * 2 + 1]! - lonLat[a * 2 + 1]!) * (lonLat[c * 2]! - lonLat[a * 2]!);

/** Twin half-edge of every half-edge (three per triangle), or -1 on the boundary. */
function twinsOf(V: number[]): number[] {
  const T: number[] = new Array<number>(V.length).fill(-1);
  const KEY = 16777216;
  const half = new Map<number, number>();
  for (let h = 0; h < V.length; h++) {
    const from = V[h]!;
    const to = V[h - (h % 3) + ((h % 3) + 1) % 3]!;
    const twin = half.get(to * KEY + from);
    if (twin !== undefined) {
      T[h] = twin;
      T[twin] = h;
    } else half.set(from * KEY + to, h);
  }
  return T;
}

/**
 * Walks from triangle `from` to the one holding vertex `m` (already in
 * `lonLat`). Returns its first half-edge, or -1 when `m` is outside the ring,
 * lies on an edge, or is too near a boundary edge: the boundary is shared with
 * the next ring and cannot be split.
 */
function locate(V: number[], T: number[], lonLat: number[], sense: number, from: number, m: number): number {
  let t = from;
  let found = -1;
  for (let steps = 0; steps < 4096; steps++) {
    let moved = false;
    let flat = false;
    for (let i = 0; i < 3; i++) {
      const side = orientOf(lonLat, V[t + i]!, V[t + (i + 1) % 3]!, m) * sense;
      if (side < 0) {
        const twin = T[t + i]!;
        if (twin < 0) { steps = 4096; break; }
        t = twin - (twin % 3);
        moved = true;
        break;
      }
      if (side < 1e-12) flat = true;
      else if (T[t + i]! < 0) {
        // Its distance from a boundary edge, against that edge's length.
        const i0 = V[t + i]! * 2;
        const i1 = V[t + (i + 1) % 3]! * 2;
        const length2 = (lonLat[i1]! - lonLat[i0]!) ** 2 + (lonLat[i1 + 1]! - lonLat[i0 + 1]!) ** 2;
        if (side * side < length2 * length2 * 0.0625) flat = true;
      }
    }
    if (steps >= 4096) break;
    if (!moved) {
      if (!flat) found = t;
      break;
    }
  }
  return found;
}

/**
 * The circumcentre of a triangle in the lon/lat plane, longitude shrunk by the
 * cosine of the triangle's own latitude so the circle is a circle. Null when
 * the triangle is degenerate.
 */
function circumcentre(lonLat: number[], a: number, b: number, c: number): [number, number] | null {
  const k = Math.cos(((lonLat[a * 2 + 1]! + lonLat[b * 2 + 1]! + lonLat[c * 2 + 1]!) / 3) * DEG);
  const ax = lonLat[a * 2]! * k;
  const ay = lonLat[a * 2 + 1]!;
  const bx = lonLat[b * 2]! * k - ax;
  const by = lonLat[b * 2 + 1]! - ay;
  const cx = lonLat[c * 2]! * k - ax;
  const cy = lonLat[c * 2 + 1]! - ay;
  const dd = 2 * (bx * cy - by * cx);
  if (Math.abs(dd) < 1e-14) return null;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (cy * b2 - by * c2) / dd;
  const uy = (bx * c2 - cx * b2) / dd;
  return [(ax + ux) / k, ay + uy];
}

/**
 * The ear clipper's triangles made Delaunay, with `steiner`'s points put in.
 *
 * Lawson's flips on the boundary the ear clipper was given: an edge flips when
 * the vertex across it lies inside the circle through the other three (tested
 * on the sphere, where that circle is the plane through them), `accept` allows
 * the new edge, and both new triangles keep their orientation in the lon/lat
 * plane the outline was cut in. A boundary edge has no twin, so the outline,
 * every coast and every lake shore come out exactly as they went in.
 *
 * A point is put in by walking to the triangle holding it, splitting that in
 * three and flipping outwards: incremental constrained Delaunay. With `grade`,
 * circumcentres of needles are added afterwards to grade the mesh from the
 * coast's spacing to the lattice's. `unit` and `lonLat` grow by the points added.
 */
export function retriangulate(
  unit: THREE.Vector3[],
  lonLat: number[],
  faces: number[][],
  steiner: readonly number[],
  accept?: (a: number, b: number) => boolean,
  grade = false,
): number[][] {
  const V: number[] = [];
  for (const [a, b, c] of faces as [number, number, number][]) V.push(a, b, c);
  const T = twinsOf(V);

  const next = (h: number): number => h - (h % 3) + ((h % 3) + 1) % 3;
  const prev = (h: number): number => h - (h % 3) + ((h % 3) + 2) % 3;
  const orient = (a: number, b: number, c: number): number => orientOf(lonLat, a, b, c);
  // Which way round the ear clipper wound them; every triangle agrees.
  let sense = 0;
  for (let t = 0; t < V.length && sense === 0; t += 3) sense = Math.sign(orient(V[t]!, V[t + 1]!, V[t + 2]!));
  if (sense === 0) return faces;
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();
  /** Whether `s` lies inside the circle through `p`, `q`, `r` on the sphere. */
  const inCircle = (p: number, q: number, r: number, s: number): boolean => {
    const P = unit[p]!;
    e1.subVectors(unit[q]!, P);
    e2.subVectors(unit[r]!, P);
    n.crossVectors(e1, e2);
    if (n.dot(P) < 0) n.negate();
    d.subVectors(unit[s]!, P);
    return n.dot(d) > 1e-18;
  };
  const f1 = new THREE.Vector3();
  const f2 = new THREE.Vector3();
  /** 1 for an equilateral triangle, towards 0 for a needle: twice the area over the squared edges, scaled. */
  const quality = (a: number, b: number, c: number): number => {
    const A = unit[a]!;
    const B = unit[b]!;
    const C = unit[c]!;
    f1.subVectors(B, A);
    f2.subVectors(C, A);
    const sum = f1.lengthSq() + f2.lengthSq() + B.distanceToSquared(C);
    return sum > 0 ? (2 * Math.sqrt(3) * f1.cross(f2).length()) / sum : 0;
  };
  const stack: number[] = [];
  const legalize = (): void => {
    let budget = V.length * 20 + 1000;
    while (stack.length > 0 && budget-- > 0) {
      const h = stack.pop()!;
      const g = T[h]!;
      if (g < 0) continue;
      const h1 = next(h);
      const h2 = prev(h);
      const g1 = next(g);
      const g2 = prev(g);
      const p = V[h]!;
      const q = V[h1]!;
      const r = V[h2]!;
      const s = V[g2]!;
      if (!inCircle(p, q, r, s)) continue;
      // The two triangles the flip would make, both still the right way round.
      if (Math.sign(orient(p, s, r)) !== sense || Math.sign(orient(s, q, r)) !== sense) continue;
      // After the refinement only a needle is worth a flip: the relief was
      // fitted to these triangles.
      if (accept !== undefined) {
        const before = Math.min(quality(p, q, r), quality(q, p, s));
        if (before > NEEDLE || Math.min(quality(p, s, r), quality(s, q, r)) < before * 1.25) continue;
        if (!accept(r, s)) continue;
      }
      const t = h - (h % 3);
      const u = g - (g % 3);
      const tg1 = T[g1]!;
      const th2 = T[h2]!;
      const tg2 = T[g2]!;
      const th1 = T[h1]!;
      V[t] = p; V[t + 1] = s; V[t + 2] = r;
      V[u] = s; V[u + 1] = q; V[u + 2] = r;
      T[t] = tg1; if (tg1 >= 0) T[tg1] = t;
      T[t + 1] = u + 2; T[u + 2] = t + 1;
      T[t + 2] = th2; if (th2 >= 0) T[th2] = t + 2;
      T[u] = tg2; if (tg2 >= 0) T[tg2] = u;
      T[u + 1] = th1; if (th1 >= 0) T[th1] = u + 1;
      stack.push(t, t + 2, u, u + 1);
    }
    stack.length = 0;
  };

  for (let h = 0; h < V.length; h++) if (T[h]! > h) stack.push(h);
  legalize();

  const point = new THREE.Vector3();
  /**
   * Puts the point at `lon, lat` into the mesh, walking to it from triangle
   * `from`; false when `locate` refuses it.
   */
  const insert = (lon: number, lat: number, from: number): boolean => {
    const m = unit.length;
    lonLat.push(lon, lat);
    const found = locate(V, T, lonLat, sense, from, m);
    if (found < 0) {
      lonLat.length -= 2;
      return false;
    }
    unit.push(onSphere(lon, lat, point).clone());
    const a = V[found]!;
    const b = V[found + 1]!;
    const c = V[found + 2]!;
    const tab = T[found]!;
    const tbc = T[found + 1]!;
    const tca = T[found + 2]!;
    const t1 = V.length;
    const t2 = t1 + 3;
    V.push(b, c, m, c, a, m);
    T.push(-1, -1, -1, -1, -1, -1);
    // (a, b, m) keeps its slot and its twin across a-b.
    V[found + 2] = m;
    T[found + 1] = t1 + 2; T[t1 + 2] = found + 1;
    T[t1] = tbc; if (tbc >= 0) T[tbc] = t1;
    T[t1 + 1] = t2 + 2; T[t2 + 2] = t1 + 1;
    T[t2] = tca; if (tca >= 0) T[tca] = t2;
    T[t2 + 1] = found + 2; T[found + 2] = t2 + 1;
    T[found] = tab; if (tab >= 0) T[tab] = found;
    stack.push(found, t1, t2);
    legalize();
    at = found;
    return true;
  };

  let at = 0;
  for (let k = 0; k + 1 < steiner.length; k += 2) insert(steiner[k]!, steiner[k + 1]!, at);

  // Graded by circumcentres: the lattice keeps a third of its spacing off the
  // boundary and a coast is a vertex every few units, so what fills the gap is
  // a fan of needles. A needle's circumcentre lies half way down its length, so
  // putting it in halves the fan. The boundary itself is never touched.
  if (grade) {
    const minEdge = NEEDLE_MIN_EDGE / PLANET_RADIUS;
    for (let round = 0; round < GRADE_ROUNDS; round++) {
      let added = 0;
      const count = V.length;
      for (let t = 0; t < count; t += 3) {
        const a = V[t]!;
        const b = V[t + 1]!;
        const c = V[t + 2]!;
        if (quality(a, b, c) > NEEDLE) continue;
        const A = unit[a]!;
        const longest = Math.max(A.distanceTo(unit[b]!), A.distanceTo(unit[c]!), unit[b]!.distanceTo(unit[c]!));
        if (longest < minEdge) continue;
        const centre = circumcentre(lonLat, a, b, c);
        if (centre !== null && insert(centre[0], centre[1], t)) added++;
      }
      if (added === 0) break;
    }
  }

  const out: number[][] = [];
  for (let t = 0; t < V.length; t += 3) out.push([V[t]!, V[t + 1]!, V[t + 2]!]);
  return out;
}

/**
 * Subdivides the triangulated interior until every edge is both short enough
 * and close enough to the relief.
 *
 * Whether an edge splits depends only on the edge, and both triangles sharing
 * it get the same cached answer, so the mesh stays watertight: a per-triangle
 * decision would leave T-junctions, each a crack the height of a hill.
 * `relief` grows alongside `vertices`, so no point is evaluated twice.
 */
export function refine(vertices: THREE.Vector3[], lonLat: number[], relief: number[], faces: number[][]): number[][] {
  const midpoint = new THREE.Vector3();

  // Verdicts are kept for the whole refinement: they depend only on an edge's
  // two ends, which never move. Keyed by number, not string, because it ends
  // up holding every edge of the finished mesh.
  const edges = new Map<number, number>();

  /** Midpoint vertex of an edge, or -1 when the edge is good enough as it is. */
  const midOf = (i: number, j: number): number => {
    const lo = i < j ? i : j;
    const hi = i < j ? j : i;
    const key = lo * EDGE_KEY + hi;
    const known = edges.get(key);
    if (known !== undefined) return known;

    const a = vertices[lo]!;
    const b = vertices[hi]!;
    const angle = a.angleTo(b);
    const tooLong = angle > MAX_EDGE;
    if (!tooLong && angle <= PAD_MIN_EDGE) {
      edges.set(key, -1);
      return -1;
    }
    // Halfway in longitude and latitude, not along the great circle: an edge is
    // a straight line in the lon/lat plane the outline was cut in and
    // `countryAt` tests against, and the great-circle midpoint of a long edge
    // bows poleward off it, carrying land out over the water it was cut around.
    const lonMid = (lonLat[lo * 2]! + lonLat[hi * 2]!) * 0.5;
    const latMid = (lonLat[lo * 2 + 1]! + lonLat[hi * 2 + 1]!) * 0.5;
    onSphere(lonMid, latMid, midpoint);
    // A monument's pad and a settlement's paving want the same thing from the
    // mesh, so they share one budget and the stronger claim wins.
    const pad = Math.max(
      flattenWeightAt(midpoint.x, midpoint.y, midpoint.z),
      detailWeightAt(midpoint.x, midpoint.y, midpoint.z),
    );
    if (!tooLong && angle <= floorFor(pad)) {
      edges.set(key, -1);
      return -1;
    }
    const height = reliefAt(midpoint.x, midpoint.y, midpoint.z);
    if (!tooLong && Math.abs(height - (relief[lo]! + relief[hi]!) * 0.5) <= sagFor(pad, inlandAlong(vertices[lo]!, vertices[hi]!, midpoint))) {
      edges.set(key, -1);
      return -1;
    }
    const m = vertices.length;
    vertices.push(midpoint.clone());
    lonLat.push(lonMid, latMid);
    relief.push(height);
    edges.set(key, m);
    return m;
  };

  // Triangles that no longer have a splittable edge are set aside and never
  // looked at again. Most of them settle in the first pass or two, and they are
  // the ones the coastline is made of.
  const settled: number[][] = [];
  let triangles = faces;
  for (let pass = 0; pass < 12; pass++) {
    const next: number[][] = [];
    for (const [a, b, c] of triangles as [number, number, number][]) {
      const ab = midOf(a, b);
      const bc = midOf(b, c);
      const ca = midOf(c, a);
      const split = (ab >= 0 ? 1 : 0) + (bc >= 0 ? 1 : 0) + (ca >= 0 ? 1 : 0);
      if (split === 0) settled.push([a, b, c]);
      else if (split === 3) next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      else if (split === 1) {
        if (ab >= 0) next.push([a, ab, c], [ab, b, c]);
        else if (bc >= 0) next.push([a, b, bc], [a, bc, c]);
        else next.push([a, b, ca], [ca, b, c]);
      } else if (ab >= 0 && bc >= 0) next.push([a, ab, bc], [ab, b, bc], [a, bc, c]);
      else if (bc >= 0 && ca >= 0) next.push([b, bc, ca], [bc, c, ca], [b, ca, a]);
      else next.push([c, ca, ab], [ca, a, ab], [c, ab, b]);
    }
    if (next.length === 0) return settled;
    triangles = next;
  }
  return settled.concat(triangles);
}
