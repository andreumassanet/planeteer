/** Planning a piece: its mood, tempo, progressions and form. */
import { rngFrom } from '../scenery/random.ts';
import type { InstrumentId } from './instruments.ts';
import type { Chord, Style, StyleId } from './style-types.ts';
import { ch } from './styles.ts';
import { same, scaleAt } from './pitch.ts';
import type { Mood, NoteEvent, PhraseKind, Piece, Role } from './events.ts';
import { ATMOSPHERE, NIGHT_DAYLIGHT, atmosphereOf } from './atmosphere.ts';
import type { WeatherCue } from './atmosphere.ts';

export function moodOf(style: StyleId, town: boolean, daylight: number, weather: WeatherCue = 'clear'): Mood {
  const night = daylight < NIGHT_DAYLIGHT;
  const atmosphere = atmosphereOf(daylight, weather);
  const spec = ATMOSPHERE[atmosphere];
  // Night's own softening is the night atmosphere's energy; weather over the dark softens it the same.
  let energy = 0.45 + (town ? 0.3 : 0) + spec.energy + (night && atmosphere !== 'night' ? ATMOSPHERE.night.energy : 0);
  if (style === 'sky' || style === 'sea' || style === 'polar') energy = Math.min(energy, 0.35);
  return { energy: Math.min(0.9, Math.max(0.15, energy)), drums: town && spec.drums, night, atmosphere };
}

/**
 * A piece: its tempo, its two progressions, its kit and its form, sized to
 * last about `seconds`.
 */
export function planPiece(style: Style, seed: number, mood: Mood, hour: number, seconds: number): Piece {
  const rng = rngFrom('music', style.id, seed);
  const bend = ATMOSPHERE[mood.atmosphere];
  const bpm = Math.round(rng.range(style.bpm[0], style.bpm[1]) * bend.tempo * (mood.night && mood.atmosphere !== 'night' ? 0.95 : 1));
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
    density: style.lead.density * (0.85 + 0.3 * mood.energy) * bend.density,
    contrastByAnswer: style.answer !== null && rng.chance(0.5),
  };
}

/** How much a step of the bar weighs: the downbeat most, the half bar, the beats, the off-steps least. */
export function weightOf(style: Style, step: number): number {
  if (step === 0) return 1;
  if (step % style.steps === 0) {
    const beat = step / style.steps;
    return style.beats % 2 === 0 && beat === style.beats / 2 ? 0.8 : 0.62;
  }
  if (style.steps === 4 && step % 2 === 0) return 0.4;
  return 0.22;
}

/** Beats from the phrase's start of a step, with the swing on the off-steps. */
export function timeOf(style: Style, bar: number, step: number): number {
  const off = style.steps % 2 === 0 && step % 2 === 1 ? style.swing : 0;
  return bar * style.beats + (step + off) / style.steps;
}

export function note(time: number, length: number, role: Role, instrument: InstrumentId, pitch: number, velocity: number): NoteEvent {
  return { time, length, role, instrument, pitch, velocity: Math.min(1, Math.max(0.05, velocity)), glide: 0, glideTime: 0, tremolo: false, damped: false };
}

/** The chords of a phrase, bar by bar, with the tonic appended to an outro. */
export function barsOf(piece: Piece, kind: PhraseKind): Chord[] {
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
