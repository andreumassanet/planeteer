/**
 * The launch: an open runabout for four, the helm and three passengers, all of
 * them seen.
 *
 * **Code-built, and built round the four people in it.** Kenney's speedboats
 * were the other candidate and they are good boats, but their cockpits are
 * modelled at the pack's toy scale — a bench a hand deep, a screen at the knee
 * — and a seat is not something a model fitted from outside can be made to
 * have. So the hull is lofted here from the seats outwards:
 *
 * - **The seat surface is the sole plus the hero's sole-to-hip**, so a seated
 *   body's shoes are on the cockpit floor, not through it or over it.
 * - **Two abreast** (`ABREAST`), and the inside of the hull clears the outer
 *   elbow by more than a fifth of a body, so nobody's arm is through a gunwale.
 * - **Two rows a pack, a seat back and a knee apart** (`ROW_PITCH`), so the
 *   rear passengers' knees clear the front seats' backs.
 * - **The foredeck's bulkhead is ahead of the front toes**, and the sheer is a
 *   twelfth of a body over the hip: waist-deep, so from the chase camera and
 *   from above four heads and four pairs of shoulders read over the gunwales.
 *
 * **Why the old one was ugly, in one line: it was boxes.** Its hull was a
 * rectangular section lofted along a plan, which from any angle is a tray. This
 * one's section turns at a chine and flares to the sheer, its keel rises into
 * the stem and its sheer sweeps up to a bow higher than the transom, which is
 * the whole silhouette of a small powerboat; the well is cut into the same loft
 * (`well` in `build.ts`) so the gunwales, the bulkheads and the transom are one
 * piece with one ink line round it. The details are the ones that read at the
 * chase distance: a rubbing strake in a second colour under the sheer, a
 * wraparound screen, a wheel, an outboard. Chunky rather than sleek — a beam of
 * 0.9 bodies on a hull a little over two long, L/B 2.3 where a real runabout
 * is nearer 2.6 — because this world draws its made things a little toy.
 *
 * **Waterline at y = 0**, the keel `draft` under it.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import type { CraftModel, Seat } from './contract.ts';
import { ABREAST, HERO } from './body.ts';
import { GLASS_TINT, PROUD, assemble, craftContext, finish, loft, octagon, soupOf, well } from './build.ts';
import { painted, wheelPart } from './cabin.ts';
import type { WheelGrip } from '../cast.ts';
import type { Station, WellSection } from './build.ts';

const H = AVATAR_HEIGHT;
const V = THREE.Vector3;

/** Cockpit sole over the waterline. */
const SOLE = 0.06 * H;
/** The seat surface: the sole, and the hero's own depth of shin under the hip. */
const HIP = SOLE + HERO.sole;
/** Sheer amidships: waist-deep on a seated body. */
const SHEER = HIP + 0.08 * H;
/** Skin and gunwale thickness. */
const WALL = 0.04 * H;
/** Outer half-beam: two bodies abreast, an elbow's clearance, and the wall. */
const HALF = ABREAST / 2 + HERO.half + 0.09 * H + WALL;

/** The front row's hip, the rear row's, and the ends of the well. */
const ROW_PITCH = HERO.back + 0.04 * H + HERO.knee + 0.04 * H;
const FRONT = 0.1 * H;
const REAR = FRONT - ROW_PITCH;
const WELL_AFT = REAR - HERO.back - 0.1 * H;
const WELL_FORE = FRONT + HERO.toe + 0.04 * H;
/** Transom and stem. */
const TRANSOM = WELL_AFT - 0.06 * H;
const STEM = WELL_FORE + 0.78 * H;
const KEEL = -0.14 * H;

/**
 * The hull, aft to fore, as fractions of the half-beam and heights over the
 * waterline. The chine is where the bottom turns up, and the topsides flare out
 * from it to the sheer. The keel rises into the stem over the last three
 * stations and the sheer sweeps up a quarter of a body to meet it, so the bow
 * is raked and stands higher than the transom: that sweep is the silhouette of
 * a small powerboat, and a flat sheer is a tray.
 */
const HULL: readonly (Omit<WellSection, 'floor' | 'wall'> & { z: number })[] = [
  { z: TRANSOM, keel: KEEL * 0.7, chineHalf: HALF * 0.78, chineY: -0.01 * H, sheerHalf: HALF * 0.92, sheerY: SHEER - 0.03 * H, decked: true },
  { z: WELL_AFT, keel: KEEL * 0.78, chineHalf: HALF * 0.8, chineY: -0.015 * H, sheerHalf: HALF * 0.96, sheerY: SHEER - 0.025 * H },
  { z: (WELL_AFT + FRONT) / 2, keel: KEEL, chineHalf: HALF * 0.82, chineY: -0.02 * H, sheerHalf: HALF, sheerY: SHEER - 0.01 * H },
  { z: FRONT + 0.1 * H, keel: KEEL, chineHalf: HALF * 0.8, chineY: -0.015 * H, sheerHalf: HALF, sheerY: SHEER + 0.01 * H },
  { z: WELL_FORE - 0.02 * H, keel: KEEL * 0.92, chineHalf: HALF * 0.72, chineY: 0, sheerHalf: HALF * 0.96, sheerY: SHEER + 0.04 * H },
  { z: WELL_FORE, keel: KEEL * 0.9, chineHalf: HALF * 0.71, chineY: 0, sheerHalf: HALF * 0.95, sheerY: SHEER + 0.045 * H, decked: true },
  { z: WELL_FORE + 0.3 * H, keel: KEEL * 0.55, chineHalf: HALF * 0.5, chineY: 0.06 * H, sheerHalf: HALF * 0.8, sheerY: SHEER + 0.12 * H, decked: true },
  { z: WELL_FORE + 0.52 * H, keel: 0.02 * H, chineHalf: HALF * 0.26, chineY: 0.15 * H, sheerHalf: HALF * 0.52, sheerY: SHEER + 0.19 * H, decked: true },
  { z: WELL_FORE + 0.68 * H, keel: 0.15 * H, chineHalf: HALF * 0.09, chineY: 0.25 * H, sheerHalf: HALF * 0.24, sheerY: SHEER + 0.23 * H, decked: true },
  { z: STEM, keel: 0.29 * H, chineHalf: HALF * 0.02, chineY: 0.33 * H, sheerHalf: HALF * 0.04, sheerY: SHEER + 0.25 * H, decked: true },
];

const sheerAt = (z: number): { half: number; y: number } => {
  for (let i = 0; i + 1 < HULL.length; i++) {
    const a = HULL[i]!;
    const b = HULL[i + 1]!;
    if (z <= b.z) {
      const t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
      return { half: a.sheerHalf + (b.sheerHalf - a.sheerHalf) * t, y: a.sheerY + (b.sheerY - a.sheerY) * t };
    }
  }
  const last = HULL[HULL.length - 1]!;
  return { half: last.sheerHalf, y: last.sheerY };
};

/** Hull colour, then the stripe under the sheer. Seven looks. */
const PAINTS: readonly [number, number][] = [
  [PALETTE.white, PALETTE.skyBlue],
  [PALETTE.red, PALETTE.white],
  [PALETTE.skyBlue, PALETTE.white],
  [PALETTE.gold, PALETTE.white],
  [PALETTE.white, PALETTE.crimson],
  [PALETTE.green, PALETTE.cream],
  [PALETTE.orange, PALETTE.white],
];

/**
 * The helmsman's wheel, about his hip: over the knees and near the chest, as
 * the hero's arms reach (`HERO.reach`), its axle tipped forward a quarter of
 * the way from level.
 */
const HELM: WheelGrip = { centre: [0, 0.26 * H, 0.2 * H], tilt: 0.42, radius: 0.07 * H, spread: 1.0 };

const SEATS: readonly Seat[] = [
  // The helm is to starboard, which facing +Z is -X.
  { x: -ABREAST / 2, y: HIP, z: FRONT, yaw: 0, pose: 'sit', shown: true, wheel: HELM },
  { x: ABREAST / 2, y: HIP, z: FRONT, yaw: 0, pose: 'sit', shown: true },
  { x: -ABREAST / 2, y: HIP, z: REAR, yaw: 0, pose: 'sit', shown: true },
  { x: ABREAST / 2, y: HIP, z: REAR, yaw: 0, pose: 'sit', shown: true },
];

function buildLaunch(variant: number): THREE.Group {
  const ctx = craftContext();
  const { box, strut, column, tone } = ctx;
  const [hullColour, stripe] = PAINTS[((variant % PAINTS.length) + PAINTS.length) % PAINTS.length]!;
  const deck = PALETTE.cream;
  const cushion = PALETTE.tan;
  const group = new THREE.Group();

  // ---- the hull -----------------------------------------------------------
  const stations: Station[] = HULL.map((s) => ({ z: s.z, ring: well({ ...s, floor: SOLE, wall: WALL }) }));
  group.add(loft(stations, hullColour));

  // The sole, in teak, standing proud of the well's floor.
  const inner = Math.min(...HULL.slice(1, 5).map((s) => s.chineHalf)) - WALL * 1.2;
  const sole = box(inner * 2, PROUD, WELL_FORE - WELL_AFT - 0.02 * H, PALETTE.brown);
  sole.position.set(0, SOLE, (WELL_AFT + WELL_FORE) / 2);
  group.add(sole);

  // A rubbing strake a side, a stripe proud of the skin just under the sheer.
  // It follows the sheer's own plan so it cannot come off the hull, and it
  // runs out short of the stem where the two sides would meet in one point.
  for (const side of [-1, 1]) {
    const run: Station[] = [];
    for (const s of HULL.slice(0, -1)) {
      const at = sheerAt(s.z);
      const x = side * (at.half + PROUD * 0.5);
      run.push({ z: s.z, ring: [[x - PROUD, at.y - 0.085 * H], [x + PROUD, at.y - 0.085 * H], [x + PROUD, at.y - 0.03 * H], [x - PROUD, at.y - 0.03 * H]] });
    }
    group.add(loft(run, stripe));
  }

  // The foredeck plate, proud of the deck, stopping short of the stem.
  const plate: Station[] = HULL.slice(5, -1).map((s) => {
    const at = sheerAt(s.z);
    const half = at.half - WALL * 1.6;
    return { z: s.z, ring: [[-half, at.y], [half, at.y], [half, at.y + PROUD], [-half, at.y + PROUD]] };
  });
  group.add(loft(plate, deck));

  // ---- the screen ---------------------------------------------------------
  // A wraparound in three panes, raked back off the foredeck just ahead of the
  // bulkhead. Its top edge is a third of a body over the sheer: over the
  // seated knees, under the seated eyes, so the helmsman looks over it and the
  // chase camera sees four heads above it.
  // Glass since 2026-10-04 (`glassMaterial`): the helmsman sees the bow
  // through it, and from outside the dashboard behind it shows.
  const panes = new THREE.Group();
  const screenFoot = sheerAt(WELL_FORE + 0.05 * H);
  const screenTall = 0.24 * H;
  const middle = box(screenFoot.half * 1.1, screenTall, PROUD, PALETTE.slate);
  middle.position.set(0, screenFoot.y, WELL_FORE + 0.06 * H);
  middle.rotation.x = -0.45;
  panes.add(middle);
  for (const side of [-1, 1]) {
    const wing = box(screenFoot.half * 0.55, screenTall * 0.92, PROUD, PALETTE.slate);
    wing.position.set(side * screenFoot.half * 0.78, screenFoot.y, WELL_FORE + 0.03 * H);
    wing.rotation.set(-0.35, side * 0.7, 0, 'YXZ');
    panes.add(wing);
  }
  const rail = strut(
    new V(-screenFoot.half * 0.55, screenFoot.y + screenTall * Math.cos(0.45), WELL_FORE + 0.06 * H - screenTall * Math.sin(0.45)),
    new V(screenFoot.half * 0.55, screenFoot.y + screenTall * Math.cos(0.45), WELL_FORE + 0.06 * H - screenTall * Math.sin(0.45)),
    0.03 * H,
    PALETTE.steel,
  );
  group.add(rail);

  // ---- the helm -----------------------------------------------------------
  // A wheel on a raked column off the bulkhead's edge, in front of the helm
  // seat and over the helmsman's knees. The column is all the console there
  // is: a box from the sole up would stand where his shins are. The wheel is
  // the helmsman's to hold (`HELM`): it turns with the rudder and his hands
  // go round it, so it is near enough his chest for the hero's short arms.
  const helm = SEATS[0]!;
  const hub = new V(helm.x + HELM.centre[0], helm.y + HELM.centre[1], helm.z + HELM.centre[2]);
  group.add(strut(new V(hub.x, SHEER + 0.02 * H, WELL_FORE + 0.02 * H), hub.clone(), 0.045 * H, PALETTE.steel));
  // A small binnacle on the foredeck behind the screen, a compass card in
  // it, for the eye over the wheel.
  const deckAt = sheerAt(WELL_FORE + 0.03 * H).y + PROUD;
  const binnacle = column(0.04 * H, 0.03 * H, PALETTE.ink, 10);
  binnacle.position.set(helm.x, deckAt, WELL_FORE + 0.03 * H);
  group.add(binnacle);
  const card = column(0.032 * H, PROUD, PALETTE.cream, 10);
  card.position.set(helm.x, deckAt + 0.03 * H, WELL_FORE + 0.03 * H);
  group.add(card);
  // A grab rail on the passenger's side of the bulkhead.
  group.add(strut(new V(ABREAST * 0.15, SHEER - 0.02 * H, WELL_FORE - 0.05 * H), new V(ABREAST * 0.85, SHEER - 0.02 * H, WELL_FORE - 0.05 * H), 0.03 * H, PALETTE.steel));

  // ---- the seats ----------------------------------------------------------
  // Two buckets forward on a pedestal each, a bench aft across the beam. Each
  // pan's top is exactly the seat's hip; each back stands behind the pack.
  const pan = (x: number, z: number, width: number) => {
    const depth = 0.2 * H;
    const base = box(width * 0.7, HIP - SOLE - 0.05 * H, depth * 0.7, tone(deck, 0.85));
    base.position.set(x, SOLE, z - 0.02 * H);
    const top = box(width, 0.05 * H, depth, cushion);
    top.position.set(x, HIP - 0.05 * H, z - 0.02 * H);
    const back = box(width, 0.2 * H, 0.05 * H, cushion);
    back.position.set(x, HIP - 0.02 * H, z - HERO.back - 0.025 * H);
    back.rotation.x = -0.12;
    group.add(base, top, back);
  };
  for (const seat of SEATS.slice(0, 2)) pan(seat.x, seat.z, HERO.half * 2.3);
  pan(0, REAR, Math.min(inner * 2 - 0.04 * H, ABREAST + HERO.half * 2.4));

  // ---- the outboard -------------------------------------------------------
  // Hung off the transom: a cowl above the water and a leg into it.
  const transomTop = sheerAt(TRANSOM).y;
  const cowl = octagonBox(0.15 * H, 0.26 * H, 0.2 * H, PALETTE.steel);
  cowl.position.set(0, transomTop - 0.12 * H, TRANSOM - 0.13 * H);
  group.add(cowl);
  const cap = box(0.24 * H, 0.04 * H, 0.16 * H, PALETTE.ink);
  cap.position.set(0, transomTop + 0.14 * H, TRANSOM - 0.13 * H);
  group.add(cap);
  const leg = box(0.07 * H, transomTop - 0.1 * H - KEEL * 0.9, 0.1 * H, PALETTE.ink);
  leg.position.set(0, KEEL * 0.9, TRANSOM - 0.12 * H);
  group.add(leg);
  const bracket = box(0.14 * H, 0.08 * H, 0.1 * H, PALETTE.steel);
  bracket.position.set(0, transomTop - 0.1 * H, TRANSOM - 0.04 * H);
  group.add(bracket);

  // A cleat forward and a pair of navigation lights on the foredeck.
  const bow = sheerAt(STEM - 0.2 * H);
  const cleat = column(0.025 * H, 0.04 * H, PALETTE.steel, 6);
  cleat.position.set(0, bow.y + PROUD, STEM - 0.25 * H);
  group.add(cleat);
  for (const [side, colour] of [[-1, PALETTE.green], [1, PALETTE.red]] as const) {
    const lamp = box(0.04 * H, 0.03 * H, 0.06 * H, colour);
    const at = sheerAt(WELL_FORE + 0.45 * H);
    lamp.position.set(side * at.half * 0.55, at.y + PROUD, WELL_FORE + 0.45 * H);
    group.add(lamp);
  }

  return assemble('launch', [soupOf(group)], [wheelPart(HELM, hub, PALETTE.ink)], { glass: [painted(soupOf(panes), GLASS_TINT)] });
}

/** A rounded box standing on y = 0: the outboard's cowl. */
function octagonBox(half: number, tall: number, deep: number, colour: number): THREE.Mesh {
  const ring = octagon(half, 0, tall, 0.5);
  return loft([{ z: -deep / 2, ring }, { z: deep / 2, ring }], colour);
}

export function launchModel(): CraftModel {
  return finish({
    id: 'launch',
    kind: 'boat',
    medium: 'water',
    seats: SEATS,
    draft: -KEEL,
    variants: PAINTS.length,
    build: buildLaunch,
  });
}
