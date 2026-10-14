/** Timings and limits of the relay link. */

/** How often our own state goes out. The relay drops anything under 60 ms apart. */
export const SEND_MS = 100;
/** How far behind the newest state a peer is drawn: a state and a half of jitter. */
export const DELAY_MS = 150;
/** A peer silent this long is dropped, in case the relay's goodbye was lost. */
export const SILENT_MS = 10_000;
/** Beyond this a peer is not drawn, only marked on the minimap. */
export const DRAW_REACH = 2_500;
/** Reconnection backoff, doubling from the first to the last. */
export const RETRY_MS = [1_000, 30_000] as const;
export const NAME_KEY = 'atlas.peers.name';
/** A gesture not yet made this long after it was heard is not made at all: a wave is a moment. */
export const GESTURE_STALE_MS = 3_000;
/**
 * The least time between two looks sent, half as long again as the relay's own
 * (`LOOK_INTERVAL_MS` in `server/src/index.ts`), which drops one sooner without
 * a word: a run of clicks on the card sends the first at once and the last
 * after this.
 */
export const LOOK_SEND_MS = 1500;
/**
 * The least time between two changes of flags sent, twice the relay's
 * `FLAGS_INTERVAL_MS`, for the same reason: a change it drops is not sent again.
 */
export const FLAGS_SEND_MS = 400;
/** How far under the water's surface a swimmer's state has to be for the body to dive (`UNDER_FROM` in `player/constants.ts`). */
export const DIVING_FROM = 0.6;
