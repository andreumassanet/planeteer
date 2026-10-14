/**
 * The space vehicles: a rover for a crust, a lander that flies and a saucer
 * that hovers and flies (`ufo.ts`), plus the aerostat, one of each a world
 * names standing beside the spawn.
 *
 * Where the space kit is loaded the craft are its models (`KitCraft`,
 * `DEFAULT_KITS`), fitted so the person sits in them and painted onto the
 * palette or in a planet's livery; until it arrives they are built in code
 * (`craft/built-models.ts`) and swapped for the kit's in place when it does,
 * the driver kept in the seat. The saucer is always code-built.
 *
 * The keys are Earth's: `W`/`S` the throttle, `A`/`D` to steer, and in the
 * lander `Space` to climb and `Shift` or `C` to come down. Gravity is the
 * body's. A planet may bring its own model and name over one of the motions
 * (`VehicleSpec`, `craft/planet-craft.ts`).
 *
 * Models and their sizes are in `craft/`; `craft/motion.ts` is how each kind
 * moves. This file builds a craft from a model and keeps it up to date.
 */

import * as THREE from 'three';
import type { Handling, VehicleKind, VehicleSpec, WindSpec } from './contract.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { FIGURE } from '../avatar.ts';
import { isGlassMaterial } from '../craft/cabin.ts';
import { craftMaterial as earthCraftMaterial } from '../craft/build.ts';
import { onWorldKit, worldKit } from './kit.ts';
import type { WorldKit } from './kit.ts';
import { MODELS, NAMES, modelOf } from './craft/built-models.ts';
import { drawDraft } from './craft/draw.ts';
import { HANDLING } from './craft/handling.ts';
import { DEFAULT_KITS, kitModel } from './craft/kit-model.ts';
import { createMotion } from './craft/motion.ts';
import type { Craft, Model } from './craft/types.ts';

export type { Controls, Craft } from './craft/types.ts';
export { merged } from './craft/draw.ts';
export { driverPlace } from './craft/driver.ts';
export { DEFAULT_KITS, kitModel } from './craft/kit-model.ts';
export { CRAWLER, SUNSHADE_ROVER, VENUS_AEROSTAT } from './craft/planet-craft.ts';

/** Lets a craft's own geometry and materials go, once it is out of the scene for good. */
export function disposeCraft(craft: Craft): void {
  (craft.object.userData.unsubscribe as (() => void) | undefined)?.();
  craft.object.removeFromParent();
  craft.object.traverse((one) => {
    const mesh = one as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    mesh.geometry.dispose();
    // Not a shared one: the flames', and Earth's glass and craft material,
    // which every cabin draws with (`craft/build.ts`).
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material.userData.shared !== true && !isGlassMaterial(material) && material !== earthCraftMaterial()) material.dispose();
    }
    // A saucer's lamps: their per-instance buffers too.
    if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) (mesh as THREE.InstancedMesh).dispose();
  });
}

/** One craft, of an engine kind or a planet's own; `wind` is what an aerostat drifts on. */
export function createCraft(
  vehicle: VehicleKind | VehicleSpec,
  ctx: SceneryContext,
  gradientMap: THREE.Texture,
  position: THREE.Vector3,
  heading: THREE.Vector3,
  wind: WindSpec | null = null,
): Craft {
  const spec = typeof vehicle === 'string' ? null : vehicle;
  const kind: VehicleKind = spec === null ? (vehicle as VehicleKind) : spec.kind;
  // The kit's model when it is here; the code-built one until it is.
  const made = spec === null ? DEFAULT_KITS[kind] : spec.kit;
  const fromKit = (kit: WorldKit): Model | null => (made === undefined ? null : kitModel(kit, made, gradientMap, ctx, spec?.dress));
  const loaded = worldKit();
  const kitted = loaded === null ? null : fromKit(loaded);
  let model: Model = kitted ?? (spec?.build !== undefined ? modelOf(spec.build(ctx)) : MODELS[kind](ctx, gradientMap, spec?.livery));
  let mesh: THREE.Object3D;
  if (kitted !== null || model.drawn === true) mesh = model.group;
  else {
    // A code-built draft: merged, but for its glass and its wheel.
    const drawn = drawDraft(model.group, gradientMap);
    mesh = drawn.group;
    model.steers = drawn.steers;
    model.needles = drawn.needles;
  }
  mesh.name = `craft ${kind}`;
  const object = new THREE.Group();
  object.name = kind;
  object.add(mesh);
  const flies = kind === 'lander' || kind === 'ufo';
  const handling: Handling = { ...HANDLING[kind], ...spec?.handling };

  const craft: Craft = {
    kind,
    name: spec?.name ?? NAMES[kind],
    object,
    position: position.clone(),
    heading: heading.clone(),
    speed: 0,
    top: handling.top,
    vertical: 0,
    airborne: false,
    // The hips over the seat's top; the avatar's origin goes `FIGURE.hipY` under them.
    seat: model.seat.clone().setY(model.seat.y - FIGURE.hipY),
    closed: model.closed,
    standing: model.stand === true,
    pose: model.stand === true ? null : (model.pose ?? null),
    turn: 0,
    eye: model.eye?.clone() ?? null,
    boosts: flies,
    reach: model.radius + 3,
    radius: model.radius,
    update: () => {},
  };
  craft.update = createMotion(craft, object, () => model, { flies, floats: kind === 'aerostat', saucer: kind === 'ufo', handling, wind });
  // The kit arriving after the craft was made: the code-built model goes and
  // the kit's takes its place, and the seat with it.
  if (kitted === null && made !== undefined) {
    const unsubscribe: () => void = onWorldKit((kit) => {
      const next = fromKit(kit);
      if (next === null) return;
      unsubscribe();
      object.remove(mesh);
      mesh.traverse((one) => {
        const part = one as THREE.Mesh;
        if (part.isMesh === true) part.geometry.dispose();
      });
      model = next;
      mesh = next.group;
      mesh.name = `craft ${kind}`;
      object.add(mesh);
      craft.seat.copy(model.seat).setY(model.seat.y - FIGURE.hipY);
      craft.closed = model.closed;
      craft.eye = model.eye?.clone() ?? null;
      craft.pose = model.stand === true ? null : (model.pose ?? null);
      // A pilot already aboard is under the new model's canopy, or over its seat.
      for (const child of object.children) if (child !== mesh && child.userData.pilot === true) child.visible = !craft.closed;
      craft.radius = model.radius;
      craft.reach = model.radius + 3;
    });
    // A craft let go of before the kit arrives stops waiting for it (`disposeCraft`).
    object.userData.unsubscribe = unsubscribe;
  }
  return craft;
}
