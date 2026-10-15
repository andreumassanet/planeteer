// The sea's numbers. Distances are world units; `PLANET_RADIUS` rules the rest.

import { PLANET_RADIUS, angleForSag } from '../globe.ts';

export const DEG = Math.PI / 180;

/**
 * Sag budget of the water sphere, and the subdivision derived from it. The
 * sphere's vertices sit at exactly `PLANET_RADIUS`, so a face dips this far
 * below sea level at its centre; it must stay well under the lowest ground
 * (`SHORE_LIP`, 4 units). The sphere also carries the depth colour field, and
 * the shallows hand off to it at `SHELF`, so the vertex spacing (221 units at
 * this detail) must be well under that.
 *
 * Nothing displaces the surface: waves would be spent out of the same margin,
 * and in a four-band toon ramp a wave only shows where the normal turns, which
 * on any affordable sphere needs an amplitude taller than the coastal lip. The
 * motion is the surf (`FOAM_REACH`), the waves (`waves.ts`, a normal per
 * pixel) and the glint, all drawn rather than displaced.
 */
export const OCEAN_SAG = 0.4;
export const OCEAN_DETAIL = Math.ceil(63.4349 / (angleForSag(OCEAN_SAG) / DEG)) - 1;

/**
 * How far out from the coast the shallows reach. A real shelf runs 50 to 200 km
 * and a unit is 0.4 km, so 430 is 172 km. From the plane's ceiling that is a
 * 9-pixel fringe round every continent; the shore ramp's 130 would be a hairline.
 */
export const SHELF = 430;

/**
 * Where the water is as dark as it gets, in units from the nearest land. Not a
 * depth (the planet has no bathymetry) but distance from land, which decides
 * most of the open sea's colour anyway. The enclosed seas fall in the pale half
 * of the ramp; only the middle of an ocean is at the dark end.
 */
export const ABYSS = 2600;

/**
 * The widest a quad of the ribbon may be, in either direction. A quad spanning
 * `w` units dips `w^2 / 8R` below the chord between its ends, the ribbon floats
 * only `LIFT_SHELF` over the sphere, and the across and along dips add at the
 * quad's centre, so each gets 0.12 units of the budget.
 */
export const MAX_QUAD = Math.sqrt(8 * PLANET_RADIUS * 0.12);

/** The inner band, which is where the surf is drawn. */
export const SURF_WIDTH = 22;
/** How far inside the coastline the ribbon starts, before the tolerance. */
export const SHORE_INSET = 6;
/** Offset of the packed `aShore.x`, so the inland row is a positive integer (it is at worst -16). */
export const SHORE_BIAS = 32;

/**
 * How high the ribbon floats over the water sphere at the coast and at the
 * shelf edge. It must clear the sphere, and it must resolve a strait: where two
 * coasts' ribbons overlap, the nearer coast's must be the higher or the two
 * opaque sheets tie in depth and flicker. The inner value is capped by the
 * boat, which floats at a fixed `PLANET_RADIUS`.
 */
export const LIFT_COAST = 0.75;
export const LIFT_SHELF = 0.35;

/**
 * The foam, as a distance from the coast: the shortest it pulls back to and how
 * far it runs up. Both swell wavelengths divide `PHASE_WRAP` exactly, so the
 * phase can wrap on a long ring (Antarctica's is 190,000 units) without a step.
 */
export const FOAM_REACH = 3;
export const FOAM_SWING = 11;
/** How much of the water the foam covers where it is strongest; solid foam read as a sandbar. */
export const FOAM_STRENGTH = 0.86;
export const FOAM_WAVELENGTH = 900;
export const FOAM_WAVELENGTH_2 = 500;
export const FOAM_PERIOD = 11;
export const FOAM_PERIOD_2 = 7;
export const PHASE_WRAP = 90000;
/** The two swells' common period (77 s): the clock handed to the shader wraps at it, seamlessly. */
export const FOAM_CYCLE = FOAM_PERIOD * FOAM_PERIOD_2;

/** Cells the ribbon is cut into, so the frustum can discard most of it. */
export const CHUNK_COLS = 16;
export const CHUNK_ROWS = 8;
