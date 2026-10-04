import * as THREE from 'three';
import { AVATAR_HEIGHT, FIGURE, RUN_SPEED, WALK_SPEED } from './avatar.ts';
import { PLANET_RADIUS } from './globe.ts';
import { SIT_EYE } from './bench.ts';
import { BODY_RADIUS } from './player.ts';
import type { Player } from './player.ts';
import type { InputState } from './input.ts';
import { PLANE_CEILING } from './vehicles.ts';

const NEAR = 0.5;
const FAR = PLANET_RADIUS * 10;
/**
 * The lens, by what you are doing: 45 degrees on foot, a shade wider at a run,
 * 60 in your own eyes and 55 in a craft.
 *
 * **On foot it is a long lens close behind**, the framing of the reference the
 * whole camera was rebuilt against in 2026-09-24: 45 degrees, the camera two
 * and a half bodies behind at the height of the eyes, so a person is a quarter
 * of the frame and the street runs away from him at the height he sees it.
 * 55 was right for a camera thirty units back and fifteen up, which framed a
 * man at a sixth of the screen over a model village. The run opens it by four,
 * which is how the lens says you are going faster without the world having to.
 * The craft keep 55, because the flight's ceiling was worked out on that lens
 * (`PLANE_CEILING`), and the eye takes 60, a person's own field.
 */
const FOV_FOOT = 45;
const FOV_RUN = 4;
const FOV_EYE = 60;
/**
 * First person in a seat: a wider lens than on foot, and the gaze tipped a
 * little down to the road. The pack's cars are toys, their windscreens a
 * band under a deep roof; at 60 degrees, level, the roof's lining was half
 * the frame and the wheel was under it.
 */
const FOV_COCKPIT = 64;
const COCKPIT_DOWN = 11 * (Math.PI / 180);
/**
 * Further down where what is held is low before the eye: the bars of a
 * bicycle, a motorbike, a jet ski, a tuk-tuk and a horse's reins, and the
 * plane's and the helicopter's panels and sticks in their open cockpits.
 */
const DOWN_BY_KIND: Readonly<Record<string, number>> = {
  bicycle: 16 * (Math.PI / 180),
  motorbike: 16 * (Math.PI / 180),
  jetski: 16 * (Math.PI / 180),
  tuktuk: 14 * (Math.PI / 180),
  horse: 14 * (Math.PI / 180),
  plane: 15 * (Math.PI / 180),
  helicopter: 14 * (Math.PI / 180),
};
const FOV_CRAFT = 55;
/** How fast the lens follows a change of those, per second. */
const FOV_RATE = 3;

/**
 * How hard the camera chases per second. Higher is tighter and twitchier.
 *
 * An exponential chase trails a target moving at `v` by exactly `v / this`. On
 * foot at a run that is 1.4 units (13 when the run was 90, 19 at 130, before
 * the walk came down with the body on 2026-09-24) and it reads as weight,
 * which is why the number is low. At 3,400 units/s it is 490 — enough to drag the camera out of
 * the sky and back down level with the plane, so the framing would say
 * "overhead, looking at the globe" and the picture would say "level flight".
 * See the lead term in `follow`.
 */
const CAMERA_LAG = 7;
/**
 * And along `up` it is slower: a lens that rises and falls with every step and
 * every kerb at the rate it follows a turn is a hand-held camera. Half the
 * rate, which is what the reference's own rig does (4.5 across and 3 up).
 */
const CAMERA_LAG_UP = 4;
/**
 * But never further behind along `up` than this. A trail is `v / rate`, so a
 * body falling out of an aircraft at a thousand units a second trailed 260 at
 * `CAMERA_LAG_UP` — past the twenty bodies at which `follow` catches a jump
 * outright — and the lens was caught, fell behind, and was caught again every
 * few frames: a fall from the ceiling read as a run of teleports until it had
 * slowed under 300. The rate rises with the speed instead, so the lens trails
 * a fast fall by this and an ordinary step as it always did.
 */
const RISE_TRAIL = AVATAR_HEIGHT * 2;
/** What the camera orbits: the head, a little under the crown. */
const PIVOT_HEIGHT = AVATAR_HEIGHT * 0.85;
/**
 * A shake's reach at full strength, in units, and how long it takes to die
 * away. A tenth of a body is about a degree of view at the walking framing:
 * felt, and never enough to lose the horizon. It is an offset laid on after
 * the chase and taken off before the next one, so it never feeds the chase
 * itself and cannot push the lens into a wall it was held off.
 */
const SHAKE_REACH = AVATAR_HEIGHT * 0.1;
const SHAKE_TIME = 0.45;
/**
 * On foot the camera and what it looks at are both moved `SHOULDER` to the
 * right of the body, together, so the person stands a little left of the
 * middle and **stays there however the view turns**: the camera orbits the
 * body and the offset turns with it. A first version looked at a point ahead
 * of the body and to the side of it, and turning the view swung the person
 * across the screen rather than the world round him. It fades out as the wheel
 * pulls the camera back (`zoom` 2 to 5).
 */
const SHOULDER = AVATAR_HEIGHT * 0.32;
/** How fast the lens goes back out once a wall that pulled it in is behind, per second. */
const WALL_RELEASE = 4;

const DEG = Math.PI / 180;
/**
 * Elevation of the camera above the player's own horizon.
 *
 * The floor is negative so you can get under a monument and look up it: they
 * run to 140 units against a person of 3.77, and from a fixed overhead camera
 * you never see the top of anything. It stops at -22 because of what happens
 * next: the ground refuses to let the lens drop that far, the aim compensates
 * by raising what it looks at, and much past this the avatar leaves the bottom
 * of the frame.
 *
 * The ceiling used to stop at 80 for a different reason — at the zenith the
 * view direction is parallel to `camera.up` and `lookAt` has no way to choose a
 * roll. Flight cannot live with that: looking at the whole globe from 20,000
 * units up *is* looking straight down. So the roll is now chosen explicitly
 * (see `aimAt`) and the ceiling for a vehicle goes to 89.5. Walking keeps 80,
 * because nothing above it improves the framing of a man on a hillside.
 */
const MIN_ELEVATION = -22 * DEG;
const MAX_ELEVATION = 80 * DEG;
const MAX_ELEVATION_RIDING = 89.5 * DEG;

/**
 * Where the explicit roll fades in, as |view direction . up|. 0.86 is 31
 * degrees off the vertical.
 *
 * The blend is invisible, and provably so: with the camera offset lying in the
 * plane of `up` and `heading`, the screen-up you get from either vector is the
 * same unit vector `cos(e) * up + sin(e) * heading` for every elevation `e`.
 * Only the conditioning differs, and at the zenith one of the two is zero and
 * the other is not.
 */
const ROLL_FADE_FROM = 0.86;
const ROLL_FADE_TO = 0.985;

/** Never let the ground come closer to the lens than this. */
const CLEARANCE = 0.45;
const MIN_DISTANCE = 1.6;
/** Samples along the player-to-camera segment when testing for ground. */
const COLLISION_STEPS = 6;
/**
 * And for walls, on the same samples. A sample inside a building stops the lens
 * as the ground does, on foot only — the boat has no town to be in and the
 * plane is framed from above every roof — and three halvings then find the wall
 * to a forty-eighth of the segment, 0.15 units at the walking framing. A clear
 * view costs six calls a test and a stop at most nine.
 */
const WALL_REFINE = 3;
/**
 * How far short of the wall it met the lens stops: half a unit, which was the
 * nearest near plane `main.ts` set until 2026-09-24 and is twice its floor of
 * 0.25 since, so the wall stays out of the lens's own slab
 * when the view runs along it rather than across it.
 */
const WALL_MARGIN = 0.5;
/**
 * The nearest a wall may bring the lens, and it is not `MIN_DISTANCE`.
 *
 * The ground never gets between the pivot and a lens `MIN_DISTANCE` out; a
 * wall does, every time you walk along one with the camera across it, and
 * flooring that pull-in there would put the lens inside the building — where every
 * face is seen from behind and the ink hull is all that is drawn, a screen of
 * black. The body is kept `BODY_RADIUS` clear of every footprint, so a segment
 * leaving the pivot above it cannot meet a wall nearer than that, and a lens
 * that near is still on this side of it.
 */
const WALL_FLOOR = BODY_RADIUS;
/**
 * Nearer the shoulders than this the body is hidden, as it is in first person.
 * Half the figure's height: at that range the head alone is about half the
 * frame's height, and seeing past a man is better than seeing the inside of his
 * hat. Only a wall brings the lens in this far; the ground stops at
 * `MIN_DISTANCE`.
 */
const BODY_NEAR = FIGURE.height * 0.5;

/**
 * Framing on foot: what `view` is, and what it returns to after a landing.
 *
 * Three bodies behind the head and half a body over it: about ten
 * degrees down, the eye of somebody walking a step behind you. It was 30 back
 * and 15 up, 26.6 degrees down from 33.5 away, while a person was three times
 * the world's scale (2026-09-24, `stature.ts`).
 */
const WALK_FRAMING = { distance: AVATAR_HEIGHT * 3.2, height: AVATAR_HEIGHT * 0.55 };
/**
 * How far the wheel can take that framing, as a multiple of its distance: in
 * to 0.55, over the shoulder, out to 14, over a town. **The height grows
 * faster than the distance** (`ZOOM_RISE`), so pulling back also looks down:
 * at 1 the camera is ten degrees down and walking, at 5 it is twenty-eight and
 * over the street, at 14 fifty and over the whole town.
 */
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 14;
const ZOOM_RISE = 1.7;
/**
 * Pixels of wheel for a factor of e. A mouse notch is about a hundred pixels,
 * which is 1.16x; a trackpad's dozens of small events add up to the same for
 * the same travel, because it is the sum that is read and never the count.
 */
const ZOOM_PIXELS = 650;
/** How fast the framing follows the wheel, per second: a glide rather than a step. */
const ZOOM_RATE = 12;
/** In the boat: wider, because the hull is longer than the avatar is tall. */
const BOAT_FRAMING = { distance: 16, height: 6 };
/** How deep a submarine is before the camera follows it under, units. */
const SUB_FRAMED_UNDER = 3;
/**
 * In any vehicle, framed on its own size: this many of its longest dimension
 * behind it, and this share of it over it, plus a body of each, so a car sits
 * behind its own boot and a balloon's envelope stays in the frame whatever the
 * models measure.
 */
const RIDE_BACK = 1.6;
const RIDE_UP = 0.45;

/**
 * Flight framing, given as an orbit and an angle rather than as the two offsets
 * `view` holds, because the thing that has to move with altitude is the angle.
 *
 * At the ceiling the plane is 1.25 radii up and the globe subtends 52 degrees
 * *below* it: a camera left at the walking elevation would be pointed at empty
 * sky with the planet under the bottom of the frame. Swinging the camera
 * overhead as the plane climbs is what makes the climb reveal the map, and it
 * is why the elevation ceiling above had to move.
 */
const FLIGHT_LOW = { orbit: 24, elevation: 17 * DEG };
const FLIGHT_HIGH = { orbit: 340, elevation: 88 * DEG };
/** How fast the framing follows a change of vehicle. 0.5 s, so it reads as a move. */
const FRAMING_RATE = 2.2;

/**
 * How fast a look taken from a craft comes back behind its bow.
 *
 * Slow enough that the mouse still wins while it is moving, fast enough that
 * letting go of it puts the bow back in the middle of the frame. On foot there
 * is no such pull: there the camera is where you point it and the body follows.
 * It is the mouse's alone: following the bow round a turn is `TURN_TRAIL`'s.
 */
const RECENTRE_RATE = 1.4;
/**
 * How far the view trails a craft's own turn, in seconds of that turn: at full
 * stick the plane's 1.0 rad/s leaves the camera 15 degrees off its tail and the
 * launch's 1.15 leaves it 17 — stepped at 60 Hz through `createPlayer` and this
 * rig, headless; a frame over `rate * TURN_TRAIL`, because `aim` reads the bow
 * `player.update` left on the frame before.
 *
 * **It used to be `RECENTRE_RATE`, and that constant was chosen for the
 * mouse.** One pull did two jobs — bring a look back behind the bow, and follow
 * the bow round a turn — and an exponential chase trails a steady turn by
 * `rate / gain`: 22 degrees for the plane of the time and 47 for the launch, and
 * a step of stick took 0.7 s to reach two thirds of itself on the screen,
 * because the view was the slowest thing in the loop. So it is two pulls now.
 * The part of the gap the mouse made is `glance`, and it decays at
 * `RECENTRE_RATE` exactly as it always did; the part the turn made closes at
 * this.
 *
 * Not zero, because the trail is what shows a turn from astern: without it the
 * plane sits dead centre, the bank is the only cue, and the world slides past.
 */
const TURN_TRAIL = 0.25;

/**
 * The same swing back, on foot, and every gate on it is the answer to a way it
 * goes wrong.
 *
 * A vehicle has a bow and you steer *it*, so the pull above is always on and it
 * is allowed to fight the mouse. On foot the camera **is** the steering —
 * `player.ts` walks you along `rig.heading`, not along the avatar's nose — so a
 * pull that is always on does not follow you, it drives you. Four gates:
 *
 * - **Strength is how much you are moving**, times how fast you are actually
 *   going. Standing still it is 0, so the view you set while stopped is yours.
 *   `velocity / RETURN_RADIUS` is the second half, and what it buys is that
 *   the thing held constant is the **radius** of the curve rather than the rate
 *   of it.
 *
 *   **It used to be `max(0, move.y)`, and that clamp was the fix for the wrong
 *   half of the problem.** It stopped `S` being an oscillator — swing the
 *   camera behind a man walking backwards and `S` points the other way, so he
 *   turns, so the camera swings again — at the cost of the thing that actually
 *   mattered: walking on `S`, you could not see where you were going. The
 *   oscillation is not caused by the pull, it is caused by the input being
 *   **re-derived from the camera every frame**, so the fix belongs at that end.
 *   `steer` below latches the basis, and with the feedback broken the clamp has
 *   nothing left to prevent: it is `min(1, |move|)` now, so `S` swings the
 *   camera round and a pure strafe still does, because `A` with the camera
 *   coming behind you is a person sidestepping and then walking where they are
 *   looking, which is what a person does. A fixed rate was a 329-unit turn at
 *   the 130-unit run of the time and a 114-unit one at a walk, which is the
 *   same law reading as a drift and as a spin depending only on whether Shift
 *   is down. Rate proportional to speed is one radius at both.
 * - **It yields to the mouse, on the axis it acts on.** A yaw delta resets
 *   `sinceLook`; the pull is silent for `RETURN_DELAY` and fades back over
 *   `RETURN_EASE`, so a look you are still making is never contested and one
 *   you have just finished is not snatched away the instant your hand stops. A
 *   *pitch* delta does not suppress it, because this only ever moves the yaw.
 * - **It arrives.** An exponential ease never reaches its target and "behind
 *   you" is a place the camera has to actually get to, so the step is
 *   proportional with a ceiling and it lands exactly once the error is inside
 *   `RETURN_SNAP` — a quarter of a degree, about four pixels at this lens.
 * - **Yaw only.** There is no "behind" in pitch. The tilt is the framing you
 *   chose — `MIN_ELEVATION` is negative precisely so you can stand under a
 *   140-unit monument and look up it — and nothing about walking makes that
 *   choice stale. Almost every third-person game does the same and this is why.
 *
 * The radius was chosen by what a **held diagonal** describes, because that was
 * the only case where this did visible work. Measured, holding `W`+`A`, while
 * the radius below was 233 and the run 130: the error settles at 41.4 degrees
 * rather than 45 — the camera never catches a diagonal, because the input is
 * re-derived from the camera every frame — and the camera then turns for ever
 * at 21.9 deg/s at a run and 7.6 at a walk, which is **340 units of radius at
 * both**, 50 avatars of the time, 44 degrees of turn in two seconds. The law
 * scales with the radius, so at today's 25 it is about 35 units, sixteen
 * people. That is the curve somebody running makes when they change their
 * mind about where they are going. `RETURN_GAIN` governs only the small errors
 * and there it is worth almost nothing: measured, a 90-degree swing followed by
 * `W` is closed 85 degrees by the body's own turn and 4.7 by this.
 */
const RETURN_GAIN = 2.6;
/**
 * The arc the pull draws, in units: the ceiling on its rate is `velocity /
 * RETURN_RADIUS`, which is one curve at every speed.
 *
 * **It was `RETURN_MAX`, 32 deg/s times `velocity / RUN_SPEED`,** and that is
 * this same radius — 130 over 32 degrees is 233 — spelled as a rate and a
 * speed. So it moved whenever the run did: taking the run to 90 (2026-09-13)
 * would have tightened the curve by a third at every speed, the walk included,
 * without a line of this file changing. Written as the radius, the run can move
 * and the camera does not. The 340 above is this law on the diagonal under the
 * old `max(0, move.y)` gate, which put 0.707 of it in play: 233 / 0.707 = 329.
 *
 * It was 233 until 2026-09-24, when the walk and the run came down about
 * tenfold with the body; 25 keeps the curve in step with them.
 */
const RETURN_RADIUS = 25;
/**
 * The ceiling when the error is large, and why there are two of them.
 *
 * `RETURN_RADIUS` is a **radius**: `velocity / RETURN_RADIUS` holds the
 * camera's arc at one radius whether you walk or run (233 units when this was
 * measured, 25 since 2026-09-24), which is the curve
 * somebody running makes when they change their mind. That is the right law for
 * a small error, because a small error *is* a curve you are walking.
 *
 * **An about-face is not a curve.** Press `S` and the body has already turned —
 * `TURN_SMOOTHING` is 0.09 s — so what is left is the camera trailing a body
 * that is facing the other way, and pricing that as an arc gives a half-turn a
 * radius of 233 units: measured before this, holding `S` at a walk closed 26.5
 * degrees in 2.4 seconds, **11 deg/s, about fourteen seconds and a thousand
 * units of walking to come round.** Walking on `S`, you could not see where you
 * were going.
 *
 * So the ceiling opens with the error, from the radius law at `RETURN_WIDE`
 * (below which nothing changes, and the 340-unit measurement still holds at
 * the scale of its radius) to
 * `RETURN_RUSH` at a half-turn — 150 deg/s, which closes 180 degrees in about
 * 1.2 seconds. Fast enough to be a turn and slow enough to be a swing.
 */
const RETURN_WIDE = 50 * DEG;
const RETURN_RUSH = 150 * DEG;
const RETURN_SNAP = 0.25 * DEG;
const RETURN_DELAY = 0.35;
const RETURN_EASE = 0.5;
/** Under this a yaw delta is a hand resting on a mouse, not a look. About a pixel. */
const LOOK_DEADZONE = 0.002;

/**
 * First person: where the eye sits, and what happens to the body it is inside.
 *
 * **At the eyes of the body you actually are.** It used to be `FIGURE.chinY +
 * 0.62`, where the code-built avatar stood its two eye boxes: 5.72 of a
 * 6.8-unit figure, 0.84 of its height, right for a four-head body and low for
 * anybody else. Since 2026-09-16 the hero is a CC0 character of about seven
 * heads (`cast.ts`) scaled to `AVATAR_HEIGHT`, and on a seven-head body the
 * eyes sit half a head under the crown: 1 - 0.5 / 7 = 0.93 of the height,
 * which is also the adult standing eye height anthropometry gives. `FIGURE` is
 * the seat conventions now and not the silhouette — `avatar.ts` says so — so
 * the eye follows the height and not the chin, and moves with it.
 *
 * **The body is hidden rather than clipped.** In first person `main.ts` puts
 * the near plane at 0.15 of the eye's height over the feet — 0.31 units — and
 * the head is under a unit across sitting on the lens; what you would see is
 * not a face but a full-screen rectangle of ink, because `OutlineEffect` hulls
 * the mesh and the hull is the thing you are inside. Hiding the avatar leaves
 * the boat and the plane standing — they are its siblings in `player.ts`'s
 * `craft` group, not its children.
 *
 * There is deliberately **no head bob**: the eye rides `player.position`, not
 * the avatar's head. The walk cycle moves that head, and that is a good thing
 * to watch from behind and a bad thing to be inside.
 */
const EYE_HEIGHT = AVATAR_HEIGHT * 0.93;
/** On a bench the eye comes down with the head, to the `Sit` clip's (`SIT_EYE` in `bench.ts`). */
const SEATED_EYE_HEIGHT = AVATAR_HEIGHT * SIT_EYE;
/**
 * How far the eye tips, measured the way `place` measures — positive is looking
 * down — but from level rather than from the framing's own elevation. Short of
 * the vertical for the same reason the third-person ceiling is, and wider than
 * it because an eye has no ground to keep out of the lens.
 */
const EYE_MIN_ELEVATION = -78 * DEG;
const EYE_MAX_ELEVATION = 78 * DEG;
/** Where the first-person aim point is put. Only its direction is used. */
const EYE_FOCUS = 200;
/**
 * First person in a seat: how far the head turns off the seat's own ahead,
 * either way and up or down, in radians — a driver looks over a shoulder and
 * no further — and, once the mouse has rested `COCKPIT_RETURN_DELAY` seconds
 * with the vehicle under way, how fast the gaze comes back to the road, per
 * second.
 */
const COCKPIT_YAW = 110 * DEG;
const COCKPIT_PITCH = 70 * DEG;
const COCKPIT_RETURN_DELAY = 1;
const COCKPIT_RETURN = 1.5;
/** A vehicle's +Z is ahead and a camera looks down its own -Z: a half turn between them. */
const ABOUT_FACE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/**
 * What the lens follows: Earth's `Player` is one, and so is the traveller on
 * another world (`worlds/index.ts`), so there is one camera in the game and
 * every body is framed, chased and swung behind the same way. Only what this
 * file reads is here.
 */
export interface CameraSubject {
  readonly position: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly forward: THREE.Vector3;
  /** Ground speed, units a second. */
  readonly velocity: number;
  readonly airborne: boolean;
  readonly altitude: number;
  readonly depth: number;
  readonly sink: number;
  readonly sitting: boolean;
  readonly state: Player['state'];
  readonly controls: { lift: number };
  readonly ride: { readonly model: { readonly kind: string; readonly size: readonly [number, number, number] } } | null;
  seatEye(position: THREE.Vector3, orientation: THREE.Quaternion): boolean;
  setBodyVisible(visible: boolean): void;
  setCockpit(on: boolean): void;
}

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  /** Unit vector: where the camera faces, projected tangent to the surface. Feed to player. */
  heading: THREE.Vector3;
  /**
   * What `WASD` is measured against on foot — a *sampled* copy of `heading`,
   * not `heading` itself. See the note beside it: the camera swinging behind
   * you must not rotate the meaning of the key you are holding.
   */
  steer: THREE.Vector3;
  /**
   * Framing levers. On foot they are yours — `rig.view.height = 30000` is still
   * how you pull back until the whole planet fits. In a vehicle the rig drives
   * them from the altitude and takes them back when you land.
   */
  view: { distance: number; height: number };
  /**
   * True while the eye is in the avatar's head. `V` toggles it, the rig owns
   * the state, and it is settable: `atlas.rig.firstPerson = true`.
   *
   * **On foot and in every seat.** It was on foot only, because the plane's
   * whole design is that climbing swings the camera overhead and turns the
   * flight into the map; but a player at the wheel wants the road, and `V`
   * is the one key for it. In a seat the eye is the seated body's
   * (`Player.seatEye`): through the windscreen, over the bars, between a
   * horse's ears, out of the cockpit, rolling with the vehicle, the mouse
   * turning the head within `COCKPIT_YAW` and `COCKPIT_PITCH`. The map from
   * the air is still there: `V` again.
   */
  firstPerson: boolean;
  /** Update yaw/pitch from mouse look. Call BEFORE player.update. */
  aim(dt: number, input: InputState, player: CameraSubject): void;
  /** Chase the player. Call AFTER player.update. */
  follow(dt: number, player: CameraSubject, groundRadiusAt: (p: THREE.Vector3) => number): void;
  /** Place the camera with no interpolation: first frame, and after a teleport. */
  snap(player: CameraSubject, groundRadiusAt: (p: THREE.Vector3) => number): void;
  resize(width: number, height: number): void;
  /**
   * A knock felt through the lens: `strength` from 0 to 1, a car into a wall
   * at full boost being about 1. Small and quickly gone — `SHAKE_REACH` at its
   * strongest, over `SHAKE_TIME` — and nothing at all while `shakes` is off.
   */
  shake(strength: number): void;
  /** Whether `shake` moves the lens. The Settings card's *Camera shake*. */
  shakes: boolean;
}

export interface CameraOptions {
  /**
   * Whether a point is inside something built — a building's walls and under
   * its roof — which the lens must not be behind.
   *
   * A callback for the reason the player's `collide` is one: the walls belong
   * to `settlements.ts`, which knows what is standing. Omit it and only the
   * ground stops the camera, as it always did.
   */
  blocks?: (point: THREE.Vector3) => boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** In a vehicle's seat, which is every framing that is not a foot's; swimming is a foot's. */
const seated = (player: CameraSubject): boolean => player.state === 'seated';
/**
 * What the camera orbits: the head on foot and afloat — where the body hangs
 * under the surface, the head is `sink` nearer it — and in a vehicle a little
 * over the middle of it, so a balloon is orbited round its envelope and not
 * round the basket.
 */
const pivotHeight = (player: CameraSubject): number =>
  player.ride !== null ? Math.max(PIVOT_HEIGHT, player.ride.model.size[2] * 0.6) : PIVOT_HEIGHT - player.sink;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
/** An angle folded into (-pi, pi], so a gap is always closed the short way round. */
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
/** Smooth 0..1 ramp between two thresholds. */
function ramp(value: number, from: number, to: number): number {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createCameraRig(options: CameraOptions = {}): CameraRig {
  const camera = new THREE.PerspectiveCamera(FOV_FOOT, 1, NEAR, FAR);
  const { blocks } = options;
  const view = { distance: WALK_FRAMING.distance, height: WALK_FRAMING.height };
  /** The walking framing at a zoom of the wheel's: see `ZOOM_RISE`. */
  const walkFraming = (at: number, into: { distance: number; height: number }): void => {
    into.distance = WALK_FRAMING.distance * at;
    into.height = WALK_FRAMING.height * Math.pow(at, ZOOM_RISE);
  };
  /**
   * The wheel's multiple of `WALK_FRAMING`, and where it is heading. `view`
   * is only written while the two differ, so a framing set by hand from the
   * console stays until the wheel is next turned.
   */
  let zoom = 1;
  let zoomTarget = 1;

  /**
   * Yaw is not stored as an angle. There is no fixed axis to measure it
   * against on a sphere — the pole is wherever you happen to be standing — so
   * the heading is kept as the tangent vector itself and carried along with the
   * player, the same trick that keeps the controller free of latitudes.
   */
  const heading = new THREE.Vector3(0, 0, 1);
  const lastUp = new THREE.Vector3();
  let pitch = 0;
  /**
   * The basis movement is measured against, and it is **not** `heading`.
   *
   * On foot the camera is the steering, so a camera that swings to follow you
   * changes what your own keys mean underneath you — hold one key and the
   * direction it names rotates with the view chasing it. That is the whole of
   * the `S` oscillation and it is also why a held diagonal never converged:
   * measured, `W`+`A` settled at 41.4 degrees of error and the camera then
   * turned for ever, because the input was re-derived from the camera every
   * frame.
   *
   * So the basis is **sampled, not tracked**. It is re-taken from `heading`
   * only when the movement changes — a key pressed or released, or a stop —
   * or when the mouse turns the view, which is the player saying *this* is
   * where I mean. In between it is carried across the surface exactly as
   * `heading` is, so what a held key names is a fixed direction in the world
   * and the camera is free to come round behind it.
   *
   * The consequence, and it is a change of feel worth knowing: **a held
   * diagonal is now a straight line** where it used to be a 340-unit circle.
   */
  const steer = new THREE.Vector3(0, 0, 1);
  const lastMove = { x: 0, y: 0 };
  let steering = false;
  /** True while an about-face is being closed; see the ceiling below. */
  let rushing = false;
  /**
   * In a craft, how far the mouse has turned the view off the line the view is
   * chasing, in radians about `up`; see `TURN_TRAIL`. The rest of the gap to the
   * bow is the turn's. `riding` is whether it has been handed its share yet.
   */
  let glance = 0;
  let riding = false;

  /** True while the rig owns `view`; see the interface. */
  let driving = false;
  /** See the interface. `V` toggles it, on foot and in a seat. */
  let firstPerson = false;
  /**
   * First person in a seat: the head's turn off the seat's ahead, left
   * positive, and its tilt, down positive; whether the player has been told
   * the eye is in the seat; and the seat's own frame, read each frame.
   */
  let lookYaw = 0;
  let lookPitch = 0;
  let inCockpit = false;
  const seatTurn = new THREE.Quaternion();
  const headTurn = new THREE.Quaternion();
  const headEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  /**
   * Seconds since the mouse last turned the view. Starts past the whole ramp so
   * the first step you take is followed, rather than waiting out a look nobody
   * made.
   */
  let sinceLook = RETURN_DELAY + RETURN_EASE;
  /** The avatar's group, looked up once and hidden while the eye is inside it. */

  /** What the shake laid on the lens this frame, taken off again before the next chase. */
  const shaken = new THREE.Vector3();
  const shakeAxis = new THREE.Vector3();
  let shakeLeft = 0;
  let shakePower = 0;
  let shakeClock = 0;
  const pivot = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const look = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const travel = new THREE.Vector3();
  /** What the lens looks at: the pivot, on foot moved `SHOULDER` to the right with the camera. */
  const target = new THREE.Vector3();
  const drift = new THREE.Vector3();
  /**
   * On foot, the pivot as the camera follows it: the body's head chased at
   * `CAMERA_LAG` across and `CAMERA_LAG_UP` along `up`. **The chase is on the
   * pivot and not on the lens**, so turning the view is an exact orbit round
   * the body at the frame it happens; a lens chased through space cut the
   * chord of every turn and the body drifted round the screen.
   */
  const orbit = new THREE.Vector3();
  /** How far out from the pivot the lens is held after a wall; see `WALL_RELEASE`. */
  let held = Infinity;
  const previous = new THREE.Vector3();
  /** How much of the lead term is in play; 1 in a vehicle, 0 on foot. */
  let lead = 0;
  const transport = new THREE.Quaternion();
  const framing = { distance: WALK_FRAMING.distance, height: WALK_FRAMING.height };

  /**
   * Carries the heading across the surface. Rotating it by the same rotation
   * that took the old surface normal to the new one is parallel transport along
   * the path walked: the camera keeps pointing at the same feature while you
   * walk over a pole, instead of unwinding.
   */
  function align(player: CameraSubject): void {
    if (lastUp.lengthSq() === 0) lastUp.copy(player.up);
    transport.setFromUnitVectors(lastUp, player.up);
    heading.applyQuaternion(transport);
    steer.applyQuaternion(transport);
    lastUp.copy(player.up);

    heading.projectOnPlane(player.up);
    if (heading.lengthSq() < 1e-8) heading.copy(player.forward);
    heading.normalize();
    steer.projectOnPlane(player.up);
    if (steer.lengthSq() < 1e-8) steer.copy(heading);
    steer.normalize();
  }

  /** Where the framing wants to be for what the player is currently doing. */
  function want(player: CameraSubject): void {
    if (player.ride !== null) {
      const [length, width, tall] = player.ride.model.size;
      const kind = player.ride.model.kind;
      const extent = Math.max(length, width * 0.8, tall);
      framing.distance = extent * RIDE_BACK + AVATAR_HEIGHT * 2;
      framing.height = extent * RIDE_UP + AVATAR_HEIGHT;
      if (kind === 'boat') {
        framing.distance = Math.max(framing.distance, BOAT_FRAMING.distance);
        framing.height = Math.max(framing.height, BOAT_FRAMING.height);
      } else if (kind === 'submarine' && player.depth > SUB_FRAMED_UNDER) {
        // Under the surface the camera goes down with it, level with the
        // tower, rather than hanging over the water looking down through it.
        framing.height = Math.min(framing.height, AVATAR_HEIGHT * 0.6);
      } else if ((kind === 'plane' || kind === 'balloon' || kind === 'helicopter') && player.airborne) {
        const t = clamp(player.altitude / PLANE_CEILING, 0, 1);
        // Two different eases: the angle has to open early, or the first thousand
        // units of a climb look like nothing is happening.
        const elevation = mix(FLIGHT_LOW.elevation, FLIGHT_HIGH.elevation, Math.pow(t, 0.6));
        const orbit = mix(FLIGHT_LOW.orbit, FLIGHT_HIGH.orbit, Math.sqrt(t));
        framing.distance = Math.max(framing.distance, orbit * Math.cos(elevation));
        framing.height = Math.max(framing.height, orbit * Math.sin(elevation));
      }
    } else {
      // The wheel's framing, so a landing comes back to the zoom you chose.
      walkFraming(zoomTarget, framing);
    }
  }

  /**
   * Where the camera wants to be, before any interpolation or collision. On
   * foot `follow` hands in the pivot it has smoothed (`orbit`), because on foot
   * the chase is on the pivot and the orbit round it is exact.
   */
  function place(player: CameraSubject, smoothed = false): void {
    if (smoothed) pivot.copy(orbit);
    else pivot.copy(player.position).addScaledVector(player.up, pivotHeight(player));

    // `view` sets the framing; pitch tilts that whole offset about the camera's
    // own right axis, so the distance is preserved and only the elevation
    // moves. The clamp is applied against the framing's own elevation, which is
    // why `view.height = 30000` still works as the map lever: it just arrives
    // at the ceiling instead of overshooting the pole.
    const ceiling = seated(player) ? MAX_ELEVATION_RIDING : MAX_ELEVATION;
    const base = Math.atan2(view.height, view.distance);
    pitch = Math.min(Math.max(pitch, MIN_ELEVATION - base), ceiling - base);

    right.crossVectors(heading, player.up).normalize();
    offset.copy(player.up).multiplyScalar(view.height).addScaledVector(heading, -view.distance);
    // Negative: a positive rotation about the right axis would drop the camera.
    offset.applyAxisAngle(right, -pitch);
    desired.copy(pivot).add(offset);
    // Camera and aim moved right together: see `SHOULDER`.
    const framed = seated(player) ? 0 : 1 - ramp(zoom, 2, 5);
    desired.addScaledVector(right, SHOULDER * framed);
    target.copy(pivot).addScaledVector(right, SHOULDER * framed);
  }

  /**
   * Keeps the ground out of the lens, and reports how far it had to lift the
   * camera to do it.
   *
   * The lift comes first and the pull-in second, which is not an accident. The
   * ground is a sphere, so being underground is just being shorter than the
   * local radius; lifting first means the segment test then only fires on
   * something genuinely in the way, instead of on the floor the camera was
   * about to be raised off anyway. In the other order, looking up on flat
   * ground dragged the camera into the back of the avatar's head.
   */
  function unclip(point: THREE.Vector3, groundRadiusAt: (p: THREE.Vector3) => number, walls: boolean): number {
    let lift = 0;
    const floor = groundRadiusAt(point) + CLEARANCE;
    if (point.length() < floor) {
      lift = floor - point.length();
      point.setLength(floor);
    }

    offset.copy(point).sub(pivot);
    const distance = offset.length();
    // The ground only ever pulls the lens in to `MIN_DISTANCE`, so a lens
    // already nearer than that has nothing to fear from it. From a wall it has.
    const ground = distance > MIN_DISTANCE;
    const wall = walls && distance > WALL_FLOOR ? blocks : undefined;
    if (!ground && wall === undefined) return lift;
    offset.divideScalar(distance);
    let allowed = distance;
    let least = MIN_DISTANCE;
    for (let i = 1; i <= COLLISION_STEPS; i++) {
      const t = i / COLLISION_STEPS;
      sample.copy(pivot).addScaledVector(offset, t * distance);
      // The margin grows from nothing at the pivot to the full lens
      // clearance at the far end. Demanding clearance the whole way asks the
      // ground to stay that far from the player's own shoulders, which it
      // never is: every low camera then read as blocked and got yanked into
      // the avatar's back.
      if (ground && sample.length() < groundRadiusAt(sample) + CLEARANCE * t) {
        allowed = ((i - 1) / COLLISION_STEPS) * distance;
        break;
      }
      if (wall !== undefined && wall(sample)) {
        allowed = wallAt(((i - 1) / COLLISION_STEPS) * distance, t * distance, wall) - WALL_MARGIN;
        least = WALL_FLOOR;
        break;
      }
    }
    if (allowed < distance) point.copy(pivot).addScaledVector(offset, Math.max(least, allowed));
    return lift;
  }

  /**
   * Where the segment along `offset` goes into a building, between a distance
   * that was clear and one that was not: the clear side, after `WALL_REFINE`
   * halvings. The pivot itself is always clear — the body keeps it out of every
   * footprint — so the first sample's clear side is 0.
   */
  function wallAt(clear: number, blocked: number, wall: (point: THREE.Vector3) => boolean): number {
    for (let k = 0; k < WALL_REFINE; k++) {
      const middle = (clear + blocked) / 2;
      sample.copy(pivot).addScaledVector(offset, middle);
      if (wall(sample)) blocked = middle;
      else clear = middle;
    }
    return clear;
  }

  /**
   * What the camera looks at, once the ground has had its say.
   *
   * Raising the target by exactly what the ground raised the camera leaves the
   * vector between them untouched, so the view keeps the angle the player asked
   * for. Without it, looking up from flat ground is impossible by construction:
   * the lens cannot get below the shoulders it is aiming at, so it can only
   * ever look down.
   */
  function aimAt(player: CameraSubject, lift: number): void {
    sample.copy(target).addScaledVector(player.up, lift);

    // The roll, chosen rather than inferred. `camera.up` follows the surface
    // normal — which is why the view does not roll over when you cross a pole —
    // but straight down the normal *is* the view direction and there is no roll
    // left in it to use. Fading to the heading there keeps the frame stable and
    // puts the direction of travel at the top of the screen, which is the right
    // way round for something you are reading as a map.
    look.subVectors(sample, camera.position);
    const length = look.length();
    const along = length > 1e-6 ? Math.abs(look.dot(player.up) / length) : 0;
    camera.up.copy(player.up).lerp(heading, ramp(along, ROLL_FADE_FROM, ROLL_FADE_TO)).normalize();
    camera.lookAt(sample);
  }

  /** Eases the lens towards the one for what you are doing; see `FOV_FOOT`. */
  function lens(player: CameraSubject, rate: number): void {
    const wanted = firstPerson ? (seated(player) ? FOV_COCKPIT : FOV_EYE)
      : seated(player) ? FOV_CRAFT
      : FOV_FOOT + FOV_RUN * ramp(player.velocity, WALK_SPEED, RUN_SPEED);
    if (Math.abs(wanted - camera.fov) < 0.01) return;
    camera.fov += (wanted - camera.fov) * rate;
    camera.updateProjectionMatrix();
  }

  /** True when the eye is actually in the head on foot, swimming, or falling under a canopy. */
  const inTheHead = (player: CameraSubject): boolean => firstPerson && !seated(player);

  /** Tells the player whether the eye is in his seat, when that changes. */
  function cockpitOn(player: CameraSubject, on: boolean): void {
    if (on === inCockpit) return;
    inCockpit = on;
    player.setCockpit(on);
  }

  /**
   * First person in a seat: the lens at the seated eye, turned with the
   * vehicle and then by the head. Like the eye on foot, no chase and no lag;
   * the pivot is kept on the body for `V` off.
   */
  function cockpit(player: CameraSubject): boolean {
    if (!player.seatEye(camera.position, seatTurn)) return false;
    const down = (player.ride === null ? undefined : DOWN_BY_KIND[player.ride.model.kind]) ?? COCKPIT_DOWN;
    headTurn.setFromEuler(headEuler.set(lookPitch + down, lookYaw, 0, 'YXZ'));
    camera.quaternion.copy(seatTurn).multiply(headTurn).multiply(ABOUT_FACE);
    orbit.copy(player.position).addScaledVector(player.up, pivotHeight(player));
    held = Infinity;
    cockpitOn(player, true);
    return true;
  }

  /**
   * Shows or hides the avatar.
   *
   * This used to reach into the player's scene graph and find the body by the
   * name `avatar.ts` gives its group, warning once if it was not there. The
   * warning was the right instinct about the wrong shape of problem: a rename
   * next door would still have broken first person, and the symptom is a face
   * drawn across the whole screen with nothing to say where it came from.
   * `player.setBodyVisible` cannot go quietly missing, because only that file
   * knows which object is the body and a method is a thing the compiler checks.
   */
  function showBody(player: CameraSubject, visible: boolean): void {
    player.setBodyVisible(visible);
  }

  /**
   * First person, which is the whole of the mode: there is no chase, no
   * collision test and no lerp, because there is nothing between the lens and
   * the eye and a first-person camera that lags its own head is nausea.
   *
   * Going *in* is a cut and coming *out* is a swoop, and that asymmetry is
   * free rather than chosen: this writes `camera.position` outright, so `V` on
   * is instant, while `follow`'s ordinary path lerps at `CAMERA_LAG` from
   * wherever the camera is — which on the frame after `V` off is the head. The
   * camera pulls back over about 0.4 s. Both are right for what they are: you
   * cannot be interpolated into your own eyes, and pulling out of them is a
   * move.
   *
   * `pitch` is the same accumulator the third-person rig uses — it carries the
   * mouse across the switch, so a look you were part-way through is not thrown
   * away — but it is measured from a **different neutral**, and it has to be.
   * In `place` it is an offset from the framing's own elevation, and that
   * framing looks 26.6 degrees down because the camera stands fifteen units
   * over a man's shoulders. Hand the same absolute angle to an eye and the
   * default first-person view is the grass twelve units in front of your boots,
   * with the horizon in the top twelfth of the frame: measured, and it is the
   * first thing you see on pressing `V`. Level is the neutral here, so the
   * shared number is the offset and not the angle.
   */
  function eye(player: CameraSubject): void {
    pitch = clamp(pitch, EYE_MIN_ELEVATION, EYE_MAX_ELEVATION);
    const elevation = pitch;

    camera.position.copy(player.position).addScaledVector(player.up, (player.sitting ? SEATED_EYE_HEIGHT : EYE_HEIGHT) - player.sink);
    offset.copy(heading).multiplyScalar(Math.cos(elevation))
      .addScaledVector(player.up, -Math.sin(elevation));
    // `aimAt` takes its target in `pivot`, and going through it rather than
    // calling `lookAt` here is what keeps the explicit roll: straight down, the
    // view direction is parallel to `up` and there is no roll left to infer.
    pivot.copy(camera.position).addScaledVector(offset, EYE_FOCUS);
    target.copy(pivot);
    aimAt(player, 0);
  }

  const rig: CameraRig = {
    camera,
    heading,
    steer,
    view,
    shakes: true,
    shake(strength) {
      if (!rig.shakes || !(strength > 0)) return;
      shakePower = Math.max(shakePower * (shakeLeft / SHAKE_TIME), Math.min(1, strength));
      shakeLeft = SHAKE_TIME;
    },
    get firstPerson() {
      return firstPerson;
    },
    set firstPerson(value: boolean) {
      firstPerson = value;
    },
    aim(dt, input, player) {
      // `aim` is where input becomes intent, and it is the only call that sees
      // both the keyboard and the player, so the held climb and descend are
      // forwarded from here.
      player.controls.lift = (input.climb ? 1 : 0) - (input.dive ? 1 : 0);
      // `V` is read here for the same reason the vehicle keys are: this is the
      // one call that sees the keyboard, and the mode is the rig's own state.
      if (input.view) firstPerson = !firstPerson;

      // In a seat, through the seated eyes: the mouse turns the head within
      // the seat's reach and the view is the vehicle's, so nothing else here
      // applies. The heading is kept on the bow for `V` off.
      if (firstPerson && seated(player)) {
        lookYaw = clamp(lookYaw - input.look.x, -COCKPIT_YAW, COCKPIT_YAW);
        lookPitch = clamp(lookPitch + input.look.y, -COCKPIT_PITCH, COCKPIT_PITCH);
        if (Math.abs(input.look.x) + Math.abs(input.look.y) > LOOK_DEADZONE) sinceLook = 0;
        else sinceLook += dt;
        if (sinceLook > COCKPIT_RETURN_DELAY && player.velocity > 2) {
          const back = Math.exp(-COCKPIT_RETURN * dt);
          lookYaw *= back;
          lookPitch *= back;
        }
        align(player);
        heading.copy(player.forward);
        pitch = 0;
        riding = false;
        return;
      }
      lookYaw = 0;
      lookPitch = 0;

      // The wheel, on foot and outside your own head: nearer or further along
      // the framing's own line. `exp` of the travel rather than its sign, so a
      // trackpad's stream of small deltas zooms as smoothly as it scrolls.
      if (input.zoom !== 0 && !seated(player) && !firstPerson) {
        zoomTarget = clamp(zoomTarget * Math.exp(input.zoom / ZOOM_PIXELS), ZOOM_MIN, ZOOM_MAX);
      }
      if (zoom !== zoomTarget && !seated(player) && !driving) {
        zoom += (zoomTarget - zoom) * approach(ZOOM_RATE, dt);
        if (Math.abs(zoomTarget - zoom) < 1e-3) zoom = zoomTarget;
        walkFraming(zoom, view);
      }

      align(player);
      // Mouse right turns the view right, which about `up` is a negative angle.
      if (input.look.x !== 0) {
        heading.applyAxisAngle(player.up, -input.look.x).normalize();
      }
      // Mouse down raises the camera and points it down the way a head tilts.
      pitch += input.look.y;

      const looked = Math.abs(input.look.x) > LOOK_DEADZONE;
      if (looked) { sinceLook = 0; rushing = false; }
      else sinceLook += dt;

      // Re-take the steering basis when the player says something new: the
      // movement changed, they were standing still, or the mouse turned the
      // view. `0.01` is well under the smallest step any key produces, so this
      // is "a key went down or came up" rather than a threshold on a stick.
      const moving = Math.abs(input.move.x) > 1e-3 || Math.abs(input.move.y) > 1e-3;
      const changed = Math.abs(input.move.x - lastMove.x) > 0.01
        || Math.abs(input.move.y - lastMove.y) > 0.01;
      if (!moving || !steering || changed || looked) steer.copy(heading);
      lastMove.x = input.move.x;
      lastMove.y = input.move.y;
      steering = moving;
      // Any frame out of a seat, first person included, ends a ride: the next
      // vehicle hands its opening gap to the look again.
      if (!seated(player)) riding = false;

      if (seated(player)) {
        // A vehicle has a bow, and you steer it rather than the camera, so the
        // view drifts back behind it. Yaw only: a look down at the globe is not
        // undone by this.
        cross.crossVectors(heading, player.forward);
        const away = Math.atan2(cross.dot(player.up), heading.dot(player.forward));
        // Two pulls, not one: see `TURN_TRAIL`. `heading` is the line the view
        // chases turned by `glance`, so the chase is `away + glance` short of
        // the bow. On boarding none of the gap was made by a turn, so all of it
        // is handed to the look and comes back at the rate it always did.
        if (!riding) {
          glance = -away;
          riding = true;
        } else glance = wrap(glance - input.look.x);
        const trail = wrap(away + glance);
        const settled = glance * (1 - approach(RECENTRE_RATE, dt));
        heading.applyAxisAngle(player.up, trail * approach(1 / TURN_TRAIL, dt) + settled - glance).normalize();
        glance = settled;
      } else if (!firstPerson) {
        // The same swing, gated four ways, and in first person there is no
        // "behind" to swing to: the heading is the facing. See RETURN_GAIN.
        const pull = Math.min(1, Math.hypot(input.move.x, input.move.y))
          * ramp(sinceLook, RETURN_DELAY, RETURN_DELAY + RETURN_EASE);
        if (pull > 0) {
          cross.crossVectors(heading, player.forward);
          const away = Math.atan2(cross.dot(player.up), heading.dot(player.forward));
          // The ceiling opens with the error, and **the speed factor rides the
          // radius half only**. `velocity / RETURN_RADIUS` is there to hold the
          // arc at one radius whether you walk or run; the rush explicitly abandons
          // the radius law, so scaling it by speed would put the same argument
          // on both sides of its own exception — and it measures as one, a
          // half-turn at a walk taking 3.5 s instead of 1.2.
          const radiusRate = player.velocity / RETURN_RADIUS;
          // **And the rush latches, because gating it on the error alone leaves
          // a tail longer than the turn.** Ramping the ceiling down as the gap
          // closes means the last 50 degrees are priced as a curve again, and a
          // half-turn at a walk took 7.6 s of which 6.5 was that tail. An
          // about-face is one event: once it starts it finishes, and what ends
          // it is arriving or the player taking the mouse.
          if (Math.abs(away) > RETURN_WIDE) rushing = true;
          const ceiling = rushing ? RETURN_RUSH : radiusRate;
          const step = Math.min(Math.abs(away) * RETURN_GAIN, ceiling) * pull * dt;
          // Landing rather than approaching: past this the camera *is* behind
          // you, and an ease that only ever halves the gap never says so.
          const landed = Math.abs(away) <= Math.max(step, RETURN_SNAP);
          if (landed) rushing = false;
          heading.applyAxisAngle(player.up, landed ? away : Math.sign(away) * step).normalize();
        }
      }
    },
    follow(dt, player, groundRadiusAt) {
      want(player);
      lens(player, approach(FOV_RATE, dt));
      if (seated(player)) driving = true;
      if (driving) {
        const rate = approach(FRAMING_RATE, dt);
        view.distance += (framing.distance - view.distance) * rate;
        view.height += (framing.height - view.height) * rate;
        // Hand `view` back once a landing has finished putting it away, so the
        // console lever stays the player's on foot.
        if (
          !seated(player) &&
          Math.abs(view.distance - framing.distance) < 0.5 &&
          Math.abs(view.height - framing.height) < 0.5
        ) {
          view.distance = framing.distance;
          view.height = framing.height;
          driving = false;
        }
      }

      // Where the vehicle will be, not where it is. Adding the trail back on
      // cancels it exactly and leaves the smoothing to do what it is actually
      // for, which is absorbing turns rather than lagging behind a straight
      // line. Measured from the position rather than asked of the player,
      // because a climb is part of it and `velocity` is only the ground speed.
      travel.subVectors(player.position, previous);
      previous.copy(player.position);
      lead += ((seated(player) ? 1 : 0) - lead) * approach(FRAMING_RATE, dt);
      // `v / CAMERA_LAG` is the trail of the continuous chase; the discrete one
      // below trails slightly less, and using the continuous figure overshoots
      // the target enough to push the camera past the vertical at cruise.
      // Guarded: two frames in the same millisecond give dt = 0, and an
      // unguarded 0 * Infinity here would poison the camera for the session.
      const chase = approach(CAMERA_LAG, dt);
      const trail = chase > 1e-6 ? (1 - chase) / chase : 0;

      align(player);
      if (firstPerson && seated(player) && cockpit(player)) return;
      cockpitOn(player, false);
      if (inTheHead(player)) {
        // The pivot kept on the body, so that `V` off pulls back from the
        // head and not from wherever first person began.
        orbit.copy(player.position).addScaledVector(player.up, pivotHeight(player));
        held = Infinity;
        showBody(player, false);
        eye(player);
        return;
      }
      if (!seated(player)) {
        // Chase the pivot, then orbit it exactly.
        drift.copy(player.position).addScaledVector(player.up, pivotHeight(player)).sub(orbit);
        // A jump of twenty bodies is caught outright, height and all. Scaling
        // the drift by `1 / chase` for it caught only the level part (the rise
        // goes at the slower `CAMERA_LAG_UP`), and in a frame with no time in
        // it `1 / chase` is Infinity and the orbit NaN for good.
        if (drift.lengthSq() > AVATAR_HEIGHT * AVATAR_HEIGHT * 400) orbit.add(drift);
        else {
          const rise = drift.dot(player.up);
          drift.addScaledVector(player.up, -rise);
          const climbing = dt > 0 ? Math.abs(travel.dot(player.up)) / dt : 0;
          orbit.addScaledVector(drift, chase).addScaledVector(player.up, rise * approach(Math.max(CAMERA_LAG_UP, climbing / RISE_TRAIL), dt));
        }
        place(player, true);
        const lift = unclip(desired, groundRadiusAt, true);
        // A wall pulls the lens in at once and lets it out gently.
        drift.subVectors(desired, pivot);
        const reach = drift.length();
        held = reach < held ? reach : held + (reach - held) * approach(WALL_RELEASE, dt);
        camera.position.copy(pivot).addScaledVector(drift, reach > 1e-6 ? held / reach : 0);
        showBody(player, camera.position.distanceTo(pivot) > BODY_NEAR);
        aimAt(player, lift);
        return;
      }
      // In a craft the lens is chased as it always was, and the pivot is
      // kept where the body is for the step back ashore.
      orbit.copy(player.position).addScaledVector(player.up, PIVOT_HEIGHT);
      held = Infinity;
      place(player);
      desired.addScaledVector(travel, lead * trail);
      const walls = false;
      // The ground is answered where the camera wants to be, not where it has
      // got to so far. Measured after the interpolation, the lift is only the
      // sliver the lerp gave back each frame, and the aim barely moves.
      const lift = unclip(desired, groundRadiusAt, walls);
      // Across at the chase and along `up` slower, on foot: see `CAMERA_LAG_UP`.
      drift.subVectors(desired, camera.position);
      const rise = drift.dot(player.up);
      drift.addScaledVector(player.up, -rise);
      camera.position.addScaledVector(drift, chase)
        .addScaledVector(player.up, rise * (walls ? approach(CAMERA_LAG_UP, dt) : chase));
      // Again on the smoothed position, because the lerp cuts corners: it
      // crosses the ground the target was already clear of — and a lens
      // swinging back out after a wall passes through the building it left.
      unclip(camera.position, groundRadiusAt, walls);
      showBody(player, camera.position.distanceTo(pivot) > BODY_NEAR);
      aimAt(player, lift);
    },
    snap(player, groundRadiusAt) {
      lens(player, 1);
      lastUp.copy(player.up);
      // Without this the frame after a teleport measures the whole jump as one
      // frame of velocity, and the lead throws the camera across the planet.
      previous.copy(player.position);
      lead = seated(player) ? 1 : 0;
      // A heading carried across a teleport points at nothing in particular, so
      // it is rebuilt from the player's own facing.
      heading.copy(player.forward).projectOnPlane(player.up);
      if (heading.lengthSq() < 1e-8) heading.set(0, 0, 1).projectOnPlane(player.up);
      heading.normalize();
      // The view is dead astern now, so a craft has no look left to return.
      glance = 0;
      riding = seated(player);

      // Only take `view` over if the rig already owns it, or is about to: a
      // teleport must not quietly reset a framing the console set by hand.
      if (driving || seated(player)) {
        want(player);
        view.distance = framing.distance;
        view.height = framing.height;
        driving = seated(player);
      }

      if (firstPerson && seated(player) && cockpit(player)) return;
      cockpitOn(player, false);
      if (inTheHead(player)) {
        // The pivot kept on the body, so that `V` off pulls back from the
        // head and not from wherever first person began.
        orbit.copy(player.position).addScaledVector(player.up, pivotHeight(player));
        held = Infinity;
        showBody(player, false);
        eye(player);
        return;
      }

      orbit.copy(player.position).addScaledVector(player.up, pivotHeight(player));
      held = Infinity;
      place(player, !seated(player));
      const lift = unclip(desired, groundRadiusAt, !seated(player));
      camera.position.copy(desired);
      showBody(player, camera.position.distanceTo(pivot) > BODY_NEAR);
      aimAt(player, lift);
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
  };

  /** Takes last frame's shake off the lens, so the chase starts from where it left it. */
  function unshake(): void {
    camera.position.sub(shaken);
    shaken.set(0, 0, 0);
  }

  /**
   * Lays this frame's shake on: two incommensurate sines across the lens's own
   * right and up, dying as the square of the time left.
   */
  function shakeStep(dt: number): void {
    if (shakeLeft <= 0) return;
    shakeLeft = Math.max(0, shakeLeft - dt);
    shakeClock += dt;
    if (!rig.shakes) {
      shakeLeft = 0;
      return;
    }
    const fall = shakeLeft / SHAKE_TIME;
    const reach = SHAKE_REACH * shakePower * fall * fall;
    shakeAxis.set(1, 0, 0).applyQuaternion(camera.quaternion);
    shaken.copy(shakeAxis).multiplyScalar(Math.sin(shakeClock * 47) * reach);
    shakeAxis.set(0, 1, 0).applyQuaternion(camera.quaternion);
    shaken.addScaledVector(shakeAxis, Math.sin(shakeClock * 61 + 1.3) * reach * 0.7);
    camera.position.add(shaken);
  }

  const chase = rig.follow;
  const snapTo = rig.snap;
  rig.follow = (dt, player, groundRadiusAt) => {
    unshake();
    chase(dt, player, groundRadiusAt);
    shakeStep(dt);
  };
  rig.snap = (player, groundRadiusAt) => {
    shaken.set(0, 0, 0);
    shakeLeft = 0;
    snapTo(player, groundRadiusAt);
  };
  return rig;
}
