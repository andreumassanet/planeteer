import * as THREE from 'three';

/** How far behind the newest pose a driven vehicle is drawn: `peers.ts`'s own delay. */
export const DELAY_MS = 150;
/** A claim unanswered this long is refused. */
export const CLAIM_MS = 2_000;
/** A driver's pose goes out ten times a second while it moves... */
export const DRIVE_MS = 100;
/** ...once a second while it stands, well inside the relay's five seconds of silence... */
export const REST_MS = 1_000;
/** ...and at once on a sharp turn or a change of speed, but never under the relay's 50 ms. */
export const URGENT_MS = 55;
export const SHARP_TURN = Math.cos(THREE.MathUtils.degToRad(10));
/** Between two messages told to the room on reconnecting: the relay takes one `sit` each 250 ms. */
export const FLUSH_MS = 300;
/** Who this client is while there is no relay to name it. */
export const LOCAL_SELF = 'local';
