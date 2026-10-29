/** What is new in the game, newest first, for the title screen's card. Content, kept short: a title and a line. */

export interface NewsItem {
  /** When it reached the game, as a reader says it. */
  when: string;
  title: string;
  text: string;
  /** A picture of it from the game, under `public/news/`. */
  image: string;
}

export const NEWS: readonly NewsItem[] = [
  { when: 'Oct 2026', title: 'A new look', text: 'A compass, a square minimap, a fresh passport and menus all in one style.', image: 'news/streets.jpg' },
  { when: 'Oct 2026', title: 'See much further', text: 'Far towns stand on the horizon, and every town is named over its roofs.', image: 'news/further.jpg' },
  { when: 'Oct 2026', title: 'Rings and races', text: 'A gold ring over every landmark, and air, land and sea courses to run.', image: 'news/flight.jpg' },
];
