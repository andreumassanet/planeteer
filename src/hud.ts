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
 *   eight keys you can use on foot are not the four you can use at a wheel, and
 *   the old card listed all twelve all the time. It says itself once, then
 *   folds down to a badge; `H` opens it again and the settings can put it away.
 *   Which keys, and what their caps print on this keyboard, is `controls.ts`'s.
 * - **The pause card**: pointer lock is lost on every `Esc` and every alt-tab,
 *   and what the player sees then is the one moment the cursor is free — so the
 *   card says how to get back in and offers the two buttons worth offering.
 * - **A toast** for the keys that change a setting and for anything the world
 *   refused, and **a frame counter** for the settings panel's performance
 *   switch.
 * - **The prompt**, over the keys, while a vehicle you could take is within
 *   reach: `E  Drive`, or `E  Get in` when somebody else has the wheel.
 * - **The welcome card**, once per device: what there is to do here, in five
 *   keys, the first time anybody lands.
 *
 * It also carries the destination furniture — the panel under the minimap and
 * the waypoint that tracks the chosen landmark across the screen — which is
 * presentation only: `navigation.ts` decides what the destination is.
 */
import type { World } from './geo.ts';
import type { Nearby } from './places.ts';
import { OCEAN_COLOR, PALETTE } from './theme.ts';
import { createFlagCanvas } from './flags.ts';
import { countryFacts, loadCountryFacts } from './country-facts.ts';
import type { CountryFacts } from './country-facts.ts';
import { capOf, hintsFor, holdFocus, labelOf, onKeyLabels, registerModal, registerTabCard } from './controls.ts';
import type { KeyHint, TravelMode } from './controls.ts';
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
  /** "Copy link to here", on the pause card. */
  onShare?(): void;
  /** A new country's card has just come in: the arrival, once per country. */
  onArrival?(countryId: number): void;
  /**
   * The welcome card's button, from inside its click: the one moment the
   * caller may ask the browser for the mouse without a second click.
   */
  onStart?(): void;
}

/** What the frame counter shows: `main.ts`'s rolling `stats`. */
export interface FrameStats {
  fps: number;
  /** Mean CPU cost of a frame: the updates and the draw, in ms. */
  frameMs: number;
  /** Of which everything before the draw — the streamers, above all. */
  updateMs: number;
  /** And the draw: both of `outline.render`'s passes. */
  drawMs: number;
  /** The 95th percentile of the time between frames, over the last two seconds. */
  p95Ms: number;
  /** And the worst of them: the hitch you felt. */
  worstMs: number;
  /** Both passes, and the shadow map when it was redrawn. */
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
  /**
   * How you are travelling, which decides the keys along the bottom — and
   * whether a plane or a balloon is off the ground, and whether the eye is in
   * the head, which decide what some of them say; and whether a passenger
   * aloft has nobody at the controls, whose `E` takes them. Cheap to call
   * every frame.
   */
  setMode(mode: TravelMode, airborne?: boolean, firstPerson?: boolean, stranded?: boolean): void;
  /** What `E` would do here — `Drive`, `Get in` — or null for nothing in reach. Cheap to call every frame. */
  setPrompt(label: string | null, iconName?: IconName): void;
  /** Whether the key strip is wanted at all: the settings switch. */
  readonly hints: boolean;
  setHints(on: boolean): boolean;
  /**
   * `H`: open the key strip if it has folded, fold it if it is open, and turn
   * it on if the settings had it off. Returns whether it is on, for the caller
   * to remember.
   */
  toggleHints(): boolean;
  /** The clock the chip is showing, `HH:MM`, local to where you stand. */
  readonly clock: string;
  /** A short line at the bottom of the screen, for a setting a key just changed. */
  toast(text: string, iconName?: IconName): void;
  /**
   * The mouse is free and nothing else holds the screen. Cheap to call every
   * frame. `drag` is where the lock is refused and a held button looks instead.
   */
  setPaused(paused: boolean, drag?: boolean): void;
  /**
   * The first-run card: what there is to do and the five keys that do it.
   * Resolves when it is put away. The caller decides whether it has been seen.
   */
  welcome(total: number): Promise<void>;
  /** Whether the welcome card is up. */
  readonly welcoming: boolean;
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
  /**
   * Year completed, negative before Christ. Absent, and meaningfully so, for
   * anything older than a date.
   */
  year?: number;
  /** A sentence about it, when the source has one. */
  note?: string;
  found: number;
  total: number;
}

/** How long a country has to hold before it counts as where you are. */
const SETTLE_LAND = 1.0;
/** And the sea, longer on purpose: the coast is where the flapping is worst. */
const SETTLE_OCEAN = 3.0;
/** And a place, shorter: its only flapping line is a midline crossed once, at speed. */
const SETTLE_PLACE = 0.8;
/**
 * And a place from the plane, shorter again, because from the air a place is
 * named only while you are over its square, and at the lowest cruise, 380 units
 * a second, a 60-unit town is under you for a third of a second. What flaps up
 * there is not a boundary but the nearest town itself, which changes every few
 * tenths of a second — and that is why the plane names only what it is over.
 */
const SETTLE_FLIGHT = 0.2;
/**
 * How far offshore a town still names the sea you are on, in real km: "Off
 * Palma" from the boat in the bay, "Open water" past it. About the distance a
 * town is visible from a deck, and far short of the 88 km the name reaches on
 * land, which at sea would name a harbour from over the horizon.
 */
const OFFSHORE_KM = 40;
/** How long the arrival card stays before it retreats. */
const HOLD = 5.5;
/** And the landmark card, which is a rarer event and carries more to read. */
const FOUND_HOLD = 8;
/**
 * Longer again when it carries a sentence: the notes run to about 140
 * characters, five or six seconds of reading on their own.
 */
const NOTE_HOLD = 4;
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
/** How near the screen's edge a waypoint label may come, in CSS pixels. */
const LABEL_MARGIN = 12;

/**
 * Village, town or city, off the one size law: `radiusFor` runs [12, 150] and
 * the cuts at 13 and 30 units are about 10,000 and 100,000 people.
 */
const sizeWord = (radius: number): string => (radius < 13 ? 'village' : radius < 30 ? 'town' : 'city');

const MODE: Record<TravelMode, [IconName, string]> = {
  foot: ['walk', 'On foot'],
  swim: ['swim', 'Swimming'],
  car: ['car', 'Driving'],
  boat: ['boat', 'At sea'],
  plane: ['plane', 'Flying'],
  balloon: ['balloon', 'Ballooning'],
  bicycle: ['bike', 'Cycling'],
  motorbike: ['moto', 'Riding'],
  horse: ['horse', 'On horseback'],
  jetski: ['jetski', 'Jet ski'],
  sailboat: ['boat', 'Sailing'],
  helicopter: ['heli', 'Flying'],
  passenger: ['seat', 'Passenger'],
};

/** A row of caps for one line of a key list: `W A S D`, `Shift`. */
export function capsOf(hint: KeyHint): HTMLElement[] {
  return hint.keys.map((key) => {
    const cap = capOf(key);
    return kbd(cap, cap.length > 3);
  });
}

/**
 * A year, as a person reads it: *1889*, but *AD 80* — a bare "80" beside a
 * height reads as a second measurement — and *2560 BC*.
 */
export function yearText(year: number): string {
  if (year < 0) return `${-year} BC`;
  if (year < 1000) return `AD ${year}`;
  return String(year);
}

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
/*
 * Centred, and never wider than the gap between the bar on the left (about 280
 * px) and the minimap on the right (about 200): "Democratic Republic of the
 * Congo" is 330 px at this size and ran under the bar on a 1,050-pixel window.
 * The names give way first, with an ellipsis; the flag, the range and the clock
 * never do.
 */
.atlas-chip {
  position: absolute;
  top: 24px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  max-width: calc(100vw - 600px);
  padding: 0 16px 0 9px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.01em;
  white-space: nowrap;
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 0.35s ease, transform 0.3s var(--ui-spring);
}
.atlas-chip > * { flex: none; }
.atlas-chip > .atlas-chip-name, .atlas-chip > .atlas-chip-country {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.atlas-chip > .atlas-chip-country { flex-shrink: 3; }
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
/*
 * Under the bar, left-aligned, once the middle of the screen is too narrow for
 * it: below about 980 px the gap left in the middle is under 380, which is the
 * range and the clock with no room for a name.
 */
@media (max-width: 980px) {
  .atlas-chip { top: 80px; left: 24px; max-width: calc(100vw - 260px); transform: none; transform-origin: 0 50%; }
  .atlas-chip.bump { transform: scale(1.07); }
}

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
.atlas-arrival-facts {
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.35;
  opacity: 0.85;
}
.atlas-arrival-facts:empty { display: none; }
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
.atlas-found-note {
  margin-top: 6px;
  max-width: 290px;
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  opacity: 0.8;
  text-wrap: pretty;
}
.atlas-found-note:empty { display: none; }
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
/*
 * Centred by its margins and not by a translate, because it has to be able to
 * wrap: a box placed at left: 50% is offered only half the screen, so a strip
 * allowed to wrap there broke in two at 800 px on a 1,600-pixel window, and
 * held on one line it ran off both edges under 900. Here it is as wide as its
 * keys, never wider than the window, and a second row when it must.
 */
.atlas-keys {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 22px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 14px;
  width: max-content;
  max-width: calc(100vw - 48px);
  min-height: 46px;
  box-sizing: border-box;
  padding: 6px 14px 6px 8px;
  font-size: 12.5px;
  font-weight: 700;
  transition: opacity 0.3s ease, transform 0.35s var(--ui-ease);
}
.atlas-keys.off { opacity: 0; transform: translateY(24px); }
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
.atlas-keys-mode { flex: none; white-space: nowrap; }
.atlas-keys-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  min-width: 0;
  padding-left: 14px;
  border-left: 2px solid var(--ui-rule);
}
.atlas-keys-list > span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.atlas-keys-list > span > span { display: inline-flex; gap: 3px; }
.atlas-keys-more { opacity: 0.55; display: inline-flex; align-items: center; gap: 6px; }
.atlas-keys.folded .atlas-keys-list { display: none; }
.atlas-keys:not(.folded) .atlas-keys-more { display: none; }
/* Its own keyframes and not ui-pop's, from when the strip was centred by a
   translate: an animated transform replaces the element's own, and ui-pop
   threw it half its width to the right. Centred by its margins now, it would
   survive ui-pop; it keeps its own for the shorter rise. */
.atlas-keys.swap { animation: atlas-keys-in 0.4s var(--ui-spring); }
@keyframes atlas-keys-in {
  from { opacity: 0; transform: translateY(10px) scale(0.96); }
  to { opacity: 1; transform: none; }
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
/* The strip on foot adds up to about a thousand pixels from the widths of its
   caps and words (summed, not measured in a browser), and takes a second row
   below that; a toast at its usual height would sit on the second row. */
@media (max-width: 1080px) {
  .atlas-toast { bottom: 118px; }
}

/* --- the prompt: what E does here ------------------------------------------------- */
.atlas-prompt {
  position: absolute;
  left: 50%;
  bottom: 136px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 14px 7px 8px;
  font-size: 15px;
  font-weight: 800;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 8px);
  transition: opacity 0.15s ease, transform 0.25s var(--ui-spring);
}
.atlas-prompt.on { opacity: 1; transform: translate(-50%, 0); }
.atlas-prompt svg { width: 19px; height: 19px; }
@media (max-width: 1080px) {
  .atlas-prompt { bottom: 170px; }
}

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
.atlas-pause-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }

/* --- the welcome card, once --------------------------------------------------- */
.atlas-welcome {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(30, 6, 3, 0.36);
  opacity: 0;
  visibility: hidden;
  pointer-events: auto;
  transition: opacity 0.25s ease, visibility 0.25s;
}
.atlas-welcome.on { opacity: 1; visibility: visible; }
.atlas-welcome.on .atlas-welcome-card { animation: ui-pop 0.4s var(--ui-spring) both; }
.atlas-welcome-card { width: min(470px, 100%); padding: 22px 24px 20px; }
.atlas-welcome-head { display: flex; align-items: center; gap: 14px; }
.atlas-welcome-badge {
  display: grid;
  place-items: center;
  flex: none;
  width: 46px;
  height: 46px;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-ink);
  color: var(--ui-gold);
  box-shadow: 0 3px 0 var(--ui-ink);
}
.atlas-welcome-badge svg { width: 26px; height: 26px; }
.atlas-welcome-title { font-size: 23px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
.atlas-welcome-sub { margin-top: 4px; font-size: 13px; font-weight: 600; line-height: 1.4; opacity: 0.62; }
.atlas-welcome-list {
  display: grid;
  gap: 10px;
  margin: 16px 0 18px;
  padding-top: 14px;
  border-top: 2.5px solid var(--ui-rule);
}
.atlas-welcome-row { display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 700; line-height: 1.3; }
.atlas-welcome-row > span:first-child { display: flex; flex: none; gap: 4px; min-width: 60px; }
.atlas-welcome-go { width: 100%; }

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

/*
 * Nothing slides for a player who has asked the system for less motion: every
 * card comes and goes where it stands, by its opacity alone. The chip's arrow
 * turns without easing, and the counter and the chip do not jolt.
 */
@media (prefers-reduced-motion: reduce) {
  .atlas-arrival, .atlas-arrival.in, .atlas-found, .atlas-found.in { transform: translate(0, -50%); transition: opacity 0.2s ease; }
  .atlas-toast, .atlas-toast.on { transform: translate(-50%, 0); transition: opacity 0.2s ease; }
  .atlas-keys, .atlas-keys.off { transform: none; transition: opacity 0.2s ease; }
  .atlas-destination, .atlas-destination.on { transform: none; }
  .atlas-pause, .atlas-pause.on { transform: translate(-50%, -50%); }
  .atlas-chip, .atlas-chip.bump { transform: translateX(-50%); transition: opacity 0.2s ease; }
  .atlas-keys.swap, .atlas-hud-found.bump, .atlas-welcome.on .atlas-welcome-card { animation: none; }
  .atlas-chip-arrow { transition: none; }
}
@media (prefers-reduced-motion: reduce) and (max-width: 980px) {
  .atlas-chip, .atlas-chip.bump { transform: none; }
}
`;

const km = (value: number): string => `${Math.round(value).toLocaleString('en')} km`;

/**
 * The one line of context under a country's name, and every line is derived
 * from the baked outlines and checked against them: "the equator runs through
 * it" is confirmed by walking the line with `countryAt`, not read off a
 * bounding box. Where nothing more interesting is true, it is the extent.
 */
/** "47 million", "8.4 million", "1.4 billion", "38,000": a population as it is said. */
function peopleText(population: number): string {
  if (population >= 1e9) return `${(population / 1e9).toFixed(1)} billion`;
  if (population >= 1e7) return `${Math.round(population / 1e6)} million`;
  if (population >= 1e6) return `${(population / 1e6).toFixed(1)} million`;
  return Math.round(population).toLocaleString('en');
}

/** The card's first line: capital, people, the language most of them speak. */
function describeCountry(facts: CountryFacts): string {
  const parts: string[] = [];
  if (facts.capital) parts.push(`Capital ${facts.capital}`);
  if (facts.population > 0) parts.push(`${peopleText(facts.population)} people`);
  if (facts.languages.length > 0) parts.push(facts.languages[0]!);
  return parts.join(' · ');
}

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
  const chipName = h('span', { class: 'atlas-chip-name' });
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
  // What a person would tell you about the place — its capital, how many live
  // there, what they speak — above the line the outlines can say for
  // themselves. Filled when `country-facts.ts` answers, which is once, on the
  // first frontier; empty (and hidden) for the few features that are not
  // countries.
  const arrivalFacts = h('div', { class: 'atlas-arrival-facts' });
  // Asked for now rather than at the first frontier: fetched on demand, the
  // first card came up without its line and grew one a moment later. 10 KB
  // gzipped, after the world is already standing; a failure is retried then.
  setTimeout(() => void loadCountryFacts().catch(() => undefined), 0);
  const arrival = h(
    'div',
    { class: 'atlas-arrival ui-card' },
    arrivalFlag,
    h('div', {}, h('div', { class: 'atlas-card-eyebrow', text: 'You are now in' }), arrivalName, arrivalFacts, arrivalFact),
  );

  const foundEyebrow = h('div', { class: 'atlas-card-eyebrow' });
  const foundName = h('div', { class: 'atlas-found-name' });
  const foundFact = h('div', { class: 'atlas-found-fact' });
  const foundMeter = h('i');
  const foundFlag = h('span');
  const foundNote = h('div', { class: 'atlas-found-note' });
  const found = h(
    'div',
    { class: 'atlas-found ui-card' },
    h('div', { class: 'atlas-found-text' }, foundEyebrow, foundName, foundFact, foundNote, h('div', { class: 'atlas-found-meter' }, foundMeter)),
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
  const destinationHint = h('div', { class: 'atlas-destination-hint' });
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
  const keysMore = h('span', { class: 'atlas-keys-more' });
  const keys = h(
    'div',
    { class: 'atlas-keys ui-card off' },
    h('span', { class: 'atlas-keys-mode' }, keysBadge, keysMode),
    keysList,
    keysMore,
  );

  const toastIcon = h('span');
  const toastText = h('span');
  const toast = h('div', { class: 'atlas-toast ui-card', role: 'status' }, toastIcon, toastText);
  const promptKey = h('span');
  const promptIcon = h('span');
  const promptText = h('span');
  const prompt = h('div', { class: 'atlas-prompt ui-card', role: 'status' }, promptKey, promptIcon, promptText);
  let promptShown: string | null = null;

  const pauseSettings = h('button', { class: 'ui-btn' }, icon('gear', 18), 'Settings');
  const pauseMap = h('button', { class: 'ui-btn' });
  // A link to exactly where you are standing, which is also what `?at=` in
  // the address has always meant: see `main.ts`.
  const pauseShare = h('button', { class: 'ui-btn' }, icon('pin', 18), 'Copy link to here');
  pauseSettings.addEventListener('click', () => options.onSettings?.());
  pauseMap.addEventListener('click', () => options.onMap?.());
  pauseShare.addEventListener('click', () => options.onShare?.());
  const pauseTitle = h('b');
  const pauseText = h('small');
  // A dialog to assistive technology and to `inputBlocked`, so that `Enter`
  // and `Space` on one of its buttons press the button rather than jump; not
  // modal, because the world goes on behind it and a click on it plays.
  const pause = h(
    'div',
    { class: 'atlas-pause', role: 'dialog', 'aria-label': 'Paused' },
    h(
      'div',
      { class: 'atlas-pause-main ui-card' },
      h('span', { class: 'atlas-pause-mouse' }, icon('mouse')),
      h('div', {}, pauseTitle, pauseText),
    ),
    h('div', { class: 'atlas-pause-row' }, pauseSettings, pauseMap, options.onShare === undefined ? null : pauseShare),
  );

  const perf = h('div', { class: 'atlas-perf ui-card' });

  /* --- the welcome card ------------------------------------------------- */

  const welcomeTitle = h('div', { class: 'atlas-welcome-title' });
  const welcomeSub = h('div', { class: 'atlas-welcome-sub' });
  const welcomeList = h('div', { class: 'atlas-welcome-list' });
  const welcomeGo = h('button', { class: 'ui-btn primary big atlas-welcome-go' }, 'Start exploring', icon('next'));
  const welcomeCard = h(
    'div',
    { class: 'atlas-welcome-card ui-card' },
    h(
      'div',
      { class: 'atlas-welcome-head' },
      h('div', { class: 'atlas-welcome-badge' }, icon('star')),
      h('div', {}, welcomeTitle, welcomeSub),
    ),
    welcomeList,
    welcomeGo,
  );
  const welcomeRoot = h(
    'div',
    { class: 'atlas-welcome', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome' },
    welcomeCard,
  );

  root.append(bar, chip, arrival, found, destination, waypoint, keys, toast, prompt, pause, perf, welcomeRoot);

  // The placements carry an ISO code and the panel wants a country.
  const countryNames = new Map(world.countries.map((country) => [country.iso, country.name]));
  // Facts walk the outlines, so they are worked out once per country and kept.
  const facts = new Map<number, string>();

  /** Where you are, once it has held long enough to count. */
  let settled = -1;
  /**
   * And which place, once the same is true of it. `null` is "nowhere named".
   * Refreshed every frame the reading is still that place, because the range
   * beside the name reads its distance: the object from the frame it settled
   * on held that frame's distance for as long as you walked towards it.
   */
  let settledPlace: Nearby | null = null;
  let placeCandidate = '';
  let placeSettled = '';
  let placeHeldFor = 0;
  /** What the chip's place clause says: in it, near it, off its coast, or nothing. */
  let chipMode: 'in' | 'near' | 'off' | null = null;
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
  /**
   * The angle the chip's arrow is drawn at, in radians, **unwrapped**. The
   * bearing comes in folded into (-pi, pi], and the arrow has a CSS transition:
   * written as it came, a town dead behind you and a step to either side took
   * the arrow from +179 degrees to -179 by the long way round, a whole turn in
   * an eighth of a second. The arrow moves by the short way from wherever it
   * is, so the number it is drawn at is allowed to leave the fold.
   */
  let arrowAngle = 0;
  /** The found counter has been written once: the first write is not a find. */
  let countPrimed = false;
  /** The waypoint label's width, measured when its text changes, and how far it is slid. */
  let labelWidth = -1;
  let labelShift = 0;

  let mode: TravelMode | null = null;
  /** A plane or a balloon off the ground: the chip names only what it is over, and the keys say so. */
  let flying = false;
  let firstPerson = false;
  let stranded = false;
  let hintsOn = true;
  let keysOpenFor = KEYS_HOLD;
  let paused: boolean | null = null;
  let dragLook = false;
  let welcoming = false;
  let finishWelcome: (() => void) | null = null;
  let welcomeTotal = 0;

  registerModal(() => welcoming);

  /**
   * Which place the chip is naming, as a string that changes exactly when the
   * chip's sentence would: the place and how it is related to you.
   *
   * - **From the plane, only the town you are over.** The nearest town changes
   *   every few tenths of a second at cruise, so the place debounce never
   *   settled and the chip went on naming the town you took off from, hundreds
   *   of kilometres behind. Over a square is a fact about now; the country is
   *   the rest of the time.
   * - **At sea, the town whose coast you are off**, inside `OFFSHORE_KM`.
   * - **On land, the town whose name reaches here**: `near`, or `inside` it.
   */
  function keyOf(countryId: number, near: Nearby | null): string {
    if (near === null) return '';
    if (flying) return near.inside ? `${near.index}!` : '';
    if (countryId === 0) return near.km <= OFFSHORE_KM ? `${near.index}@` : '';
    return near.near ? `${near.index}${near.inside ? '!' : '~'}` : '';
  }

  const kmText = (value: number): string => `${value < 10 ? value.toFixed(1) : Math.round(value)} km`;

  /** Writes the chip from whatever has settled: on a change, never per frame. */
  function renderChip(): void {
    // Nothing until the ground has said what it is. The place settles in 0.8 s
    // and the country in 1.0, so on arrival the town came first and, with no
    // country yet, read as the sea: *Off Bourges* over Bourges' own square.
    if (settled < 0) return;
    const country = settled > 0 ? world.countries[settled - 1]! : null;
    const relation = placeSettled.slice(-1);
    if (country !== null) chipMode = relation === '!' ? 'in' : relation === '~' ? 'near' : null;
    // At sea the chip says the sea — the ocean is not somewhere you arrived —
    // unless a town's quay is in sight: *Off Palma* from the bay. "Water" and
    // not "sea", because a lake is country 0 as well and Baikal is not a sea.
    // (It said "Open ocean", which was wrong on every lake.)
    // And only a place that was settled *at sea* (`@`): walking ashore, the
    // town can settle a moment before the country does.
    else chipMode = relation === '@' && settledPlace !== null && settledPlace.km <= OFFSHORE_KM && !flying ? 'off' : null;
    const place = chipMode === null ? null : settledPlace;
    chipName.textContent =
      place === null
        ? country ? country.name : 'Open water'
        : chipMode === 'in' ? place.place.name : chipMode === 'near' ? `near ${place.place.name}` : `Off ${place.place.name}`;
    // The country you are standing in, which is not always the town's: at
    // 49.75, 6.35 the nearest built place is Trier and the ground is Luxembourg.
    chipCountry.textContent = place !== null && country !== null ? ` · ${country.name}` : '';
    chip.title = chipName.textContent + chipCountry.textContent;
    chipFlag.replaceChildren(country ? createFlagCanvas(country.iso, 26, 17) : oceanPlate(26, 17));
    chip.classList.add('on', 'bump');
    bumpFor = BUMP;
  }

  /** What the town is and how far, rewritten on its own clock. */
  function renderRange(bearing: number | null): void {
    const place = chipMode === null ? null : settledPlace;
    if (place === null) {
      chipRange.hidden = true;
      shownRange = '';
      return;
    }
    chipRange.hidden = false;
    const size = `· a ${sizeWord(place.radius)}`;
    // Off a coast the size is noise and the distance is the whole point.
    const text = chipMode === 'in' ? size : chipMode === 'off' ? `· ${kmText(place.km)}` : `${size} ${kmText(place.km)}`;
    if (text !== shownRange) {
      shownRange = text;
      chipRangeText.textContent = text;
    }
    chipArrow.hidden = chipMode === 'in';
    if (chipMode === 'in' || bearing === null) return;
    const turn = Math.atan2(Math.sin(bearing - arrowAngle), Math.cos(bearing - arrowAngle));
    if (Math.abs(turn) < ARROW_STEP) return;
    arrowAngle += turn;
    chipArrow.style.transform = `rotate(${(arrowAngle * R2D).toFixed(0)}deg)`;
  }

  /** The card, and only the card. The chip is `renderChip`, once, at the end. */
  function announce(id: number): void {
    settled = id;
    const country = id > 0 ? world.countries[id - 1]! : null;
    // Nor does a *town* get a card, and that is a budget: places sit a median
    // 161 units apart, one every 16 seconds at a run (every 1.8 at the run of
    // 90, before 2026-09-24) against a 5.5 s card.
    if (!country || id === announced) return;
    announced = id;
    let fact = facts.get(id);
    if (fact === undefined) {
      fact = factFor(world, id);
      facts.set(id, fact);
    }
    arrivalName.textContent = country.name;
    arrivalFact.textContent = `${country.continent} · ${fact}`;
    arrivalFacts.textContent = '';
    void countryFacts(country.iso).then((known) => {
      // A later card has the slot by now, or there is nothing to say.
      if (known === null || announced !== id) return;
      arrivalFacts.textContent = describeCountry(known);
    }).catch(() => {
      // Offline, or the file is missing: the card says what the outlines
      // know, and the next crossing asks again.
    });
    arrivalFlag.replaceChildren(createFlagCanvas(country.iso, 66, 44));
    arrival.classList.add('in');
    showing = true;
    showFor = 0;
    options.onArrival?.(id);
  }

  function renderKeys(animate: boolean): void {
    if (mode === null) return;
    const [iconName, label] = MODE[mode];
    keysBadge.replaceChildren(icon(iconName));
    keysMode.textContent = (mode === 'plane' || mode === 'helicopter') && !flying ? 'On the ground' : label;
    keysList.replaceChildren(
      ...hintsFor(mode, flying, firstPerson, stranded).map((hint) => h('span', {}, h('span', {}, ...capsOf(hint)), hint.label)),
      h('span', {}, kbd(labelOf('hints')), 'Hide'),
    );
    if (!animate) return;
    keys.classList.remove('swap');
    void keys.offsetWidth;
    keys.classList.add('swap');
  }

  function refreshKeys(): void {
    keys.classList.toggle('off', !hintsOn || mode === null);
    keys.classList.toggle('folded', keysOpenFor <= 0);
  }

  function renderPause(): void {
    pauseTitle.textContent = dragLook ? 'Drag to look around' : 'Click to look around';
    pauseText.textContent = dragLook
      ? 'This page cannot lock the mouse, so hold a button and move it to turn the camera.'
      : `The mouse turns the camera. ${labelOf('release')} gives the cursor back.`;
  }

  function renderWelcome(): void {
    welcomeTitle.textContent = `${welcomeTotal} landmarks to find`;
    welcomeSub.textContent = 'They stand all over the real planet. Walk up to one and it counts as found.';
    const row = (caps: HTMLElement[], text: string): HTMLElement =>
      h('div', { class: 'atlas-welcome-row' }, h('span', {}, ...caps), h('span', { text }));
    welcomeList.replaceChildren(
      row([kbd(labelOf('next'), true)], 'Point at the next landmark to find'),
      row([kbd(labelOf('map'))], 'The whole planet on one map: click a pin to head there'),
      row([kbd(labelOf('use'))], 'Walk up to a car, a boat or a plane and take it'),
      row(capsOf({ keys: ['forward', 'left', 'back', 'right'], label: '' }), 'Walk into the sea and you swim'),
    );
  }

  /** Every label that names a key, rewritten when the keyboard's layout arrives. */
  function relabel(): void {
    mapButton.title = `World map (${labelOf('map')})`;
    keysMore.replaceChildren(kbd(labelOf('hints')), 'keys');
    destinationHint.textContent = `${labelOf('next')} · next`;
    pauseMap.replaceChildren(icon('map', 18), 'Map', kbd(labelOf('map')));
    if (promptShown !== null) promptKey.replaceChildren(kbd(labelOf('use')));
    renderPause();
    renderKeys(false);
    if (welcoming) renderWelcome();
  }
  relabel();
  onKeyLabels(relabel);

  function closeWelcome(): void {
    if (!welcoming) return;
    welcoming = false;
    welcomeRoot.classList.remove('on');
    // The focus goes back to the world and not to a control: nothing opened
    // this card, so there is no control to return it to, and the keys are the
    // world's again the moment it closes.
    (document.activeElement as HTMLElement | null)?.blur?.();
    // Unknown until the next frame says: the button has just asked for the
    // mouse, and whether it got it is the browser's to answer.
    paused = null;
    finishWelcome?.();
    finishWelcome = null;
  }
  welcomeGo.addEventListener('click', () => {
    // Inside the click, so the browser still counts it as the player's gesture
    // when the caller asks for the mouse.
    options.onStart?.();
    closeWelcome();
  });
  // The pause card takes `Tab` from the landmarks while it is up: its buttons
  // are the only things on the screen a key can press.
  const pauseUp = (): boolean => paused === true && !welcoming;
  registerTabCard(pauseUp);
  addEventListener('keydown', (event) => {
    if (pauseUp()) holdFocus(event, pause);
  });
  addEventListener('keydown', (event) => {
    if (!welcoming) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      closeWelcome();
    } else {
      // Modal means the focus as well as the keys: `Tab` walked off this card
      // onto the controls behind it while it was still up.
      holdFocus(event, welcomeCard);
    }
  });

  return {
    root,
    jump() {
      jumped = true;
      // The cards belong to the place you left: a country card for Spain and
      // a landmark in Paris are not news in Tokyo.
      showing = false;
      arrival.classList.remove('in');
      foundFor = 0;
      found.classList.remove('in');
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
      if (waypointLabel.textContent !== chosen.name) {
        waypointLabel.textContent = chosen.name;
        labelWidth = -1;
      }
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
      // The label is centred over the tip, and a marker pinned to the edge of
      // the screen is 84 pixels in while a label may be 240 across: slide it
      // back on rather than let the name be cut in half.
      if (labelWidth < 0) labelWidth = waypointLabel.offsetWidth;
      const half = labelWidth / 2;
      let shift = 0;
      if (x - half < LABEL_MARGIN) shift = LABEL_MARGIN - (x - half);
      else if (x + half > innerWidth - LABEL_MARGIN) shift = innerWidth - LABEL_MARGIN - (x + half);
      shift = Math.round(shift);
      if (shift !== labelShift) {
        labelShift = shift;
        waypointLabel.style.transform = shift === 0 ? '' : `translateX(calc(-50% + ${shift}px))`;
      }
      waypoint.classList.add('on');
    },
    foundLandmark(landmark) {
      foundEyebrow.textContent = `Landmark found · ${landmark.found} of ${landmark.total}`;
      foundName.textContent = landmark.name;
      // Country first because it is the one fact every landmark has; a natural
      // feature has neither of the other two and the line is just the country.
      const lines = [landmark.country];
      if (landmark.height !== undefined && landmark.height > 0) lines.push(`${landmark.height.toLocaleString('en')} m`);
      if (landmark.year !== undefined) lines.push(yearText(landmark.year));
      foundFact.textContent = lines.join(' · ');
      foundNote.textContent = landmark.note ?? '';
      foundMeter.style.width = `${((landmark.found / Math.max(1, landmark.total)) * 100).toFixed(1)}%`;
      foundFlag.replaceChildren(createFlagCanvas(landmark.iso, 66, 44));
      found.classList.add('in');
      foundFor = FOUND_HOLD + (landmark.note ? NOTE_HOLD : 0);
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
      // The first write is the count you arrived with, not a find — and it
      // used to be spotted by the text still reading '0', which is also what
      // it reads right before your first landmark, so the first find of all
      // was the one that never jolted.
      if (countPrimed && foundCount.textContent !== text) {
        foundPill.classList.remove('bump');
        void foundPill.offsetWidth;
        foundPill.classList.add('bump');
      }
      countPrimed = true;
      foundCount.textContent = text;
      foundTotal.textContent = `/ ${total} found`;
    },
    setMode(next, nextAirborne = false, nextFirstPerson = false, nextStranded = false) {
      const view = (next === 'foot' || next === 'swim') && nextFirstPerson;
      const aloft = (next === 'plane' || next === 'balloon' || next === 'helicopter' || next === 'passenger') && nextAirborne;
      const alone = next === 'passenger' && aloft && nextStranded;
      if (next === mode && aloft === flying && view === firstPerson && alone === stranded) return;
      stranded = alone;
      // A new way of travelling, or a take-off or a landing, opens the strip
      // again because what the keys do has changed; looking through your own
      // eyes changes one word, and only rewrites it.
      const reopen = next !== mode || aloft !== flying;
      mode = next;
      flying = aloft;
      firstPerson = view;
      if (reopen) keysOpenFor = KEYS_HOLD;
      renderKeys(reopen);
      refreshKeys();
    },
    setPrompt(label, iconName = 'sparkle') {
      const key = label === null ? null : `${label}|${iconName}`;
      if (key === promptShown) return;
      promptShown = key;
      prompt.classList.toggle('on', label !== null);
      if (label === null) return;
      promptKey.replaceChildren(kbd(labelOf('use')));
      promptIcon.replaceChildren(icon(iconName));
      promptText.textContent = label;
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
      return hintsOn;
    },
    get clock() {
      return shownClock;
    },
    toast(text, iconName = 'sparkle') {
      toastText.textContent = text;
      toastIcon.replaceChildren(icon(iconName));
      toast.classList.add('on');
      // Long enough to read: a toast that says why something was refused is
      // a sentence, not a setting's name.
      toastFor = Math.max(TOAST_HOLD, text.length * 0.055);
    },
    setPaused(next, drag = false) {
      if (drag !== dragLook) {
        dragLook = drag;
        renderPause();
      }
      if (next === paused) return;
      paused = next;
      pause.classList.toggle('on', next && !welcoming);
      // A button left focused on a card that has gone would hold every key
      // the world reads (`inputBlocked` asks the focused element).
      if (!next && pause.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    },
    get welcoming() {
      return welcoming;
    },
    welcome(total) {
      welcomeTotal = total;
      renderWelcome();
      welcoming = true;
      welcomeRoot.classList.add('on');
      pause.classList.remove('on');
      welcomeGo.focus({ preventScroll: true });
      return new Promise<void>((resolve) => {
        finishWelcome = resolve;
      });
    },
    setPerformance(on) {
      perf.classList.toggle('on', on);
    },
    showPerformance(stats) {
      const figure = (value: string, unit: string, title: string): HTMLElement =>
        h('b', { title }, value, h('span', { text: unit }));
      perf.replaceChildren(
        figure(String(stats.fps), 'fps', 'Frames drawn per second'),
        figure(stats.frameMs.toFixed(1), 'ms', 'CPU time of an average frame: the updates and the draw'),
        figure(`${Math.round(stats.p95Ms)}/${Math.round(stats.worstMs)}`, 'p95/max', 'Time between frames over the last two seconds: the 95th percentile and the worst, in ms'),
        figure(stats.updateMs.toFixed(1), 'upd', 'Of which updating the world before the draw, in ms'),
        figure(stats.drawMs.toFixed(1), 'draw', 'Of which drawing it, both passes, in ms'),
        figure(shortCount(stats.triangles), 'tris', 'Triangles drawn in a frame, both passes'),
        figure(String(stats.calls), 'calls', 'Draw calls in a frame, both passes'),
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
      const key = keyOf(countryId, place);
      if (key !== placeCandidate) {
        placeCandidate = key;
        placeHeldFor = 0;
      } else {
        placeHeldFor += dt;
      }
      const settle = flying ? SETTLE_FLIGHT : SETTLE_PLACE;
      if (key !== placeSettled && (jumped || placeHeldFor >= settle)) {
        placeSettled = key;
        settledPlace = key === '' ? null : place;
        redraw = true;
      } else if (key === placeSettled && key !== '') {
        // Still the same place, a step nearer: see `settledPlace`.
        settledPlace = place;
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
