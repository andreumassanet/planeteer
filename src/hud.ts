/**
 * Everything drawn over the world while you play: where you are, which keys
 * do what, and the way into the settings and the map.
 *
 * **The place badge is the heart of it and its rule is unchanged**: a
 * border is exactly where the answer is least stable — walk the Spain/Portugal
 * line and `countryAtPoint` flips every few metres. So the debounce is on the
 * *data*, not on the animation: a country has to hold for a full second before
 * it counts as where you are, and the sea for three, because stepping into the
 * water is not an arrival. A settled country is still an arrival
 * (`onArrival`, which the passport stamps from); it is no longer a card and a
 * jingle, which every frontier walked along repeated until they were noise.
 *
 * Around them, the pieces that used to be loose markup in `index.html` and are
 * now built here, so the HUD is one element and one stylesheet:
 *
 * - **The bar, top left**: the gear, the map and the passport, each with the
 *   key it answers to on its corner; **the clock**, a chip of its own with the
 *   weather's icon; and **the place badge** last, the one piece whose width
 *   changes, so nothing moves when it does. The badge is the flag and two
 *   lines: the place you are in or near, large, and under it, small, the
 *   country and how far the town is, with an arrow. The clock and the place
 *   shared one card until 2026-10-01, with the second line folding away a
 *   few seconds after it changed; the clock is not about where you are, and
 *   a line that comes and goes is a thing that moves.
 * - **No keys along the bottom.** A strip of every key for the way you were
 *   travelling stood there until 2026-09-25, and a game does not keep its
 *   controls on the screen: they are the settings' controls page now, where
 *   they can be changed. What is left is a key where it answers a question —
 *   the prompt, `E  Drive`, while a vehicle is in reach; and, for a moment as
 *   you take one, the three or four keys it is driven by (`boardingHints`),
 *   put away after a few seconds or once you have used one. The climb and
 *   the descent in the air are said until they have been used once, and
 *   never again on that device. `H` hides the whole overlay.
 * - **The pause card**: pointer lock is lost on every `Esc` and every alt-tab,
 *   and what the player sees then is the one moment the cursor is free — so the
 *   card says how to get back in, offers the buttons worth offering with their
 *   keys on them.
 * - **A toast** under the bar for the keys that change a setting and for
 *   anything the world refused, and **a frame counter** for the settings
 *   panel's performance switch.
 * - **The welcome card**, once per device: what there is to do here, in five
 *   keys, the first time anybody lands.
 *
 * It also carries the marker's furniture — the panel under the minimap and
 * the waypoint that tracks the player's marker across the screen — which is
 * presentation only: `navigation.ts` decides where the marker is. **Under the
 * minimap is one column** (`.atlas-side`) and everything that turns up on the
 * right comes into it, in one width and from one side: the marker's panel,
 * and a landmark's card when you walk up to one. They were two cards in two
 * places, one under the disc and one halfway down the screen, and what
 * appeared there looked like things piling up rather than a place for them.
 */
import type { World } from './geo.ts';
import type { PlanetSurface } from './planet.ts';
import type { Nearby } from './places.ts';
import { OCEAN_COLOR, PALETTE } from './theme.ts';
import { createFlagCanvas } from './flags.ts';
import { MOVE, actionOf, boardingHints, capOf, holdFocus, inputBlocked, labelOf, onKeyLabels, registerModal, registerTabCard } from './controls.ts';
import type { Action, HintSet, KeyHint, TravelMode } from './controls.ts';
import { ensureStyle, h, hex, icon, installUi, kbd } from './ui.ts';
import type { IconName } from './ui.ts';

/** The marker panel's line. `navigation.ts` fills it in. */
export interface DestinationEntry {
  name: string;
  /** The country under the marker, or null at sea. */
  iso: string | null;
  /** Great-circle distance in real Earth kilometres; NaN until it is measured. */
  km: number;
}

export interface HudOptions {
  /** The gear on the bar. */
  onSettings?(): void;
  /** The map button on the bar. */
  onMap?(): void;
  /** The passport, on the bar (`passport-card.ts`). */
  onPassport?(): void;
  /** A new country has settled under you: the arrival, once per country, and silent. */
  onArrival?(countryId: number): void;
  /**
   * The welcome card's button, from inside its click: the one moment the
   * caller may ask the browser for the mouse without a second click.
   */
  onStart?(): void;
  /**
   * What the weather is where you stand, as its kind — `rain`, `snow`,
   * `storm`, `fog`, `cloudy`, `drizzle`, `clear` — or null where the world
   * has no weather. Asked about once a second, for the clock's icon.
   */
  weather?(): string | null;
  /**
   * The body the HUD stands on; Earth when omitted. Where it has no sea the
   * ground that belongs to nobody is named by its `emptyLabel`, never water.
   */
  surface?: PlanetSurface;
  /**
   * A way off this body, on the bar beside the map: back to the solar system.
   */
  leave?: { label: string; run(): void };
  /**
   * The keys shown on taking a vehicle, where a world's craft are not
   * Earth's: a rover has no horn. `undefined` is
   * Earth's own (`boardingHints`).
   */
  hints?(mode: TravelMode, airborne: boolean): HintSet | null | undefined;
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
  setDestination(entry: DestinationEntry | null): void;
  /** `km` null is *Here*: near enough that a distance would mislead (`HERE_RANGE` in `navigation.ts`). */
  trackDestination(km: number | null, x: number | null, y: number, angle: number): void;
  arriveAt(name: string, iso: string | null): void;
  /** You walked up to a landmark: a quiet card that says what it is. */
  showLandmark(landmark: LandmarkArrival): void;
  /**
   * How you are travelling — and whether a plane or a balloon is off the
   * ground, whether the eye is in the head, and whether a passenger aloft has
   * nobody at the controls. A change shows the keys the new way is driven by,
   * for a moment (`boardingHints`). Cheap to call every frame.
   */
  setMode(mode: TravelMode, airborne?: boolean, firstPerson?: boolean, stranded?: boolean): void;
  /** What `E` would do here — `Drive`, `Get in` — or null for nothing in reach. Cheap to call every frame. */
  setPrompt(label: string | null, iconName?: IconName): void;
  /** A set of keys for a moment that is not a way of travelling — a rocket on its pad — or null to put it away. */
  showKeys(set: HintSet | null): void;
  /** Whether the keys are shown on boarding at all: the settings switch. */
  readonly hints: boolean;
  setHints(on: boolean): boolean;
  /** Whether the whole overlay is put away (`H`): the bar, the minimap, the cards. */
  readonly hidden: boolean;
  setHidden(hidden: boolean): boolean;
  /** `H`: hides everything on the screen or brings it back. Returns whether it is now hidden. */
  toggleHidden(): boolean;
  /** The clock the place badge is showing, `HH:MM`, local to where you stand. */
  readonly clock: string;
  /** A short line under the bar, for a setting a key just changed. */
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
  welcome(): Promise<void>;
  /** Whether the welcome card is up. */
  readonly welcoming: boolean;
  /** The frame counter: on or off, and the numbers for it. */
  setPerformance(on: boolean): void;
  showPerformance(stats: FrameStats): void;
  /** Takes it off the page and lets go of every key, label and card it registered. */
  dispose(): void;
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
/** And the landmark card, which is a rarer event and carries more to read. */
const FOUND_HOLD = 8;
/**
 * Longer again when it carries a sentence: the notes run to about 140
 * characters, five or six seconds of reading on their own.
 */
const NOTE_HOLD = 4;
/** The badge's little jolt when the place under it changes. */
const BUMP = 0.22;
/** And "Arrived" holds before the destination panel puts itself away. */
const ARRIVED_HOLD = 4.5;
/** How long a toast stays. */
const TOAST_HOLD = 1.8;
/**
 * How long a new vehicle's keys stay, counted while the game has the mouse:
 * long enough to read three keys twice.
 */
const HINT_HOLD = 6;
/** And once one of them has been pressed: the player has found them. */
const HINT_USED_HOLD = 1.2;
/** Which `once` hint sets have been used on this device. */
const HINTED_KEY = 'atlas.hinted.v1';
/** How often the weather is asked for the clock's icon, in seconds. */
const WEATHER_EVERY = 1;

const R2D = 180 / Math.PI;

/** How far the badge's arrow has to turn before it is rewritten: under a pixel of arrowhead. */
const ARROW_STEP = 4 / R2D;
/** How near the screen's edge a waypoint label may come, in CSS pixels. */
const LABEL_MARGIN = 12;

/**
 * Village, town or city, off the one size law: `radiusFor` runs [12, 150] and
 * the cuts at 13 and 30 units are about 10,000 and 100,000 people.
 */
const sizeWord = (radius: number): string => (radius < 13 ? 'village' : radius < 30 ? 'town' : 'city');

/** The badge a vehicle's keys are shown beside. */
const MODE_ICON: Record<TravelMode, IconName> = {
  foot: 'walk',
  swim: 'swim',
  car: 'car',
  boat: 'boat',
  plane: 'plane',
  balloon: 'balloon',
  bicycle: 'bike',
  motorbike: 'moto',
  horse: 'horse',
  jetski: 'jetski',
  sailboat: 'boat',
  helicopter: 'heli',
  submarine: 'sub',
  passenger: 'seat',
};

/** The clock's icon for a kind of weather; clear skies are the sun or the moon. */
const WEATHER_ICON: Record<string, IconName> = {
  cloudy: 'cloud',
  fog: 'fog',
  drizzle: 'rain',
  rain: 'rain',
  storm: 'storm',
  snow: 'snow',
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

/* --- the bar, top left: two buttons and where you are ----------------------- */
/*
 * Never wider than the gap it has: the minimap stands 24 px in from the right
 * and is 200 across, so "Democratic Republic of the Congo" gives way with an
 * ellipsis before it runs under the disc. The flag and the clock never do.
 */
.atlas-hud-bar {
  position: absolute;
  top: 24px;
  left: 24px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: calc(100vw - 290px);
}
.atlas-hud-bar > .ui-btn { position: relative; flex: none; }
/* The key a button answers to, on its corner, where a controller game puts it. */
.atlas-hud-bar .atlas-hud-cap {
  position: absolute;
  right: -8px;
  bottom: -9px;
  height: 18px;
  min-width: 18px;
  padding: 0 4px;
  font-size: 10px;
  box-shadow: 0 2px 0 var(--ui-ink);
}
.atlas-place {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 44px;
  box-sizing: border-box;
  padding: 5px 14px 5px 9px;
  opacity: 0;
  transform-origin: 0 50%;
  transition: opacity 0.35s ease, transform 0.3s var(--ui-spring);
}
.atlas-place.on { opacity: 1; }
.atlas-place.bump { transform: scale(1.03); }
.atlas-place > * { flex: none; }
.atlas-place-text { flex: 0 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.atlas-place-name {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Tabular figures: the distance is rewritten every step. */
.atlas-place-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 15px;
  color: var(--ui-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.atlas-place-sub[hidden], .atlas-place-sub > [hidden] { display: none; }
.atlas-place-sub > span:first-child { overflow: hidden; text-overflow: ellipsis; }
/* The glyph points up the screen at rest, so the transform *is* the bearing. */
.atlas-place-arrow { display: inline-block; font-size: 12px; line-height: 1; color: var(--ui-ink); transition: transform 0.12s ease; }

/* The clock: the hour where you stand and the sky over it, a chip of its own. */
.atlas-clock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 44px;
  box-sizing: border-box;
  padding: 0 13px 0 11px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  opacity: 0;
  transition: opacity 0.35s ease;
}
.atlas-clock.on { opacity: 1; }
.atlas-clock svg { width: 17px; height: 17px; }

/* --- the column under the minimap: the marker, a landmark ------------------ */
/*
 * One width, one side, one way in. A card that is not up takes no room, so
 * the landmark's card sits right under the disc when there is no marker; a
 * browser without discrete transitions shows and hides them without the slide.
 */
.atlas-side {
  position: absolute;
  top: 222px;
  right: 24px;
  width: 248px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.atlas-side > .ui-card {
  box-sizing: border-box;
  opacity: 0;
  transform: translateX(16px);
  /* The second only where it is understood; elsewhere the first stands. */
  transition: opacity 0.3s ease, transform 0.4s var(--ui-ease), background 0.3s ease;
  transition: opacity 0.3s ease, transform 0.4s var(--ui-ease), background 0.3s ease, display 0.4s allow-discrete;
}
.atlas-side > .ui-card:not(.on):not(.in) { display: none; }
.atlas-side > .ui-card.on, .atlas-side > .ui-card.in { opacity: 1; transform: none; }
@starting-style {
  .atlas-side > .ui-card.on, .atlas-side > .ui-card.in { opacity: 0; transform: translateX(16px); }
}
.atlas-card-eyebrow {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.5;
}
.atlas-found-name {
  margin-top: 1px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.12;
}
.atlas-found-fact {
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  opacity: 0.68;
}
/* The landmark card: the flag, then what it is, in the column's width. */
.atlas-found {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px 11px;
}
.atlas-found > :last-child { order: -1; flex: none; margin-top: 2px; }
.atlas-found-text { min-width: 0; }
.atlas-found-note {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  opacity: 0.8;
  text-wrap: pretty;
}
.atlas-found-note:empty { display: none; }

/* --- the destination, under the minimap -------------------------------------- */
.atlas-destination { padding: 9px 12px 10px; }
.atlas-destination.arrived { background: var(--ui-gold); }
.atlas-destination-head { display: flex; align-items: center; gap: 10px; }
.atlas-destination-name { font-size: 15px; font-weight: 800; letter-spacing: -0.012em; line-height: 1.15; }
.atlas-destination-sub { margin-top: 2px; font-size: 11.5px; font-weight: 600; opacity: 0.62; }
.atlas-destination-pin {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border: 2px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-violet);
  color: var(--ui-paper);
}
.atlas-destination-pin svg { width: 17px; height: 17px; }

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

/* --- a vehicle's keys, for a moment, along the bottom ------------------------- */
/*
 * Centred by its margins and not by a translate, because it has to be able to
 * wrap: a box placed at left: 50% is offered only half the screen, so a strip
 * allowed to wrap there broke in two at 800 px on a 1,600-pixel window.
 */
.atlas-hints {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 24px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 14px;
  width: max-content;
  max-width: calc(100vw - 48px);
  box-sizing: border-box;
  padding: 6px 14px 6px 7px;
  font-size: 12.5px;
  font-weight: 700;
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.3s ease, transform 0.35s var(--ui-ease);
}
.atlas-hints.on { opacity: 1; transform: none; }
.atlas-hints > span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.atlas-hints > span > span { display: inline-flex; gap: 3px; }
.atlas-hints-badge {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-gold);
}
.atlas-hints-badge svg { width: 16px; height: 16px; }

/* --- a toast, under the bar ---------------------------------------------------- */
.atlas-toast {
  position: absolute;
  left: 50%;
  top: 86px;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(520px, calc(100vw - 48px));
  padding: 9px 16px 9px 11px;
  font-size: 15px;
  font-weight: 800;
  opacity: 0;
  transform: translate(-50%, -10px);
  transition: opacity 0.2s ease, transform 0.3s var(--ui-spring);
}
.atlas-toast.on { opacity: 1; transform: translate(-50%, 0); }
.atlas-toast svg { width: 19px; height: 19px; flex: none; }

/* --- the prompt: what E does here ------------------------------------------------- */
/* Over the keys' row, so the two never share a line when both are up. */
.atlas-prompt {
  position: absolute;
  left: 50%;
  bottom: 88px;
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

/* --- everything away: H ------------------------------------------------------- */
/*
 * The overlay and the pieces other files own that are part of it — the
 * minimap, the chat's standing lines, a conversation's bubble, a stamp
 * coming down and the country names over the land — go; the pause card, the
 * welcome and a toast saying how to get it all back stay, since they are how
 * you do.
 */
.atlas-hud.hidden > :not(.atlas-pause):not(.atlas-welcome):not(.atlas-toast),
body.atlas-hud-hidden #minimap,
body.atlas-hud-hidden .atlas-bubble,
body.atlas-hud-hidden .atlas-stamp-drop,
body.atlas-hud-hidden .atlas-names,
body.atlas-hud-hidden .atlas-chat:not(.open) {
  opacity: 0 !important;
  visibility: hidden;
  transition: opacity 0.25s ease, visibility 0s 0.25s;
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
 * card comes and goes where it stands, by its opacity alone. The badge's
 * arrow turns without easing, and the badge does not jolt.
 */
@media (prefers-reduced-motion: reduce) {
  .atlas-side > .ui-card, .atlas-side > .ui-card.on, .atlas-side > .ui-card.in { transform: none; transition: opacity 0.2s ease; }
  .atlas-toast, .atlas-toast.on { transform: translate(-50%, 0); transition: opacity 0.2s ease; }
  .atlas-hints, .atlas-hints.on { transform: none; transition: opacity 0.2s ease; }
  .atlas-prompt, .atlas-prompt.on { transform: translate(-50%, 0); }
  .atlas-pause, .atlas-pause.on { transform: translate(-50%, -50%); }
  .atlas-place, .atlas-place.bump { transform: none; transition: opacity 0.2s ease; }
  .atlas-welcome.on .atlas-welcome-card { animation: none; }
  .atlas-place-arrow { transition: none; }
}
`;

const km = (value: number): string => `${Math.round(value).toLocaleString('en')} km`;

/** The badge's stand-in for a flag when you are at sea. */
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
  /** Every listener this HUD adds goes with it on `dispose`. */
  const events = new AbortController();
  const { signal } = events;
  const unregister: (() => void)[] = [];
  /** What the ground that belongs to nobody is called: the sea on Earth. */
  const emptyLabel = options.surface?.emptyLabel ?? 'Open water';

  const root = h('div', { class: 'atlas-hud' });

  /* --- the bar ---------------------------------------------------------- */

  const settingsCap = kbd('');
  const mapCap = kbd('');
  const passportCap = kbd('');
  settingsCap.classList.add('atlas-hud-cap');
  mapCap.classList.add('atlas-hud-cap');
  passportCap.classList.add('atlas-hud-cap');
  const settingsButton = h('button', { class: 'ui-btn icon', type: 'button' }, icon('gear'), settingsCap);
  const mapButton = h('button', { class: 'ui-btn icon', type: 'button' }, icon('map'), mapCap);
  const passportButton = h('button', { class: 'ui-btn icon', type: 'button' }, icon('passport'), passportCap);
  settingsButton.addEventListener('click', () => options.onSettings?.(), { signal });
  mapButton.addEventListener('click', () => options.onMap?.(), { signal });
  passportButton.addEventListener('click', () => options.onPassport?.(), { signal });
  // Off this world and out to the planets: the menu's solar system.
  const leaveButton =
    options.leave === undefined
      ? null
      : h('button', { class: 'ui-btn icon', type: 'button', title: options.leave.label, 'aria-label': options.leave.label }, icon('orbit'));
  leaveButton?.addEventListener('click', () => options.leave?.run(), { signal });

  /* --- the place badge --------------------------------------------------- */

  const placeFlag = h('span');
  // Two claims: the smallest true thing about where you are, large, and the
  // context under it, small: the country, and how far the town is and which way.
  const placeName = h('span', { class: 'atlas-place-name' });
  const placeCountry = h('span');
  const placeSep = h('span', { text: '·' });
  // How far: its own clock, rewritten as you walk.
  const placeRangeText = h('span');
  const placeArrow = h('span', { class: 'atlas-place-arrow', text: '↑', 'aria-hidden': 'true' });
  placeArrow.hidden = true;
  const placeSub = h('span', { class: 'atlas-place-sub' }, placeCountry, placeSep, placeRangeText, placeArrow);
  placeSub.hidden = true;
  const place = h(
    'div',
    { class: 'atlas-place ui-card' },
    placeFlag,
    h('span', { class: 'atlas-place-text' }, placeName, placeSub),
  );
  // The clock is not debounced: it has no boundary to flap across.
  const clockIcon = h('span');
  const clockText = h('span');
  const clock = h('div', { class: 'atlas-clock ui-card' }, clockIcon, clockText);
  const bar = h(
    'div',
    { class: 'atlas-hud-bar' },
    settingsButton,
    mapButton,
    options.onPassport === undefined ? null : passportButton,
    leaveButton,
    clock,
    place,
  );

  /* --- the landmark card ------------------------------------------------ */

  const foundEyebrow = h('div', { class: 'atlas-card-eyebrow' });
  const foundName = h('div', { class: 'atlas-found-name' });
  const foundFact = h('div', { class: 'atlas-found-fact' });
  const foundFlag = h('span');
  const foundNote = h('div', { class: 'atlas-found-note' });
  const found = h(
    'div',
    { class: 'atlas-found ui-card' },
    h('div', { class: 'atlas-found-text' }, foundEyebrow, foundName, foundFact, foundNote),
    foundFlag,
  );

  /* --- the destination -------------------------------------------------- */

  const destinationFlag = h('span');
  const destinationName = h('div', { class: 'atlas-destination-name' });
  // Two spans and a fixed separator, because only the right-hand one changes.
  const destinationPlace = h('span');
  const destinationRange = h('span');
  const destinationSub = h('div', { class: 'atlas-destination-sub' }, destinationPlace, ' · ', destinationRange);
  const destination = h(
    'div',
    { class: 'atlas-destination ui-card' },
    h('div', { class: 'atlas-destination-head' }, destinationFlag, h('div', {}, destinationName, destinationSub)),
  );
  /** The country's flag beside the marker's name, or a pin where it is at sea. */
  const markFlag = (iso: string | null): void => {
    destinationFlag.replaceChildren(iso === null ? h('span', { class: 'atlas-destination-pin' }, icon('pin')) : createFlagCanvas(iso, 30, 20));
  };

  const waypointPin = h('div', { class: 'atlas-waypoint-pin' });
  const waypointLabel = h('div', { class: 'atlas-waypoint-label ui-card' });
  const waypoint = h('div', { class: 'atlas-waypoint' }, waypointPin, waypointLabel);

  /* --- the keys of the moment, the toast, the pause card, the frames ---- */

  const hintsCard = h('div', { class: 'atlas-hints ui-card', role: 'status' });

  const toastIcon = h('span');
  const toastText = h('span');
  const toast = h('div', { class: 'atlas-toast ui-card', role: 'status' }, toastIcon, toastText);
  const promptKey = h('span');
  const promptIcon = h('span');
  const promptText = h('span');
  const prompt = h('div', { class: 'atlas-prompt ui-card', role: 'status' }, promptKey, promptIcon, promptText);
  let promptShown: string | null = null;

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

  root.append(bar, h('div', { class: 'atlas-side' }, destination, found), waypoint, hintsCard, toast, prompt, pause, perf, welcomeRoot);

  // The placements carry an ISO code and the panel wants a country.
  const countryNames = new Map(world.countries.map((country) => [country.iso, country.name]));

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
  /** What the badge's place clause says: in it, near it, off its coast, or nothing. */
  let placeMode: 'in' | 'near' | 'off' | null = null;
  /** The last country announced as an arrival. The ocean is never one. */
  let announced = -1;
  let candidate = -1;
  let heldFor = 0;
  let bumpFor = 0;
  let arrivedFor = 0;
  let foundFor = 0;
  let toastFor = 0;
  /** Set by `jump`, cleared by the next `update`: settle whatever arrives. */
  let jumped = false;
  let shownKm = NaN;
  let shownClock = '';
  let shownClockIcon = '';
  let shownRange = '';
  /** The country beside the range has changed, so the separator between them may have. */
  let rangeStale = false;
  let weatherKind: string | null = null;
  let weatherFor = 0;
  /**
   * The angle the badge's arrow is drawn at, in radians, **unwrapped**. The
   * bearing comes in folded into (-pi, pi], and the arrow has a CSS transition:
   * written as it came, a town dead behind you and a step to either side took
   * the arrow from +179 degrees to -179 by the long way round, a whole turn in
   * an eighth of a second. The arrow moves by the short way from wherever it
   * is, so the number it is drawn at is allowed to leave the fold.
   */
  let arrowAngle = 0;
  /** The waypoint label's width, measured when its text changes, and how far it is slid. */
  let labelWidth = -1;
  let labelShift = 0;

  let mode: TravelMode | null = null;
  /** A plane or a balloon off the ground: the badge names only what it is over. */
  let flying = false;
  let firstPerson = false;
  let stranded = false;
  let hintsOn = true;
  let hidden = false;
  /** The keys on show, and for how much longer; a sticky set has no clock. */
  let hintSet: HintSet | null = null;
  let hintFor = 0;
  let paused: boolean | null = null;
  let dragLook = false;
  let welcoming = false;
  let finishWelcome: (() => void) | null = null;

  unregister.push(registerModal(() => welcoming));

  /**
   * The `once` hint sets used on this device. Every read and write wrapped: a
   * private window throws on the getter, and a hint that shows again is the
   * worst that can happen.
   */
  const hinted = new Set<string>();
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(HINTED_KEY) ?? '[]');
    if (Array.isArray(stored)) for (const id of stored) if (typeof id === 'string') hinted.add(id);
  } catch {
    // Nothing remembered: every first-time hint is first-time again.
  }
  function markHinted(id: string): void {
    if (hinted.has(id)) return;
    hinted.add(id);
    try {
      localStorage.setItem(HINTED_KEY, JSON.stringify([...hinted]));
    } catch {
      // Remembered for this visit only.
    }
  }

  /**
   * Which place the badge is naming, as a string that changes exactly when the
   * badge's sentence would: the place and how it is related to you.
   *
   * - **From the plane, only the town you are over.** The nearest town changes
   *   every few tenths of a second at cruise, so the place debounce never
   *   settled and the badge went on naming the town you took off from,
   *   hundreds of kilometres behind. Over a square is a fact about now; the
   *   country is the rest of the time.
   * - **At sea, the town whose coast you are off**, inside `OFFSHORE_KM`.
   * - **On land, the town whose name reaches here**: `near`, or `inside` it.
   */
  /** A body with no water a traveller can be on (`PlanetSurface.sea`). */
  const dryBody = options.surface?.sea === false;
  function keyOf(countryId: number, near: Nearby | null): string {
    if (near === null) return '';
    if (flying) return near.inside ? `${near.index}!` : '';
    // Country 0 is the water only where the body has any: on a world without
    // a sea it is ground nobody claims, and walked like any land — it read
    // *Off Tharsis Station* on dry Martian dust.
    if (countryId === 0 && !dryBody) return near.km <= OFFSHORE_KM ? `${near.index}@` : '';
    return near.near ? `${near.index}${near.inside ? '!' : '~'}` : '';
  }

  const kmText = (value: number): string => `${value < 10 ? value.toFixed(1) : Math.round(value)} km`;

  /** Writes the badge from whatever has settled: on a change, never per frame. */
  function renderPlace(): void {
    // Nothing until the ground has said what it is. The place settles in 0.8 s
    // and the country in 1.0, so on arrival the town came first and, with no
    // country yet, read as the sea: *Off Bourges* over Bourges' own square.
    if (settled < 0) return;
    const country = settled > 0 ? world.countries[settled - 1]! : null;
    const relation = placeSettled.slice(-1);
    if (country !== null || dryBody) placeMode = relation === '!' ? 'in' : relation === '~' ? 'near' : null;
    // At sea the badge says the sea — the ocean is not somewhere you arrived —
    // unless a town's quay is in sight: *Off Palma* from the bay. "Water" and
    // not "sea", because a lake is country 0 as well and Baikal is not a sea.
    // And only a place that was settled *at sea* (`@`): walking ashore, the
    // town can settle a moment before the country does.
    else placeMode = relation === '@' && settledPlace !== null && settledPlace.km <= OFFSHORE_KM && !flying ? 'off' : null;
    const near = placeMode === null ? null : settledPlace;
    placeName.textContent =
      near === null
        ? country ? country.name : emptyLabel
        : placeMode === 'in' ? near.place.name : placeMode === 'near' ? `Near ${near.place.name}` : `Off ${near.place.name}`;
    // The country you are standing in, which is not always the town's: at
    // 49.75, 6.35 the nearest built place is Trier and the ground is Luxembourg.
    placeCountry.textContent = near !== null && country !== null ? country.name : '';
    // The town's size, which the badge no longer spells out, for whoever asks.
    place.title = [placeName.textContent, near === null ? '' : sizeWord(near.radius), placeCountry.textContent].filter((part) => part !== '').join(' · ');
    // Ground that belongs to nobody on a body with no sea has no plate at all.
    placeFlag.replaceChildren(...(country ? [createFlagCanvas(country.iso, 26, 17)] : options.surface?.sea === false ? [] : [oceanPlate(26, 17)]));
    // Rewritten by the next `renderRange`, which is in the same frame.
    rangeStale = true;
    place.classList.add('on', 'bump');
    bumpFor = BUMP;
  }

  /** How far the town is, rewritten on its own clock; inside it, nothing. */
  function renderRange(bearing: number | null): void {
    const near = placeMode === null ? null : settledPlace;
    const text = near !== null && placeMode !== 'in' ? kmText(near.km) : '';
    if (text !== shownRange || rangeStale) {
      rangeStale = false;
      shownRange = text;
      placeRangeText.textContent = text;
      placeRangeText.hidden = text === '';
      placeSep.hidden = text === '' || placeCountry.textContent === '';
      placeCountry.hidden = placeCountry.textContent === '';
      placeSub.hidden = text === '' && placeCountry.textContent === '';
    }
    const arrow = near !== null && placeMode !== 'in' && bearing !== null;
    placeArrow.hidden = !arrow;
    if (!arrow) return;
    const turn = Math.atan2(Math.sin(bearing - arrowAngle), Math.cos(bearing - arrowAngle));
    if (Math.abs(turn) < ARROW_STEP) return;
    arrowAngle += turn;
    placeArrow.style.transform = `rotate(${(arrowAngle * R2D).toFixed(0)}deg)`;
  }

  /**
   * A country settled: the arrival, told to whoever listens, and nothing
   * drawn. The badge is `renderPlace`, once, at the end.
   */
  function announce(id: number): void {
    settled = id;
    const country = id > 0 ? world.countries[id - 1]! : null;
    if (!country || id === announced) return;
    announced = id;
    options.onArrival?.(id);
  }

  /** The keys of the moment, drawn from the live bindings. */
  function renderHints(): void {
    if (hintSet === null || mode === null) return;
    hintsCard.replaceChildren(
      h('span', { class: 'atlas-hints-badge' }, icon(MODE_ICON[mode])),
      ...hintSet.hints.map((hint) => h('span', {}, h('span', {}, ...capsOf(hint)), hint.label)),
    );
  }

  /** A new set for a new way of travelling, or none. */
  function showHints(next: HintSet | null): void {
    const wanted = next !== null && hintsOn && !(next.once && hinted.has(next.id)) ? next : null;
    hintSet = wanted;
    hintFor = HINT_HOLD;
    if (wanted === null) {
      hintsCard.classList.remove('on');
      return;
    }
    renderHints();
    hintsCard.classList.add('on');
  }

  function renderPause(): void {
    pauseTitle.textContent = dragLook ? 'Drag to look around' : 'Click to look around';
    pauseText.textContent = dragLook
      ? 'This page cannot lock the mouse, so hold a button and move it to turn the camera.'
      : `The mouse turns the camera. ${labelOf('release')} gives the cursor back.`;
  }

  function renderWelcome(): void {
    welcomeTitle.textContent = 'The whole planet, to walk';
    welcomeSub.textContent = 'Every country is real. Come down in one and your passport is stamped.';
    const row = (caps: HTMLElement[], text: string): HTMLElement =>
      h('div', { class: 'atlas-welcome-row' }, h('span', {}, ...caps), h('span', { text }));
    welcomeList.replaceChildren(
      row([kbd(labelOf('map'))], 'The whole planet on one map: click anywhere to put a marker there'),
      row([kbd(labelOf('passport'))], 'Your passport, a stamp for every country'),
      row([kbd(labelOf('use'))], 'Walk up to a car, a boat or a plane and take it'),
      row(capsOf({ keys: MOVE, label: '' }), 'Walk into the sea and you swim'),
      row([kbd(labelOf('settings'))], 'Settings, and every key, which you can change'),
    );
  }

  /** Every label that names a key, rewritten when the layout or a binding changes. */
  function relabel(): void {
    const settingsKey = labelOf('settings');
    const mapKey = labelOf('map');
    settingsCap.textContent = settingsKey;
    mapCap.textContent = mapKey;
    settingsButton.title = `Settings (${settingsKey})`;
    settingsButton.setAttribute('aria-label', 'Settings');
    settingsButton.setAttribute('aria-keyshortcuts', settingsKey);
    mapButton.title = `World map (${mapKey})`;
    mapButton.setAttribute('aria-label', 'World map');
    mapButton.setAttribute('aria-keyshortcuts', mapKey);
    const passportKey = labelOf('passport');
    passportCap.textContent = passportKey;
    passportButton.title = `Passport (${passportKey})`;
    passportButton.setAttribute('aria-label', 'Passport');
    passportButton.setAttribute('aria-keyshortcuts', passportKey);
    if (promptShown !== null) promptKey.replaceChildren(kbd(labelOf('use')));
    renderPause();
    renderHints();
    if (welcoming) renderWelcome();
  }
  relabel();
  unregister.push(onKeyLabels(relabel));

  // A key of the moment pressed is a key found: the set goes shortly after,
  // and one said `once` is not said again on this device.
  addEventListener('keydown', (event) => {
    if (hintSet === null || hintSet.sticky || event.repeat || inputBlocked(event)) return;
    const action = actionOf(event.code);
    if (action === undefined || !hintSet.hints.some((hint) => hint.keys.includes(action as Action))) return;
    if (hintSet.once) markHinted(hintSet.id);
    hintFor = Math.min(hintFor, HINT_USED_HOLD);
  }, { signal });

  function applyHidden(): void {
    root.classList.toggle('hidden', hidden);
    document.body.classList.toggle('atlas-hud-hidden', hidden);
  }

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
  }, { signal });
  // The pause card takes `Tab` from the player list while it is up: its buttons
  // are the only things on the screen a key can press.
  // Only while it has any: a card with nothing to focus that took the key
  // swallowed it whole — the bar's buttons out of a keyboard's reach and the
  // player list dead while the mouse was free.
  const pauseUp = (): boolean => paused === true && !welcoming && pause.querySelector('button, input, select, a[href], [tabindex]') !== null;
  unregister.push(registerTabCard(pauseUp));
  addEventListener('keydown', (event) => {
    if (pauseUp()) holdFocus(event, pause);
  }, { signal });
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
  }, { signal });

  return {
    root,
    jump() {
      jumped = true;
      // The card belongs to the place you left: a landmark in Paris is not
      // news in Tokyo.
      foundFor = 0;
      found.classList.remove('in');
    },
    setDestination(entry) {
      arrivedFor = 0;
      destination.classList.remove('arrived');
      if (entry === null) {
        destination.classList.remove('on');
        waypoint.classList.remove('on');
        shownKm = NaN;
        return;
      }
      destinationName.textContent = entry.name;
      destinationPlace.textContent = entry.iso === null ? emptyLabel : countryNames.get(entry.iso) ?? entry.iso;
      markFlag(entry.iso);
      if (waypointLabel.textContent !== entry.name) {
        waypointLabel.textContent = entry.name;
        labelWidth = -1;
      }
      destinationRange.textContent = Number.isFinite(entry.km) ? km(entry.km) : '…';
      shownKm = Number.isFinite(entry.km) ? Math.round(entry.km) : NaN;
      destination.classList.add('on');
    },
    trackDestination(distanceKm, x, y, angle) {
      // -1 is *Here*, which no rounded distance is.
      const rounded = distanceKm === null ? -1 : Math.round(distanceKm);
      if (rounded !== shownKm) {
        shownKm = rounded;
        destinationRange.textContent = distanceKm === null ? 'Here' : km(distanceKm);
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
    showLandmark(landmark) {
      foundEyebrow.textContent = 'Landmark';
      foundName.textContent = landmark.name;
      // Country first because it is the one fact every landmark has; a natural
      // feature has neither of the other two and the line is just the country.
      const lines = [landmark.country];
      if (landmark.height !== undefined && landmark.height > 0) lines.push(`${landmark.height.toLocaleString('en')} m`);
      if (landmark.year !== undefined) lines.push(yearText(landmark.year));
      foundFact.textContent = lines.join(' · ');
      foundNote.textContent = landmark.note ?? '';
      foundFlag.replaceChildren(createFlagCanvas(landmark.iso, 36, 24));
      found.classList.add('in');
      foundFor = FOUND_HOLD + (landmark.note ? NOTE_HOLD : 0);
    },
    arriveAt(name, iso) {
      destinationName.textContent = name;
      destinationPlace.textContent = 'Arrived';
      destinationRange.textContent = iso === null ? emptyLabel : countryNames.get(iso) ?? iso;
      markFlag(iso);
      destination.classList.add('on', 'arrived');
      waypoint.classList.remove('on');
      shownKm = NaN;
      arrivedFor = ARRIVED_HOLD;
    },
    setMode(next, nextAirborne = false, nextFirstPerson = false, nextStranded = false) {
      const view = (next === 'foot' || next === 'swim') && nextFirstPerson;
      const aloft = (next === 'plane' || next === 'balloon' || next === 'helicopter' || next === 'passenger') && nextAirborne;
      const alone = next === 'passenger' && aloft && nextStranded;
      if (next === mode && aloft === flying && view === firstPerson && alone === stranded) return;
      // A new way of travelling, a take-off or a landing, or being left alone
      // aloft, changes what the keys do; looking through your own eyes does not.
      const changed = next !== mode || aloft !== flying || alone !== stranded;
      mode = next;
      flying = aloft;
      firstPerson = view;
      stranded = alone;
      if (changed) {
        const own = options.hints?.(next, aloft);
        showHints(own !== undefined ? own : boardingHints(next, aloft, alone));
      }
    },
    showKeys(set) {
      showHints(set);
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
      if (!on) showHints(null);
      return hintsOn;
    },
    get hidden() {
      return hidden;
    },
    setHidden(next) {
      hidden = next;
      applyHidden();
      return hidden;
    },
    toggleHidden() {
      hidden = !hidden;
      applyHidden();
      return hidden;
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
    welcome() {
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
    update(countryId, nearby, clockNow, dt, bearing = null) {
      // The weather, for the clock's icon: asked about once a second, and
      // whatever it says is only ever an icon.
      weatherFor -= dt;
      if (weatherFor <= 0 && options.weather !== undefined) {
        weatherFor = WEATHER_EVERY;
        try {
          weatherKind = options.weather();
        } catch {
          weatherKind = null;
        }
      }
      if (clockNow !== shownClock) {
        shownClock = clockNow;
        clockText.textContent = clockNow;
        clock.classList.toggle('on', clockNow !== '');
      }
      // Day or night by the clock the badge already shows, not by the sun:
      // six to eight is what the clock means by day to someone reading it.
      const hour = Number(shownClock.slice(0, 2));
      const night = !(hour >= 6 && hour < 20);
      const clockIconName: IconName = (weatherKind !== null ? WEATHER_ICON[weatherKind] : undefined) ?? (night ? 'moon' : 'sun');
      if (clockIconName !== shownClockIcon) {
        shownClockIcon = clockIconName;
        clockIcon.replaceChildren(icon(clockIconName));
        clock.title = weatherKind === null || weatherKind === 'clear' ? 'Local time' : `Local time · ${weatherKind}`;
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
      // The badge is one sentence about both the country and the place, so it
      // is written once after both have had their say — drawing it inside
      // either branch is how the first version said "Paris · Japan".
      let redraw = false;
      if (candidate !== settled && (jumped || heldFor >= (candidate === 0 ? SETTLE_OCEAN : SETTLE_LAND))) {
        announce(candidate);
        redraw = true;
      }
      const key = keyOf(countryId, nearby);
      if (key !== placeCandidate) {
        placeCandidate = key;
        placeHeldFor = 0;
      } else {
        placeHeldFor += dt;
      }
      const settle = flying ? SETTLE_FLIGHT : SETTLE_PLACE;
      if (key !== placeSettled && (jumped || placeHeldFor >= settle)) {
        placeSettled = key;
        settledPlace = key === '' ? null : nearby;
        redraw = true;
      } else if (key === placeSettled && key !== '') {
        // Still the same place, a step nearer: see `settledPlace`.
        settledPlace = nearby;
      }
      jumped = false;
      if (redraw) renderPlace();
      // After the settle, always: the name waits for the debounce and the
      // distance to it does not.
      renderRange(bearing);

      if (bumpFor > 0) {
        bumpFor -= dt;
        if (bumpFor <= 0) place.classList.remove('bump');
      }
      if (foundFor > 0) {
        foundFor -= dt;
        if (foundFor <= 0) found.classList.remove('in');
      }
      if (toastFor > 0) {
        toastFor -= dt;
        if (toastFor <= 0) toast.classList.remove('on');
      }
      // The keys of the moment go only while the game has the mouse: a player
      // reading them with the cursor free is still reading them.
      if (hintSet !== null && !hintSet.sticky && paused === false) {
        hintFor -= dt;
        if (hintFor <= 0) {
          hintSet = null;
          hintsCard.classList.remove('on');
        }
      }
    },
    dispose() {
      events.abort();
      for (const off of unregister.splice(0)) off();
      finishWelcome?.();
      finishWelcome = null;
      welcoming = false;
      document.body.classList.remove('atlas-hud-hidden');
      root.remove();
    },
  };
}
