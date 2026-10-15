/**
 * What a merged surface is made of, and how it is drawn: the codes a vertex
 * carries (`atlasSurface`), the patterns the materials paint over its flat
 * colour, which faces are walls, roof or trim, and the material hook. The
 * towns (`settlements/surfaces.ts`), the countryside's buildings
 * (`countryside-tile/flats.ts`) and the monuments (`placement/surfaces.ts`)
 * draw with it; a machine's paint and a person's clothes take its finish
 * (`surfaces/finish.ts`).
 */
export { FLOOR, GLASS, LAND_GROUND, ROOF, SURFACE } from './surfaces/codes.ts';
export type { Surface, SurfaceName } from './surfaces/codes.ts';
export { SURFACE_GLSL } from './surfaces/patterns.ts';
export { MARK, ROOF_SHARE, UPRIGHT, WALL_SHARE, colourKey, faceAreas, majorColours, paneCornersOf, surfaceMarks } from './surfaces/mask.ts';
export { ROOM_GLSL } from './surfaces/room.ts';
export { glassOf, surfaceBytes } from './surfaces/bytes.ts';
export { finishCloth, finishPaint } from './surfaces/finish.ts';
export type { SurfaceBytes } from './surfaces/bytes.ts';
export type { FaceAreas } from './surfaces/mask.ts';
export {
  BUMP_GAIN,
  BUMP_MOST,
  BUMP_REACH,
  SURFACE_QUALITY_GLSL,
  bindSurfaceQuality,
  drawSurfaces,
  surfaceDetailChunk,
} from './surfaces/material.ts';
