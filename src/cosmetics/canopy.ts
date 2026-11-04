/**
 * The parachute canopies' colours: which palette colour each of the canopy's
 * cells is, by the look's `canopy` (`CANOPIES` in `catalogue.ts`).
 *
 * A pattern is either mirrored (centre to tip, the same on both sides, as
 * the canopy everyone starts with) or a run of stripes across the whole span.
 * Pure data and one function, so the parachute (`craft/parachute.ts`), the
 * card's pictures and the checks read the same colours.
 */
import { PALETTE } from '../theme.ts';
import { CANOPIES } from './catalogue.ts';

type Pattern = { mirrored: readonly number[] } | { across: readonly number[] };

/** The canopy everyone starts with: gold at the centre to crimson at the tips. */
const SUNSET: Pattern = { mirrored: [PALETTE.gold, PALETTE.apricot, PALETTE.orange, PALETTE.red, PALETTE.crimson] };

/** By catalogue id. */
const PATTERNS: Readonly<Record<string, Pattern>> = {
  'canopy-sky': { across: [PALETTE.skyBlue, PALETTE.white] },
  'canopy-lagoon': { mirrored: [PALETTE.white, PALETTE.skyBlue, PALETTE.green, PALETTE.skyBlue, PALETTE.green] },
  'canopy-meadow': { mirrored: [PALETTE.gold, PALETTE.olive, PALETTE.green, PALETTE.olive, PALETTE.darkOlive] },
  'canopy-chequer': { across: [PALETTE.red, PALETTE.white] },
  'canopy-candy': { mirrored: [PALETTE.white, PALETTE.pink, PALETTE.cream, PALETTE.pink, PALETTE.violet] },
  'canopy-night': { mirrored: [PALETTE.gold, PALETTE.violet, PALETTE.slate, PALETTE.violet, PALETTE.slate] },
  'canopy-rainbow': { across: [PALETTE.red, PALETTE.orange, PALETTE.gold, PALETTE.olive, PALETTE.green, PALETTE.skyBlue, PALETTE.slate, PALETTE.violet, PALETTE.pink] },
  'canopy-royal': { mirrored: [PALETTE.gold, PALETTE.crimson, PALETTE.gold, PALETTE.crimson, PALETTE.gold] },
};

/** The pattern of a look's `canopy`: 0, or one this build has not got, is the sunset. */
function patternOf(canopy: number): Pattern {
  const item = canopy >= 1 ? CANOPIES[canopy - 1] : undefined;
  return (item === undefined ? undefined : PATTERNS[item.id]) ?? SUNSET;
}

/** The colour of cell `cell` of `cells`, left tip to right, on canopy `canopy`. */
export function canopyCell(canopy: number, cell: number, cells: number): number {
  const pattern = patternOf(canopy);
  if ('mirrored' in pattern) {
    const half = Math.floor(cells / 2);
    const list = pattern.mirrored;
    return list[Math.min(list.length - 1, Math.abs(cell - half))]!;
  }
  return pattern.across[cell % pattern.across.length]!;
}

/** Whether every canopy in the catalogue has a pattern. */
export const PATTERNED = CANOPIES.every((item) => PATTERNS[item.id] !== undefined);
