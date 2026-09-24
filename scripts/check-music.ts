/**
 * Headless assertions over the music: the styles, the composer and the
 * synthesis, with no Web Audio anywhere.
 *
 * **A wrong note is invisible in a table and obvious to an ear, and nobody
 * listens to twenty styles after every edit.** So what an ear would catch
 * first is held here: every scale is a scale, every progression ends on a
 * cadence it declares, every note the composer writes is in its instrument's
 * range and in its style's scale or its chord, the outro lands on the tonic,
 * the theme comes back note for note, the same seed writes the same piece,
 * and the voices a phrase asks for fit the engine's budget. The synthesis is
 * held to arithmetic: every render is finite, normalised and ends in silence,
 * and a plucked string sounds at the pitch it was asked for, which is the
 * fractional delay the Karplus–Strong loop needs and the one thing in it
 * that fails without a sound anyone would call wrong — a quarter-tone flat.
 *
 * `node scripts/check-music.ts`, or `pnpm music`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INSTRUMENTS,
  STYLES,
  STYLE_IDS,
  composePhrase,
  moodOf,
  planPiece,
  ringOf,
  scaleOver,
  styleAt,
  styleForCountry,
} from '../src/music-score.ts';
import type { InstrumentId, Mood, NoteEvent, Piece, Style } from '../src/music-score.ts';
import { render, renderImpulse, renderPluck } from '../src/music-synth.ts';
import type { PluckSpec, RenderSpec } from '../src/music-synth.ts';
import { ISO_REGIONS } from '../src/scenery/regions.ts';

const pc = (x: number): number => ((x % 12) + 12) % 12;
const near = (a: number, b: number): boolean => Math.abs(pc(a - b + 6) - 6) < 0.02;
const RENDER_RATE = 24000;

const MOODS: Mood[] = [
  moodOf('iberia', true, 1),
  moodOf('iberia', false, 1),
  moodOf('iberia', true, 0),
  moodOf('iberia', false, 0),
];

/** Every phrase of a piece. */
function wholePiece(piece: Piece, mood: Mood): { kind: string; beats: number; events: NoteEvent[] }[] {
  return piece.form.map((_, i) => composePhrase(piece, i, mood));
}

function isRendered(id: InstrumentId): boolean {
  const kind = INSTRUMENTS[id].sound.kind;
  return kind === 'pluck' || kind === 'modal' || kind === 'drum';
}

test('every style is a well-formed table', () => {
  for (const id of STYLE_IDS) {
    const style = STYLES[id];
    assert.equal(style.id, id);
    const scales = [style.scale, ...(style.modes ?? []).map((m) => m.scale)];
    for (const scale of scales) {
      assert.equal(scale[0], 0, `${id}: a scale starts on its tonic`);
      for (let i = 1; i < scale.length; i++) assert.ok(scale[i]! > scale[i - 1]! && scale[i]! < 12, `${id}: scale ascending inside the octave`);
      assert.ok(scale.length >= 5, `${id}: at least five tones`);
    }
    assert.ok(style.tonic >= 36 && style.tonic <= 72, `${id}: tonic ${style.tonic}`);
    assert.ok(style.bpm[0] <= style.bpm[1] && style.bpm[0] >= 40 && style.bpm[1] <= 160, `${id}: tempo`);
    const stepsPerBar = style.beats * style.steps;
    const parts = [style.lead, style.answer, style.accomp, style.bass, style.pad].filter((p) => p !== null);
    for (const part of parts) {
      assert.ok(part.instrument in INSTRUMENTS, `${id}: ${part.instrument} exists`);
      assert.ok(part.low < part.high && part.low >= 24 && part.high <= 100, `${id}: ${part.instrument} range ${part.low}-${part.high}`);
    }
    if (style.lead.instrument === 'bell' || style.lead.instrument === 'harp') assert.ok(style.lead.density <= 0.3, `${id}: an ambient lead stays sparse`);
    const figures = [...(style.accomp?.figures ?? []), ...(style.bass?.figures ?? [])];
    if (!style.gamelan) {
      for (const figure of figures) {
        for (const bar of figure.split('|')) assert.equal(bar.length, stepsPerBar, `${id}: figure "${figure}" is ${stepsPerBar} steps a bar`);
      }
    }
    if (style.drone !== null) assert.equal(style.drone.figure.length, stepsPerBar, `${id}: drone figure`);
    for (const kit of style.kits) {
      for (const line of kit) {
        assert.ok(line.instrument in INSTRUMENTS, `${id}: ${line.instrument} exists`);
        for (const bar of line.pattern.split('|')) assert.equal(bar.length, stepsPerBar, `${id}: ${line.instrument} "${line.pattern}"`);
        assert.match(line.pattern, /^[xo.\-|]+$/, `${id}: ${line.instrument} pattern characters`);
      }
    }
    assert.ok(style.reverb >= 0 && style.reverb <= 1);
  }
});

test('every progression resolves: its chords fit the scale and it ends on a declared cadence', () => {
  for (const id of STYLE_IDS) {
    const style = STYLES[id];
    const scales = [style.scale, ...(style.modes ?? []).map((m) => m.scale)];
    assert.ok(style.cadence.some((c) => near(c, 0)), `${id}: the tonic is a cadence`);
    for (const progression of style.progressions) {
      assert.ok(progression.length >= 2, `${id}: a progression moves`);
      const last = progression[progression.length - 1]!;
      assert.ok(style.cadence.some((c) => near(c, last.root)), `${id}: ends on ${last.root}, not a cadence`);
      // A progression that does not end on the tonic ends on one it can fall
      // to: the loop back to its first chord, or to the phrase after.
      if (!near(last.root, 0)) assert.ok(progression.some((c) => near(c.root, 0)) || style.progressions.some((p) => near(p[0]!.root, 0)), `${id}: no tonic to resolve to`);
      for (const chord of progression) {
        assert.ok(near(chord.tones[0]!, chord.root), `${id}: the root is the first tone`);
        for (const tone of chord.tones) {
          // A chord tone is in the scale, or a chromatic alteration a semitone off one.
          for (const scale of scales) {
            const inside = scale.some((s) => near(s, tone));
            const altered = scale.some((s) => near(s, tone - 1) || near(s, tone + 1));
            assert.ok(inside || altered, `${id}: chord tone ${tone} is far from the scale`);
          }
        }
      }
    }
  }
});

test('the composer writes in range, in the scale, and home at the end', () => {
  for (const id of STYLE_IDS) {
    const style = STYLES[id];
    const chordTones = new Set<number>();
    for (const p of style.progressions) for (const c of p) for (const t of c.tones) chordTones.add(Math.round(pc(t) * 100));
    for (const [m, mood] of MOODS.entries()) {
      for (const seed of [1, 7, 2024]) {
        for (const hour of [6, 13, 21]) {
          const piece = planPiece(style, seed, mood, hour, 120);
          assert.equal(piece.form[0], 'intro');
          assert.equal(piece.form[piece.form.length - 1], 'outro');
          const allowed = (pitch: number): boolean =>
            piece.scale.some((s) => near(s, pitch - style.tonic)) || chordTones.has(Math.round(pc(pitch - style.tonic) * 100));
          const phrases = wholePiece(piece, mood);
          for (const phrase of phrases) {
            for (const e of phrase.events) {
              const where = `${id} seed ${seed} mood ${m} ${phrase.kind} ${e.role} ${e.instrument}`;
              assert.ok(e.instrument in INSTRUMENTS, where);
              assert.ok(Number.isFinite(e.time) && e.time >= 0 && e.time <= phrase.beats + 0.01, `${where}: time ${e.time}`);
              assert.ok(e.length > 0 && Number.isFinite(e.length), `${where}: length`);
              assert.ok(e.velocity > 0 && e.velocity <= 1, `${where}: velocity ${e.velocity}`);
              if (e.role === 'drums' && e.pitch === 0) continue;
              assert.ok(e.pitch >= 24 && e.pitch <= 100, `${where}: pitch ${e.pitch}`);
              if (e.role !== 'drums' && e.role !== 'drone') assert.ok(allowed(e.pitch), `${where}: ${e.pitch} is not in the scale or a chord`);
              if (e.role === 'lead' || e.role === 'answer') {
                const part = e.role === 'lead' ? style.lead : style.answer!;
                assert.ok(e.pitch >= part.low - 0.01 && e.pitch <= part.high + 3.01, `${where}: ${e.pitch} outside ${part.low}-${part.high}`);
              }
              if (e.glide !== 0) assert.ok(Math.abs(e.glide - e.pitch) <= 7.01 && e.glideTime > 0, `${where}: a slide`);
            }
          }
          if (!style.gamelan) {
            // The last tune note of the outro is the tonic.
            const outro = phrases[phrases.length - 1]!;
            const tune = outro.events.filter((e) => e.role === 'lead' || e.role === 'answer');
            const last = tune.reduce((a, b) => (b.time > a.time ? b : a));
            assert.ok(near(last.pitch - style.tonic, 0), `${id} seed ${seed}: the outro ends on ${last.pitch}, not the tonic`);
          }
        }
      }
    }
  }
});

test('the theme comes back note for note, and a seed is a piece', () => {
  for (const id of STYLE_IDS) {
    const style = STYLES[id];
    const mood = MOODS[0]!;
    const piece = planPiece(style, 42, mood, 12, 150);
    const again = planPiece(style, 42, mood, 12, 150);
    assert.deepEqual(again, piece, `${id}: planning is deterministic`);
    const themes = piece.form.map((k, i) => (k === 'theme' ? i : -1)).filter((i) => i >= 0);
    assert.ok(themes.length >= 1, `${id}: a piece has a theme`);
    const tune = (i: number): string =>
      JSON.stringify(composePhrase(piece, i, mood).events.filter((e) => e.role === 'lead').map((e) => [e.time, e.pitch]));
    for (const i of themes.slice(1)) assert.equal(tune(i), tune(themes[0]!), `${id}: the theme at phrase ${i} is the theme`);
    assert.deepEqual(composePhrase(piece, 1, mood), composePhrase(again, 1, mood), `${id}: composing is deterministic`);
    const other = planPiece(style, 43, mood, 12, 150);
    if (!style.gamelan) assert.notEqual(tune(themes[0]!), JSON.stringify(composePhrase(other, themes[0]!, mood).events.filter((e) => e.role === 'lead').map((e) => [e.time, e.pitch])), `${id}: another seed is another tune`);
  }
});

test('a piece lasts about what it was asked for', () => {
  for (const id of STYLE_IDS) {
    const piece = planPiece(STYLES[id], 3, MOODS[0]!, 12, 120);
    const seconds = wholePiece(piece, MOODS[0]!).reduce((sum, p) => sum + p.beats, 0) * (60 / piece.bpm);
    assert.ok(seconds > 40 && seconds < 260, `${id}: ${seconds.toFixed(0)} s`);
  }
});

/**
 * The engine's budget, replayed: how long each note holds a voice (its
 * written length plus the instrument's ring, a rendered one no longer than
 * its buffer, a wind or a pad its release), and what the engine would drop.
 */
test('the voices a piece asks for fit the budget', () => {
  const report: string[] = [];
  const failures: string[] = [];
  for (const id of STYLE_IDS) {
    const style = STYLES[id];
    let worst = 0;
    let dropped = 0;
    let tuneDropped = 0;
    let total = 0;
    for (const mood of MOODS) {
      const piece = planPiece(style, 11, mood, 12, 150);
      const spb = 60 / piece.bpm;
      let offset = 0;
      const ends: number[] = [];
      for (const phrase of wholePiece(piece, mood)) {
        for (const e of phrase.events) {
          const start = offset + e.time * spb;
          const sound = INSTRUMENTS[e.instrument].sound;
          const written = e.length * spb;
          const hold =
            sound.kind === 'wind' || sound.kind === 'pad'
              ? Math.max(written, sound.attack) + sound.release
              : e.tremolo
                ? written
                : Math.min(sound.length, written + ringOf(e));
          for (let i = ends.length - 1; i >= 0; i--) if (ends[i]! <= start) ends.splice(i, 1);
          const support = e.role === 'accomp' || e.role === 'pad' || e.role === 'drone';
          total++;
          if (ends.length >= (support ? 10 : 12)) {
            dropped++;
            if (e.role === 'lead' || e.role === 'answer') tuneDropped++;
            continue;
          }
          ends.push(start + hold);
          worst = Math.max(worst, ends.length);
        }
        offset += phrase.beats * spb;
      }
    }
    report.push(`${id.padEnd(15)} peak ${String(worst).padStart(2)}  dropped ${((dropped / total) * 100).toFixed(1).padStart(4)}%  tune ${tuneDropped}`);
    failures.push(...(dropped / total < 0.05 ? [] : [`${id}: ${((dropped / total) * 100).toFixed(1)}% of notes over the budget`]));
    failures.push(...(tuneDropped / total < 0.01 ? [] : [`${id}: the tune loses ${tuneDropped} notes to the budget`]));
  }
  console.log(report.join('\n'));
  assert.deepEqual(failures, []);
});

test('where you are is the style the towns are built in', () => {
  const cases: [string, string, number, string][] = [
    ['ESP', 'Europe', 40, 'iberia'],
    ['PRT', 'Europe', 39, 'iberia'],
    ['ITA', 'Europe', 42, 'mediterranean'],
    ['FRA', 'Europe', 46, 'atlantic-folk'],
    ['NOR', 'Europe', 60, 'nordic'],
    ['RUS', 'Europe', 55, 'east-europe'],
    ['EGY', 'Africa', 27, 'maghreb'],
    ['IRN', 'Asia', 32, 'middle-east'],
    ['NGA', 'Africa', 9, 'sub-saharan'],
    ['IND', 'Asia', 22, 'south-asia'],
    ['CHN', 'Asia', 35, 'east-asia'],
    ['JPN', 'Asia', 36, 'japan'],
    ['IDN', 'Asia', -6, 'southeast-asia'],
    ['USA', 'North America', 40, 'north-america'],
    ['MEX', 'North America', 20, 'latin'],
    ['BRA', 'South America', -15, 'brazil'],
    ['PER', 'South America', -12, 'andes'],
    ['AUS', 'Oceania', -25, 'oceania'],
    ['GRL', 'North America', 72, 'polar'],
    ['NOR', 'Europe', 70, 'polar'],
  ];
  for (const [iso, continent, lat, want] of cases) assert.equal(styleForCountry(iso, continent, lat), want, iso);
  for (const iso of Object.keys(ISO_REGIONS)) assert.ok(STYLE_IDS.includes(styleForCountry(iso, '', 10)), iso);
  const base = { iso: 'ESP', continent: 'Europe', lat: 40, lon: -3, aloft: false } as const;
  assert.equal(styleAt({ ...base, mode: 'menu' }), null);
  assert.equal(styleAt({ ...base, mode: 'foot' }), 'iberia');
  assert.equal(styleAt({ ...base, mode: 'plane', aloft: true }), 'sky');
  assert.equal(styleAt({ ...base, mode: 'plane' }), 'iberia');
  assert.equal(styleAt({ ...base, mode: 'boat' }), 'sea');
  assert.equal(styleAt({ ...base, mode: 'swim', iso: '' }), 'sea');
  assert.equal(styleAt({ ...base, mode: 'foot', iso: '', lat: 35, lon: 139 }), 'east-asia');
});

test('a chord bends the scale by its own chromatic tones', () => {
  // E7 in A minor: G becomes G sharp, and nothing else moves.
  assert.deepEqual(scaleOver([0, 2, 3, 5, 7, 8, 10], { root: 7, tones: [7, 11, 2, 5] }), [0, 2, 3, 5, 7, 8, 11]);
  // D7 in F major: F becomes F sharp, G stays.
  assert.deepEqual(scaleOver([0, 2, 4, 5, 7, 9, 11], { root: 9, tones: [9, 1, 4, 7] }), [1, 2, 4, 5, 7, 9, 11]);
  // G major in E Phrygian dominant: G sharp becomes G.
  assert.deepEqual(scaleOver([0, 1, 4, 5, 7, 8, 10], { root: 3, tones: [3, 7, 10] }), [0, 1, 3, 5, 7, 8, 10]);
});

/** The period of a signal near `expected` samples, by autocorrelation with a parabolic peak. */
function periodOf(data: Float32Array, from: number, span: number, expected: number): number {
  const lo = Math.floor(expected * 0.8);
  const hi = Math.ceil(expected * 1.25);
  const score: number[] = [];
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    let sum = 0;
    for (let i = from; i < from + span; i++) sum += data[i]! * data[i + lag]!;
    score.push(sum);
  }
  let best = 1;
  for (let i = 1; i < score.length - 1; i++) if (score[i]! > score[best]!) best = i;
  const a = score[best - 1]!;
  const b = score[best]!;
  const c = score[best + 1]!;
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return lo - 1 + best + (Number.isFinite(shift) ? shift : 0);
}

test('a plucked string sounds at its pitch', () => {
  const plucks = (Object.keys(INSTRUMENTS) as InstrumentId[]).filter((id) => INSTRUMENTS[id].sound.kind === 'pluck');
  let worst = 0;
  const off: string[] = [];
  for (const id of plucks) {
    const spec = INSTRUMENTS[id].sound as PluckSpec;
    // The buzzing bridges are held to their instruments' own range: the clipped
    // loop drifts sharp above it.
    for (const midi of spec.buzz > 0 ? [40, 52, 60, 69, 76, 86] : [40, 52, 60, 69, 76, 84, 91]) {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const data = renderPluck({ ...spec, length: Math.max(0.5, Math.min(spec.length, 0.6)) }, f, RENDER_RATE);
      const expected = RENDER_RATE / f;
      const from = Math.floor(RENDER_RATE * 0.12);
      const period = periodOf(data, from, Math.floor(RENDER_RATE * 0.15), expected);
      const cents = 1200 * Math.log2(expected / period);
      worst = Math.max(worst, Math.abs(cents));
      if (Math.abs(cents) >= 12) off.push(`${id} at MIDI ${midi}: ${cents.toFixed(1)} cents off`);
    }
  }
  console.log(`plucked strings: worst ${worst.toFixed(1)} cents off pitch`);
  assert.deepEqual(off, []);
});

test('every render is finite, normalised and ends in silence', () => {
  for (const id of Object.keys(INSTRUMENTS) as InstrumentId[]) {
    if (!isRendered(id)) continue;
    const spec = INSTRUMENTS[id].sound as RenderSpec;
    const rate = spec.kind === 'drum' ? 32000 : RENDER_RATE;
    for (const midi of spec.kind === 'drum' ? [60] : [38, 62, 88]) {
      const data = render(spec, 440 * Math.pow(2, (midi - 69) / 12), rate, 3);
      let peak = 0;
      for (const v of data) {
        assert.ok(Number.isFinite(v), `${id}: a sample is not a number`);
        peak = Math.max(peak, Math.abs(v));
      }
      assert.ok(peak > 0.8 && peak <= 0.91, `${id} at ${midi}: peak ${peak}`);
      assert.ok(Math.abs(data[data.length - 1]!) < 1e-3, `${id}: ends with a click`);
      assert.deepEqual(render(spec, 440 * Math.pow(2, (midi - 69) / 12), rate, 3), data, `${id}: a render is deterministic`);
    }
  }
  const [left, right] = renderImpulse(2.6, 48000);
  assert.equal(left.length, right.length);
  for (const v of left) assert.ok(Number.isFinite(v));
  assert.notDeepEqual(left.slice(1000, 1100), right.slice(1000, 1100), 'the room is stereo');
});

test('every style can be forced for review by its id', () => {
  const byStyle = new Map<string, Style>(Object.entries(STYLES));
  for (const id of STYLE_IDS) assert.ok(byStyle.has(id));
  assert.equal(STYLE_IDS.length, 20);
});
