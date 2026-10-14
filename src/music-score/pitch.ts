/** Pitch classes, scales and chord voicing. */
import type { Chord, Style } from './style-types.ts';

export const pc = (x: number): number => ((x % 12) + 12) % 12;
export const same = (a: number, b: number): boolean => Math.abs(pc(a - b + 6) - 6) < 0.01;

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

export function nearestIndex(pool: readonly number[], pitch: number): number {
  let best = 0;
  for (let i = 1; i < pool.length; i++) if (Math.abs(pool[i]! - pitch) < Math.abs(pool[best]! - pitch)) best = i;
  return best;
}
