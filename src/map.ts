/**
 * The whole planet on one sheet, behind `M`.
 *
 * **This has to earn its place beside the plane**, because the plane *is* a
 * map: climb to the ceiling and the fog opens on the globe. What this gives
 * that altitude cannot is names, the far side of the planet, the visited set
 * at a size you can read, and a destination you can *point* at — pointer lock
 * holds the cursor everywhere else, so this is the one screen where you can
 * click on where you want to go. It decides nothing itself: a landmark clicked
 * goes to `navigation.ts`, a player clicked goes to `onJoin`.
 *
 * ## What it is, and what it replaced
 *
 * **A game map: a flat sheet you drag and zoom**, from the whole world down to
 * the streets round a town, with the names coming in as there is room for
 * them. It was an azimuthal equidistant disc centred on the player until
 * 2026-09-24 — distance from the centre was true, and three quarters of the
 * disc was the far hemisphere stretched round the rim — and the owner's verdict
 * was that no game shows its map that way. A disc could not zoom either, so a
 * cluster of landmarks (Paris holds three inside 0.04 degrees) was one pin at
 * every size; on a sheet that zooms, they come apart.
 *
 * **Miller cylindrical, north up, wrapping east to west.** Mercator is what a
 * player knows from every web map and is conformal, but it cannot draw a pole,
 * and the South Pole is a landmark. Miller is Mercator with the latitude
 * scaled by 0.8 inside the logarithm: the poles are a finite line at the top
 * and bottom, shapes at the latitudes people live at are nearly Mercator's,
 * and Antarctica is wide rather than infinite. The sheet is 1 wide and
 * `SHEET_HEIGHT` (0.733) tall in map units; `u` runs east from the
 * antimeridian and `v` south from the north pole.
 *
 * ## How the ground is painted
 *
 * **In tiles, as a web map is**, 256 pixels square on a pyramid of levels, and
 * painted from the world's own definitions rather than from a picture of it:
 * `groundColorAt` for the colour, which is what the land mesh is painted with,
 * and `reliefAt` for the light. `groundColorAt` costs 40 microseconds a point
 * (a country lookup and the biome's whole classifier), so it is asked on a
 * coarse lattice, one point every `COLOUR_STEP` pixels, and blended; the
 * relief costs one microsecond and is asked for every pixel, because the hill
 * shading is where the detail is. The coast is a mask filled from the outlines
 * — the same rings `countryAt` reads — so the edge of the land is exact at
 * every zoom and the lattice only has to be right about the colour.
 *
 * A tile is a generator that yields every few rows, and `update` runs them
 * inside `TILE_BUDGET_MS` a frame, nearest the middle of the screen first.
 * Until a tile is painted its nearest painted ancestor is drawn scaled up in
 * its place, so zooming in sharpens rather than pops. The world's first level
 * is painted in one go on the first open, so the sheet is never empty.
 *
 * **Everything that has to be crisp is drawn over the tiles as vectors**: the
 * coast in ink, the frontiers thinner (`coastEdges` says which edge is which),
 * the roads, the towns as the squares they are built as, the names, the pins,
 * the players and you.
 *
 * ## What a frame of it costs, and what it no longer does (2026-09-25)
 *
 * The sheet was one canvas redrawn whole on every change — a drag step, a
 * tile finished, and 30 times a second whenever you or another player moved —
 * and each redraw traced every visible point of the outlines, measured every
 * name again and rebuilt the tip's flag on every move of the mouse. Now:
 *
 * - **Two canvases.** The sheet (tiles, coast, roads, towns, names) is drawn
 *   when the view, a tile, the destination or the names change; the marks
 *   over it (the route, the pins, the players, you) on a second canvas, which
 *   is all a flight with the map open redraws. The names are laid out again
 *   only once you have moved `RELAYOUT_PX` from where they were laid out.
 * - **The outlines thinned by zoom and cut into runs** (`map-outline.ts`): a
 *   Node bench over the 188,507 points gave the whole planet on a 1,600-pixel
 *   screen 53,384 segments for 95,434, the opening zoom 7,299 for 9,366, and
 *   a degree of British Columbia 263 for 11,187, where the whole of Canada's
 *   coast was walked for one bay (2026-09-25). The tile painter fills its land
 *   mask from the same levels.
 * - **Painting yields to the frame.** 10 ms a frame while the sheet is still,
 *   4 while a hand moves it or when the frame came late; a tile composes 32
 *   rows between yields, where it composed all 256 in one; and the world's
 *   first levels and the screenful round you are painted before the sheet is
 *   ever opened, in the frame's far allowance.
 * - **Painted tiles become `ImageBitmap`s**, and a moving sheet scales them
 *   with the plain filter, the still one with the fine one.
 * - Label widths are measured once per font and name; the tip is filled when
 *   what is under the cursor changes and only moved otherwise.
 *
 * ## What the world does while it is open
 *
 * **It keeps running.** Pointer lock is released so there is a cursor, which
 * `input.ts` reads as "stop the mouse look" without being told; in the plane
 * the aircraft keeps flying, because freezing it to read a chart would be a
 * lie. Closing asks for the lock back rather than leaving the player on
 * "click to look around".
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, coastEdges, groundColorAt } from './globe.ts';
import { reliefAt } from './terrain.ts';
import { createFlagCanvas } from './flags.ts';
import type { Placement } from './placement.ts';
import { type Place, isShown, radiusOf, rankOf } from './places.ts';
import { type Road, courseOf, coursePoint, emptyCourse } from './roads.ts';
import { gatesOf, isAvenue, outskirtsOf, townGrid } from './scenery/grid.ts';
import { cellKey } from './scenery/ground.ts';
import { OCEAN_COLOR, PALETTE } from './theme.ts';
import { ensureStyle, FONT, h, hex, icon, installUi, kbd, km, people } from './ui.ts';
import { EARTH_KM, LabelSpace, R2D, TAU, inkedText } from './cartography.ts';
import { latLonOf, unitAt } from './sphere.ts';
import { actionOf, inputBlocked, labelOf, onKeyLabels } from './controls.ts';
import { type SheetRing, ringsForTile, traceOutlines } from './map-outline.ts';
import { frameOpen } from './view.ts';

export interface WorldMapOptions {
  /** Every placement, the same array the minimap and `navigation.ts` are given. */
  monuments: readonly Placement[];
  isVisited(id: string): boolean;
  /** The landmark `navigation.ts` currently has chosen, or null. */
  target(): string | null;
  /** Clicking a landmark. The map decides nothing; `navigation.ts` does. */
  onChoose(id: string): void;
  /** Clicking the one already chosen, which is how you put it away. */
  onClear(): void;
  /**
   * Every place, the array `roads.bin` indexes into. The sheet draws the ones
   * `isShown` builds; omit it for a map with no towns on it.
   */
  places?: readonly Place[];
  /** The network, as `roads.bin` holds it. */
  roads?: readonly Road[];
  /**
   * Who owns pointer lock, so closing the map can hand the mouse back rather
   * than leaving you looking at "click to look around".
   */
  lockTarget?: HTMLElement | null;
  /**
   * `event.code` that opens and closes it: `controls.ts`'s `map` unless given,
   * asked on every press so a rebinding holds at once. `null` to bind it
   * yourself.
   */
  key?: string | null;
  /**
   * Whether something else holds the keyboard, so `M` does not open the map
   * under a card. Consulted only by the key; `show()` is not gated by it,
   * which is what the console and the HUD's own button call.
   */
  blocked?: () => boolean;
  /**
   * The other players, as `peers.ts` last drew them: points on the unit
   * sphere. Omit it for a world with no relay.
   */
  peers?: () => readonly MapPeer[];
  /** Clicking a player, which is how you go and stand beside them. */
  onJoin?(id: string): void;
}

export interface MapPeer {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface WorldMapStats {
  /** Tiles painted and held, and how many are still being painted. */
  tiles: number;
  pending: number;
  /** The zoom as pixels per degree of longitude, and the tile level drawn. */
  pixelsPerDegree: number;
  level: number;
  /** The last draw of the sheet — tiles, lines, towns, names — in milliseconds. */
  drawMs: number;
  /** And of the marks over it — the route, the pins, the players, you — which is most redraws. */
  marksMs: number;
}

export interface WorldMap {
  /** The whole overlay, stylesheet included. The caller mounts one element. */
  root: HTMLElement;
  readonly open: boolean;
  toggle(): void;
  show(): void;
  hide(): void;
  /**
   * Centre the sheet on a place, and optionally set the zoom as how many
   * degrees of longitude the screen is wide. For the console and the shots.
   */
  focus(lat: number, lon: number, degreesAcross?: number): void;
  readonly stats: WorldMapStats;
  /** Every frame. Returns immediately and costs nothing while it is closed. */
  update(position: THREE.Vector3, forward: THREE.Vector3): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
/** Miller's `y` at a pole: `1.25 ln tan(pi/4 + 0.4 * pi/2)`. */
const Y_MAX = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.2 * Math.PI));
/** The sheet's height when its width is 1. */
const SHEET_HEIGHT = (2 * Y_MAX) / TAU;

const uOf = (lon: number): number => (lon + 180) / 360;
const vOf = (lat: number): number =>
  (Y_MAX - 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * DEG))) / TAU;
const lonOfU = (u: number): number => {
  const lon = u * 360 - 180;
  return lon - 360 * Math.floor((lon + 180) / 360);
};
const latOfV = (v: number): number =>
  (2.5 * Math.atan(Math.exp(0.8 * (Y_MAX - v * TAU))) - 0.625 * Math.PI) * R2D;

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

const TILE = 256;
/** The deepest level: 364 pixels a degree, about 0.8 world units a pixel; a big city fills a third of the screen. */
const MAX_LEVEL = 9;
/** Pixels of mask painted round a tile, so the shallows do not stop at its edge. */
const PAD = 12;
/** One `groundColorAt` every this many pixels, blended between. */
const COLOUR_STEP = 16;
/** One `reliefAt` every this many pixels; the light is blended between. */
const RELIEF_STEP = 2;
/** How far the shallows reach off a coast, in tile pixels, as two box passes. */
const SHALLOW_RADIUS = 5;
/**
 * The frame's allowance for painting tiles, in milliseconds, while the sheet
 * is still and the frames are keeping time. The world goes on updating under
 * the sheet (only its draw is skipped), so this is on top of that: a frame
 * that came late, or one in the middle of a drag or a zoom, paints for
 * `TILE_BUSY_MS` instead, and the parent tiles stand in a little longer.
 */
const TILE_BUDGET_MS = 10;
const TILE_BUSY_MS = 4;
/** A frame interval over this is late, in milliseconds: 24 is under 42 frames a second. */
const LATE_FRAME_MS = 24;
/** How long after the last drag or wheel step the sheet counts as moving. */
const SETTLE_MS = 180;
/** Rows of a tile composed between yields. */
const COMPOSE_ROWS = 32;
/**
 * While the sheet is shut, the tiles it will open on are painted in the
 * world's spare time: this much a frame, and only while the frame's far build
 * allowance (`view.ts`) is not spent. The first open painted the world's first
 * tile in one go and then its screenful at the full allowance, with the
 * parents scaled up in the meantime.
 */
const WARM_BUDGET_MS = 1.5;
/** And not in the first seconds, which are the streamers' arrival. */
const WARM_AFTER_MS = 8000;
/**
 * How often the screenful round you is asked for again as you travel, at
 * most: a plane crosses a tile of the opening zoom every second or two, and
 * chasing it would spend the far allowance on tiles nobody opened.
 */
const WARM_EVERY_MS = 15000;
/** Tiles held; the first three levels are always kept on top of these. */
const MAX_TILES = 220;
/** Levels painted up front and never evicted: 1 + 2 + 6 tiles. */
const KEEP_LEVEL = 2;

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

/** Redraws a second when only the player or a peer moved. The drag is not throttled. */
const MAX_FPS = 30;
/** The first open's zoom, as degrees of longitude across the screen. */
const OPEN_DEGREES = 38;
/** Pin geometry in pixels. */
const PIN_RISE = 13;
const PIN_HEAD = 6;
/** No two pins closer together than this; the destination is exempt. */
const PIN_SPACING = 16;
/** How far the cursor may be from a mark and still be pointing at it. */
const PICK_RANGE = 16;
/** A press that moves further than this is a drag, not a click. */
const CLICK_SLOP = 5;
/** A town drawn as its footprint rather than a dot once its square is this many pixels. */
const SQUARE_FROM = 7;
/** Its streets and blocks drawn once a cell is this many pixels. */
const CELLS_FROM = 4;

/**
 * The smallest population named at a zoom, by pixels per degree. A capital is
 * named from the second row on. The world view is a handful of megacities and
 * the countries; the street view is everything.
 */
const TOWN_FLOOR: readonly [number, number][] = [
  [3, 8_000_000],
  [6, 2_500_000],
  [14, 700_000],
  [32, 150_000],
  [70, 30_000],
  [Infinity, 0],
];
/** Roads are drawn from this zoom, in pixels per degree; lanes from the second. */
const ROADS_FROM = 30;
const LANES_FROM = 55;
/**
 * Under this many pixels a sheet unit — 11 a degree — the coast is traced at a
 * pixel and a half rather than 0.8: the whole planet on one screen.
 */
const PLANET_ZOOM = 4096;
/**
 * How far you may move on the screen before the names are laid out round you
 * again, in pixels. The names keep clear of the arrow; the arrow is drawn over
 * the sheet every frame and the names only when the sheet is.
 */
const RELAYOUT_PX = 18;

const STYLE = `
.atlas-map {
  position: fixed;
  inset: 0;
  z-index: 7;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  background: var(--ui-paper);
  transition: opacity 0.16s ease, visibility 0.16s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
}
.atlas-map.on { opacity: 1; visibility: visible; pointer-events: auto; }
.atlas-map-sheet:focus { outline: none; }
.atlas-map-sheet {
  position: absolute;
  inset: 14px;
  border: 3px solid var(--ui-ink);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 5px 0 var(--ui-ink);
  background: ${hex(OCEAN_COLOR)};
  cursor: grab;
  touch-action: none;
}
.atlas-map-sheet.drag { cursor: grabbing; }
.atlas-map-sheet.point { cursor: pointer; }
.atlas-map canvas { display: block; width: 100%; height: 100%; }
.atlas-map canvas.atlas-map-marks { position: absolute; inset: 0; pointer-events: none; }
.atlas-map .ui-card { position: absolute; }
.atlas-map-head {
  top: 30px;
  left: 30px;
  padding: 10px 16px 12px;
  pointer-events: none;
}
.atlas-map-title {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.1;
}
.atlas-map-count {
  margin-top: 1px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
}
.atlas-map-legend {
  margin-top: 9px;
  padding-top: 8px;
  border-top: 2px solid var(--ui-rule);
  display: grid;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 700;
}
.atlas-map-legend i {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 7px;
  border: 1.5px solid var(--ui-ink);
  border-radius: 50%;
  vertical-align: -1px;
}
.atlas-map-zoom {
  position: absolute;
  right: 30px;
  bottom: 30px;
  display: grid;
  gap: 10px;
}
.atlas-map-zoom .ui-btn { font-size: 22px; font-weight: 800; }
.atlas-map-scale {
  left: 30px;
  bottom: 30px;
  padding: 7px 12px 8px;
  font-size: 11.5px;
  font-weight: 800;
  pointer-events: none;
}
.atlas-map-scale b {
  display: block;
  height: 6px;
  margin-top: 4px;
  border: 2px solid var(--ui-ink);
  border-top: 0;
}
.atlas-map-foot {
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  pointer-events: none;
}
.atlas-map-foot span { display: inline-flex; align-items: center; gap: 6px; }
.atlas-map-foot .quiet { opacity: 0.6; }
.atlas-map-tip {
  display: none;
  align-items: center;
  gap: 11px;
  padding: 8px 13px 8px 9px;
  transform: translate(-50%, calc(-100% - 12px));
  max-width: 300px;
  pointer-events: none;
  z-index: 1;
}
.atlas-map-tip.on { display: flex; }
.atlas-map-tip-name {
  font-size: 14.5px;
  font-weight: 800;
  letter-spacing: -0.012em;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.atlas-map-tip-sub {
  margin-top: 1px;
  font-size: 11.5px;
  font-weight: 600;
  opacity: 0.6;
  white-space: nowrap;
}
.atlas-map-tip-sub b { font-weight: 800; opacity: 0.85; }
@media (max-width: 720px) {
  .atlas-map-foot { display: none; }
}
`;

interface Tile {
  z: number;
  i: number;
  j: number;
  /**
   * The painted tile: the canvas it was painted on, and then, once the
   * browser has made one, an `ImageBitmap` of it — a picture that cannot
   * change, which a GPU canvas keeps as a texture instead of taking a fresh
   * copy of a canvas every time it is drawn.
   */
  canvas: HTMLCanvasElement | ImageBitmap | null;
  job: Generator<undefined, void, unknown> | null;
  used: number;
}

interface SheetTown {
  place: Place;
  /** Index into `places`, which is what the roads' ends are. */
  index: number;
  /** Which cells stand, row-major, once asked: 0 gone to the outskirts, 1 block, 2 street. */
  cells: Uint8Array | null;
  u: number;
  v: number;
  rank: number;
  /** Built radius in world units. */
  radius: number;
}

interface SheetRoad {
  road: Road;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** The drawn course, sampled; null until first seen. */
  u: Float32Array | null;
  v: Float32Array | null;
}

interface CountryLabel {
  text: string;
  u: number;
  v: number;
  /** The largest ring's width on the sheet, in map units. */
  span: number;
}

type Hit =
  | { kind: 'pin'; index: number; x: number; y: number }
  | { kind: 'peer'; id: string; name: string; x: number; y: number; distance: number }
  | { kind: 'town'; town: SheetTown; x: number; y: number };

export function createWorldMap(world: World, options: WorldMapOptions): WorldMap {
  const { monuments, isVisited, target, onChoose, onClear } = options;
  const key = options.key;
  const isKey = (code: string): boolean => (key === undefined ? actionOf(code) === 'map' : code === key);
  const lockTarget = options.lockTarget ?? null;
  const allPlaces = options.places ?? [];

  installUi();
  ensureStyle('atlas-map', STYLE);

  const ink = hex(PALETTE.ink);
  const paper = hex(PALETTE.white);
  const gold = hex(PALETTE.gold);
  const violet = hex(PALETTE.violet);
  const pink = hex(PALETTE.pink);
  const oceanHex = hex(OCEAN_COLOR);

  // --- the DOM --------------------------------------------------------------

  // A dialog to assistive technology, and not a modal one: the world goes on
  // flying under it and `Tab` still cycles the landmarks it shows.
  const root = h('div', { class: 'atlas-map', role: 'dialog', 'aria-label': 'World map' });
  // Focused on opening, so a screen reader says where it is; never by `Tab`.
  const sheet = h('div', { class: 'atlas-map-sheet', tabindex: '-1' });
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d')!;
  // What moves, on a sheet of its own over the rest: you, the other players,
  // the route and the pins. In a plane with the map open the arrow moves every
  // frame and nothing under it does; drawn on one canvas, every one of those
  // frames painted the tiles, the coast, the roads and the names again.
  const marksCanvas = h('canvas', { class: 'atlas-map-marks', 'aria-hidden': 'true' });
  const mctx = marksCanvas.getContext('2d')!;
  sheet.append(canvas, marksCanvas);

  const count = h('div', { class: 'atlas-map-count' });
  const legend = h(
    'div',
    { class: 'atlas-map-legend' },
    ...([
      [paper, 'not found'],
      [gold, 'found'],
      [violet, 'destination'],
      ...(options.peers === undefined ? [] : [[pink, 'player'] as const]),
    ] as const).map(([colour, label]) => h('div', {}, h('i', { style: `background: ${colour}` }), label)),
  );
  const head = h(
    'div',
    { class: 'atlas-map-head ui-card' },
    h('div', { class: 'atlas-map-title', text: 'The world' }),
    count,
    legend,
  );

  const zoomIn = h('button', { class: 'ui-btn icon', type: 'button', 'aria-label': 'Zoom in', text: '+' });
  const zoomOut = h('button', { class: 'ui-btn icon', type: 'button', 'aria-label': 'Zoom out', text: '−' });
  const locate = h('button', { class: 'ui-btn icon', type: 'button', 'aria-label': 'Centre on you' }, icon('walk'));
  const zoomBox = h('div', { class: 'atlas-map-zoom' }, locate, zoomIn, zoomOut);

  const scaleText = h('span');
  const scaleBar = h('b');
  const scale = h('div', { class: 'atlas-map-scale ui-card' }, scaleText, scaleBar);

  const foot = h('div', { class: 'atlas-map-foot ui-card' });
  // The caps from the live bindings, drawn again when a key moves.
  const relabelFoot = (): void => {
    foot.replaceChildren(
      h('span', {}, kbd(labelOf('map')), 'close'),
      h('span', {}, kbd(labelOf('mapIn')), kbd(labelOf('mapOut')), 'zoom'),
      h('span', { class: 'quiet', text: 'drag to move · scroll to zoom' }),
      h('span', {
        text: options.peers === undefined
          ? 'click a landmark to go there'
          : 'click a landmark to go there, or a player to join them',
      }),
      h('span', {}, kbd(labelOf('next'), labelOf('next').length > 3), 'cycle'),
    );
  };
  relabelFoot();
  const unlabel = onKeyLabels(relabelFoot);

  const tipFlag = h('span');
  const tipName = h('div', { class: 'atlas-map-tip-name' });
  const tipSub = h('div', { class: 'atlas-map-tip-sub' });
  const tip = h('div', { class: 'atlas-map-tip ui-card' }, tipFlag, h('div', {}, tipName, tipSub));

  sheet.append(head, zoomBox, scale, foot, tip);
  root.append(sheet);

  const countryName = new Map(world.countries.map((country) => [country.iso, country.name]));

  // --- what is on the sheet, projected once ---------------------------------

  let rings: SheetRing[] | null = null;
  const countryLabels: CountryLabel[] = [];

  function prepareRings(): SheetRing[] {
    if (rings !== null) return rings;
    // A world with no outlines is a sheet of sea: the UI's own tests open the
    // map over a stub world, and `coastEdges` has nothing to read there.
    const source = world.rings ?? [];
    const coast = source.length > 0 ? coastEdges(world) : [];
    rings = source.map((ring, r) => {
      const n = ring.points.length;
      const u = new Float32Array(n);
      const v = new Float32Array(n);
      const edge = new Uint8Array(n);
      let u0 = Infinity;
      let u1 = -Infinity;
      let v0 = Infinity;
      let v1 = -Infinity;
      const flags = coast[r];
      for (let k = 0; k < n; k++) {
        const [lon, lat] = ring.points[k]!;
        u[k] = uOf(lon!);
        v[k] = vOf(Math.max(-89.999, Math.min(89.999, lat!)));
        if (u[k]! < u0) u0 = u[k]!;
        if (u[k]! > u1) u1 = u[k]!;
        if (v[k]! < v0) v0 = v[k]!;
        if (v[k]! > v1) v1 = v[k]!;
      }
      for (let k = 0; k < n; k++) {
        const [lonA, latA] = ring.points[k]!;
        const [lonB, latB] = ring.points[(k + 1) % n]!;
        // Not an edge of anything: a ring's run along a pole, or the seam
        // where Natural Earth cut a country at the antimeridian. Drawn, both
        // are a line across the ice or down the Bering Strait.
        const seam =
          (Math.abs(latA!) > 89.9 && Math.abs(latB!) > 89.9) ||
          (Math.abs(lonA!) > 179.99 && Math.abs(lonB!) > 179.99);
        edge[k] = seam ? 2 : ring.water || (flags?.[k] ?? 0) === 1 ? 1 : 0;
      }
      return { u, v, edge, u0, u1, v0, v1, water: ring.water, levels: [] };
    });
    // A country's name sits on the label point the bake computed, sized by
    // its biggest ring; a country of many islands is named by its largest.
    for (const [c, country] of world.countries.entries()) {
      let span = 0;
      for (const [r, ring] of source.entries()) {
        if (ring.country !== c + 1) continue;
        const sheetRing = rings[r]!;
        span = Math.max(span, Math.min(sheetRing.u1 - sheetRing.u0, (sheetRing.v1 - sheetRing.v0) * 1.6));
      }
      countryLabels.push({ text: country.name.toUpperCase(), u: uOf(country.lon), v: vOf(country.lat), span });
    }
    countryLabels.sort((a, b) => b.span - a.span);
    return rings;
  }

  /** The built towns, biggest first. Rebuilt on each open: `isShown` has a live knob. */
  let towns: SheetTown[] = [];
  function prepareTowns(): void {
    towns = [];
    for (const [index, place] of allPlaces.entries()) {
      if (!isShown(place)) continue;
      towns.push({ place, index, cells: null, u: uOf(place.lon), v: vOf(place.lat), rank: rankOf(place), radius: radiusOf(place) });
    }
    towns.sort((a, b) => b.rank - a.rank);
  }

  /** Which gates each town's roads come in by, from `roads.bin`. */
  let roadGates: Map<number, number[]> | null = null;

  /**
   * A town's plan as `settlements.ts` cuts it: the square, its streets, and
   * the outskirts given up from the edge in, keeping every street a road comes
   * in by. The landmarks' own cells are not kept here — the sheet does not know
   * them — so a town with a landmark at its edge may lose a cell on the map
   * that it keeps in the world.
   */
  function cellsOf(town: SheetTown): Uint8Array {
    if (town.cells !== null) return town.cells;
    if (roadGates === null) {
      roadGates = new Map();
      for (const road of options.roads ?? []) {
        for (const [end, gate] of [[road.a, road.gateA], [road.b, road.gateB]] as const) {
          const list = roadGates.get(end);
          if (list === undefined) roadGates.set(end, [gate]);
          else list.push(gate);
        }
      }
    }
    const grid = townGrid(town.radius);
    const kept = new Set<number>();
    const gates = gatesOf(grid);
    for (const index of roadGates.get(town.index) ?? []) {
      const gate = gates[index];
      if (gate === undefined) continue;
      for (const [col, row] of gate.cells) {
        for (let c = 0; c < grid.cells; c++) kept.add(gate.outX !== 0 ? cellKey(c, row) : cellKey(col, c));
      }
    }
    const place = town.place;
    const outskirts = outskirtsOf(grid, `${place.name}@${place.lat},${place.lon}`, (col, row) => kept.has(cellKey(col, row)));
    const cells = new Uint8Array(grid.cells * grid.cells);
    for (let row = 0; row < grid.cells; row++) {
      for (let col = 0; col < grid.cells; col++) {
        if (outskirts.has(cellKey(col, row))) continue;
        cells[row * grid.cells + col] = isAvenue(grid, col, row) ? 2 : 1;
      }
    }
    town.cells = cells;
    return cells;
  }

  let sheetRoads: SheetRoad[] | null = null;
  function prepareRoads(): SheetRoad[] {
    if (sheetRoads !== null) return sheetRoads;
    sheetRoads = (options.roads ?? []).flatMap((road) => {
      const a = allPlaces[road.a];
      const b = allPlaces[road.b];
      if (a === undefined || b === undefined) return [];
      const ua = uOf(a.lon);
      let ub = uOf(b.lon);
      if (ub - ua > 0.5) ub -= 1;
      else if (ua - ub > 0.5) ub += 1;
      const va = vOf(a.lat);
      const vb = vOf(b.lat);
      // The bow takes a road off the straight line by a fraction of its length;
      // a quarter of the length round both ends is more than any bake wrote.
      const pad = 0.25 * Math.hypot(ub - ua, vb - va);
      return [{
        road,
        u0: Math.min(ua, ub) - pad,
        u1: Math.max(ua, ub) + pad,
        v0: Math.min(va, vb) - pad,
        v1: Math.max(va, vb) + pad,
        u: null,
        v: null,
      }];
    });
    return sheetRoads;
  }

  const course = emptyCourse();
  const onCourse = new THREE.Vector3();
  const courseLatLon = { lat: 0, lon: 0 };
  const ROAD_SAMPLES = 14;
  function traceRoad(road: SheetRoad): void {
    courseOf(road.road, allPlaces, course);
    const u = new Float32Array(ROAD_SAMPLES);
    const v = new Float32Array(ROAD_SAMPLES);
    for (let k = 0; k < ROAD_SAMPLES; k++) {
      coursePoint(course, k / (ROAD_SAMPLES - 1), onCourse);
      latLonOf(onCourse, courseLatLon);
      let uk = uOf(courseLatLon.lon);
      if (k > 0) {
        const du = uk - u[k - 1]!;
        uk -= Math.round(du);
      }
      u[k] = uk;
      v[k] = vOf(courseLatLon.lat);
    }
    road.u = u;
    road.v = v;
  }

  // --- tiles -----------------------------------------------------------------

  const tiles = new Map<number, Tile>();
  const tileKey = (z: number, i: number, j: number): number => z * 4_194_304 + i * 2048 + j;
  const rowsAt = (z: number): number => Math.ceil(SHEET_HEIGHT * 2 ** z);
  let useClock = 0;
  /** The tiles the last draw wanted and did not have, nearest the middle first. */
  const wanted: Tile[] = [];

  const maskSize = TILE + 2 * PAD;
  const mask = document.createElement('canvas');
  mask.width = mask.height = maskSize;
  const maskCtx = mask.getContext('2d', { willReadFrequently: true })!;

  const colourScratch = new THREE.Color();
  const pointScratch = new THREE.Vector3();
  const oceanDeep = new THREE.Color(OCEAN_COLOR);
  const oceanShallow = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.62);
  const fallbackLand = new THREE.Color(PALETTE.green);

  function tileOf(z: number, i: number, j: number): Tile {
    const k = tileKey(z, i, j);
    let tile = tiles.get(k);
    if (tile === undefined) {
      tile = { z, i, j, canvas: null, job: null, used: 0 };
      tile.job = paintTile(tile);
      tiles.set(k, tile);
    }
    tile.used = ++useClock;
    return tile;
  }

  /**
   * One tile, a few rows at a time. The mask and the shallows are one step
   * each; the colour lattice and the relief yield by the row.
   */
  function* paintTile(tile: Tile): Generator<undefined, void, unknown> {
    const sheetRings = prepareRings();
    const { z, i, j } = tile;
    const scaleZ = TILE * 2 ** z;
    const u0 = i / 2 ** z;
    const v0 = j / 2 ** z;
    const M = maskSize;

    // The land, filled from the outlines, and the lakes cut back out of it.
    maskCtx.setTransform(1, 0, 0, 1, 0, 0);
    maskCtx.clearRect(0, 0, M, M);
    const uMin = u0 - PAD / scaleZ;
    const uMax = u0 + (TILE + PAD) / scaleZ;
    const vMin = v0 - PAD / scaleZ;
    const vMax = v0 + (TILE + PAD) / scaleZ;
    // Each ring thinned to this tile's own zoom (`map-outline.ts`): the
    // world's first tile is the whole planet 256 pixels across, and it was
    // filled from all 188,507 points, most of them inside a pixel of the last.
    for (const pass of [false, true]) {
      maskCtx.globalCompositeOperation = pass ? 'destination-out' : 'source-over';
      maskCtx.fillStyle = '#fff';
      ringsForTile(sheetRings, scaleZ, uMin, uMax, vMin, vMax, pass, (level, wrap) => {
        maskCtx.beginPath();
        const n = level.u.length;
        for (let k = 0; k < n; k++) {
          const x = (level.u[k]! + wrap - u0) * scaleZ + PAD;
          const y = (level.v[k]! - v0) * scaleZ + PAD;
          if (k === 0) maskCtx.moveTo(x, y);
          else maskCtx.lineTo(x, y);
        }
        maskCtx.closePath();
        maskCtx.fill();
      });
    }
    maskCtx.globalCompositeOperation = 'source-over';
    const maskData = maskCtx.getImageData(0, 0, M, M).data;
    const land = new Float32Array(M * M);
    let anyLand = false;
    for (let k = 0; k < M * M; k++) {
      land[k] = maskData[k * 4 + 3]! / 255;
      if (land[k]! > 0) anyLand = true;
    }
    yield;

    // The shallows: the land blurred twice, horizontally then vertically,
    // read only on the water.
    const near = new Float32Array(M * M);
    if (anyLand) {
      const row = new Float32Array(M * M);
      const R = SHALLOW_RADIUS;
      for (let pass = 0; pass < 2; pass++) {
        const from = pass === 0 ? land : near;
        for (let y = 0; y < M; y++) {
          let sum = 0;
          for (let x = -R; x <= R; x++) sum += from[y * M + Math.min(M - 1, Math.max(0, x))]!;
          for (let x = 0; x < M; x++) {
            row[y * M + x] = sum / (2 * R + 1);
            sum += from[y * M + Math.min(M - 1, x + R + 1)]! - from[y * M + Math.max(0, x - R)]!;
          }
        }
        for (let x = 0; x < M; x++) {
          let sum = 0;
          for (let y = -R; y <= R; y++) sum += row[Math.min(M - 1, Math.max(0, y)) * M + x]!;
          for (let y = 0; y < M; y++) {
            near[y * M + x] = sum / (2 * R + 1);
            sum += row[Math.min(M - 1, y + R + 1) * M + x]! - row[Math.max(0, y - R) * M + x]!;
          }
        }
      }
    }
    yield;

    // The colour, on a lattice, wherever there is land within reach of a
    // lattice point. `groundColorAt` answers over the sea too — a colour for
    // the ground that is not there — which is what a blend across a coast
    // wants.
    const GN = TILE / COLOUR_STEP + 1;
    const lattice = new Float32Array(GN * GN * 3);
    const known = new Uint8Array(GN * GN);
    if (anyLand) {
      for (let gy = 0; gy < GN; gy++) {
        for (let gx = 0; gx < GN; gx++) {
          const mx = Math.min(M - 1, gx * COLOUR_STEP + PAD);
          const my = Math.min(M - 1, gy * COLOUR_STEP + PAD);
          if (near[my * M + mx]! <= 0 && land[my * M + mx]! <= 0) continue;
          const lat = latOfV(v0 + (gy * COLOUR_STEP) / scaleZ);
          const lon = lonOfU(u0 + (gx * COLOUR_STEP) / scaleZ);
          unitAt(lat, lon, pointScratch).multiplyScalar(PLANET_RADIUS);
          groundColorAt(world, pointScratch, colourScratch);
          const g = gy * GN + gx;
          lattice[g * 3] = colourScratch.r;
          lattice[g * 3 + 1] = colourScratch.g;
          lattice[g * 3 + 2] = colourScratch.b;
          known[g] = 1;
        }
        yield;
      }
    }

    // The relief, on a lattice of its own a step round the tile so every
    // point inside has neighbours, and the light worked out on that lattice.
    // Where the lattice is over water the ground is taken as flat.
    const RS = RELIEF_STEP;
    const RN = TILE / RS + 3;
    const relief = new Float32Array(RN * RN);
    const light = new Float32Array(RN * RN).fill(1);
    if (anyLand) {
      for (let ry = 0; ry < RN; ry++) {
        const py = (ry - 1) * RS;
        const lat = latOfV(v0 + py / scaleZ);
        const my = Math.min(M - 1, Math.max(0, py + PAD));
        for (let rx = 0; rx < RN; rx++) {
          const px = (rx - 1) * RS;
          const mx = Math.min(M - 1, Math.max(0, px + PAD));
          if (land[my * M + mx]! <= 0 && near[my * M + mx]! < 0.02) continue;
          unitAt(lat, lonOfU(u0 + px / scaleZ), pointScratch);
          relief[ry * RN + rx] = Math.max(0, reliefAt(pointScratch.x, pointScratch.y, pointScratch.z));
        }
        if ((ry & 7) === 7) yield;
      }
      // The light is from the north-west, as every printed relief map has it,
      // and the exaggeration grows as the pixel does: at the world's scale a
      // pixel is 400 units and a 680-unit range is a two-pixel bump.
      for (let ry = 1; ry < RN - 1; ry++) {
        const lat = latOfV(v0 + ((ry - 1) * RS) / scaleZ);
        const unitsX = ((360 * RS) / scaleZ) * Math.max(0.05, Math.cos(lat * DEG)) * UNITS_PER_DEGREE;
        const unitsY = ((TAU * RS * Math.cos(0.8 * lat * DEG)) / scaleZ) * R2D * UNITS_PER_DEGREE;
        const lift = Math.min(14, Math.max(1.6, Math.sqrt(unitsX / RS / 6)));
        for (let rx = 1; rx < RN - 1; rx++) {
          const k = ry * RN + rx;
          const sx = ((relief[k + 1]! - relief[k - 1]!) / (2 * unitsX)) * lift;
          const sy = ((relief[k + RN]! - relief[k - RN]!) / (2 * unitsY)) * lift;
          // n . L over L.z, so flat ground is exactly 1: L = (-1, -1, sqrt 2) / 2.
          const shade = (0.5 * sx + 0.5 * sy + 0.7071) / Math.sqrt(sx * sx + sy * sy + 1) / 0.7071;
          light[k] = Math.min(1.22, Math.max(0.58, shade));
        }
      }
    }

    // Composed, a band of rows at a time: the whole tile in one step was the
    // longest stretch the painter held a frame for.
    const image = new ImageData(TILE, TILE);
    const out = image.data;
    for (let y = 0; y < TILE; y++) {
      if (y > 0 && y % COMPOSE_ROWS === 0) yield;
      const ly = y / RS + 1;
      const ly0 = Math.floor(ly);
      const lfy = ly - ly0;
      const gy = y / COLOUR_STEP;
      const gy0 = Math.min(GN - 2, Math.floor(gy));
      const fy = gy - gy0;
      for (let x = 0; x < TILE; x++) {
        const m = (y + PAD) * M + (x + PAD);
        const a = land[m]!;
        let r = oceanDeep.r;
        let g = oceanDeep.g;
        let b = oceanDeep.b;
        const shallow = Math.min(1, near[m]! * 2.2);
        if (shallow > 0) {
          const s = Math.sqrt(shallow);
          r += (oceanShallow.r - r) * s;
          g += (oceanShallow.g - g) * s;
          b += (oceanShallow.b - b) * s;
        }
        if (a > 0) {
          const gx = x / COLOUR_STEP;
          const gx0 = Math.min(GN - 2, Math.floor(gx));
          const fx = gx - gx0;
          let lr = 0;
          let lg = 0;
          let lb = 0;
          let weight = 0;
          for (let c = 0; c < 4; c++) {
            const cx = gx0 + (c & 1);
            const cy = gy0 + (c >> 1);
            const idx = cy * GN + cx;
            if (known[idx] === 0) continue;
            const w = ((c & 1) === 1 ? fx : 1 - fx) * ((c >> 1) === 1 ? fy : 1 - fy) + 1e-4;
            lr += lattice[idx * 3]! * w;
            lg += lattice[idx * 3 + 1]! * w;
            lb += lattice[idx * 3 + 2]! * w;
            weight += w;
          }
          if (weight > 0) {
            lr /= weight;
            lg /= weight;
            lb /= weight;
          } else {
            lr = fallbackLand.r;
            lg = fallbackLand.g;
            lb = fallbackLand.b;
          }
          const lx = x / RS + 1;
          const lx0 = Math.floor(lx);
          const lfx = lx - lx0;
          const k = ly0 * RN + lx0;
          const shade =
            (light[k]! * (1 - lfx) + light[k + 1]! * lfx) * (1 - lfy) +
            (light[k + RN]! * (1 - lfx) + light[k + RN + 1]! * lfx) * lfy;
          lr *= shade;
          lg *= shade;
          lb *= shade;
          r += (lr - r) * a;
          g += (lg - g) * a;
          b += (lb - b) * a;
        }
        const o = (y * TILE + x) * 4;
        // THREE's colours are linear; the canvas is sRGB.
        out[o] = toByte(r);
        out[o + 1] = toByte(g);
        out[o + 2] = toByte(b);
        out[o + 3] = 255;
      }
    }
    const painted = document.createElement('canvas');
    painted.width = painted.height = TILE;
    painted.getContext('2d')!.putImageData(image, 0, 0);
    tile.canvas = painted;
    tile.job = null;
    // Swapped for a bitmap when the browser has made one; drawn from the
    // canvas until then. A tile evicted meanwhile lets its bitmap go.
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(painted).then(
        (bitmap) => {
          if (tiles.get(tileKey(tile.z, tile.i, tile.j)) === tile && tile.canvas === painted) tile.canvas = bitmap;
          else bitmap.close();
        },
        () => {
          // The canvas it was painted on serves.
        },
      );
    }
  }

  /** Drops a tile, and the bitmap it holds with it. */
  function dropTile(tile: Tile): void {
    if (typeof ImageBitmap !== 'undefined' && tile.canvas instanceof ImageBitmap) tile.canvas.close();
    tile.canvas = null;
    tile.job = null;
    tiles.delete(tileKey(tile.z, tile.i, tile.j));
  }

  /** Runs tile jobs, nearest the middle first, until the allowance is spent. */
  function paintTiles(budgetMs: number): boolean {
    if (wanted.length === 0) return false;
    const start = performance.now();
    let finished = false;
    while (wanted.length > 0 && performance.now() - start < budgetMs) {
      const tile = wanted[0]!;
      if (tile.job === null) {
        wanted.shift();
        continue;
      }
      if (tile.job.next().done === true) {
        tile.job = null;
        wanted.shift();
        finished = true;
      }
    }
    return finished;
  }

  /**
   * Down to `limit` tiles past the first levels, the least recently drawn
   * first. A tile asked for and never finished counts once no draw wants it:
   * a quick pan leaves a trail of them, each holding its half-painted job, and
   * they used to stay in the table for good.
   */
  function evictTiles(limit: number): void {
    const pending = new Set(wanted);
    const loose = [...tiles.values()].filter((tile) => tile.z > KEEP_LEVEL && (tile.canvas !== null || !pending.has(tile)));
    if (loose.length <= limit) return;
    loose.sort((a, b) => a.used - b.used);
    for (let k = 0; k < loose.length - limit; k++) dropTile(loose[k]!);
  }

  /** The first levels, painted in one go the first time the sheet opens. */
  let primed = false;
  function prime(): void {
    if (primed) return;
    primed = true;
    const tile = tileOf(0, 0, 0);
    while (tile.job !== null && tile.job.next().done !== true) {
      // Painting the whole world's first tile, synchronously.
    }
    tile.job = null;
    for (let z = 1; z <= KEEP_LEVEL; z++) {
      for (let j = 0; j < rowsAt(z); j++) for (let i = 0; i < 2 ** z; i++) wanted.push(tileOf(z, i, j));
    }
  }

  /**
   * The tiles a view at this middle and zoom draws, nearest the middle first,
   * without drawing: what `warm` paints before the sheet is opened on it.
   */
  function tilesAt(midU: number, midV: number, scale: number): Tile[] {
    const z = Math.min(MAX_LEVEL, Math.max(0, Math.round(Math.log2((scale * Math.min(ratio, 1.5)) / TILE))));
    const n = 2 ** z;
    const rows = rowsAt(z);
    const halfU = width / 2 / scale;
    const halfV = height / 2 / scale;
    const out: { tile: Tile; d: number }[] = [];
    for (let j = Math.max(0, Math.floor((midV - halfV) * n)); j <= Math.min(rows - 1, Math.floor((midV + halfV) * n)); j++) {
      for (let i = Math.floor((midU - halfU) * n); i <= Math.floor((midU + halfU) * n); i++) {
        const d = Math.hypot((i + 0.5) / n - midU, (j + 0.5) / n - midV);
        out.push({ tile: tileOf(z, ((i % n) + n) % n, j), d });
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out.map((entry) => entry.tile);
  }

  const createdAt = performance.now();
  let warmedAt = -Infinity;
  let warmedKey = '';
  /**
   * While the sheet is shut: the first levels, then the screenful it would
   * open on, painted in what is left of the frame's far allowance.
   */
  function warm(now: number): void {
    if (!me.known || now - createdAt < WARM_AFTER_MS || !frameOpen(false)) return;
    if (wanted.length === 0) {
      if (width === 0) resize();
      if (width <= 1) return;
      const z = Math.min(MAX_LEVEL, Math.max(0, Math.round(Math.log2((S * Math.min(ratio, 1.5)) / TILE))));
      const n = 2 ** z;
      const key = `${z}:${Math.floor(me.u * n)}:${Math.floor(me.v * n)}`;
      if (key === warmedKey || now - warmedAt < WARM_EVERY_MS) return;
      warmedKey = key;
      warmedAt = now;
      const queue = [tileOf(0, 0, 0)];
      for (let level = 1; level <= KEEP_LEVEL; level++) {
        for (let j = 0; j < rowsAt(level); j++) for (let i = 0; i < 2 ** level; i++) queue.push(tileOf(level, i, j));
      }
      queue.push(...tilesAt(me.u, me.v, S));
      for (const tile of queue) if (tile.job !== null) wanted.push(tile);
      if (tiles.size > MAX_TILES + 40) evictTiles(MAX_TILES);
    }
    paintTiles(WARM_BUDGET_MS);
  }

  // --- the view --------------------------------------------------------------

  let width = 0;
  let height = 0;
  let ratio = 1;
  /** The middle of the screen, in map units, and pixels per map unit. */
  let cu = 0.5;
  let cv = SHEET_HEIGHT / 2;
  let S = 0;
  let zoomSet = false;
  let canvasLeft = 3;
  let canvasTop = 3;
  /** And where it sits in the window, for the pointer: the sheet is fixed, so this moves only on a resize. */
  let canvasX = 17;
  let canvasY = 17;

  const minScale = (): number => Math.max(width, height / SHEET_HEIGHT) * 0.999;
  const maxScale = (): number => TILE * 2 ** MAX_LEVEL;

  function clampView(): void {
    S = Math.min(maxScale(), Math.max(minScale(), S));
    cu -= Math.floor(cu);
    const halfV = height / 2 / S;
    if (SHEET_HEIGHT <= 2 * halfV) cv = SHEET_HEIGHT / 2;
    else cv = Math.min(SHEET_HEIGHT - halfV, Math.max(halfV, cv));
  }

  function resize(): void {
    const box = sheet.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width - 6));
    height = Math.max(1, Math.round(box.height - 6));
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = marksCanvas.width = Math.round(width * ratio);
    canvas.height = marksCanvas.height = Math.round(height * ratio);
    // Where the canvas sits in the sheet, for the tip: read here, once, and
    // not off two layouts on every move of the mouse.
    const inner = canvas.getBoundingClientRect();
    canvasLeft = inner.left - box.left;
    canvasTop = inner.top - box.top;
    canvasX = inner.left;
    canvasY = inner.top;
    if (!zoomSet) {
      S = (width * 360) / OPEN_DEGREES;
      zoomSet = true;
    }
    clampView();
    dirty = true;
  }

  /** Screen position of a map point, taking the copy of the sheet nearest the middle. */
  const screenX = (u: number): number => {
    let du = u - cu;
    du -= Math.round(du);
    return width / 2 + du * S;
  };
  const screenY = (v: number): number => height / 2 + (v - cv) * S;

  function zoomAt(factor: number, x: number, y: number): void {
    const u = cu + (x - width / 2) / S;
    const v = cv + (y - height / 2) / S;
    S *= factor;
    S = Math.min(maxScale(), Math.max(minScale(), S));
    cu = u - (x - width / 2) / S;
    cv = v - (y - height / 2) / S;
    clampView();
    dirty = true;
  }

  // --- the player ------------------------------------------------------------

  const me = { u: 0.5, v: SHEET_HEIGHT / 2, lat: 0, lon: 0, heading: 0, known: false };
  const meLatLon = { lat: 0, lon: 0 };

  function centreOnMe(): void {
    if (!me.known) return;
    cu = me.u;
    cv = me.v;
    clampView();
    dirty = true;
  }

  // --- drawing ----------------------------------------------------------------

  /** The sheet wants drawing again: the view, a tile, the names or the destination changed. */
  let dirty = true;
  /** Only the marks over it do: you, a player, a pin under the cursor. */
  let marksDirty = true;
  /** When the marks were last drawn, for `MAX_FPS`. */
  let drawnAt = 0;
  let drawMs = 0;
  let marksMs = 0;
  let level = 0;
  /** What the cursor can point at on the sheet — towns and pins — and over it, the players. */
  const hits: Hit[] = [];
  const peerHits: Hit[] = [];
  /** Where you stood on the screen when the names were laid out round you. */
  let laidMeX = -1e9;
  let laidMeY = -1e9;
  /** Until when the sheet is being moved by hand, and whether the last draw was one of those. */
  let busyUntil = 0;
  let drawnBusy = false;
  const busy = (): boolean => performance.now() < busyUntil;
  /**
   * Label widths by font and text. The names are laid out again on every
   * redraw and most of them are the same names at the same size: a drag used
   * to measure every one of them every frame.
   */
  const widths = new Map<string, number>();
  function textWidth(font: string, text: string): number {
    const key = `${font}|${text}`;
    let width = widths.get(key);
    if (width === undefined) {
      if (widths.size > 6000) widths.clear();
      ctx.font = font;
      width = ctx.measureText(text).width;
      widths.set(key, width);
    }
    return width;
  }

  function drawTiles(): void {
    level = Math.min(MAX_LEVEL, Math.max(0, Math.round(Math.log2((S * Math.min(ratio, 1.5)) / TILE))));
    const n = 2 ** level;
    const tilePx = S / n;
    const rows = rowsAt(level);
    const uLeft = cu - width / 2 / S;
    const iFirst = Math.floor(uLeft * n);
    const iLast = Math.floor((cu + width / 2 / S) * n);
    const jFirst = Math.max(0, Math.floor((cv - height / 2 / S) * n));
    const jLast = Math.min(rows - 1, Math.floor((cv + height / 2 / S) * n));
    const want: { tile: Tile; d: number }[] = [];
    ctx.imageSmoothingEnabled = true;
    // The best filter only once the sheet is still; while it moves, the
    // plain one, and the still frame after it draws the fine one.
    drawnBusy = busy();
    ctx.imageSmoothingQuality = drawnBusy ? 'low' : 'high';
    for (let j = jFirst; j <= jLast; j++) {
      for (let i = iFirst; i <= iLast; i++) {
        const wrapI = ((i % n) + n) % n;
        const x = width / 2 + (i / n - cu) * S;
        const y = height / 2 + (j / n - cv) * S;
        const tile = tileOf(level, wrapI, j);
        // A hair over a pixel each way, so the seams between scaled tiles
        // never show the sea underneath.
        if (tile.canvas !== null) {
          ctx.drawImage(tile.canvas, x, y, tilePx + 0.6, tilePx + 0.6);
          continue;
        }
        want.push({ tile, d: Math.hypot(x + tilePx / 2 - width / 2, y + tilePx / 2 - height / 2) });
        // The nearest painted ancestor, cut down to this tile's corner of it.
        for (let up = 1; up <= level; up++) {
          const parent = tiles.get(tileKey(level - up, wrapI >> up, j >> up));
          if (parent?.canvas == null) continue;
          parent.used = ++useClock;
          const part = TILE / 2 ** up;
          ctx.drawImage(
            parent.canvas,
            (wrapI - ((wrapI >> up) << up)) * part,
            (j - ((j >> up) << up)) * part,
            part,
            part,
            x,
            y,
            tilePx + 0.6,
            tilePx + 0.6,
          );
          break;
        }
      }
    }
    // What this view wants comes first, nearest the middle; the first levels'
    // backlog stays behind it.
    want.sort((a, b) => a.d - b.d);
    const behind = wanted.filter((tile) => tile.z <= KEEP_LEVEL && tile.job !== null);
    wanted.length = 0;
    for (const { tile } of want) wanted.push(tile);
    for (const tile of behind) if (!wanted.includes(tile)) wanted.push(tile);
  }

  function drawGraticule(): void {
    const pxPerDegree = S / 360;
    if (pxPerDegree > 40) return;
    const step = pxPerDegree < 6 ? 30 : pxPerDegree < 16 ? 15 : 5;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 242, 232, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lon = -180; lon < 180; lon += step) {
      const x = screenX(uOf(lon));
      if (x < 0 || x > width) continue;
      ctx.moveTo(x, Math.max(0, screenY(0)));
      ctx.lineTo(x, Math.min(height, screenY(SHEET_HEIGHT)));
    }
    for (let lat = -90 + step; lat < 90; lat += step) {
      const y = screenY(vOf(lat));
      if (y < 0 || y > height) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawOutlines(): void {
    const sheetRings = prepareRings();
    const coast = new Path2D();
    const frontier = new Path2D();
    // Thinned to the zoom (`map-outline.ts`), and at the planet's own zoom by
    // a little more than a pixel: the whole world across one screen is tens of
    // thousands of segments of coast, and a line a pixel wide shows nothing
    // of the ones a pixel and a half apart.
    traceOutlines(sheetRings, { cu, cv, S, width, height }, coast, frontier, S < PLANET_ZOOM ? 1.5 : 0.8);
    const pxPerDegree = S / 360;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(30, 6, 3, 0.42)';
    ctx.lineWidth = pxPerDegree < 8 ? 0.8 : 1.3;
    ctx.setLineDash(pxPerDegree < 8 ? [] : [5, 4]);
    ctx.stroke(frontier);
    ctx.setLineDash([]);
    ctx.strokeStyle = ink;
    ctx.lineWidth = pxPerDegree < 4 ? 1 : pxPerDegree < 30 ? 1.5 : 2.2;
    ctx.stroke(coast);
    ctx.restore();
  }

  function drawRoads(): void {
    const pxPerDegree = S / 360;
    if (pxPerDegree < ROADS_FROM || options.roads === undefined) return;
    const all = prepareRoads();
    const uLeft = cu - width / 2 / S;
    const uRight = cu + width / 2 / S;
    const vTop = cv - height / 2 / S;
    const vBottom = cv + height / 2 / S;
    const lanes = pxPerDegree >= LANES_FROM;
    const widthOf = [lanes ? 1.6 : 0, 2.4, 3.4];
    const zoomGain = Math.min(1.8, Math.max(1, Math.log2(pxPerDegree / ROADS_FROM) * 0.35 + 1));
    const paths = [new Path2D(), new Path2D(), new Path2D()];
    for (const road of all) {
      if (widthOf[road.road.cls] === 0) continue;
      if (road.v1 < vTop || road.v0 > vBottom) continue;
      let wrap = 0;
      if (road.u1 < uLeft) wrap = 1;
      else if (road.u0 > uRight) wrap = -1;
      if (road.u1 + wrap < uLeft || road.u0 + wrap > uRight) continue;
      if (road.u === null) traceRoad(road);
      const path = paths[road.road.cls] ?? paths[0]!;
      const originX = width / 2 + (wrap - cu) * S;
      const originY = height / 2 - cv * S;
      for (let k = 0; k < ROAD_SAMPLES; k++) {
        const x = originX + road.u![k]! * S;
        const y = originY + road.v![k]! * S;
        if (k === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
    }
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Casing first under all three classes, so a junction is one piece of
    // road rather than three lines crossing.
    ctx.strokeStyle = 'rgba(30, 6, 3, 0.55)';
    for (let c = 0; c < 3; c++) {
      if (widthOf[c] === 0) continue;
      ctx.lineWidth = widthOf[c]! * zoomGain + 2;
      ctx.stroke(paths[c]!);
    }
    const fills = [hex(PALETTE.cream), hex(PALETTE.white), hex(PALETTE.apricot)];
    for (let c = 0; c < 3; c++) {
      if (widthOf[c] === 0) continue;
      ctx.strokeStyle = fills[c]!;
      ctx.lineWidth = widthOf[c]! * zoomGain;
      ctx.stroke(paths[c]!);
    }
    ctx.restore();
  }

  /** The landmarks surviving the thinning this draw, as indices into `monuments`. */
  const keptPins: { index: number; x: number; y: number }[] = [];

  function layoutAndDraw(space: LabelSpace): void {
    const pxPerDegree = S / 360;
    const chosen = target();
    hits.length = 0;

    // You, first: nothing is allowed to sit on the arrow.
    let meX = -1e9;
    let meY = -1e9;
    if (me.known) {
      meX = screenX(me.u);
      meY = screenY(me.v);
      space.claim(meX - 14, meY - 14, 28, 28);
    }
    laidMeX = meX;
    laidMeY = meY;

    // The landmarks: which pins stand, the destination always.
    keptPins.length = 0;
    const order = monuments.map((_, index) => index);
    order.sort((a, b) => {
      const ca = monuments[a]!.id === chosen ? 0 : 1;
      const cb = monuments[b]!.id === chosen ? 0 : 1;
      return ca - cb;
    });
    for (const index of order) {
      const monument = monuments[index]!;
      const x = screenX(uOf(monument.lon));
      const y = screenY(vOf(monument.lat));
      if (x < -30 || x > width + 30 || y < -30 || y > height + 40) continue;
      if (monument.id !== chosen) {
        let crowded = false;
        for (const pin of keptPins) {
          if (Math.abs(pin.x - x) < PIN_SPACING && Math.abs(pin.y - y) < PIN_SPACING) {
            crowded = true;
            break;
          }
        }
        if (crowded) continue;
      }
      keptPins.push({ index, x, y });
      space.claim(x - PIN_HEAD - 2, y - PIN_RISE - PIN_HEAD - 2, PIN_HEAD * 2 + 4, PIN_RISE + PIN_HEAD + 4);
    }

    // Names, most important first: the pins', then the countries', then the towns'.
    const labels: { text: string; x: number; y: number; font: string; fill: string; halo: string; weight: number; align: CanvasTextAlign }[] = [];
    const tryLabel = (
      text: string,
      x: number,
      y: number,
      font: string,
      size: number,
      fill: string,
      halo: string,
      align: CanvasTextAlign,
      spacing = 0,
    ): boolean => {
      const w = textWidth(font, text) + spacing * text.length;
      const left = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
      if (left < 4 || left + w > width - 4 || y - size < 4 || y + 4 > height) return false;
      if (!space.fits(left - 3, y - size * 0.62 - 3, w + 6, size * 1.24 + 6)) return false;
      space.claim(left - 3, y - size * 0.62 - 3, w + 6, size * 1.24 + 6);
      labels.push({ text, x, y, font, fill, halo, weight: 4, align });
      return true;
    };

    const pinFont = `800 12.5px ${FONT}`;
    for (const pin of keptPins) {
      const monument = monuments[pin.index]!;
      const showName = pxPerDegree >= 5 || monument.id === chosen;
      if (!showName) continue;
      tryLabel(monument.name, pin.x + PIN_HEAD + 5, pin.y - PIN_RISE, pinFont, 12.5, ink, paper, 'left');
    }

    // Countries: while a country is on the sheet at a size a name fits in, and
    // not once it is bigger than the screen, where its name is only in the way.
    const countryAlpha = pxPerDegree < 60 ? 1 : 0;
    if (countryAlpha > 0) {
      for (const label of countryLabels) {
        const px = label.span * S;
        if (px < 70 || px > width * 2.2) continue;
        const size = Math.round(Math.min(17, Math.max(10.5, 9 + px / 60)));
        const x = screenX(label.u);
        const y = screenY(label.v);
        if (x < 0 || x > width || y < 0 || y > height) continue;
        tryLabel(label.text, x, y, `800 ${size}px ${FONT}`, size, 'rgba(30, 6, 3, 0.62)', 'rgba(255, 242, 232, 0.55)', 'center', 1.6);
      }
    }

    // The towns: by rank, as many as there is room for above the zoom's floor.
    let floor = 0;
    for (const [upTo, pop] of TOWN_FLOOR) {
      if (pxPerDegree < upTo) {
        floor = pop;
        break;
      }
    }
    const unitsPerPx = (360 / S) * UNITS_PER_DEGREE;
    const townMarks: { town: SheetTown; x: number; y: number; side: number }[] = [];
    let named = 0;
    for (const town of towns) {
      const capitalNamed = town.place.capital === true && pxPerDegree >= TOWN_FLOOR[0]![0];
      if (town.place.pop < floor && !capitalNamed) {
        // Below the floor it is not named, but at a street zoom it is still
        // drawn: a square on the sheet where a town stands.
        if (pxPerDegree < 70) continue;
      }
      const x = screenX(town.u);
      const y = screenY(town.v);
      if (x < -60 || x > width + 60 || y < -60 || y > height + 60) continue;
      const cosLat = Math.max(0.05, Math.cos(town.place.lat * DEG));
      const side = (town.radius * Math.SQRT2) / (unitsPerPx * cosLat) * 1;
      const canName = town.place.pop >= floor || capitalNamed;
      let labelled = false;
      if (canName && named < 260) {
        const big = town.place.capital === true || town.place.pop >= 1_000_000;
        const size = big ? 13.5 : 12;
        const font = `${big ? 800 : 700} ${size}px ${FONT}`;
        const offset = Math.max(side / 2, 4) + 5;
        labelled = tryLabel(town.place.name, x + offset, y + 4, font, size, ink, paper, 'left');
        if (!labelled && side > 40) labelled = tryLabel(town.place.name, x, y + 4, font, size, ink, paper, 'center');
        if (labelled) named++;
      }
      if (labelled || (side >= SQUARE_FROM && pxPerDegree >= 70)) {
        townMarks.push({ town, x, y, side });
        if (side < SQUARE_FROM) space.claim(x - 5, y - 5, 10, 10);
      }
    }

    // --- and now paint it, back to front --------------------------------------

    ctx.save();
    ctx.lineJoin = 'round';
    for (const mark of townMarks) {
      const { x, y, side, town } = mark;
      if (side >= SQUARE_FROM) {
        drawTown(town, x, y, side);
      } else {
        const capital = town.place.capital === true;
        ctx.beginPath();
        ctx.arc(x, y, capital ? 4.5 : 3.4, 0, TAU);
        ctx.fillStyle = paper;
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = ink;
        ctx.stroke();
        if (capital) {
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, TAU);
          ctx.fillStyle = ink;
          ctx.fill();
        }
      }
      hits.push({ kind: 'town', town, x, y });
    }

    for (const label of labels) {
      ctx.font = label.font;
      ctx.textAlign = label.align;
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx && label.fill.startsWith('rgba')) (ctx as { letterSpacing: string }).letterSpacing = '1.6px';
      inkedText(ctx, label.text, label.x, label.y, label.halo, label.fill, label.weight);
      if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = '0px';
    }

    // The pins are drawn over the sheet with the marks; what is pointed at
    // is known here, where they were laid out.
    for (const pin of keptPins) {
      const grow = monuments[pin.index]!.id === chosen ? 1.2 : 1;
      hits.push({ kind: 'pin', index: pin.index, x: pin.x, y: pin.y - PIN_RISE * grow });
    }
    ctx.restore();
  }

  const blockFill = hex(PALETTE.blush);
  const streetFill = hex(PALETTE.white);
  /**
   * A town as it is built: its blocks, its streets and the ragged edge the
   * outskirts leave, inked round the outside only. Below `CELLS_FROM` a cell
   * is too small to read and the town is one colour with the same outline.
   */
  function drawTown(town: SheetTown, x: number, y: number, side: number): void {
    const grid = townGrid(town.radius);
    const cells = cellsOf(town);
    const n = grid.cells;
    const cell = side / n;
    const left = x - side / 2;
    const top = y - side / 2;
    const detailed = cell >= CELLS_FROM;
    // Rows run north, the sheet runs south: row `r` is drawn at `n - 1 - r`.
    ctx.fillStyle = blockFill;
    ctx.beginPath();
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (cells[row * n + col] === 0) continue;
        ctx.rect(left + col * cell, top + (n - 1 - row) * cell, cell + 0.4, cell + 0.4);
      }
    }
    ctx.fill();
    if (detailed) {
      // The streets: whole avenue cells, and the bands `townGrid` lays along a
      // boundary between two cells — the square is symmetric, so one list of
      // boundaries is both the north-south and the east-west streets. Clipped
      // to the cells that stand, so a street stops where the outskirts begin.
      ctx.save();
      ctx.beginPath();
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          if (cells[row * n + col] !== 0) ctx.rect(left + col * cell, top + (n - 1 - row) * cell, cell + 0.4, cell + 0.4);
        }
      }
      ctx.clip();
      ctx.fillStyle = streetFill;
      ctx.beginPath();
      const band = cell * 0.2;
      for (let c = 0; c < n; c++) {
        if (grid.avenue[c] === 1) {
          ctx.rect(left + c * cell, top, cell, side);
          ctx.rect(left, top + (n - 1 - c) * cell, side, cell);
        }
        if (c + 1 < n && (grid.high[c] === 1 || grid.low[c + 1] === 1)) {
          ctx.rect(left + (c + 1) * cell - band, top, 2 * band, side);
          ctx.rect(left, top + (n - 1 - c) * cell - band, side, 2 * band);
        }
      }
      ctx.fill();
      ctx.restore();
    }
    // The outline: every side of a standing cell whose neighbour is not.
    const standing = (col: number, row: number): boolean =>
      col >= 0 && row >= 0 && col < n && row < n && cells[row * n + col] !== 0;
    ctx.strokeStyle = ink;
    ctx.lineWidth = detailed ? 2 : 1.4;
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (!standing(col, row)) continue;
        const x0 = left + col * cell;
        const y0 = top + (n - 1 - row) * cell;
        if (!standing(col, row + 1)) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + cell, y0); }
        if (!standing(col, row - 1)) { ctx.moveTo(x0, y0 + cell); ctx.lineTo(x0 + cell, y0 + cell); }
        if (!standing(col - 1, row)) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + cell); }
        if (!standing(col + 1, row)) { ctx.moveTo(x0 + cell, y0); ctx.lineTo(x0 + cell, y0 + cell); }
      }
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawPin(x: number, y: number, fill: string, grow: number): void {
    const rise = PIN_RISE * grow;
    const head = PIN_HEAD * grow;
    mctx.beginPath();
    mctx.moveTo(x, y);
    mctx.lineTo(x - head * 0.72, y - rise + head * 0.35);
    mctx.arc(x, y - rise, head, Math.PI * 0.78, Math.PI * 0.22, false);
    mctx.closePath();
    mctx.fillStyle = fill;
    mctx.fill();
    mctx.lineWidth = 2;
    mctx.strokeStyle = ink;
    mctx.stroke();
    mctx.beginPath();
    mctx.arc(x, y - rise, head * 0.36, 0, TAU);
    mctx.fillStyle = ink;
    mctx.fill();
  }

  const routeA = new THREE.Vector3();
  const routeB = new THREE.Vector3();
  const routeP = new THREE.Vector3();
  const routeLatLon = { lat: 0, lon: 0 };
  function drawRoute(to: Placement): void {
    unitAt(me.lat, me.lon, routeA);
    unitAt(to.lat, to.lon, routeB);
    const angle = routeA.angleTo(routeB);
    if (angle < 1e-5) return;
    const steps = Math.max(8, Math.ceil(angle * R2D));
    const sinA = Math.sin(angle);
    mctx.beginPath();
    let lastU = 0;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const a = Math.sin((1 - t) * angle) / sinA;
      const b = Math.sin(t * angle) / sinA;
      routeP.set(routeA.x * a + routeB.x * b, routeA.y * a + routeB.y * b, routeA.z * a + routeB.z * b);
      latLonOf(routeP, routeLatLon);
      let u = uOf(routeLatLon.lon);
      if (k === 0) u = cu + (screenX(u) - width / 2) / S;
      else u -= Math.round(u - lastU);
      lastU = u;
      const x = width / 2 + (u - cu) * S;
      const y = screenY(vOf(routeLatLon.lat));
      if (k === 0) mctx.moveTo(x, y);
      else mctx.lineTo(x, y);
    }
    mctx.lineCap = 'round';
    mctx.setLineDash([]);
    mctx.strokeStyle = ink;
    mctx.lineWidth = 5;
    mctx.stroke();
    mctx.setLineDash([7, 7]);
    mctx.strokeStyle = violet;
    mctx.lineWidth = 3;
    mctx.stroke();
    mctx.setLineDash([]);
  }

  function drawPeers(): void {
    const list = options.peers?.() ?? [];
    const peerLatLon = { lat: 0, lon: 0 };
    mctx.font = `800 12px ${FONT}`;
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    for (const peer of list) {
      latLonOf(peer, peerLatLon);
      const x = screenX(uOf(peerLatLon.lon));
      const y = screenY(vOf(peerLatLon.lat));
      if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
      const grow = hover?.kind === 'peer' && hover.id === peer.id ? 1.35 : 1;
      mctx.beginPath();
      mctx.arc(x, y, 6 * grow, 0, TAU);
      mctx.fillStyle = pink;
      mctx.fill();
      mctx.lineWidth = 2;
      mctx.strokeStyle = ink;
      mctx.stroke();
      inkedText(mctx, peer.name, x, y - 15, paper, ink, 4);
      unitAt(me.lat, me.lon, routeA);
      const distance = routeA.angleTo(routeB.set(peer.x, peer.y, peer.z).normalize()) * EARTH_KM;
      peerHits.push({ kind: 'peer', id: peer.id, name: peer.name, x, y, distance });
    }
  }

  function drawMe(x: number, y: number): void {
    mctx.save();
    mctx.translate(x, y);
    mctx.beginPath();
    mctx.arc(0, 0, 13, 0, TAU);
    mctx.fillStyle = 'rgba(255, 242, 232, 0.35)';
    mctx.fill();
    mctx.rotate(me.heading);
    mctx.beginPath();
    mctx.moveTo(0, -11);
    mctx.lineTo(8, 8);
    mctx.lineTo(0, 4);
    mctx.lineTo(-8, 8);
    mctx.closePath();
    mctx.fillStyle = hex(PALETTE.crimson);
    mctx.fill();
    mctx.lineJoin = 'round';
    mctx.lineWidth = 2.5;
    mctx.strokeStyle = ink;
    mctx.stroke();
    mctx.restore();
  }

  function drawScale(): void {
    const lat = latOfV(cv);
    const kmPerPx = ((TAU * EARTH_KM) / S) * Math.max(0.05, Math.cos(lat * DEG));
    const raw = kmPerPx * 110;
    const power = 10 ** Math.floor(Math.log10(raw));
    const nice = [1, 2, 5, 10].map((m) => m * power).filter((value) => value <= raw).pop() ?? power;
    scaleText.textContent = nice >= 1 ? km(nice) : `${Math.round(nice * 1000)} m`;
    scaleBar.style.width = `${Math.round(nice / kmPerPx)}px`;
  }

  /** The sheet: the tiles, the lines, the towns and the names. */
  function draw(): void {
    const started = performance.now();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = oceanHex;
    ctx.fillRect(0, 0, width, height);
    drawTiles();
    drawGraticule();
    drawOutlines();
    drawRoads();
    layoutAndDraw(new LabelSpace());
    drawScale();
    drawMs = performance.now() - started;
    dirty = false;
    marksDirty = true;
  }

  /** What stands over it: the route, the pins, the players and you. */
  function drawMarks(): void {
    const started = performance.now();
    mctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    mctx.clearRect(0, 0, width, height);
    mctx.lineJoin = 'round';
    const chosen = target();
    // The route to the destination: the great circle, dashed.
    if (chosen !== null && me.known) {
      const to = monuments.find((monument) => monument.id === chosen);
      if (to !== undefined) drawRoute(to);
    }
    for (const pin of keptPins) {
      const monument = monuments[pin.index]!;
      const fill = monument.id === chosen ? violet : isVisited(monument.id) ? gold : paper;
      const grow = hover?.kind === 'pin' && hover.index === pin.index ? 1.3 : monument.id === chosen ? 1.2 : 1;
      drawPin(pin.x, pin.y, fill, grow);
    }
    peerHits.length = 0;
    drawPeers();
    if (me.known) drawMe(screenX(me.u), screenY(me.v));
    marksMs = performance.now() - started;
    marksDirty = false;
    drawnAt = started;
  }

  // --- pointing ----------------------------------------------------------------

  let hover: Hit | null = null;

  function pickAt(clientX: number, clientY: number): Hit | null {
    const x = clientX - canvasX;
    const y = clientY - canvasY;
    let best: Hit | null = null;
    let bestScore = Infinity;
    for (const hit of hits.length === 0 ? peerHits : peerHits.length === 0 ? hits : [...hits, ...peerHits]) {
      const d = Math.hypot(hit.x - x, hit.y - y);
      // Players first, then pins, then towns: a town under a pin is the pin.
      const bias = hit.kind === 'peer' ? 0 : hit.kind === 'pin' ? 4 : 8;
      if (d > PICK_RANGE) continue;
      if (d + bias < bestScore) {
        bestScore = d + bias;
        best = hit;
      }
    }
    return best;
  }

  function sameHit(a: Hit | null, b: Hit | null): boolean {
    if (a === null || b === null) return a === b;
    if (a.kind === 'pin' && b.kind === 'pin') return a.index === b.index;
    if (a.kind === 'peer' && b.kind === 'peer') return a.id === b.id;
    if (a.kind === 'town' && b.kind === 'town') return a.town === b.town;
    return false;
  }

  const tipPoint = new THREE.Vector3();
  /** What the tip is showing, so that a move of the mouse over the same mark only moves it. */
  let tipFor: Hit | null = null;
  let tipIso = '';
  function tipFlagFor(iso: string): void {
    if (iso === tipIso) return;
    tipIso = iso;
    const flag = createFlagCanvas(iso, 34, 23);
    flag.className = 'ui-flag';
    tipFlag.replaceChildren(flag);
  }
  function renderTip(): void {
    if (hover === null) {
      tip.classList.remove('on');
      tipFor = null;
      return;
    }
    if (!sameHit(hover, tipFor)) fillTip(hover);
    tip.style.left = `${canvasLeft + hover.x}px`;
    tip.style.top = `${canvasTop + hover.y - (hover.kind === 'pin' ? 4 : 8)}px`;
    tip.classList.add('on');
  }
  function fillTip(hit: Hit): void {
    tipFor = hit;
    unitAt(me.lat, me.lon, routeA);
    if (hit.kind === 'peer') {
      tipName.textContent = hit.name;
      tipSub.replaceChildren(h('b', { text: km(hit.distance) }), options.onJoin ? ' · click to join' : '');
      tipFlag.replaceChildren();
      tipIso = '';
    } else if (hit.kind === 'pin') {
      const monument = monuments[hit.index]!;
      unitAt(monument.lat, monument.lon, tipPoint);
      const distance = routeA.angleTo(tipPoint) * EARTH_KM;
      tipName.textContent = monument.name;
      tipSub.replaceChildren(
        `${countryName.get(monument.iso) ?? monument.iso} · `,
        h('b', { text: km(distance) }),
        isVisited(monument.id) ? ' · found' : '',
      );
      tipFlagFor(monument.iso);
    } else {
      const place = hit.town.place;
      unitAt(place.lat, place.lon, tipPoint);
      const distance = routeA.angleTo(tipPoint) * EARTH_KM;
      tipName.textContent = place.name;
      tipSub.replaceChildren(
        `${countryName.get(place.iso) ?? place.iso} · ${people(place.pop)} · `,
        h('b', { text: km(distance) }),
      );
      tipFlagFor(place.iso);
    }
  }

  function refreshCount(): void {
    let found = 0;
    for (const monument of monuments) if (isVisited(monument.id)) found++;
    count.textContent = `${found} of ${monuments.length} landmarks found`;
  }

  const events = new AbortController();
  const { signal } = events;

  let press: { id: number; x: number; y: number; cu: number; cv: number; moved: boolean } | null = null;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, cu, cv, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }, { signal });

  canvas.addEventListener('pointermove', (event) => {
    if (press !== null && event.pointerId === press.id) {
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (!press.moved && Math.hypot(dx, dy) > CLICK_SLOP) {
        press.moved = true;
        sheet.classList.add('drag');
        hover = null;
        renderTip();
      }
      if (press.moved) {
        // Only the view is written here: the sheet is drawn once, in the
        // next frame's `update`, however many moves the pointer sent.
        cu = press.cu - dx / S;
        cv = press.cv - dy / S;
        clampView();
        dirty = true;
        busyUntil = performance.now() + SETTLE_MS;
        return;
      }
    }
    const next = pickAt(event.clientX, event.clientY);
    sheet.classList.toggle('point', next !== null && next.kind !== 'town');
    if (!sameHit(next, hover)) {
      hover = next;
      marksDirty = true;
    }
    renderTip();
  }, { signal });

  const release = (event: PointerEvent): void => {
    if (press === null || event.pointerId !== press.id) return;
    const wasDrag = press.moved;
    press = null;
    sheet.classList.remove('drag');
    if (wasDrag || event.type === 'pointercancel') return;
    const hit = pickAt(event.clientX, event.clientY);
    if (hit === null) return;
    if (hit.kind === 'peer') {
      if (options.onJoin === undefined) return;
      hide();
      options.onJoin(hit.id);
    } else if (hit.kind === 'pin') {
      // Clicking the one you already chose is how you put it away.
      const id = monuments[hit.index]!.id;
      if (id === target()) onClear();
      else onChoose(id);
      dirty = true;
    }
  };
  canvas.addEventListener('pointerup', release, { signal });
  canvas.addEventListener('pointercancel', release, { signal });

  canvas.addEventListener('pointerleave', () => {
    if (press !== null) return;
    hover = null;
    renderTip();
    marksDirty = true;
  }, { signal });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    // Lines and pages are a mouse; pixels are a trackpad and come in many small steps.
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
    zoomAt(Math.exp(-delta * 0.0022), event.clientX - canvasX, event.clientY - canvasY);
    busyUntil = performance.now() + SETTLE_MS;
    hover = null;
    renderTip();
  }, { signal, passive: false });

  canvas.addEventListener('dblclick', (event) => {
    zoomAt(2, event.clientX - canvasX, event.clientY - canvasY);
  }, { signal });

  // A click on a button leaves the focus where it was: a focused button on
  // this dialog would hold every key the plane under the map is flown by
  // (`inputBlocked`), and `Tab` with it.
  for (const button of [zoomIn, zoomOut, locate]) button.addEventListener('mousedown', (event) => event.preventDefault(), { signal });
  zoomIn.addEventListener('click', () => zoomAt(2, width / 2, height / 2), { signal });
  zoomOut.addEventListener('click', () => zoomAt(0.5, width / 2, height / 2), { signal });
  locate.addEventListener('click', () => centreOnMe(), { signal });

  function show(): void {
    if (showing) return;
    showing = true;
    // The cursor is the whole point of this screen, and pointer lock is
    // holding it. `input.ts` already stops the mouse look the moment the lock
    // goes, so nothing else has to be told.
    if (document.pointerLockElement) document.exitPointerLock();
    root.classList.add('on');
    sheet.focus({ preventScroll: true });
    resize();
    prepareRings();
    prepareTowns();
    prime();
    refreshCount();
    hover = null;
    renderTip();
    centreOnMe();
    dirty = true;
  }

  function hide(): void {
    if (!showing) return;
    showing = false;
    root.classList.remove('on');
    if (root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    tip.classList.remove('on');
    hover = null;
    press = null;
    sheet.classList.remove('drag');
    // A closed sheet holds the first levels and a screenful, not a trail of
    // every place you zoomed into.
    evictTiles(40);
    if (lockTarget !== null && typeof lockTarget.requestPointerLock === 'function') {
      try {
        const request: unknown = lockTarget.requestPointerLock();
        if (request instanceof Promise) request.catch(() => {});
      } catch {
        // Some browsers throw synchronously when pointer lock is unavailable.
      }
    }
  }

  let showing = false;

  if (key !== null) {
    addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // A key pressed on the map's own controls is blocked for the world, the
      // map being a dialog, and is still the map's.
      const own = showing && event.target instanceof Node && root.contains(event.target);
      if (!own && inputBlocked(event)) return;
      if (isKey(event.code)) {
        event.preventDefault();
        if (!event.repeat) {
          if (showing) hide();
          else if (options.blocked?.() !== true) show();
        }
        return;
      }
      if (!showing) return;
      const action = actionOf(event.code);
      if (event.code === 'Escape') hide();
      else if (action === 'mapIn' || action === 'mapOut') {
        event.preventDefault();
        zoomAt(action === 'mapIn' ? 2 : 0.5, width / 2, height / 2);
        hover = null;
        renderTip();
      }
    }, { signal });
  }

  addEventListener('resize', () => {
    if (showing) {
      resize();
      renderTip();
    }
  }, { signal });

  const interval = 1000 / MAX_FPS;
  let lastMeX = -1;
  let lastMeY = -1;
  let lastHeading = 99;
  let lastTarget: string | null = null;
  let lastUpdateAt = 0;
  const onScreen = (x: number, y: number): boolean => x > -40 && x < width + 40 && y > -40 && y < height + 40;

  return {
    root,
    get open() {
      return showing;
    },
    toggle() {
      if (showing) hide();
      else show();
    },
    show,
    hide,
    focus(lat, lon, degreesAcross) {
      if (width === 0) resize();
      cu = uOf(lon);
      cv = vOf(lat);
      if (degreesAcross !== undefined) S = (width * 360) / degreesAcross;
      zoomSet = true;
      clampView();
      dirty = true;
    },
    get stats() {
      let painted = 0;
      for (const tile of tiles.values()) if (tile.canvas !== null) painted++;
      return {
        tiles: painted,
        pending: wanted.length,
        pixelsPerDegree: S / 360,
        level,
        drawMs,
        marksMs,
      };
    },
    update(position, forward) {
      // Where you are is tracked while the sheet is closed too, so it opens on you.
      latLonOf(position, meLatLon);
      me.lat = meLatLon.lat;
      me.lon = meLatLon.lon;
      me.u = uOf(me.lon);
      me.v = vOf(Math.max(-89.999, Math.min(89.999, me.lat)));
      me.known = true;
      const now = performance.now();
      const gap = lastUpdateAt === 0 ? 0 : now - lastUpdateAt;
      lastUpdateAt = now;
      if (!showing) {
        warm(now);
        return;
      }

      // The heading as a screen angle, clockwise from up: north and east at
      // this point, from the one conversion in `sphere.ts`, differentiated.
      const lon = me.lon * DEG;
      const lat = me.lat * DEG;
      const east = forward.x * -Math.sin(lon) + forward.z * -Math.cos(lon);
      const north =
        forward.x * -Math.sin(lat) * Math.cos(lon) + forward.y * Math.cos(lat) + forward.z * Math.sin(lat) * Math.sin(lon);
      if (Math.abs(east) + Math.abs(north) > 1e-6) me.heading = Math.atan2(east, north);

      // Less painting in a frame that came late or while a hand moves the
      // sheet: the parents stand in, and the drag keeps its pace.
      if (paintTiles(busy() || gap > LATE_FRAME_MS ? TILE_BUSY_MS : TILE_BUDGET_MS)) dirty = true;
      // The first still frame after a drag or a zoom, with the fine filter.
      if (drawnBusy && !busy()) dirty = true;
      // The destination's name is always on the sheet, so a new one is a redraw.
      const chosen = target();
      if (chosen !== lastTarget) {
        lastTarget = chosen;
        dirty = true;
      }

      const meX = screenX(me.u);
      const meY = screenY(me.v);
      // The names keep clear of you; once you have moved far enough from
      // where they were laid out, they are laid out again.
      if ((onScreen(meX, meY) || onScreen(laidMeX, laidMeY)) && Math.max(Math.abs(meX - laidMeX), Math.abs(meY - laidMeY)) > RELAYOUT_PX) {
        dirty = true;
      }
      const moving =
        Math.abs(meX - lastMeX) > 0.5 || Math.abs(meY - lastMeY) > 0.5 || Math.abs(me.heading - lastHeading) > 0.02;
      const peersMoving = (options.peers?.().length ?? 0) > 0;
      if ((moving || peersMoving) && now - drawnAt >= interval) marksDirty = true;
      if (dirty) {
        draw();
        if (tiles.size > MAX_TILES + 40) evictTiles(MAX_TILES);
      }
      if (!marksDirty) return;
      lastMeX = meX;
      lastMeY = meY;
      lastHeading = me.heading;
      drawMarks();
      if (hover !== null) renderTip();
    },
    dispose() {
      events.abort();
      unlabel();
      for (const tile of [...tiles.values()]) dropTile(tile);
      root.remove();
    },
  };
}

/** A linear channel to an sRGB byte. */
function toByte(linear: number): number {
  const c = linear <= 0 ? 0 : linear >= 1 ? 1 : linear;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
}
