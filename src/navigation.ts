/**
 * Somewhere to go: the one marker the player puts on the world map.
 *
 * Click anywhere on the map behind `M` — land, sea, a town or a landmark's
 * pin — and that point is the marker; click it again, or the map's *Clear
 * marker*, and it is gone. It is the player's own and nobody else's: nothing
 * in the world picks a destination for you, and nothing counts what you have
 * reached. It is kept on this device (`MARKER_KEY`), so it is still there
 * after a reload.
 *
 * It points and it never flies you. **Why there is no autopilot**: the
 * plane's whole design is that speed rides altitude, so crossing an ocean
 * *is* a climb and arriving *is* a descent. Hand that to an autopilot and the
 * one interaction the travel model was built around turns into a loading
 * screen with scenery.
 *
 * The guidance is three things that answer three different questions. The
 * minimap's violet wedge says *which way*. The panel under it says *how far*,
 * in real kilometres, because the outlines are real. And the waypoint says
 * *where*, tracked in 3D and clamped to the screen edge when the planet is in
 * the way — from the ceiling that is a label sitting on the actual continent,
 * which no 180-pixel disc in the corner can be.
 *
 * **Reaching it puts it away**: within `ARRIVE_RANGE` of it and not in the air,
 * the panel says *Arrived* and the marker is cleared, because a marker you
 * are standing on has nothing left to say.
 */
import * as THREE from 'three';
import { EARTH_KM } from './cartography.ts';
import { PLANET_RADIUS } from './globe.ts';
import type { Hud } from './hud.ts';
import type { Minimap } from './minimap.ts';
import type { PlanetSurface } from './planet.ts';
import { unitAt } from './sphere.ts';

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

/** Where the device keeps a body's marker: Earth's is `MARKER_KEY`, as it always was. */
export function markerKeyOf(body: string): string {
  return body === 'earth' ? MARKER_KEY : `atlas.marker.${body}.v1`;
}

/**
 * How close counts as arrived, in world units: about a hundred metres, the
 * width of a landmark's pad. A marker dropped on a sheet at street zoom is a
 * few units off where the click meant, and this swallows that.
 */
const ARRIVE_RANGE = 140;

/**
 * How high above the site the waypoint floats, in world units.
 *
 * A pin hovers over the thing it marks rather than sitting in it, and 90 units
 * clears the tallest monument the contract allows without reading as a balloon.
 */
const WAYPOINT_RISE = 90;
/**
 * Inside this a landmark's waypoint is dropped: the monument itself is on
 * screen, and the label would be standing in front of it. A bare point keeps
 * its waypoint until it is reached, since there is nothing else to see there.
 */
const MARKER_DEADZONE = 260;
/**
 * How far inside the viewport an off-screen marker is pinned, in CSS pixels:
 * enough for the pin and a short label. A label can be up to 240 wide, which
 * this does not cover, so the HUD slides a long one along to keep it on the
 * screen rather than this pinning every marker 120 pixels in.
 */
const MARKER_MARGIN = 84;

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
    // The ground is asked once, here: the relief does not move, and a
    // point-in-polygon query per frame behind a HUD label would be an absurd
    // price for a label.
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

  /**
   * Puts the marker on screen.
   *
   * Two cases and they share a code path. If the destination is on the near side
   * of the planet the marker sits over it. If the planet is in the way, the
   * point projected is the horizon crossing on the great circle towards it —
   * which is where the destination genuinely is, as far as the eye can follow —
   * and it is marked there when that is in the frame, clamped to the screen
   * edge with its tip pointing on when it is not. That
   * is the whole reason to compute a horizon point rather than hide the marker:
   * from the ceiling, "just over that limb" is a real and useful answer.
   */
  function place(camera: THREE.PerspectiveCamera, km: number): void {
    const cam = camera.position;
    const length = cam.length();
    if (length < 1e-6) return;
    const cx = cam.x / length;
    const cy = cam.y / length;
    const cz = cam.z / length;
    // Clamped so a camera grazing the surface still has a horizon to speak of.
    const cosHorizon = RADIUS / Math.max(length, RADIUS + 1);

    const tx = site.x;
    const ty = site.y;
    const tz = site.z;
    const dot = tx * cx + ty * cy + tz * cz;

    if (dot >= cosHorizon) {
      scratch.copy(floating);
    } else {
      // Tangent of the great circle at the camera's subpoint, pointing at the
      // destination. Undefined at the exact antipode, where no direction is more
      // right than any other; drop the marker rather than invent one.
      let ax = tx - dot * cx;
      let ay = ty - dot * cy;
      let az = tz - dot * cz;
      const along = Math.hypot(ax, ay, az);
      if (along < 1e-6) {
        hud.trackDestination(km, null, 0, 0);
        return;
      }
      ax /= along;
      ay /= along;
      az /= along;
      const phi = Math.acos(Math.min(1, cosHorizon));
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      scratch.set(cx * c + ax * s, cy * c + ay * s, cz * c + az * s).multiplyScalar(RADIUS);
    }

    // The rig moves the camera every frame but only the render updates its
    // matrices, and this runs before the render: without this the marker trails
    // the view by a frame, which at 3,400 units a second is visible.
    camera.updateMatrixWorld();
    scratch.project(camera);
    // Behind the camera the perspective divide is by a negative w, which flips
    // both axes. Flipping them back leaves a direction that is still correct,
    // which is all a clamped marker needs.
    const behind = scratch.z > 1;
    const width = innerWidth;
    const height = innerHeight;
    let x = (scratch.x * 0.5 + 0.5) * width;
    let y = (0.5 - scratch.y * 0.5) * height;
    if (behind) {
      x = width - x;
      y = height - y;
    }

    // **On the screen is on the screen, beyond the horizon or not.** The first
    // version sent everything beyond the horizon to the edge, along the line
    // from the middle of the screen to the horizon point — and facing the
    // destination that line is a few pixels long and points wherever the head
    // last nodded, so the marker sat pinned to the top edge and flipped to the
    // bottom: looking that way, it went up, or somewhere stranger. Now a
    // horizon point in the frame is marked where it is, which is where the
    // destination lies beyond; the tip points down at it, as it points down at
    // the ground when the landmark is in sight.
    const inside = !behind
      && x >= MARKER_MARGIN && x <= width - MARKER_MARGIN
      && y >= MARKER_MARGIN && y <= height - MARKER_MARGIN;
    if (inside) {
      hud.trackDestination(km, x, y, Math.PI / 2);
      return;
    }

    const midX = width / 2;
    const midY = height / 2;
    let dx = x - midX;
    let dy = y - midY;
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) {
      dx = 0;
      dy = 1;
    }
    const halfW = Math.max(1, midX - MARKER_MARGIN);
    const halfH = Math.max(1, midY - MARKER_MARGIN);
    const reach = Math.min(halfW / Math.max(Math.abs(dx), 1e-6), halfH / Math.max(Math.abs(dy), 1e-6));
    hud.trackDestination(km, midX + dx * reach, midY + dy * reach, Math.atan2(dy, dx));
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
      const km = angle * RADIUS_KM;
      if (angle * RADIUS <= ARRIVE_RANGE && !player.airborne) {
        const reached = marker;
        set(null);
        // The panel you watched the whole way there resolves in place.
        hud.arriveAt(labelOf(reached), reached.iso);
        return;
      }
      const reach = anchor.distanceTo(position);
      if (marker.landmark && reach < MARKER_DEADZONE) hud.trackDestination(km, null, 0, 0);
      else place(camera, km);
    },
    dispose() {
      disposed = true;
    },
  };
}
