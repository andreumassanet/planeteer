/** The shape of the handbook: a topic is a few short pages, and a page is plain text with keys as `{action}`. */
import type { IconName } from '../../ui.ts';
import type { GuildRole } from '../roles.ts';

export interface LorePage {
  heading: string;
  /**
   * Plain text. A key is `{action}`, an `Action` of `controls.ts`, drawn as the
   * player's own key cap; a blank line (`\n\n`) is a paragraph break.
   */
  text: string;
  /** The same page for a touch screen, where a finger does it differently. */
  touch?: string;
}

export interface LoreTopic {
  /** Kebab-case, unique across the handbook. */
  id: string;
  title: string;
  icon: IconName;
  /** Who in the guild's square explains it. */
  role: GuildRole;
  /** One line: what the topic answers. */
  summary: string;
  pages: readonly LorePage[];
}

/** What each of the guild's people says on meeting you, on meeting you again and on parting. */
export interface Greetings {
  first: readonly string[];
  again: readonly string[];
  farewell: readonly string[];
}
