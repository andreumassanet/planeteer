/**
 * The music's struck and plucked instruments, rendered into sample arrays.
 *
 * **A plucked string cannot be an oscillator.** What makes a guitar a guitar
 * is a spectrum that starts bright and darkens as it rings, the high partials
 * dying first, and an oscillator through a closing filter is a synthesiser
 * imitating that. The Karplus–Strong loop *is* it: a burst of noise the length
 * of one period, circulating through a delay and a gentle low-pass, loses its
 * top every trip round exactly as a string does. The same goes for a bar or a
 * bell, whose partials are not harmonics at all — a marimba bar's second mode
 * is near 4x its first, a metallophone's near 2.76x — so those are a handful
 * of decaying sinusoids at the instrument's own ratios.
 *
 * **Rendered, not run live.** Web Audio has no delay short enough for a
 * feedback loop of one period without an `AudioWorklet`, and a worklet is a
 * second file to fetch and a thread per context. So each note is rendered once
 * into a `Float32Array`, at a sample rate chosen for the instrument, and cached
 * by the engine; a note is then one buffer source and one gain. This file is
 * pure arithmetic with no Web Audio in it, so `scripts/check-music.ts` runs
 * every renderer under Node.
 *
 * **Every render is normalised to one peak and ends in silence**: the loudness
 * of a note is the engine's velocity and never an accident of its pitch, and a
 * buffer that stops mid-ring clicks.
 */

/** A string, for the Karplus–Strong loop. */
export interface PluckSpec {
  kind: 'pluck';
  /** Seconds to fall 60 dB at 220 Hz; higher strings ring shorter, as real ones do. */
  t60: number;
  /** 0 dark to 1 bright: the pick's attack, as the low-pass on the noise burst. */
  bright: number;
  /** Where the string is plucked, as a fraction of its length: 0.5 is hollow, 0.1 is nasal. */
  position: number;
  /** The loop filter's weight on the previous sample: 0.5 is the textbook average, less rings brighter. */
  damping: number;
  /** A curved bridge's buzz, 0 for none: the sitar's jawari and the tanpura's. */
  buzz: number;
  /** A one-pole low-pass on the output, in Hz: the body. */
  body: number;
  /** How long the buffer is, in seconds. */
  length: number;
}

/** A bar, a tine, a bell or a gong: decaying sinusoids at the instrument's own ratios. */
export interface ModalSpec {
  kind: 'modal';
  /** `[ratio to the fundamental, amplitude, seconds to fall 60 dB]` a mode. */
  modes: readonly (readonly [number, number, number])[];
  /** Attack in seconds: a mallet is a few milliseconds, a padded gong beater more. */
  attack: number;
  /** A noise click at the strike, as a fraction of the peak: the mallet on the bar. */
  click: number;
  /** A gong's pitch sags as it rings; semitones over the whole length, 0 for a bar. */
  sag: number;
  length: number;
}

/** An unpitched hit: a tuned body, a noise band, or both. */
export interface DrumSpec {
  kind: 'drum';
  /** The body's pitch at the strike and where it settles, in Hz; 0 for no body. */
  from: number;
  to: number;
  /** How fast the pitch settles, in seconds. */
  drop: number;
  /** The body's decay, seconds to fall 60 dB. */
  tone: number;
  /** The noise band's centre and width (Q), and its decay; `noise` is its level against the body. */
  noise: number;
  band: number;
  q: number;
  hiss: number;
  /** Several strikes in one hit a few ms apart, which is a hand clap. */
  flams: number;
  length: number;
}

export type RenderSpec = PluckSpec | ModalSpec | DrumSpec;

/** A seeded noise source, so a render is the same array on every machine. */
function noiseFrom(seed: number): () => number {
  let state = seed | 0 || 0x2545f491;
  return () => {
    // xorshift32: noise, not statistics; it only has to be white enough to excite a string.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2147483648 - 1;
  };
}

/** Scale to one peak and fade the last few milliseconds, so a buffer that ends mid-ring does not click. */
function finish(out: Float32Array<ArrayBuffer>, sampleRate: number, peak = 0.9): Float32Array<ArrayBuffer> {
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]!));
  const scale = max > 0 ? peak / max : 0;
  const fade = Math.min(out.length >> 1, Math.floor(sampleRate * 0.04));
  for (let i = 0; i < out.length; i++) {
    const tail = out.length - i;
    const g = tail < fade ? tail / fade : 1;
    out[i] = out[i]! * scale * g;
  }
  return out;
}

/**
 * One plucked note.
 *
 * The loop is the textbook one with the two refinements every usable version
 * has. **A fractional delay**: a period of 44.1 samples cannot be a delay of
 * 44, or a string at 1 kHz is a quarter-tone flat, so the remainder is a
 * first-order all-pass (Jaffe and Smith, 1983). **A decay independent of
 * pitch**: the loss per trip is set from the time to fall 60 dB, or a low
 * string would ring for ten seconds and a high one for a tenth.
 */
export function renderPluck(spec: PluckSpec, frequency: number, sampleRate: number, seed = 1): Float32Array<ArrayBuffer> {
  const total = Math.max(1, Math.floor(sampleRate * spec.length));
  const out = new Float32Array(total);
  const period = sampleRate / frequency;
  const s = Math.min(0.95, Math.max(0.05, spec.damping));
  let length = Math.floor(period - s);
  let frac = period - s - length;
  if (frac < 0.1) {
    length -= 1;
    frac += 1;
  }
  length = Math.max(2, length);
  const c = (1 - frac) / (1 + frac);
  const t60 = spec.t60 * Math.pow(220 / frequency, 0.35);
  // The loop filter's own loss at the fundamental is already under one; this
  // is the rest of the loss per period, to reach -60 dB at `t60`.
  const rho = Math.pow(0.001, 1 / Math.max(0.05, t60 * frequency));

  // The excitation: a burst of noise, darkened by the pick, and notched where
  // the string was plucked — a comb at `position` of the length is what a
  // finger that far from the bridge does to the partials.
  const line = new Float32Array(length);
  const noise = noiseFrom(seed + Math.round(frequency * 16));
  const pole = 0.05 + 0.9 * (1 - spec.bright);
  let lp = 0;
  for (let i = 0; i < length; i++) {
    lp = lp * pole + noise() * (1 - pole);
    line[i] = lp;
  }
  const notch = Math.max(1, Math.round(spec.position * length));
  const burst = new Float32Array(length);
  let mean = 0;
  for (let i = 0; i < length; i++) {
    burst[i] = line[i]! - (i >= notch ? line[i - notch]! : 0);
    mean += burst[i]!;
  }
  mean /= length;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    line[i] = burst[i]! - mean;
    peak = Math.max(peak, Math.abs(line[i]!));
  }
  if (peak > 0) for (let i = 0; i < length; i++) line[i] = line[i]! / peak;

  let index = 0;
  let previous = 0;
  let apIn = 0;
  let apOut = 0;
  let body = 0;
  const bodyPole = Math.exp((-2 * Math.PI * spec.body) / sampleRate);
  const threshold = 0.35;
  for (let n = 0; n < total; n++) {
    const x = line[index]!;
    const filtered = rho * ((1 - s) * x + s * previous);
    previous = x;
    let y = c * filtered + apIn - c * apOut;
    apIn = filtered;
    apOut = y;
    if (spec.buzz > 0) {
      // The jawari: a string grazing a curved bridge is clipped on one side
      // only, which feeds the upper partials back in on every trip — the
      // sitar's shimmer that brightens where a plain string would darken.
      if (y > threshold) y = threshold + (y - threshold) * (1 - spec.buzz);
    }
    line[index] = y;
    index = index + 1 === length ? 0 : index + 1;
    body = body * bodyPole + x * (1 - bodyPole);
    out[n] = body;
  }
  return finish(out, sampleRate);
}

/** One struck note: modes as recursive sinusoids, each with its own decay. */
export function renderModal(spec: ModalSpec, frequency: number, sampleRate: number, seed = 1): Float32Array<ArrayBuffer> {
  const total = Math.max(1, Math.floor(sampleRate * spec.length));
  const out = new Float32Array(total);
  const nyquist = sampleRate * 0.45;
  const sagPerSample = spec.sag === 0 ? 0 : spec.sag / total;
  for (const [ratio, amplitude, t60] of spec.modes) {
    const f0 = frequency * ratio;
    if (f0 >= nyquist) continue;
    const decay = Math.pow(0.001, 1 / Math.max(1, t60 * sampleRate));
    if (sagPerSample === 0) {
      // y[n] = 2 cos(w) y[n-1] - y[n-2]: a sine for two multiplies a sample.
      const w = (2 * Math.PI * f0) / sampleRate;
      const k = 2 * Math.cos(w);
      let y1 = Math.sin(-w);
      let y2 = Math.sin(-2 * w);
      let env = amplitude;
      for (let n = 0; n < total; n++) {
        const y = k * y1 - y2;
        y2 = y1;
        y1 = y;
        out[n] = out[n]! + y * env;
        env *= decay;
      }
    } else {
      let phase = 0;
      let env = amplitude;
      // The pitch falls by a fixed ratio a sample: one power, not one a sample.
      const sag = Math.pow(2, -sagPerSample / 12);
      let f = f0;
      for (let n = 0; n < total; n++) {
        phase += (2 * Math.PI * f) / sampleRate;
        f *= sag;
        out[n] = out[n]! + Math.sin(phase) * env;
        env *= decay;
      }
    }
  }
  // The attack and the mallet's click.
  const attack = Math.max(1, Math.floor(spec.attack * sampleRate));
  const noise = noiseFrom(seed + 77);
  const clickLength = Math.floor(sampleRate * 0.012);
  let peak = 0;
  for (let n = 0; n < Math.min(total, 2048); n++) peak = Math.max(peak, Math.abs(out[n]!));
  for (let n = 0; n < total; n++) {
    if (n < attack) out[n] = out[n]! * (n / attack);
    if (n < clickLength && spec.click > 0) out[n] = out[n]! + noise() * spec.click * peak * (1 - n / clickLength);
  }
  return finish(out, sampleRate);
}

/** A band-pass biquad's coefficients (RBJ), for the drums' noise. */
function bandpass(centre: number, q: number, sampleRate: number): [number, number, number, number, number] {
  const w = (2 * Math.PI * Math.min(centre, sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  return [alpha / a0, 0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
}

/** One drum hit: a body whose pitch falls, and a band of noise. */
export function renderDrum(spec: DrumSpec, sampleRate: number, seed = 1): Float32Array<ArrayBuffer> {
  const total = Math.max(1, Math.floor(sampleRate * spec.length));
  const out = new Float32Array(total);
  const noise = noiseFrom(seed + 991);
  const flams = Math.max(1, spec.flams);
  const gap = Math.floor(sampleRate * 0.009);
  if (spec.from > 0) {
    let phase = 0;
    const decay = Math.pow(0.001, 1 / Math.max(1, spec.tone * sampleRate));
    let env = 1;
    for (let n = 0; n < total; n++) {
      const t = n / sampleRate;
      const f = spec.to + (spec.from - spec.to) * Math.exp(-t / Math.max(0.001, spec.drop));
      phase += (2 * Math.PI * f) / sampleRate;
      out[n] = Math.sin(phase) * env;
      env *= decay;
    }
  }
  if (spec.noise > 0) {
    const [b0, b1, b2, a1, a2] = bandpass(spec.band, spec.q, sampleRate);
    const decay = Math.pow(0.001, 1 / Math.max(1, spec.hiss * sampleRate));
    for (let f = 0; f < flams; f++) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      let env = f === flams - 1 ? 1 : 0.6;
      for (let n = f * gap; n < total; n++) {
        const x = noise();
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        out[n] = out[n]! + y * env * spec.noise * 3;
        env *= decay;
        if (f < flams - 1 && n > (f + 1) * gap) env *= 0.9;
      }
    }
  }
  const attack = Math.floor(sampleRate * 0.0015);
  for (let n = 0; n < Math.min(total, attack); n++) out[n] = out[n]! * (n / attack);
  return finish(out, sampleRate, 0.85);
}

/** Whichever renderer a spec wants; `frequency` is ignored by a drum. */
export function render(spec: RenderSpec, frequency: number, sampleRate: number, seed = 1): Float32Array<ArrayBuffer> {
  if (spec.kind === 'pluck') return renderPluck(spec, frequency, sampleRate, seed);
  if (spec.kind === 'modal') return renderModal(spec, frequency, sampleRate, seed);
  return renderDrum(spec, sampleRate, seed);
}

/**
 * A room, as an impulse: two channels of decaying noise, darkening as they
 * decay because air and walls take the top first, with a few milliseconds of
 * silence ahead of it so the dry note is heard before its room.
 */
export function renderImpulse(seconds: number, sampleRate: number, seed = 5): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const total = Math.floor(seconds * sampleRate);
  const pre = Math.floor(0.012 * sampleRate);
  const channels: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(total), new Float32Array(total)];
  for (let c = 0; c < 2; c++) {
    const noise = noiseFrom(seed + c * 131);
    const data = channels[c]!;
    let lp = 0;
    for (let n = pre; n < total; n++) {
      const t = (n - pre) / (total - pre);
      const env = Math.pow(1 - t, 2.2) * Math.exp(-t * 3);
      // The low-pass closes as the tail goes on: bright early reflections, a dark tail.
      const pole = 0.1 + 0.8 * t;
      lp = lp * pole + noise() * (1 - pole);
      data[n] = lp * env;
    }
    let energy = 0;
    for (let n = 0; n < total; n++) energy += data[n]! * data[n]!;
    const scale = energy > 0 ? 1 / Math.sqrt(energy) : 0;
    // Unit energy: noise through it comes out at the level it went in, so a
    // style's send is its wet level.
    for (let n = 0; n < total; n++) data[n] = data[n]! * scale;
  }
  return channels;
}
