import type { Honk } from '../../server/src/limits.ts';
import type { KnockVoice } from '../breakables/kinds.ts';

export type Surface = 'grass' | 'paving' | 'snow' | 'dirt';

export type Cue =
  | 'land'
  | 'ui-click'
  | 'ui-open'
  | 'ui-close'
  | 'ui-toggle'
  | 'ui-error'
  | 'ui-confirm'
  | 'book-open'
  | 'book-close'
  | 'page'
  | 'stamp';

/** What the world is doing this frame, as far as the ear cares. */
export interface Soundscape {
  /**
   * What the player is doing, which decides the engine: a car's is the launch's
   * outboard loop pitched up and opened out, a bus's and a tractor's the same loop
   * low and closed, a motorbike's and a jet ski's high and open; a helicopter's is
   * its rotor's chop; a balloon, a sail and a bicycle have none (a bicycle's
   * freewheel ticks as it coasts); a horse is its hooves; a swimmer hears the sea
   * and the wind. A saucer, on the other worlds, is a soft hum that warbles,
   * rising with its pace.
   */
  mode:
    | 'menu'
    | 'foot'
    | 'swim'
    | 'car'
    | 'heavy'
    | 'motorbike'
    | 'bicycle'
    | 'horse'
    | 'boat'
    | 'jetski'
    | 'sail'
    | 'plane'
    | 'helicopter'
    | 'balloon'
    | 'saucer';
  /** Units a second over the ground or the water. */
  speed: number;
  /** The craft's speed as a fraction of its range, 0 idle to 1 flat out. */
  throttle: number;
  /** The eye's height over the ground under it, in units. */
  height: number;
  /** How much of the surroundings is sea: 1 in a boat, in the water or on the beach, 0 inland. */
  sea: number;
  /** `sky.state.daylight`: 0 full night, 1 full day. */
  daylight: number;
  /** 1 in open country, 0 on a town's paving. Birds and crickets live in the first. */
  wild: number;
  /** Ice and tundra: no insects, no birdsong. */
  cold: boolean;
  /** Rain on and round you, 0 to 1 (`weather-view.ts`). Snow falls silent and is not counted. */
  rain?: number;
  /** How much of a gale the weather adds to the wind, 0 to 1. */
  gale?: number;
  /**
   * Whether the ear is under the water, 0 to 1: every sound, the music with it,
   * through a low-pass that closes to `MUFFLED` hertz and opens again on
   * surfacing.
   */
  underwater?: number;
  /** On wheels: how fast the tyres slide across the bow, units a second, for the squeal. */
  slip?: number;
  /** Seconds of a drift's boost left: a new one is heard as a rush. */
  boost?: number;
  /**
   * How much air there is to carry the wind, 1 on Earth and less on a world
   * with a thinner sky (`SkySpec.air`): none on the Moon, where nothing blows.
   */
  air?: number;
}

/** A horn sounding for as long as it is held: see `Audio.holdHorn`. */
export interface HeldHorn {
  /** How near it is now, 1 beside you and 0 out of earshot. */
  level(near: number): void;
  /** Let go: the chord closes over its release; a one-shot voice has nothing to let go. */
  release(): void;
}

export interface Audio {
  /** Call from a user gesture: opens the context and starts fetching the recordings. */
  unlock(): void;
  /** Every frame. A no-op until `unlock`. */
  update(dt: number, state: Soundscape): void;
  /** One footfall on this surface; `weight` 1 is a walk, more is a run or a landing. */
  step(surface: Surface, weight?: number): void;
  cue(name: Cue): void;
  /**
   * Something small knocked over, or landing (`breakables.ts`): a wooden crack
   * and thump, a metal clang, a soft thud, or a cartoon bonk; all synthesised.
   * `near` is 1 beside you and 0 out of earshot.
   */
  knock(voice: KnockVoice, near: number): void;
  /**
   * A horn, once: the traffic kept waiting, a driver's own, another player's.
   * `near` is 1 beside you and 0 out of earshot. Every voice is synthesised (no
   * CC0 pack this project reads has a horn, a bell or a horse): the held ones are
   * `HELD_CHORDS` for a moment, the struck ones (`HORN_HELD`) once: a bicycle's
   * bell, a tuk-tuk's rubber bulb, a horse's snort.
   */
  horn(near: number, voice?: Honk): void;
  /**
   * A horn held down, from now until its `release`: a driver's own while the key
   * is down, and another player's while they hold theirs. `near` is as `horn`'s
   * and can be moved while it sounds. The car's, bus's, boat's and motorbike's
   * are one chord held for as long as the key is, with a short attack and a
   * release; a bell, a bulb and a snort are struck once and are not held
   * (`HORN_HELD`). Null until `unlock`.
   */
  holdHorn(voice: Honk, near: number): HeldHorn | null;
  /**
   * Thunder, once, `delay` seconds from now (the flash's distance over the speed
   * of sound, which the caller knows) at `loudness` 1 overhead to 0 far off. A
   * crack of white noise when it is close, then brown noise under a falling
   * low-pass in three or four swells.
   */
  thunder(delay: number, loudness: number): void;
  /** An explosion, once, at `loudness` 1 beside it: a crack, a falling thump and a rumble rolling off. */
  boom(loudness: number): void;
  /** Holds the world silent, over the volume and the switch, while it builds behind a curtain; false lets it be heard again. */
  hush(on: boolean): void;
  /** 0 to 1, a linear gain on the master; the slider that sets it is logarithmic. */
  volume: number;
  muted: boolean;
  /**
   * The context and the last node before the speakers, the limiter every sound
   * shares, once `unlock` has opened them. The music joins here, past the
   * effects' master, so its volume and theirs are separate.
   */
  readonly output: { context: AudioContext; node: AudioNode } | null;
  /**
   * The effects' master, once `unlock` has opened it: where a sound made elsewhere
   * joins the world's (the townsfolk's voices, the chat's blip), so the volume and
   * the switch hold it as they hold a footstep.
   */
  readonly bus: GainNode | null;
  readonly stats: {
    unlocked: boolean;
    state: string;
    loaded: number;
    voices: number;
  };
}
