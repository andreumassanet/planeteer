import type { Monument } from './contract.ts';

/**
 * Perito Moreno Glacier.
 *
 * **A glacier seen from above is a white field, and a white field reads as
 * snow.** Nothing about the 250 km2 of ice behind this place is nameable at
 * thumbnail size; every glacier on Earth looks like that from a satellite. What
 * makes Perito Moreno the one people travel to is the *terminal face*: a wall of
 * ice standing straight out of a lake, seen side-on from a walkway across the
 * water, close enough that you watch pieces of it fall off. So:
 *
 * > **The wall is the monument. The ice behind it is context, and the lake in
 * > front of it is what proves the wall is a wall.**
 *
 * Four things have to survive when the card is 260 pixels wide:
 *
 * 1. **A level white wall standing straight out of the water**, whose top is
 *    **sawn into teeth**. The serration is the read. Nothing else on this sheet
 *    is a long white mass with a jagged top standing in water, and a smooth one
 *    of the same silhouette is a **dam**.
 * 2. **Vertical fracture down its face**, so the wall is made of ice and not of
 *    concrete.
 * 3. **The calved ice in the lake at its foot**: a scatter of small flat bergs.
 *    They give the scale and they say the thing is breaking rather than sitting.
 * 4. **The field of ice behind**, broken and rising, so the wall is the end of
 *    something instead of a free-standing slab.
 *
 * ---
 *
 * ## Four findings from the render, each of which reversed a decision
 *
 * This shape has a strong gravitational pull toward architecture, and it took
 * four rebuilds to get out of it. All four failures are worth recording, because
 * every one of them looked correct on paper.
 *
 * **1. `skyBlue` is the background.** The contact sheet clears to `SKY_TOP`
 * (0x6fc9d8) and the palette's `skyBlue` is 0x3dbbe7; lit by this rig they land
 * within a few points of each other. So a *narrow* `skyBlue` shape with ink
 * around it does not read as a surface — it reads as a **hole in the model with
 * sky showing through**, which is the exact opposite of a crevasse. The first
 * version had eight blue fissures and rendered as a building with eight windows
 * knocked out of it. Victoria Falls gets away with `skyBlue` because its river is
 * a broad horizontal plate bounded by white and rock, never a slot against sky.
 *
 * So **the fracture blue is `slate`** — the palette's other blue, more B than R,
 * measured in the note beside `ctx.palette` going to 27,23,31 turned away from
 * the sun, at half the ice's luminance, which is what a fissure you cannot see
 * the bottom of actually looks like. `skyBlue` survives in exactly one place,
 * described below, where it is broad, low, and bounded by white above and dark
 * water below so it can never be mistaken for a gap.
 *
 * **2. Cutting the face into full-height columns destroys the wall.** The first
 * version sliced it into thirty separate columns, Uluru-style, each with its own
 * depth, yaw and height. Rendered, it was the Parthenon after an earthquake.
 * Uluru's own file warns about precisely this — "every column owned its own cap,
 * `OutlineEffect` drew a line right round each one, and thirty of them side by
 * side read as a bundle of organ pipes" — and its fix is the fix here: the
 * fracture must not reach the top, because the top has to be one mass.
 *
 * **3. A solid wall with a level top is a fortress, and bumps on it are
 * battlements.** The second version got the wall right — four wide continuous
 * masses, ribs applied to the face rather than cut through it — and came back
 * reading as a warehouse with a parapet, with the ice field behind it looking
 * like an upper storey and a row of evenly-sized pinnacles along the top looking
 * like merlons. What was missing is that **ice does not stand plumb**. So:
 *
 * - The crest is **twenty-six teeth** standing on the wall's own top course —
 *   five fall in a fissure and are dropped, so twenty-one are drawn — and every
 *   one of them is irregular in all six ways at once: width 1.2 to 4.4, height
 *   1.0 to 8.6, its own depth, a taper from a blunt stump to a spike, a **yaw**
 *   of up to 0.4 rad and a **lean** of up to 0.2 rad about Z with a further
 *   forward tilt out over the water. Merlons are identical and plumb; these are
 *   neither, and that single change is what stopped the model being a castle.
 * - The teeth are **short against the wall** — 1 to 8.6 units of a 29-unit face,
 *   averaging 3.5 — so they serrate a skyline that stays level. Level *and*
 *   toothed is what a calving front is, and doing it in one continuous mass with
 *   separate teeth on top is what keeps finding 2 satisfied.
 * - **They shrink with the mass they stand on.** The height is scaled by the
 *   mass's own, so the three steps of the east shoulder carry teeth of three and
 *   four units where the level run carries eight. Full-height blades on a
 *   ten-unit arm read as damage; small ones on it read as distance.
 * - **The field behind is more teeth.** They come off the same generator, one
 *   size smaller, standing on the ice band behind the wall. One vocabulary for
 *   the whole model: it is broken ice all the way back, not a wall plus a
 *   building.
 *
 * **4. A wall with a deep top course is a building with a roof — and the depth
 * of that course, not the height of the ice behind it, is what decides whether
 * the field reads as ice or as an upper storey.** The third version had it the
 * other way round. Its two benches stood at 24 and 28 and carried teeth to 33,
 * over a crest that reached 30 — standing *above* the wall was the only way they
 * could be seen at all, and it is exactly what made them a second storey. Worse,
 * the deep masses that would have let them be seen from lower down gave every one
 * of them a lit flat roof with pinnacles standing on it.
 *
 * The arithmetic is worth carrying to any monument that has something behind
 * something. The sheet's quarter camera sits 13.4 degrees up, so a level surface
 * hides everything behind it that does not rise 0.238 per unit of depth — and
 * the ray that grazes a wall leaves from its **front** top corner, not its back
 * one, so the top course's own depth is charged first. A twelve-unit course
 * makes ice fifteen units behind it climb four units *over* the crest before a
 * pixel of it appears. A four-unit course lets the same ice show from one unit
 * above the crest upward.
 *
 * So the wall is about four units deep at the top, the field sits one to two
 * units above it and no more, and what is seen of the field is a low ridge line
 * and its own teeth, filling the notches between the crest's teeth without ever
 * breaking the skyline. The benches became **one band** in the same change: of a
 * band 24 units deep only the first nine can ever be seen, so the second bench
 * was paying for ice that nothing could have shown.
 *
 * Two more things went with it, both silhouette, both in the tables below: the
 * plan is **bowed** into a lobe instead of running straight, and the east end
 * **descends** in three steps instead of ending on a flat gable. And the lake
 * stopped being a rectangle — see the colour note.
 *
 * The ribs on the face survive from version two and do the rest of requirement
 * 2. Sixteen of them, wide, standing 0.2 to 1.5 units proud of the bare face,
 * each stopping between 55% and 95% of the way up so the top course stays whole.
 * They get their relief from three signals, none of them paint:
 *
 * - **Depth.** From the quarter camera (31.8 degrees off axis) a rib standing 1.2
 *   proud shows 0.6 units of its own side face, and a face pointing +X is a full
 *   band darker on the toon ramp than one pointing +Z.
 * - **Yaw.** The front view has no side faces, so the ribs are twisted instead —
 *   Victoria Falls' finding, applied to ice. With the sheet's sun at
 *   (-0.8, 1.25, 0.75) a face turned more than 5.7 degrees toward -X crosses
 *   `dotNL = 0.5`, which is where the four-step ramp changes texel; yaw runs to
 *   +/-0.3 rad, so two ribs in five come out a band brighter than their
 *   neighbours out of one single white.
 * - **Where they stop.** The tops are scattered, so each is a real ledge and the
 *   face has a broken secondary skyline inside its own silhouette.
 *
 * **Yaw is anchored at the rib's front face, not at its centre.** Rotating a box
 * about its middle swings its front corners sideways into the neighbouring gap;
 * anchored at the front face a rib can only get *narrower* in x as it turns.
 *
 * ---
 *
 * ## Colour
 *
 * Everywhere else in this folder blue is water and white is stone. Glacier ice is
 * the other way round — white on top, blue in the fractures — and that inversion
 * is the most distinctive fact available.
 *
 * - **The lake is `steel`, not `skyBlue`.** Straight from the Golden Temple, for
 *   its two reasons. Value first: this is white ice against *something*, and if
 *   the water is bright there is nothing for the ice to be bright against —
 *   `skyBlue` is nearly as light as `white` and the card becomes a pale shape on
 *   a pale field. `steel` sits at about a third of the ice's luminance. Then the
 *   trick itself: **the scene's `HemisphereLight` is tinted with `SKY_TOP`, so a
 *   horizontal face is the most sky-lit surface there is.** The lake's top comes
 *   out cool and faintly blue while the vertical ice a unit away stays warm, and
 *   that temperature split across a hard ink line is what says water with no
 *   transparency and no reflection. It is also true: Lago Argentino is glacial
 *   flour, milky grey-green, and a postcard-blue lake would be a lie twice over.
 * - **The ice is `white`** — 0xfff2e8, the palette's *warm* white. Not `bone`:
 *   the note on `ctx.palette` measures the only neutral going to a dead
 *   76,68,58 in shade, which is a rock. One colour for all of it, face to bergs.
 *   Every horizontal top face lands on the ramp's brightest texel
 *   (`dotNL = 0.76`) and every vertical face a texel below (0.45), so **every
 *   tooth draws its own hard top edge** with no second colour spent on it.
 * - **`slate` is the fracture**: the three fissures parting the face, and the one
 *   step dropped out of the field behind. See finding 1 for why it is not
 *   `skyBlue` — and note that the step is what is left of a much wider one, which
 *   read as a hole the moment the field sank below the crest and was seen against
 *   sky. Narrow, low, and bounded by white ridges either side, it reads as a
 *   notch. Finding 1 is about shape as much as about colour.
 * - **`skyBlue` is the waterline**, in five broken lengths lying on the lake at
 *   the foot of the wall. This is the one shape it can safely take here: broad,
 *   low, bounded by white ice above and `steel` water below, never against sky. It is
 *   the strongest colour in any photograph of the place — the ice at and just
 *   under the surface glows turquoise — and it is doing structural work too,
 *   because a wall meeting the water in one unbroken line draws a gravity dam.
 *   **It is a plate three units deep, not a strip half a unit deep.** At the
 *   width of a card the thin version came out as four cyan flecks; the plate is a
 *   broken bright line along the foot, and it is the one thing keeping the
 *   `steel` from reading as the model's own shadow.
 * - **`bark` and `green` are the Península de Magallanes**, the wooded headland
 *   the glacier's arm runs into, which is also where the walkways are: the ground
 *   the viewer is standing on. It is the only warm dark in the model and the only
 *   thing in it with a known size. It stands on the **left** because the sun
 *   comes from the left — a dark mass on the shaded right would be mush — and it
 *   runs south past the shore, so the peninsula is joined to the ground the
 *   viewer stands on rather than floating in the channel. The wall runs off the
 *   **right-hand** edge instead, descending as it goes, which is the honest
 *   statement that this is a crop of something six times longer.
 *
 * Six colours, no seventh: the grain comes from geometry and from the ramp. That
 * is the lesson Uluru paid for when a second rock tone turned its flutes into
 * stripes on a pumpkin.
 *
 * **The lake is a channel, not a rectangle.** A rectangle of `steel` under a
 * rectangle of ice is a model standing on a plinth, and that is what it looked
 * like — twice, once as a single slab and once as an L. It is five reaches now,
 * closing to 12 units against the headland and opening to 33 in the middle
 * before the far corner turns back to 26: the Canal de los Témpanos, with the
 * sheet's own green ground left showing along the near-left shore, which is
 * where the walkways are. Three extra meshes, no extra colour, and the dark shape
 * stops being a base and becomes water with a far side.
 *
 * ---
 *
 * ## Scale: the plan is cropped 5.9x, the vertical is stretched 4.4x
 *
 * The face is about 5,000 m of front against 70 m of ice above the water —
 * **71 : 1**, where `halfDiagonal / height` has to come in at 2.00 or under.
 * There is no version of this at true proportion.
 *
 * Following the note beside `MAX_ASPECT`, the axis carrying the least
 * recognition is the one distorted. Unlike Victoria Falls — whose width *is* the
 * quoted fact, so not a metre of its lip was cropped — nobody names Perito
 * Moreno by its 5 km. They name it by the height of the wall and by the calving.
 * So:
 *
 * - **The plan is cropped.** 85 units of face at 10 m to the unit is 850 m, about
 *   a sixth of the front and roughly what the walkways see. The wall runs off the
 *   right-hand edge of the footprint to say so.
 * - **The vertical is stretched 4.4x**, 1 unit to 2.27 m. The top course stands
 *   at 28 to 29.5 and the teeth average 3.5 above it, so the serrated crest sits
 *   about 31.9 units over a waterline at 1.0: 70 m. Uluru took 3.6x, Mount Fuji
 *   4.8x and Victoria Falls 5.1x for the same reason.
 *
 * That lands the model at `53.7 / 36.8 = 1.46` against the 2.00 cap. It was 1.57
 * before the restructure and the extra height is deliberate: the tier allows 40
 * and the cap allows anything down to 26.9, so a 27-unit crest was leaving a
 * quarter of the budget unspent on the one axis this place *is* named by.
 *
 * **What the stretch bought.** The 13.4-degree quarter camera hides anything
 * behind the crest that does not rise faster than 0.238 per unit of depth, and
 * the ice surface behind a heavily crevassed terminus rises at something like 9
 * per cent. At true proportion the field would be invisible and the wall would be
 * a slab standing on nothing. Stretched 4.4x, that grade becomes 0.40 in model
 * units, which is what lets the band behind stand one to two units above the top
 * course instead of level with it. The exaggeration is not a compromise here; with the
 * toothed crest and the shallow top course it is what makes requirement 4
 * possible.
 *
 * **What the stretch costs, and where it is paid: the bergs.** A berg is
 * recognisable by being *flat* — 40 to 80 m of beam against 2 to 5 m of freeboard,
 * fifteen to one or flatter. Nothing here can be that flat: at the plan's 10 m to
 * the unit a true freeboard is 0.2 to 0.5 units, which on a 260-pixel card is a
 * third of a pixel and simply is not drawn. So the bergs take the same 4.4x as
 * everything else — freeboard 0.6 to 2.1 units against 3.5 to 8 of beam, about
 * four to one — and that is the flattest thing the sheet can actually show. What
 * they still carry is the *plan*: 3.5 to 8 units of beam is 35 to 80 m at true
 * scale, a size the eye already knows, and eleven of them scattered along 850 m
 * of face is what tells you the face is 850 m long. That is the whole of what
 * requirement 3 asked them for.
 *
 * **Tier: `building`,** by Uluru's and Victoria Falls' shared arithmetic. A
 * circular footprint caps any monument at 55 units of radius, so a landform this
 * wide can be at most 110 across; at `landmark`'s 120 units of height it would be
 * a tower of ice rather than a wall of it. It lands in the same envelope as Uluru
 * (106 x 37) and the Colosseum (104 x 34), which is the right size on the ground
 * for something you walk to and then walk along.
 *
 * ---
 *
 * ## Rejected
 *
 * - **The rupture arch.** The tunnel the Brazo Rico melts through the dammed ice,
 *   which collapses every few years and is what the news photographs. It is an
 *   event, not the place — and an arch is a shape strong enough that the card
 *   would be named "an arch". Victoria Falls dropped its bridge for this reason.
 * - **The walkways.** Real, famous, and the viewpoint itself. But a boardwalk is
 *   a horizontal thing in the foreground and the camera sits 13.4 degrees up, so
 *   it flattens to a line, and it would put the only man-made geometry in the
 *   model directly in front of the one element that must read.
 * - **Spray, or a plume on a falling block.** Victoria Falls proved that pale
 *   cloud in front of a pale wall destroys the main read, and there the plume was
 *   the name of the place. Here it is not even that.
 * - **Crevasses drawn as recesses in the field's surface.** Transverse crevasses
 *   are horizontal features and this camera annihilates them. One survives as a
 *   **step down in the field** instead: a narrow segment of the band is dropped
 *   two units and painted `slate`, so a crevasse is a dark notch in the ridge
 *   line rather than a slot nobody can see into. Only one, and narrow: the wider
 *   version of it read as a hole punched through the model. See the colour note.
 */

// ---------------------------------------------------------------------------
// The plan. 1 unit = 10 m across, 1 unit = 2.27 m up. See the scale note.
// ---------------------------------------------------------------------------

const WEST = -47;
const EAST = 47;

/** Where the ice starts: the headland has everything west of it. */
const WALL_W = -38;

/** The ice field behind, and the back of the model. */
const FIELD_W = -41;
const FIELD_N = -26;

/** Far edge of the lake, tucked under the ice so no water is ever seen behind it. */
const LAKE_N = -12;

/** Surface of Lago Argentino. The lake is a thin plate from y = 0 to here. */
const WATER = 1.0;

// ---------------------------------------------------------------------------
// The face
// ---------------------------------------------------------------------------

/**
 * The face, as seven continuous masses. Two things are going on in this table
 * and both are silhouette:
 *
 * **The plan is bowed.** `front` follows the arc `3.5 - 9 * ((x + 10) / 57)^2`,
 * plus half a unit of jitter so neighbours still part under the ink: the snout
 * stands 3.5 out into the lake at its nose and falls back to -4.8 at the far
 * east. A glacier terminus is a lobe, and a straight one is a dam wall. The
 * waterline and the brash ride the same arc through `faceAt`, so the bow is
 * drawn where it is most legible — along the bright line where ice meets water.
 *
 * **The east shoulder descends.** Masses four to seven step down 25.8 -> 20.5 ->
 * 15.2 -> 10.8 and lean further back as they go, and the crest teeth shrink with
 * them. That is the last fifth of the width; the other four fifths stay level at
 * 28 to 29.5, because level-and-toothed is what a calving front is. The three
 * eastern steps butt against each other with no gap — the ink there is the drop
 * itself.
 *
 * `back` bows with `front`, so the top course stays **four units deep the whole
 * way along**, never the twelve a straight back would have given the nose. That
 * number is the whole reason the ice field behind can be seen at all: see the
 * fourth finding in the header.
 */
const CORE: ReadonlyArray<{ x0: number; x1: number; front: number; back: number; top: number }> = [
  { x0: WALL_W, x1: -22.6, front: 2.4, back: -1.8, top: 29.0 },
  { x0: -20.6, x1: -3.4, front: 3.1, back: -1.3, top: 28.0 },
  { x0: -1.4, x1: 14.6, front: 3.2, back: -1.0, top: 29.5 },
  { x0: 16.6, x1: 26.0, front: 0.8, back: -3.4, top: 25.8 },
  { x0: 26.0, x1: 34.5, front: -1.1, back: -5.2, top: 20.5 },
  { x0: 34.5, x1: 41.0, front: -2.6, back: -6.6, top: 15.2 },
  { x0: 41.0, x1: EAST, front: -4.8, back: -8.6, top: 10.8 },
];

/**
 * The three fissures parting the first four masses, and how high the `slate`
 * reaches inside each. The three steps of the east shoulder butt against each
 * other instead: there the ink comes from a four-unit drop in the crest, and a
 * slot as well would have cut the arm into pieces.
 *
 * Every top is *below* the ice field behind (24.5 at its lowest), so a fissure is
 * filled with white ice above the blue and the wall never shows sky below its
 * crest — which is the whole difference between a crevasse and a hole. Teeth
 * whose centre falls in a gap are dropped, so the crest is notched here as well.
 */
const FISSURES: ReadonlyArray<{ x0: number; x1: number; top: number }> = [
  { x0: -22.6, x1: -20.6, top: 26.8 },
  { x0: -3.4, x1: -1.4, top: 24.8 },
  { x0: 14.6, x1: 16.6, top: 23.8 },
];

/** Nominal rib width: 49 m of face, wide enough that the gap between two is a line. */
const RIB_PITCH = 4.9;

/** Teeth along the crest. Five of them fall in a fissure and are dropped. */
const CREST_TEETH = 26;

/**
 * The waterline: `skyBlue`, in five lengths with bare wall between them — plates
 * three units deep lying on the lake against the foot of the face, standing `h`
 * above the water. Each one sits inside a single mass and is placed off that
 * mass's own bowed `front`, so the band curves with the snout. See the colour
 * note for why this is the only shape `skyBlue` may take in this model, for why
 * it is a plate and not a strip, and for the other half of its job.
 */
const WATERLINE: ReadonlyArray<{ x0: number; x1: number; h: number }> = [
  { x0: -35.0, x1: -25.0, h: 0.8 },
  { x0: -17.5, x1: -6.0, h: 1.1 },
  { x0: 1.0, x1: 11.5, h: 0.6 },
  { x0: 18.0, x1: 25.0, h: 1.0 },
  { x0: 27.5, x1: 33.0, h: 0.7 },
];

/**
 * Brash: calved blocks jammed against the foot. `out0` and `out1` are distances
 * *in front of the local face*, not absolute z, so the raft of broken ice follows
 * the bow instead of cutting across it. They sit in the stretches of x the
 * waterline leaves bare, so the cyan band and the white brash alternate along the
 * foot and neither buries the other. `h` is freeboard. About half the width is
 * left bare either way, so the wall is still seen meeting the water.
 */
const BRASH: ReadonlyArray<{ x0: number; x1: number; out0: number; out1: number; h: number }> = [
  { x0: -24.0, x1: -18.5, out0: 1.2, out1: 4.4, h: 2.0 },
  { x0: -5.5, x1: 0.5, out0: 1.1, out1: 4.8, h: 2.6 },
  { x0: 12.5, x1: 17.5, out0: 1.3, out1: 4.6, h: 1.9 },
  { x0: 34.0, x1: 40.0, out0: 1.0, out1: 5.0, h: 2.4 },
];

// ---------------------------------------------------------------------------
// The lake
// ---------------------------------------------------------------------------

/**
 * Lago Argentino, as the **Canal de los Témpanos** it actually is: five reaches
 * from a far edge tucked under the ice, opening 12 -> 22 -> 33 and then turning
 * back to 31 -> 26 at the far corner. A rectangle of `steel` under a rectangle of
 * ice is a model on a plinth, and that is what it looked like; a channel that
 * closes against the headland, opens in front of the snout and closes again at
 * the corner is a bay with a far side. The last two reaches are what they are
 * because of the footprint: at x = 47 a circle of radius 54 leaves only 26 units
 * of z, and the water still has to reach the far end of the ice arm — a berg
 * beached on the sheet's green ground is a worse failure than a shoreline that
 * turns.
 */
const LAKE: ReadonlyArray<{ x0: number; x1: number; shore: number }> = [
  { x0: WEST, x1: -27, shore: 12 },
  { x0: -27, x1: -6, shore: 22 },
  { x0: -6, x1: 20, shore: 33 },
  { x0: 20, x1: 38, shore: 31 },
  { x0: 38, x1: EAST, shore: 26 },
];

/**
 * The bergs. `w` and `d` are true metres at the plan's 10 m to the unit — 35 to
 * 80 m of beam, which is what gives the wall its size — and `h` takes the model's
 * 4.4x vertical stretch like everything else, because a true freeboard would be
 * 0.2 to 0.5 units and is not drawable on a card. See the scale note: this is the
 * one place the stretch is visibly paid, and four to one is the flattest raft the
 * sheet can show.
 *
 * `cap` puts a small tilted block on one: two of eleven, because a berg that has
 * rolled since it calved has a peak and the rest are rafts. Every one of them is
 * clear of the bowed face and inside its reach of the channel, which is what
 * stops a berg from being beached on the sheet's green ground.
 */
const BERGS: ReadonlyArray<{
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
  cap: boolean;
}> = [
  { x: -34, z: 6.0, w: 5.0, d: 3.4, h: 1.0, yaw: 0.22, cap: false },
  { x: -24, z: 17.0, w: 4.0, d: 3.0, h: 0.7, yaw: -0.35, cap: false },
  { x: -19, z: 7.5, w: 7.0, d: 4.5, h: 1.5, yaw: 0.12, cap: true },
  { x: -12, z: 13.5, w: 4.5, d: 3.2, h: 0.9, yaw: 0.48, cap: false },
  { x: -4, z: 9.0, w: 6.0, d: 4.0, h: 1.1, yaw: -0.18, cap: false },
  { x: 3, z: 22.0, w: 3.5, d: 2.6, h: 0.6, yaw: 0.3, cap: false },
  { x: 10, z: 10.5, w: 8.0, d: 5.0, h: 1.8, yaw: -0.1, cap: true },
  { x: 14, z: 26.5, w: 4.5, d: 3.4, h: 1.2, yaw: 0.4, cap: false },
  { x: 24, z: 14.5, w: 5.0, d: 3.6, h: 0.8, yaw: -0.28, cap: false },
  { x: 30, z: 23.0, w: 6.5, d: 4.2, h: 2.1, yaw: 0.15, cap: false },
  { x: 40, z: 8.0, w: 6.0, d: 4.4, h: 1.0, yaw: -0.2, cap: false },
];

// ---------------------------------------------------------------------------
// The ice field behind
// ---------------------------------------------------------------------------

/**
 * The field, as one deep band from `z0` forward to `z1` — which is set about a
 * unit and a half in front of the frontmost `back` under each step, so the ice is
 * continuous from the crest to the back of the model with no slot for the ground
 * to show through. The eastern steps stop short of `FIELD_N`: the arm is low
 * enough there to see over, and a full-depth block behind it was a flat roof.
 *
 * **It is one band and not a flight of benches, and it sits below the crest.**
 * The camera is 13.4 degrees up, so a level surface hides everything behind it
 * that does not rise 0.238 per unit of depth: of a band 24 units deep, only the
 * first nine are ever seen, and the rest is hidden behind the wall whatever it
 * costs. Two benches paid twice for one strip of visible ice — and paid again in
 * silhouette, because to clear the wall at all they had to stand above it, which
 * is precisely what made the model read as a wall with a building behind it.
 *
 * So the tops step *down* across the width with the shoulder, 30.7 -> 31.2 ->
 * 24.5 -> 19.5 -> 11.5, standing 1 to 2 units above the mass in front of them and
 * well under the teeth. What is seen of it is a low ridge line in the notches
 * between the crest's teeth, which is what the ice field looks like from the
 * walkways.
 *
 * One step is dropped 2 units and painted `slate`: that is a transverse crevasse,
 * drawn as a gap in the profile because a slot in a horizontal surface cannot be
 * seen from 13.4 degrees. See the rejection note in the header.
 */
const FIELD: ReadonlyArray<{
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  fracture?: boolean;
  teeth: number;
}> = [
  { x0: FIELD_W, x1: -13, z0: FIELD_N, z1: -0.1, top: 30.7, teeth: 4 },
  { x0: -13, x1: -3, z0: FIELD_N, z1: -0.1, top: 28.7, fracture: true, teeth: 0 },
  { x0: -3, x1: 16, z0: FIELD_N, z1: 0.2, top: 31.2, teeth: 4 },
  { x0: 16, x1: 27, z0: -24, z1: -2.2, top: 24.5, teeth: 3 },
  { x0: 27, x1: 36, z0: -19, z1: -4.0, top: 19.5, teeth: 2 },
  { x0: 36, x1: EAST, z0: -14, z1: -5.4, top: 11.5, teeth: 1 },
];

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

/**
 * Deterministic pseudo-noise in [-1, 1]. Uluru's hash rather than a sum of sines,
 * for the reason written there: over a couple of dozen samples the sines beat
 * against each other and the features come out evenly spaced. A hash has no
 * period to find, and `Math.random` is forbidden — the loader builds twice and
 * compares.
 */
function grain(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

export const peritoMoreno: Monument = {
  id: 'perito-moreno',
  name: 'Perito Moreno Glacier',
  iso: 'ARG',
  lat: -50.496,
  lon: -73.138,
  // No `realHeight`. The source list asserts none and the glacier has none to
  // assert: 70 m stands above the lake, about 170 m more below it, and the ice
  // is 700 m thick where it leaves the icefield. None of those is *the* height.
  tier: 'building',
  footprint: 54,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const ice = palette.white; //      all of it: face, ribs, teeth, bergs, brash
    const fracture = palette.slate; // the fissures, and the crevasses in the field
    const melt = palette.skyBlue; //   the waterline glow, and nothing else
    const lake = palette.steel; //     Lago Argentino. See the colour note.
    const rock = palette.bark; //      the Península de Magallanes
    const forest = palette.green; //   the southern beech on top of it

    const group = new THREE.Group();

    /**
     * Every rectangular mass here is given as the box it occupies rather than as
     * a size and a position: almost nothing is centred on anything, and the
     * tables above are meant to read as a map.
     */
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

    /** The hash, folded to [0, 1], which is what most of the shaping wants. */
    const unit = (i: number, seed: number) => grain(i, seed) * 0.5 + 0.5;

    /**
     * One tooth. Every dimension and all three rotations come off the same index,
     * so no two are alike — see finding 3 in the header for why identical plumb
     * pinnacles are battlements and irregular leaning ones are ice.
     *
     * Built on its own depth and stretched in x, because `taper` is square in
     * plan and a square spike on a wall is a little tent roof. It is sunk 0.4
     * into whatever it stands on so the lean never lifts a corner clear.
     */
    const tooth = (i: number, centre: number, width: number, z: number, base: number, tall: number) => {
      const depth = 1.6 + 1.7 * unit(i, 2.7);
      const half = depth / 2;
      const height = 1.0 + tall * Math.pow(unit(i, 5.3), 1.35);
      const wedge = taper(half, half * (0.3 + 0.45 * unit(i, 9.7)), height, ice, 4);
      wedge.scale.x = width / depth;
      wedge.rotation.set(-0.13 * unit(i, 6.9), 0.4 * grain(i, 8.3), 0.2 * grain(i, 1.7));
      wedge.position.set(centre, base - 0.4, z);
      group.add(wedge);
    };

    /**
     * The bowed face at x: the front of the mass that owns it, or of the nearest
     * mass when x falls in a fissure. Everything that has to sit *on* the face —
     * the waterline band, the brash — is placed off this rather than off a
     * constant, which is what makes the bow visible instead of merely true.
     */
    const faceAt = (x: number): number => {
      let nearest = CORE[0]!;
      let gap = Infinity;
      for (const mass of CORE) {
        const d = Math.max(mass.x0 - x, 0, x - mass.x1);
        if (d < gap) {
          gap = d;
          nearest = mass;
        }
      }
      return nearest.front;
    };

    // --- the lake -------------------------------------------------------------
    // A channel, not a rectangle: see LAKE. The sheet's green ground is left
    // showing past the near shore on the left, where the headland comes down to
    // meet it — that is the ground the walkways are on.
    for (const reach of LAKE) slab(reach.x0, reach.x1, LAKE_N, reach.shore, 0, WATER, lake);

    // --- the headland ---------------------------------------------------------
    // The rock the glacier's arm runs into. Two masses stepping back and up,
    // capped with beech, held to 20.2 of the wall's 32 so it states the scale
    // without competing for the silhouette. The lower one runs south past the
    // shore, so the peninsula is joined to the ground the viewer stands on
    // rather than floating in the channel.
    slab(WEST, WALL_W, -13, 12, 0, 8.8, rock);
    slab(WEST, WALL_W, -13, 12, 8.8, 10.8, forest);
    slab(-46, -39.5, -22, -12, 0, 18.1, rock);
    slab(-46, -39.5, -22, -12, 18.1, 20.2, forest);

    // --- the ice field behind --------------------------------------------------
    FIELD.forEach((step, s) => {
      slab(step.x0, step.x1, step.z0, step.z1, 0, step.top, step.fracture ? fracture : ice);

      // The field's own teeth, smaller than the crest's and kept to the front of
      // the band — behind that the wall hides them, so a tooth spent there is a
      // mesh spent on nothing. None on the `slate` step: a pinnacle growing out
      // of a crevasse would undo the one thing that step is there to say.
      for (let k = 0; k < step.teeth; k++) {
        const i = 400 + s * 20 + k;
        const span = step.x1 - step.x0;
        const centre = step.x0 + span * ((k + 0.5) / step.teeth + 0.3 * grain(i, 1.1) / step.teeth);
        const width = 2.2 + 2.6 * unit(i, 3.3);
        tooth(i, centre, width, step.z1 - 1.2 - 4.0 * unit(i, 7.1), step.top, 4.0);
      }
    });

    // --- the face: seven masses, three fissures --------------------------------
    for (const mass of CORE) {
      slab(mass.x0, mass.x1, mass.back, mass.front, 0, mass.top, ice);
    }

    for (const fissure of FISSURES) {
      // Set behind whichever of the two masses beside it stands further back, so
      // the slot is always open and the blue is never seen in front of the ice it
      // is supposed to be inside of.
      const back = Math.min(faceAt(fissure.x0 - 0.5), faceAt(fissure.x1 + 0.5)) - 0.7;
      slab(fissure.x0 - 0.4, fissure.x1 + 0.4, back - 1.4, back, 0, fissure.top, fracture);
    }

    // --- the ribs: the fracture relief, applied to the face, not cut through it -
    CORE.forEach((mass, m) => {
      const count = Math.max(1, Math.round((mass.x1 - mass.x0) / RIB_PITCH));
      const pitch = (mass.x1 - mass.x0) / count;
      for (let k = 0; k < count; k++) {
        const i = m * 17 + k;
        // Nearly the full slot: the gap between two ribs has to be a line, not a
        // space. At a third of the pitch they stop being facets of one wall and
        // go back to being pilasters on a building.
        const width = pitch - (0.25 + 0.55 * unit(i, 4.1));
        const slide = (pitch - width) * unit(i, 7.7);
        const centre = mass.x0 + pitch * k + slide + width / 2;
        const front = mass.front + 0.2 + 1.3 * unit(i, 2.3);
        const depth = front - (mass.front - 0.6);
        const yaw = 0.3 * grain(i, 8.3);
        const top = mass.top * (0.55 + 0.4 * unit(i, 5.9));

        const rib = box(width, top, depth, ice);
        rib.rotation.y = yaw;
        // Anchored at the front face, not at the rib's centre — see the header.
        rib.position.set(
          centre - Math.sin(yaw) * (depth / 2),
          0,
          front - Math.cos(yaw) * (depth / 2),
        );
        group.add(rib);
      }
    });

    // --- the crest: the teeth --------------------------------------------------
    const pitch = (EAST - WALL_W) / CREST_TEETH;
    for (let k = 0; k < CREST_TEETH; k++) {
      const centre = WALL_W + pitch * (k + 0.5) + 0.34 * pitch * grain(k, 4.3);
      const mass = CORE.find((m) => centre >= m.x0 && centre <= m.x1);
      // A tooth whose centre lands in a fissure is dropped: the crest is notched
      // there as well, which is what an open crevasse does to a skyline.
      if (!mass) continue;
      const width = 1.2 + 3.2 * unit(k, 3.3);
      const z = mass.front - 0.7 - 1.3 * unit(k, 7.1);
      // Teeth shrink with the mass they stand on, so the shoulder's crest
      // recedes with it. Full-height blades on an eleven-unit arm would have
      // made the descent read as damage rather than as distance.
      tooth(k, centre, width, z, mass.top, 7.6 * Math.min(1, mass.top / 28));
    }

    // --- the waterline, and the brash at the foot ------------------------------
    for (const glow of WATERLINE) {
      // It starts under the ribs and runs three units out onto the water, so it
      // reads as one broken band along the foot rather than as cyan showing in
      // the gaps between ribs — which, being sky-coloured, read as holes. See
      // finding 1.
      const face = faceAt((glow.x0 + glow.x1) / 2);
      slab(glow.x0, glow.x1, face + 1.2, face + 4.6, 0.3, WATER + glow.h, melt);
    }

    for (const block of BRASH) {
      const face = faceAt((block.x0 + block.x1) / 2);
      slab(block.x0, block.x1, face + block.out0, face + block.out1, 0, WATER + block.h, ice);
    }

    // --- the bergs -------------------------------------------------------------
    for (const berg of BERGS) {
      const raft = box(berg.w, WATER + berg.h, berg.d, ice);
      raft.rotation.y = berg.yaw;
      raft.position.set(berg.x, 0, berg.z);
      group.add(raft);

      if (berg.cap) {
        const peak = taper(berg.d * 0.3, berg.d * 0.14, berg.h * 1.2, ice, 4);
        peak.rotation.y = berg.yaw + 0.4;
        peak.position.set(berg.x - berg.w * 0.18, WATER + berg.h, berg.z);
        group.add(peak);
      }
    }

    return group;
  },
};
