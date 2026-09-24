/**
 * What the music plays: a style for every region the towns are built in, and
 * the composer that turns one into phrases.
 *
 * **The regions are the towns' regions.** `regionFor` in `scenery/regions.ts`
 * decides whether a street is whitewash and tile or timber and slate, and the
 * music asks the same function, so what you hear and what you see cannot
 * disagree about where you are: the flamenco starts where the terracotta roofs
 * do. A few regions are one table row there and two traditions here — Spain is
 * not Italy by ear, Brazil is not Mexico, the Andes are not the Caribbean,
 * Japan is not China — and those splits are made by country code *under* the
 * region, never instead of it.
 *
 * **A style is data**: a scale in semitones (floats, so a gamelan's slendro is
 * five near-equal steps rather than a pentatonic in disguise), chord
 * progressions as pitch classes over the tonic, a tempo range and a metre, and
 * the parts that play — who carries the tune, who answers it, what strums,
 * what holds a drone, which drums keep time and whether they keep it out of
 * town. Adding a style is an entry in `STYLES`.
 *
 * **The composer is the rules a person would follow, and nothing cleverer.**
 * A phrase is one pass through a progression. The tune lands on chord tones
 * on strong beats and walks by scale step between them, arching up and then
 * down, and it ends on the chord it cadences to. Its rhythm is a cell that
 * repeats (A B A cadence), because repetition is what makes a tune a tune
 * rather than a random walk. A piece is a form — an intro with no tune, a
 * theme, its variation, a contrast on the other progression, the theme again,
 * an outro onto the tonic — and the theme comes back note for note, because
 * it is composed from the same seed.
 *
 * Pure: no Web Audio, no clock, no `Math.random`. `scripts/check-music.ts`
 * composes every style under Node and holds the output to its scale.
 */
import { regionFor } from './scenery/regions.ts';
import type { RegionId } from './scenery/regions.ts';
import { rngFrom } from './scenery/random.ts';
import type { Rng } from './scenery/random.ts';
import type { ModalSpec, PluckSpec, DrumSpec } from './music-synth.ts';

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/** A breath through a tube: a sine, a little triangle for the edge, and band-passed noise for the air. */
export interface WindSpec {
  kind: 'wind';
  /** The air's level against the tone. */
  breath: number;
  /** Vibrato depth in cents, arriving after the note has settled. */
  vibrato: number;
  /** The triangle's level: the reed or the membrane's buzz. */
  edge: number;
  attack: number;
  release: number;
}

/** A held chord: two detuned oscillators under a low-pass, slow in and slower out. */
export interface PadSpec {
  kind: 'pad';
  detune: number;
  cutoff: number;
  attack: number;
  release: number;
  /** An octave of sine on top, for the high airy pad. */
  air: boolean;
}

export interface Instrument {
  sound: PluckSpec | ModalSpec | DrumSpec | WindSpec | PadSpec;
  /** Its level against the others, before the note's velocity. */
  gain: number;
  /** Seconds a note may ring past its written length before it is damped. */
  ring: number;
}

const pluck = (t60: number, bright: number, position: number, damping: number, body: number, length: number, buzz = 0): PluckSpec => ({
  kind: 'pluck', t60, bright, position, damping, buzz, body, length,
});
const drum = (from: number, to: number, drop: number, tone: number, noise: number, band: number, q: number, hiss: number, length: number, flams = 1): DrumSpec => ({
  kind: 'drum', from, to, drop, tone, noise, band, q, hiss, flams, length,
});
const wind = (breath: number, vibrato: number, edge: number, attack: number, release: number): WindSpec => ({
  kind: 'wind', breath, vibrato, edge, attack, release,
});

export const INSTRUMENTS = {
  // Strings, plucked: the Karplus–Strong loop in `music-synth.ts`.
  guitar: { sound: pluck(3, 0.55, 0.18, 0.5, 3200, 2.4), gain: 0.5, ring: 0.35 },
  steel: { sound: pluck(3.4, 0.78, 0.13, 0.46, 5200, 2.6), gain: 0.42, ring: 0.35 },
  harp: { sound: pluck(4, 0.45, 0.3, 0.5, 3800, 3), gain: 0.42, ring: 0.7 },
  kantele: { sound: pluck(3.2, 0.7, 0.21, 0.48, 5500, 2.8), gain: 0.4, ring: 1 },
  balalaika: { sound: pluck(1.1, 0.82, 0.1, 0.45, 5200, 1.2), gain: 0.42, ring: 0.2 },
  mandolin: { sound: pluck(0.9, 0.85, 0.12, 0.45, 6000, 1.1), gain: 0.4, ring: 0.2 },
  oud: { sound: pluck(1.8, 0.5, 0.22, 0.55, 2200, 1.8), gain: 0.56, ring: 0.3 },
  qanun: { sound: pluck(2, 0.75, 0.15, 0.47, 5500, 2), gain: 0.36, ring: 0.5 },
  santur: { sound: pluck(2.2, 0.9, 0.1, 0.45, 7000, 2), gain: 0.32, ring: 0.6 },
  sitar: { sound: pluck(3.5, 0.8, 0.1, 0.45, 5000, 3.2, 0.6), gain: 0.4, ring: 0.6 },
  tanpura: { sound: pluck(5, 0.6, 0.2, 0.47, 3500, 4, 0.5), gain: 0.24, ring: 1.6 },
  koto: { sound: pluck(2.4, 0.7, 0.15, 0.47, 5000, 2.4), gain: 0.42, ring: 0.9 },
  guzheng: { sound: pluck(3, 0.72, 0.14, 0.47, 5000, 2.8), gain: 0.4, ring: 0.9 },
  charango: { sound: pluck(1, 0.85, 0.12, 0.45, 6500, 1.1), gain: 0.34, ring: 0.2 },
  ukulele: { sound: pluck(1.2, 0.65, 0.2, 0.5, 4000, 1.3), gain: 0.38, ring: 0.2 },
  bass: { sound: pluck(2.5, 0.3, 0.25, 0.55, 900, 2), gain: 0.6, ring: 0.2 },

  // Bars, tines, bells and gongs: decaying modes at each instrument's own ratios.
  kalimba: { sound: { kind: 'modal', modes: [[1, 1, 1.4], [5.9, 0.22, 0.25], [12.3, 0.06, 0.1]], attack: 0.002, click: 0.15, sag: 0, length: 1.6 }, gain: 0.34, ring: 0.8 },
  marimba: { sound: { kind: 'modal', modes: [[1, 1, 0.9], [3.93, 0.3, 0.25], [9.2, 0.08, 0.08]], attack: 0.002, click: 0.25, sag: 0, length: 1.3 }, gain: 0.42, ring: 0.6 },
  saron: { sound: { kind: 'modal', modes: [[1, 1, 3.5], [2.76, 0.35, 1.4], [5.4, 0.18, 0.6], [8.93, 0.06, 0.3]], attack: 0.003, click: 0.1, sag: 0, length: 3.5 }, gain: 0.3, ring: 0.4 },
  bonang: { sound: { kind: 'modal', modes: [[1, 1, 1.8], [2.02, 0.3, 0.9], [3.01, 0.12, 0.4], [4.1, 0.08, 0.25]], attack: 0.004, click: 0.08, sag: 0, length: 2.2 }, gain: 0.26, ring: 0.3 },
  bell: { sound: { kind: 'modal', modes: [[0.5, 0.25, 4], [1, 1, 4], [2, 0.45, 2.5], [2.76, 0.28, 1.6], [5.4, 0.12, 0.8]], attack: 0.002, click: 0.04, sag: 0, length: 4.5 }, gain: 0.22, ring: 4 },
  gong: { sound: { kind: 'modal', modes: [[1, 1, 6], [1.004, 0.7, 6], [2.01, 0.3, 3], [2.93, 0.18, 2]], attack: 0.02, click: 0, sag: 0.3, length: 6 }, gain: 0.5, ring: 6 },

  // Drums: a falling body and a band of noise.
  doum: { sound: drum(150, 85, 0.03, 0.5, 0.15, 400, 0.8, 0.06, 0.7), gain: 0.38, ring: 1 },
  tek: { sound: drum(700, 650, 0.01, 0.06, 0.8, 3200, 1.5, 0.06, 0.2), gain: 0.26, ring: 1 },
  kick: { sound: drum(120, 52, 0.04, 0.45, 0.05, 300, 1, 0.02, 0.6), gain: 0.3, ring: 1 },
  shaker: { sound: drum(0, 0, 0.01, 0.01, 1, 7000, 1.2, 0.05, 0.12, 2), gain: 0.1, ring: 1 },
  rim: { sound: drum(1700, 1650, 0.01, 0.04, 0.3, 2500, 3, 0.02, 0.12), gain: 0.18, ring: 1 },
  clap: { sound: drum(0, 0, 0.01, 0.01, 1, 1400, 1.1, 0.09, 0.25, 3), gain: 0.22, ring: 1 },
  cajon: { sound: drum(110, 70, 0.03, 0.25, 0.3, 900, 0.7, 0.05, 0.4), gain: 0.32, ring: 1 },
  slap: { sound: drum(300, 250, 0.01, 0.08, 0.9, 2200, 0.8, 0.08, 0.25), gain: 0.26, ring: 1 },
  bongo: { sound: drum(420, 380, 0.02, 0.14, 0.1, 2000, 1, 0.02, 0.3), gain: 0.26, ring: 1 },
  bombo: { sound: drum(90, 55, 0.05, 0.5, 0.25, 600, 0.6, 0.08, 0.7), gain: 0.34, ring: 1 },
  djembe: { sound: drum(110, 72, 0.03, 0.35, 0.2, 800, 0.7, 0.05, 0.5), gain: 0.32, ring: 1 },
  agogo: { sound: drum(1400, 1400, 0.01, 0.3, 0.05, 3000, 2, 0.02, 0.4), gain: 0.12, ring: 1 },
  woodblock: { sound: drum(900, 880, 0.01, 0.08, 0.2, 1800, 4, 0.015, 0.2), gain: 0.18, ring: 1 },
  brush: { sound: drum(0, 0, 0.01, 0.01, 1, 3500, 0.5, 0.14, 0.3), gain: 0.12, ring: 1 },
  frame: { sound: drum(110, 80, 0.04, 0.3, 0.25, 700, 0.6, 0.05, 0.5), gain: 0.3, ring: 1 },
  kendhang: { sound: drum(180, 120, 0.03, 0.22, 0.2, 1200, 0.8, 0.04, 0.4), gain: 0.3, ring: 1 },
  'tabla-ge': { sound: drum(75, 110, 0.12, 0.6, 0.05, 300, 0.8, 0.03, 0.8), gain: 0.32, ring: 1 },
  'tabla-na': { sound: { kind: 'modal', modes: [[1, 1, 0.5], [2, 0.6, 0.35], [3, 0.4, 0.25], [4, 0.25, 0.18]], attack: 0.001, click: 0.3, sag: 0, length: 0.6 }, gain: 0.3, ring: 1 },

  // Breath and held chords: live oscillators in the engine.
  flute: { sound: wind(0.1, 14, 0.12, 0.07, 0.25), gain: 0.2, ring: 0 },
  panflute: { sound: wind(0.28, 6, 0.25, 0.05, 0.35), gain: 0.2, ring: 0 },
  ney: { sound: wind(0.34, 18, 0.08, 0.12, 0.4), gain: 0.2, ring: 0 },
  shakuhachi: { sound: wind(0.4, 10, 0.1, 0.14, 0.45), gain: 0.2, ring: 0 },
  dizi: { sound: wind(0.16, 20, 0.3, 0.05, 0.25), gain: 0.17, ring: 0 },
  pad: { sound: { kind: 'pad', detune: 7, cutoff: 900, attack: 1.6, release: 2.5, air: false }, gain: 0.07, ring: 0 },
  airpad: { sound: { kind: 'pad', detune: 10, cutoff: 2200, attack: 2.5, release: 3.5, air: true }, gain: 0.06, ring: 0 },
  drone: { sound: { kind: 'pad', detune: 4, cutoff: 600, attack: 2, release: 3, air: false }, gain: 0.06, ring: 0 },
} satisfies Record<string, Instrument>;

export type InstrumentId = keyof typeof INSTRUMENTS;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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

const ch = (...tones: number[]): Chord => ({ root: tones[0]!, tones });

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10];
const KURD = [0, 1, 3, 5, 7, 8, 10];
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
/** Miyako-bushi's in scale. */
const IN = [0, 1, 5, 7, 8];
/** Five near-equal steps of 240 cents. */
const SLENDRO = [0, 2.4, 4.8, 7.2, 9.6];

export const STYLES: Record<StyleId, Style> = {
  // Flamenco's rumba: the Andalusian cadence onto the Phrygian tonic, the
  // guitar's rasgueado in 3-3-2, palmas and a cajón in town.
  iberia: {
    id: 'iberia', name: 'Flamenco guitar', tonic: 52, scale: PHRYGIAN_DOMINANT,
    progressions: [
      [ch(5, 8, 0), ch(3, 7, 10), ch(1, 5, 8), ch(0, 4, 7)],
      [ch(10, 1, 5), ch(5, 8, 0), ch(1, 5, 8), ch(0, 4, 7)],
      [ch(0, 4, 7), ch(1, 5, 8), ch(3, 7, 10), ch(1, 5, 8), ch(0, 4, 7)],
    ],
    cadence: [0], bpm: [84, 100], beats: 4, steps: 4, barsPerChord: 1, swing: 0,
    lead: { instrument: 'guitar', low: 59, high: 81, density: 0.42, ornament: 'grace' },
    answer: null,
    accomp: { instrument: 'guitar', low: 52, high: 71, count: 4, figures: ['d..d..d.d.u.d.u.', 'd...d.u.d...d.u.', 'b..2.1b.3.2.b.1.'] },
    bass: null, pad: null, drone: null,
    kits: [[
      { instrument: 'clap', pattern: '..-.x.-...-.x.-.' },
      { instrument: 'cajon', pattern: 'x......x..x.....' },
      { instrument: 'slap', pattern: '....x.......x...' },
    ]],
    reverb: 0.3,
  },
  // A bolero's guitar and a son's clave: minor, with the dominant raised.
  latin: {
    id: 'latin', name: 'Bolero and son', tonic: 57, scale: MINOR,
    progressions: [
      [ch(0, 3, 7), ch(5, 8, 0), ch(7, 11, 2, 5), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(10, 2, 5), ch(8, 0, 3), ch(7, 11, 2, 5)],
      [ch(5, 8, 0), ch(10, 2, 5), ch(3, 7, 10), ch(7, 11, 2, 5)],
    ],
    cadence: [0, 7], bpm: [88, 104], beats: 4, steps: 4, barsPerChord: 1, swing: 0,
    lead: { instrument: 'guitar', low: 62, high: 81, density: 0.38, ornament: 'grace' },
    answer: { instrument: 'flute', low: 67, high: 86, density: 0.3, ornament: 'none' },
    accomp: { instrument: 'guitar', low: 52, high: 71, count: 3, figures: ['0.2.1.2.0.2.1.2.', 'b..1..2.b..1..2.'] },
    bass: { instrument: 'bass', low: 33, high: 50, figures: ['......r.....f...', 'r.....r.....f...'] },
    pad: null, drone: null,
    kits: [[
      { instrument: 'rim', pattern: 'x..x..x.........|....x...x.......' },
      { instrument: 'shaker', pattern: 'o-o-o-o-o-o-o-o-' },
      { instrument: 'bongo', pattern: '....x..o....x..o' },
    ]],
    reverb: 0.28,
  },
  // Bossa nova: sevenths round the circle, the thumb on the dotted bass, the
  // fingers on the clave.
  brazil: {
    id: 'brazil', name: 'Bossa nova', tonic: 53, scale: MAJOR,
    progressions: [
      [ch(0, 4, 7, 11), ch(9, 1, 4, 7), ch(2, 5, 9, 0), ch(7, 11, 2, 5)],
      [ch(0, 4, 7, 11), ch(9, 0, 4, 7), ch(2, 5, 9, 0), ch(7, 11, 2, 5)],
      [ch(5, 9, 0, 4), ch(4, 7, 11, 2), ch(2, 5, 9, 0), ch(7, 11, 2, 5)],
    ],
    cadence: [0, 7], bpm: [120, 134], beats: 4, steps: 2, barsPerChord: 1, swing: 0.06,
    lead: { instrument: 'flute', low: 65, high: 84, density: 0.4, ornament: 'none' },
    answer: { instrument: 'guitar', low: 62, high: 79, density: 0.45, ornament: 'none' },
    accomp: { instrument: 'guitar', low: 52, high: 72, count: 4, figures: ['c..c..c.|..c..c..'] },
    bass: { instrument: 'guitar', low: 40, high: 55, figures: ['r..fr..f'] },
    pad: null, drone: null,
    kits: [[
      { instrument: 'rim', pattern: 'x..x..x.|..x..x..' },
      { instrument: 'shaker', pattern: '-o-o-o-o', always: true },
    ]],
    reverb: 0.28,
  },
  // A huayno: the minor pentatonic on panpipes, a charango strumming, the bombo.
  andes: {
    id: 'andes', name: 'Huayno', tonic: 57, scale: MINOR_PENTATONIC,
    progressions: [
      [ch(0, 3, 7), ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7)],
      [ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(7, 10, 2), ch(10, 2, 5), ch(0, 3, 7)],
    ],
    cadence: [0], bpm: [100, 116], beats: 2, steps: 4, barsPerChord: 2, swing: 0,
    lead: { instrument: 'panflute', low: 64, high: 86, density: 0.5, ornament: 'none' },
    answer: { instrument: 'charango', low: 64, high: 84, density: 0.55, ornament: 'none' },
    accomp: { instrument: 'charango', low: 57, high: 76, count: 3, figures: ['d.dud.du', 'd.d.d.du'] },
    bass: null, pad: null, drone: null,
    kits: [[
      { instrument: 'bombo', pattern: 'x..xx...' },
      { instrument: 'shaker', pattern: '-o-o-o-o', always: true },
    ]],
    reverb: 0.35,
  },
  // Front-porch folk: a steel-string guitar Travis-picked, a melody that
  // slides into its notes, brushes in town.
  'north-america': {
    id: 'north-america', name: 'Folk and country', tonic: 55, scale: MAJOR,
    progressions: [
      [ch(0, 4, 7), ch(5, 9, 0), ch(0, 4, 7), ch(7, 11, 2)],
      [ch(0, 4, 7), ch(9, 0, 4), ch(5, 9, 0), ch(7, 11, 2)],
      [ch(5, 9, 0), ch(0, 4, 7), ch(7, 11, 2), ch(0, 4, 7)],
    ],
    cadence: [0, 7], bpm: [96, 112], beats: 4, steps: 2, barsPerChord: 1, swing: 0.14,
    lead: { instrument: 'steel', low: 62, high: 81, density: 0.45, ornament: 'slide' },
    answer: null,
    accomp: { instrument: 'steel', low: 40, high: 67, count: 4, figures: ['b2f3b2f3', 'b3f2b3f2'] },
    bass: null, pad: null, drone: null,
    kits: [[
      { instrument: 'brush', pattern: '..o...o.' },
      { instrument: 'kick', pattern: 'x...x...' },
    ]],
    reverb: 0.22,
  },
  // A jig in D Dorian: the flute with its cuts, the harp under it, a bodhrán in town.
  'atlantic-folk': {
    id: 'atlantic-folk', name: 'Celtic folk', tonic: 50, scale: DORIAN,
    progressions: [
      [ch(0, 3, 7), ch(10, 2, 5), ch(0, 3, 7), ch(7, 10, 2)],
      [ch(0, 3, 7), ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7)],
      [ch(3, 7, 10), ch(10, 2, 5), ch(5, 9, 0), ch(0, 3, 7)],
    ],
    cadence: [0, 7], bpm: [92, 106], beats: 2, steps: 3, barsPerChord: 2, swing: 0,
    lead: { instrument: 'flute', low: 69, high: 88, density: 0.6, ornament: 'grace' },
    answer: { instrument: 'harp', low: 62, high: 84, density: 0.5, ornament: 'none' },
    accomp: { instrument: 'harp', low: 50, high: 74, count: 4, figures: ['0.21.2', '0.12.3'] },
    bass: null,
    pad: { instrument: 'pad', low: 50, high: 69, count: 2 },
    drone: null,
    kits: [[{ instrument: 'frame', pattern: 'x.ox.o' }]],
    reverb: 0.35,
  },
  // Slow and aeolian in three: a kantele, a flute, a pad, and the modal
  // cadence through the flattened seventh.
  nordic: {
    id: 'nordic', name: 'Nordic folk', tonic: 52, scale: MINOR,
    progressions: [
      [ch(0, 3, 7), ch(8, 0, 3), ch(10, 2, 5), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(5, 8, 0), ch(8, 0, 3), ch(10, 2, 5)],
      [ch(8, 0, 3), ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7)],
    ],
    cadence: [0, 7, 10], bpm: [66, 78], beats: 3, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'kantele', low: 64, high: 84, density: 0.35, ornament: 'none' },
    answer: { instrument: 'flute', low: 64, high: 84, density: 0.3, ornament: 'none' },
    accomp: { instrument: 'harp', low: 52, high: 74, count: 3, figures: ['0.1.2.', '0.2.1.'] },
    bass: null,
    pad: { instrument: 'pad', low: 52, high: 71, count: 3 },
    drone: null, kits: [], reverb: 0.5,
  },
  // Harmonic minor in two, the balalaika's tremolo over an oom-pa.
  'east-europe': {
    id: 'east-europe', name: 'Balalaika', tonic: 57, scale: HARMONIC_MINOR,
    progressions: [
      [ch(0, 3, 7), ch(5, 8, 0), ch(7, 11, 2, 5), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(10, 2, 5), ch(3, 7, 10), ch(7, 11, 2, 5)],
      [ch(5, 8, 0), ch(0, 3, 7), ch(7, 11, 2, 5), ch(0, 3, 7)],
    ],
    cadence: [0, 7], bpm: [96, 118], beats: 2, steps: 4, barsPerChord: 2, swing: 0,
    lead: { instrument: 'balalaika', low: 64, high: 86, density: 0.45, ornament: 'tremolo' },
    answer: null,
    accomp: { instrument: 'balalaika', low: 57, high: 74, count: 3, figures: ['....c.c.', '..c...c.'] },
    bass: { instrument: 'bass', low: 40, high: 55, figures: ['r...f...'] },
    pad: null, drone: null, kits: [], reverb: 0.3,
  },
  // A waltz in D minor: the mandolin's tremolo, the guitar's bass and two chords.
  mediterranean: {
    id: 'mediterranean', name: 'Mandolin waltz', tonic: 50, scale: HARMONIC_MINOR,
    progressions: [
      [ch(0, 3, 7), ch(5, 8, 0), ch(7, 11, 2, 5), ch(0, 3, 7)],
      [ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7), ch(7, 11, 2, 5)],
      [ch(0, 3, 7), ch(8, 0, 3), ch(5, 8, 0), ch(7, 11, 2, 5)],
    ],
    cadence: [0, 7], bpm: [96, 112], beats: 3, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'mandolin', low: 62, high: 86, density: 0.45, ornament: 'tremolo' },
    answer: { instrument: 'guitar', low: 60, high: 79, density: 0.45, ornament: 'grace' },
    accomp: { instrument: 'guitar', low: 45, high: 69, count: 3, figures: ['b.c.c.', 'b.2.1.'] },
    bass: null, pad: null, drone: null, kits: [], reverb: 0.32,
  },
  // Maqam Hijaz on D: the oud sliding into its notes, the ney answering, the
  // qanun's arpeggios and the maqsum on a frame drum.
  maghreb: {
    id: 'maghreb', name: 'Maqam Hijaz', tonic: 50, scale: PHRYGIAN_DOMINANT,
    progressions: [
      [ch(0, 4, 7), ch(1, 5, 8), ch(0, 4, 7), ch(0, 4, 7)],
      [ch(0, 4, 7), ch(10, 1, 5), ch(1, 5, 8), ch(0, 4, 7)],
      [ch(5, 8, 0), ch(10, 1, 5), ch(1, 5, 8), ch(0, 4, 7)],
    ],
    cadence: [0], bpm: [92, 106], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'oud', low: 57, high: 79, density: 0.5, ornament: 'slide' },
    answer: { instrument: 'ney', low: 62, high: 84, density: 0.35, ornament: 'bend' },
    accomp: { instrument: 'qanun', low: 57, high: 81, count: 4, figures: ['0...2.1.', '0.1.2.3.'] },
    bass: { instrument: 'oud', low: 38, high: 52, figures: ['r..r.r..', 'r...r...'] },
    pad: null, drone: null,
    kits: [
      [{ instrument: 'doum', pattern: 'x...x...' }, { instrument: 'tek', pattern: '.x.x..x.' }],
      [{ instrument: 'doum', pattern: 'x..x..x.' }, { instrument: 'tek', pattern: '...o...x' }],
    ],
    reverb: 0.3,
  },
  // Maqam Kurd, slower: the ney over a held drone, the oud answering, a santur.
  'middle-east': {
    id: 'middle-east', name: 'Maqam Kurd', tonic: 50, scale: KURD,
    progressions: [
      [ch(0, 3, 7), ch(1, 5, 8), ch(0, 3, 7), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(10, 1, 5), ch(8, 0, 3), ch(0, 3, 7)],
      [ch(8, 0, 3), ch(10, 1, 5), ch(1, 5, 8), ch(0, 3, 7)],
    ],
    cadence: [0], bpm: [70, 84], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'ney', low: 62, high: 86, density: 0.35, ornament: 'bend' },
    answer: { instrument: 'oud', low: 57, high: 79, density: 0.5, ornament: 'slide' },
    accomp: { instrument: 'santur', low: 62, high: 86, count: 3, figures: ['0.1.2.1.', '0...1.2.'] },
    bass: null, pad: null,
    drone: { instrument: 'drone', notes: [-12, -5], figure: '*.......', hold: true },
    kits: [[{ instrument: 'doum', pattern: 'x.......' }, { instrument: 'tek', pattern: '....o.o.' }]],
    reverb: 0.4,
  },
  // Twelve-eight with three against two: a kalimba's interlocking ostinato, a
  // balafon on the tune, the bell pattern.
  'sub-saharan': {
    id: 'sub-saharan', name: 'Kalimba and balafon', tonic: 60, scale: MAJOR_PENTATONIC,
    progressions: [
      [ch(0, 4, 7), ch(5, 9, 0), ch(0, 4, 7), ch(7, 11, 2)],
      [ch(0, 4, 7), ch(9, 0, 4), ch(5, 9, 0), ch(7, 11, 2)],
      [ch(5, 9, 0), ch(0, 4, 7), ch(7, 11, 2), ch(0, 4, 7)],
    ],
    cadence: [0, 7], bpm: [96, 110], beats: 4, steps: 3, barsPerChord: 1, swing: 0,
    lead: { instrument: 'marimba', low: 67, high: 86, density: 0.45, ornament: 'grace' },
    answer: null,
    accomp: { instrument: 'kalimba', low: 60, high: 79, count: 4, figures: ['0.21.2.31.2.', '02.1.20.1.3.'] },
    bass: { instrument: 'marimba', low: 43, high: 55, figures: ['r.....f..r..'] },
    pad: null, drone: null,
    kits: [[
      { instrument: 'agogo', pattern: 'x.x.xx.x.x.x' },
      { instrument: 'djembe', pattern: 'x.....x..o..' },
      { instrument: 'slap', pattern: '...o.....x.x' },
      { instrument: 'shaker', pattern: 'o--o--o--o--', always: true },
    ]],
    reverb: 0.25,
  },
  // A raga over the tanpura: Bhairav in the morning, Yaman at night, Kafi
  // between; the sitar's meend, the tabla's keherwa in town.
  'south-asia': {
    id: 'south-asia', name: 'Raga', tonic: 50, scale: DORIAN,
    modes: [
      { scale: [0, 1, 4, 5, 7, 8, 11], from: 4, to: 11 },
      { scale: LYDIAN, from: 17, to: 4 },
    ],
    progressions: [[ch(0, 7), ch(0, 7), ch(0, 7), ch(0, 7)]],
    cadence: [0], bpm: [76, 92], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'sitar', low: 62, high: 86, density: 0.45, ornament: 'meend' },
    answer: null, accomp: null, bass: null, pad: null,
    drone: { instrument: 'tanpura', notes: [-5, 0, 0, -12], figure: '0.1.2.3.', hold: false },
    kits: [[
      { instrument: 'tabla-ge', pattern: 'x...x...|x.......' },
      { instrument: 'tabla-na', pattern: '.o.x.o.o|.o.x.x.o', pitch: 12 },
    ]],
    reverb: 0.35,
  },
  // The gong mode: a major pentatonic over open fifths, the dizi's bright
  // breath, the guzheng's arpeggios and its sweep.
  'east-asia': {
    id: 'east-asia', name: 'Guzheng and dizi', tonic: 50, scale: MAJOR_PENTATONIC,
    progressions: [
      [ch(0, 7), ch(7, 2), ch(9, 4), ch(0, 7)],
      [ch(0, 7), ch(2, 9), ch(7, 2), ch(0, 7)],
      [ch(9, 4), ch(7, 2), ch(2, 9), ch(0, 7)],
    ],
    cadence: [0, 7], bpm: [66, 80], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'dizi', low: 69, high: 91, density: 0.4, ornament: 'grace' },
    answer: { instrument: 'guzheng', low: 62, high: 86, density: 0.45, ornament: 'slide' },
    accomp: { instrument: 'guzheng', low: 50, high: 74, count: 4, figures: ['0.1.2.3.', '0..2.1.3'] },
    bass: null, pad: null, drone: null,
    kits: [[{ instrument: 'woodblock', pattern: 'x.......|....x...' }]],
    reverb: 0.45, glissando: true,
  },
  // The in scale: a shakuhachi bending into its notes, a koto answering.
  japan: {
    id: 'japan', name: 'Koto and shakuhachi', tonic: 52, scale: IN,
    progressions: [
      [ch(0, 7), ch(5, 0), ch(1, 8), ch(0, 7)],
      [ch(0, 7), ch(1, 8), ch(5, 0), ch(7, 0)],
      [ch(5, 0), ch(7, 0), ch(1, 8), ch(0, 7)],
    ],
    cadence: [0, 7], bpm: [58, 70], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'shakuhachi', low: 64, high: 84, density: 0.3, ornament: 'bend' },
    answer: { instrument: 'koto', low: 64, high: 86, density: 0.4, ornament: 'slide' },
    accomp: { instrument: 'koto', low: 52, high: 74, count: 3, figures: ['0.1.2...', '0...2.1.'] },
    bass: null, pad: null, drone: null, kits: [], reverb: 0.5,
  },
  // Gamelan in slendro: the saron's core melody walking to each gatra's goal,
  // the bonang doubling it, and the colotomic gongs marking the cycle.
  'southeast-asia': {
    id: 'southeast-asia', name: 'Gamelan', tonic: 62, scale: SLENDRO,
    progressions: [
      [ch(4.8), ch(2.4), ch(7.2), ch(0)],
      [ch(2.4), ch(0), ch(9.6), ch(7.2)],
      [ch(9.6), ch(7.2), ch(4.8), ch(0)],
    ],
    cadence: [0, 7.2], bpm: [60, 72], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'bonang', low: 74, high: 88, density: 1, ornament: 'none' },
    answer: null,
    accomp: { instrument: 'saron', low: 62, high: 75, count: 1, figures: ['0'] },
    bass: null, pad: null, drone: null,
    kits: [[
      { instrument: 'gong', pattern: '........|........|........|......x.', pitch: -24, always: true },
      { instrument: 'gong', pattern: '........|......o.|......o.|........', pitch: -12, always: true },
      { instrument: 'bonang', pattern: '......o.|......o.|......o.|........', pitch: -12, always: true },
      { instrument: 'kendhang', pattern: 'x..o.x.o' },
    ]],
    reverb: 0.45, gamelan: true,
  },
  // Island time: a ukulele strumming, a lap steel sliding over it.
  oceania: {
    id: 'oceania', name: 'Island ukulele', tonic: 60, scale: MAJOR,
    progressions: [
      [ch(0, 4, 7), ch(9, 0, 4), ch(5, 9, 0), ch(7, 11, 2, 5)],
      [ch(5, 9, 0), ch(7, 11, 2, 5), ch(0, 4, 7), ch(0, 4, 7)],
      [ch(2, 5, 9), ch(7, 11, 2, 5), ch(0, 4, 7), ch(0, 4, 7)],
    ],
    cadence: [0, 7], bpm: [84, 96], beats: 4, steps: 2, barsPerChord: 1, swing: 0.18,
    lead: { instrument: 'steel', low: 64, high: 84, density: 0.42, ornament: 'slide' },
    answer: null,
    accomp: { instrument: 'ukulele', low: 60, high: 72, count: 4, figures: ['d.du.udu'] },
    bass: { instrument: 'bass', low: 36, high: 50, figures: ['r...f...', 'r..rf...'] },
    pad: null, drone: null,
    kits: [[{ instrument: 'shaker', pattern: '-o-o-o-o' }]],
    reverb: 0.28,
  },
  // Ice: a slow pad and a bell now and then.
  polar: {
    id: 'polar', name: 'Ice', tonic: 50, scale: DORIAN,
    progressions: [
      [ch(0, 3, 7, 2), ch(8, 0, 3, 7), ch(3, 7, 10, 2), ch(10, 2, 5)],
      [ch(0, 3, 7, 2), ch(3, 7, 10, 2), ch(10, 2, 5), ch(0, 3, 7, 2)],
    ],
    cadence: [0, 10], bpm: [52, 60], beats: 4, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'bell', low: 69, high: 91, density: 0.18, ornament: 'none' },
    answer: null, accomp: null, bass: null,
    pad: { instrument: 'pad', low: 50, high: 74, count: 3 },
    drone: null, kits: [], reverb: 0.65,
  },
  // Open water: a lydian pad and a harp, slow.
  sea: {
    id: 'sea', name: 'Open water', tonic: 50, scale: LYDIAN,
    progressions: [
      [ch(0, 4, 7, 11), ch(5, 9, 0, 4), ch(2, 6, 9), ch(7, 11, 2)],
      [ch(9, 0, 4, 7), ch(5, 9, 0, 4), ch(2, 6, 9), ch(0, 4, 7, 11)],
    ],
    cadence: [0, 7], bpm: [54, 64], beats: 4, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'harp', low: 69, high: 86, density: 0.2, ornament: 'none' },
    answer: null,
    accomp: { instrument: 'harp', low: 50, high: 76, count: 4, figures: ['0...2...', '0.1...2.'] },
    bass: null,
    pad: { instrument: 'pad', low: 50, high: 72, count: 3 },
    drone: null, kits: [], reverb: 0.6,
  },
  // Altitude: a wide airy pad, a bell, a flute far off.
  sky: {
    id: 'sky', name: 'High air', tonic: 48, scale: LYDIAN,
    progressions: [
      [ch(0, 4, 7, 11), ch(2, 6, 9), ch(4, 7, 11, 2), ch(0, 4, 7, 11)],
      [ch(9, 0, 4, 7), ch(2, 6, 9), ch(0, 4, 7, 11), ch(7, 11, 2)],
    ],
    cadence: [0, 7], bpm: [50, 58], beats: 4, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'bell', low: 72, high: 91, density: 0.15, ornament: 'none' },
    answer: { instrument: 'flute', low: 72, high: 88, density: 0.2, ornament: 'none' },
    accomp: null, bass: null,
    pad: { instrument: 'airpad', low: 55, high: 79, count: 3 },
    drone: null, kits: [], reverb: 0.7,
  },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];

// ---------------------------------------------------------------------------
// Where you are, as a style
// ---------------------------------------------------------------------------

/** The countries a region splits off by ear, which its towns do not. */
const IBERIA = new Set(['ESP', 'PRT', 'AND', 'GIB']);
const ANDES = new Set(['PER', 'BOL', 'ECU']);

/** A country's style: its town region, split where the ear splits it. */
export function styleForCountry(iso: string, continent: string, lat: number): StyleId {
  const region = regionFor(iso, continent, lat).id as RegionId;
  switch (region) {
    case 'nordic': return 'nordic';
    case 'atlantic-europe': return 'atlantic-folk';
    case 'east-europe': return 'east-europe';
    case 'mediterranean': return IBERIA.has(iso) ? 'iberia' : 'mediterranean';
    case 'maghreb': return 'maghreb';
    case 'middle-east': return 'middle-east';
    case 'sub-saharan': return 'sub-saharan';
    case 'south-asia': return 'south-asia';
    case 'east-asia': return iso === 'JPN' ? 'japan' : 'east-asia';
    case 'southeast-asia': return 'southeast-asia';
    case 'north-america': return 'north-america';
    case 'latin-america': return iso === 'BRA' ? 'brazil' : ANDES.has(iso) ? 'andes' : 'latin';
    case 'oceania': return 'oceania';
    case 'polar': return 'polar';
  }
  return 'atlantic-folk';
}

/**
 * Land with no country under it — a sliver the outlines missed — by latitude
 * and longitude alone. Coarse on purpose: it only has to be the right
 * continent.
 */
export function styleByLatLon(lat: number, lon: number): StyleId {
  if (Math.abs(lat) >= 66.5) return 'polar';
  if (lon < -30) return lat > 15 ? 'north-america' : lat > -20 && lon < -60 ? 'andes' : 'latin';
  if (lon < 60) {
    if (lat > 35) return lon < 20 ? 'atlantic-folk' : 'east-europe';
    if (lat > 12) return lon > 35 ? 'middle-east' : 'maghreb';
    return 'sub-saharan';
  }
  if (lon < 150) {
    if (lat > 30) return lon < 90 ? 'middle-east' : 'east-asia';
    if (lat > 5) return lon < 92 ? 'south-asia' : 'southeast-asia';
    return lat < -10 && lon > 110 ? 'oceania' : 'southeast-asia';
  }
  return 'oceania';
}

/** What decides the style. `iso` is empty over water. */
export interface Whereabouts {
  mode: 'menu' | 'foot' | 'swim' | 'car' | 'boat' | 'plane' | 'balloon';
  /** Whether the craft is high enough to have left the ground's music behind; the engine keeps the hysteresis. */
  aloft: boolean;
  iso: string;
  continent: string;
  lat: number;
  lon: number;
}

/** The style for a moment, or `null` for none (the menu). */
export function styleAt(where: Whereabouts): StyleId | null {
  if (where.mode === 'menu') return null;
  if (where.aloft && (where.mode === 'plane' || where.mode === 'balloon')) return 'sky';
  if (where.mode === 'boat') return 'sea';
  if (where.iso === '') return where.mode === 'swim' ? 'sea' : styleByLatLon(where.lat, where.lon);
  return styleForCountry(where.iso, where.continent, where.lat);
}

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

const pc = (x: number): number => ((x % 12) + 12) % 12;
const same = (a: number, b: number): boolean => Math.abs(pc(a - b + 6) - 6) < 0.01;

/** Every pitch, in MIDI, whose class is one of `classes`, inside [low, high]. */
export function pitchesOf(classes: readonly number[], tonic: number, low: number, high: number): number[] {
  const out: number[] = [];
  const first = Math.floor((low - tonic) / 12) - 1;
  for (let octave = first; tonic + 12 * octave <= high + 12; octave++) {
    for (const c of classes) {
      const p = tonic + 12 * octave + pc(c);
      if (p >= low - 1e-6 && p <= high + 1e-6) out.push(p);
    }
  }
  out.sort((a, b) => a - b);
  // A chord may name a class twice (the root and its octave).
  const unique: number[] = [];
  for (const p of out) if (unique.length === 0 || Math.abs(unique[unique.length - 1]! - p) > 0.01) unique.push(p);
  return unique;
}

/**
 * The scale bent to a chord. A chord tone outside the scale — the raised
 * seventh of a minor key's dominant, a secondary dominant's third — replaces
 * the scale tone a semitone below it (or above, if there is none below), so a
 * tune over E7 in A minor sings G sharp and never G against it.
 */
export function scaleOver(scale: readonly number[], chord: Chord): number[] {
  const out = scale.map(pc);
  for (const tone of chord.tones) {
    if (out.some((s) => same(s, tone))) continue;
    const below = out.findIndex((s) => same(s, tone - 1));
    const above = out.findIndex((s) => same(s, tone + 1));
    const at = below >= 0 ? below : above;
    if (at >= 0) out[at] = pc(tone);
    else out.push(pc(tone));
  }
  return [...new Set(out.map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b);
}

/** The scale in force at an hour: a raga's mode, or the style's own. */
export function scaleAt(style: Style, hour: number): readonly number[] {
  for (const mode of style.modes ?? []) {
    const inside = mode.from <= mode.to ? hour >= mode.from && hour < mode.to : hour >= mode.from || hour < mode.to;
    if (inside) return mode.scale;
  }
  return style.scale;
}

/**
 * A chord voiced in a range, led from the last one: of every run of `count`
 * consecutive chord tones in the range, the one that moves least, with a
 * penalty for leaving out the root.
 */
export function voiceChord(chord: Chord, tonic: number, low: number, high: number, count: number, previous: readonly number[] | null): number[] {
  const pool = pitchesOf(chord.tones, tonic, low, high);
  if (pool.length <= count) return pool;
  let best: number[] = pool.slice(0, count);
  let bestCost = Infinity;
  const centre = (low + high) / 2;
  for (let i = 0; i + count <= pool.length; i++) {
    const window = pool.slice(i, i + count);
    let cost = 0;
    if (previous !== null && previous.length > 0) {
      for (let j = 0; j < window.length; j++) cost += Math.abs(window[j]! - previous[Math.min(j, previous.length - 1)]!);
    } else {
      cost = Math.abs(window.reduce((a, b) => a + b, 0) / count - centre);
    }
    if (!window.some((p) => same(p, chord.root))) cost += 3;
    if (cost < bestCost) {
      bestCost = cost;
      best = window;
    }
  }
  return best;
}

function nearestIndex(pool: readonly number[], pitch: number): number {
  let best = 0;
  for (let i = 1; i < pool.length; i++) if (Math.abs(pool[i]! - pitch) < Math.abs(pool[best]! - pitch)) best = i;
  return best;
}

// ---------------------------------------------------------------------------
// The piece
// ---------------------------------------------------------------------------

export type Role = 'lead' | 'answer' | 'accomp' | 'bass' | 'pad' | 'drone' | 'drums';

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
export function moodOf(style: StyleId, town: boolean, daylight: number): Mood {
  const night = daylight < 0.25;
  let energy = 0.45 + (town ? 0.3 : 0) - (night ? 0.2 : 0);
  if (style === 'sky' || style === 'sea' || style === 'polar') energy = Math.min(energy, 0.35);
  return { energy: Math.min(0.9, Math.max(0.15, energy)), drums: town, night };
}

/**
 * A piece: its tempo, its two progressions, its kit and its form, sized to
 * last about `seconds`.
 */
export function planPiece(style: Style, seed: number, mood: Mood, hour: number, seconds: number): Piece {
  const rng = rngFrom('music', style.id, seed);
  const bpm = Math.round(rng.range(style.bpm[0], style.bpm[1]) * (mood.night ? 0.93 : 1));
  const main = rng.pick(style.progressions);
  const rest = style.progressions.filter((p) => p !== main);
  const other = rest.length > 0 ? rng.pick(rest) : main;
  const kit = style.kits.length > 0 ? rng.pick(style.kits) : [];
  const phraseSeconds = (main.length * style.barsPerChord * style.beats * 60) / bpm;
  const count = Math.max(3, Math.min(16, Math.round(seconds / phraseSeconds)));
  const cycle: PhraseKind[] = ['theme', 'variation', 'contrast', 'theme', 'answer', 'contrast', 'variation', 'theme'];
  const form: PhraseKind[] = ['intro'];
  for (let i = 0; form.length < count - 1; i++) form.push(cycle[i % cycle.length]!);
  form.push('outro');
  return {
    style,
    seed,
    bpm,
    scale: scaleAt(style, hour),
    main,
    other,
    kit,
    form,
    density: style.lead.density * (0.85 + 0.3 * mood.energy) * (mood.night ? 0.85 : 1),
    contrastByAnswer: style.answer !== null && rng.chance(0.5),
  };
}

/** How much a step of the bar weighs: the downbeat most, the half bar, the beats, the off-steps least. */
function weightOf(style: Style, step: number): number {
  if (step === 0) return 1;
  if (step % style.steps === 0) {
    const beat = step / style.steps;
    return style.beats % 2 === 0 && beat === style.beats / 2 ? 0.8 : 0.62;
  }
  if (style.steps === 4 && step % 2 === 0) return 0.4;
  return 0.22;
}

/** Beats from the phrase's start of a step, with the swing on the off-steps. */
function timeOf(style: Style, bar: number, step: number): number {
  const off = style.steps % 2 === 0 && step % 2 === 1 ? style.swing : 0;
  return bar * style.beats + (step + off) / style.steps;
}

function note(time: number, length: number, role: Role, instrument: InstrumentId, pitch: number, velocity: number): NoteEvent {
  return { time, length, role, instrument, pitch, velocity: Math.min(1, Math.max(0.05, velocity)), glide: 0, glideTime: 0, tremolo: false, damped: false };
}

/** The chords of a phrase, bar by bar, with the tonic appended to an outro. */
function barsOf(piece: Piece, kind: PhraseKind): Chord[] {
  const progression = kind === 'contrast' ? piece.other : piece.main;
  const bars: Chord[] = [];
  for (const chord of progression) for (let i = 0; i < piece.style.barsPerChord; i++) bars.push(chord);
  if (kind === 'outro') {
    const tonic = piece.main.find((c) => same(c.root, 0)) ?? ch(0, 7);
    bars.push(tonic);
  }
  return bars;
}

/**
 * A tune over the bars.
 *
 * Two streams: `rng` decides everything the theme is, and `alt` decides how
 * a variation departs from it, so a variation is the theme with a few notes
 * moved and the walk underneath it untouched.
 */
function melody(piece: Piece, part: MelodyPart, role: Role, bars: readonly Chord[], rng: Rng, alt: Rng | null, final: boolean, energy: number): NoteEvent[] {
  const style = piece.style;
  const stepsPerBar = style.beats * style.steps;
  const events: NoteEvent[] = [];
  const cell = (): boolean[] => {
    const on: boolean[] = [];
    for (let s = 0; s < stepsPerBar; s++) on.push(rng.unit() < piece.density * (0.2 + weightOf(style, s)));
    if (!on.some(Boolean)) on[0] = true;
    return on;
  };
  const a = cell();
  const b = cell();
  const c = cell();
  const shapes = [a, b, a, c];
  const onsets: { bar: number; step: number }[] = [];
  for (let bar = 0; bar < bars.length; bar++) {
    if (bar === bars.length - 1) {
      // The cadence: a note on the downbeat, perhaps one before it, and held.
      if (rng.chance(0.5)) onsets.push({ bar: bar - 1 < 0 ? bar : bar - 1, step: stepsPerBar - style.steps });
      onsets.push({ bar, step: 0 });
      break;
    }
    const shape = shapes[bar % shapes.length]!;
    for (let s = 0; s < stepsPerBar; s++) {
      if (!shape[s]) continue;
      // A variation leaves out a weak note now and then.
      if (alt !== null && weightOf(style, s) < 0.5 && alt.chance(0.15)) continue;
      onsets.push({ bar, step: s });
    }
  }
  // Onsets sorted and de-duplicated (the cadence's pickup can land on a written note).
  onsets.sort((x, y) => x.bar - y.bar || x.step - y.step);
  const unique = onsets.filter((o, i) => i === 0 || o.bar !== onsets[i - 1]!.bar || o.step !== onsets[i - 1]!.step);

  const total = bars.length * style.beats;
  let prev = voiceChord(bars[0]!, style.tonic, part.low, part.high, 1, [(part.low + part.high) / 2 - 2])[0] ?? part.low;
  let dir = rng.sign();
  let leapt = false;
  for (let i = 0; i < unique.length; i++) {
    const { bar, step } = unique[i]!;
    const chord = bars[bar]!;
    const last = i === unique.length - 1;
    const pool = pitchesOf(scaleOver(piece.scale, chord), style.tonic, part.low, part.high);
    const tones = pitchesOf(chord.tones, style.tonic, part.low, part.high);
    const weight = weightOf(style, step);
    const progress = (bar * stepsPerBar + step) / (bars.length * stepsPerBar);
    let pitch: number;
    if (last) {
      // Land on the root of the chord that closes the phrase, or the tonic at the very end.
      const home = final ? 0 : chord.root;
      const roots = pitchesOf([home], style.tonic, part.low, part.high);
      pitch = roots.length > 0 ? roots[nearestIndex(roots, prev)]! : prev;
    } else if (weight >= 0.6 && tones.length > 0) {
      const near = tones.filter((t) => Math.abs(t - prev) <= 7);
      const choices = near.length > 0 ? near : tones;
      pitch = rng.weighted(choices.map((t) => ({ item: t, weight: 1 / (1 + Math.abs(Math.abs(t - prev) - 2)) })));
    } else {
      const at = nearestIndex(pool, prev);
      const up = progress < 0.55 ? 0.62 : 0.38;
      if (leapt) dir = -dir;
      else if (!rng.chance(0.65)) dir = rng.chance(up) ? 1 : -1;
      const move = rng.chance(0.14) ? 2 : 1;
      let next = at + dir * move;
      if (next < 0 || next >= pool.length) {
        dir = -dir;
        next = at + dir * move;
      }
      pitch = pool[Math.max(0, Math.min(pool.length - 1, next))]!;
    }
    leapt = Math.abs(pitch - prev) > 4;
    prev = pitch;

    let sung = pitch;
    if (alt !== null && !last && alt.chance(0.28)) {
      const at = nearestIndex(pool, pitch);
      sung = pool[Math.max(0, Math.min(pool.length - 1, at + alt.sign()))]!;
    }
    const time = timeOf(style, bar, step);
    const nextTime = i + 1 < unique.length ? timeOf(style, unique[i + 1]!.bar, unique[i + 1]!.step) : total;
    const length = Math.max(0.2, last ? total - time : Math.min(3, nextTime - time) * 0.95);
    const velocity = 0.5 + 0.3 * weight + 0.1 * energy + rng.jitter() * 0.07;
    events.push(note(time, length, role, part.instrument, sung, last ? velocity * 0.9 : velocity));
  }
  ornament(piece, part, events, rng);
  return events;
}

/** The ornaments a tradition puts on a written tune. */
function ornament(piece: Piece, part: MelodyPart, events: NoteEvent[], rng: Rng): void {
  const style = piece.style;
  const graces: NoteEvent[] = [];
  let previous = 0;
  for (const e of events) {
    switch (part.ornament) {
      case 'grace':
        // A cut: the scale tone above, struck a moment before the note.
        if (e.length >= 0.75 && rng.chance(0.22)) {
          const pool = pitchesOf(piece.scale, style.tonic, part.low, part.high + 3);
          const above = pool.find((p) => p > e.pitch + 0.01);
          if (above !== undefined && e.time >= 0.12) graces.push(note(e.time - 0.12, 0.1, e.role, e.instrument, above, e.velocity * 0.7));
        }
        break;
      case 'slide':
        if (previous !== 0 && Math.abs(previous - e.pitch) <= 5 && Math.abs(previous - e.pitch) > 0.01 && rng.chance(0.3)) {
          e.glide = previous;
          e.glideTime = 0.07;
        }
        break;
      case 'meend':
        // The sitar's pull along the fret: slower and wider than a slide.
        if (previous !== 0 && Math.abs(previous - e.pitch) <= 7 && Math.abs(previous - e.pitch) > 0.01 && rng.chance(0.45)) {
          e.glide = previous;
          e.glideTime = 0.2;
        }
        break;
      case 'bend':
        // The breath bending up into the note from under it.
        if (e.length >= 1 && rng.chance(0.4)) {
          e.glide = e.pitch - rng.range(0.5, 1);
          e.glideTime = 0.16;
        }
        break;
      case 'tremolo':
        if (e.length >= 0.9) e.tremolo = true;
        break;
      case 'none':
        break;
    }
    previous = e.pitch;
  }
  events.push(...graces);
}

/** The accompaniment: a figure over each bar's voicing. */
function accompany(piece: Piece, part: AccompPart, bars: readonly Chord[], rng: Rng, mood: Mood, kind: PhraseKind): NoteEvent[] {
  const style = piece.style;
  const stepsPerBar = style.beats * style.steps;
  const figure = rng.pick(part.figures).split('|');
  const events: NoteEvent[] = [];
  let voicing: number[] | null = null;
  const spread = (0.018 * piece.bpm) / 60;
  const bassPitch = (chord: Chord, interval: number): number => {
    const pool = pitchesOf([chord.root + interval], style.tonic, part.low, part.low + 12);
    return pool.length > 0 ? pool[nearestIndex(pool, part.low + 4)]! : part.low;
  };
  for (let bar = 0; bar < bars.length; bar++) {
    const chord = bars[bar]!;
    voicing = voiceChord(chord, style.tonic, part.low, part.high, part.count, voicing);
    const pattern = figure[bar % figure.length]!;
    const finalBar = kind === 'outro' && bar === bars.length - 1;
    const onsets: number[] = [];
    for (let s = 0; s < Math.min(pattern.length, stepsPerBar); s++) if (pattern[s] !== '.') onsets.push(s);
    for (let k = 0; k < onsets.length; k++) {
      const s = onsets[k]!;
      if (finalBar && s !== 0) continue;
      const token = finalBar ? 'c' : pattern[s]!;
      const weight = weightOf(style, s);
      // Thin the weak strokes when the moment is quiet.
      if (!finalBar && weight < 0.5 && rng.chance(Math.max(0, 0.5 - mood.energy) * 0.9)) continue;
      const time = timeOf(style, bar, s);
      const next = finalBar ? style.beats * 2 : (k + 1 < onsets.length ? onsets[k + 1]! : stepsPerBar) - s;
      const length = finalBar ? next : next / style.steps;
      const velocity = (0.42 + 0.3 * weight) * (mood.night ? 0.85 : 1) * (0.9 + 0.2 * mood.energy) + rng.jitter() * 0.05;
      if (token >= '0' && token <= '9') {
        const index = Number(token);
        const pitch = index < voicing.length ? voicing[index]! : voicing[index % voicing.length]! + 12;
        if (pitch <= part.high + 12) events.push(note(time, length, 'accomp', part.instrument, pitch, velocity));
      } else if (token === 'b' || token === 'f') {
        events.push(note(time, length, 'accomp', part.instrument, bassPitch(chord, token === 'f' ? 7 : 0), velocity + 0.05));
      } else if (token === 'd' || token === 'u' || token === 'c') {
        const strings = token === 'u' ? voicing.slice(-3).reverse() : voicing;
        for (let j = 0; j < strings.length; j++) {
          const offset = token === 'c' ? 0 : j * spread;
          const stroke = note(time + offset, length, 'accomp', part.instrument, strings[j]!, velocity * (token === 'u' ? 0.7 : 1) * (1 - j * 0.04));
          // The hand that strums the next stroke stops this one.
          stroke.damped = k + 1 < onsets.length;
          events.push(stroke);
        }
      }
    }
  }
  if (style.glissando && (kind === 'intro' || kind === 'contrast') && rng.chance(0.6)) {
    // A sweep up the strings into the section's first chord.
    const run = pitchesOf(piece.scale, style.tonic, part.low + 5, part.high + 5).slice(0, 9);
    for (let j = 0; j < run.length; j++) events.push(note(j * 0.09, 0.6, 'accomp', part.instrument, run[j]!, 0.3 + j * 0.03));
  }
  return events;
}

function bassLine(piece: Piece, part: BassPart, bars: readonly Chord[], rng: Rng, mood: Mood, kind: PhraseKind): NoteEvent[] {
  const style = piece.style;
  const stepsPerBar = style.beats * style.steps;
  const figure = rng.pick(part.figures).split('|');
  const events: NoteEvent[] = [];
  let prev = (part.low + part.high) / 2;
  for (let bar = 0; bar < bars.length; bar++) {
    const chord = bars[bar]!;
    const nextChord = bars[bar + 1] ?? bars[0]!;
    const pattern = figure[bar % figure.length]!;
    const finalBar = kind === 'outro' && bar === bars.length - 1;
    const onsets: number[] = [];
    for (let s = 0; s < Math.min(pattern.length, stepsPerBar); s++) if (pattern[s] !== '.') onsets.push(s);
    for (let k = 0; k < onsets.length; k++) {
      const s = onsets[k]!;
      if (finalBar && s !== 0) continue;
      const token = finalBar ? 'r' : pattern[s]!;
      const interval = token === 'f' ? 7 : token === 'o' ? 12 : 0;
      const classOf = token === 'a' ? nextChord.root - 1 : chord.root + interval;
      const pool = pitchesOf([token === 'a' ? classOf : pc(classOf)], style.tonic, part.low, part.high);
      if (pool.length === 0) continue;
      const pitch = pool[nearestIndex(pool, token === 'o' ? prev + 12 : prev)]!;
      prev = pitch;
      const next = (k + 1 < onsets.length ? onsets[k + 1]! : stepsPerBar) - s;
      const length = finalBar ? style.beats * 2 : next / style.steps;
      events.push(note(timeOf(style, bar, s), length, 'bass', part.instrument, pitch, (0.6 + 0.2 * weightOf(style, s)) * (mood.night ? 0.85 : 1) + rng.jitter() * 0.04));
    }
  }
  return events;
}

function padLine(piece: Piece, part: PadPart, bars: readonly Chord[], mood: Mood): NoteEvent[] {
  const style = piece.style;
  const events: NoteEvent[] = [];
  let voicing: number[] | null = null;
  for (let bar = 0; bar < bars.length; bar++) {
    if (bar > 0 && bars[bar] === bars[bar - 1]) continue;
    let span = 1;
    while (bar + span < bars.length && bars[bar + span] === bars[bar]) span++;
    voicing = voiceChord(bars[bar]!, style.tonic, part.low, part.high, part.count, voicing);
    for (const pitch of voicing) events.push(note(bar * style.beats, span * style.beats + 0.4, 'pad', part.instrument, pitch, 0.5 + 0.3 * mood.energy));
  }
  return events;
}

function droneLine(piece: Piece, part: DronePart, bars: readonly Chord[]): NoteEvent[] {
  const style = piece.style;
  const events: NoteEvent[] = [];
  const total = bars.length * style.beats;
  if (part.hold) {
    for (const n of part.notes) events.push(note(0, total + 0.5, 'drone', part.instrument, style.tonic + n, 0.6));
    return events;
  }
  const stepsPerBar = style.beats * style.steps;
  for (let bar = 0; bar < bars.length; bar++) {
    for (let s = 0; s < Math.min(part.figure.length, stepsPerBar); s++) {
      const token = part.figure[s]!;
      if (token === '.') continue;
      const notes = token === '*' ? part.notes : [part.notes[Number(token) % part.notes.length]!];
      for (const n of notes) events.push(note(timeOf(style, bar, s), 2, 'drone', part.instrument, style.tonic + n, 0.55));
    }
  }
  return events;
}

function drumLines(piece: Piece, bars: readonly Chord[], rng: Rng, mood: Mood, kind: PhraseKind, phraseIndex: number): NoteEvent[] {
  const style = piece.style;
  const stepsPerBar = style.beats * style.steps;
  const events: NoteEvent[] = [];
  const barsBefore = phraseIndex * bars.length;
  for (const line of piece.kit) {
    if (!line.always && !mood.drums) continue;
    const cycle = line.pattern.split('|');
    for (let bar = 0; bar < bars.length; bar++) {
      if (kind === 'intro' && !line.always && bar < bars.length / 2) continue;
      const finalBar = kind === 'outro' && bar === bars.length - 1;
      const pattern = cycle[(barsBefore + bar) % cycle.length]!;
      for (let s = 0; s < Math.min(pattern.length, stepsPerBar); s++) {
        const token = pattern[s]!;
        if (token === '.') continue;
        if (finalBar && s !== 0) continue;
        if (token === '-' && (mood.night || mood.energy < 0.4)) continue;
        const velocity = (token === 'x' ? 0.9 : token === 'o' ? 0.62 : 0.32) * (mood.night ? 0.75 : 1) + rng.jitter() * 0.06;
        const pitch = line.pitch === undefined ? 0 : style.tonic + line.pitch;
        events.push(note(timeOf(style, bar, s), 0.5, 'drums', line.instrument, pitch, velocity));
      }
    }
  }
  return events;
}

/**
 * The gamelan: each bar a gatra of four core notes on the saron, walking by
 * slendro step to its goal on the fourth beat, and the bonang an octave up
 * playing each pair of them twice as fast, ahead of the saron.
 */
function gamelan(piece: Piece, bars: readonly Chord[], rng: Rng, mood: Mood, kind: PhraseKind): NoteEvent[] {
  const style = piece.style;
  const saron = style.accomp!;
  const bonang = style.lead;
  const events: NoteEvent[] = [];
  const pool = pitchesOf(piece.scale, style.tonic, saron.low, saron.high);
  let at = nearestIndex(pool, style.tonic + 4.8);
  for (let bar = 0; bar < bars.length; bar++) {
    const goals = pitchesOf([bars[bar]!.root], style.tonic, saron.low, saron.high);
    const goal = nearestIndex(pool, goals[nearestIndex(goals, pool[at]!)]!);
    const gatra: number[] = [];
    for (let beat = 0; beat < 3; beat++) {
      const towards = Math.sign(goal - at);
      at += towards !== 0 && rng.chance(0.6) ? towards : rng.sign();
      at = Math.max(0, Math.min(pool.length - 1, at));
      gatra.push(at);
    }
    at = goal;
    gatra.push(goal);
    for (let beat = 0; beat < 4; beat++) {
      events.push(note(bar * 4 + beat, 1, 'accomp', saron.instrument, pool[gatra[beat]!]!, 0.62 + (beat === 3 ? 0.15 : 0) + rng.jitter() * 0.05));
    }
    if (kind === 'intro' || kind === 'answer') continue;
    // Mipil: the pairs (1 2) and (3 4), each played twice in eighths, the first
    // pair across beats 1 and 2 and the second across 3 and 4.
    for (let half = 0; half < 2; half++) {
      const x = pool[gatra[half * 2]!]! + 12;
      const y = pool[gatra[half * 2 + 1]!]! + 12;
      for (let k = 0; k < 4; k++) {
        const pitch = k % 2 === 0 ? x : y;
        if (pitch > bonang.high + 0.01) continue;
        events.push(note(bar * 4 + half * 2 + k * 0.5, 0.5, 'lead', bonang.instrument, pitch, (0.45 + (k === 3 ? 0.1 : 0)) * (mood.night ? 0.8 : 1) + rng.jitter() * 0.05));
      }
    }
  }
  return events;
}

/** One phrase of a piece. Pure: the same piece, index and mood give the same notes. */
export function composePhrase(piece: Piece, index: number, mood: Mood): Phrase {
  const style = piece.style;
  const kind = piece.form[Math.min(index, piece.form.length - 1)]!;
  const bars = barsOf(piece, kind);
  const beats = bars.length * style.beats;
  const rng = rngFrom('phrase', style.id, piece.seed, index);
  const events: NoteEvent[] = [];

  if (style.gamelan) {
    // The core melody is the tune, so it comes back as a theme does.
    const core = kind === 'variation' ? rng.fork('gamelan') : rngFrom('theme', style.id, piece.seed, kind === 'contrast' ? 'other' : 'main');
    events.push(...gamelan(piece, bars, core, mood, kind));
  } else {
    if (style.accomp !== null) events.push(...accompany(piece, style.accomp, bars, rng.fork('accomp'), mood, kind));
    // The tune: the theme from its own seed every time, a variation off the
    // same seed, the contrast from another.
    if (kind !== 'intro') {
      const themeRng = rngFrom('theme', style.id, piece.seed, kind === 'contrast' ? 'other' : 'main');
      const alt = kind === 'variation' || (kind === 'answer' && style.answer === null) ? rng.fork('variation') : null;
      const final = kind === 'outro';
      let part: MelodyPart = style.lead;
      let role: Role = 'lead';
      if (style.answer !== null && (kind === 'answer' || (kind === 'contrast' && piece.contrastByAnswer))) {
        part = style.answer;
        role = 'answer';
      }
      events.push(...melody(piece, part, role, bars, themeRng, alt, final, mood.energy));
    }
  }
  if (style.bass !== null) events.push(...bassLine(piece, style.bass, bars, rng.fork('bass'), mood, kind));
  if (style.pad !== null) events.push(...padLine(piece, style.pad, bars, mood));
  if (style.drone !== null) events.push(...droneLine(piece, style.drone, bars));
  events.push(...drumLines(piece, bars, rng.fork('drums'), mood, kind, index));
  events.sort((a, b) => a.time - b.time);
  return { kind, beats, events };
}
