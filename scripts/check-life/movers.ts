import './routes.ts';
import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { world, places, roads, dirAt, check } from './setup.ts';
import { createLife } from '../../src/life.ts';
import { vehicles, life } from './scale.ts';
import { setDetail } from '../../src/view.ts';
import { spots, cameraAt } from './streaming.ts';

// --- giving way -----------------------------------------------------------
//
// A vehicle that finds something standing in its lane stops short of it,
// sounds its horn if it is the player, and drives on once it is gone. The
// obstacle is put where the vehicle will be: a second world, the same world by
// determinism, run a second and a half ahead, says where that is.

console.log('giving way:');
{
  const streets = {
    floorAt: (direction: Vector3) => PLANET_RADIUS + Math.max(0, world.elevationAt(direction)) + 3,
    blocked: () => false,
  };
  const held = createLife(world, places, { roads, vehicles, streets });
  const twin = createLife(world, places, { roads, vehicles, streets });
  setDetail(3);
  const spot = spots[0]!;
  const dir = dirAt(spot.lat, spot.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + spot.altitude);
  const STEP = 0.05;
  const START = 5_000_000;
  const AHEAD = 30;
  for (let frame = 0; frame < 40; frame++) held.update(viewer, spot.altitude, undefined, START + frame * STEP, STEP);
  for (let frame = 0; frame < 40 + AHEAD; frame++) twin.update(viewer, spot.altitude, undefined, START + frame * STEP, STEP);
  type Drawn = { name: string; position: Vector3; visible: boolean; geometry?: { boundingBox: { min: Vector3; max: Vector3 } | null; computeBoundingBox(): void }; matrixWorld: import('three').Matrix4; updateMatrixWorld(force?: boolean): void };
  const drawnIn = (instance: ReturnType<typeof createLife>, name: string): Drawn | undefined =>
    instance.group.children.find((child) => child.name === name && child.visible) as unknown as Drawn | undefined;
  // A vehicle on the road near the viewer, drawn now and a second and a half on.
  let chosen: string | null = null;
  const obstacleAt = new Vector3();
  for (const child of held.group.children) {
    if (!child.visible || !child.name.startsWith('road:') || child.position.distanceTo(viewer) > 350) continue;
    const later = drawnIn(twin, child.name);
    if (later === undefined) continue;
    const moved = later.position.distanceTo(child.position);
    if (moved < 25) continue;
    chosen = child.name;
    obstacleAt.copy(later.position);
    break;
  }
  check(chosen !== null, 'a vehicle near the viewer to stand something in front of', chosen ?? 'none drawn');
  if (chosen !== null) {
    const RADIUS = 1.3;
    let standing = true;
    let horns = 0;
    held.setInTheWay({
      each(visit) {
        if (standing) visit(obstacleAt, RADIUS, true);
      },
      horn: () => horns++,
    });
    // How far the obstacle is outside the vehicle's box, in the box's own frame.
    const local = new Vector3();
    const inverse = new (await import('three')).Matrix4();
    const outside = (car: Drawn, at = obstacleAt, radius = RADIUS): number => {
      car.updateMatrixWorld(true);
      const geometry = car.geometry!;
      if (geometry.boundingBox === null) geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      local.copy(at).applyMatrix4(inverse.copy(car.matrixWorld).invert());
      const dx = Math.max(box.min.x - local.x, 0, local.x - box.max.x);
      const dz = Math.max(box.min.z - local.z, 0, local.z - box.max.z);
      return Math.hypot(dx, dz) - radius;
    };
    /**
     * What it stopped short of: the obstacle, or a vehicle that stopped for it
     * first and stands between — then it is queued, and the gap that counts is
     * the one to the vehicle in front, whose half-width is `QUEUED`.
     */
    const QUEUED = 1.2;
    const stoppedShort = (car: Drawn): number => {
      let gap = outside(car);
      for (const other of held.group.children) {
        if (!other.visible || other.name === chosen || !other.name.startsWith('road:')) continue;
        if (other.position.distanceTo(obstacleAt) > other.position.distanceTo(car.position) + 1) continue;
        if (other.position.distanceTo(car.position) > 15) continue;
        gap = Math.min(gap, outside(car, other.position, QUEUED));
      }
      return gap;
    };
    let closest = Infinity;
    let clock = START + 40 * STEP;
    let last = drawnIn(held, chosen)!.position.clone();
    let restingSpeed = Infinity;
    let restingGap = Infinity;
    let hornsBy = 0;
    let passed = false;
    for (let frame = 0; frame < 200; frame++) {
      held.update(viewer, spot.altitude, undefined, clock, STEP);
      clock += STEP;
      const car = drawnIn(held, chosen);
      if (car === undefined) continue;
      closest = Math.min(closest, outside(car));
      const speed = car.position.distanceTo(last) / STEP;
      last = car.position.clone();
      // Stopped, before it has waited long enough to think of passing.
      if (frame === 55) {
        restingSpeed = speed;
        restingGap = stoppedShort(car);
      }
      if (frame > 60 && speed > 1 && local.z < -1) passed = true;
    }
    hornsBy = horns;
    check(closest > 0, 'a vehicle never runs into something standing in its lane', `${closest.toFixed(2)} units clear at the closest`);
    check(restingSpeed < 0.2 && restingGap < 4, 'it stops, within its stopping distance of it',
      `${restingSpeed.toFixed(2)} units a second, ${restingGap.toFixed(2)} units short of it`);
    check(hornsBy >= 1, 'and sounds its horn at the player it waits behind', `${hornsBy} in 10 s`);
    console.log(`  ${passed ? 'it pulled out and went past it after waiting' : 'it waited: the other lane was not free'}; ${held.stats.delayed.toFixed(1)} s behind its route`);
    standing = false;
    const from = last.clone();
    for (let frame = 0; frame < 60; frame++) {
      held.update(viewer, spot.altitude, undefined, clock, STEP);
      clock += STEP;
    }
    const after = drawnIn(held, chosen);
    const onward = after === undefined ? Infinity : after.position.distanceTo(from);
    check(onward > 15, 'and drives on once it is clear', `${onward.toFixed(1)} units in 3 s`);
  }
  setDetail(1);
}
console.log('');

// --- one second of the clock ----------------------------------------------
//
// The one thing a still frame cannot show, as a table. Everything here is a
// pure function of the clock, so a second of it is a displacement, and each
// family has a speed it is supposed to have. The walker also has to swap the
// geometry it is drawn from — a rigid body sliding along the ground is the
// moonwalk `people.ts` warned about, and this is the assertion that it is not
// happening.

console.log('what one second of the clock moves:');
{
  setDetail(1);
  const at = spots[1]!;
  const dir = dirAt(at.lat, at.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + at.altitude);
  const camera = cameraAt(dir, at.altitude);
  for (let i = 0; i < 60; i++) life.update(viewer, at.altitude, camera, 3_000_000);
  const snap = (): Map<string, { p: Vector3; g: string }> => {
    const map = new Map<string, { p: Vector3; g: string }>();
    for (const child of life.group.children) {
      if (!child.visible || child.name === 'birds') continue;
      map.set(child.name, { p: child.position.clone(), g: (child as unknown as { geometry: { uuid: string } }).geometry.uuid });
    }
    return map;
  };
  /**
   * The median of five short steps rather than one displacement over a tenth
   * of a second. A route is out and back, so at each end the mover reverses and
   * crosses to the other side of the carriageway (`chainFrame`): a real jump of
   * twice its lateral offset, up to about ten units on a lane. Over a tenth of
   * a second that reads as a speed far above a walker's, a sampling artefact
   * that depends on the window alone:
   *
   * ```
   *   window    foot movers
   *   0.5 s     5.4 to 40.4    the turn averaged away again
   *   0.1 s    31.4 to 74.2    one mover happened to turn inside it
   *   0.02 s   31.4 to 43.3
   *   0.004 s  31.4 to 43.3    the speed, with nothing else in it
   * ```
   *
   * A mover turns at most once in a tenth of a second, so at most one of its
   * five 0.02 s samples carries the jump and the median cannot be it. The
   * bands then assert the speed the tables set.
   */
  const SPEED_STEP = 0.02;
  const SPEED_STEPS = 5;
  const moved = new Map<string, number[]>();
  {
    life.update(viewer, at.altitude, camera, 3_000_000);
    let previous = snap();
    const track = new Map<string, number[]>();
    for (let step = 1; step <= SPEED_STEPS; step++) {
      life.update(viewer, at.altitude, camera, 3_000_000 + step * SPEED_STEP);
      const now = snap();
      for (const [name, was] of previous) {
        const there = now.get(name);
        if (there === undefined) continue;
        const list = track.get(name) ?? [];
        list.push(was.p.distanceTo(there.p) / SPEED_STEP);
        track.set(name, list);
      }
      previous = now;
    }
    for (const [name, list] of track) {
      if (list.length < SPEED_STEPS) continue;
      list.sort((x, y) => x - y);
      const family = name.split(':')[0]!;
      if (!moved.has(family)) moved.set(family, []);
      moved.get(family)!.push(list[list.length >> 1]!);
    }
  }

  // A tenth of a second, not a whole one: a walker covers about a whole stride
  // cycle in a second (`WALK_STRIDE`) and can land back in the pose he started
  // from, which is an artefact of the sample rate and not a still walker.
  life.update(viewer, at.altitude, camera, 3_000_000.2);
  const before = snap();
  life.update(viewer, at.altitude, camera, 3_000_000.3);
  const after = snap();
  let swapped = 0;
  let walkers = 0;
  for (const [name, was] of before) {
    const now = after.get(name);
    if (now === undefined) continue;
    if (name.split(':')[0] === 'foot') {
      walkers++;
      if (was.g !== now.g) swapped++;
    }
  }
  // The bands are the speed tables with the short-route cap under them: a chain
  // that cannot reach `MIN_ROUTE` is travelled in `MIN_SECONDS` instead, so the
  // floor is not the class speed. The ceiling is the class speed with room to
  // spare: a mover reads a measured `coursePath` now, so there is no bow ripple
  // left in it (`arcParameter` had taken it from 15% to 3%), and a walker's
  // crossing of a town between two gates is hidden for exactly the time its
  // streets take, so the jump from one gate to the next is never faster than
  // the walk. A vehicle drives it (see *through a town*); here, with no floor
  // handed in, a vehicle in a town is hidden, and a road mover's median can be
  // a car stopped in a turn, which that section measures instead.
  const wanted: Record<string, [number, number]> = {
    road: [0, 130], foot: [1.5, 10], water: [10, 25],
  };
  for (const [family, list] of moved) {
    list.sort((a, b) => a - b);
    const low = list[0] ?? 0;
    const high = list.at(-1) ?? 0;
    const band = wanted[family];
    console.log(`  ${family.padEnd(6)} ${String(list.length).padStart(3)} movers, ${low.toFixed(1)} to ${high.toFixed(1)} units a second`);
    if (band !== undefined) {
      check(list.length > 0 && low >= band[0] && high <= band[1], `a ${family} mover travels ${band[0]} to ${band[1]} units a second`);
    }
  }
  console.log(`  ${swapped} of ${walkers} walkers took a new pose in a tenth of a second`);
  check(walkers === 0 || swapped >= walkers - 1, 'a walker takes a new pose within a tenth of a second, so nothing moonwalks');
}
console.log('');

// --- a whole day at 600x --------------------------------------------------
//
// `atlas.sky.setRate(600)` runs ten minutes a second, and every mover here is a
// pure function of that clock. A day is 86,400 seconds of it, and the thing
// worth asserting is that nothing in the arithmetic drifts, wraps wrong or goes
// to NaN when the number gets large.

console.log('a day of movement, run at 600x:');
const dayStart = Date.now();
const spot = spots[0]!;
setDetail(1);
const dayDir = dirAt(spot.lat, spot.lon);
const dayViewer = dayDir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dayDir)) + 3);
const dayCamera = cameraAt(dayDir, 3);
let finite = true;
let seenPositions = 0;
const seenKeys = new Set<string>();
for (let second = 0; second < 86_400; second += 60) {
  life.update(dayViewer, 3, dayCamera, 1_000_000 + second);
  for (const child of life.group.children) {
    if (!child.visible) continue;
    // The flock is one mesh for the whole sky and its vertices carry the
    // positions, so the object itself sits at the origin. It is checked below.
    if (child.name === 'birds') continue;
    seenPositions++;
    if (!Number.isFinite(child.position.x + child.position.y + child.position.z)) finite = false;
    if (Math.abs(child.position.length() - PLANET_RADIUS) > 900) finite = false;
    seenKeys.add(child.name);
  }
}
check(finite, 'every mover stays finite and on the planet over a whole day', `${seenPositions.toLocaleString()} placements, ${seenKeys.size} distinct movers`);
console.log(`  ${((Date.now() - dayStart) / 1000).toFixed(1)} s for 1,440 updates`);
console.log('');
