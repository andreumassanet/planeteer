/**
 * What the menu remembers in `localStorage`: the last spawn it started from and
 * the game's own record of where you were. Every read and write is wrapped, and
 * every field of a stored record is checked.
 */
import { catalogueOf } from './catalogue.ts';
import type { MenuCtx } from './context.ts';
import type { MenuSpawn } from './types.ts';

/** Storage key of the last spawn. */
const REMEMBERED = 'atlas.menu.spawn.v1';

/**
 * Storage key the running world writes `{ lat, lon, name, iso, savedAt }` to.
 * The menu only reads it, and trusts none of it (`recallPlace`).
 */
const LAST_PLACE = 'atlas.lastPlace.v1';

/** Longer than this and a remembered name is not a place name. */
const MAX_NAME = 60;

/** A remembered start, and when it was remembered: the newer memory wins. */
interface Remembered {
  spawn: MenuSpawn;
  /** `Date.now()` when written; 0 for a record without one. */
  savedAt: number;
}

/** Where the last place was, as the game wrote it, checked field by field. */
interface LastPlace {
  lat: number;
  lon: number;
  /** The place name the game gave it, or empty. */
  name: string;
  /** The country's `ADM0_A3`, or empty. */
  iso: string;
  /** The body it was on; `'earth'` when the record names none. A world's `iso` is a region key on that body. */
  body: string;
  savedAt: number;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const shortText = (value: unknown): string => (typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '');
/** To (-180, 180], so a longitude written by anyone lands on this planet's range. */
const wrapLon = (lon: number): number => lon - 360 * Math.ceil((lon - 180) / 360);

export function remember(spawn: MenuSpawn): void {
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify({ ...spawn, savedAt: Date.now() }));
  } catch {
    /* A private window throws on every write; the menu simply forgets. */
  }
}

function recall(): Remembered | null {
  try {
    const raw = localStorage.getItem(REMEMBERED);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (!finite(record['lat']) || !finite(record['lon']) || Math.abs(record['lat']) > 90) return null;
    return {
      spawn: {
        body: shortText(record['body']) || 'earth',
        region: shortText(record['region']),
        name: shortText(record['name']) || 'somewhere',
        lat: record['lat'],
        lon: wrapLon(record['lon']),
        ...(shortText(record['site']) === '' ? {} : { site: shortText(record['site']) }),
      },
      savedAt: finite(record['savedAt']) ? record['savedAt'] : 0,
    };
  } catch {
    return null;
  }
}

/** The game's own record of where you were, or null. Every field is checked, since another release wrote it. */
function recallPlace(): LastPlace | null {
  try {
    const raw = localStorage.getItem(LAST_PLACE);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (!finite(record['lat']) || !finite(record['lon']) || Math.abs(record['lat']) > 90) return null;
    return {
      lat: record['lat'],
      lon: wrapLon(record['lon']),
      name: shortText(record['name']),
      iso: shortText(record['iso']),
      body: shortText(record['body']) || 'earth',
      savedAt: finite(record['savedAt']) ? record['savedAt'] : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Where Continue goes: the newer of the game's record of where you were and the
 * town the menu last started you in. Either becomes an ordinary spawn.
 */
export function lastOf(ctx: MenuCtx): MenuSpawn | null {
  const { home } = ctx;
  const started = recall();
  const place = recallPlace();
  if (place === null || (started !== null && started.savedAt > place.savedAt)) return started?.spawn ?? null;
  // Another world's own record: where it was, with no settlement to land on.
  if (place.body !== home.id) return { body: place.body, region: '', name: place.name, lat: place.lat, lon: place.lon };
  const index = catalogueOf(ctx, home).regionIndexOf.get(place.iso) ?? home.regionAt(place.lat, place.lon);
  return {
    body: home.id,
    region: home.regions[index - 1]?.name ?? '',
    name: place.name,
    lat: place.lat,
    lon: place.lon,
  };
}
