/**
 * The submarine: a little yellow two-seater for the reef, eight and a half
 * metres of it, of the kind that takes tourists down off a harbour — a round hull, a conning tower with a
 * hatch and a periscope, a bubble of a viewport at the bow, portholes down the
 * sides, dive planes and a rudder, and a screw astern.
 *
 * **A cabin you see out of** (since 2026-10-04): the two seats are inside the
 * hull, one behind the other under the tower, and the hull is lined inside
 * (`liner` in `cabin.ts`) and open at the bow, where the dome is see-through
 * glass — the viewport the whole boat is built round. A floor, two seats and
 * a console ahead of the front one; from outside, whoever is aboard is seen
 * through the dome, and from the front seat the reef is seen through it.
 * The seats are sized round the seated hero, so the hull's crown clears his.
 *
 * **What turns** is the screw, a `'prop'` about +Z, which the motion spins
 * with the throttle as it does a propeller's.
 *
 * **Waterline at y = 0**, with the tower and the top of the hull out of the
 * water and `draft` of it under, as it floats on the surface; under way below
 * it, the whole of it is under (`player.ts` takes it down). One metre is the
 * body's own, `AVATAR_HEIGHT / 1.75`.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import type { CraftModel, Seat } from './contract.ts';
import { HERO } from './body.ts';
import { GLASS_TINT, PROUD, assemble, craftContext, finish, lathe, loft, soupOf } from './build.ts';
import type { Soup, Station, Turning } from './build.ts';
import { instrumentPanel, joinSoups, liner, painted, probeOf, seatPieces } from './cabin.ts';

const H = AVATAR_HEIGHT;
const M = H / 1.75;
const V = THREE.Vector3;

/** The hull's axis over the waterline and its radius: a seated crown and a margin under the top. */
const AXIS = 0.18 * M;
const RADIUS = 1.25 * M;
/** The bow and the stern. */
const BOW = 4.2 * M;
const STERN = -4.3 * M;
/** The seats' hips, low in the hull, one behind the other. */
const HIP = AXIS - 0.62 * M;
const FRONT = 0.9 * M;
const REAR = FRONT - (HERO.back + 0.04 * H + HERO.knee + 0.04 * H);
/** The tower: where it stands along the hull, its half-length, half-width and top. */
const TOWER_Z = -0.2 * M;
const TOWER_HALF = 1.0 * M;
const TOWER_WIDE = 0.45 * M;
const TOWER_TOP = AXIS + RADIUS + 0.95 * M;

/** A round section of the hull at `z`, `r` across, its middle `y`. */
function round(z: number, r: number, y = AXIS, sides = 12): Station {
  return {
    z,
    ring: Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2;
      return [Math.cos(a) * r, y + Math.sin(a) * r] as [number, number];
    }),
  };
}

/** Hull, then the trim. */
const PAINTS: readonly [number, number][] = [
  [PALETTE.gold, PALETTE.ink],
  [PALETTE.gold, PALETTE.skyBlue],
  [PALETTE.orange, PALETTE.white],
  [PALETTE.white, PALETTE.red],
];

function buildSubmarine(variant: number): THREE.Group {
  const ctx = craftContext();
  const { box, strut, column, tone, taper, ringWall } = ctx;
  const [hull, trim] = PAINTS[((variant % PAINTS.length) + PAINTS.length) % PAINTS.length]!;
  const glass = tone(PALETTE.slate, 0.78);
  const group = new THREE.Group();

  // The hull: a cigar, fuller forward, drawn to a point aft for the screw,
  // and open at the bow, where the dome is.
  const shell = new THREE.Group();
  shell.add(loft(HULL, hull, true));
  group.add(shell);
  // A band of trim round the hull where the dome meets it, proud of the skin:
  // a ring, so the bow it stands round stays open.
  const band = ringWall(RADIUS * 0.535, RADIUS * 0.57 + PROUD, 0.18 * M, trim, 12);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, AXIS, BOW - 0.45 * M);
  group.add(band);

  // The tower, a rounded box on the hull's back, with a hatch and a rail.
  const towerStations: Station[] = [
    { z: TOWER_Z - TOWER_HALF, ring: towerRing(0.55) },
    { z: TOWER_Z - TOWER_HALF * 0.6, ring: towerRing(0.95) },
    { z: TOWER_Z + TOWER_HALF * 0.5, ring: towerRing(1) },
    { z: TOWER_Z + TOWER_HALF, ring: towerRing(0.7) },
  ];
  group.add(loft(towerStations, hull));
  const hatch = column(0.36 * M, 0.12 * M, trim, 10);
  hatch.position.set(0, TOWER_TOP, TOWER_Z);
  group.add(hatch);
  // Windows in the tower's sides and portholes down the hull's, in slate.
  for (const side of [-1, 1]) {
    const pane = box(PROUD, 0.26 * M, 0.5 * M, glass);
    pane.position.set(side * (TOWER_WIDE + PROUD * 0.3), TOWER_TOP - 0.62 * M, TOWER_Z + 0.25 * M);
    group.add(pane);
    for (let k = 0; k < 3; k++) {
      // A column stands up +Y; turned a quarter about Z the other way to the
      // side, it stands out of the hull rather than into it.
      const porthole = column(0.2 * M, 0.14 * M, glass, 10);
      porthole.rotation.z = (-side * Math.PI) / 2;
      porthole.position.set(side * (RADIUS - 0.08 * M), AXIS + 0.12 * M, 1.8 * M - k * 1.1 * M);
      group.add(porthole);
      const rim = column(0.27 * M, 0.1 * M, trim, 10);
      rim.rotation.z = (-side * Math.PI) / 2;
      rim.position.set(side * (RADIUS - 0.08 * M), AXIS + 0.12 * M, 1.8 * M - k * 1.1 * M);
      group.add(rim);
    }
    // The dive planes forward, and the stern planes.
    const plane = box(0.7 * M, 0.08 * M, 0.5 * M, trim);
    plane.position.set(side * (RADIUS + 0.2 * M), AXIS - 0.04 * M, 2.2 * M);
    group.add(plane);
    const stern = box(0.8 * M, 0.08 * M, 0.55 * M, trim);
    stern.position.set(side * (RADIUS * 0.55 + 0.3 * M), AXIS - 0.04 * M, STERN + 0.75 * M);
    group.add(stern);
  }
  // The rudder, above and below the stern.
  const rudder = box(0.08 * M, 1.5 * M, 0.7 * M, trim);
  rudder.position.set(0, AXIS - 0.75 * M, STERN + 0.75 * M);
  group.add(rudder);
  // The periscope, off the tower's front, bent at the top.
  const mast = new V(0, TOWER_TOP, TOWER_Z + TOWER_HALF * 0.5);
  const head = new V(0, TOWER_TOP + 0.6 * M, TOWER_Z + TOWER_HALF * 0.5);
  group.add(strut(mast, head, 0.1 * M, PALETTE.steel));
  group.add(strut(head, new V(0, head.y, head.z + 0.3 * M), 0.13 * M, PALETTE.steel));
  // A lamp either side of the dome.
  for (const side of [-1, 1]) {
    const lamp = taper(0.12 * M, 0.08 * M, 0.2 * M, PALETTE.cream, 8);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.62 * M, AXIS - 0.5 * M, 3.4 * M);
    group.add(lamp);
  }

  // The screw: four blades on a boss, about +Z, behind the stern. Four, so
  // it turns about its own middle: an odd count's box is off its axis.
  const screw = new THREE.Group();
  const boss = taper(0.16 * M, 0.06 * M, 0.25 * M, PALETTE.steel, 8);
  boss.rotation.x = -Math.PI / 2;
  boss.position.z = 0.1 * M;
  screw.add(boss);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k / 4) * Math.PI * 2;
    const blade = box(0.26 * M, 0.55 * M, 0.05 * M, PALETTE.gold);
    blade.rotation.y = 0.5;
    arm.add(blade);
    screw.add(arm);
  }
  const turning: Turning[] = [{ name: 'prop', at: new V(0, AXIS, STERN - 0.12 * M), soup: soupOf(screw) }];

  return assemble('submarine', [soupOf(group)], turning, { glass: [dome()], cabin: [cabinOf(soupOf(shell))] });
}

/** The hull's sections, aft to fore. */
const HULL: readonly Station[] = [
  round(STERN, 0.28 * M),
  round(STERN + 0.9 * M, RADIUS * 0.62),
  round(-2.2 * M, RADIUS * 0.94),
  round(-0.6 * M, RADIUS),
  round(1.6 * M, RADIUS),
  round(3.0 * M, RADIUS * 0.86),
  round(BOW - 0.35 * M, RADIUS * 0.55),
];

/** The viewport: a dome of see-through glass on the open bow, the one big window. */
function dome(): Soup {
  const holder = new THREE.Group();
  const shape = lathe([[0, 0.62 * M], [0.38 * M, 0.52 * M], [0.62 * M, 0.26 * M], [RADIUS * 0.58, 0]], PALETTE.slate, 12);
  shape.rotation.x = Math.PI / 2;
  shape.position.set(0, AXIS, BOW - 0.4 * M);
  holder.add(shape);
  return painted(soupOf(holder), GLASS_TINT);
}

/**
 * Where the sea is kept out of the hull while it floats (`seaHull` in
 * `ocean.ts`): along the axis from behind the rear seat to the dome, through
 * four of the hull's own stations, a little inside the lining at each; each
 * station's z about the front seat's, which `finish` moves with the hull.
 */
export const SUB_DRY = {
  y: AXIS,
  stations: [
    [-2.2 * M - FRONT, RADIUS * 0.88],
    [1.6 * M - FRONT, RADIUS * 0.95],
    [3.0 * M - FRONT, RADIUS * 0.82],
    [BOW - 0.4 * M - FRONT, RADIUS * 0.52],
  ] as const,
};

/** The floor's top, under the soles of the two seated in the hull. */
const FLOOR = HIP - HERO.sole;

/**
 * The inside: the hull lined, a floor laid across it at the soles, the two
 * seats, and a console ahead of the front one with its instruments facing
 * it, under the line from the eye to the dome.
 */
function cabinOf(shell: Soup): Soup {
  const { box, tone } = craftContext();
  const probe = probeOf([shell]);
  const lining = liner(shell, {
    keep: () => true,
    colour: (y) => (y < FLOOR ? tone(PALETTE.steel, 0.8) : PALETTE.bone),
  });
  const group = new THREE.Group();
  const keepIn = 0.03 * H;
  const half = (z: number): number => Math.max(0.1 * H, Math.min(probe.wall(FLOOR, z, 1), probe.wall(FLOOR, z, -1)) - keepIn);
  // From behind the rear seat forward for as long as the hull is deep enough
  // under it: the hull narrows to the bow, and a floor past where its bottom
  // rises over the floor's would stand out through it.
  const deep = (z: number): boolean => probe.floor(0, AXIS, z) < FLOOR - 0.03 * H - keepIn;
  const from = REAR - HERO.back - 0.2 * H;
  let to = FRONT;
  while (to + 0.1 * M < BOW && deep(to + 0.1 * M)) to += 0.1 * M;
  const steps = 6;
  const floor: Station[] = [];
  for (let i = 0; i <= steps; i++) {
    const z = from + ((to - from) * i) / steps;
    const w = half(z);
    floor.push({ z, ring: [[-w, FLOOR - 0.03 * H], [w, FLOOR - 0.03 * H], [w, FLOOR], [-w, FLOOR]] });
  }
  group.add(loft(floor, tone(PALETTE.bark, 0.8)));
  for (const seat of SEATS) group.add(seatPieces(seat, FLOOR, PALETTE.bark));
  const front = SEATS[0]!;
  group.add(instrumentPanel(front, 0.5 * H, 0.22 * H, HERO.toe + 0.05 * H, PALETTE.steel, 3));
  const stand = box(0.3 * H, front.y + 0.08 * H - FLOOR, 0.08 * H, tone(PALETTE.steel, 0.8));
  stand.position.set(0, FLOOR, front.z + HERO.toe + 0.09 * H);
  group.add(stand);
  return joinSoups([lining, soupOf(group)]);
}

/** The tower's section, `share` of its full size: a rounded box from inside the hull to its top. */
function towerRing(share: number): [number, number][] {
  const half = TOWER_WIDE * share;
  const bottom = AXIS + RADIUS * 0.5;
  const top = TOWER_TOP - (1 - share) * 0.25 * M;
  const c = half * 0.35;
  return [
    [-half, bottom],
    [half, bottom],
    [half, top - c],
    [half - c, top],
    [-half + c, top],
    [-half, top - c],
  ];
}

const SEATS: readonly Seat[] = [
  { x: 0, y: HIP, z: FRONT, yaw: 0, pose: 'sit', shown: true },
  { x: 0, y: HIP, z: REAR, yaw: 0, pose: 'sit', shown: true },
];

export function submarineModel(): CraftModel {
  return finish({
    id: 'submarine',
    kind: 'submarine',
    medium: 'water',
    seats: SEATS,
    draft: RADIUS - AXIS,
    variants: PAINTS.length,
    build: buildSubmarine,
  });
}
