import * as THREE from 'three';

// Three's toon chunk reads only red. Our ramps carry RGB: keep the cool
// shadows and warm highlights, with the same single texture lookup everywhere.
THREE.ShaderChunk.gradientmap_pars_fragment = THREE.ShaderChunk.gradientmap_pars_fragment.replace(
  'vec3( texture2D( gradientMap, coord ).r )',
  'texture2D( gradientMap, coord ).rgb',
);

/**
 * Palette lifted from `static/palette.png` in Bruno Simon's folio-2025: 24
 * colours, one per band of a 128x4 texture. His whole site is painted with
 * these. Reusing them solves this project's hardest problem up front, which is
 * making hundreds of monuments built by different hands look like one world.
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
 * Base colour per continent. Handing out random colours per country turned the
 * planet into an unreadable mosaic; this way each continent reads as one mass
 * and internal borders show up only as a shift in tint.
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
export const SKY_TOP = 0x6fc9d8;
export const SKY_HORIZON = 0xfde6e1;
export const FOG_COLOR = 0xc6b6cf;

/**
 * The mosaic: how far one cell of a surface may stray from the colour the
 * surface was given, as a multiplier on RGB.
 *
 * The reference this look is chasing paints every triangle of its planet the
 * biome's colour times a random factor — `[0.92, 1.045]` on land, `[0.95,
 * 1.04]` on water, read from its code and not guessed — and that is the whole
 * of what makes its ground a soft mosaic of facets rather than a flat fill.
 * Three things here read these and none of them restates the number: the land
 * mesh's shader (`globe.ts`, per hex cell), a town's paving (`scenery/ground.ts`,
 * per cell on the CPU) and the water sphere (`ocean.ts`, per face at build).
 *
 * **A multiplier on RGB and never a change of saturation**, because a darker
 * *and greyer* patch of ground is what a shadow looks like in this style, and
 * the eye files it as one — see the road trap in `scenery/ground.ts`. Scaling
 * all three channels keeps the hue and moves only the lightness.
 *
 * The land's top is 1.045 and its bottom 0.93: asymmetric on purpose, since a
 * cell can go paler by less than it can go darker before a green reads as
 * bleached. The span here — 11.5% across the whole range — stays below the
 * contrast between neighbouring lighting bands:
 * the mosaic is meant to be a texture on a band, and a tone that stepped the
 * band by itself would read as a second lighting.
 */
export const MOSAIC_LAND: readonly [number, number] = [0.93, 1.045];
export const MOSAIC_WATER: readonly [number, number] = [0.97, 1.03];

/**
 * A whole look, keyed to one moment of the day. `sun.ts` reads the real solar
 * elevation where you stand and blends between the three below.
 *
 * Night is a second art direction, not a lower number. The style rests on a
 * directional light stepping across the ramp, so a night made by dimming
 * everything flattens the light and the cel bands disappear — the exact failure
 * the palette exists to avoid. What changes instead is *which* light does the
 * stepping (the moon), what colour the steps are, and how deep the darkest one
 * cuts.
 */
export interface Mood {
  /** Sky dome: zenith, horizon, and the warm band around the sun's bearing. */
  skyTop: number;
  skyHorizon: number;
  skyGlow: number;
  /** How much of `skyGlow` the sun's own bearing gets. 0 at noon and midnight. */
  glow: number;
  /** Star density, 0 or 1. They are drawn in the dome's shader, not as geometry. */
  stars: number;
  fog: number;
  ambient: number;
  ambientIntensity: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  /**
   * The sun, dimmed and reddened by the air it arrives through.
   *
   * It is one star and it does not change, so this is a lie — but it is the
   * same lie the fog and the ambient tell, and it is told for the same reason:
   * these three describe the air around *you*, not the light in space. Without
   * it a dawn is bright. `MeshToonMaterial` samples its ramp at
   * `dot(n, l) * 0.5 + 0.5`, so ground lit edge-on at sunrise lands in the
   * middle of the ramp and takes 73% of full sunlight — the terminator is drawn
   * across the *unlit* half of the ramp, which is no use to anyone standing on
   * the lit side of it. `sun.ts` puts the full 2.6 back as you climb, because
   * from orbit there is no air to attenuate anything and the day side must read
   * as day.
   */
  sun: number;
  sunIntensity: number;
  moon: number;
  moonIntensity: number;
  /**
   * The darkest band of the ramp, and what tints it.
   *
   * This is the single number that decides whether a night side exists at all.
   * `MeshToonMaterial` maps every angle onto the ramp, so a surface facing
   * *away* from a light still receives `rampShadow` of it — at the old day value of
   * 0.45 the far side of the planet gets 45% of full sunlight and there is no
   * night to fly over, only a dimmer day. Dropping it is what carves the
   * terminator, and it is safe to drop precisely because ambient and hemisphere
   * fill are not routed through the ramp: they hold the daylight shadows up.
   */
  rampShadow: number;
  rampShadowTint: readonly [number, number, number];
  rampLightTint: readonly [number, number, number];
  /**
   * Curve of the bands between the shadow and the light, 1 being even steps.
   *
   * It is 1 in all three moods and only `sun.ts` ever raises it, from the air.
   * `MeshToonMaterial` spends half its ramp on the unlit hemisphere, so with
   * even steps the first band past the terminator is 39% of full sun and the
   * day/night line seen from the plane's ceiling is a soft two-step gradient
   * rather than a line. Bending the low bands down sharpens it where the ramp
   * is no longer being asked to describe the shape of anything.
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
  skyGlow: PALETTE.cream,
  glow: 0,
  stars: 0,
  fog: FOG_COLOR,
  ambient: 0xffffff,
  ambientIntensity: 0.4,
  hemisphereSky: SKY_TOP,
  hemisphereGround: 0x6b5b47,
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
 * Sunrise and sunset, and the reason the transition is keyed at three points
 * rather than two: a straight day-to-night blend passes through a muddy grey
 * halfway, which is the one thing every dawn is not.
 */
export const TWILIGHT_MOOD: Mood = {
  skyTop: 0x4a5c96,
  skyHorizon: PALETTE.apricot,
  skyGlow: 0xf2661a,
  glow: 1,
  stars: 0.25,
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
 * Night. The cool tint is weighted to the dark end of the ramp — shadows go
 * blue, highlights stay near neutral — so that the sunlit hemisphere still
 * reads as sunlit when you are standing in the dark and looking at it from the
 * plane's ceiling. Tinting the whole ramp turned the day side of the planet
 * blue, which is a strange thing to see from a night flight.
 */
export const NIGHT_MOOD: Mood = {
  skyTop: 0x0d1430,
  skyHorizon: 0x2a2f52,
  skyGlow: 0x3c4a7a,
  glow: 0,
  stars: 1,
  fog: 0x161d3c,
  ambient: 0x8ea6de,
  ambientIntensity: 0.15,
  hemisphereSky: 0x35538f,
  hemisphereGround: 0x13161f,
  hemisphereIntensity: 0.3,
  sun: 0xfff0d8,
  sunIntensity: 0.25,
  moon: 0xbdd2ff,
  moonIntensity: 0.9,
  rampShadow: 0.08,
  rampShadowTint: [0.72, 0.84, 1],
  rampLightTint: [0.94, 0.97, 1],
  rampGamma: 1,
};

/**
 * What the light becomes on the way up, and it is **not** `NIGHT_MOOD`.
 *
 * The climb already blended towards the night mood, on the argument the day/night
 * section makes: ambient fill and a raised ramp floor are the *air* around you,
 * they are correct standing in the Sahara at noon, and from the ceiling they
 * light the night hemisphere as flatly as the day one. The argument was right
 * and the target was wrong, because **every number in `NIGHT_MOOD` is a ground
 * number** — it describes what a person standing outside at midnight can see,
 * and from two hundred kilometres up nobody is standing in it.
 *
 * Measured before this existed, at the ceiling over 40N 100E, same camera, the
 * same ground at local noon and at local midnight: **150.6 against 89.2 of mean
 * luminance, a contrast of 1.69.** A night side 59% as bright as the day side is
 * not a night, and there is no terminator in it to look at. Taking each light
 * out in turn against that 89.2:
 *
 * ```
 *   the moon           -36.3    NIGHT_MOOD.moonIntensity 0.9
 *   the sun's ramp floor -12.4  rampShadow 0.08 x sunIntensity 2.6 = 0.21
 *   ambient              -3.2
 *   hemisphere           -1.4
 * ```
 *
 * **The moon is two thirds of it**, and that is the number `NIGHT_MOOD` is least
 * able to give up: on the ground it is the whole reason night is a second look
 * rather than a dimmer, because it is the one directional light left for the
 * four-band ramp to step across. So it is not removed here, it is *reduced* —
 * from orbit the moon's job is to give the dark side a shape, not to let you
 * read by it, and a quarter of its ground strength does the first without the
 * second. The ramp floor is the other lever and it is the subtler one: the climb
 * restores the sun to its full 2.6 while relying on `rampShadow` to hide it, so
 * 0.08 of a 2.6 sun is 21% of full daylight landing on every surface facing
 * away. At 0.03 it is 8%.
 *
 * The sky is deliberately absent from this record. It keeps the *local* colours
 * all the way up, because what is left of it from the ceiling is the halo around
 * the limb — and at dawn that halo is the dawn.
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
   * it above 1.
   *
   * `MeshToonMaterial` spends half its ramp on the unlit hemisphere, so with
   * even steps the first band past the terminator is 39% of full sun and the
   * day/night line from the ceiling is a soft two-step gradient rather than a
   * line. Bending the low bands down sharpens it where the ramp is no longer
   * being asked to describe the shape of anything.
   */
  rampGamma: 1.8,
  rampShadowTint: NIGHT_MOOD.rampShadowTint,
  rampLightTint: NIGHT_MOOD.rampLightTint,
};

/**
 * Every ramp ever handed out, so the mood can rewrite all of them at once.
 *
 * The ramps are made in five places — the land, the monument context, the
 * avatar, the boat, the plane — and each is a separate 4x1 texture. Keeping the
 * list here means night is a property of the theme rather than something every
 * one of those files has to be taught about, and a ramp created later (a
 * monument that streams in after dusk) is born with the mood already on it.
 */
const ramps: { texture: THREE.DataTexture; steps: number }[] = [];
let rampMood: Mood = DAY_MOOD;

function writeRamp(texture: THREE.DataTexture, steps: number, mood: Mood): void {
  const data = texture.image.data as Uint8Array;
  for (let i = 0; i < steps; i++) {
    // Shadow is tinted rather than black: pure black kills the colour in cel
    // shading.
    const t = i / (steps - 1);
    const v = Math.round(255 * (mood.rampShadow + (1 - mood.rampShadow) * t ** mood.rampGamma));
    for (let c = 0; c < 3; c++) {
      const tint = mood.rampShadowTint[c]! + (mood.rampLightTint[c]! - mood.rampShadowTint[c]!) * t;
      data[i * 4 + c] = Math.round(v * tint);
    }
    data[i * 4 + 3] = 255;
  }
  texture.needsUpdate = true;
}

/**
 * Cel shading ramp. `MeshToonMaterial` uses it as a lookup table: instead of a
 * continuous gradient, light falls in steps. This is what turns crude geometry
 * into a deliberate drawing, and why we will be able to generate monuments in
 * code without them looking like mistakes.
 */
export function createToonRamp(steps = 4): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array(steps * 4), steps, 1);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  writeRamp(texture, steps, rampMood);
  ramps.push({ texture, steps });
  return texture;
}

/** Repaints every ramp in the world. Cheap: five textures of four texels. */
export function setToonMood(mood: Mood): void {
  rampMood = mood;
  for (const ramp of ramps) writeRamp(ramp.texture, ramp.steps, mood);
}
