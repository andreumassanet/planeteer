import type { Group, Monument } from './contract.ts';

/**
 * Table Mountain.
 *
 * The third landform in the set and the one with the nearest neighbour: `uluru.ts`
 * is also a flat-topped rock, also wide, also alone in its tier's footprint
 * circle. Everything below is arranged so the two cannot be confused, and the
 * difference is not detail but *class of shape*:
 *
 * | | Uluru | Table Mountain |
 * |---|---|---|
 * | section | rounded loaf, all shoulder | wall and lid, no shoulder at all |
 * | crest | undulates — swells and notches over its whole length | **dead level**, one straight line, 60 units of it |
 * | flank | fluted by seams between slabs of varying width | fluted by slabs of varying **depth**: buttresses standing out, ravines cut in |
 * | plan | one monolith on a plain | a **range**: two lower pointed peaks and two saddles |
 * | colour | `orange`, a desert rock | `slate` over `brown`, a grey cliff over a warm slope |
 *
 * The four things that have to survive being 40 pixels tall, in the order a
 * person recognises them:
 *
 * 1. **The level top.** Not approximately level — *level*, for its whole length.
 *    Any sag, dome or bump and the thing is a hill. This is why the plateau is
 *    one single `box` (`CAP`) laid across every slice of the cliff rather than a
 *    lid per slice: there is no arithmetic anywhere in this file that could put
 *    two points of the summit at different heights. It is also why Maclear's
 *    Beacon — the real cairn at the real 1,086 m summit — is **not** modelled:
 *    a 1.5-unit bump on the one surface that must read as flat costs more than
 *    a true detail is worth.
 * 2. **The hard corner where the top meets the cliff.** `CAP` overhangs the wall
 *    by `CORNICE` on all four sides, so the lip is a single unbroken ink line
 *    with a shadow under it, and the corner is 90 degrees. Uluru's brow ledges
 *    step *inwards* to round the shoulder over; this one steps *outwards*.
 * 3. **The sheer face below it**, vertical — genuinely 90 degrees, not 80 — and
 *    fluted. See `BUTTRESSES`.
 * 4. **Devil's Peak and Lion's Head**, lower and pointed, one at each end, with
 *    a saddle between each and the table. That is what makes this a range rather
 *    than a mesa, and it is the single strongest thing separating this
 *    silhouette from Uluru's.
 *
 * **Why this is a model and not terrain.** Asked at 33.957 S, 18.403 E,
 * `terrain.ts` returns **0.0 units** of relief — the flattest site of any
 * landform in the set, flatter than Fuji's 2.7, and it stays at 0.0 for 150
 * units in every direction. The reason is `SHORE_SPAN`: Cape Town sits on a
 * peninsula with ocean on three sides, so the coast falloff holds the whole Cape
 * down, and the nearest ground that rises at all is 24.2 units of noise 320 km
 * away at 31.2 S, 19.3 E. Across the 90-unit pad `placement.ts` flattens under
 * every monument the raw relief never leaves zero. There is nothing here to
 * build on and nothing to blend with, which is the right answer twice over:
 * Table Mountain does stand straight off a coastal plain at sea level, and no
 * amount of ridged noise makes a horizontal summit with a vertical wall under
 * it. The plain is the site's; the mountain is this file's.
 *
 * **Tier: `landmark`, at 45 units — 37.5% of the tier's height.** The tier
 * question is "from how far should a player be able to name it?", and this is
 * the mountain that named a cape, made a ship's landfall and put a constellation
 * (Mensa) on the sky chart: it is picked up from 100 km out at sea. `tower` caps
 * the footprint at 28 and cannot hold a range. `building` — the tier Uluru
 * argues its way into on exactly this reasoning — caps the *height* at 40, and
 * the argument that wins there loses here, because this silhouette carries five
 * levels and not two: the scree line at 12, Kloof Nek at 13, the Saddle at 31,
 * Devil's Peak at 40.5 and the table at 45. Squeezed under 40 the top three
 * close to 27.6, 36 and 40, and Devil's Peak — which must read as a separate
 * pointed summit — ends up 4 units under the tabletop, which at thumbnail size
 * is nothing. The tier's fill check is satisfied on width, as Fuji's and
 * Kilimanjaro's are: 109.3 units across against the 72 required.
 *
 * **Vertical exaggeration: 2.8x — the mildest of any landform here, and that is
 * the point.** The range runs about 7.5 km from Lion's Head's foot to Devil's
 * Peak's, and stands 1,086 m: at the 110 units the `landmark` footprint circle
 * allows, a true-scale model would be 16.0 units tall. It is 45, so 2.8x, where
 * Uluru takes 3.6x, Fuji 4.5x, Victoria Falls 5.1x and Kilimanjaro 5.2x. Table
 * Mountain needs the least of it because it is the only one of the five that is
 * *already* a cliff: the thing being exaggerated elsewhere is steepness, and
 * this one starts vertical.
 *
 * What the 2.8x broke, and what it cost: it is the tabletop that pays. The real
 * north face is a 3 km lip over a 490 m wall, 6.1 : 1; stretched, the model's is
 * 60 over 29.8, **2.0 : 1**. The top therefore reads shorter against its own
 * cliff than in life, and the fix was to spend width on it — the table takes 60
 * of the model's 110 units, 55%, against the real range's 40%, and Devil's Peak
 * and Lion's Head are pulled in correspondingly close. That is the trade this
 * file makes and it is the right way round: 2.0 : 1 still reads as a table, and
 * a table too short to be one would end the argument before the flanking peaks
 * got a chance to speak.
 *
 * **Aspect, worked before planning as the contract asks.** `measure` takes the
 * greatest horizontal distance from the Y axis, so the test is
 * `halfDiagonal / height <= 2`. The widest points are the two flanking peaks,
 * 54.6 out, against 45 tall: **1.21**, comfortably inside. Nothing is cropped
 * along the range. What *is* cropped is the third dimension — the massif runs
 * 5 km south to Constantia Nek and throws the Twelve Apostles down the Atlantic
 * side, and none of that is here. It is the right crop: every photograph of this
 * mountain is taken from the north across Table Bay, and none of it appears in
 * one either. `SHELVES` is the only nod to it, a lower plateau behind the
 * table so the massif is not a wall one slice thick from the side.
 *
 * **The tablecloth is out.** The flat sheet of cloud pouring over the north edge
 * is genuinely half of how this mountain is pictured, and it was tested, not
 * assumed: rendered as five overlapping prisms lying on the lip, at thumbnail
 * size it covered the level line, rounded the two corners and turned the
 * silhouette into a loaf — it destroyed, in one element, the three reads this
 * whole file is spending its budget on. `victoria-falls.ts` records the same
 * finding about its spray plume and had to rebuild it a seventh of true size;
 * here there is no smaller version to retreat to, because the tablecloth's
 * entire subject is the front lip. Two further reasons it should not come back:
 * static white geometry with an ink outline around it reads as rock, not vapour
 * (Victoria Falls again), and white on a summit next to Fuji and Kilimanjaro on
 * the same contact sheet reads as **snow** — on a mountain at 34 degrees south
 * that has never held any. The cloud is weather; the mountain is the monument.
 *
 * **Also rejected.** The cable car and its upper station, which sit on the
 * western lip in life and would put a building exactly on the corner that has to
 * stay hard. Signal Hill, the ridge running north off Lion's Head, which is real
 * and would push the model past its footprint circle for a shape nobody names
 * the mountain by.
 *
 * **Colour.** South Africa's land is Africa's `clay`, so Uluru's rule applies —
 * a landform must not read as a browner lump of its own continent. Table
 * Mountain is grey in every photograph ever taken of it, so the rock is
 * `slate`, Fuji's choice and for Fuji's measured reason: it is the palette's one
 * cool mid-tone, it holds the most range across the four-step ramp, and the
 * contract's own shade table has it surviving as blue where `bone` goes to a
 * hueless patch and `steel` to black. Under it, `brown` for the scree and the
 * lower slopes — a warm slope under a cool wall, with the change of colour
 * falling exactly on the change of slope, so geometry and colour say the same
 * thing. `bark`, at half slate's luminance and on the contract's warm list, for
 * the deep ravines, which are recesses and would go to holes in any neutral.
 * And `green` for the fynbos, which is what the mountain's skirt actually is,
 * gives the base something to stand on rather than a cut-out edge, and is the
 * only thing in frame at the avatar's own scale.
 */

// --- levels ---------------------------------------------------------------

/** The tabletop, and the highest point in the model. */
const TOP = 45;

/** The capping stratum: one slab over every slice, and the reason the top is level. */
const CAP = 3.2;

/**
 * How far `CAP` overhangs the wall on all four sides.
 *
 * It was 1.6 and it had to come down. A cap standing that far proud of a
 * 60-unit wall is an *eave*, and an eave over vertical pilasters is a warehouse
 * — which is what the first render of this file was, unmistakably. At 0.7 the
 * lip is still one unbroken ink line with a shadow under it, which is all the
 * hard corner needs, and nothing about it says roof.
 */
const CORNICE = 0.7;

/** Top of the cliff slices, under the cap. */
const CLIFF_TOP = TOP - CAP;

/** The scree line: cliff foot above, talus below. The one horizontal in the model. */
const SCREE = 12;

/** The cliff plane. A flush buttress's face sits here; a ravine is recessed from it. */
const FRONT = 15;
/**
 * The back of the cliff block, and the number that decides whether this is a
 * mountain or a shed.
 *
 * At -15 the high mass was 60 long, 30 deep and 30 tall — very nearly a cube,
 * and a flat-topped cube with vertical ribs down it is a building whatever
 * colour it is painted. The plateau is not thrown away; it is *stepped*. The
 * cliff block is 19 deep, and behind it `SHELVES` carries the summit back at
 * full height on a narrower plan and then drops in two courses to the Back
 * Table. The front lip is untouched — one straight box, dead level, which is
 * the whole point — and everything irregular happens where the front camera
 * cannot see it.
 */
const BACK = -4;

/** The table's ends. 60 units of level top, 55% of the model's 109.3-unit width. */
const TABLE_X0 = -32;
const TABLE_X1 = 28;

// --- the cliff ------------------------------------------------------------

/**
 * The north face: eight buttress masses, each with fine flutes across it.
 *
 * **Two scales, and the first render proved both are needed.** The first version
 * of this file made the cliff one flat plane with twenty-six narrow slices cut
 * into it at varying depth. It rendered as a wall with pilasters — a warehouse,
 * unmistakably — because a flat plane with surface decoration on it is what a
 * building is, and no amount of fine texture fixes that. The real face is not a
 * plane: it is a row of great masses standing forward with deep bays between
 * them, and it is *that* silhouette in plan, not the fluting, that says rock.
 *
 * So `set` is the big shape — how far a whole mass stands back from `FRONT` —
 * and `flutes` is the small one, one slice per entry, recessed that much from
 * its own mass's face. `set` runs to 5.5 units and `flutes` never past 1.0, so
 * the face reads as five or six masses first and as fluting second.
 *
 * **No mass carries a cap, and the reason is worth keeping.** Each of the eight
 * used to have its own lid, every lid top at exactly `TOP`, so the plateau's
 * edge stepped in and out in plan while its height did not vary by so much as a
 * unit — a bayed lid at one height, which in a wireframe is a mesa. In ink it is
 * a battlement. `OutlineEffect` hulls every lid on its own, so each step in the
 * plan drew a pair of vertical lines up through the lip, and eight level lids in
 * a row crenellated the skyline at the quarter view. The masses now stop `BROW`
 * short of the lip and one unbroken band carries one unbroken cap.
 *
 * `slot` is a cleft cut deeper still into one flute of a mass, given as
 * `[which flute, how much deeper]`, and there are three. The deepest, at 8.5
 * units into a 19-unit block, is **Platteklip Gorge** — the one cleft that runs
 * the whole bayed wall, from the scree to the brow it dies into, and the route
 * every walker takes up, sitting just east of centre where it does in life. It
 * is the only asymmetry on the wall and it is what stops the face reading as a
 * repeating pattern.
 *
 * `ledges` are the bedding shelves, at absolute heights, standing `LEDGE_OUT`
 * proud of their own mass's face. They belong to the mass rather than to the
 * wall because a ledge crossing a bay would be a bridge, and a cliff has no
 * bridges. The face is bedded sandstone and it shows; without them a 60 x 30
 * wall has nothing in it to say whether it is 30 units tall or 300. They are the
 * inverse of Kilimanjaro's problem, where horizontal seams across a *slope* read
 * as terracing: on a vertical wall a horizontal line can only be a ledge.
 *
 * **Their heights are spread over the whole exposed wall, and a unit of jitter
 * was not enough.** They sat at about 21 on every ledged mass and about 31 on
 * every ledged mass, jittered a unit either way — which is two ruled lines
 * across a mountain, and two more reasons to think it was built. At the contact
 * sheet's 260 pixels a unit is a third of a pixel, so the jitter did not exist
 * and the two rows of small lit rectangles read as two courses of **windows**,
 * on a wall that already had a lintel over it. They now run 16.8 to 32.6 with no
 * two masses sharing a height.
 */
interface Buttress {
  /** Along the range, before the set is normalised to span `TABLE_X0..TABLE_X1`. */
  width: number;
  /** How far this mass's face stands back from `FRONT`. The big shape. */
  set: number;
  /** One slice each, recessed this much from the mass's own face. The small shape. */
  flutes: readonly number[];
  /** A cleft cut deeper into one flute: `[index, extra depth]`. */
  slot?: readonly [index: number, depth: number];
  /** Bedding shelves on this mass, at absolute height. */
  ledges?: readonly number[];
}

const BUTTRESSES: readonly Buttress[] = [
  { width: 9.0, set: 4.0, flutes: [0, 0.8, 0.3, 0.6], ledges: [24.6] },
  {
    width: 10.0,
    set: 0.0,
    flutes: [0.2, 0.9, 0, 0.6, 0.3],
    slot: [2, 2.4],
    ledges: [18.9, 29.4],
  }, // Africa Face, the broad mass east of the gorge
  { width: 5.0, set: 5.5, flutes: [0.4, 0], slot: [1, 3.0] }, // the Platteklip bay
  { width: 9.5, set: 1.0, flutes: [0, 0.7, 0.3, 1.0], ledges: [22.3, 32.6] },
  { width: 6.0, set: 4.0, flutes: [0.5, 0, 0.9] },
  { width: 9.5, set: 0.5, flutes: [0.3, 0, 0.8, 0.4], ledges: [16.8, 27.1] }, // Arrow Face
  { width: 5.0, set: 4.5, flutes: [0, 0.6], slot: [0, 2.2] },
  { width: 6.0, set: 1.5, flutes: [0.4, 0, 0.9], ledges: [30.8] }, // Kloof Corner
];

/**
 * The brow: a band flush with `FRONT`, running the whole 60 units under the cap.
 *
 * **This one band is what lets the wall be bayed and the lip be straight at the
 * same time, and finding it took three renders.** Give each mass its own cap
 * and the plateau's edge follows the bays — which looked, at the quarter view, a
 * great deal like battlements, because a row of masses each with its own lid is
 * a row of towers however level their tops are. Give the whole table one cap and
 * nothing else, and it hangs several units clear of every bay with air under it.
 * The brow is the resolution: the top six units of cliff are one continuous
 * flush plane, so the cap sits on solid rock along its entire length, and every
 * bay, flute and cleft below dies out into it.
 *
 * It is also, as it happens, the geology. The face is Table Mountain Sandstone
 * over Graafwater shale, and the top band is the hard one: it is continuous, and
 * the softer rock beneath it is what the bays are cut out of.
 *
 * It replaced a per-cleft filler block that did the same job three times over —
 * Uluru's `flute: 0` on the cap course, arrived at from the other end.
 */
const BROW = 6;

/** Ledges: how far proud of their mass's face, and how thick. */
const LEDGE_OUT = 0.9;
const LEDGE_THICK = 1.1;
/** How much of a mass's width a ledge leaves clear at each end. */
const LEDGE_INSET = 1.4;

// --- the scree ------------------------------------------------------------

/**
 * The talus apron: one stretched octagonal frustum, `[half-depth, half-length]`
 * at the foot and at the scree line.
 *
 * One frustum because the brief on a scree slope is that its angle is
 * *constant* — the angle of repose does not care which way it faces — and a
 * single frustum is the only construction that cannot get that wrong. The front
 * runs 10.5 units out for 12 up, 48.8 degrees: steep for real talus, which sits
 * near 34, but the whole model is stretched 2.8x vertically and what has to read
 * is not the true angle but the *break* between a slope and a wall at 90.
 *
 * Octagonal rather than square because the corners are what the footprint circle
 * bites: a 46 x 27 rectangle has its corners 53.4 out and a stretched octagon
 * has them at 45.6, which leaves the two flanking peaks the room they need at
 * the extreme ends.
 */
const SCREE_BASE_Z = 29;
const SCREE_BASE_X = 46;
const SCREE_TOP_Z = 18.5;
// No half-length at the scree line: the frustum is one shape stretched in x, so
// it is `SCREE_TOP_Z * SCREE_BASE_X / SCREE_BASE_Z` and not a number of its own.
/** The apron's centre: the massif's own, so the model straddles the Y axis. */
const MASSIF_X = -2;
const MASSIF_Z = -3;

/**
 * Talus fans below the gullies: `[x, height]`.
 *
 * Debris comes off a cliff through its ravines, not evenly, so the scree line is
 * scalloped: overlapping cones with their apexes at the gully mouths and their
 * toes standing past the general slope.
 *
 * **They are cut shallower than the apron, and that is the only reason they can
 * be seen.** The first set was built at the apron's own angle and vanished — a
 * cone with the surrounding slope's gradient is coplanar with it, whatever its
 * size. At `FAN_SLOPE` they run 40 degrees against the apron's 48.8, so each one
 * bulges a few units past the toe at the bottom and tucks back to the cliff foot
 * at the top, which is exactly the plan a coalescing bajada has.
 *
 * They also do a second job. The scree line at `SCREE` is the model's one long
 * horizontal, and a dead horizontal running the width of a mountain is what
 * Kilimanjaro's climate-zone tongues exist to break. Each fan pushes `brown` a
 * couple of units up past it, and the ends of the range push it down: the
 * apron's octagonal plan retreats from the cliff near the table's corners, so
 * the wall runs lower there and the line is nowhere straight.
 */
/** Horizontal run per unit of rise: `1 / tan(40 deg)`, against the apron's 0.875. */
const FAN_SLOPE = 1.192;
/** A fan's half-width in x against its half-depth. Under 1, because a cone below a
 * gully is a tongue running downslope and not a circle. */
const FAN_WIDE = 1.15;
const FANS: ReadonlyArray<readonly [x: number, height: number]> = [
  [-26.0, 8.0],
  [-14.0, 9.5],
  [-8.0, 11.0], // under Platteklip Gorge, the largest
  [3.0, 8.5],
  [12.0, 9.5],
  [22.0, 8.0],
];

/**
 * Where the apron's front or back face stands at a given depth.
 *
 * Exact only across the flat facet the octagon presents to +Z and to -Z, which
 * spans x -15 to +11 at the top and -21 to +19 at the foot; everything seated
 * with it is inside that band. It is what puts a bush or a fallen block *on* the
 * slope rather than at the bottom of it — Uluru's scrub sits on a plain and can
 * be placed at y = 0, and nothing here can.
 */
const apronAt = (z: number): number => {
  const t = (SCREE_BASE_Z - Math.abs(z - MASSIF_Z)) / (SCREE_BASE_Z - SCREE_TOP_Z);
  return Math.max(0, Math.min(1, t)) * SCREE;
};

/**
 * Fynbos and pine on the slope: `[x, z, width, height, depth, yaw]`.
 *
 * Uluru's spinifex, and Uluru's argument for it: kept to a couple of units so
 * that their whole job is to say how big the thing behind them is. Table
 * Mountain's lower slopes really are green — it is a national park and the Cape
 * floral kingdom — so unlike the scrub round a desert monolith these are allowed
 * to climb the scree instead of ringing its foot, which breaks the scree line a
 * third time. Each is sunk `PLANT_SINK` into the slope so it grows out of it.
 */
const PLANT_SINK = 0.9;
const FYNBOS: ReadonlyArray<
  readonly [x: number, z: number, w: number, h: number, d: number, yaw: number]
> = [
  [-19, 24.0, 9, 2.4, 6, 0.3],
  [-11, 21.0, 7, 2.0, 5, -0.25],
  [-3, 25.5, 10, 2.6, 6, 0.15],
  [6, 22.5, 8, 2.2, 5, -0.4],
  [15, 25.0, 9, 2.4, 6, 0.2],
  [-16, -23.5, 8, 2.2, 5, 0.4],
  [4, -25.0, 9, 2.4, 6, -0.2],
  [-6, -21.5, 7, 2.0, 5, 0.1],
];

/**
 * Clumps out on the flat, beyond the apron's toe: `[x, z, width, height, depth,
 * yaw]`. Off the octagon's diagonal facets, where the slope has already run out,
 * so they stand at y = 0 with the mountain rising behind them.
 */
const OUTLIERS: ReadonlyArray<
  readonly [x: number, z: number, w: number, h: number, d: number, yaw: number]
> = [
  [-44, 20, 8, 2.2, 5, 0.2],
  [40, 17, 9, 2.6, 6, -0.3],
  [-38, -22, 8, 2.0, 5, 0.35],
  [30, -21, 7, 2.2, 5, -0.15],
  [47, 10, 7, 2.0, 4, 0.45],
];

/** Blocks fallen off the face and lying on the apron: `[x, z, size, height, yaw]`. */
const BOULDERS: ReadonlyArray<
  readonly [x: number, z: number, size: number, height: number, yaw: number]
> = [
  [-14, 19.5, 3.4, 2.6, 0.4],
  [-5, 22.5, 4.2, 3.2, -0.3],
  [7, 18.5, 3.0, 2.4, 0.55],
  [17, 21.5, 3.8, 2.8, -0.5],
];

// --- the range ------------------------------------------------------------

/**
 * Devil's Peak, east of the table, and Lion's Head, west of it.
 *
 * **Which end each stands on is decided by the picture, not the compass.** The
 * canonical view of this mountain is from the north across Table Bay, and in it
 * Devil's Peak is on the left and Lion's Head on the right; the contact sheet's
 * front camera looks at the model's +Z from the same side, so Devil's Peak takes
 * negative x. `mount-rushmore.ts` settles the same question the same way, with
 * Washington at x = -32 because that is where he is in the photograph.
 *
 * Their heights are the real ones. Devil's Peak is 1,000 m against the table's
 * 1,086, so 0.92 — 41.4 here, brought to 40.5 so the tabletop clearly wins — and
 * Lion's Head is 669 m, 0.62, so 27.8. That Devil's Peak comes within 4.5 units
 * of the table is not a mistake to correct: it is why the range has two summits
 * and not one, and the thing that separates them is that his is a *point* and
 * hers is a line.
 *
 * The two saddles are deliberately unequal, and that asymmetry is the range's
 * signature. The Saddle, between the table and Devil's Peak, is high — 750 m,
 * 31 here — so the peak grows out of the massif's own shoulder. **Kloof Nek**,
 * between the table and Lion's Head, is low — about 250 m, 13 here, barely above
 * the scree line — so Lion's Head stands almost free with sky most of the way
 * down beside it. One high notch and one deep one is what a range looks like;
 * two of the same is a cardboard cut-out.
 */
const SADDLE_X = -35.5;
const SADDLE_TOP = 31;
const DEVIL_X = -43;
const DEVIL_TOP = 40.5;
const NEK_X = 33;
const NEK_TOP = 13;
const LION_X = 45;
const LION_TOP = 27.8;

/**
 * The plateau behind the lip: `[x0, x1, z0, z1, top]`, south-facing courses.
 *
 * The first is at the summit's own height, so the top surface is **level but not
 * rectangular** — that pair is what a mesa looks like from above and a roof
 * never does. The two behind it are the massif falling away south towards
 * Constantia Nek, which in life runs another 5 km and here gets 18 units and two
 * steps.
 */
const SHELVES: ReadonlyArray<
  readonly [x0: number, x1: number, z0: number, z1: number, top: number]
> = [
  [-26, 16, -14, -4, 45],
  [-29, 20, -20, -14, 40.5],
  [-23, 12, -27, -20, 35],
];

/**
 * The ends of the table, stepping down to the two saddles:
 * `[x0, x1, z0, z1, top]`.
 *
 * A mesa's ends are not its front. The front is a wall because water and wind
 * cut it as one; the ends are where the massif breaks up, and left as a single
 * vertical plane the size of the front they turn the whole thing back into a
 * box seen in three-quarter view. Two steps on the west, dropping towards
 * `NEK_TOP`; one on the east, because Devil's Peak's own mass takes over at
 * once there and a second step would be built inside it.
 *
 * The cost of that single step is worth writing down: it tops out at 38.5, so
 * the notch the skyline actually shows between the table and Devil's Peak is
 * 38.5 and not `SADDLE_TOP`'s 31, and the peak clears its own shoulder by two
 * units rather than nine. It is still a notch and Devil's Peak is still a
 * point above it, but this end of the range is the weaker of the two — Kloof
 * Nek's drop to 13 is what carries the read.
 */
const ENDS: ReadonlyArray<
  readonly [x0: number, x1: number, z0: number, z1: number, top: number]
> = [
  [-38.2, -32.7, -4, 13, 38.5],
  [28.7, 34.0, -3, 13, 39.0],
  [34.0, 37.6, -1, 11, 27.0],
];

export const tableMountain: Monument = {
  id: 'table-mountain',
  name: 'Table Mountain',
  iso: 'ZAF',
  lat: -33.957,
  lon: 18.403,
  realHeight: 1085,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const rock = palette.slate;
    const gully = palette.brown;
    const shadow = palette.bark;
    const talus = palette.brown;
    const fynbos = palette.green;

    const group = new THREE.Group();

    /**
     * A prism stretched along x, standing on its own base.
     *
     * Everything massive in this file is one of these. `taper` is regular in
     * plan, so the half-widths in x and z would be equal; scaling the mesh in x
     * afterwards makes them independent, and because the narrowing is uniform
     * the stretch applies to top and bottom alike. Eight sides, because with a
     * flat face on +Z an octagon's widest vertex in x sits exactly on the
     * apothem — so a stretched octagon reaches `halfX` and not a corner's worth
     * further, which is the whole reason the two flanking peaks fit inside the
     * footprint circle. A pentagon does not: its widest vertex is at 1.18 of
     * the apothem, and three crags had to be pulled in once that was measured.
     */
    const mass = (
      x: number,
      z: number,
      y: number,
      halfZ0: number,
      halfZ1: number,
      halfX0: number,
      height: number,
      color: number,
      sides = 8,
    ): Group => {
      const holder = new THREE.Group();
      const mesh = taper(halfZ0, halfZ1, height, color, sides);
      mesh.scale.x = halfX0 / halfZ0;
      holder.add(mesh);
      holder.position.set(x, y, z);
      return holder;
    };

    /** A block given by its plan corners and its top, standing on the ground. */
    const slab = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      base: number,
      top: number,
      color: number,
    ): Group => {
      const holder = new THREE.Group();
      const mesh = box(x1 - x0, top - base, z1 - z0, color);
      mesh.position.set((x0 + x1) / 2, base, (z0 + z1) / 2);
      holder.add(mesh);
      return holder;
    };

    // --- the scree apron ---
    // First, so everything else is drawn standing in it.
    group.add(
      mass(
        MASSIF_X, MASSIF_Z, 0,
        SCREE_BASE_Z, SCREE_TOP_Z, SCREE_BASE_X,
        SCREE, talus,
      ),
    );

    for (const [x, height] of FANS) {
      // Centred on the cliff plane, so half the cone is buried in the wall and
      // what shows is a fan banked against it with its apex at the gully mouth.
      const reach = 1.5 + FAN_SLOPE * height;
      group.add(mass(x, FRONT, 0, reach, 1.5, reach * FAN_WIDE, height, talus, 6));
    }

    // --- the cliff: eight masses, their flutes and their ledges ---
    const spanned = BUTTRESSES.reduce((sum, b) => sum + b.width, 0);
    const scale = (TABLE_X1 - TABLE_X0) / spanned;
    const bayTop = CLIFF_TOP - BROW;
    let cursor = TABLE_X0;

    for (const buttress of BUTTRESSES) {
      const width = buttress.width * scale;
      const x0 = cursor;
      const x1 = cursor + width;
      cursor = x1;
      const massFace = FRONT - buttress.set;
      const fluteWidth = width / buttress.flutes.length;

      buttress.flutes.forEach((flute, index) => {
        const slot = buttress.slot?.[0] === index ? buttress.slot[1] : 0;
        const face = massFace - flute - slot;
        const slice = box(fluteWidth, bayTop, face - BACK, slot > 0 ? shadow : rock);
        slice.position.set(x0 + fluteWidth * (index + 0.5), 0, (face + BACK) / 2);
        group.add(slice);
      });

      for (const y of buttress.ledges ?? []) {
        const ledge = box(width - LEDGE_INSET * 2, LEDGE_THICK, LEDGE_OUT + 2.6, rock);
        ledge.position.set((x0 + x1) / 2, y, massFace + LEDGE_OUT - (LEDGE_OUT + 2.6) / 2);
        group.add(ledge);
      }
    }

    // --- the brow, then the cap ---
    // Two boxes, and between them they are the whole read: one flush band the
    // length of the table, and one lid whose top is `TOP` everywhere.
    const brow = box(TABLE_X1 - TABLE_X0, BROW, FRONT - BACK, rock);
    brow.position.set((TABLE_X0 + TABLE_X1) / 2, bayTop, (FRONT + BACK) / 2);
    group.add(brow);

    const cap = box(
      TABLE_X1 - TABLE_X0 + CORNICE * 2,
      CAP,
      FRONT - BACK + CORNICE * 2,
      rock,
    );
    cap.position.set((TABLE_X0 + TABLE_X1) / 2, CLIFF_TOP, (FRONT + BACK) / 2);
    group.add(cap);

    // --- the plateau behind it, and the ends stepping down to the saddles ---
    for (const [x0, x1, z0, z1, top] of SHELVES) group.add(slab(x0, x1, z0, z1, 0, top, rock));
    for (const [x0, x1, z0, z1, top] of ENDS) group.add(slab(x0, x1, z0, z1, 0, top, rock));

    // --- the Saddle, and Devil's Peak out of it ---
    group.add(mass(SADDLE_X, -2, 0, 13, 10.5, 11, SCREE, talus));
    group.add(mass(SADDLE_X, -2, SCREE, 10.5, 7.5, 9, SADDLE_TOP - SCREE, rock));

    group.add(mass(DEVIL_X, -1, 0, 13.5, 11, 11.2, SCREE + 2, talus));
    group.add(mass(DEVIL_X, -1, SCREE + 2, 11, 7.5, 10, 14, rock));
    group.add(mass(DEVIL_X + 0.6, -0.5, 28, 7.5, 1.0, 6.8, DEVIL_TOP - 28, rock, 5));
    // Crags on the ridge running down to the sea, so the peak has a ridge and
    // not two symmetrical sides.
    group.add(mass(DEVIL_X - 6.5, 1.5, 20, 4.0, 1.2, 3.4, 8.5, rock, 5));
    group.add(mass(DEVIL_X - 7.5, -2.0, 14, 3.2, 1.0, 2.8, 6.0, gully, 5));
    group.add(mass(DEVIL_X + 5.5, 2.5, 22, 3.6, 1.1, 3.2, 6.5, rock, 5));

    // --- Kloof Nek, and Lion's Head beyond it ---
    group.add(mass(NEK_X, 0, 0, 12, 9.5, 6.5, NEK_TOP, talus));

    group.add(mass(LION_X, 0, 0, 11, 8, 9.5, SCREE - 2, talus));
    group.add(mass(LION_X, 0, SCREE - 2, 8, 4.2, 8, 11, rock));
    group.add(mass(LION_X - 0.5, 0.5, 21, 4.2, 0.8, 4.2, LION_TOP - 21, rock, 5));
    group.add(mass(LION_X + 4.5, -1.5, 12, 3.2, 1.0, 3.0, 5.5, gully, 5));

    // --- the foot ---
    // Clamped at the ground: near the apron's toe the slope is under a unit
    // deep, and a clump sunk `PLANT_SINK` into it there would take the model
    // below y = 0, which the contract reads as sinking into the planet.
    const seat = (z: number): number => Math.max(0, apronAt(z) - PLANT_SINK);

    for (const [x, z, size, height, yaw] of BOULDERS) {
      const block = box(size, height, size * 0.8, rock);
      block.position.set(x, seat(z), z);
      block.rotation.y = yaw;
      group.add(block);
    }

    for (const [x, z, w, h, d, yaw] of FYNBOS) {
      const clump = box(w, h, d, fynbos);
      clump.position.set(x, seat(z), z);
      clump.rotation.y = yaw;
      group.add(clump);
    }

    for (const [x, z, w, h, d, yaw] of OUTLIERS) {
      const clump = box(w, h, d, fynbos);
      clump.position.set(x, 0, z);
      clump.rotation.y = yaw;
      group.add(clump);
    }

    return group;
  },
};
