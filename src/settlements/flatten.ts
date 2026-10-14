import type * as THREE from 'three';
import { bedtimeByte, bedtimeNever } from '../lights.ts';
import { mergeMeshes, sourceVertex } from '../merge.ts';
import type { MergePiece } from '../merge.ts';
import { rngFrom } from '../scenery/index.ts';
import type { FlatVariant } from './types.ts';

/**
 * A built variant read into the flat arrays a town is merged from, with its
 * windows' light and bedtime drawn once per window.
 */

/**
 * Share of a variant's marked windows that are dark, and how bright the rest
 * are. The variety is drawn per window here and again per instance in the
 * raise (`INSTANCE_DIM`, `INSTANCE_BED`), both seeded, so a town looks the same
 * on every load.
 */
const WINDOW_DARK = 0.28;
const WINDOW_LOW = 0.42;
const WINDOW_HIGH = 1;

/**
 * The dimmest a whole building may be, as a multiplier on its variant's own
 * window pattern: a fully dark house reads as a window that failed to draw.
 */
export const INSTANCE_DIM = 0.34;

/**
 * How far a building's bedtime may wander from its variant's, in encoded steps
 * of 3.75 minutes: an hour either way, well under the spread of the bedtimes
 * themselves (`BED_FROM` to `BED_TO` in `lights.ts`).
 */
export const INSTANCE_BED = 16;

/**
 * Reads a built variant into flat arrays, in the variant's own space.
 *
 * The geometry is `mergeMeshes`'; this adds the windows, walked over the same
 * pieces in the same order. `key` seeds the window pattern (the variant's cache
 * key, so a house is the same on every load). `lottery` is whether windows are
 * a household's (some dark, some bright, off at bedtime) or the council's (a
 * street lamp: on, till dawn); it follows the part's kind.
 */
export function flatten(
  group: THREE.Group,
  key: string | number = 'variant',
  lottery = true,
): Omit<FlatVariant, 'height'> {
  const merged: MergePiece[] = [];
  const arrays = mergeMeshes(group, merged);
  const vertices = arrays.triangles * 3;
  const out = {
    ...arrays,
    glow: new Uint8Array(vertices * 2),
    emits: false,
    litBed: 0,
    pieceVertices: merged.map((piece) => piece.count),
  };
  let brightest = 0;

  let window = 0;
  for (const piece of merged) {
    // `ctx.lit` marks the mesh, so one glass colour can be a window on one part and a doorway on the next.
    const lit = typeof piece.mesh.userData.atlasLit === 'number' ? (piece.mesh.userData.atlasLit as number) : 0;
    // A painted building is one mesh: its mask names and numbers its windows (`ModelFit.windows`).
    const windows = piece.geometry.getAttribute('atlasWindow');
    /** One window's light and its hour, drawn once. */
    const roll = (): [number, number] => {
      // Keyed on the window's ordinal within the variant, so adding a piece does not relight the rest.
      const rng = rngFrom(key, 'window', window++);
      const glow = !lottery
        ? Math.round(lit * 255)
        : rng.chance(WINDOW_DARK)
          ? 0
          : Math.round(rng.range(WINDOW_LOW, WINDOW_HIGH) * lit * 255);
      const draw = rng.unit();
      const bed = bedtimeByte(draw, !lottery || bedtimeNever(draw));
      if (glow > 0) {
        out.emits = true;
        if (glow > brightest) {
          brightest = glow;
          out.litBed = bed;
        }
      }
      return [glow, bed];
    };
    let glow = 0;
    let bed = 0;
    if (lit > 0 && windows === undefined) [glow, bed] = roll();
    const panes = new Map<number, [number, number]>();
    for (let i = 0; i < piece.count; i++) {
      const vertex = piece.first + i;
      if (windows === undefined) {
        out.glow[vertex * 2] = glow;
        out.glow[vertex * 2 + 1] = bed;
      } else {
        const pane = windows.getX(sourceVertex(piece, i));
        let light: [number, number] = [0, 0];
        if (pane > 0 && lit > 0) {
          light = panes.get(pane) ?? roll();
          panes.set(pane, light);
        }
        out.glow[vertex * 2] = light[0];
        out.glow[vertex * 2 + 1] = light[1];
      }
    }
  }
  return { ...out, box: planBox(out.position) };
}

/** How far a run of positions reaches along X and Z; zero for none unless `keepEmpty`, which leaves the infinities. */
export function planBox(position: ArrayLike<number>, keepEmpty = false): FlatVariant['box'] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    minX = Math.min(minX, position[i]!);
    maxX = Math.max(maxX, position[i]!);
    minZ = Math.min(minZ, position[i + 2]!);
    maxZ = Math.max(maxZ, position[i + 2]!);
  }
  if (!keepEmpty && minX > maxX) minX = maxX = minZ = maxZ = 0;
  return { minX, maxX, minZ, maxZ };
}
