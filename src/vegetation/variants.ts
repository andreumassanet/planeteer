/** Scenic parts built once and flattened, and the flora a biome offers at a level. */
import * as THREE from 'three';
import { mergeMeshes } from '../merge.ts';
import type { MergePiece } from '../merge.ts';
import { rngFrom } from '../scenery/random.ts';
import { wallSurfaceOf } from '../settlements/surfaces.ts';
import { glassOf, surfaceBytes } from '../surfaces.ts';
import { BIOMES } from '../biome.ts';
import type { BiomeId } from '../biome.ts';
import { nearArrays } from '../scenery/tree-forms.ts';
import { KINDS, PARTS, measure, nativeHere, part, validatePart, variantRng } from '../scenery/index.ts';
import type { RegionId, RegionStyle, SceneryContext, ScenicPart, Weighted } from '../scenery/index.ts';
import type { BodyKind } from '../scenery/occupancy.ts';
import { SCALE_OF, legibleFloor } from './levels.ts';
import type { FlatVariant, NearVariant } from './tiles.ts';

/**
 * How far a plant follows the ground it stands on: 0 upright, 1 lying on the
 * slope. A trunk grows towards the light and leans a little; a rock follows
 * the surface. A leaning tree also halves the bedding a plant needs.
 */
const TILT_OF: Record<ScenicPart['kind'], number> = {
  scatter: 1,
  tree: 0.45,
  dwelling: 0,
  block: 0,
  civic: 0,
  person: 0,
};

/** What of the kit a body cannot walk through: trunks, boulders and buildings. */
function bodyOf(entry: ScenicPart): BodyKind | undefined {
  if (entry.kind === 'tree') return 'trunk';
  if (entry.id === 'boulder') return 'boulder';
  if (entry.kind === 'dwelling' || entry.kind === 'civic' || entry.kind === 'block') return 'walls';
  return undefined;
}

export interface Variants {
  /** A part's variant flattened for merging, or null if it is missing or broke. */
  variantOf(partId: string, style: RegionStyle, index: number): FlatVariant | null;
  /**
   * A tree as a near tile draws it: wood and leaf cards from the part's
   * `form` on the same seed as its `build`. Null for a part with no form.
   */
  nearOf(partId: string, style: RegionStyle, index: number): NearVariant | null;
  /** The weighted plants `biome.ts` means here, filtered by region and by legibility at this level. */
  floraFor(biome: BiomeId, style: RegionStyle, level: number): Weighted<string>[];
  /** Each part's kind by id. */
  kindOf: Map<string, ScenicPart['kind']>;
  /** Parts a biome table names that the registry has no file for. */
  missing: string[];
  /** Anything that refused to build, with the contract's complaint. */
  broken: string[];
}

export function createVariants(ctx: SceneryContext): Variants {
  const missing: string[] = [];
  const broken: string[] = [];
  const variants = new Map<string, FlatVariant | null>();
  const nearVariants = new Map<string, NearVariant | null>();
  const floras = new Map<string, Weighted<string>[]>();
  const kindOf = new Map<string, ScenicPart['kind']>(PARTS.map((entry) => [entry.id, entry.kind]));

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
    const pieces: MergePiece[] = [];
    const merged = mergeMeshes(built, pieces);
    const value: FlatVariant = {
      ...merged,
      height: measured.height,
      footprint: entry.footprint,
      tilt: TILT_OF[entry.kind],
      solid: bodyOf(entry),
    };
    // A building out in the country is built as a town's is: its walls of the region's materials, its panes rooms.
    if (entry.kind === 'dwelling' || entry.kind === 'block' || entry.kind === 'civic') {
      const wall = wallSurfaceOf(style.id, partId, entry.kind, rngFrom(key, 'walls'));
      const bytes = surfaceBytes(merged.position, merged.normal, merged.color, glassOf(pieces, merged.position.length / 3), wall);
      value.surface = bytes.surface;
      value.pane = bytes.pane;
    }
    pieces.length = 0;
    built.traverse((object) => {
      const mesh = object as THREE.Mesh;
      // The vertices are copied out; the materials are the shared cache's and stay.
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    variants.set(key, value);
    return value;
  }

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

  /**
   * `BIOMES[id].plants` is most-likely-first and the weights are geometric at
   * 0.45. `nativeHere` drops species foreign to the region, and a plant
   * shorter than the level's legibility floor is dropped rather than placed
   * and culled, so the survivors take its share of the cover. The height proxy
   * is variant 0.
   */
  function floraFor(biome: BiomeId, style: RegionStyle, level: number): Weighted<string>[] {
    const key = `${biome}|${style.id}|${level}`;
    const cached = floras.get(key);
    if (cached !== undefined) return cached;

    const floor = legibleFloor(level);
    const scale = SCALE_OF[level]!;
    const out: Weighted<string>[] = [];
    let weight = 1;
    for (const id of BIOMES[biome].plants) {
      const kind = kindOf.get(id);
      if (kind === undefined) {
        if (!missing.includes(id)) missing.push(id);
      } else if (nativeHere(id, style.id as RegionId)) {
        const sample = variantOf(id, style, 0);
        // A kind's own cap stands in when the variant would not build, so a
        // broken part does not take a species out of a continent.
        const height = sample === null ? KINDS[kind].height : sample.height;
        if (height * scale >= floor) out.push({ item: id, weight });
      }
      weight *= 0.45;
    }
    floras.set(key, out);
    return out;
  }

  return { variantOf, nearOf, floraFor, kindOf, missing, broken };
}
