/**
 * The two-wheelers built in code: a bicycle and a motorbike, each round the
 * hero astride it.
 *
 * **Built from the rider out, as the launch is.** A bicycle is three points a
 * body puts on it — a saddle under the hip, a crank the feet go round, bars
 * the hands hold — and the frame is only the tubes between them and the two
 * axles. So the hip is put where a leg nearly straight reaches the lower pedal
 * (`HERO.legs`), the crank's axle ahead of and under it at a seat tube's rake,
 * and the bars where an arm reaches from the shoulders with the elbows a
 * little bent; the wheels are the size a wheel is against a 1.75 m person,
 * under the whole of it. The motorbike is the same three points closer
 * together: pegs for the feet, a seat lower and further back, bars higher.
 *
 * **What turns.** Each wheel is a `'wheel'` about its axle, a tyre as a torus
 * round a hub and four spokes, so it reads as rolling where a disc would read
 * as a coin; the bicycle's chainring, cranks and pedals are one `'crank'`
 * about the bottom bracket, which the motion turns by the gearing and the
 * rider's feet follow round (`CraftMotion.phase`).
 *
 * **Scale.** One metre of a real bicycle is `AVATAR_HEIGHT / 1.75` units here,
 * the body's own metre: a person is drawn larger than the buildings
 * (`STATURE`), and so is whatever he rides.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import type { CraftModel, Seat } from './contract.ts';
import { HERO } from './body.ts';
import { assemble, craftContext, finish, loft, octagon, soupOf } from './build.ts';
import type { Turning } from './build.ts';

const H = AVATAR_HEIGHT;
const V = THREE.Vector3;
/** A metre of the thing ridden, in units: the body's own. */
const M = H / 1.75;

/** A tyre on its hub, about the axle at the origin, the axle along X. */
function wheelSoup(radius: number, tube: number, tyre: number, hub: number, spokes: number): Turning['soup'] {
  const ctx = craftContext();
  const group = new THREE.Group();
  const ring = new THREE.TorusGeometry(radius - tube, tube, 6, 18);
  ring.rotateY(Math.PI / 2);
  const faceted = ring.toNonIndexed();
  ring.dispose();
  faceted.computeVertexNormals();
  group.add(new THREE.Mesh(faceted, ctx.toon(tyre)));
  const centre = ctx.column(radius * 0.14, tube * 1.6, hub, 8);
  centre.rotation.z = Math.PI / 2;
  centre.position.x = tube * 0.8;
  group.add(centre);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3;
    const rim = new V(0, Math.cos(a) * (radius - tube * 1.5), Math.sin(a) * (radius - tube * 1.5));
    group.add(ctx.strut(new V(0.001, 0, 0), rim, tube * 0.45, hub));
  }
  return soupOf(group);
}

// ---------------------------------------------------------------------------
// The bicycle
// ---------------------------------------------------------------------------

/** The wheel's radius, the crank's axle over the road and its radius. */
const BIKE_WHEEL = 0.35 * M;
const BB_Y = 0.28 * M;
const CRANK = 0.17 * M;
/** The hip over the road: the lower pedal a straight leg's reach less a twelfth, so the knee is never locked. */
const BIKE_HIP = BB_Y - CRANK + HERO.legs * 0.92;
/** How far behind the crank the saddle is, at a seat tube of 73 degrees. */
const BIKE_BACK = (BIKE_HIP - BB_Y) / Math.tan((73 * Math.PI) / 180);
/** The axles, ahead of and behind the crank. */
const REAR_AXLE = -0.43 * M;
const FRONT_AXLE = 0.62 * M;
/** The grips: an upright city bike's, over the saddle and a forearm ahead of the head tube's top. */
const BARS = { y: BIKE_HIP + 0.1 * H, z: 0.28 * M };
/** How far the bicycle goes for a turn of the pedals: a middle gear, about seven metres. */
const BIKE_GEARING = 7.4 * M;

const BIKE_PAINTS: readonly number[] = [PALETTE.skyBlue, PALETTE.red, PALETTE.green, PALETTE.ink, PALETTE.gold, PALETTE.cream];

function buildBicycle(variant: number, body?: number): THREE.Group {
  const ctx = craftContext();
  const { strut, box, column } = ctx;
  const paint = body ?? BIKE_PAINTS[((variant % BIKE_PAINTS.length) + BIKE_PAINTS.length) % BIKE_PAINTS.length]!;
  const trim = PALETTE.steel;
  const tube = 0.035 * M;
  const group = new THREE.Group();

  const bb = new V(0, BB_Y, 0);
  const seatTop = new V(0, BIKE_HIP - 0.13 * M, -BIKE_BACK * 0.88);
  const headTop = new V(0, BIKE_HIP - 0.08 * M, FRONT_AXLE - 0.12 * M);
  const headBottom = new V(0, BIKE_HIP - 0.3 * M, FRONT_AXLE - 0.07 * M);
  const rear = new V(0, BIKE_WHEEL, REAR_AXLE);
  const front = new V(0, BIKE_WHEEL, FRONT_AXLE);
  // The frame: a diamond, stays either side of the rear wheel, a fork either side of the front.
  group.add(strut(bb, seatTop, tube * 1.2, paint));
  group.add(strut(bb, headBottom, tube * 1.3, paint));
  group.add(strut(seatTop, headTop, tube * 1.1, paint));
  group.add(strut(headBottom, headTop, tube * 1.5, paint));
  for (const side of [-1, 1]) {
    const x = side * 0.05 * M;
    group.add(strut(new V(x, BB_Y, 0), new V(x, rear.y, rear.z), tube * 0.8, paint));
    group.add(strut(new V(x * 0.4, seatTop.y, seatTop.z), new V(x, rear.y, rear.z), tube * 0.8, paint));
    group.add(strut(new V(x * 0.6, headBottom.y, headBottom.z), new V(x, front.y, front.z), tube * 0.9, trim));
  }
  // A mudguard hugging each wheel, standing proud of the tyre.
  mudguard(group, BIKE_WHEEL, REAR_AXLE, BIKE_WHEEL + 0.03 * M, 0.07 * M, -1.9, 0.2, 5, paint);
  mudguard(group, BIKE_WHEEL, FRONT_AXLE, BIKE_WHEEL + 0.03 * M, 0.07 * M, -0.4, 1.3, 4, paint);
  // The chain, top run and bottom, from the chainring on the right to the
  // sprocket on the rear hub.
  const sprocket = column(0.05 * M, 0.015 * M, trim, 8);
  sprocket.rotation.z = Math.PI / 2;
  sprocket.position.set(-0.05 * M, BIKE_WHEEL, REAR_AXLE);
  group.add(sprocket);
  for (const [ring, cog] of [[0.1, 0.05], [-0.1, -0.05]] as const) {
    group.add(strut(new V(-0.06 * M, BB_Y + ring * M, 0), new V(-0.06 * M, BIKE_WHEEL + cog * M, REAR_AXLE), 0.012 * M, PALETTE.ink));
  }
  // The seat post and the saddle, whose top is the hip: broad at the back,
  // narrowing to its nose.
  group.add(strut(seatTop, new V(0, BIKE_HIP - 0.04 * M, -BIKE_BACK), tube, trim));
  const saddle = loft(
    [
      { z: -BIKE_BACK - 0.12 * M, ring: octagon(0.09 * M, BIKE_HIP - 0.06 * M, BIKE_HIP - 0.01 * M, 0.5) },
      { z: -BIKE_BACK - 0.05 * M, ring: octagon(0.085 * M, BIKE_HIP - 0.06 * M, BIKE_HIP, 0.5) },
      { z: -BIKE_BACK + 0.06 * M, ring: octagon(0.04 * M, BIKE_HIP - 0.05 * M, BIKE_HIP, 0.5) },
      { z: -BIKE_BACK + 0.15 * M, ring: octagon(0.025 * M, BIKE_HIP - 0.045 * M, BIKE_HIP - 0.01 * M, 0.5) },
    ],
    PALETTE.bark,
  );
  group.add(saddle);
  // The stem up out of the head tube, and swept-back bars with dark grips.
  const stem = new V(0, BARS.y - 0.02 * M, headTop.z - 0.03 * M);
  group.add(strut(headTop, stem, tube * 1.1, trim));
  const barHalf = 0.28 * M;
  for (const side of [-1, 1]) {
    const x = side * barHalf;
    group.add(strut(new V(0, stem.y, stem.z), new V(x, BARS.y, BARS.z + 0.05 * M), tube, trim));
    const grip = strut(new V(x, BARS.y, BARS.z + 0.05 * M), new V(x, BARS.y, BARS.z - 0.07 * M), tube * 1.6, PALETTE.ink);
    group.add(grip);
  }
  // A basket on the front of every other one, and a lamp on the rest.
  if (variant % 2 === 1) {
    const basket = box(0.36 * M, 0.2 * M, 0.26 * M, PALETTE.brown);
    basket.position.set(0, headTop.y + 0.02 * M, headTop.z + 0.18 * M);
    group.add(basket);
  } else {
    const lamp = column(0.05 * M, 0.07 * M, PALETTE.cream, 8);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, headTop.y - 0.02 * M, headTop.z + 0.02 * M);
    group.add(lamp);
  }
  // A rack over the back wheel.
  const rack = box(0.16 * M, 0.025 * M, 0.34 * M, trim);
  rack.position.set(0, BIKE_WHEEL + 0.36 * M, REAR_AXLE + 0.03 * M);
  group.add(rack);
  group.add(strut(new V(0, rack.position.y, REAR_AXLE + 0.18 * M), new V(0, BIKE_WHEEL + 0.02 * M, REAR_AXLE + 0.01 * M), tube * 0.7, trim));

  // The crank: a chainring on the right, two arms opposite and a pedal on each.
  const crank = new THREE.Group();
  const ring = column(0.1 * M, 0.02 * M, trim, 12);
  ring.rotation.z = Math.PI / 2;
  ring.position.x = -0.06 * M;
  crank.add(ring);
  for (const side of [1, -1]) {
    const x = side * 0.08 * M;
    // The left arm down at a phase of 0 and the right one up: see `pedal` in `avatar.ts`.
    const end = new V(x, -side * CRANK, 0.0001);
    crank.add(strut(new V(x, 0, 0), end, 0.03 * M, trim));
    const pedal = box(0.1 * M, 0.025 * M, 0.08 * M, PALETTE.ink);
    pedal.position.set(x + side * 0.06 * M, end.y - 0.012 * M, 0);
    crank.add(pedal);
  }
  group.add(crank);
  const crankSoup = soupOf(crank);
  group.remove(crank);

  const wheel = wheelSoup(BIKE_WHEEL, 0.035 * M, PALETTE.ink, PALETTE.bone, 6);
  return assemble('bicycle', [soupOf(group)], [
    { name: 'wheel', at: new V(0, BIKE_WHEEL, REAR_AXLE), soup: wheel },
    { name: 'wheel', at: new V(0, BIKE_WHEEL, FRONT_AXLE), soup: wheelSoup(BIKE_WHEEL, 0.035 * M, PALETTE.ink, PALETTE.bone, 6) },
    { name: 'crank', at: bb.clone(), soup: crankSoup },
  ]);
}

const BIKE_SEAT: Seat = {
  x: 0,
  y: BIKE_HIP,
  z: -BIKE_BACK,
  yaw: 0,
  pose: 'ride',
  shown: true,
  grip: [0, BARS.y - BIKE_HIP, BARS.z + BIKE_BACK],
  // The crank's axle about the hip, and the feet a pedal's width either side.
  feet: [0.13 * M, BB_Y - BIKE_HIP, BIKE_BACK],
  crank: CRANK,
};

export function bicycleModel(): CraftModel {
  return finish({
    id: 'bicycle',
    kind: 'bicycle',
    medium: 'road',
    seats: [BIKE_SEAT],
    draft: 0,
    gearing: BIKE_GEARING,
    variants: BIKE_PAINTS.length,
    build: buildBicycle,
  });
}

// ---------------------------------------------------------------------------
// The motorbike
// ---------------------------------------------------------------------------

/**
 * A standard roadster, the one every country rides to work: an upright seat,
 * a teardrop tank in front of it, the engine hung under the tank where it can
 * be seen, a round headlamp on the fork, and the exhaust down the right side.
 *
 * **What makes it read as a motorbike and not a bicycle with a box on it** is
 * the one continuous line along its top — the tank running into the seat and
 * the seat into the tail — and the mass low between the wheels: a finned
 * cylinder over a crankcase, the exhaust header curling under it into a
 * silencer. The rest is what the pen draws at a few metres: fat tyres on cast
 * wheels, a disc on the front one; mudguards hugging both; fork legs with their
 * clamps; twin shocks; mirrors on stalks; pegs, a side stand, a number plate.
 */
const MOTO_WHEEL = 0.31 * M;
const MOTO_REAR = -0.72 * M;
const MOTO_FRONT = 0.72 * M;
/** The seat's top, which is the rider's hip: a standard's 80 cm. */
const MOTO_HIP = 0.8 * M;
const MOTO_SEAT_Z = -0.18 * M;
/** The pillion's, a step up and a body's pack and knees behind. */
const PILLION_HIP = MOTO_HIP + 0.06 * M;
const PILLION_Z = MOTO_SEAT_Z - 0.5 * M;
/** The bars and the pegs. */
const MOTO_BARS = { y: 1.08 * M, z: 0.38 * M };
const PEG = { y: 0.34 * M, z: MOTO_SEAT_Z + 0.16 * M };
/** The head of the frame, which the fork turns in, and the fork's rake from it to the axle. */
const STOCK = new V(0, 0.98 * M, 0.44 * M);

const MOTO_PAINTS: readonly number[] = [PALETTE.red, PALETTE.ink, PALETTE.skyBlue, PALETTE.orange, PALETTE.green, PALETTE.crimson];

/** A cast wheel: a fat tyre, a rim inside it, five spokes and the hub; a brake disc on the rider's right if `disc`. */
function motoWheelSoup(disc: boolean): Turning['soup'] {
  const ctx = craftContext();
  const group = new THREE.Group();
  const tube = 0.065 * M;
  const torus = (major: number, minor: number, color: number, radial: number): THREE.Mesh => {
    const ring = new THREE.TorusGeometry(major, minor, radial, 14);
    ring.rotateY(Math.PI / 2);
    const faceted = ring.toNonIndexed();
    ring.dispose();
    faceted.computeVertexNormals();
    return new THREE.Mesh(faceted, ctx.toon(color));
  };
  group.add(torus(MOTO_WHEEL - tube, tube, PALETTE.ink, 6));
  const rim = MOTO_WHEEL - tube * 2;
  group.add(torus(rim, 0.022 * M, PALETTE.bone, 3));
  const hub = ctx.column(0.05 * M, 0.14 * M, PALETTE.steel, 8);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = 0.07 * M;
  group.add(hub);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.2;
    group.add(ctx.strut(new V(0.001, Math.cos(a) * 0.04 * M, Math.sin(a) * 0.04 * M), new V(0, Math.cos(a) * rim, Math.sin(a) * rim), 0.035 * M, PALETTE.bone));
  }
  if (disc) {
    const plate = ctx.column(0.15 * M, 0.012 * M, PALETTE.steel, 10);
    plate.rotation.z = Math.PI / 2;
    plate.position.x = -0.045 * M;
    group.add(plate);
  }
  return soupOf(group);
}

/**
 * A mudguard as a run of short plates round a wheel's axle at `(y, z)`, from
 * `from` to `to` radians off the top (positive towards +Z), each plate turned
 * to its own tangent: the arc a wedge over a wheel cannot draw.
 */
function mudguard(group: THREE.Group, y: number, z: number, radius: number, width: number, from: number, to: number, plates: number, color: number): void {
  const { box } = craftContext();
  const step = (to - from) / plates;
  for (let i = 0; i < plates; i++) {
    const mid = from + step * (i + 0.5);
    const plate = box(width, 0.025 * M, radius * step + 0.02 * M, color);
    plate.rotation.x = mid;
    plate.position.set(0, y + radius * Math.cos(mid), z + radius * Math.sin(mid));
    group.add(plate);
  }
}

function buildMotorbike(variant: number, body?: number): THREE.Group {
  const ctx = craftContext();
  const { strut, box, column, tone } = ctx;
  const paint = body ?? MOTO_PAINTS[((variant % MOTO_PAINTS.length) + MOTO_PAINTS.length) % MOTO_PAINTS.length]!;
  const metal = PALETTE.steel;
  const chrome = PALETTE.bone;
  const group = new THREE.Group();

  // The frame: a backbone from the headstock under the tank to the seat, a
  // down tube round the front of the engine and under it to the swing arm's
  // pivot, and a rail a side back under the seat.
  const pivot = new V(0, 0.34 * M, -0.24 * M);
  const seatNode = new V(0, 0.74 * M, -0.22 * M);
  const cradle = new V(0, 0.12 * M, 0.2 * M);
  group.add(strut(STOCK, seatNode, 0.06 * M, metal));
  group.add(strut(STOCK, cradle, 0.05 * M, metal));
  group.add(strut(cradle, new V(0, 0.1 * M, -0.2 * M), 0.05 * M, metal));
  group.add(strut(new V(0, 0.1 * M, -0.2 * M), seatNode, 0.05 * M, metal));
  for (const side of [-1, 1]) {
    group.add(strut(new V(side * 0.07 * M, seatNode.y, seatNode.z), new V(side * 0.08 * M, 0.7 * M, -0.9 * M), 0.035 * M, metal));
  }

  // The engine: a crankcase low between the wheels, a finned cylinder leaning
  // forward out of it up under the tank, a round cover on either side.
  const crankcase = box(0.28 * M, 0.24 * M, 0.44 * M, metal);
  crankcase.position.set(0, 0.14 * M, 0.02 * M);
  group.add(crankcase);
  const cylinder = new THREE.Group();
  cylinder.position.set(0, 0.36 * M, 0.1 * M);
  cylinder.rotation.x = 0.3;
  const barrel = box(0.2 * M, 0.3 * M, 0.2 * M, tone(PALETTE.steel, 1.2));
  cylinder.add(barrel);
  for (let i = 0; i < 3; i++) {
    const fin = box(0.28 * M, 0.03 * M, 0.26 * M, tone(PALETTE.steel, 1.35));
    fin.position.y = (0.06 + i * 0.08) * M;
    cylinder.add(fin);
  }
  const head = box(0.24 * M, 0.07 * M, 0.22 * M, metal);
  head.position.y = 0.3 * M;
  cylinder.add(head);
  group.add(cylinder);
  for (const side of [-1, 1]) {
    const cover = column(0.1 * M, 0.04 * M, side < 0 ? chrome : tone(PALETTE.steel, 1.2), 8);
    cover.rotation.z = -side * (Math.PI / 2);
    cover.position.set(side * 0.13 * M, 0.25 * M, -0.02 * M);
    group.add(cover);
  }

  // The exhaust: the header out of the cylinder's front, down and back under
  // the crankcase on the right, up into a silencer past the rear axle.
  const header = [
    new V(-0.05 * M, 0.52 * M, 0.26 * M),
    new V(-0.1 * M, 0.3 * M, 0.34 * M),
    new V(-0.12 * M, 0.08 * M, 0.22 * M),
    new V(-0.15 * M, 0.08 * M, -0.2 * M),
    new V(-0.17 * M, 0.24 * M, -0.44 * M),
  ];
  for (let i = 0; i + 1 < header.length; i++) group.add(strut(header[i]!, header[i + 1]!, 0.05 * M, chrome));
  const silencerFrom = new V(-0.17 * M, 0.24 * M, -0.44 * M);
  const silencerTo = new V(-0.18 * M, 0.38 * M, MOTO_REAR - 0.14 * M);
  group.add(strut(silencerFrom, silencerTo, 0.1 * M, chrome));
  group.add(strut(silencerTo, silencerTo.clone().add(new V(0, 0.012 * M, -0.05 * M)), 0.075 * M, PALETTE.ink));

  // The tank, the one big shape in the side view: a teardrop lofted aft to
  // fore, sitting on the backbone, a filler cap on its crown.
  const tank = loft(
    [
      { z: -0.14 * M, ring: octagon(0.11 * M, 0.74 * M, 0.88 * M, 0.5) },
      { z: -0.02 * M, ring: octagon(0.15 * M, 0.72 * M, 0.96 * M, 0.5) },
      { z: 0.16 * M, ring: octagon(0.17 * M, 0.74 * M, 1.02 * M, 0.5) },
      { z: 0.36 * M, ring: octagon(0.12 * M, 0.8 * M, 1.0 * M, 0.5) },
    ],
    paint,
  );
  group.add(tank);
  const cap = column(0.035 * M, 0.02 * M, chrome, 8);
  cap.position.set(0, 1.015 * M, 0.18 * M);
  group.add(cap);
  // A stripe along each flank, standing proud of it.
  for (const side of [-1, 1]) {
    const stripe = box(0.02 * M, 0.04 * M, 0.34 * M, tone(paint, 0.7));
    stripe.position.set(side * 0.17 * M, 0.86 * M, 0.12 * M);
    stripe.rotation.y = side * 0.08;
    group.add(stripe);
  }

  // The seat: one pad, the rider's step and the pillion's, lofted so the line
  // runs on from the tank; its top is each hip.
  const seat = loft(
    [
      { z: PILLION_Z - 0.3 * M, ring: octagon(0.1 * M, PILLION_HIP - 0.1 * M, PILLION_HIP - 0.02 * M, 0.5) },
      { z: PILLION_Z - 0.18 * M, ring: octagon(0.13 * M, PILLION_HIP - 0.14 * M, PILLION_HIP, 0.5) },
      { z: PILLION_Z + 0.2 * M, ring: octagon(0.14 * M, MOTO_HIP - 0.1 * M, PILLION_HIP, 0.5) },
      { z: PILLION_Z + 0.28 * M, ring: octagon(0.15 * M, MOTO_HIP - 0.1 * M, MOTO_HIP, 0.5) },
      { z: MOTO_SEAT_Z + 0.08 * M, ring: octagon(0.14 * M, MOTO_HIP - 0.1 * M, MOTO_HIP, 0.5) },
      { z: MOTO_SEAT_Z + 0.2 * M, ring: octagon(0.1 * M, 0.74 * M, 0.86 * M, 0.5) },
    ],
    PALETTE.bark,
  );
  group.add(seat);
  // The side panels under it, and the tail cowl under the pillion with the
  // tail-lamp in its end.
  for (const side of [-1, 1]) {
    const panel = box(0.04 * M, 0.2 * M, 0.3 * M, paint);
    panel.position.set(side * 0.13 * M, 0.5 * M, -0.34 * M);
    group.add(panel);
  }
  const tail = loft(
    [
      { z: PILLION_Z - 0.36 * M, ring: octagon(0.06 * M, PILLION_HIP - 0.18 * M, PILLION_HIP - 0.08 * M, 0.5) },
      { z: PILLION_Z + 0.12 * M, ring: octagon(0.12 * M, MOTO_HIP - 0.22 * M, PILLION_HIP - 0.1 * M, 0.5) },
    ],
    paint,
  );
  group.add(tail);
  const tailLamp = box(0.11 * M, 0.05 * M, 0.04 * M, PALETTE.crimson);
  tailLamp.position.set(0, PILLION_HIP - 0.16 * M, PILLION_Z - 0.37 * M);
  group.add(tailLamp);
  // The number plate on its hanger, and a grab rail round the pillion.
  group.add(strut(new V(0, PILLION_HIP - 0.16 * M, PILLION_Z - 0.34 * M), new V(0, 0.56 * M, PILLION_Z - 0.44 * M), 0.025 * M, metal));
  const plate = box(0.18 * M, 0.12 * M, 0.015 * M, PALETTE.cream);
  plate.position.set(0, 0.5 * M, PILLION_Z - 0.45 * M);
  group.add(plate);
  for (const side of [-1, 1]) {
    group.add(strut(new V(side * 0.14 * M, PILLION_HIP - 0.06 * M, PILLION_Z + 0.08 * M), new V(side * 0.12 * M, PILLION_HIP - 0.04 * M, PILLION_Z - 0.28 * M), 0.025 * M, chrome));
  }

  // The swing arm to the rear axle, a shock a side up to the rails, the chain
  // guard on the left, and the mudguard hugging the back of the rear wheel.
  for (const side of [-1, 1]) {
    const x = side * 0.1 * M;
    group.add(strut(new V(x, pivot.y, pivot.z), new V(x, MOTO_WHEEL, MOTO_REAR), 0.05 * M, metal));
    group.add(strut(new V(side * 0.12 * M, 0.72 * M, -0.62 * M), new V(side * 0.12 * M, 0.36 * M, -0.62 * M), 0.06 * M, PALETTE.gold));
    group.add(strut(new V(side * 0.12 * M, 0.76 * M, -0.62 * M), new V(side * 0.12 * M, 0.56 * M, -0.62 * M), 0.04 * M, chrome));
  }
  const guard = box(0.02 * M, 0.06 * M, 0.42 * M, tone(PALETTE.steel, 1.2));
  guard.position.set(0.14 * M, MOTO_WHEEL + 0.02 * M, (pivot.z + MOTO_REAR) / 2);
  guard.rotation.x = Math.atan2(pivot.y - MOTO_WHEEL, pivot.z - MOTO_REAR) * 0.5;
  group.add(guard);
  mudguard(group, MOTO_WHEEL, MOTO_REAR, MOTO_WHEEL + 0.035 * M, 0.16 * M, -1.7, -0.3, 3, paint);

  // The fork: two legs raked from the clamps to the axle, chrome above and
  // the sliders dark below, the clamps across them, and the front mudguard.
  const rake = new V(0, MOTO_WHEEL - STOCK.y, MOTO_FRONT - STOCK.z);
  for (const side of [-1, 1]) {
    const x = side * 0.09 * M;
    const top = new V(x, STOCK.y + 0.04 * M, STOCK.z - 0.015 * M);
    const knee = new V(x, STOCK.y, STOCK.z).addScaledVector(rake, 0.55);
    group.add(strut(top, knee, 0.04 * M, chrome));
    group.add(strut(knee, new V(x, MOTO_WHEEL, MOTO_FRONT), 0.06 * M, metal));
  }
  for (const [at, width] of [[0.02, 0.24], [0.2, 0.22]] as const) {
    const clamp = box(width * M, 0.04 * M, 0.08 * M, metal);
    const p = STOCK.clone().addScaledVector(rake, at);
    clamp.position.set(0, p.y - 0.02 * M, p.z);
    group.add(clamp);
  }
  mudguard(group, MOTO_WHEEL, MOTO_FRONT, MOTO_WHEEL + 0.03 * M, 0.14 * M, -0.6, 0.9, 4, paint);

  // The headlamp in its bowl ahead of the clamps, the clocks over them, the
  // bars on a riser with dark grips and levers, and a mirror either side.
  const bowl = column(0.1 * M, 0.08 * M, chrome, 10);
  bowl.rotation.x = Math.PI / 2;
  bowl.position.set(0, 0.9 * M, 0.5 * M);
  group.add(bowl);
  const lamp = column(0.085 * M, 0.02 * M, PALETTE.cream, 10);
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, 0.9 * M, 0.58 * M);
  group.add(lamp);
  const clocks = column(0.05 * M, 0.04 * M, PALETTE.ink, 8);
  clocks.rotation.x = -0.6;
  clocks.position.set(0, 1.03 * M, 0.44 * M);
  group.add(clocks);
  const riser = new V(0, MOTO_BARS.y - 0.02 * M, MOTO_BARS.z + 0.05 * M);
  group.add(strut(new V(0, STOCK.y + 0.04 * M, STOCK.z), riser, 0.04 * M, metal));
  const barHalf = 0.32 * M;
  for (const side of [-1, 1]) {
    const end = new V(side * barHalf, MOTO_BARS.y, MOTO_BARS.z);
    group.add(strut(riser.clone().setX(side * 0.001), new V(side * 0.12 * M, MOTO_BARS.y, MOTO_BARS.z + 0.04 * M), 0.03 * M, chrome));
    group.add(strut(new V(side * 0.12 * M, MOTO_BARS.y, MOTO_BARS.z + 0.04 * M), end, 0.03 * M, chrome));
    group.add(strut(end, new V(side * (barHalf + 0.12 * M), MOTO_BARS.y, MOTO_BARS.z - 0.02 * M), 0.05 * M, PALETTE.ink));
    group.add(strut(new V(side * 0.2 * M, MOTO_BARS.y + 0.01 * M, MOTO_BARS.z + 0.03 * M), new V(side * 0.36 * M, MOTO_BARS.y - 0.01 * M, MOTO_BARS.z + 0.08 * M), 0.015 * M, metal));
    const stalkFoot = new V(side * 0.2 * M, MOTO_BARS.y, MOTO_BARS.z + 0.02 * M);
    const stalkTop = new V(side * 0.28 * M, MOTO_BARS.y + 0.17 * M, MOTO_BARS.z);
    group.add(strut(stalkFoot, stalkTop, 0.015 * M, chrome));
    const mirror = box(0.1 * M, 0.06 * M, 0.02 * M, PALETTE.ink);
    mirror.position.set(side * 0.3 * M, stalkTop.y - 0.02 * M, MOTO_BARS.z);
    group.add(mirror);
  }

  // Pegs for both, the rider's on brackets, a brake pedal and a gear lever,
  // and a side stand down on the left.
  for (const side of [-1, 1]) {
    const peg = box(0.1 * M, 0.03 * M, 0.04 * M, PALETTE.ink);
    peg.position.set(side * 0.2 * M, PEG.y - 0.015 * M, PEG.z);
    group.add(peg);
    group.add(strut(new V(side * 0.1 * M, PEG.y + 0.06 * M, PEG.z - 0.08 * M), new V(side * 0.16 * M, PEG.y, PEG.z), 0.03 * M, metal));
    const back = box(0.08 * M, 0.025 * M, 0.035 * M, PALETTE.ink);
    back.position.set(side * 0.2 * M, PEG.y + 0.06 * M - 0.0125 * M, PILLION_Z + 0.02 * M);
    group.add(back);
    group.add(strut(new V(side * 0.1 * M, 0.5 * M, PILLION_Z + 0.1 * M), new V(side * 0.17 * M, PEG.y + 0.06 * M, PILLION_Z + 0.02 * M), 0.025 * M, metal));
    group.add(strut(new V(side * 0.18 * M, PEG.y + 0.01 * M, PEG.z + 0.02 * M), new V(side * 0.18 * M, PEG.y + 0.04 * M, PEG.z + 0.2 * M), 0.02 * M, metal));
  }
  group.add(strut(new V(0.12 * M, 0.2 * M, -0.12 * M), new V(0.24 * M, 0.02 * M, -0.06 * M), 0.025 * M, metal));

  return assemble('motorbike', [soupOf(group)], [
    { name: 'wheel', at: new V(0, MOTO_WHEEL, MOTO_REAR), soup: motoWheelSoup(false) },
    { name: 'wheel', at: new V(0, MOTO_WHEEL, MOTO_FRONT), soup: motoWheelSoup(true) },
  ]);
}

const MOTO_SEATS: readonly Seat[] = [
  {
    x: 0,
    y: MOTO_HIP,
    z: MOTO_SEAT_Z,
    yaw: 0,
    pose: 'ride',
    shown: true,
    grip: [0, MOTO_BARS.y - MOTO_HIP, MOTO_BARS.z - MOTO_SEAT_Z],
    feet: [0.2 * M, PEG.y - MOTO_HIP, PEG.z - MOTO_SEAT_Z],
  },
  {
    x: 0,
    y: PILLION_HIP,
    z: PILLION_Z,
    yaw: 0,
    pose: 'ride',
    shown: true,
    // Hands at the rider's waist; feet on the rear pegs.
    grip: [0, 0.14 * H, 0.2 * H],
    feet: [0.2 * M, PEG.y + 0.06 * M - PILLION_HIP, 0.02 * M],
  },
];

export function motorbikeModel(): CraftModel {
  return finish({
    id: 'motorbike',
    kind: 'motorbike',
    medium: 'road',
    seats: MOTO_SEATS,
    draft: 0,
    variants: MOTO_PAINTS.length,
    build: buildMotorbike,
  });
}
