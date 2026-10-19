/** The notes a piece is made of, and the shape of a piece. */
import { INSTRUMENTS } from './instruments.ts';
import type { InstrumentId } from './instruments.ts';
import type { Chord, DrumLine, Style } from './style-types.ts';
import type { Atmosphere } from './atmosphere.ts';

/** `mood` is the atmosphere's layer (`atmosphere.ts`), on a bus of its own. */
export type Role = 'lead' | 'answer' | 'accomp' | 'bass' | 'pad' | 'drone' | 'drums' | 'mood';

export interface NoteEvent {
  /** Beats from the phrase's start. */
  time: number;
  /** Beats. */
  length: number;
  role: Role;
  instrument: InstrumentId;
  /** MIDI, fractional for a slendro degree; 0 for an unpitched drum. */
  pitch: number;
  velocity: number;
  /** A pitch to slide from, 0 for none; and how long the slide takes, in seconds. */
  glide: number;
  glideTime: number;
  /** Re-struck for its whole length: the mandolin's and the balalaika's tremolo. */
  tremolo: boolean;
  /** Damped by the next stroke rather than left to ring: a strum's strings. */
  damped: boolean;
}

/** Seconds a note rings past its written length: the instrument's own, or almost none when the next stroke damps it. */
export function ringOf(e: NoteEvent): number {
  return e.damped ? 0.04 : INSTRUMENTS[e.instrument].ring;
}

/** What the moment asks of the music. */
export interface Mood {
  /** 0 sparse to 1 full. */
  energy: number;
  /** Whether the drums that keep to town play. */
  drums: boolean;
  night: boolean;
  /** What the sky is doing, which bends the piece and picks the layer over it. */
  atmosphere: Atmosphere;
}

export type PhraseKind = 'intro' | 'theme' | 'variation' | 'contrast' | 'answer' | 'outro';

export interface Piece {
  style: Style;
  seed: number;
  bpm: number;
  scale: readonly number[];
  main: readonly Chord[];
  other: readonly Chord[];
  kit: readonly DrumLine[];
  form: readonly PhraseKind[];
  /** The tune's density for the whole piece, so the theme comes back as it was. */
  density: number;
  /** Which part sings the contrast. */
  contrastByAnswer: boolean;
}

export interface Phrase {
  kind: PhraseKind;
  beats: number;
  events: NoteEvent[];
}

/** How the moment sounds: busier in town, calmer at night, quiet in the open. */
