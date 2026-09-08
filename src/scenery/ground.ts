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
 * mechanical, not conceptual.** Two agents were writing the kit at once and a
 * blind collision inside one 640-line table is the kind nobody can untangle
 * afterwards. It is keyed on `RegionId` and read through `groundStyleFor`, so
 * folding it into `RegionStyle` later is a rename and nothing else.
 *
 * The three rules it exists to keep:
 *
 * 1. **The paving sits on the local dirt rather than replacing it.**
 *    `globe.ts`'s `groundColorAt` is the one definition of what colour the land
 *    is at a point, biome and country tint both, and every colour here is
 *    blended against it. A Malian compound is beaten sand and a Norwegian yard
 *    is grey gravel because the ground under them already is.
 * 2. **`hardness` is the whole regional signal and it is one number.** It says
 *    how much of what you stand on was *made*: 0.15 is a swept clearing, 0.9 is
 *    asphalt to the last house. Everything else — the colours, the plaza, how
 *    much of the town is street — follows it or is a small correction to it.
 * 3. **Colours come out of `PALETTE` and nowhere else.** The town mesh is
 *    vertex-coloured, so nothing here goes through `ctx.toon` and nothing
 *    throws on an off-palette value. That makes it the one place in the kit
 *    where a stray hex would survive, so it is the one place worth saying it.
 */
export interface GroundStyle {
  /** How much of the ground was made rather than trodden. 0 dust, 1 stone. */
  hardness: number;
  /**
   * What the ground between the houses is made of, as far as `hardness` takes
   * it from the local dirt.
   *
   * It is a *target*, not the colour: the yard you see is the biome's own dirt
   * with the life walked out of it, moved this far towards the region's own
   * surface. That is why two thirds of this column is `tan` and the world is not
   * two thirds tan.
   */
  paving: number;

  /**
   * The carriageway.
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
   * 6.8-unit avatar walking down it, and the eaves of the houses either side,
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
   * belongs to the vehicles rather than to the roads.** `src/traffic/` is
   * placed at twice its authored scale — see `PLACED_SECTION` — so a hatchback
   * is 4.44 across where it was 2.22, and a 4.0-unit Maghrebi alley was
   * narrower than the car parked in it. `ROAD_CLASSES` in `roads.ts` moved by
   * the same 1.5 for the same reason.
   *
   * **The 0.3 cap now binds in the tight-pitched regions, and that is the table
   * working rather than failing.** The share is `street * 0.5 / pitch`, so a
   * street can never take more than 0.6 of a plot pitch: east-asia's 9.75
   * against a 13-unit pitch asks for 0.375 and gets 0.3, an effective 7.8 —
   * one placed car with room to walk past it, which is what a machiya street
   * is. The regions where it does not bind are the ones with room to give:
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
 * *inside the disagreement the world already has*, which CLAUDE.md measures at
 * 0.49 units mean and 4.78 worst between the mesh and where the feet go, so it
 * adds no error class that was not already there — but it is not free, and at
 * 0.7 it was already an ankle.
 *
 * **It is 1.0 since 2026-09-06, and both halves of that number were measured
 * rather than chosen.** The user asked for a town on a slightly raised surface
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
 * puts the ankle at 0.4 and the knee at 1.66. He stands *on* the floor now —
 * `madeHeightAt`, and `player.ts` takes the higher of the two surfaces — so the
 * number is free to be what the town wants it to be instead of what the wading
 * would bear.
 *
 * **And what the town wants is to be visibly on something.** The user asked for
 * it twice, the second time with a picture: a cottage on a plinth with a
 * straight grey wall under it, *sin subidas suaves, no es una montaña, es para
 * diferenciar lo que es una ciudad*. At 1.0 with a 0.8 kerb the side of the
 * town is 1.8 units against a 6.8-unit avatar — a step, not a plinth, and from
 * any distance at all it is a colour change. 3.0 puts the visible face at
 * `GROUND_LIFT + KERB_DROP` = 3.8, which is 56% of the avatar and about a third
 * of a house: the proportion in the reference picture, read off it rather than
 * guessed.
 *
 * The two costs it does have are both paid elsewhere and worth naming. A body
 * *outside* the town climbs it in `KERB_BLEND` — three times the rise, so that
 * number moved with this one — and a road arriving has to get up it, which is
 * what the ramp in `buildTracks` is for.
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
 * to be a staircase of flat surfaces.** The user asked for the platform and
 * then asked the question that follows from it — *hay que ver qué hacemos con
 * las ciudades que están en pendientes porque se solapan con la montaña* — and
 * there are only three answers: tilt the platform, which is not a platform;
 * refuse the town, which deletes Huesca, Bern, Innsbruck, Quito and Santiago
 * along with 14.6% of everything built; or cut the hill into steps, which is
 * what a hill town on this planet has always actually been.
 *
 * The relief under a built town's own footprint, over the 9,734 that stand
 * (2026-09-07): the median varies by **4.0 units** across the whole town, the
 * p75 by 9.2, the p90 by 18.2 and Huesca by 36.7. So half the world is inside
 * one step whatever this number is, and gets a single flat plinth exactly as it
 * did before terracing existed — the staircase only appears where the ground
 * actually falls.
 *
 * **4 units**, which is a little over half the avatar and a hair over one step
 * of the plinth's own visible face (`GROUND_LIFT + KERB_DROP` = 3.8), so a
 * riser inside the town reads as the same kind of wall as the one around it.
 * Smaller and a hillside town is a flight of shallow stairs with a wall every
 * cell; larger and the cut at each riser is deeper than the buildings standing
 * on it.
 */
export const TERRACE_STEP = 4;

/**
 * How deep a town may cut one cell of its lattice into the hill, in world units.
 *
 * **This is the refusal, and it is stated as a depth rather than as a gradient
 * because what you see is the wall.** A cell is cut to one level surface, so the
 * face it shows on its low side is the drop across it plus the plinth — and a
 * drop is measured in avatars whatever the pitch of the lattice happens to be,
 * while a gradient is not: at the kit's own range of pitches, 12.6 to 20.9, one
 * gradient is two different walls.
 *
 * It caps the visible face at `MAX_CUT + GROUND_LIFT + KERB_DROP`, and **it was
 * chosen against what the rule deletes rather than against what it allows.**
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
 * the user's complaint was a town *overlapping* a mountain, and a town deleted
 * by a rule meant to fix that is the same failure wearing the other hat.
 *
 * **12 units**, where the wall is 15.8 — 2.3 avatars, a retaining wall a hill
 * town really has — and 234 places of 9,734 come out as one building. At 8 it
 * was 493, and Huesca (the town the user photographed) kept 3 of its 9 cells
 * against 6 at 12, on three terraces instead of one. Above 16 the wall is taller
 * than the houses standing on it.
 *
 * A cell steeper than this is not paved and nothing is built on it. `survey`
 * counts both the cells and the towns.
 */
export const MAX_CUT = 12;

/**
 * How far the apron drops below the ground at its outer edge.
 *
 * **This is the whole answer to "paving that stops at a hard circle looks like
 * a coin dropped on grass", and it is geometry rather than colour.** The paved
 * cells are ringed by one course of apron cells whose outer corners are laid
 * *below* the terrain, so the sheet dives into the ground; the visible edge of
 * the town is wherever that ramp cuts the land, which is an irregular line the
 * relief draws rather than one this file chose. It also self-corrects the lift
 * above: where the mesh runs high the ramp emerges later and the town is
 * simply a little smaller.
 *
 * At 3.2 units over a pitch of 13 to 25 the ramp runs at a gradient of 0.13 to
 * 0.25 and the median mesh error of -0.16 puts the crossing about a tenth of
 * the way out, so two to three units of apron show. That is 7 to 11 px at 260
 * units up: a soft edge, not a hard one, and not a moat either.
 *
 * It was 2.2 and the extra unit is bought against the *worst* case rather than
 * the median. Where the mesh runs high — La Paz, +2.55 — a shallow apron pops
 * out in whole cells, and a cell is 13 to 25 units of flat verge-coloured slab
 * sitting on a hillside with a straight edge on it. Sinking it deeper does not
 * change what a working apron looks like, because the part you see is the first
 * couple of units of it either way.
 */
export const APRON_SINK = 3.2;

/**
 * How far the kerb's foot is set below `elevationAt`, in world units.
 *
 * **The town is a plinth now, and a plinth is a top and a side.** The floor was
 * a sheet with a ramp round it: at `GROUND_LIFT` 0.7 the sheet was thin enough
 * that the ramp was the whole edge, and raising the lift to hide the mesh would
 * have left it floating with light under it. The side face is what makes the
 * lift affordable — a vertical band of `GROUND_LIFT + KERB_DROP` = **1.8 units**
 * around the floor's own outline, a quarter of the 6.8-unit avatar, which is a
 * kerb you step up rather than a terrace you climb.
 *
 * It is `MeshToonMaterial` that makes it read for nothing: the face is at right
 * angles to the paving, so it takes a different band of the four-step ramp with
 * the same sun on it, and the darker tone below only deepens a step the light
 * has already drawn. That is also why it is *not* an `OutlineEffect` line — the
 * pen hulls per mesh and a town is one mesh, so the kerb gets a shading break
 * and the town keeps its single silhouette.
 *
 * 0.8 below the ground rather than 0: the mesh is a linear approximation of the
 * relief and sits under it as often as over it — median `mesh - elevationAt` is
 * **-0.16** — so a kerb that stopped exactly at `elevationAt` would hang in the
 * air over half the towns on the planet. The apron carries on from the kerb's
 * foot to `APRON_SINK` for the rest, which is the case this cannot bound.
 */
export const KERB_DROP = 0.8;

/**
 * How wide the band is over which the player climbs the kerb, in world units.
 *
 * **The kerb is a vertical face and walking up it is still not a pop.** The
 * floor is a plinth `GROUND_LIFT` over the relief and the player used to walk at
 * the relief, wading through his own high street; he stands on the floor now
 * (`madeHeightAt` in `settlements.ts`), and the height rule in `player.ts`
 * follows a *rise* exactly on the frame it happens — deliberately, because
 * smoothing a rise is what buried the avatar to the knees in every mountainside.
 * So a floor that switched on at a cell boundary would put the whole
 * `GROUND_LIFT` into one frame.
 *
 * This is the only place in the world where the standing surface is not the
 * drawn one, and it is written down rather than hidden: the ribbon's own
 * shoulders draw the ramp a road gets (`ribbonHeightAt` reads the geometry), a
 * kerb has none, so the player is given a band of approach to climb it in.
 *
 * **It is three times the rise**, which is a gradient of 0.33 — 18 degrees, the
 * steepest thing a body in this world walks up without noticing, and the number
 * `pnpm check` asserts the ramp never exceeds. It was 3 units against a 1-unit
 * lift; the lift is 3 now, so this is 9. At `WALK_SPEED` (45 units/s) that is
 * 0.2 s, twelve frames at 60 Hz, against the 0.067 s the old pair gave — the
 * same climb spread over the same gradient, which is the invariant that matters
 * rather than either number.
 *
 * **The wall you can see is not this.** The drawn face is vertical and stays
 * vertical; this is the collision, and it is deliberately wider than the
 * geometry so that a town is never a place you cannot walk into. A stepped town
 * on a hillside would otherwise have terraces reachable only by road.
 */
export const KERB_BLEND = 9;

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
 * A town's floor, as the one thing a point query needs to know about it.
 *
 * The paved cells are the set `buildGround` produced — the built cells grown by
 * one and clipped to the core — and the pitch is the lattice they are on. Cell
 * `(col, row)` covers `x` in `[(col - 0.5) * pitch, (col + 0.5) * pitch]`, which
 * is the same convention `cornerAt` uses: corner `(i, j)` sits at
 * `(i - 0.5) * pitch` and is shared by the four cells `(i-1..i, j-1..j)`.
 */
export interface FloorField {
  pitch: number;
  /**
   * Every paved cell, and the elevation above sea level its terrace stands at
   * *before* `GROUND_LIFT` — which is to say the level the town cut into the
   * hill there, not the surface of the paving.
   *
   * A map rather than the old set, and that is the whole of the terracing as
   * far as a point query is concerned: a flat town has one value in it repeated
   * and behaves exactly as a single plinth did, and a town on a hillside has a
   * few, a `TERRACE_STEP` apart. What a foot has to be given is an **absolute**
   * height and not a lift over the relief, because the point of a terrace is
   * that the ground under it varies and the floor does not.
   */
  terraces: ReadonlyMap<number, number>;
}

/**
 * How far the floor stands over the ground at a point in the town's own frame,
 * in world units: the cell's own terrace plus `GROUND_LIFT` on the paving, 0 off
 * it, and the kerb ramp between.
 *
 * **The lift is against the ground the caller is standing on, and the floor it
 * is measured to is absolute.** That is the whole difference terracing makes to
 * a point query. The floor used to be a constant offset from the relief, so a
 * lift was a number; it is a set of level surfaces cut into a hill now, so what
 * this answers is *the cell's own elevation, plus the lift, minus yours* — and
 * the caller adding its own ground back gets a height that does not move as it
 * walks across a cell. `elevation` is `world.elevationAt` at the same point.
 *
 * 0 means there is no floor here, which is what a caller reads as "stand on the
 * ground". A floor never legitimately answers 0: a settlement is never on the
 * sea, so its terrace is always above it.
 *
 * The lattice corners are jittered by up to `CORNER_JITTER` of the pitch and
 * this asks the *un*-jittered cell, which is a fifth of a cell of slop at the
 * edge — against a blend that is already an approximation of a vertical face,
 * and the alternative is carrying every corner of every resident town so a foot
 * can be placed a sixth of a metre better.
 *
 * It is here rather than in `settlements.ts` so that the number and the ramp
 * that reads it cannot drift, and so `pnpm check` can hold the rule to its
 * contract without the kit: `settlements.ts` reaches the parts through an
 * `import.meta.glob` registry and does not load in Node.
 */
export function floorLiftAt(floor: FloorField, x: number, z: number, elevation: number): number {
  const { pitch, terraces } = floor;
  const col = Math.round(x / pitch);
  const row = Math.round(z / pitch);
  const here = terraces.get(cellKey(col, row));
  /**
   * **Inside the town a riser is a step you take, not a ramp you climb**, and
   * that is a decision rather than an omission.
   *
   * The blend below exists because the floor switching on at a cell boundary
   * would put the whole of `GROUND_LIFT` into one frame, and a rise is followed
   * exactly on the frame it happens (`HEIGHT_SMOOTHING` smooths drops only, on
   * purpose). The same argument would give every riser between two terraces its
   * own ramp — and the ramp would have to be laid over the *lower* terrace's
   * paving, so a body walking towards a step would float up to a whole
   * `TERRACE_STEP` above a surface it can see under its own feet, for the last
   * nine units of every approach, in a town where risers are a cell or two
   * apart. Outside the town the same trick is invisible: the ground there is
   * grass and there is no drawn surface to be caught floating over.
   *
   * So a terrace is climbed the way every game climbs a low ledge — instantly,
   * on the frame you cross it — and `TERRACE_STEP` (4) against a 6.8-unit avatar
   * is a step of about a knee. Off the paving, where the drop can be the whole
   * of `MAX_CUT`, the rule at the bottom of this function applies instead.
   */
  if (here !== undefined) return here + GROUND_LIFT - elevation;
  // How many cells out a paved one could still be inside the blend, from the
  // arithmetic rather than a constant so that neither a wider blend nor a
  // narrower pitch can silently truncate it.
  const span = Math.ceil(KERB_BLEND / pitch) + 1;
  let nearest = Infinity;
  let onto = 0;
  for (let dc = -span; dc <= span; dc++) {
    for (let dr = -span; dr <= span; dr++) {
      if (dc === 0 && dr === 0) continue;
      const level = terraces.get(cellKey(col + dc, row + dr));
      if (level === undefined) continue;
      // Point to the cell's own rectangle, which is what makes the ramp square
      // to the kerb rather than radial about a cell centre.
      const dx = Math.max(0, Math.abs(x - (col + dc) * pitch) - pitch * 0.5);
      const dz = Math.max(0, Math.abs(z - (row + dr) * pitch) - pitch * 0.5);
      const distance = Math.hypot(dx, dz);
      // Ties go to the higher terrace, so the approach to a stepped town climbs
      // to the step it is about to walk onto rather than to the one beside it.
      if (distance < nearest || (distance === nearest && level > onto)) {
        nearest = distance;
        onto = level;
      }
    }
  }
  if (nearest >= KERB_BLEND) return 0;
  /**
   * The ramp climbs to that terrace's own paving — but only where that is a
   * *kerb*, and on a terraced town most of the outside edge is not.
   *
   * **A blend is a fixed run, so a climb it was not sized for is a cliff you
   * walk up.** At `GROUND_LIFT` over `KERB_BLEND` the gradient is 0.33 and the
   * step is invisible; a town cut into a hillside shows faces of up to
   * `MAX_CUT + GROUND_LIFT + KERB_DROP`, and ramping *that* over the same run
   * would be a body rising fifteen units in nine — walking up a retaining wall
   * with nothing under his feet. Widening the run instead is worse, not better:
   * it starts the rise forty units out in an open field, which is the same bug
   * with more of it.
   *
   * So a face taller than one kerb is a **wall**, and the answer is that there
   * is no floor here: stand on the ground, walk along the bottom of it, and get
   * in the way the geometry already offers — the low side of the platform, where
   * the cut is shallow, or the ramp the town's own track draws for the road.
   * Coming the other way, downhill, needs nothing: the terrace is below the
   * ground you are on, so you walk over the edge and `HEIGHT_SMOOTHING` lands
   * you on it.
   */
  const climb = onto + GROUND_LIFT - elevation;
  if (climb <= 0 || climb > GROUND_LIFT + KERB_DROP) return 0;
  return climb * (1 - nearest / KERB_BLEND);
}

const P = PALETTE;

/**
 * The table.
 *
 * Read it as two columns and one relation. `hardness` says how far the ground
 * gets from the dirt it is made of, and the *relation* is `road` against the
 * yard that `hardness` produces: they have to be far apart in lightness, and
 * the road has to be the one that is not a neutral. The lightness of the
 * palette entries this leans on, for checking a new row:
 *
 * ```
 *   cream .93   sand .78   bone .77   green .58   tan .55   brown .49
 *   clay .49    olive .43  steel .28  bark .27    darkOlive .27
 * ```
 *
 * Every row here clears about 0.25 of lightness between the two, and every road
 * carries a hue: pale roads through green and dark towns, brown lanes through
 * pale desert render. `steel` appears exactly once, in the polar row, where the
 * ground it runs through is nearly white.
 */
export const GROUND_STYLES: Record<RegionId, GroundStyle> = {
  // Gravel yards and one pale road through: the ground is mostly still ground.
  nordic: { hardness: 0.35, paving: P.tan, road: P.bone, plaza: P.cream, lanes: 3, street: 10.5 },
  // Stone setts to the doorstep, and the square is the palest thing in the town.
  'atlantic-europe': { hardness: 0.6, paving: P.tan, road: P.bone, plaza: P.cream, lanes: 3, street: 9.75 },
  'east-europe': { hardness: 0.5, paving: P.tan, road: P.bone, plaza: P.cream, lanes: 3, street: 9.75 },
  // Pale stone and dust, and the square is lime-washed like the walls around it.
  mediterranean: { hardness: 0.6, paving: P.tan, road: P.cream, plaza: P.white, lanes: 2, street: 7.5 },
  // Beaten earth between the walls: a medina is not paved, it is swept — and its
  // lanes are the narrowest and the closest together in the table, which is the
  // whole of what a medina is from above. They read *dark* because an alley
  // between two-storey walls is in shadow most of the day.
  maghreb: { hardness: 0.4, paving: P.sand, road: P.brown, plaza: P.cream, lanes: 2, street: 6 },
  'sub-saharan': { hardness: 0.3, paving: P.clay, road: P.sand, plaza: P.sand, lanes: 3, street: 8.25 },
  'middle-east': { hardness: 0.45, paving: P.sand, road: P.brown, plaza: P.cream, lanes: 2, street: 6.9 },
  'south-asia': { hardness: 0.45, paving: P.tan, road: P.bone, plaza: P.cream, lanes: 3, street: 8.25 },
  'east-asia': { hardness: 0.55, paving: P.tan, road: P.bone, plaza: P.cream, lanes: 3, street: 9.75 },
  // Wet ground under stilts. What hard standing there is, is a plank and a path.
  'southeast-asia': { hardness: 0.3, paving: P.brown, road: P.sand, plaza: P.sand, lanes: 3, street: 8.25 },
  // Lawns with roads between them, which is what a suburb is — so the *yard*
  // stays close to the grass it was cut out of and the road does all the work.
  // It is also the widest road on the planet, on the widest pitch in the kit.
  'north-america': { hardness: 0.45, paving: P.tan, road: P.bone, plaza: P.cream, lanes: 4, street: 15 },
  'latin-america': { hardness: 0.5, paving: P.tan, road: P.cream, plaza: P.white, lanes: 3, street: 9.75 },
  oceania: { hardness: 0.45, paving: P.tan, road: P.bone, plaza: P.cream, lanes: 4, street: 14.25 },
  // Nothing grows, so there is no lawn to lose: the ground is already bare rock,
  // and it is the one place pale enough for a dark road to read as a road.
  polar: { hardness: 0.45, paving: P.bone, road: P.steel, plaza: P.white, lanes: 4, street: 12 },
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
 * is the next step along the same axis, and it exists because the user asked
 * for one: *caminos de tierra, no cesped.* A dirt road is not a made road that
 * has faded, and it is not a lawn stripe; it is earth, and earth is darker and
 * browner than the field it crosses rather than paler and greyer.
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
 * The floor of a settlement: the local dirt, trodden, moved towards the
 * region's paving by how much of it was made.
 *
 * `base` is what `groundColorAt` says the land is at the settlement's centre.
 * Sampled once per town and not once per cell: a settlement is at most 200
 * units across and the biome's own features are degrees wide, so the second
 * call would return the first answer and cost a point-in-polygon to do it.
 */
const pavingScratch = new THREE.Color();

export function floorColor(
  base: THREE.Color,
  style: GroundStyle,
  target: THREE.Color,
): THREE.Color {
  trodden(base, target);
  return target.lerp(pavingScratch.setHex(style.paving), style.hardness);
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
