/**
 * Every cosmetic there is, by slot: what it is called, its wire index and
 * what earns it.
 *
 * The tables are append-only. An item's `index` is what the look code carries
 * (`appearance.ts`, 0 being nothing worn) and its `id` is what the "seen" set
 * and the progression name it by, so a renumbered table redresses every
 * traveller and a renamed id forgets what they had seen. A new item goes on
 * the end of its slot with the next index.
 *
 * The level ladder gives something every level or two up to 15 and is
 * rarer after, to 50; the milestones give one title each at silver and a few
 * things at gold; The Explorer's Path gives the Guild's own pieces.
 */
import type { Unlock } from './unlocks.ts';

export type CosmeticSlot = 'hat' | 'back' | 'trail' | 'title' | 'canopy' | 'pet';
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = ['hat', 'back', 'trail', 'title', 'canopy', 'pet'];

export interface Cosmetic {
  /** Stable and unique across every slot. */
  id: string;
  slot: CosmeticSlot;
  /** On the wire: 1 and up, unique within its slot; 0 is nothing worn. */
  index: number;
  name: string;
  unlock: Unlock;
}

const free: Unlock = { kind: 'free' };
const level = (n: number): Unlock => ({ kind: 'level', level: n });
const milestone = (id: string, tier: 1 | 2 | 3): Unlock => ({ kind: 'milestone', id, tier });
const quest = (id: string): Unlock => ({ kind: 'quest', id });
const streak = (days: number): Unlock => ({ kind: 'streak', days });

type Entry = readonly [id: string, name: string, unlock: Unlock];

/** A slot's table, indexed from one in the order written. */
function table(slot: CosmeticSlot, entries: readonly Entry[]): readonly Cosmetic[] {
  return entries.map(([id, name, unlock], i) => ({ id, slot, index: i + 1, name, unlock }));
}

/** Hats, on the head bone, fitted to each head that takes one (`hats.ts`). Append-only. */
export const HATS = table('hat', [
  ['hat-pith', "Explorer's pith helmet", quest('path-complete')],
  ['hat-cap', 'Baseball cap', free],
  ['hat-beanie', 'Bobble beanie', free],
  ['hat-bucket', 'Bucket hat', level(2)],
  ['hat-straw', 'Straw sun hat', level(5)],
  ['hat-top', 'Top hat', level(12)],
  ['hat-beret', 'Beret', level(8)],
  ['hat-flat', 'Flat cap', level(3)],
  ['hat-captain', "Captain's hat", milestone('sailor', 3)],
  ['hat-pilot', "Pilot's cap and goggles", milestone('aviator', 3)],
  ['hat-crown', 'Crown', level(50)],
  ['hat-horned', 'Horned helmet', level(25)],
  ['hat-flowers', 'Flower crown', quest('new-look')],
  ['hat-headphones', 'Headphones', level(15)],
  ['hat-party', 'Party cone', streak(3)],
  ['hat-guild', 'Guild cap', quest('welcome')],
]);

/** What hangs on the back, on the chest bone (`back.ts`); the rucksack is a switch of its own. Append-only. */
export const BACKS = table('back', [
  ['back-pennant', 'Country pennant', level(10)],
  ['back-guitar', 'Guitar case', level(7)],
  ['back-surfboard', 'Surfboard', level(14)],
  ['back-maptube', 'Map tube', quest('far-horizons')],
  ['back-jetpack', 'Jetpack', level(30)],
  ['back-wings', 'Paper wings', level(40)],
  ['back-kite', 'Kite', level(20)],
  ['back-satchel', 'Guild satchel', quest('odd-job')],
]);

/** What follows the traveller about (`trails.ts`). Append-only. */
export const TRAILS = table('trail', [
  ['trail-sparkles', 'Sparkles', level(4)],
  ['trail-petals', 'Petals', level(9)],
  ['trail-bubbles', 'Bubbles', milestone('diver', 1)],
  ['trail-embers', 'Embers', level(22)],
  ['trail-confetti', 'Confetti', level(35)],
  ['trail-rainbow', 'Rainbow ribbon', milestone('racer', 3)],
]);

/** Under the name over the head (`titles.ts`). Append-only. */
export const TITLES = table('title', [
  ['title-newcomer', 'Newcomer', free],
  ['title-explorer', 'Explorer', quest('path-complete')],
  ['title-globetrotter', 'Globetrotter', milestone('globetrotter', 2)],
  ['title-wanderer', 'Wanderer', milestone('wanderer', 2)],
  ['title-sightseer', 'Sightseer', milestone('sightseer', 2)],
  ['title-ace', 'Ace', milestone('racer', 2)],
  ['title-courier', 'Courier', milestone('courier', 2)],
  ['title-lifeguard', 'Lifeguard', milestone('rescuer', 2)],
  ['title-hiker', 'Hiker', milestone('hiker', 2)],
  ['title-roadtripper', 'Road tripper', milestone('driver', 2)],
  ['title-aviator', 'Aviator', milestone('aviator', 2)],
  ['title-oldsalt', 'Old salt', milestone('sailor', 2)],
  ['title-deepdiver', 'Deep diver', milestone('diver', 2)],
  ['title-collector', 'Collector', milestone('collector', 2)],
  ['title-socialite', 'Socialite', milestone('socialite', 2)],
  ['title-astronaut', 'Astronaut', milestone('astronaut', 2)],
  ['title-voyager', 'Voyager', milestone('voyager', 2)],
  ['title-photographer', 'Photographer', milestone('photographer', 2)],
  ['title-regular', 'Regular', milestone('regular', 2)],
  ['title-seasoned', 'Seasoned', level(10)],
  ['title-veteran', 'Veteran', level(25)],
  ['title-legend', 'Legend', level(50)],
  ['title-committed', 'Committed', streak(7)],
  ['title-pathfinder', 'Pathfinder', level(18)],
  ['title-devoted', 'Devoted', streak(30)],
  ['title-postcards', 'Postcarder', milestone('postcards', 2)],
]);

/** Parachute canopies: colour pairs over the cells (`canopy.ts`); 0 is the gold-to-crimson one. Append-only. */
export const CANOPIES = table('canopy', [
  ['canopy-sky', 'Sky', free],
  ['canopy-lagoon', 'Lagoon', level(6)],
  ['canopy-meadow', 'Meadow', level(11)],
  ['canopy-chequer', 'Chequer', level(13)],
  ['canopy-candy', 'Candy', level(17)],
  ['canopy-night', 'Night', level(28)],
  ['canopy-rainbow', 'Rainbow', level(33)],
  ['canopy-royal', 'Royal', level(45)],
]);

/** A companion that trots after the traveller (`companions.ts`). Append-only. */
export const PETS = table('pet', [['pet-dog', 'Dog', quest('path-complete')]]);

/** Every slot's table. */
export const BY_SLOT: Readonly<Record<CosmeticSlot, readonly Cosmetic[]>> = {
  hat: HATS,
  back: BACKS,
  trail: TRAILS,
  title: TITLES,
  canopy: CANOPIES,
  pet: PETS,
};

/** Every cosmetic, slot by slot. */
export const COSMETICS: readonly Cosmetic[] = COSMETIC_SLOTS.flatMap((slot) => BY_SLOT[slot]);

const BY_ID = new Map(COSMETICS.map((item) => [item.id, item]));

/** The item `id` names, or undefined. */
export const cosmeticById = (id: string): Cosmetic | undefined => BY_ID.get(id);

/** The item worn at `index` in `slot`, or null for nothing (0) or an index this build has not got. */
export function cosmeticAt(slot: CosmeticSlot, index: number): Cosmetic | null {
  if (!(index >= 1)) return null;
  return BY_SLOT[slot][index - 1] ?? null;
}
