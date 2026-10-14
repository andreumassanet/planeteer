/** The others: online, a link to the relay with its people drawn in the world; offline, nobody. */

import type { Peers, PeerSelf } from '../../peers.ts';
import { createPeers, storedName } from '../../peers.ts';
import { createFolk } from '../../folk.ts';
import { createPlayerList } from '../../player-list.ts';
import type { PlayerList } from '../../player-list.ts';
import { relayPlayers } from '../../relay-players.ts';
import { encodeAppearance } from '../../appearance.ts';
import type { ShellWorld } from './types.ts';

export interface PeerLink {
  peers: Peers | null;
  online: boolean;
  /** The traveller in the fields the link sends. */
  self: PeerSelf;
  travellerName(): string;
}

export function createPeerLink(world: ShellWorld): PeerLink {
  const { host, spec, surface, player } = world;
  const online = host.mode === 'online' && typeof host.peersUrl === 'string' && host.peersUrl !== '';
  const peers: Peers | null = online ? createPeers(host.peersUrl!, createFolk(world.ctx), { body: spec.id, radius: surface.radius }) : null;
  if (peers !== null) {
    world.scene.add(peers.group);
    peers.setLook(encodeAppearance(host.appearance()));
  }
  const self: PeerSelf = {
    position: player.position,
    forward: player.facing,
    velocity: 0,
    airborne: false,
    canopy: false,
    sitting: false,
    state: 'foot',
  };
  return { peers, online, self, travellerName: () => peers?.name || host.name() || storedName() };
}

/**
 * Tab's list of players. On another world every row carries the world's mark,
 * not its nations' banners, which nobody would recognise; see `player-list.ts`.
 */
export function createWorldPlayerList(world: ShellWorld, peers: Peers | null, online: boolean): PlayerList {
  const { host, spec } = world;
  return createPlayerList({
    world: spec.id,
    rows: () => [
      { id: peers?.id ?? 'you', name: peers?.name || host.name() || storedName() || 'Traveller', iso: null, world: spec.id, you: true },
      ...[...(peers?.marks ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((mark) => ({ id: mark.id, name: mark.name, iso: null, world: spec.id })),
    ],
    online: () => (peers?.online ?? null) !== null,
    ...(online ? { elsewhere: () => relayPlayers(host.peersUrl!) } : {}),
  });
}
