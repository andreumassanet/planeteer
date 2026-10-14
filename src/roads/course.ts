import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { offsetDirection } from '../scenery/grid.ts';
import { townOf } from './town.ts';
import type { Road } from './types.ts';

/** The shape of a road, gate to gate: the bake, `pnpm check`, the ribbon and the traffic all walk these. */

/**
 * How far a road runs straight out of a gate before it may bend, in world
 * units: past its drawn half-width, and one near-band span (`SPANS`).
 */
export const APPROACH = 18;

/** Points the middle's length is estimated from; `coursePath` measures it. */
const MIDDLE_SAMPLES = 8;

/**
 * Everything a road's shape is a function of. `gateA`/`gateB` are where a
 * street's centre line meets the kerb; `stubA`/`stubB` are `approach` units
 * straight out along each side's normal; between them runs a cubic Bezier
 * whose handles follow those normals, plus a `sin^2` bow along the chord's
 * pole. Points are normalised onto the unit sphere. Each approach takes
 * `share` of `t`; `t` is not arc length (use `coursePath`).
 */
export interface RoadCourse {
  gateA: THREE.Vector3;
  gateB: THREE.Vector3;
  stubA: THREE.Vector3;
  stubB: THREE.Vector3;
  /** The middle's inner control points, off the sphere. */
  handleA: THREE.Vector3;
  handleB: THREE.Vector3;
  pole: THREE.Vector3;
  /** The bow's peak, in radians of the sphere. */
  bow: number;
  /** The length of each straight approach, in world units. */
  approach: number;
  /** The share of `t` each approach takes. */
  share: number;
  /** Estimated length, in world units: the two approaches and eight chords of the middle. */
  length: number;
}

export function emptyCourse(): RoadCourse {
  return {
    gateA: new THREE.Vector3(),
    gateB: new THREE.Vector3(),
    stubA: new THREE.Vector3(),
    stubB: new THREE.Vector3(),
    handleA: new THREE.Vector3(),
    handleB: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    bow: 0,
    approach: 0,
    share: 0,
    length: 0,
  };
}

const courseOutA = new THREE.Vector3();
const courseOutB = new THREE.Vector3();
const courseChord = new THREE.Vector3();
const courseLast = new THREE.Vector3();
const courseHere = new THREE.Vector3();

/** The longest a middle's handle may be, as a share of its chord; see `handleFor`. */
const HANDLE_CAP = 0.75;

/**
 * And the longest it may be at all, in world units. A long handle carries a
 * road straight out of a gate that faces away from where it is going, and two
 * roads out of one gate then lie on each other; past about eighty units the
 * length buys no gentler curve. Changing it re-shapes baked roads.
 */
const HANDLE_MAX = 80;

/**
 * How far a middle's handle reaches out of its approach, on the unit sphere:
 * the handle that makes the cubic a circular arc turning `phi` at that end,
 * `c / (3 cos^2(phi / 2))`, so the turn is spread along the curve rather than
 * bunched at its ends. Capped by `HANDLE_CAP` of the chord and `most` units.
 */
function handleFor(chord: number, out: THREE.Vector3, toward: THREE.Vector3, most = HANDLE_MAX): number {
  const length = toward.length();
  const cos = length > 0 ? Math.min(1, Math.max(-1, out.dot(toward) / length)) : 1;
  const halfCos = (1 + cos) * 0.5;
  return Math.min(HANDLE_CAP * chord, most / PLANET_RADIUS, chord / (3 * Math.max(halfCos, 1e-6)));
}

/** The pole of the great circle through `a` and `b`. Degenerate pairs get any axis. */
function roadPole(a: THREE.Vector3, b: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  target.crossVectors(a, b);
  if (target.lengthSq() < 1e-12) target.set(0, 1, 0).cross(a);
  if (target.lengthSq() < 1e-12) target.set(1, 0, 0);
  return target.normalize();
}

/**
 * The course of a road from the two places it joins, the gates it names and
 * its bow. Between two squares that nearly touch the approach shortens to a
 * quarter of the gap between the gates, so the two straight runs never meet.
 */
export function courseOf(road: Road, places: readonly Place[], into: RoadCourse = emptyCourse()): RoadCourse {
  const townA = townOf(places[road.a]!);
  const townB = townOf(places[road.b]!);
  const gateA = townA.gates[road.gateA];
  const gateB = townB.gates[road.gateB];
  if (gateA === undefined || gateB === undefined) {
    throw new Error(
      `road ${places[road.a]!.name}-${places[road.b]!.name} names gates ${road.gateA}/${road.gateB} ` +
        `of towns with ${townA.gates.length}/${townB.gates.length}; re-bake roads.bin`,
    );
  }
  offsetDirection(townA.up, townA.across, townA.north, gateA.x, gateA.z, into.gateA);
  offsetDirection(townB.up, townB.across, townB.north, gateB.x, gateB.z, into.gateB);
  const approach = Math.min(APPROACH, into.gateA.angleTo(into.gateB) * PLANET_RADIUS * 0.25);
  offsetDirection(
    townA.up, townA.across, townA.north,
    gateA.x + gateA.outX * approach, gateA.z + gateA.outZ * approach,
    into.stubA,
  );
  offsetDirection(
    townB.up, townB.across, townB.north,
    gateB.x + gateB.outX * approach, gateB.z + gateB.outZ * approach,
    into.stubB,
  );
  // The side's outward normal at the town's centre. The curve is normalised,
  // so only its projection onto the stub's tangent plane survives, which is
  // the approach's own direction.
  courseOutA.copy(townA.across).multiplyScalar(gateA.outX).addScaledVector(townA.north, gateA.outZ);
  courseOutB.copy(townB.across).multiplyScalar(gateB.outX).addScaledVector(townB.north, gateB.outZ);
  return joinCourse(into, courseOutA, courseOutB, road.bend, approach);
}

/**
 * The middle of a course between two stubs already laid, and its measure.
 * `handleMost` caps a handle in world units: `HANDLE_MAX` for a road, longer
 * for a railway (`rails.ts`), which lays its stations' stubs and ends here so
 * a train runs on the same kind of curve as a car.
 */
export function joinCourse(into: RoadCourse, outA: THREE.Vector3, outB: THREE.Vector3, bend: number, approach: number, handleMost = HANDLE_MAX): RoadCourse {
  const chord = into.stubA.distanceTo(into.stubB);
  courseChord.subVectors(into.stubB, into.stubA);
  into.handleA.copy(into.stubA).addScaledVector(outA, handleFor(chord, outA, courseChord, handleMost));
  courseChord.negate();
  into.handleB.copy(into.stubB).addScaledVector(outB, handleFor(chord, outB, courseChord, handleMost));
  roadPole(into.stubA, into.stubB, into.pole);
  into.bow = bend * into.stubA.angleTo(into.stubB);
  into.approach = approach;
  let middle = 0;
  courseLast.copy(into.stubA);
  for (let k = 1; k <= MIDDLE_SAMPLES; k++) {
    middlePoint(into, k / MIDDLE_SAMPLES, courseHere);
    middle += courseHere.distanceTo(courseLast) * PLANET_RADIUS;
    courseLast.copy(courseHere);
  }
  into.length = 2 * approach + middle;
  into.share = into.length > 0 ? approach / into.length : 0;
  return into;
}

/** The bowed middle at `u` in [0, 1], from one stub to the other. */
function middlePoint(course: RoadCourse, u: number, target: THREE.Vector3): THREE.Vector3 {
  const v = 1 - u;
  const b0 = v * v * v;
  const b1 = 3 * v * v * u;
  const b2 = 3 * v * u * u;
  const b3 = u * u * u;
  const { stubA, handleA, handleB, stubB } = course;
  target.set(
    b0 * stubA.x + b1 * handleA.x + b2 * handleB.x + b3 * stubB.x,
    b0 * stubA.y + b1 * handleA.y + b2 * handleB.y + b3 * stubB.y,
    b0 * stubA.z + b1 * handleA.z + b2 * handleB.z + b3 * stubB.z,
  );
  const s = Math.sin(Math.PI * u);
  return target.addScaledVector(course.pole, course.bow * s * s).normalize();
}

/** A point along a road at `t` in [0, 1], as a unit vector. `t = 0` is gate A, exactly. */
export function coursePoint(course: RoadCourse, t: number, target: THREE.Vector3): THREE.Vector3 {
  const share = course.share;
  if (t <= share) return target.copy(course.gateA).lerp(course.stubA, share > 0 ? t / share : 1).normalize();
  if (t >= 1 - share) return target.copy(course.gateB).lerp(course.stubB, share > 0 ? (1 - t) / share : 1).normalize();
  return middlePoint(course, (t - share) / (1 - 2 * share), target);
}

const tangentAt = new THREE.Vector3();

/**
 * The unit tangent at `t`, pointing the way `t` increases. Differentiated
 * rather than differenced, so at a gate it is exactly the approach's direction
 * and the ribbon's end section lies along the kerb.
 */
export function courseTangent(course: RoadCourse, t: number, target: THREE.Vector3): THREE.Vector3 {
  const share = course.share;
  coursePoint(course, t, tangentAt);
  if (t < share) {
    target.subVectors(course.stubA, course.gateA);
  } else if (t > 1 - share) {
    target.subVectors(course.gateB, course.stubB);
  } else {
    const u = (t - share) / (1 - 2 * share);
    const v = 1 - u;
    const d0 = 3 * v * v;
    const d1 = 6 * u * v;
    const d2 = 3 * u * u;
    const { stubA, handleA, handleB, stubB } = course;
    target.set(
      d0 * (handleA.x - stubA.x) + d1 * (handleB.x - handleA.x) + d2 * (stubB.x - handleB.x),
      d0 * (handleA.y - stubA.y) + d1 * (handleB.y - handleA.y) + d2 * (stubB.y - handleB.y),
      d0 * (handleA.z - stubA.z) + d1 * (handleB.z - handleA.z) + d2 * (stubB.z - handleB.z),
    );
    target.addScaledVector(course.pole, course.bow * Math.PI * Math.sin(2 * Math.PI * u));
  }
  // Onto the ground at the point: the curve is normalised, so only the part
  // of its derivative along the sphere survives.
  return target.addScaledVector(tangentAt, -target.dot(tangentAt)).normalize();
}
