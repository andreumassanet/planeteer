/**
 * The atmosphere: a layer over the regional style that says what the sky is
 * doing. Night is a low pad and a few soft bars high up; rain a patter of
 * quiet plucks over a pad leaning minor; a storm low drones a tritone apart
 * and a heartbeat on the bass drum; snow sparse bells high over a thin air pad.
 *
 * The layer is composed a bar at a time over the chord the piece is on (or the
 * tonic between pieces), in the style's own scale, so it sits under the tune
 * rather than against it. It also bends the piece: slower and sparser at
 * night and in snow, a little slower in the rain (`ATMOSPHERE`).
 *
 * Pure: a bar is a function of the atmosphere, the style, the chord and a seed.
 */
import { rngFrom } from '../scenery/random.ts';
import type { NoteEvent } from './events.ts';
import type { InstrumentId } from './instruments.ts';
import { note } from './plan.ts';
import { pc, pitchesOf, scaleOver } from './pitch.ts';
import type { Chord, Style } from './style-types.ts';

export type Atmosphere = 'clear' | 'night' | 'rain' | 'storm' | 'snow';
export const ATMOSPHERES: readonly Atmosphere[] = ['clear', 'night', 'rain', 'storm', 'snow'];

/** The weather as the music hears it. */
export type WeatherCue = 'clear' | 'rain' | 'storm' | 'snow';

/** Under this daylight it is night to the music, as to `moodOf`. */
export const NIGHT_DAYLIGHT = 0.25;

/** The weather first, the dark after it: a storm at night is a storm. */
export function atmosphereOf(daylight: number, weather: WeatherCue = 'clear'): Atmosphere {
  if (weather !== 'clear') return weather;
  return daylight < NIGHT_DAYLIGHT ? 'night' : 'clear';
}

/** What a weather kind (`weather.ts`'s `WeatherKind`) is to the music. */
export function weatherCueOf(kind: string): WeatherCue {
  if (kind === 'storm') return 'storm';
  if (kind === 'snow') return 'snow';
  if (kind === 'rain' || kind === 'drizzle') return 'rain';
  return 'clear';
}

export interface AtmosphereSpec {
  /** The piece's tempo, times this. */
  tempo: number;
  /** The tune's density, times this. */
  density: number;
  /** Added to the arrangement's energy. */
  energy: number;
  /** Whether the street drums keep playing under it. */
  drums: boolean;
  /** The layer's tempo between pieces, beats a minute. */
  restBpm: number;
  /** The layer's pitches, semitones from the style's tonic. */
  low: number;
  high: number;
}

export const ATMOSPHERE: Readonly<Record<Atmosphere, AtmosphereSpec>> = {
  clear: { tempo: 1, density: 1, energy: 0, drums: true, restBpm: 72, low: -12, high: 24 },
  night: { tempo: 0.9, density: 0.8, energy: -0.2, drums: true, restBpm: 60, low: -17, high: 26 },
  rain: { tempo: 0.92, density: 0.85, energy: -0.1, drums: true, restBpm: 66, low: -12, high: 26 },
  storm: { tempo: 0.97, density: 0.9, energy: 0.05, drums: true, restBpm: 70, low: -26, high: 14 },
  snow: { tempo: 0.88, density: 0.7, energy: -0.15, drums: false, restBpm: 56, low: -5, high: 36 },
};

/** The tonic chord, which the layer plays over between pieces. */
export const HOME: Chord = { root: 0, tones: [0, 7] };

/** Every pitch the layer may use over `chord`: the scale bent to it, inside the atmosphere's range. */
function poolOf(style: Style, scale: readonly number[], chord: Chord, low: number, high: number): number[] {
  return pitchesOf(scaleOver(scale, chord), style.tonic, style.tonic + low, style.tonic + high);
}

/** The chord's own tones (pitch classes over the tonic) inside a range. */
function chordTones(style: Style, chord: Chord, low: number, high: number): number[] {
  return pitchesOf(chord.tones, style.tonic, style.tonic + low, style.tonic + high);
}

function soft(time: number, length: number, instrument: InstrumentId, pitch: number, velocity: number): NoteEvent {
  return note(time, length, 'mood', instrument, pitch, velocity);
}

/**
 * One bar of the layer, in beats from the bar's start, over `chord` in
 * `scale`; `seed` and `bar` make it repeatable. Clear skies have none.
 */
export function atmosphereBar(
  atmosphere: Atmosphere, style: Style, scale: readonly number[], chord: Chord, beats: number, seed: number, bar: number,
): NoteEvent[] {
  if (atmosphere === 'clear') return [];
  const spec = ATMOSPHERE[atmosphere];
  const rng = rngFrom('atmosphere', atmosphere, style.id, seed, bar);
  const events: NoteEvent[] = [];
  const root = style.tonic + pc(chord.root);
  switch (atmosphere) {
    case 'night': {
      // A low pad on the chord's root and fifth, held, and a bar or two of soft bells high up.
      if (bar % 2 === 0) {
        const bed = chordTones(style, chord, spec.low, spec.low + 14).slice(0, 2);
        for (const p of bed) events.push(soft(0, beats * 2 + 0.5, 'pad', p, 0.32));
      }
      const high = chordTones(style, chord, 14, spec.high);
      const count = rng.chance(0.55) ? (rng.chance(0.3) ? 2 : 1) : 0;
      for (let i = 0; i < count && high.length > 0; i++) {
        events.push(soft(rng.int(beats) + (rng.chance(0.4) ? 0.5 : 0), 2, 'kalimba', rng.pick(high), 0.18 + rng.unit() * 0.1));
      }
      break;
    }
    case 'rain': {
      // A pad leaning minor: the root and the minor third over it when the
      // scale has one, else the fifth; under a patter of quiet, high plucks.
      if (bar % 2 === 0) {
        const third = scale.some((s) => Math.abs(pc(s - pc(chord.root)) - 3) < 0.01) ? 3 : 7;
        const base = root - 12 >= style.tonic + spec.low ? root - 12 : root;
        events.push(soft(0, beats * 2 + 0.5, 'airpad', base, 0.3));
        events.push(soft(0, beats * 2 + 0.5, 'airpad', base + third, 0.24));
      }
      const pool = poolOf(style, scale, chord, 12, spec.high);
      const drops = 3 + rng.int(4);
      for (let i = 0; i < drops && pool.length > 0; i++) {
        const time = rng.int(beats * 4) / 4;
        events.push(soft(time, 0.5, rng.chance(0.5) ? 'harp' : 'kantele', rng.pick(pool), 0.1 + rng.unit() * 0.12));
      }
      break;
    }
    case 'storm': {
      // Low drones a tritone apart, swelling bar on bar, and a heartbeat.
      const low = style.tonic + spec.low + pc(chord.root - spec.low);
      const deep = low - 12 >= style.tonic + spec.low ? low - 12 : low;
      if (bar % 2 === 0) {
        events.push(soft(0, beats * 2 + 0.5, 'drone', deep, 0.5));
        events.push(soft(0, beats * 2 + 0.5, 'drone', deep + 6, 0.32));
      }
      events.push(soft(0, 1, 'bombo', 0, 0.34));
      if (rng.chance(0.6)) events.push(soft(0.75, 1, 'bombo', 0, 0.22));
      if (bar % 4 === 3) events.push(soft(beats - 1, 4, 'gong', deep + 12, 0.22));
      break;
    }
    case 'snow': {
      // Sparse bells high up, over a thin air pad on the chord's fifth.
      if (bar % 4 === 0) {
        const fifth = chordTones(style, chord, 7, 19);
        if (fifth.length > 0) events.push(soft(0, beats * 4 + 0.5, 'airpad', fifth[fifth.length - 1]!, 0.2));
      }
      const high = chordTones(style, chord, 19, spec.high);
      const count = rng.chance(0.7) ? 1 + (rng.chance(0.35) ? 1 : 0) : 0;
      for (let i = 0; i < count && high.length > 0; i++) {
        events.push(soft(rng.int(beats * 2) / 2, 3, 'bell', rng.pick(high), 0.16 + rng.unit() * 0.12));
      }
      break;
    }
  }
  events.sort((a, b) => a.time - b.time);
  return events;
}
