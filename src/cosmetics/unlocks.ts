/**
 * What a cosmetic asks of a traveller before it may be worn, and the one
 * reading of a traveller's progress that answers it.
 *
 * `UnlockSummary` is all an unlock looks at: the level, the tier reached in
 * each milestone, the quests done and the longest streak of days with every
 * daily commission done. The progression keeps the record; anything that can
 * produce this shape can unlock the wardrobe, and nothing here knows how it
 * was counted.
 */

/** What unlocks read: the progression's summary of a traveller. */
export interface UnlockSummary {
  level: number;
  /** Milestone id to the tier reached, 0 to 3 (bronze, silver, gold). */
  achievements: ReadonlyMap<string, number>;
  /** Quest ids done. */
  quests: ReadonlySet<string>;
  /** The longest run of consecutive days with every daily commission done. */
  streak: number;
}

/** One way to earn a cosmetic. */
export type Unlock =
  | { kind: 'free' }
  | { kind: 'level'; level: number }
  | { kind: 'milestone'; id: string; tier: 1 | 2 | 3 }
  | { kind: 'quest'; id: string }
  | { kind: 'streak'; days: number };

/** A traveller who has done nothing yet: what the card assumes with no progress wired in. */
export const NO_PROGRESS: UnlockSummary = { level: 1, achievements: new Map(), quests: new Set(), streak: 0 };

/** Whether `summary` has earned `unlock`. */
export function earned(unlock: Unlock, summary: UnlockSummary): boolean {
  switch (unlock.kind) {
    case 'free':
      return true;
    case 'level':
      return summary.level >= unlock.level;
    case 'milestone':
      return (summary.achievements.get(unlock.id) ?? 0) >= unlock.tier;
    case 'quest':
      return summary.quests.has(unlock.id);
    case 'streak':
      return summary.streak >= unlock.days;
  }
}

/** The milestones' names as a condition says them, by id. */
export const MILESTONE_NAMES: Readonly<Record<string, string>> = {
  globetrotter: 'Globetrotter',
  wanderer: 'Wanderer',
  sightseer: 'Sightseer',
  racer: 'Racer',
  courier: 'Courier',
  rescuer: 'Rescuer',
  hiker: 'Hiker',
  driver: 'Driver',
  aviator: 'Aviator',
  sailor: 'Sailor',
  diver: 'Diver',
  collector: 'Collector',
  socialite: 'Socialite',
  astronaut: 'Astronaut',
  voyager: 'Voyager',
  photographer: 'Photographer',
  postcards: 'Postcards',
  regular: 'Regular',
};

/** The quests of The Explorer's Path as a condition says them, by id. */
export const QUEST_NAMES: Readonly<Record<string, string>> = {
  welcome: 'Welcome',
  'first-steps': 'First steps',
  'say-hello': 'Say hello',
  'take-the-wheel': 'Take the wheel',
  'odd-job': 'An odd job',
  'on-course': 'On course',
  'ring-bearer': 'Ring bearer',
  'new-look': 'A new look',
  stamped: 'Stamped',
  'far-horizons': 'Far horizons',
  'path-complete': "The Explorer's Path",
};

/** The guild contracts that give something to wear, as a condition says them, by id. */
export const CONTRACT_NAMES: Readonly<Record<string, string>> = {
  'long-way-round': 'The long way round',
  'old-hand': 'Old hand',
  'lifeguard-duty': 'Lifeguard duty',
  'local-hero': 'Local hero',
  'three-ways': 'Land, sea and air',
  'golden-hour': 'Golden hour',
  'best-dressed': 'Best dressed',
  'style-icon': 'Style icon',
  'living-record': 'Living record',
  'lift-off': 'Lift-off',
  'edge-of-the-map': 'Edge of the map',
};

/** The quest that closes the path, which a condition names as the path itself. */
export const PATH_COMPLETE = 'path-complete';

const TIERS = ['', 'Bronze', 'Silver', 'Gold'] as const;

/** Names a caller may know better than this file: the progression's own titles. */
export interface ConditionNames {
  milestone?(id: string): string | undefined;
  quest?(id: string): string | undefined;
}

const milestoneName = (id: string, names?: ConditionNames): string => names?.milestone?.(id) ?? MILESTONE_NAMES[id] ?? id;
const questName = (id: string, names?: ConditionNames): string => names?.quest?.(id) ?? QUEST_NAMES[id] ?? CONTRACT_NAMES[id] ?? id;

/** What to do to earn it, as a sentence: "Reach level 8", "Gold in Globetrotter". */
export function unlockText(unlock: Unlock, names?: ConditionNames): string {
  switch (unlock.kind) {
    case 'free':
      return 'Yours from the start';
    case 'level':
      return `Reach level ${unlock.level}`;
    case 'milestone':
      return `${TIERS[unlock.tier]} in ${milestoneName(unlock.id, names)}`;
    case 'quest':
      if (unlock.id === PATH_COMPLETE) return "Finish The Explorer's Path";
      return `Finish the ${CONTRACT_NAMES[unlock.id] === undefined ? 'quest' : 'contract'} “${questName(unlock.id, names)}”`;
    case 'streak':
      return `A ${unlock.days}-day commission streak`;
  }
}

/** The same, short enough for a tile: "Level 8", "Gold · Globetrotter", "Quest", "7-day streak". */
export function unlockBadge(unlock: Unlock, names?: ConditionNames): string {
  switch (unlock.kind) {
    case 'free':
      return 'Free';
    case 'level':
      return `Level ${unlock.level}`;
    case 'milestone':
      return `${TIERS[unlock.tier]} · ${milestoneName(unlock.id, names)}`;
    case 'quest':
      return CONTRACT_NAMES[unlock.id] === undefined ? 'Quest' : 'Contract';
    case 'streak':
      return `${unlock.days}-day streak`;
  }
}
