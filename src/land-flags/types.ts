/** The map-colour layer's data and report shapes. */
import type { LandRing } from '../geo.ts';

/**
 * One ring's triangles, in the order `buildLand` emitted them. The mesh is
 * grouped by ring (a ring's surface, then the wall under its boundary), and a
 * country's rings need not be adjacent, so the span is per ring.
 */
export interface RingSpan {
  ring: LandRing;
  /** First and last-plus-one triangle of the ring's own surface. */
  surface: readonly [number, number];
  /** And of the wall under its boundary, which is that surface a shade down. */
  wall: readonly [number, number];
}

/** What `buildLand` leaves on the mesh for the layer to find. */
export interface LandFlagData {
  spans: RingSpan[];
  /** The shade `buildLand` gives a coastal wall, so the fill takes the same one. */
  wallShade: number;
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
   * How many countries were moved off their flag's own colour, how many of
   * those took a different colour of the same flag, and how many frontiers
   * the de-conflict could not open up (should be zero; see `country-colors.ts`).
   */
  moved: number;
  switched: number;
  short: { a: string; b: string; distance: number }[];
  /**
   * How much of the whole one-time build is done, 0 to 1. A resumed build
   * climbs; a restarted one would sit near zero while `buildMs` went up.
   */
  progress: number;
  /**
   * How many times `build` has been called and how many generator steps it
   * has taken. Few calls after seconds of wall clock means the render loop is
   * not running; steps climbing with `progress` near zero means the generator
   * is being restarted rather than resumed.
   */
  calls: number;
  steps: number;
  /** What the whole build has spent, in milliseconds of CPU. */
  buildMs: number;
  /** True once the attribute is on the geometry and the program knows it. */
  ready: boolean;
}

/**
 * The layer, built once and then free: `build` is called with a millisecond
 * budget every frame until it says it is done; `setFade` is one uniform a frame
 * after that and touches no buffer.
 */
export interface FlagLayer {
  /** Live; `main.ts` copies it before handing it to a console. */
  state: LandFlagState;
  /** Advances the build by at most `budgetMs`. True once there is nothing left. */
  build(budgetMs: number): boolean;
  /** The altitude fade, 0 to 1. Multiplied by `ceiling` on the way to the GPU. */
  setFade(fade: number): void;
  /** What a full fade blends to. */
  setCeiling(value: number): void;
}

/** What driving the whole build to the end came to. See `verifyFlagLayer`. */
export interface FlagLayerReport {
  /** False if the build did not finish inside the call cap. */
  ready: boolean;
  /** How many `build` calls it took, how many generator steps, and the cap. */
  calls: number;
  steps: number;
  cap: number;
  /** CPU spent, and the worst single call: the frame a player would feel. */
  spentMs: number;
  worstCallMs: number;
  /** The most `progress` ever went backwards. Anything but 0 is a restart. */
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
