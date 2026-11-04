/**
 * The progression at play: it holds the career, takes the game's events
 * (`emit`), keeps the stats, the quests and the day's commissions moving,
 * writes the record a moment after it changes, and tells whoever listens
 * what was reached: a level, a milestone's tier, a quest ready or handed
 * in, a commission done, all three done.
 *
 * The passport, the rings and the jobs live in their own stores; it reads
 * them through `records` whenever the level is worked out, so an event that
 * reports one of them (a stamp, a ring, a job) is emitted once its record
 * holds it. Nothing here throws into the game's loop, touches the page or
 * draws anything. The quests' and the day's views are `views.ts`.
 */
import type { GuildRole } from '../guild/roles.ts';
import type { PassportData } from '../passport.ts';
import { emptyPassport } from '../passport.ts';
import type { RingRecord } from '../rings/store.ts';
import { emptyRecord } from '../rings/store.ts';
import type { JobRecord } from '../jobs/store.ts';
import { emptyJobs } from '../jobs/store.ts';
import type { MilestoneState } from './achievements.ts';
import { DAILY_BONUS } from './commissions.ts';
import { advanceDaily, dayOf, rollDaily, streakOf } from './daily.ts';
import { FREQUENT } from './events.ts';
import type { ProgressEvent } from './events.ts';
import { advance, withAuto } from './quests.ts';
import { applyEvent, bump, hasIn } from './stats.ts';
import { deviceCareerStore, emptyCareer, mergeCareers, readCareer, writeCareer } from './store.ts';
import type { CareerRecord, CareerStorage } from './store.ts';
import { summaryOf } from './summary.ts';
import type { Summary } from './summary.ts';
import { questApi, todayOf } from './views.ts';
import type { Core, ProgressNotice, QuestApi, TodayView } from './views.ts';
import type { LevelInfo } from './xp.ts';

export type { CommissionEntry, ProgressNotice, QuestApi, QuestEntry, TodayView } from './views.ts';

/** The records kept elsewhere that the level is worked out from. */
export interface ProgressRecords {
  passport: PassportData;
  rings: RingRecord;
  jobs: JobRecord;
}

export interface ProgressOptions {
  /** The passport, the rings and the jobs as they stand now. */
  records(): ProgressRecords;
  /** Where the career is kept: the device's store by default, null for none. */
  storage?: CareerStorage | null;
  /** The clock, ms since the epoch: the day's commissions turn over on it. */
  now?(): number;
  /** How long after a change the record is written; 0 or less writes at once. */
  writeDelayMs?: number;
}

export interface Progress {
  emit(event: ProgressEvent): void;
  summary(): Summary;
  level(): LevelInfo;
  milestones(): readonly MilestoneState[];
  quests: QuestApi;
  today(): TodayView;
  /** Whether the traveller has met somebody of this role, anywhere. */
  known(role: GuildRole): boolean;
  isRead(topic: string): boolean;
  /** The record as it stands: read it, never change it. */
  readonly career: CareerRecord;
  /** Folds in a record from elsewhere (the account): quietly, without telling of what it reached. */
  absorb(other: CareerRecord): void;
  /** Starts the career again, and writes the empty record at once. */
  reset(): void;
  /** Works the level out again now; `quiet` takes what it finds without telling. */
  refresh(quiet?: boolean): void;
  on(listener: (notice: ProgressNotice) => void): () => void;
  /** Writes what is pending now. */
  flush(): void;
  debug(): Record<string, unknown>;
  dispose(): void;
}

/** How stale the level may be when asked for, and how often frequent events work it out. */
const FRESH_MS = 250;
const CHECK_MS = 1000;
const WRITE_DELAY_MS = 2000;

const noRecords = (): ProgressRecords => ({ passport: emptyPassport(), rings: emptyRecord(), jobs: emptyJobs() });

/** What the console shows: the record in brief, the XP by source, the writes. */
function debugOf(record: CareerRecord, summary: Summary, io: { writes: number; refused: number; pending: boolean }): Record<string, unknown> {
  const { stats, quests, daily } = record;
  return {
    counts: Object.fromEntries(stats.counts),
    sets: Object.fromEntries([...stats.sets].map(([name, set]) => [name, set.size])),
    days: stats.days.size,
    quests: { done: [...quests.done], active: Object.fromEntries(quests.active) },
    daily: { day: daily.day, progress: [...daily.progress], history: daily.history.size, longest: daily.longest },
    xp: summary.xp,
    level: summary.level,
    parts: summary.xpParts,
    ...io,
  };
}

/** A career ready to play: `welcome` taken, the commissions on today. */
function opened(record: CareerRecord, day: number): CareerRecord {
  record.quests = withAuto(record.quests);
  record.daily = rollDaily(record.daily, day);
  return record;
}

export function createProgress(options: ProgressOptions): Progress {
  const storage = options.storage === undefined ? deviceCareerStore() : options.storage;
  const now = options.now ?? (() => Date.now());
  const delay = options.writeDelayMs ?? WRITE_DELAY_MS;
  const listeners = new Set<(notice: ProgressNotice) => void>();
  let record = opened(readCareer(storage), dayOf(now()));
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writes = 0;
  let refused = 0;

  const tell = (notice: ProgressNotice): void => {
    for (const listener of listeners) {
      try {
        listener(notice);
      } catch {
        // A listener's fault is its own.
      }
    }
  };

  function records(): ProgressRecords {
    try {
      return options.records();
    } catch {
      return noRecords();
    }
  }

  const compute = (): Summary => summaryOf({ ...records(), career: record }, dayOf(now()));
  let last = compute();
  let checkedAt = now();

  function check(quiet = false): Summary {
    const previous = last;
    last = compute();
    checkedAt = now();
    if (quiet) return last;
    if (last.level > previous.level) tell({ t: 'level', level: last.level, previous: previous.level });
    for (const m of last.milestones) {
      if (m.tier > (previous.achievements.get(m.id) ?? 0)) tell({ t: 'milestone', id: m.id, tier: m.tier, title: m.title });
    }
    return last;
  }

  const current = (): Summary => (now() - checkedAt < FRESH_MS ? last : check());

  function flush(): void {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty) return;
    dirty = false;
    if (writeCareer(storage, record)) writes++;
    else refused++;
  }

  function save(): void {
    dirty = true;
    if (delay <= 0) return flush();
    if (timer !== undefined) return;
    timer = setTimeout(flush, delay);
    (timer as unknown as { unref?: () => void }).unref?.();
  }

  function roll(): number {
    const day = dayOf(now());
    if (day > record.daily.day) {
      record.daily = rollDaily(record.daily, day);
      save();
      tell({ t: 'day', day });
    }
    return day;
  }

  function emit(event: ProgressEvent): void {
    try {
      const day = roll();
      applyEvent(record.stats, event, day);
      const quests = advance(record.quests, event);
      record.quests = quests.state;
      const daily = advanceDaily(record.daily, event, day);
      record.daily = daily.state;
      if (daily.done.length > 0) {
        bump(record.stats, 'commissions', daily.done.length);
        bump(record.stats, 'daily-xp', daily.xp);
      }
      save();
      for (const id of quests.ready) tell({ t: 'quest-ready', id });
      for (const commission of daily.done) tell({ t: 'commission', commission });
      if (daily.all) tell({ t: 'commissions', day, bonus: DAILY_BONUS, streak: streakOf(record.daily, day).current });
      const discrete = !FREQUENT.has(event.t) || quests.ready.length > 0 || daily.done.length > 0;
      if (discrete || now() - checkedAt >= CHECK_MS) check();
      if (discrete) tell({ t: 'change' });
    } catch {
      // A malformed event counts for nothing.
    }
  }

  const core: Core = {
    get record() {
      return record;
    },
    get last() {
      return last;
    },
    now,
    roll,
    setQuests(state) {
      record.quests = state;
      save();
    },
    check: () => check(),
    tell,
  };

  return {
    emit,
    summary: current,
    level: () => current().levelInfo,
    milestones: () => current().milestones,
    quests: questApi(core),
    today: () => todayOf(core),
    known: (role) => hasIn(record.stats, 'roles', role),
    isRead: (topic) => hasIn(record.stats, 'topics', topic),
    get career() {
      return record;
    },
    absorb(other) {
      try {
        // A day still to come from elsewhere (a clock set ahead, a row written by hand) is not taken: it would hold today's commissions shut.
        const today = dayOf(now());
        const theirs = other.daily.day > today + 1 ? { ...other, daily: { ...other.daily, day: 0, progress: [] } } : other;
        record = opened(mergeCareers(record, theirs), today);
        save();
        check(true);
        tell({ t: 'change' });
      } catch {
        // A record that cannot be merged leaves this one as it was.
      }
    },
    reset() {
      record = opened(emptyCareer(), dayOf(now()));
      dirty = true;
      flush();
      check(true);
      tell({ t: 'change' });
    },
    refresh: (quiet = false) => void check(quiet),
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush,
    debug: () => debugOf(record, current(), { writes, refused, pending: dirty }),
    dispose() {
      flush();
      listeners.clear();
    },
  };
}
