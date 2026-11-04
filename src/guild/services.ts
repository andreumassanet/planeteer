/**
 * What the guild's people can tell you about and do for you, as they read it:
 * the progress, the jobs, the courses, the wardrobe, the records and the map,
 * each through a small view the game hands the guild (`app/guild.ts`), so the
 * conversations know nothing of how any of it is kept.
 */
import type { IconName } from '../ui.ts';
import type { GuildRole } from './roles.ts';

export interface QuestView {
  id: string;
  giver: GuildRole;
  title: string;
  /** What the giver says offering it, and handing it in. */
  offer: string;
  thanks: string;
  objectives: readonly { label: string; done: number; count: number }[];
  xp: number;
  /** The names of what it unlocks to wear, if anything. */
  unlocks: readonly string[];
  state: 'offered' | 'active' | 'ready' | 'done' | 'locked';
}

export interface CommissionView {
  id: string;
  title: string;
  done: number;
  count: number;
  complete: boolean;
  xp: number;
}

export interface LevelView {
  level: number;
  xp: number;
  /** XP the level began at and the next one begins at. */
  from: number;
  to: number;
}

export interface MilestoneView {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  /** 0 to 3, bronze to gold. */
  tier: number;
  value: number;
  /** The next tier's threshold, or null at gold. */
  next: number | null;
  unit: string;
}

export interface JobBrief {
  id: string;
  kind: 'errand' | 'taxi' | 'cargo' | 'rescue';
  title: string;
  /** "To Sóller · 2.4 km". */
  detail: string;
  /** How far its pickup is, as the HUD writes a distance. */
  distance: string;
  tracked: boolean;
}

export interface CourseBrief {
  id: string;
  name: string;
  kind: 'air' | 'land' | 'sea';
  distance: string;
  /** The best run, `m:ss.s`, and its medal (3 gold), or null. */
  best: { time: string; medal: number } | null;
}

export interface WardrobeBrief {
  unlocked: number;
  total: number;
  /** Unlocked and not seen yet, by name. */
  fresh: readonly string[];
  /** The nearest few still locked: what, and what earns it. */
  next: readonly { name: string; condition: string }[];
}

export interface Suggestion {
  id: string;
  name: string;
  kind: 'landmark' | 'country' | 'town' | 'guild';
  /** "Spain · 41 km ↗". */
  detail: string;
}

export interface LoreTopicView {
  id: string;
  title: string;
  icon: IconName;
  role: GuildRole;
  summary: string;
  pages: readonly { heading: string; text: string }[];
}

export interface GuildServices {
  /** The city the square is in, for "the Explorers' Guild of …". */
  city(square: number): string;
  /** Who they are called, by their key. */
  nameOf(key: string): string;
  greeting(role: GuildRole, first: boolean, seed: string): string;
  farewell(role: GuildRole, seed: string): string;
  topics(role: GuildRole | null): readonly LoreTopicView[];

  quests(role: GuildRole | null): readonly QuestView[];
  accept(id: string): void;
  /** Hands a ready quest in; what it gave, or null when it was not ready. */
  turnIn(id: string): { xp: number; unlocks: readonly string[]; levelUp: number | null } | null;
  commissions(): { list: readonly CommissionView[]; bonus: number; streak: number };
  level(): LevelView;
  milestones(): readonly MilestoneView[];

  jobs(): readonly JobBrief[];
  /** Heads for a job (the guide leads there); false when it is gone. */
  track(id: string): boolean;
  courses(): readonly CourseBrief[];
  /** Leads to a course's start. */
  lead(id: string): void;
  /** The course's records, or null without the online service. */
  courseBoard(id: string): HTMLElement | null;

  wardrobe(): WardrobeBrief;
  openWardrobe(): void;
  hallOfFame(): void;
  account(): { available: boolean; signedIn: boolean; name: string | null };
  signIn(): void;
  openPassport(): void;
  openJournal(tab?: 'journal' | 'guide' | 'milestones' | 'rewards'): void;

  suggestions(): readonly Suggestion[];
  /** Sets one as the destination (the guide and the minimap point at it). */
  head(id: string): void;
  openMap(): void;

  /** The mark over a role's people, where the progress knows better than their quests' states. */
  mark?(role: GuildRole): 'ready' | 'quest' | 'daily' | null;
  /** Whether the traveller has talked to somebody of this role before, anywhere. */
  known(role: GuildRole): boolean;
  /** Tells the progress something happened in a conversation. */
  met(role: GuildRole): void;
  /** Tells the progress the traveller stood in a guild's square. */
  visited(square: number): void;
  read(topic: string): void;
}
