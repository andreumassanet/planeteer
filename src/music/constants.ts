/** The music's levels, voice caps and ranges. */
import type { Role } from '../music-score.ts';

/** The music's level under the world at a volume of 1. */
export const MUSIC_LEVEL = 0.26;
/** Seconds of notes handed to the audio thread ahead of the clock. */
export const LOOKAHEAD = 0.25;
export const MAX_VOICES = 12;
/** The accompaniment, the pads and the drone give way above this. */
export const SUPPORT_VOICES = 10;
/** Seconds a new style has to hold before it counts: a frontier walked along is not two countries. */
export const HOLD = 4;
/** The air's music above this height, units over the ground, and back below the second. */
export const SKY_UP = 300;
export const SKY_DOWN = 150;
/** Sample rates for the rendered notes: strings and bars are dark enough for 24 kHz; the drums' noise wants more. */
export const RENDER_RATE = 24000;
export const DRUM_RATE = 32000;
/** Rendered notes kept, least recently used dropped: about 12 MB at most. */
export const MAX_BUFFERS = 64;
/** The mandolin's and the balalaika's re-strike rate, a second. */
export const TREMOLO_RATE = 11;

export const PAN: Record<Role, number> = { lead: 0.08, answer: -0.14, accomp: -0.28, bass: 0, pad: 0, drone: 0.16, drums: 0.12 };
export const ROLES = Object.keys(PAN) as Role[];
