/**
 * Headless assertions over the solar system.
 *
 * Most of it is arithmetic with a right answer in the real world, so the
 * orbits are checked against things that are not this code: published periods
 * and opposition dates, and `src/sun.ts`, which reaches the Sun's position by
 * another route. Sections live in `scripts/check-system/`: orbits, the night
 * sky, the scale, the worlds' countries and ground, the species, and the
 * decoration.
 *
 * `import.meta.glob` does not exist in Node, so the bodies are read off disk
 * and imported by path; a registry fault (two files exporting one body) is
 * caught by `REGISTRY_PROBLEMS` in a browser instead.
 *
 *   node scripts/check-system.ts     (or `pnpm system`)
 */
import './check-system/setup.ts';
import './check-system/orbits.ts';
import './check-system/sky.ts';
import './check-system/scale.ts';
import './check-system/worlds.ts';
import './check-system/species.ts';
import './check-system/decoration.ts';
import { failures } from './check-system/setup.ts';

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
