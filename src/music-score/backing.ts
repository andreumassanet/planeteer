/** Everything that is not the tune: accompaniment, bass, pad, drone, drums and the gamelan. */
import type { Rng } from '../scenery/random.ts';
import type { AccompPart, BassPart, Chord, DronePart, PadPart } from './style-types.ts';
import { nearestIndex, pc, pitchesOf, voiceChord } from './pitch.ts';
import type { Mood, NoteEvent, PhraseKind, Piece } from './events.ts';
import { note, timeOf, weightOf } from './plan.ts';

export function accompany(piece: Piece, part: AccompPart, bars: readonly Chord[], rng: Rng, mood: Mood, kind: PhraseKind): NoteEvent[] {
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

export function bassLine(piece: Piece, part: BassPart, bars: readonly Chord[], rng: Rng, mood: Mood, kind: PhraseKind): NoteEvent[] {
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

export function padLine(piece: Piece, part: PadPart, bars: readonly Chord[], mood: Mood): NoteEvent[] {
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

export function droneLine(piece: Piece, part: DronePart, bars: readonly Chord[]): NoteEvent[] {
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

export function drumLines(piece: Piece, bars: readonly Chord[], rng: Rng, mood: Mood, kind: PhraseKind, phraseIndex: number): NoteEvent[] {
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
export function gamelan(piece: Piece, bars: readonly Chord[], rng: Rng, mood: Mood, kind: PhraseKind): NoteEvent[] {
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
