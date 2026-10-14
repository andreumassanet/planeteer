import type { Group, SceneryContext } from '../contract.ts';
import { rngFrom, type Rng } from '../random.ts';
import type { Look } from './look.ts';
import { buildPerson } from './build.ts';

/** How many bodies one region caches. See the note on `personPool`. */
export const PEOPLE_VARIANTS = 24;

export interface Bystander {
  x: number;
  z: number;
  yaw: number;
  /** Stable, and derived from the cell rather than from a counter. */
  seed: number;
}

/**
 * People on a patch of ground, for looking at them together: the review
 * layout, not the world's. Forty at once is the only way repetition becomes
 * visible.
 *
 * A jittered grid, as `plots` is: a cell is an identity, so adding a person
 * does not reshuffle the others. The fill is looser and the yaw completely
 * free, because people do not align to a street as buildings do.
 */
export function crowd(
  seed: number | string,
  options: { radius: number; pitch?: number; fill?: number },
): Bystander[] {
  const radius = options.radius;
  const pitch = options.pitch ?? 3.4;
  const fill = options.fill ?? 0.62;
  const half = Math.ceil(radius / pitch);
  const found: Bystander[] = [];

  for (let row = -half; row <= half; row++) {
    for (let column = -half; column <= half; column++) {
      const rng = rngFrom(seed, column, row, 'bystander');
      if (!rng.chance(fill)) continue;
      const x = column * pitch + rng.jitter() * pitch * 0.42;
      const z = row * pitch + rng.jitter() * pitch * 0.42;
      if (Math.hypot(x, z) > radius) continue;
      found.push({
        x,
        z,
        yaw: rng.unit() * Math.PI * 2,
        seed: Math.floor(rngFrom(seed, column, row, 'who').unit() * 0x7fffffff),
      });
    }
  }
  return found;
}

/**
 * The cached pool a placer draws from.
 *
 * The kit caps a part at `VARIANTS = 6` because a variant costs an instanced
 * mesh; settlements merge instead, so a variant costs only build time. Twenty-
 * four bodies at about 700 triangles is 17,000 triangles and about 11 ms
 * (`pnpm people`), once per region for the session. Six is a crowd where you
 * can name the repeats; unlimited is a build cost per town rather than per
 * region.
 *
 * A caller who wants a specific person (a shopkeeper at a door, a driver in a
 * seat) should call `buildPerson` directly.
 */
export function personPool(
  ctx: SceneryContext,
  make: (rng: Rng, index: number) => Look,
  key: string,
  count = PEOPLE_VARIANTS,
): Group[] {
  const pool: Group[] = [];
  for (let index = 0; index < count; index++) {
    pool.push(buildPerson(ctx, make(rngFrom(key, index, 'person'), index)));
  }
  return pool;
}
