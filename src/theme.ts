import * as THREE from 'three';

// Three's toon chunk reads only red. Our ramps carry RGB: keep the cool
// shadows and warm highlights, with the same single texture lookup everywhere.
THREE.ShaderChunk.gradientmap_pars_fragment = THREE.ShaderChunk.gradientmap_pars_fragment.replace(
  'vec3( texture2D( gradientMap, coord ).r )',
  'texture2D( gradientMap, coord ).rgb',
);

// Aerial perspective rather than a wall of haze: the fog still closes to
// nothing at `fog.far`, where every streamer's reach ends, but it comes in
// along a curve so the middle distance keeps its colour and the haze gathers
// far off. Every material that draws with fog reads this one chunk.
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  'float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );',
  'float fogFactor = pow( smoothstep( fogNear, fogFar, vFogDepth ), 1.6 );',
);

/**
 * Palette lifted from `static/palette.png` in Bruno Simon's folio-2025: 24
 * colours, one per band of a 128x4 texture. Sharing one palette makes
 * monuments built by different hands look like one world.
 */
export const PALETTE = {
  slate: 0x7c7691,
  sand: 0xebd1a3,
  darkOlive: 0x574e37,
  skyBlue: 0x3dbbe7,
  bone: 0xc8c2c1,
  bark: 0x4a413c,
  steel: 0x575a5e,
  blush: 0xeec3af,
  gold: 0xe4a90c,
  green: 0x91ad78,
  salmon: 0xe49a78,
  brown: 0x988165,
  olive: 0xabae2b,
  tan: 0xa49876,
  clay: 0xb36d45,
  orange: 0xe56202,
  red: 0xec3f1c,
  cream: 0xfde6e1,
  apricot: 0xf8a658,
  crimson: 0xc30e3a,
  violet: 0xc366ef,
  pink: 0xed719f,
  ink: 0x1e0603,
  white: 0xfff2e8,
} as const;

/**
 * Base colour per continent. Each continent reads as one mass and internal
 * borders show up only as a shift in tint.
 */
export const CONTINENT_COLORS: Record<string, number> = {
  Europe: PALETTE.green,
  Asia: PALETTE.olive,
  Africa: PALETTE.clay,
  'North America': PALETTE.tan,
  'South America': PALETTE.apricot,
  Oceania: PALETTE.salmon,
  Antarctica: PALETTE.cream,
  'Seven seas (open ocean)': PALETTE.sand,
};

export const DEFAULT_LAND = PALETTE.brown;

export const OCEAN_COLOR = 0x2b7fa8;
export const SKY_TOP = 0x6aa6e0;
const SKY_HORIZON = 0xe2ebef;
export const FOG_COLOR = 0xc8d7e1;

/**
 * The mosaic: how far one cell of a surface may stray from the colour the
 * surface was given, as a multiplier on RGB. A random factor per facet
 * (`[0.92, 1.045]` on land, `[0.95, 1.04]` on water, as in the reference) is
 * what makes the ground a soft mosaic rather than a flat fill. Read by the land
 * mesh's shader (`globe.ts`, per hex cell), a town's paving
 * (`scenery/ground.ts`, per cell on the CPU) and the water sphere (`ocean.ts`,
 * per face at build); none of them restates the number.
 *
 * It scales all three channels, never the saturation: a darker and greyer
 * patch reads as a shadow in this style. The land's range is asymmetric (a cell
 * can go paler by less than it can go darker before a green reads as
 * bleached), and the whole span stays below the contrast between neighbouring
 * lighting bands so the mosaic stays a texture on a band and never reads as a
 * second lighting.
 */
export const MOSAIC_LAND: readonly [number, number] = [0.93, 1.045];
export const MOSAIC_WATER: readonly [number, number] = [0.97, 1.03];

/**
 * A whole look, keyed to one moment of the day. `sun.ts` reads the real solar
 * elevation where you stand and blends between the three below.
 *
 * Night is a second art direction, not a lower number. The style rests on a
 * directional light stepping across the ramp, so dimming everything would
 * flatten it. What changes instead is which light does the stepping (the
 * moon), the colour of the steps, and how deep the darkest one cuts.
 */
export interface Mood {
  /** Sky dome: zenith, horizon, and the warm band around the sun's bearing. */
  skyTop: number;
  skyHorizon: number;
  skyGlow: number;
  /** How much of `skyGlow` the sun's own bearing gets. 0 at noon and midnight. */
  glow: number;
  /**
   * How much of the Milky Way the look allows, 0 to 1: the gain on the band the
   * dome paints (`sun.ts`). The stars are points (`night-sky.ts`) and come out by
   * the twilight ladder whatever this says; `sun.ts` multiplies this by the
   * ladder, the weather and the moon, so it is the art's share only.
   */
  stars: number;
  fog: number;
  ambient: number;
  ambientIntensity: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  /**
   * The sun, dimmed and reddened by the air it arrives through. The sun does not
   * change, but like the fog and the ambient this describes the air around you,
   * not the light in space; without it a dawn is bright, because
   * `MeshToonMaterial` samples its ramp at `dot(n, l) * 0.5 + 0.5` and ground
   * lit edge-on lands mid-ramp and takes 73% of full sunlight. `sun.ts` puts the
   * full 2.6 back as you climb, since from orbit there is no air and the day side
   * must read as day.
   */
  sun: number;
  sunIntensity: number;
  moon: number;
  moonIntensity: number;
  /**
   * The darkest band of the ramp, and what tints it. This decides whether a night
   * side exists at all: a surface facing away from a light still receives
   * `rampShadow` of it, so at 0.45 the far side of the planet would get 45% of
   * full sunlight. Dropping it carves the terminator, and is safe because
   * ambient and hemisphere fill are not routed through the ramp.
   */
  rampShadow: number;
  rampShadowTint: readonly [number, number, number];
  rampLightTint: readonly [number, number, number];
  /**
   * Curve of the bands between the shadow and the light, 1 being even steps. It
   * is 1 in all three moods; only `sun.ts` raises it, from the air.
   * `MeshToonMaterial` spends half its ramp on the unlit hemisphere, so with even
   * steps the first band past the terminator is 39% of full sun and the
   * day/night line from the plane's ceiling is a soft gradient. Bending the low
   * bands down sharpens it.
   */
  rampGamma: number;
}

/**
 * Cool shadow bands against warm sunlight give the facets depth without
 * another light or a post-processing pass. Ambient fill stays unchanged.
 */
export const DAY_MOOD: Mood = {
  skyTop: SKY_TOP,
  skyHorizon: SKY_HORIZON,
  skyGlow: 0xfff0d2,
  glow: 0,
  stars: 0,
  fog: FOG_COLOR,
  ambient: 0xffffff,
  ambientIntensity: 0.32,
  hemisphereSky: SKY_TOP,
  hemisphereGround: 0x5d6a3e,
  hemisphereIntensity: 0.35,
  sun: 0xfff0d8,
  sunIntensity: 2.6,
  moon: 0x9fb8e8,
  moonIntensity: 0,
  rampShadow: 0.38,
  rampShadowTint: [0.74, 0.84, 1],
  rampLightTint: [1, 0.97, 0.91],
  rampGamma: 1,
};

/**
 * Sunrise and sunset. The transition is keyed at three points rather than two
 * because a straight day-to-night blend passes through a muddy grey.
 */
export const TWILIGHT_MOOD: Mood = {
  skyTop: 0x4a5c96,
  skyHorizon: PALETTE.apricot,
  skyGlow: 0xf2661a,
  glow: 1,
  stars: 0,
  fog: 0xc98f86,
  ambient: 0xffb488,
  ambientIntensity: 0.24,
  hemisphereSky: 0xf09a5e,
  hemisphereGround: 0x4a3a3f,
  hemisphereIntensity: 0.3,
  sun: 0xff9a52,
  sunIntensity: 0.9,
  moon: 0xa8bce8,
  moonIntensity: 0.5,
  rampShadow: 0.17,
  rampShadowTint: [0.76, 0.80, 1],
  rampLightTint: [1, 0.96, 0.92],
  rampGamma: 1,
};

/**
 * Night. The cool tint is weighted to the dark end of the ramp (shadows go
 * blue, highlights stay near neutral) so the sunlit hemisphere still reads as
 * sunlit when seen from the plane's ceiling at night. The moon (0.6), the fill
 * and the ramp's floor are low: the moon gives the ramp a direction to step
 * across, and the lamps, windows and headlights are what you see by.
 */
export const NIGHT_MOOD: Mood = {
  skyTop: 0x0d1430,
  skyHorizon: 0x2a2f52,
  skyGlow: 0x3c4a7a,
  glow: 0,
  stars: 1,
  fog: 0x10152e,
  ambient: 0x8ea6de,
  ambientIntensity: 0.09,
  hemisphereSky: 0x35538f,
  hemisphereGround: 0x13161f,
  hemisphereIntensity: 0.18,
  sun: 0xfff0d8,
  sunIntensity: 0.15,
  moon: 0xbdd2ff,
  moonIntensity: 0.6,
  rampShadow: 0.05,
  rampShadowTint: [0.72, 0.84, 1],
  rampLightTint: [0.94, 0.97, 1],
  rampGamma: 1,
};

/**
 * What the light becomes on the way up. It is not `NIGHT_MOOD`: every number
 * there is a ground number, describing what a person standing outside at
 * midnight can see. From the plane's ceiling the same moon (0.9 in the mood
 * the numbers were first set in) made the night side 59% as bright as the day
 * side, so there was no terminator to look at.
 *
 * The moon is two thirds of that, and the one directional light left for the
 * ramp to step across, so it is reduced here rather than removed: from orbit
 * its job is to give the dark side a shape, not to read by, and a quarter of
 * its ground strength does that. The ramp floor is the other lever: the climb
 * restores the sun to its full 2.6 while relying on `rampShadow` to hide it,
 * so 0.08 of it lands on every surface facing away; 0.03 is 8% of daylight.
 *
 * The sky is absent on purpose. It keeps the local colours all the way up,
 * because what is left of it from the ceiling is the halo round the limb, and
 * at dawn that halo is the dawn.
 */
export interface OrbitLook {
  ambient: number;
  ambientIntensity: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  sun: number;
  sunIntensity: number;
  moon: number;
  moonIntensity: number;
  rampShadow: number;
  rampGamma: number;
  rampShadowTint: readonly [number, number, number];
  rampLightTint: readonly [number, number, number];
}

export const ORBIT_LOOK: OrbitLook = {
  ambient: NIGHT_MOOD.ambient,
  ambientIntensity: 0.05,
  hemisphereSky: NIGHT_MOOD.hemisphereSky,
  hemisphereGround: NIGHT_MOOD.hemisphereGround,
  hemisphereIntensity: 0.07,
  // The star, unattenuated: there is no air up here to redden or dim it.
  sun: DAY_MOOD.sun,
  sunIntensity: DAY_MOOD.sunIntensity,
  moon: NIGHT_MOOD.moon,
  moonIntensity: 0.22,
  rampShadow: 0.03,
  /**
   * Curve of the bands between the shadow and the light; only the climb raises
   * it above 1, which sharpens the day/night line seen from the ceiling.
   */
  rampGamma: 1.8,
  rampShadowTint: NIGHT_MOOD.rampShadowTint,
  rampLightTint: NIGHT_MOOD.rampLightTint,
};

/**
 * Every ramp ever handed out, so the mood can rewrite all of them at once.
 * Night is then a property of the theme, and a ramp created later (a monument
 * that streams in after dusk) is born with the mood already on it.
 */
const ramps: THREE.DataTexture[] = [];
let rampMood: Mood = DAY_MOOD;

/**
 * Texels in a ramp. It is a smooth curve sampled linearly; 64 texels hold it
 * to under a byte.
 */
const RAMP_TEXELS = 64;

/**
 * Where the light gives out, on the ramp's own axis (`dot(n, l) * 0.5 + 0.5`).
 * 0.5 would be Lambert's terminator; a little under it is a wrapped diffuse
 * (0.4 is a wrap of 0.2), so the light dies softly past the edge as a painted
 * hill's does.
 */
const RAMP_TERMINATOR = 0.4;

/**
 * The light over the ramp: nothing past the terminator, all of it facing the
 * sun, and between them a curve half way from linear to an ease, so the
 * shoulder of a hill turns over gently.
 */
function rampLight(t: number): number {
  const x = Math.min(1, Math.max(0, (t - RAMP_TERMINATOR) / (1 - RAMP_TERMINATOR)));
  return (x + x * x * (3 - 2 * x)) * 0.5;
}

function writeRamp(texture: THREE.DataTexture, mood: Mood): void {
  const data = texture.image.data as Uint8Array;
  for (let i = 0; i < RAMP_TEXELS; i++) {
    // The texel's centre, which is where a linear filter reads it exactly.
    const light = rampLight((i + 0.5) / RAMP_TEXELS);
    // Shadow is tinted rather than black: a painted shadow is a cooler colour,
    // never an absence of one.
    const v = 255 * (mood.rampShadow + (1 - mood.rampShadow) * light ** mood.rampGamma);
    for (let c = 0; c < 3; c++) {
      const tint = mood.rampShadowTint[c]! + (mood.rampLightTint[c]! - mood.rampShadowTint[c]!) * light;
      data[i * 4 + c] = Math.min(255, Math.round(v * tint));
    }
    data[i * 4 + 3] = 255;
  }
  texture.needsUpdate = true;
}

/**
 * The light ramp every lit surface shares. `MeshToonMaterial` uses it as a
 * lookup table from the angle to the sun to the light received, so the whole
 * world changes its light (the moods, the night, the climb) by rewriting a few
 * textures rather than every material. `steps` is kept for the callers and not
 * read.
 */
export function createToonRamp(_steps = 4): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array(RAMP_TEXELS * 4), RAMP_TEXELS, 1);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  writeRamp(texture, rampMood);
  ramps.push(texture);
  return texture;
}

/** Repaints every ramp in the world. Cheap: a handful of textures of 64 texels. */
export function setToonMood(mood: Mood): void {
  rampMood = mood;
  for (const ramp of ramps) writeRamp(ramp, mood);
}
