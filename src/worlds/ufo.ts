/**
 * The saucer: the one craft of the walked worlds that is nobody's pack model
 * — a flying disc, built in code in the world's own style, that a traveller
 * can climb into and fly, and that the inhabitants fly over their towns
 * (`skyships.ts`, which draws this same model).
 *
 * **What it is.** A lens of toned metal — a belly, a lower and an upper hull
 * in two slopes each, so the pen draws the rings a saucer is read by — round
 * an equatorial band carrying a ring of lamps that chase round it in flight;
 * on top a collar and a **glass dome** with a cockpit under it, in the
 * cabin's matte greys rather than the livery: a floor, a bucket seat on a
 * pedestal, a horseshoe console round the knees (`UFO_CONSOLE`) with round
 * glowing buttons, a radar dial and two small screens, a lever each side
 * that the pilot's hands hold (`UFO_STICKS`), and the pilot sat at it, seen
 * through the glass. From the seat (`V`) the console is the bottom of the
 * view and the saucer's rim shows over it. Under it four short legs, which fold up into the
 * belly once it is well clear of the ground, a glowing ring on the belly, and
 * low over the ground a soft cone of light down to it.
 *
 * **Sized against the person, never a literal.** Every length is a share of
 * `AVATAR_HEIGHT` (`H`, 3.77): the seated body's own reach (`HERO` in
 * `craft/body.ts`, measured off the cast) decides the cockpit — the soles on
 * the floor, the hips `HERO.sole` over them, the crown `HERO.crown` over the
 * hips — and the dome is what clears that crown by a margin
 * (`UFO_HEAD_ROOM`). The disc is 2.2 bodies in radius, the size of the
 * lander's kit ship, and the dome 1 body: the classic proportion, a dome a
 * little under half the disc.
 *
 * **The glass**, which is the trap here: a see-through fill that writes no
 * depth shows the inside of its own ink hull as a black blob (`fade.ts`), so
 * the dome has **no hull** (`outlineParameters.visible = false`), writes its
 * depth, and is drawn as two shells — the far side first (`BackSide`), then
 * the near (`FrontSide`) — so from outside the glass is two panes deep and
 * the order of its own triangles never matters, and from the seat (`V`) the
 * near shell is culled and the far one is the one pane round the eye. The
 * pilot and the cockpit are opaque and drawn before it, so they are seen
 * through the tint; their ink is hidden behind the glass's depth, which reads
 * as glass rather than as a missing line. From the seat the dome is faint
 * (`atlasFaint`, `faintGlass` in `craft/build.ts`), as a car's windscreen is
 * on Earth: at its outside tint it was a blue filter over the whole view.
 *
 * **What glows is light, not paint**: the lamps (one instanced mesh, their
 * colours rewritten each frame for the chase), the console's lights, the
 * belly's ring and the beam are `MeshBasicMaterial`s with no ink, as the
 * afterburner's flame is (`craft.ts`). Everything else is merged into one
 * vertex-coloured, inked mesh (`merged`), as every craft is.
 *
 * Where a saucer is parked is `arrival.ts`'s (`ufoParkingOf`), a pure
 * function of a town, so every client agrees with nothing on the wire.
 */

import * as THREE from 'three';
import type { SceneryContext } from '../scenery/contract.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { HERO, SEAT_EYE } from '../craft/body.ts';
import type { SeatedPose, WheelGrip } from '../cast.ts';
import { PALETTE } from '../theme.ts';
import { mergeMeshes } from '../merge.ts';
import { merged } from './craft.ts';

const H = AVATAR_HEIGHT;

/** The disc's radius at its band, units: 2.2 bodies, the lander's kit ship's size. */
const DISC = 2.2 * H;
/** How long the legs are: the belly stands this high over the ground when parked. */
const LEGS = 0.5 * H;
/** The lower hull's height, belly to band, the belly's share of it, and the upper's, band to the dome's collar. */
const LOWER = 0.3 * H;
const BELLY = 0.12 * H;
const UPPER = 0.32 * H;
/** The band's centre and the top of the upper hull, where the cockpit floor and the collar are. */
const BAND_Y = LEGS + LOWER;
const DECK_Y = BAND_Y + UPPER;
/** The cockpit floor, stepped proud of the hull's cap (`PROUD` is 0.08; this is more). */
const FLOOR = 0.06 * H;
const FLOOR_Y = DECK_Y + FLOOR;
/**
 * The seated hips over the floor: the soles a hair over it. `HERO.sole` is
 * how far the cast's seated soles hang under its hips, and the hip lands on
 * the seat's surface (`craft/body.ts`), so the cushion's top is here too.
 */
const HIP_Y = FLOOR_Y + HERO.sole + 0.01 * H;
/** The dome: a hemisphere on the collar, a body in radius. */
const DOME_RADIUS = 1.0 * H;
const DOME_HEIGHT = 1.0 * H;
/**
 * How much of what is behind it each of the dome's two shells lets through:
 * the pair is about a third, as one of Earth's panes is a quarter
 * (`GLASS_OPACITY`), so the pilot and the cockpit's colours read through
 * it; at 0.28 a shell the cockpit came out a blue silhouette.
 */
const UFO_GLASS_OPACITY = 0.2;
/** How many lamps ride the band. */
const LAMPS = 16;
/** The beam is drawn under this height of the belly over the ground, units, and fades in under it. */
const BEAM_REACH = 14 * H;

/**
 * The cockpit's own numbers, for `scripts/check-worlds.ts`: the seated hips
 * and the dome they sit under, in the craft's frame (standing on `y = 0`,
 * facing +Z), and the least room the crown is to have under the glass.
 */
export const UFO_COCKPIT = {
  hip: { x: 0, y: HIP_Y, z: -0.02 * H },
  dome: { y: DECK_Y, radius: DOME_RADIUS, height: DOME_HEIGHT },
  floor: FLOOR_Y,
} as const;
/**
 * The two sticks the pilot holds, as a wheel whose rim is the knobs
 * (`WheelGrip`, `holdWheel` in `cast.ts`): its middle about the hip, upright
 * (no tilt), each hand a quarter turn round from its top — so the left on
 * the left knob, the right on the right, at the middle's height. Forward
 * and high enough that the hands on them are in the first-person view
 * (some 26 degrees under the eye's level), as Earth's wheels stand where
 * they are seen; so the pilot leans in to them (`WHEEL_LEAN`), and leaning,
 * each knob is 0.22 of a body from its shoulder, within the arm's 0.22 and
 * a hand (`HERO.reachFrom`, `HERO.reach`; `wheelFaults` in the checks).
 */
export const UFO_STICKS: WheelGrip = { centre: [0, 0.32 * H, 0.31 * H], tilt: 0, radius: 0.14 * H, spread: Math.PI / 2 };
/**
 * The horseshoe console about the seated hips, in their frame: its inner
 * and outer radius (the inner past the toes, `HERO.toe`), the arc it spans
 * ahead and in how many segments, the desk's height at its inner and outer
 * edge over the hip, and how far round from ahead its two screens stand.
 * From the seated eye the desk's far edge is 28 degrees under its level,
 * a degree under the line to the rim's band (27), so the band shows over
 * the console, and the screens' tops 20: with the seat's gaze tipped 14
 * down (the helicopter's, `camera.ts`) the console is the bottom quarter of
 * the view and the way ahead is over it. Higher, it hid the rim and was
 * half the frame.
 */
const UFO_CONSOLE = { inner: 0.46 * H, outer: 0.7 * H, span: (150 * Math.PI) / 180, segments: 5, low: 0, high: 0.1 * H, screens: (38 * Math.PI) / 180 } as const;
/** The least room between the seated crown and the glass over it, units: a hand's breadth. */
export const UFO_HEAD_ROOM = 0.08 * H;
/** Its footprint: the band's outer edge, which is the wall it is when parked. */
export const UFO_RADIUS = DISC * 1.05;

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

/** The glow's colours, brightened past 1 as the afterburner's are, so they read as light in the toon's ramp. */
const bright = (color: number, gain: number): THREE.Color => new THREE.Color(color).multiplyScalar(gain);

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
  const sides = 24;
  const wall = livery.wall;

  // The lens, belly to collar: two slopes under the band and two over it,
  // each a tone of the hull's colour, so the pen draws four rings and the
  // sun steps down them.
  const belly = ctx.taper(0.8 * H, 1.45 * H, BELLY, ctx.tone(wall, 0.72), sides);
  belly.position.y = LEGS;
  hull.add(belly);
  const lower = ctx.taper(1.45 * H, DISC, LOWER - BELLY, ctx.tone(wall, 0.88), sides);
  lower.position.y = LEGS + BELLY;
  hull.add(lower);
  const upper = ctx.taper(DISC, 1.6 * H, UPPER * 0.55, wall, sides);
  upper.position.y = BAND_Y;
  hull.add(upper);
  const crown = ctx.taper(1.6 * H, 1.08 * H, UPPER * 0.45, ctx.tone(wall, 1.12), sides);
  crown.position.y = BAND_Y + UPPER * 0.55;
  hull.add(crown);
  // The band round the rim, proud of both hulls, in the accent: what the
  // lamps ride on, and the line a saucer is drawn by.
  const band = ctx.ringWall(DISC * 0.96, DISC * 1.05, 0.12 * H, livery.accent, sides);
  band.position.y = BAND_Y - 0.06 * H;
  hull.add(band);
  // A ring of vents round the belly, in the collar's colour.
  const vents = ctx.ringWall(0.62 * H, 0.82 * H, 0.06 * H, ctx.tone(livery.roof, 0.9), 16);
  vents.position.y = LEGS - 0.06 * H;
  hull.add(vents);
  // The collar the dome sits in.
  const collar = ctx.ringWall(DOME_RADIUS * 0.97, DOME_RADIUS * 1.1, 0.1 * H, ctx.tone(livery.roof, 1.15), sides);
  collar.position.y = DECK_Y;
  hull.add(collar);

  // The cockpit, in the cabin's matte colours rather than the livery's: a
  // floor, a bucket seat on a pedestal, a horseshoe console round the knees
  // with round glowing buttons, two small screens and a dial, and a lever
  // each side rising from the console to where the hands hold it.
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

  // The console: a horseshoe of segments round the hip's axis, past the
  // toes (`HERO.toe`), each a low body, a desk tilted up to the pilot and a
  // riser along its outer edge, the desk's far edge low enough that the
  // view ahead is over it.
  const glows = new THREE.Group();
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
  // Two small screens standing on the riser either side of the way ahead,
  // in their bezels, leaning back to the pilot.
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
  // A lever each side, from the console's inner lip up and back to its knob,
  // where a hand on it is (`UFO_STICKS`): within the hero's reach of each
  // shoulder as a pilot leaning in to the controls has it (`WHEEL_LEAN`).
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

  // The dome: the far shell, then the near, tinted and writing depth, no ink.
  const domeGeometry = new THREE.SphereGeometry(DOME_RADIUS, 24, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, DOME_HEIGHT / DOME_RADIUS, 1);
  const glass = (side: THREE.Side, order: number): THREE.Mesh => {
    const shell = side === THREE.BackSide ? domeGeometry : domeGeometry.clone();
    const material = new THREE.MeshToonMaterial({ color: PALETTE.skyBlue, gradientMap, transparent: true, opacity: UFO_GLASS_OPACITY, depthWrite: true, side });
    material.userData.outlineParameters = { visible: false };
    // Faint for the eye under it (`faintGlass`), as a car's windscreen is.
    material.userData.atlasFaint = true;
    const mesh = new THREE.Mesh(shell, material);
    mesh.position.y = DECK_Y + 0.02 * H;
    mesh.renderOrder = order;
    return mesh;
  };
  const far = glass(THREE.BackSide, 1);
  far.name = 'ufo glass';
  const near = glass(THREE.FrontSide, 2);
  near.name = 'ufo glass';
  group.add(far, near);

  // The legs, under a pivot at the belly so they fold up into it.
  const gear = new THREE.Group();
  gear.position.y = LEGS;
  const legs = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k / 4) * Math.PI * 2;
    const hip = new THREE.Vector3(Math.sin(a) * 0.95 * H, 0.04 * H, Math.cos(a) * 0.95 * H);
    const toe = new THREE.Vector3(Math.sin(a) * 1.4 * H, -LEGS + 0.06 * H, Math.cos(a) * 1.4 * H);
    legs.add(ctx.strut(hip, toe, 0.08 * H, ctx.tone(livery.roof, 1.1)));
    const pad = ctx.column(0.17 * H, 0.06 * H, ctx.tone(livery.roof, 0.85), 6);
    pad.position.set(toe.x, -LEGS, toe.z);
    legs.add(pad);
  }
  const legMesh = merged(legs, gradientMap);
  legMesh.castShadow = true;
  gear.add(legMesh);
  gear.name = 'gear';
  group.add(gear);

  // The lamps round the band: one instanced mesh, a colour each.
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  lampMaterial.userData.outlineParameters = { visible: false };
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075 * H, 8, 5), lampMaterial, LAMPS);
  lamps.name = 'ufo lamps';
  const place = new THREE.Matrix4();
  for (let k = 0; k < LAMPS; k++) {
    const a = (k / LAMPS) * Math.PI * 2;
    // A translation only: the determinant is 1 and no hull is mirrored.
    place.makeTranslation(Math.sin(a) * (DISC * 1.05 + 0.03 * H), BAND_Y, Math.cos(a) * (DISC * 1.05 + 0.03 * H));
    lamps.setMatrixAt(k, place);
  }
  group.add(lamps);
  const lit = bright(PALETTE.gold, 1.7);
  const resting = bright(livery.accent, 0.55);
  const lampColor = new THREE.Color();
  const paint = (phase: number, chase: number): void => {
    for (let k = 0; k < LAMPS; k++) {
      // Every fourth lamp lit, the lit ones running round the band.
      const wave = 0.5 + 0.5 * Math.cos((k / LAMPS) * Math.PI * 2 * 4 - phase);
      const on = chase * Math.pow(wave, 6);
      lampColor.copy(resting).lerp(lit, Math.min(1, on));
      lamps.setColorAt(k, lampColor);
    }
    if (lamps.instanceColor !== null) lamps.instanceColor.needsUpdate = true;
  };
  paint(0, 0.6);

  // The beam: an open cone of light from the belly to the ground, additive
  // and writing no depth, a unit long — stretched to the ground each frame.
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: bright(PALETTE.skyBlue, 1).lerp(new THREE.Color(PALETTE.white), 0.45),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  beamMaterial.userData.outlineParameters = { visible: false };
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, -0.5, 0), beamMaterial);
  beam.name = 'ufo beam';
  beam.position.y = LEGS - 0.08 * H;
  beam.renderOrder = 10;
  beam.visible = false;
  group.add(beam);

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
