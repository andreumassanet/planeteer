import * as THREE from 'three';
import type { FolkAnchor } from './folk.ts';
import type { World } from './geo.ts';
import { GROUND_MARKS_GLSL, PLANET_RADIUS, bindGroundWeather, groundColorAt, groundPatchesChunk, groundRadius, groundWeatherChunk, groundWeatherGLSL } from './globe.ts';
import { PALETTE, createToonRamp } from './theme.ts';
import { BODY_SCALE } from './stature.ts';
import { bedtimeByte, bedtimeNever, lightWindows, poolAt } from './lights.ts';
import { mergeMeshes, sourceVertex } from './merge.ts';
import { proxyOf } from './warm.ts';
import { createFader, fadeTwin } from './fade.ts';
import type { MergePiece } from './merge.ts';
import {
  DASH,
  GROUND_LIFT,
  KERB_DROP,
  LINE_HALF,
  MARKED_STREET,
  MAX_CUT,
  SIDEWALK,
  ZEBRA,
  ZEBRA_STRIPE,
  cellKey,
  cellTone,
  groundStyleFor,
  trodden,
} from './scenery/ground.ts';
import {
  apronCorner,
  buildFloor,
  flightAt,
  flightDepth,
  flightHeight,
  flightRun,
  floorLiftAt,
  floorReach,
} from './scenery/floor.ts';
import type { Road } from './roads.ts';
import type { GroundStyle } from './scenery/ground.ts';
import type { FloorField, Flight } from './scenery/floor.ts';
import {
  cellCentre,
  cellIndex,
  cornerOffset,
  COUNTRY_RING,
  countryReach,
  gateGlow,
  gatesOf,
  hasThroughStreets,
  inGrid,
  isAvenue,
  mainStreetHalf,
  OUTSKIRT_MIN_CELLS,
  OUTSKIRT_RING,
  outskirtScore,
  outskirtsOf,
  streetBand,
  onThroughRoad,
  THROUGH_HALF_WIDTH,
  throughClear,
  townFrame,
  townGrid,
  townTerraces,
} from './scenery/grid.ts';
import type { TownGrid, TownGround } from './scenery/grid.ts';
import { enclosed, freeSpot, pushOut, solidAt, solidField, yawed } from './scenery/solids.ts';
import type { Solid, SolidField } from './scenery/solids.ts';
import type { MonumentContext } from './monuments/contract.ts';
import type { Placement } from './placement.ts';
import { BIGGEST_SETTLEMENT, isShown, prominenceVersion, radiusFor, radiusOf } from './places.ts';
import { biomeAt, biomeSample } from './biome.ts';
import { MAX_SLOPE, gradeAt } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { VEHICLES, createTrafficContext, placedScale, placedSize, trafficFor, variantRng as vehicleRng } from './traffic/index.ts';
import type { TrafficStyle, Vehicle } from './traffic/index.ts';
import type { Place } from './places.ts';
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
  PARTS,
  VARIANTS,
  createSceneryContext,
  measure,
  part,
  regionFor,
  rngFrom,
  validatePart,
  variantRng,
} from './scenery/index.ts';
import type { PartKind, Placed, RegionStyle, SceneryContext, Weighted } from './scenery/index.ts';
import { unitAt } from './sphere.ts';
import { PARKED_CRAFT, PARKED_SLOT } from './craft/contract.ts';

/**
 * The join: 29,545 populated places on one side, twenty-two parametric parts on
 * other, and this file is the only thing that knows about both.
 *
 * `placement.ts` is the model, and it is worth saying exactly where this follows
 * it and where it must not, because the two look alike and are not:
 *
 * - **Followed.** A slot per location, a unit direction so the distance test
 *   costs no trigonometry, one ground query per site rather than one per frame,
 *   hysteresis on the range so nothing at the edge rebuilds every frame, and a
 *   failure that is recorded rather than thrown.
 * - **Not followed: everything about volume.** 77 monuments all fit in memory
 *   and `update` walks all of them every frame. 29,545 towns do not and it cannot
 *   — so the scan runs on a movement threshold instead of on a clock, what gets
 *   built is chosen against a *triangle budget* rather than against range alone,
 *   and a build is spread over frames because one metropolis is milliseconds of
 *   work and forty of them arriving together would be a stall you can feel.
 * - **Not followed: the drawing.** A monument is a `Group` of thirty meshes and
 *   nobody cares. A town is thousands. See `townMaterial` for the measurement
 *   that decided it, and `compare()` for the tool that took it.
 *
 * What it does *not* do, deliberately: it does not touch the terrain.
 * `setFlattenSites` pads the ground under a monument, and the same trick here
 * would flatten roughly a third of the planet's land — 29,545 discs of a hundred
 * units with a skirt reaching four times as far. Towns take the ground as it is
 * and refuse the plots that are too steep to build on, which is what a town
 * does.
 */

/**
 * How big a settlement is, and where that number lives now.
 *
 * `radiusOf` is `places.ts`'s, not this file's, and it must stay that way: the
 * HUD names the place you are standing in from the same radius this file builds
 * the buildings inside, so a second copy would put the chip's "Lyon" over ground
 * with no Lyon on it. It is the law's `radiusFor(pop)` except where the bake
 * fitted a city smaller than that, and a town's square (`townGrid`) is cut from
 * it and nothing else. The law and the measurements behind it are documented
 * there.
 */

/**
 * How much of a settlement is town rather than village, from 0 to 1.
 *
 * One number, and it drives three things that would otherwise be three tables:
 * how far the built core reaches, how densely the plots are taken, and how the
 * weight in `RegionStyle.buildings` moves from `dwelling` to `block`. A place of
 * ten thousand is 0; a place of ten million is 1; the middle is logarithmic
 * because population is.
 */
function urbanityOf(pop: number): number {
  return Math.min(1, Math.max(0, (Math.log10(Math.max(1, pop)) - 4) / 2.6));
}

/**
 * How far a building's walls stand back from the edge of the square on a side
 * with no street, in world units.
 *
 * The square's edge is the kerb, a vertical face. A wall flush with it is two
 * faces in one plane with no ink line between them — the pen hulls per mesh and
 * a town is one mesh — so the house reads as growing out of the plinth. Half a
 * unit and a bit is a doorstep's worth of paving, which is what a town's edge
 * has, and it keeps the wall off the kerb at every pitch the square can have.
 */
const EDGE_SETBACK = 0.6;

/**
 * The smallest a building may be scaled to fit its cell.
 *
 * The kit's own spread is under a tenth either way, and past that a scaled house
 * stops reading as a different house and starts reading as the same house seen
 * from further off. A building that would need more than this does not stand
 * here; `planTown` tries the region's next smaller one instead, which is the
 * rule that took the heap of houses to zero overlaps without emptying the town.
 */
const FIT_SCALE = 0.9;


// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * How far away a settlement is built, in world units of slant distance.
 *
 * **It used to be a radius around the player and that is wrong in the air.** The
 * distance this is compared against runs from the player to a town on the
 * ground, so from 6,000 units up the nearest town on the planet is already 6,000
 * away and a 14,000 radius reaches 12,600 along the ground, not 14,000 — while
 * a 4,200 radius (vegetation's) reaches nothing at all. The reach along the
 * ground is the number with a meaning; the slant is its hypotenuse with the
 * altitude, and `slantRange` is the one place that arithmetic lives.
 *
 * The reach itself is the old rule: the horizon, twice, because the fog runs to
 * about 1.35 horizons and there is no sense building past the haze. The ceiling
 * is 20,000 rather than 14,000 because the cone now pays for one direction
 * instead of all of them — see `view.ts` — and the pixel test below still throws
 * away every town too small to read long before this does.
 */
function reachFor(altitude: number): number {
  return Math.min(fogFar(altitude, PLANET_RADIUS) * 1.1, detailReach(Math.min(20000, Math.max(1400, horizonAt(altitude, PLANET_RADIUS) * 2))));
}

function rangeFor(altitude: number): number {
  return slantRange(altitude, reachFor(altitude));
}

/**
 * How many pixels of the screen a settlement has to be worth before it is built.
 *
 * The `LEGIBLE_AT` arithmetic run on the whole town instead of on one part: at a
 * 900 px viewport and the world's 55 degree lens an object subtends about
 * `937 * size / distance` pixels. Below a dozen a settlement is a smudge with a
 * hard black outline round it, which is worse than empty ground.
 *
 * It is the whole level-of-detail scheme and it needs no tiers: on foot every
 * hamlet inside the range passes, and from the plane only the cities do, because
 * the same inequality solved for radius rises with distance. Measured over
 * Ile-de-France, resident settlements by altitude: 48 on foot, 48 at 2,000, 48
 * at 6,000 (larger ones, 121,328 triangles against 71,876), 2 at 12,000, and 0
 * from the plane's 23,000-unit ceiling, where `rangeFor` has already stopped.
 */
const MIN_APPARENT_PIXELS = 8;
const minPixels = (): number => detailPixels(MIN_APPARENT_PIXELS);
const PIXELS_PER_RADIAN = 937;

/**
 * The ceiling on resident geometry, in triangles.
 *
 * `OutlineEffect` draws the scene twice, so this is 760,000 triangles a frame on
 * top of the land mesh's 2.18 M, which is drawn twice too: about a sixth more
 * than the land alone for the thing the whole planet was built to hold (the
 * land's count as measured on 2026-09-13). It was set when this was 640,000
 * and the land 1.5 M, and has moved since with the towns and the land both.
 *
 * It binds where the count cap does not. The densest 1,500-unit neighbourhood on
 * Earth is Ulm's, with 192 places in it; at the median ten plots a place that is
 * only 400,000 triangles, so what actually stops the world is standing in the
 * middle of five large cities, which is the case worth capping.
 */
const TRIANGLE_BUDGET = 380_000;

/** As the knob leaves it; the ground inside a radius goes as its square. */
const triangleBudget = (): number => detailArea(TRIANGLE_BUDGET);

/**
 * And a hard count, so a thousand hamlets cannot cost a thousand draw calls.
 *
 * **It is 140 because the world got four times more towns in it and 70 was
 * sized against the old set.** `places.json` went from 7,320 places to 29,545
 * — Spain 48 to 334, Germany 58 to 424 — and the count went from a cap that
 * rarely bound to the only thing stopping the world being built: on foot in
 * Castile the streamer used to hold 26 towns because only 26 existed within
 * reach, and it now holds the whole allowance.
 *
 * **What a resident town costs is one draw call, and that is measured rather
 * than assumed.** Standing in Ulm at detail 1, `atlas.settlements.group.visible`
 * off and on around twelve `outline.render` calls with `gl.finish()`: **6
 * resident towns, +6 draw calls and +12,092 drawn triangles** in the pass the
 * counter can see, so twelve calls and 24,000 triangles across the two the
 * outline actually draws. That is 2,000 triangles a town against a 380,000
 * budget — the geometry has room and the *count* is what binds, which is the
 * whole argument for moving this number and not that one.
 *
 * It scales on `detailCount` (`d^1.5`) with every other resident count here, so
 * the knob still owns it: 50 towns at detail 0.5, 140 at 1, 727 at 6 — and past
 * about detail 2 the triangle budget takes over again, which is the right way
 * round because that is the number tied to what the GPU draws.
 */
const MAX_RESIDENT = 140;
const maxResident = (): number => detailCount(MAX_RESIDENT);

/**
 * How much of the world is dressed whatever the camera is pointed at.
 *
 * The frustum is what makes the range affordable and this is what makes it safe:
 * a mouse flick is 180 degrees in a tenth of a second, no margin covers it, and
 * inside this radius the streamer behaves exactly as it did before `view.ts` —
 * a plain disc.
 *
 * **It is sized against the fog and the number was measured, not chosen.** With
 * a 900 disc, a 180 degree flick standing in Finland put 19% of the visible town
 * geometry on the first frame and took 13 frames to reach 90% — a fifth of a
 * second of towns arriving behind you, which is exactly the pop a streamer is
 * meant not to have. The fog on flat ground closes at about 1,430 units
 * (`sqrt(2 R h) * 1.35` at eye height), so anything further than that was never
 * visible to begin with and anything nearer has to be standing before you turn.
 *
 * It costs nothing from the air, because it is a sphere around a camera that is
 * thousands of units above any ground — which is why a number this large is
 * affordable at all.
 */
const KEEP_ALL_WITHIN = 1450;

/**
 * **And it deliberately does not move with the detail knob**, which was the
 * first thing tried and is measured as wrong.
 *
 * The disc is the answer to a *flick*, and a flick reveals what is near. Scaling
 * it with the knob turns it into a second, frustum-free range: at detail 3 it
 * became a 4,350-unit disc and the streamer held **592 settlements and 803,836
 * triangles with 19,076 of them on the screen** — 2.4%, which is the radius bug
 * `view.ts` exists to have deleted, walking back in through the one number that
 * is allowed to ignore the frustum. Left alone it stays what it was measured to
 * be: everything inside the on-foot fog, standing before you turn, and the far
 * half of a big reach arriving over the quarter-second the build budget takes.
 */
const keepAllWithin = (): number => KEEP_ALL_WITHIN;

/**
 * Radians of turn that force the candidate list to be worked out again.
 *
 * The movement threshold cannot see a turn — `RESCAN_MOVE` is satisfied by
 * standing still and looking around, which is precisely the motion that changes
 * what a cone admits. 8 degrees is about a tenth of the margin the admitting
 * cone carries, so the streamer is always building into slack rather than into
 * the edge of the frame.
 */
const RESCAN_TURN = 8 * (Math.PI / 180);

/**
 * How far the viewer moves before the candidate list is worked out again.
 *
 * `placement.ts` scans its 77 slots every frame and that is right for 77. A
 * typed-array pass over 29,545 anchors measures under 100 microseconds, which
 * is a frame spent re-deciding something that cannot have changed — the nearest
 * settlement is 10 units of radius at the very least and the range is 1,400. So
 * the scan runs when the viewer has moved a fifth of the smallest settlement, or
 * when the range itself has moved.
 */
const RESCAN_MOVE = 60;

/**
 * Milliseconds of building allowed in one frame.
 *
 * A metropolis is about 3 ms of plots, ground queries and buffer copying. Six
 * of them coming into range together — which is what walking towards a
 * conurbation does — is a 20 ms stall, and a stall while walking is the one
 * artefact a streamer must not have. So the queue is served by a clock, and a
 * town that does not fit this frame is built in the next.
 */
const BUILD_BUDGET_MS = 3.5;

/**
 * Ground kept clear around a monument, past its own declared footprint.
 *
 * Not "do not build near a landmark" — a landmark with a town around it is
 * exactly what the scenery contract means by *figure and ground*, and Paris's
 * own centre in `places.json` stands 11 units from the Eiffel Tower, which is
 * where it should be. It is only "do not build *inside* one".
 *
 * The footprint is the model's own, out of `monuments.json`, so the Colosseum
 * clears 55 units and Stonehenge clears 4.8 rather than both clearing the
 * contract's widest. A missing one falls back to that widest, because a landmark
 * with no model yet has to reserve the room it might need.
 */
const MONUMENT_CLEARANCE = 8;
const WIDEST_FOOTPRINT = 55;

/**
 * **What used to be here was `MAX_BURIAL`, and the history is worth keeping
 * because it is the argument the terracing had to answer.**
 *
 * `placement.ts` asks the ground once at a monument's centre and `terrain.ts`
 * flattens a pad under it. A settlement could not have that — 29,545 pads of a
 * hundred units with a skirt four times as wide would level about a third of
 * the planet's land — so a building bedded itself into the relief, to the
 * *lowest* corner under its own footprint, and took whatever burial the slope
 * gave it. The only question left was when to refuse, and two answers were
 * tried:
 *
 * - **A gradient cap, at 0.6.** It deleted every mountain city on the planet:
 *   the relief runs at 1.19 at La Paz, 1.12 at Quito and 0.97 at Innsbruck,
 *   measured over 7 units and over 30 and identical at both, because up there
 *   the land is not rough, it is a smooth plane tilted at 45 degrees. La Paz
 *   built 0 of 35 plots, Quito 0 of 31, Bogota 0 of 63.
 * - **`MAX_BURIAL`, the drop across a footprint against the height of what
 *   stands on it.** Right for a bedded building, because a slope does not hide
 *   a house — the ground uphill of it does — and a tower survives ground a hut
 *   cannot.
 *
 * A building stands on a **terrace** now (`terraceAt`, and `TERRACE_STEP` in
 * `scenery/ground.ts`), which is a level surface cut into the hill, so the hill
 * cannot bury it at all and neither question applies to it. What the terrace
 * asks instead is `MAX_CUT`: how deep the town may cut one cell, which is the
 * same thing as how tall a wall it may show. The bedding rule survives for the
 * things that are *not* on the floor — the trees and the scatter in the green
 * between the cells — and it reads `gradeAt` in `terrain.ts` rather than a copy
 * of its own probes.
 */

// ---------------------------------------------------------------------------
// The ground a town stands on
// ---------------------------------------------------------------------------

/**
 * The floor's own vertical section — the lift, the kerb and the apron — is in
 * `scenery/ground.ts` with the rest of what a town's ground is, so that
 * `pnpm check` can measure the mesh against the number this file lays the
 * paving at rather than against a copy of it. See `GROUND_LIFT` there.
 */


/*
 * A street is not a ribbon laid over the paving. It is a band of the paving's
 * own cells, coloured — and that is worth saying because the obvious design is
 * a ribbon and the ribbon is wrong three times over: it needs a second lift
 * above the floor to be seen at all, which is a second surface for the player
 * to sink into; it needs a *third* offset where two of them cross, or the
 * crossroads z-fights; and it has to be re-derived from the same lattice
 * anyway. Cutting the cell gives crisp edges, exact agreement with the ground
 * under it, and no offset at all. Where the streets run is `scenery/grid.ts`'s
 * and how wide they are is `streetBand`'s.
 *
 * **And the roads out are not this file's any more.** A town used to draw the
 * last stretch of every road itself — a track from its centre out past its edge
 * — because only the town knew where its terrace was. It came out as a narrow
 * strip fading to dirt under the end of a road that had stopped four units
 * short of the kerb, with the two surfaces stacked a quarter of a unit apart
 * for up to forty units: a poor little path that rendered badly. The square's
 * edge and its gates are pure functions of the place now, so `roads.ts` lays
 * the ribbon to the gate and climbs it to the gate's own terrace, and the town
 * draws nothing for it.
 */

// ---------------------------------------------------------------------------
// Street lamps
// ---------------------------------------------------------------------------

/**
 * The part `settlements.ts` places itself, rather than through a region's four
 * lists.
 *
 * A region table hands parts to *plots* and a lamp belongs to a *street*, which
 * is a distinction this project has already had to make once — `src/traffic/`
 * is its own directory because `ScenicPart.footprint` is a radius and a radius
 * cannot say whether a bus fits a lane. Here the join is smaller: the streets
 * are cut a few lines above, so the placer already knows where they are and the
 * region tables never could.
 */
const LAMP_PART = 'street-lamp';
/** The traffic light a kit-built city stands at its middle crossing. */
const SIGNAL_PART = 'traffic-light';

// ---------------------------------------------------------------------------
// The people standing in it, and the vehicles parked in it
// ---------------------------------------------------------------------------

/**
 * How many of the nearest settlements are inhabited, and how far one has to
 * fall before it is emptied again.
 *
 * **A person is about 700 triangles, which is more than a `gabled-house`, and
 * that is the right way round** — a person is the object you stand next to. (It
 * was 296 until the crowd was rebuilt of soft shapes on 2026-09-15; the median
 * is `pnpm people`'s.) It is the wrong way round for a town at the pixel floor:
 * eight figures inside a 32-unit blob eight pixels across are 5,600 triangles
 * saying nothing. Against a median town of about 1,900 triangles they would
 * nearly quadruple the settlement budget for geometry that is only worth
 * anything inside about a thousand units — which is why the rank below mattered
 * before the rebuild and matters twice as much after it.
 *
 * So the crowd is not a level of detail on the *part*, it is a rank: the scan
 * already sorts by distance, and the nearest twelve get people while everything
 * behind them does not. Crossing the line builds the town again (`rebuild`,
 * the old one standing until the new one does), which is why there are two
 * numbers and not one — at a single threshold a town hovering on it rebuilds
 * every scan.
 */
const PEOPLED_RANK = 12;
const UNPEOPLE_RANK = 20;

/**
 * How many triangles the near towns may cost over what the same towns would
 * cost far, before the excess is charged to the triangle budget, in total.
 *
 * **A near town is the kit's buildings and a crowd, and the budget was sized
 * for the far ones.** Once the City Kits built the nearest twelve (2026-09-17)
 * a near town cost three times a far one — 7,409 triangles against 2,343 at
 * the mean, 13,742 at the p90 — and charged to the one budget it was the far
 * field that paid: at the same standpoints Madison stood 20 towns where it had
 * stood 49, Tarragona 21 of 49, Kempten and Ulm 16 of 24. The difference is
 * charged here instead, up to a quarter of a million triangles, which is twelve
 * near towns at about the p90 and more than the whole budget at default detail,
 * so a metropolis standing near still spends into the far field and a village
 * does not.
 */
const NEAR_ALLOWANCE = 240_000;

/**
 * How urban a town must be (`urbanityOf`) before its region's towers are towers:
 * 0.5 is a place of 200,000. Below it `TOWER_PART` is built as `TOWERLESS_PART`.
 */
/**
 * How much less often a cell past `OUTSKIRT_RING` is built than one inside it,
 * as a factor on the fill: the edge of a town has gaps between its houses.
 */
const OUTER_FILL = 0.75;
/** And how much more readily an empty one grows a tree, as a factor on `greenery`. */
const OUTER_GREENERY = 1.4;

/** The share of the country's cells that are an orchard, and that are a loose tree or two. The rest is meadow. */
const ORCHARD_SHARE = 0.4;
const LOOSE_SHARE = 0.4;
/**
 * How far from the town's cells, as a share of the pitch, the country may grow
 * on a cell of the edge slope: past the slope's middle, where it has come down
 * to within about a unit of the ground a tree is seated on.
 */
const SLOPE_CLEAR = 0.55;
/** How far off a road's centre line the country keeps: the carriageway's half and a crown. */
const ROAD_KEEP = 7.5;

const TOWER_URBANITY = 0.5;
const TOWER_PART = 'skyscraper';
const TOWERLESS_PART = 'city-block';

/**
 * People in a town, and vehicles at its kerbs.
 *
 * Both ride `urbanityOf`, which is already the one number that says how urban a
 * place is — it drives the built core, the plot fill and the shift from
 * `dwelling` to `block`. A hamlet gets three or four figures and a city gets
 * fourteen, out of the same law and with no second table.
 *
 * The **traffic** count also multiplies `TrafficStyle.density`, which the kit
 * published for exactly this and nothing has ever read: it is the one number
 * that says how busy a road is here, and it is what makes a Norwegian village
 * kerb empty and a Vietnamese one full.
 */
const TOWN_PEOPLE = (urbanity: number): number => Math.round(3 + urbanity * 11);
/** How many numbers one person takes in `Ground.folk`: see there. */
const FOLK_STRIDE = 11;
const TOWN_PARKED = (urbanity: number, density: number): number =>
  Math.round((0.6 + urbanity * 3.4) * Math.min(1.8, density * 2.6));

/**
 * How many of the lattice corners on a street get a lamp.
 *
 * `GroundStyle.hardness` is the signal, because it is already the one number
 * that says how much of the ground was *made*: 0.3 is a swept clearing and 0.6
 * is asphalt to the last house, and street lighting follows exactly that. The
 * floor is not zero — the world in 2026 has a light in most villages, and a
 * settlement with none is indistinguishable from one the streamer failed to
 * build. Urbanity is the second term and the smaller one, so a city is lit more
 * densely than the hamlet next to it without a second table.
 *
 * At the median 13-to-23-unit pitch and a three-cell lane period, 0.3 puts a
 * lamp about every two and a half cells, which is 33 to 58 units — a real
 * spacing is about 30 m, or 38 units here.
 */
const LAMP_FLOOR = 0.12;
const LAMP_MAX_CHANCE = 0.55;

/**
 * And a hard count, for the same reason `MAX_RESIDENT` exists beside the
 * triangle budget: a metropolis has a couple of hundred street corners in its
 * core and would spend more geometry on lamp posts than on buildings.
 *
 * Measured by building each town twice, with the cap at 30 and at 0 —
 * **48 to 52 triangles a lamp**, which is the cheapest thing in the kit after a
 * grass tuft:
 *
 * ```
 *              lamps   triangles      parts
 *   Ulm          6     1,696 -> 2,000    8 -> 14
 *   Paris       11     3,504 -> 4,040   20 -> 31
 *   Tokyo       30    10,578 -> 12,082  52 -> 82   (the cap)
 *   Timbuktu     0     1,192            5          (hardness 0.3)
 * ```
 *
 * So a lit town costs 14 to 18% more triangles than an unlit one, all of it in
 * the lamps — the windows themselves are a byte a vertex and no geometry at all.
 */
const LAMP_CAP = 30;

/**
 * How far a lamp's light reaches along the ground, in world units, and how
 * bright it is at the foot of the column.
 *
 * **The reach is the lamp's own height and not a number**: `street-lamp.ts`
 * builds a column 4.8 to 5.8 units tall, and light from a head at that height
 * grazing the ground at about 20 degrees stops at roughly two and a half times
 * it. 14 is that, and it is bounded on both sides by the floor it falls on —
 * a town's cell is 8 to 18 units across (`TOWN_PITCH` in `scenery/grid.ts`),
 * and the carriageway it crosses is 6.0 to 15.0. A reach
 * inside that range is a pool that is smaller than the block it stands in and
 * wider than the street, and **a pool wider than its own cell has no ground
 * left to be dark.** At 14 the floor of 140 resident towns comes out 58.8% lit,
 * spread from a tenth of peak to full; there is no reach that lights a street
 * and leaves this floor mostly dark, because there are only four to nine
 * vertices in a cell to say it with.
 *
 * `LAMP_STRENGTH` is 1 rather than the lamp's own instance draw. A lamp's head
 * is dimmed 0.82 to 1 by `raise` so a street of them is not a row of identical
 * bulbs, and carrying that into the pool would be the same lottery twice on two
 * surfaces a metre apart — the head and the ground under it visibly disagreeing
 * about how bright the lamp is.
 */
const LAMP_POOL = 14;

/**
 * How far over its foot a lamp's light hangs, for the per-pixel pools
 * (`lampsNear`): the kit's lamps are 4.8 to 5.8 units tall and their bulb
 * hangs a little under the cap (`scenery/parts/street-lamp.ts`).
 */
const LAMP_HEAD = 4.5;
const LAMP_STRENGTH = 1;

/**
 * How far past its own wall a lit building lays light, in world units.
 *
 * **Measured from the footprint and not from the middle, because the middle is
 * under the house** — see `Emitter.inner` for the measurement that settled it.
 *
 * 7 units is one house width and about a fifth of the median built radius, so a
 * lit house lights its own forecourt and stops. It is deliberately half the
 * lamp's: a window is a small opening in a wall and a lamp is a head in the
 * open, and the whole point of having both is that a village with six lamps and
 * a dozen houses does not come out as one even wash.
 */
const WINDOW_SPILL = 7;

/**
 * A building that is lighting the ground around it: where it stands, how wide
 * it is, how bright its windows came out, and when they go out.
 *
 * Collected by `raise` as the plots are placed, because that is the only place
 * that knows all four — the plan says where, `flatten` says how bright the
 * variant's windows are and which is the last one out, and the instance draw
 * says how much of that this copy of it shows.
 */
interface LitPlot {
  x: number;
  z: number;
  radius: number;
  strength: number;
  bed: number;
}

// ---------------------------------------------------------------------------
// Variants, flattened once
// ---------------------------------------------------------------------------

/**
 * One built variant, reduced to the three arrays a town is assembled from.
 *
 * The colour comes out of the material and goes into the vertices, which is the
 * step that makes a town one mesh instead of eighteen. `ctx.toon` stamps the
 * palette colour into `userData.atlasToon` and `validatePart` already refuses
 * any material that did not come from it, so the read cannot miss.
 */
interface FlatVariant {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  /**
   * The ink's normals: a painted part's welded `outlineNormal`, the fill's own
   * normal for a part built in code. The town buffer carries them as three
   * signed bytes a vertex, which is all a hull offset needs.
   */
  outline: Float32Array;
  /**
   * Two bytes a vertex: how lit it is after dark, and the hour it goes out.
   *
   * One interleaved attribute rather than two, so the pair costs one attribute
   * slot and one `vec2` varying. See `lightWindows` in `src/lights.ts` for what
   * they become and `bedtimeByte` for how the second is encoded.
   */
  glow: Uint8Array;
  /** True if any vertex of this variant emits, so an unlit town can skip the work. */
  emits: boolean;
  /**
   * The bedtime byte of this variant's **brightest** window.
   *
   * What it is for is the pool on the ground outside: light falling on a
   * forecourt is light coming out of a window, so it has to go out when that
   * window does — and a building has several, on several hours. The brightest
   * is the one doing most of the spilling, which makes it the honest single
   * answer to a question the vertex can only be asked once. See `poolByte`.
   */
  litBed: number;
  triangles: number;
  height: number;
  /**
   * The variant's plan box, in its own frame before any yaw: how far its
   * vertices reach along X and Z. What `fitIn` fits a building to a cell
   * with, and what its wall is for `solids.ts` — a box and not the part's
   * footprint radius, which is a bounding circle and put 60% of buildings
   * inside a neighbour.
   */
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  /**
   * Vertices of each source mesh, which is all `compare()` needs to price the
   * instanced version of the same town. It used to keep the built group and
   * every piece's geometry for that alone — the whole kit, unmerged, held for
   * the session for one debug call.
   */
  pieceVertices: number[];
}

/**
 * Share of a variant's marked windows that are dark, and how bright the rest
 * are.
 *
 * **A building whose every window is on at the same brightness is an office
 * block at a trade fair, and the failure is visible at the range where the
 * feature is best.** The variety is drawn twice, at the two scales it is
 * available: here, per window per variant, so one house has a lit upstairs and a
 * dark front room; and again per *instance* in `raise`, so two copies of the
 * same variant standing side by side are not the same house twice. Both are
 * seeded — a town looks the same on every load, which is the kit's whole
 * promise — and neither costs a triangle.
 */
const WINDOW_DARK = 0.28;
const WINDOW_LOW = 0.42;
const WINDOW_HIGH = 1;

/**
 * The dimmest a whole building may be, as a multiplier on its variant's own
 * window pattern.
 *
 * Not zero. A fully dark house among lit ones is a hole in the row rather than a
 * house with nobody in, because at this scale the wall it is cut into is already
 * the darkest thing in the frame — the reading that survives is "the window
 * failed to draw". A third of full is a light left on somewhere at the back,
 * which is what an empty house at ten at night actually looks like.
 */
const INSTANCE_DIM = 0.34;

/**
 * How far a building's bedtime may wander from its variant's, in encoded steps
 * of 3.75 minutes.
 *
 * 16 is an hour either way. It has to stay well under the spread of the bedtimes
 * themselves — `BED_FROM` to `BED_TO` in `src/lights.ts` is seven hours — or the
 * instance draw swamps the variant's and every window in the world goes out at a
 * uniformly random hour, which is the same even wash as none of them going out.
 */
const INSTANCE_BED = 16;

/**
 * Reads a built variant into flat arrays, in the variant's own space.
 *
 * The normals are rotated by the child's own matrix and nothing else: a part's
 * children are placed with rotations and translations, and `validatePart`
 * refuses a group that scales itself, so the inverse-transpose a general merge
 * would need is the rotation back again.
 *
 * `key` seeds the window pattern, and it is the variant's cache key rather than
 * a counter so that the same house is the same house on every load and after
 * somebody adds a part to the registry — the rule `random.ts` exists to keep.
 *
 * **`lottery` is what tells a window from a lamp, and it is a distinction about
 * who owns the switch.** A window is a household's choice, so some of them are
 * dark and the rest are at whatever brightness the room is; a street lamp is the
 * council's, so it is on. Keyed on the part's *kind* rather than on its id
 * because that is the question — anything the kit builds on a plot is somebody's
 * home and anything it stands in the street is not.
 */
function flatten(
  group: THREE.Group,
  key: string | number = 'variant',
  lottery = true,
): Omit<FlatVariant, 'height'> {
  // The positions, normals, colours and the ink's normals are the one merge
  // (`merge.ts`); what is this file's is the windows, walked a second time
  // over the same pieces in the same order.
  const merged: MergePiece[] = [];
  const arrays = mergeMeshes(group, merged);
  const vertices = arrays.triangles * 3;
  const out = {
    ...arrays,
    glow: new Uint8Array(vertices * 2),
    emits: false,
    litBed: 0,
    pieceVertices: merged.map((piece) => piece.count),
  };
  let brightest = 0;

  let window = 0;
  for (const piece of merged) {
    // `ctx.lit` marks the mesh and not the material, so one glass colour can
    // be a window on one part and a doorway on the next.
    const lit = typeof piece.mesh.userData.atlasLit === 'number' ? (piece.mesh.userData.atlasLit as number) : 0;
    // A painted building is one mesh: only the vertices its mask names are
    // glass, and the mask numbers its windows (`ModelFit.windows`).
    const windows = piece.geometry.getAttribute('atlasWindow');
    /** One window's light and its hour, drawn once. */
    const roll = (): [number, number] => {
      // Keyed on the window's ordinal within the variant rather than on the
      // mesh's index in the traversal, so adding a chimney to a part does not
      // relight every one of its windows.
      const rng = rngFrom(key, 'window', window++);
      const glow = !lottery
        ? Math.round(lit * 255)
        : rng.chance(WINDOW_DARK)
          ? 0
          : Math.round(rng.range(WINDOW_LOW, WINDOW_HIGH) * lit * 255);
      // A lamp is the council's and burns till dawn; a window is a household's
      // and goes out when whoever is behind it goes to bed. Same distinction
      // `lottery` already draws, and drawn from a forked seed so that changing
      // one does not move the other.
      const draw = rng.unit();
      const bed = bedtimeByte(draw, !lottery || bedtimeNever(draw));
      if (glow > 0) {
        out.emits = true;
        if (glow > brightest) {
          brightest = glow;
          out.litBed = bed;
        }
      }
      return [glow, bed];
    };
    let glow = 0;
    let bed = 0;
    if (lit > 0 && windows === undefined) [glow, bed] = roll();
    const panes = new Map<number, [number, number]>();
    for (let i = 0; i < piece.count; i++) {
      const vertex = piece.first + i;
      if (windows === undefined) {
        out.glow[vertex * 2] = glow;
        out.glow[vertex * 2 + 1] = bed;
      } else {
        const pane = windows.getX(sourceVertex(piece, i));
        let light: [number, number] = [0, 0];
        if (pane > 0 && lit > 0) {
          light = panes.get(pane) ?? roll();
          panes.set(pane, light);
        }
        out.glow[vertex * 2] = light[0];
        out.glow[vertex * 2 + 1] = light[1];
      }
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < out.position.length; i += 3) {
    minX = Math.min(minX, out.position[i]!);
    maxX = Math.max(maxX, out.position[i]!);
    minZ = Math.min(minZ, out.position[i + 2]!);
    maxZ = Math.max(maxZ, out.position[i + 2]!);
  }
  if (minX > maxX) minX = maxX = minZ = maxZ = 0;
  return { ...out, box: { minX, maxX, minZ, maxZ } };
}

// ---------------------------------------------------------------------------
// The plan: which part stands on which plot
// ---------------------------------------------------------------------------

const KIND_OF = new Map<string, PartKind>(PARTS.map((entry) => [entry.id, entry.kind]));
const FOOTPRINT_OF = new Map<string, number>(PARTS.map((entry) => [entry.id, entry.footprint]));
const footprintOf = (id: string): number => FOOTPRINT_OF.get(id) ?? 0;

/** A circle nothing may be built inside, in the settlement's own local frame. */
interface Keepout {
  x: number;
  z: number;
  radius: number;
}


/**
 * The mix at one plot: `RegionStyle.buildings`, tilted by how urban the place is
 * and how near the middle of it this plot sits.
 *
 * The region table gives one mix per region and it has to serve a Norwegian
 * hamlet and Oslo both, so the weights are re-read rather than replaced —
 * multiplying keeps whatever the table said about *this* region's balance
 * between its own two house types, and only moves the line between houses and
 * blocks. A downtown is the same rule applied twice: `block` weight rises with
 * urbanity and rises again towards the centre, so a metropolis has towers in the
 * middle and houses at the edge without a second table saying so.
 */
function mixAt(style: RegionStyle, urbanity: number, edge: number, room: number): Weighted<string>[] {
  const blockward = (0.25 + 3.5 * urbanity) * (1 + 2 * urbanity * (1 - edge));
  const houseward = 1.4 - 1.2 * urbanity;
  const out: Weighted<string>[] = [];
  for (const entry of style.buildings) {
    if (footprintOf(entry.item) > room) continue;
    const kind = KIND_OF.get(entry.item);
    const weight = entry.weight * (kind === 'block' ? blockward : houseward);
    if (weight > 0) out.push({ item: entry.item, weight });
  }
  return out;
}

/** The entries of a mix that fit this plot, or null if none do. */
function fitting(mix: readonly Weighted<string>[], room: number): Weighted<string>[] | null {
  const ok = mix.filter((entry) => footprintOf(entry.item) <= room);
  return ok.length > 0 ? ok : null;
}


// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------

export interface SettlementStats {
  /** Settlements standing in the world right now. */
  resident: number;
  /** Wanted, and waiting for a frame with room to build them. */
  pending: number;
  /** Triangles of resident geometry. `OutlineEffect` draws them twice. */
  triangles: number;
  /** Buildings, trees and rocks standing. */
  parts: number;
  /** Megabytes of vertex buffers held by resident settlements. */
  megabytes: number;
  /** Settlements built since the world loaded. Rising while you stand still is a bug. */
  built: number;
  /** Milliseconds the last build took. */
  lastBuildMs: number;
  /** How far a settlement is currently built, in world units of slant distance. */
  range: number;
  /** And the same along the ground, which is the number with a meaning in the air. */
  reach: number;
}

export interface Settlements {
  group: THREE.Group;
  stats: SettlementStats;
  /**
   * Where every place stands, as `places.length * 3` floats on the ground.
   *
   * Exposed because it costs a point-in-polygon per place — 29,545 of them, about
   * 30 ms of the world load — and `src/lights.ts` needs the same answer to hang
   * a city's light over it. Two files asking the terrain independently is two
   * chances to disagree about where a town is, and the whole point of the light
   * is that it sits on the town.
   */
  anchors: Float32Array;
  /** Parts a region table names that the registry has no file for. */
  missing: string[];
  /** Anything that refused to build, with the contract's complaint. */
  broken: string[];
  /**
   * Call each frame. Streams towns in and out and spends a few ms building.
   *
   * The camera is optional and omitting it is not a degraded mode: without one
   * the streamer admits by radius exactly as it did before `view.ts`, which is
   * what a headless check or a first frame needs. With one it admits by what is
   * on the screen, which is worth four times the range for the same budget.
   */
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
  /**
   * The people of every standing town inside `radius` of `viewer`, in world
   * space, for `folk.ts` to stand skinned characters on. Appends to `out`.
   */
  folkNear(viewer: THREE.Vector3, radius: number, out: FolkAnchor[]): void;
  /**
   * The street lamps of every standing town inside `radius` of `viewer`, the
   * nearest first, written into `out` as `x, y, z, distance` in world space;
   * returns how many were written, at most `out.length / 4`. What `lights.ts`
   * lights the near ground with, per pixel. See `setNearLamps` there.
   */
  lampsNear(viewer: THREE.Vector3, radius: number, out: Float32Array): number;
  /**
   * The cars parked in every standing town inside `radius` of `viewer` that
   * can be taken and have not been, in world space. Appends to `out`. See
   * `ParkedCar`.
   */
  parkedNear(viewer: THREE.Vector3, radius: number, out: ParkedCar[]): void;
  /**
   * A parked car has been taken: its vertices in the town's buffer are folded
   * away and its wall comes down, so the fleet's vehicle is the only one
   * drawn. Idempotent, and nothing when its town is not standing.
   */
  hideParked(id: string): void;
  /**
   * Whether a parked car has been taken, asked by every build of a town so a
   * car that is somewhere else is not also at its kerb. Until this is set,
   * nothing has been.
   */
  setParkedTaken(test: (id: string) => boolean): void;
  /**
   * How high the made ground stands here, as a radius from the planet's centre,
   * or 0 if this point is not on a town's floor.
   *
   * **The player walked at `elevationAt` and the paving does not, so he waded
   * `GROUND_LIFT` through every high street in the world.** This is the half of
   * the answer that belongs to `settlements.ts`; `roads.ts` publishes
   * `ribbonHeightAt` for the other half, and `player.ts` stands on the higher of
   * the two and the relief. It is the same lift `spotAt` puts the town's own
   * figures on, so the player stands on the floor the crowd is standing on
   * rather than on a second idea of where it is.
   *
   * Cheap by construction: only a *resident* town has a floor at all, the
   * streamer never holds more than `MAX_RESIDENT` of them, and the gate is one
   * dot product each. The `elevationAt` is paid only when the point is actually
   * on paving.
   */
  madeHeightAt(point: THREE.Vector3): number;
  /**
   * Where the sward in `vegetation.ts` may stand at `direction` (a unit
   * vector), given the drawn land's radius there: a standing town's lawn, the
   * land wherever no standing floor covers it, or null. A radius from the
   * planet's centre.
   */
  swardAt(direction: THREE.Vector3, landRadius: number, margin: number): number | null;
  /**
   * The floors raised or dropped since `since` (a version this returned
   * before), each as a town's up and the reach of its floor, written into
   * `into` as `[x, y, z, reach]` quadruples; returns the version now. A reader
   * that has fallen more than the ring behind gets `-1` in `into[0]`, and
   * should treat everything as changed.
   */
  floorChanges(since: number, into: number[]): number;
  /**
   * Pushes a body of `radius` out of every building it overlaps at `point`.
   *
   * Writes into `push` the world-space displacement, along the ground, that
   * clears it — zero when nothing is hit — and returns whether anything was.
   * Only a standing town has walls, the same rule as its floor.
   */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /**
   * `collide` for a body in the air: only the buildings whose roofs are over
   * `point`'s own height (its length) push it. A balloon's basket and a plane
   * low over a town ask this; a roof it clears is not a wall.
   */
  collideAloft(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** Whether a point is inside a building's walls and under its roof. For the camera. */
  blocksSight(point: THREE.Vector3): boolean;
  /**
   * The nearest point to `point` where a body of `radius` stands clear of every
   * building, written into `out`; false when `point` already is clear.
   */
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /** Builds a named settlement and reports it, merged against instanced. */
  compare(name?: string): unknown;
  /**
   * Builds every `step`th settlement on the planet and reports the distribution.
   *
   * **The one measurement this file could not take from a screenshot.** Density
   * is a claim about the median town and there are 29,545 of them; the numbers
   * that have driven every decision here — "the median settlement is 9 parts",
   * "312 places came out with nothing standing on them" — were taken by
   * replaying the builder over the whole dataset, and until this existed that
   * replay had to be written again each time. It is in the source rather than in
   * a scratch file for the same reason `compare` is: the number is an argument
   * about the design and it should be re-takeable in one call.
   *
   * Every town it builds is dropped again unless it was already standing, so it
   * costs a few seconds and leaves the world as it found it.
   */
  survey(step?: number, near?: boolean): unknown;
  /** One mesh per program this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Object3D[];
}

/**
 * A single material for every settlement on the planet, and the reason a town is
 * one mesh rather than two hundred.
 *
 * **Merged beats instanced here, and not narrowly.** Measured with
 * `compare()` on real settlements, merging a town into one vertex-coloured
 * buffer against one `InstancedMesh` per (part, variant, piece):
 *
 * ```
 *                    merged            instanced
 *   Paris     1 draw   5,628 tris     218 draws  (0.58 MB vs 0.29)
 *   Tokyo     1 draw  14,184 tris     236 draws  (1.46 MB vs 0.38)
 *   Beijing   1 draw   4,976 tris     244 draws  (0.51 MB vs 0.35)
 * ```
 *
 * Instancing wins on memory by two to four times, because a merged town stores
 * every vertex of every house and an instanced one stores a matrix. It loses on
 * the number that matters by two hundred times, and the memory it saves is not
 * scarce: when the streamer kept 48 towns they peaked at 12.5 MB against the
 * land mesh's 83.
 *
 * The count is not an artefact of instancing per town, either. Instances could
 * be pooled across every resident settlement of one region — but the pool is
 * still a mesh per (part, variant, colour) and a region uses about 220 of them,
 * so the floor is ~220 draw calls whether one town is standing or forty. Merged
 * costs one *per town*. That was a margin of four when the streamer kept 48;
 * it keeps `MAX_RESIDENT` now, 140 at detail 1 and 727 at 6, so the crossover
 * of about two hundred resident is inside the knob's range above about detail
 * 1.35 — and what still decides it for merging is the next paragraph: what is
 * resident is not what is drawn.
 *
 * Two things fall out of merging that instancing would not have given:
 * frustum culling is per town, because each mesh has its own bounding sphere
 * (measured with 48 resident, they cost 12 draw calls at ground level, not
 * 96); and
 * `src/outline.ts`'s instancing fix — which this file was expected to need —
 * turns out not to be on the path at all. The reflected-basis trap still is:
 * a negative determinant flips the winding of merged triangles exactly as it
 * flips an instance's, so `raise` asserts the settlement's basis is proper.
 *
 * The material itself is the land mesh's trick: colour rides on the vertices, so
 * it never changes. `createToonRamp` registers the texture with `theme.ts`, so a
 * town steps through the same four cel bands as the coastline and follows the
 * sun into `NIGHT_MOOD` with it.
 *
 * **And the windows ride on the vertices too, for the same reason.** A lit
 * window is an emissive surface, emission is a material property, and a town is
 * one material — so the obvious build is a second mesh per settlement carrying
 * the glazing, which doubles the resident draw calls and is doubled again by the
 * outline pass. `lightWindows` puts a one-byte attribute on the buffer instead
 * and hooks the material's own `<emissivemap_fragment>`: no second mesh, no
 * second material, and the terminator computed per *vertex* from its own
 * position rather than per frame from the player's. See `src/lights.ts`.
 */
function townMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  // Every town buffer carries `outlineNormal` (see `FlatVariant.outline`).
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01], outlineNormal: true };
  lightWindows(material);
  /**
   * **The ground a town draws is the land's, and it takes the land's marks.**
   * A lawn and the edge slope are the land's own colour, and without the
   * patches the land and the sward draw with (`GROUND_MARKS_GLSL`) they came
   * out a flat shade darker and bluer than the field they meet: (144, 162,
   * 102) against about (155, 172, 97) beside Madrid (2026-09-24), a band
   * round every town. The patches only move a green, so the paving, the
   * streets and the houses are untouched.
   */
  const windows = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    windows.call(material, shader, renderer);
    bindGroundWeather(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAtlasPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAtlasPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAtlasPos;\n${GROUND_MARKS_GLSL}\n${groundWeatherGLSL()}`)
      // The weather first, so a lawn under snow takes the patches' tone on white.
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n  ${groundWeatherChunk('vAtlasPos')}\n  ${groundPatchesChunk('vAtlasPos')}`,
      );
  };
  return material;
}

interface Slot {
  place: Place;
  /** Index into the places this streamer was given, which is what a vehicle id names. */
  index: number;
  style: RegionStyle;
  /** What the ground here is made of. Keyed on `style.id`; see `scenery/ground.ts`. */
  ground: GroundStyle;
  /** `radiusOf(place)`, asked once. */
  radius: number;
  seed: string;
  /** Unit vector at the settlement, so the distance test costs no trigonometry. */
  direction: THREE.Vector3;
  anchor: THREE.Vector3;
  mesh: THREE.Mesh | null;
  triangles: number;
  parts: number;
  bytes: number;
  /** What the plan asked for, and where the plots that did not make it went. */
  planned: number;
  drowned: number;
  buried: number;
  /**
   * Buildings standing, as opposed to `parts` — which counts trees, lamps,
   * people and parked cars too.
   *
   * It is the number `survey` reads, and it is the one that says whether a
   * place reads as inhabited: a settlement of nine parts, seven of which are
   * shrubs, is a clearing.
   */
  buildings: number;
  /** Cells of floor under it. See `Ground.paved`; `survey` reads it. */
  paved: number;
  /**
   * The floor this town is standing on, for `madeHeightAt`, or null while it is
   * not standing.
   *
   * **The town's plinth is the one surface in this world a player walks on that
   * the terrain does not know about**, and this is the whole of what a point
   * query needs to find it: the paved cell set, the lattice it is on, and the
   * frame the cells are measured in, which is the place's own: a town no
   * longer steps aside from a monument (see `raise`), because its gates are
   * where the roads arrive and would go with it.
   *
   * It costs a `Set` of a few hundred integers a resident town, which is the
   * same set `buildGround` already built and used to throw away.
   */
  floor: {
    up: THREE.Vector3;
    across: THREE.Vector3;
    north: THREE.Vector3;
    field: FloorField;
    /** Angular bound of the paved set plus its one course of edge slope, for the cheap gate. */
    cosBound: number;
    /**
     * The town's walls: one box per standing building, in the same frame as
     * the floor, or null when nothing with a wall stands. Built with the
     * floor and dropped with it, so a town that is not standing blocks
     * nothing. See `collide`.
     */
    solids: SolidField | null;
    /** The square and its street band, for `swardAt`. */
    grid: TownGrid;
    band: number;
    /** `Ground.lawn`, kept with the floor it was cut from. */
    lawn: Uint8Array | null;
  } | null;
  failed: boolean;
  /**
   * Whether this town was built with people and parked vehicles in it.
   *
   * Held on the slot rather than derived, because the mesh is baked: the only
   * way to change the answer is to drop the town and raise it again, and the
   * scan has to be able to see that the standing mesh disagrees with what the
   * rank now says. See `PEOPLED_RANK`.
   */
  peopled: boolean;
  /**
   * What the standing mesh was built with, which `peopled` may have left
   * behind; and whether that difference is worth a rebuild (`stale`). A stale
   * town stays drawn until its replacement is built, and the two trade places
   * in one frame — see `rebuild`.
   */
  builtPeopled: boolean;
  stale: boolean;
  /**
   * Where this town's people stand, in world space, while it is standing.
   * Nobody is drawn here: `folk.ts` dresses the nearest of them as skinned
   * characters, because a person merged into the town's buffer cannot move.
   *
   * Resolved into the world once, at `raise`, and handed out as the same
   * objects every frame by `folkNear`, which only writes their `distance`: it
   * used to clone a position and a quaternion a person a frame for every town
   * within reach, and walk all 29,545 slots to find them.
   */
  folk: FolkAnchor[];
  /**
   * The heads of this town's street lamps, in world space, three floats each,
   * for `lampsNear`. Resolved once at `raise`, like `folk`, because the town
   * does not move while it stands.
   */
  lampHeads: Float32Array | null;
  /** The parked cars in the standing mesh that can be taken; see `ParkedCar`. */
  parked: Bay[];
}

/**
 * A car parked at a town's kerb that somebody can get into.
 *
 * **It is merged into the town like everything else that stands still**, which
 * is what lets a city park a dozen cars for no draw call; and it becomes a
 * vehicle of the fleet (`fleet.ts`) the moment anybody takes it. The two
 * cannot both be drawn, so the town remembers where in its one buffer each
 * such car's vertices are, and `hideParked` folds them to a point — and leaves
 * the car out altogether whenever the town is built again (`parkedTaken`).
 *
 * `id` names it the way the fleet names a vehicle, `<model>:<placeIndex>:<n>`,
 * with `n` counting from `PARKED_SLOT` along the town's bays: a function of the
 * town's own build, and so the same on every client.
 */
export interface ParkedCar {
  id: string;
  /** The craft that takes its place: `PARKED_CRAFT` of the traffic kit's vehicle. */
  model: string;
  /** On the floor at the kerb, in the world. */
  position: THREE.Vector3;
  /** The way it faces, along the kerb: a unit tangent. */
  forward: THREE.Vector3;
}

/** A `ParkedCar` and where it is in its town's buffer and walls. */
interface Bay extends ParkedCar {
  start: number;
  count: number;
  solid: Solid;
  hidden: boolean;
}

export interface SettlementOptions {
  /** Share the monument context, so one material cache serves the whole world. */
  context?: MonumentContext;
  /** Monuments, so nothing is built inside one. */
  monuments?: readonly Placement[];
  /**
   * The network, for one thing only: which gates of each town a road comes in
   * by, because each of them carries a light (`gateGlow` in `scenery/grid.ts`)
   * that the floor and the road's ribbon share. A town used to draw the last
   * stretch of every road itself and aimed it with this; `roads.ts` lays the
   * ribbon to the square's gates now, and the town draws nothing of it.
   */
  roads?: readonly Road[];
}

export function createSettlements(
  world: World,
  places: readonly Place[],
  options: SettlementOptions = {},
): Settlements {
  const group = new THREE.Group();
  group.name = 'settlements';

  /** The gates each town's roads come in by, as indices into `gatesOf` for its square. */
  const roadGates = new Map<Place, number[]>();
  for (const road of options.roads ?? []) {
    for (const [end, gate] of [[road.a, road.gateA], [road.b, road.gateB]] as const) {
      const place = places[end];
      if (place === undefined) continue;
      const list = roadGates.get(place) ?? [];
      if (!list.includes(gate)) list.push(gate);
      roadGates.set(place, list);
    }
  }

  const ctx: SceneryContext = createSceneryContext(options.context);
  const material = townMaterial();
  const missing: string[] = [];
  const broken: string[] = [];

  const continentOf = new Map<string, string>(
    world.countries.map((country) => [country.iso, country.continent]),
  );

  const slots: Slot[] = places.map((place, index) => {
    const direction = unitAt(place.lat, place.lon, new THREE.Vector3());
    const style = regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat);
    return {
      place,
      index,
      style,
      ground: groundStyleFor(style.id),
      radius: radiusOf(place),
      // Identity, not order: the same town on every load and after the list
      // grows. Latitude and longitude are in the string because two places do
      // share a name — the United States has five Springfields.
      seed: `${place.name}@${place.lat},${place.lon}`,
      direction,
      // Asked once, here. The relief does not move, and the alternative is a
      // point-in-polygon query per settlement per frame.
      anchor: direction.clone().multiplyScalar(groundRadius(world, direction)),
      mesh: null,
      triangles: 0,
      parts: 0,
      bytes: 0,
      planned: 0,
      drowned: 0,
      buried: 0,
      buildings: 0,
      paved: 0,
      floor: null,
      failed: false,
      peopled: false,
      builtPeopled: false,
      stale: false,
      folk: [],
      lampHeads: null,
      parked: [],
    };
  });


  // The scan is a typed-array pass, not an object walk: 29,545 slots at three
  // floats each, read straight out of one buffer.
  const anchors = new Float32Array(slots.length * 3);
  slots.forEach((slot, i) => {
    anchors[i * 3] = slot.anchor.x;
    anchors[i * 3 + 1] = slot.anchor.y;
    anchors[i * 3 + 2] = slot.anchor.z;
  });

  const monumentSites = (options.monuments ?? []).map((placement) => {
    return {
      direction: unitAt(placement.lat, placement.lon, new THREE.Vector3()),
      radius: (placement.footprint ?? WIDEST_FOOTPRINT) + MONUMENT_CLEARANCE,
    };
  });

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
      // The kit's own promise, checked once per variant rather than never: a
      // part that breaks the contract is broken across a whole continent, so a
      // silent one is far worse here than a silent monument.
      const problems = validatePart(entry, built);
      if (problems.length > 0) throw new Error(problems.join('; '));
    } catch (error) {
      broken.push(`${key}: ${String(error)}`);
      variants.set(key, null);
      return null;
    }
    // A lamp is not a household: see `flatten`.
    const flat = flatten(built, key, entry.kind !== 'scatter');
    const value: FlatVariant = { ...flat, height: measure(built).height };
    variants.set(key, value);
    return value;
  }

  /**
   * A vehicle, merged at its **placed** scale, cached per region and variant.
   *
   * `placedScale` is baked into the vertices here exactly as it is in
   * `life.ts`, and for the same reason: a non-uniform z scale on a mesh needs
   * the inverse transpose for its normals, and `OutlineEffect` builds its hull
   * from those normals. `flatten` already does the normal matrix properly,
   * which is why a scaled group can go through it unchanged.
   *
   * **A parked vehicle carries no rider**, which is the one place this differs
   * from the moving traffic. The kit's rule is that a bicycle with nobody on it
   * is a ghost — that is about a bicycle *going somewhere*. One at a kerb is a
   * bicycle that has been left there, and a rider sitting motionless on a
   * stationary bike is the odder of the two.
   */
  const traffic = createTrafficContext(ctx);
  const parked = new Map<string, FlatVariant | null>();
  const vehicleById = new Map<string, Vehicle>(VEHICLES.map((entry) => [entry.id, entry]));
  function parkedVariant(style: TrafficStyle, id: string, index: number): FlatVariant | null {
    const key = `parked:${id}:${style.id}:${index}`;
    const cached = parked.get(key);
    if (cached !== undefined) return cached;
    let value: FlatVariant | null = null;
    const entry = vehicleById.get(id);
    if (entry === undefined) {
      if (!missing.includes(id)) missing.push(id);
    } else {
      try {
        const built = entry.build(traffic, vehicleRng(entry, style, index), style);
        const scale = placedScale(entry);
        built.scale.set(scale[0], scale[1], scale[2]);
        value = { ...flatten(built, key, false), height: placedSize(entry)[2] };
      } catch (error) {
        broken.push(`${key}: ${String(error)}`);
      }
    }
    parked.set(key, value);
    return value;
  }

  // ------------------------------------------------------------------
  // Building one settlement
  // ------------------------------------------------------------------

  const up = new THREE.Vector3();
  const north = new THREE.Vector3();
  const across = new THREE.Vector3();
  /** `gradeAt`'s answer for the country round a town, reused. */
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const basis = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const local = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scaleVector = new THREE.Vector3();
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  /** Where one lamp stands, reused: `raise` places up to thirty of them a town. */
  const lampAt = new THREE.Vector3();
  const keepouts: Keepout[] = [];

  /** Where a local offset from the settlement's centre lands on the sphere. */
  function directionAt(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    return target
      .copy(up)
      .addScaledVector(across, x / PLANET_RADIUS)
      .addScaledVector(north, z / PLANET_RADIUS)
      .normalize();
  }

  /** Adds the cells whose centres a solid's footprint covers, and the one it stands in. */
  function pavedUnder(solid: Solid, grid: TownGrid, into: Set<number>): void {
    const reach = Math.hypot(solid.hx, solid.hz);
    const c0 = cellIndex(grid, solid.x - reach);
    const c1 = cellIndex(grid, solid.x + reach);
    const r0 = cellIndex(grid, solid.z - reach);
    const r1 = cellIndex(grid, solid.z + reach);
    into.add(cellKey(cellIndex(grid, solid.x), cellIndex(grid, solid.z)));
    for (let col = c0; col <= c1; col++) {
      for (let row = r0; row <= r1; row++) {
        const dx = cellCentre(grid, col) - solid.x;
        const dz = cellCentre(grid, row) - solid.z;
        const a = dx * solid.cos + dz * solid.sin;
        const b = -dx * solid.sin + dz * solid.cos;
        if (Math.abs(a) <= solid.hx && Math.abs(b) <= solid.hz) into.add(cellKey(col, row));
      }
    }
  }

  /**
   * A standing building's wall, for `solids.ts`: its plan box turned by its yaw
   * and scaled, centred where the box's own centre lands, and as tall as the
   * variant from the terrace it stands on.
   */
  function solidOf(flat: FlatVariant, x: number, z: number, yaw: number, scale: number, level: number): Solid {
    const box = flat.box;
    const cx = (box.minX + box.maxX) * 0.5 * scale;
    const cz = (box.minZ + box.maxZ) * 0.5 * scale;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return yawed(
      x + cx * c + cz * s,
      z - cx * s + cz * c,
      yaw,
      (box.maxX - box.minX) * 0.5 * scale,
      (box.maxZ - box.minZ) * 0.5 * scale,
      PLANET_RADIUS + level + GROUND_LIFT + flat.height * scale,
    );
  }

  /**
   * The lattice of the town being built: its square (which `cornerAt` reads),
   * its seed, and the elevation every terrace is quantised about.
   *
   * **Hoisted out of `buildGround`, and that is the terracing in one sentence.**
   * The floor used to be decided after the buildings were placed, because a
   * floor was a constant offset from the relief and a building could be seated
   * against the relief directly. A terrace is a *choice* — which of a few level
   * surfaces this cell is cut to — and a house has to stand on the same one its
   * cell will be paved at, so the choice has to exist before either.
   */
  let townGridNow: TownGrid = townGrid(radiusFor(0));
  let baseElevation = 0;
  /** One lattice corner per key, and one terrace per cell. `raise` clears both. */
  const corners = new Map<number, Corner>();
  const terraces = new Map<number, number | null>();

  /**
   * One corner of the lattice, cached: where it is, how high the ground is, and
   * which way up is.
   *
   * Cached because the four cells around it each ask, and each answer costs an
   * `elevationAt`.
   */
  function cornerAt(i: number, j: number): Corner {
    const key = cellKey(i, j);
    const known = corners.get(key);
    if (known !== undefined) return known;
    // Not jittered any more: the square's edge is where a road arrives, and a
    // ragged kerb is a road ending against a zigzag. See `buildGround`.
    const x = cornerOffset(townGridNow, i);
    const z = cornerOffset(townGridNow, j);
    directionAt(x, z, groundDir);
    // One query answers both questions: elevation 0 *is* the sea, because the
    // coast is a shelf with a cliff and there is no mesh below it.
    const elevation = world.elevationAt(groundDir);
    groundLocal
      .copy(groundDir)
      .multiplyScalar(PLANET_RADIUS + Math.max(0, elevation))
      .sub(origin)
      .applyMatrix4(inverse);
    // `inverse` is the basis transposed and carries no translation, so it takes
    // a direction as readily as a point.
    localUp.copy(groundDir).applyMatrix4(inverse);
    const made: Corner = {
      x, z,
      lx: groundLocal.x, ly: groundLocal.y, lz: groundLocal.z,
      elevation: Math.max(0, elevation),
      ux: localUp.x, uy: localUp.y, uz: localUp.z,
      sea: elevation <= 0,
    };
    corners.set(key, made);
    return made;
  }

  /** That corner, raised to an elevation of its own rather than the ground's. */
  function pointAt(corner: Corner, elevation: number, into: number[]): number[] {
    const rise = elevation - corner.elevation;
    into[0] = corner.lx + corner.ux * rise;
    into[1] = corner.ly + corner.uy * rise;
    into[2] = corner.lz + corner.uz * rise;
    return into;
  }

  const centreDir = new THREE.Vector3();

  /**
   * The town being raised, as `grid.ts` asks about its ground: the corners
   * `cornerAt` has cached, the sea by each cell's centre, and the anchor's own
   * elevation as the base every terrace is quantised about.
   */
  const townGround: TownGround = {
    corner: (i, j) => cornerAt(i, j).elevation,
    sea: (col, row) =>
      world.elevationAt(directionAt(cellCentre(townGridNow, col), cellCentre(townGridNow, row), centreDir)) <= 0,
    get base() {
      return baseElevation;
    },
  };

  /**
   * The elevation this cell's terrace is cut to, or null where the town does
   * not pave it.
   *
   * **`cellLevel` in `grid.ts` is the rule**, and this only reads what `raise`
   * worked out with it for the whole square before anything was placed
   * (`townTerraces`): a cell's level is its street's, which depends on the cell
   * across the street, so it is a question about the town rather than about the
   * cell. What the refusals and the fill cost is measured in `survey`, town by
   * town.
   */
  function terraceAt(col: number, row: number): number | null {
    return terraces.get(cellKey(col, row)) ?? null;
  }

  /** Rebuilds the tangent frame, the ground origin and the keepouts about `up`. */
  function frameAt(): void {
    // The frame `placement.ts` builds, for the same reason: +Z along the ground
    // towards the pole, so every settlement on the planet is squared to the same
    // thing and a street reads as a street.
    // One definition, shared with the roads that arrive at the gates. X cross
    // Y is Z, so X is Y cross Z: `makeBasis(east, up, north)` is the
    // reflection that fills an instanced mesh with ink, and a merged one with
    // inside-out triangles.
    townFrame(up, across, north);
    basis.makeBasis(across, up, north);
    origin.copy(up).multiplyScalar(PLANET_RADIUS + world.elevationAt(up));
    inverse.copy(basis).transpose();

    keepouts.length = 0;
    for (const monument of monumentSites) {
      // Everything inside a settlement is within a few hundredths of a radian of
      // its centre, so the tangent components *are* the local coordinates.
      if (monument.direction.dot(up) < 0.999) continue;
      keepouts.push({
        x: monument.direction.dot(across) * PLANET_RADIUS,
        z: monument.direction.dot(north) * PLANET_RADIUS,
        radius: monument.radius,
      });
    }

  }

  // ------------------------------------------------------------------
  // The ground: paving, streets, the square, and the roads out
  // ------------------------------------------------------------------

  /**
   * Flat arrays in the settlement's own tangent frame, appended to the town's
   * one buffer. Plain `number[]` and not typed arrays because the length is not
   * known until the last cell has been accepted or refused — a coastal town
   * loses whole courses of it to the water.
   */
  interface Ground {
    position: number[];
    normal: number[];
    color: number[];
    /**
     * Two bytes a vertex, exactly the pair a part already carries: how lit this
     * patch of floor is, and the hour it goes out.
     *
     * **This is the whole of "the light lands on something", and it costs
     * nothing.** The attribute is on the buffer already — `raise` allocates
     * `total * 2` bytes and the ground's share was left at zero because paving
     * does not glow. It does now, and the arithmetic is the same one the
     * windows use: `lightWindows` adds `atlasLight * gain * x`, gated by the
     * vertex's own terminator and its own bedtime, so a pool obeys the sweep
     * and the clock for free. See `poolFor`.
     */
    glow: number[];
    /**
     * Where a street lamp stands, as triples in the settlement's own frame.
     *
     * Collected here and built by `raise`, because a lamp is a *part* — it goes
     * through `variantOf` and the merged buffer like every house — and this is
     * the only place that knows where the streets are. Returning the positions
     * rather than the geometry is what keeps `buildGround` about the floor.
     */
    lamps: number[];
    /**
     * Each lamp's yaw, one a lamp: its arm (a kit standard's reaches over
     * local -z) turned to the street it stands at.
     */
    lampYaws: number[];
    /**
     * The traffic lights of a city's middle crossing (`SIGNAL_PART`), as
     * quadruples: a position in the settlement's frame and the yaw that turns
     * the light's face to the traffic it serves.
     */
    signals: number[];
    /**
     * Where a person stands, as runs of `FOLK_STRIDE`, and where a vehicle is
     * parked, as quadruples with a yaw on the end.
     *
     * A person's run is the spot, the two ends of the stretch of their own
     * street they may stroll along (both the spot itself where there is no
     * room: a flight of steps, a parked car or a landmark's keepout in the way),
     * the yaw that turns them to a partner or NaN for a free one, and +1 or -1
     * on the two halves of a pair talking to each other, 0 otherwise. All in
     * the settlement's frame, at the paving's lift.
     *
     * Same arrangement as `lamps` and for the same reason: this is the only
     * place that knows where the streets are, and returning positions rather
     * than geometry keeps `buildGround` about the floor. The yaw is on the
     * vehicle and not on the person because **a parked car has to be along the
     * kerb and a person does not have to be anything** — a crowd that all faced
     * the same way would read as a parade.
     */
    folk: number[];
    kerbs: number[];
    /**
     * Which cells are lawn, one byte a cell by `col * cells + row`: a yard of the
     * land's own ground (`GroundStyle.yard` is `land`) that is not paved, not the
     * square and not under a landmark. Null in a region whose yards are earth or
     * stone. What grows on it is `vegetation.ts`'s sward; see `swardAt`.
     */
    lawn: Uint8Array | null;
    /**
     * How many cells came out as floor.
     *
     * Reported because **paved cells are the density claim and triangles are
     * not**: a plain cell is two triangles either way, so a rule that halves
     * the paved ground moves the town's triangle count by under a percent and
     * moves what it looks like from 90 units up completely. `survey` prints it
     * against the buildings standing on it.
     */
    paved: number;
    /**
     * The paved set itself, with the terrace each cell was cut to, which is what
     * a foot has to be able to ask about.
     *
     * Returned rather than rebuilt: the floor is the square less what the
     * terrace and the sea refuse, and a second implementation of that
     * in a point query is a plinth the player stands on where the town has not
     * paved. See `Slot.floor` and `floorLiftAt`.
     */
    terraces: Map<number, number>;
    /**
     * The whole floor as a foot finds it — the terraces, the edge slope and
     * the flights — which is what the geometry above was drawn out of. `raise`
     * hands it to `Slot.floor` as it is. See `buildFloor` in `floor.ts`.
     */
    field: FloorField;
  }

  /** One lattice corner: where it is, and whether it is standing in the sea. */
  interface Corner {
    /** Local plane coordinates: the lattice corner, exactly. */
    x: number;
    z: number;
    /** The same point in the settlement's frame, at the ground with no lift on it. */
    lx: number;
    ly: number;
    lz: number;
    /**
     * The ground's own height above sea level here, and the local direction
     * "up" at this corner.
     *
     * **A terrace is a level surface and a level surface is not a constant
     * `ly`.** The town's frame is flat and the planet is not, so a cell 150
     * units out sits 0.7 units lower in the frame than one at the centre at the
     * same elevation — a third of a step, on a face whose whole job is to be
     * one plane. Carrying the corner's own up means any height can be asked for
     * exactly: `pointAt` walks along it from the ground the corner reported.
     */
    elevation: number;
    ux: number;
    uy: number;
    uz: number;
    sea: boolean;
  }


  const groundDir = new THREE.Vector3();
  const groundLocal = new THREE.Vector3();
  /** The local "up" at a lattice corner; see `Corner.ux`. */
  const localUp = new THREE.Vector3();
  const faceA = new THREE.Vector3();
  const faceB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const floor = new THREE.Color();
  const apronCorner0 = new THREE.Color();
  const apronCorner1 = new THREE.Color();
  const apronCorner2 = new THREE.Color();
  const apronCorner3 = new THREE.Color();
  /** The paving of one cell: the region's floor, times the cell's own tone. */
  const cellFloor = new THREE.Color();
  const roadColor = new THREE.Color();
  const walkColor = new THREE.Color();
  const lineColor = new THREE.Color();
  const landColor = new THREE.Color();
  const yardColor = new THREE.Color();
  const plazaColor = new THREE.Color();
  /**
   * The plinth's side, top and bottom.
   *
   * A tone of the paving and not a colour of its own: the kerb is the same
   * stone seen edge-on, so it is the floor walked towards `KERB_INK` — a dark
   * *warm* brown rather than a neutral, which is the same reason `roads.ts`
   * wears its trunks with one and the reason `GROUND_STYLES` has one `steel` in
   * it. The face is already a shading step, because a vertical surface takes a
   * different band of the toon ramp than the ground beside it; the tone is what
   * keeps it from reading as a shadow in the two regions whose paving is nearly
   * white.
   */
  const kerbTop = new THREE.Color();
  const kerbFoot = new THREE.Color();
  const KERB_INK = new THREE.Color(0x2a1410);

  /**
   * Something standing on the floor that lights the floor: a street lamp, or a
   * building with a window on.
   *
   * `bed` is the hour it stops, on `lights.ts`'s encoded clock, and **it is the
   * field that says whose light this is**. A lamp's is `255`, which that file
   * reads as never; a building's is its brightest window's, so the forecourt
   * goes dark when the room behind the glass does. Nothing here decides that
   * twice — the byte is the same byte a window carries and it is written by the
   * same `bedtimeByte`.
   */
  interface Emitter {
    x: number;
    z: number;
    /**
     * The radius inside which the pool is at full, in world units.
     *
     * **A lamp's is zero and a building's is its own footprint, and getting that
     * wrong put the brightest part of every house's light under the house.** A
     * pool centred on a plot and falling from the middle spends its whole ramp
     * on floor the building is standing on, and what is left over the wall is
     * whatever the curve has not already spent — on the kit's median 7.0-unit
     * footprint against a 12.65-unit plot pitch, the cell corners nearest the
     * house sit at 0.30 of full and the far ones at 0.13, which is a plot-wide
     * square of evenly lifted paving with no peak anywhere in it.
     *
     * Measured over the same 140 resident towns and the same 116,118 floor
     * vertices, the emitters' `inner` set to 0 against the footprint:
     *
     * ```
     *                    floor lit   mean of the lit   at 60-100% of peak
     *   inner = 0          58.0%          0.314              7,583
     *   inner = footprint  58.8%          0.547             31,356
     * ```
     *
     * **The same floor is lit either way and it is 4.1 times as much of it near
     * full**, because the ramp now runs across ground somebody can see. That is
     * the wash `poolByte`'s square falloff exists to prevent, arriving through
     * the geometry instead of through the curve.
     */
    inner: number;
    /** Where the pool ends, in world units from the same centre. */
    reach: number;
    /** How bright at full, 0 to 1, before `poolByte`'s own peak. */
    strength: number;
    bed: number;
  }

  /**
   * The emitters whose pools can reach the faces being pushed right now.
   *
   * **Scoped to the cell rather than looked up per vertex, and that is the
   * whole of what makes this free.** A town holds up to thirty lamps and a
   * dozen lit buildings against a floor of one to three thousand vertices, and
   * asking every vertex about every emitter is that product. A cell is 11 to 21
   * units across against a reach of 14, so the list a cell can possibly need is
   * filtered once for the cell and is two or three entries long.
   *
   * Measured with `atlas.settlements.compare(name)`, which drops a town and
   * raises it again, 21 reps, **best of** rather than median because the
   * machine was loaded and a rep caught by a collection reads as 20 ms of
   * building. Same code, the emitter list stubbed empty against the real one:
   *
   * ```
   *                     triangles   raise, no pools   with pools
   *   Wassertrudingen      1,916         0.80 ms         0.80 ms
   *   Nordlingen           2,434         1.10            1.10
   *   Ulm                  4,038         1.30            1.50
   *   Augsburg             4,832         1.70            1.90
   * ```
   *
   * **0.0 to 0.2 ms a town against a `BUILD_BUDGET_MS` of 3.5, and the triangle
   * counts are identical either way** — which is the claim that matters: a pool
   * is a value on vertices the floor already had.
   */
  let litHere: readonly Emitter[] = [];
  const NO_EMITTERS: readonly Emitter[] = [];

  /** The emitters whose reach touches a disc of `radius` about a point. */
  const litAround = (
    emitters: readonly Emitter[], x: number, z: number, radius: number,
  ): readonly Emitter[] => {
    if (emitters.length === 0) return NO_EMITTERS;
    const near: Emitter[] = [];
    for (const emitter of emitters) {
      const dx = x - emitter.x;
      const dz = z - emitter.z;
      const span = emitter.reach + radius;
      if (dx * dx + dz * dz < span * span) near.push(emitter);
    }
    return near.length === 0 ? NO_EMITTERS : near;
  };

  /**
   * What one point of floor is lit to, as the two bytes the buffer carries.
   *
   * **The brightest emitter wins outright; the pools do not add.** Summing is
   * what light does and it is not what this buffer can say, because a vertex
   * carries *one* bedtime and a sum has no single owner: a house's spill added
   * to a lamp's pool would take the lamp's hour and stay lit all night, which
   * is the one thing `BED_FROM` exists to prevent. Taking the maximum makes
   * every patch of ground belong to exactly one light and go out with it, and
   * what it costs is that two overlapping pools meet at a ridge instead of a
   * bright seam — which at `WINDOW_GAIN` is invisible, because the core of
   * either one is already clipping.
   */
  const poolFor = (out: Ground, x: number, z: number): void => {
    let best = 0;
    let bed = 0;
    for (const emitter of litHere) {
      const value = poolAt(emitter.strength, Math.hypot(x - emitter.x, z - emitter.z), emitter.inner, emitter.reach);
      if (value > best) {
        best = value;
        bed = emitter.bed;
      }
    }
    out.glow.push(best, bed);
  };

  /**
   * One triangle of ground, wound so it faces the sky and flat-shaded.
   *
   * The normal is computed and the winding flipped to match, the way `globe.ts`
   * does it, rather than being reasoned about: the ground is tilted and a cell
   * on a terrace is not level in the town's flat frame, so "which way round is anticlockwise" is not a question
   * worth answering twice. Non-indexed with one normal per face is not an
   * oversight either — it is what gives the land and every part in the kit their
   * flat facets, and a smoothed ground would take the cel bands off it.
   */
  function pushFace(
    out: Ground,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    ca: THREE.Color, cb: THREE.Color, cc: THREE.Color,
  ): void {
    faceA.set(bx - ax, by - ay, bz - az);
    faceB.set(cx - ax, cy - ay, cz - az);
    faceNormal.crossVectors(faceA, faceB);
    const area = faceNormal.length();
    // A degenerate face carries a meaningless normal and nothing else. Two
    // lattice corners can land on top of each other where a cell straddles a
    // shelf; the triangle is invisible and its normal is not.
    if (area < 1e-4) return;
    faceNormal.multiplyScalar(1 / area);
    let flip = false;
    if (faceNormal.y < 0) {
      faceNormal.negate();
      flip = true;
    }
    const p1x = flip ? cx : bx, p1y = flip ? cy : by, p1z = flip ? cz : bz;
    const p2x = flip ? bx : cx, p2y = flip ? by : cy, p2z = flip ? bz : cz;
    const k1 = flip ? cc : cb;
    const k2 = flip ? cb : cc;
    out.position.push(ax, ay, az, p1x, p1y, p1z, p2x, p2y, p2z);
    for (let v = 0; v < 3; v++) out.normal.push(faceNormal.x, faceNormal.y, faceNormal.z);
    out.color.push(ca.r, ca.g, ca.b, k1.r, k1.g, k1.b, k2.r, k2.g, k2.b);
    // In the order the positions went in, not in the order the arguments came:
    // the winding flip above swaps two of the three, and a pool that does not
    // follow it lights the wrong corner of every other triangle.
    poolFor(out, ax, az);
    poolFor(out, p1x, p1z);
    poolFor(out, p2x, p2z);
  }

  const pushQuad = (
    out: Ground,
    a: number[], b: number[], c: number[], d: number[],
    ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, cd: THREE.Color,
  ): void => {
    pushFace(out, a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, c[0]!, c[1]!, c[2]!, ca, cb, cc);
    pushFace(out, a[0]!, a[1]!, a[2]!, c[0]!, c[1]!, c[2]!, d[0]!, d[1]!, d[2]!, ca, cc, cd);
  };

  /**
   * One vertical face of the floor, wound to face `(outX, outZ)` in the town's
   * plane: a riser, a quay, the side of a slope or of a flight, or a step.
   *
   * **Not `pushFace`, whose rule is that normals point up** — the right rule
   * for anything you stand on, and a coin toss for a wall. A face built by
   * walking two corners along their own local ups is vertical only to the tilt
   * between those ups, so the sign of its normal's `y` is noise, and `pushFace`
   * would flip whichever half it liked into the ground where the backface cull
   * takes it. The kerb got away with it while every face was a whole cell edge;
   * a riser cut round the top of a flight and the side of a flight are not. So
   * the winding is chosen against the outward direction, which is known exactly
   * — it is which side of the cell the face is on — and the normal is the one
   * that winding gives.
   */
  function pushWall(
    out: Ground,
    a: number[], b: number[], c: number[], d: number[],
    ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, cd: THREE.Color,
    outX: number, outZ: number,
  ): void {
    wallFace(out, a, b, c, ca, cb, cc, outX, outZ);
    wallFace(out, a, c, d, ca, cc, cd, outX, outZ);
  }

  function wallFace(
    out: Ground,
    a: number[], b: number[], c: number[],
    ka: THREE.Color, kb: THREE.Color, kc: THREE.Color,
    outX: number, outZ: number,
  ): void {
    faceA.set(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
    faceB.set(c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!);
    faceNormal.crossVectors(faceA, faceB);
    const area = faceNormal.length();
    if (area < 1e-4) return;
    faceNormal.multiplyScalar(1 / area);
    // The town's frame is `makeBasis(across, up, north)`, so its x and z are
    // the plane's own and the outward direction needs no conversion.
    const flip = faceNormal.x * outX + faceNormal.z * outZ < 0;
    if (flip) faceNormal.negate();
    const p = flip ? c : b;
    const q = flip ? b : c;
    const kp = flip ? kc : kb;
    const kq = flip ? kb : kc;
    out.position.push(a[0]!, a[1]!, a[2]!, p[0]!, p[1]!, p[2]!, q[0]!, q[1]!, q[2]!);
    for (let v = 0; v < 3; v++) out.normal.push(faceNormal.x, faceNormal.y, faceNormal.z);
    out.color.push(ka.r, ka.g, ka.b, kp.r, kp.g, kp.b, kq.r, kq.g, kq.b);
    poolFor(out, a[0]!, a[2]!);
    poolFor(out, p[0]!, p[2]!);
    poolFor(out, q[0]!, q[2]!);
  }

  const pointDir = new THREE.Vector3();
  const pointLocal = new THREE.Vector3();
  /**
   * A point of the town's plane at an elevation of its own, in the town's
   * frame: what `pointAt` is for a lattice corner, for anywhere along an edge
   * or across a flight. Along the point's own direction, so it lands where
   * `floorLiftAt` is asked about the same `(x, z)`.
   */
  function pointIn(x: number, z: number, elevation: number, into: number[]): number[] {
    directionAt(x, z, pointDir);
    pointLocal
      .copy(pointDir)
      .multiplyScalar(PLANET_RADIUS + elevation)
      .sub(origin)
      .applyMatrix4(inverse);
    into[0] = pointLocal.x;
    into[1] = pointLocal.y;
    into[2] = pointLocal.z;
    return into;
  }

  /** A step's riser: the street's own colour walked towards the ink, as the kerb is the paving's. */
  const stepFace = new THREE.Color();

  /**
   * How far from a flight of steps each thing the street holds stands, in
   * world units: a lamp's post, a person's shoulders (`FIGURE.shoulderHalf`),
   * and half the longest vehicle a town parks, which is what keeps a bonnet out
   * of the stairs when the car's own centre is clear of them.
   */
  const CLEAR_LAMP = 0.6;
  const CLEAR_FOLK = 1.3 * BODY_SCALE;
  const CLEAR_CAR = 4.4;
  /** How far apart two people talking stand, centre to centre: about a metre and a half. */
  const PAIR_GAP = 3 * BODY_SCALE;
  /** How many of the first people on a street are one of a pair. */
  const PAIR_SHARE = 0.3;
  /** The pace a stroll's stretch is sampled at, and the shortest stretch worth walking. */
  const STROLL_STEP = 0.8;
  const STROLL_MIN = 3;

  /**
   * The floor of one settlement: its square.
   *
   * Four things, and the order is the argument:
   *
   * 1. **The floor is the square**, every cell of it the terrace allows. It was
   *    the built cells grown by one and clipped to a ragged core, and that was
   *    right for a town that was a disc of wandering plots; on a square it is a
   *    square with holes in it wherever a cell happened to draw a yard. What is
   *    left out now is what the ground refuses — a cell too steep to cut or
   *    touching the sea — and nothing else.
   * 2. **A street is a band of the cell, not a ribbon over it.** See the note
   *    above `EDGE_SETBACK`, and `scenery/grid.ts` for where they run.
   * 3. **The edge slope is what ends it, and a quay's face where the sea
   *    does.** See `EDGE_RUN` and `edgeSink`: the kerb that stood round the
   *    square from 2026-09-06 is a slope from the paving down into the ground
   *    since 2026-09-13, so the town sits in the land rather than on a box. The
   *    square's edge is still a straight line — it is where a road arrives, and
   *    a ragged one is a road ending against a zigzag — and so are the risers
   *    between terraces inside it, which are walls.
   * 4. **And where a street crosses one of those risers, a flight of steps.**
   *    See `Flight` in `floor.ts`.
   *
   * All of it is drawn out of the field `buildFloor` makes, and that field is
   * what `floorLiftAt` reads, so the surface a foot finds is this one.
   */
  function buildGround(
    slot: Slot,
    grid: TownGrid,
    band: number,
    urbanity: number,
    litPlots: readonly LitPlot[],
    pavedCells: ReadonlySet<number>,
  ): Ground {
    const out: Ground = {
      position: [], normal: [], color: [], glow: [], lamps: [], lampYaws: [], signals: [], folk: [], kerbs: [], paved: 0, lawn: null,
      terraces: new Map(),
      field: { pitch: grid.pitch, shift: grid.shift, terraces: new Map() },
    };
    const style = slot.ground;
    const pitch = grid.pitch;
    const cells = grid.cells;

    /**
     * **One colour for the floor of every town in a region, and the land under
     * it does not enter into it.** The floor used to be the biome's own dirt
     * under the town's centre, trodden and pulled 30 to 60% of the way towards
     * the region's paving, and that is exactly what it looked like: over
     * temperate ground it came out `#9c9478`, a grey-olive a shade off the
     * grass beside it, and over ice `#dfd4c2` to `#f3e2ca`, near white — the
     * same region green in a valley and white on the next hill, because the
     * biome cools with elevation. A town's floor was sometimes green and
     * sometimes white. A base is a made thing, and a made thing is the colour
     * it was made of.
     *
     * **And what it is made of is the region's road** (2026-09-13). For the few
     * hours between the square and this it was the region's own paving — a
     * khaki `tan` in most of the table — with the streets in `GroundStyle.road`
     * and the edge slope running from a kerb tone out to the local dirt, and
     * both halves of that showed at once: the slope was the wrong colour, and a
     * street band ending at the town's edge with no road beyond it looked as if
     * it were there for no reason. The answer is the whole base in the
     * carriageway's own colour — the roads are not white everywhere, so a
     * town's floor is the colour of the roads around it — so a town stands on
     * one made surface, its foundations, and a road arriving runs on into it
     * rather than changing material at the kerb. The yards keep `cellTone`'s
     * grain and the streets and the slope do not, which is all that is left to
     * tell them apart before a building stands on one.
     */
    roadColor.setHex(style.road);
    walkColor.setHex(style.walk);
    lineColor.setHex(PALETTE.white);
    plazaColor.setHex(style.plaza);
    // The land the town stands in, read once at its middle: a yard of lawn is
    // that ground, an earth yard is it trodden, a paved one is the pavement.
    directionAt(0, 0, groundDir);
    groundColorAt(world, groundDir.multiplyScalar(PLANET_RADIUS), landColor);
    if (style.yard === 'paved') yardColor.copy(walkColor);
    else if (style.yard === 'earth') trodden(landColor, yardColor);
    else yardColor.copy(landColor);
    // The embankment round the town is the land's, and the retaining walls
    // are the pavement's stone.
    floor.copy(landColor);
    kerbTop.copy(walkColor).lerp(KERB_INK, 0.16);
    kerbFoot.copy(walkColor).lerp(KERB_INK, 0.42);
    const marked = style.marked;
    /** A street's pavement, for a street `half` wide either side of its line: never more than 0.3 of it. */
    const walkOf = (half: number): number => Math.min(SIDEWALK, half * 0.3);

    const levels = new Map<number, number>();
    for (let col = 0; col < cells; col++) {
      for (let row = 0; row < cells; row++) {
        const level = terraceAt(col, row);
        if (level !== null) levels.set(cellKey(col, row), level);
      }
    }
    out.paved = levels.size;
    out.terraces = levels;
    out.field = { pitch, shift: grid.shift, terraces: levels };
    if (levels.size === 0) return out;

    const blocked = (x: number, z: number): boolean => {
      for (const keepout of keepouts) {
        if (Math.hypot(x - keepout.x, z - keepout.z) < keepout.radius) return true;
      }
      return false;
    };

    /**
     * The field: the terraces, the edge slope round them and the flights on
     * the streets that cross a riser. The slope is not laid on a cell with a
     * corner in the sea — that edge is a quay — nor on one under a landmark,
     * exactly as the apron it replaced was not.
     */
    const field = buildFloor({
      grid,
      band,
      terraces: levels,
      cornerGround: (i, j) => {
        const corner = cornerAt(i, j);
        return corner.sea ? null : corner.elevation;
      },
      open: (col, row) => !blocked(cellCentre(grid, col), cellCentre(grid, row)),
    });
    out.field = field;

    /**
     * One point on the paving, at the paving's own lift, or nothing.
     *
     * **On the terrace, not on the ground.** A lamp, a parked car and a person
     * stand on the floor the town laid, and the floor is level over its cell —
     * so what decides their height is which cell they are in, exactly as it
     * decides a building's. It costs one `elevationAt` through `directionAt`'s
     * direction, and a median town asks it about fifteen times.
     *
     * **And never on a flight of steps**, nor within `clearance` of one: the
     * stairs are on the street, which is the only ground in a town these stand
     * on, and a car parked with its bonnet in a staircase is the heap of houses
     * over again at a smaller scale.
     */
    const spotAt = (x: number, z: number, into: number[], yaw?: number, clearance = 0): boolean => {
      if (blocked(x, z)) return false;
      const level = levels.get(cellKey(cellIndex(grid, x), cellIndex(grid, z)));
      if (level === undefined) return false;
      if (flightAt(field, x, z, clearance) !== null) return false;
      pavingAt(x, z, level, into);
      if (yaw !== undefined) into.push(yaw);
      return true;
    };
    /** A point of the paving at `level`, in the settlement's frame, appended to `into`. */
    const pavingAt = (x: number, z: number, level: number, into: number[]): void => {
      directionAt(x, z, groundDir);
      groundLocal
        .copy(groundDir)
        .multiplyScalar(PLANET_RADIUS + level + GROUND_LIFT)
        .sub(origin)
        .applyMatrix4(inverse);
      into.push(groundLocal.x, groundLocal.y, groundLocal.z);
    };
    /** Whether a person may stand at `x, z` on the terrace `level`: `spotAt`'s test, and the same level. */
    const standable = (x: number, z: number, level: number): boolean =>
      !blocked(x, z) &&
      levels.get(cellKey(cellIndex(grid, x), cellIndex(grid, z))) === level &&
      flightAt(field, x, z, CLEAR_FOLK) === null;

    /** Bilinear point inside a cell, from four points on its terrace. */
    const inside = (
      a: number[], b: number[], c: number[], d: number[],
      u: number, v: number,
      target: number[],
    ): number[] => {
      const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
      target[0] = a[0]! * w0 + b[0]! * w1 + c[0]! * w2 + d[0]! * w3;
      target[1] = a[1]! * w0 + b[1]! * w1 + c[1]! * w2 + d[1]! * w3;
      target[2] = a[2]! * w0 + b[2]! * w1 + c[2]! * w2 + d[2]! * w3;
      return target;
    };


    /**
     * The square, which is the crossing of the two main streets when the town
     * has a middle cell to put it on. A town with an even number of cells a
     * side meets at a crossroads instead, and a crossroads is a square small
     * enough to be a road.
     */
    const plazaKey = cells % 2 === 1 && cells >= 3 ? cellKey(grid.shift, grid.shift) : -1;

    /**
     * A yard at the town's edge is the land's own ground in every region whose
     * yards are not already earth: a paved Mediterranean yard in the middle of
     * the town, and a lawn at its edge, which is what lets the paving give out
     * before the town does.
     */
    const outerYard = (col: number, row: number): boolean =>
      style.yard !== 'earth' && (cells < OUTSKIRT_MIN_CELLS || outskirtScore(grid, slot.seed, col, row) > OUTSKIRT_RING);
    if (style.yard !== 'earth') {
      out.lawn = new Uint8Array(cells * cells);
      for (let col = 0; col < cells; col++) {
        for (let row = 0; row < cells; row++) {
          const key = cellKey(col, row);
          if (!levels.has(key) || pavedCells.has(key) || key === plazaKey) continue;
          if (style.yard === 'paved' && !outerYard(col, row)) continue;
          if (blocked(cellCentre(grid, col), cellCentre(grid, row))) continue;
          out.lawn[col * cells + row] = 1;
        }
      }
    }

    // --- the lamps ---
    //
    // **At the corners of the street crossings, on the kerb.** The old lamps
    // stood on the lattice corner itself, which was the middle of the
    // carriageway, and were clear of the houses only because the houses had no
    // street line to keep to. A lamp here is `band` in from the corner on each
    // axis — the edge of the band, where the pavement starts — on a quarter of
    // the crossing drawn from its own seed, so four corners are not four lamps.
    const chance = Math.min(
      LAMP_MAX_CHANCE,
      LAMP_FLOOR + (style.hardness - 0.3) * 0.8 + urbanity * 0.3,
    );
    /** Where the street along a lattice line sits, as an offset from that line to its kerb, or null. */
    const kerbOff = (line: number, sign: number): number | null => {
      if (line <= 0 || line >= cells) return null;
      if (grid.high[line - 1] === 1) return sign * (band - Math.min(SIDEWALK, band * 0.3) * 0.5);
      if (grid.avenue[line - 1] === 1) return 0.8;
      if (grid.avenue[line] === 1) return -0.8;
      return null;
    };
    let lamps = 0;
    for (let i = 1; i < cells && lamps < LAMP_CAP; i++) {
      for (let j = 1; j < cells && lamps < LAMP_CAP; j++) {
        const rng = rngFrom(slot.seed, 'lamp', i, j);
        const ox = kerbOff(i, rng.chance(0.5) ? 1 : -1);
        const oz = kerbOff(j, rng.chance(0.5) ? 1 : -1);
        if (ox === null || oz === null) continue;
        if (!rng.chance(chance)) continue;
        if (spotAt(cornerOffset(grid, i) + ox, cornerOffset(grid, j) + oz, out.lamps, undefined, CLEAR_LAMP)) {
          lamps++;
          // The arm over the street along x, towards its line: local -z to
          // world (-sign ox, 0).
          out.lampYaws.push(Math.atan2(Math.sign(ox), 0));
        }
      }
    }

    // --- the traffic lights ---
    //
    // A city built from the City Kits stands one on each pavement corner of
    // its middle crossing, in a pinwheel: the light on the (+x, +z) corner
    // faces +z, the traffic coming in by that mouth, and each corner round the
    // crossing turns a quarter.
    if (plazaKey >= 0 && slot.style.assets !== undefined && urbanity >= TOWER_URBANITY) {
      const middle = cellCentre(grid, grid.shift);
      const inset = pitch * 0.5 - Math.min(SIDEWALK, pitch * 0.15) * 0.5;
      const corners: [number, number, number, number][] = [
        [1, 1, 0, 1], [-1, 1, -1, 0], [-1, -1, 0, -1], [1, -1, 1, 0],
      ];
      for (const [sx, sz, fx, fz] of corners) {
        // The model's lamps face its -x: yaw so that -x lands on (fx, fz).
        spotAt(middle + sx * inset, middle + sz * inset, out.signals, Math.atan2(fz, -fx), CLEAR_LAMP);
      }
    }

    /** Everything in this town that lights the ground, in one list. */
    const emitters: Emitter[] = [];
    // The light at every gate a road comes in by, and first, so that where it
    // ties with another light at the peak its hour is the one kept: it burns
    // till dawn, and so does the ribbon it shares the kerb with. It is placed
    // at the paving's own height, where `roads.ts` places it (`kerbA`), because
    // a point's offset in this frame moves with its radius.
    const gates = gatesOf(grid);
    /** Every edge a road comes in over, as `cellKey * 4 + side`: the streets that do not end there. */
    const roadEnds = new Set<number>();
    for (const index of roadGates.get(slot.place) ?? []) {
      const gate = gates[index];
      if (gate === undefined) continue;
      for (const [col, row] of gate.cells) roadEnds.add(cellKey(col, row) * 4 + gate.side);
    }
    const gateAt: number[] = [0, 0, 0];
    for (const index of roadGates.get(slot.place) ?? []) {
      const gate = gates[index];
      const cell = gate?.cells[0];
      const level = cell === undefined ? undefined : levels.get(cellKey(cell[0], cell[1]));
      if (gate === undefined || level === undefined) continue;
      const glow = gateGlow(grid, gate, band);
      pointIn(glow.x, glow.z, level + GROUND_LIFT, gateAt);
      emitters.push({ x: gateAt[0]!, z: gateAt[2]!, inner: glow.inner, reach: glow.reach, strength: 1, bed: 255 });
    }
    for (let i = 0; i + 2 < out.lamps.length; i += 3) {
      emitters.push({
        x: out.lamps[i]!,
        z: out.lamps[i + 2]!,
        inner: 0,
        reach: LAMP_POOL,
        strength: LAMP_STRENGTH,
        // The council's, and it burns till dawn. `bedtimeByte`'s own `BED_ALWAYS`.
        bed: 255,
      });
    }
    for (const plot of litPlots) {
      emitters.push({
        x: plot.x,
        z: plot.z,
        // From the wall, not from the middle. See `Emitter.inner`.
        inner: plot.radius,
        reach: plot.radius + WINDOW_SPILL,
        strength: plot.strength,
        bed: plot.bed,
      });
    }

    const q0: number[] = [0, 0, 0];
    const q1: number[] = [0, 0, 0];
    const q2: number[] = [0, 0, 0];
    const q3: number[] = [0, 0, 0];
    const ta: number[] = [0, 0, 0];
    const tb: number[] = [0, 0, 0];
    const tc: number[] = [0, 0, 0];
    const td: number[] = [0, 0, 0];

    for (const [key, level] of levels) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      const a = cornerAt(col, row);
      const b = cornerAt(col + 1, row);
      const c = cornerAt(col + 1, row + 1);
      const d = cornerAt(col, row + 1);
      const top = level + GROUND_LIFT;
      pointAt(a, top, ta);
      pointAt(b, top, tb);
      pointAt(c, top, tc);
      pointAt(d, top, td);
      litHere = litAround(emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);

      // The yard takes the land's own mosaic, one tone a cell drawn from the
      // same range the land's shader uses, so the one made surface in the view
      // is not the one with no grain. `cellTone`'s note has the rest.
      cellFloor.copy(pavedCells.has(key) ? walkColor : outerYard(col, row) ? landColor : yardColor).multiplyScalar(cellTone(slot.seed, col, row));
      const plaza = blocked(cellCentre(grid, col), cellCentre(grid, row));
      /**
       * The middle of a town with a middle cell, where its two avenues cross:
       * a crossing, unmarked, with a zebra across each of its four mouths
       * (`ZEBRA`). It was a pale square of `plaza` until the streets had a
       * section, and a square of stone in the middle of two carriageways
       * reads as a hole in them.
       */
      const crossing = !plaza && key === plazaKey;
      const x0 = cellCentre(grid, col) - pitch * 0.5;
      const z0 = cellCentre(grid, row) - pitch * 0.5;

      /**
       * A street through this cell along one axis, as the cell cuts it: where
       * its centre line is (as a share of the cell across the street), how far
       * its kerbs stand from that line, and the cuts it asks for.
       */
      /**
       * **A band street is paved half by the cell on each side of it, and only
       * where both are town.** Where the town stops short of its square
       * (`outskirtsOf`) the cell across a band may be gone, and its half on
       * this side would be half a street with a kerb onto the fields — so it
       * is this cell's yard instead, as the edge of the square always was.
       */
      const streetsOn = (index: number, across: (step: number) => boolean): { centre: number; half: number }[] => {
        const list: { centre: number; half: number }[] = [];
        if (grid.avenue[index] === 1) list.push({ centre: 0.5, half: pitch * 0.5 });
        else {
          if (grid.low[index] === 1 && across(-1)) list.push({ centre: 0, half: band });
          if (grid.high[index] === 1 && across(1)) list.push({ centre: 1, half: band });
        }
        return list;
      };
      // A street "on u" runs along z: its lateral axis is u.
      const alongZ = plaza || crossing ? [] : streetsOn(col, (step) => levels.has(cellKey(col + step, row)));
      const alongX = plaza || crossing ? [] : streetsOn(row, (step) => levels.has(cellKey(col, row + step)));
      const cutsFor = (streets: { centre: number; half: number }[], lengthwise: boolean, origin: number): number[] => {
        const list = new Set<number>([0, 1]);
        for (const street of streets) {
          const sign = street.centre === 0 ? 1 : street.centre === 1 ? -1 : 0;
          const edges = sign === 0 ? [-1, 1] : [sign];
          for (const e of edges) {
            list.add(street.centre + (e * street.half) / pitch);
            list.add(street.centre + (e * (street.half - walkOf(street.half))) / pitch);
            if (marked && street.half * 2 >= MARKED_STREET) list.add(street.centre + (e * LINE_HALF) / pitch);
          }
        }
        // Along a marked street the dashes cut its length.
        if (lengthwise && marked) {
          for (let k = Math.ceil(origin / DASH); k * DASH < origin + pitch; k++) list.add((k * DASH - origin) / pitch);
        }
        if (crossing) {
          // The zebras: their depth in from each mouth, and their stripes across it.
          const walk = walkOf(pitch * 0.5) / pitch;
          list.add(walk).add(1 - walk).add(ZEBRA / pitch).add(1 - ZEBRA / pitch);
          for (let t = walk + ZEBRA_STRIPE / pitch; t < 1 - walk - 1e-6; t += ZEBRA_STRIPE / pitch) list.add(t);
        }
        return [...list].filter((t) => t >= 0 && t <= 1).sort((m, n) => m - n);
      };
      const dashedZ = alongZ.some((street) => street.half * 2 >= MARKED_STREET);
      const dashedX = alongX.some((street) => street.half * 2 >= MARKED_STREET);
      const us = cutsFor(alongZ, dashedX, x0);
      const vs = cutsFor(alongX, dashedZ, z0);
      /**
       * **A street that runs off the town with no road beyond it ends in a
       * kerb.** Where the next cell along it is not town and no road comes in
       * that way, the carriageway stopped dead at the paving's edge and read as
       * a road cut off; a pavement across its end, as wide as the street's own
       * pavements, reads as a street that stops there. `ends[side]` is that
       * width as a share of the cell, or 0 where the street goes on: east,
       * north, west, south, as `Gate.side` counts them.
       */
      const ends = [0, 0, 0, 0];
      /**
       * Whether the street goes on into the next cell: that cell is town, and
       * — for a band, which two cells pave between them — so is the cell across
       * the band from it, or the next cell carries none of it.
       */
      const goesOn = (dc: number, dr: number, street: { centre: number }): boolean => {
        if (!levels.has(cellKey(col + dc, row + dr))) return false;
        if (street.centre === 0.5) return true;
        const step = street.centre === 0 ? -1 : 1;
        return dc !== 0
          ? levels.has(cellKey(col + dc, row + step))
          : levels.has(cellKey(col + step, row + dr));
      };
      const endOf = (side: number, dc: number, dr: number, streets: { centre: number; half: number }[]): void => {
        if (roadEnds.has(cellKey(col, row) * 4 + side)) return;
        for (const street of streets) {
          if (goesOn(dc, dr, street)) continue;
          ends[side] = Math.max(ends[side]!, walkOf(street.half) / pitch);
        }
      };
      endOf(0, 1, 0, alongX);
      endOf(2, -1, 0, alongX);
      endOf(1, 0, 1, alongZ);
      endOf(3, 0, -1, alongZ);
      // A crossing's four arms are avenues, and one whose next cell is gone
      // was a mouth with a zebra across it opening onto the grass.
      if (crossing) {
        const avenue = [{ centre: 0.5, half: pitch * 0.5 }];
        endOf(0, 1, 0, avenue);
        endOf(2, -1, 0, avenue);
        endOf(1, 0, 1, avenue);
        endOf(3, 0, -1, avenue);
      }
      const capCut = (list: number[], low: number, high: number): number[] => {
        if (low > 0) list.push(low);
        if (high > 0) list.push(1 - high);
        return [...new Set(list)].sort((m, n) => m - n);
      };
      const usCapped = capCut([...us], ends[2]!, ends[0]!);
      const vsCapped = capCut([...vs], ends[3]!, ends[1]!);

      /** Where a point of the cell falls across the streets on one axis: 'yard', 'walk', 'road' or 'line'. */
      const across = (streets: { centre: number; half: number }[], t: number): 'yard' | 'walk' | 'road' | 'line' => {
        let best: 'yard' | 'walk' | 'road' | 'line' = 'yard';
        for (const street of streets) {
          const lateral = Math.abs(t - street.centre) * pitch;
          if (lateral > street.half) continue;
          const role = lateral > street.half - walkOf(street.half) ? 'walk' : marked && street.half * 2 >= MARKED_STREET && lateral < LINE_HALF ? 'line' : 'road';
          if (best === 'yard' || role === 'road' || role === 'line') best = role;
        }
        return best;
      };
      const dashOn = (coordinate: number): boolean => Math.floor(coordinate / DASH + 1e-6) % 2 === 0;

      for (let iu = 0; iu < usCapped.length - 1; iu++) {
        const u0 = usCapped[iu]!;
        const u1 = usCapped[iu + 1]!;
        const uc = (u0 + u1) * 0.5;
        const roleU = across(alongZ, uc);
        for (let iv = 0; iv < vsCapped.length - 1; iv++) {
          const v0 = vsCapped[iv]!;
          const v1 = vsCapped[iv + 1]!;
          const vc = (v0 + v1) * 0.5;
          const roleV = across(alongX, vc);
          // Inside a dead end's kerb, across the street it closes.
          const cappedZ = roleU !== 'yard' && ((ends[3]! > 0 && vc < ends[3]!) || (ends[1]! > 0 && vc > 1 - ends[1]!));
          const cappedX = roleV !== 'yard' && ((ends[2]! > 0 && uc < ends[2]!) || (ends[0]! > 0 && uc > 1 - ends[0]!));
          inside(ta, tb, tc, td, u0, v0, q0);
          inside(ta, tb, tc, td, u1, v0, q1);
          inside(ta, tb, tc, td, u1, v1, q2);
          inside(ta, tb, tc, td, u0, v1, q3);
          let tint: THREE.Color;
          if (plaza) tint = plazaColor;
          else if (crossing) {
            const walk = walkOf(pitch * 0.5) / pitch;
            const edgeU = uc < walk || uc > 1 - walk;
            const edgeV = vc < walk || vc > 1 - walk;
            // A zebra across every mouth that goes on; a closed one has its kerb instead.
            const mouthU = (uc < ZEBRA / pitch && ends[2] === 0) || (uc > 1 - ZEBRA / pitch && ends[0] === 0);
            const mouthV = (vc < ZEBRA / pitch && ends[3] === 0) || (vc > 1 - ZEBRA / pitch && ends[1] === 0);
            const stripe = (t: number) => Math.floor((t - walk) / (ZEBRA_STRIPE / pitch)) % 2 === 0;
            const closed = (ends[3]! > 0 && vc < ends[3]!) || (ends[1]! > 0 && vc > 1 - ends[1]!) ||
              (ends[2]! > 0 && uc < ends[2]!) || (ends[0]! > 0 && uc > 1 - ends[0]!);
            if ((edgeU && edgeV) || closed) tint = walkColor;
            else if (mouthV && !mouthU && !edgeU) tint = stripe(uc) ? lineColor : roadColor;
            else if (mouthU && !mouthV && !edgeV) tint = stripe(vc) ? lineColor : roadColor;
            else tint = roadColor;
          }
          else if (roleU === 'yard' && roleV === 'yard') tint = cellFloor;
          else if ((cappedZ && roleV === 'yard') || (cappedX && roleU === 'yard')) tint = walkColor;
          else if (roleU === 'yard' || roleV === 'yard') {
            // One street here: its own section, and its line dashed along it.
            const role = roleU === 'yard' ? roleV : roleU;
            const along = roleU === 'yard' ? x0 + uc * pitch : z0 + vc * pitch;
            tint = role === 'walk' ? walkColor : role === 'line' && dashOn(along) ? lineColor : roadColor;
          } else {
            // Where two streets cross the pavement turns the corner and the
            // carriageway is unmarked.
            tint = roleU === 'walk' && roleV === 'walk' ? walkColor : roadColor;
          }
          pushQuad(out, q0, q1, q2, q3, tint, tint, tint, tint);
        }
      }
    }

    /**
     * The faces the floor still draws vertical, from the paving's side.
     *
     * Three kinds, one quad an edge or a piece of one, and the higher cell
     * draws each so each is drawn once: a **riser** down to a lower terrace,
     * cut round the top of any flight that climbs it; a **quay**, down to
     * `KERB_DROP` under the ground where the slope is not laid because the sea
     * or a landmark is next door; and, where a paved cell meets a slope that
     * starts from a lower terrace than its own, the face down to that slope's
     * top. On a town of one level the last is never drawn, because every slope
     * starts on the paving it leaves.
     */
    const wallTop: number[] = [0, 0, 0];
    const wallFoot: number[] = [0, 0, 0];
    const wallFoot2: number[] = [0, 0, 0];
    const wallTop2: number[] = [0, 0, 0];
    /** A face along a cell edge, from a height of its own at each corner down to one of its own at each. */
    const wall = (
      p: Corner, q: Corner, topP: number, topQ: number, footP: number, footQ: number, outX: number, outZ: number,
    ): void => {
      if (topP - footP < 1e-6 && topQ - footQ < 1e-6) return;
      pushWall(
        out,
        pointAt(p, topP, wallTop), pointAt(p, footP, wallFoot),
        pointAt(q, footQ, wallFoot2), pointAt(q, topQ, wallTop2),
        kerbTop, kerbFoot, kerbFoot, kerbTop, outX, outZ,
      );
    };
    /**
     * A riser from `top` down to `foot` along the edge `p`–`q`, less the stretch
     * of it each flight standing below it has taken: the flight's own top step
     * is the riser there, a step tall rather than a terrace.
     */
    const riser = (
      p: Corner, q: Corner, top: number, foot: number, outX: number, outZ: number,
      below: readonly Flight[] | undefined,
    ): void => {
      const axis = outX !== 0 ? 0 : 1;
      const line = axis === 0 ? p.x : p.z;
      const gaps: [number, number][] = [];
      for (const flight of below ?? []) {
        if (flight.axis === axis && Math.abs(flight.at - line) < 1e-6) gaps.push([flight.from, flight.to]);
      }
      if (gaps.length === 0) {
        wall(p, q, top, top, foot, foot, outX, outZ);
        return;
      }
      gaps.sort((m, n) => m[0] - n[0]);
      const piece = (s0: number, s1: number): void => {
        if (s1 - s0 < 1e-6) return;
        const x0 = axis === 0 ? line : s0;
        const z0 = axis === 0 ? s0 : line;
        const x1 = axis === 0 ? line : s1;
        const z1 = axis === 0 ? s1 : line;
        pushWall(
          out,
          pointIn(x0, z0, top, wallTop), pointIn(x0, z0, foot, wallFoot),
          pointIn(x1, z1, foot, wallFoot2), pointIn(x1, z1, top, wallTop2),
          kerbTop, kerbFoot, kerbFoot, kerbTop, outX, outZ,
        );
      };
      let from = axis === 0 ? p.z : p.x;
      for (const [g0, g1] of gaps) {
        piece(from, Math.max(from, g0));
        from = Math.max(from, g1);
      }
      piece(from, axis === 0 ? q.z : q.x);
    };
    for (const [key, level] of levels) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      const a = cornerAt(col, row);
      const b = cornerAt(col + 1, row);
      const c = cornerAt(col + 1, row + 1);
      const d = cornerAt(col, row + 1);
      litHere = litAround(emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);
      const top = level + GROUND_LIFT;
      const edge = (p: Corner, q: Corner, dc: number, dr: number): void => {
        const near = cellKey(col + dc, row + dr);
        const beside = levels.get(near);
        if (beside !== undefined) {
          if (beside < level) riser(p, q, top, beside + GROUND_LIFT, dc, dr, field.flights?.get(near));
          return;
        }
        const apron = field.aprons?.get(near);
        if (apron !== undefined) {
          wall(p, q, top, top, apron.top, apron.top, dc, dr);
          return;
        }
        // A quay. A corner in the water is on the water, because `cornerAt`
        // puts it there, so its face runs down under sea level.
        wall(p, q, top, top, p.elevation - KERB_DROP, q.elevation - KERB_DROP, dc, dr);
      };
      edge(a, d, -1, 0);
      edge(b, c, 1, 0);
      edge(a, b, 0, -1);
      edge(d, c, 0, 1);
    }

    /**
     * The edge slope: one course of cells round the paving, each two triangles
     * from its owner's paving down to its foot under the ground.
     *
     * All of it is the floor's own colour, the region's road: the slope is the
     * side of the town's foundations, not a verge, and it goes into the ground
     * in the material the paving is made of (see the floor's colour above for
     * why it stopped running out into the local dirt). The diagonal is the one `buildFloor`
     * chose, which is what makes a convex corner a hip and the inside of an L a
     * valley. Where two slope cells beside each other start from different
     * terraces they meet in a wedge — the riser between those terraces carried
     * on out, down the bank, to nothing at the foot — and where one runs up
     * against a quay or a landmark it gets a side down to the ground. Both are
     * drawn by the higher side.
     */
    const sa: number[] = [0, 0, 0];
    const sb: number[] = [0, 0, 0];
    const sc: number[] = [0, 0, 0];
    const sd: number[] = [0, 0, 0];
    /** `groundColorAt` at lattice corner `(i, j)`, each corner asked once. */
    const groundColors = new Map<number, THREE.Color>();
    const groundAtCorner = (i: number, j: number): THREE.Color => {
      const key = cellKey(i, j);
      let found = groundColors.get(key);
      if (found === undefined) {
        directionAt(cornerOffset(grid, i), cornerOffset(grid, j), groundDir);
        found = groundColorAt(world, groundDir.multiplyScalar(PLANET_RADIUS), new THREE.Color());
        groundColors.set(key, found);
      }
      return found;
    };
    for (const [key, apron] of field.aprons ?? []) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      const a = cornerAt(col, row);
      const b = cornerAt(col + 1, row);
      const c = cornerAt(col + 1, row + 1);
      const d = cornerAt(col, row + 1);
      litHere = litAround(emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);
      pointAt(a, apronCorner(field, apron, col, row), sa);
      pointAt(b, apronCorner(field, apron, col + 1, row), sb);
      pointAt(c, apronCorner(field, apron, col + 1, row + 1), sc);
      pointAt(d, apronCorner(field, apron, col, row + 1), sd);
      // The land's own colour at each corner, in the mosaic tone of the cell,
      // as the land beside it is drawn: one flat colour read at the town's
      // middle was a band round every town a shade off the ground it meets.
      const tone = cellTone(slot.seed, col, row);
      apronCorner0.copy(groundAtCorner(col, row)).multiplyScalar(tone);
      apronCorner1.copy(groundAtCorner(col + 1, row)).multiplyScalar(tone);
      apronCorner2.copy(groundAtCorner(col + 1, row + 1)).multiplyScalar(tone);
      apronCorner3.copy(groundAtCorner(col, row + 1)).multiplyScalar(tone);
      if (apron.diagonal === 0) pushQuad(out, sa, sb, sc, sd, apronCorner0, apronCorner1, apronCorner2, apronCorner3);
      else pushQuad(out, sb, sc, sd, sa, apronCorner1, apronCorner2, apronCorner3, apronCorner0);

      const side = (p: Corner, q: Corner, pi: number, pj: number, qi: number, qj: number, dc: number, dr: number): void => {
        const near = cellKey(col + dc, row + dr);
        if (levels.has(near)) return;
        const hp = apronCorner(field, apron, pi, pj);
        const hq = apronCorner(field, apron, qi, qj);
        const other = field.aprons?.get(near);
        if (other !== undefined) {
          if (other.top >= apron.top) return;
          wall(p, q, hp, hq, apronCorner(field, other, pi, pj), apronCorner(field, other, qi, qj), dc, dr);
          return;
        }
        wall(p, q, hp, hq, Math.min(hp, p.elevation - KERB_DROP), Math.min(hq, q.elevation - KERB_DROP), dc, dr);
      };
      side(a, d, col, row, col, row + 1, -1, 0);
      side(b, c, col + 1, row, col + 1, row + 1, 1, 0);
      side(a, b, col, row, col + 1, row, 0, -1);
      side(d, c, col, row + 1, col + 1, row + 1, 0, 1);
    }

    /**
     * The flights: risers facing down the stairs, treads in the street's own
     * colour, and a side on each hand down to whatever is beside it.
     *
     * Every face of it is in a plane nothing else in the town uses — a tread
     * is a step above the paving it stands on, a riser a tread's depth from the
     * next, a side half a unit in from a house front — except where a flight's
     * side is on the line between the two halves of a band street. There the
     * other half is paving, or a riser, or another flight, and the side is cut
     * to stand only above it, so the two never overlap in one plane.
     */
    const fp0: number[] = [0, 0, 0];
    const fp1: number[] = [0, 0, 0];
    const fp2: number[] = [0, 0, 0];
    const fp3: number[] = [0, 0, 0];
    for (const list of field.flights?.values() ?? []) {
      for (const flight of list) {
        const col = Math.floor(flight.cell / 1024) - 512;
        const row = (flight.cell % 1024) - 512;
        const a = cornerAt(col, row);
        const c = cornerAt(col + 1, row + 1);
        litHere = litAround(emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);
        // Steps are stone, the pavement's, whatever street they carry.
        const tint = blocked(cellCentre(grid, col), cellCentre(grid, row)) ? plazaColor : walkColor;
        stepFace.copy(tint).lerp(KERB_INK, 0.3);
        const run = flightRun(flight);
        const rise = (flight.high - flight.low) / flight.steps;
        const downX = flight.axis === 0 ? flight.into : 0;
        const downZ = flight.axis === 0 ? 0 : flight.into;
        const at = (s: number, t: number, elevation: number, into: number[]): number[] =>
          flight.axis === 0
            ? pointIn(flight.at + flight.into * s, t, elevation, into)
            : pointIn(t, flight.at + flight.into * s, elevation, into);
        for (let k = 0; k < flight.steps; k++) {
          const s = k * flight.tread;
          const top = flight.high - k * rise;
          pushWall(
            out,
            at(s, flight.from, top, fp0), at(s, flight.from, top - rise, fp1),
            at(s, flight.to, top - rise, fp2), at(s, flight.to, top, fp3),
            stepFace, stepFace, stepFace, stepFace, downX, downZ,
          );
        }
        for (let k = 1; k < flight.steps; k++) {
          const h = flight.high - k * rise;
          const s0 = (k - 1) * flight.tread;
          const s1 = k * flight.tread;
          pushQuad(
            out,
            at(s0, flight.from, h, fp0), at(s1, flight.from, h, fp1),
            at(s1, flight.to, h, fp2), at(s0, flight.to, h, fp3),
            tint, tint, tint, tint,
          );
        }
        for (const [t, sign] of [[flight.from, -1], [flight.to, 1]] as const) {
          // Just past the side, and what stands there: this cell's own paving
          // on the side the flight is inset from, the other half of the
          // street on the side it is not.
          const probe = t + sign * 1e-3;
          const cellBeyond = (s: number): number => flight.axis === 0
            ? cellKey(cellIndex(grid, flight.at + flight.into * s), cellIndex(grid, probe))
            : cellKey(cellIndex(grid, probe), cellIndex(grid, flight.at + flight.into * s));
          const beyond = (s: number): number => {
            const cell = cellBeyond(s);
            if (cell === flight.cell || !levels.has(cell)) return flight.low;
            const x = flight.axis === 0 ? flight.at + flight.into * s : probe;
            const z = flight.axis === 0 ? probe : flight.at + flight.into * s;
            return Math.max(flight.low, floorLiftAt(field, x, z, 0));
          };
          const marks = [0, run];
          for (let k = 1; k < flight.steps - 1; k++) marks.push(k * flight.tread);
          for (const other of field.flights?.get(cellBeyond(run * 0.5)) ?? []) {
            if (other === flight || other.axis !== flight.axis || Math.abs(other.at - flight.at) > 1e-6) continue;
            for (let k = 1; k < other.steps; k++) {
              if (k * other.tread < run) marks.push(k * other.tread);
            }
          }
          marks.sort((m, n) => m - n);
          for (let m = 0; m + 1 < marks.length; m++) {
            const s0 = marks[m]!;
            const s1 = marks[m + 1]!;
            if (s1 - s0 < 1e-6) continue;
            const mid = (s0 + s1) * 0.5;
            const own = flightHeight(flight, mid);
            const bottom = beyond(mid);
            if (own - bottom < 1e-6) continue;
            pushWall(
              out,
              at(s0, t, own, fp0), at(s0, t, bottom, fp1), at(s1, t, bottom, fp2), at(s1, t, own, fp3),
              kerbTop, kerbFoot, kerbFoot, kerbTop,
              flight.axis === 0 ? 0 : sign, flight.axis === 0 ? sign : 0,
            );
          }
        }
      }
    }

    // --- who is standing in it, and what is parked in it ---
    //
    // On the street bands and the avenues, which is the only ground in the town
    // no building stands on. A car parks on the middle of its own cell's half of
    // a band — a placed hatchback is 3.00 across against a band of 3 to 3.6, so
    // the other half of the street stays clear — and along an avenue it parks
    // with its centre 1.9 in from the kerb, which clears a placed hatchback's
    // side by 0.4.
    //
    // **Except down the two main streets' carriageway**, which is the town's
    // through road (`throughClear` in `scenery/grid.ts`): a vehicle driving
    // from one road to the next crosses the square along them, so nothing
    // parks in it and nobody stands in it. A person whose spot falls in it
    // stands at its side instead, on the pavement, where the street has one
    // wide enough; where it has not, or where the spot is in the crossing
    // street's carriageway, they are left out. Every seeded draw is still
    // taken, so the rest of the town stands where it stood.
    const parkChance = Math.min(0.55, 0.12 + urbanity * 0.5);
    const mainHalf = mainStreetHalf(grid, style.street);
    const driven = hasThroughStreets(grid);
    const through = driven ? throughClear(mainHalf) : -Infinity;
    /** Whether a person at `(x, z)` would stand on the through road, the middle crossing included. */
    const inThrough = (x: number, z: number): boolean => driven && onThroughRoad(x, z, mainHalf, CLEAR_FOLK);
    /**
     * Whether a car parked at `(x, z)`, along z or along x, would reach into
     * it: its half-width across its own street, and about half a placed car's
     * length, `CLEAR_CAR * 0.75`, along it.
     */
    const parksInThrough = (x: number, z: number, alongZ: boolean): boolean => {
      const across = through + THROUGH_HALF_WIDTH;
      const along = through + CLEAR_CAR * 0.75;
      return alongZ
        ? Math.abs(x) < across || Math.abs(z) < along
        : Math.abs(z) < across || Math.abs(x) < along;
    };
    const spot: number[] = [];
    const folkChance = Math.min(0.6, 0.2 + urbanity * 0.55);
    for (const key of levels.keys()) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      const x0 = cellCentre(grid, col) - pitch * 0.5;
      const z0 = cellCentre(grid, row) - pitch * 0.5;
      const rng = rngFrom(slot.seed, 'street-life', col, row);
      // Each street this cell carries: which way it runs, and the line down the
      // middle of the cell's share of it.
      const streets: [boolean, number, number][] = [];
      // A band only where the cell across it is town too, as the street is drawn.
      if (grid.low[col] === 1 && levels.has(cellKey(col - 1, row))) streets.push([true, x0 + band * 0.5, band]);
      if (grid.high[col] === 1 && levels.has(cellKey(col + 1, row))) streets.push([true, x0 + pitch - band * 0.5, band]);
      if (grid.low[row] === 1 && levels.has(cellKey(col, row - 1))) streets.push([false, z0 + band * 0.5, band]);
      if (grid.high[row] === 1 && levels.has(cellKey(col, row + 1))) streets.push([false, z0 + pitch - band * 0.5, band]);
      if (grid.avenue[col] === 1 && grid.avenue[row] !== 1) {
        streets.push([true, x0 + 1.9, 1.9], [true, x0 + pitch - 1.9, 1.9]);
      }
      if (grid.avenue[row] === 1 && grid.avenue[col] !== 1) {
        streets.push([false, z0 + 1.9, 1.9], [false, z0 + pitch - 1.9, 1.9]);
      }
      for (const [alongZ, line, reach] of streets) {
        // Where along the cell a car parked on this line, or NaN: a person
        // keeps off it standing and strolling. People used to be placed with
        // no regard for it, and a car is as wide as the band, so a person
        // could stand inside a bonnet.
        let parked = NaN;
        if (rng.chance(parkChance)) {
          const along = rng.range(0.15, 0.85) * pitch;
          const yaw = alongZ ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
          const px = alongZ ? line : x0 + along;
          const pz = alongZ ? z0 + along : line;
          if (!parksInThrough(px, pz, alongZ) && spotAt(px, pz, out.kerbs, yaw, CLEAR_CAR)) parked = along;
        }
        if (rng.chance(folkChance)) {
          const start = alongZ ? z0 : x0;
          const pointOf = (along: number, off: number): [number, number] =>
            alongZ ? [line + off, start + along] : [start + along, line + off];
          const clearOfCar = (along: number): boolean => !(Math.abs(along - parked) < CLEAR_CAR + CLEAR_FOLK);
          for (let k = 0; k < 2; k++) {
            if (k > 0 && !rng.chance(0.42)) break;
            const along = rng.range(0.1, 0.9) * pitch;
            let off = rng.jitter() * reach * 0.5;
            // A pair talking, some of the time: the second stands a pace off
            // the first, across the street's line, and each faces the other.
            const pair = k === 0 && rng.chance(PAIR_SHARE);
            if (!clearOfCar(along)) continue;
            // Out of a main street's carriageway, onto its pavement: across
            // this street's own line, to the side of it this cell paves.
            const across = line + off;
            if (Math.abs(across) < through + CLEAR_FOLK) {
              const kerb = (line < 0 ? -1 : 1) * (through + CLEAR_FOLK + 0.05);
              if (Math.abs(kerb) > mainHalf - CLEAR_FOLK * 0.5) continue;
              off = kerb - line;
            }
            const [x, z] = pointOf(along, off);
            if (inThrough(x, z)) continue;
            const level = levels.get(cellKey(cellIndex(grid, x), cellIndex(grid, z)));
            if (level === undefined) continue;
            spot.length = 0;
            if (!spotAt(x, z, spot, undefined, CLEAR_FOLK)) continue;
            if (pair) {
              // Across the line, towards its middle, so both stay on the band.
              const [px, pz] = pointOf(along, off + (off > 0 ? -1 : 1) * PAIR_GAP);
              if (standable(px, pz, level) && !inThrough(px, pz)) {
                pavingAt(px, pz, level, spot);
                const [ax, ay, az, bx, by, bz] = spot as [number, number, number, number, number, number];
                // Neither strolls: both ends are the spot itself. The yaw is
                // taken in the settlement's frame, where +Y is up and a person
                // faces +Z, which is the frame `folk.ts` turns them in.
                out.folk.push(ax, ay, az, ax, ay, az, ax, ay, az, Math.atan2(bx - ax, bz - az), 1);
                out.folk.push(bx, by, bz, bx, by, bz, bx, by, bz, Math.atan2(ax - bx, az - bz), -1);
                break;
              }
            }
            // The stretch of street this person may stroll: out from the spot
            // both ways, a pace at a time, while it stays on this cell's level,
            // off the steps and the landmarks and clear of the parked car.
            let lo = along;
            let hi = along;
            while (lo - STROLL_STEP > 0.08 * pitch && clearOfCar(lo - STROLL_STEP) &&
              standable(...pointOf(lo - STROLL_STEP, off), level) &&
              !inThrough(...pointOf(lo - STROLL_STEP, off))) lo -= STROLL_STEP;
            while (hi + STROLL_STEP < 0.92 * pitch && clearOfCar(hi + STROLL_STEP) &&
              standable(...pointOf(hi + STROLL_STEP, off), level) &&
              !inThrough(...pointOf(hi + STROLL_STEP, off))) hi += STROLL_STEP;
            if (hi - lo < STROLL_MIN) lo = hi = along;
            out.folk.push(...spot);
            pavingAt(...pointOf(lo, off), level, out.folk);
            pavingAt(...pointOf(hi, off), level, out.folk);
            out.folk.push(NaN, 0);
          }
        }
      }
    }

    litHere = NO_EMITTERS;
    return out;
  }
  // ------------------------------------------------------------------
  // The plan: which part stands where on the square
  // ------------------------------------------------------------------

  /** A rectangle in the town's plane, in world units. */
  interface Rect {
    x0: number;
    x1: number;
    z0: number;
    z1: number;
  }

  /**
   * The ground a building may take over a block of cells: the cells, less the
   * street band on every side that has one, less `EDGE_SETBACK` on the square's
   * own edge. A side that is neither — the back of the cell, where it meets its
   * neighbour in the same block — gives nothing up, so two houses back to back
   * share a party wall, which is what a terrace row is.
   */
  function rectOf(grid: TownGrid, band: number, c0: number, c1: number, r0: number, r1: number): Rect {
    const half = grid.pitch * 0.5;
    const last = grid.cells - 1;
    return {
      x0: cellCentre(grid, c0) - half + (grid.low[c0] === 1 ? band : 0) + (c0 === 0 ? EDGE_SETBACK : 0),
      x1: cellCentre(grid, c1) + half - (grid.high[c1] === 1 ? band : 0) - (c1 === last ? EDGE_SETBACK : 0),
      z0: cellCentre(grid, r0) - half + (grid.low[r0] === 1 ? band : 0) + (r0 === 0 ? EDGE_SETBACK : 0),
      z1: cellCentre(grid, r1) + half - (grid.high[r1] === 1 ? band : 0) - (r1 === last ? EDGE_SETBACK : 0),
    };
  }

  /**
   * The sides of a block of cells a building could face, as `FACING_YAW`
   * indices: every side with a street on it, or — for a block with none, which
   * only the corner of a small square is — every side on the square's edge.
   */
  function facingSides(grid: TownGrid, c0: number, c1: number, r0: number, r1: number): number[] {
    const last = grid.cells - 1;
    const sides: number[] = [];
    if (grid.high[c1] === 1 || (c1 < last && grid.avenue[c1 + 1] === 1)) sides.push(0);
    if (grid.high[r1] === 1 || (r1 < last && grid.avenue[r1 + 1] === 1)) sides.push(1);
    if (grid.low[c0] === 1 || (c0 > 0 && grid.avenue[c0 - 1] === 1)) sides.push(2);
    if (grid.low[r0] === 1 || (r0 > 0 && grid.avenue[r0 - 1] === 1)) sides.push(3);
    if (sides.length > 0) return sides;
    if (c1 === last) sides.push(0);
    if (r1 === last) sides.push(1);
    if (c0 === 0) sides.push(2);
    if (r0 === 0) sides.push(3);
    return sides.length > 0 ? sides : [1];
  }

  /**
   * The yaw that turns a part's front — +Z, the contract's convention — towards
   * each side: east, north, west, south. Quarter turns and nothing between,
   * because a building faces its street; the variety a free yaw used to buy is
   * the parts', the variants' and the heights', and a house at thirty degrees to
   * the street it stands on is what made the heap.
   */
  const FACING_YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI] as const;

  /**
   * Where a variant stands in a rectangle facing one side, or null if it does
   * not fit even at `FIT_SCALE`.
   *
   * **The test is the variant's own plan box, turned, and not the part's
   * footprint radius**, and that is the whole difference from the heap. The
   * radius is a bounding circle, it was compared against a plot size of 0.59 to
   * 1.04 pitches, and it never looked at the neighbours: 60% of buildings stood
   * inside another. A box inside a rectangle that no other building's rectangle
   * overlaps cannot overlap anything.
   *
   * The front goes flush with the street side, so the town has a building line;
   * `slide` places it along that side within whatever room is left over, and the
   * room behind it is its yard.
   */
  function fitIn(flat: FlatVariant, rect: Rect, side: number, scale: number, slide: number): { x: number; z: number; scale: number } | null {
    const yaw = FACING_YAW[side]!;
    const c = Math.round(Math.cos(yaw));
    const s = Math.round(Math.sin(yaw));
    const box = flat.box;
    let ax0 = Infinity;
    let ax1 = -Infinity;
    let az0 = Infinity;
    let az1 = -Infinity;
    for (const [px, pz] of [[box.minX, box.minZ], [box.maxX, box.minZ], [box.maxX, box.maxZ], [box.minX, box.maxZ]] as const) {
      // Three's rotation about Y, which is what `raise` composes.
      const x = px * c + pz * s;
      const z = -px * s + pz * c;
      ax0 = Math.min(ax0, x);
      ax1 = Math.max(ax1, x);
      az0 = Math.min(az0, z);
      az1 = Math.max(az1, z);
    }
    const width = ax1 - ax0;
    const depth = az1 - az0;
    const roomX = rect.x1 - rect.x0;
    const roomZ = rect.z1 - rect.z0;
    if (roomX <= 0 || roomZ <= 0 || width <= 0 || depth <= 0) return null;
    const most = Math.min(roomX / width, roomZ / depth);
    if (most < FIT_SCALE) return null;
    const k = Math.min(scale, most);
    const slackX = roomX - width * k;
    const slackZ = roomZ - depth * k;
    if (side === 0) return { x: rect.x1 - ax1 * k, z: rect.z0 - az0 * k + slackZ * slide, scale: k };
    if (side === 2) return { x: rect.x0 - ax0 * k, z: rect.z0 - az0 * k + slackZ * slide, scale: k };
    if (side === 1) return { x: rect.x0 - ax0 * k + slackX * slide, z: rect.z1 - az1 * k, scale: k };
    return { x: rect.x0 - ax0 * k + slackX * slide, z: rect.z0 - az0 * k, scale: k };
  }

  /**
   * Where everything in one settlement stands, on its square.
   *
   * **One building a cell, facing a street, inside its own cell.** That is the
   * rule the heap of houses did not have, and each clause is one of the three
   * things wrong with it: the old plots wandered 0.38 of a pitch and took any
   * yaw within about eighty degrees of the street, and a building's footprint
   * *radius* was checked against a plot size and never against a neighbour.
   * Here a cell's rectangle is its own, less its street band; the building's
   * turned box has to fit inside it; and its front is on the street, so every
   * building in the town can be walked up to.
   *
   * - **The civic building comes first**, beside the middle of the town: on the
   *   two-by-two block at a corner of the crossroads when the square has one
   *   and the church needs it, and on the single cell there otherwise. A steeple
   *   church is 10.6 by 14.3 and a cell is 12, so a village keeps its chapel
   *   only if it has a block to put it on, and gets a house instead — which is
   *   the old `CIVIC_ROOM` rule's answer, reached through the geometry rather
   *   than through a share of the radius.
   * - **Then every other cell, nearest the middle first**: a building with the
   *   old fill chance — a village is mostly built, a city more so — the draw
   *   weighted as `mixAt` always weighted it, and when the part drawn does not
   *   fit, the region's next smaller one rather than nothing.
   * - **A cell with no building gets the greenery** a yard would have had.
   * - **A landmark's cells get nothing**: the town wraps round the monument,
   *   paved under it, and does not build into it.
   */
  /**
   * The region as a town at this rank builds it: a near town of a region with
   * `assets` swaps the code parts it names for the baked ones, and every other
   * town is built as the table says. The swap is on the mixes, so everything
   * downstream — the fitting, the walls, the lights — reads the part it got.
   *
   * **A tower is a city's.** A glass tower beside a church in a town of 68,000
   * read as a mistake (Kempten, 2026-09-17), so below `TOWER_URBANITY` the
   * part a region names for its towers is the commercial block instead.
   */
  const detailedStyles = new Map<string, RegionStyle>();
  function styleFor(slot: Slot): RegionStyle {
    const style = slot.style;
    if (!slot.peopled || style.assets === undefined) return style;
    const towers = urbanityOf(slot.place.pop) >= TOWER_URBANITY;
    const key = `${style.id}:${towers}`;
    let found = detailedStyles.get(key);
    if (found === undefined) {
      const assets = style.assets;
      const swapped = (item: string) => {
        const to = assets[item] ?? item;
        return !towers && to === TOWER_PART ? TOWERLESS_PART : to;
      };
      const swap = (mix: readonly Weighted<string>[]) => mix.map((entry) => ({ item: swapped(entry.item), weight: entry.weight }));
      found = { ...style, buildings: swap(style.buildings), civic: swap(style.civic) };
      detailedStyles.set(key, found);
    }
    return found;
  }

  /**
   * What `planTown` put in the country round a town rather than on its floor,
   * so `raise` seats it on the relief rather than on a terrace.
   */
  const inTheCountry = new WeakSet<Placed>();

  /**
   * The country a town fades into: orchards, trees and bushes on the cells it
   * gave up (`outskirtsOf`) and on the lattice's next two cells out, as far as
   * its disc — the ground the vegetation keeps off for the town's sake and
   * that was left bare.
   *
   * **A town cut short of its square read as a stamp on an empty clearing**,
   * because the wood and the herds keep off the whole of `radiusOf`'s disc and
   * nothing else grew there: the outline changed and the town still ended in
   * a line. So the town grows its own edge out of the region's trees and
   * scatter — in rows, a cell at a time, which is what an orchard is, and
   * loose where it is not — and leaves alone:
   *
   * - **the edge slope**, the course of cells round the paving (anything
   *   within a cell of it, diagonals too), which stands at the floor's own
   *   height and is not ground;
   * - **the way the roads come in**, a strip `ROAD_KEEP` either side of each
   *   road's line out of its gate;
   * - **a landmark's ground**, the same keepouts the town wraps round;
   * - and the sea and anything steeper than `MAX_SLOPE`, which `raise` asks of
   *   the relief when it seats each one.
   */
  function countryside(slot: Slot, grid: TownGrid, style: RegionStyle): Placed[] {
    const out: Placed[] = [];
    const cells = grid.cells;
    const town = (col: number, row: number): boolean => inGrid(grid, col, row) && terraceAt(col, row) !== null;
    const nearTown = (col: number, row: number): boolean => {
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (town(col + dc, row + dr)) return true;
      return false;
    };
    // The roads coming in: each runs straight out of its gate for its first
    // stretch (`courseOf`'s stub), so what keeps off it is a strip as wide as
    // the carriageway and a tree's crown either side, from the kerb outwards.
    const gates = gatesOf(grid);
    const used = (roadGates.get(slot.place) ?? []).map((index) => gates[index]).filter((gate) => gate !== undefined);
    const clearOfRoads = (x: number, z: number): boolean => used.every((gate) => {
      const out = (x - gate.x) * gate.outX + (z - gate.z) * gate.outZ;
      const lateral = Math.abs((x - gate.x) * gate.outZ - (z - gate.z) * gate.outX);
      return out < -1 || lateral > ROAD_KEEP;
    });
    const half = grid.pitch * 0.5;
    /**
     * How far out the country may reach: the town's disc, or for a town too
     * small to have room inside it, `COUNTRY_RING` cells past its square —
     * as long as no other built town's disc is there. The discs are what the
     * places were thinned by, so inside our own nothing else stands, and past
     * it we ask.
     */
    const disc = countryReach(slot.radius);
    const neighbours: { x: number; z: number; radius: number }[] = [];
    if (disc > slot.radius) {
      const cosReach = Math.cos((disc + BIGGEST_SETTLEMENT) / PLANET_RADIUS);
      for (const other of slots) {
        if (other === slot || !isShown(other.place)) continue;
        if (other.direction.dot(slot.direction) < cosReach) continue;
        neighbours.push({ x: other.direction.dot(across) * PLANET_RADIUS, z: other.direction.dot(north) * PLANET_RADIUS, radius: other.radius });
      }
    }
    const crowded = (x: number, z: number): boolean =>
      Math.hypot(x, z) > slot.radius && neighbours.some((other) => Math.hypot(x - other.x, z - other.z) < other.radius + half);
    /** How far a point is from the nearest cell of the town, in world units. */
    const fromTown = (x: number, z: number): number => {
      const col = cellIndex(grid, x);
      const row = cellIndex(grid, z);
      let best = Infinity;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (!town(col + dc, row + dr)) continue;
          const dx = Math.max(Math.abs(x - cellCentre(grid, col + dc)) - half, 0);
          const dz = Math.max(Math.abs(z - cellCentre(grid, row + dr)) - half, 0);
          best = Math.min(best, Math.hypot(dx, dz));
        }
      }
      return best;
    };
    const clear = (x: number, z: number): boolean => fromTown(x, z) >= grid.pitch * SLOPE_CLEAR;
    for (let col = -COUNTRY_RING; col < cells + COUNTRY_RING; col++) {
      for (let row = -COUNTRY_RING; row < cells + COUNTRY_RING; row++) {
        if (town(col, row)) continue;
        // A cell of the edge slope takes nothing on its inner half, where the
        // slope still stands over the ground; its outer half is nearly at it.
        const onSlope = nearTown(col, row);
        const cx = cellCentre(grid, col);
        const cz = cellCentre(grid, row);
        if (Math.hypot(Math.abs(cx) + half, Math.abs(cz) + half) > disc) continue;
        if (crowded(cx, cz)) continue;
        if (keepouts.some((keepout) => Math.hypot(keepout.x - cx, keepout.z - cz) < keepout.radius + half)) continue;
        const rng = rngFrom(slot.seed, 'country', col, row);
        const draw = rng.unit();
        if (draw < ORCHARD_SHARE) {
          // An orchard: one species in a square of rows.
          const trees = fitting(style.trees, half);
          if (trees === null) continue;
          const id = rng.weighted(trees);
          const rows = 2;
          const step = grid.pitch / rows;
          const variant = rng.int(VARIANTS);
          for (let i = 0; i < rows; i++) {
            for (let j = 0; j < rows; j++) {
              const x = cx - half + step * (i + 0.5) + rng.jitter() * 0.4;
              const z = cz - half + step * (j + 0.5) + rng.jitter() * 0.4;
              if ((onSlope && !clear(x, z)) || !clearOfRoads(x, z)) continue;
              out.push({
                partId: id, variant, scale: rng.spread(0.9, 0.06),
                plot: { x, z, yaw: rng.unit() * Math.PI * 2, size: step, distance: Math.hypot(x, z), seed: rng.unit() * 0x7fffffff, col, row },
              });
            }
          }
        } else if (draw < ORCHARD_SHARE + LOOSE_SHARE) {
          // Loose: a tree or two and a bush, anywhere in the cell.
          const count = 2 + rng.int(3);
          for (let k = 0; k < count; k++) {
            const mix = k < 2 ? fitting(style.trees, half) : fitting(style.scatter, half) ?? fitting(style.trees, half);
            if (mix === null) continue;
            const x = cx + rng.jitter() * half * 0.8;
            const z = cz + rng.jitter() * half * 0.8;
            if ((onSlope && !clear(x, z)) || !clearOfRoads(x, z)) continue;
            out.push({
              partId: rng.weighted(mix), variant: rng.int(VARIANTS), scale: rng.spread(1, 0.14),
              plot: { x, z, yaw: rng.unit() * Math.PI * 2, size: half, distance: Math.hypot(x, z), seed: rng.unit() * 0x7fffffff, col, row },
            });
          }
        }
      }
    }
    for (const entry of out) inTheCountry.add(entry);
    return out;
  }

  function planTown(slot: Slot, grid: TownGrid): { placed: Placed[] } {
    const style = styleFor(slot);
    const urbanity = urbanityOf(slot.place.pop);
    const band = streetBand(grid, slot.ground.street);
    const cells = grid.cells;
    const placed: Placed[] = [];
    const taken = new Set<number>();
    const fill = cells === 1 ? 1 : 0.83 + 0.12 * urbanity;

    const blocked = (rect: Rect): boolean => keepouts.some((keepout) => {
      const dx = Math.max(rect.x0 - keepout.x, 0, keepout.x - rect.x1);
      const dz = Math.max(rect.z0 - keepout.z, 0, keepout.z - rect.z1);
      return dx * dx + dz * dz < keepout.radius * keepout.radius;
    });

    /**
     * The part drawn, then every other part in the mix, largest first.
     *
     * Not only the smaller ones, which is what "the next smaller building"
     * sounds like and is wrong: the footprint is a bounding *radius* and says
     * nothing about which box fits which rectangle. A tower block declares 8.2
     * and is 9.5 by 9.4, which fits no single cell; a machiya declares 8.8 and
     * is 8.9 by 11.5, which fits a pair — so a Beijing that drew a tower and
     * then only tried parts with a smaller radius tried nothing, and half its
     * cells came out as yards.
     */
    const candidates = (mix: readonly Weighted<string>[], rng: ReturnType<typeof rngFrom>): string[] => {
      if (mix.length === 0) return [];
      const first = rng.weighted(mix);
      const rest = [...new Set(mix.map((entry) => entry.item))]
        .filter((id) => id !== first)
        .sort((a, b) => footprintOf(b) - footprintOf(a) || (a < b ? -1 : 1));
      return [first, ...rest];
    };

    const place = (
      ids: readonly string[], rect: Rect, sides: readonly number[],
      rng: ReturnType<typeof rngFrom>, col: number, row: number,
    ): boolean => {
      for (const id of ids) {
        const variant = rng.int(VARIANTS);
        const flat = variantOf(id, style, variant);
        if (flat === null) continue;
        const side = sides[rng.int(sides.length)]!;
        const fitted = fitIn(flat, rect, side, rng.spread(1, 0.09), rng.unit());
        if (fitted === null) continue;
        placed.push({
          partId: id,
          variant,
          scale: fitted.scale,
          plot: {
            x: fitted.x,
            z: fitted.z,
            yaw: FACING_YAW[side]!,
            size: Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0),
            distance: Math.hypot(fitted.x, fitted.z),
            seed: rng.unit() * 0x7fffffff,
            col,
            row,
          },
        });
        return true;
      }
      return false;
    };

    /**
     * Whether a block of cells is one level: every cell has a terrace and it is
     * the same terrace. A building spanning two cells stands on one floor, and
     * a step under half of it is a house hanging over a four-unit drop.
     */
    const level = (c0: number, c1: number, r0: number, r1: number): boolean => {
      let seen: number | null | undefined;
      for (let c = c0; c <= c1; c++) {
        for (let r = r0; r <= r1; r++) {
          const here = terraceAt(c, r);
          if (here === null) return false;
          if (seen === undefined) seen = here;
          else if (here !== seen) return false;
        }
      }
      return true;
    };

    /**
     * The plots a cell can offer, best first: itself, then itself and the cell
     * behind it — the one across a boundary with no street on it, which is its
     * neighbour in the same two-deep block — when that one is free and on the
     * same terrace.
     *
     * **One cell is 12 units less its street band, about 8.3 square, and half
     * the kit does not fit that.** A machiya is 8.9 by 11.5 and a terrace block
     * 11.9 by 8.3, so Beijing came out as 103 buildings on 324 cells until a
     * building could take the pair. It is what a town block does anyway: a row
     * of narrow houses, or one long one.
     */
    const plotsFor = (col: number, row: number): [number, number, number, number][] => {
      const options: [number, number, number, number][] = [[col, col, row, row]];
      const free = (c: number, r: number): boolean =>
        c >= 0 && r >= 0 && c < cells && r < cells && !isAvenue(grid, c, r) && !taken.has(cellKey(c, r));
      if (col + 1 < cells && grid.high[col] === 0 && grid.low[col + 1] === 0 && free(col + 1, row)) options.push([col, col + 1, row, row]);
      if (col > 0 && grid.low[col] === 0 && grid.high[col - 1] === 0 && free(col - 1, row)) options.push([col - 1, col, row, row]);
      if (row + 1 < cells && grid.high[row] === 0 && grid.low[row + 1] === 0 && free(col, row + 1)) options.push([col, col, row, row + 1]);
      if (row > 0 && grid.low[row] === 0 && grid.high[row - 1] === 0 && free(col, row - 1)) options.push([col, col, row - 1, row]);
      // And the whole two-by-two block, last: a tower block is 9.5 square and
      // fits nothing smaller, and a downtown block with one tower on it is what
      // a downtown is. Only when both partners and the diagonal are free.
      const across = options.find(([c0, c1, r0, r1]) => r0 === r1 && c0 !== c1);
      const along = options.find(([c0, c1, r0, r1]) => c0 === c1 && r0 !== r1);
      if (across !== undefined && along !== undefined) {
        const dc = across[0] === col ? across[1] : across[0];
        const dr = along[2] === row ? along[3] : along[2];
        if (free(dc, dr)) options.push([Math.min(col, dc), Math.max(col, dc), Math.min(row, dr), Math.max(row, dr)]);
      }
      return options.filter(([c0, c1, r0, r1]) => level(c0, c1, r0, r1));
    };

    /**
     * The first candidate that fits any of a cell's plots, and the plot it took.
     *
     * Two passes: every candidate on the cell and its pairs first, and only
     * then the two-by-two block. A block-sized plot fits anything, so offering
     * it in the first pass would hand a whole block to the first tower drawn
     * and empty a city four cells at a time.
     */
    const placeAny = (
      ids: readonly string[], options: readonly [number, number, number, number][],
      rng: ReturnType<typeof rngFrom>,
    ): [number, number, number, number] | null => {
      const small = options.filter(([c0, c1, r0, r1]) => c0 === c1 || r0 === r1);
      const large = options.filter(([c0, c1, r0, r1]) => c0 !== c1 && r0 !== r1);
      return placeFrom(ids, small, rng) ?? placeFrom(ids, large, rng);
    };
    const placeFrom = (
      ids: readonly string[], options: readonly [number, number, number, number][],
      rng: ReturnType<typeof rngFrom>,
    ): [number, number, number, number] | null => {
      if (options.length === 0) return null;
      for (const id of ids) {
        const variant = rng.int(VARIANTS);
        const flat = variantOf(id, style, variant);
        if (flat === null) continue;
        const scale = rng.spread(1, 0.09);
        const slide = rng.unit();
        const pick = rng.unit();
        for (const option of options) {
          const [c0, c1, r0, r1] = option;
          const rect = rectOf(grid, band, c0, c1, r0, r1);
          if (blocked(rect)) continue;
          const sides = facingSides(grid, c0, c1, r0, r1);
          const side = sides[Math.floor(pick * sides.length)]!;
          const fitted = fitIn(flat, rect, side, scale, slide);
          if (fitted === null) continue;
          placed.push({
            partId: id,
            variant,
            scale: fitted.scale,
            plot: {
              x: fitted.x,
              z: fitted.z,
              yaw: FACING_YAW[side]!,
              size: Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0),
              distance: Math.hypot(fitted.x, fitted.z),
              seed: rng.unit() * 0x7fffffff,
              // The cell the building's origin stands in: its terrace is the
              // block's, which `level` has already said is one terrace.
              col: cellIndex(grid, fitted.x),
              row: cellIndex(grid, fitted.z),
            },
          });
          return option;
        }
      }
      return null;
    };

    // The first cell out from the centre on each side, which is where the
    // crossroads' corners are.
    const odd = cells % 2 === 1;
    const up1 = odd ? (cells - 1) / 2 + 1 : cells / 2;
    const down1 = odd ? (cells - 1) / 2 - 1 : cells / 2 - 1;

    // --- the civic building ---
    const civicRng = rngFrom(slot.seed, 'civic');
    const sx = civicRng.chance(0.5) ? 1 : -1;
    const sz = civicRng.chance(0.5) ? 1 : -1;
    if (style.civic.length > 0) {
      let done = false;
      if (cells >= 4) {
        const c0 = sx > 0 ? up1 : down1 - 1;
        const r0 = sz > 0 ? up1 : down1 - 1;
        const rect = rectOf(grid, band, c0, c0 + 1, r0, r0 + 1);
        if (!blocked(rect) && level(c0, c0 + 1, r0, r0 + 1)) {
          // Facing the main street, which is on the side of the block nearest
          // the centre.
          const sides = [sx > 0 ? 2 : 0, sz > 0 ? 3 : 1];
          if (place(candidates(style.civic, civicRng), rect, sides, civicRng, c0, r0)) {
            for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) taken.add(cellKey(c0 + dc, r0 + dr));
            done = true;
          }
        }
      }
      if (!done) {
        const c = cells === 1 ? 0 : sx > 0 ? up1 : down1;
        const r = cells === 1 ? 0 : sz > 0 ? up1 : down1;
        const rect = rectOf(grid, band, c, c, r, r);
        if (!blocked(rect) && level(c, c, r, r) && place(candidates(style.civic, civicRng), rect, facingSides(grid, c, c, r, r), civicRng, c, r)) {
          taken.add(cellKey(c, r));
        }
      }
    }

    // --- every other cell, nearest the middle first ---
    const order: [number, number][] = [];
    for (let col = 0; col < cells; col++) for (let row = 0; row < cells; row++) order.push([col, row]);
    order.sort((a, b) =>
      Math.hypot(cellCentre(grid, a[0]), cellCentre(grid, a[1])) - Math.hypot(cellCentre(grid, b[0]), cellCentre(grid, b[1]))
      || a[0] - b[0] || a[1] - b[1]);
    for (const [col, row] of order) {
      if (isAvenue(grid, col, row) || taken.has(cellKey(col, row))) continue;
      // A cell the ground refuses is not paved, so nothing stands on it.
      if (terraceAt(col, row) === null) continue;
      const rect = rectOf(grid, band, col, col, row, row);
      if (rect.x1 - rect.x0 < 1 || rect.z1 - rect.z0 < 1 || blocked(rect)) continue;
      const rng = rngFrom(slot.seed, 'cell', col, row);
      /**
       * **The edge of a town is houses in their yards, not blocks on paving.**
       * A square built alike to its kerb ends in a wall of flats however its
       * outline goes, so past `OUTSKIRT_RING` a cell is built a little less
       * often, only with the region's houses, and a cell left empty is given
       * the greenery more readily than one in the middle.
       */
      const ringed = cells >= OUTSKIRT_MIN_CELLS;
      const score = ringed ? outskirtScore(grid, slot.seed, col, row)
        : Math.max(Math.abs(cellCentre(grid, col)), Math.abs(cellCentre(grid, row))) / Math.max(1, grid.half);
      const edge = Math.min(1, score);
      const outer = ringed && score > OUTSKIRT_RING;
      if (rng.chance(outer ? fill * OUTER_FILL : fill)) {
        let mix = mixAt(style, urbanity, edge, Infinity);
        if (outer) {
          const homes = mix.filter((entry) => KIND_OF.get(entry.item) !== 'block');
          if (homes.length > 0) mix = homes;
        }
        const ids = candidates(mix, rng);
        const took = placeAny(ids, plotsFor(col, row), rng);
        if (took !== null) {
          const [c0, c1, r0, r1] = took;
          for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) taken.add(cellKey(c, r));
          continue;
        }
      }
      // A yard: what would have grown on the plot, in the middle of it.
      const room = Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0) * 0.5;
      const trees = fitting(style.trees, room);
      // **In a village the empty plot is its orchard.** Four cells or fewer is
      // a crossroads and three or four houses, and a cell left bare there was
      // a quarter of the village drawn as an empty yard; half of them are four
      // trees of one kind in rows instead.
      if (cells < OUTSKIRT_MIN_CELLS && trees !== null && rng.chance(0.55)) {
        const id = rng.weighted(trees);
        const variant = rng.int(VARIANTS);
        const stepX = (rect.x1 - rect.x0) / 2;
        const stepZ = (rect.z1 - rect.z0) / 2;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            const x = rect.x0 + stepX * (i + 0.5) + rng.jitter() * 0.3;
            const z = rect.z0 + stepZ * (j + 0.5) + rng.jitter() * 0.3;
            placed.push({
              partId: id, variant, scale: rng.spread(0.85, 0.06),
              plot: { x, z, yaw: rng.unit() * Math.PI * 2, size: room, distance: Math.hypot(x, z), seed: rng.unit() * 0x7fffffff, col, row },
            });
          }
        }
        continue;
      }
      const scatter = fitting(style.scatter, room);
      const green = outer || cells < OUTSKIRT_MIN_CELLS;
      const mix = trees !== null && rng.chance(green ? Math.min(1, style.greenery * OUTER_GREENERY) : style.greenery * (1 - edge * 0.45)) ? trees
        : scatter !== null && rng.chance(0.45) ? scatter : null;
      if (mix === null) continue;
      const x = (rect.x0 + rect.x1) * 0.5 + rng.jitter() * (rect.x1 - rect.x0) * 0.15;
      const z = (rect.z0 + rect.z1) * 0.5 + rng.jitter() * (rect.z1 - rect.z0) * 0.15;
      placed.push({
        partId: rng.weighted(mix),
        variant: rng.int(VARIANTS),
        scale: rng.spread(1, 0.14),
        plot: { x, z, yaw: rng.unit() * Math.PI * 2, size: room, distance: Math.hypot(x, z), seed: rng.unit() * 0x7fffffff, col, row },
      });
    }
    placed.push(...countryside(slot, grid, style));
    return { placed };
  }

  function raise(slot: Slot): void {
    if (slot.mesh !== null || slot.failed) return;
    slot.builtPeopled = slot.peopled;
    slot.stale = false;

    up.copy(slot.direction);
    frameAt();
    if (basis.determinant() <= 0) {
      slot.failed = true;
      broken.push(`${slot.place.name}: settlement basis has determinant ${basis.determinant()}`);
      return;
    }

    /**
     * **A settlement no longer steps aside from a monument; it wraps round it.**
     *
     * It used to move along the great circle, up to 74 units at Sydney, until it
     * was clear of a landmark that would swallow it — 28 landmark cities stood
     * inside their own landmark's footprint. That was a fix for a town that was
     * a ragged disc of plots with nothing depending on exactly where it stood.
     * The square's edge and its gates are functions of the place alone now
     * (`scenery/grid.ts`), because the roads have to know where to arrive, and a
     * town that walked off its own coordinate would take its gates with it and
     * leave every road ending in a field. So the cells under a landmark are
     * paved and nothing is built on them — `planTown`'s keepout test — and a
     * town smaller than its landmark is that landmark's square.
     */
    const grid = townGrid(slot.radius);
    townGridNow = grid;
    baseElevation = Math.max(0, world.elevationAt(up));
    corners.clear();
    terraces.clear();
    // Every cell's terrace, before anything stands on one: the gates' cells cut
    // to the level the road arriving there climbs to, and every street one level
    // across its width. `cellLevel` is the one definition, and `roads.ts` asks
    // it the same question about the gate cells through `gateLevel`.
    for (const [key, level] of townTerraces(grid, townGround)) terraces.set(key, level);
    // And the cells the town stops short of its square in, which are not paved
    // either: taken out after the levels, so a street's cells keep the level
    // their whole group was cut to. The streets the roads come in by and the
    // cells under a landmark are kept whole.
    const kept = new Set<number>();
    const gates = gatesOf(grid);
    for (const index of roadGates.get(slot.place) ?? []) {
      const gate = gates[index];
      if (gate === undefined) continue;
      for (const [col, row] of gate.cells) {
        for (let c = 0; c < grid.cells; c++) kept.add(gate.outX !== 0 ? cellKey(c, row) : cellKey(col, c));
      }
    }
    const half = grid.pitch * 0.5;
    const outskirts = outskirtsOf(grid, slot.seed, (col, row) => kept.has(cellKey(col, row)) || keepouts.some((keepout) => {
      const dx = Math.max(Math.abs(keepout.x - cellCentre(grid, col)) - half, 0);
      const dz = Math.max(Math.abs(keepout.z - cellCentre(grid, row)) - half, 0);
      return dx * dx + dz * dz < keepout.radius * keepout.radius;
    }));
    for (const key of outskirts) terraces.set(key, null);
    /**
     * **A gate no road comes in by is not a gate.** Every gate's cells may be
     * cut to `GATE_CUT`, deeper than any other cell, because a gate refused is
     * a road lost; on a hillside, one no road uses came out as a cell sunk
     * between walls with a street running into the grass. So a gate cell that
     * is no used gate's own, and whose own corners span more than `MAX_CUT`,
     * is not paved. No level changes — the road's ramp reads `gateLevel`,
     * which is this cell's group's — it is only left unbuilt.
     */
    const used = new Set<number>();
    for (const index of roadGates.get(slot.place) ?? []) {
      for (const [col, row] of gates[index]?.cells ?? []) used.add(cellKey(col, row));
    }
    for (const gate of gates) {
      for (const [col, row] of gate.cells) {
        const key = cellKey(col, row);
        if (used.has(key) || terraces.get(key) == null) continue;
        let high = -Infinity;
        let low = Infinity;
        for (const [i, j] of [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]] as const) {
          const elevation = townGround.corner(i, j);
          high = Math.max(high, elevation);
          low = Math.min(low, elevation);
        }
        if (high - low > MAX_CUT) terraces.set(key, null);
      }
    }

    const placed = planTown(slot, grid).placed;

    // Two passes. The first works out the ground under every plot and throws
    // away the ones in the water or on a cliff; only then is the buffer sized,
    // because a settlement on a headland can lose half its plots to the sea and
    // an over-allocated buffer would ship the difference as zeroed triangles at
    // the origin.
    interface Standing {
      flat: FlatVariant;
      matrix: THREE.Matrix4;
      /** A parked car that can be taken, whose vertices this merge records. */
      bay?: Bay;
      /**
       * How much of the variant's window pattern this copy of it shows, 0 to 1.
       *
       * The second half of the variety `WINDOW_DARK` starts: six variants and
       * eight yaws give a village more silhouettes than it has plots, but after
       * dark the silhouette is gone and what is left is the pattern of lights —
       * so two instances of one variant twenty units apart read as the same
       * house twice unless something separates them. This is that something,
       * and it is one multiply per vertex at merge time.
       */
      glow: number;
      /**
       * And the same again for the hour, in encoded steps of 3.75 minutes.
       *
       * Two houses of the same variant do not go to bed together. It is an
       * *offset* on the variant's own draw rather than a fresh one, so the
       * pattern within a building survives — the upstairs still goes dark before
       * the front room — and only the household's hour moves.
       *
       * Optional, and omitting it means no offset. Nothing that is not a
       * *building* has a household in it: a lamp burns till dawn, and a person
       * or a parked car does not emit at all.
       */
      bed?: number;
    }
    const standing: Standing[] = [];
    let vertices = 0;
    let drowned = 0;
    let buried = 0;
    /**
     * The cells a *building* actually came up on, which is what gets paved.
     *
     * Collected here rather than from the plan because the plan is what was
     * asked for and this is what stands: a plot in the water or on ground too
     * steep is refused after the plan is made, and paving a square nothing
     * stands on puts a forecourt in the sea.
     */
    const built = new Set<number>();
    /** The cells a block or a civic building covers, whose yard is paving whatever the region's yards are. */
    const pavedCells = new Set<number>();
    /**
     * The buildings whose windows came out lit, so the floor can carry what
     * falls out of them. Collected here for the same reason `built` is: the
     * plan is what was asked for and this is what stands.
     */
    const litPlots: LitPlot[] = [];
    /** The walls of what stands, for `collide`. See `solidOf`. */
    const solids: Solid[] = [];

    for (const entry of placed) {
      const flat = variantOf(entry.partId, slot.style, entry.variant);
      if (flat === null) continue;

      const footprint = footprintOf(entry.partId) * entry.scale;
      directionAt(entry.plot.x, entry.plot.z, scratch);
      const elevation = world.elevationAt(scratch);
      // Elevation 0 is the sea, and the coastline is a 20-unit cliff. A plot
      // that lands over water is not a house on stilts, it is a house dropped
      // three storeys — so the shoreline is where a settlement stops.
      if (elevation <= 0) {
        drowned++;
        continue;
      }

      /**
       * The cell this plot is in, and the terrace the town would cut there.
       *
       * **This replaces the burial test for anything that stands on the floor,
       * and it is a better question rather than a stricter one.** `MAX_BURIAL`
       * asked how much of a building the hill behind it would swallow, because a
       * building used to be bedded straight into the relief — its own doorstep
       * followed the slope. A building stands on a *level* terrace now, so the
       * hill cannot swallow it at all; what the hill can do is be too steep to
       * cut a terrace into, and that is what `terraceAt` answers with `MAX_CUT`.
       *
       * The refusal is the answer to the towns on slopes that overlapped their
       * mountain, landed per plot rather than per town, so a hillside town
       * builds the part of itself that stands and leaves the part that would
       * have been a house halfway into a mountain.
       */
      // The country round the town stands on the relief, where the wood does,
      // and only where the wood would: out of the sea and off a cliff.
      const country = inTheCountry.has(entry);
      if (country) {
        gradeAt(scratch, across, north, Math.max(1, footprint), slope);
        if (slope.grade > MAX_SLOPE) {
          buried++;
          continue;
        }
      }
      const level = country ? elevation - GROUND_LIFT : terraceAt(entry.plot.col, entry.plot.row);
      if (level === null) {
        buried++;
        continue;
      }

      // Everything in the square stands on its cell's terrace: the trees in
      // the yards too, which used to be bedded into the relief because they
      // grew in the green between the cells, and there is no green between
      // the cells now — the square is paved to its edge.
      const kind = KIND_OF.get(entry.partId);
      const standsOnFloor = kind === 'dwelling' || kind === 'block' || kind === 'civic';
      directionAt(entry.plot.x, entry.plot.z, scratch);
      const seat = level + GROUND_LIFT;
      local
        .copy(scratch)
        .multiplyScalar(PLANET_RADIUS + seat)
        .sub(origin)
        .applyMatrix4(inverse);

      quaternion.setFromAxisAngle(AXIS_Y, entry.plot.yaw);
      scaleVector.setScalar(entry.scale);
      transform.compose(local, quaternion, scaleVector);
      const lit = rngFrom(slot.seed, 'lit', entry.plot.col, entry.plot.row);
      // Seeded on the plot, so the same house on the same corner is lit the
      // same way on every load, and only asked for when there is a window to
      // dim: a tree costs no random draw. One `Rng` for both, drawn in order,
      // which is what keeps each stable when the other changes.
      const shine = flat.emits ? lit.range(INSTANCE_DIM, 1) : 0;
      const bedShift = flat.emits ? Math.round(lit.jitter() * INSTANCE_BED) : 0;
      standing.push({ flat, matrix: transform.clone(), glow: shine, bed: bedShift });
      vertices += flat.position.length / 3;
      if (shine > 0) {
        litPlots.push({
          // The frame the floor's vertices are in, which is the one `local`
          // already holds — `entry.plot.x` is the tangent *plane* coordinate and
          // the two are the same number only to about a tenth of a unit.
          x: local.x,
          z: local.z,
          radius: footprint,
          strength: shine,
          // The building's own hour, not the variant's: two copies of one house
          // are two households, and the forecourt goes dark with the room above
          // it. Clamped to 254 so it can never encode `BED_ALWAYS` by accident
          // and leave one porch burning until dawn.
          bed: Math.max(0, Math.min(254, flat.litBed + bedShift)),
        });
      }

      // A tree is not a reason to pave a square. Only the built kinds claim
      // their cell, which is what leaves the greenery ring green — and it is the
      // same predicate that put this one on the floor above.
      if (standsOnFloor) {
        built.add(cellKey(entry.plot.col, entry.plot.row));
        const solid = solidOf(flat, entry.plot.x, entry.plot.z, entry.plot.yaw, entry.scale, level);
        solids.push(solid);
        // A block and a civic building stand on paving, a house in its yard.
        if (kind !== 'dwelling') pavedUnder(solid, grid, pavedCells);
      }
    }

    /**
     * The last building, at the exact centre, when nothing else would stand.
     *
     * **A square whose every cell the ground refused, or where no part fitted,
     * would otherwise be a name on the map with nothing under it** — the
     * failure this was written for, when twenty of an 823-place sample built
     * nothing because a jittered plot had wandered into the sea or up a slope
     * at Tromso, Hammerfest, Linares or El Calafate. It is rarer on the square
     * and it is still the one outcome a settlement builder must not have,
     * because a place that builds *badly* still reads as a place and a place
     * that builds nothing reads as a bug in the streamer.
     *
     * The centre is the one point that cannot fail. `places.bin` is baked with
     * every row checked to sit on land and a town no longer moves off its own
     * coordinate, so local `(0, 0)` is on land by construction — and it is the
     * ground the anchor, the city light and the HUD's chip all already agree
     * on. The building stands in the cell at the centre, which on a square with
     * an even number of cells is the one just north-east of it, half a cell off.
     *
     * Two rules it deliberately breaks, and both are the point of it:
     *
     * - **No fit test.** It takes the region's smallest building outright,
     *   because "no plot here is wide enough" is exactly the case this exists
     *   for.
     * - **No terrace test.** `terraceAt` refuses a cell the town would have to
     *   cut deeper than `MAX_CUT`, which is right when there is another plot to
     *   try and wrong when there is not. A house cut into a mountainside is
     *   what a hill town looks like; an empty field is not. It still has to
     *   stand on *something*, so it takes the terrace the centre cell would
     *   have had if the cut were allowed.
     *
     * It fires on `built.size === 0` rather than on `standing.length === 0`,
     * so it also catches the ten places in the sample that came out with a
     * bush and no building.
     */
    // ...and the one thing that can still refuse it is a landmark standing on
    // the spot, which is a settlement that has to stay empty rather than one
    // that failed.
    const centreClear = keepouts.every((keepout) => Math.hypot(keepout.x, keepout.z) > keepout.radius);
    if (built.size === 0 && centreClear) {
      // The region's smallest house, which is the one building that cannot
      // fail to fit: this is the case where everything else already did.
      const mix = styleFor(slot).buildings;
      const lone = cellIndex(grid, 0);
      const loneAt = cellCentre(grid, lone);
      let smallest: string | null = null;
      for (const entry of mix) {
        if (smallest === null || footprintOf(entry.item) < footprintOf(smallest)) smallest = entry.item;
      }
      const rng = rngFrom(slot.seed, 'lone-building');
      const flat = smallest === null ? null : variantOf(smallest, slot.style, rng.int(VARIANTS));
      if (flat !== null) {
        // **The centre cell is given a terrace whether the cut allows one or
        // not.** `terraceAt`'s refusal is a preference for a better plot, and by
        // the time this runs there is no other plot; a building with no floor
        // under it is exactly the failure this fallback exists to prevent. It
        // takes the anchor's own elevation, which is the level every other
        // terrace in the town is quantised about.
        terraces.set(cellKey(lone, lone), baseElevation);
        directionAt(loneAt, loneAt, scratch);
        local
          .copy(scratch)
          // On the floor, like every other building; see the seating above.
          .multiplyScalar(PLANET_RADIUS + baseElevation + GROUND_LIFT)
          .sub(origin)
          .applyMatrix4(inverse);
        const loneYaw = Math.floor(rng.unit() * 4) * (Math.PI / 2);
        quaternion.setFromAxisAngle(AXIS_Y, loneYaw);
        scaleVector.setScalar(1);
        transform.compose(local, quaternion, scaleVector);
        const shine = flat.emits ? rng.range(INSTANCE_DIM, 1) : 0;
        const bedShift = flat.emits ? Math.round(rng.jitter() * INSTANCE_BED) : 0;
        standing.push({ flat, matrix: transform.clone(), glow: shine, bed: bedShift });
        vertices += flat.position.length / 3;
        if (shine > 0) {
          litPlots.push({
            x: local.x,
            z: local.z,
            radius: footprintOf(smallest!),
            strength: shine,
            bed: Math.max(0, Math.min(254, flat.litBed + bedShift)),
          });
        }
        built.add(cellKey(lone, lone));
        solids.push(solidOf(flat, loneAt, loneAt, loneYaw, 1, baseElevation));
      }
    }

    slot.planned = placed.length;
    slot.drowned = drowned;
    slot.buried = buried;
    slot.buildings = built.size;
    if (standing.length === 0) {
      // Nothing would stand here, and the retry above could not put a building
      // at the centre either — a region whose whole `buildings` list is missing
      // from the registry, which the `missing` array already reports. Marked
      // failed so the streamer stops asking.
      slot.failed = true;
      return;
    }

    // The ground goes into the same buffer as the houses standing on it, which
    // is not an optimisation but the whole arrangement: a town is one merged
    // mesh and one draw call, and a paving sheet drawn separately would have
    // doubled that for every settlement resident. It also gets the town's own
    // frustum culling and its own bounding sphere for free.
    const band = streetBand(grid, slot.ground.street);
    const ground = buildGround(slot, grid, band, urbanityOf(slot.place.pop), litPlots, pavedCells);
    slot.paved = ground.paved;
    // The floor, in the frame it was laid in, so a foot can find it. See
    // `Slot.floor` and `madeHeightAt`.
    if (ground.terraces.size > 0) {
      // The square's half-diagonal, plus the one course of edge slope round
      // it: nothing of the floor, and no wall, is further from the centre.
      const span = grid.half * Math.SQRT2;
      slot.floor = {
        up: up.clone(),
        across: across.clone(),
        north: north.clone(),
        field: ground.field,
        cosBound: Math.cos((span + floorReach(ground.field)) / PLANET_RADIUS),
        // Filled in once the parked cars are placed, which are walls too.
        solids: null,
        grid,
        band,
        lawn: ground.lawn,
      };
      floors.add(slot);
      noteFloor(slot);
    }
    // The lamps go in with the houses rather than with the floor: a lamp is a
    // part with a lit head on it, so it wants the variant cache, the flattened
    // buffers and the per-instance dimming that every other standing thing gets.
    // Placed after `buildGround` because that is where the streets are decided,
    // and before the buffer is sized because these are vertices in it.
    for (let i = 0; i + 2 < ground.lamps.length; i += 3) {
      const rng = rngFrom(slot.seed, 'lamppost', i);
      const flat = variantOf(LAMP_PART, slot.style, rng.int(VARIANTS));
      if (flat === null) break;
      lampAt.set(ground.lamps[i]!, ground.lamps[i + 1]!, ground.lamps[i + 2]!);
      quaternion.setFromAxisAngle(AXIS_Y, ground.lampYaws[i / 3] ?? 0);
      scaleVector.setScalar(rng.range(0.94, 1.06));
      transform.compose(lampAt, quaternion, scaleVector);
      standing.push({
        flat,
        matrix: transform.clone(),
        // Nearly all of them, and never off: a dark lamp is a post, and the
        // whole reason the part exists is what it does after sunset.
        glow: rng.range(0.82, 1),
      });
      vertices += flat.position.length / 3;
    }

    for (let i = 0; i + 3 < ground.signals.length; i += 4) {
      const rng = rngFrom(slot.seed, 'signal', i);
      const flat = variantOf(SIGNAL_PART, slot.style, rng.int(VARIANTS));
      if (flat === null) break;
      lampAt.set(ground.signals[i]!, ground.signals[i + 1]!, ground.signals[i + 2]!);
      quaternion.setFromAxisAngle(AXIS_Y, ground.signals[i + 3]!);
      scaleVector.setScalar(1);
      transform.compose(lampAt, quaternion, scaleVector);
      standing.push({ flat, matrix: transform.clone(), glow: 1 });
      vertices += flat.position.length / 3;
    }

    /**
     * The town's own people, and what is parked at its kerbs.
     *
     * Appended to `standing` exactly as the lamps are, so they go into the one
     * merged buffer and cost the town **no draw call at all** — which is the
     * whole reason a settlement can hold fourteen people and the moving cast in
     * `src/life.ts` is capped at ninety across the entire world. It is the same
     * trade twice: still and many, or moving and few.
     */
    slot.folk = [];
    slot.parked = [];
    if (slot.peopled) {
      const urbanity = urbanityOf(slot.place.pop);
      const warmth = biomeAt(
        up.x, up.y, up.z, slot.place.lat, slot.place.lon,
        Math.max(0, world.elevationAt(up)), biomeSample(),
      ).warmth;
      const regionId = slot.style.id;

      const wantFolk = TOWN_PEOPLE(urbanity);
      const spots = ground.folk.length / FOLK_STRIDE;
      // Nearest-the-centre first would put the whole crowd in the square; the
      // stride skips through the list instead, so a village's four people are
      // spread over its four streets rather than standing on one. A pair is
      // taken whole, whichever half the stride lands on, or one of them would
      // stand facing somebody who is not there.
      const stride = Math.max(1, Math.floor(spots / Math.max(1, wantFolk)));
      let placedFolk = 0;
      let taken = -1;
      const f = ground.folk;
      for (let i = 0; i < spots && placedFolk < wantFolk; i += stride) {
        const tag = f[i * FOLK_STRIDE + 10]!;
        const first = tag === -1 ? i - 1 : i;
        for (let j = Math.max(first, taken + 1); j < first + (tag === 0 ? 1 : 2); j++) {
          const at = j * FOLK_STRIDE;
          const rng = rngFrom(slot.seed, 'person', j);
          const yaw = f[at + 9]!;
          // Published, not merged: a person is a skinned character now and
          // `folk.ts` stands them here while the player is near. See `folkNear`.
          // In the town's frame here; into the world's once the mesh is placed.
          slot.folk.push({
            key: `${slot.seed}|${j}`,
            position: new THREE.Vector3(f[at]!, f[at + 1]!, f[at + 2]!),
            quaternion: new THREE.Quaternion().setFromAxisAngle(AXIS_Y, Number.isNaN(yaw) ? rng.range(0, Math.PI * 2) : yaw),
            from: new THREE.Vector3(f[at + 3]!, f[at + 4]!, f[at + 5]!),
            to: new THREE.Vector3(f[at + 6]!, f[at + 7]!, f[at + 8]!),
            chatting: f[at + 10] !== 0,
            town: new THREE.Quaternion(),
            region: regionId,
            warmth,
            distance: 0,
          });
          placedFolk++;
          taken = j;
        }
      }

      const style = trafficFor(slot.place.iso, continentOf.get(slot.place.iso) ?? '', slot.place.lat);
      // **A vehicle has to fit the town it is parked in, and the kit publishes
      // the number that says so.** A placed city bus is 10.4 units long (20 while
      // vehicles were placed at twice their section, until 2026-09-24) against a
      // median built radius of 32, so a mix left unfiltered parks one bus across
      // a third of a village. The gate is the *placed* length against the
      // town's own radius, which is one rule instead of a list of which vehicles
      // a village may have.
      const longest = Math.max(8, slot.radius * 0.45);
      const mix = style.road.filter((entry) => {
        const found = vehicleById.get(entry.item);
        return found !== undefined && placedSize(found)[0] <= longest;
      });
      const bays = ground.kerbs.length / 4;
      const wantParked = mix.length === 0 ? 0 : Math.min(bays, TOWN_PARKED(urbanity, style.density));
      const bayStride = Math.max(1, Math.floor(bays / Math.max(1, wantParked)));
      let placedCars = 0;
      for (let i = 0; i < bays && placedCars < wantParked; i += bayStride) {
        const rng = rngFrom(slot.seed, 'parked', i);
        const kind = rng.weighted(mix);
        const flat = parkedVariant(style, kind, rng.int(VARIANTS));
        if (flat === null) break;
        const x = ground.kerbs[i * 4]!;
        const y = ground.kerbs[i * 4 + 1]!;
        const z = ground.kerbs[i * 4 + 2]!;
        const yaw = ground.kerbs[i * 4 + 3]!;
        // **A parked car is a wall**, the same box a building is: a body walks
        // round it and a driven car stops against it. Its roof is the camera's,
        // measured from the kerb it stands on.
        const solid = solidOf(flat, x, z, yaw, 1, origin.length() - PLANET_RADIUS + y - GROUND_LIFT);
        // The ordinal counts every car placed, taken or not, so the others keep
        // their names when one is gone.
        const ordinal = placedCars++;
        const craft = PARKED_CRAFT[kind];
        const id = craft === undefined || ordinal + PARKED_SLOT > 99 ? null : `${craft}:${slot.index}:${ordinal + PARKED_SLOT}`;
        if (id !== null && parkedTaken(id)) continue;
        solids.push(solid);
        local.set(x, y, z);
        quaternion.setFromAxisAngle(AXIS_Y, yaw);
        scaleVector.setScalar(1);
        transform.compose(local, quaternion, scaleVector);
        let bay: Bay | undefined;
        if (id !== null) {
          // In the town's frame here, like the people; into the world's once
          // the mesh is placed.
          bay = {
            id,
            model: craft!,
            position: local.clone(),
            forward: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
            start: 0,
            count: 0,
            solid,
            hidden: false,
          };
          slot.parked.push(bay);
        }
        standing.push({ flat, matrix: transform.clone(), glow: 0, bay });
        vertices += flat.position.length / 3;
      }
    }
    if (slot.floor !== null) slot.floor.solids = solids.length > 0 ? solidField(solids) : null;

    const groundVertices = ground.position.length / 3;
    const total = vertices + groundVertices;

    const position = new Float32Array(total * 3);
    const normal = new Float32Array(total * 3);
    const color = new Float32Array(total * 3);
    // Signed bytes, normalised: a direction to push the ink hull along needs no
    // more, and three bytes a vertex is the whole cost of inking painted parts.
    const outline = new Int8Array(total * 3);
    // Two bytes a vertex against the thirty-six the other three carry — 5.6% of
    // the buffer for every window in the town, its brightness and its bedtime,
    // **and now for every pool of light on its floor as well.** The ground's
    // share used to be left at zero, which is what a `Uint8Array` is born as;
    // it is written by `buildGround` now, out of the same two constants, and
    // the buffer did not change size. A `Uint8Array` is still what a vertex no
    // light reaches gets, and a zero bedtime is never read because nothing with
    // no brightness is drawn.
    const glow = new Uint8Array(total * 2);
    let cursor = 0;
    let vertex = 0;
    for (const item of standing) {
      const e = item.matrix.elements;
      // Uniform scale, so the normal transform is the rotation and dividing by
      // the scale is the same as normalising. A part may not scale itself —
      // `validatePart` refuses it — so there is no shear to correct for.
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
        normal[cursor] = (e[0]! * nx + e[4]! * ny + e[8]! * nz) * inverseScale;
        normal[cursor + 1] = (e[1]! * nx + e[5]! * ny + e[9]! * nz) * inverseScale;
        normal[cursor + 2] = (e[2]! * nx + e[6]! * ny + e[10]! * nz) * inverseScale;
        const ox = source.outline[i]!;
        const oy = source.outline[i + 1]!;
        const oz = source.outline[i + 2]!;
        outline[cursor] = Math.round((e[0]! * ox + e[4]! * oy + e[8]! * oz) * inverseScale * 127);
        outline[cursor + 1] = Math.round((e[1]! * ox + e[5]! * oy + e[9]! * oz) * inverseScale * 127);
        outline[cursor + 2] = Math.round((e[2]! * ox + e[6]! * oy + e[10]! * oz) * inverseScale * 127);
        cursor += 3;
      }
      color.set(source.color, cursor - count);
      const written = count / 3;
      if (item.bay !== undefined) {
        item.bay.start = vertex;
        item.bay.count = written;
      }
      if (item.glow > 0) {
        for (let i = 0; i < written; i++) {
          glow[(vertex + i) * 2] = Math.round(source.glow[i * 2]! * item.glow);
          // The bedtime shifts with the *building*, not with the window: two
          // copies of one variant standing side by side are two households, and
          // a street where every third house goes dark on the same minute is
          // the repetition the per-instance draw exists to break.
          const shift = item.bed ?? 0;
          glow[(vertex + i) * 2 + 1] = Math.max(0, Math.min(255, source.glow[i * 2 + 1]! + shift));
        }
      }
      vertex += written;
    }
    position.set(ground.position, cursor);
    normal.set(ground.normal, cursor);
    color.set(ground.color, cursor);
    for (let i = 0; i < ground.normal.length; i++) outline[cursor + i] = Math.round(ground.normal[i]! * 127);
    // `vertex` is the standing count by now, and the ground is the tail of the
    // buffer, so the pools land on exactly the vertices `buildGround` wrote
    // them for. This is the whole draw-call cost of the feature: none.
    glow.set(ground.glow, vertex * 2);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline, 3, true));
    // `normalized`, so the shader reads 0..1 out of each byte. The attribute name
    // is the one `lightWindows` declares; a geometry without it would read a
    // disabled attribute's default of zero and simply never glow.
    geometry.setAttribute('atlasLit', new THREE.BufferAttribute(glow, 2, true));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `town:${slot.place.name}`;
    // One merged mesh, so the whole town is one draw in the shadow pass too.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Where the floor starts in the one buffer. It is the only way to tell the
    // town's ground from the things standing on it once they are merged, and
    // it is what the A/B for the pools is taken with: zero the tail's two light
    // bytes and the same frame comes back with the windows and nothing else.
    mesh.userData.groundVertices = groundVertices;
    // The geometry is built in the settlement's own tangent frame and placed by
    // this one transform. Two things fall out of it and both matter: the
    // bounding sphere is the town's own, so frustum culling works per town
    // instead of per planet, and the vertex coordinates stay under a hundred
    // units instead of sixteen thousand: a float steps by 2^-17, under a
    // hundred-thousandth of a unit, rather than the 2^-10 — a thousandth — it
    // steps by at the planet's radius.
    mesh.position.copy(origin);
    mesh.quaternion.setFromRotationMatrix(basis);
    group.add(mesh);
    fader.in(mesh);
    // The people into the world's frame, once: the town does not move while
    // it stands, so `folkNear` never has to.
    for (const person of slot.folk) {
      person.position.applyQuaternion(mesh.quaternion).add(mesh.position);
      person.from.applyQuaternion(mesh.quaternion).add(mesh.position);
      person.to.applyQuaternion(mesh.quaternion).add(mesh.position);
      person.quaternion.premultiply(mesh.quaternion);
      person.town.copy(mesh.quaternion);
    }
    if (slot.folk.length > 0) inhabited.add(slot);
    if (ground.lamps.length >= 3) {
      const heads = new Float32Array(ground.lamps.length);
      for (let i = 0; i + 2 < ground.lamps.length; i += 3) {
        lampAt.set(ground.lamps[i]!, ground.lamps[i + 1]! + LAMP_HEAD, ground.lamps[i + 2]!)
          .applyQuaternion(mesh.quaternion).add(mesh.position);
        heads[i] = lampAt.x;
        heads[i + 1] = lampAt.y;
        heads[i + 2] = lampAt.z;
      }
      slot.lampHeads = heads;
      lit.add(slot);
    }
    for (const bay of slot.parked) {
      bay.position.applyQuaternion(mesh.quaternion).add(mesh.position);
      bay.forward.applyQuaternion(mesh.quaternion);
    }
    if (slot.parked.length > 0) parkedTowns.add(slot);

    slot.mesh = mesh;
    slot.triangles = total / 3;
    slot.parts = standing.length;
    // Three float triples, the two light bytes and the three bytes of the ink's
    // normal: 41 bytes a vertex. It was 36 before the lights and 38 before the
    // painted parts (2026-09-16).
    slot.bytes = total * (3 * 4 * 3 + 2 + 3);
  }

  /**
   * Out of the world: dissolved away (`fade.ts`), or at once when `instant` —
   * which is what `survey` and `compare` want, since they raise towns nobody
   * should see arrive.
   */
  function retireMesh(mesh: THREE.Mesh, instant: boolean): void {
    // The geometry is this settlement's and nothing else holds it. The material
    // is one object shared by every town on the planet — disposing it would
    // blank all of them.
    const gone = (): void => {
      group.remove(mesh);
      mesh.geometry.dispose();
    };
    if (instant) {
      fader.cancel(mesh);
      gone();
    } else fader.out(mesh, gone);
  }

  function drop(slot: Slot, instant = false): void {
    // After the early return, not before it: `scan` calls this on every slot
    // it does not want, and a fresh array each was 29,545 of them a scan.
    if (slot.mesh === null) return;
    slot.stale = false;
    slot.folk = [];
    inhabited.delete(slot);
    lit.delete(slot);
    slot.lampHeads = null;
    slot.parked = [];
    parkedTowns.delete(slot);
    retireMesh(slot.mesh, instant);
    slot.mesh = null;
    slot.triangles = 0;
    slot.parts = 0;
    slot.paved = 0;
    // The floor goes with the mesh: nothing is standing here, so nothing stands
    // on it. Leaving it would be a plinth a player walks on over open ground.
    if (slot.floor !== null) noteFloor(slot);
    slot.floor = null;
    floors.delete(slot);
    slot.bytes = 0;
  }

  /**
   * Builds a standing town again, and trades the old mesh for the new one in
   * the same frame.
   *
   * **Crossing `PEOPLED_RANK` used to drop the town and queue it**, so every
   * building changed at once — the City Kits for the code parts, or back — and
   * when the queue was busy the square stood empty for as many frames as it
   * waited. The floor, the walls and the people are the new town's the moment
   * it is raised; only the old mesh is kept, and only until then.
   */
  function rebuild(slot: Slot): void {
    const old = slot.mesh;
    if (old === null) {
      raise(slot);
      return;
    }
    // What the old town published goes now, and the new one publishes its
    // own; `noteFloor` first, because it reads the floor it is noting.
    if (slot.floor !== null) noteFloor(slot);
    slot.floor = null;
    floors.delete(slot);
    inhabited.delete(slot);
    lit.delete(slot);
    slot.lampHeads = null;
    slot.folk = [];
    parkedTowns.delete(slot);
    slot.parked = [];
    slot.mesh = null;
    raise(slot);
    // Out as the new one comes in, on complementary pixels: a cross-dissolve.
    retireMesh(old, false);
    if (slot.mesh === null) {
      // It would not build again: nothing stands here now, as after `drop`.
      slot.triangles = 0;
      slot.parts = 0;
      slot.paved = 0;
      slot.bytes = 0;
      slot.stale = false;
    }
  }

  /**
   * Whether a town whose rank has moved has to be built again to show it.
   *
   * Where the region has kit assets the buildings themselves differ, so it
   * does. Where it has none, the only thing a near town has in its buffer that
   * a far one lacks is the cars parked at its kerbs: a far town built near
   * keeps them and simply stops publishing its people (`folkNear`), and a near
   * town built near is already right. Only a town that was built far and is
   * near now has anything to gain.
   */
  function needsRebuild(slot: Slot): boolean {
    if (slot.mesh === null || slot.builtPeopled === slot.peopled) return false;
    return slot.style.assets !== undefined || slot.peopled;
  }

  // ------------------------------------------------------------------
  // The streamer
  // ------------------------------------------------------------------

  const stats: SettlementStats = {
    resident: 0,
    pending: 0,
    triangles: 0,
    parts: 0,
    megabytes: 0,
    built: 0,
    lastBuildMs: 0,
    range: 0,
    reach: 0,
  };

  /** Reused by `madeHeightAt`, which runs once a frame from `player.ts`. */
  const madeDir = new THREE.Vector3();
  /**
   * Every town with a floor standing, which is what a point query walks.
   *
   * Kept rather than derived from `wanted`: `survey` raises a town outside the
   * streamer's own list and a floor query has to see it, and iterating 29,545
   * slots to find the 140 that are standing is the scan `view.ts` exists to have
   * deleted. `raise` adds and `drop` removes, so it cannot hold a town that is
   * not there.
   */
  const floors = new Set<Slot>();
  /** Every standing town with people in it, for `folkNear`; kept the same way. */
  const inhabited = new Set<Slot>();
  /** Every standing town with street lamps, for `lampsNear`. */
  const lit = new Set<Slot>();
  /** The standing towns with a car in them that can be taken. */
  const parkedTowns = new Set<Slot>();
  /** Whether a parked car has been taken, and so is the fleet's to draw; see `parkedTaken`. */
  let parkedTaken: (id: string) => boolean = () => false;
  /** Towns arriving and leaving by dissolving; see `fade.ts`. */
  const fader = createFader();

  function madeHeightAt(point: THREE.Vector3): number {
    madeDir.copy(point).normalize();
    let best = 0;
    let elevation: number | null = null;
    // Only what is standing, which the streamer caps at `MAX_RESIDENT`: at
    // most 140 dot products, and it never touches the other 29,405 slots.
    for (const slot of floors) {
      const floor = slot.floor;
      if (floor === null) continue;
      if (madeDir.dot(floor.up) < floor.cosBound) continue;
      // Everything inside a settlement is within a few hundredths of a radian
      // of its centre, so the tangent components *are* the local coordinates —
      // the same identity `frameAt` leans on for the keepouts.
      // The ground here, which the lift is measured from. Asked at most once —
      // `elevationAt` is a point-in-polygon and the answer does not depend on
      // which town is asking — and lazily, so a point with no town near it pays
      // nothing at all, which is the common case on a walk.
      if (elevation === null) elevation = world.elevationAt(madeDir);
      const lift = floorLiftAt(
        floor.field,
        madeDir.dot(floor.across) * PLANET_RADIUS,
        madeDir.dot(floor.north) * PLANET_RADIUS,
        elevation,
      );
      if (lift > best) best = lift;
    }
    if (best <= 0 || elevation === null) return 0;
    // A cell whose corners were on land can still cover a scrap of sea, and a
    // quay is where that happens. Standing on the water is the one failure
    // this whole surface exists to avoid, so the sea wins.
    if (elevation <= 0) return 0;
    return PLANET_RADIUS + elevation + best;
  }

  /**
   * Every floor raised or dropped, as the town's up and how far its floor
   * reaches, for `floorChanges`: the sward re-sows what it grew round a town
   * whose lawns have just arrived or gone. A ring, because nothing reads further
   * back than the frame before.
   */
  const FLOOR_CHANGES = 256;
  const changedUp = new Float64Array(FLOOR_CHANGES * 3);
  const changedReach = new Float64Array(FLOOR_CHANGES);
  let floorVersion = 0;
  function noteFloor(slot: Slot): void {
    const floor = slot.floor;
    if (floor === null) return;
    const at = floorVersion % FLOOR_CHANGES;
    changedUp[at * 3] = floor.up.x;
    changedUp[at * 3 + 1] = floor.up.y;
    changedUp[at * 3 + 2] = floor.up.z;
    changedReach[at] = Math.acos(Math.min(1, floor.cosBound)) * PLANET_RADIUS;
    floorVersion++;
  }

  const swardDir = new THREE.Vector3();
  /**
   * Where the grass may stand at `direction` (a unit vector), given the radius
   * of the drawn land there: as a radius from the planet's centre, or null.
   *
   * A standing town answers for its own ground. A lawn — a yard `Ground.lawn`
   * marks, clear of the streets through its cell and of every wall by `margin`
   * — gives the terrace's own top; the rest of its paving gives nothing,
   * unless the drawn land stands over it and hides it; its edge slope, which
   * is painted the land's colour, gives whichever of the slope and the land is
   * on top. Ground no standing floor covers is the land's, and that includes a
   * town that is shown but not standing yet: `floorChanges` is how the sward
   * learns it has arrived.
   */
  function swardAt(direction: THREE.Vector3, landRadius: number, margin: number): number | null {
    swardDir.copy(direction);
    for (const slot of floors) {
      const floor = slot.floor;
      if (floor === null) continue;
      if (swardDir.dot(floor.up) < floor.cosBound) continue;
      const { grid, band, field } = floor;
      const x = swardDir.dot(floor.across) * PLANET_RADIUS;
      const z = swardDir.dot(floor.north) * PLANET_RADIUS;
      const col = cellIndex(grid, x);
      const row = cellIndex(grid, z);
      const key = cellKey(col, row);
      const level = field.terraces.get(key);
      if (level === undefined) {
        if (field.aprons?.has(key) !== true) continue;
        // The edge slope is the land's ground laid over the land: whichever of
        // the two is on top.
        return Math.max(landRadius, PLANET_RADIUS + floorLiftAt(field, x, z, 0));
      }
      // A terrace the drawn land stands over is hidden under it, and what shows is the land.
      if (PLANET_RADIUS + level + GROUND_LIFT < landRadius - margin) return landRadius;
      if (floor.lawn === null || !inGrid(grid, col, row) || floor.lawn[col * grid.cells + row] !== 1) return null;
      const u = x - (cellCentre(grid, col) - grid.pitch * 0.5);
      const v = z - (cellCentre(grid, row) - grid.pitch * 0.5);
      // The streets through the cell, as `buildGround` cuts them: a band only
      // where the cell across it is town too.
      const street = (index: number, t: number, across: (step: number) => boolean): boolean =>
        grid.avenue[index] === 1 ||
        (grid.low[index] === 1 && t < band + margin && across(-1)) ||
        (grid.high[index] === 1 && t > grid.pitch - band - margin && across(1));
      if (street(col, u, (step) => field.terraces.has(cellKey(col + step, row))) ||
        street(row, v, (step) => field.terraces.has(cellKey(col, row + step)))) return null;
      if (floor.solids !== null && solidAt(floor.solids, x, z, margin) !== null) return null;
      return PLANET_RADIUS + level + GROUND_LIFT;
    }
    return landRadius;
  }

  const wallDir = new THREE.Vector3();
  const wallPush = { x: 0, z: 0 };
  const wallFree = { x: 0, z: 0 };

  /**
   * The walls, for `player.ts`: the displacement along the ground that takes a
   * body of `radius` out of every building it overlaps.
   *
   * Gated exactly as `madeHeightAt` is — only a standing town, and one dot
   * product each — because it runs once per sub-step of every frame on foot.
   * The push is the whole displacement `pushOut` returns, not a normal: the
   * player reads the wall's direction off it and slides along it.
   */
  function collide(point: THREE.Vector3, radius: number, push: THREE.Vector3, over = -Infinity): boolean {
    push.set(0, 0, 0);
    wallDir.copy(point).normalize();
    let hit = false;
    for (const slot of floors) {
      const floor = slot.floor;
      if (floor === null || floor.solids === null) continue;
      if (wallDir.dot(floor.up) < floor.cosBound) continue;
      const x = wallDir.dot(floor.across) * PLANET_RADIUS;
      const z = wallDir.dot(floor.north) * PLANET_RADIUS;
      if (!pushOut(floor.solids, x, z, radius, wallPush, over)) continue;
      push.addScaledVector(floor.across, wallPush.x).addScaledVector(floor.north, wallPush.z);
      hit = true;
    }
    return hit;
  }

  /** Whether a point is inside a building's walls and under its roof. For the camera. */
  function blocksSight(point: THREE.Vector3): boolean {
    wallDir.copy(point).normalize();
    const height = point.length();
    for (const slot of floors) {
      const floor = slot.floor;
      if (floor === null || floor.solids === null) continue;
      if (wallDir.dot(floor.up) < floor.cosBound) continue;
      const x = wallDir.dot(floor.across) * PLANET_RADIUS;
      const z = wallDir.dot(floor.north) * PLANET_RADIUS;
      if (enclosed(floor.solids, x, z, height)) return true;
    }
    return false;
  }

  /** The nearest point clear of every wall, at the same radius; false if `point` already is. */
  function freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean {
    wallDir.copy(point).normalize();
    for (const slot of floors) {
      const floor = slot.floor;
      if (floor === null || floor.solids === null) continue;
      if (wallDir.dot(floor.up) < floor.cosBound) continue;
      const x = wallDir.dot(floor.across) * PLANET_RADIUS;
      const z = wallDir.dot(floor.north) * PLANET_RADIUS;
      if (!freeSpot(floor.solids, x, z, radius, wallFree)) continue;
      out
        .copy(floor.up)
        .addScaledVector(floor.across, wallFree.x / PLANET_RADIUS)
        .addScaledVector(floor.north, wallFree.z / PLANET_RADIUS)
        .normalize()
        .multiplyScalar(point.length());
      return true;
    }
    return false;
  }


  /** Indices of what should be standing, nearest first. Rebuilt on movement. */
  let wanted: number[] = [];
  let queue: number[] = [];
  const scannedAt = new THREE.Vector3(Infinity, Infinity, Infinity);
  const scannedAxis = new THREE.Vector3(0, 0, 1);
  let scannedRange = -1;
  /** Turning the knob forces a rescan; nothing else can see that it moved. */
  let scannedDetail = -1;
  /** And the other knob: which towns exist at all. See `PROMINENCE_RADIUS`. */
  let scannedProminence = -1;

  const cone = createViewCone(keepAllWithin);
  const anchor = new THREE.Vector3();

  function scan(viewer: THREE.Vector3, range: number): void {
    const keep = range * 1.25;
    const pixelFloor = minPixels();
    const budget = triangleBudget();
    const residentCap = maxResident();
    const candidates: { index: number; distance: number }[] = [];
    for (let i = 0; i < slots.length; i++) {
      const dx = anchors[i * 3]! - viewer.x;
      const dy = anchors[i * 3 + 1]! - viewer.y;
      const dz = anchors[i * 3 + 2]! - viewer.z;
      const squared = dx * dx + dy * dy + dz * dz;
      if (squared > keep * keep) continue;
      const distance = Math.sqrt(squared);
      const slot = slots[i]!;
      if (slot.failed) continue;
      // Two thirds of the slots are not towns at all — the gazetteer keeps them
      // so `roads.bin`'s indices hold, and `isShown` says which are built. After
      // the distance test, so the pass over 29,545 anchors stays a pass.
      if (!isShown(slot.place)) continue;
      // The pixel test, which is the whole level-of-detail scheme.
      if (PIXELS_PER_RADIAN * (2 * slot.radius) < pixelFloor * Math.max(1, distance)) continue;
      // And the screen test, which is the whole of the range. A town already
      // standing is judged by the wider cone, so turning slowly past the edge of
      // the frame does not dispose a town and rebuild it on the next scan; one
      // that is not standing has to be inside the admitting cone, which reaches
      // `ADMIT_MARGIN` past the frame so that it is built before it is seen.
      anchor.set(anchors[i * 3]!, anchors[i * 3 + 1]!, anchors[i * 3 + 2]!);
      // The anchor is the exact ground point, so the pad only has to cover what
      // the town puts *past* its own radius. None of the square does — it is
      // inscribed in it — but a `block` tower is 34 tall and the apron runs a
      // cell past the kerb.
      const bound = slot.radius + 40;
      const admitted = slot.mesh !== null
        ? cone.keeps(anchor, bound)
        : cone.admits(anchor, bound);
      if (!admitted) continue;
      candidates.push({ index: i, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);

    // **Who is inhabited is a rank, not a range**, and it is applied here
    // because here is where the sort already exists. Two thresholds rather than
    // one: a town sitting exactly on a single line would be dropped and rebuilt
    // on every scan, and a settlement build is milliseconds.
    for (let rank = 0; rank < candidates.length; rank++) {
      const slot = slots[candidates[rank]!.index]!;
      const want = slot.peopled ? rank < UNPEOPLE_RANK : rank < PEOPLED_RANK;
      if (want !== slot.peopled) {
        slot.peopled = want;
        // The parked cars and the kit's buildings are baked into the merged
        // buffer, so the only way to change them is to build the town again —
        // queued, and drawn as it was until the new one stands. See `rebuild`.
        slot.stale = needsRebuild(slot);
      }
    }

    wanted = [];
    let triangles = 0;
    let nearExtra = 0;
    for (const candidate of candidates) {
      if (wanted.length >= residentCap) break;
      const slot = slots[candidate.index]!;
      // A settlement already standing knows what it costs; one that is not is
      // estimated from its plots, so the budget cannot be blown by the first
      // metropolis to arrive.
      let cost = slot.triangles > 0 ? slot.triangles : estimateTriangles(slot);
      // What a near town costs over a far one comes out of `NEAR_ALLOWANCE`
      // first; see there.
      if (slot.peopled && slot.triangles > 0) {
        const extra = Math.max(0, Math.min(cost - estimateTriangles(slot), NEAR_ALLOWANCE - nearExtra));
        nearExtra += extra;
        cost -= extra;
      }
      if (triangles + cost > budget && wanted.length > 0) continue;
      triangles += cost;
      wanted.push(candidate.index);
    }

    const set = new Set(wanted);
    for (let i = 0; i < slots.length; i++) {
      if (!set.has(i)) drop(slots[i]!);
    }
    queue = wanted.filter((index) => slots[index]!.mesh === null || slots[index]!.stale);
  }

  /**
   * What a settlement will cost before it is built, in triangles.
   *
   * A count of plots times the mean cost of what stands on one. Only ever used
   * to decide whether to start, so it wants to be cheap and roughly right, not
   * exact — and the real number replaces it the moment the town exists.
   */
  function estimateTriangles(slot: Slot): number {
    const grid = townGrid(slot.radius);
    const cells = grid.cells * grid.cells;
    // 0.72 is the mean fill and 150 the measured mean triangles per part over an
    // 814-place sample (9 parts and 1,344 triangles for the median settlement).
    // The 14 is the ground: a paved cell is between 2 and 18 triangles
    // depending on how many streets cut it, plus a course of apron round the
    // outside at 2 each. Rough is all this has to be — it decides whether to
    // start, and the real number replaces it the moment the town exists.
    return Math.round(cells * (0.72 * 150 + 14));
  }

  const folkDirection = new THREE.Vector3();
  return {
    group,
    stats,
    anchors,
    missing,
    broken,

    folkNear(viewer, radius, out) {
      const cosReach = Math.cos((radius + 160) / PLANET_RADIUS);
      const direction = folkDirection.copy(viewer).normalize();
      // Only what is standing and has people, which is a handful: this runs
      // every frame on foot, and the other 29,500 slots have nobody in them.
      for (const slot of inhabited) {
        // A town built near and far again keeps its buffer — see
        // `needsRebuild` — and stops publishing its people.
        if (!slot.peopled) continue;
        if (slot.direction.dot(direction) < cosReach) continue;
        for (const person of slot.folk) {
          const distance = person.position.distanceTo(viewer);
          if (distance > radius) continue;
          person.distance = distance;
          out.push(person);
        }
      }
    },

    lampsNear(viewer, radius, out) {
      const max = Math.floor(out.length / 4);
      if (max === 0) return 0;
      const cosReach = Math.cos((radius + 160) / PLANET_RADIUS);
      const direction = folkDirection.copy(viewer).normalize();
      const r2 = radius * radius;
      let count = 0;
      for (const slot of lit) {
        const heads = slot.lampHeads;
        if (heads === null || slot.direction.dot(direction) < cosReach) continue;
        for (let i = 0; i + 2 < heads.length; i += 3) {
          const dx = heads[i]! - viewer.x;
          const dy = heads[i + 1]! - viewer.y;
          const dz = heads[i + 2]! - viewer.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          // An insertion into a list kept sorted by distance and capped: the
          // nearest `max` of a few dozen, with no allocation.
          let at = count < max ? count : max - 1;
          if (count === max && d2 >= out[at * 4 + 3]!) continue;
          while (at > 0 && out[(at - 1) * 4 + 3]! > d2) {
            out.copyWithin(at * 4, (at - 1) * 4, at * 4);
            at--;
          }
          out[at * 4] = heads[i]!;
          out[at * 4 + 1] = heads[i + 1]!;
          out[at * 4 + 2] = heads[i + 2]!;
          out[at * 4 + 3] = d2;
          if (count < max) count++;
        }
      }
      for (let k = 0; k < count; k++) out[k * 4 + 3] = Math.sqrt(out[k * 4 + 3]!);
      return count;
    },

    parkedNear(viewer, radius, out) {
      const cosReach = Math.cos((radius + 160) / PLANET_RADIUS);
      const direction = folkDirection.copy(viewer).normalize();
      for (const slot of parkedTowns) {
        if (slot.direction.dot(direction) < cosReach) continue;
        for (const bay of slot.parked) {
          if (!bay.hidden && bay.position.distanceTo(viewer) <= radius) out.push(bay);
        }
      }
    },

    hideParked(id) {
      const parts = id.split(':');
      const slot = slots[Number(parts[1])];
      if (slot === undefined || slot.mesh === null) return;
      const bay = slot.parked.find((entry) => entry.id === id);
      if (bay === undefined || bay.hidden) return;
      bay.hidden = true;
      // Every vertex onto the first: the triangles are still in the buffer and
      // draw nothing, and so do their ink hulls, which are built from the same
      // positions. Cheaper than building the town again, and it is one car.
      const position = slot.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = position.array as Float32Array;
      const first = bay.start * 3;
      for (let v = bay.start + 1; v < bay.start + bay.count; v++) {
        array[v * 3] = array[first]!;
        array[v * 3 + 1] = array[first + 1]!;
        array[v * 3 + 2] = array[first + 2]!;
      }
      position.addUpdateRange(first, bay.count * 3);
      position.needsUpdate = true;
      const floor = slot.floor;
      if (floor !== null && floor.solids !== null) {
        const rest = floor.solids.solids.filter((solid) => solid !== bay.solid);
        floor.solids = rest.length > 0 ? solidField(rest) : null;
      }
    },

    setParkedTaken(test) {
      parkedTaken = test;
    },

    update(viewer, altitude, camera) {
      fader.update();
      const range = rangeFor(altitude);
      stats.range = Math.round(range);
      stats.reach = Math.round(reachFor(altitude));
      cone.aim(camera);
      if (
        viewer.distanceToSquared(scannedAt) > RESCAN_MOVE * RESCAN_MOVE ||
        Math.abs(range - scannedRange) > scannedRange * 0.1 ||
        cone.turnFrom(scannedAxis) > RESCAN_TURN ||
        scannedDetail !== detailVersion() ||
        scannedProminence !== prominenceVersion()
      ) {
        scan(viewer, range);
        scannedAt.copy(viewer);
        scannedAxis.copy(cone.axis);
        scannedRange = range;
        scannedDetail = detailVersion();
        scannedProminence = prominenceVersion();
      }

      if (queue.length > 0) {
        const began = performance.now();
        const allowance = detailBuild(BUILD_BUDGET_MS);
        let built = 0;
        while (queue.length > 0) {
          const slot = slots[queue[0]!]!;
          // Near first, and out of the whole frame; far only out of its share
          // of it (`view.ts`). The queue is nearest first, so the first far
          // town that does not fit is the last thing this frame would build.
          const near = slot.anchor.distanceTo(viewer) - slot.radius < NEAR_BUILD;
          if (!mayBuild(began, allowance, near)) break;
          queue.shift();
          if (slot.mesh !== null && !slot.stale) continue;
          rebuild(slot);
          built++;
        }
        if (built > 0) {
          stats.lastBuildMs = Number((performance.now() - began).toFixed(2));
          stats.built += built;
        }
      }

      let resident = 0;
      let triangles = 0;
      let parts = 0;
      let bytes = 0;
      for (const index of wanted) {
        const slot = slots[index]!;
        if (slot.mesh === null) continue;
        resident++;
        triangles += slot.triangles;
        parts += slot.parts;
        bytes += slot.bytes;
      }
      stats.resident = resident;
      stats.pending = queue.length;
      stats.triangles = triangles;
      stats.parts = parts;
      stats.megabytes = Number((bytes / 1048576).toFixed(1));
    },

    madeHeightAt,
    swardAt,
    proxies: () => [proxyOf(material), proxyOf(fadeTwin(material))],
    floorChanges(since, into) {
      into.length = 0;
      if (floorVersion - since > FLOOR_CHANGES) {
        into.push(-1);
        return floorVersion;
      }
      for (let version = since; version < floorVersion; version++) {
        const at = version % FLOOR_CHANGES;
        into.push(changedUp[at * 3]!, changedUp[at * 3 + 1]!, changedUp[at * 3 + 2]!, changedReach[at]!);
      }
      return floorVersion;
    },

    collide: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => collide(point, radius, push),
    collideAloft: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => collide(point, radius, push, point.length()),
    blocksSight,
    freeSpotNear,

    /**
     * Merged against instanced, on a real settlement, in one call.
     *
     * The choice between them is the only architectural question this file had
     * to answer that `placement.ts` does not, so the measurement stays in the
     * source rather than in a commit message. The numbers it produced, and why
     * the answer is not the obvious one, are in this file's header.
     */
    compare(name = 'Paris') {
      const slot = slots.find((entry) => entry.place.name === name);
      if (slot === undefined) return { error: `no place called ${name}` };

      const wasResident = slot.mesh !== null;
      drop(slot, true);
      // A settlement that built nothing is marked failed so the streamer stops
      // asking; a measurement has to be able to ask again.
      slot.failed = false;
      const mergeBegan = performance.now();
      raise(slot);
      const mergeMs = performance.now() - mergeBegan;
      const merged = {
        drawCalls: slot.mesh === null ? 0 : 1,
        meshes: slot.mesh === null ? 0 : 1,
        triangles: slot.triangles,
        parts: slot.parts,
        planned: slot.planned,
        inTheSea: slot.drowned,
        tooSteep: slot.buried,
        megabytes: Number((slot.bytes / 1048576).toFixed(2)),
        buildMs: Number(mergeMs.toFixed(2)),
      };

      // The instanced version of the same plan: one `InstancedMesh` per
      // (part, variant, piece), where a piece is one mesh of the built variant
      // and therefore one colour.
      const instanceBegan = performance.now();
      const plan = planTown(slot, townGrid(slot.radius)).placed;
      const buckets = new Map<string, number>();
      let instancedTriangles = 0;
      let instancedBytes = 0;
      const seen = new Set<string>();
      for (const entry of plan) {
        const flat = variantOf(entry.partId, slot.style, entry.variant);
        if (flat === null) continue;
        for (let piece = 0; piece < flat.pieceVertices.length; piece++) {
          const key = `${entry.partId}:${entry.variant}:${piece}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
          const count = flat.pieceVertices[piece]!;
          instancedTriangles += count / 3;
          // One matrix per instance, and the geometry once per bucket.
          instancedBytes += 16 * 4;
          if (!seen.has(key)) {
            seen.add(key);
            instancedBytes += count * 3 * 4 * 2;
          }
        }
      }
      const instanceMs = performance.now() - instanceBegan;

      if (!wasResident) drop(slot, true);

      return {
        place: `${slot.place.name} (${slot.place.iso}), pop ${slot.place.pop.toLocaleString('en')}`,
        style: slot.style.id,
        radius: Number(slot.radius.toFixed(1)),
        merged,
        instanced: {
          drawCalls: buckets.size,
          meshes: buckets.size,
          triangles: Math.round(instancedTriangles),
          parts: plan.length,
          megabytes: Number((instancedBytes / 1048576).toFixed(2)),
          buildMs: Number(instanceMs.toFixed(2)),
        },
      };
    },

    survey(step = 29, near = false) {
      const parts: number[] = [];
      const buildings: number[] = [];
      const paved: number[] = [];
      const triangles: number[] = [];
      const empty: string[] = [];
      const noBuilding: string[] = [];
      let planned = 0;
      let drowned = 0;
      let buried = 0;
      /**
       * And what a foot finds on the floor it just built.
       *
       * **The one assertion `pnpm check` cannot make.** `settlements.ts` reaches
       * the kit through an `import.meta.glob` registry and does not load in
       * Node, so the headless check holds `floorLiftAt` to its contract and
       * measures the mesh against `GROUND_LIFT`; whether the *streamer's* floor
       * is where the query says it is can only be asked where the town is
       * standing. It is asked here, over every town this survey builds: a ring
       * of samples across the built core, and for each one the standing surface
       * against the relief and against the paving.
       */
      const stood = { sampled: 0, onFloor: 0, onFlight: 0, onSlope: 0, overTheEdge: 0, worstBelow: 0, worstAbove: 0 };
      /**
       * And what the terracing did, which is the other thing only a standing
       * town can be asked.
       *
       * `MAX_CUT` is a claim about how many towns come out as one building on a
       * mountainside and how tall a wall the rest of them show; the first half
       * of that is `builtNothing` and this is the second. `steps` is how many
       * levels a town was cut into — 1 is the flat plinth the world mostly is —
       * and `wall` is the tallest face any of them draws, which is what the eye
       * actually judges.
       */
      const cut = { flat: 0, stepped: 0, mostSteps: 0, mostStepsAt: '', wall: 0, wallAt: '' };
      /**
       * And what ends the floor and what climbs it: paved edges on the town's
       * outside that end in a slope against those that keep a quay's face,
       * the flights of steps and their risers, the street crossings of a riser
       * that got no flight because another already filled the corner, and the
       * steepest edge slope anywhere — which is where the land outside falls
       * away furthest and the slope, still one course wide, becomes an
       * embankment. All of it is `FloorStats`, counted where it was built.
       */
      const edges = { slopes: 0, quays: 0, flights: 0, steps: 0, crowded: 0, steepest: 0, steepestAt: '' };
      const standDir = new THREE.Vector3();
      const began = performance.now();
      for (let i = 0; i < slots.length; i += step) {
        const slot = slots[i]!;
        // Only what the world builds: two thirds of the slots are places
        // `isShown` hides, all of them small, and sampling them put the median
        // town at one building when no player ever sees one of them.
        if (!isShown(slot.place)) continue;
        const wasResident = slot.mesh !== null;
        const wasFailed = slot.failed;
        const wasPeopled = slot.peopled;
        if (!wasResident) {
          slot.failed = false;
          // `near` raises each town as one of the nearest, with the kit's
          // buildings where its region has them (`RegionStyle.assets`).
          if (near) slot.peopled = true;
          raise(slot);
        }
        parts.push(slot.parts);
        buildings.push(slot.buildings);
        paved.push(slot.paved);
        triangles.push(slot.triangles);
        planned += slot.planned;
        drowned += slot.drowned;
        buried += slot.buried;
        if (slot.parts === 0) empty.push(slot.place.name);
        else if (slot.buildings === 0) noBuilding.push(slot.place.name);
        const floor = slot.floor;
        if (floor !== null) {
          // How many levels this town was cut into; the tallest face it shows is
          // below.
          const steps = new Set(floor.field.terraces.values()).size;
          if (steps > 1) cut.stepped++;
          else cut.flat++;
          if (steps > cut.mostSteps) {
            cut.mostSteps = steps;
            cut.mostStepsAt = slot.place.name;
          }
          // The tallest face is `buildFloor`'s own count, taken over every face
          // the floor still draws vertical — risers, quays, the face from a
          // terrace down to a slope laid from a lower one, and the wedge where
          // two slopes from different terraces meet — rather than a second
          // guess at them from here. The town's outside is a slope since
          // 2026-09-13, so what this used to measure there is `embankment` now.
          const built = floor.field.stats;
          if (built !== undefined) {
            if (built.wall > cut.wall) {
              cut.wall = built.wall;
              cut.wallAt = slot.place.name;
            }
            edges.slopes += built.slopes;
            edges.quays += built.quays;
            edges.flights += built.flights;
            edges.steps += built.steps;
            edges.crowded += built.crowded;
            if (built.embankment > edges.steepest) {
              edges.steepest = built.embankment;
              edges.steepestAt = slot.place.name;
            }
          }
          // A spiral over the built radius rather than a grid: 64 points that
          // land on paving, on a yard, on a kerb and outside the town, which is
          // the whole range the query has to be right about.
          for (let k = 0; k < 64; k++) {
            const angle = k * 2.399963;
            const reach = slot.radius * Math.sqrt((k + 0.5) / 64);
            standDir
              .copy(floor.up)
              .addScaledVector(floor.across, (Math.cos(angle) * reach) / PLANET_RADIUS)
              .addScaledVector(floor.north, (Math.sin(angle) * reach) / PLANET_RADIUS)
              .normalize();
            const elevation = world.elevationAt(standDir);
            if (elevation <= 0) continue;
            const relief = PLANET_RADIUS + elevation;
            const made = madeHeightAt(standDir);
            const stand = Math.max(relief, made);
            stood.sampled++;
            /**
             * **What the foot is compared against is the terrace, not the
             * relief, and that is the whole of what terracing changed here.**
             * The floor used to be `GROUND_LIFT` over the ground at the query
             * point, so the ground was the yardstick; it is `GROUND_LIFT` over
             * the *cell's* terrace now, and the ground under a cell varies by up
             * to `MAX_CUT`. Measuring against the relief reported a foot
             * standing twelve units over its own pavement, which was the
             * yardstick being wrong rather than the foot.
             */
            const cell = floor.field.terraces.get(cellKey(
              Math.round(standDir.dot(floor.across) * PLANET_RADIUS / floor.field.pitch + (floor.field.shift ?? 0)),
              Math.round(standDir.dot(floor.north) * PLANET_RADIUS / floor.field.pitch + (floor.field.shift ?? 0)),
            ));
            // The paving, or the tread of the flight standing on it here: a
            // foot on a flight is on the floor, a step above or below the
            // terrace it stands in.
            const planeX = standDir.dot(floor.across) * PLANET_RADIUS;
            const planeZ = standDir.dot(floor.north) * PLANET_RADIUS;
            const flight = cell === undefined ? null : flightAt(floor.field, planeX, planeZ);
            const paving = cell === undefined ? 0
              : PLANET_RADIUS + (flight === null ? cell + GROUND_LIFT : flightHeight(flight, flightDepth(flight, planeX, planeZ)));
            const lift = made > 0 ? made - relief : 0;
            // Four answers and they have to be counted apart: on the paving, on
            // a flight, on the edge slope — which is drawn now, so a foot there
            // is on what it sees and under the paving by exactly the slope — and
            // off the town.
            const onFloor = paving > 0 && Math.abs(stand - paving) < 1e-6;
            if (onFloor && flight !== null) stood.onFlight++;
            else if (onFloor) stood.onFloor++;
            else if (lift > 0) stood.onSlope++;
            /**
             * The two ways this can be wrong, and the one way it can look wrong
             * and be right.
             *
             * **Under the paving** is the bug the whole surface exists to
             * delete: a body inside its own high street. **Over it** used to be
             * a man on stilts and is now two different things — a foot on a
             * *higher* terrace than the cell it is over, which is still the bug,
             * and a foot on the **hill above the platform**, which is correct.
             * A town cut into a slope has ground uphill of it that stands over
             * its own paving; the player walks on that ground and steps down
             * onto the terrace, and `HEIGHT_SMOOTHING` lands him. So the stilts
             * test is only asked where the platform is what he is standing on.
             */
            if (onFloor && paving - stand > stood.worstBelow) {
              stood.worstBelow = paving - stand;
            }
            if (paving > 0 && made > relief && stand - paving > stood.worstAbove) {
              stood.worstAbove = stand - paving;
            }
            if (paving > 0 && relief > paving) stood.overTheEdge++;
          }
        }
        if (!wasResident) {
          drop(slot, true);
          slot.failed = wasFailed;
          slot.peopled = wasPeopled;
        }
      }
      const at = (list: number[], q: number): number => {
        const sorted = [...list].sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
      };
      const spread = (list: number[]) => ({
        p10: at(list, 0.1),
        p25: at(list, 0.25),
        median: at(list, 0.5),
        p75: at(list, 0.75),
        p90: at(list, 0.9),
        mean: Number((list.reduce((a, b) => a + b, 0) / Math.max(1, list.length)).toFixed(1)),
      });
      return {
        sampled: parts.length,
        parts: spread(parts),
        buildings: spread(buildings),
        // Cells of floor, and how many of them each standing building is paying
        // for. Under about three the town is ground between houses; over about
        // six it is a car park with houses parked on it.
        paved: spread(paved),
        pavedPerBuilding: Number(
          (paved.reduce((a, b) => a + b, 0) / Math.max(1, buildings.reduce((a, b) => a + b, 0))).toFixed(2),
        ),
        triangles: spread(triangles),
        plannedPlots: planned,
        lostToTheSea: drowned,
        lostToTheSlope: buried,
        // What the terracing cost and what it shows; see `cut`.
        townsOnOneLevel: cut.flat,
        townsTerraced: cut.stepped,
        mostTerraces: `${cut.mostSteps} at ${cut.mostStepsAt}`,
        tallestWall: `${cut.wall.toFixed(1)} at ${cut.wallAt}`,
        // What ends the floor and what climbs it; see `edges`.
        edgesSloped: edges.slopes,
        edgesQuay: edges.quays,
        flights: edges.flights,
        flightSteps: edges.steps,
        flightsCrowdedOut: edges.crowded,
        steepestEdge: `${edges.steepest.toFixed(2)} at ${edges.steepestAt}`,
        builtNothing: empty.length,
        builtNoBuilding: noBuilding.length,
        emptyNames: empty.slice(0, 40),
        noBuildingNames: noBuilding.slice(0, 40),
        // And where a foot lands on what was built. See `stood`.
        standing: stood,
        surveyMs: Math.round(performance.now() - began),
      };
    },
  };
}
