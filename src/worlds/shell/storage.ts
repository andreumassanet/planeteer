/** The keys the shell stores under (Earth's own, for what both share), and a localStorage that may be absent. */

export const OVERLAY_KEY = 'atlas.overlay';
export const WELCOME_KEY = 'atlas.welcomed.v1';
export const LAST_PLACE_KEY = 'atlas.lastPlace.v1';

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
    // Nowhere to remember it; it holds for this visit.
  }
}
