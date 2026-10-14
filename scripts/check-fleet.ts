/**
 * The vehicles you can take, headless: where every one stands by default, and
 * whether it stands somewhere a vehicle can.
 *
 * The sites are a pure function of the baked world (`fleet.ts`), so this builds
 * them twice and asks for the same answer, then asks each kind the question its
 * medium poses: a car on its road and out of every town's square, a launch on
 * open water, a plane and a balloon on flat land clear of towns, roads and
 * landmarks, a plane at the end of an airstrip its take-off run fits, all clear
 * of the wood. Sections live in `scripts/check-fleet/`.
 *
 *   node scripts/check-fleet.ts     (or `pnpm fleet`)
 */
import './check-fleet/setup.ts';
import './check-fleet/sites.ts';
import './check-fleet/cars.ts';
import './check-fleet/fields.ts';
import './check-fleet/placing.ts';
import './check-fleet/rockets.ts';
import './check-fleet/link.ts';
import './check-fleet/ride.ts';
import { failures } from './check-fleet/setup.ts';

console.log(failures === 0 ? '\nall fleet checks passed' : `\n${failures} fleet check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
