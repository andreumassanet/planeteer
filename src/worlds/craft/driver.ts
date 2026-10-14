/** A driver's place in a code-built craft, and the glass over it. */

import * as THREE from 'three';
import type { SceneryContext } from '../../scenery/contract.ts';
import type { SeatedPose } from '../../cast.ts';
import { craftContext, craftMaterial as earthCraftMaterial, geometryOf, soupOf } from '../../craft/build.ts';
import { GLASS_TINT, WHEELS, instrumentPanel, painted, seatPieces, wheelAxle, wheelPart } from '../../craft/cabin.ts';
import { PALETTE } from '../../theme.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { dome } from '../architecture.ts';
import { glassOf } from './draw.ts';

/** A car's wheel, held as Earth's drivers hold theirs (`WHEELS.car`, `holdWheel`), the legs to the pedals. */
export const AT_THE_WHEEL: SeatedPose = { legs: 'drive', wheel: WHEELS.car };

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
export function glassDome(ctx: SceneryContext, radius: number, height: number, y: number, z = 0): THREE.Mesh {
  const draft = new THREE.Group();
  const cap = dome(ctx, radius, PALETTE.skyBlue, height / radius, 16);
  cap.position.set(0, y, z);
  draft.add(cap);
  return glassOf(geometryOf([painted(soupOf(draft), GLASS_TINT)]));
}
