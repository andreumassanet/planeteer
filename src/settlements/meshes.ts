import * as THREE from 'three';
import { glassMaterial } from '../craft/build.ts';
import type { createFader } from '../fade.ts';
import { leafDepthMaterial } from '../foliage.ts';
import { placeCrown } from '../scenery/tree-forms.ts';
import type { LeafArrays } from '../scenery/tree-forms.ts';
import type { Bay, FlatVariant } from './types.ts';

/** The meshes a near town carries beside its merged buffer, and how a town mesh leaves. */

/** A near tree's cards and where they stand; `first` and `count` are its run in the leaves' mesh once merged. */
export type LeafCard = { leaves: LeafArrays; matrix: THREE.Matrix4; first?: number; count?: number };

/**
 * The near towns whose trees shed, each with its crowns in the world on
 * `userData.crowns`, `CROWN_STRIDE` floats a crown: what `ambient.ts` lays
 * fallen leaves from, from the frame a town is raised to the frame it retires.
 */
export function createCrowns(): {
  readonly crowned: Set<THREE.Mesh>;
  townCrowns(mesh: THREE.Mesh, cards: readonly LeafCard[]): void;
} {
  const crowned = new Set<THREE.Mesh>();
  const crownList: number[] = [];
  const crownMatrix = new THREE.Matrix4();
  return {
    crowned,
    townCrowns(mesh, cards) {
      mesh.updateMatrix();
      crownList.length = 0;
      for (const { leaves: source, matrix } of cards) placeCrown(source, crownMatrix.multiplyMatrices(mesh.matrix, matrix), crownList);
      if (crownList.length === 0) return;
      mesh.userData.crowns = Float32Array.from(crownList);
      crowned.add(mesh);
    },
  };
}

/**
 * Every parked vehicle's see-through glass in a town, as one mesh in the
 * town's frame in the craft's glass material, each bay's run recorded on it
 * (`Bay.glassStart`) so `hideParked` folds it with the car. Null for a town
 * with no glazed bay. No ink: a pane has none.
 */
export function townGlass(standing: readonly { flat: FlatVariant; matrix: THREE.Matrix4; bay?: Bay }[], name: string): THREE.Mesh | null {
  let count = 0;
  for (const item of standing) if (item.bay !== undefined && item.flat.glass !== undefined) count += item.flat.glass.position.length / 3;
  if (count === 0) return null;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const at = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let v = 0;
  for (const item of standing) {
    const glass = item.flat.glass;
    if (item.bay === undefined || glass === undefined) continue;
    normalMatrix.getNormalMatrix(item.matrix);
    item.bay.glassStart = v;
    item.bay.glassCount = glass.position.length / 3;
    for (let i = 0; i < glass.position.length; i += 3, v++) {
      at.fromArray(glass.position, i).applyMatrix4(item.matrix).toArray(position, v * 3);
      at.fromArray(glass.normal, i).applyMatrix3(normalMatrix).normalize().toArray(normal, v * 3);
    }
    color.set(glass.color, item.bay.glassStart * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, glassMaterial());
  mesh.name = `town-glass:${name}`;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A near town's leaf cards as one mesh in the town's frame: position, normal,
 * colour, atlas place, and the wind's four bytes with no bend in them (the
 * wood they hang on is still). 26 bytes a vertex.
 */
export function* townLeavesSteps(cards: readonly LeafCard[], count: number, name: string, leaves: THREE.Material): Generator<void, THREE.Mesh, void> {
  const position = new Float32Array(count * 3);
  const normal = new Int8Array(count * 3);
  const color = new Uint8Array(count * 3);
  const uv = new Uint16Array(count * 2);
  const wind = new Uint8Array(count * 4);
  let v = 0;
  let sliced = 0;
  for (const card of cards) {
    const { leaves: source, matrix } = card;
    if (v - sliced >= MESH_SLICE) {
      sliced = v;
      yield;
    }
    card.first = v;
    card.count = source.position.length / 3;
    const e = matrix.elements;
    const scale = Math.hypot(e[0]!, e[1]!, e[2]!);
    const inverse = scale === 0 ? 0 : 1 / scale;
    const phase = Math.round(((((e[12]! * 0.1373 + e[14]! * 0.3117) % 1) + 1) % 1) * 255);
    for (let i = 0; i < source.position.length; i += 3, v++) {
      const x = source.position[i]!;
      const y = source.position[i + 1]!;
      const z = source.position[i + 2]!;
      position[v * 3] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
      position[v * 3 + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
      position[v * 3 + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
      const nx = source.normal[i]!;
      const ny = source.normal[i + 1]!;
      const nz = source.normal[i + 2]!;
      normal[v * 3] = Math.round((e[0]! * nx + e[4]! * ny + e[8]! * nz) * inverse * 127);
      normal[v * 3 + 1] = Math.round((e[1]! * nx + e[5]! * ny + e[9]! * nz) * inverse * 127);
      normal[v * 3 + 2] = Math.round((e[2]! * nx + e[6]! * ny + e[10]! * nz) * inverse * 127);
      for (let c = 0; c < 3; c++) color[v * 3 + c] = Math.round(Math.min(1, Math.max(0, source.color[i + c]!)) * 255);
      const w = i / 3;
      uv[v * 2] = Math.round(source.uv[w * 2]! * 65535);
      uv[v * 2 + 1] = Math.round(source.uv[w * 2 + 1]! * 65535);
      wind[v * 4 + 1] = phase;
      wind[v * 4 + 2] = Math.round(Math.min(1, Math.max(0, source.leaf[w * 2]!)) * 255);
      wind[v * 4 + 3] = Math.round(Math.min(1, Math.max(0, source.leaf[w * 2 + 1]!)) * 255);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2, true));
  geometry.setAttribute('aWind', new THREE.BufferAttribute(wind, 4, true));
  yield* boundingSteps(geometry);
  const mesh = new THREE.Mesh(geometry, leaves);
  mesh.name = `town-leaves:${name}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = leafDepthMaterial();
  return mesh;
}

/** How many vertices a town's mesh is written or measured over between two steps. */
const MESH_SLICE = 20_000;

/**
 * A geometry's bounding sphere as `computeBoundingSphere` makes it (the box's
 * centre, the farthest vertex from it), a slice of the vertices a step.
 */
export function* boundingSteps(geometry: THREE.BufferGeometry): Generator<void, void, void> {
  const array = (geometry.getAttribute('position') as THREE.BufferAttribute).array as ArrayLike<number>;
  const box = new THREE.Box3();
  const at = new THREE.Vector3();
  for (let from = 0; from < array.length; from += MESH_SLICE * 3) {
    if (from > 0) yield;
    const to = Math.min(array.length, from + MESH_SLICE * 3);
    for (let i = from; i < to; i += 3) box.expandByPoint(at.set(array[i]!, array[i + 1]!, array[i + 2]!));
  }
  const centre = box.getCenter(new THREE.Vector3());
  let farthest = 0;
  for (let from = 0; from < array.length; from += MESH_SLICE * 3) {
    yield;
    const to = Math.min(array.length, from + MESH_SLICE * 3);
    for (let i = from; i < to; i += 3) farthest = Math.max(farthest, centre.distanceToSquared(at.set(array[i]!, array[i + 1]!, array[i + 2]!)));
  }
  geometry.boundingSphere = new THREE.Sphere(centre, Math.sqrt(farthest));
}

/**
 * Takes a town mesh out of the world: dissolved away, or at once when
 * `instant` (for `survey` and `compare`). The geometry is the town's own; the
 * material is shared by every town and is never disposed. Its leaves and glass
 * go with it on the same clock.
 */
export function retireMesh(
  group: THREE.Group, fader: ReturnType<typeof createFader>, crowned: Set<THREE.Mesh>,
  mesh: THREE.Mesh, instant: boolean,
): void {
  const gone = (): void => {
    group.remove(mesh);
    mesh.geometry.dispose();
  };
  crowned.delete(mesh);
  for (const child of [mesh.userData.leaves, mesh.userData.glass] as (THREE.Mesh | undefined)[]) {
    if (child === undefined) continue;
    if (instant) {
      fader.cancel(child);
      child.geometry.dispose();
    } else fader.out(child, () => child.geometry.dispose());
  }
  if (instant) {
    fader.cancel(mesh);
    gone();
  } else fader.out(mesh, gone);
}
