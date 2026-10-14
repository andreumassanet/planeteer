import * as THREE from 'three';
import { paletteName } from '../../monuments/contract.ts';
import type { MonumentContext } from '../../monuments/contract.ts';
import { GLASS_TONE, PROUD } from './tones.ts';
import type { SceneryContext } from './context-type.ts';

/** A quad as two triangles, the corners given anticlockwise as seen from the side the face looks at. A wrong corner order is a face that is invisible, not one that is dark. */
/**
 * A quad as two triangles, the corners given anticlockwise as seen from the
 * side the face looks at. `computeVertexNormals` on the non-indexed result
 * gives each face its own normal from that winding, so a corner order that is
 * wrong is a face that is invisible — not a face that is dark.
 */
export const quad = (
  out: number[],
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  d: readonly number[],
): void => {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
};

/** `SceneryContext.merged`, as a plain function so `windows` can use it too. */
export function mergeMeshes(meshes: readonly THREE.Mesh[]): THREE.Mesh {
  if (meshes.length === 0) throw new Error('merged() was handed nothing to merge');
  const first = meshes[0]!;
  const material = (Array.isArray(first.material) ? first.material[0] : first.material) as THREE.Material;
  const color = material.userData.atlasToon as number | undefined;
  let vertices = 0;
  let lit = 0;
  const sources: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; own: boolean }[] = [];
  for (const mesh of meshes) {
    const theirs = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
    const stamp = theirs.userData.atlasToon as number | undefined;
    if (stamp !== color) {
      throw new Error(
        `merged() wants one colour and was given ${paletteName(color ?? 0)} and ${paletteName(stamp ?? 0)} — merge per colour`,
      );
    }
    const own = mesh.geometry.index !== null;
    const geometry = own ? mesh.geometry.toNonIndexed() : mesh.geometry;
    vertices += geometry.getAttribute('position').count;
    if (typeof mesh.userData.atlasLit === 'number') lit = Math.max(lit, mesh.userData.atlasLit as number);
    sources.push({ mesh, geometry, own });
  }

  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  let cursor = 0;
  for (const { mesh, geometry, own } of sources) {
    mesh.updateMatrix();
    matrix.copy(mesh.matrix);
    if (matrix.determinant() <= 0) {
      throw new Error('merged(): a piece has a reflected transform, which would render as a solid ink blob');
    }
    normalMatrix.getNormalMatrix(matrix);
    const p = geometry.getAttribute('position');
    const n = geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      position[cursor] = v.x;
      position[cursor + 1] = v.y;
      position[cursor + 2] = v.z;
      v.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      normal[cursor] = v.x;
      normal[cursor + 1] = v.y;
      normal[cursor + 2] = v.z;
      cursor += 3;
    }
    mesh.removeFromParent();
    mesh.geometry.dispose();
    if (own) geometry.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  const mesh = new THREE.Mesh(geometry, material);
  if (lit > 0) mesh.userData.atlasLit = lit;
  return mesh;
}

/** The window and mesh builders every part shares, bound to one monument context. */
export interface MeshKit {
  /** A flat-shaded mesh: one normal per face, so each facet takes its own cel band. */
  meshOf(geometry: THREE.BufferGeometry, color: number): THREE.Mesh;
  panes: SceneryContext['panes'];
  makeWindow: SceneryContext['window'];
  windows: SceneryContext['windows'];
  glass: number;
}

/** How deep a window's frame stands off the wall. Two `PROUD`s: a reveal, not a decal. */
const REVEAL = PROUD * 2;
/** The frame showing round the glass, and between two panes. */
const FRAME_MARGIN = 0.14;
const FRAME_BAR = 0.12;

export function createMeshKit(base: MonumentContext): MeshKit {
  /**
   * Same treatment every monument geometry gets, and for the same reason: one
   * normal per face, so each facet takes its own cel band instead of a smooth
   * sweep the four-step ramp cannot follow.
   */
  const meshOf = (geometry: THREE.BufferGeometry, color: number): THREE.Mesh => {
    // `roof` hands this an already non-indexed geometry; Three warns rather than
    // no-ops if it is converted twice.
    const faceted = geometry.index ? geometry.toNonIndexed() : geometry;
    if (faceted !== geometry) geometry.dispose();
    faceted.computeVertexNormals();
    return new THREE.Mesh(faceted, base.toon(color));
  };

  function panes(count: number, width: number, height: number, gap: number, color: number, depth = 0): THREE.Mesh {
    const points: number[] = [];
    const span = count * width + (count - 1) * gap;
    const z0 = -depth / 2;
    const z1 = depth / 2;
    for (let i = 0; i < count; i++) {
      const x0 = -span / 2 + i * (width + gap);
      const x1 = x0 + width;
      quad(points, [x0, 0, z1], [x1, 0, z1], [x1, height, z1], [x0, height, z1]);
      if (depth > 0) {
        quad(points, [x0, 0, z0], [x0, 0, z1], [x0, height, z1], [x0, height, z0]);
        quad(points, [x1, 0, z1], [x1, 0, z0], [x1, height, z0], [x1, height, z1]);
        quad(points, [x0, height, z1], [x1, height, z1], [x1, height, z0], [x0, height, z0]);
        quad(points, [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return meshOf(geometry, color);
  }

  const glass = base.tone(base.palette.slate, GLASS_TONE);

  function makeWindow(
    width: number,
    height: number,
    count: number,
    frame: number,
    color: number = glass,
    reveal: number = REVEAL,
  ): { frame: THREE.Mesh; glass: THREE.Mesh } {
    const plate = panes(1, width, height, 0, frame, reveal);
    if (reveal > 0) plate.geometry.translate(0, 0, reveal / 2);
    const paneWidth = (width - FRAME_MARGIN * 2 - FRAME_BAR * (count - 1)) / count;
    const pane = panes(count, paneWidth, height - FRAME_MARGIN * 2, FRAME_BAR, color);
    pane.geometry.translate(0, FRAME_MARGIN, reveal + PROUD);
    pane.userData.atlasLit = 1;
    plate.userData.atlasWindow = true;
    pane.userData.atlasWindow = true;
    return { frame: plate, glass: pane };
  }

  const windows: SceneryContext['windows'] = (row) => {
    const {
      count,
      width,
      height,
      panes: paneCount = 2,
      spread = width * 1.9,
      frame,
      glass: color = glass,
      shutters,
      reveal = REVEAL,
      strength = 1,
    } = row;
    const group = new THREE.Group();
    // Collected by colour rather than by role, so a frame and a shutter cut
    // from the same tone come out as one mesh instead of two saying the same
    // thing. `merged` refuses a mix, which is the check on this.
    const byColor = new Map<number, THREE.Mesh[]>();
    const keep = (mesh: THREE.Mesh, tint: number): void => {
      const list = byColor.get(tint);
      if (list) list.push(mesh);
      else byColor.set(tint, [mesh]);
    };

    const span = (count - 1) * spread;
    for (let i = 0; i < count; i++) {
      const x = -span / 2 + i * spread;
      const made = makeWindow(width, height, paneCount, frame, color, reveal);
      made.frame.position.x = x;
      made.glass.position.x = x;
      made.glass.userData.atlasLit = Math.max(0, Math.min(1, strength));
      keep(made.frame, frame);
      group.add(made.glass);
      if (shutters !== undefined) {
        // Two leaves folded back against the wall, `width` apart so they
        // clear the opening. One `panes` call is the pair, and it sits
        // shallower than the frame so the frame keeps the deepest ink line.
        const pair = panes(2, width * 0.42, height, width + 0.04, shutters, PROUD);
        pair.geometry.translate(0, 0, PROUD / 2);
        pair.position.x = x;
        keep(pair, shutters);
      }
    }
    for (const list of byColor.values()) {
      const merged = mergeMeshes(list);
      merged.userData.atlasWindow = true;
      group.add(merged);
    }
    return group;
  };

  return { meshOf, panes, makeWindow, windows, glass };
}
