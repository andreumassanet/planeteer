/**
 * The music: a piece in the style of wherever you are, now and then.
 *
 * **It comes and goes.** A piece plays for one to three minutes — an intro
 * with no tune, the theme, its variation, a contrast, the theme again, an
 * outro onto the tonic — and then there is silence for a minute or two, the
 * wind and the footsteps, before the next. Music that never stops is
 * wallpaper within ten minutes; music that arrives is an event. Crossing into
 * a new country is the one thing that shortens the silence: the frontier's
 * jingle, and a few seconds later the new country's tune.
 *
 * **Where you are is the town's region** (`music-score.ts` asks
 * `scenery/regions.ts`'s `regionFor`), held for a few seconds before it
 * counts, so walking a frontier does not flip the band. A change while a
 * piece plays is a crossfade: the old piece's bus fades over four seconds
 * while the new one comes in over three. Taking the plane up past
 * `SKY_UP` units changes the style to the air's own; the boat to the sea's.
 *
 * **The moment sets the arrangement, not the style**: in a town the drums
 * play and the parts are fuller; in open country the drums that keep to
 * streets are silent and the weak strokes thin out; at night everything
 * slows a little and softens.
 *
 * **The scheduler is the lookahead one** (Chris Wilson's *A Tale of Two
 * Clocks*): every frame, whatever falls in the next quarter second is handed
 * to Web Audio at its exact `currentTime`, so the timing is the audio
 * thread's and a slow frame cannot make it stagger. A phrase is composed when
 * the last one is about to end — once every ten seconds or so — and nothing
 * is allocated in a frame that starts no note.
 *
 * **Voices are few and die when they end.** At most `MAX_VOICES` sound at
 * once, the accompaniment giving way first; every note is a buffer source
 * or a handful of oscillators that stops itself and is disconnected on
 * `ended`. The plucked and struck notes are rendered once by
 * `music-synth.ts` and kept in a small cache.
 *
 * **Its own volume, under the world.** The music bypasses the effects' master
 * and joins the soundscape at its final compressor, so its slider and the
 * effects' are independent, and it ducks under the landmark jingle.
 *
 * This module and its two siblings are imported only after the gesture that
 * opens the sound, so none of it is in the world's first load.
 */
import { INSTRUMENTS, STYLES, STYLE_IDS, composePhrase, moodOf, planPiece, ringOf, styleAt } from './music-score.ts';
import type { Mood, NoteEvent, Phrase, Piece, Role, StyleId, Whereabouts, PadSpec, WindSpec, InstrumentId } from './music-score.ts';
import { render, renderImpulse } from './music-synth.ts';
import type { RenderSpec } from './music-synth.ts';
import { seedOf } from './scenery/random.ts';

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
}

export interface MusicStats {
  style: StyleId | null;
  name: string | null;
  forced: boolean;
  state: 'off' | 'playing' | 'resting' | 'waiting';
  phrase: string | null;
  bpm: number | null;
  mood: Mood;
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
  /** A cue from the soundscape: the music ducks under a jingle. */
  cue(name: string): void;
  /** Force a style for review, or `play()` to hand it back to the map. Returns what it did. */
  play(style?: string | null): string;
  /** 0 to 1, linear; the slider that sets it is logarithmic. */
  volume: number;
  on: boolean;
  readonly stats: MusicStats;
}

/** The music's level under the world at a volume of 1. */
const MUSIC_LEVEL = 0.26;
/** Seconds of notes handed to the audio thread ahead of the clock. */
const LOOKAHEAD = 0.25;
const MAX_VOICES = 12;
/** The accompaniment, the pads and the drone give way above this. */
const SUPPORT_VOICES = 10;
/** Seconds a new style has to hold before it counts: a frontier walked along is not two countries. */
const HOLD = 4;
/** The air's music above this height, units over the ground, and back below the second. */
const SKY_UP = 300;
const SKY_DOWN = 150;
/** Sample rates for the rendered notes: strings and bars are dark enough for 24 kHz; the drums' noise wants more. */
const RENDER_RATE = 24000;
const DRUM_RATE = 32000;
/** Rendered notes kept, least recently used dropped: about 12 MB at most. */
const MAX_BUFFERS = 64;
/** The mandolin's and the balalaika's re-strike rate, a second. */
const TREMOLO_RATE = 11;

const PAN: Record<Role, number> = { lead: 0.08, answer: -0.14, accomp: -0.28, bass: 0, pad: 0, drone: 0.16, drums: 0.12 };
const ROLES = Object.keys(PAN) as Role[];

const between = (a: number, b: number): number => a + Math.random() * (b - a);
const frequencyOf = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

interface Bus {
  gain: GainNode;
  send: GainNode;
  roles: Record<Role, StereoPannerNode>;
}

interface Playing {
  piece: Piece;
  bus: Bus;
  index: number;
  phrase: Phrase;
  /** Context time the phrase started. */
  start: number;
  cursor: number;
  /** Seconds a beat. */
  spb: number;
}

/** A note being re-struck, one slot each, reused. */
interface Tremolo {
  active: boolean;
  bus: Bus | null;
  instrument: InstrumentId;
  role: Role;
  pitch: number;
  velocity: number;
  next: number;
  end: number;
  count: number;
}

function hold(param: AudioParam, at: number): void {
  // Freeze a ramp where it is before a new one starts: `cancelScheduledValues`
  // alone snaps back to the last set value, which is a click.
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
  else {
    const value = param.value;
    param.cancelScheduledValues(at);
    param.setValueAtTime(value, at);
  }
}

export function createMusic(context: AudioContext, output: AudioNode, settings: { volume: number; on: boolean }): Music {
  const ctx = context;
  let volume = settings.volume;
  let on = settings.on;

  // The chain: every piece's bus -> compressor -> duck -> level -> the soundscape's limiter.
  const squeeze = ctx.createDynamicsCompressor();
  squeeze.threshold.value = -20;
  squeeze.knee.value = 12;
  squeeze.ratio.value = 3;
  squeeze.attack.value = 0.015;
  squeeze.release.value = 0.3;
  const duck = ctx.createGain();
  const level = ctx.createGain();
  level.gain.value = on ? volume * MUSIC_LEVEL : 0;
  squeeze.connect(duck).connect(level).connect(output);

  // A room of generated noise, shared by every piece; each piece sends to it at its style's depth.
  const room = ctx.createConvolver();
  room.normalize = false;
  {
    const [left, right] = renderImpulse(2.6, ctx.sampleRate);
    const impulse = ctx.createBuffer(2, left.length, ctx.sampleRate);
    impulse.copyToChannel(left, 0);
    impulse.copyToChannel(right, 1);
    room.buffer = impulse;
  }
  room.connect(squeeze);

  // One vibrato for every wind, and one second of breath they all read from.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  lfo.start();
  const breath = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  {
    const data = breath.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  const buffers = new Map<string, AudioBuffer>();
  let voices = 0;
  let dropped = 0;
  let strike = 0;

  let styleId: StyleId | null = null;
  let pending: StyleId | null = null;
  let pendingSince = 0;
  let forced: StyleId | null = null;
  let aloft = false;
  let mood: Mood = { energy: 0.45, drums: false, night: false };
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

  function makeBus(reverb: number): Bus {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(squeeze);
    const send = ctx.createGain();
    send.gain.value = reverb;
    gain.connect(send).connect(room);
    const roles = {} as Record<Role, StereoPannerNode>;
    for (const role of ROLES) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = PAN[role];
      panner.connect(gain);
      roles[role] = panner;
    }
    return { gain, send, roles };
  }

  function dropBus(bus: Bus): void {
    for (const role of ROLES) bus.roles[role].disconnect();
    bus.gain.disconnect();
    bus.send.disconnect();
    for (const t of tremolos) if (t.bus === bus) t.active = false;
  }

  function bufferFor(instrument: InstrumentId, pitch: number, variant: number): AudioBuffer {
    const key = `${instrument}:${pitch.toFixed(2)}:${variant}`;
    const hit = buffers.get(key);
    if (hit !== undefined) {
      buffers.delete(key);
      buffers.set(key, hit);
      return hit;
    }
    const sound = INSTRUMENTS[instrument].sound as RenderSpec;
    const rate = sound.kind === 'drum' ? DRUM_RATE : RENDER_RATE;
    const data = render(sound, frequencyOf(pitch === 0 ? 60 : pitch), rate, seedOf(instrument, variant));
    const buffer = ctx.createBuffer(1, data.length, rate);
    buffer.copyToChannel(data, 0);
    buffers.set(key, buffer);
    if (buffers.size > MAX_BUFFERS) buffers.delete(buffers.keys().next().value!);
    return buffer;
  }

  /** A rendered note: one buffer source, one gain, damped `ring` seconds after its written length. */
  function sample(instrument: InstrumentId, pitch: number, when: number, seconds: number, velocity: number, out: AudioNode, glide: number, glideTime: number, ring: number): void {
    const spec = INSTRUMENTS[instrument];
    const variant = spec.sound.kind === 'drum' ? strike++ & 1 : 0;
    const buffer = bufferFor(instrument, pitch, variant);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (glide !== 0) {
      source.playbackRate.setValueAtTime(Math.pow(2, (glide - pitch) / 12), when);
      source.playbackRate.linearRampToValueAtTime(1, when + glideTime);
    }
    const gain = ctx.createGain();
    const v = velocity * spec.gain;
    const natural = when + buffer.duration;
    const end = Math.min(natural, when + seconds + ring);
    gain.gain.setValueAtTime(v, when);
    if (end < natural - 0.01) {
      gain.gain.setValueAtTime(v, Math.max(when, end - 0.06));
      gain.gain.linearRampToValueAtTime(0, end);
    }
    source.connect(gain).connect(out);
    source.start(when);
    source.stop(end + 0.01);
    voices++;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      voices--;
    };
  }

  /** A breath: a sine, its edge, and band-passed air, with a vibrato that arrives late. */
  function breathe(instrument: InstrumentId, spec: WindSpec, pitch: number, when: number, seconds: number, velocity: number, out: AudioNode, glide: number, glideTime: number): void {
    const f = frequencyOf(pitch);
    const v = velocity * INSTRUMENTS[instrument].gain;
    const tone = ctx.createOscillator();
    const edge = ctx.createOscillator();
    edge.type = 'triangle';
    if (glide !== 0) {
      tone.frequency.setValueAtTime(frequencyOf(glide), when);
      tone.frequency.exponentialRampToValueAtTime(f, when + glideTime);
      edge.frequency.setValueAtTime(frequencyOf(glide), when);
      edge.frequency.exponentialRampToValueAtTime(f, when + glideTime);
    } else {
      tone.frequency.setValueAtTime(f, when);
      edge.frequency.setValueAtTime(f, when);
    }
    const edgeGain = ctx.createGain();
    edgeGain.gain.value = spec.edge;
    const air = ctx.createBufferSource();
    air.buffer = breath;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = Math.min(9000, f * 2);
    band.Q.value = 1.4;
    const airGain = ctx.createGain();
    // The chiff: more air at the onset than once the note speaks.
    airGain.gain.setValueAtTime(spec.breath * 2.5, when);
    airGain.gain.setTargetAtTime(spec.breath, when + 0.03, 0.05);
    const vibrato = ctx.createGain();
    vibrato.gain.setValueAtTime(0, when);
    vibrato.gain.linearRampToValueAtTime(spec.vibrato, when + Math.min(0.6, Math.max(0.1, seconds * 0.6)));
    lfo.connect(vibrato);
    vibrato.connect(tone.detune);
    vibrato.connect(edge.detune);
    const envelope = ctx.createGain();
    const end = when + Math.max(seconds, spec.attack + 0.05);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(v, when + spec.attack);
    envelope.gain.setValueAtTime(v, end);
    envelope.gain.setTargetAtTime(0, end, spec.release / 3);
    tone.connect(envelope);
    edge.connect(edgeGain).connect(envelope);
    air.connect(band).connect(airGain).connect(envelope);
    envelope.connect(out);
    const stop = end + spec.release + 0.05;
    tone.start(when);
    edge.start(when);
    air.start(when, Math.random() * 0.9);
    tone.stop(stop);
    edge.stop(stop);
    air.stop(stop);
    voices++;
    tone.onended = () => {
      lfo.disconnect(vibrato);
      for (const node of [vibrato, tone, edge, edgeGain, air, band, airGain, envelope]) node.disconnect();
      voices--;
    };
  }

  /** A held chord tone: a triangle and a detuned saw under a low-pass, slow in and slower out. */
  function sustain(instrument: InstrumentId, spec: PadSpec, pitch: number, when: number, seconds: number, velocity: number, out: AudioNode): void {
    const f = frequencyOf(pitch);
    const v = velocity * INSTRUMENTS[instrument].gain;
    const a = ctx.createOscillator();
    a.type = 'triangle';
    a.frequency.value = f;
    const b = ctx.createOscillator();
    b.type = 'sawtooth';
    b.frequency.value = f;
    b.detune.value = spec.detune;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.3;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.cutoff;
    filter.Q.value = 0.7;
    const envelope = ctx.createGain();
    const end = when + Math.max(seconds, spec.attack);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(v, when + spec.attack);
    envelope.gain.setValueAtTime(v, end);
    envelope.gain.setTargetAtTime(0, end, spec.release / 3);
    a.connect(filter);
    b.connect(bGain).connect(filter);
    let c: OscillatorNode | null = null;
    let cGain: GainNode | null = null;
    if (spec.air) {
      c = ctx.createOscillator();
      c.frequency.value = f * 2;
      c.detune.value = -spec.detune;
      cGain = ctx.createGain();
      cGain.gain.value = 0.22;
      c.connect(cGain).connect(filter);
    }
    filter.connect(envelope).connect(out);
    const stop = end + spec.release + 0.05;
    a.start(when);
    b.start(when);
    c?.start(when);
    a.stop(stop);
    b.stop(stop);
    c?.stop(stop);
    voices++;
    a.onended = () => {
      for (const node of [a, b, bGain, filter, envelope]) node.disconnect();
      c?.disconnect();
      cGain?.disconnect();
      voices--;
    };
  }

  function fire(e: NoteEvent, when: number, playing: Playing): void {
    const support = e.role === 'accomp' || e.role === 'pad' || e.role === 'drone';
    if (voices >= (support ? SUPPORT_VOICES : MAX_VOICES)) {
      dropped++;
      return;
    }
    const out = playing.bus.roles[e.role];
    const seconds = e.length * playing.spb;
    const sound = INSTRUMENTS[e.instrument].sound;
    if (sound.kind === 'wind') breathe(e.instrument, sound, e.pitch, when, seconds, e.velocity, out, e.glide, e.glideTime);
    else if (sound.kind === 'pad') sustain(e.instrument, sound, e.pitch, when, seconds, e.velocity, out);
    else if (e.tremolo) {
      const slot = tremolos.find((t) => !t.active);
      if (slot === undefined) {
        sample(e.instrument, e.pitch, when, seconds, e.velocity, out, e.glide, e.glideTime, ringOf(e));
        return;
      }
      slot.active = true;
      slot.bus = playing.bus;
      slot.instrument = e.instrument;
      slot.role = e.role;
      slot.pitch = e.pitch;
      slot.velocity = e.velocity;
      slot.next = when;
      slot.end = when + seconds;
      slot.count = 0;
    } else sample(e.instrument, e.pitch, when, seconds, e.velocity, out, e.glide, e.glideTime, ringOf(e));
  }

  /** The re-strikes due in the lookahead, for every note held by tremolo. */
  function strikeTremolos(now: number, horizon: number): void {
    for (const t of tremolos) {
      if (!t.active || t.bus === null) continue;
      // Strikes the clock has already passed — a long frame, a throttled
      // window — are skipped as a missed note is, not all started at once.
      if (t.next < now) t.next = now;
      while (t.next < horizon && t.next < t.end) {
        if (voices < MAX_VOICES) {
          const accent = t.count % 2 === 0 ? 0.9 : 0.72;
          sample(t.instrument, t.pitch, t.next, 1 / TREMOLO_RATE, t.velocity * accent, t.bus.roles[t.role], 0, 0, 0.03);
        }
        t.count++;
        t.next += 1 / TREMOLO_RATE;
      }
      if (t.next >= t.end) t.active = false;
    }
  }

  function fadeOut(playing: Playing, now: number, seconds: number): void {
    const g = playing.bus.gain.gain;
    hold(g, now);
    g.setTargetAtTime(0, now, seconds / 3);
    fading.push({ bus: playing.bus, until: now + seconds + 4 });
    for (const t of tremolos) if (t.bus === playing.bus) t.active = false;
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

  function duckFor(depth: number, seconds: number): void {
    const now = ctx.currentTime;
    const g = duck.gain;
    hold(g, now);
    g.setTargetAtTime(depth, now, 0.12);
    g.setTargetAtTime(1, now + seconds, 0.8);
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
      const wanted = forced ?? styleAt(where);
      if (wanted !== pending) {
        pending = wanted;
        pendingSince = now;
      }
      town = moment.town;
      place = moment.place;
      hour = Number.isFinite(moment.hour) ? moment.hour : 12;
      const switching = pending !== styleId && (styleId === null || now - pendingSince >= HOLD);
      // The mood first, so a piece started by the switch is arranged for the moment it starts in.
      mood = moodOf((switching ? pending : styleId) ?? 'sky', town, moment.daylight);
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
        return;
      }
      if (current === null) {
        if (styleId !== null && restUntil >= 0 && now >= restUntil) start(now + 0.1, 1.5);
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
          // A note the clock has passed — the tab was away — is skipped, not crammed in.
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
    },

    cue(name) {
      if (name === 'landmark') duckFor(0.3, 4.5);
      else if (name === 'frontier') duckFor(0.6, 2.2);
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
        voices,
        dropped,
        buffers: buffers.size,
        nextChange:
          p !== null
            ? Math.round((p.piece.form.length - p.index) * p.phrase.beats * p.spb - (now - p.start))
            : restUntil < 0 ? null : Math.max(0, Math.round(restUntil - now)),
      };
    },
  };
  return music;
}
