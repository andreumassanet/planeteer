// The colour of the ground: the biome, tinted by whose land it is, with the
// shore's sand and the snowline on top. The land mesh, the town floors, the
// roads' verges and the map tiles all colour ground through `groundShade`.

import * as THREE from 'three';
import type { World } from '../geo.ts';
import { reliefAt, shoreAt, shoreSample } from '../terrain.ts';
import { CONTINENT_COLORS, DEFAULT_LAND, PALETTE } from '../theme.ts';
import { BIOMES, biomeAt, biomeSample } from '../biome.ts';
import { latOf, lonOf } from '../sphere.ts';

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** How much of the country's own colour survives on top of the biome. */
const COUNTRY_TINT = 0.25;

/** Continent colour with a small stable per-country shift, so borders read. */
export function paletteFor(world: World): THREE.Color[] {
  return world.countries.map((country) => {
    let hash = 0;
    for (const ch of country.iso) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const color = new THREE.Color(CONTINENT_COLORS[country.continent] ?? DEFAULT_LAND);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(
      hsl.h + (((hash >> 3) % 13) - 6) * 0.004,
      hsl.s,
      hsl.l + (((hash >> 7) % 11) - 5) * 0.017,
    );
    return color;
  });
}

const shadeSample = biomeSample();
const shadeHsl = { h: 0, s: 0, l: 0 };
/** Lying snow: the `ice` biome's own white, so the snowline and the ice cap are one colour. */
const snowGround = new THREE.Color(BIOMES.ice.color);

const SHORE_SAND = PALETTE.sand;
/**
 * Warmth a shore needs before it is sand: none below `SHORE_WARM0`, all of it
 * from `SHORE_WARM1`. Warmth, rather than the ramp's width or the hinterland's
 * relief, is the gate that keeps sand out of Norway, Iceland and Patagonia.
 * The ramp under the colour is not gated: every shore slopes into its water.
 */
const SHORE_WARM0 = 0.30;
const SHORE_WARM1 = 0.50;
const shoreColor = new THREE.Color();
const shoreHsl = { h: 0, s: 0, l: 0 };
const shore = shoreSample();

/**
 * The colour of the ground at a point on the unit sphere with the given
 * `elevation`: the biome (lightness follows moisture and cover), the country's
 * `tint`, lying snow, then the shore's sand. `tint` is passed in because the
 * mesh calls this once per vertex and already knows which ring it is filling.
 */
export function groundShade(
  ux: number,
  uy: number,
  uz: number,
  elevation: number,
  tint: THREE.Color,
  target: THREE.Color,
): THREE.Color {
  const lat = latOf(uy);
  const lon = lonOf(ux, uz);
  biomeAt(ux, uy, uz, lat, lon, elevation, shadeSample);
  const biome = BIOMES[shadeSample.id];
  target.setHex(biome.color);
  target.getHSL(shadeHsl);
  // Moisture makes a biome a range rather than a swatch. Cover darkens ground
  // that has things growing on it, so the edge of a forest tile reads as a
  // change of density rather than of surface.
  target.setHSL(
    shadeHsl.h,
    shadeHsl.s,
    shadeHsl.l * (1.05 - 0.13 * shadeSample.moisture) * (1 - 0.2 * biome.cover),
  );
  target.lerp(tint, COUNTRY_TINT);
  // Snow is white whoever's it is, so it goes over the tint.
  if (shadeSample.snow > 0) target.lerp(snowGround, Math.min(1, shadeSample.snow * 1.6));

  // The shore goes on top of the country: a beach is the same sand whoever owns
  // it. Only asked below the shelf, the one place `reliefAt` is negative, which
  // is a free test for whether this point is on a shore at all.
  if (elevation < 0) shoreAt(ux, uy, uz, shore);
  else shore.fall = shore.sand = 0;
  const sand = shore.sand * smoothstep(SHORE_WARM0, SHORE_WARM1, shadeSample.warmth);
  if (sand > 0) {
    // Lightened against what it is laid on, so a desert coast still reads.
    shoreColor.setHex(SHORE_SAND).getHSL(shoreHsl);
    shoreColor.setHSL(shoreHsl.h, shoreHsl.s, Math.min(1, shoreHsl.l * 1.06));
    target.lerp(shoreColor, sand * smoothstep(0.25, 0.8, shore.fall));
  }
  return target;
}

const tintPalettes = new WeakMap<World, THREE.Color[]>();
const defaultTint = new THREE.Color(DEFAULT_LAND);
const groundUnit = new THREE.Vector3();

/**
 * What colour the land mesh is at a world-space point. Anything that lays a
 * surface on the land asks this so it meets the ground exactly. The relief is
 * sampled at the point rather than averaged over a triangle. Over water it
 * returns the biome with the default land tint.
 */
export function groundColorAt(
  world: World,
  point: THREE.Vector3,
  target: THREE.Color,
): THREE.Color {
  let palette = tintPalettes.get(world);
  if (palette === undefined) {
    palette = paletteFor(world);
    tintPalettes.set(world, palette);
  }
  groundUnit.copy(point).normalize();
  const country = world.countryAtPoint(point);
  const tint = country > 0 ? (palette[country - 1] ?? defaultTint) : defaultTint;
  return groundShade(
    groundUnit.x,
    groundUnit.y,
    groundUnit.z,
    reliefAt(groundUnit.x, groundUnit.y, groundUnit.z),
    tint,
    target,
  );
}
