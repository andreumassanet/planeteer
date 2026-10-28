/**
 * The game around a walked world: Earth's own, built from the same modules
 * Earth's `main.ts` builds it from and handed the world through the narrow
 * seam in `planet.ts`.
 *
 * A traveller who walks off Earth onto Mars finds the same game: the bar with
 * the gear, the map and the passport, the clock (the body's own local solar
 * time), the place badge, the minimap, `M`'s whole planet on one sheet, the
 * chat, `Tab`'s players, `O`'s settings, `J`'s passport with a chapter for
 * every world, a wave and a dance, and the pause card with one more button:
 * back to the planets.
 *
 * Nothing here is a copy of an Earth module. What is this file's own is the
 * wiring `main.ts` does on Earth and cannot share: which closure answers which
 * question. The parts are in `shell/`; every listener goes through one
 * `AbortController`, so a world left for the planets and then Earth leaves no
 * key bound behind it, and every module is disposed on the way out.
 */

import * as THREE from 'three';
import { installBanners } from '../system/menu-body.ts';
import { createTouchPad } from '../touch.ts';
import { createHud } from '../hud.ts';
import { createWorldMap } from '../map.ts';
import { createNavigation } from '../navigation.ts';
import { createCountryNames } from '../names.ts';
import { indexPlaces } from '../places.ts';
import { inputBlocked } from '../controls.ts';
import type { WorldHost } from '../world-host.ts';
import { latLonOf } from '../sphere.ts';
import { craftHints } from './shell/craft-hints.ts';
import { createChatPanel } from './shell/chat-panel.ts';
import { createClock } from './shell/clock.ts';
import { createShellFrame } from './shell/frame.ts';
import { createGear } from './shell/gear.ts';
import { createGesture, createPhoto } from './shell/gestures.ts';
import { bindKeys } from './shell/keys.ts';
import { rememberPlace } from './shell/last-place.ts';
import { createMapPaper } from './shell/map-paper.ts';
import { createOverlay } from './shell/overlay.ts';
import { createPeerLink, createWorldPlayerList } from './shell/peer-link.ts';
import { createPassportBook } from './shell/passport-book.ts';
import { createTalking } from './shell/talking.ts';
import type { Shell, ShellWorld } from './shell/types.ts';

export { clockText, svgNode } from './shell/text.ts';
export type { Shell, ShellWorld } from './shell/types.ts';

/** Beside another player, this far to their north: the map's *join* and the chat's `/tp`, as on Earth. */
const JOIN_OFFSET = 4;
/**
 * The frame's share for the maps' tiles, ms: Earth's `MAP_TILES_MS` — the
 * disc's out of the near allowance, the rest out of the far share's turn.
 */
const MAP_TILES_MS = 4;

export function createShell(world: ShellWorld): Shell {
  const { host, spec, geography, surface, player, rig, sky, input } = world;
  const body = spec.body;
  const R = surface.radius;
  const lockTarget = host.renderer.domElement;
  const abort = new AbortController();
  const { signal } = abort;
  const cue = (name: Parameters<NonNullable<WorldHost['cue']>>[0]): void => host.cue?.(name);
  const places = indexPlaces(geography.places, R, body.radiusKm);
  const countries = geography.countries;
  const political = geography.world;
  const isoAt = (point: THREE.Vector3): string | null => {
    const id = political.countryAtPoint(point);
    return id > 0 ? countries[id - 1]!.iso : null;
  };
  const countryName = (iso: string): string => countries.find((country) => country.iso === iso)?.name ?? iso;
  // Every nation's banner, for the badge, the cards, the map's pins and the
  // stamps: the menu has installed them already unless this is a `?world=` link.
  installBanners();

  const clock = createClock({ host, body, sky, player });
  const overlay = createOverlay();
  const closeMap = (): void => {
    if (map.open) map.hide(false);
  };

  const hud = createHud(political, {
    touch: createTouchPad(input.touchSink, lockTarget),
    surface,
    // Back to the planets, from the bar: the solar system, as a rocket goes.
    leave: { label: 'Solar system', run: () => world.leave() },
    // These craft have no horn.
    hints: (_mode, airborne) => (player.craft === null ? undefined : craftHints(player.craft.kind, airborne)),
    onSettings: () => gear.settings.toggle(),
    onMap: () => (map.open ? map.hide() : map.show()),
    // A new nation is a stamp in the book, taken once you are down in it.
    onArrival: (id) => {
      const country = countries[id - 1];
      if (country !== undefined) book.passport.arrived(country.iso, country.name);
    },
    onPassport: () => book.card.toggle(),
    onStart: () => input.lock(),
  });
  document.body.appendChild(hud.root);

  // The nations' names over the land from the air, on the map layer's fade.
  // First in the body, behind every card the HUD owns.
  const names = createCountryNames(political, { radius: R, heightAt: (unit) => world.terrain.heightAt(unit.x, unit.y, unit.z) });
  document.body.insertBefore(names.root, document.body.firstChild);

  const paper = createMapPaper(world, { spec, geography, surface, settlements: world.settlements, political, radius: R });

  const { peers, online, self, travellerName } = createPeerLink(world);

  const book = createPassportBook({ host, lockTarget, cue, closeMap, holder: () => ({ name: travellerName(), appearance: host.appearance() }) });
  document.body.appendChild(book.card.root);

  const nav = createNavigation({
    minimap: paper.minimap,
    hud,
    groundAt: (direction) => R + world.groundAt(direction),
    countryAt: (lat, lon) => {
      const id = political.countryAt(lat, lon);
      return id > 0 ? countries[id - 1]!.iso : null;
    },
    surface,
  });

  function joinPeer(id: string): boolean {
    const at = peers?.positionOf(id) ?? null;
    if (at === null) return false;
    const { lat, lon } = latLonOf(at);
    jump(Math.min(89.9, lat + (JOIN_OFFSET / R) * (180 / Math.PI)), lon);
    return true;
  }

  function jump(lat: number, lon: number): void {
    talking.stop();
    world.jumpTo(lat, lon);
    // A jump is not a frontier walked along: the badge says the new place at once.
    hud.jump();
  }

  const map = createWorldMap(political, {
    surface,
    tiles: paper.mapTiles,
    pads: paper.padsNear,
    openSpan: () => paper.minimap.span,
    monuments: [],
    courses: () => world.roadLines(),
    places: geography.places,
    marker: () => nav.marker,
    onMark: (lat, lon, name, landmark) => nav.mark(lat, lon, name, landmark),
    onUnmark: () => nav.clear(),
    lockTarget,
    blocked: () => inputBlocked(),
    ...(peers === null ? {} : { peers: () => peers.marks, onJoin: (id: string) => void joinPeer(id) }),
  });
  document.body.appendChild(map.root);

  const playerList = createWorldPlayerList(world, peers, online);
  document.body.appendChild(playerList.root);

  const gear = createGear({ host, hud, input, overlay, time: clock.time, lockTarget, cue, closeMap });
  document.body.appendChild(gear.settings.root);

  const gesture = createGesture(player, peers);
  const photo = createPhoto({ host, hud, places, player, world: spec.id });
  const chat = createChatPanel({
    host, spec, geography, player, peers, online, places, isoAt, countryName, travellerName, home: () => world.home,
    time: clock.time, lockTarget, jump, joinPeer, gesture, photo: photo.request, closeMap,
  });
  bindKeys({ hud, overlay, gesture, photo: photo.request, signal });
  const talking = createTalking({ host, spec, radius: R, settlements: world.settlements, crowd: world.crowd, player, rig, cue });
  const last = rememberPlace({ world: spec.id, player, places, isoAt, signal });

  const frame = createShellFrame({
    world, clock, overlay, hud, names, minimap: paper.minimap, map, nav, playerList, settings: gear.settings, gear, chat,
    passport: book.passport, passportCard: book.card, moment: book.moment, talking, photo, peers, self, places, countries, cue,
  });

  let disposed = false;
  return {
    date: clock.date,
    update: frame.update,
    drawn: frame.drawn,
    hud,
    mapTiles: paper.mapTiles,
    map,
    pumpTiles() {
      paper.mapTiles.pump(MAP_TILES_MS, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      last.save();
      talking.stop();
      last.stop();
      abort.abort();
      chat.dispose();
      gear.settings.dispose();
      playerList.dispose();
      book.card.dispose();
      map.dispose();
      nav.dispose();
      paper.minimap.dispose();
      paper.mapTiles.dispose();
      paper.release();
      talking.dispose();
      names.dispose();
      hud.dispose();
      if (peers !== null) {
        peers.dispose();
        world.scene.remove(peers.group);
      }
    },
  };
}
