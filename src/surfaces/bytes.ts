import { sourceVertex } from '../merge.ts';
import type { MergePiece } from '../merge.ts';
import { GLASS, ROOF } from './codes.ts';
import type { Surface } from './codes.ts';
import { MARK, paneCornersOf, surfaceMarks } from './mask.ts';

/** A built thing's surface bytes: `atlasSurface` one a vertex, `atlasPane` two (null without glass). */
export interface SurfaceBytes {
  surface: Uint8Array;
  pane: Uint8Array | null;
}

/**
 * Which merged vertices are window glass, off the pieces `mergeMeshes`
 * reported: a pane the scenery context made (`atlasWindow` on the mesh), or a
 * painted model's own window mask (its `atlasWindow` attribute). A lamp's lit
 * glass is not a window.
 */
export function glassOf(pieces: readonly MergePiece[], vertices: number): Uint8Array {
  const out = new Uint8Array(vertices);
  for (const piece of pieces) {
    if (piece.mesh.userData.atlasWindow === true) {
      out.fill(1, piece.first, piece.first + piece.count);
      continue;
    }
    const mask = piece.geometry.getAttribute('atlasWindow');
    if (mask === undefined) continue;
    for (let i = 0; i < piece.count; i++) if (mask.getX(sourceVertex(piece, i)) > 0) out[piece.first + i] = 1;
  }
  return out;
}

/**
 * The bytes of a flat, non-indexed build whose walls are `wall`: its walls,
 * roof and panes marked as a town's are (`surfaceMarks`), the panes being the
 * triangles all of whose corners `glass` flags.
 */
export function surfaceBytes(
  position: Float32Array,
  normal: Float32Array,
  color: Float32Array,
  glass: Uint8Array,
  wall: Surface,
): SurfaceBytes {
  const marks = surfaceMarks(position, color, (t) => glass[t] === 1 && glass[t + 1] === 1 && glass[t + 2] === 1);
  const surface = new Uint8Array(marks.length);
  let glazed = false;
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]!;
    surface[i] = mark === MARK.wall ? wall : mark === MARK.roof ? ROOF : mark === MARK.pane ? GLASS : 0;
    if (mark === MARK.pane) glazed = true;
  }
  return { surface, pane: glazed ? paneCornersOf(position, normal, marks) : null };
}
