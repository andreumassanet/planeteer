/**
 * `window.atlas`, for poking at the world from the console. `atlas.goTo(48.86,
 * 2.29)` stands you by the Eiffel Tower; `atlas.rig.view.height = 30000`
 * pulls back until the whole planet fits.
 */
import * as THREE from 'three';
import { toLatLon } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { dressHero, heroAppearance } from '../avatar.ts';
import { decodeAppearance, encodeAppearance } from '../appearance.ts';
import { floodTuning, lightBrightness } from '../lights.ts';
import { prominenceRadius, setProminenceRadius } from '../places.ts';
import { unitAt } from '../sphere.ts';
import { autoDetail, autoDetailState, detail, setAutoDetail, setDetail } from '../view.ts';
import type { FeatureKind } from '../countryside.ts';
import type { Rocket } from '../rocket.ts';
import type { Stamp } from '../passport.ts';
import type { App } from './context.ts';

const MUSIC_STYLES = ['iberia', 'latin', 'brazil', 'andes', 'north-america', 'atlantic-folk', 'nordic', 'east-europe', 'mediterranean', 'maghreb', 'middle-east', 'sub-saharan', 'south-asia', 'east-asia', 'japan', 'southeast-asia', 'oceania', 'polar', 'sea', 'sky'];

export function exposeDebug(app: App): void {
  const { player, places, settlements, mapTiles, minimap, vegetation, sound, world } = app;
  Object.assign(globalThis, {
    atlas: {
      world,
      peers: app.peers,
      chat: app.chat,
      player,
      /** `.show()` opens the card, `.code()` is what the others are sent, `.wear(code)` dresses the hero in one. */
      traveller: travellerDebug(app),
      /** `.stats`, `.nearest('boat')`, `.board(id)`; `.sites.all()` works out the whole planet's, which takes seconds. */
      fleet: app.fleet,
      /** `.pads.padsNear(dir, r, [])`, `.standing()`, `.board()`, `.launch()`, `.leave()`, `.ignite()`, `.stats`. */
      rockets: rocketsDebug(app),
      rig: app.rig,
      scene: app.scene,
      /** `.setTime(iso)` freezes the sky at an instant; `.setRate(600)` runs ten minutes a second. */
      sky: app.sky,
      /** The stars and planets, or null before they arrive. */
      get night() {
        return app.night.sky;
      },
      input: app.input,
      renderer: app.renderer,
      /** A frame is two passes when inked: time `outline.render`, not `renderer.render`. */
      outline: app.outline,
      /** `.exposure`, `.bloom.strength`, `.uniforms`; `.shafts.override = 0` takes the light shafts out. */
      post: app.post,
      /** `atlas.ink(true)` draws the outlines; `atlas.ink()` reads it. */
      ink(on?: boolean) {
        if (on !== undefined) app.ink.set(on);
        return app.ink.on;
      },
      stats: app.frameStats.stats,
      hud: app.hud,
      minimap,
      mapTiles,
      /** Plans the towns within `reach` units now, then paints the asked tiles for up to `ms`. For screenshots. */
      settleMaps: (ms?: number, reach?: number) => settleMaps(app, ms, reach),
      borders: app.borders,
      /**
       * The map layer (`B`): `atlas.flags()` reads it, `(false)` turns it off
       * and keeps that, a number sets what a full fade blends to. The fade
       * itself follows altitude.
       */
      flags: (on?: boolean | number) => flags(app, on),
      names: app.names,
      monuments: app.monuments,
      settlements,
      roads: app.roads,
      life: app.life,
      air: app.airTraffic,
      railway: app.railway,
      townsfolk: app.townsfolk,
      /** `.script(key, where)` is a conversation's lines; `.with` is who you are talking to. */
      talk: app.talk,
      /** `.burst('crash' | 'splash' | 'dust' | 'ripple')` where you stand; `.enabled = false` is the A/B. */
      effects: app.effects,
      /** Which guarded subsystems have thrown in the loop, and how often. */
      failures: app.failures,
      /** Ms a frame each guarded subsystem costs, smoothed, dearest first. */
      timings: () => Object.fromEntries([...app.timings].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Number(v.toFixed(3))])),
      audio: sound.audio,
      /** `.stats`; `.play('japan')` forces a style, `.play()` hands it back to the map; `.styles`. */
      music: musicDebug(app),
      /** `.stats`, `.sample(lat, lon, level)`, `.verify(lat, lon)`. */
      vegetation,
      grass: app.grass,
      /** `.stats`, `.find('windmill')` the nearest one, `.plan()` what the cell underfoot holds. */
      countryside: countrysideDebug(app),
      clouds: app.clouds,
      /** `.here()`, `.force('storm')` and `.force(null)`, `.at(lat, lon, when?)`, `.enabled`. */
      weather: app.weather,
      ambient: app.ambient,
      sea: app.sea,
      seaLife: app.seaLife,
      /** `.data`, `.show()`, `.celebrate(stamp)`, `.clear()`. */
      passport: passportDebug(app),
      ocean: app.ocean,
      /**
       * `.points.visible = false` hides the far city lights; `.flood` tunes the
       * landmarks' floodlights (keep `.cap` under the bloom's threshold).
       */
      lights: Object.assign(app.cityLights, { flood: floodTuning }),
      /** `atlas.brightness(0)` turns every emitting surface off. */
      brightness: lightBrightness,
      nav: app.nav,
      map: app.map,
      placements: app.placements,
      places,
      goTo(lat: number, lon: number) {
        app.jumpTo(lat, lon);
        const id = world.countryAtPoint(player.position);
        return id > 0 ? world.countries[id - 1]!.name : 'Open ocean';
      },
      /** How far the world is built (`view.ts`); setting it turns the automatic knob off. */
      detail(value?: number) {
        if (value !== undefined) app.showDetail(setDetail(value));
        return detail();
      },
      /** The automatic detail knob's state; `(false)` turns it off, `(true)` on. */
      autoDetail(on?: boolean) {
        if (on !== undefined) setAutoDetail(on);
        return { ...autoDetailState, on: autoDetail() };
      },
      /**
       * How near a much bigger town hides this one, units (`PROMINENCE_RADIUS`).
       * Live for towns, trees and herds; the road network is baked against
       * the default, so changing it needs `pnpm roads`.
       */
      prominence(radius?: number) {
        if (radius !== undefined) setProminenceRadius(radius);
        return prominenceRadius();
      },
    },
  });
}

function travellerDebug(app: App) {
  return {
    show: () => app.traveller.show(),
    code: () => encodeAppearance(heroAppearance()),
    wear: (code: string) => {
      const appearance = decodeAppearance(code);
      if (appearance === null) return false;
      void dressHero(appearance);
      app.peers?.setLook(encodeAppearance(appearance));
      return true;
    },
  };
}

function rocketsDebug(app: App) {
  const { launchPads, player } = app;
  const byDistance = (a: Rocket, b: Rocket): number => a.position.distanceTo(player.position) - b.position.distanceTo(player.position);
  return {
    pads: app.padIndex,
    standing: () => launchPads.standing(),
    get stats() {
      return launchPads.stats;
    },
    board: (rocket?: Rocket) => {
      const nearest = rocket ?? launchPads.standing().sort(byDistance)[0];
      if (nearest !== undefined) app.rockets.board(nearest);
    },
    launch: (rocket?: Rocket) => {
      const nearest = rocket ?? launchPads.standing().filter((one) => one.state === 'parked').sort(byDistance)[0];
      return nearest?.autolaunch() ?? false;
    },
    leave: () => app.rockets.leave(),
    /** Holds `Space` for the player in the rocket he is in, through to the solar system. */
    ignite: () => (app.rockets.held = launchPads.riding !== null),
  };
}

async function settleMaps(app: App, ms = 4000, reach = 3000) {
  const { player, places, settlements, mapTiles, minimap } = app;
  const here = player.position.clone().normalize();
  const at = new THREE.Vector3();
  const cos = Math.cos(reach / PLANET_RADIUS);
  places.all.forEach((place, index) => {
    if (unitAt(place.lat, place.lon, at).dot(here) > cos) settlements.townPlanNow(index);
  });
  const until = performance.now() + ms;
  // Yield between slices: baked images and stored tiles arrive by promise.
  while (performance.now() < until) {
    mapTiles.pump(100);
    minimap.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (mapTiles.stats.pending === 0) break;
  }
  return mapTiles.stats;
}

function flags(app: App, on?: boolean | number) {
  const { overlay } = app;
  if (typeof on === 'boolean') app.announce(overlay.set(on) ? 'flags on' : 'flags off');
  else if (typeof on === 'number') {
    overlay.setCeiling(on);
    overlay.set(true);
  }
  const layer = overlay.flagLayer;
  return {
    enabled: overlay.on,
    fade: Number(overlay.fade.toFixed(3)),
    layer: layer === null ? 'not built' : { ...layer.state },
    borders: { ...app.borders.stats },
    names: { ...app.names.stats },
  };
}

function musicDebug(app: App) {
  const { sound } = app;
  return {
    get stats() {
      return sound.music?.stats ?? { loaded: false, loading: sound.musicLoading, on: sound.musicSettings.on };
    },
    get styles() {
      return [...MUSIC_STYLES];
    },
    play(style?: string | null): string {
      if (sound.music !== null) return sound.music.play(style);
      sound.musicAsked = style ?? null;
      sound.loadMusic();
      return sound.audio.output === null
        ? 'The sound is not open yet: click in the world once, then ask again.'
        : sound.musicSettings.on ? 'Loading the music; it will start in a moment.' : 'Music is off in Settings.';
    },
  };
}

function countrysideDebug(app: App) {
  const { vegetation, countryMotion, player } = app;
  return {
    get stats() {
      return { ...vegetation.stats.country, motion: countryMotion.stats };
    },
    find: (kind: FeatureKind, reach = 4) => {
      const here = toLatLon(player.position);
      return vegetation.countryside?.find(kind, here.lat, here.lon, reach) ?? null;
    },
    plan: () => {
      const here = toLatLon(player.position);
      const plan = vegetation.countryside?.planAt(here.lat, here.lon);
      return plan === undefined ? null : { key: plan.key, kind: plan.kind, region: plan.style.id, pieces: plan.pieces.map((piece) => piece.part), fields: plan.fields.map((field) => field.crop), fences: plan.lines.length, meadows: plan.meadows.length };
    },
    motion: countryMotion,
  };
}

function passportDebug(app: App) {
  return {
    get data() {
      return app.passport.data;
    },
    show: () => app.passportCard.show(),
    celebrate: (stamp: Stamp) => app.passportCard.celebrate(stamp),
    clear: () => app.passport.clear(),
  };
}
