import * as THREE from 'three';
import type { MonumentContext } from '../../monuments/contract.ts';
import type { SceneryContext } from './context-type.ts';
import { mergeMeshes, quad } from './meshes.ts';
import type { MeshKit } from './meshes.ts';
import { DOOR_HEAD, DOOR_JAMB, DOOR_REVEAL, DOOR_STEP } from './style.ts';
import { PROUD } from './tones.ts';

type Forms = Pick<SceneryContext, 'door' | 'roof' | 'dome' | 'lit' | 'rim' | 'blob'>;

/** The doors, roofs, domes and other solid forms a part builds with, over one mesh kit. */
export function createForms(base: MonumentContext, kit: MeshKit): Forms {
  const { meshOf, panes } = kit;
  const door: SceneryContext['door'] = (spec) => {
    const { width, height, leaf, frame, sill = 0, step = frame, panels = true } = spec;
    const group = new THREE.Group();
    group.name = 'door';
    group.userData.atlasDoorHeight = height;
    const inner = width / 2;
    const outer = inner + DOOR_JAMB;
    const lintel = sill + height;
    const top = lintel + DOOR_HEAD;
    const z0 = 0;
    const z1 = DOOR_REVEAL;

    // The architrave: three faces in front, three outside, three inside —
    // the inside ones are the reveal, and the reason the leaf reads as set in.
    const points: number[] = [];
    const front = (x0: number, x1: number, y0: number, y1: number): void =>
      quad(points, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    const facingLeft = (x: number, y0: number, y1: number): void =>
      quad(points, [x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]);
    const facingRight = (x: number, y0: number, y1: number): void =>
      quad(points, [x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1]);
    front(-outer, -inner, sill, lintel);
    front(inner, outer, sill, lintel);
    front(-outer, outer, lintel, top);
    facingLeft(-outer, sill, top);
    facingRight(outer, sill, top);
    quad(points, [-outer, top, z1], [outer, top, z1], [outer, top, z0], [-outer, top, z0]);
    facingRight(-inner, sill, lintel);
    facingLeft(inner, sill, lintel);
    quad(points, [-inner, lintel, z0], [inner, lintel, z0], [inner, lintel, z1], [-inner, lintel, z1]);
    const architrave = new THREE.BufferGeometry();
    architrave.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const surround = meshOf(architrave, frame);
    surround.userData.atlasDoor = true;
    group.add(surround);

    // The leaf, a `PROUD` off the wall and a quad: the frame inks it.
    const board = panes(1, width, height, 0, leaf);
    board.position.set(0, sill, PROUD);
    board.userData.atlasDoor = true;
    group.add(board);

    if (panels) {
      // Four panels in the leaf's own shade, a `PROUD` in front of it and
      // still well behind the frame: the cheapest thing that says "door".
      const margin = Math.min(0.2, width * 0.14);
      const stile = Math.min(0.16, width * 0.11);
      const panelWidth = (width - margin * 2 - stile) / 2;
      const shade = base.tone(leaf, 0.8);
      const low = panes(2, panelWidth, height * 0.3, stile, shade);
      low.position.set(0, sill + height * 0.12, PROUD * 2);
      const high = panes(2, panelWidth, height * 0.36, stile, shade);
      high.position.set(0, sill + height * 0.54, PROUD * 2);
      const set = mergeMeshes([low, high]);
      set.userData.atlasDoor = true;
      group.add(set);
    }

    if (sill > 0) {
      const tread = base.box(outer * 2, sill, DOOR_STEP, step);
      tread.position.z = DOOR_STEP / 2;
      group.add(tread);
    }
    return group;
  };

  const roof: SceneryContext['roof'] = (width, depth, height, ridge, color) => {
    const hw = width / 2;
    const hd = depth / 2;
    const hr = Math.max(0, Math.min(width, ridge)) / 2;
    // Base corners, then the two ends of the ridge.
    const a: [number, number, number] = [-hw, 0, -hd];
    const b: [number, number, number] = [hw, 0, -hd];
    const c: [number, number, number] = [hw, 0, hd];
    const d: [number, number, number] = [-hw, 0, hd];
    const p: [number, number, number] = [-hr, height, 0];
    const q: [number, number, number] = [hr, height, 0];

    const points: [number, number, number][] = [];
    const face = (...corners: [number, number, number][]) => points.push(...corners);
    // Winding checked by hand against the outward normal of each face: a
    // reversed triangle is invisible from outside and its inverted hull
    // swallows the mesh, which looks like a bug in the outline rather than in
    // the geometry.
    face(a, p, q);
    face(a, q, b); // -Z slope
    face(d, c, q);
    face(d, q, p); // +Z slope
    face(b, q, c); // +X end
    face(a, d, p); // -X end
    face(a, b, c);
    face(a, c, d); // underside
    const kept =
      hr > 1e-4
        ? points
        : // A pyramid's two ridge points coincide, so half of each slope is a
          // zero-area triangle — and `computeVertexNormals` turns those into
          // NaN normals, which black-holes the whole mesh.
          points.filter((_, index) => {
            const triangle = Math.floor(index / 3);
            return triangle !== 1 && triangle !== 3;
          });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept.flat(), 3));
    return meshOf(geometry, color);
  };

  const dome: SceneryContext['dome'] = (radius, height, color, sides = 12, rings = 3) => {
    // Bottom centre, rim, then up the quarter-ellipse to the crown. Starting
    // at the centre is what closes the underside; `ringWall` does the same.
    const profile = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= rings; i++) {
      const angle = (i / rings) * (Math.PI / 2);
      profile.push(new THREE.Vector2(radius * Math.cos(angle), height * Math.sin(angle)));
    }
    return meshOf(new THREE.LatheGeometry(profile, sides), color);
  };

  const lit: SceneryContext['lit'] = (mesh, strength = 1) => {
    // A number in `userData` and not a second material: the town is merged, so
    // what reaches the screen is a vertex attribute, and a `lit` variant of
    // every glass colour would be a shader program and an outline material
    // bought for nothing.
    mesh.userData.atlasLit = Math.max(0, Math.min(1, strength));
    return mesh;
  };

  const rim: SceneryContext['rim'] = (width, depth, thickness, height, color) => {
    const outer = width / 2;
    const inner = Math.max(0.02, outer - thickness);
    const k = Math.SQRT2;
    const mesh = base.ringWall(inner * k, outer * k, height, color, 4);
    mesh.geometry.rotateY(Math.PI / 4);
    mesh.scale.z = depth / width;
    return mesh;
  };

  const blob: SceneryContext['blob'] = (radius, height, color, detail = 0) => {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    geometry.computeBoundingBox();
    // Read the numbers out before scaling. `BufferGeometry.scale` recomputes
    // the bounding box *in place*, so holding a reference to it and using it
    // afterwards applies the scale twice — which is a canopy three times the
    // size it asked for, and it is invisible until something measures it.
    const { min, max } = geometry.boundingBox!;
    const sx = (radius * 2) / (max.x - min.x);
    const sy = height / (max.y - min.y);
    const sz = (radius * 2) / (max.z - min.z);
    const cx = (min.x + max.x) * 0.5;
    const cz = (min.z + max.z) * 0.5;
    const low = min.y;
    geometry.scale(sx, sy, sz);
    geometry.translate(-cx * sx, -low * sy, -cz * sz);
    return meshOf(geometry, color);
  };

  return { door, roof, dome, lit, rim, blob };
}
