/**
 * A prop folded out of the buffer it was merged into, and a copy of it that
 * can move. Folding puts every vertex of the run onto its first, so its
 * triangles and their ink hulls draw nothing (the towns fold a taken car the
 * same way); the copy is the run's own attributes, cut out and shifted so the
 * foot is at its origin, under the host's own material, so it is drawn and
 * inked exactly as it stood.
 */
import * as THREE from 'three';
import type { Prop, PropRange } from './types.ts';

/** One folded run and what puts it back. */
export interface Folded {
  range: PropRange;
  /** The positions as they stood, `count * 3` floats. */
  kept: Float32Array;
}

const colour = new THREE.Color();

/** The mean colour of a prop's last range (a tree's leaves, a bench's slats), linear, off a few of its vertices. */
export function colourOf(prop: Prop): number {
  const last = prop.ranges[prop.ranges.length - 1];
  if (last === undefined || last.count === 0) return 0x808080;
  const paint = last.mesh.geometry.getAttribute('color');
  if (paint === undefined) return 0x808080;
  let r = 0;
  let g = 0;
  let b = 0;
  const samples = Math.min(8, last.count);
  for (let i = 0; i < samples; i++) {
    const v = last.start + Math.floor((i * last.count) / samples);
    r += paint.getX(v);
    g += paint.getY(v);
    b += paint.getZ(v);
  }
  return colour.setRGB(r / samples, g / samples, b / samples).getHex();
}

/** Folds one run onto its first vertex and keeps what stood there. */
export function foldRange(range: PropRange): Folded {
  const position = range.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = position.array as Float32Array;
  const first = range.start * 3;
  const kept = array.slice(first, first + range.count * 3);
  for (let v = range.start + 1; v < range.start + range.count; v++) {
    array[v * 3] = array[first]!;
    array[v * 3 + 1] = array[first + 1]!;
    array[v * 3 + 2] = array[first + 2]!;
  }
  position.addUpdateRange(first, range.count * 3);
  position.needsUpdate = true;
  return { range, kept };
}

/** Puts a folded run back as it stood. The host may have gone meanwhile, in which case there is nothing to put back. */
export function unfoldRange(folded: Folded): void {
  const { range, kept } = folded;
  const position = range.mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (position === undefined || position.count < range.start + range.count) return;
  (position.array as Float32Array).set(kept, range.start * 3);
  position.addUpdateRange(range.start * 3, kept.length);
  position.needsUpdate = true;
}

/**
 * A mesh of the run as it stood, every attribute of the host's cut to the
 * run, its positions about the prop's foot. Drawn with the host's material it
 * takes the same ramp, ink normals and weather as the host.
 */
export function copyOf(folded: Folded, foot: THREE.Vector3): THREE.Mesh {
  const { range, kept } = folded;
  const source = range.mesh.geometry;
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const a = attribute as THREE.BufferAttribute;
    const size = a.itemSize;
    const slice = (a.array as Float32Array).slice(range.start * size, (range.start + range.count) * size);
    geometry.setAttribute(name, new THREE.BufferAttribute(slice, size, a.normalized));
  }
  const position = new Float32Array(kept.length);
  for (let i = 0; i < kept.length; i += 3) {
    position[i] = kept[i]! - foot.x;
    position[i + 1] = kept[i + 1]! - foot.y;
    position[i + 2] = kept[i + 2]! - foot.z;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, range.material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  if (range.depth !== undefined) mesh.customDepthMaterial = range.depth;
  return mesh;
}
