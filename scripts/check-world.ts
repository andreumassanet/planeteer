/**
 * Headless checks over the baked data, the land mesh and everything built on
 * it: countries, coasts, monuments, settlements, roads and the towns' ground.
 * Data errors are invisible in a screenshot and obvious in a table, so run
 * this after a bake or after touching `geo.ts`, `globe.ts` or `terrain.ts`.
 *
 *   node scripts/check-world.ts
 *
 * The suites live in `scripts/check-world/` and run in a fixed order: some
 * print measurements the others do not depend on, but the output is compared
 * run to run.
 */
import { failureCount } from './check-world/harness.ts';
import { loadContext } from './check-world/context.ts';
import { checkWire } from './check-world/wire.ts';
import { checkHandedness, checkNoHandConversions } from './check-world/handedness.ts';
import { checkFacts, checkFlags, checkLakes, checkPlaces, checkQueryCost } from './check-world/countries.ts';
import { checkMesh } from './check-world/mesh.ts';
import { checkShore, checkShoreRamp, printElevations } from './check-world/sea.ts';
import { checkMonumentModels, checkMonuments } from './check-world/monuments.ts';
import { checkFoundations } from './check-world/monument-foundations.ts';
import { checkSettlements } from './check-world/towns.ts';
import { checkBiomes } from './check-world/biomes.ts';
import { checkRoads } from './check-world/roads.ts';
import { checkTime } from './check-world/time.ts';
import { checkFrontiers, checkMapLayer } from './check-world/frontiers.ts';
import { checkMadeGround } from './check-world/made-ground.ts';
import { checkRelay } from './check-world/relay.ts';

const ctx = await loadContext();

await checkWire(ctx);
checkHandedness(ctx);
checkNoHandConversions();
checkPlaces(ctx);
checkFlags(ctx);
checkFacts(ctx);
checkLakes(ctx);

const mesh = checkMesh(ctx);
checkShore(ctx, mesh);
checkShoreRamp(ctx);
printElevations(ctx);

await checkMonuments(ctx);
await checkFoundations(ctx);
checkMonumentModels();
checkSettlements(ctx);
checkBiomes(ctx);
await checkRoads(ctx);
checkTime(ctx);
checkMapLayer(ctx, mesh);
checkFrontiers(ctx);
await checkMadeGround(ctx);
checkRelay();
checkQueryCost(ctx);

const failures = failureCount();
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
