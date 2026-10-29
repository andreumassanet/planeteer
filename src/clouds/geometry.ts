/** The deck's meshes: the shared puff shape, instancing, bounding caps, and the haze the clouds sit in. */
import * as THREE from 'three';
import { HAZE_RADIUS } from '../globe.ts';
import { weatherHazeAt } from '../view.ts';
import { BELLY, CLOUD_BASE } from './field.ts';
import { CLOUD_ORDER } from './types.ts';

/**
 * How far into the haze a cloud is. It is not the fog the land is in: `main.ts`
 * closes the fog at about `1.35 * sqrt(2 R h)`, the distance to the land's
 * horizon (before the knob and the far sight), and a cloud 1,000 units overhead
 * is 65% of the way into it, so the whole deck would come out one flat wash.
 * Haze is a path length through air, and the path to something overhead
 * leaves the atmosphere immediately.
 *
 * So the cloud is in the same haze and colour, measured over the horizon of its
 * own sphere, `sqrt(2 R (h + CLOUD_BASE))`, times the same `spread` that opens
 * the fog as you climb. It closes with the weather's own haze (`weatherHazeAt`
 * in `view.ts`), so in a fog or a downpour the deck overhead goes into the murk
 * with the hills.
 */
export function hazeAt(
  altitude: number,
  fog: THREE.Fog,
  haze: { color: { value: THREE.Color }; near: { value: number }; far: { value: number } },
): void {
  const above = Math.max(1, altitude);
  const horizon = Math.sqrt(2 * HAZE_RADIUS * (above + CLOUD_BASE));
  const far = horizon * (1.05 + (above / HAZE_RADIUS) * 6) * weatherHazeAt(altitude);
  haze.far.value = far;
  haze.near.value = far * 0.2;
  haze.color.value.copy(fog.color);
}

/**
 * A geodesic sphere, indexed, with the faces grouped by the base face they came
 * out of and each base face's descendants in subdivision order, so a face's
 * ancestor at any level is an integer division. That is how the puffs are
 * sorted into chunks and sub-chunks with no search.
 */
export function icosphere(detail: number): {
  vertices: Float64Array;
  faces: Int32Array;
  /** Which of the 20 base faces each face descends from. */
  chunkOf: Int32Array;
} {
  const t = (1 + Math.sqrt(5)) / 2;
  const seed = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  // Wound counter-clockwise seen from outside, which is what makes a face's own
  // normal point away from the planet without anything having to check.
  const seedFaces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const count = 10 * 4 ** detail + 2;
  const vertices = new Float64Array(count * 3);
  let written = 0;
  for (const v of seed) {
    const length = Math.hypot(v[0]!, v[1]!, v[2]!);
    vertices[written * 3] = v[0]! / length;
    vertices[written * 3 + 1] = v[1]! / length;
    vertices[written * 3 + 2] = v[2]! / length;
    written++;
  }

  const midpoints = new Map<number, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? a * 1e6 + b : b * 1e6 + a;
    const found = midpoints.get(key);
    if (found !== undefined) return found;
    const x = vertices[a * 3]! + vertices[b * 3]!;
    const y = vertices[a * 3 + 1]! + vertices[b * 3 + 1]!;
    const z = vertices[a * 3 + 2]! + vertices[b * 3 + 2]!;
    const length = Math.hypot(x, y, z);
    const index = written++;
    vertices[index * 3] = x / length;
    vertices[index * 3 + 1] = y / length;
    vertices[index * 3 + 2] = z / length;
    midpoints.set(key, index);
    return index;
  };

  // Each base face is subdivided on its own so its descendants stay contiguous;
  // the midpoint cache is shared, so the seams still weld. A face's four
  // children are pushed together, so after L levels face k's descendants at
  // level L are 4^L k .. 4^L (k + 1) - 1 within the chunk.
  const perChunk = 4 ** detail;
  const faces = new Int32Array(20 * perChunk * 3);
  const chunkOf = new Int32Array(20 * perChunk);
  let out = 0;
  for (let base = 0; base < 20; base++) {
    let current = [seedFaces[base]!.slice()];
    for (let level = 0; level < detail; level++) {
      const next: number[][] = [];
      for (const [a, b, c] of current) {
        const ab = midpoint(a!, b!);
        const bc = midpoint(b!, c!);
        const ca = midpoint(c!, a!);
        next.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]);
      }
      current = next;
    }
    for (const face of current) {
      faces[out * 3] = face[0]!;
      faces[out * 3 + 1] = face[1]!;
      faces[out * 3 + 2] = face[2]!;
      chunkOf[out] = base;
      out++;
    }
  }
  return { vertices, faces, chunkOf };
}


/**
 * The puff all the others are instances of: an icosphere turned so a vertex is
 * at the top (a round crown, not a ridge), its lower half squashed to `BELLY`,
 * with the ellipsoid's smooth normals (a lobe is a gradient, not a facet).
 */
export function puffGeometry(detail: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.rotateX(-Math.atan((1 + Math.sqrt(5)) / 2));
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = new Float32Array(position.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const below = y < 0;
    // The gradient of x^2 + (y/B)^2 + z^2 at (x, B y, z) is (x, y/B, z).
    n.set(x, below ? y / BELLY : y, z).normalize();
    if (below) position.setY(i, y * BELLY);
    normals[i * 3] = n.x;
    normals[i * 3 + 1] = n.y;
    normals[i * 3 + 2] = n.z;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.deleteAttribute('uv');
  geometry.computeBoundingSphere();
  return geometry;
}

/** A puff shape with a chunk's instance attributes on it. */
export function levelOf(
  template: THREE.BufferGeometry,
  deep: THREE.InstancedBufferAttribute,
  puff: THREE.InstancedBufferAttribute,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  // The same attribute objects as the template, so the GPU holds one copy of
  // each puff shape however many chunks draw it.
  geometry.setAttribute('position', template.getAttribute('position'));
  geometry.setAttribute('normal', template.getAttribute('normal'));
  geometry.setAttribute('deep', deep);
  geometry.setAttribute('puff', puff);
  geometry.boundingSphere = template.boundingSphere!.clone();
  return geometry;
}

/** One instanced draw of a chunk. */
export function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.InstancedBufferAttribute,
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, 0);
  mesh.instanceMatrix = matrices;
  mesh.count = matrices.count;
  mesh.computeBoundingSphere();
  mesh.name = name;
  mesh.renderOrder = CLOUD_ORDER;
  mesh.visible = false;
  // It sits at the group's origin and never moves in it: the deck's turn is
  // the group's, and the world matrix is all this mesh needs each frame.
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Where a chunk's puffs are, as a cap of the deck: the direction of its middle,
 * the angle out to its furthest puff's edge, and the radii its puffs span. A
 * bounding sphere of a piece of shell cuts deep under it and puts the nearest
 * point thousands of units too close; a cap does not.
 */
export interface Cap {
  direction: THREE.Vector3;
  angle: number;
  low: number;
  high: number;
}

export function capOf(matrices: Float32Array): Cap {
  const direction = new THREE.Vector3();
  const count = matrices.length / 16;
  for (let i = 0; i < count; i++) {
    const x = matrices[i * 16 + 12]!;
    const y = matrices[i * 16 + 13]!;
    const z = matrices[i * 16 + 14]!;
    const r = Math.hypot(x, y, z);
    direction.x += x / r;
    direction.y += y / r;
    direction.z += z / r;
  }
  direction.normalize();
  let angle = 0;
  let low = Infinity;
  let high = 0;
  for (let i = 0; i < count; i++) {
    const e = i * 16;
    const x = matrices[e + 12]!;
    const y = matrices[e + 13]!;
    const z = matrices[e + 14]!;
    const r = Math.hypot(x, y, z);
    // The largest of the three scales bounds the puff whichever way it faces.
    const size = Math.max(
      Math.hypot(matrices[e]!, matrices[e + 1]!, matrices[e + 2]!),
      Math.hypot(matrices[e + 4]!, matrices[e + 5]!, matrices[e + 6]!),
      Math.hypot(matrices[e + 8]!, matrices[e + 9]!, matrices[e + 10]!),
    );
    const cos = (direction.x * x + direction.y * y + direction.z * z) / r;
    angle = Math.max(angle, Math.acos(Math.max(-1, Math.min(1, cos))) + size / r);
    low = Math.min(low, r - size);
    high = Math.max(high, r + size);
  }
  return { direction, angle, low, high };
}

/**
 * A sub-chunk: one mesh whose geometry is swapped between the three levels.
 * The three geometries share the puff shapes with every other sub-chunk and
 * the instance buffers with each other, so a swap moves no data.
 */
export interface Sub {
  mesh: THREE.InstancedMesh;
  levels: [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry];
  cap: Cap;
}

export interface Base {
  far: THREE.InstancedMesh | null;
  farCap: Cap | null;
  subs: Sub[];
  cap: Cap | null;
  split: boolean;
}

/** Puffs as they are written, before they are sorted into chunks. */
export interface Batch {
  chunk: number[];
  tier: number[];
  matrix: number[];
  deep: number[];
  shade: number[];
}

export const batch = (): Batch => ({ chunk: [], tier: [], matrix: [], deep: [], shade: [] });
