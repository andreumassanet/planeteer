/**
 * Headless measurement of the crowd kit.
 *
 * Cannot go through `src/scenery/index.ts` because that registry is built on
 * `import.meta.glob`, which does not exist in Node, so the two parts are
 * imported by hand.
 */
import './check-people/setup.ts';
import './check-people/contract.ts';
import './check-people/silhouettes.ts';
import './check-people/appearance.ts';
import './check-people/speech.ts';
import './check-people/traveller.ts';
import './check-people/umbrella.ts';
import { failures } from './check-people/setup.ts';

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
