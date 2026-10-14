/** The synthesised loops: wind, sea, motors, rotor, saucer and rain, built once when the context unlocks. */
import { loop, noiseBuffer } from './synth.ts';

export interface Loops {
  wind: { gain: GainNode; band: BiquadFilterNode };
  sea: { gain: GainNode; foam: GainNode };
  boat: { gain: GainNode; low: OscillatorNode; high: OscillatorNode; filter: BiquadFilterNode };
  plane: { gain: GainNode; a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode; buzz: GainNode };
  rotor: { gain: GainNode; chop: OscillatorNode; whine: GainNode };
  saucer: { gain: GainNode; low: OscillatorNode; high: OscillatorNode; warble: OscillatorNode; depth: GainNode; filter: BiquadFilterNode };
  rain: { hiss: GainNode; drum: GainNode };
  nature: GainNode;
  rumbleNoise: AudioBuffer;
  crackNoise: AudioBuffer;
}

/** Pink noise through a wandering band, so it whistles a little and never sits on one note. */
function buildWind(ctx: AudioContext, out: AudioNode, pink: AudioBuffer): Loops['wind'] {
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 500;
  band.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  loop(ctx, pink).connect(band).connect(gain).connect(out);
  return { gain, band };
}

/** Brown noise under a low-pass is the body of the swell; a narrow band of white noise riding the same envelope is the foam. */
function buildSea(ctx: AudioContext, out: AudioNode, brown: AudioBuffer, white: AudioBuffer): Loops['sea'] {
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
  return { gain, foam };
}

/** A square an octave under a sawtooth, both low-passed, is a small outboard; the pitch and the filter open with the throttle. */
function buildBoat(ctx: AudioContext, out: AudioNode): Loops['boat'] {
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
  return { gain, low: lowOsc, high: highOsc, filter };
}

/** Two detuned sawtooths for the engine and a slow tremolo on the whole for the propeller. */
function buildPlane(ctx: AudioContext, out: AudioNode): Loops['plane'] {
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
  return { gain, a, b, filter, buzz };
}

/** Brown noise under a low-pass, chopped by a slow oscillator on its gain (the blades), with a turbine's thin whine over it. */
function buildRotor(ctx: AudioContext, out: AudioNode, brown: AudioBuffer): Loops['rotor'] {
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
  return { gain, chop, whine };
}

/** Two sines a fifth apart, a hair out of tune so they beat, their pitch wobbled by a slow oscillator, under a soft low-pass. */
function buildSaucer(ctx: AudioContext, out: AudioNode): Loops['saucer'] {
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
  return { gain, low, high, warble, depth, filter };
}

/** A hiss of white noise with its lows cut, the drops, and a softer band of pink under it that only a downpour opens. */
function buildRain(ctx: AudioContext, out: AudioNode, white: AudioBuffer, pink: AudioBuffer): Loops['rain'] {
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
  return { hiss, drum };
}

export function buildLoops(ctx: AudioContext, out: AudioNode): Loops {
  const pink = noiseBuffer(ctx, 'pink', 5);
  const brown = noiseBuffer(ctx, 'brown', 6);
  const white = noiseBuffer(ctx, 'white', 3);
  const wind = buildWind(ctx, out, pink);
  const sea = buildSea(ctx, out, brown, white);
  const boat = buildBoat(ctx, out);
  const plane = buildPlane(ctx, out);
  const rotor = buildRotor(ctx, out, brown);
  const saucer = buildSaucer(ctx, out);
  const nature = ctx.createGain();
  nature.gain.value = 1;
  nature.connect(out);
  const rain = buildRain(ctx, out, white, pink);
  return { wind, sea, boat, plane, rotor, saucer, nature, rain, rumbleNoise: brown, crackNoise: white };
}
