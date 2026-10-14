import * as THREE from 'three';
import { toned } from '../models.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';

/** The hero's height: every distance in the room is a share of it. */
export const H = AVATAR_HEIGHT;
/**
 * The space kit draws its architecture and furniture at different scales: the
 * architecture is scaled so a kit door (0.7 units) clears the hero by a
 * sixth, the furniture so a console (0.66 units) stands at the hero's waist.
 */
export const ROOM = (H * 1.17) / 0.7;
export const KIT = H;

/**
 * The room's plan in hero heights, as (x, z) round the walls: a side wall on
 * the left, three faces of window, and the right side wall. The hero stands
 * at the origin facing +z, so the window is behind them; the open side is the
 * camera's. Convex and wound anticlockwise in (x, z).
 */
export const PLAN: readonly (readonly [number, number])[] = [
  [-7, 16],
  [-7, -0.8],
  [-5, -2.2],
  [2.4, -2.2],
  [4.2, -0.8],
  [4.2, 16],
];
/** Which of the plan's edges are window, in order. */
export const WINDOWED = [false, true, true, true, false];
/**
 * Sill, header underside and ceiling, in hero heights. The ceiling is high so
 * the title camera on a tall, narrow screen still sits under it.
 */
export const SILL = 0.34;
export const HEAD = 1.32;
export const CEIL = 2.3;
/** Longest window bay, and mullion width, in hero heights. */
export const BAY = 1.7;
export const MULLION = 0.16;
/** The wall's half thickness, in world units: the kit's wall is 0.3 deep. */
export const WALL_HALF = 0.15 * ROOM;

/** Glow kinds: a screen breathes, an indicator blinks, the holo shimmers. */
export const SCREEN = 0;
export const INDICATOR = 1;
export const HOLO = 2;

/** The kit's slot colours, brought onto the palette. */
export const BASE_PAINT: Readonly<Record<string, THREE.Color>> = {
  'colormap#9ea5c6': toned(PALETTE.bone, 1.06),
  'colormap#6e738a': toned(PALETTE.slate, 0.96),
  'colormap#ffb449': toned(PALETTE.apricot, 1),
  'colormap#ffc044': new THREE.Color(PALETTE.gold),
  'colormap#3d3d44': toned(PALETTE.steel, 0.85),
  'colormap#98bbeb': new THREE.Color(PALETTE.skyBlue),
  'colormap#a0a8c9': toned(PALETTE.bone, 1.1),
  'colormap#dcdce9': new THREE.Color(PALETTE.white),
  metal: toned(PALETTE.bone, 1.08),
  metalDark: toned(PALETTE.slate, 0.9),
  metalRed: new THREE.Color(PALETTE.red),
  dark: toned(PALETTE.steel, 0.8),
};
export const FLOOR_PAINT: Readonly<Record<string, THREE.Color>> = {
  'colormap#9ea5c6': toned(PALETTE.slate, 1.16),
  'colormap#6e738a': toned(PALETTE.slate, 0.74),
};
export const CHAIR_PAINT: Readonly<Record<string, THREE.Color>> = {
  'colormap#ffb449': toned(PALETTE.crimson, 1.05),
  'colormap#9ea5c6': toned(PALETTE.bone, 0.98),
};
export const CRATE_PAINT: Readonly<Record<string, THREE.Color>> = { 'colormap#ffb449': new THREE.Color(PALETTE.orange) };
export const PIPE_PAINT: Readonly<Record<string, THREE.Color>> = {
  'colormap#9ea5c6': toned(PALETTE.steel, 1.25),
  'colormap#ffb449': new THREE.Color(PALETTE.gold),
};

/** Screen colours, picked a console at a time; most are the sky's blue. */
export const SCREEN_COLOURS = [PALETTE.skyBlue, PALETTE.skyBlue, PALETTE.skyBlue, PALETTE.green, PALETTE.apricot];
export const LIGHT_COLOURS = [PALETTE.red, PALETTE.green, PALETTE.gold, PALETTE.skyBlue];

/** A seeded generator, so the room's small choices are the same each visit. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
