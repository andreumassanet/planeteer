/** The chat (`Enter`): Earth's panel, told where the traveller is and how to move them. */

import * as THREE from 'three';
import type { WorldHost } from '../../world-host.ts';
import type { WorldSpec } from '../contract.ts';
import type { Geography } from '../../system/geography.ts';
import { createChat } from '../../chat.ts';
import type { Chat } from '../../chat.ts';
import type { Gazetteer } from '../../chat-core.ts';
import type { TimeOfDay } from '../../settings.ts';
import type { Peers } from '../../peers.ts';
import type { Places } from '../../places.ts';
import { relayPlayers } from '../../relay-players.ts';
import { latLonOf } from '../../sphere.ts';
import type { Emote } from '../../../server/src/limits.ts';
import type { WorldPlayer } from '../player.ts';

export function createChatPanel(deps: {
  host: WorldHost;
  spec: WorldSpec;
  geography: Geography;
  player: WorldPlayer;
  peers: Peers | null;
  online: boolean;
  places: Places;
  isoAt: (point: THREE.Vector3) => string | null;
  countryName: (iso: string) => string;
  travellerName: () => string;
  home: () => { lat: number; lon: number; name: string };
  time: TimeOfDay;
  lockTarget: HTMLElement;
  jump: (lat: number, lon: number) => void;
  joinPeer: (id: string) => boolean;
  gesture: (name: Emote) => boolean;
  photo: () => void;
  closeMap: () => void;
}): Chat {
  const { host, spec, geography, player, peers, online, places, isoAt, countryName, travellerName, home, time, lockTarget, jump, joinPeer, gesture, photo, closeMap } = deps;
  let gazetteer: Gazetteer | null = null;
  const chatPoint = new THREE.Vector3();
  return createChat({
    peers,
    world: spec.id,
    ...(online ? { elsewhere: () => relayPlayers(host.peersUrl!) } : {}),
    name: travellerName,
    here: () => {
      const { lat, lon } = latLonOf(player.position);
      const iso = isoAt(player.position) ?? '';
      const nearby = places.nearest(player.position);
      return { iso, country: iso === '' ? '' : countryName(iso), town: nearby.place.name, near: nearby.near, lat, lon };
    },
    whereIs: ({ x, y, z }) => {
      chatPoint.set(x, y, z);
      const iso = isoAt(chatPoint);
      const nearby = places.nearest(chatPoint);
      return { country: iso === null ? '' : countryName(iso), town: nearby.place.name, near: nearby.near };
    },
    countryName,
    // Every world's towns and nations when the host has them, so `/goto Paris`
    // from Mars goes home; this world's alone where it does not (a `?world=` link).
    gazetteer: () => host.gazetteer?.() ?? (gazetteer ??= { places: geography.places, aliases: new Map(), countries: geography.countries }),
    jumpTo: jump,
    ...(host.travel === undefined ? {} : { travel: host.travel }),
    home,
    joinPlayer: joinPeer,
    time,
    // No weather is modelled off Earth: the chat says so.
    weather: () => null,
    emote: gesture,
    photo,
    sound: () => (host.settings?.sound?.chat?.get() === false ? null : host.sound()),
    lockTarget,
    onOpen: closeMap,
  });
}
