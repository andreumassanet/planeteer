/**
 * The Explorer's Path: the quests the guild's people hand out to a new
 * traveller, in the order they open. Each has a giver, what they say
 * offering it and handing it in, the objectives it counts (only while it is
 * taken), what must be done first, and the XP it gives.
 *
 * - `welcome` is taken from the start: meeting the Guide finishes it, and
 *   opens the Guide's `first-steps` and one quest from each of the
 *   Dispatcher, the Outfitter, the Archivist and the Cartographer.
 * - `first-steps` opens `say-hello` and `take-the-wheel`; a vehicle opens
 *   the Marshal's `on-course`, and that opens `ring-bearer`.
 * - `path-complete` waits for all the rest and has nothing left to do.
 *
 * After it each role has a chain of guild contracts (`contracts.ts`), and
 * `QUESTS` is the path and then the contracts.
 */
import type { GuildRole } from '../guild/roles.ts';
import { CONTRACTS } from './contracts.ts';
import type { ContractId } from './contracts.ts';
import type { ProgressEvent } from './events.ts';
import { each, metres } from './objectives.ts';
import type { Stats } from './stats.ts';
import type { Summary } from './summary.ts';

export type PathId =
  | 'welcome' | 'first-steps' | 'say-hello' | 'take-the-wheel' | 'odd-job' | 'on-course' | 'ring-bearer'
  | 'new-look' | 'stamped' | 'far-horizons' | 'path-complete';

export type QuestId = PathId | ContractId;

/** Where the traveller stands, as an objective that reads it sees it. */
export interface Standing {
  summary: Summary;
  stats: Stats;
}

export interface Objective {
  /** "Run 200 m". */
  label: string;
  /** How much is needed, in what `amount` counts. */
  target: number;
  /** How much one event counts towards it: metres, or one. */
  amount(event: ProgressEvent): number;
  /** Where the traveller stands towards it, for an objective met by a standing rather than by events. */
  reach?(at: Standing): number;
}

export interface Quest {
  id: QuestId;
  giver: GuildRole;
  title: string;
  /** One line for the journal: what it asks. */
  brief: string;
  /** What the giver says offering it, and handing it in. */
  offer: string;
  thanks: string;
  objectives: readonly Objective[];
  /** What must be done first. */
  after: readonly QuestId[];
  xp: number;
  /** The level it opens at, if any. */
  level?: number;
  /** Taken from the start, without being offered. */
  auto?: boolean;
  /** A guild contract, not a step of the path. */
  contract?: boolean;
}

const BEFORE_PATH: readonly PathId[] = [
  'welcome', 'first-steps', 'say-hello', 'take-the-wheel', 'odd-job', 'on-course', 'ring-bearer', 'new-look', 'stamped', 'far-horizons',
];

/** The Explorer's Path, in the order it opens. */
export const PATH: readonly Quest[] = [
  {
    id: 'welcome',
    giver: 'guide',
    title: 'Welcome, traveller',
    brief: 'Find the Guide at an Explorers’ Guild and say hello.',
    offer: 'Oh, a new face! Come over, come over, I don’t bite.',
    thanks: 'Welcome to the Explorers’ Guild! The whole planet is out there, and pointing you at it is my favourite job. Got a minute?',
    objectives: [{ label: 'Talk to the Guide', target: 1, amount: each('npc', (e) => e.role === 'guide') }],
    after: [],
    xp: 50,
    auto: true,
  },
  {
    id: 'first-steps',
    giver: 'guide',
    title: 'First steps',
    brief: 'Stretch your legs: a good run and a few jumps.',
    offer: 'Before the planet, your legs. Have a proper run, a couple of hundred metres, and a few jumps while you’re at it. Humour me.',
    thanks: 'Look at you go! Legs: working. Now for the rest of the world.',
    objectives: [
      { label: 'Run 200 m', target: 200, amount: metres('run') },
      { label: 'Jump 3 times', target: 3, amount: each('jump') },
    ],
    after: ['welcome'],
    xp: 100,
  },
  {
    id: 'say-hello',
    giver: 'guide',
    title: 'Say hello',
    brief: 'Talk to two people in town and wave at somebody.',
    offer: 'Folk here love a chat, and every one of them knows something. Talk to a couple, and give somebody a wave.',
    thanks: 'See? A friendly lot. There’s a word waiting for you in every language out there.',
    objectives: [
      { label: 'Talk to 2 people', target: 2, amount: each('talk') },
      { label: 'Wave at somebody', target: 1, amount: each('emote', (e) => e.e === 'wave') },
    ],
    after: ['first-steps'],
    xp: 100,
  },
  {
    id: 'take-the-wheel',
    giver: 'guide',
    title: 'Take the wheel',
    brief: 'Get into any vehicle and travel a kilometre in it.',
    offer: 'Nobody owns a car here, so every car is yours for a while. Hop into anything with wheels, a hull or a saddle and go a kilometre.',
    thanks: 'Smooth! Leave it wherever you like: somebody else will be glad of it.',
    objectives: [
      { label: 'Get into a vehicle', target: 1, amount: each('board') },
      { label: 'Drive, ride, sail or fly 1 km', target: 1000, amount: metres('drive', 'ride', 'sail', 'fly') },
    ],
    after: ['first-steps'],
    xp: 150,
  },
  {
    id: 'odd-job',
    giver: 'dispatcher',
    title: 'An odd job',
    brief: 'Finish any job: an errand, a fare, a load or a rescue.',
    offer: 'Hands free? Splendid. Somebody always needs a parcel taken, a lift or a rescue. Pick one up anywhere and see it through.',
    thanks: 'Delivered, and on time-ish! People remember who helps them. Come back any day for more.',
    objectives: [{ label: 'Finish a job', target: 1, amount: each('job') }],
    after: ['welcome'],
    xp: 200,
  },
  {
    id: 'on-course',
    giver: 'marshal',
    title: 'On course',
    brief: 'Run a ring course from its green start ring to the chequered finish.',
    offer: 'Seen the rings round the cities? Courses: in the air, on the road and at sea. In through the green one, chase the rest, out under the chequers.',
    thanks: 'Through the chequers! Now you’ve got a time, you’ll want to beat it. Everyone does.',
    objectives: [{ label: 'Finish a ring course', target: 1, amount: each('course') }],
    after: ['take-the-wheel'],
    xp: 200,
  },
  {
    id: 'ring-bearer',
    giver: 'marshal',
    title: 'Ring-bearer',
    brief: 'Fly through the gold ring over a landmark.',
    offer: 'Every great landmark wears a gold ring up in the sky. Fly through one for me. Mind the spire.',
    thanks: 'Lovely line! There’s a ring over every landmark on the planet, if you fancy the full set.',
    objectives: [{ label: 'Fly through a landmark’s ring', target: 1, amount: each('ring') }],
    after: ['on-course'],
    xp: 200,
  },
  {
    id: 'new-look',
    giver: 'outfitter',
    title: 'A new look',
    brief: 'Change how your traveller looks, on the traveller’s card.',
    offer: 'You’ve come all this way in that? Open your traveller’s card and change something. Anything! I’ll wait.',
    thanks: 'Much better. Keep exploring: the further you go, the more I’ll have to show you.',
    objectives: [{ label: 'Change your look', target: 1, amount: each('look') }],
    after: ['welcome'],
    xp: 100,
  },
  {
    id: 'stamped',
    giver: 'archivist',
    title: 'Stamped',
    brief: 'Get a stamp in a new country, and walk into two new towns.',
    offer: 'A passport with one stamp is a lonely little book. Set foot in another country, and walk into a couple of towns while you’re out.',
    thanks: 'Ah, fresh ink! I’ll keep the record straight. Every stamp and every town counts towards your level.',
    objectives: [
      { label: 'Get a new country’s stamp', target: 1, amount: each('stamp') },
      { label: 'Walk into 2 new towns', target: 2, amount: each('town') },
    ],
    after: ['welcome'],
    xp: 200,
  },
  {
    id: 'far-horizons',
    giver: 'cartographer',
    title: 'Far horizons',
    brief: 'Choose a landmark on the map, set it as your destination and reach it.',
    offer: 'My favourite thing in the world: somewhere you haven’t been. Open the map, pick a landmark, set your course and go and stand under it.',
    thanks: 'You found it! A map is only paper until somebody walks it. Where next?',
    objectives: [
      { label: 'Open the map', target: 1, amount: each('map') },
      { label: 'Set a destination', target: 1, amount: each('destination') },
      { label: 'Reach it', target: 1, amount: each('arrive') },
    ],
    after: ['welcome'],
    xp: 200,
  },
  {
    id: 'path-complete',
    giver: 'guide',
    title: 'The Explorer’s Path',
    brief: 'Everyone at the guild has had their say. Back to the Guide.',
    offer: 'The whole guild says you’ve done them proud. Come here, there’s one last thing.',
    thanks: 'That’s the whole path walked. You’re a proper explorer now, and the rest of the planet is all yours. Off you go!',
    objectives: [],
    after: BEFORE_PATH,
    xp: 500,
  },
];

/** The path, then every role's contracts. */
export const QUESTS: readonly Quest[] = [...PATH, ...CONTRACTS];

export const PATH_IDS: readonly PathId[] = PATH.map((q) => q.id as PathId);

export const QUEST_IDS: readonly QuestId[] = QUESTS.map((q) => q.id);

export const questById = (id: string): Quest | undefined => QUESTS.find((q) => q.id === id);
