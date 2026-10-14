/** The kit's craft as the engine's models: fitted to the person, furnished, and given legs and flames. */

import * as THREE from 'three';
import type { KitCraft, VehicleKind, VehicleSpec } from '../contract.ts';
import type { SceneryContext } from '../../scenery/contract.ts';
import { FIGURE } from '../../avatar.ts';
import { SEAT_EYE } from '../../craft/body.ts';
import { geometryOf } from '../../craft/build.ts';
import { paintModel } from '../../models.ts';
import { PALETTE } from '../../theme.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { cockpitOf } from '../cockpit.ts';
import type { Cockpit } from '../cockpit.ts';
import { craftPaint } from '../kit.ts';
import type { WorldKit } from '../kit.ts';
import { craftMaterial, glassOf, merged, pivotOf, shellOf } from './draw.ts';
import type { Model } from './types.ts';

/** A standing pilot's eye over the soles: Earth's `STAND_EYE`, 0.93 of a body (`player.ts`), less the hip a seat is measured from. */
export const STAND_EYE_OVER_HIP = AVATAR_HEIGHT * 0.93 - FIGURE.hipY;

/** The seated eye over a hip in a craft's frame, facing +Z: `SEAT_EYE`, as Earth's seats have it. */
export function seatedEye(hip: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(hip.x, hip.y + SEAT_EYE.up, hip.z + SEAT_EYE.ahead);
}

/**
 * The kit's craft for each of the engine's kinds, fitted to the person
 * (`AVATAR_HEIGHT`, the hips `FIGURE.hipY` over the soles): the rover's cab is
 * a seated person's height and its track as wide as an avenue lets pass, the
 * ship a small house. The seats are read off each model's own cab.
 */
export const DEFAULT_KITS: Readonly<Partial<Record<VehicleKind, KitCraft>>> = {
  // Long enough that a seated crown clears the cab's raised front roof
  // (`cockpit.ts`; `check-worlds.ts` holds the clearance).
  rover: { id: 'rover', length: 8.6, seat: [-0.17, 0.3, 0.06], closed: true },
  // A two-winged ship on three legs, the pilot in the fuselage with the head
  // up in its canopy (`cockpit.ts`); long enough that a seated crown clears
  // the bubble. One turbine on its tail, in the engine block's flat back.
  lander: { id: 'ship-panda', length: 19, seat: [0, 0.3, 0.12], legs: 1.7, closed: true, nozzles: [[0, 0.36, 0.2]], livery: { wall: PALETTE.white, roof: PALETTE.steel, accent: PALETTE.orange } },
};

/**
 * A kit craft as the engine's model: the pack's model scaled to `length`,
 * turned to face +Z, centred and stood on `y = 0`; the seat from its box; the
 * planet's own parts (`dress`) added in the same frame.
 */
export function kitModel(kit: WorldKit, made: KitCraft, gradientMap: THREE.Texture, ctx: SceneryContext, dress?: VehicleSpec['dress']): Model | null {
  const piece = kit.pieces.get(made.id);
  if (piece === undefined) return null;
  const box = piece.model.box;
  const size = box.getSize(new THREE.Vector3());
  const s = made.length / size.z;
  const flip = made.faces === '-z';
  const geometry = paintModel(piece.model, craftPaint(made.livery ?? null));
  // A closed craft's inside (`cockpit.ts`): a cab on wheels, a canopy on
  // legs; its windows and its cut taken out of the shell. A length that holds
  // nobody keeps the shell whole and the driver hidden, and says so.
  let cockpit: Cockpit | null = null;
  if (made.closed === true) {
    try {
      if (flip) throw new Error('a closed craft authored facing -Z is not furnished');
      cockpit = cockpitOf(piece.model, (made.legs ?? 0) > 0 ? 'canopy' : 'cab', s);
    } catch (error) {
      console.warn(`worlds: ${made.id} at ${made.length} has no inside`, error);
    }
  }
  const mesh = new THREE.Mesh(cockpit === null ? geometry : shellOf(geometry, cockpit), craftMaterial(gradientMap));
  mesh.name = 'shell';
  mesh.castShadow = true;
  const inner = new THREE.Group();
  inner.add(mesh);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const turned = new THREE.Group();
  turned.add(inner);
  turned.rotation.y = flip ? Math.PI : 0;
  turned.scale.setScalar(s);
  const group = new THREE.Group();
  group.add(turned);
  const width = size.x * s;
  const height = size.y * s;
  const length = size.z * s;
  const legs = made.legs ?? 0;
  turned.position.y = legs;
  if (dress !== undefined) {
    const dressed = merged(dress(ctx, { width, height, length }), gradientMap);
    dressed.position.y = legs;
    group.add(dressed);
  }
  let gear: THREE.Object3D | null = null;
  if (legs > 0) {
    gear = merged(landingGear(ctx, legs, width, length), gradientMap);
    gear.name = 'gear';
    group.add(gear);
  }
  // The turbines on its tail: a bell of dark metal with its throat lit, and
  // the flame that comes out of it.
  const flames: THREE.Object3D[] = [];
  if (made.nozzles !== undefined && made.nozzles.length > 0) {
    const bells = new THREE.Group();
    for (const [across, up, share] of made.nozzles) {
      const r = share * height;
      const x = across * width;
      const y = legs + up * height;
      const z = -length / 2;
      const bell = ctx.taper(r * 0.78, r, r * 1.1, ctx.tone(PALETTE.steel, 0.8), 14);
      bell.rotation.x = -Math.PI / 2;
      bell.position.set(x, y, z + r * 0.35);
      bells.add(bell);
      const rim = ctx.ringWall(r * 0.95, r * 1.08, r * 0.25, ctx.tone(PALETTE.steel, 1.2), 14);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(x, y, z - r * 0.72);
      bells.add(rim);
      const throat = ctx.lit(ctx.column(r * 0.7, r * 0.1, PALETTE.violet, 14), 1);
      throat.rotation.x = -Math.PI / 2;
      throat.position.set(x, y, z - r * 0.6);
      bells.add(throat);
      const flame = afterburner(r);
      flame.position.set(x, y, z - r * 0.75);
      flame.visible = false;
      group.add(flame);
      flames.push(flame);
    }
    group.add(merged(bells, gradientMap));
  }
  if (cockpit !== null) {
    // The inside, in the fitted frame, lifted onto the legs as the shell is.
    const inside = new THREE.Group();
    inside.name = 'cockpit';
    inside.position.y = legs;
    const cabin = new THREE.Mesh(geometryOf([cockpit.cabin]), craftMaterial(gradientMap));
    cabin.name = 'cabin';
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    inside.add(cabin, glassOf(geometryOf([cockpit.glass])));
    const pivots = cockpit.turning.map((part) => pivotOf(part, gradientMap));
    inside.add(...pivots);
    group.add(inside);
    const driver = cockpit.seats[0]!;
    const seat = new THREE.Vector3(driver.x, legs + driver.y, driver.z);
    return {
      group,
      seat,
      radius: Math.max(width, length) * 0.5,
      closed: false,
      gear,
      flames,
      eye: cockpit.eye.clone().setY(cockpit.eye.y + legs),
      pose: { legs: driver.legs ?? 'drive', ...(driver.wheel === undefined ? {} : { wheel: driver.wheel }) },
      steers: pivots.filter((one) => one.name === 'steer'),
      needles: pivots.filter((one) => one.name === 'needle'),
    };
  }
  const seat = new THREE.Vector3(made.seat[0] * width, legs + made.seat[1] * height, made.seat[2] * length);
  return { group, seat, radius: Math.max(width, length) * 0.5, closed: made.closed === true, gear, flames, eye: seatedEye(seat) };
}

/** The afterburner's light: violet and blown out, as a fighter's is at night. Shared by every flame. */
const FLAME_OUTER = new THREE.Color(PALETTE.violet).multiplyScalar(1.6);
const FLAME_CORE = new THREE.Color(PALETTE.pink).lerp(new THREE.Color(PALETTE.white), 0.6).multiplyScalar(2.2);
let flameMaterials: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial] | null = null;

/**
 * A flame out of a nozzle of radius `r`: a long violet cone round a short
 * white-hot one, pointing back along -Z, a unit long — `craft.update`
 * stretches it with the burn. Drawn without ink, additive, and writing no
 * depth, so it is light and not a solid.
 */
function afterburner(r: number): THREE.Group {
  flameMaterials ??= [FLAME_OUTER, FLAME_CORE].map((color) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    material.userData.outlineParameters = { visible: false };
    // Every flame's: never let go with one craft.
    material.userData.shared = true;
    return material;
  }) as [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(r * 0.85, 1, 14, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5), flameMaterials[0]);
  const core = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, 0.55, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.275), flameMaterials[1]);
  outer.renderOrder = core.renderOrder = 10;
  g.add(outer, core);
  return g;
}

/**
 * Three legs under a ship's belly — a nose leg and two under the wings —
 * each a strut, a knee brace and a foot pad, `legs` tall; the ship's box
 * `width` by `length` says where they go.
 */
function landingGear(ctx: SceneryContext, legs: number, width: number, length: number): THREE.Group {
  const g = new THREE.Group();
  const metal = ctx.tone(PALETTE.steel, 1.15);
  const feet: [number, number][] = [
    [0, length * 0.3],
    [-width * 0.22, -length * 0.22],
    [width * 0.22, -length * 0.22],
  ];
  for (const [x, z] of feet) {
    const hip = new THREE.Vector3(x * 0.8, legs + 0.35, z * 0.9);
    const foot = new THREE.Vector3(x, 0.25, z);
    g.add(ctx.strut(hip, foot, 0.32, metal));
    const knee = foot.clone().lerp(hip, 0.55);
    g.add(ctx.strut(knee, new THREE.Vector3(0, legs + 0.3, z * 0.6), 0.18, metal));
    const pad = ctx.column(0.62, 0.22, ctx.tone(PALETTE.steel, 0.8), 10);
    pad.position.set(x, 0, z);
    g.add(pad);
  }
  return g;
}
