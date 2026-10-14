/**
 * What colour a point of ground is. Every colour is painted from the palette,
 * already through its chroma and value (a grey Moon is its palette greyed, once,
 * here). A crust takes its biome's colour shaded by craters; a cloud deck is
 * bands from the equator to the pole torn along a parallel by turbulence, with
 * billows of weather inside a band.
 */

import type { GroundSample } from '../../system/contract.ts';
import { fbm } from '../../system/noise.ts';
import type { WorldSpec } from '../contract.ts';
import type { CraterHit } from '../craters.ts';
import { grade, linearOf, smooth } from './color.ts';
import type { TerrainSample } from './types.ts';

/** How wide a billow of a cloud deck's weather is, units: a couple of kilometres. */
const MOTTLE = 2200;

/** Colours the sample `out` whose height, latitude and longitude are already set; `hit` is the crater field's answer there. */
export function createPainter(spec: WorldSpec, radius: number): (x: number, y: number, z: number, lat: number, lon: number, hit: CraterHit, out: TerrainSample) => void {
  const model = spec.body.ground;
  const deck = spec.ground === 'cloud-deck';
  const palette = spec.palette;
  const groundSample: GroundSample = { id: '', warmth: 0, second: 0, elevation: 0 };
  // Every colour the ground is painted from, already through the palette's
  // chroma and value.
  const graded = (hex: number): [number, number, number] => grade(linearOf(hex), palette.chroma, palette.value);
  const bands = palette.bands.map(graded);
  const base = graded(palette.base);
  /** What a billow's top whitens toward: the body's own white (`look.cap`). */
  const cap = graded(spec.body.look.cap);
  const biomeColor = new Map<string, [number, number, number]>();
  /** On a deck, only the biomes the palette names a colour for show through the bands. */
  const deckBiome = new Map<string, [number, number, number]>();
  if (model !== null) {
    for (const [id, biome] of Object.entries(model.biomes)) {
      biomeColor.set(id, graded(palette.biomes[id] ?? biome.color));
      if (palette.biomes[id] !== undefined) deckBiome.set(id, graded(palette.biomes[id]!));
    }
  }
  const tints = new Map<number, [number, number, number]>();
  const tintColor = (hex: number): [number, number, number] => {
    let found = tints.get(hex);
    if (found === undefined) tints.set(hex, (found = graded(hex)));
    return found;
  };
  const tintAt = { x: 0, y: 0, z: 0 };
  /** The palette's `tint`, laid over what `out` already holds. */
  function paint(x: number, y: number, z: number, lat: number, lon: number, out: TerrainSample): void {
    if (palette.tint === null) return;
    tintAt.x = x;
    tintAt.y = y;
    tintAt.z = z;
    const tint = palette.tint(tintAt, lat, lon, out.height);
    if (tint === null || !(tint.weight > 0)) return;
    const c = tintColor(tint.color);
    const w = Math.min(1, tint.weight);
    out.r += (c[0] - out.r) * w;
    out.g += (c[1] - out.g) * w;
    out.b += (c[2] - out.b) * w;
  }

  /** A deck: bands, torn along a parallel by the turbulence, with billows of weather inside each. */
  function paintDeck(x: number, y: number, z: number, lat: number, lon: number, out: TerrainSample): void {
    // Bands from the equator to the pole and back, torn along a parallel by the
    // turbulence; the whole list spans `bandSpan` degrees and then comes round.
    const n = bands.length;
    const tear = palette.turbulence * fbm(x * 3.1, y * 9.0, z * 3.1, 3) * 2.2;
    const f = (Math.abs(lat) / palette.bandSpan) * n + tear + n * 4;
    const i = Math.floor(f);
    const t = smooth(0.25, 0.75, f - i);
    const a = bands[i % n]!;
    const b = bands[(i + 1) % n]!;
    out.r = a[0] + (b[0] - a[0]) * t;
    out.g = a[1] + (b[1] - a[1]) * t;
    out.b = a[2] + (b[2] - a[2]) * t;
    // The weather inside a band: billows a couple of kilometres across
    // (`MOTTLE`) lighter and the lanes between them darker, and the tops of the
    // biggest whitened toward the cap.
    const k = radius / MOTTLE;
    const m = fbm(x * k, y * k * 1.6, z * k, 3);
    const fine = fbm(x * k * 5, y * k * 5, z * k * 5, 2);
    const light = 1 + 0.22 * m + 0.07 * fine;
    out.r *= light;
    out.g *= light;
    out.b *= light;
    const white = Math.max(0, m - 0.35) * 0.9;
    if (white > 0) {
      out.r += (cap[0] - out.r) * white;
      out.g += (cap[1] - out.g) * white;
      out.b += (cap[2] - out.b) * white;
    }
    // A deck with a ground model has biomes too (the decorations are scattered
    // by them), and a biome the palette names a colour for shows through.
    if (model !== null) {
      model.at(lat, lon, model.relief(lat, lon), groundSample);
      out.biome = groundSample.id;
      const over = deckBiome.get(groundSample.id);
      if (over !== undefined) {
        const w = palette.biomeBlend;
        out.r += (over[0] - out.r) * w;
        out.g += (over[1] - out.g) * w;
        out.b += (over[2] - out.b) * w;
      }
    }
    paint(x, y, z, lat, lon, out);
  }

  return (x, y, z, lat, lon, hit, out) => {
    let c = base;
    out.biome = null;
    if (deck) {
      paintDeck(x, y, z, lat, lon, out);
      return;
    }
    if (model !== null) {
      const elevation = model.relief(lat, lon);
      model.at(lat, lon, elevation, groundSample);
      out.biome = groundSample.id;
      c = biomeColor.get(groundSample.id) ?? base;
    }
    let shade = 1;
    if (hit.bowl > 0) shade *= 1 + (palette.craterFloor - 1) * Math.min(1, hit.bowl * 1.6);
    if (hit.ejecta > 0) shade *= 1 + (palette.ejecta - 1) * hit.ejecta;
    out.r = c[0] * shade;
    out.g = c[1] * shade;
    out.b = c[2] * shade;
    paint(x, y, z, lat, lon, out);
  };
}
