/**
 * Clips the cast's pack does not have, retargeted onto its rig from
 * Quaternius's Universal Animation Library (CC0 1.0, https://quaternius.com,
 * "Universal Animation Library [Standard]", `Unreal-Godot/UAL1_Standard.glb`,
 * downloaded to ../.cache/assets/quaternius/). Called by `build-cast.mjs`.
 *
 * **Two rigs, one motion.** The library animates a 65-bone skeleton named the
 * Unreal way (`pelvis`, `spine_01`, `thigh_l`) standing in a T-pose; the cast is
 * Quaternius's modular characters, 62 bones named their own way (`Hips`,
 * `Abdomen`, `UpperLeg.L`) bound in a pose of their own, with its feet as IK
 * controls hung off the root rather than off the shins. So nothing can be
 * copied: each mapped bone takes the source bone's **world rotation relative to
 * its own bind pose** and applies that change to the target bone's bind pose,
 *
 *     target world = (source world * source bind world^-1) * target bind world,
 *
 * then goes back to local under a parent already solved the same way. Both rigs
 * face +Z with their left at +X, so no turn is needed between them. The pelvis
 * moves by the source pelvis's displacement scaled by the ratio of the two hip
 * heights, and each foot, having no parent in the leg, is put where its shin
 * now ends (the ankle measured in the shin's own frame at bind, as `limbsOf`
 * measures it) and turned by its source foot's change. Fingers, the root and
 * the pole targets keep their bind pose.
 *
 * **The cast's thighs are not children of its hips.** `Body`, under the root,
 * carries both `Hips` (and the spine above it) and the two `UpperLeg`s, and
 * the pack's own clips move the pelvis by moving `Body`. So the displacement
 * goes onto `Body`, held at its bind rotation, and `Hips` only turns. Until
 * 2026-09-24 it went onto `Hips`, which carried the torso away from legs that
 * stayed where they were bound: invisible in the jump, whose pelvis moves a
 * few centimetres, a body cut in two in any clip whose pelvis travels — the
 * landing's crouch, and the swim, which lies the whole body on the water.
 * And `Body` is keyed at its bind rotation rather than left unkeyed: its
 * node's own rest is turned 27 degrees about the vertical from its bind, and
 * an unkeyed bone plays its node's rest, which splayed both knees outwards
 * (every leg is solved in world space against `Body` at bind).
 *
 * Sampled at 30 or 15 frames a second (`FPS`) and written as a GLB whose scene is the cast's
 * bare skeleton, which is all a clip needs to bind by name.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const g = globalThis as Record<string, unknown>;
g.ProgressEvent ??= class extends Event {
  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type);
    Object.assign(this, init);
  }
};
g.self ??= globalThis;
g.FileReader ??= class {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

const CACHE = new URL('../../.cache/assets/quaternius/', import.meta.url).pathname;
const LIBRARY = `${CACHE}Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb`;

/** Cast bone <- library bone, parents before children. */
const MAP: readonly [string, string][] = [
  ['Hips', 'pelvis'],
  ['Abdomen', 'spine_01'],
  ['Torso', 'spine_02'],
  ['Chest', 'spine_03'],
  ['Neck', 'neck_01'],
  ['Head', 'Head'],
  ['ShoulderL', 'clavicle_l'],
  ['UpperArmL', 'upperarm_l'],
  ['LowerArmL', 'lowerarm_l'],
  ['WristL', 'hand_l'],
  ['ShoulderR', 'clavicle_r'],
  ['UpperArmR', 'upperarm_r'],
  ['LowerArmR', 'lowerarm_r'],
  ['WristR', 'hand_r'],
  ['UpperLegL', 'thigh_l'],
  ['LowerLegL', 'calf_l'],
  ['UpperLegR', 'thigh_r'],
  ['LowerLegR', 'calf_r'],
];
/** The IK feet: cast foot <- library foot, and the shin whose end it is put at. */
const FEET: readonly [string, string, string][] = [
  ['FootL', 'foot_l', 'LowerLegL'],
  ['FootR', 'foot_r', 'LowerLegR'],
];

/**
 * What the cast is given, under the names the world asks for: the jump, its
 * landing, a stroke and treading water (both authored with the waterline at
 * the origin, so a swimmer's frame is the surface), talking with the hands,
 * a second idle whose weight sits on one leg, and the two gestures a player
 * can make for the others to see that the pack has no clip for: a dance, and
 * sitting down (the library's is sat on a chair, so its seat is thin air at
 * the height of one). The library has 45 clips; these are the few the world
 * plays, and the rest are fights, weapons and props nobody here holds.
 */
export const RETARGETED: readonly [string, string][] = [
  ['Jump_Start', 'Jump_Start'],
  ['Jump', 'Jump_Loop'],
  ['Jump_Land', 'Jump_Land'],
  ['Swim', 'Swim_Fwd_Loop'],
  ['Swim_Idle', 'Swim_Idle_Loop'],
  ['Talk', 'Idle_Talking_Loop'],
  ['Idle_Shift', 'Idle_Loop'],
  ['Dance', 'Dance_Loop'],
  ['Sit', 'Sitting_Idle_Loop'],
];

/**
 * Samples a second: the jump, the landing, the stroke and the dance at 30,
 * and the four slow loops at 15, which halves what they cost and moves nothing a frame
 * between two samples can show — a breath or a gesture is interpolated
 * across a fifteenth of a second.
 */
const FPS = 30;
const SLOW_FPS = 15;
const SLOW: ReadonlySet<string> = new Set(['Swim_Idle', 'Talk', 'Idle_Shift', 'Sit']);

async function parse(data: ArrayBuffer | string, path = ''): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  return new GLTFLoader().parseAsync(data, path) as never;
}

function bonesOf(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((object) => bones.set(object.name, object));
  return bones;
}

/**
 * The library's clips on the cast's rig, as a GLB. `castGltf` is the path of
 * the outfit the cast's clips are taken from.
 */
export async function retargetClips(castGltf: string): Promise<Buffer> {
  const bytes = readFileSync(LIBRARY);
  const library = await parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const cast = await parse(readFileSync(castGltf, 'utf8'), castGltf.replace(/[^/]*$/, ''));

  // The cast in its bind pose, which is what its skin was drawn against.
  let skeleton: THREE.Skeleton | null = null;
  cast.scene.traverse((object) => {
    if (skeleton === null && (object as THREE.SkinnedMesh).isSkinnedMesh) skeleton = (object as THREE.SkinnedMesh).skeleton;
  });
  if (skeleton === null) throw new Error('retarget: the cast has no skeleton');
  (skeleton as THREE.Skeleton).pose();
  cast.scene.updateMatrixWorld(true);
  const target = bonesOf(cast.scene);
  const source = bonesOf(library.scene);
  library.scene.updateMatrixWorld(true);

  const need = (map: Map<string, THREE.Object3D>, name: string) => {
    const found = map.get(name);
    if (found === undefined) throw new Error(`retarget: no bone ${name}`);
    return found;
  };
  const world = (object: THREE.Object3D) => object.getWorldQuaternion(new THREE.Quaternion());
  const bindTarget = new Map<string, THREE.Quaternion>();
  const bindSource = new Map<string, THREE.Quaternion>();
  const restLocal = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
  target.forEach((bone, name) => restLocal.set(name, { position: bone.position.clone(), quaternion: bone.quaternion.clone() }));
  for (const [t, s] of [...MAP, ...FEET.map(([t, s]) => [t, s] as [string, string])]) {
    bindTarget.set(t, world(need(target, t)));
    bindSource.set(s, world(need(source, s)));
  }
  const hipsRest = need(target, 'Hips').getWorldPosition(new THREE.Vector3());
  const carrier = need(target, 'Body');
  const carrierRest = carrier.getWorldPosition(new THREE.Vector3());
  const pelvisRest = need(source, 'pelvis').getWorldPosition(new THREE.Vector3());
  const ratio = hipsRest.y / pelvisRest.y;
  const ankles = new Map<string, THREE.Vector3>();
  for (const [foot, , shin] of FEET) {
    ankles.set(foot, need(target, shin).worldToLocal(need(target, foot).getWorldPosition(new THREE.Vector3())));
  }

  const mixer = new THREE.AnimationMixer(library.scene);
  const clips: THREE.AnimationClip[] = [];
  const delta = new THREE.Quaternion();
  const wanted = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const point = new THREE.Vector3();

  for (const [name, from] of RETARGETED) {
    const clip = library.animations.find((entry) => entry.name === from);
    if (clip === undefined) throw new Error(`retarget: the library has no ${from}`);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    const fps = SLOW.has(name) ? SLOW_FPS : FPS;
    const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(frames);
    const rotations = new Map<string, Float32Array>();
    for (const t of ['Body', ...[...MAP, ...FEET].map(([bone]) => bone)]) rotations.set(t, new Float32Array(frames * 4));
    const positions = new Map<string, Float32Array>();
    for (const t of ['Body', ...FEET.map(([foot]) => foot)]) positions.set(t, new Float32Array(frames * 3));

    for (let f = 0; f < frames; f++) {
      const time = Math.min(clip.duration, f / fps);
      times[f] = time;
      mixer.setTime(time);
      library.scene.updateMatrixWorld(true);
      // Back to the bind pose, then solved parents first.
      target.forEach((bone, boneName) => {
        const rest = restLocal.get(boneName)!;
        bone.position.copy(rest.position);
        bone.quaternion.copy(rest.quaternion);
      });
      cast.scene.updateMatrixWorld(true);

      // The pelvis's travel, on the bone that carries both the hips and the thighs.
      point
        .copy(need(source, 'pelvis').getWorldPosition(new THREE.Vector3()))
        .sub(pelvisRest)
        .multiplyScalar(ratio)
        .add(carrierRest);
      carrier.position.copy(carrier.parent!.worldToLocal(point));
      carrier.updateMatrixWorld(true);
      for (const [t, s] of MAP) {
        const bone = need(target, t);
        delta.copy(world(need(source, s))).multiply(bindSource.get(s)!.clone().invert());
        wanted.copy(delta).multiply(bindTarget.get(t)!);
        bone.parent!.getWorldQuaternion(parentWorld);
        bone.quaternion.copy(parentWorld.invert().multiply(wanted));
        bone.updateMatrixWorld(true);
      }
      for (const [t, s, shin] of FEET) {
        const bone = need(target, t);
        need(target, shin).updateMatrixWorld(true);
        point.copy(ankles.get(t)!).applyMatrix4(need(target, shin).matrixWorld);
        bone.position.copy(bone.parent!.worldToLocal(point));
        delta.copy(world(need(source, s))).multiply(bindSource.get(s)!.clone().invert());
        wanted.copy(delta).multiply(bindTarget.get(t)!);
        bone.parent!.getWorldQuaternion(parentWorld);
        bone.quaternion.copy(parentWorld.invert().multiply(wanted));
        bone.updateMatrixWorld(true);
      }

      for (const [t, array] of rotations) need(target, t).quaternion.toArray(array, f * 4);
      for (const [t, array] of positions) need(target, t).position.toArray(array, f * 3);
    }

    const tracks: THREE.KeyframeTrack[] = [];
    for (const [t, values] of rotations) tracks.push(new THREE.QuaternionKeyframeTrack(`${t}.quaternion`, times, values));
    for (const [t, values] of positions) tracks.push(new THREE.VectorKeyframeTrack(`${t}.position`, times, values));
    const made = new THREE.AnimationClip(name, clip.duration, tracks);
    made.optimize();
    clips.push(made);
  }

  // Back to bind for the file's own pose, and only the skeleton in it.
  target.forEach((bone, boneName) => {
    const rest = restLocal.get(boneName)!;
    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
  });
  const root = need(target, 'Root');
  const holder = new THREE.Group();
  holder.name = root.parent?.name ?? 'CharacterArmature';
  const bare = root.clone(true);
  bare.traverse((object) => {
    for (const child of [...object.children]) if (!(child as THREE.Bone).isBone && child.type !== 'Object3D') child.removeFromParent();
  });
  holder.add(bare);
  const scene = new THREE.Scene();
  scene.add(holder);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips });
  return Buffer.from(glb as ArrayBuffer);
}
