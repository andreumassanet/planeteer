import * as THREE from 'three';
import type { World } from './geo.ts';
import { GROUND_MARKS_GLSL, PLANET_RADIUS, UNITS_PER_DEGREE, groundColorAt, groundRadius } from './globe.ts';
import { createLandProbe } from './land-probe.ts';
import { mergeMeshes } from './merge.ts';
import { proxyOf } from './warm.ts';
import { createFader, fadeTwin } from './fade.ts';
import { SWARD_FLOWERS, SWARD_FLOWER_HEIGHT, SWARD_FLOWER_SHARE, SWARD_GRASS } from './sward-kit.ts';
import { MAX_SLOPE, gradeAt, reliefAt, shoreDistance } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { BIOMES, biomeAt, biomeSample } from './biome.ts';
import type { BiomeId } from './biome.ts';
import { PALETTE, createToonRamp } from './theme.ts';
import type { MonumentContext } from './monuments/contract.ts';
import type { Placement } from './placement.ts';
import { isShown, prominenceVersion, radiusOf } from './places.ts';
import { townGrid } from './scenery/grid.ts';
import { EDGE_RUN } from './scenery/ground.ts';
import { sceneryModel } from './scenery/contract.ts';
import type { Place } from './places.ts';
import { roadClearance, roadGeometryFor, roadIndexFor } from './roads.ts';
import type { Road, RoadIndex } from './roads.ts';
import type { Settlements } from './settlements.ts';
import {
  createViewCone,
  detailArea,
  detailBuild,
  frameOpenFor,
  mayBuild,
  NEAR_BUILD,
  detailCount,
  detailPixels,
  detailReach,
  detailVersion,
  detail,
  DETAIL_DEFAULT,
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
import { latOf, lonOf, toUnit, unitAt } from './sphere.ts';

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
 * And the knob's own lever on it, which is the one that matters.
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
 * on top of the land mesh's 2.18 M (drawn twice as well) and the settlements'
 * 760,000. The tile cap is the draw-call half of the same budget: a tile is one
 * merged mesh, frustum culled on its own bounding sphere, so `MAX_TILES`
 * resident tiles cost well under that many draws at ground level.
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
 * it: 2.6 M triangles was about 140 MB, roughly the land (about 164 MB at the 63
 * bytes a triangle the ink's normal made it on 2026-09-17), and because the build
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
 * **`radiusOf` is `places.ts`'s and there must not be a second one.** It is
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
 * where it showed first; the road, the herd and the town's own paving ask the
 * same question now, so the definition moved and this file reads it.
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
 * One built variant, reduced to the arrays a tile is assembled from by
 * `mergeMeshes` (`merge.ts`), which is the one merge in this project: colour
 * off the material and onto the vertices is what makes a tile one draw call.
 */
interface FlatVariant {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  /** The ink's normals: a painted part's welded `outlineNormal`, a code part's own normal. */
  outline: Float32Array;
  triangles: number;
  height: number;
  footprint: number;
  /** How far this one follows the slope it stands on; see `TILT_OF`. */
  tilt: number;
}

// ---------------------------------------------------------------------------
// The sward
// ---------------------------------------------------------------------------

/**
 * The grass under your feet, which the plots above cannot be.
 *
 * A plot is a plant a few hundred square units, which is a wood and not a lawn:
 * the land between the trees was one flat colour from the boots to the fog, and
 * until 2026-09-17 the ground read as flat, a lawn with no grass on it. Grass
 * is a field in the sense this file's header means, and the header's arithmetic
 * applies with more force — a clump every two units to the fog is tens of
 * millions of triangles — so the sward thins with distance, and thins in a way
 * that cannot be seen doing it.
 *
 * **Every site has a rank.** The sites are one lattice over the whole planet,
 * `SWARD_PITCH` apart in latitude and longitude on the quadtree's own cells, and
 * a site's rank is how many times both its indices halve: a quarter of the
 * sites are rank 1 or more, a sixteenth rank 2. A sward tile `k` levels above
 * `SWARD_TILE` holds exactly the sites of rank `k` and up, at exactly the
 * places the finer tiles under it hold them, each drawn from its own seed. And
 * the vertex stage does the rest by distance alone (`SWARD_BANDS`): past each
 * band a rank shrinks into the ground while the ranks above it grow by
 * `SWARD_GROWTH`, so by the time a tile is swapped for its parent every clump
 * the parent lacks is already gone and every one it has is already its size.
 * The swap is invisible because nothing on the screen changes at it. Past the
 * last band the ground carries its own patches (`atlasPatches` in `globe.ts`).
 *
 * What makes it grass and not green stubble is three things it takes from the
 * ground rather than having of its own. **Its colour is the ground's**
 * (`groundColorAt`, on a lattice of its own a level coarser), darkened at the
 * root and lit at the tip, and the fragment stage gives it the same hex tone
 * and the same patch as the land it grows in. **Its normal is the ground's** —
 * the face of the drawn land under the clump, for every vertex — so a blade
 * steps through the cel ramp exactly as the field does and the clump is a
 * texture on it rather than a scatter of little lit and unlit fans. And **it
 * stands on the drawn land**, through `LandProbe`, because the relief is not
 * what is drawn to within a clump's own height. It has no ink: a pen round
 * every blade is a field of black hair.
 *
 * **It is the one thing on the land that `MAX_SLOPE` does not refuse** (since
 * 2026-09-17). A slope rule is about what stands — a trunk, a hoof, a wheel, a
 * wall — and a sward stands on nothing; it is the colour of the hill with a
 * grain to it, and a hill drawn green and bare above thirty degrees read as a
 * hill with a bald flank. It stops only where the probe does, at a face too
 * near vertical to have a top.
 */
const SWARD_LEVEL = -3;
/**
 * The finest tile a sward is built in, a level above the lattice's own: a tile
 * holds two levels' worth of sites a side and costs four times the build, and
 * a quarter of the meshes. Measured at Madison on foot (2026-09-17), tiles at
 * the lattice's own level put 211 sward meshes in the world and 69 extra draw
 * calls in the frame; the build a tile is still under the vegetation's own
 * allowance.
 */
const SWARD_TILE = SWARD_LEVEL + 1;
/** Ranks: tiles run from `SWARD_TILE` to `SWARD_TILE + SWARD_RANKS - 1`. */
const SWARD_RANKS = 4;
/** Units between the finest sites, before the biome's `sward` refuses some. */
const SWARD_PITCH = 2.5;
/** How far a site strays from its lattice point, as a share of `SWARD_PITCH`. */
const SWARD_JITTER = 0.45;
/**
 * Where each rank goes, in units from the camera at the default detail: every
 * site stands inside the first band, and rank `r` shrinks away between band `r`
 * and band `r + 1` while every rank above it grows by `SWARD_GROWTH` over the
 * same stretch. So the last rank is gone at the last band.
 */
const SWARD_BANDS = [40, 80, 160, 290, 480] as const;
/** How much bigger a surviving clump is a band further out: coverage falls by less than the count. */
const SWARD_GROWTH = 1.35;
/**
 * How far the detail knob moves the bands: as the square root and to a cap,
 * because the sward is an area and the land probe's reach is not unbounded.
 */
const swardReach = (): number => Math.min(1.6, Math.sqrt(detail() / DETAIL_DEFAULT));
/** The distance at which a rank is going, for the tiles: the vertex stage's `swardLod`, restated. */
function swardLod(distance: number, reach: number): number {
  const d = distance / reach;
  let lod = 0;
  for (let band = 0; band + 1 < SWARD_BANDS.length; band++) {
    lod += Math.min(1, Math.max(0, (d - SWARD_BANDS[band]!) / (SWARD_BANDS[band + 1]! - SWARD_BANDS[band]!)));
  }
  return lod;
}
/** The camera moves this far before the tiles are asked again. */
const SWARD_RESCAN = 6;
const SWARD_BUILD_MS = 1.5;
/** A cap on what stands, at the default detail; see `detailArea`. */
const SWARD_TRIANGLES = 450_000;
/** How far into the ground a clump's root goes, for a face the probe met at a corner. */
const SWARD_BURY = 0.15;
/** How far a lawn in a town keeps off its streets and its walls. */
const LAWN_MARGIN = 0.6;
/** The petals, on the palette. */
const PETALS: readonly [RegExp, number][] = [
  [/red/i, PALETTE.red],
  [/yellow/i, PALETTE.gold],
  [/purple/i, PALETTE.violet],
  [/white/i, PALETTE.white],
];
/** The ground's colour times these at the root and at the tip. */
const SWARD_ROOT = 0.76;
const SWARD_TIP = 1.5;
/** And how far the tip is pushed off grey, so a lit blade is a greener one and not a paler one. */
const SWARD_TIP_SATURATION = 1.35;

/** Trailing zero bits, capped: how many times an index halves. */
function halvings(index: number, cap: number): number {
  let count = 0;
  while (count < cap && index % 2 === 0) {
    index /= 2;
    count++;
  }
  return count;
}

/**
 * The sward's one material: vertex colours, both faces, no ink, and a vertex
 * stage that grows or shrinks each clump about its root by its rank and the
 * camera's distance (`SWARD_BANDS`). The root and the rank ride one attribute.
 *
 * Both faces with the ground's normal on both: Three turns a back face's
 * normal round, and a blade seen from behind would step to the shadow band.
 */
function swardMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4), side: THREE.DoubleSide });
  material.userData.outlineParameters = { visible: false };
  const uniforms = { swardReach: { value: swardReach() } };
  material.userData.uniforms = uniforms;
  const lod = SWARD_BANDS.slice(0, -1)
    .map((near, band) => `clamp((d - ${near.toFixed(1)}) / ${(SWARD_BANDS[band + 1]! - near).toFixed(1)}, 0.0, 1.0)`)
    .join(' + ');
  material.onBeforeCompile = (shader) => {
    shader.uniforms['swardReach'] = uniforms.swardReach;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec4 root;\nuniform float swardReach;\nvarying vec3 vSwardRoot;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
  {
    vSwardRoot = (modelMatrix * vec4(root.xyz, 1.0)).xyz;
    float d = distance(vSwardRoot, cameraPosition) / swardReach;
    float lod = ${lod};
    float size = pow(${SWARD_GROWTH.toFixed(3)}, min(lod, root.w + 1.0)) * (1.0 - smoothstep(root.w, root.w + 1.0, lod));
    transformed = root.xyz + (transformed - root.xyz) * size;
  }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSwardRoot;\n${GROUND_MARKS_GLSL}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  vec2 swardCell;
  diffuseColor.rgb *= atlasCellTone(atlasPlaneOf(vSwardRoot), swardCell);
  diffuseColor.rgb = atlasPatches(diffuseColor.rgb, vSwardRoot);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
  normal = atlasLeanOf(normalize(vNormal), swardCell, 1.0);
  nonPerturbedNormal = normal;`,
      );
  };
  material.customProgramCacheKey = () => 'atlas-sward';
  return material;
}

/** One clump, stood on y = 0 and one unit tall, with what colours each vertex. */
interface SwardClump {
  position: Float32Array;
  /** 0 at the root, 1 at the tip. */
  rise: Float32Array;
  /** Per vertex, a petal's linear colour, or -1 in `r` for the ground's. */
  paint: Float32Array;
  triangles: number;
}

function swardClump(id: string): SwardClump {
  const model = sceneryModel(id);
  const source = model.geometry.getAttribute('position');
  // Baked models are indexed; the sward writes every corner of every triangle.
  const index = model.geometry.index;
  const count = index !== null ? index.count : source.count;
  const low = model.box.min.y;
  const height = model.box.max.y - low || 1;
  const position = new Float32Array(count * 3);
  const rise = new Float32Array(count);
  const paint = new Float32Array(count * 3);
  const colour = new THREE.Color();
  for (let v = 0; v < count; v++) {
    const corner = index !== null ? index.getX(v) : v;
    const y = (source.getY(corner) - low) / height;
    position[v * 3] = source.getX(corner) / height;
    position[v * 3 + 1] = y;
    position[v * 3 + 2] = source.getZ(corner) / height;
    rise[v] = y;
    const slot = model.slots[model.slot[corner]!] ?? '';
    const petal = PETALS.find(([pattern]) => pattern.test(slot));
    if (petal === undefined) paint[v * 3] = -1;
    else {
      colour.set(petal[1]);
      paint[v * 3] = colour.r;
      paint[v * 3 + 1] = colour.g;
      paint[v * 3 + 2] = colour.b;
    }
  }
  return { position, rise, paint, triangles: count / 3 };
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export interface VegetationStats {
  /** Tiles standing in the world right now. */
  tiles: number;
  /** Wanted, and waiting for a frame with room to build them. */
  pending: number;
  /**
   * Of those, the ones within `NEAR_BUILD` of the viewer, plus every sward tile
   * waiting: the ground you are standing on. `main.ts` holds the arrival
   * curtain until it is zero.
   */
  nearPending: number;
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
  /**
   * Tiles no longer wanted and still drawn, because what replaces them has not
   * all arrived; and tiles built and not yet drawn, because what they replace
   * is still standing. See `settle`. Both should be zero a moment after you
   * stop.
   */
  retiring: number;
  staged: number;
  /** The grass under your feet; see `SWARD_LEVEL`. */
  sward: {
    tiles: number; clumps: number; triangles: number; megabytes: number; pending: number; barren: number; lastBuildMs: number; ready: boolean;
    retiring: number; staged: number;
    /** Standing tiles by rank, finest first, and how far the knob has moved the bands. */
    byRank: number[];
    reach: number;
    /** The slowest single tile since the world loaded. */
    slowestTileMs: number;
    medianTileMs: number;
    p90TileMs: number;
    /** Sites refused since the world loaded, by what refused them. */
    refused: { thin: number; shore: number; unprobed: number; built: number; road: number };
  };
}

export interface Vegetation {
  group: THREE.Group;
  stats: VegetationStats;
  /** One mesh per program this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Object3D[];
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
  /**
   * The sward's one promise, checked: sows the tile a rank above the finest
   * over a point and its four children, and reports whether every clump the
   * parent holds stands exactly where one of the children's does. In a
   * browser, near the player, where the land probe answers.
   */
  verifySward(lat: number, lon: number): unknown;
  /** Sows the finest sward tile over a point and reports what grew and what refused the rest. */
  sampleSward(lat: number, lon: number): unknown;
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
  // Every tile carries `outlineNormal` (see `FlatVariant.outline`).
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01], outlineNormal: true };
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

interface Standing extends Cell {
  mesh: THREE.Mesh;
  triangles: number;
  plants: number;
  bytes: number;
  /** In the group and drawn. False while it waits for what it replaces; see `settle`. */
  shown: boolean;
}

/** Where a tile sits in the quadtree, which is all `overlaps` needs. */
interface Cell {
  level: number;
  row: number;
  column: number;
}

/**
 * Whether two tiles of the quadtree cover any of the same ground: one is the
 * other or an ancestor of it. A tile's parent is `(level + 1, row >> 1,
 * column >> 1)` — `tileAt` splits a tile into rows `2r, 2r + 1` and columns
 * `2c, 2c + 1`, and a root band's column count doubles a level down, so the
 * wrap at the antimeridian halves with it.
 */
function overlaps(a: Cell, b: Cell): boolean {
  const low = a.level <= b.level ? a : b;
  const high = low === a ? b : a;
  const shift = high.level - low.level;
  return low.row >> shift === high.row && low.column >> shift === high.column;
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
  /** The land mesh (`buildLand`), which the sward stands on. Without it there is no sward. */
  land?: THREE.Mesh;
  /** The towns' lawns, which the sward grows on too. */
  lawns?: Pick<Settlements, 'swardAt' | 'floorChanges'>;
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
  /**
   * Half the side of a town's square, or 0 for a monument's disc. The trees keep
   * off a town's whole disc; the sward grows up to its square, less the edge
   * slope, because the bare corners of a disc round a square are exactly where
   * a foot arriving at a town is looking.
   */
  const builtHalf = new Float64Array(builtRadius.length);
  /** How many of those arrays are in use: only the *shown* places keep the trees out. */
  let builtCount = 0;
  /**
   * Filled at construction and again when the prominence knob moves, because
   * a hidden village's ground grows trees again — nothing is built there, so
   * nothing keeps the wood out. See `PROMINENCE_RADIUS` in `places.ts`.
   */
  const rebuildKeepouts = (): void => {
    let i = 0;
    const add = (lat: number, lon: number, radius: number, half = 0): void => {
      // Through `sphere.ts`, like every other conversion in the project: the
      // obvious hand-written one is the mirror image of the planet.
      toUnit(lat, lon, builtUnit, i * 3);
      builtRadius[i] = radius;
      builtHalf[i] = half;
      i++;
    };
    for (const place of options.places ?? []) {
      if (isShown(place)) add(place.lat, place.lon, radiusOf(place), townGrid(radiusOf(place)).half);
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
   * How much further than a road's own chord a piece of it may reach into the
   * tile, in world units: the longest chord `coursePath` cuts.
   *
   * The chords themselves are the course's own path — see `coursePath` in
   * `roads.ts` — and not a walk of this file's: a road runs gate to gate on a
   * Bezier with a `sin^2` bow now, which has no curvature worth predicting, so
   * the path measures its own sag and holds it under 0.05 units. It used to be
   * 48-unit steps priced against the old half-sine's tightest bow, 0.85 units
   * of sag, which was a fifth of a lane and fine for a wood; the path is tighter
   * than that everywhere and no longer this file's to choose.
   */
  const ROAD_STEP = 48;

  const roadIndex: RoadIndex | null =
    options.roads !== undefined && options.places !== undefined && options.roads.length > 0
      ? roadIndexFor(options.roads, options.places)
      : null;
  const roadGeometry =
    roadIndex !== null ? roadGeometryFor(options.roads!, options.places!) : null;
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
      ...mergeMeshes(built),
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
    /** Which entry of `builtUnit` this is, for the sward's town squares. */
    index: number;
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

  /**
   * The tile's own tangent frame: `up`, `north` and `across`, the basis, the
   * origin on the ground and the matrices in and out of it. False, and
   * reported, if the basis reflects.
   */
  function frameTile(tile: Tile): boolean {
    up.copy(tile.direction);
    // The frame `placement.ts` and `settlements.ts` both build: +Z along the
    // ground towards the pole. X cross Y is Z, so X is Y cross Z — written this
    // way round because `makeBasis(east, up, north)` is the reflection that
    // fills a mesh with ink, and it is the one mistake here that an ordinary
    // `Mesh` cannot show you, because it silently discards a reflection.
    north.set(0, 1, 0).projectOnPlane(up);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
    north.normalize();
    across.crossVectors(up, north).normalize();
    tileBasis.makeBasis(across, up, north);
    if (tileBasis.determinant() <= 0) {
      broken.push(`${tile.key}: tile basis has determinant ${tileBasis.determinant()}`);
      return false;
    }
    origin.copy(up).multiplyScalar(groundRadius(world, up));
    tileMatrix.compose(origin, quaternion.setFromRotationMatrix(tileBasis), ONE);
    tileInverse.copy(tileMatrix).invert();
    return true;
  }

  /**
   * Everything built that could reach into the tile, into `keepouts` and
   * `roadKeepouts`, in the frame `frameTile` has just set.
   */
  function gatherKeepouts(tile: Tile): void {
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
          index: i,
        });
      }
    }

    /**
     * And every road that crosses the tile, sampled into local segments.
     *
     * The gather is a grid query and not a sweep of the network — see
     * `createRoadIndex` — and the chords are the road's own `coursePath`, which
     * walks `courseOf`, the one definition of where a road goes: the bake
     * tested that curve for water and `roads.ts` lays the ribbon along it, so a
     * wood that stood off a second copy of it would stand off the wrong line on
     * exactly the coastal roads that needed a bow, and on every road's last
     * stretch into its gate.
     */
    roadKeepouts.length = 0;
    if (roadIndex !== null && roadGeometry !== null) {
      const reach = Math.hypot(tile.halfEast, tile.halfNorth);
      const margin = reach + 40;
      roadIndex.near(tile.direction, margin, roadHits);
      const all = options.roads!;
      const limit = (margin + ROAD_STEP) * (margin + ROAD_STEP);
      for (const hit of roadHits) {
        const road = all[hit]!;
        const path = roadGeometry.path(hit);
        const clearance = roadClearance(road.cls);
        let x0 = 0;
        let z0 = 0;
        for (let step = 0; step < path.count; step++) {
          const px = path.xyz[step * 3]!;
          const py = path.xyz[step * 3 + 1]!;
          const pz = path.xyz[step * 3 + 2]!;
          const x = (px * across.x + py * across.y + pz * across.z) * PLANET_RADIUS;
          const z = (px * north.x + py * north.y + pz * north.z) * PLANET_RADIUS;
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

    if (!frameTile(tile)) return empty;

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

    gatherKeepouts(tile);

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
          const lat = latOf(at.y);
          const lon = lonOf(at.x, at.z);
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

        const lat = latOf(direction.y);
        const lon = lonOf(direction.x, direction.z);
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

        // Four probes at the plant's own footprint, **in the plant's own
        // frame** and not the tile's, and they answer two questions for the
        // price of one. How *low* the ground gets under the footprint is the
        // bedding, as it always was. How it *leans* is the gradient across the
        // same four heights, and that is what was missing: a plant stood plumb
        // on a hill is buried on the uphill side by the slope times its own
        // width, which is the thing that showed. The relief is the only term
        // that varies inside a tile — the shelf is the ring's and is constant —
        // so this is still four `reliefAt` calls and nothing else, and they are
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
     * four bands in it. 108 bytes a triangle becomes 54 — and 63 since the
     * painted parts brought the ink's own normal, three more bytes a vertex
     * (2026-09-17).
     */
    const normal = new Int8Array(vertices * 3);
    const color = new Uint8Array(vertices * 3);
    // And the ink's normal, the same byte a component: see `FlatVariant.outline`.
    const outline = new Int8Array(vertices * 3);
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
        const ox = source.outline[i]!;
        const oy = source.outline[i + 1]!;
        const oz = source.outline[i + 2]!;
        outline[cursor] = Math.round((e[0]! * ox + e[4]! * oy + e[8]! * oz) * inverseScale * 127);
        outline[cursor + 1] = Math.round((e[1]! * ox + e[5]! * oy + e[9]! * oz) * inverseScale * 127);
        outline[cursor + 2] = Math.round((e[2]! * ox + e[6]! * oy + e[10]! * oz) * inverseScale * 127);
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
    geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline, 3, true));
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
    // thousand: a float steps by 2^-14, six hundred-thousandths of a unit,
    // rather than the 2^-10 — a thousandth — it steps by at the planet's radius.
    mesh.position.copy(origin);
    mesh.quaternion.setFromRotationMatrix(tileBasis);

    return {
      mesh,
      triangles: vertices / 3,
      plants: placed.length,
      // 12 bytes of position, 3 of normal, 3 of colour, 3 of the ink's normal.
      bytes: vertices * 21,
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
    const direction = unitAt(lat, lon, new THREE.Vector3());
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
    const lat = latOf(direction.y);
    const lon = lonOf(direction.x, direction.z);
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
   * Atlantic is a lot of level-0 tiles. It is a `Set` of keys and grew with how
   * much of the planet had been looked at, which a flight round it makes large;
   * so it is emptied wholesale past `BARREN_CAP`, as `life.ts` empties its
   * caches: what it holds is a pure function of the key, and losing it costs a
   * build, not a wrong answer. The sward's is emptied the same way.
   */
  const barren = new Set<string>();
  const BARREN_CAP = 20_000;

  const stats: VegetationStats = {
    tiles: 0,
    pending: 0,
    nearPending: 0,
    plants: 0,
    triangles: 0,
    megabytes: 0,
    built: 0,
    barren: 0,
    lastBuildMs: 0,
    range: 0,
    reach: 0,
    byLevel: new Array(LEVELS).fill(0),
    retiring: 0,
    staged: 0,
    sward: { tiles: 0, clumps: 0, triangles: 0, megabytes: 0, pending: 0, barren: 0, lastBuildMs: 0, ready: false, retiring: 0, staged: 0, slowestTileMs: 0, medianTileMs: 0, p90TileMs: 0, byRank: [], reach: 1, refused: { thin: 0, shore: 0, unprobed: 0, built: 0, road: 0 } },
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
    release(entry);
    residentTriangles -= entry.triangles;
    residentByLevel[entry.level]! -= entry.triangles;
    standing.delete(key);
  }

  function release(entry: Standing): void {
    // The geometry is this tile's and nothing else holds it. The material is one
    // object shared by every tile on the planet.
    const mesh = entry.mesh;
    if (!entry.shown) {
      mesh.geometry.dispose();
      return;
    }
    // Dissolved away (`fade.ts`); a swap's replacement dissolves in on the
    // complementary pixels in the same frames.
    fader.out(mesh, () => {
      group.remove(mesh);
      mesh.geometry.dispose();
    });
  }

  /**
   * **A level-of-detail swap happens in one frame or it is a hole.** The scan
   * used to dispose every tile it no longer wanted and queue the ones that
   * replace it, at `BUILD_BUDGET_MS` a frame: a parent splitting into four
   * children left bare ground for as many frames as the four took, and a
   * child skipped for its level's share left its square empty (its parent was
   * already gone) until the next scan.
   *
   * So a tile the scan no longer wants **retires** instead: it stays drawn
   * until every wanted tile that covers any of its ground (`overlaps`) is
   * standing or known barren, and a tile built while a retiring one still
   * covers its ground is **staged** — built, counted, not drawn — until then.
   * When the last one arrives, the old go and the new appear in the same
   * frame. A tile leaving the range altogether has nothing to wait for and
   * goes at once, as before. `wantedTiles` is the last scan's list.
   */
  const retiring = new Map<string, Standing>();
  let wantedTiles: Tile[] = [];
  /** Tiles arriving and leaving by dissolving; see `fade.ts`. The sward has its own ranks. */
  const fader = createFader();

  function retire(key: string): void {
    const entry = standing.get(key);
    if (entry === undefined) return;
    standing.delete(key);
    residentTriangles -= entry.triangles;
    residentByLevel[entry.level]! -= entry.triangles;
    // One never drawn has nothing on the screen to hold.
    if (entry.shown) retiring.set(key, entry);
    else release(entry);
  }

  function settle(): void {
    if (retiring.size > 0) {
      for (const [key, old] of retiring) {
        let covered = true;
        for (const tile of wantedTiles) {
          if (!overlaps(old, tile)) continue;
          if (standing.has(tile.key) || barren.has(tile.key)) continue;
          covered = false;
          break;
        }
        if (!covered) continue;
        release(old);
        retiring.delete(key);
      }
    }
    for (const entry of standing.values()) {
      if (entry.shown) continue;
      let held = false;
      for (const old of retiring.values()) {
        if (overlaps(old, entry)) {
          held = true;
          break;
        }
      }
      if (held) continue;
      group.add(entry.mesh);
      fader.in(entry.mesh);
      entry.shown = true;
    }
  }

  function scan(viewer: THREE.Vector3, range: number): void {
    if (barren.size > BARREN_CAP) barren.clear();
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
      if (!keep.has(key)) retire(key);
    }
    // A retiring tile wanted again is simply standing again.
    for (const tile of wanted) {
      const back = retiring.get(tile.key);
      if (back === undefined) continue;
      retiring.delete(tile.key);
      standing.set(tile.key, back);
      residentTriangles += back.triangles;
      residentByLevel[back.level] = residentByLevel[back.level]! + back.triangles;
    }
    wantedTiles = wanted;
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

  // ------------------------------------------------------------------
  // The sward
  // ------------------------------------------------------------------

  // Here rather than in `main.ts`, so the index is in this deferred chunk and not the first load.
  const land = options.land === undefined ? undefined : createLandProbe(options.land);
  const lawns = options.lawns;
  const swardGroup = new THREE.Group();
  swardGroup.name = 'sward';
  group.add(swardGroup);
  const swardPaint = swardMaterial();
  const swardUniforms = swardPaint.userData.uniforms as { swardReach: { value: number } };
  const clumps = new Map<string, SwardClump>();
  const clumpOf = (id: string): SwardClump => {
    let clump = clumps.get(id);
    if (clump === undefined) {
      clump = swardClump(id);
      clumps.set(id, clump);
    }
    return clump;
  };
  const grassWeights: Weighted<number>[] = SWARD_GRASS.map((entry, item) => ({ item, weight: entry.weight }));

  interface SwardTile {
    mesh: THREE.Mesh;
    triangles: number;
    clumps: number;
    bytes: number;
    direction: THREE.Vector3;
    /** The tile's half-diagonal, for finding it again from a town that changed. */
    radius: number;
    /** Whether a town's square reaches into it, whose lawns may come and go. */
    touchesTown: boolean;
    /** Its quadtree level, which `SWARD_TILE` below is its rank; and where it is on it. */
    level: number;
    row: number;
    column: number;
    /** In `swardGroup` and drawn. See `settleSward`. */
    shown: boolean;
    /** Retired because a floor under it changed: sown again, never taken back. */
    stale: boolean;
  }
  const swardStanding = new Map<string, SwardTile>();
  const swardBarren = new Set<string>();
  /**
   * Tiles sown empty because a town reaches into them and its lawns have not
   * arrived: not barren, which is for good, but not worth sowing again on
   * every six units of camera movement either. Forgotten when a floor changes.
   */
  const swardHollow = new Set<string>();
  /**
   * The sward's half of `settle`, and the one the rank design depends on:
   * **the swap is invisible only if it is a swap.** A parent holds exactly the
   * clumps of its children that are still standing at its distance, so trading
   * one for the other in one frame changes nothing on the screen; dropping one
   * and sowing the other at `SWARD_BUILD_MS` a frame was a bare patch for as
   * many frames as the sowing took. So a tile the scan no longer wants, or one
   * a changed floor has made stale, stays drawn until what covers its ground
   * has been sown, and a new tile waits undrawn for the old to go.
   */
  const swardRetiring = new Map<string, SwardTile>();
  let swardWanted: Tile[] = [];
  let swardQueue: Tile[] = [];
  const swardTimes: number[] = [];
  const swardScannedAt = new THREE.Vector3(Infinity, Infinity, Infinity);
  let swardProminence = prominenceVersion();
  let swardDetail = -1;
  let floorsSeen = 0;
  const floorChanges: number[] = [];

  // ------------------------------------------------------------------
  // What the ground is, on a lattice of its own
  // ------------------------------------------------------------------

  /**
   * The ground's colour and the biome's `sward`, sampled at the corners of the
   * level above the finest sward tile and laid between them. **On a lattice of
   * its own, and not at a tile's corners**, because a site has to come out the
   * same in every tile that holds it: interpolated over a coarse tile's corners
   * a site would thin or recolour at the swap, which is the one moment the
   * ranks exist to hide. Cached by corner, because every tile round a point
   * asks the same four.
   */
  const GROUND_LEVEL = SWARD_LEVEL + 1;
  interface GroundSample {
    density: number;
    r: number;
    g: number;
    b: number;
  }
  const groundSamples = new Map<string, GroundSample>();
  const sampleColour = new THREE.Color();
  const sampleDirection = new THREE.Vector3();
  function groundSample(a: number, b: number, root: number): GroundSample {
    const cells = cellsOf(root, GROUND_LEVEL);
    const column = ((b % cells) + cells) % cells;
    const key = `${a}|${column}|${root}`;
    const known = groundSamples.get(key);
    if (known !== undefined) return known;
    const lat = -90 + a * stepOf(GROUND_LEVEL);
    const lon = -180 + column * (360 / cells);
    const { x, y, z } = unitAt(lat, lon, sampleDirection);
    biomeAt(x, y, z, lat, lon, reliefAt(x, y, z), sample);
    groundColorAt(world, sampleDirection, sampleColour);
    const made = { density: BIOMES[sample.id].sward, r: sampleColour.r, g: sampleColour.g, b: sampleColour.b };
    if (groundSamples.size > 40_000) groundSamples.clear();
    groundSamples.set(key, made);
    return made;
  }
  const groundHere: GroundSample = { density: 0, r: 0, g: 0, b: 0 };
  function groundAt(lat: number, lon: number): GroundSample {
    const step = stepOf(GROUND_LEVEL);
    const rowAt = (lat + 90) / step;
    const a = Math.floor(rowAt);
    const root = rootOf(a, GROUND_LEVEL);
    const cells = cellsOf(root, GROUND_LEVEL);
    const columnAt = (lon + 180) / (360 / cells);
    const b = Math.floor(columnAt);
    const u = columnAt - b;
    const v = rowAt - a;
    const s00 = groundSample(a, b, root);
    const s10 = groundSample(a, b + 1, root);
    const s01 = groundSample(a + 1, b, root);
    const s11 = groundSample(a + 1, b + 1, root);
    for (const channel of ['density', 'r', 'g', 'b'] as const) {
      groundHere[channel] = (s00[channel] * (1 - u) + s10[channel] * u) * (1 - v) + (s01[channel] * (1 - u) + s11[channel] * u) * v;
    }
    return groundHere;
  }

  // ------------------------------------------------------------------
  // Sowing one tile
  // ------------------------------------------------------------------

  const faceUp = new THREE.Vector3();
  const siteDirection = new THREE.Vector3();
  const clumpNorth = new THREE.Vector3();
  const clumpAcross = new THREE.Vector3();
  const clumpBasis = new THREE.Matrix4();
  const clumpLocal = new THREE.Matrix4();
  const tint = new THREE.Color();
  const inverseRotation = new THREE.Matrix3();
  interface Square {
    ux: number; uy: number; uz: number;
    ax: number; ay: number; az: number;
    nx: number; ny: number; nz: number;
    /** Half the square, and half the square with its edge slope, as angles. */
    inner: number;
    outer: number;
  }
  const squares: Square[] = [];

  interface Sown {
    clump: SwardClump;
    matrix: number[];
    nx: number;
    ny: number;
    nz: number;
    r: number;
    g: number;
    b: number;
    rank: number;
  }

  /** Builds one sward tile, or `null` when nothing grows on it. */
  function sow(tile: Tile): SwardTile | null {
    if (land === undefined || !frameTile(tile)) return null;
    inverseRotation.setFromMatrix4(tileInverse);
    const refused = stats.sward.refused;

    // The tile's share of the planet's lattice: the same rows and columns at
    // every level, `stride` finest sites apart. See `SWARD_LEVEL`.
    const rank = tile.level - SWARD_TILE;
    const stride = 2 ** rank;
    const per = 2 ** (SWARD_TILE - SWARD_LEVEL);
    const root = rootOf(tile.row, tile.level);
    const rows = per * Math.max(1, Math.round((stepOf(SWARD_LEVEL) * UNITS_PER_DEGREE) / SWARD_PITCH));
    const bandLat = -90 + (root + 0.5) * ROOT_STEP;
    const columns = per * Math.max(
      1,
      Math.round(((360 / cellsOf(root, SWARD_LEVEL)) * Math.cos(bandLat * DEG) * UNITS_PER_DEGREE) / SWARD_PITCH),
    );
    const step = stepOf(tile.level);
    const lonStep = 360 / cellsOf(root, tile.level);
    const south = -90 + tile.row * step;
    const west = -180 + tile.column * lonStep;

    gatherKeepouts(tile);
    // A town's square in its own frame: the axes once a tile, not once a clump.
    squares.length = 0;
    for (const keepout of keepouts) {
      const half = builtHalf[keepout.index]!;
      if (half <= 0) continue;
      const i = keepout.index * 3;
      scratch.set(builtUnit[i]!, builtUnit[i + 1]!, builtUnit[i + 2]!);
      clumpNorth.set(0, 1, 0).projectOnPlane(scratch).normalize();
      clumpAcross.crossVectors(scratch, clumpNorth).normalize();
      squares.push({
        ux: scratch.x, uy: scratch.y, uz: scratch.z,
        ax: clumpAcross.x, ay: clumpAcross.y, az: clumpAcross.z,
        nx: clumpNorth.x, ny: clumpNorth.y, nz: clumpNorth.z,
        inner: half / PLANET_RADIUS,
        outer: (half + EDGE_RUN + 1) / PLANET_RADIUS,
      });
    }

    const sown: Sown[] = [];
    let vertices = 0;

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < columns; i++) {
        const J = (tile.row * rows + j) * stride;
        const I = (tile.column * columns + i) * stride;
        const siteRank = Math.min(halvings(J, SWARD_RANKS - 1), halvings(I, SWARD_RANKS - 1));
        // Every draw in a fixed order, before anything can refuse the site.
        const rng = rngFrom('sward', J, I);
        const strayNorth = rng.jitter() * SWARD_PITCH * SWARD_JITTER;
        const strayEast = rng.jitter() * SWARD_PITCH * SWARD_JITTER;
        const flower = rng.chance(SWARD_FLOWER_SHARE);
        const pick = rng.weighted(grassWeights);
        const petal = rng.int(SWARD_FLOWERS.length);
        const size = rng.unit();
        const yaw = rng.unit() * Math.PI * 2;
        const shade = rng.range(0.9, 1.1);
        const thinning = rng.unit();

        const baseLat = south + (j * step) / rows;
        const lat = baseLat + strayNorth / UNITS_PER_DEGREE;
        const lon = west + (i * lonStep) / columns + strayEast / (UNITS_PER_DEGREE * Math.cos(baseLat * DEG));
        const ground = groundAt(lat, lon);
        if (thinning >= ground.density) {
          refused.thin++;
          continue;
        }
        const direction = unitAt(lat, lon, siteDirection);
        // The shore ramp is the one place the relief is under the shelf, and it
        // is sand.
        if (reliefAt(direction.x, direction.y, direction.z) < 0) {
          refused.shore++;
          continue;
        }

        // What is built keeps it out: a monument, a carriageway.
        const x = direction.dot(across) * PLANET_RADIUS;
        const z = direction.dot(north) * PLANET_RADIUS;
        let blocked = false;
        for (const keepout of keepouts) {
          if (builtHalf[keepout.index]! > 0) continue;
          const dx = x - keepout.x;
          const dz = z - keepout.z;
          if (dx * dx + dz * dz < keepout.radius * keepout.radius) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          refused.built++;
          continue;
        }
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
          const clear = road.clearance + 0.8;
          if (ox * ox + oz * oz < clear * clear) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          refused.road++;
          continue;
        }
        let radius = land.radiusAt(direction, faceUp);
        if (radius === null) {
          refused.unprobed++;
          continue;
        }
        // And a town answers for its own square and the slope round it: its
        // lawns, and the land wherever no floor of it stands.
        for (const square of squares) {
          const offAcross = Math.abs(direction.x * square.ax + direction.y * square.ay + direction.z * square.az);
          const offNorth = Math.abs(direction.x * square.nx + direction.y * square.ny + direction.z * square.nz);
          if (offAcross >= square.outer || offNorth >= square.outer) continue;
          const ground = radius;
          radius = lawns === undefined ? null : lawns.swardAt(direction, ground, LAWN_MARGIN);
          if (radius !== null && radius !== ground) faceUp.set(square.ux, square.uy, square.uz);
          break;
        }
        if (radius === null) {
          refused.built++;
          continue;
        }

        const grass = SWARD_GRASS[pick]!;
        const bloom = flower && ground.density >= 0.6;
        const clump = bloom ? clumpOf(SWARD_FLOWERS[petal]!) : clumpOf(siteRank >= 1 ? grass.far : grass.id);
        const [short, tall] = bloom ? SWARD_FLOWER_HEIGHT : grass.height;
        const height = short + (tall - short) * size;

        // Stood on the face, turned about it.
        clumpNorth.set(0, 1, 0).projectOnPlane(faceUp);
        if (clumpNorth.lengthSq() < 1e-8) clumpNorth.set(1, 0, 0).projectOnPlane(faceUp);
        clumpNorth.normalize();
        clumpAcross.crossVectors(faceUp, clumpNorth).normalize();
        clumpBasis.makeBasis(clumpAcross, faceUp, clumpNorth);
        quaternion.setFromRotationMatrix(clumpBasis);
        quaternion.multiply(spin.setFromAxisAngle(AXIS_Y, yaw));
        scaleVector.setScalar(height);
        world4.compose(scratch.copy(direction).multiplyScalar(radius - SWARD_BURY), quaternion, scaleVector);
        clumpLocal.multiplyMatrices(tileInverse, world4);
        faceUp.applyMatrix3(inverseRotation).normalize();
        sown.push({
          clump,
          matrix: clumpLocal.elements.slice(),
          nx: faceUp.x,
          ny: faceUp.y,
          nz: faceUp.z,
          r: ground.r * shade,
          g: ground.g * shade,
          b: ground.b * shade,
          rank: siteRank,
        });
        vertices += clump.triangles * 3;
      }
    }
    if (sown.length === 0) return null;

    const position = new Float32Array(vertices * 3);
    const normal = new Int8Array(vertices * 3);
    const color = new Uint8Array(vertices * 3);
    const rootAttribute = new Float32Array(vertices * 4);
    let cursor = 0;
    for (const item of sown) {
      const e = item.matrix;
      const source = item.clump;
      const nx = Math.round(item.nx * 127);
      const ny = Math.round(item.ny * 127);
      const nz = Math.round(item.nz * 127);
      for (let v = 0; v < source.rise.length; v++) {
        const x = source.position[v * 3]!;
        const y = source.position[v * 3 + 1]!;
        const z = source.position[v * 3 + 2]!;
        const o = cursor * 3;
        position[o] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
        position[o + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
        position[o + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
        rootAttribute[cursor * 4] = e[12]!;
        rootAttribute[cursor * 4 + 1] = e[13]!;
        rootAttribute[cursor * 4 + 2] = e[14]!;
        rootAttribute[cursor * 4 + 3] = item.rank;
        normal[o] = nx;
        normal[o + 1] = ny;
        normal[o + 2] = nz;
        if (source.paint[v * 3]! < 0) {
          const rise = source.rise[v]!;
          tint.setRGB(item.r, item.g, item.b).multiplyScalar(SWARD_ROOT + (SWARD_TIP - SWARD_ROOT) * rise);
          const grey = (tint.r + tint.g + tint.b) / 3;
          const saturation = 1 + (SWARD_TIP_SATURATION - 1) * rise;
          tint.setRGB(grey + (tint.r - grey) * saturation, grey + (tint.g - grey) * saturation, grey + (tint.b - grey) * saturation);
        } else tint.setRGB(source.paint[v * 3]!, source.paint[v * 3 + 1]!, source.paint[v * 3 + 2]!);
        color[o] = Math.round(Math.min(1, Math.max(0, tint.r)) * 255);
        color[o + 1] = Math.round(Math.min(1, Math.max(0, tint.g)) * 255);
        color[o + 2] = Math.round(Math.min(1, Math.max(0, tint.b)) * 255);
        cursor++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
    geometry.setAttribute('root', new THREE.BufferAttribute(rootAttribute, 4));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, swardPaint);
    mesh.name = `sward:${tile.key}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.position.copy(origin);
    mesh.quaternion.setFromRotationMatrix(tileBasis);
    return {
      mesh,
      triangles: vertices / 3,
      clumps: sown.length,
      // 12 of position, 3 of normal, 3 of colour, 16 of root and rank.
      bytes: vertices * 34,
      direction: tile.direction.clone(),
      radius: Math.hypot(tile.halfEast, tile.halfNorth),
      touchesTown: squares.length > 0,
      level: tile.level,
      row: tile.row,
      column: tile.column,
      shown: false,
      stale: false,
    };
  }

  // ------------------------------------------------------------------
  // Which tiles: finer towards the camera
  // ------------------------------------------------------------------

  function dropSward(key: string): void {
    const entry = swardStanding.get(key);
    if (entry === undefined) return;
    releaseSward(entry);
    swardStanding.delete(key);
  }

  function releaseSward(entry: SwardTile): void {
    if (entry.shown) swardGroup.remove(entry.mesh);
    entry.mesh.geometry.dispose();
  }

  /** Out of the standing set, and drawn until `settleSward` lets it go. */
  function retireSward(key: string, stale: boolean): void {
    const entry = swardStanding.get(key);
    if (entry === undefined) return;
    swardStanding.delete(key);
    if (!entry.shown) {
      releaseSward(entry);
      return;
    }
    entry.stale = stale;
    // A tile already retiring under the same key is the older of the two.
    const older = swardRetiring.get(key);
    if (older !== undefined) releaseSward(older);
    swardRetiring.set(key, entry);
  }

  function settleSward(): void {
    for (const [key, old] of swardRetiring) {
      let covered = true;
      for (const tile of swardWanted) {
        if (!overlaps(old, tile)) continue;
        if (swardStanding.has(tile.key) || swardBarren.has(tile.key) || swardHollow.has(tile.key)) continue;
        covered = false;
        break;
      }
      if (!covered) continue;
      releaseSward(old);
      swardRetiring.delete(key);
    }
    for (const entry of swardStanding.values()) {
      if (entry.shown) continue;
      let held = false;
      for (const old of swardRetiring.values()) {
        if (overlaps(old, entry)) {
          held = true;
          break;
        }
      }
      if (held) continue;
      swardGroup.add(entry.mesh);
      entry.shown = true;
    }
  }

  const eyeDirection = new THREE.Vector3();
  /** Where the camera is, a frame at a time; `updateSward` reads it into this. */
  const swardEye = new THREE.Vector3();
  /** The camera's height over the ground at the last sward scan. */
  let swardHeight = Infinity;
  /**
   * How far above the sward's last band the land index is still gathered, in
   * units. A gather is eight frames (`SLICE` faces of the land's 2.18 M a
   * frame), so this only has to outlast the descent of eight frames, and a
   * margin of the probe's own `MOVE` does.
   */
  const SWARD_PREPARE_MARGIN = 400;

  /**
   * The tiles the sward wants, from the coarsest level down: a tile splits
   * while the nearest of it is close enough that a rank it lacks is still
   * standing there. The distance is the camera's, along the ground and up to
   * it, which is what the vertex stage measures.
   */
  function swardTiles(eye: THREE.Vector3, height: number, reach: number): Tile[] {
    const out: Tile[] = [];
    eyeDirection.copy(eye).normalize();
    const eyeRadius = eye.length();
    const far = SWARD_BANDS[SWARD_BANDS.length - 1]! * reach;
    if (height >= far) return out;
    const top = SWARD_TILE + SWARD_RANKS - 1;
    const descend = (tile: Tile): void => {
      const along = tile.direction.distanceTo(eyeDirection) * eyeRadius;
      const nearest = Math.max(0, along - Math.hypot(tile.halfEast, tile.halfNorth));
      const slant = Math.hypot(nearest, height);
      if (slant >= far) return;
      const k = tile.level - SWARD_TILE;
      if (k > 0 && swardLod(slant, reach) < k) {
        for (let dr = 0; dr < 2; dr++) {
          for (let dc = 0; dc < 2; dc++) descend(tileAt(tile.level - 1, tile.row * 2 + dr, tile.column * 2 + dc, eye));
        }
        return;
      }
      tile.distance = along;
      out.push(tile);
    };
    const step = stepOf(top);
    const lat = latOf(eyeDirection.y);
    const lon = lonOf(eyeDirection.x, eyeDirection.z);
    const span = (far + spanOf(top)) / UNITS_PER_DEGREE;
    const first = Math.max(0, Math.floor((lat - span + 90) / step));
    const last = Math.min(rowsOf(top) - 1, Math.floor((lat + span + 90) / step));
    for (let row = first; row <= last; row++) {
      const rowLat = -90 + (row + 0.5) * step;
      const lonStep = 360 / cellsOf(rootOf(row, top), top);
      const spread = Math.min(180, span / Math.max(Math.cos(rowLat * DEG), 1e-3));
      const from = Math.floor((lon - spread + 180) / lonStep);
      const to = Math.floor((lon + spread + 180) / lonStep);
      for (let column = from; column <= to; column++) descend(tileAt(top, row, column, eye));
    }
    return out;
  }

  function updateSward(viewer: THREE.Vector3, camera: THREE.Camera | undefined): void {
    const swardStats = stats.sward;
    if (land === undefined || camera === undefined) return;
    const reach = swardReach();
    swardUniforms.swardReach.value = reach;
    let rescan = false;
    if (swardProminence !== prominenceVersion()) {
      swardProminence = prominenceVersion();
      for (const key of [...swardStanding.keys()]) dropSward(key);
      for (const old of swardRetiring.values()) releaseSward(old);
      swardRetiring.clear();
      swardBarren.clear();
      swardHollow.clear();
      rescan = true;
    }
    if (swardDetail !== detailVersion()) {
      swardDetail = detailVersion();
      rescan = true;
    }
    // A town whose floor arrived or went: its lawns did too, so every tile its
    // square reaches is sown again.
    if (lawns !== undefined) {
      const version = lawns.floorChanges(floorsSeen, floorChanges);
      if (version !== floorsSeen) {
        floorsSeen = version;
        rescan = true;
        swardHollow.clear();
        for (const [key, entry] of [...swardStanding]) {
          if (!entry.touchesTown) continue;
          let touched = floorChanges[0] === -1;
          for (let c = 0; !touched && c + 3 < floorChanges.length; c += 4) {
            const dot = entry.direction.x * floorChanges[c]! + entry.direction.y * floorChanges[c + 1]! + entry.direction.z * floorChanges[c + 2]!;
            touched = dot > Math.cos((entry.radius + floorChanges[c + 3]!) / PLANET_RADIUS);
          }
          // Sown again, and drawn as it was until the new one stands.
          if (touched) retireSward(key, true);
        }
      }
    }

    const eye = camera.getWorldPosition(swardEye);

    if (rescan || eye.distanceToSquared(swardScannedAt) > SWARD_RESCAN * SWARD_RESCAN) {
      swardScannedAt.copy(eye);
      // Over the ground under the camera, not over the sea: a valley in the
      // Alps is six hundred units above it.
      eyeDirection.copy(eye).normalize();
      const height = Math.max(0, eye.length() - groundRadius(world, eyeDirection));
      swardHeight = height;
      if (swardBarren.size > BARREN_CAP) swardBarren.clear();
      if (swardHollow.size > BARREN_CAP) swardHollow.clear();
      const wanted = swardTiles(eye, height, reach);
      const keep = new Set(wanted.map((tile) => tile.key));
      for (const key of [...swardStanding.keys()]) if (!keep.has(key)) retireSward(key, false);
      // A tile retired by the scan and wanted again is simply standing again;
      // one retired by its floor is not, because what it grew on has changed.
      for (const tile of wanted) {
        const back = swardRetiring.get(tile.key);
        if (back === undefined || back.stale) continue;
        swardRetiring.delete(tile.key);
        swardStanding.set(tile.key, back);
      }
      swardWanted = wanted;
      swardQueue = wanted
        .filter((tile) => !swardStanding.has(tile.key) && !swardBarren.has(tile.key) && !swardHollow.has(tile.key))
        .sort((a, b) => a.distance - b.distance);
    }

    // **The land index only while the sward can be drawn.** Gathering it is a
    // pass over all 2.18 M faces of the land, a slice a frame, and it starts
    // again every 400 units the player moves — so in the plane, where no sward
    // stands above the last band, it never stopped. It starts again a margin
    // above that band, so a descent finds it ready.
    const far = SWARD_BANDS[SWARD_BANDS.length - 1]! * reach;
    const ready = swardHeight < far + SWARD_PREPARE_MARGIN && land.prepare(viewer);
    swardStats.ready = ready;

    let triangles = 0;
    for (const entry of swardStanding.values()) triangles += entry.triangles;
    if (ready && swardQueue.length > 0) {
      const began = performance.now();
      const allowance = detailBuild(SWARD_BUILD_MS);
      const cap = SWARD_TRIANGLES * reach * reach;
      let built = 0;
      // One a frame whatever the slice says, so the sward always moves — but
      // only while the frame has room; see `mayBuild` in `view.ts`.
      while (swardQueue.length > 0 && triangles < cap && (built === 0 ? frameOpenFor(0, true) : mayBuild(began, allowance, true))) {
        const tile = swardQueue.shift()!;
        if (swardStanding.has(tile.key)) continue;
        const sowing = performance.now();
        const result = sow(tile);
        const took = performance.now() - sowing;
        swardTimes.push(took);
        if (swardTimes.length > 200) swardTimes.shift();
        const sorted = [...swardTimes].sort((a, b) => a - b);
        swardStats.slowestTileMs = Math.max(swardStats.slowestTileMs, Number(took.toFixed(2)));
        swardStats.medianTileMs = Number(sorted[Math.floor(sorted.length / 2)]!.toFixed(2));
        swardStats.p90TileMs = Number(sorted[Math.floor(sorted.length * 0.9)]!.toFixed(2));
        built++;
        if (result === null) {
          // A tile a town reaches into is empty only until its lawns arrive.
          if (squares.length === 0) swardBarren.add(tile.key);
          else swardHollow.add(tile.key);
          continue;
        }
        // Into the group by `settleSward`, once nothing retiring covers it.
        swardStanding.set(tile.key, result);
        triangles += result.triangles;
      }
      swardStats.lastBuildMs = Number((performance.now() - began).toFixed(2));
    }
    settleSward();

    let clumpCount = 0;
    let bytes = 0;
    // The stats' own array, refilled: this runs every frame.
    const byRank = swardStats.byRank;
    byRank.length = SWARD_RANKS;
    byRank.fill(0);
    for (const entry of swardStanding.values()) {
      clumpCount += entry.clumps;
      bytes += entry.bytes;
      byRank[entry.level - SWARD_TILE]!++;
    }
    swardStats.tiles = swardStanding.size;
    swardStats.retiring = swardRetiring.size;
    swardStats.staged = 0;
    for (const entry of swardStanding.values()) if (!entry.shown) swardStats.staged++;
    swardStats.clumps = clumpCount;
    swardStats.triangles = triangles;
    swardStats.megabytes = Number((bytes / 1048576).toFixed(1));
    swardStats.pending = swardQueue.length;
    swardStats.barren = swardBarren.size;
    swardStats.reach = Number(reach.toFixed(2));
  }

  /**
   * Builds from the head of the queue while the frame allows: the near tiles
   * only, or everything left. The queue is nearest first, so the near pass
   * stops at the first far tile. Returns how many it built.
   */
  function buildTiles(began: number, nearOnly: boolean): number {
    const budget = triangleBudget();
    const allowance = detailBuild(BUILD_BUDGET_MS);
    let built = 0;
    while (queue.length > 0) {
      const tile = queue[0]!;
      const near = tile.distance - Math.hypot(tile.halfEast, tile.halfNorth) < NEAR_BUILD;
      if (nearOnly && !near) break;
      if (!mayBuild(began, allowance, near)) break;
      queue.shift();
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
      // Into the group by `settle` once nothing retiring covers it.
      standing.set(tile.key, {
        mesh: result.mesh,
        triangles: result.triangles,
        plants: result.plants,
        bytes: result.bytes,
        level: tile.level,
        row: tile.row,
        column: tile.column,
        shown: false,
      });
      residentTriangles += result.triangles;
      residentByLevel[tile.level] = residentByLevel[tile.level]! + result.triangles;
      // The real cap. See `residentTriangles`.
      if (residentTriangles >= budget) {
        queue.length = 0;
        break;
      }
    }
    return built;
  }

  return {
    group,
    stats,
    missing,
    broken,
    proxies: () => [proxyOf(material), proxyOf(fadeTwin(material)), proxyOf(swardPaint)],

    update(viewer, altitude, camera) {
      fader.update();
      const range = rangeFor(altitude);
      stats.range = Math.round(range);
      stats.reach = Math.round(reachFor(altitude));
      cone.aim(camera);
      if (scannedProminence !== prominenceVersion()) {
        scannedProminence = prominenceVersion();
        for (const key of [...standing.keys()]) drop(key);
        for (const old of retiring.values()) release(old);
        retiring.clear();
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

      // Nearest first, in the frame's order (`mayBuild` in `view.ts`): the
      // wood you are standing in, then the grass under your feet, then the
      // wood on the hill out of what the frame has left for far work.
      const began = performance.now();
      let built = 0;
      built += buildTiles(began, true);
      const sowing = performance.now();
      updateSward(viewer, camera);
      // The sward has its own slice; the wood's is what the wood spent.
      const sown = performance.now() - sowing;
      built += buildTiles(began + sown, false);
      if (built > 0) {
        stats.lastBuildMs = Number((performance.now() - began - sown).toFixed(2));
        stats.built += built;
      }
      settle();

      let triangles = 0;
      let plants = 0;

      let bytes = 0;
      // The stats' own array, refilled: this runs every frame.
      const byLevel = stats.byLevel;
      byLevel.fill(0);
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
      stats.retiring = retiring.size;
      stats.staged = 0;
      for (const entry of standing.values()) if (!entry.shown) stats.staged++;
      stats.pending = queue.length;
      stats.nearPending = stats.sward.pending;
      for (const tile of queue) if (tile.distance - Math.hypot(tile.halfEast, tile.halfNorth) < NEAR_BUILD) stats.nearPending++;
      stats.triangles = triangles;
      stats.plants = plants;
      stats.megabytes = Number((bytes / 1048576).toFixed(1));
      stats.barren = barren.size;
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
    sampleSward(lat, lon) {
      const level = SWARD_TILE;
      const step = stepOf(level);
      const row = Math.min(rowsOf(level) - 1, Math.max(0, Math.floor((lat + 90) / step)));
      const cells = cellsOf(rootOf(row, level), level);
      const column = Math.floor((((lon + 180) % 360) / 360) * cells);
      const tile = tileAt(level, row, column, new THREE.Vector3());
      const before = { ...stats.sward.refused };
      const began = performance.now();
      const result = sow(tile);
      const ms = performance.now() - began;
      const after = stats.sward.refused;
      result?.mesh.geometry.dispose();
      const direction = unitAt(lat, lon, new THREE.Vector3());
      biomeAt(direction.x, direction.y, direction.z, lat, lon, reliefAt(direction.x, direction.y, direction.z), sample);
      return {
        tile: tile.key,
        biome: sample.id,
        density: groundAt(lat, lon).density,
        clumps: result?.clumps ?? 0,
        triangles: result?.triangles ?? 0,
        squares: squares.length,
        refused: Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - before[key as keyof typeof before]])),
        buildMs: Number(ms.toFixed(2)),
      };
    },

    verifySward(lat, lon) {
      const level = SWARD_TILE + 1;
      const step = stepOf(level);
      const row = Math.min(rowsOf(level) - 1, Math.max(0, Math.floor((lat + 90) / step)));
      const cells = cellsOf(rootOf(row, level), level);
      const column = Math.floor((((lon + 180) % 360) / 360) * cells);
      const roots = (tile: Tile, rank: number): number[][] => {
        const result = sow(tile);
        if (result === null) return [];
        result.mesh.updateMatrixWorld(true);
        const attribute = result.mesh.geometry.getAttribute('root');
        const found = new Map<string, number[]>();
        const point = new THREE.Vector3();
        for (let v = 0; v < attribute.count; v++) {
          if (attribute.getW(v) < rank) continue;
          point.set(attribute.getX(v), attribute.getY(v), attribute.getZ(v)).applyMatrix4(result.mesh.matrixWorld);
          found.set(`${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)}`, point.toArray());
        }
        result.mesh.geometry.dispose();
        return [...found.values()];
      };
      const parent = roots(tileAt(level, row, column, new THREE.Vector3()), 1);
      const children: number[][] = [];
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) children.push(...roots(tileAt(level - 1, row * 2 + dr, column * 2 + dc, new THREE.Vector3()), 1));
      }
      let worst = 0;
      let unmatched = 0;
      for (const a of parent) {
        let best = Infinity;
        for (const b of children) best = Math.min(best, Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!));
        if (best > 0.05) unmatched++;
        worst = Math.max(worst, best);
      }
      return { tile: `${level}/${row}/${column}`, parent: parent.length, children: children.length, unmatched, worstGap: Number(worst.toFixed(4)) };
    },

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
