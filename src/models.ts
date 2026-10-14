/**
 * Baked and parsed models: a pack model merged, slotted, creased and inked;
 * paint, rigs and far frames.
 *
 * The pieces live in `models/`; this file re-exports them.
 */
export { CREASE, modelFrom, modelMaterial, paintColors, paintModel, weldedNormals } from './models/model.ts';
export type { Model, ModelOptions, Paint } from './models/model.ts';
export { makeRigged, rigFrom } from './models/rig.ts';
export type { Rig, Rigged } from './models/rig.ts';
export { bodyPaint, isGlass, onPalette, toned } from './models/palette.ts';
export { bakeSkin, coarsened, modelFromBaked, posedGeometry, rigFromBaked, slotTable } from './models/baked.ts';
export type { RigSource, SlotTable } from './models/baked.ts';
