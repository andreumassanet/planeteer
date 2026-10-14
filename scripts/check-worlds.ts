/**
 * Headless assertions over the other worlds: what `src/worlds/` builds when a
 * traveller stands on the Moon, Mars or a giant's cloud deck.
 *
 * Sections, in order (each in `scripts/check-worlds/`):
 *  - contract: Earth's first load stays free of `src/worlds/` and `src/system/`
 *    (main.ts's static import graph), and each cube face's axes are outward;
 *  - ground, actors, settled: each world built twice from its spec, then the
 *    ground, towns, sky, people, craft, saucers, arrivals, roads, outposts
 *    and political map held to the engine's contract;
 *  - shell, leave: the game around a world built over a fake page and taken
 *    down again, and every resource a visit made freed on leaving;
 *  - insides: every craft's cabin against `cabin-contract.ts`.
 *
 *   node scripts/check-worlds.ts [world]     (or `pnpm worlds`)
 */
import './check-worlds/setup.ts';
import './check-worlds/contract.ts';
import './check-worlds/ground.ts';
import './check-worlds/actors.ts';
import './check-worlds/settled.ts';
import './check-worlds/loop.ts';
import './check-worlds/shell.ts';
import './check-worlds/leave.ts';
import './check-worlds/insides.ts';
import { failures } from './check-worlds/setup.ts';

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
