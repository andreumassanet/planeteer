import * as THREE from 'three';
import type { Model, Paint } from '../../models.ts';
import type { MonumentContext } from '../../monuments/contract.ts';
import type { DoorSpec, WindowRow } from './style.ts';

/**
 * Everything a part may build with.
 *
 * It extends `MonumentContext` rather than reimplementing it: one `toon`, one
 * ramp, one material per colour, one outline thickness, so a settlement is
 * inked with the same pen as the monument in the middle of it. The conventions
 * are the monument ones: everything stands on its own base, and flat faces look
 * at +Z.
 */
export interface SceneryContext extends MonumentContext {
  /**
   * A pack model (`src/models.ts`) as a mesh of this world: its own geometry,
   * shared, with a colour attribute written by `paint`, drawn with the one
   * vertex-coloured toon material and inked along its welded `outlineNormal`.
   *
   * The way a CC0 asset enters the kit. The material is still this context's, on
   * this context's ramp, and every colour `paint` returns should come off the
   * palette (`onPalette` and `bodyPaint` in `models.ts`). The flatteners in
   * `settlements.ts`, `vegetation.ts` and `life.ts` read the vertex colours and
   * the outline normals rather than the material's stamp.
   */
  painted(model: Model, paint?: Paint): THREE.Mesh;

  /**
   * Geometry built in code that carries its own linear `color` attribute, as
   * a mesh drawn with the same vertex-coloured material `painted` uses: a
   * tree's trunk and crown (`tree-forms.ts`), whose shade is worked out a
   * vertex at a time and would be a palette entry a vertex otherwise.
   */
  coloured(geometry: THREE.BufferGeometry): THREE.Mesh;

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
   * centred on X, standing on y = 0 and facing +Z. One mesh for the row.
   *
   * A pane is a quad: two triangles and no back, so it gets no ink (the outline
   * hull is the mesh's back faces pushed out). A pane is a few pixels wide at
   * distance and the pen is three, so an inked pane would be a blob; the frame it
   * sits on carries the ink and the pane the colour.
   *
   * With `depth > 0` it makes plates instead: a front and four sides, ten
   * triangles, inked. A frame, a shutter, a sill and a lintel are plates.
   */
  panes(count: number, width: number, height: number, gap: number, color: number, depth?: number): THREE.Mesh;

  /**
   * One window: a frame plate in `frame` with `panes` glass quads on it, lit.
   *
   * Both meshes stand on y = 0 with the frame's back at z = 0, the frame
   * `REVEAL` deep and the glass `PROUD` in front of its face, so the pair placed
   * at the wall's surface is a window in the wall. Collect the frames and hand
   * them to `merged` once. The glass stays a mesh per window because
   * `settlements.ts` lights each lit mesh on its own seed.
   *
   * `reveal` is how deep the frame stands off the wall; zero makes a painted
   * frame (a quad, no ink) for the back and sides of a house.
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
   * The row merges every frame into one mesh and every shutter into another (a
   * merge per colour) and leaves the glass one mesh a window, so a house keeps
   * its mesh budget and `settlements.ts` can still light each window on its own
   * seed. Put it on the wall's surface and nothing else: the reveal and the
   * `PROUD` step are baked in. For the back and sides of a building pass
   * `reveal: 0`, or lay one `panes` row.
   */
  windows(row: WindowRow): THREE.Group;

  /**
   * A front door set into a wall, as one group standing on y = 0 and facing +Z,
   * centred on X, with the wall's face at z = 0.
   *
   * A wall here is a box and cannot be cut, so the recess is drawn the other way
   * round: an architrave in the wall's light tone stands `DOOR_REVEAL` off the
   * wall on three sides, its inner faces are the reveal, and the leaf is a quad
   * a `PROUD` off the wall, far behind the frame's face, so the leaf reads as
   * sunk into it.
   *
   * The opening is `width` by `height` over `sill`; the whole thing reaches
   * `width / 2 + DOOR_JAMB` either side, which is what a part lays its windows
   * clear of. Its frame and leaf are marked `atlasDoor`, and `validatePart` fails
   * a variant whose door crosses a window. 18 triangles of frame, 2 of leaf, 8 of
   * panels and 12 of step: four meshes.
   */
  door(spec: DoorSpec): THREE.Group;

  /**
   * Several meshes of one colour, baked into one.
   *
   * Each mesh's own transform is applied to its vertices and the result has
   * none, so build the pieces where they belong and merge last. The sources are
   * consumed: removed from any parent and their geometry disposed. One colour
   * only, because one mesh is one material: merge per colour. A lit piece keeps
   * its mark on the whole, at the strongest of them. Every piece's determinant
   * is asserted positive, since a reflected piece flips its winding and the pen
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
   * It is not `ringWall(a, b, h, c, 4)`: a four-sided lathe puts its corners on
   * the axes, so that is a diamond, not a square. The quarter-turn is baked into
   * the geometry rather than set on the mesh because the local matrix is T*R*S:
   * scaling z on a rotated mesh shears the square back into a diamond.
   */
  rim(width: number, depth: number, thickness: number, height: number, color: number): THREE.Mesh;

  /**
   * Marks a mesh as something that is lit from the inside after dark, and
   * returns it, so it wraps the call that made it: `lit(box(w, h, d, glass))`.
   *
   * It changes nothing the contract measures (`measure` counts colours by
   * `userData.atlasToon`), so a window that lights up costs nothing against the
   * kind's budgets. It sets a flag that `settlements.ts` reads while flattening
   * the variant into the town's buffer, where it becomes a byte per vertex and,
   * at night, emission (`src/lights.ts`).
   *
   * Mark the glazing, not the wall: a whole building face that emits is a lantern
   * rather than a house. `strength` is a ceiling, not a value: the town still
   * draws each window dark or lit on its own seed, so `lit(door, 0.5)` says
   * "never more than half a window".
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
   * `width` and `length` given, down to `NARROWEST`, rather than shrink the whole
   * model to them. A pack house is wider than a code-built one, and fitted to a
   * footprint radius alone it would either come out too short or not fit
   * the cells a gabled house stands in. A corner cell of the median pitch leaves
   * a house 8.4 by 8.4, and `FIT_SCALE` lets it shrink a tenth.
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
   * How tall the model's front door stands (`doorOf`), in world units. With
   * no `height` the model is fitted to stand it so; wherever the fit holds it
   * shorter, the band under `lift` is drawn taller to make the door up. The
   * mesh carries the door as `atlasDoorHeight`.
   */
  door?: number;
  /** The model's own door, in its units, where `doorOf` cannot read it off the model. */
  modelDoor?: number;
  /** The band `door` may stretch, in the model's units from its foot: its walls under the eaves. The whole model by default. */
  lift?: number;
  /**
   * Marks the slots `windows` names as glass that lights after dark: the mesh
   * carries `atlasLit` like a code-built pane, and a per-vertex `atlasWindow`
   * byte says which of its vertices are the glass, because a painted building is
   * one mesh and its walls must not glow with it (`flatten` in `settlements.ts`).
   *
   * The byte is the window's number, 1 to 255 (each connected patch of glass is
   * one), so `flatten` can draw each window's light on its own.
   */
  windows?: (slot: string, color: THREE.Color) => boolean;
}
