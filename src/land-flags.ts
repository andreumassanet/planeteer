/**
 * Each country's own colour, laid over its own land, at an opacity you can set.
 *
 * `country-colors.ts` decides the colour of each country; this file gets one
 * flat colour onto every land triangle. Nothing is a texture: what ships to the
 * card is a second `Uint8` vertex-colour attribute (`flag`) beside the land's
 * own, plus one uniform saying how much of it to use. The blend is a uniform
 * rather than a buffer because it fades with altitude, which would otherwise
 * rewrite the whole colour buffer every frame of a climb.
 *
 * Nothing is paid until asked for: `globe.ts` reaches this module through a
 * dynamic `import()`, so neither it nor `country-colors.ts` nor `flag-data.ts`
 * is in the initial graph, and the attribute (three bytes a vertex over the
 * whole land mesh) is built the first time the player is high enough to see it,
 * in slices under a frame budget. Nothing here touches `document`, so the
 * whole layer can be built and measured headlessly.
 *
 * The data and report shapes are in `land-flags/types.ts`, the run-length
 * painting in `land-flags/paint.ts`.
 */
import { Uint8BufferAttribute } from 'three';
import type * as THREE from 'three';
import type { World } from './geo.ts';
import { buildCountryColors } from './country-colors.ts';
import type { CountryColorTable } from './country-colors.ts';
import { SLICE, paintRun, planJobs } from './land-flags/paint.ts';
import type { Job } from './land-flags/paint.ts';
import type { FlagLayer, FlagLayerReport, LandFlagData, LandFlagState } from './land-flags/types.ts';

export type { FlagLayer, FlagLayerReport, LandFlagData, LandFlagState, RingSpan } from './land-flags/types.ts';

/**
 * How much of the country's colour is laid over the biome, 0 to 1.
 *
 * The yardstick is the cel ramp's faintest step: a colour edge weaker than the
 * light's own smallest step (about 16.6% of relative luminance) reads as
 * shading, not as a border. What `1 - opacity` of the ground lets through is
 * mottling inside what should be one flat colour, and the widest country
 * (Canada) spreads about 1.47 of relative luminance across its biomes; at 0.94
 * its mottle is about half a ramp step. The shader also flattens the relief's
 * normal under the fill as it rises (`globe.ts`), so what is left is the
 * sphere's own light.
 */
export const DEFAULT_OPACITY = 0.94;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * One layer per mesh: the attribute is worth exactly one build, and both
 * `atlas.flags()` and `land.userData.flags()` have to reach the same one.
 */
const layers = new WeakMap<object, FlagLayer>();

/**
 * The frame a `budgetMs` is a share of, in milliseconds, and the most one call
 * may spend whatever the frames are doing. `main.ts` passes 4 ms, a quarter of
 * a 60 Hz frame; when the loop runs slower than that (a hidden or throttled
 * tab) there is no frame rate to protect, so the allowance is `budgetMs`
 * scaled by the gap since the previous call, floored at `budgetMs` and capped
 * at `CATCH_UP_CAP` (two 60 Hz frames). The gap runs from the end of the
 * previous call, so the rule cannot feed back on its own cost.
 */
const FRAME_MS = 1000 / 60;
const CATCH_UP_CAP = 32;

/**
 * What the colour table is worth against the paint, as a share of the build
 * (the table is about 98% of it). `progress` blends the two stages' own
 * cursors on this so one number climbs evenly.
 */
const TABLE_SHARE = 236 / 240.4;

/**
 * Every land triangle's country colour, as a second colour attribute.
 *
 * The attribute starts as a copy of the land's own colours, so a triangle with
 * no colour of its own (a country with no flag, a lake's rim) is `mix(ground,
 * ground, a)`: the ground at every opacity, with no mask attribute. The wall
 * under the shore is painted at `wallShade` (owned by `globe.ts`) so coloured
 * coasts have no bright biome rim. The bytes are linear, like the attribute
 * they sit beside.
 *
 * The colour table is a generator turned one step at a time with the clock in
 * hand, because reading every flag spec and walking every ring is about a
 * quarter of a second; the paint is a `memcpy` per span and takes a few ms.
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

  /** The one definition of what colour a country is, turned a step at a time. */
  const colours = buildCountryColors(world);
  let jobs: Job[] = [];
  let total = 0;
  let job = 0;
  let cursor = -1;
  /** `performance.now()` when the previous call handed back. */
  let handedBack = 0;

  /** Turns the finished table into the run list. */
  const plan = (table: CountryColorTable): void => {
    ({ jobs, total } = planJobs(table, data));
    state.stage = 'painting';
    state.countries = table.countries;
    state.moved = table.moved;
    state.switched = table.switched;
    state.short = table.short;
  };

  /** Binds the finished attribute: one upload and one program, so nothing is paid while the layer is off. */
  function finish(begun: number): boolean {
    geometry.setAttribute('flag', new Uint8BufferAttribute(fill, 3, true));
    const enable = material.userData['useFlagAttribute'] as (() => void) | undefined;
    enable?.();
    state.progress = 1;
    state.stage = 'done';
    state.ready = true;
    state.buildMs += performance.now() - begun;
    handedBack = performance.now();
    return true;
  }

  const layer: FlagLayer = {
    state,
    build(budgetMs: number): boolean {
      if (state.ready) return true;
      const begun = performance.now();
      state.calls++;
      const gap = handedBack === 0 ? FRAME_MS : begun - handedBack;
      const allowance = Math.min(CATCH_UP_CAP, Math.max(budgetMs, (budgetMs * gap) / FRAME_MS));
      const handBack = (): boolean => {
        state.buildMs += performance.now() - begun;
        handedBack = performance.now();
        return false;
      };

      // Stage one: the colour table, a step at a time. Each step reports how
      // far along it is, so `progress` moves through it.
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
          paintRun(fill, t, upto, next.pattern);
          state.painted += upto - t;
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
      return finish(begun);
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
 * Drives the layer to completion the way `main.ts` does, and reports it.
 *
 * The build is a generator turned across frames, and the failure that shape
 * has is the generator being recreated per call instead of resumed, which looks
 * like a slow build. They are told apart by whether the work is kept:
 * `progress` must never go backwards and the loop must end inside a bounded
 * number of calls. Takes the mesh the game builds rather than building one,
 * since that mesh is larger than a bare `buildLand`; pass a mesh nothing else
 * has asked about (the layer is one per mesh).
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
