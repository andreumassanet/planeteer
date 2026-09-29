import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Niagara Falls.
 *
 * **Three things are taken from `victoria-falls.ts` and not rediscovered
 * here.** That file is the only other waterfall in the list and it did the
 * general work; this one is about where the two places differ, which is nearly
 * everywhere.
 *
 * 1. **A waterfall is a shape of land.** Falling water has no silhouette, and
 *    this toolkit draws neither texture nor motion. So the monument is the
 *    landform and the water is what makes it visible.
 * 2. **The contact sheet's quarter camera sits 13.4 degrees above the model**
 *    (`VIEWS` in `sheets/monuments.ts`), so a gorge narrower than it is deep cannot
 *    be seen into and has to be cut open. The arithmetic is Victoria's; the
 *    conclusion here is the opposite one, and that is the whole point — see
 *    below.
 * 3. **A big spray plume destroys the read it was advertising.** Victoria's
 *    first plume covered the one line the model existed to draw. Whatever plume
 *    survives here has to be small, lumpy, and placed where it cannot cross the
 *    thing being read.
 *
 * ---
 *
 * **What this monument is.**
 *
 * > **A bowl and a wall, with a wooded island wedged between them.** Niagara is
 * > the one waterfall shaped like an amphitheatre: the Canadian fall is a deep
 * > curved crest, concave toward the viewer, pouring inward from three sides
 * > into an open basin you can see the bottom of. Off to one side, dead
 * > straight and set at an angle across the same basin, is the American fall —
 * > shorter, and the only one of the three that lands on a mountain of its own
 * > fallen rock instead of dropping clean into water.
 *
 * Every unit of budget is spent, in this order, on:
 *
 * 1. **The curve.** Twelve facets of a half-circle 19.5 units in radius, opening
 *    downstream. Nothing else in the list is a curve like this, and it is drawn
 *    three times over: as a plan outline, as a white crest ribbon following that
 *    outline, and — the one that actually does the work at thumbnail size — as
 *    **light**. See the note on the ramp below.
 * 2. **The open mouth.** The two arms stop at the same line and nothing is built
 *    downstream of them, so the bowl is a `C` and not an `O`.
 * 3. **The second fall**, straight, yawed 20 degrees across the basin, its four
 *    slabs stepped in depth so that 22 units of white are not one blank
 *    rectangle, with Bridal Veil notched off its west end by Luna Island.
 * 4. **The talus** at its foot.
 * 5. **The island** that divides the two, wooded, its cliff facing the camera.
 * 6. **The basin**, one sheet of `skyBlue` that both falls land in. It is what
 *    the open mouth buys and what Victoria could not have, and at thumbnail size
 *    it is the fastest thing on the card to read as water.
 * 7. **The mist**, in a form small enough to survive the test — see below.
 *
 * ---
 *
 * **No cutaway, and why. This is the geometric gift.**
 *
 * Victoria's chasm is a slot about as wide as it is deep, and from 13.4 degrees
 * the near rim occludes everything but 1.9 units of a 27-unit drop, so its block
 * had to be sliced open to be seen at all. Run the same test here and it comes
 * out the other way, for one reason: **there is no near rim.** The bowl is open
 * downstream into a basin, so the sight line from the camera to the foot of the
 * far curtain — from the apex at `(-16, 2, -18.3)` along `(0.62, 0.28, 1)` —
 * crosses the mouth at `(-3.9, 7.5, 1)` and leaves the model over the basin at
 * `(-3.0, 7.9, 2.7)`, seven units west of the east arm's rim, which is the
 * nearest rock it could have met. Nothing occludes any curtain in either fixed
 * view.
 *
 * Two of the twelve *do* drop out of the quarter view, and it is worth naming
 * the difference, because it is the difference between a bowl and a slot: the
 * near arm's own inner faces (facets 10 and 11) turn away from a camera standing
 * at azimuth +31.8, so they are back faces, not hidden ones. Every facet you can
 * see, you see whole, from lip to pool. All twelve face the front camera.
 *
 * The crop that pays for that is real and is stated here rather than hidden: the
 * Niagara Gorge continues north for eleven kilometres with walls on both sides,
 * and **none of it is modelled**. The arms end at `BOWL_Z` and everything past
 * them is water at basin level. Building one unit of true gorge wall on the
 * camera's side of the falls would reinstate exactly the problem Victoria had.
 *
 * ---
 *
 * **The ramp is what draws the curve, and it decides which arm faces the front.**
 *
 * Twelve facets 15 degrees apart, each a flat toon fill, sweep the sun's dot
 * product across the whole bowl. With the scene's sun at `(-0.8, 1.25, 0.75)`
 * the twelve curtains read `n·L` from `-0.42` at the west arm through `0.45` at
 * the apex to `0.66` at the east, and the flat water on top reads `0.75`. The
 * ramp steps at `-0.5`, `0` and `+0.5`, so the sweep crosses two of those three
 * thresholds and the white lands on **three of the four bands**: facets 0-2 on
 * the second step, 3-5 on the third, 6-11 and the river on the top one.
 *
 * The honest shape of that is a *west-heavy* gradient, not an even fan — half
 * the bowl is on one band — and it is still the whole argument for building this
 * shape in this style: **a curved wall under cel shading bands itself**, in one
 * colour, with no ribs and no second paint. Victoria proved what ribs on a
 * curtain cost. Nothing else in the list gets three bands out of one surface.
 *
 * It also settles a question that has only one right answer. The quarter camera
 * sits at azimuth +31.8 degrees, so the near arm is the `+X` one and it shows
 * the camera its back. Putting the American fall on `+X` therefore costs
 * nothing — it is *already* the near side — and buys a lit face: at `+X` its
 * curtain looks toward `(-x, +z)`, which is `n·L = 0.59`, on the top band of the
 * ramp with room to spare. Mirrored to `-X` the same curtain reads `0.26` and
 * drops a band, so the model's second-largest white surface would be a step
 * darker than the water it is falling out of. `+X` is also where the American
 * fall genuinely is, north-east of the Horseshoe, so truth and light agree for
 * once.
 *
 * ---
 *
 * **The mist is in, at five puffs against Victoria's nine, and only where it
 * cannot cross the bowl.**
 *
 * The honest position first: **this model does not need it.** Victoria's land
 * came out at `halfDiagonal / height = 2.00`, dead on the cap, and its plume was
 * load-bearing — it took the ratio to 1.43. Here the land alone is `49.9 / 31.9
 * = 1.57`, so the plume buys nothing structural and had to be argued for on the
 * picture alone.
 *
 * Argued that way it is a near miss, and the placement is the whole of it. The
 * screen-up axis of the quarter camera is `(-0.122, 0.973, -0.197)`, so a point
 * clears the crest it stands behind only while `-0.122x + 0.973y - 0.197z` beats
 * the crest's own 31.8 at the apex. Every puff's base makes it: 32.9 for the
 * lowest, 39.2 for the highest, so all five silhouette against sky. Any cloud
 * *inside* the mouth — over the pool, where the real one boils — fails the same
 * test, lands on the bowl's interior and fills the concavity with white: the
 * exact failure Victoria had, except that here it would erase the monument
 * rather than the river beside it. So the five puffs all stand **behind the
 * apex** (`z <= -19`) and **above the rim** (`base >= 27.6`). What they cost is
 * a patch of the river upstream of the brink, about a fifth of its width, and
 * that is affordable here in a way it was not at Victoria: there the cyan lip
 * *was* the thesis, here it is corroboration and the shape carries itself.
 *
 * Lumps and not a dome, twelve-sided, overlapping in three tiers, closed by a
 * `taper` — all of that is Victoria's finding, reused as found.
 *
 * ---
 *
 * **Scale: the Horseshoe's plan is true, the vertical is stretched 5.2x.**
 *
 * Horizontally 1 unit is 11 m. The Horseshoe comes out as a half-circle of
 * radius 19.5 units, and the twelve chords that stand in for it measure 61.1
 * units — **672 m** against a surveyed 670, which is the happy accident this
 * model is built on: at Niagara the famous number and a plain semicircle agree.
 *
 * Vertically 1 unit is 2.11 m: 27 units for the 57 m drop, a stretch of
 * **5.21x**, within a hair of Victoria's 5.08 and Fuji's 4.8. True scale gives
 * `halfDiagonal / height = 9.6` against a cap of 2, so there is no version of
 * this place that is not stretched.
 *
 * **What the stretch broke.** At 5.2x the talus towers, and a 57 m drop starts
 * reading as a canyon. Both are more like the photographs than the survey is,
 * because a photograph of a waterfall is always taken from a place that
 * exaggerates the drop. What it genuinely cost is the *plan* of the small
 * things, so two of them are pushed back the other way, and neither is a plan
 * dimension of the Horseshoe:
 *
 * - **Bridal Veil is 3 units, 33 m, against a real 17.** Roughly 2x. Victoria
 *   learned this on Devil's Cataract: at true width a minor cataract is three
 *   pixels and reads as a chip, not as a fall.
 * - **Luna Island is 2 units, 22 m, against a real 13.** Same reason: it has to
 *   survive as a rib or Bridal Veil is not separated from anything.
 *
 * The American crest, for the record, is *not* one of them: 22 units of sheet
 * plus Bridal Veil and Luna Island is 27 units, 297 m, against a real crest of
 * about 290 with its two notches. It is the one large dimension in the model
 * that is neither stretched nor squeezed.
 *
 * **What the footprint cost, which is a different bill.** A circle of 52 has to
 * hold both falls, so the one thing that gives is the distance between them:
 *
 * - **The gap from the Horseshoe's east arm to the American crest is 17.9 units,
 *   196 m, against a Goat Island brink of roughly 350.** About half. This is the
 *   same distortion `build-monuments.ts` applies to the Sphinx and the Pyramids
 *   at world scale, made once by hand instead: at true separation the two falls
 *   stand 32 units apart, which puts the American shore's east end 64 units from
 *   the axis — past the `building` tier's own 55-unit cap — and the Horseshoe
 *   would have to shrink to pay for an *empty* island. The rule is to protect
 *   the proportion you would name the thing by, and nobody names Niagara by the
 *   width of Goat Island — but they do notice if the two falls are not in the
 *   same picture.
 *
 * **Tier: `building`,** by the same arithmetic as Victoria and Uluru. A circular
 * footprint caps any monument at 110 units across, and at `landmark`'s 120 of
 * height a landform this wide would be a wall. At 31.9 tall in land and 36.2
 * with the mist it fills 90% of `building`'s 40, and its 49.9 of radius is 96%
 * of the 52 it declares.
 *
 * ---
 *
 * **Colour.**
 *
 * The two-state trick is Victoria's and is not improved on, because it is right:
 * **`skyBlue` for flat water, `white` for aerated water, and the lip is the hard
 * boundary between them.** Still water reflects sky; falling water is white
 * foam; with no transparency and no motion that pair is the only cue there is.
 * Here it runs three times instead of once — blue river above the crest, white
 * down the curtain, blue again in the basin where the river re-forms below the
 * pool. Victoria could not have the third: nothing comes out of its slot.
 *
 * Everything else diverges:
 *
 * - **`bark` under `brown` at `COURSE`,** and at Niagara this is not a graphic
 *   device but the reason the place exists: hard Lockport dolostone over soft
 *   shale, the caprock undercut until it drops. `COURSE` sits at 15 of 27, so
 *   the `brown` band above it is 12 units — 25 m, against the real caprock's 24
 *   in a 57 m cliff.
 * - **`tan` in the talus, and nowhere else.** A rubble pile in one colour is a
 *   lump. Three values — `bark`, `brown`, `tan`, all warm, per the note on
 *   `ctx.palette` — is what makes it read as separate fallen blocks, and those
 *   blocks are the caprock from the course above them, which is the same fact
 *   told twice.
 * - **`green` everywhere vegetated, `darkOlive` for the tree clumps.** Victoria
 *   used this pair to tell spray-fed rainforest from dry mopane; Niagara is
 *   temperate and green throughout, so the pair does a different job — lawn
 *   against woodland, which is what Goat Island and Queen Victoria Park actually
 *   look like, and what makes the island read as *wooded* rather than as a green
 *   block.
 * - **No `bone`, no `slate`.** Same reason as everywhere else in this folder.
 */

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Heights. 1 unit = 2.11 m; the drop is 27.
// ---------------------------------------------------------------------------

/** Lip = plateau top = the river's surface at the brink. 57 m. */
const LIP_Y = 27;

/** Top of the rock under the river; the `skyBlue` plate is the 1.8 above it. */
const RIVER_Y = 25.2;

/**
 * Top of the white crest ribbon, 0.3 **below** the river.
 *
 * Victoria's finding, and it holds here for the same reason: anything standing
 * proud of the water occludes `height / tan(13.4deg)` — better than four times
 * itself — of the river behind it, and the river is only 13 deep. The lip is
 * worth more as a colour boundary than as a bump.
 */
const CREST_Y = 26.7;

/** Dolostone over shale: the 12 units above the line are 25 m, the real 24. */
const COURSE = 15;

/**
 * The wooded rims stand 1.3 above the water, and Goat Island 1.9.
 *
 * Not decoration. The **front** view sits only 6.8 degrees up, where a level
 * crest and its two flanking promontories all project to the same line and the
 * bowl flattens into a wall. Lifting the arms drops the crest into a visible
 * notch between them, which is how the curve survives a view that cannot see the
 * curve. It is also true: Table Rock and Terrapin Point are land above water.
 */
const BANK_Y = 28.3;
const ISLAND_Y = 28.9;

/** The plunge pool, and the flat river re-forming below it. */
const POOL_Y = 1.8;
const BASIN_Y = 1.6;

// ---------------------------------------------------------------------------
// The Horseshoe
// ---------------------------------------------------------------------------

/**
 * Centre and radius of the bowl.
 *
 * A plain half-circle, which is the model's one piece of luck: the twelve chords
 * of a semicircle of radius 19.5 measure 61.1 units, and at 11 m to the unit
 * that is 672 m against the Horseshoe's surveyed 670 m crest. The apex sits at
 * `BOWL_Z - BOWL_R` and the two arm tips on the line `z = BOWL_Z`, which is
 * where the model stops: everything downstream of that line is basin.
 */
const BOWL_X = -16;
const BOWL_Z = 1;
const BOWL_R = 19.5;

/**
 * Twelve facets over the half-circle.
 *
 * The count is set by the cel ramp, not by smoothness. Each facet is one flat
 * fill, so twelve of them across 180 degrees are twelve samples of `n·L`, which
 * here runs from -0.42 to +0.66 and crosses two of the ramp's three thresholds:
 * three bands of the four, inside a single white surface. Fewer facets and the
 * two band changes land on top of each other; more and the extra ones fall in
 * the east half, where the whole arc is already on the top band.
 *
 * The rim planks fan outward from their chords, so the plateau behind the crest
 * is twelve splayed fins with wedge gaps between them. Downstream of the arms
 * the upstream river slab and Goat Island fill those gaps; on the west flank,
 * past `x = -28`, three of them stay open and read as fluting in a cliff. That
 * is deliberate enough to leave alone — it is Uluru's fluting, and it costs no
 * mesh — but it is not visible from either fixed view, so it is written down
 * here rather than discovered by someone walking round it on the planet.
 */
const FACETS = 12;
const SPAN = (180 / FACETS) * DEG;

/** Radial depth of the rim: the land between the crest and where blocks take over. */
const RIM = 13;

/**
 * Which facets carry river behind them and which carry woodland, west to east.
 *
 * Deliberately asymmetric, and true. The Canadian side is open water from 15
 * degrees in from the west tip — the whole upper river sweeps in from there —
 * with facet 0 itself kept as land because that is Table Rock, which is land you
 * stand on; Goat Island crowds the east arm from 45 degrees round. One green
 * facet on the west and three on the east is also what stops the bowl reading as
 * a mirrored ornament.
 */
const GREEN_FACETS = new Set([0, 9, 10, 11]);

/**
 * The churn at the foot, as four blocks standing 4 to 6.5 out of the pool.
 *
 * White on white: they are invisible except for the ink, which is the entire
 * point. Victoria's note applies unchanged — a curtain meeting its pool in a
 * dead horizontal is the strongest **"this is a dam"** cue a model like this
 * has, and a dam is the misread to fear. `phi` places them around the arc.
 */
const CHURN: ReadonlyArray<{ phi: number; r: number; w: number; d: number; h: number }> = [
  { phi: -62, r: 12.6, w: 8.5, d: 4.6, h: 5.4 },
  { phi: -26, r: 11.8, w: 9.5, d: 5.0, h: 6.4 },
  { phi: 11, r: 12.2, w: 9.0, d: 4.6, h: 5.8 },
  { phi: 46, r: 12.8, w: 7.5, d: 4.2, h: 4.4 },
];

// ---------------------------------------------------------------------------
// The American Falls
// ---------------------------------------------------------------------------

/**
 * The straight fall, given as a line: start, bearing, length.
 *
 * The 20-degree yaw is a compromise and worth naming. The true angle between the
 * Horseshoe's axis and the American fall's face is about 45 degrees — they look
 * across the basin at each other. At 45 the American curtain turns 77 degrees
 * away from the quarter camera and reads as a white line; at 0 the two falls
 * face the same way and the model loses the fact that they converge. 20 keeps
 * the crest visibly oblique in plan and the face at 52 degrees off the quarter
 * camera and 20 off the front one, which is legible in both.
 */
const AM_X = 21;
const AM_Z = -2.5;
const AM_YAW = 20 * DEG;
const AM_LEN = 27;

/** Distance along the crest from `AM_X, AM_Z`. See the widths note in the header. */
const BRIDAL_END = 3;
const LUNA_END = 5;

/**
 * The American curtain, in four slabs. `lip` wobbles so 22 units are not a ruler.
 *
 * `out` is how far the slab stands into the basin, and it is the one number here
 * that had to be found by rendering. All four slabs were coplanar in the first
 * version, and coplanar meshes get **no ink**: `OutlineEffect` hulls each one
 * separately, and a hull expanded across a face flush with its neighbour's loses
 * the depth test against it. So the 22 units came back as a single blank cream
 * rectangle, the largest bright area in the thumbnail, saying nothing.
 *
 * Victoria's fix does not transfer. It yawed its slabs, because a few degrees
 * there swung `n·L` across the ramp's 0.5 threshold; here the curtain sits at
 * `n·L = 0.59` and would have to yaw 14 degrees to change band, which is enough
 * to open a hairline onto the ground behind. **Stepping them in depth does the
 * same job on this face**: each step is an ink line the length of the fall, and
 * the sliver of side face it exposes looks along the crest at `n·L = -0.30`, two
 * bands down — a dark seam, white on white, drawn by geometry and not by paint.
 * The backs all stay at `-3.0`, buried in the shore, so no step can open a hole.
 */
const AM_SHEETS: ReadonlyArray<{ s0: number; s1: number; lip: number; out: number }> = [
  { s0: 5.0, s1: 10.4, lip: 26.7, out: 1.2 },
  { s0: 10.4, s1: 16.0, lip: 26.9, out: 2.1 },
  { s0: 16.0, s1: 21.6, lip: 26.6, out: 1.3 },
  { s0: 21.6, s1: 27.0, lip: 26.8, out: 2.2 },
];

/**
 * **The talus, and it is the reason the American fall is in the model at all.**
 *
 * Every other fall on the planet drops clean into water. This one lands on a
 * mountain of its own caprock, left by the rock falls that keep taking the
 * undercut lip away, and the water stops falling well before the bottom: of the
 * 57 m only 21 to 34 is free fall, the rest is water running over blocks. So the
 * pile climbs to 12 of 27 — a 32 m free fall, the top of that range — is built
 * of the same two rock colours as the cliff above it plus `tan`, and is
 * deliberately the only jumbled, un-rectangular thing in a model otherwise made
 * of straight courses.
 *
 * `s` runs along the crest, `o` out into the basin, `yaw` is added to the
 * crest's own so no two blocks are parallel.
 */
const TALUS: ReadonlyArray<{
  s: number;
  o: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
  tone: 0 | 1 | 2;
}> = [
  { s: 6.5, o: 3.6, w: 7.0, d: 6.0, h: 11.0, yaw: 9, tone: 1 },
  { s: 11.0, o: 2.8, w: 8.0, d: 6.6, h: 9.4, yaw: -7, tone: 0 },
  { s: 15.5, o: 4.4, w: 6.6, d: 5.6, h: 12.0, yaw: 14, tone: 2 },
  { s: 19.5, o: 3.0, w: 7.6, d: 6.0, h: 9.8, yaw: -12, tone: 1 },
  { s: 23.5, o: 4.2, w: 6.2, d: 5.0, h: 8.2, yaw: 6, tone: 0 },
  { s: 9.0, o: 8.6, w: 5.2, d: 4.6, h: 5.8, yaw: 22, tone: 2 },
  { s: 13.5, o: 7.8, w: 4.6, d: 4.0, h: 7.2, yaw: -18, tone: 0 },
  { s: 18.0, o: 9.2, w: 5.6, d: 4.2, h: 5.2, yaw: 31, tone: 1 },
];

// ---------------------------------------------------------------------------
// The mist
// ---------------------------------------------------------------------------

/**
 * Five puffs, every one of them behind the apex and above the rim.
 *
 * `base >= 27.6` and `z <= -19` is not styling, it is the clearance test in the
 * header: on the quarter camera's screen-up axis the apex crest measures 31.8
 * and the lowest of these bases 32.9, which is what keeps a puff from landing on
 * the bowl's interior. `r` is a half-width across the flats of a twelve-sided
 * prism, so each reaches about 3% further at its corners.
 */
interface Puff {
  x: number;
  z: number;
  r: number;
  base: number;
  h: number;
  /** Closes a stack with a `taper`, so the column does not end flat. */
  cap: boolean;
}

const MIST: ReadonlyArray<Puff> = [
  { x: -20, z: -19.4, r: 4.2, base: 27.6, h: 3.4, cap: false },
  { x: -14, z: -21.0, r: 3.6, base: 27.8, h: 3.2, cap: false },
  { x: -24.5, z: -22.0, r: 3.2, base: 27.6, h: 3.0, cap: false },
  { x: -18, z: -20.4, r: 3.8, base: 30.6, h: 3.4, cap: false },
  { x: -21, z: -21.2, r: 2.8, base: 33.4, h: 2.8, cap: true },
];

// ---------------------------------------------------------------------------
// Woodland
// ---------------------------------------------------------------------------

/**
 * Tree clumps: three on Goat Island, three on the two rims, one on the low
 * Canadian bank below the falls.
 *
 * **Every one of these is checked against what is under it, and three of them
 * failed.** The rims are yawed planks, so their edges do not run along `z`, and
 * a clump written down as a plausible-looking pair of numbers lands past the
 * cliff edge: `(-42, -3)` hung one corner in the air, `(33, -14)` another, and
 * `(-45.5, -6.5)` had two thirds of its base over the void. A floating box does
 * not show from either fixed view — the rim behind it hides the gap — and does
 * show the moment the world turns it, which is what the contact sheet's spin is
 * for. The two on the rim moved as little as it took; the third had nowhere on
 * that plank to go without piling onto its neighbour, so it went down to the
 * bank at 6.8, which is Queen Victoria Park, is true, and gives the one blank
 * green shelf in the model something to be read against.
 */
const WOODS: ReadonlyArray<{ x: number; z: number; w: number; d: number; h: number; y: number }> = [
  { x: 13.5, z: -5.0, w: 5.6, d: 4.4, h: 2.6, y: ISLAND_Y },
  { x: 19.0, z: -13.0, w: 6.4, d: 5.0, h: 3.0, y: ISLAND_Y },
  { x: 23.5, z: -24.0, w: 5.0, d: 4.6, h: 2.4, y: ISLAND_Y },
  { x: -42.0, z: -2.8, w: 5.4, d: 4.2, h: 2.8, y: BANK_Y },
  { x: -40.0, z: 9.0, w: 4.6, d: 4.0, h: 2.2, y: 6.8 },
  { x: 32.5, z: -13.0, w: 6.0, d: 4.6, h: 2.6, y: BANK_Y },
  { x: 40.0, z: -10.0, w: 5.0, d: 4.2, h: 2.2, y: BANK_Y },
];

export const niagaraFalls: Monument = {
  id: 'niagara-falls',
  name: 'Niagara Falls',
  iso: 'CAN',
  lat: 43.083,
  lon: -79.075,
  // No `realHeight`. The source list asserts none, and there is none to assert:
  // 57 m at the Horseshoe, 57 m at the American fall of which only 21 to 34 is
  // water before it meets the talus, and the number anyone actually quotes about
  // Niagara is a flow rate.
  tier: 'building',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;
    const shale = palette.bark; //       the shadowed lower course
    const caprock = palette.brown; //    Lockport dolostone, and the plateau
    const rubble = palette.tan; //       the third value in the talus, and only there
    const river = palette.skyBlue; //    flat water: above the lip and in the basin
    const foam = palette.white; //       aerated water: curtains, crests, churn, mist
    const park = palette.green; //       lawn and clearings
    const wood = palette.darkOlive; //   tree clumps

    const group = new THREE.Group();

    /** An axis-aligned mass, given as the box it occupies. Victoria's idiom. */
    const slab = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      y0: number,
      y1: number,
      color: number,
    ) => {
      const mesh = box(x1 - x0, y1 - y0, z1 - z0, color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      group.add(mesh);
      return mesh;
    };

    /** The same, yawed about its own centre — every facet and every fallen block. */
    const plank = (
      cx: number,
      cz: number,
      w: number,
      d: number,
      y0: number,
      y1: number,
      yaw: number,
      color: number,
    ) => {
      const mesh = box(w, y1 - y0, d, color);
      mesh.position.set(cx, y0, cz);
      mesh.rotation.y = yaw;
      group.add(mesh);
      return mesh;
    };

    // --- the Horseshoe -----------------------------------------------------
    // Each facet is a chord of the half-circle. The rim block sits on the chord
    // and runs outward; the curtain hangs on the same chord and runs 3.0 inward,
    // so its top face is a white ribbon following the curve and its front face is
    // the water. One mesh doing both jobs, which is what makes twelve facets
    // affordable.
    const chord = 2 * BOWL_R * Math.sin(SPAN / 2);
    const inset = BOWL_R * Math.cos(SPAN / 2);

    for (let i = 0; i < FACETS; i++) {
      const phi = -Math.PI / 2 + SPAN * (i + 0.5);
      // Outward from the bowl's centre, and the tangent along the crest.
      const ux = Math.sin(phi);
      const uz = -Math.cos(phi);
      const mx = BOWL_X + inset * ux;
      const mz = BOWL_Z + inset * uz;
      // `rotation.y = -phi` puts the box's +Z on the inward radial, so its width
      // lies along the crest and its depth runs back into the plateau.
      const yaw = -phi;
      const rx = mx + ux * (RIM / 2);
      const rz = mz + uz * (RIM / 2);

      plank(rx, rz, chord + 0.7, RIM, 0, RIVER_Y, yaw, caprock);

      // The two arm tips are the only rim faces that look at the camera, so they
      // are the only ones that need the course line drawn. 0.3 proud on every
      // side, which is a ledge rather than a seam.
      if (i === 0 || i === FACETS - 1) {
        plank(rx, rz, chord + 1.3, RIM + 0.4, 0, COURSE, yaw, shale);
      }

      // A lawn facet sinks `PROUD` into its rock and stands `PROUD` in from its
      // sides: where it overlapped the river on the next facet the two
      // undersides shared a plane, and sunk flush its sides shared the rock's.
      const green = GREEN_FACETS.has(i);
      const trim = green ? PROUD * 2 : 0;
      plank(
        rx,
        rz,
        chord + 0.7 - trim,
        RIM - trim,
        green ? RIVER_Y - PROUD : RIVER_Y,
        green ? BANK_Y : LIP_Y,
        yaw,
        green ? park : river,
      );

      // The curtain: 3.0 into the bowl, 1.2 behind the crest so no yawed corner
      // can open a hairline onto the rock.
      plank(mx - ux * 0.9, mz - uz * 0.9, chord + 0.9, 4.2, 0.9, CREST_Y, yaw, foam);
    }

    // The plunge pool, as one twelve-sided prism echoing the bowl above it. Its
    // circumradius is 15.5, inside the curtains' 16.3.
    const pool = column(15, POOL_Y, foam, 12);
    pool.position.set(BOWL_X, 0, BOWL_Z);
    group.add(pool);

    for (const lump of CHURN) {
      const phi = lump.phi * DEG;
      plank(
        BOWL_X + lump.r * Math.sin(phi),
        BOWL_Z - lump.r * Math.cos(phi),
        lump.w,
        lump.d,
        0,
        lump.h,
        -phi,
        foam,
      );
    }

    // --- the river above, and the basin below ------------------------------
    // The rim band already carries 13 units of river; this is the lobe that
    // widens it in the middle, exactly as Victoria's `LOBE_N` does, and for the
    // same reason: a horizontal plane seen from 13.4 degrees collapses to
    // `depth * sin(13.4deg)` on screen, so the river needs all the depth the
    // footprint will spare. Its near edge sits inside the rim band's outer
    // radius of 32.3 at every point, so the two cannot part.
    slab(-28, 8, -40, -19, 0, RIVER_Y, caprock);
    slab(-28, 8, -40, -19, RIVER_Y, LIP_Y, river);

    // The Niagara re-forming below the falls. Victoria has no equivalent — its
    // water goes into a slot and does not come out — and it is what keeps the
    // foreground from being bare ground.
    //
    // It runs to 41 because **both** falls land in it. At 18 it stopped short of
    // the American fall, whose talus and tailwater then stood on grass — the one
    // outright untruth the model had, and the kind that only shows in a render:
    // a waterfall pouring onto a lawn. The east corner reaches 49.6 of the
    // 52-unit footprint, just inside the American shore's own 49.9, so the
    // widest thing in the model is still the land and not the water.
    //
    // Its back face starts `PROUD` inside the Canadian bank's: the two shared
    // the plane z = 2, in two colours.
    slab(-40, 41, 2 + PROUD, 28, 0, BASIN_Y, river);

    // The Canadian bank downstream of Table Rock, kept low on purpose: at full
    // gorge height it would be the near rim this model exists without.
    slab(-46, -34, 2, 18, 0, 5.6, shale);
    slab(-45, -34, 2, 17, 5.6, 6.8, park);

    // --- Goat Island -------------------------------------------------------
    // Its downstream cliff faces the camera between the two falls, so it gets the
    // full treatment: two courses, the upper one battered back by 1.
    slab(9, 27, -32, 0.5, 0, COURSE, shale);
    slab(10, 27, -32, -0.5, COURSE, LIP_Y, caprock);
    slab(10, 27, -32, -0.5, LIP_Y, ISLAND_Y, park);

    // --- the American Falls ------------------------------------------------
    const dx = Math.cos(AM_YAW);
    const dz = Math.sin(AM_YAW);
    // The face normal, pointing into the basin.
    const nx = -dz;
    const nz = dx;
    /** A point on the crest frame: `s` along the crest, `o` out into the basin. */
    const at = (s: number, o: number): [number, number] => [
      AM_X + s * dx + o * nx,
      AM_Z + s * dz + o * nz,
    ];

    // The shore behind the crest: two courses, then the east channel of the river
    // on top of it, then the mainland behind that.
    const [sx, sz] = at(AM_LEN / 2, -4.5);
    plank(sx, sz, AM_LEN + 1, 9, 0, COURSE, -AM_YAW, shale);
    plank(sx, sz, AM_LEN + 1, 9, COURSE, RIVER_Y, -AM_YAW, caprock);
    plank(sx, sz, AM_LEN + 1, 9, RIVER_Y, LIP_Y, -AM_YAW, river);
    const [bx, bz] = at(AM_LEN / 2 - 3, -13);
    plank(bx, bz, AM_LEN - 5, 8, 0, LIP_Y, -AM_YAW, caprock);
    plank(bx, bz, AM_LEN - 5, 8, LIP_Y, BANK_Y, -AM_YAW, park);

    // Bridal Veil, then Luna Island's rib, then the fall proper. The rib carries
    // its own woodland to the brink, which is what makes the notch read as an
    // island splitting the crest rather than as a gap in it.
    // `out` is the front face's distance into the basin; the back is pinned at
    // -3.0 inside the shore block, so a slab that steps forward cannot open a
    // hole behind itself. See the note on `AM_SHEETS`.
    const sheet = (s0: number, s1: number, lip: number, out: number) => {
      const [cx, cz] = at((s0 + s1) / 2, (out - 3.0) / 2);
      plank(cx, cz, s1 - s0 + 0.4, out + 3.0, 0.9, lip, -AM_YAW, foam);
    };
    sheet(0, BRIDAL_END, 26.5, 1.2);
    for (const s of AM_SHEETS) sheet(s.s0, s.s1, s.lip, s.out);

    const [lx, lz] = at((BRIDAL_END + LUNA_END) / 2, -1.4);
    plank(lx, lz, LUNA_END - BRIDAL_END, 5.4, 0, LIP_Y, -AM_YAW, shale);
    plank(lx, lz, LUNA_END - BRIDAL_END, 5.4, LIP_Y, ISLAND_Y, -AM_YAW, park);

    for (const rock of TALUS) {
      const [tx, tz] = at(rock.s, rock.o);
      const tone = rock.tone === 0 ? caprock : rock.tone === 1 ? rubble : shale;
      plank(tx, tz, rock.w, rock.d, 0, rock.h, -AM_YAW + rock.yaw * DEG, tone);
    }

    // Where the American fall's water finally reaches the river, past its own
    // rubble. Two blocks, same job as the churn in the bowl.
    for (const [s, o, w, h] of [
      [10, 12.5, 11, 3.4],
      [20, 12.0, 10, 2.8],
    ] as const) {
      const [wx, wz] = at(s, o);
      plank(wx, wz, w, 5.5, 0, h, -AM_YAW, foam);
    }

    // --- woodland ----------------------------------------------------------
    for (const clump of WOODS) {
      slab(
        clump.x - clump.w / 2,
        clump.x + clump.w / 2,
        clump.z - clump.d / 2,
        clump.z + clump.d / 2,
        clump.y,
        clump.y + clump.h,
        wood,
      );
    }

    // --- the mist ----------------------------------------------------------
    for (const puff of MIST) {
      const cloud = puff.cap
        ? taper(puff.r, puff.r * 0.5, puff.h, foam, 12)
        : column(puff.r, puff.h, foam, 12);
      cloud.position.set(puff.x, puff.base, puff.z);
      group.add(cloud);
    }

    return group;
  },
};
