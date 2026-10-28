/**
 * One traveller's profile as one value: the name the others see, the look,
 * and the progress (the passport, the rings and the courses' bests), with
 * when the name and the look last changed. Read from this device's stores,
 * merged with an account's, and written back to them.
 *
 * The merge is pure and monotonic: nothing either side holds is lost, a set
 * is a union, a course keeps its best time and its best medal, a country its
 * earliest stamp; the name and the look are whichever changed last. Merging a
 * profile with itself gives it back, and the order of two does not matter.
 *
 * Anything read back is held to the same rules as what the stores accept,
 * since the account's row is the player's own to write.
 */
import { LOOK_KEY, decodeAppearance } from '../appearance.ts';
import { NAME_KEY } from '../peers/constants.ts';
import { PASSPORT_KEY, emptyPassport, mergePassports, parsePassport, serialisePassport } from '../passport.ts';
import type { PassportData } from '../passport.ts';
import { RINGS_KEY, emptyRecord, mergeRecords, parseRecord, serialiseRecord } from '../rings/store.ts';
import type { RingRecord } from '../rings/store.ts';

/** When the name and the look last changed on this device, and what they were then. */
export const CHANGES_KEY = 'atlas.account.changes';

/** The most stamps and rings a profile carries: far past the planets, short of a hostile row. */
const MAX_STAMPS = 2000;
const MAX_RINGS = 5000;

export interface Profile {
  version: 1;
  /** `''` for none. */
  name: string;
  /** When it was set, ms since the epoch; 0 when unknown, which loses to any known time. */
  nameAt: number;
  /** The traveller's wire code (`encodeAppearance`), or `''`. */
  look: string;
  lookAt: number;
  passport: PassportData;
  rings: RingRecord;
}

export type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyProfile(): Profile {
  return { version: 1, name: '', nameAt: 0, look: '', lookAt: 0, passport: emptyPassport(), rings: emptyRecord() };
}

/** A name an account may hold: what `profiles.name` accepts. */
export const ACCOUNT_NAME = /^[A-Za-z0-9 _.-]{2,20}$/;

/** A name as an account may hold it, or `''` when nothing of it is left. */
export function accountName(raw: string): string {
  const kept = raw.replace(/[^A-Za-z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
  return ACCOUNT_NAME.test(kept) ? kept : '';
}

const time = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 8.64e15 ? Math.floor(value) : 0;

const lookOf = (value: unknown): string => (typeof value === 'string' && decodeAppearance(value) !== null ? value : '');

/** A record read leniently, capped. */
function ringsOf(value: unknown): RingRecord {
  const record = parseRecord(JSON.stringify(value ?? null));
  if (record.landmarks.size > MAX_RINGS) record.landmarks = new Set([...record.landmarks].slice(0, MAX_RINGS));
  if (record.courses.size > MAX_RINGS) record.courses = new Map([...record.courses].slice(0, MAX_RINGS));
  return record;
}

function passportOf(value: unknown): PassportData {
  const passport = parsePassport(JSON.stringify(value ?? null));
  if (passport.stamps.length > MAX_STAMPS) passport.stamps.length = MAX_STAMPS;
  return passport;
}

/**
 * A profile from an account's row: its name and look columns and its
 * `progress` document. Whatever cannot be vouched for is left out.
 */
export function profileFromRow(row: { name?: unknown; look?: unknown; progress?: unknown }): Profile {
  const progress = typeof row.progress === 'object' && row.progress !== null && !Array.isArray(row.progress)
    ? (row.progress as Record<string, unknown>)
    : {};
  const name = typeof row.name === 'string' && ACCOUNT_NAME.test(row.name) ? row.name : '';
  const look = lookOf(row.look);
  return {
    version: 1,
    name,
    nameAt: name === '' ? 0 : time(progress.nameAt),
    look,
    lookAt: look === '' ? 0 : time(progress.lookAt),
    passport: passportOf(progress.passport),
    rings: ringsOf(progress.rings),
  };
}

/** The `progress` document a row keeps: everything but the name and the look, which are columns. */
export function progressOf(profile: Profile): Record<string, unknown> {
  return {
    version: 1,
    nameAt: profile.nameAt,
    lookAt: profile.lookAt,
    passport: JSON.parse(serialisePassport(profile.passport)) as unknown,
    rings: JSON.parse(serialiseRecord(profile.rings)) as unknown,
  };
}

/** One string for a profile, the same for equal profiles: what is compared to know whether anything changed. */
export function profileKey(profile: Profile): string {
  return JSON.stringify([profile.name, profile.nameAt, profile.look, profile.lookAt, progressOf(profile)]);
}

/** Of two values with a time, the later; at the same time a fixed order, so the merge is commutative. */
function later(a: string, aAt: number, b: string, bAt: number): [string, number] {
  if (a === '' || b === '') return a === '' ? [b, bAt] : [a, aAt];
  if (aAt !== bAt) return aAt > bAt ? [a, aAt] : [b, bAt];
  return a <= b ? [a, aAt] : [b, bAt];
}

export function mergeProfiles(a: Profile, b: Profile): Profile {
  const [name, nameAt] = later(a.name, a.nameAt, b.name, b.nameAt);
  const [look, lookAt] = later(a.look, a.lookAt, b.look, b.lookAt);
  return {
    version: 1,
    name,
    nameAt,
    look,
    lookAt,
    passport: mergePassports(a.passport, b.passport),
    rings: mergeRecords(a.rings, b.rings),
  };
}

function read(storage: ProfileStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: ProfileStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Full or blocked: the value holds for the visit.
  }
}

interface Changes {
  /** Whether this device has recorded them before. */
  known: boolean;
  name: string;
  nameAt: number;
  look: string;
  lookAt: number;
}

function readChanges(storage: ProfileStorage | null): Changes {
  let raw: unknown = null;
  try {
    raw = JSON.parse(read(storage, CHANGES_KEY) ?? 'null');
  } catch {
    // A damaged record: every time unknown.
  }
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    known: value.known === true,
    name: typeof value.name === 'string' ? value.name : '',
    nameAt: time(value.nameAt),
    look: typeof value.look === 'string' ? value.look : '',
    lookAt: time(value.lookAt),
  };
}

/**
 * The profile this device holds now. A name or a look that differs from the
 * one last recorded changed since, so it is dated `now` and the date kept;
 * one never recorded is dated 0, so a fresh device yields to the account. A
 * change is always dated after what it replaced, whatever the clock says.
 */
export function readLocalProfile(storage: ProfileStorage | null, now: number): Profile {
  const changes = readChanges(storage);
  const name = accountName(read(storage, NAME_KEY) ?? '');
  const look = lookOf(read(storage, LOOK_KEY));
  let dirty = !changes.known;
  if (name !== changes.name) {
    changes.nameAt = changes.known ? Math.max(now, changes.nameAt + 1) : 0;
    changes.name = name;
    dirty = true;
  }
  if (look !== changes.look) {
    changes.lookAt = changes.known ? Math.max(now, changes.lookAt + 1) : 0;
    changes.look = look;
    dirty = true;
  }
  changes.known = true;
  if (dirty) write(storage, CHANGES_KEY, JSON.stringify(changes));
  return {
    version: 1,
    name,
    nameAt: name === '' ? 0 : changes.nameAt,
    look,
    lookAt: look === '' ? 0 : changes.lookAt,
    passport: passportOf(safeParse(read(storage, PASSPORT_KEY))),
    rings: parseRecord(read(storage, RINGS_KEY)),
  };
}

function safeParse(text: string | null): unknown {
  try {
    return JSON.parse(text ?? 'null');
  } catch {
    return null;
  }
}

/** What changed on this device when a profile was written to it. */
export interface Written {
  name: boolean;
  look: boolean;
  passport: boolean;
  rings: boolean;
}

/**
 * Writes a profile into this device's stores, only where it differs, and
 * records the name's and the look's dates so they are not taken for changes.
 */
export function writeLocalProfile(storage: ProfileStorage | null, profile: Profile): Written {
  const written: Written = { name: false, look: false, passport: false, rings: false };
  if (profile.name !== '' && read(storage, NAME_KEY) !== profile.name) {
    write(storage, NAME_KEY, profile.name);
    written.name = true;
  }
  if (profile.look !== '' && read(storage, LOOK_KEY) !== profile.look) {
    write(storage, LOOK_KEY, profile.look);
    written.look = true;
  }
  const passport = serialisePassport(profile.passport);
  if (serialisePassport(passportOf(safeParse(read(storage, PASSPORT_KEY)))) !== passport) {
    write(storage, PASSPORT_KEY, passport);
    written.passport = true;
  }
  const rings = serialiseRecord(profile.rings);
  if (serialiseRecord(parseRecord(read(storage, RINGS_KEY))) !== rings) {
    write(storage, RINGS_KEY, rings);
    written.rings = true;
  }
  write(storage, CHANGES_KEY, JSON.stringify({ known: true, name: profile.name, nameAt: profile.nameAt, look: profile.look, lookAt: profile.lookAt }));
  return written;
}

/** What the stores hold, raw: compared on a timer to notice that something changed. */
export function localSignature(storage: ProfileStorage | null): string {
  return [NAME_KEY, LOOK_KEY, PASSPORT_KEY, RINGS_KEY].map((key) => read(storage, key) ?? '').join('\u0000');
}
