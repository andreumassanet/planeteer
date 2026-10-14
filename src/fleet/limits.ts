/** How far the fleet builds, how often it looks again, and how a vehicle let go of runs on. */
import { AT_REST } from '../craft/motion.ts';
import type { MotionInput } from '../craft/motion.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { STRIP_DRAWN } from '../craft/airstrip.ts';

/** How near a vehicle has to be to be built, in units, and how far it may go before it is put away. */
export const REACH = 700;
export const KEEP = REACH * 1.15;
/** Inside this every vehicle in reach is built whatever the camera is pointed at. */
export const ALWAYS_WITHIN = 220;
/**
 * The most vehicles standing at once, and how much nearer than the furthest of
 * them one has to be to take its place: the furthest standing gives way to one
 * nearer by `ROOM_MARGIN`, which is the scan's own staleness (`RESCAN_MOVE`),
 * so two never trade places back and forth.
 */
export const MAX_BUILT = 36;
export const ROOM_MARGIN = 40;
/** Milliseconds of building a frame may give this streamer. */
export const BUILD_MS = 2;
/**
 * The airstrips round the player are worked out ahead of the first ask
 * (`SiteIndex.warm`): how far, how much of a frame's far allowance, and how far
 * the player moves before a finished warm-up looks again.
 */
export const WARM_REACH = 3000;
export const WARM_MS = 1;
export const WARM_MOVE = 250;
/** How far the player moves, or how long passes, before the candidates are worked out again. */
export const RESCAN_MOVE = 40;
export const RESCAN_SECONDS = 1;
/**
 * Towns whose sites one scan may work out for the first time: a coastal town's
 * search for open water is the dear part, so a dozen is a few milliseconds and
 * a region fills in over a second or two of arriving.
 */
export const FRESH_TOWNS = 12;
/** How often a parked vehicle is set down again on whatever ground has arrived under it. */
export const RESEAT_SECONDS = 0.5;
/** How near a vehicle you have to be to take it: two bodies from its side, less half its longer dimension. */
export const BOARD_REACH = AVATAR_HEIGHT * 2;
/** Spare models of each kind kept for the next time one comes into reach. */
export const POOL_EACH = 6;
/**
 * The least time between two presses of `E` that are acted on, in milliseconds:
 * every one is a seat taken or given up on the relay, which answers one of each
 * a quarter of a second and drops the rest.
 */
export const USE_INTERVAL_MS = 300;
/**
 * How long the link may say the seat in hand is somebody else's, or nobody's,
 * before the fleet asks for it again, in seconds; and how many times it asks
 * before a player on the ground is let out. A reconnection re-claims the seat
 * on its own, and a relay that refuses it would otherwise leave the player
 * driving a car nobody else sees move.
 */
export const LOST_SEAT_SECONDS = 2;
export const LOST_SEAT_TRIES = 3;
/** How far round the player the towns' parked cars are asked about, for the prompt. */
export const PARKED_SEARCH = BOARD_REACH + 12;
/**
 * A standing balloon's footprint as a wall, as a share of its width: the
 * basket, not the envelope, which is walked under. A helicopter's is its cabin
 * and boom, a share of its width and its length.
 */
export const BALLOON_WALL = 0.2;
export const HELI_WALL: readonly [number, number] = [0.08, 0.36];

/**
 * How near an airstrip's middle has to be to be drawn, and how far it may go
 * before it is put away, in units from the player: further than a vehicle,
 * because it is a mark on a landscape seen from a climbing plane.
 */
export const STRIP_REACH = 1400;
export const STRIP_KEEP = STRIP_REACH * 1.15;
/** Inside this the windsocks swing; further out they hang still. */
export const SOCK_REACH = 500;
/** Inside this a moored launch rides the swell; further out it lies still. */
export const MOOR_REACH = 400;
/** What a moored launch's motion is handed: nobody aboard, afloat. */
export const MOORED: Readonly<MotionInput> = { ...AT_REST, moored: true };
/** Where the windsock stands: down the strip from the plane's stand, and off its left edge. */
export const SOCK_ALONG = 24;
export const SOCK_OFF = STRIP_DRAWN + 5;

// A vehicle somebody jumped out of runs on, slowing under `COAST_DRAG`
// (units a second squared) until under `COAST_STOP` it parks where it is. A
// road vehicle stops at the water's edge and a hull at the land's, and a wall
// turns it back at `COAST_BOUNCE` of its speed. An aircraft glides on: a plane
// at a slope of one in `GLIDE_RATIO`, a helicopter at `HELI_FALL` and a balloon
// at `BALLOON_FALL`; down faster than `WRECK_SPEED` it is wrecked.
export const COAST_DRAG = 3;
export const COAST_STOP = 0.4;
export const COAST_BOUNCE = 0.3;
/** Seconds a vehicle may go on alone before it is parked where it has got to. */
export const COAST_MAX = 60;
/** The pull on a vehicle off the ground, units a second squared. */
export const COAST_GRAVITY = 30;
export const GLIDE_RATIO = 7;
export const HELI_FALL = 14;
export const BALLOON_FALL = 3;
export const WRECK_SPEED = 12;
/** A wall met faster than this is a knock worth a puff. */
export const KNOCK_SPEED = 15;
