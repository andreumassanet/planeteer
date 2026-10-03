/**
 * What people left on the Moon, where they left it: four Apollo landing
 * sites, the first rover to drive another world, and the first craft on the
 * far side. Every coordinate is the site's published one (the Lunar
 * Reconnaissance Orbiter's re-surveys), and everything at a site is built
 * at a person's scale — **`M` units to the metre, the avatar's own** — so the
 * descent stage stands as tall over a visitor as it stood over the crews.
 *
 * Each site is levelled on its own pad and paved by the people who keep it
 * (`selenites.ts`): the paving is theirs, and so are the swept footprints.
 * The landmark's wall is a disc six tenths of its radius round the centre,
 * which is the descent stage and its legs; everything else stands between
 * that wall and the pad's edge, where a visitor can walk up to it.
 */

import * as THREE from 'three';
import type { Landmark, VehicleSpec } from '../../contract.ts';
import { dome, ball } from '../../architecture.ts';
import type { Group, SceneryContext } from '../../../scenery/contract.ts';
import { PROUD } from '../../../scenery/contract.ts';
import type { Rng } from '../../../scenery/random.ts';
import { AVATAR_HEIGHT, PERSON_METRES } from '../../../stature.ts';
import { PALETTE } from '../../../theme.ts';

/** Units to the metre at a person's scale: 2.15. */
const M = AVATAR_HEIGHT / PERSON_METRES;
/** The top of the paving a landmark stands on (`settlements.ts`: 0.45 thick, at -0.4). */
const PAVED = 0.05;

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x * M, y * M, z * M);

/** Puts `object` at (x, z) metres, turned by `yaw`, and returns it. */
function at<T extends THREE.Object3D>(object: T, x: number, z: number, yaw = 0): T {
  object.position.set(x * M, object.position.y, z * M);
  object.rotation.y = yaw;
  return object;
}

/** A wheel: a prism laid on its side, its axle along x, centred, resting on y = 0. */
function wheel(ctx: SceneryContext, radius: number, width: number, color: number, sides = 12): THREE.Group {
  const holder = new THREE.Group();
  const tyre = ctx.column(radius * M, width * M, color, sides);
  tyre.rotation.z = Math.PI / 2;
  tyre.position.set((width * M) / 2, radius * M, 0);
  holder.add(tyre);
  return holder;
}

/**
 * The Lunar Module's descent stage: all that is left at an Apollo site, since
 * the ascent stage flew back up from it. An octagon of gold foil 4.2 m across
 * on four legs whose pads stand 9.4 m apart, the engine bell under it, and the
 * ladder down the front leg with the plaque on it.
 */
function descentStage(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  const body = ctx.column(2.11 * M, 1.6 * M, PALETTE.gold, 8);
  body.position.y = 1.5 * M;
  g.add(body);
  // The black thermal panels on the four short faces.
  const panels = ctx.around(4, () => {
    const panel = ctx.box(1.3 * M, 1.2 * M, PROUD, PALETTE.bark);
    panel.position.set(0, 1.7 * M, 2.11 * M + PROUD / 2);
    return panel;
  });
  panels.rotation.y = Math.PI / 4;
  g.add(panels);
  const deck = ctx.column(1.85 * M, 0.14 * M, PALETTE.steel, 8);
  deck.position.y = 3.1 * M;
  g.add(deck);
  const bell = ctx.taper(0.75 * M, 0.45 * M, 0.9 * M, PALETTE.steel, 10);
  bell.position.y = 0.6 * M;
  g.add(bell);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const hip = v(s * 2.0, 2.9, c * 2.0);
    const foot = v(s * 4.4, 0.3, c * 4.4);
    g.add(ctx.strut(hip, foot, 0.2 * M, PALETTE.bone));
    const knee = hip.clone().lerp(foot, 0.55);
    for (const side of [-1, 1]) {
      g.add(ctx.strut(v(s * 1.9 + c * side * 0.9, 1.55, c * 1.9 - s * side * 0.9), knee, 0.1 * M, PALETTE.bone));
    }
    const pad = ctx.column(0.47 * M, 0.15 * M, PALETTE.bone, 10);
    pad.position.set(foot.x, 0, foot.z);
    g.add(pad);
  }
  // The ladder down the front (+z) leg, and the plaque: "Here men from the
  // planet Earth first set foot upon the Moon, July 1969 A.D. We came in peace
  // for all mankind." Every descent stage has one.
  for (const side of [-1, 1]) g.add(ctx.strut(v(side * 0.32, 2.85, 2.25), v(side * 0.32, 0.75, 3.95), 0.07 * M, PALETTE.bone));
  for (let k = 0; k < 6; k++) {
    const t = (k + 0.5) / 6;
    const y = 2.85 - 2.1 * t;
    const z = 2.25 + 1.7 * t;
    g.add(ctx.strut(v(-0.32, y, z), v(0.32, y, z), 0.05 * M, PALETTE.bone));
  }
  const plaque = ctx.box(0.5 * M, 0.32 * M, 0.04 * M, PALETTE.white);
  plaque.position.set(0, 1.55 * M, 3.35 * M);
  plaque.rotation.x = -0.68;
  g.add(plaque);
  return g;
}

/**
 * A flag on its pole and crossbar. The real ones have almost certainly been
 * bleached white by fifty years of unfiltered sun; these are kept in their
 * colours by the people who repaint them (`selenites.ts` says so). Lying, it is
 * Apollo 11's, which the ascent stage's exhaust blew over at lift-off.
 */
function flag(ctx: SceneryContext, lying = false): Group {
  const g = new THREE.Group();
  g.add(ctx.column(0.04 * M, 2.5 * M, PALETTE.bone, 6));
  g.add(ctx.strut(v(0, 2.45, 0), v(1.58, 2.45, 0), 0.05 * M, PALETTE.bone));
  const cloth = ctx.box(1.5 * M, 0.95 * M, 0.03 * M, PALETTE.white);
  cloth.position.set(0.8 * M, 1.5 * M, 0);
  g.add(cloth);
  const band = 0.95 / 7;
  const depth = 0.03 * M + 0.06;
  for (const k of [0, 2, 4, 6]) {
    const from = k < 3 ? 0.05 : 0.68;
    const stripe = ctx.box((1.55 - from) * M, band * M, depth, PALETTE.red);
    stripe.position.set(((from + 1.55) / 2) * M, (1.5 + k * band) * M, 0);
    g.add(stripe);
  }
  const canton = ctx.box(0.6 * M, 4 * band * M, depth + 0.02, PALETTE.steel);
  canton.position.set(0.37 * M, (1.5 + 3 * band) * M, 0);
  g.add(canton);
  if (!lying) return g;
  // Turned about x so the pole lies along +z, flat on the paving.
  const fallen = new THREE.Group();
  g.rotation.x = Math.PI / 2;
  g.position.y = 0.1 * M + PAVED;
  fallen.add(g);
  return fallen;
}

/** Boot prints, left and right, along a path of (x, z) metres. */
function footprints(ctx: SceneryContext, path: readonly (readonly [number, number])[], rng: Rng): Group {
  const g = new THREE.Group();
  let left = true;
  for (let k = 0; k + 1 < path.length; k++) {
    const [x0, z0] = path[k]!;
    const [x1, z1] = path[k + 1]!;
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.floor(length / 0.75));
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const side = (left ? -1 : 1) * 0.14;
      left = !left;
      const print = ctx.box(0.13 * M, 0.04, 0.3 * M, PALETTE.steel);
      print.position.set(
        (x0 + (x1 - x0) * t + Math.cos(yaw) * side) * M,
        PAVED,
        (z0 + (z1 - z0) * t - Math.sin(yaw) * side) * M,
      );
      print.rotation.y = yaw + rng.jitter() * 0.15;
      g.add(print);
    }
  }
  return g;
}

/** The Passive Seismic Experiment: a drum between two solar wings. It heard moonquakes for eight years. */
function seismometer(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  g.add(ctx.box(0.55 * M, 0.45 * M, 0.55 * M, PALETTE.bone));
  const top = ctx.column(0.18 * M, 0.25 * M, PALETTE.gold, 8);
  top.position.y = 0.45 * M;
  g.add(top);
  for (const side of [-1, 1]) {
    const wing = ctx.box(1.05 * M, 0.03 * M, 0.6 * M, PALETTE.steel);
    wing.position.set(side * 0.82 * M, 0.42 * M, 0);
    wing.rotation.z = side * 0.22;
    g.add(wing);
  }
  return g;
}

/**
 * The Laser Ranging Retroreflector: a hundred corner cubes in a tilted frame.
 * Observatories on Earth still fire lasers at it and time the echo to a few
 * millimetres; it is how anyone knows the Moon is drifting away 3.8 cm a year.
 */
function retroreflector(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  g.add(ctx.box(0.65 * M, 0.12 * M, 0.45 * M, PALETTE.bone));
  for (const side of [-1, 1]) g.add(ctx.strut(v(side * 0.25, 0.1, -0.15), v(side * 0.25, 0.42, -0.05), 0.04 * M, PALETTE.bone));
  const panel = ctx.box(0.62 * M, 0.62 * M, 0.06 * M, PALETTE.bark);
  panel.position.set(0, 0.12 * M, 0.05 * M);
  panel.rotation.x = -0.62;
  g.add(panel);
  return g;
}

/** A camera on a tripod, the one that sent the first steps to six hundred million people. */
function tvCamera(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    g.add(ctx.strut(v(0, 1.3, 0), v(Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45), 0.04 * M, PALETTE.bone));
  }
  const head = ctx.box(0.25 * M, 0.22 * M, 0.42 * M, PALETTE.bone);
  head.position.y = 1.3 * M;
  g.add(head);
  const lens = ctx.column(0.06 * M, 0.08 * M, PALETTE.ink, 8);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.41 * M, 0.21 * M);
  g.add(lens);
  return g;
}

/** An ALSEP central station under its sunshade, with the nuclear battery beside it. */
function alsep(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  g.add(ctx.box(0.65 * M, 0.35 * M, 0.45 * M, PALETTE.bone));
  for (const side of [-1, 1]) g.add(ctx.strut(v(side * 0.3, 0.35, -0.2), v(side * 0.3, 0.8, -0.2), 0.04 * M, PALETTE.bone));
  const shade = ctx.box(0.75 * M, 0.03 * M, 0.6 * M, PALETTE.white);
  shade.position.set(0, 0.8 * M, 0);
  g.add(shade);
  const mast = ctx.column(0.03 * M, 0.9 * M, PALETTE.bone, 6);
  mast.position.set(0.2 * M, 0.35 * M, 0.1 * M);
  g.add(mast);
  const horn = ctx.taper(0.03 * M, 0.12 * M, 0.3 * M, PALETTE.bone, 6);
  horn.position.set(0.2 * M, 1.25 * M, 0.1 * M);
  g.add(horn);
  const rtg = ctx.column(0.18 * M, 0.45 * M, PALETTE.bark, 8);
  rtg.position.set(-1.3 * M, 0, 0.4 * M);
  g.add(rtg);
  for (let k = 0; k < 4; k++) {
    const fin = ctx.box(0.04 * M, 0.42 * M, 0.42 * M, PALETTE.bark);
    fin.position.set(-1.3 * M, 0, 0.4 * M);
    fin.rotation.y = (k * Math.PI) / 4;
    g.add(fin);
  }
  return g;
}

/**
 * The Lunar Roving Vehicle: 3.1 m long, 1.83 m between the wheels' centres
 * across and 2.29 m along, wire-mesh tyres 0.81 m high under fibreglass
 * fenders, a tube frame with two folding seats of nylon webbing, the control
 * console on its post and the T-handle between the seats, and on the front
 * section the comms box with its mirrored radiator, the TV camera and the
 * umbrella of the high-gain antenna that sent the pictures home. Three were
 * driven (Apollo 15, 16 and 17) and three are still parked; on Apollo 17's,
 * a fender mended with a folded map and tape.
 */
function rover(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  const frame = ctx.tone(PALETTE.bone, 0.92);
  const tube = (from: THREE.Vector3, to: THREE.Vector3, thick = 0.05): void => {
    g.add(ctx.strut(from, to, thick * M, frame));
  };
  // The frame: two side rails, cross members, the floor pan under the seats.
  for (const x of [-0.6, 0.6]) {
    tube(v(x, 0.52, -1.45), v(x, 0.52, 1.45));
    tube(v(x, 0.52, -0.55), v(x * 0.95, 0.66, -0.25), 0.04);
  }
  for (const z of [-1.45, -0.6, 0.55, 1.45]) tube(v(-0.6, 0.52, z), v(0.6, 0.52, z));
  const pan = ctx.box(1.2 * M, 0.03 * M, 1.05 * M, ctx.tone(PALETTE.steel, 0.9));
  pan.position.set(0, 0.49 * M, 0);
  g.add(pan);
  // The wheels: a wire-mesh tyre (the titanium chevrons as a darker tread),
  // the hub with its drive motor, the fender arched over the top half, and the
  // suspension's two arms to the frame.
  const tyre = ctx.tone(PALETTE.steel, 1.15);
  const tread = ctx.tone(PALETTE.steel, 0.78);
  const fender = ctx.tone(PALETTE.slate, 1.2);
  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.15, 1.15]) {
      const out = Math.sign(x);
      const body = ctx.column(0.41 * M, 0.22 * M, tyre, 16);
      body.rotation.z = Math.PI / 2;
      body.position.set(x * M, 0.41 * M, z * M);
      g.add(body);
      for (const side of [-1, 1]) {
        const band = ctx.ringWall(0.36 * M, 0.415 * M, 0.035 * M, tread, 12);
        band.rotation.z = Math.PI / 2;
        band.position.set((x + side * 0.095) * M, 0.41 * M, z * M);
        g.add(band);
      }
      const hub = ctx.column(0.17 * M, 0.27 * M, PALETTE.gold, 10);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x * M, 0.41 * M, z * M);
      g.add(hub);
      const cap = ctx.column(0.08 * M, 0.31 * M, ctx.tone(PALETTE.steel, 0.7), 8);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(x * M, 0.41 * M, z * M);
      g.add(cap);
      // The fender: plates on an arc over the tyre, front and back left open.
      const plates = 7;
      for (let k = 0; k < plates; k++) {
        const a0 = (0.12 + (k / plates) * 0.76) * Math.PI;
        const a1 = (0.12 + ((k + 1) / plates) * 0.76) * Math.PI;
        const r = 0.47;
        const from = v(x, 0.41 + Math.sin(a0) * r, z + Math.cos(a0) * r);
        const to = v(x, 0.41 + Math.sin(a1) * r, z + Math.cos(a1) * r);
        const plate = ctx.box(0.3 * M, 0.025 * M, from.distanceTo(to) + 0.02, fender);
        plate.position.copy(from).add(to).multiplyScalar(0.5);
        plate.rotation.x = -((a0 + a1) / 2 - Math.PI / 2);
        g.add(plate);
      }
      tube(v(x * 0.66, 0.52, z * 0.82), v(x - out * 0.13, 0.43, z), 0.045);
      tube(v(x * 0.66, 0.52, z * 1.18), v(x - out * 0.13, 0.43, z), 0.045);
    }
  }
  // The seats: tube frames with webbing, the backs leaning, footrests ahead.
  const webbing = ctx.tone(PALETTE.slate, 0.8);
  for (const x of [-0.33, 0.33]) {
    const pan = ctx.box(0.46 * M, 0.04 * M, 0.44 * M, webbing);
    pan.position.set(x * M, 0.62 * M, -0.2 * M);
    g.add(pan);
    const back = ctx.box(0.46 * M, 0.5 * M, 0.04 * M, webbing);
    back.position.set(x * M, 0.66 * M, -0.44 * M);
    back.rotation.x = -0.22;
    g.add(back);
    for (const side of [-0.24, 0.24]) {
      tube(v(x + side, 0.6, 0.02), v(x + side, 0.6, -0.44), 0.035);
      tube(v(x + side, 0.6, -0.44), v(x + side, 1.1, -0.55), 0.035);
      tube(v(x + side, 0.52, -0.1), v(x + side, 0.6, -0.1), 0.035);
    }
    tube(v(x - 0.24, 1.1, -0.55), v(x + 0.24, 1.1, -0.55), 0.035);
    // The handhold on the outside, and the footrest.
    tube(v(x * 2.1, 0.62, -0.05), v(x * 2.1, 0.86, 0.1), 0.03);
    const rest = ctx.box(0.4 * M, 0.03 * M, 0.3 * M, ctx.tone(PALETTE.steel, 0.9));
    rest.position.set(x * M, 0.5 * M, 0.42 * M);
    rest.rotation.x = 0.35;
    g.add(rest);
  }
  // The T-handle between the seats, and the console on its post.
  tube(v(0, 0.52, 0.0), v(0, 0.82, 0.05), 0.04);
  tube(v(-0.07, 0.82, 0.05), v(0.07, 0.82, 0.05), 0.03);
  tube(v(0, 0.52, 0.55), v(0, 1.02, 0.6), 0.045);
  const console = ctx.box(0.5 * M, 0.32 * M, 0.09 * M, ctx.tone(PALETTE.steel, 1.2));
  console.position.set(0, 0.98 * M, 0.62 * M);
  console.rotation.x = -0.3;
  g.add(console);
  const dial = ctx.box(0.16 * M, 0.1 * M, 0.04 * M, PALETTE.gold);
  dial.position.set(-0.1 * M, 1.06 * M, 0.57 * M);
  dial.rotation.x = -0.3;
  g.add(dial);
  const dial2 = ctx.box(0.1 * M, 0.08 * M, 0.04 * M, PALETTE.white);
  dial2.position.set(0.13 * M, 1.04 * M, 0.57 * M);
  dial2.rotation.x = -0.3;
  g.add(dial2);
  // The front section: the batteries under white dust covers, the comms box
  // with its mirrored radiator, the TV camera on its post.
  for (const x of [-0.32, 0.32]) {
    const battery = ctx.box(0.5 * M, 0.22 * M, 0.55 * M, PALETTE.white);
    battery.position.set(x * M, 0.53 * M, 1.12 * M);
    g.add(battery);
  }
  const comms = ctx.box(0.46 * M, 0.3 * M, 0.34 * M, ctx.tone(PALETTE.bone, 1.05));
  comms.position.set(0, 0.75 * M, 1.22 * M);
  g.add(comms);
  const mirror = ctx.box(0.4 * M, 0.025 * M, 0.28 * M, ctx.tone(PALETTE.skyBlue, 1.15));
  mirror.position.set(0, 1.05 * M + PROUD / 4, 1.22 * M);
  g.add(mirror);
  const foil = ctx.box(0.48 * M, 0.06 * M, 0.36 * M, PALETTE.gold);
  foil.position.set(0, 0.72 * M, 1.22 * M);
  g.add(foil);
  tube(v(0, 1.05, 1.4), v(0, 1.4, 1.48), 0.035);
  const camera = ctx.box(0.2 * M, 0.18 * M, 0.3 * M, PALETTE.white);
  camera.position.set(0, 1.37 * M, 1.5 * M);
  g.add(camera);
  const lens = ctx.column(0.06 * M, 0.12 * M, PALETTE.ink, 8);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.46 * M, 1.7 * M);
  g.add(lens);
  // The high-gain antenna: an umbrella of mesh on its ribs, on a mast, aimed
  // home; and the low-gain helix beside it.
  tube(v(-0.38, 0.85, 1.35), v(-0.38, 2.0, 1.35), 0.035);
  const dish = new THREE.Group();
  const bowl = dome(ctx, 0.5 * M, ctx.tone(PALETTE.bone, 1.08), 0.32, 14);
  bowl.rotation.x = Math.PI;
  dish.add(bowl);
  const rim = ctx.ringWall(0.47 * M, 0.51 * M, 0.03 * M, PALETTE.gold, 14);
  dish.add(rim);
  const feed = ctx.column(0.025 * M, 0.35 * M, frame, 6);
  feed.position.y = -0.3 * M;
  dish.add(feed);
  dish.position.set(-0.38 * M, 2.08 * M, 1.35 * M);
  dish.rotation.set(-1.0, 0, 0.25);
  g.add(dish);
  tube(v(0.4, 0.85, 1.35), v(0.4, 1.75, 1.35), 0.03);
  const helix = ctx.column(0.05 * M, 0.5 * M, ctx.tone(PALETTE.bone, 1.08), 8);
  helix.position.set(0.4 * M, 1.6 * M, 1.35 * M);
  g.add(helix);
  // The back: the tool carrier, the sample bags, a scoop's handle standing up.
  const pallet = ctx.box(1.0 * M, 0.42 * M, 0.42 * M, ctx.tone(PALETTE.steel, 1.05));
  pallet.position.set(0, 0.55 * M, -1.25 * M);
  g.add(pallet);
  const strap = ctx.box(1.02 * M, 0.08 * M, 0.44 * M, PALETTE.gold);
  strap.position.set(0, 0.75 * M, -1.25 * M);
  g.add(strap);
  for (const x of [-0.3, 0.05, 0.32]) {
    const bag = ctx.box(0.2 * M, 0.2 * M, 0.16 * M, PALETTE.white);
    bag.position.set(x * M, 0.97 * M, -1.18 * M);
    g.add(bag);
  }
  tube(v(0.42, 0.9, -1.4), v(0.5, 1.75, -1.55), 0.03);
  tube(v(-0.4, 0.9, -1.4), v(-0.48, 1.6, -1.5), 0.03);
  return g;
}

/**
 * The rover again, as a craft to take: the same model the landing sites park,
 * the driver in the commander's seat on the left, at the LRV's own 13 km an
 * hour or a little more, because nobody is counting the battery.
 */
export const LUNAR_ROVER: VehicleSpec = {
  kind: 'rover',
  name: 'the Lunar Roving Vehicle',
  build: (ctx) => ({ group: rover(ctx), seat: { x: 0.33 * M, y: 0.66 * M, z: -0.2 * M }, radius: 1.75 * M }),
  handling: { top: 16, accel: 6, turn: 1.1 },
};

/** Tyre tracks: two lines of dark ruts from (x, z) along a heading, metres. */
function tracks(ctx: SceneryContext, x: number, z: number, yaw: number, length: number, bend: number): Group {
  const g = new THREE.Group();
  const segments = Math.max(2, Math.round(length / 1.2));
  let px = x;
  let pz = z;
  let heading = yaw;
  for (let k = 0; k < segments; k++) {
    const step = length / segments;
    for (const side of [-0.92, 0.92]) {
      const rut = ctx.box(0.22 * M, 0.04, step * M * 1.02, PALETTE.steel);
      rut.position.set((px + Math.cos(heading) * side + Math.sin(heading) * step * 0.5) * M, PAVED, (pz - Math.sin(heading) * side + Math.cos(heading) * step * 0.5) * M);
      rut.rotation.y = heading;
      g.add(rut);
    }
    px += Math.sin(heading) * step;
    pz += Math.cos(heading) * step;
    heading += bend / segments;
  }
  return g;
}

/**
 * Lunokhod 1, the first robot to drive another world: a bathtub on eight
 * wheels with a lid of solar cells that opened by day, steered from the
 * Crimea for ten months from November 1970. Its French reflector was lost
 * for forty years and found again by laser in 2010.
 */
function lunokhod(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  const tub = ctx.taper(0.82 * M, 1.02 * M, 0.75 * M, PALETTE.bone, 12);
  tub.scale.set(1, 1, 1.25);
  tub.position.y = 0.5 * M;
  g.add(tub);
  const hinge = new THREE.Group();
  hinge.position.set(0, 1.25 * M, -1.25 * M);
  const lid = ctx.column(1.05 * M, 0.08 * M, PALETTE.slate, 12);
  lid.scale.set(1, 1, 1.22);
  lid.position.z = 1.28 * M;
  hinge.add(lid);
  hinge.rotation.x = -1.9;
  g.add(hinge);
  for (const x of [-1.0, 1.0]) {
    for (const z of [-1.0, -0.34, 0.34, 1.0]) g.add(at(wheel(ctx, 0.255, 0.2, PALETTE.steel, 10), x, z));
  }
  for (const x of [-0.3, 0.3]) {
    const eye = ctx.column(0.1 * M, 0.08 * M, PALETTE.ink, 8);
    eye.rotation.x = Math.PI / 2;
    eye.position.set(x * M, 0.95 * M, 1.28 * M);
    g.add(eye);
  }
  const reflector = ctx.box(0.32 * M, 0.16 * M, 0.2 * M, PALETTE.gold);
  reflector.position.set(0, 1.25 * M, 1.05 * M);
  g.add(reflector);
  g.add(ctx.strut(v(0.5, 1.2, -0.6), v(0.7, 2.4, -0.9), 0.04 * M, PALETTE.bone));
  g.add(ctx.strut(v(-0.5, 1.2, -0.6), v(-0.7, 2.2, -0.9), 0.04 * M, PALETTE.bone));
  const horn = ctx.taper(0.05 * M, 0.2 * M, 0.55 * M, PALETTE.bone, 8);
  horn.position.set(0.55 * M, 1.25 * M, 0.4 * M);
  g.add(horn);
  return g;
}

/** Luna 17, the lander that carried Lunokhod down: a platform on four tanks with ramps fore and aft. */
function luna17(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  const deck = ctx.column(1.6 * M, 0.4 * M, PALETTE.bone, 8);
  deck.position.y = 1.0 * M;
  g.add(deck);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const tank = ball(ctx, 0.42 * M, PALETTE.steel, 10);
    tank.position.set(Math.sin(a) * 1.0 * M, 0.72 * M, Math.cos(a) * 1.0 * M);
    g.add(tank);
    const foot = v(Math.sin(a) * 2.2, 0.1, Math.cos(a) * 2.2);
    g.add(ctx.strut(v(Math.sin(a) * 1.3, 1.1, Math.cos(a) * 1.3), foot, 0.12 * M, PALETTE.bone));
    const pad = ctx.column(0.3 * M, 0.1 * M, PALETTE.bone, 8);
    pad.position.set(foot.x, 0, foot.z);
    g.add(pad);
  }
  for (const end of [-1, 1]) {
    for (const side of [-0.55, 0.55]) g.add(ctx.strut(v(side, 1.4, end * 1.55), v(side, 0.05, end * 3.5), 0.12 * M, PALETTE.steel));
  }
  return g;
}

/**
 * Surveyor 3, which landed in April 1967 and was visited by Apollo 12 in
 * November 1969: Conrad and Bean walked down into its crater and cut off its
 * camera to bring home, so it stands here without one.
 */
function surveyor(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  const mast = ctx.column(0.06 * M, 3.0 * M, PALETTE.bone, 6);
  g.add(mast);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const foot = v(Math.sin(a) * 1.6, 0.15, Math.cos(a) * 1.6);
    g.add(ctx.strut(v(Math.sin(a) * 0.55, 1.1, Math.cos(a) * 0.55), foot, 0.09 * M, PALETTE.bone));
    g.add(ctx.strut(v(Math.sin(a + 1) * 0.5, 0.6, Math.cos(a + 1) * 0.5), v(Math.sin(a) * 0.55, 1.1, Math.cos(a) * 0.55), 0.06 * M, PALETTE.bone));
    const pad = ctx.column(0.2 * M, 0.12 * M, PALETTE.bone, 8);
    pad.position.set(foot.x, 0, foot.z);
    g.add(pad);
  }
  for (const side of [-1, 1]) {
    const box = ctx.box(0.5 * M, 0.35 * M, 0.4 * M, PALETTE.white);
    box.position.set(side * 0.45 * M, 0.95 * M, side * 0.2 * M);
    g.add(box);
  }
  const solar = ctx.box(0.9 * M, 0.03 * M, 0.8 * M, PALETTE.steel);
  solar.position.set(0.3 * M, 3.0 * M, 0);
  solar.rotation.z = 0.5;
  g.add(solar);
  const antenna = ctx.box(0.85 * M, 0.03 * M, 0.85 * M, PALETTE.bone);
  antenna.position.set(-0.35 * M, 2.6 * M, 0);
  antenna.rotation.z = -0.6;
  g.add(antenna);
  return g;
}

/** Chang'e 4, which came down in Von Kármán crater on 3 January 2019: the first craft on the far side. */
function change4(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  const body = ctx.box(2.2 * M, 1.3 * M, 2.2 * M, PALETTE.gold);
  body.position.y = 1.0 * M;
  g.add(body);
  const deck = ctx.box(2.35 * M, 0.1 * M, 2.35 * M, PALETTE.bone);
  deck.position.y = 2.3 * M;
  g.add(deck);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const foot = v(x * 2.0, 0.12, z * 2.0);
      g.add(ctx.strut(v(x * 1.0, 1.4, z * 1.0), foot, 0.15 * M, PALETTE.bone));
      const pad = ctx.column(0.3 * M, 0.1 * M, PALETTE.bone, 8);
      pad.position.set(foot.x, 0, foot.z);
      g.add(pad);
    }
  }
  for (const side of [-1, 1]) {
    const wing = ctx.box(2.0 * M, 0.04 * M, 1.1 * M, PALETTE.steel);
    wing.position.set(side * 2.05 * M, 2.6 * M, 0);
    wing.rotation.z = side * 0.35;
    g.add(wing);
  }
  const mast = ctx.column(0.08 * M, 1.5 * M, PALETTE.bone, 6);
  mast.position.set(0.6 * M, 2.35 * M, -0.6 * M);
  g.add(mast);
  const head = ctx.box(0.4 * M, 0.25 * M, 0.25 * M, PALETTE.bone);
  head.position.set(0.6 * M, 3.85 * M, -0.6 * M);
  g.add(head);
  const dish = dome(ctx, 0.45 * M, PALETTE.white, 0.3, 12);
  dish.rotation.x = Math.PI * 0.7;
  dish.position.set(-0.6 * M, 2.8 * M, 0.6 * M);
  g.add(dish);
  for (const side of [-0.35, 0.35]) g.add(ctx.strut(v(side, 2.3, 1.15), v(side, 0.05, 3.0), 0.08 * M, PALETTE.steel));
  return g;
}

/** Yutu-2, the Jade Rabbit: the far side's rover, and the longest-lived one on the Moon. */
function yutu(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  const body = ctx.box(0.9 * M, 0.45 * M, 1.3 * M, PALETTE.gold);
  body.position.y = 0.32 * M;
  g.add(body);
  for (const side of [-1, 1]) {
    const wing = ctx.box(0.85 * M, 0.03 * M, 1.1 * M, PALETTE.steel);
    wing.position.set(side * 0.85 * M, 0.8 * M, 0);
    wing.rotation.z = side * 0.3;
    g.add(wing);
    for (const z of [-0.5, 0, 0.5]) g.add(at(wheel(ctx, 0.15, 0.12, PALETTE.bone, 8), side * 0.6, z));
  }
  const mast = ctx.column(0.04 * M, 0.75 * M, PALETTE.bone, 6);
  mast.position.set(0, 0.77 * M, 0.45 * M);
  g.add(mast);
  const head = ctx.box(0.42 * M, 0.15 * M, 0.14 * M, PALETTE.bone);
  head.position.set(0, 1.52 * M, 0.45 * M);
  g.add(head);
  return g;
}

/**
 * The Fallen Astronaut: an aluminium figure 8.5 cm long and a plaque with the
 * names of fourteen astronauts and cosmonauts who had died, left by the crew
 * of Apollo 15 beside their rover. Drawn twice its size, and still the
 * smallest thing on the Moon worth walking to.
 */
function fallenAstronaut(ctx: SceneryContext): Group {
  const g = new THREE.Group();
  const plaque = ctx.box(0.4 * M, 0.04, 0.22 * M, PALETTE.bone);
  plaque.position.set(0.15 * M, PAVED, 0);
  g.add(plaque);
  const figure = ctx.strut(new THREE.Vector3(-0.2 * M, PAVED + 0.06, 0), new THREE.Vector3(-0.02 * M, PAVED + 0.06, 0), 0.05 * M, PALETTE.white);
  g.add(figure);
  return g;
}

const APOLLO_RADIUS = 26;

export const TRANQUILITY_BASE: Landmark = {
  id: 'tranquility-base',
  name: 'Tranquility Base',
  lat: 0.67408,
  lon: 23.47297,
  radius: 25,
  build(ctx, rng) {
    const g = new THREE.Group();
    g.add(descentStage(ctx));
    g.add(at(flag(ctx, true), -1.5, 7.2, -0.5));
    g.add(at(seismometer(ctx), 6.6, 4.5, 0.4));
    g.add(at(retroreflector(ctx), 7.8, 1.4, Math.PI / 2));
    g.add(at(tvCamera(ctx), -6.4, 6.0, 2.4));
    g.add(
      footprints(
        ctx,
        [
          [0, 4.6],
          [-0.8, 6.4],
          [-1.4, 7.6],
          [0.5, 8.4],
          [3.6, 7.6],
          [6.2, 5.2],
          [7.4, 2.4],
          [6.6, 0],
          [4.6, -1.0],
        ],
        rng,
      ),
    );
    g.add(footprints(ctx, [[0, 4.6], [-3.5, 6.8], [-6.0, 6.6]], rng));
    return g;
  },
};

export const HADLEY: Landmark = {
  id: 'hadley-apennine',
  name: 'Hadley–Apennine (Apollo 15)',
  lat: 26.1322,
  lon: 3.6339,
  radius: APOLLO_RADIUS,
  // Its rover, parked where Scott left it: there to take, as every craft is.
  craft: [{ vehicle: LUNAR_ROVER, x: 8.4 * M, z: 2.6 * M, yaw: 2.0 }],
  build(ctx, rng) {
    const g = new THREE.Group();
    g.add(descentStage(ctx));
    g.add(tracks(ctx, 8.8, 4.2, -2.6, 4.5, 1.1));
    g.add(at(flag(ctx), -2.4, 7.4, 0.6));
    g.add(at(alsep(ctx), -7.8, -3.0, 1.0));
    g.add(at(fallenAstronaut(ctx), 7.9, -1.6, 0.3));
    g.add(footprints(ctx, [[0, 4.6], [-2.0, 7.0], [3.5, 7.6], [7.0, 4.6], [8.2, -0.8], [5.0, -5.4], [-1.5, -7.2], [-6.6, -4.2]], rng));
    return g;
  },
};

export const TAURUS_LITTROW: Landmark = {
  id: 'taurus-littrow',
  name: 'Taurus–Littrow (Apollo 17)',
  lat: 20.1908,
  lon: 30.7717,
  radius: APOLLO_RADIUS,
  // The last rover parked where Cernan left it, aimed so its camera could
  // film the ascent stage lift off — the first launch from the Moon anyone
  // saw; there to take, as every craft is.
  craft: [{ vehicle: LUNAR_ROVER, x: -7.8 * M, z: 4.6 * M, yaw: -2.2 }],
  build(ctx, rng) {
    const g = new THREE.Group();
    g.add(descentStage(ctx));
    g.add(tracks(ctx, -9.6, 3.6, 0.9, 5.0, -0.8));
    g.add(at(flag(ctx), 5.0, 6.0, -0.3));
    g.add(at(alsep(ctx), 7.2, -4.4, -0.8));
    g.add(footprints(ctx, [[0, 4.6], [3.2, 6.4], [5.6, 5.0], [7.6, 0.6], [7.0, -3.0], [2.5, -7.4], [-4.0, -6.6], [-7.6, 0.2]], rng));
    return g;
  },
};

export const OCEAN_OF_STORMS: Landmark = {
  id: 'apollo-12',
  name: 'Surveyor Crater (Apollo 12)',
  lat: -3.01239,
  lon: -23.42157,
  radius: APOLLO_RADIUS,
  build(ctx, rng) {
    const g = new THREE.Group();
    g.add(descentStage(ctx));
    g.add(at(surveyor(ctx), -7.6, -4.6, 0.7));
    g.add(at(flag(ctx), 3.6, 7.0, 0.2));
    g.add(at(alsep(ctx), 7.6, 2.8, -1.2));
    g.add(footprints(ctx, [[0, 4.6], [3.0, 7.2], [6.8, 4.6], [7.4, 0], [3.0, -6.6], [-3.6, -7.4], [-6.6, -5.8]], rng));
    return g;
  },
};

export const LUNOKHOD: Landmark = {
  id: 'lunokhod-1',
  name: 'Lunokhod 1',
  lat: 38.2378,
  lon: -35.0017,
  radius: 18,
  build(ctx) {
    const g = new THREE.Group();
    g.add(luna17(ctx));
    g.add(at(lunokhod(ctx), 1.4, 5.5, 2.6));
    g.add(tracks(ctx, 0.0, 3.6, 0.3, 4.2, 1.6));
    return g;
  },
};

export const CHANGE_4: Landmark = {
  id: 'change-4',
  name: "Chang'e 4 and Yutu-2",
  lat: -45.4446,
  lon: 177.5991,
  radius: 18,
  build(ctx) {
    const g = new THREE.Group();
    g.add(change4(ctx));
    g.add(at(yutu(ctx), -3.4, 5.6, -0.6));
    g.add(tracks(ctx, 0, 3.2, -0.3, 3.0, -0.4));
    return g;
  },
};

export const LANDMARKS: readonly Landmark[] = [TRANQUILITY_BASE, HADLEY, TAURUS_LITTROW, OCEAN_OF_STORMS, LUNOKHOD, CHANGE_4];
