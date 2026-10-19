/**
 * How much of a settlement is town rather than village, 0 to 1: 0 at ten
 * thousand people, 1 at ten million, logarithmic between. Drives the built
 * core, the plot fill, the house/block mix, the crowd and the parked cars.
 */
export function urbanityOf(pop: number): number {
  return Math.min(1, Math.max(0, (Math.log10(Math.max(1, pop)) - 4) / 2.6));
}

/**
 * How urban a town must be before its region's towers are towers (about
 * 200,000 people); below it `TOWER_PART` is built as `TOWERLESS_PART`.
 */
export const TOWER_URBANITY = 0.5;
