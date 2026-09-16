import * as THREE from 'three';
import { PALETTE, createToonRamp } from '../theme.ts';
import { paintModel } from '../models.ts';
import type { Model, Paint } from '../models.ts';

/**
 * The monument contract.
 *
 * Sixty of these will be written by sixty different hands, in parallel, with no
 * chance to look at each other's work. Everything in this file exists to make
 * that produce one world instead of sixty. The rule that does most of the work
 * is short: **a monument may only make materials through `ctx.toon`, and
 * `ctx.toon` only accepts colours from `PALETTE`.** Same ramp, same outline
 * width, same twenty-four colours, so a Colosseum written on Tuesday and a
 * Taj Mahal written on Wednesday are lit and inked identically.
 *
 * Everything else — tiers, footprints, budgets — is enforced mechanically by
 * `validate` below, and shown per monument on the contact sheet.
 */

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

/**
 * Why monuments are sized by tier and not in metres.
 *
 * `PLANET_RADIUS` is 16,000 units for an Earth of 6,371 km, so a metre is
 * 0.00251 units. At that rate:
 *
 * - **True scale.** The Eiffel Tower is 330 m, so 0.83 units — an eighth of the
 *   6.8-unit avatar, who is himself a 2,708 m giant. You would walk past it.
 * - **Avatar scale** (scale the tower by the same factor that makes a 1.8 m
 *   human 6.8 units). The Eiffel Tower becomes 1,247 units: five times the
 *   width of Mallorca, a tenth of the planet's radius, visible from Africa.
 *
 * Neither is a game. So size is chosen by *how far away the thing should still
 * be nameable*, and the four tiers below are that answer. A tier fixes the
 * model's height; real height survives only as `realHeight`, on the info card.
 *
 * The consequence is deliberate and worth stating plainly: Christ the Redeemer
 * (38 m) and the Eiffel Tower (330 m) are both `landmark`, both 120 units. In
 * metres that is absurd; in the world it is right, because both are things you
 * are meant to spot from out at sea and walk towards.
 */
export type MonumentTier = 'monument' | 'building' | 'tower' | 'landmark';

export interface TierSpec {
  /** Model height in world units. The model may come in under it, never over. */
  height: number;
  /** Largest `footprint` radius a monument of this tier may declare. */
  footprint: number;
  /** Hard triangle cap. */
  triangles: number;
  /**
   * Hard cap on meshes. Draw calls, not triangles, are what sixty monuments in
   * one scene actually cost, and `OutlineEffect` doubles them: every mesh is
   * drawn twice, once as itself and once as its inverted hull.
   */
  meshes: number;
}

/**
 * The tiers. Pick by the question "from how far should a player be able to name
 * it?", not by metres:
 *
 * - `monument` — you find it by walking into it. A gate, a statue, a fountain,
 *   a stone circle.
 * - `building` — you see it from the far side of the city. An amphitheatre, an
 *   opera house, a palace, a cathedral.
 * - `tower` — the landmark of its city. Big Ben, Pisa, the Statue of Liberty.
 * - `landmark` — the landmark of the planet. Eiffel, Burj Khalifa, Christ the
 *   Redeemer, the Pyramids.
 *
 * The footprint caps are not decoration. `tower` is capped tighter than
 * `building` *on purpose*: at 70 units tall and 28 wide nothing in that tier can
 * come out squat. It is the contract refusing to let the Arc de Triomphe be
 * filed as a tower — at 70 units tall it would be 63 wide, so it is a
 * `building`, which is also how it reads on the ground.
 */
export const TIERS: Record<MonumentTier, TierSpec> = {
  monument: { height: 15, footprint: 14, triangles: 900, meshes: 40 },
  building: { height: 40, footprint: 55, triangles: 2600, meshes: 110 },
  tower: { height: 70, footprint: 28, triangles: 1800, meshes: 80 },
  landmark: { height: 120, footprint: 55, triangles: 3600, meshes: 130 },
};

/**
 * How much of its tier a model has to fill. Something 4 units tall filed as a
 * `landmark` is a mistake, not a style. Width counts too, so a wide flat thing
 * (a stone circle, a wall) passes on its diameter.
 *
 * **This measures the bounding box, not what is inside it**, and there is no
 * version of it that could. The first Christ the Redeemer here was a post with a
 * crossbar: 236 triangles of a 3,600 budget, and it passed this check with room
 * to spare because a cross fills a box perfectly. Nothing in `validate` can tell
 * you a model is too bare. That judgement is the contact sheet's thumbnail, and
 * it is the reason the contact sheet exists.
 */
const FILL = 0.6;

/** How much of its declared `footprint` a model has to use, so placement can trust it. */
const FOOTPRINT_FILL = 0.55;

/**
 * Widest a model may be against its own height.
 *
 * Past this a monument cannot be built whole: at the `landmark` tier's 120 units
 * the Golden Gate would be 1,440 long, six Mallorcas. And `footprint` is a
 * circle — it has no long axis to give you even if you wanted one.
 *
 * **It is measured on the half-diagonal, not the width, so work the number out
 * before you plan rather than after.** `measure` takes the greatest horizontal
 * distance any vertex reaches from the Y axis, which for a rectangular building
 * is `hypot(width, depth) / 2`; the test is `2 * radius <= MAX_ASPECT * height`,
 * so what must hold is `halfDiagonal / height <= 2`. A merely rectangular
 * building can fail a cap that sounds as though it were aimed at bridges: the
 * Parthenon's true half-diagonal against its height is 2.13 where 2.00 is
 * allowed — seven per cent too flat to build honestly — and its agent found that
 * out having already planned at true scale.
 *
 * **The policy is settled; do not invent a different one.** Crop to a
 * representative section, then *exaggerate the vertical* until the crop sits
 * just under the cap, and write in the file what you cropped and by how much you
 * stretched. The Golden Gate keeps its two towers and the span between them,
 * vertical at 2.3x, and reads perfectly. That is not a compromise, it is what
 * every photograph of a bridge already does: the thing that names a suspension
 * bridge is the tower-cable-tower rhythm, never the length of the deck. The
 * Great Wall, Tower Bridge, Sydney Harbour Bridge, Mount Rushmore, the Great
 * Sphinx and Victoria Falls are all this same case.
 *
 * The trade runs the other way just as often. Stonehenge at true proportions
 * inside the `monument` tier's 14-unit footprint gives uprights half the
 * avatar's height, so its *plan* is squeezed about 2:1 against its heights
 * instead.
 *
 * **The rule both obey: a tier is a budget in world units, so when a shape does
 * not fit, distort the axis that carries the least recognition and protect the
 * one that carries the most.** The proportion you would name the thing by is the
 * one that has to survive.
 *
 * And a stretch is never free — it moves a proportion somewhere else, so find
 * where. The Parthenon took 1.30 on the vertical, which put its column shafts at
 * 7.1 diameters: Ionic proportion, on a Doric temple. The shafts had to thicken
 * 15% to stay visibly Doric. Fix what your stretch broke, and write both numbers
 * in the file.
 */
export const MAX_ASPECT = 4;

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

/**
 * The Three types a monument file needs in order to *name* something.
 *
 * A monument imports one module — this one — and builds only through `ctx`. That
 * rule is the whole reason independently written monuments fit together: it is
 * what stops a file quietly reaching for a `MeshStandardMaterial`, a geometry
 * the helpers do not make, or a loader that wants an external asset.
 *
 * It had one cost, and it was not obvious. `ctx.THREE` is a *value*, so there is
 * no `THREE` namespace in scope to write a type against, and the natural
 *
 *     const shell = (ctx: MonumentContext, n: number): THREE.Group => { ... }
 *
 * fails with `TS2503: Cannot find namespace 'THREE'`. Three separate monuments
 * lost a debugging round to that before anyone noticed the pattern, because
 * annotating a helper's return type is the obvious thing to do, and the rule
 * that made the file safe was the rule that forbade it.
 *
 * So the four types worth naming come through here, and the one import stays
 * true:
 *
 *     import type { Monument, MonumentContext, Group } from './contract.ts';
 *
 * Four, not the library. These are the return and parameter types of the `ctx`
 * helpers and nothing else; if you find yourself wanting a fifth, you are
 * probably about to build something `ctx` should be building for you.
 */
export type { Group, Mesh, Object3D, Vector3 } from 'three';

/**
 * Everything a monument is allowed to build with.
 *
 * Two conventions run through all of it, and they are the same two the monument
 * itself must obey, which is why there is nothing to remember:
 *
 * 1. **Everything stands on its own base.** Every helper returns a mesh whose
 *    origin is the centre of its bottom face, so `mesh.position.y = 12` puts it
 *    standing on a floor at 12. (`strut` is the one exception — it is placed by
 *    its two endpoints.)
 * 2. **Flat faces look at +Z.** Polygonal solids are rotated by half a segment
 *    so a face, not an edge, points at the front. Without it `column(r, h, c, 4)`
 *    is a diamond seen from the front, which surprises everyone once.
 *
 * The `radius` arguments are half-widths **across the flats** (the apothem), not
 * circumradii, because that is the number you need when you stack one thing on
 * another. At 8+ sides the difference is under 2%; at 4 it is 41%.
 */
export interface MonumentContext {
  /**
   * Passed in rather than imported so every monument provably shares one Three
   * instance, and so a monument file needs no import but its own types.
   */
  THREE: typeof THREE;

  /**
   * The twenty-four colours, and the only ones a monument may use.
   *
   * **Anything that will sit in shade wants a warm entry.** A surface turned away
   * from the sun keeps about half its brightness and shifts five to ten per cent
   * cooler, and a neutral has no hue left to survive that. Measured off this
   * scene's own lights, one vertical wall lit and then turned away:
   *
   * ```
   * bone   143,122,100  ->   76, 68, 58    a dark hueless patch
   * slate   50, 41, 53  ->   27, 23, 31    blue: it has more B than R
   * steel   24, 23, 21  ->   13, 13, 12    effectively black
   * sand   206,144, 69  ->  110, 80, 40    still obviously sand
   * ```
   *
   * Seen through a colonnade with cyan sky in the gaps, the first three read as a
   * *hole* rather than a wall. That is what happened to the Parthenon's cella
   * until it moved from `bone` to `tan`, and it is not a fact about the
   * Parthenon: the `HemisphereLight`'s sky colour is `SKY_TOP`, so it is a fact
   * about every recess in the world. It matters more than it sounds, because
   * recesses are how these models get their depth in the first place.
   *
   * For a courtyard, a portico, a doorway or anything behind columns: `sand`,
   * `tan`, `brown`, `clay`, `blush`, `bark`, `darkOlive`. And note `white` is
   * 0xfff2e8, a *warm* white that holds up at 132,111,88 in shade — wanting white
   * marble, reach for it or `cream`, never for `bone`.
   */
  palette: typeof PALETTE;

  /**
   * The **only** way to make a material. Nobody calls `new MeshToonMaterial`.
   * Throws on a colour that is not in `PALETTE`, which is the cheapest possible
   * moment to catch the one mistake that would break the world's unity.
   *
   * Materials are shared between every monument that asks for the same colour.
   * Do not mutate the one you are handed.
   */
  toon(color: number): THREE.MeshToonMaterial;

  /**
   * A tone of a palette colour: the same hue, darker or lighter by `factor`
   * (0.82 is the shadow side of a thing, 1.1 its sunlit one; the range is
   * 0.5 to 1.5). The result is a colour `toon` accepts, and `measure` counts it
   * under its *base* colour — tones of one colour are one colour for the
   * budget, because a merged town or tile carries them as vertex bytes for
   * free and only a monument on the contact sheet pays a material for one.
   *
   * This is what a cone needs to read as a tree: three cones in three tones of
   * one green is a conifer, and three cones in one green is a stack of cones.
   * Keep tones *of the palette* — a derived colour is never an excuse to invent
   * a hue.
   */
  tone(color: number, factor: number): number;

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

  /** Rectangular block, centred in x and z, standing on y = 0. */
  box(width: number, height: number, depth: number, color: number): THREE.Mesh;

  /**
   * Regular prism, standing on y = 0. `radius` is the half-width across the flats.
   *
   * It is a **whole** prism, and `OutlineEffect` inks every silhouette that is
   * not occluded — including the half you meant to hide. An arch head made from
   * a `column` laid on its side and left even 0.03 units proud of its jambs gets
   * the ink line of its *lower* half drawn straight across the opening, and the
   * arches read as wheels. Charles Bridge's nine did, until its head was made
   * shallower than the void it sits in so the bottom arc is buried and only the
   * visible upper arc is inked. Make the head shallower than the wall, never
   * flush and never proud.
   */
  column(radius: number, height: number, color: number, sides?: number): THREE.Mesh;

  /**
   * Frustum: a prism with a different half-width top and bottom. Pyramids,
   * plinths, spires, the flared skirt of a robe. `sides` defaults to 4.
   */
  taper(bottom: number, top: number, height: number, color: number, sides?: number): THREE.Mesh;

  /**
   * A square beam between two points, for anything diagonal: lattice bracing,
   * bridge cables, flying buttresses. Placed absolutely, not by its base.
   * A vertical strut gets an arbitrary roll about its own axis — use `column`.
   */
  strut(from: THREE.Vector3, to: THREE.Vector3, thickness: number, color: number): THREE.Mesh;

  /**
   * An annular prism: a ring with a real hole in it. The only helper that makes
   * a hole, which is why it exists — cornices, drums, arena walls, balconies.
   */
  ringWall(inner: number, outer: number, height: number, color: number, sides?: number): THREE.Mesh;

  /**
   * Repeats something around the Y axis. Build the element where it belongs at
   * angle 0 — that is on the +Z axis, the front — and `around` spins the copies.
   * Return `null` to leave a gap, which is how a ruin gets its broken side.
   */
  around(count: number, make: (index: number, angle: number) => THREE.Object3D | null): THREE.Group;
}

/**
 * Outline width. Screen space, not world space: `OutlineEffect` scales it by
 * distance. Matched to the planet's own 0.005 so a monument is inked with the
 * same pen as the coastline it stands on.
 */
const OUTLINE_THICKNESS = 0.005;
const OUTLINE_COLOR: [number, number, number] = [0.11, 0.02, 0.01];

/** Stamped into `userData` by `toon`, and the thing `validate` looks for. */
const TOON_MARK = 'atlasToon';
/**
 * Stamped by `painted` beside the toon mark: this material's colour is the
 * geometry's `color` attribute, and the toon mark it also carries (white) is
 * only there so every check that asks "did this come from the context?" says
 * yes.
 */
export const PAINTED_MARK = 'atlasPainted';

const PALETTE_COLORS = new Set<number>(Object.values(PALETTE));
const PALETTE_NAMES = new Map<number, string>(
  Object.entries(PALETTE).map(([name, value]) => [value, name]),
);

/**
 * Every tone ever made, derived colour -> its palette base, and the factor it
 * was made with. Module-level rather than per context so that a tone made on
 * the review sheet is the same number the world makes, and so `measure` can
 * fold it back onto its base without being handed the context.
 */
const TONE_BASE = new Map<number, number>();
const TONE_FACTOR = new Map<number, number>();
const TONE_RANGE: [number, number] = [0.5, 1.5];

/** The palette colour a tone was derived from; a palette colour is its own base. */
export function baseOf(color: number): number {
  return TONE_BASE.get(color) ?? color;
}

/** See `MonumentContext.tone`. Exported so the flatteners' tests can make one. */
export function tone(color: number, factor: number): number {
  if (!PALETTE_COLORS.has(color)) {
    throw new Error(
      `tone() wants a PALETTE colour to start from, got 0x${color.toString(16).padStart(6, '0')}`,
    );
  }
  if (!Number.isFinite(factor) || factor < TONE_RANGE[0] || factor > TONE_RANGE[1]) {
    throw new Error(`tone() factor ${factor} is outside ${TONE_RANGE[0]}..${TONE_RANGE[1]}`);
  }
  const channel = (shift: number): number =>
    Math.max(0, Math.min(255, Math.round(((color >> shift) & 255) * factor)));
  const derived = (channel(16) << 16) | (channel(8) << 8) | channel(0);
  // A tone that lands exactly on a palette colour *is* that colour, and a tone
  // of 1.0 is the base: neither gets registered, so `baseOf` stays honest.
  if (derived === color || PALETTE_COLORS.has(derived)) return derived;
  if (!TONE_BASE.has(derived)) {
    TONE_BASE.set(derived, color);
    TONE_FACTOR.set(derived, factor);
  }
  return derived;
}

/**
 * One context for the whole world. Building it once means one toon ramp and one
 * material per colour shared across every monument, so a hundred of them cost a
 * couple of dozen shader programs rather than a couple of thousand.
 */
export function createContext(): MonumentContext {
  const ramp = createToonRamp(4);
  const materials = new Map<number, THREE.MeshToonMaterial>();

  function toon(color: number): THREE.MeshToonMaterial {
    if (!PALETTE_COLORS.has(color) && !TONE_BASE.has(color)) {
      throw new Error(
        `monument colour 0x${color.toString(16).padStart(6, '0')} is not in PALETTE. ` +
          `Use ctx.palette.<name>: ${Object.keys(PALETTE).join(', ')}, or ctx.tone(palette colour, factor)`,
      );
    }
    const cached = materials.get(color);
    if (cached) return cached;

    const material = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
    material.userData.outlineParameters = { thickness: OUTLINE_THICKNESS, color: OUTLINE_COLOR };
    // The stamp is the colour *as drawn* — the flatteners in `settlements.ts`
    // and `vegetation.ts` read it straight into vertex bytes, so a tone has to
    // survive here. `measure` folds it back with `baseOf` when it counts.
    material.userData[TOON_MARK] = color;
    materials.set(color, material);
    return material;
  }

  /**
   * Every geometry goes in non-indexed with recomputed normals, which is the
   * same trick the land mesh uses and for the same reason: one normal per face,
   * so each facet of a prism gets its own cel band instead of a smooth sweep
   * that the ramp cannot step across. `MeshToonMaterial` has no `flatShading`
   * flag to do it for us — that property exists on Phong and Standard and not
   * on Toon, which is a half hour anyone can lose.
   *
   * It also leaves every monument's geometry in one uniform shape, so merging
   * them by material later is a single call.
   */
  let paintedMaterial: THREE.MeshToonMaterial | null = null;
  function painted(model: Model, paint?: Paint): THREE.Mesh {
    if (paintedMaterial === null) {
      paintedMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
      paintedMaterial.userData.outlineParameters = { thickness: OUTLINE_THICKNESS, color: OUTLINE_COLOR, outlineNormal: true };
      paintedMaterial.userData[TOON_MARK] = PALETTE.white;
      paintedMaterial.userData[PAINTED_MARK] = true;
    }
    const mesh = new THREE.Mesh(paintModel(model, paint), paintedMaterial);
    mesh.name = model.name;
    return mesh;
  }

  const meshOf = (geometry: THREE.BufferGeometry, color: number): THREE.Mesh => {
    const faceted = geometry.toNonIndexed();
    geometry.dispose();
    faceted.computeVertexNormals();
    return new THREE.Mesh(faceted, toon(color));
  };

  function box(width: number, height: number, depth: number, color: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(0, height / 2, 0);
    return meshOf(geometry, color);
  }

  function prism(
    bottom: number,
    top: number,
    height: number,
    color: number,
    sides: number,
  ): THREE.Mesh {
    // The arguments are half-widths across the flats; `CylinderGeometry` wants
    // circumradii, and a half-segment of `thetaStart` is what puts a flat face
    // on +Z instead of a corner.
    const half = Math.PI / sides;
    const k = 1 / Math.cos(half);
    const geometry = new THREE.CylinderGeometry(top * k, bottom * k, height, sides, 1, false, half);
    geometry.translate(0, height / 2, 0);
    return meshOf(geometry, color);
  }

  return {
    THREE,
    palette: PALETTE,
    toon,
    tone,
    painted,
    box,
    column: (radius, height, color, sides = 8) => prism(radius, radius, height, color, sides),
    taper: (bottom, top, height, color, sides = 4) => prism(bottom, top, height, color, sides),

    strut(from, to, thickness, color) {
      const length = from.distanceTo(to);
      const geometry = new THREE.BoxGeometry(thickness, thickness, length);
      const mesh = meshOf(geometry, color);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      // The box's long axis is +Z, which is exactly what `lookAt` aims.
      mesh.lookAt(to);
      return mesh;
    },

    ringWall(inner, outer, height, color, sides = 24) {
      // Lathed rather than extruded: a closed rectangular profile spun about Y
      // is the whole solid — floor, outer wall, ceiling, inner wall — in one
      // geometry of 4 * sides * 2 triangles, with no triangulation to trust.
      const profile = [
        new THREE.Vector2(inner, 0),
        new THREE.Vector2(outer, 0),
        new THREE.Vector2(outer, height),
        new THREE.Vector2(inner, height),
        new THREE.Vector2(inner, 0),
      ];
      return meshOf(new THREE.LatheGeometry(profile, sides), color);
    },

    around(count, make) {
      const group = new THREE.Group();
      for (let index = 0; index < count; index++) {
        const angle = (index / count) * TAU;
        const child = make(index, angle);
        if (!child) continue;
        const pivot = new THREE.Group();
        pivot.rotation.y = angle;
        pivot.add(child);
        group.add(pivot);
      }
      return group;
    },
  };
}

// ---------------------------------------------------------------------------
// The monument
// ---------------------------------------------------------------------------

export interface Monument {
  /** Kebab-case, unique, and the file is named after it: `eiffel-tower.ts`. */
  id: string;
  name: string;
  /** Three letters, matching `country.iso` in the baked data. 'FRA'. */
  iso: string;
  lat: number;
  lon: number;
  /**
   * Metres, for the info card — **not** the model's height. See `TIERS`.
   *
   * **Optional, and omitting it is the right answer whenever the real height is
   * unknown, disputed or meaningless. Do not invent a number to satisfy the
   * type.** Over half of `scripts/monuments.source.json` carries no height, and
   * every one of those is correct to: Stonehenge stands 4.9 m at the sarsen
   * lintels and 7.3 m at the great trilithon and neither is *the* height; the
   * Sagrada Familia is not finished; the Great Wall has a length, not a height;
   * Machu Picchu is a town. A monument with no `realHeight` is an ordinary
   * monument — the card simply says less about it.
   *
   * When it is here it must agree with the source list, because two copies of a
   * fact are two chances to be wrong.
   */
  realHeight?: number;
  tier: MonumentTier;
  /** Radius of the base circle the model must stay inside, in world units. */
  footprint: number;
  /**
   * Builds the model. Must be deterministic — no `Math.random()`, no `Date` —
   * because the loader builds twice and compares to catch exactly that.
   *
   * The `Group` it returns:
   * - faces **+Z**,
   * - stands with its base at **y = 0**,
   * - keeps every vertex within `footprint` of the Y axis,
   * - has an identity transform of its own (position, rotation and scale belong
   *   to whoever places it on the planet),
   * - and is made only of meshes whose materials came from `ctx.toon`.
   */
  build(ctx: MonumentContext): THREE.Group;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface Measurements {
  triangles: number;
  meshes: number;
  /** Highest point above y = 0. */
  height: number;
  /** Lowest point; anything below 0 means the model sinks into the ground. */
  base: number;
  /** Largest horizontal distance from the Y axis. */
  radius: number;
  /** Horizontal offset of the bounding box's centre from the Y axis. */
  offset: number;
  /** Palette colours actually used, in the order first seen. */
  colors: number[];
}

/** Walks a built group once and returns everything both the validator and the contact sheet need. */
export function measure(group: THREE.Group): Measurements {
  group.updateMatrixWorld(true);
  const toLocal = group.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const vertex = new THREE.Vector3();

  let triangles = 0;
  let meshes = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let radius = 0;
  const colors: number[] = [];

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;

    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      // A painted mesh's colours are vertex bytes, which cost no material and no
      // draw call wherever it is merged; they are not what the colour cap counts.
      if (material.userData[PAINTED_MARK] === true) continue;
      const stamped = material.userData[TOON_MARK] as number | undefined;
      // Tones fold onto their base: three greens of one green is one colour.
      const color = stamped === undefined ? undefined : baseOf(stamped);
      if (color !== undefined && !colors.includes(color)) colors.push(color);
    }

    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    triangles += (geometry.index ? geometry.index.count : position.count) / 3;

    matrix.multiplyMatrices(toLocal, mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
      minY = Math.min(minY, vertex.y);
      maxY = Math.max(maxY, vertex.y);
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);
      radius = Math.max(radius, Math.hypot(vertex.x, vertex.z));
    }
  });

  if (meshes === 0) {
    return { triangles: 0, meshes: 0, height: 0, base: 0, radius: 0, offset: 0, colors };
  }

  return {
    triangles,
    meshes,
    height: maxY,
    base: minY,
    radius,
    offset: Math.hypot((minX + maxX) / 2, (minZ + maxZ) / 2),
    colors,
  };
}

const round = (value: number): string => value.toFixed(1);

/**
 * Everything wrong with a monument, in plain English. Empty means it is fine.
 *
 * The one invariant this cannot check is **facing +Z**: no amount of geometry
 * tells you which way a building's front is. That is what the contact sheet's
 * fixed front camera is for — it is the only check done by eye, and it is the
 * only one that has to be.
 */
export function validate(monument: Monument, group: THREE.Group): string[] {
  const problems: string[] = [];
  const tier = TIERS[monument.tier];
  if (!tier) {
    // TypeScript rules this out, but the registry finds monuments by shape at
    // runtime and every check below reads off the tier.
    return [`tier '${monument.tier}' is not one of ${Object.keys(TIERS).join(', ')}`];
  }

  // --- metadata: the errors a fan-out actually makes are typos in these ---
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(monument.id)) {
    problems.push(`id '${monument.id}' is not kebab-case`);
  }
  if (!/^[A-Z]{3}$/.test(monument.iso)) {
    problems.push(`iso '${monument.iso}' is not three capital letters`);
  }
  if (!(monument.lat >= -90 && monument.lat <= 90)) problems.push(`lat ${monument.lat} is off the planet`);
  if (!(monument.lon >= -180 && monument.lon <= 180)) problems.push(`lon ${monument.lon} is off the planet`);
  // Absent is legitimate — see the field. Present and not a height is not.
  if (monument.realHeight !== undefined && !(monument.realHeight > 0)) {
    problems.push('realHeight is present but not a positive number of metres — omit it instead');
  }
  if (monument.lat === 0 && monument.lon === 0) {
    // Null Island is what an unfilled template looks like.
    problems.push('lat/lon are both 0 — placeholder coordinates');
  }

  // --- the group's own transform belongs to whoever places it ---
  if (group.position.lengthSq() > 1e-6) problems.push('group.position must be the origin');
  if (group.rotation.x !== 0 || group.rotation.y !== 0 || group.rotation.z !== 0) {
    problems.push('group.rotation must be identity — bake the rotation into the children');
  }
  if (Math.abs(group.scale.x - 1) > 1e-6 || Math.abs(group.scale.y - 1) > 1e-6 || Math.abs(group.scale.z - 1) > 1e-6) {
    problems.push('group.scale must be 1 — build at the tier size, do not scale into it');
  }

  // --- contents ---
  group.traverse((object) => {
    if (object === group) return;
    const kind = object as unknown as Record<string, boolean>;
    if (kind.isPoints || kind.isLine || kind.isSprite) {
      problems.push(`${object.type} is not allowed: OutlineEffect only inks meshes`);
      return;
    }
    if (kind.isLight || kind.isCamera) {
      problems.push(`${object.type} is not allowed: the scene owns the lights and the camera`);
      return;
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const stamp = material.userData[TOON_MARK] as number | undefined;
      if (stamp === undefined) {
        problems.push(`a ${material.type} escaped ctx.toon — every material must come from it`);
      } else if (!PALETTE_COLORS.has(baseOf(stamp))) {
        problems.push(`material colour 0x${stamp.toString(16)} is not in PALETTE`);
      }
      if (material.side !== THREE.FrontSide) {
        problems.push('materials must stay FrontSide — the outline is an inverted back-face hull');
      }
    }
  });

  const { triangles, meshes, height, base, radius, offset } = measure(group);

  if (meshes === 0) {
    problems.push('the group is empty');
    return problems;
  }

  // --- pose ---
  if (Math.abs(base) > 0.1) {
    problems.push(
      base < 0
        ? `sinks ${round(-base)} units below y = 0`
        : `floats ${round(base)} units above y = 0`,
    );
  }
  if (offset > Math.max(0.5, monument.footprint * 0.15)) {
    problems.push(`is ${round(offset)} units off-centre — the model must straddle the Y axis`);
  }

  // --- size against the tier ---
  if (!(monument.footprint > 0) || monument.footprint > tier.footprint) {
    problems.push(
      `footprint ${monument.footprint} is outside the '${monument.tier}' tier's 0..${tier.footprint}`,
    );
  }
  if (radius > monument.footprint + 0.05) {
    problems.push(`reaches ${round(radius)} units out, past its ${monument.footprint}-unit footprint`);
  } else if (radius < monument.footprint * FOOTPRINT_FILL) {
    problems.push(
      `only uses ${round(radius)} of its ${monument.footprint}-unit footprint — declare a tighter one`,
    );
  }
  if (height > tier.height + 0.05) {
    problems.push(`is ${round(height)} units tall, over the '${monument.tier}' tier's ${tier.height}`);
  }
  if (height < 0.5) {
    problems.push('has no height — nothing reaches above the ground');
  } else if (radius * 2 > height * MAX_ASPECT) {
    problems.push(
      `is ${round((radius * 2) / height)}x wider than tall — model a representative crop instead`,
    );
  }
  if (Math.max(height, radius * 2) < tier.height * FILL) {
    problems.push(
      `is too small for '${monument.tier}' (${round(height)} tall, ${round(radius * 2)} wide) — ` +
        `grow it or drop a tier`,
    );
  }

  // --- budget ---
  if (triangles > tier.triangles) {
    problems.push(`${triangles} triangles, over the '${monument.tier}' budget of ${tier.triangles}`);
  }
  if (meshes > tier.meshes) {
    problems.push(`${meshes} meshes, over the '${monument.tier}' budget of ${tier.meshes}`);
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Defects the two fixed cameras cannot show
// ---------------------------------------------------------------------------

/**
 * Two faults that build, typecheck, pass `validate`, and are invisible on the
 * contact sheet unless you happen to spin it.
 *
 * - **`buried`** — a part sealed inside another part. Charles Bridge's ten piers
 *   were scaled in the axes they would have had *after* their `rotation.y`, but
 *   Three composes `T * R * S` so the scale landed first and the numbers went on
 *   the wrong axes. Each pier came out narrower than the wall it stood in, so all
 *   ten were sealed inside it and every cutwater the file promised was absent
 *   from the render. Only a deliberate second render found it.
 * - **`floating`** — a part standing on nothing. Three of Niagara Falls' seven
 *   tree clumps sat over the void, because the rims they were placed on are yawed
 *   planks whose edges do not run along `z`. Its agent wrote the probe this uses,
 *   and put the reason nobody saw it better than I can: *"invisible from both
 *   fixed views, obvious the moment the sheet spins."*
 *
 * The causes do not generalise. The symptoms do, so the symptoms are what get
 * measured, and between them they cover the family: a part buried in a wall, a
 * detail swallowed by its own plinth, a duplicated block, a clump in mid-air.
 *
 * **Both are warnings on the contact sheet and neither is in `validate`**, which
 * is a deliberate line and worth defending. Everything `validate` checks is a
 * *fact* — the base is at y = 0 or it is not, the material came from `ctx.toon`
 * or it did not — and `buildMonument` throws on it, so a failure never reaches
 * the planet. These two are *judgements*, and both are provably approximate:
 *
 * - `ringWall` makes an annulus whose box is solid, so the Colosseum's own arena
 *   floor sits inside the box of the cornice above it and is perfectly visible.
 *   That is not a tunable edge case, it is built into a helper.
 * - Hanging is often the whole point. A cantilever, a bridge deck, a plume, an
 *   overhanging cornice; Marina Bay Sands is a deck overhanging by a quarter of
 *   its length. A rule that threw on those would delete them.
 *
 * The floating test is also the strict one for a reason measured rather than
 * guessed. Asking "is anything directly under its base" fires on 249 parts in 31
 * of the 64 monuments, nearly all of them relief panels and mullions glued to
 * the side of a wall, where having nothing underneath is correct. Asking
 * "does it touch the model at all" fires on 6 parts in 3. The looser probe is
 * still worth having in the hands of the file's own author, and is kept as
 * `findUnsupported`.
 *
 * The asymmetry settles it. A missed buried pier costs two hundred triangles; a
 * wrongly rejected monument costs the monument. And a red card that might be
 * wrong teaches everyone to distrust the red cards that are right. So these go in
 * amber beside the budget numbers, where a person decides.
 */
export interface Flaw {
  kind: 'buried' | 'floating';
  /** The mesh at fault: colour, size and where to find it. */
  what: string;
  /** What is covering it, or how much of its base is over nothing. */
  detail: string;
  triangles: number;
}

/**
 * How much of its own bounding box a mesh actually fills.
 *
 * Only a reasonably solid, reasonably axis-aligned part can bury anything, so
 * this is what keeps the buried check honest. A `ringWall` cornice fills about a
 * fifth of its box and a strut on the diagonal even less, and neither can seal
 * anything in the way a wall can.
 */
const SOLID_ENOUGH = 0.7;

/** A face flush with the surface is a face you can see, so burial must be strict. */
const BURIED_BY = 0.02;

/** How far under a part to look for something holding it up. */
const PROBE_DEPTH = 0.05;

/** How close two parts must come before they count as joined. */
const TOUCHING = 0.06;

/** Below this a part is simply standing on the ground, which is support enough. */
const ON_THE_GROUND = 0.05;

interface Part {
  /** Axis-aligned box in the monument's own space. Used for burial. */
  box: THREE.Box3;
  /** The geometry's own box, plus the matrices, so the support probe is *oriented*. */
  local: THREE.Box3;
  matrix: THREE.Matrix4;
  inverse: THREE.Matrix4;
  solidity: number;
  triangles: number;
  base: number;
  color: number | undefined;
}

/** Volume of a closed triangle mesh, by the divergence theorem. */
function solidVolume(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  matrix: THREE.Matrix4,
): number {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let total = 0;
  for (let i = 0; i + 2 < position.count; i += 3) {
    a.fromBufferAttribute(position, i).applyMatrix4(matrix);
    b.fromBufferAttribute(position, i + 1).applyMatrix4(matrix);
    c.fromBufferAttribute(position, i + 2).applyMatrix4(matrix);
    total += a.dot(cross.copy(b).cross(c));
  }
  return Math.abs(total) / 6;
}

function describe(part: Part): string {
  const size = part.box.getSize(new THREE.Vector3());
  const at = part.box.getCenter(new THREE.Vector3());
  const name = part.color === undefined ? 'untinted' : paletteName(part.color);
  return (
    `${name} ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}` +
    ` at (${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${at.z.toFixed(1)})`
  );
}

function collect(group: THREE.Group): Part[] {
  group.updateMatrixWorld(true);
  const toLocal = group.matrixWorld.clone().invert();
  const parts: Part[] = [];

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;

    const matrix = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
    const box = new THREE.Box3();
    const local = new THREE.Box3();
    const vertex = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      local.expandByPoint(vertex);
      box.expandByPoint(vertex.applyMatrix4(matrix));
    }
    const size = box.getSize(new THREE.Vector3());
    const boxVolume = size.x * size.y * size.z;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

    parts.push({
      box,
      local,
      matrix,
      inverse: matrix.clone().invert(),
      solidity: boxVolume > 1e-9 ? solidVolume(position, matrix) / boxVolume : 0,
      triangles: (mesh.geometry.index ? mesh.geometry.index.count : position.count) / 3,
      base: box.min.y,
      color: material?.userData[TOON_MARK] as number | undefined,
    });
  });
  return parts;
}

/**
 * Is this point inside that part's *oriented* box?
 *
 * Oriented, not axis-aligned, and that is the whole trick: the rims the Niagara
 * clumps sat on are yawed planks, and against an axis-aligned box every one of
 * them looked supported.
 */
function holds(part: Part, point: THREE.Vector3): boolean {
  const local = point.clone().applyMatrix4(part.inverse);
  return (
    local.x >= part.local.min.x - 1e-6 && local.x <= part.local.max.x + 1e-6 &&
    local.y >= part.local.min.y - 1e-6 && local.y <= part.local.max.y + 1e-6 &&
    local.z >= part.local.min.z - 1e-6 && local.z <= part.local.max.z + 1e-6
  );
}

/** Everything the two fixed cameras cannot show. */
export function findFlaws(group: THREE.Group): Flaw[] {
  const parts = collect(group);
  const flaws: Flaw[] = [];
  const seen = new Map<string, number>();

  for (const inner of parts) {
    // --- buried ---
    // Two parts in the same place are a duplicate, and neither strictly contains
    // the other, so they need their own pass.
    const size = inner.box.getSize(new THREE.Vector3());
    const at = inner.box.getCenter(new THREE.Vector3());
    const key = `${[size.x, size.y, size.z, at.x, at.y, at.z].map((n) => n.toFixed(2)).join()}:${inner.triangles}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) {
      flaws.push({
        kind: 'buried',
        what: describe(inner),
        detail: 'a copy of itself in the same place',
        triangles: inner.triangles,
      });
      continue;
    }

    let cover: Part | undefined;
    let coverVolume = Infinity;
    for (const outer of parts) {
      if (outer === inner || outer.solidity < SOLID_ENOUGH) continue;
      if (
        inner.box.min.x < outer.box.min.x + BURIED_BY ||
        inner.box.min.y < outer.box.min.y + BURIED_BY ||
        inner.box.min.z < outer.box.min.z + BURIED_BY ||
        inner.box.max.x > outer.box.max.x - BURIED_BY ||
        inner.box.max.y > outer.box.max.y - BURIED_BY ||
        inner.box.max.z > outer.box.max.z - BURIED_BY
      ) {
        continue;
      }
      const outerSize = outer.box.getSize(new THREE.Vector3());
      const volume = outerSize.x * outerSize.y * outerSize.z;
      if (volume < coverVolume) {
        cover = outer;
        coverVolume = volume;
      }
    }
    if (cover) {
      flaws.push({
        kind: 'buried',
        what: describe(inner),
        detail: `sealed inside ${describe(cover)}`,
        triangles: inner.triangles,
      });
      continue;
    }

    // --- floating ---
    // Joined to the model at no point at all. See the note on `findUnsupported`
    // for why this, and not "nothing under its base", is what the sheet shows.
    if (inner.base < ON_THE_GROUND) continue;
    const reach = inner.box.clone().expandByScalar(TOUCHING);
    if (parts.some((other) => other !== inner && reach.intersectsBox(other.box))) continue;
    flaws.push({
      kind: 'floating',
      what: describe(inner),
      detail: 'touches no other part of the model',
      triangles: inner.triangles,
    });
  }

  return flaws;
}

/**
 * Parts with nothing directly beneath their base — **an author's tool for their
 * own file, deliberately not on the contact sheet.**
 *
 * This is the Niagara Falls agent's probe, taken rather than rewritten. It works
 * by dropping a point below each base corner and asking whether any other part's
 * *oriented* box contains it; oriented is the whole trick, because the rims its
 * tree clumps sat on are yawed planks and against an axis-aligned box every one
 * of them looked supported. It found three clumps over the void that were
 * "invisible from both fixed views, obvious the moment the sheet spins", and
 * after the fix it reported nothing but the pieces meant to hang.
 *
 * It is exactly right in the hands of someone who knows which of their own parts
 * are supposed to float, and useless as a sheet-wide warning. Measured across
 * the 64 monuments: **249 parts in 31 of them**, and the sample is Arc de
 * Triomphe's relief panels, Alhambra's window mullions, Abu Simbel's carved
 * plaques — detail glued to the *side* of a wall, which has nothing under it and
 * is entirely correct. In this vocabulary "rests on its base" is not the normal
 * case, and a warning that fires on half the tree trains everyone to ignore
 * amber. Tightening it does not rescue it: requiring the part to be blocky and
 * to have nothing under any of it still leaves 249 parts, and requiring it to be
 * a partial overhang still leaves 225 in 36 monuments.
 *
 * So the sheet shows the strict version — a part joined to the model at no point
 * at all, 6 parts in 3 monuments — and this stays here for the author who is
 * looking at one file and can tell a mistake from a plume.
 */
export function findUnsupported(group: THREE.Group): Flaw[] {
  const parts = collect(group);
  const found: Flaw[] = [];

  for (const part of parts) {
    if (part.base < ON_THE_GROUND) continue;
    const probe = (u: number, v: number): boolean => {
      const point = new THREE.Vector3(
        part.local.min.x + (part.local.max.x - part.local.min.x) * u,
        part.local.min.y,
        part.local.min.z + (part.local.max.z - part.local.min.z) * v,
      ).applyMatrix4(part.matrix);
      point.y = part.base - PROBE_DEPTH;
      return parts.some((other) => other !== part && holds(other, point));
    };

    const corners: [number, number][] = [[0.02, 0.02], [0.02, 0.98], [0.98, 0.02], [0.98, 0.98]];
    const loose = corners.filter(([u, v]) => !probe(u, v)).length;
    if (loose === 0) continue;

    // The 4x4 grid is severity, not detection: a corner in the air under a slab
    // that is otherwise 90% supported is an overhang; nothing under any of it is
    // mid-air.
    const steps = [0.125, 0.375, 0.625, 0.875];
    let held = 0;
    for (const u of steps) for (const v of steps) if (probe(u, v)) held++;

    found.push({
      kind: 'floating',
      what: describe(part),
      detail: `${loose} of 4 base corners over nothing, ${Math.round((held / 16) * 100)}% of the base supported`,
      triangles: part.triangles,
    });
  }
  return found;
}

/** The palette name of a colour, for the contact sheet's caption. */
export function paletteName(color: number): string {
  const base = TONE_BASE.get(color);
  if (base !== undefined) return `${paletteName(base)}×${TONE_FACTOR.get(color)}`;
  return PALETTE_NAMES.get(color) ?? `0x${color.toString(16)}`;
}
