/**
 * What passes you sounds like it: an aeroplane's engine going over, a
 * helicopter's chop, an airliner's far roar, a train's wheels on the joints
 * and its horn.
 *
 * **Synthesised, like every loop in `audio.ts`, and joined to its bus**: the
 * voices are built on the first frame after the gesture that opened the
 * context (`audio.bus`), so the volume and the switch hold them as they hold
 * a footstep, and nothing here costs anything before that. One voice a kind,
 * following the nearest of that kind (`air-traffic.ts`'s `passing`, the
 * trains' likewise): two light planes in earshot are one engine, which is
 * what the ear makes of them anyway.
 *
 * **The pitch is the Doppler shift of the nearest.** The speed of sound at the
 * world's scale is `SOUND` units a second, and a source closing at `v` is
 * heard `SOUND / (SOUND - v)` times its own pitch: a light plane on its
 * circuit is a semitone and a half higher coming than going, an airliner two.
 * The level falls with the square of the distance's share of the voice's
 * reach, which is how a thing going over sounds: nothing, a swell, nothing.
 */
import { SCENERY_SCALE } from './stature.ts';

export type PassingVoice = 'prop' | 'rotor' | 'jet' | 'rail';

/** The nearest source of a voice: how far, and how fast it closes on the ear. */
export interface PassingSource {
  distance: number;
  /** Units a second toward the listener; negative going away. */
  closing: number;
  /** 0 to 1: how hard it is working, which opens the filter. Optional. */
  effort?: number;
}

/** The speed of sound, 343 m/s, in world units a second. */
export const SOUND = 343 * SCENERY_SCALE;

/** Each voice's level beside you and the distance it fades out by, in units. */
const VOICES: Readonly<Record<PassingVoice, { level: number; reach: number }>> = {
  prop: { level: 0.12, reach: 650 },
  rotor: { level: 0.13, reach: 750 },
  jet: { level: 0.07, reach: 5200 },
  rail: { level: 0.14, reach: 420 },
};
/** How fast a level follows, seconds. */
const FOLLOW = 0.25;

/** The Doppler factor for a source closing at `closing`, held to what the ear takes as the same sound. */
export function doppler(closing: number): number {
  const factor = SOUND / Math.max(SOUND * 0.3, SOUND - closing);
  return Math.min(1.5, Math.max(0.7, factor));
}

/** 0 out of earshot to 1 beside it. */
export function loudness(voice: PassingVoice, distance: number): number {
  const share = 1 - distance / VOICES[voice].reach;
  return share <= 0 ? 0 : share * share;
}

export interface PassingSound {
  /** Every frame, with the nearest of each voice or null. A no-op until `bus` exists. */
  update(bus: GainNode | null, sources: Partial<Record<PassingVoice, PassingSource | null>>): void;
  /** A train's horn, once: two notes a minor third apart, `near` 1 beside it. */
  horn(bus: GainNode | null, near: number): void;
}

interface Voice {
  gain: GainNode;
  /** What the Doppler factor moves. */
  pitch: (factor: number, effort: number, at: number) => void;
}

export function createPassingSound(): PassingSound {
  let context: AudioContext | null = null;
  let voices: Record<PassingVoice, Voice> | null = null;

  function brown(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    let peak = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last;
      peak = Math.max(peak, Math.abs(last));
    }
    const seam = Math.min(length >> 1, Math.floor(ctx.sampleRate * 0.05));
    for (let i = 0; i < seam; i++) {
      const t = i / seam;
      data[length - seam + i] = data[length - seam + i]! * (1 - t) + data[i]! * t;
    }
    const scale = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < length; i++) data[i] = data[i]! * scale;
    return buffer;
  }

  function noise(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(0, Math.random() * buffer.duration);
    return source;
  }

  function build(ctx: AudioContext, out: AudioNode): Record<PassingVoice, Voice> {
    const rumble = brown(ctx, 4);
    const make = (): GainNode => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(out);
      return gain;
    };

    // A light aircraft: two detuned sawtooths through a low-pass, and the
    // propeller's beat as a tremolo on them.
    const prop = (() => {
      const gain = make();
      const a = ctx.createOscillator();
      const b = ctx.createOscillator();
      a.type = b.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      const buzz = ctx.createGain();
      a.connect(filter);
      b.connect(filter);
      filter.connect(buzz).connect(gain);
      const beat = ctx.createOscillator();
      beat.frequency.value = 19;
      const depth = ctx.createGain();
      depth.gain.value = 0.25;
      beat.connect(depth).connect(buzz.gain);
      a.start();
      b.start();
      beat.start();
      return {
        gain,
        pitch(factor: number, effort: number, at: number) {
          a.frequency.setTargetAtTime(92 * factor * (0.9 + 0.2 * effort), at, FOLLOW);
          b.frequency.setTargetAtTime(93.7 * factor * (0.9 + 0.2 * effort), at, FOLLOW);
          beat.frequency.setTargetAtTime(19 * factor, at, FOLLOW);
          filter.frequency.setTargetAtTime(500 + 400 * effort, at, FOLLOW);
        },
      };
    })();

    // A helicopter: brown noise chopped by the blades, and a turbine's whine.
    const rotor = (() => {
      const gain = make();
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 380;
      const chopped = ctx.createGain();
      chopped.gain.value = 0.55;
      const source = noise(ctx, rumble);
      source.connect(low).connect(chopped).connect(gain);
      const chop = ctx.createOscillator();
      chop.frequency.value = 11;
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      chop.connect(depth).connect(chopped.gain);
      const turbine = ctx.createOscillator();
      turbine.frequency.value = 900;
      const whine = ctx.createGain();
      whine.gain.value = 0.03;
      turbine.connect(whine).connect(gain);
      chop.start();
      turbine.start();
      return {
        gain,
        pitch(factor: number, _effort: number, at: number) {
          chop.frequency.setTargetAtTime(11 * factor, at, FOLLOW);
          turbine.frequency.setTargetAtTime(900 * factor, at, FOLLOW);
          source.playbackRate.setTargetAtTime(factor, at, FOLLOW);
        },
      };
    })();

    // An airliner: a far roar, brown noise closed down low, which is all of a
    // jet that reaches the ground from cruise.
    const jet = (() => {
      const gain = make();
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 260;
      const source = noise(ctx, rumble);
      source.connect(low).connect(gain);
      return {
        gain,
        pitch(factor: number, _effort: number, at: number) {
          source.playbackRate.setTargetAtTime(factor, at, FOLLOW);
          low.frequency.setTargetAtTime(260 * factor, at, FOLLOW);
        },
      };
    })();

    // A train: the rumble of the wheels and a clack on each rail joint, two
    // to a bogie, coming faster the faster it runs.
    const rail = (() => {
      const gain = make();
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 320;
      const bed = ctx.createGain();
      bed.gain.value = 0.6;
      const source = noise(ctx, rumble);
      source.connect(low).connect(bed).connect(gain);
      // The clacks: a band of the rumble opened by a square wave's gate.
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1400;
      band.Q.value = 3;
      const gate = ctx.createGain();
      gate.gain.value = 0;
      noise(ctx, rumble).connect(band).connect(gate).connect(gain);
      const beat = ctx.createOscillator();
      beat.type = 'square';
      beat.frequency.value = 2;
      const depth = ctx.createGain();
      depth.gain.value = 1.4;
      beat.connect(depth).connect(gate.gain);
      beat.start();
      return {
        gain,
        pitch(factor: number, effort: number, at: number) {
          // `effort` is the train's speed as a share of its top: the joints
          // come round faster, from a slow ticking to a run of clacks.
          beat.frequency.setTargetAtTime(Math.max(0.5, 5 * effort) * factor, at, FOLLOW);
          low.frequency.setTargetAtTime((240 + 200 * effort) * factor, at, FOLLOW);
          source.playbackRate.setTargetAtTime(factor, at, FOLLOW);
        },
      };
    })();

    return { prop, rotor, jet, rail };
  }

  return {
    update(bus, sources) {
      if (bus === null) return;
      const ctx = bus.context as AudioContext;
      if (voices === null || context !== ctx) {
        context = ctx;
        voices = build(ctx, bus);
      }
      const at = ctx.currentTime;
      for (const name of Object.keys(voices) as PassingVoice[]) {
        const voice = voices[name];
        const source = sources[name] ?? null;
        const level = source === null ? 0 : VOICES[name].level * loudness(name, source.distance);
        voice.gain.gain.setTargetAtTime(level, at, FOLLOW);
        if (source !== null && level > 0) voice.pitch(doppler(source.closing), source.effort ?? 0.5, at);
      }
    },
    horn(bus, near) {
      if (bus === null || near <= 0) return;
      const ctx = bus.context as AudioContext;
      const at = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(bus);
      const level = 0.09 * Math.min(1, near);
      out.gain.setTargetAtTime(level, at, 0.03);
      out.gain.setTargetAtTime(0, at + 1.1, 0.12);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      filter.connect(out);
      // A two-chime air horn: 311 and 370 Hz, a minor third, each a sawtooth
      // pair beating slightly, which is what makes one sound like brass.
      const oscillators: OscillatorNode[] = [];
      for (const pitch of [311, 313.5, 370, 372.8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = pitch;
        o.connect(filter);
        o.start(at);
        o.stop(at + 1.8);
        oscillators.push(o);
      }
      oscillators[oscillators.length - 1]!.onended = () => out.disconnect();
    },
  };
}
