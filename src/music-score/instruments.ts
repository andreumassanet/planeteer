/** The instruments: how each voice is synthesised. */
import type { ModalSpec, PluckSpec, DrumSpec } from '../music-synth.ts';

/** A breath through a tube: a sine, a little triangle for the edge, and band-passed noise for the air. */
export interface WindSpec {
  kind: 'wind';
  /** The air's level against the tone. */
  breath: number;
  /** Vibrato depth in cents, arriving after the note has settled. */
  vibrato: number;
  /** The triangle's level: the reed or the membrane's buzz. */
  edge: number;
  attack: number;
  release: number;
}

/** A held chord: two detuned oscillators under a low-pass, slow in and slower out. */
export interface PadSpec {
  kind: 'pad';
  detune: number;
  cutoff: number;
  attack: number;
  release: number;
  /** An octave of sine on top, for the high airy pad. */
  air: boolean;
}

export interface Instrument {
  sound: PluckSpec | ModalSpec | DrumSpec | WindSpec | PadSpec;
  /** Its level against the others, before the note's velocity. */
  gain: number;
  /** Seconds a note may ring past its written length before it is damped. */
  ring: number;
}

const pluck = (t60: number, bright: number, position: number, damping: number, body: number, length: number, buzz = 0): PluckSpec => ({
  kind: 'pluck', t60, bright, position, damping, buzz, body, length,
});
const drum = (from: number, to: number, drop: number, tone: number, noise: number, band: number, q: number, hiss: number, length: number, flams = 1): DrumSpec => ({
  kind: 'drum', from, to, drop, tone, noise, band, q, hiss, flams, length,
});
const wind = (breath: number, vibrato: number, edge: number, attack: number, release: number): WindSpec => ({
  kind: 'wind', breath, vibrato, edge, attack, release,
});

export const INSTRUMENTS = {
  // Strings, plucked: the Karplus–Strong loop in `music-synth.ts`.
  guitar: { sound: pluck(3, 0.55, 0.18, 0.5, 3200, 2.4), gain: 0.5, ring: 0.35 },
  steel: { sound: pluck(3.4, 0.78, 0.13, 0.46, 5200, 2.6), gain: 0.42, ring: 0.35 },
  harp: { sound: pluck(4, 0.45, 0.3, 0.5, 3800, 3), gain: 0.42, ring: 0.7 },
  kantele: { sound: pluck(3.2, 0.7, 0.21, 0.48, 5500, 2.8), gain: 0.4, ring: 1 },
  balalaika: { sound: pluck(1.1, 0.82, 0.1, 0.45, 5200, 1.2), gain: 0.42, ring: 0.2 },
  mandolin: { sound: pluck(0.9, 0.85, 0.12, 0.45, 6000, 1.1), gain: 0.4, ring: 0.2 },
  oud: { sound: pluck(1.8, 0.5, 0.22, 0.55, 2200, 1.8), gain: 0.56, ring: 0.3 },
  qanun: { sound: pluck(2, 0.75, 0.15, 0.47, 5500, 2), gain: 0.36, ring: 0.5 },
  santur: { sound: pluck(2.2, 0.9, 0.1, 0.45, 7000, 2), gain: 0.32, ring: 0.6 },
  sitar: { sound: pluck(3.5, 0.8, 0.1, 0.45, 5000, 3.2, 0.6), gain: 0.4, ring: 0.6 },
  tanpura: { sound: pluck(5, 0.6, 0.2, 0.47, 3500, 4, 0.5), gain: 0.24, ring: 1.6 },
  koto: { sound: pluck(2.4, 0.7, 0.15, 0.47, 5000, 2.4), gain: 0.42, ring: 0.9 },
  guzheng: { sound: pluck(3, 0.72, 0.14, 0.47, 5000, 2.8), gain: 0.4, ring: 0.9 },
  charango: { sound: pluck(1, 0.85, 0.12, 0.45, 6500, 1.1), gain: 0.34, ring: 0.2 },
  ukulele: { sound: pluck(1.2, 0.65, 0.2, 0.5, 4000, 1.3), gain: 0.38, ring: 0.2 },
  bass: { sound: pluck(2.5, 0.3, 0.25, 0.55, 900, 2), gain: 0.6, ring: 0.2 },

  // Bars, tines, bells and gongs: decaying modes at each instrument's own ratios.
  kalimba: { sound: { kind: 'modal', modes: [[1, 1, 1.4], [5.9, 0.22, 0.25], [12.3, 0.06, 0.1]], attack: 0.002, click: 0.15, sag: 0, length: 1.6 }, gain: 0.34, ring: 0.8 },
  marimba: { sound: { kind: 'modal', modes: [[1, 1, 0.9], [3.93, 0.3, 0.25], [9.2, 0.08, 0.08]], attack: 0.002, click: 0.25, sag: 0, length: 1.3 }, gain: 0.42, ring: 0.6 },
  saron: { sound: { kind: 'modal', modes: [[1, 1, 3.5], [2.76, 0.35, 1.4], [5.4, 0.18, 0.6], [8.93, 0.06, 0.3]], attack: 0.003, click: 0.1, sag: 0, length: 3.5 }, gain: 0.3, ring: 0.4 },
  bonang: { sound: { kind: 'modal', modes: [[1, 1, 1.8], [2.02, 0.3, 0.9], [3.01, 0.12, 0.4], [4.1, 0.08, 0.25]], attack: 0.004, click: 0.08, sag: 0, length: 2.2 }, gain: 0.26, ring: 0.3 },
  bell: { sound: { kind: 'modal', modes: [[0.5, 0.25, 4], [1, 1, 4], [2, 0.45, 2.5], [2.76, 0.28, 1.6], [5.4, 0.12, 0.8]], attack: 0.002, click: 0.04, sag: 0, length: 4.5 }, gain: 0.22, ring: 4 },
  gong: { sound: { kind: 'modal', modes: [[1, 1, 6], [1.004, 0.7, 6], [2.01, 0.3, 3], [2.93, 0.18, 2]], attack: 0.02, click: 0, sag: 0.3, length: 6 }, gain: 0.5, ring: 6 },

  // Drums: a falling body and a band of noise.
  doum: { sound: drum(150, 85, 0.03, 0.5, 0.15, 400, 0.8, 0.06, 0.7), gain: 0.38, ring: 1 },
  tek: { sound: drum(700, 650, 0.01, 0.06, 0.8, 3200, 1.5, 0.06, 0.2), gain: 0.26, ring: 1 },
  kick: { sound: drum(120, 52, 0.04, 0.45, 0.05, 300, 1, 0.02, 0.6), gain: 0.3, ring: 1 },
  shaker: { sound: drum(0, 0, 0.01, 0.01, 1, 7000, 1.2, 0.05, 0.12, 2), gain: 0.1, ring: 1 },
  rim: { sound: drum(1700, 1650, 0.01, 0.04, 0.3, 2500, 3, 0.02, 0.12), gain: 0.18, ring: 1 },
  clap: { sound: drum(0, 0, 0.01, 0.01, 1, 1400, 1.1, 0.09, 0.25, 3), gain: 0.22, ring: 1 },
  cajon: { sound: drum(110, 70, 0.03, 0.25, 0.3, 900, 0.7, 0.05, 0.4), gain: 0.32, ring: 1 },
  slap: { sound: drum(300, 250, 0.01, 0.08, 0.9, 2200, 0.8, 0.08, 0.25), gain: 0.26, ring: 1 },
  bongo: { sound: drum(420, 380, 0.02, 0.14, 0.1, 2000, 1, 0.02, 0.3), gain: 0.26, ring: 1 },
  bombo: { sound: drum(90, 55, 0.05, 0.5, 0.25, 600, 0.6, 0.08, 0.7), gain: 0.34, ring: 1 },
  djembe: { sound: drum(110, 72, 0.03, 0.35, 0.2, 800, 0.7, 0.05, 0.5), gain: 0.32, ring: 1 },
  agogo: { sound: drum(1400, 1400, 0.01, 0.3, 0.05, 3000, 2, 0.02, 0.4), gain: 0.12, ring: 1 },
  woodblock: { sound: drum(900, 880, 0.01, 0.08, 0.2, 1800, 4, 0.015, 0.2), gain: 0.18, ring: 1 },
  brush: { sound: drum(0, 0, 0.01, 0.01, 1, 3500, 0.5, 0.14, 0.3), gain: 0.12, ring: 1 },
  frame: { sound: drum(110, 80, 0.04, 0.3, 0.25, 700, 0.6, 0.05, 0.5), gain: 0.3, ring: 1 },
  kendhang: { sound: drum(180, 120, 0.03, 0.22, 0.2, 1200, 0.8, 0.04, 0.4), gain: 0.3, ring: 1 },
  'tabla-ge': { sound: drum(75, 110, 0.12, 0.6, 0.05, 300, 0.8, 0.03, 0.8), gain: 0.32, ring: 1 },
  'tabla-na': { sound: { kind: 'modal', modes: [[1, 1, 0.5], [2, 0.6, 0.35], [3, 0.4, 0.25], [4, 0.25, 0.18]], attack: 0.001, click: 0.3, sag: 0, length: 0.6 }, gain: 0.3, ring: 1 },

  // Breath and held chords: live oscillators in the engine.
  flute: { sound: wind(0.1, 14, 0.12, 0.07, 0.25), gain: 0.2, ring: 0 },
  panflute: { sound: wind(0.28, 6, 0.25, 0.05, 0.35), gain: 0.2, ring: 0 },
  ney: { sound: wind(0.34, 18, 0.08, 0.12, 0.4), gain: 0.2, ring: 0 },
  shakuhachi: { sound: wind(0.4, 10, 0.1, 0.14, 0.45), gain: 0.2, ring: 0 },
  dizi: { sound: wind(0.16, 20, 0.3, 0.05, 0.25), gain: 0.17, ring: 0 },
  pad: { sound: { kind: 'pad', detune: 7, cutoff: 900, attack: 1.6, release: 2.5, air: false }, gain: 0.07, ring: 0 },
  airpad: { sound: { kind: 'pad', detune: 10, cutoff: 2200, attack: 2.5, release: 3.5, air: true }, gain: 0.06, ring: 0 },
  drone: { sound: { kind: 'pad', detune: 4, cutoff: 600, attack: 2, release: 3, air: false }, gain: 0.06, ring: 0 },
} satisfies Record<string, Instrument>;

export type InstrumentId = keyof typeof INSTRUMENTS;
