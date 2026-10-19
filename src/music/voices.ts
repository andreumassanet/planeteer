/** Making sound: buses, rendered samples, winds, pads and the re-struck notes. */
import { INSTRUMENTS, ringOf } from '../music-score.ts';
import type { InstrumentId, NoteEvent, PadSpec, Role, WindSpec } from '../music-score.ts';
import { render } from '../music-synth.ts';
import type { RenderSpec } from '../music-synth.ts';
import { seedOf } from '../scenery/random.ts';
import type { Chain } from './chain.ts';
import { DRUM_RATE, MAX_BUFFERS, MAX_VOICES, PAN, RENDER_RATE, ROLES, SUPPORT_VOICES, TREMOLO_RATE } from './constants.ts';
import type { Bus, Playing, Tremolo } from './types.ts';
import { frequencyOf } from './util.ts';

/** Counters shared with the engine: voices sounding, notes dropped, drum strikes. */
export interface Counters {
  voices: number;
  dropped: number;
  strike: number;
}

export function createVoices(ctx: AudioContext, chain: Chain, counters: Counters, tremolos: Tremolo[]) {
  const { squeeze, room, lfo, breath } = chain;
  const buffers = new Map<string, AudioBuffer>();

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
    const variant = spec.sound.kind === 'drum' ? counters.strike++ & 1 : 0;
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
    counters.voices++;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      counters.voices--;
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
    counters.voices++;
    tone.onended = () => {
      lfo.disconnect(vibrato);
      for (const node of [vibrato, tone, edge, edgeGain, air, band, airGain, envelope]) node.disconnect();
      counters.voices--;
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
    counters.voices++;
    a.onended = () => {
      for (const node of [a, b, bGain, filter, envelope]) node.disconnect();
      c?.disconnect();
      cGain?.disconnect();
      counters.voices--;
    };
  }

  function fire(e: NoteEvent, when: number, playing: Pick<Playing, 'bus' | 'spb'>): void {
    const support = e.role === 'accomp' || e.role === 'pad' || e.role === 'drone' || e.role === 'mood';
    if (counters.voices >= (support ? SUPPORT_VOICES : MAX_VOICES)) {
      counters.dropped++;
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
      // Strikes the clock has already passed (a long frame, a throttled window) are
      // skipped, not all started at once.
      if (t.next < now) t.next = now;
      while (t.next < horizon && t.next < t.end) {
        if (counters.voices < MAX_VOICES) {
          const accent = t.count % 2 === 0 ? 0.9 : 0.72;
          sample(t.instrument, t.pitch, t.next, 1 / TREMOLO_RATE, t.velocity * accent, t.bus.roles[t.role], 0, 0, 0.03);
        }
        t.count++;
        t.next += 1 / TREMOLO_RATE;
      }
      if (t.next >= t.end) t.active = false;
    }
  }

  return { buffers, makeBus, dropBus, fire, strikeTremolos };
}
