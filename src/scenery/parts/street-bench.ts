import type { ScenicPart } from '../contract.ts';
import { PALETTE } from '../../theme.ts';
import { buildBench } from '../../bench.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';

/**
 * A bench on a town's pavement, beside a lamp, its back to the houses and its
 * face to the street — somewhere to sit and watch the town go by, and `E`
 * beside it does (`Player.sitOn`).
 *
 * **Placed by `settlements.ts` and by nothing else**, like `street-lamp`: the
 * town knows where its kerbs and its building lines are, and a region's
 * `scatter` list would hand it to a yard. The model is `bench.ts`'s, the one
 * the countryside's are built from, because its seat is the sitting clip's
 * and a bench a body floats over or sinks into is worse than none. So the
 * instance carries no scale: the variety is the length and the back.
 *
 * Six boxes and three colours at most — 72 triangles against the `scatter`
 * kind's 110.
 */
export const streetBench: ScenicPart = {
  id: 'street-bench',
  name: 'Street bench',
  kind: 'scatter',
  footprint: 1.8,
  note: 'A bench on the pavement beside a lamp, sat on with E.',

  build(ctx, rng) {
    const wood = rng.pick([PALETTE.brown, PALETTE.bark, PALETTE.green, PALETTE.clay]);
    const iron = rng.pick([PALETTE.steel, PALETTE.bark, PALETTE.slate]);
    const length = AVATAR_HEIGHT * rng.range(0.62, 0.84);
    const back = AVATAR_HEIGHT * rng.range(0.2, 0.32);
    return buildBench(ctx, wood, iron === wood ? PALETTE.steel : iron, length, back);
  },
};
