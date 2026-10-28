/**
 * The front door: the traveller's card and the hero stage it shares with the
 * title, the planet menu, the title screen and the settings card shown before
 * the world is built. Also reads how this load was asked to start: a
 * `?at=` link or a journey skips the menus, `TO_SYSTEM_KEY` skips the title.
 */
import { dressHero, heroAppearance, wardrobeCast } from '../avatar.ts';
import { decodeAppearance, encodeAppearance } from '../appearance.ts';
import { relayPlayers } from '../relay-players.ts';
import { DETAIL_MAX, DETAIL_MIN, autoDetail, detail, setAutoDetail, setDetail } from '../view.ts';
import type { HeroStage } from '../hero-stage.ts';
import type { Menu } from '../menu.ts';
import type { createMenuSound } from '../menu-sound.ts';
import type { Settings } from '../settings.ts';
import type { Traveller } from '../traveller.ts';
import type { PlayMode, WorldSettings } from '../world-host.ts';
import type { App } from './context.ts';
import { RESOLUTIONS, pixelRatioFor } from './graphics.ts';
import { takeJourney, takeToSystem } from './journey.ts';
import type { Journey } from './journey.ts';
import { exploreWorld, loadMenuBody } from './other-worlds.ts';
import { renderDistanceWords } from './render-distance.ts';
import {
  HINTS_KEY, OVERLAY_KEY, PERFORMANCE_KEY, RESOLUTION_KEY, SENSITIVITY_KEY, WEATHER_KEY,
  readSetting, storedToggle, writeSetting,
} from './storage.ts';

/** Where you wake up without a link: Palma de Mallorca. */
const START = { lat: 39.62, lon: 2.99 };

/** How this page was asked to start. */
export interface Launch {
  journey: Journey | null;
  /** A point on Earth to land on directly, skipping every menu: `?at=` or a journey to Earth. */
  skipTo: { lat: number; lon: number } | null;
  /** How a load that skips the title plays: as chosen last time, online if never, offline under automation. */
  linkedMode: PlayMode;
  /** Straight to the solar system, past the title. */
  toSystem: boolean;
  /** A journey to another world, entered as soon as the loading screen lifts. */
  awayJourney: Journey | null;
}

export interface FrontDoor {
  heroStage: HeroStage;
  traveller: Traveller;
  menu: Menu;
  menuSound: ReturnType<typeof createMenuSound>;
  /** The rows every settings card shares, the other worlds' included. */
  sharedSettings: WorldSettings;
  frontSettings: Settings;
  launch: Launch;
  /** Resolves once every other world's menu globe is built. */
  prepared: Promise<void>;
}

/** Fills `app.title` too, unless a link skips every menu. */
export async function openFrontDoor(app: App): Promise<FrontDoor> {
  const { deferred, renderer, post, sky, world, places, query, peersModule } = app;
  const { audio } = app.sound;

  // The name is the relay's once connected, else what the first connection will send.
  const { createTraveller, createHeroStage } = await deferred.traveller;
  const travellerName = {
    get: (): string => app.peersLink?.name ?? peersModule.storedName(),
    set: (name: string): string => (app.peersLink === null ? peersModule.storeName(name) : app.peersLink.rename(name)),
  };
  const heroStage = createHeroStage({ appearance: heroAppearance, cast: wardrobeCast, name: travellerName });
  document.body.appendChild(heroStage.root);
  app.title = null;
  const traveller = createTraveller({
    appearance: {
      get: heroAppearance,
      set: (appearance) => {
        dressHero(appearance).catch((error: unknown) => console.warn('atlas: the new clothes did not arrive', error));
        app.peersLink?.setLook(encodeAppearance(appearance));
      },
    },
    stage: heroStage,
    lockTarget: renderer.domElement,
    // The title steps aside for the card while it is open.
    onOpen: () => {
      audio.cue('ui-open');
      app.title?.aside(true);
    },
    onClose: () => {
      audio.cue('ui-close');
      app.title?.aside(false);
    },
  });
  document.body.appendChild(traveller.root);
  // What an account changes on the front door: the name on the plate and the relay, the look.
  app.account?.attach({
    name: (name) => {
      app.peersLink?.rename(name);
      heroStage.refreshName();
    },
    look: (code) => {
      const appearance = decodeAppearance(code);
      if (appearance === null) return;
      dressHero(appearance).catch((error: unknown) => console.warn('atlas: the new clothes did not arrive', error));
      app.peersLink?.setLook(code);
    },
  });

  const { createMenu, earthBody } = await deferred.menu;
  const { createMenuSound } = await deferred.menuSound;
  const { createTitle, storedPlayMode } = await deferred.title;
  const menuSound = createMenuSound(audio, app.sound.musicSettings);
  const menu = createMenu({
    // The aliases are famous names folded into a neighbour by the bake (Kobe into Osaka).
    bodies: [earthBody(world, places.all, places.aliases())],
    scene: app.scene,
    renderer,
    draw: (target, camera) => post.render(target, camera),
    pixelRatio: () => pixelRatioFor(app.resolution),
    fallback: { lat: START.lat, lon: START.lon, name: 'Palma' },
    time: () => sky.state.time,
    sunDirection: () => sky.state.sun,
    sound: menuSound,
    loadBody: (id, centre, drawnRadius) => loadMenuBody(id, centre, drawnRadius),
    exploreBody: (id, name, spawn) => exploreWorld(app, id, name, spawn),
    // `Esc` over the solar system: back to the title.
    onLeave: () => {
      if (app.title === null || app.title.open) return;
      menu.hold(true);
      app.title.show();
    },
  });
  document.body.appendChild(menu.root);

  const launch = readLaunch(query, storedPlayMode);
  const sharedSettings = createSharedSettings(app);
  const frontSettings = await createFrontSettings(app, sharedSettings);

  // Made even when going straight to the planets, and kept hidden, so `Esc` there reaches it.
  if (launch.skipTo === null) {
    const title = createTitle({
      stage: heroStage,
      online: app.peersUrl !== '',
      players: () => relayPlayers(app.peersUrl).then((all) => (all === null ? null : all.length)),
      customise: () => traveller.show(),
      settings: () => frontSettings.show(),
      ...(app.account === null ? {} : { account: (into: HTMLElement) => app.account!.mount(into, 'title', () => frontSettings.show('account')) }),
      covered: () => traveller.open || frontSettings.open,
      sound: { hover: () => menuSound.cue('hover'), select: () => menuSound.cue('select') },
      onChoose: () => menu.hold(false),
    });
    app.title = title;
    if (!launch.toSystem) {
      menu.hold(true);
      title.show();
    }
  }
  // Every other world's globe is built under the loading screen, so picking one never waits.
  const prepared = launch.skipTo !== null ? Promise.resolve() : menu.prepare();
  return { heroStage, traveller, menu, menuSound, sharedSettings, frontSettings, launch, prepared };
}

function readLaunch(query: URLSearchParams, storedPlayMode: () => PlayMode | null): Launch {
  const journey = takeJourney();
  const at = journey?.world === 'earth' ? [journey.lat, journey.lon] : query.get('at')?.split(',').map(Number);
  // A latitude past a pole is refused rather than wrapped: such a link gets the menus.
  const skip = at !== undefined && at.length === 2 && at.every(Number.isFinite) && Math.abs(at[0]!) <= 90 && Math.abs(at[1]!) <= 360;
  const linkedMode: PlayMode = journey?.mode ?? (navigator.webdriver ? 'offline' : (storedPlayMode() ?? 'online'));
  let toSystem = takeToSystem();
  const awayJourney = journey !== null && journey.world !== 'earth' ? journey : null;
  if (awayJourney !== null) toSystem = true;
  return { journey, skipTo: skip ? { lat: at![0]!, lon: at![1]! } : null, linkedMode, toSystem, awayJourney };
}

/** Rows whose values live in storage or on live objects, so every card moves the same values. */
function createSharedSettings(app: App): WorldSettings {
  return {
    sensitivity: {
      get: () => Number(readSetting(SENSITIVITY_KEY) ?? '1') || 1,
      set: (value) => {
        writeSetting(SENSITIVITY_KEY, value.toFixed(3));
        return value;
      },
      min: 0.3,
      max: 3,
    },
    performance: storedToggle(PERFORMANCE_KEY, false),
    hints: storedToggle(HINTS_KEY, true),
    resolution: {
      get: () => app.resolution,
      set: (value) => {
        app.resolution = RESOLUTIONS.find(([option]) => option === value)?.[0] ?? 'auto';
        writeSetting(RESOLUTION_KEY, app.resolution);
        // The menu sizes the renderer and asks for the ratio on a resize.
        dispatchEvent(new Event('resize'));
        return app.resolution;
      },
      options: RESOLUTIONS,
    },
    sound: app.sound.soundRows,
    music: app.sound.musicRows,
  };
}

/** The title's own settings card, over the values the world reads when it is built. It never answers the settings key. */
async function createFrontSettings(app: App, sharedSettings: WorldSettings): Promise<Settings> {
  const { createSettings } = await app.deferred.settings;
  const { audio } = app.sound;
  const frontSettings = createSettings({
    ...sharedSettings,
    key: false,
    detail: { get: detail, set: setDetail, min: DETAIL_MIN, max: DETAIL_MAX },
    detailDistance: renderDistanceWords,
    autoDetail: { get: autoDetail, set: (on) => setAutoDetail(on) },
    flags: storedToggle(OVERLAY_KEY, true),
    weather: {
      get: () => app.weather.enabled,
      set: (on) => {
        app.weather.enabled = on;
        writeSetting(WEATHER_KEY, on ? '1' : '0');
        return on;
      },
    },
    lockTarget: null,
    onOpen: () => audio.cue('ui-open'),
    onClose: () => audio.cue('ui-close'),
  });
  // Over the title (`z-index` 10).
  frontSettings.root.style.zIndex = '12';
  document.body.appendChild(frontSettings.root);
  return frontSettings;
}
