/**
 * What a monument's faces are built of: its `atlasSurface` bytes, one a
 * vertex of the merged buffer, which the monuments' material draws as a
 * pattern over the flat colour (`src/surfaces.ts`).
 *
 * A colour is a material by the monument's word (`Monument.surfaces`), else
 * by what the colour always is (gilding is metal; sky, water,
 * foliage and the ink are left flat), else by the monument's own `surface`,
 * stone when it says nothing. A colour that covers little of the model is its
 * trim and stays flat, as a town's does, unless the monument names it. A
 * roofing colour that mostly slopes is a roof, tiled or slated by the town's
 * own pattern, on a monument built of masonry.
 */
import type * as THREE from 'three';
import type { MergePiece, Merged } from '../merge.ts';
import { paletteBase } from '../monuments/contract.ts';
import type { Monument, MonumentSurface } from '../monuments/contract.ts';
import { ROOF, SURFACE, UPRIGHT, faceAreas } from '../surfaces.ts';
import type { Surface } from '../surfaces.ts';
import type { PALETTE } from '../theme.ts';

type PaletteName = keyof typeof PALETTE;
export type SurfaceSpec = Pick<Monument, 'surface' | 'surfaces'>;

const CODE: Record<MonumentSurface, Surface> = {
  none: SURFACE.none,
  stone: SURFACE.stone,
  brick: SURFACE.brick,
  plaster: SURFACE.plaster,
  concrete: SURFACE.concrete,
  metal: SURFACE.metal,
  timber: SURFACE.timber,
};

/** Colours that are never a built face: sky and water, foliage, the ink. */
const FLAT = new Set<PaletteName>(['skyBlue', 'green', 'darkOlive', 'olive', 'ink']);
/** Colours that are metal on any monument: the gilding. */
const METAL = new Set<PaletteName>(['gold']);
/** Colours a sloping face is a roof in. */
const ROOFING = new Set<PaletteName>(['clay', 'red', 'crimson', 'slate', 'steel', 'bark']);
/** Monuments whose roofs are drawn as roofs: the masonry ones. */
const ROOFED = new Set<MonumentSurface>(['stone', 'brick', 'plaster', 'timber']);

/** The share of the model's area a colour must cover to be drawn as a material rather than trim. */
const MIN_SHARE = 0.04;
/** The share of a roofing colour's area that must slope up for it to be a roof. */
const ROOF_SLOPE = 0.5;
/** Steeper than this a face is a roof's slope; flatter it is a terrace. */
const FLAT_TOP = 0.96;

interface Tally {
  area: number;
  sloped: number;
}

function isUnder(object: THREE.Object3D, root: THREE.Object3D | null): boolean {
  for (let at: THREE.Object3D | null = object; at !== null; at = at.parent) if (at === root) return true;
  return false;
}

/** The monument's `atlasSurface` bytes, one a vertex of `merged`; the square round it is left flat. */
export function monumentSurfaces(
  spec: SurfaceSpec,
  merged: Merged,
  pieces: readonly MergePiece[],
  square: THREE.Object3D | null,
): Uint8Array {
  const out = new Uint8Array(merged.position.length / 3);
  const base = spec.surface ?? 'stone';
  const faces = faceAreas(merged.position);
  const names: (PaletteName | undefined)[] = [];
  const tally = new Map<PaletteName, Tally>();
  let total = 0;
  for (const piece of pieces) {
    const stamp = piece.material.userData.atlasToon as number | undefined;
    const name = stamp === undefined || isUnder(piece.mesh, square) ? undefined : paletteBase(stamp);
    names.push(name);
    if (name === undefined) continue;
    const entry = tally.get(name) ?? { area: 0, sloped: 0 };
    for (let f = piece.first / 3; f < (piece.first + piece.count) / 3; f++) {
      const area = faces.area[f]!;
      const up = faces.up[f]!;
      entry.area += area;
      if (up > UPRIGHT && up < FLAT_TOP) entry.sloped += area;
      total += area;
    }
    tally.set(name, entry);
  }
  const codeOf = new Map<PaletteName, Surface>();
  const roofOf = new Set<PaletteName>();
  for (const [name, entry] of tally) {
    const named = spec.surfaces?.[name];
    if (named === 'roof') {
      codeOf.set(name, CODE[base === 'none' ? 'stone' : base]);
      roofOf.add(name);
      continue;
    }
    if (named !== undefined) {
      codeOf.set(name, CODE[named]);
      continue;
    }
    if (base === 'none' || FLAT.has(name) || entry.area < total * MIN_SHARE) continue;
    const material = METAL.has(name) ? 'metal' : base;
    codeOf.set(name, CODE[material]);
    if (ROOFED.has(base) && ROOFING.has(name) && entry.sloped >= entry.area * ROOF_SLOPE) roofOf.add(name);
  }
  pieces.forEach((piece, i) => {
    const name = names[i];
    if (name === undefined) return;
    const code = codeOf.get(name) ?? SURFACE.none;
    if (code === SURFACE.none) return;
    const roofed = roofOf.has(name);
    for (let f = piece.first / 3; f < (piece.first + piece.count) / 3; f++) {
      const up = faces.up[f]!;
      const mark = roofed && up > UPRIGHT && up < FLAT_TOP ? ROOF : code;
      out[f * 3] = mark;
      out[f * 3 + 1] = mark;
      out[f * 3 + 2] = mark;
    }
  });
  return out;
}
