import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * The cast: the people of this world, as authored skinned characters.
 *
 * ## Why they are not built in code any more
 *
 * Every person in atlas was generated from primitives until 2026-09-16 — first
 * prisms, then smooth lathes — and both were rejected on sight as Roblox. The
 * research behind replacing them is in `docs/built.md` (*The cast*); the short
 * form is that a rigid piece per bone reads as a toy however it is shaped, and
 * that every polished reference with people in it, messenger.abeto.co included,
 * draws them as **one continuous skinned mesh played by authored clips**. So the
 * cast is Quaternius's CC0 modular men and women (`scripts/build-cast.mjs`):
 * fifteen outfits on one 62-joint rig, and the pack's own idle, walk, run and
 * gesture clips.
 *
 * ## What the world does to them
 *
 * - **One mesh, one material, one draw call** (two with the ink). A pack
 *   character is four meshes and up to eleven materials; drawn as shipped that
 *   is twenty-two calls a person. Every primitive is merged into one geometry
 *   whose colours are vertex colours, which is also what lets two people in the
 *   same outfit wear different clothes: `make` paints a fresh colour attribute
 *   over shared positions, normals and weights.
 * - **Creased normals.** The pack is low-poly with a normal per face. Drawn
 *   that way under the ink, the hull comes apart into one slab per facet — the
 *   `soft.ts` finding — and fully smoothed, the flat planes of a jacket go
 *   blotchy. Welding every edge under 50 degrees keeps the planes and closes the
 *   hull, the way the world's own faceted buildings are drawn.
 * - **The world's ramp and pen.** Materials are `MeshToonMaterial` on the ramp
 *   `createContext` shares, with the same ink as everything else.
 */

export const OUTFITS = [
  'man-adventurer',
  'man-beach',
  'man-casual',
  'man-hoodie',
  'man-farmer',
  'man-punk',
  'man-suit',
  'man-worker',
  'woman-adventurer',
  'woman-casual',
  'woman-formal',
  'woman-medieval',
  'woman-punk',
  'woman-suit',
  'woman-worker',
] as const;
export type OutfitId = (typeof OUTFITS)[number];

export const CLIPS = ['Idle', 'Idle_Neutral', 'Walk', 'Run', 'Wave', 'Interact', 'Roll'] as const;
export type ClipName = (typeof CLIPS)[number];

/** Where the baked files live, relative to the site root. */
const BASE = `${import.meta.env?.BASE_URL ?? '/'}models/cast/`;

/** Below this, in the pack's own metres, a vertex is part of a shoe. */
const FEET_Y = 0.11;

/** Faces meeting at less than this share a normal. See the note on creased normals. */
const CREASE = (50 * Math.PI) / 180;

/**
 * Turns a material's colour into the one this person wears, or `null` to keep
 * the pack's own. Called with the pack's material name — `Skin`, `Hair`,
 * `Purple`, `Worker_Vest` — which is the only handle the pack gives on what a
 * surface is.
 */
export type Paint = (material: string, original: THREE.Color) => number | THREE.Color | null;

export interface Person {
  /** Feet on y = 0, facing +Z, `height` tall. Owns the scale; animate below it. */
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  /** The rig's bones by name (`Hips`, `UpperLeg.L`, `Head`…). */
  bones: ReadonlyMap<string, THREE.Bone>;
  mixer: THREE.AnimationMixer;
  /** Every clip, bound to this person and not playing. */
  actions: ReadonlyMap<ClipName, THREE.AnimationAction>;
  /** Materials this person's colours came from, in slot order. */
  slots: readonly string[];
}

interface Template {
  /** The pack's scene with one merged skinned mesh in it. */
  scene: THREE.Group;
  mesh: THREE.SkinnedMesh;
  /** Per vertex, which slot its colour comes from. */
  slot: Uint8Array;
  slots: string[];
  defaults: THREE.Color[];
  /** Bind-pose height in the pack's own units. */
  height: number;
  stats: SlotStat[];
}

/** How much of an outfit a material covers, and how high: what a `Paint` needs to tell a shirt from trousers. */
export interface SlotStat {
  name: string;
  vertices: number;
  /** Mean bind-pose height of its vertices, in the pack's metres. */
  meanY: number;
}

export interface Cast {
  readonly outfits: readonly OutfitId[];
  readonly clips: ReadonlyMap<ClipName, THREE.AnimationClip>;
  /** Which materials an outfit has, how much each covers and how high. */
  slotsOf(outfit: OutfitId): readonly SlotStat[];
  make(outfit: OutfitId, paint: Paint, height: number): Person;
}

/** One material for the whole cast, built by the caller so it shares the world's ramp. */
export function castMaterial(gradientMap: THREE.Texture, ink: { thickness: number; color: [number, number, number] }): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  // The hull rides smooth normals of its own (`outlineNormal`, see `prepare`).
  material.userData.outlineParameters = { ...ink, outlineNormal: true };
  return material;
}

/**
 * Normals welded across every edge, by position: the hull's, not the fill's.
 *
 * The creased normals that keep a jacket's planes flat split the ink hull at
 * every crease, and on a figure forty units away the splits read as a furred,
 * broken line. The hull wants one closed skin, so it gets normals averaged over
 * every face that meets at a point, whatever the angle.
 */
function weldedNormals(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const sums = new Map<string, THREE.Vector3>();
  const keyOf = (i: number) =>
    `${Math.round(position.getX(i) * 1000)},${Math.round(position.getY(i) * 1000)},${Math.round(position.getZ(i) * 1000)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const face = new THREE.Vector3();
  for (let i = 0; i + 2 < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    // Area-weighted, so a sliver does not pull a corner off true.
    face.subVectors(c, b).cross(b.clone().sub(a));
    if (face.dot(new THREE.Vector3().fromBufferAttribute(normal, i)) < 0) face.negate();
    for (let k = 0; k < 3; k++) {
      const key = keyOf(i + k);
      const sum = sums.get(key);
      if (sum === undefined) sums.set(key, face.clone());
      else sum.add(face);
    }
  }
  const out = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const n = sums.get(keyOf(i))!.clone().normalize();
    out[i * 3] = n.x;
    out[i * 3 + 1] = n.y;
    out[i * 3 + 2] = n.z;
  }
  return new THREE.BufferAttribute(out, 3);
}

function prepare(gltf: { scene: THREE.Group }, material: THREE.Material): Template {
  const scene = gltf.scene;
  const parts: THREE.SkinnedMesh[] = [];
  scene.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) parts.push(object as THREE.SkinnedMesh);
  });
  if (parts.length === 0) throw new Error('cast: an outfit with no skinned mesh');
  // A prop the bake did not strip would draw in the pack's own material, off the
  // world's ramp and without ink. Nothing unskinned belongs to a person.
  const loose: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && !(object as THREE.SkinnedMesh).isSkinnedMesh) loose.push(object);
  });
  for (const object of loose) object.removeFromParent();
  const skeleton = parts[0]!.skeleton;
  if (parts.some((part) => part.skeleton !== skeleton)) throw new Error('cast: an outfit on two skeletons');

  const slots: string[] = [];
  const defaults: THREE.Color[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const vertexSlots: number[] = [];
  const slotOf = (name: string, color: THREE.Color): number => {
    let slot = slots.indexOf(name);
    if (slot < 0) {
      slot = slots.length;
      slots.push(name);
      defaults.push(color.clone());
    }
    return slot;
  };
  for (const part of parts) {
    const own = part.material as THREE.MeshStandardMaterial;
    const slot = slotOf(own.name, own.color);
    // The pack paints shoes with whatever the outfit is made of — a hoodie's
    // purple runs down to the trainers — so a surface whose vertices hang off a
    // foot gets a slot of its own, `<material>@feet`, and a paint can tell them
    // apart. The material name is the only other handle there is.
    const feet = slotOf(`${own.name}@feet`, own.color);
    const source = part.geometry.clone();
    for (const name of Object.keys(source.attributes)) {
      if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name)) source.deleteAttribute(name);
    }
    // The pack's meshes sit under the armature with their own transforms baked
    // into the bind matrix; merging assumes they share one, and says so if not.
    if (!part.bindMatrix.equals(parts[0]!.bindMatrix)) throw new Error('cast: parts with different bind matrices');
    const creased = toCreasedNormals(source, CREASE);
    geometries.push(creased);
    const joints = creased.getAttribute('skinIndex');
    const weights = creased.getAttribute('skinWeight');
    const heights = creased.getAttribute('position');
    for (let v = 0; v < joints.count; v++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (weights.getComponent(v, k) > weights.getComponent(v, best)) best = k;
      const bone = skeleton.bones[joints.getComponent(v, best)]?.name ?? '';
      // The toe of a trainer is weighted to the shin as often as to the foot,
      // so the height settles what the bone does not: nothing but a shoe is
      // this near the ground in any outfit of the pack.
      vertexSlots.push(/^Foot/.test(bone) || heights.getY(v) < FEET_Y ? feet : slot);
    }
  }
  const merged = mergeGeometries(geometries, false);
  if (merged === null) throw new Error('cast: parts that cannot merge');
  const slot = Uint8Array.from(vertexSlots);
  merged.setAttribute('outlineNormal', weldedNormals(merged));
  merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(slot.length * 3), 3));

  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.name = 'body';
  const parent = parts[0]!.parent!;
  parent.add(mesh);
  mesh.bind(skeleton, parts[0]!.bindMatrix);
  for (const part of parts) {
    part.removeFromParent();
    part.geometry.dispose();
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // A skinned body's bounds move with the pose; one generous sphere is cheaper
  // than recomputing, and culling a person whose arm is up is the wrong answer.
  mesh.frustumCulled = false;

  const position = merged.getAttribute('position');
  const stats: SlotStat[] = slots.map((name) => ({ name, vertices: 0, meanY: 0 }));
  for (let v = 0; v < slot.length; v++) {
    const stat = stats[slot[v]!]!;
    stat.vertices++;
    stat.meanY += position.getY(v);
  }
  for (const stat of stats) stat.meanY = stat.vertices > 0 ? stat.meanY / stat.vertices : 0;

  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene, true);
  return { scene, mesh, slot, slots, defaults, height: bounds.max.y - bounds.min.y, stats };
}

/**
 * Loads the outfits asked for and the shared clips. Everything after this is
 * synchronous, which is what lets `buildAvatar` stay a plain function.
 */
export async function loadCast(material: THREE.Material, outfits: readonly OutfitId[] = OUTFITS): Promise<Cast> {
  const loader = new GLTFLoader();
  const [clipFile, ...files] = await Promise.all([
    loader.loadAsync(`${BASE}clips.glb`),
    ...outfits.map((id) => loader.loadAsync(`${BASE}${id}.glb`)),
  ]);
  const clips = new Map<ClipName, THREE.AnimationClip>();
  for (const clip of clipFile!.animations) {
    if ((CLIPS as readonly string[]).includes(clip.name)) clips.set(clip.name as ClipName, clip);
  }
  const templates = new Map<OutfitId, Template>();
  outfits.forEach((id, i) => templates.set(id, prepare(files[i]!, material)));

  const colour = new THREE.Color();
  return {
    outfits,
    clips,
    slotsOf: (outfit) => templates.get(outfit)!.stats,
    make(outfit, paint, height) {
      const template = templates.get(outfit);
      if (template === undefined) throw new Error(`cast: ${outfit} was not loaded`);
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
      const bySlot = template.slots.map((name, s) => {
        const chosen = paint(name, template.defaults[s]!);
        if (chosen === null) return template.defaults[s]!.clone();
        return chosen instanceof THREE.Color ? chosen.clone() : new THREE.Color(chosen);
      });
      for (let v = 0; v < template.slot.length; v++) {
        colour.copy(bySlot[template.slot[v]!]!);
        colors[v * 3] = colour.r;
        colors[v * 3 + 1] = colour.g;
        colors[v * 3 + 2] = colour.b;
      }
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
      const mixer = new THREE.AnimationMixer(scene);
      const actions = new Map<ClipName, THREE.AnimationAction>();
      for (const [name, clip] of clips) actions.set(name, mixer.clipAction(clip));
      return { root, mesh: body, bones, mixer, actions, slots: template.slots };
    },
  };
}
