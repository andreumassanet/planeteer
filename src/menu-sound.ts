/**
 * What the front door sounds like: a tick under the pointer, the world's own
 * clicks for a choice and a way back, a rush of air for every dive between
 * the stages, and a low hum of space under the solar system that thins as
 * the camera comes down to a country and is gone by the time the town is.
 *
 * **The same voice as the world's interface.** A choice, a pick, a way back
 * and the start are `audio.ts`'s recorded cues (`ui-click`, `ui-toggle`,
 * `ui-close`, `ui-confirm`), so the menu and the settings card click alike;
 * only what no recording could follow is synthesised here — the tick, which
 * is heard dozens of times a minute and must be nearly nothing, the dive,
 * whose length is the flight's, and the hum, which has to fade with the
 * stage rather than stop.
 *
 * **Nothing sounds before the first gesture**, the browser's rule: the menu's
 * first click is the one that opens the context (`main.ts` offers every
 * pointer and key press to `unlock`), so that click itself is silent and
 * everything after it is heard. Until then every call here returns at once.
 *
 * **The settings hold it as they hold the world.** Everything goes through
 * the effects' master (`audio.bus`), so the Sound slider and its switch move
 * it; the hum is music rather than an effect, so it is also scaled by the
 * music's own volume and is silent while the music is off.
 */
import type { Audio } from './audio.ts';
import type { MenuSound, MenuSoundName, Stage } from './menu.ts';

/** The hum's level at each stage, against `PAD_LEVEL`: space, a planet, a country, a town. */
const PAD_AT: Readonly<Record<Stage, number>> = { system: 1, planet: 0.75, region: 0.35, site: 0.2 };
/** The hum at a music volume of 1, under the effects' master. */
const PAD_LEVEL = 0.075;
/** How long the hum takes to follow a stage, in seconds (a time constant). */
const PAD_LAG = 1.2;
/** The tick's peak. It is heard on every country the pointer crosses. */
const TICK_LEVEL = 0.035;
/** Ticks closer together than this are one tick: a sweep across a coast is not a drum roll. */
const TICK_GAP = 0.07;
/** The dive's peak. */
const DIVE_LEVEL = 0.16;

/** The recorded cue each of the menu's events is. */
const RECORDED: Readonly<Record<Exclude<MenuSoundName, 'hover'>, 'ui-click' | 'ui-toggle' | 'ui-close' | 'ui-confirm' | 'ui-open'>> = {
  select: 'ui-click',
  pick: 'ui-toggle',
  back: 'ui-close',
  open: 'ui-open',
  start: 'ui-confirm',
};

export function createMenuSound(audio: Audio, music: { readonly on: boolean; readonly volume: number }): MenuSound {
  let noise: AudioBuffer | null = null;
  let pad: { gain: GainNode; sources: AudioScheduledSourceNode[] } | null = null;
  let stage: Stage | null = 'system';
  let lastTick = -Infinity;
  /** The level the hum was last sent towards, so a frame that changes nothing schedules nothing. */
  let padAim = -1;

  /** The context and the bus, once a gesture has opened them and while they run. */
  function open(): { ctx: AudioContext; bus: GainNode } | null {
    const out = audio.output;
    const bus = audio.bus;
    if (out === null || bus === null || out.context.state !== 'running') return null;
    return { ctx: out.context, bus };
  }

  function noiseOf(ctx: AudioContext): AudioBuffer {
    if (noise !== null && noise.sampleRate === ctx.sampleRate) return noise;
    const length = Math.floor(ctx.sampleRate * 2);
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    // Pink by the leaky sum of three poles: brighter than brown, softer than white.
    let a = 0;
    let b = 0;
    let c = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      a = 0.99765 * a + white * 0.099046;
      b = 0.963 * b + white * 0.2965164;
      c = 0.57 * c + white * 1.0526913;
      data[i] = (a + b + c + white * 0.1848) * 0.2;
    }
    return noise;
  }

  /** The hum: two low fifths a hair apart, beating slowly, and a breath of filtered noise. */
  function buildPad(ctx: AudioContext, bus: GainNode): void {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 520;
    low.Q.value = 0.4;
    low.connect(gain).connect(bus);
    const sources: AudioScheduledSourceNode[] = [];
    for (const [frequency, type, level] of [
      [55, 'sine', 0.55],
      [55.35, 'triangle', 0.3],
      [82.4, 'sine', 0.32],
      [110.6, 'sine', 0.12],
    ] as const) {
      const oscillator = ctx.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const voice = ctx.createGain();
      voice.gain.value = level;
      oscillator.connect(voice).connect(low);
      oscillator.start();
      sources.push(oscillator);
    }
    // The breath: noise through a narrow band that wanders slowly, as a
    // shell held to the ear does.
    const air = ctx.createBufferSource();
    air.buffer = noiseOf(ctx);
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 240;
    band.Q.value = 3;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.35;
    air.connect(band).connect(airGain).connect(gain);
    air.start(0, Math.random() * 2);
    sources.push(air);
    const drift = ctx.createOscillator();
    drift.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 90;
    drift.connect(depth).connect(band.frequency);
    drift.start();
    sources.push(drift);
    pad = { gain, sources };
  }

  function padLevel(): number {
    if (stage === null || !music.on) return 0;
    return PAD_LEVEL * PAD_AT[stage] * Math.max(0, Math.min(1, music.volume));
  }

  function followPad(): void {
    const opened = open();
    if (opened === null) return;
    const wanted = padLevel();
    if (pad === null) {
      if (wanted <= 0) return;
      buildPad(opened.ctx, opened.bus);
      padAim = -1;
    }
    if (wanted === padAim) return;
    padAim = wanted;
    pad!.gain.gain.setTargetAtTime(wanted, opened.ctx.currentTime, PAD_LAG);
  }

  function tick(ctx: AudioContext, bus: GainNode): void {
    const now = ctx.currentTime;
    if (now - lastTick < TICK_GAP) return;
    lastTick = now;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1900 + Math.random() * 160, now);
    oscillator.frequency.exponentialRampToValueAtTime(1250, now + 0.035);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(TICK_LEVEL, now + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    oscillator.connect(envelope).connect(bus);
    oscillator.start(now);
    oscillator.stop(now + 0.06);
    oscillator.onended = () => envelope.disconnect();
  }

  return {
    cue(name) {
      const opened = open();
      if (opened === null) return;
      if (name === 'hover') tick(opened.ctx, opened.bus);
      else audio.cue(RECORDED[name]);
    },

    dive(direction, seconds) {
      const opened = open();
      if (opened === null || seconds <= 0.05) return;
      const { ctx, bus } = opened;
      const now = ctx.currentTime;
      const length = Math.min(4, seconds);
      // Air rushing past: a band of noise that rises going down into the
      // world and falls coming away from it, loudest a third of the way in.
      const source = ctx.createBufferSource();
      source.buffer = noiseOf(ctx);
      source.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 1.1;
      const [from, to] = direction === 'in' ? [260, 1500] : [1500, 260];
      band.frequency.setValueAtTime(from, now);
      band.frequency.exponentialRampToValueAtTime(to, now + length * 0.8);
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(DIVE_LEVEL, now + length * 0.32);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + length);
      source.connect(band).connect(envelope).connect(bus);
      source.start(now, Math.random() * 1.5);
      source.stop(now + length + 0.05);
      source.onended = () => envelope.disconnect();
    },

    stage(next) {
      stage = next;
      followPad();
    },

    update() {
      // The first gesture opens the context after the stage was set, and the
      // music's switch can move while the menu is up: both are caught here.
      followPad();
    },

    dispose() {
      stage = null;
      const opened = open();
      if (pad === null) return;
      const { gain, sources } = pad;
      pad = null;
      if (opened === null) {
        for (const source of sources) source.stop();
        gain.disconnect();
        return;
      }
      const now = opened.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.6);
      for (const source of sources) source.stop(now + 3);
      window.setTimeout(() => gain.disconnect(), 3200);
    },
  };
}
