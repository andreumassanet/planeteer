import * as THREE from 'three';

/**
 * A built group reduced to flat vertex arrays, in the group's own space: the
 * one step that makes a town one draw call, a wood tile one, a mover one and a
 * monument one.
 *
 * **It was written three times** — `settlements.ts`'s `flatten`,
 * `vegetation.ts`'s copy of it and `life.ts`'s `mergeGroup` — each for a
 * reason that was true the day it was written (a file owned elsewhere, a lit
 * window stamped in as it went, a group with a scale on it, a module that has
 * to load in Node), and none of which needs a second copy of the arithmetic.
 * The three agreed on everything that matters and are this now; what is
 * particular to one caller — the settlements' windows — is a second pass over
 * the `pieces` it asks for, through `sourceVertex`.
 *
 * What it does, in the order that matters:
 *
 * - **Colour comes off the material and onto the vertices**, which is what
 *   makes a merge possible at all: `ctx.toon` stamps the colour as drawn into
 *   `userData.atlasToon`, and a painted material (`atlasPainted`) says the
 *   colours are the geometry's own `color` attribute. A material that went
 *   through neither is white rather than a throw — one part drawn wrong is
 *   better than a continent with nothing on it.
 * - **Normals go through the inverse transpose and not the rotation.** A bus
 *   was placed at 2 x 2 x 1.35 while vehicles were doubled and cropped (until
 *   2026-09-24), and under a scale like that a normal rotated without the
 *   correction points off the surface by up to 8 degrees, which the ink then builds its
 *   hull along. The group's own transform is included, so a scale placed on
 *   the root is baked into the vertices.
 * - **The ink's normals ride along**: a painted mesh's welded `outlineNormal`,
 *   the fill's own normal for anything built in code, so every merged buffer
 *   carries the one attribute its material's hull reads (`outline.ts`).
 * - **A mirrored piece is rewound.** Three flips the front face of a mesh
 *   whose matrix is a reflection, and a merged buffer has no matrix to flip
 *   by, so a mirrored piece's triangles are written with two corners swapped.
 *   Without it the piece is drawn inside out and its hull front-facing: a
 *   solid blob of ink.
 *
 * Importable in Node: it depends on three and nothing else, which is what
 * `scripts/check-life.ts` needs of `life.ts`.
 */
export interface MergePiece {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  /** The mesh's matrix in the merged space. */
  matrix: THREE.Matrix4;
  material: THREE.Material;
  /** Where its vertices start in the merged arrays, and how many there are. */
  first: number;
  count: number;
  /** Its matrix is a reflection, so its triangles were rewound; see `sourceVertex`. */
  mirrored: boolean;
}

export interface Merged {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  /** The ink's normals; see above. */
  outline: Float32Array;
  triangles: number;
}

/** Corner order of a rewound triangle: the first stays, the other two swap. */
const REWOUND = [0, 2, 1] as const;

/**
 * The source vertex the `i`th merged vertex of `piece` was read from, which is
 * what a caller walking a piece's own attributes a second time needs.
 */
export function sourceVertex(piece: MergePiece, i: number): number {
  const corner = piece.mirrored ? i - (i % 3) + REWOUND[i % 3]! : i;
  const index = piece.geometry.index;
  return index !== null ? index.getX(corner) : corner;
}

const tint = new THREE.Color();
const point = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();

/**
 * Merges every mesh under `root`. `pieces`, when given, is filled with where
 * each mesh went — handed in rather than returned, so a caller that caches the
 * arrays does not keep every source geometry alive with them.
 */
export function mergeMeshes(root: THREE.Object3D, pieces: MergePiece[] = []): Merged {
  root.updateMatrixWorld(true);
  pieces.length = 0;
  let vertices = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (position === undefined) return;
    const count = geometry.index ? geometry.index.count : position.count;
    pieces.push({
      mesh,
      geometry,
      matrix: mesh.matrixWorld.clone(),
      material: Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material,
      first: vertices,
      count,
      mirrored: mesh.matrixWorld.determinant() < 0,
    });
    vertices += count;
  });

  const out: Merged = {
    position: new Float32Array(vertices * 3),
    normal: new Float32Array(vertices * 3),
    color: new Float32Array(vertices * 3),
    outline: new Float32Array(vertices * 3),
    triangles: vertices / 3,
  };

  for (const piece of pieces) {
    const geometry = piece.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const outline = geometry.getAttribute('outlineNormal') ?? normal;
    const paint = piece.material.userData.atlasPainted === true ? geometry.getAttribute('color') : undefined;
    tint.set((piece.material.userData.atlasToon as number | undefined) ?? 0xffffff);
    normalMatrix.getNormalMatrix(piece.matrix);
    let cursor = piece.first * 3;
    for (let i = 0; i < piece.count; i++) {
      const v = sourceVertex(piece, i);
      point.fromBufferAttribute(position, v).applyMatrix4(piece.matrix);
      out.position[cursor] = point.x;
      out.position[cursor + 1] = point.y;
      out.position[cursor + 2] = point.z;
      point.fromBufferAttribute(normal, v).applyMatrix3(normalMatrix).normalize();
      out.normal[cursor] = point.x;
      out.normal[cursor + 1] = point.y;
      out.normal[cursor + 2] = point.z;
      point.fromBufferAttribute(outline, v).applyMatrix3(normalMatrix).normalize();
      out.outline[cursor] = point.x;
      out.outline[cursor + 1] = point.y;
      out.outline[cursor + 2] = point.z;
      if (paint !== undefined) {
        out.color[cursor] = paint.getX(v);
        out.color[cursor + 1] = paint.getY(v);
        out.color[cursor + 2] = paint.getZ(v);
      } else {
        out.color[cursor] = tint.r;
        out.color[cursor + 1] = tint.g;
        out.color[cursor + 2] = tint.b;
      }
      cursor += 3;
    }
  }
  return out;
}
