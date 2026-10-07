import type { Group, Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Moeraki Boulders, Koekohe Beach, Otago.
 *
 * **The quietest thing in the list, and the one most likely to come back as
 * nothing.** A Moeraki boulder is a grey ball up to 2 m across lying on a grey
 * beach. There is no facade, no silhouette, no roof line, no repetition with a
 * rhythm to it. Modelled as "some spheres on a plate" it fills no tier, reads as
 * gravel at thumbnail size, and is indistinguishable from a rockery. So the
 * first decision is the same one Victoria Falls had to make, and it is not about
 * geometry:
 *
 * > **The monument is a stretch of tide line under the bank the boulders come
 * > out of.** Not the boulders — a *place with boulders in it*. The beach
 * > carries the width, the mudstone bank carries the height, and the boulders,
 * > which are small, carry all of the recognition. Every unit spent on the
 * > setting is spent so that the balls have something to be balls *against*.
 *
 * Four things have to survive at thumbnail size, ranked, because the last one is
 * the first to be given up if anything has to go:
 *
 * 1. **Spheres, unmistakably.** The entire reason anyone photographs Moeraki is
 *    that the boulders look manufactured. See `sphere` below: this is the only
 *    place in the file where facets were bought rather than saved, and the
 *    burial fractions are chosen for it too.
 * 2. **A scattered line of them along the tide line**, in a range of sizes, some
 *    standing clear and some no more than a crown showing above the sand. Not a
 *    row: a row is Stonehenge or an ahu, and this is a beach.
 * 3. **The cracked ones** — split open into segments with a dark hollow inside.
 *    The second thing every photograph shows, and the only element in the model
 *    that is not pale, convex and grey.
 * 4. **The wet flat sand**, reading as a different surface from the dry beach
 *    behind it.
 *
 * ## Scale: the one monument in the set that needs no distortion at all
 *
 * The reference figure is 6.8 units for a 1.8 m person, so a metre is 3.78
 * units. At that rate the largest boulder here is `4.0` in radius — 8 units,
 * **2.1 m across**, which is the largest at Moeraki. The smallest is 0.3 m. The
 * bank is 15.4 units, 4.1 m, which is what the Koekohe bank does. The crop is
 * 42 x 32 units: **11.1 m of beach by 8.5 m** from the foot of the bank to the
 * water.
 *
 * Everything else in this folder had to be argued into its tier — Uluru's
 * vertical is 3.6x, the Golden Gate's 2.3x, Stonehenge's plan is squeezed 2:1.
 * This one is built at true scale and true proportion throughout, and it is the
 * subject being genuinely *small* that makes that possible. The avatar stands
 * beside the big boulder and is the taller of the two, exactly as a person is in
 * every photograph of the place. Nothing is stretched, so nothing had to be
 * fixed somewhere else.
 *
 * ## Tier: `building`, and the arithmetic that forces it
 *
 * By the tier's own question — from how far should a player be able to name it? —
 * this is plainly a `monument`. You find Moeraki by walking down onto the beach.
 * It is filed as a `building` anyway, for a reason that is not taste:
 *
 * **`monument` caps the footprint at 14 units, so the widest a monument-tier
 * model can be is 28 units — 7.4 m of beach.** That is three boulder-diameters
 * end to end. There is no "scattered line" in 7.4 m, no room to put dry sand
 * behind wet sand, and the tier's 40 meshes and 900 triangles would be gone on
 * five boulders with nothing left for the beach they lie on. The tier cannot
 * hold the subject, and the subject is the tide line, not the ball.
 *
 * The height that comes with `building` is then spent honestly, on the bank the
 * boulders erode out of — one is still stuck in its face, above the ledge,
 * about to become the next one on the sand.
 *
 * **Aspect.** The crop is 42 x 32, but the cap is measured from the **Y axis**
 * and the crop is not centred on it — the beach runs 17 units back and only 15
 * forward — so the half-diagonal is `hypot(21, 17)` = 27.0, not `hypot(21, 16)`.
 * The cap wants `halfDiagonal / height <= 2`. At 15.4 units of bank that is
 * **1.75**, a 12% margin. It is the tightest constraint in the file and
 * it only runs one way: a beach is flat, so every unit of width bought has to be
 * paid for in bank, and the bank is the element most at risk of becoming the
 * subject. 42 x 15.4 is where those two pressures balance — and it is why the
 * crop is nearly square in plan rather than a long strip, which also stops the
 * model reading as a tray.
 *
 * ## Spheres are the whole budget, and low-facet is fine
 *
 * Nothing in `ctx` is round. A ball is a stack of frusta: one mesh and about
 * `4 * sides` triangles per band, and there are sixteen balls here. The counting
 * decided the model.
 *
 * - **Facets are bought by importance, not spread evenly.** The two biggest get
 *   five bands of twelve sides (228 triangles each); the middle ones four or
 *   five bands of ten; the half-buried ones two or three bands of six or eight,
 *   because a crown showing 40% of a sphere has only 80 degrees of arc to draw
 *   and two segments draw it. A six-sided ball 2 units across, under a flat cel
 *   fill and an ink outline, reads rounder than the vertex count deserves.
 * - **The bands share one `sides` count per boulder**, so their vertical edges
 *   line up and the stack reads as a faceted ball rather than a twisted pile of
 *   coins.
 * - **A ball that is buried reads as a dome, not a sphere**, and that governed
 *   the whole table. A sphere cut at half its diameter is 2R wide and R tall,
 *   and no amount of facets rescue it: what says *sphere* is seeing the profile
 *   turn back **under** itself, so the sand touches a circle much smaller than
 *   the widest part. The two heroes are buried 7% and 9% — their contact circle
 *   is barely half their width — and the deeply buried ones are there to be the
 *   contrast, not the subject.
 *
 * **The boulders are perfect spheres, and resisting the urge to wobble them is a
 * decision, not laziness.** Every other natural thing in this folder is made
 * irregular on purpose: Uluru's whole surface is one noise function, Stonehenge's
 * sarsens are each a little out of true. Here the opposite is right. The
 * boulders vary in *size* and in *how deep they sit*, and in nothing else,
 * because "these look machined and they are not" is the entire content of the
 * monument. A scatter of lumpy blobs is a rockery.
 *
 * ## How wet sand reads with no reflection
 *
 * `golden-temple.ts` settled the general question — still water has to be
 * *stated*, not shown, and it has to supply the dark — and the same reasoning
 * lands one step up the value ladder here, because wet sand is not water.
 *
 * - **`slate` (0x7c7691), not `tan` or `brown`.** The obvious answer is a darker
 *   version of the dry sand, and it is wrong: same hue, lower value, on a
 *   surface lying flat in full sun reads as *shadow on the dry beach*, not as a
 *   second surface. Wet has to be a temperature signal. `slate` is the palette's
 *   one cool mid-grey (more blue than red), it sits at 62% of `bone`'s value so
 *   the pale boulders read as lights on a dark, and `steel` is darker again
 *   below it for the sea.
 * - **The hemisphere light does the rest.** `SKY_TOP` is its sky colour, so a
 *   horizontal face is the coolest surface in the scene while the bank four
 *   units away stays warm. That temperature split across an ink line is the
 *   claim, and it is the only claim available.
 * - **Four flats and a foam lip.** Dry sand at 1.8, wet at 1.2, sea at 0.7,
 *   each sliding *under* the one behind it so no two faces are coplanar, and a
 *   `white` ridge standing 0.3 proud between the last two. The foam is the
 *   brightest thing in the model and it is a straight line across the bottom of
 *   the frame: it names "sea" in one glance and points along the tide line where
 *   the boulders are. Four boulders stand in it.
 *
 * The palette note in `contract.ts` says a recess wants a warm entry, so the
 * hollow inside a cracked boulder is `bark`, not `steel` or `ink`. `ink` was
 * tempting — it is a hole, after all — but it is the outline's own colour, so
 * the disc would lose its own edge and read as damage rather than an opening.
 *
 * ## The bank is a slope, not a row of blocks
 *
 * Three versions of this failed, and all three are worth writing down, because
 * any monument with a cliff behind it will meet every one of them.
 *
 * - **Three courses standing plumb with a turf slab on top** rendered as a
 *   *warehouse*: a dark box with a green roof. Fixed by stepping each course
 *   back from the one below — 3.0 units of setback from the foot to the topsoil
 *   and another 1.4 up to the crest, over 12 of rise — so the profile recedes
 *   instead of rising plumb. A wall has one plane; land has a slope.
 * - **Five stepped panels across the width**, each its own height, rendered as a
 *   *terrace of houses*. That is the instructive failure, because on paper it
 *   had already been fixed: nothing in it was plumb, no two panels were the same
 *   height, and it still read as architecture. The reason is the ink.
 *   `OutlineEffect` hulls **every mesh separately**, so five masses of the same
 *   width at the same pitch draw five full-height black lines down the face, and
 *   five vertical lines at a regular pitch are party walls at any size. **The
 *   ink counts the masses. The geometry does not get a vote.**
 * - So each bed is now **two overlapping pieces spanning the whole crop**, with
 *   the joins at a different x on every course. That is what land does: a bed of
 *   mudstone runs the length of a cliff, it does not stop and start every seven
 *   metres. What varies along a cliff is the *top* — so that is where the units
 *   went, into seven unequal turf lumps with a patch of bare earth among them,
 *   running down from 15.4 at the far left to 12.6 at the near right.
 *
 * Three rules fell out of it, and they are cheaper than they sound:
 *
 * - **Nothing in the bank is parallel to anything else.** Every mass is turned a
 *   few degrees about its own axis, and every *bed* is rolled a couple of
 *   degrees on top of that, so the strata dip to the right. Both cost no
 *   triangles at all and together they are the cheapest way to stop a stack of
 *   prisms reading as masonry: a building's courses are level and parallel, and
 *   a cliff's beds are neither.
 * - **A flat top is a roof, and eight flat tops are a battlement.** The crest
 *   masses are rolled harder — eight to seventeen degrees — so every top edge on
 *   the skyline is a sloping line. Rolling lifts one bottom corner off whatever
 *   the mass stands on, so each is sunk by exactly that much again — see `mass`
 *   below, and note that a rolled mass has to be *buried deep* in the one under
 *   it or its sloping bottom edge becomes a slot of daylight.
 * - **The foot is buried, not stood on.** Every mass starts at `BANK_FOOT`, 0.8
 *   under the beach, so nothing in the bank shows a bottom edge. A visible
 *   bottom edge is a plinth, and a plinth is a building.
 *
 * Four lobes then break the face — two of fallen mudstone at the foot, two ribs
 * of harder rock rising out of the beach through the pale bed — because a bed
 * with a straight front edge is a revetment. They are wide at the bottom and
 * narrow at the top, which is a profile no wall has.
 *
 * **The colours are the other half of it, and the first version had them the
 * wrong way up.** `brown` mudstone / `bark` / `darkOlive` / `green` sounds like
 * strata and rendered as a *dark wall with a hedge on it*: `bark` and
 * `darkOlive` are near enough in value that the two beds between them merged
 * into one seven-unit black mass, which is half the height of the bank. Koekohe
 * is the opposite — a pale mudstone face two thirds of the way up, then a thin
 * dark soil horizon, then grass — so the two lower beds are both `brown` now
 * (their join is a bedding plane the ink draws for free), `bark` is a 2-unit
 * band, `darkOlive` the topsoil above it, and `green` the crest. Same four
 * colours, a quarter of the dark.
 *
 * ## The cracked boulders, and the 13.4-degree problem
 *
 * The first version had a real well: a rim standing round a sunk dark floor.
 * From the quarter camera, 13.4 degrees above the model, a floor
 * `d` below its rim is hidden across `d / tan(13.4deg)` = 4.2d of its width. A
 * 1-unit-deep hollow 3 units across is therefore **entirely invisible** —
 * Victoria Falls' cutaway, in miniature.
 *
 * So a cracked boulder is not a bowl, it is a sphere *opened*: the bottom two
 * thirds solid, a `bark` disc standing a third of a unit **proud** of the break
 * — a hollow a low camera can see has to come towards you, not go away from you
 * — and a broken rind standing round the back of it and leaning in over it.
 * Depth is not modelled; the dark colour, the jagged edge and the ink carry it.
 *
 * That much was true of the first version too, and it still came back as a dark
 * speck. Three things had to change before it read as a broken shell:
 *
 * - **The dark has to be the size of the opening.** At 0.68 of the rim the disc
 *   covered 46% of the break and read as a stain on a stone. It is 0.80 now —
 *   64% — which still leaves a ring of pale shell about three pixels wide all
 *   the way round at thumbnail size, and that ring is what says *thickness*,
 *   which is the only thing that says *shell* rather than *hole*.
 * - **The rind was symmetric, and a symmetric ring of teeth is a crown.** Seven
 *   slots rising evenly to a peak at the back is a tiara, not a break. The
 *   heights are unequal and asymmetric now, and each plate is wide enough (0.80
 *   of the rim against a slot pitch of 0.76) that **neighbours fuse**: the ink
 *   stops drawing five separate teeth and draws one broken wall with a jagged
 *   top.
 * - **It has to read as a sphere before it can read as a broken one.** At 0.34
 *   buried the pale part below the break was 28% of the diameter — a saucer with
 *   things standing in it. At 0.18 it is 44%, the profile undercuts, and what is
 *   broken open is visibly a ball.
 *
 * **The two slots facing the camera are empty** — slot 0 on +Z and slot 1 at 51
 * degrees, which straddles the quarter view's own 31.8-degree azimuth — and that
 * gap is the whole reason either fixed camera sees the dark at all. One fallen
 * plate lies on the sand beside the larger of the two.
 *
 * `tilt` leans each shell towards +Z so the opening turns further into the
 * light, and it is the one thing here that is not free. Tipping a flat underside
 * of circumradius `c` by `t` drops one side of it `c sin t` and lifts the other
 * by the same, so the shell has to sit `c sin t` deeper than a level one just to
 * keep its high edge in the sand — and then its low edge is `2 c sin t + BED`
 * below the surface. **The sand has to be deeper than that or the model sinks
 * below y = 0 and the contract rejects it**, which is exactly how the first
 * tilted version failed: 1.43 of shell into 1.2 of wet sand. It is 0.93 now, and
 * it is why the tilts are 0.14 and 0.18 rather than a quarter turn.
 *
 * ## Traded away
 *
 * - **The septarian veins**, the yellow calcite lattice dividing a cracked
 *   boulder's interior into polygons. The most beautiful thing about them, and
 *   at this size two pixels of noise inside a dark disc.
 * - **Boulders out in the water.** Four sit in the foam; the sea itself is left
 *   empty, because a boulder standing in the near strip is the one thing in this
 *   composition that can occlude the tide line behind it.
 * - **A longer beach.** The real boulders are scattered along a couple of
 *   hundred metres in loose clusters. Eleven metres of it is a crop, chosen the
 *   way a photograph crops: enough to say they go on, not enough to shrink them.
 */

// ---------------------------------------------------------------------------
// The crop. +Z is seaward: the viewer stands in the surf and looks at the bank.
// ---------------------------------------------------------------------------

const HALF_WIDTH = 21;
/** The seaward edge and the back of the bank. The corners of this rectangle are the footprint. */
const SEA_EDGE = 15;
const BANK_EDGE = -17;

/** Flat tops. Every slab stands on y = 0, so its height is its top. */
const DRY_TOP = 1.8;
const WET_TOP = 1.2;
const FOAM_TOP = 1.5;
const SEA_TOP = 0.7;

/**
 * Flat edges. Each one runs *under* the one behind it rather than meeting it, so
 * no two faces are coplanar and every step is a clean ink line.
 */
const DRY_FRONT = -1.0;
const WET_BACK = -2.2;
const WET_FRONT = 9.6;
const FOAM_BACK = 8.6;
const FOAM_FRONT = 11.4;
const SEA_BACK = 10.4;

/** Behind this a boulder stands on the dry beach; in front of it, on the tide flat. */
const TIDE_LINE = -1.6;
/** How far a boulder sinks into the flat it stands on. Small, but never zero: coplanar faces z-fight. */
const BED = 0.25;

// ---------------------------------------------------------------------------
// The bank
// ---------------------------------------------------------------------------

/**
 * One mass of the bank. Beds, lobes and crest are all the same kind of object,
 * which is what lets the whole bank be one table you can read down.
 *
 * `stratum` indexes the four colours in `build`: 0 mudstone, 1 the dark band, 2
 * topsoil, 3 turf. `batter` is the top width as a fraction of the bottom — under 1 the
 * mass leans back, which masonry does not. `yaw` turns it about its own vertical
 * axis and `roll` tips it sideways; **no two masses in the list share either**,
 * and that is the point of them.
 */
interface Mass {
  x: number;
  width: number;
  /** Bottom. `BANK_FOOT` for anything standing on the beach. */
  base: number;
  height: number;
  /** The z of the face. The mass runs back from here by `depth`. */
  front: number;
  depth: number;
  batter: number;
  yaw: number;
  roll: number;
  stratum: 0 | 1 | 2 | 3;
}

/**
 * Under the beach, so no mass at the foot of the bank shows a bottom edge — a
 * visible bottom edge is a plinth. 1.0 and not lower because a *rolled* mass
 * dips `width * sin(roll)` below its own base, and below y = 0 the contract
 * rejects the model.
 */
const BANK_FOOT = 1.0;

/**
 * The bank. Read down the `front` column and it is a slope: the face recedes
 * from -9.4 at the foot to -12.4 at the topsoil over 12 units of rise, and the
 * ledges between the beds catch the ink. A wall has one plane.
 *
 * Read across and the beds are **two overlapping pieces each, with the join at a
 * different x on every course** — -1, -4, +6, 0, going up. That is the whole
 * answer to the terrace of houses: a bed runs the length of a cliff, so the ink
 * has one line to draw across the face instead of five, and the one it draws is
 * somewhere else on every course. What has to be checked is not that the joins
 * are far apart in x — four of them on a 42-unit face cannot be — but that no
 * two of them **stack**: adjacent courses joining at the same x is one
 * uninterrupted vertical line six units long, which is the party wall again.
 *
 * **Every mass extends well below its own bed's floor.** A rolled mass has a
 * sloping bottom edge, and a sloping bottom edge that clears the top of the bed
 * under it is a slot of daylight through the bank. Burying each course a good
 * unit into the one below costs nothing — the buried part is inside solid stone
 * — and it makes the whole table safe to retune by eye.
 */
const BANK: readonly Mass[] = [
  // --- the beds. Every one is rolled a couple of degrees so the strata dip to
  // --- the right, which is what a bed does and what a course of masonry cannot.
  { x: -9.7, width: 22.0, base: BANK_FOOT, height: 4.1, front: -9.4, depth: 7.0, batter: 0.99, yaw: 0.035, roll: -0.028, stratum: 0 },
  { x: 8.8, width: 23.2, base: BANK_FOOT, height: 3.8, front: -9.2, depth: 7.2, batter: 0.99, yaw: -0.05, roll: -0.032, stratum: 0 },
  { x: -11.0, width: 20.0, base: 3.4, height: 5.0, front: -10.5, depth: 5.9, batter: 0.985, yaw: -0.06, roll: -0.045, stratum: 0 },
  { x: 7.4, width: 27.2, base: 3.4, height: 4.7, front: -10.3, depth: 6.1, batter: 0.985, yaw: 0.045, roll: -0.05, stratum: 0 },
  { x: -6.6, width: 28.8, base: 6.0, height: 4.6, front: -11.4, depth: 5.0, batter: 0.98, yaw: 0.05, roll: -0.04, stratum: 1 },
  { x: 12.0, width: 17.2, base: 6.0, height: 4.2, front: -11.2, depth: 5.2, batter: 0.98, yaw: -0.09, roll: -0.048, stratum: 1 },
  { x: -8.6, width: 24.2, base: 8.4, height: 4.3, front: -12.4, depth: 4.0, batter: 0.97, yaw: 0.05, roll: -0.03, stratum: 2 },
  { x: 9.0, width: 23.6, base: 8.4, height: 4.0, front: -12.1, depth: 4.3, batter: 0.97, yaw: -0.038, roll: -0.038, stratum: 2 },

  // --- lobes standing out of the face: two of fallen mudstone at the foot, and
  // --- two ribs of harder rock rising out of the beach through the pale bed.
  // --- Wide at the bottom and narrow at the top — a profile no wall has.
  { x: -12.0, width: 6.8, base: BANK_FOOT, height: 5.0, front: -7.9, depth: 3.4, batter: 0.4, yaw: 0.2, roll: 0.05, stratum: 0 },
  { x: 4.6, width: 5.6, base: BANK_FOOT, height: 4.2, front: -8.3, depth: 3.0, batter: 0.36, yaw: -0.26, roll: -0.07, stratum: 0 },
  { x: -6.6, width: 5.0, base: BANK_FOOT, height: 8.0, front: -9.5, depth: 2.8, batter: 0.62, yaw: -0.16, roll: 0.06, stratum: 0 },
  { x: 9.8, width: 5.8, base: BANK_FOOT, height: 7.4, front: -9.7, depth: 3.0, batter: 0.66, yaw: 0.21, roll: -0.05, stratum: 0 },

  // --- the crest: seven turf lumps and one patch of bare earth, running down
  // --- from 15.4 at the far left to 12.6 at the near right. They overlap in x
  // --- across the whole crop, because a gap between two of them is a slot of
  // --- sky through the skyline. Their fronts run from -12.2 — the turf mat
  // --- overhanging the crumbling face, which every eroding bank does and no
  // --- building can — back to -13.8 behind a bench of bare topsoil.
  { x: -16.5, width: 8.2, base: 11.3, height: 4.35, front: -12.6, depth: 3.6, batter: 0.82, yaw: 0.1, roll: 0.12, stratum: 3 },
  { x: -10.4, width: 7.6, base: 11.3, height: 3.7, front: -13.4, depth: 3.2, batter: 0.86, yaw: -0.15, roll: -0.15, stratum: 3 },
  { x: -4.8, width: 7.2, base: 11.3, height: 3.4, front: -12.2, depth: 3.8, batter: 0.8, yaw: 0.07, roll: 0.09, stratum: 3 },
  { x: 0.6, width: 6.0, base: 11.3, height: 2.7, front: -13.8, depth: 2.9, batter: 0.88, yaw: -0.09, roll: -0.17, stratum: 2 },
  { x: 5.6, width: 7.4, base: 11.3, height: 2.9, front: -12.5, depth: 3.5, batter: 0.84, yaw: 0.17, roll: 0.13, stratum: 3 },
  { x: 11.2, width: 6.6, base: 11.3, height: 2.2, front: -13.6, depth: 3.0, batter: 0.9, yaw: -0.06, roll: -0.1, stratum: 3 },
  { x: 16.2, width: 6.4, base: 11.3, height: 1.9, front: -12.3, depth: 3.7, batter: 0.83, yaw: 0.13, roll: 0.15, stratum: 3 },
  { x: 18.3, width: 4.8, base: 11.3, height: 1.5, front: -13.5, depth: 3.1, batter: 0.92, yaw: -0.11, roll: -0.11, stratum: 3 },
];

/** Sand slumped against the foot of the bank, so it does not meet the beach on a hard line. */
const SAND_FOOT = DRY_TOP - BED;
const SLUMPS: ReadonlyArray<{ x: number; z: number; r: number; h: number }> = [
  { x: -17.0, z: -8.6, r: 3.6, h: 2.4 },
  { x: -2.6, z: -8.2, r: 3.2, h: 1.8 },
  { x: 12.6, z: -8.8, r: 3.4, h: 1.6 },
];

/**
 * The one still in the bank, sitting in the dark bed just above the mudstone
 * ledge it will fall from. It is the only element that explains where the others
 * came from, and it costs three meshes.
 */
const IN_BANK = { x: -13.2, y: 7.7, z: -11.9, r: 2.2, buried: 0.42, bands: 3, sides: 8 };

// ---------------------------------------------------------------------------
// The boulders
// ---------------------------------------------------------------------------

interface Stone {
  x: number;
  z: number;
  /** Sphere radius. 4.0 is a 2.1 m boulder — the largest at Moeraki — at the avatar's scale. */
  r: number;
  /** Fraction of the diameter under the sand. Under 0.15 the profile visibly undercuts. */
  buried: number;
  /** Frusta stacked above the sand line. */
  bands: number;
  sides: number;
}

/**
 * Placed by hand rather than scattered by a hash, because the composition *is*
 * the monument. Nothing may overlap; the two biggest have to stand clear of
 * everything; nothing may sit in the 1.2-unit band around the step between the
 * dry sand and the tide flat, where a boulder would be half on one terrace and
 * half on the other; and the sizes have to thin out towards the back so the crop
 * reads as deep. A hash satisfies none of those, and a table is trivially
 * deterministic, which the loader checks by building twice.
 *
 * Read as a picture: the big ones low and forward on the wet sand, a loose line
 * running out to both edges along the tide, four only just showing in the foam,
 * and the smallest scattered up the dry beach under the bank.
 */
const BOULDERS: readonly Stone[] = [
  // --- on the tide flat, standing all but clear ---
  { x: -5.0, z: 3.4, r: 4.0, buried: 0.07, bands: 5, sides: 12 },
  { x: 12.6, z: 5.6, r: 3.3, buried: 0.09, bands: 5, sides: 12 },
  { x: -13.4, z: 2.6, r: 2.9, buried: 0.12, bands: 5, sides: 10 },
  { x: -18.4, z: 6.2, r: 2.0, buried: 0.22, bands: 4, sides: 10 },
  { x: 18.2, z: 8.6, r: 1.7, buried: 0.18, bands: 3, sides: 8 },

  // --- in the foam ---
  { x: 8.4, z: 9.8, r: 1.6, buried: 0.45, bands: 3, sides: 8 },
  // Half buried: at 0.58 its first band's top came within a hundredth of the
  // foam's top face beside it, two colours in one plane.
  { x: -9.0, z: 9.6, r: 1.3, buried: 0.5, bands: 3, sides: 8 },
  { x: 0.0, z: 9.2, r: 0.75, buried: 0.55, bands: 2, sides: 6 },

  // --- up the dry beach, smaller and deeper in the sand ---
  { x: -4.0, z: -4.6, r: 2.6, buried: 0.15, bands: 4, sides: 10 },
  { x: 7.0, z: -4.2, r: 1.85, buried: 0.3, bands: 4, sides: 8 },
  { x: 16.4, z: -5.0, r: 1.45, buried: 0.52, bands: 3, sides: 8 },
  { x: -11.0, z: -6.6, r: 1.15, buried: 0.62, bands: 3, sides: 6 },

  // --- pebbles: the bottom of the size range, and what keeps the dry sand from being empty ---
  { x: 2.0, z: -8.0, r: 0.62, buried: 0.6, bands: 2, sides: 6 },
  { x: 12.4, z: -7.8, r: 0.55, buried: 0.5, bands: 2, sides: 6 },
];

/**
 * The two split open: one on the wet sand near the middle, one up on the dry
 * beach. `tilt` leans each one towards +Z — see the note on the hollow above.
 */
const CRACKED: ReadonlyArray<{
  x: number;
  z: number;
  r: number;
  buried: number;
  yaw: number;
  tilt: number;
}> = [
  { x: 4.6, z: 2.0, r: 3.0, buried: 0.18, yaw: -0.24, tilt: 0.14 },
  { x: -15.0, z: -5.2, r: 2.5, buried: 0.22, yaw: 0.36, tilt: 0.18 },
];

/**
 * Facets for a cracked one. Ten, not the eight the solid boulders of this size
 * get: these two are the only place in the model where the *inside* of a sphere
 * is on show, and a ten-sided pale ring round the dark disc reads as a rim while
 * an eight-sided one reads as a nut.
 */
const CRACKED_SIDES = 10;

/**
 * Where a cracked boulder is opened, as a fraction of its diameter from the
 * bottom. 0.62 puts the break just above the equator, so the rind stands at
 * nearly the sphere's full width and the opening is as wide as it can be.
 */
const BREAK = 0.62;

/**
 * The dark interior, as a fraction of the break's own half-width, and how far it
 * stands proud of the break. What is left over — a fifth of the rim — is the
 * pale ring that reads as the thickness of the shell.
 */
const HOLLOW = 0.8;
const HOLLOW_RISE = 0.32;

/**
 * The rind, as heights in units of the sphere's radius, one per slot round the
 * break. `around` puts slot 0 on +Z, so **the two zeroes are the near side** —
 * 0 degrees and 51, straddling the quarter camera's own azimuth — and that gap
 * is what lets a camera 13 degrees up see the hollow at all.
 *
 * The five that stand are deliberately unequal and not symmetric about the
 * opening: a smooth arc rising to a peak at the back is a crown. The cap is 0.76
 * — a plate taller than that would stand above the sphere it broke out of.
 */
const RIND: readonly number[] = [0, 0, 0.44, 0.72, 0.3, 0.62, 0.24];
/** How far a plate leans in over the hollow, in radians. It is a shell, so it curves back. */
const RIND_LEAN = 0.34;

/**
 * Deterministic yaw in [-1, 1]. A sphere is symmetric, so this only turns the
 * facets — enough that no two neighbours catch the sun on the same edge and the
 * line never falls into a pattern. The step is the golden angle.
 * `Math.random()` is out: the loader builds twice and compares.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const moerakiBoulders: Monument = {
  id: 'moeraki-boulders',
  name: 'Moeraki Boulders',
  iso: 'NZL',
  lat: -45.346,
  lon: 170.826,
  // No `realHeight`, matching the source list. There are dozens of them and no
  // height belongs to the group: the largest are about 2 m across, most are half
  // that, and the ones still in the bank have no height at all. The model says
  // it instead — the big one comes up to the avatar's shoulder.
  tier: 'building',
  footprint: 28,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;

    const stone = palette.bone; //      the boulders
    const drySand = palette.sand; //    the beach above the tide
    const wetSand = palette.slate; //   the tide flat. See the note at the top of the file.
    const foam = palette.white; //      the surf line, and the brightest thing here
    const sea = palette.steel; //       the water, which must be the dark
    const hollow = palette.bark; //     inside a cracked one: a recess, so warm
    /**
     * The bank, bottom to top: mudstone, the dark band, topsoil, turf. Two beds
     * share the mudstone, which is why the pale part of the face is two thirds of
     * its height — see the note on the colours at the top of the file.
     */
    const STRATA = [palette.brown, palette.bark, palette.darkOlive, palette.green];

    const group = new THREE.Group();

    // --- the four flats -------------------------------------------------------

    // `inset` pulls a flat's two ends in from the crop's sides. Flats that
    // overlap in z would otherwise share their end planes at x = +-HALF_WIDTH,
    // and flush faces of two colours in one plane flicker; so the tide flat and
    // the sea stop `PROUD` short of the sand and the foam that overlap them.
    const flat = (back: number, front: number, top: number, color: number, inset = 0): void => {
      const slab = box((HALF_WIDTH - inset) * 2, top, front - back, color);
      slab.position.z = (back + front) / 2;
      group.add(slab);
    };

    flat(BANK_EDGE, DRY_FRONT, DRY_TOP, drySand);
    flat(WET_BACK, WET_FRONT, WET_TOP, wetSand, PROUD);
    // The foam stands 0.3 proud of the tide flat and 0.75 above the sea, and
    // bridges the 0.8-unit seam between them so nothing shows through to y = 0.
    flat(FOAM_BACK, FOAM_FRONT, FOAM_TOP, foam);
    flat(SEA_BACK, SEA_EDGE, SEA_TOP, sea, PROUD);

    /** The top of whichever flat a thing at this z stands on. */
    const sandTop = (z: number): number => (z < TIDE_LINE ? DRY_TOP : WET_TOP);

    // --- boulders -------------------------------------------------------------

    /**
     * A sphere of `radius`, cut off level at `buried` of its diameter and built
     * as `bands` stacked frusta above the cut. The stack walks the polar angle
     * in equal steps from the sand line to the top pole, so the elevation
     * silhouette is a regular polygon arc — the roundest thing this toolkit can
     * make.
     *
     * Its base is its own y = 0, which is the sand line, so the buried part
     * simply does not exist. Sinking a whole sphere and letting the sand hide it
     * would put geometry below the monument's base, which the contract forbids,
     * and would spend triangles on faces nobody can see.
     */
    const sphere = (radius: number, buried: number, bands: number, sides: number): Group => {
      const shell = new THREE.Group();
      const cut = Math.acos(1 - 2 * buried);
      const step = (Math.PI - cut) / bands;
      for (let i = 0; i < bands; i++) {
        const a = cut + i * step;
        const b = a + step;
        // The last band closes on the pole as an exact zero, not as sin(PI).
        // That is 1.2e-16 — small enough to look like nothing and large enough
        // for CylinderGeometry to build a cap of degenerate triangles whose
        // recomputed normals come out as noise.
        const top = i === bands - 1 ? 0 : radius * Math.sin(b);
        const band = taper(
          radius * Math.sin(a),
          top,
          radius * (Math.cos(a) - Math.cos(b)),
          stone,
          sides,
        );
        band.position.y = radius * (Math.cos(cut) - Math.cos(a));
        shell.add(band);
      }
      return shell;
    };

    for (let index = 0; index < BOULDERS.length; index++) {
      const it = BOULDERS[index]!;
      const shell = sphere(it.r, it.buried, it.bands, it.sides);
      shell.position.set(it.x, sandTop(it.z) - BED, it.z);
      shell.rotation.y = 0.5 * wobble(index, 0);
      group.add(shell);
    }

    // --- the cracked ones -----------------------------------------------------

    /**
     * A sphere opened at `BREAK`: two solid bands below, a dark disc on the cut,
     * and a rind of segments standing round it with the near two missing. See
     * the note at the top of the file for why the hollow is a colour and a ring
     * of uprights rather than an actual well.
     */
    const cracked = (radius: number, buried: number, sides: number): Group => {
      const shell = new THREE.Group();
      const cut = Math.acos(1 - 2 * buried);
      const brink = Math.acos(1 - 2 * BREAK);
      const step = (brink - cut) / 2;

      let lip = 0;
      for (let i = 0; i < 2; i++) {
        const a = cut + i * step;
        const b = a + step;
        const height = radius * (Math.cos(a) - Math.cos(b));
        const band = taper(radius * Math.sin(a), radius * Math.sin(b), height, stone, sides);
        band.position.y = lip;
        shell.add(band);
        lip += height;
      }

      /** Half-width of the break. Just under the sphere's own, by design. */
      const rim = radius * Math.sin(brink);

      // The hollow: a disc standing proud of the cut, so it keeps an ink edge of
      // its own, no face is coplanar with the stone under it, and nothing about
      // it can be hidden by a low camera. Inset by a fifth, which leaves a ring
      // of pale shell showing all the way round — that ring is the thickness,
      // and the thickness is what makes it a shell rather than a hole.
      const inside = column(rim * HOLLOW, HOLLOW_RISE, hollow, sides);
      inside.position.y = lip;
      shell.add(inside);

      shell.add(
        around(RIND.length, (index) => {
          const rise = RIND[index]!;
          if (rise === 0) return null;
          // 4 sides gives a square of half-width `rim * 0.4`; squashing z turns
          // it into a slab that follows the curve rather than a post. At that
          // width a plate is wider than the 0.76 slot pitch, so two standing
          // side by side fuse into one mass and the ink draws the pair's broken
          // outline instead of two teeth.
          const plate = taper(rim * 0.4, rim * 0.3, radius * rise, stone, 4);
          plate.scale.z = 0.44;
          // Far enough out that the plates clear the widened dark disc, close
          // enough that their outer faces sit on the sphere's own silhouette.
          plate.position.set(0, lip - 0.15, rim * 0.88);
          plate.rotation.x = -RIND_LEAN;
          return plate;
        }),
      );

      return shell;
    };

    for (const it of CRACKED) {
      const shell = cracked(it.r, it.buried, CRACKED_SIDES);
      // The tilt is what turns the opening into the light, and it has to be paid
      // for twice. The underside is a flat polygon of circumradius `edge`;
      // tipping it drops one side of that polygon and lifts the other, so the
      // shell sinks by the lift to keep its high edge buried, and its low edge
      // then sits `2 * edge * sin(tilt) + BED` under the surface. That number
      // has to stay under the depth of the sand it stands on — 0.93 against the
      // tide flat's 1.2 — or the model reaches below y = 0 and fails `validate`.
      const edge =
        (it.r * Math.sin(Math.acos(1 - 2 * it.buried))) / Math.cos(Math.PI / CRACKED_SIDES);
      shell.position.set(it.x, sandTop(it.z) - BED - edge * Math.sin(it.tilt), it.z);
      shell.rotation.set(it.tilt, it.yaw, 0);
      group.add(shell);
    }

    // One plate off the larger of the two, lying where it fell. It is the only
    // stone in the model that is not part of a ball, and it is what says the
    // round ones are shells rather than pebbles.
    const fallen = new THREE.Group();
    const shard = taper(1.05, 0.6, 2.6, stone, 4);
    shard.scale.z = 0.42;
    // Tipped just past flat, so it lies on one edge and the ink finds a wedge of
    // shadow under it instead of a flat lozenge.
    shard.rotation.x = Math.PI / 2 - 0.16;
    fallen.add(shard);
    fallen.rotation.y = 1.5;
    fallen.position.set(8.9, WET_TOP - BED + 0.44, -0.2);
    group.add(fallen);

    // --- the bank -------------------------------------------------------------

    /**
     * One mass of the bank: `taper` makes a battered square prism, `scale.z`
     * gives it a depth, `yaw` turns it about its own axis and `roll` tips it
     * sideways so its top edge is a sloping line rather than a horizontal one.
     *
     * A rolled mass lifts one bottom corner off whatever it stands on, so it is
     * sunk by exactly that much and a whisker more, which puts its high corner
     * just inside the bed below and its low corner `width * sin(roll)` deeper
     * again. That second number is the one that bites twice: at the crest it has
     * to stay inside the topsoil bed, and at `BANK_FOOT` it has to stay above
     * y = 0 — which is why the foot is at 1.0 and not the 0.6 the eye wanted.
     */
    const mass = (spec: Mass, color: number): Group => {
      const slab = new THREE.Group();
      const mesh = taper(spec.width / 2, (spec.width * spec.batter) / 2, spec.height, color, 4);
      mesh.scale.z = spec.depth / spec.width;
      slab.add(mesh);
      const sink = spec.roll === 0 ? 0 : (Math.abs(Math.sin(spec.roll)) * spec.width) / 2 + 0.1;
      slab.position.set(spec.x, spec.base - sink, spec.front - spec.depth / 2);
      slab.rotation.set(0, spec.yaw, spec.roll);
      return slab;
    };

    for (const spec of BANK) group.add(mass(spec, STRATA[spec.stratum]!));

    for (const slump of SLUMPS) {
      const mound = taper(slump.r, slump.r * 0.45, slump.h, drySand, 6);
      mound.scale.z = 0.45;
      mound.position.set(slump.x, SAND_FOOT, slump.z);
      group.add(mound);
    }

    // Rotating the stack a quarter turn about X sends its axis down +Z, so the
    // flat cut faces into the bank and the dome faces the camera. Its base plane
    // sits inside the dark bed and it bulges out over the mudstone ledge below.
    const emerging = sphere(IN_BANK.r, IN_BANK.buried, IN_BANK.bands, IN_BANK.sides);
    emerging.rotation.x = Math.PI / 2;
    emerging.position.set(IN_BANK.x, IN_BANK.y, IN_BANK.z);
    group.add(emerging);

    return group;
  },
};
