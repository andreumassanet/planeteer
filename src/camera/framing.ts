/**
 * Where the framing wants to be for what the player is doing: the wheel's walking framing, a vehicle's own size, the flight's climb.
 */
import { AVATAR_HEIGHT } from '../avatar.ts';
import { PLANE_CEILING } from '../vehicles.ts';
import {
  BOAT_FRAMING,
  FLIGHT_HIGH,
  FLIGHT_LOW,
  RIDE_BACK,
  RIDE_UP,
  SUB_FRAMED_UNDER,
  WALK_FRAMING,
  ZOOM_RISE,
} from './constants.ts';
import { clamp, mix } from './math.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';

export function createFraming(core: CameraCore) {
  const { framing } = core;
  const s = core.fields;

  /** The walking framing at a zoom of the wheel's: see `ZOOM_RISE`. */
  const walkFraming = (at: number, into: { distance: number; height: number }): void => {
    into.distance = WALK_FRAMING.distance * at;
    into.height = WALK_FRAMING.height * Math.pow(at, ZOOM_RISE);
  };

  /** Writes `framing` for what the player is currently doing. */
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
        // Full control is flown close behind, low, whatever the height: a map
        // view would turn a loop into a dot.
        const t = player.aerobatic === true ? 0 : clamp(player.altitude / PLANE_CEILING, 0, 1);
        // Two different eases: the angle has to open early, or the first thousand
        // units of a climb look like nothing is happening.
        const elevation = mix(FLIGHT_LOW.elevation, FLIGHT_HIGH.elevation, Math.pow(t, 0.6));
        const flightOrbit = mix(FLIGHT_LOW.orbit, FLIGHT_HIGH.orbit, Math.sqrt(t));
        framing.distance = Math.max(framing.distance, flightOrbit * Math.cos(elevation));
        framing.height = Math.max(framing.height, flightOrbit * Math.sin(elevation));
      }
    } else {
      // The wheel's framing, so a landing comes back to the zoom you chose.
      walkFraming(s.zoomTarget, framing);
    }
  }

  return { walkFraming, want };
}

export type Framing = ReturnType<typeof createFraming>;
