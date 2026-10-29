/**
 * The traveller's level, earned by what the passport holds: the towns walked
 * into and the countries stamped. The HUD's frame and the title both show it.
 */

/** What a town and a stamp are worth, and the points the first level up costs; each level after costs more, as a square. */
const TOWN_POINTS = 10;
const STAMP_POINTS = 60;
const LEVEL_POINTS = 40;

/** The level a passport reaches, and how far it is to the next, 0 to 1. */
export function levelOf(stamps: number, towns: number): { level: number; progress: number } {
  const points = towns * TOWN_POINTS + stamps * STAMP_POINTS;
  const level = Math.floor(Math.sqrt(Math.max(0, points) / LEVEL_POINTS)) + 1;
  const from = LEVEL_POINTS * (level - 1) ** 2;
  const to = LEVEL_POINTS * level ** 2;
  return { level, progress: (points - from) / (to - from) };
}
