/**
 * What the world sounds like: the wind, the sea, the engines, birds by day
 * and crickets by night, the footsteps, and the few cues that mark an event.
 *
 * **The loops are synthesised and the one-shots are recorded**, and the split
 * is the same one the models made. A loop here has to follow a number every
 * frame — the altitude, the speed, how much of the view is sea, the hour — and
 * a recording of wind at one speed is a recording of wind at one speed: it
 * either repeats where you can hear the seam or it costs megabytes. Filtered
 * noise follows any number for free. A footstep and a click are the
 * opposite case, where a microphone beats any oscillator, so those are
 * Kenney's CC0 recordings, baked by `scripts/build-audio.mjs` (76.5 KB for
 * all 30 on 2026-10-01, the passport's book among them, fetched only after
 * the first click and never in the first load).
 *
 * **Nothing makes a sound until a gesture unlocks it**, which is the browser's
 * rule and also this project's: the menu's first click is the one that opens
 * the context, and the menu is heard from then on (`menu-sound.ts`). Before
 * that `update` returns at once, so the loop pays nothing for a player who
 * never clicks.
 *
 * **The mix is one number per voice, here, and never in the bake.** Every
 * recording is levelled to the same peak by the bake so that re-baking cannot
 * move the balance; the balance is `GAIN` and the `*_LEVEL` constants below.
 * They were set by reading the synthesis rather than by ear, and a player's ear
 * is the review they still need.
 */

import type { Honk } from '../server/src/limits.ts';
import { HORN_HELD } from './horn.ts';

export type Surface = 'grass' | 'paving' | 'snow' | 'dirt';

export type Cue =
  | 'land'
  | 'ui-click'
  | 'ui-open'
  | 'ui-close'
  | 'ui-toggle'
  | 'ui-error'
  | 'ui-confirm'
  | 'book-open'
  | 'book-close'
  | 'page'
  | 'stamp';

/** What the world is doing this frame, as far as the ear cares. */
export interface Soundscape {
  /**
   * What the player is doing, which is what decides the engine: a car's is the
   * launch's outboard loop pitched up and opened out, a bus's and a tractor's
   * the same loop low and closed, a motorbike's and a jet ski's high and open;
   * a helicopter's is its rotor's chop; a balloon, a sail and a bicycle have
   * none — a bicycle's freewheel ticks as it coasts — a horse is its hooves,
   * and a swimmer hears the sea and the wind and nothing else. A saucer, on
   * the other worlds, is a soft hum that warbles, rising with its pace.
   */
  mode:
    | 'menu'
    | 'foot'
    | 'swim'
    | 'car'
    | 'heavy'
    | 'motorbike'
    | 'bicycle'
    | 'horse'
    | 'boat'
    | 'jetski'
    | 'sail'
    | 'plane'
    | 'helicopter'
    | 'balloon'
    | 'saucer';
  /** Units a second over the ground or the water. */
  speed: number;
  /** The craft's speed as a fraction of its range, 0 idle to 1 flat out. */
  throttle: number;
  /** The eye's height over the ground under it, in units. */
  height: number;
  /** How much of the surroundings is sea: 1 in a boat, in the water or on the beach, 0 inland. */
  sea: number;
  /** `sky.state.daylight`: 0 full night, 1 full day. */
  daylight: number;
  /** 1 in open country, 0 on a town's paving. Birds and crickets live in the first. */
  wild: number;
  /** Ice and tundra: no insects, no birdsong. */
  cold: boolean;
  /** Rain on and round you, 0 to 1 (`weather-view.ts`). Snow falls silent and is not counted. */
  rain?: number;
  /** How much of a gale the weather adds to the wind, 0 to 1. */
  gale?: number;
  /**
   * Whether the ear is under the water, 0 to 1: every sound, the music with
   * it, through a low-pass that closes to `MUFFLED` hertz — the world heard
   * through water — and opens again on surfacing.
   */
  underwater?: number;
  /**
   * How much air there is to carry the wind, 1 on Earth and less on a world
   * with a thinner sky (`SkySpec.air`): none on the Moon, where nothing blows.
   */
  air?: number;
}

/** The low-pass under the water, hertz, and above it, where it lets everything by. */
const MUFFLED = 650;
const OPEN_AIR = 20000;

/** A horn sounding for as long as it is held: see `Audio.holdHorn`. */
export interface HeldHorn {
  /** How near it is now, 1 beside you and 0 out of earshot. */
  level(near: number): void;
  /** Let go: the chord closes over its release; a one-shot voice has nothing to let go. */
  release(): void;
}

/**
 * The held voices, as an electric or an air horn is made: two or three
 * sawtooth tones (`tones`, Hz) — two tones a third or so apart is every
 * car's horn — scooped up into pitch from `scoop` of it over `settle`
 * seconds, as a diaphragm or a reed comes up to speed; driven into a soft
 * clip (`drive`), which is the rasp a horn's diaphragm adds; then the horn's
 * own trumpet as a resonance (`body`, Hz, `focus` its Q), with the mud under
 * `floor` and the fizz over `ceiling` taken off. `attack` and `release` are
 * how the chord opens and closes, in seconds, and `gain` its share of
 * `HORN_LEVEL`.
 *
 * A car's is 410 and 515 Hz, close to the pairs real two-tone horns are
 * tuned to; a bus's an air horn's 277 and 349, swelling in; a boat's a deep
 * 98 and 147 that takes a quarter of a second to come up. A motorbike's or a
 * scooter's is a small electromagnetic disc horn: a diaphragm slapping its
 * contact makes a pulse, not a saw, so its tone is one note near 450 Hz rich
 * in odd harmonics (`wave` square), sagging a little as the diaphragm comes up
 * to its swing, the disc's own ring a narrow peak near 2.6 kHz and the nasal
 * honk of the little trumpet another (`nose`, Hz) near 1.3. Until 2026-10-01
 * they were bare squares and saws through a low-pass, which read as a test
 * tone, not a horn, and the scooter's a saw at 565 Hz, which read as a toy.
 */
interface HornChord {
  tones: readonly number[];
  scoop: number;
  settle: number;
  drive: number;
  body: number;
  focus: number;
  floor: number;
  ceiling: number;
  attack: number;
  release: number;
  gain: number;
  /** The oscillators' wave, a saw when not given. */
  wave?: OscillatorType;
  /** A second resonance, Hz, over `body`'s, as narrow: a disc horn's trumpet. */
  nose?: number;
}
const HELD_CHORDS: Partial<Record<Honk, HornChord>> = {
  car: { tones: [410, 515], scoop: 0.94, settle: 0.03, drive: 3, body: 1900, focus: 1.3, floor: 300, ceiling: 4500, attack: 0.008, release: 0.05, gain: 1 },
  bus: { tones: [277, 349], scoop: 0.86, settle: 0.12, drive: 4, body: 950, focus: 1.1, floor: 160, ceiling: 2800, attack: 0.07, release: 0.12, gain: 1.15 },
  ship: { tones: [98, 147], scoop: 0.9, settle: 0.4, drive: 2.5, body: 420, focus: 0.9, floor: 60, ceiling: 1300, attack: 0.25, release: 0.4, gain: 1.4 },
  beep: { tones: [452], scoop: 0.93, settle: 0.045, drive: 2.6, body: 2600, focus: 2.4, floor: 380, ceiling: 6500, attack: 0.004, release: 0.025, gain: 0.55, wave: 'square', nose: 1300 },
};

/**
 * The bicycle's bell: one strike of a thin dome, whose partials stand at
 * these ratios to the fundamental (`BELL_PITCH`, Hz) — inharmonic, which is
 * what makes it a bell and not a note — each its own share of the strike and
 * its own ring, the high ones dying first; and a twin of the fundamental a
 * few hertz off, whose beating is the shimmer a struck bell has.
 */
const BELL_PITCH = 2150;
const BELL_PARTIALS: readonly (readonly [ratio: number, level: number, ring: number])[] = [
  [1, 1, 1.5],
  [1.004, 0.45, 1.3],
  [2.76, 0.55, 0.7],
  [5.4, 0.3, 0.35],
  [8.93, 0.14, 0.16],
];

export interface Audio {
  /** Call from a user gesture: opens the context and starts fetching the recordings. */
  unlock(): void;
  /** Every frame. A no-op until `unlock`. */
  update(dt: number, state: Soundscape): void;
  /** One footfall on this surface; `weight` 1 is a walk, more is a run or a landing. */
  step(surface: Surface, weight?: number): void;
  cue(name: Cue): void;
  /**
   * A horn, once: the traffic kept waiting, a driver's own, another player's.
   * `near` is 1 beside you and 0 out of earshot, and every voice is
   * synthesised, so none costs a recording (no CC0 pack this project reads
   * has a horn, a bell or a horse): the held ones are `HELD_CHORDS` for a
   * moment, the struck ones (`HORN_HELD`) once — a bicycle's bell, one strike
   * of five inharmonic partials; a tuk-tuk's rubber bulb, one squeeze of a
   * nasal reed; and a horse's snort, a fluttering blow of breath.
   */
  horn(near: number, voice?: Honk): void;
  /**
   * A horn held down, from now until its `release`: a driver's own while the
   * key is down, and another player's while they hold theirs. `near` is as
   * `horn`'s and can be moved while it sounds. A car's two tones, a bus's, a
   * boat's and a motorbike's are one chord held for as long as the key is,
   * with a short attack and a release; a bell, a rubber bulb and a snort are
   * struck once and are not held (`HORN_HELD`). Null until `unlock`.
   */
  holdHorn(voice: Honk, near: number): HeldHorn | null;
  /**
   * Thunder, once, `delay` seconds from now — the flash's distance over the
   * speed of sound, which the caller knows — at `loudness` 1 overhead to 0 far
   * off. Synthesised: a crack of white noise when it is close, then brown
   * noise under a falling low-pass in three or four swells, which is what a
   * roll is.
   */
  thunder(delay: number, loudness: number): void;
  /** 0 to 1, a linear gain on the master; the slider that sets it is logarithmic. */
  volume: number;
  muted: boolean;
  /**
   * The context and the last node before the speakers — the limiter every
   * sound shares — once `unlock` has opened them. The music joins here, past
   * the effects' master, so its volume and theirs are separate.
   */
  readonly output: { context: AudioContext; node: AudioNode } | null;
  /**
   * The effects' master, once `unlock` has opened it: where a sound made
   * elsewhere joins the world's — the townsfolk's voices, the chat's blip —
   * so the volume and the switch hold it as they hold a footstep.
   */
  readonly bus: GainNode | null;
  readonly stats: {
    unlocked: boolean;
    state: string;
    loaded: number;
    voices: number;
  };
}

/** The recordings, by the names `build-audio.mjs` publishes. */
const VARIANTS: Record<Surface, number> = { grass: 4, paving: 4, snow: 4, dirt: 4 };
const ONE_SHOTS: Cue[] = ['ui-click', 'ui-open', 'ui-close', 'ui-toggle', 'ui-error', 'ui-confirm', 'book-open', 'book-close', 'stamp'];
const LANDINGS = 2;
/** The passport's leaves, `page-<n>`: one picked at random a turn. */
const PAGES = 3;

/**
 * Each cue's level against the others. There were two jingles over them, a
 * landmark's and a frontier's, until the cards they rang with were taken out
 * (2026-10-01).
 */
const GAIN: Record<Cue, number> = {
  land: 0.32,
  'ui-click': 0.18,
  'ui-open': 0.22,
  'ui-close': 0.22,
  'ui-toggle': 0.2,
  'ui-error': 0.24,
  'ui-confirm': 0.24,
  'book-open': 0.3,
  'book-close': 0.3,
  page: 0.34,
  stamp: 0.4,
};

/** A footstep's level by surface; a run is `RUN_WEIGHT` of it. */
const STEP_LEVEL: Record<Surface, number> = { grass: 0.2, paving: 0.16, snow: 0.2, dirt: 0.18 };

/** How long every loop takes to follow a change, in seconds: long enough that a frame's jitter is inaudible. */
const FOLLOW = 0.35;

const WIND_LEVEL = 0.14;
const SEA_LEVEL = 0.3;
const BOAT_LEVEL = 0.14;
const PLANE_LEVEL = 0.13;
const CAR_LEVEL = 0.11;
const ROTOR_LEVEL = 0.16;
/** A saucer's hum: quieter than any engine, it is meant to be heard and not noticed. */
const SAUCER_LEVEL = 0.07;
const TICK_LEVEL = 0.05;
const HOOF_LEVEL = 0.22;

/**
 * The motor loop's voice for each mode that has one: its level, the putt's
 * pitch at idle and what the throttle adds to it, and the filter's likewise.
 * The launch's outboard is the loop as built; a car opens it out, a diesel
 * closes it down, a small single revs it high.
 */
const MOTORS: Partial<Record<Soundscape['mode'], { level: number; putt: number; rise: number; filter: number; open: number }>> = {
  boat: { level: BOAT_LEVEL, putt: 30, rise: 26, filter: 220, open: 480 },
  car: { level: CAR_LEVEL, putt: 42, rise: 70, filter: 320, open: 900 },
  heavy: { level: CAR_LEVEL * 1.2, putt: 24, rise: 36, filter: 190, open: 420 },
  motorbike: { level: CAR_LEVEL * 0.9, putt: 58, rise: 130, filter: 480, open: 1700 },
  jetski: { level: BOAT_LEVEL * 0.9, putt: 52, rise: 110, filter: 400, open: 1500 },
};
const BIRD_LEVEL = 0.05;
const CRICKET_LEVEL = 0.025;
const HORN_LEVEL = 0.06;
const RAIN_LEVEL = 0.2;
const THUNDER_LEVEL = 0.55;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const between = (a: number, b: number): number => a + Math.random() * (b - a);

export function createAudio(): Audio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  /** The low-pass between the limiter and the speakers; see `Soundscape.underwater`. */
  let muffle: BiquadFilterNode | null = null;
  let output: { context: AudioContext; node: AudioNode } | null = null;
  let volume = 0.8;
  let muted = false;
  let loaded = 0;
  let voices = 0;
  const buffers = new Map<string, AudioBuffer>();

  // The loops, built on unlock.
  let wind: { gain: GainNode; band: BiquadFilterNode } | null = null;
  let sea: { gain: GainNode; foam: GainNode } | null = null;
  let boat: { gain: GainNode; low: OscillatorNode; high: OscillatorNode; filter: BiquadFilterNode } | null = null;
  let plane: { gain: GainNode; a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode; buzz: GainNode } | null = null;
  let rotor: { gain: GainNode; chop: OscillatorNode; whine: GainNode } | null = null;
  let saucer: { gain: GainNode; low: OscillatorNode; high: OscillatorNode; warble: OscillatorNode; depth: GainNode; filter: BiquadFilterNode } | null = null;
  /** Seconds to a bicycle's next freewheel tick, and a horse's next hoof. */
  let nextTick = 0;
  let nextHoof = 0;
  let hoof = 0;
  let nature: GainNode | null = null;
  let rain: { hiss: GainNode; drum: GainNode } | null = null;
  let rumbleNoise: AudioBuffer | null = null;
  let crackNoise: AudioBuffer | null = null;

  // Slow random walks that keep the loops from sounding like a test tone.
  let gust = 0.5;
  let gustTarget = 0.5;
  let gustClock = 0;
  let swell = 0;
  let swellPeriod = 7;
  let nextBirds = 3;
  let nextCricket = 0.5;

  function level(): number {
    // Linear here: the Settings slider is already logarithmic, which is the
    // perceptual curve, and squaring on top of it would bend it twice.
    return muted ? 0 : volume;
  }

  function noiseBuffer(ctx: AudioContext, colour: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Paul Kellet's pink filter and a leaky integrator for brown: both are the
    // textbook forms, and both are normalised afterwards so the levels above
    // mean the same thing for every colour.
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

  function loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // Two loops of the same buffer started together would be one loop, louder.
    source.start(0, Math.random() * buffer.duration);
    return source;
  }

  function build(ctx: AudioContext, out: AudioNode): void {
    const pink = noiseBuffer(ctx, 'pink', 5);
    const brown = noiseBuffer(ctx, 'brown', 6);
    const white = noiseBuffer(ctx, 'white', 3);

    // The wind: pink noise through a wandering band, so it whistles a little
    // and never sits on one note.
    {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 500;
      band.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      loop(ctx, pink).connect(band).connect(gain).connect(out);
      wind = { gain, band };
    }

    // The sea: brown noise under a low-pass is the body of the swell, and a
    // narrow band of white noise riding the same envelope is the foam.
    {
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 650;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      loop(ctx, brown).connect(low).connect(gain).connect(out);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2600;
      band.Q.value = 0.6;
      const foam = ctx.createGain();
      foam.gain.value = 0;
      loop(ctx, white).connect(band).connect(foam).connect(out);
      sea = { gain, foam };
    }

    // The launch: a square an octave under a sawtooth, both low-passed, is a
    // small outboard; the pitch and the filter open with the throttle.
    {
      const lowOsc = ctx.createOscillator();
      lowOsc.type = 'square';
      const highOsc = ctx.createOscillator();
      highOsc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lowGain = ctx.createGain();
      lowGain.gain.value = 0.6;
      lowOsc.connect(lowGain).connect(filter);
      highOsc.connect(filter);
      filter.connect(gain).connect(out);
      lowOsc.start();
      highOsc.start();
      boat = { gain, low: lowOsc, high: highOsc, filter };
    }

    // The floatplane: two detuned sawtooths for the engine, and a slow tremolo
    // on the whole for the propeller.
    {
      const a = ctx.createOscillator();
      a.type = 'sawtooth';
      const b = ctx.createOscillator();
      b.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      const buzz = ctx.createGain();
      buzz.gain.value = 1;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      a.connect(filter);
      b.connect(filter);
      filter.connect(buzz).connect(gain).connect(out);
      const prop = ctx.createOscillator();
      prop.frequency.value = 22;
      const depth = ctx.createGain();
      depth.gain.value = 0.22;
      prop.connect(depth).connect(buzz.gain);
      a.start();
      b.start();
      prop.start();
      plane = { gain, a, b, filter, buzz };
    }

    // The helicopter: brown noise under a low-pass, chopped by a slow
    // oscillator on its gain — the blades passing, a dozen times a second —
    // and a turbine's thin whine over it.
    {
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 420;
      const chopped = ctx.createGain();
      chopped.gain.value = 0.55;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      loop(ctx, brown).connect(low).connect(chopped).connect(gain).connect(out);
      const chop = ctx.createOscillator();
      chop.frequency.value = 11;
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      chop.connect(depth).connect(chopped.gain);
      const turbine = ctx.createOscillator();
      turbine.type = 'sine';
      turbine.frequency.value = 880;
      const whine = ctx.createGain();
      whine.gain.value = 0.04;
      turbine.connect(whine).connect(gain);
      chop.start();
      turbine.start();
      rotor = { gain, chop, whine };
    }

    // The saucer: two sines a fifth apart, a hair out of tune so they beat,
    // their pitch wobbled by a slow oscillator — the warble — under a soft
    // low-pass. The pitch, the warble's speed and its depth rise with the pace.
    {
      const low = ctx.createOscillator();
      low.type = 'sine';
      low.frequency.value = 110;
      const high = ctx.createOscillator();
      high.type = 'triangle';
      high.frequency.value = 166;
      const warble = ctx.createOscillator();
      warble.frequency.value = 4;
      const depth = ctx.createGain();
      depth.gain.value = 3;
      warble.connect(depth);
      depth.connect(low.frequency);
      depth.connect(high.frequency);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const highGain = ctx.createGain();
      highGain.gain.value = 0.35;
      low.connect(filter);
      high.connect(highGain).connect(filter);
      filter.connect(gain).connect(out);
      low.start();
      high.start();
      warble.start();
      saucer = { gain, low, high, warble, depth, filter };
    }

    nature = ctx.createGain();
    nature.gain.value = 1;
    nature.connect(out);

    // The rain: a hiss of white noise with its lows cut, the drops, and a
    // softer band of pink under it that only a downpour opens.
    {
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 1400;
      const top = ctx.createBiquadFilter();
      top.type = 'lowpass';
      top.frequency.value = 8000;
      const hiss = ctx.createGain();
      hiss.gain.value = 0;
      loop(ctx, white).connect(high).connect(top).connect(hiss).connect(out);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.7;
      const drum = ctx.createGain();
      drum.gain.value = 0;
      loop(ctx, pink).connect(band).connect(drum).connect(out);
      rain = { hiss, drum };
    }
    rumbleNoise = brown;
    crackNoise = white;
  }

  /** An oscillator into `into` from `from` to `to`, counted as a voice while it sounds. */
  function tone(ctx: AudioContext, into: AudioNode, type: OscillatorType, frequency: number, from: number, to: number): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(into);
    osc.start(from);
    osc.stop(to);
    voices++;
    osc.onended = () => voices--;
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
      voices++;
      osc.onended = () => {
        voices--;
        osc.disconnect();
      };
      return osc;
    });
  }

  /** A struck voice, once: a bicycle's bell, a tuk-tuk's bulb, a horse's snort. See `HORN_HELD`. */
  function strike(ctx: AudioContext, out: AudioNode, voice: Honk, peak: number): void {
    const at = ctx.currentTime + 0.005;
    const pitch = between(0.98, 1.02);
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
    // A horse's snort: a blow of breath through the nostrils, which flutter.
    // A whinny is a voice no oscillator makes believably: the buzz through
    // two formants that stood for one until 2026-10-01 did not read as a horse.
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
    voices++;
    lips.onended = () => voices--;
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
    voices++;
    osc.onended = () => voices--;
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
      voices++;
      osc.onended = () => voices--;
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
    voices++;
    osc.onended = () => voices--;
  }

  async function fetchAll(ctx: AudioContext): Promise<void> {
    const names: string[] = [...ONE_SHOTS];
    for (const surface of Object.keys(VARIANTS) as Surface[]) {
      for (let i = 0; i < VARIANTS[surface]; i++) names.push(`step-${surface}-${i}`);
    }
    for (let i = 0; i < LANDINGS; i++) names.push(`land-${i}`);
    for (let i = 0; i < PAGES; i++) names.push(`page-${i}`);
    await Promise.all(
      names.map(async (name) => {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}audio/${name}.mp3`);
          if (!response.ok) return;
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          buffers.set(name, buffer);
          loaded++;
        } catch {
          // A missing sound is silence, never an error on the player's screen.
        }
      }),
    );
  }

  function play(name: string, gain: number, rate = 1): void {
    if (context === null || master === null) return;
    const buffer = buffers.get(name);
    if (buffer === undefined) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const g = context.createGain();
    g.gain.value = gain;
    source.connect(g).connect(master);
    source.start();
    voices++;
    source.onended = () => voices--;
  }

  function follow(param: AudioParam, value: number, time: number, constant = FOLLOW): void {
    param.setTargetAtTime(value, time, constant);
  }

  const audio: Audio = {
    unlock() {
      if (context !== null) {
        // Not only `suspended`: Safari's `interrupted` — a call, Siri, another
        // app taking the sound — is left for the page to resume, and a gesture
        // is when it may.
        if (context.state !== 'running' && context.state !== 'closed' && !document.hidden) context.resume().catch(() => {});
        return;
      }
      const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      try {
        context = new Ctor({ latencyHint: 'interactive' });
      } catch {
        context = null;
        return;
      }
      const ctx = context;
      // A gentle compressor on the master, so a horn over the engine at full
      // throttle does not clip on a laptop's speakers.
      const squeeze = ctx.createDynamicsCompressor();
      squeeze.threshold.value = -14;
      squeeze.ratio.value = 3;
      squeeze.attack.value = 0.01;
      squeeze.release.value = 0.25;
      muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = OPEN_AIR;
      muffle.Q.value = 0.8;
      squeeze.connect(muffle).connect(ctx.destination);
      output = { context: ctx, node: squeeze };
      master = ctx.createGain();
      master.gain.value = level();
      master.connect(squeeze);
      build(ctx, master);
      void fetchAll(ctx);
      // A hidden tab keeps no engine running: the loop is frozen, so should the sound be.
      document.addEventListener('visibilitychange', () => {
        if (context === null) return;
        if (document.hidden) context.suspend().catch(() => {});
        else context.resume().catch(() => {});
      });
    },

    update(dt, state) {
      const ctx = context;
      if (ctx === null || wind === null || sea === null || boat === null || plane === null || rotor === null || nature === null || rain === null) return;
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (muffle !== null) {
        const under = clamp01(state.underwater ?? 0);
        follow(muffle.frequency, OPEN_AIR * Math.pow(MUFFLED / OPEN_AIR, under), now, 0.12);
      }
      const flying = state.mode === 'plane';
      const sailing = state.mode === 'boat' || state.mode === 'jetski' || state.mode === 'sail';
      const drifting = state.mode === 'balloon' || state.mode === 'helicopter' || state.mode === 'saucer';
      // Open to the air and quiet: birds and crickets are heard on a bicycle
      // or a horse as they are on foot; under sail it is the sea that is heard.
      const walking = state.mode === 'foot' || state.mode === 'bicycle' || state.mode === 'horse';
      const menu = state.mode === 'menu';
      const throttle = clamp01(state.throttle);

      // Gusts: a new target every few seconds, approached slowly.
      gustClock -= dt;
      if (gustClock <= 0) {
        gustTarget = between(0.25, 1);
        gustClock = between(2.5, 6);
      }
      gust += (gustTarget - gust) * clamp01(dt * 0.6);
      const gale = menu ? 0 : clamp01(state.gale ?? 0);
      const wet = menu ? 0 : clamp01(state.rain ?? 0);

      const high = clamp01(state.height / 400);
      const windLevel = menu
        ? 0
        : flying
          ? WIND_LEVEL * (1.1 + 1.4 * throttle + 0.6 * high)
          : sailing || drifting
            ? WIND_LEVEL * (0.8 + 0.6 * throttle + 0.6 * (drifting ? high : 0))
            : WIND_LEVEL * (0.45 + 0.9 * clamp01(state.height / 60));
      follow(wind.gain.gain, windLevel * clamp01(state.air ?? 1) * (0.55 + 0.45 * gust) * (1 + 1.6 * gale), now);
      follow(wind.band.frequency, (flying ? 600 + 900 * throttle : 320) * (0.75 + 0.5 * gust), now, 0.8);

      // The swell: a slow rise and a slower fall, one every six to nine seconds.
      swell += dt / swellPeriod;
      if (swell >= 1) {
        swell -= 1;
        swellPeriod = between(6, 9);
      }
      const crest = swell < 0.35 ? swell / 0.35 : 1 - (swell - 0.35) / 0.65;
      const shaped = crest * crest * (3 - 2 * crest);
      const seaNear = menu ? 0 : clamp01(state.sea) * (flying ? 0.25 * (1 - high) : 1);
      follow(sea.gain.gain, SEA_LEVEL * seaNear * (0.4 + 0.6 * shaped), now, 0.2);
      // Heard less in the plane, whose engine and wind are most of the ear.
      const rainHeard = wet * (flying ? 0.35 : 1);
      follow(rain.hiss.gain, RAIN_LEVEL * rainHeard * (0.6 + 0.4 * gust), now, 0.6);
      follow(rain.drum.gain, RAIN_LEVEL * 0.8 * rainHeard * rainHeard, now, 0.6);
      follow(sea.foam.gain, SEA_LEVEL * 0.18 * seaNear * shaped * shaped, now, 0.15);

      // One loop for every motor on the ground and the water: the launch's
      // outboard, and a car's engine, which is the same square an octave under
      // a sawtooth pitched up and let through a wider filter; a diesel and a
      // single are the same again, lower and closed or higher and open.
      const voice = MOTORS[state.mode];
      const motor = voice === undefined ? 0 : voice.level * (0.32 + 0.68 * throttle);
      follow(boat.gain.gain, motor, now);
      const putt = voice === undefined ? 30 : voice.putt + voice.rise * throttle;
      follow(boat.low.frequency, putt, now);
      follow(boat.high.frequency, putt * 2, now);
      follow(boat.filter.frequency, voice === undefined ? 220 : voice.filter + voice.open * throttle, now);

      // The rotor, whenever somebody is at a helicopter's controls or in it.
      const chopping = state.mode === 'helicopter';
      follow(rotor.gain.gain, chopping ? ROTOR_LEVEL * (0.6 + 0.4 * throttle) : 0, now);
      follow(rotor.chop.frequency, 10 + 3 * throttle, now, 0.8);

      // The saucer's hum, whenever somebody is at its controls.
      if (saucer !== null) {
        const humming = state.mode === 'saucer';
        follow(saucer.gain.gain, humming ? SAUCER_LEVEL * (0.55 + 0.45 * throttle) : 0, now, 0.4);
        const pitch = 96 + 150 * throttle;
        follow(saucer.low.frequency, pitch, now, 0.5);
        follow(saucer.high.frequency, pitch * 1.5 * 1.006, now, 0.5);
        follow(saucer.warble.frequency, 3.5 + 6 * throttle, now, 0.5);
        follow(saucer.depth.gain, pitch * (0.025 + 0.03 * throttle), now, 0.5);
        follow(saucer.filter.frequency, 700 + 1400 * throttle, now, 0.5);
      }

      // A bicycle's freewheel ticks as it coasts, faster the faster it goes;
      // pedalled, the pawl is carried round and says nothing.
      if (state.mode === 'bicycle' && state.speed > 2 && throttle < 0.05) {
        nextTick -= dt;
        if (nextTick <= 0) {
          tick(ctx, nature, now + 0.01, TICK_LEVEL);
          nextTick = 1 / Math.min(30, state.speed * 0.9);
        }
      }
      // A horse's hooves: the walk's four-beat, the gallop's three and a
      // pause, on the recorded footfalls played low and slow.
      if (state.mode === 'horse' && state.speed > 0.5) {
        nextHoof -= dt;
        if (nextHoof <= 0) {
          const galloping = state.speed > 10;
          const beat = galloping ? hoof % 4 : 0;
          const count = VARIANTS.dirt;
          play(`step-dirt-${Math.floor(Math.random() * count)}`, HOOF_LEVEL * (beat === 3 ? 0 : 1), between(0.62, 0.72));
          hoof++;
          const cycle = galloping ? Math.max(0.36, 9 / state.speed) : Math.max(0.5, 4.5 / state.speed);
          nextHoof = cycle / 4;
        }
      }

      const engine = flying ? PLANE_LEVEL * (0.45 + 0.55 * throttle) : 0;
      follow(plane.gain.gain, engine, now);
      const hum = 68 + 70 * throttle;
      follow(plane.a.frequency, hum, now, 0.6);
      follow(plane.b.frequency, hum * 1.012, now, 0.6);
      follow(plane.filter.frequency, 500 + 1300 * throttle, now, 0.6);

      // Birds by day and crickets by night, on foot in open country only: from
      // the plane or on a town's paving they would be a decoration.
      // And not in the rain, which is when birds shelter.
      const alive = walking && !state.cold ? clamp01(state.wild) * (1 - wet) : 0;
      follow(nature.gain, alive, now, 0.8);
      if (alive > 0.05) {
        nextBirds -= dt;
        if (nextBirds <= 0) {
          if (state.daylight > 0.45) birds(ctx, nature, now + 0.05);
          nextBirds = between(3, 11);
        }
        nextCricket -= dt;
        if (nextCricket <= 0) {
          if (state.daylight < 0.2) cricket(ctx, nature, now + 0.02);
          nextCricket = between(0.25, 0.9);
        }
      }
    },

    step(surface, weight = 1) {
      const count = VARIANTS[surface];
      const pick = Math.floor(Math.random() * count);
      play(`step-${surface}-${pick}`, STEP_LEVEL[surface] * Math.min(1.6, weight), between(0.93, 1.07));
    },

    holdHorn(voice, near) {
      const ctx = context;
      if (ctx === null || master === null) return null;
      const voiced = HELD_CHORDS[voice];
      if (!HORN_HELD[voice] || voiced === undefined) {
        // Struck, not held: once a press, as a real bell rings once a thumb.
        if (near > 0.02) strike(ctx, master, voice, HORN_LEVEL * clamp01(near));
        return { level() {}, release() {} };
      }
      const at = ctx.currentTime + 0.005;
      const env = ctx.createGain();
      const peak = (value: number): number => HORN_LEVEL * voiced.gain * clamp01(value);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(peak(near), at + voiced.attack);
      env.connect(master);
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
    },

    horn(near, voice = 'car') {
      // A tap of the horn, as the traffic gives one: the held voice for a
      // moment, or a struck one once.
      if (near <= 0.02) return;
      const held = audio.holdHorn(voice, near);
      if (held === null || !HORN_HELD[voice]) return;
      setTimeout(() => held.release(), between(280, 420));
    },

    thunder(delay, loudness) {
      const ctx = context;
      if (ctx === null || master === null || rumbleNoise === null || crackNoise === null) return;
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
        crack.connect(high).connect(env).connect(master);
        crack.start(at, Math.random() * 2);
        crack.stop(at + 0.4);
        voices++;
        crack.onended = () => voices--;
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
      roll.connect(low).connect(env).connect(master);
      roll.start(at, Math.random() * 3);
      roll.stop(Math.max(t, at + length) + 1.3);
      voices++;
      roll.onended = () => voices--;
    },

    cue(name) {
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
    },

    get volume() {
      return volume;
    },
    set volume(value: number) {
      volume = clamp01(Number.isFinite(value) ? value : 0.8);
      if (master !== null && context !== null) follow(master.gain, level(), context.currentTime, 0.05);
    },
    get muted() {
      return muted;
    },
    set muted(value: boolean) {
      muted = value;
      if (master !== null && context !== null) follow(master.gain, level(), context.currentTime, 0.05);
    },

    get output() {
      return output;
    },
    get bus() {
      return master;
    },

    get stats() {
      return {
        unlocked: context !== null,
        state: context?.state ?? 'locked',
        loaded,
        voices,
      };
    },
  };
  return audio;
}
