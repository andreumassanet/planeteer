/**
 * Where the player is, asked once a frame and handed to the minimap, the
 * map, the HUD's badge and clock, and the passport. Unthrottled: the
 * country lookup and the nearest-place scan cost microseconds.
 */
import { toLatLon } from '../../geo.ts';
import { clockAt } from '../../timezone.ts';
import type { App } from '../context.ts';
import type { Tick } from './tick.ts';

/** Fills `tick.standingIn` and `tick.nearbyPlace`, and updates the maps and the player list. */
export function createMapsPhase(app: App): (tick: Tick) => void {
  const { guard, world, places, player, peers, minimap, nav, playerList, map, rig } = app;
  return (tick) => {
    tick.standingIn = world.countryAtPoint(player.position);
    tick.nearbyPlace = places.nearest(player.position);
    if (peers !== null) minimap.setPeers(peers.marks);
    guard('minimap', () =>
      minimap.update(player.position, player.forward, {
        country: tick.standingIn,
        place: tick.nearbyPlace,
      }, rig.heading),
    );
    guard('navigation', () => nav.update(tick.dt, player, rig.camera));
    guard('players', () => playerList.update(tick.dt));
    // One branch while closed, which is nearly always.
    guard('map', () => map.update(player.position, player.forward));
  };
}

/**
 * The HUD's badge and clock, then the passport. The clock is the world's
 * (`sky.setTime` moves it), in the nearest town's zone, or local solar time
 * at sea. Guarded: `Intl` throws on a date it cannot format.
 */
export function createBadgePhase(app: App): (tick: Tick) => void {
  const { guard, world, player, sky, hud, passport, passportMoment, bearingTo } = app;
  return (tick) => {
    const { standingIn, nearbyPlace } = tick;
    const here = toLatLon(player.position);
    tick.here = here;
    guard('hud', () => hud.update(
      standingIn,
      nearbyPlace,
      clockAt(
        sky.state.time,
        standingIn > 0 ? world.countries[standingIn - 1]!.iso : '',
        here.lon,
        here.lat,
        nearbyPlace.place,
      ),
      tick.dt,
      // Which way the town lies, clockwise from facing; `cartography.ts` owns the sign.
      bearingTo(
        player.position,
        player.forward,
        nearbyPlace.place.lat,
        nearbyPlace.place.lon,
      ),
    ));
    // A candidate country is stamped once you are down in it; a town counts once you are inside.
    guard('passport', () => {
      passportMoment.iso = standingIn > 0 ? world.countries[standingIn - 1]!.iso : '';
      passportMoment.aloft = player.airborne;
      passportMoment.mode = player.mode;
      passportMoment.time = sky.state.time;
      passportMoment.lat = here.lat;
      passportMoment.lon = here.lon;
      passportMoment.town.index = nearbyPlace.index;
      passportMoment.town.name = nearbyPlace.place.name;
      passportMoment.town.iso = nearbyPlace.place.iso;
      passportMoment.town.inside = nearbyPlace.inside;
      passport.observe(passportMoment);
    });
  };
}
