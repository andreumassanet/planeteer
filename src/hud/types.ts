/** The HUD's public types. */
import type { SpeedReading, SpeedUnit } from './speedometer.ts';
import type { HintSet, TravelMode } from '../controls.ts';
import type { Nearby } from '../places.ts';
import type { PlanetSurface } from '../planet.ts';
import type { TouchPad } from '../touch.ts';
import type { IconName } from '../ui.ts';

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
  /** The welcome card's button, called from inside its click: the one moment the caller may ask the browser for the mouse without a second click. */
  onStart?(): void;
  /** What the weather is where you stand (`rain`, `snow`, `storm`, `fog`, `cloudy`, `drizzle`, `clear`), or null where the world has none. Asked once a second, for the clock's icon. */
  weather?(): string | null;
  /** The body the HUD stands on; Earth when omitted. Where it has no sea, ground that belongs to nobody is named by its `emptyLabel`. */
  surface?: PlanetSurface;
  /** A way off this body, on the bar beside the map: back to the solar system. */
  leave?: { label: string; run(): void };
  /** The keys shown on taking a vehicle where a world's craft are not Earth's (a rover has no horn); `undefined` is Earth's own (`boardingHints`). */
  hints?(mode: TravelMode, airborne: boolean): HintSet | null | undefined;
  /** The touch controls (`touch.ts`), told the travel mode and what `use` does, and put away with the HUD. */
  touch?: TouchPad;
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
  /** Publish the next reading without waiting for it to settle: a teleport is not flapping. */
  jump(): void;
  setDestination(entry: DestinationEntry | null): void;
  /** `km` null is *Here*: near enough that a distance would mislead (`HERE_RANGE` in `navigation.ts`). */
  trackDestination(km: number | null, x: number | null, y: number, angle: number): void;
  arriveAt(name: string, iso: string | null): void;
  /** You walked up to a landmark: a quiet card that says what it is. */
  showLandmark(landmark: LandmarkArrival): void;
  /**
   * How you are travelling, and whether a plane or balloon is off the ground, the
   * eye is in the head, or a passenger aloft has nobody at the controls. A change
   * shows the keys the new way is driven by for a moment (`boardingHints`).
   * Cheap to call every frame.
   */
  setMode(mode: TravelMode, airborne?: boolean, firstPerson?: boolean, stranded?: boolean): void;
  /** What `E` would do here — `Drive`, `Get in` — or null for nothing in reach. Cheap to call every frame. */
  setPrompt(label: string | null, iconName?: IconName): void;
  /**
   * Where the prompt stands this frame: over the thing it is about, at a
   * screen point (CSS pixels, the tag's tip) and an opacity, or with `x` null
   * back in its place over the bottom of the screen. Cheap to call every frame.
   */
  placePrompt(x: number | null, y: number, fade: number): void;
  /** The speedometer: a reading while in a vehicle, null to put it away; the unit from the settings. */
  setSpeed(reading: SpeedReading | null, unit: SpeedUnit, dt: number): void;
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
  /** The mouse is free and nothing else holds the screen. `drag` is where the lock is refused and a held button looks instead. Cheap to call every frame. */
  setPaused(paused: boolean, drag?: boolean): void;
  /** The first-run card. Resolves when it is put away; the caller decides whether it has been seen. */
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
  /** Country name, resolved by the caller. */
  country: string;
  /** Metres, as the source file records it. Absent for a natural feature. */
  height?: number;
  /** Year completed, negative before Christ; absent for anything older than a date. */
  year?: number;
  /** A sentence about it, when the source has one. */
  note?: string;
}
