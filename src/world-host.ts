/**
 * What a walkable world other than Earth is handed when the planet menu's
 * *Explore* opens it: `src/worlds/index.ts` exports
 *
 *   enterWorld(bodyId: string, host: WorldHost): void | Promise<void>
 *
 * and `main.ts` imports it on demand, so nothing of `src/worlds/` or
 * `src/system/` is in Earth's first load. The menu is suspended (not drawing,
 * its overlay hidden) for as long as the world has the screen; the world
 * gives it back by calling `exit` once it has stopped its own loop, removed
 * its own DOM and released whatever it added to the renderer.
 *
 * `main.ts` hands every field; the optional ones are optional only for
 * `standalone` in `src/worlds/index.ts`, the `?world=` link, which has no
 * menu, no relay and no Earth to borrow them from.
 *
 * Types only: nothing here runs.
 */
import type * as THREE from 'three';
import type { Appearance } from './appearance.ts';
import type { Cue, Soundscape } from './audio.ts';
import type { Gazetteer } from './chat-core.ts';
import type { MusicMoment } from './music.ts';
import type { Cast } from './cast.ts';
import type { SettingsOptions } from './settings.ts';

/** How the player chose to play on the title screen; offline opens no socket at all. */
export type PlayMode = 'online' | 'offline';

/**
 * Where the menu put the traveller down: a settlement chosen in the body's
 * site stage, or a place remembered from the last visit.
 *
 * `settlement` is the settlement's id within its body (`Settlement.id`, the
 * menu's `MenuSite.id`), and the world lands on that settlement's own arrival
 * — its first avenue, looking at the plaza. `null` is *Continue where you
 * left off* with no settlement to name: the world stands the traveller at
 * `lat`/`lon` as it finds the ground there. `name` and `region` are what the
 * menu showed, for a card; neither is a key.
 */
export interface WorldArrival {
  settlement: string | null;
  lat: number;
  lon: number;
  name: string;
  /** The nation's name as the menu showed it, `''` for none. */
  region: string;
}

/**
 * Earth's own settings, live, for the world's settings card: the same values
 * the title's card and Earth's card turn, so a change on one world holds on
 * every other and after a reload. Each is `settings.ts`'s own row shape, to
 * hand straight to `createSettings`; what only Earth has (the detail knob,
 * the map layer, the weather) is not here, and a world builds its own.
 */
export type WorldSettings = Pick<
  SettingsOptions,
  'sensitivity' | 'hints' | 'performance' | 'resolution' | 'sound' | 'music'
>;

export interface WorldHost {
  /** The page's one renderer, already sized to the window; the world draws with it. */
  renderer: THREE.WebGLRenderer;
  /** One frame through the world's own ink pass (`OutlineEffect`): two passes, not `renderer.render`. */
  draw(scene: THREE.Scene, camera: THREE.Camera): void;
  /** The pixel ratio the player's Resolution setting asks for, asked again on every resize. */
  pixelRatio(): number;
  /** The sound's effects bus once a gesture has opened it, or null while it is silent. */
  sound(): { context: AudioContext; node: AudioNode } | null;
  /** How the traveller looks, and the cast that dresses it (every outfit loaded). */
  appearance(): Appearance;
  cast(): Promise<Cast>;
  /** The traveller's name, `''` for none. */
  name(): string;
  /** Online or offline, as chosen on the title screen. */
  mode: PlayMode;
  /** The real clock the orrery and the sky are laid out for. */
  time(): Date;
  /**
   * Hands the screen back to the planet menu. Call once, after the world has
   * cleaned up. `'system'` is leaving the world altogether — a rocket gone
   * up, the bar's *Solar system* — and the menu flies out to the whole system;
   * without it the menu is back on the world's globe, where it was left.
   */
  exit(to?: 'system'): void;
  /**
   * Where to stand: the settlement picked in the menu, or the place remembered.
   * `null` or absent and the world chooses (the `?world=` link without `&site=`).
   */
  arrival?: WorldArrival | null;
  /**
   * The relay's `/ws` address (`VITE_PEERS_URL`), `''` for a build with none.
   * The world opens its own link with `createPeers(url, folk, { body, radius })`,
   * and only when `mode` is `'online'`.
   */
  peersUrl?: string;
  /** Earth's live settings rows; see `WorldSettings`. */
  settings?: WorldSettings;
  /** One of the interface's recorded cues (`audio.ts`'s `Cue`) through Earth's mix. */
  cue?(name: Cue): void;
  /** The traveller's creator (`traveller.ts`), the page's one card. */
  traveller?: { show(options?: { relock?: boolean }): void; readonly open: boolean };
  /**
   * One footfall through Earth's mix (`Audio.step`), `weight` 1 a walk and
   * more a run: the world's own feet sound like Earth's.
   */
  step?(weight: number): void;
  /**
   * Earth's countries, for the passport's own chapter: the book is one book on
   * every world, and its Earth pages list every country stamped or not.
   */
  countries?: readonly { iso: string; name: string; continent: string }[];
  /**
   * Off to another world from this one, at `lat`, `lon` on it — `/goto` and
   * `/tp` to a place or a player that is not here. The page reloads into it.
   */
  travel?(world: string, lat: number, lon: number, name: string): void;
  /** Every world's towns and nations, for `/goto`; null before they are made. */
  gazetteer?(): Gazetteer | null;
  /**
   * Earth's soundscape, every frame (`Audio.update`): the wind, the engines
   * and the air round the ear are Earth's own, told what this world is doing.
   */
  soundscape?(dt: number, scape: Soundscape): void;
  /**
   * Earth's music: `moment` when where you are has been asked (twice a
   * second, `Music.observe`), null on the frames between, which only hand the
   * next notes on (`Music.update`).
   */
  music?(moment: MusicMoment | null): void;
}

/** `src/worlds/index.ts`'s shape, as `main.ts` imports it. */
export interface WorldsModule {
  enterWorld(bodyId: string, host: WorldHost): void | Promise<void>;
}
