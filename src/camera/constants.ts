/** The camera's tuning numbers: lens, chase, framing, collision and the swing back behind the player. */
import * as THREE from 'three';
import { AVATAR_HEIGHT, FIGURE } from '../avatar.ts';
import { SIT_EYE } from '../bench.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { BODY_RADIUS } from '../player/constants.ts';

const DEG = Math.PI / 180;

export const NEAR = 0.5;
export const FAR = PLANET_RADIUS * 10;

// ---- the lens, by what you are doing ---------------------------------------

/**
 * 45 degrees on foot, a shade wider at a run, 60 in your own eyes and 55 in a
 * craft. The craft keep 55 because the flight ceiling (`PLANE_CEILING`) was
 * worked out on that lens.
 */
export const FOV_FOOT = 45;
export const FOV_RUN = 4;
export const FOV_EYE = 60;
export const FOV_CRAFT = 55;
/** First person in a seat: wider than on foot, with the gaze tipped down towards the road. */
export const FOV_COCKPIT = 64;
export const COCKPIT_DOWN = 11 * DEG;
/** Further down where what is held is low before the eye: handlebars, reins, cockpit panels. */
export const DOWN_BY_KIND: Readonly<Record<string, number>> = {
  bicycle: 16 * DEG,
  motorbike: 16 * DEG,
  jetski: 16 * DEG,
  tuktuk: 14 * DEG,
  horse: 14 * DEG,
  plane: 15 * DEG,
  helicopter: 14 * DEG,
};
/** How fast the lens follows a change of those, per second. */
export const FOV_RATE = 3;

// ---- the chase -------------------------------------------------------------

/**
 * How hard the camera chases per second. An exponential chase trails a target
 * moving at `v` by `v / this`; low reads as weight on foot, and the lead term in
 * `follow` removes the trail for vehicles.
 */
export const CAMERA_LAG = 7;
/** Along `up` the chase is slower, so the lens does not bob with every step and kerb. */
export const CAMERA_LAG_UP = 4;
/**
 * Never further behind along `up` than this: the rate rises with a fast fall so
 * that a fall from the ceiling is not a run of catch-up jumps.
 */
export const RISE_TRAIL = AVATAR_HEIGHT * 2;
/** What the camera orbits: the head, a little under the crown. */
export const PIVOT_HEIGHT = AVATAR_HEIGHT * 0.85;
/**
 * A shake's reach at full strength, in units, and how long it takes to die away.
 * It is an offset laid on after the chase and taken off before the next one.
 */
export const SHAKE_REACH = AVATAR_HEIGHT * 0.1;
export const SHAKE_TIME = 0.45;
/**
 * On foot the camera and its aim are both moved this far to the right of the
 * body, so the person stands a little left of centre however the view turns. It
 * fades out as the wheel pulls the camera back (`zoom` 2 to 5).
 */
export const SHOULDER = AVATAR_HEIGHT * 0.32;
/** How fast the lens goes back out once a wall that pulled it in is behind, per second. */
export const WALL_RELEASE = 4;

// ---- elevation and roll ----------------------------------------------------

/**
 * Elevation of the camera above the player's own horizon. The floor is negative
 * so you can look up a monument; much below it the avatar leaves the frame.
 * Vehicles may go to the zenith, where the roll is chosen explicitly (`aimAt`).
 */
export const MIN_ELEVATION = -22 * DEG;
export const MAX_ELEVATION = 80 * DEG;
export const MAX_ELEVATION_RIDING = 89.5 * DEG;
/** A vehicle's lens never goes under its pivot's level: low behind a car it sees only the road. */
export const MIN_ELEVATION_RIDING = 2 * DEG;
/**
 * Where the explicit roll fades in, as |view direction . up|. The blend is
 * invisible: with the camera offset in the plane of `up` and `heading`, the
 * screen-up from either vector is the same unit vector.
 */
export const ROLL_FADE_FROM = 0.86;
export const ROLL_FADE_TO = 0.985;

// ---- collision -------------------------------------------------------------

/** Never let the ground come closer to the lens than this. */
export const CLEARANCE = 0.45;
export const MIN_DISTANCE = 1.6;
/** Samples along the player-to-camera segment when testing for ground. */
export const COLLISION_STEPS = 6;
/** Halvings that locate a wall on the same samples, on foot only. */
export const WALL_REFINE = 3;
/** How far short of the wall it met the lens stops. */
export const WALL_MARGIN = 0.5;
/**
 * The nearest a wall may bring the lens. The body is kept `BODY_RADIUS` clear
 * of every footprint, so a lens that near is still on this side of the wall;
 * nearer, it would be inside the building seeing only ink.
 */
export const WALL_FLOOR = BODY_RADIUS;
/**
 * Seen through (`seesThrough`): how far past the lens a wall is looked for, so
 * the near plane does not cut into one the lens stands just outside.
 */
export const LENS_ROOM = NEAR * 1.5;
/** How fast what is in the way turns see-through, and back, per second. */
export const SIGHT_RATE = 6;
/** The wheel widens the see-through capsule as the square root of the zoom, up to this. */
export const SIGHT_ZOOM_MAX = 2.2;
/** Nearer the shoulders than this the body is hidden, as in first person. */
export const BODY_NEAR = FIGURE.height * 0.5;

// ---- framing ---------------------------------------------------------------

/** Framing on foot: three bodies behind the head and half a body over it. */
export const WALK_FRAMING = { distance: AVATAR_HEIGHT * 3.2, height: AVATAR_HEIGHT * 0.55 };
/**
 * How far the wheel can take that framing, as a multiple of its distance. The
 * height grows faster than the distance (`ZOOM_RISE`), so pulling back also looks down.
 */
export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 14;
export const ZOOM_RISE = 1.7;
/** Pixels of wheel for a factor of e. */
export const ZOOM_PIXELS = 650;
/** How fast the framing follows the wheel, per second. */
export const ZOOM_RATE = 12;
/** In the boat: wider, because the hull is longer than the avatar is tall. */
export const BOAT_FRAMING = { distance: 16, height: 6 };
/** How deep a submarine is before the camera follows it under, units. */
export const SUB_FRAMED_UNDER = 3;
/** In any vehicle, framed on its own size: this many of its longest dimension behind it, and this share over it. */
export const RIDE_BACK = 1.6;
export const RIDE_UP = 0.45;
/**
 * Flight framing as an orbit and an angle: the camera swings overhead as the
 * plane climbs, which is what makes the climb reveal the map.
 */
export const FLIGHT_LOW = { orbit: 24, elevation: 17 * DEG };
export const FLIGHT_HIGH = { orbit: 340, elevation: 88 * DEG };
/** How fast the framing follows a change of vehicle. */
export const FRAMING_RATE = 2.2;

// ---- swinging back behind the player ---------------------------------------

/**
 * How fast a look taken from a craft comes back behind its bow (the mouse's
 * share), once the mouse has rested `RECENTRE_DELAY` seconds; it fades in over
 * `RETURN_EASE`.
 */
export const RECENTRE_RATE = 1.4;
export const RECENTRE_DELAY = 0.8;
/**
 * How far the view trails a craft's own turn, in seconds of that turn. Not zero:
 * the trail is what shows a turn from astern.
 */
export const TURN_TRAIL = 0.25;
/**
 * On foot the camera is the steering, so the swing back is gated: its strength
 * is how much you are moving times how fast (`velocity / RETURN_RADIUS` holds the
 * arc at one radius at any speed); it yields to the mouse for `RETURN_DELAY`
 * and fades back over `RETURN_EASE`; it lands exactly once inside `RETURN_SNAP`;
 * and it moves yaw only. `RETURN_GAIN` governs the small errors.
 */
export const RETURN_GAIN = 2.6;
/** The arc the pull draws, in units. */
export const RETURN_RADIUS = 25;
/**
 * The ceiling when the error is large: an about-face is not a curve, so the
 * ceiling opens from the radius law at `RETURN_WIDE` to `RETURN_RUSH` at a
 * half-turn, and latches until it arrives.
 */
export const RETURN_WIDE = 50 * DEG;
export const RETURN_RUSH = 150 * DEG;
export const RETURN_SNAP = 0.25 * DEG;
export const RETURN_DELAY = 0.35;
export const RETURN_EASE = 0.5;
/** Under this a yaw delta is a hand resting on a mouse, not a look. About a pixel. */
export const LOOK_DEADZONE = 0.002;

// ---- first person ----------------------------------------------------------

/** The eye sits half a head under the crown of the seven-head body. */
export const EYE_HEIGHT = AVATAR_HEIGHT * 0.93;
/**
 * How far ahead of the body's axis the eye sits, along the way the body faces:
 * the eyes are at the front of the head, and from there looking down sees the
 * chest and the feet rather than the inside of the collar.
 */
export const EYE_AHEAD = AVATAR_HEIGHT * 0.045;
/** On a bench the eye comes down with the head, to the `Sit` clip's. */
export const SEATED_EYE_HEIGHT = AVATAR_HEIGHT * SIT_EYE;
/** How far the eye tips, measured from level (positive is looking down). */
export const EYE_MIN_ELEVATION = -78 * DEG;
export const EYE_MAX_ELEVATION = 78 * DEG;
/** Where the first-person aim point is put. Only its direction is used. */
export const EYE_FOCUS = 200;
/**
 * First person in a seat: how far the head turns off the seat's own ahead,
 * either way, and how fast the gaze comes back to the road once the mouse has
 * rested `COCKPIT_RETURN_DELAY` seconds with the vehicle under way.
 */
export const COCKPIT_YAW = 110 * DEG;
export const COCKPIT_PITCH = 70 * DEG;
export const COCKPIT_RETURN_DELAY = 1;
export const COCKPIT_RETURN = 1.5;
/** A vehicle's +Z is ahead and a camera looks down its own -Z: a half turn between them. */
export const ABOUT_FACE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/**
 * An aircraft aloft is chased in its own frame (`flight.ts`): the lens turns
 * with its nose and wings at `FLIGHT_FOLLOW_RATE` a second, and the wings' roll
 * is softened by leaning the lens's up `FLIGHT_ROLL_KEEP` of the way back to
 * the surface's (under 1, so a plane on its back still turns the view over).
 * Framed from higher than `FLIGHT_FADE_FROM` over the horizon, as the map view
 * of a climb is, it fades back to the heading's level chase by `FLIGHT_FADE_TO`;
 * full control is always followed.
 */
export const FLIGHT_FOLLOW_RATE = 4;
export const FLIGHT_ROLL_KEEP = 0.5;
export const FLIGHT_FADE_FROM = 25 * DEG;
export const FLIGHT_FADE_TO = 50 * DEG;
