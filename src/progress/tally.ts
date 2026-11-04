/**
 * What a traveller has done, counted once from every record that holds it:
 * the passport (countries, towns), the rings (landmarks, the courses' best
 * medals), the jobs (by kind, the reputation) and the career's stats. The
 * milestones, the XP and the leaderboard's scores all read this one count.
 */
import type { PassportData } from '../passport.ts';
import type { RingRecord } from '../rings/store.ts';
import type { JobRecord } from '../jobs/store.ts';
import { reputationOf } from '../jobs/store.ts';
import type { MoveMode } from './events.ts';
import { countOf, sizeOf } from './stats.ts';
import type { Stats } from './stats.ts';

export interface Tally {
  /** Countries stamped, on every world. */
  countries: number;
  towns: number;
  /** Landmark rings collected. */
  landmarks: number;
  /** Courses with a best run, and how many of those bests are each medal. */
  courses: number;
  golds: number;
  silvers: number;
  bronzes: number;
  jobs: number;
  rescues: number;
  /** The jobs' reputation, every country summed. */
  reputation: number;
  /** Kilometres on foot (walked and run), driven and ridden, flown, sailed, swum (and dived). */
  footKm: number;
  driveKm: number;
  flyKm: number;
  sailKm: number;
  swimKm: number;
  /** The deepest dive and the highest climb, metres; the top speed, km/h. */
  deepest: number;
  highest: number;
  fastest: number;
  /** Kinds of vehicle taken, people talked to, other worlds stood on. */
  kinds: number;
  people: number;
  worlds: number;
  rockets: number;
  photos: number;
  /** Landmarks caught in a photo. */
  postcards: number;
  /** Days played. */
  days: number;
}

export interface TallySources {
  passport: PassportData;
  rings: RingRecord;
  jobs: JobRecord;
  stats: Stats;
}

const km = (stats: Stats, modes: readonly MoveMode[]): number => modes.reduce((sum, mode) => sum + countOf(stats, mode), 0) / 1000;

export function tallyOf(sources: TallySources): Tally {
  const { passport, rings, jobs, stats } = sources;
  let golds = 0;
  let silvers = 0;
  let bronzes = 0;
  for (const best of rings.courses.values()) {
    if (best.medal === 3) golds++;
    else if (best.medal === 2) silvers++;
    else if (best.medal === 1) bronzes++;
  }
  const reputation = reputationOf(jobs);
  return {
    countries: passport.stamps.length,
    towns: passport.towns.length,
    landmarks: rings.landmarks.size,
    courses: rings.courses.size,
    golds,
    silvers,
    bronzes,
    jobs: jobs.done.size,
    rescues: reputation.byKind.rescue,
    reputation: reputation.total,
    footKm: km(stats, ['walk', 'run']),
    driveKm: km(stats, ['drive', 'ride']),
    flyKm: km(stats, ['fly']),
    sailKm: km(stats, ['sail']),
    swimKm: km(stats, ['swim', 'dive']),
    deepest: countOf(stats, 'depth'),
    highest: countOf(stats, 'altitude'),
    fastest: countOf(stats, 'speed'),
    kinds: sizeOf(stats, 'kinds'),
    people: sizeOf(stats, 'people'),
    worlds: sizeOf(stats, 'worlds'),
    rockets: countOf(stats, 'rockets'),
    photos: countOf(stats, 'photos'),
    postcards: sizeOf(stats, 'postcards'),
    days: stats.days.size,
  };
}
