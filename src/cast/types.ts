import * as THREE from 'three';
import type { ClipName, OutfitId, Paint, PartName, Wardrobe, WornPart } from './wardrobe.ts';

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
  /** Which wardrobe this is (an outfit's id, or a wardrobe's key), so a released person goes back to the right pool. */
  outfit: string;
  /** How tall this person was dressed, in world units: the `height` `make` was given. */
  height: number;
}

/** One part of one outfit as loaded: its geometry, and which material each vertex is. */
export interface PartSource {
  geometry: THREE.BufferGeometry;
  materials: { name: string; color: THREE.Color }[];
  vertexMaterial: Uint8Array;
}

/** One outfit as loaded, before any material: the rig and the parts, apart. */
export interface Source {
  outfit: OutfitId;
  /** The pack's scene with every part taken out: the armature and its bones. */
  bare: THREE.Group;
  /** The node the parts hung from, which the merged body hangs from in its place. */
  anchor: string;
  /** The skin's joints by name, in its order, and their inverse bind matrices. */
  joints: string[];
  inverses: THREE.Matrix4[];
  bindMatrix: THREE.Matrix4;
  parts: Map<PartName, PartSource>;
}

export interface Template {
  /** The pack's rig with one merged skinned mesh in it. */
  scene: THREE.Group;
  mesh: THREE.SkinnedMesh;
  /** Per vertex, which slot its colour comes from. */
  slot: Uint8Array;
  slots: { material: string; worn: WornPart; color: THREE.Color }[];
  /** Sole to crown in the pack's own units: `BODY_HEIGHT` for its body. */
  height: number;
  /** People made from it and not released. A composite with none may be let go. */
  live: number;
  /** An outfit's own template is kept; a mixed wardrobe's is trimmed when idle. */
  mixed: boolean;
}

export interface Cast {
  readonly outfits: readonly OutfitId[];
  readonly clips: ReadonlyMap<ClipName, THREE.AnimationClip>;
  /** Whether an outfit's parts are loaded, so `make` may use them. */
  has(outfit: OutfitId): boolean;
  /** Loads more outfits; resolves once `make` may use every one of them. */
  ensure(outfits: readonly OutfitId[]): Promise<void>;
  /** The materials of one part of a loaded outfit, for the checks. */
  materialsOf(worn: WornPart): readonly string[];
  /**
   * A person in an outfit, or in a wardrobe mixed from several of one body.
   * Every outfit named must be loaded (`has`); a wardrobe with no head, top,
   * bottom or feet of its own simply has none.
   */
  make(dress: OutfitId | Wardrobe, paint: Paint, height: number, young?: boolean): Person;
  /**
   * Hands a person back for `make` to dress again, repainted. Never dispose a
   * person's geometry: its positions, normals and weights are the outfit's,
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
 * The pack has no children, and an adult scaled down is not one: an adult is
 * about seven heads tall and a child of six about five and a half. At
 * `YOUNG_HEIGHT` (0.62 of an adult) a head 1.3 times the outfit's is 5.4
 * heads, which is the child's proportion.
 */
export const YOUNG_HEAD = 1.3;

/**
 * How many mixed wardrobes a cast keeps built while nobody wears them. The
 * traveller's card builds one per click, and a wardrobe is about half a
 * megabyte of geometry; the fifteen outfits' own are always kept.
 */
export const IDLE_MIXES = 6;
