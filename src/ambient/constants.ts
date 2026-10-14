/** Tuning for the small life: grid sizes, ranges, caps, and who lives in which biome. */
import { PLANET_RADIUS } from '../globe.ts';
import type { BiomeId } from '../biome.ts';


/** A small cell's side, in units: the insects, the leaves and the fish. */
export const CELL = 16;
/** A gull cell's side: a harbour's worth of sky. */
export const GULL_CELL = 90;
/** How far from the player the small cells are kept, and where they start to fade. */
export const RANGE = 64;
export const FADE_FROM = 46;
export const GULL_RANGE = 260;
/** Seconds a newly worked-out cell takes to fade in. */
export const FADE_IN = 1.2;
/** The camera this far over the ground sees none of it, and it fades from `HIGH_FADE`. */
export const HIGH = 160;
export const HIGH_FADE = 90;
export const GULL_HIGH = 700;
/** Rescan after this much walking, or this long standing. */
export const RESCAN_MOVE = 4;
export const RESCAN_EVERY = 0.5;
export const WEATHER_EVERY = 0.5;
/** Past this latitude nothing here lives, and the columns are too narrow to be worth cutting. */
export const POLAR = 78;
/** The cache is forgotten past this many cells, keeping those in range. */
export const CACHE_CAP = 3000;

export const DEG = Math.PI / 180;


/** How likely a small cell is to hold fireflies, by biome; the rest hold none. */
export const FIREFLY: Partial<Record<BiomeId, number>> = { tropical: 0.7, temperate: 0.45, grassland: 0.3, savanna: 0.35, boreal: 0.2 };
/** And butterflies, outside a meadow; a meadow always has them. */
export const BUTTERFLY: Partial<Record<BiomeId, number>> = { temperate: 0.22, grassland: 0.25, savanna: 0.2, tropical: 0.3 };
/** And pollen in the sun. */
export const MOTE: Partial<Record<BiomeId, number>> = { temperate: 0.5, grassland: 0.6, savanna: 0.3, steppe: 0.25, tropical: 0.35 };
/** Ground points per small cell that the creatures in it circle. */
export const ANCHORS = 6;
/** Units to the water inside which a cell is waterside: wetter for fireflies, and fish off it. */
export const WATERSIDE = 60;
/** How near the coast a gull cell has to be. */
export const GULL_COAST = 140;

/** The seeds' third argument: a kind and a creature's number in its cell. */
export const K_FIREFLY = 0;
export const K_BUTTERFLY = 64;
export const K_MOTE = 128;
export const K_LEAF = 192;
export const K_FISH = 256;
export const K_GULL = 320;
export const K_CELL = 384;
export const K_ANCHOR = 448;
export const K_LITTER = 512;

// --- the creatures' own numbers

export const MAX_FIREFLIES = 150;
export const MAX_MOTES = 70;
export const MAX_POINTS = MAX_FIREFLIES + MAX_MOTES;
export const MAX_BUTTERFLIES = 24;
/** Leaves in the air and lying, together. */
export const MAX_LEAVES = 360;
export const MAX_FISH = 4;
export const MAX_GULLS = 8;

/** Half a butterfly's span, and its body's half length, in units. */
export const WING = 0.19;
export const WING_BODY = 0.08;
/** Half a leaf's length: eight centimetres at the figure's stature, and drawn a little over. */
export const LEAF_SIZE = 0.19;

// --- the leaves off the crowns

/** How far round the player crowns are asked for: the litter's reach; it fades over the last `LITTER_FADE`. */
export const LITTER_RANGE = 96;
export const LITTER_FADE = 28;
/** And the falling leaves', inside it, fading from `LEAF_FADE_FROM`. */
export const LEAF_RANGE = 70;
export const LEAF_FADE_FROM = 52;
/** The crowns kept in range, nearest first. */
export const MAX_CROWNS = 420;
/** New crowns a scan may take in, each a ground height; the rest wait for the next scan. */
export const CROWN_ADMIT = 90;
/** Leaves a crown lets go of, each on its own clock. */
export const LEAF_SLOTS = 6;
/**
 * Leaves in the air at once under a crown of a species that sheds outright
 * (`SHED` 1): `AIR_BASE` all year, and `AIR_AUTUMN` more at the height of
 * the autumn. No slot has more than one leaf, so a slot's clock stretches to
 * `fall / share` when its share is under one.
 */
export const AIR_BASE = 0.12;
export const AIR_AUTUMN = 1.8;
/** Units a second a leaf comes down at: 0.75 m/s at the figure's stature, a leaf's terminal speed. */
export const FALL_SPEED = 1.6;
/**
 * Seconds one lies where it fell, and more by its seed; then `SHRINK` to go.
 * Short: the litter is what lies for good.
 */
export const LIE = 4;
export const LIE_SPREAD = 4;
export const SHRINK = 2;
/** How far a leaf swings either side as it comes down, in units, and how fast. */
export const SWING = 0.6;
export const SWING_RATE = 2.3;
/** Units a second of drift downwind at a wind strength of 1 (`WIND.uWindStrength`), and what a gust front adds. */
export const DRIFT = 1.5;
export const GUST_PUSH = 2.2;
/** Over the surface it lies on: over a depth quantum at any range, under the grass. */
export const LIE_LIFT = 0.05;
/** The leaves' clock slots in the landing cache: forgotten when unseen this long. */
export const LANDING_KEEP = 4;

/** Leaves of litter under a crown at the most, and the share of them that lies all year. */
export const LITTER_MAX = 20;
export const LITTER_BASE = 0.28;
/** How far out of its crown's radius litter lies. */
export const LITTER_REACH = 1.15;
export const LITTER_SIZE = 0.2;
export const MAX_LITTER = 3000;
/** Ground heights the litter may ask a frame. */
export const LITTER_ASKS = 48;
/** Seconds between rewrites of the litter while anything about it has moved. */
export const LITTER_EVERY = 0.25;
/** Over the ground: the leaf's own tilt across its length, on a slope of a quarter, and a hair to stack them. */
export const LITTER_LIFT = 0.04;
/** A fish's half length, and its jump: how high and how far, and how long it is out. */
export const FISH_HALF = 0.32;
export const FISH_HEIGHT = 1.5;
export const FISH_TRAVEL = 2.2;
export const FISH_AIR = 1.1;
/** Seconds in one of a water cell's jump slots, and the odds it has a jump in it. */
export const FISH_SLOT = 7;
export const FISH_ODDS = 0.16;
/** The water's surface, over the sea's radius: `life.ts`'s `SEA_SINK` in the other direction, near enough. */
export const WATER_LINE = PLANET_RADIUS - 0.4;
/** A firefly's glow and a mote's, in world units across. */
export const FIREFLY_SIZE = 0.5;
export const MOTE_SIZE = 0.14;
