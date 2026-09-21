import type { Group, Monument, Object3D } from './contract.ts';

/**
 * Mount Kilimanjaro.
 *
 * The second mountain in the set, and every decision here was taken against the
 * first. `mount-fuji.ts` is a symmetrical cone with a concave flank and a snow
 * cape hanging off it; Kilimanjaro is not a cone at all, and the four facts that
 * name it are each the opposite of one of Fuji's.
 *
 * - **It is a massif: three volcanoes in one silhouette.** The great flat Kibo
 *   in the middle, the shattered horn of **Mawenzi** standing out to the east,
 *   the low broken rim of **Shira** to the west. That trio is the read, and it
 *   is why this model is deliberately lopsided where Fuji's file says "the whole
 *   brief for this mountain is symmetry".
 * - **The profile has a shoulder in it, and the summit is a table.** See
 *   `PROFILE`: the flank climbs at 40, 48, 50, 49, 49 degrees, then **lies back
 *   to 34** for the Saddle — the high bench the other two cones stand on — then
 *   stands up again at 55 and 60 for Kibo's own cone before breaking to 27 as it
 *   rolls onto a 27.6-unit plateau. Fuji's climb monotonically from 27 to 70 and
 *   end in a point with a dent in it. A break in slope is the one thing a cone
 *   cannot have, and the whole silhouette turns on it: without the bench this
 *   mountain renders as a haystack, which is exactly what the first version of
 *   this file did.
 * - **The ice is a flat slab lying on the plateau, not a cape down the flanks.**
 *   Kilimanjaro's glaciers end in sheer vertical walls; they do not feather out
 *   into the rock. So the ice is `box`es standing `ICE_THICK` proud of the table
 *   with their own inked cliff edge — and it does not cover the summit, because
 *   it no longer does: 85% of it has gone in a century, so four plates hold the
 *   west and south and one patch is left stranded in the east.
 * - **The flanks change colour twice on the way up.** This is the mountain you
 *   climb through five climates, and nothing else on the sheet has that: dark
 *   rainforest, pale moorland, bare alpine rock. `FOREST` and `MOOR` are
 *   `PROFILE` heights, so the zones are a change of material and not a decal,
 *   and the tongues are the forest climbing the gullies, which is what keeps
 *   both lines off the horizontal.
 *
 * **Why this is a model and not terrain.** Asked at 3.067 S, 37.355 E,
 * `terrain.ts` returns **129 units** of raw relief — real ground, unlike Fuji's
 * 2.7, because the site sits inside the falloff of the `Ethiopian highlands`
 * range, whose path ends at [-3, 36] a degree and a third to the west. But what
 * it returns is a *ramp*: across the 180 units of the monument pad the relief
 * falls smoothly and monotonically from 163 to 91, and the highest ground within
 * three degrees is 222 units of noise 250 km away at 2.2 S, 35.5 E. There is no
 * summit here, and ridged noise has no way to grow one with a flat top, a
 * caldera and two satellite cones. `placement.ts` flattens a 90-unit pad under
 * every monument in any case. What the site does provide is the one thing that
 * is right: a wide elevated plain, 129 units up, for a mountain that in life
 * stands alone off a 900 m plateau. The plain is the site's; the mountain is
 * this file's.
 *
 * **Tier: `landmark`, and the height deliberately at 40% of the cap.** The
 * recognition question — "from how far should a player be able to name it?" —
 * answers itself: it is the roof of a continent, seen from 150 km away across
 * the Amboseli plain. The arithmetic rules out the rest. `tower` caps the
 * footprint at 28, which cannot hold a massif. `building` — the tier Uluru
 * argues its way into on exactly this kind of reasoning — caps the *height* at
 * 40, and this shape needs more: the table at 44, the Saddle bench 16 below it
 * and Mawenzi's spires standing 14 clear of the flank they rise from are three
 * levels, and squeezed under 40 they collapse into one lumpy ridge.
 *
 * So `landmark`, at 48 units to Uhuru Peak — 71% of Fuji's 67 at the same
 * 110-unit width. The inversion is deliberate: Kilimanjaro is the taller
 * mountain by 2,119 m and the *shorter* model, because the only way a
 * 110-unit-wide silhouette can say "broad" is by being low. 110 x 48 is 2.29
 * wide-to-tall against Fuji's 1.64, 40% flatter, and that difference is the
 * difference between the two mountains, side by side on one contact sheet.
 *
 * **Vertical exaggeration: 5.2x, and nothing is cropped.** The massif runs about
 * 60 km east-west by 40 north-south and rises 4,995 m off its plateau: a real
 * half-profile of 30 km to 5 km, 6 : 1, a slope of 9.5 degrees. The `landmark`
 * footprint circle caps the model at 110 wide, so it is 55 out and 48 up,
 * 1.15 : 1 — the vertical stretched 5.2x, the same move as Fuji's 4.5x and the
 * Golden Gate's 2.3x, and `radius / height` lands at 1.14 against the 2.00 the
 * contract allows. The plan is not squeezed to pay for it: `SPREAD` stretches
 * the shield 1.4x east-west against the real massif's 1.5, so the mountain is
 * wide in the axis it is actually wide in, and the two satellites have somewhere
 * to stand.
 *
 * What the stretch broke, and what it cost: at 5.2x the caldera comes out a
 * 4-unit dot. It is 2.4 km on a 60 km base, 0.04 of the width, and it is 17.4
 * units on 110 here, 0.16 — **4x** — with the summit table at 0.25 against a
 * real 0.067, **3.7x**. Both are exaggerated for the reason Fuji's crater is:
 * "flat on top with a hole in it" has to survive being 40 pixels tall, and at
 * true scale it does not survive at all. The cost is paid on the flanks, which
 * come out steeper than 5.2x alone would make them, and that is the trade: a
 * plateau you can see, on a mountain steeper than life, beats a mountain at the
 * right angle with no summit on it.
 *
 * **Colour.** Fuji is slate and white and can be, standing on Japan's olive. In
 * Africa the land is `clay`, so — Uluru's rule, that a landform must not read as
 * a browner lump of its own continent — the rock here is `tan`: the same warmth,
 * far less saturation, and on the contract's warm list, which matters because
 * the caldera is a recess and `bone` and `steel` come back reading as holes when
 * the sun turns off them. Then `darkOlive` for the rainforest belt and `green`
 * for the moorland above it; `bark`, at half tan's luminance, for Mawenzi —
 * whose shattered dykes really are the dark thing in every photograph of the
 * massif — and for the ash on the caldera floor; and `white`, the palette's warm
 * white, for the ice.
 */

const DEG = Math.PI / 180;

/**
 * East-west stretch of the shield.
 *
 * The massif is 60 km by 40, and this is that 1.5 rounded down: the front
 * silhouette takes the full 110 units of the footprint circle, and the cost is
 * paid where it should be: seen end-on from the north or south the mountain is
 * 78 by 48, 1.63 : 1, which is Fuji's own proportion. That is the honest trade —
 * a circular footprint has one width to give and this mountain spends it on the
 * axis that carries Mawenzi and Shira. The front is the view this model is drawn
 * for, and it is also the view every photograph of Kilimanjaro is taken from.
 *
 * It is applied to a `Group` holding the whole radial shield rather than mesh by
 * mesh, which is what keeps the band stack seamless: one linear map takes the
 * cone to the stretched cone, so anything lying on the first still lies on the
 * second. Slabs rotated inside it are sheared as well as stretched — which cost
 * a revision: sheared *wide* they read as torn paper stuck on the mountain, so
 * everything lying on this flank is narrow and long, and the shear is then free
 * variety instead, and the reason no two ridges here are the same ridge.
 */
const SPREAD = 1.4;

/** Facets around the shield. 24 gives a 15-degree facet, as on Fuji, for the same reason. */
const SIDES = 24;

/**
 * The profile: half-width **across the flats before the stretch**, at each
 * height. The number in the comment is that width after the stretch — what the
 * front camera sees — and then the slope of the band below it.
 *
 * Read the slopes and not the radii, as on Fuji, but read them for the opposite
 * thing. Fuji's climb without interruption because a cone's do. These climb to
 * 50, **lie back to 34 across the Saddle**, climb again to 60 for Kibo's own
 * cone, and ease to 27 rolling onto the table. Two of those dips are the
 * mountain: the 36 is the bench Mawenzi and Shira stand on, the thing that makes
 * this a massif rather than a hill, and the 34 is the shoulder turning over onto
 * a flat top instead of closing to a point.
 *
 * That bench was 21 degrees in one version and it was too much of a good thing:
 * a 28-degree break at a single seam runs a hard horizontal ring right round
 * the mountain, and the model came back reading as a cornice on a drum — a dam,
 * not a massif. At 34 against its neighbours' 49 and 55 the shoulder is still
 * in the outline and no longer an edge.
 *
 * The roll-over at the top is the same break left deliberately sharp — 52
 * degrees to 27 across one seam. A shoulder easing *onto a plateau* is not a
 * cornice, it is the plateau's own edge, and it is the second half of "flat on
 * top".
 */
const PROFILE = [
  { y: 0, r: 39.0 }, // 54.6 stretched, 54.8 to a corner, inside the 55 footprint
  { y: 6, r: 33.93 }, // 47.5   40 deg
  { y: 11, r: 30.71 }, // 43.0   48    FOREST
  { y: 17, r: 27.14 }, // 38.0   50
  { y: 21, r: 24.64 }, // 34.5   49    MOOR
  { y: 25, r: 22.14 }, // 31.0   49
  { y: 28, r: 18.93 }, // 26.5   34    SADDLE, the bench
  { y: 33, r: 16.43 }, // 23.0   55
  { y: 39, r: 13.93 }, // 19.5   60
  { y: 42.5, r: 12.0 }, // 16.8   52
  { y: 44, r: 9.86 }, // 13.8   27    TABLE
];

/**
 * The two vegetation lines, both `PROFILE` heights so each zone is a band of its
 * own material.
 *
 * The real belts are forest to 2,800 m and moorland to 4,000 m, which against a
 * 900 m plain and a 5,895 m summit is 38% and 62% of the rise. Here they sit at
 * 24% and 47%, the forest pulled down because the model's foot is the mountain's foot and
 * not the farmland twenty kilometres out from it: what has to read is a dark
 * skirt under bare rock, and a forest reaching to mid-height reads as a green
 * mountain.
 */
const FOREST = 11;
const MOOR = 21;

/** The heights of Kibo's summit furniture. The bench is `PROFILE`'s y = 28. */
const TABLE = 44;
const RIM_WALL = 1.6;
const UHURU = 2.4;

/** The caldera, before the stretch: 2.4 km of it at 4x, as the note above explains. */
const RIM_INNER = 3.6;
const RIM_OUTER = 6.2;
const FLOOR_R = 3.4;

/**
 * How thick the ice stands on the table.
 *
 * The number the whole ice cap turns on, and it began at 1.5 and rendered as a
 * white line. A mountain seen from the plain is seen nearly edge-on, so a slab
 * lying flat on a plateau shows the player its *side* and nothing else — and the
 * side has to carry this mountain's most famous fact. It went 1.5, then 2.7,
 * then this, and each of the first two came back from the renderer as a white
 * *line* on the summit. At 3.4 the ice is 7% of the model's height and stands
 * twice the crater rim beside it: from the front it is a white block on a tan
 * table, which is what a photograph of Kilimanjaro is.
 *
 * It is the most exaggerated number in the file and worth saying so. The real
 * ice walls are 15 to 40 m, which at 104 m to the unit is 0.15 to 0.4, so this
 * is roughly 10x — against the mountain's own 5.2x and the caldera's 4x. The
 * defence is the caldera's, one step stronger: at true thickness the feature
 * does not exist on screen at all, and it is the feature this mountain is named
 * for.
 */
const ICE_THICK = 3.4;

/**
 * Thickness of a slab lying on the flank against its width. Fuji's number and
 * Fuji's reason: thicker and you see the undersides from the ground.
 */
const SLAB = 0.15;

/**
 * The rainforest climbing the gullies: `[bearing, how far it runs above the
 * treeline, how wide it is at the bottom]`.
 *
 * Nine of them on bearings that are not a division of the circle, because this
 * mountain is not symmetrical and a ring of evenly spaced tongues is the fastest
 * way to say that it is. They run **upward and narrowing** — a forest climbs a
 * sheltered gully and thins as it goes — which is the opposite of Fuji's snow
 * tongues, and it matters that the geometry differs and not only the colour.
 */
const FOREST_TONGUES: [bearing: number, rise: number, half: number][] = [
  [12, 4.0, 3.4],
  [47, 1.5, 4.6],
  [88, 5.0, 2.8],
  [131, 2.5, 4.0],
  [168, 4.5, 3.0],
  [205, 1.0, 4.8],
  [253, 5.5, 2.6],
  [300, 3.0, 4.2],
  [334, 2.0, 3.6],
];

/** The moorland doing the same above its own line, on other bearings again. */
const MOOR_TONGUES: [bearing: number, rise: number, half: number][] = [
  [28, 3.5, 3.2],
  [72, 4.5, 2.6],
  [143, 2.0, 3.6],
  [192, 4.0, 2.8],
  [265, 2.5, 3.0],
  [318, 4.5, 2.4],
];

/**
 * The ribs and the barrancos: the radial ridges and the ravines cut between
 * them, as slabs lying along the flank. `[bearing, from, to, half-width, dark]`.
 *
 * They come in two runs, below the Saddle and above it, and **none of them
 * crosses it**. A slab is a straight chord between two heights, so one spanning
 * the bench would bridge it and hang in the air over the terrace — which is the
 * same reason Fuji breaks its ridges into three runs, arrived at from the other
 * end.
 *
 * The ribs also do a job that has nothing to do with geology. A stack of tapers
 * is a stack of *meshes*, `OutlineEffect` inks every one, and the bare upper
 * cone came out banded with horizontal hoops — a lampshade. Nothing was wrong
 * with the profile; the ink was drawing the construction. Ribs crossing the
 * seams break every hoop into arcs, and since a rib is the same `tan` as the
 * rock behind it, all it adds is the vertical line, which is what a scree ridge
 * looks like anyway.
 */
const LOWER_RIBS: [bearing: number, from: number, to: number, half: number, dark: boolean][] = [
  [4, 14, 26.5, 4.0, false],
  [58, 15, 26.0, 3.4, false],
  [112, 14, 27.0, 4.6, false],
  [163, 15, 26.0, 3.6, false],
  [221, 14, 26.5, 4.2, false],
  [276, 15, 27.0, 3.2, false],
  [326, 14, 26.0, 4.4, false],
  [258, 13, 26.5, 5.2, false], // the three that carry Shira's western mass
  [272, 12, 27.0, 6.0, false],
  [286, 13, 26.0, 4.8, false],
  [22, 7, 23.5, 1.5, true],
  [95, 8, 22.0, 1.3, true],
  [168, 7, 23.5, 1.6, true],
  [240, 8, 21.5, 1.4, true],
  [312, 7, 23.0, 1.5, true],
];

const UPPER_RIBS: [bearing: number, from: number, to: number, half: number, dark: boolean][] = [
  [15, 29, 40.5, 2.6, false],
  [61, 29, 38.0, 2.2, false],
  [104, 30, 41.0, 2.4, false],
  [152, 29, 39.0, 2.8, false],
  [198, 30, 40.5, 2.3, false],
  [243, 29, 37.5, 2.6, false],
  [289, 30, 41.0, 2.2, false],
  [336, 29, 39.5, 2.5, false],
  [38, 30, 39.0, 1.2, true],
  [128, 29, 41.0, 1.1, true],
  [219, 30, 38.5, 1.3, true],
  [311, 29, 40.5, 1.2, true],
];

/**
 * Teeth on the caldera rim: `[bearing, height, half-width]`.
 *
 * Four, not a ring of them — a rim is uneven, not crenellated. Uhuru Peak, the
 * 5,895 m point and the highest thing in the model at 48, is on the south-west,
 * which is the front-left of the fixed camera: the summit of Africa should not
 * be round the back.
 */
const TEETH: [bearing: number, height: number, half: number][] = [
  [318, UHURU, 2.2], // Uhuru Peak
  [352, 0.7, 1.8], // Stella Point
  [100, 0.9, 2.0], // Gillman's Point
  [212, 0.5, 1.6],
];

/**
 * The ice, as flat slabs on the table: `[width, depth, x, z, yaw]`.
 *
 * Four overlapping plates make one lopsided icefield over the west and south of
 * the plateau — overlapping, so their union has a stepped edge rather than four
 * separate lids — and one small patch is stranded out east. The fourth sits hard
 * against the plateau's front lip on purpose: ice in the middle of a table is
 * ice the front camera sees end-on across two units of bare rock, and the white
 * has to reach the outline to count. That patch is the
 * point of the arrangement: the ice held the whole summit within living memory,
 * so a cap that covered the table evenly would be telling the wrong century.
 *
 * There was a Furtwängler plate too, lower than the rest on the crater floor.
 * It is gone: the plates below stand 3.4 thick across a caldera that is two
 * thirds of the table's depth, so it was sealed under the Northern Icefield and
 * never on screen. The note in the build where it stood has the numbers.
 *
 * Between them the four plates hold about 60% of the table, all of it west and
 * south, which is both the right shape and — with the stranded patch — the
 * right century. They were half that size in one version and vanished at
 * thumbnail size: against Fuji's cape, which is half of Fuji, an ice cap that
 * is 8% of the silhouette is not a landmark's worth of the most famous ice on
 * the planet.
 *
 * Every corner is kept inside the ellipse the table's 24-gon inscribes, 13.0 by
 * 9.3. A slab that overhangs the plateau is a slab hanging in the air.
 */
const ICE: [w: number, d: number, x: number, z: number, yaw: number][] = [
  [14.0, 7.4, -2.6, -1.4, 0.06], // the Northern Icefield
  [5.5, 5.8, -7.6, 0.4, -0.3], // the western lobe, over the Breach
  [9.0, 5.0, -2.0, 5.0, 0.1], // the Southern Icefield, on the front rim
  [6.0, 3.0, -1.0, 7.4, 0.05], // the Rebmann, right on the plateau's front lip
  [3.4, 2.4, 8.4, 2.0, 0.55], // what is left in the east
];

/**
 * Mawenzi, offset from `MAWENZI_X, MAWENZI_Z`: `[x, z, half-width at the base,
 * half-width at the top, top height, lean, dark]`.
 *
 * Six spires out of one plug rather than a second cone, because Mawenzi is an
 * eroded core — a horn of shattered rock threaded with dykes — and the one thing
 * it is not is smooth. Every spire starts at 16, below the plug's own top, so
 * what reaches the skyline is only their points: a flat lid up there would be a
 * second summit table, which is the one thing this side of the mountain must not
 * have.
 *
 * It stands at x = 32 against a true 11 km from Kibo's summit, which at this
 * scale would be 20. Pushed out to 17.5 km equivalent, 1.6x, because the notch
 * between the two has to be visible: at true spacing Mawenzi grows straight out
 * of Kibo's flank and the massif reads as one lump. Its summit is at 38 against
 * Kibo's 48 — 79%, where the real pair is 85% — and it stands 14 units clear of
 * the flank it rises from.
 */
const MAWENZI_X = 32;
const MAWENZI_Z = -2;
const MAWENZI: [
  x: number,
  z: number,
  base: number,
  top: number,
  y: number,
  lean: number,
  dark: boolean,
][] = [
  [-1.0, 1.0, 4.6, 0.8, 38.0, 0.05, true], // Hans Meyer Peak, the 5,149 m point
  [2.8, -2.0, 3.4, 0.6, 34.5, -0.07, false],
  [-3.6, 3.2, 3.6, 0.7, 33.0, 0.04, true],
  [3.2, 4.0, 2.8, 0.5, 31.0, -0.05, true],
  [5.6, 0.8, 2.6, 0.5, 29.5, 0.08, false],
  [-2.8, -3.2, 3.0, 0.6, 32.0, -0.06, true],
];

/**
 * Shira, as a broken ridge standing on the western shoulder: `[x, z,
 * half-width, height it reaches]`.
 *
 * Shira lost two attempts before this one, in the way Uluru's file describes.
 * As a wedge buried in the west flank it presented a 68-degree escarpment from
 * nearly ground level and read as a butte someone had leaned against the
 * mountain. Raised into a shelf with pinnacles on it, it read as a battlement —
 * and worse, `groundUnder` proved it was cheating: the shelf's outer lip stood
 * 5.8 units past the flank it was supposed to be sitting on, hanging in the air
 * where nothing but the front camera's angle hid it.
 *
 * What it is in life is the remnant rim of the massif's oldest cone, whose
 * western side collapsed — 3,962 m, 61% of the way from the plain to Uhuru. So
 * once the Saddle bench existed the answer was already on the table, in both
 * senses: the bench *is* the Shira Plateau on that side, and Shira is a row of
 * crags standing on it and nothing else. No shelf, no mass of its own: each
 * block's height is given as a **rise above the flank it stands on**, not as a
 * summit height, which is the only way a crest on a slope stays a crest. Given
 * absolute tops instead, the western blocks — standing where the flank is ten
 * units lower — grew into towers, and seven towers in a row is a ruined wall.
 *
 * They also stay **on the bench**, between x = -26 and -32, and not one step
 * further west. A prism standing on a slope shows its whole downhill face, so on
 * the 49-degree flank below the bench every crag came out a rectangle taller than
 * it was wide, and five of those descending the flank read as a staircase of
 * boxes. On the bench's 34 degrees the same crag is six wide and six tall and
 * reads as rock. The mass Shira needs further out is carried by three wide ribs
 * on western bearings in `LOWER_RIBS` instead, which lie *along* the slope and
 * so have no vertical face to give away.
 *
 * The crest descends westward with the shoulder it sits on, 32 down to 26, so
 * Shira tops out at 32 of 48: much the shortest of the three summits, which is
 * right.
 */
const SHIRA: [x: number, z: number, half: number, rise: number][] = [
  [-26.0, 2.6, 3.0, 4.6],
  [-28.2, -2.4, 3.6, 5.4],
  [-27.4, -6.6, 2.6, 3.8],
  [-30.4, 4.4, 2.8, 3.2],
  [-31.6, -5.2, 2.6, 3.4],
  [-29.4, 8.0, 2.4, 2.4],
];

/** The pre-stretch profile radius at a height, linearly interpolated. */
function radiusAt(y: number): number {
  const first = PROFILE[0]!;
  if (y <= first.y) return first.r;
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1]!;
    const b = PROFILE[i]!;
    if (y <= b.y) return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
  }
  return PROFILE[PROFILE.length - 1]!.r;
}

/**
 * The inverse: how high the shield's surface is at a pre-stretch radius.
 *
 * This exists because "put a crag on the flank" is not something you can do by
 * eye in a table of coordinates. A block dropped at the height its centre sits
 * at will hang its downhill corners in the air by half its width times the
 * slope, which on a 50-degree flank is most of a block — and from the fixed
 * front camera you cannot see it happen. So nothing on this mountain is placed
 * at a height chosen by hand: `groundUnder` samples the surface all round a
 * piece's footprint and starts it at the lowest, which buries the uphill side
 * and leaves nothing floating on the downhill one.
 */
function heightAt(radius: number): number {
  const first = PROFILE[0]!;
  if (radius >= first.r) return 0;
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1]!;
    const b = PROFILE[i]!;
    if (radius >= b.r) return a.y + ((b.y - a.y) * (a.r - radius)) / (a.r - b.r);
  }
  return PROFILE[PROFILE.length - 1]!.y;
}

/** The shield's surface height under a point, in final (stretched) coordinates. */
function surfaceAt(x: number, z: number): number {
  return heightAt(Math.hypot(x / SPREAD, z));
}

/** The lowest the surface gets under a disc of `radius` about a point. */
function groundUnder(x: number, z: number, radius: number): number {
  let lowest = surfaceAt(x, z);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    lowest = Math.min(lowest, surfaceAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius));
  }
  return lowest;
}

export const kilimanjaro: Monument = {
  id: 'kilimanjaro',
  name: 'Mount Kilimanjaro',
  iso: 'TZA',
  lat: -3.067,
  lon: 37.355,
  realHeight: 5895,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, taper, column, ringWall } = ctx;
    const forest = palette.darkOlive;
    const moor = palette.green;
    const rock = palette.tan;
    const shadow = palette.bark;
    const ice = palette.white;

    const group = new THREE.Group();

    /** Which climate zone a height is in. */
    const zone = (y: number): number => (y < FOREST ? forest : y < MOOR ? moor : rock);

    // --- the shield ---
    // Everything radial lives in here and is stretched east-west together, so
    // the band stack stays seamless. See `SPREAD`.
    const shield = new THREE.Group();
    shield.scale.x = SPREAD;
    group.add(shield);

    for (let i = 0; i + 1 < PROFILE.length; i++) {
      const a = PROFILE[i]!;
      const b = PROFILE[i + 1]!;
      const band = taper(a.r, b.r, b.y - a.y, zone(a.y), SIDES);
      band.position.y = a.y;
      shield.add(band);
    }

    /**
     * A slab lying along the flank between two heights, standing proud of it.
     *
     * This holder is `mount-fuji.ts`'s, and it is the only thing the two files
     * share: a `taper` stands on +Y, so it is held in a group turned about X
     * until its +Y runs up the slope, which leaves its +Z along the surface
     * normal, and squashing that axis by `SLAB` turns a beam into a slab lying
     * on the mountain rather than a plank nailed to it. `sink` pushes it in —
     * the chord is straight and the flank is not, so sinking a slab buries its
     * ends and leaves the belly showing, which is how a ridge comes out of a
     * slope in the first place.
     */
    const flank = (
      fromY: number,
      toY: number,
      halfBottom: number,
      halfTop: number,
      color: number,
      sink: number,
    ): Group => {
      const bottom = radiusAt(fromY);
      const top = radiusAt(toY);
      const holder = new THREE.Group();
      holder.position.set(0, fromY, bottom - sink);
      holder.rotation.x = Math.atan2(toY - fromY, bottom - top) - Math.PI / 2;

      const slab = new THREE.Group();
      slab.scale.z = SLAB;
      slab.add(taper(halfBottom, halfTop, Math.hypot(toY - fromY, bottom - top), color, 4));
      holder.add(slab);
      return holder;
    };

    /** Puts something on a bearing, 0 being the front. */
    const onBearing = (bearing: number, child: Object3D): Group => {
      const pivot = new THREE.Group();
      pivot.rotation.y = bearing * DEG;
      pivot.add(child);
      return pivot;
    };

    // --- the climate zones' ragged edges ---
    for (const [bearing, rise, half] of FOREST_TONGUES) {
      shield.add(onBearing(bearing, flank(FOREST - 5, FOREST + rise, half, half * 0.3, forest, 0.35)));
    }
    for (const [bearing, rise, half] of MOOR_TONGUES) {
      shield.add(onBearing(bearing, flank(MOOR - 4, MOOR + rise, half, half * 0.3, moor, 0.3)));
    }

    // --- the ribs and the barrancos ---
    // A ravine is a groove, so it is sunk until little but its floor shows; a
    // rib is meant to stand proud and catch the ink, so it barely sinks at all.
    for (const [bearing, from, to, half, dark] of LOWER_RIBS) {
      const color = dark ? shadow : rock;
      shield.add(onBearing(bearing, flank(from, to, half, half * 0.55, color, dark ? 1.3 : 0.3)));
    }
    for (const [bearing, from, to, half, dark] of UPPER_RIBS) {
      const color = dark ? shadow : rock;
      shield.add(onBearing(bearing, flank(from, to, half, half * 0.5, color, dark ? 0.6 : 0.25)));
    }

    // --- the summit ---
    // Out of the shield group and into final coordinates: the rim and the floor
    // carry their own `scale.x` because they are unrotated and take it without
    // shearing, while the ice slabs are yawed and must not be inside it.
    const rim = ringWall(RIM_INNER, RIM_OUTER, RIM_WALL, rock, 16);
    rim.position.y = TABLE;
    rim.scale.x = SPREAD;
    group.add(rim);

    // Ash, and dark, which is the only thing that makes the summit read as a
    // hole rather than a disc from above.
    const floor = column(FLOOR_R, 0.55, shadow, 14);
    floor.position.y = TABLE;
    floor.scale.x = SPREAD;
    group.add(floor);

    // The Reusch Crater's ash cone stood here, and has been taken out. Nothing
    // that lies on this floor can be seen, and the reason is a number rather
    // than an oversight: the caldera is 6.2 deep against the table's 9.3, two
    // thirds of it, so the ice plates have nowhere to lie except across it. The
    // Northern Icefield spans x -9.6..4.4 and z -5.1..2.3 and the floor spans
    // x +/-4.76 and z +/-3.4, so the plate covers all of it bar a 0.36-unit
    // crescent on the east — and it stands 3.4 thick over a cone 0.7 tall. The
    // cone and the Furtwangler plate that sat beside it were 44 triangles and
    // two meshes drawing nothing.
    //
    // Making the crater read again is an ice decision, not a crater one: the
    // plates would have to come off the caldera, and `ICE` argues at length for
    // their present size and lopsidedness. Left for whoever takes that on.

    const rimRadius = (RIM_INNER + RIM_OUTER) / 2;
    for (const [bearing, height, half] of TEETH) {
      // Tapered, not square: a block on a rim is a merlon, a wedge is a rock.
      //
      // They start at the table and not on top of the rim, which is the same
      // lesson as `groundUnder` in a smaller place: a tooth is wider than the
      // rim it stands on, so perched on the rim's top face it hung a 1.4-unit
      // lip 1.6 units above the terrace on one side and above the crater floor
      // on the other. Standing them on the table and letting the rim wall run
      // through them costs `RIM_WALL` of buried height and nothing else.
      const tooth = taper(half, half * 0.45, RIM_WALL + height, rock, 5);
      tooth.position.set(
        Math.sin(bearing * DEG) * rimRadius * SPREAD,
        TABLE,
        Math.cos(bearing * DEG) * rimRadius,
      );
      group.add(tooth);
    }

    // --- the ice ---
    for (const [w, d, x, z, yaw] of ICE) {
      const slab = box(w, ICE_THICK, d, ice);
      slab.position.set(x, TABLE, z);
      slab.rotation.y = yaw;
      group.add(slab);
    }
    // The Furtwangler plate stood here. See the note where the ash cone was: it
    // lay on the crater floor, 0.8 thick, wholly under the Northern Icefield's
    // 3.4 — and it was `ice` on `ice`, so even uncovered it would have had to
    // read as a step in a white block rather than as a plate of its own.

    // --- Mawenzi ---
    // The plug first, buried to the shoulders in the bench, then the spires out
    // of it.
    const plug = taper(7.5, 4.2, 16, shadow, 8);
    plug.position.set(MAWENZI_X, 10, MAWENZI_Z);
    group.add(plug);

    for (const [x, z, base, top, y, lean, dark] of MAWENZI) {
      // A five-sided taper's circumradius is its apothem over cos 36 degrees,
      // and that is the disc the ground has to be found under.
      const reach = base / Math.cos(Math.PI / 5);
      const foot = Math.min(16, groundUnder(MAWENZI_X + x, MAWENZI_Z + z, reach));
      const spire = taper(base, top, y - foot, dark ? shadow : rock, 5);
      spire.position.set(MAWENZI_X + x, foot, MAWENZI_Z + z);
      // Leaned, and each a different way. Mawenzi is the ruin of a volcano cut
      // through by dykes standing at every angle; six uprights in a row is a
      // fence.
      spire.rotation.z = lean;
      spire.rotation.x = lean * 0.7;
      group.add(spire);
    }

    // --- Shira ---
    for (const [x, z, half, rise] of SHIRA) {
      const reach = half / Math.cos(Math.PI / 5);
      const foot = groundUnder(x, z, reach);
      // Blunt, and overlapping their neighbours. Narrow ones stood up as
      // separate fingers on a slope — standing stones, not a ridge — and it is
      // the width against the height that decides which of the two a crag reads
      // as, not the height itself.
      const crag = taper(half, half * 0.55, surfaceAt(x, z) + rise - foot, rock, 5);
      crag.position.set(x, foot, z);
      group.add(crag);
    }

    return group;
  },
};
