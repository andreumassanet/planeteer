import * as THREE from 'three';
import { weldedNormals } from './source.ts';
import { YOUNG_HEAD, type Person, type Source, type Template } from './types.ts';
import { BODY_HEIGHT, PACK_FIT, bodyOf, type ClipName, type OutfitId, type Paint, type WornPart } from './wardrobe.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Builds the skinned template for a list of worn parts: their geometries
 * merged, one colour slot per source material, and the first part's rig bound
 * afresh. `need` fetches a loaded outfit's source.
 */
export function assemble(
  material: THREE.Material,
  need: (outfit: OutfitId) => Source,
  parts: readonly WornPart[],
  mixed: boolean,
): Template {
  const body = bodyOf(parts.find((worn) => worn.part !== 'pack')!.outfit);
  const base = need(parts.find((worn) => worn.part !== 'pack')!.outfit);
  const geometries: THREE.BufferGeometry[] = [];
  /** The parts moved to fit this body, which are this template's own to dispose. */
  const fitted: THREE.BufferGeometry[] = [];
  const slots: Template['slots'] = [];
  const vertexSlots: number[] = [];
  for (const worn of parts) {
    const source = need(worn.outfit);
    const part = source.parts.get(worn.part);
    if (part === undefined) throw new Error(`cast: ${worn.outfit} has no ${worn.part}`);
    let geometry = part.geometry;
    // Only the rucksack crosses rigs (`ordered`), and it is cut to the man's.
    if (bodyOf(worn.outfit) !== body) {
      const [x, y, z] = PACK_FIT[body];
      geometry = geometry.clone().translate(x, y, z);
      fitted.push(geometry);
    }
    geometries.push(geometry);
    const first = slots.length;
    for (const own of part.materials) slots.push({ material: own.name, worn, color: own.color });
    for (const index of part.vertexMaterial) vertexSlots.push(first + index);
  }
  const merged = mergeGeometries(geometries, false);
  if (merged === null) throw new Error('cast: parts that cannot merge');
  for (const geometry of fitted) geometry.dispose();
  const slot = Uint8Array.from(vertexSlots);
  merged.setAttribute('outlineNormal', weldedNormals(merged));
  merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(slot.length * 3), 3));

  // The rig of the first part's outfit, bound afresh: every outfit of a body
  // has the same joints in the same order with the same inverse bind
  // matrices, so any of them carries any of its parts.
  const scene = base.bare.clone(true);
  const bones = new Map<string, THREE.Bone>();
  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones.set(object.name, object as THREE.Bone);
  });
  const skeleton = new THREE.Skeleton(
    base.joints.map((name) => {
      const bone = bones.get(name);
      if (bone === undefined) throw new Error(`cast: the rig lost ${name}`);
      return bone;
    }),
    base.inverses.map((matrix) => matrix.clone()),
  );
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.name = 'body';
  const parent = scene.getObjectByName(base.anchor) ?? scene;
  parent.add(mesh);
  mesh.bind(skeleton, base.bindMatrix);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // A skinned body's bounds move with the pose; one generous sphere is cheaper
  // than recomputing, and culling a person whose arm is up is the wrong answer.
  mesh.frustumCulled = false;
  return { scene, mesh, slot, slots, height: BODY_HEIGHT[body], live: 0, mixed };
}

export const colour = new THREE.Color();

/** Writes the template's per-vertex colours for `paint` into `colors`. */
export function paintInto(template: Template, paint: Paint, colors: Float32Array): void {
  const bySlot = template.slots.map(({ material: name, worn, color }) => {
    const chosen = paint(name, color, worn);
    if (chosen === null) return color.clone();
    return chosen instanceof THREE.Color ? chosen.clone() : new THREE.Color(chosen);
  });
  for (let v = 0; v < template.slot.length; v++) {
    colour.copy(bySlot[template.slot[v]!]!);
    colors[v * 3] = colour.r;
    colors[v * 3 + 1] = colour.g;
    colors[v * 3 + 2] = colour.b;
  }
}

/** A new person from a template: its own colour attribute over the shared geometry, its own rig and mixer. */
export function spawnPerson(
  template: Template,
  key: string,
  clips: ReadonlyMap<ClipName, THREE.AnimationClip>,
  paint: Paint,
  height: number,
  young: boolean,
): Person {
  const scene = cloneRig(template.scene) as THREE.Group;
  let mesh: THREE.SkinnedMesh | null = null;
  scene.traverse((object) => {
    if (object.name === 'body' && (object as THREE.SkinnedMesh).isSkinnedMesh) mesh = object as THREE.SkinnedMesh;
  });
  if (mesh === null) throw new Error('cast: the clone lost its body');
  const body = mesh as THREE.SkinnedMesh;

  // Shared positions, normals and weights; a colour attribute of its own.
  const shared = template.mesh.geometry;
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'outlineNormal', 'skinIndex', 'skinWeight']) {
    geometry.setAttribute(name, shared.getAttribute(name));
  }
  const colors = new Float32Array(template.slot.length * 3);
  paintInto(template, paint, colors);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  body.geometry = geometry;
  // Culled by a fixed sphere round the body in its own frame, generous
  // enough for an arm raised or a leg in a stride. Computing it from the pose
  // would cost a skinning pass per person per frame.
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, template.height * 0.5, 0), template.height * 0.75);
  body.frustumCulled = true;

  const root = new THREE.Group();
  root.scale.setScalar(height / template.height);
  root.add(scene);

  const bones = new Map<string, THREE.Bone>();
  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones.set(object.name, object as THREE.Bone);
  });
  bones.get('Head')?.scale.setScalar(young ? YOUNG_HEAD : 1);
  const mixer = new THREE.AnimationMixer(scene);
  const actions = new Map<ClipName, THREE.AnimationAction>();
  for (const [name, clip] of clips) actions.set(name, mixer.clipAction(clip));
  return { root, mesh: body, bones, mixer, actions, slots: template.slots.map((entry) => entry.material), outfit: key, height };
}
