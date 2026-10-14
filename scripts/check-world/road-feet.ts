/**
 * The baked road network under a foot: the crown, the ramps, the kerbs, the
 * grade, and the roadside's lamps and banks against the drawn road.
 */
import { check } from './harness.ts';
import { Vector3 } from 'three';
import { PLANET_RADIUS, groundRadius } from '../../src/globe.ts';
import type { Place } from '../../src/places.ts';
import type { World } from '../../src/geo.ts';
import {
  crownFall,
  ribbonReach,
  nearestOnPath,
  otherRoadsOf,
  othersRoofline,
  PAVEMENT_RUN,
  roadsideSite,
  holdGates,
  RAMP_GRADE,
  RIBBON_LIFT,
  ROAD_CLASSES,
  BRIDGE_LAND,
  courseOf,
  coursePath,
  coursePoint,
  courseTangent,
  createRoads,
  emptyCourse,
  emptyRamp,
  parameterAt,
  rampOf,
  rampReach,
  ribbonHalf,
  roadClearance,
  roadIndexFor,
  townOf,
} from '../../src/roads.ts';
import type { CoursePath, Road, RoadCourse, RoadData, RoadRamp } from '../../src/roads.ts';
import { layRoadside } from '../../src/roadside.ts';
import {
  offsetDirection,
  } from '../../src/scenery/grid.ts';

/** The baked road network against the foot, the lamps and the keepouts. */
export function checkBakedRoads(bakedNetwork: RoadData, placesRaw: Place[], world: World): void {
  const { pruned, course, ramp, pathDistance } = checkRoadSurface(bakedNetwork, placesRaw, world);

  /**
   * What stands beside the roads (`roadside.ts`), laid for every twentieth
   * road of the network through the site the streamer lays it through:
   * every face wound the way its normal says, which is the merged buffer's
   * form of `determinant() > 0`; nothing further from its road than the verge
   * the wood keeps (`roadClearance`), so no tree grows through a pole; nothing
   * over the carriageway lower than a lamp's arm; every lamp down a built
   * town's approach and none anywhere else; and the same road laid twice
   * laying the same thing.
   */
  checkRoadsideKeepouts(pruned, placesRaw, world, course, ramp, pathDistance);
}

/** Every baked road's surface under a foot: the crown, the ramps, the kerbs and the grade. */
function checkRoadSurface(bakedNetwork: RoadData, placesRaw: Place[], world: World): { pruned: Road[]; course: RoadCourse; ramp: RoadRamp; pathDistance: (path: CoursePath, direction: Vector3) => number } {
  const pruned = bakedNetwork.roads;

  const at = new Vector3();
  const tail = new Vector3();
  const side = new Vector3();
  const off = new Vector3();
  const course = emptyCourse();
  const ramp = emptyRamp();
  const chordA = new Vector3();
  const chordB = new Vector3();
  const foot = new Vector3();
  /** A point `s` along a path, on its own chord: exactly where `ribbonHeightAt` measures from. */
  const pathPointAt = (path: CoursePath, s: number, out: Vector3): Vector3 => {
    let k = 1;
    while (k < path.count - 1 && path.s[k]! < s) k++;
    const span = path.s[k]! - path.s[k - 1]!;
    const along = span > 0 ? Math.min(1, Math.max(0, (s - path.s[k - 1]!) / span)) : 0;
    chordA.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!);
    chordB.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!);
    return out.copy(chordA).lerp(chordB, along).normalize();
  };
  /**
   * How far a direction stands from a path, across the ground. A probe put a
   * given distance off one section of a course that bends back near itself
   * can be nearer another stretch of the same road, and that stretch's
   * surface is not this section's shoulder. `nearestAlong` is left at how
   * far along the path that nearest point is.
   */
  let nearestAlong = 0;
  const pathDistance = (path: CoursePath, direction: Vector3): number => {
    let nearest = Infinity;
    for (let k = 1; k < path.count; k++) {
      chordA.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!);
      chordB.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!).sub(chordA);
      const lengthSq = chordB.lengthSq();
      const along = lengthSq > 0 ? Math.min(1, Math.max(0, foot.copy(direction).sub(chordA).dot(chordB) / lengthSq)) : 0;
      foot.copy(chordA).addScaledVector(chordB, along).normalize();
      const away = foot.distanceTo(direction) * PLANET_RADIUS;
      if (away < nearest) {
        nearest = away;
        nearestAlong = path.s[k - 1]! + (path.s[k]! - path.s[k - 1]!) * along;
      }
    }
    return nearest;
  };
  /**
   * Whether another stretch of the same road stands square beside a
   * direction within `reach`, further along the path than either distance:
   * `ribbonHeightAt` answers the higher of its section and the nearest's,
   * as the drawing does, so a probe there is not this section's shoulder.
   */
  const besideAnother = (path: CoursePath, direction: Vector3, along: number, away: number, reach: number): boolean => {
    for (let k = 1; k < path.count; k++) {
      chordA.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!);
      chordB.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!).sub(chordA);
      const lengthSq = chordB.lengthSq();
      if (!(lengthSq > 0)) continue;
      const raw = foot.copy(direction).sub(chordA).dot(chordB) / lengthSq;
      if (raw < 0 || raw > 1) continue;
      foot.copy(chordA).addScaledVector(chordB, raw).normalize();
      const d = foot.distanceTo(direction) * PLANET_RADIUS;
      const s = path.s[k - 1]! + (path.s[k]! - path.s[k - 1]!) * raw;
      if (d < reach && Math.abs(s - along) > Math.max(d, away) + 1) return true;
    }
    return false;
  };
  let elsewhere = 0;

  let crownSamples = 0;
  let crownWrong = 0;
  let worstCrown = 0;
  let rampSamples = 0;
  let rampRising = 0;
  const risingAt: string[] = [];
  let offStrip = 0;
  let offWrong = 0;
  let inTown = 0;
  let inTownWrong = 0;
  let kerbSamples = 0;
  let kerbWrong = 0;
  let kerbWorst = 0;
  let gradeSamples = 0;
  let gradeWorst = 0;
  let tested = 0;

  /**
   * One road at a time. `ribbonHeightAt` answers for the network, and a
   * junction has two carriageways in it, so a probe stepped off one road lands
   * on another; two roads through one gate also share their approach. A
   * streamer over a single road has no such neighbour, so the crown, the
   * shoulder, the kerb and the climb can each be asserted exactly. It costs one
   * `createRoads` per sampled road (every 100th of the network).
   */
  for (let i = 0; i < pruned.length; i += 100) {
    const road = pruned[i]!;
    courseOf(road, placesRaw, course);
    const path = coursePath(course);
    // A network of one road holds its gates against itself: its ramp is asked after.
    const alone = createRoads(world, placesRaw, { ...bakedNetwork, roads: [road] });
    rampOf(road, course, placesRaw, world, ramp);
    tested++;
    const half = ROAD_CLASSES[road.cls]!.width * 0.5;

    // The middle, clear of both approaches and both ramps: the crown at
    // exactly `RIBBON_LIFT` over the relief, a shoulder that only falls, and
    // nothing past the drawn strip.
    const from = Math.max(course.approach, rampReach(ramp.riseA));
    const to = path.length - Math.max(course.approach, rampReach(ramp.riseB));
    if (to > from) {
      for (let k = 1; k < 6; k++) {
        const along = from + ((to - from) * k) / 6;
        // A bridge and its ramps are the deck's height, not the ground's lift: see the bridges' own checks.
        if (road.bridgeTo > road.bridgeFrom && along > road.bridgeFrom - BRIDGE_LAND - 6 && along < road.bridgeTo + BRIDGE_LAND + 6) continue;
        // Where the drawn bank crosses the ground, wherever the top has its
        // ordinary lift: past a town's pavement, or past the shoulder.
        // `roads.ts` exports the arithmetic: one question, one answer.
        const fall = crownFall(ribbonHalf(ramp, half, along, path.length - along));
        const t = parameterAt(path, along);
        coursePoint(course, t, at);
        const ground = groundRadius(world, at);
        crownSamples++;
        const error = Math.abs(alone.ribbonHeightAt(at) - (ground + RIBBON_LIFT));
        if (error > 1e-6) crownWrong++;
        if (error > worstCrown) worstCrown = error;

        courseTangent(course, t, tail);
        side.crossVectors(at, tail).normalize();
        let last = Infinity;
        for (let step = 0; step <= 10; step++) {
          const away = (fall * step) / 10;
          off.copy(at).addScaledVector(side, away / PLANET_RADIUS).normalize();
          // Nearer another stretch by a margin, or by a hair: `ribbonHeightAt`
          // answers from whichever stretch is nearest, and on the inside of a
          // bend the two are equidistant along a line. Past that line the
          // answer is the other stretch's section, which near a gate is a
          // ramp's higher bank (Huoshilafu-Damusi, 7.6 out at 46.6 of 72: the
          // nearest point jumps to 58, on gate B's ramp). A probe off its own
          // section has its nearest point within its own distance of `along`
          // (the chords lean off the course's tangent by less than a right
          // angle), so a foot further along than that is another stretch.
          // And beside another stretch whose section it stands square
          // across: the foot reads the higher of the two (`besideAnother`).
          const nearest = pathDistance(path, off);
          if (nearest < away - 0.1 || Math.abs(nearestAlong - along) > away + 0.1 || besideAnother(path, off, along, away, ribbonReach(half))) {
            elsewhere++;
            continue;
          }
          const lift = alone.ribbonHeightAt(off);
          const value = lift === 0 ? 0 : lift - groundRadius(world, off);
          rampSamples++;
          if (value > last + 1e-6) {
            rampRising++;
            if (risingAt.length < 3) risingAt.push(`${placesRaw[road.a]!.name}-${placesRaw[road.b]!.name} at ${along.toFixed(1)} of ${path.length.toFixed(0)}, ${away.toFixed(2)} out: ${last.toFixed(3)} then ${value.toFixed(3)}`);
          }
          last = value;
        }
        for (const sign of [1, -1]) {
          off.copy(at).addScaledVector(side, (sign * (fall + 0.5)) / PLANET_RADIUS).normalize();
          if (pathDistance(path, off) < fall + 0.4) {
            elsewhere++;
            continue;
          }
          offStrip++;
          if (alone.ribbonHeightAt(off) !== 0) offWrong++;
        }
      }
    }

    // The two kerbs, which is where the join between road and town showed.
    for (const end of [0, 1] as const) {
      const kerb = end === 0 ? ramp.kerbA : ramp.kerbB;
      const town = townOf(placesRaw[end === 0 ? road.a : road.b]!);
      const gate = town.gates[end === 0 ? road.gateA : road.gateB]!;
      // Half a unit inside the kerb on the street's own line is the town's
      // paving, and `madeHeightAt` answers there: the road answers nothing.
      offsetDirection(town.up, town.across, town.north, gate.x - gate.outX * 0.5, gate.z - gate.outZ * 0.5, off);
      inTown++;
      if (alone.ribbonHeightAt(off) !== 0) inTownWrong++;
      // A hundredth of a unit outside it, across the crown, the road stands
      // at the paving's own height: no step, no gap.
      const edge = end === 0 ? 0.01 : path.length - 0.01;
      const t0 = parameterAt(path, edge);
      coursePoint(course, t0, at);
      courseTangent(course, t0, tail);
      side.crossVectors(at, tail).normalize();
      const crown = ribbonHalf(ramp, half, edge, path.length - edge);
      for (let step = -2; step <= 2; step++) {
        off.copy(at).addScaledVector(side, (crown * 0.45 * step) / PLANET_RADIUS).normalize();
        kerbSamples++;
        const error = Math.abs(alone.ribbonHeightAt(off) - kerb);
        if (error > 0.02) kerbWrong++;
        if (error > kerbWorst) kerbWorst = error;
      }
      // And the climb, along the centre line from the kerb to past where its
      // ramp and its approach both end, every half a unit: how fast the lift
      // over the relief changes, which is the ramp and nothing else.
      const reach = Math.min(
        path.length * 0.5,
        Math.max(rampReach(end === 0 ? ramp.riseA : ramp.riseB), course.approach) + 2,
      );
      let previous = NaN;
      for (let s = 0.25; s <= reach; s += 0.5) {
        // On the path's own chord rather than the curve, so the query's foot
        // is the probe itself: the curve is up to `PATH_SAG` off the chord,
        // and over an approach that is enough cross-slope to read as a
        // hundredth of grade that the ramp does not have.
        pathPointAt(path, end === 0 ? s : path.length - s, at);
        const height = alone.ribbonHeightAt(at);
        if (height === 0) {
          previous = NaN;
          continue;
        }
        const lift = height - groundRadius(world, at);
        if (!Number.isNaN(previous)) {
          gradeSamples++;
          gradeWorst = Math.max(gradeWorst, Math.abs(lift - previous) / 0.5);
        }
        previous = lift;
      }
    }
  }
  check(
    crownWrong === 0,
    'the ribbon is exactly RIBBON_LIFT over the relief on its crown, between the ramps',
    `${crownSamples} samples on ${tested} roads, worst ${worstCrown.toExponential(1)}`,
  );
  check(
    rampRising === 0,
    'and the shoulder only ever falls, from the crown to the ground',
    `${rampSamples} samples across the section, ${rampRising} rising; ` +
      `${elsewhere} probes left out for standing nearer another stretch of the same road` +
      (risingAt.length > 0 ? ` (${risingAt.join('; ')})` : ''),
  );
  check(
    offWrong === 0,
    'and there is nothing to stand on past the drawn strip',
    `${offStrip} probes half a unit outside it, ${offWrong} still on a road`,
  );
  check(
    inTownWrong === 0,
    'and nothing half a unit inside a gate, where the town’s own paving is',
    `${inTown} probes inside a square, ${inTownWrong} standing on a road that is not drawn there`,
  );
  check(
    kerbWrong === 0,
    'ribbonHeightAt meets the gate’s paving at the kerb line: gateLevel + GROUND_LIFT',
    `${kerbSamples} probes across the crown a hundredth of a unit out, worst ${kerbWorst.toFixed(4)} units off`,
  );
  check(
    gradeWorst <= RAMP_GRADE + 1e-3,
    'and a foot climbs from the road to the gate at no more than RAMP_GRADE over the relief',
    `${gradeSamples} half-unit steps along ${tested * 2} approaches, steepest ${gradeWorst.toFixed(3)} against ${RAMP_GRADE}`,
  );
  return { pruned, course, ramp, pathDistance };
}

/** The roadside's lamps, banks and keepouts against the drawn road. */
function checkRoadsideKeepouts(pruned: Road[], placesRaw: Place[], world: World, course: RoadCourse, ramp: RoadRamp, pathDistance: (path: CoursePath, direction: Vector3) => number): void {
  let sideRoads = 0;
  let sideTriangles = 0;
  let sideLength = 0;
  let inverted = 0;
  let beyondVerge = 0;
  let beyondWorst = 0;
  let lowOverRoad = 0;
  let lampsSeen = 0;
  let lampsAstray = 0;
  let unstable = 0;
  const faceAB = new Vector3();
  const faceAC = new Vector3();
  const faceN = new Vector3();
  const vertexAt = new Vector3();
  const gateDir = new Vector3();
  /**
   * Every fourth road of the network, where it was every twentieth: a road
   * that curls past its own gate or runs into a cutting is a few in
   * seventeen thousand. The whole network is `SIDE_STEP=1` in the
   * environment, about 70 s against 18.
   */
  const SIDE_STEP = Number(process.env.SIDE_STEP ?? 4);
  holdGates(pruned, placesRaw, world);
  const sideBegan = Date.now();
  const sideIndex = roadIndexFor(pruned, placesRaw);
  const sidePaths = new Map<number, CoursePath>();
  const sidePathOf = (q: number): CoursePath => {
    let found = sidePaths.get(q);
    if (found === undefined) {
      found = coursePath(courseOf(pruned[q]!, placesRaw, emptyCourse()));
      sidePaths.set(q, found);
    }
    return found;
  };
  const sideRamps = new Map<number, RoadRamp>();
  const sideRampOf = (q: number): RoadRamp => {
    let found = sideRamps.get(q);
    if (found === undefined) {
      found = rampOf(pruned[q]!, courseOf(pruned[q]!, placesRaw, emptyCourse()), placesRaw, world);
      sideRamps.set(q, found);
    }
    return found;
  };
  const sideMiddle = new Vector3();
  const sideNearest = { distance: 0, s: 0 };
  const ownNearest = { distance: 0, s: 0 };
  const surfaceAt = new Vector3();
  const surfaceAhead = new Vector3();
  const surfaceSide = new Vector3();
  let lowWorst = Infinity;
  const lowNames: string[] = [];
  let besideOthers = 0;
  let inOther = 0;
  const otherNames: string[] = [];
  for (let i = 0; i < pruned.length; i += SIDE_STEP) {
    const road = pruned[i]!;
    courseOf(road, placesRaw, course);
    const path = coursePath(course);
    rampOf(road, course, placesRaw, world, ramp);
    const others = otherRoadsOf(pruned, i, sideIndex, sidePathOf, sideRampOf, coursePoint(course, 0.5, sideMiddle));
    if (others.length > 0) besideOthers++;
    const site = roadsideSite(road, course, path, ramp, placesRaw, world, others);
    const laid = layRoadside(site);
    const again = layRoadside(roadsideSite(road, course, path, ramp, placesRaw, world, others));
    if (laid.position.length !== again.position.length || laid.position.some((value, k) => value !== again.position[k])) unstable++;
    sideRoads++;
    sideLength += path.length;
    const p = laid.position;
    const n = laid.normal;
    sideTriangles += p.length / 9;
    for (let t = 0; t + 8 < p.length; t += 9) {
      faceAB.set(p[t + 3]! - p[t]!, p[t + 4]! - p[t + 1]!, p[t + 5]! - p[t + 2]!);
      faceAC.set(p[t + 6]! - p[t]!, p[t + 7]! - p[t + 1]!, p[t + 8]! - p[t + 2]!);
      faceN.crossVectors(faceAB, faceAC);
      if (faceN.x * n[t]! + faceN.y * n[t + 1]! + faceN.z * n[t + 2]! <= 0) inverted++;
    }
    const clearance = roadClearance(road.cls);
    const half = ROAD_CLASSES[road.cls]!.width * 0.5;
    for (let v = 0; v + 2 < p.length; v += 3) {
      vertexAt.set(p[v]!, p[v + 1]!, p[v + 2]!);
      const radius = vertexAt.length();
      vertexAt.normalize();
      const away = pathDistance(path, vertexAt);
      if (away > clearance + 1e-3) {
        beyondVerge++;
        beyondWorst = Math.max(beyondWorst, away - clearance);
      }
      // Measured over the carriageway's own surface under it, which is not
      // the relief's: into a gate cut down a hillside the road runs in a
      // cutting, and a lamp's arm five units over the tarmac is under the
      // ground either side.
      if (away < half - 0.05) {
        nearestOnPath(path, vertexAt, ownNearest);
        const sOwn = ownNearest.s;
        site.surface(sOwn, 0, surfaceAt, surfaceAhead, surfaceSide);
        const lateral = vertexAt.dot(surfaceSide) * PLANET_RADIUS;
        site.surface(sOwn, lateral, surfaceAt, surfaceAhead, surfaceSide);
        const over = radius - surfaceAt.length();
        // Under the surface is under a bridge's deck: its piers, not a thing in the way.
        if (over < 4.5 && over > -0.5) {
          lowOverRoad++;
          lowWorst = Math.min(lowWorst, over);
          if (lowNames.length < 3) lowNames.push(`${placesRaw[road.a]!.name}-${placesRaw[road.b]!.name}`);
        }
      }
      // And nothing under a lamp's arm stands in another road's carriageway:
      // under 4.5 over that road's own crown there.
      if (others.length > 0) {
        for (const other of others) {
          nearestOnPath(other.path, vertexAt, sideNearest);
          const overOther = radius - othersRoofline([other], vertexAt, world);
          if (sideNearest.distance < other.half - 0.05 && overOther < 4.5 && overOther > -0.5) {
            inOther++;
            const pair = `${placesRaw[road.a]!.name}-${placesRaw[road.b]!.name}`;
            if (otherNames.length < 4 && !otherNames.includes(pair)) otherNames.push(pair);
            break;
          }
        }
      }
    }
    for (let h = 0; h + 2 < laid.heads.length; h += 3) {
      lampsSeen++;
      vertexAt.set(laid.heads[h]!, laid.heads[h + 1]!, laid.heads[h + 2]!).normalize();
      const kerbA = gateDir.copy(course.gateA).normalize().angleTo(vertexAt) * PLANET_RADIUS;
      const kerbB = gateDir.copy(course.gateB).normalize().angleTo(vertexAt) * PLANET_RADIUS;
      const nearA = ramp.kerbA > 0 && kerbA <= PAVEMENT_RUN + 4;
      const nearB = ramp.kerbB > 0 && kerbB <= PAVEMENT_RUN + 4;
      if (!nearA && !nearB) lampsAstray++;
    }
  }
  check(
    inverted === 0 && unstable === 0 && sideTriangles > 0,
    'what stands beside a road is wound outward on every face, and laid the same twice',
    `${sideRoads} roads, ${sideTriangles.toLocaleString()} triangles, ` +
      `${((sideTriangles / sideLength) * 1000).toFixed(0)} per 1,000 units of road; ${inverted} faces inward, ${unstable} unstable`,
  );
  check(
    beyondVerge === 0 && lowOverRoad === 0,
    'and it stands inside the verge the wood keeps, and nothing hangs low over the carriageway',
    `${sideRoads.toLocaleString()} roads in ${Date.now() - sideBegan} ms; ${beyondVerge} vertices past roadClearance (worst ${beyondWorst.toFixed(2)}), ${lowOverRoad} over the carriageway under 4.5 over its surface` +
      (lowOverRoad > 0 ? ` (lowest ${lowWorst.toFixed(2)}: ${lowNames.join('; ')})` : ''),
  );
  check(
    inOther === 0 && besideOthers > 0,
    'and none of it stands in another road’s carriageway where two roads meet, fork or share an approach',
    `${besideOthers} of ${sideRoads} roads beside another, ${inOther} vertices under 4.5 inside another’s carriageway` +
      (inOther > 0 ? ` (${otherNames.join('; ')})` : ''),
  );
  check(
    lampsSeen > 0 && lampsAstray === 0,
    'and its street lamps stand down a built town’s approach and nowhere else',
    `${lampsSeen} lamps, ${lampsAstray} further than PAVEMENT_RUN from a built kerb`,
  );
}
