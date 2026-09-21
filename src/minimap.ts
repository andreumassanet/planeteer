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
 * - **The scale is the country you are standing in**, taken from the bounding
 *   cap of the ring you are actually inside rather than of the country as a
 *   whole — France owns islands in three oceans and the United States owns
 *   Alaska, and `menu.ts` already wrote down what framing a country by all of
 *   its rings does. Clamped to [`MIN_VIEW`, `MAX_VIEW`], because Luxembourg's
 *   cap is 126 units and Russia's is a third of the planet and neither is a
 *   useful disc. The clamp is what makes the extremes readable: a microstate is
 *   never blown up past a 300-unit view, and Russia is never drawn wider than
 *   4,000.
 * - **North is up and the marker turns**, which is the opposite of what this
 *   file used to do and the same choice `map.ts` made. A heading-up disc is
 *   steered by; a north-up disc is *read*, and a map fitted to a country has to
 *   be read — the country is a shape you recognise, and it is only a shape you
 *   recognise if it holds still while you turn round. The heading is not lost,
 *   it is the arrow at the centre.
 * - **The towns are on it.** `hud.ts` says *near Palma* and until now nothing
 *   said where Palma was. The built places — `isShown`, the same 9,734 rows the
 *   settlements and the trees agree on — are dots sized by `radiusOf`, so the
 *   disc answers *which one* and *how big* in the same mark.
 *
 * What survives from the globe is the part that was never about scale: the rim
 * carries one wedge pointing at the nearest landmark, or at the destination
 * `navigation.ts` has chosen, and that mark is the whole reason a zoomed map
 * does not lose you — the landmark is usually off the disc, and the wedge is
 * how the disc says so.
 *
 * **The basis is `cartography.ts`'s.** `setFrame` is the one definition of which
 * way round a map's screen goes and this file is the reason it exists: it built
 * its own `right = up x forward` for months and drew every map mirrored.
 */
import type * as THREE from 'three';
import type { World } from './geo.ts';
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
  /** Defaults to nothing being visited. */
  isVisited?: (id: string) => boolean;
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
  update(position: THREE.Vector3, forward: THREE.Vector3, here?: MinimapHere): void;
  /**
   * The landmark you have chosen to head for, or `null` for none.
   *
   * Kept apart from the nearest landmark on purpose: they answer different
   * questions, and the map should not point two ways at once. While a target is set it takes
   * the rim mark over, gets its own colour, and is exempt from the pin thinning
   * — the one pin that must never be swallowed by a cluster is the one you asked
   * for. Unknown ids clear the target rather than throwing: the caller's list
   * and this one come from the same file, but a typo should not blank the map.
   */
  setTarget(id: string | null): void;
  /**
   * Force the next `update` to redraw even if nothing has moved. The map skips
   * redraws while you stand still, so without this a change of visited state
   * would not appear until you took a step.
   */
  invalidate(): void;
  /** What the disc is showing and what it costs. `atlas.minimap.stats`. */
  readonly stats: MinimapStats;
}

const DEFAULT_SIZE = 180;
/** Ink rim, the same 3px weight as the HUD cards in `index.html`. */
const RIM_WIDTH = 3;
/** Redraws per second. The map moves slowly; the eye does not miss the rest. */
const MAX_FPS = 15;
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
 * And the heading, in radians, before the arrow at the centre is redrawn.
 *
 * North-up is what makes this cheap. Turning used to spin the whole planet and
 * cost a full trace of every ring; now it moves one 20-pixel arrow, and the
 * land, the towns and the pins are all still exactly where they were — which is
 * why they live in their own buffer. See `drawBase`.
 */
const MIN_TURN = 0.03;
/**
 * How finely the horizon rim is walked, in radians. Only ever traversed on the
 * hidden side of the planet, so it is about smoothness, not accuracy.
 */
const RIM_STEP = 0.12;

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
/** The bearing wedge: how far it reaches in from the rim, and its half-width. */
const BEARING_REACH = 7;
const BEARING_WIDTH = 5;
/**
 * The chosen destination's mark, which is the same wedge grown into an arrow.
 *
 * Longer and no wider, so it reads as a different mark and not as the crimson
 * one at a different size — the two never share the rim, but they do follow each
 * other, and a mark that only changed colour would look like a state you had
 * missed rather than a thing you had asked for.
 */
const TARGET_REACH = 13;
const TARGET_WIDTH = 5.5;
/** And its pin, drawn bigger for the same reason. */
const TARGET_PIN_SCALE = 1.3;
/**
 * Closer than this, in world units, the bearing mark is dropped.
 *
 * Not a pixel threshold, which is what this was first: three pixels of disc is
 * 216 km of planet, and it swallowed the mark for a landmark two horizons away
 * that you very much wanted pointing at. The real reason for a deadzone is that
 * the bearing spins when you are on top of the thing — at 120 units, walking
 * pace turns it a tenth of a radian a second, which is calm. That is a distance,
 * so it is written as one.
 */
const BEARING_DEADZONE = 120;

/**
 * Half-width of the disc, in world units, at its tightest and its widest.
 *
 * The bottom is set by the smallest country worth a shape: Luxembourg's
 * mainland ring has a bounding cap of 126 units and Liechtenstein's is smaller
 * still, so anything below about 300 is a map of one valley with no country on
 * it. The top is set by what a 174-pixel disc can still say: at 4,000 units one
 * pixel is 18 km, a village is a dot and a coastline is a coastline. Russia does
 * not fit and is not meant to — `M` is where the whole planet lives.
 */
const MIN_VIEW = 300;
const MAX_VIEW = 4000;
/**
 * At sea there is no country to fit, so the frame is the nearest built place
 * and this much room around it. 1.6 puts the coast you left comfortably inside
 * the rim and opens the disc to its widest in the middle of an ocean, which is
 * where you actually need it wide.
 */
const SEA_MARGIN = 1.6;
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
  const isVisited = settings.isVisited ?? (() => false);

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
  const cream = hex(PALETTE.white);
  const gold = hex(PALETTE.gold);
  const crimson = hex(PALETTE.crimson);
  // Violet is the only palette colour that collides with nothing already on the
  // disc — not the ocean, not any continent fill, not cream, gold or crimson.
  const violet = hex(PALETTE.violet);
  const faintInk = 'rgba(30, 6, 3, 0.42)';
  const borderWidth = Math.max(1, size / 200);
  const uiScale = size / DEFAULT_SIZE;

  const minAngle = MIN_VIEW / PLANET_RADIUS;
  const maxAngle = MAX_VIEW / PLANET_RADIUS;

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
    const step = (0.5 * (bottom / PLANET_RADIUS)) / discRadius;
    const shapes = buildShapes(world, step, step);
    return {
      shapes,
      faded: shapes.map((shape) => fade(Number.parseInt(shape.fill.slice(1), 16), 0.45)),
    };
  });
  /**
   * The framing always reads the finest set, whatever the draw is using: the
   * ring caps decide the zoom, and a zoom that jumped when the level changed
   * would be a zoom driven by its own output.
   */
  const shapes = levels[0]!.shapes;
  const shapeCos = new Float64Array(shapes.map((shape) => Math.cos(shape.radius)));

  /**
   * The rings of each country, and the biggest of them.
   *
   * The framing wants the ring you are *inside*, so that Corsica frames Corsica
   * and not metropolitan France; the biggest is the fallback for the frames
   * where no ring contains you, which is every frame you spend just offshore.
   */
  const byCountry = new Map<number, number[]>();
  shapes.forEach((shape, i) => {
    const list = byCountry.get(shape.country);
    if (list === undefined) byCountry.set(shape.country, [i]);
    else list.push(i);
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

  const pinIndex = new Map(monuments.map((monument, i) => [monument.id, i]));

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
  const deadzone = BEARING_DEADZONE / PLANET_RADIUS;

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

  /** Where you are, as the caller last said. */
  let country = 0;
  let nearby: Nearby | null = null;

  /** Half-width of the disc in radians: what it is now, and where it is going. */
  let view = maxAngle;
  /** Pixels per unit of the orthographic projection. Rebuilt when `view` moves. */
  let scale = discRadius / Math.sin(view);
  /** Which way the avatar is facing, as a screen angle: zero is up the sheet. */
  let heading = 0;

  // The nearest monument, recomputed on every update rather than every redraw:
  // the bearing mark reads it each frame and one that lagged the throttle would
  // visibly trail the player's own turn.
  let nearestPin = -1;
  let nearestAngle = 0;
  let nearestScreen = 0;

  // The chosen destination, tracked the same way and for the same reason.
  let targetPin = -1;
  let targetAngle = 0;
  let targetScreen = 0;

  const interval = 1000 / MAX_FPS;

  // What the last redraw touched, and what `update` has cost lately.
  let drawnRings = 0;
  let drawnPoints = 0;
  let drawnLevel = 0;
  let drawnPlaces = 0;
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
    // Closest first, then thinned closest-first, with the chosen destination
    // seeded so it cannot lose a cluster to a nearer neighbour. Both live in
    // `cartography.ts`: the map behind `M` thins the same pins by the same rule
    // and two copies of that rule would disagree about which one you see.
    sortByDepth(pinOrder, pinDepth, visible);
    return thinMarks(
      pinOrder, visible, pinScreenX, pinScreenY, pinSpacing, keptPin, keptX, keptY, targetPin,
    );
  }

  /**
   * A wedge on the rim pointing out at one monument, at its *screen* azimuth.
   *
   * The disc is north-up now, so this is where the landmark is on the paper
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

    baseCtx.beginPath();
    baseCtx.moveTo(centre + dx * apex, centre + dy * apex);
    baseCtx.lineTo(centre + dx * from - dy * wide, centre + dy * from + dx * wide);
    baseCtx.lineTo(centre + dx * from + dy * wide, centre + dy * from - dx * wide);
    baseCtx.closePath();
    baseCtx.fillStyle = fill;
    baseCtx.fill();
    baseCtx.lineWidth = Math.max(1, 1.5 * uiScale);
    baseCtx.lineJoin = 'round';
    baseCtx.strokeStyle = ink;
    baseCtx.stroke();
  }

  /**
   * The rim carries one mark, and a chosen destination outranks the nearest
   * landmark for it.
   *
   * Two marks would be two answers to a question you only asked once. The
   * nearest one keeps its crimson pin when it is on the disc, so "what is around
   * me" is still there; what it loses is the claim on the rim, which is the part
   * that reads as "go this way".
   */
  function drawBearing(): void {
    if (targetPin >= 0) {
      if (targetAngle >= deadzone) traceBearing(targetScreen, TARGET_REACH, TARGET_WIDTH, violet);
      return;
    }
    if (nearestPin < 0 || nearestAngle < deadzone) return;
    traceBearing(nearestScreen, BEARING_REACH, BEARING_WIDTH, crimson);
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
    const kmPerPixel = (view * EARTH_KM) / discRadius;
    const km = niceKm(kmPerPixel * discRadius * 0.42);
    const width = km / kmPerPixel;
    return { x0: centre - width / 2, x1: centre + width / 2, y: size - 13 * uiScale, km };
  }

  function drawScale(bar: { x0: number; x1: number; y: number; km: number }): void {
    const { x0, x1, y, km } = bar;
    baseCtx.lineWidth = Math.max(1, 1.6 * uiScale);
    baseCtx.strokeStyle = ink;
    baseCtx.beginPath();
    baseCtx.moveTo(x0, y - 2.5 * uiScale);
    baseCtx.lineTo(x0, y + 2.5 * uiScale);
    baseCtx.moveTo(x0, y);
    baseCtx.lineTo(x1, y);
    baseCtx.moveTo(x1, y - 2.5 * uiScale);
    baseCtx.lineTo(x1, y + 2.5 * uiScale);
    baseCtx.stroke();
    baseCtx.font = `800 ${(8.5 * uiScale).toFixed(1)}px ${FONT}`;
    baseCtx.textAlign = 'center';
    baseCtx.textBaseline = 'alphabetic';
    inkedText(baseCtx, `${km >= 1 ? km : km.toFixed(1)} km`, centre, y - 4 * uiScale, cream, ink, 3);
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

    baseCtx.beginPath();
    baseCtx.arc(centre, centre, discRadius, 0, TAU);
    baseCtx.fillStyle = ocean;
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
    while (band + 1 < SHAPE_BANDS.length && view * PLANET_RADIUS >= SHAPE_BANDS[band + 1]!) band++;
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

    const towns = layOutTowns();
    const pins = layOutPins();
    drawnPlaces = towns;
    drawnPins = pins;

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
    space.claim(centre - 7 * uiScale, 0, 14 * uiScale, RIM_WIDTH + 13 * uiScale);
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
    if (towns > 0 && chipTown >= 0 && townKept[0] === chipTown) {
      write(gazetteer[townRow[chipTown]!]!.name, townKeptX[0]!, townKeptY[0]!, dotClear);
    }
    baseCtx.font = `800 ${(9 * uiScale).toFixed(1)}px ${FONT}`;
    for (let n = 0; n < pins; n++) {
      write(monuments[keptPin[n]!]!.name, keptX[n]!, keptY[n]!, pinClear);
    }
    baseCtx.font = `800 ${(9.5 * uiScale).toFixed(1)}px ${FONT}`;
    for (let n = 0; n < towns; n++) {
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
    baseCtx.lineWidth = Math.max(1, 1.4 * uiScale);
    // Backwards, so the nearest one is painted last and nothing lands on top of
    // the pin you are being pointed at.
    for (let n = pins - 1; n >= 0; n--) {
      const i = keptPin[n]!;
      if (i === targetPin) {
        tracePin(baseCtx, keptX[n]!, keptY[n]!, pinRise, pinHead, violet, TARGET_PIN_SCALE);
        continue;
      }
      const fill = i === nearestPin ? crimson : isVisited(monuments[i]!.id) ? gold : cream;
      tracePin(baseCtx, keptX[n]!, keptY[n]!, pinRise, pinHead, fill);
    }
    baseCtx.restore();

    baseCtx.beginPath();
    baseCtx.arc(centre, centre, discRadius, 0, TAU);
    baseCtx.lineWidth = RIM_WIDTH;
    baseCtx.strokeStyle = ink;
    baseCtx.stroke();

    // North, because the paper no longer turns and a map that does not turn has
    // to say which way it is pinned.
    baseCtx.font = `800 ${(9 * uiScale).toFixed(1)}px ${FONT}`;
    baseCtx.textAlign = 'center';
    baseCtx.textBaseline = 'middle';
    inkedText(baseCtx, 'N', centre, RIM_WIDTH + 6 * uiScale, cream, ink, 2.5);

    drawScale(bar);
    drawBearing();
    baseMs = performance.now() - began;
  }

  function draw(): void {
    const dpr = Math.min(devicePixelRatio || 1, 3);
    if (dpr !== ratio) {
      ratio = dpr;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      baseStale = true;
    }
    if (baseStale) {
      drawBase();
      baseStale = false;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
   * How wide the disc should be, in radians, for where the caller says you are.
   *
   * Three answers in priority order, and the third wins whenever it is bigger:
   * the ring you are standing inside, the town you are nearest to when there is
   * no ring, and the horizon when you are in the air. The last is why the plane
   * did not lose its map — at 6,000 units up the framing opens to 41 degrees on
   * its own, which is very nearly the hemisphere this disc used to draw from
   * everywhere.
   */
  function framing(position: THREE.Vector3): number {
    let angle = maxAngle;
    const rings = country > 0 ? byCountry.get(country) : undefined;
    if (rings !== undefined) {
      let inside = Infinity;
      let widest = 0;
      for (const s of rings) {
        const shape = shapes[s]!;
        if (shape.radius > widest) widest = shape.radius;
        const dot = shape.cx * ux + shape.cy * uy + shape.cz * uz;
        if (dot >= shapeCos[s]! && shape.radius < inside) inside = shape.radius;
      }
      angle = Number.isFinite(inside) ? inside : widest;
    } else if (nearby !== null) {
      // No country under you: the sea. The frame is the coast you are nearest
      // to, which mid-ocean is far enough away to open the disc to its widest.
      angle = (nearby.units * SEA_MARGIN) / PLANET_RADIUS;
    }
    angle = Math.min(maxAngle, Math.max(minAngle, angle));

    const altitude = position.length() - PLANET_RADIUS - GROUND_CEILING;
    if (altitude > 0) {
      angle = Math.max(angle, Math.acos(PLANET_RADIUS / (PLANET_RADIUS + altitude)));
    }
    return Math.min(SKY_LIMIT, angle);
  }

  return {
    canvas,
    update(position, forward, here) {
      const began = performance.now();
      const dt = previousAt === 0 ? 0 : Math.min(0.1, (began - previousAt) / 1000);
      previousAt = began;
      if (here !== undefined) {
        if (here.country !== country) baseStale = true;
        country = here.country;
        nearby = here.place;
      }

      // North, the world's own pole flattened onto the tangent plane. At a pole
      // there is no such direction and `setFrame` says so, and the only
      // orientation left there is the heading — which is what this disc used to
      // use everywhere, so the degenerate case is the old map.
      const length = Math.hypot(position.x, position.y, position.z) || 1;
      const along = position.y / length;
      north.x = (-along * position.x) / length;
      north.y = 1 - along * along;
      north.z = (-along * position.z) / length;
      if (!setFrame(frame, position, north) && !setFrame(frame, position, forward)) return;
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

      // Every frame, throttle or no throttle: the nearest landmark is the
      // bearing mark's and the crimson pin's, and finding it is 85 dot products.
      let best = -1;
      let bestDot = -2;
      for (let i = 0; i < pinCount; i++) {
        const k = i * 3;
        const dot = pinPoint[k]! * ux + pinPoint[k + 1]! * uy + pinPoint[k + 2]! * uz;
        if (dot > bestDot) {
          bestDot = dot;
          best = i;
        }
      }
      if (best !== nearestPin) baseStale = true;
      nearestPin = best;
      if (best >= 0) {
        const k = best * 3;
        const mx = pinPoint[k]!;
        const my = pinPoint[k + 1]!;
        const mz = pinPoint[k + 2]!;
        nearestAngle = Math.acos(Math.min(1, Math.max(-1, bestDot)));
        nearestScreen = Math.atan2(
          mx * rx + my * ry + mz * rz,
          mx * fx + my * fy + mz * fz,
        );
      }
      if (targetPin >= 0) {
        const k = targetPin * 3;
        const mx = pinPoint[k]!;
        const my = pinPoint[k + 1]!;
        const mz = pinPoint[k + 2]!;
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
    setTarget(id) {
      const next = id === null ? -1 : pinIndex.get(id) ?? -1;
      if (next === targetPin) return;
      targetPin = next;
      // The map skips redraws while you stand still, and choosing a destination
      // is exactly something you do standing still.
      baseStale = true;
      overlayStale = true;
    },
    invalidate() {
      baseStale = true;
      overlayStale = true;
    },
    get stats() {
      const sorted = Array.from(samples.subarray(0, sampleCount)).sort((a, b) => a - b);
      return {
        view: Number((view * PLANET_RADIUS).toFixed(1)),
        km: Number((view * EARTH_KM).toFixed(1)),
        rings: drawnRings,
        points: drawnPoints,
        level: drawnLevel,
        places: drawnPlaces,
        pins: drawnPins,
        medianMs: Number((sorted[sorted.length >> 1] ?? 0).toFixed(3)),
        worstMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
        baseMs: Number(baseMs.toFixed(3)),
      };
    },
  };
}
