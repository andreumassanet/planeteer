import * as THREE from 'three';
import { mergeMeshes } from '../../merge.ts';
import type { Paint } from '../../models.ts';
import type { ModelFit, SceneryContext } from '../contract.ts';

/** A baked model as flat arrays in its own space, painted: what `Sink.model` draws. */
export interface ModelArrays {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  triangles: number;
}

/**
 * Where the pieces a CC0 model is better at come from: a model of the kit
 * (`scripts/build-kit.ts`, `buildings/kit.bin`) fitted, painted and merged,
 * or null while the kit is not registered, when the code piece stands in.
 */
export interface PropModels {
  get(id: string, fit: ModelFit, paint: Paint, key: string): ModelArrays | null;
}

/**
 * The models, fitted and merged once a paint and kept: a town's forty
 * planters are one merge. `fitted` throws for a model the kit does not have
 * or before the kit is registered, and that is the code piece for now, not a
 * town lost.
 */
export function propModels(ctx: SceneryContext): PropModels {
  const cache = new Map<string, ModelArrays | null>();
  return {
    get(id, fit, paint, key) {
      const known = cache.get(`${id}|${key}`);
      if (known !== undefined) return known;
      let arrays: ModelArrays | null = null;
      try {
        const group = ctx.fitted(id, fit, paint);
        group.updateMatrixWorld(true);
        const merged = mergeMeshes(group);
        arrays = { position: merged.position, normal: merged.normal, color: merged.color, triangles: merged.triangles };
      } catch {
        // Not kept: the kit may be registered by the next town.
        return null;
      }
      cache.set(`${id}|${key}`, arrays);
      return arrays;
    },
  };
}

/** How light a colour is, 0 to 1: which of a model's slots is its soil and which its stone. */
export const lightness = (color: THREE.Color): number => Math.max(color.r, color.g, color.b);
export const greenest = (color: THREE.Color): boolean => color.g > color.r * 1.15 && color.g > color.b;
