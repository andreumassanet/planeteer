/**
 * The balloon: the traffic kit's hot-air balloon (`traffic/parts/hot-air-balloon.ts`)
 * drawn round a basket that four people stand in.
 *
 * **The envelope is the traffic's**: the same two lathes — a throat in a second
 * colour and a crown over it, the crown's foot pulled in to 0.94 of the throat's
 * shoulder so the joint is an ink line and not a painted band — at the same
 * profile, twelve sides, because a balloon is sewn. What changes is what it is
 * sized from. The traffic basket is 1.5 to 1.8 across for one rider of 3.11
 * who stands *in* a solid box; this one is hollow, and it holds four heroes
 * two by two with an elbow's room between them, which makes it 0.86 of a body
 * across. The envelope is then four and a half baskets across, where the
 * traffic's is six and a real one about twelve: a real balloon over a basket
 * this size would be forty units across and fifty tall, and it was chosen to
 * read as the same balloon at a glance rather than as a gasometer.
 *
 * **And the gores are free here.** The traffic file gives them up because each
 * gore would be a mesh and a draw call; a craft is merged into one buffer, so
 * twelve alternating gores cost triangles only, and they are the one thing
 * every drawing of a hot-air balloon has.
 *
 * **Standing seats.** The four stand on the basket's floor, which is
 * `AVATAR_HIP` under each seat's hip point (see `body.ts`); the rim comes to a
 * standing body's chest, so from the chase camera four heads and pairs of
 * shoulders show over it. The burner is on a frame over their heads, not among
 * them.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import type { CraftModel, Seat } from './contract.ts';
import { ABREAST, AVATAR_HIP, HERO } from './body.ts';
import { PROUD, assemble, craftContext, finish, lathe, soupOf } from './build.ts';

const H = AVATAR_HEIGHT;
const V = THREE.Vector3;

/** The basket's floor, over its own skids. */
const FLOOR = 0.05 * H;
/** Where the four stand: two abreast, and two deep with a pack's depth and a little air between. */
const ACROSS = ABREAST / 2;
const DEEP = HERO.depth + 0.04 * H;
/** Inside half-width of the basket, and its wall. */
const INNER = Math.max(ACROSS + HERO.half, DEEP + HERO.depth) + 0.04 * H;
const WICKER = 0.035 * H;
const OUTER = INNER + WICKER;
/** The rim: at a standing body's chest. */
const RIM = FLOOR + 0.58 * H;
/** The burner's frame, clear over the tallest crown. */
const FRAME = FLOOR + HERO.standing + 0.12 * H;
/** The envelope's mouth, its widest radius and its height, as the traffic's proportions. */
const MOUTH_Y = FRAME + 0.3 * H;
const RADIUS = OUTER * 2 * 2.25;
const MOUTH = RADIUS * 0.27;
const TALL = RADIUS * 1.78;

/** Gores, alternating, and the throat. Six looks. */
const PAINTS: readonly [number, number, number][] = [
  [PALETTE.red, PALETTE.gold, PALETTE.crimson],
  [PALETTE.skyBlue, PALETTE.white, PALETTE.slate],
  [PALETTE.violet, PALETTE.gold, PALETTE.crimson],
  [PALETTE.green, PALETTE.cream, PALETTE.darkOlive],
  [PALETTE.orange, PALETTE.white, PALETTE.red],
  [PALETTE.pink, PALETTE.white, PALETTE.violet],
];

const SEATS: readonly Seat[] = [
  // Seat 0 stands at the burner's valve, forward left; nobody steers a balloon
  // but somebody works the burner.
  { x: ACROSS, y: FLOOR + AVATAR_HIP, z: DEEP, yaw: 0, pose: 'stand', shown: true },
  { x: -ACROSS, y: FLOOR + AVATAR_HIP, z: DEEP, yaw: 0, pose: 'stand', shown: true },
  { x: ACROSS, y: FLOOR + AVATAR_HIP, z: -DEEP, yaw: 0, pose: 'stand', shown: true },
  { x: -ACROSS, y: FLOOR + AVATAR_HIP, z: -DEEP, yaw: 0, pose: 'stand', shown: true },
];

const SIDES = 12;

function buildBalloon(variant: number): THREE.Group {
  const { box, strut, column, tone } = craftContext();
  const [gore, second, throat] = PAINTS[((variant % PAINTS.length) + PAINTS.length) % PAINTS.length]!;
  const group = new THREE.Group();

  // ---- the basket ---------------------------------------------------------
  // Hollow: a floor and four walls, each wall its own piece so the corners are
  // ink lines, and a padded rim standing proud round the top.
  const wicker = PALETTE.tan;
  const floor = box(OUTER * 2, FLOOR, OUTER * 2, tone(wicker, 0.8));
  group.add(floor);
  for (const [dx, dz, w, d] of [
    [0, 1, OUTER * 2, WICKER],
    [0, -1, OUTER * 2, WICKER],
    [1, 0, WICKER, INNER * 2],
    [-1, 0, WICKER, INNER * 2],
  ] as const) {
    const wall = box(w, RIM - FLOOR, d, wicker);
    wall.position.set(dx * (INNER + WICKER / 2), FLOOR, dz * (INNER + WICKER / 2));
    group.add(wall);
  }
  // A band of darker weave round the middle and a padded rim round the top,
  // each four bars standing proud of the walls: a slab across the basket
  // would be a lid over the people in it.
  for (const [y, tall, colour] of [
    [FLOOR + (RIM - FLOOR) * 0.45, 0.05 * H, tone(wicker, 0.78)],
    [RIM - 0.01 * H, 0.045 * H, PALETTE.bark],
  ] as const) {
    const t = WICKER + PROUD * 2;
    for (const [dx, dz, w, d] of [
      [0, 1, OUTER * 2 + PROUD * 2, t],
      [0, -1, OUTER * 2 + PROUD * 2, t],
      [1, 0, t, OUTER * 2 - WICKER * 2],
      [-1, 0, t, OUTER * 2 - WICKER * 2],
    ] as const) {
      const bar = box(w, tall, d, colour);
      bar.position.set(dx * (INNER + WICKER / 2), y, dz * (INNER + WICKER / 2));
      group.add(bar);
    }
  }

  // ---- the burner ---------------------------------------------------------
  // Four uprights straight up from the basket's corners — outside every
  // standing body, which a raked one would cross at the head — to a frame over
  // their heads, two bars across it to the burner in the middle, and the
  // envelope's mouth over that.
  const corners = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ] as const;
  const post = INNER - 0.02 * H;
  for (const [dx, dz] of corners) {
    group.add(strut(new V(dx * post, RIM, dz * post), new V(dx * post, FRAME, dz * post), 0.03 * H, PALETTE.steel));
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]!;
    const [bx, bz] = corners[(i + 1) % 4]!;
    group.add(strut(new V(ax * post, FRAME, az * post), new V(bx * post, FRAME, bz * post), 0.03 * H, PALETTE.steel));
  }
  for (const [ax, az] of corners.slice(0, 2)) {
    group.add(strut(new V(ax * post, FRAME, az * post), new V(-ax * post, FRAME, -az * post), 0.025 * H, PALETTE.steel));
  }
  const burner = column(0.1 * H, 0.14 * H, PALETTE.steel, 8);
  burner.position.y = FRAME - 0.07 * H;
  group.add(burner);
  const coil = column(0.12 * H, 0.04 * H, PALETTE.gold, 8);
  coil.position.y = FRAME + 0.03 * H;
  group.add(coil);

  // Ropes from the frame to the mouth ring: pure ink at any distance, and
  // what turns a basket and an envelope into one object.
  for (const [dx, dz] of corners) {
    group.add(strut(new V(dx * post, FRAME, dz * post), new V(dx * MOUTH * 0.7, MOUTH_Y + 0.02 * H, dz * MOUTH * 0.7), 0.02 * H, PALETTE.bark));
  }

  // ---- the envelope -------------------------------------------------------
  const skirtH = TALL * 0.34;
  const crownH = TALL - skirtH;
  const skirt = lathe(
    [
      [0, 0],
      [MOUTH, 0],
      [RADIUS * 0.74, skirtH * 0.55],
      [RADIUS * 0.97, skirtH],
      [0, skirtH],
    ],
    throat,
    SIDES,
  );
  skirt.position.y = MOUTH_Y;
  group.add(skirt);
  const crownProfile: [number, number][] = [
    [0, 0],
    [RADIUS * 0.94, 0],
    [RADIUS, crownH * 0.22],
    [RADIUS * 0.82, crownH * 0.55],
    [RADIUS * 0.36, crownH * 0.85],
    [0, crownH],
  ];
  for (let i = 0; i < SIDES; i++) {
    const piece = lathe(crownProfile, i % 2 === 0 ? gore : second, 1, i / SIDES, (i + 1) / SIDES);
    piece.position.y = MOUTH_Y + skirtH - 0.015 * H;
    group.add(piece);
  }
  // A crown ring at the top, proud: the parachute valve.
  const valve = column(RADIUS * 0.12, PROUD * 2, tone(throat, 0.9), SIDES);
  valve.position.y = MOUTH_Y + skirtH - 0.015 * H + crownH - PROUD;
  group.add(valve);

  return assemble('balloon', [soupOf(group)]);
}

export function balloonModel(): CraftModel {
  return finish({
    id: 'balloon',
    kind: 'balloon',
    medium: 'air',
    seats: SEATS,
    draft: 0,
    variants: PAINTS.length,
    build: buildBalloon,
  });
}
