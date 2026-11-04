/**
 * A traveller in one value: the tally of every record, the milestones it
 * reaches, the quests done, the streaks, the XP by source and the level.
 * It is what the wardrobe's unlocks read (it has `UnlockSummary`'s shape),
 * what the Field Guide shows, and what the leaderboard's scores are taken
 * from (`scoresOf`).
 */
import type { PassportData } from '../passport.ts';
import type { RingRecord } from '../rings/store.ts';
import type { JobRecord } from '../jobs/store.ts';
import { achievementsOf, milestoneXp } from './achievements.ts';
import type { MilestoneState } from './achievements.ts';
import { streakOf } from './daily.ts';
import { questXp } from './quests.ts';
import type { CareerRecord } from './store.ts';
import { tallyOf } from './tally.ts';
import type { Tally } from './tally.ts';
import { levelInfo, xpParts, xpTotal } from './xp.ts';
import type { LevelInfo, XpParts } from './xp.ts';

/** What the summary is worked out from: a profile has this shape. */
export interface ProgressSources {
  passport: PassportData;
  rings: RingRecord;
  jobs: JobRecord;
  career: CareerRecord;
}

export interface Summary {
  tally: Tally;
  milestones: readonly MilestoneState[];
  /** Milestone id to the tier reached, 0 to 3. */
  achievements: ReadonlyMap<string, number>;
  /** Quest ids handed in. */
  quests: ReadonlySet<string>;
  /** The longest run of consecutive days with every commission done, and the run that is still going. */
  streak: number;
  currentStreak: number;
  xp: number;
  xpParts: XpParts;
  level: number;
  levelInfo: LevelInfo;
}

/** The summary of `sources`; `today` (a day number) dates the current streak, the career's own day by default. */
export function summaryOf(sources: ProgressSources, today?: number): Summary {
  const { career } = sources;
  const tally = tallyOf({ passport: sources.passport, rings: sources.rings, jobs: sources.jobs, stats: career.stats });
  const milestones = achievementsOf(tally);
  const parts = xpParts(tally, milestoneXp(milestones), questXp(career.quests.done), career.stats);
  const info = levelInfo(xpTotal(parts));
  const streak = streakOf(career.daily, today ?? career.daily.day);
  return {
    tally,
    milestones,
    achievements: new Map(milestones.map((m) => [m.id, m.tier])),
    quests: new Set(career.quests.done),
    streak: streak.longest,
    currentStreak: streak.current,
    xp: info.xp,
    xpParts: parts,
    level: info.level,
    levelInfo: info,
  };
}

/** What the leaderboard ranks by, every one a whole number that only grows. */
export interface Scores {
  xp: number;
  level: number;
  countries: number;
  landmarks: number;
  golds: number;
  reputation: number;
  towns: number;
}

export const SCORE_KEYS: readonly (keyof Scores)[] = ['xp', 'level', 'countries', 'landmarks', 'golds', 'reputation', 'towns'];

/** The largest a score may be, as `merge_progress` clamps it. */
export const SCORE_CAP = 1e9;

export function scoresOf(sources: ProgressSources): Scores {
  const summary = summaryOf(sources);
  const whole = (v: number): number => Math.floor(Math.min(SCORE_CAP, Math.max(0, v)));
  return {
    xp: whole(summary.xp),
    level: whole(summary.level),
    countries: whole(summary.tally.countries),
    landmarks: whole(summary.tally.landmarks),
    golds: whole(summary.tally.golds),
    reputation: whole(summary.tally.reputation),
    towns: whole(summary.tally.towns),
  };
}
