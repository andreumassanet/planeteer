import * as THREE from 'three';
import { FIGURE, RUN_SPEED } from './avatar.ts';
import { PLANET_RADIUS } from './globe.ts';
import type { Player } from './player.ts';
import type { InputState } from './input.ts';
import { PLANE_CEILING } from './vehicles.ts';

const NEAR = 5;
const FAR = PLANET_RADIUS * 10;
const FOV = 55;

/**
 * How hard the camera chases per second. Higher is tighter and twitchier.
 *
 * An exponential chase trails a target moving at `v` by exactly `v / this`. On
 * foot at a run that is 19 units and it reads as weight, which is why the
 * number is low. At 3,400 units/s it is 490 — enough to drag the camera out of
 * the sky and back down level with the plane, so the framing would say
 * "overhead, looking at the globe" and the picture would say "level flight".
 * See the lead term in `follow`.
 */
const CAMERA_LAG = 7;
/** Roughly the avatar's shoulders: what the camera actually looks at. */
const PIVOT_HEIGHT = 5;

const DEG = Math.PI / 180;
/**
 * Elevation of the camera above the player's own horizon.
 *
 * The floor is negative so you can get under a monument and look up it: they
 * run to 140 units against an avatar of 6.5, and from a fixed overhead camera
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
const CLEARANCE = NEAR * 1.6;
const MIN_DISTANCE = NEAR * 2;
/** Samples along the player-to-camera segment when testing for ground. */
const COLLISION_STEPS = 6;

/** Framing on foot: what `view` is, and what it returns to after a landing. */
const WALK_FRAMING = { distance: 30, height: 15 };
/** In the boat: wider, because the hull is longer than the avatar is tall. */
const BOAT_FRAMING = { distance: 46, height: 20 };

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
const FLIGHT_LOW = { orbit: 62, elevation: 17 * DEG };
const FLIGHT_HIGH = { orbit: 340, elevation: 88 * DEG };
/** How fast the framing follows a change of vehicle. 0.5 s, so it reads as a move. */
const FRAMING_RATE = 2.2;

/**
 * How fast the view swings back behind a vehicle you are steering.
 *
 * Slow enough that the mouse still wins while it is moving, fast enough that
 * letting go of it puts the bow back in the middle of the frame. On foot there
 * is no such pull: there the camera is where you point it and the body follows.
 */
const RECENTRE_RATE = 1.4;

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
 *   `velocity / RUN_SPEED` is the second half, and what it buys is that the
 *   thing held constant is the **radius** of the curve rather than the rate of
 *   it.
 *
 *   **It used to be `max(0, move.y)`, and that clamp was the fix for the wrong
 *   half of the problem.** It stopped `S` being an oscillator — swing the
 *   camera behind a man walking backwards and `S` points the other way, so he
 *   turns, so the camera swings again — at the cost of the thing the user
 *   actually wanted: *"si camino con la S no veo por donde voy"*. The
 *   oscillation is not caused by the pull, it is caused by the input being
 *   **re-derived from the camera every frame**, so the fix belongs at that end.
 *   `steer` below latches the basis, and with the feedback broken the clamp has
 *   nothing left to prevent: it is `min(1, |move|)` now, so `S` swings the
 *   camera round and a pure strafe still does, because `A` with the camera
 *   coming behind you is a person sidestepping and then walking where they are
 *   looking, which is what a person does. A fixed rate is a 329-unit turn at a run and a 114-unit one at a walk,
 *   which is the same law reading as a drift and as a spin depending only on
 *   whether Shift is down. Rate proportional to speed is one radius at both.
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
 * `RETURN_MAX` is chosen by what a **held diagonal** describes, because that is
 * the only case where this does visible work — see the trap in CLAUDE.md.
 * Measured, holding `W`+`A`: the error settles at 41.4 degrees rather than 45 —
 * the camera never catches a diagonal, because the input is re-derived from the
 * camera every frame — and the camera then turns for ever at 21.9 deg/s at a
 * run and 7.6 at a walk, which is **340 units of radius at both**, 50 avatars,
 * 44 degrees of turn in two seconds. That is the curve somebody running makes
 * when they change their mind about where they are going. `RETURN_GAIN` governs
 * only the small errors and there it is worth almost nothing: measured, a
 * 90-degree swing followed by `W` is closed 85 degrees by the body's own turn
 * and 4.7 by this.
 */
const RETURN_GAIN = 2.6;
const RETURN_MAX = 32 * DEG;
/**
 * The ceiling when the error is large, and why there are two of them.
 *
 * `RETURN_MAX` is a **radius**: 32 deg/s times `velocity / RUN_SPEED` holds the
 * camera's arc at 340 units whether you walk or run, which is the curve
 * somebody running makes when they change their mind. That is the right law for
 * a small error, because a small error *is* a curve you are walking.
 *
 * **An about-face is not a curve.** Press `S` and the body has already turned —
 * `TURN_SMOOTHING` is 0.09 s — so what is left is the camera trailing a body
 * that is facing the other way, and pricing that as an arc gives a half-turn a
 * radius of 340 units: measured before this, holding `S` at a walk closed 26.5
 * degrees in 2.4 seconds, **11 deg/s, about fourteen seconds and a thousand
 * units of walking to come round.** The user's report of it was exact: *"si
 * camino con la S no veo por donde voy"*.
 *
 * So the ceiling opens with the error, from the radius law at `RETURN_WIDE`
 * (below which nothing changes, and the 340-unit measurement still holds) to
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
 * The eye is the avatar's own. `avatar.ts` stands its two eye boxes 0.62 above
 * `FIGURE.chinY`, so this is 5.72 of a 6.8-unit figure — 0.84 of its height,
 * low for a person and right for a four-head one — and what you see is what it
 * sees. Derived rather than written down because those proportions are still
 * being tuned: a literal 5.72 would slide off the head the first time `chinY`
 * moved, and nothing on screen would say so.
 *
 * **The body is hidden rather than clipped.** In first person `main.ts` puts
 * the near plane at 0.86 units and the head is 0.78 across sitting on the lens;
 * what you would see is not a face but a full-screen rectangle of ink, because
 * `OutlineEffect` hulls the mesh and the hull is the thing you are inside.
 * Hiding the avatar leaves the boat and the plane standing — they are its
 * siblings in `player.ts`'s `craft` group, not its children.
 *
 * There is deliberately **no head bob**: the eye rides `player.position`, not
 * the avatar's head. The walk cycle moves that head, and that is a good thing
 * to watch from behind and a bad thing to be inside.
 */
const EYE_HEIGHT = FIGURE.chinY + 0.62;
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
   * It applies **on foot only**, and that is a decision rather than a gap. The
   * boat and the plane are framed from their own geometry, and the plane's
   * whole design is that climbing swings the camera overhead and turns the
   * flight into the map — a cockpit view is the one framing that would take
   * that away. Boarding suspends first person and stepping back ashore returns
   * it, with no second key to remember.
   */
  firstPerson: boolean;
  /** Update yaw/pitch from mouse look. Call BEFORE player.update. */
  aim(dt: number, input: InputState, player: Player): void;
  /** Chase the player. Call AFTER player.update. */
  follow(dt: number, player: Player, groundRadiusAt: (p: THREE.Vector3) => number): void;
  /** Place the camera with no interpolation: first frame, and after a teleport. */
  snap(player: Player, groundRadiusAt: (p: THREE.Vector3) => number): void;
  resize(width: number, height: number): void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
/** Smooth 0..1 ramp between two thresholds. */
function ramp(value: number, from: number, to: number): number {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR);
  const view = { distance: WALK_FRAMING.distance, height: WALK_FRAMING.height };

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

  /** True while the rig owns `view`; see the interface. */
  let driving = false;
  /** See the interface. `V` toggles it; the eye is only ever used on foot. */
  let firstPerson = false;
  /**
   * Seconds since the mouse last turned the view. Starts past the whole ramp so
   * the first step you take is followed, rather than waiting out a look nobody
   * made.
   */
  let sinceLook = RETURN_DELAY + RETURN_EASE;
  /** The avatar's group, looked up once and hidden while the eye is inside it. */

  const pivot = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const look = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const travel = new THREE.Vector3();
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
  function align(player: Player): void {
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

  /** Where the framing wants to be for what the player is currently riding. */
  function want(player: Player): void {
    if (player.vehicle === 'plane') {
      const t = clamp(player.altitude / PLANE_CEILING, 0, 1);
      // Two different eases: the angle has to open early, or the first thousand
      // units of a climb look like nothing is happening.
      const elevation = mix(FLIGHT_LOW.elevation, FLIGHT_HIGH.elevation, Math.pow(t, 0.6));
      const orbit = mix(FLIGHT_LOW.orbit, FLIGHT_HIGH.orbit, Math.sqrt(t));
      framing.distance = orbit * Math.cos(elevation);
      framing.height = orbit * Math.sin(elevation);
    } else if (player.vehicle === 'boat') {
      framing.distance = BOAT_FRAMING.distance;
      framing.height = BOAT_FRAMING.height;
    } else {
      framing.distance = WALK_FRAMING.distance;
      framing.height = WALK_FRAMING.height;
    }
  }

  /** Where the camera wants to be, before any interpolation or collision. */
  function place(player: Player): void {
    pivot.copy(player.position).addScaledVector(player.up, PIVOT_HEIGHT);

    // `view` sets the framing; pitch tilts that whole offset about the camera's
    // own right axis, so the distance is preserved and only the elevation
    // moves. The clamp is applied against the framing's own elevation, which is
    // why `view.height = 30000` still works as the map lever: it just arrives
    // at the ceiling instead of overshooting the pole.
    const ceiling = player.vehicle === 'foot' ? MAX_ELEVATION : MAX_ELEVATION_RIDING;
    const base = Math.atan2(view.height, view.distance);
    pitch = Math.min(Math.max(pitch, MIN_ELEVATION - base), ceiling - base);

    right.crossVectors(heading, player.up).normalize();
    offset.copy(player.up).multiplyScalar(view.height).addScaledVector(heading, -view.distance);
    // Negative: a positive rotation about the right axis would drop the camera.
    offset.applyAxisAngle(right, -pitch);
    desired.copy(pivot).add(offset);
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
  function unclip(point: THREE.Vector3, groundRadiusAt: (p: THREE.Vector3) => number): number {
    let lift = 0;
    const floor = groundRadiusAt(point) + CLEARANCE;
    if (point.length() < floor) {
      lift = floor - point.length();
      point.setLength(floor);
    }

    offset.copy(point).sub(pivot);
    const distance = offset.length();
    if (distance > MIN_DISTANCE) {
      offset.divideScalar(distance);
      let allowed = distance;
      for (let i = 1; i <= COLLISION_STEPS; i++) {
        const t = i / COLLISION_STEPS;
        sample.copy(pivot).addScaledVector(offset, t * distance);
        // The margin grows from nothing at the pivot to the full lens
        // clearance at the far end. Demanding clearance the whole way asks the
        // ground to stay 8 units from the player's own shoulders, which it
        // never is: every low camera then read as blocked and got yanked into
        // the avatar's back.
        if (sample.length() < groundRadiusAt(sample) + CLEARANCE * t) {
          allowed = ((i - 1) / COLLISION_STEPS) * distance;
          break;
        }
      }
      point.copy(pivot).addScaledVector(offset, Math.max(MIN_DISTANCE, allowed));
    }
    return lift;
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
  function aimAt(player: Player, lift: number): void {
    sample.copy(pivot).addScaledVector(player.up, lift);

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

  /** True when the eye is actually in the head: first person is a foot mode. */
  const inTheHead = (player: Player): boolean => firstPerson && player.vehicle === 'foot';

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
  function showBody(player: Player, visible: boolean): void {
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
  function eye(player: Player): void {
    pitch = clamp(pitch, EYE_MIN_ELEVATION, EYE_MAX_ELEVATION);
    const elevation = pitch;

    camera.position.copy(player.position).addScaledVector(player.up, EYE_HEIGHT);
    offset.copy(heading).multiplyScalar(Math.cos(elevation))
      .addScaledVector(player.up, -Math.sin(elevation));
    // `aimAt` takes its target in `pivot`, and going through it rather than
    // calling `lookAt` here is what keeps the explicit roll: straight down, the
    // view direction is parallel to `up` and there is no roll left to infer.
    pivot.copy(camera.position).addScaledVector(offset, EYE_FOCUS);
    aimAt(player, 0);
  }

  return {
    camera,
    heading,
    steer,
    view,
    get firstPerson() {
      return firstPerson;
    },
    set firstPerson(value: boolean) {
      firstPerson = value;
    },
    aim(dt, input, player) {
      // `aim` is where input becomes intent, and it is the only call that sees
      // both the keyboard and the player, so the vehicle keys are forwarded
      // from here. The player treats them as a slot, not an event: setting the
      // same command twice in a frame still performs it once.
      if (input.fly) player.controls.command = 'fly';
      else if (input.exit) player.controls.command = 'exit';
      player.controls.lift = (input.climb ? 1 : 0) - (input.dive ? 1 : 0);
      // `V` is read here for the same reason the vehicle keys are: this is the
      // one call that sees the keyboard, and the mode is the rig's own state.
      if (input.view) firstPerson = !firstPerson;

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

      if (player.vehicle !== 'foot') {
        // A vehicle has a bow, and you steer it rather than the camera, so the
        // view drifts back behind it. Yaw only: a look down at the globe is not
        // undone by this.
        cross.crossVectors(heading, player.forward);
        const away = Math.atan2(cross.dot(player.up), heading.dot(player.forward));
        heading.applyAxisAngle(player.up, away * approach(RECENTRE_RATE, dt)).normalize();
      } else if (!firstPerson) {
        // The same swing, gated four ways, and in first person there is no
        // "behind" to swing to: the heading is the facing. See RETURN_GAIN.
        const pull = Math.min(1, Math.hypot(input.move.x, input.move.y))
          * ramp(sinceLook, RETURN_DELAY, RETURN_DELAY + RETURN_EASE);
        if (pull > 0) {
          cross.crossVectors(heading, player.forward);
          const away = Math.atan2(cross.dot(player.up), heading.dot(player.forward));
          // The ceiling opens with the error, and **the speed factor rides the
          // radius half only**. `velocity / RUN_SPEED` is there to hold the arc
          // at 340 units whether you walk or run; the rush explicitly abandons
          // the radius law, so scaling it by speed would put the same argument
          // on both sides of its own exception — and it measures as one, a
          // half-turn at a walk taking 3.5 s instead of 1.2.
          const radiusRate = RETURN_MAX * Math.min(1, player.velocity / RUN_SPEED);
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
      if (player.vehicle !== 'foot') driving = true;
      if (driving) {
        const rate = approach(FRAMING_RATE, dt);
        view.distance += (framing.distance - view.distance) * rate;
        view.height += (framing.height - view.height) * rate;
        // Hand `view` back once a landing has finished putting it away, so the
        // console lever stays the player's on foot.
        if (
          player.vehicle === 'foot' &&
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
      lead += ((player.vehicle === 'foot' ? 0 : 1) - lead) * approach(FRAMING_RATE, dt);
      // `v / CAMERA_LAG` is the trail of the continuous chase; the discrete one
      // below trails slightly less, and using the continuous figure overshoots
      // the target enough to push the camera past the vertical at cruise.
      // Guarded: two frames in the same millisecond give dt = 0, and an
      // unguarded 0 * Infinity here would poison the camera for the session.
      const chase = approach(CAMERA_LAG, dt);
      const trail = chase > 1e-6 ? (1 - chase) / chase : 0;

      align(player);
      showBody(player, !inTheHead(player));
      if (inTheHead(player)) {
        eye(player);
        return;
      }
      place(player);
      desired.addScaledVector(travel, lead * trail);
      // The ground is answered where the camera wants to be, not where it has
      // got to so far. Measured after the interpolation, the lift is only the
      // sliver the lerp gave back each frame, and the aim barely moves.
      const lift = unclip(desired, groundRadiusAt);
      camera.position.lerp(desired, chase);
      // Again on the smoothed position, because the lerp cuts corners: it
      // crosses the ground the target was already clear of.
      unclip(camera.position, groundRadiusAt);
      aimAt(player, lift);
    },
    snap(player, groundRadiusAt) {
      lastUp.copy(player.up);
      // Without this the frame after a teleport measures the whole jump as one
      // frame of velocity, and the lead throws the camera across the planet.
      previous.copy(player.position);
      lead = player.vehicle === 'foot' ? 0 : 1;
      // A heading carried across a teleport points at nothing in particular, so
      // it is rebuilt from the player's own facing.
      heading.copy(player.forward).projectOnPlane(player.up);
      if (heading.lengthSq() < 1e-8) heading.set(0, 0, 1).projectOnPlane(player.up);
      heading.normalize();

      // Only take `view` over if the rig already owns it, or is about to: a
      // teleport must not quietly reset a framing the console set by hand.
      if (driving || player.vehicle !== 'foot') {
        want(player);
        view.distance = framing.distance;
        view.height = framing.height;
        driving = player.vehicle !== 'foot';
      }

      showBody(player, !inTheHead(player));
      if (inTheHead(player)) {
        eye(player);
        return;
      }

      place(player);
      const lift = unclip(desired, groundRadiusAt);
      camera.position.copy(desired);
      aimAt(player, lift);
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
  };
}
