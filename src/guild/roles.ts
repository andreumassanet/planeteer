/**
 * The Explorers' Guild's people: who stands in a guild's square and what each
 * is there for. The square (`settlements`) gives each a spot, the guild
 * (`guild.ts`) dresses and runs them, and the progress (`progress/quests.ts`)
 * names who hands out each quest.
 */
import type { IconName } from '../ui.ts';

export type GuildRole = 'guide' | 'dispatcher' | 'marshal' | 'outfitter' | 'archivist' | 'cartographer';

/** Every role, in the order their spots are laid round the square. */
export const GUILD_ROLES: readonly GuildRole[] = ['guide', 'dispatcher', 'marshal', 'outfitter', 'archivist', 'cartographer'];

export interface RoleInfo {
  /** What the tag over their head says under their name. */
  title: string;
  icon: IconName;
  /** One line: what they are there for. */
  purpose: string;
}

export const ROLE_INFO: Readonly<Record<GuildRole, RoleInfo>> = {
  guide: { title: 'Guide', icon: 'help', purpose: 'How everything in the world works, and the Explorer’s Path.' },
  dispatcher: { title: 'Dispatcher', icon: 'hand', purpose: 'Jobs in and round the city, and today’s commissions.' },
  marshal: { title: 'Course marshal', icon: 'flag', purpose: 'The ring courses near here, your best times and the records.' },
  outfitter: { title: 'Outfitter', icon: 'sparkle', purpose: 'What you can wear, what you have unlocked and what comes next.' },
  archivist: { title: 'Archivist', icon: 'star', purpose: 'Your level, your milestones, the Hall of Fame and your account.' },
  cartographer: { title: 'Cartographer', icon: 'map', purpose: 'Where to go next: landmarks, countries and towns not yet seen.' },
};
