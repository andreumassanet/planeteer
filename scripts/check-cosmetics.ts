/**
 * What a traveller earns to wear, headless (`pnpm cosmetics`): the catalogue
 * and its unlocks, the look code with cosmetics on it read by this build and
 * an older one, every hat on every head and every back piece on every back
 * off the baked cast, the trails' pool, the canopies, the titles and the
 * companion.
 */
import './check-cosmetics/setup.ts';
import './check-cosmetics/catalogue.ts';
import './check-cosmetics/wire.ts';
import './check-cosmetics/models.ts';
import './check-cosmetics/trails.ts';
import './check-cosmetics/extras.ts';
import { failures } from './check-cosmetics/setup.ts';

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
