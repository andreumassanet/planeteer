/**
 * The front door: the solar system, then a planet, then a country, then the
 * town you wake up in. The title screen (`title.ts`) stands in front of it
 * first and holds it (`hold`) until the player has chosen how to play.
 *
 * **It is the real world and not a picture of one.** The menu draws the
 * world's own scene with the world's own `outline.render`: the land, the sea,
 * the weather and the sun at the real hour are already standing when it opens,
 * and `orrery.ts` lays the other planets out around them. So the first screen
 * is the whole solar system, the click on Earth is one camera move down onto
 * the planet you are about to walk, and choosing a town is a dive from wherever
 * the camera is into that town — one scene, one continuous flight, no cut.
 *
 * The four stages, and what each owns:
 *
 * - **system** — the orrery, turned by hand and drifting when left alone; a
 *   dock of every body along the bottom; the search, which can jump straight
 *   to a town from here.
 * - **planet** — one body up close with its card. Earth, which has a
 *   `MenuBody`, goes on to its countries; every other body but the Sun offers
 *   *Explore*, which hands it to `deps.exploreBody` and leaves the screen to
 *   whatever walks it (`suspend`).
 * - **region** — the globe, a country ribbon under the pointer, a click to
 *   choose.
 * - **site** — the chosen country's towns, as pins on the map and as a list,
 *   and a card for the one you picked with a button that starts there.
 *
 * **What players got wrong with the last version is written into this one.**
 * People who tried the menu chose a country, then dragged the globe to look
 * around — and the towns of the country they had dragged to never appeared,
 * because the selection was still the first country and the only way out was
 * an `Esc` nobody knew about. They called it broken, and they were right. So:
 * *dragging chooses*: whatever country is under the middle of the screen when
 * you let go is the one whose towns are shown, a reticle says so while you
 * drag, and clicking any other country goes to it. And the way back is on the
 * screen — a back button that says where it goes, and a trail of crumbs.
 *
 * Three things this file deliberately does not own, as before:
 *
 * - **The screen basis.** Every mark is `Vector3.project(camera)` and every
 *   click `unproject`, so there is no map basis to mirror. `verify()` asks the
 *   gazetteer, a third party, whether east is to the right — and asks the
 *   orrery whether its Sun agrees with `sun.ts`'s.
 * - **The colour of the land.** The chosen country gets a ribbon laid over its
 *   own rings, geometry this file owns and the land mesh never hears of.
 * - **The weather.** `main.ts` fades the deck out for the country and town
 *   stages, reading `stage`; nothing here knows there is a cloud.
 */

import * as THREE from 'three';
import { type Country, type World, toLatLon } from './geo.ts';
import { LAND_HEIGHT, PLANET_RADIUS, onSphere } from './globe.ts';
import { isShown } from './places.ts';
import type { Place } from './places.ts';
import { LabelSpace, thinMarks } from './cartography.ts';
import { reliefAt } from './terrain.ts';
import { PALETTE, OCEAN_COLOR } from './theme.ts';
import { clockAt } from './timezone.ts';
import { createFlagCanvas } from './flags.ts';
import { createOrrery } from './orrery.ts';
import type { OrreryBody } from './orrery.ts';
import { AU_KM, geocentric, heliocentric, moonPosition, periodOf } from './system/index.ts';
import type { Body } from './system/index.ts';
import { ensureStyle, fold, h, hex, icon, installUi, kbd, km, people } from './ui.ts';

const DEG = Math.PI / 180;
const R = PLANET_RADIUS;

/* ------------------------------------------------------------------------- *
 * The body: the seam a walkable planet slots into
 * ------------------------------------------------------------------------- */

/**
 * One ring of one region, in the format the bake already stores: `[lon, lat]`
 * pairs, implicitly closed, and how far the land stands above sea level. The
 * ribbon is built from exactly the array the land mesh is triangulated from.
 */
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
  /**
   * The region's own colour, `0xRRGGBB`, for a body whose globe the menu
   * paints by region (every walkable world but Earth, whose land is the
   * world's own). Earth leaves it out.
   */
  color?: number;
  /**
   * The region as `[lon, lat]` rings that never cross the antimeridian, for
   * painting it flat (`orrery.ts`'s `HeldRegion`): `rings` may be outlines
   * joined round the globe, which a flat map cannot fill. `rings` when left
   * out.
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
  /**
   * The site's own id on its body (`Settlement.id`), which the spawn carries
   * to the world so it can land on that settlement's arrival. Earth's towns
   * are found by their coordinate and leave it out.
   */
  id?: string;
}

/**
 * A world you can walk on.
 *
 * **Deliberately narrow, and it is the seam a second walkable world slots
 * into.** Nothing here mentions `World`, `Place` or `PLANET_RADIUS`. The
 * orrery draws every body in `system/`; the ones that also have a `MenuBody`
 * — matched on `id` — are the ones the planet stage offers to enter.
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
  /**
   * Other names the search should find a site by, as written, to an index into
   * `sites`. The hook for the famous places a bake folded into a neighbour —
   * searching for one finds the town that stands for it rather than nothing.
   * Optional; on Earth it is `places.bin`'s own list, through `Places.aliases`.
   */
  aliases?: ReadonlyMap<string, number>;
  /**
   * The local time at a site, as the town card shows it (`'14:05'`). Left out,
   * Earth's own `clockAt` answers, which is the zone of the nearest town.
   */
  clock?(site: MenuSite, time: Date): string;
  /**
   * What the menu lays over the body's globe while it is the one up — the
   * frontiers between its regions — **in the body's own frame**: centred on
   * the origin, a latitude and longitude placed by `onSphere` at `radius`.
   * The menu adds it to the scene at `centre`, keeps it there as the system
   * turns, and takes it away again. Earth leaves it out: its frontiers are
   * the world's own (`borders.ts`).
   */
  overlay?: THREE.Object3D;
  /**
   * The body as it is walked: its own ground at the drawn radius, still and
   * upright about its centre, drawn in place of the orrery's painted ball
   * from the moment it is made — in the system as on its globe.
   */
  globe?: {
    object: THREE.Object3D;
    update(eye: THREE.Vector3, centre: THREE.Vector3): void;
    dispose(): void;
  };
  /**
   * What a region and a site are called on this body, singular and plural,
   * for the cards and the search: `country`/`town` on Earth, and Earth's
   * words when left out.
   */
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
 * `src/system/menu-body.ts`'s shape, as `main.ts` imports it on demand: a
 * walkable body other than Earth as a `MenuBody` — `centre` is the orrery's
 * live vector for it and `drawnRadius` its drawn size, which become the
 * `MenuBody`'s own `centre` and `radius` — and the banners its regions'
 * keys draw as flags (`registerFlagPainter`), installed before any is drawn.
 * `menuBodyOf` answers `null` for a body with no geography.
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

/**
 * Earth, as a `MenuBody`: the one adapter that exists, and the only place in
 * this file that knows what a `World` or a `Place` is. `world.rings` rather
 * than `country.rings` because the rings carry their shelf height and the lakes
 * carry a flag — a lake belongs to nobody and gets no ribbon.
 *
 * `aliases` maps a name as written to an index into `places` — the gazetteer's
 * own numbering, which is what a list of aliases would be written against —
 * and it is translated here to the body's own site numbering. An alias whose
 * place is not built is dropped: it has to name the town that stands, not the
 * one the bake folded into it.
 */
export function earthBody(world: World, places: readonly Place[], aliases?: ReadonlyMap<string, number>): MenuBody {
  const regions: MenuRegion[] = world.countries.map((country: Country) => ({
    key: country.iso,
    name: country.name,
    note: country.continent,
    lat: country.lat,
    lon: country.lon,
    rings: [],
  }));
  for (const ring of world.rings) {
    if (ring.water || ring.country === 0) continue;
    regions[ring.country - 1]?.rings.push({ points: ring.points, height: ring.height });
  }
  // Only the towns that are built: a pin on a hidden place would wake you in
  // an empty field with a chip that says "near" somewhere else. See `isShown`.
  const built: Place[] = [];
  const siteOf = new Map<number, number>();
  places.forEach((place, i) => {
    if (!isShown(place)) return;
    siteOf.set(i, built.length);
    built.push(place);
  });
  const known = new Map<string, number>();
  for (const [alias, placeIndex] of aliases ?? []) {
    const site = siteOf.get(placeIndex);
    if (site !== undefined) known.set(alias, site);
  }
  return {
    id: 'earth',
    name: 'Earth',
    note: `${regions.length} countries · ${built.length.toLocaleString('en')} towns`,
    radius: PLANET_RADIUS,
    centre: new THREE.Vector3(0, 0, 0),
    relief: reliefAt,
    regions,
    regionAt: (lat, lon) => world.countryAt(lat, lon),
    sites: built.map((place) => ({
      name: place.name,
      key: place.iso,
      lat: place.lat,
      lon: place.lon,
      weight: place.pop,
      capital: place.capital,
    })),
    aliases: known,
  };
}

/* ------------------------------------------------------------------------- *
 * What the menu is handed, and what it hands back
 * ------------------------------------------------------------------------- */

export interface MenuDeps {
  /** Every world you can walk on. The orrery draws the rest of the system. */
  bodies: readonly MenuBody[];
  /** The world's own scene. The menu adds the orrery and a ribbon, and takes them away. */
  scene: THREE.Scene;
  /** The world's own renderer; the menu sizes it, since the loop has not started. */
  renderer: THREE.WebGLRenderer;
  /** **`outline.render`, not `renderer.render`**: a frame is two passes. */
  draw(scene: THREE.Scene, camera: THREE.Camera): void;
  /** Where `Continue` goes when nothing is remembered. `main.ts`'s `START`. */
  fallback: { lat: number; lon: number; name: string };
  /**
   * The traveller's card (`traveller.ts`), which the menu has a button for.
   * While it is up the menu leaves the keys alone. Omit it and there is no button.
   */
  traveller?: { show(): void; readonly open: boolean };
  /** The sky's clock. The planets are laid out for it and the town card reads it. */
  time(): Date;
  /** The sun `sun.ts` lights the land by, for `verify()`'s witness. */
  sunDirection?(): THREE.Vector3;
  /**
   * The pixel ratio the renderer should run at, asked on every resize. Leave it
   * out and the menu uses `main.ts`'s own cap, the screen's ratio up to 2; pass
   * it where the player has chosen a resolution, so the menu keeps to it.
   */
  pixelRatio?(): number;
  /**
   * What the menu sounds like (`menu-sound.ts`), told what happens and left
   * to decide how it sounds. Omit it and the menu is silent.
   */
  sound?: MenuSound;
  /**
   * A walkable body's `MenuBody`, made on demand the first time its *Explore*
   * is pressed: `centre` is where the orrery draws it — a live vector, which
   * the menu's own frame keeps current as the system turns — and
   * `drawnRadius` how big. Resolves `null` for a body with no regions, which
   * *Explore* then hands straight to `exploreBody` with no spawn. Left out,
   * every body but Earth goes straight there.
   */
  loadBody?(id: string, centre: THREE.Vector3, drawnRadius: number): Promise<MenuBody | null>;
  /**
   * Go and stand on a body other than Earth: a settlement chosen on its
   * globe, *Continue* to a world last visited, or — with no `spawn` — a body
   * that has no `MenuBody`, which lands wherever the world chooses. The
   * caller takes the screen from here; the menu waits, suspended, until it
   * is handed back (`suspend(false)`).
   */
  exploreBody?(id: string, name: string, spawn?: MenuSpawn): void | Promise<void>;
  /** `Esc` at the system stage: back to the screen in front of the menu (the title). */
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
  /**
   * The walkable body the globe stages are about, by id: `'earth'` until
   * another's *Explore* flies down to it. `main.ts` keeps Earth's sky dome
   * off while it is another, since the camera is then over that body.
   */
  readonly body: string;
  /** Whether the camera is on a programmed flight rather than in a hand's control. */
  readonly flying: boolean;
  /**
   * The sky, the sea and the weather, which this file does not own. Assign it
   * once they exist; the menu draws whatever is in the scene until then.
   */
  beforeRender: ((camera: THREE.PerspectiveCamera) => void) | null;
  /** Resolves with where the player wakes up. Safe to await more than once. */
  choose(): Promise<MenuSpawn>;
  /** How far the world behind the menu has got, 0 to 1, and what it is doing. */
  progress(fraction: number, label: string): void;
  /** The world is built: `Start` can stop waiting. */
  ready(): void;
  /**
   * Dive from wherever the camera is into the chosen town and draw the curtain
   * over the end of it. Resolves once the screen is covered.
   */
  depart(): Promise<Curtain>;
  /** The handedness checks, both of them third parties. On `atlasMenu`. */
  verify(): Record<string, unknown>;
  /**
   * A screen in front of the menu (the title): while held, the chrome and the
   * labels stay down and the keys are left alone; the orrery still turns.
   */
  hold(on: boolean): void;
  /** Stops drawing and hides the overlay, for a world that takes the screen; `false` hands it back. */
  suspend(on: boolean): void;
  /** Out from whatever globe it is on to the whole system: a world left behind. */
  toSystem(): void;
  /**
   * Makes every other world's globe ahead of time, one after another, so
   * choosing one never waits for it: called while the title is up.
   */
  prepare(): void;
  dispose(): void;
}

/* ------------------------------------------------------------------------- *
 * Constants, and where each of them comes from
 * ------------------------------------------------------------------------- */

/** The rig's own lens, so the menu and the game frame the planet identically. */
const FOV = 55;

/**
 * How much of the vertical frame the globe fills at the region stage: the
 * plane's ceiling, where the globe subtends 47.8 degrees of a 55 degree lens.
 * The distance falls out of it, 2.47 radii.
 */
const GLOBE_FILL = 0.87;

/** The same for a country, looser because a country is not a disc. */
const REGION_FILL = 0.8;

/** A region's bounding cap is clamped here; see `frameRegion`. */
const MAX_CAP = 42 * DEG;

/** Nobody is picking a city from lower than this, and the fog would eat it. */
const MIN_ALTITUDE = 420;

/** Latitude is clamped here so the camera's up vector never degenerates. */
const MAX_LAT = 88;

/** Time constant of the drag's chase. A tenth of a second reads as direct. */
const DRAG_LAG = 0.1;

/**
 * How far one wheel event zooms: by `exp(pixels * WHEEL_ZOOM)`.
 *
 * **In proportion to the delta, not a fixed step an event.** A mouse sends one
 * large event a notch and a trackpad sends dozens of small ones a flick, so the
 * old 12% an event — read off the delta's sign alone — zoomed a trackpad about
 * ten times on one flick. Priced so a notch that reports 100 pixels, Chrome's
 * on Windows, is still the 12% it was.
 */
const WHEEL_ZOOM = Math.log(1.12) / 100;
/** A `deltaMode` of lines, in pixels: the usual reading of one. Pages are a screen. */
const WHEEL_LINE = 40;
/** And no single event may move more than this, whatever the device claims. */
const WHEEL_MAX = 400;

/** Ink and gold, in pixels of a 1080-tall frame. The gold rides inside the ink. */
const RIBBON_INK = 5.4;
const RIBBON_GOLD = 2.6;

/** The ribbon floats this far over the shelf, so it never sinks into a coast. */
const RIBBON_LIFT = 12;

/** Pixels between two town pins, and the most that ever stand at once. */
const PIN_SPACING = 56;
const MAX_PINS = 48;

/**
 * The system shot: how high above the ecliptic the camera sits, how far round
 * from Earth, and how far the look target leads the Sun toward the camera.
 *
 * The azimuth is the one with a reason. Straight out along the Sun-Earth line
 * shows Earth's day side and puts it behind the Sun; from beside Earth it is a
 * crescent. 115 degrees round from Earth, seen from the Sun, shows it gibbous
 * — mostly lit — and off to one side of the Sun where it cannot be missed.
 *
 * The distance is not a constant: see `frameSystem`. The lead is what lifts
 * the Sun above the middle of the frame, because the near side of a ring
 * projects far larger than the far side and the dock sits along the bottom.
 */
const SYSTEM_ELEVATION = 30 * DEG;
const SYSTEM_AZIMUTH = 115 * DEG;
const SYSTEM_LEAD = 0.14;

/**
 * Where every body has to land for the system shot to count as framed, in
 * normalised device coordinates: clear of the sides, clear of the brand at
 * the top, and above the dock, which takes the bottom fifth of the screen.
 */
const SYSTEM_SAFE = { x: 0.9, top: 0.78, bottom: -0.56 };

/** How fast the system turns on its own once nobody has touched it for a while. */
const DRIFT = 0.016;
const IDLE_BEFORE_DRIFT = 5;

/** A planet up close: this many of its own radii away, a little above its equator. */
const FOCUS_DISTANCE = 3.3;
const FOCUS_ELEVATION = 14 * DEG;

/** The dive into the chosen town ends this far up, where the curtain closes. */
const DEPART_HEIGHT = 1500;

/** How many towns the country list shows before it says how many more there are. */
const LIST_LENGTH = 80;

/** Where the last spawn is remembered. Versioned so a format change is not a bug. */
const REMEMBERED = 'atlas.menu.spawn.v1';

/**
 * Where the running world remembers where you actually *were*, and it is not
 * this file's key: the game writes `{ lat, lon, name, iso, savedAt }` every few
 * seconds while you play and once more as the page goes. The menu only reads
 * it, and trusts none of it — see `recallPlace`.
 */
const LAST_PLACE = 'atlas.lastPlace.v1';

/** Longer than this and a remembered name is not a place name. */
const MAX_NAME = 60;

/* ------------------------------------------------------------------------- *
 * localStorage, wrapped
 * ------------------------------------------------------------------------- */

/** A remembered start, and when it was remembered: the newer memory wins. */
interface Remembered {
  spawn: MenuSpawn;
  /** `Date.now()` when written; 0 for a record from before there was one. */
  savedAt: number;
}

/** Where the last place was, as the game wrote it, checked field by field. */
interface LastPlace {
  lat: number;
  lon: number;
  /** The place name the game gave it, or empty. */
  name: string;
  /** The country's `ADM0_A3`, or empty. */
  iso: string;
  /**
   * Which body it was on: `'earth'` for a record that names none, which is
   * every record Earth writes. A world other than Earth that writes this key
   * names itself, and its `iso` is then a region's key on that body.
   */
  body: string;
  savedAt: number;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const shortText = (value: unknown): string => (typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '');
/** To (-180, 180], so a longitude written by anyone lands on this planet's range. */
const wrapLon = (lon: number): number => lon - 360 * Math.ceil((lon - 180) / 360);

function remember(spawn: MenuSpawn): void {
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify({ ...spawn, savedAt: Date.now() }));
  } catch {
    /* A private window throws on every write; the menu simply forgets. */
  }
}

function recall(): Remembered | null {
  try {
    const raw = localStorage.getItem(REMEMBERED);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (!finite(record['lat']) || !finite(record['lon']) || Math.abs(record['lat']) > 90) return null;
    return {
      spawn: {
        body: shortText(record['body']) || 'earth',
        region: shortText(record['region']),
        name: shortText(record['name']) || 'somewhere',
        lat: record['lat'],
        lon: wrapLon(record['lon']),
        ...(shortText(record['site']) === '' ? {} : { site: shortText(record['site']) }),
      },
      savedAt: finite(record['savedAt']) ? record['savedAt'] : 0,
    };
  } catch {
    return null;
  }
}

/**
 * The game's own record of where you were, or null.
 *
 * Every field is checked rather than cast, because the key is written by
 * another file on another release and read by this one on this release — a
 * record from a version that wrote something else, or from a hand in the
 * console, must come back as "nothing remembered", never as a spawn at `NaN`.
 */
function recallPlace(): LastPlace | null {
  try {
    const raw = localStorage.getItem(LAST_PLACE);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (!finite(record['lat']) || !finite(record['lon']) || Math.abs(record['lat']) > 90) return null;
    return {
      lat: record['lat'],
      lon: wrapLon(record['lon']),
      name: shortText(record['name']),
      iso: shortText(record['iso']),
      body: shortText(record['body']) || 'earth',
      savedAt: finite(record['savedAt']) ? record['savedAt'] : 0,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------- *
 * The highlight ribbon
 * ------------------------------------------------------------------------- */

/**
 * A ribbon along every ring of one region, expanded to a **screen-space** width
 * in the vertex shader, so it is the same weight from orbit and from a
 * thousand units up. One geometry per region for the session, in the body's
 * own frame — centred on the origin — and placed at the body's centre by the
 * group it hangs in, which follows a body other than Earth round the system.
 *
 * **The winding is the trap this world has met four times.** With `along` the
 * segment and `up` the outward radius, `across = along x up`, and the index
 * order below is the one for which the quad faces away from the planet. The
 * other order renders under `FrontSide` as nothing at all; `verify()` measures
 * the normal off the built buffer rather than arguing it.
 */
function buildRibbon(body: MenuBody, region: MenuRegion): THREE.BufferGeometry {
  let segments = 0;
  for (const ring of region.rings) segments += ring.points.length;

  const position = new Float32Array(segments * 4 * 3);
  const across = new Float32Array(segments * 4 * 3);
  const side = new Float32Array(segments * 4);
  const index = new Uint32Array(segments * 6);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const along = new THREE.Vector3();
  const up = new THREE.Vector3();
  const wide = new THREE.Vector3();

  const seat = (lon: number, lat: number, height: number, target: THREE.Vector3): THREE.Vector3 => {
    onSphere(lon, lat, target);
    const lift = body.radius + height + body.relief(target.x, target.y, target.z) + RIBBON_LIFT;
    return target.multiplyScalar(lift);
  };

  let vertex = 0;
  let element = 0;
  for (const ring of region.rings) {
    const points = ring.points;
    for (let i = 0; i < points.length; i++) {
      const from = points[i]!;
      // The rings are open, so the closing segment has to be walked too.
      const to = points[(i + 1) % points.length]!;
      seat(from[0]!, from[1]!, ring.height, a);
      seat(to[0]!, to[1]!, ring.height, b);
      along.subVectors(b, a);
      const span = along.length();
      if (span < 1e-6) continue;
      along.divideScalar(span);
      up.copy(a).normalize();
      wide.crossVectors(along, up).normalize();

      for (let corner = 0; corner < 4; corner++) {
        const end = corner === 1 || corner === 2 ? b : a;
        const sign = corner === 0 || corner === 1 ? -1 : 1;
        position[vertex * 3] = end.x;
        position[vertex * 3 + 1] = end.y;
        position[vertex * 3 + 2] = end.z;
        across[vertex * 3] = wide.x;
        across[vertex * 3 + 1] = wide.y;
        across[vertex * 3 + 2] = wide.z;
        side[vertex] = sign;
        vertex++;
      }
      const base = vertex - 4;
      // (0, 2, 1) and (0, 3, 2): the obvious order faces the planet's centre.
      index[element++] = base;
      index[element++] = base + 2;
      index[element++] = base + 1;
      index[element++] = base;
      index[element++] = base + 3;
      index[element++] = base + 2;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position.subarray(0, vertex * 3), 3));
  geometry.setAttribute('aAcross', new THREE.BufferAttribute(across.subarray(0, vertex * 3), 3));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side.subarray(0, vertex), 1));
  geometry.setIndex(new THREE.BufferAttribute(index.subarray(0, element), 1));
  return geometry;
}

/**
 * `MeshBasicMaterial`, so the ribbon is usable at 3 a.m. local; no normal and
 * no ink, so `OutlineEffect` leaves it out of the second pass; `FrontSide`,
 * which the winding above makes safe and which fails loudly if it ever is not.
 */
function ribbonMaterial(color: number, order: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.FrontSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  material.userData.outlineParameters = { visible: false };
  material.userData.order = order;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uWidth'] = { value: 40 };
    material.userData.uniforms = shader.uniforms;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aAcross;\nattribute float aSide;\nuniform float uWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aAcross * aSide * uWidth;');
  };
  return material;
}

/* ------------------------------------------------------------------------- *
 * Words for numbers
 * ------------------------------------------------------------------------- */

/** 3.2M, 410k, 900: a list of towns is not a census. */
function compact(count: number): string {
  if (count >= 1e6) return `${(count / 1e6).toFixed(count >= 1e7 ? 0 : 1)}M`;
  if (count >= 1e3) return `${Math.round(count / 1e3)}k`;
  return String(Math.round(count));
}

const ordinal = (n: number): string => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** A rotation period as a length of day: hours under two days, days past it. */
function dayLength(hours: number): string {
  const abs = Math.abs(hours);
  let text: string;
  if (abs < 48) {
    const whole = Math.floor(abs);
    text = `${whole} h ${Math.round((abs - whole) * 60)} min`;
  } else {
    const days = abs / 24;
    text = `${days.toFixed(days < 100 ? 1 : 0)} days`;
  }
  return hours < 0 ? `${text}, backwards` : text;
}

const yearLength = (days: number): string =>
  days < 700 ? `${Math.round(days)} days` : `${(days / 365.25).toFixed(1)} years`;

/* ------------------------------------------------------------------------- *
 * Where the others are from here, today
 * ------------------------------------------------------------------------- */

/** The speed of light in km/s, exact by the metre's own definition. */
const LIGHT_KM_S = 299792.458;

/**
 * Closer to the Sun than this in our sky, in degrees, and a planet is lost in
 * its glare. A round number rather than a measurement: Mercury is hard to find
 * well outside it, and nothing is found inside it.
 */
const GLARE = 12;

/** Further than this from the Sun, in degrees, and it rises as the Sun sets. */
const OPPOSED = 165;

/** A body as seen from Earth at one instant. */
interface Sighting {
  /** Real kilometres from Earth. */
  km: number;
  /** Degrees between it and the Sun in our sky; 0 for the Sun itself. */
  elongation: number;
  /** East of the Sun, which is the evening sky: it sets after the Sun does. */
  east: boolean;
}

/**
 * Where a body is from Earth right now: `system/orbits.ts`'s `geocentric`, the
 * same Standish elements the orrery's rings are laid out by, differenced in
 * au, so this is a real distance on the real date and not the diagram's. It
 * is the very difference the night sky draws the planet by, so what this card
 * says and where the planet stands in the world's sky are one computation;
 * this used to do the subtraction for itself.
 */
function sighting(body: Body, date: Date): Sighting {
  const earth = heliocentric('earth', date);
  if (body.kind === 'moon') {
    // Geocentric already, of date: the Sun's ecliptic longitude seen from
    // here is Earth's heliocentric one turned round, and the elongation is the
    // angle between the two directions on the ecliptic sphere.
    // Ecliptic longitude and latitude, lambda and beta, in Standish's own
    // right-handed frame — never a world vector, so not `sphere.ts`'s.
    const lunar = moonPosition(date);
    const sunLambda = Math.atan2(-earth.y, -earth.x);
    const lambda = lunar.lon * DEG;
    const beta = lunar.lat * DEG;
    const cos = Math.cos(beta) * Math.cos(lambda - sunLambda);
    return {
      km: lunar.distance,
      elongation: Math.acos(Math.max(-1, Math.min(1, cos))) / DEG,
      east: Math.sin(lambda - sunLambda) > 0,
    };
  }
  if (body.orbit === null) return { km: earth.r * AU_KM, elongation: 0, east: false };
  const seen = geocentric(body.orbit, date);
  return { km: seen.distance * AU_KM, elongation: seen.elongation, east: seen.east };
}

/** 41.2 million km, 225 million km, 4.35 billion km. */
function distanceText(value: number): string {
  // The Moon: a distance anyone can say in one breath.
  if (value < 1e6) return `${(Math.round(value / 100) * 100).toLocaleString('en')} km`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} billion km`;
  return `${(value / 1e6).toFixed(value >= 1e8 ? 0 : 1)} million km`;
}

/** How long its light takes to get here: 8.3 min, 12 min, 4.1 h. */
function lightText(value: number, unit: 'min' | 'light-min' = 'min'): string {
  const minutes = value / LIGHT_KM_S / 60;
  const hours = unit === 'min' ? 'h' : 'light-h';
  if (minutes < 1) return `${(minutes * 60).toFixed(1)} ${unit === 'min' ? 's' : 'light-s'}`;
  if (minutes < 60) return `${minutes.toFixed(minutes < 10 ? 1 : 0)} ${unit}`;
  return `${(minutes / 60).toFixed(1)} ${hours}`;
}

/** Where to look tonight, without naming a constellation. */
function skyText(seen: Sighting): string {
  if (seen.elongation < GLARE) return 'Too close to the Sun to see right now';
  if (seen.elongation > OPPOSED) return 'Opposite the Sun: up all night';
  return `In the ${seen.east ? 'evening' : 'morning'} sky, ${Math.round(seen.elongation)}° from the Sun`;
}

function kindOf(entry: OrreryBody): string {
  const body = entry.body;
  if (body.kind === 'star') return 'Star';
  if (body.kind === 'rocky') return 'Rocky planet';
  if (body.kind === 'moon') return 'Moon';
  // Jupiter and Saturn are hydrogen; Uranus and Neptune are mostly ices. The
  // radius is the cleanest line through that in the data this file has.
  return body.radiusKm > 40000 ? 'Gas giant' : 'Ice giant';
}

/* ------------------------------------------------------------------------- *
 * The stylesheet
 * ------------------------------------------------------------------------- */

const STYLE = `
.atlas-menu {
  position: fixed;
  inset: 0;
  z-index: 9;
  overflow: hidden;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}
.atlas-menu:focus { outline: none; }
.atlas-menu.dragging { cursor: grabbing; }
.atlas-menu.flying, .atlas-menu.chosen { cursor: default; }
.atlas-menu .m-fade {
  transition: opacity 0.35s ease, transform 0.45s var(--ui-ease), visibility 0.35s;
}
.atlas-menu .m-off {
  opacity: 0 !important;
  visibility: hidden;
  pointer-events: none !important;
}
.atlas-menu .m-marks { transition: opacity 0.35s ease, visibility 0.35s; }
.atlas-menu.held .m-marks { opacity: 0; visibility: hidden; }
.atlas-menu.held { cursor: default; }
.atlas-menu.departing .m-chrome { opacity: 0 !important; visibility: hidden; transition: opacity 0.3s ease, visibility 0.3s; }

/* --- the brand, over the system ------------------------------------------ */
.m-brand {
  position: absolute;
  top: 36px;
  left: 42px;
  max-width: 420px;
  pointer-events: none;
}
.m-brand.m-off { transform: translateX(-24px); }
.m-wordmark {
  font-size: 56px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 0.85;
  color: var(--ui-paper);
  -webkit-text-stroke: 6px var(--ui-ink);
  paint-order: stroke fill;
  text-shadow: 0 5px 0 var(--ui-ink);
}
.m-tagline {
  margin-top: 16px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
  color: rgba(255, 242, 232, 0.9);
  text-shadow: 0 2px 0 rgba(4, 6, 14, 0.7);
}

/* --- the dock of bodies -------------------------------------------------- */
.m-dock {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  max-width: calc(100vw - 48px);
  overflow-x: auto;
  /* Room for the lift on hover and for the focus ring, which the scroller
     would otherwise clip on the first and last item. */
  padding: 8px 8px 12px;
  scrollbar-width: none;
}
.m-dock.m-off { transform: translate(-50%, 24px); }
.m-dock-item {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  width: 98px;
  padding: 13px 6px 10px;
  font: inherit;
  cursor: pointer;
  transition: transform 0.12s var(--ui-ease), box-shadow 0.12s ease, background 0.15s ease;
}
.m-dock-item:hover, .m-dock-item.hot { transform: translateY(-4px); box-shadow: 0 9px 0 var(--ui-ink); }
.m-dock-item:active { transform: translateY(3px); box-shadow: 0 2px 0 var(--ui-ink); }
.m-dock-item:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.m-dock-item.walk { background: var(--ui-gold); }
.m-dock-name { font-size: 13.5px; font-weight: 800; letter-spacing: -0.01em; }
/* The same height as the tag Earth carries, so the row reads as one row. */
.m-dock-sub {
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  opacity: 0.58;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.m-disc {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid var(--ui-ink);
  background: radial-gradient(circle at 33% 30%, var(--hi) 0 20%, var(--base) 21% 60%, var(--lo) 61%);
}
.m-disc.ringed::after {
  content: '';
  position: absolute;
  left: -13px;
  right: -13px;
  top: 12px;
  height: 11px;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  transform: rotate(-16deg);
}

/* --- labels on the bodies ------------------------------------------------- */
.m-marks { position: absolute; inset: 0; pointer-events: none; }
.m-label {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  font: 800 12.5px/1 var(--ui-font);
  letter-spacing: -0.005em;
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 2.5px solid var(--ui-ink);
  border-radius: 999px;
  box-shadow: 0 3px 0 var(--ui-ink);
  padding: 5px 10px;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.12s ease, opacity 0.25s ease;
}
.m-label svg { width: 12px; height: 12px; }
.m-label.walk { background: var(--ui-gold); }
.m-label.hot { background: var(--ui-cream); box-shadow: 0 4px 0 var(--ui-ink); }
.m-label.walk.hot { background: var(--ui-apricot); }
.m-marks.quiet .m-label { opacity: 0; pointer-events: none; }
/* The Sun: named, never a destination. */
.m-label.inert, .m-dock-item.inert { cursor: default; pointer-events: none; }
.m-halo {
  position: absolute;
  left: 0;
  top: 0;
  border: 3px solid var(--ui-gold);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--ui-ink), inset 0 0 0 3px var(--ui-ink);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.m-halo.on { opacity: 1; }

/* --- the trail of crumbs and the way back --------------------------------- */
.m-crumbs {
  position: absolute;
  top: 24px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.m-crumbs.m-off { transform: translateY(-12px); }
.m-trail {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 44px;
  padding: 0 8px;
}
.m-trail svg { width: 14px; height: 14px; opacity: 0.35; }
.m-crumb {
  display: flex;
  align-items: center;
  gap: 7px;
  font: 800 13.5px/1 var(--ui-font);
  color: var(--ui-ink);
  background: none;
  border: 0;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
}
.m-crumb:hover { background: rgba(30, 6, 3, 0.08); }
.m-crumb.here { cursor: default; background: none; }
.m-crumb:focus-visible { outline: var(--ui-ring); outline-offset: 1px; }
.m-crumb .ui-flag { border-width: 1.5px; border-radius: 3px; }
.m-back { position: absolute; left: 24px; bottom: 24px; }
.m-back.m-off { transform: translateX(-16px); }

/* --- the stage card on the left ------------------------------------------- */
.m-panel {
  position: absolute;
  top: 86px;
  left: 24px;
  width: 340px;
  max-height: calc(100vh - 86px - 96px);
  display: flex;
  flex-direction: column;
  padding: 18px 16px 12px 18px;
}
.m-panel.m-off { transform: translateX(-24px); }
.m-panel h2 { margin-top: 5px; font-size: 27px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.02; }
.m-panel p { margin-top: 9px; font-size: 13px; font-weight: 600; line-height: 1.42; opacity: 0.66; }
.m-panel .ui-btn { margin-top: 14px; align-self: flex-start; }
.m-country { display: flex; align-items: center; gap: 12px; }
.m-country-sub { margin-top: 3px; font-size: 12.5px; font-weight: 700; opacity: 0.58; }
.m-list {
  flex: 1;
  min-height: 0;
  margin: 12px -8px 0 -6px;
  padding: 6px 6px 0;
  border-top: 2.5px solid var(--ui-rule);
  overflow-y: auto;
  scrollbar-width: thin;
}
.m-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  font: 700 13.5px/1.1 var(--ui-font);
  color: var(--ui-ink);
  text-align: left;
  background: none;
  border: 0;
  border-radius: 9px;
  padding: 7px 8px;
  cursor: pointer;
}
.m-row:hover, .m-row.hot { background: var(--ui-cream); }
.m-row.picked { background: var(--ui-gold); }
/* Inside the ring rather than outside it: the list scrolls, and a ring drawn
   past a row's edge is clipped by it. */
.m-row:focus-visible { outline: var(--ui-ring); outline-offset: -3px; }
.m-row i {
  flex: none;
  width: 9px;
  height: 9px;
  border: 2px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-paper);
}
.m-row.capital i { background: var(--ui-gold); }
.m-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-row small { margin-left: auto; font-size: 11.5px; font-weight: 700; opacity: 0.5; font-variant-numeric: tabular-nums; }
.m-more { padding: 8px 8px 10px; font-size: 11.5px; font-weight: 700; opacity: 0.5; }

/* --- top right: continue and search --------------------------------------- */
.m-top-right {
  position: absolute;
  top: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}
.m-continue .quiet { font-weight: 700; opacity: 0.66; }
.m-search { position: relative; width: 330px; }
.m-search-box {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 48px;
  padding: 0 10px 0 13px;
  cursor: text;
}
.m-search-box svg { flex: none; opacity: 0.7; }
.m-search-box input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: 700 15px var(--ui-font);
  color: var(--ui-ink);
}
.m-search-box input::placeholder { color: rgba(30, 6, 3, 0.45); }
.m-search-box input::-webkit-search-cancel-button { display: none; }
.m-search:focus-within .m-search-box { outline: var(--ui-ring); outline-offset: 3px; }
.m-results {
  position: absolute;
  top: 58px;
  left: 0;
  right: 0;
  padding: 6px;
  display: none;
  animation: ui-pop 0.2s var(--ui-ease) both;
}
.m-results.on { display: block; }
.m-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 9px;
  cursor: pointer;
}
.m-result.on { background: var(--ui-cream); }
.m-result > div { flex: 1; min-width: 0; }
.m-result b { display: block; font-size: 14px; font-weight: 800; line-height: 1.15; }
.m-result small {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  font-weight: 600;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-result .ui-tag { margin-left: auto; }
.m-empty { padding: 10px; font-size: 12.5px; font-weight: 600; opacity: 0.6; }

/* --- a body up close ------------------------------------------------------ */
.m-info {
  position: absolute;
  right: 32px;
  top: 50%;
  width: 356px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  transform: translateY(-46%);
  padding: 22px 22px 18px;
}
.m-info.m-off { transform: translate(28px, -46%); }
.m-info h2 { margin-top: 4px; font-size: 34px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
.m-info p { margin-top: 11px; font-size: 14px; font-weight: 600; line-height: 1.45; opacity: 0.75; }
.m-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px 16px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 2.5px solid var(--ui-rule);
}
.m-fact small { display: block; font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.48; }
.m-fact b { display: block; margin-top: 2px; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
.m-lines { display: grid; gap: 7px; margin-top: 14px; }
.m-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.35;
}
.m-line svg { width: 15px; height: 15px; flex: none; margin-top: 1px; opacity: 0.55; }
.m-line.quiet { font-weight: 600; opacity: 0.66; }
.m-actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }

/* --- the town you picked -------------------------------------------------- */
.m-select {
  position: absolute;
  left: 50%;
  bottom: 24px;
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 440px;
  max-width: calc(100vw - 48px);
  padding: 12px 12px 12px 15px;
  transform: translateX(-50%);
}
.m-select.m-off { transform: translate(-50%, 24px); }
.m-select-name { font-size: 23px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; }
.m-select-sub { margin-top: 3px; font-size: 12.5px; font-weight: 600; opacity: 0.62; white-space: nowrap; }
.m-select .ui-btn { margin-left: auto; }
.m-select-bar {
  margin-top: 7px;
  width: 190px;
  height: 9px;
  border: 2px solid var(--ui-ink);
  border-radius: 999px;
  overflow: hidden;
  background: var(--ui-cream);
}
.m-select-bar i { display: block; height: 100%; background: var(--ui-gold); transition: width 0.4s ease; }

/* --- the world still building --------------------------------------------- */
.m-progress {
  position: absolute;
  right: 24px;
  bottom: 24px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 14px 10px 12px;
}
.m-progress.m-off { transform: translateY(16px); }
.m-spinner {
  width: 20px;
  height: 20px;
  border: 3px solid var(--ui-cream);
  border-top-color: var(--ui-ink);
  border-right-color: var(--ui-gold);
  border-radius: 50%;
  animation: ui-spin 0.9s linear infinite;
}
.m-progress b { display: block; font-size: 12.5px; font-weight: 800; }
.m-progress small { display: block; font-size: 11px; font-weight: 600; opacity: 0.6; }
.m-progress-bar { width: 96px; height: 9px; border: 2px solid var(--ui-ink); border-radius: 999px; overflow: hidden; background: var(--ui-cream); }
.m-progress-bar i { display: block; height: 100%; width: 0; background: var(--ui-gold); transition: width 0.5s ease; }

/* --- hover card, reticle, pins --------------------------------------------- */
.m-tip {
  position: absolute;
  left: 0;
  top: 0;
  display: none;
  align-items: center;
  gap: 10px;
  padding: 8px 13px 8px 9px;
  pointer-events: none;
  max-width: 300px;
}
.m-tip.on { display: flex; }
.m-tip b { display: block; font-size: 14.5px; font-weight: 800; letter-spacing: -0.012em; line-height: 1.15; }
.m-tip small { display: block; margin-top: 1px; font-size: 11.5px; font-weight: 600; opacity: 0.6; }
.m-reticle {
  position: absolute;
  left: 50%;
  top: 50%;
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  transform: translate(-50%, -14px);
  pointer-events: none;
}
.m-reticle.on { display: flex; }
.m-reticle i {
  width: 28px;
  height: 28px;
  border: 3px solid var(--ui-paper);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--ui-ink), inset 0 0 0 3px var(--ui-ink);
}

.m-pins { position: absolute; inset: 0; pointer-events: none; }
.m-pin {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font: 800 12.5px/1 var(--ui-font);
  letter-spacing: -0.01em;
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 2.5px solid var(--ui-ink);
  border-radius: 9px;
  box-shadow: 0 3px 0 var(--ui-ink);
  padding: 5px 10px 5px 7px;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  /* Colour and lift only: a transform transition makes every pin lag the
     globe while you drag it, which reads as the towns sliding on the ground. */
  transition: box-shadow 0.08s, background 0.08s;
}
.m-pin i {
  width: 9px;
  height: 9px;
  border: 2px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-paper);
}
.m-pin.capital i { background: var(--ui-gold); }
.m-pin:hover, .m-pin.hot { background: var(--ui-cream); box-shadow: 0 4px 0 var(--ui-ink); z-index: 1; }
.m-pin.picked { background: var(--ui-gold); z-index: 2; }
.m-pin:focus-visible { outline: var(--ui-ring); outline-offset: 3px; z-index: 4; }
/* A pin whose name lost the collision is a dot on a map, not a card with the
   writing rubbed off: it keeps the ring and loses the card, and the border
   stays as a transparent 2.5px so the dot does not move off its town. */
.m-pin.away { padding: 5px 7px; background: transparent; border-color: transparent; box-shadow: none; }
.m-pin.away span { display: none; }
.m-pin.away:hover, .m-pin.away.hot, .m-pin.away.picked {
  background: var(--ui-cream);
  border-color: var(--ui-ink);
  box-shadow: 0 3px 0 var(--ui-ink);
  padding: 5px 10px 5px 7px;
  z-index: 3;
}
.m-pin.away.picked { background: var(--ui-gold); }
.m-pin.away:hover span, .m-pin.away.hot span, .m-pin.away.picked span { display: inline; }

/* --- the curtain over the cut into the game -------------------------------- */
.atlas-curtain {
  position: fixed;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  background: radial-gradient(circle at 50% 42%, ${hex(PALETTE.white)} 0 35%, ${hex(PALETTE.cream)} 100%);
  opacity: 0;
  transition: opacity 0.38s ease;
}
.atlas-curtain.on { opacity: 1; }
.atlas-curtain.lifting { transition: opacity 0.9s ease; }

@media (max-width: 900px) {
  .m-panel { width: 290px; }
  .m-search { width: 260px; }
  .m-wordmark { font-size: 44px; }
  .m-info { width: 320px; }
}

/* --- the cut that stands in for a flight --------------------------------- */
/* With less motion asked for, a flight is a cut, and this is what the cut is
   made under: space, lifted off the new shot in a quarter of a second. */
.m-dip {
  position: absolute;
  inset: 0;
  background: var(--ui-space);
  opacity: 0;
  pointer-events: none;
}
.m-dip.on { opacity: 1; }
.m-dip.lift { transition: opacity 0.28s ease; }

/* The cards fade and do not slide; the pop of the results is a fade too. */
@media (prefers-reduced-motion: reduce) {
  .atlas-menu .m-fade { transition: opacity 0.2s ease, visibility 0.2s; }
  .m-brand.m-off, .m-crumbs.m-off, .m-back.m-off, .m-panel.m-off, .m-progress.m-off { transform: none; }
  .m-dock.m-off, .m-select.m-off { transform: translateX(-50%); }
  .m-info.m-off { transform: translateY(-46%); }
  .m-dock-item, .m-dock-item:hover, .m-dock-item.hot, .m-dock-item:active { transition: none; transform: none; }
  .m-results { animation-name: ui-fade; }
}
`;

/* ------------------------------------------------------------------------- *
 * The menu
 * ------------------------------------------------------------------------- */

interface Pose {
  target: THREE.Vector3;
  eye: THREE.Vector3;
  up: THREE.Vector3;
}

interface Flight {
  from: Pose;
  to: Pose;
  began: number;
  duration: number;
  done(): void;
}

interface Orbit {
  azimuth: number;
  elevation: number;
  distance: number;
}

const makePose = (): Pose => ({ target: new THREE.Vector3(), eye: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) });
const copyPose = (from: Pose, to: Pose): Pose => {
  to.target.copy(from.target);
  to.eye.copy(from.eye);
  to.up.copy(from.up);
  return to;
};
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Either Enter: the keypad's has its own `code`. */
const isEnter = (event: KeyboardEvent): boolean => event.code === 'Enter' || event.code === 'NumpadEnter';

export function createMenu(deps: MenuDeps): Menu {
  const { bodies, scene, renderer, draw, fallback, time } = deps;
  if (bodies.length === 0) throw new Error('createMenu: no bodies to spawn on');
  installUi();
  ensureStyle('atlas-menu', STYLE);

  /** The walkable world the globe stages are about: Earth, until another's *Explore*. */
  const home = bodies[0]!;
  let body = home;
  const walkable = new Map(bodies.map((candidate) => [candidate.id, candidate]));
  /** The bodies `deps.loadBody` has made, kept for the session. */
  const loaded = new Map<string, MenuBody>();
  /** What the current body calls a region and a site. */
  let words = body.words ?? EARTH_WORDS;
  const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

  /* --- the camera and the orrery ------------------------------------------ */

  // Its own camera, not `rig.camera`: the rig does not exist until `main.ts`
  // has a player to build it around. The far plane is set every frame.
  const camera = new THREE.PerspectiveCamera(FOV, 1, 5, R * 300);
  const orrery = createOrrery();
  scene.add(orrery.group);

  const orbitDistance = (radius: number): number => radius / Math.sin(GLOBE_FILL * FOV * DEG * 0.5);
  const pixelsPerUnit = (distance: number): number =>
    renderer.domElement.clientHeight / 2 / (distance * Math.tan(FOV * DEG * 0.5));

  /* --- the towns, grouped once ------------------------------------------- */

  /** A body's regions by key and its sites by region, biggest first: made once a body. */
  interface Catalogue {
    regionIndexOf: Map<string, number>;
    sitesOf: Map<string, MenuSite[]>;
  }
  const catalogues = new Map<string, Catalogue>();
  function catalogueOf(of: MenuBody): Catalogue {
    let catalogue = catalogues.get(of.id);
    if (catalogue !== undefined) return catalogue;
    const regionIndex = new Map<string, number>();
    of.regions.forEach((one, i) => regionIndex.set(one.key, i + 1));
    const bySite = new Map<string, MenuSite[]>();
    for (const site of of.sites) {
      let list = bySite.get(site.key);
      if (list === undefined) bySite.set(site.key, (list = []));
      list.push(site);
    }
    for (const list of bySite.values()) list.sort((a, b) => b.weight - a.weight);
    catalogue = { regionIndexOf: regionIndex, sitesOf: bySite };
    catalogues.set(of.id, catalogue);
    return catalogue;
  }
  let { regionIndexOf, sitesOf } = catalogueOf(body);

  /* --- the DOM ----------------------------------------------------------- */

  // Focusable by script only: when a control the keyboard was on goes away
  // with its stage, the focus comes back here rather than to nowhere, so `Tab`
  // carries on from the menu and the shortcuts below still hear their keys.
  const root = h('div', { class: 'atlas-menu', tabindex: -1 });

  const halo = h('div', { class: 'm-halo' });
  const pinLayer = h('div', { class: 'm-pins' });
  const marks = h('div', { class: 'm-marks' }, halo, pinLayer);
  const dipLayer = h('div', { class: 'm-dip' });

  /**
   * Whether the player has asked the system for less motion. Read live, so
   * turning it on with the menu open takes effect on the next move.
   *
   * **What it changes is the flights.** System to planet to country to town is
   * a camera that zooms a hundredfold and swings round a globe, which is the
   * motion that setting exists to stop; with it on, every flight is a cut under
   * a quick fade from space (`dip`), the dive into the town is the curtain
   * closing where the camera already is, the system stops drifting on its own,
   * and a town chosen from the list is centred at once rather than panned to.
   * Dragging the globe is untouched: the hand is doing that.
   */
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  /** Cover the next frame in space and lift it: a flight's cut, made gently. */
  function dip(): void {
    dipLayer.classList.remove('lift');
    dipLayer.classList.add('on');
    // The opaque frame has to be committed before the fade starts from it.
    void dipLayer.offsetWidth;
    dipLayer.classList.add('lift');
    dipLayer.classList.remove('on');
  }

  const brand = h(
    'div',
    { class: 'm-brand m-fade m-chrome' },
    h('div', { class: 'm-wordmark', text: 'atlas' }),
    h('div', { class: 'm-tagline', text: 'Pick a world to explore.' }),
  );

  const backButton = h('button', { class: 'ui-btn icon', title: 'Back (Esc)', 'aria-label': 'Back' }, icon('back'));
  const trail = h('nav', { class: 'm-trail ui-card', 'aria-label': 'Where you are' });
  const crumbs = h('div', { class: 'm-crumbs m-fade m-chrome' }, backButton, trail);

  const panel = h('div', { class: 'm-panel ui-card m-fade m-chrome' });

  const continueLabel = h('span');
  const continueButton = h('button', { class: 'ui-btn primary m-continue m-fade' }, icon('play', 16), continueLabel);
  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Search a country or a town',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'Search a country or a town',
  });
  const results = h('div', { class: 'm-results ui-card', role: 'listbox' });
  /** The search says what it searches: this body's regions and sites, in its own words. */
  function refreshWords(): void {
    words = body.words ?? EARTH_WORDS;
    const what = `Search a ${words.region} or a ${words.site}${body === home ? '' : ` on ${body.name.replace(/^The /, 'the ')}`}`;
    searchInput.placeholder = what;
    searchInput.setAttribute('aria-label', what);
  }
  const search = h(
    'div',
    { class: 'm-search m-fade' },
    h('label', { class: 'm-search-box ui-card' }, icon('search', 19), searchInput, kbd('/')),
    results,
  );
  const travellerButton =
    deps.traveller === undefined
      ? null
      : h('button', { class: 'ui-btn m-traveller m-fade', title: 'How you look to everyone else' }, icon('walk', 16), 'Your traveller');
  travellerButton?.addEventListener('click', () => deps.traveller?.show());
  const topRight = h('div', { class: 'm-top-right m-chrome' }, continueButton, travellerButton, search);

  const dock = h('div', { class: 'm-dock m-fade m-chrome' });
  const info = h('div', { class: 'm-info ui-card m-fade m-chrome' });
  const backLabel = h('span');
  const back = h('button', { class: 'ui-btn m-back m-fade m-chrome' }, icon('back', 18), backLabel, kbd('Esc'));
  const select = h('div', { class: 'm-select ui-card m-fade' });

  const progressLabel = h('b', { text: 'Building the world' });
  const progressSub = h('small', { text: 'starting up' });
  const progressFill = h('i');
  const progressPill = h(
    'div',
    { class: 'm-progress ui-card m-fade' },
    h('span', { class: 'm-spinner' }),
    h('div', {}, progressLabel, progressSub),
    h('div', { class: 'm-progress-bar' }, progressFill),
  );

  const tipFlag = h('span');
  const tipName = h('b');
  const tipSub = h('small');
  const tip = h('div', { class: 'm-tip ui-card' }, tipFlag, h('div', {}, tipName, tipSub));

  const reticleLabel = h('span', { class: 'ui-tag gold' });
  const reticle = h('div', { class: 'm-reticle' }, h('i'), reticleLabel);

  root.append(marks, dipLayer, reticle, brand, crumbs, panel, dock, info, back, select, topRight, progressPill, tip);

  const flag = (key: string, w: number, height: number): HTMLCanvasElement => {
    const canvas = createFlagCanvas(key, w, height);
    canvas.className = 'ui-flag';
    return canvas;
  };
  const regionName = (key: string): string => body.regions[(regionIndexOf.get(key) ?? 0) - 1]?.name ?? key;

  /* --- the state ---------------------------------------------------------- */

  let stage: Stage = 'system';
  let flight: Flight | null = null;
  /** A screen in front (`hold`), and a world that has taken the screen (`suspend`). */
  let held = false;
  let suspended = false;
  /** The chosen country, at the site stage. */
  let region: MenuRegion | null = null;
  let regionIndex = 0;
  /** The country under the pointer at the region stage. */
  let hoverIndex = 0;
  /** The body up close, at the planet stage. */
  let focusId = '';
  /** The body under the pointer or the dock item under it. */
  let hoverBody: string | null = null;
  let picked: MenuSite | null = null;
  let chosen: MenuSpawn | null = null;
  let built = false;
  let progressFraction = 0;
  let lastTouched = performance.now();

  /**
   * Where Continue goes: the newer of the two memories.
   *
   * The game's record of where you were beats the town the menu last started
   * you in — you walked, sailed or flew somewhere from there, and Continue
   * means *there* — unless the menu's is the newer, which is a town picked and
   * never played. Whichever it is, it becomes a spawn like any other: a
   * latitude and a longitude `main.ts` stands the player on, which has them
   * swimming if it is sea.
   */
  const last = ((): MenuSpawn | null => {
    const started = recall();
    const place = recallPlace();
    if (place === null || (started !== null && started.savedAt > place.savedAt)) return started?.spawn ?? null;
    // Another world's own record: where it was, with no settlement to land on,
    // which is *Continue where you left off* there.
    if (place.body !== home.id) return { body: place.body, region: '', name: place.name, lat: place.lat, lon: place.lon };
    const index = regionIndexOf.get(place.iso) ?? body.regionAt(place.lat, place.lon);
    return {
      body: body.id,
      region: body.regions[index - 1]?.name ?? '',
      name: place.name,
      lat: place.lat,
      lon: place.lon,
    };
  })();

  const sys: Orbit = { azimuth: 0, elevation: SYSTEM_ELEVATION, distance: orrery.extent * 1.5 };
  const sysWant: Orbit = { ...sys };
  const focus: Orbit = { azimuth: 0, elevation: FOCUS_ELEVATION, distance: R };
  const focusWant: Orbit = { ...focus };
  /** The globe: where the camera is and where it is going, degrees and units. */
  const view = { lat: 20, lon: 6, dist: orbitDistance(R) };
  const want = { ...view };

  const pose = makePose();
  const scratch = new THREE.Vector3();
  const scratchB = new THREE.Vector3();
  const scratchC = new THREE.Vector3();

  /* --- poses -------------------------------------------------------------- */

  const bodyById = (id: string): OrreryBody =>
    orrery.bodies.find((entry) => entry.body.id === id) ?? orrery.earth;

  /** A direction from an orbit's centre, in the ecliptic of date. */
  function orbitDirection(orbit: Orbit, out: THREE.Vector3): THREE.Vector3 {
    const { x, y, z } = orrery.axes;
    const c = Math.cos(orbit.elevation);
    return out
      .set(0, 0, 0)
      .addScaledVector(x, c * Math.cos(orbit.azimuth))
      .addScaledVector(y, c * Math.sin(orbit.azimuth))
      .addScaledVector(z, Math.sin(orbit.elevation));
  }

  /** The angle of a vector within the ecliptic plane, from the equinox. */
  const inPlane = (v: THREE.Vector3): number => Math.atan2(v.dot(orrery.axes.y), v.dot(orrery.axes.x));

  function systemPose(orbit: Orbit, out: Pose): Pose {
    const toward = orbitDirection(orbit, scratch);
    // The lead: the in-plane part of the way to the camera, so the target sits
    // between the Sun and the near side of the system.
    const lead = scratchC.copy(toward).addScaledVector(orrery.north, -toward.dot(orrery.north));
    if (lead.lengthSq() > 1e-9) lead.normalize().multiplyScalar(orrery.extent * SYSTEM_LEAD);
    out.target.copy(orrery.sun.position).add(lead);
    out.eye.copy(out.target).addScaledVector(toward, orbit.distance);
    out.up.copy(orrery.north);
    return out;
  }

  /**
   * How far back the system shot has to sit for every body to be on it.
   *
   * Searched rather than derived, because the answer depends on where the
   * planets actually are today: a ring's near side projects several times
   * larger than its far side under a 55 degree lens, so a fixed multiple of
   * the system's reach either cut off whichever giant happened to be nearest
   * the camera — Uranus, the day this was written — or framed so loosely that
   * Earth was a dozen pixels. This is the nearest distance at which each
   * body's centre lands inside `SYSTEM_SAFE`. Bisection over a camera the
   * screen never sees, once, when the shot is set up.
   */
  function frameSystem(orbit: Orbit): number {
    const probe: Orbit = { ...orbit };
    const test = makePose();
    const lens = new THREE.PerspectiveCamera(FOV, camera.aspect, 1, R * 1000);
    let near = orrery.extent * 0.5;
    let far = orrery.extent * 3.5;
    for (let step = 0; step < 20; step++) {
      probe.distance = (near + far) / 2;
      systemPose(probe, test);
      lens.position.copy(test.eye);
      lens.up.copy(test.up);
      lens.lookAt(test.target);
      lens.updateMatrixWorld();
      let fits = true;
      for (const entry of orrery.bodies) {
        const at = scratchB.copy(entry.position).project(lens);
        if (at.z > 1 || Math.abs(at.x) > SYSTEM_SAFE.x || at.y > SYSTEM_SAFE.top || at.y < SYSTEM_SAFE.bottom) {
          fits = false;
          break;
        }
      }
      if (fits) far = probe.distance;
      else near = probe.distance;
    }
    return far;
  }

  function focusPose(orbit: Orbit, out: Pose): Pose {
    out.target.copy(bodyById(focusId).position);
    out.eye.copy(out.target).addScaledVector(orbitDirection(orbit, scratch), orbit.distance);
    out.up.copy(orrery.north);
    return out;
  }

  function globePose(lat: number, lon: number, dist: number, out: Pose): Pose {
    out.target.copy(body.centre);
    onSphere(lon, lat, out.eye).multiplyScalar(dist).add(body.centre);
    out.up.set(0, 1, 0);
    return out;
  }

  function applyPose(p: Pose): void {
    camera.position.copy(p.eye);
    camera.up.copy(p.up);
    camera.lookAt(p.target);
    camera.updateMatrixWorld();
  }

  /** Unit-vector slerp, with the antipodal case turned about any perpendicular. */
  function slerp(a: THREE.Vector3, b: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
    const angle = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    if (angle < 1e-4) return out.copy(a).lerp(b, k).normalize();
    if (angle > Math.PI - 1e-3) {
      const axis = Math.abs(a.y) < 0.9 ? scratchC.set(0, 1, 0) : scratchC.set(1, 0, 0);
      axis.cross(a).normalize();
      return out.copy(a).applyAxisAngle(axis, angle * k);
    }
    const s = Math.sin(angle);
    return out.copy(a).multiplyScalar(Math.sin((1 - k) * angle) / s).addScaledVector(b, Math.sin(k * angle) / s);
  }

  const fromDir = new THREE.Vector3();
  const toDir = new THREE.Vector3();
  const dir = new THREE.Vector3();

  /**
   * A flight between two poses, and the shape of it is what makes a dive from
   * the whole system into one town read as one move.
   *
   * The distance to the target is interpolated in its **logarithm**, so every
   * second of the flight covers the same *ratio* of zoom — 50 radii to 5 takes
   * as long as 5 to half a radius, which is how a zoom looks constant. The look
   * target runs ahead of the rest on a harder ease, so the thing you are flying
   * to is in the middle of the frame long before you reach it rather than
   * sliding in from the edge at the end. The direction is a slerp, the honest
   * path between two points on a sphere.
   */
  function blend(a: Pose, b: Pose, k: number, kt: number, out: Pose): void {
    out.target.lerpVectors(a.target, b.target, kt);
    fromDir.subVectors(a.eye, a.target);
    const la = Math.max(1, fromDir.length());
    fromDir.divideScalar(la);
    toDir.subVectors(b.eye, b.target);
    const lb = Math.max(1, toDir.length());
    toDir.divideScalar(lb);
    slerp(fromDir, toDir, k, dir);
    const length = Math.exp(Math.log(la) + (Math.log(lb) - Math.log(la)) * k);
    out.eye.copy(out.target).addScaledVector(dir, length);
    out.up.lerpVectors(a.up, b.up, k).normalize();
  }

  function flyTo(to: Pose, done: () => void, seconds?: number): void {
    const from = copyPose(pose, makePose());
    const zoom = Math.abs(Math.log(to.eye.distanceTo(to.target) / Math.max(1, from.eye.distanceTo(from.target))));
    const travel = from.target.distanceTo(to.target) / R;
    let duration = seconds ?? Math.min(3.2, Math.max(1.05, 1 + 0.28 * zoom + 0.012 * travel));
    if (calm.matches) {
      // A flight of no length lands on the next frame, under the dip.
      duration = 0;
      dip();
    }
    flight = { from, to: copyPose(to, makePose()), began: performance.now(), duration: duration * 1000, done };
    // A flight that changes the height by more than about a third is a dive;
    // a pan across a continent at one height is not.
    const climb = Math.log(Math.max(1, to.eye.distanceTo(to.target)) / Math.max(1, from.eye.distanceTo(from.target)));
    if (duration > 0 && Math.abs(climb) > 0.3) deps.sound?.dive(climb < 0 ? 'in' : 'out', duration);
    refreshChrome();
  }

  /* --- the ribbon --------------------------------------------------------- */

  const ribbonGroup = new THREE.Group();
  ribbonGroup.name = 'menu-highlight';
  const inkRibbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial(PALETTE.ink, 0));
  const goldRibbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial(PALETTE.gold, 1));
  inkRibbon.renderOrder = 901;
  goldRibbon.renderOrder = 902;
  inkRibbon.frustumCulled = false;
  goldRibbon.frustumCulled = false;
  ribbonGroup.add(inkRibbon, goldRibbon);
  ribbonGroup.visible = false;
  scene.add(ribbonGroup);

  /**
   * The body's own overlay (`MenuBody.overlay`), hung at its centre while it
   * is the one up. Earth has none, and so nothing hangs here over Earth.
   */
  const overlayGroup = new THREE.Group();
  overlayGroup.name = 'menu-overlay';
  scene.add(overlayGroup);

  const ribbons = new Map<string, THREE.BufferGeometry>();
  let shown: MenuRegion | null = null;

  function showRibbon(next: MenuRegion | null): void {
    if (next === shown) return;
    shown = next;
    ribbonGroup.visible = next !== null;
    if (next === null) return;
    let geometry = ribbons.get(next.key);
    if (geometry === undefined) {
      geometry = buildRibbon(body, next);
      ribbons.set(next.key, geometry);
    }
    inkRibbon.geometry = geometry;
    goldRibbon.geometry = geometry;
  }

  function ribbonWidth(): void {
    // The ribbons and the overlay are in the body's frame, and a body other
    // than Earth moves as the system turns under the sky's clock.
    ribbonGroup.position.copy(body.centre);
    overlayGroup.position.copy(body.centre);
    overlayGroup.visible = stage === 'region' || stage === 'site';
    // The same weight on the screen at every altitude: priced against the
    // distance to the ground under the camera.
    const scale = 1 / Math.max(1e-6, pixelsPerUnit(Math.max(1, camera.position.distanceTo(body.centre) - body.radius)));
    const frame = renderer.domElement.clientHeight / 1080;
    for (const mesh of [inkRibbon, goldRibbon]) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const uniforms = material.userData.uniforms as { uWidth?: { value: number } } | undefined;
      if (uniforms?.uWidth === undefined) continue;
      const pixels = material.userData.order === 0 ? RIBBON_INK : RIBBON_GOLD;
      uniforms.uWidth.value = pixels * frame * scale * 0.5;
    }
  }

  /* --- picking ------------------------------------------------------------ */

  const ray = new THREE.Ray();
  const surface = new THREE.Sphere(new THREE.Vector3(), R + LAND_HEIGHT);

  /**
   * Where a screen point lands on the walkable body, or null for the sky: one
   * ray-sphere intersection and then `regionAt`, which on Earth is `geo.ts`'s
   * exact point-in-polygon. The country this returns is the country the
   * player's feet will report standing there.
   */
  function pointAt(clientX: number, clientY: number): { lat: number; lon: number } | null {
    const box = renderer.domElement.getBoundingClientRect();
    scratch.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1, 0.5);
    scratch.unproject(camera);
    ray.origin.copy(camera.position);
    ray.direction.copy(scratch).sub(camera.position).normalize();
    surface.center.copy(body.centre);
    surface.radius = body.radius + LAND_HEIGHT;
    const hit = ray.intersectSphere(surface, scratchB);
    if (hit === null) return null;
    return toLatLon(scratchB.clone().sub(body.centre));
  }

  const regionUnder = (clientX: number, clientY: number): number => {
    const at = pointAt(clientX, clientY);
    return at === null ? 0 : body.regionAt(at.lat, at.lon);
  };

  /** Each body's disc on the screen this frame, for the labels and the pointer. */
  interface Disc {
    entry: OrreryBody;
    x: number;
    y: number;
    r: number;
    depth: number;
    visible: boolean;
  }
  const discs: Disc[] = orrery.bodies.map((entry) => ({ entry, x: 0, y: 0, r: 0, depth: 0, visible: false }));

  function projectDiscs(): void {
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;
    const tanHalf = Math.tan(FOV * DEG * 0.5);
    for (const disc of discs) {
      scratch.copy(disc.entry.position);
      disc.depth = camera.position.distanceTo(scratch);
      scratch.project(camera);
      disc.visible = scratch.z < 1 && scratch.z > -1 && Math.abs(scratch.x) < 1.2 && Math.abs(scratch.y) < 1.2;
      disc.x = ((scratch.x + 1) / 2) * width;
      disc.y = ((1 - scratch.y) / 2) * height;
      disc.r = (disc.entry.radius / Math.max(1, disc.depth) / tanHalf) * (height / 2);
    }
  }

  function bodyAt(clientX: number, clientY: number): string | null {
    let best: Disc | null = null;
    for (const disc of discs) {
      if (!disc.visible || disc.entry.body.kind === 'star') continue;
      const reach = Math.max(disc.r, 12) + 8;
      if (Math.hypot(clientX - disc.x, clientY - disc.y) > reach) continue;
      if (best === null || disc.depth < best.depth) best = disc;
    }
    return best?.entry.body.id ?? null;
  }

  /* --- the bodies: labels and dock --------------------------------------- */

  const labels = new Map<string, HTMLButtonElement>();
  const dockItems = new Map<string, HTMLButtonElement>();

  for (const entry of orrery.bodies) {
    const id = entry.body.id;
    const enterable = walkable.has(id);
    const explorable = enterable || (deps.exploreBody !== undefined && entry.body.kind !== 'star');
    // Out of the tab order: every label has a dock item that does the same
    // thing, and nine stops on the canvas before the dock is nine too many.
    // The Sun is named on the canvas and in the dock and goes nowhere: there is
    // nothing to land on, and a card about it was a stop between you and a world.
    const inert = entry.body.kind === 'star';
    const label = h(
      'button',
      { class: inert ? 'm-label inert' : explorable ? 'm-label walk' : 'm-label', 'aria-label': entry.body.name, tabindex: -1 },
      entry.body.name,
      explorable ? icon('chevron') : null,
    );
    label.addEventListener('click', () => chooseBody(id));
    label.addEventListener('pointerenter', () => (hoverBody = id));
    label.addEventListener('pointerleave', () => (hoverBody = null));
    marks.append(label);
    labels.set(id, label);

    const look = entry.body.look;
    const disc = h('span', { class: id === 'saturn' ? 'm-disc ringed' : 'm-disc' });
    if (id === 'earth') {
      disc.style.background =
        `radial-gradient(circle at 62% 42%, ${hex(PALETTE.green)} 0 26%, transparent 27%),` +
        `radial-gradient(circle at 33% 30%, ${hex(PALETTE.skyBlue)} 0 20%, ${hex(OCEAN_COLOR)} 21% 62%, #1d5b7c 63%)`;
    } else if (entry.body.kind === 'star') {
      disc.style.setProperty('--hi', hex(PALETTE.cream));
      disc.style.setProperty('--base', hex(PALETTE.gold));
      disc.style.setProperty('--lo', hex(PALETTE.orange));
    } else {
      disc.style.setProperty('--hi', hex(look.highland));
      disc.style.setProperty('--base', hex(look.surface));
      disc.style.setProperty('--lo', hex(look.lowland));
    }
    // Earth is the one you can walk, and says so; every other body says how
    // far away it is today, as the light's own travel time, and nothing about
    // what it is not yet. Eight "soon" badges read as a project that was not
    // finished; a real distance reads as a solar system.
    let tag: HTMLElement;
    let title: string;
    if (enterable) {
      tag = h('span', { class: 'ui-tag ink' }, icon('play'), 'Explore');
      title = `${entry.body.name}: explore it`;
    } else {
      const seen = sighting(entry.body, time());
      tag = h('span', { class: 'm-dock-sub', text: lightText(seen.km, 'light-min') });
      title = `${entry.body.name}: ${distanceText(seen.km)} from Earth right now`;
    }
    const item = h(
      'button',
      { class: inert ? 'm-dock-item ui-card inert' : enterable ? 'm-dock-item ui-card walk' : 'm-dock-item ui-card', title, ...(inert ? { tabindex: -1, 'aria-disabled': 'true' } : {}) },
      disc,
      h('span', { class: 'm-dock-name', text: entry.body.name.replace(/^The /, '') }),
      tag,
    );
    item.addEventListener('click', () => chooseBody(id));
    item.addEventListener('pointerenter', () => (hoverBody = id));
    item.addEventListener('pointerleave', () => (hoverBody = null));
    // The keyboard lights the planet as the pointer does: the halo is how you
    // know which of nine discs the button in the dock is about.
    item.addEventListener('focus', () => (hoverBody = id));
    item.addEventListener('blur', () => {
      if (hoverBody === id) hoverBody = null;
    });
    dock.append(item);
    dockItems.set(id, item);
  }

  function layOutLabels(): void {
    const quiet = held || flight !== null || chosen !== null || (stage !== 'system' && stage !== 'planet');
    marks.classList.toggle('quiet', quiet);
    let haloOn = false;
    for (const disc of discs) {
      const id = disc.entry.body.id;
      const label = labels.get(id)!;
      const hot = id === hoverBody;
      label.classList.toggle('hot', hot);
      dockItems.get(id)?.classList.toggle('hot', hot);
      // The Sun carries no label: it is the light the rest are seen by.
      const hideThis = quiet || !disc.visible || disc.entry.body.kind === 'star' || (stage === 'planet' && id === focusId);
      label.style.display = hideThis ? 'none' : '';
      if (!hideThis) {
        label.style.transform = `translate(${disc.x.toFixed(1)}px, ${(disc.y + disc.r + 10).toFixed(1)}px) translateX(-50%)`;
      }
      if (hot && !quiet && disc.visible && !(stage === 'planet' && id === focusId)) {
        const size = Math.max(disc.r, 9) + 9;
        halo.style.width = `${size * 2}px`;
        halo.style.height = `${size * 2}px`;
        halo.style.transform = `translate(${(disc.x - size).toFixed(1)}px, ${(disc.y - size).toFixed(1)}px)`;
        haloOn = true;
      }
    }
    halo.classList.toggle('on', haloOn);
    orrery.highlight(quiet ? null : hoverBody ?? (stage === 'planet' ? focusId : null));
  }

  /* --- the towns ---------------------------------------------------------- */

  const shownPins = new Map<number, HTMLButtonElement>();
  const freePins: HTMLButtonElement[] = [];
  let sites: MenuSite[] = [];
  let unitOf: THREE.Vector3[] = [];
  let projX = new Float32Array(0);
  let projY = new Float32Array(0);
  let order = new Int32Array(0);
  let kept = new Int32Array(0);
  let keptX = new Float32Array(0);
  let keptY = new Float32Array(0);
  /** The town under the pointer in the list, whose pin lights up. */
  let hotSite: MenuSite | null = null;

  function loadSites(next: MenuRegion): void {
    sites = sitesOf.get(next.key)?.slice() ?? [];
    // A country with no town in the gazetteer still has to be spawnable; its
    // own label point is on land by construction.
    if (sites.length === 0) sites = [{ name: next.name, key: next.key, lat: next.lat, lon: next.lon, weight: 0 }];
    unitOf = sites.map((site) => onSphere(site.lon, site.lat, new THREE.Vector3()));
    projX = new Float32Array(sites.length);
    projY = new Float32Array(sites.length);
    order = new Int32Array(sites.length);
    kept = new Int32Array(sites.length);
    keptX = new Float32Array(sites.length);
    keptY = new Float32Array(sites.length);
    releasePins();
  }

  function releasePins(): void {
    for (const element of shownPins.values()) {
      element.style.display = 'none';
      freePins.push(element);
    }
    shownPins.clear();
  }

  function takePin(): HTMLButtonElement {
    const spare = freePins.pop();
    if (spare !== undefined) return spare;
    const element = h('button', { class: 'm-pin' }, h('i'), h('span'));
    pinLayer.append(element);
    return element;
  }

  /**
   * Lay the pins out for this frame. **A pin belongs to a town, not to a
   * slot** — the pool is keyed on the town's index, so an element never
   * carries Lyon one frame and Toulouse the next. Thinned largest-first with
   * the maps' own `thinMarks`, because before you are anywhere the survivor of
   * a cluster should be the one you have heard of.
   */
  function layOutPins(): void {
    if (stage !== 'site' || flight !== null || sites.length === 0) {
      releasePins();
      return;
    }
    const box = renderer.domElement.getBoundingClientRect();
    const cosHorizon = body.radius / camera.position.distanceTo(body.centre);
    const camDir = scratchB.copy(camera.position).sub(body.centre).normalize();

    let count = 0;
    for (let i = 0; i < sites.length; i++) {
      const unit = unitOf[i]!;
      if (unit.dot(camDir) <= cosHorizon) continue;
      scratch.copy(unit).multiplyScalar(body.radius + LAND_HEIGHT).add(body.centre).project(camera);
      if (scratch.x < -1.05 || scratch.x > 1.05 || scratch.y < -1.05 || scratch.y > 1.05) continue;
      projX[i] = ((scratch.x + 1) / 2) * box.width;
      projY[i] = ((1 - scratch.y) / 2) * box.height;
      order[count++] = i;
    }

    const n = Math.min(MAX_PINS, thinMarks(order, count, projX, projY, PIN_SPACING, kept, keptX, keptY));
    // The picked town and the one under the pointer in the list always stand,
    // whatever the thinning thought of them.
    const force = [picked, hotSite];
    let total = n;
    for (const site of force) {
      if (site === null) continue;
      const at = sites.indexOf(site);
      if (at < 0) continue;
      let present = false;
      for (let i = 0; i < total; i++) if (kept[i] === at) present = true;
      if (present) continue;
      const unit = unitOf[at]!;
      if (unit.dot(camDir) <= cosHorizon) continue;
      scratch.copy(unit).multiplyScalar(body.radius + LAND_HEIGHT).add(body.centre).project(camera);
      if (Math.abs(scratch.x) > 1.05 || Math.abs(scratch.y) > 1.05) continue;
      kept[total] = at;
      keptX[total] = ((scratch.x + 1) / 2) * box.width;
      keptY[total] = ((1 - scratch.y) / 2) * box.height;
      total++;
    }

    const space = new LabelSpace();
    for (const [at, element] of shownPins) {
      let survives = false;
      for (let i = 0; i < total; i++) {
        if (kept[i] === at) {
          survives = true;
          break;
        }
      }
      if (survives) continue;
      element.style.display = 'none';
      freePins.push(element);
      shownPins.delete(at);
    }
    // The picked and hot towns claim their label space first.
    const indices = Array.from({ length: total }, (_, i) => i).sort((a, b) => {
      const rank = (i: number): number => (sites[kept[i]!] === picked ? 0 : sites[kept[i]!] === hotSite ? 1 : 2);
      return rank(a) - rank(b);
    });
    for (const i of indices) {
      const at = kept[i]!;
      const site = sites[at]!;
      let element = shownPins.get(at);
      if (element === undefined) {
        element = takePin();
        shownPins.set(at, element);
        element.querySelector('span')!.textContent = site.name;
        element.title = site.name;
        element.style.display = '';
      }
      const x = keptX[i]!;
      const y = keptY[i]!;
      const width = 28 + site.name.length * 7.3;
      const away = !space.fits(x - 8, y - 12, width, 25);
      if (!away) space.claim(x - 8, y - 12, width, 25);
      const classes = ['m-pin'];
      if (site.capital === true) classes.push('capital');
      if (away) classes.push('away');
      if (site === picked) classes.push('picked');
      if (site === hotSite) classes.push('hot');
      element.className = classes.join(' ');
      element.style.transform = `translate(${(x - 10).toFixed(1)}px, ${(y - 14).toFixed(1)}px)`;
    }
  }

  pinLayer.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    if (button === null) return;
    for (const [at, element] of shownPins) {
      if (element === button) pickTown(sites[at]!);
    }
  });
  // The buttons and pins tick under the pointer as the bodies and the countries do.
  let overControl: Element | null = null;
  root.addEventListener('pointerover', (event) => {
    const control = event.target instanceof Element ? event.target.closest('.m-pin, .ui-btn, .m-crumb, .m-result') : null;
    if (control === overControl) return;
    overControl = control;
    if (control !== null && chosen === null) deps.sound?.cue('hover');
  });
  pinLayer.addEventListener('dblclick', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    if (button === null || picked === null) return;
    start(picked);
  });
  // Enter on a pin is its click — it picks that town — and Enter on the pin
  // already picked starts there, which is the double-click's job for a mouse.
  pinLayer.addEventListener('keydown', (event) => {
    if (!isEnter(event) || picked === null) return;
    const button = (event.target as HTMLElement).closest('button');
    if (button === null || button !== shownPins.get(sites.indexOf(picked))) return;
    event.preventDefault();
    start(picked);
  });

  /* --- the chrome ------------------------------------------------------- */

  const setOff = (element: HTMLElement, off: boolean): void => {
    element.classList.toggle('m-off', off);
    // A control that goes away takes the keyboard with it; a hidden button
    // left holding the focus would still answer Enter, invisibly.
    if (off && element.contains(document.activeElement)) root.focus({ preventScroll: true });
  };

  function crumb(label: string | Node, action: (() => void) | null, flagKey?: string): HTMLElement {
    const element = h('button', { class: action === null ? 'm-crumb here' : 'm-crumb' });
    if (flagKey !== undefined) element.append(flag(flagKey, 22, 15));
    element.append(label);
    if (action !== null) element.addEventListener('click', action);
    else element.setAttribute('aria-current', 'page');
    return element;
  }

  function refreshTrail(): void {
    const parts: HTMLElement[] = [crumb('Solar system', () => backToSystem())];
    if (stage === 'planet') {
      parts.push(crumb(bodyById(focusId).body.name, null));
    } else if (stage === 'region' || stage === 'site') {
      parts.push(crumb(body.name, stage === 'site' ? () => backToRegions() : null));
      if (stage === 'site' && region !== null) parts.push(crumb(region.name, null, region.key));
    }
    trail.replaceChildren();
    parts.forEach((part, i) => {
      if (i > 0) trail.append(icon('chevron'));
      trail.append(part);
    });
    backLabel.textContent = stage === 'site' ? capital(words.regions) : 'Solar system';
  }

  /**
   * On another world's globe, Continue is that world's own memory or
   * nothing: *Start in Palma* over Mars would fly you to Earth from the
   * screen you are choosing a Martian town on. Earth's stages and the system
   * keep the newer memory, wherever it is.
   */
  function continueHere(): boolean {
    if ((stage !== 'region' && stage !== 'site') || body === home) return true;
    return last !== null && last.body === body.id && deps.exploreBody !== undefined;
  }

  function refreshContinue(): void {
    const elsewhere = last !== null && last.body !== home.id && deps.exploreBody !== undefined;
    if (last === null || (last.body !== home.id && !elsewhere)) {
      continueLabel.replaceChildren('Start in ', h('span', { class: 'quiet', text: fallback.name }));
    } else if (elsewhere) {
      const world = bodyName(last.body).replace(/^The /, 'the ');
      continueLabel.replaceChildren(
        'Continue on ',
        h('span', { class: 'quiet', text: last.name === '' ? world : `${world}, in ${last.name}` }),
      );
    } else if (last.name === '') {
      // Out at sea, most likely: somewhere with no town to name.
      continueLabel.replaceChildren('Continue where you left off');
    } else {
      continueLabel.replaceChildren('Continue in ', h('span', { class: 'quiet', text: last.name }));
    }
  }
  refreshContinue();

  function refreshChrome(): void {
    const flying = flight !== null;
    const open = chosen === null && !held;
    const settled = !flying && open;
    root.classList.toggle('flying', flying);
    root.classList.toggle('chosen', chosen !== null);
    root.classList.toggle('held', held);
    setOff(brand, !(stage === 'system' && settled));
    setOff(dock, !(stage === 'system' && settled));
    setOff(crumbs, !(stage !== 'system' && open));
    setOff(panel, !((stage === 'region' || stage === 'site') && settled));
    setOff(info, !(stage === 'planet' && settled));
    setOff(back, !(stage !== 'system' && open));
    setOff(search, !(open && stage !== 'planet'));
    refreshContinue();
    setOff(continueButton, !(open && continueHere()));
    if (travellerButton !== null) setOff(travellerButton, !open);
    // The town picked, or once chosen the landing it is waiting for — never
    // under the title, which holds the menu with neither.
    setOff(select, !(chosen !== null || (open && stage === 'site' && picked !== null && !flying)));
    // Not under the title, which says how far the world is in its own card.
    setOff(progressPill, built || chosen !== null || held);
    if (flying || !open) closeResults();
    refreshTrail();
  }

  /* --- the stage cards -------------------------------------------------- */

  function surprise(): void {
    // Weighted by the square root of the population, so a capital is likelier
    // than a village and a village is still possible.
    let total = 0;
    for (const site of body.sites) total += Math.sqrt(Math.max(1, site.weight));
    let draw = Math.random() * total;
    for (const site of body.sites) {
      draw -= Math.sqrt(Math.max(1, site.weight));
      if (draw > 0) continue;
      chooseRegion(regionIndexOf.get(site.key) ?? 0, site);
      return;
    }
  }

  function fillRegionPanel(): void {
    const surpriseButton = h('button', { class: 'ui-btn' }, icon('dice', 18), 'Surprise me');
    surpriseButton.addEventListener('click', surprise);
    panel.replaceChildren(
      h('div', { class: 'ui-eyebrow', text: `${body.name} · ${body.note}` }),
      h('h2', { text: 'Where do you want to start?' }),
      h('p', { text: `Drag to turn the globe, then click a ${words.region}. Or type the name of a place in the search.` }),
      surpriseButton,
    );
  }

  const rowOf = new Map<MenuSite, HTMLButtonElement>();

  function fillSitePanel(next: MenuRegion): void {
    const all = sitesOf.get(next.key) ?? [];
    const list = h('div', { class: 'm-list', role: 'list' });
    rowOf.clear();
    for (const site of all.slice(0, LIST_LENGTH)) {
      const row = h(
        'button',
        { class: site.capital === true ? 'm-row capital' : 'm-row', role: 'listitem' },
        h('i'),
        h('span', { text: site.name }),
        site.weight > 0 ? h('small', { text: compact(site.weight) }) : null,
      );
      row.addEventListener('click', () => pickTown(site, true));
      row.addEventListener('dblclick', () => start(site));
      // Enter picks a row by being its click; on the row already picked it
      // starts there, as a double-click does.
      row.addEventListener('keydown', (event) => {
        if (!isEnter(event) || picked !== site) return;
        event.preventDefault();
        start(site);
      });
      row.addEventListener('pointerenter', () => (hotSite = site));
      row.addEventListener('pointerleave', () => {
        if (hotSite === site) hotSite = null;
      });
      rowOf.set(site, row);
      list.append(row);
    }
    if (all.length > LIST_LENGTH) {
      list.append(h('div', { class: 'm-more', text: `and ${(all.length - LIST_LENGTH).toLocaleString('en')} smaller ${words.sites} on the map` }));
    }
    const count = all.length;
    panel.replaceChildren(
      h(
        'div',
        { class: 'm-country' },
        flag(next.key, 48, 32),
        h(
          'div',
          {},
          h('h2', { text: next.name }),
          h('div', { class: 'm-country-sub', text: `${next.note} · ${count === 1 ? `one ${words.site}` : `${count.toLocaleString('en')} ${words.sites}`}` }),
        ),
      ),
      h('p', { text: `Pick a ${words.site} on the map or in the list. Drag the globe to browse the next ${words.region} — its ${words.sites} come up when you let go.` }),
      list,
    );
  }

  function fillInfo(entry: OrreryBody): void {
    const b = entry.body;
    // Computed for the sky's own clock, the one the orrery is laid out for, so
    // the card and the diagram behind it describe the same instant.
    const seen = sighting(b, time());
    const facts: [string, string][] = [
      ['From Earth now', distanceText(seen.km)],
      ['Its light takes', lightText(seen.km)],
      [b.kind === 'star' ? 'Turns once in' : 'A day', dayLength(b.rotationHours)],
    ];
    if (b.orbit !== null) facts.push(['A year', yearLength(periodOf(b.orbit))]);
    facts.push(['Radius', km(b.radiusKm)]);
    facts.push(['Gravity', `${(b.gravity / 9.807).toFixed(b.gravity > 50 ? 0 : 2)} g`]);
    if (b.orbit === null) facts.push(['Axial tilt', `${b.tiltDeg.toFixed(1)}°`]);

    // One line about where to look, and one honest line about walking — no
    // badge, no dashed box. The Sun gets neither: it is the star, and nobody
    // expected to land on it.
    const lines: HTMLElement[] = [];
    if (b.kind !== 'star') lines.push(h('div', { class: 'm-line' }, icon('eye'), skyText(seen)));

    const others = orrery.bodies.filter((candidate) => !walkable.has(candidate.body.id));
    const at = others.indexOf(entry);
    const next = others[(at + 1) % others.length]!;
    const nextButton = h('button', { class: 'ui-btn' }, `Next: ${next.body.name.replace(/^The /, '')}`, icon('next', 18));
    nextButton.addEventListener('click', () => chooseBody(next.body.id));
    const short = b.name.replace(/^The /, '');
    const explore = b.kind !== 'star' && deps.exploreBody !== undefined;
    const earthButton = h('button', { class: explore ? 'ui-btn' : 'ui-btn primary' }, icon('globe', 18), explore ? 'Earth' : 'Go to Earth');
    earthButton.addEventListener('click', () => chooseBody(home.id));
    const exploreButton = explore ? h('button', { class: 'ui-btn primary' }, icon('play', 16), `Explore ${short}`) : null;
    exploreButton?.addEventListener('click', () => void exploreFrom(entry, exploreButton));

    const eyebrow =
      b.kind === 'star' ? 'Star · the centre of it all'
        : b.kind === 'moon' ? 'Moon · Earth\'s own'
          : `${kindOf(entry)} · ${ordinal(entry.order)} from the Sun`;
    info.replaceChildren(
      h('div', { class: 'ui-eyebrow', text: eyebrow }),
      h('h2', { text: b.name }),
      h('p', { text: b.blurb }),
      h(
        'div',
        { class: 'm-facts' },
        ...facts.map(([name, value]) => h('div', { class: 'm-fact' }, h('small', { text: name }), h('b', { text: value }))),
      ),
      ...(lines.length > 0 ? [h('div', { class: 'm-lines' }, ...lines)] : []),
      h('div', { class: 'm-actions' }, exploreButton, earthButton, nextButton),
    );
  }

  function fillSelect(): void {
    if (chosen !== null) {
      const waiting = !built;
      select.replaceChildren(
        h(
          'div',
          {},
          h('div', { class: 'ui-eyebrow', text: waiting ? 'Almost there' : 'Here we go' }),
          h('div', { class: 'm-select-name', text: chosen.name === '' ? 'Back where you left off' : `Landing in ${chosen.name}` }),
          waiting
            ? h('div', { class: 'm-select-bar' }, h('i', { style: `width: ${(progressFraction * 100).toFixed(0)}%` }))
            : h('div', { class: 'm-select-sub', text: chosen.region || 'Earth' }),
        ),
      );
      return;
    }
    if (picked === null) return;
    const site = picked;
    const startButton = h('button', { class: 'ui-btn primary big' }, 'Start here', kbd('⏎'));
    startButton.addEventListener('click', () => start(site));
    const details = [regionName(site.key)];
    if (site.weight > 0) details.push(people(site.weight));
    details.push(`${body.clock?.(site, time()) ?? clockAt(time(), site.key, site.lon, site.lat)} local time`);
    select.replaceChildren(
      flag(site.key, 48, 32),
      h(
        'div',
        {},
        h('div', { class: 'm-select-name' }, site.name, site.capital === true ? ' ' : null, site.capital === true ? h('span', { class: 'ui-tag gold' }, icon('star'), 'Capital') : null),
        h('div', { class: 'm-select-sub', text: details.join(' · ') }),
      ),
      startButton,
    );
  }

  /* --- the stages ------------------------------------------------------- */

  function chooseBody(id: string): void {
    if (flight !== null || chosen !== null || exploring !== null) return;
    const entry = bodyById(id);
    if (entry.body.kind === 'star') return;
    touch();
    // **Every world is chosen as Earth is**: one click and the camera goes
    // down onto its globe, its regions coloured and waiting. The card in
    // between (*Explore*, *Earth*, *Next*) was a stop nobody asked for.
    const next = walkable.get(id) ?? loaded.get(id);
    if (next !== undefined) {
      deps.sound?.cue('select');
      enterBody(next);
      return;
    }
    if (deps.exploreBody !== undefined) {
      void exploreFrom(entry, null);
      return;
    }
    deps.sound?.cue('select');
    focusId = id;
    orrery.focus(id);
    // Seen three-quarters lit: round from the Sun's side of it, a little above
    // its equator.
    const toSun = scratchB.subVectors(orrery.sun.position, entry.position);
    const base = inPlane(toSun) + 0.9;
    const reach = entry.radius * (entry.body.id === 'saturn' ? 1.9 : 1);
    focus.azimuth = focusWant.azimuth = base;
    focus.elevation = focusWant.elevation = FOCUS_ELEVATION;
    focus.distance = focusWant.distance = reach * FOCUS_DISTANCE;
    fillInfo(entry);
    showRibbon(null);
    const target = focusPose(focus, makePose());
    stage = 'planet';
    flyTo(target, () => refreshChrome());
  }

  /** *Explore* on a body's card, while its `MenuBody` is being made. */
  let exploring: string | null = null;

  /**
   * *Explore* on a body's card: down onto its globe, as Earth's is, once
   * `deps.loadBody` has made its `MenuBody` — its regions, their frontiers
   * and colours, its sites — and straight to the world when there is none.
   */
  async function exploreFrom(entry: OrreryBody, button: HTMLButtonElement | null): Promise<void> {
    const b = entry.body;
    if (flight !== null || chosen !== null || exploring !== null) return;
    touch();
    const from = stage;
    let next: MenuBody | null = loaded.get(b.id) ?? null;
    if (next === null && deps.loadBody !== undefined) {
      exploring = b.id;
      if (button !== null) button.disabled = true;
      next = await bodyOf(entry);
      exploring = null;
      if (button !== null) button.disabled = false;
      // Moved on while it loaded: somewhere else was chosen meanwhile.
      if (stage !== from || flight !== null || chosen !== null) return;
    }
    if (next === null) {
      deps.sound?.cue('start');
      deps.exploreBody?.(b.id, b.name);
      return;
    }
    deps.sound?.cue('select');
    enterBody(next);
  }

  /** The bodies being made, so a click and the warm-up never make one twice. */
  const making = new Map<string, Promise<MenuBody | null>>();

  /**
   * A walkable body's `MenuBody`, made once: its regions, its sites and its
   * own ground (`MenuBody.globe`), which from then on is what the system
   * draws for it in place of the orrery's painted ball.
   */
  function bodyOf(entry: OrreryBody): Promise<MenuBody | null> {
    const id = entry.body.id;
    const have = loaded.get(id);
    if (have !== undefined) return Promise.resolve(have);
    const pending = making.get(id);
    if (pending !== undefined) return pending;
    const made = (async (): Promise<MenuBody | null> => {
      if (deps.loadBody === undefined) return null;
      try {
        let next = await deps.loadBody(id, entry.position, entry.radius);
        if (next === null || disposed) return null;
        // The orrery's own vector, live, whatever the body was made with: the
        // globe stages follow it round the system as the sky's clock turns it.
        if (next.centre !== entry.position) next = { ...next, centre: entry.position };
        loaded.set(id, next);
        if (next.globe !== undefined) {
          scene.add(next.globe.object);
          globes.push({ entry, globe: next.globe });
          orrery.cover(id);
        }
        return next;
      } catch (error) {
        console.warn(`menu: ${entry.body.name}'s regions did not load`, error);
        return null;
      }
    })();
    making.set(id, made);
    return made;
  }

  /** The walked worlds' own grounds standing in the system, and whose. */
  const globes: { entry: OrreryBody; globe: NonNullable<MenuBody['globe']> }[] = [];
  let disposed = false;

  /** Each world's ground at its body, shown as the orrery shows the body, and as fine as the eye needs. */
  function placeGlobes(): void {
    for (const { entry, globe } of globes) {
      globe.object.position.copy(entry.position);
      globe.object.visible = entry.opacity > 0.01;
      if (globe.object.visible) globe.update(camera.position, entry.position);
    }
  }

  /** Make a walkable body the one the globe stages are about, without moving the camera. */
  function setBody(next: MenuBody): void {
    if (next === body) return;
    body = next;
    ({ regionIndexOf, sitesOf } = catalogueOf(body));
    region = null;
    regionIndex = 0;
    hoverIndex = 0;
    picked = null;
    hotSite = null;
    releasePins();
    sites = [];
    showRibbon(null);
    refreshWords();
    overlayGroup.clear();
    if (body.overlay !== undefined) {
      // In the body's own frame: the group it hangs in is what stands at the centre.
      body.overlay.position.set(0, 0, 0);
      overlayGroup.add(body.overlay);
    }
    if (body === home) {
      orrery.holdUpright(null);
    } else {
      // The drawn globe held still in the world's frame, so a latitude and a
      // longitude round its centre are where its regions are. Unpainted, as
      // Earth's land is: a region is seen under the pointer, not as a colour.
      orrery.holdUpright(body.id, []);
    }
  }

  /** Down from the system onto a walkable world, to its region stage. */
  function enterBody(next: MenuBody): void {
    setBody(next);
    orrery.focus(null);
    // The globe is framed on a blend of where the camera came from and where
    // the Sun is, so the flight is mostly a zoom and it lands on the day side.
    const approach = scratch.copy(pose.eye).sub(body.centre).normalize();
    const sun = scratchB.copy(orrery.sun.position).sub(body.centre).normalize();
    const blendDir = approach.multiplyScalar(0.4).addScaledVector(sun, 0.6).normalize();
    const here = toLatLon(blendDir);
    view.lat = want.lat = Math.max(-35, Math.min(55, here.lat));
    view.lon = want.lon = here.lon;
    view.dist = want.dist = orbitDistance(body.radius);
    fillRegionPanel();
    stage = 'region';
    flyTo(globePose(view.lat, view.lon, view.dist, makePose()), () => refreshChrome());
  }

  /**
   * Frame a region on its **largest ring**, not all of them: France owns
   * islands in three oceans, and a cap round all of them frames the planet.
   * A cap of half-angle `a` seen from `d` along its own axis subtends
   * `atan(R sin a / (d - R cos a))`; setting that to the fill's share of the
   * half-lens and solving for `d` is the whole framing.
   */
  function frameRegion(next: MenuRegion, site?: MenuSite, near?: THREE.Vector3): { lat: number; lon: number; dist: number } {
    let best: MenuRing | null = null;
    for (const ring of next.rings) if (best === null || ring.points.length > best.points.length) best = ring;
    let shape = capOf(best?.points ?? [[next.lon, next.lat]], next);
    // **A point on a far piece of the country frames that piece.** Choosing by
    // a click or a drag says where you were looking, and landing on French
    // Guiana or the Canaries and being flown to Paris or Madrid would be a
    // camera that ignored you. Anywhere on or near the main ring keeps the
    // main ring's framing, which is the one the search and the list give.
    if (near !== undefined && near.angleTo(shape.centre) > shape.cap * 1.15) {
      let score = Infinity;
      for (const ring of next.rings) {
        const candidate = capOf(ring.points, next);
        const s = near.angleTo(candidate.centre) - candidate.cap;
        if (s < score) {
          score = s;
          shape = candidate;
        }
      }
    }
    const cap = Math.min(MAX_CAP, Math.max(0.35 * DEG, shape.cap));
    const target = Math.tan(REGION_FILL * FOV * DEG * 0.5);
    const dist = Math.max(body.radius + MIN_ALTITUDE, body.radius * Math.cos(cap) + (body.radius * Math.sin(cap)) / target);
    const here = site !== undefined ? { lat: site.lat, lon: site.lon } : toLatLon(shape.centre);
    return { lat: Math.max(-MAX_LAT, Math.min(MAX_LAT, here.lat)), lon: here.lon, dist };
  }

  /** A ring as a cap on the unit sphere: its centre and its half-angle. */
  function capOf(points: readonly number[][], fallback: MenuRegion): { centre: THREE.Vector3; cap: number } {
    const centre = new THREE.Vector3();
    const point = new THREE.Vector3();
    for (const p of points) centre.add(onSphere(p[0]!, p[1]!, point));
    if (centre.lengthSq() < 1e-9) onSphere(fallback.lon, fallback.lat, centre);
    centre.normalize();
    let cap = 0;
    for (const p of points) {
      const dot = onSphere(p[0]!, p[1]!, point).dot(centre);
      cap = Math.max(cap, Math.acos(Math.min(1, Math.max(-1, dot))));
    }
    return { centre, cap };
  }

  /** Make a region the chosen one, without moving the camera. */
  function setRegion(index: number): boolean {
    if (index <= 0 || index > body.regions.length) return false;
    regionIndex = index;
    region = body.regions[index - 1]!;
    picked = null;
    hotSite = null;
    showRibbon(region);
    loadSites(region);
    fillSitePanel(region);
    return true;
  }

  function chooseRegion(index: number, site?: MenuSite, near?: THREE.Vector3): void {
    if (chosen !== null) return;
    touch();
    if (!setRegion(index)) return;
    deps.sound?.cue('select');
    closeResults();
    const framing = frameRegion(region!, site, near);
    const target = globePose(framing.lat, framing.lon, framing.dist, makePose());
    stage = 'site';
    flyTo(target, () => {
      view.lat = want.lat = framing.lat;
      view.lon = want.lon = framing.lon;
      view.dist = want.dist = framing.dist;
      if (site !== undefined) pickTown(site);
      refreshChrome();
    });
  }

  /**
   * Dragging chooses. Whatever country is under the middle of the screen when
   * the globe stops is the one whose towns are shown — the fix for the menu's
   * one real complaint, where the towns of the country you had dragged to
   * never appeared — and the camera then settles on that country's own
   * framing, the one choosing it any other way gives, so a drag from Spain to
   * Russia does not leave Russia at Spain's zoom.
   */
  function followCentre(): void {
    const box = renderer.domElement.getBoundingClientRect();
    const at = pointAt(box.left + box.width / 2, box.top + box.height / 2);
    if (at === null) return;
    const index = body.regionAt(at.lat, at.lon);
    if (index <= 0 || index === regionIndex) return;
    chooseRegion(index, undefined, onSphere(at.lon, at.lat, new THREE.Vector3()));
  }

  function backToRegions(): void {
    if (flight !== null || chosen !== null) return;
    touch();
    deps.sound?.cue('back');
    stage = 'region';
    region = null;
    regionIndex = 0;
    picked = null;
    releasePins();
    sites = [];
    showRibbon(null);
    fillRegionPanel();
    want.dist = orbitDistance(body.radius);
    flyTo(globePose(view.lat, view.lon, want.dist, makePose()), () => {
      view.dist = want.dist;
      refreshChrome();
    });
  }

  function backToSystem(): void {
    if (flight !== null || chosen !== null) return;
    touch();
    deps.sound?.cue('back');
    stage = 'system';
    region = null;
    regionIndex = 0;
    picked = null;
    releasePins();
    sites = [];
    showRibbon(null);
    tip.classList.remove('on');
    orrery.focus(null);
    // Back among the planets the search is Earth's again, and the body that
    // was held up for its globe turns and leans with the rest — once the
    // camera is out among them, so it does not swing round under the lens.
    flyTo(systemPose(sys, makePose()), () => {
      setBody(home);
      refreshChrome();
    });
  }

  function goBack(): void {
    if (stage === 'site') backToRegions();
    else if (stage === 'region' || stage === 'planet') backToSystem();
    else if (flight === null) deps.onLeave?.();
  }

  function pickTown(site: MenuSite, centre = false): void {
    if (chosen !== null) return;
    if (picked !== site) deps.sound?.cue('pick');
    picked = site;
    for (const [candidate, row] of rowOf) row.classList.toggle('picked', candidate === site);
    rowOf.get(site)?.scrollIntoView({ block: 'nearest' });
    fillSelect();
    if (centre && flight === null) {
      // The list is off the map, so a town chosen from it is brought to the
      // middle of the frame rather than left wherever it happens to be — at
      // once, with less motion asked for, rather than panned to.
      want.lat = site.lat;
      want.lon = site.lon;
      if (calm.matches) {
        view.lat = want.lat;
        view.lon = want.lon;
      }
    }
    refreshChrome();
  }

  /** A body's name as the orrery has it, for a spawn that names only its id. */
  function bodyName(id: string): string {
    return orrery.bodies.find((entry) => entry.body.id === id)?.body.name ?? id;
  }

  /**
   * Down onto a place on the body the globe stages are about, from a little
   * south of it, so the last frame before the curtain has a horizon in it
   * rather than a map. Earth's dive and every other world's are this one.
   */
  function divePose(lat: number, lon: number): Pose {
    const upward = onSphere(lon, lat, new THREE.Vector3());
    const northward = new THREE.Vector3(0, 1, 0).addScaledVector(upward, -upward.y);
    if (northward.lengthSq() < 1e-6) northward.set(1, 0, 0);
    northward.normalize();
    // The height is Earth's, in the body's own radii.
    const height = DEPART_HEIGHT * (body.radius / home.radius);
    const to = makePose();
    to.target.copy(upward).multiplyScalar(body.radius).add(body.centre);
    to.eye.copy(to.target).addScaledVector(upward, height).addScaledVector(northward, -height * 0.45);
    to.up.copy(northward);
    return to;
  }

  /**
   * Another world, entered as Earth is: the dive onto the chosen place, the
   * curtain over the end of it, the world built under the curtain, and the
   * curtain lifted off it. The menu waits suspended under the world, so
   * nothing here is chosen and the choice Earth awaits stays open; when the
   * world hands the screen back the globe stage picks up where it was.
   */
  function diveInto(spawn: MenuSpawn): void {
    const onGlobe = spawn.body === body.id && (stage === 'region' || stage === 'site');
    const enter = (): Promise<void> => Promise.resolve(deps.exploreBody?.(spawn.body, bodyName(spawn.body), spawn));
    if (!onGlobe || calm.matches) {
      void enter();
      return;
    }
    exploring = spawn.body;
    root.classList.add('departing');
    deps.sound?.stage(null);
    const curtain = h('div', { class: 'atlas-curtain' });
    document.body.append(curtain);
    const lift = (): void => {
      root.classList.remove('departing');
      deps.sound?.stage(stage);
      curtain.classList.add('lifting');
      curtain.classList.remove('on');
      setTimeout(() => curtain.remove(), 1000);
    };
    flyTo(divePose(spawn.lat, spawn.lon), () => {});
    const seconds = flight!.duration / 1000;
    setTimeout(() => curtain.classList.add('on'), seconds * 1000 * 0.68);
    setTimeout(() => {
      exploring = null;
      // The world's first frames go under the curtain, as Earth's town does.
      void enter().finally(() => setTimeout(lift, 450));
    }, seconds * 1000 * 0.68 + 420);
  }

  function finish(spawn: MenuSpawn): void {
    if (chosen !== null || exploring !== null) return;
    if (spawn.body !== home.id && !walkable.has(spawn.body)) {
      if (deps.exploreBody === undefined) return;
      deps.sound?.cue('start');
      remember(spawn);
      closeResults();
      tip.classList.remove('on');
      diveInto(spawn);
      return;
    }
    chosen = spawn;
    deps.sound?.cue('start');
    remember(spawn);
    closeResults();
    tip.classList.remove('on');
    fillSelect();
    refreshChrome();
    resolveChoice?.(spawn);
  }

  function start(site: MenuSite): void {
    finish({
      body: body.id,
      region: regionName(site.key),
      name: site.name,
      lat: site.lat,
      lon: site.lon,
      ...(site.id === undefined ? {} : { site: site.id }),
    });
  }

  function touch(): void {
    lastTouched = performance.now();
  }

  backButton.addEventListener('click', goBack);
  back.addEventListener('click', goBack);
  continueButton.addEventListener('click', () => {
    if (flight !== null || !continueHere()) return;
    // A world the relay of this build cannot reach any more is Earth's fallback.
    const remembered = last !== null && (last.body === home.id || deps.exploreBody !== undefined) ? last : null;
    finish(remembered ?? { body: home.id, region: '', name: fallback.name, lat: fallback.lat, lon: fallback.lon });
  });

  /* --- the search --------------------------------------------------------- */

  interface Entry {
    kind: 'country' | 'town';
    /** What the row shows: for an alias, the town it finds. */
    name: string;
    /** What the query is matched against: for an alias, the alias. */
    folded: string;
    words: string[];
    weight: number;
    key: string;
    site: MenuSite | null;
    sub: string;
  }

  /**
   * Every name the search answers on one body, made the first time that body
   * is searched and kept: its regions, its sites, and the other names a site
   * answers to.
   */
  const entriesOf = new Map<string, Entry[]>();
  function entriesFor(of: MenuBody): Entry[] {
    const made = entriesOf.get(of.id);
    if (made !== undefined) return made;
    const entries: Entry[] = [];
    of.regions.forEach((candidate) => {
      if (candidate.rings.length === 0) return;
      const folded = fold(candidate.name);
      const count = catalogueOf(of).sitesOf.get(candidate.key)?.length ?? 0;
      entries.push({
        kind: 'country',
        name: candidate.name,
        folded,
        words: folded.split(/[\s\-']+/),
        // Countries rank above towns of the same match; the size is a tie-break.
        weight: 1e12 + count,
        key: candidate.key,
        site: null,
        sub: `${candidate.note} · ${count.toLocaleString('en')} ${(of.words ?? EARTH_WORDS).sites}`,
      });
    });
    for (const site of of.sites) {
      const folded = fold(site.name);
      entries.push({
        kind: 'town',
        name: site.name,
        folded,
        words: folded.split(/[\s\-']+/),
        weight: site.weight,
        key: site.key,
        site,
        sub: site.weight > 0 ? `${regionName(site.key)} · ${compact(site.weight)} people` : regionName(site.key),
      });
    }
    // The other names a town answers to. The row is the town that stands, and
    // says which name found it, so typing a famous city the bake folded into a
    // neighbour is an answer and not "nothing by that name".
    for (const [alias, index] of of.aliases ?? []) {
      const site = of.sites[index];
      if (site === undefined) continue;
      const folded = fold(alias);
      if (folded === fold(site.name)) continue;
      entries.push({
        kind: 'town',
        name: site.name,
        folded,
        words: folded.split(/[\s\-']+/),
        weight: site.weight,
        key: site.key,
        site,
        sub: `for ${alias} · ${regionName(site.key)}`,
      });
    }
    entriesOf.set(of.id, entries);
    return entries;
  }
  // Earth's now, while the menu is opening, rather than on the first keystroke.
  entriesFor(home);

  let found: Entry[] = [];
  let cursor = 0;

  function closeResults(): void {
    results.classList.remove('on');
    found = [];
  }

  /**
   * A linear scan of about ten thousand folded names, which is a millisecond
   * or two a keystroke and needs no index. A name that starts with the query
   * beats a word inside it, which beats a substring; ties go to the bigger
   * place, and a country beats any town that matches as well as it does.
   */
  function runSearch(): void {
    const query = fold(searchInput.value.trim());
    if (query.length === 0) {
      closeResults();
      return;
    }
    const scored: { entry: Entry; score: number }[] = [];
    for (const entry of entriesFor(body)) {
      let score = 0;
      if (entry.folded.startsWith(query)) score = 3;
      else if (entry.words.some((word) => word.startsWith(query))) score = 2;
      else if (query.length > 2 && entry.folded.includes(query)) score = 1;
      if (score > 0) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score || b.entry.weight - a.entry.weight);
    found = scored.slice(0, 7).map((item) => item.entry);
    cursor = 0;
    renderResults();
  }

  function renderResults(): void {
    results.replaceChildren();
    if (found.length === 0) {
      results.append(h('div', {
        class: 'm-empty',
        text: body === home
          ? 'Nothing by that name that is built — try a bigger town nearby.'
          : `No ${words.region} or ${words.site} on ${body.name.replace(/^The /, 'the ')} by that name.`,
      }));
    }
    found.forEach((entry, i) => {
      const row = h(
        'div',
        { class: i === cursor ? 'm-result on' : 'm-result', role: 'option' },
        flag(entry.key, 26, 18),
        h('div', {}, h('b', { text: entry.name }), h('small', { text: entry.sub })),
        h('span', { class: entry.kind === 'country' ? 'ui-tag ink' : 'ui-tag', text: entry.kind === 'country' ? words.region : words.site }),
      );
      row.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        pickEntry(entry);
      });
      row.addEventListener('pointerenter', () => {
        cursor = i;
        for (const [j, child] of Array.from(results.children).entries()) child.classList.toggle('on', j === i);
      });
      results.append(row);
    });
    results.classList.add('on');
  }

  function pickEntry(entry: Entry): void {
    searchInput.value = '';
    searchInput.blur();
    closeResults();
    const index = regionIndexOf.get(entry.key) ?? 0;
    if (entry.site !== null) chooseRegion(index, entry.site);
    else chooseRegion(index);
  }

  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length > 0) runSearch();
  });
  searchInput.addEventListener('blur', () => setTimeout(closeResults, 120));
  searchInput.addEventListener('keydown', (event) => {
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      event.preventDefault();
      if (found.length === 0) return;
      cursor = (cursor + (event.code === 'ArrowDown' ? 1 : found.length - 1)) % found.length;
      renderResults();
    } else if (isEnter(event)) {
      event.preventDefault();
      const entry = found[cursor];
      if (entry !== undefined) pickEntry(entry);
    } else if (event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      searchInput.value = '';
      searchInput.blur();
      closeResults();
    }
  });

  /* --- input ------------------------------------------------------------- */

  /**
   * Whether the keyboard is on nothing in particular: the page, the canvas or
   * this overlay itself, rather than a control.
   *
   * **Enter belongs to whatever has the focus.** Every dock item, crumb, row and
   * pin is a button, and a button activates on Enter by itself; the shortcut
   * used to take Enter from all of them and start the game — `Tab` to Mars in
   * the dock and Enter landed you in Palma, and Enter on a row started the town
   * already picked rather than that row. So the page's own shortcuts speak only
   * when no control is listening.
   */
  const focusIsFree = (): boolean => {
    const active = document.activeElement;
    return active === null || active === document.body || active === document.documentElement
      || active === root || active === renderer.domElement;
  };

  const events = new AbortController();
  const { signal } = events;

  let dragging = false;
  let dragged = 0;
  let lastX = 0;
  let lastY = 0;
  let pointer = { x: -1, y: -1 };

  const inChrome = (target: EventTarget | null): boolean =>
    (target as HTMLElement | null)?.closest('button, input, .ui-card, a') != null;

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || chosen !== null) return;
    if (inChrome(event.target)) return;
    touch();
    dragging = true;
    dragged = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    root.classList.add('dragging');
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      /* a synthetic pointer has no capture to take */
    }
  }, { signal });

  root.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    dragged += Math.abs(dx) + Math.abs(dy);
    touch();
    if (flight !== null) return;
    if (stage === 'system') {
      sysWant.azimuth -= dx * 0.0055;
      sysWant.elevation = Math.max(5 * DEG, Math.min(84 * DEG, sysWant.elevation + dy * 0.0045));
    } else if (stage === 'planet') {
      focusWant.azimuth -= dx * 0.0065;
      focusWant.elevation = Math.max(-70 * DEG, Math.min(70 * DEG, focusWant.elevation + dy * 0.0055));
    } else {
      // **1:1 with the ground under the middle of the frame.** Dragging right
      // moves the ground east, so the camera goes west; dragging down moves it
      // south, so the camera goes north. `verify()` checks both signs against
      // `regionAt`, the only witness not built from this basis.
      const perDegree = pixelsPerUnit(Math.max(1, view.dist - body.radius)) * body.radius * DEG;
      want.lon -= dx / perDegree;
      want.lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, want.lat + dy / perDegree));
    }
  }, { signal });

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('dragging');
    reticle.classList.remove('on');
    try {
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    } catch {
      /* see `pointerdown` */
    }
    if (flight !== null || chosen !== null) return;
    // A drag that moved is a drag; four pixels is a hand resting on a button.
    if (dragged > 4) {
      if (stage === 'site') followCentre();
      return;
    }
    if (stage === 'system' || stage === 'planet') {
      const id = bodyAt(event.clientX, event.clientY);
      if (id !== null && id !== focusId) chooseBody(id);
      return;
    }
    const at = pointAt(event.clientX, event.clientY);
    const index = at === null ? 0 : body.regionAt(at.lat, at.lon);
    const near = at === null ? undefined : onSphere(at.lon, at.lat, new THREE.Vector3());
    if (stage === 'region') {
      chooseRegion(index, undefined, near);
    } else if (index > 0 && index !== regionIndex) {
      chooseRegion(index, undefined, near);
    } else if (index === 0 && picked !== null) {
      picked = null;
      for (const row of rowOf.values()) row.classList.remove('picked');
      refreshChrome();
    }
  };
  root.addEventListener('pointerup', endDrag, { signal });
  root.addEventListener('pointercancel', endDrag, { signal });
  root.addEventListener('pointerleave', () => {
    pointer = { x: -1, y: -1 };
  }, { signal });

  root.addEventListener('wheel', (event) => {
    if (chosen !== null || inChrome(event.target)) return;
    event.preventDefault();
    touch();
    if (flight !== null) return;
    const unit = event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? innerHeight : 1;
    const pixels = Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, event.deltaY * unit));
    const step = Math.exp(pixels * WHEEL_ZOOM);
    if (stage === 'system') {
      sysWant.distance = Math.max(orrery.extent * 0.4, Math.min(orrery.extent * 3.5, sysWant.distance * step));
    } else if (stage === 'planet') {
      const entry = bodyById(focusId);
      const reach = entry.radius * (entry.body.id === 'saturn' ? 1.9 : 1);
      focusWant.distance = Math.max(reach * 1.6, Math.min(reach * 10, focusWant.distance * step));
    } else {
      const floor = stage === 'site' ? body.radius + MIN_ALTITUDE : orbitDistance(body.radius) * 0.55;
      const ceiling = orbitDistance(body.radius) * 1.5;
      want.dist = Math.max(floor, Math.min(ceiling, want.dist * step));
    }
  }, { signal, passive: false });

  addEventListener('keydown', (event) => {
    if (chosen !== null) return;
    // The card holds the keyboard: its Escape closes it, not a stage of this.
    if (deps.traveller?.open === true || held || suspended) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.activeElement === searchInput) return;
    touch();
    if (event.code === 'Escape') {
      event.preventDefault();
      goBack();
    } else if (isEnter(event)) {
      if (!focusIsFree()) return;
      event.preventDefault();
      if (stage === 'site' && picked !== null) start(picked);
      else if (stage === 'system') continueButton.click();
    } else if (event.key === '/') {
      event.preventDefault();
      searchInput.focus();
    } else if (event.key.length === 1 && /\p{L}/u.test(event.key) && stage !== 'planet') {
      // Typing a name anywhere starts the search: the input takes the key.
      searchInput.focus();
    }
  }, { signal });

  function resize(): void {
    // `main.ts` does not size the renderer until its loop starts, and a WebGL
    // canvas defaults to 300x150; the menu is on the screen long before. The
    // ratio is set again on every resize rather than once: the browser's zoom
    // and a move to a screen of another density both change it, and a canvas
    // left at the old one is blurred or pays for pixels nobody sees.
    renderer.setPixelRatio(deps.pixelRatio?.() ?? Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize, { signal });
  resize();

  // A window dragged to a screen of another density does not always resize,
  // and the media query for the ratio it is at is what fires then. It is asked
  // again for the new ratio every time it does.
  let density: MediaQueryList | null = null;
  const watchDensity = (): void => {
    density?.removeEventListener('change', onDensity);
    density = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    density.addEventListener('change', onDensity, { signal });
  };
  function onDensity(): void {
    resize();
    watchDensity();
  }
  watchDensity();

  /* --- the opening shot ------------------------------------------------- */

  orrery.update(time(), camera, renderer.domElement.clientHeight, 0);
  {
    const earthFromSun = scratch.subVectors(orrery.earth.position, orrery.sun.position);
    sys.azimuth = sysWant.azimuth = inPlane(earthFromSun) + SYSTEM_AZIMUTH;
    sys.distance = sysWant.distance = frameSystem(sys);
    // The shot arrives rather than appearing: the first frame is from half as
    // far out again, on the same flight every other move uses.
    const opening = systemPose({ ...sys, distance: sys.distance * 1.7, elevation: sys.elevation + 12 * DEG }, makePose());
    copyPose(opening, pose);
    applyPose(pose);
    flyTo(systemPose(sys, makePose()), () => refreshChrome(), 2.4);
  }

  /* --- the loop --------------------------------------------------------- */

  let resolveChoice: ((spawn: MenuSpawn) => void) | null = null;
  /** One promise for every caller: a second `choose()` used to orphan the first's. */
  let choice: Promise<MenuSpawn> | null = null;
  let running = true;
  /** What the sound last heard was under the pointer, and which stage it last heard. */
  let lastHovered: string | null = null;
  let heardStage: Stage | null = null;
  let previous = performance.now();

  function chase(orbit: Orbit, target: Orbit, k: number): void {
    orbit.azimuth += (target.azimuth - orbit.azimuth) * k;
    orbit.elevation += (target.elevation - orbit.elevation) * k;
    orbit.distance += (target.distance - orbit.distance) * k;
  }

  function frame(now: number): void {
    if (!running) return;
    requestAnimationFrame(frame);
    // The first timestamp can be earlier than the `performance.now()` taken
    // before it was asked for; a negative `dt` runs every chase backwards.
    const dt = Math.max(0, Math.min((now - previous) / 1000, 0.1));
    previous = now;

    orrery.update(time(), camera, renderer.domElement.clientHeight, dt);

    if (flight !== null) {
      const t = flight.duration <= 0 ? 1 : clamp01((now - flight.began) / flight.duration);
      const k = t * t * (3 - 2 * t);
      const kt = 1 - (1 - k) ** 2.4;
      blend(flight.from, flight.to, k, kt, pose);
      if (t >= 1) {
        copyPose(flight.to, pose);
        const done = flight.done;
        flight = null;
        done();
        refreshChrome();
      }
    } else {
      const k = 1 - Math.exp(-dt / DRAG_LAG);
      if (stage === 'system') {
        if (!dragging && !calm.matches && (now - lastTouched) / 1000 > IDLE_BEFORE_DRIFT) sysWant.azimuth += DRIFT * dt;
        chase(sys, sysWant, k);
        systemPose(sys, pose);
      } else if (stage === 'planet') {
        chase(focus, focusWant, k);
        focusPose(focus, pose);
      } else {
        // Longitude wraps, and a chase that does not know it takes the long
        // way round the planet once per session, in front of the player.
        let delta = want.lon - view.lon;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        view.lon += delta * k;
        view.lat += (want.lat - view.lat) * k;
        view.dist += (want.dist - view.dist) * k;
        globePose(view.lat, view.lon, view.dist, pose);
      }
    }
    applyPose(pose);
    placeGlobes();

    // The near plane rides the gap to the nearest thing, the far plane reaches
    // the outermost ring; the stars need none, being drawn at infinity
    // (`night-sky.ts`). A near of 5 against a far this deep would put the twenty units
    // between a cliff top and the sea inside one depth step, which is every
    // coastline z-fighting — so near is a fifth of the height over the ground,
    // or a third of the way to the nearest planet if one is closer.
    let gap = Infinity;
    for (const entry of orrery.bodies) {
      // Not the body the globe stages are about, nor one faded out of the frame.
      if (entry.body.id === body.id || entry.opacity <= 0.01) continue;
      const extent = entry.radius * (entry.body.id === 'saturn' ? 2.3 : 1);
      gap = Math.min(gap, camera.position.distanceTo(entry.position) - extent);
    }
    const near = Math.max(1, Math.min((camera.position.distanceTo(body.centre) - body.radius) * 0.2, gap * 0.3));
    const far = camera.position.distanceTo(orrery.sun.position) + orrery.extent * 1.05;
    if (Math.abs(near - camera.near) > near * 0.1 || Math.abs(far - camera.far) > far * 0.05) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    ribbonWidth();

    // What is under the pointer.
    const free = !dragging && flight === null && chosen === null && pointer.x >= 0;
    projectDiscs();
    if ((stage === 'system' || stage === 'planet') && free) {
      const overDock = document.elementFromPoint(pointer.x, pointer.y)?.closest('.m-dock-item, .m-label') != null;
      // A dock item the keyboard is on keeps its planet lit, wherever the
      // resting mouse happens to be.
      const active = document.activeElement;
      const keyed = active !== null && dock.contains(active) && active.matches(':focus-visible');
      if (!overDock && !keyed) hoverBody = bodyAt(pointer.x, pointer.y);
      root.style.cursor = hoverBody !== null ? 'pointer' : '';
    } else if (stage === 'region' || stage === 'site') {
      root.style.cursor = '';
    }
    if ((stage === 'region' || stage === 'site') && free && !inChrome(document.elementFromPoint(pointer.x, pointer.y))) {
      const index = regionUnder(pointer.x, pointer.y);
      const showing = stage === 'region' ? index : index !== regionIndex ? index : 0;
      if (stage === 'region' && index !== hoverIndex) {
        hoverIndex = index;
        showRibbon(index > 0 ? body.regions[index - 1]! : null);
      }
      if (showing > 0) {
        const next = body.regions[showing - 1]!;
        if (tipName.textContent !== next.name) {
          tipName.textContent = next.name;
          tipFlag.replaceChildren(flag(next.key, 30, 20));
          const count = sitesOf.get(next.key)?.length ?? 0;
          tipSub.textContent = `${next.note} · ${count.toLocaleString('en')} ${words.sites} · click to explore`;
        }
        tip.classList.add('on');
        tip.style.transform = `translate(${pointer.x + 16}px, ${pointer.y + 16}px)`;
      } else {
        tip.classList.remove('on');
      }
    } else {
      tip.classList.remove('on');
      if (stage === 'region' && hoverIndex !== 0 && flight === null && !dragging) {
        hoverIndex = 0;
        showRibbon(null);
      }
    }

    // A tick for each new thing under the pointer — a body, a dock item, a
    // country, a town in the list — and the stage for the hum under it all.
    const hovered =
      stage === 'system' || stage === 'planet'
        ? hoverBody
        : stage === 'region'
          ? hoverIndex > 0 ? `region:${hoverIndex}` : null
          : hotSite !== null ? `site:${hotSite.name}` : null;
    if (hovered !== lastHovered) {
      lastHovered = hovered;
      if (hovered !== null && chosen === null) deps.sound?.cue('hover');
    }
    if (stage !== heardStage && chosen === null) {
      heardStage = stage;
      deps.sound?.stage(stage);
    }
    deps.sound?.update();

    // While the globe is dragged at the site stage, say which country letting
    // go will choose.
    if (dragging && stage === 'site' && dragged > 4) {
      const box = renderer.domElement.getBoundingClientRect();
      const index = regionUnder(box.left + box.width / 2, box.top + box.height / 2);
      if (index > 0 && index !== regionIndex) {
        const text = `Let go to explore ${body.regions[index - 1]!.name}`;
        if (reticleLabel.textContent !== text) reticleLabel.textContent = text;
        reticle.classList.add('on');
      } else {
        reticle.classList.remove('on');
      }
    }

    layOutLabels();
    layOutPins();

    api.beforeRender?.(camera);
    draw(scene, camera);
  }

  /* --- the handedness checks ------------------------------------------- */

  /**
   * Two third parties, because a mirror is self-consistent and only something
   * not built from the same basis can see it.
   *
   * **The globe**: standing over Rome, project five real coordinates to the
   * screen, ray-cast each pixel back, and ask `geo.ts`'s point-in-polygon what
   * is there. East must be to the right and north up, and the names must come
   * back — the longitudes are the gazetteer's and the names are the outlines'.
   *
   * **The orrery**: the Sun this file's orrery placed, by Kepler and sidereal
   * time, against the sun `sun.ts` lights the land by, from NOAA's formulas.
   */
  function verify(): Record<string, unknown> {
    const held = copyPose(pose, makePose());
    applyPose(globePose(41.9, 12.5, orbitDistance(body.radius), makePose()));

    const box = renderer.domElement.getBoundingClientRect();
    const point = new THREE.Vector3();
    const probe = (name: string, lat: number, lon: number): { asked: string; x: number; y: number; reads: string } => {
      onSphere(lon, lat, point).multiplyScalar(body.radius + LAND_HEIGHT).add(body.centre).project(camera);
      const x = ((point.x + 1) / 2) * box.width;
      const y = ((1 - point.y) / 2) * box.height;
      const index = regionUnder(box.left + x, box.top + y);
      return { asked: name, x: Math.round(x), y: Math.round(y), reads: index > 0 ? body.regions[index - 1]!.name : 'open water' };
    };
    const west = probe('Madrid', 40.42, -3.7);
    const here = probe('Rome', 41.9, 12.5);
    const east = probe('Athens', 37.98, 23.73);
    const north = probe('Oslo', 59.91, 10.75);
    const south = probe('Tunis', 36.8, 10.18);

    // The ribbon's winding, measured off the built buffer after the shader's
    // own offset, since the four corners of a quad share two positions.
    let outward = Number.NaN;
    const first = body.regions.find((candidate) => candidate.rings.length > 0);
    if (first !== undefined) {
      const geometry = ribbons.get(first.key) ?? buildRibbon(body, first);
      ribbons.set(first.key, geometry);
      const p = geometry.getAttribute('position') as THREE.BufferAttribute;
      const a = geometry.getAttribute('aAcross') as THREE.BufferAttribute;
      const s = geometry.getAttribute('aSide') as THREE.BufferAttribute;
      const idx = geometry.getIndex()!;
      const corner = (at: number): THREE.Vector3 =>
        new THREE.Vector3().fromBufferAttribute(p, at).addScaledVector(new THREE.Vector3().fromBufferAttribute(a, at), s.getX(at));
      const v0 = corner(idx.getX(0));
      const v1 = corner(idx.getX(1));
      const v2 = corner(idx.getX(2));
      const normal = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize();
      outward = normal.dot(v0.clone().normalize());
    }

    const lon = 12.5 * DEG;
    const lat = 41.9 * DEG;
    const trueEast = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon));
    const trueNorth = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
    const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

    applyPose(held);
    const sun = deps.sunDirection?.();
    return {
      'screen right . east': Number(screenRight.dot(trueEast).toFixed(4)),
      'screen up . north': Number(screenUp.dot(trueNorth).toFixed(4)),
      'ribbon normal . up': Number(outward.toFixed(4)),
      'east is right': east.x > here.x && here.x > west.x,
      'north is up': north.y < south.y,
      probes: [west, here, east, north, south],
      orrery: sun === undefined ? 'no sun to compare with' : orrery.verify(sun),
    };
  }

  /* --- the handle ------------------------------------------------------- */

  const api: Menu = {
    root,
    camera,
    get stage() {
      return stage;
    },
    get body() {
      return body.id;
    },
    get flying() {
      return flight !== null;
    },
    beforeRender: null,
    choose() {
      if (chosen !== null) return Promise.resolve(chosen);
      choice ??= new Promise<MenuSpawn>((resolve) => {
        resolveChoice = resolve;
      });
      return choice;
    },
    progress(fraction, label) {
      progressFraction = clamp01(fraction);
      progressSub.textContent = label;
      progressFill.style.width = `${(progressFraction * 100).toFixed(0)}%`;
      if (chosen !== null) fillSelect();
    },
    ready() {
      built = true;
      progressFraction = 1;
      if (chosen !== null) fillSelect();
      refreshChrome();
    },
    depart() {
      // Always onto Earth: a spawn on any other body is that world's to land.
      setBody(home);
      const spawn = chosen ?? { body: body.id, region: '', name: fallback.name, lat: fallback.lat, lon: fallback.lon };
      root.classList.add('departing');
      tip.classList.remove('on');
      const to = divePose(spawn.lat, spawn.lon);
      const curtain = h('div', { class: 'atlas-curtain' });
      document.body.append(curtain);
      deps.sound?.stage(null);
      return new Promise<Curtain>((resolve) => {
        // With less motion asked for there is no dive at all: the curtain
        // closes over wherever the camera already is.
        let seconds = 0;
        if (calm.matches) {
          void curtain.offsetWidth;
          curtain.classList.add('on');
        } else {
          flyTo(to, () => {});
          seconds = flight!.duration / 1000;
          setTimeout(() => curtain.classList.add('on'), seconds * 1000 * 0.68);
        }
        setTimeout(() => {
          resolve({
            lift() {
              curtain.classList.add('lifting');
              curtain.classList.remove('on');
              setTimeout(() => curtain.remove(), 1000);
            },
          });
        }, seconds * 1000 * 0.68 + 420);
      });
    },
    verify,
    hold(on) {
      if (held === on) return;
      held = on;
      if (on) closeResults();
      refreshChrome();
    },
    suspend(on) {
      if (suspended === on) return;
      suspended = on;
      root.style.display = on ? 'none' : '';
      deps.sound?.stage(on ? null : stage);
      if (on) {
        running = false;
      } else if (!running) {
        running = true;
        previous = performance.now();
        resize();
        requestAnimationFrame(frame);
      }
    },
    toSystem() {
      if (stage !== 'system') backToSystem();
    },
    prepare() {
      // One at a time, each in a pause of its own, so the system keeps
      // turning smoothly under the title while the worlds are made.
      const queue = orrery.bodies.filter((entry) => entry.body.kind !== 'star' && !walkable.has(entry.body.id));
      const next = (): void => {
        const entry = queue.shift();
        if (entry === undefined || disposed) return;
        void bodyOf(entry).then(() => window.setTimeout(next, 120));
      };
      window.setTimeout(next, 300);
    },
    dispose() {
      disposed = true;
      for (const { globe } of globes) globe.dispose();
      globes.length = 0;
      running = false;
      events.abort();
      deps.sound?.dispose();
      scene.remove(ribbonGroup);
      scene.remove(overlayGroup);
      orrery.holdUpright(null);
      for (const geometry of ribbons.values()) geometry.dispose();
      ribbons.clear();
      inkRibbon.material.dispose();
      goldRibbon.material.dispose();
      orrery.dispose();
      root.remove();
      delete (globalThis as Record<string, unknown>)['atlasMenu'];
    },
  };

  refreshChrome();
  Object.assign(globalThis, { atlasMenu: api });
  requestAnimationFrame(frame);
  return api;
}
