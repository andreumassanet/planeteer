import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { inflate } from './pack.ts';

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

export const CLIPS = ['Idle', 'Idle_Neutral', 'Walk', 'Run', 'Wave', 'Interact', 'Roll', 'Jump_Start', 'Jump', 'Jump_Land'] as const;
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
  /** Which outfit this is, so a released person goes back to the right pool. */
  outfit: OutfitId;
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
  make(outfit: OutfitId, paint: Paint, height: number, young?: boolean): Person;
  /**
   * Hands a person back for `make` to dress again, repainted. **Never dispose a
   * person's geometry**: its positions, normals and weights are the outfit's,
   * and disposing a geometry frees the GPU buffers of every attribute on it,
   * shared ones included — the next person in that outfit re-uploaded them, and
   * every body still standing kept drawing a buffer that had been deleted.
   */
  release(person: Person): void;
}

/**
 * How much bigger a child's head is than the outfit's own, drawn on the `Head`
 * bone (no clip in the pack scales a bone, so the mixer leaves it be).
 *
 * **The pack has no children, and an adult scaled down is not one** — that
 * is proportion, not size: an adult is about seven heads tall and a child of
 * six about five and a half. At `YOUNG_HEIGHT` (0.62 of an adult) a head 1.3
 * times the outfit's is 5.4 heads, which is the child's, on the same body the
 * pack drew (2026-09-17).
 */
export const YOUNG_HEAD = 1.3;

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
  // Gzipped GLB, like the data: see `scripts/build-cast.mjs`.
  const load = async (file: string) => {
    const response = await fetch(`${BASE}${file}.bin`);
    if (!response.ok) throw new Error(`cast: ${file} answered ${response.status}`);
    const raw = await inflate(await response.arrayBuffer());
    return loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, '');
  };
  // `jump` is the library's clips retargeted onto this rig (`retarget-clips.ts`).
  const [clipFile, jumpFile, ...files] = await Promise.all([load('clips'), load('jump'), ...outfits.map((id) => load(id))]);
  const clips = new Map<ClipName, THREE.AnimationClip>();
  for (const clip of [...clipFile!.animations, ...jumpFile!.animations]) {
    if ((CLIPS as readonly string[]).includes(clip.name)) clips.set(clip.name as ClipName, clip);
  }
  const templates = new Map<OutfitId, Template>();
  outfits.forEach((id, i) => templates.set(id, prepare(files[i]!, material)));

  const colour = new THREE.Color();
  const spare = new Map<OutfitId, Person[]>();
  const paintInto = (template: Template, paint: Paint, colors: Float32Array): void => {
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
  };
  return {
    outfits,
    clips,
    slotsOf: (outfit) => templates.get(outfit)!.stats,
    release(person) {
      person.mixer.stopAllAction();
      // A person let go mid-gesture keeps the weights it was blending with.
      for (const action of person.actions.values()) action.setEffectiveWeight(1).timeScale = 1;
      person.root.removeFromParent();
      person.root.position.set(0, 0, 0);
      person.root.quaternion.identity();
      const pool = spare.get(person.outfit) ?? [];
      pool.push(person);
      spare.set(person.outfit, pool);
    },
    make(outfit, paint, height, young = false) {
      const template = templates.get(outfit);
      if (template === undefined) throw new Error(`cast: ${outfit} was not loaded`);
      const reused = spare.get(outfit)?.pop();
      if (reused !== undefined) {
        const attribute = reused.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        paintInto(template, paint, attribute.array as Float32Array);
        attribute.needsUpdate = true;
        reused.root.scale.setScalar(height / template.height);
        reused.bones.get('Head')?.scale.setScalar(young ? YOUNG_HEAD : 1);
        return reused;
      }
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
      return { root, mesh: body, bones, mixer, actions, slots: template.slots, outfit };
    },
  };
}

// ---------------------------------------------------------------------------
// Poses written by hand: seated
// ---------------------------------------------------------------------------

/** A person's limbs, as a hand-written pose needs them. */
export interface Limbs {
  hips: THREE.Bone;
  legs: { upper: THREE.Bone; lower: THREE.Bone; foot: THREE.Bone; ankle: THREE.Vector3 }[];
  arms: { upper: THREE.Bone; lower: THREE.Bone; wrist: THREE.Bone }[];
}

/**
 * Finds the bones a seated pose moves and measures each ankle in its shin's own
 * frame, in the bind pose. Three drops the dot from a glTF bone's name, so both
 * spellings are tried.
 */
export function limbsOf(person: Person): Limbs {
  const bone = (name: string): THREE.Bone => {
    const found = person.bones.get(name) ?? person.bones.get(name.replace('.', ''));
    if (found === undefined) throw new Error(`cast: the rig has no ${name}`);
    return found;
  };
  person.mesh.skeleton.pose();
  person.root.updateMatrixWorld(true);
  const legs = (['L', 'R'] as const).map((side) => {
    const upper = bone(`UpperLeg.${side}`);
    const lower = bone(`LowerLeg.${side}`);
    const foot = bone(`Foot.${side}`);
    const ankle = lower.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
    return { upper, lower, foot, ankle };
  });
  const arms = (['L', 'R'] as const).map((side) => ({
    upper: bone(`UpperArm.${side}`),
    lower: bone(`LowerArm.${side}`),
    wrist: bone(`Wrist.${side}`),
  }));
  return { hips: bone('Hips'), legs, arms };
}

const aimFrom = new THREE.Vector3();
const aimAlong = new THREE.Vector3();
const aimTo = new THREE.Vector3();
const aimTurn = new THREE.Quaternion();
const aimOwn = new THREE.Quaternion();
const aimParent = new THREE.Quaternion();

/** Swings `bone` so that the world point `tip` comes to lie along `direction`, given in `frame`. */
export function aimBone(bone: THREE.Bone, tip: THREE.Vector3, direction: THREE.Vector3, frame: THREE.Object3D): void {
  bone.getWorldPosition(aimFrom);
  aimAlong.copy(tip).sub(aimFrom).normalize();
  aimTo.copy(direction).transformDirection(frame.matrixWorld);
  aimTurn.setFromUnitVectors(aimAlong, aimTo);
  bone.getWorldQuaternion(aimOwn);
  bone.parent!.getWorldQuaternion(aimParent);
  bone.quaternion.copy(aimParent.invert().multiply(aimTurn.multiply(aimOwn)));
  bone.updateMatrixWorld(true);
}

const foldTip = new THREE.Vector3();

/**
 * Folds both legs: thighs along `thigh`, shins along `shin`, both in `frame`.
 * **The rig's feet are IK controls hanging off its root**, not children of the
 * shins, so each foot bone is carried to its folded ankle or the shoe stays
 * standing on the floor.
 */
export function foldLegs(limbs: Limbs, frame: THREE.Object3D, thigh: THREE.Vector3, shin: THREE.Vector3): void {
  frame.updateMatrixWorld(true);
  for (const leg of limbs.legs) {
    aimBone(leg.upper, leg.lower.getWorldPosition(foldTip), thigh, frame);
    aimBone(leg.lower, leg.lower.localToWorld(foldTip.copy(leg.ankle)), shin, frame);
    leg.lower.localToWorld(foldTip.copy(leg.ankle));
    leg.foot.position.copy(leg.foot.parent!.worldToLocal(foldTip));
    leg.foot.updateMatrixWorld(true);
  }
}

/** Points both arms at `grip`, a point in `frame`: the upper arm and the forearm along the same line. */
export function reachArms(limbs: Limbs, frame: THREE.Object3D, grip: THREE.Vector3): void {
  frame.updateMatrixWorld(true);
  const target = frame.localToWorld(grip.clone());
  for (const arm of limbs.arms) {
    // Each hand a shoulder's width out from the middle of the grip.
    const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
    const middle = limbs.arms.map((a) => a.upper.getWorldPosition(new THREE.Vector3())).reduce((a, b) => a.add(b)).multiplyScalar(0.5);
    const hand = target.clone().add(shoulder.clone().sub(middle).multiplyScalar(0.8));
    const direction = frame.worldToLocal(hand.clone()).sub(frame.worldToLocal(shoulder.clone())).normalize();
    aimBone(arm.upper, arm.lower.getWorldPosition(new THREE.Vector3()), direction, frame);
    aimBone(arm.lower, arm.wrist.getWorldPosition(new THREE.Vector3()), direction, frame);
  }
}
