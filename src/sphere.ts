/**
 * Degrees of latitude and longitude to a direction from the planet's centre,
 * and back — the one conversion this project has, written once.
 *
 * `x = cos(lat) cos(lon)`, `y = sin(lat)`, `z = -cos(lat) sin(lon)`, and so
 * `lon = atan2(-z, x)`. **The `-` on z is not a taste**: without it east lands
 * where west belongs and the whole planet is mirrored, self-consistently — the
 * countries, the monuments, the pins and the pads all agree with each other and
 * only disagree with the world, so nothing on the ground can tell. This repo
 * shipped that three times, and when this file was made (2026-09-21) the
 * formula was written out by hand 59 times — 53 in `src/`, 6 in the scripts —
 * any one of which could have been the fourth.
 *
 * A leaf that imports nothing, so the hot loops in `terrain.ts`, the maps and
 * the Node-run bakes and checks can all reach it without dragging `globe.ts`
 * in. `globe.ts`'s `onSphere`, `geo.ts`'s `toLatLon` and `cartography.ts`'s
 * `toUnit` are this file under the names their callers already knew. `pnpm
 * check` holds every one of them to the textbook formula and to two facts about
 * the Earth, and fails on a conversion written out by hand anywhere else in
 * `src/` (the GLSL, which cannot import, is the exception it knows about).
 */

const DEG = Math.PI / 180;

/** Anything with writable `x`, `y` and `z`: a `THREE.Vector3`, or a plain object. */
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** The unit vector at `lat`, `lon` (degrees), written into `target`. */
export function unitAt<T extends XYZ>(lat: number, lon: number, target: T): T {
  const c = Math.cos(lat * DEG);
  target.x = c * Math.cos(lon * DEG);
  target.y = Math.sin(lat * DEG);
  target.z = -c * Math.sin(lon * DEG);
  return target;
}

/**
 * The same, into three consecutive slots of a flat array from `at` — a typed
 * array of directions, or a plain one.
 */
export function toUnit(lat: number, lon: number, out: { [index: number]: number }, at = 0): void {
  const c = Math.cos(lat * DEG);
  out[at] = c * Math.cos(lon * DEG);
  out[at + 1] = Math.sin(lat * DEG);
  out[at + 2] = -c * Math.sin(lon * DEG);
}

/**
 * Latitude in degrees of a **unit** vector, from its `y` alone. Clamped, because
 * a normalised vector's `y` rounds past 1 near a pole and `asin` of that is NaN.
 */
export function latOf(y: number): number {
  return Math.asin(y < -1 ? -1 : y > 1 ? 1 : y) / DEG;
}

/** Longitude in degrees of any vector, unit or not: `atan2` needs no length. */
export function lonOf(x: number, z: number): number {
  return Math.atan2(-z, x) / DEG;
}

/**
 * Both, of a vector of any length — a world position, say — which is
 * normalised first. Allocates only when `out` is not given.
 */
export function latLonOf(point: Readonly<XYZ>, out: LatLon = { lat: 0, lon: 0 }): LatLon {
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  out.lat = latOf(point.y / length);
  out.lon = lonOf(point.x, point.z);
  return out;
}
