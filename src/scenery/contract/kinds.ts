import { BODY_SCALE } from '../../stature.ts';

/**
 * What a part is, which is also what it costs.
 *
 * - `scatter` — rocks, bushes, stumps, the things that stop ground being empty.
 * - `tree` — one tree. A tree is a mark, not a model.
 * - `dwelling` — where one household lives: 1 to 3 storeys.
 * - `block` — the fabric of a town: 4 or 5 storeys, terraces and slabs.
 * - `civic` — the one building that tells you *where* you are: a church, a
 *   mosque, a pagoda. One per settlement, so it may cost twice a dwelling.
 * - `person` — somebody living there. Sized by `AVATAR_HEIGHT` rather than
 *   authored in storeys, which is why it is a row here rather than a short
 *   `dwelling` — see `src/scenery/people.ts`.
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
   * Cap on distinct palette colours in one variant, the tightest number in this
   * table. Draw calls are the binding cost of a town, and every way of drawing
   * one multiplies by the colour count: merged by material a town costs
   * `colours` draw calls per variant present.
   */
  colors: number;
}

export const KINDS: Record<PartKind, KindSpec> = {
  // The caps a tree's and a bush's solid build is held to (the trunk and the
  // crown of lumps a town and a far tile draw, `tree-forms.ts`). A near tile's
  // cards are not a part's build and not under these; `vegetation.ts` prices them
  // (`CARD_LEVEL`). The cactus is Kenney's (Nature Kit, CC0).
  scatter: { height: 6, minHeight: 0.5, footprint: 3.5, triangles: 110, meshes: 8, colors: 3 },
  tree: { height: 26, minHeight: 4, footprint: 8, triangles: 240, meshes: 14, colors: 3 },
  // The building kinds' caps leave room for framed windows: a frame plate is ten
  // triangles and a two-pane window fourteen, and a house wants six or seven of
  // them plus a course, an eave band, a ridge cap and a lintel at twelve apiece.
  // A cap is a ceiling: the median part is a two-storey house, which measures
  // 216 against the 264 it may spend.
  // The heights are `STOREY`'s: a three-storey flat-roofed house under its
  // roof stair stands 20.6, and a five-storey tower under its mast 37.5, under
  // the monuments' `building` tier of 40.
  dwelling: { height: 22, minHeight: 5, footprint: 9, triangles: 264, meshes: 30, colors: 5 },
  block: { height: 38, minHeight: 13, footprint: 14, triangles: 456, meshes: 40, colors: 5 },
  civic: { height: 38, minHeight: 11, footprint: 16, triangles: 624, meshes: 52, colors: 6 },
  // A person is built of soft shapes (`src/soft.ts`). Triangles: `pnpm people`
  // over 840 builds measures a median of 700 and a worst of 1,024, so the cap is
  // the worst plus a tenth; only the nearest `PEOPLED_RANK` towns carry a crowd
  // (`settlements.ts`). Meshes: worst 29, capped at 32. Colours: seven, the
  // hero's own count (skin, hair, top, bottom, trim, the one bright thing, and
  // the ink of the eyes), so a crowd is never richer than the player. A person is
  // merged by vertex colour, so the seventh colour is two eyes and not a draw
  // call. The height range spans a small child under a hat (3.2) to the tallest
  // adult in a conical one (8.4) on the 6.8-unit body those were measured on
  // (`BODY_SCALE`).
  person: { height: 8.4 * BODY_SCALE, minHeight: 3.2 * BODY_SCALE, footprint: 3.2 * BODY_SCALE, triangles: 1130, meshes: 32, colors: 7 },
};

/**
 * How many variants of one part a settlement builds.
 *
 * A part's `build` is a variant factory, not an instance factory: a house that
 * draws its storey count and width from a seed produces unique geometry, which
 * cannot be instanced. So the kit builds each part a fixed small number of
 * times per region, and a town places instances of those variants (position,
 * yaw and a uniform scale, nothing else).
 *
 * Six is chosen against the draw-call arithmetic: about nine parts a region
 * times six variants times four colours is 216 instanced meshes, doubled by the
 * outline pass; twelve variants would be 864. With eight yaws and a continuous
 * scale, six variants give a hundred-plot village more distinct silhouettes
 * than it has plots.
 *
 * Per-instance variety must therefore be expressible as a transform; anything
 * else (a different roof, a chimney, one more storey) is a variant, decided at
 * build time from the variant's own `Rng`.
 */
export const VARIANTS = 6;
