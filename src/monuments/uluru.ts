import type { Monument } from './contract.ts';

/**
 * Uluru.
 *
 * The one monument in the set that is not architecture. There is no repetition
 * to lean on, no symmetry, no plan — and every helper in the toolkit makes a
 * regular solid. A squashed dome would pass `validate` and read as a hill, so
 * the whole file is arranged around the three things that actually name this
 * rock, in the order a person recognises them.
 *
 * 1. **The profile.** A long, low, rounded loaf, asymmetric: one end is a blunt
 *    near-vertical wall, the other is a long ramp into the sand. `CREST` is that
 *    outline, written as a table of control points the way `eiffel-tower.ts`
 *    writes its levels — the silhouette is authored, not computed from a curve
 *    that happens to be smooth.
 * 2. **The shoulders.** The flanks rise almost vertically and only then turn
 *    over. Each column of the rock is therefore three stacked courses —
 *    flank, brow, cap — that step inwards, so the cross-section is a rounded
 *    loaf with two visible ledges rather than a smooth arc from ground to
 *    summit. A dome has no shoulder; Uluru is nothing but shoulder.
 * 3. **The fluting.** The parallel gullies water has cut down the flanks, which
 *    is the texture that names the thing and the reason it is a rock and not a
 *    hill. **This is where the budget went**, and it is also the construction:
 *    the rock is sliced across its length into 30 vertical slabs, and every
 *    seam between two slabs is a flute. Nothing is added to make them — a slab
 *    is a little narrower or wider than its neighbour, so the step between them
 *    is a real edge, and `OutlineEffect` inks it. It is the Colosseum's attic
 *    trick ("overlapping the blocks slightly leaves a seam at every joint")
 *    turned into the whole surface. It fades as it climbs: see `flute` on
 *    `Course` for why the crest has to be free of it.
 *
 * **Why slabs across the length and not ribs around the perimeter.** Ribs stood
 * on the outline were the first attempt: they give the fluting but the plan
 * governs their placement, so the *profile* — the thing you recognise first —
 * has to come from somewhere else, and the ends turn into a fan of wedges. A
 * stack of horizontal contour slices was the second: it gives the profile and
 * the rounded top, but every seam it draws is horizontal, so it terraces, and
 * terracing reads as a ziggurat. Slicing across the length gives both from one
 * decision — the tops of the slabs trace the profile, the sides of the slabs
 * are the flutes — which is why it won.
 *
 * **One noise drives everything.** A column's `grain` decides how far it stands
 * proud, how deep its notch in the skyline is, how wide it is, and whether it is
 * stained: a negative grain is narrower *and* shorter *and* darker, so the
 * gully is recessed on the flank, notches the crest and reads as shadow, which
 * is one gully rather than three unrelated decisions. The slab boundaries are
 * drifted by the same hash so the flutes are not a comb.
 *
 * **Scale.** Uluru is 3,600 m long and 348 m high: 10.3 to 1, far past
 * `MAX_ASPECT`. Following the note beside it, the axis carrying the least
 * recognition is distorted and the one carrying the most is protected — here
 * that means the **vertical is exaggerated 3.6x**, bringing it to 106 x 37, or
 * 2.9 to 1, which is the proportion a photograph of Uluru already has because
 * no photograph fits the whole 3.6 km in. The plan is untouched: 106 x 61 is
 * the real 3,600 m x 2,000 m. Nothing is cropped.
 *
 * **Tier.** `building`, not `landmark`, and the reason is arithmetic rather
 * than modesty. A circular footprint caps any monument at 55 units of radius,
 * so a 3:1 landform can be at most 110 wide and 37 tall — which is the
 * `building` tier's 40-unit height almost exactly, and a third of `landmark`'s
 * 120. Filed as a landmark it would fill 31% of its tier's height; filed as a
 * building it fills 95% of it and 100% of its footprint. It lands in the same
 * envelope as the Colosseum (104 x 34) and is the same size on the ground.
 *
 * **Colour: `orange`, and it took two wrong answers to get there.** `clay` is
 * the obvious sandstone choice and it is wrong, because Australia's own land
 * colour in `theme.ts` is `salmon` and `clay` is only a darker salmon — the rock
 * would sit on its continent as a slightly browner lump. `orange` has salmon's
 * red channel and almost none of the other two, so it reads as the same desert
 * in a much stronger key, and under the 4-step ramp it runs from deep rust in
 * shadow to full orange in the sun, which is the range of the photograph.
 *
 * The second wrong answer was a second rock tone for the recessed columns. Both
 * candidates failed for the same measurable reason: `clay` and `red` sit within
 * a few points of `orange`'s luminance, so they do not read as shadow, they read
 * as *paint* — vertical stripes down a pumpkin. So the rock is one colour, and
 * the only other stone in it is `bark`, at half the luminance, on the handful of
 * columns the grain has already cut deepest. Colour and geometry say the same
 * thing there, which is what makes it read as a shadowed cleft instead of a
 * stripe. `green` is the spinifex and mulga at the foot: it is in every
 * photograph, it gives the rock a base to stand on rather than a cut-out edge,
 * and next to the avatar it is the only thing in frame with a human's scale.
 */

// --- the envelope ---------------------------------------------------------

const HALF_LENGTH = 53;
const HALF_WIDTH = 30.5;
const CREST_HEIGHT = 37;

/** Slabs across the length. Each is one flute; 30 over 106 units is a 3.5-unit pitch. */
const FLUTES = 30;

/**
 * Plan outline: a superellipse `|u|^n + (w/B)^n = 1`. An ellipse (n = 2) gives
 * pointed ends, a rectangle (n -> inf) gives square ones; 2.3 gives the rounded
 * oblong the real rock has, and keeps every corner inside the 55-unit footprint
 * circle — which an ellipse's blunter cousins do not.
 */
const PLAN_POWER = 2.3;

/**
 * The profile, as a fraction of `CREST_HEIGHT` at `u = x / HALF_LENGTH`.
 *
 * Read it left to right and it is the postcard: from -1.00 to -0.84 it gains 94%
 * of the height in 8% of the length — the blunt wall — then a crest that holds
 * between 0.90 and 1.00 for **more than half the rock**, then an end that
 * steepens as it falls.
 *
 * The long flat middle is the correction that mattered. A crest that starts
 * coming down as soon as it has finished going up is an arc, and an arc is a
 * hill; what makes Uluru a *monolith* is that the top is nearly level for
 * kilometres and the ground it stands on is nearly level too. The small dips at
 * -0.56, -0.34 and -0.10 are the saddles in the skyline — without them the level
 * crest turns into a mesa instead.
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

// --- the cross-section ----------------------------------------------------

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
 * The ledges have to be *deep*, and the first version's were not: an inset of
 * 3% of the width is a line the renderer draws and the eye does not find. At 10%
 * the top face of the course below shows as a real sill three units wide, which
 * from the front is the horizontal seam that says the flank stopped and the top
 * began. That seam is the shoulder. Without it the flank and the cap read as one
 * continuous curve, which is a dome, which is the one thing Uluru is not.
 *
 * `lap` is how far a course spills sideways past its own slab, as a multiple of
 * the slab's half-width. `taper` narrows in x as well as z — it has no way not
 * to — so a course that pulls in to 40% of its width would tear a gap between
 * itself and its neighbour at the top. Each `lap` is set just past the inverse
 * of that course's own narrowing (1.16 x 0.879 = 1.02 for the cap), which closes
 * the seam with a little to spare and leaves the small overhangs real rock has
 * anyway.
 */
interface Course {
  base: number;
  top: number;
  wide: number;
  narrow: number;
  lap: number;
  /**
   * How much of this column's flute offset the course carries.
   *
   * **The fluting has to die out before the top, and this is the field that
   * does it.** With the flutes carried all the way up, every column owned its
   * own cap, `OutlineEffect` drew a line right round each one, and thirty of
   * them side by side read as a bundle of organ pipes rather than as one rock —
   * a crest made of separate blocks, which is the failure mode a stack of
   * prisms falls into if nothing stops it. On the real rock the gullies are cut
   * *into* the flanks and fade out near the summit; the crest is continuous.
   * So the flank carries the flute whole, the brow carries a quarter of it,
   * and the cap carries none at all: every cap sits on the same plan curve, so
   * they merge into one ridge and the only thing left between them is the step
   * in height, which is the notch a gully makes in the skyline.
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

// --- the scrub ------------------------------------------------------------

/**
 * Spinifex and mulga at the foot: `x` along the rock, `side` which flank, `gap`
 * how far clear of the toe, then the clump's own box and its yaw. Kept low —
 * 5% of the rock, a third of the avatar — because their whole job is to say how
 * big the thing behind them is, and a negative `gap` buries a clump in the toe
 * so it reads as scrub growing out of the rock rather than a crate parked
 * beside it.
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

// --- functions ------------------------------------------------------------

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
 * Deterministic pseudo-noise in [-1, 1], one value per slab.
 *
 * This started as three sines with incommensurate frequencies, which is the
 * usual trick and was wrong here: over only thirty samples they beat against
 * each other at a period of about ten, so the deep gullies came out **evenly
 * spaced** — four black slots at equal intervals, which is the one thing a
 * water-cut rock never is. A hash has no period to find. It is a pure function
 * of its arguments, so it is as deterministic as the contract requires and the
 * loader's build-it-twice check confirms.
 */
function grain(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

/**
 * The same hash smoothed across `span` slabs, so what it drives is a swell
 * rather than a fence.
 *
 * The crest needs this and the flanks do not. Given the raw hash, the height of
 * every column was independent of its neighbours' and the skyline came out as
 * thirty separate steps — battlements. Uluru's crest rises and falls over
 * hundreds of metres at a time, which at 3.5 units a column is a feature about
 * five columns wide, so that is the span the swell is smoothed over. The
 * per-column notch stays sharp on top of it: a gully nicks the skyline, a swell
 * moves it.
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

    // Slab boundaries, drifted off the even division so the flutes vary in
    // width. The two ends are pinned: they are the footprint.
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

      // One number decides everything about this column: how far it stands
      // proud, how deep its notch in the skyline is, and what colour it is.
      const g = grain(i, 1.3);
      // Cubed a little before it is used as depth. Used raw, the hash gives
      // every column a step of much the same size and the flank comes out as
      // corduroy; this leaves the middling columns nearly flush and lets the few
      // extreme ones cut properly deep, which is how a fluted rock is actually
      // distributed — a mostly smooth flank with real gullies down it.
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
        // then stretched in x. The stretch is uniform, which is the point: the
        // course narrows by the same fraction in both axes, and `lap` is chosen
        // against that fraction so the top still overlaps the neighbour.
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

      // At the far end of the ramp a column is a couple of units tall and its
      // three courses would be slivers. One wedge says the same thing.
      if (height * SHORTEST_COURSE < MIN_COURSE) {
        course(TOE, TOE.base, TOE.top, rock);
        continue;
      }

      // Where this column's two ledges actually fall. Left at the nominal
      // fractions they land on one smooth curve parallel to the crest, and two
      // unbroken contour lines running the length of the rock are the single
      // strongest reason a ribbed model reads as corrugated iron rather than as
      // stone. Jittered per column they become what a ledge on a weathered rock
      // is: a broken line that steps up and down as it goes.
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
