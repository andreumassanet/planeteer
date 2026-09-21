/**
 * The whole planet on one sheet, behind `M`.
 *
 * **This has to earn its place beside the plane**, because the design already
 * says the plane *is* the map: climb to the ceiling and the fog opens on the
 * globe with no map screen at all. That is still true and this does not replace
 * it. What it does is the four things altitude cannot do:
 *
 * - **Names.** Nothing in the 3D world is labelled. From the ceiling you are
 *   looking at a continent with no way to tell which country it is or which of
 *   the specks below you is the Taj Mahal. This is the only place in atlas where
 *   the world writes its own names down.
 * - **The whole planet.** The ceiling is 1.45 radii, so the camera sits 2.45 out
 *   and sees a cap of `acos(1/2.45)` — 66 degrees, about a third of the surface.
 *   This is a projection of all of it, near side and far side together.
 * - **The visited set.** Monuments stop building at about 12,000 units and there
 *   are no pins in the world, so from the air the eighty-five landmarks are
 *   invisible whether you have found them or not. Here they are cream, gold and
 *   violet at a size you can read.
 * - **A destination you can point at.** Pointer lock holds the cursor, which is
 *   why `navigation.ts` had to put the chooser on `Tab` and cycle a list. A map
 *   is the one screen where releasing the lock is the right thing to do, so this
 *   is the only place you can *point* at where you want to go. It does not
 *   choose anything itself — it drives `navigation.ts`, which already owns what
 *   a destination is.
 *
 * And it costs one key from wherever you are standing. Climbing to the ceiling
 * and back down is minutes of flying and needs the aircraft.
 *
 * ## The projection, and what it costs
 *
 * **Azimuthal equidistant, centred on the player, north up.** Distance out from
 * the middle is true great-circle distance, so the rings at 5,000 / 10,000 /
 * 15,000 km are evenly spaced by construction and the rim is your antipode —
 * the furthest point on Earth from where you stand. In a game whose whole travel
 * model is that crossing an ocean is a climb, distance is *the* quantity, and
 * this is the projection that draws it.
 *
 * Three costs, all real:
 *
 * - **The far half is stretched.** Circumferential scale is `theta / sin theta`:
 *   1.21 at 60 degrees out, 1.57 at 90, 5.2 at 150, unbounded at the rim. Shapes
 *   near the centre are honest and shapes near the rim are not — from Europe,
 *   Australia is drawn about the size of Africa and is a quarter of it. That is
 *   the trade taken deliberately: fidelity where you are, presence where you are
 *   not.
 * - **Three quarters of the disc is the far hemisphere**, because the near one
 *   is the inner half of the radius and area goes as the square. Standing in
 *   Mallorca that outer three quarters is very largely the Pacific, and the map
 *   looks emptier than it needs to.
 * - **The antipode is a point that maps to the entire rim**, so the one country
 *   containing it comes out as a ring smeared round the edge. It is drawn
 *   correctly rather than ignored; see `traceRing`.
 *
 * **Two other projections were measured against it rather than argued about.**
 * Counting how many landmarks survive the pin thinning at a 660-pixel disc,
 * from six standpoints. Taken when there were 65 of them; there are 85 now and
 * the ratios are what the argument rests on, not the counts:
 *
 * ```
 *                equidistant   equal-area    orthographic (a globe)
 *   Mallorca       37 of 65      42 of 65      39 of the 51 it can show
 *   Tokyo          37            41            28 of 45
 *   Quito          42            42            17 of 28
 *   North Pole     38            41            37 of 52
 *   South Pole     44            43            12 of 13
 *   mid-Pacific    44            44            17 of 24
 * ```
 *
 * The third column is the whole argument for a whole-world projection and
 * against simply enlarging the minimap: **an orthographic map cannot show the
 * landmarks that are not on your side of the planet**, and from Quito that is
 * more than half of them. The second column is the real alternative — Lambert
 * azimuthal equal-area gives the near hemisphere 71% of the radius instead of
 * 50%, fills the sheet, tells the truth about area, and costs about five pins
 * *less* to crowding. It was rejected on shape rather than on area: its scale
 * factors at 150 degrees out are 0.26 radial against 3.86 circumferential, a
 * 15:1 shear, where equidistant's are 1 and 5.2. The far side of an equal-area
 * disc is squashed into a ring; the far side of this one is only stretched.
 *
 * ## What the world does while it is open
 *
 * **It keeps running, and that is a decision rather than an omission.** Pointer
 * lock is released so there is a cursor, which `input.ts` already reads as "stop
 * the mouse look" without being told anything; the keys are still live, so a key
 * you are deliberately holding still moves you. In the plane it *must* keep
 * running — you are six thousand units up and freezing the aircraft to look at a
 * chart is a lie — and a map that stops the world is a menu, which this is not
 * meant to be. Closing it asks for the lock back rather than leaving the player
 * on "click to look around".
 *
 * **North up rather than heading up, which is the opposite of the minimap and is
 * on purpose.** The disc in the corner is steered by, so the world turns under
 * the arrow. This is read, so opening it twice from the same place has to give
 * the same picture, and the heading is *shown* — the arrow at the centre turns —
 * which is strictly more than heading-up tells you. The one degeneracy is a
 * pole, where north is undefined; there it falls back to the heading, which is
 * the only direction that still exists there.
 */
import type * as THREE from 'three';
import { type World, insideRing } from './geo.ts';
import { createFlagCanvas } from './flags.ts';
import type { Placement } from './placement.ts';
import { OCEAN_COLOR, PALETTE } from './theme.ts';
import { FONT, ensureStyle, h, hex, installUi, kbd, km } from './ui.ts';
import {
  EARTH_KM,
  LabelSpace,
  R2D,
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
import { latOf, lonOf } from './sphere.ts';

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
   * Who owns pointer lock, so closing the map can hand the mouse back rather
   * than leaving you looking at "click to look around".
   */
  lockTarget?: HTMLElement | null;
  /** `event.code` that opens and closes it. `null` to bind it yourself. */
  key?: string | null;
  /**
   * Asked before the key opens the map, and a `true` leaves it shut: another
   * overlay is up and the map would open *under* it — the settings card, which
   * sits above this one. Closing is never blocked, and neither is `show()`,
   * which is what the console and the HUD's own button call.
   */
  blocked?: () => boolean;
}

export interface WorldMap {
  /** The whole overlay, stylesheet included. The caller mounts one element. */
  root: HTMLElement;
  readonly open: boolean;
  toggle(): void;
  show(): void;
  hide(): void;
  /** Every frame. Returns immediately and costs nothing while it is closed. */
  update(position: THREE.Vector3, forward: THREE.Vector3): void;
  dispose(): void;
}

/** Ink rim, the same weight the minimap and the HUD cards use. */
const RIM_WIDTH = 3;
/** Redraws per second while it is open. Nothing on it moves quickly. */
const MAX_FPS = 20;
/** A redraw is skipped unless the centre or the heading moved by this much. */
const MIN_SHIFT = 0.35;
const MIN_TURN = 0.4 / R2D;
/** Space left round the disc for the cards. */
const MARGIN = 58;
/** Below this the disc is not worth drawing; the map just does not open. */
const MIN_SIZE = 240;
/**
 * A drawn segment longer than this, in pixels, did not come from the outlines —
 * it came from the antipode. See the repair in `traceRing`.
 *
 * It is a screen-space test rather than an angular one because the thing it is
 * looking for is *created* by the projection: consecutive ring points are half a
 * pixel apart at the centre of the sheet, and the circumferential stretch near
 * the rim (`theta / sin theta`, which is 179 at one degree from the antipode)
 * is what turns that into a chord across the world.
 */
const JUMP = 6;
/** How finely the rim is walked when it has to be, in radians. */
const RIM_STEP = 0.09;

// Pin geometry in pixels. Bigger than the minimap's, because this is a sheet you
// read rather than a dial you glance at.
const PIN_RISE = 11;
const PIN_HEAD = 5;
/**
 * No two pins closer together than this.
 *
 * The same rule as the minimap and the same reason — Paris holds three
 * landmarks inside 0.04 degrees, and `build-monuments.ts` only ever separates
 * an overlapping pair by up to 38 km, which is a tenth of a degree. **No
 * whole-world projection can spread a cluster**, because an azimuthal map is
 * linear in *angle*: two landmarks 0.34 degrees apart are 0.34 degrees apart on
 * this sheet whether you are standing on them or on the other side of the
 * planet. So the map shows one pin per cluster, closest-first, and `Tab` is what
 * reaches inside one. The chosen destination is exempt, so whatever you picked
 * is on the sheet however crowded its corner is.
 */
const PIN_SPACING = 15;
/** How far the cursor may be from a pin and still be pointing at it. */
const PICK_RANGE = 20;
/** Rings, in real kilometres. The rim is the antipode at 20,015. */
const RANGE_RINGS = [5000, 10000, 15000];
/**
 * Where a ring's label may sit, as screen angles clockwise from east, in the
 * order they are tried.
 *
 * Down and to the right first — the one diagonal with neither the compass mark
 * at the top nor the head card in it — then fanning out a twelfth of a turn at a
 * time either way. The labels used to be painted into the land at that first
 * angle whatever was there, and on a sheet whose pins are drawn over the land
 * that put *5,000 km* under Kilimanjaro's pin and *15,000 km* under the Moeraki
 * Boulders. Now each one takes the first angle the label space has room at, like
 * every other word on the sheet, and is dropped only if the whole ring is full.
 */
const RING_LABEL_ANGLES = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9, -9, 10, -10, 11, -11]
  .map((step) => Math.PI / 4 + (step * Math.PI) / 12);

/** Countries smaller than this across, in pixels, do not get their name written. */
const MIN_COUNTRY_LABEL = 26;

/**
 * What is the map's own. The cards, the key caps and the flag's frame are
 * `ui.ts`'s — `.ui-card`, `.ui-kbd`, `.ui-flag` — so the sheet behind `M` is
 * drawn with the same rim, radius and drop as the HUD it opens over; it had
 * its own 12-pixel card and a flat, rimless key cap until the two were put
 * side by side.
 */
const STYLE = `
.atlas-map {
  position: fixed;
  inset: 0;
  z-index: 7;
  display: grid;
  place-items: center;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  background: rgba(30, 6, 3, 0.68);
  backdrop-filter: blur(3px);
  transition: opacity 0.18s ease, visibility 0.18s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  cursor: default;
}
.atlas-map.on { opacity: 1; visibility: visible; pointer-events: auto; }
.atlas-map canvas { display: block; }
.atlas-map .ui-card {
  position: absolute;
  pointer-events: none;
}
.atlas-map-head {
  top: 22px;
  left: 24px;
  padding: 10px 16px 11px;
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
  width: 8px;
  height: 8px;
  margin-right: 7px;
  border: 1.5px solid var(--ui-ink);
  border-radius: 50%;
  vertical-align: middle;
}
.atlas-map-note {
  max-width: 190px;
  margin-top: 9px;
  padding-top: 8px;
  border-top: 2px solid var(--ui-rule);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.35;
  opacity: 0.72;
}
.atlas-map-foot {
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
}
.atlas-map-foot span { display: inline-flex; align-items: center; gap: 6px; }
/* The tooltip's origin is the pin's own tip, so it rises out of the mark it
   describes rather than floating near it. */
.atlas-map-tip {
  display: none;
  align-items: center;
  gap: 11px;
  padding: 8px 13px 8px 9px;
  transform: translate(-50%, calc(-100% - 16px));
  max-width: 280px;
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
`;

export function createWorldMap(world: World, options: WorldMapOptions): WorldMap {
  const { monuments, isVisited, target, onChoose, onClear } = options;
  const key = options.key === undefined ? 'KeyM' : options.key;
  const lockTarget = options.lockTarget ?? null;

  installUi();
  ensureStyle('atlas-map', STYLE);

  const ink = hex(PALETTE.ink);
  const ocean = hex(OCEAN_COLOR);
  const cream = hex(PALETTE.white);
  const gold = hex(PALETTE.gold);
  const violet = hex(PALETTE.violet);
  const root = h('div', { class: 'atlas-map' });

  const canvas = h('canvas');
  const ctx = canvas.getContext('2d')!;
  // The land is redrawn only when the centre moves; the pins and the names are
  // redrawn whenever the cursor does. Keeping them in two buffers is what makes
  // hovering free — see the redraw policy in `update`.
  const base = document.createElement('canvas');
  const baseCtx = base.getContext('2d')!;

  const count = h('div', { class: 'atlas-map-count' });
  const legend = h(
    'div',
    { class: 'atlas-map-legend' },
    ...([
      [cream, 'not found'],
      [gold, 'found'],
      [violet, 'destination'],
    ] as const).map(([colour, label]) => h('div', {}, h('i', { style: `background: ${colour}` }), label)),
  );
  const head = h(
    'div',
    { class: 'atlas-map-head ui-card' },
    h('div', { class: 'atlas-map-title', text: 'The world' }),
    count,
    legend,
    // The words that make an unfamiliar projection readable, and the only
    // place the sheet explains itself. Without them the outer ring of empty
    // ocean — which from Europe is most of the Pacific — reads as wasted paper
    // rather than as the far side of the world. They were painted along the
    // bottom of the disc, where the rim clipped both ends and the footer card
    // covered the middle; on the card they are whole at every size.
    h('div', {
      class: 'atlas-map-note',
      text: `Rings every ${km(RANGE_RINGS[0]!)}; the rim is your antipode, ${km(Math.PI * EARTH_KM)} away.`,
    }),
  );

  const foot = h(
    'div',
    { class: 'atlas-map-foot ui-card' },
    h('span', {}, kbd('M'), 'close'),
    h('span', { text: 'click a landmark to set your destination' }),
    h('span', {}, kbd('Tab'), 'cycle'),
  );

  const tipFlag = h('span');
  const tipName = h('div', { class: 'atlas-map-tip-name' });
  const tipSub = h('div', { class: 'atlas-map-tip-sub' });
  const tip = h('div', { class: 'atlas-map-tip ui-card' }, tipFlag, h('div', {}, tipName, tipSub));

  root.append(canvas, head, foot, tip);

  const countryName = new Map(world.countries.map((country) => [country.iso, country.name]));

  // The landmarks as unit vectors, once, through the same conversion the
  // outlines use — so a pin and the coast it stands on cannot drift apart.
  const pinCount = monuments.length;
  const pinPoint = new Float32Array(pinCount * 3);
  monuments.forEach((monument, i) => {
    toUnit(monument.lat, monument.lon, pinPoint, i * 3);
  });
  const pinScreenX = new Float32Array(pinCount);
  const pinScreenY = new Float32Array(pinCount);
  const pinDepth = new Float32Array(pinCount);
  const pinOrder = new Int32Array(pinCount);
  const keptX = new Float32Array(pinCount);
  const keptY = new Float32Array(pinCount);
  const keptPin = new Int32Array(pinCount);
  const pinIndex = new Map(monuments.map((monument, i) => [monument.id, i]));

  /**
   * Where each country's name goes, biggest first.
   *
   * The anchor is the centroid of a country's largest ring, which the bake
   * already computes and already calls a label point. It is measured once: the
   * text width of two hundred names is not something to ask the canvas for on
   * every mouse move.
   */
  interface CountryLabel {
    text: string;
    x: number;
    y: number;
    z: number;
    /** Angular radius of the country's biggest ring, for the "is it worth a name" test. */
    span: number;
    area: number;
    width: number;
  }
  const countryLabels: CountryLabel[] = [];

  let shapes: Shape[] = [];
  let discRadius = 0;
  let centre = 0;
  let perRadian = 0;
  let size = 0;
  let ratio = 0;
  let borderWidth = 1;

  const frame = createFrame();
  let ux = 0;
  let uy = 1;
  let uz = 0;
  let fx = 0;
  let fy = 0;
  let fz = 1;
  let rx = 1;
  let ry = 0;
  let rz = 0;
  /**
   * The point on the far side of the planet, which on this projection is the
   * whole rim. Kept as lat/lon because the one thing asked of it is a
   * point-in-polygon against the outlines, and those are lat/lon.
   */
  let antipodeLat = 0;
  let antipodeLon = 0;

  // The zero vector as "nowhere yet": its dot with any unit centre is 0, so the
  // movement test reads a quarter turn and redraws. A sentinel outside the unit
  // sphere does not work — the dot is clamped before the `acos`, so a centre in
  // the same hemisphere as it would come back as "has not moved".
  let lastUx = 0;
  let lastUy = 0;
  let lastUz = 0;
  let lastHeading = 99;
  let heading = 0;
  let drawnAt = 0;
  let baseStale = true;
  let overlayStale = true;

  let showing = false;
  let hover = -1;
  let cursorX = -1;
  let cursorY = -1;
  /** How many pins survived the last thinning, and where they landed. */
  let kept = 0;
  /** The destination's pin this draw, or -1. */
  let chosenPin = -1;

  /**
   * Builds the outlines at whatever resolution the disc is.
   *
   * The map is player-centred, so a resize is the only thing that changes this —
   * and a resize is already the frame where the renderer reallocates its buffers.
   * At a 660-pixel disc it is 26,700 points over 743 rings and takes a few tens
   * of milliseconds, which is why it happens here and never while the map is
   * open.
   */
  function resize(): void {
    const edge = Math.min(innerWidth, innerHeight) - MARGIN * 2;
    const next = Math.max(MIN_SIZE, Math.round(edge));
    if (next === size) return;
    size = next;
    centre = size / 2;
    discRadius = centre - RIM_WIDTH / 2;
    // Radians per pixel: the whole half-turn to the antipode spans the radius.
    perRadian = discRadius / Math.PI;
    borderWidth = Math.max(1, size / 620);

    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    base.width = 0;

    /** Points and rings finer than half a pixel *at the centre* are dropped. */
    const finest = 0.5 / perRadian;
    shapes = buildShapes(world, finest, finest);

    // One label per country, anchored on its biggest ring's centroid, ordered
    // so that a big country wins the space from a small one.
    countryLabels.length = 0;
    const biggest = new Map<number, number>();
    const total = new Map<number, number>();
    for (const shape of shapes) {
      biggest.set(shape.country, Math.max(biggest.get(shape.country) ?? 0, shape.radius));
      total.set(shape.country, (total.get(shape.country) ?? 0) + shape.area);
    }
    const probe = new Float32Array(3);
    baseCtx.font = `700 11px ${FONT}`;
    for (const [id, span] of biggest) {
      const country = world.countries[id - 1]!;
      toUnit(country.lat, country.lon, probe, 0);
      countryLabels.push({
        text: country.name.toUpperCase(),
        x: probe[0]!,
        y: probe[1]!,
        z: probe[2]!,
        span,
        area: total.get(id) ?? 0,
        width: baseCtx.measureText(country.name.toUpperCase()).width,
      });
    }
    countryLabels.sort((a, b) => b.area - a.area);

    baseStale = true;
    overlayStale = true;
  }

  /**
   * Traces one ring, and closes the one that has the antipode inside it.
   *
   * Everything is visible on this projection, so there is no horizon logic at
   * all — which is the whole of what the minimap's trace is doing. What there is
   * instead is the singularity: the antipode is a *point* on the sphere and the
   * *entire rim* on the paper, so a country containing it has an image that
   * winds right round the disc, and `fill()` would paint the rest of the world
   * instead of the country.
   *
   * The winding tells you which case you are in, and its *sign* tells you which
   * of the two. The bake winds every ring with the land on the right of `a -> b`,
   * and the screen frame is right-handed as seen from outside the sphere, so a
   * ring around the centre comes back at `-2 PI` and a ring around the antipode
   * at `+2 PI`. Standing in Madrid that second case is New Zealand, and it is the
   * only ring on the planet that ever takes it.
   *
   * Closing it against the rim and filling even-odd paints the annulus between
   * the coastline and the edge, which is exactly where that country is.
   */
  function traceRing(target2d: CanvasRenderingContext2D, shape: Shape): void {
    const p = shape.points;
    const points = p.length / 3;

    // Two tests, and the cheap one exists only to keep the exact one off the hot
    // path: the antipode has to be inside the ring's own bounding cap — one dot
    // product — before `insideRing` is asked about it, which over 531 rings a
    // redraw is the difference between one point-in-polygon query and 531.
    const wraps = -(shape.cx * ux + shape.cy * uy + shape.cz * uz) > Math.cos(shape.radius)
      && insideRing(shape.ring, antipodeLon, antipodeLat);

    target2d.beginPath();
    let ax = 0;
    let ay = 1;
    let previousRadius = 0;
    let x = centre;
    let y = centre;
    // One extra step wraps back to the first point: the rings are open — none of
    // them repeats its start — so the closing segment has to be walked too.
    for (let i = 0; i <= points; i++) {
      const k = (i === points ? 0 : i) * 3;
      const px = p[k]!;
      const py = p[k + 1]!;
      const pz = p[k + 2]!;
      const height = px * ux + py * uy + pz * uz;
      const sx = px * rx + py * ry + pz * rz;
      const sy = px * fx + py * fy + pz * fz;
      // `Math.hypot` is a guarded, over-careful square root and this loop runs
      // 26,000 times a redraw; nothing here can overflow.
      const flat = Math.sqrt(sx * sx + sy * sy);
      const radius = Math.acos(height > 1 ? 1 : height < -1 ? -1 : height) * perRadian;
      const lastX = ax;
      const lastY = ay;
      // Exactly at the antipode — or exactly under your feet — there is no
      // azimuth: every direction is equally right. Carry the last one rather
      // than snapping to a fixed axis.
      if (flat > 1e-9) {
        ax = sx / flat;
        ay = sy / flat;
      }
      const nextX = centre + ax * radius;
      const nextY = centre - ay * radius;

      if (i === 0) {
        target2d.moveTo(nextX, nextY);
      } else {
        const dx = nextX - x;
        const dy = nextY - y;
        if (dx * dx + dy * dy > JUMP * JUMP) {
          // **The one place this projection has to be repaired, and it is the
          // singularity rather than a bug.** The antipode is a point on the
          // sphere and the whole rim on the paper, so a ring that crosses it has
          // two *neighbouring* vertices landing on opposite sides of the disc.
          // Antarctica does it from anywhere near the north pole — its ring runs
          // along the south pole itself — and the straight line between those two
          // vertices is a black diameter drawn clean across the world.
          //
          // The honest image of that segment is the rim, so walk it: interpolate
          // the azimuth and the radius together, which is `minimap.ts`'s horizon
          // walk with the radius no longer pinned. Which way round is genuinely
          // undecidable when the two azimuths are exactly opposite — every route
          // over the antipode is the same length — so the wrap picks one.
          const from = Math.atan2(lastY, lastX);
          let delta = Math.atan2(ay, ax) - from;
          if (delta > Math.PI) delta -= TAU;
          else if (delta < -Math.PI) delta += TAU;
          const steps = Math.max(1, Math.ceil(Math.abs(delta) / RIM_STEP));
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const angle = from + delta * t;
            const arc = previousRadius + (radius - previousRadius) * t;
            target2d.lineTo(centre + Math.cos(angle) * arc, centre - Math.sin(angle) * arc);
          }
        } else {
          target2d.lineTo(nextX, nextY);
        }
      }
      x = nextX;
      y = nextY;
      previousRadius = radius;
    }
    target2d.closePath();

    if (wraps) {
      // The country the player is standing opposite. Its image winds right round
      // the disc, and what is *inside* it on the sphere is the band between that
      // winding and the rim — so the path is closed against the rim and filled
      // even-odd. Plain `fill()` here paints the rest of the world in this
      // country's colour instead, which from Beijing is the whole sheet in
      // Argentina's apricot.
      target2d.moveTo(centre + discRadius, centre);
      target2d.arc(centre, centre, discRadius, 0, TAU);
      target2d.closePath();
      target2d.fill('evenodd');
    } else {
      target2d.fill();
    }
    target2d.stroke();
  }

  /** The ocean, the land and the range rings. Only the centre moves it. */
  function drawBase(): void {
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
    baseCtx.strokeStyle = ink;
    baseCtx.lineWidth = borderWidth;
    baseCtx.lineJoin = 'round';
    for (const shape of shapes) {
      baseCtx.fillStyle = shape.fill;
      traceRing(baseCtx, shape);
    }

    // The rings are what say "the radius is a distance" without a sentence
    // saying it. They are evenly spaced because the projection is equidistant —
    // on any other whole-world projection they would not be circles at all.
    // Their labels are not here: they are words, and words go through the
    // label space with the pins and the names — see `drawRingLabels`.
    baseCtx.setLineDash([5, 6]);
    baseCtx.lineWidth = 1.25;
    baseCtx.strokeStyle = 'rgba(30, 6, 3, 0.3)';
    for (const distance of RANGE_RINGS) {
      const radius = ringRadius(distance);
      if (radius > discRadius - 6) continue;
      baseCtx.beginPath();
      baseCtx.arc(centre, centre, radius, 0, TAU);
      baseCtx.stroke();
    }
    baseCtx.setLineDash([]);
    baseCtx.restore();

    baseCtx.beginPath();
    baseCtx.arc(centre, centre, discRadius, 0, TAU);
    baseCtx.lineWidth = RIM_WIDTH;
    baseCtx.strokeStyle = ink;
    baseCtx.stroke();
  }

  /** The player's own mark, at the centre, turned to the heading. */
  function drawPlayer(): void {
    ctx.save();
    ctx.translate(centre, centre);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(8.5, 9.5);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8.5, 9.5);
    ctx.closePath();
    ctx.fillStyle = cream;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.restore();
  }

  /** Names for as many countries as have room, biggest first. */
  function drawCountries(space: LabelSpace): void {
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const label of countryLabels) {
      // A country narrower than its own name is a dot with a word on it.
      if (label.span * perRadian * 2 < MIN_COUNTRY_LABEL) continue;
      const height = label.x * ux + label.y * uy + label.z * uz;
      const sx = label.x * rx + label.y * ry + label.z * rz;
      const sy = label.x * fx + label.y * fy + label.z * fz;
      const flat = Math.sqrt(sx * sx + sy * sy);
      const radius = Math.acos(height > 1 ? 1 : height < -1 ? -1 : height) * perRadian;
      const x = centre + (flat > 1e-9 ? sx / flat : 0) * radius;
      const y = centre - (flat > 1e-9 ? sy / flat : 1) * radius;
      const left = x - label.width / 2;
      const top = y - 7;
      // Inside the disc, whole. A name half under the rim is worse than none.
      if (Math.hypot(left - centre, top - centre) > discRadius - 8) continue;
      if (Math.hypot(left + label.width - centre, top + 14 - centre) > discRadius - 8) continue;
      if (!space.fits(left, top, label.width, 14)) continue;
      space.claim(left, top, label.width, 14);
      inkedText(ctx, label.text, left, y, cream, 'rgba(30, 6, 3, 0.62)', 3);
    }
  }

  /** How far out a ring of `distance` real kilometres is drawn, in pixels. */
  const ringRadius = (distance: number): number => (distance / EARTH_KM) * perRadian;

  /**
   * Projects the landmarks, thins them, and claims the room their pins stand in.
   *
   * Nothing is culled: on this projection every pin on the planet is on the
   * sheet. Order is nearest-first, so the names that get dropped in a crowd are
   * the far ones — and the chosen destination is seeded ahead of the thinning,
   * exactly as on the minimap.
   *
   * Every pin's own box is claimed *before* any word is placed, and getting
   * that order wrong is visible rather than theoretical: the pins are painted
   * last so they sit on top of the haloes, so a name allowed to start under a
   * neighbour's pin is a name with a hole bitten out of it. The first version
   * claimed them afterwards and the Eiffel Tower rendered as "ffel Tower".
   */
  function placePins(space: LabelSpace): void {
    kept = 0;
    if (pinCount === 0) return;

    const chosen = target();
    chosenPin = chosen === null ? -1 : pinIndex.get(chosen) ?? -1;

    for (let i = 0; i < pinCount; i++) {
      const k = i * 3;
      const mx = pinPoint[k]!;
      const my = pinPoint[k + 1]!;
      const mz = pinPoint[k + 2]!;
      const height = mx * ux + my * uy + mz * uz;
      const sx = mx * rx + my * ry + mz * rz;
      const sy = mx * fx + my * fy + mz * fz;
      const flat = Math.sqrt(sx * sx + sy * sy);
      const radius = Math.acos(height > 1 ? 1 : height < -1 ? -1 : height) * perRadian;
      pinScreenX[i] = centre + (flat > 1e-9 ? sx / flat : 0) * radius;
      pinScreenY[i] = centre - (flat > 1e-9 ? sy / flat : 1) * radius;
      pinDepth[i] = height;
      pinOrder[i] = i;
    }
    sortByDepth(pinOrder, pinDepth, pinCount);
    kept = thinMarks(
      pinOrder, pinCount, pinScreenX, pinScreenY, PIN_SPACING, keptPin, keptX, keptY, chosenPin,
    );

    for (let n = 0; n < kept; n++) {
      space.claim(
        keptX[n]! - PIN_HEAD - 2,
        keptY[n]! - PIN_RISE - PIN_HEAD - 2,
        PIN_HEAD * 2 + 4,
        PIN_RISE + PIN_HEAD + 4,
      );
    }
  }

  /**
   * One label per range ring, at the first angle round it that has room.
   *
   * Placed after the pins have claimed their boxes and before any name has, so
   * a ring's distance is never under a pin and never loses to a landmark three
   * continents away — there are three of them, and they are what makes the
   * sheet a chart. Ink on the paper halo, the landmarks' own pen, rather than
   * the faded ink they had when they were painted into the land.
   */
  function drawRingLabels(space: LabelSpace): void {
    ctx.font = `800 10.5px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const height = 13;
    for (const distance of RANGE_RINGS) {
      const radius = ringRadius(distance);
      if (radius > discRadius - 6) continue;
      const text = km(distance);
      const width = ctx.measureText(text).width;
      for (const angle of RING_LABEL_ANGLES) {
        const x = centre + Math.cos(angle) * radius;
        const y = centre + Math.sin(angle) * radius;
        const left = x - width / 2;
        const top = y - height / 2;
        if (!space.fits(left, top, width, height)) continue;
        space.claim(left, top, width, height);
        inkedText(ctx, text, left, y, cream, ink, 3.5);
        break;
      }
    }
  }

  /** The landmarks' names, nearest first, so a crowd drops the far ones. */
  function drawPinNames(space: LabelSpace): void {
    ctx.font = `800 12.5px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let n = 0; n < kept; n++) {
      const i = keptPin[n]!;
      const x = keptX[n]!;
      const y = keptY[n]!;
      const name = monuments[i]!.name;
      const width = ctx.measureText(name).width;
      // Pin, then a gap, then the name — flipped to the left near the right rim.
      const right = x + PIN_HEAD + 6;
      const flip = right + width > centre + discRadius - 10;
      const left = flip ? x - PIN_HEAD - 6 - width : right;
      const top = y - PIN_RISE - 7;
      if (Math.hypot(left - centre, top + 7 - centre) > discRadius - 4) continue;
      if (Math.hypot(left + width - centre, top + 7 - centre) > discRadius - 4) continue;
      if (i !== hover && i !== chosenPin && !space.fits(left, top, width, 14)) continue;
      space.claim(left, top, width, 14);
      inkedText(ctx, name, left, y - PIN_RISE, cream, ink, 3.5);
    }
  }

  /** The pins themselves, last, so nothing is drawn over one. */
  function paintPins(): void {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    // Backwards, so the nearest is painted last and nothing lands on top of it.
    for (let n = kept - 1; n >= 0; n--) {
      const i = keptPin[n]!;
      const scale = i === hover ? 1.35 : i === chosenPin ? 1.25 : 1;
      const fill = i === chosenPin ? violet : isVisited(monuments[i]!.id) ? gold : cream;
      tracePin(ctx, keptX[n]!, keptY[n]!, PIN_RISE, PIN_HEAD, fill, scale);
    }
  }

  /**
   * Where the head card and the footer card cover the disc, in the canvas's own
   * pixels, so nothing is written underneath them.
   *
   * Measured when the sheet opens and when the window changes, never per draw:
   * a card moves only then, and a bounding box asked for in the draw would be a
   * layout every redraw.
   */
  const covered: { x: number; y: number; width: number; height: number }[] = [];
  function measureCards(): void {
    covered.length = 0;
    const box = canvas.getBoundingClientRect();
    for (const card of [head, foot]) {
      const rect = card.getBoundingClientRect();
      // The drop under a card is ink too, and a halo against it reads as a
      // word touching the card.
      covered.push({ x: rect.left - box.left - 4, y: rect.top - box.top - 4, width: rect.width + 8, height: rect.height + 12 });
    }
  }

  function drawOverlay(): void {
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
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const space = new LabelSpace();
    // The centre is the player's own mark, and a name under it is unreadable;
    // the compass mark on the rim is drawn last, so it is claimed first; and
    // the cards are over the canvas, so what they cover is not paper.
    space.claim(centre - 16, centre - 16, 32, 32);
    space.claim(centre - 9, 0, 18, RIM_WIDTH + 18);
    for (const card of covered) space.claim(card.x, card.y, card.width, card.height);
    placePins(space);
    drawRingLabels(space);
    drawPinNames(space);
    drawCountries(space);
    paintPins();
    drawPlayer();

    // North, on the rim, because the sheet is north-up and the arrow in the
    // middle is not: without this the two would be one ambiguous mark.
    ctx.font = `800 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    inkedText(ctx, 'N', centre, RIM_WIDTH + 9, cream, ink, 4);
  }

  /** The card over the pin under the cursor. */
  function renderTip(): void {
    if (hover < 0) {
      tip.classList.remove('on');
      return;
    }
    const monument = monuments[hover]!;
    const k = hover * 3;
    const dot = pinPoint[k]! * ux + pinPoint[k + 1]! * uy + pinPoint[k + 2]! * uz;
    const distance = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot) * EARTH_KM;
    const found = isVisited(monument.id);
    tipName.textContent = monument.name;
    tipSub.replaceChildren(
      `${countryName.get(monument.iso) ?? monument.iso} · `,
      h('b', { text: km(distance) }),
      found ? ' · found' : '',
    );
    const flag = createFlagCanvas(monument.iso, 34, 23);
    flag.className = 'ui-flag';
    tipFlag.replaceChildren(flag);
    // The canvas is centred in the overlay, so the pin's page position is its
    // disc position plus the disc's own offset.
    const box = canvas.getBoundingClientRect();
    const at = keptIndexOf(hover);
    if (at < 0) {
      tip.classList.remove('on');
      return;
    }
    tip.style.left = `${box.left + keptX[at]!}px`;
    tip.style.top = `${box.top + keptY[at]! - PIN_RISE}px`;
    tip.classList.add('on');
  }

  function keptIndexOf(pin: number): number {
    for (let n = 0; n < kept; n++) if (keptPin[n] === pin) return n;
    return -1;
  }

  /** The pin under the cursor, or -1. Only the pins actually drawn can be hit. */
  function pick(pageX: number, pageY: number): number {
    const box = canvas.getBoundingClientRect();
    const x = pageX - box.left;
    const y = pageY - box.top;
    let best = -1;
    let bestDistance = PICK_RANGE * PICK_RANGE;
    for (let n = 0; n < kept; n++) {
      const dx = x - keptX[n]!;
      // Aim at the head rather than the tip: the head is what you can see.
      const dy = y - (keptY[n]! - PIN_RISE);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = keptPin[n]!;
      }
    }
    return best;
  }

  function refreshCount(): void {
    let found = 0;
    for (const monument of monuments) if (isVisited(monument.id)) found++;
    count.textContent = `${found} of ${monuments.length} landmarks found`;
  }

  const events = new AbortController();
  const { signal } = events;

  root.addEventListener('mousemove', (event) => {
    cursorX = event.clientX;
    cursorY = event.clientY;
    const next = pick(cursorX, cursorY);
    root.style.cursor = next >= 0 ? 'pointer' : 'default';
    if (next === hover) return;
    hover = next;
    overlayStale = true;
    renderTip();
  }, { signal });

  root.addEventListener('click', (event) => {
    const hit = pick(event.clientX, event.clientY);
    if (hit < 0) return;
    // Clicking the one you already chose is how you put it away, which is the
    // only way to clear a destination that does not need a second key.
    if (monuments[hit]!.id === target()) onClear();
    else onChoose(monuments[hit]!.id);
    overlayStale = true;
  }, { signal });

  root.addEventListener('mouseleave', () => {
    hover = -1;
    renderTip();
    overlayStale = true;
  }, { signal });

  function show(): void {
    if (showing) return;
    showing = true;
    resize();
    // The cursor is the whole point of this screen, and pointer lock is holding
    // it. `input.ts` already stops the mouse look the moment the lock goes, so
    // nothing else has to be told.
    if (document.pointerLockElement) document.exitPointerLock();
    refreshCount();
    hover = -1;
    renderTip();
    baseStale = true;
    overlayStale = true;
    lastUx = 0;
    lastUy = 0;
    lastUz = 0;
    root.classList.add('on');
    measureCards();
  }

  function hide(): void {
    if (!showing) return;
    showing = false;
    root.classList.remove('on');
    tip.classList.remove('on');
    hover = -1;
    // Hand the mouse back rather than leaving the player on "click to look
    // around". Chrome rejects the request if the lock was released too recently;
    // an unhandled rejection there is noise, not news — the same rule
    // `input.ts` uses.
    if (lockTarget !== null) {
      const request: unknown = lockTarget.requestPointerLock();
      if (request instanceof Promise) request.catch(() => {});
    }
  }

  if (key !== null) {
    addEventListener('keydown', (event) => {
      // Leave the browser's own shortcuts alone, the same rule `input.ts` uses.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === key) {
        event.preventDefault();
        if (!event.repeat) {
          if (showing) hide();
          else if (options.blocked?.() !== true) show();
        }
        return;
      }
      // Escape already means "give me the cursor back" everywhere else in a
      // browser, so it means it here too.
      if (event.code === 'Escape' && showing) hide();
    }, { signal });
  }

  addEventListener('resize', () => {
    if (showing) {
      resize();
      measureCards();
      renderTip();
    } else {
      // Only the size is remembered; the outlines are rebuilt on the next open,
      // so a window being dragged about does not rebuild 26,000 points a frame.
      size = 0;
    }
  }, { signal });

  const interval = 1000 / MAX_FPS;
  /** Reused so the north probe allocates nothing per frame. */
  const north = { x: 0, y: 0, z: 0 };

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
    update(position, forward) {
      if (!showing) return;
      if (size === 0) resize();

      // North is the world's own pole, flattened onto the tangent plane. At a
      // pole there is no such direction and `setFrame` says so, and the only
      // orientation left is the one the minimap always uses — which is why the
      // fallback is the heading rather than an arbitrary axis.
      const length = Math.hypot(position.x, position.y, position.z) || 1;
      const along = position.y / length;
      north.x = -along * (position.x / length);
      north.y = 1 - along * along;
      north.z = -along * (position.z / length);
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
      // Clamped the way `geo.ts`'s own `resolve` clamps, and for the same
      // reason: the polar edge of the Antarctic ring lies exactly on +/-90, so
      // no segment ever straddles a ray cast along it.
      antipodeLat = Math.max(-89.999, Math.min(89.999, latOf(-uy)));
      antipodeLon = lonOf(-ux, -uz);

      // Where the avatar is facing, as a screen angle: zero is up the sheet.
      heading = Math.atan2(
        forward.x * rx + forward.y * ry + forward.z * rz,
        forward.x * fx + forward.y * fy + forward.z * fz,
      );

      const moved = Math.acos(Math.max(-1, Math.min(1, ux * lastUx + uy * lastUy + uz * lastUz)));
      if (moved * perRadian > MIN_SHIFT || Math.abs(heading - lastHeading) > MIN_TURN) {
        overlayStale = true;
        // The land is redrawn with the pins, never separately: they are
        // projected in the same frame, and a base that lagged the marks by two
        // pixels would stand every pin off its own coast.
        if (moved * perRadian > MIN_SHIFT) baseStale = true;
      }
      if (!overlayStale) return;

      const now = performance.now();
      if (now - drawnAt < interval) return;
      drawnAt = now;
      overlayStale = false;
      lastUx = ux;
      lastUy = uy;
      lastUz = uz;
      lastHeading = heading;
      drawOverlay();
      if (hover >= 0) renderTip();
      else if (cursorX >= 0) {
        const next = pick(cursorX, cursorY);
        if (next !== hover) {
          hover = next;
          renderTip();
        }
      }
    },
    dispose() {
      events.abort();
      root.remove();
    },
  };
}
