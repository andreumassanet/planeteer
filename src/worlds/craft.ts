/**
 * The space vehicles: a rover for a crust, a lander that flies and a saucer
 * that hovers and flies (`ufo.ts`), one of each a world names standing beside
 * the spawn.
 *
 * Each is built from the context's primitives in palette colours and merged to
 * one mesh, sized against the person (`AVATAR_HEIGHT` 3.77: a rover is a car's
 * size, the lander a small house's), and the person sits in it the way they
 * sit in a plane on Earth — `avatar.sit`, hips at `FIGURE.hipY` over the
 * avatar's origin, the origin put where the seat wants the hips.
 *
 * The keys are Earth's: `W`/`S` the throttle, `A`/`D` to steer, and in the
 * lander `Space` to climb and `Shift` or `C` to come down — the aircraft's —
 * with the lander's thrusters holding it level when neither is held, which is
 * the one kindness a craft over a world with a twentieth of Earth's gravity
 * (or two and a half times it) owes a player who has never flown one.
 * Gravity is the body's: a lander with its engines cut falls at the world's
 * own rate.
 *
 * A planet may bring its own (`VehicleSpec`): a model and a name over one of
 * the motions, which is how Mercury's rover gets its sunshade, Venus its
 * armoured crawler and its aerostat, and the Moon the Lunar Roving Vehicle.
 * **Where the space kit is loaded the craft are its models** (`KitCraft`):
 * Quaternius's six-wheeled pressurised rover on a crust and its ship for the
 * lander, scaled so the person
 * sits in them (`DEFAULT_KITS`, measured against `FIGURE`), painted onto the
 * palette or in a planet's livery; a planet may name another model, and dress
 * it with parts of its own (`VehicleSpec.dress`: Mercury's sunshade). Until
 * the kit arrives the craft are built in code as below, and swapped for the
 * kit's in place when it does, the driver kept in the seat.
 *
 * The **aerostat** is the third motion: a balloon climbs and sinks slowly on
 * the lander's keys, holds whatever height it has when neither is held — it
 * floats, it does not hover on thrust — and goes where the wind goes when the
 * throttle is let go.
 *
 * The **saucer** (`ufo`) flies by the lander's laws — Earth's plane's climb,
 * flare and ceiling, its speed riding the height, the afterburner on the run
 * key, a fall with a parachute out of it aloft — with two differences that
 * are what makes it a saucer: it gathers and sheds speed at once, on its own
 * `accel`, where the lander eases into its speed over
 * `PLANE_ACCELERATION_TIME`, and it banks into a turn with a little wobble
 * under it. It is never the kit's: it is built in code (`ufo.ts`).
 *
 * There was a hover-skiff, Kenney's speeder that hovered a body's height over
 * a cloud deck; a craft that hovers and does not fly read as a mistake, and
 * the saucer took its place on the giants.
 */

import * as THREE from 'three';
import type { Handling, KitCraft, VehicleKind, VehicleModel, VehicleSpec, WindSpec } from './contract.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { mergeMeshes } from '../merge.ts';
import { FIGURE } from '../avatar.ts';
import { balloonModel } from '../craft/balloon.ts';
import type { CraftModel } from '../craft/contract.ts';
import {
  BALLOON_CEILING,
  BALLOON_CLIMB,
  BALLOON_SPEED,
  BALLOON_TURN,
  PLANE_ACCELERATION_TIME,
  PLANE_CEILING,
  PLANE_CLIMB_MIN,
  PLANE_CLIMB_RATE,
  PLANE_CRUISE_HIGH,
  PLANE_CRUISE_LOW,
  PLANE_FLARE,
  PLANE_TOUCHDOWN,
  PLANE_VERTICAL_TIME,
} from '../vehicles.ts';
import { PALETTE } from '../theme.ts';
import { ball, dome } from './architecture.ts';
import { paintModel } from '../models.ts';
import { craftPaint, onWorldKit, worldKit } from './kit.ts';
import type { WorldKit } from './kit.ts';
import { buildUfo } from './ufo.ts';
import type { UfoLivery, UfoState } from './ufo.ts';
import { cockpitOf } from './cockpit.ts';
import type { Cockpit } from './cockpit.ts';
import type { SeatedPose } from '../cast.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { HERO, SEAT_EYE } from '../craft/body.ts';
import { craftContext, craftMaterial as earthCraftMaterial, geometryOf, glassMaterial, soupOf } from '../craft/build.ts';
import type { Turning } from '../craft/build.ts';
import { GLASS_TINT, NEEDLE_REST, NEEDLE_SWEEP, WHEELS, WHEEL_LOCK, instrumentPanel, isGlassMaterial, painted, seatPieces, wheelAxle, wheelPart } from '../craft/cabin.ts';

/** What a craft is told each frame while it is driven. */
export interface Controls {
  /** -1 to 1: throttle back to forward. */
  throttle: number;
  /** -1 to 1: left to right. */
  steer: number;
  climb: boolean;
  descend: boolean;
  /** The run key: a ship's afterburner (`TURBO`). */
  boost?: boolean;
}

export interface Craft {
  kind: VehicleKind;
  name: string;
  object: THREE.Group;
  position: THREE.Vector3;
  /** Unit tangent: where it points. */
  heading: THREE.Vector3;
  speed: number;
  /** Its top speed, units a second: what the engine's note is measured against. */
  top: number;
  vertical: number;
  airborne: boolean;
  /** Where the driver's hips go, in the craft's frame. */
  seat: THREE.Vector3;
  /**
   * Whether the driver is out of sight. Since 2026-10-04 every closed craft
   * is glazed and furnished (`cockpit.ts`) and its driver seen through the
   * glass; this is for one whose cabin could not be fitted to the person —
   * never in the shipped worlds, which `scripts/check-worlds.ts` holds — and
   * which keeps the old answer, the body hidden in the hull.
   */
  closed: boolean;
  /** Whether the pilot stands rather than sits: a balloon's basket. */
  standing: boolean;
  /**
   * How the driver sits, as Earth's seats say it (`SeatedPose`): the legs to
   * the pedals or hanging, and the hands on what it is steered by — a wheel,
   * a yoke, the saucer's two sticks, the rover's T-handle (`holdWheel` in
   * `cast.ts`). Null standing in a basket.
   */
  pose: SeatedPose | null;
  /** The wheel's turn, radians, positive clockwise as the driver sees it: what the hands on it follow. */
  turn: number;
  /**
   * The eye in the craft's frame, for `V` in the seat: seated, `SEAT_EYE`
   * over the hip as on Earth; standing, a standing body's eye over its soles.
   * Every craft has one since 2026-10-04 (it was the saucer's alone).
   */
  eye: THREE.Vector3 | null;
  /** Whether the run key is an afterburner rather than a way down: what flies on thrust. */
  boosts: boolean;
  /** How far a person stands from its centre to board, units. */
  reach: number;
  /** Footprint radius: the wall it is when parked. */
  radius: number;
  /** Advances it a step under `controls`, or parked (`null`): it settles where it is. */
  update(dt: number, controls: Controls | null, groundAt: (point: THREE.Vector3) => number, gravity: number, radius: number): void;
}

interface Model {
  group: THREE.Group;
  seat: THREE.Vector3;
  radius: number;
  closed: boolean;
  /** The legs a ship stands on, folded away in flight; null for a craft with none. */
  gear: THREE.Object3D | null;
  /** Its exhausts' flames, each pointing back along -Z at a nozzle's mouth: scaled by how hard it burns. */
  flames: THREE.Object3D[];
  /** Whether its pilot stands, as in a balloon's basket, rather than sits. */
  stand?: boolean;
  /** The seated eye, for `V` in the seat; see `Craft.eye`. */
  eye?: THREE.Vector3;
  /** How the driver sits and what the hands hold; see `Craft.pose`. */
  pose?: SeatedPose;
  /** The wheels and the needles that turn as it is driven (`'steer'`, `'needle'` pivots, `cabin.ts`'s parts). */
  steers?: THREE.Object3D[];
  needles?: THREE.Object3D[];
  /** Its lights, legs and beam, told each frame how it is going (the saucer's). */
  animate?(dt: number, state: UfoState): void;
  /** Its group is drawn already — merged where it can be, glass and light where it cannot — and is not merged again. */
  drawn?: boolean;
}

/** A draft of the context's primitives as one vertex-coloured, inked mesh: how every craft is drawn. */
export function merged(draft: THREE.Group, gradientMap: THREE.Texture): THREE.Mesh {
  const arrays = mergeMeshes(draft);
  draft.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true) mesh.geometry.dispose();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(arrays.color, 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(arrays.outline, 3));
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, craftMaterial(gradientMap));
}

/** The vertex-coloured toon material a craft is drawn in, inked along its welded normals. */
function craftMaterial(gradientMap: THREE.Texture): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  material.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01], outlineNormal: true };
  return material;
}

/**
 * A turning part of a cabin (`cabin.ts`: the wheel, the needle) as Earth's
 * `assemble` stands one: a pivot of its name at its axle, stood at its tilt,
 * its mesh in the craft's material. The craft turns it about its own +Z.
 */
function pivotOf(part: Turning, gradientMap: THREE.Texture): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = part.name;
  pivot.position.copy(part.at);
  pivot.rotation.x = part.tilt ?? 0;
  const mesh = new THREE.Mesh(geometryOf([part.soup]), craftMaterial(gradientMap));
  mesh.name = `${part.name}-mesh`;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

/**
 * A code-built craft's draft drawn: its glass (any mesh in `glassMaterial`,
 * which writes no depth and must not be merged into an opaque fill) and its
 * turning pivots kept as they are, everything else merged into one inked
 * mesh (`merged`). Returns the drawn group, its wheels and its needles.
 */
function drawDraft(draft: THREE.Group, gradientMap: THREE.Texture): { group: THREE.Group; steers: THREE.Object3D[]; needles: THREE.Object3D[] } {
  const kept: THREE.Object3D[] = [];
  draft.traverse((one) => {
    const mesh = one as THREE.Mesh;
    if (one.name === 'steer' || one.name === 'needle') kept.push(one);
    else if (mesh.isMesh === true && !Array.isArray(mesh.material) && isGlassMaterial(mesh.material)) kept.push(one);
  });
  draft.updateMatrixWorld(true);
  for (const one of kept) {
    // Carried to the draft's own frame before it leaves it.
    one.matrixWorld.decompose(one.position, one.quaternion, one.scale);
    one.removeFromParent();
  }
  const group = new THREE.Group();
  const body = merged(draft, gradientMap);
  body.castShadow = true;
  group.add(body, ...kept);
  return { group, steers: kept.filter((one) => one.name === 'steer'), needles: kept.filter((one) => one.name === 'needle') };
}

/**
 * A furnished kit craft's shell: the painted model without the triangles its
 * cockpit drops (its windows, a canopy's cut), and with what a cut keeps of
 * the faces the canopy's rim crosses, each corner weighed from its face's
 * own so the paint, the creased normals and the ink's normals carry over. In
 * the pack's units, as the model is.
 */
function shellOf(painted: THREE.BufferGeometry, cockpit: Cockpit): THREE.BufferGeometry {
  const index = painted.index!;
  if (cockpit.pieces.length === 0) {
    const corners: number[] = [];
    for (let t = 0; t < index.count / 3; t++) if (cockpit.drop[t] === 0) corners.push(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2));
    const kept = painted.clone();
    kept.setIndex(corners);
    return kept;
  }
  // Pieces have corners of their own: the whole shell unindexed.
  const names = ['position', 'normal', 'outlineNormal', 'color'] as const;
  const sources = names.map((name) => painted.getAttribute(name));
  let triangles = cockpit.pieces.length;
  for (let t = 0; t < index.count / 3; t++) if (cockpit.drop[t] === 0) triangles++;
  const arrays = names.map(() => new Float32Array(triangles * 9));
  let at = 0;
  for (let t = 0; t < index.count / 3; t++) {
    if (cockpit.drop[t] !== 0) continue;
    for (let c = 0; c < 3; c++) {
      const v = index.getX(t * 3 + c);
      sources.forEach((source, a) => arrays[a]!.set([source.getX(v), source.getY(v), source.getZ(v)], at));
      at += 3;
    }
  }
  for (const { t, weights } of cockpit.pieces) {
    const v = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)];
    for (let c = 0; c < 3; c++) {
      sources.forEach((source, a) => {
        let x = 0;
        let y = 0;
        let z = 0;
        for (let j = 0; j < 3; j++) {
          const w = weights[c * 3 + j]!;
          x += w * source.getX(v[j]!);
          y += w * source.getY(v[j]!);
          z += w * source.getZ(v[j]!);
        }
        // The normals weighed back to unit length; positions and colours as they come.
        const unit = a === 1 || a === 2 ? 1 / Math.hypot(x, y, z) : 1;
        arrays[a]!.set([x * unit, y * unit, z * unit], at);
      });
      at += 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  names.forEach((name, a) => geometry.setAttribute(name, new THREE.BufferAttribute(arrays[a]!, 3)));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A see-through pane in Earth's glass (`glassMaterial`): blended, both sides, writing no depth, no ink, no shadow. */
function glassOf(geometry: THREE.BufferGeometry): THREE.Mesh {
  const pane = new THREE.Mesh(geometry, glassMaterial());
  pane.name = 'glass';
  pane.castShadow = false;
  pane.receiveShadow = true;
  return pane;
}

/** A standing pilot's eye over the soles: Earth's `STAND_EYE`, 0.93 of a body (`player.ts`), less the hip a seat is measured from. */
const STAND_EYE_OVER_HIP = AVATAR_HEIGHT * 0.93 - FIGURE.hipY;

/** The seated eye over a hip in a craft's frame, facing +Z: `SEAT_EYE`, as Earth's seats have it. */
function seatedEye(hip: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(hip.x, hip.y + SEAT_EYE.up, hip.z + SEAT_EYE.ahead);
}

/**
 * The kit's craft for each of the engine's kinds, fitted to the person
 * (`AVATAR_HEIGHT` 3.77, the hips `FIGURE.hipY` over the soles): the rover's
 * cab is a seated person's height and its track as wide as an avenue lets
 * pass, the ship a small house. The seats
 * were read off each model's own cab, side and plan views.
 */
export const DEFAULT_KITS: Readonly<Partial<Record<VehicleKind, KitCraft>>> = {
  // 8.6 long, where it was 7.4: at 7.4 its cab's raised front roof is 2.43
  // over its floor and a seated driver needs 2.67 (the floor's own rise, the
  // sole, the crown and a hand of air: `cockpit.ts`), so the body went
  // through the roof and was hidden; at 8.6 the crown clears the roof's
  // lining by 0.2 (`check-worlds.ts`).
  rover: { id: 'rover', length: 8.6, seat: [-0.17, 0.3, 0.06], closed: true },
  // Quaternius's Rae the Red Panda: a sleek two-winged ship on three legs,
  // the pilot in the fuselage with the head up in its canopy (`cockpit.ts`).
  // 19 long, where it was 16: the bubble over the fuselage is what the head
  // goes up into, and at 16 a seated crown was 0.1 through it; at 19 it
  // clears it by 0.37.
  // On its tail one turbine, in the engine block's flat back.
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

/** A planet's model as the engine's: its seated eye from its hip unless it says otherwise, and how it is driven. */
function modelOf(made: VehicleModel): Model {
  const seat = new THREE.Vector3(made.seat.x, made.seat.y, made.seat.z);
  const stand = made.stand === true;
  const eye = made.eye !== undefined ? new THREE.Vector3(made.eye.x, made.eye.y, made.eye.z) : stand ? seat.clone().setY(seat.y + STAND_EYE_OVER_HIP) : seatedEye(seat);
  return { group: made.group, seat, radius: made.radius, closed: false, gear: null, flames: [], stand, eye, ...(made.pose === undefined ? {} : { pose: made.pose }) };
}

/** A car's wheel, held as Earth's drivers hold theirs (`WHEELS.car`, `holdWheel`), the legs to the pedals. */
const AT_THE_WHEEL: SeatedPose = { legs: 'drive', wheel: WHEELS.car };

/**
 * A driver's place in a code-built craft, about the hip, from Earth's cabin
 * pieces (`cabin.ts`): the seat (`seatPieces`, its cushion's top the hip, a
 * pedestal down to `floor`), a car's wheel on its column (`wheelPart`, a
 * `'steer'` pivot the craft turns), and a panel of dials ahead of the knees
 * on a post to the floor (`instrumentPanel`) that the column runs into. In
 * `draft` for `drawDraft` to merge, all but the wheel.
 */
export function driverPlace(hip: THREE.Vector3, floor: number, trim: number): THREE.Group {
  const H = AVATAR_HEIGHT;
  const g = new THREE.Group();
  const seat = { x: hip.x, y: hip.y, z: hip.z, yaw: 0, pose: 'sit' as const, shown: true, legs: 'drive' as const };
  g.add(seatPieces(seat, floor, trim));
  const wheel = WHEELS.car;
  const centre = new THREE.Vector3(hip.x + wheel.centre[0], hip.y + wheel.centre[1], hip.z + wheel.centre[2]);
  // The panel's face where Earth's dashboard's is (0.4 of a body ahead of
  // the hip), its top at the wheel's, clear of the knees under it.
  const face = 0.4 * H;
  const top = wheel.centre[1] + 0.02 * H;
  g.add(instrumentPanel(seat, 0.5 * H, top, face, PALETTE.steel, 3));
  const post = new THREE.Vector3(hip.x, hip.y + top - 0.14 * H, hip.z + face + 0.025 * H);
  if (post.y - floor > 0.02 * H) g.add(craftStrut(post, post.clone().setY(floor), 0.03 * H, PALETTE.steel));
  const axle = wheelAxle(wheel);
  g.add(craftStrut(centre.clone().addScaledVector(axle, 0.02 * H), centre.clone().addScaledVector(axle, (face - wheel.centre[2]) / Math.cos(wheel.tilt)), 0.025 * H, PALETTE.steel));
  const part = wheelPart(wheel, centre, PALETTE.ink);
  const pivot = new THREE.Group();
  pivot.name = 'steer';
  pivot.position.copy(part.at);
  pivot.rotation.x = part.tilt ?? 0;
  const mesh = new THREE.Mesh(geometryOf([part.soup]), earthCraftMaterial());
  mesh.castShadow = true;
  pivot.add(mesh);
  g.add(pivot);
  return g;
}

/** A strut of Earth's craft pieces, for `driverPlace`. */
function craftStrut(from: THREE.Vector3, to: THREE.Vector3, thick: number, colour: number): THREE.Object3D {
  return craftContext().strut(from, to, thick, colour);
}

/**
 * A see-through dome over a code-built cockpit, in Earth's glass: a cap of
 * `radius` and `height` standing on `y`. No lining is wanted under it — what
 * is seen through it is the seat, the pilot and the deck's own top, none of
 * them a shell seen from behind.
 */
function glassDome(ctx: SceneryContext, radius: number, height: number, y: number, z = 0): THREE.Mesh {
  const draft = new THREE.Group();
  const cap = dome(ctx, radius, PALETTE.skyBlue, height / radius, 16);
  cap.position.set(0, y, z);
  draft.add(cap);
  return glassOf(geometryOf([painted(soupOf(draft), GLASS_TINT)]));
}

/**
 * The rover in code, until the kit's arrives: an open cab on six wheels, the
 * driver at a wheel (`driverPlace`) under a roll bar that clears the crown.
 */
function rover(ctx: SceneryContext): Model {
  const H = AVATAR_HEIGHT;
  const g = new THREE.Group();
  const body = ctx.box(3.4, 0.9, 5.2, PALETTE.white);
  body.position.y = 1.15;
  g.add(body);
  const deckY = 2.05;
  const deck = ctx.box(3.0, 0.25, 2.2, PALETTE.steel);
  deck.position.set(0, deckY, -1.2);
  g.add(deck);
  // The nose small and forward, clear of the driver's toes.
  const nose = ctx.taper(0.7, 0.5, 0.5, PALETTE.gold, 4);
  nose.position.set(0, deckY, 2.2);
  g.add(nose);
  for (const x of [-1.95, 1.95]) {
    for (const z of [-1.8, 0, 1.8]) {
      const wheel = ctx.column(0.8, 0.55, PALETTE.bark, 10);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x + (x > 0 ? -0.27 : 0.27), 0.8, z);
      g.add(wheel);
      const hub = ctx.column(0.32, 0.6, PALETTE.gold, 6);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x + (x > 0 ? -0.3 : 0.3), 0.8, z);
      g.add(hub);
    }
  }
  // The driver on the left (+X), the soles on the deck, the legs to the pedals.
  const hip = new THREE.Vector3(0.6, deckY + 0.02 * H + HERO.drive.sole, -0.8);
  g.add(driverPlace(hip, deckY, PALETTE.crimson));
  // The mast, the dish and a roll bar over the seat, a hand over the crown.
  const mast = ctx.column(0.12, 2.4, PALETTE.steel, 6);
  mast.position.set(-1.2, deckY, -2.4);
  g.add(mast);
  const dish = dome(ctx, 0.7, PALETTE.white, 0.35, 10);
  dish.rotation.x = Math.PI * 0.7;
  dish.position.set(-1.2, 4.6, -2.4);
  g.add(dish);
  const bar = hip.y + HERO.crown + 0.1 * H;
  for (const x of [-1.3, 1.3]) g.add(ctx.strut(new THREE.Vector3(x, deckY, -1.7), new THREE.Vector3(x * 0.8, bar, -2.0), 0.2, PALETTE.crimson));
  g.add(ctx.strut(new THREE.Vector3(-1.05, bar, -2.0), new THREE.Vector3(1.05, bar, -2.0), 0.2, PALETTE.crimson));
  return { group: g, seat: hip, radius: 3.2, closed: false, gear: null, flames: [], eye: seatedEye(hip), pose: AT_THE_WHEEL };
}

/**
 * The lander in code, until the kit's ship arrives: a capsule on four legs,
 * the pilot on its deck at a yoke (`driverPlace`) under a glass dome tall
 * enough for a seated crown and a hand over it.
 */
function lander(ctx: SceneryContext): Model {
  const H = AVATAR_HEIGHT;
  const g = new THREE.Group();
  const lift = 2.6;
  const body = ctx.taper(2.9, 2.1, 2.4, PALETTE.white, 8);
  body.position.y = lift;
  g.add(body);
  const band = ctx.ringWall(2.6, 3.0, 0.5, PALETTE.orange, 16);
  band.position.y = lift + 0.4;
  g.add(band);
  const engine = ctx.taper(1.1, 1.6, 1.0, PALETTE.steel, 8);
  engine.rotation.x = Math.PI;
  engine.position.y = lift;
  g.add(engine);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const hip = new THREE.Vector3(Math.cos(a) * 2.2, lift + 0.4, Math.sin(a) * 2.2);
    const foot = new THREE.Vector3(Math.cos(a) * 3.6, 0.2, Math.sin(a) * 3.6);
    g.add(ctx.strut(hip, foot, 0.28, PALETTE.steel));
    const pad = ctx.column(0.6, 0.25, PALETTE.bark, 8);
    pad.position.copy(foot).setY(0);
    g.add(pad);
  }
  const deck = lift + 2.4;
  // The hip a little behind the middle, so the toes (`HERO.drive.toe`) stay inside the dome.
  const hip = new THREE.Vector3(0, deck + 0.02 * H + HERO.drive.sole, -0.6);
  g.add(driverPlace(hip, deck, PALETTE.crimson));
  const collar = ctx.ringWall(2.0, 2.25, 0.25, PALETTE.steel, 16);
  collar.position.y = deck;
  g.add(collar);
  g.add(glassDome(ctx, 2.1, hip.y + HERO.crown + 0.15 * H - deck, deck));
  return { group: g, seat: hip, radius: 3.8, closed: false, gear: null, flames: [], eye: seatedEye(hip), pose: AT_THE_WHEEL };
}

/**
 * A balloon: an envelope on a ring of lines over an open gondola, burner in
 * the middle. The engine's own aerostat, for a world that names the kind.
 */
/**
 * The aerostat is **Earth's balloon** (`craft/balloon.ts`): the woven basket,
 * the gored envelope, the burner on its frame, in one of Earth's schemes
 * (`variant`); the pilot stands at the burner as on Earth. It was a ball on a
 * basket built here.
 */
let earthBalloon: CraftModel | null = null;
function aerostat(_ctx: SceneryContext, variant = 5): Model {
  earthBalloon ??= balloonModel();
  const seat = earthBalloon.seats[0]!;
  const radius = Math.max(earthBalloon.size[0], earthBalloon.size[1]) / 2;
  const hip = new THREE.Vector3(seat.x, seat.y, seat.z);
  return { group: earthBalloon.build(variant), seat: hip, radius, closed: false, gear: null, flames: [], stand: true, eye: hip.clone().setY(hip.y + STAND_EYE_OVER_HIP) };
}

/**
 * The saucer as the engine's model (`ufo.ts`), in `livery` or its own
 * colours. Its legs are its own to fold (`animate`), so it hands no `gear`.
 */
function ufo(ctx: SceneryContext, gradientMap: THREE.Texture, livery?: UfoLivery): Model {
  const made = buildUfo(ctx, gradientMap, livery);
  return { group: made.group, seat: made.seat, radius: made.radius, closed: false, gear: null, flames: [], eye: made.eye, pose: made.pose, animate: made.animate, drawn: true };
}

const MODELS: Record<VehicleKind, (ctx: SceneryContext, gradientMap: THREE.Texture, livery?: UfoLivery) => Model> = {
  rover,
  lander,
  aerostat: (ctx) => aerostat(ctx),
  ufo,
};
const NAMES: Record<VehicleKind, string> = { rover: 'the rover', lander: 'the lander', aerostat: 'the aerostat', ufo: 'the saucer' };

/** Handling, units and seconds. */
const HANDLING: Record<VehicleKind, Handling> = {
  rover: { top: 24, reverse: 8, accel: 9, turn: 1.3, climb: 0, sink: 0 },
  lander: { top: 90, reverse: 15, accel: 14, turn: 0.9, climb: 16, sink: 13 },
  // Brisk: to its top speed in about two seconds and round in three and a
  // half, against the lander's ease over `PLANE_ACCELERATION_TIME` and seven.
  ufo: { top: 75, reverse: 22, accel: 38, turn: 1.8, climb: 22, sink: 18 },
  aerostat: { top: BALLOON_SPEED, reverse: 3, accel: 2.2, turn: BALLOON_TURN, climb: BALLOON_CLIMB, sink: BALLOON_CLIMB * 0.8 },
};
/** How much faster a ship goes on its afterburner, and how long its flame is then, units. */
const TURBO = 3.6;
const FLAME_LENGTH = 9;
/** How high an aerostat may climb over the ground: Earth's balloon's, units. */
const AEROSTAT_CEILING = BALLOON_CEILING;
/** A saucer's bank into a full turn and the nod into full throttle, as tilts of its up; and its wobble's. */
const SAUCER_BANK = 0.3;
const SAUCER_NOD = 0.08;
const SAUCER_WOBBLE = 0.03;
/**
 * How fast a saucer's lift answers its keys, s: a third of the plane's
 * `PLANE_VERTICAL_TIME`, so let go of mid-climb it stops within a few of its
 * own heights rather than coasting up a dozen, which is what hovering is.
 */
const SAUCER_VERTICAL_TIME = PLANE_VERTICAL_TIME / 3;

// ---------------------------------------------------------------------------
// The planets' own
// ---------------------------------------------------------------------------

/**
 * Mercury's rover: the kit's long-cabbed rover under a white parasol on four
 * posts, because on the day side the one thing a driver needs more than
 * wheels is shade. Gold foil on the parasol's rim, like everything made there.
 */
export const SUNSHADE_ROVER: VehicleSpec = {
  kind: 'rover',
  name: 'the shade rover',
  // 11 long, where it was 9.4: the long rover's cab is raised only over its
  // front, and a seated crown clears it from 10.5 (`cockpit.ts`).
  kit: { id: 'rover-cab', length: 11, seat: [-0.17, 0.3, 0.17], closed: true, livery: { wall: PALETTE.white, roof: PALETTE.steel, accent: PALETTE.gold } },
  dress(ctx, size) {
    const g = new THREE.Group();
    const top = size.height * 0.62;
    const lift = size.height * 1.02;
    const x = size.width * 0.36;
    const z = size.length * 0.3;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) g.add(ctx.strut(new THREE.Vector3(sx * x, top, sz * z), new THREE.Vector3(sx * x * 0.95, lift, sz * z * 0.95), 0.16, PALETTE.steel));
    }
    const shade = dome(ctx, size.width * 0.62, PALETTE.white, 0.22, 12);
    shade.scale.z = size.length / size.width;
    shade.position.y = lift;
    g.add(shade);
    const foil = ctx.ringWall(size.width * 0.6, size.width * 0.64, 0.22, PALETTE.gold, 16);
    foil.scale.z = size.length / size.width;
    foil.position.y = lift - 0.1;
    g.add(foil);
    return g;
  },
  build(ctx) {
    const base = rover(ctx);
    const g = base.group;
    for (const x of [-1.35, 1.35]) {
      for (const z of [-1.5, 1.5]) g.add(ctx.strut(new THREE.Vector3(x, 2.05, z), new THREE.Vector3(x * 0.95, 5.0, z * 0.95), 0.16, PALETTE.steel));
    }
    const shade = dome(ctx, 3.4, PALETTE.white, 0.22, 12);
    shade.scale.z = 1.25;
    shade.position.y = 5.0;
    g.add(shade);
    const foil = ctx.ringWall(3.25, 3.45, 0.22, PALETTE.gold, 16);
    foil.scale.z = 1.25;
    foil.position.y = 4.9;
    g.add(foil);
    return { group: g, seat: { x: base.seat.x, y: base.seat.y, z: base.seat.z }, radius: base.radius + 0.3, pose: AT_THE_WHEEL };
  },
  handling: { top: 20 },
};

/**
 * Venus's crawler: the kit's long rover in a scorched livery; in code, a low armoured hull on two tracks, a squat domed cab and
 * slit windows, for ground at 464 degrees and ninety atmospheres. Slow, and it
 * does not care what it drives over.
 */
export const CRAWLER: VehicleSpec = {
  kind: 'rover',
  name: 'the crawler',
  // The kit's long rover in the colours of a hull that has been to 464 degrees.
  // 10.8 long, where it was 9: a seated crown clears the cab from 10.5 (`cockpit.ts`).
  kit: { id: 'rover-cab', length: 10.8, seat: [-0.17, 0.3, 0.17], closed: true, livery: { wall: PALETTE.steel, roof: PALETTE.bark, accent: PALETTE.gold } },
  build(ctx) {
    const g = new THREE.Group();
    for (const x of [-1.9, 1.9]) {
      const track = ctx.box(1.1, 1.3, 6.4, PALETTE.bark);
      track.position.set(x, 0, 0);
      g.add(track);
      for (const z of [-2.4, -0.8, 0.8, 2.4]) {
        const wheel = ctx.column(0.55, 1.16, PALETTE.steel, 8);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.62, z);
        g.add(wheel);
      }
    }
    const hull = ctx.taper(2.6, 2.1, 1.4, PALETTE.steel, 6);
    hull.scale.z = 1.4;
    hull.position.y = 1.2;
    g.add(hull);
    const armour = ctx.ringWall(2.4, 2.75, 0.45, PALETTE.clay, 6);
    armour.scale.z = 1.4;
    armour.position.y = 1.35;
    g.add(armour);
    // The cab: the driver on the hull's top at a wheel (`driverPlace`) under
    // a glass dome that clears the seated crown, where it was a slate dome
    // with slit windows the driver's head came out through.
    const deck = 2.6;
    const hip = new THREE.Vector3(0, deck + 0.02 * AVATAR_HEIGHT + HERO.drive.sole, -0.5);
    g.add(driverPlace(hip, deck, PALETTE.crimson));
    const collar = ctx.ringWall(1.8, 2.0, 0.25, PALETTE.clay, 12);
    collar.position.set(0, deck, 0.1);
    g.add(collar);
    g.add(glassDome(ctx, 1.95, hip.y + HERO.crown + 0.15 * AVATAR_HEIGHT - deck, deck, 0.1));
    const lamp = ctx.lit(ball(ctx, 0.35, PALETTE.gold, 8));
    lamp.position.set(0, 2.2, 3.05);
    g.add(lamp);
    return { group: g, seat: { x: hip.x, y: hip.y, z: hip.z }, radius: 3.4, pose: AT_THE_WHEEL };
  },
  handling: { top: 13, reverse: 5, accel: 5, turn: 0.9 },
};

/**
 * Venus's aerostat: the engine's balloon in the sulphur colours, slower still,
 * because at fifty kilometres up the air is a soup and the wind is the only
 * engine anybody trusts.
 */
export const VENUS_AEROSTAT: VehicleSpec = {
  kind: 'aerostat',
  name: 'the aerostat',
  build(ctx) {
    // Earth's balloon in its crimson and gold, the sulphur's colours.
    const made = aerostat(ctx, 6);
    return { group: made.group, seat: made.seat, radius: made.radius, stand: true };
  },
  handling: { climb: BALLOON_CLIMB * 0.7, sink: BALLOON_CLIMB * 0.6, top: BALLOON_SPEED * 0.8 },
};

const scratchUp = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchForward = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();
const basis = new THREE.Matrix4();
const turn = new THREE.Quaternion();

const scratchNorth = new THREE.Vector3();
const scratchEast = new THREE.Vector3();
const scratchDrift = new THREE.Vector3();

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
  const floats = kind === 'aerostat';
  /** A saucer takes its speed at once and wobbles; the lander eases into it. */
  const saucer = kind === 'ufo';
  const handling: Handling = { ...HANDLING[kind], ...spec?.handling };
  let tilt = new THREE.Vector3();
  /** How hard the afterburner is burning, 0 to 1, eased; and the flames' clock. */
  let burn = 0;
  let flicker = 0;
  /** The saucer's wobble's clock. */
  let wobble = 0;

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
    update(dt, controls, groundAt, gravity, R) {
      const up = scratchUp.copy(craft.position).normalize();
      // Carry the heading across the sphere: keep it tangent.
      craft.heading.addScaledVector(up, -craft.heading.dot(up)).normalize();
      const throttle = controls?.throttle ?? 0;
      const steer = controls?.steer ?? 0;
      // The afterburner: a ship in the air goes `TURBO` times as fast and
      // climbs twice as hard while it burns.
      const burning = flies && craft.airborne && controls?.boost === true;
      burn += ((burning ? 1 : 0) - burn) * Math.min(1, dt * 3);
      // A ship aloft flies by Earth's plane's laws (`vehicles.ts`): speed
      // rides the height, from its own top low down to `PLANE_CRUISE_HIGH`'s
      // share of it at `PLANE_CEILING`, eased over `PLANE_ACCELERATION_TIME`.
      const over = craft.position.length() - (R + groundAt(craft.position));
      const high = flies && craft.airborne ? Math.min(1, Math.max(0, over / PLANE_CEILING)) : 0;
      const top = handling.top * (1 + (PLANE_CRUISE_HIGH / PLANE_CRUISE_LOW - 1) * high) * (1 + (TURBO - 1) * burn);
      const target = throttle > 0 ? Math.max(throttle, burn) * top : throttle * handling.reverse;
      if (flies && craft.airborne && !saucer) craft.speed += (target - craft.speed) * (1 - Math.exp(-dt / PLANE_ACCELERATION_TIME)) * (1 + 2 * burn);
      else if (saucer && craft.airborne) {
        // Its own accel, scaled with the height's top speed so a climb to
        // the ceiling does not take a minute to reach its pace.
        const accel = handling.accel * (top / handling.top);
        craft.speed += Math.max(-accel * dt, Math.min(accel * dt, target - craft.speed));
      }
      else {
        const grip = craft.airborne && !flies && !floats ? 0.1 : 1;
        const accel = handling.accel * (1 + 2 * burn);
        craft.speed += Math.max(-accel * dt, Math.min(accel * dt, target - craft.speed)) * grip;
      }
      if (controls === null && !craft.airborne) craft.speed *= Math.exp(-3 * dt);
      const steering = flies || floats ? 1 : Math.min(1, Math.abs(craft.speed) / 4) * Math.sign(craft.speed || 1);
      if (steer !== 0) {
        turn.setFromAxisAngle(up, -steer * handling.turn * dt * steering);
        craft.heading.applyQuaternion(turn);
      }
      craft.position.addScaledVector(craft.heading, craft.speed * dt);
      // The wheel turns with the steering and comes back to the middle,
      // eased as Earth's does (`craft/motion.ts`); the needle reads the pace.
      // Grips that do not turn (the saucer's sticks, the T-handle) hold still.
      if ((model.steers?.length ?? 0) > 0) craft.turn += (steer * WHEEL_LOCK - craft.turn) * (1 - Math.exp(-12 * dt));
      else craft.turn = 0;
      for (const part of model.steers ?? []) part.rotation.z = craft.turn;
      for (const needle of model.needles ?? []) {
        const read = NEEDLE_REST + NEEDLE_SWEEP * Math.min(1, Math.abs(craft.speed) / Math.max(1, handling.top));
        needle.rotation.z += (read - needle.rotation.z) * (1 - Math.exp(-6 * dt));
      }

      const ground = R + groundAt(craft.position);
      let radial = craft.position.length();
      if (floats) {
        // Buoyant: the keys ask for a slow climb or sink, and with neither it
        // holds its height. Let go of (parked), it settles to the ground.
        const wanted = controls === null ? -handling.sink * 0.6 : controls.climb ? handling.climb : controls.descend ? -handling.sink : 0;
        if (!craft.airborne && wanted > 0) craft.airborne = true;
        if (craft.airborne) {
          craft.vertical += (wanted - craft.vertical) * Math.min(1, dt * 0.9);
          radial += craft.vertical * dt;
          // Aloft, the wind carries it — all of it with the throttle let go,
          // some of it under way.
          if (wind !== null && wind.speed > 0) {
            const north = scratchNorth.set(0, 1, 0).addScaledVector(up, -up.y);
            if (north.lengthSq() < 1e-8) north.set(1, 0, 0).addScaledVector(up, -up.x);
            north.normalize();
            // East is north x up in this project's frame (`sphere.ts`).
            const east = scratchEast.crossVectors(north, up).normalize();
            const b = (wind.toward * Math.PI) / 180;
            const drift = scratchDrift.copy(east).multiplyScalar(Math.sin(b)).addScaledVector(north, Math.cos(b));
            craft.position.addScaledVector(drift, wind.speed * 0.35 * (throttle === 0 ? 1 : 0.4) * dt);
            radial = Math.max(radial, ground);
          }
          radial = Math.min(radial, ground + AEROSTAT_CEILING);
          if (radial <= ground) {
            radial = ground;
            if (craft.vertical <= 0) {
              craft.airborne = false;
              craft.vertical = 0;
            }
          }
        } else {
          craft.vertical = 0;
          radial = ground;
          craft.speed *= Math.exp(-3 * dt);
        }
      } else if (flies) {
        // Earth's plane's climb (`PLANE_CLIMB_MIN`): the keys ask for a
        // vertical speed that grows with the height and eases into
        // `PLANE_CEILING`, and coming down it flares to `PLANE_TOUCHDOWN`.
        // Let go of in the air, a ship comes down by the same law and parks.
        const clearance = Math.max(0, radial - ground);
        const authority = Math.max(PLANE_CLIMB_MIN, handling.climb, clearance * PLANE_CLIMB_RATE);
        const headroom = Math.max(0, R + PLANE_CEILING - radial) * PLANE_CLIMB_RATE;
        const down = -Math.min(authority, Math.max(PLANE_TOUCHDOWN, clearance * PLANE_FLARE));
        const wanted =
          controls === null ? down : controls.climb ? Math.min(authority * (1 + burn), headroom) : controls.descend ? down : 0;
        if (craft.airborne) {
          // The thrusters chase the asked-for climb, as the plane's stick does.
          craft.vertical += (wanted - craft.vertical) * (1 - Math.exp(-dt / (saucer ? SAUCER_VERTICAL_TIME : PLANE_VERTICAL_TIME)));
        } else if (wanted > 0) {
          craft.vertical = wanted * 0.5;
          craft.airborne = true;
        } else craft.vertical = 0;
        radial = Math.min(Math.max(R + PLANE_CEILING, radial), radial + craft.vertical * dt);
        if (radial <= ground) {
          radial = ground;
          if (craft.airborne && craft.vertical <= 0) {
            craft.airborne = false;
            craft.vertical = 0;
          }
        }
        if (!craft.airborne) craft.speed *= Math.exp(-2.5 * dt);
      } else {
        // On the ground: hold to it, leave it over a crest and fall at the
        // world's own gravity, land again.
        if (craft.airborne) {
          craft.vertical -= gravity * dt;
          radial += craft.vertical * dt;
          if (radial <= ground) {
            radial = ground;
            craft.airborne = false;
            craft.vertical = 0;
          }
        } else if (radial - ground > 0.6 && Math.abs(craft.speed) > 8) {
          craft.airborne = true;
          craft.vertical = 0;
        } else radial = ground;
      }
      craft.position.setLength(radial);
      // The flames: a pilot light idling in the air, the whole length on the
      // afterburner, flickering, and out on the ground.
      if (model.flames.length > 0) {
        flicker += dt;
        const lit = craft.airborne ? 0.18 + 0.82 * burn : 0;
        for (const [k, flame] of model.flames.entries()) {
          flame.visible = lit > 0.02;
          const wobble = 1 + 0.12 * Math.sin(flicker * 47 + k * 2.1) + 0.06 * Math.sin(flicker * 83 + k);
          flame.scale.set(0.75 + 0.35 * lit, 0.75 + 0.35 * lit, FLAME_LENGTH * lit * wobble);
        }
      }
      // A ship's legs fold away once it is well clear of the ground, and come
      // down again on the way in.
      if (model.gear !== null) model.gear.visible = !craft.airborne || radial - ground < 6;
      model.animate?.(dt, { airborne: craft.airborne, over: radial - ground, pace: Math.min(1, Math.abs(craft.speed) / Math.max(1, top)), burn });

      // Lean with the ground: the normal from four samples round the craft.
      const forward = scratchForward.copy(craft.heading);
      const right = scratchRight.crossVectors(forward, up).normalize();
      let normal = up.clone();
      if (!flies && !floats && !craft.airborne) {
        const span = model.radius * 0.6;
        const h = (dx: number, dz: number): number =>
          groundAt(scratchPoint.copy(craft.position).addScaledVector(right, dx).addScaledVector(forward, dz));
        const slopeX = (h(span, 0) - h(-span, 0)) / (2 * span);
        const slopeZ = (h(0, span) - h(0, -span)) / (2 * span);
        normal = up.clone().addScaledVector(right, -slopeX).addScaledVector(forward, -slopeZ).normalize();
      } else if (saucer && craft.airborne) {
        // Banked into the turn and nodding into the throttle, over a slow
        // wobble that never quite settles: a saucer is never quite still.
        wobble += dt;
        normal
          .addScaledVector(right, steer * SAUCER_BANK + SAUCER_WOBBLE * Math.sin(wobble * 1.7))
          .addScaledVector(forward, throttle * SAUCER_NOD + SAUCER_WOBBLE * Math.cos(wobble * 1.3))
          .normalize();
      } else if ((flies || floats) && craft.airborne) {
        normal.addScaledVector(right, steer * (floats ? 0.05 : 0.25)).normalize();
      }
      tilt = tilt.lengthSq() === 0 ? normal : tilt.lerp(normal, Math.min(1, dt * 6)).normalize();
      const z = forward.addScaledVector(tilt, -forward.dot(tilt)).normalize();
      const x = scratchRight.crossVectors(tilt, z).normalize();
      basis.makeBasis(x, tilt, z);
      object.position.copy(craft.position);
      object.quaternion.setFromRotationMatrix(basis);
    },
  };
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
