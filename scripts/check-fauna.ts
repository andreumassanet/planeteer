/**
 * Headless assertions over `src/fauna/`: the land animals and how they walk.
 *
 * A gait bug is a number: the sweep asks that nothing digs below the floor,
 * that something is always standing on it (so a frozen frame of the cycle is
 * safe to merge into a herd), and that every fold is lifting. It also prints a
 * silhouette per animal, because a model that measures correctly and does not
 * look like itself is the failure no table can see. Sections live in
 * `scripts/check-fauna/`.
 *
 *   node scripts/check-fauna.ts     (or `pnpm fauna`)
 */
import './check-fauna/setup.ts';
import './check-fauna/basics.ts';
import './check-fauna/gait.ts';
import './check-fauna/placing.ts';
import './check-fauna/herd.ts';
import './check-fauna/silhouettes.ts';
import './check-fauna/dog.ts';
import { failures } from './check-fauna/setup.ts';

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
