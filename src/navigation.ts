/**
 * Somewhere to go: the one marker the player puts on the world map.
 *
 * Click anywhere on the map behind `M` (land, sea, a town or a landmark's
 * pin) and that point is the marker; click it again, or the map's *Clear
 * marker*, and it is gone. It is the player's own, kept on this device
 * (`MARKER_KEY`) across reloads. It points and never flies: the plane's travel
 * model is that speed rides altitude, so crossing an ocean is a climb and
 * arriving is a descent.
 *
 * Three guidance marks answer three questions: the minimap's violet wedge says
 * which way, the panel under it says how far (real kilometres), and the
 * waypoint says where, tracked in 3D and clamped to the screen edge when the
 * planet is in the way (`navigation/waypoint.ts`).
 *
 * Reaching it puts it away: within `ARRIVE_RANGE` of it and not in the air,
 * the panel says *Arrived* and the marker is cleared.
 */
import * as THREE from 'three';
import { EARTH_KM } from './cartography.ts';
import { PLANET_RADIUS } from './globe.ts';
import type { Hud } from './hud.ts';
import type { Minimap } from './minimap.ts';
import type { PlanetSurface } from './planet.ts';
import { unitAt } from './sphere.ts';
import { placeWaypoint } from './navigation/waypoint.ts';

/** As much of the player as this reads. `player.ts` owns the rest. */
interface Traveller {
  position: THREE.Vector3;
  /** Off the ground: a jump, a fall, a flight. */
  airborne: boolean;
}

/** The marker, as the map placed it and the device keeps it. */
export interface Marker {
  lat: number;
  lon: number;
  /** A landmark's or a town's name when one was clicked; null for a bare point. */
  name: string | null;
  /** The country under it when it was placed, or null at sea. */
  iso: string | null;
  /** A landmark: its waypoint steps aside close in, where the landmark itself is in view. */
  landmark: boolean;
}

export interface NavigationOptions {
  minimap: Minimap;
  hud: Hud;
  /** Surface radius under a unit direction, exactly as `main.ts` computes it. */
  groundAt: (direction: THREE.Vector3) => number;
  /** The country under a point, as an ISO code, or null at sea. */
  countryAt?: (lat: number, lon: number) => string | null;
  /** Where the marker is kept; the device's `localStorage` unless given, `null` for none. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** The body the marker is on; Earth when omitted. See `planet.ts`. */
  surface?: PlanetSurface;
  /**
   * The key the marker is kept under: `MARKER_KEY` on Earth, and
   * `markerKeyOf(surface.id)` on another body, so a marker on Mars is not
   * read back as a point on Earth.
   */
  markerKey?: string;
}

export interface Navigation {
  /** The marker, or null. */
  readonly marker: Marker | null;
  /**
   * Put the marker here, replacing any other. `name` is the landmark's or the
   * town's that was clicked, and `landmark` says it was a landmark's pin.
   */
  mark(lat: number, lon: number, name?: string | null, landmark?: boolean): void;
  /** Put the marker away. */
  clear(): void;
  /** Every frame, after the rig has placed the camera. */
  update(dt: number, player: Traveller, camera: THREE.PerspectiveCamera): void;
  /** Stops answering `update`; the marker stays kept on the device. */
  dispose(): void;
}

/** Where the device keeps the marker. */
export const MARKER_KEY = 'atlas.marker.v1';

/** Where the device keeps a body's marker: Earth's is `MARKER_KEY`. */
export function markerKeyOf(body: string): string {
  return body === 'earth' ? MARKER_KEY : `atlas.marker.${body}.v1`;
}

/**
 * How close counts as arrived, world units: about a hundred metres at the
 * scale things are built at, the width of a landmark's pad. The panel counts
 * real kilometres (the planet's own scale), so it reads far larger than this
 * at the moment of arrival; the last stretch says *Here* (`HERE_RANGE`).
 */
const ARRIVE_RANGE = 140;

/**
 * Inside this, world units, the panel says *Here* instead of a distance: a
 * number in real kilometres tells someone in sight of the place that they are
 * far from it. A short walk on foot, a moment from the plane.
 */
const HERE_RANGE = ARRIVE_RANGE * 3;

/**
 * How high above the site the waypoint floats, world units: it hovers over
 * what it marks and clears the tallest monument the contract allows.
 */
const WAYPOINT_RISE = 90;
/**
 * Inside this a landmark's waypoint is dropped: the monument itself is on
 * screen, and the label would be standing in front of it. A bare point keeps
 * its waypoint until it is reached, since there is nothing else to see there.
 */
const MARKER_DEADZONE = 260;
/** The device's store, if the browser will hand it over at all. */
function deviceStorage(): NavigationOptions['storage'] {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** A stored marker, or null when it cannot be vouched for. */
export function readMarker(stored: string | null | undefined): Marker | null {
  if (typeof stored !== 'string' || stored === '') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { lat, lon, name, iso, landmark } = raw as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    lat,
    lon,
    name: typeof name === 'string' && name.trim() !== '' ? name.trim().slice(0, 80) : null,
    iso: typeof iso === 'string' && (/^[A-Z0-9]{2,4}$/.test(iso) || /^[a-z]+:[a-z0-9-]{1,32}$/.test(iso)) ? iso : null,
    landmark: landmark === true,
  };
}

export function createNavigation(options: NavigationOptions): Navigation {
  const { minimap, hud, groundAt } = options;
  const countryAt = options.countryAt ?? (() => null);
  const storage = options.storage === undefined ? deviceStorage() : options.storage;
  const RADIUS = options.surface?.radius ?? PLANET_RADIUS;
  const RADIUS_KM = options.surface?.radiusKm ?? EARTH_KM;
  const KEY = options.markerKey ?? (options.surface === undefined ? MARKER_KEY : markerKeyOf(options.surface.id));
  let disposed = false;

  let marker: Marker | null = null;
  /** The marker's direction, where it stands on the ground, and where its waypoint floats. */
  const site = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const floating = new THREE.Vector3();
  const scratch = new THREE.Vector3();

  function save(): void {
    try {
      if (marker === null) storage?.removeItem(KEY);
      else storage?.setItem(KEY, JSON.stringify(marker));
    } catch {
      // Full or blocked: the marker lasts this visit.
    }
  }

  const labelOf = (m: Marker): string => m.name ?? 'Marker';

  function set(next: Marker | null, keep = true): void {
    marker = next;
    if (keep) save();
    if (next === null) {
      minimap.setMarker(null);
      hud.setDestination(null);
      return;
    }
    unitAt(next.lat, next.lon, site);
    // The ground is asked once, here: the relief does not move.
    const ground = groundAt(site);
    anchor.copy(site).multiplyScalar(ground);
    floating.copy(site).multiplyScalar(ground + WAYPOINT_RISE);
    minimap.setMarker(site);
    hud.setDestination({ name: labelOf(next), iso: next.iso, km: NaN });
  }

  try {
    const kept = readMarker(storage?.getItem(KEY));
    if (kept !== null) set(kept, false);
  } catch {
    // A store that refuses a read is a map with no marker on it.
  }

  return {
    get marker() {
      return marker;
    },
    mark(lat, lon, name = null, landmark = false) {
      set({ lat, lon, name, iso: countryAt(lat, lon), landmark });
    },
    clear() {
      if (marker !== null) set(null);
    },
    update(_dt, player, camera) {
      if (marker === null || disposed) return;
      const position = player.position;
      const length = position.length();
      if (length < 1e-9) return;
      scratch.copy(position).divideScalar(length);
      const angle = scratch.angleTo(site);
      const km = angle * RADIUS <= HERE_RANGE ? null : angle * RADIUS_KM;
      if (angle * RADIUS <= ARRIVE_RANGE && !player.airborne) {
        const reached = marker;
        set(null);
        // The panel you watched the whole way there resolves in place.
        hud.arriveAt(labelOf(reached), reached.iso);
        return;
      }
      const reach = anchor.distanceTo(position);
      if (marker.landmark && reach < MARKER_DEADZONE) hud.trackDestination(km, null, 0, 0);
      else placeWaypoint(hud, camera, km, RADIUS, site, floating, scratch);
    },
    dispose() {
      disposed = true;
    },
  };
}
