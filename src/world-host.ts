/**
 * The contract between Earth's page and a walkable world other than Earth.
 * `src/worlds/index.ts` exports
 *
 *   enterWorld(bodyId: string, host: WorldHost): void | Promise<void>
 *
 * and Earth imports it on demand, so nothing of `src/worlds/` or
 * `src/system/` is in Earth's first load. The planet menu is suspended while
 * the world has the screen; the world calls `exit` once it has stopped its
 * loop, removed its DOM and released what it added to the renderer.
 *
 * Earth hands every field; the optional ones are optional only for
 * `standalone` (the `?world=` link), which has no menu, relay or Earth to
 * borrow them from. Types only.
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
 * Where the menu put the traveller down: a settlement chosen on the body's
 * globe, or a place remembered from the last visit.
 *
 * `settlement` is the settlement's id within its body (`Settlement.id`, the
 * menu's `MenuSite.id`), and the world lands on that settlement's arrival
 * point. `null` means *Continue where you left off*: the world stands the
 * traveller at `lat`/`lon`. `name` and `region` are for display only.
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
 * Earth's live settings rows for a world's settings card, so a change on one
 * world holds on every other and after a reload. Each is `settings.ts`'s row
 * shape; what only Earth has (detail, map layer, weather) is left out.
 */
export type WorldSettings = Pick<
  SettingsOptions,
  'sensitivity' | 'hints' | 'performance' | 'resolution' | 'sound' | 'music'
>;

export interface WorldHost {
  /** The page's one renderer, already sized to the window; the world draws with it. */
  renderer: THREE.WebGLRenderer;
  /** Draws one frame through Earth's post chain (`post.ts`). */
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
   * Hands the screen back to the planet menu; call once, after cleaning up.
   * `'system'` (a rocket launch, the bar's *Solar system*) sends the menu out
   * to the whole system; otherwise it returns to the world's globe.
   */
  exit(to?: 'system'): void;
  /** Where to stand; `null` or absent and the world chooses (a `?world=` link without `&site=`). */
  arrival?: WorldArrival | null;
  /**
   * The relay's `/ws` address (`VITE_PEERS_URL`), `''` for none. The world
   * opens its own link with `createPeers(url, folk, { body, radius })`, only
   * when `mode` is `'online'`.
   */
  peersUrl?: string;
  /** Earth's live settings rows; see `WorldSettings`. */
  settings?: WorldSettings;
  /** One of the interface's recorded cues (`audio.ts`'s `Cue`) through Earth's mix. */
  cue?(name: Cue): void;
  /** The traveller's creator (`traveller.ts`), the page's one card. */
  traveller?: { show(options?: { relock?: boolean }): void; readonly open: boolean };
  /** An explosion through Earth's mix (`Audio.boom`), `loudness` 1 beside it. */
  boom?(loudness: number): void;
  /** One footfall through Earth's mix (`Audio.step`); `weight` is 1 for a walk, more for a run. */
  step?(weight: number): void;
  /** Earth's countries, for the passport's Earth pages, which list every country stamped or not. */
  countries?: readonly { iso: string; name: string; continent: string }[];
  /** Off to another world at `lat`, `lon` (`/goto`, `/tp`); the page reloads into it. */
  travel?(world: string, lat: number, lon: number, name: string): void;
  /** Every world's towns and nations, for `/goto`; null before they are made. */
  gazetteer?(): Gazetteer | null;
  /** Earth's soundscape (`Audio.update`), every frame, told what this world is doing. */
  soundscape?(dt: number, scape: Soundscape): void;
  /**
   * Earth's music: `moment` when the location has been asked again (twice a
   * second, `Music.observe`), null on the frames between (`Music.update` only).
   */
  music?(moment: MusicMoment | null): void;
}

/** `src/worlds/index.ts`'s shape, as Earth imports it. */
export interface WorldsModule {
  enterWorld(bodyId: string, host: WorldHost): void | Promise<void>;
}
