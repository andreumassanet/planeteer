/**
 * What a body is to the UI: the narrow seam through which the HUD, the two
 * maps, the navigation, the chat and the passport are handed a planet that is
 * not Earth.
 *
 * **Types only, and nothing from `src/system/`.** This file is imported by
 * modules in Earth's first load, so it may carry no value and reach for no
 * module of the other worlds; `import type` keeps it out of the bundle. Every
 * option that takes one of these defaults to Earth, and omitted, the module
 * behaves exactly as it did before the seam existed.
 *
 * The signatures the shared UI takes, in one place:
 *
 * ```ts
 * // hud.ts: the badge names ground nobody owns `surface.emptyLabel`; `leave` is a button on the pause card
 * createHud(world, { surface?, leave?: { label: string; run(): void }, ...HudOptions }): Hud      // hud.dispose()
 * // minimap.ts: radius, km and the altitude floor off the surface
 * createMinimap(world, { surface?, ...MinimapOptions }): Minimap                                   // minimap.dispose()
 * // map.ts: the paper painted with surface.colorAt / reliefAt / coastEdges; pass `monuments: []`, `roads: []`
 * createWorldMap(world, { surface?, monuments, roads?, ...WorldMapOptions }): WorldMap             // map.dispose()
 * // navigation.ts: the marker kept under markerKeyOf(surface.id) unless `markerKey` says otherwise
 * createNavigation({ minimap, hud, groundAt, countryAt?, storage?, surface?, markerKey? }): Navigation  // navigation.dispose()
 * markerKeyOf(body: string): string                                                                // 'earth' -> 'atlas.marker.v1'
 * // places.ts: `Nearby.km` measured on the body's own radius
 * indexPlaces(all: readonly Place[], radius: number, radiusKm = 6371): Places
 * // flags.ts: every `prefix:...` key drawn by `paint` inside a clipped box; returns the unregister
 * registerFlagPainter(prefix: string, paint: (ctx, key, x, y, w, h) => void): () => void
 * // talk.ts: the speech bubble alone; Earth's `createTalk` drives one
 * createBubble(): Bubble   // { root, show(who, line: Node | string, meant, { action?, lang?, rtl?, typed? }?),
 *                          //   reveal(count), shown, length, place(x, y, visible), hide(), dispose() }
 * // passport-card.ts: a chapter a world after Earth's; an array, or a function asked on first opening
 * createPassportCard({ ...PassportCardOptions, chapters?: readonly PassportChapter[] | (() => readonly PassportChapter[] | Promise<readonly PassportChapter[]>) })
 * // and, each with an AbortController behind it:
 * chat.dispose(), settings.dispose(), playerList.dispose(), passportCard.dispose(), talk.dispose()
 * ```
 *
 * A country of another world is `geo.ts`'s `Country` with a namespaced code
 * (`mars:tharsis`) and its own `color`; `cartography.ts` paints it in that
 * colour where Earth's are painted by continent. Its flag is whatever painter
 * was registered for the prefix before the first flag was asked for. A
 * settlement is a `Place` with that code, `zone: ''` and `prominence` at
 * `PROMINENCE_CAP`. The passport keeps a nation's stamp under the same code
 * (`passport.ts`'s `isStampKey`, `worldOf`) and a town as `mars:tharsis:Name`.
 */
import type { Color, Vector3 } from 'three';
import type { World } from './geo.ts';

/**
 * A walkable body as the maps and the HUD see it. Earth's is never built: a
 * module handed none reads `globe.ts` and `terrain.ts` directly.
 */
export interface PlanetSurface {
  /** `'mars'`, `'moon'`; Earth is `'earth'`. Keys the navigation's stored marker. */
  id: string;
  /** As the UI names it: *Mars*. */
  name: string;
  /** Sea level, in world units: Earth's `PLANET_RADIUS`. */
  radius: number;
  /** The body's real mean radius in kilometres, which every printed distance is measured on. */
  radiusKm: number;
  /**
   * Sea level plus the highest ground the body has, in units over `radius`:
   * the floor the minimap counts altitude from, so a mountain never widens the
   * disc and taking off always does.
   */
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
   * Which edges of each ring are coast and which a frontier: `globe.ts`'s
   * `coastEdges` shape, a byte a point, 1 for a coast and 0 for a frontier —
   * and 2 for an edge that is neither and is not drawn, such as the straight
   * cut between two rings of one nation on a walked world.
   */
  coastEdges(world: World): Uint8Array[];
}

/**
 * One world's chapter in the passport. Earth's is the book's own and is never
 * one of these; every other walkable body hands the card one, in the order the
 * book takes them.
 */
export interface PassportChapter {
  /** The body's id, which is the prefix of every nation code in it: `'mars'`. */
  body: string;
  /** *Mars*. */
  name: string;
  /** The body's colour on its tab and its visa: its ground's `look.surface`. Cream when omitted. */
  color?: number;
  /** Every nation on it, in the order its visa lists them; `iso` is namespaced, `mars:tharsis`. */
  nations: readonly { iso: string; name: string; color: number }[];
  /**
   * The species' writing, when it has one: a line of text as an SVG element
   * framed by its own `viewBox`. A seal is ringed with the nation's name in it.
   */
  script?: (text: string) => SVGElement;
}
