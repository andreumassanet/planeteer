import { resolve } from 'node:path';
import { here, countFailure, check, world, places, roads } from './setup.ts';
import { type Vehicle, placedSize, PLACED_LENGTH_CAP, PLACED_SECTION } from '../../src/traffic/contract.ts';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FIGURE } from '../../src/avatar.ts';
import { ROAD_CLASSES } from '../../src/roads.ts';
import { createLife } from '../../src/life.ts';

// --- the vehicle registry, off disk ---------------------------------------

const PARTS = resolve(here, '../src/traffic/parts');
export const vehicles: Vehicle[] = [];
for (const file of readdirSync(PARTS).filter((name) => name.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(PARTS, file)).href)) as Record<string, unknown>;
  for (const value of Object.values(module)) {
    if (typeof value === 'object' && value !== null && typeof (value as Vehicle).build === 'function') {
      vehicles.push(value as Vehicle);
    }
  }
}

// --- placed scale ---------------------------------------------------------
//
// The kit is authored at `SCENERY_SCALE` and placed at `PLACED_SECTION` times
// it, cropped in length past `PLACED_LENGTH_CAP`. Both halves of that are checked here rather
// than in `check-traffic.ts`, which is about the kit as authored.

console.log('placed scale:');
// `air` is exempt from the placed scale — a balloon's size is not decided by
// the person in the basket — so the cap is a road-and-water rule.
const grounded = vehicles.filter((entry) => entry.kind !== 'air');
const byLength = [...grounded].sort((a, b) => placedSize(a)[0] - placedSize(b)[0]);
let cropped = 0;
for (const entry of byLength) {
  const size = placedSize(entry);
  if (size[0] > PLACED_LENGTH_CAP + 1e-6) countFailure();
  if (entry.size[0] * PLACED_SECTION > PLACED_LENGTH_CAP + 1e-6) cropped++;
}
console.log(
  `  ${grounded.length} vehicles, longest placed ${placedSize(byLength.at(-1)!)[0].toFixed(1)}, ` +
  `${cropped} cropped by the ${PLACED_LENGTH_CAP}-unit cap`,
);
check(
  byLength.every((entry) => placedSize(entry)[0] <= PLACED_LENGTH_CAP + 1e-6),
  'no placed vehicle is longer than the cap',
);
// A car roof between a person's chest and crown. The hatchback is placed as
// the craft that takes it (`Vehicle.section`), the least size at which the
// hero sits under its roof: about 3.3 against a crown at 3.77.
const hatchback = vehicles.find((entry) => entry.id === 'hatchback');
check(
  hatchback !== undefined && placedSize(hatchback)[2] > FIGURE.chestY && placedSize(hatchback)[2] < FIGURE.height,
  'a placed hatchback\'s roof is between a person\'s chest and crown',
  hatchback ? placedSize(hatchback).map((n) => n.toFixed(2)).join(' x ') : '',
);
// And every class is a two-lane road: two cars pass on the narrowest of them.
if (hatchback !== undefined) {
  const width = placedSize(hatchback)[1];
  const narrowest = Math.min(...ROAD_CLASSES.map((entry) => entry.width));
  check(width * 2 + 0.6 <= narrowest, 'two placed cars pass on every class of road', `${(width * 2 + 0.6).toFixed(2)} in ${narrowest}`);
}
console.log('');

// --- the walk -------------------------------------------------------------
//
// `life.ts` copies one line out of `avatar.ts` — the knee's driver — because
// `avatar.ts` does not export it. This is what pays for that: the failure a
// wrong driver produces is a foot through the floor, and it is one number.

export const life = createLife(world, places, { roads, vehicles });
const walk = life.verify();
console.log('the walk cycle:');
console.log(`  ${walk.bodies} bodies x ${walk.phases} phases, worst dip below the floor ${walk.worstDip.toFixed(4)}`);
check(walk.worstDip > -0.01, 'no foot ever leaves the floor by more than a hundredth of a unit');
console.log('');
