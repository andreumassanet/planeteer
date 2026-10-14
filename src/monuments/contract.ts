import * as THREE from 'three';
import { PALETTE, createToonRamp } from '../theme.ts';
import { shadeByClouds } from '../cloud-shade.ts';

/**
 * The monument contract.
 *
 * Monuments are written one file at a time, so everything here keeps them one
 * world: a monument may only make materials through `ctx.toon`, and `ctx.toon`
 * only accepts colours from `PALETTE`. Same ramp, outline width and twenty-four
 * colours for every monument. Tiers, footprints and budgets are enforced by
 * `validate` below.
 */

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

/**
 * Monuments are sized by tier, not in metres. `PLANET_RADIUS` is 16,000 units for
 * an Earth of 6,371 km, so a metre is 0.00251 units: true scale puts the Eiffel
 * Tower at 0.83 units (an eighth of the avatar), and avatar scale at 1,247 units.
 * Neither plays, so size is chosen by how far away the thing should still be
 * nameable. A tier fixes the model's height; real height survives only as a
 * number of metres: the source's `height`, which the info card reads through
 * `monuments.json`, and `realHeight` here, which `pnpm check` holds equal to it.
 *
 * So Christ the Redeemer (38 m) and the Eiffel Tower (330 m) are both `landmark`,
 * both 120 units: both are meant to be spotted from out at sea.
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
   * Hard cap on meshes. Draw calls, not triangles, are what many monuments in one
   * scene cost, and `OutlineEffect` doubles them (itself and its inverted hull).
   */
  meshes: number;
}

/**
 * The tiers. Pick by "from how far should a player be able to name it?":
 *
 * - `monument`: found by walking into it (a gate, a statue, a fountain).
 * - `building`: seen from the far side of the city (an amphitheatre, a palace).
 * - `tower`: the landmark of its city (Big Ben, Pisa, the Statue of Liberty).
 * - `landmark`: the landmark of the planet (Eiffel, Burj Khalifa, the Pyramids).
 *
 * `tower` is capped tighter than `building` on purpose: at 70 units tall and 28
 * wide nothing in that tier can come out squat (the Arc de Triomphe would be 63
 * wide, so it is a `building`).
 */
export const TIERS: Record<MonumentTier, TierSpec> = {
  monument: { height: 15, footprint: 14, triangles: 900, meshes: 40 },
  building: { height: 40, footprint: 55, triangles: 2600, meshes: 110 },
  tower: { height: 70, footprint: 28, triangles: 1800, meshes: 80 },
  landmark: { height: 120, footprint: 55, triangles: 3600, meshes: 130 },
};

/**
 * The widest footprint any tier allows, in world units: what a site that declares
 * none is given. `build-monuments.ts` reserves it for a landmark with no model yet,
 * `terrain.ts` caps a pad with it and `pnpm check` reads it for a monument that
 * declares nothing.
 */
export const MAX_FOOTPRINT = Math.max(...Object.values(TIERS).map((tier) => tier.footprint));

/**
 * How much of its tier a model has to fill. Width counts too, so a wide flat thing
 * (a stone circle, a wall) passes on its diameter. This measures the bounding box,
 * not what is inside it: a post with a crossbar fills a box perfectly, so too bare
 * is judged by eye at thumbnail size.
 */
const FILL = 0.6;

/** How much of its declared `footprint` a model has to use, so placement can trust it. */
const FOOTPRINT_FILL = 0.55;

/**
 * Widest a model may be against its own height. Past this a monument cannot be
 * built whole (the Golden Gate at 120 units would be 1,440 long), and `footprint`
 * is a circle with no long axis.
 *
 * It is measured on the half-diagonal: `measure` takes the greatest horizontal
 * distance any vertex reaches from the Y axis (`hypot(width, depth) / 2` for a
 * rectangular building), and the test is `2 * radius <= MAX_ASPECT * height`, so
 * `halfDiagonal / height <= 2` must hold. The Parthenon at true scale is 2.13.
 *
 * The policy: crop to a representative section, then exaggerate the vertical until
 * it sits just under the cap, and write in the file what was cropped and by how
 * much it was stretched (the Golden Gate keeps two towers and the span at 2.3x).
 * The trade runs the other way too: Stonehenge at true proportions in the
 * `monument` tier's 14-unit footprint would have uprights half the avatar's
 * height, so its plan is squeezed about 2:1. A tier is a budget in world units:
 * distort the axis that carries the least recognition and protect the one that
 * carries the most. A stretch moves a proportion somewhere else (the Parthenon's
 * 1.30 gave Ionic shafts of 7.1 diameters, so they were thickened 15%); fix it
 * and write both numbers in the file.
 */
export const MAX_ASPECT = 4;

/**
 * The least two faces of different colours may stand apart and face the same way
 * (a trim band in front of its wall, a cornice over the roof it caps). Flush faces
 * z-fight, so a trim piece stands `PROUD` of the face it is laid on or stops
 * `PROUD` short of it. `pnpm check` holds every monument to it with the kit's own
 * test (`scripts/z-fight.ts`), which counts faces nearer than 0.05 as one plane.
 * The kit's `PROUD` is the same number.
 */
export const PROUD = 0.08;

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

/**
 * The Three types a monument file needs in order to name something. A monument
 * imports this module only and builds through `ctx`, so it cannot reach for a
 * `MeshStandardMaterial`, an unknown geometry or an external asset. `ctx.THREE` is
 * a value, so there is no `THREE` namespace to write a type against
 * (`THREE.Group` fails with TS2503); import the four types instead:
 *
 *     import type { Monument, MonumentContext, Group } from './contract.ts';
 *
 * They are the return and parameter types of the `ctx` helpers and nothing else.
 */
export type { Group, Mesh, Object3D, Vector3 } from 'three';

/**
 * Everything a monument is allowed to build with. Two conventions:
 *
 * 1. Everything stands on its own base: a helper returns a mesh whose origin is the
 *    centre of its bottom face, so `mesh.position.y = 12` stands it on a floor at
 *    12. (`strut` is placed by its two endpoints.)
 * 2. Flat faces look at +Z: polygonal solids are rotated by half a segment so a
 *    face, not an edge, points at the front (`column(r, h, c, 4)` would otherwise
 *    be a diamond).
 *
 * `radius` arguments are half-widths across the flats (the apothem), not
 * circumradii: the difference is under 2% at 8+ sides and 41% at 4.
 */
export interface MonumentContext {
  /** Passed in so every monument shares one Three instance and needs no import but its types. */
  THREE: typeof THREE;

  /**
   * The twenty-four colours, and the only ones a monument may use.
   *
   * Anything that will sit in shade wants a warm entry. A surface turned from the
   * sun keeps about half its brightness and shifts five to ten per cent cooler, and
   * a neutral has no hue left to survive that. Measured on a wall lit and then turned
   * away:
   *
   * ```
   * bone   143,122,100  ->   76, 68, 58    a dark hueless patch
   * slate   50, 41, 53  ->   27, 23, 31    blue: it has more B than R
   * steel   24, 23, 21  ->   13, 13, 12    effectively black
   * sand   206,144, 69  ->  110, 80, 40    still obviously sand
   * ```
   *
   * Seen through a colonnade with cyan sky in the gaps, the first three read as a
   * hole, not a wall (the `HemisphereLight`'s sky colour is `SKY_TOP`). For a
   * courtyard, portico, doorway or anything behind columns use `sand`, `tan`,
   * `brown`, `clay`, `blush`, `bark` or `darkOlive`. `white` is 0xfff2e8, a warm white
   * that holds 132,111,88 in shade: for white marble use it or `cream`, never `bone`.
   */
  palette: typeof PALETTE;

  /**
   * The only way to make a material. Throws on a colour that is not in `PALETTE`.
   * Materials are shared between every monument that asks for the same colour; do
   * not mutate the one you are handed.
   */
  toon(color: number): THREE.MeshToonMaterial;

  /**
   * A tone of a palette colour: the same hue, darker or lighter by `factor` (0.82
   * is the shadow side of a thing, 1.1 its sunlit one; the range is 0.5 to 1.5). The
   * result is a colour `toon` accepts, and `measure` counts it under its base
   * colour: a merged town or tile carries tones as vertex bytes for free, and only
   * a monument drawn on its own pays a material for one. Three cones in three tones
   * of one green read as a conifer. Tones stay of the palette.
   */
  tone(color: number, factor: number): number;


  /** Rectangular block, centred in x and z, standing on y = 0. */
  box(width: number, height: number, depth: number, color: number): THREE.Mesh;

  /**
   * Regular prism, standing on y = 0. `radius` is the half-width across the flats.
   * It is a whole prism, and `OutlineEffect` inks every silhouette that is not
   * occluded, including the half you meant to hide: an arch head made from a
   * `column` laid on its side and left 0.03 proud of its jambs gets the ink of its
   * lower half drawn across the opening. Make the head shallower than the wall,
   * never flush and never proud.
   */
  column(radius: number, height: number, color: number, sides?: number): THREE.Mesh;

  /**
   * Frustum: a prism with a different half-width top and bottom (pyramids, plinths,
   * spires). `sides` defaults to 4.
   */
  taper(bottom: number, top: number, height: number, color: number, sides?: number): THREE.Mesh;

  /**
   * A square beam between two points, for anything diagonal. Placed absolutely, not
   * by its base. A vertical strut gets an arbitrary roll about its own axis; use
   * `column`.
   */
  strut(from: THREE.Vector3, to: THREE.Vector3, thickness: number, color: number): THREE.Mesh;

  /**
   * An annular prism: a ring with a real hole in it. The only helper that makes a
   * hole (cornices, drums, arena walls, balconies).
   */
  ringWall(inner: number, outer: number, height: number, color: number, sides?: number): THREE.Mesh;

  /**
   * Repeats something around the Y axis. Build the element at angle 0 (the +Z
   * front) and `around` spins the copies. Return `null` to leave a gap.
   */
  around(count: number, make: (index: number, angle: number) => THREE.Object3D | null): THREE.Group;

  /**
   * Every piece of a finished draft, drawn as one mesh per colour. The helpers build
   * non-indexed, faceted geometry so pieces of one material can be concatenated (see
   * `meshOf`); this bakes each piece's transform into its vertices and recomputes the
   * flat normals. The cap counts meshes, so a model needing more pieces than its tier
   * allows can build them all and hand back this; triangles are then the only limit.
   * A reflected transform throws instead of turning a piece inside out. Consumes the
   * draft's geometry.
   */
  merge(draft: THREE.Object3D): THREE.Group;
  /**
   * The ramp and every material made through this context, freed (for a context
   * that is let go of, as a walked world's is on leaving). What was built with it
   * must be gone first.
   */
  dispose(): void;
}

/**
 * Outline width. Screen space, scaled by `OutlineEffect` with distance; matched to
 * the planet's own 0.005 so a monument is inked with the coastline's pen.
 */
const OUTLINE_THICKNESS = 0.005;
const OUTLINE_COLOR: [number, number, number] = [0.11, 0.02, 0.01];

/** Stamped into `userData` by `toon`, and the thing `validate` looks for. */
const TOON_MARK = 'atlasToon';
/**
 * Stamped by `SceneryContext.painted` beside the toon mark: this material's colour
 * is the geometry's `color` attribute, and its toon mark (white) is there so every
 * check that asks "did this come from the context?" says yes.
 */
export const PAINTED_MARK = 'atlasPainted';

const PALETTE_COLORS = new Set<number>(Object.values(PALETTE));
const PALETTE_NAMES = new Map<number, string>(
  Object.entries(PALETTE).map(([name, value]) => [value, name]),
);

/**
 * Every tone made: derived colour -> its palette base, and the factor. Module-level
 * so a tone made anywhere is the same number the world makes, and `measure` can fold
 * it back onto its base without the context.
 */
const TONE_BASE = new Map<number, number>();
const TONE_FACTOR = new Map<number, number>();
const TONE_RANGE: [number, number] = [0.5, 1.5];

/** The palette colour a tone was derived from; a palette colour is its own base. */
function baseOf(color: number): number {
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
  // A tone that lands on a palette colour is that colour, and a tone of 1.0 is the
  // base: neither is registered, so `baseOf` stays honest.
  if (derived === color || PALETTE_COLORS.has(derived)) return derived;
  if (!TONE_BASE.has(derived)) {
    TONE_BASE.set(derived, color);
    TONE_FACTOR.set(derived, factor);
  }
  return derived;
}

/**
 * One context for the whole world: one toon ramp and one material per colour shared
 * across every monument, so a hundred of them cost a couple of dozen shader programs.
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

    // Under the deck's shade like everything the sun lights (`cloud-shade.ts`).
    const material = shadeByClouds(new THREE.MeshToonMaterial({ color, gradientMap: ramp }));
    material.userData.outlineParameters = { thickness: OUTLINE_THICKNESS, color: OUTLINE_COLOR };
    // The stamp is the colour as drawn: the flatteners in `settlements.ts` and
    // `vegetation.ts` read it into vertex bytes, and `measure` folds it back with
    // `baseOf` when it counts.
    material.userData[TOON_MARK] = color;
    materials.set(color, material);
    return material;
  }

  /**
   * Every geometry goes in non-indexed with recomputed normals (as the land mesh
   * does), so each facet of a prism gets its own cel band. `MeshToonMaterial` has no
   * `flatShading` flag. It also leaves every geometry in one shape, so merging by
   * material is a single call.
   */
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
      // Lathed: a closed rectangular profile spun about Y is the whole solid in one
      // geometry of 4 * sides * 2 triangles.
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

    merge(draft) {
      draft.updateMatrixWorld(true);
      const bins = new Map<THREE.Material | THREE.Material[], number[]>();
      const vertex = new THREE.Vector3();
      draft.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.matrixWorld.determinant() <= 0) throw new Error(`merge: '${mesh.name || 'a piece'}' is reflected`);
        const position = mesh.geometry.getAttribute('position');
        let bin = bins.get(mesh.material);
        if (bin === undefined) bins.set(mesh.material, (bin = []));
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          bin.push(vertex.x, vertex.y, vertex.z);
        }
        mesh.geometry.dispose();
      });
      const group = new THREE.Group();
      for (const [material, positions] of bins) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        group.add(new THREE.Mesh(geometry, material));
      }
      return group;
    },

    dispose() {
      for (const material of materials.values()) material.dispose();
      materials.clear();
      ramp.dispose();
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
   * Metres, not the model's height (see `TIERS`). The info card prints the source
   * list's `height`, from `monuments.json`; this is the model's copy of it, and
   * `pnpm check` asserts they agree.
   *
   * Optional: omit it whenever the real height is unknown, disputed or meaningless
   * (over half of `scripts/monuments.source.json` carries none: Stonehenge has two
   * heights, the Sagrada Familia is unfinished, the Great Wall has a length).
   */
  realHeight?: number;
  tier: MonumentTier;
  /** Radius of the base circle the model must stay inside, in world units. */
  footprint: number;
  /**
   * Builds the model. Must be deterministic (no `Math.random()` or `Date`): the
   * loader builds twice and compares.
   *
   * The `Group` it returns faces +Z, stands with its base at y = 0, keeps every
   * vertex within `footprint` of the Y axis, has an identity transform of its own
   * (the placer owns position, rotation and scale), and is made only of meshes whose
   * materials came from `ctx.toon`.
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

/** Walks a built group once and returns everything the validator needs. */
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
 * Everything wrong with a monument, in plain English. Empty means it is fine. It
 * cannot check facing +Z (no geometry says which way a building's front is); that
 * is checked by eye from the front.
 */
export function validate(monument: Monument, group: THREE.Group): string[] {
  const problems: string[] = [];
  const tier = TIERS[monument.tier];
  if (!tier) {
    // TypeScript rules this out, but the registry finds monuments by shape at
    // runtime.
    return [`tier '${monument.tier}' is not one of ${Object.keys(TIERS).join(', ')}`];
  }

  // --- metadata: the errors a hand-written file makes are typos in these ---
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
 * Two faults that build, typecheck and pass `validate`, and are invisible from a
 * fixed view unless the model is spun.
 *
 * - `buried`: a part sealed inside another part (e.g. piers scaled in the axes they
 *   would have after `rotation.y`, which Three applies first as T * R * S, so they
 *   came out narrower than the wall they stood in).
 * - `floating`: a part standing on nothing (e.g. tree clumps placed on the rims of
 *   yawed planks whose edges do not run along `z`).
 *
 * Both are warnings and neither is in `validate`, which checks facts (the base is
 * at y = 0, the material came from `ctx.toon`) and throws. These are judgements and
 * approximate: `ringWall` makes an annulus whose box is solid, so an arena floor
 * inside a cornice's box is visible; and hanging is often the point (a cantilever,
 * a bridge deck, an overhanging cornice). "Is anything directly under its base"
 * fires on 249 parts in 31 of 64 monuments, mostly relief panels and mullions on a
 * wall; "does it touch the model at all" fires on 6 parts in 3, so that is the
 * test; the looser probe is kept as `findUnsupported` for a file's author. They go
 * in amber beside the budget numbers, where a person decides.
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
 * How much of its own bounding box a mesh fills. Only a reasonably solid, axis-
 * aligned part can bury anything; a `ringWall` cornice fills about a fifth of its
 * box and a diagonal strut less.
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
 * Is this point inside that part's oriented box? Oriented, not axis-aligned: against
 * an axis-aligned box every yawed plank looked supported.
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
    // Joined to the model at no point at all (see `findUnsupported` for why this is
    // what gets flagged and not "nothing under its base").
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
 * Parts with nothing directly beneath their base: an author's tool for their own
 * file, not a general warning. It drops a point below each base corner and asks
 * whether any other part's oriented box contains it. It is exact for someone who
 * knows which of their parts are meant to float, and useless as a warning on every
 * monument: it fires on 249 parts in 31 of 64 monuments, mostly detail glued to the
 * side of a wall, and tightening it still leaves 225 in 36. `findFlaws` reports the
 * strict version (a part joined to the model at no point, 6 parts in 3 monuments).
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

    // The 4x4 grid is severity, not detection: a corner in the air under an otherwise
    // 90% supported slab is an overhang; nothing under any of it is mid-air.
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

/** The palette name of a colour, for a caption. */
export function paletteName(color: number): string {
  const base = TONE_BASE.get(color);
  if (base !== undefined) return `${paletteName(base)}×${TONE_FACTOR.get(color)}`;
  return PALETTE_NAMES.get(color) ?? `0x${color.toString(16)}`;
}
