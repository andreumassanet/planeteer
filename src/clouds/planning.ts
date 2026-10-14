/** Seeding the deck with puffs: which lattice cells hold one, how big, and how each is stacked and leant. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { fbm } from '../terrain.ts';
import { BASE_FREQUENCY, BASE_SWING, BELLY, CLOUD_BASE, COVERED, CROWN_FROM, DEPTH_SPAN, DETAIL, FAR_LEAST, LEAN_HEART, LEAN_RIM, PUFF_HEART, PUFF_JITTER, PUFF_RIM, RIM_LIFT, SEED_GRID, SPACING, SUB_LEVEL, TALL_HEART, TALL_RIM, THRESHOLD, TOWER_FROM, coverageAt } from './field.ts';
import { batch, icosphere } from './geometry.ts';
import type { Batch } from './geometry.ts';

/** A deterministic [0, 1) from an integer and a salt: the jitter every client agrees on. */
function hash01(n: number, salt: number): number {
  let h = Math.imul(n ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}


const DECK = PLANET_RADIUS + CLOUD_BASE;
const POLE = new THREE.Vector3(0, 1, 0);
const SIDEWAYS = new THREE.Vector3(1, 0, 0);

/** The deck's lattice and what the field says about each cell. */
export interface DeckField {
  vertices: Float64Array;
  faces: Int32Array;
  /** Which of the 20 base faces each face descends from. */
  chunkOf: Int32Array;
  cover: Float32Array;
  floor: Float32Array;
  depthOf: Float32Array;
  kept: number[];
  cells: number;
  faceCount: number;
}

/** East and north at a direction, into the two targets. */
export function tangents(at: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3): void {
  east.crossVectors(POLE, at);
  if (east.lengthSq() < 1e-6) east.crossVectors(SIDEWAYS, at);
  east.normalize();
  north.crossVectors(at, east);
}

/** The field on the lattice: coverage and cloud floor at every vertex, and the cells kept, deepest first. */
export function sampleDeck(): DeckField {
  const { vertices, faces, chunkOf } = icosphere(DETAIL);
  const vertexCount = vertices.length / 3;
  const faceCount = faces.length / 3;

  // Everything a vertex is worth, evaluated once: a vertex is shared by six
  // faces, and six answers where the lattice needs one is a disagreement.
  const cover = new Float32Array(vertexCount);
  const floor = new Float32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const x = vertices[i * 3]!;
    const y = vertices[i * 3 + 1]!;
    const z = vertices[i * 3 + 2]!;
    cover[i] = coverageAt(x, y, z);
    floor[i] =
      CLOUD_BASE +
      (fbm(x * BASE_FREQUENCY + 61.3, y * BASE_FREQUENCY + 2.7, z * BASE_FREQUENCY - 44.1, 2) - 0.5) * BASE_SWING;
  }

  // The kept cells: the face's own coverage is the mean of its corners, as the
  // prism shell cut it. Deepest first, a little shuffled so equal depths do not
  // seed in lattice order.
  const depthOf = new Float32Array(faceCount);
  const kept: number[] = [];
  for (let f = 0; f < faceCount; f++) {
    const mean = (cover[faces[f * 3]!]! + cover[faces[f * 3 + 1]!]! + cover[faces[f * 3 + 2]!]!) / 3;
    if (mean <= THRESHOLD) continue;
    depthOf[f] = Math.min(1, (mean - THRESHOLD) / DEPTH_SPAN);
    kept.push(f);
  }
  const cells = kept.length;
  const rank = new Float32Array(faceCount);
  for (const f of kept) rank[f] = depthOf[f]! + (hash01(f, 1) - 0.5) * 0.08;
  kept.sort((a, b) => rank[b]! - rank[a]!);
  return { vertices, faces, chunkOf, cover, floor, depthOf, kept, cells, faceCount };
}

/**
 * Dart-throwing over the kept cells, deepest first: `visit` is called for
 * each cell that seeds a puff, with the puff's direction and radius. A refused
 * cell is still under a puff (see `SPACING`). `least` is the smallest radius a
 * puff may have, which is how the far level seeds fewer, bigger puffs over the
 * same cells.
 */
export function seedPuffs(deck: DeckField, least: number, visit: (f: number, direction: THREE.Vector3, a: number) => void): void {
  const { vertices, faces, depthOf, kept } = deck;
    const grid = new Map<number, number[]>();
    const cell = Math.max(SEED_GRID, least * SPACING);
    const keyOf = (gx: number, gy: number, gz: number): number => ((gx + 256) * 512 + (gy + 256)) * 512 + (gz + 256);
    const seedX: number[] = [];
    const seedY: number[] = [];
    const seedZ: number[] = [];
    const seedA: number[] = [];
    const direction = new THREE.Vector3();
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    for (const f of kept) {
      direction
        .fromArray(vertices, faces[f * 3]! * 3)
        .add(east.fromArray(vertices, faces[f * 3 + 1]! * 3))
        .add(north.fromArray(vertices, faces[f * 3 + 2]! * 3))
        .normalize();
      // A little off the lattice, inside the cell.
      tangents(direction, east, north);
      const jitter = 22 / DECK;
      direction
        .addScaledVector(east, (hash01(f, 2) - 0.5) * 2 * jitter)
        .addScaledVector(north, (hash01(f, 3) - 0.5) * 2 * jitter)
        .normalize();
      const depth = depthOf[f]!;
      const smooth = depth * depth * (3 - 2 * depth);
      const a = Math.max(
        least,
        (PUFF_RIM + (PUFF_HEART - PUFF_RIM) * smooth) * (1 + (hash01(f, 4) - 0.5) * 2 * PUFF_JITTER),
      );
      const x = direction.x * DECK;
      const y = direction.y * DECK;
      const z = direction.z * DECK;
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      const gz = Math.floor(z / cell);
      let refused = false;
      for (let dx = -1; dx <= 1 && !refused; dx++) {
        for (let dy = -1; dy <= 1 && !refused; dy++) {
          for (let dz = -1; dz <= 1 && !refused; dz++) {
            const list = grid.get(keyOf(gx + dx, gy + dy, gz + dz));
            if (list === undefined) continue;
            for (const j of list) {
              const other = seedA[j]!;
              const limit = Math.max(SPACING * Math.min(a, other), COVERED * other);
              const ex = seedX[j]! - x;
              const ey = seedY[j]! - y;
              const ez = seedZ[j]! - z;
              if (ex * ex + ey * ey + ez * ez < limit * limit) {
                refused = true;
                break;
              }
            }
          }
        }
      }
      if (refused) continue;
      const key = keyOf(gx, gy, gz);
      const list = grid.get(key);
      if (list === undefined) grid.set(key, [seedX.length]);
      else list.push(seedX.length);
      seedX.push(x);
      seedY.push(y);
      seedZ.push(z);
      seedA.push(a);
      visit(f, direction, a);
    }
}

/** The puffs of the deck, near (every tier, by sub-chunk) and far (the bottom tier only, by base chunk). */
export function planPuffs(deck: DeckField): { fine: Batch; coarse: Batch; mirrored: number } {
  const { vertices, faces, chunkOf, cover, floor, depthOf } = deck;
  let mirrored = 0;
  const matrix = new THREE.Matrix4();
  const puffUp = new THREE.Vector3();
  const puffEast = new THREE.Vector3();
  const puffNorth = new THREE.Vector3();
  const axisX = new THREE.Vector3();
  const axisY = new THREE.Vector3();
  const axisZ = new THREE.Vector3();
  const writePuff = (
    into: Batch,
    chunk: number,
    tier: number,
    at: THREE.Vector3,
    a: number,
    b: number,
    stretch: number,
    yaw: number,
    depth: number,
    lean: THREE.Vector3,
    lift: number,
  ): void => {
    puffUp.copy(at).normalize();
    tangents(puffUp, puffEast, puffNorth);
    axisX.copy(puffEast).multiplyScalar(Math.cos(yaw)).addScaledVector(puffNorth, Math.sin(yaw));
    // x cross y = z, so the basis is a rotation and the determinant is the
    // product of the scales.
    axisZ.crossVectors(axisX, puffUp);
    const leanX = lean.dot(axisX);
    const leanZ = lean.dot(axisZ);
    matrix.makeBasis(
      axisX.multiplyScalar(a),
      axisY.copy(puffUp).multiplyScalar(b),
      axisZ.multiplyScalar(a * stretch),
    );
    matrix.setPosition(at);
    if (matrix.determinant() <= 0) mirrored++;
    into.chunk.push(chunk);
    into.tier.push(tier);
    for (let k = 0; k < 16; k++) into.matrix.push(matrix.elements[k]!);
    into.deep.push(Math.round(depth * 255));
    // The lean in the puff's own frame, pre-scaled so that after the normal
    // matrix's inverse scale it is the world slope it was measured as.
    into.shade.push(leanX * (a / b), leanZ * ((a * stretch) / b), lift);
  };

  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const gradient = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lean = new THREE.Vector3();
  /** Which way the bank thins at a cell: down the coverage's gradient, linear on the triangle. */
  const leanOf = (f: number, up: THREE.Vector3, depth: number): THREE.Vector3 => {
    const ia = faces[f * 3]!;
    const ib = faces[f * 3 + 1]!;
    const ic = faces[f * 3 + 2]!;
    pa.fromArray(vertices, ia * 3);
    pb.fromArray(vertices, ib * 3);
    pc.fromArray(vertices, ic * 3);
    normal.subVectors(pb, pa).cross(side.subVectors(pc, pa)).normalize();
    // The gradient of a barycentric coordinate is the opposite edge turned a
    // quarter inward, over twice the area; the area is common and drops out.
    gradient.set(0, 0, 0);
    gradient.addScaledVector(side.subVectors(pc, pb).applyAxisAngle(normal, Math.PI / 2), cover[ia]!);
    gradient.addScaledVector(side.subVectors(pa, pc).applyAxisAngle(normal, Math.PI / 2), cover[ib]!);
    gradient.addScaledVector(side.subVectors(pb, pa).applyAxisAngle(normal, Math.PI / 2), cover[ic]!);
    gradient.addScaledVector(up, -gradient.dot(up));
    const slope = gradient.length();
    if (slope > 1e-9) lean.copy(gradient).multiplyScalar(-(LEAN_RIM + (LEAN_HEART - LEAN_RIM) * depth) / slope);
    else lean.set(0, 0, 0);
    return lean;
  };
  const floorAt = (f: number, depth: number): number =>
    (floor[faces[f * 3]!]! + floor[faces[f * 3 + 1]!]! + floor[faces[f * 3 + 2]!]!) / 3 + RIM_LIFT * (1 - depth);

  const subsPerBase = 4 ** SUB_LEVEL;
  const perBase = 4 ** DETAIL;
  const perSub = 4 ** (DETAIL - SUB_LEVEL);
  const centre = new THREE.Vector3();
  const heart = new THREE.Vector3();
  const across = new THREE.Vector3();

  // The deck as it is seen near: every tier, by sub-chunk.
  const fine = batch();
  seedPuffs(deck, 0, (f, up, a) => {
    const depth = depthOf[f]!;
    const smooth = depth * depth * (3 - 2 * depth);
    const leaning = leanOf(f, up, depth);
    const sub = chunkOf[f]! * subsPerBase + Math.floor((f - chunkOf[f]! * perBase) / perSub);
    const yaw = hash01(f, 5) * Math.PI * 2;
    const stretch = 1 + hash01(f, 6) * 0.3;

    // The bottom tier: its belly on the bank's floor.
    const b = a * (TALL_RIM + (TALL_HEART - TALL_RIM) * smooth);
    centre.copy(up).multiplyScalar(PLANET_RADIUS + floorAt(f, depth) + BELLY * b);
    writePuff(fine, sub, 0, centre, a, b, stretch, yaw, depth, leaning, 0);

    // The crown and the tower, each on the one below and leant toward the
    // bank's heart, so a heap climbs toward the middle.
    tangents(up, across, heart);
    if (leaning.lengthSq() > 0) heart.copy(leaning).normalize().negate();
    across.crossVectors(up, heart);
    let reach = a;
    let height = b;
    for (const [tier, from, shrink] of [
      [1, CROWN_FROM, 0.68],
      [2, TOWER_FROM, 0.7],
    ] as const) {
      if (depth <= from) break;
      const grow = (depth - from) / (1 - from);
      const a2 = reach * shrink * (0.8 + 0.2 * grow);
      const b2 = a2 * TALL_HEART;
      centre
        .addScaledVector(up, height * (0.55 + 0.15 * grow))
        .addScaledVector(heart, reach * 0.25)
        .addScaledVector(across, (hash01(f, 7 + tier) - 0.5) * reach * 0.3);
      writePuff(fine, sub, tier, centre, a2, b2, stretch, yaw + tier * 2.1, depth, leaning, tier / 2);
      reach = a2;
      height = b2;
    }
  });

  // The deck as it is seen from far off: fewer, bigger puffs over the same
  // cells, the bottom tier only, by base chunk. See `FAR_LEAST`.
  const coarse = batch();
  seedPuffs(deck, FAR_LEAST, (f, up, a) => {
    const depth = depthOf[f]!;
    const smooth = depth * depth * (3 - 2 * depth);
    const b = a * (TALL_RIM + (TALL_HEART - TALL_RIM) * smooth);
    centre.copy(up).multiplyScalar(PLANET_RADIUS + floorAt(f, depth) + BELLY * b);
    const leaning = leanOf(f, up, depth);
    writePuff(coarse, chunkOf[f]!, 0, centre, a, b, 1 + hash01(f, 6) * 0.3, hash01(f, 5) * Math.PI * 2, depth, leaning, 0);
  });
  return { fine, coarse, mirrored };
}
