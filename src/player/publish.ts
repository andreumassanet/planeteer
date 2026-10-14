/**
 * The fields the rest of the game reads off the player, written after anything that changes them.
 */
import type { TravelMode } from '../controls.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { FOUNDER_TIME } from '../vehicles.ts';
import { MODE_OF, isAir } from './constants.ts';
import type { PlayerCore } from './core.ts';

export function createPublish(core: PlayerCore) {
  const { position } = core;
  const s = core.fields;

  /** The mode the keys and the HUD read: on foot, swimming, passenger, or the kind of vehicle driven. */
  function modeOf(): TravelMode {
    if (s.ride === null) return s.state === 'swim' ? 'swim' : 'foot';
    if (s.ride.seat !== 0) return 'passenger';
    return MODE_OF[s.ride.model.kind];
  }

  /** Copies the controller's fields to the `Player` object. */
  function publish(): void {
    const player = core.player;
    const kind = s.ride?.model.kind ?? null;
    player.velocity = s.velocity;
    player.speed = s.ride !== null && s.ride.seat === 0 ? s.speed : s.velocity;
    player.climb = s.climb;
    player.parachute = s.chute;
    player.canopy = s.chute && s.canopy > 0;
    player.airborne = kind !== null && isAir(kind) ? !s.grounded : s.airborne;
    player.sunk = s.ride !== null && s.founder >= FOUNDER_TIME;
    player.foundering = s.ride !== null ? s.founder : -1;
    player.state = s.state;
    player.mode = modeOf();
    player.ride = s.ride;
    player.grounded = s.grounded;
    player.sink = s.sink;
    player.depth = s.state === 'swim' || s.ride?.model.kind === 'submarine' ? s.dive : 0;
    player.altitude = position.length() - PLANET_RADIUS;
    player.clearance = s.ride !== null && s.ride.model.kind === 'helicopter' && !s.grounded ? s.clearance : Infinity;
    player.overWater = s.overWater;
  }

  return { modeOf, publish };
}

export type Publish = ReturnType<typeof createPublish>;
