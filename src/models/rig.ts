import * as THREE from 'three';
import { CREASE, paintColors, weldedNormals, type Model, type Paint } from './model.ts';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** A skinned pack model merged into one skinned mesh, ready to clone and paint. */
export interface Rig {
  name: string;
  /** The pack's scene with the merged body in it, bind pose. */
  scene: THREE.Group;
  body: THREE.SkinnedMesh;
  slot: Uint8Array;
  slots: readonly string[];
  defaults: readonly THREE.Color[];
  /** Bind-pose bounds, in the pack's units. */
  box: THREE.Box3;
  triangles: number;
  clips: readonly THREE.AnimationClip[];
  /**
   * Still frames of the rig, coarsened, for a merged herd far off: which clip,
   * how many seconds in, and the model. Written by the bake (`farFrames` in
   * `scripts/build-kit.ts`); empty on a rig that was not baked.
   */
  far: readonly { clip: string; time: number; model: Model }[];
}

export interface Rigged {
  /** Feet on y = 0 as authored; owns nothing but the scene. */
  root: THREE.Group;
  body: THREE.SkinnedMesh;
  mixer: THREE.AnimationMixer;
  actions: ReadonlyMap<string, THREE.AnimationAction>;
}

/**
 * Merges every skinned part under `root` into one skinned mesh on their shared
 * skeleton: creased normals, a welded `outlineNormal`, a slot a material.
 * Unskinned meshes are dropped — nothing loose belongs to a body.
 */
export function rigFrom(root: THREE.Group, clips: readonly THREE.AnimationClip[], name: string, material: THREE.Material): Rig {
  const parts: THREE.SkinnedMesh[] = [];
  const loose: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) parts.push(object as THREE.SkinnedMesh);
    else if ((object as THREE.Mesh).isMesh) loose.push(object as THREE.Mesh);
  });
  if (parts.length === 0) throw new Error(`models: ${name} has no skinned mesh`);
  const skeleton = parts[0]!.skeleton;
  // A rigid piece is carried into the body at the bind pose. The scene's own
  // pose is put back afterwards: an FBX rig's inverse bind matrices do not
  // always describe the pose it was exported in, and posing it from them
  // stretched the Farm Animals to three times their height.
  const rest = skeleton.bones.map((bone) => [bone.position.clone(), bone.quaternion.clone(), bone.scale.clone()] as const);
  const attached = loose.some((mesh) => {
    let up: THREE.Object3D | null = mesh.parent;
    while (up !== null && !(up as THREE.Bone).isBone) up = up.parent;
    return up !== null;
  });
  if (attached) skeleton.pose();
  root.updateMatrixWorld(true);
  const bodyWorld = parts[0]!.matrixWorld.clone();
  const toBody = bodyWorld.clone().invert();
  const slots: string[] = [];
  const defaults: THREE.Color[] = [];
  const slotOf = (key: string, color: THREE.Color): number => {
    let index = slots.indexOf(key);
    if (index < 0) {
      index = slots.length;
      slots.push(key);
      defaults.push(color.clone());
    }
    return index;
  };
  const geometries: THREE.BufferGeometry[] = [];
  const vertexSlots: number[] = [];
  const take = (source: THREE.BufferGeometry, materials: THREE.Material[]): void => {
    const groups = source.groups.length > 0 ? source.groups : [{ start: 0, count: source.index?.count ?? source.getAttribute('position').count, materialIndex: 0 }];
    const creased = toCreasedNormals(source, CREASE);
    for (const group of groups) {
      const own = (materials[group.materialIndex ?? 0] ?? materials[0]) as THREE.MeshStandardMaterial;
      const slot = slotOf(own.name || 'material', own.color ?? new THREE.Color(1, 1, 1));
      for (let v = 0; v < group.count; v++) vertexSlots.push(slot);
    }
    geometries.push(creased);
  };
  for (const part of parts) {
    if (part.skeleton !== skeleton) throw new Error(`models: ${name} is on two skeletons`);
    if (!part.bindMatrix.equals(parts[0]!.bindMatrix)) throw new Error(`models: ${name} has parts with different bind matrices`);
    const source = part.geometry.clone();
    for (const attribute of Object.keys(source.attributes)) {
      if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(attribute)) source.deleteAttribute(attribute);
    }
    take(source, Array.isArray(part.material) ? part.material : [part.material]);
  }
  // A rigid piece hung off a bone — a stag's antlers on its head — becomes part
  // of the body, weighted wholly to that bone. Anything not under a bone is a
  // prop and is dropped: nothing loose belongs to a body.
  for (const mesh of loose) {
    let bone: THREE.Object3D | null = mesh.parent;
    while (bone !== null && !(bone as THREE.Bone).isBone) bone = bone.parent;
    const index = bone === null ? -1 : skeleton.bones.indexOf(bone as THREE.Bone);
    if (index >= 0) {
      const source = mesh.geometry.clone();
      for (const attribute of Object.keys(source.attributes)) {
        if (!['position', 'normal'].includes(attribute)) source.deleteAttribute(attribute);
      }
      const matrix = toBody.clone().multiply(mesh.matrixWorld);
      if (matrix.determinant() <= 0) throw new Error(`models: ${name} has a reflected piece on ${bone!.name}`);
      source.applyMatrix4(matrix);
      const count = source.getAttribute('position').count;
      const joints = new Uint16Array(count * 4);
      const weights = new Float32Array(count * 4);
      for (let v = 0; v < count; v++) {
        joints[v * 4] = index;
        weights[v * 4] = 1;
      }
      source.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
      source.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
      take(source, Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
    }
    mesh.removeFromParent();
  }
  // Merging needs one attribute layout; a rig's own skin indices may be 8-bit.
  for (const geometry of geometries) {
    const joints = geometry.getAttribute('skinIndex');
    if (!(joints.array instanceof Uint16Array)) {
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(joints.array as ArrayLike<number>), 4));
    }
    const weights = geometry.getAttribute('skinWeight');
    if (!(weights.array instanceof Float32Array) || weights.normalized) {
      const out = new Float32Array(weights.count * 4);
      for (let i = 0; i < weights.count; i++) for (let k = 0; k < 4; k++) out[i * 4 + k] = weights.getComponent(i, k);
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out, 4));
    }
  }
  skeleton.bones.forEach((bone, i) => {
    bone.position.copy(rest[i]![0]);
    bone.quaternion.copy(rest[i]![1]);
    bone.scale.copy(rest[i]![2]);
  });
  const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false);
  if (merged === null) throw new Error(`models: ${name} has parts that cannot merge`);
  merged.setAttribute('outlineNormal', weldedNormals(merged));
  const slot = Uint8Array.from(vertexSlots);
  if (slot.length !== merged.getAttribute('position').count) throw new Error(`models: ${name} slots do not cover the mesh`);
  merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(slot.length * 3), 3));
  const body = new THREE.SkinnedMesh(merged, material);
  body.name = 'body';
  parts[0]!.parent!.add(body);
  body.position.copy(parts[0]!.position);
  body.quaternion.copy(parts[0]!.quaternion);
  body.scale.copy(parts[0]!.scale);
  body.bind(skeleton, parts[0]!.bindMatrix);
  for (const part of parts) part.removeFromParent();
  body.castShadow = true;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  return { name, scene: root, body, slot, slots, defaults, box, triangles: slot.length / 3, clips, far: [] };
}

/** A painted, independently animated copy of a rig. */
export function makeRigged(rig: Rig, paint: Paint = () => null): Rigged {
  const scene = cloneSkinned(rig.scene) as THREE.Group;
  let body: THREE.SkinnedMesh | null = null;
  scene.traverse((object) => {
    if (object.name === 'body' && (object as THREE.SkinnedMesh).isSkinnedMesh) body = object as THREE.SkinnedMesh;
  });
  if (body === null) throw new Error(`models: the clone of ${rig.name} lost its body`);
  const mesh = body as THREE.SkinnedMesh;
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'outlineNormal', 'skinIndex', 'skinWeight']) {
    geometry.setAttribute(name, rig.body.geometry.getAttribute(name));
  }
  geometry.setIndex(rig.body.geometry.index);
  const model = { slot: rig.slot, slots: rig.slots, defaults: rig.defaults } as Pick<Model, 'slot' | 'slots' | 'defaults'>;
  geometry.setAttribute('color', new THREE.BufferAttribute(paintColors(model as Model, paint), 3));
  mesh.geometry = geometry;
  const size = rig.box.getSize(new THREE.Vector3());
  const centre = rig.box.getCenter(new THREE.Vector3());
  mesh.boundingSphere = new THREE.Sphere(centre, size.length() * 0.75);
  mesh.frustumCulled = true;
  const root = new THREE.Group();
  root.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of rig.clips) actions.set(clip.name, mixer.clipAction(clip));
  return { root, body: mesh, mixer, actions };
}
