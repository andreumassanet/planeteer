/** What the Field Guide reads, as views the game hands it (`app/guild.ts`). */
import type { CommissionView, LevelView, LoreTopicView, MilestoneView, QuestView } from '../guild/services.ts';

export type FieldGuidePage = 'journal' | 'guide' | 'milestones' | 'rewards';

export interface RewardItem {
  name: string;
  /** "Hat", "Title". */
  slot: string;
  unlocked: boolean;
}

export interface FieldGuideServices {
  /** The traveller's name, or '' for none. */
  name(): string;
  level(): LevelView;
  /** Every quest of the Explorer's Path, in order. */
  quests(): readonly QuestView[];
  commissions(): { list: readonly CommissionView[]; bonus: number; streak: number };
  milestones(): readonly MilestoneView[];
  topics(): readonly LoreTopicView[];
  isRead(topic: string): boolean;
  read(topic: string): void;
  /** What each level unlocks, in order. */
  rewards(): readonly { level: number; items: readonly RewardItem[] }[];
  /** What milestones, quests and streaks unlock. */
  others(): readonly (RewardItem & { condition: string })[];
  openWardrobe(): void;
  /** "Madrid · 12 km ↗", the nearest guild, or null. */
  nearestGuild(): string | null;
  headToGuild(): void;
}
