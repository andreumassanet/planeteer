/** Sorting the puffs into chunks and building the instanced meshes the deck is drawn with. */
import * as THREE from 'three';
import { FAR_DETAIL, MID_DETAIL, NEAR_DETAIL, SUB_LEVEL } from './field.ts';
import { capOf, instanced, levelOf, puffGeometry } from './geometry.ts';
import type { Base, Batch, Sub } from './geometry.ts';

/** The three puff shapes the deck is drawn in, nearest first, and their triangle counts. */
export function createShapes() {
  const nearShape = puffGeometry(NEAR_DETAIL);
  const midShape = puffGeometry(MID_DETAIL);
  const farShape = puffGeometry(FAR_DETAIL);
  const trianglesOf = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
  const nearTriangles = trianglesOf(nearShape);
  const midTriangles = trianglesOf(midShape);
  const farTriangles = trianglesOf(farShape);
  return { nearShape, midShape, farShape, nearTriangles, midTriangles, farTriangles };
}

export type Shapes = ReturnType<typeof createShapes>;

/** The 20 base chunks, each with its sub-chunks, and the bytes of instance data they hold. */
export function buildBases(
  fine: Batch,
  coarse: Batch,
  shapes: Shapes,
  material: THREE.Material,
  group: THREE.Group,
): { bases: Base[]; bytes: number } {
  const { nearShape, midShape, farShape } = shapes;
  const subsPerBase = 4 ** SUB_LEVEL;
  /** A batch counting-sorted into its chunks: one matrix, depth and shade array a chunk. */
  const sortInto = (
    from: Batch,
    chunks: number,
  ): { matrices: Float32Array; deep: Uint8Array; shade: Float32Array }[] => {
    const count = new Int32Array(chunks);
    for (const c of from.chunk) count[c]!++;
    const out = Array.from(count, (n) => ({
      matrices: new Float32Array(n * 16),
      deep: new Uint8Array(n),
      shade: new Float32Array(n * 3),
    }));
    const cursor = new Int32Array(chunks);
    for (let i = 0; i < from.chunk.length; i++) {
      const c = from.chunk[i]!;
      const k = cursor[c]!++;
      const into = out[c]!;
      for (let e = 0; e < 16; e++) into.matrices[k * 16 + e] = from.matrix[i * 16 + e]!;
      into.deep[k] = from.deep[i]!;
      for (let e = 0; e < 3; e++) into.shade[k * 3 + e] = from.shade[i * 3 + e]!;
    }
    return out;
  };
  const subData = sortInto(fine, 20 * subsPerBase);
  const baseData = sortInto(coarse, 20);
  let bytes = 0;
  const bases: Base[] = [];
  for (let c = 0; c < 20; c++) {
    const subs: Sub[] = [];
    const every: Float32Array[] = [];
    for (let s = c * subsPerBase; s < (c + 1) * subsPerBase; s++) {
      const data = subData[s]!;
      if (data.deep.length === 0) continue;
      const matrices = new THREE.InstancedBufferAttribute(data.matrices, 16);
      const deep = new THREE.InstancedBufferAttribute(data.deep, 1, true);
      const shade = new THREE.InstancedBufferAttribute(data.shade, 3);
      const levels: Sub['levels'] = [
        levelOf(nearShape, deep, shade),
        levelOf(midShape, deep, shade),
        levelOf(farShape, deep, shade),
      ];
      const mesh = instanced(levels[0], material, matrices, `clouds-${s}`);
      group.add(mesh);
      subs.push({ mesh, levels, cap: capOf(data.matrices) });
      every.push(data.matrices);
      bytes += data.matrices.byteLength + data.deep.byteLength + data.shade.byteLength;
    }
    const data = baseData[c]!;
    let far: THREE.InstancedMesh | null = null;
    if (data.deep.length > 0) {
      far = instanced(
        levelOf(
          farShape,
          new THREE.InstancedBufferAttribute(data.deep, 1, true),
          new THREE.InstancedBufferAttribute(data.shade, 3),
        ),
        material,
        new THREE.InstancedBufferAttribute(data.matrices, 16),
        `clouds-${c}-far`,
      );
      group.add(far);
      bytes += data.matrices.byteLength + data.deep.byteLength + data.shade.byteLength;
    }
    let all: Float32Array | null = null;
    if (every.length > 0) {
      all = new Float32Array(every.reduce((n, m) => n + m.length, 0));
      let at = 0;
      for (const m of every) {
        all.set(m, at);
        at += m.length;
      }
    }
    bases.push({
      far,
      farCap: far === null ? null : capOf(data.matrices),
      subs,
      cap: all === null ? null : capOf(all),
      split: true,
    });
  }
  return { bases, bytes };
}
