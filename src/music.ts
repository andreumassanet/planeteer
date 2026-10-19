/**
 * The music: a piece in the style of wherever you are, now and then.
 *
 * A piece plays for one to three minutes (an intro with no tune, the theme, its
 * variation, a contrast, the theme again, an outro onto the tonic) and then
 * there is a minute or two of silence before the next. Crossing into a new
 * country shortens the silence: a few seconds in, the new country's tune.
 *
 * The style is the town's region (`music-score.ts` asks `scenery/regions.ts`'s
 * `regionFor`), held for a few seconds before it counts so walking a frontier
 * does not flip the band. A change while a piece plays is a crossfade: the old
 * bus fades over four seconds while the new one comes in over three. Climbing
 * past `SKY_UP` units changes the style to the air's own; the boat to the sea's.
 * The moment sets the arrangement, not the style: in a town the drums play and
 * the parts are fuller; in open country the street drums are silent and weak
 * strokes thin out; at night everything slows and softens.
 *
 * Over the style, the atmosphere (`music-score/atmosphere.ts`): night, rain,
 * a storm or snow, from the sky's daylight and the weather where you stand,
 * held a few seconds like the style. It bends the piece (tempo, density) and
 * plays a quiet layer of its own on a bus of its own, a bar at a time on the
 * piece's own beat and chord, and on alone between pieces; a change of
 * atmosphere crossfades the old layer out and the new one in.
 *
 * The scheduler is the lookahead one (Chris Wilson's "A Tale of Two Clocks"):
 * every frame, whatever falls in the next quarter second is handed to Web Audio
 * at its exact `currentTime`, so a slow frame cannot make it stagger. A phrase
 * is composed when the last is about to end, and a frame that starts no note
 * allocates nothing.
 *
 * At most `MAX_VOICES` sound at once, the accompaniment giving way first; every
 * note is a buffer source or a handful of oscillators that stops itself and is
 * disconnected on `ended`. Plucked and struck notes are rendered once by
 * `music-synth.ts` and kept in a small cache.
 *
 * The music bypasses the effects' master and joins the soundscape at its final
 * compressor, so its volume is independent. This module is imported only after
 * the gesture that opens the sound, so none of it is in the first load.
 */
import { ATMOSPHERE, HOME, STYLES, STYLE_IDS, atmosphereBar, barsOf, composePhrase, moodOf, planPiece, scaleAt, styleAt } from './music-score.ts';
import type { Atmosphere, Chord, Mood, NoteEvent, StyleId, WeatherCue, Whereabouts } from './music-score.ts';
import { seedOf } from './scenery/random.ts';
import { createChain } from './music/chain.ts';
import { HOLD, LOOKAHEAD, MUSIC_LEVEL, SKY_DOWN, SKY_UP } from './music/constants.ts';
import type { Bus, Playing, Tremolo } from './music/types.ts';
import { between, hold } from './music/util.ts';
import { createVoices } from './music/voices.ts';
import type { Counters } from './music/voices.ts';

/** What the loop tells the music twice a second. */
export interface MusicMoment {
  mode: Whereabouts['mode'];
  /** The eye's height over the ground, in units. */
  height: number;
  /** The country under you, `''` over water. */
  iso: string;
  continent: string;
  lat: number;
  lon: number;
  /** `sky.state.daylight`. */
  daylight: number;
  /** On a town's paving. */
  town: boolean;
  /** The nearest place's index, which seeds the pieces. */
  place: number;
  /** The local hour, 0 to 24: a raga keeps to its time of day. */
  hour: number;
  /**
   * A world that is not Earth names its own style, having no countries to read
   * one from. Earth leaves it out and the map decides.
   */
  style?: StyleId;
  /** The weather where you stand, as the music hears it; clear when left out. */
  weather?: WeatherCue;
}

/** The atmosphere's layer: its bus, and the bar being played. */
interface Layer {
  atmosphere: Atmosphere;
  bus: Bus;
  seed: number;
  bar: number;
  /** Context time the bar started, seconds a beat, beats in it. */
  start: number;
  spb: number;
  beats: number;
  events: NoteEvent[];
  cursor: number;
}

/** The layer's bus at full, under the piece's. */
const LAYER_LEVEL = 0.85;
/** Seconds the old atmosphere fades over, and the new one comes in over. */
const LAYER_OUT = 5;
const LAYER_IN = 4;

export interface MusicStats {
  style: StyleId | null;
  name: string | null;
  forced: boolean;
  state: 'off' | 'playing' | 'resting' | 'waiting';
  phrase: string | null;
  bpm: number | null;
  mood: Mood;
  /** The atmosphere whose layer is sounding, or null. */
  layer: Atmosphere | null;
  voices: number;
  dropped: number;
  buffers: number;
  /** Seconds to the end of the piece, or to the next one. */
  nextChange: number | null;
}

export interface Music {
  /** Twice a second: where you are and what you are doing. */
  observe(moment: MusicMoment): void;
  /** Every frame: hands the next quarter second of notes to the audio thread. */
  update(): void;
  /** Force a style for review, or `play()` to hand it back to the map. Returns what it did. */
  play(style?: string | null): string;
  /** 0 to 1, linear; the slider that sets it is logarithmic. */
  volume: number;
  on: boolean;
  readonly stats: MusicStats;
}


export function createMusic(context: AudioContext, output: AudioNode, settings: { volume: number; on: boolean }): Music {
  const ctx = context;
  let volume = settings.volume;
  let on = settings.on;
  const chain = createChain(ctx, output, volume, on);
  const { level } = chain;
  const counters: Counters = { voices: 0, dropped: 0, strike: 0 };
  let styleId: StyleId | null = null;
  let pending: StyleId | null = null;
  let pendingSince = 0;
  let forced: StyleId | null = null;
  let aloft = false;
  let mood: Mood = { energy: 0.45, drums: false, night: false, atmosphere: 'clear' };
  let atmosphere: Atmosphere = 'clear';
  let pendingAtmosphere: Atmosphere = 'clear';
  let pendingAtmosphereSince = 0;
  let layer: Layer | null = null;
  let layers = 0;
  let town = false;
  let place = 0;
  let hour = 12;
  let current: Playing | null = null;
  const fading: { bus: Bus; until: number }[] = [];
  /** When the next piece may start; negative until the first moment arrives. */
  let restUntil = -1;
  let endedAt = -Infinity;
  let pieces = 0;
  const where: Whereabouts = { mode: 'foot', aloft: false, iso: '', continent: '', lat: 0, lon: 0 };
  const tremolos: Tremolo[] = [];
  for (let i = 0; i < 4; i++) {
    tremolos.push({ active: false, bus: null, instrument: 'mandolin', role: 'lead', pitch: 0, velocity: 0, next: 0, end: 0, count: 0 });
  }

  const voices = createVoices(ctx, chain, counters, tremolos);
  const { makeBus, dropBus, fire, strikeTremolos } = voices;

  function fadeBus(bus: Bus, now: number, seconds: number): void {
    const g = bus.gain.gain;
    hold(g, now);
    g.setTargetAtTime(0, now, seconds / 3);
    fading.push({ bus, until: now + seconds + 4 });
    for (const t of tremolos) if (t.bus === bus) t.active = false;
  }

  function fadeOut(playing: Playing, now: number, seconds: number): void {
    fadeBus(playing.bus, now, seconds);
  }

  /**
   * The layer's next bar, starting at `from` or after it: on the piece's own
   * bar line and over its chord while one plays, on the tonic at the
   * atmosphere's own tempo between pieces.
   */
  function layerBar(l: Layer, from: number): void {
    const p = current;
    let style = STYLES[styleId ?? 'sky'];
    let scale = scaleAt(style, hour);
    let chord: Chord = HOME;
    if (p !== null) {
      style = p.piece.style;
      scale = p.piece.scale;
      const barSeconds = style.beats * p.spb;
      const k = Math.max(0, Math.ceil((from - p.start) / barSeconds - 1e-6));
      chord = barsOf(p.piece, p.phrase.kind)[k] ?? p.piece.main[0] ?? HOME;
      l.start = p.start + k * barSeconds;
      l.spb = p.spb;
    } else {
      l.start = from;
      l.spb = 60 / ATMOSPHERE[l.atmosphere].restBpm;
    }
    l.beats = style.beats;
    l.events = atmosphereBar(l.atmosphere, style, scale, chord, style.beats, l.seed, l.bar++);
    l.cursor = 0;
  }

  function startLayer(now: number): void {
    const bus = makeBus(0.45);
    const g = bus.gain.gain;
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(LAYER_LEVEL, now + LAYER_IN);
    layer = { atmosphere, bus, seed: seedOf('atmosphere', place, layers++), bar: 0, start: now, spb: 1, beats: 4, events: [], cursor: 0 };
    layerBar(layer, now + 0.1);
  }

  function stopLayer(now: number, seconds: number): void {
    if (layer === null) return;
    fadeBus(layer.bus, now, seconds);
    layer = null;
  }

  /** The layer's notes due in the lookahead. */
  function stepLayer(now: number, horizon: number): void {
    if (layer === null && atmosphere !== 'clear') startLayer(now);
    const l = layer;
    if (l === null) return;
    for (;;) {
      if (l.cursor < l.events.length) {
        const e = l.events[l.cursor]!;
        const t = l.start + e.time * l.spb;
        if (t > horizon) break;
        l.cursor++;
        if (t < now - 0.05) continue;
        fire(e, Math.max(now, t), l);
        continue;
      }
      const end = l.start + l.beats * l.spb;
      if (end > horizon) break;
      layerBar(l, Math.max(end, now));
    }
  }

  function start(when: number, fadeIn: number): void {
    if (styleId === null) return;
    const style = STYLES[styleId];
    const seconds = town ? between(90, 180) : between(60, 130);
    const seed = seedOf(place, Math.floor(Date.now() / 600000), pieces++);
    const piece = planPiece(style, seed, mood, hour, seconds);
    const bus = makeBus(style.reverb);
    const g = bus.gain.gain;
    g.setValueAtTime(0, ctx.currentTime);
    g.setValueAtTime(0, when);
    g.linearRampToValueAtTime(1, when + fadeIn);
    current = { piece, bus, index: 0, phrase: composePhrase(piece, 0, mood), start: when, cursor: 0, spb: 60 / piece.bpm };
  }

  /** The piece has played its outro: let it ring, and rest. */
  function finish(playing: Playing, end: number): void {
    fading.push({ bus: playing.bus, until: end + 8 });
    current = null;
    endedAt = end;
    const open = styleId === 'sky' || styleId === 'sea';
    restUntil = end + (open ? between(50, 120) : town ? between(35, 90) : between(60, 150));
  }

  function switchTo(next: StyleId | null, now: number): void {
    styleId = next;
    if (current !== null) {
      fadeOut(current, now, next === null ? 2 : 4);
      current = null;
      if (next !== null) start(now + 1.2, 3);
      return;
    }
    // Resting: a new country is worth a tune, unless one has only just ended.
    if (next !== null && now - endedAt > 15 && restUntil - now > 6) restUntil = now + between(2.5, 5);
  }

  function setLevel(): void {
    const g = level.gain;
    hold(g, ctx.currentTime);
    g.setTargetAtTime(on ? volume * MUSIC_LEVEL : 0, ctx.currentTime, 0.1);
  }

  const music: Music = {
    observe(moment) {
      const now = ctx.currentTime;
      if (moment.mode === 'plane' || moment.mode === 'balloon') {
        if (!aloft && moment.height > SKY_UP) aloft = true;
        else if (aloft && moment.height < SKY_DOWN) aloft = false;
      } else aloft = false;
      where.mode = moment.mode;
      where.aloft = aloft;
      where.iso = moment.iso;
      where.continent = moment.continent;
      where.lat = moment.lat;
      where.lon = moment.lon;
      const wanted = forced ?? (moment.style !== undefined && !aloft ? moment.style : styleAt(where));
      if (wanted !== pending) {
        pending = wanted;
        pendingSince = now;
      }
      town = moment.town;
      place = moment.place;
      hour = Number.isFinite(moment.hour) ? moment.hour : 12;
      const switching = pending !== styleId && (styleId === null || now - pendingSince >= HOLD);
      // The mood first, so a piece started by the switch is arranged for the moment it starts in.
      mood = moodOf((switching ? pending : styleId) ?? 'sky', town, moment.daylight, moment.weather ?? 'clear');
      // The atmosphere holds a few seconds too, so weather on the edge of a bank does not flap.
      if (mood.atmosphere !== pendingAtmosphere) {
        pendingAtmosphere = mood.atmosphere;
        pendingAtmosphereSince = now;
      }
      if (pendingAtmosphere !== atmosphere && now - pendingAtmosphereSince >= HOLD) {
        atmosphere = pendingAtmosphere;
        if (layer !== null && layer.atmosphere !== atmosphere) stopLayer(now, LAYER_OUT);
      }
      if (switching) switchTo(pending, now);
      // The first piece a little after the world starts, not on the click that started it.
      if (restUntil < 0) restUntil = now + between(8, 16);
    },

    update() {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      for (let i = fading.length - 1; i >= 0; i--) {
        if (now <= fading[i]!.until) continue;
        dropBus(fading[i]!.bus);
        fading[i] = fading[fading.length - 1]!;
        fading.pop();
      }
      const horizon = now + LOOKAHEAD;
      strikeTremolos(now, horizon);
      if (!on) {
        if (current !== null) {
          fadeOut(current, now, 1.5);
          current = null;
        }
        stopLayer(now, 1.5);
        return;
      }
      if (current === null) {
        if (styleId !== null && restUntil >= 0 && now >= restUntil) start(now + 0.1, 1.5);
        if (restUntil >= 0) stepLayer(now, horizon);
        return;
      }
      const playing: Playing = current;
      for (;;) {
        const events = playing.phrase.events;
        if (playing.cursor < events.length) {
          const e = events[playing.cursor]!;
          const t = playing.start + e.time * playing.spb;
          if (t > horizon) break;
          playing.cursor++;
          // A note the clock has passed (the tab was away) is skipped, not crammed in.
          if (t < now - 0.05) continue;
          const jitter = (Math.random() - 0.5) * (e.role === 'drums' ? 0.006 : 0.014);
          fire(e, Math.max(now, t + jitter), playing);
          continue;
        }
        const end = playing.start + playing.phrase.beats * playing.spb;
        if (end > horizon) break;
        playing.index++;
        if (playing.index >= playing.piece.form.length) {
          finish(playing, end);
          break;
        }
        playing.phrase = composePhrase(playing.piece, playing.index, mood);
        playing.start = end;
        playing.cursor = 0;
      }
      stepLayer(now, horizon);
    },

    play(id) {
      const now = ctx.currentTime;
      if (id === undefined || id === null || id === 'auto') {
        forced = null;
        return 'Back to the map: the style follows where you are.';
      }
      if (!(id in STYLES)) return `No style "${id}". One of: ${STYLE_IDS.join(', ')}.`;
      const style = id as StyleId;
      forced = style;
      pending = style;
      if (current !== null) switchTo(style, now);
      else {
        styleId = style;
        restUntil = now;
      }
      const note = on ? '' : ' Music is off in Settings, so nothing sounds until it is on.';
      return `${STYLES[style].name} (${style}); atlas.music.play() hands it back to the map.${note}`;
    },

    get volume() {
      return volume;
    },
    set volume(value: number) {
      volume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.6));
      setLevel();
    },
    get on() {
      return on;
    },
    set on(value: boolean) {
      if (value && !on) restUntil = ctx.currentTime + 3;
      on = value;
      setLevel();
    },

    get stats() {
      const now = ctx.currentTime;
      const p = current;
      return {
        style: styleId,
        name: styleId === null ? null : STYLES[styleId].name,
        forced: forced !== null,
        state: (!on ? 'off' : p !== null ? 'playing' : restUntil < 0 ? 'waiting' : 'resting') as MusicStats['state'],
        phrase: p === null ? null : `${p.index + 1}/${p.piece.form.length} ${p.phrase.kind}`,
        bpm: p === null ? null : p.piece.bpm,
        mood: { ...mood },
        layer: layer === null ? null : layer.atmosphere,
        voices: counters.voices,
        dropped: counters.dropped,
        buffers: voices.buffers.size,
        nextChange:
          p !== null
            ? Math.round((p.piece.form.length - p.index) * p.phrase.beats * p.spb - (now - p.start))
            : restUntil < 0 ? null : Math.max(0, Math.round(restUntil - now)),
      };
    },
  };
  return music;
}
