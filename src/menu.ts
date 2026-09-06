/**
 * The front door: pick where you wake up, on the planet you are going to walk.
 *
 * **It is the real world and not a picture of one.** There is already a globe
 * built from the country outlines, a sun where the sun is, a cloud deck and a
 * sea, and the plane's whole design is that climbing high enough turns the world
 * into the map — from 2.47 radii the globe subtends 47.8 degrees of the 55
 * degree lens, which is the arithmetic the ceiling was chosen by. So this menu
 * builds *nothing*: it makes a camera, puts it where the plane's ceiling puts
 * one, and hands the same `scene` back to the same `outline.render` the game
 * loop uses. What it adds to the world is one geometry — a ribbon along the
 * hovered country's own rings — and one DOM overlay.
 *
 * The consequence worth stating up front is that **the menu costs nothing to
 * reach that the world was not already spending**. It is interactive the frame
 * after `buildLand` returns, which is four stages before `start()` finishes, and
 * everything after that stage arrives underneath a globe the player is already
 * turning. See `docs/traps.md` for the numbers.
 *
 * Three things it deliberately does not own:
 *
 * - **The screen basis.** `cartography.ts`'s `setFrame` is the one definition of
 *   a *map's* basis and the reason is three shipped mirror bugs. This is not a
 *   map: every point on the screen here is `Vector3.project(camera)` and every
 *   click is `Vector3.unproject(camera)`, so the basis is the camera's own
 *   `matrixWorld` and there is no second copy of it to disagree. `verify()`
 *   asserts it anyway, against a third party — see below.
 * - **The colour of the land.** `groundColorAt` in `globe.ts` is the one colour
 *   law; a highlight that tinted a country would be a second one. The hovered
 *   country gets a ribbon laid *over* its own rings instead, which is geometry
 *   this file owns and the land mesh has never heard of.
 * - **The pointer.** See `choose()`.
 */

import * as THREE from 'three';
import { type Country, type World, toLatLon } from './geo.ts';
import { LAND_HEIGHT, PLANET_RADIUS, onSphere } from './globe.ts';
import { isShown } from './places.ts';
import type { Place } from './places.ts';
import { LabelSpace, css, thinMarks } from './cartography.ts';
import { reliefAt } from './terrain.ts';
import { PALETTE } from './theme.ts';

const DEG = Math.PI / 180;
const R2D = 180 / Math.PI;

/* ------------------------------------------------------------------------- *
 * The body: the seam a planet step slots into
 * ------------------------------------------------------------------------- */

/**
 * One ring of one region, in the format the bake already stores.
 *
 * `points` is `[lon, lat]` pairs, implicitly closed, and `height` is how far the
 * land stands above the body's own sea level — which is `LandRing` in `geo.ts`
 * with the two fields this file reads and nothing else. The ribbon is built from
 * exactly the array the land mesh is triangulated from, so a highlight cannot
 * disagree with the coastline it is drawn on.
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
  /** One line under the name in the hover card. On Earth, the continent. */
  note: string;
  /** The bake's own label point, and the fallback spawn when it has no sites. */
  lat: number;
  lon: number;
  rings: MenuRing[];
}

/** A city, or whatever a body calls the thing you pick second. */
export interface MenuSite {
  name: string;
  /** Which region it belongs to; joins against `MenuRegion.key`. */
  key: string;
  lat: number;
  lon: number;
  /**
   * How much this site outranks its neighbours when the pins are thinned.
   * On Earth, population.
   */
  weight: number;
  capital?: boolean;
}

/**
 * A whole world you can spawn on.
 *
 * **This is the seam the solar system slots into and it is deliberately narrow.**
 * Nothing here mentions Earth, `World`, `Place` or `PLANET_RADIUS`; a body is a
 * radius, a centre, a relief field, a point-in-polygon and two lists. `earthBody`
 * below is the whole of the adapter for the planet that exists, and it is
 * eighteen lines — which is the measurement that says the interface is the right
 * width. Add a second entry to `bodies` and a stage appears in front of the
 * country stage; add nothing and it does not.
 */
export interface MenuBody {
  id: string;
  name: string;
  /** One line under the name on the body card. */
  note: string;
  /** Sea-level radius, in world units. */
  radius: number;
  /**
   * Where the body's centre sits in world space. Earth is the origin, and a
   * second planet is not, which is why this is here rather than assumed.
   */
  centre: THREE.Vector3;
  /** Height of the ground over `radius` at a point on the unit sphere. */
  relief(x: number, y: number, z: number): number;
  regions: readonly MenuRegion[];
  /** 1-based index into `regions`; 0 for open water or nothing at all. */
  regionAt(lat: number, lon: number): number;
  sites: readonly MenuSite[];
}

/** Where the player wakes up. */
export interface MenuSpawn {
  body: string;
  region: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * Earth, as a `MenuBody`.
 *
 * The one adapter that exists today, and the only place in this file that knows
 * what a `World` or a `Place` is. `world.rings` rather than `country.rings`
 * because the rings carry their own shelf height and the lakes carry a flag —
 * a lake is a ring the world reads as water, so it belongs to nobody and gets no
 * highlight.
 */
export function earthBody(world: World, places: readonly Place[]): MenuBody {
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
  const built = places.filter(isShown);
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
  };
}

/* ------------------------------------------------------------------------- *
 * What the menu is handed, and what it hands back
 * ------------------------------------------------------------------------- */

export interface MenuDeps {
  /**
   * Every world you can spawn on, in the order they are offered. One body and
   * the body stage never appears; two and it is the first thing you see.
   */
  bodies: readonly MenuBody[];
  /** The world's own scene. The menu adds one group to it and takes it away. */
  scene: THREE.Scene;
  /**
   * The world's own renderer. The menu sizes it, because `main.ts` does not
   * until the frame loop starts and a WebGL canvas defaults to 300x150.
   */
  renderer: THREE.WebGLRenderer;
  /**
   * **`outline.render`, not `renderer.render`.** A frame in this project is two
   * passes and drawing one of them is drawing half the world.
   */
  draw(scene: THREE.Scene, camera: THREE.Camera): void;
  /** Where `Play` goes when nothing is remembered. `main.ts`'s `START`. */
  fallback: { lat: number; lon: number; name: string };
}

export interface Menu {
  /** The overlay. The caller appends it; `dispose` removes it. */
  root: HTMLElement;
  /**
   * The menu's own camera. Its own, because `rig.camera` does not exist until
   * `main.ts` has a player to build the rig around, and a menu that waited for
   * one would be waiting for the whole world. Exposed so a review sheet can
   * project a known coordinate and ask what is under that pixel.
   */
  camera: THREE.PerspectiveCamera;
  /**
   * Which of the three stages is up: the world, the country, or the town.
   *
   * Exposed for one reason and it is worth saying which, because a stage is
   * otherwise this file's private business. **The cloud deck is between the
   * camera and the country at the town stage.** The menu is the real planet
   * with the real weather on it and that is most of why it is worth looking at
   * — but at the town stage it stops being a view and becomes a list you click,
   * and a cell of stratus over eastern Spain then hides Valencia. So `main.ts`
   * takes the deck off for that one stage and puts it straight back, which is
   * one property on a group this file has never heard of and could not own.
   */
  readonly stage: Stage;
  /**
   * The sky, the sea and the weather, which this file does not own. Assign it
   * once the objects that need updating exist — the menu draws with whatever is
   * in the scene until then, which on the first frames is a still sun over a
   * finished globe and is exactly right.
   */
  beforeRender: ((camera: THREE.PerspectiveCamera) => void) | null;
  /** Resolves with where the player wakes up. Safe to await more than once. */
  choose(): Promise<MenuSpawn>;
  /** Say the world has finished building, so `Play` can stop apologising. */
  ready(): void;
  /**
   * The handedness check, and it is a *third party* — see the comment on it.
   * Left on `globalThis.atlasMenu` while the menu is up.
   */
  verify(): Record<string, unknown>;
  dispose(): void;
}

/* ------------------------------------------------------------------------- *
 * Constants, and where each of them comes from
 * ------------------------------------------------------------------------- */

/** The rig's own lens, so the menu and the game frame the planet identically. */
const FOV = 55;

/**
 * How much of the vertical frame the globe fills at the body stage.
 *
 * Not taste: `CLAUDE.md` records the plane's ceiling as the altitude where the
 * globe subtends 47.8 degrees of a 55 degree lens, which is 0.869 of the frame.
 * The distance falls out of it — `radius / sin(fill * fov / 2)` is 2.47 radii —
 * so the menu's opening shot is the view the whole travel model was built
 * around rather than a number chosen here.
 */
const GLOBE_FILL = 0.87;

/**
 * The same, for a country, and it is looser than the globe's for two reasons
 * that pull the same way: a country is not a disc, so its bounding cap is
 * bigger than the shape inside it; and the thing you are about to pick is a
 * town on its edge as often as one in its middle. Measured over Spain at 0.72
 * the mainland came out 559 px of an 1,884-wide frame with a third of the
 * screen on the Atlantic; 0.8 is the same shot with less sea in it.
 */
const REGION_FILL = 0.8;

/**
 * The angular half-width of a region's bounding cap is clamped here.
 *
 * Russia spans 170 degrees of longitude and France owns islands in three
 * oceans. Past about a quarter of the sphere the cap stops describing a shape
 * and starts describing a scatter, and framing the scatter frames the planet.
 * The fix is not this clamp — it is that the framing uses the region's
 * **largest ring** and not all of them, so France is metropolitan France and the
 * United States is the contiguous forty-eight. The clamp is what catches
 * Antarctica, whose largest ring genuinely is a quarter of the world.
 */
const MAX_CAP = 42 * DEG;

/** Nobody is picking a city from lower than this, and the fog would eat it. */
const MIN_ALTITUDE = 420;

/** Latitude is clamped here so the camera's up vector never degenerates. */
const MAX_LAT = 88;

/** Seconds for a programmed move: the flight down to a country, and back up. */
const FLIGHT_S = 1.15;

/** Time constant of the drag's chase. A tenth of a second reads as direct. */
const DRAG_LAG = 0.1;

/** Ink and gold, in pixels of a 1080-tall frame. The gold rides inside the ink. */
const RIBBON_INK = 5.4;
const RIBBON_GOLD = 2.6;

/**
 * The ribbon floats this far over the shelf it is drawn on.
 *
 * It is an overlay and not terrain, so it is lifted deliberately rather than
 * fitted. `elevationAt` is the exact ground and costs a point-in-polygon at 3.6
 * microseconds — 29 ms for a country the size of Russia, which is a visible
 * hitch on a *hover* — so the ribbon rides `ring.height + reliefAt` instead, at
 * 0.4 microseconds, and that misses the shore ramp by up to `LAND_HEIGHT`. Three
 * avatars of float is a sub-pixel offset from orbit and reads as a map overlay
 * close up, where a ribbon that sank into the coast would read as a bug.
 */
const RIBBON_LIFT = 12;

/** Pixels between two city pins, and the most that ever stand at once. */
const PIN_SPACING = 56;
const MAX_PINS = 48;

/** Where the last spawn is remembered. Versioned so a format change is not a bug. */
const REMEMBERED = 'atlas.menu.spawn.v1';

const FONT = 'ui-rounded, "SF Pro Rounded", "Segoe UI", ui-sans-serif, system-ui, sans-serif';

/* ------------------------------------------------------------------------- *
 * localStorage, wrapped
 * ------------------------------------------------------------------------- */

/**
 * A private window is a worse session, not a broken one — `placement.ts`'s rule
 * for the visited set, and the same three lines.
 */
function remember(spawn: MenuSpawn): void {
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify(spawn));
  } catch {
    /* Safari in a private window throws on every write. Nothing here is worth an
       error path: the menu simply forgets between sessions. */
  }
}

function recall(): MenuSpawn | null {
  try {
    const raw = localStorage.getItem(REMEMBERED);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<MenuSpawn>;
    if (typeof value.lat !== 'number' || typeof value.lon !== 'number') return null;
    if (!Number.isFinite(value.lat) || !Number.isFinite(value.lon)) return null;
    return {
      body: String(value.body ?? 'earth'),
      region: String(value.region ?? ''),
      name: String(value.name ?? 'somewhere'),
      lat: value.lat,
      lon: value.lon,
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
 * in the vertex shader.
 *
 * The width has to be screen space or the highlight is a hairline from orbit and
 * a motorway from a thousand units up — a factor of thirty between the two ends
 * of one flight. Rebuilding the geometry per frame is not affordable (Russia is
 * about eight thousand segments) and rebuilding it per distance band is a cache
 * keyed on two things, so the offset is an attribute and the width is a uniform:
 * one geometry per region for the session, one number per frame.
 *
 * **The winding is the trap this world has met four times.** With `along` the
 * segment direction and `up` the outward radius, `across = along x up` is the
 * one order for which `across x along = up`, so the quad faces away from the
 * planet's centre. The other order gives `-up`, which under `FrontSide` renders
 * as a single thin line on the horizon and nothing else. Asserted below rather
 * than argued.
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
    return target.multiplyScalar(lift).add(body.centre);
  };

  let vertex = 0;
  let element = 0;
  for (const ring of region.rings) {
    const points = ring.points;
    for (let i = 0; i < points.length; i++) {
      const from = points[i]!;
      // The rings are open — none of them repeats its start — so the closing
      // segment has to be walked too. `geo.ts` says so and `map.ts` relies on it.
      const to = points[(i + 1) % points.length]!;
      seat(from[0]!, from[1]!, ring.height, a);
      seat(to[0]!, to[1]!, ring.height, b);
      along.subVectors(b, a);
      const span = along.length();
      if (span < 1e-6) continue;
      along.divideScalar(span);
      up.copy(a).sub(body.centre).normalize();
      // `along x up`, and not the other order. See the comment above.
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
      // **The order is (0, 2, 1) and (0, 3, 2), and the obvious one is wrong.**
      // The corners are `(-a, -b, +b, +a)` in `across`, so walking them round
      // gives `cross(along, across)`, which with `across = along x up` is
      // **minus up** — the quad faces the centre of the planet, which under
      // `FrontSide` is the single thin line on the horizon this project has met
      // three times. `DoubleSide` renders it either way and is exactly why
      // nothing on the screen could say so; `verify()` measures the normal off
      // the built buffer instead, and read -1 before this line was reversed.
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
 * The material for one ribbon.
 *
 * `MeshBasicMaterial`, because a highlight that went dark on the night side
 * would be a highlight you could not use at 3 a.m. local. No normal attribute
 * and `outlineParameters.visible = false`, which together mean `OutlineEffect`
 * leaves it out of the ink pass entirely — the only thing "no outline" can mean
 * for a mesh with no hull to invert, and the difference between drawing it once
 * and drawing it twice.
 */
function ribbonMaterial(color: number, order: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    // **`FrontSide`, and the winding above is what makes that safe.** The first
    // build used `DoubleSide` — which renders correctly whichever way the quads
    // are wound, and is exactly why nothing on the screen could say the winding
    // was inside out; `verify()` read the normal as **-1** while the ribbon
    // looked perfect. It also costs double: since r163 the renderer draws a
    // transparent `DoubleSide` material in two passes, back faces then front,
    // so Romania's ribbon measured **+4 draw calls and +2,184 triangles for
    // 1,092 triangles of geometry**. One side is half of that and it fails
    // loudly — a reversed ribbon simply is not there.
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
 * The stylesheet, in the card language `index.html` and `map.ts` already speak
 * ------------------------------------------------------------------------- */

const ink = css(PALETTE.ink);
const white = css(PALETTE.white);
const gold = css(PALETTE.gold);
const crimson = css(PALETTE.crimson);

const STYLE = `
.atlas-menu {
  position: fixed;
  inset: 0;
  z-index: 9;
  font-family: ${FONT};
  color: ${ink};
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  overflow: hidden;
}
.atlas-menu.dragging { cursor: grabbing; }
.atlas-menu.gone { display: none; }
.atlas-menu .card {
  position: absolute;
  background: ${white};
  border: 3px solid ${ink};
  border-radius: 12px;
  box-shadow: 0 5px 0 ${ink};
}
.atlas-menu-head {
  top: 22px;
  left: 24px;
  padding: 11px 18px 12px;
  pointer-events: none;
  max-width: 320px;
}
.atlas-menu-title {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
}
.atlas-menu-sub {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
}
.atlas-menu-foot {
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 9px 12px 9px 18px;
  display: flex;
  align-items: center;
  gap: 16px;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
}
.atlas-menu-foot kbd {
  font: inherit;
  font-weight: 800;
  background: rgba(30, 6, 3, 0.1);
  border-radius: 5px;
  padding: 2px 6px;
}
.atlas-menu-hints { display: flex; gap: 16px; }
.atlas-menu-hints span.off { opacity: 0.3; }
.atlas-menu-play {
  font: inherit;
  font-weight: 800;
  font-size: 13px;
  color: ${ink};
  background: ${gold};
  border: 3px solid ${ink};
  border-radius: 9px;
  box-shadow: 0 3px 0 ${ink};
  padding: 6px 14px;
  cursor: pointer;
  transition: transform 0.08s, box-shadow 0.08s;
}
.atlas-menu-play:hover { transform: translateY(-1px); box-shadow: 0 4px 0 ${ink}; }
.atlas-menu-play:active { transform: translateY(3px); box-shadow: 0 0 0 ${ink}; }
.atlas-menu-play .quiet { font-weight: 600; opacity: 0.6; }

/* The hover card rides the cursor, so it must never be under it. */
.atlas-menu-tip {
  display: none;
  padding: 8px 14px 9px;
  transform: translate(14px, 14px);
  pointer-events: none;
  max-width: 260px;
}
.atlas-menu-tip.on { display: block; }
.atlas-menu-tip-name {
  font-size: 14.5px;
  font-weight: 800;
  letter-spacing: -0.012em;
  line-height: 1.15;
}
.atlas-menu-tip-sub {
  margin-top: 1px;
  font-size: 11.5px;
  font-weight: 600;
  opacity: 0.6;
}

.atlas-menu-pins { position: absolute; inset: 0; pointer-events: none; }
.atlas-menu-pin {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: ${ink};
  background: ${white};
  border: 2.5px solid ${ink};
  border-radius: 9px;
  box-shadow: 0 3px 0 ${ink};
  padding: 4px 10px 4px 7px;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  /* Colour and lift only. Transitioning the transform makes every pin lag the
     globe by 80 ms while you drag it, which reads as the towns sliding about on
     the ground -- and it is what made a recycled element visibly slide from one
     city to another before the pool was keyed on the town. */
  transition: box-shadow 0.08s, background 0.08s;
}
.atlas-menu-pin i {
  width: 8px;
  height: 8px;
  border: 2px solid ${ink};
  border-radius: 50%;
  background: ${white};
}
.atlas-menu-pin.capital i { background: ${gold}; }
.atlas-menu-pin:hover { background: ${gold}; box-shadow: 0 4px 0 ${ink}; }
/* A pin whose name lost the collision is a *dot on a map*, not a card with the
   writing rubbed off, and the difference is the whole of a bug this shipped:
   the card chrome stayed, so a town with no room for its name rendered as an
   empty white pill with a ring in it and read as a label that had failed. It
   loses the card and keeps the ring, and hovering it gets the name back at
   once — which is also why the label lives in the same element as the dot. */
.atlas-menu-pin.away {
  padding: 4px 7px;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
.atlas-menu-pin.away span { display: none; }
.atlas-menu-pin.away:hover {
  background: ${gold};
  border-color: ${ink};
  box-shadow: 0 3px 0 ${ink};
  padding: 4px 10px 4px 7px;
  z-index: 1;
}
.atlas-menu-pin.away:hover span { display: inline; }

.atlas-menu-cards {
  position: absolute;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  display: flex;
  gap: 14px;
}
.atlas-menu-body {
  position: static;
  font: inherit;
  color: ${ink};
  padding: 14px 20px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.08s, box-shadow 0.08s;
}
.atlas-menu-body:hover { transform: translateY(-2px); box-shadow: 0 7px 0 ${ink}; }
.atlas-menu-body b { display: block; font-size: 17px; font-weight: 800; }
.atlas-menu-body span { font-size: 11.5px; font-weight: 600; opacity: 0.6; }

.atlas-menu-note {
  bottom: 24px;
  right: 24px;
  padding: 7px 14px;
  font-size: 11.5px;
  font-weight: 700;
  pointer-events: none;
  background: ${crimson};
  color: ${white};
  border-color: ${ink};
}
.atlas-menu-note[hidden] { display: none; }
`;

/* ------------------------------------------------------------------------- *
 * The menu
 * ------------------------------------------------------------------------- */

type Stage = 'body' | 'region' | 'site';

export function createMenu(deps: MenuDeps): Menu {
  const { bodies, scene, renderer, draw, fallback } = deps;
  if (bodies.length === 0) throw new Error('createMenu: no bodies to spawn on');

  /* --- the DOM ---------------------------------------------------------- */

  const root = document.createElement('div');
  root.className = 'atlas-menu';
  const style = document.createElement('style');
  style.textContent = STYLE;

  const head = document.createElement('div');
  head.className = 'atlas-menu-head card';
  const title = document.createElement('div');
  title.className = 'atlas-menu-title';
  const sub = document.createElement('div');
  sub.className = 'atlas-menu-sub';
  head.append(title, sub);

  const tip = document.createElement('div');
  tip.className = 'atlas-menu-tip card';
  const tipName = document.createElement('div');
  tipName.className = 'atlas-menu-tip-name';
  const tipSub = document.createElement('div');
  tipSub.className = 'atlas-menu-tip-sub';
  tip.append(tipName, tipSub);

  const pinLayer = document.createElement('div');
  pinLayer.className = 'atlas-menu-pins';

  const cards = document.createElement('div');
  cards.className = 'atlas-menu-cards';

  const foot = document.createElement('div');
  foot.className = 'atlas-menu-foot card';
  const hints = document.createElement('div');
  hints.className = 'atlas-menu-hints';
  const play = document.createElement('button');
  play.className = 'atlas-menu-play';
  foot.append(hints, play);

  const note = document.createElement('div');
  note.className = 'atlas-menu-note card';
  note.hidden = true;

  root.append(style, cards, pinLayer, head, tip, foot, note);

  /* --- the camera -------------------------------------------------------- */

  // Its own camera, not `rig.camera`: the rig does not exist until `main.ts`
  // has a player to build it around, and a menu that had to wait for one would
  // be waiting for the whole world.
  const camera = new THREE.PerspectiveCamera(FOV, 1, 5, PLANET_RADIUS * 10);

  let body = bodies[0]!;
  let stage: Stage = bodies.length > 1 ? 'body' : 'region';
  let region: MenuRegion | null = null;
  let regionIndex = 0;

  /** Where the camera is, and where it is going. Degrees and world units. */
  const view = { lat: 20, lon: 6, dist: body.radius * 2.6 };
  const want = { lat: 20, lon: 6, dist: 0 };
  /** A programmed move, or null while the camera is following the drag. */
  let flight: { from: typeof view; to: typeof view; began: number } | null = null;

  const orbitDistance = (radius: number): number => radius / Math.sin(GLOBE_FILL * FOV * DEG * 0.5);
  want.dist = orbitDistance(body.radius);
  // The opening shot arrives rather than appearing: a second and a half from
  // half again as far out, on the same tween the country flight uses. It is a
  // flight and not the drag's chase because the chase is a tenth of a second —
  // right for a hand on a mouse and invisible as an arrival.
  view.dist = want.dist * 1.55;

  const eye = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const scratchB = new THREE.Vector3();

  /** Where the camera is, as a point on the unit sphere about the body. */
  function place(): void {
    onSphere(view.lon, view.lat, eye).multiplyScalar(view.dist).add(body.centre);
    camera.position.copy(eye);
    camera.up.set(0, 1, 0);
    camera.lookAt(body.centre);
    camera.updateMatrixWorld();
  }

  /**
   * Pixels per world unit at a given distance from the camera.
   *
   * The lens the whole project prices things with — `937 * size / distance` at
   * a 775-pixel frame — written once, from the frame that is actually up.
   */
  function pixelsPerUnit(distance: number): number {
    return renderer.domElement.clientHeight / 2 / (distance * Math.tan(FOV * DEG * 0.5));
  }

  /* --- the ribbon -------------------------------------------------------- */

  const group = new THREE.Group();
  group.name = 'menu-highlight';
  group.renderOrder = 900;
  const inkRibbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial(PALETTE.ink, 0));
  const goldRibbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial(PALETTE.gold, 1));
  inkRibbon.renderOrder = 901;
  goldRibbon.renderOrder = 902;
  inkRibbon.frustumCulled = false;
  goldRibbon.frustumCulled = false;
  group.add(inkRibbon, goldRibbon);
  group.visible = false;
  scene.add(group);

  /** One geometry per region for the session; a hover is a swap, not a build. */
  const ribbons = new Map<string, THREE.BufferGeometry>();
  let shown: MenuRegion | null = null;

  function showRibbon(next: MenuRegion | null): void {
    if (next === shown) return;
    shown = next;
    group.visible = next !== null;
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
    // The ribbon should be the same weight on the screen at every altitude, so
    // the width is priced against the distance to the ground under the camera
    // rather than against the camera's own height above the centre.
    const scale = 1 / Math.max(1e-6, pixelsPerUnit(Math.max(1, view.dist - body.radius)));
    const frame = renderer.domElement.clientHeight / 1080;
    for (const mesh of [inkRibbon, goldRibbon]) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const uniforms = material.userData.uniforms as { uWidth?: { value: number } } | undefined;
      if (uniforms?.uWidth === undefined) continue;
      const pixels = material.userData.order === 0 ? RIBBON_INK : RIBBON_GOLD;
      uniforms.uWidth.value = pixels * frame * scale * 0.5;
    }
  }

  /* --- picking ----------------------------------------------------------- */

  const ray = new THREE.Ray();

  /**
   * Where a screen point lands on the body, or null for a click on the sky.
   *
   * One ray-sphere intersection and then one `regionAt`, which on Earth is
   * `geo.ts`'s exact point-in-polygon over a spatial grid at about two
   * microseconds. Nothing is rasterised and nothing is approximate: the country
   * this returns is the country the player's feet will report standing there.
   */
  function pointAt(clientX: number, clientY: number): { lat: number; lon: number } | null {
    const box = renderer.domElement.getBoundingClientRect();
    scratch.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1, 0.5);
    scratch.unproject(camera);
    ray.origin.copy(camera.position);
    ray.direction.copy(scratch).sub(camera.position).normalize();
    // The surface, not sea level: the land stands `LAND_HEIGHT` proud and the
    // difference is 0.07% of the radius, which is under a pixel from anywhere.
    const hit = ray.intersectSphere(
      new THREE.Sphere(body.centre, body.radius + LAND_HEIGHT),
      scratchB,
    );
    if (hit === null) return null;
    return toLatLon(scratchB.clone().sub(body.centre));
  }

  /* --- the cities -------------------------------------------------------- */

  /**
   * **A pin belongs to a town, not to a slot, and the slot version was
   * measured wrong on the screen.** The first build recycled a pool of
   * elements in whatever order `thinMarks` kept them, so an element carrying
   * *Lyon* this frame carried *Toulouse* the next — and with a `transform`
   * transition on the class, the label visibly slid three hundred pixels
   * across France. Keying the pool on the site's own index fixes it at the
   * source: an element keeps its town for as long as the town is on the
   * screen, and the transition has nothing to animate between.
   */
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

  function loadSites(next: MenuRegion): void {
    // Sorted once, here, and not per frame. `cartography.ts`'s `sortByDepth` is
    // an insertion sort — right for the 77 landmarks a map draws and wrong for
    // the 1,500 towns a large country has — and the order never changes anyway,
    // because population does not depend on where the camera is.
    sites = body.sites.filter((site) => site.key === next.key).sort((a, b) => b.weight - a.weight);
    // A country with no town in the gazetteer still has to be spawnable. Its own
    // label point is on land by construction: it is what the bake writes.
    if (sites.length === 0) {
      sites = [{ name: next.name, key: next.key, lat: next.lat, lon: next.lon, weight: 0 }];
    }
    unitOf = sites.map((site) => onSphere(site.lon, site.lat, new THREE.Vector3()));
    projX = new Float32Array(sites.length);
    projY = new Float32Array(sites.length);
    order = new Int32Array(sites.length);
    kept = new Int32Array(sites.length);
    keptX = new Float32Array(sites.length);
    keptY = new Float32Array(sites.length);

    releasePins();
  }

  /** Hand every standing pin back to the pool. */
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
    const element = document.createElement('button');
    element.className = 'atlas-menu-pin';
    element.append(document.createElement('i'), document.createElement('span'));
    pinLayer.append(element);
    return element;
  }

  /**
   * Lay the pins out for this frame.
   *
   * **Thinned largest-first, which is the opposite of every other pin in this
   * project and is the same rule.** `minimap.ts` thins closest-first so that the
   * survivor of a cluster is the one you would actually walk to; here you are
   * not walking anywhere yet, so the survivor of a cluster is the one you have
   * heard of. Same `thinMarks`, different order handed to it.
   */
  function layOutPins(): void {
    if (stage !== 'site' || sites.length === 0) {
      releasePins();
      return;
    }
    const box = renderer.domElement.getBoundingClientRect();
    // A point on the sphere is over the horizon when its own direction and the
    // camera's agree by more than the ratio of the radius to the distance. It is
    // the only culling test here: the frustum's own is `project` landing outside
    // [-1, 1], which is checked below.
    const cosHorizon = body.radius / view.dist;
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
    const space = new LabelSpace();
    // Whatever is standing and did not survive this frame goes back to the pool
    // first, so a town that left the screen releases its element to the town
    // that arrived.
    for (const [at, element] of shownPins) {
      let survives = false;
      for (let i = 0; i < n; i++) {
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
    for (let i = 0; i < n; i++) {
      const at = kept[i]!;
      const site = sites[at]!;
      let element = shownPins.get(at);
      if (element === undefined) {
        element = takePin();
        shownPins.set(at, element);
        element.querySelector('span')!.textContent = site.name;
        // A pin whose label loses the collision is a bare dot, and a bare dot
        // with no way to find out what it is would be a worse mark than none.
        // The browser's own tooltip costs nothing and needs no second card.
        element.title = site.name;
        element.style.display = '';
      }
      const x = keptX[i]!;
      const y = keptY[i]!;
      // The label is dropped rather than the pin when two names collide, which
      // is what `LabelSpace` is for and why the dot and the word are one element
      // with a class on it instead of two.
      const width = 26 + site.name.length * 7.3;
      const away = !space.fits(x - 8, y - 12, width, 24);
      if (!away) space.claim(x - 8, y - 12, width, 24);
      element.className = `atlas-menu-pin${site.capital === true ? ' capital' : ''}${away ? ' away' : ''}`;
      element.style.transform = `translate(${(x - 9).toFixed(1)}px, ${(y - 13).toFixed(1)}px)`;
    }
  }

  /* --- the stages -------------------------------------------------------- */

  let resolveChoice: ((spawn: MenuSpawn) => void) | null = null;
  let chosen: MenuSpawn | null = null;

  const last = recall();

  function refreshChrome(): void {
    if (stage === 'body') {
      title.textContent = 'atlas';
      sub.textContent = 'choose a world';
    } else if (stage === 'region') {
      title.textContent = body.name;
      sub.textContent = 'drag to turn · click a country';
    } else {
      title.textContent = region?.name ?? body.name;
      sub.textContent = 'click a town to wake up there';
    }
    hints.replaceChildren();
    const hint = (html: string, off = false): void => {
      const span = document.createElement('span');
      span.innerHTML = html;
      if (off) span.className = 'off';
      hints.append(span);
    };
    hint('drag to turn');
    hint('<kbd>Esc</kbd> back', stage !== 'site');
    cards.style.display = stage === 'body' ? 'flex' : 'none';
    pinLayer.style.display = stage === 'site' ? '' : 'none';
  }

  function chooseRegion(index: number): void {
    if (index <= 0 || index > body.regions.length) return;
    regionIndex = index;
    region = body.regions[index - 1]!;
    stage = 'site';
    showRibbon(region);
    loadSites(region);
    // Frame the region's **largest ring** and not all of them. France owns
    // islands in three oceans and the United States owns Alaska; a cap that
    // covered them would frame the planet. The camera keeps orbiting from here,
    // so the far pieces are a drag away rather than gone.
    let best: MenuRing | null = null;
    let bestSpan = -1;
    for (const ring of region.rings) {
      if (ring.points.length > bestSpan) {
        bestSpan = ring.points.length;
        best = ring;
      }
    }
    const centre = new THREE.Vector3();
    const point = new THREE.Vector3();
    const ringPoints = best?.points ?? [[region.lon, region.lat]];
    for (const p of ringPoints) centre.add(onSphere(p[0]!, p[1]!, point));
    if (centre.lengthSq() < 1e-9) onSphere(region.lon, region.lat, centre);
    centre.normalize();
    let cap = 0;
    for (const p of ringPoints) {
      const dot = onSphere(p[0]!, p[1]!, point).dot(centre);
      cap = Math.max(cap, Math.acos(Math.min(1, Math.max(-1, dot))));
    }
    cap = Math.min(MAX_CAP, Math.max(0.35 * DEG, cap));
    // A cap of half-angle `cap` seen from `d` along its own axis subtends
    // `atan(R sin cap / (d - R cos cap))`. Setting that to the fill's share of
    // the half-lens and solving for `d` is the whole framing.
    const target = Math.tan(REGION_FILL * FOV * DEG * 0.5);
    const distance = body.radius * Math.cos(cap) + (body.radius * Math.sin(cap)) / target;
    const here = toLatLon(centre);
    flyTo(here.lat, here.lon, Math.max(body.radius + MIN_ALTITUDE, distance));
    refreshChrome();
  }

  function backToRegions(): void {
    if (stage !== 'site') return;
    stage = 'region';
    region = null;
    regionIndex = 0;
    releasePins();
    sites = [];
    showRibbon(null);
    flyTo(view.lat, view.lon, orbitDistance(body.radius));
    refreshChrome();
  }

  function flyTo(lat: number, lon: number, dist: number): void {
    want.lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
    want.lon = lon;
    want.dist = dist;
    flight = { from: { ...view }, to: { ...want }, began: performance.now() };
  }

  function finish(spawn: MenuSpawn): void {
    if (chosen !== null) return;
    chosen = spawn;
    remember(spawn);
    resolveChoice?.(spawn);
  }

  function refreshPlay(): void {
    const target = last ?? { name: fallback.name };
    play.innerHTML = `Play <span class="quiet">${target.name}</span>`;
  }
  refreshPlay();

  /* --- input ------------------------------------------------------------- */

  const events = new AbortController();
  const { signal } = events;

  let dragging = false;
  let dragged = 0;
  let lastX = 0;
  let lastY = 0;
  let pointer = { x: -1, y: -1 };

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button') !== null) return;
    dragging = true;
    dragged = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    root.classList.add('dragging');
    // A synthetic pointer has no capture to take and throws rather than
    // declining, which is a broken menu in a test harness for a nicety.
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      /* not a real pointer */
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
    // **The drag is 1:1 with the ground under the middle of the frame.** One
    // degree of camera rotation moves the sub-point by `radius * pi / 180`
    // world units, and `pixelsPerUnit` says what that is on this screen at this
    // altitude, so the same gesture turns the planet by the same distance at
    // every zoom rather than by the same angle. It is right at the centre and
    // foreshortened at the limb, which is what a turntable does and what a
    // trackball would fix by letting the north pole roll off the top.
    const perDegree = pixelsPerUnit(Math.max(1, view.dist - body.radius)) * body.radius * DEG;
    // Dragging right moves the ground right, which is east, which means the
    // camera goes **west**. Dragging down moves the ground down, so the camera
    // goes north. Both signs are checked by `verify()` against `regionAt`,
    // which is the only witness that is not built out of this basis.
    want.lon -= dx / perDegree;
    want.lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, want.lat + dy / perDegree));
    flight = null;
  }, { signal });

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('dragging');
    try {
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    } catch {
      /* see `pointerdown` */
    }
    // A drag that moved is a drag; a drag that did not is a click. Four pixels
    // is a hand resting on a mouse button, not an attempt to turn the world.
    if (dragged > 4) return;
    if (stage !== 'region') return;
    const at = pointAt(event.clientX, event.clientY);
    if (at === null) return;
    chooseRegion(body.regionAt(at.lat, at.lon));
  };
  root.addEventListener('pointerup', endDrag, { signal });
  root.addEventListener('pointercancel', endDrag, { signal });
  root.addEventListener('pointerleave', () => {
    pointer = { x: -1, y: -1 };
  }, { signal });

  // The wheel is not the way in — the two stages are — but a globe that ignores
  // it feels broken, so it nudges the distance inside the band the stage is in.
  root.addEventListener('wheel', (event) => {
    event.preventDefault();
    const floor = stage === 'site' ? body.radius + MIN_ALTITUDE : orbitDistance(body.radius) * 0.55;
    const ceiling = orbitDistance(body.radius) * 1.5;
    want.dist = Math.max(floor, Math.min(ceiling, want.dist * (1 + Math.sign(event.deltaY) * 0.12)));
    flight = null;
  }, { signal, passive: false });

  pinLayer.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    if (button === null) return;
    if (region === null) return;
    let site: MenuSite | undefined;
    for (const [at, element] of shownPins) {
      if (element === button) site = sites[at];
    }
    if (site === undefined) return;
    finish({ body: body.id, region: region.name, name: site.name, lat: site.lat, lon: site.lon });
  }, { signal });

  play.addEventListener('click', () => {
    finish(last ?? { body: body.id, region: '', name: fallback.name, lat: fallback.lat, lon: fallback.lon });
  }, { signal });

  addEventListener('keydown', (event) => {
    if (chosen !== null) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      backToRegions();
    } else if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      play.click();
    }
  }, { signal });

  function resize(): void {
    const width = innerWidth;
    const height = innerHeight;
    // `main.ts` does not size the renderer until the frame loop starts, and a
    // WebGL canvas defaults to 300x150. The menu is on the screen four stages
    // before that, so it sizes its own presentation.
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize, { signal });
  resize();

  /* --- the body stage ---------------------------------------------------- */

  function buildBodyCards(): void {
    cards.replaceChildren();
    for (const candidate of bodies) {
      const card = document.createElement('button');
      card.className = 'card atlas-menu-body';
      const name = document.createElement('b');
      name.textContent = candidate.name;
      const line = document.createElement('span');
      line.textContent = candidate.note;
      card.append(name, line);
      card.addEventListener('click', () => {
        body = candidate;
        stage = 'region';
        showRibbon(null);
        ribbons.clear();
        flyTo(view.lat, view.lon, orbitDistance(body.radius));
        refreshChrome();
      }, { signal });
      cards.append(card);
    }
  }
  if (bodies.length > 1) buildBodyCards();
  refreshChrome();
  flight = { from: { ...view }, to: { ...want }, began: performance.now() + 250 };

  /* --- the loading card, taken over ------------------------------------- */

  // `index.html`'s loading card is a full-screen cover, so it has to go the
  // moment the globe is worth looking at — and its stage text is the only
  // report the build makes, so the menu reads it rather than asking `main.ts`
  // to publish a second one. A string compare a frame is cheaper than a
  // `MutationObserver` and has nothing to clean up.
  const loading = document.getElementById('loading');
  const loadingStage = document.getElementById('loading-stage');
  const hidden: HTMLElement[] = [];
  for (const id of ['loading', 'hud', 'hint']) {
    const element = document.getElementById(id);
    if (element !== null && element.style.display !== 'none') {
      element.style.display = 'none';
      hidden.push(element);
    }
  }
  void loading;
  let built = false;
  let lastStageText = '';

  function refreshNote(): void {
    if (built) {
      note.hidden = true;
      return;
    }
    const text = loadingStage?.textContent ?? '';
    if (text === lastStageText) return;
    lastStageText = text;
    note.hidden = false;
    note.textContent = `building the world · ${text}`;
  }

  /* --- the loop ---------------------------------------------------------- */

  let running = true;
  let previous = performance.now();
  const api: Menu = {
    root,
    camera,
    get stage() {
      return stage;
    },
    beforeRender: null,
    choose() {
      if (chosen !== null) return Promise.resolve(chosen);
      return new Promise<MenuSpawn>((resolve) => {
        resolveChoice = resolve;
      });
    },
    ready() {
      built = true;
      refreshNote();
    },
    verify,
    dispose() {
      running = false;
      events.abort();
      scene.remove(group);
      for (const geometry of ribbons.values()) geometry.dispose();
      ribbons.clear();
      inkRibbon.material.dispose();
      goldRibbon.material.dispose();
      root.remove();
      for (const element of hidden) element.style.display = '';
      delete (globalThis as Record<string, unknown>)['atlasMenu'];
    },
  };

  function frame(now: number): void {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;

    if (flight !== null) {
      // Clamped at both ends: the opening flight is dated a quarter of a second
      // into the future so the first frame is a held shot rather than a jump.
      const t = Math.max(0, Math.min(1, (now - flight.began) / 1000 / FLIGHT_S));
      const k = t * t * (3 - 2 * t);
      // The direction is slerped and the distance is not: a great circle is the
      // honest path between two points on a sphere and interpolating latitude
      // and longitude separately walks a rhumb line, which crosses the Atlantic
      // sideways on the way from Norway to Chile.
      const from = onSphere(flight.from.lon, flight.from.lat, scratch);
      const to = onSphere(flight.to.lon, flight.to.lat, scratchB);
      const angle = Math.acos(Math.min(1, Math.max(-1, from.dot(to))));
      if (angle > 1e-4) {
        const s = Math.sin(angle);
        scratch.multiplyScalar(Math.sin((1 - k) * angle) / s).addScaledVector(scratchB, Math.sin(k * angle) / s);
      }
      const here = toLatLon(scratch);
      view.lat = here.lat;
      view.lon = here.lon;
      view.dist = flight.from.dist + (flight.to.dist - flight.from.dist) * k;
      if (t >= 1) {
        want.lat = view.lat;
        want.lon = view.lon;
        want.dist = view.dist;
        flight = null;
      }
    } else {
      // An exponential chase, framed as a time constant rather than a per-frame
      // fraction so it does not change with the frame rate.
      const chase = 1 - Math.exp(-dt / DRAG_LAG);
      // Longitude wraps, and a chase that does not know it takes the long way
      // round the planet exactly once per session, in front of the player.
      let delta = want.lon - view.lon;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      view.lon += delta * chase;
      view.lat += (want.lat - view.lat) * chase;
      view.dist += (want.dist - view.dist) * chase;
    }

    place();
    ribbonWidth();

    // The near plane rides the distance to the ground, exactly as `main.ts`'s
    // does: a fixed near of 5 against a far of ten radii is a 32,000:1 depth
    // range, and from orbit the twenty units between a cliff top and the sea
    // fall inside one depth step and every coastline starts z-fighting.
    const near = Math.max(1, (view.dist - body.radius) * 0.2);
    if (Math.abs(near - camera.near) > near * 0.1) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }

    if (stage === 'region' && !dragging && pointer.x >= 0) {
      const at = pointAt(pointer.x, pointer.y);
      const index = at === null ? 0 : body.regionAt(at.lat, at.lon);
      if (index !== regionIndex) {
        regionIndex = index;
        const next = index > 0 ? body.regions[index - 1]! : null;
        showRibbon(next);
        tip.classList.toggle('on', next !== null);
        if (next !== null) {
          tipName.textContent = next.name;
          tipSub.textContent = next.note;
        }
      }
      if (regionIndex > 0) {
        tip.style.left = `${pointer.x}px`;
        tip.style.top = `${pointer.y}px`;
      }
    } else if (stage !== 'region') {
      tip.classList.remove('on');
    }

    layOutPins();
    refreshNote();

    api.beforeRender?.(camera);
    draw(scene, camera);
  }

  /* --- the handedness check --------------------------------------------- */

  /**
   * Three mirrors have shipped in this project and two of them were in map
   * code. Every one was invisible because the thing that was wrong was only
   * ever compared with itself.
   *
   * There is no map basis here to be wrong — the projection is
   * `Vector3.project(camera)` and the picking is `unproject`, so both are the
   * camera's own `matrixWorld` — which moves the question rather than answering
   * it. So the witness is `regionAt`, which is `geo.ts`'s point-in-polygon over
   * the baked outlines and knows nothing about this file: put the camera over a
   * known place, ray-cast three points across the frame, and ask the **data**
   * what is under each. If east is to the right, the point a quarter of the way
   * right of Rome is in Greece or Turkey, and the point a quarter of the way
   * left is in Spain or France. Mirrored, it is the other way round, and no
   * amount of agreement between the pins and the ribbon would say so.
   */
  function verify(): Record<string, unknown> {
    const held = { ...view };
    const heldFlight = flight;
    // Rome, because what is east and west of it is unarguable and is in the
    // gazetteer rather than in this file.
    view.lat = 41.9;
    view.lon = 12.5;
    view.dist = orbitDistance(body.radius);
    flight = null;
    place();

    const box = renderer.domElement.getBoundingClientRect();
    const point = new THREE.Vector3();

    /**
     * Project a real coordinate to the screen, then ray-cast that screen pixel
     * straight back and ask the outlines what is under it.
     *
     * The round trip is the test. `project` is the camera's matrix and
     * `unproject` is its inverse, so those two agree by construction — but the
     * *name* that comes back is `geo.ts`'s point-in-polygon over the baked
     * rings, which has never heard of this camera, and the ordering of the
     * screen x's is a statement about east and west that only the gazetteer can
     * make.
     */
    interface Probe {
      asked: string;
      x: number;
      y: number;
      reads: string;
    }
    const probe = (name: string, lat: number, lon: number): Probe => {
      onSphere(lon, lat, point).multiplyScalar(body.radius + LAND_HEIGHT).add(body.centre).project(camera);
      const x = ((point.x + 1) / 2) * box.width;
      const y = ((1 - point.y) / 2) * box.height;
      const back = pointAt(box.left + x, box.top + y);
      const index = back === null ? 0 : body.regionAt(back.lat, back.lon);
      return {
        asked: name,
        x: Math.round(x),
        y: Math.round(y),
        reads: index > 0 ? body.regions[index - 1]!.name : 'open water',
      };
    };

    const west = probe('Madrid', 40.42, -3.7);
    const here = probe('Rome', 41.9, 12.5);
    const east = probe('Athens', 37.98, 23.73);
    const north = probe('Oslo', 59.91, 10.75);
    const south = probe('Tunis', 36.8, 10.18);

    // The ribbon's winding, measured off the built buffer rather than argued —
    // and it has to be measured *after* the shader's own offset, because the
    // position attribute holds the two ends of a segment and all four corners
    // of a quad share them. Without the offset the triangle is degenerate and
    // its normal is zero, which is a true statement about nothing.
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
        new THREE.Vector3().fromBufferAttribute(p, at).addScaledVector(
          new THREE.Vector3().fromBufferAttribute(a, at),
          s.getX(at),
        );
      const v0 = corner(idx.getX(0));
      const v1 = corner(idx.getX(1));
      const v2 = corner(idx.getX(2));
      const normal = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize();
      outward = normal.dot(v0.clone().sub(body.centre).normalize());
    }

    // Screen right against true east, and screen up against true north, both
    // derived from `onSphere` by hand: d/dlon of (cos f cos l, sin f, -cos f sin l)
    // and d/dlat of the same.
    const lon = view.lon * DEG;
    const lat = view.lat * DEG;
    const trueEast = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon));
    const trueNorth = new THREE.Vector3(
      -Math.sin(lat) * Math.cos(lon),
      Math.cos(lat),
      Math.sin(lat) * Math.sin(lon),
    );
    const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const rightDotEast = screenRight.dot(trueEast);
    const upDotNorth = screenUp.dot(trueNorth);

    Object.assign(view, held);
    flight = heldFlight;
    place();

    return {
      'screen right . east': Number(rightDotEast.toFixed(4)),
      'screen up . north': Number(upDotNorth.toFixed(4)),
      'ribbon normal . up': Number(outward.toFixed(4)),
      'east is right': east.x > here.x && here.x > west.x,
      'north is up': north.y < south.y,
      probes: [west, here, east, north, south],
    };
  }

  Object.assign(globalThis, { atlasMenu: api });
  requestAnimationFrame(frame);
  return api;
}
