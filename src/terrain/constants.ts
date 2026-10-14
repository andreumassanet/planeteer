// The relief's numbers. Heights are world units above the ring's shelf; angles
// and frequencies are in radians of the unit sphere unless noted.

export const DEG = Math.PI / 180;

/**
 * Ceiling on the relief. A hard clamp, so `PLANET_RADIUS + LAND_HEIGHT +
 * MAX_RELIEF` is a bound the mesh check can assert. Real relief against Earth's
 * radius would be invisible; this is a caricature, tall enough that the
 * Himalaya reads as a range from orbit while still being a climb you can run.
 */
export const MAX_RELIEF = 680;

/** Rolling swell over every continental interior, before any mountains. */
export const SWELL_HEIGHT = 46;
export const SWELL_FREQUENCY = 2.4;

/**
 * The downs: the scale of relief between the swell and the ranges, which keeps
 * country you walk in from being a table.
 *
 * - Ridged rather than `fbm`: the light is a four-band ramp and a band only
 *   steps where the normal turns, so smooth swells read as flat and creases
 *   read as terrain.
 * - Zero-mean (`DOWNS_MEAN`): `biome.ts` reads relief as temperature, so lifting
 *   the whole land would move every treeline and snowline.
 * - Two octaves at 24: the finest cell stays coarser than `RELIEF_DETAIL`, so
 *   the mesh's edge limit does not move.
 */
export const DOWNS_HEIGHT = 45;
export const DOWNS_FREQUENCY = 24;
export const DOWNS_OCTAVES = 2;
/** Measured mean of `ridged` at this frequency and octave count. */
export const DOWNS_MEAN = 0.48;
/** The downs in flat country, as a fraction of their height in high country. */
export const DOWNS_LOW = 0.55;

/** How much of a range's height is the massif it stands on rather than its ridges. */
export const MASSIF_FLOOR = 0.38;

/** Height of the ranges the noise raises on its own, away from the named ones. */
export const NOISE_RANGE_HEIGHT = 150;
export const RIDGE_FREQUENCY = 7.5;
export const RIDGE_OCTAVES = 5;

/**
 * Size of the finest cell this relief can build, radians of arc. The mesh caps
 * its edge length with it: a triangle longer than a cell of the last octave can
 * span a ridge without any corner noticing.
 */
export const RELIEF_DETAIL = 1 / (RIDGE_FREQUENCY * 2 ** (RIDGE_OCTAVES - 1));

/**
 * How far inland the relief takes to reach full height, degrees. Measured from
 * the water, it gives every landmass a coastal plain and keeps islands narrower
 * than this flat with no special case.
 */
export const SHORE_SPAN = 1.1;

/**
 * Land kept above the water at the very edge of the shore, world units. It
 * cannot go to zero: the boat's sea-level epsilon, the ocean sphere's sag and the
 * mesh's relief sag all sit under it, and the lowest ground must stay
 * unambiguously land.
 */
export const SHORE_LIP = 4;

/**
 * The shelf every ring stands on: `LAND_HEIGHT` in `geo.ts`, copied because
 * `geo.ts` imports this module (the cycle would leave it in its temporal dead
 * zone). `pnpm check` asserts the two agree.
 */
export const LAND_SHELF = 20;

/**
 * The widest and narrowest a shore ever gets, world units. The wide end is what
 * the transition has to be to read as one; the narrow end is a floor because the
 * mesh cannot resolve a drop in less than its minimum edge.
 */
export const SHORE_RAMP = 130;
export const SHORE_BLUFF = 26;

/** Scale of the bays, in radians of the unit sphere. */
export const SHORE_BAY_FREQUENCY = 7;

/** How far off a boundary segment the sea is asked about, world units. */
export const SHORE_PROBE = 8;

/** Cells of the coarse land/sea mask, degrees. */
export const COAST_CELL = 0.5;
export const COAST_COLS = Math.round(360 / COAST_CELL);
export const COAST_ROWS = Math.round(180 / COAST_CELL);

/** Cells of the coarse grid that buckets pads, detail sites and valleys, degrees. */
export const SITE_CELL = 4;
export const SITE_COLS = Math.round(360 / SITE_CELL);
export const SITE_ROWS = Math.round(180 / SITE_CELL);
