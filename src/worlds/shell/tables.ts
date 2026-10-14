/** Craft kinds of the walked worlds as the HUD, the passport, the sound and the music say them: Earth's nearest kind. */

import type { VehicleKind } from '../contract.ts';
import type { TravelMode } from '../../controls.ts';
import type { StampMode } from '../../passport.ts';
import type { Soundscape } from '../../audio.ts';
import type { MusicMoment } from '../../music.ts';
import type { StyleId } from '../../music-score.ts';
import type { IconName } from '../../ui.ts';

/** A craft of the walked worlds as the HUD, the passport and the player list say it: Earth's nearest kind. */
export const MODE_OF: Readonly<Record<VehicleKind, TravelMode & StampMode>> = {
  rover: 'car',
  lander: 'plane',
  aerostat: 'balloon',
  // What hovers and turns on the spot: Earth's helicopter, aloft or down.
  ufo: 'helicopter',
};
export const ICON_OF: Readonly<Record<VehicleKind, IconName>> = {
  rover: 'car',
  lander: 'plane',
  aerostat: 'balloon',
  ufo: 'orbit',
};
/** What each craft sounds like through Earth's mix (`Soundscape.mode`). */
export const SOUND_OF: Readonly<Record<VehicleKind, Soundscape['mode']>> = {
  rover: 'car',
  lander: 'plane',
  aerostat: 'balloon',
  ufo: 'saucer',
};
/**
 * Which of Earth's music styles each world is played in: none has Earth's
 * countries to choose one by, so it is chosen by what the world is. A world
 * not listed plays the sky's.
 */
export const MUSIC_STYLE: Readonly<Record<string, StyleId>> = {
  mercury: 'sky',
  venus: 'sea',
  moon: 'polar',
  mars: 'sky',
  jupiter: 'sea',
  saturn: 'polar',
  uranus: 'polar',
  neptune: 'sea',
};
/** And what the music takes the craft for, as Earth's `MUSIC_OF`: on the road, at sea, or in the sky. */
export const MUSIC_OF: Readonly<Record<VehicleKind, MusicMoment['mode']>> = {
  rover: 'car',
  lander: 'plane',
  aerostat: 'balloon',
  ufo: 'plane',
};

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
