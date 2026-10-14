import './movers.ts';
import { createLife, mergeGroup, rigOf, poseAt } from '../../src/life.ts';
import { type Spot, cameraAt, spots } from './streaming.ts';
import { setDetail } from '../../src/view.ts';
import { dirAt, world, places, roads, check } from './setup.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { vehicles } from './scale.ts';
import { PLACED_SECTION, placedScale, placedSize } from '../../src/traffic/contract.ts';
import { BODY_SCALE } from '../../src/stature.ts';

// --- determinism ----------------------------------------------------------
//
// Two worlds, same seed, same clock. The same shape of check `pnpm people` and
// `pnpm traffic` already make, one level up: not "does one body rebuild the
// same" but "does the whole cast".

console.log('determinism:');
function census(instance: ReturnType<typeof createLife>, at: Spot, clock: number): string {
  setDetail(1);
  const dir = dirAt(at.lat, at.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + at.altitude);
  const camera = cameraAt(dir, at.altitude);
  for (let i = 0; i < 40; i++) instance.update(viewer, at.altitude, camera, clock);
  const rows: string[] = [];
  for (const child of instance.group.children) {
    if (!child.visible) continue;
    if (child.name === 'birds') {
      // One mesh for the whole sky, so its identity is its buffer.
      const mesh = child as unknown as { geometry: { drawRange: { count: number }; attributes: { position: { array: Float32Array } } } };
      const count = mesh.geometry.drawRange.count * 3;
      let sum = 0;
      for (let i = 0; i < count; i++) sum = (sum * 31 + Math.round(mesh.geometry.attributes.position.array[i]! * 64)) % 1e12;
      rows.push(`birds@${count}:${sum}`);
      continue;
    }
    rows.push(
      `${child.name}@${child.position.x.toFixed(3)},${child.position.y.toFixed(3)},${child.position.z.toFixed(3)}` +
      `/${child.quaternion.x.toFixed(4)},${child.quaternion.y.toFixed(4)},${child.quaternion.z.toFixed(4)},${child.quaternion.w.toFixed(4)}`,
    );
  }
  rows.sort();
  return rows.join('|');
}
const first = createLife(world, places, { roads, vehicles });
const second = createLife(world, places, { roads, vehicles });
let same = 0;
let differ = 0;
for (const at of spots.slice(0, 4)) {
  const a = census(first, at, 1_234_567);
  const b = census(second, at, 1_234_567);
  if (a === b && a.length > 0) same++;
  else differ++;
  if (a !== b) console.log(`  differs at ${at.name}`);
}
check(differ === 0 && same === 4, 'two worlds at the same instant are the same world', `${same} of 4 places identical`);

// And the same instant reached two different ways: jumped straight to, or
// arrived at after a day of updates. Nothing integrates, so **every mover the
// two have in common has to be in exactly the same place.**
//
// The two casts are *not* the same set and that is correct rather than a
// failure: admission depends on where a mover was when the scan ran, and one
// world scanned a day earlier. What would be a bug is a shared mover in two
// different places, which is what integrating state instead of evaluating it
// looks like.
const jumped = new Map(census(createLife(world, places, { roads, vehicles }), spots[0]!, 2_000_000).split('|').map((row) => [row.split('@')[0]!, row]));
const walked = (() => {
  const instance = createLife(world, places, { roads, vehicles });
  const dir = dirAt(spots[0]!.lat, spots[0]!.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + 3);
  const camera = cameraAt(dir, 3);
  for (let s = 0; s < 86_400; s += 900) instance.update(viewer, 3, camera, 2_000_000 - 86_400 + s);
  return new Map(census(instance, spots[0]!, 2_000_000).split('|').map((row) => [row.split('@')[0]!, row]));
})();
let shared = 0;
let apart = 0;
for (const [key, row] of jumped) {
  const other = walked.get(key);
  if (other === undefined) continue;
  shared++;
  if (other !== row) apart++;
}
// At least three in common: the census round one spot holds four or five movers.
check(shared >= 3 && apart === 0, 'a mover arrived at by a day of frames is where a cold start puts it', `${shared} shared, ${apart} apart`);
console.log('');

// --- the merge ------------------------------------------------------------
//
// `mergeGroup` bakes the placed scale into the vertices, and the reason it is
// the inverse transpose and not the rotation is a bus scaled 2 x 2 x 1.35.

console.log('the merge:');
const bus = vehicles.find((entry) => entry.id === 'city-bus');
if (bus !== undefined) {
  const { createTrafficContext } = await import('../../src/traffic/contract.ts');
  const { rngFrom } = await import('../../src/scenery/random.ts');
  const ctx = createTrafficContext();
  const built = bus.build(ctx, rngFrom(bus.id, 'check', 0), (await import('../../src/traffic/regions.ts')).TRAFFIC_STYLES['atlantic-europe']!);
  const plain = mergeGroup(built);
  // Not the placed scale: the bus is a baked model short enough that the length
  // cap does not bind, so its placed scale is uniform, and a uniform scale
  // cannot test the normal matrix.
  built.scale.set(PLACED_SECTION, PLACED_SECTION, PLACED_SECTION * 0.675);
  const skewed = mergeGroup(built);
  built.scale.set(...placedScale(bus));
  const scaled = mergeGroup(built);
  let worstNormal = 0;
  for (let i = 0; i < skewed.normal.length; i += 3) {
    const length = Math.hypot(skewed.normal[i]!, skewed.normal[i + 1]!, skewed.normal[i + 2]!);
    worstNormal = Math.max(worstNormal, Math.abs(length - 1));
  }
  check(worstNormal < 1e-5, 'every normal of a non-uniformly scaled merge is still unit', `worst ${worstNormal.toExponential(1)}`);
  check(plain.triangles === scaled.triangles, 'scaling changes no triangle count', `${scaled.triangles}`);
  // The bounding box has to be the declared placed size, which is the whole
  // contract a placer reads.
  let minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < scaled.position.length; i += 3) {
    minZ = Math.min(minZ, scaled.position[i + 2]!);
    maxZ = Math.max(maxZ, scaled.position[i + 2]!);
    minX = Math.min(minX, scaled.position[i]!);
    maxX = Math.max(maxX, scaled.position[i]!);
    maxY = Math.max(maxY, scaled.position[i + 1]!);
  }
  const size = placedSize(bus);
  check(Math.abs(maxZ - minZ - size[0]) < 0.4, 'a placed bus is as long as it says', `${(maxZ - minZ).toFixed(2)} against ${size[0].toFixed(2)}`);
  check(Math.abs(maxX - minX - size[1]) < 0.4, 'and as wide', `${(maxX - minX).toFixed(2)} against ${size[1].toFixed(2)}`);
  check(Math.abs(maxY - size[2]) < 0.4, 'and as tall', `${maxY.toFixed(2)} against ${size[2].toFixed(2)}`);
}
console.log('');

// --- the rig --------------------------------------------------------------
//
// `rigOf` finds the joints of a body `people.ts` built and never named. It
// throws when the structure moves, which is the point, but a check that only
// says "it did not throw" would pass on a rig where the elbow and the hip had
// swapped. So the joints are moved and the effect is measured.

console.log('the rig:');
{
  const { createSceneryContext } = await import('../../src/scenery/contract.ts');
  const { buildPerson } = await import('../../src/scenery/people.ts');
  const { lookFor } = await import('../../src/scenery/dress.ts');
  const { rngFrom } = await import('../../src/scenery/random.ts');
  const ctx = createSceneryContext();
  const person = buildPerson(ctx, lookFor(rngFrom('rig', 'check'), 'atlantic-europe', { pose: 'walk' }));
  const rig = rigOf(person);
  const before = mergeGroup(person);
  // Swing one hip by a radian. Only the leg on that side may move, and it has
  // to move by about a leg length.
  rig.hips[0]!.rotation.x = 1;
  person.updateMatrixWorld(true);
  const after = mergeGroup(person);
  let moved = 0;
  let worst = 0;
  for (let i = 0; i < before.position.length; i += 3) {
    const d = Math.hypot(
      after.position[i]! - before.position[i]!,
      after.position[i + 1]! - before.position[i + 1]!,
      after.position[i + 2]! - before.position[i + 2]!,
    );
    if (d > 0.01) moved++;
    worst = Math.max(worst, d);
  }
  const share = moved / (before.position.length / 3);
  check(share > 0.08 && share < 0.35, 'swinging one hip moves one leg and nothing else', `${(share * 100).toFixed(1)}% of vertices`);
  check(worst > 1.5 * BODY_SCALE && worst < 4 * BODY_SCALE, 'and moves it about a leg length', `${worst.toFixed(2)} units`);

  // The bob is the re-seat, and it has to be there: a walk with a flat head is
  // a person on rails.
  let low = Infinity;
  let high = -Infinity;
  for (let phase = 0; phase < 64; phase++) {
    poseAt(rig, (phase / 64) * Math.PI * 2, 0);
    person.updateMatrixWorld(true);
    const merged = mergeGroup(person);
    let crown = -Infinity;
    for (let i = 1; i < merged.position.length; i += 3) crown = Math.max(crown, merged.position[i]!);
    low = Math.min(low, crown);
    high = Math.max(high, crown);
  }
  check(high - low > 0.05 * BODY_SCALE && high - low < 0.6 * BODY_SCALE, 'the head bobs over a cycle', `${(high - low).toFixed(3)} units`);
}
console.log('');
