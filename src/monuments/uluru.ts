import type { Monument } from './contract.ts';

/**
 * Uluru.
 *
 * The one monument that is not architecture: no repetition, symmetry or plan,
 * and every helper makes a regular solid. Three things name the rock.
 *
 * 1. The profile: a long, low, rounded, asymmetric loaf, one end a blunt
 *    near-vertical wall and the other a long ramp. `CREST` is that outline as a
 *    table of control points.
 * 2. The shoulders: the flanks rise almost vertically and then turn over, so
 *    each column is three stacked courses (flank, brow, cap) that step
 *    inwards, giving two visible ledges rather than a smooth arc.
 * 3. The fluting: the rock is sliced across its length into 30 vertical slabs
 *    and each seam is a flute, since a slab slightly narrower or wider than its
 *    neighbour gives a real edge for the outline to ink. Slicing across the
 *    length gives the profile (the slab tops) and the flutes (the slab sides)
 *    from one decision; ribs round the perimeter and horizontal contour slices
 *    each lose one of them.
 *
 * One noise drives it: a column's `grain` sets how far it stands proud, how deep
 * its notch in the skyline is, how wide it is and whether it is stained, so a
 * gully is one decision. The slab boundaries are drifted by the same hash.
 *
 * Scale: Uluru is 3,600 m long and 348 m high (10.3:1, past `MAX_ASPECT`), so
 * the vertical is exaggerated 3.6x, to 106 x 37 (2.9:1). The plan is the real
 * 106 x 61 for 3,600 x 2,000 m. Tier `building`: a circular footprint caps a
 * 3:1 landform at 110 wide and 37 tall, which fills 95% of `building`'s height
 * and 100% of its footprint, the same envelope as the Colosseum.
 *
 * Colour: `orange`, since `clay` is only a darker version of Australia's
 * `salmon` land colour. It runs from deep rust in shadow to full orange in the
 * sun. A second rock tone for recessed columns read as paint, so the only other
 * stone is `bark`, on the columns the grain has cut deepest. `green` is the
 * spinifex and mulga at the foot.
 */

// --- the envelope ---

const HALF_LENGTH = 53;
const HALF_WIDTH = 30.5;
const CREST_HEIGHT = 37;

/** Slabs across the length. Each is one flute; 30 over 106 units is a 3.5-unit pitch. */
const FLUTES = 30;

/**
 * Plan outline: a superellipse `|u|^n + (w/B)^n = 1`. 2.3 gives the rounded
 * oblong the real rock has and keeps every corner inside the 55-unit footprint
 * circle.
 */
const PLAN_POWER = 2.3;

/**
 * The profile, as a fraction of `CREST_HEIGHT` at `u = x / HALF_LENGTH`.
 *
 * From -1.00 to -0.84 it gains 94% of the height (the blunt wall), then the
 * crest holds between 0.90 and 1.00 for more than half the rock, then the end
 * steepens as it falls. The long flat middle is what makes it a monolith rather
 * than an arc; the small dips at -0.56, -0.34 and -0.10 are saddles that keep
 * the level crest from becoming a mesa.
 */
const CREST: ReadonlyArray<readonly [number, number]> = [
  [-1.0, 0.0],
  [-0.98, 0.42],
  [-0.95, 0.68],
  [-0.9, 0.85],
  [-0.84, 0.94],
  [-0.76, 0.98],
  [-0.66, 1.0],
  [-0.56, 0.95],
  [-0.46, 0.98],
  [-0.34, 0.93],
  [-0.22, 0.97],
  [-0.1, 0.94],
  [0.02, 0.96],
  [0.14, 0.9],
  [0.26, 0.92],
  [0.38, 0.85],
  [0.5, 0.78],
  [0.62, 0.7],
  [0.72, 0.58],
  [0.82, 0.44],
  [0.9, 0.3],
  [0.96, 0.16],
  [1.0, 0.0],
];

// --- the cross-section ---

/**
 * Where each course of a column starts and stops, and how wide it is against
 * that column's plan half-width. Flank almost vertical, then two ledges that
 * turn the flank over into the cap:
 *
 * ```
 *   1.00 h                ______           0.58 w
 *   0.86 h            ___/      \___       0.66 w   <- brow ledge, 3.7 units deep
 *   0.62 h        ___/              \___   0.90 w   <- shoulder ledge, 3.0 deep
 *   0.00 h       |                      |  1.05 w
 * ```
 *
 * The ledges are deep (an inset of 10% of the width) so the course below shows
 * as a real sill; at 3% the eye does not find it. `lap` is how far a course
 * spills sideways past its own slab, as a multiple of the slab's half-width.
 * `taper` narrows in x as well as z, so a course that pulls in to 40% would tear
 * a gap at the top; each `lap` is set just past the inverse of that course's
 * narrowing (1.16 x 0.879 = 1.02 for the cap).
 */
interface Course {
  base: number;
  top: number;
  wide: number;
  narrow: number;
  lap: number;
  /**
   * How much of this column's flute offset the course carries. The fluting dies
   * out before the top: the flank carries it whole, the brow a quarter and the
   * cap none, so every cap sits on the same plan curve and merges into one
   * ridge, with only the step in height left as the notch a gully makes. Carried
   * all the way up, each column's cap gets its own outline and they read as
   * organ pipes.
   */
  flute: number;
}

const COURSES: ReadonlyArray<Course> = [
  { base: 0, top: 0.62, wide: 1.05, narrow: 1.0, lap: 1.18, flute: 1 },
  { base: 0.62, top: 0.86, wide: 0.9, narrow: 0.78, lap: 1.31, flute: 0.28 },
  { base: 0.86, top: 1, wide: 0.66, narrow: 0.58, lap: 1.16, flute: 0 },
];

/** What the last couple of columns get instead: one wedge, ground to crest. */
const TOE: Course = { base: 0, top: 1, wide: 1.05, narrow: 0.55, lap: 1.35, flute: 0.6 };

/** Below this a course is a sliver worth no draw call; the toe gets one wedge instead. */
const MIN_COURSE = 0.7;
const SHORTEST_COURSE = Math.min(...COURSES.map((c) => c.top - c.base));

/** How much the grain moves a slab's width, its height, and its own boundaries. */
const FLUTE_DEPTH = 0.125;
const CREST_WOBBLE = 0.035;
const CREST_SWELL = 5;
const NOTCH = 0.011;
const BOUNDARY_DRIFT = 0.34;
/** How far a column's two ledges slide off the nominal heights. */
const LEDGE_JITTER = 0.13;

// --- the scrub ---

/**
 * Spinifex and mulga at the foot: `x` along the rock, `side` which flank, `gap`
 * how far clear of the toe, then the clump's own box and its yaw. Kept low (5%
 * of the rock) so they say how big the thing behind them is; a negative `gap`
 * buries a clump in the toe.
 */
const SCRUB: ReadonlyArray<{
  x: number;
  side: number;
  gap: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
}> = [
  { x: -41, side: 1, gap: 0.5, w: 9, h: 2.0, d: 5.5, yaw: 0.35 },
  { x: -28, side: 1, gap: 3.0, w: 6, h: 1.6, d: 4.0, yaw: -0.2 },
  { x: -11, side: 1, gap: -1.0, w: 8, h: 2.3, d: 5.0, yaw: -0.5 },
  { x: 9, side: 1, gap: 2.5, w: 7, h: 1.7, d: 4.5, yaw: 0.2 },
  { x: 27, side: 1, gap: -0.5, w: 10, h: 2.1, d: 5.0, yaw: 0.15 },
  { x: 41, side: 1, gap: 1.5, w: 6, h: 1.6, d: 4.0, yaw: -0.3 },
  { x: -45, side: -1, gap: 1.0, w: 7, h: 1.8, d: 4.5, yaw: 0.45 },
  { x: -19, side: -1, gap: -1.0, w: 6, h: 2.2, d: 4.0, yaw: -0.25 },
  { x: 2, side: -1, gap: 3.0, w: 9, h: 1.7, d: 5.5, yaw: 0.15 },
  { x: 32, side: -1, gap: 0.5, w: 7, h: 2.0, d: 4.5, yaw: -0.4 },
];

// --- functions ---

/** The authored profile, linearly interpolated. */
function crestAt(u: number): number {
  const first = CREST[0]!;
  if (u <= first[0]) return first[1];
  for (let i = 1; i < CREST.length; i++) {
    const a = CREST[i - 1]!;
    const b = CREST[i]!;
    if (u <= b[0]) return a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0]);
  }
  return CREST[CREST.length - 1]![1];
}

/** Plan half-width at `u`. */
function planAt(u: number): number {
  const t = Math.min(1, Math.abs(u));
  return HALF_WIDTH * Math.pow(Math.max(0, 1 - Math.pow(t, PLAN_POWER)), 1 / PLAN_POWER);
}

/**
 * Deterministic pseudo-noise in [-1, 1], one value per slab. A hash rather than
 * sines: over thirty samples incommensurate sines beat at a period of about ten
 * and the deep gullies came out evenly spaced.
 */
function grain(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

/**
 * The same hash smoothed across `span` slabs, so what it drives is a swell
 * rather than a fence. The crest needs it: raw, every column's height is
 * independent and the skyline is thirty separate steps. The per-column notch
 * stays sharp on top of it.
 */
function swell(i: number, seed: number, span: number): number {
  const t = i / span;
  const a = Math.floor(t);
  const f = t - a;
  const ease = f * f * (3 - 2 * f);
  return grain(a, seed) * (1 - ease) + grain(a + 1, seed) * ease;
}

export const uluru: Monument = {
  id: 'uluru',
  name: 'Uluru',
  iso: 'AUS',
  lat: -25.345,
  lon: 131.036,
  realHeight: 348,
  tier: 'building',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const sunlit = palette.orange;
    const stain = palette.bark;
    const scrub = palette.green;

    const group = new THREE.Group();

    // Slab boundaries, drifted off the even division so the flutes vary in width; the two ends are pinned.
    const edges: number[] = [];
    const pitch = (2 * HALF_LENGTH) / FLUTES;
    for (let j = 0; j <= FLUTES; j++) {
      const drift = j === 0 || j === FLUTES ? 0 : grain(j, 4.1) * BOUNDARY_DRIFT * pitch;
      edges.push(-HALF_LENGTH + pitch * j + drift);
    }

    for (let i = 0; i < FLUTES; i++) {
      const left = edges[i]!;
      const right = edges[i + 1]!;
      const centre = (left + right) / 2;
      const halfX = (right - left) / 2;
      const u = centre / HALF_LENGTH;

      // One number decides how far this column stands proud, how deep its notch is and its colour.
      const g = grain(i, 1.3);
      // Cubed a little before it is used as depth: raw, every column gets a step of
      // much the same size and the flank comes out as corduroy; cubed, the middling
      // columns stay nearly flush and a few cut properly deep.
      const flute = g * (0.5 + 0.5 * g * g);
      const plan = planAt(u);
      const height =
        CREST_HEIGHT *
        crestAt(u) *
        (1 + CREST_WOBBLE * swell(i, 9.7, CREST_SWELL) - NOTCH * Math.max(0, -g));

      const rock = g < -0.68 ? stain : sunlit;

      /** One course of this column: a rectangular frustum standing on the one below. */
      const course = (spec: Course, base: number, top: number, color: number) => {
        const width = plan * (1 + FLUTE_DEPTH * flute * spec.flute);
        // `taper` is square in plan, so it is built to the column's z widths and
        // stretched uniformly in x; `lap` is chosen against that narrowing.
        const mesh = taper(
          width * spec.wide,
          width * spec.narrow,
          height * (top - base),
          color,
          4,
        );
        mesh.scale.x = (halfX * spec.lap) / (width * spec.wide);
        mesh.position.set(centre, height * base, 0);
        group.add(mesh);
      };

      // At the far end of the ramp a column is a couple of units tall; one wedge says the same thing.
      if (height * SHORTEST_COURSE < MIN_COURSE) {
        course(TOE, TOE.base, TOE.top, rock);
        continue;
      }

      // Where this column's two ledges fall. At the nominal fractions they form two
      // unbroken contour lines along the rock, which read as corrugated iron;
      // jittered per column they are a broken line that steps up and down.
      const seams = [
        0,
        COURSES[0]!.top * (1 + LEDGE_JITTER * grain(i, 3.7)),
        COURSES[1]!.top * (1 + LEDGE_JITTER * 0.5 * grain(i, 5.9)),
        1,
      ];
      COURSES.forEach((c, k) => {
        course(c, seams[k]!, seams[k + 1]!, c.flute === 0 ? sunlit : rock);
      });
    }

    // --- the scrub at the foot ---
    for (const clump of SCRUB) {
      const toe = planAt(clump.x / HALF_LENGTH) * COURSES[0]!.wide;
      const bush = box(clump.w, clump.h, clump.d, scrub);
      bush.position.set(clump.x, 0, clump.side * (toe + clump.gap));
      bush.rotation.y = clump.yaw;
      group.add(bush);
    }

    return group;
  },
};
