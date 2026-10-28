/** The name this device plays under, and what a name may be. */
import { GUEST_KEY, NAME_KEY } from './constants.ts';

/** The name kept on this device, which the next connection sends. */
export function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

let guest = '';

/**
 * What a traveller without a name of their own is called: `Traveller 4821`,
 * the number drawn once and kept on this device, so the others see the same
 * guest from one visit to the next.
 */
export function guestName(): string {
  if (guest !== '') return guest;
  let number = '';
  try {
    number = localStorage.getItem(GUEST_KEY) ?? '';
  } catch {
    // No store: a number for this visit.
  }
  if (!/^\d{4}$/.test(number)) {
    number = String(1000 + Math.floor(Math.random() * 9000));
    try {
      localStorage.setItem(GUEST_KEY, number);
    } catch {
      // Private mode; the number lasts this visit.
    }
  }
  guest = `Traveller ${number}`;
  return guest;
}

/** The name the others see: the one kept, or the guest's. */
export const shownName = (name: string): string => (name.trim() === '' ? guestName() : name);

/**
 * A name as the relay will take it: printable, one line, twenty code points
 * (so an emoji at the twentieth is kept whole or not at all). The relay cleans
 * it again (`cleanName` in `server/src/index.ts`); this is so that what the
 * field shows is what the others will see.
 */
export const cleanName = (name: string): string => Array.from(name.replace(/[\p{C}<>]/gu, '').trim()).slice(0, 20).join('').trim();

/**
 * Keeps a name for the next connection without a connection of its own: the
 * traveller's card on the front door, before there are any peers to rename.
 */
export function storeName(name: string): string {
  const kept = cleanName(name);
  try {
    localStorage.setItem(NAME_KEY, kept);
  } catch {
    // Private mode; the name lasts this visit.
  }
  return kept;
}

/**
 * This page's secret on the relay, the same across every reconnection and sent
 * to nobody but the relay: a player who drops out of a seat and comes back on a
 * new socket is known by it, and given the seat back (`sit` in
 * `server/src/index.ts`). Made per page, not stored: two tabs are two players.
 */
export function pageKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  let key = '';
  for (let i = 0; i < 32; i++) key += Math.floor(Math.random() * 16).toString(16);
  return key;
}
