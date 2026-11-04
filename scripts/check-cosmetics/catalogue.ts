/** The catalogue: ids, indices, the wire's room, every item modelled, and what earns what. */
import {
  BY_SLOT,
  COSMETICS,
  COSMETIC_SLOTS,
  FREE_IDS,
  NO_PROGRESS,
  conditionText,
  cosmeticAt,
  cosmeticById,
  newlyUnlocked,
  unlockedOf,
  type UnlockSummary,
} from '../../src/cosmetics.ts';
import { MODELLED } from '../../src/cosmetics/worn.ts';
import { TRAILED } from '../../src/cosmetics/trails.ts';
import { PATTERNED } from '../../src/cosmetics/canopy.ts';
import { COMPANIONED } from '../../src/cosmetics/companions.ts';
import { MILESTONE_NAMES, QUEST_NAMES } from '../../src/cosmetics/unlocks.ts';
import { fail } from './setup.ts';

/**
 * The tables as they shipped, slot by slot, in wire order. A table may grow at
 * its end and nothing else: an index is what the look code stores and sends.
 * Append a new item's id here when it is added.
 */
const LEDGER: Readonly<Record<string, readonly string[]>> = {
  hat: ['hat-pith', 'hat-cap', 'hat-beanie', 'hat-bucket', 'hat-straw', 'hat-top', 'hat-beret', 'hat-flat', 'hat-captain', 'hat-pilot', 'hat-crown', 'hat-horned', 'hat-flowers', 'hat-headphones', 'hat-party', 'hat-guild'],
  back: ['back-pennant', 'back-guitar', 'back-surfboard', 'back-maptube', 'back-jetpack', 'back-wings', 'back-kite', 'back-satchel'],
  trail: ['trail-sparkles', 'trail-petals', 'trail-bubbles', 'trail-embers', 'trail-confetti', 'trail-rainbow'],
  title: [
    'title-newcomer', 'title-explorer', 'title-globetrotter', 'title-wanderer', 'title-sightseer', 'title-ace', 'title-courier', 'title-lifeguard', 'title-hiker',
    'title-roadtripper', 'title-aviator', 'title-oldsalt', 'title-deepdiver', 'title-collector', 'title-socialite', 'title-astronaut', 'title-voyager',
    'title-photographer', 'title-regular', 'title-seasoned', 'title-veteran', 'title-legend', 'title-committed', 'title-pathfinder', 'title-devoted', 'title-postcards',
  ],
  canopy: ['canopy-sky', 'canopy-lagoon', 'canopy-meadow', 'canopy-chequer', 'canopy-candy', 'canopy-night', 'canopy-rainbow', 'canopy-royal'],
  pet: ['pet-dog'],
};

/** The milestones and quests the progression defines; an unlock may name no other. */
const MILESTONES = ['globetrotter', 'wanderer', 'sightseer', 'racer', 'courier', 'rescuer', 'hiker', 'driver', 'aviator', 'sailor', 'diver', 'collector', 'socialite', 'astronaut', 'voyager', 'photographer', 'regular', 'postcards'];
const QUESTS = ['welcome', 'first-steps', 'say-hello', 'take-the-wheel', 'odd-job', 'on-course', 'ring-bearer', 'new-look', 'stamped', 'far-horizons', 'path-complete'];
/** How many base-36 digits each slot has on the wire. */
const DIGITS: Readonly<Record<string, number>> = { hat: 1, back: 1, trail: 1, title: 2, canopy: 1, pet: 1 };

const summary = (over: Partial<UnlockSummary>): UnlockSummary => ({ ...NO_PROGRESS, ...over });

console.log('\nthe catalogue:');
{
  const ids = new Set<string>();
  for (const item of COSMETICS) {
    if (ids.has(item.id)) fail(`${item.id} is in the catalogue twice`);
    ids.add(item.id);
    if (cosmeticById(item.id) !== item) fail(`${item.id} does not look itself up`);
  }
  for (const slot of COSMETIC_SLOTS) {
    const table = BY_SLOT[slot];
    table.forEach((item, i) => {
      if (item.slot !== slot) fail(`${item.id} is in the ${slot} table and says it is a ${item.slot}`);
      if (item.index !== i + 1) fail(`${item.id} is the ${i + 1}th ${slot} with index ${item.index}`);
      if (cosmeticAt(slot, item.index) !== item) fail(`${slot} ${item.index} does not come back as ${item.id}`);
    });
    const ledger = LEDGER[slot] ?? [];
    ledger.forEach((id, i) => {
      if (table[i]?.id !== id) fail(`${slot} ${i + 1} was ${id} and is ${table[i]?.id ?? 'gone'}: the tables are append-only`);
    });
    if (table.length > ledger.length) fail(`${slot}: ${table.length - ledger.length} items past the ledger; append their ids to LEDGER in this file`);
    if (table.length >= 36 ** DIGITS[slot]!) fail(`${slot}: ${table.length} items, more than ${DIGITS[slot]} digit(s) hold`);
    if (cosmeticAt(slot, 0) !== null || cosmeticAt(slot, table.length + 1) !== null) fail(`${slot}: nothing and past the end are not null`);
  }
  if (!MODELLED) fail('a hat or a back piece has no model');
  if (!TRAILED) fail('a trail has no kind');
  if (!PATTERNED) fail('a canopy has no pattern');
  if (!COMPANIONED) fail('a companion is not the dog');
  for (const item of COSMETICS) {
    const u = item.unlock;
    if (u.kind === 'milestone' && !MILESTONES.includes(u.id)) fail(`${item.id} asks for a milestone '${u.id}' the progression has not got`);
    if (u.kind === 'milestone' && MILESTONE_NAMES[u.id] === undefined) fail(`${item.id}: milestone '${u.id}' has no name`);
    if (u.kind === 'quest' && !QUESTS.includes(u.id)) fail(`${item.id} asks for a quest '${u.id}' the path has not got`);
    if (u.kind === 'quest' && QUEST_NAMES[u.id] === undefined) fail(`${item.id}: quest '${u.id}' has no name`);
    if (u.kind === 'level' && !(Number.isInteger(u.level) && u.level >= 2 && u.level <= 50)) fail(`${item.id} at level ${u.level}`);
  }
  // One title for each milestone, at silver.
  for (const id of MILESTONES) {
    if (!BY_SLOT.title.some((item) => item.unlock.kind === 'milestone' && item.unlock.id === id && item.unlock.tier === 2)) fail(`no title for silver in ${id}`);
  }
  console.log(`  ${COSMETICS.length} items in ${COSMETIC_SLOTS.length} slots, ${FREE_IDS.size} free; every one modelled, its index its place, the ledger kept`);
}

console.log('\nwhat earns what:');
{
  const none = unlockedOf(NO_PROGRESS);
  if (none.size !== FREE_IDS.size || [...none].some((id) => !FREE_IDS.has(id))) fail('a traveller with nothing done has more than the free items');
  if (!none.has('title-newcomer')) fail('Newcomer is not free');
  if (unlockedOf().size !== none.size) fail('unlockedOf with no summary is not the free items');
  const everything = summary({
    level: 50,
    achievements: new Map(MILESTONES.map((id) => [id, 3])),
    quests: new Set(QUESTS),
    streak: 30,
  });
  const all = unlockedOf(everything);
  if (all.size !== COSMETICS.length) fail(`everything done unlocks ${all.size} of ${COSMETICS.length}`);
  // The level ladder: something new at least every other level up to 15.
  const ladder: string[] = [];
  let quiet = 0;
  for (let level = 2; level <= 50; level++) {
    const got = newlyUnlocked(unlockedOf(summary({ level: level - 1 })), unlockedOf(summary({ level })));
    if (got.length > 0) ladder.push(`${level}:${got.map((item) => item.name).join('+')}`);
    if (level <= 15) {
      quiet = got.length === 0 ? quiet + 1 : 0;
      if (quiet >= 2) fail(`nothing new at levels ${level - 1} and ${level}`);
    }
  }
  if (!unlockedOf(summary({ level: 50 })).has('hat-crown')) fail('the crown is not level 50');
  console.log(`  by level: ${ladder.join(', ')}`);
  // Tiers are cumulative: gold holds what silver gave.
  for (const id of MILESTONES) {
    for (const tier of [1, 2] as const) {
      const lower = unlockedOf(summary({ achievements: new Map([[id, tier]]) }));
      const higher = unlockedOf(summary({ achievements: new Map([[id, tier + 1]]) }));
      if ([...lower].some((item) => !higher.has(item))) fail(`${id}: tier ${tier + 1} loses what tier ${tier} gave`);
    }
  }
  if (!unlockedOf(summary({ streak: 7 })).has('title-committed')) fail('a 7-day streak does not give Committed');
  if (unlockedOf(summary({ streak: 6 })).has('title-committed')) fail('a 6-day streak gives Committed');
  if (!unlockedOf(summary({ quests: new Set(['welcome']) })).has('hat-guild')) fail('the welcome quest does not give the Guild cap');
  if (!unlockedOf(summary({ quests: new Set(['path-complete']) })).has('pet-dog')) fail('finishing the path does not give the dog');
  const said = (id: string): string => conditionText(cosmeticById(id)!);
  const expect: [string, string][] = [
    ['hat-beret', 'Reach level 8'],
    ['hat-pilot', 'Gold in Aviator'],
    ['title-globetrotter', 'Silver in Globetrotter'],
    ['title-explorer', "Finish The Explorer's Path"],
    ['title-committed', 'A 7-day commission streak'],
    ['hat-guild', 'Finish the quest “Welcome”'],
  ];
  for (const [id, text] of expect) if (said(id) !== text) fail(`${id} says "${said(id)}", not "${text}"`);
  const named = conditionText(cosmeticById('hat-guild')!, { quest: (id) => (id === 'welcome' ? 'Welcome to the Guild' : undefined) });
  if (named !== 'Finish the quest “Welcome to the Guild”') fail(`a caller's own quest name is not used: ${named}`);
  console.log(`  nothing done: ${none.size} items; everything done: ${all.size}; tiers cumulative; ${expect.length} conditions worded as the card says them`);
}
