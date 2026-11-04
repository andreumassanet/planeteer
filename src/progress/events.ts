/**
 * What the game tells the progression: one small event for each thing a
 * traveller did. The game emits them (`progress.emit`); the stats, the
 * quests and the daily commissions all read the same stream.
 */
import type { GuildRole } from '../guild/roles.ts';

/** How the traveller was moving: on foot, in the water, at a wheel, astride, aloft, under sail or carried. */
export type MoveMode = 'walk' | 'run' | 'swim' | 'dive' | 'drive' | 'ride' | 'fly' | 'sail' | 'passenger';

export const MOVE_MODES: readonly MoveMode[] = ['walk', 'run', 'swim', 'dive', 'drive', 'ride', 'fly', 'sail', 'passenger'];

/**
 * One thing done. Distances are real metres (units over `SCENERY_SCALE`); a
 * medal is 3 gold, 2 silver, 1 bronze. A `ring`, a `stamp` and a `town` are
 * new ones only, emitted once their own record holds them.
 */
export type ProgressEvent =
  | { t: 'move'; mode: MoveMode; metres: number }
  | { t: 'jump' }
  | { t: 'talk'; key: string }
  | { t: 'board'; kind: string }
  | { t: 'ring'; landmark: string }
  | { t: 'course'; id: string; kind: 'air' | 'land' | 'sea'; medal: number; ms: number }
  | { t: 'job'; kind: 'errand' | 'taxi' | 'cargo' | 'rescue'; medal: number; points: number; iso: string }
  | { t: 'stamp'; iso: string }
  | { t: 'town'; key: string }
  | { t: 'visit'; landmark: string }
  | { t: 'depth'; metres: number }
  | { t: 'altitude'; metres: number }
  | { t: 'speed'; kmh: number }
  | { t: 'rocket' }
  | { t: 'world'; id: string }
  | { t: 'photo' }
  /** A landmark caught well in a photo: a postcard for the collection. */
  | { t: 'postcard'; landmark: string }
  | { t: 'emote'; e: string }
  | { t: 'honk' }
  | { t: 'sit' }
  | { t: 'chat' }
  | { t: 'map' }
  | { t: 'parachute' }
  | { t: 'guild'; place: string }
  | { t: 'npc'; role: GuildRole }
  | { t: 'topic'; id: string }
  /** Changed how they look. */
  | { t: 'look' }
  /** Set a destination on the map. */
  | { t: 'destination'; landmark: string }
  /** Reached the destination set. */
  | { t: 'arrive'; landmark: string };

export type ProgressEventType = ProgressEvent['t'];

/** The events that arrive many times a second, which the level and the milestones are checked after at most once a second. */
export const FREQUENT: ReadonlySet<ProgressEventType> = new Set(['move', 'depth', 'altitude', 'speed']);
