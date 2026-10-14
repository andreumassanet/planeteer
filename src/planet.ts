/**
 * What a walkable body is to the shared UI: the seam through which the HUD,
 * the maps, the navigation, the chat and the passport are handed a planet
 * other than Earth. Types only, and nothing from `src/system/`, since modules
 * in Earth's first load import it. Every option that takes one defaults to
 * Earth.
 *
 * A country of another world is `geo.ts`'s `Country` with a namespaced code
 * (`mars:tharsis`) and its own `color`; its flag is whatever painter was
 * registered for the prefix (`registerFlagPainter`). A settlement is a
 * `Place` with that code, `zone: ''` and `prominence` at `PROMINENCE_CAP`.
 * The passport keeps a nation's stamp under the same code and a town as
 * `mars:tharsis:Name`.
 */
import type { Color, Vector3 } from 'three';
import type { World } from './geo.ts';

/** A walkable body as the maps and the HUD see it. Earth has none: a module handed none reads `globe.ts` and `terrain.ts`. */
export interface PlanetSurface {
  /** `'mars'`, `'moon'`; Earth is `'earth'`. Keys the navigation's stored marker. */
  id: string;
  /** As the UI names it: *Mars*. */
  name: string;
  /** Sea level, in world units: Earth's `PLANET_RADIUS`. */
  radius: number;
  /** The body's real mean radius in kilometres, which every printed distance is measured on. */
  radiusKm: number;
  /** The highest ground over `radius`, units: the minimap counts altitude from it, so only flying widens the disc. */
  groundCeiling: number;
  /** Whether the body has water a traveller can be on: no sea, no *Open water*. */
  sea: boolean;
  /** What the place badge says over ground that belongs to nobody: *Open water* on Earth. */
  emptyLabel: string;
  /** The ground's colour under a unit direction, for the world map's paper. */
  colorAt(unit: Vector3, out: Color): Color;
  /** The relief in units under a point on the unit sphere, for the map's light: `terrain.ts`'s `reliefAt` shape. */
  reliefAt(x: number, y: number, z: number): number;
  /**
   * `globe.ts`'s `coastEdges` shape, a byte per point: 1 coast, 0 frontier,
   * 2 neither and not drawn (such as the cut between two rings of one nation).
   */
  coastEdges(world: World): Uint8Array[];
}

/** One other world's chapter in the passport, in the order the book shows them. Earth's is the book's own. */
export interface PassportChapter {
  /** The body's id, which is the prefix of every nation code in it: `'mars'`. */
  body: string;
  /** *Mars*. */
  name: string;
  /** The body's colour on its tab and its visa: its ground's `look.surface`. Cream when omitted. */
  color?: number;
  /** Every nation on it, in the order its visa lists them; `iso` is namespaced, `mars:tharsis`. */
  nations: readonly { iso: string; name: string; color: number }[];
  /** The species' writing, if any: a line of text as an SVG element with its own `viewBox`, for the seals. */
  script?: (text: string) => SVGElement;
}
