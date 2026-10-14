import { Vector3 } from 'three';
import { emptyFrame, roadFrameOf, createLife } from '../../src/life.ts';
import { emptyCourse, courseOf, coursePath, ROAD_CLASSES, coursePoint, parameterAt } from '../../src/roads.ts';
import { roads, places, world, check, dirAt } from './setup.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { type StreetPose, driveThrough, streetCost, streetPose } from '../../src/through.ts';
import { radiusOf } from '../../src/places.ts';
import { townGrid, gatesOf, mainStreetHalf, THROUGH_HALF_WIDTH, onThroughRoad } from '../../src/scenery/grid.ts';
import { vehicles } from './scale.ts';
import { setDetail } from '../../src/view.ts';
import { spots } from './streaming.ts';

// --- the routes -----------------------------------------------------------
//
// Everything below reads the route mathematics directly rather than the
// streamer, because what has to be true is a property of the curve: a car on
// its own road, a boat on water, a walker on the ground.

console.log('the routes:');

const onCurve = new Vector3();
const probe = emptyFrame();
const probeCourse = emptyCourse();

/**
 * How far a lateral offset actually lands from the road's own centreline.
 *
 * A car is placed by stepping `lateral / PLANET_RADIUS` along `up x forward`
 * from the curve and re-normalising, which is a chord and not an arc — so the
 * question is whether the error is anything at the widths a road uses. It is
 * `r(1 - cos(theta))` and theta is 9 units of 16,000.
 */
let worstLateral = 0;
let worstWet = 0;
let sampled = 0;
for (let i = 0; i < roads.length; i += 137) {
  const road = roads[i]!;
  const course = courseOf(road, places, probeCourse);
  const path = coursePath(course);
  const width = ROAD_CLASSES[road.cls]!.width;
  const lateral = width * 0.26;
  for (let s = 0; s <= 10; s++) {
    const along = (path.length * s) / 10;
    coursePoint(course, parameterAt(path, along), onCurve);
    // The real function, not a copy of it: `roadFrameOf` is what a vehicle
    // drives on, and a check written against a second copy of the curve would
    // agree with itself the way every mirrored basis in this project has.
    roadFrameOf(course, path, along, lateral, probe);
    const measured = probe.dir.angleTo(onCurve) * PLANET_RADIUS;
    worstLateral = Math.max(worstLateral, Math.abs(measured - lateral));
    // Over water only on its bridge, where it drives the deck.
    if (world.elevationAt(probe.dir) <= 0 && !(along > road.bridgeFrom && along < road.bridgeTo)) worstWet++;
    sampled++;
  }
}
check(worstLateral < 0.01, 'a lane offset lands where it was asked to', `worst error ${worstLateral.toFixed(5)} units over ${sampled} samples`);
console.log(`  ${worstWet} of ${sampled} sampled road positions are over water (${((worstWet / sampled) * 100).toFixed(2)}%)`);
// A road is baked never to cross the sea, but a vehicle sits a quarter of a
// carriageway off the centreline and the check is what says that still holds.
check(worstWet / sampled < 0.01, 'a vehicle on the verge is on land or a bridge, over the whole network');

/**
 * The ground under a walker, sampled along a coastal road at the rate the clock
 * actually moves him.
 *
 * The shore is a ramp now and `reliefAt` goes to -16, so the question is not
 * whether the ground moves but whether it moves smoothly enough that a figure
 * placed on it does not visibly step. `STEP_DOWN` in `player.ts` is
 * `LAND_HEIGHT * 0.5` = 10, which is the line the *player* is held to.
 */
let worstStep = 0;
let steps = 0;
for (let i = 0; i < roads.length; i += 613) {
  const road = roads[i]!;
  const course = courseOf(road, places, probeCourse);
  const path = coursePath(course);
  const length = path.length;
  if (length < 40) continue;
  // 0.75 units a step, measured along the path a mover actually reads: a frame
  // moves a mover from a walker's pace (`WALK_SPEED`, 6.5, spread down to about
  // 4.5) to 50 units a second, 0.08 to 0.83 units a frame.
  let previous: number | null = null;
  for (let along = 0; along <= length; along += 0.75) {
    coursePoint(course, parameterAt(path, along), onCurve);
    const elevation = world.elevationAt(onCurve);
    if (elevation <= 0) { previous = null; continue; }
    if (previous !== null) {
      worstStep = Math.max(worstStep, Math.abs(elevation - previous));
      steps++;
    }
    previous = elevation;
  }
}
check(worstStep < 3, 'the ground under a walker never steps more than three units in a frame', `worst ${worstStep.toFixed(2)} over ${steps.toLocaleString()} frames`);

console.log('');

// --- through a town -------------------------------------------------------
//
// A car drives the main streets between a town's gates, and turns round in one where its
// route ends (`through.ts`) — so the plan of every drive is asserted against
// the square it is laid in: the car's whole width on the street paving, clear
// of every building plot, which a street band never is; inside the through
// carriageway the town keeps clear of parked cars and people once the lane
// change at the gate is done; and no jump anywhere along it. The heights are
// the standing town's floor, which only the browser has.

console.log('through a town:');
{
  const pose: StreetPose = { x: 0, z: 0, fx: 0, fz: 1, mx: 0, mz: 1 };
  const before: StreetPose = { x: 0, z: 0, fx: 0, fz: 1, mx: 0, mz: 1 };
  const LANE = 7.2 * 0.26;
  let drives = 0;
  let turns = 0;
  let samples = 0;
  let offPaving = 0;
  let offCarriage = 0;
  let worstJump = 0;
  let worstTurn = 0;
  let worstOut = 0;
  const regions = new Map<string, number>([['atlantic-europe', 9.75], ['mediterranean', 7.5], ['polar', 12]]);
  const seen = new Set<number>();
  for (let i = 0; i < roads.length && seen.size < 120; i += 41) {
    for (const town of [roads[i]!.a, roads[i]!.b]) {
      const radius = radiusOf(places[town]!);
      if (seen.has(radius)) continue;
      seen.add(radius);
      const grid = townGrid(radius);
      const gates = gatesOf(grid);
      for (const street of regions.values()) {
        const half = mainStreetHalf(grid, street);
        for (const side of [1, -1]) {
          for (let from = 0; from < gates.length; from++) {
            for (let to = 0; to < gates.length; to++) {
              const legs = driveThrough(grid, gates, from, to, half, LANE, side);
              if (legs === null) continue;
              if (from === to) turns++;
              else drives++;
              const cost = streetCost(legs);
              const steps = Math.ceil(cost / 0.25);
              for (const back of from === to ? [false] : [false, true]) {
                for (let k = 0; k <= steps; k++) {
                  streetPose(legs, (k / steps) * cost, back, pose);
                  if (k > 0) {
                    worstJump = Math.max(worstJump, Math.hypot(pose.x - before.x, pose.z - before.z));
                    worstTurn = Math.max(worstTurn, Math.acos(Math.max(-1, Math.min(1, pose.fx * before.fx + pose.fz * before.fz))));
                  }
                  Object.assign(before, pose);
                  samples++;
                  // The car's width, across the way it faces.
                  const blend = Math.abs(pose.x) > grid.half - 6.5 || Math.abs(pose.z) > grid.half - 6.5;
                  for (const across of [-THROUGH_HALF_WIDTH, 0, THROUGH_HALF_WIDTH]) {
                    const x = pose.x + pose.fz * across;
                    const z = pose.z - pose.fx * across;
                    worstOut = Math.max(worstOut, Math.max(Math.abs(x), Math.abs(z)) - grid.half);
                    // At the gate the lane changes from the road's to the
                    // street's, over `LANE_BLEND`: the centre line is what has
                    // to be on the paving there, and the car's width beyond it.
                    if (blend && across !== 0) continue;
                    const paving = Math.min(Math.abs(x), Math.abs(z)) <= half + 1e-6;
                    if (!paving) offPaving++;
                    else if (!blend && !onThroughRoad(x, z, half, 1e-6)) offCarriage++;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  console.log(
    `  ${seen.size} squares, ${drives} drives and ${turns} turns laid out, ${samples.toLocaleString()} samples; ` +
    `worst step ${worstJump.toFixed(2)} units in 0.25 of route, worst turn ${(worstTurn * 180 / Math.PI).toFixed(1)} degrees`,
  );
  check(drives > 0 && turns > 0, 'towns are driven through and turned round in');
  check(offPaving === 0, 'a vehicle in a town is on its street paving, never on a plot', `${offPaving} of ${samples} samples off it`);
  check(offCarriage === 0, 'and past the gate inside the carriageway the town keeps clear', `${offCarriage} outside it`);
  check(worstOut <= 1e-6, 'and never past the edge of the square', `worst ${worstOut.toFixed(3)} past it`);
  check(worstJump < 0.5 && worstTurn < 0.35, 'and never jumps or snaps round on the way',
    `${worstJump.toFixed(2)} units and ${(worstTurn * 180 / Math.PI).toFixed(1)} degrees in the worst quarter-unit of route`);

  // And driven: a world whose towns all stand, on a stand-in floor three
  // units over the ground, and a quarter of an hour of the clock at twenty
  // frames a second. Every vehicle drawn in two frames running has moved
  // along the ground no faster than a road allows and turned no faster than a
  // car can, in town or out of it. How high it rides in a town is the real
  // floor's, which the browser has and this does not.
  const floored = createLife(world, places, {
    roads, vehicles,
    streets: {
      floorAt: (direction) => PLANET_RADIUS + Math.max(0, world.elevationAt(direction)) + 3,
      blocked: () => false,
    },
  });
  setDetail(3);
  const spot = spots[0]!;
  const dir = dirAt(spot.lat, spot.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + spot.altitude);
  const was = new Map<string, { p: Vector3; q: Vector3 }>();
  const up = new Vector3();
  // The fastest a vehicle is asked to go: a trunk's 50 and its seeded spread
  // of 16% (`ROAD_SPEED` in `life.ts`).
  const ROAD_TOP = 50 * 1.16;
  let inTown = 0;
  let turning = 0;
  let driven = 0;
  let fastest = 0;
  let sharpest = 0;
  const STEP = 0.05;
  for (let frame = 0; frame < 900 * 20; frame += 1) {
    floored.update(viewer, spot.altitude, undefined, 4_000_000 + frame * STEP, STEP);
    inTown += floored.stats.inTown;
    driven += floored.stats.road;
    turning += floored.stats.turning;
    for (const child of floored.group.children) {
      if (!child.visible || !child.name.startsWith('road:')) continue;
      const facing = new Vector3(0, 0, 1).applyQuaternion(child.quaternion);
      const last = was.get(child.name);
      if (last !== undefined) {
        // Along the ground: the height in a town here is the stand-in floor,
        // and the ribbon climbs to the real one at the gate.
        const moved = child.position.clone().sub(last.p);
        moved.addScaledVector(up, -moved.dot(up.copy(last.p).normalize()));
        fastest = Math.max(fastest, moved.length() / STEP);
        sharpest = Math.max(sharpest, last.q.angleTo(facing) / STEP);
      }
      was.set(child.name, { p: child.position.clone(), q: facing });
    }
    for (const name of [...was.keys()]) {
      if (!floored.group.children.some((child) => child.name === name && child.visible)) was.delete(name);
    }
  }
  setDetail(1);
  console.log(
    `  driven at Ulm: ${driven.toLocaleString()} vehicle-frames, ${inTown.toLocaleString()} on a town's streets, ` +
    `${turning.toLocaleString()} turning round; ` +
    `fastest ${fastest.toFixed(1)} units a second, sharpest turn ${(sharpest * 180 / Math.PI).toFixed(0)} degrees a second`,
  );
  check(inTown > 0 && turning > 0, 'vehicles drive into the towns and turn round in them, drawn');
  check(fastest < ROAD_TOP * 1.25, 'and no vehicle jumps, on a road, in a town or turning', `${fastest.toFixed(1)} against ${ROAD_TOP}`);
  check(sharpest < 540 * Math.PI / 180, 'and none snaps round', `${(sharpest * 180 / Math.PI).toFixed(0)} degrees a second`);
}
console.log('');
