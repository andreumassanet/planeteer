/**
 * The cast: the people of this world, as authored skinned characters.
 *
 * Quaternius's CC0 modular men and women (`scripts/build-cast.mjs`): fifteen
 * outfits on one 62-joint rig per body, and the pack's own idle, walk, run and
 * gesture clips. Every person is one continuous skinned mesh played by
 * authored clips.
 *
 * An outfit is a head, a top, a bottom and shoes (and the man's adventurer a
 * rucksack). Every man is skinned to one rig and every woman to another, so
 * any man's head goes on any man's top, trousers and shoes. A `Wardrobe` is
 * that choice, one `WornPart` a slot; an `OutfitId` alone is the pack's own
 * outfit, which is what the crowd wears. The rucksack is the one part that
 * crosses the two rigs; it is moved to meet a woman's back (`PACK_FIT`).
 *
 * The world does three things to them:
 *
 * - One mesh, one material, one draw call. Every chosen part is merged into
 *   one geometry with vertex colours, so two people in the same outfit can
 *   wear different clothes: `make` paints a fresh colour attribute over shared
 *   positions, normals and weights.
 * - Creased normals. Welding every edge under 50 degrees keeps the planes of a
 *   jacket and closes the ink hull, the way the world's faceted buildings are
 *   drawn.
 * - The world's ramp, pen and palette. Colours a person chooses go onto the
 *   surfaces `roleOf` names; every other surface is the pack's own colour moved
 *   onto the nearest entry of the palette (`paletteOf`).
 *
 * The pieces live in `cast/`; this file re-exports them.
 */
export { BODY_HEIGHT, CLIPS, OUTFITS, PARTS, bodyOf } from './cast/wardrobe.ts';
export type { BodyKind, ClipName, OutfitId, Paint, PartName, Wardrobe, WornPart } from './cast/wardrobe.ts';
export { castSkin, paintWith, paletteOf, roleOf } from './cast/roles.ts';
export type { Colours, Role } from './cast/roles.ts';
export { YOUNG_HEAD } from './cast/types.ts';
export type { Cast, Person } from './cast/types.ts';
export { castMaterial } from './cast/source.ts';
export { loadCast } from './cast/loader.ts';
export { aimArm, aimLeg, foldLegs, handHold, limbsOf, reachArms, twoBone } from './cast/limbs.ts';
export type { HandHold, Limbs } from './cast/limbs.ts';
export { RIDE_LEAN, poseAstride } from './cast/astride.ts';
export type { AstrideSeat } from './cast/astride.ts';
export { WHEEL_HOLD, WHEEL_LEAN, holdWheel, wheelHand, wheelLean } from './cast/wheel.ts';
export type { SeatedPose, WheelGrip } from './cast/wheel.ts';
