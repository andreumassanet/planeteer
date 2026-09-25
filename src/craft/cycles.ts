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

function buildBicycle(variant: number): THREE.Group {
  const ctx = craftContext();
  const { strut, box, column } = ctx;
  const paint = BIKE_PAINTS[((variant % BIKE_PAINTS.length) + BIKE_PAINTS.length) % BIKE_PAINTS.length]!;
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
  // A mudguard over each wheel, standing proud of the tyre.
  for (const [z, from, to] of [[REAR_AXLE, 0.3, 1.9], [FRONT_AXLE, -0.3, 1.2]] as const) {
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const a = from + ((to - from) * i) / steps;
      const b = from + ((to - from) * (i + 1)) / steps;
      const r = BIKE_WHEEL + 0.03 * M;
      group.add(
        strut(new V(0, BIKE_WHEEL + Math.cos(a) * r, z - Math.sin(a) * r), new V(0, BIKE_WHEEL + Math.cos(b) * r, z - Math.sin(b) * r), 0.06 * M, paint),
      );
    }
  }
  // The seat post and the saddle, whose top is the hip.
  group.add(strut(seatTop, new V(0, BIKE_HIP - 0.04 * M, -BIKE_BACK), tube, trim));
  const saddle = box(0.14 * M, 0.05 * M, 0.26 * M, PALETTE.bark);
  saddle.position.set(0, BIKE_HIP - 0.05 * M, -BIKE_BACK - 0.02 * M);
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

const MOTO_PAINTS: readonly number[] = [PALETTE.red, PALETTE.ink, PALETTE.skyBlue, PALETTE.orange, PALETTE.green, PALETTE.crimson];

function buildMotorbike(variant: number): THREE.Group {
  const ctx = craftContext();
  const { strut, box, column, tone } = ctx;
  const paint = MOTO_PAINTS[((variant % MOTO_PAINTS.length) + MOTO_PAINTS.length) % MOTO_PAINTS.length]!;
  const metal = PALETTE.steel;
  const chrome = PALETTE.bone;
  const group = new THREE.Group();

  // The engine, low between the wheels, and its cylinders up under the tank.
  const engine = box(0.3 * M, 0.3 * M, 0.44 * M, metal);
  engine.position.set(0, 0.2 * M, 0.02 * M);
  group.add(engine);
  const head = box(0.34 * M, 0.16 * M, 0.2 * M, tone(PALETTE.steel, 1.25));
  head.position.set(0, 0.46 * M, 0.12 * M);
  head.rotation.x = -0.35;
  group.add(head);
  // The tank, the one big shape in the side view: a rounded box lofted fore to aft.
  const tank = loft(
    [
      { z: MOTO_SEAT_Z + 0.12 * M, ring: octagon(0.12 * M, 0.72 * M, 0.9 * M, 0.5) },
      { z: 0.1 * M, ring: octagon(0.17 * M, 0.7 * M, 1.02 * M, 0.5) },
      { z: 0.32 * M, ring: octagon(0.13 * M, 0.76 * M, 1.02 * M, 0.5) },
    ],
    paint,
  );
  group.add(tank);
  // The seat, dark, in two steps; a tail cowl under the pillion's end.
  const seat = box(0.26 * M, 0.08 * M, 0.44 * M, PALETTE.bark);
  seat.position.set(0, MOTO_HIP - 0.08 * M, MOTO_SEAT_Z - 0.04 * M);
  group.add(seat);
  const pillion = box(0.24 * M, 0.1 * M, 0.34 * M, PALETTE.bark);
  pillion.position.set(0, PILLION_HIP - 0.1 * M, PILLION_Z - 0.02 * M);
  group.add(pillion);
  const tail = loft(
    [
      { z: PILLION_Z - 0.3 * M, ring: octagon(0.08 * M, PILLION_HIP - 0.2 * M, PILLION_HIP - 0.1 * M, 0.5) },
      { z: PILLION_Z + 0.2 * M, ring: octagon(0.14 * M, MOTO_HIP - 0.26 * M, PILLION_HIP - 0.1 * M, 0.5) },
    ],
    paint,
  );
  group.add(tail);
  // The frame from the headstock back under the seat to the swing arm.
  const stock = new V(0, 0.98 * M, 0.42 * M);
  group.add(strut(stock, new V(0, 0.34 * M, 0.08 * M), 0.05 * M, metal));
  group.add(strut(new V(0, 0.72 * M, MOTO_SEAT_Z + 0.1 * M), new V(0, 0.62 * M, PILLION_Z - 0.2 * M), 0.04 * M, metal));
  for (const side of [-1, 1]) {
    const x = side * 0.1 * M;
    // The swing arm, and the fork's legs down to the front axle.
    group.add(strut(new V(x, 0.3 * M, -0.12 * M), new V(x, MOTO_WHEEL, MOTO_REAR), 0.05 * M, metal));
    group.add(strut(new V(x * 0.9, stock.y, stock.z + 0.02 * M), new V(x, MOTO_WHEEL, MOTO_FRONT), 0.045 * M, chrome));
    // A shock from the frame to the swing arm, and a peg a side.
    group.add(strut(new V(x, 0.7 * M, PILLION_Z + 0.1 * M), new V(x, 0.4 * M, MOTO_REAR * 0.55), 0.035 * M, PALETTE.gold));
    const peg = box(0.1 * M, 0.03 * M, 0.05 * M, PALETTE.ink);
    peg.position.set(side * 0.2 * M, PEG.y - 0.015 * M, PEG.z);
    group.add(peg);
  }
  // The exhaust down the right side, out past the rear axle.
  group.add(strut(new V(-0.12 * M, 0.3 * M, 0.12 * M), new V(-0.16 * M, 0.26 * M, -0.2 * M), 0.06 * M, chrome));
  group.add(strut(new V(-0.16 * M, 0.26 * M, -0.2 * M), new V(-0.17 * M, 0.42 * M, MOTO_REAR - 0.12 * M), 0.085 * M, chrome));
  // The fenders, the headlamp, and the bars on a clamp over the headstock.
  const rearFender = box(0.14 * M, 0.03 * M, 0.34 * M, paint);
  rearFender.position.set(0, MOTO_WHEEL * 2 + 0.05 * M, MOTO_REAR + 0.02 * M);
  rearFender.rotation.x = 0.35;
  group.add(rearFender);
  const frontFender = box(0.13 * M, 0.03 * M, 0.3 * M, paint);
  frontFender.position.set(0, MOTO_WHEEL * 2 + 0.03 * M, MOTO_FRONT - 0.02 * M);
  group.add(frontFender);
  const lamp = column(0.09 * M, 0.08 * M, PALETTE.cream, 10);
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, stock.y - 0.04 * M, stock.z + 0.1 * M);
  group.add(lamp);
  const bowl = column(0.1 * M, 0.06 * M, chrome, 10);
  bowl.rotation.x = Math.PI / 2;
  bowl.position.set(0, stock.y - 0.04 * M, stock.z + 0.04 * M);
  group.add(bowl);
  group.add(strut(stock, new V(0, MOTO_BARS.y - 0.03 * M, MOTO_BARS.z + 0.03 * M), 0.05 * M, metal));
  const barHalf = 0.34 * M;
  for (const side of [-1, 1]) {
    group.add(strut(new V(0, MOTO_BARS.y - 0.03 * M, MOTO_BARS.z + 0.03 * M), new V(side * barHalf, MOTO_BARS.y, MOTO_BARS.z), 0.035 * M, chrome));
    group.add(strut(new V(side * barHalf, MOTO_BARS.y, MOTO_BARS.z), new V(side * (barHalf + 0.1 * M), MOTO_BARS.y, MOTO_BARS.z - 0.02 * M), 0.05 * M, PALETTE.ink));
  }
  // The tail lamp.
  const tailLamp = box(0.1 * M, 0.05 * M, 0.03 * M, PALETTE.crimson);
  tailLamp.position.set(0, PILLION_HIP - 0.16 * M, PILLION_Z - 0.31 * M);
  group.add(tailLamp);

  return assemble('motorbike', [soupOf(group)], [
    { name: 'wheel', at: new V(0, MOTO_WHEEL, MOTO_REAR), soup: wheelSoup(MOTO_WHEEL, 0.07 * M, PALETTE.ink, chrome, 5) },
    { name: 'wheel', at: new V(0, MOTO_WHEEL, MOTO_FRONT), soup: wheelSoup(MOTO_WHEEL, 0.06 * M, PALETTE.ink, chrome, 5) },
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
