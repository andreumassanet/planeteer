/**
 * The chat and its commands. The world's verbs are handed over as closures,
 * so `chat.ts` and its words stay out of the first load.
 */
import * as THREE from 'three';
import { toLatLon } from '../geo.ts';
import { unitAt } from '../sphere.ts';
import { relayPlayers } from '../relay-players.ts';
import type { Chat } from '../chat.ts';
import type { Gazetteer } from '../chat-core.ts';
import type { App } from './context.ts';
import { travelTo } from './journey.ts';

export async function createWorldChat(app: App): Promise<Chat> {
  const { world, places, player, peers, peersModule, peersUrl, spawn, playMode } = app;
  const { audio, voices } = app.sound;
  const { createChat } = await app.deferred.chat;
  const point = new THREE.Vector3();
  let gazetteer: Gazetteer | null = null;
  const countryOf = (at: THREE.Vector3) => {
    const id = world.countryAtPoint(at);
    return id > 0 ? world.countries[id - 1]! : null;
  };
  return createChat({
    peers,
    ...(peers === null ? {} : { elsewhere: () => relayPlayers(peersUrl) }),
    name: () => peers?.name || peersModule.shownName(peersModule.storedName()),
    here: () => {
      const { lat, lon } = toLatLon(player.position);
      const country = countryOf(player.position);
      const nearby = places.nearest(player.position);
      return { iso: country?.iso ?? '', country: country?.name ?? '', town: nearby.place.name, near: nearby.near, lat, lon };
    },
    whereIs: ({ x, y, z }) => {
      point.set(x, y, z);
      const nearby = places.nearest(point);
      return { country: countryOf(point)?.name ?? '', town: nearby.place.name, near: nearby.near };
    },
    countryName: (iso) => world.countries.find((country) => country.iso === iso)?.name ?? iso,
    // Every world's towns once the menu has made them, else Earth's alone.
    gazetteer: () => app.everyWorld ?? (gazetteer ??= { places: places.all, aliases: places.aliases(), countries: world.countries }),
    jumpTo: app.jumpTo,
    travel: (to, lat, lon, place) => travelTo(to, lat, lon, place, playMode),
    home: () => ({ lat: spawn.lat, lon: spawn.lon, name: places.nearest(unitAt(spawn.lat, spawn.lon, point)).place.name }),
    joinPlayer: app.joinPeer,
    time: app.timeOfDay,
    // Held where you stand until `auto` hands it back to the model.
    weather: (wanted) => {
      app.weather.force(wanted === 'auto' ? null : wanted);
      return true;
    },
    emote: app.gestures.gesture,
    photo: () => {
      app.photoWanted = true;
    },
    sound: () => (voices.chat && audio.output !== null && audio.bus !== null ? { context: audio.output.context, node: audio.bus } : null),
    lockTarget: app.renderer.domElement,
    onOpen: () => {
      if (app.map.open) app.map.hide(false);
    },
  });
}
