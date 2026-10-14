/**
 * Headless assertions over the vehicles a player can take (`src/craft/`).
 *
 * Builds every craft in every variant from the baked kit and holds each to
 * `src/craft/contract.ts` and to the body that rides it: declared size equals
 * built box, proper matrices, the ink's normals, a triangle budget, identical
 * bytes from two builds, and every seat over the craft with the hero's body
 * fitting on it. It also re-measures the hero (`HERO` in `src/craft/body.ts`)
 * off the cast, so the table fails on a drift. Sections live in
 * `scripts/check-craft/`.
 *
 *   node scripts/check-craft.ts     (or `pnpm craft`)
 */
import './check-craft/setup.ts';
import './check-craft/models.ts';
import './check-craft/ahead.ts';
import './check-craft/motion.ts';
import './check-craft/cabins.ts';
import './check-craft/hero.ts';
import { failures } from './check-craft/setup.ts';

console.log(failures === 0 ? '\ncraft: all good' : `\ncraft: ${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);
