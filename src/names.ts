import * as THREE from 'three';
import type { LandRing, World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, onSphere } from './globe.ts';
import { LAND_HEIGHT } from './geo.ts';
import { PALETTE } from './theme.ts';

/**
 * The country's name, in big letters, over the country.
 *
 * **It is HTML and not geometry, and that is the whole of the design.** A name
 * laid on the ground is a decal that has to be built, oriented, lifted, culled
 * and re-lit; a name in front of the world is a `div` with a `transform`, and
 * text in a browser is the one thing that is already hinted, kerned, subpixel-
 * positioned and free. The HUD is already that — `hud.ts`'s chip, the arrival
 * card, the found counter — so this is the same trick one layer down, at the
 * screen position a projection hands back.
 *
 * What it is *not* is a label engine. Four rules and they are all cheap:
 *
 * - **Only what the eye could reach.** In front of the camera, inside the
 *   viewport, and on the near side of the horizon — which on a sphere is one
 *   dot product against a cosine that falls out of the altitude. Without that
 *   last one every name on the planet stacks up in the middle of the screen,
 *   because a label point on the far side of the Earth projects into the frame
 *   perfectly happily.
 * - **Ten at most, nearest the middle first.** The centre of the screen is
 *   where the player is looking and where the country under it is largest.
 * - **Size by the square root of the area**, which is the only honest way to
 *   put Luxembourg and Russia in the same list; the country under the player
 *   gets a fifth again on top, because that is the one the chip is naming.
 * - **They fade with the country fill**, on the same number, so `B` and the
 *   altitude drive all three marks together.
 *
 * The names are the ones the chip uses — `NAME_LONG` from Natural Earth, out of
 * `world.countries` — and the label point is the bake's own, which `map.ts` and
 * `menu.ts` already anchor on. It is on land by construction.
 */

/** How many are drawn at once. Past this the map is text and not a map. */
const MAX_LABELS = 10;

/**
 * Type size, in pixels, against the square root of the country's area in square
 * degrees.
 *
 * The square root is what makes one scale hold: areas run 0.3 square degrees
 * (Luxembourg) to 2,760 (Russia), a ratio of 9,000, and their roots run 0.6 to
 * 52, a ratio of 90. At 1.5 px a root that puts Luxembourg on the floor at 12,
 * Belgium at 14, Spain at 22, France at 23 and everything from Brazil up on the
 * ceiling at 34 — which is right, because past a certain size the name is not
 * competing for room with anything.
 */
const FONT_MIN = 12;
const FONT_MAX = 34;
const FONT_PER_ROOT = 1.5;

/** The country you are standing in, a fifth larger. It is the one being named. */
const HERE_SCALE = 1.22;

/**
 * Margin inside the viewport, in pixels: where a name is allowed to be.
 *
 * The sides keep a name from straddling an edge; the top and the bottom keep it
 * out of the HUD's own furniture, which is the cheapest way to settle a
 * stacking order between two layers that are both `position: fixed`. The chip
 * and the found card sit in the top 60 pixels, and the controls card and the
 * toast are in the bottom 110 — so a name is never drawn over a card and the
 * cards never have to be lifted above it.
 */
const EDGE_X = 40;
const EDGE_TOP = 90;
const EDGE_BOTTOM = 118;

/**
 * How much of the horizon test is a fade rather than a cut.
 *
 * The test is `dot(up, eye) - R / |eye|`, so it is an angle in disguise and a
 * hard threshold pops a name on at the limb where the ground is edge-on and
 * unreadable anyway. 0.01 of that dot is about 0.8 degrees of arc, which at
 * 3,000 units up is the last 400 units before the edge of the world.
 */
const LIMB_FADE = 0.01;

/**
 * How wide a country has to be on the screen, in pixels, to be worth a name.
 *
 * Without it the ten nearest the middle of the screen from the plane's ceiling
 * came back **Andorra, the Faeroe Islands, Albania and Belgium** with France
 * and Spain missing, because a label point is a point and a microstate's is as
 * close to the centre of the frame as its neighbour's. The country's own size
 * has to be in the test, and the honest form of it is *on the screen*: the
 * diameter of a disc of the same area, in world units, over the range it is
 * being seen from.
 *
 * At 45 px the ceiling gives France, Spain, Algeria, Germany, Poland, Italy and
 * their size upward, and it is a **range** test and not a size one — drop to
 * 300 units over Andorra and Andorra is 127 px across and gets its name. The
 * country under the player is exempt whatever the arithmetic says, because that
 * is the one the chip is already naming.
 */
const MIN_COUNTRY_PIXELS = 45;

/** Below this nothing is drawn and the loop returns after one compare. */
const MIN_FADE = 0.01;

const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * Cream on ink, and the stroke is what makes it work over the map layer.
 *
 * It used to be written against a drawn flag — 234 different backgrounds, cream
 * vanishing on Argentina's white band and ink on Germany's black one — and the
 * layer under it is one flat colour per country now, which softens the problem
 * without removing it. `country-colors.ts` keeps every fill inside an OKLab
 * lightness of 0.38 to 0.86 precisely so that nothing on the map is snow or
 * ink, and measured over the shipped table (2026-09-08) it runs 0.379 to 0.862
 * with a median of 0.541. Cream still has almost nothing to say against
 * Belgium's gold at the top of that and ink has almost nothing against a navy
 * at the bottom, so the stroke stays. `paint-order: stroke fill` draws the ink
 * *behind* the glyph rather than over it, which is the same relationship
 * `OutlineEffect` has with the fill it hulls, so the type belongs to the same
 * drawing as the world does.
 */
const STYLE = `
.atlas-names {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  /* Behind every card the HUD has, which is a rule about DOM order as much as
     about this number: a positive z-index paints the names over the minimap and
     the chip -- ITALY came out across the middle of the minimap disc -- because
     a positioned element with z-index auto, which every card in index.html is,
     loses to any positive one whatever the document says. At 0 the names join
     that group and the order in the document decides, so main.ts inserts this
     element first. What it still wins against is the canvas, which is not
     positioned at all. */
  z-index: 0;
  font-family: ui-rounded, "SF Pro Rounded", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
}
.atlas-name {
  position: absolute;
  left: 0;
  top: 0;
  white-space: nowrap;
  font-weight: 800;
  letter-spacing: 0.055em;
  color: ${css(PALETTE.cream)};
  -webkit-text-stroke: 3px ${css(PALETTE.ink)};
  paint-order: stroke fill;
  text-shadow: 0 2px 6px rgba(30, 6, 3, 0.35);
  will-change: transform, opacity;
}
.atlas-name[hidden] { display: none; }
`;

interface Label {
  text: string;
  /** The bake's label point, as a unit vector. */
  point: THREE.Vector3;
  /** Type size in pixels, from the country's area. */
  size: number;
  /** The country as a disc of the same area: its diameter, in world units. */
  span: number;
  /** 1-based country index, so the one under the player can be found. */
  id: number;
}

/** One label placed this frame, and what it is going to cost in pixels. */
interface Placed {
  label: Label;
  x: number;
  y: number;
  size: number;
  opacity: number;
  width: number;
}

export interface CountryNames {
  root: HTMLElement;
  /**
   * `fade` is the flag's own; `here` is the 1-based country index under the
   * player, or 0. Every frame, over arrays that were made once.
   */
  update(fade: number, camera: THREE.PerspectiveCamera, here: number): void;
  /** Names on screen, and how many the frame had to choose from. On `atlas.names`. */
  stats: { drawn: number; candidates: number };
}

export function createCountryNames(world: World): CountryNames {
  const root = document.createElement('div');
  root.className = 'atlas-names';
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.appendChild(style);

  // Area per country, summed over its rings in square degrees — the same
  // shoelace `geo.ts` bakes onto every ring, so nothing is measured twice.
  const area = new Map<number, number>();
  for (const ring of world.rings as LandRing[]) {
    if (ring.water || ring.country <= 0) continue;
    area.set(ring.country, (area.get(ring.country) ?? 0) + ring.area);
  }

  const labels: Label[] = [];
  world.countries.forEach((country, index) => {
    const size = area.get(index + 1);
    if (size === undefined) return;
    labels.push({
      text: country.name.toUpperCase(),
      point: onSphere(country.lon, country.lat, new THREE.Vector3()),
      size: Math.min(FONT_MAX, FONT_MIN + FONT_PER_ROOT * Math.sqrt(size)),
      span: 2 * Math.sqrt(size / Math.PI) * UNITS_PER_DEGREE,
      id: index + 1,
    });
  });

  // The pool. Ten elements, made once, and a frame only ever writes their
  // transforms: creating and removing nodes at 60 Hz is layout thrash and this
  // is the one part of the HUD that moves every single frame.
  const pool: HTMLElement[] = [];
  for (let i = 0; i < MAX_LABELS; i++) {
    const element = document.createElement('div');
    element.className = 'atlas-name';
    element.hidden = true;
    root.appendChild(element);
    pool.push(element);
  }

  const stats = { drawn: 0, candidates: 0 };

  const viewProjection = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const eye = new THREE.Vector3();
  /**
   * The frame's working set: one slot per country, made once.
   *
   * It was sixty-four, which is a cap in **country order** and therefore the
   * wrong cap: from the plane's ceiling more than sixty-four label points are
   * on the near side of the horizon, and the loop stopped before it reached
   * Spain — the country the player was standing in. A slot is six numbers and
   * there are 234 countries; there is nothing here worth capping.
   */
  const blank: Label = { text: '', point: new THREE.Vector3(), size: 0, span: 0, id: -1 };
  const found: Placed[] = [];
  for (let i = 0; i < labels.length; i++) {
    found.push({ label: blank, x: 0, y: 0, size: 0, opacity: 0, width: 0 });
  }
  const order: Placed[] = [];
  const kept: Placed[] = [];

  /** How many of the pool are visible, so a frame only touches what changed. */
  let shown = 0;
  const hideFrom = (from: number): void => {
    for (let i = from; i < shown; i++) pool[i]!.hidden = true;
    shown = from;
  };

  return {
    root,
    stats,
    update(fade: number, camera: THREE.PerspectiveCamera, here: number): void {
      if (fade <= MIN_FADE) {
        hideFrom(0);
        stats.drawn = 0;
        stats.candidates = 0;
        return;
      }

      const width = root.clientWidth;
      const height = root.clientHeight;
      const halfW = width / 2;
      const halfH = height / 2;
      camera.getWorldPosition(eye);
      camera.getWorldDirection(forward);
      const eyeLength = Math.max(eye.length(), 1);
      // Pixels across a world unit one unit from the lens: element 5 of a
      // perspective matrix is `1 / tan(fov / 2)`, so this is the whole of the
      // projection anyone here needs and it survives a change of lens.
      const perUnit = camera.projectionMatrix.elements[5]! * halfH;
      // The horizon, as a cosine: a point is on the near side when its own up
      // and the eye's are within `acos(R / |eye|)` of each other.
      const cosHorizon = PLANET_RADIUS / eyeLength;
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

      let count = 0;
      for (const label of labels) {
        const facing = label.point.dot(eye) / eyeLength;
        const over = facing - cosHorizon;
        if (over <= 0) continue;
        // The shelf's own height, not the relief: a label point is a centroid
        // and 20 units on a 16,000-unit sphere moves it by a tenth of a pixel.
        point.copy(label.point).multiplyScalar(PLANET_RADIUS + LAND_HEIGHT);
        const ax = point.x - eye.x;
        const ay = point.y - eye.y;
        const az = point.z - eye.z;
        if (ax * forward.x + ay * forward.y + az * forward.z <= 0) continue;
        // Big enough on the screen to be worth naming, at the range it is at.
        const range = Math.sqrt(ax * ax + ay * ay + az * az);
        if (label.id !== here && (label.span * perUnit) / range < MIN_COUNTRY_PIXELS) continue;
        point.applyMatrix4(viewProjection);
        const x = halfW + point.x * halfW;
        const y = halfH - point.y * halfH;
        if (x < EDGE_X || x > width - EDGE_X || y < EDGE_TOP || y > height - EDGE_BOTTOM) continue;

        const size = label.size * (label.id === here ? HERE_SCALE : 1);
        const slot = found[count]!;
        slot.label = label;
        slot.x = x;
        slot.y = y;
        slot.size = size;
        slot.opacity = fade * Math.min(1, over / LIMB_FADE);
        // Close enough for a collision test on a proportional face: about 0.65
        // em of advance a character plus the 0.055 em of tracking, and six
        // pixels for the ink stroke either side. Measured against the real
        // thing it errs wide, which is the direction that keeps two names
        // apart. It never touches the layout.
        slot.width = label.text.length * size * 0.7 + 6;
        count++;
      }
      stats.candidates = count;

      // Nearest the middle of the screen first: that is where the player is
      // looking, and it is also where the country under them is.
      const middle = (p: Placed): number =>
        (p.x - halfW) * (p.x - halfW) +
        (p.y - halfH) * (p.y - halfH) -
        (p.label.id === here ? width * width : 0);
      order.length = 0;
      for (let i = 0; i < count; i++) order.push(found[i]!);
      order.sort((a, b) => middle(a) - middle(b));

      kept.length = 0;
      for (const candidate of order) {
        if (kept.length >= MAX_LABELS) break;
        // A name that lands on a name is one name nobody can read. The boxes
        // are half-extents around the anchor, which is the middle of the text.
        let clear = true;
        for (const other of kept) {
          if (
            Math.abs(candidate.x - other.x) < (candidate.width + other.width) / 2 &&
            Math.abs(candidate.y - other.y) < (candidate.size + other.size) * 0.7
          ) {
            clear = false;
            break;
          }
        }
        if (clear) kept.push(candidate);
      }

      kept.forEach((placed, i) => {
        const element = pool[i]!;
        element.hidden = false;
        if (element.textContent !== placed.label.text) element.textContent = placed.label.text;
        element.style.fontSize = `${placed.size.toFixed(1)}px`;
        element.style.opacity = placed.opacity.toFixed(3);
        element.style.transform =
          `translate(-50%, -50%) translate(${placed.x.toFixed(1)}px, ${placed.y.toFixed(1)}px)`;
      });
      hideFrom(kept.length);
      shown = kept.length;
      stats.drawn = shown;
    },
  };
}
