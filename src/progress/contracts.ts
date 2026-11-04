/**
 * The guild contracts: after their step of the Explorer's Path, each of the
 * guild's people has a chain of contracts, each opening when the one before
 * it is handed in, so nobody in a square ever runs out of something to ask.
 *
 * - The Guide's chain opens with `path-complete`; every other role's opens
 *   with that role's own step of the path (`odd-job`, `ring-bearer`,
 *   `new-look`, `stamped`, `far-horizons`), so a new traveller has them early.
 * - An objective counts events while its contract is taken, or reads where the
 *   traveller stands (`standing`): a level, a tally, how many topics read.
 * - The XP grows along a chain; some contracts unlock something to wear
 *   (`{ kind: 'quest', id }` in `cosmetics/catalogue.ts`).
 */
import type { Quest, QuestId } from './path.ts';
import { each, levelNow, medalsNow, metres, setSize, standing, tallied } from './objectives.ts';

export type ContractId =
  | 'know-the-guild' | 'guild-hopper' | 'long-way-round' | 'old-hand'
  | 'regular-round' | 'lifeguard-duty' | 'gold-standard' | 'good-name' | 'local-hero'
  | 'silver-lining' | 'three-ways' | 'ring-collector' | 'golden-hour' | 'podium-regular'
  | 'dressing-up' | 'rising-star' | 'best-dressed' | 'style-icon'
  | 'something-to-show' | 'ink-and-paper' | 'familiar-face' | 'living-record'
  | 'postcards-home' | 'lift-off' | 'another-sky' | 'edge-of-the-map';

type Contract = Omit<Quest, 'id' | 'after' | 'contract'> & { id: ContractId };

/** A chain: each contract after the one before it, the first after `opens`. */
function chain(opens: QuestId, contracts: readonly Contract[]): Quest[] {
  return contracts.map((c, i) => ({ ...c, after: [i === 0 ? opens : contracts[i - 1]!.id], contract: true }));
}

const GUIDE = chain('path-complete', [
  {
    id: 'know-the-guild',
    giver: 'guide',
    title: 'Know the guild',
    brief: 'Read up in the handbook, sit on a bench, and bring back a postcard of a landmark.',
    offer: 'Now you’re one of us, you ought to know the place properly. Read up on a few things, rest your feet on a bench, and bring me back a postcard of a landmark.',
    thanks: 'A postcard! I’ll pin it up by the door. You know the guild as well as I do now. Nearly.',
    objectives: [
      standing('Read 6 of the guild’s topics', 6, setSize('topics')),
      { label: 'Sit on a bench', target: 1, amount: each('sit') },
      { label: 'Photograph a landmark for a postcard', target: 1, amount: each('postcard') },
    ],
    xp: 250,
  },
  {
    id: 'guild-hopper',
    giver: 'guide',
    title: 'Guild hopper',
    brief: 'Visit three guild squares, chat to five people and try three gestures.',
    offer: 'Every big city has a square like this one, and every one has its own gossip. Pop into a couple more, chat to folk on the way, and show them a wave or a dance.',
    thanks: 'Three squares! The others say hello, and that you’ve got lovely manners. I told them I taught you.',
    objectives: [
      standing('Visit 3 guild squares', 3, setSize('guilds')),
      { label: 'Talk to 5 people', target: 5, amount: each('talk') },
      standing('Use 3 different gestures', 3, setSize('emotes')),
    ],
    xp: 400,
  },
  {
    id: 'long-way-round',
    giver: 'guide',
    title: 'The long way round',
    brief: 'Walk or run 10 km, and pick up three new passport stamps.',
    offer: 'Engines are lovely, but you only really see a place on foot. Walk ten kilometres, and pick up three new stamps somewhere along the way.',
    thanks: 'Ten kilometres! Your boots have stories now. Put your feet up for a minute, you’ve earned it.',
    objectives: [
      { label: 'Walk or run 10 km', target: 10_000, amount: metres('walk', 'run') },
      { label: 'Get 3 new countries’ stamps', target: 3, amount: each('stamp') },
    ],
    xp: 750,
  },
  {
    id: 'old-hand',
    giver: 'guide',
    title: 'Old hand',
    brief: 'Read twenty of the handbook’s topics and see six guild squares.',
    offer: 'There’s one thing left I can teach you: there’s always more. Read most of the handbook, and see six of our squares with your own eyes.',
    thanks: 'That’s everything I know, and a fair bit you taught me. You’re an old hand now. Wear it proudly.',
    objectives: [
      standing('Read 20 of the guild’s topics', 20, setSize('topics')),
      standing('Visit 6 guild squares', 6, setSize('guilds')),
    ],
    xp: 1000,
  },
]);

const DISPATCHER = chain('odd-job', [
  {
    id: 'regular-round',
    giver: 'dispatcher',
    title: 'The regular round',
    brief: 'Finish an errand, a fare and a load.',
    offer: 'One job is luck; three is a habit. Do me an errand, a fare and a load, in any order, anywhere you like.',
    thanks: 'All three! Parcels, passengers and crates. You’re the whole firm on your own.',
    objectives: [
      { label: 'Run an errand', target: 1, amount: each('job', (e) => e.kind === 'errand') },
      { label: 'Drive a fare', target: 1, amount: each('job', (e) => e.kind === 'taxi') },
      { label: 'Fly a load', target: 1, amount: each('job', (e) => e.kind === 'cargo') },
    ],
    xp: 300,
  },
  {
    id: 'lifeguard-duty',
    giver: 'dispatcher',
    title: 'Lifeguard duty',
    brief: 'Bring a swimmer in from the sea, and finish three more jobs.',
    offer: 'Somebody’s always paddled out too far. Bring one swimmer in from the sea, safe and sound, and keep your hand in with a few more jobs.',
    thanks: 'Dry, safe and ever so grateful. They’ll be telling that story at dinner for years.',
    objectives: [
      { label: 'Rescue a swimmer at sea', target: 1, amount: each('job', (e) => e.kind === 'rescue' && e.site === 'sea') },
      { label: 'Finish 3 jobs', target: 3, amount: each('job') },
    ],
    xp: 450,
  },
  {
    id: 'gold-standard',
    giver: 'dispatcher',
    title: 'Gold standard',
    brief: 'Beat a job’s par for a gold medal, and finish five jobs.',
    offer: 'Anybody can arrive. Arrive early! Beat a job’s par for a gold medal, and do a handful more while you’re at it.',
    thanks: 'Gold! Under par and not a parcel dented. You’re going straight on the good list.',
    objectives: [
      { label: 'Finish a job with gold', target: 1, amount: each('job', (e) => e.medal === 3) },
      { label: 'Finish 5 jobs', target: 5, amount: each('job') },
    ],
    xp: 650,
  },
  {
    id: 'good-name',
    giver: 'dispatcher',
    title: 'A good name',
    brief: 'Grow your reputation to 200, and finish ten jobs.',
    offer: 'Folk talk, and what they say about you is your reputation. Do another ten jobs and let yours grow to 200.',
    thanks: 'Your name gets a smile in every square now. That’s worth more than all the fares.',
    objectives: [
      standing('Reach 200 reputation', 200, tallied('reputation')),
      { label: 'Finish 10 jobs', target: 10, amount: each('job') },
    ],
    xp: 850,
  },
  {
    id: 'local-hero',
    giver: 'dispatcher',
    title: 'Local hero',
    brief: 'Three golds on jobs, two rescues and a reputation of 500.',
    offer: 'Right, the big one. Three golds, two people brought home safe, and a name worth 500. Then I’ll stop calling you new.',
    thanks: 'A proper local hero, everywhere at once. The kettle’s always on for you here.',
    objectives: [
      { label: 'Finish 3 jobs with gold', target: 3, amount: each('job', (e) => e.medal === 3) },
      { label: 'Finish 2 rescues', target: 2, amount: each('job', (e) => e.kind === 'rescue') },
      standing('Reach 500 reputation', 500, tallied('reputation')),
    ],
    xp: 1200,
  },
]);

const MARSHAL = chain('ring-bearer', [
  {
    id: 'silver-lining',
    giver: 'marshal',
    title: 'Silver lining',
    brief: 'Win silver or better on any ring course.',
    offer: 'Finishing is lovely. Finishing quickly is lovelier. Bring me a silver from any course, air, road or sea.',
    thanks: 'Silver! Clean lines, tidy turns. Gold’s only a whisker further.',
    objectives: [{ label: 'Win silver or gold on a course', target: 1, amount: each('course', (e) => e.medal >= 2) }],
    xp: 300,
  },
  {
    id: 'three-ways',
    giver: 'marshal',
    title: 'Land, sea and air',
    brief: 'Finish an air course, a land rally and a sea race.',
    offer: 'A real racer isn’t fussy about the vehicle. Finish one of each for me: an air course, a rally and a sea race.',
    thanks: 'Wings, wheels and a hull, all through the chequers. Now that’s an all-rounder.',
    objectives: [
      { label: 'Finish an air course', target: 1, amount: each('course', (e) => e.kind === 'air') },
      { label: 'Finish a land rally', target: 1, amount: each('course', (e) => e.kind === 'land') },
      { label: 'Finish a sea race', target: 1, amount: each('course', (e) => e.kind === 'sea') },
    ],
    xp: 500,
  },
  {
    id: 'ring-collector',
    giver: 'marshal',
    title: 'Ring collector',
    brief: 'Collect the gold rings over ten landmarks.',
    offer: 'Those gold rings over the landmarks don’t collect themselves. Get ten of them on your string.',
    thanks: 'Ten rings! You’ll want a bigger string. There are plenty more up there.',
    objectives: [standing('Collect 10 landmark rings', 10, tallied('landmarks'))],
    xp: 650,
  },
  {
    id: 'golden-hour',
    giver: 'marshal',
    title: 'Golden hour',
    brief: 'Win gold on an air course, a land rally and a sea race.',
    offer: 'Gold on all three. In the air, on the road and on the water. I believe in you, mostly.',
    thanks: 'Three golds! I’ve run out of stopwatch. Take this before I start crying.',
    objectives: [
      { label: 'Win gold on an air course', target: 1, amount: each('course', (e) => e.kind === 'air' && e.medal === 3) },
      { label: 'Win gold on a land rally', target: 1, amount: each('course', (e) => e.kind === 'land' && e.medal === 3) },
      { label: 'Win gold on a sea race', target: 1, amount: each('course', (e) => e.kind === 'sea' && e.medal === 3) },
    ],
    xp: 900,
  },
  {
    id: 'podium-regular',
    giver: 'marshal',
    title: 'Podium regular',
    brief: 'Hold gold on ten courses and collect thirty landmark rings.',
    offer: 'The podium knows your shape by now. Hold gold on ten courses and thirty landmark rings, and your name goes on the board for good.',
    thanks: 'Ten golds and thirty rings. Every marshal on the planet knows your name now.',
    objectives: [
      standing('Hold gold on 10 courses', 10, tallied('golds')),
      standing('Collect 30 landmark rings', 30, tallied('landmarks')),
    ],
    xp: 1200,
  },
]);

const OUTFITTER = chain('new-look', [
  {
    id: 'dressing-up',
    giver: 'outfitter',
    title: 'Dressing up',
    brief: 'Change your look three more times.',
    offer: 'One new look is a start. Three is a wardrobe! Try a few things on and see what suits.',
    thanks: 'Ooh, that one. No, the one before. Actually, all of them. You’ve got an eye.',
    objectives: [{ label: 'Change your look 3 times', target: 3, amount: each('look') }],
    xp: 250,
  },
  {
    id: 'rising-star',
    giver: 'outfitter',
    title: 'Rising star',
    brief: 'Reach level 8 and take three photos.',
    offer: 'The more you do, the more I’ve got for you. Get to level 8, and take a few photos so I can see the outfit out and about.',
    thanks: 'Lovely snaps. The light suits you. So does level 8.',
    objectives: [
      standing('Reach level 8', 8, levelNow),
      { label: 'Take 3 photos', target: 3, amount: each('photo') },
    ],
    xp: 400,
  },
  {
    id: 'best-dressed',
    giver: 'outfitter',
    title: 'Best dressed',
    brief: 'Reach level 15, change your look and photograph a landmark.',
    offer: 'Level 15, a fresh look, and a postcard of you in front of something grand. That’s a portfolio.',
    thanks: 'Framed and on my wall. Here, something with a bit of pattern for the skies.',
    objectives: [
      standing('Reach level 15', 15, levelNow),
      { label: 'Change your look', target: 1, amount: each('look') },
      { label: 'Photograph a landmark for a postcard', target: 1, amount: each('postcard') },
    ],
    xp: 800,
  },
  {
    id: 'style-icon',
    giver: 'outfitter',
    title: 'Style icon',
    brief: 'Reach level 30, and change your look once more.',
    offer: 'Level 30 and one last change, and you’ll be the best-dressed explorer on the planet. I’ve said it, it’s true.',
    thanks: 'A style icon. People will copy you, you know. Let them.',
    objectives: [
      standing('Reach level 30', 30, levelNow),
      { label: 'Change your look', target: 1, amount: each('look') },
    ],
    xp: 1200,
  },
]);

const ARCHIVIST = chain('stamped', [
  {
    id: 'something-to-show',
    giver: 'archivist',
    title: 'Something to show',
    brief: 'Win three milestone medals.',
    offer: 'Your record has a lot of empty shelves. Earn three milestone medals, any three, and I’ll start a proper file.',
    thanks: 'Three medals, all in order. Your file has a cover now, and a very nice one.',
    objectives: [standing('Win 3 milestone medals', 3, medalsNow)],
    xp: 250,
  },
  {
    id: 'ink-and-paper',
    giver: 'archivist',
    title: 'Ink and paper',
    brief: 'Get three new stamps, and walk into five new towns.',
    offer: 'More ink, please. Three new countries in your passport, and five towns walked into, and I’ll write them all up.',
    thanks: 'Lovely clean stamps. I’ve filed every town under its own little card.',
    objectives: [
      { label: 'Get 3 new countries’ stamps', target: 3, amount: each('stamp') },
      { label: 'Walk into 5 new towns', target: 5, amount: each('town') },
    ],
    xp: 400,
  },
  {
    id: 'familiar-face',
    giver: 'archivist',
    title: 'A familiar face',
    brief: 'Explore on five different days and win ten milestone medals.',
    offer: 'The best records are kept a little at a time. Explore on five different days, and bring your medals up to ten.',
    thanks: 'Five days in the ledger, ten medals on the shelf. We’re glad to see you, you know.',
    objectives: [
      standing('Explore on 5 different days', 5, tallied('days')),
      standing('Win 10 milestone medals', 10, medalsNow),
    ],
    xp: 600,
  },
  {
    id: 'living-record',
    giver: 'archivist',
    title: 'Living record',
    brief: 'Twenty-five medals, fifteen countries and a hundred towns.',
    offer: 'This is the shelf I keep for the greats. Twenty-five medals, fifteen countries stamped and a hundred towns walked into.',
    thanks: 'A whole shelf, and it’s yours. You’re in the history books now. Well, in mine.',
    objectives: [
      standing('Win 25 milestone medals', 25, medalsNow),
      standing('Get stamps in 15 countries', 15, tallied('countries')),
      standing('Walk into 100 towns', 100, tallied('towns')),
    ],
    xp: 1200,
  },
]);

const CARTOGRAPHER = chain('far-horizons', [
  {
    id: 'postcards-home',
    giver: 'cartographer',
    title: 'Postcards home',
    brief: 'Reach two destinations, and collect three postcards.',
    offer: 'Mark two more places on the map and go and stand at them. Send me postcards: three landmarks, caught well.',
    thanks: 'They’re going straight on the wall, beside the map. Look, there’s a gap for more.',
    objectives: [
      { label: 'Reach 2 destinations', target: 2, amount: each('arrive') },
      standing('Collect 3 postcards', 3, tallied('postcards')),
    ],
    xp: 300,
  },
  {
    id: 'lift-off',
    giver: 'cartographer',
    title: 'Lift-off',
    brief: 'Launch a rocket from a pad beside an airstrip.',
    offer: 'My maps stop at the sky, and that’s a shame. There’s a rocket beside many an airstrip. Climb in, hold on, and launch it.',
    thanks: 'You went up! Did you see the edges? I always knew the planet was round.',
    objectives: [{ label: 'Launch a rocket', target: 1, amount: each('rocket') }],
    xp: 650,
  },
  {
    id: 'another-sky',
    giver: 'cartographer',
    title: 'Another sky',
    brief: 'Stand on another world.',
    offer: 'Up is one thing. Somewhere else is another. Go and stand on another world, and tell me what the sky looks like.',
    thanks: 'A whole new map, and nobody’s drawn it yet. Bring me back the coastline, will you?',
    objectives: [{ label: 'Stand on another world', target: 1, amount: each('world', (e) => e.id !== 'earth') }],
    xp: 850,
  },
  {
    id: 'edge-of-the-map',
    giver: 'cartographer',
    title: 'Edge of the map',
    brief: 'Five destinations, ten postcards, 500 km flown and 20 km sailed.',
    offer: 'Here be dragons, they used to write. Let’s find out. Reach five destinations, collect ten postcards, fly 500 km and sail twenty.',
    thanks: 'No dragons, then. Just you, at the edge of the map, drawing it bigger. Here, you’ve earned the name.',
    objectives: [
      { label: 'Reach 5 destinations', target: 5, amount: each('arrive') },
      standing('Collect 10 postcards', 10, tallied('postcards')),
      { label: 'Fly 500 km', target: 500_000, amount: metres('fly') },
      { label: 'Sail 20 km', target: 20_000, amount: metres('sail') },
    ],
    xp: 1200,
  },
]);

/** Every role's chain, in the order the roles stand round the square. */
export const CONTRACTS: readonly Quest[] = [...GUIDE, ...DISPATCHER, ...MARSHAL, ...OUTFITTER, ...ARCHIVIST, ...CARTOGRAPHER];
