/**
 * The keys that are settings rather than controls, and the horn. The detail
 * knob's `[` and `]` step geometrically (a quarter of the value) and repeat
 * while held; the toggles ignore key repeat.
 */
import { actionOf, inputBlocked, labelOf } from '../controls.ts';
import { DETAIL_MAX, DETAIL_MIN, detail, setDetail } from '../view.ts';
import { HORN_OF } from '../craft/contract.ts';
import { createHornChorus, createHornKey } from '../horn.ts';
import type { HornChorus, HornKey } from '../horn.ts';
import { cleanHonk, cleanHonkOn } from '../../server/src/limits.ts';
import type { Honk } from '../../server/src/limits.ts';
import type { App } from './context.ts';

/** How far another player's horn carries, units: twice a traffic horn, since it is meant to be heard. */
const HORN_REACH = 240;

export interface Horns {
  /** The horn the player could sound now: the driver's seat of anything with one, and no card holding the keyboard. */
  inHand(): Honk | null;
  key: HornKey;
  chorus: HornChorus;
  /** How near another player's horn is heard, 1 beside them to 0 at `HORN_REACH`; null for an unknown player. */
  near(id: string): number | null;
}

export function listenForSettingKeys(app: App): void {
  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (inputBlocked(event)) return;
    const action = actionOf(event.code);
    if (action === 'nearer') app.showDetail(setDetail(Math.max(DETAIL_MIN, detail() / 1.25)));
    else if (action === 'farther') app.showDetail(setDetail(Math.min(DETAIL_MAX, detail() * 1.25)));
    if (event.repeat) return;
    if (action === 'flags') app.announce(app.overlay.set(!app.overlay.on) ? 'Flags and borders on' : 'Flags and borders off', 'flag');
    // Not kept across a reload: an empty screen after one looks broken.
    else if (action === 'hud') app.announce(app.hud.toggleHidden() ? `Everything hidden · ${labelOf('hud')} brings it back` : 'Everything back', 'eye');
    else if (action === 'photo') app.photoWanted = true;
    else if ((action === 'wave' || action === 'dance') && !app.gestures.gesture(action)) app.announce('Only standing on the ground', 'walk');
    else if (action === 'horn') {
      const voice = app.horns.inHand();
      if (voice !== null) app.horns.key.press(voice, performance.now());
    }
  });
}

/**
 * The horn is held for as long as its key is (`horn.ts`): heard here at
 * once, and by the others from the relay's start message to its stop.
 * Others' horns are heard quieter with distance and stop when they leave.
 */
export function createHorns(app: App): Horns {
  const { player, peers } = app;
  const { audio } = app.sound;
  const inHand = (): Honk | null => {
    const ride = player.ride;
    if (ride === null || ride.seat !== 0 || inputBlocked()) return null;
    return HORN_OF[ride.model.kind];
  };
  const key = createHornKey((voice, near) => audio.holdHorn(voice, near), (message) => {
    peers?.send({ ...message });
  });
  addEventListener('keyup', (event) => {
    if (actionOf(event.code) === 'horn') key.release(performance.now());
  });
  // A key released while the window is elsewhere never says so.
  addEventListener('blur', () => key.release(performance.now()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      key.release(performance.now());
      chorus.stopAll();
    }
  });
  const chorus = createHornChorus((voice, near) => audio.holdHorn(voice, near));
  const near = (id: string): number | null => {
    const from = peers?.positionOf(id) ?? null;
    return from === null ? null : 1 - from.distanceTo(player.position) / HORN_REACH;
  };
  peers?.onMessage((message) => {
    if (typeof message.id !== 'string') return;
    if (message.t === 'bye') {
      chorus.stop(message.id);
      return;
    }
    if (message.t !== 'honk') return;
    const voice = cleanHonk(message.k);
    const on = cleanHonkOn(message.on);
    const distance = near(message.id);
    if (voice === '' || on === null || distance === null) return;
    chorus.hear(message.id, voice, on, performance.now(), distance);
  });
  return { inHand, key, chorus, near };
}
