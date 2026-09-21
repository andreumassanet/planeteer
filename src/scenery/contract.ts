import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { PAINTED_MARK, createContext, measure, paletteName } from '../monuments/contract.ts';
import { onPalette, paintModel, toned } from '../models.ts';
import type { Model, Paint } from '../models.ts';
import type { Measurements, MonumentContext } from '../monuments/contract.ts';
import { rngFrom } from './random.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import type { Rng, Weighted } from './random.ts';

/**
 * The scenery contract: the kit that inhabits the planet.
 *
 * `src/monuments/contract.ts` is the model for this file and the reason to read
 * it first. Almost nothing transfers directly, and the three places it does not
 * are the whole design:
 *
 * 1. **A monument is authored; a house is generated.** Sixty-five monuments are
 *    sixty-five hand-written files. A hundred thousand houses are a dozen
 *    parametric parts and a seed. So `build` takes an `Rng` and a `RegionStyle`,
 *    and determinism stops being "no `Math.random()`" and becomes "the same
 *    world on every load *and* after you add a house to it" — see `random.ts`.
 * 2. **A monument's budget is per model; a settlement's is per town, and the
 *    binding cost is draw calls.** A part is capped on triangles, but it is
 *    capped harder on *colours*, because the colour count is what survives every
 *    plausible way of drawing a town. See `KINDS`.
 * 3. **A monument is figure; scenery is ground.** Nothing here may reach the
 *    `building` tier's 40 units. The kit builds the fabric a landmark stands out
 *    of, and the moment a generic block can out-top the smallest monument, the
 *    monument system has been quietly repealed.
 *
 * What *is* carried over unchanged, because it is what makes one world: the
 * palette, the ramp, and the pen. `createSceneryContext` wraps the monument
 * context rather than making its own, so a house is inked by the same
 * `OutlineEffect` parameters as the Eiffel Tower and the coastline, and asks for
 * colour through the same `toon` that refuses anything outside `PALETTE`.
 */

// ---------------------------------------------------------------------------
// Scale — the first decision, and everything follows from it
// ---------------------------------------------------------------------------

/**
 * The hero's height, which sizes every person, rider, vehicle and animal the
 * kit builds. Imported from `stature.ts`, the one place it is written, and
 * re-exported here because the traffic and fauna contracts read it from this
 * file.
 */
export { AVATAR_HEIGHT };

/**
 * How much a real metre is worth inside a settlement, in world units.
 *
 * `PLANET_RADIUS` is 16,000 for an Earth of 6,371 km, so one unit is 0.398 km
 * and one metre is 0.00251 units. The three candidate scales, with the numbers:
 *
 * - **True scale.** A 10 m house is 0.0251 units: a fortieth of one world unit,
 *   and 1/271 of the 6.8-unit avatar. Below the near plane. Not a decision, an
 *   absence.
 * - **Avatar scale** — the factor that makes a 1.8 m human 6.8 units, i.e.
 *   3.78 u/m. That same 10 m house is 37.8 units: taller than the `building`
 *   tier, three-quarters of a modelled Colosseum, and five and a half avatars.
 *   A village of forty would out-mass every monument on the continent.
 * - **This kit: 1.267 u/m**, which is 505x true scale and very close to exactly
 *   *one third* of avatar scale.
 *
 * Why a third, in numbers rather than taste:
 *
 * - **A house has to be a mark at the horizon.** From the ground the horizon is
 *   about 930 units (`placement.ts`). At a 900 px viewport and a 55 degree lens,
 *   an object subtends roughly `937 * height / distance` pixels, so a 10-unit
 *   house is a 10 px mark on the skyline — the smallest thing still worth
 *   walking towards. That fixes the ordinary two-storey house at 10 units, and
 *   everything else is derived from it.
 * - **A monument has to stay a monument.** At 10 units a house is one twelfth of
 *   the Eiffel Tower's 120. In life it is one thirty-third, so the tower has
 *   given up two thirds of its dominance — and it still towers. At avatar scale
 *   it would be 3.2 houses tall, which is not a landmark, it is a block of
 *   flats.
 * - **The avatar has to read as a person.** At this scale his head reaches the
 *   eaves of a two-storey house: 6.8 against 7.6. Slightly toy, and deliberately
 *   so — it is the same register as the two references the project is built
 *   from. At true scale he is a 2.7 km giant; at avatar scale the world is
 *   correct and unreadable.
 *
 * **Do not author in metres.** This constant exists to document the compression
 * and to be quoted in a review, not to be multiplied by inside a part file.
 * Parts are authored in `STOREY`s and world units, for the same reason a
 * monument is authored in tiers: the moment a file starts converting from
 * metres, it starts arguing with the compression instead of using it.
 */
export const SCENERY_SCALE = 1.267;

/**
 * The working unit of the kit: one floor of a building, 3 m in life.
 *
 * The avatar is 1.79 storeys. A house of 1 storey is a hut, 2 is a house, 4 is a
 * street, 8 is as tall as the fabric of a city ever gets here.
 */
export const STOREY = 3 * SCENERY_SCALE;

/**
 * What a part may spend detail on, decided at the distance it is seen from.
 *
 * The angular arithmetic above, run the other way: a feature of size `s` is
 * about `937 * s / d` pixels, and nothing under four pixels reads as anything at
 * all once the ink is on it. So the smallest legible feature is `d / 234`:
 *
 * ```
 * distance   house (10u)   smallest feature that reads
 *   40 u        234 px       0.17 u   a door frame, a window bar
 *  120 u         78 px       0.51 u   a window, a chimney
 *  360 u         26 px       1.54 u   a storey band, a roof plane
 *  930 u         10 px       4.0  u   the mass, and nothing else
 * ```
 *
 * Two consequences, and they are the craft rules of this kit:
 *
 * - **Model at storey scale, and articulate at window scale.** The masses — the
 *   roof pitch, the eaves, the stack of blocks — are what survives past 120
 *   units, so they get the geometry. Under 120 a wall with one glazing band a
 *   floor read as a slab with stripes on it, and the fix was not triangles: it
 *   was tones and edges. A darker base course, a shadow band under the eaves, a
 *   ridge cap, a frame with two panes on it — each is two or three tones of a
 *   colour the part already has, and a pane is two triangles in a mesh shared
 *   by the whole row (`panes`), so the articulation costs about a fifth of a
 *   part and no draw calls. `TONES` and `PROUD` are the two rules it obeys.
 * - **Past about 400 units a part is mostly its own outline.** The pen is screen
 *   space (`pos.w` cancels in `OutlineEffect`'s vertex shader), so it is the
 *   same two or three pixels on a 10-unit house as on the coastline — which is
 *   nearly a third of the house's width at 360 units. Colour stops mattering out
 *   there and the silhouette is all that is left. **Every part must be nameable
 *   as a black shape**, which is why the roof pitch, the eaves and the stack of
 *   masses get the budget and the trim does not.
 */
export const LEGIBLE_AT = (distance: number): number => distance / 234;

// ---------------------------------------------------------------------------
// Tones, and the step the pen needs
// ---------------------------------------------------------------------------

/**
 * How far a surface stands off the one behind it before the pen will draw the
 * join, in world units.
 *
 * `OutlineEffect` hulls each mesh on its own, so two faces that are flush get
 * no ink between them, which is what happened to Niagara's American curtain. A
 * base course painted onto a wall is a change of colour and nothing else;
 * stepped out by this much it is an edge, and an edge is a line. 0.08 is two
 * pixels at 40 units and under one at 120, the least that reliably wins the
 * depth test against the hull behind it, and every course, band, frame and cap
 * in the kit stands off by exactly it. The old parts used 0.06 for their
 * glazing and it was the first thing to disappear under the pen at a grazing
 * angle.
 */
export const PROUD = 0.08;

/**
 * The tones a made thing carries, as factors for `ctx.tone`.
 *
 * What separates a house from a box is not triangles: it is that every element
 * carries two or three tones of its own colour. A wall has a darker base course
 * and a shadow under its eaves; a roof has a darker ridge; a chimney has a cap;
 * a door has a lintel. A model made of one flat colour per part reads as a
 * primitive, and the same model with those tones reads as a house — measured on
 * this kit by eye, at 40 and at 120 units, on the sheet. Tones are free against
 * the colour budget (`measure` folds them onto their base) and cost a merged
 * town only the vertex bytes it already carries, so **they are the first thing
 * a part spends and triangles are the last.**
 *
 * Four, named for what they are rather than for their numbers, so a part reads
 * as a sentence: `tone(wall, TONES.course)`. The eave is the darkest because it
 * stands for a shadow, and a shadow only 15% darker reads as dirt; the base
 * course is the lightest of the darks because it is the biggest, and a heavy
 * dark band at the foot of every house makes a street of plinths.
 */
export const TONES = {
  /** The base course of a wall, the step under a door, the plinth of a tower. */
  course: 0.84,
  /** The band under the eaves: the roof's shadow, drawn rather than lit. */
  eave: 0.7,
  /** A ridge cap, a chimney cap, a lintel, a balcony: the dark edge of a thing. */
  cap: 0.76,
  /** A cornice, a sill, a frame, the lighter bay of a terrace: its sunlit edge. */
  light: 1.1,
} as const;

/**
 * Glazing is `slate` at this factor, everywhere on the planet: 0x595568, a
 * dark blue-grey.
 *
 * A window is the sky reflected, not a hole, and the one thing it must never
 * be is black — in this style a black rectangle is *ink*, and a row of them a
 * floor apart is a stripe, which is exactly what the tower blocks were. The
 * regional `style.glass` lists are warm darks for the shade reason given on
 * `RegionStyle.walls`, and they are still right for what they now mean: a
 * **hole** — a doorway, an arch, a belfry louvre, anything with nothing behind
 * it. `slate` is the one cool palette entry that keeps a hue in shade (it has
 * more blue than red, so it goes bluer rather than grey; see the table on
 * `MonumentContext.palette`), which is why glass can be the one cool thing on
 * a warm wall without turning into a patch of nothing.
 */
export const GLASS_TONE = 0.72;

// ---------------------------------------------------------------------------
// Kinds and budgets
// ---------------------------------------------------------------------------

/**
 * What a part is, which is also what it costs.
 *
 * - `scatter` — rocks, bushes, stumps, the things that stop ground being empty.
 * - `tree` — one tree. A tree is a mark, not a model.
 * - `dwelling` — where one household lives: 1 to 3 storeys.
 * - `block` — the fabric of a town: 4 to 8 storeys, terraces and slabs.
 * - `civic` — the one building that tells you *where* you are: a church, a
 *   mosque, a pagoda. One per settlement, so it may cost twice a dwelling.
 * - `person` — somebody living there. The **one kind not authored at
 *   `SCENERY_SCALE`**: a person's size is set by `AVATAR_HEIGHT` and nothing
 *   else, so it is three times the scale of everything above it. That is why it
 *   is a row here rather than a short `dwelling` — see `src/scenery/people.ts`.
 */
export type PartKind = 'scatter' | 'tree' | 'dwelling' | 'block' | 'civic' | 'person';

export interface KindSpec {
  /** Tallest a built variant may come out, in world units. */
  height: number;
  /** Shortest, so a `block` cannot quietly be a bungalow. */
  minHeight: number;
  /** Largest `footprint` radius a part of this kind may declare. */
  footprint: number;
  /** Triangle cap per variant. Multiplied by every instance in the world. */
  triangles: number;
  /** Mesh cap per variant. Mostly a cap on build time; see `colors` for the real one. */
  meshes: number;
  /**
   * Cap on distinct palette colours in one variant, and the tightest number in
   * this table.
   *
   * Draw calls are the binding cost of a town, and every way of drawing one
   * multiplies by the colour count. Merge a town by material and it is
   * `colours` draw calls per variant present; instance it and it is one
   * `InstancedMesh` per (variant, colour). Either way a five-colour house is a
   * five-times worse citizen than a one-colour rock, and no amount of triangle
   * budget changes that.
   */
  colors: number;
}

export const KINDS: Record<PartKind, KindSpec> = {
  // Kenney's Nature Kit since 2026-09-17: the heaviest tree it draws here is the
  // default pine at 230 triangles and the heaviest scatter the detailed bush at
  // 104 (`pnpm kit`), against the 150 and 90 the code-built plants were held to.
  scatter: { height: 6, minHeight: 0.5, footprint: 3.5, triangles: 110, meshes: 8, colors: 3 },
  tree: { height: 26, minHeight: 4, footprint: 8, triangles: 240, meshes: 14, colors: 3 },
  // The three building kinds are a fifth over what they were (220/380/520 and
  // 26/34/44) since the glazing became frames and panes: a frame plate is ten
  // triangles and a two-pane window fourteen, where the band each replaced was
  // twelve, and a house wants six or seven of them plus a course, an eave band,
  // a ridge cap and a lintel at twelve apiece. The cost that binds is the
  // 150-unit city at altitude, and it rises by less
  // than a fifth because a cap is a ceiling: the median part is a two-storey
  // house, and one of those measures 216 against the 264 it may spend.
  dwelling: { height: 16, minHeight: 5, footprint: 9, triangles: 264, meshes: 30, colors: 5 },
  block: { height: 34, minHeight: 13, footprint: 14, triangles: 456, meshes: 40, colors: 5 },
  civic: { height: 38, minHeight: 11, footprint: 16, triangles: 624, meshes: 52, colors: 6 },
  // A person is built of soft shapes since 2026-09-15 (`src/soft.ts`), and
  // the three caps moved with it. **Triangles**: measured by `pnpm people` over
  // 840 builds, median 700 and worst 1,024 — a smooth head and its hair are
  // about 130 of that, and the rest is what a lathe costs over a prism; the cap
  // is the worst plus a tenth. What it spends is bounded by the rank rather
  // than by the part: only the nearest `PEOPLED_RANK` towns carry a crowd
  // (`settlements.ts`). **Meshes**: worst 29, capped at 32. **Colours: seven**,
  // the hero's own count — skin, hair, top, bottom, trim, the one bright thing,
  // and the ink of the eyes — so the rule that a crowd may not be richer than
  // the player still holds. The colour cap is a draw-call cap for a part merged
  // by material, and a person never is: `settlements.ts` and `life.ts` both
  // merge one by vertex colour, so the seventh colour is two eyes and not a draw
  // call. The height range spans a small child under a hat (3.2) to the tallest
  // adult in a conical one (8.4).
  person: { height: 8.4, minHeight: 3.2, footprint: 3.2, triangles: 1130, meshes: 32, colors: 7 },
};

/**
 * How many variants of one part a settlement builds.
 *
 * **This is the number that makes instancing possible at all, and it is the one
 * thing in the kit that a reader will get wrong if it is not said plainly: a
 * part's `build` is a variant factory, not an instance factory.** A house that
 * draws its own storey count and width from a seed produces *unique geometry*,
 * and unique geometry cannot be instanced. So the kit calls `build` a fixed
 * small number of times per part per region, and a town places instances of
 * those variants — position, yaw and a uniform scale, nothing else.
 *
 * Six is chosen against the draw-call arithmetic, not by eye. A region uses
 * about nine parts; nine parts times six variants times four colours is 216
 * instanced meshes, doubled by `OutlineEffect` to 432 draw calls for an entire
 * regional style. Twelve variants would be 864, which is where a browser starts
 * to notice. And six is enough: with eight yaws and a continuous scale, six
 * variants of six building parts give a hundred-plot village more distinct
 * silhouettes than it has plots.
 *
 * The corollary is a hard rule for part authors: **per-instance variety must be
 * expressible as a transform.** Anything else — a different roof, a chimney, one
 * more storey — is a *variant*, decided at build time from the variant's own
 * `Rng`, and paid for once.
 */
export const VARIANTS = 6;

// ---------------------------------------------------------------------------
// Region style
// ---------------------------------------------------------------------------

/**
 * A place's look, as data.
 *
 * `country.iso` and `country.continent` sit on every ring in `geo.ts` and
 * `countryAt` is exact, so "a house in Japan is not a house in Morocco" needs no
 * new lookup — only this table, which lives in `regions.ts`.
 *
 * The interface is here rather than there so a part file can import one module.
 * A part receives the style and reads colours out of it: that is how one
 * `gabled-house` is Norwegian in falu red under a steep roof and Australian in
 * cream under a shallow one, without a second file.
 */
export interface RegionStyle {
  id: string;
  name: string;
  /** One line for the review sheet. What you would notice if you landed there. */
  note: string;

  /**
   * Walls, renders and plaster.
   *
   * **Warm entries, and this matters more here than it did for a monument.** The
   * note beside `palette` in the monument contract measures it: under this
   * scene's blue hemisphere light a neutral turned away from the sun goes
   * hueless — `bone` 143,122,100 becomes 76,68,58, a dark patch with no colour
   * left. A monument has a few deep recesses. A village is *nothing but* small
   * recesses: every eave, every doorway, every gap between two houses. A street
   * of `bone` walls reads as a street of holes. `white` (0xfff2e8) is the warm
   * white that survives at 132,111,88; `cream`, `sand`, `tan`, `blush` and
   * `apricot` all hold. Reach for those, not for `bone` or `steel`.
   */
  walls: readonly number[];
  /** Tile, thatch, slate, tin. The roof is half the regional signal. */
  roofs: readonly number[];
  /** Doors, shutters, beams, posts: the accent that is not the wall. */
  trim: readonly number[];
  /** Windows and openings. Warm darks, for the reason above. */
  glass: readonly number[];
  /**
   * Leaves. Regional, and one of the cheapest signals there is: olive and dark
   * olive read as dry, `green` reads as watered, and a village changes climate
   * on this one list.
   */
  foliage: readonly number[];
  /** Rock and bare ground. Grey in Norway, red in the Australian centre. */
  stone: readonly number[];
  /** The ground a village of this region sits on, for the review sheet. */
  ground: number;

  /** Roof rise over half-span. 0.15 is a flat Maghreb terrace, 1.0 is alpine. */
  pitch: number;
  /** Chance a roof comes out hipped rather than gabled. */
  hipped: number;
  /** Storeys an ordinary building gets here, both ends included. */
  storeys: readonly [number, number];

  /** Part ids and their weights. Unknown ids are reported by the review sheet. */
  buildings: readonly Weighted<string>[];
  civic: readonly Weighted<string>[];
  trees: readonly Weighted<string>[];
  scatter: readonly Weighted<string>[];

  /** Plot pitch as a multiple of plot size. 1.0 is a dense town, 1.8 is scattered. */
  spacing: number;
  /** Share of the plots outside the built core that get a tree. 0 is tundra. */
  greenery: number;

  /**
   * Which of `buildings` and `civic` a **near** town draws from the CC0 kit
   * instead: code part id -> asset part id (2026-09-17). Near is the rank that
   * peoples a town (`PEOPLED_RANK` in `settlements.ts`), so a town is built of
   * baked models while it is one of the nearest and of the cheap code-built
   * parts beyond, which is the level of detail. A region with no entry is built
   * in code at every distance: no CC0 pack in the style has its buildings.
   */
  assets?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

/** One floor's worth of glazing on one face. See `SceneryContext.windows`. */
export interface WindowRow {
  /** How many, centred on X. */
  count: number;
  width: number;
  height: number;
  /**
   * Panes across one window. Two is a casement and the default; one is a slit
   * or a porthole, three is a shopfront. Above three the bars are under the pen
   * and the window goes back to being a rectangle.
   */
  panes?: number;
  /** Centre to centre. Defaults to 1.9 widths, which is a plain terrace rhythm. */
  spread?: number;
  /** The frames: a tone of the trim, or of the wall for a rendered surround. */
  frame: number;
  /** The glass. Defaults to `ctx.glass`, and outside a special case it should. */
  glass?: number;
  /** If given, a pair of shutters flanking every window, in this colour. */
  shutters?: number;
  /** How deep the frames stand off the wall. 0 paints them on; see `window`. */
  reveal?: number;
  /** Ceiling on how bright these may burn after dark. See `lit`. */
  strength?: number;
}

/**
 * Everything a part may build with.
 *
 * It **extends** `MonumentContext` rather than reimplementing it, and that is
 * deliberate: one `toon`, one ramp, one material per colour, one outline
 * thickness. A settlement inked with a different pen than the monument in the
 * middle of it would read as two worlds, which is the exact failure the monument
 * contract was written to prevent.
 *
 * The two conventions are the monument ones, unchanged, so there is nothing new
 * to remember: **everything stands on its own base**, and **flat faces look at
 * +Z**. Every helper added here obeys both.
 */
export interface SceneryContext extends MonumentContext {
  /**
   * A pack model (`src/models.ts`) as a mesh of this world: its own geometry,
   * shared, with a colour attribute written by `paint`, drawn with the one
   * vertex-coloured toon material and inked along its welded `outlineNormal`.
   *
   * **The way a CC0 asset enters a kit**, and the one exception to `toon`
   * being the only way to make a material: the material is still this
   * context's, on this context's ramp, and every colour `paint` returns should
   * come off the palette (`onPalette` and `bodyPaint` in `models.ts` do that).
   * The flatteners in `settlements.ts`, `vegetation.ts` and `life.ts` read the
   * vertex colours and the outline normals rather than the material's stamp.
   */
  painted(model: Model, paint?: Paint): THREE.Mesh;

  /**
   * A baked model (`registerSceneryModels`) as a part: painted, turned by `yaw`,
   * narrowed across by `squash`, and scaled uniformly to the tightest of
   * `height`, `width`, `length` and `radius` — the last being the part's
   * footprint, which the model's own bounding circle may not pass — standing on
   * y = 0, or `sink` under it, centred on its own vertical axis.
   */
  fitted(id: string, fit: ModelFit, paint?: Paint): THREE.Group;

  /**
   * The colour of glass: `slate` toned down by `GLASS_TONE`, the same on every
   * part in every region. Wrap the mesh in `lit` so it glows after dark; use
   * `style.glass` only for a hole.
   */
  glass: number;

  /**
   * A row of `count` panes along X, each `width` by `height`, `gap` apart,
   * centred on X, standing on y = 0 and facing +Z. **One mesh** for the row.
   *
   * A pane is a quad: two triangles, no sides, no back, and therefore **no
   * ink**. The hull `OutlineEffect` draws is the mesh's back faces pushed out,
   * and a quad seen from the front has none. That is the point rather than a
   * saving. A pane a unit wide is eight pixels at 120 units and the pen is
   * three, so an inked pane is a blob; the frame it sits on carries the ink and
   * the pane carries the colour, which is also how a comic draws a window.
   *
   * `depth > 0` makes **plates** instead: a front and four sides, ten
   * triangles, inked, still no back because the back is in the wall. A frame,
   * a shutter, a sill and a lintel are plates. Either way the row is one mesh,
   * so eight panes cost what one band did on the mesh budget.
   */
  panes(count: number, width: number, height: number, gap: number, color: number, depth?: number): THREE.Mesh;

  /**
   * One window: a frame plate in `frame` with `panes` glass quads on it, lit.
   *
   * Both meshes stand on y = 0 with the frame's back at z = 0, the frame
   * `REVEAL` deep and the glass `PROUD` in front of its face — the offsets are
   * baked into the geometry, so give the pair the same position and yaw at the
   * wall's surface and the window is in the wall. Two meshes a window is what
   * the mesh budget will not carry on a house with seven, so collect the frames
   * and hand them to `merged` once. The glass stays a mesh per window on
   * purpose: `settlements.ts` lights each lit mesh on its own seed, and that is
   * what gives one house a lit landing and a dark front room.
   *
   * `reveal` is how deep the frame stands off the wall; the default is two
   * `PROUD`s, a reveal rather than a decal. **Zero makes a painted frame** — a
   * quad, two triangles, no ink — for the back and the sides of a house, where
   * nobody stands and a window is a light rectangle with dark panes on it.
   */
  window(
    width: number,
    height: number,
    panes: number,
    frame: number,
    glass?: number,
    reveal?: number,
  ): { frame: THREE.Mesh; glass: THREE.Mesh };

  /**
   * A row of windows in a wall, as one group standing on y = 0 and facing +Z,
   * centred on X with the backs of the frames at z = 0.
   *
   * This is the helper the buildings actually call, and it exists because the
   * arithmetic of the mesh budget says so. A window is two meshes; a house has
   * six or seven and a terrace twelve, which is the whole `dwelling` allowance
   * spent on glazing. So the row **merges every frame into one mesh and every
   * shutter into another** — a merge per colour, which is what `merged` will
   * accept — and leaves the glass one mesh a window, because `settlements.ts`
   * lights each lit mesh on its own seed and that is what gives one house a lit
   * landing over a dark front room. Twelve windows are 3 meshes and 12 glazing
   * ones instead of 24, and identical geometry either way.
   *
   * Put it on the wall's surface and nothing else: the reveal and the `PROUD`
   * step are baked into the geometry. For the back and the sides of a building,
   * where nobody stands, pass `reveal: 0` for painted frames at two triangles
   * each — or skip this entirely and lay one `panes` row, which is one mesh for
   * the whole floor and lights as one room.
   */
  windows(row: WindowRow): THREE.Group;

  /**
   * Several meshes of one colour, baked into one.
   *
   * Each mesh's own transform — whatever position, rotation and scale were set
   * on it — is applied to its vertices, and the result has none, so build the
   * pieces where they belong and merge last. The sources are consumed: removed
   * from any parent and their geometry disposed. One colour only, because one
   * mesh is one material and a merge across two would silently paint the
   * second in the first's — merge per colour. A lit piece keeps its mark on the
   * whole, at the strongest of them. And the determinant of every piece is
   * asserted positive, because a reflected piece flips its winding and the pen
   * draws it as a solid blob.
   */
  merged(meshes: readonly THREE.Mesh[]): THREE.Mesh;

  /**
   * A pitched roof: pyramid, hip or gable, from one function.
   *
   * The base is `width` by `depth` (give it the eaves already added) and the top
   * is a ridge of length `ridge` running along X at `height`. `ridge = width` is
   * a gable with its ends facing +/-X; `ridge = 0` is a pyramid; anything between
   * is a hip. Eight triangles, one mesh, and the ridge line is an ink line —
   * which is the single most useful mark a small building has.
   */
  roof(width: number, depth: number, height: number, ridge: number, color: number): THREE.Mesh;

  /**
   * A dome, lathed from a quarter-ellipse. Closed underneath, so it can sit on a
   * drum without showing daylight through its own floor.
   *
   * `rings` is the number of bands up the profile, and it is an *ink* decision
   * before it is a geometry one, because every band is an ink line. Three bands
   * read as a dome; six read as a beach ball.
   */
  dome(radius: number, height: number, color: number, sides?: number, rings?: number): THREE.Mesh;

  /**
   * A rectangular parapet, balcony or low wall: a ring with a real hole in it,
   * `thickness` thick, standing on y = 0.
   *
   * The one thing worth knowing is why it is not `ringWall(a, b, h, c, 4)`. A
   * four-sided lathe puts its corners on the axes, so that expression is a
   * diamond, not a square — the same surprise `column(r, h, c, 4)` would give if
   * the monument context did not quietly rotate its prisms by half a segment.
   * The rotation is baked into the geometry here rather than set on the mesh
   * because the local matrix is T*R*S: scaling z on a rotated mesh shears the
   * square back into a diamond, and it takes a while to see why.
   */
  rim(width: number, depth: number, thickness: number, height: number, color: number): THREE.Mesh;

  /**
   * Marks a mesh as something that is **lit from the inside after dark**, and
   * returns it, so it wraps the call that made it: `lit(box(w, h, d, glass))`.
   *
   * This is the whole interface a part has to lit windows, and it is one word
   * on purpose. It does **not** change the material, the colour, the geometry
   * or anything the contract measures — `measure` counts colours by
   * `userData.atlasToon` and a marked mesh still carries exactly the one it had,
   * so a window that lights up costs nothing against the kind's triangle, mesh
   * or colour budget. What it does is set a flag `settlements.ts` reads while it
   * flattens the variant into the town's one buffer, where it becomes a byte per
   * vertex and, at night, emission. See `src/lights.ts`.
   *
   * Two rules for using it. **Mark the glazing, not the wall**: the thing being
   * simulated is interior light escaping through an opening, and a whole
   * building face that emits is a lantern rather than a house. And **a dark
   * doorway is not a window** — `round-hut` and `stilt-house` draw their
   * entrances out of `style.glass` because a hole reads dark, and a hole with a
   * *fire* behind it is a different and dimmer claim, which is what `strength`
   * is for. It is a ceiling and not a value: the town still draws each window
   * dark or lit and each building brighter or dimmer on its own seed, so
   * `lit(door, 0.5)` says "never more than half a window", not "always half".
   */
  lit<T extends THREE.Object3D>(mesh: T, strength?: number): T;

  /**
   * A faceted lump: foliage, boulders, haystacks, anything not built by hand.
   *
   * An icosahedron scaled to exactly fill `2*radius` by `height` by `2*radius`
   * and standing on y = 0 — the scaling is measured off the geometry rather than
   * assumed, because an icosahedron's vertices reach 0.851 of its radius on the
   * axes, not 1, and every "why is my tree floating" starts there. `detail = 0`
   * is 20 triangles and is what a tree should use.
   */
  blob(radius: number, height: number, color: number, detail?: number): THREE.Mesh;
}

/**
 * One context for the whole kit.
 *
 * Optionally wraps an existing `MonumentContext` — pass the one `placement.ts`
 * already built and the world shares a single material cache and a single ramp
 * across monuments and scenery both. Left to itself it makes its own, which
 * costs one 4x1 texture and one shader program per shared colour.
 */
export interface ModelFit {
  height?: number;
  width?: number;
  length?: number;
  /** The most the model's bounding circle may reach from its axis. */
  radius?: number;
  /** How far below y = 0 the model's base goes: a hull's draft. */
  sink?: number;
  /** Turned about Y after fitting, which the bounding circle does not notice. */
  yaw?: number;
  /** Across (X and Z) as a share of up: 0.7 is a cypress drawn from a round tree. */
  squash?: number;
  /**
   * With a `height`: keep the height and squash the plan into the `radius`,
   * `width` and `length` given, down to `NARROWEST`, rather than shrink the
   * whole model to them.
   *
   * **A building's footprint is what the town's cells have room for, and a
   * Kenney house is wider than a code-built one.** Fitted to its radius alone a
   * suburban house at the gabled house's footprint came out 5.9 units tall
   * against a 6.8-unit person; fitted to a radius of 9 it kept its height and
   * no longer fitted the cells a gabled house had stood in, and a town lost a
   * building in each (Kempten, 2026-09-17). A corner cell of the median pitch
   * leaves a house 8.4 by 8.4, and `FIT_SCALE` lets it shrink a tenth.
   */
  narrow?: boolean;
  /**
   * Tones up the model's height on the slots `slots` names: `bottom` at the
   * lowest of their vertices, `top` at the highest. What a code-built crown did
   * with three lobes in three tones, done to one flat-coloured canopy for the
   * price of the colour bytes it already has.
   */
  shade?: { slots: RegExp; bottom: number; top: number };
  /**
   * Marks the slots `windows` names as glass that lights after dark: the mesh
   * carries `atlasLit` like a code-built pane, and a per-vertex `atlasWindow`
   * byte says which of its vertices are the glass, because a painted building is
   * one mesh and its walls must not glow with it (`flatten` in `settlements.ts`).
   *
   * The byte is the window's number, 1 to 255 — each connected patch of glass
   * is one — so `flatten` draws each window's light on its own, the way a
   * code-built house lights each pane. With one number for the whole mesh a
   * house was all dark or all lit, and 28% of them were dark.
   */
  windows?: (slot: string, color: THREE.Color) => boolean;
}

// ---------------------------------------------------------------------------
// The baked models
// ---------------------------------------------------------------------------

const SCENERY_MODELS = new Map<string, Model>();

/**
 * Hands the kit baked models: the flora and the vehicles (`scripts/build-kit.ts`).
 * `main.ts` calls it with what `src/kit.ts` loaded before anything builds a
 * part; the headless checks call it with the same files read off disk.
 */
export function registerSceneryModels(models: Iterable<Model>): void {
  for (const model of models) SCENERY_MODELS.set(model.name, model);
}

export function sceneryModel(id: string): Model {
  const model = SCENERY_MODELS.get(id);
  if (model === undefined) {
    throw new Error(
      SCENERY_MODELS.size === 0
        ? `model '${id}': the kit has not been registered (registerSceneryModels)`
        : `model '${id}' is not in the registered kit`,
    );
  }
  return model;
}

const windowMasks = new WeakMap<Model, Uint8Array | null>();
/**
 * Which window each vertex of a model is glass of, 1 to 255, or 0: its glass
 * triangles joined where they share a corner, by position. Cached per model,
 * because every variant of every building asks the same question of it.
 */
function windowsOf(model: Model, isWindow: NonNullable<ModelFit['windows']>): Uint8Array | null {
  const cached = windowMasks.get(model);
  if (cached !== undefined) return cached;
  const glass = model.slots.map((slot, i) => isWindow(slot, model.defaults[i]!));
  const position = model.geometry.getAttribute('position');
  const index = model.geometry.index;
  const corners = index ? index.count : position.count;
  const vertexAt = (i: number) => (index ? index.getX(i) : i);
  const parent = new Int32Array(position.count).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]!]!;
    return x;
  };
  const byPoint = new Map<string, number>();
  const keyOf = (v: number) => `${Math.round(position.getX(v) * 1e4)},${Math.round(position.getY(v) * 1e4)},${Math.round(position.getZ(v) * 1e4)}`;
  let any = false;
  for (let t = 0; t + 2 < corners; t += 3) {
    const a = vertexAt(t);
    if (!glass[model.slot[a]!]) continue;
    any = true;
    for (let k = 0; k < 3; k++) {
      const v = vertexAt(t + k);
      parent[find(v)] = find(a);
      const key = keyOf(v);
      const same = byPoint.get(key);
      if (same === undefined) byPoint.set(key, v);
      else parent[find(same)] = find(v);
    }
  }
  if (!any) {
    windowMasks.set(model, null);
    return null;
  }
  const mask = new Uint8Array(position.count);
  const numbers = new Map<number, number>();
  for (let v = 0; v < position.count; v++) {
    if (!glass[model.slot[v]!]) continue;
    const root = find(v);
    let number = numbers.get(root);
    if (number === undefined) {
      number = (numbers.size % 255) + 1;
      numbers.set(root, number);
    }
    mask[v] = number;
  }
  windowMasks.set(model, mask);
  return mask;
}

/** The narrowest `ModelFit.narrow` draws a model, as a share of its own plan. */
const NARROWEST = 0.6;

const radii = new WeakMap<Model, number>();
/** How far a model reaches from its own vertical axis through the box's centre. */
function radiusOf(model: Model): number {
  let radius = radii.get(model);
  if (radius !== undefined) return radius;
  const position = model.geometry.getAttribute('position');
  const cx = (model.box.min.x + model.box.max.x) / 2;
  const cz = (model.box.min.z + model.box.max.z) / 2;
  radius = 0;
  for (let i = 0; i < position.count; i++) radius = Math.max(radius, Math.hypot(position.getX(i) - cx, position.getZ(i) - cz));
  radii.set(model, radius);
  return radius;
}

/**
 * Paint by role: each `[pattern, colour]` names the slots that play one part —
 * leaves, bark, stone — and every slot of a role takes the role's colour, toned
 * by how light that slot was against the role's mean. A slot no role names goes
 * to its nearest palette colour.
 */
export function rolePaint(model: Pick<Model, 'slot' | 'slots' | 'defaults'>, roles: readonly (readonly [RegExp, number])[]): Paint {
  const shares = new Array<number>(model.slots.length).fill(0);
  for (const s of model.slot) shares[s]!++;
  const lightness = model.defaults.map((color) => {
    const hsl = { h: 0, s: 0, l: 0 };
    color.clone().convertLinearToSRGB().getHSL(hsl);
    return hsl.l;
  });
  const roleOf = model.slots.map((slot) => roles.findIndex(([pattern]) => pattern.test(slot)));
  const means = roles.map((_, r) => {
    let sum = 0;
    let weight = 0;
    roleOf.forEach((role, i) => {
      if (role !== r) return;
      sum += lightness[i]! * shares[i]!;
      weight += shares[i]!;
    });
    return weight > 0 ? sum / weight : 0.5;
  });
  return (slot, original) => {
    const i = model.slots.indexOf(slot);
    const role = roleOf[i] ?? -1;
    if (role < 0) return onPalette(original);
    const mean = means[role]!;
    return toned(roles[role]![1], THREE.MathUtils.clamp(mean > 0 ? lightness[i]! / mean : 1, 0.7, 1.3));
  };
}

/** See `ModelFit.shade`. Tones in sRGB, the way `tone` does. */
function shadeUp(model: Model, geometry: THREE.BufferGeometry, shade: NonNullable<ModelFit['shade']>): void {
  const wanted = model.slots.map((slot) => shade.slots.test(slot));
  const position = geometry.getAttribute('position');
  let low = Infinity;
  let high = -Infinity;
  for (let v = 0; v < model.slot.length; v++) {
    if (!wanted[model.slot[v]!]) continue;
    low = Math.min(low, position.getY(v));
    high = Math.max(high, position.getY(v));
  }
  if (!(high > low)) return;
  const color = geometry.getAttribute('color') as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let v = 0; v < model.slot.length; v++) {
    if (!wanted[model.slot[v]!]) continue;
    const t = (position.getY(v) - low) / (high - low);
    c.fromBufferAttribute(color, v);
    c.copy(toned(c, shade.bottom + (shade.top - shade.bottom) * t));
    color.setXYZ(v, c.r, c.g, c.b);
  }
}

/**
 * A building's paint: the region's `walls`, `roofs` and `trim`, found on a pack
 * model by what its slots *are* rather than by what they are called, because an
 * atlas-coloured pack names nothing — Kenney's City Kits are a hundred swatches
 * of one `colormap`.
 *
 * - **Glass** is `isGlass` and goes to `slate` at `GLASS_TONE`.
 * - **Roof** is a slot whose faces point up on average (the mean normal's
 *   height over 0.45) and stand in the upper half of the model.
 * - **Walls** are the largest remaining colour family by vertex count — every
 *   swatch within a small hue and saturation of the largest slot — toned by
 *   their own lightness against the family's mean.
 * - **Trim** is every remaining slot darker than the walls; anything else keeps
 *   its nearest palette colour.
 */
export function buildingPaint(
  model: Model,
  colors: { walls: number; roofs: number; trim: number },
  isGlass: (slot: string, color: THREE.Color) => boolean,
): Paint {
  const count = model.slots.length;
  const shares = new Array<number>(count).fill(0);
  const up = new Array<number>(count).fill(0);
  const height = new Array<number>(count).fill(0);
  const normal = model.geometry.getAttribute('normal');
  const position = model.geometry.getAttribute('position');
  const low = model.box.min.y;
  const span = Math.max(1e-6, model.box.max.y - low);
  for (let v = 0; v < model.slot.length; v++) {
    const s = model.slot[v]!;
    shares[s]!++;
    up[s]! += normal.getY(v);
    height[s]! += (position.getY(v) - low) / span;
  }
  const hsl = model.defaults.map((color) => {
    const out = { h: 0, s: 0, l: 0 };
    color.clone().convertLinearToSRGB().getHSL(out);
    return out;
  });
  const role = new Array<'glass' | 'roof' | 'wall' | 'trim' | 'other'>(count).fill('other');
  for (let i = 0; i < count; i++) {
    if (shares[i] === 0) continue;
    if (isGlass(model.slots[i]!, model.defaults[i]!)) role[i] = 'glass';
    else if (up[i]! / shares[i]! > 0.45 && height[i]! / shares[i]! > 0.5) role[i] = 'roof';
  }
  let lead = -1;
  for (let i = 0; i < count; i++) if (role[i] === 'other' && (lead < 0 || shares[i]! > shares[lead]!)) lead = i;
  const near = (i: number, j: number) => {
    const dh = Math.min(Math.abs(hsl[i]!.h - hsl[j]!.h), 1 - Math.abs(hsl[i]!.h - hsl[j]!.h));
    return (dh < 0.06 || (hsl[i]!.s < 0.15 && hsl[j]!.s < 0.15)) && Math.abs(hsl[i]!.s - hsl[j]!.s) < 0.25;
  };
  if (lead >= 0) {
    for (let i = 0; i < count; i++) if (role[i] === 'other' && near(i, lead) && hsl[i]!.l > hsl[lead]!.l - 0.2) role[i] = 'wall';
    for (let i = 0; i < count; i++) if (role[i] === 'other' && hsl[i]!.l < hsl[lead]!.l) role[i] = 'trim';
  }
  const meanOf = (which: string) => {
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < count; i++) {
      if (role[i] !== which) continue;
      sum += hsl[i]!.l * shares[i]!;
      weight += shares[i]!;
    }
    return weight > 0 ? sum / weight : 0.5;
  };
  const means = { roof: meanOf('roof'), wall: meanOf('wall'), trim: meanOf('trim') };
  const glass = toned(PALETTE.slate, GLASS_TONE);
  return (slot, original) => {
    const i = model.slots.indexOf(slot);
    const which = role[i];
    const ratio = (mean: number) => THREE.MathUtils.clamp(mean > 0 ? hsl[i]!.l / mean : 1, 0.75, 1.25);
    if (which === 'glass') return glass;
    if (which === 'roof') return toned(colors.roofs, ratio(means.roof));
    if (which === 'wall') return toned(colors.walls, ratio(means.wall));
    if (which === 'trim') return toned(colors.trim, ratio(means.trim));
    return onPalette(original);
  };
}

export function createSceneryContext(base: MonumentContext = createContext()): SceneryContext {
  /**
   * The one vertex-coloured material every painted part in this context shares.
   * Here and not on the monument context because a painted part is a kit's
   * business and the monument context is in the world's first load, which the
   * model code (`src/models.ts`) has no reason to be.
   */
  let paintedMaterial: THREE.MeshToonMaterial | null = null;
  function painted(model: Model, paint?: Paint): THREE.Mesh {
    if (paintedMaterial === null) {
      const source = base.toon(PALETTE.ink);
      paintedMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: source.gradientMap });
      paintedMaterial.userData.outlineParameters = { ...source.userData.outlineParameters, outlineNormal: true };
      paintedMaterial.userData.atlasToon = PALETTE.white;
      paintedMaterial.userData[PAINTED_MARK] = true;
    }
    const mesh = new THREE.Mesh(paintModel(model, paint), paintedMaterial);
    mesh.name = model.name;
    return mesh;
  }

  /**
   * Same treatment every monument geometry gets, and for the same reason: one
   * normal per face, so each facet takes its own cel band instead of a smooth
   * sweep the four-step ramp cannot follow.
   */
  const meshOf = (geometry: THREE.BufferGeometry, color: number): THREE.Mesh => {
    // `roof` hands this an already non-indexed geometry; Three warns rather than
    // no-ops if it is converted twice.
    const faceted = geometry.index ? geometry.toNonIndexed() : geometry;
    if (faceted !== geometry) geometry.dispose();
    faceted.computeVertexNormals();
    return new THREE.Mesh(faceted, base.toon(color));
  };

  /**
   * A quad as two triangles, the corners given anticlockwise as seen from the
   * side the face looks at. `computeVertexNormals` on the non-indexed result
   * gives each face its own normal from that winding, so a corner order that is
   * wrong is a face that is invisible — not a face that is dark.
   */
  const quad = (
    out: number[],
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
    d: readonly number[],
  ): void => {
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  function panes(count: number, width: number, height: number, gap: number, color: number, depth = 0): THREE.Mesh {
    const points: number[] = [];
    const span = count * width + (count - 1) * gap;
    const z0 = -depth / 2;
    const z1 = depth / 2;
    for (let i = 0; i < count; i++) {
      const x0 = -span / 2 + i * (width + gap);
      const x1 = x0 + width;
      quad(points, [x0, 0, z1], [x1, 0, z1], [x1, height, z1], [x0, height, z1]);
      if (depth > 0) {
        quad(points, [x0, 0, z0], [x0, 0, z1], [x0, height, z1], [x0, height, z0]);
        quad(points, [x1, 0, z1], [x1, 0, z0], [x1, height, z0], [x1, height, z1]);
        quad(points, [x0, height, z1], [x1, height, z1], [x1, height, z0], [x0, height, z0]);
        quad(points, [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return meshOf(geometry, color);
  }

  /** How deep a window's frame stands off the wall. Two `PROUD`s: a reveal, not a decal. */
  const REVEAL = PROUD * 2;
  /** The frame showing round the glass, and between two panes. */
  const FRAME_MARGIN = 0.14;
  const FRAME_BAR = 0.12;

  const glass = base.tone(base.palette.slate, GLASS_TONE);

  /** `SceneryContext.merged`, as a plain function so `windows` can use it too. */
  function mergeMeshes(meshes: readonly THREE.Mesh[]): THREE.Mesh {
    if (meshes.length === 0) throw new Error('merged() was handed nothing to merge');
    const first = meshes[0]!;
    const material = (Array.isArray(first.material) ? first.material[0] : first.material) as THREE.Material;
    const color = material.userData.atlasToon as number | undefined;
    let vertices = 0;
    let lit = 0;
    const sources: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; own: boolean }[] = [];
    for (const mesh of meshes) {
      const theirs = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
      const stamp = theirs.userData.atlasToon as number | undefined;
      if (stamp !== color) {
        throw new Error(
          `merged() wants one colour and was given ${paletteName(color ?? 0)} and ${paletteName(stamp ?? 0)} — merge per colour`,
        );
      }
      const own = mesh.geometry.index !== null;
      const geometry = own ? mesh.geometry.toNonIndexed() : mesh.geometry;
      vertices += geometry.getAttribute('position').count;
      if (typeof mesh.userData.atlasLit === 'number') lit = Math.max(lit, mesh.userData.atlasLit as number);
      sources.push({ mesh, geometry, own });
    }

    const position = new Float32Array(vertices * 3);
    const normal = new Float32Array(vertices * 3);
    const matrix = new THREE.Matrix4();
    const normalMatrix = new THREE.Matrix3();
    const v = new THREE.Vector3();
    let cursor = 0;
    for (const { mesh, geometry, own } of sources) {
      mesh.updateMatrix();
      matrix.copy(mesh.matrix);
      if (matrix.determinant() <= 0) {
        throw new Error('merged(): a piece has a reflected transform, which would render as a solid ink blob');
      }
      normalMatrix.getNormalMatrix(matrix);
      const p = geometry.getAttribute('position');
      const n = geometry.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(matrix);
        position[cursor] = v.x;
        position[cursor + 1] = v.y;
        position[cursor + 2] = v.z;
        v.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
        normal[cursor] = v.x;
        normal[cursor + 1] = v.y;
        normal[cursor + 2] = v.z;
        cursor += 3;
      }
      mesh.removeFromParent();
      mesh.geometry.dispose();
      if (own) geometry.dispose();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    const mesh = new THREE.Mesh(geometry, material);
    if (lit > 0) mesh.userData.atlasLit = lit;
    return mesh;
  }

  function makeWindow(
    width: number,
    height: number,
    count: number,
    frame: number,
    color: number = glass,
    reveal: number = REVEAL,
  ): { frame: THREE.Mesh; glass: THREE.Mesh } {
    const plate = panes(1, width, height, 0, frame, reveal);
    if (reveal > 0) plate.geometry.translate(0, 0, reveal / 2);
    const paneWidth = (width - FRAME_MARGIN * 2 - FRAME_BAR * (count - 1)) / count;
    const pane = panes(count, paneWidth, height - FRAME_MARGIN * 2, FRAME_BAR, color);
    pane.geometry.translate(0, FRAME_MARGIN, reveal + PROUD);
    pane.userData.atlasLit = 1;
    return { frame: plate, glass: pane };
  }

  function fitted(id: string, fit: ModelFit, paint?: Paint): THREE.Group {
    const model = sceneryModel(id);
    const size = model.box.getSize(new THREE.Vector3());
    let squash = fit.squash ?? 1;
    if (fit.narrow === true && fit.height !== undefined) {
      // The height is the model's and the plan gives way to the footprint.
      const tall = fit.height / size.y;
      const room = Math.min(
        fit.radius !== undefined ? fit.radius / (radiusOf(model) * tall) : Infinity,
        fit.width !== undefined ? fit.width / (size.x * tall) : Infinity,
        fit.length !== undefined ? fit.length / (size.z * tall) : Infinity,
      );
      squash = Math.min(squash, Math.max(NARROWEST, room));
    }
    const k = Math.min(
      fit.height !== undefined ? fit.height / size.y : Infinity,
      fit.width !== undefined ? fit.width / (size.x * squash) : Infinity,
      fit.length !== undefined ? fit.length / (size.z * squash) : Infinity,
      fit.radius !== undefined ? fit.radius / (radiusOf(model) * squash) : Infinity,
    );
    if (!Number.isFinite(k)) throw new Error(`model '${id}': a fit needs a height, a width, a length or a radius`);
    const mesh = painted(model, paint);
    if (fit.shade !== undefined) shadeUp(model, mesh.geometry, fit.shade);
    if (fit.windows !== undefined) {
      const mask = windowsOf(model, fit.windows);
      if (mask !== null) {
        mesh.geometry.setAttribute('atlasWindow', new THREE.BufferAttribute(mask, 1));
        mesh.userData.atlasLit = 1;
      }
    }
    // Centred on its axis before anything turns it, so a yaw spins it in place.
    mesh.position.set(-(model.box.min.x + model.box.max.x) / 2, -model.box.min.y, -(model.box.min.z + model.box.max.z) / 2);
    mesh.castShadow = true;
    const turned = new THREE.Group();
    turned.rotation.y = fit.yaw ?? 0;
    turned.add(mesh);
    // Scale in a parent of the turn, so the squash stays across whatever the yaw.
    const sized = new THREE.Group();
    sized.scale.set(k * squash, k, k * squash);
    sized.position.y = -(fit.sink ?? 0);
    sized.add(turned);
    const group = new THREE.Group();
    group.add(sized);
    return group;
  }

  return {
    ...base,
    painted,
    fitted,
    glass,

    panes,

    window: makeWindow,

    windows(row) {
      const {
        count,
        width,
        height,
        panes: paneCount = 2,
        spread = width * 1.9,
        frame,
        glass: color = glass,
        shutters,
        reveal = REVEAL,
        strength = 1,
      } = row;
      const group = new THREE.Group();
      // Collected by colour rather than by role, so a frame and a shutter cut
      // from the same tone come out as one mesh instead of two saying the same
      // thing. `merged` refuses a mix, which is the check on this.
      const byColor = new Map<number, THREE.Mesh[]>();
      const keep = (mesh: THREE.Mesh, tint: number): void => {
        const list = byColor.get(tint);
        if (list) list.push(mesh);
        else byColor.set(tint, [mesh]);
      };

      const span = (count - 1) * spread;
      for (let i = 0; i < count; i++) {
        const x = -span / 2 + i * spread;
        const made = makeWindow(width, height, paneCount, frame, color, reveal);
        made.frame.position.x = x;
        made.glass.position.x = x;
        made.glass.userData.atlasLit = Math.max(0, Math.min(1, strength));
        keep(made.frame, frame);
        group.add(made.glass);
        if (shutters !== undefined) {
          // Two leaves folded back against the wall, `width` apart so they
          // clear the opening. One `panes` call is the pair, and it sits
          // shallower than the frame so the frame keeps the deepest ink line.
          const pair = panes(2, width * 0.42, height, width + 0.04, shutters, PROUD);
          pair.geometry.translate(0, 0, PROUD / 2);
          pair.position.x = x;
          keep(pair, shutters);
        }
      }
      for (const list of byColor.values()) group.add(mergeMeshes(list));
      return group;
    },

    merged: mergeMeshes,

    roof(width, depth, height, ridge, color) {
      const hw = width / 2;
      const hd = depth / 2;
      const hr = Math.max(0, Math.min(width, ridge)) / 2;
      // Base corners, then the two ends of the ridge.
      const a: [number, number, number] = [-hw, 0, -hd];
      const b: [number, number, number] = [hw, 0, -hd];
      const c: [number, number, number] = [hw, 0, hd];
      const d: [number, number, number] = [-hw, 0, hd];
      const p: [number, number, number] = [-hr, height, 0];
      const q: [number, number, number] = [hr, height, 0];

      const points: [number, number, number][] = [];
      const face = (...corners: [number, number, number][]) => points.push(...corners);
      // Winding checked by hand against the outward normal of each face: a
      // reversed triangle is invisible from outside and its inverted hull
      // swallows the mesh, which looks like a bug in the outline rather than in
      // the geometry.
      face(a, p, q);
      face(a, q, b); // -Z slope
      face(d, c, q);
      face(d, q, p); // +Z slope
      face(b, q, c); // +X end
      face(a, d, p); // -X end
      face(a, b, c);
      face(a, c, d); // underside
      const kept =
        hr > 1e-4
          ? points
          : // A pyramid's two ridge points coincide, so half of each slope is a
            // zero-area triangle — and `computeVertexNormals` turns those into
            // NaN normals, which black-holes the whole mesh.
            points.filter((_, index) => {
              const triangle = Math.floor(index / 3);
              return triangle !== 1 && triangle !== 3;
            });

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept.flat(), 3));
      return meshOf(geometry, color);
    },

    dome(radius, height, color, sides = 12, rings = 3) {
      // Bottom centre, rim, then up the quarter-ellipse to the crown. Starting
      // at the centre is what closes the underside; `ringWall` does the same.
      const profile = [new THREE.Vector2(0, 0)];
      for (let i = 0; i <= rings; i++) {
        const angle = (i / rings) * (Math.PI / 2);
        profile.push(new THREE.Vector2(radius * Math.cos(angle), height * Math.sin(angle)));
      }
      return meshOf(new THREE.LatheGeometry(profile, sides), color);
    },

    lit(mesh, strength = 1) {
      // A number in `userData` and not a second material: the town is merged, so
      // what reaches the screen is a vertex attribute, and a `lit` variant of
      // every glass colour would be a shader program and an outline material
      // bought for nothing.
      mesh.userData.atlasLit = Math.max(0, Math.min(1, strength));
      return mesh;
    },

    rim(width, depth, thickness, height, color) {
      const outer = width / 2;
      const inner = Math.max(0.02, outer - thickness);
      const k = Math.SQRT2;
      const mesh = base.ringWall(inner * k, outer * k, height, color, 4);
      mesh.geometry.rotateY(Math.PI / 4);
      mesh.scale.z = depth / width;
      return mesh;
    },

    blob(radius, height, color, detail = 0) {
      const geometry = new THREE.IcosahedronGeometry(1, detail);
      geometry.computeBoundingBox();
      // Read the numbers out before scaling. `BufferGeometry.scale` recomputes
      // the bounding box *in place*, so holding a reference to it and using it
      // afterwards applies the scale twice — which is a canopy three times the
      // size it asked for, and it is invisible until something measures it.
      const { min, max } = geometry.boundingBox!;
      const sx = (radius * 2) / (max.x - min.x);
      const sy = height / (max.y - min.y);
      const sz = (radius * 2) / (max.z - min.z);
      const cx = (min.x + max.x) * 0.5;
      const cz = (min.z + max.z) * 0.5;
      const low = min.y;
      geometry.scale(sx, sy, sz);
      geometry.translate(-cx * sx, -low * sy, -cz * sz);
      return meshOf(geometry, color);
    },
  };
}

// ---------------------------------------------------------------------------
// The part
// ---------------------------------------------------------------------------

export interface ScenicPart {
  /** Kebab-case, unique, and the file is named after it: `gabled-house.ts`. */
  id: string;
  name: string;
  kind: PartKind;
  /**
   * Radius of the circle **every** variant must stay inside.
   *
   * Stricter than a monument's, because a monument declares a footprint for one
   * model and this one is a promise about a family: the review sheet builds a
   * dozen seeds and holds all of them to it. A layout that has to re-measure
   * each variant is a layout that cannot be a table of transforms.
   */
  footprint: number;
  /** One line on the sheet: what this is and what it is for. */
  note?: string;
  /**
   * A triangle cap of the part's own, over its kind's. **A baked model's**: a
   * Kenney house is a thousand triangles where a code-built one is two hundred,
   * and the kind's cap is kept tight for the parts built in code.
   */
  triangles?: number;
  /**
   * Builds **one variant**.
   *
   * Deterministic in `rng` and `style` and nothing else — no `Math.random()`, no
   * `Date`, no module-level counters. The review sheet builds each variant twice
   * from the same seed and compares, exactly as the monument loader does.
   *
   * The `Group` it returns follows the monument rules: faces +Z, base at y = 0,
   * inside `footprint`, identity transform, materials only from `ctx.toon`.
   */
  build(ctx: SceneryContext, rng: Rng, style: RegionStyle): THREE.Group;
}

/** The seed for one variant. Identity, not order: see `random.ts`. */
export function variantRng(part: ScenicPart, style: RegionStyle, variant: number): Rng {
  return rngFrom(part.id, style.id, variant);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type { Measurements } from '../monuments/contract.ts';
export { measure, paletteName } from '../monuments/contract.ts';
export type { Group, Mesh, Object3D, Vector3 } from '../monuments/contract.ts';
export type { Rng, Weighted } from './random.ts';
export { rngFrom, seedOf } from './random.ts';

const round = (value: number): string => value.toFixed(1);

/** Everything wrong with one built variant, in plain English. Empty means it is fine. */
export function validatePart(part: ScenicPart, group: THREE.Group): string[] {
  const problems: string[] = [];
  const kind = KINDS[part.kind];
  if (!kind) return [`kind '${part.kind}' is not one of ${Object.keys(KINDS).join(', ')}`];

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(part.id)) problems.push(`id '${part.id}' is not kebab-case`);

  if (group.position.lengthSq() > 1e-6) problems.push('group.position must be the origin');
  if (group.rotation.x !== 0 || group.rotation.y !== 0 || group.rotation.z !== 0) {
    problems.push('group.rotation must be identity — bake the rotation into the children');
  }
  if (Math.abs(group.scale.x - 1) > 1e-6 || Math.abs(group.scale.y - 1) > 1e-6) {
    problems.push('group.scale must be 1 — the instance carries the scale, not the variant');
  }

  group.traverse((object) => {
    if (object === group) return;
    const kinds = object as unknown as Record<string, boolean>;
    if (kinds.isPoints || kinds.isLine || kinds.isSprite) {
      problems.push(`${object.type} is not allowed: OutlineEffect only inks meshes`);
      return;
    }
    if (kinds.isLight || kinds.isCamera) {
      problems.push(`${object.type} is not allowed: the scene owns the lights and the camera`);
      return;
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material.userData.atlasToon === undefined) {
        problems.push(`a ${material.type} escaped ctx.toon — every material must come from it`);
      }
      if (material.side !== THREE.FrontSide) {
        problems.push('materials must stay FrontSide — the outline is an inverted back-face hull');
      }
    }
  });

  const { triangles, meshes, height, base, radius, colors } = measure(group);
  if (meshes === 0) {
    problems.push('the variant is empty');
    return problems;
  }

  if (Math.abs(base) > 0.06) {
    problems.push(base < 0 ? `sinks ${round(-base)} below y = 0` : `floats ${round(base)} above y = 0`);
  }
  if (!(part.footprint > 0) || part.footprint > kind.footprint) {
    problems.push(`footprint ${part.footprint} is outside the '${part.kind}' kind's 0..${kind.footprint}`);
  }
  if (radius > part.footprint + 0.05) {
    problems.push(`reaches ${round(radius)} out, past its ${part.footprint}-unit footprint`);
  }
  if (height > kind.height + 0.05) {
    problems.push(`is ${round(height)} tall, over the '${part.kind}' cap of ${kind.height}`);
  }
  if (height < kind.minHeight) {
    problems.push(`is only ${round(height)} tall — under the '${part.kind}' floor of ${kind.minHeight}`);
  }
  const budget = part.triangles ?? kind.triangles;
  if (triangles > budget) {
    problems.push(`${triangles} triangles, over the '${part.id}' budget of ${budget}`);
  }
  if (meshes > kind.meshes) {
    problems.push(`${meshes} meshes, over the '${part.kind}' budget of ${kind.meshes}`);
  }
  if (colors.length > kind.colors) {
    problems.push(
      `${colors.length} palette colours, over the '${part.kind}' budget of ${kind.colors} — ` +
        `colours are draw calls here, see KindSpec.colors`,
    );
  }
  return problems;
}

export interface Variety {
  /** Distinct silhouettes across the sample, by height and width to a tenth of a unit. */
  shapes: number;
  /** Distinct colour sets across the sample. */
  palettes: number;
  samples: number;
}

/**
 * How much a part actually varies.
 *
 * The monument contract has no equivalent, and could not: a monument that came
 * out the same twice is *correct*. Here it is the whole failure mode. A part
 * that ignores its seed produces a village of one house repeated, which no
 * bounding-box check can see and which is instantly obvious on the sheet — so
 * this is the mechanical half of that judgement, and the cluster view is the
 * other half.
 */
export function varietyOf(measurements: readonly Measurements[]): Variety {
  const shapes = new Set<string>();
  const palettes = new Set<string>();
  for (const m of measurements) {
    shapes.add(`${m.height.toFixed(1)}x${m.radius.toFixed(1)}`);
    palettes.add([...m.colors].sort((a, b) => a - b).join(','));
  }
  return { shapes: shapes.size, palettes: palettes.size, samples: measurements.length };
}
