/**
 * The saucer's cockpit, in the cabin's matte colours rather than the livery's:
 * a floor, a bucket seat on a pedestal, a horseshoe console round the knees with
 * round glowing buttons, a radar dial and two small screens, and a lever each
 * side that the pilot's hands hold (`UFO_STICKS`). Solid parts go in `hull`,
 * parts that glow in `glows`.
 */

import * as THREE from 'three';
import type { SceneryContext } from '../../scenery/contract.ts';
import { HERO } from '../../craft/body.ts';
import { PALETTE } from '../../theme.ts';
import { DECK_Y, DOME_RADIUS, FLOOR, FLOOR_Y, H, HIP_Y, UFO_CONSOLE, UFO_COCKPIT, UFO_STICKS } from './dimensions.ts';
import type { UfoLivery } from '../ufo.ts';

/** The floor, a bucket seat on a pedestal and its back. Returns where the hips go. */
export function addSeat(ctx: SceneryContext, hull: THREE.Group, livery: UfoLivery): THREE.Vector3 {
  const floor = ctx.column(DOME_RADIUS * 0.96, FLOOR, ctx.tone(PALETTE.bone, 0.78), 16);
  floor.position.y = DECK_Y;
  hull.add(floor);
  const seat = new THREE.Vector3(UFO_COCKPIT.hip.x, HIP_Y, UFO_COCKPIT.hip.z);
  const shell = ctx.tone(PALETTE.steel, 1.25);
  const padTone = ctx.tone(livery.accent, 0.62);
  const pedestal = ctx.column(0.08 * H, HIP_Y - FLOOR_Y - 0.07 * H, ctx.tone(PALETTE.steel, 0.9), 6);
  pedestal.position.set(0, FLOOR_Y, seat.z - 0.06 * H);
  hull.add(pedestal);
  const pan = ctx.box(0.42 * H, 0.05 * H, 0.38 * H, shell);
  pan.position.set(0, HIP_Y - 0.07 * H, seat.z - 0.05 * H);
  hull.add(pan);
  const cushion = ctx.box(0.36 * H, 0.02 * H, 0.32 * H, padTone);
  cushion.position.set(0, HIP_Y - 0.02 * H, seat.z - 0.05 * H);
  hull.add(cushion);
  // The back behind the rucksack (`HERO.back` is how far the hero reaches
  // behind the hip, pack and all), no higher than the shoulders, so from the
  // chase camera behind the saucer the pilot's head and shoulders show over
  // it; its padding proud of it, and a wing each side to make it a bucket.
  const backZ = seat.z - HERO.back - 0.06 * H;
  const backrest = new THREE.Group();
  backrest.position.set(0, HIP_Y - 0.07 * H, backZ);
  backrest.rotation.x = -0.14;
  backrest.add(ctx.box(0.42 * H, 0.38 * H, 0.06 * H, shell));
  const padding = ctx.box(0.32 * H, 0.28 * H, 0.02 * H, padTone);
  padding.position.set(0, 0.08 * H, 0.04 * H);
  backrest.add(padding);
  for (const side of [-1, 1]) {
    const wing = ctx.box(0.05 * H, 0.3 * H, 0.14 * H, shell);
    wing.position.set(side * 0.2 * H, 0.02 * H, 0.06 * H);
    wing.rotation.y = side * 0.3;
    backrest.add(wing);
  }
  hull.add(backrest);
  return seat;
}

/**
 * The horseshoe console: segments round the hip's axis, past the toes
 * (`HERO.toe`), each a low body, a desk tilted up to the pilot and a riser
 * along its outer edge, the desk's far edge low enough that the view ahead is
 * over it; with round buttons, a dial and a radar.
 */
export function addConsole(ctx: SceneryContext, hull: THREE.Group, glows: THREE.Group, seat: THREE.Vector3): void {
  const bodyTone = ctx.tone(PALETTE.steel, 1.3);
  const baseTone = ctx.tone(PALETTE.steel, 0.95);
  const trim = ctx.tone(PALETTE.steel, 0.55);
  const deskTone = ctx.tone(PALETTE.slate, 0.62);
  const lights = [PALETTE.gold, PALETTE.red, PALETTE.green, PALETTE.skyBlue, PALETTE.pink];
  const { inner, outer, span, segments, low, high } = UFO_CONSOLE;
  const step = span / segments;
  const tilt = Math.atan2(high - low, outer - inner);
  const run = Math.hypot(high - low, outer - inner);
  /** A frame on the desk of segment `k`: its middle, its top facing up and back at the seat. */
  const deskFrame = (k: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(0, HIP_Y, seat.z);
    pivot.rotation.y = -span / 2 + (k + 0.5) * step;
    const top = new THREE.Group();
    top.position.set(0, (low + high) / 2, (inner + outer) / 2);
    // Negative about x: the far edge rises, the top turns to the seat.
    top.rotation.x = -tilt;
    pivot.add(top);
    return pivot;
  };
  let lamp = 0;
  for (let k = 0; k < segments; k++) {
    const a = -span / 2 + (k + 0.5) * step;
    const width = 2 * outer * Math.sin(step / 2) + 0.01 * H;
    const pivot = new THREE.Group();
    pivot.position.set(0, HIP_Y, seat.z);
    pivot.rotation.y = a;
    // The body is set back under the desk's inner half, so the desk
    // overhangs it and reads as a desk from outside rather than a crate.
    const deep = (outer - inner) * 0.55;
    const base = ctx.box(width * 0.85, low - (FLOOR_Y - HIP_Y) - 0.02 * H, deep, baseTone);
    base.position.set(0, FLOOR_Y - HIP_Y, inner + deep / 2);
    pivot.add(base);
    const riser = ctx.box(width, high - low + 0.02 * H, 0.05 * H, bodyTone);
    riser.position.set(0, low - 0.02 * H, outer - 0.025 * H);
    pivot.add(riser);
    hull.add(pivot);
    const desk = deskFrame(k);
    const slab = ctx.box(width, 0.03 * H, run, deskTone);
    slab.position.y = -0.015 * H;
    desk.children[0]!.add(slab);
    hull.add(desk);
    // Round buttons along the desk's near edge, three a segment and one
    // either side of the dial, in the light's colours.
    const keys = deskFrame(k);
    const centre = Math.abs(k - (segments - 1) / 2) < 0.6;
    for (const row of [0.01]) {
      for (const across of [-1, 0, 1]) {
        if (centre && across === 0) continue;
        const key = ctx.column(0.016 * H, 0.012 * H, lights[lamp++ % lights.length]!, 6);
        key.position.set(across * width * 0.28, 0.009 * H, row * H);
        keys.children[0]!.add(key);
      }
    }
    glows.add(keys);
  }
  // The dial in the middle of the desk: a round radar screen in its bezel.
  const dialFrame = deskFrame((segments - 1) / 2);
  const bezel = ctx.ringWall(0.065 * H, 0.085 * H, 0.025 * H, trim, 10);
  bezel.position.set(0, 0, 0.04 * H);
  dialFrame.children[0]!.add(bezel);
  hull.add(dialFrame);
  const radar = deskFrame((segments - 1) / 2);
  const disc = ctx.column(0.068 * H, 0.008 * H, ctx.tone(PALETTE.green, 1.1), 10);
  disc.position.set(0, 0.012 * H, 0.04 * H);
  radar.children[0]!.add(disc);
  const sweep = ctx.box(0.008 * H, 0.004 * H, 0.06 * H, PALETTE.white);
  sweep.position.set(0.012 * H, 0.02 * H, 0.065 * H);
  sweep.rotation.y = 0.5;
  radar.children[0]!.add(sweep);
  glows.add(radar);
}

/** Two small screens standing on the riser either side of the way ahead, in their bezels, leaning back to the pilot. */
export function addScreens(ctx: SceneryContext, hull: THREE.Group, glows: THREE.Group, seat: THREE.Vector3): void {
  const { outer, high } = UFO_CONSOLE;
  const trim = ctx.tone(PALETTE.steel, 0.55);
  for (const side of [-1, 1]) {
    const frame = new THREE.Group();
    frame.position.set(0, HIP_Y, seat.z);
    frame.rotation.y = side * UFO_CONSOLE.screens;
    const stand = new THREE.Group();
    stand.position.set(0, high, outer - 0.03 * H);
    stand.rotation.x = 0.3;
    stand.add(ctx.box(0.17 * H, 0.12 * H, 0.03 * H, trim));
    frame.add(stand);
    hull.add(frame);
    const lit = new THREE.Group();
    lit.position.copy(frame.position);
    lit.rotation.copy(frame.rotation);
    const face = new THREE.Group();
    face.position.copy(stand.position);
    face.rotation.copy(stand.rotation);
    const screen = ctx.box(0.14 * H, 0.085 * H, 0.012 * H, side < 0 ? PALETTE.skyBlue : PALETTE.green);
    screen.position.set(0, 0.02 * H, -0.019 * H);
    face.add(screen);
    // A line of readout across each, in the other colour.
    const readout = ctx.box(0.09 * H, 0.01 * H, 0.004 * H, side < 0 ? PALETTE.green : PALETTE.skyBlue);
    readout.position.set(-0.015 * H, 0.075 * H, -0.027 * H);
    face.add(readout);
    lit.add(face);
    glows.add(lit);
  }
}

/** A lever each side, from the console's inner lip up and back to its knob, where a hand on it is (`UFO_STICKS`). */
export function addSticks(ctx: SceneryContext, hull: THREE.Group, glows: THREE.Group, seat: THREE.Vector3): void {
  const { inner, low } = UFO_CONSOLE;
  const trim = ctx.tone(PALETTE.steel, 0.55);
  for (const side of [-1, 1]) {
    const knob = new THREE.Vector3(side * UFO_STICKS.radius, HIP_Y + UFO_STICKS.centre[1], seat.z + UFO_STICKS.centre[2]);
    const a = side * 0.36;
    const root = new THREE.Vector3(Math.sin(a) * (inner + 0.02 * H), HIP_Y + low + 0.01 * H, seat.z + Math.cos(a) * (inner + 0.02 * H));
    const boot = ctx.column(0.04 * H, 0.03 * H, trim, 6);
    boot.position.copy(root).add(new THREE.Vector3(0, -0.02 * H, 0));
    hull.add(boot);
    hull.add(ctx.strut(root, knob, 0.028 * H, ctx.tone(PALETTE.steel, 1.35)));
    const grip = ctx.column(0.032 * H, 0.085 * H, ctx.tone(PALETTE.steel, 1.05), 6);
    grip.position.copy(knob).add(new THREE.Vector3(0, -0.06 * H, 0));
    hull.add(grip);
    const button = ctx.column(0.018 * H, 0.012 * H, side < 0 ? PALETTE.red : PALETTE.gold, 6);
    button.position.copy(knob).add(new THREE.Vector3(0, 0.025 * H, 0));
    glows.add(button);
  }
}
