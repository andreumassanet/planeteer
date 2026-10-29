import type * as THREE from 'three';
import type { PlanetSurface } from '../planet.ts';
import type { Placement } from '../placement.ts';
import type { Place } from '../places.ts';
import type { Road } from '../roads.ts';
import type { MapTiles } from '../map-tiles.ts';
import type { CourseMarkKind } from '../course-marks.ts';

export interface WorldMapOptions {
  /** Every placement, the same array the minimap is given. */
  monuments: readonly Placement[];
  /** The player's marker (`navigation.ts`), or null. */
  marker(): MapMarker | null;
  /**
   * A click that puts the marker down: anywhere on the sheet, or at a town or
   * a landmark, with its name. The map decides nothing; `navigation.ts` does.
   */
  onMark(lat: number, lon: number, name: string | null, landmark: boolean): void;
  /** A click on the marker: put it away. */
  onUnmark(): void;
  /**
   * Every place, the array `roads.bin` indexes into. The sheet draws the ones
   * `isShown` builds; omit it for a map with no towns on it.
   */
  places?: readonly Place[];
  /** The network, as `roads.bin` holds it. */
  roads?: readonly Road[];
  /**
   * Or roads already laid, as lines of `[lat, lon]` with a class (0 a lane,
   * 1 a road, 2 a highway): another world's, which has no `roads.bin`.
   */
  courses?: () => readonly { cls: number; points: readonly (readonly [number, number])[] }[];
  /**
   * Who owns pointer lock, so closing the map can hand the mouse back rather
   * than leaving you looking at "click to look around".
   */
  lockTarget?: HTMLElement | null;
  /**
   * `event.code` that opens and closes it: `controls.ts`'s `map` unless given,
   * asked on every press so a rebinding holds at once. `null` to bind it
   * yourself.
   */
  key?: string | null;
  /**
   * Whether something else holds the keyboard, so `M` does not open the map
   * under a card. Consulted only by the key; `show()` is not gated by it,
   * which is what the console and the HUD's own button call.
   */
  blocked?: () => boolean;
  /**
   * The other players, as `peers.ts` last drew them: points on the unit
   * sphere. Omit it for a world with no relay.
   */
  peers?: () => readonly MapPeer[];
  /** Clicking a player, which is how you go and stand beside them. */
  onJoin?(id: string): void;
  /**
   * The body the sheet is drawn of; Earth when omitted. Its colour, relief
   * and coasts paint the tiles, and every distance is on its radius.
   */
  surface?: PlanetSurface;
  /**
   * The rockets' pads within `radius` units of `direction`, appended to
   * `out` (`PadIndex.padsWithin` in `launch-pads.ts`, on a budget of the
   * caller's): true once every pad there is in it. Asked a frame at a time
   * while the sheet is at a street zoom and some are still being worked out.
   */
  pads?: (direction: THREE.Vector3, radius: number, out: MapPad[]) => boolean;
  /**
   * The paper, shared with the disc (`map-tiles.ts`); one of its own, the
   * ground alone, when omitted. A shared one is pumped by its owner while
   * the sheet is closed; the sheet pumps it while it is open.
   */
  tiles?: MapTiles;
  /**
   * Every ring course on the body (`rings.ts`), a badge each by its kind,
   * which a click marks as it does a pin. Asked as the sheet is laid out;
   * an empty list until the courses are known.
   */
  courseSites?: () => readonly MapCourseSite[];
  /** Where a course starts, a unit direction under its first ring; a click on its badge marks there. Omitted, its site. */
  courseStart?: (key: string) => Point | null;
  /** A course's best on this device, for its badge's medal and its tip. */
  courseBest?: (key: string) => { ms: number; medal: number } | null;
  /** The course shown in the world now, run or not, or null: the sheet follows it to the ring it waits for. */
  courseRing?: () => MapCourse | null;
  /**
   * Half the width of ground the sheet opens on, as an angle at the body's
   * centre: the disc's own framing (`Minimap.span`), so `M` opens on what
   * the corner showed. Omitted, the sheet keeps the zoom it last had.
   */
  openSpan?: () => number;
}

type Point = { x: number; y: number; z: number };

/** As much of a `CourseSite` as the sheet needs. */
export interface MapCourseSite {
  key: string;
  kind: CourseMarkKind;
  title: string;
  /** Its town or port, a unit direction. */
  at: Point;
  /** Its town's index in `places`, for the tip's flag; -1 for a sea's. */
  place: number;
}

/** As much of an `ActiveCourse` as the sheet needs. */
export interface MapCourse {
  site: { title: string; loop: boolean };
  rings: readonly { centre: Point }[];
  /** The start ring before a run, the next ring during one. */
  next: { centre: Point };
  running: boolean;
  finish: boolean;
}

/** As much of a `LaunchPad` as the sheet needs. */
export interface MapPad {
  id: string;
  at: { x: number; y: number; z: number };
}

export interface MapMarker {
  lat: number;
  lon: number;
  name: string | null;
}

export interface MapPeer {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface WorldMapStats {
  /** Tiles painted and held, and how many are still being painted. */
  tiles: number;
  pending: number;
  /** The zoom as pixels per degree of longitude, and the tile level drawn. */
  pixelsPerDegree: number;
  level: number;
  /** The last draw of the sheet — tiles, lines, towns, names — in milliseconds. */
  drawMs: number;
  /** And of the marks over it — the route, the pins, the courses, the players, you — which is most redraws. */
  marksMs: number;
}

export interface WorldMap {
  /** The whole overlay, stylesheet included. The caller mounts one element. */
  root: HTMLElement;
  readonly open: boolean;
  toggle(): void;
  show(): void;
  /**
   * Put the sheet away. The mouse is locked again when the sheet took the
   * lock as it opened — or when `relock` says so either way: false for a
   * card that takes the sheet's place, true for a click that means play.
   */
  hide(relock?: boolean): void;
  /**
   * Centre the sheet on a place, and optionally set the zoom as how many
   * degrees of longitude the screen is wide. For the console and the shots.
   */
  focus(lat: number, lon: number, degreesAcross?: number): void;
  readonly stats: WorldMapStats;
  /** Every frame. Returns immediately and costs nothing while it is closed. */
  update(position: THREE.Vector3, forward: THREE.Vector3): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

/** A town on the sheet, in map units. */
export interface SheetTown {
  place: Place;
  /** Index into `places`, which is what the roads' ends are. */
  index: number;
  u: number;
  v: number;
  rank: number;
  /** Built radius in world units. */
  radius: number;
}

/** A road on the sheet: its box in map units and, once seen, its sampled course. */
export interface SheetRoad {
  cls: number;
  /** Earth's road, traced from its course; or null where `points` are the line. */
  road: Road | null;
  points: readonly (readonly [number, number])[] | null;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** The drawn course, sampled; null until first seen. */
  u: Float32Array | null;
  v: Float32Array | null;
}

export interface CountryLabel {
  text: string;
  u: number;
  v: number;
  /** The largest ring's width on the sheet, in map units. */
  span: number;
}

/** Something the cursor can point at. */
export type Hit =
  | { kind: 'marker'; x: number; y: number }
  | { kind: 'pin'; index: number; x: number; y: number }
  | { kind: 'course'; index: number; x: number; y: number }
  | { kind: 'peer'; id: string; name: string; x: number; y: number; distance: number }
  | { kind: 'town'; town: SheetTown; x: number; y: number };
