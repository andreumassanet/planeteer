/**
 * Headless assertions over `src/life.ts`, everything that moves: whether a car
 * stays on its road, a boat's lap is wet, a walker's feet track the ground,
 * and the same seed and clock make the same world twice.
 *
 * The vehicle registry is read off disk and handed in, because
 * `import.meta.glob` does not exist in Node. Sections live in
 * `scripts/check-life/`.
 *
 *   node scripts/check-life.ts     (or `pnpm life`)
 */
import './check-life/setup.ts';
import './check-life/scale.ts';
import './check-life/streaming.ts';
import './check-life/routes.ts';
import './check-life/movers.ts';
import './check-life/determinism.ts';
import { failures } from './check-life/setup.ts';

console.log(failures === 0 ? 'all good' : `${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);
