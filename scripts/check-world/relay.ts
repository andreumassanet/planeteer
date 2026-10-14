import { check } from './harness.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { PLANE_CEILING, PLANE_CRUISE_HIGH } from '../../src/vehicles.ts';
import * as relay from '../../server/src/limits.ts';

// The relay cannot import the game, so it bounds it: a plane the game lets
// climb or run past the relay's limits is a player the relay silently drops.
export function checkRelay(): void {
  console.log('\nthe relay');
  check(relay.PLANET_RADIUS === PLANET_RADIUS, 'the relay’s planet is the world’s', `${relay.PLANET_RADIUS} against ${PLANET_RADIUS}`);
  const highest = PLANET_RADIUS + PLANE_CEILING;
  check(
    highest * 1.25 <= relay.MAX_RADIUS,
    'MAX_RADIUS holds the plane at its ceiling, with a quarter to spare',
    `ceiling at a radius of ${highest}, relay's limit ${relay.MAX_RADIUS}`,
  );
  // Stick and throttle full on add at most 2.2 times the cruise (`fly` in
  // player.ts); the relay wants half again over that.
  const fastest = PLANE_CRUISE_HIGH * 2.2;
  check(
    fastest * 1.5 <= relay.MAX_SPEED,
    'MAX_SPEED is half again over the plane flat out at the ceiling',
    `${fastest.toFixed(0)} against ${relay.MAX_SPEED}`,
  );
  check(
    relay.driveReach(100, 60) >= fastest * 0.1 + 60 && relay.driveReach(-5, 0) > 0,
    'a pose a tenth of a second on at full boost is within a driven vehicle’s reach',
    `${relay.driveReach(100, 60).toFixed(0)} units`,
  );
}
