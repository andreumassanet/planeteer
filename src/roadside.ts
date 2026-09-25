import * as THREE from 'three';
import { PALETTE } from './theme.ts';
import { SCENERY_SCALE } from './stature.ts';
import { rngFrom } from './scenery/random.ts';

/**
 * What stands beside a road between the towns: telegraph poles with their
 * wires, white posts along the verge, a town's name before its gate, a speed
 * sign after it, a board of chevrons at a hard bend, rails along a high bank,
 * and street lamps down the last stretch into a town — none of it on another
 * road's top where two meet, fork or share an approach (`RoadsideSite.clear`).
 *
 * **A road was a strip of tarmac on a bank and nothing else**, and from the
 * ground it read as a model's road rather than a road: no post, no pole, no
 * sign, nothing to say how big it was. What a road has beside it is what gives
 * it its scale, so these are sized in metres at `SCENERY_SCALE`, as a house is.
 *
 * **Merged, near and still**, the three things a streamer's part has to be to
 * be affordable: `roads.ts` lays them per road, once, in the near band only —
 * the one within `SPANS`' first 2,600 units of the eye — and merges them per
 * tile into one mesh beside the ribbon's, with its own ink, because a pole is a
 * thing standing on the ground and the ribbon is a mark on it. Every placement
 * is a pure function of the road, so a road reads the same on every load.
 *
 * **Everything stands inside `roadClearance`**, the verge the wood keeps: a
 * pole at 5.1 from the centre line and its arm's far tip at 6.24, against a
 * clearance of 6.48; a post on the shoulder; a sign and a lamp on the top's
 * edge (`pnpm check` holds every vertex to it). So a tree never grows through
 * a pole, and nothing here asks `vegetation.ts` for anything.
 *
 * This file is geometry and placement and knows nothing of courses or ramps:
 * `roads.ts` hands it a `RoadsideSite`, which answers where the road's surface
 * is, and it hands back triangles. Node-safe, like the ribbon.
 */

const M = SCENERY_SCALE;

/** How far apart the poles stand, in world units: 47 m, a country line's span. */
export const POLE_SPACING = 60;
/** How far out from the centre line a pole stands: on the bank, its arm's far tip inside `roadClearance`'s 6.48. */
export const POLE_LATERAL = 5.1;
const POLE_HEIGHT = 7.5 * M;
const POLE_WIDTH = 0.26 * M;
const ARM_LENGTH = 1.8 * M;
const ARM_DEPTH = 0.16 * M;
/** How far the wires sag at the middle of a span. */
const WIRE_SAG = 0.9;
const WIRE_WIDTH = 0.08;
/** The pieces a span of wire is drawn in, each following the road's own curve at the pole's offset. */
const WIRE_PIECES = 4;
/**
 * The hardest a road may bend at a pole, as the turn in radians over
 * `POLE_SPACING`, before the line breaks there: a mean radius of 110 units. A
 * span drawn in `WIRE_PIECES` along a curve that tight cuts inside it by a
 * quarter of a unit, which keeps the outer wire inside the verge.
 */
const POLE_BEND = POLE_SPACING / 110;

/** How far apart the white posts along the verge stand, in world units, each on the other side from the last. */
export const POST_SPACING = 80;
const POST_HEIGHT = 1.0 * M;
const POST_WIDTH = 0.12 * M;

/** How far apart the lamps down a town's approach stand, in world units, and the first one out from its kerb. */
export const LAMP_SPACING = 13;
export const LAMP_FROM = 7;
/** A lamp's post, the arm over the carriageway and the head: the town's own street lamps are 4.8 to 5.8 tall. */
const LAMP_HEIGHT = 5.4;
/**
 * How far over the highest surface under its arm a lamp's column top stands,
 * at least: the brace's foot is 0.85 under it, which leaves 4.6 over the
 * tarmac. A lamp on the downhill kerb of a road laid across a hill, or beside
 * a ramp, stands taller by what the surface under its arm rises over its
 * foot; on the flat that is `LAMP_HEIGHT`, less the foot's sink.
 */
const LAMP_CLEAR = 5.45;
const LAMP_ARM = 1.7;
/** How far under its cap a lamp's light hangs, for the per-pixel pools, as the town's lamps' `LAMP_HEAD` is. */
export const LAMP_HEAD_DROP = 0.35;

/** How much higher a bank's top stands than the ground at its foot before it gets a rail. */
export const RAIL_DROP = 5;
const RAIL_HEIGHT = 0.75 * M;
const RAIL_POST_SPACING = 5;

/**
 * Where a road bends hard enough to be signed: the turn over `CHEVRON_SPAN`
 * units, in radians — a mean radius of 70 units — and how far apart two such
 * signs stand at least. A board of chevrons stands on the outside of the bend,
 * pointing into it, painted on both faces for the traffic either way.
 */
const CHEVRON_SPAN = 40;
const CHEVRON_TURN = CHEVRON_SPAN / 70;
const CHEVRON_APART = 140;

/** The limits a speed sign leaving a town may show, in km/h. */
const LIMITS = [50, 60, 70, 80, 90] as const;

/** How far out along the road from a town's kerb its name stands, past its pavement. */
export const NAME_AT = 44;
/** And the speed sign, for the traffic leaving it. */
export const SPEED_AT = 62;
/** The furthest a sign's board reaches from the centre line: inside `roadClearance`'s 6.48. */
const SIGN_REACH = 6.3;

/** What `layRoadside` needs to know about one road. */
export interface RoadsideSite {
  /** The road's length along its path, gate A to gate B. */
  length: number;
  /** Half the carriageway. */
  half: number;
  /** The top's half-width at a point: the carriageway and its shoulder or pavement. */
  top(s: number): number;
  /**
   * The point on the road's drawn surface `lateral` units off the centre line
   * at `s` (positive is the left of the way from A to B), written into
   * `point`, with the section's frame at that point: `ahead` along the road
   * from A to B and `side` to its left, both unit tangents.
   */
  surface(s: number, lateral: number, point: THREE.Vector3, ahead: THREE.Vector3, side: THREE.Vector3): void;
  /** The ground's elevation under a point, as a radius, for how high the bank's top stands. */
  groundRadius(point: THREE.Vector3): number;
  /**
   * Whether a thing standing at `point` (world units, at any radius) with
   * `footprint` of it either side is clear of every other road's top — its
   * carriageway and its shoulder or pavement — less `OTHER_EDGE`: where two
   * roads meet, fork or share an approach, a post or a sign of one must not
   * stand in the other's way. Absent is a road alone.
   */
  clear?(point: THREE.Vector3, footprint: number): boolean;
  /**
   * The highest any other road's top stands under `point`, as a radius, or 0
   * where none is: what a lamp's arm reaching over a shared approach has to
   * clear as well as its own road. Absent is a road alone.
   */
  roofline?(point: THREE.Vector3): number;
  /** The names of the towns at each end, for the lettering on their name boards. Absent is a board of a middling name. */
  nameA?: string;
  nameB?: string;
  /** Whether each end is a built town, whether it is big enough for lamps, and whether its approach is this road's alone. */
  townA: boolean;
  townB: boolean;
  lampsA: boolean;
  lampsB: boolean;
  /** Which side of the road traffic keeps to: 1 on the left of its motion, -1 on the right. */
  keep: number;
  /** Where the country starts at each end: past a built town's pavement, or at the kerb of one nobody built. */
  countryA: number;
  countryB: number;
  /** A seed of the road's own. */
  seed: string;
}

/** A road's roadside as buffers, in world units at double precision, and its lamp heads. */
export interface Roadside {
  position: number[];
  normal: number[];
  color: number[];
  /** Two bytes a vertex, `atlasLit`'s: a lamp's head is a window that burns till dawn. */
  lit: number[];
  heads: number[];
}

const colours = {
  pole: new THREE.Color(PALETTE.bark).lerp(new THREE.Color(PALETTE.brown), 0.35),
  wire: new THREE.Color(PALETTE.ink).lerp(new THREE.Color(PALETTE.steel), 0.4),
  post: new THREE.Color(PALETTE.white),
  cap: new THREE.Color(PALETTE.ink).lerp(new THREE.Color(PALETTE.steel), 0.3),
  lamp: new THREE.Color(PALETTE.steel),
  head: new THREE.Color(PALETTE.cream),
  rail: new THREE.Color(PALETTE.bone),
  board: new THREE.Color(PALETTE.cream),
  ring: new THREE.Color(PALETTE.red),
  /** The back of a sign: galvanised, as every sign's back is. */
  back: new THREE.Color(PALETTE.bone).lerp(new THREE.Color(PALETTE.steel), 0.45),
  /** Lettering and figures: the ink, lifted a little so the pen still draws round a board. */
  letter: new THREE.Color(PALETTE.ink).lerp(new THREE.Color(PALETTE.slate), 0.35),
  /** A name board's border: a deep slate, the colour of a road authority's paint. */
  border: new THREE.Color(PALETTE.slate).multiplyScalar(0.62),
  /** A lamp's head housing. */
  housing: new THREE.Color(PALETTE.steel).multiplyScalar(0.8),
};

/**
 * How far in from the edge of another road's top a thing of this one's may
 * still stand, in world units: a lamp on a pavement two roads share stands on
 * both of their tops' edges, and it belongs there.
 */
export const OTHER_EDGE = 0.6;

const DARK = 0;
const HEAD = 255;
/** The hour byte that never comes: a lamp burns till dawn. */
const ALWAYS = 255;

const cornerA = new THREE.Vector3();
const cornerB = new THREE.Vector3();
const cornerC = new THREE.Vector3();
const cornerD = new THREE.Vector3();
const faceN = new THREE.Vector3();

function vertex(out: Roadside, p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, lit: number): void {
  out.position.push(p.x, p.y, p.z);
  out.normal.push(n.x, n.y, n.z);
  out.color.push(c.r, c.g, c.b);
  out.lit.push(lit, ALWAYS);
}

/** One quad, `a b c d` counter-clockwise seen from where `n` points. */
function quad(
  out: Roadside, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3,
  n: THREE.Vector3, colour: THREE.Color, lit: number,
): void {
  vertex(out, a, n, colour, lit); vertex(out, b, n, colour, lit); vertex(out, c, n, colour, lit);
  vertex(out, a, n, colour, lit); vertex(out, c, n, colour, lit); vertex(out, d, n, colour, lit);
}

const triAB = new THREE.Vector3();
const triAC = new THREE.Vector3();

/** One triangle facing `n`, wound so it faces it whichever order its corners come in. */
function triangle(
  out: Roadside, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, colour: THREE.Color, lit: number,
): void {
  triAB.subVectors(b, a);
  triAC.subVectors(c, a);
  if (triAB.cross(triAC).dot(n) >= 0) {
    vertex(out, a, n, colour, lit); vertex(out, b, n, colour, lit); vertex(out, c, n, colour, lit);
  } else {
    vertex(out, a, n, colour, lit); vertex(out, c, n, colour, lit); vertex(out, b, n, colour, lit);
  }
}

const flatCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/**
 * A flat face in a sign's plane, as the corners `(u, v)` in the board's own
 * units — `u` along `across`, `v` along `upward`, from `origin` — facing `n`:
 * a panel of lettering, a chevron, a figure's stroke. Two triangles, no depth:
 * it lies `lift` proud of the face it is painted on, which is past `PROUD`'s
 * worth of the pen for anything the size of a sign.
 */
function flat(
  out: Roadside, origin: THREE.Vector3, across: THREE.Vector3, upward: THREE.Vector3, n: THREE.Vector3,
  corners: readonly (readonly [number, number])[], colour: THREE.Color, lit = DARK,
): void {
  for (let k = 0; k < 4; k++) {
    const [u, v] = corners[k]!;
    flatCorners[k]!.copy(origin).addScaledVector(across, u).addScaledVector(upward, v);
  }
  triangle(out, flatCorners[0]!, flatCorners[1]!, flatCorners[2]!, n, colour, lit);
  triangle(out, flatCorners[0]!, flatCorners[2]!, flatCorners[3]!, n, colour, lit);
}

/** A rectangle `flat`, centred on `(u, v)` with half-sizes `hu` and `hv`. */
function panel(
  out: Roadside, origin: THREE.Vector3, across: THREE.Vector3, upward: THREE.Vector3, n: THREE.Vector3,
  u: number, v: number, hu: number, hv: number, colour: THREE.Color,
): void {
  flat(out, origin, across, upward, n, [[u - hu, v - hv], [u + hu, v - hv], [u + hu, v + hv], [u - hu, v + hv]], colour);
}

const discA = new THREE.Vector3();
const discB = new THREE.Vector3();
const discFarA = new THREE.Vector3();
const discFarB = new THREE.Vector3();
const discFront = new THREE.Vector3();
const discBack = new THREE.Vector3();
const discNormal = new THREE.Vector3();
const DISC_SIDES = 12;

/**
 * A round plate: `radius` across the plane of `across` and `upward`, `depth`
 * behind its face along `n`, which the face looks along — the face in
 * `colour` and, unless `back` is null, a back in `back`. A sign's plate is a
 * few centimetres thick and the pen draws its edge, so it has no rim. Twelve
 * sides, which the pen draws as a circle at the size a sign is seen.
 */
function disc(
  out: Roadside, centre: THREE.Vector3, across: THREE.Vector3, upward: THREE.Vector3, n: THREE.Vector3,
  radius: number, depth: number, colour: THREE.Color, back: THREE.Color | null,
): void {
  discFront.copy(centre).addScaledVector(n, depth * 0.5);
  discBack.copy(centre).addScaledVector(n, -depth * 0.5);
  discNormal.copy(n).negate();
  for (let k = 0; k < DISC_SIDES; k++) {
    const a0 = (k / DISC_SIDES) * Math.PI * 2;
    const a1 = ((k + 1) / DISC_SIDES) * Math.PI * 2;
    discA.copy(discFront).addScaledVector(across, Math.cos(a0) * radius).addScaledVector(upward, Math.sin(a0) * radius);
    discB.copy(discFront).addScaledVector(across, Math.cos(a1) * radius).addScaledVector(upward, Math.sin(a1) * radius);
    triangle(out, discFront, discA, discB, n, colour, DARK);
    if (back === null) continue;
    discFarA.copy(discA).addScaledVector(n, -depth);
    discFarB.copy(discB).addScaledVector(n, -depth);
    triangle(out, discBack, discFarA, discFarB, discNormal, back, DARK);
  }
}

/**
 * The seven strokes of a figure, as `[u, v, hu, hv]` in a cell a unit wide and
 * two tall, centred: top, upper right, lower right, bottom, lower left, upper
 * left, middle. A speed limit is read at a glance, and a figure of strokes
 * reads as one at the size it is seen.
 */
const STROKES: readonly (readonly [number, number, number, number])[] = [
  [0, 0.9, 0.5, 0.1], [0.4, 0.45, 0.1, 0.45], [0.4, -0.45, 0.1, 0.45],
  [0, -0.9, 0.5, 0.1], [-0.4, -0.45, 0.1, 0.45], [-0.4, 0.45, 0.1, 0.45], [0, 0, 0.5, 0.1],
];
/** Which strokes each figure lights, as a bit per stroke in `STROKES`' order. */
const FIGURES = [0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110, 0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111];

/** A number in strokes, `height` tall, centred on `(u, v)` of a face. */
function figures(
  out: Roadside, origin: THREE.Vector3, across: THREE.Vector3, upward: THREE.Vector3, n: THREE.Vector3,
  value: number, u: number, v: number, height: number, colour: THREE.Color,
): void {
  const digits = String(value);
  const scale = height / 2;
  const pitch = scale * 1.35;
  const first = u - ((digits.length - 1) * pitch) / 2;
  for (let d = 0; d < digits.length; d++) {
    const mask = FIGURES[Number(digits[d])] ?? 0;
    for (let k = 0; k < STROKES.length; k++) {
      if ((mask & (1 << k)) === 0) continue;
      const [su, sv, hu, hv] = STROKES[k]!;
      panel(out, origin, across, upward, n, first + d * pitch + su * scale, v + sv * scale, hu * scale, hv * scale, colour);
    }
  }
}

const boxAxes: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const boxCentre = new THREE.Vector3();
const boxHalf = new THREE.Vector3();
const faceU = new THREE.Vector3();
const faceV = new THREE.Vector3();
const faceC = new THREE.Vector3();

/**
 * A box on the frame `(right, up, forward)`, which must be right-handed —
 * `right = up x forward`, the basis every placed thing in this project uses —
 * centred on `centre` with half-sizes `hx, hy, hz` along the three. Five
 * faces: the one underneath stands on something and is never seen.
 */
function box(
  out: Roadside, centre: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, forward: THREE.Vector3,
  hx: number, hy: number, hz: number, colour: THREE.Color, lit = DARK, bottom = false,
): void {
  boxAxes[0]!.copy(right);
  boxAxes[1]!.copy(up);
  boxAxes[2]!.copy(forward);
  boxCentre.copy(centre);
  boxHalf.set(hx, hy, hz);
  // Each face as (normal axis, sign, u axis, v axis) with u x v = the outward normal.
  const faces: [number, number, number, number][] = [[0, 1, 1, 2], [0, -1, 2, 1], [1, 1, 2, 0], [2, 1, 0, 1], [2, -1, 1, 0]];
  if (bottom) faces.push([1, -1, 0, 2]);
  for (const [axis, sign, u, v] of faces) {
    const h = boxHalf.getComponent(axis);
    faceC.copy(boxCentre).addScaledVector(boxAxes[axis]!, sign * h);
    faceU.copy(boxAxes[u]!).multiplyScalar(boxHalf.getComponent(u));
    faceV.copy(boxAxes[v]!).multiplyScalar(boxHalf.getComponent(v));
    faceN.copy(boxAxes[axis]!).multiplyScalar(sign);
    cornerA.copy(faceC).sub(faceU).sub(faceV);
    cornerB.copy(faceC).add(faceU).sub(faceV);
    cornerC.copy(faceC).add(faceU).add(faceV);
    cornerD.copy(faceC).sub(faceU).add(faceV);
    quad(out, cornerA, cornerB, cornerC, cornerD, faceN, colour, lit);
  }
}

const tubeAlong = new THREE.Vector3();
const tubeUp = new THREE.Vector3();
const tubeSide = new THREE.Vector3();
const tubeMid = new THREE.Vector3();

/** A square bar from `a` to `b`, `width` across, its sides squared to `up`: a wire's span, or a rail. */
function bar(out: Roadside, a: THREE.Vector3, b: THREE.Vector3, up: THREE.Vector3, width: number, colour: THREE.Color): void {
  tubeAlong.subVectors(b, a);
  const length = tubeAlong.length();
  if (length < 1e-6) return;
  tubeAlong.multiplyScalar(1 / length);
  tubeSide.crossVectors(up, tubeAlong).normalize();
  tubeUp.crossVectors(tubeAlong, tubeSide).normalize();
  tubeMid.addVectors(a, b).multiplyScalar(0.5);
  // `tubeSide = up x along` and `tubeUp = along x side`, so (side, up, along) is right-handed.
  box(out, tubeMid, tubeSide, tubeUp, tubeAlong, width * 0.5, width * 0.5, length * 0.5, colour, DARK, true);
}

const wireA = new THREE.Vector3();
const wireB = new THREE.Vector3();
const bendAhead = new THREE.Vector3();
const bendBehind = new THREE.Vector3();
const bendPoint = new THREE.Vector3();
const bendSide = new THREE.Vector3();

/** How far the road turns over `POLE_SPACING` centred on `s`, in radians. */
function bendAt(site: RoadsideSite, s: number): number {
  const half = POLE_SPACING * 0.5;
  site.surface(Math.max(0, s - half), 0, bendPoint, bendBehind, bendSide);
  site.surface(Math.min(site.length, s + half), 0, bendPoint, bendAhead, bendSide);
  return bendBehind.angleTo(bendAhead);
}

const turnUp = new THREE.Vector3();

/**
 * How far the road turns over `CHEVRON_SPAN` centred on `s`, in radians, and
 * which way: positive is a bend to the left of the way from A to B.
 */
function turnAt(site: RoadsideSite, s: number): number {
  const half = CHEVRON_SPAN * 0.5;
  site.surface(Math.max(0, s - half), 0, bendPoint, bendBehind, bendSide);
  site.surface(Math.min(site.length, s + half), 0, bendPoint, bendAhead, bendSide);
  turnUp.copy(bendPoint).normalize();
  const angle = bendBehind.angleTo(bendAhead);
  return bendSide.crossVectors(bendBehind, bendAhead).dot(turnUp) >= 0 ? angle : -angle;
}

const prismAlong = new THREE.Vector3();
const prismU = new THREE.Vector3();
const prismV = new THREE.Vector3();
const prismN = new THREE.Vector3();
const prismCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const prismFar = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/**
 * A wire from `a` to `b`: a three-sided prism `width` across, which the ink
 * draws as a line. Half the triangles of a square bar, and a wire is mostly
 * the pen's anyway.
 */
function wire(out: Roadside, a: THREE.Vector3, b: THREE.Vector3, width: number, colour: THREE.Color): void {
  prismAlong.subVectors(b, a);
  if (prismAlong.lengthSq() < 1e-12) return;
  prismAlong.normalize();
  prismU.copy(a).normalize().cross(prismAlong);
  if (prismU.lengthSq() < 1e-12) return;
  prismU.normalize();
  prismV.crossVectors(prismAlong, prismU).normalize();
  const r = width * 0.577;
  for (let k = 0; k < 3; k++) {
    const angle = (k * Math.PI * 2) / 3;
    prismCorners[k]!.copy(a).addScaledVector(prismU, Math.cos(angle) * r).addScaledVector(prismV, Math.sin(angle) * r);
    prismFar[k]!.copy(prismCorners[k]!).add(b).sub(a);
  }
  for (let k = 0; k < 3; k++) {
    const j = (k + 1) % 3;
    const angle = ((k + 0.5) * Math.PI * 2) / 3;
    prismN.copy(prismU).multiplyScalar(Math.cos(angle)).addScaledVector(prismV, Math.sin(angle)).normalize();
    // Round the prism the way its outward normal turns: (k, far k, far j, j).
    quad(out, prismCorners[k]!, prismCorners[j]!, prismFar[j]!, prismFar[k]!, prismN, colour, DARK);
  }
}

const at = new THREE.Vector3();
const ahead = new THREE.Vector3();
const side = new THREE.Vector3();
const up = new THREE.Vector3();
const right = new THREE.Vector3();
const forward = new THREE.Vector3();
const centre = new THREE.Vector3();
const scratch = new THREE.Vector3();
const scratchB = new THREE.Vector3();

/**
 * Stands one thing at `s`, `lateral` off the centre line, facing `facing`
 * (along the road from A to B, or back): the frame is written into `up`,
 * `right` and `forward`, and the foot into `at`, sunk `sink` into whatever it
 * stands on so a bank's slope does not show under its downhill side.
 */
function stand(site: RoadsideSite, s: number, lateral: number, facing: number, sink: number): void {
  site.surface(s, lateral, at, ahead, side);
  up.copy(at).normalize();
  forward.copy(ahead).multiplyScalar(facing).projectOnPlane(up).normalize();
  right.crossVectors(up, forward).normalize();
  at.addScaledVector(up, -sink);
}

const faceOrigin = new THREE.Vector3();
const lampProbe = new THREE.Vector3();
const facing = new THREE.Vector3();
const across = new THREE.Vector3();
const armFrom = new THREE.Vector3();
const armTo = new THREE.Vector3();

/**
 * A street lamp down a town's approach, at `at` on the frame `stand` left:
 * a plinth, a column that narrows once, an arm out over the carriageway on a
 * brace, and a head — a housing with its lit glass underneath, the one part
 * that burns (`atlasLit`). `sign` is the side of the road it stands on, so the
 * arm reaches towards `-sign`; `height` is its column's, `LAMP_HEIGHT` or more.
 */
function lamp(out: Roadside, sign: number, height: number): void {
  const reach = -sign;
  centre.copy(at).addScaledVector(up, 0.25);
  box(out, centre, right, up, forward, 0.2, 0.25, 0.2, colours.cap);
  centre.copy(at).addScaledVector(up, height * 0.5);
  box(out, centre, right, up, forward, 0.1, height * 0.5, 0.1, colours.lamp);
  // The arm, level from the column's top, and a brace under it.
  armFrom.copy(at).addScaledVector(up, height - 0.08);
  armTo.copy(armFrom).addScaledVector(right, reach * LAMP_ARM);
  bar(out, armFrom, armTo, up, 0.12, colours.lamp);
  armFrom.copy(at).addScaledVector(up, height - 0.85);
  armTo.copy(at).addScaledVector(up, height - 0.12).addScaledVector(right, reach * LAMP_ARM * 0.5);
  bar(out, armFrom, armTo, up, 0.08, colours.lamp);
  // The head: a housing along the arm's line, and its glass as a pane
  // under it, the only face that burns.
  centre.copy(at).addScaledVector(up, height - 0.05).addScaledVector(right, reach * (LAMP_ARM - 0.05));
  box(out, centre, right, up, forward, 0.5, 0.12, 0.22, colours.housing, DARK, true);
  centre.addScaledVector(up, -0.15);
  facing.copy(up).negate();
  flat(out, centre, right, forward, facing, [[-0.42, -0.17], [0.42, -0.17], [0.42, 0.17], [-0.42, 0.17]], colours.head, HEAD);
  centre.addScaledVector(up, -LAMP_HEAD_DROP);
  out.heads.push(centre.x, centre.y, centre.z);
}

/**
 * A town's name board: two posts, a board in a slate border, and the name
 * as lettering — a block a letter, as many as the name has up to fourteen,
 * a capital to start each word — on the face towards the traffic, the back
 * the galvanised grey of a sign's back. Wider for a longer name.
 */
function nameBoard(out: Roadside, name: string, seed: string): void {
  const words = name.trim().length > 0 ? name.trim().split(/[\s-]+/).slice(0, 2) : ['Town'];
  const letters = Math.min(14, words.reduce((sum, word) => sum + word.length, 0) + words.length - 1);
  const letter = 0.15;
  const halfWidth = Math.max(0.8, Math.min(1.15, letters * letter * 0.5 + 0.22));
  const halfHeight = 0.5;
  const rise = 2.2;
  for (const offset of [-halfWidth * 0.72, halfWidth * 0.72]) {
    centre.copy(at).addScaledVector(up, rise * 0.5 + 0.1).addScaledVector(right, offset);
    box(out, centre, right, up, forward, 0.05, rise * 0.5 + 0.1, 0.05, colours.lamp);
  }
  centre.copy(at).addScaledVector(up, rise).addScaledVector(forward, 0.08);
  box(out, centre, right, up, forward, halfWidth, halfHeight, 0.03, colours.back, DARK, true);
  // The face, proud of the back by its border's depth.
  faceOrigin.copy(centre).addScaledVector(forward, 0.04);
  panel(out, faceOrigin, right, up, forward, 0, 0, halfWidth, halfHeight, colours.border);
  faceOrigin.addScaledVector(forward, 0.012);
  panel(out, faceOrigin, right, up, forward, 0, 0, halfWidth - 0.08, halfHeight - 0.08, colours.board);
  faceOrigin.addScaledVector(forward, 0.012);
  const rng = rngFrom('roadside-name', seed);
  let u = -((letters - 1) * letter) / 2;
  let k = 0;
  for (const word of words) {
    for (let i = 0; i < word.length && k < letters; i++, k++) {
      const capital = i === 0;
      const tall = capital ? 0.2 : rng.chance(0.25) ? 0.17 : 0.12;
      const wide = capital ? 0.058 : rng.range(0.035, 0.055);
      panel(out, faceOrigin, right, up, forward, u, -0.05 + tall * 0.5 - 0.06, wide, tall * 0.5, colours.letter);
      u += letter;
    }
    // The space between two words.
    k++;
    u += letter;
  }
}

/**
 * A speed limit, for the traffic leaving a town: a post, a round plate with
 * a red ring and a white field, and the limit on it in figures.
 */
function speedSign(out: Roadside, limit: number): void {
  const rise = 2.25;
  centre.copy(at).addScaledVector(up, rise * 0.5);
  box(out, centre, right, up, forward, 0.05, rise * 0.5, 0.05, colours.lamp);
  centre.copy(at).addScaledVector(up, rise).addScaledVector(forward, 0.08);
  disc(out, centre, right, up, forward, 0.5, 0.05, colours.ring, colours.back);
  faceOrigin.copy(centre).addScaledVector(forward, 0.037);
  disc(out, faceOrigin, right, up, forward, 0.37, 0, colours.post, null);
  faceOrigin.addScaledVector(forward, 0.012);
  figures(out, faceOrigin, right, up, forward, limit, 0, 0, 0.36, colours.letter);
}

const chevronFaces = [1, -1] as const;

/**
 * A board of two chevrons on the outside of a bend, pointing `into` it (the
 * side, as `right` counts it, the bend turns towards), painted on both faces:
 * the traffic either way sees it in front of them at the bend's sharpest.
 */
function chevrons(out: Roadside, into: number): void {
  const rise = 1.4;
  centre.copy(at).addScaledVector(up, rise * 0.5);
  box(out, centre, right, up, forward, 0.05, rise * 0.5, 0.05, colours.lamp);
  centre.copy(at).addScaledVector(up, rise);
  box(out, centre, right, up, forward, 0.55, 0.32, 0.03, colours.ring, DARK, true);
  for (const face of chevronFaces) {
    facing.copy(forward).multiplyScalar(face);
    across.copy(right);
    faceOrigin.copy(centre).addScaledVector(facing, 0.042);
    panel(out, faceOrigin, across, up, facing, 0, 0, 0.47, 0.24, colours.post);
    faceOrigin.addScaledVector(facing, 0.012);
    // Each chevron is 0.38 wide and leans towards its point: two of them
    // side by side, centred on the board.
    for (const u of [-0.2 - into * 0.06, 0.2 - into * 0.06]) {
      // A chevron is two strokes meeting at its point, which is towards `into`.
      const tip = u + into * 0.13;
      const tail = u - into * 0.13;
      flat(out, faceOrigin, across, up, facing, [[tail, 0.2], [tail + into * 0.12, 0.2], [tip + into * 0.12, 0], [tip, 0]], colours.ring);
      flat(out, faceOrigin, across, up, facing, [[tip, 0], [tip + into * 0.12, 0], [tail + into * 0.12, -0.2], [tail, -0.2]], colours.ring);
    }
  }
}

/** Whether what `stand` just stood is clear of the other roads' tops: see `RoadsideSite.clear`. */
function clearAt(site: RoadsideSite, footprint: number): boolean {
  return site.clear === undefined || site.clear(at, footprint);
}

/**
 * Everything beside one road, laid from end to end. Deterministic in the site:
 * the same road lays the same roadside on every load.
 */
export function layRoadside(site: RoadsideSite, out: Roadside = { position: [], normal: [], color: [], lit: [], heads: [] }): Roadside {
  const { length, seed } = site;
  const rng = rngFrom('roadside', seed);
  const country0 = Math.min(length, site.countryA);
  const country1 = Math.max(0, length - site.countryB);
  const rural = country1 - country0 > POLE_SPACING;

  // --- the poles and their wires, on one side of the road the whole way ---
  if (rural && rng.chance(0.75)) {
    const sign = rng.chance(0.5) ? 1 : -1;
    const count = Math.floor((country1 - country0) / POLE_SPACING);
    const start = country0 + ((country1 - country0) - count * POLE_SPACING) * 0.5;
    /** The last pole standing: where along the road, and how far its two wires' ends stand from the planet's centre. */
    let last = NaN;
    const ends = [0, 0];
    for (let k = 0; k <= count; k++) {
      const s = start + k * POLE_SPACING;
      // Where the road bends harder than a line of poles follows, the line
      // breaks: a span's wires cut inside the curve by its sagitta.
      if (bendAt(site, s) > POLE_BEND) {
        last = NaN;
        continue;
      }
      stand(site, s, sign * POLE_LATERAL, 1, 0.4);
      if (!clearAt(site, POLE_WIDTH)) {
        last = NaN;
        continue;
      }
      centre.copy(at).addScaledVector(up, POLE_HEIGHT * 0.5);
      box(out, centre, right, up, forward, POLE_WIDTH * 0.5, POLE_HEIGHT * 0.5, POLE_WIDTH * 0.5, colours.pole);
      // The arm across the road's line, at the top, and a wire from each end.
      centre.copy(at).addScaledVector(up, POLE_HEIGHT - ARM_DEPTH * 2);
      box(out, centre, right, up, forward, ARM_LENGTH * 0.5, ARM_DEPTH * 0.5, ARM_DEPTH * 0.5, colours.pole);
      const top = centre.length() + ARM_DEPTH * 0.5;
      if (!Number.isNaN(last)) {
        // `right` is the left of the way from A to B, as the site's lateral is.
        for (const [w, offset] of [[0, ARM_LENGTH * 0.4], [1, -ARM_LENGTH * 0.4]] as const) {
          for (let q = 0; q < WIRE_PIECES; q++) {
            for (const [point, share] of [[wireA, q / WIRE_PIECES], [wireB, (q + 1) / WIRE_PIECES]] as const) {
              site.surface(last + (s - last) * share, sign * POLE_LATERAL + offset, point, ahead, side);
              const radius = ends[w]! + (top - ends[w]!) * share - WIRE_SAG * 4 * share * (1 - share);
              point.normalize().multiplyScalar(radius);
            }
            wire(out, wireA, wireB, WIRE_WIDTH, colours.wire);
          }
        }
      }
      last = s;
      ends[0] = top;
      ends[1] = top;
    }
  }

  // --- the white posts along the verge, alternating sides ---
  if (rural) {
    let k = 0;
    for (let s = country0 + POST_SPACING * 0.5; s < country1 - POST_SPACING * 0.25; s += POST_SPACING, k++) {
      const sign = k % 2 === 0 ? 1 : -1;
      const lateral = sign * (site.top(s) - 0.2);
      stand(site, s, lateral, sign > 0 ? -1 : 1, 0.1);
      if (!clearAt(site, POST_WIDTH)) continue;
      centre.copy(at).addScaledVector(up, POST_HEIGHT * 0.4);
      box(out, centre, right, up, forward, POST_WIDTH * 0.5, POST_HEIGHT * 0.4, POST_WIDTH * 0.5, colours.post);
      centre.copy(at).addScaledVector(up, POST_HEIGHT * 0.9);
      box(out, centre, right, up, forward, POST_WIDTH * 0.52, POST_HEIGHT * 0.1, POST_WIDTH * 0.52, colours.cap);
    }
  }

  // --- a rail along the top wherever the bank stands high over the field ---
  for (const sign of [1, -1]) {
    let run: THREE.Vector3[] = [];
    const flush = (): void => {
      for (let k = 0; k < run.length; k++) {
        const post = run[k]!;
        const next = run[Math.min(run.length - 1, k + 1)]!;
        const back = run[Math.max(0, k - 1)]!;
        up.copy(post).normalize();
        forward.subVectors(next, back).projectOnPlane(up);
        if (forward.lengthSq() < 1e-9) continue;
        forward.normalize();
        right.crossVectors(up, forward).normalize();
        centre.copy(post).addScaledVector(up, RAIL_HEIGHT * 0.5);
        box(out, centre, right, up, forward, 0.1, RAIL_HEIGHT * 0.5, 0.1, colours.cap);
        if (k + 1 < run.length) {
          scratch.copy(post).addScaledVector(up, RAIL_HEIGHT * 0.85);
          scratchB.copy(next).addScaledVector(centre.copy(next).normalize(), RAIL_HEIGHT * 0.85);
          bar(out, scratch, scratchB, up, 0.3, colours.rail);
        }
      }
      run = [];
    };
    for (let s = 2; s < length - 2; s += RAIL_POST_SPACING) {
      const top = site.top(s);
      stand(site, s, sign * (top - 0.3), 1, 0);
      if (!clearAt(site, 0.3)) {
        flush();
        continue;
      }
      const post = at.clone();
      site.surface(s, sign * (top + 4.8), scratchB, ahead, side);
      if (post.length() - site.groundRadius(scratchB) < RAIL_DROP) {
        flush();
        continue;
      }
      run.push(post);
    }
    flush();
  }

  // --- each built town's end: lamps down its approach, its name, a speed sign ---
  for (const end of [0, 1] as const) {
    const town = end === 0 ? site.townA : site.townB;
    if (!town) continue;
    const toward = end === 0 ? -1 : 1;
    const along = (d: number): number => (end === 0 ? d : length - d);
    // The far end's country, where the other town's own approach begins: a
    // sign stands in the country between them or not at all.
    const other = end === 0 ? site.countryB : site.countryA;
    if (length < NAME_AT * 2.2) continue;
    // Lamps on the side the traffic arriving keeps to, their arms over the
    // carriageway. Arriving at A is moving towards smaller `s`.
    if (end === 0 ? site.lampsA : site.lampsB) {
      const sign = site.keep * -toward;
      for (let d = LAMP_FROM; d <= NAME_AT - 8; d += LAMP_SPACING) {
        const s = along(d);
        const top = site.top(s);
        stand(site, s, sign * (top - 0.35), 1, 0.05);
        if (!clearAt(site, 0.25)) continue;
        // As tall as it has to be to clear every surface under its arm and
        // head: its own road's, across the width it reaches and the housing's
        // depth along, and any other road's there.
        const foot = at.length();
        const footLateral = sign * (top - 0.35);
        let highest = foot;
        for (const ds of [-0.3, 0, 0.3]) {
          for (let k = 0; k <= 4; k++) {
            const lateral = footLateral - sign * (LAMP_ARM + 0.5) * (k / 4);
            site.surface(Math.min(length, Math.max(0, s + ds)), lateral, lampProbe, ahead, side);
            highest = Math.max(highest, lampProbe.length(), site.roofline?.(lampProbe) ?? 0);
          }
        }
        stand(site, s, footLateral, 1, 0.05);
        lamp(out, sign, Math.max(LAMP_HEIGHT, highest - foot + LAMP_CLEAR));
      }
    }
    // The town's name, facing the traffic arriving, on its side.
    if (NAME_AT <= length - other) {
      const s = along(NAME_AT);
      const sign = site.keep * -toward;
      const lateral = sign * Math.min(site.top(s) + 0.9, SIGN_REACH - 1.15);
      stand(site, s, lateral, -toward, 0.2);
      if (clearAt(site, 1.2)) nameBoard(out, (end === 0 ? site.nameA : site.nameB) ?? '', `${seed}|${end}`);
    }
    // A speed sign for the traffic leaving, on its side.
    if (SPEED_AT <= length - other) {
      const s = along(SPEED_AT);
      const sign = site.keep * toward;
      const lateral = sign * Math.min(site.top(s) + 0.7, SIGN_REACH - 0.5);
      stand(site, s, lateral, toward, 0.2);
      if (clearAt(site, 0.55)) speedSign(out, rngFrom('roadside-limit', seed, end).pick(LIMITS));
    }
  }

  // --- a board of chevrons on the outside of every hard bend ---
  if (rural) {
    let lastSign = -Infinity;
    for (let s = country0 + CHEVRON_SPAN; s < country1 - CHEVRON_SPAN; s += 8) {
      if (s - lastSign < CHEVRON_APART) continue;
      const turn = turnAt(site, s);
      if (Math.abs(turn) < CHEVRON_TURN) continue;
      // Past the sharpest point of this bend? Stand at the sharpest.
      if (Math.abs(turnAt(site, s + 8)) > Math.abs(turn)) continue;
      // The outside of a bend to the left of the way from A to B is its right.
      const outside = turn > 0 ? -1 : 1;
      stand(site, s, outside * Math.min(site.top(s) + 0.8, SIGN_REACH - 0.6), 1, 0.2);
      if (!clearAt(site, 0.6)) continue;
      chevrons(out, -outside);
      lastSign = s;
    }
  }
  return out;
}
