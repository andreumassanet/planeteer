// The planet's land: the country outlines triangulated into one mesh, its
// colour, its shader marks and the weather on it. The parts live in `globe/`;
// this module is the entry point the rest of the game imports.

export { LAND_HEIGHT } from './geo.ts';
export { PLANET_RADIUS, UNITS_PER_DEGREE, angleForSag, onSphere } from './globe/planet.ts';
export { groundColorAt } from './globe/ground-color.ts';
export {
  GROUND_MARKS_GLSL,
  HEX_CELL,
  LUSH_GLSL,
  groundBrushChunk,
  groundPatchesChunk,
  lushOf,
  patchesOf,
} from './globe/ground-marks.ts';
export {
  LIE_COLD,
  LIE_WARM,
  WEATHER_REACH,
  bindGroundWeather,
  groundWeather,
  groundWeatherChunk,
  groundWeatherGLSL,
  lyingSnowAt,
  seasonalTemperature,
} from './globe/ground-weather.ts';
export { landFlagProxy, landFlags } from './globe/materials.ts';
export { buildLand } from './globe/land-mesh.ts';
export {
  LAND_GROUND_GLSL,
  LAND_SURFACE_GLSL,
  LAND_SURFACE_VERTEX_PARS,
  landBumpChunk,
  landSurfaceUniforms,
  landSurfaceVertex,
  madeLandChunk,
  rockAt,
} from './globe/land-surface.ts';
export { coastEdges, groundRadius } from './globe/coast.ts';
