/** The audio's mutable state, shared by its parts. */
import type { Loops } from './loops.ts';

export interface Runtime {
  context: AudioContext | null;
  master: GainNode | null;
  /** The low-pass between the limiter and the speakers; see `Soundscape.underwater`. */
  muffle: BiquadFilterNode | null;
  output: { context: AudioContext; node: AudioNode } | null;
  volume: number;
  muted: boolean;
  /** Held silent for a while whatever the settings say: the world building behind a curtain. */
  hushed: boolean;
  loaded: number;
  voices: number;
  loops: Loops | null;
  buffers: Map<string, AudioBuffer>;
}

export function createRuntime(): Runtime {
  return { context: null, master: null, muffle: null, output: null, volume: 0.8, muted: false, hushed: false, loaded: 0, voices: 0, loops: null, buffers: new Map() };
}
