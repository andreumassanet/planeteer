import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { SIDEWALK, pavementOf } from '../scenery/ground.ts';
import { CARRIAGEWAY_HALF, TOWN_PITCH } from '../scenery/grid.ts';
import { coursePoint, courseTangent } from './course.ts';
import type { RoadCourse } from './course.ts';
import { BRIDGE_LAND, GIRDER, RIBBON_LIFT, crownLift, needsCentre, onBridge, rampReach } from './crown.ts';
import type { RoadRamp } from './crown.ts';
import { parameterAt } from './path.ts';
import type { CoursePath } from './path.ts';

/**
 * A road's cross-section, drawn by `ribbonSection` and read back by
 * `surfaceLift`. Each side runs from the top's edge to a toe reached at
 * `BANK_GRADE` and laid `TOE_DEPTH` under the relief, then a skirt to a foot
 * `FOOT_RUN` further and `FOOT_DEPTH` lower, which fills any sag of the drawn
 * land under the relief. A raised top widens its bank up to `BANK_RUN_MAX`.
 * The bank bends once, at its knee: steeper off the top and easing into the
 * field, as a graded bank settles.
 */
const BANK_GRADE = 0.45;
const TOE_DEPTH = 1;
const BANK_RUN_MAX = 22;
const FOOT_RUN = 2;
const FOOT_DEPTH = 8;
/**
 * The bank's knee: `KNEE_RUN` of the way out to the toe and `KNEE_FALL` of
 * the way down to it, so the upper slope is 1.29 times the bank's grade and
 * the lower 0.76 times.
 */
export const KNEE_RUN = 0.45;
const KNEE_FALL = 0.58;
/** The bank's width at a built town's kerb, beside the square's own edge slope. */
const KERB_BANK = 4.8;

/** How far out from the deck's edge its girder's foot is drawn: nearly straight down. */
const GIRDER_RUN = 0.35;

/** The gravel shoulder either side of the carriageway, at its height, in world units. */
export const SHOULDER_STRIP = 0.6;

/**
 * How far out from a built town's kerb a road carries the town's pavement in
 * place of its shoulder, and how long it takes to narrow back: the approach
 * the town's street lamps stand along.
 */
export const PAVEMENT_RUN = 36;
export const PAVEMENT_TAPER = 6;

/**
 * How far out from the top's edge the bank reaches its toe, for a top `edge`
 * over the relief: `BANK_GRADE` of fall a unit, no wider than `BANK_RUN_MAX`,
 * at least a unit, and no wider than `KERB_BANK` plus the distance from a
 * built town's kerb, so the bank does not run past a small town's corner.
 */
export function bankRun(edge: number, ramp?: RoadRamp, sA = Infinity, sB = Infinity): number {
  let most = BANK_RUN_MAX;
  if (ramp !== undefined) {
    if (ramp.kerbA > 0) most = Math.min(most, KERB_BANK + sA);
    if (ramp.kerbB > 0) most = Math.min(most, KERB_BANK + sB);
  }
  return Math.min(most, Math.max(1, (edge + TOE_DEPTH) / BANK_GRADE));
}

/**
 * Where the bank of a road whose top is `top` wide either side meets level
 * ground, from its centre line, wherever the top has its ordinary lift: read
 * off the drawn section, where the straight line from the top's edge to the
 * toe crosses the relief. `pnpm check` uses it rather than restating it.
 */
export function crownFall(top: number): number {
  const run = bankRun(RIBBON_LIFT);
  const knee = RIBBON_LIFT + KNEE_FALL * (-TOE_DEPTH - RIBBON_LIFT);
  // Past the knee when it is still over the relief, as an ordinary bank's is.
  if (knee > 0) return top + run * KNEE_RUN + (run * (1 - KNEE_RUN)) * (knee / (knee + TOE_DEPTH));
  return top + run * KNEE_RUN * (RIBBON_LIFT / (RIBBON_LIFT - knee));
}

/** A built town's pavement, `walk` wide at its kerb, `s` units out along the road from it. */
function pavementAt(walk: number, s: number): number {
  if (walk <= 0 || s >= PAVEMENT_RUN + PAVEMENT_TAPER) return 0;
  if (s <= PAVEMENT_RUN) return walk;
  return walk * (1 - (s - PAVEMENT_RUN) / PAVEMENT_TAPER);
}

/** Whether a point `sA` and `sB` along a road is on a town's pavement rather than the country's shoulder. */
export function onPavement(ramp: RoadRamp, sA: number, sB: number): boolean {
  return (ramp.walkA > 0 && sA < PAVEMENT_RUN) || (ramp.walkB > 0 && sB < PAVEMENT_RUN);
}

/** How far out from a built town's kerb a road's carriageway takes to ease from its gate street's to its own. */
export const CARRIAGE_RUN = PAVEMENT_RUN + PAVEMENT_TAPER;

/**
 * The widest a gate's street carriageway is, in world units: an avenue in the
 * widest cell (`TOWN_PITCH` grown by half), less its pavement. What a road's
 * reach allows for near a gate.
 */
const STREET_CARRIAGE_MOST = TOWN_PITCH * 0.75 - pavementOf(TOWN_PITCH * 0.75);

/** The share of the way from a kerb, `s` units off it, that a road's carriageway has eased to its own: 0 at the kerb, 1 from `CARRIAGE_RUN`. */
function easedFrom(s: number): number {
  const t = Math.min(1, Math.max(0, s / CARRIAGE_RUN));
  return t * t * (3 - 2 * t);
}

/**
 * The half-width of a road's carriageway at a point: its own `half`, and over
 * `CARRIAGE_RUN` into a built town the gate street's (`RoadRamp.carriageA`),
 * so at the kerb the road is the street it enters. `half` is the class's,
 * thinned by the distance band; the street's is thinned with it.
 */
export function carriageHalf(ramp: RoadRamp, half: number, sA: number, sB: number): number {
  const thin = half / CARRIAGEWAY_HALF;
  let carriage = half;
  if (ramp.carriageA > 0 && sA < CARRIAGE_RUN) carriage += (ramp.carriageA * thin - half) * (1 - easedFrom(sA));
  if (ramp.carriageB > 0 && sB < CARRIAGE_RUN) carriage += (ramp.carriageB * thin - half) * (1 - easedFrom(sB));
  return carriage;
}

/**
 * The half-width of a road's top at a point: the carriageway (`carriageHalf`)
 * and beside it the shoulder, or over the last `PAVEMENT_RUN` into a built
 * town that town's pavement, so the kerb the road arrives with is the street's.
 */
export function ribbonHalf(ramp: RoadRamp, half: number, sA: number, sB: number): number {
  return carriageHalf(ramp, half, sA, sB) + Math.max(SHOULDER_STRIP, pavementAt(ramp.walkA, sA), pavementAt(ramp.walkB, sB));
}

/** The widest a road's drawn section can be from its centre line: a gate's street, a whole pavement, the widest bank past it and its foot. */
export function ribbonReach(half: number): number {
  return Math.max(half, STREET_CARRIAGE_MOST) + SIDEWALK + BANK_RUN_MAX + FOOT_RUN;
}

/**
 * The surface a foot or a wheel stands on, `lateral` units off the centre
 * line, as a lift over `ground`: the drawn section read back. Zero or less is
 * the bank under the relief; `-Infinity` past the foot is off the road.
 */
export function surfaceLift(
  ramp: RoadRamp,
  half: number,
  sA: number,
  sB: number,
  lateral: number,
  ground: number,
  centre: number,
): number {
  const crown = ribbonHalf(ramp, half, sA, sB);
  const edge = crownLift(ramp, sA, sB, ground, centre);
  const away = Math.abs(lateral);
  if (away <= crown) return edge;
  // Over a bridge's water the edge is a girder, not a bank: past it is the drop.
  if (onBridge(ramp, sA)) return away <= crown + GIRDER_RUN ? edge - GIRDER : -Infinity;
  const run = bankRun(edge, ramp, sA, sB);
  const out = away - crown;
  const knee = edge + KNEE_FALL * (-TOE_DEPTH - edge);
  if (out <= run * KNEE_RUN) return edge + (out / (run * KNEE_RUN)) * (knee - edge);
  if (out <= run) return knee + ((out - run * KNEE_RUN) / (run * (1 - KNEE_RUN))) * (-TOE_DEPTH - knee);
  if (out <= run + FOOT_RUN) return -TOE_DEPTH - ((out - run) / FOOT_RUN) * FOOT_DEPTH;
  return -Infinity;
}

/**
 * Where a ribbon's cross-sections stand, as distances from gate A, for pieces
 * of at most `span`. Every break in the height law is a station (both kerbs,
 * the approaches' ends, where each ramp, pavement and bridge ramp ends) so
 * nothing is drawn as a chord across a corner. The first and last are exactly
 * 0 and `length`.
 */
export function ribbonStations(
  length: number,
  approach: number,
  ramp: RoadRamp,
  span: number,
  out: number[],
): number[] {
  const marks = [0, length, approach, length - approach, rampReach(ramp.riseA), length - rampReach(ramp.riseB)];
  if (ramp.bridgeTo > ramp.bridgeFrom) {
    marks.push(ramp.bridgeFrom, ramp.bridgeTo, ramp.bridgeFrom - BRIDGE_LAND, ramp.bridgeTo + BRIDGE_LAND);
  }
  if (ramp.walkA > 0) marks.push(PAVEMENT_RUN, PAVEMENT_RUN + PAVEMENT_TAPER);
  if (ramp.walkB > 0) marks.push(length - PAVEMENT_RUN, length - PAVEMENT_RUN - PAVEMENT_TAPER);
  const sorted = marks.filter((s) => s >= 0 && s <= length).sort((x, y) => x - y);
  out.length = 0;
  let last = 0;
  for (const mark of sorted) {
    if (out.length > 0 && mark - last < 1e-6) continue;
    if (out.length > 0) {
      const pieces = Math.max(1, Math.ceil((mark - last) / span));
      for (let k = 1; k < pieces; k++) out.push(last + ((mark - last) * k) / pieces);
    }
    out.push(mark);
    last = mark;
  }
  out[out.length - 1] = length;
  return out;
}

const sectionAt = new THREE.Vector3();
const sectionAhead = new THREE.Vector3();
const sectionSide = new THREE.Vector3();

/**
 * One cross-section of a road's ribbon, `s` units from gate A, as six points
 * left to right: foot, toe, top's edge, top's edge, toe, foot; then the two
 * banks' knees, left and right. Over a bridge's water the toe is the girder's
 * underside and the foot and the knee the same point.
 *
 * The direction across comes from the course's own tangent, so the two pieces
 * meeting at a section agree on its corners and the end section lies along
 * the kerb. Height is asked at each point, so a road on a cross-slope follows
 * the hill. `half` already includes the band's taper.
 */
export function ribbonSection(
  world: World,
  course: RoadCourse,
  path: CoursePath,
  ramp: RoadRamp,
  half: number,
  s: number,
  into: readonly THREE.Vector3[],
): void {
  const t = parameterAt(path, s);
  coursePoint(course, t, sectionAt);
  courseTangent(course, t, sectionAhead);
  sectionSide.crossVectors(sectionAt, sectionAhead).normalize();
  const sB = path.length - s;
  const crown = ribbonHalf(ramp, half, s, sB);
  const bridged = onBridge(ramp, s);
  const centre = needsCentre(ramp, s, sB) ? world.elevationAt(sectionAt) : 0;
  for (const [edge, toe, foot, knee, sign] of [[2, 1, 0, 6, -1], [3, 4, 5, 7, 1]] as const) {
    const top = into[edge]!;
    top.copy(sectionAt).addScaledVector(sectionSide, (sign * crown) / PLANET_RADIUS).normalize();
    const ground = world.elevationAt(top);
    const lift = crownLift(ramp, s, sB, ground, centre);
    top.multiplyScalar(PLANET_RADIUS + ground + lift);
    const under = into[toe]!;
    if (bridged) {
      under.copy(sectionAt).addScaledVector(sectionSide, (sign * (crown + GIRDER_RUN)) / PLANET_RADIUS).normalize();
      under.multiplyScalar(PLANET_RADIUS + ground + lift - GIRDER);
      into[foot]!.copy(under);
      into[knee]!.copy(under);
      continue;
    }
    const run = bankRun(lift, ramp, s, sB);
    const bend = into[knee]!;
    bend.copy(sectionAt).addScaledVector(sectionSide, (sign * (crown + run * KNEE_RUN)) / PLANET_RADIUS).normalize();
    bend.multiplyScalar(PLANET_RADIUS + world.elevationAt(bend) + lift + KNEE_FALL * (-TOE_DEPTH - lift));
    const out = crown + run;
    under.copy(sectionAt).addScaledVector(sectionSide, (sign * out) / PLANET_RADIUS).normalize();
    const low = world.elevationAt(under);
    under.multiplyScalar(PLANET_RADIUS + low - TOE_DEPTH);
    into[foot]!.copy(sectionAt).addScaledVector(sectionSide, (sign * (out + FOOT_RUN)) / PLANET_RADIUS).normalize()
      .multiplyScalar(PLANET_RADIUS + low - TOE_DEPTH - FOOT_DEPTH);
  }
}
