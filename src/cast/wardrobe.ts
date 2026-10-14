import * as THREE from 'three';

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
export function partOf(node: string): PartName | null {
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
export const BASE = `${import.meta.env?.BASE_URL ?? '/'}models/cast/`;

/** Faces meeting at less than this share a normal. See the note on creased normals. */
export const CREASE = (50 * Math.PI) / 180;

/**
 * How tall each body is drawn from, sole to crown, in the pack's metres: what
 * `make`'s `height` is a share of. The man in a hoodie is 1.8704 and the woman
 * in her casual clothes 1.8521, each from the lowest sole to the top of the
 * hair.
 *
 * One number a body, not a box a person: scaling an outfit by its own bounds
 * would make a punk's mohawk (1.97 over the sole) shrink the body under it,
 * and a traveller who tried a hat on would shrink.
 */
export const BODY_HEIGHT: Readonly<Record<BodyKind, number>> = { man: 1.8704, woman: 1.8521 };

/**
 * How far the rucksack, which is cut to the man's back, is moved to sit on a
 * woman's, in the pack's metres. Her back is five centimetres further forward
 * at the chest and her shoulders three lower; at no offset the straps stand
 * off her shoulders.
 */
export const PACK_FIT: Readonly<Record<BodyKind, readonly [number, number, number]>> = {
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
