import { DEG, check, here } from './harness.ts';
import type { WorldContext } from './context.ts';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { toLatLon } from '../../src/geo.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { isShown, radiusOf } from '../../src/places.ts';
import { decodeRoads, inflate } from '../../src/pack.ts';
import {
  holdGates,
  ROAD_CLASSES,
  WATER_PROBE_STEP,
  classOf,
  BRIDGE_LAND,
  BRIDGE_SPAN,
  bridgeDeck,
  courseOf,
  distanceAt,
  coursePath,
  coursePoint,
  courseTangent,
  emptyCourse,
  emptyRamp,
  gateOpen,
  placeDirection,
  rampOf,
  rampReach,
  ribbonSection,
  ribbonStations,
  roadClearance,
  tightestTurn,
  townOf,
  townOffset,
  waterProbeSteps,
  } from '../../src/roads.ts';
import type { Road, RoadCourse } from '../../src/roads.ts';
import { offsetDirection } from '../../src/scenery/grid.ts';
import type { Place } from '../../src/places.ts';
import type { World } from '../../src/geo.ts';
import { checkRibbonLayers, checkGraphShape, checkBakeAccounting } from './road-bake.ts';
/**
 * The road network.
 *
 * The one assertion that has to be here rather than in the bake is that **no
 * road crosses water**, and it has to be re-walked rather than trusted: the bake
 * tests a path and writes down a `bend`, and if the two ever drift — a different
 * curve in `roadPoint`, a rounding change in the stored bow — every road in the
 * world would still be a road between two real towns and some of them would run
 * across the sea. Nothing else in the file would notice. It is 463,000
 * point-in-polygon queries and it is worth every one of them.
 */
export async function checkRoads(ctx: WorldContext): Promise<void> {
  const { world, placesRaw } = ctx;
  console.log('\nroads');
  const roadsPath = resolve(here, '../public/data/roads.bin');
  if (!existsSync(roadsPath)) {
    check(false, 'public/data/roads.bin exists', 'run `pnpm roads`');
  } else {
    await checkBakedNetwork(placesRaw, roadsPath, world);
  }
}

async function checkBakedNetwork(placesRaw: Place[], roadsPath: string, world: World): Promise<void> {
  // `places` at the top of this file is a table of named test coordinates, so
  // the settlement rows are the decoded ones rather than that.
  const settled = placesRaw;
  const baked = decodeRoads(await inflate(readFileSync(roadsPath)));
  const roads = baked.roads;
  // The gates a town may not raise, against the whole network, as the game has them.
  holdGates(roads, settled, world);

  // Indices into `places.bin`, so the two files are one artefact. Re-baking
  // the places without re-baking the roads joins arbitrary pairs of towns,
  // and every one of them would look plausible.
  check(
    baked.places === settled.length,
    'the network was baked against these places',
    baked.places === settled.length ? '' : `${baked.places} then, ${settled.length} now`,
  );

  let malformed = 0;
  for (const road of roads) {
    if (
      !Number.isInteger(road.a) || !Number.isInteger(road.b) ||
      road.a < 0 || road.b < 0 || road.a >= settled.length || road.b >= settled.length ||
      road.a === road.b || !(road.cls >= 0 && road.cls < ROAD_CLASSES.length) ||
      !Number.isFinite(road.bend) || Math.abs(road.bend) > 0.6 ||
      // A gate index names one of that town's gates, or `courseOf` refuses
      // it: a change to `gatesOf` or to the size law is a re-bake.
      !Number.isInteger(road.gateA) || !Number.isInteger(road.gateB) ||
      road.gateA < 0 || road.gateB < 0 ||
      road.gateA >= townOf(settled[road.a]!).gates.length || road.gateB >= townOf(settled[road.b]!).gates.length ||
      !Number.isInteger(road.layer) || road.layer < 0
    ) malformed++;
  }
  check(malformed === 0, `all ${roads.length.toLocaleString()} roads are well formed`, `${malformed} bad rows`);

  // Each pair once, and no road doubled back the other way round.
  const seen = new Set<number>();
  let duplicates = 0;
  for (const road of roads) {
    const key = Math.min(road.a, road.b) * 100000 + Math.max(road.a, road.b);
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  check(duplicates === 0, 'no pair of places is joined twice', `${duplicates} duplicates`);

  // The class is `classOf` and nothing else, so a hand-edited row cannot
  // quietly promote a lane between two hamlets into a trunk road.
  let misclassed = 0;
  for (const road of roads) {
    if (classOf(settled[road.a]!, settled[road.b]!) !== road.cls) misclassed++;
  }
  check(misclassed === 0, 'every road is the class its two ends earn', `${misclassed} wrong`);

  const point = new Vector3();
  const walk = emptyCourse();
  let wet = 0;
  let probes = 0;
  let bridges = 0;
  let widest = 0;
  let badBridges = 0;
  const wetNames: string[] = [];
  const bridgeNames: string[] = [];
  const began = Date.now();
  for (const road of roads) {
    const course = courseOf(road, settled, walk);
    const steps = waterProbeSteps(course);
    probes += steps + 1;
    const bridged = road.bridgeTo > road.bridgeFrom;
    const path = bridged ? coursePath(course) : null;
    let wetHere = false;
    for (let step = 0; step <= steps; step++) {
      coursePoint(course, step / steps, point);
      const { lat, lon } = toLatLon(point);
      if (world.countryAt(lat, lon) === 0) {
        // Water is allowed on its bridge's span and nowhere else.
        if (path !== null) {
          const s = distanceAt(path, step / steps);
          if (s > road.bridgeFrom && s < road.bridgeTo) {
            wetHere = true;
            continue;
          }
        }
        wet++;
        if (wetNames.length < 5) wetNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
        break;
      }
    }
    if (bridged) {
      bridges++;
      widest = Math.max(widest, road.bridgeTo - road.bridgeFrom);
      // A bridge crosses water, is no wider than the rule, and leaves room on land for its ramps.
      if (!wetHere || road.bridgeTo - road.bridgeFrom > BRIDGE_SPAN + 1e-6 || road.bridgeFrom < BRIDGE_LAND || road.bridgeTo + BRIDGE_LAND > path!.length) {
        badBridges++;
      }
      if (bridgeNames.length < 6) bridgeNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name} ${(road.bridgeTo - road.bridgeFrom).toFixed(0)}`);
    }
  }
  check(
    wet === 0,
    `no road crosses water except on its bridge`,
    wet === 0
      ? `${probes.toLocaleString()} probes along the courses, gate to gate, in ${Date.now() - began} ms`
      : `${wet} do: ${wetNames.join(', ')}`,
  );
  check(
    badBridges === 0,
    `every bridge spans water, no wider than ${BRIDGE_SPAN} units, with land for its ramps`,
    `${bridges} bridges, the widest ${widest.toFixed(0)} units: ${bridgeNames.join(', ')}`,
  );
  // And a boat passes under: the deck over the middle of the water stands at `DECK_HEIGHT` or near it.
  {
    const ramp = emptyRamp();
    let lowest = Infinity;
    for (const road of roads) {
      if (road.bridgeTo <= road.bridgeFrom) continue;
      rampOf(road, courseOf(road, settled, walk), settled, world, ramp);
      lowest = Math.min(lowest, bridgeDeck(ramp, (road.bridgeFrom + road.bridgeTo) / 2));
    }
    check(bridges === 0 || lowest >= 14, 'every deck stands high over the middle of its water', `lowest ${lowest.toFixed(1)} units over the sea`);
  }

  /**
   * Every road starts and stops on a gate its two towns can use. Three things
   * per road end:
   *
   * - The gate can be used (`gateOpen`): `gateLevel` cuts it and its approach
   *   is dry. `settlements.ts` paves exactly the gates `gateLevel` admits.
   * - The ribbon's end is on the kerb: the course's first point, read back
   *   into the town's frame, is the gate's own offset on the square's edge.
   * - It leaves square: the course's tangent at the gate is the side's outward
   *   normal, so the road continues the street rather than meeting it slanted.
   */
  {
    const course = emptyCourse();
    const tangent = new Vector3();
    const out = new Vector3();
    const kerbLine = new Vector3();
    const offset = { x: 0, z: 0 };
    let shut = 0;
    let offGate = 0;
    let worstGate = 0;
    let slanted = 0;
    let worstSlant = 0;
    const shutNames: string[] = [];
    const gateUse = new Map<string, number>();
    for (const road of roads) {
      courseOf(road, settled, course);
      for (const end of [0, 1] as const) {
        ({ shut, offGate, worstGate, slanted, worstSlant } = checkRoadEnds(end, road, settled, gateUse, world, shut, shutNames, course, offset, offGate, worstGate, tangent, out, kerbLine, slanted, worstSlant));
      }
    }
    let shared = 0;
    for (const count of gateUse.values()) if (count > 1) shared += count;
    check(
      shut === 0,
      'every road end is on a gate its town can cut, with a dry approach',
      shut === 0
        ? `${(roads.length * 2).toLocaleString()} road ends on ${gateUse.size.toLocaleString()} gates, ` +
          `${shared.toLocaleString()} of the ends on a gate another road also uses`
        : `${shut} are not: ${shutNames.join(', ')}`,
    );
    check(
      offGate === 0 && slanted === 0,
      'and the ribbon starts on the kerb line, square to it',
      `worst ${worstGate.toExponential(1)} units off the gate, worst ${worstSlant.toFixed(4)} deg off square`,
    );
  }

  checkCourses(settled, roads, world);

  checkRibbonLayers(roads, settled, world);

  checkGraphShape(settled, roads, baked);

  checkBakeAccounting(roads, settled, world);
}

function checkRoadEnds(end: number, road: Road, settled: Place[], gateUse: Map<string, number>, world: World, shut: number, shutNames: string[], course: RoadCourse, offset: { x: number; z: number; }, offGate: number, worstGate: number, tangent: Vector3, out: Vector3, kerbLine: Vector3, slanted: number, worstSlant: number): { shut: number; offGate: number; worstGate: number; slanted: number; worstSlant: number } {
  const index = end === 0 ? road.a : road.b;
  const gateIndex = end === 0 ? road.gateA : road.gateB;
  const place = settled[index]!;
  const town = townOf(place);
  const gate = town.gates[gateIndex]!;
  gateUse.set(`${index}:${gateIndex}`, (gateUse.get(`${index}:${gateIndex}`) ?? 0) + 1);
  if (!gateOpen(place, gateIndex, world)) {
    shut++;
    if (shutNames.length < 5) shutNames.push(`${place.name} gate ${gateIndex}`);
  }
  const at = end === 0 ? course.gateA : course.gateB;
  townOffset(town, at, offset);
  const along = gate.outX !== 0 ? offset.x * gate.outX : offset.z * gate.outZ;
  const miss = Math.max(Math.hypot(offset.x - gate.x, offset.z - gate.z), Math.abs(along - town.grid.half));
  if (miss > 1e-6) offGate++;
  worstGate = Math.max(worstGate, miss);
  // Square to the kerb *line*, measured on the ground at the gate: the
  // kerb's own direction there, from two points a unit either side of
  // the gate along the side, and the course's tangent pointing out of
  // the town. The town's `out` vector is a tangent at its centre and
  // tilts by `half / R` by the time it reaches a kerb, so it is not the
  // thing to measure against.
  courseTangent(course, end === 0 ? 0 : 1, tangent);
  if (end === 1) tangent.negate();
  offsetDirection(town.up, town.across, town.north, gate.x - gate.outZ, gate.z + gate.outX, out);
  offsetDirection(town.up, town.across, town.north, gate.x + gate.outZ, gate.z - gate.outX, kerbLine);
  out.sub(kerbLine).normalize();
  const slant = Math.asin(Math.min(1, Math.abs(tangent.dot(out)))) / DEG;
  offsetDirection(town.up, town.across, town.north, gate.x + gate.outX, gate.z + gate.outZ, kerbLine);
  if (slant > 0.01 || tangent.dot(kerbLine.sub(at)) <= 0) slanted++;
  worstSlant = Math.max(worstSlant, slant);
  return { shut, offGate, worstGate, slanted, worstSlant };
}

/**
 * The ribbon as it is drawn: out of the squares, off the other towns, over the
 * ground, and up to each gate's own paving at no more than `RAMP_GRADE`.
 *
 * It walks the drawn ribbon rather than trusting the course
 * (`ribbonStations` and `ribbonSection` are what `raise` lays): every section
 * of every road is rebuilt at the near band's own span, all four points, and
 * asked four things:
 *
 * - No vertex inside its own two squares beyond a thousandth of a unit (the end
 *   section lies on the kerb, so the tolerance separates "on" from "in").
 * - No centre-line vertex inside a third built town's disc by more than
 *   `WATER_PROBE_STEP`, the stride the bake probes at.
 * - The end section is at the gate's paving, `gateLevel + GROUND_LIFT`, at all
 *   four points of its crown, within a thousandth.
 * - The two ramps fit in the road, so neither kerb is disturbed by the other
 *   end's climb. How fast the crown climbs is asserted under a foot, in made
 *   ground; a section-to-section slope divides the relief's roughness by a run
 *   of a hundredth of a unit where a ramp ends beside an approach.
 */
function checkCourses(settled: Place[], roads: Road[], world: World): void {
  // A grid of the built places, so a section along a road asks about a
  // neighbourhood instead of about the world. Two degrees is 558 units at
  // the equator and the largest town is 150, so the 3x3 block always covers
  // the reach; the longitude span opens with the cosine for the same reason
  // `proximityGraph`'s does.
  const CELL = 2;
  const COLS = Math.round(360 / CELL);
  const ROWS = Math.round(180 / CELL);
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const shownAt = new Vector3();
  const shownUnit: Vector3[] = [];
  let shownCount = 0;
  for (let i = 0; i < settled.length; i++) {
    const place = settled[i]!;
    shownUnit.push(placeDirection(place, new Vector3()));
    if (!isShown(place)) continue;
    shownCount++;
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - place.lat) / CELL)));
    const col = ((Math.floor((place.lon + 180) / CELL) % COLS) + COLS) % COLS;
    grid[row * COLS + col]!.push(i);
  }

  const course = emptyCourse();
  const ramp = emptyRamp();
  const stations: number[] = [];
  const near = Array.from({ length: 6 }, () => new Vector3());
  const far = Array.from({ length: 6 }, () => new Vector3());
  const unitAt = new Vector3();
  const offset = { x: 0, z: 0 };
  let vertices = 0;
  let inside = 0;
  let worstInside = 0;
  let worstInsideName = '';
  let through = 0;
  let throughWorst = 0;
  const throughNames = new Set<string>();
  let kerbs = 0;
  let kerbWrong = 0;
  let kerbWorst = 0;
  let overlapping = 0;
  let ramped = 0;
  let longestRamp = 0;
  let folded = 0;
  let tightestRatio = Infinity;
  const foldedNames: string[] = [];
  let sagRoads = 0;
  let sagSections = 0;
  let sagOver = 0;
  let sagWorst = 0;
  const roadsBegan = Date.now();
  for (const road of roads) {
    courseOf(road, settled, course);
    const path = coursePath(course);
    rampOf(road, course, settled, world, ramp);
    const half = ROAD_CLASSES[road.cls]!.width * 0.5;
    const turn = tightestTurn(path) / roadClearance(road.cls);
    if (turn < 1) {
      folded++;
      if (foldedNames.length < 4) foldedNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
    }
    tightestRatio = Math.min(tightestRatio, turn);
    if (rampReach(ramp.riseA) + rampReach(ramp.riseB) > path.length) overlapping++;
    if (Math.abs(ramp.riseA) > 1e-9 || Math.abs(ramp.riseB) > 1e-9) ramped++;
    longestRamp = Math.max(longestRamp, rampReach(ramp.riseA), rampReach(ramp.riseB));
    const towns = [townOf(settled[road.a]!), townOf(settled[road.b]!)];
    ribbonStations(path.length, course.approach, ramp, 18, stations);
    // Every third road, the sag: a section takes its height at its two ends
    // and draws a straight line between them, and the relief does not.
    // `SPANS` chose 18 units against an arithmetic estimate, and this is
    // the estimate measured on the network as drawn.
    const measureSag = sagRoads % 3 === 0;
    sagRoads++;
    for (let k = 0; k < stations.length; k++) {
      const s = stations[k]!;
      ribbonSection(world, course, path, ramp, half, s, far);
      vertices += 6;
      // The top's two edges. The bank's feet are laid `SHOULDER_DROP` under
      // the relief, which inside a square is under its paving as well, so a
      // road that curls round its own town reaches in under it by a unit or
      // two.
      for (const vertex of [far[2]!, far[3]!]) {
        unitAt.copy(vertex).normalize();
        for (const town of towns) {
          townOffset(town, unitAt, offset);
          const depth = Math.min(town.grid.half - Math.abs(offset.x), town.grid.half - Math.abs(offset.z));
          if (depth > 1e-3) {
            inside++;
            if (depth > worstInside) {
              worstInside = depth;
              worstInsideName = `${settled[road.a]!.name}-${settled[road.b]!.name}`;
            }
          }
        }
      }
      // The kerbs: both crown points of the end section at the paving.
      if (k === 0 || k === stations.length - 1) {
        const kerb = k === 0 ? ramp.kerbA : ramp.kerbB;
        for (const vertex of [far[2]!, far[3]!]) {
          kerbs++;
          const error = Math.abs(vertex.length() - kerb);
          if (error > 1e-3) kerbWrong++;
          kerbWorst = Math.max(kerbWorst, error);
        }
      }
      if (k > 0) {
        if (measureSag) {
          const middle = world.elevationAt(unitAt.addVectors(near[2]!, far[3]!).normalize());
          const chordMiddle = (near[2]!.length() + near[3]!.length() + far[2]!.length() + far[3]!.length()) / 4;
          const sag = PLANET_RADIUS + middle - chordMiddle;
          sagSections++;
          if (sag > 0) sagOver++;
          if (sag > sagWorst) sagWorst = sag;
        }
      }
      // And a third town: the centre line against every built disc nearby.
      unitAt.addVectors(far[2]!, far[3]!).normalize();
      const { lat, lon } = toLatLon(unitAt);
      const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
      const lonSpan = Math.ceil(1 / Math.max(0.02, Math.cos(lat * DEG)));
      const col = Math.floor((lon + 180) / CELL);
      for (let r = Math.max(0, row - 1); r <= Math.min(ROWS - 1, row + 1); r++) {
        for (let c = col - lonSpan; c <= col + lonSpan; c++) {
          for (const j of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
            if (j === road.a || j === road.b) continue;
            const limit = radiusOf(settled[j]!);
            shownAt.copy(shownUnit[j]!);
            const gap = unitAt.angleTo(shownAt) * PLANET_RADIUS;
            if (gap >= limit) continue;
            through++;
            throughWorst = Math.max(throughWorst, limit - gap);
            throughNames.add(`${settled[road.a]!.name}-${settled[road.b]!.name} through ${settled[j]!.name}`);
          }
        }
      }
      for (let j = 0; j < 6; j++) near[j]!.copy(far[j]!);
    }
  }
  check(
    inside === 0,
    'no ribbon top stands inside either of its own towns’ squares',
    inside === 0
      ? `${vertices.toLocaleString()} section vertices on ${roads.length.toLocaleString()} roads ` +
        `in ${Date.now() - roadsBegan} ms`
      : `${inside} do, worst ${worstInside.toFixed(3)} units in: ${worstInsideName}`,
  );
  check(
    folded === 0,
    'no course turns tighter than its own ribbon is wide',
    folded === 0
      ? `the tightest turn on the network is ${tightestRatio.toFixed(2)} of the drawn half-width it has to carry`
      : `${folded} do, and fold their inner shoulder: ${foldedNames.join(', ')}`,
  );
  check(
    throughWorst <= WATER_PROBE_STEP,
    'no road runs through a town it does not end at',
    `${through} centre-line vertices inside a third town's disc, worst ${throughWorst.toFixed(2)} units ` +
      `against the bake's stride of ${WATER_PROBE_STEP}` +
      (throughNames.size > 0 ? `: ${[...throughNames].slice(0, 4).join(', ')}` : ''),
  );
  check(
    kerbWrong === 0,
    'the ribbon’s end section is at its gate’s paving, gateLevel + GROUND_LIFT',
    `${kerbs.toLocaleString()} crown corners at a kerb, worst ${kerbWorst.toExponential(1)} units off`,
  );
  check(
    overlapping === 0,
    'and its two ramps, one into each gate, never meet',
    `${ramped.toLocaleString()} roads ramp to a gate at RAMP_GRADE, the longest ramp ${longestRamp.toFixed(1)} units, ` +
      `${overlapping} with ramps that meet (the climb itself is asserted under a foot, in made ground)`,
  );
  // Bounded at 0.02% of sections.
  check(
    sagOver < sagSections * 0.0002,
    'the ground stays under the ribbon between its section ends',
    `${sagOver} of ${sagSections.toLocaleString()} sections cut through ` +
      `(${((sagOver / Math.max(1, sagSections)) * 100).toFixed(2)}%), worst ${sagWorst.toFixed(2)} units`,
  );
  console.log(`  --   ${shownCount.toLocaleString()} built places tested against the centre lines`);
}
