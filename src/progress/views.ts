/**
 * What the runtime shows of the quests and of the day: the Explorer's Path
 * with where each quest stands, a giver's marker, taking and handing in, and
 * today's three commissions with the streaks. Each reads the runtime through
 * `Core`, so `runtime.ts` keeps the state and these keep the views.
 */
import type { GuildRole } from '../guild/roles.ts';
import type { AchievementId } from './achievements.ts';
import { DAILY_BONUS } from './commissions.ts';
import { DAY_MS, commissionsOf, streakOf } from './daily.ts';
import type { Commission } from './daily.ts';
import { QUESTS } from './path.ts';
import type { Quest, QuestId } from './path.ts';
import { accept, isReady, offerable, statusOf, turnIn } from './quests.ts';
import type { QuestState, QuestStatus } from './quests.ts';
import type { CareerRecord } from './store.ts';
import type { Summary } from './summary.ts';

export type ProgressNotice =
  | { t: 'level'; level: number; previous: number }
  | { t: 'milestone'; id: AchievementId; tier: number; title: string }
  | { t: 'quest-taken'; id: QuestId }
  | { t: 'quest-ready'; id: QuestId }
  | { t: 'quest-done'; id: QuestId; xp: number }
  | { t: 'commission'; commission: Commission }
  | { t: 'commissions'; day: number; bonus: number; streak: number }
  /** A new day: three new commissions. */
  | { t: 'day'; day: number }
  /** Anything a card showing the progress would redraw for. */
  | { t: 'change' };

export interface QuestEntry {
  quest: Quest;
  status: QuestStatus;
  objectives: { label: string; done: number; count: number }[];
}

export interface CommissionEntry {
  commission: Commission;
  done: number;
  complete: boolean;
}

export interface TodayView {
  day: number;
  commissions: CommissionEntry[];
  allDone: boolean;
  /** What all three add on top of their own XP. */
  bonus: number;
  /** The run of days with all three done still going, and the longest. */
  streak: number;
  longest: number;
  /** Until the next day's three. */
  resetsInMs: number;
}

export interface QuestApi {
  /** Every quest of the path, or a giver's, with where it stands. */
  list(role?: GuildRole): QuestEntry[];
  available(role?: GuildRole): Quest[];
  active(): QuestEntry[];
  ready(role?: GuildRole): Quest[];
  /** What a giver's marker shows: a quest to hand in, one to take (or `welcome`, waiting), or nothing. */
  marker(role: GuildRole): 'ready' | 'offer' | null;
  accept(id: string): boolean;
  /** Hands a ready quest in: its XP and the level it reached, or null when it was not ready. */
  turnIn(id: string): { xp: number; levelUp: number | null } | null;
}

/** What the views read of the runtime and ask of it. */
export interface Core {
  readonly record: CareerRecord;
  /** The summary last worked out. */
  readonly last: Summary;
  now(): number;
  /** Moves the commissions on to today; today's number. */
  roll(): number;
  setQuests(state: QuestState): void;
  check(): Summary;
  tell(notice: ProgressNotice): void;
}

function entry(core: Core, quest: Quest): QuestEntry {
  const quests = core.record.quests;
  const progress = quests.active.get(quest.id) ?? [];
  const status = statusOf(quests, quest, core.last);
  return {
    quest,
    status,
    objectives: quest.objectives.map((o, i) => ({
      label: o.label,
      done: status === 'done' ? o.target : Math.min(o.target, Math.floor(progress[i] ?? 0)),
      count: o.target,
    })),
  };
}

export function questApi(core: Core): QuestApi {
  const mine = (role: GuildRole | undefined) => QUESTS.filter((q) => role === undefined || q.giver === role);
  return {
    list: (role) => mine(role).map((q) => entry(core, q)),
    available: (role) => offerable(core.record.quests, core.last, role),
    active: () => QUESTS.filter((q) => core.record.quests.active.has(q.id)).map((q) => entry(core, q)),
    ready: (role) => mine(role).filter((q) => isReady(core.record.quests, q.id)),
    marker(role) {
      const quests = core.record.quests;
      if (mine(role).some((q) => isReady(quests, q.id))) return 'ready';
      const waiting = mine(role).some((q) => q.auto === true && quests.active.has(q.id));
      return waiting || offerable(quests, core.last, role).length > 0 ? 'offer' : null;
    },
    accept(id) {
      const next = accept(core.record.quests, id, core.last);
      if (next === null) return false;
      core.setQuests(next);
      core.tell({ t: 'quest-taken', id: id as QuestId });
      // Standing objectives start where the traveller already stands, and say so if that is enough.
      core.check();
      if (isReady(next, id)) core.tell({ t: 'quest-ready', id: id as QuestId });
      core.tell({ t: 'change' });
      return true;
    },
    turnIn(id) {
      const handed = turnIn(core.record.quests, id);
      if (handed === null) return null;
      core.setQuests(handed.state);
      const before = core.last.level;
      core.tell({ t: 'quest-done', id: id as QuestId, xp: handed.xp });
      const after = core.check();
      core.tell({ t: 'change' });
      return { xp: handed.xp, levelUp: after.level > before ? after.level : null };
    },
  };
}

export function todayOf(core: Core): TodayView {
  const day = core.roll();
  const daily = core.record.daily;
  const cells = daily.day === day ? daily.progress : [];
  const commissions = commissionsOf(day).map((commission, i): CommissionEntry => ({
    commission,
    done: Math.min(commission.target, Math.floor(cells[i] ?? 0)),
    complete: (cells[i] ?? 0) >= commission.target,
  }));
  const streak = streakOf(daily, day);
  return {
    day,
    commissions,
    allDone: commissions.every((c) => c.complete),
    bonus: DAILY_BONUS,
    streak: streak.current,
    longest: streak.longest,
    resetsInMs: Math.max(0, (day + 1) * DAY_MS - core.now()),
  };
}
