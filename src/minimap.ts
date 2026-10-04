/**
 * The disc in the corner: where you are, at the scale of where you are.
 *
 * **It used to be a globe and that was the wrong instrument.** The first version
 * was an orthographic azimuthal projection of the whole near hemisphere — a
 * planet in 180 pixels, one degree to a pixel and a half — so standing in Palma
 * you saw Europe, Africa and the Atlantic, and Mallorca was not a shape, it was
 * two pixels. It answered *which continent* perfectly and *where am I* not at
 * all, and the thing you want from the corner of the screen while you walk is
 * the second one. `map.ts` behind `M` already answers the first, over the whole
 * planet rather than a hemisphere of it, so the disc had nothing to lose by
 * giving that up.
 *
 * So it is a **local** map now, and three decisions follow from that:
 *
 * - **The scale is the ground you will cover**, not the country you are in
 *   (it was the country's bounding cap until 2026-10-02): `LOCAL_VIEW` round
 *   you on foot, opening by `SPEED_VIEW` seconds of whatever you are moving at
 *   — a car's minimap shows the next junction, a walker's the next street —
 *   and to the horizon in the air, clamped to [`MIN_VIEW`, `MAX_VIEW`]. The
 *   country as a shape is `map.ts`'s, behind `M`, which is the map that is
 *   *read*; this one is *steered by*.
 * - **It turns with the camera**, as a driving game's does (since 2026-10-02;
 *   it was north-up with the marker turning): what is ahead on the screen is
 *   up the disc, the arrow is your body against the camera, and the `N` rides
 *   round the rim to say where north went.
 * - **The roads are on it, and the towns.** The roads as their own lines
 *   (`MinimapOptions.roads`), cased in ink as `map.ts` draws them; the built
 *   places — `isShown`, the same rows the settlements and the trees agree on —
 *   as dots sized by `radiusOf`, so the disc answers *which one* and *how big*
 *   in the same mark; and the rockets' pads beside the airstrips, as the
 *   little rocket `map.ts` draws them with (`traceRocket`), while the disc
 *   is no wider than `PAD_VIEW`.
 *
 * What survives from the globe is the part that was never about scale: while
 * the player has put a marker on the world map (`navigation.ts`) the rim
 * carries one violet wedge pointing at it, and that mark is the whole reason a
 * zoomed map does not lose you — the marker is usually off the disc, and the
 * wedge is how the disc says so. On the disc it is a violet pin.
 *
 * **The basis is `cartography.ts`'s.** `setFrame` is the one definition of which
 * way round a map's screen goes and this file is the reason it exists: it built
 * its own `right = up x forward` for months and drew every map mirrored.
 */
import type * as THREE from 'three';
import { Color, Vector3 } from 'three';
import type { World } from './geo.ts';
import type { PlanetSurface } from './planet.ts';
import { LAND_HEIGHT, PLANET_RADIUS } from './globe.ts';
import { MAX_RELIEF } from './terrain.ts';
import {
  BIGGEST_SETTLEMENT,
  SMALLEST_SETTLEMENT,
  isShown,
  prominenceVersion,
  radiusOf,
  rankOf,
} from './places.ts';
import type { Nearby, Place } from './places.ts';
import { OCEAN_COLOR, PALETTE } from './theme.ts';
import { FONT, hex } from './ui.ts';
import {
  EARTH_KM,
  LabelSpace,
  type Shape,
  TAU,
  buildShapes,
  createFrame,
  inkedText,
  setFrame,
  sortByDepth,
  thinMarks,
  toUnit,
  tracePin,
  traceRocket,
} from './cartography.ts';

/** As much of a `Placement` as the map needs. `placement.ts` owns the rest. */
export interface MinimapMonument {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * Where the caller says you are, which is what the framing is built from.
 *
 * Both fields are already computed once a frame by `main.ts` — the country for
 * the chip and the place for `hud.ts` — so they are handed over rather than
 * asked for again. Omit it and the disc keeps the framing it had.
 */
export interface MinimapHere {
  /** 1-based index into `world.countries`; 0 for open water. */
  country: number;
  /** The nearest *built* place, exactly as `places.nearest` answers it. */
  place: Nearby | null;
}

export interface MinimapOptions {
  /** Canvas edge in CSS pixels. */
  size?: number;
  monuments?: readonly MinimapMonument[];
  /**
   * The whole gazetteer. Only the built rows are drawn — `isShown`, the same
   * rule the settlements, the trees and the chip use, re-read whenever
   * `atlas.prominence()` moves it.
   */
  places?: readonly Place[];
  /** The body the disc is drawn on; Earth when omitted. See `planet.ts`. */
  surface?: PlanetSurface;
  /**
   * The roads, each a line of points on the unit sphere as `x, y, z` runs;
   * asked once, the first time the disc is drawn.
   */
  roads?: () => readonly Float32Array[];
  /**
   * The rockets' pads within `radius` units of `direction`, appended to
   * `out` as unit vectors (`PadIndex.padsWithin` in `launch-pads.ts`, on a
   * budget of the caller's): true once every pad there is in it, false
   * while some are still being worked out, and the disc asks again on its
   * next paper. Omit it for a world with no rockets beside its strips.
   */
  pads?: (direction: THREE.Vector3, radius: number, out: MinimapPad[]) => boolean;
}

/** As much of a `LaunchPad` as the disc needs: where it stands. */
export interface MinimapPad {
  at: { x: number; y: number; z: number };
}

export interface MinimapStats {
  /** Half-width of the disc, in world units and in real kilometres. */
  view: number;
  km: number;
  /** What the last redraw touched, and which outline resolution it used. */
  rings: number;
  points: number;
  level: number;
  places: number;
  pins: number;
  /** The rockets' pads on the last paper. */
  pads: number;
  /** Milliseconds in `update`, over the last 60 calls: the median and the worst. */
  medianMs: number;
  worstMs: number;
  /** And the last full rebuild of the land, which is the expensive half. */
  baseMs: number;
}

export interface Minimap {
  /** Not attached to the DOM. The caller mounts it. */
  canvas: HTMLCanvasElement;
  /** Call every frame; the implementation decides how often it actually redraws. */
  update(position: THREE.Vector3, forward: THREE.Vector3, here?: MinimapHere, look?: THREE.Vector3): void;
  /**
   * The player's marker as a point on the unit sphere, or `null` for none: a
   * violet pin where it is on the disc, and a wedge on the rim pointing at it.
   * Copied, so the caller may reuse the vector.
   */
  setMarker(direction: { x: number; y: number; z: number } | null): void;
  /** Force the next `update` to redraw even if nothing has moved. */
  invalidate(): void;
  /**
   * The other players, as points on the unit sphere; see `peers.ts`. Drawn on
   * the overlay, not the base, because they move while you stand still — and
   * one past the rim sits on it, pointing the way to them.
   */
  setPeers(marks: readonly { x: number; y: number; z: number }[]): void;
  /** What the disc is showing and what it costs. `atlas.minimap.stats`. */
  readonly stats: MinimapStats;
  /** Takes the canvas off the page; the disc holds no listener of its own. */
  dispose(): void;
}

const DEFAULT_SIZE = 180;
/** Ink rim, the same 3px weight as the HUD cards in `index.html`. */
const RIM_WIDTH = 3;
/** Redraws per second: it turns with the camera, and a turn at fifteen judders. */
const MAX_FPS = 30;
/**
 * A redraw is skipped unless something moved by at least this many pixels.
 * Standing still then costs nothing at all, which is most of the time.
 *
 * It is pixels and not units because the scale now moves by a factor of
 * thirteen: 0.35 units would be a redraw every frame in Luxembourg and one
 * every four seconds over Russia.
 */
const MIN_SHIFT = 0.35;
/**
 * And the turn, in radians, before the disc is redrawn: the camera's, which
 * turns the paper, or the body's, which turns the arrow.
 */
const MIN_TURN = 0.02;
/**
 * How finely the horizon rim is walked, in radians. Only ever traversed on the
 * hidden side of the planet, so it is about smoothness, not accuracy.
 */
const RIM_STEP = 0.12;
/**
 * The shortest stretch of road the disc strokes, in pixels: a road gets one
 * segment per this much of its own extent on the disc. Under the stroke's own
 * width a finer bend is not a bend anyone can see, only a join to rasterise.
 */
const ROAD_SEGMENT_PX = 3;
/**
 * How long the paper stands before it is drawn again, as a multiple of what
 * drawing it last cost, and the most that may be.
 *
 * On foot the paper is a few rings and costs a fraction of a millisecond, so
 * this is under the overlay's own interval and nothing changes. From a plane
 * the disc opens to thousands of units, hundreds of rings and every road in
 * them, and it moves half a pixel every frame: it was redrawn as often as
 * `MAX_FPS` let it. Eight is the paper's share — an eighth of the time — and
 * between its redraws `draw` carries the old one with the camera.
 */
const BASE_GAP = 8;
const BASE_GAP_MAX = 250;

// Pin geometry, in pixels at the default size. A teardrop with its point at the
// coordinate: the head carries the colour and the point says exactly where,
// which a dot cannot do at this size.
const PIN_RISE = 6;
const PIN_HEAD = 3;
/**
 * No two landmark pins closer together than this.
 *
 * Paris holds three landmarks inside 0.04 degrees. At the widest framing that
 * is still under a pixel, so the thinning has not gone away with the zoom — it
 * has only stopped being the *dominant* fact about the disc.
 */
const PIN_SPACING = 9;
/** And no two town dots, which are smaller marks carrying longer names. */
const PLACE_SPACING = 13;
/**
 * At most this many town dots.
 *
 * A 174-pixel disc thinned at 13 pixels has room for about 140 marks, which is
 * a rash and not a map. The order handed to the thinning is largest-first — the
 * survivor of a cluster is the one you have heard of, which is `menu.ts`'s rule
 * and not the landmarks' — so the cap keeps the biggest towns around you and
 * drops the hamlets. The one you are standing next to is seeded ahead of all of
 * them and cannot be dropped by either.
 */
const MAX_PLACE_MARKS = 22;
/**
 * And at most this many names, over both families. Beyond it the disc is soup:
 * *Saarbrücken* at 9 px is a third of a 174-pixel disc wide, so four names is
 * already most of the paper.
 */
const MAX_LABELS = 4;
/**
 * The rockets' pads, drawn on the paper with the towns, while the disc is no
 * wider than this many units: past it a pad is a strip's neighbour forty
 * kilometres across, and asking for every pad under a plane's horizon would
 * work out the strips of half a continent for marks nobody can tell apart.
 * The disc on foot, in a car and in a low plane is inside it.
 */
const PAD_VIEW = 2400;
/** A pad's rocket, in pixels at the default size, base to nose; and no two closer than this. */
const PAD_HEIGHT = 12;
const PAD_SPACING = 10;
/** At most this many: round a capital a handful stand inside `PAD_VIEW`. */
const MAX_PAD_MARKS = 12;
/** The marker's wedge on the rim: how far it reaches in, and its half-width. */
const TARGET_REACH = 13;
const TARGET_WIDTH = 5.5;
/** And its pin on the disc, drawn bigger than a landmark's. */
const TARGET_PIN_SCALE = 1.3;
/**
 * Closer than this, in world units, the bearing mark is dropped.
 *
 * Not a pixel threshold, which is what this was first: three pixels of disc is
 * 216 km of planet, and it swallowed the mark for a place two horizons away
 * that you very much wanted pointing at. The real reason for a deadzone is that
 * the bearing spins when you are on top of the thing — at 120 units, walking
 * pace turns it a tenth of a radian a second, which is calm. That is a distance,
 * so it is written as one.
 */
const BEARING_DEADZONE = 120;

/**
 * Half-width of the disc, in world units, at its tightest and its widest: a
 * street round you at the least, and at the most what a 174-pixel disc can
 * still say — at 4,000 units one pixel is 18 km, a village is a dot and a
 * coastline is a coastline.
 */
const MIN_VIEW = 220;
const MAX_VIEW = 4000;
/**
 * The disc round a walker, units, and how many seconds of the way ahead it
 * opens by as you go faster: a car at forty units a second sees the next 400
 * units, a plane at a hundred and twenty the next twelve hundred.
 */
const LOCAL_VIEW = 260;
const SPEED_VIEW = 10;
/** How quickly the speed the zoom reads follows the real one, seconds. */
const SPEED_EASE = 0.8;
/** Units moved in one update past which it was a jump and not a speed. */
const JUMP = 60;
/**
 * In the air the framing is the horizon instead, and this is the floor it
 * counts altitude from: sea level plus the highest ground the planet has, so
 * standing on a mountain never widens the disc and taking off always does.
 * `LAND_HEIGHT + MAX_RELIEF` over the radius is `terrain.ts`'s own hard clamp.
 */
const GROUND_CEILING = LAND_HEIGHT + MAX_RELIEF;
/**
 * And the widest the disc ever gets, which is where it started: the near
 * hemisphere. Above 85 degrees an orthographic disc spends its outer tenth of
 * radius on everything between 64 and 90 degrees out, so there is nothing left
 * to gain.
 */
const SKY_LIMIT = (85 * Math.PI) / 180;
/** Time constant of the zoom when the framing changes. Crossing a border is not a cut. */
const ZOOM_TIME = 0.4;

/** Mixes towards the paper, which is how an atlas says "not this country". */
function fade(color: number, amount: number): string {
  const mix = (shift: number): number => {
    const a = (color >> shift) & 0xff;
    const b = (PALETTE.white >> shift) & 0xff;
    return Math.round(a + (b - a) * amount);
  };
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

/** 1, 2 or 5 times a power of ten — the only numbers a scale bar is allowed. */
function niceKm(value: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(1e-3, value)));
  const n = value / power;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * power;
}

/**
 * @param options a bare number is read as `size`, which is what the first
 *   version of this took.
 */
export function createMinimap(world: World, options: MinimapOptions | number = {}): Minimap {
  const settings = typeof options === 'number' ? { size: options } : options;
  const size = settings.size ?? DEFAULT_SIZE;
  const monuments = settings.monuments ?? [];
  const gazetteer = settings.places ?? [];
  // The body under the disc: Earth's own constants unless a surface is handed in.
  const surface = settings.surface;
  const RADIUS = surface?.radius ?? PLANET_RADIUS;
  const RADIUS_KM = surface?.radiusKm ?? EARTH_KM;
  const CEILING = surface?.groundCeiling ?? GROUND_CEILING;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  // The land, the towns and the pins are geography: they move when *you* move
  // and not when you turn. They are drawn into their own buffer so that a turn
  // costs one `drawImage` and one arrow instead of a full trace of every ring.
  const base = document.createElement('canvas');
  const baseCtx = base.getContext('2d')!;

  const centre = size / 2;
  // The rim stroke straddles the disc edge, so half of it has to fit inside.
  const discRadius = centre - RIM_WIDTH / 2;
  const ink = hex(PALETTE.ink);
  const ocean = hex(OCEAN_COLOR);
  /**
   * What the disc is painted with under the land: the sea on Earth, and on a
   * body with none the ground's own colour under the disc's centre, read off
   * the surface each time the paper is drawn. Ocean blue there drew a sea
   * between the nations of Mars and round the rim between redraws.
   */
  const dryBody = surface !== undefined && !surface.sea;
  const paperColour = new Color();
  const paperAt = new Vector3();
  let paper = ocean;
  const cream = hex(PALETTE.white);
  const gold = hex(PALETTE.gold);
  // Violet is the only palette colour that collides with nothing already on the
  // disc — not the ocean, not any continent fill, not cream or gold.
  const violet = hex(PALETTE.violet);
  // And pink for the other players: round dots, where every landmark is a pin.
  const pink = hex(PALETTE.pink);
  let peerMarks: readonly { x: number; y: number; z: number }[] = [];
  const faintInk = 'rgba(30, 6, 3, 0.42)';
  const borderWidth = Math.max(1, size / 200);
  const uiScale = size / DEFAULT_SIZE;

  const minAngle = MIN_VIEW / RADIUS;
  const maxAngle = MAX_VIEW / RADIUS;

  /**
   * The outlines, at three resolutions, chosen by how far the disc is zoomed
   * out.
   *
   * **One resolution does not work, and the number that says so is the plane.**
   * A set fine enough for the 300-unit framing is essentially the unthinned
   * source — half a pixel at 300 units is 0.006 degrees and Natural Earth is
   * coarser than that over most of a continent — and on foot that is free,
   * because the cap test admits a handful of rings. In the air it is not: at
   * 6,000 units up the framing opens to 41 degrees, hundreds of rings pass the
   * test, and one redraw traces tens of thousands of points.
   *
   * Each level is half a pixel at the bottom of the band it serves, and the
   * bands are the numbers below. Measured 2026-09-09 against the first 1:10m
   * file, which kept every point of every island, with the 1:50m figures beside
   * them. The file that replaced it simplifies every ring alike and holds 11%
   * fewer points (183,399 against 205,082); these tables were not re-measured
   * against it:
   *
   * ```
   *   band      step       rings   points      MB     build      was (1:50m)
   *   300 u    1.06e-4     2,849   195,149    2.23     29 ms     1,556 / 96,916 / 1.11 MB
   *   4000 u   1.41e-3     1,595    66,493    0.76     13 ms     1,211 / 58,638 / 0.67 MB
   *   10000 u  3.53e-3       603    28,268    0.32      7 ms       580 / 28,725 / 0.33 MB
   *   20000 u  7.06e-3       352    13,823    0.16      5 ms       337 / 14,507 / 0.17 MB
   * ```
   *
   * **3.48 MB and 54 ms, against 2.27 MB and 39 ms — and all of the growth is
   * in one band.** That is the design working rather than surviving: the three
   * upper levels are thinned to half a pixel at their own zoom, so a finer
   * source gives them nothing and costs them nothing, and only the 300-unit
   * level — which is the unthinned source by definition — doubles when the
   * source doubles. It is also the level you spend the whole game in on foot,
   * where the cap test hands the trace a few rings out of the 2,849.
   *
   * And what one redraw actually traces on foot, at 300 units, re-measured over
   * seven standpoints — the cap test's whole job, since the level it is reading
   * holds 2,849 rings:
   *
   * ```
   *              rings   points        was (1:50m)
   *   Palma          6      934        5 /    810
   *   Madrid         4    1,069        2 /    559
   *   Nairobi        3      653        2 /    543
   *   Tokyo          3    3,134        2 /    390
   *   Santiago       2    2,469        2 /  2,092
   *   Oslo           4    8,484        3 /  6,075
   *   Reykjavik      3   10,281        2 /  2,403
   * ```
   *
   * Two to six rings out of 2,849, and 653 to 10,281 points — against 17,847
   * from everywhere for the hemisphere version this replaced, which is what the
   * bands were built to beat and still do. Where the finer source is paid for
   * is a fjord or a fissured coast standing in its own ring: Reykjavik went
   * 2,403 to 10,281 because Iceland is now drawn as Iceland. The peaks are
   * still at the top of each band, where the set is four times finer than the
   * pixels need; more bands would flatten that and cost another megabyte each.
   */
  const SHAPE_BANDS = [MIN_VIEW, 4000, 10000, 20000];
  const levels = SHAPE_BANDS.map((bottom) => {
    const step = (0.5 * (bottom / RADIUS)) / discRadius;
    const shapes = buildShapes(world, step, step);
    return {
      shapes,
      faded: shapes.map((shape) => fade(Number.parseInt(shape.fill.slice(1), 16), 0.45)),
    };
  });
  // Monuments, as unit vectors, once. Same conversion as the outlines, so a pin
  // and the coast it stands on cannot drift apart.
  const pinCount = monuments.length;
  const pinPoint = new Float32Array(pinCount * 3);
  monuments.forEach((monument, i) => {
    toUnit(monument.lat, monument.lon, pinPoint, i * 3);
  });
  // Scratch for the draw. Eighty-five pins is nothing, but allocating it per
  // frame is a habit that stops being nothing the moment the dataset grows.
  const pinScreenX = new Float32Array(pinCount);
  const pinScreenY = new Float32Array(pinCount);
  const pinDepth = new Float32Array(pinCount);
  const pinOrder = new Int32Array(pinCount);
  const keptX = new Float32Array(pinCount);
  const keptY = new Float32Array(pinCount);
  const keptPin = new Int32Array(pinCount);
  // The pads, asked afresh with each paper: a few, and they never move.
  const padFound: MinimapPad[] = [];
  const padAt = new Vector3();
  const padKeptX = new Float32Array(MAX_PAD_MARKS);
  const padKeptY = new Float32Array(MAX_PAD_MARKS);
  /** Some pad on the disc was still being worked out when the paper was drawn: draw it again. */
  let padsWaiting = false;
  const red = hex(PALETTE.red);


  /**
   * The built places, packed and ordered largest-first — once, not per redraw.
   *
   * `cartography.ts`'s `sortByDepth` is an insertion sort, which is right for
   * eighty-five landmarks whose order barely changes between frames and wrong
   * for the several hundred towns a wide framing over Europe puts on the disc.
   * It does not have to be sorted at all: population does not depend on where
   * you are standing, so the order is fixed at load and the thinning walks it.
   * The one town that has to survive whatever it stands next to — the one the
   * chip is naming — is seeded into the thinning instead.
   */
  const townUnit = new Float32Array(gazetteer.length * 3);
  const townRow = new Int32Array(gazetteer.length);
  const townDot = new Float32Array(gazetteer.length);
  const townSlot = new Map<number, number>();
  const townX = new Float32Array(gazetteer.length);
  const townY = new Float32Array(gazetteer.length);
  const townOrder = new Int32Array(gazetteer.length);
  const townKept = new Int32Array(gazetteer.length);
  const townKeptX = new Float32Array(gazetteer.length);
  const townKeptY = new Float32Array(gazetteer.length);
  let townCount = 0;
  let townFor = -1;

  function refreshTowns(): void {
    if (townFor === prominenceVersion()) return;
    townFor = prominenceVersion();
    const rows: number[] = [];
    for (let i = 0; i < gazetteer.length; i++) if (isShown(gazetteer[i]!)) rows.push(i);
    rows.sort((a, b) => rankOf(gazetteer[b]!) - rankOf(gazetteer[a]!));
    townCount = rows.length;
    townSlot.clear();
    const spread = BIGGEST_SETTLEMENT - SMALLEST_SETTLEMENT;
    for (let k = 0; k < townCount; k++) {
      const i = rows[k]!;
      const place = gazetteer[i]!;
      toUnit(place.lat, place.lon, townUnit, k * 3);
      townRow[k] = i;
      // A dot that says how big the town is, off the one size law rather than a
      // second set of population bands: 1.7 px at the floor of `radiusFor` and
      // 4.2 at its ceiling, which is a village against a capital — and as
      // built (`radiusOf`), so a fitted city is the dot its square is.
      townDot[k] = 1.7 + ((radiusOf(place) - SMALLEST_SETTLEMENT) / spread) * 2.5;
      townSlot.set(i, k);
    }
  }

  const pinRise = PIN_RISE * uiScale;
  const pinHead = PIN_HEAD * uiScale;
  const pinSpacing = PIN_SPACING * uiScale;
  const placeSpacing = PLACE_SPACING * uiScale;
  const deadzone = BEARING_DEADZONE / RADIUS;

  canvas.style.display = 'block';
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  // The card language of the HUD, bent round: the disc is the card.
  canvas.style.borderRadius = '50%';
  canvas.style.boxShadow = `0 5px 0 ${ink}`;

  let ratio = 0;
  // The player's frame, rebuilt on every update and reused by the draw. It is
  // built by `cartography.ts` and unpacked into locals here: the ring trace
  // reads these nine numbers tens of thousands of times a redraw and a property
  // load per point is not free.
  const frame = createFrame();
  const north = { x: 0, y: 0, z: 0 };
  let ux = 0;
  let uy = 1;
  let uz = 0;
  let fx = 0;
  let fy = 0;
  let fz = 1;
  let rx = 1;
  let ry = 0;
  let rz = 0;
  // The frame as of the last redraw, for the "has anything moved" test.
  let lastUx = 0;
  let lastUy = 0;
  let lastUz = 0;
  let lastHeading = 99;
  let drawnAt = 0;
  let previousAt = 0;
  let baseStale = true;
  let overlayStale = true;
  /** The frame and scale the paper was last drawn in; see `draw`. */
  let baseUx = 0;
  let baseUy = 1;
  let baseUz = 0;
  let baseFx = 0;
  let baseFy = 0;
  let baseFz = 1;
  let baseRx = 1;
  let baseRy = 0;
  let baseRz = 0;
  let baseScale = 1;
  /** When the paper was last drawn, and how long it must stand before the next. */
  let baseDrawnAt = -Infinity;
  let baseGap = 0;

  /** Where you are, as the caller last said. */
  let country = 0;
  let nearby: Nearby | null = null;

  /** Half-width of the disc in radians: what it is now, and where it is going. */
  let view = maxAngle;
  /** Pixels per unit of the orthographic projection. Rebuilt when `view` moves. */
  let scale = discRadius / Math.sin(view);
  /** Which way the avatar is facing, as a screen angle: zero is up the sheet. */
  let heading = 0;
  /** Where north is, as a screen angle: the paper turns with the camera. */
  let northAngle = 0;
  /** How fast the traveller is going, units a second, smoothed: what opens the disc. */
  let speed = 0;
  const lastPosition = { x: 0, y: 0, z: 0 };
  let hasLast = false;

  // The marker, recomputed on every update rather than every redraw: the wedge
  // reads it each frame and one that lagged the throttle would visibly trail
  // the player's own turn.
  let marked = false;
  const markerPoint = { x: 0, y: 0, z: 0 };
  let targetAngle = 0;
  let targetScreen = 0;

  const interval = 1000 / MAX_FPS;

  // What the last redraw touched, and what `update` has cost lately.
  let drawnRings = 0;
  let drawnPoints = 0;
  let drawnLevel = 0;
  let drawnPlaces = 0;
  let drawnPads = 0;
  let drawnPins = 0;
  let baseMs = 0;
  const samples = new Float64Array(60);
  let sampleAt = 0;
  let sampleCount = 0;

  /**
   * Traces one ring in the player's frame.
   *
   * Only the near hemisphere exists on screen, so every point behind the
   * horizon is pushed out onto the horizon circle along its own azimuth. That
   * is not a fudge: the map is continuous across the horizon (a point exactly
   * on it already projects to radius `scale`), and because consecutive points
   * are at most a fraction of a degree apart, the first point past the horizon
   * is barely past it and moves by well under a pixel.
   *
   * What it also buys is the hard part: a ring that straddles the horizon comes
   * back closed. Its hidden stretch walks the horizon circle in the direction
   * the real coastline walks it, instead of snapping shut across the disc.
   *
   * The zoom changed nothing here except which circle that is. The projection
   * is still orthographic — `sin` of the angle out — and the magnification is
   * one multiplier, so the horizon sits at radius `scale`, which at the tightest
   * framing is thirteen disc radii off the canvas and is clipped away.
   */
  function traceRing(shape: Shape): void {
    const p = shape.points;
    const count = p.length / 3;
    /** Azimuth at which the previous point sat on the horizon; NaN if it was near. */
    let rim = NaN;

    baseCtx.beginPath();
    // One extra step wraps back to the first point: the rings are open — none of
    // them repeats its start — and the closing segment has to go through the
    // horizon logic like any other, so `closePath` never cuts a chord.
    for (let i = 0; i <= count; i++) {
      const k = (i === count ? 0 : i) * 3;
      const px = p[k]!;
      const py = p[k + 1]!;
      const pz = p[k + 2]!;
      const height = px * ux + py * uy + pz * uz;
      const sx = px * rx + py * ry + pz * rz;
      const sy = px * fx + py * fy + pz * fz;

      if (height > 0) {
        // Orthographic azimuthal: right across, north up. Canvas y grows
        // downward, hence the subtraction.
        const x = centre + sx * scale;
        const y = centre - sy * scale;
        if (i === 0) baseCtx.moveTo(x, y);
        else baseCtx.lineTo(x, y);
        rim = NaN;
        continue;
      }

      const flat = Math.sqrt(sx * sx + sy * sy);
      // Straight under the player's feet on the far side the azimuth is
      // undefined; hold the last one rather than spinning the rim walk.
      const angle = flat > 1e-6 ? Math.atan2(sy, sx) : rim;
      if (Number.isNaN(angle)) continue;

      if (i === 0) {
        baseCtx.moveTo(centre + Math.cos(angle) * scale, centre - Math.sin(angle) * scale);
      } else if (Number.isNaN(rim)) {
        baseCtx.lineTo(centre + Math.cos(angle) * scale, centre - Math.sin(angle) * scale);
      } else {
        // Both ends hidden: follow the circle round instead of cutting a chord
        // across the disc, which would eat a bite out of the fill.
        let delta = angle - rim;
        if (delta > Math.PI) delta -= TAU;
        else if (delta < -Math.PI) delta += TAU;
        const steps = Math.max(1, Math.ceil(Math.abs(delta) / RIM_STEP));
        for (let s = 1; s <= steps; s++) {
          const t = rim + (delta * s) / steps;
          baseCtx.lineTo(centre + Math.cos(t) * scale, centre - Math.sin(t) * scale);
        }
      }
      rim = angle;
    }
    baseCtx.closePath();
    baseCtx.fill();
    baseCtx.stroke();
  }

  /**
   * Projects the built towns, thins them and returns how many survived.
   *
   * Nothing is culled against the horizon here the way the pins are, because
   * nothing has to be: `dot >= cos(view)` is the disc itself, and at the widest
   * framing that is 85 degrees, inside the hemisphere where the orthographic
   * projection is still single-valued.
   */
  function layOutTowns(): number {
    refreshTowns();
    if (townCount === 0) return 0;
    const inside = Math.cos(Math.min(Math.PI / 2, view * 1.02));
    let count = 0;
    for (let k = 0; k < townCount; k++) {
      const at = k * 3;
      const mx = townUnit[at]!;
      const my = townUnit[at + 1]!;
      const mz = townUnit[at + 2]!;
      if (mx * ux + my * uy + mz * uz < inside) continue;
      townX[k] = centre + (mx * rx + my * ry + mz * rz) * scale;
      townY[k] = centre - (mx * fx + my * fy + mz * fz) * scale;
      townOrder[count++] = k;
    }
    if (count === 0) return 0;
    // Seeded with the town the chip is naming, which is the whole point of
    // drawing them: `hud.ts` says *near Palma* and this is where Palma is.
    const seed = nearby === null ? -1 : townSlot.get(nearby.index) ?? -1;
    return thinMarks(
      townOrder, count, townX, townY, placeSpacing,
      townKept, townKeptX, townKeptY, seed, MAX_PLACE_MARKS,
    );
  }

  /**
   * Projects the monuments, thins them, and returns how many survived.
   *
   * Culled against the horizon exactly like the outlines, and for the same
   * reason: a pin on the hidden half of the planet projects back onto the near
   * half mirrored, so it would sit somewhere that looks plausible and is wrong.
   * Pins outside the disc are dropped outright now rather than tucked under the
   * rim — at this zoom the rim is a frame, not a horizon, and the wedge is what
   * says a landmark is off the sheet.
   */
  function layOutPins(): number {
    if (pinCount === 0) return 0;
    const reach = discRadius + pinRise;
    let visible = 0;
    for (let i = 0; i < pinCount; i++) {
      const k = i * 3;
      const mx = pinPoint[k]!;
      const my = pinPoint[k + 1]!;
      const mz = pinPoint[k + 2]!;
      const height = mx * ux + my * uy + mz * uz;
      if (height <= 0) continue;
      const x = centre + (mx * rx + my * ry + mz * rz) * scale;
      const y = centre - (mx * fx + my * fy + mz * fz) * scale;
      if ((x - centre) ** 2 + (y - centre) ** 2 > reach * reach) continue;
      pinScreenX[i] = x;
      pinScreenY[i] = y;
      pinDepth[i] = height;
      pinOrder[visible++] = i;
    }
    if (visible === 0) return 0;
    // Closest first, then thinned closest-first. Both live in `cartography.ts`:
    // the map behind `M` thins the same pins by the same rule and two copies of
    // that rule would disagree about which one you see.
    sortByDepth(pinOrder, pinDepth, visible);
    return thinMarks(
      pinOrder, visible, pinScreenX, pinScreenY, pinSpacing, keptPin, keptX, keptY, -1,
    );
  }

  /**
   * Asks for the pads on the disc, projects them like the towns and thins
   * them, nearest the coordinate first by nothing but the order asked:
   * pads stand miles apart, and two that meet on the disc are one mark.
   * Returns how many stand. Only on the paper, because a pad is geography.
   */
  function layOutPads(): number {
    padsWaiting = false;
    if (settings.pads === undefined || view * RADIUS > PAD_VIEW) return 0;
    padFound.length = 0;
    padsWaiting = !settings.pads(padAt.set(ux, uy, uz), view * RADIUS, padFound);
    const spacing = PAD_SPACING * uiScale;
    let count = 0;
    for (const pad of padFound) {
      const { x: mx, y: my, z: mz } = pad.at;
      if (mx * ux + my * uy + mz * uz <= 0) continue;
      const x = centre + (mx * rx + my * ry + mz * rz) * scale;
      const y = centre - (mx * fx + my * fy + mz * fz) * scale;
      if ((x - centre) ** 2 + (y - centre) ** 2 > discRadius * discRadius) continue;
      let crowded = false;
      for (let n = 0; n < count && !crowded; n++) crowded = Math.abs(padKeptX[n]! - x) < spacing && Math.abs(padKeptY[n]! - y) < spacing;
      if (crowded) continue;
      padKeptX[count] = x;
      padKeptY[count] = y;
      if (++count === MAX_PAD_MARKS) break;
    }
    return count;
  }

  /**
   * A wedge on the rim pointing out at the marker, at its *screen* azimuth.
   *
   * The disc is north-up now, so this is where the marker is on the paper
   * rather than how far you have to turn — the two agreed while the map was
   * heading-up and this is the one place that had to be told they no longer do.
   * The turn itself is `cartography.ts`'s `bearingTo`, which the chip reads.
   */
  function traceBearing(angle: number, reach: number, width: number, fill: string): void {
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    const apex = discRadius - RIM_WIDTH;
    const from = apex - reach * uiScale;
    const wide = width * uiScale;

    ctx.beginPath();
    ctx.moveTo(centre + dx * apex, centre + dy * apex);
    ctx.lineTo(centre + dx * from - dy * wide, centre + dy * from + dx * wide);
    ctx.lineTo(centre + dx * from + dy * wide, centre + dy * from - dx * wide);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, 1.5 * uiScale);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.stroke();
  }

  /**
   * The rim carries one mark, the marker's, and only the player's own marker:
   * nothing in the world is a goal the disc points you at unasked.
   */
  function drawBearing(): void {
    if (marked && targetAngle >= deadzone) traceBearing(targetScreen, TARGET_REACH, TARGET_WIDTH, violet);
  }

  /** The marker's pin, when it stands on the disc. */
  function drawMarkerPin(): void {
    if (!marked) return;
    const { x: mx, y: my, z: mz } = markerPoint;
    if (mx * ux + my * uy + mz * uz <= 0) return;
    const x = centre + (mx * rx + my * ry + mz * rz) * scale;
    const y = centre - (mx * fx + my * fy + mz * fz) * scale;
    if ((x - centre) ** 2 + (y - centre) ** 2 > discRadius * discRadius) return;
    tracePin(baseCtx, x, y, pinRise, pinHead, violet, TARGET_PIN_SCALE);
  }

  /**
   * A bar with a round number on it, because the scale of this disc moves by a
   * factor of thirteen and a map whose scale moves has to say so.
   *
   * Its box is worked out before the names are placed and claimed like any
   * other mark — it is drawn last and would otherwise be drawn *over* a town,
   * which is how Nancy came out with `50 km` written through it.
   */
  function scaleBar(): { x0: number; x1: number; y: number; km: number } {
    const kmPerPixel = (view * RADIUS_KM) / discRadius;
    const km = niceKm(kmPerPixel * discRadius * 0.42);
    const width = km / kmPerPixel;
    return { x0: centre - width / 2, x1: centre + width / 2, y: size - 13 * uiScale, km };
  }

  function drawScale(bar: { x0: number; x1: number; y: number; km: number }): void {
    const { x0, x1, y, km } = bar;
    ctx.lineWidth = Math.max(1, 1.6 * uiScale);
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(x0, y - 2.5 * uiScale);
    ctx.lineTo(x0, y + 2.5 * uiScale);
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.moveTo(x1, y - 2.5 * uiScale);
    ctx.lineTo(x1, y + 2.5 * uiScale);
    ctx.stroke();
    ctx.font = `800 ${(8.5 * uiScale).toFixed(1)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // Under a kilometre in metres: the small worlds' discs go that far down,
    // and a tenth of a kilometre to one place read `0.0 km`.
    inkedText(ctx, km >= 1 ? `${km} km` : `${Math.round(km * 1000)} m`, centre, y - 4 * uiScale, cream, ink, 3);
  }

  /** The roads, each with its bounding cap on the unit sphere, built the first time they are drawn. */
  let roadLines: { points: Float32Array; cx: number; cy: number; cz: number; radius: number }[] | null = null;

  /** The roads on the disc: an ink casing and a cream line over it, as `map.ts` draws them. */
  function drawRoads(): void {
    if (settings.roads === undefined || typeof Path2D === 'undefined') return;
    roadLines ??= settings.roads().map((points) => {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < points.length; k += 3) {
        cx += points[k]!;
        cy += points[k + 1]!;
        cz += points[k + 2]!;
      }
      const length = Math.hypot(cx, cy, cz) || 1;
      cx /= length;
      cy /= length;
      cz /= length;
      let radius = 0;
      for (let k = 0; k < points.length; k += 3) {
        radius = Math.max(radius, Math.acos(Math.min(1, points[k]! * cx + points[k + 1]! * cy + points[k + 2]! * cz)));
      }
      return { points, cx, cy, cz, radius };
    });
    const path = new Path2D();
    let any = false;
    for (const line of roadLines) {
      const span = line.radius + view;
      if (span < Math.PI && line.cx * ux + line.cy * uy + line.cz * uz < Math.cos(span)) continue;
      const p = line.points;
      // **As many segments as the road has pixels for, and no more.** Every
      // road is held at its full sampling, which is right for the street-scale
      // framing on foot and ruinous from the air: at the 8,000-unit framing a
      // plane at its ceiling opens, a road is one to four pixels long, and the
      // disc stroked every sample of every road in it — twice, casing and
      // line, with round joins. The canvas's rasterisation of that one path
      // was **105 ms a frame, against 3.5 with no roads at all** (headless,
      // 3,000 units over Paris, 2026-10-04), and it was paid on every redraw,
      // which in a plane is every one the throttle allows. So a road takes one
      // segment per `ROAD_SEGMENT_PX` of its own extent on the disc, its ends
      // always kept: the street-scale disc still draws every sample, and the
      // plane's draws a road as the stroke it is at that size.
      const samples = p.length / 3;
      const segments = Math.max(1, Math.min(samples - 1, Math.ceil((2 * line.radius * scale) / ROAD_SEGMENT_PX)));
      let open = false;
      for (let j = 0; j <= segments; j++) {
        const k = Math.round((j * (samples - 1)) / segments) * 3;
        const px = p[k]!;
        const py = p[k + 1]!;
        const pz = p[k + 2]!;
        if (px * ux + py * uy + pz * uz <= 0) {
          open = false;
          continue;
        }
        const x = centre + (px * rx + py * ry + pz * rz) * scale;
        const y = centre - (px * fx + py * fy + pz * fz) * scale;
        if (open) path.lineTo(x, y);
        else path.moveTo(x, y);
        open = true;
        any = true;
      }
    }
    if (!any) return;
    // As thick as the disc's zoom says a road is, within reason.
    const width = Math.min(4.2, Math.max(1.6, (9 / (view * RADIUS)) * 120)) * uiScale;
    baseCtx.lineCap = 'round';
    baseCtx.lineJoin = 'round';
    baseCtx.strokeStyle = 'rgba(30, 6, 3, 0.7)';
    baseCtx.lineWidth = width + 2.2 * uiScale;
    baseCtx.stroke(path);
    baseCtx.strokeStyle = cream;
    baseCtx.lineWidth = width;
    baseCtx.stroke(path);
  }

  /** The land, the towns, the pins, the names, the rim and its mark. */
  function drawBase(): void {
    const began = performance.now();
    if (base.width !== canvas.width || base.height !== canvas.height) {
      base.width = canvas.width;
      base.height = canvas.height;
    }
    baseCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    baseCtx.clearRect(0, 0, size, size);

    if (dryBody && surface !== undefined && ux * ux + uy * uy + uz * uz > 0) {
      paper = `#${surface.colorAt(paperAt.set(ux, uy, uz).normalize(), paperColour).getHexString()}`;
    }
    baseCtx.beginPath();
    baseCtx.arc(centre, centre, discRadius, 0, TAU);
    baseCtx.fillStyle = paper;
    baseCtx.fill();

    baseCtx.save();
    baseCtx.clip();
    baseCtx.lineJoin = 'round';

    // One pass and a style per ring, rather than a faded pass with a bright one
    // over it: the shapes are painted biggest-first so that an enclave lands on
    // top of the country that swallows it, and repainting the country you are
    // in would put South Africa back over Lesotho.
    drawnRings = 0;
    drawnPoints = 0;
    // The coarsest set that is still finer than half a pixel here.
    let band = 0;
    while (band + 1 < SHAPE_BANDS.length && view * RADIUS >= SHAPE_BANDS[band + 1]!) band++;
    const level = levels[band]!;
    drawnLevel = band;
    for (let s = 0; s < level.shapes.length; s++) {
      const shape = level.shapes[s]!;
      // The ring's own bounding cap against the disc's. One dot product and one
      // cosine per ring, and it is what pays for holding the outlines at full
      // resolution: at 300 units it admits two to six rings out of 2,849.
      const span = shape.radius + view;
      if (span < Math.PI && shape.cx * ux + shape.cy * uy + shape.cz * uz < Math.cos(span)) continue;
      const mine = shape.country === country;
      baseCtx.fillStyle = mine ? shape.fill : level.faded[s]!;
      baseCtx.strokeStyle = mine ? ink : faintInk;
      baseCtx.lineWidth = borderWidth * (mine ? 1.8 : 1);
      traceRing(shape);
      drawnRings++;
      drawnPoints += shape.points.length / 3;
    }

    drawRoads();

    const towns = layOutTowns();
    const pins = layOutPins();
    const pads = layOutPads();
    drawnPlaces = towns;
    drawnPins = pins;
    drawnPads = pads;

    // The names come last but their space is claimed first, and getting that
    // order wrong is visible rather than theoretical: the marks are painted over
    // the haloes, so a name allowed to start under a neighbour's pin is a name
    // with a hole bitten out of it. `map.ts` learned this as "ffel Tower".
    const space = new LabelSpace();
    // The arrow's own extent and not a pixel more: the town you are standing in
    // is under it, and its name has to be able to sit beside it.
    space.claim(centre - 7 * uiScale, centre - 11 * uiScale, 14 * uiScale, 19 * uiScale);
    // The two marks the disc puts on itself rather than on the world. They are
    // drawn after everything else, so if they are not claimed here they are
    // drawn *through* a name instead of around it.
    const bar = scaleBar();
    space.claim(bar.x0 - 4, bar.y - 16 * uiScale, bar.x1 - bar.x0 + 8, 22 * uiScale);
    {
      const northAt = discRadius - RIM_WIDTH - 5 * uiScale;
      space.claim(centre + Math.sin(northAngle) * northAt - 7 * uiScale, centre - Math.cos(northAngle) * northAt - 7 * uiScale, 14 * uiScale, 14 * uiScale);
    }
    for (let n = 0; n < pins; n++) {
      space.claim(
        keptX[n]! - pinHead - 2,
        keptY[n]! - pinRise - pinHead - 2,
        pinHead * 2 + 4,
        pinRise + pinHead + 4,
      );
    }
    for (let n = 0; n < towns; n++) {
      space.claim(townKeptX[n]! - 4 * uiScale, townKeptY[n]! - 4 * uiScale, 8 * uiScale, 8 * uiScale);
    }
    const padHeight = PAD_HEIGHT * uiScale;
    for (let n = 0; n < pads; n++) {
      space.claim(padKeptX[n]! - padHeight * 0.5, padKeptY[n]! - padHeight - 1, padHeight, padHeight + 2);
    }

    let labels = 0;
    baseCtx.textAlign = 'left';
    baseCtx.textBaseline = 'middle';
    // Above the mark, and under it if that is taken. The second try is not
    // polish: the town you are standing *in* has your own arrow on top of it,
    // so the one name the disc most owes you is the one that always loses.
    //
    // `clear` is how far the label has to stay off (x, y) — the half-height of
    // the mark's own claimed box, and getting it wrong is total rather than
    // partial: a label overlapping its own mark by two pixels fails `fits`
    // against a box that was claimed for it, so **every** name is dropped and
    // the disc comes back with none. Which is exactly what the first build did.
    const write = (text: string, x: number, y: number, clear: number): void => {
      if (labels >= MAX_LABELS) return;
      const width = baseCtx.measureText(text).width;
      const height = 11 * uiScale;
      const mid = x - width / 2;
      const places: [number, number][] = [
        [mid, y - clear - height],
        [mid, y + clear],
        [x + clear + 2, y - height / 2],
        [x - clear - 2 - width, y - height / 2],
      ];
      for (const [left, top] of places) {
        if (Math.hypot(left - centre, top - centre) > discRadius - 3) continue;
        if (Math.hypot(left + width - centre, top + height - centre) > discRadius - 3) continue;
        if (!space.fits(left, top, width, height)) continue;
        space.claim(left, top, width, height);
        inkedText(baseCtx, text, left, top + height / 2, cream, ink, 3);
        labels++;
        return;
      }
    };

    // The town the chip is naming goes first and the landmarks go next: those
    // are the two questions the disc exists to answer, and everything after
    // them is whatever there is room for.
    const chipTown = nearby === null ? -1 : townSlot.get(nearby.index) ?? -1;
    // Half the dot's claimed box plus a pixel, and the whole of the pin's plus
    // three: the claims are a few lines up and these clear them.
    const dotClear = 5 * uiScale;
    const pinClear = pinRise + pinHead + 3 * uiScale;
    baseCtx.font = `800 ${(9.5 * uiScale).toFixed(1)}px ${FONT}`;
    // Written here, so the loop below starts after it: `write` tries every
    // side of a dot, and a name whose first side is taken by itself finds
    // another and is drawn twice.
    const chipFirst = towns > 0 && chipTown >= 0 && townKept[0] === chipTown ? 1 : 0;
    if (chipFirst === 1) {
      write(gazetteer[townRow[chipTown]!]!.name, townKeptX[0]!, townKeptY[0]!, dotClear);
    }
    baseCtx.font = `800 ${(9 * uiScale).toFixed(1)}px ${FONT}`;
    for (let n = 0; n < pins; n++) {
      write(monuments[keptPin[n]!]!.name, keptX[n]!, keptY[n]!, pinClear);
    }
    baseCtx.font = `800 ${(9.5 * uiScale).toFixed(1)}px ${FONT}`;
    for (let n = chipFirst; n < towns; n++) {
      write(gazetteer[townRow[townKept[n]!]!]!.name, townKeptX[n]!, townKeptY[n]!, dotClear);
    }

    // The towns, then the landmarks on top of them: a landmark is the rarer
    // mark and the one you are being pointed at.
    baseCtx.lineWidth = Math.max(1, 1.3 * uiScale);
    baseCtx.strokeStyle = ink;
    for (let n = towns - 1; n >= 0; n--) {
      const k = townKept[n]!;
      baseCtx.beginPath();
      baseCtx.arc(townKeptX[n]!, townKeptY[n]!, townDot[k]! * uiScale, 0, TAU);
      baseCtx.fillStyle = k === chipTown ? gold : cream;
      baseCtx.fill();
      baseCtx.stroke();
    }
    // The pads over the towns and under the landmarks: a rocket stands
    // outside a town, beside its strip, and a landmark is still the mark
    // the disc points at.
    baseCtx.lineWidth = Math.max(1, 1.2 * uiScale);
    baseCtx.lineJoin = 'round';
    for (let n = 0; n < pads; n++) traceRocket(baseCtx, padKeptX[n]!, padKeptY[n]!, padHeight, cream, red, ink);
    baseCtx.lineWidth = Math.max(1, 1.4 * uiScale);
    baseCtx.strokeStyle = ink;
    // Backwards, so the nearest one is painted last; one style for every
    // landmark, and the marker over all of them.
    for (let n = pins - 1; n >= 0; n--) tracePin(baseCtx, keptX[n]!, keptY[n]!, pinRise, pinHead, cream);
    drawMarkerPin();
    baseCtx.restore();

    // Where the paper stood when it was drawn, which is what `draw` moves it
    // from until the next one.
    baseUx = ux;
    baseUy = uy;
    baseUz = uz;
    baseFx = fx;
    baseFy = fy;
    baseFz = fz;
    baseRx = rx;
    baseRy = ry;
    baseRz = rz;
    baseScale = scale;
    baseMs = performance.now() - began;
  }

  /**
   * What belongs to the disc rather than to the paper — the rim, north riding
   * round it, the scale bar and the marker's wedge — drawn over the paper on
   * every redraw, because the paper between two of its own redraws is moved
   * (`draw`) and these must not move with it.
   */
  function drawFrameMarks(): void {
    ctx.beginPath();
    ctx.arc(centre, centre, discRadius, 0, TAU);
    ctx.lineWidth = RIM_WIDTH;
    ctx.strokeStyle = ink;
    ctx.stroke();

    // North, riding round the rim as the paper turns under it.
    ctx.font = `800 ${(9 * uiScale).toFixed(1)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const northAt = discRadius - RIM_WIDTH - 5 * uiScale;
    inkedText(ctx, 'N', centre + Math.sin(northAngle) * northAt, centre - Math.cos(northAngle) * northAt, cream, ink, 2.5);

    drawScale(scaleBar());
    drawBearing();
  }

  function draw(): void {
    const dpr = Math.min(devicePixelRatio || 1, 3);
    if (dpr !== ratio) {
      ratio = dpr;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      baseStale = true;
      baseDrawnAt = -Infinity;
    }
    const began = performance.now();
    const redrawn = baseStale && began - baseDrawnAt >= baseGap;
    if (redrawn) {
      drawBase();
      baseStale = false;
      baseDrawnAt = began;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // **The paper as it was drawn, moved to where it is now.** Between two of
    // its own redraws the paper is carried by the turn, the shift and the zoom
    // since — near the centre of an orthographic disc that is a rotation, a
    // translation and a scale, which is one transform — so a disc whose
    // redraw costs more than a frame can turn with the camera at the overlay's
    // rate and redraw its land at a rate of its own (`BASE_GAP`). Over the
    // ocean the paper uncovers, which is why the disc is filled first.
    const k = scale / baseScale;
    const a = k * (baseRx * rx + baseRy * ry + baseRz * rz);
    const b = -k * (baseRx * fx + baseRy * fy + baseRz * fz);
    const c = -k * (baseFx * rx + baseFy * ry + baseFz * rz);
    const d = k * (baseFx * fx + baseFy * fy + baseFz * fz);
    const e = centre + scale * (baseUx * rx + baseUy * ry + baseUz * rz) - (a + c) * centre;
    const f = centre - scale * (baseUx * fx + baseUy * fy + baseUz * fz) - (b + d) * centre;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(centre, centre, discRadius, 0, TAU);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.clip();
    ctx.setTransform(a, b, c, d, e * dpr, f * dpr);
    ctx.drawImage(base, 0, 0);
    ctx.restore();
    if (redrawn) {
      // What the paper costs, the copy that flushes it included, says how
      // long until it may be drawn again.
      baseGap = Math.min(BASE_GAP_MAX, (performance.now() - began) * BASE_GAP);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFrameMarks();

    const rim = discRadius - 5 * uiScale;
    for (const mark of peerMarks) {
      let x = mark.x * rx + mark.y * ry + mark.z * rz;
      let y = -(mark.x * fx + mark.y * fy + mark.z * fz);
      let reach = Math.hypot(x, y) * scale;
      // Behind the horizon it is still somewhere round the rim.
      if (mark.x * ux + mark.y * uy + mark.z * uz <= 0) reach = Infinity;
      if (reach > rim) {
        const length = Math.hypot(x, y) || 1;
        x = (x / length) * rim;
        y = (y / length) * rim;
      } else {
        x *= scale;
        y *= scale;
      }
      ctx.beginPath();
      ctx.arc(centre + x, centre + y, 3.5 * uiScale, 0, Math.PI * 2);
      ctx.fillStyle = pink;
      ctx.fill();
      ctx.lineWidth = 1.5 * uiScale;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }

    // The player, always dead centre, turned to the heading: the arrow moves
    // now and the world holds still, which is the opposite of what this disc
    // used to do and is what makes a country a shape you can recognise.
    ctx.save();
    ctx.translate(centre, centre);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(0, -11 * uiScale);
    ctx.lineTo(7 * uiScale, 8 * uiScale);
    ctx.lineTo(0, 3.5 * uiScale);
    ctx.lineTo(-7 * uiScale, 8 * uiScale);
    ctx.closePath();
    ctx.fillStyle = cream;
    ctx.fill();
    ctx.lineWidth = 2 * uiScale;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * How wide the disc should be, in radians: the ground you will cover —
   * `LOCAL_VIEW` and `SPEED_VIEW` seconds of the speed you are going — and
   * the horizon when you are in the air, whichever is wider. At 6,000 units
   * up that opens to 41 degrees by itself.
   */
  function framing(position: THREE.Vector3): number {
    const angle = Math.min(maxAngle, Math.max(minAngle, (LOCAL_VIEW + speed * SPEED_VIEW) / RADIUS));
    const altitude = position.length() - RADIUS - CEILING;
    if (altitude > 0) return Math.min(SKY_LIMIT, Math.max(angle, Math.acos(RADIUS / (RADIUS + altitude))));
    return Math.min(SKY_LIMIT, angle);
  }

  return {
    canvas,
    update(position, forward, here, look) {
      const began = performance.now();
      const dt = previousAt === 0 ? 0 : Math.min(0.1, (began - previousAt) / 1000);
      previousAt = began;
      if (here !== undefined) {
        if (here.country !== country) baseStale = true;
        country = here.country;
        nearby = here.place;
      }

      // The paper turns with the camera: what is ahead on the screen is up.
      // The pole is where the frame falls back to, where the camera looks
      // straight down and has no heading of its own.
      const length = Math.hypot(position.x, position.y, position.z) || 1;
      const along = position.y / length;
      north.x = (-along * position.x) / length;
      north.y = 1 - along * along;
      north.z = (-along * position.z) / length;
      if (!setFrame(frame, position, look ?? forward) && !setFrame(frame, position, north)) return;
      // How fast, smoothed, for the zoom: the ground covered since last time.
      // A jump (a teleport, a respawn) is not a speed: more than `JUMP` in one
      // update is left out.
      const step = Math.hypot(position.x - lastPosition.x, position.y - lastPosition.y, position.z - lastPosition.z);
      if (dt > 0 && hasLast && step < JUMP) speed += (Math.min(400, step / dt) - speed) * (1 - Math.exp(-dt / SPEED_EASE));
      lastPosition.x = position.x;
      lastPosition.y = position.y;
      lastPosition.z = position.z;
      hasLast = true;
      ux = frame.ux;
      uy = frame.uy;
      uz = frame.uz;
      fx = frame.fx;
      fy = frame.fy;
      fz = frame.fz;
      rx = frame.rx;
      ry = frame.ry;
      rz = frame.rz;

      // The zoom is eased geometrically rather than linearly, because a zoom is
      // a ratio: 300 to 4,000 and 4,000 to 300 then take the same time and read
      // as the same movement, which they do not if the step is in radians.
      const target = framing(position);
      if (Math.abs(Math.log(target / view)) > 0.003) {
        const k = dt <= 0 ? 1 : 1 - Math.exp(-dt / ZOOM_TIME);
        view *= (target / view) ** k;
        scale = discRadius / Math.sin(view);
        baseStale = true;
      }

      heading = Math.atan2(
        forward.x * rx + forward.y * ry + forward.z * rz,
        forward.x * fx + forward.y * fy + forward.z * fz,
      );
      // Where north is on the paper, for the `N` on the rim.
      const northTurn = Math.atan2(north.x * rx + north.y * ry + north.z * rz, north.x * fx + north.y * fy + north.z * fz);
      if (Math.abs(Math.atan2(Math.sin(northTurn - northAngle), Math.cos(northTurn - northAngle))) > MIN_TURN) baseStale = true;
      northAngle = northTurn;

      // Every frame, throttle or no throttle: the wedge reads it.
      if (marked) {
        const { x: mx, y: my, z: mz } = markerPoint;
        targetAngle = Math.acos(Math.min(1, Math.max(-1, mx * ux + my * uy + mz * uz)));
        targetScreen = Math.atan2(
          mx * rx + my * ry + mz * rz,
          mx * fx + my * fy + mz * fz,
        );
      }

      // Moved far enough on *this* scale, and turned far enough to be worth
      // moving the arrow. The two are separate because they cost two different
      // things: the first rebuilds the land, the second copies a bitmap.
      const moved = Math.acos(Math.min(1, ux * lastUx + uy * lastUy + uz * lastUz));
      if (moved * scale > MIN_SHIFT) baseStale = true;
      // A pad still being worked out comes onto the paper at its next redraw.
      if (padsWaiting) baseStale = true;
      if (baseStale || Math.abs(heading - lastHeading) > MIN_TURN) overlayStale = true;

      if (overlayStale) {
        const now = performance.now();
        if (now - drawnAt >= interval) {
          drawnAt = now;
          overlayStale = false;
          lastUx = ux;
          lastUy = uy;
          lastUz = uz;
          lastHeading = heading;
          draw();
        }
      }

      samples[sampleAt] = performance.now() - began;
      sampleAt = (sampleAt + 1) % samples.length;
      if (sampleCount < samples.length) sampleCount++;
    },
    setMarker(direction) {
      marked = direction !== null;
      if (direction !== null) {
        markerPoint.x = direction.x;
        markerPoint.y = direction.y;
        markerPoint.z = direction.z;
      }
      // The disc skips redraws while you stand still, and placing a marker is
      // exactly something you do standing still.
      baseStale = true;
      overlayStale = true;
    },
    invalidate() {
      baseStale = true;
      overlayStale = true;
    },
    setPeers(marks) {
      if (marks.length > 0 || peerMarks.length > 0) overlayStale = true;
      peerMarks = marks;
    },
    get stats() {
      const sorted = Array.from(samples.subarray(0, sampleCount)).sort((a, b) => a - b);
      return {
        view: Number((view * RADIUS).toFixed(1)),
        km: Number((view * RADIUS_KM).toFixed(1)),
        rings: drawnRings,
        points: drawnPoints,
        level: drawnLevel,
        places: drawnPlaces,
        pins: drawnPins,
        pads: drawnPads,
        medianMs: Number((sorted[sorted.length >> 1] ?? 0).toFixed(3)),
        worstMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
        baseMs: Number(baseMs.toFixed(3)),
      };
    },
    dispose() {
      canvas.remove();
      peerMarks = [];
    },
  };
}
