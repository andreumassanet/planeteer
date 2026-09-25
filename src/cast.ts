import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { tone } from './monuments/contract.ts';
import { inflate } from './pack.ts';
import { PALETTE } from './theme.ts';

/**
 * The cast: the people of this world, as authored skinned characters.
 *
 * ## Why they are not built in code any more
 *
 * Every person in atlas was generated from primitives until 2026-09-16 — first
 * prisms, then smooth lathes — and both read as Roblox. The short form of the
 * research behind replacing them is that a rigid piece per bone reads as a toy
 * however it is shaped, and that every polished reference with people in it,
 * messenger.abeto.co included, draws them as **one continuous skinned mesh
 * played by authored clips**. So the cast is Quaternius's CC0 modular men and
 * women (`scripts/build-cast.mjs`): fifteen outfits on one 62-joint rig, and
 * the pack's own idle, walk, run and gesture clips.
 *
 * ## An outfit is four parts, and the parts mix
 *
 * Every outfit in the pack is a head (with its hair or hat), a top (the torso,
 * the arms and the hands), a bottom and a pair of shoes, each a skinned mesh
 * of its own, and the man's adventurer carries a rucksack as a fifth. The pack
 * is modular on purpose: **every man is skinned to one rig and every woman to
 * another** — the same 62 joints in the same order and inverse bind matrices
 * equal to the last bit within a body (checked against the source files on
 * 2026-09-24), different between the two — so any man's head goes on any
 * man's top, trousers and shoes, and the seams meet. A `Wardrobe` is that
 * choice, one `WornPart` a slot; an `OutfitId` alone is the pack's own
 * outfit, every part of it, which is what the crowd wears.
 *
 * The rucksack is the one part that crosses the two rigs. It hangs off the
 * chest, which both rigs have in the same place in their joint list, so it is
 * skinned correctly on a woman too; it is only moved to meet her back
 * (`PACK_FIT`), which is a little further forward than a man's.
 *
 * ## What the world does to them
 *
 * - **One mesh, one material, one draw call** (two with the ink). A pack
 *   character is four meshes and up to eleven materials; drawn as shipped that
 *   is twenty-two calls a person. Every chosen part is merged into one geometry
 *   whose colours are vertex colours, which is also what lets two people in the
 *   same outfit wear different clothes: `make` paints a fresh colour attribute
 *   over shared positions, normals and weights.
 * - **Creased normals.** The pack is low-poly with a normal per face. Drawn
 *   that way under the ink, the hull comes apart into one slab per facet — the
 *   `soft.ts` finding — and fully smoothed, the flat planes of a jacket go
 *   blotchy. Welding every edge under 50 degrees keeps the planes and closes the
 *   hull, the way the world's own faceted buildings are drawn.
 * - **The world's ramp, pen and palette.** Materials are `MeshToonMaterial` on
 *   the ramp `createContext` shares, with the same ink as everything else, and
 *   every colour is the world's: what a person chooses or is dressed in goes
 *   onto the surfaces `roleOf` names, and every other surface — a tie, a
 *   buckle, a hard hat — is the pack's own colour moved onto the nearest entry
 *   of the palette (`paletteOf`).
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

/** Which of the two rigs an outfit is on. */
export type BodyKind = 'man' | 'woman';
export const bodyOf = (outfit: OutfitId): BodyKind => (outfit.startsWith('woman') ? 'woman' : 'man');

/** The slots an outfit is cut into, in the order a wardrobe lists them. */
export const PARTS = ['head', 'top', 'bottom', 'feet', 'pack'] as const;
export type PartName = (typeof PARTS)[number];

/** One part of one outfit, worn. */
export interface WornPart {
  outfit: OutfitId;
  part: PartName;
}

/** Parts chosen from any outfits of one body, at most one a slot. */
export type Wardrobe = readonly WornPart[];

/**
 * Which part a pack mesh is, by its node's name: `Casual_Head`, `Suit_Body`,
 * `Farmer_Pants`, `Backpack` (and the pack's own typo, `Formad_Head`).
 */
function partOf(node: string): PartName | null {
  if (/_Head$/.test(node)) return 'head';
  if (/_Body$/.test(node)) return 'top';
  if (/_(Legs|Pants)$/.test(node)) return 'bottom';
  if (/_Feet$/.test(node)) return 'feet';
  if (/^Backpack$/.test(node)) return 'pack';
  return null;
}

/**
 * Every clip a person can play: the pack's seven, then the Universal Animation
 * Library's retargeted onto the same rig (`scripts/retarget-clips.ts`) — the
 * jump and its landing, the stroke and treading water, talking, a second
 * idle, and the two gestures a player makes for the others: a dance and
 * sitting down.
 */
export const CLIPS = [
  'Idle',
  'Idle_Neutral',
  'Walk',
  'Run',
  'Wave',
  'Interact',
  'Roll',
  'Jump_Start',
  'Jump',
  'Jump_Land',
  'Swim',
  'Swim_Idle',
  'Talk',
  'Idle_Shift',
  'Dance',
  'Sit',
] as const;
export type ClipName = (typeof CLIPS)[number];

/** Where the baked files live, relative to the site root. */
const BASE = `${import.meta.env?.BASE_URL ?? '/'}models/cast/`;

/** Faces meeting at less than this share a normal. See the note on creased normals. */
const CREASE = (50 * Math.PI) / 180;

/**
 * How tall each body is drawn from, sole to crown, in the pack's metres: what
 * `make`'s `height` is a share of. Measured off the bake on 2026-09-24 — the
 * man in a hoodie 1.8704 and the woman in her casual clothes 1.8521, each
 * from the lowest sole to the top of the hair.
 *
 * **One number a body, not a box a person**, and it was a box until the
 * parts mixed: every outfit was scaled by its own bounds, so a punk's mohawk
 * (1.97 over the sole) made the body under it six per cent smaller than a man
 * in a suit, and a traveller who tried a hat on would have shrunk.
 */
export const BODY_HEIGHT: Readonly<Record<BodyKind, number>> = { man: 1.8704, woman: 1.8521 };

/**
 * How far the rucksack, which is cut to the man's back, is moved to sit on a
 * woman's, in the pack's metres. Her back is five centimetres further forward
 * at the chest and her shoulders three lower, and at no offset the straps
 * stood off her shoulders (seen side-on in an offline render on 2026-09-24).
 */
const PACK_FIT: Readonly<Record<BodyKind, readonly [number, number, number]>> = {
  man: [0, 0, 0],
  woman: [0, -0.03, 0.05],
};

/**
 * Turns a material's colour into the one this person wears, or `null` to keep
 * the pack's own. Called with the pack's material name — `Skin`, `Hair`,
 * `Purple`, `Worker_Vest` — and the part it is on, which between them are the
 * only handle the pack gives on what a surface is. `roleOf` reads them;
 * `paintWith` is the paint almost every caller wants.
 */
export type Paint = (material: string, original: THREE.Color, worn: WornPart) => number | THREE.Color | null;

// ---------------------------------------------------------------------------
// What each surface is
// ---------------------------------------------------------------------------

/**
 * What a surface of a part is, for whoever colours it. `keep` is a detail of
 * the outfit that stays its own colour (on the palette); `-light` and `-dark`
 * are a second cloth on the same garment, drawn as a tone of the first so the
 * garment stays one garment whatever colour it is.
 */
export type Role =
  | 'skin'
  | 'stubble'
  | 'beard'
  | 'hair'
  | 'hair-dark'
  | 'eye'
  | 'top'
  | 'top-light'
  | 'top-dark'
  | 'bottom'
  | 'bottom-dark'
  | 'shoes'
  | 'shoes-light'
  | 'shoes-dark'
  | 'pack'
  | 'pack-light'
  | 'pack-dark'
  | 'keep';

/**
 * The surfaces whose names say what they are in every outfit of the pack.
 * `Brown` on a woman's head is her eyes and on her boots is leather, so a
 * colour name alone is never one of these.
 */
const GENERIC: ReadonlyMap<string, Role> = new Map<string, Role>([
  ['Skin', 'skin'],
  ['Skin_Darker', 'stubble'],
  ['Eye', 'eye'],
  ['Eyebrows', 'hair'],
  ['Hair', 'hair'],
  ['Hair_Brown', 'hair'],
  ['Hair_Blond', 'hair'],
  ['Moustache', 'beard'],
  ['Earrings', 'keep'],
]);

/**
 * Every other surface of every part, by outfit and part, read off the pack's
 * files and an offline render of each part (2026-09-24). `pnpm people` fails
 * on a material this table and `GENERIC` do not name, so a re-bake from a
 * newer pack cannot quietly paint a hat in a shirt's colour.
 */
const ROLES: Readonly<Record<string, Readonly<Record<string, Role>>>> = {
  'man-adventurer/top': { Green: 'top', LightGreen: 'top-light' },
  'man-adventurer/bottom': { Brown: 'bottom', Brown2: 'bottom-dark' },
  'man-adventurer/feet': { Grey: 'shoes', Black: 'keep' },
  'man-adventurer/pack': { LightGreen: 'pack', Green: 'pack-dark', Gold: 'pack-light', Brown: 'keep' },
  'man-beach/top': { LightBrown: 'top' },
  'man-beach/bottom': { Red_Dark: 'bottom', White: 'keep' },
  'man-beach/feet': { Red_Dark: 'shoes' },
  'man-casual/top': { LightBrown: 'top' },
  'man-casual/bottom': { LightBlue: 'bottom' },
  'man-casual/feet': { Red_Dark: 'shoes', White: 'keep' },
  'man-hoodie/top': { Purple: 'top' },
  'man-hoodie/bottom': { LightBlue: 'bottom' },
  'man-hoodie/feet': { Purple: 'shoes', White: 'keep' },
  // The straw hat and its band.
  'man-farmer/head': { Beige: 'keep', Red: 'keep' },
  // The dungarees' bib is on the torso and is the trousers' cloth.
  'man-farmer/top': { Brown: 'top', LightBlue: 'bottom', Beige: 'keep' },
  'man-farmer/bottom': { LightBlue: 'bottom' },
  'man-farmer/feet': { Brown: 'shoes', Brown2: 'shoes-dark' },
  // The crest and the shaved sides under it.
  'man-punk/head': { Red: 'hair', Red_Dark: 'hair-dark' },
  // A leather waistcoat over a white shirt: the waistcoat is the top.
  'man-punk/top': { Black: 'top', White: 'keep' },
  'man-punk/bottom': { LightBlue: 'bottom' },
  'man-punk/feet': { Black: 'shoes' },
  'man-suit/top': { Suit: 'top', White: 'keep', Tie: 'keep' },
  'man-suit/bottom': { Suit: 'bottom' },
  'man-suit/feet': { Black: 'shoes' },
  'man-worker/head': { Worker_Yellow: 'keep' },
  'man-worker/top': { Worker_Vest: 'top', Worker_Yellow: 'keep', LightBrown: 'keep' },
  'man-worker/bottom': { Brown: 'bottom', Brown2: 'bottom-dark' },
  'man-worker/feet': { Grey: 'shoes', Black: 'keep' },
  'woman-adventurer/head': { Brown: 'eye' },
  'woman-adventurer/top': { LightGreen: 'top', Green: 'top-dark', White: 'keep', Brown2: 'keep', Gold: 'keep' },
  // The tunic's hem comes down over the shorts, in the tunic's cloth.
  'woman-adventurer/bottom': { Brown_02: 'bottom', Brown2: 'bottom-dark', LightGreen: 'top', White: 'keep', Gold: 'keep' },
  'woman-adventurer/feet': { Brown_02: 'shoes', Brown2: 'shoes-dark' },
  'woman-casual/head': { Brown: 'eye' },
  'woman-casual/top': { White: 'top' },
  'woman-casual/bottom': { Orange: 'bottom' },
  'woman-casual/feet': { Grey: 'shoes' },
  // Her hair is the pack's `Red`.
  'woman-formal/head': { Brown: 'eye', Red: 'hair' },
  'woman-formal/top': { LimeGreen: 'top', Gold: 'keep' },
  'woman-formal/bottom': { LimeGreen: 'bottom' },
  'woman-formal/feet': { Red: 'shoes' },
  // Grey hair (`White`) under a brown hood.
  'woman-medieval/head': { Brown: 'eye', White: 'hair', DarkBrown: 'keep', Black: 'keep' },
  'woman-medieval/top': { DarkBrown: 'top', LightBrown: 'top-light', Black: 'keep', Gold: 'keep', Metal: 'keep' },
  'woman-medieval/bottom': { Black: 'bottom' },
  'woman-medieval/feet': { DarkBrown: 'shoes', LightBrown: 'shoes-light' },
  'woman-punk/head': { Brown: 'eye', Pink: 'hair', Black: 'keep' },
  'woman-punk/top': { Pink: 'top', Black: 'keep' },
  'woman-punk/bottom': { Black: 'bottom' },
  'woman-punk/feet': { Black: 'shoes', Grey: 'keep' },
  'woman-suit/head': { Brown: 'eye' },
  'woman-suit/top': { Black: 'top', White: 'keep' },
  'woman-suit/bottom': { Black: 'bottom' },
  'woman-suit/feet': { Black: 'shoes' },
  'woman-worker/head': { Brown: 'eye', DarkBrown: 'hair', Worker_Yellow: 'keep' },
  'woman-worker/top': { Worker_Vest: 'top', White: 'keep', Worker_Yellow: 'keep' },
  'woman-worker/bottom': { Brown_02: 'bottom', Brown2: 'bottom-dark' },
  'woman-worker/feet': { Black: 'shoes' },
};

/** What a surface is, or `null` for one nobody has named; `paintWith` keeps those. */
export function roleOf(worn: WornPart, material: string): Role | null {
  return ROLES[`${worn.outfit}/${worn.part}`]?.[material] ?? GENERIC.get(material) ?? null;
}

/** The palette's own values, to tell a colour that may be toned from one that may not. */
const PALETTE_VALUES = new Set<number>(Object.values(PALETTE));

/**
 * The entries a surface the pack coloured may be moved onto: every one but
 * `ink`, which is the pen's. A dark band of ink on a body is read as a line
 * before it is read as cloth — the lesson the tower blocks' black glazing
 * taught — so the suit's black goes to the nearest dark that is not the pen.
 */
const SNAP: readonly number[] = Object.values(PALETTE).filter((value) => value !== PALETTE.ink);
const snapped = new Map<number, number>();

/** The palette entry nearest the pack's own colour, compared in sRGB. */
export function paletteOf(original: THREE.Color): number {
  const hex = original.getHex();
  const known = snapped.get(hex);
  if (known !== undefined) return known;
  const channel = (value: number, shift: number) => (value >> shift) & 255;
  let best = SNAP[0]!;
  let bestD = Infinity;
  for (const candidate of SNAP) {
    const d =
      (channel(hex, 16) - channel(candidate, 16)) ** 2 +
      (channel(hex, 8) - channel(candidate, 8)) ** 2 +
      (channel(hex, 0) - channel(candidate, 0)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = candidate;
    }
  }
  snapped.set(hex, best);
  return best;
}

/**
 * Skin, as the cast wears it. `dress.ts`'s ramp is the right set of people and
 * one of its entries is the wrong colour here: `tan` goes olive on a large
 * smooth face under the blue fill light, where it was a few pixels of prism
 * before. It is swapped for a warm tone of the same weight; the others stand.
 * The crowd and the traveller's card both read it.
 */
export const castSkin = (color: number): number => (color === PALETTE.tan ? tone(PALETTE.apricot, 0.8) : color);

/** A second cloth of a garment, a tone of the first; a colour off the palette is left as it is. */
const shade = (color: number, factor: number): number => (PALETTE_VALUES.has(color) ? tone(color, factor) : color);

/** The colours one person wears, by role. Every one a palette entry or a tone of one. */
export interface Colours {
  skin: number;
  hair: number;
  /** The eyes: `ink` for everybody, which is what the pack's own dots are drawn as. */
  eye: number;
  top: number;
  bottom: number;
  shoes: number;
  /** The rucksack, where the wardrobe has one. */
  pack: number;
  /** A child: whatever beard the head was drawn with goes the colour of the skin. */
  young?: boolean;
}

/** The paint for a set of colours: each surface by its role, and the rest on the palette. */
export function paintWith(colours: Colours): Paint {
  return (material, original, worn) => {
    switch (roleOf(worn, material) ?? 'keep') {
      case 'skin':
        return colours.skin;
      case 'stubble':
        return colours.young === true ? colours.skin : shade(colours.skin, 0.88);
      case 'beard':
        return colours.young === true ? colours.skin : colours.hair;
      case 'hair':
        return colours.hair;
      case 'hair-dark':
        return shade(colours.hair, 0.7);
      case 'eye':
        return colours.eye;
      case 'top':
        return colours.top;
      case 'top-light':
        return shade(colours.top, 1.25);
      case 'top-dark':
        return shade(colours.top, 0.72);
      case 'bottom':
        return colours.bottom;
      case 'bottom-dark':
        return shade(colours.bottom, 0.72);
      case 'shoes':
        return colours.shoes;
      case 'shoes-light':
        return shade(colours.shoes, 1.25);
      case 'shoes-dark':
        return shade(colours.shoes, 0.72);
      case 'pack':
        return colours.pack;
      case 'pack-light':
        return shade(colours.pack, 1.2);
      case 'pack-dark':
        return shade(colours.pack, 0.75);
      case 'keep':
        return paletteOf(original);
    }
  };
}

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------

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
interface PartSource {
  geometry: THREE.BufferGeometry;
  materials: { name: string; color: THREE.Color }[];
  vertexMaterial: Uint8Array;
}

/** One outfit as loaded, before any material: the rig and the parts, apart. */
interface Source {
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

interface Template {
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
  /** The materials of one part of a loaded outfit, for the checks and the sheets. */
  materialsOf(worn: WornPart): readonly string[];
  /**
   * A person in an outfit, or in a wardrobe mixed from several of one body.
   * Every outfit named must be loaded (`has`); a wardrobe with no head, top,
   * bottom or feet of its own simply has none.
   */
  make(dress: OutfitId | Wardrobe, paint: Paint, height: number, young?: boolean): Person;
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

/**
 * How many mixed wardrobes a cast keeps built while nobody wears them. The
 * traveller's card builds one per click, and a wardrobe is about half a
 * megabyte of geometry; the fifteen outfits' own are always kept.
 */
const IDLE_MIXES = 6;

/** One material for the whole cast, built by the caller so it shares the world's ramp. */
export function castMaterial(gradientMap: THREE.Texture, ink: { thickness: number; color: [number, number, number] }): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  // The hull rides smooth normals of its own (`outlineNormal`, see `assemble`).
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
  const along = new THREE.Vector3();
  const own = new THREE.Vector3();
  for (let i = 0; i + 2 < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    // Area-weighted, so a sliver does not pull a corner off true.
    face.subVectors(c, b).cross(along.subVectors(b, a));
    if (face.dot(own.fromBufferAttribute(normal, i)) < 0) face.negate();
    for (let k = 0; k < 3; k++) {
      const key = keyOf(i + k);
      const sum = sums.get(key);
      if (sum === undefined) sums.set(key, face.clone());
      else sum.add(face);
    }
  }
  const out = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const n = own.copy(sums.get(keyOf(i))!).normalize();
    out[i * 3] = n.x;
    out[i * 3 + 1] = n.y;
    out[i * 3 + 2] = n.z;
  }
  return new THREE.BufferAttribute(out, 3);
}

/** Splits a loaded outfit into its rig and its parts. Material-free, so every cast shares it. */
function split(outfit: OutfitId, gltf: { scene: THREE.Group }): Source {
  const scene = gltf.scene;
  const meshes: THREE.SkinnedMesh[] = [];
  const loose: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
    // A prop the bake did not strip would draw in the pack's own material, off
    // the world's ramp and without ink. Nothing unskinned belongs to a person.
    else if ((object as THREE.Mesh).isMesh) loose.push(object);
  });
  if (meshes.length === 0) throw new Error(`cast: ${outfit} has no skinned mesh`);
  for (const object of loose) object.removeFromParent();
  const skeleton = meshes[0]!.skeleton;
  if (meshes.some((mesh) => mesh.skeleton !== skeleton)) throw new Error(`cast: ${outfit} is on two skeletons`);
  // The pack's meshes sit under the armature with their own transforms baked
  // into the bind matrix; merging assumes they share one, and says so if not.
  if (meshes.some((mesh) => !mesh.bindMatrix.equals(meshes[0]!.bindMatrix))) {
    throw new Error(`cast: ${outfit} has parts with different bind matrices`);
  }

  const collected = new Map<PartName, { geometries: THREE.BufferGeometry[]; materials: { name: string; color: THREE.Color }[]; vertexMaterial: number[] }>();
  for (const mesh of meshes) {
    // A part of one material is its node's own mesh; a part of several is a
    // group named for the node, with a mesh a material under it.
    const part = partOf(mesh.name) ?? partOf(mesh.parent?.name ?? '');
    if (part === null) throw new Error(`cast: ${outfit} has a part called ${mesh.name} (${mesh.parent?.name})`);
    let entry = collected.get(part);
    if (entry === undefined) collected.set(part, (entry = { geometries: [], materials: [], vertexMaterial: [] }));
    const own = mesh.material as THREE.MeshStandardMaterial;
    let index = entry.materials.findIndex((known) => known.name === own.name);
    if (index < 0) {
      index = entry.materials.length;
      entry.materials.push({ name: own.name, color: own.color.clone() });
    }
    const source = mesh.geometry.clone();
    for (const name of Object.keys(source.attributes)) {
      if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name)) source.deleteAttribute(name);
    }
    const creased = toCreasedNormals(source, CREASE);
    source.dispose();
    entry.geometries.push(creased);
    for (let v = 0; v < creased.getAttribute('position').count; v++) entry.vertexMaterial.push(index);
  }
  const parts = new Map<PartName, PartSource>();
  for (const [part, entry] of collected) {
    const geometry = mergeGeometries(entry.geometries, false);
    if (geometry === null) throw new Error(`cast: ${outfit}'s ${part} cannot merge`);
    for (const piece of entry.geometries) piece.dispose();
    parts.set(part, { geometry, materials: entry.materials, vertexMaterial: Uint8Array.from(entry.vertexMaterial) });
  }

  const anchor = meshes[0]!.parent!.name;
  const joints = skeleton.bones.map((bone) => bone.name);
  const inverses = skeleton.boneInverses.map((matrix) => matrix.clone());
  const bindMatrix = meshes[0]!.bindMatrix.clone();
  for (const mesh of meshes) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  return { outfit, bare: scene, anchor, joints, inverses, bindMatrix, parts };
}

/**
 * Every outfit's download and split, shared by every cast on the page: the
 * hero's, the crowd's and the traveller's card each build their own material
 * and templates, and none of them fetches or parses a file another has.
 */
const sources = new Map<OutfitId, Promise<Source>>();
let clipSource: Promise<Map<ClipName, THREE.AnimationClip>> | null = null;

async function fetchGltf(file: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const response = await fetch(`${BASE}${file}.bin`);
  if (!response.ok) throw new Error(`cast: ${file} answered ${response.status}`);
  // Gzipped GLB, like the data: see `scripts/build-cast.mjs`.
  const raw = await inflate(await response.arrayBuffer());
  return new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, '');
}

function sourceOf(outfit: OutfitId): Promise<Source> {
  let found = sources.get(outfit);
  if (found === undefined) {
    found = fetchGltf(outfit).then((gltf) => split(outfit, gltf));
    // A failed download is asked again by the next caller, not remembered.
    found.catch(() => sources.delete(outfit));
    sources.set(outfit, found);
  }
  return found;
}

function clipsOf(): Promise<Map<ClipName, THREE.AnimationClip>> {
  if (clipSource === null) {
    // `retargeted` is the library's clips on this rig (`retarget-clips.ts`).
    clipSource = Promise.all([fetchGltf('clips'), fetchGltf('retargeted')]).then(([clipFile, libraryFile]) => {
      const clips = new Map<ClipName, THREE.AnimationClip>();
      for (const clip of [...clipFile.animations, ...libraryFile.animations]) {
        if ((CLIPS as readonly string[]).includes(clip.name)) clips.set(clip.name as ClipName, clip);
      }
      return clips;
    });
    clipSource.catch(() => (clipSource = null));
  }
  return clipSource;
}

/** A wardrobe's pool key: the same parts in any order are the same wardrobe. */
function keyOf(wardrobe: Wardrobe): string {
  return PARTS.map((part) => wardrobe.find((worn) => worn.part === part))
    .filter((worn): worn is WornPart => worn !== undefined)
    .map((worn) => `${worn.outfit}.${worn.part}`)
    .join('+');
}

/** The parts of a wardrobe in slot order, one a slot, checked to be of one body. */
function ordered(wardrobe: Wardrobe): WornPart[] {
  const list: WornPart[] = [];
  let body: BodyKind | null = null;
  for (const part of PARTS) {
    const worn = wardrobe.filter((entry) => entry.part === part);
    if (worn.length > 1) throw new Error(`cast: a wardrobe with two ${part}s`);
    if (worn.length === 0) continue;
    // The rucksack hangs off a chest both rigs share; every other part is its rig's.
    if (part !== 'pack') {
      const own = bodyOf(worn[0]!.outfit);
      if (body !== null && own !== body) throw new Error('cast: a wardrobe mixing the two bodies');
      body = own;
    }
    list.push(worn[0]!);
  }
  if (body === null) throw new Error('cast: a wardrobe with nothing but a rucksack');
  return list;
}

/**
 * Loads the outfits asked for and the shared clips. Everything after this is
 * synchronous, which is what lets `buildAvatar` stay a plain function; more
 * outfits arrive through `ensure`.
 */
export async function loadCast(material: THREE.Material, outfits: readonly OutfitId[] = OUTFITS): Promise<Cast> {
  const clips = await clipsOf();
  const loaded = new Map<OutfitId, Source>();
  const load = async (list: readonly OutfitId[]): Promise<void> => {
    const got = await Promise.all(list.map((id) => sourceOf(id)));
    for (const source of got) loaded.set(source.outfit, source);
  };
  await load(outfits);

  const templates = new Map<string, Template>();
  const spare = new Map<string, Person[]>();
  /** Mixed wardrobes nobody wears, oldest first. */
  const idle: string[] = [];

  const need = (outfit: OutfitId): Source => {
    const found = loaded.get(outfit);
    if (found === undefined) throw new Error(`cast: ${outfit} was not loaded`);
    return found;
  };

  function assemble(parts: readonly WornPart[], mixed: boolean): Template {
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

  function templateFor(dress: OutfitId | Wardrobe): { key: string; template: Template } {
    const whole = typeof dress === 'string';
    const parts = whole
      ? PARTS.filter((part) => need(dress).parts.has(part)).map((part) => ({ outfit: dress, part }))
      : ordered(dress);
    const key = whole ? dress : keyOf(parts);
    let template = templates.get(key);
    if (template === undefined) {
      template = assemble(parts, !whole);
      templates.set(key, template);
    }
    const waiting = idle.indexOf(key);
    if (waiting >= 0) idle.splice(waiting, 1);
    return { key, template };
  }

  /** Lets go of the oldest idle mixed wardrobes past `IDLE_MIXES`, and every spare person in them. */
  function trim(): void {
    while (idle.length > IDLE_MIXES) {
      const key = idle.shift()!;
      const template = templates.get(key);
      templates.delete(key);
      for (const person of spare.get(key) ?? []) {
        person.mesh.geometry.dispose();
        person.mesh.skeleton.dispose();
      }
      spare.delete(key);
      template?.mesh.geometry.dispose();
    }
  }

  const colour = new THREE.Color();
  const paintInto = (template: Template, paint: Paint, colors: Float32Array): void => {
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
  };

  return {
    get outfits() {
      return [...loaded.keys()];
    },
    clips,
    has: (outfit) => loaded.has(outfit),
    ensure: (outfits) => load(outfits.filter((outfit) => !loaded.has(outfit))),
    materialsOf: (worn) => need(worn.outfit).parts.get(worn.part)?.materials.map((own) => own.name) ?? [],
    release(person) {
      person.mixer.stopAllAction();
      // A person let go mid-gesture keeps the weights it was blending with.
      for (const action of person.actions.values()) action.setEffectiveWeight(1).timeScale = 1;
      person.root.removeFromParent();
      person.root.position.set(0, 0, 0);
      person.root.quaternion.identity();
      // Hidden by whoever held it — a peer in a closed cab — it would be
      // handed to the next townsman invisible.
      person.root.visible = true;
      const pool = spare.get(person.outfit) ?? [];
      pool.push(person);
      spare.set(person.outfit, pool);
      const template = templates.get(person.outfit);
      if (template !== undefined && --template.live <= 0 && template.mixed) {
        template.live = 0;
        idle.push(person.outfit);
        trim();
      }
    },
    make(dress, paint, height, young = false) {
      const { key, template } = templateFor(dress);
      template.live++;
      const reused = spare.get(key)?.pop();
      if (reused !== undefined) {
        const attribute = reused.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        paintInto(template, paint, attribute.array as Float32Array);
        attribute.needsUpdate = true;
        reused.root.scale.setScalar(height / template.height);
        reused.bones.get('Head')?.scale.setScalar(young ? YOUNG_HEAD : 1);
        reused.height = height;
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
      return { root, mesh: body, bones, mixer, actions, slots: template.slots.map((entry) => entry.material), outfit: key, height };
    },
  };
}

// ---------------------------------------------------------------------------
// Poses written by hand: seated
// ---------------------------------------------------------------------------

/** A person's limbs, as a hand-written pose needs them. */
export interface Limbs {
  hips: THREE.Bone;
  /** The first bone of the spine over the hips, which a rider leans forward on; null on a rig without one. */
  spine: THREE.Bone | null;
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
  const spine = person.bones.get('Abdomen') ?? null;
  return { hips: bone('Hips'), spine, legs, arms };
}

const aimFrom = new THREE.Vector3();
const aimAlong = new THREE.Vector3();
const aimTo = new THREE.Vector3();
const aimTurn = new THREE.Quaternion();
const aimOwn = new THREE.Quaternion();
const aimParent = new THREE.Quaternion();

/** Swings `bone` so that the world point `tip` comes to lie along `direction`, given in `frame`. */
function aimBone(bone: THREE.Bone, tip: THREE.Vector3, direction: THREE.Vector3, frame: THREE.Object3D): void {
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

const armTarget = new THREE.Vector3();
const armShoulder = new THREE.Vector3();
const armMiddle = new THREE.Vector3();
const armHand = new THREE.Vector3();
const armFrom = new THREE.Vector3();
const armDirection = new THREE.Vector3();
const armTip = new THREE.Vector3();

/**
 * Points both arms at `grip`, a point in `frame`: the upper arm and the
 * forearm along the same line. Allocates nothing, so a rider's hands can be
 * put on the bars every frame.
 */
export function reachArms(limbs: Limbs, frame: THREE.Object3D, grip: THREE.Vector3): void {
  frame.updateMatrixWorld(true);
  frame.localToWorld(armTarget.copy(grip));
  limbs.arms[0]!.upper.getWorldPosition(armMiddle).add(limbs.arms[1]!.upper.getWorldPosition(armHand)).multiplyScalar(0.5);
  for (const arm of limbs.arms) {
    // Each hand a shoulder's width out from the middle of the grip.
    arm.upper.getWorldPosition(armShoulder);
    armHand.copy(armShoulder).sub(armMiddle).multiplyScalar(0.8).add(armTarget);
    frame.worldToLocal(armDirection.copy(armHand));
    frame.worldToLocal(armFrom.copy(armShoulder));
    armDirection.sub(armFrom).normalize();
    aimBone(arm.upper, arm.lower.getWorldPosition(armTip), armDirection, frame);
    aimBone(arm.lower, arm.wrist.getWorldPosition(armTip), armDirection, frame);
  }
}

/** What a body astride is put to: `Seat`'s grip, footrests and crank (`craft/contract.ts`). */
export interface AstrideSeat {
  grip?: readonly [number, number, number];
  feet?: readonly [number, number, number];
  crank?: number;
}

const legHip = new THREE.Vector3();
const legKnee = new THREE.Vector3();
const legAnkle = new THREE.Vector3();
const legTarget = new THREE.Vector3();
const legAlong = new THREE.Vector3();
const legPole = new THREE.Vector3();
const legThigh = new THREE.Vector3();
const legShin = new THREE.Vector3();
const gripAt = new THREE.Vector3();
/** Which way a knee bends, in the frame: forward, and up a little. */
const KNEE_POLE = new THREE.Vector3(0, 0.35, 1).normalize();
/**
 * The furthest a rider leans forward from the hips to reach a grip, radians,
 * and the step the lean is found in: a sit-up city bicycle needs none, a
 * scooter's far bars most of it.
 */
export const RIDE_LEAN = 0.7;
const LEAN_STEP = 0.05;
const leanFrom = new THREE.Vector3();
const leanTo = new THREE.Vector3();
const leanAxis = new THREE.Vector3();
const leanTurn = new THREE.Quaternion();
const leanParent = new THREE.Quaternion();
const leanInverse = new THREE.Quaternion();

/**
 * A body astride: each leg from its hip to its footrest, the knee bent forward
 * over it, and both hands to the grip.
 *
 * `hip` is where the `Hips` bone is in `frame`, and the seat's grip and feet
 * are about it (`Seat` in `craft/contract.ts`): the left foot's rest, and the
 * right the same mirrored; +X is the body's left. A seat with a `crank` has
 * its feet on the pedals instead, the crank's axle at `feet` and the left
 * pedal `phase` radians round from the bottom — the pedal's own
 * `(-cos, -sin)` in (y, z), which is how `craft/cycles.ts` turns the crank —
 * and the right one half a turn on.
 *
 * Each leg is the two-bone solve: the hip and the target fix the plane with
 * the knee's pole, the thigh and the shin keep their lengths, and a target out
 * of reach is reached for with the leg straight. The feet are carried to the
 * shins' ends as `foldLegs` carries them. Allocates nothing.
 */
export function poseAstride(limbs: Limbs, frame: THREE.Object3D, hip: THREE.Vector3, seat: AstrideSeat, phase: number): void {
  frame.updateMatrixWorld(true);
  const feet = seat.feet;
  if (feet !== undefined) {
    limbs.legs.forEach((leg, i) => {
      const side = i === 0 ? 1 : -1;
      legTarget.set(hip.x + side * feet[0], hip.y + feet[1], hip.z + feet[2]);
      if (seat.crank !== undefined) {
        const turn = phase + (side < 0 ? Math.PI : 0);
        legTarget.y -= seat.crank * Math.cos(turn);
        legTarget.z -= seat.crank * Math.sin(turn);
      }
      // Everything in the frame: the joints where they are now, the lengths as built.
      frame.worldToLocal(leg.upper.getWorldPosition(legHip));
      frame.worldToLocal(leg.lower.getWorldPosition(legKnee));
      frame.worldToLocal(leg.lower.localToWorld(legAnkle.copy(leg.ankle)));
      const thigh = legHip.distanceTo(legKnee);
      const shin = legKnee.distanceTo(legAnkle);
      legAlong.copy(legTarget).sub(legHip);
      const reach = Math.min(thigh + shin - 1e-4, Math.max(Math.abs(thigh - shin) + 1e-4, legAlong.length()));
      legAlong.normalize();
      legPole.copy(KNEE_POLE).addScaledVector(legAlong, -KNEE_POLE.dot(legAlong));
      if (legPole.lengthSq() < 1e-8) legPole.set(0, 0, 1);
      legPole.normalize();
      const cosine = Math.min(1, Math.max(-1, (thigh * thigh + reach * reach - shin * shin) / (2 * thigh * reach)));
      const sine = Math.sqrt(1 - cosine * cosine);
      legThigh.copy(legAlong).multiplyScalar(cosine).addScaledVector(legPole, sine);
      // The knee, and the shin from it to the target, both as directions.
      legShin.copy(legHip).addScaledVector(legThigh, thigh);
      legShin.subVectors(legHip.addScaledVector(legAlong, reach), legShin).normalize();
      aimBone(leg.upper, leg.lower.getWorldPosition(foldTip), legThigh, frame);
      aimBone(leg.lower, leg.lower.localToWorld(foldTip.copy(leg.ankle)), legShin, frame);
      leg.lower.localToWorld(foldTip.copy(leg.ankle));
      leg.foot.position.copy(leg.foot.parent!.worldToLocal(foldTip));
      leg.foot.updateMatrixWorld(true);
    });
  }
  if (seat.grip === undefined) return;
  gripAt.set(hip.x + seat.grip[0], hip.y + seat.grip[1], hip.z + seat.grip[2]);
  // Leaning forward from the waist until the shoulders are an arm, less a
  // twentieth, from the grip — no further than `RIDE_LEAN`.
  const spine = limbs.spine;
  if (spine !== null) {
    frame.worldToLocal(spine.getWorldPosition(leanFrom));
    const [left, right] = limbs.arms as [Limbs['arms'][number], Limbs['arms'][number]];
    frame.worldToLocal(left.upper.getWorldPosition(legHip));
    frame.worldToLocal(right.upper.getWorldPosition(legKnee));
    legHip.add(legKnee).multiplyScalar(0.5).sub(leanFrom);
    frame.worldToLocal(left.lower.getWorldPosition(legKnee));
    frame.worldToLocal(left.wrist.getWorldPosition(legAnkle));
    frame.worldToLocal(left.upper.getWorldPosition(legTarget));
    const arm = (legTarget.distanceTo(legKnee) + legKnee.distanceTo(legAnkle)) * 0.95;
    let lean = 0;
    for (; lean < RIDE_LEAN; lean += LEAN_STEP) {
      const c = Math.cos(lean);
      const n = Math.sin(lean);
      leanTo.set(leanFrom.x + legHip.x, leanFrom.y + legHip.y * c - legHip.z * n, leanFrom.z + legHip.y * n + legHip.z * c);
      if (leanTo.distanceTo(gripAt) <= arm) break;
    }
    if (lean > 0) {
      // About the frame's own +X, which takes its +Y towards +Z: forward.
      leanAxis.set(1, 0, 0).transformDirection(frame.matrixWorld);
      spine.parent!.getWorldQuaternion(leanParent);
      leanTurn.setFromAxisAngle(leanAxis, Math.min(lean, RIDE_LEAN));
      leanTurn.premultiply(leanInverse.copy(leanParent).invert()).multiply(leanParent);
      spine.quaternion.premultiply(leanTurn);
      spine.updateMatrixWorld(true);
    }
  }
  reachArms(limbs, frame, gripAt);
}
