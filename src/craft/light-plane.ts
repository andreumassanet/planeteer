/**
 * The light plane: a chunky low-wing tourer with one open cockpit for four,
 * two abreast in two rows, a propeller on the nose and three wheels on y = 0.
 *
 * **Open, because this world has no glass you can see through.** A canopy is a
 * see-through fill, and a see-through fill that writes no depth shows its whole
 * ink hull through itself; an opaque one hides the four people it exists to
 * carry. So the cockpit is a well in the fuselage, like the old floatplane's,
 * and each row has a low screen ahead of it that stops under the seated eyes.
 *
 * **Low wing, and the reason is the map camera.** The plane is looked at from
 * overhead for most of a flight — the whole globe fits the lens at the ceiling —
 * and a high wing would sit between that camera and every head in the cockpit.
 * With the wing under the floor, all four read from above, which is the
 * framing this model is for: the old floatplane's seat was measured at 40 px
 * from overhead and at none from astern, and this one is built for the
 * overhead.
 *
 * **Tricycle gear**, so the fuselage stands level on the ground and the seats
 * are level with it: a taildragger sits nose-high and every seat would be tipped
 * back by the same angle, which the seated pose does not know about. The main
 * wheels wear spats, which are what make a small plane look like a toy rather
 * than a trainer.
 *
 * **Every size falls out of the four bodies.** The floor is the hero's shin
 * under the hip; the coaming a ninth of a body over the hip, so the chest,
 * shoulders and head of every passenger are out in the air; the fuselage two
 * bodies abreast with an elbow's room; the rows a pack, a seat back and a knee
 * apart; the panel ahead of the front toes. The flying surfaces are then sized
 * to look right against that fuselage, not against a real aeroplane, which
 * would want a wing twice this span: 13.9 across on a fuselage 12.0 long from
 * spinner to rudder (2026-09-24, `pnpm craft`), it is the stubby, cheerful
 * proportion of a toy, which is the register.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import type { CraftModel, Seat } from './contract.ts';
import { ABREAST, HERO } from './body.ts';
import { PROUD, assemble, craftContext, finish, loft, octagon, soupOf, well } from './build.ts';
import type { Station, Turning } from './build.ts';

const H = AVATAR_HEIGHT;
const V = THREE.Vector3;

/** The wheels, and the belly over them. */
const MAIN_WHEEL = 0.11 * H;
const NOSE_WHEEL = 0.09 * H;
const BELLY = 0.3 * H;
/** The cockpit floor, and the seat on it. */
const FLOOR = BELLY + 0.04 * H;
const HIP = FLOOR + HERO.sole;
/** The coaming: a ninth of a body over the hip, so everything above the chest is outside. */
const COAMING = HIP + 0.11 * H;
const WALL = 0.04 * H;
/** Half the fuselage at the cockpit: two abreast, an elbow's room, the wall. */
const HALF = ABREAST / 2 + HERO.half + 0.07 * H + WALL;

const ROW_PITCH = HERO.back + 0.04 * H + HERO.knee + 0.03 * H;
const FRONT = 0.24 * H;
const REAR = FRONT - ROW_PITCH;
const WELL_AFT = REAR - HERO.back - 0.07 * H;
const WELL_FORE = FRONT + HERO.toe + 0.03 * H;
/** The nose's face, where the spinner sits, and the tail's end. */
const NOSE = WELL_FORE + 0.5 * H;
const TAIL = WELL_AFT - 1.2 * H;
/** Where the propeller turns: the middle of the nose's face. */
const HUB_Y = BELLY + 0.27 * H;

/** Fuselage, wings and trim: the plane's three colours. Six looks. */
const PAINTS: readonly [number, number, number][] = [
  [PALETTE.red, PALETTE.cream, PALETTE.gold],
  [PALETTE.skyBlue, PALETTE.white, PALETTE.red],
  [PALETTE.gold, PALETTE.white, PALETTE.crimson],
  [PALETTE.white, PALETTE.red, PALETTE.skyBlue],
  [PALETTE.green, PALETTE.cream, PALETTE.orange],
  [PALETTE.violet, PALETTE.white, PALETTE.gold],
];

const SEATS: readonly Seat[] = [
  // The pilot in the front left seat, which facing +Z is +X.
  { x: ABREAST / 2, y: HIP, z: FRONT, yaw: 0, pose: 'sit', shown: true },
  { x: -ABREAST / 2, y: HIP, z: FRONT, yaw: 0, pose: 'sit', shown: true },
  { x: ABREAST / 2, y: HIP, z: REAR, yaw: 0, pose: 'sit', shown: true },
  { x: -ABREAST / 2, y: HIP, z: REAR, yaw: 0, pose: 'sit', shown: true },
];

/**
 * A wing panel, from `root` out to `span`, lofted along +Z in its own frame
 * with the chord along X and turned onto the span afterwards. `side` +1 is the
 * left wing (+X). The section is a thick slab with a rounded nose and a thin
 * tail, which at this size is what an aerofoil looks like; the last station is
 * pulled in so the tip is rounded in plan.
 */
function wingPanel(side: 1 | -1, chord: number, thick: number, span: number, lift: number, colour: number): THREE.Mesh {
  // In the panel's frame +X is aft for the left wing and forward for the right,
  // because the quarter turn that lays +Z along the span also turns X; the
  // section is written in "forward" and mirrored for the left.
  const section = (c: number, t: number, y: number): [number, number][] => {
    const lead = c * 0.32;
    const trail = -c * 0.68;
    const pts: [number, number][] = [
      [trail, y + t * 0.08],
      [trail + c * 0.18, y - t * 0.3],
      [lead - c * 0.12, y - t * 0.5],
      [lead, y - t * 0.1],
      [lead - c * 0.04, y + t * 0.35],
      [lead - c * 0.22, y + t * 0.5],
      [trail + c * 0.3, y + t * 0.32],
    ];
    return pts.map(([f, h]) => [side > 0 ? -f : f, h] as [number, number]);
  };
  const stations: Station[] = [
    { z: 0, ring: section(chord, thick, 0) },
    { z: span * 0.55, ring: section(chord * 0.94, thick * 0.9, span * 0.55 * lift) },
    { z: span * 0.92, ring: section(chord * 0.84, thick * 0.78, span * 0.92 * lift) },
    { z: span, ring: section(chord * 0.55, thick * 0.5, span * lift) },
  ];
  const mesh = loft(stations, colour);
  mesh.rotation.y = side * (Math.PI / 2);
  return mesh;
}

function buildPlane(variant: number): THREE.Group {
  const ctx = craftContext();
  const { box, strut, taper, column, tone } = ctx;
  const [paint, wingColour, trim] = PAINTS[((variant % PAINTS.length) + PAINTS.length) % PAINTS.length]!;
  const group = new THREE.Group();

  // ---- the fuselage -------------------------------------------------------
  // Three lofts that meet with a small overlap, so each joint is an ink line —
  // the panel lines of a real one: the cockpit section with the well cut into
  // it, the cowl forward, the tail cone aft.
  const chine = BELLY + 0.08 * H;
  const cockpit: Station[] = [
    { z: WELL_AFT - 0.06 * H, ring: well({ keel: BELLY, chineHalf: HALF, chineY: chine, sheerHalf: HALF, sheerY: COAMING, floor: FLOOR, wall: WALL, decked: true }) },
    { z: WELL_AFT, ring: well({ keel: BELLY, chineHalf: HALF, chineY: chine, sheerHalf: HALF, sheerY: COAMING, floor: FLOOR, wall: WALL }) },
    { z: WELL_FORE, ring: well({ keel: BELLY, chineHalf: HALF, chineY: chine, sheerHalf: HALF, sheerY: COAMING, floor: FLOOR, wall: WALL }) },
    { z: WELL_FORE + 0.03 * H, ring: well({ keel: BELLY, chineHalf: HALF, chineY: chine, sheerHalf: HALF, sheerY: COAMING, floor: FLOOR, wall: WALL, decked: true }) },
  ].map((s) => ({ z: s.z, ring: flatBottom(s.ring, HALF * 0.72) }));
  group.add(loft(cockpit, paint));

  const cowlTop = COAMING + 0.05 * H;
  group.add(
    loft(
      [
        { z: WELL_FORE, ring: octagon(HALF * 0.99, BELLY + 0.005 * H, cowlTop) },
        { z: WELL_FORE + 0.26 * H, ring: octagon(HALF * 0.93, BELLY + 0.03 * H, cowlTop - 0.01 * H) },
        { z: NOSE, ring: octagon(HALF * 0.68, BELLY + 0.1 * H, HUB_Y + 0.17 * H, 0.5) },
      ],
      paint,
    ),
  );
  // A band round the cowl in the trim colour, proud of it: the joint between
  // the engine and the cabin, which is where a real one is painted.
  group.add(
    loft(
      [
        { z: WELL_FORE + 0.02 * H, ring: octagon(HALF * 0.99 + PROUD, BELLY - PROUD * 0.5, cowlTop + PROUD) },
        { z: WELL_FORE + 0.09 * H, ring: octagon(HALF * 0.97 + PROUD, BELLY + 0.01 * H - PROUD * 0.5, cowlTop + PROUD) },
      ],
      trim,
    ),
  );

  // The tail cone: a hump behind the rear seats — the headrest fairing that
  // makes a small open plane read as one — tapering to the fin.
  const hump = COAMING + 0.1 * H;
  group.add(
    loft(
      [
        { z: TAIL, ring: octagon(0.06 * H, COAMING - 0.14 * H, COAMING - 0.05 * H, 0.5) },
        { z: TAIL + 0.45 * H, ring: octagon(0.18 * H, BELLY + 0.26 * H, COAMING, 0.45) },
        { z: WELL_AFT - 0.3 * H, ring: octagon(HALF * 0.76, BELLY + 0.1 * H, hump - 0.01 * H, 0.45) },
        { z: WELL_AFT - 0.03 * H, ring: octagon(HALF * 0.99, BELLY + 0.005 * H, hump, 0.4) },
      ],
      paint,
    ),
  );

  // A stripe down each flank in the trim colour, proud of the skin: one long
  // horizontal line is what tells a fuselage from a tub at the chase distance.
  for (const side of [-1, 1]) {
    const x = side * (HALF + PROUD * 0.5);
    const y0 = COAMING - 0.1 * H;
    const y1 = COAMING - 0.06 * H;
    group.add(
      loft(
        [
          { z: WELL_AFT - 0.02 * H, ring: [[x - PROUD, y0], [x + PROUD, y0], [x + PROUD, y1], [x - PROUD, y1]] },
          { z: WELL_FORE + 0.25 * H, ring: [[x - PROUD, y0], [x + PROUD, y0], [x + PROUD, y1], [x - PROUD, y1]] },
        ],
        trim,
      ),
    );
  }

  // ---- the cockpit --------------------------------------------------------
  // The floor, the panel on the forward bulkhead, and four seats whose pans
  // are exactly at the hip and whose backs stand behind the pack.
  const floor = box(HALF * 2 - WALL * 2.4, PROUD, WELL_FORE - WELL_AFT - 0.02 * H, PALETTE.bark);
  floor.position.set(0, FLOOR, (WELL_AFT + WELL_FORE) / 2);
  group.add(floor);
  const panel = box(HALF * 2 - WALL * 2.4, COAMING - HIP - 0.02 * H, PROUD, PALETTE.steel);
  panel.position.set(0, HIP + 0.02 * H, WELL_FORE - PROUD * 0.5);
  group.add(panel);
  for (const seat of SEATS) {
    const width = HERO.half * 2.2;
    const depth = 0.2 * H;
    const pan = box(width, HIP - FLOOR - PROUD, depth, tone(PALETTE.bark, 1.25));
    pan.position.set(seat.x, FLOOR + PROUD, seat.z - 0.02 * H);
    const back = box(width, 0.22 * H, 0.05 * H, tone(PALETTE.bark, 1.25));
    back.position.set(seat.x, HIP - 0.02 * H, seat.z - HERO.back - 0.03 * H);
    back.rotation.x = -0.15;
    group.add(pan, back);
  }

  // A low screen on the cowl, raked back, its top edge a third of a body over
  // the hip: under the seated eyes, so the front row looks over it.
  const glass = tone(PALETTE.slate, 0.72);
  const front = box(HALF * 1.7, 0.2 * H, PROUD, glass);
  front.position.set(0, cowlTop - 0.01 * H, WELL_FORE + 0.08 * H);
  front.rotation.x = -0.6;
  group.add(front);
  const frame = box(HALF * 1.74, 0.02 * H, 0.03 * H, trim);
  frame.position.set(0, cowlTop - 0.01 * H + 0.2 * H * Math.cos(0.6), WELL_FORE + 0.08 * H - 0.2 * H * Math.sin(0.6));
  group.add(frame);

  // ---- the flying surfaces ------------------------------------------------
  // The wing hangs under the cabin floor, its root inside the fuselage.
  const chord = 0.7 * H;
  const span = 1.8 * H;
  const wingZ = FRONT + 0.1 * H;
  for (const side of [1, -1] as const) {
    const wing = wingPanel(side, chord, 0.13 * H, span, 0.05, wingColour);
    // Its top a hair under the cabin floor, so no part of it shows in the well.
    wing.position.set(0, BELLY - 0.035 * H, wingZ);
    group.add(wing);
    // A tip in the trim colour, proud of the wing's end.
    const tip = box(0.05 * H, 0.07 * H, chord * 0.5, trim);
    tip.position.set(side * (span + 0.02 * H), BELLY - 0.035 * H + span * 0.05 - 0.035 * H, wingZ - chord * 0.1);
    group.add(tip);

    const tailplane = wingPanel(side, 0.36 * H, 0.05 * H, 0.62 * H, 0.02, wingColour);
    tailplane.position.set(0, COAMING - 0.1 * H, TAIL + 0.25 * H);
    group.add(tailplane);
  }
  // The fin: a swept slab over the tail, and a rudder in the trim colour
  // behind it, stepped so the hinge is an ink line.
  const finBase = COAMING - 0.08 * H;
  const finRing = (bottom: number, top: number, half: number): [number, number][] => [
    [-half, bottom],
    [half, bottom],
    [half * 0.6, top],
    [-half * 0.6, top],
  ];
  group.add(
    loft(
      [
        { z: TAIL + 0.05 * H, ring: finRing(finBase, finBase + 0.52 * H, 0.025 * H) },
        { z: TAIL + 0.28 * H, ring: finRing(finBase, finBase + 0.45 * H, 0.03 * H) },
        { z: TAIL + 0.7 * H, ring: finRing(finBase, finBase + 0.06 * H, 0.03 * H) },
      ],
      paint,
    ),
  );
  group.add(
    loft(
      [
        { z: TAIL - 0.1 * H, ring: finRing(finBase + 0.02 * H, finBase + 0.5 * H, 0.02 * H) },
        { z: TAIL + 0.06 * H, ring: finRing(finBase - 0.02 * H, finBase + 0.53 * H, 0.022 * H) },
      ],
      trim,
    ),
  );

  // ---- the undercarriage --------------------------------------------------
  const turning: Turning[] = [];
  // A tyre and a hub cap about the axle, which is X through the origin: a
  // prism stood on y = 0 and laid over by a quarter turn, then slid back half
  // its width so it turns about its own middle.
  const wheel = (radius: number, width: number): THREE.Group => {
    const w = new THREE.Group();
    // `column` takes the half-width across the flats and ten sides put a corner
    // at the bottom, so the apothem is taken in by cos(pi/10) and that corner
    // is what touches y = 0.
    const tyre = column(radius * Math.cos(Math.PI / 10), width, PALETTE.ink, 10);
    tyre.rotation.z = Math.PI / 2;
    tyre.position.x = width / 2;
    const hubCap = column(radius * 0.45, width + PROUD, PALETTE.bone, 6);
    hubCap.rotation.z = Math.PI / 2;
    hubCap.position.x = (width + PROUD) / 2;
    w.add(tyre, hubCap);
    return w;
  };
  const mainX = HALF + 0.12 * H;
  const mainZ = wingZ - 0.12 * H;
  for (const side of [-1, 1]) {
    turning.push({ name: 'wheel', at: new V(side * mainX, MAIN_WHEEL, mainZ), soup: soupOf(wheel(MAIN_WHEEL, 0.07 * H)) });
    // The spat: a teardrop over the top of the wheel, open underneath where
    // the tyre shows.
    const spatHalf = 0.06 * H;
    const spat = loft(
      [
        { z: mainZ - 0.26 * H, ring: octagon(spatHalf * 0.3, MAIN_WHEEL + 0.02 * H, MAIN_WHEEL + 0.1 * H, 0.5) },
        { z: mainZ - 0.08 * H, ring: octagon(spatHalf, MAIN_WHEEL * 0.55, MAIN_WHEEL * 2 + 0.03 * H, 0.5) },
        { z: mainZ + 0.1 * H, ring: octagon(spatHalf, MAIN_WHEEL * 0.55, MAIN_WHEEL * 2 + 0.03 * H, 0.5) },
        { z: mainZ + 0.24 * H, ring: octagon(spatHalf * 0.4, MAIN_WHEEL * 0.9, MAIN_WHEEL + 0.1 * H, 0.5) },
      ],
      paint,
    );
    spat.position.x = side * mainX;
    group.add(spat);
    // The leg runs up out of the spat into the wing above it.
    group.add(strut(new V(side * mainX, MAIN_WHEEL * 2, mainZ), new V(side * mainX * 0.92, BELLY - 0.03 * H, mainZ + 0.02 * H), 0.05 * H, PALETTE.steel));
  }
  // The nose wheel far enough back that the propeller's tip passes in front of it.
  const noseZ = NOSE - 0.2 * H;
  turning.push({ name: 'wheel', at: new V(0, NOSE_WHEEL, noseZ), soup: soupOf(wheel(NOSE_WHEEL, 0.06 * H)) });
  group.add(strut(new V(0, NOSE_WHEEL, noseZ), new V(0, BELLY + 0.14 * H, noseZ - 0.08 * H), 0.045 * H, PALETTE.steel));

  // ---- the propeller ------------------------------------------------------
  // Its own part, spinning about +Z: a spinner and two blades. The blade tip
  // clears the ground by a nose wheel's radius.
  const prop = new THREE.Group();
  const spinner = taper(0.09 * H, 0.015 * H, 0.2 * H, trim, 8);
  spinner.rotation.x = Math.PI / 2;
  prop.add(spinner);
  const blade = HUB_Y - NOSE_WHEEL;
  for (const turn of [0, Math.PI]) {
    const arm = new THREE.Group();
    arm.rotation.z = turn;
    const b = box(0.07 * H, blade, 0.025 * H, PALETTE.bark);
    b.position.z = 0.04 * H;
    b.rotation.y = 0.25;
    const tip = box(0.07 * H, 0.06 * H, 0.03 * H, PALETTE.gold);
    tip.position.set(0, blade - 0.06 * H, 0.04 * H);
    tip.rotation.y = 0.25;
    arm.add(b, tip);
    prop.add(arm);
  }
  turning.push({ name: 'prop', at: new V(0, HUB_Y, NOSE + 0.005 * H), soup: soupOf(prop) });

  return assemble('light-plane', [soupOf(group)], turning);
}

/**
 * The well's section with its bottom flattened: the fuselage has no keel, so
 * the keel point comes up to the belly and the chines are pulled in to `flat`,
 * which leaves a rounded corner either side of a flat belly.
 */
function flatBottom(ring: [number, number][], flat: number): [number, number][] {
  const [keel, chine, ...rest] = ring;
  const last = rest.pop()!;
  return [
    [-flat, keel![1]],
    [flat, keel![1]],
    [chine![0], chine![1]],
    ...rest,
    [last[0], last[1]],
  ];
}

export function lightPlaneModel(): CraftModel {
  return finish({
    id: 'light-plane',
    kind: 'plane',
    medium: 'air',
    seats: SEATS,
    draft: 0,
    variants: PAINTS.length,
    build: buildPlane,
  });
}
