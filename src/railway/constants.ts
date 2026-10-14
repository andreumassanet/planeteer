import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { GAUGE, HALL_FROM, HALL_LENGTH, PLATFORM_INNER, PLATFORM_WIDTH } from '../rails/line.ts';

/** Track is laid in chunks this long along a line, in world units. */
export const CHUNK = 150;
/** Row spacing along a chunk: near chunks follow the ground more closely. */
export const NEAR_ROW = 3;
export const FAR_ROW = 9;
/** Within this of the eye a chunk carries its sleepers and rails. */
export const DETAIL_REACH = 420;
/** Past this, capped by the haze, nothing is drawn. */
export const DRAW_REACH = 2600;
export const STATION_REACH = 1800;
export const TRAIN_REACH = 1600;
export const MAX_TRAINS = 4;
/**
 * Rescan interval in wall-clock seconds, and how far the eye may move before
 * a rescan. Trains are placed from the sky's clock every frame, so a clock
 * jump needs no rescan.
 */
export const RESCAN_S = 0.4;
export const RESCAN_MOVE = 60;
/** Chunks built per frame at most, nearest first; the first near one always goes. */
export const BUILDS_PER_FRAME = 3;

export const SLEEPER_STEP = 1.3;
export const SLEEPER_LENGTH = 2.6 * (GAUGE / 1.435);
export const SLEEPER_WIDTH = 0.45;
export const SLEEPER_TOP = 0.28;
export const RAIL_WIDTH = 0.22;
/** How far past the carriageway's edge the bed stops at a level crossing. */
export const CROSSING_MARGIN = 0.6;

/**
 * A station's benches under its canopy, in the station's frame with the
 * platform toward +X: the bench middle's distance off the track, the middles
 * along the line, the seat depth and the back's offset behind the middle. The
 * seat top is `BENCH_SEAT` over the deck, and a body sits at
 * `STATION_SIT_ALONG` either side of a bench's middle.
 */
export const STATION_BENCH_X = PLATFORM_INNER + PLATFORM_WIDTH - 0.2 - 1.1;
export const STATION_BENCH_ZS = [HALL_FROM + HALL_LENGTH / 2 - 4.2 * 2.5, HALL_FROM + HALL_LENGTH / 2 + 4.2 * 2.5] as const;
export const STATION_BENCH_DEPTH = 0.95;
export const STATION_BENCH_BACK = 0.43;
export const STATION_SIT_ALONG = [-0.9, 0.9] as const;

export const BALLAST = new THREE.Color(PALETTE.tan).multiplyScalar(0.78);
export const SHOULDER = new THREE.Color(PALETTE.tan).multiplyScalar(0.66);
export const BAND = new THREE.Color(PALETTE.bark).multiplyScalar(0.95);
/** The bed's own colours, excluding sleepers and rails. */
export const BED_COLOURS: readonly THREE.Color[] = [BALLAST, SHOULDER, BAND];
export const SLEEPER = new THREE.Color(PALETTE.bark);
export const RAIL_SIDE = new THREE.Color(PALETTE.steel);
export const RAIL_HEAD = new THREE.Color(PALETTE.bone).multiplyScalar(0.9);
