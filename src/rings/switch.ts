/**
 * Whether there are rings and courses at all: one switch for the page, on
 * every world, kept on the device. Off, nothing of them is drawn, run or
 * marked (the rings, the courses, their HUD, the guide to them, the pull on a
 * plane, their marks on both maps); what was collected and the best times
 * stay in the record for when they come back.
 */

const KEY = 'atlas.rings.on';

let on = read();
const listeners = new Set<(on: boolean) => void>();

function read(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

/** Whether rings and courses are on. */
export function ringsOn(): boolean {
  return on;
}

/** Turns them on or off, keeps the choice, and answers what it now is. */
export function setRingsOn(next: boolean): boolean {
  if (next === on) return on;
  on = next;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Kept for the visit.
  }
  for (const listener of listeners) listener(on);
  return on;
}

/** Told whenever the switch moves; returns the way to stop. */
export function onRingsSwitch(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
