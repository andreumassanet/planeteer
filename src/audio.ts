/**
 * What the world sounds like: the wind, the sea, the engines, birds by day
 * and crickets by night, the footsteps, and the few cues that mark an event.
 *
 * **The loops are synthesised and the one-shots are recorded**, and the split
 * is the same one the models made. A loop here has to follow a number every
 * frame — the altitude, the speed, how much of the view is sea, the hour — and
 * a recording of wind at one speed is a recording of wind at one speed: it
 * either repeats where you can hear the seam or it costs megabytes. Filtered
 * noise follows any number for free. A footstep, a click and a jingle are the
 * opposite case, where a microphone beats any oscillator, so those are
 * Kenney's CC0 recordings, baked by `scripts/build-audio.mjs` (79 KB for all
 * 26, fetched only after the first click and never in the first load).
 *
 * **Nothing makes a sound until a gesture unlocks it**, which is the browser's
 * rule and also this project's: the menu is silent, and the first click that
 * starts the world is the one that opens the context. Before that `update`
 * returns at once, so the loop pays nothing for a player who never clicks.
 *
 * **The mix is one number per voice, here, and never in the bake.** Every
 * recording is levelled to the same peak by the bake so that re-baking cannot
 * move the balance; the balance is `GAIN` and the `*_LEVEL` constants below.
 * They were set by reading the synthesis rather than by ear, and a player's ear
 * is the review they still need.
 */

export type Surface = 'grass' | 'paving' | 'snow' | 'dirt';

export type Cue =
  | 'landmark'
  | 'frontier'
  | 'land'
  | 'ui-click'
  | 'ui-open'
  | 'ui-close'
  | 'ui-toggle'
  | 'ui-error'
  | 'ui-confirm';

/** What the world is doing this frame, as far as the ear cares. */
export interface Soundscape {
  /**
   * What the player is doing, which is what decides the engine: a car's is the
   * launch's outboard loop pitched up and opened out, a balloon has none, and a
   * swimmer hears the sea and the wind and nothing else.
   */
  mode: 'menu' | 'foot' | 'swim' | 'car' | 'boat' | 'plane' | 'balloon';
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
}

export interface Audio {
  /** Call from a user gesture: opens the context and starts fetching the recordings. */
  unlock(): void;
  /** Every frame. A no-op until `unlock`. */
  update(dt: number, state: Soundscape): void;
  /** One footfall on this surface; `weight` 1 is a walk, more is a run or a landing. */
  step(surface: Surface, weight?: number): void;
  cue(name: Cue): void;
  /** 0 to 1, a linear gain on the master; the slider that sets it is logarithmic. */
  volume: number;
  muted: boolean;
  readonly stats: {
    unlocked: boolean;
    state: string;
    loaded: number;
    voices: number;
  };
}

/** The recordings, by the names `build-audio.mjs` publishes. */
const VARIANTS: Record<Surface, number> = { grass: 4, paving: 4, snow: 4, dirt: 4 };
const ONE_SHOTS: Cue[] = ['landmark', 'frontier', 'ui-click', 'ui-open', 'ui-close', 'ui-toggle', 'ui-error', 'ui-confirm'];
const LANDINGS = 2;

/**
 * Each cue's level against the others. The jingles are the loudest thing in the
 * world on purpose — finding a landmark is the event the game is built around —
 * and the frontier is half of it, because from the plane you cross one every
 * few seconds.
 */
const GAIN: Record<Cue, number> = {
  landmark: 0.5,
  frontier: 0.22,
  land: 0.32,
  'ui-click': 0.18,
  'ui-open': 0.22,
  'ui-close': 0.22,
  'ui-toggle': 0.2,
  'ui-error': 0.24,
  'ui-confirm': 0.24,
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
const BIRD_LEVEL = 0.05;
const CRICKET_LEVEL = 0.025;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const between = (a: number, b: number): number => a + Math.random() * (b - a);

export function createAudio(): Audio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
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
  let nature: GainNode | null = null;

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

    nature = ctx.createGain();
    nature.gain.value = 1;
    nature.connect(out);
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
      // A gentle compressor on the master, so a jingle over the engine at full
      // throttle does not clip on a laptop's speakers.
      const squeeze = ctx.createDynamicsCompressor();
      squeeze.threshold.value = -14;
      squeeze.ratio.value = 3;
      squeeze.attack.value = 0.01;
      squeeze.release.value = 0.25;
      squeeze.connect(ctx.destination);
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
      if (ctx === null || wind === null || sea === null || boat === null || plane === null || nature === null) return;
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const flying = state.mode === 'plane';
      const sailing = state.mode === 'boat';
      const driving = state.mode === 'car';
      const drifting = state.mode === 'balloon';
      const walking = state.mode === 'foot';
      const menu = state.mode === 'menu';
      const throttle = clamp01(state.throttle);

      // Gusts: a new target every few seconds, approached slowly.
      gustClock -= dt;
      if (gustClock <= 0) {
        gustTarget = between(0.25, 1);
        gustClock = between(2.5, 6);
      }
      gust += (gustTarget - gust) * clamp01(dt * 0.6);

      const high = clamp01(state.height / 400);
      const windLevel = menu
        ? 0
        : flying
          ? WIND_LEVEL * (1.1 + 1.4 * throttle + 0.6 * high)
          : sailing || drifting
            ? WIND_LEVEL * (0.8 + 0.6 * throttle + 0.6 * (drifting ? high : 0))
            : WIND_LEVEL * (0.45 + 0.9 * clamp01(state.height / 60));
      follow(wind.gain.gain, windLevel * (0.55 + 0.45 * gust), now);
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
      follow(sea.foam.gain, SEA_LEVEL * 0.18 * seaNear * shaped * shaped, now, 0.15);

      // One loop for both motors on the ground and the water: the launch's
      // outboard, and a car's engine, which is the same square an octave under
      // a sawtooth pitched up and let through a wider filter.
      const motor = sailing
        ? BOAT_LEVEL * (0.35 + 0.65 * throttle)
        : driving
          ? CAR_LEVEL * (0.3 + 0.7 * throttle)
          : 0;
      follow(boat.gain.gain, motor, now);
      const putt = driving ? 42 + 70 * throttle : 30 + 26 * throttle;
      follow(boat.low.frequency, putt, now);
      follow(boat.high.frequency, putt * 2, now);
      follow(boat.filter.frequency, driving ? 320 + 900 * throttle : 220 + 480 * throttle, now);

      const engine = flying ? PLANE_LEVEL * (0.45 + 0.55 * throttle) : 0;
      follow(plane.gain.gain, engine, now);
      const hum = 68 + 70 * throttle;
      follow(plane.a.frequency, hum, now, 0.6);
      follow(plane.b.frequency, hum * 1.012, now, 0.6);
      follow(plane.filter.frequency, 500 + 1300 * throttle, now, 0.6);

      // Birds by day and crickets by night, on foot in open country only: from
      // the plane or on a town's paving they would be a decoration.
      const alive = walking && !state.cold ? clamp01(state.wild) : 0;
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

    cue(name) {
      if (name === 'land') {
        play(`land-${Math.floor(Math.random() * LANDINGS)}`, GAIN.land, between(0.95, 1.05));
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
