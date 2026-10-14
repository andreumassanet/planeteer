/**
 * Mouse look and the swing back behind the player: the wheel, the heading, and the steering basis.
 */
import type { InputState } from '../input.ts';
import {
  COCKPIT_PITCH,
  COCKPIT_RETURN,
  COCKPIT_RETURN_DELAY,
  COCKPIT_YAW,
  LOOK_DEADZONE,
  RECENTRE_RATE,
  RETURN_DELAY,
  RETURN_EASE,
  RETURN_GAIN,
  RETURN_RADIUS,
  RETURN_RUSH,
  RETURN_SNAP,
  RETURN_WIDE,
  TURN_TRAIL,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_PIXELS,
  ZOOM_RATE,
} from './constants.ts';
import { approach, clamp, ramp, seated, wrap } from './math.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';
import type { Heading } from './heading.ts';
import type { Framing } from './framing.ts';

export function createLook(core: CameraCore, carrying: Heading, framer: Framing) {
  const { cross, heading, lastMove, steer, view } = core;
  const s = core.fields;
  const { align } = carrying;
  const { walkFraming } = framer;

  /**
   * Update yaw and pitch from mouse look. This is where input becomes intent, and
   * the only call that sees both the keyboard and the player, so the held climb and
   * descend and the `V` toggle are read here.
   */
  function aim(dt: number, input: InputState, player: CameraSubject): void {
    // `aim` is where input becomes intent, and it is the only call that sees
    // both the keyboard and the player, so the held climb and descend are
    // forwarded from here.
    player.controls.lift = (input.climb ? 1 : 0) - (input.dive ? 1 : 0);
    // `V` is read here for the same reason the vehicle keys are: this is the
    // one call that sees the keyboard, and the mode is the rig's own state.
    if (input.view) s.firstPerson = !s.firstPerson;

    // In a seat, through the seated eyes: the mouse turns the head within
    // the seat's reach and the view is the vehicle's, so nothing else here
    // applies. The heading is kept on the bow for `V` off.
    if (s.firstPerson && seated(player)) {
      s.lookYaw = clamp(s.lookYaw - input.look.x, -COCKPIT_YAW, COCKPIT_YAW);
      s.lookPitch = clamp(s.lookPitch + input.look.y, -COCKPIT_PITCH, COCKPIT_PITCH);
      if (Math.abs(input.look.x) + Math.abs(input.look.y) > LOOK_DEADZONE) s.sinceLook = 0;
      else s.sinceLook += dt;
      if (s.sinceLook > COCKPIT_RETURN_DELAY && player.velocity > 2) {
        const back = Math.exp(-COCKPIT_RETURN * dt);
        s.lookYaw *= back;
        s.lookPitch *= back;
      }
      align(player);
      heading.copy(player.forward);
      s.pitch = 0;
      s.riding = false;
      return;
    }
    s.lookYaw = 0;
    s.lookPitch = 0;

    // The wheel, on foot and outside your own head: nearer or further along
    // the framing's own line, by `exp` of the travel so a trackpad's stream of
    // small deltas zooms as smoothly as it scrolls.
    if (input.zoom !== 0 && !seated(player) && !s.firstPerson) {
      s.zoomTarget = clamp(s.zoomTarget * Math.exp(input.zoom / ZOOM_PIXELS), ZOOM_MIN, ZOOM_MAX);
    }
    if (s.zoom !== s.zoomTarget && !seated(player) && !s.driving) {
      s.zoom += (s.zoomTarget - s.zoom) * approach(ZOOM_RATE, dt);
      if (Math.abs(s.zoomTarget - s.zoom) < 1e-3) s.zoom = s.zoomTarget;
      walkFraming(s.zoom, view);
    }

    align(player);
    // Mouse right turns the view right, which about `up` is a negative angle.
    if (input.look.x !== 0) {
      heading.applyAxisAngle(player.up, -input.look.x).normalize();
    }
    // Mouse down raises the camera and points it down the way a head tilts.
    s.pitch += input.look.y;

    const looked = Math.abs(input.look.x) > LOOK_DEADZONE;
    if (looked) { s.sinceLook = 0; s.rushing = false; }
    else s.sinceLook += dt;

    // Re-take the steering basis when the movement changed, the player was
    // standing still, or the mouse turned the view. 0.01 is well under the
    // smallest step any key produces: this is "a key went down or came up".
    const moving = Math.abs(input.move.x) > 1e-3 || Math.abs(input.move.y) > 1e-3;
    const changed = Math.abs(input.move.x - lastMove.x) > 0.01
      || Math.abs(input.move.y - lastMove.y) > 0.01;
    if (!moving || !s.steering || changed || looked) steer.copy(heading);
    lastMove.x = input.move.x;
    lastMove.y = input.move.y;
    s.steering = moving;
    // Any frame out of a seat, first person included, ends a ride: the next
    // vehicle hands its opening gap to the look again.
    if (!seated(player)) s.riding = false;

    if (seated(player)) {
      // A vehicle has a bow, and you steer it rather than the camera, so the
      // view drifts back behind it. Yaw only: a look down at the globe is not
      // undone by this.
      cross.crossVectors(heading, player.forward);
      const away = Math.atan2(cross.dot(player.up), heading.dot(player.forward));
      // Two pulls: see `TURN_TRAIL`. `heading` is the line the view chases
      // turned by `glance`, so the chase is `away + glance` short of the bow.
      // On boarding none of the gap was made by a turn, so all of it is handed
      // to the look.
      if (!s.riding) {
        s.glance = -away;
        s.riding = true;
      } else s.glance = wrap(s.glance - input.look.x);
      const trail = wrap(away + s.glance);
      const settled = s.glance * (1 - approach(RECENTRE_RATE, dt));
      heading.applyAxisAngle(player.up, trail * approach(1 / TURN_TRAIL, dt) + settled - s.glance).normalize();
      s.glance = settled;
    } else if (!s.firstPerson) {
      // The same swing, gated four ways, and in first person there is no
      // "behind" to swing to: the heading is the facing. See RETURN_GAIN.
      const pull = Math.min(1, Math.hypot(input.move.x, input.move.y))
        * ramp(s.sinceLook, RETURN_DELAY, RETURN_DELAY + RETURN_EASE);
      if (pull > 0) {
        cross.crossVectors(heading, player.forward);
        const away = Math.atan2(cross.dot(player.up), heading.dot(player.forward));
        // The ceiling opens with the error. Speed scales only the radius law
        // (`velocity / RETURN_RADIUS` holds the arc at one radius at any pace);
        // the rush abandons that law, so it is not scaled by speed.
        const radiusRate = player.velocity / RETURN_RADIUS;
        // The rush latches: an about-face is one event, so once it starts it
        // finishes, ended by arriving or by the player taking the mouse.
        // Gating it on the error alone would price the last 50 degrees as a
        // curve again and leave a long tail.
        if (Math.abs(away) > RETURN_WIDE) s.rushing = true;
        const ceiling = s.rushing ? RETURN_RUSH : radiusRate;
        const step = Math.min(Math.abs(away) * RETURN_GAIN, ceiling) * pull * dt;
        // Landing rather than approaching: past this the camera *is* behind
        // you, and an ease that only ever halves the gap never says so.
        const landed = Math.abs(away) <= Math.max(step, RETURN_SNAP);
        if (landed) s.rushing = false;
        heading.applyAxisAngle(player.up, landed ? away : Math.sign(away) * step).normalize();
      }
    }
  }

  return { aim };
}

export type Look = ReturnType<typeof createLook>;
