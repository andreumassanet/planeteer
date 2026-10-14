/**
 * The saucer: the one craft of the walked worlds that is nobody's pack model, a
 * flying disc built in code in the world's own style, that a traveller can
 * climb into and fly, and that the inhabitants fly over their towns
 * (`skyships.ts`, which draws this same model).
 *
 * A lens of toned metal (a belly, a lower and an upper hull in two slopes each,
 * so the pen draws the rings a saucer is read by) round an equatorial band
 * carrying a ring of lamps that chase round it in flight; on top a collar and a
 * glass dome with a cockpit under it (`ufo/cockpit.ts`), the pilot sat at it
 * and seen through the glass. Under it four short legs, which fold up into the
 * belly once it is well clear of the ground, a glowing ring on the belly, and
 * low over the ground a soft cone of light down to it. Dimensions are in
 * `ufo/dimensions.ts`; the outside is in `ufo/exterior.ts`.
 *
 * The glass: a see-through fill that writes no depth shows the inside of its
 * own ink hull as a black blob (`fade.ts`), so the dome has no hull
 * (`outlineParameters.visible = false`), writes its depth, and is drawn as two
 * shells, the far side first (`BackSide`), then the near (`FrontSide`). The
 * pilot and the cockpit are opaque and drawn before it, so they are seen through
 * the tint. From the seat the dome is faint (`atlasFaint`, `faintGlass` in
 * `craft/build.ts`), as a car's windscreen is on Earth.
 *
 * What glows is light, not paint: the lamps, the console's lights, the belly's
 * ring and the beam are `MeshBasicMaterial`s with no ink, as the afterburner's
 * flame is. Everything else is merged into one vertex-coloured, inked mesh
 * (`merged`), as every craft is. Where a saucer is parked is `arrival.ts`'s
 * (`ufoParkingOf`), a pure function of a town.
 */

import * as THREE from 'three';
import type { SceneryContext } from '../scenery/contract.ts';
import { SEAT_EYE } from '../craft/body.ts';
import type { SeatedPose } from '../cast.ts';
import { PALETTE } from '../theme.ts';
import { mergeMeshes } from '../merge.ts';
import { merged } from './craft/draw.ts';
import { addConsole, addScreens, addSeat, addSticks } from './ufo/cockpit.ts';
import { BEAM_REACH, H, HIP_Y, LEGS, UFO_RADIUS, UFO_STICKS } from './ufo/dimensions.ts';
import { addBeam, addDome, addGear, addHull, addLamps } from './ufo/exterior.ts';

export { UFO_COCKPIT, UFO_HEAD_ROOM, UFO_RADIUS, UFO_STICKS } from './ufo/dimensions.ts';

/** Its colours: the hull, the collar and the lamps' resting glow, and the band. */
export interface UfoLivery {
  wall: number;
  roof: number;
  accent: number;
}
const DEFAULT_LIVERY: UfoLivery = { wall: PALETTE.bone, roof: PALETTE.steel, accent: PALETTE.violet };

/** What a saucer is told each frame, to set its lights, its legs and its beam. */
export interface UfoState {
  airborne: boolean;
  /** The craft's origin (its feet) over the ground under it, units. */
  over: number;
  /** Speed as a share of its top speed, 0 to 1. */
  pace: number;
  /** How hard the boost burns, 0 to 1. */
  burn: number;
}

export interface UfoModel {
  group: THREE.Group;
  /** Where the hips go, in the model's frame. */
  seat: THREE.Vector3;
  /** The seated eye, in the model's frame: Earth's `SEAT_EYE` over the hips (`craft/body.ts`). */
  eye: THREE.Vector3;
  /** How the pilot sits: on a chair, a hand on each stick (`UFO_STICKS`). */
  pose: SeatedPose;
  radius: number;
  /** Lights, legs and beam, each frame. */
  animate(dt: number, state: UfoState): void;
}

/**
 * The parts that glow, merged into one mesh in a `MeshBasicMaterial` that
 * takes their colours from the vertices and draws no ink.
 */
function glowing(draft: THREE.Group, gain: number): THREE.Mesh {
  const arrays = mergeMeshes(draft);
  draft.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true) mesh.geometry.dispose();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(arrays.color, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  material.color.setScalar(gain);
  material.userData.outlineParameters = { visible: false };
  return new THREE.Mesh(geometry, material);
}

/** A saucer, standing on `y = 0` on its legs and facing +Z, in `livery`. */
export function buildUfo(ctx: SceneryContext, gradientMap: THREE.Texture, livery: UfoLivery = DEFAULT_LIVERY): UfoModel {
  const group = new THREE.Group();
  group.name = 'ufo';
  const hull = new THREE.Group();
  const glows = new THREE.Group();
  addHull(ctx, hull, livery);
  const seat = addSeat(ctx, hull, livery);
  addConsole(ctx, hull, glows, seat);
  addScreens(ctx, hull, glows, seat);
  addSticks(ctx, hull, glows, seat);

  const body = merged(hull, gradientMap);
  body.castShadow = true;
  body.name = 'ufo hull';
  group.add(body);

  // The console's lights and the belly's ring: light, in one mesh.
  const ring = ctx.ringWall(0.3 * H, 0.6 * H, 0.02 * H, PALETTE.skyBlue, 16);
  ring.position.y = LEGS - 0.075 * H;
  glows.add(ring);
  const glow = glowing(glows, 1.35);
  glow.name = 'ufo glow';
  group.add(glow);

  addDome(group, gradientMap);
  const gear = addGear(ctx, group, gradientMap, livery);
  const paint = addLamps(group, livery);
  const { beam, material: beamMaterial } = addBeam(group);

  let clock = 0;
  let fold = 1;
  const eye = new THREE.Vector3(seat.x, HIP_Y + SEAT_EYE.up, seat.z + SEAT_EYE.ahead);

  return {
    group,
    seat,
    eye,
    pose: { legs: 'chair', wheel: UFO_STICKS },
    radius: UFO_RADIUS,
    animate(dt, state) {
      clock += dt;
      // The legs fold into the belly once it is well clear of the ground,
      // and come down again on the way in: the lander's rule (`craft.ts`).
      const down = !state.airborne || state.over < LEGS + 6;
      fold += ((down ? 1 : 0) - fold) * Math.min(1, dt * 3);
      gear.scale.set(1, Math.max(0.02, fold), 1);
      gear.visible = fold > 0.04;
      // The lamps: a slow breath parked, a chase in flight that quickens
      // with the pace and the boost.
      const chase = state.airborne ? 1 : 0.35 + 0.25 * Math.sin(clock * 1.6);
      paint(clock * (state.airborne ? 3 + 9 * state.pace + 8 * state.burn : 0.8), chase);
      // The beam, low over the ground: down to it, wider at its foot.
      const belly = state.over + LEGS;
      const low = state.airborne ? Math.max(0, 1 - belly / BEAM_REACH) : 0;
      beam.visible = low > 0.01;
      if (beam.visible) {
        const reach = Math.max(0.5, belly - 0.08 * H);
        beam.scale.set(0.55 * H + reach * 0.22, reach, 0.55 * H + reach * 0.22);
        beamMaterial.opacity = 0.32 * low * (0.85 + 0.15 * Math.sin(clock * 7));
      }
    },
  };
}