// The water sphere: an icosphere at `PLANET_RADIUS` carrying what varies over
// thousands of units (sea temperature, the depth ramp, the basins). It is smooth,
// coarse and cheap; everything that has to line up with a coast is in the
// shallows ribbon, because the sphere cannot resolve a coast at all.

import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { latOf, lonOf } from '../sphere.ts';
import { MOSAIC_WATER, createToonRamp } from '../theme.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import { ABYSS, OCEAN_DETAIL } from './constants.ts';
import { addGlint, addSeaWindow, paintSea } from './shaders.ts';
import { clamp, waterColor } from './water-colour.ts';

/** Outline width for the water sphere: the planet's limb against the sky. The shallows get no ink. */
const OUTLINE_THICKNESS = 0.005;

/** A stable hash per face, so a face keeps its tone across builds. */
function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** The icosphere's vertices deduplicated: the sphere is non-indexed, so each vertex arrives five or six times. */
interface Places {
  /** For each of the geometry's vertices, the place it is. */
  index: Int32Array;
  /** Unit vectors of the places, flattened. */
  unique: number[];
  count: number;
}

function dedupe(geometry: THREE.BufferGeometry): Places {
  const position = geometry.getAttribute('position');
  const count = position.count;
  const index = new Int32Array(count);
  const unique: number[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const x = position.getX(i) / PLANET_RADIUS;
    const y = position.getY(i) / PLANET_RADIUS;
    const z = position.getZ(i) / PLANET_RADIUS;
    const key = `${Math.round(x * 4e5)},${Math.round(y * 4e5)},${Math.round(z * 4e5)}`;
    let at = seen.get(key);
    if (at === undefined) {
      at = unique.length / 3;
      seen.set(key, at);
      unique.push(x, y, z);
    }
    index[i] = at;
  }
  return { index, unique, count: unique.length / 3 };
}

/** A binary min-heap of (distance, place) pairs, stored flat. */
function createHeap(): {
  size: () => number;
  push: (value: number, at: number) => void;
  pop: () => [number, number];
} {
  const heap: number[] = [];
  const push = (value: number, at: number): void => {
    heap.push(value, at);
    let i = heap.length / 2 - 1;
    while (i > 0) {
      const parent = ((i - 1) >> 1);
      if (heap[parent * 2]! <= heap[i * 2]!) break;
      const dv = heap[i * 2]!, di = heap[i * 2 + 1]!;
      heap[i * 2] = heap[parent * 2]!; heap[i * 2 + 1] = heap[parent * 2 + 1]!;
      heap[parent * 2] = dv; heap[parent * 2 + 1] = di;
      i = parent;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0]!, heap[1]!];
    const size = heap.length / 2 - 1;
    heap[0] = heap[size * 2]!; heap[1] = heap[size * 2 + 1]!;
    heap.length = size * 2;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = i * 2 + 2;
      let small = i;
      if (l < size && heap[l * 2]! < heap[small * 2]!) small = l;
      if (r < size && heap[r * 2]! < heap[small * 2]!) small = r;
      if (small === i) break;
      const dv = heap[i * 2]!, di = heap[i * 2 + 1]!;
      heap[i * 2] = heap[small * 2]!; heap[i * 2 + 1] = heap[small * 2 + 1]!;
      heap[small * 2] = dv; heap[small * 2 + 1] = di;
      i = small;
    }
    return top;
  };
  return { size: () => heap.length / 2, push, pop };
}

/**
 * How far each place is from the nearest land, along the sphere's own edges.
 *
 * `terrain.ts`'s two distance fields do not answer this: the coarse one is zero
 * everywhere at sea and the fine shore index stops at the shore ramp. So it is a
 * multi-source Dijkstra over the sphere's vertex graph, seeded at every vertex
 * the outlines call land. The resolution is exactly that of the thing coloured,
 * there is no grid to alias against a coast, and it costs one `countryAt` per
 * place. It carries half a spacing of error near a coast, which does not matter:
 * the ribbon draws the first 430 units from the outlines themselves.
 */
function distanceFromLand(
  world: World,
  places: Places,
  vertexCount: number,
): { distance: Float64Array; wet: number; deepest: number } {
  const { index, unique, count: n } = places;
  const distance = new Float64Array(n).fill(Infinity);
  let wet = 0;
  for (let p = 0; p < n; p++) {
    const x = unique[p * 3]!;
    const y = unique[p * 3 + 1]!;
    const z = unique[p * 3 + 2]!;
    const lat = latOf(y);
    const lon = lonOf(x, z);
    if (world.countryAt(lat, lon) !== 0) distance[p] = 0;
    else wet++;
  }

  // Adjacency from the triangles, both ways, deduplicated per vertex.
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < vertexCount; t += 3) {
    const a = index[t]!;
    const b = index[t + 1]!;
    const c = index[t + 2]!;
    for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      if (!neighbours[u]!.includes(v)) neighbours[u]!.push(v);
      if (!neighbours[v]!.includes(u)) neighbours[v]!.push(u);
    }
  }

  const heap = createHeap();
  for (let p = 0; p < n; p++) if (distance[p] === 0) heap.push(0, p);
  let deepest = 0;
  while (heap.size() > 0) {
    const [d, p] = heap.pop();
    if (d > distance[p]!) continue;
    if (d > deepest) deepest = d;
    // Nothing past the ramp needs an accurate answer; stopping there keeps this
    // linear in the ocean rather than in the planet.
    if (d >= ABYSS) continue;
    const ax = unique[p * 3]!, ay = unique[p * 3 + 1]!, az = unique[p * 3 + 2]!;
    for (const q of neighbours[p]!) {
      const step = Math.hypot(unique[q * 3]! - ax, unique[q * 3 + 1]! - ay, unique[q * 3 + 2]! - az) * PLANET_RADIUS;
      const next = d + step;
      if (next < distance[q]!) {
        distance[q] = next;
        heap.push(next, q);
      }
    }
  }
  return { distance, wet, deepest };
}

/** The water sphere and what the build learned about it. */
export interface WaterSphere {
  mesh: THREE.Mesh;
  /** Places the outlines call sea. */
  wet: number;
  /** The furthest any place is from land. */
  deepest: number;
  medianDepth: number;
  /** Mean colour over the wet places. */
  mean: [number, number, number];
}

export function buildWater(world: World): WaterSphere {
  const geometry = new THREE.IcosahedronGeometry(PLANET_RADIUS, OCEAN_DETAIL);
  const places = dedupe(geometry);
  const { index, unique } = places;
  const vertexCount = geometry.getAttribute('position').count;
  const { distance, wet, deepest } = distanceFromLand(world, places, vertexCount);

  const colors = new Uint8Array(vertexCount * 3);
  const color = new THREE.Color();
  const placeColor = new Uint8Array(places.count * 3);
  // The mean is over the wet places only: 29% of the sphere is under the land
  // mesh at distance zero, painted the brightest shoal, and would report a sea
  // a third paler than the one anybody can see.
  const mean: [number, number, number] = [0, 0, 0];
  const depths: number[] = [];
  for (let p = 0; p < places.count; p++) {
    const x = unique[p * 3]!, y = unique[p * 3 + 1]!, z = unique[p * 3 + 2]!;
    const depth = Math.min(distance[p]!, ABYSS);
    waterColor(x, y, z, depth, color);
    placeColor[p * 3] = Math.round(clamp(color.r, 0, 1) * 255);
    placeColor[p * 3 + 1] = Math.round(clamp(color.g, 0, 1) * 255);
    placeColor[p * 3 + 2] = Math.round(clamp(color.b, 0, 1) * 255);
    if (distance[p]! > 0) {
      mean[0] += color.r; mean[1] += color.g; mean[2] += color.b;
      depths.push(depth);
    }
  }
  const wetCount = Math.max(1, depths.length);
  mean[0] /= wetCount;
  mean[1] /= wetCount;
  mean[2] /= wetCount;
  depths.sort((a, b) => a - b);
  // The mosaic: every face a few percent off its neighbours. Per face rather
  // than per place, since a place is shared by six faces and a factor on it
  // would blur into a gradient. One multiplier on all channels keeps the hue.
  // Only the sphere: on the shallows a jitter would read as dirt in the surf.
  const [waterLow, waterHigh] = MOSAIC_WATER;
  for (let i = 0; i < vertexCount; i++) {
    const p = index[i]!;
    const tone = waterLow + (waterHigh - waterLow) * hash((i / 3) | 0, 7);
    colors[i * 3] = Math.min(255, Math.round(placeColor[p * 3]! * tone));
    colors[i * 3 + 1] = Math.min(255, Math.round(placeColor[p * 3 + 1]! * tone));
    colors[i * 3 + 2] = Math.min(255, Math.round(placeColor[p * 3 + 2]! * tone));
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
  // Nothing samples a map on this, and the UVs are a third of its buffer.
  geometry.deleteAttribute('uv');

  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  material.userData.outlineParameters = { thickness: OUTLINE_THICKNESS, color: [0.11, 0.02, 0.01] };
  addGlint(material);
  paintSea(material);
  addSeaWindow(material, 'hide');
  shadeByClouds(material);
  const mesh = new THREE.Mesh(geometry, material);
  // `atlas.scene.getObjectByName('ocean')` is "sea level".
  mesh.name = 'ocean';
  // A cliff's shadow falls on the water. Receives, never casts.
  mesh.receiveShadow = true;
  return { mesh, wet, deepest, medianDepth: Math.round(depths[depths.length >> 1] ?? 0), mean };
}
