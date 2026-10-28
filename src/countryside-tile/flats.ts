/** The countryside's parts flattened once: the kit's pieces, the fleet's tractor, near trees and rotors. */
import type * as THREE from 'three';
import { mergeMeshes } from '../merge.ts';
import type { MergePiece } from '../merge.ts';
import { SURFACE, glassOf, surfaceBytes } from '../surfaces.ts';
import type { SurfaceName } from '../surfaces.ts';
import { measure } from '../scenery/contract.ts';
import type { RegionStyle, SceneryContext } from '../scenery/contract.ts';
import { nearArrays } from '../scenery/tree-forms.ts';
import type { LeafArrays } from '../scenery/tree-forms.ts';
import { COUNTRY_PARTS, ROTOR_RADIUS, buildRotor, pieceRng } from '../countryside-kit.ts';
import type { RotorKind } from '../countryside-kit.ts';
import { parkedArrays, parkedModel } from '../craft/parked.ts';
import type { CountryPiece } from '../countryside.ts';
import type { CountryFlat } from './types.ts';

/**
 * What each built piece's walls are made of (`src/surfaces.ts`): its roof and
 * its panes are found on it as a town's are. A piece not named here (a tent,
 * a hay bale, a standing stone, a cairn of drawn stones) is left as drawn.
 */
const WALLS_OF: Readonly<Record<string, SurfaceName>> = {
  barn: 'timber',
  silo: 'metal',
  windpump: 'metal',
  windmill: 'stone',
  turbine: 'metal',
  lighthouse: 'plaster',
  'wayside-cross': 'stone',
  chapel: 'plaster',
  torii: 'timber',
  'road-shrine': 'stone',
  chorten: 'plaster',
  'spirit-house': 'timber',
  marabout: 'plaster',
  'hindu-shrine': 'stone',
  'ruin-column': 'stone',
  'ruin-wall': 'stone',
  'fishing-hut': 'timber',
  jetty: 'timber',
  bench: 'timber',
  signpost: 'timber',
};

export interface NearFlat {
  flat: CountryFlat;
  leaves: LeafArrays;
}

export interface Flats {
  /** A piece as the far tiles draw it; the scenic kit's parts come from `scenic`. */
  flatOf(piece: CountryPiece, style: RegionStyle): CountryFlat | null;
  /**
   * A vehicle the fleet can take, as its tile draws it: the craft itself in
   * the look its id decides, at the craft's own size, solid as a farm's
   * building is. Null while the kit is not registered.
   */
  machineFlat(craft: string, variant: number): CountryFlat | null;
  /** A tree piece as a near tile draws it: its wood, solid as its lumps are, and its cards. */
  nearOf(piece: CountryPiece, style: RegionStyle): NearFlat | null;
  rotorOf(kind: RotorKind): CountryFlat;
}

export function createFlats(
  ctx: SceneryContext,
  scenic: (part: string, style: RegionStyle, variant: number) => CountryFlat | null,
): Flats {
  const variants = new Map<string, CountryFlat | null>();
  const machineFlats = new Map<string, CountryFlat | null>();
  const nearVariants = new Map<string, NearFlat | null>();
  const rotors = new Map<RotorKind, CountryFlat>();

  function flatOf(piece: CountryPiece, style: RegionStyle): CountryFlat | null {
    if (piece.scenic) return scenic(piece.part, style, piece.variant);
    const key = `${piece.part}|${style.id}|${piece.variant}`;
    const known = variants.get(key);
    if (known !== undefined) return known;
    const spec = COUNTRY_PARTS[piece.part];
    let made: CountryFlat | null = null;
    if (spec !== undefined) {
      try {
        const group = spec.build(ctx, pieceRng(spec.id, style.id, piece.variant), style);
        const pieces: MergePiece[] = [];
        const merged = mergeMeshes(group, pieces);
        made = {
          ...merged,
          height: measure(group).height,
          footprint: spec.footprint,
          tilt: 0,
          solid: spec.afloat === true ? undefined : spec.body ?? 'walls',
          breaks: spec.afloat === true ? undefined : spec.breaks,
        };
        const walls = WALLS_OF[spec.id];
        if (walls !== undefined) {
          const bytes = surfaceBytes(merged.position, merged.normal, merged.color, glassOf(pieces, merged.position.length / 3), SURFACE[walls]);
          made.surface = bytes.surface;
          made.pane = bytes.pane;
        }
        group.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
      } catch (error) {
        console.warn(`countryside: ${key} did not build`, error);
      }
    }
    variants.set(key, made);
    return made;
  }

  function machineFlat(craft: string, variant: number): CountryFlat | null {
    const key = `${craft}#${variant}`;
    const known = machineFlats.get(key);
    if (known !== undefined) return known;
    const model = parkedModel(craft);
    if (model === null) return null;
    let made: CountryFlat | null = null;
    try {
      // Its cabin merged and its windows open: a tile has no see-through
      // material, and the inside is to be seen.
      const { glass: _open, ...arrays } = parkedArrays(model, variant, undefined, 1, true);
      made = {
        ...arrays,
        height: model.size[2],
        footprint: COUNTRY_PARTS[craft]?.footprint ?? Math.max(model.size[0], model.size[1]) * 0.5,
        tilt: 0,
        solid: 'walls',
      };
    } catch (error) {
      console.warn(`countryside: the ${key} did not build`, error);
    }
    machineFlats.set(key, made);
    return made;
  }

  function nearOf(piece: CountryPiece, style: RegionStyle): NearFlat | null {
    if (piece.scenic) return null;
    const key = `${piece.part}|${style.id}|${piece.variant}`;
    const known = nearVariants.get(key);
    if (known !== undefined) return known;
    const spec = COUNTRY_PARTS[piece.part];
    const lumps = flatOf(piece, style);
    let made: NearFlat | null = null;
    if (spec?.form !== undefined && lumps !== null) {
      const { wood, leaves } = nearArrays(spec.form(pieceRng(spec.id, style.id, piece.variant), style));
      made = { flat: { ...wood, outline: wood.normal, triangles: wood.position.length / 9, height: lumps.height, footprint: lumps.footprint, tilt: 0, solid: lumps.solid }, leaves };
    }
    nearVariants.set(key, made);
    return made;
  }

  function rotorOf(kind: RotorKind): CountryFlat {
    let flat = rotors.get(kind);
    if (flat === undefined) {
      const group = buildRotor(ctx, kind);
      flat = { ...mergeMeshes(group), height: ROTOR_RADIUS[kind] * 2, footprint: ROTOR_RADIUS[kind], tilt: 0 };
      rotors.set(kind, flat);
    }
    return flat;
  }

  return { flatOf, machineFlat, nearOf, rotorOf };
}
