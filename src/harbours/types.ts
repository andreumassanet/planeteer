/**
 * What a harbour is, as the planner leaves it and the drawing reads it. Every
 * length is in units in the harbour's own frame: `x` across (along `across`),
 * `z` out to sea (along `out`), both from `root`, where the main run meets the
 * coastline; heights are over the sea's radius.
 */
import type * as THREE from 'three';
import type { RegionId } from '../scenery/regions.ts';

/** How much harbour a town keeps: a jetty and a slipway, a quay and a pier or two, or a walled port. */
export type HarbourSize = 'village' | 'town' | 'port';

export type HarbourKind = 'pier' | 'quay';

/** The boats a harbour keeps that nobody takes. */
export type BoatKind = 'rowboat' | 'fishing' | 'sailboat' | 'yacht' | 'sampan' | 'outrigger';

export interface Berth {
  /** The fleet's model moored here. */
  model: 'launch' | 'sailboat';
  /** Where it floats, a unit direction, and the way it faces. */
  at: THREE.Vector3;
  forward: THREE.Vector3;
}

/**
 * A surface a foot stands on: a rectangle of the frame, its height running
 * from `h0` at `z0` to `h1` at `z1`. A wooden deck is a roof from below: a
 * swimmer passes under it except at a ladder.
 */
export interface Deck {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h0: number;
  h1: number;
  kind: 'wood' | 'stone' | 'slip';
}

/** One strip of the waterfront quay: across `x0..x1`, from `back` (on the coast) out to the quay's face. */
export interface QuayStrip {
  x0: number;
  x1: number;
  back: number;
}

export interface Waterfront {
  strips: QuayStrip[];
  /** The face's line, `z`, the same for every strip. */
  face: number;
}

/** A wooden pier other than the main run, off the waterfront or the coast. */
export interface Pier {
  x: number;
  z0: number;
  z1: number;
  width: number;
}

/** A mole of blocks run out parallel to the main run, its head turned back across the basin's mouth. */
export interface Breakwater {
  x: number;
  z0: number;
  z1: number;
  width: number;
  /** Which way the head turns: towards the main run, `-sign(x)`. Its length across, 0 for none. */
  head: number;
}

/** A ramp down into the water, from `top` at `z0` to `foot` (under the surface) at `z1`. */
export interface Slip {
  x: number;
  z0: number;
  z1: number;
  width: number;
  top: number;
  foot: number;
}

/** A boat tied up or on a buoy: its middle, its heading (0 is along `out`), its size. */
export interface Mooring {
  kind: BoatKind;
  x: number;
  z: number;
  yaw: number;
  length: number;
  beam: number;
  /** Swinging on a buoy rather than tied alongside. */
  buoy: boolean;
  /** Drawn out of the water, on the slipway; its keel's height. */
  hauled?: number;
}

export interface Harbour {
  place: number;
  kind: HarbourKind;
  size: HarbourSize;
  region: RegionId;
  /** Where the run meets the coastline, a unit direction; the deck starts `LANDING` back from it. */
  root: THREE.Vector3;
  /** Out to sea along the run, and across it (`up x out`), unit tangents at `root`. */
  out: THREE.Vector3;
  across: THREE.Vector3;
  length: number;
  width: number;
  /** Where the main run's deck begins: back on the land, or at the waterfront's face. */
  runFrom: number;
  /** The deck's height over the sea's radius. */
  deck: number;
  berths: Berth[];
  waterfront: Waterfront | null;
  piers: Pier[];
  breakwater: Breakwater | null;
  slip: Slip | null;
  /** A hut on a platform of its own over the water, beside the main run (the tropics). */
  stilt: { x0: number; x1: number; z0: number; z1: number } | null;
  moorings: Mooring[];
  /** Channel buoys either side of the basin's mouth. */
  marks: { x: number; z: number; port: boolean }[];
  /** Every surface stood on, the pieces above as rectangles. */
  decks: Deck[];
  /** Where a swimmer climbs out onto a wooden deck. */
  ladders: { x: number; z: number }[];
  /** The farthest any piece reaches from `root`, in units. */
  extent: number;
}

/** Something already in the water, kept clear of. */
export interface Taken {
  at: THREE.Vector3;
  radius: number;
}
