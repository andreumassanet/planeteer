/**
 * The helicopter: a light two-by-two, a bubble cabin on skids, a tail boom and
 * a two-bladed rotor.
 *
 * **Built round four seated bodies**, as the plane is: two abreast forward and
 * two behind, the floor a sole-to-hip under the hips, the cabin's roof a crown
 * and more over them. The glazing is opaque, as every window in this world
 * is, so the seats are hidden; what reads is the silhouette — the bubble
 * forward, the boom thinning aft to a fin and a tail rotor, the skids, and
 * the rotor, which is most of the machine's width.
 *
 * **What turns.** The rotor is a `'rotor'` about +Y on its mast, and the tail
 * rotor a `'tail'` about +X on the fin's left side; the motion spins them up
 * when somebody is at the controls, winds them down when nobody is, and puts a
 * pale disc where the blades sweep at speed, as it does for a propeller.
 *
 * Skids on y = 0; one metre is the body's own, `AVATAR_HEIGHT / 1.75`.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import type { CraftModel, Seat } from './contract.ts';
import { ABREAST, HERO } from './body.ts';
import { PROUD, assemble, craftContext, finish, loft, octagon, soupOf } from './build.ts';
import type { Station } from './build.ts';

const H = AVATAR_HEIGHT;
const M = H / 1.75;
const V = THREE.Vector3;

/** The cabin's floor over the skids, and the hips a sole-to-hip over it. */
const FLOOR = 0.55 * M;
const HIP = FLOOR + HERO.sole;
/** The roof: a crown and a tenth of a body over the hips. */
const ROOF = HIP + HERO.crown + 0.1 * H;
/** Half the cabin's width: two abreast and an elbow's room. */
const HALF = ABREAST / 2 + HERO.half + 0.08 * H;
const FRONT = 0.4 * M;
const REAR = FRONT - (HERO.back + 0.04 * H + HERO.knee + 0.04 * H);
const NOSE = FRONT + HERO.toe + 0.5 * M;
const CABIN_AFT = REAR - HERO.back - 0.2 * M;
const TAIL = CABIN_AFT - 4 * M;
/** The rotor's hub and its blades' reach. */
const HUB = { y: ROOF + 0.45 * M, z: (FRONT + REAR) / 2 };
const BLADE = 3.9 * M;

/** A cabin section at `z`: an octagon from the belly to the roof, narrowing and lowering at the ends. */
const cabin = (z: number, half: number, bottom: number, top: number, chamfer = 0.45): Station => ({ z, ring: octagon(half, bottom, top, chamfer) });

/** Body colour, then the stripe's. */
const PAINTS: readonly [number, number][] = [
  [PALETTE.red, PALETTE.white],
  [PALETTE.white, PALETTE.skyBlue],
  [PALETTE.gold, PALETTE.ink],
  [PALETTE.skyBlue, PALETTE.white],
  [PALETTE.ink, PALETTE.gold],
  [PALETTE.orange, PALETTE.white],
];

function buildHelicopter(variant: number): THREE.Group {
  const ctx = craftContext();
  const { box, strut, column, tone } = ctx;
  const [paint, stripe] = PAINTS[((variant % PAINTS.length) + PAINTS.length) % PAINTS.length]!;
  const glass = tone(PALETTE.slate, 0.72);
  const group = new THREE.Group();

  // The cabin: a belly in the paint and a canopy of glass over it, forward of
  // the rear bulkhead; the back of the cabin is all paint.
  const waist = HIP + 0.1 * H;
  group.add(
    loft(
      [
        cabin(CABIN_AFT, HALF * 0.8, FLOOR + 0.1 * M, ROOF - 0.1 * M),
        cabin(REAR - 0.1 * M, HALF, FLOOR - 0.1 * M, ROOF),
        cabin(FRONT, HALF, FLOOR - 0.12 * M, waist),
        cabin(NOSE - 0.45 * M, HALF * 0.8, FLOOR - 0.05 * M, waist - 0.05 * M),
        cabin(NOSE, HALF * 0.3, FLOOR + 0.25 * M, waist - 0.15 * M, 0.5),
      ],
      paint,
    ),
  );
  group.add(
    loft(
      [
        cabin(REAR - 0.1 * M + PROUD, HALF - PROUD, waist - PROUD, ROOF - PROUD, 0.5),
        cabin(FRONT, HALF * 0.98, waist - PROUD, ROOF - 0.02 * M, 0.55),
        cabin(NOSE - 0.45 * M, HALF * 0.78, waist - 0.05 * M - PROUD, ROOF - 0.35 * M, 0.6),
        cabin(NOSE - 0.05 * M, HALF * 0.32, waist - 0.15 * M - PROUD, waist + 0.2 * M, 0.6),
      ],
      glass,
    ),
  );
  // A stripe down each flank.
  for (const side of [-1, 1]) {
    const band = box(PROUD, 0.12 * M, NOSE - CABIN_AFT - 0.8 * M, stripe);
    band.position.set(side * (HALF + PROUD * 0.5), FLOOR + 0.12 * M, (NOSE + CABIN_AFT) / 2 - 0.3 * M);
    group.add(band);
  }
  // The engine cowl on the roof, and the mast to the hub.
  const cowl = loft(
    [
      { z: CABIN_AFT - 0.2 * M, ring: octagon(0.25 * M, ROOF - 0.15 * M, ROOF + 0.2 * M, 0.5) },
      { z: HUB.z + 0.3 * M, ring: octagon(0.35 * M, ROOF - 0.05 * M, ROOF + 0.3 * M, 0.5) },
    ],
    paint,
  );
  group.add(cowl);
  const mast = column(0.07 * M, HUB.y - ROOF - 0.2 * M, PALETTE.steel, 8);
  mast.position.set(0, ROOF + 0.2 * M, HUB.z);
  group.add(mast);
  // The tail boom, thinning aft, its fin and its stabiliser.
  group.add(
    loft(
      [
        { z: TAIL, ring: octagon(0.08 * M, HIP + 0.05 * M, HIP + 0.25 * M, 0.5) },
        { z: CABIN_AFT - 0.1 * M, ring: octagon(0.22 * M, FLOOR + 0.35 * M, ROOF - 0.25 * M, 0.5) },
      ],
      paint,
    ),
  );
  const fin = box(0.06 * M, 0.9 * M, 0.5 * M, paint);
  fin.position.set(0, HIP + 0.1 * M, TAIL + 0.2 * M);
  fin.rotation.x = 0.35;
  group.add(fin);
  const stabiliser = box(1.1 * M, 0.05 * M, 0.3 * M, stripe);
  stabiliser.position.set(0, HIP + 0.1 * M, TAIL + 0.7 * M);
  group.add(stabiliser);
  // An end plate on each tip of it, and a skid under the fin that keeps the
  // tail rotor off the ground on a flare.
  for (const side of [-1, 1]) {
    const plate = box(0.04 * M, 0.26 * M, 0.26 * M, paint);
    plate.position.set(side * 0.57 * M, HIP + 0.02 * M, TAIL + 0.7 * M);
    group.add(plate);
  }
  group.add(strut(new V(0, HIP + 0.08 * M, TAIL + 0.45 * M), new V(0, HIP - 0.3 * M, TAIL + 0.1 * M), 0.04 * M, PALETTE.steel));
  // The exhaust out of the back of the cowl, and a door line down each flank
  // between the front seats and the back.
  group.add(strut(new V(0, ROOF + 0.05 * M, CABIN_AFT - 0.15 * M), new V(0, ROOF + 0.02 * M, CABIN_AFT - 0.45 * M), 0.12 * M, PALETTE.ink));
  for (const side of [-1, 1]) {
    const door = box(PROUD, waist - FLOOR, 0.04 * M, tone(paint, 0.7));
    door.position.set(side * (HALF + PROUD * 0.5), FLOOR, (FRONT + REAR) / 2 - 0.1 * M);
    group.add(door);
  }
  // The skids, on the ground, with their cross tubes up to the belly and the toes turned up.
  const skidX = HALF + 0.12 * M;
  const skidAft = CABIN_AFT - 0.1 * M;
  const skidFore = NOSE - 0.5 * M;
  for (const side of [-1, 1]) {
    const x = side * skidX;
    group.add(strut(new V(x, 0.04 * M, skidAft), new V(x, 0.04 * M, skidFore), 0.07 * M, PALETTE.steel));
    group.add(strut(new V(x, 0.04 * M, skidFore), new V(x, 0.2 * M, skidFore + 0.3 * M), 0.07 * M, PALETTE.steel));
    for (const z of [REAR, FRONT + 0.1 * M]) group.add(strut(new V(x, 0.04 * M, z), new V(side * HALF * 0.7, FLOOR - 0.05 * M, z + 0.001), 0.06 * M, PALETTE.steel));
  }
  // A landing light under the nose.
  const lamp = column(0.06 * M, 0.04 * M, PALETTE.cream, 8);
  lamp.position.set(0, FLOOR + 0.2 * M, NOSE - 0.25 * M);
  group.add(lamp);

  // The rotor: a hub and two blades, laid across the craft at rest.
  const rotor = new THREE.Group();
  const hub = column(0.16 * M, 0.14 * M, PALETTE.steel, 8);
  hub.position.y = -0.07 * M;
  rotor.add(hub);
  for (const side of [-1, 1]) {
    const blade = box(BLADE, 0.04 * M, 0.26 * M, PALETTE.ink);
    blade.position.set((side * (BLADE + 0.1 * M)) / 2, -0.02 * M, 0);
    rotor.add(blade);
  }
  // The tail rotor: two blades on the fin's left side.
  const tail = new THREE.Group();
  const tailHub = column(0.05 * M, 0.08 * M, PALETTE.steel, 6);
  tailHub.rotation.z = Math.PI / 2;
  tailHub.position.x = 0.04 * M;
  tail.add(tailHub);
  const tailBlade = box(0.04 * M, 1.1 * M, 0.12 * M, PALETTE.ink);
  tailBlade.position.set(0, -0.55 * M, 0);
  tail.add(tailBlade);

  return assemble('helicopter', [soupOf(group)], [
    { name: 'rotor', at: new V(0, HUB.y, HUB.z), soup: soupOf(rotor) },
    { name: 'tail', at: new V(0.12 * M, HIP + 0.55 * M, TAIL + 0.15 * M), soup: soupOf(tail) },
  ]);
}

const SEATS: readonly Seat[] = [
  // The pilot on the right, as a helicopter's is: facing +Z, -X.
  { x: -ABREAST / 2, y: HIP, z: FRONT, yaw: 0, pose: 'sit', shown: false },
  { x: ABREAST / 2, y: HIP, z: FRONT, yaw: 0, pose: 'sit', shown: false },
  { x: -ABREAST / 2, y: HIP, z: REAR, yaw: 0, pose: 'sit', shown: false },
  { x: ABREAST / 2, y: HIP, z: REAR, yaw: 0, pose: 'sit', shown: false },
];

export function helicopterModel(): CraftModel {
  return finish({
    id: 'helicopter',
    kind: 'helicopter',
    medium: 'air',
    seats: SEATS,
    draft: 0,
    variants: PAINTS.length,
    build: buildHelicopter,
  });
}
