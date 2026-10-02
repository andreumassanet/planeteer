/**
 * The space kit as the other worlds use it: fetched once a world is chosen,
 * kept for every world after, and asked for synchronously by the towns, the
 * crowd, the craft and the ground's scatter.
 *
 * `space-kit.ts` reads the files; this module decides **which** files a world
 * needs (`prepareWorldKit`), holds what has arrived (`worldKit`), tells the
 * streamers when it does (`onWorldKit`), and knows the pieces well enough to
 * place them before they arrive: how big each is drawn (`PIECES`), how many
 * triangles it costs, and how its slots are painted in a civilisation's
 * colours (`buildingPaint`, `creaturePaint`). The layout of a town is a pure
 * function of the world and the town, so it reads this table and never the
 * loaded models.
 *
 * **Headless there is no fetch**: a check hands the kit in with
 * `provideWorldKit`, read off disk, and without it everything that would draw
 * a kit piece draws its code-built stand-in (`settlements.ts`, `craft.ts`),
 * which is what `scripts/check-worlds.ts` measures.
 */

import * as THREE from 'three';
import type { SpaceCreature, SpacePiece } from '../space-kit.ts';
import type { ArchitectureStyle, WorldSpec } from './contract.ts';
import type { Paint } from '../models.ts';
import { onPalette, toned } from '../models.ts';
import { PALETTE } from '../theme.ts';
import type { Rng } from '../scenery/random.ts';

export interface WorldKit {
  /** Every static piece that has arrived, by manifest id: buildings, craft, props, flora. */
  pieces: Map<string, SpacePiece>;
  /** Every creature that has arrived, by manifest id. */
  creatures: Map<string, SpaceCreature>;
}

let kit: WorldKit | null = null;
const listeners = new Set<(kit: WorldKit) => void>();
const asked = new Set<string>();
let failed = false;

/** The kit as far as it has arrived, or null before anything has. */
export function worldKit(): WorldKit | null {
  return kit;
}

/** Whether a load was tried and failed: the code-built stand-ins are then for good. */
export function worldKitFailed(): boolean {
  return failed;
}

/**
 * Calls `listener` every time more of the kit arrives (now, if some has).
 * Returns the unsubscribe.
 */
export function onWorldKit(listener: (kit: WorldKit) => void): () => void {
  listeners.add(listener);
  if (kit !== null) listener(kit);
  return () => listeners.delete(listener);
}

function merge(more: Partial<WorldKit>): void {
  if (kit === null) kit = { pieces: new Map(), creatures: new Map() };
  for (const [id, piece] of more.pieces ?? []) kit.pieces.set(id, piece);
  for (const [id, creature] of more.creatures ?? []) kit.creatures.set(id, creature);
  for (const listener of listeners) listener(kit);
}

/** For a headless check: the kit read off disk, as if it had been fetched. */
export function provideWorldKit(more: Partial<WorldKit>): void {
  merge(more);
}

/** The creature ids a world's people are drawn as, visitors included. */
export function creaturesOf(spec: WorldSpec): string[] {
  const cast = spec.civilisation?.cast;
  if (cast === undefined) return [];
  return [...new Set([...cast.creatures.map((one) => one.item), ...(cast.visitors ?? [])])];
}

/**
 * Fetches what `spec` draws: the buildings, the props and the craft always,
 * the plants where the world has any, and its people's creatures. Resolves
 * once they are in (or have failed, which leaves the stand-ins); a no-op where
 * there is no document to fetch from.
 */
export async function prepareWorldKit(spec: WorldSpec): Promise<WorldKit | null> {
  if (typeof document === 'undefined') return kit;
  const groups: ('buildings' | 'craft' | 'props' | 'flora')[] = ['buildings', 'craft', 'props'];
  const gardens = spec.civilisation?.architecture.colony?.gardens ?? [];
  const plants = (spec.scatter?.flora.length ?? 0) > 0 || gardens.some((id) => SCATTER[id]?.kind === 'plant');
  if (plants) groups.push('flora');
  const wantGroups = groups.filter((group) => !asked.has(`group:${group}`));
  const wantCreatures = creaturesOf(spec).filter((id) => !asked.has(`creature:${id}`));
  if (wantGroups.length === 0 && wantCreatures.length === 0) return kit;
  try {
    const space = await import('../space-kit.ts');
    // The rig's body takes this material until a walker is given the crowd's.
    const placeholder = new THREE.MeshBasicMaterial();
    const [loadedGroups, loadedCreatures] = await Promise.all([
      Promise.all(wantGroups.map((group) => space.loadSpaceGroup(group))),
      Promise.all(wantCreatures.map((id) => space.loadCreature(id, placeholder))),
    ]);
    wantGroups.forEach((group) => asked.add(`group:${group}`));
    wantCreatures.forEach((id) => asked.add(`creature:${id}`));
    const pieces = new Map<string, SpacePiece>();
    for (const group of loadedGroups) for (const [id, piece] of group) pieces.set(id, piece);
    merge({ pieces, creatures: new Map(wantCreatures.map((id, i) => [id, loadedCreatures[i]!])) });
  } catch (error) {
    failed = true;
    console.warn('worlds: the space kit did not load; the towns and craft are built in code', error);
  }
  return kit;
}

// ---------------------------------------------------------------------------
// The pieces, as the layout knows them before they arrive
// ---------------------------------------------------------------------------

export type PieceRole = 'module' | 'hub' | 'hangar' | 'power' | 'mast' | 'roof' | 'tube' | 'support' | 'access' | 'frame' | 'gate';

export interface PieceInfo {
  role: PieceRole;
  /** World units a pack unit is drawn at, before a colony's `scale`. */
  scale: number;
  /** The pack's bounding box, x by y by z, and its centre in x and z (Kenney's sit off the origin). */
  size: readonly [number, number, number];
  centre: readonly [number, number];
  /** The lowest point, which is put on the floor. */
  floor: number;
  triangles: number;
  /** Whether a roof piece (`roof-*`) is authored to sit on it. */
  roofed?: boolean;
  /** Whether a tube may join it to a neighbour. */
  joins?: boolean;
}

/**
 * The person is `AVATAR_HEIGHT` (3.77) and the pack's astronaut 2.63 of its
 * units, so a module drawn at 1.43 is the astronauts' own size; at 2.15 a
 * module's round door is a little over a person's height, which is what a
 * town of them needs to read as buildings rather than as luggage.
 */
const MODULE = 2.15;

/** Copied from `manifest.json` (`scripts/build-space.ts`); `check-aliens.ts` holds the two together. */
export const PIECES: Readonly<Record<string, PieceInfo>> = {
  'base-large': { role: 'hub', scale: MODULE, size: [8.53, 4.97, 8.53], centre: [0, 0], floor: 0, triangles: 2790, joins: true },
  'building-l': { role: 'module', scale: MODULE, size: [7.8, 4.31, 7.79], centre: [1.9, -2.09], floor: 0.01, triangles: 2940, joins: true },
  'geodesic-dome': { role: 'hub', scale: MODULE, size: [8.53, 5.28, 8.53], centre: [0, 0], floor: 0, triangles: 1432 },
  'house-cylinder': { role: 'module', scale: MODULE, size: [5.61, 4.32, 5.61], centre: [0, 0], floor: 0, triangles: 1166, roofed: true, joins: true },
  'house-long': { role: 'module', scale: MODULE, size: [3.99, 4.31, 7.79], centre: [0, -2.08], floor: 0.02, triangles: 2228, joins: true },
  'house-open': { role: 'module', scale: MODULE, size: [3.99, 4, 3.61], centre: [0, 0], floor: 0, triangles: 1156, roofed: true, joins: true },
  'house-open-back': { role: 'module', scale: MODULE, size: [3.99, 4, 3.61], centre: [0, 0], floor: 0, triangles: 1180, roofed: true, joins: true },
  'house-single': { role: 'module', scale: MODULE, size: [3.99, 4, 3.8], centre: [0, -0.1], floor: 0, triangles: 1080, roofed: true, joins: true },
  'house-single-support': { role: 'support', scale: MODULE, size: [3.58, 0.87, 3.58], centre: [0, 0], floor: 0, triangles: 464 },
  connector: { role: 'tube', scale: MODULE, size: [3.37, 2.21, 2.17], centre: [1, 0], floor: 1.22, triangles: 508 },
  'metal-support': { role: 'frame', scale: MODULE, size: [0.14, 1.2, 5.95], centre: [0, 0], floor: 0.02, triangles: 540 },
  stairs: { role: 'access', scale: MODULE, size: [1.87, 1.39, 3.11], centre: [0, 2.87], floor: 0, triangles: 256 },
  ramp: { role: 'access', scale: MODULE, size: [1.87, 1.39, 3.11], centre: [0, 2.87], floor: 0, triangles: 192 },
  'roof-antenna': { role: 'roof', scale: MODULE, size: [1.41, 3.54, 1.43], centre: [0, 0], floor: 4.07, triangles: 492 },
  'roof-radar': { role: 'roof', scale: MODULE, size: [1.63, 2.71, 1.65], centre: [-0.1, 0.1], floor: 4.07, triangles: 972 },
  'roof-opening': { role: 'roof', scale: MODULE, size: [1.41, 1.2, 1.43], centre: [0, 0], floor: 4.07, triangles: 350 },
  'solar-ground': { role: 'power', scale: MODULE, size: [1.29, 1.1, 1.67], centre: [0, 0.05], floor: 0, triangles: 372 },
  'solar-array': { role: 'power', scale: MODULE, size: [4, 3.07, 4], centre: [0, 0], floor: 0.01, triangles: 1432 },
  'hangar-large': { role: 'hangar', scale: 6, size: [2, 1, 3], centre: [2, 1.5], floor: 0, triangles: 412 },
  'hangar-round': { role: 'hangar', scale: 4.2, size: [3.27, 1.5, 2.83], centre: [2, 1.5], floor: 0, triangles: 166 },
  'hangar-glass': { role: 'hangar', scale: 4.2, size: [3.27, 1.4, 2.83], centre: [2, 1.5], floor: 0, triangles: 113 },
  'hangar-small': { role: 'hangar', scale: 6, size: [2, 1, 2], centre: [2, 1.5], floor: 0, triangles: 280 },
  gate: { role: 'gate', scale: 9, size: [1, 1.01, 0.5], centre: [2, 1.5], floor: 0, triangles: 460 },
  'dish-large': { role: 'mast', scale: 9, size: [0.85, 0.81, 0.74], centre: [2, 1.4], floor: 0, triangles: 186 },
  dish: { role: 'mast', scale: 9, size: [0.7, 0.62, 0.7], centre: [2, 1.5], floor: 0, triangles: 390 },
  generator: { role: 'power', scale: 7, size: [1, 0.68, 1.3], centre: [2, 1.5], floor: 0, triangles: 126 },
  beacon: { role: 'mast', scale: 7, size: [0.75, 0.6, 0.5], centre: [2, 1.5], floor: 0, triangles: 174 },
  scaffold: { role: 'frame', scale: 6, size: [1, 1, 1], centre: [2, 1.5], floor: 0, triangles: 232 },
};

/** Props and plants, how big each is drawn: world units a pack unit, and its triangles. */
export const SCATTER: Readonly<Record<string, { scale: number; triangles: number; kind: 'rock' | 'crystal' | 'remains' | 'clutter' | 'plant' }>> = {
  'rock-1': { scale: 1.2, triangles: 224, kind: 'rock' },
  'rock-2': { scale: 1.2, triangles: 210, kind: 'rock' },
  'rock-3': { scale: 1.2, triangles: 224, kind: 'rock' },
  'rock-4': { scale: 1.2, triangles: 456, kind: 'rock' },
  'rock-large-1': { scale: 1.6, triangles: 222, kind: 'rock' },
  'rock-large-2': { scale: 1.4, triangles: 432, kind: 'rock' },
  'rock-large-3': { scale: 1.4, triangles: 448, kind: 'rock' },
  crystals: { scale: 7, triangles: 364, kind: 'crystal' },
  'crystals-large-a': { scale: 7, triangles: 384, kind: 'crystal' },
  'crystals-large-b': { scale: 7, triangles: 380, kind: 'crystal' },
  meteor: { scale: 6, triangles: 196, kind: 'rock' },
  'meteor-half': { scale: 6, triangles: 44, kind: 'rock' },
  'crater-large': { scale: 16, triangles: 60, kind: 'remains' },
  crater: { scale: 12, triangles: 60, kind: 'remains' },
  bones: { scale: 8, triangles: 168, kind: 'remains' },
  barrels: { scale: 5, triangles: 268, kind: 'clutter' },
  tank: { scale: 5, triangles: 338, kind: 'clutter' },
  crate: { scale: 2.2, triangles: 1348, kind: 'clutter' },
  jar: { scale: 2.2, triangles: 308, kind: 'clutter' },
  'tree-blob-3': { scale: 2.2, triangles: 1892, kind: 'plant' },
  'tree-floating-1': { scale: 2.2, triangles: 2440, kind: 'plant' },
  'tree-lava-1': { scale: 2.4, triangles: 1282, kind: 'plant' },
  'tree-lava-2': { scale: 2.4, triangles: 1174, kind: 'plant' },
  'tree-lava-3': { scale: 2.4, triangles: 1088, kind: 'plant' },
  'tree-light-1': { scale: 2.2, triangles: 2280, kind: 'plant' },
  'tree-light-2': { scale: 2.2, triangles: 1080, kind: 'plant' },
  'tree-spikes-1': { scale: 2, triangles: 2548, kind: 'plant' },
  'tree-spikes-2': { scale: 2, triangles: 1698, kind: 'plant' },
  'tree-spiral-1': { scale: 2.2, triangles: 748, kind: 'plant' },
  'tree-spiral-2': { scale: 2, triangles: 1490, kind: 'plant' },
  'tree-spiral-3': { scale: 2, triangles: 1280, kind: 'plant' },
  'tree-swirl-1': { scale: 1.8, triangles: 2010, kind: 'plant' },
  'tree-swirl-2': { scale: 1.9, triangles: 1112, kind: 'plant' },
  'bush-1': { scale: 1.8, triangles: 2304, kind: 'plant' },
  'bush-2': { scale: 1.8, triangles: 1504, kind: 'plant' },
  'bush-3': { scale: 1.8, triangles: 640, kind: 'plant' },
  'plant-1': { scale: 1.8, triangles: 540, kind: 'plant' },
  'plant-2': { scale: 1.8, triangles: 196, kind: 'plant' },
  'plant-3': { scale: 1.8, triangles: 1608, kind: 'plant' },
  'grass-1': { scale: 1.6, triangles: 246, kind: 'plant' },
  'grass-2': { scale: 1.6, triangles: 96, kind: 'plant' },
  'grass-3': { scale: 1.6, triangles: 408, kind: 'plant' },
};

/** Whether a name is a kit building (and not a form built in code). */
export const isKitBuilding = (name: string): boolean => PIECES[name] !== undefined;

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

/** The hex a slot was named after: `Atlas#777777` -> `777777`, or the material's name. */
const slotKey = (slot: string): string => slot.slice(slot.lastIndexOf('#') + 1).toLowerCase();

/**
 * How a building's slots take a civilisation's colours, by what the pack
 * painted them. Quaternius's colony is four greys — the light panels, the
 * shell, the dark trim, and the near-black of a window or a solar cell —
 * and Kenney's is metal, dark metal, a red-gold stripe and a dark trim.
 */
type BuildingRole = 'wall' | 'panel' | 'trim' | 'glass' | 'cell' | 'accent';
const BUILDING_SLOTS: Readonly<Record<string, BuildingRole>> = {
  ababab: 'panel',
  '777777': 'wall',
  '666666': 'trim',
  '373737': 'glass',
  '212121': 'glass',
  f1f1f1: 'accent',
  metal: 'wall',
  metaldark: 'panel',
  metalred: 'accent',
  dark: 'trim',
  _defaultmat: 'glass',
  // The rovers' greys, a shade off the colony's: the body, its trim, the
  // fenders, the stripe. The tyres (353535) keep their own dark.
  a9a9a9: 'wall',
  '646464': 'trim',
  '757575': 'panel',
  e19522: 'accent',
  // Rae the Red Panda, the lander: its orange hull, the dark bands round it,
  // and the near-black of the canopy and the nose.
  bd5c20: 'wall',
  '3f3f3f': 'accent',
  '222222': 'glass',
};

/** The one building's choice of its style's colours. */
export interface Livery {
  wall: number;
  roof: number;
  accent: number;
}

export function liveryOf(style: ArchitectureStyle, rng: Rng): Livery {
  return { wall: rng.pick(style.walls), roof: rng.pick(style.roofs), accent: rng.pick(style.accents) };
}

/** The glass of a window: a cool slate, never black (`scenery/contract.ts`), which glows after dark. */
export const GLASS = PALETTE.skyBlue;

/**
 * A kit building's paint in a livery. `glass` is filled with the slots that
 * are windows, which the town lights after dark; on a solar piece the
 * near-black is the cells, which do not.
 */
export function buildingPaint(id: string, livery: Livery, glass?: Set<string>): Paint {
  const solar = id.startsWith('solar');
  return (slot, original) => {
    const role = BUILDING_SLOTS[slotKey(slot)];
    switch (role) {
      case 'wall':
        return toned(livery.wall, 1);
      case 'panel':
        return toned(livery.wall, 1.12);
      case 'trim':
        return toned(livery.roof, 0.9);
      case 'accent':
        return toned(livery.accent, 1);
      case 'glass':
      case 'cell':
        if (solar) return toned(PALETTE.slate, 0.55);
        glass?.add(slot);
        return toned(GLASS, 0.62);
      default:
        return onPalette(original);
    }
  };
}

/**
 * What each creature's slots become in a species' colours, by the hex the pack
 * named them: `hide` is the individual's skin from `Species.hides`, `pale` and
 * `shade` the same lighter and darker, `trim` and `accent` drawn from the
 * species' own. A slot not named (the eyes, the mouth) keeps the pack's colour
 * brought onto the palette, so a face is still a face.
 */
type CreatureRole = 'hide' | 'pale' | 'shade' | 'trim' | 'accent';
export const CREATURE_SLOTS: Readonly<Record<string, Readonly<Record<string, CreatureRole>>>> = {
  greyling: { '335b16': 'hide' },
  alien: { '542964': 'hide', '4f7935': 'accent' },
  cactoro: { '5d8132': 'hide', '9e632a': 'accent', '721923': 'trim' },
  mushroomking: { a58c72: 'hide', '2a6f8b': 'accent', '738636': 'trim' },
  fish: { '047796': 'hide', '00afb1': 'pale', cc9129: 'accent' },
  frog: { a78213: 'hide', '201d0e': 'trim' },
  birb: { '355a96': 'hide', '979593': 'pale', '962118': 'accent' },
  monkroose: { '9e632a': 'hide', '7fa851': 'pale', '645c42': 'trim' },
  yeti: { a2a3a1: 'hide', '477d8d': 'trim', c2a586: 'pale' },
  greenblob: { '3d5235': 'hide' },
  pinkblob: { '8b3d5e': 'hide' },
  mushnub: { a58c72: 'hide', '2a6f8b': 'accent' },
  drifter: { '335b16': 'hide' },
  squidle: { '8b3d5e': 'hide', '2a6f8b': 'accent', a58c72: 'pale' },
  glub: { '403a5a': 'hide', '818181': 'pale' },
  hywirl: { '88459b': 'hide' },
};

/** One member's colours, drawn from the species. */
export interface Coat {
  hide: number;
  trim: number;
  accent: number;
}

export function creaturePaint(id: string, coat: Coat | null): Paint {
  const table = CREATURE_SLOTS[id];
  return (slot, original) => {
    const role = coat === null || table === undefined ? undefined : table[slotKey(slot)];
    switch (role) {
      case 'hide':
        return toned(coat!.hide, 1);
      case 'pale':
        return toned(coat!.hide, 1.32);
      case 'shade':
        return toned(coat!.hide, 0.72);
      case 'trim':
        return toned(coat!.trim, 1);
      case 'accent':
        return toned(coat!.accent, 1);
      default:
        return onPalette(original);
    }
  };
}

/** A craft's paint: the palette, or a civilisation's colours on its panels and stripe. */
export function craftPaint(livery: Livery | null): Paint {
  // A near-black is a window or a cab's inside: a dark slate, never the ink.
  const dark = (original: THREE.Color): THREE.Color | null => (lightnessOf(original) < 0.16 ? toned(PALETTE.slate, 0.42) : null);
  if (livery === null) return (_slot, original) => dark(original) ?? onPalette(original);
  return (slot, original) => {
    const shade = dark(original);
    if (shade !== null) return shade;
    const role = BUILDING_SLOTS[slotKey(slot)];
    if (role === 'wall') return toned(livery.wall, 1);
    if (role === 'panel') return toned(livery.wall, 1.1);
    if (role === 'accent') return toned(livery.accent, 1);
    if (role === 'trim') return toned(livery.roof, 0.85);
    return onPalette(original);
  };
}

/** A pack colour's sRGB lightness, 0 to 1. */
export function lightnessOf(color: THREE.Color): number {
  const hsl = { h: 0, s: 0, l: 0 };
  color.clone().convertLinearToSRGB().getHSL(hsl);
  return hsl.l;
}
