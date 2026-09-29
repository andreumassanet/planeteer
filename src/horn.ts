/**
 * The horn held for as long as its key is, here and for everyone who hears
 * it: the driver's side (`createHornKey`) and the listeners' (`createHornChorus`).
 *
 * **The wire says when a horn starts and when it stops, and the stop can be
 * lost.** So a held horn says it is still held every `HONK_REFRESH_MS`, and a
 * listener that hears nothing for `HONK_HOLD_MS` lets it go by itself; a
 * driver who leaves (`bye`) is let go at once. What goes out is what
 * `spendHonk` allows, the same function the relay passes it by, so nothing
 * the game sends is dropped on the way for pacing — a start refused because
 * the last one was too recent is simply sent a few frames later, while the
 * key is still down.
 *
 * Neither half touches the audio or the socket: they are handed a way to
 * sound a horn and a way to send, so `pnpm input` drives both with a clock.
 */
import { HONK_HOLD_MS, HONK_REFRESH_MS, HONK_TAP_MS, freshHonk, spendHonk } from '../server/src/limits.ts';
import type { Honk } from '../server/src/limits.ts';

/** A horn sounding until it is released: `Audio.holdHorn`'s. */
export interface HornSound {
  level(near: number): void;
  release(): void;
}

/** How a horn is sounded: null when it cannot be (the audio not yet unlocked). */
export type SoundHorn = (voice: Honk, near: number) => HornSound | null;

/** What the driver's side sends: a start, a refresh or a stop. */
export interface HonkMessage {
  t: 'honk';
  k: Honk;
  on: boolean;
}

export interface HornKey {
  /** The voice sounding, or null when the key is up. */
  readonly voice: Honk | null;
  /** The key went down at the controls of something with this horn. A second press while held is nothing. */
  press(voice: Honk, now: number): void;
  /** The key came up, the window lost the keyboard, or the seat was left. */
  release(now: number): void;
  /**
   * Every frame, with the horn the controls in hand have now: null when there
   * are none, or when the keyboard is not the world's. Anything but the voice
   * that is sounding lets it go; otherwise the hold is refreshed on the wire.
   */
  update(now: number, voice: Honk | null): void;
}

export function createHornKey(sound: SoundHorn, send: (message: HonkMessage) => void): HornKey {
  let voice: Honk | null = null;
  let playing: HornSound | null = null;
  let sentAt = -Infinity;
  const pace = freshHonk();

  const start = (now: number): void => {
    if (voice === null || !spendHonk(pace, true, now)) return;
    sentAt = now;
    send({ t: 'honk', k: voice, on: true });
  };

  const key: HornKey = {
    get voice() {
      return voice;
    },
    press(next, now) {
      if (voice !== null) return;
      voice = next;
      playing = sound(next, 1);
      start(now);
    },
    release(now) {
      if (voice === null) return;
      playing?.release();
      playing = null;
      if (spendHonk(pace, false, now)) send({ t: 'honk', k: voice, on: false });
      voice = null;
    },
    update(now, allowed) {
      if (voice === null) return;
      if (allowed !== voice) {
        key.release(now);
        return;
      }
      // Not yet on the wire (paced out a moment ago), or due its refresh.
      if (!pace.on || now - sentAt >= HONK_REFRESH_MS) start(now);
    },
  };
  return key;
}

export interface HornChorus {
  /** How many other players' horns are held right now, heard or out of earshot. */
  readonly held: number;
  /**
   * A honk from another player: `on` true a start or a refresh, false a stop,
   * undefined a tap from an older client. `near` is 1 beside them and 0 or
   * less out of earshot.
   */
  hear(id: string, voice: Honk, on: boolean | undefined, now: number, near: number): void;
  /**
   * Every frame: each held horn at how near its player is now (`near`, null
   * for a player no longer known), and let go past its time.
   */
  update(now: number, near: (id: string) => number | null): void;
  /** That player's horn let go: they left. */
  stop(id: string): void;
  /** Every horn let go: the page is going away from the world. */
  stopAll(): void;
}

/** Quieter than this and a horn is not sounded at all. */
const EARSHOT = 0.02;

export function createHornChorus(sound: SoundHorn): HornChorus {
  interface Held {
    voice: Honk;
    until: number;
    playing: HornSound | null;
  }
  const horns = new Map<string, Held>();

  const stop = (id: string): void => {
    const held = horns.get(id);
    if (held === undefined) return;
    held.playing?.release();
    horns.delete(id);
  };

  return {
    get held() {
      return horns.size;
    },
    hear(id, voice, on, now, near) {
      if (on === false) {
        stop(id);
        return;
      }
      const until = now + (on === true ? HONK_HOLD_MS : HONK_TAP_MS);
      let held = horns.get(id);
      if (held !== undefined && held.voice !== voice) {
        stop(id);
        held = undefined;
      }
      if (held === undefined) {
        held = { voice, until, playing: near > EARSHOT ? sound(voice, near) : null };
        horns.set(id, held);
        return;
      }
      held.until = Math.max(held.until, until);
    },
    update(now, near) {
      for (const [id, held] of horns) {
        const level = now > held.until ? null : near(id);
        if (level === null) {
          stop(id);
          continue;
        }
        if (level <= EARSHOT) {
          held.playing?.release();
          held.playing = null;
        } else if (held.playing === null) held.playing = sound(held.voice, level);
        else held.playing.level(level);
      }
    },
    stop,
    stopAll() {
      for (const id of [...horns.keys()]) stop(id);
    },
  };
}
