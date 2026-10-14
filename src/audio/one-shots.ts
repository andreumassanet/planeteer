/** Footsteps, horns, thunder and the cues: sounds made when something happens. */
import type { Honk } from '../../server/src/limits.ts';
import { HORN_HELD } from '../horn.ts';
import { HELD_CHORDS } from './horn-voices.ts';
import { GAIN, HORN_LEVEL, LANDINGS, PAGES, STEP_LEVEL, THUNDER_LEVEL, VARIANTS, between, clamp01 } from './levels.ts';
import type { createSamples } from './samples.ts';
import type { createSynth } from './synth.ts';
import type { Runtime } from './runtime.ts';
import type { Cue, HeldHorn, Surface } from './types.ts';

export function createOneShots(rt: Runtime, synth: ReturnType<typeof createSynth>, samples: ReturnType<typeof createSamples>) {
  const { chord, strike } = synth;
  const { play } = samples;

  function step(surface: Surface, weight = 1): void {
    const count = VARIANTS[surface];
    const pick = Math.floor(Math.random() * count);
    play(`step-${surface}-${pick}`, STEP_LEVEL[surface] * Math.min(1.6, weight), between(0.93, 1.07));
  }

  function holdHorn(voice: Honk, near: number): HeldHorn | null {
    const ctx = rt.context;
    if (ctx === null || rt.master === null) return null;
    const voiced = HELD_CHORDS[voice];
    if (!HORN_HELD[voice] || voiced === undefined) {
      // Struck, not held: once a press, as a real bell rings once a thumb.
      if (near > 0.02) strike(ctx, rt.master, voice, HORN_LEVEL * clamp01(near));
      return { level() {}, release() {} };
    }
    const at = ctx.currentTime + 0.005;
    const env = ctx.createGain();
    const peak = (value: number): number => HORN_LEVEL * voiced.gain * clamp01(value);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak(near), at + voiced.attack);
    env.connect(rt.master);
    const oscillators = chord(ctx, env, voiced, at);
    let released = false;
    return {
      level(value) {
        if (released) return;
        const now = ctx.currentTime;
        // Past the attack only, or the ramp to the peak is cut short.
        if (now < at + voiced.attack) return;
        env.gain.setTargetAtTime(peak(value), now, 0.05);
      },
      release() {
        if (released) return;
        released = true;
        const now = Math.max(ctx.currentTime, at);
        env.gain.cancelScheduledValues(now);
        env.gain.setValueAtTime(env.gain.value, now);
        env.gain.linearRampToValueAtTime(0, now + voiced.release);
        for (const osc of oscillators) osc.stop(now + voiced.release + 0.02);
      },
    };
  }

  function horn(near: number, voice: Honk = 'car'): void {
    // A tap of the horn, as the traffic gives one: the held voice for a
    // moment, or a struck one once.
    if (near <= 0.02) return;
    const held = holdHorn(voice, near);
    if (held === null || !HORN_HELD[voice]) return;
    setTimeout(() => held.release(), between(280, 420));
  }

  function thunder(delay: number, loudness: number): void {
    const ctx = rt.context;
    const rumbleNoise = rt.loops?.rumbleNoise ?? null;
    const crackNoise = rt.loops?.crackNoise ?? null;
    if (ctx === null || rt.master === null || rumbleNoise === null || crackNoise === null) return;
    const loud = clamp01(loudness);
    if (loud < 0.02) return;
    const at = ctx.currentTime + Math.max(0, delay);
    // The crack, only near: a strike under a kilometre off tears; further
    // off the air has taken the highs and only the roll arrives.
    if (loud > 0.45) {
      const crack = ctx.createBufferSource();
      crack.buffer = crackNoise;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 900;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(THUNDER_LEVEL * 0.7 * loud, at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      crack.connect(high).connect(env).connect(rt.master);
      crack.start(at, Math.random() * 2);
      crack.stop(at + 0.4);
      rt.voices++;
      crack.onended = () => rt.voices--;
    }
    const roll = ctx.createBufferSource();
    roll.buffer = rumbleNoise;
    roll.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    const top = 140 + 520 * loud;
    low.frequency.setValueAtTime(top, at);
    const length = between(3.5, 6.5);
    low.frequency.exponentialRampToValueAtTime(70, at + length);
    const env = ctx.createGain();
    const peak = THUNDER_LEVEL * (0.25 + 0.75 * loud);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + between(0.06, 0.25));
    // Three or four swells, each softer than the last: the roll is the
    // same flash heard off a length of channel that is kilometres long.
    let t = at + 0.3;
    const swells = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < swells; i++) {
      const fall = (1 - i / swells) * peak;
      t += between(0.5, 1.3);
      env.gain.linearRampToValueAtTime(fall * between(0.35, 0.6), t);
      t += between(0.3, 0.8);
      env.gain.linearRampToValueAtTime(fall * between(0.7, 1), t);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, Math.max(t, at + length) + 1.2);
    roll.connect(low).connect(env).connect(rt.master);
    roll.start(at, Math.random() * 3);
    roll.stop(Math.max(t, at + length) + 1.3);
    rt.voices++;
    roll.onended = () => rt.voices--;
  }

  function cue(name: Cue): void {
    if (name === 'land') {
      play(`land-${Math.floor(Math.random() * LANDINGS)}`, GAIN.land, between(0.95, 1.05));
      return;
    }
    if (name === 'page') {
      // Never quite the same leaf twice: another of the three, pitched a little.
      play(`page-${Math.floor(Math.random() * PAGES)}`, GAIN.page * between(0.85, 1), between(0.9, 1.12));
      return;
    }
    play(name, GAIN[name]);
  }

  return { step, holdHorn, horn, thunder, cue };
}
