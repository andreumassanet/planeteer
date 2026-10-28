/**
 * What the world emits after dark: lit windows, street lamps, headlights,
 * campfires, landmark floodlights, aviation beacons and the city lights seen
 * from the air. Re-exports the parts in `lights/`.
 */
export { lightBrightness, nightAt, setSunDirection } from './lights/night.ts';
export { HEAD_REACH, LAMPS_OFF_ABOVE, LAMP_FIELD, LAMP_POOL, NEAR_FIRES, NEAR_HEADLIGHTS, NEAR_LAMPS, bindNearLights, fireFlicker, nearLightsChunk, nearLightsGLSL, setHeadlights, setNearLamps } from './lights/near-lights.ts';
export { FIRE_GLOW_REACH, FIRE_STRIDE, MAX_FIRE_GLOWS, fireGlows, setFires } from './lights/fire-glow.ts';
export { bedtimeByte, bedtimeNever, lightWindows, poolAt, poolByte } from './lights/windows.ts';
export { FLOOD_CAP, FLOOD_COOL, FLOOD_CURVE_GLSL, FLOOD_FACING_GLSL, FLOOD_GOLD, FLOOD_SPAN, FLOOD_STRENGTH, FLOOD_STYLES, FLOOD_TARGET, FLOOD_WARM, floodAt, floodBytes, floodTint, floodTuning, glowBytes, lightMonuments, setLandmarkClock } from './lights/flood.ts';
export type { FloodStyle } from './lights/flood.ts';
export { MAX_BEACONS, createBeacons } from './lights/beacons.ts';
export type { Beacons } from './lights/beacons.ts';
export { createCityLights } from './lights/city-lights.ts';
export type { CityLights } from './lights/city-lights.ts';
