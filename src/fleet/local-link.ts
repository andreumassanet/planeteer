/** The fleet link for a world with nobody else in it: what you moved is kept on this machine for a day. */
import type { FleetLink, MovedVehicle } from '../craft/contract.ts';
import { isPose } from './pose.ts';

/** Where the local link keeps what was moved, and for how long. */
const LOCAL_KEY = 'atlas.fleet.moved';
const LOCAL_EXPIRY_MS = 24 * 3600 * 1000;
/** How often a pose being driven is written down, at most. */
const LOCAL_SAVE_MS = 2000;

interface LocalEntry {
  pose: number[];
  seats: (string | null)[];
  /** When it was last let go of, `Date.now()`. */
  at: number;
}

/**
 * A `FleetLink` for a world with nobody else in it.
 *
 * Every seat is yours for the asking, nobody else ever drives, and what you
 * moved is written to `localStorage` (every read and write wrapped, because
 * storage can be missing, full or refused) and forgotten after a day, when the
 * vehicle is back at its site.
 */
export function createLocalLink(self = 'local'): FleetLink {
  const entries = new Map<string, LocalEntry>();
  const moved = new Map<string, MovedVehicle>();
  const listeners = new Set<(vehicle: string) => void>();
  let savedAt = 0;

  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCAL_KEY);
    const parsed = raw === null ? null : (JSON.parse(raw) as unknown);
    if (parsed !== null && typeof parsed === 'object') {
      const now = Date.now();
      for (const [id, value] of Object.entries(parsed as Record<string, { pose?: unknown; at?: unknown }>)) {
        const pose = value?.pose;
        const at = value?.at;
        if (!Array.isArray(pose) || !isPose(pose as number[]) || typeof at !== 'number' || now - at > LOCAL_EXPIRY_MS) continue;
        entries.set(id, { pose: (pose as number[]).slice(0, 9), seats: [], at });
      }
    }
  } catch {
    // Unreadable storage is an empty one: every vehicle at its site.
  }
  for (const [id, entry] of entries) moved.set(id, { pose: entry.pose, seats: entry.seats });

  function save(): void {
    savedAt = Date.now();
    try {
      if (typeof localStorage === 'undefined') return;
      const out: Record<string, { pose: number[]; at: number }> = {};
      for (const [id, entry] of entries) if (isPose(entry.pose)) out[id] = { pose: entry.pose.map((v) => +v.toFixed(3)), at: entry.at };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(out));
    } catch {
      // Full or refused: the vehicle is where it is for this session.
    }
  }

  const tell = (vehicle: string): void => {
    for (const listener of listeners) listener(vehicle);
  };

  return {
    self,
    moved,
    sample() {
      return false;
    },
    claim(vehicle, seat) {
      let entry = entries.get(vehicle);
      const holder = entry?.seats[seat] ?? null;
      if (holder !== null && holder !== self) return Promise.resolve(false);
      if (entry === undefined) {
        entry = { pose: [], seats: [], at: Date.now() };
        entries.set(vehicle, entry);
      }
      entry.seats[seat] = self;
      moved.set(vehicle, { pose: entry.pose, seats: entry.seats });
      tell(vehicle);
      return Promise.resolve(true);
    },
    release(vehicle, pose) {
      const entry = entries.get(vehicle);
      if (entry === undefined) return;
      entry.seats = entry.seats.map((holder) => (holder === self ? null : holder));
      if (pose !== null && isPose(pose)) {
        entry.pose = pose.slice(0, 9);
        entry.at = Date.now();
      }
      if (!isPose(entry.pose) && entry.seats.every((holder) => holder === null)) {
        entries.delete(vehicle);
        moved.delete(vehicle);
      } else moved.set(vehicle, { pose: entry.pose, seats: entry.seats });
      save();
      tell(vehicle);
    },
    sink(vehicle) {
      if (!entries.delete(vehicle)) return;
      moved.delete(vehicle);
      save();
      tell(vehicle);
    },
    drive(vehicle, pose) {
      const entry = entries.get(vehicle);
      if (entry === undefined || entry.seats[0] !== self) return;
      if (entry.pose.length !== 9) entry.pose.length = 9;
      for (let i = 0; i < 9; i++) entry.pose[i] = pose[i]!;
      entry.at = Date.now();
      if (Date.now() - savedAt > LOCAL_SAVE_MS) save();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
