/** Pure text helpers for the settings card. */
import { keyLabel } from '../controls.ts';

/** The detail knob in words. The bands are the knob's own geometry (it steps by a quarter of itself) and the one the world ships at is called what it is. */
export function detailWord(value: number): string {
  if (value < 0.35) return 'Lightest';
  if (value < 0.7) return 'Light';
  if (value < 1.3) return 'Balanced';
  if (value < 2.2) return 'Far';
  return 'Farthest';
}

/** An action's line on the controls page: the words before the first middle dot (or colon) are its name; the rest goes behind the row's `?`, so a line never wraps. */
export function splitLabel(label: string): { name: string; more: string } {
  const at = label.search(/ · |: /);
  if (at < 0) return { name: label, more: '' };
  const more = label.slice(at + (label[at + 1] === ':' ? 2 : 3)).trim();
  return { name: label.slice(0, at), more: more.charAt(0).toUpperCase() + more.slice(1) };
}

/** `HH:MM` for an hour of the day, 0 to 24. */
export function hourText(hour: number): string {
  const minutes = Math.round(hour * 60) % 1440;
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** The first key of an action's after its own whose cap reads differently: the second cap, if any. */
export function spareSlot(codes: readonly string[]): number {
  const own = keyLabel(codes[0]!);
  for (let i = 1; i < codes.length; i++) if (keyLabel(codes[i]!) !== own) return i;
  return -1;
}
