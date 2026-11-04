/**
 * Where a traveller stands on the Explorer's Path: the quests done, and the
 * ones taken with how far each objective has got. An objective counts only
 * while its quest is taken, and stops at its target.
 *
 * Every function here is pure: it returns a new state and leaves the one it
 * was given alone (`advance` hands the same one back when nothing moved).
 *
 * The merge is a union: a quest done on either side is done, and a quest
 * taken on either side is taken with the further of each objective's
 * progress; done wins over taken.
 */
import type { GuildRole } from '../guild/roles.ts';
import type { ProgressEvent } from './events.ts';
import { CELL_CAP, KEY, byCode, cellMax, cells, floored, objectOf, smallest, strings } from './lenient.ts';
import { QUESTS, questById } from './path.ts';
import type { Quest, QuestId } from './path.ts';

export interface QuestState {
  done: Set<string>;
  /** Taken quests, by id: each objective's progress, in order. */
  active: Map<string, number[]>;
}

/** The most quests a record keeps done, and taken. */
export const MAX_QUESTS = 128;

export type QuestStatus = 'locked' | 'offered' | 'active' | 'ready' | 'done';

export function emptyQuests(): QuestState {
  return { done: new Set(), active: new Map() };
}

const copy = (state: QuestState): QuestState => ({
  done: new Set(state.done),
  active: new Map([...state.active].map(([id, progress]) => [id, [...progress]])),
});

/** The quests taken from the start (`welcome`) taken, if they are not yet. */
export function withAuto(state: QuestState): QuestState {
  const missing = QUESTS.filter((q) => q.auto === true && !state.done.has(q.id) && !state.active.has(q.id));
  if (missing.length === 0) return state;
  const next = copy(state);
  for (const quest of missing) next.active.set(quest.id, quest.objectives.map(() => 0));
  return next;
}

/** Whether every objective of a taken quest has met its target. */
export function isReady(state: QuestState, id: string): boolean {
  const quest = questById(id);
  const progress = state.active.get(id);
  if (quest === undefined || progress === undefined) return false;
  return quest.objectives.every((objective, i) => (progress[i] ?? 0) >= objective.target);
}

const opened = (state: QuestState, quest: Quest, level: number): boolean =>
  quest.after.every((id) => state.done.has(id)) && level >= (quest.level ?? 0);

export function statusOf(state: QuestState, quest: Quest, summary: { level: number }): QuestStatus {
  if (state.done.has(quest.id)) return 'done';
  if (state.active.has(quest.id)) return isReady(state, quest.id) ? 'ready' : 'active';
  return opened(state, quest, summary.level) ? 'offered' : 'locked';
}

/** The quests that may be taken now, in the path's order; only `role`'s when given. */
export function offerable(state: QuestState, summary: { level: number }, role?: GuildRole): Quest[] {
  return QUESTS.filter((q) => (role === undefined || q.giver === role) && statusOf(state, q, summary) === 'offered');
}

/** Takes a quest, or null when it is not on offer. */
export function accept(state: QuestState, id: string, summary: { level: number }): QuestState | null {
  const quest = questById(id);
  if (quest === undefined || statusOf(state, quest, summary) !== 'offered') return null;
  const next = copy(state);
  next.active.set(quest.id, quest.objectives.map(() => 0));
  return next;
}

/** What one event moves: the new state, and the quests it made ready to hand in. */
export function advance(state: QuestState, event: ProgressEvent): { state: QuestState; ready: QuestId[] } {
  const base = withAuto(state);
  let next: QuestState | null = null;
  const ready: QuestId[] = [];
  for (const [id, progress] of base.active) {
    const quest = questById(id);
    if (quest === undefined) continue;
    let moved = false;
    const after = [...progress];
    quest.objectives.forEach((objective, i) => {
      const have = after[i] ?? 0;
      if (have >= objective.target) return;
      const amount = objective.amount(event);
      if (!(amount > 0)) return;
      after[i] = Math.min(objective.target, have + amount);
      moved = true;
    });
    if (!moved) continue;
    const wasReady = isReady(base, id);
    next ??= copy(base);
    next.active.set(id, after);
    if (!wasReady && isReady(next, id)) ready.push(quest.id);
  }
  return { state: next ?? base, ready };
}

/** Hands a ready quest in: the new state and the XP it gives, or null when it is not ready. */
export function turnIn(state: QuestState, id: string): { state: QuestState; xp: number } | null {
  const quest = questById(id);
  if (quest === undefined || !isReady(state, id)) return null;
  const next = copy(state);
  next.active.delete(id);
  next.done.add(id);
  return { state: next, xp: quest.xp };
}

/** The XP every quest handed in gave. */
export function questXp(done: ReadonlySet<string>): number {
  let xp = 0;
  for (const id of done) xp += questById(id)?.xp ?? 0;
  return xp;
}

/** The taken quests not done, the first `MAX_QUESTS` kept. */
function cappedActive(active: Map<string, number[]>, done: ReadonlySet<string>): Map<string, number[]> {
  const ids = [...active.keys()].filter((id) => !done.has(id)).sort(byCode).slice(0, MAX_QUESTS);
  return new Map(ids.map((id) => [id, active.get(id)!]));
}

export function mergeQuests(a: QuestState, b: QuestState): QuestState {
  const done = new Set(smallest([...a.done, ...b.done], MAX_QUESTS));
  const active = new Map<string, number[]>();
  for (const id of new Set([...a.active.keys(), ...b.active.keys()])) {
    active.set(id, cellMax(a.active.get(id) ?? [], b.active.get(id) ?? []));
  }
  return { done, active: cappedActive(active, done) };
}

/** A state from a stored document, whatever of it can be vouched for. */
export function questsOf(raw: unknown): QuestState {
  const value = objectOf(raw) ?? {};
  const done = new Set(smallest(strings(value.done, KEY), MAX_QUESTS));
  const active = new Map<string, number[]>();
  for (const [id, progress] of Object.entries(objectOf(value.active) ?? {})) {
    if (KEY.test(id) && Array.isArray(progress)) active.set(id, cells(progress));
  }
  return { done, active: cappedActive(active, done) };
}

export interface QuestsDocument {
  done: string[];
  active: Record<string, number[]>;
}

export function questsDocument(state: QuestState): QuestsDocument {
  const done = smallest(state.done, MAX_QUESTS);
  const active: Record<string, number[]> = {};
  for (const [id, progress] of cappedActive(state.active, new Set(done))) {
    active[id] = cells(progress.map((cell) => floored(cell, CELL_CAP) ?? 0));
  }
  return { done, active };
}
