/**
 * The navigation marker, the whole-planet map behind `M`, the player list
 * held on `Tab`, and the country names over the land.
 */
import * as THREE from 'three';
import { inputBlocked } from '../controls.ts';
import { relayPlayers } from '../relay-players.ts';
import type { Navigation } from '../navigation.ts';
import type { WorldMap } from '../map.ts';
import type { PlayerList } from '../player-list.ts';
import type { CountryNames } from '../names.ts';
import type { App } from './context.ts';

/** The player's marker; it points the way and never moves you. */
export async function createWorldNavigation(app: App): Promise<Navigation> {
  const { world } = app;
  const { createNavigation } = await app.deferred.navigation;
  return createNavigation({
    minimap: app.minimap,
    hud: app.hud,
    groundAt: app.groundAt,
    countryAt: (lat, lon) => {
      const id = world.countryAt(lat, lon);
      return id > 0 ? world.countries[id - 1]!.iso : null;
    },
  });
}

export async function createPlanetMap(app: App): Promise<WorldMap> {
  const { world, placements, places, baked, nav, peers } = app;
  const { createWorldMap } = await app.deferred.map;
  const map = createWorldMap(world, {
    monuments: placements,
    places: places.all,
    roads: baked.roads,
    marker: () => nav.marker,
    onMark: (lat, lon, name, landmark) => nav.mark(lat, lon, name, landmark),
    onUnmark: () => nav.clear(),
    lockTarget: app.renderer.domElement,
    // A card holding the keyboard keeps `M` from opening the map under it.
    blocked: () => inputBlocked(),
    pads: app.padsForMaps,
    tiles: app.mapTiles,
    // It opens on what the disc in the corner shows.
    openSpan: () => app.minimap.span,
    // The rings come after the map at start-up, so they are asked for as the sheet needs them.
    courseSites: () => app.thrills?.rings.sites ?? [],
    courseBest: (key) => app.thrills?.rings.record.courses.get(key) ?? null,
    courseRing: () => app.thrills?.rings.active ?? null,
    ...(peers === null
      ? {}
      : {
          peers: () => peers.marks,
          onJoin: (id: string) => void app.joinPeer(id),
        }),
  });
  document.body.appendChild(map.root);
  return map;
}

/** Yourself first, then everyone on Earth with their country's flag, then everyone on the other worlds. */
export async function createWorldPlayerList(app: App): Promise<PlayerList> {
  const { world, player, peers, peersModule, peersUrl } = app;
  const { createPlayerList } = await app.deferred.playerList;
  const listPoint = new THREE.Vector3();
  const isoAtPoint = (point: THREE.Vector3): string | null => {
    const id = world.countryAtPoint(point);
    return id > 0 ? world.countries[id - 1]!.iso : null;
  };
  const playerList = createPlayerList({
    world: 'earth',
    rows: () => [
      {
        id: peers?.id ?? 'you',
        name: peers?.name || peersModule.storedName() || 'Traveller',
        iso: isoAtPoint(player.position),
        you: true,
      },
      ...[...(peers?.marks ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((mark) => ({ id: mark.id, name: mark.name, iso: isoAtPoint(listPoint.set(mark.x, mark.y, mark.z)) })),
    ],
    online: () => (peers?.online ?? null) !== null,
    elsewhere: () => relayPlayers(peersUrl),
    countryName: (iso) => world.countries.find((country) => country.iso === iso)?.name,
  });
  document.body.appendChild(playerList.root);
  return playerList;
}

/** The names fade in with the flags and frontiers (`names.ts`). */
export async function createWorldNames(app: App): Promise<CountryNames> {
  const { createCountryNames } = await app.deferred.names;
  const names = createCountryNames(app.world);
  // First in the body, so the names paint behind every HUD card.
  document.body.insertBefore(names.root, document.body.firstChild);
  return names;
}
