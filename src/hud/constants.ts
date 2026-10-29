/** Timings and tables for the HUD. */
import type { TravelMode } from '../controls.ts';
import type { IconName } from '../ui.ts';

/** Seconds a country must hold before it counts as where you are. */
export const SETTLE_LAND = 1.0;
/** The same for the sea, longer on purpose: the coast is where the flapping is worst. */
export const SETTLE_OCEAN = 3.0;
/** The same for a place. */
export const SETTLE_PLACE = 0.8;
/**
 * The same for a place from the plane: the nearest town changes every few tenths
 * of a second at cruise, so only the square you are over counts.
 */
export const SETTLE_FLIGHT = 0.2;
/** How far offshore a town still names the sea you are on, in real km ("Off Palma" from the bay, "Open water" past it). */
export const OFFSHORE_KM = 40;
/** The badge's little jolt, seconds, when the place under it changes. */
export const BUMP = 0.22;
/** Seconds "Arrived" holds before the destination panel goes. */
export const ARRIVED_HOLD = 4.5;
/** Seconds a toast stays. */
export const TOAST_HOLD = 1.8;
/** Seconds a new vehicle's keys stay, counted while the game has the mouse. */
export const HINT_HOLD = 6;
/** The same once one of them has been pressed. */
export const HINT_USED_HOLD = 1.2;
/** Storage key of the `once` hint sets used on this device. */
export const HINTED_KEY = 'atlas.hinted.v1';
/** How often the weather is asked for the clock's icon, in seconds. */
export const WEATHER_EVERY = 1;

export const R2D = 180 / Math.PI;

/** Radians the badge's arrow must turn before it is rewritten (under a pixel of arrowhead). */
export const ARROW_STEP = 4 / R2D;
/** How near the screen's edge a waypoint label may come, in CSS pixels. */
export const LABEL_MARGIN = 12;

/** Village, town or city off the one size law, by a nominal radius: the cuts at 13 and 30 units are about 10,000 and 100,000 people. */
export const sizeWord = (radius: number): string => (radius < 13 ? 'village' : radius < 30 ? 'town' : 'city');

/** The badge a vehicle's keys are shown beside. */
export const MODE_ICON: Record<TravelMode, IconName> = {
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
export const WEATHER_ICON: Record<string, IconName> = {
  cloudy: 'cloud',
  fog: 'fog',
  drizzle: 'rain',
  rain: 'rain',
  storm: 'storm',
  snow: 'snow',
};
