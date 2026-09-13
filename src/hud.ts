/**
 * Everything drawn over the world while you play: where you are, what you have
 * found, which keys do what, and the way into the settings and the map.
 *
 * **The chip and the arrival card are the heart of it and their rule is
 * unchanged**: crossing a border should feel like arriving somewhere rather
 * than like a label being overwritten, and a border is exactly where the answer
 * is least stable — walk the Spain/Portugal line and `countryAtPoint` flips
 * every few metres. So the debounce is on the *data*, not on the animation: a
 * country has to hold for a full second before it counts as where you are, and
 * the sea for three, because stepping into the water is not an arrival.
 *
 * Around them, the pieces that used to be loose markup in `index.html` and are
 * now built here, so the HUD is one element and one stylesheet:
 *
 * - **The bar, top left**: the gear, the map, and the landmarks found. The map
 *   and the settings are also keys; players who never read the keys found
 *   neither, so they are buttons as well.
 * - **The keys, along the bottom**, for the way you are travelling right now —
 *   eight keys you can use on foot are not the four you can use in a boat, and
 *   the old card listed all twelve all the time. It says itself once, then
 *   folds down to a badge; `H` opens it again and the settings can put it away.
 * - **The pause card**: pointer lock is lost on every `Esc` and every alt-tab,
 *   and what the player sees then is the one moment the cursor is free — so the
 *   card says how to get back in and offers the two buttons worth offering.
 * - **A toast** for the keys that change a setting, and **a frame counter** for
 *   the settings panel's performance switch.
 *
 * It also carries the destination furniture — the panel under the minimap and
 * the waypoint that tracks the chosen landmark across the screen — which is
 * presentation only: `navigation.ts` decides what the destination is.
 */
import type { World } from './geo.ts';
import type { Nearby } from './places.ts';
import type { Vehicle } from './player.ts';
import { OCEAN_COLOR, PALETTE } from './theme.ts';
import { createFlagCanvas } from './flags.ts';
import { ensureStyle, h, hex, icon, installUi, kbd } from './ui.ts';
import type { IconName } from './ui.ts';

/** One line of the destination panel. `navigation.ts` fills these in. */
export interface DestinationEntry {
  name: string;
  iso: string;
  /** Great-circle distance in real Earth kilometres. */
  km: number;
  visited: boolean;
}

export interface HudOptions {
  /** The gear on the bar. */
  onSettings?(): void;
  /** The map button on the bar. */
  onMap?(): void;
}

/** What the frame counter shows: `main.ts`'s rolling `stats`. */
export interface FrameStats {
  fps: number;
  frameMs: number;
  triangles: number;
  calls: number;
}

export interface Hud {
  /** All the elements, for the caller to mount. */
  root: HTMLElement;
  /**
   * Called every frame with the current country index (0 = ocean), the nearest
   * populated place or `null`, the local clock as `HH:MM`, and which way that
   * place lies — clockwise from where you are facing, in radians.
   */
  update(countryId: number, place: Nearby | null, clock: string, dt: number, bearing?: number | null): void;
  /**
   * You did not walk here: publish the next reading without waiting for it to
   * settle. **The debounce is a filter on flapping and a teleport is not
   * flapping.**
   */
  jump(): void;
  setDestination(entries: readonly DestinationEntry[] | null, browsing?: boolean): void;
  trackDestination(km: number, x: number | null, y: number, angle: number): void;
  arriveAt(name: string, iso: string): void;
  /** You walked up to a landmark for the first time. */
  foundLandmark(landmark: LandmarkArrival): void;
  /** The counter on the bar. */
  setFound(found: number, total: number): void;
  /** How you are travelling, which decides the keys along the bottom. Cheap to call every frame. */
  setVehicle(vehicle: Vehicle): void;
  /** Whether the key strip is wanted at all: the settings switch. */
  readonly hints: boolean;
  setHints(on: boolean): boolean;
  /** `H`: open the key strip if it has folded, fold it if it is open. */
  toggleHints(): void;
  /** A short line at the bottom of the screen, for a setting a key just changed. */
  toast(text: string, iconName?: IconName): void;
  /** The mouse is free and nothing else holds the screen. Cheap to call every frame. */
  setPaused(paused: boolean): void;
  /** The frame counter: on or off, and the numbers for it. */
  setPerformance(on: boolean): void;
  showPerformance(stats: FrameStats): void;
}

/** What the HUD needs to announce a landmark. `main.ts` assembles it. */
export interface LandmarkArrival {
  name: string;
  iso: string;
  /** Country name, resolved by the caller — this file knows nothing of the planet. */
  country: string;
  /** Metres, as the source file records it. Absent for a natural feature. */
  height?: number;
  /** Year completed. Absent, and meaningfully so, for anything older than a date. */
  year?: number;
  found: number;
  total: number;
}

/** How long a country has to hold before it counts as where you are. */
const SETTLE_LAND = 1.0;
/** And the sea, longer on purpose: the coast is where the flapping is worst. */
const SETTLE_OCEAN = 3.0;
/** And a place, shorter: its only flapping line is a midline crossed once, at speed. */
const SETTLE_PLACE = 0.8;
/** How long the arrival card stays before it retreats. */
const HOLD = 5.5;
/** And the landmark card, which is a rarer event and carries more to read. */
const FOUND_HOLD = 8;
/** The chip's little jolt when the place under it changes. */
const BUMP = 0.22;
/** And how long "Arrived" holds before the destination panel puts itself away. */
const ARRIVED_HOLD = 4.5;
/** How long a toast stays. */
const TOAST_HOLD = 1.8;
/**
 * How long the key strip stays open after it last changed. Long enough to read
 * twice at the pace anyone reads a row of keys; then it folds to a badge
 * rather than vanishing, so it can always be found again.
 */
const KEYS_HOLD = 14;

const R2D = 180 / Math.PI;
const TROPIC = 23.4365;
const POLAR = 66.5635;

/** How far the chip's arrow has to turn before it is rewritten: under a pixel of arrowhead. */
const ARROW_STEP = 4 / R2D;

/**
 * Village, town or city, off the one size law: `radiusFor` runs [12, 150] and
 * the cuts at 13 and 30 units are about 10,000 and 100,000 people.
 */
const sizeWord = (radius: number): string => (radius < 13 ? 'village' : radius < 30 ? 'town' : 'city');

/** The keys worth showing for each way of travelling, in the order they are used. */
const KEYS: Record<Vehicle, readonly [string[], string][]> = {
  foot: [
    [['W', 'A', 'S', 'D'], 'Move'],
    [['Shift'], 'Run'],
    [['Space'], 'Jump'],
    [['F'], 'Fly'],
    [['V'], 'First person'],
    [['M'], 'Map'],
    [['Tab'], 'Landmarks'],
  ],
  boat: [
    [['W', 'A', 'S', 'D'], 'Steer'],
    [['E'], 'Go ashore'],
    [['F'], 'Take off'],
    [['M'], 'Map'],
  ],
  plane: [
    [['W', 'A', 'S', 'D'], 'Steer'],
    [['Space'], 'Climb'],
    [['C'], 'Descend'],
    [['F'], 'Land'],
    [['B'], 'Flags'],
    [['M'], 'Map'],
  ],
};

const MODE: Record<Vehicle, [IconName, string]> = {
  foot: ['walk', 'On foot'],
  boat: ['boat', 'At sea'],
  plane: ['plane', 'Flying'],
};

const STYLE = `
.atlas-hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  font-family: var(--ui-font);
  color: var(--ui-ink);
}
.atlas-hud canvas {
  display: block;
  border: 2px solid var(--ui-ink);
  border-radius: 4px;
}
.atlas-hud .ui-btn { pointer-events: auto; }

/* --- the bar, top left ----------------------------------------------------- */
.atlas-hud-bar {
  position: absolute;
  top: 24px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.atlas-hud-found {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 44px;
  padding: 0 15px 0 9px;
  font-size: 17px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.atlas-hud-found small { font-size: 12.5px; font-weight: 700; opacity: 0.55; }
.atlas-hud-star {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ui-ink);
  color: var(--ui-gold);
}
.atlas-hud-star svg { width: 17px; height: 17px; }
.atlas-hud-found.bump { animation: ui-pop 0.5s var(--ui-spring); }

/* --- the chip, top middle --------------------------------------------------- */
.atlas-chip {
  position: absolute;
  top: 24px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 16px 0 9px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.01em;
  white-space: nowrap;
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 0.35s ease, transform 0.3s var(--ui-spring);
}
.atlas-chip-country { margin-left: -4px; font-weight: 700; opacity: 0.55; }
.atlas-chip-country:empty { display: none; }
/* Tabular figures because the number is rewritten every step. */
.atlas-chip-range {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: -4px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  opacity: 0.72;
}
.atlas-chip-range[hidden] { display: none; }
/* The glyph points up the screen at rest, so the transform *is* the bearing. */
.atlas-chip-arrow { display: inline-block; font-size: 15px; line-height: 1; transition: transform 0.12s ease; }
.atlas-chip-arrow[hidden] { display: none; }
.atlas-chip-clock {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 4px;
  padding-left: 11px;
  border-left: 2px solid var(--ui-rule);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  opacity: 0.78;
}
.atlas-chip-clock svg { width: 15px; height: 15px; }
.atlas-chip.on { opacity: 1; }
.atlas-chip.bump { transform: translateX(-50%) scale(1.07); }

/* --- the country card, from the left ---------------------------------------- */
.atlas-arrival {
  position: absolute;
  left: 26px;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 20px 12px 12px;
  max-width: 380px;
  opacity: 0;
  transform: translate(calc(-100% - 30px), -50%);
  transition: transform 0.5s var(--ui-ease), opacity 0.3s ease;
}
.atlas-arrival.in { opacity: 1; transform: translate(0, -50%); }
.atlas-card-eyebrow {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.5;
}
.atlas-arrival-name, .atlas-found-name {
  margin-top: 1px;
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.08;
}
.atlas-arrival-fact, .atlas-found-fact {
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  opacity: 0.68;
}
/*
 * The landmark card is the country card's twin on the other side of the
 * screen, and the mirroring is the point: a border arrives from the left and
 * says where you now are, a landmark from the right and says what you found.
 */
.atlas-found {
  position: absolute;
  right: 26px;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 12px 12px 20px;
  max-width: 400px;
  opacity: 0;
  transform: translate(calc(100% + 30px), -50%);
  transition: transform 0.5s var(--ui-ease), opacity 0.3s ease;
}
.atlas-found.in { opacity: 1; transform: translate(0, -50%); }
.atlas-found-text { text-align: right; }
.atlas-found-meter {
  margin: 8px 0 0 auto;
  width: 150px;
  height: 8px;
  border: 2px solid var(--ui-ink);
  border-radius: 999px;
  overflow: hidden;
  background: var(--ui-cream);
}
.atlas-found-meter i { display: block; height: 100%; background: var(--ui-gold); }

/* --- the destination, under the minimap -------------------------------------- */
.atlas-destination {
  position: absolute;
  top: 222px;
  right: 24px;
  width: 236px;
  padding: 9px 12px 10px;
  opacity: 0;
  transform: translateX(16px);
  transition: opacity 0.3s ease, transform 0.4s var(--ui-ease), background 0.3s ease;
}
.atlas-destination.on { opacity: 1; transform: none; }
.atlas-destination.arrived { background: var(--ui-gold); }
.atlas-destination-head { display: flex; align-items: center; gap: 10px; }
.atlas-destination-name { font-size: 15px; font-weight: 800; letter-spacing: -0.012em; line-height: 1.15; }
.atlas-destination-sub { margin-top: 2px; font-size: 11.5px; font-weight: 600; opacity: 0.62; }
.atlas-destination-list, .atlas-destination-hint { display: none; }
.atlas-destination.browsing .atlas-destination-list,
.atlas-destination.browsing .atlas-destination-hint { display: block; }
.atlas-destination-list { margin-top: 8px; padding-top: 6px; border-top: 2px solid var(--ui-rule); }
.atlas-destination-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.65;
  opacity: 0.55;
}
.atlas-destination-row span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-destination-row span:first-child::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  vertical-align: middle;
}
/* Gold means found, the same as the minimap's pins. */
.atlas-destination-row.visited span:first-child::before { background: var(--ui-gold); border-color: var(--ui-gold); }
.atlas-destination-hint { margin-top: 7px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em; opacity: 0.42; }

/* The waypoint. Zero-sized, so its origin is exactly the point being marked. */
.atlas-waypoint { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: opacity 0.25s ease; }
.atlas-waypoint.on { opacity: 1; }
.atlas-waypoint-pin {
  position: absolute;
  left: 0;
  top: -26px;
  width: 26px;
  height: 26px;
  box-sizing: border-box;
  background: ${hex(PALETTE.violet)};
  border: 3px solid var(--ui-ink);
  /* Three round corners and one square one: the square corner is the tip. */
  border-radius: 50% 50% 50% 0;
  transform-origin: 0 100%;
}
.atlas-waypoint-label {
  position: absolute;
  left: 50%;
  bottom: 34px;
  transform: translateX(-50%);
  padding: 4px 10px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
  border-radius: 10px;
}

/* --- the keys, along the bottom ---------------------------------------------- */
.atlas-keys {
  position: absolute;
  left: 50%;
  bottom: 22px;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 46px;
  padding: 0 14px 0 8px;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  transform: translateX(-50%);
  transition: opacity 0.3s ease, transform 0.35s var(--ui-ease);
}
.atlas-keys.off { opacity: 0; transform: translate(-50%, 24px); }
.atlas-keys-mode {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 13px;
}
.atlas-keys-badge {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-gold);
}
.atlas-keys-badge svg { width: 17px; height: 17px; }
.atlas-keys-list { display: flex; align-items: center; gap: 14px; padding-left: 14px; border-left: 2px solid var(--ui-rule); }
.atlas-keys-list > span { display: inline-flex; align-items: center; gap: 6px; }
.atlas-keys-list > span > span { display: inline-flex; gap: 3px; }
.atlas-keys-more { opacity: 0.55; display: inline-flex; align-items: center; gap: 6px; }
.atlas-keys.folded .atlas-keys-list { display: none; }
.atlas-keys:not(.folded) .atlas-keys-more { display: none; }
/* Its own keyframes and not ui-pop's: an animated transform replaces the
   element's own, and ui-pop ends on none — which took the strip off its
   translateX(-50%) and threw it half its width to the right for the length
   of the animation. */
.atlas-keys.swap { animation: atlas-keys-in 0.4s var(--ui-spring); }
@keyframes atlas-keys-in {
  from { opacity: 0; transform: translate(-50%, 10px) scale(0.96); }
  to { opacity: 1; transform: translateX(-50%); }
}

/* --- a toast ------------------------------------------------------------------ */
.atlas-toast {
  position: absolute;
  left: 50%;
  bottom: 84px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 16px 9px 11px;
  font-size: 15px;
  font-weight: 800;
  opacity: 0;
  transform: translate(-50%, 12px);
  transition: opacity 0.2s ease, transform 0.3s var(--ui-spring);
}
.atlas-toast.on { opacity: 1; transform: translate(-50%, 0); }
.atlas-toast svg { width: 19px; height: 19px; }

/* --- the pause card ------------------------------------------------------------ */
.atlas-pause {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  opacity: 0;
  visibility: hidden;
  transform: translate(-50%, -50%) scale(0.96);
  transition: opacity 0.2s ease, transform 0.3s var(--ui-spring), visibility 0.2s;
}
.atlas-pause.on { opacity: 1; visibility: visible; transform: translate(-50%, -50%); }
.atlas-pause-main { display: flex; align-items: center; gap: 14px; padding: 13px 22px 13px 13px; }
.atlas-pause-mouse {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 3px solid var(--ui-ink);
  border-radius: 13px;
  background: var(--ui-gold);
}
.atlas-pause-mouse svg { width: 26px; height: 26px; }
.atlas-pause b { display: block; font-size: 18px; font-weight: 800; letter-spacing: -0.015em; }
.atlas-pause small { display: block; margin-top: 2px; font-size: 12.5px; font-weight: 600; opacity: 0.6; }
.atlas-pause-row { display: flex; gap: 10px; }

/* --- frames ----------------------------------------------------------------------- */
.atlas-perf {
  position: absolute;
  right: 24px;
  bottom: 22px;
  display: none;
  gap: 12px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.atlas-perf.on { display: flex; }
.atlas-perf span { opacity: 0.55; font-weight: 700; margin-left: 3px; }
`;

const km = (value: number): string => `${Math.round(value).toLocaleString('en')} km`;

/**
 * The one line of context under a country's name, and every line is derived
 * from the baked outlines and checked against them: "the equator runs through
 * it" is confirmed by walking the line with `countryAt`, not read off a
 * bounding box. Where nothing more interesting is true, it is the extent.
 */
function factFor(world: World, id: number): string {
  const country = world.countries[id - 1]!;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const ring of country.rings) {
    for (const point of ring) {
      const lon = point[0]!;
      const lat = point[1]!;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }

  const onParallel = (lat: number): boolean => {
    if (lat <= minLat || lat >= maxLat) return false;
    for (let lon = minLon; lon <= maxLon; lon += 0.2) {
      if (world.countryAt(lat, lon) === id) return true;
    }
    return false;
  };
  const onMeridian = (lon: number): boolean => {
    if (lon <= minLon || lon >= maxLon) return false;
    for (let lat = minLat; lat <= maxLat; lat += 0.2) {
      if (world.countryAt(lat, lon) === id) return true;
    }
    return false;
  };

  // Past the antimeridian a longitude box means nothing, so this is first:
  // measured naively, Kiribati was 37,000 km across.
  if (maxLon - minLon > 180) return 'its land falls on both sides of the antimeridian';
  if (onParallel(0)) return 'the equator runs through it';
  if (maxLat > POLAR) return `its land reaches ${maxLat.toFixed(1)}°N, inside the Arctic Circle`;
  if (minLat < -POLAR) return `its land reaches ${(-minLat).toFixed(1)}°S, inside the Antarctic Circle`;
  if (onParallel(TROPIC)) return 'the Tropic of Cancer crosses it';
  if (onParallel(-TROPIC)) return 'the Tropic of Capricorn crosses it';
  if (onMeridian(0)) return 'the prime meridian runs through it';
  if (country.rings.length >= 6) return `drawn here from ${country.rings.length} separate landmasses`;

  const wide = (maxLon - minLon) * 111.32 * Math.cos(country.lat / R2D);
  const tall = (maxLat - minLat) * 110.57;
  const across = Math.max(wide, tall);
  if (across < 150) return `about ${km(across)} across`;
  if (country.rings.length > 1) return `${km(across)} across, and ${country.rings.length} separate landmasses`;
  return `${km(wide)} from east to west, ${km(tall)} north to south`;
}

/** The chip's stand-in for a flag when you are at sea. */
function oceanPlate(width: number, height: number): HTMLCanvasElement {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = hex(OCEAN_COLOR);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = hex(PALETTE.white);
    ctx.lineWidth = canvas.height * 0.075;
    ctx.lineCap = 'round';
    for (let row = 0; row < 2; row++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const x = (i / 24) * canvas.width;
        const y = canvas.height * (0.36 + row * 0.3) + Math.sin(i * 0.6) * canvas.height * 0.09;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  return canvas;
}

/** 1.2M, 840k: the frame counter is read at a glance. */
const shortCount = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

export function createHud(world: World, options: HudOptions = {}): Hud {
  installUi();
  ensureStyle('atlas-hud', STYLE);

  const root = h('div', { class: 'atlas-hud' });

  /* --- the bar ---------------------------------------------------------- */

  const settingsButton = h('button', { class: 'ui-btn icon', title: 'Settings', 'aria-label': 'Settings' }, icon('gear'));
  const mapButton = h('button', { class: 'ui-btn icon', title: 'World map (M)', 'aria-label': 'World map' }, icon('map'));
  settingsButton.addEventListener('click', () => options.onSettings?.());
  mapButton.addEventListener('click', () => options.onMap?.());
  const foundCount = h('span', { text: '0' });
  const foundTotal = h('small', { text: '/ 0 found' });
  const foundPill = h(
    'div',
    { class: 'atlas-hud-found ui-card', title: 'Landmarks found' },
    h('span', { class: 'atlas-hud-star' }, icon('star')),
    foundCount,
    foundTotal,
  );
  const bar = h('div', { class: 'atlas-hud-bar' }, settingsButton, mapButton, foundPill);

  /* --- the chip --------------------------------------------------------- */

  const chip = h('div', { class: 'atlas-chip ui-card' });
  const chipFlag = h('span');
  // Two claims: the smallest true thing about where you are, and the context
  // under it, which is only worth printing when the first is not the country.
  const chipName = h('span');
  // How far the named town is and which way: a third claim, on its own clock.
  const chipRange = h('span', { class: 'atlas-chip-range' });
  chipRange.hidden = true;
  const chipRangeText = h('span');
  const chipArrow = h('span', { class: 'atlas-chip-arrow', text: '↑' });
  chipRange.append(chipRangeText, chipArrow);
  const chipCountry = h('span', { class: 'atlas-chip-country' });
  // The clock is not debounced: it has no boundary to flap across.
  const chipClockIcon = h('span');
  const chipClockText = h('span');
  const chipClock = h('span', { class: 'atlas-chip-clock' }, chipClockIcon, chipClockText);
  chip.append(chipFlag, chipName, chipRange, chipCountry, chipClock);

  /* --- the two arrival cards ------------------------------------------- */

  const arrivalFlag = h('span');
  const arrivalName = h('div', { class: 'atlas-arrival-name' });
  const arrivalFact = h('div', { class: 'atlas-arrival-fact' });
  const arrival = h(
    'div',
    { class: 'atlas-arrival ui-card' },
    arrivalFlag,
    h('div', {}, h('div', { class: 'atlas-card-eyebrow', text: 'You are now in' }), arrivalName, arrivalFact),
  );

  const foundEyebrow = h('div', { class: 'atlas-card-eyebrow' });
  const foundName = h('div', { class: 'atlas-found-name' });
  const foundFact = h('div', { class: 'atlas-found-fact' });
  const foundMeter = h('i');
  const foundFlag = h('span');
  const found = h(
    'div',
    { class: 'atlas-found ui-card' },
    h('div', { class: 'atlas-found-text' }, foundEyebrow, foundName, foundFact, h('div', { class: 'atlas-found-meter' }, foundMeter)),
    foundFlag,
  );

  /* --- the destination -------------------------------------------------- */

  const destinationFlag = h('span');
  const destinationName = h('div', { class: 'atlas-destination-name' });
  // Two spans and a fixed separator, because only the right-hand one changes.
  const destinationPlace = h('span');
  const destinationRange = h('span');
  const destinationSub = h('div', { class: 'atlas-destination-sub' }, destinationPlace, ' · ', destinationRange);
  const destinationList = h('div', { class: 'atlas-destination-list' });
  const destinationHint = h('div', { class: 'atlas-destination-hint', text: 'Tab · next' });
  const destination = h(
    'div',
    { class: 'atlas-destination ui-card' },
    h('div', { class: 'atlas-destination-head' }, destinationFlag, h('div', {}, destinationName, destinationSub)),
    destinationList,
    destinationHint,
  );

  const waypointPin = h('div', { class: 'atlas-waypoint-pin' });
  const waypointLabel = h('div', { class: 'atlas-waypoint-label ui-card' });
  const waypoint = h('div', { class: 'atlas-waypoint' }, waypointPin, waypointLabel);

  /* --- the keys, the toast, the pause card, the frames ---------------- */

  const keysBadge = h('span', { class: 'atlas-keys-badge' });
  const keysMode = h('span');
  const keysList = h('span', { class: 'atlas-keys-list' });
  const keys = h(
    'div',
    { class: 'atlas-keys ui-card off' },
    h('span', { class: 'atlas-keys-mode' }, keysBadge, keysMode),
    keysList,
    h('span', { class: 'atlas-keys-more' }, kbd('H'), 'keys'),
  );

  const toastIcon = h('span');
  const toastText = h('span');
  const toast = h('div', { class: 'atlas-toast ui-card', role: 'status' }, toastIcon, toastText);

  const pauseSettings = h('button', { class: 'ui-btn' }, icon('gear', 18), 'Settings');
  const pauseMap = h('button', { class: 'ui-btn' }, icon('map', 18), 'Map', kbd('M'));
  pauseSettings.addEventListener('click', () => options.onSettings?.());
  pauseMap.addEventListener('click', () => options.onMap?.());
  const pause = h(
    'div',
    { class: 'atlas-pause' },
    h(
      'div',
      { class: 'atlas-pause-main ui-card' },
      h('span', { class: 'atlas-pause-mouse' }, icon('mouse')),
      h('div', {}, h('b', { text: 'Click to look around' }), h('small', { text: 'The mouse turns the camera. Esc gives the cursor back.' })),
    ),
    h('div', { class: 'atlas-pause-row' }, pauseSettings, pauseMap),
  );

  const perf = h('div', { class: 'atlas-perf ui-card' });

  root.append(bar, chip, arrival, found, destination, waypoint, keys, toast, pause, perf);

  // The placements carry an ISO code and the panel wants a country.
  const countryNames = new Map(world.countries.map((country) => [country.iso, country.name]));
  // Facts walk the outlines, so they are worked out once per country and kept.
  const facts = new Map<number, string>();

  /** Where you are, once it has held long enough to count. */
  let settled = -1;
  /** And which place, once the same is true of it. `null` is "nowhere named". */
  let settledPlace: Nearby | null = null;
  let placeCandidate = '';
  let placeSettled = '';
  let placeHeldFor = 0;
  let pending: Nearby | null = null;
  /** The last country the card actually announced. The ocean is never one. */
  let announced = -1;
  let candidate = -1;
  let heldFor = 0;
  let showing = false;
  let showFor = 0;
  let bumpFor = 0;
  let arrivedFor = 0;
  let foundFor = 0;
  let toastFor = 0;
  /** Set by `jump`, cleared by the next `update`: settle whatever arrives. */
  let jumped = false;
  let shownKm = NaN;
  let shownClock = '';
  let shownNight: boolean | null = null;
  let shownRange = '';
  let shownBearing = 99;

  let vehicle: Vehicle | null = null;
  let hintsOn = true;
  let keysOpenFor = KEYS_HOLD;
  let paused: boolean | null = null;

  const keyOf = (near: Nearby | null): string => (near && near.near ? `${near.index}${near.inside ? '!' : '~'}` : '');

  /** Writes the chip from whatever has settled: on a change, never per frame. */
  function renderChip(): void {
    const country = settled > 0 ? world.countries[settled - 1]! : null;
    // At sea the chip says the sea: the ocean is not somewhere you arrived.
    const place = country ? settledPlace : null;
    chipName.textContent = place ? (place.inside ? place.place.name : `near ${place.place.name}`) : country ? country.name : 'Open ocean';
    // The country you are standing in, which is not always the town's: at
    // 49.75, 6.35 the nearest built place is Trier and the ground is Luxembourg.
    chipCountry.textContent = place && country ? ` · ${country.name}` : '';
    chipFlag.replaceChildren(country ? createFlagCanvas(country.iso, 26, 17) : oceanPlate(26, 17));
    chip.classList.add('on', 'bump');
    bumpFor = BUMP;
  }

  /** What the town is and how far, rewritten on its own clock. */
  function renderRange(bearing: number | null): void {
    const place = settled > 0 ? settledPlace : null;
    if (place === null) {
      chipRange.hidden = true;
      shownRange = '';
      return;
    }
    chipRange.hidden = false;
    const size = `· a ${sizeWord(place.radius)}`;
    const text = place.inside ? size : `${size} ${place.km < 10 ? place.km.toFixed(1) : Math.round(place.km)} km`;
    if (text !== shownRange) {
      shownRange = text;
      chipRangeText.textContent = text;
    }
    chipArrow.hidden = place.inside;
    if (place.inside || bearing === null) return;
    if (Math.abs(bearing - shownBearing) < ARROW_STEP) return;
    shownBearing = bearing;
    chipArrow.style.transform = `rotate(${(bearing * R2D).toFixed(0)}deg)`;
  }

  /** The card, and only the card. The chip is `renderChip`, once, at the end. */
  function announce(id: number): void {
    settled = id;
    const country = id > 0 ? world.countries[id - 1]! : null;
    // Nor does a *town* get a card, and that is a budget: places sit a median
    // 161 units apart, one every 1.8 seconds at a run against a 5.5 s card.
    if (!country || id === announced) return;
    announced = id;
    let fact = facts.get(id);
    if (fact === undefined) {
      fact = factFor(world, id);
      facts.set(id, fact);
    }
    arrivalName.textContent = country.name;
    arrivalFact.textContent = `${country.continent} · ${fact}`;
    arrivalFlag.replaceChildren(createFlagCanvas(country.iso, 66, 44));
    arrival.classList.add('in');
    showing = true;
    showFor = 0;
  }

  function renderKeys(): void {
    if (vehicle === null) return;
    const [iconName, label] = MODE[vehicle];
    keysBadge.replaceChildren(icon(iconName));
    keysMode.textContent = label;
    keysList.replaceChildren(
      ...KEYS[vehicle].map(([caps, action]) => h('span', {}, h('span', {}, ...caps.map((cap) => kbd(cap, cap.length > 3))), action)),
      h('span', {}, kbd('H'), 'Hide'),
    );
    keys.classList.remove('swap');
    void keys.offsetWidth;
    keys.classList.add('swap');
  }

  function refreshKeys(): void {
    keys.classList.toggle('off', !hintsOn || vehicle === null);
    keys.classList.toggle('folded', keysOpenFor <= 0);
  }

  return {
    root,
    jump() {
      jumped = true;
    },
    setDestination(entries, browsing = false) {
      arrivedFor = 0;
      destination.classList.remove('arrived');
      if (entries === null || entries.length === 0) {
        destination.classList.remove('on', 'browsing');
        waypoint.classList.remove('on');
        shownKm = NaN;
        return;
      }
      const chosen = entries[0]!;
      destinationName.textContent = chosen.name;
      destinationPlace.textContent = countryNames.get(chosen.iso) ?? chosen.iso;
      destinationFlag.replaceChildren(createFlagCanvas(chosen.iso, 30, 20));
      waypointLabel.textContent = chosen.name;
      destinationRange.textContent = km(chosen.km);
      shownKm = Math.round(chosen.km);
      destinationList.replaceChildren(
        ...entries.slice(1).map((entry) =>
          h(
            'div',
            { class: entry.visited ? 'atlas-destination-row visited' : 'atlas-destination-row' },
            h('span', { text: entry.name }),
            h('span', { text: km(entry.km) }),
          ),
        ),
      );
      destination.classList.add('on');
      destination.classList.toggle('browsing', browsing);
    },
    trackDestination(distanceKm, x, y, angle) {
      const rounded = Math.round(distanceKm);
      if (rounded !== shownKm) {
        shownKm = rounded;
        destinationRange.textContent = km(distanceKm);
      }
      if (x === null || arrivedFor > 0) {
        waypoint.classList.remove('on');
        return;
      }
      waypoint.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // The tip of the unrotated teardrop points down-left, 135 degrees.
      waypointPin.style.transform = `rotate(${(angle * R2D - 135).toFixed(1)}deg)`;
      waypoint.classList.add('on');
    },
    foundLandmark(landmark) {
      foundEyebrow.textContent = `Landmark found · ${landmark.found} of ${landmark.total}`;
      foundName.textContent = landmark.name;
      // Country first because it is the one fact every landmark has; a natural
      // feature has neither of the other two and the line is just the country.
      const lines = [landmark.country];
      if (landmark.height !== undefined && landmark.height > 0) lines.push(`${landmark.height.toLocaleString('en')} m`);
      if (landmark.year !== undefined) lines.push(String(landmark.year));
      foundFact.textContent = lines.join(' · ');
      foundMeter.style.width = `${((landmark.found / Math.max(1, landmark.total)) * 100).toFixed(1)}%`;
      foundFlag.replaceChildren(createFlagCanvas(landmark.iso, 66, 44));
      found.classList.add('in');
      foundFor = FOUND_HOLD;
    },
    arriveAt(name, iso) {
      destinationName.textContent = name;
      destinationPlace.textContent = 'Arrived';
      destinationRange.textContent = countryNames.get(iso) ?? iso;
      destinationFlag.replaceChildren(createFlagCanvas(iso, 30, 20));
      destination.classList.remove('browsing');
      destination.classList.add('on', 'arrived');
      waypoint.classList.remove('on');
      shownKm = NaN;
      arrivedFor = ARRIVED_HOLD;
    },
    setFound(count, total) {
      const text = String(count);
      if (foundCount.textContent !== text && foundCount.textContent !== '0') {
        foundPill.classList.remove('bump');
        void foundPill.offsetWidth;
        foundPill.classList.add('bump');
      }
      foundCount.textContent = text;
      foundTotal.textContent = `/ ${total} found`;
    },
    setVehicle(next) {
      if (next === vehicle) return;
      vehicle = next;
      keysOpenFor = KEYS_HOLD;
      renderKeys();
      refreshKeys();
    },
    get hints() {
      return hintsOn;
    },
    setHints(on) {
      hintsOn = on;
      if (on) keysOpenFor = KEYS_HOLD;
      refreshKeys();
      return hintsOn;
    },
    toggleHints() {
      if (!hintsOn) {
        hintsOn = true;
        keysOpenFor = KEYS_HOLD;
      } else {
        keysOpenFor = keysOpenFor > 0 ? 0 : KEYS_HOLD;
      }
      refreshKeys();
    },
    toast(text, iconName = 'sparkle') {
      toastText.textContent = text;
      toastIcon.replaceChildren(icon(iconName));
      toast.classList.add('on');
      toastFor = TOAST_HOLD;
    },
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      pause.classList.toggle('on', next);
    },
    setPerformance(on) {
      perf.classList.toggle('on', on);
    },
    showPerformance(stats) {
      perf.replaceChildren(
        h('b', {}, String(stats.fps), h('span', { text: 'fps' })),
        h('b', {}, stats.frameMs.toFixed(1), h('span', { text: 'ms' })),
        h('b', {}, shortCount(stats.triangles), h('span', { text: 'tris' })),
        h('b', {}, String(stats.calls), h('span', { text: 'calls' })),
      );
    },
    update(countryId, place, clock, dt, bearing = null) {
      if (clock !== shownClock) {
        shownClock = clock;
        chipClockText.textContent = clock;
        // Day or night by the clock the chip already shows, not by the sun:
        // six to eight is what the clock means by day to someone reading it.
        const hour = Number(clock.slice(0, 2));
        const night = !(hour >= 6 && hour < 20);
        if (night !== shownNight) {
          shownNight = night;
          chipClockIcon.replaceChildren(icon(night ? 'moon' : 'sun'));
        }
      }

      if (arrivedFor > 0) {
        arrivedFor -= dt;
        if (arrivedFor <= 0) destination.classList.remove('on', 'arrived');
      }

      if (countryId !== candidate) {
        candidate = countryId;
        heldFor = 0;
      } else {
        heldFor += dt;
      }
      // The chip is one sentence about both the country and the place, so it
      // is written once after both have had their say — drawing it inside
      // either branch is how the first version said "Paris · Japan".
      let redraw = false;
      if (candidate !== settled && (jumped || heldFor >= (candidate === 0 ? SETTLE_OCEAN : SETTLE_LAND))) {
        announce(candidate);
        redraw = true;
      }
      const key = keyOf(place);
      if (key !== placeCandidate) {
        placeCandidate = key;
        pending = place;
        placeHeldFor = 0;
      } else {
        placeHeldFor += dt;
        pending = place;
      }
      if (key !== placeSettled && (jumped || placeHeldFor >= SETTLE_PLACE)) {
        placeSettled = key;
        settledPlace = key === '' ? null : pending;
        redraw = true;
      }
      jumped = false;
      if (redraw) renderChip();
      // After the settle, always: the name waits for the debounce and the
      // distance to it does not.
      renderRange(bearing);

      if (bumpFor > 0) {
        bumpFor -= dt;
        if (bumpFor <= 0) chip.classList.remove('bump');
      }
      if (showing) {
        showFor += dt;
        if (showFor >= HOLD) {
          showing = false;
          arrival.classList.remove('in');
        }
      }
      if (foundFor > 0) {
        foundFor -= dt;
        if (foundFor <= 0) found.classList.remove('in');
      }
      if (toastFor > 0) {
        toastFor -= dt;
        if (toastFor <= 0) toast.classList.remove('on');
      }
      // The keys fold only while the game has the mouse: a player reading them
      // with the cursor free is still reading them.
      if (keysOpenFor > 0 && paused === false) {
        keysOpenFor -= dt;
        if (keysOpenFor <= 0) refreshKeys();
      }
    },
  };
}
