/**
 * The helicopter: a light two-by-two, a bubble cabin on skids, a tail boom and
 * a two-bladed rotor.
 *
 * **Built round four seated bodies**, as the plane is: two abreast forward and
 * two behind, the floor a sole-to-hip under the hips, the cabin's roof a crown
 * and more over them. **The bubble is glass you see through** (since
 * 2026-10-04): the belly is a tub, a well cut into the fuselage to the waist
 * as the plane's cockpit is, and over it an open arch of see-through glass
 * from the waist up (`canopyGlass`), so the four inside are seen and see out.
 * Inside, an instrument console between the front seats, a cyclic by the
 * pilot's knee and a collective by his hip (`cabin.ts`). What reads from
 * outside is still the silhouette — the bubble forward, the boom thinning aft
 * to a fin and a tail rotor, the skids, and the rotor, which is most of the
 * machine's width.
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
import { GLASS_TINT, PROUD, assemble, craftContext, finish, loft, octagon, soupOf, well } from './build.ts';
import type { Soup, Station } from './build.ts';
import { instrumentPanel, seatPieces, stick } from './cabin.ts';

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
/** The rear bulkhead, behind the rear seats' backs: the cabin is open to the glass forward of it. */
const BULKHEAD = REAR - HERO.back - 0.08 * H;
const CABIN_AFT = BULKHEAD - 0.2 * M;
const TAIL = CABIN_AFT - 4 * M;
/** The tub's wall. */
const WALL = 0.04 * H;
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
  const group = new THREE.Group();

  // The cabin: a tub in the paint, open to the waist forward of the rear
  // bulkhead, and behind the bulkhead the engine bay, closed to the roof.
  const waist = HIP + 0.1 * H;
  const tub = (z: number, half: number, keel: number, sheer: number, decked = false): Station => ({
    z,
    ring: well({ keel, chineHalf: half, chineY: keel + 0.15 * M, sheerHalf: half, sheerY: sheer, floor: FLOOR, wall: WALL, decked }),
  });
  group.add(
    loft(
      [
        tub(BULKHEAD, HALF, FLOOR - 0.1 * M, waist),
        tub(FRONT, HALF, FLOOR - 0.12 * M, waist),
        tub(NOSE - 0.45 * M, HALF * 0.8, FLOOR - 0.05 * M, waist - 0.05 * M),
        tub(NOSE - 0.3 * M, HALF * 0.62, FLOOR + 0.05 * M, waist - 0.1 * M, true),
        tub(NOSE, HALF * 0.3, FLOOR + 0.25 * M, waist - 0.15 * M, true),
      ],
      paint,
    ),
  );
  group.add(
    loft(
      [
        cabin(CABIN_AFT, HALF * 0.8, FLOOR + 0.1 * M, ROOF - 0.1 * M),
        cabin(BULKHEAD, HALF, FLOOR - 0.1 * M, ROOF),
      ],
      paint,
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

  group.add(canopyFrame(waist, paint));

  // Inside: four seats on the tub's floor, the instrument console between
  // the front two with its panel facing them, the pilot's cyclic by his
  // inboard knee and the collective by his hip.
  const inside = new THREE.Group();
  for (const [i, seat] of SEATS.entries()) inside.add(seatPieces(seat, FLOOR, PALETTE.bark, i < 2));
  const middle: Seat = { ...SEATS[0]!, x: 0 };
  const panelTop = 0.22 * H;
  inside.add(instrumentPanel(middle, ABREAST + HERO.half * 1.6, panelTop, HERO.toe + 0.06 * H, PALETTE.steel, 6));
  const pedestal = box(0.12 * H, HIP + panelTop - 0.14 * H - FLOOR, 0.1 * H, tone(PALETTE.steel, 0.8));
  pedestal.position.set(0, FLOOR, FRONT + HERO.toe + 0.08 * H);
  inside.add(pedestal);
  const pilot = SEATS[0]!;
  inside.add(stick({ ...pilot, x: pilot.x + 0.17 * H }, FLOOR, HIP - FLOOR + 0.13 * H, PALETTE.ink));
  inside.add(strut(new V(pilot.x + 0.19 * H, HIP - 0.05 * H, pilot.z - 0.08 * H), new V(pilot.x + 0.19 * H, HIP + 0.04 * H, pilot.z + 0.16 * H), 0.02 * H, PALETTE.ink));

  return assemble(
    'helicopter',
    [soupOf(group)],
    [
      { name: 'rotor', at: new V(0, HUB.y, HUB.z), soup: soupOf(rotor) },
      { name: 'tail', at: new V(0.12 * M, HIP + 0.55 * M, TAIL + 0.15 * M), soup: soupOf(tail) },
    ],
    { glass: [canopyGlass(waist)], cabin: [soupOf(inside)] },
  );
}

/**
 * The bubble: an open arch of glass from the waist on one side over the roof
 * to the waist on the other, from the rear bulkhead to the nose, where it
 * closes on a small cap. Built as faces, not as a loft, because a loft is a
 * closed solid and a closed bubble would put a sheet of glass across the
 * cabin at the waist; glass has no ink and is drawn both sides, so which way
 * it is wound does not matter.
 */
/** The bubble's sections, aft to fore: an arch each, from the waist on one side over the roof to the other. */
function canopyStations(waist: number): { z: number; ring: [number, number][] }[] {
  // The corners cut by `round` of the smaller of the half-width and the
  // height: square enough over the rear seats to clear the heads under them.
  const arch = (half: number, bottom: number, top: number, round = 0.35): [number, number][] => {
    const c = Math.min(half, top - bottom) * round;
    return [
      [half, bottom],
      [half, top - c],
      [half - c, top],
      [-half + c, top],
      [-half, top - c],
      [-half, bottom],
    ];
  };
  return [
    { z: BULKHEAD, ring: arch(HALF - PROUD, waist - PROUD, ROOF - PROUD) },
    { z: FRONT, ring: arch(HALF * 0.98, waist - PROUD, ROOF - 0.02 * M) },
    { z: NOSE - 0.45 * M, ring: arch(HALF * 0.78, waist - 0.05 * M - PROUD, ROOF - 0.35 * M, 0.5) },
    { z: NOSE - 0.05 * M, ring: arch(HALF * 0.32, waist - 0.15 * M - PROUD, waist + 0.2 * M, 0.55) },
  ];
}

/**
 * The bubble's frame: a bar along each of its two middle arches and one
 * down its spine, in the paint, just outside the glass — what makes a
 * see-through bubble read as a canopy from the seat and from the chase
 * camera, where glass alone is a sheen with no edges.
 */
function canopyFrame(waist: number, colour: number): THREE.Group {
  const { strut } = craftContext();
  const group = new THREE.Group();
  const stations = canopyStations(waist);
  const out = (p: readonly [number, number], z: number): THREE.Vector3 => new V(p[0] * 1.02, p[1] + (p[1] > waist ? PROUD : 0), z);
  for (const station of stations.slice(1, 3)) {
    for (let j = 0; j + 1 < station.ring.length; j++) group.add(strut(out(station.ring[j]!, station.z), out(station.ring[j + 1]!, station.z), 0.035 * M, colour));
  }
  for (let i = 0; i + 1 < stations.length - 1; i++) {
    const a = stations[i]!;
    const b = stations[i + 1]!;
    const top = (ring: readonly [number, number][]): [number, number] => [0, ring[2]![1]];
    group.add(strut(out(top(a.ring), a.z), out(top(b.ring), b.z), 0.035 * M, colour));
  }
  return group;
}

function canopyGlass(waist: number): Soup {
  const stations = canopyStations(waist);
  const points: number[] = [];
  const quad = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]) => points.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i + 1 < stations.length; i++) {
    const A = stations[i]!;
    const B = stations[i + 1]!;
    for (let j = 0; j + 1 < A.ring.length; j++) {
      quad([...A.ring[j]!, A.z], [...A.ring[j + 1]!, A.z], [...B.ring[j + 1]!, B.z], [...B.ring[j]!, B.z]);
    }
  }
  // The nose's cap: the last arch closed along its bottom, as a fan.
  const last = stations[stations.length - 1]!;
  for (let j = 1; j + 1 < last.ring.length; j++) points.push(...last.ring[0]!, last.z, ...last.ring[j]!, last.z, ...last.ring[j + 1]!, last.z);
  const soup: Soup = {
    position: new Float32Array(points),
    normal: new Float32Array(points.length),
    color: new Float32Array(points.length),
    outline: new Float32Array(points.length),
  };
  const tint = new THREE.Color(GLASS_TINT);
  const a = new V();
  const b = new V();
  const c = new V();
  for (let i = 0; i < points.length; i += 9) {
    a.fromArray(points, i);
    b.fromArray(points, i + 3).sub(a);
    c.fromArray(points, i + 6).sub(a);
    const n = b.cross(c).normalize();
    for (let k = 0; k < 3; k++) {
      n.toArray(soup.normal, i + k * 3);
      n.toArray(soup.outline, i + k * 3);
      tint.toArray(soup.color, i + k * 3);
    }
  }
  return soup;
}

const SEATS: readonly Seat[] = [
  // The pilot on the right, as a helicopter's is: facing +Z, -X.
  { x: -ABREAST / 2, y: HIP, z: FRONT, yaw: 0, pose: 'sit', shown: true },
  { x: ABREAST / 2, y: HIP, z: FRONT, yaw: 0, pose: 'sit', shown: true },
  { x: -ABREAST / 2, y: HIP, z: REAR, yaw: 0, pose: 'sit', shown: true },
  { x: ABREAST / 2, y: HIP, z: REAR, yaw: 0, pose: 'sit', shown: true },
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
