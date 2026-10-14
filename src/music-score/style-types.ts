/** What a style is made of: scales, chords, parts and drum lines. */
import type { InstrumentId } from './instruments.ts';

export type StyleId =
  | 'iberia'
  | 'latin'
  | 'brazil'
  | 'andes'
  | 'north-america'
  | 'atlantic-folk'
  | 'nordic'
  | 'east-europe'
  | 'mediterranean'
  | 'maghreb'
  | 'middle-east'
  | 'sub-saharan'
  | 'south-asia'
  | 'east-asia'
  | 'japan'
  | 'southeast-asia'
  | 'oceania'
  | 'polar'
  | 'sea'
  | 'sky';

/** A chord as pitch classes over the tonic, in semitones; the first is its root. */
export interface Chord {
  root: number;
  tones: readonly number[];
}

export type Ornament = 'none' | 'grace' | 'slide' | 'meend' | 'tremolo' | 'bend';

export interface Part {
  instrument: InstrumentId;
  /** MIDI, both ends included. */
  low: number;
  high: number;
}

export interface MelodyPart extends Part {
  /** How busy the tune is, 0 to 1: the chance an eighth carries a note, before the metre weighs it. */
  density: number;
  ornament: Ornament;
}

/**
 * A pattern a bar, bars separated by `|` and cycled. `.` rests; a digit is
 * that chord tone of the voicing, counted up from the lowest; `d` strums the
 * whole voicing up and `u` the top three down; `c` is the voicing struck at
 * once; `b` and `f` are the chord's root and fifth at the bottom of the range.
 */
export interface AccompPart extends Part {
  count: number;
  figures: readonly string[];
}

/** `r` the root, `f` the fifth, `o` the octave, `a` a step into the next chord's root; `.` rests. */
export interface BassPart extends Part {
  figures: readonly string[];
}

export interface PadPart extends Part {
  count: number;
}

/** A drone under everything: its notes in semitones from the tonic, a figure over them (`*` is all), or held. */
export interface DronePart {
  instrument: InstrumentId;
  notes: readonly number[];
  figure: string;
  hold: boolean;
}

/** One drum's line a bar: `x` accent, `o` a stroke, `-` a ghost, `.` rest; bars separated by `|`. */
export interface DrumLine {
  instrument: InstrumentId;
  pattern: string;
  /** Semitones from the tonic for a tuned drum or gong; unset for an unpitched one. */
  pitch?: number;
  /** Plays out of town too: a shaker, a gamelan's gong. The rest keep to the streets. */
  always?: boolean;
}

export interface Style {
  id: StyleId;
  name: string;
  /** MIDI of the tonic. Every part's range is absolute MIDI. */
  tonic: number;
  /** Semitones over the tonic, ascending in [0, 12). */
  scale: readonly number[];
  /** Other modes by the hour, as a raga is; `from` to `to`, wrapping past midnight. */
  modes?: readonly { scale: readonly number[]; from: number; to: number }[];
  progressions: readonly (readonly Chord[])[];
  /** The roots a progression may end on: the tonic, the dominant, a modal subtonic. */
  cadence: readonly number[];
  bpm: readonly [number, number];
  /** Beats a bar and steps a beat: 4 and 2 is 4/4 in eighths, 2 and 3 is 6/8, 4 and 3 is 12/8. */
  beats: number;
  steps: number;
  barsPerChord: number;
  /** How late the off-steps fall, as a fraction of a step. */
  swing: number;
  lead: MelodyPart;
  answer: MelodyPart | null;
  accomp: AccompPart | null;
  bass: BassPart | null;
  pad: PadPart | null;
  drone: DronePart | null;
  /** Alternative drum kits; empty for none. */
  kits: readonly (readonly DrumLine[])[];
  /** The reverb send, 0 dry to 1 a cathedral. */
  reverb: number;
  /** The guzheng's sweep up the strings at the head of a section. */
  glissando?: boolean;
  /** A gamelan: the core melody walks to each goal tone and the gong-chimes double it. */
  gamelan?: boolean;
}
