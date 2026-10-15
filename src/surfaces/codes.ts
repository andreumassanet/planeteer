/**
 * What a merged surface is made of: one byte a vertex, `atlasSurface`, which
 * the town's and the monuments' materials draw a pattern for over the flat
 * colour the vertex carries. 0 is a surface left as drawn.
 */
export const SURFACE = {
  none: 0,
  plaster: 1,
  brick: 2,
  stone: 3,
  timber: 4,
  concrete: 5,
  metal: 6,
} as const;
export type Surface = (typeof SURFACE)[keyof typeof SURFACE];
export type SurfaceName = keyof typeof SURFACE;

/** The byte a roof's vertices carry; the shader picks tiles, slates, terracotta or gravel by its slope and colour. */
export const ROOF = 8;

/** The byte a window pane carries: drawn as the room behind it (`ROOM_GLSL` in `settlements/surfaces.ts`). */
export const GLASS = 24;

/**
 * The byte a made face carries that is the land's own ground (a town's edge
 * slope, an outer yard): drawn by the land's own surface (`atlasLandGround`),
 * so it carries on the hillside round it.
 */
export const LAND_GROUND = 28;

/** The floor's bytes. */
export const FLOOR = {
  asphalt: 16,
  slabs: 17,
  cobbles: 18,
  paint: 19,
  riser: 20,
} as const;
