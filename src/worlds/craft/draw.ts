/** Drawing a craft: its draft merged to one inked mesh, glass and turning parts kept apart. */

import * as THREE from 'three';
import { mergeMeshes } from '../../merge.ts';
import { geometryOf, glassMaterial } from '../../craft/build.ts';
import type { Turning } from '../../craft/build.ts';
import { isGlassMaterial } from '../../craft/cabin.ts';
import type { Cockpit } from '../cockpit.ts';

/** A draft of the context's primitives as one vertex-coloured, inked mesh: how every craft is drawn. */
export function merged(draft: THREE.Group, gradientMap: THREE.Texture): THREE.Mesh {
  const arrays = mergeMeshes(draft);
  draft.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true) mesh.geometry.dispose();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(arrays.color, 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(arrays.outline, 3));
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, craftMaterial(gradientMap));
}

/** The vertex-coloured toon material a craft is drawn in, inked along its welded normals. */
export function craftMaterial(gradientMap: THREE.Texture): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  material.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01], outlineNormal: true };
  return material;
}

/**
 * A turning part of a cabin (`cabin.ts`: the wheel, the needle) as Earth's
 * `assemble` stands one: a pivot of its name at its axle, stood at its tilt,
 * its mesh in the craft's material. The craft turns it about its own +Z.
 */
export function pivotOf(part: Turning, gradientMap: THREE.Texture): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = part.name;
  pivot.position.copy(part.at);
  pivot.rotation.x = part.tilt ?? 0;
  const mesh = new THREE.Mesh(geometryOf([part.soup]), craftMaterial(gradientMap));
  mesh.name = `${part.name}-mesh`;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

/**
 * A code-built craft's draft drawn: its glass (any mesh in `glassMaterial`,
 * which writes no depth and must not be merged into an opaque fill) and its
 * turning pivots kept as they are, everything else merged into one inked
 * mesh (`merged`). Returns the drawn group, its wheels and its needles.
 */
export function drawDraft(draft: THREE.Group, gradientMap: THREE.Texture): { group: THREE.Group; steers: THREE.Object3D[]; needles: THREE.Object3D[] } {
  const kept: THREE.Object3D[] = [];
  draft.traverse((one) => {
    const mesh = one as THREE.Mesh;
    if (one.name === 'steer' || one.name === 'needle') kept.push(one);
    else if (mesh.isMesh === true && !Array.isArray(mesh.material) && isGlassMaterial(mesh.material)) kept.push(one);
  });
  draft.updateMatrixWorld(true);
  for (const one of kept) {
    // Carried to the draft's own frame before it leaves it.
    one.matrixWorld.decompose(one.position, one.quaternion, one.scale);
    one.removeFromParent();
  }
  const group = new THREE.Group();
  const body = merged(draft, gradientMap);
  body.castShadow = true;
  group.add(body, ...kept);
  return { group, steers: kept.filter((one) => one.name === 'steer'), needles: kept.filter((one) => one.name === 'needle') };
}

/**
 * A furnished kit craft's shell: the painted model without the triangles its
 * cockpit drops (its windows, a canopy's cut), and with what a cut keeps of
 * the faces the canopy's rim crosses, each corner weighed from its face's
 * own so the paint, the creased normals and the ink's normals carry over. In
 * the pack's units, as the model is.
 */
export function shellOf(painted: THREE.BufferGeometry, cockpit: Cockpit): THREE.BufferGeometry {
  const index = painted.index!;
  if (cockpit.pieces.length === 0) {
    const corners: number[] = [];
    for (let t = 0; t < index.count / 3; t++) if (cockpit.drop[t] === 0) corners.push(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2));
    const kept = painted.clone();
    kept.setIndex(corners);
    return kept;
  }
  // Pieces have corners of their own: the whole shell unindexed.
  const names = ['position', 'normal', 'outlineNormal', 'color'] as const;
  const sources = names.map((name) => painted.getAttribute(name));
  let triangles = cockpit.pieces.length;
  for (let t = 0; t < index.count / 3; t++) if (cockpit.drop[t] === 0) triangles++;
  const arrays = names.map(() => new Float32Array(triangles * 9));
  let at = 0;
  for (let t = 0; t < index.count / 3; t++) {
    if (cockpit.drop[t] !== 0) continue;
    for (let c = 0; c < 3; c++) {
      const v = index.getX(t * 3 + c);
      sources.forEach((source, a) => arrays[a]!.set([source.getX(v), source.getY(v), source.getZ(v)], at));
      at += 3;
    }
  }
  for (const { t, weights } of cockpit.pieces) {
    const v = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)];
    for (let c = 0; c < 3; c++) {
      sources.forEach((source, a) => {
        let x = 0;
        let y = 0;
        let z = 0;
        for (let j = 0; j < 3; j++) {
          const w = weights[c * 3 + j]!;
          x += w * source.getX(v[j]!);
          y += w * source.getY(v[j]!);
          z += w * source.getZ(v[j]!);
        }
        // The normals weighed back to unit length; positions and colours as they come.
        const unit = a === 1 || a === 2 ? 1 / Math.hypot(x, y, z) : 1;
        arrays[a]!.set([x * unit, y * unit, z * unit], at);
      });
      at += 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  names.forEach((name, a) => geometry.setAttribute(name, new THREE.BufferAttribute(arrays[a]!, 3)));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A see-through pane in Earth's glass (`glassMaterial`): blended, both sides, writing no depth, no ink, no shadow. */
export function glassOf(geometry: THREE.BufferGeometry): THREE.Mesh {
  const pane = new THREE.Mesh(geometry, glassMaterial());
  pane.name = 'glass';
  pane.castShadow = false;
  pane.receiveShadow = true;
  return pane;
}
