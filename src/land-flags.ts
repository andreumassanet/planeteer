/**
 * Each country's flag, laid over its own land, at an opacity you can set.
 *
 * **It is not a texture and there is no image anywhere in it.** `flags.ts`
 * already draws all 234 flags from the specs in `flag-data.ts`, so the design
 * of every flag is in this repo as vector layers rather than as an asset. What
 * this file does is rasterise one of those into a scratch canvas *on the CPU*,
 * read it back once, and use it to decide the colour of a land triangle. The
 * canvas never reaches the GPU and no sampler is bound: what ships to the card
 * is a **second** `Uint8` vertex-colour attribute beside the one the land mesh
 * has always had, and one uniform that says how much of it to use. That is the
 * only arrangement that keeps the two rules this project is built on — no
 * external assets, and one flat colour per face.
 *
 * The consequences of doing it that way are worth stating, because three of
 * them decide the whole shape of the file:
 *
 * - **The cel banding cannot be lost, whatever the opacity is.** The bands come
 *   from `MeshToonMaterial` stepping a four-band ramp across `dot(n, l)` and
 *   multiplying the diffuse colour by it. Changing the diffuse changes *what* is
 *   being stepped, never *whether* it steps. What a heavy wash actually costs is
 *   the biome underneath — see `DEFAULT_OPACITY` for the number that was
 *   measured and the yardstick it was measured against.
 * - **Nothing is paid until it is asked for.** `globe.ts` reaches this module
 *   through a dynamic `import()`, so neither it nor `flags.ts` nor the 2,091
 *   lines of `flag-data.ts` are in the initial graph — which is the trap
 *   `main.ts` writes down about the twelve preloaded chunks. By the time anyone
 *   presses the key the chunk is already in the browser's cache, because
 *   `hud.ts` and `map.ts` pull the same one for the chip and the world map.
 *   The 11 MB attribute is the same bargain a level down: it is built the first
 *   time the player is high enough to see it, in slices under a frame budget.
 * - **The blend is a uniform and not a buffer.** The flag fades in with
 *   altitude, so the opacity changes every frame of a climb; rewriting the
 *   mesh's colours at that rate is 11 MB a frame. See `createFlagLayer`.
 */
import { Uint8BufferAttribute } from 'three';
import type * as THREE from 'three';
import type { LandRing, World } from './geo.ts';
import { drawFlagAt, hasFlag } from './flags.ts';

const DEG = Math.PI / 180;

/**
 * One ring's triangles, in the order `buildLand` emitted them.
 *
 * The alternative was a country index per triangle, and it is a megabyte of
 * `Uint16` that is wrong on both counts: the mesh is already grouped — a ring's
 * surface, then the wall under its boundary, then the next ring — so what has
 * to be recorded is 1,556 pairs of integers and not 1.28 million of them, and
 * the *ring* is a sharper answer than the country because it is the ring, not
 * the country, that decides which flag box a piece of land falls in. Spain has
 * two of those and the Canaries are the reason.
 */
export interface RingSpan {
  ring: LandRing;
  /** First and last-plus-one triangle of the ring's own surface. */
  surface: readonly [number, number];
  /** And of the wall under its boundary, which is that surface a shade down. */
  wall: readonly [number, number];
}

/** What `buildLand` leaves on the mesh for this file to find. */
export interface LandFlagData {
  spans: RingSpan[];
  /** The shade `buildLand` gives a coastal wall, so the flag takes the same one. */
  wallShade: number;
}

/**
 * How far outside the mainland's own box a ring may sit and still be painted
 * with the mainland's flag, as a fraction of that box's own width and height.
 *
 * **This is the whole projection decision and it was measured rather than
 * chosen.** A flag is a rectangle and a country is not, so the reference the
 * user gave — the Spanish flag clipped to the outline of Spain, the three bands
 * running at constant latitude right across it — is a flag stretched over a
 * lon/lat bounding box. That works for one landmass and falls apart the moment a
 * country has two: Spain's box including the Canaries runs from lat 27.6 to
 * 43.8, which squeezes the mainland into the top half of its own flag and puts
 * the yellow band through the Bay of Biscay.
 *
 * So a country is not one box, it is a **family** of rings around its largest
 * one, plus a box of its own for every ring too far away to belong. Measured
 * over the 1,322 secondary rings on the planet, as *how far outside the
 * principal ring's box each one's centre falls, in units of that box's own
 * size*:
 *
 * ```
 *   0        0-0.1   0.1-0.25   0.25-0.5   0.5-1   1-4    4+
 *   663      147     91         107        158     100    56
 * ```
 *
 * The interesting thing is not the shape of that histogram, it is where the
 * named cases land in it, because the gap between "just off the coast" and
 * "an overseas territory" is enormous:
 *
 * ```
 *   Mallorca and Ibiza    0.000     Svalbard              0.52
 *   Sardinia              0.000     Hawaii                0.53
 *   Sicily                0.049     Alaska                0.57
 *   Menorca               0.062     Sumatra               0.82
 *   Corsica               0.071     the Canaries     0.90-1.05
 *   Rhodes                0.205     the Galapagos    1.48-1.85
 *   Crete                 0.218     Madeira               2.29
 *   Hokkaido              0.244     the Azores       4.90-6.65
 * ```
 *
 * 0.35 is anywhere in that gap. It puts the Balearics, Corsica, Sicily,
 * Sardinia, Crete, Rhodes and Hokkaido on their mainland's own flag — which is
 * exactly the continuation the reference picture draws across the Balearics —
 * and gives the Canaries, the Azores, Madeira, the Galapagos, Svalbard, Alaska
 * and Hawaii a whole flag each, which is what the user asked for when they
 * noticed the Canaries were missing from the picture. **It is not a tuned
 * number**: 380 rings of 1,322 fly their own flag at 0.35, 421 at 0.25 and 314
 * at 0.5, and not one of the named cases above changes side anywhere between
 * 0.25 and 0.50.
 */
const FAMILY_MARGIN = 0.35;

/**
 * The flag raster, in pixels. 3:2, which is what `flags.ts` says the specs are
 * authored for.
 *
 * It is sampled per *triangle*, so the resolution that matters is not this one:
 * Spain's box is 12.6 degrees across and the land triangles in it run 50 to 250
 * units, which is 10 to 50 of them from coast to coast. 192 is far more than
 * that everywhere except Russia, whose box is 153 degrees wide and where one
 * pixel is 220 units — about one triangle. There is no case where making this
 * bigger would show.
 */
const FLAG_W = 192;
const FLAG_H = 128;

/**
 * How much of the flag is laid over the biome, 0 to 1.
 *
 * **The yardstick is the cel ramp's own faintest step**, and that is the whole
 * of the argument. `DAY_MOOD` gives a four-band ramp of `0.45, 0.633, 0.817,
 * 1.0`, so the smallest step the light itself makes is the top one — and
 * `ambientIntensity` 0.4 plus `hemisphereIntensity` 0.35 are *not* routed
 * through the ramp, so on screen that step arrives as
 * `2.6 * 0.183 / (2.6 * 0.817 + 0.75)` = **16.6% of relative luminance**. A
 * colour edge weaker than that is a smaller change than the light already makes
 * across a hillside, and the eye files it as shading — which is the same trap
 * `GROUND_STYLES` writes down about a dark road, and the same one that made the
 * old border band invisible.
 *
 * Both sides are linear in the opacity, so there is nothing to solve once both
 * have been measured. Both were, on the real thing rather than on a model:
 *
 * - **the flag delivers `opacity` times its own contrast.** Every one of the 228
 *   flags was rasterised at the size this file samples it and the relative
 *   luminance step across each adjacent pixel pair taken: the *median edge
 *   inside a flag* is 0.79, and 0.41 at the tenth percentile. So the tenth-
 *   percentile flag clears 16.6% at an opacity of **0.40**.
 * - **the ground keeps `1 - opacity` of its own.** Measured off the land mesh's
 *   own colour attribute, p5 to p95 within each of 167 countries: median
 *   **0.62** relative — Spain 0.62, Brazil 0.61, Algeria 0.61, Australia 0.66,
 *   China 0.69, India 0.93, Russia 1.04, Norway 1.19, Chile 1.20. So the median
 *   country's ground still steps harder than the light does up to **0.73**.
 *
 * 0.40 to 0.73 is the window, and 0.60 is not the middle of it — it is the point
 * where the two margins are **equal**: `0.60 * 0.41 = 0.246` against
 * `0.40 * 0.62 = 0.248`, both a little over one and a half ramp steps. Neither
 * side is being asked to give up more than the other, and there is no number in
 * it that was chosen by eye.
 *
 * Two things the measurement does not cover and they point opposite ways.
 * Kazakhstan's flag is gold on sky blue, whose luminance edge is **0.11** — it
 * separates in hue, which a luminance test cannot see, so the floor above is
 * pessimistic for it. And a country with no biome range at all (Iceland,
 * Rwanda, Armenia all measure 0.00, being one biome from end to end) has
 * nothing for the wash to take, so the ceiling is generous for them.
 *
 * **That study priced a wash you stand on, and the layer is no longer that.**
 * Since 2026-09-06 it fades in with altitude (`main.ts`, 500 to 2,500 units)
 * and is a map you climb into: from the air the biome underneath is not what
 * anybody is reading, the flag is, and at 0.60 the forty percent of ground
 * that came through broke Spain's bands into the land's own triangles — red
 * with brown patches, yellow with beige ones, seen from 3,000 units. So the
 * ceiling is 0.94: the last six percent keep a country from reading as paper
 * cut and pasted on, and the shader flattens the relief's normal under the
 * flag as it rises (`globe.ts`) so what is left is the sphere's own light. 0.60
 * stays here as the number a ground-level wash could afford, should one return.
 */
export const DEFAULT_OPACITY = 0.94;

/** The flag is laid in latitude alone where a family encircles a pole. */
const POLAR_SPAN = 180;

export interface Family {
  key: string;
  west: number;
  east: number;
  south: number;
  north: number;
  /**
   * True where the family's rings encircle a pole, so there is no east-west
   * axis to lay a rectangle along.
   *
   * It is exactly one ring on this planet — Antarctica's, whose box is **359.4
   * degrees** of longitude wide because the ring runs along latitude -90 and
   * every meridian is on it. A flag stretched over that box is a colour wheel
   * centred on the pole. Sampling the flag's own middle column instead gives
   * the continent concentric bands of it, which is the only thing a rectangle
   * can honestly say about a cap.
   */
  polar: boolean;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * sRGB to linear, as a table.
 *
 * The land's colour attribute is `Uint8` and **the bytes in it are linear** —
 * `emit` writes `color.r * 255` and `THREE.Color` holds the working space, not
 * sRGB — while `getImageData` hands back the sRGB bytes a canvas was painted
 * with. The flag attribute sits beside the colour one and has to be in the same
 * space as it, so the raster is converted on the way in.
 *
 * The *blend* is a different question and it is not answered here any more:
 * mixing two linear colours at 0.62 leaves a dark ground pulling a bright flag
 * down much further than the number suggests, so it happens in a gamma space,
 * in the shader, where both sides are already floats. See `globe.ts`.
 */
const toLinear = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  const lin = t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
  toLinear[i] = Math.round(lin * 255);
}

/** Ring area in square degrees, sign discarded — the same shoelace `geo.ts` uses. */
function ringArea(points: number[][]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    sum += b[0]! * a[1]! - a[0]! * b[1]!;
  }
  return Math.abs(sum) / 2;
}

/**
 * A ring's lon/lat box, with longitudes unwrapped into the window around `ref`.
 *
 * **This is the antimeridian fix and it is not optional.** A ring lying on 180
 * holds points at 179.9 and at -179.9, and a plain min/max calls that a box 359
 * degrees wide — so the flag would be stretched across the whole planet and
 * torn down the middle of the island. Unwrapping every longitude into one
 * continuous window around a reference makes the box 0.2 degrees wide, which is
 * what it is. It is also what puts Chukotka back on Russia's own flag: measured,
 * its centre reads 1.33 box-widths outside Russia's principal box wrapped and
 * **0.03 unwrapped**, because it is five degrees past the antimeridian and not
 * on the other side of the world.
 */
function boxOf(points: number[][], ref: number): { west: number; east: number; south: number; north: number } {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const p of points) {
    const lon = p[0]! + 360 * Math.round((ref - p[0]!) / 360);
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (p[1]! < south) south = p[1]!;
    if (p[1]! > north) north = p[1]!;
  }
  return { west, east, south, north };
}

/**
 * Which flag box each ring of the world falls in.
 *
 * One pass per country: sort its rings by area, take the largest one's box, and
 * let every ring whose centre is inside that box grown by `FAMILY_MARGIN` join
 * it. The family's box is then the **union** of its members and not the
 * principal's alone, because a member that had to be clamped to the box's edge
 * would come out one flat colour — Hokkaido is 0.24 outside Honshu's box, joins
 * it, and stretches it by exactly its own overhang.
 */
export function flagFamilies(world: World): Map<LandRing, Family> {
  const byCountry = new Map<number, LandRing[]>();
  for (const ring of world.rings as LandRing[]) {
    if (ring.water || ring.country <= 0) continue;
    const held = byCountry.get(ring.country);
    if (held === undefined) byCountry.set(ring.country, [ring]);
    else held.push(ring);
  }

  const out = new Map<LandRing, Family>();
  for (const [country, rings] of byCountry) {
    const iso = world.countries[country - 1]?.iso ?? '';
    // Two of the 234 have no flag to draw — the Indian Ocean Territories and
    // the Siachen Glacier — and `flags.ts` would hand back its fallback plate,
    // which is a code stamped in text and deliberately not a flag. Land with no
    // flag keeps its biome.
    if (!hasFlag(iso)) continue;

    const sorted = rings.slice().sort((a, b) => ringArea(b.points) - ringArea(a.points));
    const principal = sorted[0]!;
    const main = boxOf(principal.points, principal.points[0]![0]!);
    const ref = (main.west + main.east) / 2;
    const width = Math.max(main.east - main.west, 1e-6);
    const height = Math.max(main.north - main.south, 1e-6);

    const home: Family = { key: iso, ...main, polar: main.east - main.west > POLAR_SPAN };
    out.set(principal, home);

    for (let i = 1; i < sorted.length; i++) {
      const ring = sorted[i]!;
      const box = boxOf(ring.points, ref);
      const cx = (box.west + box.east) / 2;
      const cy = (box.south + box.north) / 2;
      const dx = Math.max(0, main.west - cx, cx - main.east) / width;
      const dy = Math.max(0, main.south - cy, cy - main.north) / height;
      if (Math.max(dx, dy) <= FAMILY_MARGIN) {
        home.west = Math.min(home.west, box.west);
        home.east = Math.max(home.east, box.east);
        home.south = Math.min(home.south, box.south);
        home.north = Math.max(home.north, box.north);
        home.polar = home.polar || home.east - home.west > POLAR_SPAN;
        out.set(ring, home);
        continue;
      }
      // Far enough out that there is nothing to continue: it gets the whole
      // flag over its own box. That is the Canaries, and it is the case the
      // reference picture got wrong.
      out.set(ring, { key: iso, ...box, polar: box.east - box.west > POLAR_SPAN });
    }
  }
  return out;
}

/**
 * One scratch canvas for the whole run: a flag is painted, read, and forgotten.
 *
 * It is created on first use rather than at module scope so that importing this
 * file outside a browser — `flagFamilies` is worth checking headlessly — does
 * not touch `document`.
 */
let scratch: CanvasRenderingContext2D | null | undefined;

function rasterise(key: string): Uint8ClampedArray {
  if (scratch === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = FLAG_W;
    canvas.height = FLAG_H;
    scratch = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (scratch === null) return new Uint8ClampedArray(FLAG_W * FLAG_H * 4);
  scratch.clearRect(0, 0, FLAG_W, FLAG_H);
  drawFlagAt(scratch, key, 0, 0, FLAG_W, FLAG_H);
  return scratch.getImageData(0, 0, FLAG_W, FLAG_H).data;
}

export interface LandFlagState {
  /** Whether any of the flag is on screen, which is the blend above zero. */
  on: boolean;
  /** The blend in the uniform right now: the fade times the ceiling. */
  opacity: number;
  /** What a full fade blends to. `DEFAULT_OPACITY` unless somebody sets it. */
  ceiling: number;
  /** Flag boxes built, land triangles painted, and what the attribute costs. */
  families: number;
  painted: number;
  triangles: number;
  megabytes: number;
  /** How much of the one-time build is done, 0 to 1, and what it has spent. */
  progress: number;
  buildMs: number;
  /** True once the attribute is on the geometry and the program knows it. */
  ready: boolean;
}

/**
 * The layer, built once and then free.
 *
 * `build` is called with a millisecond budget every frame until it says it is
 * done; `setFade` is one uniform a frame after that and touches no buffer.
 */
export interface FlagLayer {
  /** Live; `main.ts` copies it before handing it to a console. */
  state: LandFlagState;
  /** Advances the build by at most `budgetMs`. True once there is nothing left. */
  build(budgetMs: number): boolean;
  /** The altitude fade, 0 to 1. Multiplied by `ceiling` on the way to the GPU. */
  setFade(fade: number): void;
  /** What a full fade blends to; the measurement above is the default. */
  setCeiling(value: number): void;
}

/**
 * One layer per mesh. The 11 MB is worth exactly one build, and both
 * `atlas.flags()` and `land.userData.flags()` have to reach the same one.
 */
const layers = new WeakMap<object, FlagLayer>();

/**
 * Triangles painted between two clock readings.
 *
 * `performance.now()` is a few hundred nanoseconds and the paint is about
 * twelve, so reading it per triangle would be most of the build. 8,192 is 0.1
 * ms of work at the rate measured below, which is the resolution the budget is
 * kept to.
 */
const SLICE = 8192;

/**
 * The flag colour of every land triangle, as a second colour attribute.
 *
 * **What is not here any more is the interesting part.** This used to blend the
 * flag into the mesh's own `color` attribute and hand the result back to the
 * card — one buffer, no shader, and a `set()` from a saved copy to turn it off.
 * That is the right shape for a switch and the wrong one for a *fade*: an
 * opacity that follows the altitude would have rewritten 11 MB of vertex
 * colours every frame of a climb. So the blend moved to the fragment stage,
 * where it is one `mix` and one uniform, and this file's job is now to hand the
 * card the other half of that mix and never touch it again.
 *
 * Three consequences, and the first two are why there is no mask attribute:
 *
 * - **The attribute starts as a copy of the land's own colours.** A triangle
 *   with no flag — a country the specs have none for, and the rim of a lake,
 *   which belongs to nobody — is then `mix(ground, ground, a)`, which is the
 *   ground at every opacity there is. No fourth byte, no branch, no `hasFlag`.
 * - **The wall under the shore *is* painted**, at `wallShade`, because the
 *   alternative is a bright rim of biome around every flagged coast where the
 *   cliff used to read as rock. `globe.ts` owns that number; this multiplies by
 *   it in linear, which is the space `groundShade` multiplies in.
 * - **The bytes are linear**, like the `color` attribute they sit beside and
 *   unlike the raster, which is what a canvas hands back. The *blend* is still
 *   a painting operation and still happens in a gamma space — see the shader in
 *   `globe.ts`, which does it in the square root rather than in `pow(x, 1/2.2)`
 *   because the difference is invisible on flat colour and the cost is not.
 */
export function createFlagLayer(world: World, mesh: THREE.Mesh): FlagLayer {
  const held = layers.get(mesh);
  if (held !== undefined) return held;

  const data = mesh.userData['landFlags'] as LandFlagData | undefined;
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const triangles = position.count / 3;
  const flag = (color.array as Uint8Array).slice();

  const material = mesh.material as THREE.Material;
  const uniforms = material.userData['uniforms'] as { atlasFlag?: { value: number } } | undefined;

  const state: LandFlagState = {
    on: false,
    opacity: 0,
    ceiling: DEFAULT_OPACITY,
    families: 0,
    painted: 0,
    triangles,
    megabytes: flag.byteLength / 1e6,
    progress: 0,
    buildMs: 0,
    ready: false,
  };

  /**
   * The build, flattened into a list before it starts.
   *
   * A span is two runs of triangles — the ring's surface and the wall under it
   * — and the cursor has to be able to stop in the middle of either, so the
   * pair is easier to walk than a nested loop with two resumable indices. It is
   * 3,112 small objects, built once, and it keeps the order `buildLand` emitted
   * the rings in, which is what makes the single-entry raster cache below work.
   */
  interface Job {
    from: number;
    to: number;
    box: Family;
    shade: number;
  }
  const family = flagFamilies(world);
  const jobs: Job[] = [];
  const boxes = new Set<Family>();
  let total = 0;
  for (const span of data?.spans ?? []) {
    const box = family.get(span.ring);
    if (box === undefined) continue;
    boxes.add(box);
    jobs.push({ from: span.surface[0], to: span.surface[1], box, shade: 1 });
    jobs.push({ from: span.wall[0], to: span.wall[1], box, shade: data?.wallShade ?? 0.72 });
    total += span.surface[1] - span.surface[0] + (span.wall[1] - span.wall[0]);
  }
  state.families = boxes.size;

  // A single-entry cache and not a map of all 232, which would hold 22 MB of
  // pixels for the length of the build. `loadWorld` adds a country's rings
  // together and `buildLand` keeps that order, so a country's flag is painted
  // once; if that ever stops being true this re-paints rather than misreads.
  let key = '';
  let raster: Uint8ClampedArray = new Uint8ClampedArray(FLAG_W * FLAG_H * 4);
  let job = 0;
  let cursor = -1;

  const paint = (from: number, to: number, box: Family, shade: number): void => {
    const pos = position.array as ArrayLike<number>;
    const west = box.west;
    const span = Math.max(box.east - box.west, 1e-6);
    const height = Math.max(box.north - box.south, 1e-6);
    const centre = (box.west + box.east) / 2;
    for (let t = from; t < to; t++) {
      const i = t * 9;
      let x = pos[i]! + pos[i + 3]! + pos[i + 6]!;
      let y = pos[i + 1]! + pos[i + 4]! + pos[i + 7]!;
      let z = pos[i + 2]! + pos[i + 5]! + pos[i + 8]!;
      const length = Math.hypot(x, y, z) || 1;
      x /= length;
      y /= length;
      z /= length;
      const lat = Math.asin(y < -1 ? -1 : y > 1 ? 1 : y) / DEG;
      let lon = Math.atan2(-z, x) / DEG;
      lon += 360 * Math.round((centre - lon) / 360);
      const u = box.polar ? 0.5 : clamp01((lon - west) / span);
      // The flag's own y runs down from the top of the box, and the top of the
      // box is its highest latitude.
      const v = clamp01((box.north - lat) / height);
      const px = Math.min(FLAG_W - 1, (u * FLAG_W) | 0);
      const py = Math.min(FLAG_H - 1, (v * FLAG_H) | 0);
      const s = (py * FLAG_W + px) * 4;
      const r = Math.round(toLinear[raster[s]!]! * shade);
      const g = Math.round(toLinear[raster[s + 1]!]! * shade);
      const b = Math.round(toLinear[raster[s + 2]!]! * shade);
      flag[i] = r;
      flag[i + 1] = g;
      flag[i + 2] = b;
      flag[i + 3] = r;
      flag[i + 4] = g;
      flag[i + 5] = b;
      flag[i + 6] = r;
      flag[i + 7] = g;
      flag[i + 8] = b;
    }
    state.painted += to - from;
  };

  const layer: FlagLayer = {
    state,
    build(budgetMs: number): boolean {
      if (state.ready) return true;
      const started = performance.now();
      while (job < jobs.length) {
        const next = jobs[job]!;
        if (next.box.key !== key) {
          raster = rasterise(next.box.key);
          key = next.box.key;
        }
        let t = cursor < 0 ? next.from : cursor;
        while (t < next.to) {
          const stop = Math.min(next.to, t + SLICE);
          paint(t, stop, next.box, next.shade);
          t = stop;
          if (performance.now() - started >= budgetMs) {
            cursor = t;
            state.progress = total > 0 ? state.painted / total : 1;
            state.buildMs += performance.now() - started;
            return false;
          }
        }
        job++;
        cursor = -1;
      }
      // One attribute upload and one program, at the end: the shader has no
      // flag in it until there is a flag to read, so nothing is paid — and
      // nothing reads an attribute that is not bound — while the layer is off.
      geometry.setAttribute('flag', new Uint8BufferAttribute(flag, 3, true));
      const enable = material.userData['useFlagAttribute'] as (() => void) | undefined;
      enable?.();
      state.progress = 1;
      state.ready = true;
      state.buildMs += performance.now() - started;
      return true;
    },
    setFade(fade: number): void {
      const blend = state.ready ? clamp01(fade) * state.ceiling : 0;
      state.opacity = blend;
      state.on = blend > 0;
      if (uniforms?.atlasFlag !== undefined) uniforms.atlasFlag.value = blend;
    },
    setCeiling(value: number): void {
      state.ceiling = clamp01(value);
    },
  };
  layers.set(mesh, layer);
  return layer;
}
