/** Placing kit models into a town's draft group, painted and re-centred. */

import * as THREE from 'three';
import { paintModel } from '../../models.ts';
import type { Model, Paint } from '../../models.ts';
import { PIECES, SCATTER, buildingPaint, craftPaint } from '../kit.ts';
import type { Livery, WorldKit } from '../kit.ts';

/** A material that says "the colours are the geometry's" to `mergeMeshes`; it is never drawn. */
const PAINTED = new THREE.MeshBasicMaterial();
PAINTED.userData.atlasPainted = true;

/**
 * A kit model as a mesh in its own pack frame, painted, its window vertices
 * marked in `userData.glow` for the town's emission. Its attributes are the
 * model's, shared: `userData.shared` keeps the town from disposing them.
 */
export function pieceMesh(model: Model, paint: Paint, glass: Set<string> | null): THREE.Mesh {
  const geometry = paintModel(model, paint);
  const mesh = new THREE.Mesh(geometry, PAINTED);
  mesh.userData.shared = true;
  if (glass !== null && glass.size > 0) {
    const lit = model.slots.map((slot) => glass.has(slot));
    const mask = new Uint8Array(model.slot.length);
    for (let v = 0; v < mask.length; v++) mask[v] = lit[model.slot[v]!] === true ? 1 : 0;
    mesh.userData.glow = mask;
  }
  return mesh;
}

/**
 * A kit piece standing in `draft`: re-centred from the pack's frame onto
 * its own middle and the floor, scaled to `size` world units a pack unit,
 * turned. `extra` is set in the same pack frame (a roof piece, the cradle
 * under a pod). Returns its height, or 0 if the piece is not loaded.
 */
export function placeModel(kit: WorldKit, draft: THREE.Group, id: string, paint: (id: string, glass: Set<string>) => Paint, size: number, x: number, y: number, z: number, yaw: number, extra: readonly string[] = []): number {
  const piece = kit.pieces.get(id);
  if (piece === undefined) return 0;
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  const glass = new Set<string>();
  inner.add(pieceMesh(piece.model, paint(id, glass), glass));
  for (const more of extra) {
    const part = kit.pieces.get(more);
    if (part === undefined) continue;
    const partGlass = new Set<string>();
    inner.add(pieceMesh(part.model, paint(more, partGlass), partGlass));
  }
  const box = piece.model.box;
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  holder.add(inner);
  holder.scale.setScalar(size);
  holder.rotation.y = yaw;
  holder.position.set(x, y, z);
  draft.add(holder);
  let top = box.max.y;
  for (const more of extra) top = Math.max(top, kit.pieces.get(more)?.model.box.max.y ?? top);
  return (top - box.min.y) * size;
}

/** A kit building in a livery, at a colony scale on top of its own (`PIECES`). */
export function placePiece(kit: WorldKit, draft: THREE.Group, id: string, livery: Livery, scale: number, x: number, y: number, z: number, yaw: number, extra: readonly string[] = []): number {
  const info = PIECES[id];
  if (info === undefined) return 0;
  return placeModel(kit, draft, id, (one, glass) => buildingPaint(one, livery, glass), info.scale * scale, x, y, z, yaw, extra);
}

/** A plant or a prop of the kit, at its own size (`SCATTER`) times `scale`. */
export function placeScatter(kit: WorldKit, draft: THREE.Group, id: string, livery: Livery | null, scale: number, x: number, y: number, z: number, yaw: number): number {
  const info = SCATTER[id];
  if (info === undefined) return 0;
  return placeModel(kit, draft, id, () => craftPaint(livery), info.scale * scale, x, y, z, yaw);
}
