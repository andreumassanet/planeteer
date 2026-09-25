import * as THREE from 'three';
import { MOSAIC_LAND, PALETTE } from '../theme.ts';
import { rngFrom } from './random.ts';
import type { RegionId } from './regions.ts';

/**
 * What a settlement stands **on**.
 *
 * The kit had houses, trees and rocks and no ground: a village was a dozen
 * objects on the same unbroken lawn the countryside is made of, and from two
 * hundred units up that reads as boxes dropped on a field rather than as a
 * place. Nothing in `regions.ts` could fix it, because every entry there
 * describes a *thing that stands* and the missing half is the surface between
 * them.
 *
 * **This is a separate file from `regions.ts` on purpose and the reason is
 * mechanical, not conceptual.** A blind collision between two concurrent edits
 * of one 640-line table is the kind nobody can untangle afterwards. It is keyed
 * on `RegionId` and read through `groundStyleFor`, so folding it into
 * `RegionStyle` later is a rename and nothing else.
 *
 * The three rules it exists to keep:
 *
 * 1. **A town stands on its region's road.** The yards, the streets and the
 *    slope round the edge are all `road` since 2026-09-13, so a town reads as
 *    one made base and a carriageway arriving runs on into it. It was the
 *    local dirt, trodden and pulled towards a paving colour, until the town
 *    square landed that same day, and a paving colour of its own for the few
 *    hours after; `buildGround` in `settlements.ts` has the verdict on each.
 * 2. **`hardness` says how much of what you stand on was *made*** — 0.15 is a
 *    swept clearing, 0.9 is asphalt to the last house — and since the floor
 *    stopped being blended out of the dirt, what it still decides is how many
 *    lamps a town's streets get.
 * 3. **Colours come out of `PALETTE` and nowhere else.** The town mesh is
 *    vertex-coloured, so nothing here goes through `ctx.toon` and nothing
 *    throws on an off-palette value. That makes it the one place in the kit
 *    where a stray hex would survive, so it is the one place worth saying it.
 */
export interface GroundStyle {
  /** How much of the ground was made rather than trodden. 0 dust, 1 stone. */
  hardness: number;

  /**
   * The carriageway, and since 2026-09-13 the whole floor of the region's
   * towns, which were a `paving` colour of their own until then.
   *
   * **A dark neutral here is invisible and it took a screenshot to see why: in
   * a cel-shaded world a dark grey on a light grey ground is exactly what a
   * *shadow* looks like.** Kyoto's first streets were `steel` on `bone` and the
   * town read as a pale slab with smudges on it — the eye files every dark band
   * as the shade of the building beside it, because that is what dark bands in
   * this scene have always been. The road has to be told apart from shade, and
   * shade is dark and neutral, so a road is either **pale** (a dust or stone
   * road through a green or a dark town) or **dark and strongly hued** (a
   * shadowed alley cut into pale desert render). Never a neutral a shade off
   * the ground it runs through.
   */
  road: number;
  /**
   * The pavement: a strip `SIDEWALK` wide along each side of a town's street,
   * and the stone its retaining walls and steps are built of (2026-09-17).
   */
  walk: number;
  /**
   * What a yard is, the ground of a cell no street crosses: `land`, the ground
   * the town stands in (a lawn in a green country, snow on a glacier); `earth`,
   * that ground trodden (`trodden`); or `paved`, the pavement's own stone. The
   * embankment round the town is the land's in every case.
   */
  yard: 'land' | 'earth' | 'paved';
  /**
   * Whether the carriageways carry a painted centre line: a dashed white line
   * down every street at least `MARKED_STREET` wide, and down the ribbon between
   * towns (`roads.ts`). An unpaved region's roads are not marked.
   */
  marked: boolean;
  /** The one piece of ground that is definitely made: in front of the civic building. */
  plaza: number;
  /**
   * How big a block is, in plot cells: the street lattice runs every `lanes`
   * boundaries.
   *
   * 2 is a street either side of every house, which at a 13-unit pitch is a
   * medina — many streets, close together. 4 is a suburb: one road serving four
   * houses by four. It is the *spacing*, and `street` below is the width, and
   * the two together are the whole difference between a medina and a subdivision.
   * Getting them the same way round is the point: narrow and close is not the
   * same as wide and far apart, and one number cannot say both.
   *
   * A settlement too small to hold the lattice is forced down to 2 by
   * `settlements.ts` — a hamlet two cells across with a period of four gets no
   * street at all, which is worse than a wrong-sized one.
   */
  lanes: 2 | 3 | 4;

  /**
   * Width of the carriageway, in **world units** — not in pitches.
   *
   * **The first version made it a fraction of the plot pitch and that is the
   * wrong unit**, because the two things it has to clear are both absolute: the
   * person walking down it, and the eaves of the houses either side,
   * which are the parts' own declared footprints and do not scale with the
   * pitch either. A fifth of east-asia's 13-unit pitch is 4.2 units, which
   * disappeared under the machiya overhanging it; the same fifth of North
   * America's 20.8 is 8.3 and reads from the air. One fraction cannot be right
   * in both places and a width can.
   *
   * So: 6.0 is an alley you walk down single file, 9.75 a street, 15 a road
   * with something driving on it. `settlements.ts` converts to a share of the
   * cell and caps it at 0.3 either side, past which the street would be eating
   * more of the plot than the plot has to give.
   *
   * **Every number in the table is 1.5 times what it was, and the multiplier
   * belonged to the vehicles rather than to the roads.** While `src/traffic/`
   * was placed at twice its authored scale (until 2026-09-24) a hatchback was
   * 4.44 across, and a 4.0-unit Maghrebi alley was narrower than the car parked
   * in it. The vehicles are placed at 1.35 times it now, 3.00 across, and the table
   * was left where it is: at the nominal pitch of 12 (`TOWN_PITCH`) the cap
   * below gives 7.2, the width every road class came down to, so the table
   * decides a street's width only where it asks for less than that.
   *
   * **The 0.3 cap now binds in the tight-pitched regions, and that is the table
   * working rather than failing.** The share is `street * 0.5 / pitch`, so a
   * street can never take more than 0.6 of a plot pitch: east-asia's 9.75
   * against a 13-unit pitch asks for 0.375 and gets 0.3, an effective 7.8 —
   * one placed car with room to walk past it while cars were placed at twice
   * their scale, which is what a machiya street is. The regions where it does not bind are the ones with room to give:
   * north-america's 15 against a 20.8 pitch asks for 0.36 and also caps, and
   * nordic's 10.5 against 19.5 does not.
   */
  street: number;
}

// ---------------------------------------------------------------------------
// The floor's vertical section: how a town's ground sits on the land
// ---------------------------------------------------------------------------

/**
 * How far above `elevationAt` the paving is laid, in world units.
 *
 * **This number is a fight between two surfaces that do not agree, and it
 * cannot be won, only priced.** `elevationAt` is where the player's feet go —
 * shelf plus `reliefAt`, an exact smooth function. The land mesh is a
 * *piecewise-linear* approximation of the same thing, refined until an edge's
 * midpoint is within `RELIEF_SAG` (3 units) of the chord, so between vertices
 * it is a plane where the truth is a curve. A sheet laid at `elevationAt` is
 * therefore under the visible ground wherever the mesh's linearisation
 * overshoots.
 *
 * Measured, sampling 11,754 points inside the built radius of 529 real
 * settlements, `mesh - elevationAt`: median **-0.16**, p75 +0.02, p90 +0.53,
 * p99 +1.94, worst +5.11 (Santiago). Positive is the mesh standing over the
 * feet, which is paving you cannot see. The share of ground that buries a sheet
 * laid at a given lift:
 *
 * ```
 *   lift   0.10   0.25   0.50   0.70   1.00   1.50   2.00
 *   lost   20.9%  15.8%  11.0%   8.4%   5.3%   2.2%   0.9%
 * ```
 *
 * And it is not scattered: a settlement is 20 to 200 units across against mesh
 * triangles up to 267, so a town usually sits inside *one* triangle and the
 * sign is constant over the whole of it. The failure is not a moth-eaten
 * pavement, it is one town in twelve with no visible paving at all.
 *
 * Going higher costs the other side: the player stands at `elevationAt`, so a
 * lift is exactly how far the avatar's soles sink into its own pavement. It is
 * *inside the disagreement the world already has*, which `pnpm check` measures at
 * 0.49 units mean and 4.78 worst between the mesh and where the feet go, so it
 * adds no error class that was not already there — but it is not free, and at
 * 0.7 it was already an ankle.
 *
 * **It is 1.0 since 2026-09-06, and both halves of that number were measured
 * rather than chosen.** A town is meant to stand on a slightly raised surface
 * with the roads arriving at it, and the raise is only affordable at all
 * because `KERB_DROP` gives the floor a side: a sheet lifted further with no
 * side to it shows daylight under its edge. The two are one decision.
 *
 * How much seam a lift buys, measured by `pnpm check` over the **157,796 land
 * triangles that fall inside a settlement** — the mesh standing over the paving,
 * which is the straight line drawn across a town (2026-09-06):
 *
 * ```
 *   lift   0.10    0.25   0.50   0.70   1.00   1.25   1.50   2.00
 *   over  36.41%  17.56%  1.82%  0.74%  0.42%  0.28%  0.17%  0.07%
 * ```
 *
 * That is a different measurement from the table above — triangles of the
 * *shipped* mesh rather than points sampled over the built radius, and taken
 * after `detailRadiusFor`'s floor of 20 units tightened the refinement under the
 * small towns — and it is the one to move this number against, because it is the
 * one `pnpm check` re-runs. The knee of it is between 0.5 and 1.0.
 *
 * **It was 1.0 and what capped it there has been deleted.** The cap was the
 * avatar: the player's feet were at `elevationAt` and the paving was not, so the
 * lift was exactly how deep he waded through his own high street, and `FIGURE`
 * put the ankle at 0.4 and the knee at 1.66 while he was 6.8 units tall. He stands *on* the floor now —
 * `madeHeightAt`, and `player.ts` takes the higher of the two surfaces — so the
 * number is free to be what the town wants it to be instead of what the wading
 * would bear.
 *
 * **And what the town wants is to be visibly on something.** The reference was
 * a picture of a cottage on a plinth with a straight grey wall under it: no
 * gentle rise, not a hill, a base that marks off what is a town. At 1.0 with a
 * 0.8 kerb the side of the town is 1.8 units against the 6.8-unit avatar of the
 * time — a step, not a plinth, and from any distance at all it is a colour
 * change. 3.0 puts the visible face at `GROUND_LIFT + KERB_DROP` = 3.8, which
 * was 56% of that avatar and is about a third of a house: the proportion in the
 * reference picture, read off it rather than guessed. Since a person came down
 * to 3.77 units (2026-09-24) the face is about his height; the lift stayed, because
 * what it answers is the mesh's error against the relief, not the body.
 *
 * **And on 2026-09-13 the wall was reversed, and the lift kept.** The plinth
 * did its job — a town reads as a made thing from any distance — but a straight
 * wall round a square is a box rising out of the landscape all at once, and on
 * uneven ground it looks worse still. So the outer edge, and only the outer
 * edge, is a small slope now, at the road shoulders' idea and the old collision
 * ramp's gradient (`EDGE_RUN`), and the 3.0 stays: the slope is what the side
 * of the plinth became, not a reason for it to be lower. The risers *between*
 * terraces inside a town are still walls, and a street that crosses one gets a
 * ramp, or a flight of steps where it has no room for one (`floor.ts`).
 *
 * The two costs it does have are both paid elsewhere and worth naming. A body
 * *outside* the town climbs it up the edge slope, which is drawn and which
 * `floorLiftAt` reads, and a road arriving has to get up it, which is what the
 * ribbon's own ramp to its gate is for (`crownLift` in `roads.ts`).
 *
 * **A blur was tried and measured and does not work.** If the mesh is
 * `reliefAt` low-passed, then low-passing `reliefAt` the same way should
 * predict it. Over 9,001 samples, stepping the relief a fraction `b` toward the
 * mean of a ring of radius `r`: at r=40 b=0.25 the p90 improves from 0.53 to
 * 0.47 and the worst case gets *worse*, 4.65 to 3.73 at best and 15.6 at b=1;
 * every larger radius is worse at every weight. The reason is that the
 * refinement is error-driven — the mesh is already fine wherever the relief is
 * curved — so the residue is not a low-pass and a blur only damages the
 * mountains.
 */
export const GROUND_LIFT = 3.0;

/**
 * How tall one step of a town's platform is, in world units.
 *
 * **A town is a flat surface and the world is not, so a town on a hillside has
 * to be a staircase of flat surfaces.** The platform raises the question that
 * follows from it — what to do with the towns on slopes, which overlap the
 * mountain they stand on — and there are only three answers: tilt the platform,
 * which is not a platform; refuse the town, which deletes Huesca, Bern,
 * Innsbruck, Quito and Santiago along with 14.6% of everything built; or cut
 * the hill into steps, which is what a hill town on this planet has always
 * actually been.
 *
 * The relief under a built town's own footprint, over the 9,734 that stand
 * (2026-09-07): the median varies by **4.0 units** across the whole town, the
 * p75 by 9.2, the p90 by 18.2 and Huesca by 36.7. So half the world is inside
 * one step whatever this number is, and gets a single flat plinth exactly as it
 * did before terracing existed — the staircase only appears where the ground
 * actually falls.
 *
 * **4 units**, which was a little over half the avatar while he was 6.8 units
 * (it is 1.8 people since 2026-09-24) and a hair over what the
 * plinth's own face was when it had one (`GROUND_LIFT + KERB_DROP` = 3.8), so a
 * riser inside the town reads as the same kind of wall the town's edge used to
 * be. Smaller and a hillside town is a flight of shallow stairs with a wall
 * every cell; larger and the cut at each riser is deeper than the buildings
 * standing on it. A street that crosses one gets a ramp at `STREET_GRADE` over
 * the level street either side, or where that is too short a flight of steps
 * of `STEP_RISE` (`floor.ts`), thirteen of them to a `TERRACE_STEP`.
 */
export const TERRACE_STEP = 4;

/**
 * The steepest the ribbon climbs to a gate, as rise over run, over whatever
 * the relief under it is doing (`rampOf` in `roads.ts`): 0.3, 17 degrees,
 * about the steepest road a car is driven up. Here beside `STREET_GRADE`,
 * the town street's, because the two are one road seen either side of a kerb.
 */
export const RAMP_GRADE = 0.3;

/**
 * The steepest a town street's ramp across a riser may be (`floor.ts`), as rise
 * over run.
 *
 * **Steeper than the ribbon's `RAMP_GRADE`, because a street has no room and a
 * road has the whole country.** A riser is a `TERRACE_STEP` of 4 or more, and
 * a street crossing one has the level run of street either side of it to ramp
 * in: in a town three cells a side on a hill, the arm of an avenue between its
 * middle crossing and its gate, a cell less the gate's mouth, 9 units at the
 * common pitch. At 0.3 that ramps nothing and every such town kept its main
 * street on stairs; at 0.45, 24 degrees — a steep hill-town street, and a car
 * still climbs it — it ramps. Every ramp is then spread over all the level run
 * it has (`buildFloor`), so most come out far gentler: measured over the 9,796
 * built towns (2026-09-25), 89% of the risers a street crosses are one terrace,
 * 8% two and 2% three or more, and a riser the run is too short for keeps a
 * flight of steps, which a car does not drive.
 */
export const STREET_GRADE = 0.45;

/**
 * The steepest a town street's ramp may be where its level run is too short
 * for `STREET_GRADE`: 0.6, 31 degrees, a short steep pitch a car takes in
 * first gear, and still a ramp rather than a flight of steps. Only a riser the
 * run cannot take even at this keeps its stairs.
 */
export const STREET_STEEPEST = 0.6;

/**
 * How deep a town may cut one cell of its lattice into the hill, in world units.
 *
 * **This is the refusal, and it is stated as a depth rather than as a gradient
 * because what you see is the wall.** A cell is cut to one level surface, so the
 * face it shows on its low side is the drop across it plus the plinth — and a
 * drop is measured in people whatever the pitch of the lattice happens to be,
 * while a gradient is not: at the kit's own range of pitches, 12.6 to 20.9, one
 * gradient is two different walls.
 *
 * It capped the visible face at `MAX_CUT + GROUND_LIFT + KERB_DROP` while the
 * town's edge was a wall; since the edge became a slope (2026-09-13) the same
 * cut is the height of the embankment on the town's low side, or of the riser
 * where a lower terrace is next door. **It was chosen against what the rule
 * deletes rather than against what it allows.**
 * Measured over the 9,734 built towns at the European pitch of 12.65, counting
 * the cells inside each town's own radius (2026-09-07):
 *
 * ```
 *   MAX_CUT     6      8     12     16     24
 *   cells      13.0%  8.7%   4.2%   2.0%   0.4%   refused
 *   towns       7.3%  5.1%   2.4%   1.0%   0.2%   with nothing left at all
 *   wall        9.8   11.8   15.8   19.8   27.8   units, worst case
 * ```
 *
 * A town with nothing left falls back to the single building at its centre —
 * see `built.size === 0` in `raise` — so that column is the count of places
 * that come out as one hut on a mountainside, and it is the cost that matters:
 * the failure being fixed was a town *overlapping* a mountain, and a town
 * deleted by a rule meant to fix that is the same failure wearing the other
 * hat.
 *
 * **12 units**, where the wall is 15.8 — seven people (2.3 of the 6.8-unit
 * avatar when this was set), a retaining wall a hill
 * town really has — and 234 places of 9,734 come out as one building. At 8 it
 * was 493, and Huesca (the town that showed the overlap) kept 3 of its 9 cells
 * against 6 at 12, on three terraces instead of one. Above 16 the wall is
 * taller than the houses standing on it.
 *
 * A cell steeper than this is not paved and nothing is built on it. `survey`
 * counts both the cells and the towns.
 *
 * **Since one level a street (2026-09-13) it bounds the cut and not the wall.**
 * A cell is cut to its street's level (`cellLevel` in `grid.ts`), which is its
 * own or a higher one where a cell across the street stands higher, so the
 * face on its low side can be taller than the 15.8 above: 29.96 at the worst
 * cell that is not a gate's, at Guayaquil, and 509 of them over 19 across the
 * built world.
 */
export const MAX_CUT = 12;

/**
 * How far a vertical face on the town's outside runs below `elevationAt`, in
 * world units: the quay, which is the one outer edge that is still a wall.
 *
 * **The town's edge was a plinth from 2026-09-06 to 2026-09-13, a top and a
 * side**, and this was the side's foot: a vertical band round the whole floor
 * from the paving down to 0.8 under the ground, and an apron (`APRON_SINK`,
 * 3.2) carried on from there down into the land. Both went when the edge became
 * a slope (see `GROUND_LIFT` and `EDGE_RUN`): the edge slope starts on the
 * paving and dives under the ground by `EDGE_FOOT` on its own, so it has no
 * foot to hide and no apron behind it.
 *
 * What is left is the sea. A paved cell whose neighbour stands in the water is
 * a quay, and a slope down to the water is a beach, which is a different thing:
 * so it keeps its face, down to this far under the ground at each end of the
 * edge — under the water, where `cornerAt` puts a sea corner. The same face
 * closes the side of a slope that runs up against a quay or a landmark and has
 * nothing beside it.
 *
 * 0.8 below the ground rather than 0 because the mesh is a linear
 * approximation of the relief and sits under it as often as over it — median
 * `mesh - elevationAt` is **-0.16** — so a face that stopped exactly at
 * `elevationAt` would hang in the air over half the quays on the planet.
 */
export const KERB_DROP = 0.8;

/**
 * How far out from the kerb line the edge slope meets level ground, in world
 * units.
 *
 * **The town's outside edge is a slope since 2026-09-13, and this is how long
 * it is.** It reverses the plinth wall of 2026-09-07 (see `GROUND_LIFT`): a
 * square that rises out of the land all at once reads as a box set down on it,
 * and a small slope on the outer edges only, like a road's shoulders, lets it
 * sit in the land. The slope is one course of cells laid from the paving's own
 * top at the kerb line down to `edgeSink` under the ground at the far side of
 * the course; `edgeSink` in `floor.ts` is solved so that on level ground it
 * crosses the ground exactly this far out.
 *
 * **9 is the number this constant had when it was `KERB_BLEND`, and the
 * gradient is the reason it did not move.** The old constant was the width of
 * an *undrawn* ramp: the kerb was a vertical face, and the player was given a
 * band of approach to climb it in so that the floor did not switch on in one
 * frame — the one place in the world the standing surface was not the drawn
 * one. Three times the rise, a gradient of 0.33, 18 degrees: the steepest thing
 * a body walks up without noticing, which is what a small slope has to be here.
 * So the ramp that was collision is geometry now, at the same gradient, and
 * `floorLiftAt` reads the geometry. At `WALK_SPEED` (6.5 units/s since
 * 2026-09-24) the climb takes about 1.4 s; it took 0.2 at the old 45.
 *
 * It is a *run on level ground* and not a promise of a gradient everywhere:
 * where the land outside falls away the slope still ends one course out, so it
 * gets steeper — an embankment down to the field rather than a ledge standing
 * over it — and where the land outside rises above the paving it is a bank
 * that meets the hill and goes under it. See `buildFloor`.
 */
export const EDGE_RUN = 9;

/**
 * How wide a town's pavement is along each side of a street, in world units, at
 * most: a narrow street keeps 0.7 of its half for the carriageway, so a
 * Mediterranean lane's 3.75 is 1.1 of pavement and 2.6 of road.
 *
 * **The town's floor is a street plan since 2026-09-17**, replacing a base of
 * one road colour, platform and carriageway alike, that read as crude, and it
 * takes its section from two CC0 road packs, Kenney's City Kit (Roads) and
 * Quaternius's Modular Streets. Those are tiles, and a town here is not a tile
 * grid it can be laid from: its streets are bands of cells a terrace cuts and a
 * flight climbs, and its roads are curves. So what the packs lend is their
 * section, drawn into the floor the town already lays: an asphalt carriageway
 * with a dashed centre line, a pale pavement either side, and the yard behind
 * it (`GroundStyle.yard`). The surface a foot stands on is unchanged — the
 * pavement is flush, a colour and not a kerb — so `floor.ts` and everything
 * that reads it are untouched.
 *
 * 2.2 was a third of the avatar while he was 6.8 units: one person, and a lamp
 * standing in it. Since 2026-09-24 it is 0.58 of a 3.77-unit person, and one
 * person 1.44 across the shoulders walks down it with room either side; at
 * the 2.22 he was earlier that day, two walked abreast.
 */
export const SIDEWALK = 2.2;

/**
 * The pavement of a street `half` wide either side of its line: `SIDEWALK`,
 * or 0.3 of the half where that is less. One definition, because the town
 * draws it and the road arriving at a gate carries it out along its approach
 * (`gateMouth` in `grid.ts`).
 */
export function pavementOf(half: number): number {
  return Math.min(SIDEWALK, half * 0.3);
}

/** Half the width of a painted line, in world units: 0.6 across, about 2 pixels at 60 units. */
export const LINE_HALF = 0.3;

/**
 * The period of a town street's dashed line: a dash this long, then a gap this
 * long. Taken from the town's own plane coordinates, so a street's dashes run
 * on across the cells it crosses.
 */
export const DASH = 4;

/**
 * How wide a street must be before it is marked: two placed hatchbacks, 3.00
 * each (`PLACED_SECTION`), and a little. A street at the common pitch is 7.2 and is marked, as the road
 * that arrives in it is; the narrow alleys of the Maghreb and the Middle East
 * are not.
 */
export const MARKED_STREET = 7;

/** How deep a zebra crossing is, in from the mouth of a town's middle crossing, in world units. */
export const ZEBRA = 3;

/** How wide one stripe of a zebra is, and one gap, in world units. */
export const ZEBRA_STRIPE = 0.9;

/**
 * Cell and corner keys for a settlement's own lattice.
 *
 * One definition, in the file that owns the floor's vertical section, because
 * three things now index it: `buildGround` builds the paved set, `raise` marks
 * the cell a building came up on, and `floorLiftAt` asks which cell a point is
 * in. A settlement is never more than 9 cells from its centre, so ±512 is
 * generous by two orders of magnitude.
 */
export function cellKey(col: number, row: number): number {
  return (col + 512) * 1024 + (row + 512);
}

/**
 * The field a point query reads — `FloorField`, `floorLiftAt` and the builder
 * both of them share — is in `floor.ts`, which reads the constants above.
 */

const P = PALETTE;

/**
 * The table.
 *
 * Read `road` against what it has to be told apart from — which, since it
 * became the whole of a town's floor (2026-09-13), is not a yard any more but
 * the land round the town and the shade on it: a pale road through green and
 * dark country, a brown one through pale desert render, and never a neutral a
 * shade off the ground it runs through (see `road`). The lightness of the
 * palette entries this leans on, for checking a new row:
 *
 * ```
 *   cream .93   sand .78   bone .77   green .58   tan .55   brown .49
 *   clay .49    olive .43  steel .28  bark .27    darkOlive .27
 * ```
 *
 * `steel` appears exactly once, in the polar row, where the ground it runs
 * through is nearly white.
 */
export const GROUND_STYLES: Record<RegionId, GroundStyle> = {
  // Asphalt and a pale pavement, and the houses stand in their own gardens.
  nordic: { hardness: 0.35, road: P.slate, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 3, street: 10.5 },
  'atlantic-europe': { hardness: 0.6, road: P.slate, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 3, street: 9.75 },
  'east-europe': { hardness: 0.5, road: P.slate, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 3, street: 9.75 },
  // Pale stone to the doorstep, and the square is lime-washed like the walls around it.
  mediterranean: { hardness: 0.6, road: P.slate, walk: P.cream, yard: 'paved', marked: true, plaza: P.white, lanes: 2, street: 7.5 },
  // Beaten earth between the walls: a medina is not paved, it is swept — and its
  // lanes are the narrowest and the closest together in the table, which is the
  // whole of what a medina is from above. They read *dark* because an alley
  // between two-storey walls is in shadow most of the day.
  maghreb: { hardness: 0.4, road: P.brown, walk: P.sand, yard: 'earth', marked: false, plaza: P.cream, lanes: 2, street: 6 },
  'sub-saharan': { hardness: 0.3, road: P.brown, walk: P.sand, yard: 'earth', marked: false, plaza: P.sand, lanes: 3, street: 8.25 },
  'middle-east': { hardness: 0.45, road: P.brown, walk: P.sand, yard: 'paved', marked: false, plaza: P.cream, lanes: 2, street: 6.9 },
  'south-asia': { hardness: 0.45, road: P.slate, walk: P.bone, yard: 'earth', marked: true, plaza: P.cream, lanes: 3, street: 8.25 },
  'east-asia': { hardness: 0.55, road: P.slate, walk: P.bone, yard: 'paved', marked: true, plaza: P.cream, lanes: 3, street: 9.75 },
  // Wet ground under stilts. What hard standing there is, is a plank and a path.
  'southeast-asia': { hardness: 0.3, road: P.brown, walk: P.sand, yard: 'land', marked: false, plaza: P.sand, lanes: 3, street: 8.25 },
  // Roads between lots, which is what a suburb is: the widest road on the
  // planet, on the widest pitch in the kit, and a lawn in front of every house.
  'north-america': { hardness: 0.45, road: P.slate, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 4, street: 15 },
  'latin-america': { hardness: 0.5, road: P.slate, walk: P.cream, yard: 'paved', marked: true, plaza: P.white, lanes: 3, street: 9.75 },
  oceania: { hardness: 0.45, road: P.slate, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 4, street: 14.25 },
  // Nothing grows, so there is no lawn to lose: the ground is already bare rock,
  // and it is the one place pale enough for a dark road to read as a road.
  polar: { hardness: 0.45, road: P.steel, walk: P.bone, yard: 'land', marked: false, plaza: P.white, lanes: 4, street: 12 },
};

const DEFAULT_GROUND: GroundStyle = GROUND_STYLES['atlantic-europe'];

export function groundStyleFor(region: string): GroundStyle {
  return GROUND_STYLES[region as RegionId] ?? DEFAULT_GROUND;
}

// ---------------------------------------------------------------------------
// Turning the local dirt into a town's floor
// ---------------------------------------------------------------------------

const hsl = { h: 0, s: 0, l: 0 };

/** Hue of `PALETTE.brown`, which is what earth is in this palette. */
const EARTH_HUE = 0.0917;

/** Signed distance from `h` to `to` on the wheel, the short way round. */
function towards(h: number, to: number): number {
  let delta = to - h;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

/**
 * The same ground with the life walked out of it: **soil, not short grass.**
 *
 * **This was `setHSL(h, s * 0.5, l * 0.92)` and it was half a law.** The
 * argument for it still holds and is why there is no fixed brown here: pick one
 * and Norway and Mali get the same dirt, which is the exact failure `biome.ts`
 * exists to prevent. What it got wrong is that halving the saturation of a green
 * leaves a *desaturated green*, and the eye has a name for desaturated green —
 * it is mown grass. The first thing anyone said about the finished towns was
 * that the roads were paved and the paths between them were lawn.
 *
 * Bare earth is a **hue** shift as much as a saturation cut, so the hue moves
 * most of the way to `brown` and the rest of the colour stays where the biome
 * put it. That keeps the whole of the original argument: the lightness and the
 * saturation still come from the ground, so Mali's dirt is a pale warm dust and
 * Norway's a dark cool loam and the Sahara's is nearly sand, while none of the
 * three is grass. The hue is a lerp rather than a clamp because a clamp leaves
 * anything more than its own width away from brown *stuck* at the boundary —
 * which is every green on the planet, which is the case this is for.
 */
export function trodden(base: THREE.Color, target: THREE.Color): THREE.Color {
  target.copy(base).getHSL(hsl);
  return target.setHSL(
    (hsl.h + 0.78 * towards(hsl.h, EARTH_HUE) + 1) % 1,
    hsl.s * 0.62,
    hsl.l * 0.94,
  );
}

/**
 * Unmade ground: a dirt track, and the ends of things.
 *
 * `trodden` is a yard — ground that is walked on and has stopped growing. This
 * is the next step along the same axis: a track of earth, not of grass. A dirt
 * road is not a made road that has faded, and it is not a lawn stripe; it is
 * earth, and earth is darker and browner than the field it crosses rather than
 * paler and greyer.
 *
 * The three surfaces the kit now distinguishes, in order of how made they are:
 * `GroundStyle.road` (a carriageway, and it keeps its colour the whole way),
 * `dirt` (a track), and `trodden` (a yard). A track that degrades degrades to
 * the middle one.
 */
export function dirt(base: THREE.Color, target: THREE.Color): THREE.Color {
  target.copy(base).getHSL(hsl);
  return target.setHSL(
    (hsl.h + 0.95 * towards(hsl.h, EARTH_HUE) + 1) % 1,
    Math.max(0.16, hsl.s * 0.78),
    hsl.l * 0.78,
  );
}

/**
 * The mosaic, on the town's side of it.
 *
 * The land is a mosaic of cells in the fragment shader — see `HEX_CELL` in
 * `globe.ts` — and a settlement's floor is its own mesh, lit by its own
 * program, so a flat plate of paving laid on that ground is the one surface
 * in the view with no grain, and it reads as a plate. The paving is already
 * made of cells: the jittered plot lattice, with the streets as bands of the
 * cell. Each one takes a tone of its own here, on the CPU at build time,
 * drawn from the same `MOSAIC_LAND` the shader uses and seeded off the town
 * and the cell so a town looks the same on every load. One octave, where the
 * land has two: a town is at most 150 units across and the super-cell the
 * land's second octave exists for is 48.
 *
 * It returns the factor rather than a colour because a cell is drawn in up to
 * nine pieces — the plot, its street bands, the corner where two streets
 * cross — and an apron cell carries a different colour on each corner. All of
 * them are one cell and take one tone.
 */
export function cellTone(seed: string, col: number, row: number): number {
  return rngFrom(seed, 'mosaic', col, row).range(MOSAIC_LAND[0], MOSAIC_LAND[1]);
}
