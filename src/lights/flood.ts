/** Landmarks after dark: floodlit stone, lit parts and the Eiffel Tower's sparkle. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { BED_ALWAYS } from './night.ts';
import { lightWindows } from './windows.ts';

/**
 * The colour a landmark is floodlit in: `gold` most of the way to the palette's
 * warm white, the sodium-and-halogen of a floodlit facade. It tints the surface
 * and is never painted over it (`diffuseColor * FLOOD_WARM * strength`, the
 * rule the lamps' pools keep with `LAMP_LIGHT`), so floodlit sandstone is warm
 * sandstone and a copper statue stays green. A light is not a surface (see
 * `WINDOW_LIGHT`), so it is derived from the palette. Further to white than a
 * lamp's 0.45 because a facade is lit by many lamps from far off, and no whiter
 * than this or it reads as a photograph's white balance and not as night.
 */
export const FLOOD_WARM = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.5);

/**
 * The cool flood, for what is lit in white LED or metal-halide rather than
 * sodium: the glass-and-steel towers, the Statue of Liberty's pale green. The
 * palette's white a little towards `skyBlue`; next to the warm flood it only
 * has to read as not warm.
 */
export const FLOOD_COOL = new THREE.Color(PALETTE.white).lerp(new THREE.Color(PALETTE.skyBlue), 0.22);

/**
 * The gold flood: sodium, `gold` barely a third of the way to white, a window's
 * light (`WINDOW_LIGHT`) rather than a facade's. The Eiffel Tower is lit in it
 * from inside its own lattice; under `FLOOD_WARM` its brown came out a pastel
 * peach where every photograph of it is amber. Tokyo Tower's Landmark Light is
 * the same lamp.
 */
export const FLOOD_GOLD = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.3);

/**
 * A flood's colour for its `tint`, -1 gold through 0 warm to 1 cool: the CPU
 * side of the shader's mix, for the bake's normalisation and the checks.
 */
export function floodTint(tint: number, out: THREE.Color): THREE.Color {
  const t = Math.max(-1, Math.min(1, tint));
  return t < 0 ? out.copy(FLOOD_WARM).lerp(FLOOD_GOLD, -t) : out.copy(FLOOD_WARM).lerp(FLOOD_COOL, t);
}

/**
 * The most a floodlit surface is driven, per channel, in the scene's linear
 * light. It is under the bloom's threshold (`BLOOM_THRESHOLD` in `post.ts`,
 * held there by `pnpm check`) on purpose: an area driven to the clip becomes a
 * white tile, and a floodlit wall is a hundred times a pool's area. Under the
 * threshold the wall keeps its colour through the tone map and spills no halo;
 * only the small parts meant to shine (Big Ben's dials, Liberty's torch, a
 * beacon, the Eiffel's sparkle) go over it, through their own bytes.
 */
export const FLOOD_CAP = 0.85;

/**
 * What a floodlit landmark's surface averages, as the luminance of its own
 * colour under the flood times its strength: every landmark is normalised to
 * this at the bake (`bakeNight` in `landmark-lights.ts`), inside
 * `FLOOD_STRENGTH`'s bounds. One strength for all would not work because the
 * landmarks' colours span a factor of five in luminance (from Mount Yasur's
 * cinder at 0.087 to Marina Bay Sands at 0.484): a strength that makes the
 * Eiffel Tower read lit makes Marina Bay a white slab. A light building is
 * still lighter than a dark one; the curve and the facing below vary across it.
 */
export const FLOOD_TARGET = 0.3;

/**
 * The bounds on that normalised strength, and the span the byte carries it in:
 * a byte of 255 is `FLOOD_SPAN`. The floor keeps a white building from being
 * turned down to grey; the ceiling keeps a black one from becoming a lantern.
 * `pnpm check` reports any landmark that sits on either.
 */
export const FLOOD_STRENGTH: readonly [number, number] = [0.5, 3.5];
export const FLOOD_SPAN = 4;

/**
 * How a landmark is lit, as the code its `z` byte carries:
 *
 * - `ground`, the default: floodlights at the foot, aimed up. Brightest low and
 *   falling with height.
 * - `whole`: lit all over and nearly evenly, from inside the lattice (the Eiffel
 *   Tower) or by a facade of LEDs (the glass towers).
 * - `crown`: only the top is lit, from `from` up (the Empire State's crown,
 *   Christ the Redeemer over his dark mountain).
 * - `sparkle`: `whole`, and the Eiffel Tower's five minutes on the hour when
 *   `atlasSparkle` is up (`SPARKLE_SHARE`).
 */
export const FLOOD_STYLES = ['ground', 'whole', 'crown', 'sparkle'] as const;
export type FloodStyle = (typeof FLOOD_STYLES)[number];

/** How much of the ground flood is gone by the top, and where it starts to go. */
const GROUND_FALL = 0.8;
const GROUND_FROM = 0;
/** The whole flood's gentle fall to the top. */
const WHOLE_FALL = 0.22;
/** The crown's edge, in its own height fraction, and its fall to the tip. */
const CROWN_EDGE = 0.15;
const CROWN_FALL = 0.2;

/**
 * The flood's curve up a landmark, as GLSL of `h` (the height byte, 0 at the
 * foot) and `s` (the style's code, `FLOOD_STYLES`'s index).
 *
 * It is written once as text and is both the shader and the check's witness:
 * the fragment shader compiles it and `pnpm check` evaluates the same string as
 * JavaScript (with GLSL's `smoothstep`, `clamp` and `mix` beside it) against
 * `floodAt`, the CPU twin.
 */
export const FLOOD_CURVE_GLSL =
  `(s < 0.5 ? 1.0 - ${GROUND_FALL.toFixed(3)} * smoothstep(${GROUND_FROM.toFixed(3)}, 1.0, h)` +
  ` : (s > 1.5 && s < 2.5 ? smoothstep(0.0, ${CROWN_EDGE.toFixed(3)}, h) * (1.0 - ${CROWN_FALL.toFixed(3)} * h)` +
  ` : 1.0 - ${WHOLE_FALL.toFixed(3)} * h))`;

/** A face's share of the flood by which way it looks, 1 straight down to 0.2 straight up. */
const FACING_BASE = 0.58;
const FACING_TILT = 0.42;
const FACING_FLOOR = 0.2;

/**
 * The flood by which way a face looks, as GLSL of `up`, the cosine between its
 * normal and the local up. Light from below lights what looks down: a cornice's
 * soffit, the underside of a platform and the inside of an arch take the most
 * and a roof the least; a wall takes a little over half. Same one-string rule
 * as `FLOOD_CURVE_GLSL`.
 */
export const FLOOD_FACING_GLSL = `clamp(${FACING_BASE.toFixed(3)} - ${FACING_TILT.toFixed(3)} * up, ${FACING_FLOOR.toFixed(3)}, 1.0)`;

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * The CPU twin of the flood: how many times its own colour under the tint a
 * surface is driven, at height `h`, in style code `s`, facing `up`, with the
 * landmark's strength `k`, before the cap and before the night. For the checks,
 * which hold it to the shader's own text.
 */
export function floodAt(h: number, s: number, up: number, k: number): number {
  const curve =
    s < 0.5 ? 1 - GROUND_FALL * smooth(GROUND_FROM, 1, h) : s > 1.5 && s < 2.5 ? smooth(0, CROWN_EDGE, h) * (1 - CROWN_FALL * h) : 1 - WHOLE_FALL * h;
  const facing = Math.min(1, Math.max(FACING_FLOOR, FACING_BASE - FACING_TILT * up));
  return curve * facing * k;
}

/**
 * Writes one vertex's four flood bytes (`atlasFlood`) at `offset`: `h` its
 * height fraction, `k` the landmark's normalised strength (0 for unlit), the
 * style, and `tint`, -1 gold through 0 warm to 1 cool (`floodTint`). Here, for
 * `bedtimeByte`'s reason: the encoding is one thing, and the shader that reads
 * `y * FLOOD_SPAN` lives in this file.
 */
export function floodBytes(out: Uint8Array, offset: number, h: number, k: number, style: FloodStyle, tint: number): void {
  out[offset] = Math.round(Math.max(0, Math.min(1, h)) * 255);
  out[offset + 1] = Math.round(Math.max(0, Math.min(1, k / FLOOD_SPAN)) * 255);
  out[offset + 2] = FLOOD_STYLES.indexOf(style) * 85;
  out[offset + 3] = Math.round(Math.max(0, Math.min(1, (tint + 1) / 2)) * 255);
}

/**
 * A lit part's two `atlasLit` bytes at `offset`: a window's brightness, and a
 * bedtime that never comes (`BED_ALWAYS`), for a clock dial, a torch or a
 * plaza's lamps. `lightWindows` draws them, so a lit part is exactly a lit
 * window.
 */
export function glowBytes(out: Uint8Array, offset: number, strength: number): void {
  out[offset] = Math.round(Math.max(0, Math.min(1, strength)) * 255);
  out[offset + 1] = BED_ALWAYS;
}

/**
 * The Eiffel Tower's sparkle: bulbs flashing at random for the first five
 * minutes of every hour after dark. Drawn as hashed cells in the model's own
 * space, `SPARKLE_CELL` units across, of which `SPARKLE_SHARE` are lit in any
 * one of `SPARKLE_RATE` slots a second, each cell on its own phase. Brighter
 * than white, so the bloom takes every one: the one lit thing on a landmark
 * meant to be a point of light and not a surface.
 */
const SPARKLE_CELL = 0.55;
const SPARKLE_SHARE = 0.045;
const SPARKLE_RATE = 9;
const SPARKLE_LIGHT = new THREE.Color(PALETTE.white).lerp(new THREE.Color(PALETTE.skyBlue), 0.1).multiplyScalar(3.2);

/** The flood's tuning, live: `atlas.lights.flood` (see `main.ts`). */
const atlasFloodWarm = { value: FLOOD_WARM.clone() };
const atlasFloodCool = { value: FLOOD_COOL.clone() };
const atlasFloodGold = { value: FLOOD_GOLD.clone() };
const atlasFloodCap = { value: FLOOD_CAP };
const atlasFloodGain = { value: 1 };
/** 1 while the sparkle is on; `setLandmarkClock`. */
const atlasSparkle = { value: 0 };
/** Seconds, wrapped, for the sparkle's slots and the beacons' blink. */
export const atlasLandmarkTime = { value: 0 };

/**
 * The landmarks' lights' levers, for the console: the two tints, the cap, a
 * gain over every flood (the master `atlasGain` still multiplies it) and the
 * sparkle. Uniforms, so a change is on the next frame.
 */
export const floodTuning = {
  warm: atlasFloodWarm,
  cool: atlasFloodCool,
  gold: atlasFloodGold,
  cap: atlasFloodCap,
  gain: atlasFloodGain,
  sparkle: atlasSparkle,
};

/**
 * Once a frame: `seconds` is a running clock for the sparkle's slots and the
 * beacons' blink, and `sparkle` whether the sparkle is on. Wrapped to an hour
 * so the shaders' arithmetic stays in small numbers.
 */
export function setLandmarkClock(seconds: number, sparkle: number): void {
  atlasLandmarkTime.value = seconds % 3600;
  atlasSparkle.value = sparkle;
}

/**
 * Teaches the landmarks' one material (`placement.ts`) the night: everything
 * `lightWindows` gives a town (the near lamps, the headlights, the fires, and
 * the `atlasLit` glow, here a clock's dials, a torch and a plaza's lamp heads)
 * and a floodlight read from four bytes a vertex, `atlasFlood`: the height
 * fraction, the landmark's strength, its style and its light's colour.
 *
 * The flood is evaluated per fragment, never baked: a wall has vertices at its
 * corners only, so emission written on them would be one number for the whole
 * face. The height is linear up a wall, so the byte interpolates exactly, and
 * the curve, the facing and the cap run on the pixel.
 *
 * Per-landmark values are bytes, not uniforms, because every landmark is drawn
 * with this one material and a uniform set for one would apply to all (see
 * `fade.ts`). Uniforms hold what is the same for all: the tints, the cap, the
 * sparkle.
 *
 * It is chained after `lightWindows`' own hook, in braces, because that block
 * declares `atlasDark` and `atlasFlat` in `main()`'s scope, and after whatever
 * hook the material already had. The caller gives the material its own
 * `customProgramCacheKey`, or three keys the program on the hook's source and
 * two different hooks could share a program.
 */
export function lightMonuments(material: THREE.Material): void {
  const before = material.onBeforeCompile.bind(material);
  lightWindows(material);
  const windows = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    windows(shader, renderer);
    shader.uniforms.atlasFloodWarm = atlasFloodWarm;
    shader.uniforms.atlasFloodCool = atlasFloodCool;
    shader.uniforms.atlasFloodGold = atlasFloodGold;
    shader.uniforms.atlasFloodCap = atlasFloodCap;
    shader.uniforms.atlasFloodGain = atlasFloodGain;
    shader.uniforms.atlasSparkle = atlasSparkle;
    shader.uniforms.atlasLandmarkTime = atlasLandmarkTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec4 atlasFlood;
        varying vec4 vAtlasFlood;
        varying vec3 vAtlasModel;`,
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
        vAtlasFlood = atlasFlood;
        vAtlasModel = transformed;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 atlasFloodWarm;
        uniform vec3 atlasFloodCool;
        uniform vec3 atlasFloodGold;
        uniform float atlasFloodCap;
        uniform float atlasFloodGain;
        uniform float atlasSparkle;
        uniform float atlasLandmarkTime;
        varying vec4 vAtlasFlood;
        varying vec3 vAtlasModel;
        float atlasSparkHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.zyx + 31.32);
          return fract((p.x + p.y) * p.z);
        }`,
      )
      // The terminator at the landmark's own feet, as a window's: by day the block
      // is one multiply and a branch not taken.
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          float fd = atlasGain * atlasNight(vAtlasUp, atlasSun);
          if (fd > 0.0 && vAtlasFlood.y > 0.0) {
            float h = vAtlasFlood.x;
            float s = floor(vAtlasFlood.z * 3.0 + 0.5);
            float up = dot(normal, normalize(mat3(viewMatrix) * vAtlasUp));
            float k = vAtlasFlood.y * ${FLOOD_SPAN.toFixed(1)} * atlasFloodGain;
            float t = vAtlasFlood.w * 2.0 - 1.0;
            vec3 tint = t < 0.0 ? mix(atlasFloodWarm, atlasFloodGold, -t) : mix(atlasFloodWarm, atlasFloodCool, t);
            vec3 flood = diffuseColor.rgb * tint * (${FLOOD_CURVE_GLSL} * ${FLOOD_FACING_GLSL} * k);
            totalEmissiveRadiance += min(flood, vec3(atlasFloodCap)) * fd;
            if (s > 2.5 && atlasSparkle > 0.0) {
              vec3 q = vAtlasModel / ${SPARKLE_CELL.toFixed(3)};
              vec3 cell = floor(q);
              float seed = atlasSparkHash(cell);
              float slot = mod(floor(atlasLandmarkTime * ${SPARKLE_RATE.toFixed(1)} + seed * 17.0), 997.0);
              float roll = atlasSparkHash(cell + vec3(slot * 0.37, slot * 1.13, slot * 0.71));
              float spot = 1.0 - smoothstep(0.42, 0.62, length(q - cell - 0.5));
              totalEmissiveRadiance += vec3(${SPARKLE_LIGHT.r.toFixed(3)}, ${SPARKLE_LIGHT.g.toFixed(3)}, ${SPARKLE_LIGHT.b.toFixed(3)})
                * (step(${(1 - SPARKLE_SHARE).toFixed(3)}, roll) * spot * atlasSparkle * fd);
            }
          }
        }`,
      );
  };
}
