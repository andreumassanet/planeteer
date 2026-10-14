import * as THREE from 'three';
import { glassMaterial } from '../craft/build.ts';
import type { createFader } from '../fade.ts';
import { leafDepthMaterial } from '../foliage.ts';
import { placeCrown } from '../scenery/tree-forms.ts';
import type { LeafArrays } from '../scenery/tree-forms.ts';
import type { Bay, FlatVariant } from './types.ts';

/** The meshes a near town carries beside its merged buffer, and how a town mesh leaves. */

export type LeafCard = { leaves: LeafArrays; matrix: THREE.Matrix4 };

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
export function townLeaves(cards: readonly LeafCard[], count: number, name: string, leaves: THREE.Material): THREE.Mesh {
  const position = new Float32Array(count * 3);
  const normal = new Int8Array(count * 3);
  const color = new Uint8Array(count * 3);
  const uv = new Uint16Array(count * 2);
  const wind = new Uint8Array(count * 4);
  let v = 0;
  for (const { leaves: source, matrix } of cards) {
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
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, leaves);
  mesh.name = `town-leaves:${name}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = leafDepthMaterial();
  return mesh;
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
