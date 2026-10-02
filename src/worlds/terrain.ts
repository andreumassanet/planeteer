/**
 * The ground of another world: the **one** definition of how high it is and
 * what colour, which the tiles draw, the foot stands on, the settlements are
 * seated by and the check samples.
 *
 * It is Earth's arrangement one level out — `reliefAt` is the one definition
 * of the relief and everything reads it — and it is built from the spec rather
 * than written per world:
 *
 * ```
 *   height = body relief * planetScale     (src/system's GroundModel: the map)
 *          + detail octaves                 (walking-scale bumps)
 *          + craters                        (craters.ts: a field, not a list)
 *          + features                       (the planet file's own functions)
 *   then levelled toward each settlement's and landmark's pad
 * ```
 *
 * Heights are units **above the body's walkable radius**, which for a giant is
 * the 1-bar level the cloud deck rolls on.
 *
 * ## What the foot stands on is what is drawn
 *
 * The mesh is a grid of triangles and the field between its vertices is not
 * flat; on Earth the difference buried a foot or floated it (`land-probe.ts`).
 * So `groundAt` does not answer the field: it answers the **finest tile's
 * triangle** under the point, interpolated between three of the field's own
 * vertices exactly as the mesh is. Near the player the finest tile is the one
 * drawn, so the foot and the drawing agree to the float.
 */

import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import { townRadii } from '../system/contract.ts';
import { createCraters } from './craters.ts';
import type { CraterHit } from './craters.ts';
import { surfaceRadiusOf } from '../system/contract.ts';
import type { GroundSample } from '../system/contract.ts';
import { fbm } from '../system/noise.ts';
import { latOf, lonOf, toUnit } from '../sphere.ts';
import { FINEST_DECK, FINEST_TILE, TILE_SEGMENTS, faceDir, facePoint, levelsFor } from './cube.ts';
import type { FacePoint } from './cube.ts';

/** Everything one point of ground is. Reused: `sample` fills it. */
export interface TerrainSample {
  height: number;
  lat: number;
  lon: number;
  /** 0 to 1, from the crater field. */
  bowl: number;
  ejecta: number;
  /** The body's biome here, or null where it has no ground model. */
  biome: string | null;
  /** Linear RGB, before slope and light. */
  r: number;
  g: number;
  b: number;
}

/** A disc levelled for something built: a settlement or a landmark. */
export interface Pad {
  id: string;
  /** Unit vector of its centre. */
  x: number;
  y: number;
  z: number;
  /** Built radius, units, and how far the levelling reaches. */
  radius: number;
  reach: number;
  /** The ground's height at the centre before any levelling: where the pad's plane touches. */
  height: number;
  /** Cosines of `radius` and `reach` as angles, for the cheap test. */
  cosInner: number;
  cosOuter: number;
}

export interface Terrain {
  readonly spec: WorldSpec;
  /** Walkable radius, units. */
  readonly radius: number;
  /** The quadtree's depth and the finest grid's step in face coordinates. */
  readonly levels: number;
  readonly pads: readonly Pad[];
  /** Generous bounds on the height anywhere, for bounding spheres and the check. */
  readonly low: number;
  readonly high: number;
  /** The field: height over the radius at a unit direction. */
  heightAt(x: number, y: number, z: number): number;
  /** The field and everything about it, colour included. */
  sample(x: number, y: number, z: number, out: TerrainSample): TerrainSample;
  /** The drawn surface: the finest grid's triangle under a direction (unit or not). */
  groundAt(x: number, y: number, z: number): number;
  /** The pad a direction stands in, if any. */
  padAt(x: number, y: number, z: number): Pad | null;
  /**
   * Ground kept bare of what lies about: a launch pad past a town's edge
   * (`rocket.ts`). Registered before the tiles round it are decorated.
   */
  keepBare(x: number, y: number, z: number, radius: number): void;
  /** Whether a direction is on bare ground: a town's pad or a kept clearing. */
  bareAt(x: number, y: number, z: number): boolean;
}

export const newSample = (): TerrainSample => ({ height: 0, lat: 0, lon: 0, bowl: 0, ejecta: 0, biome: null, r: 1, g: 1, b: 1 });

const linear = new Map<number, [number, number, number]>();
const scratchColor = new THREE.Color();
/** A palette hex as linear RGB, which is what a vertex colour is. */
export function linearOf(hex: number): [number, number, number] {
  let found = linear.get(hex);
  if (found === undefined) {
    scratchColor.setHex(hex);
    found = [scratchColor.r, scratchColor.g, scratchColor.b];
    linear.set(hex, found);
  }
  return found;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function createTerrain(spec: WorldSpec): Terrain {
  const body = spec.body;
  const radius = surfaceRadiusOf(body.radiusKm);
  const relief = spec.relief;
  const model = body.ground;
  const planetScale = model === null ? 0 : relief.planetScale;
  const craters = createCraters(spec.ground === 'cloud-deck' ? null : relief.craters, radius);
  const deck = spec.ground === 'cloud-deck';
  const palette = spec.palette;
  const levels = levelsFor(radius, deck ? FINEST_DECK : FINEST_TILE);

  const hit: CraterHit = { bowl: 0, ejecta: 0 };
  const groundSample: GroundSample = { id: '', warmth: 0, second: 0, elevation: 0 };

  /** The field before any pad: what a pad is levelled to. */
  function raw(x: number, y: number, z: number, lat: number, lon: number): number {
    let h = 0;
    if (planetScale !== 0) h += model!.relief(lat, lon) * planetScale;
    for (const d of relief.detail) {
      const k = radius / d.wavelength;
      const octaves = d.octaves ?? 3;
      const share = d.ridged ?? 0;
      // One noise a band, folded for the ridged share rather than asked for
      // twice: `1 - 2|n|` creases where `n` crosses zero, which is what
      // `ridged` does octave by octave, at half the cost, and the tiles spend
      // most of their build in this loop.
      const n = fbm(x * k, y * k, z * k, octaves);
      h += ((1 - share) * n + share * (0.65 - 2 * Math.abs(n))) * d.amplitude;
    }
    h += craters.at(x, y, z, hit);
    for (const feature of relief.features) h += feature({ x, y, z }, lat, lon);
    return h;
  }

  // The pads: every settlement and landmark, levelled to its own centre.
  const pads: Pad[] = [];
  const unit = [0, 0, 0];
  const addPad = (id: string, lat: number, lon: number, built: number): void => {
    toUnit(lat, lon, unit);
    const [x, y, z] = unit as [number, number, number];
    const reach = built * relief.padReach;
    pads.push({
      id,
      x,
      y,
      z,
      radius: built,
      reach,
      height: raw(x, y, z, lat, lon),
      cosInner: Math.cos(built / radius),
      cosOuter: Math.cos(reach / radius),
    });
  };
  const built = townRadii(body, spec.landmarks);
  for (const place of body.settlements) addPad(place.id, place.lat, place.lon, built.get(place.id)!);
  for (const landmark of spec.landmarks) addPad(landmark.id, landmark.lat, landmark.lon, landmark.radius);
  if (relief.padGrade !== undefined && relief.padGrade > 0) widenOnSlopes(relief.padGrade);

  /**
   * A pad on a slope reaches as far as the land needs to come back to it at
   * `grade`: the worst rise or fall between the pad's plane and the raw ground
   * eight ways round, at the default reach, sets the run. Then no two pads may
   * meet, so where two widened pads would, both give back what they gained in
   * proportion — never below the default reach, which the layout already
   * keeps apart.
   */
  function widenOnSlopes(grade: number): void {
    const p = { x: 0, y: 0, z: 0 };
    const wanted = pads.map((pad) => {
      const out = tangentOf(pad);
      let worst = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const along = pad.reach / radius;
        const c = Math.cos(along);
        const sn = Math.sin(along);
        p.x = pad.x * c + (out.e.x * Math.cos(a) + out.n.x * Math.sin(a)) * sn;
        p.y = pad.y * c + (out.e.y * Math.cos(a) + out.n.y * Math.sin(a)) * sn;
        p.z = pad.z * c + (out.e.z * Math.cos(a) + out.n.z * Math.sin(a)) * sn;
        worst = Math.max(worst, Math.abs(raw(p.x, p.y, p.z, latOf(p.y), lonOf(p.x, p.z)) - pad.height));
      }
      return Math.min(pad.radius * 4, Math.max(pad.reach, pad.radius + worst / grade));
    });
    const reach = [...wanted];
    for (let a = 0; a < pads.length; a++) {
      for (let b = a + 1; b < pads.length; b++) {
        const A = pads[a]!;
        const B = pads[b]!;
        const d = Math.acos(Math.min(1, A.x * B.x + A.y * B.y + A.z * B.z)) * radius;
        if (d >= reach[a]! + reach[b]!) continue;
        const room = Math.max(0, d - A.reach - B.reach) * 0.98;
        const gainA = reach[a]! - A.reach;
        const gainB = reach[b]! - B.reach;
        const share = gainA + gainB > 0 ? room / (gainA + gainB) : 0;
        reach[a] = A.reach + Math.min(gainA, gainA * share);
        reach[b] = B.reach + Math.min(gainB, gainB * share);
      }
    }
    pads.forEach((pad, k) => {
      pad.reach = reach[k]!;
      pad.cosOuter = Math.cos(pad.reach / radius);
    });
  }

  function level(h: number, x: number, y: number, z: number): number {
    for (const pad of pads) {
      const dot = x * pad.x + y * pad.y + z * pad.z;
      if (dot <= pad.cosOuter) continue;
      const w = smooth(pad.cosOuter, pad.cosInner, dot);
      // Level means **a plane**, the one tangent to the sphere at the pad's
      // centre, and not a constant height: a town is built on a flat floor in
      // its own frame, and over a 150-unit town on Mars the sphere falls 1.3
      // units away from that floor at the edge. Levelled to the plane, every
      // building, paving stone and person the town stands up in its own
      // frame is on the ground, and the foot finds the same plane.
      const plane = (radius + pad.height) / dot - radius;
      h += (plane - h) * w;
    }
    return h;
  }

  function heightAt(x: number, y: number, z: number): number {
    const lat = latOf(y);
    const lon = lonOf(x, z);
    return level(raw(x, y, z, lat, lon), x, y, z);
  }

  // Every colour the ground is painted from, already through the palette's
  // chroma and value: a grey Moon is its palette greyed, once, here.
  const graded = (hex: number): [number, number, number] => grade(linearOf(hex), palette.chroma, palette.value);
  const bands = palette.bands.map(graded);
  const base = graded(palette.base);
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

  function sample(x: number, y: number, z: number, out: TerrainSample): TerrainSample {
    const lat = latOf(y);
    const lon = lonOf(x, z);
    const h = level(raw(x, y, z, lat, lon), x, y, z);
    out.height = h;
    out.lat = lat;
    out.lon = lon;
    out.bowl = hit.bowl;
    out.ejecta = hit.ejecta;
    let c = base;
    out.biome = null;
    if (deck) {
      // Bands from the equator to the pole and back, torn along a parallel by
      // the turbulence: the stripes a giant is drawn in. The whole list spans
      // `bandSpan` degrees and then comes round again.
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
      // A deck with a ground model has biomes too — which is what the
      // decorations are scattered by — and a biome the palette names a
      // colour for shows through the bands.
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
      return out;
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
    return out;
  }

  // The finest grid, for `groundAt`.
  const step = 2 / ((1 << levels) * TILE_SEGMENTS);
  const point: FacePoint = { face: 0, u: 0, v: 0 };
  const corner = { x: 0, y: 0, z: 0 };
  const cornerHeight = (face: number, i: number, j: number): number => {
    faceDir(face, -1 + i * step, -1 + j * step, corner);
    return heightAt(corner.x, corner.y, corner.z);
  };

  function groundAt(x: number, y: number, z: number): number {
    facePoint(x, y, z, point);
    const gu = (point.u + 1) / step;
    const gv = (point.v + 1) / step;
    const last = (1 << levels) * TILE_SEGMENTS - 1;
    const i = Math.min(last, Math.max(0, Math.floor(gu)));
    const j = Math.min(last, Math.max(0, Math.floor(gv)));
    const fu = gu - i;
    const fv = gv - j;
    const a = cornerHeight(point.face, i, j);
    const c = cornerHeight(point.face, i + 1, j + 1);
    // The diagonal runs from (i, j) to (i+1, j+1), as the tiles wind it.
    if (fu >= fv) {
      const b = cornerHeight(point.face, i + 1, j);
      return a + fu * (b - a) + fv * (c - b);
    }
    const d = cornerHeight(point.face, i, j + 1);
    return a + fv * (d - a) + fu * (c - d);
  }

  // The bare spots, hashed by a coarse lattice of latitude and longitude so
  // a road's tens of thousands of them cost a lookup and not a scan. A spot is
  // kept in every cell its disc reaches.
  const BARE_CELL = 0.5;
  const bare = new Map<number, { x: number; y: number; z: number; cos: number }[]>();
  const cellOf = (lat: number, lon: number): number => Math.floor((lat + 90) / BARE_CELL) * 4096 + Math.floor((((lon % 360) + 540) % 360) / BARE_CELL);
  function keepBare(x: number, y: number, z: number, reach: number): void {
    const length = Math.hypot(x, y, z) || 1;
    const spot = { x: x / length, y: y / length, z: z / length, cos: Math.cos(reach / radius) };
    const lat = latOf(spot.y);
    const lon = lonOf(spot.x, spot.z);
    const span = ((reach / radius) * 180) / Math.PI;
    const widen = 1 / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    for (let dLat = -span; dLat <= span + BARE_CELL; dLat += BARE_CELL) {
      for (let dLon = -span * widen; dLon <= span * widen + BARE_CELL; dLon += BARE_CELL) {
        const key = cellOf(Math.max(-90, Math.min(89.999, lat + dLat)), lon + dLon);
        const list = bare.get(key);
        if (list === undefined) bare.set(key, [spot]);
        else if (list[list.length - 1] !== spot) list.push(spot);
      }
    }
  }
  function bareAt(x: number, y: number, z: number): boolean {
    if (padAt(x, y, z) !== null) return true;
    const length = Math.hypot(x, y, z) || 1;
    const list = bare.get(cellOf(latOf(y / length), lonOf(x, z)));
    if (list === undefined) return false;
    for (const spot of list) if ((x * spot.x + y * spot.y + z * spot.z) / length > spot.cos) return true;
    return false;
  }

  function padAt(x: number, y: number, z: number): Pad | null {
    const length = Math.hypot(x, y, z) || 1;
    for (const pad of pads) {
      if ((x * pad.x + y * pad.y + z * pad.z) / length > pad.cosInner) return pad;
    }
    return null;
  }

  // Bounds: what the body's relief can reach, the detail's amplitudes, the
  // craters' depth. Features are the planet file's and get a generous margin.
  let detail = 0;
  for (const d of relief.detail) detail += d.amplitude * 1.2;
  const reliefTop = model === null ? 0 : sampleMax(model.relief) * planetScale;
  const featureMargin = relief.features.length > 0 ? radius * 0.05 : 0;

  return {
    spec,
    radius,
    levels,
    pads,
    low: -detail + craters.low - featureMargin,
    high: reliefTop + detail + craters.high + featureMargin,
    heightAt,
    sample,
    groundAt,
    padAt,
    keepBare,
    bareAt,
  };
}

/**
 * A colour taken toward its own grey by `chroma` (1 keeps it, 0 is grey) and
 * multiplied by `value`, in linear light. The grey is the colour's luminance,
 * so a greyed palette keeps its lights and darks: bone stays pale and slate
 * stays dark, which is all a Moon's ground is.
 */
export function grade(c: readonly [number, number, number], chroma: number, value: number): [number, number, number] {
  const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return [
    Math.max(0, (luma + (c[0] - luma) * chroma) * value),
    Math.max(0, (luma + (c[1] - luma) * chroma) * value),
    Math.max(0, (luma + (c[2] - luma) * chroma) * value),
  ];
}

/** Two unit tangents at a pad's centre. */
function tangentOf(pad: { x: number; y: number; z: number }): { e: { x: number; y: number; z: number }; n: { x: number; y: number; z: number } } {
  const ref = Math.abs(pad.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const d = ref.x * pad.x + ref.y * pad.y + ref.z * pad.z;
  const n = { x: ref.x - pad.x * d, y: ref.y - pad.y * d, z: ref.z - pad.z * d };
  const ln = Math.hypot(n.x, n.y, n.z);
  n.x /= ln;
  n.y /= ln;
  n.z /= ln;
  const e = { x: n.y * pad.z - n.z * pad.y, y: n.z * pad.x - n.x * pad.z, z: n.x * pad.y - n.y * pad.x };
  return { e, n };
}

/** The highest a relief function reaches over a coarse sweep, padded by a tenth. */
function sampleMax(relief: (lat: number, lon: number) => number): number {
  let top = 0;
  for (let lat = -88; lat <= 88; lat += 4) {
    for (let lon = -180; lon < 180; lon += 4) top = Math.max(top, relief(lat, lon));
  }
  return top * 1.1 + 1;
}
