/**
 * The balloon: a hot-air balloon round a basket that four people stand in, the
 * one a town keeps and the ones that drift over it (`air-traffic.ts`).
 *
 * **The envelope is an inverted pear**, one lathe profile from the mouth to the
 * crown: narrow at the mouth, flaring through the throat, widest a little over
 * half way up and rounding over to a flat-ish crown — the shape every drawing
 * of a hot-air balloon has, where a lathe of a few rings reads as a mushroom.
 * It is sewn in `GORES` gores, each its own lathe so a gore is one colour, and
 * each gore cut into three zones up its height so a scheme can paint a band
 * round the equator or a skirt of colour at the throat. A load tape stands
 * `PROUD` over every seam from the mouth to the crown cap, and the crown wears
 * a cap over the parachute valve. Under the mouth hangs the scoop, a short
 * double-walled skirt round the burner's flame, and inside the mouth a dark
 * disc says the envelope is open.
 *
 * Its size is not a real balloon's. The basket is sized from the four heroes
 * it holds, two by two with an elbow's room, and the envelope is four and a
 * half baskets across where a real one is about twelve: a real balloon over a
 * basket this size would be forty units across and fifty tall, and it was
 * chosen to read as a balloon at a glance rather than as a gasometer.
 *
 * **The basket is woven**: a floor and four walls, ribs of a darker weave
 * standing proud of each wall, a band round the middle and a padded leather
 * rim round the top. **Standing seats**: the four stand on the basket's floor,
 * which is `AVATAR_HIP` under each seat's hip point (see `body.ts`); the rim
 * comes to a standing body's chest, so from the chase camera four heads and
 * pairs of shoulders show over it. The burner is on a frame over their heads,
 * and the flying wires run from that frame's corners up to the mouth.
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
/** The envelope's mouth, its widest radius and its height. */
const MOUTH_Y = FRAME + 0.3 * H;
const RADIUS = OUTER * 2 * 2.25;
const TALL = RADIUS * 1.78;

/**
 * The schemes: the gores' colours, cycled round the envelope, and what the
 * throat, the equator and the crown are painted where a scheme paints them
 * apart. The scoop and the crown cap take `trim`.
 */
interface Scheme {
  gores: readonly number[];
  throat?: number;
  band?: number;
  crown?: number;
  trim: number;
}
const SCHEMES: readonly Scheme[] = [
  { gores: [PALETTE.red, PALETTE.gold], trim: PALETTE.crimson },
  { gores: [PALETTE.skyBlue, PALETTE.white], band: PALETTE.crimson, trim: PALETTE.slate },
  { gores: [PALETTE.red, PALETTE.orange, PALETTE.gold, PALETTE.green, PALETTE.skyBlue, PALETTE.violet], trim: PALETTE.slate },
  { gores: [PALETTE.green, PALETTE.cream], crown: PALETTE.gold, trim: PALETTE.darkOlive },
  { gores: [PALETTE.violet, PALETTE.pink, PALETTE.white], trim: PALETTE.violet },
  { gores: [PALETTE.orange, PALETTE.white], throat: PALETTE.red, crown: PALETTE.red, trim: PALETTE.red },
  { gores: [PALETTE.crimson, PALETTE.gold], band: PALETTE.white, trim: PALETTE.crimson },
  { gores: [PALETTE.skyBlue, PALETTE.gold, PALETTE.white], throat: PALETTE.skyBlue, trim: PALETTE.slate },
];

/**
 * The envelope's profile, as (radius over `RADIUS`, height over `TALL`) from
 * the mouth up, and where the three zones part: the throat below `ZONES[0]`,
 * the equator's band between them, the crown above `ZONES[1]`.
 */
const PROFILE: readonly (readonly [number, number])[] = [
  [0.27, 0],
  [0.36, 0.07],
  [0.55, 0.19],
  [0.78, 0.33],
  [0.93, 0.46],
  [1, 0.6],
  [0.97, 0.71],
  [0.87, 0.81],
  [0.68, 0.9],
  [0.42, 0.96],
  [0, 1],
];
const ZONES = [3, 6] as const;
/** Gores round the envelope: even, and a multiple of every scheme's cycle. */
const GORES = 18;
/** Facets across one gore: two, so a gore bulges between its tapes. */
const GORE_FACETS = 2;
/** How far up the profile the load tapes run, as an index: under the crown cap. */
const TAPE_TOP = 9;

const SEATS: readonly Seat[] = [
  // Seat 0 stands at the burner's valve, forward left; nobody steers a balloon
  // but somebody works the burner.
  { x: ACROSS, y: FLOOR + AVATAR_HIP, z: DEEP, yaw: 0, pose: 'stand', shown: true },
  { x: -ACROSS, y: FLOOR + AVATAR_HIP, z: DEEP, yaw: 0, pose: 'stand', shown: true },
  { x: ACROSS, y: FLOOR + AVATAR_HIP, z: -DEEP, yaw: 0, pose: 'stand', shown: true },
  { x: -ACROSS, y: FLOOR + AVATAR_HIP, z: -DEEP, yaw: 0, pose: 'stand', shown: true },
];

function buildBalloon(variant: number): THREE.Group {
  const { box, strut, column, tone } = craftContext();
  const scheme = SCHEMES[((variant % SCHEMES.length) + SCHEMES.length) % SCHEMES.length]!;
  const group = new THREE.Group();

  // ---- the basket ---------------------------------------------------------
  // Hollow: a floor and four walls, each wall its own piece so the corners are
  // ink lines, ribs of a darker weave up each wall, a band round its middle
  // and a padded rim round the top.
  const wicker = tone(PALETTE.apricot, 0.78);
  const weave = tone(PALETTE.apricot, 0.62);
  const leather = tone(PALETTE.brown, 0.62);
  const floor = box(OUTER * 2, FLOOR, OUTER * 2, weave);
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
  // Ribs: the uprights a basket is woven round, `PROUD` out of each wall's
  // outer face, between the band and the rim's pads.
  const RIBS = 4;
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
    for (let k = 0; k < RIBS; k++) {
      const along = -OUTER + ((k + 0.5) * OUTER * 2) / RIBS;
      const rib = box(dz !== 0 ? 0.035 * H : PROUD, RIM - FLOOR - 0.06 * H, dx !== 0 ? 0.035 * H : PROUD, weave);
      rib.position.set(dx !== 0 ? dx * (OUTER + PROUD / 2) : along, FLOOR, dz !== 0 ? dz * (OUTER + PROUD / 2) : along);
      group.add(rib);
    }
  }
  // The band and the padded rim: four bars each, standing proud of the walls
  // and of the ribs. A slab across the basket would be a lid over the people in it.
  for (const [y, tall, out, colour] of [
    [FLOOR + (RIM - FLOOR) * 0.42, 0.05 * H, PROUD * 2, weave],
    [RIM - 0.025 * H, 0.06 * H, PROUD * 3, leather],
  ] as const) {
    // A `PROUD` into the basket, as far as the bodies in it allow, and `out` out of it.
    const t = WICKER + PROUD + out;
    const middle = INNER - PROUD + t / 2;
    for (const [dx, dz, w, d] of [
      [0, 1, OUTER * 2 + out * 2, t],
      [0, -1, OUTER * 2 + out * 2, t],
      [1, 0, t, (INNER - PROUD) * 2],
      [-1, 0, t, (INNER - PROUD) * 2],
    ] as const) {
      const bar = box(w, tall, d, colour);
      bar.position.set(dx * middle, y, dz * middle);
      group.add(bar);
    }
  }

  // ---- the burner ---------------------------------------------------------
  // Four uprights straight up from the basket's corners — outside every
  // standing body, which a raked one would cross at the head — to a frame over
  // their heads, two bars across it to the burners in the middle.
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
  // Twin burners side by side under one coil.
  for (const side of [-1, 1]) {
    const burner = column(0.055 * H, 0.15 * H, PALETTE.steel, 8);
    burner.position.set(side * 0.06 * H, FRAME - 0.08 * H, 0);
    group.add(burner);
  }
  const coil = column(0.13 * H, 0.04 * H, PALETTE.gold, 10);
  coil.position.y = FRAME + 0.03 * H;
  group.add(coil);

  // ---- the envelope -------------------------------------------------------
  const base = MOUTH_Y;
  const point = (k: number): [number, number] => [PROFILE[k]![0] * RADIUS, PROFILE[k]![1] * TALL];
  const zoneOf = (k: number): 0 | 1 | 2 => (k < ZONES[0] ? 0 : k < ZONES[1] ? 1 : 2);
  const paintOf = (gore: number, zone: 0 | 1 | 2): number => {
    if (zone === 0 && scheme.throat !== undefined) return scheme.throat;
    if (zone === 1 && scheme.band !== undefined) return scheme.band;
    if (zone === 2 && scheme.crown !== undefined) return scheme.crown;
    return scheme.gores[gore % scheme.gores.length]!;
  };
  const bounds = [0, ZONES[0], ZONES[1], PROFILE.length - 1] as const;
  for (let gore = 0; gore < GORES; gore++) {
    for (let zone = 0; zone < 3; zone++) {
      const rows: [number, number][] = [];
      for (let k = bounds[zone]!; k <= bounds[zone + 1]!; k++) rows.push(point(k));
      const piece = lathe(rows, paintOf(gore, zoneOf(bounds[zone]!)), GORE_FACETS, gore / GORES, (gore + 1) / GORES);
      piece.position.y = base;
      group.add(piece);
    }
  }
  // The load tapes: a narrow strip over every seam, `PROUD` out, mouth to cap.
  const tape = tone(PALETTE.white, 0.86);
  const tapeRows: [number, number][] = [];
  for (let k = 0; k <= TAPE_TOP; k++) {
    const [r, y] = point(k);
    tapeRows.push([r + PROUD, y]);
  }
  const TAPE = 0.003;
  for (let gore = 0; gore < GORES; gore++) {
    const at = gore / GORES;
    const strip = lathe(tapeRows, tape, 1, at - TAPE, at + TAPE);
    strip.position.y = base;
    group.add(strip);
  }
  // The crown cap over the parachute valve, a `PROUD` over the crown's last
  // two rings, and its ring.
  const cap = lathe(
    [
      [point(TAPE_TOP - 1)[0] * 0.55 + PROUD * 2, (point(TAPE_TOP - 1)[1] + point(TAPE_TOP)[1]) / 2],
      [point(TAPE_TOP)[0] + PROUD * 2, point(TAPE_TOP)[1]],
      [0, TALL + PROUD * 2],
    ],
    scheme.trim,
    GORES,
  );
  cap.position.y = base;
  group.add(cap);

  // Inside the mouth, a dark disc: the envelope is open, and from under it
  // the eye meets the dark of its inside rather than the sky through it.
  const inside = lathe([[0, 0], [point(1)[0] * 0.98, 0]], tone(scheme.trim, 0.5), GORES);
  inside.position.y = base + point(1)[1];
  group.add(inside);

  // The scoop: a short skirt under the mouth round the flame, two walls thick.
  const SCOOP = 0.24 * H;
  const mouth = point(0)[0];
  const scoop = lathe(
    [
      [mouth * 0.86, -SCOOP],
      [mouth * 0.92, -SCOOP],
      [mouth + PROUD, PROUD],
      [mouth - PROUD, PROUD],
      [mouth * 0.86, -SCOOP],
    ],
    tone(scheme.trim, 0.8),
    GORES,
  );
  scoop.position.y = base;
  group.add(scoop);

  // The flying wires: two from each corner of the frame up to the mouth, on
  // the seams either side of the corner's own bearing.
  for (const [dx, dz] of corners) {
    const bearing = Math.atan2(dx, dz);
    for (const off of [-1, 1]) {
      const a = bearing + (off * Math.PI) / GORES;
      group.add(
        strut(
          new V(dx * post, FRAME, dz * post),
          new V(Math.sin(a) * mouth * 0.97, base - 0.01 * H, Math.cos(a) * mouth * 0.97),
          0.016 * H,
          PALETTE.bark,
        ),
      );
    }
  }

  return assemble('balloon', [soupOf(group)]);
}

export function balloonModel(): CraftModel {
  return finish({
    id: 'balloon',
    kind: 'balloon',
    medium: 'air',
    seats: SEATS,
    draft: 0,
    variants: SCHEMES.length,
    // From the top of the coil to the envelope's mouth, on the basket's axis.
    burner: [FRAME + 0.07 * H, MOUTH_Y],
    build: buildBalloon,
  });
}
