import * as THREE from 'three';
import type { World } from './geo.ts';
import { LUSH_GLSL, PLANET_RADIUS, UNITS_PER_DEGREE, groundColorAt, groundRadius } from './globe.ts';
import { PLANT_SEATING, PROBE_SURE, drawnFootprint, landProbeOf } from './land-probe.ts';
import type { DrawnFootprint } from './land-probe.ts';
import { mergeMeshes } from './merge.ts';
import { proxyOf } from './warm.ts';
import { createFader, fadeTwin } from './fade.ts';
import { shadeByClouds } from './cloud-shade.ts';
import { MAX_SLOPE, gradeAt, reliefAt, shoreDistance } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { BIOMES, biomeAt, biomeSample } from './biome.ts';
import type { BiomeId } from './biome.ts';
import { createToonRamp } from './theme.ts';
import { CROWN_STRIDE, nearArrays, placeCrown } from './scenery/tree-forms.ts';
import type { LeafArrays } from './scenery/tree-forms.ts';
import { WIND_REACH, leafDepthMaterial, leafMaterial, woodDepthMaterial, woodMaterial } from './foliage.ts';
import type { MonumentContext } from './monuments/contract.ts';
import type { Placement } from './placement.ts';
import { isShown, prominenceVersion, radiusOf } from './places.ts';
import { townGrid } from './scenery/grid.ts';
import { EDGE_RUN } from './scenery/ground.ts';
import type { Place } from './places.ts';
import { roadClearance, roadGeometryFor, roadIndexFor } from './roads.ts';
import type { Road, RoadIndex } from './roads.ts';
import type { ParkedCar, Settlements } from './settlements.ts';
import type { FieldIndex, FieldKeepout, FleetSite } from './fleet.ts';
import { STRIP_LIFT, STRIP_MOWN, STRIP_REACH, STRIP_SWARD, onStrip, stripColor, stripCover } from './craft/airstrip.ts';
import {
  createViewCone,
  detailArea,
  detailBuild,
  mayBuild,
  NEAR_BUILD,
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
import { latOf, lonOf, toUnit, unitAt } from './sphere.ts';
import { planGap, planShape } from './landmark-ground.ts';
import type { PlanShape } from './landmark-ground.ts';
import { FIELD_CLEARANCE, LEVELS, MONUMENT_CLEARANCE, ROOT_STEP, WIDEST_FOOTPRINT, cellsOf, rootOf, rowsOf, stepOf } from './tile-grid.ts';
import { createCountryside } from './countryside.ts';
import { freeSpot, enclosed, pushOut, solidField } from './scenery/solids.ts';
import type { Solid, SolidField } from './scenery/solids.ts';
import { partShape, placeShape } from './scenery/occupancy.ts';
import type { BodyKind, PartShape } from './scenery/occupancy.ts';
import type { Countryside, CountrysideStats } from './countryside.ts';
import { BEACON_STRIDE, ROTOR_STRIDE, SMOKE_STRIDE, createCountryBuilder, strawOf } from './countryside-tile.ts';
import type { CountryBuilder, CountryFrame, CountryMachine, CountryMotionRows } from './countryside-tile.ts';
import { MACHINE_BED } from './craft/parked.ts';
import { VARNISH_GLSL } from './gloss.ts';

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

/** And the same in world units, which is what every distance decision uses. */
const spanOf = (level: number): number => stepOf(level) * UNITS_PER_DEGREE;

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


export function reachFor(altitude: number): number {
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
 * Since 2026-10-04 it is also where the knob stops: 2.7 M is `TRIANGLE_BUDGET`
 * at `DETAIL_MAX` (3, in `view.ts`), so the cap never binds under the top of
 * the slider and a setting the wood could not follow is not offered at all
 * (`pnpm reach` holds the two together). It was 2.6 M while the knob ran to
 * 6, where past about detail 4.5 the wood stopped reaching further.
 */
const MAX_TRIANGLES = 2_700_000;
const triangleBudget = (): number => Math.min(MAX_TRIANGLES, detailArea(TRIANGLE_BUDGET));
/** Whether the memory ceiling, rather than the knob, is deciding the budget now. For `pnpm reach`. */
export const budgetCapped = (): boolean => detailArea(TRIANGLE_BUDGET) > MAX_TRIANGLES;
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
// `WIDEST_FOOTPRINT`, `MONUMENT_CLEARANCE` and `FIELD_CLEARANCE` are
// `tile-grid.ts`'s, which the country's plan keeps off by too.

// How far a plant is bedded is `PLANT_SEATING`, in `land-probe.ts`: the
// trees round a town's edge are seated by the same rule.

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
  /** What it is to a body walking into it; absent, nothing. See `SOLID_LEVEL`. */
  solid?: BodyKind;
}

/**
 * **The two finest levels draw a tree as it is, and every coarser one as its
 * silhouette.** A tile at or under this level merges each tree's trunk and
 * limbs into its solid buffer and its leaf cards into a second, alpha-tested
 * one (`foliage.ts`), and both move with the wind; a coarser tile merges the
 * scenic part's own build — the trunk and a crown of smooth lumps coloured as
 * the cards average — into its one buffer, still, as every tile was before.
 * It is the two levels that cast shadows and that are solid (`SOLID_LEVEL`):
 * a level-0 tile reaches 400 units at the default detail and a level-1 tile
 * about twice that, past which a card is a few pixels and the lump is what it
 * reads as anyway. One draw call more a near tile, and the leaves' own
 * shadow pass.
 *
 * **The budget prices a near tile as its lumps** (`Built.priced`). The cards
 * cost more — measured 2026-09-28 headless at the knob's starting 0.5, the
 * streamed field on foot 39,790 triangles against 28,890 in lumps in a
 * Bavarian wood and 204,340 against 70,960 in a Finnish taiga, where a
 * conifer's boughs and dark core are about 440 triangles against its ragged
 * cones' 110 — and priced at the cards' cost, the taiga's level-0 ring came
 * out tiles short of what it had in lumps: a hole in the wood round the
 * player, bought with leaves. Priced as lumps, the near field is exactly
 * the ground it was, and the cards are what it costs on top: memory and
 * triangles in the two finest levels only, which `stats.triangles` counts.
 */
const CARD_LEVEL = 1;


/** What a near tile draws of a tree: its wood as a flat variant, and its cards. */
interface NearVariant {
  wood: FlatVariant;
  leaves: LeafArrays;
}

/**
 * What of the kit a body cannot walk through: a tree's trunk, a boulder, and
 * a building — a farmhouse is a region's own dwelling. A shrub, a tuft and
 * the grass are walked through.
 */
function bodyOf(entry: ScenicPart): BodyKind | undefined {
  if (entry.kind === 'tree') return 'trunk';
  if (entry.id === 'boulder') return 'boulder';
  if (entry.kind === 'dwelling' || entry.kind === 'civic' || entry.kind === 'block') return 'walls';
  return undefined;
}

/**
 * **The two finest levels are solid, and nothing coarser.** A level-0 tile
 * reaches 400 units at the default detail and the player always stands in
 * one once the streamer has caught up; a level-1 tile is what covers the
 * ground in the frames before it has, after a jump or a spawn. What a coarser
 * tile holds is never within reach of a foot.
 */
const SOLID_LEVEL = 1;
/** Past a tile's half-diagonal, how far a query may still reach into its solids. */
const SOLID_MARGIN = 20;

/** A tile's solids, in its own tangent frame, and the frame. */
interface TileWalls {
  field: SolidField;
  /** What `field` was made of, for a vehicle taken to take its own out (`hideParked`). */
  solids: Solid[];
  across: THREE.Vector3;
  north: THREE.Vector3;
  up: THREE.Vector3;
  /** `up . direction` over this and a point may be near enough to meet a solid. */
  cosBound: number;
}

/**
 * A vehicle standing in a tile that the fleet can take (a farm's tractor),
 * and where it is in the tile's buffer and walls: folded away and taken out
 * of them when it is taken (`hideParked`), as a town's parked car is.
 */
interface TileMachine extends ParkedCar {
  start: number;
  count: number;
  solids: Solid[];
  hidden: boolean;
}

// ---------------------------------------------------------------------------
// The grass's ground
// ---------------------------------------------------------------------------

/**
 * What grows under your feet, answered a point at a time for `grass.ts`.
 *
 * The blades themselves are drawn there, from a field of this answer baked
 * round the camera; **whether grass grows at a point, how thick, in what colour
 * and on what surface is decided here and nowhere else**, because it is the
 * same set of refusals the wood's plots answer to — the biome, the shore, a
 * monument, a carriageway and its verge, a field of the countryside, a town's
 * paving — and a second copy of them in the grass would be a lawn across a
 * road the day one of them moved. Until 2026-09-28 the same rules sowed the
 * sward, a streamer of baked clump models on tiles of their own, which read as
 * tufts on a bare field; the rules are unchanged, the thing that obeys them is
 * a carpet of blades.
 *
 * **It is the one thing on the land that `MAX_SLOPE` does not refuse** (since
 * 2026-09-17). A slope rule is about what stands — a trunk, a hoof, a wheel, a
 * wall — and grass stands on nothing; it is the colour of the hill with a
 * grain to it, and a hill drawn green and bare above thirty degrees read as a
 * hill with a bald flank. It stops only where the land probe does, at a face
 * too near vertical to have a top, and it **stands on the drawn land**
 * (`LandProbe`), because the relief is not what is drawn to within a blade's
 * own height.
 */
export interface GrassSite {
  /** The surface it grows on, as a distance from the planet's centre: the drawn land, or a town's lawn. */
  radius: number;
  /** How thick, 0 to 1: the biome's `sward`, laid between the lattice's corners. */
  density: number;
  /** The linear colour it grows from: the ground's (`groundColorAt`), or the crop's in a field of straw. */
  r: number;
  g: number;
  b: number;
  /** How dry, 0 green to 1 straw: the biome's (`DRY_OF`), or `STRAW_DRY` in a field of it. */
  dry: number;
  /**
   * How tall it stands, of what the field grows: 1, `STRIP_MOWN` on an
   * airstrip, and less round what the countryside has worn it down with
   * (`Countryside.trodden`).
   */
  height: number;
}

/** The questions `grass.ts` asks; `Vegetation.grass`, null without the drawn land. */
export interface GrassGround {
  /** Whether the drawn land is gathered along `direction` (a unit vector), so an `at` there is an answer. */
  covers(direction: THREE.Vector3): boolean;
  /**
   * Gathers what is built within `reach` units of `direction` — monuments,
   * towns' squares, carriageways — for the `at`s that follow. Into lists of
   * its own, so a tile the wood builds in between is not disturbed.
   */
  gather(direction: THREE.Vector3, reach: number): void;
  /**
   * The grass at `direction`, inside the last `gather`: the ground it stands
   * on, at no density where the ground goes on bare (sand, a verge, a paddy),
   * or null where there is no ground for it (the sea, a town's paving). `spread` (units) widens every keep-off of a made surface — a
   * carriageway's verge, a town's streets, walls and risers — by that much:
   * the field asks at its texels and lays a blade up to half a texel past the
   * last one that grows (`grass.ts`), so it asks with half a texel here.
   */
  at(direction: THREE.Vector3, out: GrassSite, spread?: number): GrassSite | null;
  /** `settlements.floorChanges`, passed through: a lawn arrives and goes with its town's floor. */
  floorChanges(since: number, into: number[]): number;
  /** Moves when every answer may have: the prominence knob, which builds and unbuilds towns. */
  version(): number;
}

/** How far a lawn in a town keeps off its streets and its walls. */
const LAWN_MARGIN = 0.6;
/** Units past an airstrip's drawn edge the grass is mown: about a blade's lean, so no tall one stands over the strip's rim. */
const STRIP_GRASS_MARGIN = 0.8;
/** The width of an airstrip's rim, where the grass has no ground, in texels of the field asking: a diagonal and a little. */
const STRIP_RIM = 1.5;
/** Units past the worn track and the threshold's boards the grass keeps off: a mown blade's lean and a little. */
const STRIP_BARE_MARGIN = 0.3;
/** How dry the mown grass is at the least: cut and left in the sun, a yellower green than the field's. */
const MOWN_DRY = 0.3;
/**
 * Trodden grass round a camp's fire, a tent or a barn door (`Countryside.trodden`)
 * is thinner and drier as well as shorter: at the bare edge it has lost this
 * share of its blades and gone this far to straw.
 */
const WORN_THIN = 0.5;
const WORN_DRY = 0.6;
/**
 * How dry each biome's grass is, 0 green to 1 straw: the steppe and the
 * savanna are the dry grasslands, the tundra's is thin and brown by August.
 * A colour the grass takes toward, not the ground's colour, which it keeps.
 */
const DRY_OF: Readonly<Record<BiomeId, number>> = {
  ice: 0.3,
  tundra: 0.35,
  boreal: 0.05,
  temperate: 0,
  grassland: 0.15,
  steppe: 0.75,
  savanna: 0.85,
  desert: 1,
  tropical: 0,
  rock: 0.3,
};
/** A field of straw's grass: the crop's colour, most of the way to dry. */
const STRAW_DRY = 0.75;
/**
 * The ground's colour and the biome's `sward` are sampled on a lattice of
 * their own, this quadtree level (`tile-grid.ts`, about 43 units a step), and
 * laid between its corners: a biome's edge is a blend a few steps wide rather
 * than a line, and every corner is asked once however many texels share it.
 */
const GROUND_LEVEL = -2;
/**
 * How high over the ground the camera may be and the drawn land still be
 * gathered round the viewer: the grass's widest ring (237 units at its best,
 * `grass.ts`) and the land probe's own `MOVE` (400) with room to spare, so a
 * descent finds the index ready.
 * Gathering it is a pass over the whole land mesh a slice a frame, again every
 * 400 units moved, and at cruise that is work for nothing.
 */
const LAND_PREPARE_HEIGHT = 900;

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export interface VegetationStats {
  /** Tiles standing in the world right now. */
  tiles: number;
  /** Wanted, and waiting for a frame with room to build them. */
  pending: number;
  /**
   * Of those, the ones within `NEAR_BUILD` of the viewer: the ground you are
   * standing on. `main.ts` holds the arrival curtain until it is zero.
   */
  nearPending: number;
  /** Plants standing. */
  plants: number;
  /**
   * Leaf cards standing (`CARD_LEVEL`), and whether a finest tile of them is
   * drawn: the wood round the player is moving in the wind, and the shadow
   * map is redrawn every frame while it is, or the shadows would step.
   */
  cards: number;
  swaying: boolean;
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
  /**
   * The countryside between the towns (`countryside.ts`): the plans worked out
   * and what refused them, and what the standing tiles hold of them — pieces,
   * fields, fences, and what turns, shines and smokes.
   */
  country: CountrysideStats & {
    pieces: number;
    fields: number;
    fences: number;
    rotors: number;
    beacons: number;
    smokes: number;
    /** Near tiles waiting for the drawn land to lay their fields on. */
    provisional: number;
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
  /** What one tile costs and what is standing on it, for the console. */
  sample(lat: number, lon: number, level?: number): unknown;
  /** Whether grass grows at a point and on what, for `grass.ts`; null without the drawn land. */
  grass: GrassGround | null;
  /**
   * The tile over a point at a level, built as the streamer builds it and
   * handed over placed, or null if nothing grows there; the caller disposes
   * its geometry. For the headless checks, which ask where plants stand.
   */
  raiseTile(lat: number, lon: number, level?: number): THREE.Mesh | null;
  /** The countryside's planner, for the console: `plan`, `planAt`, `find`. Null without the places. */
  countryside: Countryside | null;
  /**
   * The trunks, boulders and farm buildings of the drawn tiles near a point
   * as walls: `settlements.collide`'s contract, the displacement along the
   * ground in `push`.
   */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** `settlements.freeSpotNear`'s contract, against the same solids. */
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /** Whether a point is inside a farm building and under its roof. For the camera. */
  blocksSight(point: THREE.Vector3): boolean;
  /**
   * The vehicles the countryside stands in the drawn tiles within `radius` of
   * `viewer` (a farm's tractor) that can be taken and have not been, in the
   * world. Appends to `out`. See `ParkedCar` in `settlements.ts`.
   */
  parkedNear(viewer: THREE.Vector3, radius: number, out: ParkedCar[]): void;
  /**
   * One of them has been taken: folded out of every tile that draws it, and
   * its wall down. Idempotent, and nothing where no tile stands with it.
   */
  hideParked(id: string): void;
  /** Whether one has been taken, asked by every tile built; until set, nothing has. */
  setParkedTaken(test: (id: string) => boolean): void;
  /**
   * The crowns of the drawn near tiles within `range` units of `point`, as
   * `(list, offset)` into a flat list of `CROWN_STRIDE` floats each: world
   * middle, radius, half height, linear colour, what the species sheds
   * (`placeCrown`). What the falling leaves and the litter under a tree are
   * laid from (`ambient.ts`).
   */
  crownsNear(point: THREE.Vector3, range: number, visit: (list: Float32Array, offset: number) => void): void;
  /**
   * Every drawn tile's rotors, lamps and fires, for `countryside-motion.ts`.
   * Only drawn tiles: a staged one is not on the screen, and a retiring one
   * is, until the tile that replaces it is.
   */
  motion(visit: (rows: CountryMotionRows) => void): void;
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
  // The leaves take the land's own painted green (`atlasLush`), so a wood is
  // the colour of the meadow it stands in rather than a paler swatch over it.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${LUSH_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = atlasLush(diffuseColor.rgb);');
  };
  material.customProgramCacheKey = () => 'atlas-foliage';
  // Before `woodMaterial` and `machineWood` chain it, and `fadeTwin` clones it.
  return shadeByClouds(material);
}

/**
 * A near tile's wood material, taught its vehicles (`TileMachine`): a vertex
 * whose wind carries `MACHINE_BED` in its third byte keeps its colour rather
 * than the land's green (`atlasLush`) and takes the craft's varnish
 * (`craftMaterial`), so a farm's tractor is drawn as the one driven off.
 * Only a near tile carries the wind, and only a near tile is where a tractor
 * is taken from.
 */
function machineWood(material: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
  const inner = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    inner(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAtlasMachine;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  vAtlasMachine = step(${((MACHINE_BED - 0.5) / 255).toFixed(4)}, aWind.z);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAtlasMachine;')
      .replace('diffuseColor.rgb = atlasLush(diffuseColor.rgb);', 'if (vAtlasMachine < 0.5) diffuseColor.rgb = atlasLush(diffuseColor.rgb);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n  if (vAtlasMachine > 0.5) ${VARNISH_GLSL}`);
  };
  material.customProgramCacheKey = () => `${key}|machine`;
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
  /** What the budget counts it as; see `CARD_LEVEL`. */
  priced: number;
  /** Its leaf cards, a child of `mesh`, dissolving with it; null past `CARD_LEVEL`. */
  leaves: THREE.Mesh | null;
  triangles: number;
  plants: number;
  bytes: number;
  /** The countryside's pieces, fields and fences in it (`countryside-tile.ts`). */
  pieces: number;
  fields: number;
  fences: number;
  /** What in it turns, shines or smokes, for `countryside-motion.ts`; null for nothing. */
  motion: CountryMotionRows | null;
  /** In the group and drawn. False while it waits for what it replaces; see `settle`. */
  shown: boolean;
  /** Its solids, while it is drawn; see `SOLID_LEVEL`. */
  walls: TileWalls | null;
  /** Its trees' crowns in world space, while it is drawn; see `crownsNear`. */
  crowns: Float32Array | null;
  /** The vehicles in it that can be taken; see `TileMachine`. */
  machines: TileMachine[] | null;
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

/**
 * Where a plant's base went, in world space: its part, whether it is a tree
 * (stood upright but for its lean) or follows the slope outright, its height
 * and the reach its seat was measured over. `sample` hands them back, for
 * `pnpm seated` to hold against the drawn land.
 */
export interface PlantSeat {
  id: string;
  tree: boolean;
  /** Seated on the drawn land, rather than on the relief where the probe had not gathered. */
  drawn: boolean;
  x: number;
  y: number;
  z: number;
  height: number;
  reach: number;
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
  /** The land mesh (`buildLand`), which the grass stands on. Without it there is no grass (`grass`). */
  land?: THREE.Mesh;
  /** The towns' lawns, which the grass grows on too. */
  lawns?: Pick<Settlements, 'swardAt' | 'floorChanges'>;
  /**
   * The fields a light plane or a balloon stands in (`fleet.ts`), so no tree
   * grows through a wing. Asked per tile and answered from the world alone,
   * so a tile is the same whatever the fleet has built. The grass is left to
   * grow in them, a field being grass, and is mown on the strip an airstrip
   * draws (`stripCover`), bare on its worn track.
   */
  fields?: FieldIndex;
}

export function createVegetation(world: World, options: VegetationOptions = {}): Vegetation {
  const group = new THREE.Group();
  group.name = 'vegetation';

  const ctx: SceneryContext = createSceneryContext(options.context);
  const material = foliageMaterial();
  // A near tile's two (`CARD_LEVEL`): its wood, in the wind, and its leaves.
  const windMaterial = machineWood(woodMaterial(material));
  const leafCards = leafMaterial();
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
   * off a town's whole disc; the grass grows up to its square, less the edge
   * slope, because the bare corners of a disc round a square are exactly where
   * a foot arriving at a town is looking.
   */
  const builtHalf = new Float64Array(builtRadius.length);
  /**
   * And its cells' pitch: the edge slope round the square is one course of
   * cells wide (`floorReach` in `scenery/floor.ts`), and a pitch is about
   * `TOWN_PITCH`'s 12 (17 in the smallest towns) against `EDGE_RUN`'s 9, so a
   * square taken as `half + EDGE_RUN` left the slope's outer strip to the
   * land's height, under the slope's own.
   */
  const builtPitch = new Float64Array(builtRadius.length);
  /**
   * A monument's plan (`landmark-ground.ts`), null for a town: the trees keep
   * `MONUMENT_CLEARANCE` off the ground its model stands on rather than off
   * the disc of its footprint, so the Alhambra, 94 units by 18, is not an
   * empty circle 110 across in the middle of its wood.
   */
  const builtShape: (PlanShape | null)[] = [];
  /** How many of those arrays are in use: only the *shown* places keep the trees out. */
  let builtCount = 0;
  /**
   * Filled at construction and again when the prominence knob moves, because
   * a hidden village's ground grows trees again — nothing is built there, so
   * nothing keeps the wood out. See `PROMINENCE_RADIUS` in `places.ts`.
   */
  const rebuildKeepouts = (): void => {
    let i = 0;
    const add = (lat: number, lon: number, radius: number, half = 0, pitch = 0, shape: PlanShape | null = null): void => {
      // Through `sphere.ts`, like every other conversion in the project: the
      // obvious hand-written one is the mirror image of the planet.
      toUnit(lat, lon, builtUnit, i * 3);
      builtRadius[i] = radius;
      builtHalf[i] = half;
      builtPitch[i] = pitch;
      builtShape[i] = shape;
      i++;
    };
    for (const place of options.places ?? []) {
      if (!isShown(place)) continue;
      const grid = townGrid(radiusOf(place));
      add(place.lat, place.lon, radiusOf(place), grid.half, grid.pitch);
    }
    for (const site of options.monuments ?? []) {
      add(site.lat, site.lon, (site.footprint ?? WIDEST_FOOTPRINT) + MONUMENT_CLEARANCE, 0, 0, planShape(site));
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
    const merged = mergeMeshes(built);
    const value: FlatVariant = {
      ...merged,
      height: measured.height,
      footprint: entry.footprint,
      tilt: TILT_OF[entry.kind],
      solid: bodyOf(entry),
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

  /**
   * A tree as a near tile draws it (`CARD_LEVEL`): its wood and its leaf
   * cards, from the part's `form` on the same seed its `build` had, so it is
   * the tree the far tile drew as lumps. Null for a part with no form — a
   * boulder, a cactus, a tuft — which a near tile draws as a far one does.
   */
  const nearVariants = new Map<string, NearVariant | null>();

  function nearOf(partId: string, style: RegionStyle, index: number): NearVariant | null {
    const key = `${partId}:${style.id}:${index}`;
    const cached = nearVariants.get(key);
    if (cached !== undefined) return cached;
    const entry = part(partId);
    const solid = variantOf(partId, style, index);
    if (entry?.form === undefined || solid === null) {
      nearVariants.set(key, null);
      return null;
    }
    let value: NearVariant | null = null;
    try {
      const { wood, leaves } = nearArrays(entry.form(variantRng(entry, style, index), style));
      value = {
        wood: {
          ...wood,
          // Code-built: the ink's normal is the fill's own.
          outline: wood.normal,
          triangles: wood.position.length / 9,
          height: solid.height,
          footprint: solid.footprint,
          tilt: solid.tilt,
          solid: solid.solid,
        },
        leaves,
      };
    } catch (error) {
      broken.push(`${key} (near): ${String(error)}`);
    }
    nearVariants.set(key, value);
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

  // ------------------------------------------------------------------
  // The countryside between the towns
  // ------------------------------------------------------------------

  /**
   * The planner (`countryside.ts`) and what makes its plans into tile
   * geometry (`countryside-tile.ts`). A farm's house is the region's own
   * dwelling out of the scenic kit, so the planner is told which parts those
   * are and how much ground each takes.
   */
  const dwellingsOf = new Map<string, { item: string; weight: number; footprint: number }[]>();
  const country: { planner: Countryside; builder: CountryBuilder } | null = (() => {
    if (options.places === undefined) return null;
    const planner = createCountryside(world, {
      places: options.places,
      monuments: options.monuments,
      roads: options.roads,
      fields: options.fields,
      dwellings(style) {
        let list = dwellingsOf.get(style.id);
        if (list === undefined) {
          list = style.buildings
            .filter((entry) => KIND_OF.get(entry.item) === 'dwelling')
            .map((entry) => ({ item: entry.item, weight: entry.weight, footprint: part(entry.item)!.footprint }));
          if (list.length === 0) list = [{ item: 'gabled-house', weight: 1, footprint: part('gabled-house')?.footprint ?? 7.4 }];
          dwellingsOf.set(style.id, list);
        }
        return list;
      },
    });
    return { planner, builder: createCountryBuilder(world, ctx, planner, variantOf) };
  })();

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
  /** What `drawnFootprint` fills, reused the same way. */
  const drawn: DrawnFootprint = { centre: 0, lowest: 0, highest: 0 };
  /** Where each plant's base went, while `sample` is asking; see `PlantSeat`. */
  let seatLog: PlantSeat[] | null = null;
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
    /** Which entry of `builtUnit` this is, for the grass's town squares. */
    index: number;
    /** A monument's plan, kept `MONUMENT_CLEARANCE` off; null for a town's disc. */
    shape: PlanShape | null;
  }

  /** Whether `(x, z)` in the tile's frame is inside a keepout. */
  const insideKeepout = (keepout: Keepout, x: number, z: number): boolean => {
    if (keepout.shape !== null) return planGap(keepout.shape, x - keepout.x, z - keepout.z) < MONUMENT_CLEARANCE;
    const dx = x - keepout.x;
    const dz = z - keepout.z;
    return dx * dx + dz * dz < keepout.radius * keepout.radius;
  };
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

  /**
   * A plane's or balloon's field in the tile's frame. A disc like a town, but
   * the plant brings its own spread to it the way it does to a road, because
   * what has to stay clear is the wing and not the ground under the trunk.
   */
  interface FieldDisc {
    x: number;
    z: number;
    radius: number;
  }
  const fieldKeepouts: FieldDisc[] = [];
  const fieldHits: FieldKeepout[] = [];

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
    /** The vehicles in it that can be taken, and where they are in its buffer; null for none. */
    machines: TileMachine[] | null;
    /** What the budget counts it as: its triangles drawn as lumps; see `CARD_LEVEL`. */
    priced: number;
    /** The leaf cards, a child of `mesh`; only at or under `CARD_LEVEL`. */
    leaves: THREE.Mesh | null;
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
    /** Plots refused because a farm, a field or a fence of the countryside is there. */
    onCountry: number;
    fastPath: boolean;
    pieces: number;
    fields: number;
    fences: number;
    motion: CountryMotionRows | null;
    /** Near, and its fields laid on the relief because the drawn land was not ready: built again when it is. */
    provisional: boolean;
    /** What of it is solid, for the finest levels; see `SOLID_LEVEL`. */
    walls: TileWalls | null;
    /** Its trees' crowns in world space, `CROWN_STRIDE` floats each, for the leaves that fall; see `crownsNear`. */
    crowns: Float32Array | null;
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

  /** Each part's obstacle, measured once from its first build. */
  const shapes = new WeakMap<object, PartShape>();
  /** The walls `wallsOf` placed for each vehicle in the tile it last walled. */
  const machineWalls = new Map<CountryMachine, Solid[]>();

  /**
   * A tile's solids, in the frame `frameTile` has just set: a disc for every
   * trunk and boulder it places and the measured walls of every farm building,
   * each where its placed matrix puts it. **What is solid is what is drawn**:
   * the same list the buffer is merged from, so a tree is a wall exactly where
   * one stands and nowhere else.
   *
   * A trunk's disc takes no roof (`top` 0), so the camera passes the trees:
   * a lens pulled in behind every trunk in a wood is a lens that never
   * settles. A building's walls take the height of what stands over them.
   */
  function wallsOf(tile: Tile, placed: readonly { flat: FlatVariant; matrix: THREE.Matrix4; machine?: CountryMachine }[]): TileWalls | null {
    const solids: Solid[] = [];
    const ground = origin.length();
    machineWalls.clear();
    for (const item of placed) {
      const kind = item.flat.solid;
      if (kind === undefined) continue;
      let shape = shapes.get(item.flat);
      if (shape === undefined) {
        shape = partShape(item.flat.position, kind);
        shapes.set(item.flat, shape);
      }
      const from = solids.length;
      placeShape(shape, item.matrix.elements, ground, solids);
      if (item.machine !== undefined) machineWalls.set(item.machine, solids.slice(from));
    }
    if (solids.length === 0) return null;
    return {
      field: solidField(solids),
      solids,
      across: across.clone(),
      north: north.clone(),
      up: up.clone(),
      cosBound: Math.cos((Math.hypot(tile.halfEast, tile.halfNorth) + SOLID_MARGIN) / PLANET_RADIUS),
    };
  }

  /**
   * A near tile's crowns, in the world: every placed tree with cards whose
   * species sheds (`crownOf`), wherever its matrix and the tile's frame put
   * it — the wood's own plants and the countryside's orchards alike. The
   * frame is the one `frameTile` has just set.
   */
  function crownsOf(placed: readonly { matrix: THREE.Matrix4; leaves?: LeafArrays | null }[]): Float32Array | null {
    crownList.length = 0;
    for (const item of placed) {
      if (item.leaves == null) continue;
      crownMatrix.multiplyMatrices(tileMatrix, item.matrix);
      placeCrown(item.leaves, crownMatrix, crownList);
    }
    return crownList.length === 0 ? null : Float32Array.from(crownList);
  }
  const crownList: number[] = [];
  const crownMatrix = new THREE.Matrix4();

  /**
   * Where a gather writes: the frame the local coordinates are taken in and
   * the three lists. A tile's is the module's own (`tileSet`, in the frame
   * `frameTile` sets); the grass keeps one of its own, because it gathers
   * round the camera between two tiles and must not overwrite a tile's lists.
   */
  interface KeepoutSet {
    across: THREE.Vector3;
    north: THREE.Vector3;
    keepouts: Keepout[];
    roads: RoadKeepout[];
    fields: FieldDisc[];
  }
  const tileSet: KeepoutSet = { across, north, keepouts, roads: roadKeepouts, fields: fieldKeepouts };

  /**
   * Everything built that could reach within `reach` of `direction` (a unit
   * vector), into `into`'s lists, in `into`'s frame.
   */
  function gatherKeepouts(direction: THREE.Vector3, reach: number, into: KeepoutSet): void {
    const { across, north, keepouts, roads: roadKeepouts, fields: fieldKeepouts } = into;
    // Everything built, in the tile's own tangent frame. The components of a
    // direction along the frame *are* the local coordinates at these angles.
    keepouts.length = 0;
    {
      const cos = Math.cos((reach + 120) / PLANET_RADIUS);
      const { x, y, z } = direction;
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
          shape: builtShape[i] ?? null,
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
    // The fields, which the fleet works out from the world on the spot. The
    // margin is the plant's spread, which nothing here is wider than.
    fieldKeepouts.length = 0;
    if (options.fields !== undefined) {
      fieldHits.length = 0;
      for (const field of options.fields.fieldsNear(direction, reach + FIELD_CLEARANCE + 40, fieldHits)) {
        fieldKeepouts.push({
          x: field.at.dot(across) * PLANET_RADIUS,
          z: field.at.dot(north) * PLANET_RADIUS,
          radius: field.radius + FIELD_CLEARANCE,
        });
      }
    }

    roadKeepouts.length = 0;
    if (roadIndex !== null && roadGeometry !== null) {
      const margin = reach + 40;
      roadIndex.near(direction, margin, roadHits);
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
      machines: null,
      priced: 0,
      leaves: null,
      triangles: 0,
      plants: 0,
      bytes: 0,
      plots: 0,
      inTheSea: 0,
      builtOver: 0,
      onRoad: 0,
      onSlope: 0,
      onCountry: 0,
      fastPath: false,
      pieces: 0,
      fields: 0,
      fences: 0,
      motion: null,
      provisional: false,
      walls: null,
      crowns: null,
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

    gatherKeepouts(tile.direction, Math.hypot(tile.halfEast, tile.halfNorth), tileSet);
    // The countryside's plans under the tile, whose pieces, fields and fences
    // the wood keeps off at every level, drawn or not.
    const plans = country === null ? [] : country.builder.plansUnder(tile.level, tile.row, tile.column);
    const pieceSeats: NonNullable<CountryFrame['seats']> = [];
    const countryFrame: CountryFrame = { level: tile.level, across, north, inverse: tileInverse, cards: tile.level <= CARD_LEVEL, seats: seatLog === null ? undefined : pieceSeats };
    country?.builder.prepare(plans, countryFrame);

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
      /** A near tree's cards, and whether its wood bends in the wind. */
      leaves?: LeafArrays | null;
      sways?: boolean;
      /** A vehicle the fleet can take (`CountryMachine`). */
      machine?: CountryMachine;
    }
    const cards = tile.level <= CARD_LEVEL;
    let leafVertices = 0;
    /** The vertices it would have were every tree its lumps. */
    let pricedVertices = 0;
    const placed: Placed[] = [];
    let vertices = 0;
    let inTheSea = 0;
    let builtOver = 0;
    let onRoad = 0;
    let onSlope = 0;
    let onCountry = 0;
    let plots = 0;
    let checked = false;
    /** Whether any plant was seated on the relief because the drawn land was not gathered under it. */
    let fellBack = false;

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
        const variant = rng.int(VARIANTS);
        const flat = variantOf(id, style, variant);
        if (flat === null) continue;

        const scale = levelScale * rng.spread(1, 0.16);
        // The per-variant half of the legibility test. `floraFor` has already
        // dropped the species that cannot read at this level; this drops the one
        // short variant of a species that can.
        if (flat.height * scale < legibleFloor(tile.level)) continue;

        let blocked = false;
        for (const keepout of keepouts) {
          if (insideKeepout(keepout, x, z)) {
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
        for (const field of fieldKeepouts) {
          const dx = x - field.x;
          const dz = z - field.z;
          const clear = field.radius + spread;
          if (dx * dx + dz * dz < clear * clear) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          builtOver++;
          continue;
        }
        if (country !== null && country.builder.blocks(x, z, spread)) {
          onCountry++;
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
        // What is left to bed in is the share of the slope the lean did *not*
        // take: at `tilt` 1 the base plane is the ground's own and there is
        // nothing to cut in, at 0 the whole drop across the footprint, and a
        // leaning tree pays the difference. **On the drawn land where the
        // probe reaches**, which is what is seen: the relief is up to seven
        // units off it, and a wood seated on the relief stood a trunk's
        // height in the air on one hillside and to the knees in the next.
        // Past the probe, the relief, and a near tile built that way is built
        // again once the probe answers (`provisional`).
        const seat = land === undefined ? 'unknown' : drawnFootprint(land, plantUp, plantAcross, plantNorth, reach, drawn);
        if (seat === 'water') {
          inTheSea++;
          continue;
        }
        let base: number;
        if (seat === 'drawn') {
          base = drawn.centre - (drawn.centre - drawn.lowest) * (1 - flat.tilt);
        } else {
          base = PLANET_RADIUS + elevation - (relief - lowest) * (1 - flat.tilt);
          if (land !== undefined) fellBack = true;
        }
        base -= flat.height * scale * PLANT_SEATING;
        world4.compose(scratch.copy(plantUp).multiplyScalar(base), quaternion, scaleVector);
        seatLog?.push({ id, tree: flat.tilt < 1, drawn: seat === 'drawn', x: scratch.x, y: scratch.y, z: scratch.z, height: flat.height * scale, reach });
        local4.multiplyMatrices(tileInverse, world4);

        pricedVertices += flat.position.length / 3;
        const near = cards ? nearOf(id, style, variant) : null;
        if (near !== null) {
          placed.push({ flat: near.wood, matrix: local4.clone(), leaves: near.leaves, sways: true });
          vertices += near.wood.position.length / 3;
          leafVertices += near.leaves.position.length / 3;
        } else {
          placed.push({ flat, matrix: local4.clone() });
          vertices += flat.position.length / 3;
        }
      }
    }

    const plants = placed.length;
    // And the countryside itself, into the same buffer: legible at this level
    // as a plant of its size would be.
    const built = country === null
      ? null
      // Wherever the probe has the tile, whatever it says of the viewer: a
      // point it has not gathered answers null and takes the relief.
      : country.builder.build(plans, countryFrame, legibleFloor(tile.level), land, land !== undefined && (landReady || land.covers(tile.direction)));
    for (const seat of pieceSeats) seatLog?.push({ id: `country:${seat.id}`, tree: true, drawn: seat.drawn, x: seat.x, y: seat.y, z: seat.z, height: 0, reach: seat.reach });
    if (built !== null) {
      for (const item of built.placed) {
        placed.push(item);
        if (item.leaves != null) leafVertices += item.leaves.position.length / 3;
      }
      vertices += built.vertices;
      pricedVertices += built.priced;
    }
    const countryside = {
      pieces: built?.pieces ?? 0,
      fields: built?.fields ?? 0,
      fences: built?.fences ?? 0,
      motion: built?.motion ?? null,
      // And a tile of any level with a plant on the relief and all of it
      // inside the ground the probe always answers (`PROBE_SURE`): built
      // again once the probe is ready, when every plant of it finds the drawn
      // land, so it is built again once and not every frame.
      provisional: land !== undefined && (((built?.provisional ?? false) && !landReady) ||
        (fellBack && tile.distance + Math.hypot(tile.halfEast, tile.halfNorth) < PROBE_SURE)),
      walls: tile.level <= SOLID_LEVEL ? wallsOf(tile, placed) : null,
      crowns: cards ? crownsOf(placed) : null,
    };

    if (placed.length === 0) {
      return { ...empty, plots, inTheSea, builtOver, onRoad, onSlope, onCountry, fastPath: inland, ...countryside };
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
    // A near tile's wind, four bytes a vertex (`foliage.ts`): zero on
    // everything that is not a tree's wood, which therefore holds still.
    const wind = cards ? new Uint8Array(vertices * 4) : null;
    const leafPosition = new Float32Array(leafVertices * 3);
    const leafNormal = new Int8Array(leafVertices * 3);
    const leafColor = new Uint8Array(leafVertices * 3);
    const leafUv = new Uint16Array(leafVertices * 2);
    const leafWind = new Uint8Array(leafVertices * 4);
    let leafCursor = 0;
    let cursor = 0;
    const machines: TileMachine[] = [];
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
      if (item.machine !== undefined) {
        const first = (cursor - count) / 3;
        machines.push({
          id: item.machine.id,
          model: item.machine.model,
          position: item.machine.position,
          forward: item.machine.forward,
          paint: null,
          start: first,
          count: count / 3,
          solids: machineWalls.get(item.machine) ?? [],
          hidden: false,
        });
        // Marked for the material to paint it as the craft's is (`MACHINE_WOOD`):
        // a near tile's wind has two bytes no wood uses.
        if (wind !== null) for (let v = 0; v < count / 3; v++) wind[(first + v) * 4 + 2] = MACHINE_BED;
      }
      if (item.sways !== true) continue;
      // The plant's phase, off where it stands: the same tree sways the same
      // way however often its tile is built.
      const phase = Math.round((((e[12]! * 0.1373 + e[14]! * 0.3117) % 1) + 1) % 1 * 255);
      const bend = scale / WIND_REACH;
      if (wind !== null) {
        const first = (cursor - count) / 3;
        for (let v = 0; v < count / 3; v++) {
          wind[(first + v) * 4] = Math.round(Math.min(1, Math.max(0, source.position[v * 3 + 1]! * bend)) * 255);
          wind[(first + v) * 4 + 1] = phase;
        }
      }
      const leaves = item.leaves;
      if (leaves === undefined || leaves === null) continue;
      for (let i = 0; i < leaves.position.length; i += 3) {
        const x = leaves.position[i]!;
        const y = leaves.position[i + 1]!;
        const z = leaves.position[i + 2]!;
        leafPosition[leafCursor] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
        leafPosition[leafCursor + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
        leafPosition[leafCursor + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
        const nx = leaves.normal[i]!;
        const ny = leaves.normal[i + 1]!;
        const nz = leaves.normal[i + 2]!;
        leafNormal[leafCursor] = Math.round((e[0]! * nx + e[4]! * ny + e[8]! * nz) * inverseScale * 127);
        leafNormal[leafCursor + 1] = Math.round((e[1]! * nx + e[5]! * ny + e[9]! * nz) * inverseScale * 127);
        leafNormal[leafCursor + 2] = Math.round((e[2]! * nx + e[6]! * ny + e[10]! * nz) * inverseScale * 127);
        for (let c = 0; c < 3; c++) leafColor[leafCursor + c] = Math.round(Math.min(1, Math.max(0, leaves.color[i + c]!)) * 255);
        const v = leafCursor / 3;
        const w = i / 3;
        leafUv[v * 2] = Math.round(leaves.uv[w * 2]! * 65535);
        leafUv[v * 2 + 1] = Math.round(leaves.uv[w * 2 + 1]! * 65535);
        leafWind[v * 4] = Math.round(Math.min(1, Math.max(0, y * bend)) * 255);
        leafWind[v * 4 + 1] = phase;
        leafWind[v * 4 + 2] = Math.round(Math.min(1, Math.max(0, leaves.leaf[w * 2]!)) * 255);
        leafWind[v * 4 + 3] = Math.round(Math.min(1, Math.max(0, leaves.leaf[w * 2 + 1]!)) * 255);
        leafCursor += 3;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
    geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline, 3, true));
    if (wind !== null) geometry.setAttribute('aWind', new THREE.BufferAttribute(wind, 4, true));

    let leaves: THREE.Mesh | null = null;
    if (leafVertices > 0) {
      const cardGeometry = new THREE.BufferGeometry();
      cardGeometry.setAttribute('position', new THREE.BufferAttribute(leafPosition, 3));
      cardGeometry.setAttribute('normal', new THREE.BufferAttribute(leafNormal, 3, true));
      cardGeometry.setAttribute('color', new THREE.BufferAttribute(leafColor, 3, true));
      cardGeometry.setAttribute('uv', new THREE.BufferAttribute(leafUv, 2, true));
      cardGeometry.setAttribute('aWind', new THREE.BufferAttribute(leafWind, 4, true));
      // The sway's reach past the cards' own sphere: a crown bends a unit or two.
      cardGeometry.computeBoundingSphere();
      cardGeometry.boundingSphere!.radius += 2;
      leaves = new THREE.Mesh(cardGeometry, leafCards);
      leaves.name = `leaves:${tile.key}`;
      leaves.castShadow = true;
      leaves.receiveShadow = true;
      leaves.customDepthMaterial = leafDepthMaterial();
    }
    // A near tile of nothing but bushes has no wood: its sphere is its leaves'.
    if (vertices > 0) geometry.computeBoundingSphere();
    else if (leaves !== null) geometry.boundingSphere = leaves.geometry.boundingSphere!.clone();
    else return { ...empty, plots, inTheSea, builtOver, onRoad, onSlope, onCountry, fastPath: inland, ...countryside };

    const mesh = new THREE.Mesh(geometry, cards ? windMaterial : material);
    if (cards) mesh.customDepthMaterial = woodDepthMaterial();
    // In the tile's frame too, so the parent's transform is theirs.
    if (leaves !== null) mesh.add(leaves);
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
      leaves,
      priced: pricedVertices / 3,
      triangles: (vertices + leafVertices) / 3,
      plants,
      // 12 bytes of position, 3 of normal, 3 of colour, 3 of the ink's normal,
      // and a near tile's 4 of wind; a card's vertex 12, 3, 3, 4 of its
      // texture coordinate and 4 of wind.
      bytes: vertices * (cards ? 25 : 21) + leafVertices * 26,
      machines: machines.length > 0 ? machines : null,
      plots,
      inTheSea,
      builtOver,
      onRoad,
      onSlope,
      onCountry,
      fastPath: inland,
      ...countryside,
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
   * build, not a wrong answer.
   */
  const barren = new Set<string>();
  const BARREN_CAP = 20_000;

  const stats: VegetationStats = {
    tiles: 0,
    pending: 0,
    nearPending: 0,
    plants: 0,
    cards: 0,
    swaying: false,
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
    country: { planned: 0, cached: 0, slowestMs: 0, meanMs: 0, byKind: {}, refused: {}, pieces: 0, fields: 0, fences: 0, rotors: 0, beacons: 0, smokes: 0, provisional: 0 },
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
    residentTriangles -= entry.priced;
    residentByLevel[entry.level]! -= entry.priced;
    standing.delete(key);
  }

  function release(entry: Standing): void {
    walled.delete(entry);
    crowned.delete(entry);
    machined.delete(entry);
    // The geometry is this tile's and nothing else holds it. The material is one
    // object shared by every tile on the planet.
    const mesh = entry.mesh;
    const leaves = entry.leaves;
    if (!entry.shown) {
      mesh.geometry.dispose();
      leaves?.geometry.dispose();
      return;
    }
    // Dissolved away (`fade.ts`); a swap's replacement dissolves in on the
    // complementary pixels in the same frames. The leaves go with their tile,
    // on the same clock.
    if (leaves !== null) fader.out(leaves, () => leaves.geometry.dispose());
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
   * standing, known barren or turned away by the build (`refused`), and a tile built while a retiring one still
   * covers its ground is **staged** — built, counted, not drawn — until then.
   * When the last one arrives, the old go and the new appear in the same
   * frame. A tile leaving the range altogether has nothing to wait for and
   * goes at once, as before. `wantedTiles` is the last scan's list.
   */
  const retiring = new Map<string, Standing>();
  /**
   * The drawn tiles that have solids: a tile is solid from the frame it is
   * shown to the frame it is released, retiring included, so a trunk is a
   * wall exactly while it is on the screen.
   */
  const walled = new Set<Standing>();
  /** The drawn tiles with crowns that shed, on the same terms as `walled`. */
  const crowned = new Set<Standing>();
  /** The drawn tiles with a vehicle that can be taken, on the same terms; see `TileMachine`. */
  const machined = new Set<Standing>();
  const machineSeen = new Set<string>();

  /** Folds a taken vehicle out of a tile's buffer and walls. See `hideParked`. */
  function foldMachine(entry: Standing, id: string): void {
    const machine = entry.machines?.find((candidate) => candidate.id === id);
    if (machine === undefined || machine.hidden) return;
    machine.hidden = true;
    // Every vertex onto the first, as a town folds a parked car: the
    // triangles draw nothing, nor do their ink hulls.
    const position = entry.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    const first = machine.start * 3;
    for (let v = machine.start + 1; v < machine.start + machine.count; v++) {
      array[v * 3] = array[first]!;
      array[v * 3 + 1] = array[first + 1]!;
      array[v * 3 + 2] = array[first + 2]!;
    }
    position.addUpdateRange(first, machine.count * 3);
    position.needsUpdate = true;
    const walls = entry.walls;
    if (walls !== null && machine.solids.length > 0) {
      const gone = new Set(machine.solids);
      walls.solids = walls.solids.filter((solid) => !gone.has(solid));
      if (walls.solids.length > 0) walls.field = solidField(walls.solids);
      else {
        entry.walls = null;
        walled.delete(entry);
      }
    }
  }
  const solidDir = new THREE.Vector3();
  const solidPush = { x: 0, z: 0 };
  let wantedTiles: Tile[] = [];
  /**
   * The wanted tiles the build turned away since the last scan: over their
   * level's `SHARE_OF`, or left in the queue when the cap was reached. None of
   * them will be built before the scan asks again, so `settle` counts them as
   * barren — or a coarse tile retiring over one waited on it forever, drawn,
   * while the finer tiles that replace the rest of its ground stood staged
   * and hidden. Their squares are bare until the next scan, which is what the
   * share and the cap decided.
   */
  const refused = new Set<string>();
  /**
   * Near tiles whose fields were laid on the relief because the drawn land
   * could not yet be asked (`countryside-tile.ts`). Once it can, each is built
   * again and swapped for the old one the way a level change is, so a field
   * never stays floating over, or sunk under, the ground it was meant for.
   */
  const provisional = new Set<string>();
  /** Tiles arriving and leaving by dissolving; see `fade.ts`. */
  const fader = createFader();

  function retire(key: string): void {
    const entry = standing.get(key);
    if (entry === undefined) return;
    standing.delete(key);
    residentTriangles -= entry.priced;
    residentByLevel[entry.level]! -= entry.priced;
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
          if (standing.has(tile.key) || barren.has(tile.key) || refused.has(tile.key)) continue;
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
      if (entry.leaves !== null) fader.in(entry.leaves);
      entry.shown = true;
      if (entry.walls !== null) walled.add(entry);
      if (entry.crowns !== null) crowned.add(entry);
      if (entry.machines !== null) machined.add(entry);
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
      residentTriangles += back.priced;
      residentByLevel[back.level] = residentByLevel[back.level]! + back.priced;
    }
    wantedTiles = wanted;
    refused.clear();
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
  // The grass's ground
  // ------------------------------------------------------------------

  // Here rather than in `main.ts`, so the index is in this deferred chunk and not the first load.
  const land = options.land === undefined ? undefined : landProbeOf(options.land);
  const lawns = options.lawns;
  /**
   * Whether the drawn land answered round the viewer this frame: a near tile's
   * fields are laid on it, and on the relief (and built again) until it does.
   */
  let landReady = false;
  const eyeDirection = new THREE.Vector3();
  const eyeAt = new THREE.Vector3();

  /** The land index round the viewer, while the camera is low enough for the grass to be drawn. */
  function prepareLand(viewer: THREE.Vector3, camera: THREE.Camera | undefined): void {
    if (land === undefined || camera === undefined) {
      landReady = false;
      return;
    }
    const eye = camera.getWorldPosition(eyeAt);
    // Over the ground under the camera, not over the sea: a valley in the
    // Alps is six hundred units above it.
    eyeDirection.copy(eye).normalize();
    const height = Math.max(0, eye.length() - groundRadius(world, eyeDirection));
    landReady = height < LAND_PREPARE_HEIGHT && land.prepare(viewer);
  }

  /**
   * The ground's colour, the biome's `sward` and its dryness, at the corners of
   * `GROUND_LEVEL`. Cached by corner, because every texel round a point asks
   * the same four.
   */
  interface GroundSample {
    density: number;
    r: number;
    g: number;
    b: number;
    dry: number;
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
    const made = { density: BIOMES[sample.id].sward, r: sampleColour.r, g: sampleColour.g, b: sampleColour.b, dry: DRY_OF[sample.id] };
    if (groundSamples.size > 40_000) groundSamples.clear();
    groundSamples.set(key, made);
    return made;
  }
  const groundHere: GroundSample = { density: 0, r: 0, g: 0, b: 0, dry: 0 };
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
    for (const channel of ['density', 'r', 'g', 'b', 'dry'] as const) {
      groundHere[channel] = (s00[channel] * (1 - u) + s10[channel] * u) * (1 - v) + (s01[channel] * (1 - u) + s11[channel] * u) * v;
    }
    return groundHere;
  }

  /** The grass's own gather: a frame, the three lists, and the towns' squares in it. */
  const grassSet: KeepoutSet = { across: new THREE.Vector3(), north: new THREE.Vector3(), keepouts: [], roads: [], fields: [] };
  interface Square {
    ux: number; uy: number; uz: number;
    ax: number; ay: number; az: number;
    nx: number; ny: number; nz: number;
    /** Half the square with its edge slope, as an angle. */
    outer: number;
  }
  const squares: Square[] = [];
  const squareUp = new THREE.Vector3();
  const squareNorth = new THREE.Vector3();
  const squareAcross = new THREE.Vector3();
  /** A field of straw's colour, for the grass that grows as its crop. */
  const strawTint = new THREE.Color();
  const grassProbe = new THREE.Vector3();
  /** The airstrips near the last gather, whose drawn rectangle grows no grass. */
  const grassStrips: FleetSite[] = [];
  const stripHits: FleetSite[] = [];

  /**
   * The ground the grass stands on at `direction`, inside the last gather: the
   * drawn land, or where a town's square or its edge slope is, what the town
   * says (`swardAt`, keeping `margin` off its streets, walls and risers).
   */
  function groundUnder(direction: THREE.Vector3, margin: number): number | null {
    const radius = land!.radiusAt(direction);
    if (radius === null) return null;
    for (const square of squares) {
      const offAcross = Math.abs(direction.x * square.ax + direction.y * square.ay + direction.z * square.az);
      const offNorth = Math.abs(direction.x * square.nx + direction.y * square.ny + direction.z * square.nz);
      if (offAcross >= square.outer || offNorth >= square.outer) continue;
      return lawns === undefined ? null : lawns.swardAt(direction, radius, margin);
    }
    return radius;
  }

  const grass: GrassGround | null = land === undefined ? null : {
    covers: (direction) => land.covers(direction),

    gather(direction, reach) {
      const set = grassSet;
      set.north.set(0, 1, 0).projectOnPlane(direction);
      if (set.north.lengthSq() < 1e-8) set.north.set(1, 0, 0).projectOnPlane(direction);
      set.north.normalize();
      set.across.crossVectors(direction, set.north).normalize();
      gatherKeepouts(direction, reach, set);
      // A town's square in its own frame: the axes once a gather, not once a texel.
      squares.length = 0;
      for (const keepout of set.keepouts) {
        const half = builtHalf[keepout.index]!;
        if (half <= 0) continue;
        const i = keepout.index * 3;
        squareUp.set(builtUnit[i]!, builtUnit[i + 1]!, builtUnit[i + 2]!);
        squareNorth.set(0, 1, 0).projectOnPlane(squareUp).normalize();
        squareAcross.crossVectors(squareUp, squareNorth).normalize();
        squares.push({
          ux: squareUp.x, uy: squareUp.y, uz: squareUp.z,
          ax: squareAcross.x, ay: squareAcross.y, az: squareAcross.z,
          nx: squareNorth.x, ny: squareNorth.y, nz: squareNorth.z,
          outer: (half + Math.max(EDGE_RUN, builtPitch[keepout.index]!) + 1) / PLANET_RADIUS,
        });
      }
      // The airstrips whose drawn strip could reach into the gather.
      grassStrips.length = 0;
      if (options.fields !== undefined) {
        stripHits.length = 0;
        for (const site of options.fields.planesNear(direction, reach + STRIP_REACH, stripHits)) {
          if (site.at.angleTo(direction) * PLANET_RADIUS < reach + STRIP_REACH) grassStrips.push(site);
        }
      }
    },

    at(direction, out, spread = 0) {
      const lat = latOf(direction.y);
      const lon = lonOf(direction.x, direction.z);
      const ground = groundAt(lat, lon);
      if (ground.density <= 0) return null;
      // **Bare ground is still ground.** Where the land goes on but nothing
      // grows on it — the shore's sand, a monument's pad, a carriageway's
      // verge, a paddy — the answer is the land's height at no density, so
      // the field has the surface to lay the grass beside it on: a blade by
      // the sand followed the lawn's height out over the shore ramp's fall,
      // a unit in the air.
      let bare = false;
      // The shore ramp is the one place the relief is under the shelf, and it
      // is sand.
      if (reliefAt(direction.x, direction.y, direction.z) < 0) bare = true;

      // What is built keeps it out: a monument, a carriageway and its verge.
      const set = grassSet;
      const x = direction.dot(set.across) * PLANET_RADIUS;
      const z = direction.dot(set.north) * PLANET_RADIUS;
      for (const keepout of set.keepouts) {
        if (bare) break;
        if (builtHalf[keepout.index]! > 0) continue;
        if (insideKeepout(keepout, x, z)) bare = true;
      }
      for (const road of set.roads) {
        if (bare) break;
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
        const clear = road.clearance + 0.8 + spread;
        if (ox * ox + oz * oz < clear * clear) bare = true;
      }
      // An airstrip is grass cut short and dry (`craft/airstrip.ts`): mown on
      // the strip it draws and a little past its edge for the blades' own
      // lean, in the lanes it draws, and none on the worn track down its
      // middle or under the threshold's boards (`stripCover`, the one answer
      // both read). Where the ground has no sward to mow it is earth, drawn
      // and grown. The blades root on the drawn strip, `STRIP_LIFT` over the
      // land, or the strip buries the short ones. The rest of the field a
      // plane keeps, and the paddocks, pads and balloon fields, which are
      // drawn as the land they stand on, are grass.
      //
      // **The strip's rim is no ground at all**, a band `STRIP_RIM` texels
      // wide inside its outer edge (the drawn strip shows there, the colour
      // of its mown lanes): the grass on the strip stands `STRIP_LIFT` up and
      // the field beside it does not, and a blade laid between a texel of
      // each rooted in the air by up to that, in a ring round every strip.
      // Heights are laid only between texels whose ground goes on
      // (`grassLookup`), and no two texels of a cell are further apart
      // across it than a diagonal, so a rim that wide keeps the two apart.
      // Asked whatever else has made the ground bare, because the strip is
      // drawn over it all the same, and the ground under it is the strip's.
      // Two strips of one town may cross: bare where either's track is,
      // and a rim only where the point is inside neither.
      let lane = -1;
      let inner = false;
      for (const site of grassStrips) {
        const cover = stripCover(site, direction, STRIP_GRASS_MARGIN + spread, STRIP_BARE_MARGIN + spread);
        if (cover < 0) continue;
        lane = lane === 0 ? 0 : cover;
        if (onStrip(site, direction, STRIP_GRASS_MARGIN + spread - STRIP_RIM * 2 * spread)) inner = true;
      }
      if (lane >= 0) {
        if (!inner) return null;
        if (lane === 0 || ground.density < STRIP_SWARD) bare = true;
      }
      // The countryside: no grass through a paddy, a pond or a ploughed
      // field, and grass the colour of the crop in a field of straw; bare
      // under a tent, a fire or a barn and trodden short round it.
      let straw: number | null = null;
      let height = lane >= 0 ? STRIP_MOWN : 1;
      /** How worn the ground is round a piece, 0 to 1: short, thin and dry toward the bare. */
      let worn = 0;
      if (country !== null && !bare) {
        const field = country.planner.fieldAt(direction);
        if (field !== null) {
          straw = strawOf(ctx, field.crop);
          if (straw === null) bare = true;
        }
        if (!bare) {
          worn = 1 - country.planner.trodden(direction, spread);
          height *= 1 - worn;
          if (height <= 0) bare = true;
        }
      }
      let radius = groundUnder(direction, LAWN_MARGIN + spread);
      if (radius === null) return null;
      // **Lowered where the ground folds up between the field's points.**
      // The field is its points laid between, and a fold between two of
      // them — a crease of the mesh, the foot of an edge slope where it goes
      // under the land — is a hollow the line between them passes over in
      // the air, by up to a quarter of the change of slope times the spacing:
      // two units at the coarse field's foot of a hill town's embankment. The
      // field's neighbours are `2 spread` off (`spread` is half its spacing),
      // and lowering a point by half its second difference along each axis,
      // where that is a hollow, keeps the line under the ground wherever the
      // fold falls, and leaves a plane or a ridge as it is. Capped at
      // `spread`, because a neighbour across a riser is not a fold, and the
      // grass keeps off a riser by `spread` already.
      if (spread > 0) {
        const centre = radius;
        let lower = 0;
        for (const along of [set.across, set.north]) {
          grassProbe.copy(direction).addScaledVector(along, (2 * spread) / PLANET_RADIUS).normalize();
          const ahead = groundUnder(grassProbe, 0);
          grassProbe.copy(direction).addScaledVector(along, (-2 * spread) / PLANET_RADIUS).normalize();
          const behind = groundUnder(grassProbe, 0);
          if (ahead === null || behind === null) continue;
          lower = Math.max(lower, (ahead + behind - 2 * centre) / 2);
        }
        radius = centre - Math.min(spread, lower);
      }

      out.radius = radius + (lane >= 0 ? STRIP_LIFT : 0);
      out.density = bare ? 0 : ground.density * (1 - worn * WORN_THIN);
      // Kept where it is bare too: the height is laid between texels, and a
      // mown blade by the track is mown.
      out.height = height;
      if (lane > 0) {
        // The strip's own colour at this blade, in its lane's tone.
        strawTint.setRGB(ground.r, ground.g, ground.b);
        stripColor(strawTint, ground.density, strawTint).multiplyScalar(lane);
        out.r = strawTint.r;
        out.g = strawTint.g;
        out.b = strawTint.b;
        out.dry = Math.max(ground.dry, MOWN_DRY);
      } else if (straw === null) {
        out.r = ground.r;
        out.g = ground.g;
        out.b = ground.b;
        out.dry = Math.max(ground.dry, worn * WORN_DRY);
      } else {
        strawTint.set(straw);
        out.r = strawTint.r;
        out.g = strawTint.g;
        out.b = strawTint.b;
        out.dry = Math.max(ground.dry, STRAW_DRY);
      }
      return out;
    },

    floorChanges: (since, into) => (lawns === undefined ? since : lawns.floorChanges(since, into)),
    version: () => prominenceVersion(),
  };

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
      if (!mayBuild(began, allowance, near, 'wood')) break;
      // The countryside's plans under it first, over as many frames as they take.
      if (country !== null && !standing.has(tile.key) && !country.builder.ensure(tile.level, tile.row, tile.column, () => mayBuild(began, allowance, near, 'wood'))) break;
      queue.shift();
      if (standing.has(tile.key)) continue;
      // This level has had its share. The tile is dropped rather than
      // deferred: the queue is nearest first, so what is waiting behind it
      // is the coarser ring that the share exists to protect.
      if (residentByLevel[tile.level]! >= budget * SHARE_OF[tile.level]!) {
        refused.add(tile.key);
        continue;
      }
      const result = raise(tile);
      built++;
      if (result.mesh === null) {
        barren.add(tile.key);
        continue;
      }
      // Into the group by `settle` once nothing retiring covers it.
      standing.set(tile.key, {
        mesh: result.mesh,
        priced: result.priced,
        leaves: result.leaves,
        triangles: result.triangles,
        plants: result.plants,
        bytes: result.bytes,
        pieces: result.pieces,
        fields: result.fields,
        fences: result.fences,
        motion: result.motion,
        level: tile.level,
        row: tile.row,
        column: tile.column,
        shown: false,
        walls: result.walls,
        crowns: result.crowns,
        machines: result.machines,
      });
      if (result.provisional) provisional.add(tile.key);
      else provisional.delete(tile.key);
      residentTriangles += result.priced;
      residentByLevel[tile.level] = residentByLevel[tile.level]! + result.priced;
      // The real cap. See `residentTriangles`.
      if (residentTriangles >= budget) {
        for (const left of queue) refused.add(left.key);
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
    proxies: () => {
      const proxies = [proxyOf(material), proxyOf(fadeTwin(material)), proxyOf(windMaterial), proxyOf(fadeTwin(windMaterial)), proxyOf(leafCards), proxyOf(fadeTwin(leafCards))];
      proxies[2]!.customDepthMaterial = proxies[3]!.customDepthMaterial = woodDepthMaterial();
      proxies[4]!.customDepthMaterial = proxies[5]!.customDepthMaterial = leafDepthMaterial();
      return proxies;
    },
    grass,

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
        refused.clear();
        rebuildKeepouts();
        country?.planner.reset();
        provisional.clear();
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
      const preparing = performance.now();
      prepareLand(viewer, camera);
      // A slice of the land index is the probe's, not the wood's: the wood's is what the wood spent.
      const sown = performance.now() - preparing;
      if (provisional.size > 0 && landReady) {
        for (const key of provisional) {
          const tile = wantedTiles.find((wanted) => wanted.key === key);
          if (tile !== undefined && standing.has(key)) {
            retire(key);
            refused.delete(key);
            queue.unshift(tile);
          }
        }
        provisional.clear();
      }
      built += buildTiles(began + sown, false);
      if (built > 0) {
        stats.lastBuildMs = Number((performance.now() - began - sown).toFixed(2));
        stats.built += built;
      }
      settle();

      let triangles = 0;
      let plants = 0;
      let pieces = 0;
      let fieldCount = 0;
      let fences = 0;
      let rotors = 0;
      let beacons = 0;
      let smokes = 0;

      let bytes = 0;
      let priced = 0;
      let cardCount = 0;
      let swaying = false;
      // The stats' own array, refilled: this runs every frame.
      const byLevel = stats.byLevel;
      byLevel.fill(0);
      for (const entry of standing.values()) {
        triangles += entry.triangles;
        priced += entry.priced;
        plants += entry.plants;
        bytes += entry.bytes;
        byLevel[entry.level]!++;
        if (entry.leaves !== null) {
          cardCount += entry.leaves.geometry.getAttribute('position').count / 6;
          if (entry.shown && entry.level === 0) swaying = true;
        }
        pieces += entry.pieces;
        fieldCount += entry.fields;
        fences += entry.fences;
        if (entry.motion !== null) {
          rotors += entry.motion.rotors.length / ROTOR_STRIDE;
          beacons += entry.motion.beacons.length / BEACON_STRIDE;
          smokes += entry.motion.smokes.length / SMOKE_STRIDE;
        }
      }
      if (country !== null) {
        Object.assign(stats.country, country.planner.stats);
        Object.assign(stats.country, { pieces, fields: fieldCount, fences, rotors, beacons, smokes, provisional: provisional.size });
      }
      residentTriangles = priced;
      for (let level = 0; level < LEVELS; level++) residentByLevel[level] = 0;
      for (const entry of standing.values()) residentByLevel[entry.level] = residentByLevel[entry.level]! + entry.priced;
      stats.tiles = standing.size;
      stats.retiring = retiring.size;
      stats.staged = 0;
      for (const entry of standing.values()) if (!entry.shown) stats.staged++;
      stats.pending = queue.length;
      stats.nearPending = 0;
      for (const tile of queue) if (tile.distance - Math.hypot(tile.halfEast, tile.halfNorth) < NEAR_BUILD) stats.nearPending++;
      stats.triangles = triangles;
      stats.plants = plants;
      stats.cards = cardCount;
      stats.swaying = swaying;
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
      const seats: PlantSeat[] = [];
      seatLog = seats;
      let result: Built;
      try {
        result = raise(tile);
      } finally {
        seatLog = null;
      }
      const ms = performance.now() - began;
      result.mesh?.geometry.dispose();
      result.leaves?.geometry.dispose();
      return {
        tile: tile.key,
        at: `${tile.lat.toFixed(3)}, ${tile.lon.toFixed(3)}`,
        span: `${Math.round(tile.halfEast * 2)} x ${Math.round(tile.halfNorth * 2)} units`,
        pitch: Number(pitchOf(level).toFixed(1)),
        plots: result.plots,
        plants: result.plants,
        triangles: result.triangles,
        leaves: (result.leaves?.geometry.getAttribute('position').count ?? 0) / 3,
        inTheSea: result.inTheSea,
        builtOver: result.builtOver,
        onRoad: result.onRoad,
        onSlope: result.onSlope,
        onCountry: result.onCountry,
        pieces: result.pieces,
        fields: result.fields,
        fences: result.fences,
        fastPath: result.fastPath,
        kilobytes: Number((result.bytes / 1024).toFixed(1)),
        buildMs: Number(ms.toFixed(2)),
        provisional: result.provisional,
        seats,
      };
    },

    raiseTile(lat, lon, level = 0) {
      const step = stepOf(level);
      const row = Math.min(rowsOf(level) - 1, Math.max(0, Math.floor((lat + 90) / step)));
      const cells = cellsOf(rootOf(row, level), level);
      const column = Math.floor((((lon + 180) % 360) / 360) * cells);
      const result = raise(tileAt(level, row, column, new THREE.Vector3()));
      const mesh = result.mesh;
      mesh?.updateMatrixWorld(true);
      // And what in it can be taken, for the checks to hold against the fleet's.
      if (mesh !== null) mesh.userData.machines = result.machines;
      return mesh;
    },

    /**
     * The determinism check, which is the one property this file cannot lose.
     *
     * `pnpm scenery` builds each variant twice and compares; the same
     * argument applies a level up, because a tile draws from a seed per *cell*
     * and a single `Math.random()` anywhere in the chain would give a different
     * wood on every load — and the failure is invisible unless something looks.
     */
    countryside: country?.planner ?? null,

    collide(point, radius, push) {
      push.set(0, 0, 0);
      solidDir.copy(point).normalize();
      let hit = false;
      for (const entry of walled) {
        const walls = entry.walls!;
        if (solidDir.dot(walls.up) < walls.cosBound) continue;
        if (!pushOut(walls.field, point.dot(walls.across), point.dot(walls.north), radius, solidPush)) continue;
        push.addScaledVector(walls.across, solidPush.x).addScaledVector(walls.north, solidPush.z);
        hit = true;
      }
      return hit;
    },

    freeSpotNear(point, radius, out) {
      solidDir.copy(point).normalize();
      for (const entry of walled) {
        const walls = entry.walls!;
        if (solidDir.dot(walls.up) < walls.cosBound) continue;
        const x = point.dot(walls.across);
        const z = point.dot(walls.north);
        if (!freeSpot(walls.field, x, z, radius, solidPush)) continue;
        out.copy(point).addScaledVector(walls.across, solidPush.x - x).addScaledVector(walls.north, solidPush.z - z);
        out.setLength(point.length());
        return true;
      }
      return false;
    },

    crownsNear(point, range, visit) {
      solidDir.copy(point).normalize();
      const rangeSq = range * range;
      for (const entry of crowned) {
        const list = entry.crowns!;
        // A tile's own bound first, where it has one: the walls' cone.
        if (entry.walls !== null && solidDir.dot(entry.walls.up) < entry.walls.cosBound - range / PLANET_RADIUS) continue;
        for (let o = 0; o < list.length; o += CROWN_STRIDE) {
          const dx = list[o]! - point.x;
          const dy = list[o + 1]! - point.y;
          const dz = list[o + 2]! - point.z;
          if (dx * dx + dy * dy + dz * dz < rangeSq) visit(list, o);
        }
      }
    },

    parkedNear(viewer, radius, out) {
      machineSeen.clear();
      for (const entry of machined) {
        for (const machine of entry.machines!) {
          if (machine.hidden || machineSeen.has(machine.id) || machine.position.distanceTo(viewer) > radius) continue;
          machineSeen.add(machine.id);
          out.push(machine);
        }
      }
    },

    hideParked(id) {
      for (const entry of standing.values()) foldMachine(entry, id);
      for (const entry of retiring.values()) foldMachine(entry, id);
    },

    setParkedTaken(test) {
      country?.builder.setTaken(test);
    },

    blocksSight(point) {
      solidDir.copy(point).normalize();
      const height = point.length();
      for (const entry of walled) {
        const walls = entry.walls!;
        if (solidDir.dot(walls.up) < walls.cosBound) continue;
        if (enclosed(walls.field, point.dot(walls.across), point.dot(walls.north), height)) return true;
      }
      return false;
    },

    motion(visit) {
      for (const entry of standing.values()) if (entry.shown && entry.motion !== null) visit(entry.motion);
      for (const entry of retiring.values()) if (entry.motion !== null) visit(entry.motion);
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
      // And the leaves, every attribute of them: a card's wind or its place on the atlas is the tree too.
      const cardsOf = (built: Built): ArrayLike<number>[] =>
        built.leaves === null ? [] : Object.values(built.leaves.geometry.attributes).map((attribute) => (attribute as THREE.BufferAttribute).array);
      const leavesA = cardsOf(first);
      const leavesB = cardsOf(second);
      let leavesSame = leavesA.length === leavesB.length;
      for (let k = 0; leavesSame && k < leavesA.length; k++) {
        const x = leavesA[k]!;
        const y = leavesB[k]!;
        if (x.length !== y.length) leavesSame = false;
        for (let i = 0; leavesSame && i < x.length; i++) if (x[i] !== y[i]) leavesSame = false;
      }
      first.mesh?.geometry.dispose();
      second.mesh?.geometry.dispose();
      first.leaves?.geometry.dispose();
      second.leaves?.geometry.dispose();
      return {
        tile: tile.key,
        plants: first.plants,
        vertices: a?.length ?? 0,
        cards: (first.leaves?.geometry.getAttribute('position').count ?? 0) / 6,
        deterministic: same && leavesSame,
        firstDifferenceAt: differed,
      };
    },
  };
}
