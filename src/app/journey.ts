/**
 * Leaving Earth's page: a journey to another world asked from the chat, and
 * the way back to the solar system. Both cover the screen and reload, since
 * every world is built under the loading screen.
 */
import type { PlayMode } from '../world-host.ts';
import { TO_SYSTEM_KEY, TRAVEL_KEY } from './storage.ts';

/** Where the chat asked to go, kept across the reload. */
export interface Journey {
  world: string;
  lat: number;
  lon: number;
  name: string;
  /** A journey asked online arrives online. */
  mode: PlayMode;
}

/** The journey this page was loaded for, read once and removed; null for none. */
export function takeJourney(): Journey | null {
  try {
    const raw = sessionStorage.getItem(TRAVEL_KEY);
    sessionStorage.removeItem(TRAVEL_KEY);
    if (raw === null) return null;
    const journey = JSON.parse(raw) as Partial<Journey>;
    if (typeof journey.world !== 'string' || typeof journey.lat !== 'number' || typeof journey.lon !== 'number') return null;
    if (!Number.isFinite(journey.lat) || !Number.isFinite(journey.lon) || Math.abs(journey.lat) > 90) return null;
    return {
      world: journey.world,
      lat: journey.lat,
      lon: journey.lon,
      name: typeof journey.name === 'string' ? journey.name : '',
      mode: journey.mode === 'online' ? 'online' : 'offline',
    };
  } catch {
    return null;
  }
}

/** Whether this load was asked to go straight to the solar system; the flag is consumed. */
export function takeToSystem(): boolean {
  let toSystem = false;
  try {
    toSystem = sessionStorage.getItem(TO_SYSTEM_KEY) === '1';
    sessionStorage.removeItem(TO_SYSTEM_KEY);
  } catch {
    // No storage: the title, as usual.
  }
  return toSystem;
}

/** Fades a cream cover over the page, then loads `next`. */
function coverAndGo(next: URL): void {
  const cover = document.createElement('div');
  cover.style.cssText = 'position:fixed;inset:0;z-index:40;opacity:0;transition:opacity 0.35s ease;background:radial-gradient(circle at 50% 42%,#fff2e8 0 35%,#fde6e1 100%)';
  document.body.appendChild(cover);
  void cover.offsetWidth;
  cover.style.opacity = '1';
  window.setTimeout(() => location.assign(next.toString()), 380);
}

/** Off to another world: the journey is stored and the page reloads without the parameters that would send it elsewhere. */
export function travelTo(world: string, lat: number, lon: number, name: string, mode: PlayMode): void {
  try {
    sessionStorage.setItem(TRAVEL_KEY, JSON.stringify({ world, lat, lon, name, mode }));
  } catch {
    // No storage, no journey: the page comes back to the title.
  }
  const next = new URL(location.href);
  for (const key of ['at', 'world', 'site']) next.searchParams.delete(key);
  coverAndGo(next);
}

/** Reloads straight to the solar system, keeping every parameter but `?at=`. */
/** The page again, onto the title, where the traveller is dressed and the way to play chosen. */
export function reloadToTitle(): void {
  const next = new URL(location.href);
  next.searchParams.delete('at');
  coverAndGo(next);
}

export function reloadToSystem(): void {
  try {
    sessionStorage.setItem(TO_SYSTEM_KEY, '1');
  } catch {
    // Without it the page comes back to the title.
  }
  const next = new URL(location.href);
  next.searchParams.delete('at');
  coverAndGo(next);
}
