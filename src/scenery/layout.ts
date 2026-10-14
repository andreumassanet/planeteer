import { VARIANTS } from './contract.ts';
import type { RegionStyle } from './contract.ts';
import { rngFrom } from './random.ts';
import type { Weighted } from './random.ts';

/**
 * Where the parts go.
 *
 * Kept apart from the geometry: a part answers "what does a house look like",
 * this answers "where are the houses". Neither knows how the result reaches the
 * screen (groups added as they are, a settlement merged by material, or
 * transforms handed to an `InstancedMesh` per variant).
 *
 * Layout is also where repetition shows. A part can vary perfectly and still
 * read as wallpaper if it is placed on a lattice, so the three levers here are
 * position jitter, plot size, and alignment: yaw drawn uniformly makes a village
 * of debris, yaw snapped to a grid makes a barracks.
 */

const TAU = Math.PI * 2;

export interface Plot {
  x: number;
  z: number;
  /** Radians about Y. */
  yaw: number;
  /** How much room this plot has, in world units. What stands here must fit. */
  size: number;
  /** From the centre of the settlement, so a caller can grade what goes where. */
  distance: number;
  /** Stable, and derived from the cell — not from a counter. See `random.ts`. */
  seed: number;
  /**
   * The cell this plot came out of. Carried rather than recoverable, because the
   * jitter is one-way: a plot may wander 0.38 of a pitch from its cell, so
   * `round(x / pitch)` names the wrong cell for about a fifth of them.
   * `settlements.ts` lays the ground and the streets on this same lattice, so the
   * two must agree which cell a house belongs to or the house stands in the road.
   */
  col: number;
  row: number;
}

export interface PlotOptions {
  /** Radius of the settlement, in world units. */
  radius: number;
  /** Centre-to-centre plot pitch. `RegionStyle.spacing` times a plot size. */
  pitch: number;
  /** Share of cells that get built on at all. Under 1 it leaves yards and gaps. */
  fill?: number;
  /** How far a plot may wander from its cell, as a fraction of the pitch. */
  jitter?: number;
  /** 0 leaves yaw free, 1 snaps every building square to the same street. */
  alignment?: number;
  /**
   * How much room a plot has, as a fraction of the pitch, low and high. It is an
   * option because the room a plot has to offer is set by the parts that stand in
   * it (authored at `SCENERY_SCALE`), while how many plots a disc holds goes as
   * the square of the pitch: a wider fraction with a tighter pitch leaves the
   * absolute plot sizes unchanged and buys more cells (see `PLOT_PITCH` in
   * `settlements.ts`). The default is the pair `hamlet` uses.
   */
  plot?: readonly [number, number];
}

/**
 * A jittered grid over a disc.
 *
 * A grid rather than a Poisson disc for one reason that outweighs the prettier
 * distribution: a cell is an *identity*. `(column, row)` seeds the plot, so
 * adding a settlement, changing its radius or dropping a part leaves every other
 * plot exactly where it was. A relaxation pass would make each plot depend on
 * its neighbours, and then editing anything moves everything.
 */
export function plots(seed: number | string, options: PlotOptions): Plot[] {
  const { radius, pitch } = options;
  const fill = options.fill ?? 0.72;
  const jitter = options.jitter ?? 0.38;
  const alignment = options.alignment ?? 0.6;
  const [plotLow, plotHigh] = options.plot ?? [0.5, 0.88];
  const half = Math.ceil(radius / pitch);
  const found: Plot[] = [];

  for (let row = -half; row <= half; row++) {
    for (let column = -half; column <= half; column++) {
      const rng = rngFrom(seed, column, row);
      if (!rng.chance(fill)) continue;

      const x = column * pitch + rng.jitter() * pitch * jitter;
      const z = row * pitch + rng.jitter() * pitch * jitter;
      const distance = Math.hypot(x, z);
      if (distance > radius) continue;

      // A quarter turn is the street grid; the jitter either side of it is what
      // keeps the street from being a wall. At alignment 1 the spread is a
      // couple of degrees, at 0 it is a free spin.
      const square = Math.round(rng.unit() * 4) * (TAU / 4);
      const free = rng.unit() * TAU;
      const yaw = square + (free - square) * (1 - alignment) + rng.jitter() * 0.12;

      found.push({
        x,
        z,
        yaw,
        size: pitch * rng.range(plotLow, plotHigh),
        distance,
        seed: rngFrom(seed, column, row, 'plot').unit() * 0x7fffffff,
        col: column,
        row,
      });
    }
  }
  return found;
}

export interface Placed {
  partId: string;
  /** Which of the part's `VARIANTS` builds stands here. */
  variant: number;
  plot: Plot;
  /** Uniform scale on the variant. The only per-instance freedom besides the transform. */
  scale: number;
}

export interface HamletOptions {
  radius: number;
  /** Plots inside this get a building; outside it, greenery. */
  core?: number;
  /**
   * A part's footprint radius, by id. Passed in rather than looked up so this
   * file never imports the registry: `index.ts` imports this, and a cycle
   * between the two only shows up as an undefined at load time. Without it a
   * large terrace block lands on a small plot and interpenetrates its neighbour.
   */
  footprintOf?: (id: string) => number;
}

/**
 * A provisional settlement, for putting forty houses down: repetition is
 * invisible in a single house and obvious in forty. Its rules:
 *
 * - One civic building at the centre, which decides the whole read: a village
 *   with a minaret over it is somewhere.
 * - Buildings in the core, greenery outside it, graded by distance so the edge
 *   dissolves instead of ending.
 * - The variant is drawn from the plot's own seed, so a plot keeps its house
 *   when the part library grows.
 */
export function hamlet(
  seed: number | string,
  style: RegionStyle,
  options: HamletOptions,
): Placed[] {
  const radius = options.radius;
  const core = options.core ?? radius * 0.62;
  const footprintOf = options.footprintOf ?? (() => 0);
  const pitch = style.spacing * 13;
  const found = plots(seed, { radius, pitch, alignment: 0.55 });
  found.sort((a, b) => a.distance - b.distance);

  /** The entries of a mix that fit this plot, or null if none do. */
  const fitting = (mix: readonly Weighted<string>[], room: number): Weighted<string>[] | null => {
    const ok = mix.filter((entry) => footprintOf(entry.item) <= room);
    return ok.length > 0 ? ok : null;
  };

  const placed: Placed[] = [];
  // The civic building takes the middle and clears a square around itself: it is
  // the one thing in a settlement that is *approached*, and a spire with houses
  // built into it is worse than no spire.
  const centre = found[0];
  let cleared = 0;
  if (centre !== undefined) {
    const rng = rngFrom(centre.seed, 'civic');
    const id = rng.weighted(style.civic);
    cleared = footprintOf(id) * 1.15;
    placed.push({ partId: id, variant: rng.int(VARIANTS), plot: centre, scale: rng.spread(1, 0.06) });
  }

  for (let index = 1; index < found.length; index++) {
    const plot = found[index]!;
    if (plot.distance < cleared) continue;
    const rng = rngFrom(plot.seed, 'what');
    const room = plot.size * 0.95;

    if (plot.distance < core) {
      const mix = fitting(style.buildings, room);
      // No building fits: a yard, not a smaller building squeezed in.
      if (mix === null) continue;
      placed.push({
        partId: rng.weighted(mix),
        variant: rng.int(VARIANTS),
        plot,
        // Under a tenth either way. Past that a scaled house stops reading as a
        // different house and starts reading as the same house seen from further
        // off, which is worse than no variation at all.
        scale: rng.spread(1, 0.09),
      });
      continue;
    }

    // Greenery thins out towards the edge instead of stopping at a line.
    const edge = (plot.distance - core) / Math.max(1, radius - core);
    const trees = fitting(style.trees, room);
    if (trees !== null && rng.chance(style.greenery * (1 - edge * 0.45))) {
      placed.push({ partId: rng.weighted(trees), variant: rng.int(VARIANTS), plot, scale: rng.spread(1, 0.14) });
      continue;
    }
    const scatter = fitting(style.scatter, room);
    if (scatter !== null && rng.chance(0.45)) {
      placed.push({ partId: rng.weighted(scatter), variant: rng.int(VARIANTS), plot, scale: rng.spread(1, 0.2) });
    }
  }
  return placed;
}
