/**
 * Each country's own colour, laid over its own land, at an opacity you can set.
 *
 * **It used to be the flag itself and it is not any more.** `flags.ts` draws
 * all 232 flags from the specs in `flag-data.ts`, and this file rasterised one
 * of those into a scratch canvas per country, read it back, and picked a pixel
 * per land triangle by where that triangle fell in the country's lon/lat box.
 * It worked, and you could not tell the flags apart: from 2,500 units a country
 * is a few hundred pixels of an irregular shape, the bands run at constant
 * latitude across whatever the outline happens to be, and two red-and-white
 * flags side by side are two red-and-white smudges. A political map does not
 * draw flags. It fills each country with one colour, and `country-colors.ts` is
 * where that colour is decided — from the country's own flag, so it still means
 * something, and de-conflicted against every neighbour, so no frontier on the
 * planet has the same fill on both sides.
 *
 * What is left here is the other half: **which triangles are which country's,
 * and getting one flat colour onto each of them.** Three things about that
 * arrangement decide the shape of this file, and all three survived the change:
 *
 * - **Nothing is a texture and nothing is an image.** What ships to the card is
 *   a **second** `Uint8` vertex-colour attribute beside the one the land mesh
 *   has always had, and one uniform that says how much of it to use. No sampler
 *   is bound.
 * - **Nothing is paid until it is asked for.** `globe.ts` reaches this module
 *   through a dynamic `import()`, so neither it nor `country-colors.ts` nor the
 *   2,091 lines of `flag-data.ts` are in the initial graph — which is the trap
 *   `main.ts` writes down about the twelve preloaded chunks. The attribute is
 *   the same bargain a level down — three bytes a vertex over the whole land
 *   mesh, **14.8 MB over 1,644,313 triangles**. It is built the first time the
 *   player is high enough to see it, in slices under a frame budget.
 *
 *   That count is the mesh **the game builds**, and a bare `buildLand(world)`
 *   in a scratch script gives 1,235,410 triangles and 11.1 MB instead. Neither
 *   is wrong: `main.ts` and `pnpm check` both call `setFlattenSites` and
 *   `setDetailSites` *before* the world exists, so the relief carries a pad
 *   under every monument and a refinement claim under every town, and a third
 *   of the mesh is that refinement. A measurement of this layer taken without
 *   them is measuring a coarser planet — see `verifyFlagLayer`, which is why it
 *   takes the mesh rather than building one.
 * - **The blend is a uniform and not a buffer.** The layer fades in with
 *   altitude, so the opacity changes every frame of a climb; rewriting the
 *   mesh's colours at that rate is eleven megabytes a frame. See
 *   `createFlagLayer`.
 *
 * What did *not* survive is everything that existed to put a rectangle on a
 * country: the raster, the scratch canvas, the family of boxes a country's
 * islands were grouped into, the antimeridian unwrap, the polar special case
 * for Antarctica. A flat colour has no orientation and no extent, so a ring
 * needs nothing but the country it belongs to, and the file went from 593 lines
 * to this. **Nothing here touches `document` any more either**, which is what
 * lets the whole layer be built and measured headlessly — every number in this
 * file was.
 */
import { Uint8BufferAttribute } from 'three';
import type * as THREE from 'three';
import type { LandRing, World } from './geo.ts';
import { buildCountryColors } from './country-colors.ts';
import type { CountryColorTable } from './country-colors.ts';

/**
 * One ring's triangles, in the order `buildLand` emitted them.
 *
 * The alternative was a country index per triangle, and it is a megabyte of
 * `Uint16` that is wrong on both counts: the mesh is already grouped — a ring's
 * surface, then the wall under its boundary, then the next ring — so what has
 * to be recorded is 1,556 pairs of integers and not 1.64 million of them.
 *
 * It stays a **ring** and not a country even though the colour is now a
 * country's, because it is the span that the mesh is grouped by: `buildLand`
 * emits ring by ring, and a country's rings need not be adjacent in that order.
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
  /** The shade `buildLand` gives a coastal wall, so the fill takes the same one. */
  wallShade: number;
}

/**
 * How much of the country's colour is laid over the biome, 0 to 1.
 *
 * **The yardstick is the cel ramp's own faintest step**, and that has not
 * changed. `DAY_MOOD` gives a four-band ramp of `0.45, 0.633, 0.817, 1.0`, so
 * the smallest step the light itself makes is the top one — and
 * `ambientIntensity` 0.4 plus `hemisphereIntensity` 0.35 are *not* routed
 * through the ramp, so on screen that step arrives as
 * `2.6 * 0.183 / (2.6 * 0.817 + 0.75)` = **16.6% of relative luminance**. A
 * colour edge weaker than that is a smaller change than the light already makes
 * across a hillside, and the eye files it as shading.
 *
 * **What changed is which side of the blend that yardstick is pointed at.**
 * When the layer drew a flag there were two questions — does the flag's own
 * design survive being mixed down, and does the ground keep enough of itself —
 * and the answer was a window of 0.40 to 0.73 whose two margins were equal at
 * 0.60. Then the layer became a *map you climb into* rather than a wash you
 * stand in, and 0.60 turned out to break Spain's bands into the land's own
 * triangles: red with brown patches, yellow with beige ones, from 3,000 units.
 * 0.94 was the answer to that, and the sentence beside it was about a flag not
 * reading as paper cut and pasted on.
 *
 * A flat fill deletes the first question — there is no design left to survive —
 * and it makes the second one sharper rather than softer, which is why the
 * number does not come down. What `1 - opacity` of the ground buys is no longer
 * texture under a picture, it is **mottling inside what is supposed to be one
 * flat colour**: the land's own attribute carries the biome, and a country
 * spans several. Measured off the mesh's own `color` attribute, p5 to p95 of
 * relative luminance over the country's own middle, for each of the 193
 * coloured countries with more than 20 land triangles (2026-09-08, headless,
 * which is the measurement the old study took): median **0.57**, p90 0.94, and
 * the widest are Canada 1.47, Greenland 1.45, Sweden 1.35, the United States
 * 1.33 and France 1.30 — the big ones, which are the ones a flag map is for.
 *
 * Set that against the 16.6% step and the ceiling falls out with no taste in
 * it. The mottle a viewer can see is `(1 - opacity)` times the country's own
 * spread, so it stays under the light's own faintest step while
 * `1 - opacity < 0.166 / spread`:
 *
 * ```
 *   the median country (0.57)   opacity above 0.71
 *   a country at 1.00           opacity above 0.83
 *   Canada (1.47)               opacity above 0.89
 * ```
 *
 * **0.94 clears the worst country about two to one**: 6% of Canada's 1.47 is
 * 0.088 of relative luminance, which is 53% of one ramp step and therefore not
 * a mark, and the median country is at 20% of one. It is the same number as
 * before and it is now the *floor* of an argument rather than the top of one —
 * the six percent that are left are what keeps a country from reading as paper
 * cut and pasted on, and the shader flattens the relief's normal under the fill
 * as it rises (`globe.ts`) so what is left is the sphere's own light rather
 * than the hillsides'. 0.60 is
 * recorded here as the number a ground-level wash could afford, should one ever
 * return; nothing uses it.
 */
export const DEFAULT_OPACITY = 0.94;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * sRGB to linear, as a table.
 *
 * The land's colour attribute is `Uint8` and **the bytes in it are linear** —
 * `emit` writes `color.r * 255` and `THREE.Color` holds the working space, not
 * sRGB — while `country-colors.ts` works in the sRGB bytes a flag spec is
 * written in, because that is the space the eye compares two flags in and the
 * space OKLab wants on the way in. This attribute sits beside the colour one
 * and has to be in the same space as it, so the country's colour is converted
 * here, once each.
 *
 * The *blend* is a different question and it is not answered here: mixing two
 * linear colours at 0.9 leaves a dark ground pulling a bright fill down further
 * than the number suggests, so it happens in a gamma space, in the shader,
 * where both sides are already floats. See `globe.ts`.
 */
const toLinear = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  const lin = t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
  toLinear[i] = Math.round(lin * 255);
}

export interface LandFlagState {
  /** Whether any of the layer is on screen, which is the blend above zero. */
  on: boolean;
  /** The blend in the uniform right now: the fade times the ceiling. */
  opacity: number;
  /** What a full fade blends to. `DEFAULT_OPACITY` unless somebody sets it. */
  ceiling: number;
  /** Which half of the one-time build is running. */
  stage: 'colours' | 'painting' | 'done';
  /** Countries coloured, land triangles painted, and what the attribute costs. */
  countries: number;
  painted: number;
  triangles: number;
  megabytes: number;
  /**
   * Why the table looks the way it does: how many countries were moved off
   * their flag's own colour, how many of those took a different colour of the
   * same flag, and how many frontiers the de-conflict could not open up. The
   * last one should be zero — see `country-colors.ts`.
   */
  moved: number;
  switched: number;
  short: { a: string; b: string; distance: number }[];
  /**
   * How much of the whole one-time build is done, 0 to 1 — the colour table and
   * the paint together, weighted by what each was measured to cost.
   *
   * **It is the reading that says whether the build is advancing at all**, and
   * it is here because a layer that is not `ready` looks identical from outside
   * whether it is resuming or restarting. A resumed build climbs; a restarted
   * one would sit near zero for ever while `buildMs` went up. Watch it with
   * `calls` beside it: `progress` says whether the work is being kept and
   * `calls` says whether the frame loop is running at all.
   */
  progress: number;
  /**
   * How many times `build` has been called and how many steps it has taken.
   *
   * A build is **760 steps over about 50 calls** at `FLAG_BUILD_MS`
   * (2026-09-08, on the mesh `pnpm check` builds). Far fewer calls than that
   * after seconds of wall clock means the render loop is not running — a hidden
   * or throttled tab, where `requestAnimationFrame` stops or slows — and
   * `steps` climbing well past 760 with `progress` still near zero would mean
   * the generator was being restarted rather than resumed. Those two look
   * identical in `buildMs` alone, which is why both numbers are here.
   */
  calls: number;
  steps: number;
  /** What the whole build has spent, in milliseconds of CPU. */
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
 * One layer per mesh. The attribute is worth exactly one build, and both
 * `atlas.flags()` and `land.userData.flags()` have to reach the same one.
 */
const layers = new WeakMap<object, FlagLayer>();

/**
 * The run a colour is written in, in vertices. 1,536 is 512 triangles.
 *
 * A flat fill over a span is a **memcpy**, not a loop: three bytes repeated is
 * a pattern, and `TypedArray.set` from one beats writing 11.1 million bytes a
 * byte at a time by seven to one — **0.8 ms against 7.0** over the mesh's 3,108
 * runs, medians of seven warm passes (2026-09-08, headless). The run has to be
 * a multiple of three bytes so the pattern lands on the same channel each time,
 * and of three *vertices* so a partial run still starts on a triangle; 512
 * triangles is both, and it is large enough that the per-call overhead is
 * nothing and small enough that the copy stays in cache.
 */
const RUN = 3 * 512 * 3;

/**
 * Triangles painted between two clock readings.
 *
 * `performance.now()` is a few hundred nanoseconds and a triangle now costs
 * nine bytes of a `memcpy`, so reading the clock per triangle would be most of
 * the paint. 65,536 triangles is about 0.04 ms of it at the rate measured
 * above, which is finer than the budget can use — and it is eight times the old
 * slice, because each triangle used to have to be projected onto a flag and
 * sampled.
 */
const SLICE = 65536;

/**
 * The frame `budgetMs` is a share of, in milliseconds, and the most one call may
 * ever spend whatever the frames are doing.
 *
 * **`build(4)` is a share of a frame and not a fixed sum, and the difference is
 * the whole of this.** `main.ts` passes 4 ms to protect the frame rate, which
 * is a quarter of a 60 Hz frame. When the loop is *not* running at frame rate —
 * a hidden tab, a throttled one, an automated browser between screenshots, all
 * of them places where `requestAnimationFrame` stops or slows — there is no
 * frame rate left to protect, and holding to 4 ms means a build that needs 51
 * calls never gets them and the map layer simply never appears, however long
 * you wait. That is not a hypothetical: it is what this layer was measured
 * doing, 20 calls in 55 seconds of wall clock and `ready` still false.
 *
 * So the allowance is `budgetMs` scaled by how long the gap between calls
 * actually was, floored at what the caller asked for and capped at
 * `CATCH_UP_CAP`. At 60 Hz the gap is 16.7 ms and the allowance is exactly the
 * 4 ms asked for, so nothing about the shipped path changes. Driven at one call
 * every 2.75 seconds the allowance caps out and the whole build lands in **four
 * calls** (2026-09-08). The cap is two 60 Hz frames: past that the build would
 * *be* the frame, and a machine slow enough to be calling this at 30 Hz gets
 * 8 ms rather than 32. Like every budget here it is checked *after* a step, so
 * a call can pass it by one — measured, 34.3 ms against the 32.
 *
 * The gap is measured from the **end** of the previous call to the start of
 * this one, so it is how long everything else took and the rule cannot feed
 * back on its own cost.
 */
const FRAME_MS = 1000 / 60;
const CATCH_UP_CAP = 32;

/**
 * What the colour table is worth against the paint, as a share of the build.
 *
 * Measured on the mesh `pnpm check` builds (2026-09-08, headless): 236 ms for
 * the table and 4.4 for the paint, so the table is 98% of it. `progress` is the
 * two stages' own cursors blended on this, which is the only way one number can
 * climb evenly across a build whose halves are two orders of magnitude apart.
 */
const TABLE_SHARE = 236 / 240.4;

/**
 * Every land triangle's country colour, as a second colour attribute.
 *
 * **What is not here any more is the interesting part.** This used to blend the
 * layer into the mesh's own `color` attribute and hand the result back to the
 * card — one buffer, no shader, and a `set()` from a saved copy to turn it off.
 * That is the right shape for a switch and the wrong one for a *fade*: an
 * opacity that follows the altitude would have rewritten eleven megabytes of
 * vertex colours every frame of a climb. So the blend moved to the fragment stage,
 * where it is one `mix` and one uniform, and this file's job is to hand the
 * card the other half of that mix and never touch it again.
 *
 * Three consequences, and the first two are why there is no mask attribute:
 *
 * - **The attribute starts as a copy of the land's own colours.** A triangle
 *   with no colour of its own — a country `flag-data.ts` has no spec for, and
 *   the rim of a lake, which belongs to nobody — is then `mix(ground, ground,
 *   a)`, which is the ground at every opacity there is. No fourth byte, no
 *   branch, no lookup.
 * - **The wall under the shore *is* painted**, at `wallShade`, because the
 *   alternative is a bright rim of biome around every coloured coast where the
 *   cliff used to read as rock. `globe.ts` owns that number; this multiplies by
 *   it in linear, which is the space `groundShade` multiplies in.
 * - **The bytes are linear**, like the `color` attribute they sit beside. The
 *   blend is still a painting operation and still happens in a gamma space —
 *   see the shader in `globe.ts`, which does it in the square root rather than
 *   in `pow(x, 1/2.2)` because the difference is invisible on flat colour and
 *   the cost is not.
 *
 * **Where the cost went, and why the budgeted loop is still here.**
 * Rasterising was what that loop was written for and it is gone: the paint is a
 * `memcpy` per span now, 4.4 ms over the whole mesh on its first pass — the one
 * that touches a freshly copied buffer — and 0.8 warm (2026-09-08, headless).
 * On its own that would have made the machinery pointless: one frame, done.
 * What is not gone is the *table*: `country-colors.ts` reads all 228 flag specs
 * as geometry and walks the vertices of 1,556 rings to find who touches whom,
 * and cold that is **a quarter of a second**, which is four dropped frames in
 * the middle of a climb. So the budget covers a different thing than it used
 * to:
 *
 * ```
 *   the colour table   231 ms   ~49 calls at FLAG_BUILD_MS = 4
 *   the paint            6 ms   the last one, and it fits
 * ```
 *
 * The table is a generator (`buildCountryColors`) turned one step at a time
 * with the clock in hand, because there is no other honest way to spend a
 * quarter of a second inside a frame. Measured end to end on the mesh `pnpm
 * check` builds, at a 4 ms budget (2026-09-08, headless): **about 50 calls, 760
 * steps, 237 ms, median 4.2 ms a call, p90 6.2 and a worst of 9.6** — the worst
 * being an early call, before anything is JIT-warm. At 60 Hz that is under a
 * second of a climb that takes several. The paint keeps its own cursor for the
 * reason it always had one: 4 ms here is not 4 ms everywhere.
 *
 * And see `FRAME_MS` for what happens when the caller is *not* a 60 Hz loop,
 * which is the case that made this layer look broken in an automated browser.
 */
export function createFlagLayer(world: World, mesh: THREE.Mesh): FlagLayer {
  const held = layers.get(mesh);
  if (held !== undefined) return held;

  const data = mesh.userData['landFlags'] as LandFlagData | undefined;
  const geometry = mesh.geometry;
  const color = geometry.getAttribute('color');
  const triangles = color.count / 3;
  const fill = (color.array as Uint8Array).slice();

  const material = mesh.material as THREE.Material;
  const uniforms = material.userData['uniforms'] as { atlasFlag?: { value: number } } | undefined;

  const state: LandFlagState = {
    on: false,
    opacity: 0,
    ceiling: DEFAULT_OPACITY,
    stage: 'colours',
    countries: 0,
    painted: 0,
    triangles,
    megabytes: fill.byteLength / 1e6,
    moved: 0,
    switched: 0,
    short: [],
    progress: 0,
    calls: 0,
    steps: 0,
    buildMs: 0,
    ready: false,
  };

  /**
   * The build, flattened into a list before it starts.
   *
   * A span is two runs of triangles — the ring's surface and the wall under it
   * — and the cursor has to be able to stop in the middle of either, so the
   * pair is easier to walk than a nested loop with two resumable indices. A ring
   * whose country has no colour is left out of the list entirely, which is what
   * makes it free: its triangles keep the copy of the ground they started as.
   */
  interface Job {
    from: number;
    to: number;
    /** The run this job is copied from: `RUN` bytes of one repeating colour. */
    pattern: Uint8Array;
  }
  /** The one definition of what colour a country is, turned a step at a time. */
  const colours = buildCountryColors(world);
  const shade = data?.wallShade ?? 0.72;
  const linear = (rgb: readonly [number, number, number], factor: number): [number, number, number] => [
    Math.round(toLinear[rgb[0]]! * factor),
    Math.round(toLinear[rgb[1]]! * factor),
    Math.round(toLinear[rgb[2]]! * factor),
  ];

  // One run per distinct colour, built once and shared by every span that uses
  // it: two per coloured country, about 460 of them, half a megabyte in all and
  // gone with the jobs when the build finishes. Rebuilding the pattern per span
  // instead would write as many bytes as the paint itself does.
  const patterns = new Map<number, Uint8Array>();
  const patternFor = (rgb: readonly [number, number, number]): Uint8Array => {
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    let run = patterns.get(key);
    if (run === undefined) {
      run = new Uint8Array(RUN);
      for (let i = 0; i < RUN; i += 3) {
        run[i] = rgb[0];
        run[i + 1] = rgb[1];
        run[i + 2] = rgb[2];
      }
      patterns.set(key, run);
    }
    return run;
  };

  const jobs: Job[] = [];
  let total = 0;

  /** Turns the finished table into the run list. Microseconds; 1,556 spans. */
  const plan = (table: CountryColorTable): void => {
    const surfaceOf = new Map<number, Uint8Array>();
    const wallOf = new Map<number, Uint8Array>();
    for (const span of data?.spans ?? []) {
      const country = span.ring.country;
      // A lake's rim belongs to nobody, and nine of the 239 countries — the
      // Indian Ocean Territories, the Siachen Glacier, and the seven admin-0
      // features 1:10m added that are not countries (Akrotiri, Dhekelia, the
      // Cyprus buffer zone, Guantanamo Bay, Baikonur, Bir Tawil and the
      // Southern Patagonian Ice Field) — have no flag for a colour to be read
      // off. All nine keep their biome.
      if (span.ring.water || country <= 0) continue;
      let surface = surfaceOf.get(country);
      if (surface === undefined) {
        const rgb = table.color(country);
        if (rgb === null) continue;
        surface = patternFor(linear(rgb, 1));
        surfaceOf.set(country, surface);
        wallOf.set(country, patternFor(linear(rgb, shade)));
      }
      jobs.push({ from: span.surface[0], to: span.surface[1], pattern: surface });
      jobs.push({ from: span.wall[0], to: span.wall[1], pattern: wallOf.get(country)! });
      total += span.surface[1] - span.surface[0] + (span.wall[1] - span.wall[0]);
    }
    state.stage = 'painting';
    state.countries = table.countries;
    state.moved = table.moved;
    state.switched = table.switched;
    state.short = table.short;
  };

  let job = 0;
  let cursor = -1;
  /** `performance.now()` when the previous call handed back. See `FRAME_MS`. */
  let handedBack = 0;

  const paint = (from: number, to: number, pattern: Uint8Array): void => {
    let at = from * 9;
    const end = to * 9;
    while (at < end) {
      const n = Math.min(RUN, end - at);
      fill.set(n === RUN ? pattern : pattern.subarray(0, n), at);
      at += n;
    }
    state.painted += to - from;
  };

  const layer: FlagLayer = {
    state,
    build(budgetMs: number): boolean {
      if (state.ready) return true;
      const begun = performance.now();
      state.calls++;
      // A share of the frame there actually was, not a fixed sum. See `FRAME_MS`.
      const gap = handedBack === 0 ? FRAME_MS : begun - handedBack;
      const allowance = Math.min(CATCH_UP_CAP, Math.max(budgetMs, (budgetMs * gap) / FRAME_MS));
      const handBack = (): boolean => {
        state.buildMs += performance.now() - begun;
        handedBack = performance.now();
        return false;
      };

      // Stage one: the colour table, a step at a time. It is 98% of the build,
      // and every step hands back how far along it is, so `progress` moves
      // through it rather than sitting at zero until the paint starts.
      while (state.stage === 'colours') {
        const step = colours.next();
        state.steps++;
        if (step.done) plan(step.value);
        else state.progress = step.value * TABLE_SHARE;
        if (performance.now() - begun >= allowance) return handBack();
      }
      while (job < jobs.length) {
        const next = jobs[job]!;
        let t = cursor < 0 ? next.from : cursor;
        while (t < next.to) {
          const upto = Math.min(next.to, t + SLICE);
          paint(t, upto, next.pattern);
          t = upto;
          if (performance.now() - begun >= allowance) {
            cursor = t;
            state.progress = TABLE_SHARE + (total > 0 ? state.painted / total : 1) * (1 - TABLE_SHARE);
            return handBack();
          }
        }
        job++;
        cursor = -1;
      }
      // One attribute upload and one program, at the end: the shader has no
      // second colour in it until there is one to read, so nothing is paid —
      // and nothing reads an attribute that is not bound — while it is off.
      geometry.setAttribute('flag', new Uint8BufferAttribute(fill, 3, true));
      const enable = material.userData['useFlagAttribute'] as (() => void) | undefined;
      enable?.();
      state.progress = 1;
      state.stage = 'done';
      state.ready = true;
      state.buildMs += performance.now() - begun;
      handedBack = performance.now();
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

/**
 * What driving the whole build to the end came to. See `verifyFlagLayer`.
 */
export interface FlagLayerReport {
  /** False if the build did not finish inside the call cap. */
  ready: boolean;
  /** How many `build` calls it took, how many generator steps, and the cap. */
  calls: number;
  steps: number;
  cap: number;
  /** CPU spent, and the worst single call — the frame a player would feel. */
  spentMs: number;
  worstCallMs: number;
  /** The most `progress` ever went *backwards*. Anything but 0 is a restart. */
  regression: number;
  /** Where `progress` ended: 1 for a finished build. */
  progress: number;
  /** What the table came to, read back through the layer's own state. */
  countries: number;
  moved: number;
  switched: number;
  short: number;
  /** Triangles painted, of the mesh's own count, and what the attribute costs. */
  painted: number;
  triangles: number;
  megabytes: number;
  /** True once the `flag` attribute is on the geometry. */
  bound: boolean;
}

/**
 * Drives the layer to completion the way `main.ts` does, and reports it.
 *
 * **This exists because of a bug it would have caught in one line.** The build
 * is a generator turned a step at a time across frames, and the failure mode
 * that shape has is that the generator gets *recreated* per call instead of
 * resumed — which from outside looks exactly like a slow build: `buildMs`
 * climbing frame after frame with `ready` still false. The two are only told
 * apart by whether the work is **kept**, so that is what this measures:
 * `progress` must never go backwards, and the loop must terminate inside a
 * bounded number of calls. A restarted generator fails both, and no screenshot
 * of a green planet says which of the two you have.
 *
 * It takes the **mesh** rather than building one, because the mesh the game
 * builds is a third larger than a bare `buildLand` — see the note at the top of
 * this file — and a budget measured on the smaller one is not the budget. The
 * layer is one per mesh, so pass a mesh nothing else has asked about.
 *
 * Measured on the mesh `pnpm check` builds, at `FLAG_BUILD_MS` (2026-09-08,
 * headless): 51 calls, 1,105 steps, 240 ms, worst call 8.0 ms, no regression,
 * 232 countries, 77 moved, 8 switched, 0 short, 1,644,225 of 1,644,313
 * triangles painted — the 88 that are not are the two countries `flag-data.ts`
 * has no spec for.
 *
 * **Not wired into a check yet.** `scripts/check-world.ts` is where it belongs,
 * beside the mesh assertions that already have `land` in hand:
 *
 * ```ts
 * const flags = verifyFlagLayer(world, land);
 * check(flags.ready, 'the map layer builds inside its budget',
 *   `${flags.calls} calls, ${flags.spentMs.toFixed(0)} ms, worst ${flags.worstCallMs.toFixed(1)} ms`);
 * check(flags.regression === 0, 'and every call keeps what the last one did',
 *   `progress fell by ${flags.regression.toFixed(3)}`);
 * check(flags.short === 0, 'and no two countries that touch share a colour');
 * ```
 */
export function verifyFlagLayer(
  world: World,
  mesh: THREE.Mesh,
  budgetMs = 4,
  cap = 4000,
): FlagLayerReport {
  const layer = createFlagLayer(world, mesh);
  let worstCallMs = 0;
  let regression = 0;
  let progress = 0;
  let done = false;
  while (!done && layer.state.calls < cap) {
    const began = performance.now();
    done = layer.build(budgetMs);
    worstCallMs = Math.max(worstCallMs, performance.now() - began);
    regression = Math.max(regression, progress - layer.state.progress);
    progress = layer.state.progress;
  }
  const state = layer.state;
  return {
    ready: state.ready,
    calls: state.calls,
    steps: state.steps,
    cap,
    spentMs: state.buildMs,
    worstCallMs,
    regression,
    progress: state.progress,
    countries: state.countries,
    moved: state.moved,
    switched: state.switched,
    short: state.short.length,
    painted: state.painted,
    triangles: state.triangles,
    megabytes: state.megabytes,
    bound: mesh.geometry.getAttribute('flag') !== undefined,
  };
}
