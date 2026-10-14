/**
 * What the world sounds like: wind, sea, engines, rain and thunder, birds by day
 * and crickets by night, footsteps, horns and the few cues that mark an event.
 *
 * Loops and horns are synthesised, because they follow a number every frame (altitude,
 * speed, the hour); footsteps and interface clicks are recorded CC0 one-shots baked by
 * `scripts/build-audio.mjs` and fetched after the first gesture. Nothing sounds
 * until a gesture unlocks the context, and `update` returns at once before that.
 *
 * The mix is one level constant per voice (`audio/levels.ts`); the bake only
 * levels every recording to the same peak.
 */
import { buildLoops } from './audio/loops.ts';
import { OPEN_AIR, clamp01, follow } from './audio/levels.ts';
import { createMix } from './audio/mix.ts';
import { createOneShots } from './audio/one-shots.ts';
import { createRuntime } from './audio/runtime.ts';
import { createSamples } from './audio/samples.ts';
import { createSynth } from './audio/synth.ts';
import type { Audio } from './audio/types.ts';

export type { Audio, Cue, HeldHorn, Soundscape, Surface } from './audio/types.ts';

export function createAudio(): Audio {
  const rt = createRuntime();
  const synth = createSynth(rt);
  const samples = createSamples(rt);
  const mix = createMix(rt, synth, samples);
  const shots = createOneShots(rt, synth, samples);

  function level(): number {
    // Linear: the Settings slider is already logarithmic, and squaring on top of it would bend it twice.
    return rt.muted ? 0 : rt.volume;
  }

  return {
    unlock() {
      if (rt.context !== null) {
        // Not only `suspended`: Safari's `interrupted` — a call, Siri, another
        // app taking the sound — is left for the page to resume, and a gesture
        // is when it may.
        if (rt.context.state !== 'running' && rt.context.state !== 'closed' && !document.hidden) rt.context.resume().catch(() => {});
        return;
      }
      const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      try {
        rt.context = new Ctor({ latencyHint: 'interactive' });
      } catch {
        rt.context = null;
        return;
      }
      const ctx = rt.context;
      // A gentle compressor on the master, so a horn over the engine at full
      // throttle does not clip on a laptop's speakers.
      const squeeze = ctx.createDynamicsCompressor();
      squeeze.threshold.value = -14;
      squeeze.ratio.value = 3;
      squeeze.attack.value = 0.01;
      squeeze.release.value = 0.25;
      rt.muffle = ctx.createBiquadFilter();
      rt.muffle.type = 'lowpass';
      rt.muffle.frequency.value = OPEN_AIR;
      rt.muffle.Q.value = 0.8;
      squeeze.connect(rt.muffle).connect(ctx.destination);
      rt.output = { context: ctx, node: squeeze };
      rt.master = ctx.createGain();
      rt.master.gain.value = level();
      rt.master.connect(squeeze);
      rt.loops = buildLoops(ctx, rt.master);
      void samples.fetchAll(ctx);
      // A hidden tab keeps no engine running: the loop is frozen, so should the sound be.
      document.addEventListener('visibilitychange', () => {
        if (rt.context === null) return;
        if (document.hidden) rt.context.suspend().catch(() => {});
        else rt.context.resume().catch(() => {});
      });
    },
    update: mix.update,
    step: shots.step,
    holdHorn: shots.holdHorn,
    horn: shots.horn,
    thunder: shots.thunder,
    cue: shots.cue,

    get volume() {
      return rt.volume;
    },
    set volume(value: number) {
      rt.volume = clamp01(Number.isFinite(value) ? value : 0.8);
      if (rt.master !== null && rt.context !== null) follow(rt.master.gain, level(), rt.context.currentTime, 0.05);
    },
    get muted() {
      return rt.muted;
    },
    set muted(value: boolean) {
      rt.muted = value;
      if (rt.master !== null && rt.context !== null) follow(rt.master.gain, level(), rt.context.currentTime, 0.05);
    },

    get output() {
      return rt.output;
    },
    get bus() {
      return rt.master;
    },

    get stats() {
      return {
        unlocked: rt.context !== null,
        state: rt.context?.state ?? 'locked',
        loaded: rt.loaded,
        voices: rt.voices,
      };
    },
  };
}
