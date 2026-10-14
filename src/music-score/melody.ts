/** The tune, and its ornaments. */
import type { Rng } from '../scenery/random.ts';
import type { Chord, MelodyPart } from './style-types.ts';
import { nearestIndex, pitchesOf, scaleOver, voiceChord } from './pitch.ts';
import type { NoteEvent, Piece, Role } from './events.ts';
import { note, timeOf, weightOf } from './plan.ts';

export function melody(piece: Piece, part: MelodyPart, role: Role, bars: readonly Chord[], rng: Rng, alt: Rng | null, final: boolean, energy: number): NoteEvent[] {
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
export function ornament(piece: Piece, part: MelodyPart, events: NoteEvent[], rng: Rng): void {
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
