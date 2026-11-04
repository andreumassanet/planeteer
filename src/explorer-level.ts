/**
 * The traveller's level by what the passport holds alone: the towns walked
 * into and the countries stamped. The whole progression's level, which
 * counts everything else too, is `levelInfo` in `progress/xp.ts`; both are
 * the one curve, and a town and a stamp are worth the same in each.
 */
import { STAMP_XP, TOWN_XP, levelInfo } from './progress/xp.ts';

/** The level a passport reaches, and how far it is to the next, 0 to 1. */
export function levelOf(stamps: number, towns: number): { level: number; progress: number } {
  const { level, progress } = levelInfo(towns * TOWN_XP + stamps * STAMP_XP);
  return { level, progress };
}

/** Where the device keeps the last XP the progression worked out, for the title screen to read before it arrives. */
const XP_KEY = 'atlas.career.xp';
let known: number | null = null;

/** The progression's XP as it last stood, or null before it has ever run here. */
export function knownXp(): number | null {
  if (known !== null) return known;
  try {
    const stored = Number(localStorage.getItem(XP_KEY));
    if (Number.isFinite(stored) && stored > 0) known = stored;
  } catch {
    // No storage: the passport's own level stands in.
  }
  return known;
}

/** Keeps the progression's XP for the title screen and the HUD's frame. */
export function setKnownXp(xp: number): void {
  if (known === xp) return;
  known = xp;
  try {
    localStorage.setItem(XP_KEY, String(Math.floor(xp)));
  } catch {
    // Kept for this visit only.
  }
}

/** The level for a passport, or for the whole progression's XP where it has run. */
export function travellerLevel(stamps: number, towns: number): { level: number; progress: number } {
  const xp = knownXp();
  if (xp === null) return levelOf(stamps, towns);
  const { level, progress } = levelInfo(Math.max(xp, towns * TOWN_XP + stamps * STAMP_XP));
  return { level, progress };
}
