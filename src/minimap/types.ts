import type * as THREE from 'three';
import type { PlanetSurface } from '../planet.ts';
import type { Nearby, Place } from '../places.ts';
import type { MapTiles } from '../map-tiles.ts';

/** As much of a `Placement` as the map needs. `placement.ts` owns the rest. */
export interface MinimapMonument {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * Where the caller says you are, which is what the framing is built from.
 *
 * Both fields are already computed once a frame by `main.ts` — the country for
 * the chip and the place for `hud.ts` — so they are handed over rather than
 * asked for again. Omit it and the disc keeps the framing it had.
 */
export interface MinimapHere {
  /** 1-based index into `world.countries`; 0 for open water. */
  country: number;
  /** The nearest *built* place, exactly as `places.nearest` answers it. */
  place: Nearby | null;
}

export interface MinimapOptions {
  /** Canvas edge in CSS pixels. */
  size?: number;
  monuments?: readonly MinimapMonument[];
  /**
   * The whole gazetteer. Only the built rows are drawn — `isShown`, the same
   * rule the settlements, the trees and the chip use, re-read whenever
   * `atlas.prominence()` moves it.
   */
  places?: readonly Place[];
  /** The body the disc is drawn on; Earth when omitted. See `planet.ts`. */
  surface?: PlanetSurface;
  /**
   * The roads, each a line of points on the unit sphere as `x, y, z` runs;
   * asked once, the first time the disc is drawn.
   */
  roads?: () => readonly Float32Array[];
  /**
   * The rockets' pads within `radius` units of `direction`, appended to
   * `out` as unit vectors (`PadIndex.padsWithin` in `launch-pads.ts`, on a
   * budget of the caller's): true once every pad there is in it, false
   * while some are still being worked out, and the disc asks again on its
   * next paper. Omit it for a world with no rockets beside its strips.
   */
  pads?: (direction: THREE.Vector3, radius: number, out: MinimapPad[]) => boolean;
  /**
   * The paper the sheet behind `M` draws too (`map-tiles.ts`): the disc
   * reprojects its tiles under the coast's ink, so what is on the ground —
   * the land's colour, the roads, every building — is on the disc. Asked
   * for as `'minimap'` and painted by whoever owns it; without it the disc
   * fills the countries flat.
   */
  tiles?: MapTiles;
}

/** As much of a `LaunchPad` as the disc needs: where it stands. */
export interface MinimapPad {
  at: { x: number; y: number; z: number };
}

export interface MinimapStats {
  /** Half-width of the disc, in world units and in real kilometres. */
  view: number;
  km: number;
  /** What the last redraw touched, and which outline resolution it used. */
  rings: number;
  points: number;
  level: number;
  places: number;
  pins: number;
  /** The rockets' pads on the last paper. */
  pads: number;
  /** The paper's tiles under the disc, and their level; -1 without a paper. */
  tiles: number;
  tileLevel: number;
  /** Milliseconds in `update`, over the last 60 calls: the median and the worst. */
  medianMs: number;
  worstMs: number;
  /** And the last full rebuild of the land, which is the expensive half. */
  baseMs: number;
}

export interface Minimap {
  /** Not attached to the DOM. The caller mounts it. */
  canvas: HTMLCanvasElement;
  /** Call every frame; the implementation decides how often it actually redraws. */
  update(position: THREE.Vector3, forward: THREE.Vector3, here?: MinimapHere, look?: THREE.Vector3): void;
  /**
   * The player's marker as a point on the unit sphere, or `null` for none: a
   * violet pin where it is on the disc, and a wedge on the rim pointing at it.
   * Copied, so the caller may reuse the vector.
   */
  setMarker(direction: { x: number; y: number; z: number } | null): void;
  /** Force the next `update` to redraw even if nothing has moved. */
  invalidate(): void;
  /**
   * The other players, as points on the unit sphere; see `peers.ts`. Drawn on
   * the overlay, not the base, because they move while you stand still — and
   * one past the rim sits on it, pointing the way to them.
   */
  setPeers(marks: readonly { x: number; y: number; z: number }[]): void;
  /** What the disc is showing and what it costs. `atlas.minimap.stats`. */
  readonly stats: MinimapStats;
  /** Takes the canvas off the page; the disc holds no listener of its own. */
  dispose(): void;
}
