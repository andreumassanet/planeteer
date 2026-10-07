/**
 * The game around a walked world: **exactly Earth's**, built from the same
 * modules Earth's `main.ts` builds it from, handed the world through the
 * narrow seam in `planet.ts`.
 *
 * A traveller who walks off Earth onto Mars should find the same game: the
 * bar at the top left with the gear, the map and the passport on it, the
 * clock (the body's own local solar time), the place badge — *In Tharsis
 * Station*, the nation under it, how far and which way the nearest town is —
 * the minimap with the nations in their colours and the towns as dots, `M`'s
 * whole planet on one sheet with its frontiers and a marker to put down, the
 * chat and its commands, `Tab`'s players, `O`'s settings and their Controls
 * page, `J`'s passport with a chapter for every world, a wave and a dance,
 * a stamp when you come down in a new nation, and the pause card, which on
 * another world has one more button: back to the planets.
 *
 * Nothing here is a copy of an Earth module. Each is the module itself —
 * `hud.ts`, `minimap.ts`, `map.ts`, `navigation.ts`, `chat.ts`, `settings.ts`,
 * `player-list.ts`, `passport.ts`, `passport-card.ts`, `talk.ts`'s bubble,
 * `peers.ts` — given the world's `PlanetSurface` (`surface.ts`) and its
 * geography (`system/geography.ts`) where Earth's are the defaults. What is
 * this file's own is what `main.ts` wires on Earth and cannot be shared
 * because it is wiring: which closure answers which question.
 *
 * Every module is disposed on the way out, and every listener this file adds
 * goes through one `AbortController`: a world left for the planets and then
 * Earth must leave no key bound behind it.
 */

import * as THREE from 'three';
import type { WorldHost, WorldSettings } from '../world-host.ts';
import type { WorldSpec } from './contract.ts';
import type { Geography } from '../system/geography.ts';
import { chaptersOf, localHour } from '../system/geography.ts';
import { installBanners } from '../system/menu-body.ts';
import type { PlanetSurface } from '../planet.ts';
import { outlinesOf } from './surface.ts';
import type { Terrain } from './terrain.ts';
import type { Ground } from './tiles.ts';
import type { Sky } from './sky.ts';
import type { Settlements, Site } from './settlements.ts';
import type { Crowd, Walker } from './aliens.ts';
import type { Craft } from './craft.ts';
import type { WorldPlayer } from './player.ts';
import type { WorldRig } from './camera.ts';
import type { Input } from '../input.ts';
import type { Frontiers } from './frontiers.ts';
import { WORLDS, WORLD_IDS } from './registry.ts';
import { scriptOf, svgOf, writeLine } from './glyphs.ts';
import type { Script } from './glyphs.ts';
import { lineOf, voiceFor } from './speech.ts';
import type { Line } from './speech.ts';
import { createHud } from '../hud.ts';
import type { Hud } from '../hud.ts';
import { createMinimap } from '../minimap.ts';
import { type WorldMap, createWorldMap } from '../map.ts';
import { type MapTiles, createMapTiles } from '../map-tiles.ts';
import { createWorldFeatures } from './map-features.ts';
import { createNavigation } from '../navigation.ts';
import { createChat } from '../chat.ts';
import type { Gazetteer } from '../chat-core.ts';
import { createSettings } from '../settings.ts';
import type { TimeOfDay } from '../settings.ts';
import { createPlayerList } from '../player-list.ts';
import { relayPlayers } from '../relay-players.ts';
import { createPassport } from '../passport.ts';
import type { PassportMoment, StampMode } from '../passport.ts';
import { createPassportCard } from '../passport-card.ts';
import type { PassportChapter } from '../planet.ts';
import { createBubble } from '../talk.ts';
import { createCountryNames } from '../names.ts';
import { indexPlaces } from '../places.ts';
import { bearingTo } from '../cartography.ts';
import { createPeers, storedName } from '../peers.ts';
import type { PeerSelf, Peers } from '../peers.ts';
import { createFolk } from '../folk.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { MOVE, actionOf, inputBlocked, labelOf } from '../controls.ts';
import { DETAIL_MAX, DETAIL_MIN, autoDetail, detail, setAutoDetail, setDetail } from '../view.ts';
import type { TravelMode } from '../controls.ts';
import type { IconName } from '../ui.ts';
import { encodeAppearance } from '../appearance.ts';
import { planSpeech, revealed, speak } from '../voice.ts';
import type { Speech, Utterance } from '../voice.ts';
import { EMOTE_INTERVAL_MS } from '../../server/src/limits.ts';
import type { Emote } from '../../server/src/limits.ts';
import { latLonOf, toUnit } from '../sphere.ts';
import type { VehicleKind } from './contract.ts';
import type { Rocket } from '../rocket.ts';
import type { HintSet } from '../controls.ts';
import type { Soundscape } from '../audio.ts';
import type { MusicMoment } from '../music.ts';
import type { StyleId } from '../music-score.ts';

/** Earth's own keys for what both share, as `main.ts` names them. */
const OVERLAY_KEY = 'atlas.overlay';
const WELCOME_KEY = 'atlas.welcomed.v1';
const LAST_PLACE_KEY = 'atlas.lastPlace.v1';

/** How often the remembered place is written, as on Earth. */
const LAST_PLACE_MS = 10_000;
/** The map layer comes in between these heights over the ground, as on Earth (`OVERLAY_LOW`, `OVERLAY_HIGH`). */
const OVERLAY_LOW = 500;
const OVERLAY_HIGH = 2500;
/** How much of a nation's colour the ground takes at a full fade: enough to read as a map, never enough to hide the hills. */
const POLITICAL_CEILING = 0.72;
/** How near an alien has to be to be spoken to, and how far you may walk off before it stops. */
const TALK_REACH = 7.5;
const TALK_LEAVE = 14;
/** A line stays this long after it has been said, s. */
const LINE_HOLD = 6;
/** The phrasebook's round: greet, world, visitor, farewell; after the fourth the conversation is over. */
const ROUND = 4;
/** The day at an hour a minute, as Earth's time lapse. */
const TIME_LAPSE = 60;
/** Beside another player, this far to their north: the map's *join* and the chat's `/tp`, as on Earth. */
const JOIN_OFFSET = 4;
/** How long the frame counter averages over, ms. */
const STATS_MS = 500;

/** A craft of the walked worlds as the HUD, the passport and the player list say it: Earth's nearest kind. */
const MODE_OF: Readonly<Record<VehicleKind, TravelMode & StampMode>> = {
  rover: 'car',
  lander: 'plane',
  aerostat: 'balloon',
  // What hovers and turns on the spot: Earth's helicopter, aloft or down.
  ufo: 'helicopter',
};
const ICON_OF: Readonly<Record<VehicleKind, IconName>> = {
  rover: 'car',
  lander: 'plane',
  aerostat: 'balloon',
  ufo: 'orbit',
};

/**
 * What each craft sounds like through Earth's mix (`Soundscape.mode`): the
 * rover a car's engine, the lander a plane's, the aerostat the balloon's
 * silence, the saucer its own warbling hum (`audio.ts`).
 */
const SOUND_OF: Readonly<Record<VehicleKind, Soundscape['mode']>> = {
  rover: 'car',
  lander: 'plane',
  aerostat: 'balloon',
  ufo: 'saucer',
};

/**
 * Which of Earth's twenty music styles each world is played in: none of them
 * has Earth's countries to choose one by, so it is chosen by what it is — the
 * airless and the cold the high, sparse styles, the clouded giants the sea's
 * slow swell. A world not listed plays the sky's.
 */
const MUSIC_STYLE: Readonly<Record<string, StyleId>> = {
  mercury: 'sky',
  venus: 'sea',
  moon: 'polar',
  mars: 'sky',
  jupiter: 'sea',
  saturn: 'polar',
  uranus: 'polar',
  neptune: 'sea',
};
/** And what the music takes it for, as Earth's `MUSIC_OF`: on the road, at sea, or in the sky. */
const MUSIC_OF: Readonly<Record<VehicleKind, MusicMoment['mode']>> = {
  rover: 'car',
  lander: 'plane',
  aerostat: 'balloon',
  ufo: 'plane',
};
/** The keys in a rocket on its pad. */
const ROCKET_KEYS: HintSet = {
  id: 'rocket',
  once: false,
  sticky: true,
  hints: [
    { keys: ['jump'], label: 'Hold to launch' },
    { keys: ['use'], label: 'Get out' },
  ],
};

/** The keys on taking a craft of these worlds: Earth's, less the horn. */
function craftHints(kind: VehicleKind, airborne: boolean): HintSet {
  // Out of a craft aloft is out with a parachute, as on Earth (`controls.ts`).
  const out = { keys: ['use' as const], label: airborne ? 'Jump out, with a parachute' : 'Get out' };
  switch (kind) {
    case 'rover':
      return { id: 'world-rover', once: false, sticky: false, hints: [{ keys: MOVE, label: 'Drive' }, out] };
    case 'aerostat':
      return {
        id: airborne ? 'world-aerostat-air' : 'world-aerostat',
        once: false,
        sticky: false,
        hints: [{ keys: MOVE, label: 'Steer' }, { keys: ['jump'], label: 'Rise' }, { keys: ['run', 'descend'], label: 'Sink' }, out],
      };
    case 'lander':
      return airborne
        ? {
            id: 'world-lander-air',
            once: true,
            sticky: false,
            hints: [
              { keys: ['jump'], label: 'Climb' },
              { keys: ['descend'], label: 'Descend · land' },
              { keys: ['run'], label: 'Afterburner' },
              { keys: MOVE, label: 'Fly' },
              out,
            ],
          }
        : { id: 'world-lander', once: false, sticky: false, hints: [{ keys: ['jump'], label: 'Hold to lift off' }, { keys: MOVE, label: 'Steer' }, out] };
    case 'ufo':
      return airborne
        ? {
            id: 'world-ufo-air',
            once: true,
            sticky: false,
            hints: [
              { keys: ['jump'], label: 'Rise' },
              { keys: ['descend'], label: 'Sink · land' },
              { keys: ['run'], label: 'Boost' },
              { keys: MOVE, label: 'Fly' },
              out,
            ],
          }
        : { id: 'world-ufo', once: false, sticky: false, hints: [{ keys: ['jump'], label: 'Lift off' }, { keys: MOVE, label: 'Turn' }, out] };
  }
}

/** How often the music is told where you are, ms: twice a second, as on Earth. */
const MUSIC_MS = 500;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nowhere to remember it; it holds for this visit.
  }
}

/** A line of glyphs as an element: `svgOf`'s markup, parsed once into the page's own document. */
export function svgNode(markup: string): SVGElement {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  return document.importNode(parsed, true) as unknown as SVGElement;
}

/** `HH:MM` for an hour of the day, 0 to 24. */
export function clockText(hour: number): string {
  const minutes = ((Math.floor(hour * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Everything of the world the shell reads, as `index.ts` builds it. */
export interface ShellWorld {
  host: WorldHost;
  spec: WorldSpec;
  geography: Geography;
  surface: PlanetSurface;
  terrain: Terrain;
  scene: THREE.Scene;
  ctx: SceneryContext;
  player: WorldPlayer;
  rig: WorldRig;
  sky: Sky;
  ground: Ground;
  frontiers: Frontiers;
  settlements: Settlements;
  crowd: Crowd;
  crafts: readonly Craft[];
  /** The roads between the towns, as the map draws them (`Roads.lines`). */
  roadLines(): readonly { cls: number; points: readonly (readonly [number, number])[] }[];
  /** And at their carriageways' half-widths, for the maps' tiles (`Roads.halfOf`). */
  roadRibbons(): readonly { half: number; points: readonly (readonly [number, number])[] }[];
  /**
   * Every rocket's pad, one a town (`padOf`), and every saucer parked off a
   * town's corner (`ufoParkingOf`), as points on the sphere: what both maps
   * mark them at, as Earth's mark its pads.
   */
  pads: readonly { id: string; at: THREE.Vector3 }[];
  saucers: readonly { id: string; at: THREE.Vector3 }[];
  input: Input;
  /** Ground height over the radius under a point of any length. */
  groundAt(point: THREE.Vector3): number;
  /** The nearest craft in reach to board, or null. */
  craftInReach(): Craft | null;
  /** Stands the traveller at a place — a town's own arrival when it is in one — and builds the ground there. */
  jumpTo(lat: number, lon: number): void;
  /** Where this visit began. */
  home: { lat: number; lon: number; name: string };
  /** The world's own teardown, which ends in `host.exit`: back to the solar system. */
  leave(): void;
  /** The parked rocket near enough to get into, or null (`rocket.ts`). */
  rocketInReach(): Rocket | null;
  /** The rocket the traveller is in, or null. */
  riding(): Rocket | null;
  boardRocket(rocket: Rocket): void;
  /** Out of the rocket, if it has not left the pad. */
  leaveRocket(): void;
}

export interface Shell {
  /** The world's clock: the host's real one, turned by the settings, `/time` and the time lapse. */
  date(): Date;
  /** Every frame, after the world has moved and before it is drawn. */
  update(dt: number): void;
  /** Every frame, straight after the draw: the photo, the frame counter. */
  drawn(updateMs: number, drawMs: number): void;
  readonly hud: Hud;
  /** The maps' paper (`map-tiles.ts`), `atlasWorld.mapTiles` on the console. */
  readonly mapTiles: MapTiles;
  /** The sheet behind `M`, `atlasWorld.map` on the console. */
  readonly map: WorldMap;
  /** Paints the maps' tiles out of the frame's allowance: called inside the frame's building, before `endFrameBuild`. */
  pumpTiles(): void;
  dispose(): void;
}

/**
 * The frame's share for the maps' tiles, ms: Earth's `MAP_TILES_MS` — the
 * disc's out of the near allowance, the rest out of the far share's turn.
 */
const MAP_TILES_MS = 4;

export function createShell(world: ShellWorld): Shell {
  const { host, spec, geography, surface, player, rig, sky, ground, frontiers, settlements, crowd, input } = world;
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

  /* --- the clock ---------------------------------------------------------- */

  // The host's real clock, carried forward faster under the time lapse; the
  // hour itself is the sky's (`Sky.setHour` turns the body, or the date on a
  // locked world).
  let extraMs = 0;
  let rate = 1;
  let live = true;
  const date = (): Date => new Date(host.time().getTime() + extraMs);
  const time: TimeOfDay = {
    hour: () => sky.state.hour,
    live: () => live,
    setHour(hour) {
      sky.setHour(hour, date(), player.position);
      live = false;
      return hour;
    },
    setLive() {
      rate = 1;
      extraMs = 0;
      live = true;
      // The real hour where you stand, which is the clock with no offset.
      const { lon } = latLonOf(player.position);
      sky.setHour(localHour(body, lon, date()), date(), player.position);
    },
    fast: {
      get: () => rate !== 1,
      set(on) {
        rate = on ? TIME_LAPSE : 1;
        if (on) live = false;
        return on;
      },
    },
  };

  /* --- the map layer: `B` ------------------------------------------------- */

  let overlayOn = readSetting(OVERLAY_KEY) !== '0';
  const setOverlay = (on: boolean): boolean => {
    overlayOn = on;
    writeSetting(OVERLAY_KEY, on ? '1' : '0');
    return on;
  };

  /* --- the HUD ------------------------------------------------------------ */

  const hud = createHud(political, {
    surface,
    // Back to the planets, from the bar: the solar system, as a rocket goes.
    leave: { label: 'Solar system', run: () => world.leave() },
    // These craft have no horn.
    hints: (_mode, airborne) => (player.craft === null ? undefined : craftHints(player.craft.kind, airborne)),
    onSettings: () => settings.toggle(),
    onMap: () => (map.open ? map.hide() : map.show()),
    // A new nation is a stamp in the book, taken once you are down in it.
    onArrival: (id) => {
      const country = countries[id - 1];
      if (country !== undefined) passport.arrived(country.iso, country.name);
    },
    onPassport: () => passportCard.toggle(),
    onStart: () => input.lock(),
  });
  document.body.appendChild(hud.root);

  // The nations' names over the land from the air, on the map layer's fade.
  // First in the body, for `names.ts`'s reason: behind every card the HUD owns.
  const names = createCountryNames(political, { radius: R, heightAt: (unit) => world.terrain.heightAt(unit.x, unit.y, unit.z) });
  document.body.insertBefore(names.root, document.body.firstChild);

  /* --- the minimap ---------------------------------------------------------- */

  // Over the nations' outlines joined back along their cuts (`outlinesOf`):
  // the disc inks the outline of the nation you stand in, and an outline is
  // its frontiers and nothing else.
  // The maps' paper: the world's ground as its tiles draw it, and its towns,
  // roads, pads and saucers over it (`worlds/map-features.ts`), shared by
  // the disc and the sheet as on Earth.
  const mapTiles = createMapTiles({
    world: political,
    surface,
    features: createWorldFeatures({
      spec,
      settlements,
      roads: () => world.roadRibbons(),
      pads: () => world.pads,
      saucers: () => world.saucers,
    }),
    // Headless (`check-worlds.ts`) there is no `import.meta.env`, and nothing to fetch.
    ...(import.meta.env === undefined ? {} : { baked: `${import.meta.env.BASE_URL}maps/${spec.id}/` }),
  });
  /** The pads within `radius` of `direction`: a few hundred a world, all known at once. */
  const padsNear = (direction: THREE.Vector3, radius: number, out: { push(pad: { id: string; at: THREE.Vector3 }): unknown }): boolean => {
    const cos = Math.cos(radius / R);
    for (const pad of world.pads) if (pad.at.dot(direction) >= cos) out.push(pad);
    return true;
  };
  const minimap = createMinimap(outlinesOf(geography), {
    surface,
    tiles: mapTiles,
    pads: padsNear,
    places: geography.places,
    // The roads between the towns, as the disc traces them: unit vectors.
    roads: () =>
      world.roadLines().map((line) => {
        const out = new Float32Array(line.points.length * 3);
        line.points.forEach(([lat, lon], k) => toUnit(lat, lon, out, k * 3));
        return out;
      }),
  });
  let minimapHolder = document.getElementById('minimap');
  const ownHolder = minimapHolder === null;
  if (minimapHolder === null) {
    minimapHolder = document.createElement('div');
    minimapHolder.id = 'minimap';
    document.body.appendChild(minimapHolder);
  }
  minimapHolder.appendChild(minimap.canvas);

  /* --- the passport --------------------------------------------------------- */

  const passport = createPassport();
  /** Each walked world's writing, read off its spec when the book first opens. */
  const chapters = async (): Promise<readonly PassportChapter[]> => {
    const scripts = new Map<string, Script>();
    await Promise.all(
      WORLD_IDS.map(async (id) => {
        try {
          // The spec alone, not `loadWorldSpec`, which fetches the world's
          // whole kit as well: opening the book downloaded every world's.
          const { WORLD: other } = await WORLDS[id]!();
          if (other.civilisation !== null) scripts.set(id, scriptOf(other.civilisation.script));
        } catch {
          // A world that will not load has a chapter without its writing.
        }
      }),
    );
    return chaptersOf().map((chapter) => {
      const script = scripts.get(chapter.body);
      return script === undefined ? chapter : { ...chapter, script: (text: string) => svgNode(svgOf(script, writeLine(script, text))) };
    });
  };
  const passportCard = createPassportCard({
    passport,
    countries: host.countries ?? [],
    chapters,
    holder: () => ({ name: peers?.name || host.name() || storedName(), appearance: host.appearance() }),
    // It falls open at the visa of the nation underfoot.
    here: () => moment.iso,
    lockTarget,
    // One card at a time, as on Earth: the map gives way to the book.
    onOpen: () => {
      if (map.open) map.hide(false);
      cue('book-open');
    },
    onClose: () => cue('book-close'),
    onTurn: (leaves) => {
      cue('page');
      if (leaves > 1) window.setTimeout(() => cue('page'), 90);
    },
    onThud: () => cue('stamp'),
  });
  document.body.appendChild(passportCard.root);
  passport.onStamp = (stamp) => passportCard.celebrate(stamp);
  const moment: PassportMoment = {
    iso: '', aloft: false, mode: 'foot', time: new Date(0), lat: 0, lon: 0,
    town: { index: -1, name: '', iso: '', inside: false },
  };

  /* --- the marker and the map ------------------------------------------------ */

  const nav = createNavigation({
    minimap,
    hud,
    groundAt: (direction) => R + world.groundAt(direction),
    countryAt: (lat, lon) => {
      const id = political.countryAt(lat, lon);
      return id > 0 ? countries[id - 1]!.iso : null;
    },
    surface,
  });

  /* --- the others ---------------------------------------------------------- */

  const online = host.mode === 'online' && typeof host.peersUrl === 'string' && host.peersUrl !== '';
  const peers: Peers | null = online ? createPeers(host.peersUrl!, createFolk(world.ctx), { body: spec.id, radius: R }) : null;
  if (peers !== null) {
    world.scene.add(peers.group);
    peers.setLook(encodeAppearance(host.appearance()));
  }
  /** The traveller in the fields the link sends. */
  const self: PeerSelf = {
    position: player.position,
    forward: player.facing,
    velocity: 0,
    airborne: false,
    canopy: false,
    sitting: false,
    state: 'foot',
  };

  function joinPeer(id: string): boolean {
    const at = peers?.positionOf(id) ?? null;
    if (at === null) return false;
    const { lat, lon } = latLonOf(at);
    jump(Math.min(89.9, lat + (JOIN_OFFSET / R) * (180 / Math.PI)), lon);
    return true;
  }

  function jump(lat: number, lon: number): void {
    stopTalking();
    world.jumpTo(lat, lon);
    // A jump is not a frontier walked along: the badge says the new place at once.
    hud.jump();
  }

  const map = createWorldMap(political, {
    surface,
    tiles: mapTiles,
    pads: padsNear,
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

  // On another world every row carries the world's mark, not its nations'
  // banners, which nobody would recognise; see `player-list.ts`.
  const playerList = createPlayerList({
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
  document.body.appendChild(playerList.root);

  /* --- the gear --------------------------------------------------------------- */

  const shared = host.settings ?? standaloneSettings();
  input.sensitivity = shared.sensitivity.get();
  hud.setHints(shared.hints.get());
  let performanceOn = shared.performance.get();
  hud.setPerformance(performanceOn);

  const settings = createSettings({
    ...shared,
    sensitivity: {
      ...shared.sensitivity,
      set: (value) => {
        input.sensitivity = shared.sensitivity.set(value);
        return input.sensitivity;
      },
    },
    hints: {
      get: () => hud.hints,
      set: (on) => hud.setHints(shared.hints.set(on)),
    },
    performance: {
      get: () => performanceOn,
      set: (on) => {
        performanceOn = shared.performance.set(on);
        hud.setPerformance(performanceOn);
        return performanceOn;
      },
    },
    // **The render distance is Earth's own knob** (`view.ts`): one number for
    // every world, the same slider, the same keys and the same automatic
    // turn by the frame rate; `index.ts` reads it every frame.
    detail: { get: detail, set: setDetail, min: DETAIL_MIN, max: DETAIL_MAX },
    autoDetail: { get: autoDetail, set: (on) => setAutoDetail(on) },
    flags: { get: () => overlayOn, set: setOverlay },
    time,
    lockTarget,
    // One card at a time, as on Earth.
    onOpen: () => {
      if (map.open) map.hide(false);
      cue('ui-open');
    },
    onClose: () => cue('ui-close'),
  });
  document.body.appendChild(settings.root);

  /* --- the chat ---------------------------------------------------------------- */

  let gazetteer: Gazetteer | null = null;
  const chatPoint = new THREE.Vector3();
  const chat = createChat({
    peers,
    world: spec.id,
    ...(online ? { elsewhere: () => relayPlayers(host.peersUrl!) } : {}),
    name: () => peers?.name || host.name() || storedName(),
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
    // The towns and the nations of this world, and nothing of Earth's: `/goto
    // Paris` on Mars finds nothing, which is the truth there.
    gazetteer: () => (gazetteer ??= { places: geography.places, aliases: new Map(), countries }),
    jumpTo: jump,
    home: () => world.home,
    joinPlayer: joinPeer,
    time,
    // No weather is modelled off Earth: the chat says so.
    weather: () => null,
    emote: gesture,
    photo: () => {
      photoWanted = true;
    },
    sound: () => (host.settings?.sound?.chat?.get() === false ? null : host.sound()),
    lockTarget,
    onOpen: () => {
      if (map.open) map.hide(false);
    },
  });

  /* --- gestures, the photo, the keys ------------------------------------------ */

  let gesturedAt = -Infinity;
  function gesture(name: Emote): boolean {
    if (!player.emote(name)) return false;
    const now = performance.now();
    if (now - gesturedAt >= EMOTE_INTERVAL_MS && peers?.send({ t: 'emote', e: name }) === true) gesturedAt = now;
    return true;
  }

  let photoWanted = false;
  function savePhoto(canvas: HTMLCanvasElement): void {
    const place = places.nearest(player.position).place.name;
    const slug = `${spec.id}-${place}`.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    canvas.toBlob((blob) => {
      if (blob === null) {
        hud.toast('The photo could not be saved', 'camera');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `atlas-${slug}-${stamp}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      hud.toast('Photo saved', 'camera');
    }, 'image/png');
  }

  // The keys that are not controls, from `controls.ts`'s one table, as on Earth.
  addEventListener(
    'keydown',
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (inputBlocked(event)) return;
      const action = actionOf(event.code);
      // The render distance repeats while held, as on Earth; the toggles do not.
      if (action === 'nearer') hud.toast(`Render distance ${setDetail(Math.max(DETAIL_MIN, detail() / 1.25)).toFixed(2)}×`, 'eye');
      else if (action === 'farther') hud.toast(`Render distance ${setDetail(Math.min(DETAIL_MAX, detail() * 1.25)).toFixed(2)}×`, 'eye');
      else if (event.repeat) return;
      else if (action === 'flags') hud.toast(setOverlay(!overlayOn) ? 'Nations and borders on' : 'Nations and borders off', 'flag');
      else if (action === 'hud') hud.toast(hud.toggleHidden() ? `Everything hidden · ${labelOf('hud')} brings it back` : 'Everything back', 'eye');
      else if (action === 'photo') photoWanted = true;
      else if ((action === 'wave' || action === 'dance') && !gesture(action)) hud.toast('Only standing on the ground', 'walk');
    },
    { signal },
  );

  /* --- talking ------------------------------------------------------------------ */

  const civ = spec.civilisation;
  const script = civ === null ? null : scriptOf(civ.script);
  const bubble = createBubble();
  let talking: Walker | null = null;
  let line: Line | null = null;
  let lineTime = 0;
  let speech: Speech | null = null;
  let utterance: Utterance | null = null;
  let lastShown = -1;
  const head = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const nationName = (id: string): string => body.nations.find((one) => one.id === id)?.name ?? body.name;
  const speakerOf = (walker: Walker): string => `${civ?.species.name ?? ''} · ${walker.site.name}`;

  function nearestOther(site: Site): string {
    let best = Infinity;
    for (const other of settlements.sites) {
      if (other === site || other.landmark) continue;
      best = Math.min(best, Math.acos(Math.min(1, site.dir.dot(other.dir))) * R);
    }
    const km = (best / R) * body.radiusKm;
    return Number.isFinite(km) ? `${Math.round(km).toLocaleString('en')} km` : 'very far';
  }

  function say(walker: Walker): void {
    if (civ === null || script === null) return;
    utterance?.stop();
    if (talking !== null && talking !== walker) talking.facing = null;
    talking = walker;
    walker.facing = player.position;
    line = lineOf(civ, script, walker.key, walker.turn, {
      place: walker.site.name,
      nation: nationName(walker.site.nation),
      body: body.name,
      species: civ.species.name,
      distance: nearestOther(walker.site),
    });
    walker.turn++;
    lineTime = 0;
    lastShown = -1;
    const voice = voiceFor(civ.voice, walker.key);
    speech = planSpeech(line.written.said, voice, `${walker.key}:${walker.turn}`);
    const out = host.settings?.sound?.voices?.get() === false ? null : host.sound();
    utterance = out === null ? null : speak(out.context, out.node, speech, voice, 0.9);
    // And the traveller turns to them, as they turn to the traveller.
    crowd.headOf(walker, head).sub(player.position);
    const up = player.position.clone().normalize();
    head.addScaledVector(up, -head.dot(up));
    if (head.lengthSq() > 1e-4) player.facing.copy(head.normalize());
    cue('ui-open');
  }

  function stopTalking(): void {
    utterance?.stop();
    utterance = null;
    if (talking !== null) talking.facing = null;
    if (talking !== null) cue('ui-close');
    talking = null;
    line = null;
    speech = null;
    bubble.hide();
  }

  /** `E` while talking: the rest of the line at once, else the next one, and after the farewell, nothing. */
  function talkOn(walker: Walker): void {
    if (line !== null && speech !== null && lineTime < speech.duration) {
      lineTime = speech.duration;
      return;
    }
    if (walker.turn % ROUND === 0) {
      stopTalking();
      return;
    }
    say(walker);
  }

  /* --- the place remembered --------------------------------------------------------- */

  function saveLastPlace(): void {
    const { lat, lon } = latLonOf(player.position);
    writeSetting(
      LAST_PLACE_KEY,
      JSON.stringify({
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
        name: places.nearest(player.position).place.name,
        iso: isoAt(player.position) ?? '',
        body: spec.id,
        savedAt: Date.now(),
      }),
    );
  }
  const lastPlaceTimer = window.setInterval(saveLastPlace, LAST_PLACE_MS);
  addEventListener('pagehide', saveLastPlace, { signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') saveLastPlace();
    },
    { signal },
  );

  /* --- the frame ----------------------------------------------------------------- */

  /** What the music is told, and when it was last told it. */
  const musicMoment: MusicMoment = {
    mode: 'foot', height: 0, iso: '', continent: '', lat: 0, lon: 0, daylight: 1, town: false, place: 0, hour: 12,
    style: MUSIC_STYLE[spec.id] ?? 'sky',
  };
  let musicAt = -Infinity;
  /** Whether the rocket's keys are up. */
  let wasInRocket = false;
  /** Whether those keys are on the strip still: until out, or until it leaves the pad. */
  let rocketKeysUp = false;
  const scape: Soundscape = { mode: 'foot', speed: 0, throttle: 0, height: 0, sea: 0, daylight: 1, wild: 0, cold: true, air: spec.sky.air };

  /** Once per device, after the first arrival, on any world. */
  let welcomePending = readSetting(WELCOME_KEY) !== '1' && navigator.webdriver !== true;
  const stats = { fps: 0, frameMs: 0, updateMs: 0, drawMs: 0, p95Ms: 0, worstMs: 0, triangles: 0, calls: 0 };
  let frames = 0;
  let sampledAt = performance.now();
  let updateSum = 0;
  let drawSum = 0;
  let worst = 0;

  function update(dt: number): void {
    const state = input.state;
    // Time runs on, faster under the lapse.
    extraMs += dt * 1000 * (rate - 1);

    // In a rocket: `E` gets out until it leaves the pad, `Space` held lights it.
    const inRocket = world.riding();
    if (inRocket !== null) {
      if (!wasInRocket) {
        wasInRocket = true;
        hud.showKeys(ROCKET_KEYS);
        rocketKeysUp = true;
      }
      // Off the pad `E` gets nobody out: the keys go with the clamps.
      if (inRocket.state !== 'boarded' && rocketKeysUp) {
        rocketKeysUp = false;
        hud.showKeys(null);
      }
      if (state.use && inRocket.state === 'boarded') {
        world.leaveRocket();
        cue('ui-click');
      }
      hud.setPrompt(inRocket.state === 'boarded' ? 'Get out' : null, 'walk');
    } else if (wasInRocket) {
      wasInRocket = false;
      if (rocketKeysUp) hud.showKeys(null);
      rocketKeysUp = false;
    }

    // `E`: get out; else whoever is nearer, somebody to talk to, a seat or a rocket.
    const afoot = player.craft === null && !player.airborne && inRocket === null;
    const walker = civ === null || !afoot ? null : crowd.nearest(player.position, TALK_REACH);
    // Never in mid-fall: out of an aircraft is out until the ground.
    const craft = player.craft === null && inRocket === null && !player.parachute ? world.craftInReach() : null;
    const rocket = afoot ? world.rocketInReach() : null;
    const rocketAway = rocket === null ? Infinity : rocket.position.distanceTo(player.position) - 4;
    const craftAway = craft === null ? Infinity : craft.position.distanceTo(player.position);
    const talkFirst = walker !== null && walker.mesh.position.distanceTo(player.position) < Math.min(craftAway, rocketAway);
    const rocketFirst = rocket !== null && !talkFirst && rocketAway < craftAway;
    if (inRocket !== null) {
      // Handled above.
    } else if (state.use) {
      if (player.craft !== null) {
        player.leave();
        cue('ui-click');
      } else if (talking !== null && (walker === null || walker === talking)) talkOn(talking);
      else if (talkFirst) say(walker!);
      else if (rocketFirst) {
        stopTalking();
        world.boardRocket(rocket!);
        cue('ui-confirm');
      } else if (craft !== null) {
        stopTalking();
        player.board(craft);
        cue('ui-confirm');
      }
    }

    // The prompt: what `E` would do here.
    if (inRocket !== null) {
      // Set above.
    } else if (player.craft !== null) hud.setPrompt('Get out', 'walk');
    else if (talking !== null) hud.setPrompt(talking.turn % ROUND === 0 && lineTime >= (speech?.duration ?? 0) ? 'Goodbye' : 'Next', 'talk');
    else if (talkFirst) hud.setPrompt('Talk', 'talk');
    else if (rocketFirst) hud.setPrompt('Board the rocket', 'sparkle');
    else if (craft !== null) hud.setPrompt('Drive', ICON_OF[craft.kind]);
    else hud.setPrompt(null);

    const mode: TravelMode = player.craft === null ? 'foot' : MODE_OF[player.craft.kind];
    hud.setMode(mode, player.craft?.airborne ?? false, rig.firstPerson);
    hud.setPaused(
      !input.looking && !map.open && !settings.open && !(host.traveller?.open ?? false) && !chat.open && !passportCard.open,
      input.dragging,
    );
    if (welcomePending && frames > 2) {
      welcomePending = false;
      writeSetting(WELCOME_KEY, '1');
      void hud.welcome();
    }

    // Where you are, asked once and handed to the disc, the chip and the book.
    const standingIn = political.countryAtPoint(player.position);
    const nearby = places.nearest(player.position);
    if (peers !== null) minimap.setPeers(peers.marks);
    minimap.update(player.position, player.facing, { country: standingIn, place: nearby }, rig.heading);
    nav.update(dt, player, rig.camera);
    playerList.update(dt);
    map.update(player.position, player.facing);

    // The map layer, on one number: the nations' colour over the ground and
    // the frontiers widening to the map's line.
    const fade = overlayOn ? smoothstep(OVERLAY_LOW, OVERLAY_HIGH, rig.altitude) : 0;
    ground.political = fade * POLITICAL_CEILING;
    const pixel = (2 * Math.tan((rig.camera.fov * Math.PI) / 360) * Math.max(1, rig.altitude)) / Math.max(1, innerHeight);
    const fog = world.scene.fog as THREE.Fog | null;
    frontiers.enabled = overlayOn;
    frontiers.update(rig.camera.position, fade, pixel, fog?.near ?? 1e9, fog?.far ?? 2e9, 3);
    names.update(fade, rig.camera, standingIn);

    const here = latLonOf(player.position);
    const nearest = nearby.place;
    hud.update(standingIn, nearby, clockText(sky.state.hour), dt, bearingTo(player.position, player.facing, nearest.lat, nearest.lon));

    moment.iso = standingIn > 0 ? countries[standingIn - 1]!.iso : '';
    moment.aloft = player.airborne || (player.craft?.airborne ?? false);
    moment.mode = player.craft === null ? 'foot' : MODE_OF[player.craft.kind];
    moment.time = date();
    moment.lat = here.lat;
    moment.lon = here.lon;
    moment.town.index = nearby.index;
    moment.town.name = nearest.name;
    moment.town.iso = nearest.iso;
    moment.town.inside = nearby.inside;
    passport.observe(moment);

    // **Earth's ear**: the wind, the engine of what you drive and the music,
    // through the same mix and the same voices. No birds and no crickets:
    // nothing on these worlds sings (`wild` 0, `cold`).
    const riding = player.craft;
    scape.mode = riding === null ? 'foot' : SOUND_OF[riding.kind];
    scape.speed = riding === null ? player.velocity.length() : Math.abs(riding.speed);
    scape.throttle = riding === null ? 0 : Math.abs(riding.speed) / Math.max(1, riding.top);
    scape.height = rig.altitude;
    scape.daylight = sky.state.day;
    host.soundscape?.(dt, scape);
    const nowMs = performance.now();
    if (nowMs - musicAt >= MUSIC_MS) {
      musicAt = nowMs;
      musicMoment.mode = riding === null ? 'foot' : MUSIC_OF[riding.kind];
      musicMoment.height = rig.altitude;
      musicMoment.lat = here.lat;
      musicMoment.lon = here.lon;
      musicMoment.daylight = sky.state.day;
      musicMoment.town = nearby.inside;
      musicMoment.place = nearby.index;
      musicMoment.hour = sky.state.hour;
      host.music?.(musicMoment);
    } else host.music?.(null);

    if (peers !== null) {
      self.velocity = player.craft === null ? player.velocity.length() : Math.abs(player.craft.speed);
      self.airborne = moment.aloft;
      self.canopy = player.canopy;
      self.state = player.craft === null && world.riding() === null ? 'foot' : 'seated';
      peers.update(dt, self);
    }

    // The bubble: typed out in step with the voice, held, then gone.
    if (talking !== null && line !== null && speech !== null && script !== null) {
      lineTime += dt;
      const fraction = speech.length === 0 ? 1 : revealed(speech, lineTime) / speech.length;
      const shown = Math.round(fraction * line.written.length) + (fraction >= 1 ? 1 : 0);
      if (shown !== lastShown) {
        lastShown = shown;
        bubble.show(speakerOf(talking), svgNode(svgOf(script, line.written, { shown })), fraction >= 1 ? `≈ ${line.english}` : '', {
          action: talking.turn % ROUND === 0 ? 'Goodbye' : 'Next',
        });
      }
      crowd.headOf(talking, head);
      projected.copy(head).project(rig.camera);
      bubble.place((projected.x * 0.5 + 0.5) * innerWidth, (-projected.y * 0.5 + 0.5) * innerHeight, projected.z < 1);
      if (lineTime > speech.duration + LINE_HOLD || talking.mesh.position.distanceTo(player.position) > TALK_LEAVE) stopTalking();
    }
  }

  function drawn(updateMs: number, drawMs: number): void {
    if (photoWanted) {
      photoWanted = false;
      if (map.open) hud.toast('Close the map to take a photo', 'camera');
      else savePhoto(host.renderer.domElement);
    }
    frames++;
    updateSum += updateMs;
    drawSum += drawMs;
    worst = Math.max(worst, updateMs + drawMs);
    const now = performance.now();
    if (now - sampledAt >= STATS_MS) {
      const span = now - sampledAt;
      stats.fps = Math.round((frames * 1000) / span);
      stats.updateMs = updateSum / frames;
      stats.drawMs = drawSum / frames;
      stats.frameMs = stats.updateMs + stats.drawMs;
      stats.p95Ms = worst;
      stats.worstMs = worst;
      stats.triangles = host.renderer.info.render.triangles;
      stats.calls = host.renderer.info.render.calls;
      frames = 0;
      updateSum = 0;
      drawSum = 0;
      worst = 0;
      sampledAt = now;
      if (performanceOn) hud.showPerformance(stats);
    }
  }

  let disposed = false;
  return {
    date,
    update,
    drawn,
    hud,
    mapTiles,
    map,
    pumpTiles() {
      mapTiles.pump(MAP_TILES_MS, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      saveLastPlace();
      stopTalking();
      window.clearInterval(lastPlaceTimer);
      abort.abort();
      chat.dispose();
      settings.dispose();
      playerList.dispose();
      passportCard.dispose();
      map.dispose();
      nav.dispose();
      minimap.dispose();
      mapTiles.dispose();
      minimap.canvas.remove();
      if (ownHolder) minimapHolder.remove();
      bubble.dispose();
      names.dispose();
      hud.dispose();
      if (peers !== null) {
        peers.dispose();
        world.scene.remove(peers.group);
      }
    },
  };
}

/**
 * The shared rows for the `?world=` link, which has no Earth to borrow them
 * from: held for the visit, and the same shapes Earth hands a world.
 */
function standaloneSettings(): WorldSettings {
  let sensitivity = 1;
  let hints = true;
  let performance = false;
  let resolution = 'auto';
  return {
    sensitivity: { get: () => sensitivity, set: (value) => (sensitivity = value), min: 0.3, max: 3 },
    hints: { get: () => hints, set: (on) => (hints = on) },
    performance: { get: () => performance, set: (on) => (performance = on) },
    resolution: { get: () => resolution, set: (value) => (resolution = value), options: [['auto', 'Auto']] },
  };
}
