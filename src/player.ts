/**
 * The spherical player controller: walking, swimming and diving, driving,
 * sailing and flying, getting in and out of vehicles, and the fall from an
 * aircraft. The player is a position on the sphere and a surface frame; every
 * mode rotates that frame about the player's own axes, so there is no pole.
 *
 * The modes live in `player/` (one module each) over a shared `PlayerCore`;
 * this file builds them and routes each frame to the one that is active.
 */
import type { World } from './geo.ts';
import { roadOf } from './player/constants.ts';
import { createPlayerCore } from './player/core.ts';
import { createBalloon } from './player/balloon.ts';
import { createBody } from './player/body.ts';
import { createChute } from './player/chute.ts';
import { createFlight } from './player/flight.ts';
import { createFrame } from './player/frame.ts';
import { createHelicopter } from './player/helicopter.ts';
import { createPlane } from './player/plane.ts';
import { createBailOut } from './player/bail-out.ts';
import { createDismount } from './player/dismount.ts';
import { createMount } from './player/mount.ts';
import { createPresentation } from './player/presentation.ts';
import { createRidePose } from './player/ride-pose.ts';
import { createRunway } from './player/runway.ts';
import { createStance } from './player/stance.ts';
import { createTeleport } from './player/teleport.ts';
import { createPublish } from './player/publish.ts';
import { createRoad } from './player/road.ts';
import { createSplash } from './player/splash.ts';
import { createSwim } from './player/swim.ts';
import { createWalk } from './player/walk.ts';
import { createWalls } from './player/walls.ts';
import { createWater } from './player/water.ts';
import type { Player, PlayerInput, PlayerOptions } from './player/types.ts';

export type { Player, PlayerEvent, PlayerInput, PlayerOptions, Ride } from './player/types.ts';
export { writePose } from './player/pose.ts';
export {
  BODY_RADIUS,
  DIVE_SPEED,
  RISE_SPEED,
  STEP_UP,
  SWIM_DEPTH,
  SWIM_OUT,
  SWIM_SPEED,
  SWIM_SPRINT,
} from './player/constants.ts';

export function createPlayer(
  world: World,
  startLat: number,
  startLon: number,
  options: PlayerOptions = {},
): Player {
  const core = createPlayerCore(world, options);
  const { avatar, object, position, forward, up, motion, carried, controls } = core;
  const s = core.fields;

  const wallSet = createWalls(core);
  const frame = createFrame(core);
  const body = createBody(core);
  const ring = createSplash(core);
  const swim = createSwim(core, ring);
  const walker = createWalk(core, frame, wallSet, swim);
  const road = createRoad(core, frame, wallSet, ring);
  const water = createWater(core, frame);
  const flight = createFlight(core, frame);
  const runway = createRunway(core, road, flight, ring);
  const plane = createPlane(core, frame, wallSet, runway, flight, ring);
  const balloon = createBalloon(core, frame, wallSet, flight, ring);
  const helicopter = createHelicopter(core, frame, wallSet, flight, ring);
  const chute = createChute(core, frame, wallSet, swim);
  const published = createPublish(core);
  const ridePose = createRidePose(core, body);
  const presentation = createPresentation(core, ring, ridePose, chute);
  const stance = createStance(core);
  const mount = createMount(core, stance, body, published, presentation);
  const bail = createBailOut(core, frame, stance, body, published, presentation);
  const dismount = createDismount(core, frame, bail, stance, body, ring, published, presentation);
  const teleport = createTeleport(core, stance, body, published, presentation);

  /** One frame, routed to the mode the player is in. */
  function update(dt: number, input: PlayerInput): void {
    s.sinceCrash += dt;
    const radiusBefore = position.length();
    if (input.climb !== undefined || input.dive !== undefined) {
      controls.lift = (input.climb === true ? 1 : 0) - (input.dive === true ? 1 : 0);
    }

    up.copy(position).normalize();
    // Reproject every tick: accumulated floating-point error would slowly
    // lift the heading off the surface.
    forward.projectOnPlane(up).normalize();

    if (s.ride !== null && s.ride.seat !== 0) {
      // A passenger does not steer: `carry` moves him, and his speed is what
      // it moved him by.
      s.velocity = s.carriedFrom && dt > 0 ? position.distanceTo(carried) / dt : 0;
      carried.copy(position);
      s.carriedFrom = true;
    } else if (s.ride !== null) {
      const model = s.ride.model;
      const handling = roadOf(model.kind);
      if (model.medium === 'water') water.sail(dt, input, model);
      else if (model.kind === 'plane') plane.fly(dt, input, model);
      else if (model.kind === 'balloon') balloon.drift(dt, input, model);
      else if (model.kind === 'helicopter') helicopter.hover(dt, input, model);
      else if (handling !== undefined) road.drive(dt, input, model, handling);
    } else if (s.chute) chute.glide(dt, input);
    else if (s.sitting) {
      // Any key that walks, or a jump, gets up; until then the root stays
      // on its bench, the clip holds the pose and no wall is asked.
      if (Math.abs(input.move.x) + Math.abs(input.move.y) > 1e-3 || input.jump) {
        stance.stand();
        walker.walk(dt, input);
      } else {
        motion.set(0, 0, 0);
        s.velocity = 0;
      }
    } else walker.walk(dt, input);

    s.climb = dt > 0 ? (position.length() - radiusBefore) / dt : 0;
    published.publish();
    presentation.pose(dt, s.velocity);
    chute.drawCanopy();
  }

  const player: Player = {
    object,
    position,
    forward,
    up,
    velocity: 0,
    speed: 0,
    climb: 0,
    parachute: false,
    canopy: false,
    airborne: false,
    sunk: false,
    foundering: -1,
    state: s.state,
    mode: 'foot',
    ride: null,
    grounded: false,
    sink: 0,
    depth: 0,
    altitude: 0,
    clearance: Infinity,
    overWater: false,
    controls,
    update,
    setBodyVisible(visible) {
      s.bodyWanted = visible;
      body.applyBody();
    },
    seatEye: body.seatEye,
    setCockpit(on) {
      s.cockpit = on;
      body.applyBody();
    },
    board: mount.board,
    leave: dismount.leave,
    pose: dismount.poseOut,
    emote(name) {
      if (name !== null && (s.state !== 'foot' || s.airborne || s.sitting)) return false;
      return avatar.emote(name);
    },
    get emoting() {
      return avatar.emoting;
    },
    sitOn: teleport.sitOn,
    stand: stance.stand,
    get sitting() {
      return s.sitting;
    },
    carry: mount.carry,
    goTo: teleport.goTo,
  };

  core.player = player;
  player.goTo(startLat, startLon);
  return player;
}
