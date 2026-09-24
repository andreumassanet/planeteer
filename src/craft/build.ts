/**
 * What every craft is built with and what it is handed over as.
 *
 * **A craft is drawn as one buffer, plus one buffer a turning part.** The pieces
 * are built the way every code-built thing in this world is — through the
 * monument context's `box`, `strut`, `taper`, one toon material a colour, faceted
 * — and then reduced by `mergeMeshes` (`src/merge.ts`) to flat arrays with the
 * colour on the vertices and the ink's normal beside the fill's, exactly as a
 * town, a wood tile and a mover are. So a plane of forty pieces is one draw
 * call and one hull, its propeller a second, and a car its body and four
 * wheels. The material is the movers' own recipe: vertex colours on the
 * world's four-band ramp, the world's pen, the hull riding `outlineNormal`.
 *
 * **Two colours meeting in one merged mesh are only a problem when they share a
 * plane.** A merged buffer has no draw order, so a face painted over a face is
 * a z-fight that shows only when the camera moves; every piece laid on another
 * here stands proud of it by `PROUD` or more, as the scenery contract asks.
 */
import * as THREE from 'three';
import { createContext } from '../monuments/contract.ts';
import type { MonumentContext } from '../monuments/contract.ts';
import { mergeMeshes } from '../merge.ts';
import type { Merged } from '../merge.ts';
import type { CraftModel } from './contract.ts';

/** The least a piece laid on another stands off it: the scenery contract's `PROUD`. */
export const PROUD = 0.08;

let context: MonumentContext | null = null;
/**
 * One monument context for every craft, made on first use. `createContext`
 * registers its ramp with `theme.ts` so the moods repaint it, so it is made
 * once and not once per build.
 */
export function craftContext(): MonumentContext {
  context ??= createContext();
  return context;
}

let material: THREE.MeshToonMaterial | null = null;
/**
 * The one material every craft is drawn with: its colours are its vertices',
 * on the context's own ramp, inked along `outlineNormal`. Marked painted, so a
 * caller that merges a craft again (`mergeMeshes`) reads the vertex colours
 * rather than a stamp.
 */
export function craftMaterial(): THREE.MeshToonMaterial {
  if (material !== null) return material;
  const source = craftContext().toon(craftContext().palette.ink);
  material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: source.gradientMap });
  material.userData.outlineParameters = { ...source.userData.outlineParameters, outlineNormal: true };
  material.userData.atlasPainted = true;
  material.name = 'craft';
  return material;
}

// ---------------------------------------------------------------------------
// Triangle soups
// ---------------------------------------------------------------------------

/** Flat, non-indexed arrays in the craft's own frame: what `mergeMeshes` returns. */
export type Soup = Pick<Merged, 'position' | 'normal' | 'color' | 'outline'>;

/** A group of context pieces reduced to one soup. Consumes nothing; the pieces can be dropped. */
export function soupOf(group: THREE.Object3D): Soup {
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (object.matrixWorld.determinant() <= 0) {
      throw new Error(`craft: a piece has a reflected or collapsed transform (det ${object.matrixWorld.determinant()})`);
    }
  });
  return mergeMeshes(group);
}

/** A turning part: its soup, built about its own axle at the origin, and where that axle is. */
export interface Turning {
  name: 'prop' | 'rotor' | 'wheel';
  at: THREE.Vector3;
  soup: Soup;
}

const faceA = new THREE.Vector3();
const faceB = new THREE.Vector3();
const faceC = new THREE.Vector3();

/**
 * Soups concatenated into one geometry. A triangle with no area is dropped
 * here rather than trusted: `computeVertexNormals` gives one a NaN normal,
 * and a NaN normal black-holes the whole mesh it is in.
 */
function geometryOf(soups: readonly Soup[]): THREE.BufferGeometry {
  let count = 0;
  for (const soup of soups) count += soup.position.length;
  const position = new Float32Array(count);
  const normal = new Float32Array(count);
  const color = new Float32Array(count);
  const outline = new Float32Array(count);
  let cursor = 0;
  for (const soup of soups) {
    for (let i = 0; i < soup.position.length; i += 9) {
      faceA.fromArray(soup.position, i);
      faceB.fromArray(soup.position, i + 3).sub(faceA);
      faceC.fromArray(soup.position, i + 6).sub(faceA);
      if (faceB.cross(faceC).lengthSq() < 1e-12) continue;
      let finite = true;
      for (let k = 0; k < 9; k++) if (!Number.isFinite(soup.normal[i + k]!) || !Number.isFinite(soup.outline[i + k]!)) finite = false;
      if (!finite) continue;
      position.set(soup.position.subarray(i, i + 9), cursor);
      normal.set(soup.normal.subarray(i, i + 9), cursor);
      color.set(soup.color.subarray(i, i + 9), cursor);
      outline.set(soup.outline.subarray(i, i + 9), cursor);
      cursor += 9;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position.slice(0, cursor), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal.slice(0, cursor), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color.slice(0, cursor), 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline.slice(0, cursor), 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function meshOf(soups: readonly Soup[], name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometryOf(soups), craftMaterial());
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The finished craft: the still soups as one mesh named `'body'`, and each
 * turning part as a group of its own name at its axle holding its mesh. Every
 * matrix in the result is asserted proper — a reflection here renders the
 * craft as a solid blob of ink, and an ordinary `Mesh` would hide it.
 */
export function assemble(name: string, still: readonly Soup[], turning: readonly Turning[] = []): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.add(meshOf(still, 'body'));
  for (const part of turning) {
    const pivot = new THREE.Group();
    pivot.name = part.name;
    pivot.position.copy(part.at);
    pivot.add(meshOf([part.soup], `${part.name}-mesh`));
    group.add(pivot);
  }
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (object.matrixWorld.determinant() <= 0) throw new Error(`craft ${name}: '${object.name}' has a reflected matrix`);
  });
  return group;
}

// ---------------------------------------------------------------------------
// The loft
// ---------------------------------------------------------------------------

/** One section of a loft: a closed polygon in (x, y) at a given z. */
export interface Station {
  z: number;
  ring: readonly (readonly [number, number])[];
}

const shoelace = (ring: readonly (readonly [number, number])[]): number => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[(i + 1) % ring.length]!;
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
};

/**
 * A closed shell through a run of sections, every section with the same number
 * of points, and a cap on each end.
 *
 * It is `vehicles.ts`'s `shell` with any section rather than a rectangle,
 * because a hull, a fuselage, a wing and a wheel pant are all rounder than a box
 * and the one fault that made the old craft ugly was that they were boxes. A
 * section may be concave — the open cockpit of the launch and the plane is a U
 * with the well cut into its top — and a point may coincide with its neighbour,
 * which is how a well closes into a deck between two stations; the triangles
 * that collapse are dropped by `assemble`.
 *
 * **Which way round it is wound is checked, not trusted**: every section is put
 * anticlockwise before the quads are laid, each cap is turned to face out along
 * z, and then the signed volume of the whole shell must come out positive
 * (`assertOutward`, the same test `vehicles.ts` runs). A shell wound inside out
 * turns its hull front-facing and draws as a solid blob of ink.
 */
export function loft(stations: readonly Station[], color: number): THREE.Mesh {
  if (stations.length < 2) throw new Error('loft: needs two stations');
  const n = stations[0]!.ring.length;
  for (let i = 1; i < stations.length; i++) {
    if (stations[i]!.ring.length !== n) throw new Error('loft: every station needs the same number of points');
    if (!(stations[i]!.z > stations[i - 1]!.z)) throw new Error('loft: stations must run aft to fore, z strictly increasing');
  }
  const rings = stations.map((s) => {
    const ring = s.ring.map(([x, y]) => [x, y, s.z] as [number, number, number]);
    return shoelace(s.ring) < 0 ? ring.reverse() : ring;
  });
  const p: number[] = [];
  const tri = (a: readonly number[], b: readonly number[], c: readonly number[]) => p.push(...a, ...b, ...c);
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i]!;
    const B = rings[i + 1]!;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      tri(A[j]!, A[k]!, B[k]!);
      tri(A[j]!, B[k]!, B[j]!);
    }
  }
  const cap = (ring: readonly [number, number, number][], facing: 1 | -1) => {
    // Coincident neighbours are what a closed well leaves; the ear clipper is
    // handed the ring without them.
    const kept = ring.filter((point, i) => {
      const next = ring[(i + 1) % ring.length]!;
      return Math.hypot(point[0] - next[0], point[1] - next[1]) > 1e-6;
    });
    if (kept.length < 3) return;
    const faces = THREE.ShapeUtils.triangulateShape(kept.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const [a, b, c] of faces) {
      const pa = kept[a!]!;
      const pb = kept[b!]!;
      const pc = kept[c!]!;
      const z = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
      if (Math.sign(z) === facing) tri(pa, pb, pc);
      else tri(pa, pc, pb);
    }
  };
  cap(rings[0]!, -1);
  cap(rings[rings.length - 1]!, 1);
  assertOutward(p);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, craftContext().toon(color));
}

/** Six times the signed volume of a closed triangle soup; positive is outward. */
export function signedVolume(p: ArrayLike<number>): number {
  let volume = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i]!, ay = p[i + 1]!, az = p[i + 2]!;
    const bx = p[i + 3]!, by = p[i + 4]!, bz = p[i + 5]!;
    const cx = p[i + 6]!, cy = p[i + 7]!, cz = p[i + 8]!;
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return volume;
}

function assertOutward(p: readonly number[]): void {
  const volume = signedVolume(p);
  if (!(volume > 0)) throw new Error(`loft: the shell is wound inside out (6V = ${volume.toFixed(3)})`);
}

/**
 * A rounded box section: flat top and bottom, the four corners cut by
 * `chamfer` of the smaller of the half-width and half-height. Eight points,
 * which is as round as the pen lets a fuselage be before the joints between
 * facets start reading as panel lines.
 */
export function octagon(half: number, bottom: number, top: number, chamfer = 0.35): [number, number][] {
  const c = Math.min(half, (top - bottom) / 2) * chamfer;
  return [
    [-half + c, bottom],
    [half - c, bottom],
    [half, bottom + c],
    [half, top - c],
    [half - c, top],
    [-half + c, top],
    [-half, top - c],
    [-half, bottom + c],
  ];
}

/**
 * An open well's section: an outer skin from the keel up to a sheer on either
 * side, a wall `wall` thick, and a floor at `floor` inside it. Nine points, the
 * same nine whether or not the well is open, so a station with `decked` set
 * closes it into a flat deck at the sheer and the loft between an open and a
 * decked station is a bulkhead.
 *
 * `chine` is where the bottom turns up into the side; `keel` the bottom on the
 * centreline. A flat-bottomed fuselage gives the keel and the chine one height.
 */
export interface WellSection {
  keel: number;
  chineHalf: number;
  chineY: number;
  sheerHalf: number;
  sheerY: number;
  floor: number;
  wall: number;
  decked?: boolean;
}

export function well(s: WellSection): [number, number][] {
  // The skin's own half-width at the floor, so the inner wall runs parallel to it.
  const t = (s.floor - s.chineY) / (s.sheerY - s.chineY);
  const skinAtFloor = s.chineHalf + (s.sheerHalf - s.chineHalf) * THREE.MathUtils.clamp(t, 0, 1);
  const innerTop = Math.max(0, s.sheerHalf - s.wall);
  const innerFloor = Math.max(0, Math.min(innerTop, skinAtFloor - s.wall));
  const floor = s.decked === true ? s.sheerY : s.floor;
  const innerBottom = s.decked === true ? innerTop : innerFloor;
  return [
    [0, s.keel],
    [s.chineHalf, s.chineY],
    [s.sheerHalf, s.sheerY],
    [innerTop, s.sheerY],
    [innerBottom, floor],
    [-innerBottom, floor],
    [-innerTop, s.sheerY],
    [-s.sheerHalf, s.sheerY],
    [-s.chineHalf, s.chineY],
  ];
}

/**
 * A lathe of `sides` about +Y through `profile` (radius, y) from the bottom up,
 * faceted, in one colour, and optionally only the gore from `from` to `to` of
 * the turn. The whole turn is closed if the profile starts and ends on the
 * axis; a gore is not closed and is only ever used beside its neighbours.
 */
export function lathe(profile: readonly (readonly [number, number])[], color: number, sides: number, from = 0, to = 1): THREE.Mesh {
  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(points, sides, from * Math.PI * 2, (to - from) * Math.PI * 2);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  return new THREE.Mesh(faceted, craftContext().toon(color));
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/** A craft as its file describes it, before it is centred and measured. */
export type CraftDraft = Omit<CraftModel, 'size'>;

/**
 * The finished model: centred in X and Z on its own box, as the contract's
 * frame asks, with the seats moved by the same amount, and `size` read off the
 * built box rather than written down. A plane is longer ahead of its seats than
 * behind them and a car's cabin is not in its middle, so each file builds about
 * whatever origin its own arithmetic wanted and this puts the box's middle on
 * the axis. The turning parts are direct children and move with it, so a
 * caller that finds them by name finds them where they are.
 */
export function finish(draft: CraftDraft): CraftModel {
  const box = new THREE.Box3().setFromObject(draft.build(0));
  const dx = (box.min.x + box.max.x) / 2;
  const dz = (box.min.z + box.max.z) / 2;
  const size: [number, number, number] = [box.max.z - box.min.z, box.max.x - box.min.x, box.max.y - box.min.y];
  return {
    ...draft,
    size,
    seats: draft.seats.map((seat) => ({ ...seat, x: seat.x - dx, z: seat.z - dz })),
    build(variant) {
      const group = draft.build(variant);
      for (const child of group.children) {
        child.position.x -= dx;
        child.position.z -= dz;
      }
      group.updateMatrixWorld(true);
      return group;
    },
  };
}
