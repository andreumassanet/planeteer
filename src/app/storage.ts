/**
 * The player's settings kept on this device, and their keys. Every read and
 * write is wrapped: a private window can throw on the getter itself.
 */

export const SENSITIVITY_KEY = 'atlas.sensitivity.v1';
export const PERFORMANCE_KEY = 'atlas.performance.v1';
export const HINTS_KEY = 'atlas.hints.v1';
export const RESOLUTION_KEY = 'atlas.resolution.v1';
/** `{ volume, on }` for the sound effects. */
export const SOUND_KEY = 'atlas.sound.v1';
/** `{ volume, on }` for the music. */
export const MUSIC_KEY = 'atlas.music.v1';
/** `{ voices, chat }`: whether townsfolk speak aloud, and whether a chat line blips. */
export const VOICES_KEY = 'atlas.voices.v1';
/** Whether wakes, smoke and dust are drawn: `'0'` off, anything else on. */
export const EFFECTS_KEY = 'atlas.effects.v1';
/** Whether a crash shakes the camera: `'1'` or `'0'`; unset follows `prefers-reduced-motion`. */
export const SHAKE_KEY = 'atlas.shake.v1';
/** `'0'` when the weather is off. */
export const WEATHER_KEY = 'atlas.weather.v1';
/** Whether the map layer (flags, borders, names) is wanted. */
export const OVERLAY_KEY = 'atlas.overlay';
/** Whether the welcome card has been shown on this device. */
export const WELCOME_KEY = 'atlas.welcomed.v1';
/**
 * Where the player was, for the menu's "Continue in …". The shape is shared
 * with `menu.ts`: `{ lat, lon, name, iso, savedAt }`, where `iso` is `''` at sea.
 */
export const LAST_PLACE_KEY = 'atlas.lastPlace.v1';
/** Session flag: the next load goes straight to the solar system, past the title. */
export const TO_SYSTEM_KEY = 'atlas.toSystem';
/** Session record of a journey asked from the chat (`/goto`, `/tp`), read on the next load. */
export const TRAVEL_KEY = 'atlas.travel';

export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not kept; the value still holds for this session.
  }
}

/** A boolean setting kept as `'1'`/`'0'`, in the getter/setter shape the settings cards take. */
export function storedToggle(key: string, fallback: boolean): { get(): boolean; set(on: boolean): boolean } {
  return {
    get: () => (fallback ? readSetting(key) !== '0' : readSetting(key) === '1'),
    set: (on) => {
      writeSetting(key, on ? '1' : '0');
      return on;
    },
  };
}
