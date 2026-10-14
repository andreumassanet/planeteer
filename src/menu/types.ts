/**
 * The menu's public types: the body a walkable planet slots in as, what the menu
 * is handed (`MenuDeps`), what it hands back (`Menu`) and where the player wakes up.
 */
import * as THREE from 'three';

/** One ring of one region: `[lon, lat]` pairs, implicitly closed, and the land's height above sea level. */
export interface MenuRing {
  points: number[][];
  height: number;
}

/** A country, or whatever a body calls the thing you pick first. */
export interface MenuRegion {
  /** The join key. On Earth, `ADM0_A3` — the same key the flags and places use. */
  key: string;
  name: string;
  /** One line under the name. On Earth, the continent. */
  note: string;
  /** The bake's own label point, and the fallback spawn when it has no sites. */
  lat: number;
  lon: number;
  rings: MenuRing[];
  /** The region's colour, `0xRRGGBB`, for a body whose globe the menu paints by region. Earth leaves it out. */
  color?: number;
  /**
   * The region as `[lon, lat]` rings that never cross the antimeridian, for
   * painting it flat; `rings` when left out.
   */
  flat?: readonly (readonly number[][])[];
}

/** A city, or whatever a body calls the thing you pick second. */
export interface MenuSite {
  name: string;
  /** Which region it belongs to; joins against `MenuRegion.key`. */
  key: string;
  lat: number;
  lon: number;
  /** How much this site outranks its neighbours. On Earth, population. */
  weight: number;
  capital?: boolean;
  /** The site's own id on its body (`Settlement.id`), carried to the world so it can land on that settlement. Earth's towns leave it out. */
  id?: string;
}

/**
 * A world you can walk on: the seam a second walkable world slots into.
 * Nothing here mentions `World`, `Place` or `PLANET_RADIUS`; bodies with a
 * `MenuBody` (matched on `id`) are the ones the planet stage offers to enter.
 */
export interface MenuBody {
  id: string;
  name: string;
  note: string;
  /** Sea-level radius, in world units. */
  radius: number;
  /** Where the body's centre sits in world space. Earth is the origin. */
  centre: THREE.Vector3;
  /** Height of the ground over `radius` at a point on the unit sphere. */
  relief(x: number, y: number, z: number): number;
  regions: readonly MenuRegion[];
  /** 1-based index into `regions`; 0 for open water or nothing at all. */
  regionAt(lat: number, lon: number): number;
  sites: readonly MenuSite[];
  /** Other names the search finds a site by, to an index into `sites` (places a bake folded into a neighbour). */
  aliases?: ReadonlyMap<string, number>;
  /** The local time at a site (`'14:05'`); Earth's `clockAt` when left out. */
  clock?(site: MenuSite, time: Date): string;
  /**
   * Frontiers laid over the globe while this body is up, in the body's own frame
   * (centred on the origin, placed by `onSphere` at `radius`). Added to the scene
   * at `centre`; Earth leaves it out.
   */
  overlay?: THREE.Object3D;
  /** The body as walked: its own ground, drawn in place of the orrery's painted ball. */
  globe?: {
    object: THREE.Object3D;
    update(eye: THREE.Vector3, centre: THREE.Vector3): void;
    dispose(): void;
  };
  /** What a region and a site are called here; Earth's words when left out. */
  words?: MenuWords;
}

/** What a body calls the two things the menu picks. */
export interface MenuWords {
  region: string;
  regions: string;
  site: string;
  sites: string;
}

/** Earth's words, and every body's that names none. */
export const EARTH_WORDS: MenuWords = { region: 'country', regions: 'countries', site: 'town', sites: 'towns' };

/**
 * `src/system/menu-body.ts`'s shape, imported on demand: a walkable body other
 * than Earth as a `MenuBody` (`null` for a body with no geography), and the
 * flag banners its region keys draw as.
 */
export interface MenuBodyModule {
  menuBodyOf(id: string, centre: THREE.Vector3, drawnRadius: number): MenuBody | null;
  menuWorldOf(id: string, centre: THREE.Vector3, drawnRadius: number): Promise<MenuBody | null>;
  installBanners(): void;
}

/** Where the player wakes up. */
export interface MenuSpawn {
  body: string;
  region: string;
  name: string;
  lat: number;
  lon: number;
  /** The site's own id (`MenuSite.id`) on a body that has them; see `WorldArrival`. */
  site?: string;
}

export interface MenuDeps {
  /** Every world you can walk on. The orrery draws the rest of the system. */
  bodies: readonly MenuBody[];
  /** The world's own scene. The menu adds the orrery and a ribbon, and takes them away. */
  scene: THREE.Scene;
  /** The world's own renderer; the menu sizes it, since the loop has not started. */
  renderer: THREE.WebGLRenderer;
  /** `outline.render`, not `renderer.render`: a frame is two passes. */
  draw(scene: THREE.Scene, camera: THREE.Camera): void;
  /** Where `Continue` goes when nothing is remembered. `main.ts`'s `START`. */
  fallback: { lat: number; lon: number; name: string };
  /** The sky's clock. The planets are laid out for it and the town card reads it. */
  time(): Date;
  /** The sun `sun.ts` lights the land by, for `verify()`'s witness. */
  sunDirection?(): THREE.Vector3;
  /** The renderer's pixel ratio, asked on every resize; defaults to the screen's, up to 2. */
  pixelRatio?(): number;
  /** What the menu sounds like (`menu-sound.ts`); silent when omitted. */
  sound?: MenuSound;
  /**
   * Makes a walkable body's `MenuBody` on demand (first *Explore*). `centre` is the
   * orrery's live vector and `drawnRadius` its size. Resolves `null` for a body
   * with no regions; left out, every body but Earth goes straight to `exploreBody`.
   */
  loadBody?(id: string, centre: THREE.Vector3, drawnRadius: number): Promise<MenuBody | null>;
  /**
   * Go and stand on a body other than Earth: a settlement chosen on its globe,
   * *Continue*, or (without `spawn`) a body with no `MenuBody`. The caller takes
   * the screen; the menu waits suspended until `suspend(false)`.
   */
  exploreBody?(id: string, name: string, spawn?: MenuSpawn): void | Promise<void>;
  /** `Esc` at the system stage and the *Main menu* button: back to the title. No button when omitted. */
  onLeave?(): void;
}

/** What the menu tells its sound: a pointer over something, a choice, a way back, the start. */
export type MenuSoundName = 'hover' | 'select' | 'pick' | 'back' | 'open' | 'start';

export interface MenuSound {
  cue(name: MenuSoundName): void;
  /** A flight begins that goes nearer the ground (`in`) or away from it, lasting `seconds`. */
  dive(direction: 'in' | 'out', seconds: number): void;
  /** The stage on show, on every change; null once the dive into the town has begun. */
  stage(stage: Stage | null): void;
  /** Every frame the menu draws. */
  update(): void;
  /** The menu is gone: whatever still sounds fades out. */
  dispose(): void;
}

/** The cream that covers the cut from the menu's camera to the player's. */
export interface Curtain {
  /** Fade it away. Call once the world under it has had a few frames to stand. */
  lift(): void;
}

export type Stage = 'system' | 'planet' | 'region' | 'site';

export interface Menu {
  /** The overlay. The caller appends it; `dispose` removes it. */
  root: HTMLElement;
  /** The menu's own camera — `rig.camera` does not exist until there is a player. */
  camera: THREE.PerspectiveCamera;
  /** Which stage is up. `main.ts` fades the cloud deck out for `region` and `site`. */
  readonly stage: Stage;
  /** The walkable body the globe stages are about: `'earth'` until another's *Explore* flies down to it. */
  readonly body: string;
  /** Whether the camera is on a programmed flight rather than in a hand's control. */
  readonly flying: boolean;
  /** Draws the sky, sea and weather; assigned once they exist. */
  beforeRender: ((camera: THREE.PerspectiveCamera) => void) | null;
  /** Resolves with where the player wakes up. Safe to await more than once. */
  choose(): Promise<MenuSpawn>;
  /** Dive from wherever the camera is into the chosen town and close the curtain over the end. Resolves once the screen is covered. */
  depart(): Promise<Curtain>;
  /** The handedness checks, both against third parties. Exposed as `atlasMenu.verify`. */
  verify(): Record<string, unknown>;
  /** A screen in front of the menu (the title): while held, the chrome and labels stay down and keys are ignored. */
  hold(on: boolean): void;
  /** Stops drawing and hides the overlay, for a world that takes the screen; `false` hands it back. */
  suspend(on: boolean): void;
  /** Out from whatever globe it is on to the whole system: a world left behind. */
  toSystem(): void;
  /** Makes every other world's globe ahead of time, one after another; resolves once the last is made or has failed. */
  prepare(): Promise<void>;
  dispose(): void;
}
