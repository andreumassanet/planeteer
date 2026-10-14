/** The terminator, windows' bedtimes and the shared uniforms every night light reads. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';

export const DEG = Math.PI / 180;

/**
 * Sun elevations the lights are keyed at, as the sine of the angle (what a dot
 * product against the local up already is). Full on by six degrees below the
 * horizon, the middle of civil twilight, and fully out two degrees above it;
 * both are inside the ninety minutes `sun.ts` spends blending its moods, so the
 * lights arrive while the sky is still changing.
 */
const NIGHT_FULL = Math.sin(-6 * DEG);
const NIGHT_NONE = Math.sin(2 * DEG);

/**
 * One GLSL function shared by the town material and the point field, so the
 * windows of a city and the halo over it come on at the same minute.
 */
export const NIGHT_CHUNK = /* glsl */ `
  float atlasNight(vec3 upDir, vec3 sunDir) {
    return 1.0 - smoothstep(${NIGHT_FULL.toFixed(6)}, ${NIGHT_NONE.toFixed(6)}, dot(upDir, sunDir));
  }

  /**
   * Local solar time at a point, in hours, running 12 (noon) to 36 (next noon)
   * so that an evening and the small hours after it are one increasing number.
   *
   * The terminator above cannot answer this: dot(up, sun) is the same at nine in
   * the evening and at three in the morning, and half of what a night city looks
   * like is the difference between those two. Longitude against the subsolar
   * meridian is the whole of it, and it is free — the planet is centred on the
   * origin, so a vertex's own position is its longitude.
   *
   * It is *solar* time and not the clock. src/timezone.ts exists because a clock
   * two hours off the player's wrist is a bug in a HUD; a window that goes dark
   * two hours early is not a thing anyone can catch.
   */
  float atlasSolarHour(vec3 upDir, float subsolarLon) {
    float lon = atan(-upDir.z, upDir.x);
    float h = 12.0 + (lon - subsolarLon) * 3.8197186;
    return h < 12.0 ? h + 24.0 : (h >= 36.0 ? h - 24.0 : h);
  }
`;

/**
 * The colour of made light. It is not a palette entry: `ctx.toon` refuses
 * anything outside `PALETTE`, which is right for surfaces, but a light is not a
 * surface (the sun disc, the moon and the dome's stars are likewise mixed
 * towards white) and a window at full palette `gold` reads as a painted panel.
 * `gold` a third of the way to the palette's own warm white.
 */
const WINDOW_LIGHT = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.34);

/**
 * How far over 1 a fully lit window is driven. It has to exceed 1 or the
 * windows read as paint: the lottery that gives a street its variety
 * (`WINDOW_DARK`, `WINDOW_LOW` and `INSTANCE_DIM` in `settlements.ts`)
 * multiplies the typical window down to about half. At gain 1 a window is a warm
 * grey on a night wall; at 2.4 the mean window is `(252, 212, 160)`, the
 * brightest saturate to a warm white and the dimmest still sit at
 * `(147, 122, 87)`. It is a constant in the shader because it is a property of
 * the look; `atlasGain` is the debug lever and multiplies it.
 */
export const WINDOW_GAIN = 2.4;

/**
 * When a window goes out, in local solar hours on `atlasSolarHour`'s clock:
 * 20.5 is half past eight in the evening and 27.5 half past three the next
 * morning. The hour is drawn from the window's own seed, so it costs one byte a
 * vertex and nothing per frame, and it is skewed early (`t^1.6`) because most
 * rooms go dark before midnight. `NEVER` is the share that stays on all night
 * (stairwells, shopfronts); without it a city is completely dark by four.
 */
export const BED_FROM = 20.5;
export const BED_TO = 27.5;
export const BED_NEVER = 0.12;
/** Hours the byte spans, so 18:00 is 0 and 34:00 is 255: a step of 3.75 minutes. */
export const BED_BASE = 18;
export const BED_SPAN = 16;
/** Encoded bedtimes past this are never reached, because dawn arrives first. */
export const BED_ALWAYS = 255;

/**
 * The city-light colour. It is more saturated than the window colour, not
 * less: an additive sprite pushed past 1 clips green and blue together with the
 * red and the light goes white. The alpha carries the brightness instead, and
 * `gold` barely mixed towards white is the amber that says sodium lamp from
 * two hundred kilometres up. (The ink pass must not draw these twice; see
 * `outline.ts`.)
 */
export const POINT_LIGHT = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.12);

/**
 * How hard the alpha is driven, so that a large city clips and a village does
 * not. Over 1 it saturates in the blend, which is the intended headroom: Tokyo
 * is a solid mark where a market town of six thousand is a speck.
 */
export const POINT_GAIN = 1.35;

/**
 * Shared uniforms. Module state, the way `theme.ts` owns every toon ramp: the
 * alternative is handing the sun to every file that emits light.
 */
export const atlasSun = { value: new THREE.Vector3(0, 1, 0) };
/** Longitude of the subsolar point, radians. The other half of the clock. */
export const atlasSubsolar = { value: 0 };
export const atlasLight = { value: WINDOW_LIGHT.clone() };
/** Master gain, so `atlas.lights.brightness(0)` is the A/B for the whole feature. */
export const atlasGain = { value: 1 };

/**
 * Called once a frame from `main.ts`, before the render. The direction says
 * whether a point is on the night side, which turns a light on; the subsolar
 * longitude says how far into that night it is, which turns one off again (see
 * `atlasSolarHour`).
 */
export function setSunDirection(direction: THREE.Vector3, subsolarLon: number): void {
  atlasSun.value.copy(direction);
  atlasSubsolar.value = subsolarLon * DEG;
}

/**
 * How far into the night a point is, 0 by day to 1 after dusk: `atlasNight`
 * above, for the one light drawn on the CPU's side (a lighthouse's beam in
 * `countryside-motion.ts`), so it comes on at the same minute as the windows
 * round it. The master gain rides on it.
 */
export function nightAt(up: THREE.Vector3): number {
  const t = Math.min(1, Math.max(0, (up.dot(atlasSun.value) - NIGHT_FULL) / (NIGHT_NONE - NIGHT_FULL)));
  return (1 - t * t * (3 - 2 * t)) * atlasGain.value;
}

export function lightBrightness(value?: number): number {
  if (value !== undefined) atlasGain.value = Math.max(0, value);
  return atlasGain.value;
}
