/** The synthesis: noise, the one-voice helpers, horns, bells, birds and crickets. */
import type { Honk } from '../../server/src/limits.ts';
import { BELL_PARTIALS, BELL_PITCH } from './horn-voices.ts';
import type { HornChord } from './horn-voices.ts';
import { BIRD_LEVEL, CRICKET_LEVEL, between } from './levels.ts';
import type { Runtime } from './runtime.ts';

export function noiseBuffer(ctx: AudioContext, colour: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Paul Kellet's pink filter and a leaky integrator for brown, both normalised
  // afterwards so the levels mean the same thing for every colour.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    let v = white;
    if (colour === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
    } else if (colour === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      v = last;
    }
    data[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  // A loop's seam: fade the last 50 ms into the first so it does not click.
  const seam = Math.min(length >> 1, Math.floor(ctx.sampleRate * 0.05));
  for (let i = 0; i < seam; i++) {
    const t = i / seam;
    data[length - seam + i] = data[length - seam + i]! * (1 - t) + data[i]! * t;
  }
  const scale = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < length; i++) data[i] = data[i]! * scale;
  return buffer;
}

export function loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  // Two loops of the same buffer started together would be one loop, louder.
  source.start(0, Math.random() * buffer.duration);
  return source;
}

/** The voices that make a sound and count themselves while it lasts. */
export function createSynth(rt: Runtime) {
  /** An oscillator into `into` from `from` to `to`, counted as a voice while it sounds. */
  function tone(ctx: AudioContext, into: AudioNode, type: OscillatorType, frequency: number, from: number, to: number): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(into);
    osc.start(from);
    osc.stop(to);
    rt.voices++;
    osc.onended = () => rt.voices--;
    return osc;
  }

  /** A gain that opens to `peak` over `attack`, holds, and closes over `release` by `end`. */
  function envelope(ctx: AudioContext, at: number, peak: number, attack: number, end: number, release: number): GainNode {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + attack);
    env.gain.setValueAtTime(peak, Math.max(at + attack, end - release));
    env.gain.linearRampToValueAtTime(0, end);
    return env;
  }

  /** Soft-clip curves by drive: `tanh(drive x)`, levelled so a full swing stays a full swing. */
  const clipCurves = new Map<number, Float32Array<ArrayBuffer>>();
  function clipper(ctx: AudioContext, drive: number): WaveShaperNode {
    let curve = clipCurves.get(drive);
    if (curve === undefined) {
      curve = new Float32Array(1024);
      const top = Math.tanh(drive);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(drive * ((i / (curve.length - 1)) * 2 - 1)) / top;
      clipCurves.set(drive, curve);
    }
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve;
    shaper.oversample = '2x';
    return shaper;
  }

  /** A filter of `type` at `frequency`, its Q and its gain where it has them. */
  function biquad(ctx: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7, gain = 0): BiquadFilterNode {
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    filter.gain.value = gain;
    return filter;
  }

  /**
   * A held chord (`HELD_CHORDS`) from `at`, into `env`: its tones scooped up
   * into pitch, clipped and shaped by the horn's trumpet. The oscillators are
   * started and not stopped; the caller stops them.
   */
  function chord(ctx: AudioContext, env: AudioNode, voice: HornChord, at: number): OscillatorNode[] {
    const pitch = between(0.97, 1.03);
    const into = ctx.createGain();
    into.gain.value = 0.45 / voice.tones.length;
    const shaped = into
      .connect(clipper(ctx, voice.drive))
      .connect(biquad(ctx, 'highpass', voice.floor))
      .connect(biquad(ctx, 'peaking', voice.body, voice.focus, 7));
    (voice.nose === undefined ? shaped : shaped.connect(biquad(ctx, 'peaking', voice.nose, 2, 5)))
      .connect(biquad(ctx, 'lowpass', voice.ceiling))
      .connect(env);
    return voice.tones.map((frequency) => {
      const osc = ctx.createOscillator();
      osc.type = voice.wave ?? 'sawtooth';
      const f = frequency * pitch;
      osc.frequency.setValueAtTime(f * voice.scoop, at);
      osc.frequency.exponentialRampToValueAtTime(f, at + voice.settle);
      osc.connect(into);
      osc.start(at);
      rt.voices++;
      osc.onended = () => {
        rt.voices--;
        osc.disconnect();
      };
      return osc;
    });
  }

  /** A struck voice, once: a bicycle's bell, a tuk-tuk's bulb, a horse's snort. See `HORN_HELD`. */
  function strike(ctx: AudioContext, out: AudioNode, voice: Honk, peak: number): void {
    const at = ctx.currentTime + 0.005;
    const pitch = between(0.98, 1.02);
    const crackNoise = rt.loops?.crackNoise ?? null;
    if (voice === 'bell') {
      // One strike: every partial at once, each ringing down on its own time,
      // and the hammer's tick on top.
      const bus = biquad(ctx, 'highpass', 900);
      bus.connect(out);
      for (const [ratio, share, ring] of BELL_PARTIALS) {
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(peak * 0.55 * share, at + 0.002);
        env.gain.exponentialRampToValueAtTime(0.0001, at + ring);
        env.connect(bus);
        tone(ctx, env, 'sine', BELL_PITCH * ratio * pitch, at, at + ring + 0.02);
      }
      if (crackNoise !== null) {
        const tick = ctx.createBufferSource();
        tick.buffer = crackNoise;
        const env = envelope(ctx, at, peak * 0.35, 0.001, at + 0.006, 0.004);
        tick.connect(biquad(ctx, 'highpass', 3500)).connect(env).connect(out);
        tick.start(at, Math.random() * 0.5, 0.01);
      }
      return;
    }
    if (voice === 'squeak') {
      // A rubber bulb squeezed once: a reed's buzz, nasal, rising as the
      // bulb is pressed and falling as it lets go.
      const env = envelope(ctx, at, peak * 1.6, 0.02, at + 0.34, 0.09);
      const nose = ctx.createGain();
      nose.connect(env).connect(out);
      const clip = clipper(ctx, 3);
      for (const [centre, q] of [[1100, 3], [2500, 4]] as const) clip.connect(biquad(ctx, 'bandpass', centre, q)).connect(nose);
      const osc = tone(ctx, clip, 'sawtooth', 430 * pitch, at, at + 0.36);
      osc.frequency.setValueAtTime(430 * pitch, at);
      osc.frequency.linearRampToValueAtTime(560 * pitch, at + 0.07);
      osc.frequency.linearRampToValueAtTime(500 * pitch, at + 0.34);
      return;
    }
    // A horse's snort: a blow of breath through the nostrils, which flutter. A
    // whinny is a voice no oscillator makes believably.
    if (crackNoise === null) return;
    const length = 0.55;
    const breath = ctx.createBufferSource();
    breath.buffer = crackNoise;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak * 2.2, at + 0.025);
    env.gain.exponentialRampToValueAtTime(peak * 0.6, at + 0.18);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    // The flutter: the breath's level shaken thirty times a second, slowing.
    const flutter = ctx.createGain();
    flutter.gain.value = 0.55;
    const lips = ctx.createOscillator();
    lips.frequency.setValueAtTime(32 * pitch, at);
    lips.frequency.linearRampToValueAtTime(22 * pitch, at + length);
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lips.connect(depth).connect(flutter.gain);
    breath
      .connect(biquad(ctx, 'bandpass', 850 * pitch, 0.9))
      .connect(biquad(ctx, 'lowpass', 2400))
      .connect(flutter)
      .connect(env)
      .connect(out);
    breath.start(at, Math.random() * 0.4, length + 0.05);
    lips.start(at);
    lips.stop(at + length + 0.05);
    rt.voices++;
    lips.onended = () => rt.voices--;
  }

  /** One tick of a freewheel's pawl: a click of filtered noise a few milliseconds long. */
  function tick(ctx: AudioContext, out: AudioNode, at: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = between(2600, 3200);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.012);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + 0.02);
    rt.voices++;
    osc.onended = () => rt.voices--;
  }

  /** A phrase of two to six chirps, somewhere to one side. */
  function birds(ctx: AudioContext, out: AudioNode, at: number): void {
    const pan = ctx.createStereoPanner();
    pan.pan.value = between(-0.8, 0.8);
    pan.connect(out);
    const count = 2 + Math.floor(Math.random() * 5);
    const base = between(2300, 4200);
    let t = at;
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const length = between(0.05, 0.12);
      const from = base * between(0.9, 1.1);
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(from * between(0.7, 1.35), t + length);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(BIRD_LEVEL, t + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(env).connect(pan);
      osc.start(t);
      osc.stop(t + length + 0.02);
      rt.voices++;
      osc.onended = () => rt.voices--;
      t += length + between(0.04, 0.13);
    }
  }

  /** One cricket's chirp: three pulses of a high tone, 18 ms on and 18 off. */
  function cricket(ctx: AudioContext, out: AudioNode, at: number): void {
    const pan = ctx.createStereoPanner();
    pan.pan.value = between(-0.9, 0.9);
    pan.connect(out);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = between(4300, 4900);
    const env = ctx.createGain();
    env.gain.value = 0;
    for (let i = 0; i < 3; i++) {
      const t = at + i * 0.036;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(CRICKET_LEVEL, t + 0.004);
      env.gain.setValueAtTime(CRICKET_LEVEL, t + 0.014);
      env.gain.linearRampToValueAtTime(0, t + 0.018);
    }
    osc.connect(env).connect(pan);
    osc.start(at);
    osc.stop(at + 0.12);
    rt.voices++;
    osc.onended = () => rt.voices--;
  }

  return { tone, envelope, clipper, biquad, chord, strike, tick, birds, cricket };
}
