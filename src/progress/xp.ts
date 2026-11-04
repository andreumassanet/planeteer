/**
 * The one definition of a traveller's XP and level. XP is never stored: it
 * is worked out from the records each time, so it only grows as they do and
 * two devices merged agree on it.
 *
 * - every town walked into `TOWN_XP`, every country stamped `STAMP_XP`,
 *   every landmark ring `RING_XP`;
 * - every course by its best medal (`COURSE_XP`);
 * - the jobs' reputation, `JOB_XP` a point (a bronze errand 18, a gold rescue 90);
 * - every milestone tier reached (`TIER_XP`), every quest handed in (its own
 *   XP) and every daily commission done (its own, and the bonus for three,
 *   counted as they were earned in the `daily-xp` counter).
 *
 * The level is the square law of `explorer-level.ts`: level L begins at
 * `LEVEL_XP * (L - 1)^2`, so 40 is level 2, 1,000 level 6, 33,640 level 30
 * and 96,040 level 50.
 */
import { countOf } from './stats.ts';
import type { Stats } from './stats.ts';
import type { Tally } from './tally.ts';

export const TOWN_XP = 10;
export const STAMP_XP = 60;
export const RING_XP = 40;
/** A course's best medal's worth: none, bronze, silver, gold. */
export const COURSE_XP: readonly [number, number, number, number] = [0, 25, 50, 100];
export const JOB_XP = 3;
export const LEVEL_XP = 40;

export interface XpParts {
  towns: number;
  stamps: number;
  rings: number;
  courses: number;
  jobs: number;
  milestones: number;
  quests: number;
  commissions: number;
}

export interface LevelInfo {
  xp: number;
  level: number;
  /** The XP the level began at, and the next one begins at. */
  from: number;
  to: number;
  /** How far from one to the other, 0 to 1. */
  progress: number;
}

/** What each source has given. */
export function xpParts(tally: Tally, milestoneXp: number, questXp: number, stats: Stats): XpParts {
  return {
    towns: tally.towns * TOWN_XP,
    stamps: tally.countries * STAMP_XP,
    rings: tally.landmarks * RING_XP,
    courses: tally.golds * COURSE_XP[3] + tally.silvers * COURSE_XP[2] + tally.bronzes * COURSE_XP[1],
    jobs: tally.reputation * JOB_XP,
    milestones: milestoneXp,
    quests: questXp,
    commissions: Math.floor(countOf(stats, 'daily-xp')),
  };
}

export const xpTotal = (parts: XpParts): number =>
  parts.towns + parts.stamps + parts.rings + parts.courses + parts.jobs + parts.milestones + parts.quests + parts.commissions;

/** The level `xp` reaches, and how far it is to the next. */
export function levelInfo(xp: number): LevelInfo {
  const points = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const level = Math.floor(Math.sqrt(points / LEVEL_XP)) + 1;
  const from = LEVEL_XP * (level - 1) ** 2;
  const to = LEVEL_XP * level ** 2;
  return { xp: points, level, from, to, progress: (points - from) / (to - from) };
}

/** The XP level `level` begins at. */
export const xpForLevel = (level: number): number => LEVEL_XP * Math.max(0, Math.floor(level) - 1) ** 2;
