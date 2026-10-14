/** The lens, the camera's timings and the framings (shots) the stage dollies between. */
import * as THREE from 'three';
import type { PortraitFrame, StageShot } from './types.ts';

/** The lens: narrow, so a figure filling the frame does not get a wide lens's big head. */
export const LENS = 24;
export const TAN = Math.tan(THREE.MathUtils.degToRad(LENS / 2));
/** How far the figure turns towards the pointer on the title, either way, in radians. */
export const LOOK_TURN = 0.75;
/** How fast it follows the pointer there, and how far it sways by itself. */
export const LOOK_LAG = 0.35;
export const SWAY = 0.12;
/** Radians of turn per pixel dragged. */
export const DRAG_TURN = 0.011;
/** Seconds the camera takes to settle on a new framing (a time constant). */
export const DOLLY = 0.3;
/** Seconds between two waves on the title while nobody is doing anything, and the first one's delay. */
export const WAVE_EVERY = 14;
export const WAVE_FIRST = 1.2;
/** How far the head turns towards the pointer, either way, and up or down. */
export const HEAD_YAW = 0.75;
export const HEAD_UP = 0.3;
export const HEAD_DOWN = 0.38;
/** A tile's picture, in device pixels, and how many are kept. */
export const PORTRAIT_SIZE = 128;
export const PORTRAIT_KEEP = 160;
/** The pen in a tile: wider than the world's, as a share of the view, so the line is a pixel or so. */
export const PORTRAIT_INK = 0.017;
/** Over the crown, in units of height: where the plate's point sits. */
export const PLATE_AT = 1.06;
/** Seconds the camera takes to fly out of the bridge's window, and when in them the stage starts to fade. */
export const LEAVE = 1.25;
export const LEAVE_FADE = 0.6;
/** The ship's idle: how far the camera bobs, in units, and rolls, in radians, and how slowly. */
export const BOB = 0.035;
export const ROLL = 0.0035;

/**
 * A framing, in units of the hero's height: where the camera aims, how much
 * of the height either side of that must show, how much of the width, how
 * high the camera rides over the aim (a share of its distance), and which
 * way the creator turns the hero for it (0 faces the camera).
 */
export interface Shot {
  aim: number;
  fill: number;
  width: number;
  elev: number;
  yaw: number;
}

export const SHOTS: Readonly<Record<StageShot, Shot>> = {
  title: { aim: 0.5, fill: 0.62, width: 0.55, elev: 0.14, yaw: 0 },
  full: { aim: 0.5, fill: 0.6, width: 0.5, elev: 0.12, yaw: 0.35 },
  head: { aim: 0.9, fill: 0.135, width: 0.14, elev: 0.03, yaw: 0.3 },
  top: { aim: 0.69, fill: 0.25, width: 0.28, elev: 0.06, yaw: 0.35 },
  legs: { aim: 0.3, fill: 0.3, width: 0.3, elev: 0.1, yaw: 0.5 },
  feet: { aim: 0.07, fill: 0.15, width: 0.24, elev: 0.45, yaw: 0.6 },
  back: { aim: 0.66, fill: 0.34, width: 0.36, elev: 0.12, yaw: Math.PI - 0.55 },
};

/** A tile's framing: the same terms, square. */
export const PORTRAITS: Readonly<Record<PortraitFrame, Omit<Shot, 'width'>>> = {
  body: { aim: 0.5, fill: 0.56, elev: 0.1, yaw: 0.35 },
  head: { aim: 0.9, fill: 0.14, elev: 0.04, yaw: 0.35 },
  top: { aim: 0.68, fill: 0.22, elev: 0.06, yaw: 0.35 },
  bottom: { aim: 0.3, fill: 0.27, elev: 0.1, yaw: 0.45 },
  feet: { aim: 0.06, fill: 0.12, elev: 0.55, yaw: 0.6 },
  pack: { aim: 0.68, fill: 0.25, elev: 0.1, yaw: Math.PI - 0.6 },
};
