/**
 * The milestones: seventeen measures of a traveller, each with three tiers
 * (bronze, silver, gold). A tier is reached when the measure meets its
 * threshold and is never lost, since every measure only grows. Each tier
 * reached is worth `TIER_XP`.
 */
import type { IconName } from '../ui.ts';
import type { Tally } from './tally.ts';

export type AchievementId =
  | 'globetrotter' | 'wanderer' | 'sightseer' | 'racer' | 'courier' | 'rescuer' | 'hiker' | 'driver' | 'aviator'
  | 'sailor' | 'diver' | 'collector' | 'socialite' | 'astronaut' | 'voyager' | 'photographer' | 'regular' | 'postcards';

export interface Achievement {
  id: AchievementId;
  title: string;
  /** One line: what it counts. */
  description: string;
  icon: IconName;
  /** The bronze, silver and gold thresholds, in `unit`s. */
  tiers: readonly [number, number, number];
  unit: string;
  measure(tally: Tally): number;
}

/** What reaching each tier is worth, by tier: bronze, silver, gold. */
export const TIER_XP: readonly [number, number, number] = [100, 250, 600];
export const TIER_NAMES: readonly [string, string, string] = ['Bronze', 'Silver', 'Gold'];

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'globetrotter', title: 'Globetrotter', description: 'Countries stamped in your passport.', icon: 'passport', tiers: [5, 25, 75], unit: 'countries', measure: (t) => t.countries },
  { id: 'wanderer', title: 'Wanderer', description: 'Towns walked into.', icon: 'pin', tiers: [10, 100, 500], unit: 'towns', measure: (t) => t.towns },
  { id: 'sightseer', title: 'Sightseer', description: 'Gold rings flown through over landmarks.', icon: 'star', tiers: [3, 20, 60], unit: 'rings', measure: (t) => t.landmarks },
  { id: 'racer', title: 'Racer', description: 'Ring courses won with a gold medal.', icon: 'trophy', tiers: [1, 10, 30], unit: 'golds', measure: (t) => t.golds },
  { id: 'courier', title: 'Courier', description: 'Jobs done: errands, fares, loads and rescues.', icon: 'hand', tiers: [5, 40, 200], unit: 'jobs', measure: (t) => t.jobs },
  { id: 'rescuer', title: 'Rescuer', description: 'People brought home safe.', icon: 'help', tiers: [1, 10, 40], unit: 'rescues', measure: (t) => t.rescues },
  { id: 'hiker', title: 'Hiker', description: 'Kilometres walked and run.', icon: 'walk', tiers: [5, 50, 250], unit: 'km', measure: (t) => t.footKm },
  { id: 'driver', title: 'Driver', description: 'Kilometres driven and ridden.', icon: 'car', tiers: [20, 200, 1000], unit: 'km', measure: (t) => t.driveKm },
  { id: 'aviator', title: 'Aviator', description: 'Kilometres flown.', icon: 'plane', tiers: [200, 4000, 40000], unit: 'km', measure: (t) => t.flyKm },
  { id: 'sailor', title: 'Sailor', description: 'Kilometres sailed.', icon: 'boat', tiers: [10, 100, 500], unit: 'km', measure: (t) => t.sailKm },
  { id: 'diver', title: 'Diver', description: 'Your deepest dive, in metres.', icon: 'sub', tiers: [8, 30, 80], unit: 'm', measure: (t) => t.deepest },
  { id: 'collector', title: 'Collector', description: 'Kinds of vehicle taken.', icon: 'seat', tiers: [3, 8, 14], unit: 'kinds', measure: (t) => t.kinds },
  { id: 'socialite', title: 'Socialite', description: 'People talked to.', icon: 'talk', tiers: [5, 30, 150], unit: 'people', measure: (t) => t.people },
  { id: 'astronaut', title: 'Astronaut', description: 'Rockets launched.', icon: 'rise', tiers: [1, 5, 20], unit: 'rockets', measure: (t) => t.rockets },
  { id: 'voyager', title: 'Voyager', description: 'Other worlds stood on.', icon: 'orbit', tiers: [1, 3, 8], unit: 'worlds', measure: (t) => t.worlds },
  { id: 'photographer', title: 'Photographer', description: 'Photos taken.', icon: 'camera', tiers: [5, 50, 250], unit: 'photos', measure: (t) => t.photos },
  { id: 'postcards', title: 'Postcards', description: 'Landmarks caught well in a photo.', icon: 'camera', tiers: [3, 20, 60], unit: 'postcards', measure: (t) => t.postcards },
  { id: 'regular', title: 'Regular', description: 'Days spent exploring.', icon: 'calendar', tiers: [3, 15, 60], unit: 'days', measure: (t) => t.days },
];

export const ACHIEVEMENT_IDS: readonly AchievementId[] = ACHIEVEMENTS.map((a) => a.id);

export const achievementById = (id: string): Achievement | undefined => ACHIEVEMENTS.find((a) => a.id === id);

/** One milestone as it stands: its tier, its measure and the next threshold (null at gold). */
export interface MilestoneState {
  id: AchievementId;
  title: string;
  description: string;
  icon: IconName;
  unit: string;
  tiers: readonly [number, number, number];
  /** 0 none, 1 bronze, 2 silver, 3 gold. */
  tier: number;
  /** The measure: whole, or to a tenth for kilometres. */
  value: number;
  next: number | null;
  /** The threshold of the tier reached, 0 for none. */
  from: number;
}

/** The tier a measure reaches against three thresholds. */
export function tierOf(value: number, tiers: readonly [number, number, number]): number {
  let tier = 0;
  for (const threshold of tiers) if (value >= threshold) tier++;
  return tier;
}

const shown = (value: number, unit: string): number => (unit === 'km' ? Math.floor(value * 10) / 10 : Math.floor(value));

export function achievementsOf(tally: Tally): MilestoneState[] {
  return ACHIEVEMENTS.map((a) => {
    const value = Math.max(0, a.measure(tally));
    const tier = tierOf(value, a.tiers);
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      icon: a.icon,
      unit: a.unit,
      tiers: a.tiers,
      tier,
      value: shown(value, a.unit),
      next: tier < 3 ? a.tiers[tier]! : null,
      from: tier > 0 ? a.tiers[tier - 1]! : 0,
    };
  });
}

/** The XP every tier reached is worth, all milestones together. */
export function milestoneXp(milestones: readonly MilestoneState[]): number {
  let xp = 0;
  for (const m of milestones) for (let t = 0; t < m.tier; t++) xp += TIER_XP[t]!;
  return xp;
}
