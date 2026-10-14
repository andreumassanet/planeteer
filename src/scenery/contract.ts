/**
 * The scenery contract: the kit that inhabits the planet.
 *
 * `src/monuments/contract.ts` is the model for this file, and three things
 * differ from it:
 *
 * 1. A monument is authored; a house is generated. `build` takes an `Rng` and
 *    a `RegionStyle`, and determinism means the same world on every load and
 *    after a house is added (see `random.ts`).
 * 2. A monument's budget is per model; a settlement's is per town, and the
 *    binding cost is draw calls, so a part is capped hardest on colours
 *    (`KINDS`).
 * 3. A monument is figure; scenery is ground. Nothing here may reach the
 *    `building` tier's 40 units.
 *
 * What carries over unchanged is the palette, the ramp and the pen:
 * `createSceneryContext` wraps the monument context, so a house is inked with
 * the same `OutlineEffect` parameters as a landmark and asks for colour
 * through the same `toon`.
 *
 * The pieces live in `contract/`; this file composes the context and
 * re-exports everything.
 */
import { createContext } from '../monuments/contract.ts';
import type { MonumentContext } from '../monuments/contract.ts';
import { createForms } from './contract/forms.ts';
import { createMeshKit, mergeMeshes } from './contract/meshes.ts';
import { createPainting } from './contract/painting.ts';
import type { SceneryContext } from './contract/context-type.ts';

export { AVATAR_HEIGHT, SCENERY_SCALE } from '../stature.ts';
export { LEGIBLE_AT, STOREY } from './contract/scale.ts';
export { GLASS_TONE, PROUD, TONES } from './contract/tones.ts';
export { KINDS, VARIANTS } from './contract/kinds.ts';
export type { KindSpec, PartKind } from './contract/kinds.ts';
export { DOOR_HEAD, DOOR_JAMB, DOOR_REVEAL, DOOR_STEP, doorPaint } from './contract/style.ts';
export type { DoorSpec, RegionStyle, WindowRow } from './contract/style.ts';
export type { ModelFit, SceneryContext } from './contract/context-type.ts';
export {
  buildingPaint,
  findSceneryModel,
  registerSceneryModels,
  rolePaint,
  sceneryModel,
} from './contract/models.ts';
export { doorClashes, validatePart, variantRng, varietyOf } from './contract/part.ts';
export type { ScenicPart, Variety } from './contract/part.ts';
export type { Measurements } from '../monuments/contract.ts';
export { measure, paletteName } from '../monuments/contract.ts';
export type { Group, Mesh, Object3D, Vector3 } from '../monuments/contract.ts';
export type { Rng, Weighted } from './random.ts';
export { rngFrom, seedOf } from './random.ts';

/** A monument context extended with the kit's window, door, roof and painted-model builders. */
export function createSceneryContext(base: MonumentContext = createContext()): SceneryContext {
  const kit = createMeshKit(base);
  const painting = createPainting(base);
  const forms = createForms(base, kit);
  return {
    ...base,
    dispose() {
      painting.dispose();
      base.dispose();
    },
    painted: painting.painted,
    coloured: painting.coloured,
    fitted: painting.fitted,
    glass: kit.glass,
    panes: kit.panes,
    window: kit.makeWindow,
    windows: kit.windows,
    door: forms.door,
    merged: mergeMeshes,
    roof: forms.roof,
    dome: forms.dome,
    lit: forms.lit,
    rim: forms.rim,
    blob: forms.blob,
  };
}
