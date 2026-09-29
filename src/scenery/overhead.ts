import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { AVATAR_HEIGHT, SCENERY_SCALE } from '../stature.ts';
import { KINDS as VEHICLE_KINDS, PLACED_SECTION } from '../traffic/contract.ts';
import { ARM_DEPTH, POLE_COLOUR, POLE_HEIGHT, POLE_WIDTH, WIRE_COLOUR, WIRE_SAG, WIRE_WIDTH } from '../roadside.ts';
import { bedtimeByte } from '../lights.ts';
import { rngFrom } from './random.ts';
import type { Rng, Weighted } from './random.ts';
import { STOREY } from './contract.ts';
import { cellCentre, cornerOffset } from './grid.ts';
import type { TownGrid } from './grid.ts';
import { pavementOf } from './ground.ts';

/**
 * What hangs over a town's streets: bunting, lanterns, garlands, cut paper,
 * washing, shade sails, festoon bulbs, a banner, and the poles and wires of a
 * street's services.
 *
 * **Everything here hangs between two things that stand.** A span's ends are
 * found, not placed: a horizontal ray from the street's own line out to each
 * side, against the triangles of the buildings the town has just stood there
 * (`OverheadHost`), and a span is only drawn where both rays meet a
 * building within reach, on a wall or the eaves or roof over one
 * (`wallAnchor`), and where the line between them passes through no box of
 * any. So a string never starts in the air over an empty yard and never
 * crosses a street that has a building on one side only. Poles are the one
 * exception, and they bring their own ends: a line of service poles on a
 * street's edge, or a pair of masts across a main street too low to string
 * from its walls, each off every lamp, bench, parked car and person the ground
 * laid out.
 *
 * **And it hangs over what drives under it.** The lowest point of whatever
 * hangs — the sag of the line plus the pennant, lantern or shirt under it —
 * clears the floor under the span by `OVERHEAD_CLEAR` over a main street,
 * which the traffic drives, by `SIDE_CLEAR` over any other, and by the height
 * of any vehicle parked under it. Nothing here is a wall (`solids.ts`): it is
 * all over a head.
 *
 * Built only into a near town's buffer, as its people and parked cars are, in
 * the town's own frame and as one run of vertices: one material, vertex
 * colours, the ink's normal its own. Deterministic from the town's seed.
 */

const M = SCENERY_SCALE;

/** The tallest road vehicle as a town places it, in world units: the bus, 4.6 authored at `PLACED_SECTION`. */
const TALLEST_VEHICLE = Math.max(
  ...Object.values(VEHICLE_KINDS).filter((kind) => kind.medium === 'road').map((kind) => kind.height),
) * PLACED_SECTION;

/**
 * How high over the floor under it the lowest thing hanging over a main
 * street may come: the tallest road vehicle and a quarter of a person, 7.15
 * units (2026-09-28). The two main streets are a town's through road
 * (`through.ts`), which the traffic drives, a bus among it.
 */
export const OVERHEAD_CLEAR = TALLEST_VEHICLE + AVATAR_HEIGHT * 0.25;

/**
 * And over any street but a main one: a placed car and a quarter of a person
 * over it, 4.72 units (2026-09-28). What drives through a town is the traffic
 * along its main streets (`through.ts`), and a vehicle parked under a line is
 * cleared by its own height (`OverheadSite.parked`), so what passes under a
 * side street's washing is a person, a car, and a van that a player drives
 * through the pennants rather than into anything.
 */
export const SIDE_CLEAR = VEHICLE_KINDS.car.height * PLACED_SECTION + AVATAR_HEIGHT * 0.25;

/** Where along a street a slot looks for a wall each side, in cells from its own spot, nearest first. */
const SHIFTS = [0, 0.15, -0.15, 0.3, -0.3, 0.42, -0.42];

/**
 * What share of the slots a region's `main` and `side` chances would string
 * actually carry one. At the regions' own chances an old town strung nearly
 * every cell of its main street and a third of its side streets, and a street
 * under a canopy of pennants read as a fairground, not a town dressed for a
 * day; about two in five keeps them an event down the street, not a ceiling.
 */
const STRING_DENSITY = 0.4;

/** What a street may put up masts for when its walls are too low: the strings and a banner, not washing or a sail. */
const MASTED = new Set<Hang>(['pennants', 'picado', 'bulbs', 'lanterns', 'marigolds', 'banner']);

/** How far over or under an anchor the building must still be at about its depth: it is tied to something, not to an edge. */
const WALL_ABOVE = 0.8;
/**
 * How far past the street's edge a line may be tied: a wall set back from
 * it behind a front step or a front garden, or the slope of a roof over one:
 * 5.5 m.
 */
const ROOF_REACH = 7;
/** How far an end runs into the wall it is tied to, so no light shows between them. */
const EMBED = 0.06;
/** The steps an anchor is looked for in, upwards from the lowest that clears. */
const ANCHOR_STEP = 0.6;
/** How much higher than the lowest an anchor may be looked for: two storeys. */
const ANCHOR_RANGE = 2 * STOREY;

/** Slab height of the per-variant triangle index the rays read. */
const SLAB = 0.5;

/**
 * The most triangles one town's strings may come to, and its strings, poles
 * and wires together: the strings stop first, so a city's wires are never
 * the part that was cut.
 */
const SPAN_CAP = 9000;
const TRIANGLE_CAP = 13000;

/**
 * How far apart a street's poles stand, in world units: about 28 m, three
 * cells of a town's usual pitch. At two cells a city's streets were a pole
 * every few metres on one pavement or the other.
 */
const POLE_GAP = 36;
/** A town's pole, as a share of the country's `POLE_WIDTH`: slimmer in a street than on a verge. */
const TOWN_POLE = 0.7;
/**
 * A mast's shaft, as a share of `POLE_WIDTH`: a painted iron rod about 9 cm
 * across. It was a white post three times that, and a main street of them
 * read as a forest.
 */
const MAST_WIDTH = 0.27;
/** At most one pair of masts in this many cells of a main street. */
const MAST_EVERY = 3;
/** How far in from the street's edge a pole's centre stands. */
const POLE_INSET = POLE_WIDTH * 0.5 + 0.22;
/** How far the arm reaches out over the street from the pole. */
const ARM_REACH = 0.75 * M;

export type Hang = 'pennants' | 'lanterns' | 'marigolds' | 'picado' | 'laundry' | 'sail' | 'bulbs' | 'banner';

interface Profile {
  /** What a street strings across itself, by weight: one kind a street, so a street is one festival. */
  hangs: readonly Weighted<Hang>[];
  /** And a main street, where it differs: nobody hangs their washing over the high street. */
  mainHangs?: readonly Weighted<Hang>[];
  /** The chance a slot on the main street carries a span, and on any other street. */
  main: number;
  side: number;
  /** The chance a street carries a pole line, main street; half that on the others. */
  wires: number;
  /** Wires a pole carries. */
  lines: number;
  /** The colours a string cycles through: bright, and from the palette. */
  colours: readonly number[];
  /** Concrete poles rather than timber ones. */
  concrete?: boolean;
}

const P = PALETTE;
const FESTIVE = [P.red, P.gold, P.skyBlue, P.green, P.white, P.orange, P.pink];

/**
 * Per region. The European three string pennants, from wall to wall or from
 * masts down the main street and from the eaves across the side streets; the Mediterranean hangs washing
 * over its side streets; the Maghreb shades its streets with cloth; south
 * Asia strings marigolds and bright pennants between wires; east Asia hangs
 * lanterns on a line and runs its services overhead on concrete poles; Latin
 * America cuts paper; north America and Oceania hang a banner over the main
 * street and little else.
 */
const PROFILES: Record<string, Profile> = {
  nordic: { hangs: [{ item: 'pennants', weight: 1 }], main: 1, side: 1, wires: 0, lines: 2, colours: [P.red, P.white, P.skyBlue, P.gold] },
  'atlantic-europe': { hangs: [{ item: 'pennants', weight: 1 }], main: 1, side: 1, wires: 0, lines: 2, colours: [P.red, P.white, P.skyBlue, P.gold, P.green] },
  'east-europe': { hangs: [{ item: 'pennants', weight: 1 }], main: 1, side: 1, wires: 0.15, lines: 2, colours: [P.red, P.white, P.gold, P.skyBlue] },
  mediterranean: {
    hangs: [{ item: 'laundry', weight: 5 }, { item: 'pennants', weight: 2 }],
    mainHangs: [{ item: 'pennants', weight: 1 }],
    main: 1, side: 1, wires: 0.1, lines: 2,
    colours: [P.red, P.gold, P.skyBlue, P.white, P.green, P.pink],
  },
  maghreb: {
    hangs: [{ item: 'sail', weight: 4 }, { item: 'bulbs', weight: 1 }],
    mainHangs: [{ item: 'bulbs', weight: 2 }, { item: 'sail', weight: 1 }],
    main: 0.8, side: 0.5, wires: 0.2, lines: 2,
    colours: [P.sand, P.apricot, P.cream, P.clay, P.salmon, P.gold],
  },
  'middle-east': {
    hangs: [{ item: 'bulbs', weight: 3 }, { item: 'sail', weight: 2 }, { item: 'pennants', weight: 1 }],
    main: 0.75, side: 0.4, wires: 0.35, lines: 2,
    colours: [P.gold, P.green, P.white, P.red, P.skyBlue],
  },
  'south-asia': {
    hangs: [{ item: 'marigolds', weight: 3 }, { item: 'pennants', weight: 3 }],
    main: 0.9, side: 0.55, wires: 0.8, lines: 3,
    colours: [P.orange, P.gold, P.pink, P.crimson, P.green, P.violet, P.skyBlue],
  },
  'east-asia': {
    hangs: [{ item: 'lanterns', weight: 1 }],
    main: 0.75, side: 0.35, wires: 0.9, lines: 4,
    colours: [P.red, P.crimson, P.cream],
    concrete: true,
  },
  'southeast-asia': {
    hangs: [{ item: 'pennants', weight: 2 }, { item: 'lanterns', weight: 1 }],
    main: 0.75, side: 0.45, wires: 0.8, lines: 3,
    colours: [P.red, P.gold, P.skyBlue, P.green, P.pink, P.white],
    concrete: true,
  },
  'sub-saharan': { hangs: [{ item: 'pennants', weight: 1 }], main: 0.4, side: 0.15, wires: 0.3, lines: 2, colours: FESTIVE },
  'north-america': { hangs: [{ item: 'banner', weight: 1 }], main: 0.12, side: 0, wires: 0.5, lines: 3, colours: [P.red, P.white, P.skyBlue, P.gold] },
  'latin-america': {
    hangs: [{ item: 'picado', weight: 4 }, { item: 'pennants', weight: 1 }],
    main: 0.9, side: 0.55, wires: 0.7, lines: 3,
    colours: [P.pink, P.violet, P.skyBlue, P.gold, P.orange, P.green, P.red, P.white],
  },
  oceania: { hangs: [{ item: 'banner', weight: 1 }], main: 0.08, side: 0, wires: 0.3, lines: 2, colours: [P.skyBlue, P.white, P.gold, P.green] },
  polar: { hangs: [{ item: 'pennants', weight: 1 }], main: 0.25, side: 0.1, wires: 0.2, lines: 2, colours: [P.red, P.gold, P.skyBlue, P.white] },
};

/** At most this many of a kind in one town, where fewer is the point: one banner over main street. */
const TOWN_CAP: Partial<Record<Hang, number>> = { banner: 1 };

/**
 * Per kind: how far under its line the lowest thing hangs, and the line's
 * sag as a share of its span. The drop is in metres times `SCENERY_SCALE`.
 */
const HANG: Record<Hang, { drop: number; sag: number; diagonal: number }> = {
  pennants: { drop: 0.62 * M, sag: 0.045, diagonal: 0.4 },
  picado: { drop: 0.68 * M, sag: 0.045, diagonal: 0.3 },
  marigolds: { drop: 0.62 * M, sag: 0.1, diagonal: 0.3 },
  lanterns: { drop: 0.72 * M, sag: 0.05, diagonal: 0 },
  bulbs: { drop: 0.3 * M, sag: 0.07, diagonal: 0.35 },
  laundry: { drop: 0.8 * M, sag: 0.035, diagonal: 0.2 },
  sail: { drop: 0, sag: 0.06, diagonal: 0 },
  banner: { drop: 1.35 * M, sag: 0.02, diagonal: 0 },
};

// ---------------------------------------------------------------------------
// The buildings, as something a ray can hit
// ---------------------------------------------------------------------------

/** A building standing in the town: its variant's own triangles and where they are. */
export interface OverheadHost {
  /** The variant's positions, in its own frame, three a vertex, a triangle list. */
  position: Float32Array;
  /** The variant into the town's frame: a yaw, a uniform scale and a translation. */
  matrix: THREE.Matrix4;
}

/** A variant's triangles bucketed by height, so a horizontal ray reads one slab of them. */
interface Shape {
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  slabs: Int32Array[];
}

const shapes = new WeakMap<Float32Array, Shape>();

function shapeOf(position: Float32Array): Shape {
  const known = shapes.get(position);
  if (known !== undefined) return known;
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    minX = Math.min(minX, position[i]!);
    maxX = Math.max(maxX, position[i]!);
    minY = Math.min(minY, position[i + 1]!);
    maxY = Math.max(maxY, position[i + 1]!);
    minZ = Math.min(minZ, position[i + 2]!);
    maxZ = Math.max(maxZ, position[i + 2]!);
  }
  if (minY > maxY) minY = maxY = minX = maxX = minZ = maxZ = 0;
  const count = Math.max(1, Math.ceil((maxY - minY) / SLAB) + 1);
  const lists: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < position.length / 9; t++) {
    const y0 = position[t * 9 + 1]!;
    const y1 = position[t * 9 + 4]!;
    const y2 = position[t * 9 + 7]!;
    const from = Math.floor((Math.min(y0, y1, y2) - minY) / SLAB);
    const to = Math.floor((Math.max(y0, y1, y2) - minY) / SLAB);
    for (let k = Math.max(0, from); k <= Math.min(count - 1, to); k++) lists[k]!.push(t);
  }
  const shape: Shape = { minY, maxY, minX, maxX, minZ, maxZ, slabs: lists.map((list) => Int32Array.from(list)) };
  shapes.set(position, shape);
  return shape;
}

/** A host prepared for the town's queries: its shape, the way back into its frame, and its box in the town's. */
interface Placed {
  position: Float32Array;
  shape: Shape;
  inverse: THREE.Matrix4;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

const corner = new THREE.Vector3();

function prepare(host: OverheadHost): Placed {
  const shape = shapeOf(host.position);
  const inverse = host.matrix.clone().invert();
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const x of [shape.minX, shape.maxX]) {
    for (const y of [shape.minY, shape.maxY]) {
      for (const z of [shape.minZ, shape.maxZ]) {
        corner.set(x, y, z).applyMatrix4(host.matrix);
        x0 = Math.min(x0, corner.x);
        x1 = Math.max(x1, corner.x);
        y0 = Math.min(y0, corner.y);
        y1 = Math.max(y1, corner.y);
        z0 = Math.min(z0, corner.z);
        z1 = Math.max(z1, corner.z);
      }
    }
  }
  return { position: host.position, shape, inverse, x0, x1, z0, z1, y0, y1 };
}

const rayFrom = new THREE.Vector3();
const rayTo = new THREE.Vector3();

/**
 * How far along a horizontal ray from `(ox, y, oz)` in direction `(dx, dz)`
 * the first building wall is, up to `reach`; Infinity for none. Both faces
 * of a triangle count.
 */
function wallHit(hosts: readonly Placed[], ox: number, y: number, oz: number, dx: number, dz: number, reach: number): number {
  const ex = ox + dx * reach;
  const ez = oz + dz * reach;
  const bx0 = Math.min(ox, ex);
  const bx1 = Math.max(ox, ex);
  const bz0 = Math.min(oz, ez);
  const bz1 = Math.max(oz, ez);
  let best = Infinity;
  for (const host of hosts) {
    if (y < host.y0 || y > host.y1 || bx1 < host.x0 || bx0 > host.x1 || bz1 < host.z0 || bz0 > host.z1) continue;
    rayFrom.set(ox, y, oz).applyMatrix4(host.inverse);
    rayTo.set(ex, y, ez).applyMatrix4(host.inverse);
    const shape = host.shape;
    const k = Math.floor((rayFrom.y - shape.minY) / SLAB);
    const list = shape.slabs[k];
    if (list === undefined) continue;
    const p = host.position;
    const Dx = rayTo.x - rayFrom.x;
    const Dy = rayTo.y - rayFrom.y;
    const Dz = rayTo.z - rayFrom.z;
    for (let n = 0; n < list.length; n++) {
      const t = list[n]! * 9;
      const v0x = p[t]!;
      const v0y = p[t + 1]!;
      const v0z = p[t + 2]!;
      const e1x = p[t + 3]! - v0x;
      const e1y = p[t + 4]! - v0y;
      const e1z = p[t + 5]! - v0z;
      const e2x = p[t + 6]! - v0x;
      const e2y = p[t + 7]! - v0y;
      const e2z = p[t + 8]! - v0z;
      // Moller-Trumbore over the segment, u in [0, 1] along it.
      const px = Dy * e2z - Dz * e2y;
      const py = Dz * e2x - Dx * e2z;
      const pz = Dx * e2y - Dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const tx = rayFrom.x - v0x;
      const ty = rayFrom.y - v0y;
      const tz = rayFrom.z - v0z;
      const a = (tx * px + ty * py + tz * pz) * inv;
      if (a < 0 || a > 1) continue;
      const qx = ty * e1z - tz * e1y;
      const qy = tz * e1x - tx * e1z;
      const qz = tx * e1y - ty * e1x;
      const b = (Dx * qx + Dy * qy + Dz * qz) * inv;
      if (b < 0 || a + b > 1) continue;
      const u = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (u < 0 || u > 1) continue;
      const at = u * reach;
      if (at < best) best = at;
    }
  }
  return best;
}

/** Whether a point is inside a building's box, less `margin` on every side. */
function inHost(hosts: readonly Placed[], x: number, y: number, z: number, margin: number): boolean {
  for (const host of hosts) {
    if (y < host.y0 || y > host.y1) continue;
    if (x > host.x0 + margin && x < host.x1 - margin && z > host.z0 + margin && z < host.z1 - margin) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The geometry
// ---------------------------------------------------------------------------

class Out {
  position: number[] = [];
  normal: number[] = [];
  color: number[] = [];
  glow: number[] = [];
  get triangles(): number {
    return this.position.length / 9;
  }
}

const ea = new THREE.Vector3();
const eb = new THREE.Vector3();
const faceNormal = new THREE.Vector3();

/** One triangle, wound so its normal is `outward`'s side, or its own geometric normal when `outward` is null. */
function face(
  out: Out, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
  colour: THREE.Color, outward: THREE.Vector3 | null, glow = 0, bed = 0,
): void {
  ea.subVectors(b, a);
  eb.subVectors(c, a);
  faceNormal.crossVectors(ea, eb);
  if (faceNormal.lengthSq() < 1e-14) return;
  let first = b;
  let second = c;
  if (outward !== null && faceNormal.dot(outward) < 0) {
    first = c;
    second = b;
    faceNormal.negate();
  }
  if (outward !== null) faceNormal.copy(outward);
  faceNormal.normalize();
  for (const v of [a, first, second]) {
    out.position.push(v.x, v.y, v.z);
    out.normal.push(faceNormal.x, faceNormal.y, faceNormal.z);
    out.color.push(colour.r, colour.g, colour.b);
    out.glow.push(glow, bed);
  }
}

const cardNormal = new THREE.Vector3();

/**
 * A triangle seen from both sides: the town's material draws front faces
 * only, so a pennant is its triangle twice, one each way.
 */
function card(out: Out, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color, glow = 0, bed = 0): void {
  ea.subVectors(b, a);
  eb.subVectors(c, a);
  cardNormal.crossVectors(ea, eb);
  if (cardNormal.lengthSq() < 1e-14) return;
  cardNormal.normalize();
  face(out, a, b, c, colour, cardNormal, glow, bed);
  cardNormal.negate();
  face(out, a, b, c, colour, cardNormal, glow, bed);
}

/** A quad `a b c d`, round its edge, seen from both sides. */
function quadCard(out: Out, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, colour: THREE.Color): void {
  card(out, a, b, c, colour);
  card(out, a, c, d, colour);
}

const outwardScratch = new THREE.Vector3();

/** A quad `a b c d` facing `outward`, one side only: the side of a closed shape. */
function quadOut(out: Out, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, outward: THREE.Vector3, colour: THREE.Color, glow = 0, bed = 0): void {
  outwardScratch.copy(outward);
  face(out, a, b, c, colour, outwardScratch, glow, bed);
  face(out, a, c, d, colour, outwardScratch, glow, bed);
}

const UP = new THREE.Vector3(0, 1, 0);
const tubeAlong = new THREE.Vector3();
const tubeU = new THREE.Vector3();
const tubeV = new THREE.Vector3();
const tubeN = new THREE.Vector3();
const ringA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const ringB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/** A tube from `a` to `b` of `sides` (3 or 4) flat sides, `radius` out: a wire, a cord, a strand. */
function tube(out: Out, a: THREE.Vector3, b: THREE.Vector3, radius: number, colour: THREE.Color, sides = 3): void {
  tubeAlong.subVectors(b, a);
  if (tubeAlong.lengthSq() < 1e-12) return;
  tubeAlong.normalize();
  tubeU.crossVectors(tubeAlong, UP);
  if (tubeU.lengthSq() < 1e-8) tubeU.set(1, 0, 0);
  tubeU.normalize();
  tubeV.crossVectors(tubeU, tubeAlong).normalize();
  for (let k = 0; k < sides; k++) {
    const angle = (k * Math.PI * 2) / sides;
    ringA[k]!.copy(a).addScaledVector(tubeU, Math.cos(angle) * radius).addScaledVector(tubeV, Math.sin(angle) * radius);
    ringB[k]!.copy(ringA[k]!).add(b).sub(a);
  }
  for (let k = 0; k < sides; k++) {
    const j = (k + 1) % sides;
    const angle = ((k + 0.5) * Math.PI * 2) / sides;
    tubeN.copy(tubeU).multiplyScalar(Math.cos(angle)).addScaledVector(tubeV, Math.sin(angle));
    quadOut(out, ringA[k]!, ringA[j]!, ringB[j]!, ringB[k]!, tubeN, colour);
  }
}

const boxCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
const boxNormal = new THREE.Vector3();

/** An upright box, `hx` by `hz` about `(x, z)`, from `y0` to `y1`, turned so its x axis is `(ax, az)`. */
function box(out: Out, x: number, z: number, ax: number, az: number, hx: number, hz: number, y0: number, y1: number, colour: THREE.Color, bottom = false): void {
  // Local x along (ax, az), local z along (-az, ax).
  for (let i = 0; i < 8; i++) {
    const sx = i & 1 ? 1 : -1;
    const sz = i & 2 ? 1 : -1;
    const y = i & 4 ? y1 : y0;
    boxCorners[i]!.set(x + ax * sx * hx - az * sz * hz, y, z + az * sx * hx + ax * sz * hz);
  }
  const c = boxCorners;
  // +x, -x, +z, -z, top.
  boxNormal.set(ax, 0, az);
  quadOut(out, c[1]!, c[3]!, c[7]!, c[5]!, boxNormal, colour);
  boxNormal.set(-ax, 0, -az);
  quadOut(out, c[0]!, c[4]!, c[6]!, c[2]!, boxNormal, colour);
  boxNormal.set(-az, 0, ax);
  quadOut(out, c[2]!, c[6]!, c[7]!, c[3]!, boxNormal, colour);
  boxNormal.set(az, 0, -ax);
  quadOut(out, c[0]!, c[1]!, c[5]!, c[4]!, boxNormal, colour);
  boxNormal.set(0, 1, 0);
  quadOut(out, c[4]!, c[5]!, c[7]!, c[6]!, boxNormal, colour);
  if (bottom) {
    boxNormal.set(0, -1, 0);
    quadOut(out, c[0]!, c[2]!, c[3]!, c[1]!, boxNormal, colour);
  }
}

/** A point on a line hung from `a` to `b` with `sag` at its middle: a parabola, which a catenary this shallow is. */
function hungAt(a: THREE.Vector3, b: THREE.Vector3, sag: number, t: number, into: THREE.Vector3): THREE.Vector3 {
  into.lerpVectors(a, b, t);
  into.y -= 4 * sag * t * (1 - t);
  return into;
}

const lineA = new THREE.Vector3();
const lineB = new THREE.Vector3();

/** The line itself, in `pieces`, a three-sided tube. */
function line(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, radius: number, colour: THREE.Color, pieces: number, alternate?: THREE.Color): void {
  for (let i = 0; i < pieces; i++) {
    hungAt(a, b, sag, i / pieces, lineA);
    hungAt(a, b, sag, (i + 1) / pieces, lineB);
    tube(out, lineA, lineB, radius, alternate !== undefined && i % 2 === 1 ? alternate : colour);
  }
}

const colourCache = new Map<number, THREE.Color>();
function colourOf(hex: number): THREE.Color {
  let known = colourCache.get(hex);
  if (known === undefined) {
    known = new THREE.Color(hex);
    colourCache.set(hex, known);
  }
  return known;
}

/** A colour a shade darker, for a cap or a cord: kept off the palette's own list on purpose, as `roadside.ts`'s are. */
const shadeCache = new Map<number, THREE.Color>();
function shadeOf(hex: number, towards: number = PALETTE.ink, share = 0.35): THREE.Color {
  const key = hex * 7 + Math.round(share * 100) + towards;
  let known = shadeCache.get(key);
  if (known === undefined) {
    known = new THREE.Color(hex).lerp(new THREE.Color(towards), share);
    shadeCache.set(key, known);
  }
  return known;
}

const CORD = shadeOf(PALETTE.bone, PALETTE.steel, 0.3);
const CORD_RADIUS = 0.035;

const pa = new THREE.Vector3();
const pb = new THREE.Vector3();
const pc = new THREE.Vector3();
const pd = new THREE.Vector3();
const pm = new THREE.Vector3();

/** Cut shapes along a line: `shape` draws one between `t0` and `t1` of the line. */
function along(a: THREE.Vector3, b: THREE.Vector3, spacing: number, width: number, each: (t0: number, t1: number, n: number) => void): void {
  const length = a.distanceTo(b);
  const count = Math.floor((length - 0.8) / spacing);
  if (count < 1) return;
  const start = (length - count * spacing) / 2 + spacing / 2;
  for (let n = 0; n < count; n++) {
    const s = start + n * spacing;
    each((s - width / 2) / length, (s + width / 2) / length, n);
  }
}

function pennants(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, CORD, 8);
  const first = rng.int(colours.length);
  const width = 0.5 * M;
  along(a, b, 0.68 * M, width, (t0, t1, n) => {
    hungAt(a, b, sag, t0, pa);
    hungAt(a, b, sag, t1, pb);
    hungAt(a, b, sag, (t0 + t1) / 2, pc);
    pc.y -= HANG.pennants.drop;
    card(out, pa, pb, pc, colourOf(colours[(first + n) % colours.length]!));
  });
}

function picado(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, CORD, 8);
  const first = rng.int(colours.length);
  const width = 0.55 * M;
  along(a, b, 0.62 * M, width, (t0, t1, n) => {
    hungAt(a, b, sag, t0, pa);
    hungAt(a, b, sag, t1, pb);
    const drop = HANG.picado.drop;
    pc.copy(pb).setY(pb.y - drop);
    pd.copy(pa).setY(pa.y - drop);
    quadCard(out, pa, pb, pc, pd, colourOf(colours[(first + n * 3) % colours.length]!));
  });
}

const LAUNDRY = [P.white, P.cream, P.skyBlue, P.blush, P.white, P.gold, P.pink, P.bone];

function laundry(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, CORD, 8);
  const length = a.distanceTo(b);
  let s = rng.range(0.8, 2);
  while (s < length - 1) {
    // A towel, a shirt, a tablecloth: the width and the drop together.
    const kind = rng.int(3);
    const width = (kind === 2 ? rng.range(1.0, 1.3) : rng.range(0.5, 0.75)) * M;
    const drop = Math.min(HANG.laundry.drop, (kind === 0 ? rng.range(0.55, 0.8) : kind === 1 ? rng.range(0.7, 0.8) : rng.range(0.6, 0.8)) * M);
    if (s + width > length - 0.8) break;
    hungAt(a, b, sag, s / length, pa);
    hungAt(a, b, sag, (s + width) / length, pb);
    pc.copy(pb).setY(pb.y - drop);
    pd.copy(pa).setY(pa.y - drop);
    quadCard(out, pa, pb, pc, pd, colourOf(rng.pick(LAUNDRY)));
    s += width + (rng.chance(0.25) ? rng.range(1.2, 2.5) : rng.range(0.12, 0.35));
  }
}

function marigolds(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: Rng): void {
  const orange = colourOf(P.orange);
  const gold = colourOf(P.gold);
  const pieces = Math.max(8, Math.round(a.distanceTo(b) / 0.55));
  // Two swags, the second hung deeper: a garland is a heavy rope of flowers.
  line(out, a, b, sag * 0.6, 0.11, orange, pieces, gold);
  line(out, a, b, sag, 0.09, gold, pieces, orange);
  // And the strands that fall from it.
  along(a, b, 1.1, 0, (t0, _t1, n) => {
    hungAt(a, b, sag, t0, pa);
    const drop = HANG.marigolds.drop * (n % 2 === 0 ? 1 : 0.7) - sag * 0.4;
    pb.copy(pa).setY(pa.y - Math.max(0.3, drop));
    tube(out, pa, pb, 0.08, n % 2 === 0 ? orange : gold);
  });
  void rng;
}

function lanterns(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, shadeOf(P.bark, P.ink, 0.2), 8);
  const body = 0.5 * M;
  const radius = 0.2 * M;
  const thread = HANG.lanterns.drop - body;
  const bed = bedtimeByte(rng.unit(), rng.chance(0.5));
  along(a, b, 1.8 * M, 0, (t0, _t1, n) => {
    hungAt(a, b, sag, t0, pa);
    const colour = colourOf(colours[n % 2 === 0 || colours.length < 2 ? 0 : 1]!);
    const cap = shadeOf(P.bark, P.ink, 0.1);
    const top = pa.y - thread;
    pb.copy(pa).setY(top);
    tube(out, pa, pb, 0.025, cap);
    lantern(out, pa.x, top, pa.z, radius, body, colour, cap, 200, bed);
  });
}

const lanternRings = [0, 1, 2].map(() => Array.from({ length: 6 }, () => new THREE.Vector3()));
const lanternN = new THREE.Vector3();
const lanternC = new THREE.Vector3();

/** A paper lantern: a six-sided barrel, `radius` at its waist and `height` tall, its top at `top`, lit after dark. */
function lantern(out: Out, x: number, top: number, z: number, radius: number, height: number, colour: THREE.Color, cap: THREE.Color, glow: number, bed: number): void {
  const levels = [top, top - height / 2, top - height];
  const radii = [radius * 0.55, radius, radius * 0.55];
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 6; k++) {
      const angle = (k * Math.PI) / 3;
      lanternRings[r]![k]!.set(x + Math.cos(angle) * radii[r]!, levels[r]!, z + Math.sin(angle) * radii[r]!);
    }
  }
  for (let band = 0; band < 2; band++) {
    for (let k = 0; k < 6; k++) {
      const j = (k + 1) % 6;
      const angle = ((k + 0.5) * Math.PI) / 3;
      lanternN.set(Math.cos(angle), band === 0 ? 0.45 : -0.45, Math.sin(angle)).normalize();
      quadOut(out, lanternRings[band]![k]!, lanternRings[band]![j]!, lanternRings[band + 1]![j]!, lanternRings[band + 1]![k]!, lanternN, colour, glow, bed);
    }
  }
  // The caps, dark and unlit.
  for (const [ring, y, sign] of [[0, top, 1], [2, top - height, -1]] as const) {
    lanternC.set(x, y, z);
    lanternN.set(0, sign, 0);
    for (let k = 0; k < 6; k++) face(out, lanternC, lanternRings[ring]![k]!, lanternRings[ring]![(k + 1) % 6]!, cap, lanternN);
  }
}

const bulbN = new THREE.Vector3();
const bulbTips = Array.from({ length: 6 }, () => new THREE.Vector3());

function bulbs(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, shadeOf(P.bark, P.ink, 0.2), 8);
  const colour = colourOf(P.cream);
  const r = 0.09 * M;
  const bed = bedtimeByte(rng.unit(), rng.chance(0.6));
  along(a, b, 0.95 * M, 0, (t0) => {
    hungAt(a, b, sag, t0, pm);
    pm.y -= HANG.bulbs.drop - r;
    // An octahedron: up, down, and four round the waist.
    bulbTips[0]!.set(pm.x, pm.y + r, pm.z);
    bulbTips[1]!.set(pm.x, pm.y - r, pm.z);
    bulbTips[2]!.set(pm.x + r, pm.y, pm.z);
    bulbTips[3]!.set(pm.x, pm.y, pm.z + r);
    bulbTips[4]!.set(pm.x - r, pm.y, pm.z);
    bulbTips[5]!.set(pm.x, pm.y, pm.z - r);
    for (let k = 0; k < 4; k++) {
      const p = bulbTips[2 + k]!;
      const q = bulbTips[2 + ((k + 1) % 4)]!;
      for (const tip of [bulbTips[0]!, bulbTips[1]!]) {
        bulbN.set(p.x + q.x + tip.x - 3 * pm.x, p.y + q.y + tip.y - 3 * pm.y, p.z + q.z + tip.z - 3 * pm.z).normalize();
        face(out, tip, p, q, colour, bulbN, 230, bed);
      }
    }
  });
}

const sailL = new THREE.Vector3();
const sailR = new THREE.Vector3();
const sailL2 = new THREE.Vector3();
const sailR2 = new THREE.Vector3();

/** A shade sail: cloth from the pair of anchors `a0 a1` on one side to `b0 b1` on the other, in bands of two colours. */
function sail(out: Out, a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  const first = colourOf(colours[rng.int(colours.length)]!);
  const second = colourOf(P.cream);
  const pieces = 6;
  for (let i = 0; i < pieces; i++) {
    hungAt(a0, b0, sag, i / pieces, sailL);
    hungAt(a1, b1, sag, i / pieces, sailR);
    hungAt(a0, b0, sag, (i + 1) / pieces, sailL2);
    hungAt(a1, b1, sag, (i + 1) / pieces, sailR2);
    quadCard(out, sailL, sailR, sailR2, sailL2, i % 2 === 0 ? first : second);
  }
}

function banner(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS * 1.2, shadeOf(P.steel, P.ink, 0.2), 8);
  const main = colourOf(colours[rng.int(colours.length)]!);
  let band = colourOf(colours[rng.int(colours.length)]!);
  if (band === main) band = colourOf(P.white);
  const length = a.distanceTo(b);
  const width = Math.min(length * 0.55, 7.5 * M);
  const t0 = 0.5 - width / length / 2;
  const t1 = 0.5 + width / length / 2;
  const drop = HANG.banner.drop;
  const pieces = 3;
  for (let i = 0; i < pieces; i++) {
    hungAt(a, b, sag, t0 + ((t1 - t0) * i) / pieces, pa);
    hungAt(a, b, sag, t0 + ((t1 - t0) * (i + 1)) / pieces, pb);
    // A band at the top in the second colour, then the cloth.
    pc.copy(pb).setY(pb.y - drop * 0.22);
    pd.copy(pa).setY(pa.y - drop * 0.22);
    quadCard(out, pa, pb, pc, pd, band);
    pa.y -= drop * 0.22;
    pb.y -= drop * 0.22;
    pc.copy(pb).setY(pb.y - drop * 0.78);
    pd.copy(pa).setY(pa.y - drop * 0.78);
    quadCard(out, pa, pb, pc, pd, main);
  }
}

// ---------------------------------------------------------------------------
// The streets
// ---------------------------------------------------------------------------

interface Street {
  /** 0: the street runs along z and `line` is an x; 1: along x, and `line` is a z. */
  axis: 0 | 1;
  line: number;
  /** Half its width: the band, or half the cell on an avenue. */
  half: number;
  main: boolean;
  index: number;
}

function streetsOf(grid: TownGrid, band: number): Street[] {
  const found: Street[] = [];
  const { cells } = grid;
  if (cells < 2) return found;
  for (const axis of [0, 1] as const) {
    for (let c = 0; c < cells; c++) {
      if (grid.avenue[c] === 1) {
        found.push({ axis, line: cellCentre(grid, c), half: grid.pitch * 0.5, main: c * 2 === cells - 1, index: c });
      }
      if (c + 1 < cells && grid.high[c] === 1) {
        found.push({ axis, line: cornerOffset(grid, c + 1), half: band, main: cells % 2 === 0 && c + 1 === cells / 2, index: c + 0.5 });
      }
    }
  }
  return found;
}

/** A point on a street: `across` from its line and `at` along it, in the town's frame. */
function onStreet(street: Street, across: number, at: number, y: number, into: THREE.Vector3): THREE.Vector3 {
  return street.axis === 0 ? into.set(street.line + across, y, at) : into.set(at, y, street.line + across);
}

export interface OverheadSite {
  region: string;
  seed: string | number;
  /** 0 for a hamlet to 1 for a metropolis: `urbanityOf` in `settlements.ts`. */
  urbanity: number;
  grid: TownGrid;
  /** The street band, `streetBand`. */
  band: number;
  hosts: readonly OverheadHost[];
  /** The made floor under a point of the town's frame, as a height in that frame, or null off the floor. */
  floorAt(x: number, z: number): number | null;
  /** Points a pole keeps off, as runs of `(x, z, radius)`: lamps, benches, signals, parked cars, people. */
  keep: readonly number[];
  /** The vehicles parked in the town, as runs of `(x, z, radius, height over its floor)`: a line over one clears it. */
  parked: readonly number[];
  /** The trees' crowns, as runs of `(x, y, z, radius, half height)`, their box's middle: no line passes through one. */
  crowns: readonly number[];
}

export interface Overhead {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  glow: Uint8Array;
  triangles: number;
  emits: boolean;
  spans: number;
  /** Service poles, and festival masts, counted apart. */
  poles: number;
  masts: number;
  wires: number;
  /** Where the poles and masts stand, as runs of `(x, z, radius)`, for what is laid on the paving after. */
  spots: number[];
  /**
   * The street cells, main and side: how many there are (a cell's stretch of
   * a street with a floor under it) and how many carry a string across.
   */
  cells: { main: number; mainHung: number; side: number; sideHung: number };
}

const anchor = new THREE.Vector3();

/**
 * Where a line across `street` at `at`, height `y`, meets the building on
 * `side` (+1 or -1 across): into `into`, or false. The building has to be
 * within the street's own reach — its edge and a little set back — and the
 * line has to meet it on something with more of it under or over it: a wall
 * that carries on `WALL_ABOVE` higher at about the same depth, or anything
 * with the building no further back `WALL_ABOVE` lower — a cornice, the eaves,
 * the slope of a roof over its wall, which is where a string is tied on a
 * two-storey house. What it may not meet is a tip or an edge standing out
 * over nothing.
 */
/** Whether any building's box reaches the line from `street`'s middle out to `side` at `at`, between `y0` and `y1`: the cheap test before the rays. */
function anyToward(hosts: readonly Placed[], street: Street, at: number, side: number, y0: number, y1: number): boolean {
  const reach = street.half + ROOF_REACH;
  onStreet(street, 0, at, 0, anchor);
  const ex = anchor.x + (street.axis === 0 ? side * reach : 0);
  const ez = anchor.z + (street.axis === 0 ? 0 : side * reach);
  const x0 = Math.min(anchor.x, ex);
  const x1 = Math.max(anchor.x, ex);
  const z0 = Math.min(anchor.z, ez);
  const z1 = Math.max(anchor.z, ez);
  for (const host of hosts) {
    if (host.y1 < y0 || host.y0 > y1 || x1 < host.x0 || x0 > host.x1 || z1 < host.z0 || z0 > host.z1) continue;
    return true;
  }
  return false;
}

function wallAnchor(hosts: readonly Placed[], street: Street, at: number, y: number, side: number, into: THREE.Vector3): boolean {
  const reach = street.half + ROOF_REACH;
  onStreet(street, 0, at, y, anchor);
  const dx = street.axis === 0 ? side : 0;
  const dz = street.axis === 0 ? 0 : side;
  const hit = wallHit(hosts, anchor.x, y, anchor.z, dx, dz, reach);
  if (!(hit <= reach) || hit < street.half * 0.5) return false;
  const above = wallHit(hosts, anchor.x, y + WALL_ABOVE, anchor.z, dx, dz, reach);
  const wall = above <= hit + 0.9 && above >= hit - 0.9;
  if (!wall) {
    const below = wallHit(hosts, anchor.x, y - WALL_ABOVE, anchor.z, dx, dz, reach);
    if (!(below <= hit + 0.9)) return false;
  }
  onStreet(street, side * (hit + EMBED), at, y, into);
  return true;
}

const spanA = new THREE.Vector3();
const spanB = new THREE.Vector3();
const spanA1 = new THREE.Vector3();
const spanB1 = new THREE.Vector3();
const probe = new THREE.Vector3();

const near: Placed[] = [];
/** The crowns of the town being hung, `OverheadSite.crowns`, and those near the line being tested. */
let crownsNow: readonly number[] = [];
const nearCrowns: number[] = [];

/** Whether a host's box holds `p`, grown by `margin`: the building an end is tied to. */
function holds(host: Placed, p: THREE.Vector3, margin: number): boolean {
  return p.x > host.x0 - margin && p.x < host.x1 + margin && p.z > host.z0 - margin && p.z < host.z1 + margin && p.y > host.y0 && p.y < host.y1 + margin;
}

/**
 * Whether a hung line from `a` to `b` stays out of every building and every
 * tree's crown, away from its two ends.
 *
 * **A line tied to a building across `street` is tested against that
 * building by rays, not by its box.** A box is the building and the air in
 * front of its roof, and a line tied to a roof's slope runs through that air
 * for a metre or two; so the two buildings its ends are tied to are asked the
 * way the ends were found — a ray from the street's line out at each point,
 * which has to reach the point before it meets the building — and every other
 * building by its box.
 */
function clearOfHosts(hosts: readonly Placed[], a: THREE.Vector3, b: THREE.Vector3, sag: number, drop: number, street?: Street): boolean {
  // Only the buildings whose boxes reach the line's own.
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const z0 = Math.min(a.z, b.z);
  const z1 = Math.max(a.z, b.z);
  const y1 = Math.max(a.y, b.y);
  const y0 = Math.min(a.y, b.y) - sag - drop;
  near.length = 0;
  for (const host of hosts) {
    if (host.y1 < y0 || host.y0 > y1 || x1 < host.x0 || x0 > host.x1 || z1 < host.z0 || z0 > host.z1) continue;
    if (street !== undefined && (holds(host, a, 0.3) || holds(host, b, 0.3))) continue;
    near.push(host);
  }
  nearCrowns.length = 0;
  for (let i = 0; i + 4 < crownsNow.length; i += 5) {
    const r = crownsNow[i + 3]!;
    const h = crownsNow[i + 4]!;
    const cx = crownsNow[i]!;
    const cy = crownsNow[i + 1]!;
    const cz = crownsNow[i + 2]!;
    if (cx + r < x0 || cx - r > x1 || cz + r < z0 || cz - r > z1 || cy + h < y0 || cy - h > y1) continue;
    nearCrowns.push(cx, cy, cz, r, h);
  }
  const length = a.distanceTo(b);
  const samples = Math.max(4, Math.ceil(length / 1.2));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    hungAt(a, b, sag, t, probe);
    // By rays, against every building, the tied ones included, right up to the ends.
    if (street !== undefined) {
      const across = street.axis === 0 ? probe.x - street.line : probe.z - street.line;
      const at = street.axis === 0 ? probe.z : probe.x;
      const out = Math.abs(across);
      if (out > 0.3) {
        const side = Math.sign(across);
        const px = street.axis === 0 ? street.line : at;
        const pz = street.axis === 0 ? at : street.line;
        const dx = street.axis === 0 ? side : 0;
        const dz = street.axis === 0 ? 0 : side;
        const reach = out - EMBED - 0.02;
        if (wallHit(hosts, px, probe.y, pz, dx, dz, reach) < reach) return false;
        if (drop > 0 && wallHit(hosts, px, probe.y - drop, pz, dx, dz, reach) < reach) return false;
      }
    }
    if (t * length < 0.8 || (1 - t) * length < 0.8) continue;
    if (inHost(near, probe.x, probe.y, probe.z, 0.2)) return false;
    if (drop > 0 && inHost(near, probe.x, probe.y - drop, probe.z, 0.2)) return false;
    for (let c = 0; c < nearCrowns.length; c += 5) {
      if (Math.hypot(probe.x - nearCrowns[c]!, probe.z - nearCrowns[c + 2]!) > nearCrowns[c + 3]!) continue;
      const dy = nearCrowns[c + 1]!;
      const half = nearCrowns[c + 4]!;
      if (probe.y > dy - half && probe.y - drop < dy + half) return false;
    }
  }
  return true;
}

/**
 * The overhead of one near town, in its own frame, or null for none.
 */
export function hangOverhead(site: OverheadSite): Overhead | null {
  const profile = PROFILES[site.region];
  if (profile === undefined || site.grid.cells < 2 || site.hosts.length < 2) return null;
  const { grid } = site;
  const hosts = site.hosts.map(prepare);
  crownsNow = site.crowns;
  const out = new Out();
  const streets = streetsOf(grid, site.band);
  const urban = 0.8 + 0.3 * Math.max(0, Math.min(1, site.urbanity));
  const counts = new Map<Hang, number>();
  let spans = 0;
  const cells = { main: 0, mainHung: 0, side: 0, sideHung: 0 };
  let poles = 0;
  let masts = 0;
  let wires = 0;

  /** The highest floor under a line across a street at `at0` and `at1`, or null where any of it is off the floor. */
  const floorUnder = (street: Street, at0: number, at1: number): number | null => {
    let high = -Infinity;
    for (const [across, at] of [[0, (at0 + at1) / 2], [-street.half * 0.7, at0], [street.half * 0.7, at1]] as const) {
      onStreet(street, across, at, 0, probe);
      const y = site.floorAt(probe.x, probe.z);
      if (y === null) return null;
      high = Math.max(high, y);
    }
    return high;
  };

  /**
   * How high the lowest thing hung between `a` and `b` over `street` has to
   * clear its floor: `OVERHEAD_CLEAR` over a main street, which the traffic
   * drives through a town by; `SIDE_CLEAR` over any other, and over a
   * vehicle parked under it, its own height and a quarter of a person.
   */
  const clearUnder = (street: Street, a: THREE.Vector3, b: THREE.Vector3): number => {
    let clear = street.main ? OVERHEAD_CLEAR : SIDE_CLEAR;
    const parked = site.parked;
    const lx = b.x - a.x;
    const lz = b.z - a.z;
    const length2 = Math.max(1e-9, lx * lx + lz * lz);
    for (let i = 0; i + 3 < parked.length; i += 4) {
      const px = parked[i]!;
      const pz = parked[i + 1]!;
      const t = Math.max(0, Math.min(1, ((px - a.x) * lx + (pz - a.z) * lz) / length2));
      if (Math.hypot(a.x + lx * t - px, a.z + lz * t - pz) > parked[i + 2]! + 0.5) continue;
      clear = Math.max(clear, parked[i + 3]! + AVATAR_HEIGHT * 0.25);
    }
    return clear;
  };

  /** Whether `at` along a street is in a street crossing it, or within a pace of one: no pole stands in a carriageway. */
  const crossing = (at: number): boolean => {
    for (let c = 0; c < grid.cells; c++) {
      if (grid.avenue[c] === 1 && Math.abs(at - cellCentre(grid, c)) < grid.pitch * 0.5 + 0.6) return true;
      if (c + 1 < grid.cells && grid.high[c] === 1 && Math.abs(at - cornerOffset(grid, c + 1)) < site.band + 0.6) return true;
    }
    return false;
  };

  const keep = site.keep;
  const poleAt = new THREE.Vector3();
  /**
   * A pole's foot at `at` along `street`, `across` from its line, with its
   * arm (or none) reaching `(armX, armZ)`: its floor, or null where it would
   * stand on a lamp, a bench, a parked car or a person, off the floor, or up
   * through a wall, the eaves and balconies included.
   */
  const standPole = (street: Street, across: number, at: number, armX: number, armZ: number): { x: number; y: number; z: number; at: number } | null => {
    if (Math.abs(at) > grid.half - 1) return null;
    if (crossing(at)) return null;
    onStreet(street, across, at, 0, poleAt);
    const floor = site.floorAt(poleAt.x, poleAt.z);
    if (floor === null) return null;
    for (let i = 0; i + 2 < keep.length; i += 3) {
      if (Math.hypot(keep[i]! - poleAt.x, keep[i + 1]! - poleAt.z) < keep[i + 2]!) return null;
    }
    for (const [x, z] of taken) {
      if (Math.hypot(x - poleAt.x, z - poleAt.z) < 2) return null;
    }
    for (let h = 0.5; h < POLE_HEIGHT + 0.3; h += 1.5) {
      if (inHost(hosts, poleAt.x, floor + h, poleAt.z, -POLE_WIDTH)) return null;
      if (inHost(hosts, poleAt.x + armX * ARM_REACH, floor + h, poleAt.z + armZ * ARM_REACH, -0.1)) return null;
    }
    return { x: poleAt.x, y: floor, z: poleAt.z, at };
  };
  /** Where a pole or a mast already stands, so two never share a spot. */
  const taken: [number, number][] = [];
  // Painted iron, dark: a green in most places, a steel where the poles are concrete.
  const mastColour = profile.concrete === true ? shadeOf(P.steel, P.ink, 0.25) : shadeOf(P.darkOlive, P.ink, 0.2);

  const hang = (kind: Hang, a: THREE.Vector3, b: THREE.Vector3, sag: number, draw: Rng, a1?: THREE.Vector3, b1?: THREE.Vector3): void => {
    if (kind === 'pennants') pennants(out, a, b, sag, profile.colours, draw);
    else if (kind === 'picado') picado(out, a, b, sag, profile.colours, draw);
    else if (kind === 'laundry') laundry(out, a, b, sag, draw);
    else if (kind === 'marigolds') marigolds(out, a, b, sag, draw);
    else if (kind === 'lanterns') lanterns(out, a, b, sag, profile.colours, draw);
    else if (kind === 'bulbs') bulbs(out, a, b, sag, draw);
    else if (kind === 'banner') banner(out, a, b, sag, profile.colours, draw);
    else if (a1 !== undefined && b1 !== undefined) sail(out, a, a1, b, b1, sag, profile.colours, draw);
    spans++;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  };

  // --- what is strung across the streets ---
  for (const street of streets) {
    const rng = rngFrom(site.seed, 'overhead', street.axis, street.index);
    const kind = rng.weighted(street.main ? profile.mainHangs ?? profile.hangs : profile.hangs);
    const chance = (street.main ? profile.main : profile.side) * urban * STRING_DENSITY;
    if (chance <= 0) continue;
    const spec = HANG[kind];
    /** The last pair of masts put up on this street, which the next pair strings along to. */
    let lastMasts: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number }; at: number } | null = null;
    /** The cell the last masts went up in, which the next pair keeps `MAST_EVERY` cells from. */
    let lastMastCell = -Infinity;
    for (let k = 0; k < grid.cells; k++) {
      if (out.triangles > SPAN_CAP) break;
      if (grid.avenue[k] === 1) continue;
      const slot = rngFrom(site.seed, 'overhead-slot', street.axis, street.index, k);
      const at = cellCentre(grid, k) + slot.jitter() * 0.2 * grid.pitch;
      if (floorUnder(street, cellCentre(grid, k), cellCentre(grid, k)) !== null) {
        if (street.main) cells.main++;
        else cells.side++;
      }
      const before = spans;
      const centre = Math.hypot(street.line, at) / Math.max(1, grid.half);
      if (!slot.chance(chance * (1 - 0.25 * Math.min(1, centre)))) continue;
      const cap = TOWN_CAP[kind];
      if (cap !== undefined && (counts.get(kind) ?? 0) >= cap) break;
      const skew = slot.chance(spec.diagonal) ? slot.jitter() * 0.3 * grid.pitch : 0;
      const width = kind === 'sail' ? Math.min(grid.pitch * 0.55, 6) : 0;
      let found = false;
      // Where the slot's own spot has no wall on a side, a little either way
      // along the street may: a yard is a gap in a row, not the end of it.
      for (const shift of SHIFTS) {
        if (found) break;
        const at0 = at + shift * grid.pitch - skew / 2;
        const at1 = at + shift * grid.pitch + skew / 2;
        const floor = floorUnder(street, at0 - width / 2, at1 + width / 2);
        if (floor === null) continue;
        // The lowest the ends may be: the clearance, the drop and the sag of a
        // line as wide as the street and its setbacks.
        const reachSpan = street.half * 2 + 1.5;
        const low = floor + (street.main ? OVERHEAD_CLEAR : SIDE_CLEAR) + spec.drop + spec.sag * reachSpan;
        if (!anyToward(hosts, street, at0, -1, low, low + ANCHOR_RANGE) || !anyToward(hosts, street, at1, 1, low, low + ANCHOR_RANGE)) continue;
        for (let y = low; y <= low + ANCHOR_RANGE && !found; y += ANCHOR_STEP) {
          if (kind === 'sail') {
            if (!wallAnchor(hosts, street, at0 - width / 2, y, -1, spanA)) continue;
            if (!wallAnchor(hosts, street, at0 + width / 2, y, -1, spanA1)) continue;
            if (!wallAnchor(hosts, street, at1 - width / 2, y, 1, spanB)) continue;
            if (!wallAnchor(hosts, street, at1 + width / 2, y, 1, spanB1)) continue;
          } else {
            if (!wallAnchor(hosts, street, at0, y, -1, spanA)) continue;
            if (!wallAnchor(hosts, street, at1, y + (kind === 'laundry' ? slot.range(-0.3, 0.3) : 0), 1, spanB)) {
              if (!wallAnchor(hosts, street, at1, y, 1, spanB)) continue;
            }
          }
          const sag = spec.sag * spanA.distanceTo(spanB);
          // Where it actually hangs lowest, against the clearance.
          if (Math.min(spanA.y, spanB.y) - sag - spec.drop < floor + clearUnder(street, spanA, spanB)) continue;
          if (!clearOfHosts(hosts, spanA, spanB, sag, spec.drop, street)) continue;
          if (kind === 'sail' && !clearOfHosts(hosts, spanA1, spanB1, sag, 0, street)) continue;
          hang(kind, spanA, spanB, sag, slot.fork('draw'), spanA1, spanB1);
          found = true;
        }
      }
      /**
       * **A main street of houses is too low to string over a bus from its
       * walls, so it puts up a pair of masts.** Two storeys are about seven
       * units to the ridge and the line has to clear 7.15 and its own
       * pennants, so across a main street of houses the festival brings its
       * own poles, one either side, `POLE_HEIGHT` tall, slender and dark,
       * and no more than a pair in `MAST_EVERY` cells: only where no wall
       * would take the string at all. The street lamps are no help: 4.8 to
       * 5.8 tall, a string from them would hang its pennants at a bus's
       * windows.
       */
      for (const shift of found || !street.main || !MASTED.has(kind) || k - lastMastCell < MAST_EVERY ? [] : SHIFTS) {
        const mastAt = at + shift * grid.pitch;
        const floor = floorUnder(street, mastAt, mastAt);
        if (floor === null) continue;
        // Somewhere across the pavement: at its back where no eaves or
        // balcony is over it, in its middle, or at the kerb where nobody
        // strolls.
        const walk = pavementOf(street.half);
        const offsets = [street.half - POLE_INSET, street.half - walk * 0.5, street.half - walk + POLE_INSET];
        let a: ReturnType<typeof standPole> = null;
        let b: ReturnType<typeof standPole> = null;
        for (const across of offsets) if (a === null) a = standPole(street, -across, mastAt, 0, 0);
        for (const across of offsets) if (a !== null && b === null) b = standPole(street, across, mastAt, 0, 0);
        if (a === null || b === null) continue;
        spanA.set(a.x, a.y + POLE_HEIGHT - 0.25, a.z);
        spanB.set(b.x, b.y + POLE_HEIGHT - 0.25, b.z);
        const sag = spec.sag * spanA.distanceTo(spanB);
        if (Math.min(spanA.y, spanB.y) - sag - spec.drop < floor + clearUnder(street, spanA, spanB)) continue;
        if (!clearOfHosts(hosts, spanA, spanB, sag, spec.drop)) continue;
        for (const mast of [a, b]) {
          const shaft = POLE_WIDTH * MAST_WIDTH * 0.5;
          box(out, mast.x, mast.z, 1, 0, shaft, shaft, mast.y - 0.4, mast.y + POLE_HEIGHT, mastColour);
          // A knob on top in the string's first colour.
          box(out, mast.x, mast.z, 1, 0, shaft * 1.8, shaft * 1.8, mast.y + POLE_HEIGHT, mast.y + POLE_HEIGHT + 0.18, colourOf(profile.colours[0]!));
          taken.push([mast.x, mast.z]);
          masts++;
        }
        hang(kind, spanA, spanB, sag, slot.fork('draw'));
        /**
         * And along the street from the last pair of masts, on each side,
         * where the two pairs are near enough: the festival's canopy is a
         * zigzag of strings, not a row of separate ones.
         */
        if (lastMasts !== null && Math.abs(mastAt - lastMasts.at) <= (MAST_EVERY + 0.5) * grid.pitch) {
          for (const [p, q] of [[lastMasts.a, a], [lastMasts.b, b]] as const) {
            spanA.set(p.x, p.y + POLE_HEIGHT - 0.6, p.z);
            spanB.set(q.x, q.y + POLE_HEIGHT - 0.6, q.z);
            const along = spec.sag * spanA.distanceTo(spanB);
            if (Math.min(spanA.y, spanB.y) - along - spec.drop < Math.max(p.y, q.y) + SIDE_CLEAR) continue;
            if (!clearOfHosts(hosts, spanA, spanB, along, spec.drop)) continue;
            hang(kind, spanA, spanB, along, slot.fork(`along${p === a ? 0 : 1}`));
          }
        }
        lastMasts = { a, b, at: mastAt };
        lastMastCell = k;
        break;
      }
      if (spans > before) {
        if (street.main) cells.mainHung++;
        else cells.sideHung++;
      }
    }
  }

  // --- the poles and their wires ---
  // The country's timber, weathered darker in a street; concrete a grey, not a white.
  const poleColour = profile.concrete === true ? shadeOf(P.steel, P.bone, 0.3) : POLE_COLOUR.clone().lerp(colourOf(P.ink), 0.3);
  for (const street of streets) {
    const rng = rngFrom(site.seed, 'overhead-wires', street.axis, street.index);
    if (!rng.chance(profile.wires * (street.main ? 1 : 0.35) * Math.min(1, urban))) continue;
    if (out.triangles > TRIANGLE_CAP) break;
    const side = rng.sign();
    const across = side * (street.half - POLE_INSET);
    // The arm reaches out over the street, towards its line.
    const armX = street.axis === 0 ? -side : 0;
    const armZ = street.axis === 0 ? 0 : -side;
    const step = Math.max(3, Math.round(POLE_GAP / grid.pitch));
    const standing: { x: number; y: number; z: number; at: number }[] = [];
    for (let k = rng.int(step); k < grid.cells; k += step) {
      let pole: { x: number; y: number; z: number; at: number } | null = null;
      for (const nudge of [0, 0.3, -0.3, 0.15, -0.15]) {
        pole = standPole(street, across, cellCentre(grid, k) + nudge * grid.pitch, armX, armZ);
        if (pole !== null) break;
      }
      standing.push(pole ?? { x: NaN, y: NaN, z: NaN, at: NaN });
    }
    const lines = profile.lines;
    /** Where wire `i` is tied on a pole: at the arm's end, on the pole, and further down it. */
    const tie = (pole: { x: number; y: number; z: number }, i: number, into: THREE.Vector3): THREE.Vector3 => {
      const top = pole.y + POLE_HEIGHT - 0.3;
      if (i === 0) return into.set(pole.x + armX * ARM_REACH * 0.9, top + ARM_DEPTH, pole.z + armZ * ARM_REACH * 0.9);
      if (i === 1) return into.set(pole.x + armX * POLE_WIDTH * 0.6, top + ARM_DEPTH, pole.z + armZ * POLE_WIDTH * 0.6);
      return into.set(pole.x + armX * POLE_WIDTH * 0.6, top - 0.45 * (i - 1) * M, pole.z + armZ * POLE_WIDTH * 0.6);
    };
    // The wires first, so that only a pole something is strung from stands:
    // a pole with nothing on it is a post in the pavement.
    const strung: { a: THREE.Vector3; b: THREE.Vector3; sag: number; pieces: number }[] = [];
    const wired = new Set<number>();
    // Pole to pole along the street, the neighbours only.
    for (let n = 0; n + 1 < standing.length; n++) {
      const p = standing[n]!;
      const q = standing[n + 1]!;
      if (Number.isNaN(p.x) || Number.isNaN(q.x)) continue;
      const length = Math.hypot(q.x - p.x, q.z - p.z);
      const sag = WIRE_SAG * (length / 60);
      let ok = true;
      for (let i = 0; i < lines && ok; i++) {
        tie(p, i, spanA);
        tie(q, i, spanB);
        if (!clearOfHosts(hosts, spanA, spanB, sag * (1 + 0.15 * i), 0)) ok = false;
      }
      if (!ok) continue;
      for (let i = 0; i < lines; i++) {
        strung.push({ a: tie(p, i, new THREE.Vector3()), b: tie(q, i, new THREE.Vector3()), sag: sag * (1 + 0.15 * i), pieces: 6 });
      }
      wired.add(n).add(n + 1);
    }
    // And a drop from a pole across the street to the wall on the far side.
    for (let n = 0; n < standing.length; n++) {
      const pole = standing[n]!;
      if (Number.isNaN(pole.x)) continue;
      const drop = rngFrom(site.seed, 'overhead-drop', street.axis, street.index, n);
      if (!drop.chance(0.55)) continue;
      tie(pole, 1, spanA);
      const end = spanA.y - drop.range(0.4, 1.4);
      if (!wallAnchor(hosts, street, pole.at + drop.jitter() * 1.5, end, -side, spanB)) continue;
      const sag = 0.02 * spanA.distanceTo(spanB);
      const under = floorUnder(street, pole.at, pole.at);
      if (under === null || Math.min(spanA.y, spanB.y) - sag < under + clearUnder(street, spanA, spanB)) continue;
      if (!clearOfHosts(hosts, spanA, spanB, sag, 0, street)) continue;
      strung.push({ a: spanA.clone(), b: spanB.clone(), sag, pieces: 4 });
      wired.add(n);
    }
    for (const n of wired) {
      const pole = standing[n]!;
      const half = POLE_WIDTH * TOWN_POLE * 0.5;
      box(out, pole.x, pole.z, 1, 0, half, half, pole.y - 0.4, pole.y + POLE_HEIGHT, poleColour);
      const top = pole.y + POLE_HEIGHT - 0.3;
      box(
        out, pole.x + armX * ARM_REACH * 0.5, pole.z + armZ * ARM_REACH * 0.5, armX === 0 ? 0 : 1, armX === 0 ? 1 : 0,
        ARM_REACH * 0.5 + half, ARM_DEPTH * TOWN_POLE * 0.5, top - ARM_DEPTH * 0.5, top + ARM_DEPTH * 0.5, poleColour, true,
      );
      taken.push([pole.x, pole.z]);
      poles++;
    }
    for (const wire of strung) {
      line(out, wire.a, wire.b, wire.sag, WIRE_WIDTH * 0.5, WIRE_COLOUR, wire.pieces);
      wires++;
    }
  }

  const triangles = out.triangles;
  if (triangles === 0) return null;
  let emits = false;
  const glow = Uint8Array.from(out.glow);
  for (let i = 0; i < glow.length; i += 2) {
    if (glow[i]! > 0) {
      emits = true;
      break;
    }
  }
  return {
    position: Float32Array.from(out.position),
    normal: Float32Array.from(out.normal),
    color: Float32Array.from(out.color),
    glow,
    triangles,
    emits,
    spans,
    poles,
    masts,
    wires,
    cells,
    spots: taken.flatMap(([x, z]) => [x, z, POLE_WIDTH * 0.5 + 0.5]),
  };
}
