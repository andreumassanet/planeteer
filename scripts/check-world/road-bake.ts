/**
 * The baked road network against the bake's own rules: the ribbon's layers, the graph's shape, and an account of every candidate not kept.
 */
import { check } from './harness.ts';
import { Vector3 } from 'three';
import { toLatLon } from '../../src/geo.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { isShown, radiusOf } from '../../src/places.ts';
import { packedBend } from '../../src/pack.ts';
import {
  carriageEdges,
  dashGives,
  EDGE_KEEP,
  edgeGives,
  edgeLineAcross,
  markingRuns,
  nearestOnPath,
  otherRoadsOf,
  MAX_ROAD_LENGTH,
  ROAD_CLASSES,
  bendFor,
  builtGraph,
  candidateGates,
  chordGap,
  classOf,
  courseOf,
  coursePath,
  coursePoint,
  crossesScree,
  crownLift,
  emptyCourse,
  emptyRamp,
  layersOf,
  outranks,
  pairKey,
  parameterAt,
  pathsOverlap,
  placeDirection,
  rampOf,
  rampReach,
  ribbonHalf,
  ribbonSection,
  ribbonStations,
  roadClearance,
  roadIndexFor,
  tightestTurn,
  townOf,
  townOffset,
  waterProbeSteps,
  landmarkAt,
} from '../../src/roads.ts';
import type { CoursePath, Road, RoadData, RoadRamp } from '../../src/roads.ts';
import type { Place } from '../../src/places.ts';
import type { World } from '../../src/geo.ts';

/**
 * No two roads draw one surface on one depth layer.
 *
 * Overlapping ribbons (two roads into one gate share its approach) are
 * coplanar and z-fight, and heights cannot separate them because both ends meet
 * one paving at one kerb. So every road carries a depth layer (`layersOf`,
 * baked) and the shader pushes each layer back `LAYER_DEPTH`. Asserted twice:
 * the file's layers are `layersOf` of the file; and wherever two roads' crowns
 * cover the same ground within 0.05 units of height (sampled every unit along
 * one, across its crown), they are on different layers with the higher-ranking
 * road in front.
 */
export function checkRibbonLayers(roads: Road[], settled: Place[], world: World): void {
  const began = Date.now();
  const expected = layersOf(roads, settled);
  let misLayered = 0;
  let deepest = 0;
  let layered = 0;
  roads.forEach((road, i) => {
    if (road.layer !== expected[i]) misLayered++;
    if (road.layer > deepest) deepest = road.layer;
    if (road.layer > 0) layered++;
  });
  check(
    misLayered === 0,
    'every road’s depth layer is layersOf the network',
    `${misLayered} differ; ${layered.toLocaleString()} roads drawn behind a road they overlap, ` +
      `the deepest on layer ${deepest}`,
  );

  const scratchCourse = emptyCourse();
  const paths = new Map<number, CoursePath>();
  const pathOf = (i: number): CoursePath => {
    let found = paths.get(i);
    if (found === undefined) {
      found = coursePath(courseOf(roads[i]!, settled, scratchCourse));
      paths.set(i, found);
    }
    return found;
  };
  const rampCache = new Map<number, RoadRamp>();
  const rampFor = (i: number): RoadRamp => {
    let found = rampCache.get(i);
    if (found === undefined) {
      found = rampOf(roads[i]!, courseOf(roads[i]!, settled, scratchCourse), settled, world);
      rampCache.set(i, found);
    }
    return found;
  };
  const index = roadIndexFor(roads, settled);
  const hits: number[] = [];
  const middle = new Vector3();
  const chordA = new Vector3();
  const chordB = new Vector3();
  const across = new Vector3();
  const sample = new Vector3();
  const probe = new Vector3();
  const legStart = new Vector3();
  const leg = new Vector3();
  const foot = new Vector3();
  const nearest = { distance: 0, s: 0, pastCap: false, foot: new Vector3() };
  /** Where a path is nearest a direction: how far off, how far along, and whether past a cap. */
  const nearestOn = (path: CoursePath, direction: Vector3): typeof nearest => {
    nearest.distance = Infinity;
    for (let k = 1; k < path.count; k++) {
      legStart.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!);
      leg.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!).sub(legStart);
      const lengthSq = leg.lengthSq();
      const raw = lengthSq > 0 ? foot.copy(direction).sub(legStart).dot(leg) / lengthSq : 0;
      const along = raw < 0 ? 0 : raw > 1 ? 1 : raw;
      foot.copy(legStart).addScaledVector(leg, along).normalize();
      const distance = foot.distanceTo(direction) * PLANET_RADIUS;
      if (distance < nearest.distance) {
        nearest.distance = distance;
        nearest.s = path.s[k - 1]! + (path.s[k]! - path.s[k - 1]!) * along;
        nearest.pastCap = (k === 1 && raw < 0) || (k === path.count - 1 && raw > 1);
        nearest.foot.copy(foot);
      }
    }
    return nearest;
  };
  const widest = roadClearance(ROAD_CLASSES.length - 1);
  let pairs = 0;
  let samples = 0;
  let coplanar = 0;
  let sameLayer = 0;
  let wrongOrder = 0;
  const sameNames: string[] = [];
  for (let r = 0; r < roads.length; r++) {
    const pathR = pathOf(r);
    const halfR = ROAD_CLASSES[roads[r]!.cls]!.width * 0.5;
    coursePoint(courseOf(roads[r]!, settled, scratchCourse), 0.5, middle);
    for (const q of index.near(middle, pathR.length * 0.5 + roadClearance(roads[r]!.cls) + widest, hits)) {
      if (q <= r) continue;
      const pathQ = pathOf(q);
      const halfQ = ROAD_CLASSES[roads[q]!.cls]!.width * 0.5;
      const reach = halfR + halfQ + 1;
      if (!pathsOverlap(pathR, pathQ, reach)) continue;
      pairs++;
      const rampR = rampFor(r);
      const rampQ = rampFor(q);
      const lowerIsR = outranks(roads, q, r);
      for (let k = 1; k < pathR.count; k++) {
        if (chordGap(pathR, k, pathQ, reach) >= reach) continue;
        chordA.set(pathR.xyz[k * 3 - 3]!, pathR.xyz[k * 3 - 2]!, pathR.xyz[k * 3 - 1]!);
        chordB.set(pathR.xyz[k * 3]!, pathR.xyz[k * 3 + 1]!, pathR.xyz[k * 3 + 2]!);
        across.subVectors(chordB, chordA);
        across.crossVectors(chordA, across).normalize();
        const length = pathR.s[k]! - pathR.s[k - 1]!;
        const steps = Math.max(1, Math.ceil(length));
        for (let j = 0; j <= steps; j++) {
          const sR = pathR.s[k - 1]! + (length * j) / steps;
          sample.copy(chordA).lerp(chordB, j / steps).normalize();
          const crownR = ribbonHalf(rampR, halfR, sR, pathR.length - sR);
          for (const share of [-0.9, 0, 0.9]) {
            probe.copy(sample).addScaledVector(across, (share * crownR) / PLANET_RADIUS).normalize();
            const onQ = nearestOn(pathQ, probe);
            if (onQ.pastCap) continue;
            if (onQ.distance > ribbonHalf(rampQ, halfQ, onQ.s, pathQ.length - onQ.s)) continue;
            samples++;
            const ground = world.elevationAt(probe);
            const liftR = crownLift(rampR, sR, pathR.length - sR, ground, world.elevationAt(sample));
            const liftQ = crownLift(rampQ, onQ.s, pathQ.length - onQ.s, ground, world.elevationAt(onQ.foot));
            if (Math.abs(liftR - liftQ) >= 0.05) continue;
            coplanar++;
            const layerR = roads[r]!.layer;
            const layerQ = roads[q]!.layer;
            if (layerR === layerQ) {
              sameLayer++;
              if (sameNames.length < 4) {
                sameNames.push(`${settled[roads[r]!.a]!.name}-${settled[roads[r]!.b]!.name} / ` +
                  `${settled[roads[q]!.a]!.name}-${settled[roads[q]!.b]!.name}`);
              }
            } else if (lowerIsR ? layerR < layerQ : layerQ < layerR) {
              wrongOrder++;
            }
          }
        }
      }
    }
  }
  check(
    sameLayer === 0 && wrongOrder === 0,
    'no two roads draw one surface on one depth layer',
    `${coplanar.toLocaleString()} coplanar crown samples of ${samples.toLocaleString()} where two crowns ` +
      `cover one spot, on ${pairs.toLocaleString()} pairs of roads; ${sameLayer} on one layer, ` +
      `${wrongOrder} with the lower road in front, in ${Date.now() - began} ms` +
      (sameNames.length > 0 ? `: ${sameNames.join('; ')}` : ''),
  );

  /**
   * And where two ribbons overlap, one set of markings: every road's
   * edge lines and centre dash walked along its near band's own pieces,
   * through the runs the ribbon paints them in (`markingRuns`), and each
   * painted point measured against every other road's centre line on
   * its own. No edge line is further into another road's carriageway than
   * that road's own edge line (`EDGE_KEEP`), and none of it at all inside
   * one drawn in front; no dash is inside a carriageway drawn in front.
   */
  {
    const markBegan = Date.now();
    const stationsM: number[] = [];
    const nearM = Array.from({ length: 6 }, () => new Vector3());
    const farM = Array.from({ length: 6 }, () => new Vector3());
    const nL = new Vector3();
    const nR = new Vector3();
    const fL = new Vector3();
    const fR = new Vector3();
    const centreAt = new Vector3();
    const painted = new Vector3();
    const runsM: number[] = [];
    const nearestM = { distance: 0, s: 0 };
    let roadsMarked = 0;
    let pointsM = 0;
    let edgeInside = 0;
    let dashInside = 0;
    let edgeWorst = 0;
    const edgeNames: string[] = [];
    for (let r = 0; r < roads.length; r++) {
      coursePoint(courseOf(roads[r]!, settled, scratchCourse), 0.5, middle);
      const others = otherRoadsOf(roads, r, index, pathOf, rampFor, middle);
      if (others.length === 0) continue;
      roadsMarked++;
      const course = courseOf(roads[r]!, settled, emptyCourse());
      const path = pathOf(r);
      const ramp = rampFor(r);
      const half = ROAD_CLASSES[roads[r]!.cls]!.width * 0.5;
      ribbonStations(path.length, course.approach, ramp, 18, stationsM);
      for (let k = 1; k < stationsM.length; k++) {
        const s0 = stationsM[k - 1]!;
        const s1 = stationsM[k]!;
        const sm = (s0 + s1) * 0.5;
        coursePoint(course, parameterAt(path, sm), centreAt);
        let close = false;
        for (const other of others) {
          nearestOnPath(other.path, centreAt, nearestM);
          if (nearestM.distance < other.half + 30 + (s1 - s0)) close = true;
        }
        if (!close) continue;
        ribbonSection(world, course, path, ramp, half, s0, nearM);
        ribbonSection(world, course, path, ramp, half, s1, farM);
        carriageEdges(nearM, ribbonHalf(ramp, half, s0, path.length - s0), half, nL, nR);
        carriageEdges(farM, ribbonHalf(ramp, half, s1, path.length - s1), half, fL, fR);
        const length = s1 - s0;
        for (const [across, gives, dash] of [
          [0.5, dashGives, true], [edgeLineAcross(half, false), edgeGives, false], [edgeLineAcross(half, true), edgeGives, false],
        ] as const) {
          const runs = markingRuns(others, nL, nR, fL, fR, across, gives, runsM);
          for (let q = 0; q < runs.length; q += 2) {
            const a0 = runs[q]! + 0.1 / length;
            const a1 = runs[q + 1]! - 0.1 / length;
            if (a1 <= a0) continue;
            for (let j = 0; j <= 8; j++) {
              const along = a0 + ((a1 - a0) * j) / 8;
              painted.copy(nL).lerp(nR, across).lerp(centreAt.copy(fL).lerp(fR, across), along).normalize();
              pointsM++;
              for (const other of others) {
                const on = nearestOn(other.path, painted);
                if (on.pastCap) continue;
                const deep = other.half - on.distance;
                if (dash) {
                  if (other.front && deep > 0.05 + 0.02) dashInside++;
                } else if (deep > (other.front ? 0.05 : EDGE_KEEP) + 0.02) {
                  edgeInside++;
                  edgeWorst = Math.max(edgeWorst, deep);
                  if (edgeNames.length < 3) {
                    edgeNames.push(`${settled[roads[r]!.a]!.name}-${settled[roads[r]!.b]!.name}`);
                  }
                }
              }
            }
          }
        }
      }
    }
    check(
      edgeInside === 0 && dashInside === 0 && pointsM > 0,
      'where two ribbons overlap one set of markings shows: no edge line or dash inside the other road’s carriageway',
      `${roadsMarked.toLocaleString()} roads beside another, ${pointsM.toLocaleString()} painted points walked; ` +
        `${edgeInside} edge-line points inside (worst ${edgeWorst.toFixed(2)}), ${dashInside} dash points inside a road in front, ` +
        `in ${Date.now() - markBegan} ms` + (edgeNames.length > 0 ? `: ${edgeNames.join('; ')}` : ''),
    );
  }
}

/**
 * The shape of the graph, as a line to read and one band.
 *
 * Counted over the built towns and not over `places.bin`, which is the
 * only vertex set the network has now: averaging a degree over every row
 * would divide by three times the towns that can carry a road and say
 * nothing about the map. A mean near two is a chain and near six is a
 * hairball; the band is unchanged at 2.8 to 4.5 and has never been widened.
 * The median is the number that matters — a town needs a few roads out of
 * it, not twenty — and it is 4.
 */
export function checkGraphShape(settled: Place[], roads: Road[], baked: RoadData): void {
  const degree = new Int32Array(settled.length);
  for (const road of roads) {
    degree[road.a]!++;
    degree[road.b]!++;
  }
  const builtDegrees = settled
    .map((place, i) => (isShown(place) ? degree[i]! : -1))
    .filter((d) => d >= 0)
    .sort((x, y) => x - y);
  const sum = builtDegrees.reduce((total, d) => total + d, 0);
  const mean = sum / builtDegrees.length;
  const isolated = builtDegrees.filter((d) => d === 0).length;
  const peak = builtDegrees[builtDegrees.length - 1]!;
  console.log(
    `  --   ${baked.graph} graph over ${builtDegrees.length.toLocaleString()} built towns · ` +
      `mean degree ${mean.toFixed(2)} · median ${builtDegrees[builtDegrees.length >> 1]} · ` +
      `p90 ${builtDegrees[Math.floor(builtDegrees.length * 0.9)]} · max ${peak} · ` +
      `${isolated} with no road · ` +
      ROAD_CLASSES.map((c, i) => `${c.name} ${roads.filter((r) => r.cls === i).length}`).join(' · '),
  );
  check(
    mean > 2.8 && mean < 4.5,
    'the graph is a network rather than a chain or a hairball',
    `mean degree ${mean.toFixed(2)} over the built towns`,
  );

  /**
   * No road leaves an island: the water test working.
   *
   * The network is baked over the built towns and `PROMINENCE_RADIUS` leaves
   * Palma as the only one on Mallorca, so a flood fill from it reaches Palma
   * alone. It still guards the day the thinning admits a second Balearic town:
   * whatever the fill reaches must stay in the archipelago. The counter-case
   * below keeps the assertion from passing on an empty network.
   */
  const indexOf = (name: string): number => settled.findIndex((place) => place.name === name);
  const byPlace: number[][] = settled.map(() => []);
  for (const road of roads) {
    byPlace[road.a]!.push(road.b);
    byPlace[road.b]!.push(road.a);
  }
  const palma = indexOf('Palma');
  let escaped = '';
  let reached = 0;
  if (palma >= 0) {
    const seen = new Uint8Array(settled.length);
    const queue = [palma];
    seen[palma] = 1;
    while (queue.length > 0) {
      const at = queue.pop()!;
      reached++;
      // The Balearics span roughly 38.6..40.2 N, 1.1..4.4 E; anything the fill
      // reaches outside that box got there over the sea.
      const place = settled[at]!;
      if (place.lat < 38.5 || place.lat > 40.3 || place.lon < 1 || place.lon > 4.5) {
        escaped ||= `${place.name} (${place.iso})`;
      }
      for (const next of byPlace[at]!) {
        if (seen[next]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  check(
    palma >= 0 && escaped === '',
    'no road leaves the Balearics for the mainland',
    palma < 0
      ? 'Palma is not in places.bin'
      : escaped !== ''
        ? `the network reaches ${escaped}`
        : `${reached} place${reached === 1 ? '' : 's'} reachable from Palma, all of them islands`,
  );
  // And the counter-case, or the check above would pass on a network with no
  // roads in it at all: Iceland has several towns and they are joined.
  const reykjavik = indexOf('Reykjavík');
  check(
    reykjavik >= 0 && degree[reykjavik]! > 0,
    'Iceland’s towns are joined to each other',
    reykjavik < 0 ? 'Reykjavik is not in places.bin' : `degree ${degree[reykjavik]}`,
  );
}

/**
 * Every endpoint is a town you can walk into, and the ground let the road be
 * built.
 *
 * - Both ends of every road are built (`isShown`), so there are no dead ends
 *   at unbuilt villages and no road that ends in a field.
 * - No road crosses ground steeper than `MAX_SLOPE`. The course is re-walked
 *   rather than trusted: if the bake's `bend` and gates ever drift from what
 *   it tested, a road could climb a scree face. `crossesScree` is `roads.ts`'s
 *   and asks `terrain.ts`'s one definition of steepness.
 * - The bake accounts for every candidate it did not keep. The graph is a pure
 *   function of `places.bin`, so the check builds it again, gives each
 *   candidate its gates (`candidateGates`) and asks the file to explain each
 *   missing pair on its own seeded bow: no open gate, gates too far apart in
 *   height, or a course that is wet, back through its own square, through a
 *   third town or steep. The bake also searches bows and gates, so a pair
 *   dropped after a search this does not repeat reads as refused and passes.
 * - The rows that are not candidates are the rescue: a town the Gabriel graph
 *   leaves isolated gets one road to its nearest reachable neighbour, so every
 *   extra row must be somebody's only road.
 */
export function checkBakeAccounting(roads: Road[], settled: Place[], world: World): void {
  const began = Date.now();
  let unbuilt = 0;
  const unbuiltNames: string[] = [];
  for (const road of roads) {
    if (isShown(settled[road.a]!) && isShown(settled[road.b]!)) continue;
    unbuilt++;
    if (unbuiltNames.length < 5) unbuiltNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
  }
  check(
    unbuilt === 0,
    'both ends of every road are a town that is built',
    unbuilt === 0
      ? `${roads.length.toLocaleString()} roads over ${settled.filter((p) => isShown(p)).length.toLocaleString()} built places`
      : `${unbuilt} join something that is not: ${unbuiltNames.join(', ')}`,
  );

  let steep = 0;
  const steepNames: string[] = [];
  for (const road of roads) {
    if (!crossesScree(road, settled)) continue;
    steep++;
    if (steepNames.length < 5) steepNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
  }
  check(
    steep === 0,
    'and none of them crosses ground steeper than MAX_SLOPE',
    steep === 0 ? `re-walked in ${Date.now() - began} ms` : `${steep} do: ${steepNames.join(', ')}`,
  );
  // Nor through a landmark: the course keeps `LANDMARK_KEEP` off every
  // model's plan, so the Alhambra's roads come to Granada's free gates and
  // not through the palace.
  const throughLandmark: string[] = [];
  for (const road of roads) {
    if (landmarkAt(road, settled) < 0) continue;
    throughLandmark.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
  }
  check(
    throughLandmark.length === 0,
    'and none of them runs through a landmark',
    throughLandmark.length > 0 ? `${throughLandmark.length} do: ${throughLandmark.slice(0, 5).join(', ')}` : '',
  );

  const shipped = new Set<number>();
  for (const road of roads) shipped.add(pairKey(settled.length, road.a, road.b));
  const candidates = builtGraph(settled, 'gabriel', MAX_ROAD_LENGTH);
  const candidateKeys = new Set<number>();
  for (const edge of candidates) candidateKeys.add(pairKey(settled.length, edge.a, edge.b));
  const given = candidateGates(settled, candidates, world);

  const course = emptyCourse();
  const ramp = emptyRamp();
  const offset = { x: 0, z: 0 };
  const at = new Vector3();
  const townAt = new Vector3();
  const bowProbe = { a: 0, b: 0, cls: 0, bend: 0, gateA: 0, gateB: 0, layer: 0, bridgeFrom: 0, bridgeTo: 0 };
  /** The bake's refusals, re-asked on the candidate's own gates and seeded bow. */
  const refusedOnItsOwn = (edge: { a: number; b: number }, gateA: number, gateB: number): boolean => {
    if (gateA < 0 || gateB < 0) return true;
    bowProbe.a = edge.a;
    bowProbe.b = edge.b;
    bowProbe.cls = classOf(settled[edge.a]!, settled[edge.b]!);
    bowProbe.bend = packedBend(bendFor(settled[edge.a]!, settled[edge.b]!));
    bowProbe.gateA = gateA;
    bowProbe.gateB = gateB;
    courseOf(bowProbe, settled, course);
    rampOf(bowProbe, course, settled, world, ramp);
    if (rampReach(ramp.riseA) + rampReach(ramp.riseB) > course.length) return true;
    if (tightestTurn(coursePath(course)) < roadClearance(bowProbe.cls)) return true;
    const towns = [townOf(settled[edge.a]!), townOf(settled[edge.b]!)];
    const margin = Math.min(roadClearance(bowProbe.cls), course.approach);
    const steps = waterProbeSteps(course);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      coursePoint(course, t, at);
      const { lat, lon } = toLatLon(at);
      if (world.countryAt(lat, lon) === 0) return true;
      if (t > course.share && t < 1 - course.share) {
        for (const town of towns) {
          townOffset(town, at, offset);
          const reach = town.grid.half + margin;
          if (Math.abs(offset.x) < reach && Math.abs(offset.z) < reach) return true;
        }
      }
      // A third town, by the same disc the bake refuses: every built place
      // within a thousand units is few enough to ask directly here.
    }
    for (const [j, place] of settled.entries()) {
      if (j === edge.a || j === edge.b || !isShown(place)) continue;
      placeDirection(place, townAt);
      if (townAt.dot(course.gateA) < 0.998) continue;
      const limit = radiusOf(place);
      for (let step = 0; step <= steps; step++) {
        coursePoint(course, step / steps, at);
        if (at.angleTo(townAt) * PLANET_RADIUS < limit) return true;
      }
    }
    if (landmarkAt(bowProbe, settled) >= 0) return true;
    return crossesScree(bowProbe, settled);
  };

  let missing = 0;
  let unexplained = 0;
  const unexplainedNames: string[] = [];
  candidates.forEach((edge, i) => {
    if (shipped.has(pairKey(settled.length, edge.a, edge.b))) return;
    missing++;
    if (refusedOnItsOwn(edge, given[i * 2]!, given[i * 2 + 1]!)) return;
    unexplained++;
    if (unexplainedNames.length < 5) unexplainedNames.push(`${settled[edge.a]!.name}-${settled[edge.b]!.name}`);
  });
  check(
    unexplained === 0,
    'every candidate the bake did not keep was refused on its own gates and bow',
    unexplained === 0
      ? `${missing.toLocaleString()} of ${candidates.length.toLocaleString()} candidates missing, all of them refused`
      : `${unexplained} were not: ${unexplainedNames.join(', ')}`,
  );

  const degree = new Int32Array(settled.length);
  for (const road of roads) {
    degree[road.a]!++;
    degree[road.b]!++;
  }
  let extra = 0;
  let extraWithoutNeed = 0;
  for (const road of roads) {
    if (candidateKeys.has(pairKey(settled.length, road.a, road.b))) continue;
    extra++;
    if (degree[road.a]! > 1 && degree[road.b]! > 1) extraWithoutNeed++;
  }
  // Bounded at a quarter of a percent of the candidates.
  check(
    extraWithoutNeed === 0 && extra < candidates.length * 0.0025,
    'and every road that is not a candidate is somebody’s only road',
    `${extra} rescues, ${extraWithoutNeed} of them joining two towns that already had one`,
  );

  let alone = 0;
  let aloneBig = 0;
  const aloneNames: string[] = [];
  for (let i = 0; i < settled.length; i++) {
    if (!isShown(settled[i]!) || degree[i]! > 0) continue;
    alone++;
    if (radiusOf(settled[i]!) < 55) continue;
    aloneBig++;
    if (aloneNames.length < 6) aloneNames.push(settled[i]!.name);
  }
  /**
   * The towns left with no road, bounded rather than argued away.
   *
   * A town may have no road when a mountain or water lies across every
   * neighbour, no built town is within `MAX_ROAD_LENGTH`, or every gate is in
   * the sea or on ground too steep to cut. Each is a rule doing its job. The
   * share is bounded at 8% so a re-bake has room and a rule that stopped
   * joining anything does not.
   */
  check(
    alone < settled.filter((p) => isShown(p)).length * 0.08,
    'the towns left with no road are the ones the ground refuses',
    `${alone.toLocaleString()} of ${settled.filter((p) => isShown(p)).length.toLocaleString()} built ` +
      `(${((alone / settled.filter((p) => isShown(p)).length) * 100).toFixed(1)}%), ` +
      `${aloneBig} of them over a 55-unit radius: ${aloneNames.join(', ')}`,
  );
}
