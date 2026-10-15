/**
 * Building a monument's geometry: the model merged into one buffer with its
 * square and its night bytes, cached per monument, drawn with one shared material.
 */
import * as THREE from 'three';
import { mergeMeshes } from '../merge.ts';
import type { MergePiece } from '../merge.ts';
import { lightMonuments } from '../lights.ts';
import { bakeNight } from '../landmark-lights.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import { seeThrough } from '../see-through.ts';
import { buildSetting } from '../landmark-setting.ts';
import { regionFor } from '../scenery/regions.ts';
import { drawSurfaces } from '../surfaces.ts';
import type { MonumentContext } from '../monuments/contract.ts';
import type { MonumentKit, Placement } from '../placement.ts';
import type { Slot } from './slots.ts';
import { monumentSurfaces } from './surfaces.ts';
import type { SurfaceSpec } from './surfaces.ts';

/** Merged geometries kept per monument; the oldest not standing go first. */
const KEEP_BUILT = 24;

export interface Builder {
  /** The one material every monument is drawn with. */
  readonly material: THREE.MeshToonMaterial;
  /** The monument's merged geometry, built or from the cache; null (and the slot failed) if it breaks the contract. */
  geometryOf(slot: Slot): THREE.BufferGeometry | null;
}

/**
 * A monument is one mesh in the world: every material in one comes from
 * `ctx.toon`, so its colour is a stamp on the material and the whole model
 * merges the way a town does (`merge.ts`), one buffer, one material, one draw.
 * The merged geometry is kept per monument, since building is the expensive half
 * of a raise; `drop` frees the GPU's copy and keeps the arrays.
 */
export function createBuilder(
  kit: MonumentKit,
  ctx: MonumentContext,
  continentOf: ReadonlyMap<string, string>,
  slots: readonly Slot[],
  broken: string[],
): Builder {
  const built = new Map<string, THREE.BufferGeometry>();
  // One material for every monument, drawn on the context's own ramp.
  const inked = ctx.toon(ctx.palette.ink);
  const material = shadeByClouds(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: inked.gradientMap }));
  material.userData.outlineParameters = {
    ...(inked.userData.outlineParameters as object),
    // Every merged buffer carries the ink's normals, as every town does.
    outlineNormal: true,
  };
  // After dark: the town's lamps, headlights and fires, the lit parts and the
  // floodlight, from the bytes `geometryOf` bakes (`landmark-lights.ts`).
  lightMonuments(material);
  // What its faces are built of, from the `atlasSurface` bytes (`surfaces.ts`),
  // under the floodlight, which lights the pattern with the colour.
  drawSurfaces(material);
  // Its own key, as `lightMonuments` asks, kept in front of the `|clouds` the
  // shade stamped on it above: one program carries every hook.
  const shadedKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `atlas-monument:lit|surfaces|${shadedKey()}`;
  // Last: what stands between the lens and the body is seen through.
  seeThrough(material);
  const specOf = new Map<string, SurfaceSpec>(kit.monuments.map((monument) => [monument.id, monument]));

  /** A plaza landmark's square, merged into the model so it costs no draw call of its own. */
  function addSquare(model: THREE.Group, placement: Placement): THREE.Group | null {
    if (placement.setting !== 'plaza') return null;
    const region = regionFor(placement.iso, continentOf.get(placement.iso) ?? '', placement.lat).id;
    const square = buildSetting(ctx, placement, region);
    if (square !== null) model.add(square);
    return square;
  }

  function geometryOf(slot: Slot): THREE.BufferGeometry | null {
    const id = slot.placement.id;
    const known = built.get(id);
    if (known !== undefined) {
      // Most recently used last, which is the order `KEEP_BUILT` evicts in.
      built.delete(id);
      built.set(id, known);
      return known;
    }
    let model: THREE.Group;
    try {
      model = kit.build(id, ctx);
    } catch (error) {
      // A monument that breaks the contract is a bug in one file, not a reason
      // for the planet to be missing. Record it and carry on.
      slot.failed = true;
      broken.push(`${id}: ${String(error)}`);
      return null;
    }
    // The square is the world's and not the model's, so it is added after the
    // contract has passed the model.
    const square = addSquare(model, slot.placement);
    const pieces: MergePiece[] = [];
    const merged = mergeMeshes(model, pieces);
    // Its night, in bytes beside the merge and kept with it (`landmark-lights.ts`).
    const bake = bakeNight(id, slot.placement.height, merged, pieces, square);
    const surface = monumentSurfaces(specOf.get(id) ?? {}, merged, pieces, square);
    pieces.length = 0;
    // The vertices are copied out; the helpers' geometries are this build's.
    // Materials are the shared cache's and must not be touched.
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    const outline = new Int8Array(merged.outline.length);
    for (let i = 0; i < outline.length; i++) outline[i] = Math.round(merged.outline[i]! * 127);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
    geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline, 3, true));
    geometry.setAttribute('atlasFlood', new THREE.BufferAttribute(bake.flood, 4, true));
    geometry.setAttribute('atlasLit', new THREE.BufferAttribute(bake.lit, 2, true));
    geometry.setAttribute('atlasSurface', new THREE.BufferAttribute(surface, 1, false));
    geometry.userData.atlasNight = bake;
    geometry.computeBoundingSphere();
    built.set(id, geometry);
    if (built.size > KEEP_BUILT) {
      for (const [key, cached] of built) {
        if (built.size <= KEEP_BUILT) break;
        if (slots.some((other) => other.object?.geometry === cached)) continue;
        built.delete(key);
      }
    }
    return geometry;
  }

  return { material, geometryOf };
}
