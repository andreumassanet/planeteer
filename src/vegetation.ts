import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundRadius } from './globe.ts';
import { MAX_SLOPE, gradeAt, reliefAt, shoreDistance } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { BIOMES, biomeAt, biomeSample } from './biome.ts';
import type { BiomeId } from './biome.ts';
import { createToonRamp } from './theme.ts';
import type { MonumentContext } from './monuments/contract.ts';
import type { Placement } from './placement.ts';
import { isShown, prominenceVersion, radiusFor } from './places.ts';
import type { Place } from './places.ts';
import { placeDirection, roadClearance, roadIndexFor, roadPoint, roadPole } from './roads.ts';
import type { Road, RoadIndex } from './roads.ts';
import {
  createViewCone,
  detailArea,
  detailBuild,
  detailCount,
  detailPixels,
  detailReach,
  detailVersion,
  fogFar,
  horizonAt,
  slantRange,
} from './view.ts';
import {
  KINDS,
  PARTS,
  VARIANTS,
  createSceneryContext,
  measure,
  nativeHere,
  part,
  regionFor,
  rngFrom,
  validatePart,
  variantRng,
} from './scenery/index.ts';
import type { RegionId, RegionStyle, SceneryContext, ScenicPart, Weighted } from './scenery/index.ts';

/**
 * What grows between the towns, which until now was nothing at all.
 *
 * `settlements.ts` is the model and half of it transfers unchanged — the merged
 * vertex-coloured buffer, the movement-threshold rescan, nearest-first under a
 * triangle budget, a few milliseconds of building a frame. **The half that does
 * not transfer is the one that decides the whole file, and it is worth stating
 * before anything else:**
 *
 * > A settlement is an *object*. It is either built or it is not, there are
 * > 7,320 of them, and the list does not grow when you climb. Vegetation is a
 * > *field*. It covers everything, so its cost is an area — it grows as the
 * > square of how far you can see, and no list of slots can hold it.
 *
 * The arithmetic that killed the slot model before it was written: a wood that
 * reads as a wood wants about one plant per 250 square units, the on-foot
 * horizon is a disc of 2.7 million square units (the fog closes at ~936), and
 * 11,000 plants at ~100 triangles each is 1.1 M triangles — more than the entire
 * land mesh — before you have left the ground, and eight times that from a
 * thousand units up. There is no budget that fixes it and no uniform thinning
 * that fixes it either: thin the field enough to afford the horizon and the wood
 * you are standing in is a car park.
 *
 * So the field is **tiled, and both the tile and the plot pitch double with the
 * level**, which is the one arrangement where the cost of doubling the view
 * distance is a constant rather than a factor of four:
 *
 * - the number of tiles in a ring is `area / span^2`, and with `span` growing
 *   with distance that is the same handful of tiles per ring however far out you
 *   go — so *draw calls* stay flat;
 * - the number of plants in a ring is `area * cover / pitch^2`, same argument —
 *   so *triangles* grow logarithmically with range instead of quadratically.
 *
 * Measured: 15 tiles on the tundra and 67 over the taiga from 2,700 units up,
 * against the ~500 a single-size grid would need to cover the same ground.
 *
 * Everything else here follows from three files it is not allowed to duplicate:
 * `biome.ts` says what grows and how much of it, `terrain.ts` says where the
 * ground is, and `places.ts` says how big a settlement is. This file joins them
 * and decides nothing they already decide.
 */

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

/**
 * Latitude spanned by the *coarsest* tile, in degrees, and the number of levels
 * under it.
 *
 * The grid is a quadtree in latitude and longitude, and it has to be one rather
 * than four independent grids for a reason that is invisible until you look at a
 * hillside: if the levels did not nest, the boundary between two of them would
 * be a seam — the same ground covered twice, or a gap with nothing in it, in a
 * ring around the viewer that moves as you walk. Nesting makes the cover exact.
 * A level-`L` tile is exactly the four level-`L-1` tiles under it, because the
 * latitude step halves and the longitude cell count doubles at every step down.
 *
 * 5 degrees and four levels put the finest tile at 0.625 degrees, which is 174
 * world units — about two thirds of the distance at which a house stops being
 * legible, and small enough that frustum culling has something to throw away.
 */
const ROOT_STEP = 5;
const LEVELS = 4;

/** Degrees of latitude spanned by a tile of this level. 0.625 to 5. */
const stepOf = (level: number): number => ROOT_STEP / 2 ** (LEVELS - 1 - level);

/** And the same in world units, which is what every distance decision uses. */
const spanOf = (level: number): number => stepOf(level) * UNITS_PER_DEGREE;

/** Rows of latitude at this level. Integral at every level, by construction. */
const rowsOf = (level: number): number => Math.round(180 / stepOf(level));

/** The root band a level-`level` row belongs to. */
const rootOf = (row: number, level: number): number =>
  Math.floor(row / 2 ** (LEVELS - 1 - level));

/**
 * Longitude cells in a root band, rounded to a power of two.
 *
 * A power of two and not the nearest integer, because the quadtree's whole
 * property is that a cell splits into exactly two: round to 60 cells at the
 * equator and the level below cannot be 120 without the tiles ceasing to nest.
 * The cost is that a tile is up to 40% off square in longitude, which nothing
 * can see — the plot grid is laid out in the tile's own half-extents and does
 * not care what shape they are.
 */
function rootCells(root: number): number {
  const lat = -90 + (root + 0.5) * ROOT_STEP;
  const want = (360 * Math.cos(lat * DEG)) / ROOT_STEP;
  return 2 ** Math.max(0, Math.round(Math.log2(Math.max(1, want))));
}

const cellsOf = (root: number, level: number): number =>
  rootCells(root) * 2 ** (LEVELS - 1 - level);

/**
 * How near a tile has to be before it is split into its four children.
 *
 * A multiple of the tile's own span, so one number sets every level's switch
 * distance at once: 401 units for the level-1 tiles that become level-0 ones,
 * 803 for level 2, 1,605 for level 3. It also sets how much geometry the near
 * field costs, and that is the binding constraint — the full-density disc is
 * `pi * 401^2` at a 13-unit pitch, which is about 3,000 plots and is already
 * most of the triangle budget. Raising this to 2 puts level-0 tiles out to 700
 * units and triples that.
 */
const REFINE_BASE = 1.15;

/**
 * And the knob's own lever on it, which is the one the user was asking for.
 *
 * `REFINE` decides how far the *fine* levels reach, so it is the difference
 * between "trees near me and a scatter beyond" and "trees to the horizon". At
 * detail 1 the level-0 ring stops at 401 units; at 3 it reaches 1,203, and the
 * cost is the square of that, which is exactly what the knob is for.
 *
 * **It scales linearly, and a gentler exponent was tried and measured as worse
 * at every setting.** The level-0 ring costs the square of how far it reaches
 * and holds `SHARE_OF[0]`, 62% of the budget, so growing it more slowly looks
 * like the thrifty choice — and it is thrifty about the wrong thing. At
 * `detail^0.6` the field at detail 3 fell from 1.49 M triangles to 792,100 and
 * the part of it **on the screen** fell from 547,652 to 337,232; at detail 6 it
 * fell from 584,060 to 535,972. Fewer, denser, nearer tiles put more trees in
 * front of the camera than more, thinner, further ones do, which is the whole
 * reason `SHARE_OF` favours the near field in the first place. The memory cap
 * below is what keeps the top of the range honest, not this.
 *
 * It has to be a function and not a constant because `legibleFloor` reads it,
 * and the two have to move together: the floor is `pixels * span * REFINE`, so
 * `REFINE` growing by the detail while `MIN_APPARENT_PIXELS` shrinks by it
 * leaves the floor exactly where it was. That is the correct answer and not a
 * happy accident — the level's distance band moved out by the detail and the
 * size a plant has to be to read at that band moved with it.
 */
const refine = (): number => REFINE_BASE * detailReach(1);

/**
 * Plot pitch at each level, and the plant scale that partly pays for it.
 *
 * 15 units at level 0 is one plant per 250 square units at temperate cover, and
 * it is set by the triangle budget rather than by taste: the level-0 disc reaches
 * 401 units, which is fifteen tiles, and at a boreal tile's measured 101
 * triangles a plant that is 135,000 triangles before anything further out is
 * drawn at all. 13 looked marginally better on the ground and cost 180,000.
 *
 * The pitch grows *faster* than the tile (2.6 against 2), which is the one place
 * this file deliberately gives something up: coverage falls with distance, so a
 * wood thins as it recedes. Growing at exactly 2 would hold coverage constant
 * and cost 12,600 plots against 5,700 — and the thing being bought is invisible,
 * because `main.ts` starts the fog at a fifth of the horizon and a tile at 700
 * units is already 70% fog.
 *
 * The scale is the other half, and it is the only lever in this file that buys
 * cover for **no triangles at all**: a level-2 tree at 1.8 covers 2.1 times the
 * ground the same tree at 1.25 does, out of the same 96 triangles. The steps are
 * geometric at about 1.34 rather than a straight line, so every level boundary
 * carries the same jump and none of them is the one you notice. The top of 2.4
 * puts a tall conifer at 48 units, over the `block` tier's 34 — and it is only
 * ever seen from past 1,600 units, where it is 28 pixels.
 */
const PITCH_0 = 15;
const PITCH_GROWTH = 2.6;
const pitchOf = (level: number): number => PITCH_0 * PITCH_GROWTH ** level;
const SCALE_OF = [1, 1.35, 1.9, 2.8];

/**
 * Where the plot grid stops and groves start, and what a grove is.
 *
 * **A uniform grid cannot draw a wood at a distance, and this is the arithmetic
 * that says so.** At level 3 the pitch is 264 units and the plant is 50 across,
 * so the ground is 2% covered and every tree stands alone: from 3,000 units up
 * that is a speck every 82 pixels, which the eye files as noise on bare ground
 * rather than as forest — the outer-ring trap, and the reason the ceiling used to
 * be pulled back to 4,200 instead of the arrangement being fixed. Thinning is
 * not the problem. *Uniformity* is: real woodland at that scale is clumps and
 * clearings, and the clump is what carries the read.
 *
 * So above `GROVE_FROM` the plots are not a grid. A lattice of grove centres is
 * laid at `GROVE_SPACING` times the level's own pitch, each grove is a disc of
 * `GROVE_RADIUS` of that spacing holding `GROVE_PLANTS` plants, and the ground
 * between them is empty. The plant count goes up by about three times and the
 * *arrangement* is the point: the same triangles spread evenly read as dirt.
 *
 * **The grove is also the unit of iteration, and that is what makes it
 * affordable.** The obvious implementation lays a fine grid over the whole tile
 * and masks it, which at level 3 is 625 plots where there were 30 — twenty times
 * the `reliefAt` and `biomeAt` calls for the same output. Walking the groves and
 * placing inside each one costs plants, not ground.
 */
const GROVE_FROM = 2;
const GROVE_SPACING = 2.2;
const GROVE_RADIUS = 0.45;
const GROVE_PLANTS = 15;

/** Lattice spacing between grove centres, in world units, at this level. */
const groveSpacing = (level: number): number => pitchOf(level) * GROVE_SPACING;

/**
 * How much of a plot's cell a plant may wander from its centre.
 *
 * A grid is what makes a plot an *identity* — `(level, row, column, cell)` seeds
 * it, so adding a species or moving a settlement leaves every other plant
 * exactly where it was, which is the rule `random.ts` is written around. The
 * jitter is what stops the identity showing: at 0.42 the rows are gone and what
 * is left is a wood.
 */
const JITTER = 0.42;

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * How far vegetation is built, in world units.
 *
 * The floor is the fog: on foot the camera sits about 15 units up, the horizon
 * is 690 and `main.ts` closes the fog at 936, so 1,150 is past anything that can
 * be seen and there is no edge to notice. The ceiling is the plant: the tallest
 * thing here is about 20 units and level 3 scales it to 38, which is worth
 * `937 * 38 / d` pixels — five of them at 7,100 units and one at 35,000.
 *
 * The ceiling is also the whole of the high-altitude story and it needs no
 * separate rule. From the plane every point of ground is at least the altitude
 * away, so above 4,200 units nothing is in range and vegetation switches itself
 * off — leaving the ground its `biome.ts` colour, which is what a forest looks
 * like from that height anyway.
 *
 * **6,000 was the first number and the measurement took it back.** At that
 * ceiling the outermost ring was 34 level-3 tiles, 918 plants and 88,000
 * triangles spread over a hundred million square units — and looking straight
 * down at Finland from 2,700 up, not one of them was visible as anything but
 * noise, because a plant every 260 units is not a wood, it is a speck. What
 * carries the ground at that height is its `biome.ts` colour, which was already
 * doing it for free. The ring that reads is the one inside about 1,600 units and
 * 4,200 is comfortably past it.
 */
/**
 * The tallest thing that grows, in world units, before the level scale.
 *
 * Used only to decide how far a tile is worth building — see `visibleTo` — so
 * it wants to be the tallest, not the average: a level whose tallest plant is
 * still legible is a level worth building, and the short ones in it were already
 * dropped by `legibleFloor`.
 */
const TALLEST_PLANT = 20;

/**
 * The furthest a tile of this level is worth building, from its own contents.
 *
 * **`legibleFloor` is not enough on its own, and raising the reach is what
 * exposed that.** That test asks whether a plant is big enough for its level,
 * and it prices the level by the distance band its parent's refinement gives
 * it — which works for every level that has a level above it. The outermost one
 * has nothing above it, so its band runs from `spanOf(3) * REFINE` (1,605) to
 * wherever the reach stops, and once the reach moved out to 11,000 the same
 * floor was licensing tiles seven times further away than it had been asked
 * about. From the plane's ceiling that came out as **68 tiles and 76,884
 * triangles of two-pixel specks**, which is the outer-ring trap word for word.
 *
 * So the cap is the pixel test run on the tile's *actual* distance, with the
 * tallest thing that could stand on it: 937 * 20 * 2.4 / 5 is about 9,000 units
 * for level 3, and 3,700 for level 0, which no level-0 tile ever reaches anyway.
 *
 * It replaces the old `RANGE_CEILING` constant outright, and it subsumes the
 * altitude cutoff with it: a tile's distance from a player at 23,000 units up is
 * at least 23,000 whatever the ground does, so vegetation switches itself off in
 * the stratosphere without a second rule saying so.
 */
function visibleTo(level: number): number {
  return (PIXELS_PER_RADIAN * TALLEST_PLANT * SCALE_OF[level]!) / minPixels();
}


function reachFor(altitude: number): number {
  // Called rather than hoisted into a constant: `visibleTo` reads
  // `MIN_APPARENT_PIXELS`, which is declared further down this file, and a
  // module-level `const` up here would evaluate it inside its temporal dead
  // zone — a `ReferenceError` at import, which is the whole world failing to
  // load rather than a wrong number.
  return Math.min(visibleTo(LEVELS - 1), fogFar(altitude, PLANET_RADIUS) * 1.1, detailReach(Math.max(1150, horizonAt(altitude, PLANET_RADIUS) * 1.3)));
}

/**
 * And the same as a slant distance, which is what the tile test compares.
 *
 * **The ceiling above used to be 4,200 and it used to be a radius around the
 * player, and those two facts together switched the vegetation off in the air.**
 * A tile's distance runs from the player to a point on the ground, so at 4,200
 * units up the nearest ground on the planet is exactly at the limit and above it
 * nothing is in range — measured, 0 tiles at 6,000 up. The file's own comment
 * argued the ceiling from what a plant is *worth* at a distance, which is a
 * statement about the ground and not about the sky, and then spent it on the
 * altitude.
 *
 * So the reach is along the ground and the slant is its hypotenuse. The reach
 * ceiling is about 9,000 rather than 4,200 because that is what the budget
 * turned out to buy once `view.ts` stopped paying for the ground behind the
 * camera: at 3,000 units up the streamer settled at **27 tiles and 34,248
 * triangles against a 480,000 budget**, which is a reach that had been chosen
 * against a cost the frustum then deleted. And it is `visibleTo` rather than a
 * number, so it cannot outlive the plant it was argued from.
 *
 * What a plant is worth out there is still answered by `legibleFloor`, which
 * drops every species too short to read at its level
 * before a single one is placed — see the trap about what the outer ring is
 * actually for, which this does not repeal: past about 1,600 units the plants
 * are a thin scatter over ground that `biome.ts` has already coloured as canopy,
 * and it is the colour doing the work. This buys the *silhouette* on top of it.
 */
function rangeFor(altitude: number): number {
  return slantRange(altitude, reachFor(altitude));
}

/**
 * Pixels a plant has to be worth before it is built, and the constant that turns
 * a size into pixels.
 *
 * `LEGIBLE_AT` in the scenery contract run backwards: at a 900 px viewport and
 * the world's 55 degree lens an object of size `s` at distance `d` subtends
 * about `937 * s / d` pixels, and under about five it is a speck with an ink
 * line round it.
 *
 * **It is applied per level rather than per frame, and that is what makes it
 * free.** A tile built against the viewer's exact distance would have to be
 * rebuilt every time the viewer moved; a tile knows its own level, and a level
 * has a distance band, so the floor is a constant per level: nothing under 3.2
 * units at level 1, 6.4 at level 2, 12.8 at level 3. What falls out of it is
 * exactly right and cost nothing to arrange — grass and boulders stop at the
 * near field, and a savanna seen from a kilometre up is bare ground with
 * acacias on it, which is what a savanna seen from a kilometre up is.
 */
const MIN_APPARENT_PIXELS = 5;
const PIXELS_PER_RADIAN = 937;

/** The floor as the knob leaves it. See `detailPixels` in `view.ts`. */
const minPixels = (): number => detailPixels(MIN_APPARENT_PIXELS);

/** The smallest a plant may be, at this level, in world units. */
function legibleFloor(level: number): number {
  if (level === 0) return 0;
  return (minPixels() * spanOf(level) * refine() * 1.5) / PIXELS_PER_RADIAN;
}

/**
 * The ceiling on resident vegetation.
 *
 * `OutlineEffect` draws the scene twice, so 300,000 is 600,000 triangles a frame
 * on top of the land mesh's 1.5 M and the settlements' 640,000. The tile cap is
 * the draw-call half of the same budget: a tile is one merged mesh, frustum
 * culled on its own bounding sphere, so 84 resident tiles cost well under 84
 * draws at ground level.
 */
const TRIANGLE_BUDGET = 300_000;
const MAX_TILES = 80;

/**
 * Both as the knob leaves them, and the budget has a hard stop on top.
 *
 * The ground inside a radius goes as the square of it, so the budget follows —
 * but **the number that runs out first here is memory, not the frame**. Even at
 * 54 bytes a triangle (position as floats, normal and colour quantised to bytes;
 * it was 108 before the knob made that worth doing) the field measured 225 MB on
 * foot at detail 6, against the land mesh's 138 — and the frame was 1.8 ms, so
 * nothing about the render was going to stop it. `MAX_MEGABYTES` is what stops
 * it: 2.6 M triangles is about 140 MB, roughly the land, and because the build
 * queue is nearest-first what the cap drops is the furthest ring.
 *
 * That makes the top of the knob honest rather than a cliff: past about detail
 * 4.5 the vegetation stops reaching further and the rest of the world keeps
 * going, which is a thing you can see happening instead of a tab that dies.
 */
const MAX_TRIANGLES = 2_600_000;
const triangleBudget = (): number => Math.min(MAX_TRIANGLES, detailArea(TRIANGLE_BUDGET));
const maxTiles = (): number => detailCount(MAX_TILES);

/**
 * The disc that is dressed whatever the camera is pointed at.
 *
 * `view.ts`'s cone is what makes the reach affordable and this is what makes it
 * safe. It has to hold the whole level-0 ring, because that is the ground a
 * mouse flick can put in front of you before a single tile could be built:
 * level-0 tiles reach `spanOf(1) * REFINE`, which is 401 units, and 520 clears
 * it with the tile's own half-diagonal to spare.
 */
const KEEP_ALL_WITHIN = 520;

/**
 * And it has to move with the knob, because what it is sized against moves.
 *
 * The disc exists to hold the level-0 ring — the ground a mouse flick can put in
 * front of you before a tile could be built — and the knob multiplies where that
 * ring stops. Leaving this constant while `refine` trebles would leave five
 * sixths of the fine field outside the flick guarantee, which is the pop this
 * number was measured to remove in the first place.
 */
const keepAllWithin = (): number => detailReach(KEEP_ALL_WITHIN);

/** Radians of turn that force a rescan. See `settlements.ts` for the argument. */
const RESCAN_TURN = 8 * (Math.PI / 180);

/**
 * How much a tile's bounding sphere is padded before the frustum sees it.
 *
 * The centre is sampled on the relief, so what is left to cover is how far the
 * relief moves *inside* one tile plus how tall a plant is: the swell, the downs
 * and the ridge noise together are about 240 units of swing and the tallest
 * plant at level 3 is 48. A range's own peak varies over a tile too, but only
 * over a level-3 tile, whose radius is a thousand units and swamps it.
 *
 * Conservative on purpose — a sphere that is too big admits a tile that is off
 * the screen, which costs one tile; a sphere that is too small deletes a wood
 * that is on it.
 */
const TILE_SLACK = 300;

/**
 * How the budget is divided between the levels, finest first.
 *
 * **Without it the near field eats everything, and the biome that proves it is
 * the one with the most to lose.** The queue is nearest first, so in the Amazon
 * — `cover` 0.9, the densest ground on the planet — thirteen level-0 tiles spent
 * the entire 240,000 before a single level-1 tile was reached, and the rainforest
 * stopped dead at 400 units with bare ground behind it. A hard share per level
 * costs the near field a fifth of its trees and buys the horizon back.
 *
 * It only ever binds in a dense biome, which is the point: a desert's whole
 * vegetation is 16,000 triangles and no level of it comes near its share.
 *
 * **The shares deliberately add up to more than one.** Split the budget exactly
 * and a level that cannot spend its share — because the range or the tile cap
 * stopped it first — leaves that budget unspent while the near field goes short:
 * the taiga came out at 195,868 of a 240,000 budget with four of its fifteen
 * level-0 tiles missing, which is a hole in the wood you are standing in bought
 * with triangles nothing spent. Over-subscribing makes each share a *ceiling on
 * one level* and leaves the global budget as the only floor, which is the way
 * round that keeps the near field whole.
 */
const SHARE_OF = [0.62, 0.28, 0.2, 0.16];

/**
 * How far the viewer moves before the tile list is worked out again.
 *
 * It does double duty, and the second job is the one worth knowing about. The
 * refinement test is a comparison against a distance, so a tile sitting exactly
 * on a switch distance would split and merge on alternate frames — a whole ring
 * of vegetation changing species and position at 60 Hz. Scanning from a position
 * that only moves in 50-unit steps freezes that decision: pacing back and forth
 * across a level boundary by less than 50 units cannot flip it, and crossing it
 * properly flips it once.
 */
const RESCAN_MOVE = 50;

/**
 * Milliseconds of building allowed in one frame.
 *
 * Lower than the settlement builder's 3.5 because the two run in the same frame
 * and back to back: a settlement that arrives is a building you can see and is
 * worth the stall; a tile of grass is not.
 */
const BUILD_BUDGET_MS = 2.5;

/**
 * Ground kept clear around what is built.
 *
 * **`radiusFor` is `places.ts`'s and there must not be a second one.** It is
 * what the HUD names a place by, what `settlements.ts` builds inside, and — now
 * — what the paving covers, so a tree placed against any other number grows up
 * through the asphalt. The monument radius is the model's own footprint out of
 * `monuments.json`, falling back to the contract's widest for a landmark that
 * has no model yet, exactly as `settlements.ts` does it.
 */
const WIDEST_FOOTPRINT = 55;
const MONUMENT_CLEARANCE = 6;

/**
 * How far a plant is seated into the ground, as a share of its own height.
 *
 * A plant is bedded to the *lowest* of four probes at its own footprint, which
 * is `settlements.ts`'s rule and is right for a building. It is not quite enough
 * for a plant, because a shrub is as wide as it is tall and the probes are only
 * four: on a slope the true low corner sits between two of them. A twentieth of
 * the height closes it for nothing, and burying a trunk is invisible where
 * floating one is the first thing anybody notices.
 */
const SEATING = 0.05;

/**
 * Where the plant's own slope rule comes from: `terrain.ts`, which owns it for
 * the whole world. It was written here, because a wood on a mountain face is
 * where the user saw it first; the road, the herd and the town's own paving ask
 * the same question now, so the definition moved and this file reads it.
 */

/**
 * How far a plant follows the ground it stands on, by kind: 0 stands upright,
 * 1 lies flat on the slope.
 *
 * **A tree is not a boulder and the two want opposite answers.** A trunk grows
 * towards the light whatever the hill does — a wood on a slope is a set of
 * near-vertical poles, and a fir rotated fully onto a 25-degree face reads as a
 * blowdown. A rock has no opinion at all: it sits in the ground, and one
 * standing plumb on a hillside is the thing that looks placed rather than
 * fallen. So `tree` leans a little, everything else in this file's flora —
 * boulders, tufts, bushes, the cactus — follows the surface outright.
 *
 * A leaning tree is also what makes the *bedding* affordable: the residue the
 * plant still has to be seated into is `(1 - tilt)` of the slope across its own
 * footprint, so at 0.45 a tree on a 30-degree face is cut in by half what an
 * upright one was, and a boulder is not cut in at all.
 *
 * It lives here rather than in `scenery/contract.ts` because it is not a fact
 * about the part: the same `scatter` rock merged into a settlement stands on
 * paving, which is flat by construction and has no normal to follow. It is a
 * fact about standing on open ground, and this is the file that does that.
 */
const TILT_OF: Record<ScenicPart['kind'], number> = {
  scatter: 1,
  tree: 0.45,
  dwelling: 0,
  block: 0,
  civic: 0,
  person: 0,
};

// ---------------------------------------------------------------------------
// Variants, flattened once
// ---------------------------------------------------------------------------

/**
 * One built variant, reduced to the arrays a tile is assembled from.
 *
 * This is `settlements.ts`'s `FlatVariant` and `flatten`, copied rather than
 * shared, and the duplication is deliberate for one round only: that file is
 * owned elsewhere while this one is being written, and a shared module would
 * have had to be carved out of it. **If both are still here next time either is
 * touched, lift them into one place** — they are the same forty lines and the
 * same argument (colour off the material and onto the vertices is what makes a
 * merge possible at all).
 */
interface FlatVariant {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  triangles: number;
  height: number;
  footprint: number;
  /** How far this one follows the slope it stands on; see `TILT_OF`. */
  tilt: number;
}

function flatten(group: THREE.Group): Omit<FlatVariant, 'height' | 'footprint' | 'tilt'> {
  group.updateMatrixWorld(true);
  const pieces: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; material: THREE.Material }[] = [];
  let vertices = 0;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const position = mesh.geometry.getAttribute('position');
    if (position === undefined) return;
    vertices += mesh.geometry.index ? mesh.geometry.index.count : position.count;
    pieces.push({
      geometry: mesh.geometry,
      matrix: mesh.matrixWorld.clone(),
      material: Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material,
    });
  });

  const out = {
    position: new Float32Array(vertices * 3),
    normal: new Float32Array(vertices * 3),
    color: new Float32Array(vertices * 3),
    triangles: vertices / 3,
  };

  const tint = new THREE.Color();
  const point = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let cursor = 0;
  for (const piece of pieces) {
    const position = piece.geometry.getAttribute('position');
    const normal = piece.geometry.getAttribute('normal');
    const index = piece.geometry.index;
    const count = index ? index.count : position.count;
    normalMatrix.getNormalMatrix(piece.matrix);
    const hex = piece.material.userData.atlasToon as number | undefined;
    tint.set(hex ?? 0xffffff);
    for (let i = 0; i < count; i++) {
      const v = index ? index.getX(i) : i;
      point.fromBufferAttribute(position, v).applyMatrix4(piece.matrix);
      out.position[cursor] = point.x;
      out.position[cursor + 1] = point.y;
      out.position[cursor + 2] = point.z;
      point.fromBufferAttribute(normal, v).applyMatrix3(normalMatrix).normalize();
      out.normal[cursor] = point.x;
      out.normal[cursor + 1] = point.y;
      out.normal[cursor + 2] = point.z;
      out.color[cursor] = tint.r;
      out.color[cursor + 1] = tint.g;
      out.color[cursor + 2] = tint.b;
      cursor += 3;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export interface VegetationStats {
  /** Tiles standing in the world right now. */
  tiles: number;
  /** Wanted, and waiting for a frame with room to build them. */
  pending: number;
  /** Plants standing. */
  plants: number;
  /** Triangles of resident geometry. `OutlineEffect` draws them twice. */
  triangles: number;
  /** Megabytes of vertex buffers held by resident tiles. */
  megabytes: number;
  /** Tiles built since the world loaded. Rising while you stand still is a bug. */
  built: number;
  /** Tiles found to be all sea or all ice, and remembered so they are asked once. */
  barren: number;
  /** Milliseconds the last build took. */
  lastBuildMs: number;
  /** How far vegetation is currently built, in world units of slant distance. */
  range: number;
  /** And the same along the ground, which is the number with a meaning in the air. */
  reach: number;
  /** Resident tiles by level, finest first. */
  byLevel: number[];
}

export interface Vegetation {
  group: THREE.Group;
  stats: VegetationStats;
  /** Parts a biome table names that the registry has no file for. */
  missing: string[];
  /** Anything that refused to build, with the contract's complaint. */
  broken: string[];
  /**
   * Call each frame. Streams tiles in and out and spends a few ms building.
   *
   * The camera is optional: without one every tile in range is admitted, which
   * is the behaviour this file had before `view.ts` and is what a headless
   * caller needs. With one, only what is on the screen is built.
   */
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
  /** Builds the tile under a point twice and reports whether the two agree. */
  verify(lat: number, lon: number, level?: number): unknown;
  /** What one tile costs and what is standing on it, for the console. */
  sample(lat: number, lon: number, level?: number): unknown;
}

/**
 * One material for every tile on the planet.
 *
 * The measurement that decided it is `settlements.ts`'s and it applies here with
 * more force, not less: merging a town beat instancing it by 218 draw calls to
 * 1, and a tile holds two hundred plants of a dozen kinds where a town holds
 * nine buildings. Colour rides on the vertices, `createToonRamp` registers the
 * texture with `theme.ts`, and a wood therefore steps through the same four cel
 * bands as the coastline and follows the sun into night with it.
 */
function foliageMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01] };
  return material;
}

interface Tile {
  key: string;
  level: number;
  row: number;
  column: number;
  /** Unit vector at the tile centre. */
  direction: THREE.Vector3;
  lat: number;
  lon: number;
  /** Half the tile's extent along the ground, east and north, in world units. */
  halfEast: number;
  halfNorth: number;
  /**
   * The tile centre in world space, lifted onto the *relief*, which is what the
   * view frustum is tested on.
   *
   * It has to be the relief and not `PLANET_RADIUS`, and the number that says so
   * is 620: that is the tallest peak in `terrain.ts`'s range table, so a sphere
   * centred on the sea-level sphere can sit six hundred units below the ground
   * it is meant to bound. A level-0 tile's own radius is 126. In the Andes that
   * is a tile at the edge of the frame culled with its trees on the screen —
   * which is exactly the failure a frustum is not allowed to have, and exactly
   * the one a still frame taken on flat ground cannot show.
   */
  centre: THREE.Vector3;
  /** And its bounding radius, padded; see `TILE_SLACK`. */
  radius: number;
  distance: number;
}

interface Standing {
  mesh: THREE.Mesh;
  triangles: number;
  plants: number;
  bytes: number;
  level: number;
}

export interface VegetationOptions {
  /** Share the monument context, so one material cache serves the whole world. */
  context?: MonumentContext;
  /** Settlements, so nothing grows where something is built or paved. */
  places?: readonly Place[];
  /** Monuments, so nothing grows inside one. */
  monuments?: readonly Placement[];
  /**
   * The road network, so nothing grows in the carriageway.
   *
   * The pruned list `main.ts` hands the streamer, and it indexes into `places`
   * — the same array — which is why the two arrive together or not at all.
   * **Every road keeps its verge, whatever the streamer is drawing**: a road's
   * class reach is a level of detail and a wood that thinned itself around
   * whatever happened to be resident would not build the same tile twice.
   */
  roads?: readonly Road[];
}

export function createVegetation(world: World, options: VegetationOptions = {}): Vegetation {
  const group = new THREE.Group();
  group.name = 'vegetation';

  const ctx: SceneryContext = createSceneryContext(options.context);
  const material = foliageMaterial();
  const missing: string[] = [];
  const broken: string[] = [];

  const continentOf = new Map<string, string>(
    world.countries.map((country) => [country.iso, country.continent]),
  );

  // ------------------------------------------------------------------
  // Keepouts: everything that is built, as unit vectors and radii
  // ------------------------------------------------------------------

  /**
   * One flat array of built ground, scanned per tile rather than per plot.
   *
   * 29,545 settlements and 85 monuments against a couple of hundred plots is
   * the wrong way round to test: the scan finds the
   * handful that could possibly reach into this tile, and the plots are then
   * tested against those. Measured at 30 microseconds a tile, paid once when the
   * tile is built and never again.
   */
  const builtUnit = new Float64Array(((options.places?.length ?? 0) + (options.monuments?.length ?? 0)) * 3);
  const builtRadius = new Float64Array(builtUnit.length / 3);
  /** How many of those arrays are in use: only the *shown* places keep the trees out. */
  let builtCount = 0;
  /**
   * Filled at construction and again when the prominence knob moves, because
   * a hidden village's ground grows trees again — nothing is built there, so
   * nothing keeps the wood out. See `PROMINENCE_RADIUS` in `places.ts`.
   */
  const rebuildKeepouts = (): void => {
    let i = 0;
    const add = (lat: number, lon: number, radius: number): void => {
      const cos = Math.cos(lat * DEG);
      builtUnit[i * 3] = cos * Math.cos(lon * DEG);
      builtUnit[i * 3 + 1] = Math.sin(lat * DEG);
      // Negative, like every other conversion in the project; see the
      // mirrored-planet trap in CLAUDE.md.
      builtUnit[i * 3 + 2] = -cos * Math.sin(lon * DEG);
      builtRadius[i] = radius;
      i++;
    };
    for (const place of options.places ?? []) {
      if (isShown(place)) add(place.lat, place.lon, radiusFor(place.pop));
    }
    for (const site of options.monuments ?? []) {
      add(site.lat, site.lon, (site.footprint ?? WIDEST_FOOTPRINT) + MONUMENT_CLEARANCE);
    }
    builtCount = i;
  };
  rebuildKeepouts();

  // ------------------------------------------------------------------
  // And the carriageway, which is the one keepout that is a line
  // ------------------------------------------------------------------

  /**
   * Longest piece of road treated as a straight segment, in world units.
   *
   * The chord problem again, and the bound is the tightest curve the bake will
   * keep: a bow of 0.3 on a 1,000-unit road is a half-sine of amplitude 300
   * over a half-wavelength of 1,000, whose radius of curvature at the apex is
   * 338 units, so a 48-unit chord sags `s^2 / 8r` = 0.85 units off it. That is
   * a fifth of a lane's own half-width and well inside the plant footprint the
   * test adds on top. It is coarse enough that the longest road in the world is
   * 21 segments.
   */
  const ROAD_STEP = 48;

  const roadIndex: RoadIndex | null =
    options.roads !== undefined && options.places !== undefined && options.roads.length > 0
      ? roadIndexFor(options.roads, options.places)
      : null;
  const roadHits: number[] = [];

  // ------------------------------------------------------------------
  // The variant cache
  // ------------------------------------------------------------------

  const variants = new Map<string, FlatVariant | null>();

  function variantOf(partId: string, style: RegionStyle, index: number): FlatVariant | null {
    const key = `${partId}:${style.id}:${index}`;
    const cached = variants.get(key);
    if (cached !== undefined) return cached;

    const entry = part(partId);
    if (entry === undefined) {
      if (!missing.includes(partId)) missing.push(partId);
      variants.set(key, null);
      return null;
    }
    let built: THREE.Group;
    try {
      built = entry.build(ctx, variantRng(entry, style, index), style);
      const problems = validatePart(entry, built);
      if (problems.length > 0) throw new Error(problems.join('; '));
    } catch (error) {
      broken.push(`${key}: ${String(error)}`);
      variants.set(key, null);
      return null;
    }
    const measured = measure(built);
    const value: FlatVariant = {
      ...flatten(built),
      height: measured.height,
      footprint: entry.footprint,
      tilt: TILT_OF[entry.kind],
    };
    built.traverse((object) => {
      const mesh = object as THREE.Mesh;
      // The vertices have been copied out; nothing else holds the geometry. The
      // materials are the shared cache's and must not be touched.
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    variants.set(key, value);
    return value;
  }

  // ------------------------------------------------------------------
  // The flora: which plants a biome offers here, at this level
  // ------------------------------------------------------------------

  const KIND_OF = new Map<string, ScenicPart['kind']>(PARTS.map((entry) => [entry.id, entry.kind]));

  /**
   * The weighted list `biome.ts` means, filtered by region and by distance.
   *
   * Three things happen here and none of them is a second opinion about what
   * grows where:
   *
   * - **The weights.** `BIOMES[id].plants` is "most likely first" and that is a
   *   contract, not a phrase: the weights are geometric at 0.45, so the first
   *   entry is most of what is standing, the second is the one that keeps it
   *   from being wallpaper, and the fourth is the one you notice once an hour.
   * - **The range map.** `nativeHere` in `regions.ts` answers the one question a
   *   biome cannot: a saguaro is American, and `BIOMES.desert.plants` is one
   *   list for the Sonoran and the Sahara both.
   * - **The distance.** A plant shorter than this level's legibility floor is
   *   dropped from the list rather than placed and culled, so the survivors take
   *   its share of the cover. That is the difference between a grassland at a
   *   kilometre being *bare ground with trees on it* and being nine tenths empty
   *   plots.
   *
   * The proxy for a part's height is its variant 0, which is a build this file
   * needs anyway; a part whose variants differ by more than the floor is one
   * that will place some of them and drop others, which is a gap in a wood and
   * not a bug.
   */
  const floras = new Map<string, Weighted<string>[]>();

  function floraFor(biome: BiomeId, style: RegionStyle, level: number): Weighted<string>[] {
    const key = `${biome}|${style.id}|${level}`;
    const cached = floras.get(key);
    if (cached !== undefined) return cached;

    const floor = legibleFloor(level);
    const scale = SCALE_OF[level]!;
    const out: Weighted<string>[] = [];
    let weight = 1;
    for (const id of BIOMES[biome].plants) {
      const kind = KIND_OF.get(id);
      if (kind === undefined) {
        if (!missing.includes(id)) missing.push(id);
      } else if (nativeHere(id, style.id as RegionId)) {
        const sample = variantOf(id, style, 0);
        // A kind's own cap stands in when the variant would not build, so a
        // broken part does not silently take a species out of a continent.
        const height = sample === null ? KINDS[kind].height : sample.height;
        if (height * scale >= floor) out.push({ item: id, weight });
      }
      weight *= 0.45;
    }
    floras.set(key, out);
    return out;
  }

  // ------------------------------------------------------------------
  // Building one tile
  // ------------------------------------------------------------------

  const up = new THREE.Vector3();
  const north = new THREE.Vector3();
  const across = new THREE.Vector3();
  const tileBasis = new THREE.Matrix4();
  const tileMatrix = new THREE.Matrix4();
  const tileInverse = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const plantUp = new THREE.Vector3();
  const plantNorth = new THREE.Vector3();
  const plantAcross = new THREE.Vector3();
  const plantBasis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  /** The rotation that lays a plant on the hill; see `TILT_OF`. */
  const lean = new THREE.Quaternion();
  const surfaceUp = new THREE.Vector3();
  /** What `gradeAt` fills, reused: it is asked once per plot. */
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const scaleVector = new THREE.Vector3();
  const world4 = new THREE.Matrix4();
  const local4 = new THREE.Matrix4();
  const ONE = new THREE.Vector3(1, 1, 1);
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const sample = biomeSample();

  interface Keepout {
    x: number;
    z: number;
    radius: number;
  }
  const keepouts: Keepout[] = [];

  /**
   * A stretch of carriageway in the tile's own frame, and how far its verge
   * reaches.
   *
   * A town is a disc and a road is a line, which is the whole reason these are
   * two lists rather than one: approximating a road by discs along it would be
   * the same test at four times the count, and approximating it by its bounding
   * disc would clear a wood off half of Bavaria.
   */
  interface RoadKeepout {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    /** Half the drawn ribbon, from `roadClearance`. The plant adds its own. */
    clearance: number;
  }
  const roadKeepouts: RoadKeepout[] = [];
  const roadEndA = new THREE.Vector3();
  const roadEndB = new THREE.Vector3();
  const roadPolar = new THREE.Vector3();
  const roadAt = new THREE.Vector3();

  /** Where a local offset from the tile centre lands on the sphere. */
  function directionAt(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    return target
      .copy(up)
      .addScaledVector(across, x / PLANET_RADIUS)
      .addScaledVector(north, z / PLANET_RADIUS)
      .normalize();
  }

  interface Built {
    mesh: THREE.Mesh | null;
    triangles: number;
    plants: number;
    bytes: number;
    /** Plots the grid offered, before cover, sea, keepouts and legibility. */
    plots: number;
    inTheSea: number;
    builtOver: number;
    /** Plots refused because they stood in a carriageway or on its verge. */
    onRoad: number;
    /** Plots refused because the ground under them is steeper than `MAX_SLOPE`. */
    onSlope: number;
    fastPath: boolean;
  }

  function raise(tile: Tile): Built {
    const empty: Built = {
      mesh: null,
      triangles: 0,
      plants: 0,
      bytes: 0,
      plots: 0,
      inTheSea: 0,
      builtOver: 0,
      onRoad: 0,
      onSlope: 0,
      fastPath: false,
    };

    up.copy(tile.direction);
    // The frame `placement.ts` and `settlements.ts` both build: +Z along the
    // ground towards the pole. X cross Y is Z, so X is Y cross Z — written this
    // way round because `makeBasis(east, up, north)` is the reflection that
    // fills a mesh with ink, and it is the one mistake here that an ordinary
    // `Mesh` cannot show you. See the reflected-basis trap in CLAUDE.md.
    north.set(0, 1, 0).projectOnPlane(up);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
    north.normalize();
    across.crossVectors(up, north).normalize();
    tileBasis.makeBasis(across, up, north);
    if (tileBasis.determinant() <= 0) {
      broken.push(`${tile.key}: tile basis has determinant ${tileBasis.determinant()}`);
      return empty;
    }
    origin.copy(up).multiplyScalar(groundRadius(world, up));
    tileMatrix.compose(origin, quaternion.setFromRotationMatrix(tileBasis), ONE);
    tileInverse.copy(tileMatrix).invert();

    // The style is regional and the flora is not: `regionFor` decides what the
    // leaves are made of and `biomeAt` decides what is standing there. A tile
    // whose centre is at sea takes the country of the first land it can find,
    // because a coastal tile is mostly land and its centre is arbitrary.
    let iso = '';
    {
      const index = world.countryAtPoint(tile.direction);
      if (index > 0) iso = world.countries[index - 1]!.iso;
      else {
        outer: for (let i = -1; i <= 1; i += 1) {
          for (let j = -1; j <= 1; j += 1) {
            if (i === 0 && j === 0) continue;
            const found = world.countryAtPoint(
              directionAt(i * tile.halfEast * 0.7, j * tile.halfNorth * 0.7, scratch),
            );
            if (found > 0) {
              iso = world.countries[found - 1]!.iso;
              break outer;
            }
          }
        }
      }
    }
    const style = regionFor(iso, continentOf.get(iso) ?? '', tile.lat);

    /**
     * The fast path, and the test that decides it is a distance to the sea.
     *
     * `elevationAt` is a point-in-polygon query at 3.6 microseconds; `reliefAt`
     * is 0.4, and `elevationAt` is only `ring.height + reliefAt` where the shelf
     * is a constant of the ring. So a tile that is *entirely* inland can ask the
     * expensive question once and add the cheap one per plot, which is nine
     * tenths of the build.
     *
     * "Entirely inland" is not something a handful of probes can promise — a
     * 3 by 3 grid over a 174-unit tile steps 87 units, and a Norwegian fjord is
     * narrower than that, so the probes would report land on both sides and the
     * plots between them would be planted on water. `shoreDistance` answers it
     * outright: it is the coast field `terrain.ts` already builds, in degrees,
     * and a tile further from the sea than its own radius plus the field's own
     * half-cell cannot contain any.
     */
    const radiusDeg = Math.hypot(tile.halfEast, tile.halfNorth) / UNITS_PER_DEGREE;
    const centreElevation = world.elevationAt(tile.direction);
    const shelf =
      centreElevation - reliefAt(tile.direction.x, tile.direction.y, tile.direction.z);
    const inland =
      centreElevation > 0 && shoreDistance(tile.lat, tile.lon) > radiusDeg + 0.5;

    // Everything built, in the tile's own tangent frame. The components of a
    // direction along the frame *are* the local coordinates at these angles.
    keepouts.length = 0;
    {
      const reach = Math.hypot(tile.halfEast, tile.halfNorth);
      const cos = Math.cos((reach + 120) / PLANET_RADIUS);
      const { x, y, z } = tile.direction;
      for (let i = 0; i < builtCount; i++) {
        const dot = x * builtUnit[i * 3]! + y * builtUnit[i * 3 + 1]! + z * builtUnit[i * 3 + 2]!;
        if (dot < cos) continue;
        keepouts.push({
          x:
            (builtUnit[i * 3]! * across.x +
              builtUnit[i * 3 + 1]! * across.y +
              builtUnit[i * 3 + 2]! * across.z) *
            PLANET_RADIUS,
          z:
            (builtUnit[i * 3]! * north.x +
              builtUnit[i * 3 + 1]! * north.y +
              builtUnit[i * 3 + 2]! * north.z) *
            PLANET_RADIUS,
          radius: builtRadius[i]!,
        });
      }
    }

    /**
     * And every road that crosses the tile, sampled into local segments.
     *
     * The gather is a grid query and not a sweep of the network — see
     * `createRoadIndex` — and the sampling walks `roadPoint`, which is the one
     * definition of where a road goes: the bake tested that curve for water and
     * `roads.ts` lays the ribbon along it, so a wood that stood off a second
     * copy of it would stand off the wrong line on exactly the coastal roads
     * that needed a bow.
     */
    roadKeepouts.length = 0;
    if (roadIndex !== null) {
      const reach = Math.hypot(tile.halfEast, tile.halfNorth);
      const margin = reach + 40;
      roadIndex.near(tile.direction, margin, roadHits);
      const all = options.roads!;
      const rows = options.places!;
      const limit = (margin + ROAD_STEP) * (margin + ROAD_STEP);
      for (const hit of roadHits) {
        const road = all[hit]!;
        placeDirection(rows[road.a]!, roadEndA);
        placeDirection(rows[road.b]!, roadEndB);
        roadPole(roadEndA, roadEndB, roadPolar);
        const length = roadEndA.angleTo(roadEndB) * PLANET_RADIUS;
        const steps = Math.max(1, Math.ceil(length / ROAD_STEP));
        const clearance = roadClearance(road.cls);
        let x0 = 0;
        let z0 = 0;
        for (let step = 0; step <= steps; step++) {
          roadPoint(roadEndA, roadEndB, road.bend, step / steps, roadAt, roadPolar);
          const x = roadAt.dot(across) * PLANET_RADIUS;
          const z = roadAt.dot(north) * PLANET_RADIUS;
          if (step > 0) {
            // Only the pieces that could reach into the tile. A road is up to a
            // thousand units long and a level-0 tile is 174 across, so most of
            // what the grid returns is the far end of something passing by.
            const mx = (x0 + x) * 0.5;
            const mz = (z0 + z) * 0.5;
            if (mx * mx + mz * mz <= limit) roadKeepouts.push({ x0, z0, x1: x, z1: z, clearance });
          }
          x0 = x;
          z0 = z;
        }
      }
    }

    const pitch = pitchOf(tile.level);
    const levelScale = SCALE_OF[tile.level]!;

    /**
     * Where this tile will try to put a plant, and whether the biome's `cover`
     * still gets a vote on it.
     *
     * Two layouts feed one loop. The near levels are the grid this file has
     * always used, one site per cell, and `cover` decides per site — a desert is
     * a wood with almost every plot refused, which is the one number `biome.ts`
     * exists to give this file. The far levels are groves: `cover` is spent once
     * on whether the *grove* is there, and inside it every site is planted,
     * because a grove whose members were thinned again would be the uniform
     * scatter back with extra steps.
     */
    interface Site {
      x: number;
      z: number;
      rng: ReturnType<typeof rngFrom>;
      /** True inside a grove: `cover` has already had its say, at the centre. */
      dense: boolean;
    }
    const sites: Site[] = [];

    if (tile.level < GROVE_FROM) {
      const columns = Math.max(1, Math.round((tile.halfEast * 2) / pitch));
      const rows = Math.max(1, Math.round((tile.halfNorth * 2) / pitch));
      const stepX = (tile.halfEast * 2) / columns;
      const stepZ = (tile.halfNorth * 2) / rows;
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          // Identity, not order: the cell seeds the plant, so adding a species
          // or moving a settlement leaves every other plant where it was.
          const rng = rngFrom(tile.key, column, row);
          sites.push({
            x: -tile.halfEast + (column + 0.5) * stepX + rng.jitter() * stepX * JITTER,
            z: -tile.halfNorth + (row + 0.5) * stepZ + rng.jitter() * stepZ * JITTER,
            rng,
            dense: false,
          });
        }
      }
    } else {
      const spacing = groveSpacing(tile.level);
      const columns = Math.max(1, Math.round((tile.halfEast * 2) / spacing));
      const rows = Math.max(1, Math.round((tile.halfNorth * 2) / spacing));
      const stepX = (tile.halfEast * 2) / columns;
      const stepZ = (tile.halfNorth * 2) / rows;
      const radius = Math.min(stepX, stepZ) * GROVE_RADIUS;
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const seed = rngFrom(tile.key, 'grove', column, row);
          const cx = -tile.halfEast + (column + 0.5) * stepX + seed.jitter() * stepX * JITTER;
          const cz = -tile.halfNorth + (row + 0.5) * stepZ + seed.jitter() * stepZ * JITTER;
          // `cover` decides the grove, once, at its centre — so a desert gets a
          // few copses and the Amazon gets almost all of them, out of the same
          // table and with nothing here knowing what a desert is.
          const at = directionAt(cx, cz, scratch);
          const lat = Math.asin(Math.max(-1, Math.min(1, at.y))) / DEG;
          const lon = Math.atan2(-at.z, at.x) / DEG;
          biomeAt(at.x, at.y, at.z, lat, lon, reliefAt(at.x, at.y, at.z), sample);
          if (!seed.chance(BIOMES[sample.id].cover)) continue;
          for (let i = 0; i < GROVE_PLANTS; i++) {
            const rng = rngFrom(tile.key, 'plant', column * 4096 + row, i);
            // Square root on the radius, or every grove is a ring: a uniform
            // draw on the radius puts half the plants in the outer quarter of
            // the disc, because the area out there is where the ground is.
            const angle = rng.unit() * Math.PI * 2;
            const distance = Math.sqrt(rng.unit()) * radius;
            sites.push({
              x: cx + Math.cos(angle) * distance,
              z: cz + Math.sin(angle) * distance,
              rng,
              dense: true,
            });
          }
        }
      }
    }

    interface Placed {
      flat: FlatVariant;
      matrix: THREE.Matrix4;
    }
    const placed: Placed[] = [];
    let vertices = 0;
    let inTheSea = 0;
    let builtOver = 0;
    let onRoad = 0;
    let onSlope = 0;
    let plots = 0;
    let checked = false;

    for (const site of sites) {
      {
        plots++;
        const { rng, x, z } = site;

        const direction = directionAt(x, z, scratch);
        const relief = reliefAt(direction.x, direction.y, direction.z);
        const elevation = inland ? shelf + relief : world.elevationAt(direction);
        // Elevation 0 is the sea, and the coast is a 20-unit cliff. A plant that
        // lands over water is not a mangrove, it is a tree dropped three
        // storeys.
        if (elevation <= 0) {
          inTheSea++;
          continue;
        }

        const lat = Math.asin(Math.max(-1, Math.min(1, direction.y))) / DEG;
        const lon = Math.atan2(-direction.z, direction.x) / DEG;
        biomeAt(direction.x, direction.y, direction.z, lat, lon, relief, sample);
        // The one number `biome.ts` exists to give this file: a probability per
        // plot, not a spacing. A desert at 0.03 is not a wood with wider gaps.
        // Inside a grove it has already been spent, at the centre; see `Site`.
        if (!site.dense && !rng.chance(BIOMES[sample.id].cover)) continue;

        const flora = floraFor(sample.id, style, tile.level);
        if (flora.length === 0) continue;
        const id = rng.weighted(flora);
        const flat = variantOf(id, style, rng.int(VARIANTS));
        if (flat === null) continue;

        const scale = levelScale * rng.spread(1, 0.16);
        // The per-variant half of the legibility test. `floraFor` has already
        // dropped the species that cannot read at this level; this drops the one
        // short variant of a species that can.
        if (flat.height * scale < legibleFloor(tile.level)) continue;

        let blocked = false;
        for (const keepout of keepouts) {
          const dx = x - keepout.x;
          const dz = z - keepout.z;
          if (dx * dx + dz * dz < keepout.radius * keepout.radius) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          builtOver++;
          continue;
        }

        // And the carriageway. The plant brings its own half-width to the test,
        // which is what makes the verge one plant wide rather than one constant
        // wide: a saguaro and a heather are not the same distance from a lane.
        const spread = flat.footprint * scale;
        for (const road of roadKeepouts) {
          const dx = road.x1 - road.x0;
          const dz = road.z1 - road.z0;
          const lengthSq = dx * dx + dz * dz;
          let t = 0;
          if (lengthSq > 1e-6) {
            t = ((x - road.x0) * dx + (z - road.z0) * dz) / lengthSq;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
          }
          const ox = road.x0 + t * dx - x;
          const oz = road.z0 + t * dz - z;
          const clear = road.clearance + spread;
          if (ox * ox + oz * oz < clear * clear) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          onRoad++;
          continue;
        }

        directionAt(x, z, plantUp);
        // Its own upright, not the tile's. A level-3 tile is 1,400 units across
        // and its corners are three and a half degrees off its centre's vertical
        // — which is a whole wood leaning downhill if every plant borrows the
        // tile's frame the way a settlement's buildings borrow the town's.
        plantNorth.set(0, 1, 0).projectOnPlane(plantUp);
        if (plantNorth.lengthSq() < 1e-8) plantNorth.set(1, 0, 0).projectOnPlane(plantUp);
        plantNorth.normalize();
        plantAcross.crossVectors(plantUp, plantNorth).normalize();

        // Four probes at the plant's own footprint, **in the plant's own frame**
        // and not the tile's, and they answer two questions for the price of
        // one. How *low* the ground gets under the footprint is the bedding, as
        // it always was. How it *leans* is the gradient across the same four
        // heights, and that is what was missing: a plant stood plumb on a hill
        // is buried on the uphill side by the slope times its own width, which
        // is the thing the user could see. The relief is the only term that
        // varies inside a tile — the shelf is the ring's and is constant — so
        // this is still four `reliefAt` calls and nothing else, and they are
        // `terrain.ts`'s four now rather than a copy of them here.
        const reach = Math.max(1.2, flat.footprint * scale * 0.6);
        gradeAt(plantUp, plantAcross, plantNorth, reach, slope);
        const grade = slope.grade;
        const lowest = Math.min(relief, slope.lowest);
        // Nothing grows on the scree; see `MAX_SLOPE`.
        if (grade > MAX_SLOPE) {
          onSlope++;
          continue;
        }

        plantBasis.makeBasis(plantAcross, plantUp, plantNorth);
        if (!checked) {
          checked = true;
          if (plantBasis.determinant() <= 0) {
            broken.push(`${tile.key}: plant basis has determinant ${plantBasis.determinant()}`);
            return empty;
          }
        }

        quaternion.setFromRotationMatrix(plantBasis);
        quaternion.multiply(spin.setFromAxisAngle(AXIS_Y, rng.unit() * Math.PI * 2));
        // The lean, applied in world space on the *outside* of the upright
        // basis, so the spin above is still about the plant's own axis and the
        // determinant argument above still covers the only matrix here that was
        // ever built by hand — `setFromUnitVectors` is a rotation by
        // construction and cannot reflect.
        if (flat.tilt > 0 && grade > 1e-4) {
          surfaceUp
            .copy(plantUp)
            .addScaledVector(plantAcross, -slope.across)
            .addScaledVector(plantNorth, -slope.north)
            .normalize()
            .sub(plantUp)
            .multiplyScalar(flat.tilt)
            .add(plantUp)
            .normalize();
          quaternion.premultiply(lean.setFromUnitVectors(plantUp, surfaceUp));
        }
        scaleVector.setScalar(scale);
        world4.compose(
          scratch
            .copy(plantUp)
            .multiplyScalar(
              // What is left to bed in is the share of the slope the lean did
              // *not* take: at `tilt` 1 the base plane is the ground's own and
              // there is nothing to cut in, at 0 this is the rule that was here
              // before, and a leaning tree pays the difference.
              PLANET_RADIUS + elevation - (relief - lowest) * (1 - flat.tilt)
                - flat.height * scale * SEATING,
            ),
          quaternion,
          scaleVector,
        );
        local4.multiplyMatrices(tileInverse, world4);

        placed.push({ flat, matrix: local4.clone() });
        vertices += flat.position.length / 3;
      }
    }

    if (placed.length === 0) {
      return { ...empty, plots, inTheSea, builtOver, onRoad, onSlope, fastPath: inland };
    }

    const position = new Float32Array(vertices * 3);
    /**
     * A byte each, not a float each, and the knob is what made it matter.
     *
     * This file's own note said 108 bytes a triangle — position, normal and
     * colour, all `Float32` — and that quantising the last two "would halve it
     * if it ever mattered". At a 300,000 budget it did not. The detail knob
     * multiplies the budget by the square of the reach, and at detail 3 standing
     * in Finland the field measured **1.56 M triangles, which at 108 bytes is
     * 168 MB** — more than the whole land mesh. It matters now.
     *
     * A normal is a unit vector and a cel colour is one of two dozen palette
     * entries, so eight bits each is not an approximation anyone can see: the
     * worst normal error is a quarter of a degree, against a `gradientMap` with
     * four bands in it. 108 bytes a triangle becomes 54.
     */
    const normal = new Int8Array(vertices * 3);
    const color = new Uint8Array(vertices * 3);
    let cursor = 0;
    for (const item of placed) {
      const e = item.matrix.elements;
      // Uniform scale, so the normal transform is the rotation and dividing by
      // the scale is the same as normalising. `validatePart` refuses a variant
      // that scales itself, so there is no shear to correct for.
      const scale = Math.hypot(e[0]!, e[1]!, e[2]!);
      const inverseScale = scale === 0 ? 0 : 1 / scale;
      const source = item.flat;
      const count = source.position.length;
      for (let i = 0; i < count; i += 3) {
        const x = source.position[i]!;
        const y = source.position[i + 1]!;
        const z = source.position[i + 2]!;
        position[cursor] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
        position[cursor + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
        position[cursor + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
        const nx = source.normal[i]!;
        const ny = source.normal[i + 1]!;
        const nz = source.normal[i + 2]!;
        // 127, not 128: a signed byte runs -128..127, and `normalized: true`
        // divides by 127, so scaling by 128 would clip a normal that is exactly
        // 1 on an axis — which is most of them on a box.
        normal[cursor] = Math.round((e[0]! * nx + e[4]! * ny + e[8]! * nz) * inverseScale * 127);
        normal[cursor + 1] = Math.round((e[1]! * nx + e[5]! * ny + e[9]! * nz) * inverseScale * 127);
        normal[cursor + 2] = Math.round((e[2]! * nx + e[6]! * ny + e[10]! * nz) * inverseScale * 127);
        cursor += 3;
      }
      for (let i = 0; i < count; i++) {
        color[cursor - count + i] = Math.round(Math.min(1, Math.max(0, source.color[i]!)) * 255);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `flora:${tile.key}`;
    // Only the two finest levels cast: the shadow box is 600 units across (see
    // `sun.ts`) and a level-2 tile is 696, so anything coarser is a tile that
    // starts 800 units out and would be drawn into the map for its bounding
    // sphere alone. Every level receives, which costs the pass nothing.
    mesh.castShadow = tile.level <= 1;
    mesh.receiveShadow = true;
    // Built in the tile's own tangent frame and placed by this one transform,
    // for the two reasons `settlements.ts` gives: the bounding sphere is the
    // tile's own, so frustum culling works per tile rather than per planet, and
    // the vertex coordinates stay under a thousand units instead of sixteen
    // thousand, where a float has a hundredth of a unit of precision rather than
    // a whole one.
    mesh.position.copy(origin);
    mesh.quaternion.setFromRotationMatrix(tileBasis);

    return {
      mesh,
      triangles: vertices / 3,
      plants: placed.length,
      // 12 bytes of position, 3 of normal and 3 of colour per vertex.
      bytes: vertices * 18,
      plots,
      inTheSea,
      builtOver,
      onRoad,
      onSlope,
      fastPath: inland,
    };
  }

  // ------------------------------------------------------------------
  // Enumerating the tiles: refine towards the viewer
  // ------------------------------------------------------------------

  const probe = new THREE.Vector3();

  function tileAt(level: number, row: number, column: number, viewer: THREE.Vector3): Tile {
    const step = stepOf(level);
    const lat = -90 + (row + 0.5) * step;
    const cells = cellsOf(rootOf(row, level), level);
    const lonStep = 360 / cells;
    const lon = -180 + (((column % cells) + cells) % cells) * lonStep + lonStep / 2;
    const cos = Math.cos(lat * DEG);
    const direction = new THREE.Vector3(
      cos * Math.cos(lon * DEG),
      Math.sin(lat * DEG),
      -cos * Math.sin(lon * DEG),
    );
    const centre = direction
      .clone()
      .multiplyScalar(PLANET_RADIUS + reliefAt(direction.x, direction.y, direction.z));
    const halfEast = (lonStep * cos * UNITS_PER_DEGREE) / 2;
    const halfNorth = (step * UNITS_PER_DEGREE) / 2;
    return {
      key: `${level}/${row}/${((column % cells) + cells) % cells}`,
      level,
      row,
      column: ((column % cells) + cells) % cells,
      direction,
      lat,
      lon,
      halfEast,
      halfNorth,
      centre,
      radius: Math.hypot(halfEast, halfNorth) + TILE_SLACK,
      distance: centre.distanceTo(viewer),
    };
  }

  /**
   * The quadtree descent, and the whole level-of-detail scheme in five lines.
   *
   * A tile splits into its four children when it is nearer than its own span
   * times `REFINE`, and the children are the same test one level down. There are
   * no tiers, no tables and no per-level ranges to keep in step: a level's
   * distance band is whatever falls out of its parent splitting and itself not
   * splitting.
   */
  function descend(tile: Tile, viewer: THREE.Vector3, range: number, out: Tile[]): void {
    if (tile.distance > range + tile.radius) return;
    // The cone is tested on the way *down*, which is the whole reason the
    // enumeration stays cheap as the reach grows: a parent's sphere contains its
    // four children's, so a band of the planet that is behind the camera is
    // rejected once at level 3 instead of sixty-four times at level 0. The test
    // is `keeps` rather than `admits` because a tile already standing has to
    // survive enumeration to be considered for keeping at all — `scan` makes the
    // narrower decision, once, on the handful that get this far.
    if (!cone.keeps(tile.centre, tile.radius)) return;
    if (tile.level > 0 && tile.distance < spanOf(tile.level) * refine()) {
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          descend(tileAt(tile.level - 1, tile.row * 2 + dr, tile.column * 2 + dc, viewer), viewer, range, out);
        }
      }
      return;
    }
    if (tile.distance > range) return;
    out.push(tile);
  }

  function enumerate(viewer: THREE.Vector3, range: number): Tile[] {
    const found: Tile[] = [];
    const direction = probe.copy(viewer).normalize();
    const lat = Math.asin(Math.max(-1, Math.min(1, direction.y))) / DEG;
    const lon = Math.atan2(-direction.z, direction.x) / DEG;
    const top = LEVELS - 1;
    const reach = (range + spanOf(top)) / UNITS_PER_DEGREE;
    const rows = rowsOf(top);
    const first = Math.max(0, Math.floor((lat - reach + 90) / ROOT_STEP));
    const last = Math.min(rows - 1, Math.ceil((lat + reach + 90) / ROOT_STEP));

    for (let row = first; row <= last; row++) {
      const bandLat = -90 + (row + 0.5) * ROOT_STEP;
      const cells = cellsOf(row, top);
      const lonStep = 360 / cells;
      // Degrees of longitude the range reaches at this latitude. A degree of
      // longitude is worth `cos(lat)` of a degree of latitude, so the span opens
      // out towards the poles and goes all the way round before it gets there.
      const spread = reach / Math.max(Math.cos(bandLat * DEG), 1e-3);
      if (spread >= 180) {
        for (let column = 0; column < cells; column++) {
          descend(tileAt(top, row, column, viewer), viewer, range, found);
        }
        continue;
      }
      const from = Math.floor((lon - spread + 180) / lonStep);
      const to = Math.ceil((lon + spread + 180) / lonStep);
      for (let column = from; column <= to; column++) {
        descend(tileAt(top, row, column, viewer), viewer, range, found);
      }
    }
    return found;
  }

  // ------------------------------------------------------------------
  // The streamer
  // ------------------------------------------------------------------

  const standing = new Map<string, Standing>();
  /**
   * Tiles that were asked and had nothing on them: open ocean, ice cap, or a
   * desert whose plots all came up empty.
   *
   * Remembered because the answer cannot change and re-deriving it *is* the
   * build — a level-0 tile of open sea is 200 point-in-polygon queries, and the
   * Atlantic is a lot of level-0 tiles. It is a `Set` of keys and grows with how
   * much of the planet has been looked at, which is bounded by the session.
   */
  const barren = new Set<string>();

  const stats: VegetationStats = {
    tiles: 0,
    pending: 0,
    plants: 0,
    triangles: 0,
    megabytes: 0,
    built: 0,
    barren: 0,
    lastBuildMs: 0,
    range: 0,
    reach: 0,
    byLevel: new Array(LEVELS).fill(0),
  };

  let queue: Tile[] = [];
  /**
   * Triangles actually standing, kept incrementally.
   *
   * **The scan's budget is spent against an estimate and an estimate is not a
   * cap.** Over the Amazon a 240,000 budget admitted 485,688 triangles and 50 MB
   * of buffers — twice what it had agreed to — because the estimator is one
   * constant for every biome and the rainforest's cover is 0.9 against the 0.5
   * it assumes. Tuning the constant per biome would be a second copy of
   * `BIOMES[id].cover` living in a cost model, which is the exact duplication
   * this file is written to avoid. So the cap is enforced where the truth is
   * known: the build loop stops the moment what is standing passes the budget,
   * and because the queue is nearest first, what it drops is the furthest. The
   * next scan then prices those tiles at their real cost and the two agree.
   */
  let residentTriangles = 0;
  const residentByLevel = new Array<number>(LEVELS).fill(0);
  const scannedAt = new THREE.Vector3(Infinity, Infinity, Infinity);
  const scannedAxis = new THREE.Vector3(0, 0, 1);
  let scannedRange = -1;
  // Turning the knob has to force a rescan outright. Neither the movement
  // threshold nor the turn threshold can see it, and the reach may not have
  // moved the 10% the range test wants either — but every budget, every cap and
  // the whole quadtree's refinement distance have just changed underneath.
  let scannedDetail = -1;
  /**
   * The prominence knob is the one change that invalidates a *standing* tile:
   * its plots were tested against the keepouts as they were, so every tile is
   * dropped and the barren set forgotten — a tile that was all village may be
   * all wood now.
   */
  let scannedProminence = prominenceVersion();

  const cone = createViewCone(keepAllWithin);

  function drop(key: string): void {
    const entry = standing.get(key);
    if (entry === undefined) return;
    group.remove(entry.mesh);
    // The geometry is this tile's and nothing else holds it. The material is one
    // object shared by every tile on the planet.
    entry.mesh.geometry.dispose();
    residentTriangles -= entry.triangles;
    residentByLevel[entry.level]! -= entry.triangles;
    standing.delete(key);
  }

  function scan(viewer: THREE.Vector3, range: number): void {
    const found = enumerate(viewer, range * 1.15).filter((tile) => {
      if (barren.has(tile.key)) return false;
      // A tile already standing is judged by the wide cone the descent used; one
      // that is not has to be inside the narrower admitting cone, which still
      // reaches `ADMIT_MARGIN` past the frame so it is built before it is seen.
      // Past the distance its own contents can be seen at, whatever the reach
      // says. The outermost level has no level above it to bound its band, so
      // this is the only thing standing between a raised reach and a ring of
      // two-pixel specks. See `visibleTo`.
      if (tile.distance > visibleTo(tile.level)) return false;
      if (standing.has(tile.key)) return true;
      return cone.admits(tile.centre, tile.radius);
    });
    found.sort((a, b) => a.distance - b.distance);

    const wanted: Tile[] = [];
    const budget = triangleBudget();
    const tileCap = maxTiles();
    let triangles = 0;
    for (const tile of found) {
      if (wanted.length >= tileCap) break;
      const already = standing.get(tile.key);
      // A tile already standing knows what it costs; one that is not is
      // estimated from its plot count, so the first rainforest to arrive cannot
      // spend the whole budget before anything else is asked.
      const cost = already?.triangles ?? estimate(tile);
      if (triangles + cost > budget && wanted.length > 0) continue;
      triangles += cost;
      wanted.push(tile);
    }

    const keep = new Set(wanted.map((tile) => tile.key));
    for (const key of [...standing.keys()]) {
      if (!keep.has(key)) drop(key);
    }
    queue = wanted.filter((tile) => !standing.has(tile.key));
  }

  /**
   * What a tile will cost before it is built, in triangles.
   *
   * Plots times a mean cover times the mean triangles of a plant. Only ever used
   * to decide whether to start, so it wants to be cheap and roughly right; the
   * real number replaces it the moment the tile exists.
   */
  function estimate(tile: Tile): number {
    if (tile.level >= GROVE_FROM) {
      // A grove level is priced by groves, not by plots: the layout is a lattice
      // at `groveSpacing` and a full grove is `GROVE_PLANTS`. Same 0.5 mean cover
      // and 100 mean triangles as below, and the same caveat — it decides
      // whether to start, and the real number replaces it the moment the tile
      // exists. See the trap: a budget spent against an estimate is not a cap.
      const spacing = groveSpacing(tile.level);
      const groves = ((tile.halfEast * 2) / spacing) * ((tile.halfNorth * 2) / spacing);
      return Math.round(groves * 0.5 * GROVE_PLANTS * 100);
    }
    const pitch = pitchOf(tile.level);
    const cells = ((tile.halfEast * 2) / pitch) * ((tile.halfNorth * 2) / pitch);
    return Math.round(cells * 0.5 * 100);
  }

  return {
    group,
    stats,
    missing,
    broken,

    update(viewer, altitude, camera) {
      const range = rangeFor(altitude);
      stats.range = Math.round(range);
      stats.reach = Math.round(reachFor(altitude));
      cone.aim(camera);
      if (scannedProminence !== prominenceVersion()) {
        scannedProminence = prominenceVersion();
        for (const key of [...standing.keys()]) drop(key);
        barren.clear();
        rebuildKeepouts();
        scannedDetail = -1;
      }
      if (
        viewer.distanceToSquared(scannedAt) > RESCAN_MOVE * RESCAN_MOVE ||
        Math.abs(range - scannedRange) > scannedRange * 0.1 ||
        cone.turnFrom(scannedAxis) > RESCAN_TURN ||
        scannedDetail !== detailVersion()
      ) {
        // Deliberately the *scan* position and not the live one: see
        // `RESCAN_MOVE`. The refinement test is a comparison against a distance,
        // and a tile sitting on a switch distance would otherwise split and
        // merge on alternate frames.
        scannedAt.copy(viewer);
        scannedAxis.copy(cone.axis);
        scannedRange = range;
        scannedDetail = detailVersion();
        scan(scannedAt, range);
      }

      if (queue.length > 0) {
        const began = performance.now();
        const budget = triangleBudget();
        const allowance = detailBuild(BUILD_BUDGET_MS);
        let built = 0;
        while (queue.length > 0 && performance.now() - began < allowance) {
          const tile = queue.shift()!;
          if (standing.has(tile.key)) continue;
          // This level has had its share. The tile is dropped rather than
          // deferred: the queue is nearest first, so what is waiting behind it
          // is the coarser ring that the share exists to protect.
          if (residentByLevel[tile.level]! >= budget * SHARE_OF[tile.level]!) continue;
          const result = raise(tile);
          built++;
          if (result.mesh === null) {
            barren.add(tile.key);
            continue;
          }
          group.add(result.mesh);
          standing.set(tile.key, {
            mesh: result.mesh,
            triangles: result.triangles,
            plants: result.plants,
            bytes: result.bytes,
            level: tile.level,
          });
          residentTriangles += result.triangles;
          residentByLevel[tile.level] = residentByLevel[tile.level]! + result.triangles;
          // The real cap. See `residentTriangles`.
          if (residentTriangles >= budget) {
            queue.length = 0;
            break;
          }
        }
        if (built > 0) {
          stats.lastBuildMs = Number((performance.now() - began).toFixed(2));
          stats.built += built;
        }
      }

      let triangles = 0;
      let plants = 0;
      let bytes = 0;
      const byLevel = new Array(LEVELS).fill(0);
      for (const entry of standing.values()) {
        triangles += entry.triangles;
        plants += entry.plants;
        bytes += entry.bytes;
        byLevel[entry.level]!++;
      }
      residentTriangles = triangles;
      for (let level = 0; level < LEVELS; level++) residentByLevel[level] = 0;
      for (const entry of standing.values()) residentByLevel[entry.level] = residentByLevel[entry.level]! + entry.triangles;
      stats.tiles = standing.size;
      stats.pending = queue.length;
      stats.triangles = triangles;
      stats.plants = plants;
      stats.megabytes = Number((bytes / 1048576).toFixed(1));
      stats.barren = barren.size;
      stats.byLevel = byLevel;
    },

    sample(lat, lon, level = 0) {
      const step = stepOf(level);
      const row = Math.min(rowsOf(level) - 1, Math.max(0, Math.floor((lat + 90) / step)));
      const cells = cellsOf(rootOf(row, level), level);
      const column = Math.floor((((lon + 180) % 360) / 360) * cells);
      const tile = tileAt(level, row, column, new THREE.Vector3());
      const began = performance.now();
      const result = raise(tile);
      const ms = performance.now() - began;
      result.mesh?.geometry.dispose();
      return {
        tile: tile.key,
        at: `${tile.lat.toFixed(3)}, ${tile.lon.toFixed(3)}`,
        span: `${Math.round(tile.halfEast * 2)} x ${Math.round(tile.halfNorth * 2)} units`,
        pitch: Number(pitchOf(level).toFixed(1)),
        plots: result.plots,
        plants: result.plants,
        triangles: result.triangles,
        inTheSea: result.inTheSea,
        builtOver: result.builtOver,
        onRoad: result.onRoad,
        onSlope: result.onSlope,
        fastPath: result.fastPath,
        kilobytes: Number((result.bytes / 1024).toFixed(1)),
        buildMs: Number(ms.toFixed(2)),
      };
    },

    /**
     * The determinism check, which is the one property this file cannot lose.
     *
     * The scenery sheet builds each variant twice and compares; the same
     * argument applies a level up, because a tile draws from a seed per *cell*
     * and a single `Math.random()` anywhere in the chain would give a different
     * wood on every load — and the failure is invisible unless something looks.
     */
    verify(lat, lon, level = 0) {
      const step = stepOf(level);
      const row = Math.min(rowsOf(level) - 1, Math.max(0, Math.floor((lat + 90) / step)));
      const cells = cellsOf(rootOf(row, level), level);
      const column = Math.floor((((lon + 180) % 360) / 360) * cells);
      const tile = tileAt(level, row, column, new THREE.Vector3());

      const first = raise(tile);
      const second = raise(tile);
      const a = first.mesh?.geometry.getAttribute('position').array as Float32Array | undefined;
      const b = second.mesh?.geometry.getAttribute('position').array as Float32Array | undefined;
      let same = a !== undefined && b !== undefined && a.length === b.length;
      let differed = -1;
      if (same && a && b) {
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            same = false;
            differed = i;
            break;
          }
        }
      }
      first.mesh?.geometry.dispose();
      second.mesh?.geometry.dispose();
      return {
        tile: tile.key,
        plants: first.plants,
        vertices: a?.length ?? 0,
        deterministic: same,
        firstDifferenceAt: differed,
      };
    },
  };
}
