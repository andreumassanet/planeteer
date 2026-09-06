/**
 * Somewhere to go.
 *
 * The plane is already the map: climb and the fog opens on the whole globe. What
 * it never had was a destination — sixty-five pins and no way to say *that one*.
 * This picks one landmark and then points at it, and it deliberately stops
 * there. It never flies you.
 *
 * **Why there is no autopilot.** The plane's whole design is that speed rides
 * altitude, so crossing an ocean *is* a climb and arriving *is* a descent. Hand
 * that to an autopilot and the one interaction the travel model was built around
 * turns into a loading screen with scenery. A heading cue costs the player
 * nothing they were enjoying, and the flying is the part that is already good.
 *
 * **Why one key.** Pointer lock holds the cursor, so nothing here can be
 * clicked, and WASD is busy flying the aircraft. `Tab` cycles, and the order is
 * what makes it feel spatial rather than like a menu: candidates are sorted
 * nearest-first, with the ones you have already found pushed to the back. So the
 * first press always offers somewhere new, each further press walks outwards,
 * and steering roughly at India puts the Taj Mahal one press away. Flying
 * approximately there is the coarse control; the key is the fine one.
 *
 * The guidance is three things that answer three different questions. The
 * minimap says *which way* (its own violet mark, not the crimson one that tracks
 * whatever happens to be nearest). The panel says *how far*, in real kilometres,
 * because the outlines are real. And the waypoint marker says *where*, tracked
 * in 3D and clamped to the screen edge when the planet is in the way — from the
 * ceiling that is a label sitting on the actual continent, which no 180-pixel
 * disc in the corner can be.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import type { DestinationEntry, Hud } from './hud.ts';
import type { Minimap } from './minimap.ts';
import type { Placement } from './placement.ts';

/** As much of the player as this reads. `player.ts` owns the rest. */
interface Traveller {
  position: THREE.Vector3;
  vehicle: string;
}

export interface NavigationOptions {
  placements: readonly Placement[];
  minimap: Minimap;
  hud: Hud;
  /** Surface radius under a unit direction, exactly as `main.ts` computes it. */
  groundAt: (direction: THREE.Vector3) => number;
  isVisited: (id: string) => boolean;
  /**
   * The ISO code of the country the player is standing in, or `null` at sea.
   * `Tab` lists that country's landmarks first; see `rank`.
   */
  countryHere?: () => string | null;
  /**
   * `event.code` that cycles the destination. Pass `null` to take the key over
   * yourself and call `advance()` — which is what binding it in `input.ts`
   * would look like.
   */
  key?: string | null;
}

export interface Navigation {
  /** The landmark you are heading for, or null. */
  readonly target: Placement | null;
  /**
   * Choose the next candidate. The key does this; so does the console.
   *
   * Ordered from wherever `update` last put you, which between two frames is
   * where you are.
   */
  advance(): void;
  /**
   * Choose one by id, which is what pointing at it on the map does.
   *
   * It goes through here rather than the map setting its own target for the
   * reason `hud.ts` and `minimap.ts` both exist to serve: a destination is one
   * fact with three views of it — the rim mark, the panel and the waypoint —
   * and a second thing that could set it would be a second answer. Unknown ids
   * are ignored: the map's list and this one come from the same file, but a
   * typo should not blank the panel.
   */
  select(id: string): void;
  /** Put the destination away. */
  clear(): void;
  /** Every frame, after the rig has placed the camera. */
  update(dt: number, player: Traveller, camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

const D2R = Math.PI / 180;
/** Mean Earth radius, as in `minimap.ts`: the outlines are real. */
const EARTH_KM = 6371;

/**
 * How close counts as arrived, in world units.
 *
 * The same 140 that `placement.ts` counts as a visit, and it has to stay the
 * same: arriving somewhere and finding it are one moment, and two thresholds
 * would let the card and the counter disagree about whether you got there.
 */
const ARRIVE_RANGE = 140;
/**
 * And arriving is on foot, for the reason `placement.ts` gives: from the air you
 * can see half a continent. Flying over your destination is not reaching it —
 * the last hundred metres are the reward for the flight.
 */
const ARRIVE_ON_FOOT = 'foot';

/** How long the shortlist stays open after the last press. */
const BROWSE_HOLD = 3.5;
/** How many of the following candidates the shortlist shows. */
const SHORTLIST = 4;

/**
 * How high above the site the waypoint floats, in world units.
 *
 * A pin hovers over the thing it marks rather than sitting in it, and 90 units
 * clears the tallest monument the contract allows without reading as a balloon.
 */
const WAYPOINT_RISE = 90;
/**
 * Inside this the marker is dropped: you are close enough that the monument
 * itself is on screen, and the label would be standing in front of it.
 */
const MARKER_DEADZONE = 260;
/**
 * How far inside the viewport an off-screen marker is pinned, in CSS pixels.
 * Wide enough that its label, which is centred above the tip, stays on screen.
 */
const MARKER_MARGIN = 84;

export function createNavigation(options: NavigationOptions): Navigation {
  const { placements, minimap, hud, groundAt, isVisited } = options;
  // Which country the player is standing in, asked at the moment `Tab` is
  // pressed rather than held as state — `main.ts` computes it every frame for
  // the chip anyway, at 2 us, and a copy kept here would be one more thing that
  // can go stale.
  const countryHere = options.countryHere ?? (() => null);
  const key = options.key === undefined ? 'Tab' : options.key;
  const count = placements.length;

  // Unit vectors once, the same conversion the minimap uses for its pins, so a
  // destination and the pin that stands for it cannot drift apart.
  const site = new Float32Array(count * 3);
  placements.forEach((placement, i) => {
    const lon = placement.lon * D2R;
    const lat = placement.lat * D2R;
    const c = Math.cos(lat);
    site[i * 3] = c * Math.cos(lon);
    site[i * 3 + 1] = Math.sin(lat);
    site[i * 3 + 2] = -c * Math.sin(lon);
  });

  const ranked: number[] = [];
  const closeness = new Float32Array(count);

  let chosen = -1;
  /** Where the chosen landmark actually stands, and where its marker floats. */
  const anchor = new THREE.Vector3();
  const marker = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  /** Seconds of shortlist left. Above zero is "browsing". */
  let browseFor = 0;

  /**
   * Orders the candidates from where you are standing.
   *
   * Visited last, then nearest first. One sort key rather than a special case:
   * a chooser is for finding things, so the ones you have found sink to the
   * bottom, and nothing becomes unreachable — flying back to the Eiffel Tower
   * is further down the same list.
   */
  /**
   * The order `Tab` walks.
   *
   * **The country you are standing in comes first, and that is the whole of
   * what this key is for now**: the user asked for *"los monumentos del pais en
   * el que estas"*. It is a sort key rather than a filter, deliberately —
   * landmarks stand in **59 of 234 countries**, so a filter would make `Tab` do
   * nothing at all in three quarters of the world, and over water it would do
   * nothing anywhere. Sorting instead means the panel opens on what is around
   * you and keeps going into the neighbours when your own country runs out.
   *
   * Unvisited before visited, then nearest, exactly as before, inside each
   * group.
   */
  function rank(ux: number, uy: number, uz: number): void {
    const home = countryHere();
    ranked.length = 0;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      closeness[i] = site[k]! * ux + site[k + 1]! * uy + site[k + 2]! * uz;
      ranked.push(i);
    }
    ranked.sort((a, b) => {
      if (home !== null) {
        const ha = placements[a]!.iso === home ? 0 : 1;
        const hb = placements[b]!.iso === home ? 0 : 1;
        if (ha !== hb) return ha - hb;
      }
      const va = isVisited(placements[a]!.id) ? 1 : 0;
      const vb = isVisited(placements[b]!.id) ? 1 : 0;
      if (va !== vb) return va - vb;
      return closeness[b]! - closeness[a]!;
    });
  }

  /** Angle in radians from a unit direction to the site at `i`. */
  function angleTo(i: number, ux: number, uy: number, uz: number): number {
    const k = i * 3;
    const dot = site[k]! * ux + site[k + 1]! * uy + site[k + 2]! * uz;
    return Math.acos(Math.max(-1, Math.min(1, dot)));
  }

  /** The chosen landmark plus what follows it, for the panel. */
  function shortlist(ux: number, uy: number, uz: number): DestinationEntry[] {
    const at = ranked.indexOf(chosen);
    const entries: DestinationEntry[] = [];
    for (let n = 0; n < 1 + SHORTLIST && n < ranked.length; n++) {
      const i = ranked[(at + n) % ranked.length]!;
      const placement = placements[i]!;
      entries.push({
        name: placement.name,
        iso: placement.iso,
        km: angleTo(i, ux, uy, uz) * EARTH_KM,
        visited: isVisited(placement.id),
      });
    }
    return entries;
  }

  function select(i: number, ux: number, uy: number, uz: number, browsing = true): void {
    chosen = i;
    const k = i * 3;
    scratch.set(site[k]!, site[k + 1]!, site[k + 2]!);
    // The ground is asked once, here, exactly as `placement.ts` asks it: the
    // relief does not move, and a point-in-polygon query per frame behind a HUD
    // label would be an absurd price for a label.
    const ground = groundAt(scratch);
    anchor.copy(scratch).multiplyScalar(ground);
    marker.copy(scratch).multiplyScalar(ground + WAYPOINT_RISE);
    minimap.setTarget(placements[i]!.id);
    hud.setDestination(shortlist(ux, uy, uz), browsing);
  }

  function clear(): void {
    chosen = -1;
    browseFor = 0;
    minimap.setTarget(null);
    hud.setDestination(null);
  }

  const byId = new Map(placements.map((placement, i) => [placement.id, i]));

  /** The player's own up, which every ordering here is measured from. */
  let ux = 0;
  let uy = 1;
  let uz = 0;

  function advance(): void {
    if (count === 0) return;
    // A fresh press after the shortlist has closed re-orders from where you are
    // now; while it is open the order is frozen, or the list would reshuffle
    // under the key you are pressing.
    if (browseFor <= 0 || ranked.length === 0) {
      rank(ux, uy, uz);
      select(ranked[0]!, ux, uy, uz);
    } else {
      const at = ranked.indexOf(chosen);
      select(ranked[(at + 1) % ranked.length]!, ux, uy, uz);
    }
    browseFor = BROWSE_HOLD;
  }

  const events = new AbortController();
  if (key !== null) {
    addEventListener('keydown', (event) => {
      // Leave the browser's own shortcuts alone, the same rule `input.ts` uses.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code !== key) return;
      event.preventDefault();
      if (!event.repeat) advance();
    }, { signal: events.signal });
  }

  /**
   * Puts the marker on screen.
   *
   * Two cases and they share a code path. If the destination is on the near side
   * of the planet the marker sits over it. If the planet is in the way, the
   * point projected is the horizon crossing on the great circle towards it —
   * which is where the destination genuinely is, as far as the eye can follow —
   * and the marker then clamps to the screen edge with its tip pointing on. That
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
    const cosHorizon = PLANET_RADIUS / Math.max(length, PLANET_RADIUS + 1);

    const k = chosen * 3;
    const tx = site[k]!;
    const ty = site[k + 1]!;
    const tz = site[k + 2]!;
    const dot = tx * cx + ty * cy + tz * cz;

    let beyond = false;
    if (dot >= cosHorizon) {
      scratch.copy(marker);
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
      scratch.set(cx * c + ax * s, cy * c + ay * s, cz * c + az * s).multiplyScalar(PLANET_RADIUS);
      beyond = true;
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

    const inside = !beyond && !behind
      && x >= MARKER_MARGIN && x <= width - MARKER_MARGIN
      && y >= MARKER_MARGIN && y <= height - MARKER_MARGIN;
    if (inside) {
      // The tip points straight down at the ground it marks.
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
    get target() {
      return chosen < 0 ? null : placements[chosen]!;
    },
    advance,
    select(id) {
      const i = byId.get(id);
      if (i === undefined) return;
      // Not browsing: you pointed at this one, so there is no shortlist to walk
      // and nothing to close on a timer.
      rank(ux, uy, uz);
      select(i, ux, uy, uz, false);
      browseFor = 0;
    },
    clear,
    update(dt, player, camera) {
      const position = player.position;
      const length = Math.hypot(position.x, position.y, position.z);
      if (length < 1e-9) return;
      ux = position.x / length;
      uy = position.y / length;
      uz = position.z / length;

      if (browseFor > 0) {
        browseFor -= dt;
        // The shortlist closes on its own and the panel collapses to the one
        // line you chose. Nothing to dismiss, which matters when both hands are
        // already flying.
        if (browseFor <= 0 && chosen >= 0) hud.setDestination(shortlist(ux, uy, uz), false);
      }
      if (chosen < 0) return;

      const reach = anchor.distanceTo(position);
      if (reach <= ARRIVE_RANGE && player.vehicle === ARRIVE_ON_FOOT) {
        const placement = placements[chosen]!;
        clear();
        // The panel you watched the whole way there resolves in place, which is
        // a different event from stumbling on a landmark and being told you
        // found it. The counter's toast still fires; this one says you arrived.
        hud.arriveAt(placement.name, placement.iso);
        return;
      }

      const km = angleTo(chosen, ux, uy, uz) * EARTH_KM;
      if (reach < MARKER_DEADZONE) hud.trackDestination(km, null, 0, 0);
      else place(camera, km);
    },
    dispose() {
      events.abort();
    },
  };
}
