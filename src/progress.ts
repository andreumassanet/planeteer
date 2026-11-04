/**
 * The traveller's progression: career stats, XP and the level, the
 * milestones, the Explorer's Path (the guild's quests) and the daily
 * commissions, kept on the device and merged into the account's profile.
 *
 * - `progress/events.ts`: what the game emits.
 * - `progress/stats.ts`: the counters, maxima, sets and days, and their merge.
 * - `progress/achievements.ts`: the seventeen milestones and their tiers.
 * - `progress/path.ts`, `progress/contracts.ts`, `progress/quests.ts`: the path, the guild contracts, and where a traveller stands on them.
 * - `progress/commissions.ts`, `progress/daily.ts`: the day's three commissions and the streaks.
 * - `progress/xp.ts`: the one definition of XP and the level.
 * - `progress/summary.ts`: everything in one value, and the leaderboard's scores.
 * - `progress/store.ts`: the record, its lenient read, its merge, the device's store.
 * - `progress/runtime.ts`, `progress/views.ts`: `createProgress`, the progression at play.
 *
 * The core is pure data and functions: no page, no Three.
 */
export type { MoveMode, ProgressEvent, ProgressEventType } from './progress/events.ts';
export { FREQUENT, MOVE_MODES } from './progress/events.ts';
export type { CountKey, SetName, Stats, StatsDocument } from './progress/stats.ts';
export {
  MAXIMUM_CAPS, MAX_COUNTS, MAX_DAYS, MAX_SETS, MAX_SET_ITEMS, MAX_STEP_METRES, addDay, addTo, applyEvent, bump,
  countOf, emptyStats, hasIn, mergeStats, raise, sizeOf, statsDocument, statsOf, tokenOf,
} from './progress/stats.ts';
export type { Tally } from './progress/tally.ts';
export { tallyOf } from './progress/tally.ts';
export type { Achievement, AchievementId, MilestoneState } from './progress/achievements.ts';
export {
  ACHIEVEMENTS, ACHIEVEMENT_IDS, TIER_NAMES, TIER_XP, achievementById, achievementsOf, milestoneXp, tierOf,
} from './progress/achievements.ts';
export type { Objective, PathId, Quest, QuestId, Standing } from './progress/path.ts';
export { PATH, PATH_IDS, QUESTS, QUEST_IDS, questById } from './progress/path.ts';
export type { ContractId } from './progress/contracts.ts';
export { CONTRACTS } from './progress/contracts.ts';
export type { QuestState, QuestStatus, QuestsDocument } from './progress/quests.ts';
export {
  MAX_QUESTS, accept, advance, emptyQuests, isReady, mergeQuests, offerable, questXp, questsDocument, questsOf,
  settle, statusOf, turnIn, withAuto,
} from './progress/quests.ts';
export type { CommissionKind, Template } from './progress/commissions.ts';
export { DAILY_BONUS, TEMPLATES, XP_PER_MINUTE, distance, templateById } from './progress/commissions.ts';
export type { Commission, DailyDocument, DailyState, DailyStep } from './progress/daily.ts';
export {
  DAILY_COUNT, DAY_MINUTES, DAY_MS, MAX_HISTORY, advanceDaily, commissionsOf, dailyDocument, dailyOf, dayOf,
  doneOf, emptyDaily, mergeDaily, rollDaily, streakOf,
} from './progress/daily.ts';
export type { LevelInfo, XpParts } from './progress/xp.ts';
export {
  COURSE_XP, JOB_XP, LEVEL_XP, RING_XP, STAMP_XP, TOWN_XP, levelInfo, xpForLevel, xpParts, xpTotal,
} from './progress/xp.ts';
export type { ProgressSources, Scores, Summary } from './progress/summary.ts';
export { SCORE_CAP, SCORE_KEYS, scoresOf, summaryOf } from './progress/summary.ts';
export type { CareerDocument, CareerRecord, CareerStorage } from './progress/store.ts';
export {
  CAREER_KEY, careerDocument, careerOf, careerSignature, deviceCareerStore, emptyCareer, mergeCareers, parseCareer,
  readCareer, serialiseCareer, writeCareer,
} from './progress/store.ts';
export type {
  CommissionEntry, Progress, ProgressNotice, ProgressOptions, ProgressRecords, QuestApi, QuestEntry, TodayView,
} from './progress/runtime.ts';
export { createProgress } from './progress/runtime.ts';
