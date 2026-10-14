import * as THREE from 'three';
import { CREASE, weldedNormals, type Model } from './model.ts';
import type { Rig } from './rig.ts';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The attributes a bake writes beside position and normal. glTF wants a custom
 * attribute's name to start with an underscore and `GLTFLoader` lower-cases it,
 * so `outlineNormal` goes out as `_OUTLINENORMAL` and comes back as
 * `_outlinenormal`; `slot` likewise.
 */
export const BAKED_OUTLINE = '_outlinenormal';
export const BAKED_SLOT = '_slot';

/** The slot table a bake stores in a mesh's extras: `[name, sRGB hex]` pairs. */
export type SlotTable = [string, string][];

export function slotTable(model: Pick<Model, 'slots' | 'defaults'>): SlotTable {
  return model.slots.map((name, i) => [name, model.defaults[i]!.getHexString(THREE.SRGBColorSpace)]);
}

export function readSlots(mesh: THREE.Mesh, name: string): { slot: Uint8Array; slots: string[]; defaults: THREE.Color[] } {
  const geometry = mesh.geometry;
  const table = (mesh.userData.slots ?? geometry.userData.slots) as SlotTable | undefined;
  const attribute = geometry.getAttribute(BAKED_SLOT) ?? geometry.getAttribute('slot');
  const outline = geometry.getAttribute(BAKED_OUTLINE);
  if (table === undefined || attribute === undefined || outline === undefined) {
    throw new Error(`models: ${name} was not baked by scripts/build-kit.ts`);
  }
  geometry.setAttribute('outlineNormal', outline);
  geometry.deleteAttribute(BAKED_OUTLINE);
  geometry.deleteAttribute(BAKED_SLOT);
  const slot = new Uint8Array(attribute.count);
  for (let i = 0; i < attribute.count; i++) slot[i] = attribute.getX(i);
  return {
    slot,
    slots: table.map(([slotName]) => slotName),
    defaults: table.map(([, hex]) => new THREE.Color().setStyle(`#${hex}`, THREE.SRGBColorSpace)),
  };
}

/** A static model from a baked mesh: indexed, creased, with its slots. */
export function modelFromBaked(mesh: THREE.Mesh, name = mesh.name): Model {
  mesh.updateMatrixWorld(true);
  const geometry = mesh.geometry;
  if (!mesh.matrixWorld.equals(new THREE.Matrix4())) geometry.applyMatrix4(mesh.matrixWorld);
  const { slot, slots, defaults } = readSlots(mesh, name);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const count = geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
  return { name, geometry, slot, slots, defaults, box: geometry.boundingBox!.clone(), triangles: count / 3 };
}

/** A rig from a baked scene: its one skinned body, its skeleton, its clips. */
export function rigFromBaked(root: THREE.Group, clips: readonly THREE.AnimationClip[], name: string, material: THREE.Material): Rig {
  let body: THREE.SkinnedMesh | null = null;
  const farMeshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) body = object as THREE.SkinnedMesh;
    else if ((object as THREE.Mesh).isMesh && object.name.startsWith('far|')) farMeshes.push(object as THREE.Mesh);
  });
  // Out of the scene before anything clones it: a far frame is a still model,
  // not a part of the body.
  const far = farMeshes.map((mesh) => {
    mesh.removeFromParent();
    const [, clip, time] = mesh.name.split('|');
    return { clip: clip!, time: Number(time), model: modelFromBaked(mesh, mesh.name) };
  });
  if (body === null) throw new Error(`models: ${name} has no skinned body`);
  const mesh = body as THREE.SkinnedMesh;
  const { slot, slots, defaults } = readSlots(mesh, name);
  mesh.material = material;
  mesh.name = 'body';
  mesh.castShadow = true;
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(slot.length * 3), 3));
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const count = mesh.geometry.index ? mesh.geometry.index.count : slot.length;
  return { name, scene: root, body: mesh, slot, slots, defaults, box, triangles: count / 3, clips, far };
}

// A rig held still: a merged herd's animal

export const poseMatrix = new THREE.Matrix4();
export const poseSum = new THREE.Matrix4();
export const poseBone = new THREE.Matrix4();
export const poseVector = new THREE.Vector3();
export const poseNormal = new THREE.Matrix3();

/**
 * The rig's body at `time` seconds into `clip`, skinned on the CPU into a plain
 * geometry in the rig's own frame: `position`, `normal` and `outlineNormal`,
 * sharing the rig's index.
 *
 * What lets a merged herd be authored animals: a grazing herd is still, so
 * each head is one frame of the pack's own `Eating` or `Idle`, baked once per
 * species, pose and variant, and merged like anything else that does not move.
 * The animated copies near the player (`makeRigged`) play the same clips.
 */
export function posedGeometry(rig: Rig, clip: string | null, time: number): THREE.BufferGeometry {
  const scene = rig.scene;
  const body = rig.body;
  const mixer = new THREE.AnimationMixer(scene);
  const found = clip === null ? undefined : rig.clips.find((entry) => entry.name === clip);
  if (found !== undefined) {
    mixer.clipAction(found).play();
    mixer.setTime(time % found.duration);
  }
  const geometry = bakeSkin(body, scene);
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  return geometry;
}

/**
 * A skinned mesh as it stands right now, skinned on the CPU into a plain
 * geometry in `frame`'s space: `position`, `normal`, `outlineNormal`, and its
 * `color` when it has one, sharing its index.
 */
export function bakeSkin(body: THREE.SkinnedMesh, frame: THREE.Object3D): THREE.BufferGeometry {
  const scene = frame;
  scene.updateMatrixWorld(true);
  body.skeleton.update();
  const source = body.geometry;
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  const outline = source.getAttribute('outlineNormal');
  const joints = source.getAttribute('skinIndex');
  const weights = source.getAttribute('skinWeight');
  const bones = body.skeleton.boneMatrices!;
  const toRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const count = position.count;
  const outPosition = new Float32Array(count * 3);
  const outNormal = new Float32Array(count * 3);
  const outOutline = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    poseSum.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const weight = weights.getComponent(v, k);
      if (weight === 0) continue;
      poseBone.fromArray(bones, joints.getComponent(v, k) * 16);
      for (let e = 0; e < 16; e++) poseSum.elements[e]! += poseBone.elements[e]! * weight;
    }
    // World = sum(bone * inverse) * bindMatrix * v; the rig's frame is its root's.
    poseMatrix.multiplyMatrices(toRoot, poseSum).multiply(body.bindMatrix);
    poseNormal.getNormalMatrix(poseMatrix);
    poseVector.fromBufferAttribute(position, v).applyMatrix4(poseMatrix).toArray(outPosition, v * 3);
    poseVector.fromBufferAttribute(normal, v).applyMatrix3(poseNormal).normalize().toArray(outNormal, v * 3);
    poseVector.fromBufferAttribute(outline, v).applyMatrix3(poseNormal).normalize().toArray(outOutline, v * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(outPosition, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(outNormal, 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outOutline, 3));
  const color = source.getAttribute('color');
  if (color !== undefined) geometry.setAttribute('color', new THREE.BufferAttribute((color.array as Float32Array).slice(), 3));
  geometry.setIndex(source.index);
  return geometry;
}

/** Where a rig's library is asked for rigs: `null` while one is still arriving. */
export interface RigSource {
  get(id: string): Rig | null;
}

// A coarser copy: the far one

/**
 * `geometry` with its vertices clustered onto a grid fine enough to leave about
 * `triangles` triangles: every vertex moves to the mean of its cell, triangles
 * whose corners share a cell vanish, and each surviving triangle keeps the
 * colour slot it had.
 *
 * Clustering rather than three's `SimplifyModifier`: it is linear, cannot tear
 * a triangle list, and a far animal needs a silhouette rather than its
 * eyelids. Normals are recomputed creased and the ink's normals welded, as a
 * bake does.
 */
export function coarsened(
  geometry: THREE.BufferGeometry,
  slot: Uint8Array,
  triangles: number,
): { geometry: THREE.BufferGeometry; slot: Uint8Array } {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const corners = index ? index.count : position.count;
  const cornerAt = (i: number) => (index ? index.getX(i) : i);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  let best: { positions: number[]; slots: number[] } | null = null;
  // The cell is searched rather than derived: how many triangles survive a grid
  // depends on the shape. Coarser each step until the count is under the target.
  for (let cells = 64; cells >= 6; cells = Math.floor(cells * 0.85)) {
    const cell = span / cells;
    const keyOf = (i: number) =>
      `${Math.round(position.getX(i) / cell)},${Math.round(position.getY(i) / cell)},${Math.round(position.getZ(i) / cell)}`;
    const sums = new Map<string, [number, number, number, number]>();
    for (let i = 0; i < position.count; i++) {
      const key = keyOf(i);
      const sum = sums.get(key);
      if (sum === undefined) sums.set(key, [position.getX(i), position.getY(i), position.getZ(i), 1]);
      else {
        sum[0] += position.getX(i);
        sum[1] += position.getY(i);
        sum[2] += position.getZ(i);
        sum[3]++;
      }
    }
    const seen = new Set<string>();
    const positions: number[] = [];
    const slots: number[] = [];
    for (let t = 0; t + 2 < corners; t += 3) {
      const keys = [keyOf(cornerAt(t)), keyOf(cornerAt(t + 1)), keyOf(cornerAt(t + 2))];
      if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2]) continue;
      const signature = `${keys[0]}|${keys[1]}|${keys[2]}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      for (const key of keys) {
        const sum = sums.get(key)!;
        positions.push(sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]);
      }
      const s = slot[cornerAt(t)]!;
      slots.push(s, s, s);
    }
    best = { positions, slots };
    if (positions.length / 9 <= triangles) break;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(best!.positions, 3));
  out.computeVertexNormals();
  const creased = toCreasedNormals(out, CREASE);
  creased.setAttribute('outlineNormal', weldedNormals(creased));
  return { geometry: creased, slot: Uint8Array.from(best!.slots) };
}
