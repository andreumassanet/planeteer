/** Sizes, spacings and timings of the orrery, in world units unless a name says otherwise. */
import { PLANET_RADIUS } from '../globe.ts';

export const DEG = Math.PI / 180;
export const R = PLANET_RADIUS;

/** The Sun's drawn radius, in Earth radii: off the real ratio (109), which would swallow Mercury's ring. Three is the largest that leaves Mercury's ring clear of it by more than Mercury itself. */
export const SUN_RADII = 3;

/** How the other planets are sized against Earth: the real radius ratio to this power. 0.35 keeps the giants reading as giants (Jupiter 2.3 Earths, Mercury 0.7) while Saturn's rings still clear the rings either side. */
export const SIZE_POWER = 0.35;

/** Clear sky between one ring's planet and the next, in Earth radii. */
export const RING_GAP = 2.4;

/** Saturn's rings, in Saturn radii: the B ring, the Cassini gap, the A ring. */
export const RINGS_B: readonly [number, number] = [1.42, 1.95];
export const RINGS_A: readonly [number, number] = [2.03, 2.3];

/** The approach to Earth over which the rest of the system fades, as distances from Earth's centre in Earth radii: all there beyond the second, all gone inside the first. */
export const NEAR_EARTH: readonly [number, number] = [5, 10];

/**
 * How far from Earth's centre the Moon is drawn, in Earth radii, on a ring of its own.
 * The real figure (sixty) would put it past Venus's ring; this is far enough that
 * its disc stands clear of Earth's and near enough that it reads as Earth's. The
 * direction is the real one (`moonPosition`).
 */
export const MOON_RADII = 3.6;

/** Faces of a globe held up for its regions to be chosen on it: 20 * (d + 1)^2 = 33,620. The regions are read per pixel (`TINT_WIDTH`), so this is for the ground under them. */
export const HELD_DETAIL = 40;

/** How long a body takes to turn upright once held, seconds: inside the shortest flight down to it. */
export const HOLD_SECONDS = 0.9;

/** How much of a region's own colour a held globe takes over its ground. */
export const REGION_TINT = 0.7;

/** The held globe's region map, texels: one equirectangular canvas, longitude across and latitude down, read per pixel so a frontier is the outline itself. */
export const TINT_WIDTH = 4096;
export const TINT_HEIGHT = 2048;

/** Faces of a planet: `IcosahedronGeometry` detail, 20 * (d + 1)^2 = 5,780, so a planet up close has provinces with edges. */
export const PLANET_DETAIL = 16;
