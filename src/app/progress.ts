/**
 * What the traveller does on Earth, told to the progression (`progress.ts`)
 * as it happens: the player's state read each frame into the one reading
 * every world's game hands `createTravellerReader` (`progress/traveller.ts`),
 * so nothing that moves has to know about the progression; the few things
 * with a name (a conversation, a ring, a course, a job, a stamp, a landmark)
 * are told where they happen (`app.emit`).
 */
import { WALK_SPEED } from '../avatar/gait.ts';
import type { MoveMode } from '../progress/events.ts';
import { createTravellerReader } from '../progress/traveller.ts';
import type { TravellerReading } from '../progress/traveller.ts';
import { SCENERY_SCALE } from '../stature.ts';
import type { App } from './context.ts';
import type { Tick } from './frame/tick.ts';

/** Above this a walk is a run, as a share of the walking speed. */
const RUNNING = 1.2;

export function createProgressPhase(app: App): (tick: Tick) => void {
  const { player } = app;
  const read = createTravellerReader((event) => app.emit(event), SCENERY_SCALE);
  const reading: TravellerReading = {
    position: player.position, mode: null, airborne: false, leaping: false, ride: null, rideKind: '', canopy: false,
    mapOpen: false, sitting: false, towns: [], depth: 0, altitude: null, speed: null, rocketFlying: false,
  };

  function modeNow(): MoveMode | null {
    if (app.trainRide.riding) return 'passenger';
    if (player.state === 'seated') {
      const ride = player.ride;
      if (ride === null) return null;
      if (ride.seat > 0) return 'passenger';
      const { medium, kind } = ride.model;
      if (medium === 'air') return 'fly';
      if (medium === 'water') return 'sail';
      return kind === 'horse' || kind === 'bicycle' ? 'ride' : 'drive';
    }
    if (player.mode === 'swim') return player.depth > 0.5 ? 'dive' : 'swim';
    // Off the ground is not travel on foot: a fall after bailing out, a canopy.
    if (player.airborne) return null;
    return player.velocity > WALK_SPEED * RUNNING ? 'run' : 'walk';
  }

  return ({ dt }) => {
    const ride = player.state === 'seated' ? player.ride : null;
    reading.position = player.position;
    reading.mode = modeNow();
    reading.airborne = player.airborne;
    reading.leaping = player.state === 'foot' && player.climb > 0 && !player.parachute;
    reading.ride = ride === null ? null : `${ride.vehicle}:${ride.seat}`;
    reading.rideKind = ride?.model.kind ?? '';
    reading.canopy = player.canopy;
    reading.mapOpen = app.map.open;
    reading.sitting = player.sitting;
    reading.towns = app.passport.data.towns;
    reading.depth = player.depth;
    reading.altitude = ride?.model.medium === 'air' ? player.altitude : null;
    reading.speed = ride === null ? null : player.speed;
    reading.rocketFlying = app.launchPads.riding?.state === 'flying';
    read(dt, reading);
  };
}
