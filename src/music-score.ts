/**
 * What the music plays: a style for each region the towns are built in, and the
 * composer that turns one into phrases.
 *
 * A style is data (`music-score/styles.ts`): a scale in semitones, chord
 * progressions as pitch classes over the tonic, a tempo range, a metre and the
 * parts that play. The composer follows the rules a person would: the tune lands
 * on chord tones on strong beats and walks by scale step between them, repeats a
 * rhythmic cell, and cadences onto the chord it ends on. A piece is a form (intro,
 * theme, variation, contrast, theme, outro) and the theme comes back note for
 * note because it is composed from the same seed.
 *
 * Pure: no Web Audio, no clock, no `Math.random`.
 */
import { rngFrom } from './scenery/random.ts';
import type { MelodyPart } from './music-score/style-types.ts';
import type { Mood, NoteEvent, Phrase, Piece, Role } from './music-score/events.ts';
import { barsOf } from './music-score/plan.ts';
import { melody } from './music-score/melody.ts';
import { accompany, bassLine, droneLine, drumLines, gamelan, padLine } from './music-score/backing.ts';

export { INSTRUMENTS } from './music-score/instruments.ts';
export type { WindSpec, PadSpec, Instrument, InstrumentId } from './music-score/instruments.ts';
export type { StyleId, Chord, Ornament, Part, MelodyPart, AccompPart, BassPart, PadPart, DronePart, DrumLine, Style } from './music-score/style-types.ts';
export { STYLES, STYLE_IDS } from './music-score/styles.ts';
export { styleForCountry, styleByLatLon, styleAt } from './music-score/regions.ts';
export type { Whereabouts } from './music-score/regions.ts';
export { pitchesOf, scaleOver, scaleAt, voiceChord } from './music-score/pitch.ts';
export { ringOf } from './music-score/events.ts';
export type { Role, NoteEvent, Mood, PhraseKind, Piece, Phrase } from './music-score/events.ts';
export { moodOf, planPiece, barsOf } from './music-score/plan.ts';
export { ATMOSPHERE, ATMOSPHERES, HOME, atmosphereBar, atmosphereOf, weatherCueOf } from './music-score/atmosphere.ts';
export type { Atmosphere, AtmosphereSpec, WeatherCue } from './music-score/atmosphere.ts';

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
