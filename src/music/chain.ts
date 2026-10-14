/** The shared graph every piece plays into: compressor, level, room, vibrato and breath noise. */
import { renderImpulse } from '../music-synth.ts';
import { MUSIC_LEVEL } from './constants.ts';

export interface Chain {
  squeeze: DynamicsCompressorNode;
  level: GainNode;
  room: ConvolverNode;
  lfo: OscillatorNode;
  breath: AudioBuffer;
}

/** Builds the chain and connects its end to `output`. `on` and `volume` set the starting level. */
export function createChain(ctx: AudioContext, output: AudioNode, volume: number, on: boolean): Chain {
  // The chain: every piece's bus -> compressor -> level -> the soundscape's limiter.
  const squeeze = ctx.createDynamicsCompressor();
  squeeze.threshold.value = -20;
  squeeze.knee.value = 12;
  squeeze.ratio.value = 3;
  squeeze.attack.value = 0.015;
  squeeze.release.value = 0.3;
  const level = ctx.createGain();
  level.gain.value = on ? volume * MUSIC_LEVEL : 0;
  squeeze.connect(level).connect(output);

  // A room of generated noise, shared by every piece; each piece sends to it at its style's depth.
  const room = ctx.createConvolver();
  room.normalize = false;
  {
    const [left, right] = renderImpulse(2.6, ctx.sampleRate);
    const impulse = ctx.createBuffer(2, left.length, ctx.sampleRate);
    impulse.copyToChannel(left, 0);
    impulse.copyToChannel(right, 1);
    room.buffer = impulse;
  }
  room.connect(squeeze);

  // One vibrato for every wind, and one second of breath they all read from.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  lfo.start();
  const breath = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  {
    const data = breath.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  return { squeeze, level, room, lfo, breath };
}
