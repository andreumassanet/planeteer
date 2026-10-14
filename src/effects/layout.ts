/** Row layouts of the pools' typed arrays: one offset per field, and each row's stride. */

// A puff: position, velocity, the up it rises along, age, life, start and end
// size, when it starts to shrink, colour, glow, drag, rise, and a rotation.
export const P_POS = 0;
export const P_VEL = 3;
export const P_UP = 6;
export const P_AGE = 9;
export const P_LIFE = 10;
export const P_S0 = 11;
export const P_S1 = 12;
export const P_HOLD = 13;
export const P_COLOR = 14;
export const P_GLOW = 17;
export const P_DRAG = 18;
export const P_RISE = 19;
export const P_ROT = 20;
export const P_STRIDE = 29;

// A disc: centre, velocity along the water, its own two axes on the water,
// age, life, start and end radius, how hollow it starts, drag.
export const F_POS = 0;
export const F_VEL = 3;
export const F_E1 = 6;
export const F_E2 = 9;
export const F_AGE = 12;
export const F_LIFE = 13;
export const F_R0 = 14;
export const F_R1 = 15;
export const F_RING = 16;
export const F_DRAG = 17;
export const F_STRIDE = 18;

// A ribbon point: position, velocity along the water, the side the band
// spreads across, age, life, start and end half-width, drag, whether it is
// joined to the point before it, and how it goes (1 hollowing, 0 narrowing).
export const R_POS = 0;
export const R_VEL = 3;
export const R_SIDE = 6;
export const R_AGE = 9;
export const R_LIFE = 10;
export const R_W0 = 11;
export const R_W1 = 12;
export const R_DRAG = 13;
export const R_LINK = 14;
export const R_HOLLOW = 15;
export const R_STRIDE = 16;

// A piece of debris: position, velocity, up, age, life, size, colour, spin
// axis, spin rate, angle, and the ground's radius it bounces on.
export const D_POS = 0;
export const D_VEL = 3;
export const D_UP = 6;
export const D_AGE = 9;
export const D_LIFE = 10;
export const D_SIZE = 11;
export const D_COLOR = 12;
export const D_AXIS = 15;
export const D_SPIN = 18;
export const D_ANGLE = 19;
export const D_FLOOR = 20;
export const D_STRIDE = 21;

// Per emitter, what it carries from frame to frame: a fraction of a puff owed
// (time-based), or the units run since the last point or ball (distance-based).
export const E_EXHAUST = 0;
export const E_DUST = 1;
export const E_SKID = 2;
export const E_SPRAY = 3;
export const E_TRAIL = 4;
export const E_CONTRAIL = 5;
export const E_FLAME = 6;
export const E_RING = 7;
export const E_SWIM = 8;
export const E_TAXI = 9;
export const E_ROOSTER = 10;
export const E_WASH = 11;
export const E_SLOTS = 12;

// A followed vehicle: last position, frame last seen, speed and climb eased,
// and its emitter slots.
export const T_LAST = 0;
export const T_SEEN = 3;
export const T_SPEED = 4;
export const T_CLIMB = 5;
export const T_SLOTS = 6;
export const T_STRIDE = T_SLOTS + E_SLOTS;

/** A followed vehicle's row, its emitter slots as a view made once, and its three ribbons (-1 for none). */
export interface Track {
  row: Float64Array;
  slots: Float64Array;
  ribbons: Int32Array;
}
export function newTrack(): Track {
  const row = new Float64Array(T_STRIDE);
  return { row, slots: row.subarray(T_SLOTS), ribbons: new Int32Array(3).fill(-1) };
}
