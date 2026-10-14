/** The held horns' chords and the bicycle bell's partials. */
import type { Honk } from '../../server/src/limits.ts';

/**
 * The held voices, as an electric or an air horn is made: two or three
 * sawtooth tones (`tones`, Hz) scooped up into pitch from `scoop` of it over
 * `settle` seconds, as a diaphragm or a reed comes up to speed; driven into a
 * soft clip (`drive`), the rasp a diaphragm adds; then the horn's trumpet as a
 * resonance (`body`, Hz, `focus` its Q), with the mud under `floor` and the
 * fizz over `ceiling` taken off. `attack` and `release` are how the chord
 * opens and closes, in seconds, and `gain` its share of `HORN_LEVEL`.
 *
 * A car's is 410 and 515 Hz, close to the pairs real two-tone horns are tuned
 * to; a bus's an air horn's 277 and 349, swelling in; a boat's a deep 98 and
 * 147 that takes a quarter of a second to come up. A motorbike's or scooter's
 * is a small electromagnetic disc horn: a diaphragm slapping its contact makes
 * a pulse, so its tone is one note near 450 Hz rich in odd harmonics (`wave`
 * square), sagging a little as the diaphragm comes up to its swing, with the
 * disc's own ring a narrow peak near 2.6 kHz and the nasal honk of the little
 * trumpet another (`nose`, Hz) near 1.3.
 */
export interface HornChord {
  tones: readonly number[];
  scoop: number;
  settle: number;
  drive: number;
  body: number;
  focus: number;
  floor: number;
  ceiling: number;
  attack: number;
  release: number;
  gain: number;
  /** The oscillators' wave, a saw when not given. */
  wave?: OscillatorType;
  /** A second resonance, Hz, over `body`'s, as narrow: a disc horn's trumpet. */
  nose?: number;
}
export const HELD_CHORDS: Partial<Record<Honk, HornChord>> = {
  car: { tones: [410, 515], scoop: 0.94, settle: 0.03, drive: 3, body: 1900, focus: 1.3, floor: 300, ceiling: 4500, attack: 0.008, release: 0.05, gain: 1 },
  bus: { tones: [277, 349], scoop: 0.86, settle: 0.12, drive: 4, body: 950, focus: 1.1, floor: 160, ceiling: 2800, attack: 0.07, release: 0.12, gain: 1.15 },
  ship: { tones: [98, 147], scoop: 0.9, settle: 0.4, drive: 2.5, body: 420, focus: 0.9, floor: 60, ceiling: 1300, attack: 0.25, release: 0.4, gain: 1.4 },
  beep: { tones: [452], scoop: 0.93, settle: 0.045, drive: 2.6, body: 2600, focus: 2.4, floor: 380, ceiling: 6500, attack: 0.004, release: 0.025, gain: 0.55, wave: 'square', nose: 1300 },
};

/**
 * The bicycle's bell: one strike of a thin dome, whose partials stand at these
 * ratios to the fundamental (`BELL_PITCH`, Hz) (inharmonic, which makes it a bell
 * and not a note), each its own share of the strike and its own ring, the high
 * ones dying first; and a twin of the fundamental a few hertz off, whose beating
 * is the shimmer a struck bell has.
 */
export const BELL_PITCH = 2150;
export const BELL_PARTIALS: readonly (readonly [ratio: number, level: number, ring: number])[] = [
  [1, 1, 1.5],
  [1.004, 0.45, 1.3],
  [2.76, 0.55, 0.7],
  [5.4, 0.3, 0.35],
  [8.93, 0.14, 0.16],
];
