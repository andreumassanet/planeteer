/** The settings card's public types: the getters and setters it is handed. */

export interface Knob {
  get(): number;
  set(value: number): number;
  min: number;
  max: number;
}

export interface Toggle {
  get(): boolean;
  set(on: boolean): boolean;
}

/** One of a few named values: a segmented control. */
export interface Choice {
  get(): string;
  set(value: string): string;
  /** The values in order, each with the word its button shows. */
  options: readonly (readonly [value: string, label: string])[];
}

/** The hour the sun is at: real unless the player picks one, and not remembered. */
export interface TimeOfDay {
  /** The hour on the chip's clock, local to where you stand, 0 to 24. */
  hour(): number;
  /** Whether the sun is following the real clock. */
  live(): boolean;
  /** Puts the sun at this local hour, from where it keeps running; returns the hour. */
  setHour(hour: number): number;
  /** Back to the real clock, at the real rate. */
  setLive(): void;
  /** The day at an hour a minute. */
  fast: Toggle;
}

export interface SettingsOptions {
  /** How far the world is built: `view.ts`'s knob, `DETAIL_MIN` to `DETAIL_MAX`. */
  detail: Knob;
  /** What a value of the knob lets you see, as a distance ("1.8 km"), shown beside the slider. Without it the slider says the multiple alone. */
  detailDistance?: (value: number) => string;
  /** Whether the knob turns itself by the frame rate (`view.ts`'s automatic detail). Moving the slider by hand turns it off. */
  autoDetail?: Toggle;
  /** The map layer: country colours, frontiers and names from the air. */
  flags: Toggle;
  /** Radians of look per pixel of mouse, as a multiple of the default. */
  sensitivity: Knob;
  /** The frame-rate card in the corner. */
  performance: Toggle;
  /** Wakes, smoke, dust and a crash's debris (`effects.ts`). Omit it and the row is not built. */
  effects?: Toggle;
  /** Whether a crash shakes the camera. Omit it and the row is not built. */
  shake?: Toggle;
  /** Rain, snow, storms and fog; off is clear skies. Omit it and the row is not built. */
  weather?: Toggle;
  /** What the speedometer reads in, and whether boats and aircraft read in knots. Omit it and the rows are not built. */
  units?: { speed: Choice; nautical: Toggle };
  /** A vehicle's keys, for a moment as you take it (`boardingHints`). */
  hints: Toggle;
  /** How many pixels the world is drawn at, against the screen's own. */
  resolution: Choice;
  /** How rich the surfaces, the water and the lens are. Omit it and the row is not built. */
  graphics?: Choice;
  /** The sun's hour, live or chosen. Omit it and the row is not built. */
  time?: TimeOfDay;
  /** The soundscape's level and switch, and optionally whether townsfolk speak aloud and a chat line blips. Omit it and the section is not built. */
  sound?: { volume: Knob; on: Toggle; voices?: Toggle; chat?: Toggle };
  /** The music, with its own level and switch, separate from the sound's. Omit it and the rows are not built. */
  music?: { volume: Knob; on: Toggle };
  /** Where to hand the pointer back to, if it was locked when the panel opened. */
  lockTarget: HTMLElement | null;
  /** Whether the settings key opens this card; false for the title screen's card, made before the world exists, so one key never opens two. */
  key?: boolean;
  /** Called on open, so whatever else holds the screen — the map — can let go. */
  onOpen?(): void;
  /** Called on close. */
  onClose?(): void;
}

/** The card's pages, in the rail's order. */
export type SettingsPage = 'graphics' | 'sound' | 'controls' | 'account' | 'credits';

export interface Settings {
  root: HTMLElement;
  readonly open: boolean;
  /** Opens on `page`, or on whichever page was open last. */
  show(page?: SettingsPage): void;
  hide(): void;
  toggle(): void;
  /** Takes the card off the page and lets go of every key and label it registered. */
  dispose(): void;
}
