import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, groundColorAt, groundRadius } from './globe.ts';
import { reliefAt } from './terrain.ts';
import { createToonRamp } from './theme.ts';
import { bedtimeByte, bedtimeNever, lightWindows, poolByte } from './lights.ts';
import {
  APRON_SINK,
  GROUND_LIFT,
  KERB_BLEND,
  KERB_DROP,
  cellKey,
  dirt,
  floorColor,
  floorLiftAt,
  groundStyleFor,
  trodden,
} from './scenery/ground.ts';
import { RIBBON_LIFT, roadPoint, roadPole } from './roads.ts';
import type { Road } from './roads.ts';
import type { FloorField, GroundStyle } from './scenery/ground.ts';
import { TOWN_BANK, inRiverCorridor, riverCorridorsNear, riverIndexFor, widestRiverClearance } from './rivers.ts';
import type { RiverCorridor, RiverLine } from './rivers.ts';
import type { MonumentContext } from './monuments/contract.ts';
import type { Placement } from './placement.ts';
import { BIGGEST_SETTLEMENT, isShown, prominenceVersion, radiusFor } from './places.ts';
import { biomeAt, biomeSample } from './biome.ts';
import { VEHICLES, createTrafficContext, placedScale, placedSize, trafficFor, variantRng as vehicleRng } from './traffic/index.ts';
import type { TrafficContext, TrafficStyle, Vehicle } from './traffic/index.ts';
import { buildPerson, lookFor } from './scenery/index.ts';
import type { Place } from './places.ts';
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
  PARTS,
  VARIANTS,
  createSceneryContext,
  measure,
  part,
  plots,
  regionFor,
  rngFrom,
  validatePart,
  variantRng,
} from './scenery/index.ts';
import type { PartKind, Placed, Plot, RegionStyle, SceneryContext, Weighted } from './scenery/index.ts';

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

const DEG = Math.PI / 180;

/**
 * How big a settlement is, and where that number lives now.
 *
 * `radiusFor` is `places.ts`'s, not this file's, and it must stay that way: the
 * HUD names the place you are standing in from the same radius this file builds
 * the buildings inside, so a second copy would put the chip's "Lyon" over ground
 * with no Lyon on it. The law and the measurements behind it are documented
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
 * The plot lattice, and it is **one definition now** — it was three.
 *
 * `planFor`, `buildGround` and `estimateTriangles` each carried
 * `style.spacing * 13` as a literal, which is the shape of bug this project
 * writes down: the houses, the paving they stand on and the cost estimate that
 * admits the town all have to agree about where a cell is, and three copies
 * agree only until somebody edits one.
 *
 * **It is 11 and it was 13, and the plot sizes did not move.** A settlement's
 * radius is `radiusFor`'s and cannot grow — see the note below — so how many
 * plots a town holds is decided entirely here, as `pi r^2 / pitch^2`. The
 * median town is **15.2 units of radius now** — it was 25.4 when this was
 * written, before `radiusFor` grew an exponent — which at the old pitch was
 * nine cells for the whole place and would be three. The reason the pitch could not simply be lowered is
 * recorded in CLAUDE.md and was real: `plots` sized a plot at
 * `pitch * [0.5, 0.88]`, so a finer lattice handed every house a plot too
 * small for it and the town came out *emptier*. That coupling is now an
 * argument (`PlotOptions.plot`), so this pair moves together and the absolute
 * plot sizes are identical to the unit:
 *
 * ```
 *   13 * [0.50, 0.88]  =  [6.50, 11.44] * spacing
 *   11 * [0.59, 1.04]  =  [6.49, 11.44] * spacing
 * ```
 *
 * What changes is only the lattice: **1.40 times the cells inside the same
 * disc**, at the same plot sizes, so exactly the same houses fit and there are
 * half again as many places for one to stand.
 *
 * The two things downstream that read the pitch and are worth checking if it
 * moves again: the street width is capped at `0.6 * pitch` (so east-asia's
 * 9.75-unit street becomes 6.6, which still parks the kit's 4.44-wide
 * hatchback), and `GroundStyle.lanes` counts *boundaries*, so a tighter pitch
 * puts the streets closer together in world units as well as in cells.
 */
const PLOT_PITCH = 11;
const PLOT_SIZE: readonly [number, number] = [0.59, 1.04];

/**
 * And a ceiling on it, because **`style.spacing` was sizing a plot against a
 * region and the thing standing in it is a part.**
 *
 * `spacing` runs 1.0 to 1.9 and it is the kit's one statement about how loosely
 * a place is built — a Japanese street against an American suburb — so it
 * multiplies the lattice. What nothing checked is whether the region has a part
 * big enough to use the plot it thereby gets. Asking each region's own
 * `buildings` list for its largest footprint, against the plot the lattice hands
 * it, and the share of plots that largest building actually fits:
 *
 * ```
 *                    spacing  pitch  largest  2f/pitch  fits
 *   polar               1.90   20.9      7.4      0.71  100%
 *   oceania             1.70   18.7      8.4      0.90  100%
 *   north-america       1.60   17.6      8.4      0.95  100%
 *   nordic              1.50   16.5      8.4      1.02  100%
 *   sub-saharan         1.45   15.9      7.1      0.89  100%
 *   east-europe         1.35   14.9      8.4      1.13   99%
 *   atlantic-europe     1.15   12.6      8.4      1.33   76%
 *   east-asia           1.00   11.0      8.8      1.60   44%
 * ```
 *
 * **A fit rate of 100% is not a kit that fits its lattice, it is a lattice with
 * nothing in the kit large enough to fill it.** `2f/pitch` is the number to
 * read: it is how much of one lattice step the biggest building's own footprint
 * spans, and under 1 it says the largest thing this region can build does not
 * reach its neighbour — the rest is ground, in a town whose radius cannot grow
 * (see the headroom measurement in `docs/traps.md`; the bake thinned to exactly
 * `radiusFor(a) + radiusFor(b)` and the tightest pair on the planet has a factor
 * of **1.000** left).
 *
 * So the plot is capped at `LOOSEST` times the largest building that can stand
 * on it, which puts `2f/pitch` at 1.25 wherever it binds. 1.25 is not a
 * judgement either: **Atlantic Europe is the region this world has been looked
 * at in most, and it sits at 1.33** — the ceiling only pulls the loose half of
 * the table towards the half that already reads. It is a ceiling and not a law,
 * so every region at or below it keeps the lattice it had and `spacing` still
 * orders the ones above it.
 *
 * The two things downstream that read the pitch and are worth checking if it
 * moves again: the street width is capped at `0.6 * pitch` (so east-asia's
 * 9.75-unit street becomes 6.6, which still parks the kit's 4.44-wide
 * hatchback), and `GroundStyle.lanes` counts *boundaries*, so a tighter pitch
 * puts the streets closer together in world units as well as in cells.
 */
const LOOSEST = 1.6;
const PITCH_OF = new Map<string, number>();
const pitchFor = (style: RegionStyle): number => {
  let pitch = PITCH_OF.get(style.id);
  if (pitch === undefined) {
    let largest = 0;
    for (const entry of style.buildings) largest = Math.max(largest, footprintOf(entry.item));
    // A region with no buildings at all keeps the lattice `spacing` asked for;
    // there is nothing to size a ceiling against.
    pitch = largest > 0
      ? Math.min(style.spacing * PLOT_PITCH, LOOSEST * largest)
      : style.spacing * PLOT_PITCH;
    PITCH_OF.set(style.id, pitch);
  }
  return pitch;
};

/**
 * How much of a settlement's radius the one building that says where you are
 * may take up, and how much of it that building may then clear around itself.
 *
 * A church, a mosque or a pagoda is the strongest regional signal the kit has
 * and it is also the largest thing it builds — `steeple-church` declares a 15.5
 * footprint against a dwelling's 7.4. Put one in every hamlet and half the
 * settlements on the planet are a cathedral with two houses behind it, which
 * reads as a mistake rather than as a village.
 *
 * **This was a population floor of 2,500 and it had stopped meaning anything**;
 * see the note at the call site for the count. It is the town's own size now,
 * which is the number the sentence above was always really about.
 */
const CIVIC_ROOM = 0.62;
const CIVIC_CLEARS = 0.42;

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
 * `OutlineEffect` draws the scene twice, so this is 640,000 triangles a frame on
 * top of the land mesh's 1.5 M. Chosen against that: it is a 42% increase in the
 * scene's cost for the thing the whole planet was built to hold.
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
 * How much of its own height a building may be buried by the ground behind it.
 *
 * `placement.ts` asks the ground once, at a monument's centre, and `terrain.ts`
 * answers the extent problem by flattening a pad under it. A settlement cannot
 * have that — 29,545 pads of a hundred units with a skirt four times as wide
 * would level about a third of the planet's land — so each building beds itself
 * to the *lowest* corner under its own footprint and takes whatever burial the
 * slope gives it, and the only question is when to refuse.
 *
 * **The first version of this asked the wrong question and deleted every
 * mountain city on the planet.** It capped the *gradient* at 0.6, which is a
 * sane-sounding 31 degrees — and the relief at La Paz runs at 1.19, at Quito
 * 1.12, at Innsbruck 0.97, measured over both 7 units and 30 and identical at
 * both, because up there the land is not rough, it is a smooth plane tilted at
 * 45 degrees. So La Paz built 0 of 35 plots, Quito 0 of 31, Bogota 0 of 63:
 * every capital in the Andes was an empty field.
 *
 * A gradient is the wrong measure because a slope does not hide a building —
 * *the ground uphill of it* does, and how much it hides depends on how tall the
 * building is. On a hillside a house bedded to its low corner is fully visible
 * from below and buried to the eaves from above, which is what a hill town looks
 * like. It only stops being a building when the ground behind it rises past its
 * own roof. So the test is the drop across the footprint against the height of
 * what stands there, and a tower survives ground a hut cannot.
 */
const MAX_BURIAL = 1.0;

// ---------------------------------------------------------------------------
// The ground a town stands on
// ---------------------------------------------------------------------------

/**
 * The floor's own vertical section — the lift, the kerb and the apron — is in
 * `scenery/ground.ts` with the rest of what a town's ground is, so that
 * `pnpm check` can measure the mesh against the number this file lays the
 * paving at rather than against a copy of it. See `GROUND_LIFT` there.
 */


/** How far a lattice corner may wander, as a fraction of the pitch. Softens the edge. */
const CORNER_JITTER = 0.16;

/**
 * A street is not a ribbon laid over the paving. It is a band of the paving's
 * own cells, coloured — and that is worth saying because the obvious design is
 * a ribbon and the ribbon is wrong three times over: it needs a second lift
 * above the floor to be seen at all, which is a second surface for the player
 * to sink into; it needs a *third* offset where two of them cross, or the
 * crossroads z-fights; and it has to be re-derived from the same lattice
 * anyway. Cutting the cell gives crisp edges, exact agreement with the ground
 * under it, and no offset at all, for about fourteen triangles a cell instead
 * of two. `GroundStyle.street` and `GroundStyle.lanes` are the width and the
 * spacing; both live in `scenery/ground.ts` because both are regional.
 *
 * How far a track out of town reaches past the built edge, in world units.
 *
 * Long enough to be leaving — 45 units against the median 148 between
 * neighbouring places is a third of the way to the next village, which reads as
 * going somewhere. Not longer: at 62 the two tracks out of a Norwegian hamlet
 * were the largest thing in the frame, a pair of pale scars across a hillside
 * that dwarfed the four houses they served.
 */
const TRACK_REACH = 45;
/** Track crown above the paving, so it reads as a carriageway crossing a square. */
const TRACK_RISE = 0.12;
/** How far a track's shoulders dig in once they are out of town. Same trick as the apron. */
const TRACK_SHOULDER = 3;

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

// ---------------------------------------------------------------------------
// The people standing in it, and the vehicles parked in it
// ---------------------------------------------------------------------------

/**
 * How many of the nearest settlements are inhabited, and how far one has to
 * fall before it is emptied again.
 *
 * **A person is 296 triangles, which is more than a `gabled-house`, and that is
 * the right way round** — a person is the object you stand next to. It is the
 * wrong way round for a town at the pixel floor: eight figures inside a
 * 32-unit blob eight pixels across are 2,368 triangles saying nothing. Against a
 * median town of about 1,900 triangles they would roughly double the settlement
 * budget for geometry that is only worth anything inside about a thousand units.
 *
 * So the crowd is not a level of detail on the *part*, it is a rank: the scan
 * already sorts by distance, and the nearest twelve get people while everything
 * behind them does not. Crossing the line drops the town and rebuilds it, which
 * is why there are two numbers and not one — at a single threshold a town
 * hovering on it rebuilds every scan.
 */
const PEOPLED_RANK = 12;
const UNPEOPLE_RANK = 20;

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
const TOWN_PARKED = (urbanity: number, density: number): number =>
  Math.round((0.6 + urbanity * 3.4) * Math.min(1.8, density * 2.6));

/**
 * How many crowd bodies a region-and-climate holds.
 *
 * `PEOPLE_VARIANTS` is 24 and that is right for a review sheet showing forty at
 * once; a town shows at most fourteen and there are twelve of them standing at
 * a time, so twelve bodies is a crowd nobody can find the repeat in. Each is
 * about 0.22 ms to build and 32 KB to hold, once per region per climate band
 * for the session.
 */
const CROWD_BODIES = 12;

/**
 * The climate bands a wardrobe is cached against.
 *
 * `lookFor` takes `biome.ts`'s own `warmth` and multiplies the region's clothing
 * weights by it — a coat in Patagonia and a bare arm in the Atacama out of one
 * Chilean row. Caching a body against a region alone would dress the whole of
 * Chile for the middle of it; caching against the exact warmth would never hit.
 * Three bands is the compromise and the boundaries are `DressStyle.warmth`'s own
 * range rather than a new idea.
 */
const WARMTH_BANDS = 3;

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
 * the plot pitch is `style.spacing * PLOT_PITCH`, 11.0 to 20.9 units across the
 * fourteen regions, and the carriageway it crosses is 6.0 to 15.0. A reach
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
  /** Kept unmerged so `compare()` can build the instanced version of the same town. */
  group: THREE.Group;
  /** One entry per source mesh: what an `InstancedMesh` of this variant would need. */
  pieces: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; material: THREE.Material }[];
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
): Omit<FlatVariant, 'group' | 'pieces' | 'height'> & {
  pieces: FlatVariant['pieces'];
} {
  group.updateMatrixWorld(true);
  const pieces: (FlatVariant['pieces'][number] & { lit: number })[] = [];
  let vertices = 0;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (position === undefined) return;
    vertices += geometry.index ? geometry.index.count : position.count;
    pieces.push({
      geometry,
      matrix: mesh.matrixWorld.clone(),
      material: Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material,
      // `ctx.lit` marks the mesh and not the material, so one glass colour can
      // be a window on one part and a doorway on the next.
      lit: typeof mesh.userData.atlasLit === 'number' ? (mesh.userData.atlasLit as number) : 0,
    });
  });

  const out = {
    position: new Float32Array(vertices * 3),
    normal: new Float32Array(vertices * 3),
    color: new Float32Array(vertices * 3),
    glow: new Uint8Array(vertices * 2),
    emits: false,
    litBed: 0,
    triangles: vertices / 3,
    pieces: pieces as FlatVariant['pieces'],
  };
  let brightest = 0;

  const tint = new THREE.Color();
  const point = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let cursor = 0;
  let vertex = 0;
  let window = 0;
  for (const piece of pieces) {
    const geometry = piece.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.index;
    const count = index ? index.count : position.count;
    normalMatrix.getNormalMatrix(piece.matrix);
    const hex = piece.material.userData.atlasToon as number | undefined;
    // A material that never went through `ctx.toon` cannot say what colour it
    // is. White rather than a throw: one part drawn wrong is better than a
    // continent with no towns on it.
    tint.set(hex ?? 0xffffff);
    let glow = 0;
    let bed = 0;
    if (piece.lit > 0) {
      // Keyed on the window's ordinal within the variant rather than on the
      // mesh's index in the traversal, so adding a chimney to a part does not
      // relight every one of its windows.
      const rng = rngFrom(key, 'window', window++);
      glow = !lottery
        ? Math.round(piece.lit * 255)
        : rng.chance(WINDOW_DARK)
          ? 0
          : Math.round(rng.range(WINDOW_LOW, WINDOW_HIGH) * piece.lit * 255);
      // A lamp is the council's and burns till dawn; a window is a household's
      // and goes out when whoever is behind it goes to bed. Same distinction
      // `lottery` already draws, and drawn from a forked seed so that changing
      // one does not move the other.
      const draw = rng.unit();
      bed = bedtimeByte(draw, !lottery || bedtimeNever(draw));
      if (glow > 0) {
        out.emits = true;
        if (glow > brightest) {
          brightest = glow;
          out.litBed = bed;
        }
      }
    }
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
      out.glow[vertex * 2] = glow;
      out.glow[vertex * 2 + 1] = bed;
      cursor += 3;
      vertex++;
    }
  }
  return out;
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

/**
 * Share of the plots with a house on them that get one more thing beside it.
 *
 * **The plot was the unit of everything and a plot held exactly one object,
 * which is why a town read as objects rather than as a place.** A house on a
 * plot with nothing else on it is a model on a baseboard; a house with a tree
 * at the corner of it is somebody's. It is also the cheapest density in the
 * kit by a wide margin — a `shrub` is 30 triangles and a `broadleaf-tree`
 * about 100, against a `terrace-block`'s 380 — so it buys the part count the
 * lattice cannot, and it buys the *right* part count: greenery between roofs is
 * what a European town looks like from a plane and a bare yard is what a
 * depot looks like.
 *
 * Not 1.0, because a row of houses each with its own identical tree is the
 * lattice failure `layout.ts` warns about, one level down.
 */
const GARDEN_CHANCE = 0.62;

/**
 * How large a thing may stand in a yard, as a fraction of the plot pitch.
 *
 * Half a pitch of *radius* sounds generous, because a footprint is a bounding
 * circle over a rectangle and a tree's is its canopy: a canopy over a roof is a
 * tree in a garden and a trunk inside a wall is not, and this only decides the
 * first. What it says it buys is that a broadleaf's 7 clears a European pitch
 * and not east-asia's, so a machiya yard gets a cypress and a Bavarian one gets
 * an oak with no table saying so.
 *
 * **It stopped buying that the moment the pitch moved, and nothing noticed
 * because the fallback is a shrub and a shrub in a yard looks like a yard.**
 * `PLOT_PITCH` went 13 to 11, which took Atlantic Europe's pitch from 14.95 to
 * 12.65 and half of it from 7.48 to **6.33 against the broadleaf's 7.0** — so
 * there has not been an oak in a European garden since. 0.56 puts it back at
 * 7.08 and leaves east-asia at 6.16, which is the split the note claims: the
 * number is derived from the tree and the two pitches either side of it, and it
 * has to be re-derived whenever either moves.
 */
const GARDEN_ROOM = 0.56;

/** How often the yard's one thing is a tree rather than a bush or a rock. */
const GARDEN_TREE = 0.45;

/**
 * One tree, bush or rock in the yard of a building, **at the corner of its
 * cell**.
 *
 * The corner is a clearance argument and it is `street-lamp`'s, one level
 * down: a lattice corner sits 0.707 of a pitch from each of the four plot
 * centres around it, which is further from every one of them than any point
 * inside the cell can be, so a thing placed there is as clear of the buildings
 * as the lattice allows. Anywhere *inside* the cell is a coin toss against a
 * jittered house.
 *
 * It is pushed as an ordinary `Placed` carrying a **synthesised plot** rather
 * than an offset on the entry, and that is deliberate: `raise` reads the
 * position, the yaw and the seed off `Placed.plot` and nothing else, and the
 * cell it carries is what decides the paving — so a yard tree that keeps its
 * building's `col`/`row` is paved with it, which is what a yard is. Adding a
 * displacement field to `Placed` instead would have put the offset in the one
 * place every consumer of the layout would have to learn about.
 */
function garden(
  into: Placed[],
  style: RegionStyle,
  plot: Plot,
  pitch: number,
  blocked: (x: number, z: number, extra: number) => boolean,
): void {
  const rng = rngFrom(plot.seed, 'garden');
  if (!rng.chance(GARDEN_CHANCE)) return;
  const room = pitch * GARDEN_ROOM;
  const trees = fitting(style.trees, room);
  const scatter = fitting(style.scatter, room);
  // A tree when one fits and the draw asks for it; otherwise whatever is small
  // enough. Both lists can be empty — the polar row has no trees at all.
  const mix = (trees !== null && rng.chance(GARDEN_TREE) ? trees : scatter) ?? trees;
  if (mix === null) return;
  // The corner of the cell furthest from where the plot's own jitter put the
  // house, so the yard is on the side the building left free.
  const cx = (plot.col + (plot.x >= plot.col * pitch ? -0.5 : 0.5)) * pitch;
  const cz = (plot.row + (plot.z >= plot.row * pitch ? -0.5 : 0.5)) * pitch;
  if (blocked(cx, cz, 0)) return;
  const id = rng.weighted(mix);
  into.push({
    partId: id,
    variant: rng.int(VARIANTS),
    scale: rng.spread(1, 0.16),
    plot: {
      ...plot,
      // A little off the corner itself, or four cells meeting would put four
      // bushes on one point.
      x: cx + rng.jitter() * pitch * 0.16,
      z: cz + rng.jitter() * pitch * 0.16,
      yaw: rng.unit() * Math.PI * 2,
      size: room,
    },
  });
}

interface Plan {
  placed: Placed[];
  /**
   * Radius the civic building cleared around itself, in world units, or 0 if
   * nothing civic stands. The plaza is laid to match it: a square smaller than
   * the church on it is not a square, it is a doorstep.
   */
  cleared: number;
  /**
   * How far the built core reaches. Returned rather than recomputed because the
   * paved floor *is* the built core — a second copy of `0.62 + 0.28 * urbanity`
   * in the ground builder is a town whose paving and whose houses disagree
   * about where the town ends the first time either is tuned.
   */
  core: number;
  /**
   * Positions the water refused: plots, yards and the centre, counted as
   * *refusals* rather than as plots because a plot that is blocked is asked
   * about once and a garden beside a plot is asked about again.
   *
   * Reported so `survey` can say how many towns a river actually costs
   * something and what the worst of them is. See `RiverCorridor` in `rivers.ts`.
   */
  riverCut: number;
}

/**
 * Where everything in one settlement stands.
 *
 * `layout.ts` exports both `plots` — the jittered grid, which is a primitive —
 * and `hamlet`, which its own comment calls a stand-in for "the real one [that]
 * belongs with the populated-places data". This is that one, and it differs from
 * the stand-in in exactly the three ways the data allows: the radius, the core
 * and the fill come from the population, the civic building is earned rather
 * than automatic, and monuments punch holes in it.
 */
function planFor(
  seed: string,
  style: RegionStyle,
  radius: number,
  pop: number,
  keepouts: readonly Keepout[],
  corridors: readonly RiverCorridor[],
): Plan {
  const urbanity = urbanityOf(pop);
  const pitch = pitchFor(style);
  /**
   * **A hamlet has no inside and no outside, so it gets neither a green belt
   * nor an approach, and every cell it has is built.** The size law's floor is
   * 12 units, which against a 12.65-unit European pitch is a disc of
   * `pi r^2 / pitch^2` = **2.8 cells for the whole village** — and a belt of
   * `radius * 0.16` takes 29% of that ground, the civic clearance another 17%,
   * and the fill a sixth of what is left. Measured over the 823-place survey
   * the day the size law changed: **a median of 3 buildings, p25 of one and
   * p10 of one**, which is a name on the map with a shed under it and is the
   * failure `layout.ts`'s own note calls *nothing is not a small version of
   * something*.
   *
   * A green belt and an approach are features of a place with an edge separate
   * from its middle. Under about six cells there is no such thing — the village
   * *is* its own centre — so both are dropped and the fill goes to 1. It buys
   * what the geometry allows and no more: 2.8 cells is two or three houses
   * standing against each other, which is what a hamlet is.
   */
  const cells = (Math.PI * radius * radius) / (pitch * pitch);
  const hamlet = cells < 6;
  const found = plots(seed, {
    radius,
    pitch,
    // A village is mostly yards and a city is mostly built. The plots that go
    // unfilled are the same plots on every load, because `plots` seeds each cell
    // from its own coordinates.
    //
    // **The floor is the kit's own default and it used to be below it.** 0.62
    // against nine cells is 5.6 plots for a whole village, and an unfilled cell
    // in a core this small is not a yard — the paving grows into it and it
    // reads as a gap in a row of four houses. `layout.ts` has always defaulted
    // to 0.72; there is no measurement that ever put a settlement under it.
    //
    // **And the floor went up again once the disc was counted rather than
    // guessed at.** The median settlement was 25.4 units of radius against a
    // 12.65-unit European pitch, which is **twelve cells for the whole town** —
    // and 0.74 of twelve is nine, of which the civic clearance takes two and
    // the green belt three. (The median is 15.2 since the size law changed, so
    // the argument is now made twice: this floor, and the `hamlet` rule below
    // which drops the belt and the clearance outright under six cells.) A quarter of a village left as yards is a *share*
    // argument that only makes sense on a lattice with tens of cells in it.
    // 0.83 is the same argument re-read at the size this world's towns
    // actually are: one cell in six, which is still a gap in every second row.
    fill: hamlet ? 1 : 0.83 + 0.12 * urbanity,
    alignment: 0.55,
    plot: PLOT_SIZE,
  });
  found.sort((a, b) => a.distance - b.distance);

  // **The smallest settlement on the planet is one building, and it took a
  // measurement to see that it was none.** A hamlet's radius is about eleven
  // units against a fifteen-unit pitch, so its disc holds one cell — which then
  // has to pass the fill chance and hand a house a plot wide enough for it.
  // Replayed over the whole dataset, 312 of 7,320 places came out with nothing
  // standing on them at all and 462 with no *building* — a name on the map and a
  // bush. So the centre plot is placed the way `hamlet` places its civic —
  // unconditionally, clearing its own footprint — and if the grid returned no
  // plot at all there is one here to place it on. Both counts are 0 now, and the
  // world gained 7,658 buildings for 2,576 more parts.
  if (found.length === 0) {
    found.push({
      x: 0,
      z: 0,
      yaw: rngFrom(seed, 'lone').unit() * Math.PI * 2,
      size: pitch * 0.7,
      distance: 0,
      seed: rngFrom(seed, 'lone', 'plot').unit() * 0x7fffffff,
      col: 0,
      row: 0,
    });
  }

  let riverCut = 0;
  const blocked = (x: number, z: number, extra: number): boolean => {
    for (const keepout of keepouts) {
      const dx = x - keepout.x;
      const dz = z - keepout.z;
      if (dx * dx + dz * dz < (keepout.radius + extra) ** 2) return true;
    }
    if (inRiverCorridor(corridors, x, z, extra)) {
      riverCut++;
      return true;
    }
    return false;
  };

  const placed: Placed[] = [];
  /**
   * Where the buildings stop and the greenery starts.
   *
   * **It was a fraction of the radius, which is right for a city and deletes a
   * village, and that one line is most of why the median settlement was one
   * building.** `radius * 0.62` sounds like a modest green belt and is not: a
   * disc's area goes as the square, so it hands 62% of the *radius* and 38% of
   * the *ground* to the houses — and the median town was 25 units of radius
   * against a 12-unit pitch, which is barely two plots from the middle to the
   * edge; it is 15 units now. Replayed over an 823-place sample, the median settlement came out
   * with **five parts of which one was a building**: the centre plot, and a
   * ring of shrubs where the village should have been.
   *
   * A green belt is a *width*, not a share. One plot deep is what a village
   * has and it is what a city has too — the fields start after the last house
   * either way — so it is capped at a sixth of the radius, which is the point
   * at which a settlement is too small to have an edge separate from itself.
   * The cap is what binds in a village and the pitch is what binds in a city,
   * and the arithmetic lands almost exactly where the old rule did at the top:
   * Tokyo's core was `0.90 * 97 = 87.3` and is 87.1 now, while the median
   * village's goes from 15.7 to 21.3 and takes its buildings with it.
   */
  const core = hamlet ? radius : radius - Math.min(pitch * 0.9, radius * 0.16);
  let cleared = 0;

  // The one building every settlement gets, placed without a fit test and
  // clearing room around itself, because it is the thing that is *approached*.
  // Which building it is, is the whole difference between a village and a town:
  // a spire, a minaret or a pagoda over the roofs says where you are, and a
  // place of three hundred people with a cathedral in it says nothing except
  // that a rule fired.
  const centre = found[0];
  if (centre !== undefined && !blocked(centre.x, centre.z, 0)) {
    const rng = rngFrom(centre.seed, 'civic');
    /**
     * **Whether a settlement gets its landmark is a question about the town,
     * not about its population, and the population test had quietly stopped
     * asking anything at all.** `CIVIC_POPULATION` was 2,500 and was written
     * against Natural Earth's places; GeoNames' `cities5000` has a population
     * floor of its own, so 99.5% of the rows clear it — which
     * is the same as no test. What it was written to prevent is therefore
     * exactly what the world had: *a cathedral with two houses behind it*,
     * the note's own words, as the median settlement on the planet.
     *
     * A size test says the same thing and says it per region for the right
     * reason, because the kit has already encoded which landmarks are
     * village-scale in the only place that could know — the parts' own
     * footprints. `steeple-church` declares 15.5 and needs a 25-unit town,
     * which is the median; `minaret-mosque` declares 9.2 and `pagoda` 8.6, so
     * a Sahelian hamlet keeps its minaret and a Norwegian one of the same
     * size loses its cathedral. That is the right answer both times and no
     * table had to say so.
     */
    const mix = fitting(style.civic, radius * CIVIC_ROOM)
      ?? mixAt(style, urbanity, 0, Infinity);
    if (mix.length > 0) {
      const id = rng.weighted(mix);
      // **And it clears its own footprint or a share of the town, whichever is
      // less.** CLAUDE.md records this failure for the *square* — a plaza
      // sized off the church is 18 units across in a village whose core is 12
      // — and the keepout beside it had the same shape and was never capped:
      // 15.5 times 1.15 is 36 units of cleared ground in the middle of a
      // settlement 50 units across, which deleted every plot a small town had.
      // The footprint is a bounding circle over a cross-shaped mass and is
      // generous by construction, so half of it still stands the houses off
      // the nave.
      cleared = hamlet ? 0 : Math.min(footprintOf(id) * 1.15, radius * CIVIC_CLEARS);
      placed.push({ partId: id, variant: rng.int(VARIANTS), plot: centre, scale: rng.spread(1, 0.06) });
    }
  }

  for (let index = 1; index < found.length; index++) {
    const plot = found[index]!;
    if (plot.distance < cleared) continue;
    if (blocked(plot.x, plot.z, plot.size * 0.5)) continue;
    const rng = rngFrom(plot.seed, 'what');
    const room = plot.size * 0.95;

    // A building if one fits, and a garden if none does. **The fit test is
    // tighter than it looks, and leaving the plot bare was measurably wrong.**
    // `plots` gives a plot `pitch * [0.5, 0.88]` of room, so at east-asia's
    // 13-unit pitch a machiya's 8.8 footprint fits 45% of them and a terrace
    // block's 8.4 fits 51% — which left half of Beijing's built core as empty
    // ground with an ink line round every gap. A plot too small for a house is
    // the plot a tree stands in, so it falls through to the greenery below
    // rather than squeezing in a smaller building or nothing at all.
    if (plot.distance < core) {
      const mix = mixAt(style, urbanity, plot.distance / radius, room);
      if (mix.length > 0) {
        const id = rng.weighted(mix);
        // Under a tenth either way. Past that a scaled house stops reading as
        // a different house and starts reading as the same house seen from
        // further off, which is worse than no variation at all.
        const scale = rng.spread(1, 0.09);
        placed.push({ partId: id, variant: rng.int(VARIANTS), plot, scale });
        garden(placed, style, plot, pitch, blocked);
        continue;
      }
    }

    const edge = (plot.distance - core) / Math.max(1, radius - core);
    const trees = fitting(style.trees, room);
    if (trees !== null && rng.chance(style.greenery * (1 - edge * 0.45))) {
      placed.push({ partId: rng.weighted(trees), variant: rng.int(VARIANTS), plot, scale: rng.spread(1, 0.14) });
      continue;
    }
    const scatter = fitting(style.scatter, room);
    if (scatter !== null && rng.chance(0.45)) {
      placed.push({ partId: rng.weighted(scatter), variant: rng.int(VARIANTS), plot, scale: rng.spread(1, 0.2) });
    }
  }
  return { placed, cleared, core, riverCut };
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
  /** The nearest settlement to a point, built or not. For the HUD and for debugging. */
  nearest(point: THREE.Vector3): { place: Place; distance: number } | null;
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
  survey(step?: number): unknown;
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
 * scarce: 48 resident settlements peak at 12.5 MB against the land mesh's 83.
 *
 * The count is not an artefact of instancing per town, either. Instances could
 * be pooled across every resident settlement of one region — but the pool is
 * still a mesh per (part, variant, colour) and a region uses about 220 of them,
 * so the floor is ~220 draw calls whether one town is standing or forty. Merged
 * costs one *per town*, and the streamer never keeps more than 48. The crossover
 * is around two hundred settlements, which the triangle budget forbids.
 *
 * Two things fall out of merging that instancing would not have given:
 * frustum culling is per town, because each mesh has its own bounding sphere
 * (48 resident settlements cost 12 draw calls at ground level, not 96); and
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
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01] };
  lightWindows(material);
  return material;
}

interface Slot {
  place: Place;
  style: RegionStyle;
  /** What the ground here is made of. Keyed on `style.id`; see `scenery/ground.ts`. */
  ground: GroundStyle;
  radius: number;
  seed: string;
/**
   * Where the roads out of here go: a unit vector a short way along each one.
   *
   * A direction and not a bearing, because the settlement's tangent frame is
   * rebuilt every time it is raised and can be *moved* — a town swallowed by a
   * monument's footprint steps aside along the great circle — so a bearing
   * cached in the old frame would be a track leaving on the wrong heading. The
   * frame turns the direction into a bearing at the moment it is needed, which
   * is what the version that scanned for neighbours did too.
   *
   * Undefined when the network was not handed in; empty when it was and this
   * place has no road out of it, which is 274 of the 29,545.
   */
  roads: THREE.Vector3[] | undefined;
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
  /** What the water refused it: plan positions, and cells of floor. */
  riverCut: number;
  riverCells: number;
  /**
   * The floor this town is standing on, for `madeHeightAt`, or null while it is
   * not standing.
   *
   * **The town's plinth is the one surface in this world a player walks on that
   * the terrain does not know about**, and this is the whole of what a point
   * query needs to find it: the paved cell set, the lattice it is on, and the
   * frame the cells are measured in. It is the *frame after the step-aside* —
   * `raise` can move a settlement off a monument and `frameAt` rebuilds `up`,
   * `across` and `north` when it does — so a floor recorded from the slot's own
   * direction would be up to 74 units out at Sydney.
   *
   * It costs a `Set` of a few hundred integers a resident town, which is the
   * same set `buildGround` already built and used to throw away.
   */
  floor: {
    up: THREE.Vector3;
    across: THREE.Vector3;
    north: THREE.Vector3;
    field: FloorField;
    /** Angular bound of the paved set plus the kerb blend, for the cheap gate. */
    cosBound: number;
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
}

export interface SettlementOptions {
  /** Share the monument context, so one material cache serves the whole world. */
  context?: MonumentContext;
  /** Monuments, so nothing is built inside one. */
  monuments?: readonly Placement[];
  /**
   * The baked road network, so a town's own tracks leave on the headings its
   * roads actually take. Omit it and they fall back to a seeded fan, which is
   * what they were before `roads.json` existed.
   */
  roads?: readonly Road[];
  /**
   * The baked river lines, so a town's plots and its floor keep off the water.
   *
   * Omit them and a settlement is built as it was before rivers existed, which
   * is a town with the Danube running under its paving — see `RiverCorridor`.
   */
  rivers?: readonly RiverLine[];
}

export function createSettlements(
  world: World,
  places: readonly Place[],
  options: SettlementOptions = {},
): Settlements {
  const group = new THREE.Group();
  group.name = 'settlements';

  const ctx: SceneryContext = createSceneryContext(options.context);
  const material = townMaterial();
  const missing: string[] = [];
  const broken: string[] = [];

  const continentOf = new Map<string, string>(
    world.countries.map((country) => [country.iso, country.continent]),
  );

  const slots: Slot[] = places.map((place) => {
    const lat = place.lat * DEG;
    const lon = place.lon * DEG;
    const direction = new THREE.Vector3(
      Math.cos(lat) * Math.cos(lon),
      Math.sin(lat),
      -Math.cos(lat) * Math.sin(lon),
    );
    const style = regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat);
    return {
      place,
      style,
      ground: groundStyleFor(style.id),
      roads: undefined,
      radius: radiusFor(place.pop),
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
      riverCut: 0,
      riverCells: 0,
      floor: null,
      failed: false,
      peopled: false,
    };
  });

  /**
   * Which way the roads leave each town, read off the baked network once.
   *
   * The direction is sampled a short way *along* the road rather than taken
   * from the far end, because a road bows: half of them do, and the ones that
   * bow hardest are the coastal roads that bend inland round a bay. A track
   * aimed at the other town would leave on a heading the road never takes.
   */
  if (options.roads !== undefined) {
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const pole = new THREE.Vector3();
    const aim = new THREE.Vector3();
    for (const road of options.roads) {
      for (const [self, other] of [[road.a, road.b], [road.b, road.a]] as const) {
        const slot = slots[self];
        if (slot === undefined) continue;
        from.copy(slot.direction);
        const far = slots[other];
        if (far === undefined) continue;
        to.copy(far.direction);
        roadPole(from, to, pole);
        // A quarter of the way, or 40 units, whichever is nearer the town.
        const length = from.angleTo(to) * PLANET_RADIUS;
        const t = Math.min(0.25, 40 / Math.max(1, length));
        roadPoint(from, to, road.a === self ? road.bend : -road.bend, t, aim, pole);
        (slot.roads ??= []).push(aim.clone());
      }
    }
    // A place the network reached with nothing is still a place the network was
    // asked about, and it must not fall back to the seeded fan.
    for (const slot of slots) slot.roads ??= [];
  }

  // The scan is a typed-array pass, not an object walk: 29,545 slots at three
  // floats each, read straight out of one buffer.
  const anchors = new Float32Array(slots.length * 3);
  slots.forEach((slot, i) => {
    anchors[i * 3] = slot.anchor.x;
    anchors[i * 3 + 1] = slot.anchor.y;
    anchors[i * 3 + 2] = slot.anchor.z;
  });

  const monumentSites = (options.monuments ?? []).map((placement) => {
    const lat = placement.lat * DEG;
    const lon = placement.lon * DEG;
    return {
      direction: new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        -Math.cos(lat) * Math.sin(lon),
      ),
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
    const value: FlatVariant = { ...flat, group: built, height: measure(built).height };
    variants.set(key, value);
    return value;
  }

  /**
   * A crowd body, merged, cached per region and climate band.
   *
   * `personPool` in `people.ts` is the same idea and is not used, for one
   * reason: it hands back `Group`s and a town needs flat arrays in its own
   * buffer. What is reused is everything that decides *who* the person is —
   * `lookFor` draws the body from one fork of the seed and the wardrobe from
   * another, so the same twelve people are dressed differently in every region
   * and are the same twelve people.
   *
   * Poses come from `lookFor`'s own idle table, which is 6 walk, 5 stand, 3
   * talk, 2 stride and 2 rest. **A walking pose on a body that does not move is
   * right and not a compromise**: `people.ts` measured that its `walk` and
   * `stride` poses are in double support with both feet down, precisely so a
   * frozen frame does not read as floating. What moves is in `src/life.ts`.
   */
  const crowd = new Map<string, FlatVariant | null>();
  function crowdVariant(regionId: string, band: number, index: number): FlatVariant | null {
    const key = `person:${regionId}:${band}:${index}`;
    const cached = crowd.get(key);
    if (cached !== undefined) return cached;
    let value: FlatVariant | null = null;
    try {
      const look = lookFor(rngFrom(key), regionId, { warmth: (band + 0.5) / WARMTH_BANDS });
      const built = buildPerson(ctx, look);
      value = { ...flatten(built, key, false), group: built, height: look.height };
    } catch (error) {
      broken.push(`${key}: ${String(error)}`);
    }
    crowd.set(key, value);
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
        value = { ...flatten(built, key, false), group: built, height: placedSize(entry)[2] };
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
  /** And the water, which is a line rather than a disc. See `RiverCorridor` in `rivers.ts`. */
  const corridors: RiverCorridor[] = [];
  const riverLines = options.rivers ?? [];
  const riverIndex = riverLines.length > 0 ? riverIndexFor(riverLines) : null;
  const riverHits: number[] = [];
  /**
   * How far out of a town a river chord still matters, in world units.
   *
   * The largest settlement is `BIGGEST_SETTLEMENT` of radius, its plots reach
   * that far, and the floor's own grow-by-one reaches one lattice cell past
   * them — the widest pitch the kit builds is 20.9. Add the widest bank (5.5)
   * and the margin, and a chord whose middle is further out than this cannot
   * reach anything the town places.
   */
  const RIVER_GATHER = BIGGEST_SETTLEMENT + 21 + widestRiverClearance() + TOWN_BANK;

  /** Where a local offset from the settlement's centre lands on the sphere. */
  function directionAt(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    return target
      .copy(up)
      .addScaledVector(across, x / PLANET_RADIUS)
      .addScaledVector(north, z / PLANET_RADIUS)
      .normalize();
  }

  /** Rebuilds the tangent frame, the ground origin and the keepouts about `up`. */
  function frameAt(): void {
    // The frame `placement.ts` builds, for the same reason: +Z along the ground
    // towards the pole, so every settlement on the planet is squared to the same
    // thing and a street reads as a street.
    north.set(0, 1, 0).projectOnPlane(up);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
    north.normalize();
    // X cross Y is Z, so X is Y cross Z. Written this way round on purpose:
    // `makeBasis(east, up, north)` is the reflection that fills an instanced
    // mesh with ink, and a merged one with inside-out triangles.
    across.crossVectors(up, north).normalize();
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

    /**
     * And every river that reaches this town, as chords in the same frame.
     *
     * The gather is a grid query and not a sweep of the 805 baked lines —
     * `riverIndexFor` is the wood's and the herd's index, so the
     * bucketing is paid once for the planet — and the chords are the stored
     * vertices themselves, which is what `rivers.ts` draws between. A line runs
     * out of the town at both ends, so the pieces are filtered on their own
     * midpoints rather than the line being clipped: a chord whose middle is
     * further out than the gather cannot reach a plot.
     */
    if (riverIndex !== null) {
      riverCorridorsNear(riverIndex, riverLines, up, across, north, RIVER_GATHER, TOWN_BANK, corridors, riverHits);
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
     * Where a person stands, as triples, and where a vehicle is parked, as
     * quadruples with a yaw on the end.
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
     * Cells the grow-by-one wanted and the water refused. See `RiverCorridor` in `rivers.ts`.
     *
     * The *plots* are already clear of the river — `planFor` refuses them, so
     * no building comes up on the bank and `built` never holds one — but the
     * floor is the built cells **grown by one**, and a grow is not a plot: two
     * houses on opposite banks of a brook would pave the water between them
     * and the town would read as a culvert. This counts what that costs.
     */
    riverCells: number;
    /**
     * The paved set itself, which is what a foot has to be able to ask about.
     *
     * Returned rather than rebuilt: the floor is the built cells grown by one
     * and clipped to a seeded core radius, and a second implementation of that
     * in a point query is a plinth the player stands on where the town has not
     * paved. See `Slot.floor` and `floorLiftAt`.
     */
    cells: ReadonlySet<number>;
  }

  /** One lattice corner: where it is, and whether it is standing in the sea. */
  interface Corner {
    /** Local plane coordinates, jittered. */
    x: number;
    z: number;
    /** The same point in the settlement's frame, at the ground with no lift on it. */
    lx: number;
    ly: number;
    lz: number;
    sea: boolean;
  }


  const groundDir = new THREE.Vector3();
  const groundLocal = new THREE.Vector3();
  const faceA = new THREE.Vector3();
  const faceB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const baseColor = new THREE.Color();
  const floor = new THREE.Color();
  /**
   * The ground of a cell nothing was built on: the same floor, less made.
   *
   * **A town's floor was one colour and that is what made a dense town read as
   * a slab and a sparse one as a car park.** The cells are already there — the
   * floor is the built cells grown by one — so the gaps between the houses are
   * already being drawn, and drawing them in the *same* tone as the ground
   * under the houses says the whole disc is one surface. It is not: the ground
   * beside a house is a yard, and a yard is trodden earth where the ground
   * under and between the buildings is made. Two tones over the cells that
   * already exist cost **no triangle and no draw call** and turn the sheet into
   * a patchwork, which is what a town looks like from two hundred units up.
   *
   * It is the floor at a fraction of the region's own `hardness` rather than a
   * new colour, so the whole of `ground.ts`'s argument survives — a Malian
   * yard is beaten sand and a Norwegian one grey gravel, and the difference
   * between the yard and the paving is the same size everywhere.
   */
  const yard = new THREE.Color();
  const verge = new THREE.Color();
  const roadColor = new THREE.Color();
  const plazaColor = new THREE.Color();
  const trackNear = new THREE.Color();
  const trackFar = new THREE.Color();
  /** Bare earth: what a track out of town turns into, and what the shoulders are. */
  const track = new THREE.Color();
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

  const smoothRamp = (value: number, from: number, to: number): number => {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
  };

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
   * raises it again, 21 reps, **best of** rather than median because this
   * machine runs several agents at once and a rep caught by a collection reads
   * as 20 ms of building. Same code, the emitter list stubbed empty against the
   * real one:
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
  /** The town's whole list, held for `buildTracks`, which runs after the cells. */
  let trackEmitters: readonly Emitter[] = [];
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
      const distance = Math.hypot(x - emitter.x, z - emitter.z);
      if (distance >= emitter.reach) continue;
      const span = emitter.reach - emitter.inner;
      const value = poolByte(
        emitter.strength,
        span <= 0 ? 1 : 1 - Math.max(0, distance - emitter.inner) / span,
      );
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
   * does it, rather than being reasoned about: the lattice is jittered and the
   * ground is tilted, so "which way round is anticlockwise" is not a question
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
   * The floor of one settlement.
   *
   * Three things, and the order is the argument:
   *
   * 1. **The floor is the built cells grown by one, clipped to the core.** Not
   *    a disc — a disc has to pick a radius the buildings then disagree with,
   *    and its edge is a circle, the one shape that cannot be mistaken for a
   *    town. Not the built cells alone either; see the note inside.
   * 2. **A street is a band of the cell, not a ribbon over it.** See the note
   *    above `TRACK_REACH`, and `GroundStyle.street` and `.lanes`.
   * 3. **The apron is what ends it.** See `APRON_SINK`.
   */
  function buildGround(
    slot: Slot,
    built: Set<number>,
    pitch: number,
    coreRadius: number,
    cleared: number,
    urbanity: number,
    litPlots: readonly LitPlot[],
  ): Ground {
    const out: Ground = { position: [], normal: [], color: [], glow: [], lamps: [], folk: [], kerbs: [], paved: 0, riverCells: 0, cells: new Set() };
    if (built.size === 0) return out;

    const style = slot.ground;
    // Asked once per town, at its centre. `groundColorAt` is a point-in-polygon
    // and a biome lookup; a settlement is at most 200 units across against
    // biome features measured in degrees, so a second call returns the first
    // answer and charges for it.
    groundColorAt(world, up, baseColor);
    floorColor(baseColor, style, floor);
    // A third of the way back from the paving to the dirt it was made out of.
    // Small on purpose: at a half the yards read as bare patches and the town
    // looks derelict, and at a tenth there is no patchwork at all.
    trodden(baseColor, yard);
    yard.lerp(floor, 0.66);
    trodden(baseColor, verge);
    verge.lerp(floor, 0.3);
    kerbTop.copy(floor).lerp(KERB_INK, 0.16);
    kerbFoot.copy(floor).lerp(KERB_INK, 0.42);
    roadColor.setHex(style.road);
    plazaColor.setHex(style.plaza);
    dirt(baseColor, track);

    /**
     * Which cells are floor.
     *
     * **The first version paved only the cells a building came up on and it was
     * wrong, visibly and for a reason worth keeping.** At east-asia's pitch a
     * machiya fits 45% of plots, so under half the cells of a built core hold a
     * house — and paving only those gives a town made of disconnected squares
     * with a street network broken into stubs, because a street exists on a
     * boundary only if the cell beside it is floor. Kyoto came out as a grey
     * amoeba with no lines in it. **A floor is the thing a town is continuous
     * in; the buildings are what stand on it.**
     *
     * **Paving the whole core radius instead was the second version and was
     * also wrong**, the other way: Oklahoma City puts 8 buildings inside a
     * 40-unit core, and a solid floor over all of it is a car park with houses
     * parked on it. The density is thin — CLAUDE.md already has it as owed work
     * — and a floor that ignores that makes it the first thing you see.
     *
     * So the floor is the built cells **grown by one**, clipped to the built
     * core. A dense town closes up into a continuous floor because its cells
     * touch; a sparse one keeps green between its clusters, which is what a
     * village is. And the clip radius each cell tests against is moved by up to
     * a sixth by its own seed, so where the floor does reach the core edge it
     * ends on a ragged line rather than on a compass arc.
     *
     * **A neighbour is only paved if *two* built cells claim it**, and the
     * interesting part is how little that turned out to be worth, because the
     * arithmetic that motivated it is wrong. "Grown by one" reads as `9n` cells
     * for `n` scattered houses, which at Tromso's seven buildings would be 63
     * against a core holding 19 — a car park with a church in the corner. It
     * never was `9n`: the grow is clipped to the core, and with the fill at
     * 0.83 there is hardly a cell inside the core that is not built already.
     * Measured over the 823-place survey, paved cells per standing building:
     * **1.62 with one claim, 1.51 with two**, and the median town is 9 paved
     * cells either way.
     *
     * So it ships as the *correct* rule rather than as a saving: a solid block
     * of building pays nothing, because every cell inside it is claimed eight
     * times; two houses set diagonally still pave the corner they share, so the
     * street network still connects; and a house standing on its own keeps its
     * cell and gets grass to the wall, which is what an outlying farm looks
     * like. **And it says where the car park actually comes from**: not from
     * the halo but from a town whose core holds nineteen cells and whose plots
     * lost eight of them to the sea. The answer to that is buildings, which is
     * `PLOT_PITCH`, `LOOSEST` and the fill above — not less floor.
     */
    const core = new Set(built);
    const claims = new Map<number, number>();
    for (const key of built) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const near = cellKey(col + dc, row + dr);
          if (core.has(near)) continue;
          claims.set(near, (claims.get(near) ?? 0) + 1);
        }
      }
    }
    for (const [near, count] of claims) {
      if (count < 2) continue;
      const col = Math.floor(near / 1024) - 512;
      const row = (near % 1024) - 512;
      const distance = Math.hypot(col * pitch, row * pitch);
      if (distance >= coreRadius * rngFrom(slot.seed, 'floor', col, row).range(0.84, 1.16)) continue;
      // And not over the water. The cell's own half-diagonal is what it claims,
      // so a cell whose corner reaches the bank is refused rather than paving up
      // to the edge and hanging over it.
      if (inRiverCorridor(corridors, col * pitch, row * pitch, pitch * Math.SQRT1_2)) {
        out.riverCells++;
        continue;
      }
      core.add(near);
    }
    out.paved = core.size;
    out.cells = core;

    const corners = new Map<number, Corner>();
    function cornerAt(i: number, j: number): Corner {
      const key = cellKey(i, j);
      const known = corners.get(key);
      if (known !== undefined) return known;
      const rng = rngFrom(slot.seed, 'corner', i, j);
      const x = (i - 0.5) * pitch + rng.jitter() * pitch * CORNER_JITTER;
      const z = (j - 0.5) * pitch + rng.jitter() * pitch * CORNER_JITTER;
      directionAt(x, z, groundDir);
      // One query answers both questions: elevation 0 *is* the sea, because the
      // coast is a shelf with a cliff and there is no mesh below it.
      const elevation = world.elevationAt(groundDir);
      groundLocal
        .copy(groundDir)
        .multiplyScalar(PLANET_RADIUS + Math.max(0, elevation))
        .sub(origin)
        .applyMatrix4(inverse);
      const made: Corner = {
        x, z,
        lx: groundLocal.x, ly: groundLocal.y, lz: groundLocal.z,
        sea: elevation <= 0,
      };
      corners.set(key, made);
      return made;
    }

    /** A corner touches a paved cell, so it is at paving height rather than sunk. */
    const paved = (i: number, j: number): boolean =>
      core.has(cellKey(i - 1, j - 1)) || core.has(cellKey(i, j - 1)) ||
      core.has(cellKey(i - 1, j)) || core.has(cellKey(i, j));

    const blocked = (x: number, z: number): boolean => {
      for (const keepout of keepouts) {
        if (Math.hypot(x - keepout.x, z - keepout.z) < keepout.radius) return true;
      }
      // A lamp, a parked car or a person standing in the Danube.
      return inRiverCorridor(corridors, x, z, 0);
    };

    /**
     * One point on the paving, at the paving's own lift, or nothing.
     *
     * Deliberately not `cornerAt`: that one caches on the lattice and these are
     * jittered points inside a cell, so there is nothing to cache and a cache
     * would grow without bound. It costs one `elevationAt` — a point-in-polygon
     * at 3.6 microseconds — and a median town asks it about fifteen times.
     */
    const spotAt = (x: number, z: number, into: number[], yaw?: number): boolean => {
      if (blocked(x, z)) return false;
      directionAt(x, z, groundDir);
      const elevation = world.elevationAt(groundDir);
      // Elevation 0 is the sea. A coastal town loses its seaward kerbs, which
      // is what a quay looks like from the land side.
      if (elevation <= 0) return false;
      groundLocal
        .copy(groundDir)
        .multiplyScalar(PLANET_RADIUS + elevation)
        .sub(origin)
        .applyMatrix4(inverse);
      into.push(groundLocal.x, groundLocal.y + GROUND_LIFT, groundLocal.z);
      if (yaw !== undefined) into.push(yaw);
      return true;
    };

    /**
     * Corner position with the right height for its class, as a triple.
     *
     * **The apron starts at the kerb's foot and not at the paving.** It used to
     * run from the floor's own surface down to `APRON_SINK`, which was right
     * when the floor was a sheet: there was no side to the town, so the ramp had
     * to be it. The floor is a plinth now — see `KERB_DROP` — and the vertical
     * face is what ends it, so the ramp begins where that face lands and carries
     * on down. Two surfaces, each doing one job, and no ramp climbing the kerb
     * from outside.
     */
    const at = (i: number, j: number): number[] => {
      const corner = cornerAt(i, j);
      return [corner.lx, corner.ly + (paved(i, j) ? -KERB_DROP : -APRON_SINK), corner.lz];
    };

    /** Bilinear point inside a cell, in the frame the four corners define. */
    const inside = (
      a: Corner, b: Corner, c: Corner, d: Corner,
      u: number, v: number, lift: number,
      target: number[],
    ): number[] => {
      const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
      target[0] = a.lx * w0 + b.lx * w1 + c.lx * w2 + d.lx * w3;
      target[1] = a.ly * w0 + b.ly * w1 + c.ly * w2 + d.ly * w3 + lift;
      target[2] = a.lz * w0 + b.lz * w1 + c.lz * w2 + d.lz * w3;
      return target;
    };

    // How often a street runs, in cells. A hamlet two cells across with a
    // period of four gets no street at all, which is worse than one at the
    // wrong spacing, so the region's period only applies where it fits — and
    // `span + 1` rather than `span`, because a town five cells across at a
    // period of two is three streets each way, which is a chequerboard and not
    // a village. What this aims at is two or three streets across whatever the
    // settlement turns out to be.
    let span = 0;
    for (const key of core) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      span = Math.max(span, Math.abs(col), Math.abs(row));
    }
    const lanes = Math.max(2, Math.min(style.lanes, span + 1));
    const onLane = (boundary: number): boolean => ((boundary % lanes) + lanes) % lanes === 0;
    // The carriageway is a width in world units; a cell wants a share of itself.
    // Half, because each of the two cells either side of a boundary paves its
    // own half of the street. Capped at 0.3 so the street cannot eat more of a
    // narrow-pitched plot than the plot has to give.
    const width = Math.min(0.3, style.street * 0.5 / pitch);

    /**
     * The square, and **it has to be capped against the town or it eats it.**
     * The first version sized it off the civic building alone — a steeple
     * church declares a 15.5 footprint and clears 1.15 of that around itself,
     * which is 18 units of plaza in a Norwegian village whose entire built core
     * is 12. Vossevangen came out as a cream disc with four red huts on it and
     * no street visible anywhere, because the plaza colour overrides the road.
     * A square is a *part* of a town; half the built core is already generous.
     */
    const plazaRadius = built.has(cellKey(0, 0))
      ? Math.min(coreRadius * 0.5, Math.max(cleared, pitch * 0.45))
      : 0;


    // --- the lamps ---
    //
    // **On the lattice corners and nowhere else, and that is a clearance
    // argument rather than a taste.** A corner sits half a pitch from each of
    // the four plot centres around it — 0.707 of a pitch, 9.2 units at the
    // 13-unit east-asian pitch, against a house's 4.9-unit half-diagonal — so a
    // lamp there is clear of every building that can stand beside it. Anywhere
    // *inside* a cell is not: at that pitch a 7-unit house spans u from 0.23 to
    // 0.77 and the carriageway's kerb is at 0.3, so a lamp on the kerb is
    // nine tenths of a unit inside the front wall. The corner is also where a
    // lamp belongs, which is the pleasant half of the same fact.
    const chance = Math.min(
      LAMP_MAX_CHANCE,
      LAMP_FLOOR + (style.hardness - 0.3) * 0.8 + urbanity * 0.3,
    );
    let lamps = 0;
    for (let i = -span - 1; i <= span + 1 && lamps < LAMP_CAP; i++) {
      for (let j = -span - 1; j <= span + 1 && lamps < LAMP_CAP; j++) {
        // A corner carries the boundary below it: cell `col` reads its low edge
        // as `onLane(col - 1)`, so corner `i` is on a street when `onLane(i-1)`.
        if (!onLane(i - 1) && !onLane(j - 1)) continue;
        if (!paved(i, j)) continue;
        const rng = rngFrom(slot.seed, 'lamp', i, j);
        if (!rng.chance(chance)) continue;
        const corner = cornerAt(i, j);
        if (corner.sea || blocked(corner.x, corner.z)) continue;
        out.lamps.push(corner.lx, corner.ly + GROUND_LIFT, corner.lz);
        lamps++;
      }
    }

    /**
     * Everything in this town that lights the ground, in one list.
     *
     * **The lamps are chosen here rather than after the floor is laid, and the
     * reorder is the only structural change the pools needed.** A pool is a
     * value on the floor's own vertices, so the floor cannot be pushed until
     * the lights standing on it are known. Nothing about *which* lamps are
     * chosen moved — the loop, its seeds and its order are the ones that used
     * to run forty lines further down, so a town lights the same corners it
     * always did.
     */
    const emitters: Emitter[] = [];
    for (let i = 0; i + 2 < out.lamps.length; i += 3) {
      emitters.push({
        x: out.lamps[i]!,
        z: out.lamps[i + 2]!,
        // A lamp is a point and the corner it stands on is a vertex of the four
        // cells around it, so the peak has somewhere to be by construction.
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

    for (const key of core) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      const a = cornerAt(col, row);
      const b = cornerAt(col + 1, row);
      const c = cornerAt(col + 1, row + 1);
      const d = cornerAt(col, row + 1);
      // The shoreline is where a settlement stops, and that has to hold for the
      // ground as much as for the houses: half a paved square cantilevered over
      // a 20-unit cliff is worse than bare rock.
      if (a.sea || b.sea || c.sea || d.sea) continue;
      if (blocked((a.x + c.x) * 0.5, (a.z + c.z) * 0.5)) continue;
      // Half a diagonal plus a jitter: the widest a corner can be from the
      // centre of its own cell, so nothing that could reach this cell is missed.
      // In `lx`/`lz` and not `x`/`z`: the emitters and the faces are both in the
      // settlement's own frame, and the plane coordinates are the same numbers
      // to about a tenth of a unit but are not the same space.
      litHere = litAround(emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);

      // Where the streets cut this cell. A boundary carries a street when its
      // index falls on the lane lattice; the band is `width` of the cell either
      // side of it, so two cells sharing a street each pave their own half and
      // the two halves meet on the corners they already share.
      const cuts = (low: boolean, high: boolean): number[] => {
        const list = [0];
        if (low) list.push(width);
        if (high) list.push(1 - width);
        list.push(1);
        return list;
      };
      const us = cuts(onLane(col - 1), onLane(col));
      const vs = cuts(onLane(row - 1), onLane(row));

      for (let iu = 0; iu < us.length - 1; iu++) {
        const u0 = us[iu]!;
        const u1 = us[iu + 1]!;
        const roadU = (iu === 0 && onLane(col - 1)) || (iu === us.length - 2 && onLane(col));
        for (let iv = 0; iv < vs.length - 1; iv++) {
          const v0 = vs[iv]!;
          const v1 = vs[iv + 1]!;
          const roadV = (iv === 0 && onLane(row - 1)) || (iv === vs.length - 2 && onLane(row));
          inside(a, b, c, d, u0, v0, GROUND_LIFT, q0);
          inside(a, b, c, d, u1, v0, GROUND_LIFT, q1);
          inside(a, b, c, d, u1, v1, GROUND_LIFT, q2);
          inside(a, b, c, d, u0, v1, GROUND_LIFT, q3);
          const mx = (q0[0]! + q2[0]!) * 0.5;
          const mz = (q0[2]! + q2[2]!) * 0.5;
          // The square wins over the street that runs into it, which is what a
          // square is: the carriageway stops at its edge and starts again on
          // the far side.
          const tint = Math.hypot(mx, mz) < plazaRadius
            ? plazaColor
            : roadU || roadV
              ? roadColor
              // A street runs over a yard as readily as over a forecourt, so
              // the yard tone is asked *after* the road and not before it: what
              // this distinguishes is the ground between the houses from the
              // ground under them, and a carriageway is neither.
              : built.has(key)
                ? floor
                : yard;
          pushQuad(out, q0, q1, q2, q3, tint, tint, tint, tint);
        }
      }
    }

    /**
     * The kerb: the side of the plinth, around the floor's own outline.
     *
     * **A town is a raised surface now and a raised surface has a side.** The
     * user asked for it in one line — *las ciudades podrian estar sobre una
     * superficie de asfalto un poco elevada* — and the geometry is what makes
     * it true rather than the lift: at `GROUND_LIFT` alone the floor is a sheet
     * seen edge-on, which is nothing, and the raise that hides the land mesh
     * (8.4% of town ground to 2.2%) is exactly the raise that would have left
     * it floating.
     *
     * It is **one quad per boundary edge**, from the paving down to
     * `-KERB_DROP`, and the outline is the floor's own ragged cell edge, so the
     * kerb inherits the shape the growth rule drew and adds no new one. A
     * median town is nine paved cells and about a dozen boundary edges: **24
     * triangles**, against the 200 or so the floor itself is. Beijing's 514
     * plots pay about 180.
     *
     * Two details that are not free to get wrong. The face is **vertical by
     * construction** — the two corners share their `lx`/`lz` and differ only in
     * height — so `pushFace`'s "normals point up" rule cannot flip it, and the
     * winding is chosen here against the outward direction instead; wind it the
     * other way and half the kerb is backface-culled and the town has holes in
     * its edge. And a corner over the sea is skipped, exactly as the cells are:
     * a quay does not get a kerb hanging off the cliff.
     */
    const kerbFace = (a: Corner, b: Corner, outX: number, outZ: number): void => {
      if (a.sea || b.sea) return;
      // The normal of `(topA, footA, footB, topB)` is the edge turned a quarter
      // turn about the local up; if it faces into the town, take the edge the
      // other way round.
      const first = -(b.lz - a.lz) * outX + (b.lx - a.lx) * outZ > 0 ? a : b;
      const second = first === a ? b : a;
      pushQuad(
        out,
        [first.lx, first.ly + GROUND_LIFT, first.lz],
        [first.lx, first.ly - KERB_DROP, first.lz],
        [second.lx, second.ly - KERB_DROP, second.lz],
        [second.lx, second.ly + GROUND_LIFT, second.lz],
        kerbTop, kerbFoot, kerbFoot, kerbTop,
      );
    };
    for (const key of core) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      const a = cornerAt(col, row);
      const b = cornerAt(col + 1, row);
      const c = cornerAt(col + 1, row + 1);
      const d = cornerAt(col, row + 1);
      if (a.sea || b.sea || c.sea || d.sea) continue;
      if (blocked((a.x + c.x) * 0.5, (a.z + c.z) * 0.5)) continue;
      // The pool the face is lit by is the cell's own, which is where it stands.
      litHere = litAround(emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);
      const centreX = (a.lx + b.lx + c.lx + d.lx) * 0.25;
      const centreZ = (a.lz + b.lz + c.lz + d.lz) * 0.25;
      const edge = (p: Corner, q: Corner, neighbour: number): void => {
        if (core.has(neighbour)) return;
        kerbFace(p, q, (p.lx + q.lx) * 0.5 - centreX, (p.lz + q.lz) * 0.5 - centreZ);
      };
      edge(a, d, cellKey(col - 1, row));
      edge(b, c, cellKey(col + 1, row));
      edge(a, b, cellKey(col, row - 1));
      edge(d, c, cellKey(col, row + 1));
    }

    // The apron: one course of cells outside the paving, laid from the kerb's
    // foot down into the land, so the sheet dives instead of ending.
    const apron = new Set<number>();
    for (const key of core) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const near = cellKey(col + dc, row + dr);
          if (!core.has(near)) apron.add(near);
        }
      }
    }
    for (const key of apron) {
      const col = Math.floor(key / 1024) - 512;
      const row = (key % 1024) - 512;
      const a = cornerAt(col, row);
      const b = cornerAt(col + 1, row);
      const c = cornerAt(col + 1, row + 1);
      const d = cornerAt(col, row + 1);
      if (a.sea || b.sea || c.sea || d.sea) continue;
      if (blocked((a.x + c.x) * 0.5, (a.z + c.z) * 0.5)) continue;
      const pa = at(col, row);
      const pb = at(col + 1, row);
      const pc = at(col + 1, row + 1);
      const pd = at(col, row + 1);
      // The apron is ground too, and the lamp nearest the edge of a town is
      // usually standing on it. Its outer corners are sunk below the land, so
      // what a pool reaches there is the half that is still at paving height.
      litHere = litAround(emitters, (a.lx + c.lx) * 0.5, (a.lz + c.lz) * 0.5, pitch * 0.8);
      // Per-vertex colour rather than per-face: this is the one surface in the
      // kit that wants a gradient across it, because it is the one whose job is
      // to stop being the town.
      // The inner corners are the kerb's foot and wear its tone, so the ramp
      // continues the face above it rather than restating the paving that is
      // now two units over its head.
      pushQuad(
        out, pa, pb, pc, pd,
        paved(col, row) ? kerbFoot : verge,
        paved(col + 1, row) ? kerbFoot : verge,
        paved(col + 1, row + 1) ? kerbFoot : verge,
        paved(col, row + 1) ? kerbFoot : verge,
      );
    }

    // --- who is standing in it, and what is parked in it ---
    //
    // **The kerb is a share of the cell and not a distance from a wall**, which
    // is the same unit `width` above already works in: a street straddles a
    // lattice boundary and each of the two cells either side paves its own half
    // of it, so half-way out from the centreline is the middle of one side's
    // carriageway. A placed hatchback is 4.44 across against a carriageway that
    // is 6.0 at the narrowest region and 15 at the widest, so parking on the
    // half-line leaves the other half clear at every pitch on the planet.
    //
    // Where a *person* goes is a looser question and is deliberately answered
    // more loosely: anywhere on the paved band or a little onto the verge. A
    // crowd lined up on a kerb reads as a bus queue.
    const half = width * pitch;
    const parkChance = Math.min(0.55, 0.12 + urbanity * 0.5);
    const folkChance = Math.min(0.6, 0.2 + urbanity * 0.55);
    for (let i = -span - 1; i <= span + 1; i++) {
      for (let j = -span - 1; j <= span + 1; j++) {
        const alongZ = onLane(i - 1);
        const alongX = onLane(j - 1);
        if (!alongZ && !alongX) continue;
        if (!paved(i, j)) continue;
        const rng = rngFrom(slot.seed, 'street-life', i, j);
        const x0 = (i - 0.5) * pitch;
        const z0 = (j - 0.5) * pitch;

        if (rng.chance(parkChance)) {
          const facing = rng.chance(0.5) ? 1 : -1;
          // Along the street, a third of a cell either way from the corner, so
          // two bays on one boundary are never nose to tail in the same place.
          const along = rng.range(0.15, 0.85) * pitch;
          const x = alongZ ? x0 + facing * half * 0.5 : x0 + along;
          const z = alongZ ? z0 + along : z0 + facing * half * 0.5;
          // Facing along the street, and reversed for the far side of it, so
          // the two kerbs of one road point opposite ways.
          const yaw = alongZ ? (facing > 0 ? 0 : Math.PI) : (facing > 0 ? Math.PI / 2 : -Math.PI / 2);
          spotAt(x, z, out.kerbs, yaw);
        }
        if (rng.chance(folkChance)) {
          for (let k = 0; k < 2; k++) {
            if (k > 0 && !rng.chance(0.42)) break;
            const along = rng.range(0.1, 0.9) * pitch;
            const off = rng.range(-1.1, 1.1) * half;
            const x = alongZ ? x0 + off : x0 + along;
            const z = alongZ ? z0 + along : z0 + off;
            spotAt(x, z, out.folk);
          }
        }
      }
    }

    // A track is laid over the paving it crosses, so it has to be lit by the
    // same pools or it draws a dark ribbon through them. It is scoped per step
    // inside `buildTracks`, which is where the step's own centre is known.
    trackEmitters = emitters;
    buildTracks(out, slot, pitch, urbanity);
    trackEmitters = NO_EMITTERS;
    litHere = NO_EMITTERS;
    return out;
  }

  /**
   * The roads out.
   *
   * **A town with streets inside it and nothing leaving it is a model village.**
   * From 260 units up the streets read as texture and the track reads as
   * connection, which is the thing that says the place is somewhere rather than
   * a decoration — so the bearings are the real ones: each track points at a
   * neighbouring settlement. They are far too short to arrive, at 62 units past
   * the built edge against a median 148 between neighbours, and that is the
   * point of them being aimed at all. A track leaving in a direction nothing is
   * in would be a mistake you could see once you knew the map.
   *
   * The cross-section is a crown between two shoulders laid below the ground,
   * the same trick the apron uses: outside the town the shoulders are buried
   * and only the crown shows, so the track's edge is the line the relief cuts
   * rather than a hard rectangle. Inside the town the drop is nearly nothing
   * and the whole section sits on the paving as a carriageway.
   */
  /**
   * The bearings the tracks out of this town leave on.
   *
   * **They used to be invented here and now they are read off the network, and
   * that is the whole reconciliation.** The first version of these tracks
   * scanned all 29,545 anchors for the nearest neighbours and aimed at them,
   * which was the best guess available when nothing joined the towns — but a
   * guess is what it was, and `roads.json` is the answer: it knows which
   * neighbours are actually reachable, that the road bows round the bay on the
   * way, and that Palma has no road out at all.
   *
   * The two halves stay separate on purpose rather than one drawing the whole
   * thing. A track inside town is on the *paving*, in the settlement's own
   * tangent frame, at the paving's own lift; a road between towns is on bare
   * ground in world space at `roads.ts`'s. They meet because they are collinear
   * — the town takes its bearing from the road's own first stretch — and where
   * they overlap the road is laid the higher of the two and simply wins, which
   * is a carriageway crossing a square and is what it should look like.
   */
  function trackBearings(slot: Slot, urbanity: number, aimed: { real: boolean }): number[] {
    const bearings: number[] = [];
    aimed.real = false;
    const leaving = slot.roads;
    if (leaving !== undefined && leaving.length > 0) {
      const headings = leaving.map((aim) => Math.atan2(aim.dot(across), aim.dot(north)));
      // Every road that leaves, up to what a town can carry. A junction of five
      // is a junction of five: the airport was four *invented* rays sharing a
      // centre, and a real one has the network's own asymmetry in it.
      for (const bearing of headings) {
        let clear = true;
        for (const taken of bearings) {
          let delta = Math.abs(bearing - taken) % (Math.PI * 2);
          if (delta > Math.PI) delta = Math.PI * 2 - delta;
          // Two tracks a few degrees apart read as one wide one with a fork.
          if (delta < 0.42) clear = false;
        }
        if (clear) bearings.push(bearing);
        if (bearings.length >= 5) break;
      }
      aimed.real = bearings.length > 0;
      return bearings;
    }
    // A place the network could not reach — an island with one town on it, and
    // there are 221 of them — still has lanes going out of it, because a town
    // with no way out of it reads as a mistake rather than as an island. They
    // just do not arrive anywhere, which is true.
    const rng = rngFrom(slot.seed, 'tracks');
    const wanted = urbanity > 0.55 ? 3 : 2;
    while (bearings.length < wanted) bearings.push(rng.unit() * Math.PI * 2);
    return bearings;
  }

  function buildTracks(out: Ground, slot: Slot, pitch: number, urbanity: number): void {
    const aimed = { real: false };
    const bearings = trackBearings(slot, urbanity, aimed);

    const edge = slot.radius * 0.8;
    const reach = edge + TRACK_REACH;
    // Narrower than the streets it leaves. The road out of a village is the one
    // thing in the kit that is allowed to be a cart track, and a track as wide
    // as the high street is the other half of the airport.
    const half = Math.max(1.9, slot.ground.street * 0.31);
    const steps = Math.max(6, Math.round(reach / 14));

    const left = [0, 0, 0];
    const crownL = [0, 0, 0];
    const crownR = [0, 0, 0];
    const right = [0, 0, 0];
    const nextLeft = [0, 0, 0];
    const nextCrownL = [0, 0, 0];
    const nextCrownR = [0, 0, 0];
    const nextRight = [0, 0, 0];

    for (let index = 0; index < bearings.length; index++) {
      const bearing = bearings[index]!;
      const dx = Math.sin(bearing);
      const dz = Math.cos(bearing);
      // Across the track, not along it.
      const sx = dz;
      const sz = -dx;
      let previousElevation = Number.NaN;
      let broke = false;
      /**
       * A road out of a town does not leave it along a radius.
       *
       * Straight rays from one point are the *shape* of the airport, not just
       * its width: the eye finds the centre they share before it finds any of
       * them. One seeded half-wave of lateral wander, up to a fifth of the
       * reach, is enough that they read as three roads rather than as one
       * asterisk, and it costs a sine.
       *
       * **A fifth of the reach is far too much once the bearing is real,
       * though, and that is the second half of the collision the user
       * reported.** A track aimed off `roads.bin` is drawing the *same road*
       * the ribbon draws — they are collinear at the town and the ribbon takes
       * over at `radiusFor - TOWN_OVERLAP` — so a hundred-and-sixty-unit track
       * out of a city was wandering up to 33 units off the line the ribbon
       * holds, and the two crossed each other in the open. Where the bearing is
       * the network's, the wander is capped at the track's own **half-width**:
       * enough to bend a ray, never enough to leave the carriageway it is
       * drawing. An invented fan has nothing to stay next to and keeps the
       * fifth.
       */
      const wander = rngFrom(slot.seed, 'wander', index);
      const swing = aimed.real ? Math.min(0.2 * reach, half) : 0.2 * reach;
      const sway = wander.range(-1, 1) * swing;
      const phase = wander.range(0.6, 1.1);

      /** One cross-section, into the four points given. */
      const section = (
        distance: number,
        a: number[], b: number[], c: number[], d: number[],
      ): boolean => {
        const bend = sway * Math.sin((distance / reach) * Math.PI * phase);
        const x = dx * distance + sx * bend;
        const z = dz * distance + sz * bend;
        directionAt(x, z, groundDir);
        const elevation = world.elevationAt(groundDir);
        if (elevation <= 0) return false;
        // A shelf step is a 20-unit cliff and a pad rim is nearly as sharp.
        // Either way a track that walks off one is a ramp into the air.
        if (Number.isFinite(previousElevation) && Math.abs(elevation - previousElevation) > 10) return false;
        previousElevation = elevation;

        const taper = 1 - 0.45 * smoothRamp(distance, reach * 0.72, reach);
        const w = half * taper;
        const shoulder = w * 2.1;
        const drop = 0.15 + TRACK_SHOULDER * smoothRamp(distance, edge * 0.85, edge + pitch * 0.9);
        /**
         * **The track climbs the kerb, and then it is a road.**
         *
         * Three heights and two of them are somebody else's. Inside the floor
         * it is `GROUND_LIFT + TRACK_RISE`, a carriageway crossing a square, and
         * it holds that until it is clear of the plinth — the same window the
         * shoulders use to start digging, which is where the kerb stands. Then
         * it falls to `RIBBON_LIFT` over about a cell and **stays there**, which
         * is the change: it used to die to nothing at the reach, so the last
         * thing a road arrived at was a wedge sinking into a field while the
         * ribbon still had 1.1 units of lift on it. The ribbon overlaps the last
         * eight units by construction (`TOWN_OVERLAP`) and covers the end.
         *
         * A quarter of a unit under the ribbon rather than level with it: two
         * coplanar surfaces z-fight, and the one that should win is the one the
         * bake tested for water.
         */
        const kerbAt = edge + pitch * 0.9;
        const crown =
          (GROUND_LIFT + TRACK_RISE) +
          (RIBBON_LIFT - 0.25 - GROUND_LIFT - TRACK_RISE) *
            smoothRamp(distance, kerbAt, kerbAt + pitch);

        const place = (offset: number, lift: number, target: number[]): void => {
          directionAt(x + sx * offset, z + sz * offset, groundDir);
          groundLocal
            .copy(groundDir)
            .multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(groundDir)) + lift)
            .sub(origin)
            .applyMatrix4(inverse);
          target[0] = groundLocal.x;
          target[1] = groundLocal.y;
          target[2] = groundLocal.z;
        };
        place(-shoulder, crown - drop, a);
        place(-w, crown, b);
        place(w, crown, c);
        place(shoulder, crown - drop, d);
        return true;
      };

      /**
       * A road stops being a road on the way out — and **it becomes dirt, not
       * lawn.**
       *
       * The first version walked from the street's surface to `verge`, which is
       * the *trodden yard* colour, and at the time that was a desaturated
       * version of the local ground. Between the houses that is right. Running
       * out of town it is not: the user's word for the result was
       * *carreteras asfaltadas con caminos de hierbas* — paved roads with grass
       * paths coming off them — and they were right, because a green with its
       * saturation taken off is exactly what mown grass looks like. Two things
       * fixed it and only one of them is here: `trodden` now shifts hue toward
       * earth as well as cutting saturation, and this walks to `dirt`, which is
       * a further step along the same axis and is a different substance rather
       * than a faded road.
       *
       * The fade itself stays, because a carriageway does not keep its metalling
       * for a mile into a field, and because it is what stops the far end being
       * a hard stop: by the time the geometry has given up its lift, the colour
       * has given up its surface.
       */
      const shade = (distance: number, target: THREE.Color): THREE.Color =>
        target.copy(roadColor).lerp(track, smoothRamp(distance, edge * 0.7, reach * 0.95));

      if (!section(0, left, crownL, crownR, right)) continue;
      shade(0, trackNear);
      for (let step = 1; step <= steps && !broke; step++) {
        const distance = (step / steps) * reach;
        if (!section(distance, nextLeft, nextCrownL, nextCrownR, nextRight)) {
          broke = true;
          break;
        }
        shade(distance, trackFar);
        // One section at a time, off the section's own midpoint, so a track
        // crossing a lit square picks the pools up and drops them again on the
        // way out of town. Half a dozen filters a track, against ten thousand
        // if the vertices asked for themselves.
        litHere = litAround(
          trackEmitters,
          (crownL[0]! + nextCrownR[0]!) * 0.5, (crownL[2]! + nextCrownR[2]!) * 0.5,
          half * 2.1 + reach / steps,
        );
        pushQuad(out, left, crownL, nextCrownL, nextLeft, track, trackNear, trackFar, track);
        pushQuad(out, crownL, crownR, nextCrownR, nextCrownL, trackNear, trackNear, trackFar, trackFar);
        pushQuad(out, crownR, right, nextRight, nextCrownR, trackNear, track, track, trackFar);
        trackNear.copy(trackFar);
        for (let k = 0; k < 3; k++) {
          left[k] = nextLeft[k]!;
          crownL[k] = nextCrownL[k]!;
          crownR[k] = nextCrownR[k]!;
          right[k] = nextRight[k]!;
        }
      }
    }
  }

  function raise(slot: Slot): void {
    if (slot.mesh !== null || slot.failed) return;

    up.copy(slot.direction);
    frameAt();
    if (basis.determinant() <= 0) {
      slot.failed = true;
      broken.push(`${slot.place.name}: settlement basis has determinant ${basis.determinant()}`);
      return;
    }

    /**
     * A settlement standing inside a monument steps aside, once.
     *
     * **28 of the world's landmark cities were holes without this**, and they are
     * exactly the ones worth having: Beijing sits 4 units from the Forbidden City,
     * Berlin 4 from the Brandenburg Gate, Athens 4 from the Parthenon, Prague 2
     * from Charles Bridge. A monument's footprint is up to 55 units and Lhasa's
     * whole radius is 40, so the keepout did not thin those cities out, it deleted
     * their centres and in six cases deleted them outright.
     *
     * A ring of city around the Forbidden City is right and needs nothing — the
     * plots outside the keepout are still there. What is wrong is a town *smaller*
     * than the landmark it is named for, and the fix is the one
     * `build-monuments.ts` already uses on two monuments that overlap: move it
     * along the great circle until it is clear, and let it stand beside the thing
     * rather than inside it.
     */
    let deepest: Keepout | null = null;
    for (const keepout of keepouts) {
      // Only a monument that would *swallow* the settlement moves it. A ring of
      // city around a landmark is right and costs nothing — the plots outside the
      // keepout are still there, and Beijing wrapped round the Forbidden City is
      // what Beijing looks like. Stepping aside from every monument it merely
      // overlaps would take Paris 34 units off its own coordinate to get out of
      // the way of a tower that is supposed to be standing in it.
      if (keepout.radius <= slot.radius * 0.7) continue;
      const inside = keepout.radius - Math.hypot(keepout.x, keepout.z);
      if (inside > 0 && (deepest === null || inside > deepest.radius - Math.hypot(deepest.x, deepest.z))) {
        deepest = keepout;
      }
    }
    if (deepest !== null) {
      const away = Math.hypot(deepest.x, deepest.z);
      // A monument exactly on the centre has no direction to be pushed away
      // from, so the settlement's own seed picks one and keeps picking it.
      const bearing = away > 1e-3 ? Math.atan2(-deepest.z, -deepest.x) : rngFrom(slot.seed, 'aside').unit() * Math.PI * 2;
      // Far enough that the settlement's own centre is clear, not so far that a
      // village ends up in the next valley. Its plots still reach back towards
      // the monument and the ones that reach too far are dropped, which is what
      // leaves a landmark standing at the edge of the town it belongs to.
      const step = deepest.radius + Math.max(slot.radius * 0.45, 14) - away;
      /**
       * Straight away from the monument first, then round the compass — and it
       * takes two tests to land, not one.
       *
       * **Out of the sea**, because Sydney's opera house pushes the city 74
       * units and the straight-away bearing puts it in the harbour, where every
       * plot is over water. `build-monuments.ts` re-checks each end of a
       * separation against the outlines for exactly this.
       *
       * **And out of the *other* monuments**, which is the one that is easy to
       * miss and cost the two worst results measured. Stepping aside from the
       * deepest keepout says nothing about the rest: moving Sydney clear of the
       * opera house parked it 33 units from the Harbour Bridge, which blocked 23
       * of its 27 plots, and moving the Vatican clear of St Peter's put it in the
       * Colosseum. A push that only looks at what it is pushing away from is a
       * push into whatever is behind it.
       *
       * If no bearing satisfies both, the settlement stays where it was and
       * stands in its own landmark. A worse settlement, not no settlement.
       */
      const home = slot.direction;
      let moved = false;
      for (let turn = 0; turn < 8 && !moved; turn++) {
        // 0, +45, -45, +90, ... so the straight-away bearing is always tried
        // first and the fallbacks stay as close to it as they can.
        const swing = (Math.ceil(turn / 2) * (turn % 2 === 0 ? -1 : 1) * Math.PI) / 4;
        const x = Math.cos(bearing + swing) * step;
        const z = Math.sin(bearing + swing) * step;
        let clear = true;
        for (const keepout of keepouts) {
          if (Math.hypot(x - keepout.x, z - keepout.z) < keepout.radius) clear = false;
        }
        if (!clear) continue;
        up.copy(home)
          .addScaledVector(across, x / PLANET_RADIUS)
          .addScaledVector(north, z / PLANET_RADIUS)
          .normalize();
        if (world.elevationAt(up) > 0) moved = true;
      }
      if (!moved) up.copy(home);
      frameAt();
    }

    const plan = planFor(slot.seed, slot.style, slot.radius, slot.place.pop, keepouts, corridors);
    const placed = plan.placed;

    // Two passes. The first works out the ground under every plot and throws
    // away the ones in the water or on a cliff; only then is the buffer sized,
    // because a settlement on a headland can lose half its plots to the sea and
    // an over-allocated buffer would ship the difference as zeroed triangles at
    // the origin.
    interface Standing {
      flat: FlatVariant;
      matrix: THREE.Matrix4;
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
    /**
     * The buildings whose windows came out lit, so the floor can carry what
     * falls out of them. Collected here for the same reason `built` is: the
     * plan is what was asked for and this is what stands.
     */
    const litPlots: LitPlot[] = [];

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

      // The relief under the corners, at the shelf the centre reported. The
      // shelf is per-ring and constant across a settlement; only the relief
      // varies, and it is 0.4 microseconds against `elevationAt`'s 3.6.
      const middle = reliefAt(scratch.x, scratch.y, scratch.z);
      let lowest = middle;
      let highest = middle;
      for (let corner = 0; corner < 4; corner++) {
        const angle = (corner / 4) * Math.PI * 2 + Math.PI / 4;
        directionAt(
          entry.plot.x + Math.cos(angle) * footprint,
          entry.plot.z + Math.sin(angle) * footprint,
          scratch,
        );
        const height = reliefAt(scratch.x, scratch.y, scratch.z);
        if (height < lowest) lowest = height;
        if (height > highest) highest = height;
      }
      if (highest - lowest > MAX_BURIAL * flat.height * entry.scale) {
        buried++;
        continue;
      }

      // Bedded to the lowest corner, so a building on a slope is cut into it
      // rather than standing on one leg. The burial is `highest - lowest`, which
      // the test above has just bounded against this variant's own height.
      //
      // **And a building stands on the floor, not beside it.** Every cell a
      // building comes up on is paved — `buildGround` starts its floor from
      // exactly this set — so a house that stayed at `elevationAt` while the
      // paving rose to `GROUND_LIFT` would be a house with its doorstep buried,
      // and at 1.5 units that is half a door. The two move together and the
      // relationship between them is the one it always was. A **tree** does not:
      // the greenery of a town stands in the green between the cells, and the
      // few that land on paving are trees in a pavement.
      const kind = KIND_OF.get(entry.partId);
      const standsOnFloor = kind === 'dwelling' || kind === 'block' || kind === 'civic';
      directionAt(entry.plot.x, entry.plot.z, scratch);
      local
        .copy(scratch)
        .multiplyScalar(
          PLANET_RADIUS + elevation - (middle - lowest) + (standsOnFloor ? GROUND_LIFT : 0),
        )
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
      if (standsOnFloor) built.add(cellKey(entry.plot.col, entry.plot.row));
    }

    /**
     * The last building, at the exact centre, when nothing else would stand.
     *
     * **Twenty of an 823-place sample built nothing at all, and all twenty are
     * the same failure: the grid is jittered and the centre of the town is
     * not.** `plots` wanders each plot up to 0.38 of a pitch from its cell, so
     * the plot nearest the middle of a one-plot village stands four or five
     * units off the anchor — which at Tromso, Hammerfest, Gaspe or Valdez is
     * four or five units out to sea, and at Linares or El Calafate is four or
     * five units up a slope too steep to bed a house into. The town then has
     * no plots left and is marked failed, which is a name on the map with
     * nothing under it: the one outcome a settlement builder must not have,
     * because a place that builds *badly* still reads as a place and a place
     * that builds nothing reads as a bug in the streamer.
     *
     * The centre is the one point that cannot fail. `places.bin` is baked with
     * every row checked to sit on land, and the monument step above re-checks
     * `elevationAt > 0` before it moves a settlement anywhere, so local
     * `(0, 0)` is on land by construction — and it is the ground the anchor,
     * the city light and the HUD's chip all already agree on.
     *
     * Two rules it deliberately breaks, and both are the point of it:
     *
     * - **No fit test.** It takes the region's smallest building outright,
     *   because "no plot here is wide enough" is exactly the case this exists
     *   for.
     * - **No burial test.** `MAX_BURIAL` refuses a house the ground behind it
     *   would swallow, which is right when there is another plot to try and
     *   wrong when there is not. A house cut into a mountainside is what a hill
     *   town looks like; an empty field is not.
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
      // The same fit rule the centre plot uses, and the same fallback: a town
      // too small for its own landmark gets a house instead of nothing.
      const mix = fitting(slot.style.civic, slot.radius * CIVIC_ROOM) ?? slot.style.buildings;
      let smallest: string | null = null;
      for (const entry of mix) {
        if (smallest === null || footprintOf(entry.item) < footprintOf(smallest)) smallest = entry.item;
      }
      const rng = rngFrom(slot.seed, 'lone-building');
      const flat = smallest === null ? null : variantOf(smallest, slot.style, rng.int(VARIANTS));
      if (flat !== null) {
        directionAt(0, 0, scratch);
        local
          .copy(scratch)
          // On the floor, like every other building; see the seating above.
          .multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(scratch)) + GROUND_LIFT)
          .sub(origin)
          .applyMatrix4(inverse);
        quaternion.setFromAxisAngle(AXIS_Y, rng.unit() * Math.PI * 2);
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
        built.add(cellKey(0, 0));
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
    const ground = buildGround(
      slot,
      built,
      pitchFor(slot.style),
      plan.core,
      plan.cleared,
      urbanityOf(slot.place.pop),
      litPlots,
    );
    slot.paved = ground.paved;
    slot.riverCut = plan.riverCut;
    slot.riverCells = ground.riverCells;
    // The floor, in the frame it was laid in, so a foot can find it. See
    // `Slot.floor` and `madeHeightAt`.
    if (ground.cells.size > 0) {
      const pitch = pitchFor(slot.style);
      let span = 0;
      for (const key of ground.cells) {
        const col = Math.floor(key / 1024) - 512;
        const row = (key % 1024) - 512;
        span = Math.max(span, Math.hypot((Math.abs(col) + 0.5) * pitch, (Math.abs(row) + 0.5) * pitch));
      }
      slot.floor = {
        up: up.clone(),
        across: across.clone(),
        north: north.clone(),
        field: { pitch, cells: ground.cells },
        cosBound: Math.cos((span + KERB_BLEND) / PLANET_RADIUS),
      };
      floors.add(slot);
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
      quaternion.setFromAxisAngle(AXIS_Y, rng.range(0, Math.PI * 2));
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

    /**
     * The town's own people, and what is parked at its kerbs.
     *
     * Appended to `standing` exactly as the lamps are, so they go into the one
     * merged buffer and cost the town **no draw call at all** — which is the
     * whole reason a settlement can hold fourteen people and the moving cast in
     * `src/life.ts` is capped at ninety across the entire world. It is the same
     * trade twice: still and many, or moving and few.
     */
    if (slot.peopled) {
      const urbanity = urbanityOf(slot.place.pop);
      const warmth = biomeAt(
        up.x, up.y, up.z, slot.place.lat, slot.place.lon,
        Math.max(0, world.elevationAt(up)), biomeSample(),
      ).warmth;
      const band = Math.max(0, Math.min(WARMTH_BANDS - 1, Math.floor(warmth * WARMTH_BANDS)));
      const regionId = slot.style.id;

      const wantFolk = TOWN_PEOPLE(urbanity);
      const spots = ground.folk.length / 3;
      // Nearest-the-centre first would put the whole crowd in the square; the
      // stride skips through the list instead, so a village's four people are
      // spread over its four streets rather than standing on one.
      const stride = Math.max(1, Math.floor(spots / Math.max(1, wantFolk)));
      let placedFolk = 0;
      for (let i = 0; i < spots && placedFolk < wantFolk; i += stride) {
        const rng = rngFrom(slot.seed, 'person', i);
        const flat = crowdVariant(regionId, band, rng.int(CROWD_BODIES));
        if (flat === null) break;
        local.set(ground.folk[i * 3]!, ground.folk[i * 3 + 1]!, ground.folk[i * 3 + 2]!);
        quaternion.setFromAxisAngle(AXIS_Y, rng.range(0, Math.PI * 2));
        scaleVector.setScalar(1);
        transform.compose(local, quaternion, scaleVector);
        standing.push({ flat, matrix: transform.clone(), glow: 0 });
        vertices += flat.position.length / 3;
        placedFolk++;
      }

      const style = trafficFor(slot.place.iso, continentOf.get(slot.place.iso) ?? '', slot.place.lat);
      // **A vehicle has to fit the town it is parked in, and the kit publishes
      // the number that says so.** A placed city bus is 20 units long against a
      // median built radius of 32, so a mix left unfiltered parks one bus across
      // two thirds of a village. The gate is the *placed* length against the
      // town's own radius, which is one rule instead of a list of which vehicles
      // a village may have.
      const longest = Math.max(12, slot.radius * 0.45);
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
        const flat = parkedVariant(style, rng.weighted(mix), rng.int(VARIANTS));
        if (flat === null) break;
        local.set(ground.kerbs[i * 4]!, ground.kerbs[i * 4 + 1]!, ground.kerbs[i * 4 + 2]!);
        quaternion.setFromAxisAngle(AXIS_Y, ground.kerbs[i * 4 + 3]!);
        scaleVector.setScalar(1);
        transform.compose(local, quaternion, scaleVector);
        standing.push({ flat, matrix: transform.clone(), glow: 0 });
        vertices += flat.position.length / 3;
        placedCars++;
      }
    }

    const groundVertices = ground.position.length / 3;
    const total = vertices + groundVertices;

    const position = new Float32Array(total * 3);
    const normal = new Float32Array(total * 3);
    const color = new Float32Array(total * 3);
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
        cursor += 3;
      }
      color.set(source.color, cursor - count);
      const written = count / 3;
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
    // `vertex` is the standing count by now, and the ground is the tail of the
    // buffer, so the pools land on exactly the vertices `buildGround` wrote
    // them for. This is the whole draw-call cost of the feature: none.
    glow.set(ground.glow, vertex * 2);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
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
    // units instead of sixteen thousand, where a float has 0.001 of precision
    // rather than 1.
    mesh.position.copy(origin);
    mesh.quaternion.setFromRotationMatrix(basis);
    group.add(mesh);

    slot.mesh = mesh;
    slot.triangles = total / 3;
    slot.parts = standing.length;
    // Three float triples and the two light bytes, which is what makes the whole
    // feature affordable: 38 bytes a vertex where it was 36.
    slot.bytes = total * (3 * 4 * 3 + 2);
  }

  function drop(slot: Slot): void {
    if (slot.mesh === null) return;
    group.remove(slot.mesh);
    // The geometry is this settlement's and nothing else holds it. The material
    // is one object shared by every town on the planet — disposing it would
    // blank all of them.
    slot.mesh.geometry.dispose();
    slot.mesh = null;
    slot.triangles = 0;
    slot.parts = 0;
    slot.paved = 0;
    slot.riverCut = 0;
    slot.riverCells = 0;
    // The floor goes with the mesh: nothing is standing here, so nothing stands
    // on it. Leaving it would be a plinth a player walks on over open ground.
    slot.floor = null;
    floors.delete(slot);
    slot.bytes = 0;
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

  function madeHeightAt(point: THREE.Vector3): number {
    madeDir.copy(point).normalize();
    let best = 0;
    // Only what is standing, which the streamer caps at `MAX_RESIDENT`: at
    // most 140 dot products, and it never touches the other 29,405 slots.
    for (const slot of floors) {
      const floor = slot.floor;
      if (floor === null) continue;
      if (madeDir.dot(floor.up) < floor.cosBound) continue;
      // Everything inside a settlement is within a few hundredths of a radian
      // of its centre, so the tangent components *are* the local coordinates —
      // the same identity `frameAt` leans on for the keepouts.
      const lift = floorLiftAt(
        floor.field,
        madeDir.dot(floor.across) * PLANET_RADIUS,
        madeDir.dot(floor.north) * PLANET_RADIUS,
      );
      if (lift > best) best = lift;
    }
    if (best <= 0) return 0;
    const elevation = world.elevationAt(madeDir);
    // A cell whose corners were on land can still cover a scrap of sea, and a
    // quay is where that happens. Standing on the water is the one failure
    // this whole surface exists to avoid, so the sea wins.
    if (elevation <= 0) return 0;
    return PLANET_RADIUS + elevation + best;
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
      // the town puts *past* its own built radius: `TRACK_REACH` is 45 units of
      // road running out towards the neighbours and a `block` tower is 34 tall.
      // Culling those is a track that stops in mid-air at the edge of the frame.
      const bound = slot.radius + TRACK_REACH + 40;
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
        // The crowd is baked into the merged buffer, so the only way to change
        // it is to build the town again.
        if (slot.mesh !== null) drop(slot);
      }
    }

    wanted = [];
    let triangles = 0;
    for (const candidate of candidates) {
      if (wanted.length >= residentCap) break;
      const slot = slots[candidate.index]!;
      // A settlement already standing knows what it costs; one that is not is
      // estimated from its plots, so the budget cannot be blown by the first
      // metropolis to arrive.
      const cost = slot.triangles > 0 ? slot.triangles : estimateTriangles(slot);
      if (triangles + cost > budget && wanted.length > 0) continue;
      triangles += cost;
      wanted.push(candidate.index);
    }

    const set = new Set(wanted);
    for (let i = 0; i < slots.length; i++) {
      if (!set.has(i)) drop(slots[i]!);
    }
    queue = wanted.filter((index) => slots[index]!.mesh === null);
  }

  /**
   * What a settlement will cost before it is built, in triangles.
   *
   * A count of plots times the mean cost of what stands on one. Only ever used
   * to decide whether to start, so it wants to be cheap and roughly right, not
   * exact — and the real number replaces it the moment the town exists.
   */
  function estimateTriangles(slot: Slot): number {
    const pitch = pitchFor(slot.style);
    const cells = (Math.PI * slot.radius * slot.radius) / (pitch * pitch);
    // 0.72 is the mean fill and 150 the measured mean triangles per part over an
    // 814-place sample (9 parts and 1,344 triangles for the median settlement).
    // The 14 is the ground: a paved cell is between 2 and 18 triangles
    // depending on how many streets cut it, plus a course of apron round the
    // outside at 2 each. Rough is all this has to be — it decides whether to
    // start, and the real number replaces it the moment the town exists.
    return Math.round(cells * (0.72 * 150 + 14));
  }

  return {
    group,
    stats,
    anchors,
    missing,
    broken,

    update(viewer, altitude, camera) {
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
        while (queue.length > 0 && performance.now() - began < allowance) {
          const index = queue.shift()!;
          const slot = slots[index]!;
          if (slot.mesh !== null) continue;
          raise(slot);
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

    nearest(point) {
      let best: { place: Place; distance: number } | null = null;
      for (const slot of slots) {
        if (!isShown(slot.place)) continue;
        const distance = slot.anchor.distanceTo(point);
        if (best === null || distance < best.distance) best = { place: slot.place, distance };
      }
      return best;
    },

    /**
     * Merged against instanced, on a real settlement, in one call.
     *
     * The choice between them is the only architectural question this file had
     * to answer that `placement.ts` does not, so the measurement stays in the
     * source rather than in a commit message. See `CLAUDE.md` for the numbers it
     * produced and for why the answer is not the obvious one.
     */
    compare(name = 'Paris') {
      const slot = slots.find((entry) => entry.place.name === name);
      if (slot === undefined) return { error: `no place called ${name}` };

      const wasResident = slot.mesh !== null;
      drop(slot);
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
      const plan = planFor(slot.seed, slot.style, slot.radius, slot.place.pop, [], []).placed;
      const buckets = new Map<string, number>();
      let instancedTriangles = 0;
      let instancedBytes = 0;
      const seen = new Set<string>();
      for (const entry of plan) {
        const flat = variantOf(entry.partId, slot.style, entry.variant);
        if (flat === null) continue;
        for (let piece = 0; piece < flat.pieces.length; piece++) {
          const key = `${entry.partId}:${entry.variant}:${piece}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
          const geometry = flat.pieces[piece]!.geometry;
          const count = geometry.index
            ? geometry.index.count
            : geometry.getAttribute('position').count;
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

      if (!wasResident) drop(slot);

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

    survey(step = 29) {
      const parts: number[] = [];
      const buildings: number[] = [];
      const paved: number[] = [];
      const triangles: number[] = [];
      const empty: string[] = [];
      const noBuilding: string[] = [];
      let planned = 0;
      let drowned = 0;
      let buried = 0;
      /** What the water cost, town by town. See `RiverCorridor` in `rivers.ts`. */
      const riverTowns: { name: string; cut: number; cells: number }[] = [];
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
      const stood = { sampled: 0, onFloor: 0, onKerb: 0, worstBelow: 0, worstAbove: 0 };
      const standDir = new THREE.Vector3();
      const began = performance.now();
      for (let i = 0; i < slots.length; i += step) {
        const slot = slots[i]!;
        const wasResident = slot.mesh !== null;
        const wasFailed = slot.failed;
        if (!wasResident) {
          slot.failed = false;
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
        if (slot.riverCut > 0 || slot.riverCells > 0) {
          riverTowns.push({ name: slot.place.name, cut: slot.riverCut, cells: slot.riverCells });
        }
        const floor = slot.floor;
        if (floor !== null) {
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
            const lift = made > 0 ? made - relief : 0;
            // Three answers and they have to be counted apart: on the paving,
            // on the kerb ramp — where being *under* `GROUND_LIFT` is the whole
            // point of the ramp — and off the town.
            const onFloor = lift >= GROUND_LIFT - 1e-9;
            if (onFloor) stood.onFloor++;
            else if (lift > 0) stood.onKerb++;
            // The two ways this can be wrong: standing under the paving, which
            // is the bug it exists to delete, and standing over it, which would
            // be a man on stilts.
            if (onFloor && relief + GROUND_LIFT - stand > stood.worstBelow) {
              stood.worstBelow = relief + GROUND_LIFT - stand;
            }
            const above = stand - (relief + GROUND_LIFT);
            if (above > stood.worstAbove) stood.worstAbove = above;
          }
        }
        if (!wasResident) {
          drop(slot);
          slot.failed = wasFailed;
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
        builtNothing: empty.length,
        builtNoBuilding: noBuilding.length,
        emptyNames: empty.slice(0, 40),
        noBuildingNames: noBuilding.slice(0, 40),
        // What a river costs a town, and the worst of them.
        townsOnARiver: riverTowns.length,
        lostToTheWater: riverTowns.reduce((a, b) => a + b.cut, 0),
        floorCellsToTheWater: riverTowns.reduce((a, b) => a + b.cells, 0),
        worstOnARiver: [...riverTowns]
          .sort((a, b) => b.cut + b.cells - (a.cut + a.cells))
          .slice(0, 8)
          .map((entry) => `${entry.name} ${entry.cut}+${entry.cells}`),
        // And where a foot lands on what was built. See `stood`.
        standing: stood,
        surveyMs: Math.round(performance.now() - began),
      };
    },
  };
}
