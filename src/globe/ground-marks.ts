// The ground's marks: the hex mosaic, the patches and the brush, as GLSL for the
// fragment stages and as JavaScript twins for the map's tiles. Everything here
// multiplies the colour `groundShade` produced and never restates it.

import * as THREE from 'three';
import { MOSAIC_LAND } from '../theme.ts';

/** The mosaic's hex cell, flat to flat, world units. Human scale: it does not move with the planet. */
export const HEX_CELL = 12;
/** The second octave: super-cells this many cells across, at half the amplitude. */
const HEX_SUPER = 4;

/** How far a cell leans its normal, degrees. Larger values turn plains into salt and pepper. */
const MOSAIC_TILT = 6;

/** How much of `MOSAIC_LAND`'s span the fine cells carry; the super-cells take the rest. */
const MOSAIC_FINE_SHARE = 2 / 3;

/**
 * The patches: ground a shade lusher or drier than its biome, in blots of value
 * noise in world space at two scales (units). Light moves by `PATCH_LIGHT`
 * either way; hue moves only where the ground is green.
 */
const PATCH_BROAD = 260;
export const PATCH_FINE = 75;
const PATCH_LIGHT = 0.22;

/**
 * The lie of the land: green ground a field's width or more across going to
 * straw where the blot is low and to a deeper green where it is high, at two
 * scales (units). It outlasts the patches into the distance, so a plain seen
 * from a hill is a quilt of greens and golds rather than one green.
 */
export const MACRO_BROAD = 1400;
const MACRO_FINE = 520;
const MACRO_DRY = 0.6;
const MACRO_LUSH = 0.45;
const MACRO_STRAW: [number, number, number] = [1.22, 1.06, 0.66];
const MACRO_DEEP: [number, number, number] = [0.82, 0.97, 0.88];

/** The brush: value noise at two scales (units) under the patches, so close-up ground is paint rather than a flat fill. */
export const BRUSH_BROAD = 16;
export const BRUSH_FINE = 4.5;
export const BRUSH_LIGHT = 0.1;

/** How much further from grey `atlasLush` takes a green, and how much darker. */
const LUSH_SATURATION = 1.5;
const LUSH_LIGHT = 0.8;

const [MOSAIC_LOW, MOSAIC_HIGH] = MOSAIC_LAND;

/**
 * The painted green: the ground's colour pushed off grey and down a shade where
 * it is green, and left alone where it is sand, rock or snow. The land and the
 * grass both draw their green through this, so a blade matches its field.
 */
export const LUSH_GLSL = /* glsl */ `
vec3 atlasLush(vec3 colour) {
  float green = clamp((colour.g - max(colour.r, colour.b)) / max(colour.g, 1e-3) * 4.0, 0.0, 1.0);
  float l = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  vec3 deep = max(vec3(0.0), vec3(l) + (colour - vec3(l)) * ${LUSH_SATURATION.toFixed(2)}) * ${LUSH_LIGHT.toFixed(2)};
  return mix(colour, deep, green);
}`;

/** `atlasLush`'s JS twin, for the map's tiles. Linear channels, in place. */
export function lushOf(colour: THREE.Color): THREE.Color {
  const { r, g, b } = colour;
  const green = Math.min(1, Math.max(0, ((g - Math.max(r, b)) / Math.max(g, 1e-3)) * 4));
  if (green <= 0) return colour;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const deep = (c: number): number => Math.max(0, l + (c - l) * LUSH_SATURATION) * LUSH_LIGHT;
  return colour.setRGB(r + (deep(r) - r) * green, g + (deep(g) - g) * green, b + (deep(b) - b) * green);
}

const fract = (x: number): number => x - Math.floor(x);

/** `atlasHash13`, in doubles: the GLSL's floats differ in the last bits, which a map cannot show. */
function hash13(x: number, y: number, z: number): number {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = fract(z * 0.1031);
  const d = px * (pz + 31.32) + py * (py + 31.32) + pz * (px + 31.32);
  px += d;
  py += d;
  pz += d;
  return fract((px + py) * pz);
}

/** `atlasNoise`'s twin: value noise on the integer lattice, smoothed. */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
  return mix(
    mix(mix(hash13(ix, iy, iz), hash13(ix + 1, iy, iz), fx), mix(hash13(ix, iy + 1, iz), hash13(ix + 1, iy + 1, iz), fx), fy),
    mix(mix(hash13(ix, iy, iz + 1), hash13(ix + 1, iy, iz + 1), fx), mix(hash13(ix, iy + 1, iz + 1), hash13(ix + 1, iy + 1, iz + 1), fx), fy),
    fz,
  );
}

const step = (e0: number, e1: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

/** `atlasMacro`'s JS twin. Linear channels, in place. */
export function macroOf(colour: THREE.Color, x: number, y: number, z: number): THREE.Color {
  let lie = noise3(x / MACRO_BROAD, y / MACRO_BROAD, z / MACRO_BROAD) * 0.7
    + noise3(x / MACRO_FINE + 3.7, y / MACRO_FINE + 3.7, z / MACRO_FINE + 3.7) * 0.3;
  lie = Math.min(1, Math.max(0, (lie - 0.5) * 2.2 + 0.5));
  const { r, g, b } = colour;
  const green = Math.min(1, Math.max(0, ((g - Math.max(r, b)) / Math.max(g, 1e-3)) * 4));
  if (green <= 0) return colour;
  const dry = step(0.45, 0.05, lie) * green * MACRO_DRY;
  const lush = step(0.55, 0.95, lie) * green * MACRO_LUSH;
  const [sr, sg, sb] = MACRO_STRAW;
  const [dr, dg, db] = MACRO_DEEP;
  let tr = r + (r * sr - r) * dry;
  let tg = g + (g * sg - g) * dry;
  let tb = b + (b * sb - b) * dry;
  tr += (tr * dr - tr) * lush;
  tg += (tg * dg - tg) * lush;
  tb += (tb * db - tb) * lush;
  return colour.setRGB(tr, tg, tb);
}

/**
 * `atlasPatches`' JS twin: the blots a shade lusher or drier than the biome,
 * at a world-space point (units). For the map's tiles, which ask it on their
 * colour lattice, so a field on the map is the blot it is on the ground.
 */
export function patchesOf(colour: THREE.Color, x: number, y: number, z: number): THREE.Color {
  macroOf(colour, x, y, z);
  let blot = noise3(x / PATCH_BROAD, y / PATCH_BROAD, z / PATCH_BROAD) * 0.65
    + noise3(x / PATCH_FINE + 17, y / PATCH_FINE + 17, z / PATCH_FINE + 17) * 0.35;
  blot = Math.min(1, Math.max(0, (blot - 0.5) * 2.4 + 0.5));
  const { r, g, b } = colour;
  const green = Math.min(1, Math.max(0, ((g - Math.max(r, b)) / Math.max(g, 1e-3)) * 4));
  const light = 1 + (blot - 0.5) * PATCH_LIGHT * 2;
  let tr = r * light;
  let tg = g * light;
  let tb = b * light;
  const dry = step(0.5, 0.1, blot) * green;
  tr += (tr * 0.8 - tr) * dry;
  tg += (tg * 0.95 - tg) * dry;
  tb += (tb * 0.78 - tb) * dry;
  const lush = step(0.5, 0.9, blot) * green;
  tr += (tr * 1.18 - tr) * lush;
  tg += (tg * 1.08 - tg) * lush;
  tb += (tb * 0.72 - tb) * lush;
  return colour.setRGB(tr, tg, tb);
}

/**
 * Hash, hex cell, cell tone, lean, value noise and patches, as functions both
 * fragment stages call. The hash is Dave Hoskins' sine-free one: `sin` at the
 * magnitude of a cell id is vendor-dependent.
 */
export const GROUND_MARKS_GLSL = /* glsl */ `
float atlasHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec3 atlasHash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
vec2 atlasHexCell(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 c = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? c.xy : c.zw + 0.5;
}
// The plane the cells are tiled in: the dominant axis of the position.
vec2 atlasPlaneOf(vec3 pos) {
  vec3 a = abs(pos);
  return (a.y >= a.x && a.y >= a.z) ? pos.xz : (a.x >= a.z ? pos.zy : pos.xy);
}
float atlasCellTone(vec2 plane, out vec2 cell) {
  cell = atlasHexCell(plane * ${(1 / HEX_CELL).toFixed(8)});
  vec2 group = atlasHexCell(plane * ${(1 / (HEX_CELL * HEX_SUPER)).toFixed(8)});
  return ${((MOSAIC_LOW + MOSAIC_HIGH) / 2).toFixed(5)}
    + (atlasHash(cell) - 0.5) * ${((MOSAIC_HIGH - MOSAIC_LOW) * MOSAIC_FINE_SHARE).toFixed(5)}
    + (atlasHash(group + vec2(0.37, 0.71)) - 0.5) * ${((MOSAIC_HIGH - MOSAIC_LOW) * (1 - MOSAIC_FINE_SHARE)).toFixed(5)};
}
// The cell's lean, on a view-space normal; see \`MOSAIC_TILT\`.
vec3 atlasLeanOf(vec3 normal, vec2 cell, float amount) {
  // A direction of the cell's own, world space into view space by the view
  // matrix alone — the camera carries no scale — then flattened onto the
  // face, so the lean is at most MOSAIC_TILT whatever the hash returned.
  vec3 lean = mat3(viewMatrix) * normalize(atlasHash3(cell) * 2.0 - 1.0);
  lean -= normal * dot(lean, normal);
  return normalize(normal + lean * (${Math.tan((MOSAIC_TILT * Math.PI) / 180).toFixed(5)} * amount));
}
float atlasHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float atlasNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(atlasHash13(i), atlasHash13(i + vec3(1, 0, 0)), f.x),
        mix(atlasHash13(i + vec3(0, 1, 0)), atlasHash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(atlasHash13(i + vec3(0, 0, 1)), atlasHash13(i + vec3(1, 0, 1)), f.x),
        mix(atlasHash13(i + vec3(0, 1, 1)), atlasHash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
vec3 atlasMacro(vec3 colour, vec3 pos) {
  // Only green ground moves, so the noise is not paid for anywhere else.
  float green = clamp((colour.g - max(colour.r, colour.b)) / max(colour.g, 1e-3) * 4.0, 0.0, 1.0);
  if (green <= 0.0) return colour;
  float lie = atlasNoise(pos * ${(1 / MACRO_BROAD).toFixed(8)}) * 0.7
    + atlasNoise(pos * ${(1 / MACRO_FINE).toFixed(8)} + 3.7) * 0.3;
  lie = clamp((lie - 0.5) * 2.2 + 0.5, 0.0, 1.0);
  // Reversed as one minus the rising step: GLSL leaves a falling pair undefined.
  colour = mix(colour, colour * vec3(${MACRO_STRAW.map((v) => v.toFixed(2)).join(', ')}), (1.0 - smoothstep(0.05, 0.45, lie)) * green * ${MACRO_DRY.toFixed(2)});
  return mix(colour, colour * vec3(${MACRO_DEEP.map((v) => v.toFixed(2)).join(', ')}), smoothstep(0.55, 0.95, lie) * green * ${MACRO_LUSH.toFixed(2)});
}
// The blots alone, over a colour the lie of the land has already moved.
vec3 atlasBlots(vec3 colour, vec3 pos) {
  float blot = atlasNoise(pos * ${(1 / PATCH_BROAD).toFixed(8)}) * 0.65
    + atlasNoise(pos * ${(1 / PATCH_FINE).toFixed(8)} + 17.0) * 0.35;
  // A sum of smoothed lattice values huddles round a half; spread it back out.
  blot = clamp((blot - 0.5) * 2.4 + 0.5, 0.0, 1.0);
  float green = clamp((colour.g - max(colour.r, colour.b)) / max(colour.g, 1e-3) * 4.0, 0.0, 1.0);
  vec3 tinted = colour * (1.0 + (blot - 0.5) * ${(PATCH_LIGHT * 2).toFixed(3)});
  tinted = mix(tinted, tinted * vec3(0.8, 0.95, 0.78), smoothstep(0.5, 0.1, blot) * green);
  return mix(tinted, tinted * vec3(1.18, 1.08, 0.72), smoothstep(0.5, 0.9, blot) * green);
}
vec3 atlasPatches(vec3 colour, vec3 pos) {
  return atlasBlots(atlasMacro(colour, pos), pos);
}`;

/**
 * The patches alone, for a material that draws some ground but is not the
 * land's: `diffuseColor` at the world position `pos` (a GLSL expression) run
 * through `atlasPatches` — the lie of the land, then the blots — each faded
 * out where a pixel covers a good share of its finer octave. Needs `GROUND_MARKS_GLSL` in the fragment shader.
 */
export function groundPatchesChunk(pos: string): string {
  return /* glsl */ `{
    vec2 atlasPatchPlane = atlasPlaneOf(${pos});
    float atlasPatchFoot = max(length(dFdx(atlasPatchPlane)), length(dFdy(atlasPatchPlane)));
    // Two noises a pixel, and none at all where they would be mixed in at nothing.
    float atlasPatchShare = 1.0 - smoothstep(${(PATCH_FINE * 0.1).toFixed(1)}, ${(PATCH_FINE * 0.4).toFixed(1)}, atlasPatchFoot);
    float atlasMacroShare = 1.0 - smoothstep(${(MACRO_BROAD * 0.08).toFixed(1)}, ${(MACRO_BROAD * 0.3).toFixed(1)}, atlasPatchFoot);
    if (atlasMacroShare > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, atlasMacro(diffuseColor.rgb, ${pos}), atlasMacroShare);
    if (atlasPatchShare > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, atlasBlots(diffuseColor.rgb, ${pos}), atlasPatchShare);
  }`;
}

/** The brush alone, for a material that draws some ground. Needs `GROUND_MARKS_GLSL`. */
export function groundBrushChunk(pos: string): string {
  return /* glsl */ `{
    vec2 atlasBrushPlane = atlasPlaneOf(${pos});
    float atlasBrushFoot = max(length(dFdx(atlasBrushPlane)), length(dFdy(atlasBrushPlane)));
    float atlasBrushAt = 1.0 - smoothstep(${(BRUSH_BROAD * 0.15).toFixed(2)}, ${(BRUSH_BROAD * 0.6).toFixed(2)}, atlasBrushFoot);
    if (atlasBrushAt > 0.0) {
      float atlasBrushStroke = atlasNoise(${pos} * ${(1 / BRUSH_BROAD).toFixed(6)}) * 0.6
        + atlasNoise(${pos} * ${(1 / BRUSH_FINE).toFixed(6)} + 7.3) * 0.4;
      diffuseColor.rgb *= 1.0 + (atlasBrushStroke - 0.5) * ${(BRUSH_LIGHT * 2).toFixed(3)} * atlasBrushAt;
    }
  }`;
}
