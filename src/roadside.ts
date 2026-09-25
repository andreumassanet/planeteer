import * as THREE from 'three';
import { PALETTE } from './theme.ts';
import { SCENERY_SCALE } from './stature.ts';
import { rngFrom } from './scenery/random.ts';

/**
 * What stands beside a road between the towns: telegraph poles with their
 * wires, white posts along the verge, a town's name before its gate, a speed
 * sign after it, rails along a high bank, and street lamps down the last
 * stretch into a town.
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
const LAMP_ARM = 1.7;
/** How far under its cap a lamp's light hangs, for the per-pixel pools, as the town's lamps' `LAMP_HEAD` is. */
export const LAMP_HEAD_DROP = 0.35;

/** How much higher a bank's top stands than the ground at its foot before it gets a rail. */
export const RAIL_DROP = 5;
const RAIL_HEIGHT = 0.75 * M;
const RAIL_POST_SPACING = 5;

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
  band: new THREE.Color(PALETTE.slate),
  ring: new THREE.Color(PALETTE.red),
};

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
        // The arm reaches back over the road: `right` is the left of A to B, so
        // towards the centre line is `-sign`.
        centre.copy(at).addScaledVector(up, LAMP_HEIGHT * 0.5);
        box(out, centre, right, up, forward, 0.1, LAMP_HEIGHT * 0.5, 0.1, colours.lamp);
        centre.copy(at).addScaledVector(up, LAMP_HEIGHT - 0.08).addScaledVector(right, -sign * LAMP_ARM * 0.5);
        box(out, centre, right, up, forward, LAMP_ARM * 0.5, 0.07, 0.07, colours.lamp);
        centre.copy(at).addScaledVector(up, LAMP_HEIGHT - 0.2).addScaledVector(right, -sign * LAMP_ARM * 0.95);
        box(out, centre, right, up, forward, 0.42, 0.12, 0.2, colours.head, HEAD, true);
        centre.addScaledVector(up, -LAMP_HEAD_DROP);
        out.heads.push(centre.x, centre.y, centre.z);
      }
    }
    // The town's name, facing the traffic arriving, on its side.
    if (NAME_AT <= length - other) {
      const s = along(NAME_AT);
      const sign = site.keep * -toward;
      const lateral = sign * Math.min(site.top(s) + 0.9, SIGN_REACH - 1.15);
      stand(site, s, lateral, -toward, 0.2);
      for (const offset of [-0.85, 0.85]) {
        centre.copy(at).addScaledVector(up, 1.3).addScaledVector(right, offset);
        box(out, centre, right, up, forward, 0.06, 1.3, 0.06, colours.lamp);
      }
      centre.copy(at).addScaledVector(up, 2.2);
      box(out, centre, right, up, forward, 1.15, 0.55, 0.05, colours.board);
      centre.addScaledVector(up, -0.2).addScaledVector(forward, 0.07);
      box(out, centre, right, up, forward, 0.95, 0.07, 0.03, colours.band);
    }
    // A speed sign for the traffic leaving, on its side.
    if (SPEED_AT <= length - other) {
      const s = along(SPEED_AT);
      const sign = site.keep * toward;
      const lateral = sign * Math.min(site.top(s) + 0.7, SIGN_REACH - 0.5);
      stand(site, s, lateral, toward, 0.2);
      centre.copy(at).addScaledVector(up, 1.1);
      box(out, centre, right, up, forward, 0.05, 1.1, 0.05, colours.lamp);
      centre.copy(at).addScaledVector(up, 2.25);
      box(out, centre, right, up, forward, 0.5, 0.5, 0.04, colours.ring);
      centre.addScaledVector(forward, 0.05);
      box(out, centre, right, up, forward, 0.36, 0.36, 0.02, colours.post);
    }
  }
  return out;
}
