/**
 * The pieces cosmetics are built from, and how a built one becomes a buffer.
 *
 * A piece is a context mesh (`craftContext`: one toon material a palette
 * colour, faceted) or a lathe turned about +Y and stretched to an ellipse.
 * `piecesGeometry` merges a group of them into one buffer the way a craft is
 * merged (`soupOf`), with the colour on the vertices, the finish the cast's
 * material gives each (`atlasRole`) and the hull's own welded normals
 * (`weldedNormals`), so a hat is drawn with the body's own material and ink.
 */
import * as THREE from 'three';
import { weldedNormals } from '../cast/source.ts';
import { craftContext, signedVolume, soupOf } from '../craft/build.ts';

/** The finishes the cast's material knows (`FINISH_OF` in `cast/template.ts`). */
export const FINISH = { none: 0, skin: 1, hair: 2, cloth: 3, leather: 4, pack: 5 } as const;
export type Finish = (typeof FINISH)[keyof typeof FINISH];

/** Positions (triangles) turned out if they came in: a closed solid's faces point away from it. */
function outward(p: number[]): number[] {
  if (signedVolume(p) >= 0) return p;
  for (let i = 0; i < p.length; i += 9) {
    for (let c = 0; c < 3; c++) {
      const swap = p[i + 3 + c]!;
      p[i + 3 + c] = p[i + 6 + c]!;
      p[i + 6 + c] = swap;
    }
  }
  return p;
}

function faceted(p: number[], color: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(outward(p), 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, craftContext().toon(color));
}

/** A turned solid: `profile` is (radius, y) from the bottom up, closed when it starts and ends on the axis. */
export function turned(profile: readonly (readonly [number, number])[], color: number, sides: number): THREE.Mesh {
  const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const geometry = new THREE.LatheGeometry(points, sides);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  const p = Array.from(flat.getAttribute('position').array as Float32Array);
  flat.dispose();
  return faceted(p, color);
}

/**
 * A closed loop `section` (radius, y) swept about +Y from angle `from` to `to`
 * (0 is +Z, the front; positive turns towards +X) in `segments`, its two ends
 * capped: a visor, a peak, a curved strap.
 */
export function arc(section: readonly (readonly [number, number])[], color: number, from: number, to: number, segments: number): THREE.Mesh {
  const n = section.length;
  const at = (phi: number, j: number): [number, number, number] => {
    const [r, y] = section[j % n]!;
    return [r * Math.sin(phi), y, r * Math.cos(phi)];
  };
  const p: number[] = [];
  const tri = (a: number[], b: number[], c: number[]): void => {
    p.push(...a, ...b, ...c);
  };
  for (let i = 0; i < segments; i++) {
    const a = from + ((to - from) * i) / segments;
    const b = from + ((to - from) * (i + 1)) / segments;
    for (let j = 0; j < n; j++) {
      tri(at(a, j), at(b, j), at(b, j + 1));
      tri(at(a, j), at(b, j + 1), at(a, j + 1));
    }
  }
  // The ends, fanned from their first point: the sections used are convex.
  for (const [phi, flip] of [[from, true], [to, false]] as const) {
    for (let j = 1; j + 1 < n; j++) {
      if (flip) tri(at(phi, 0), at(phi, j + 1), at(phi, j));
      else tri(at(phi, 0), at(phi, j), at(phi, j + 1));
    }
  }
  return faceted(p, color);
}

/** A turned solid stretched to `rx` across, `ry` up and `rz` front to back, standing at (0, `y`, `cz`). */
export function ellipse(mesh: THREE.Mesh, rx: number, ry: number, rz: number, y: number, cz: number): THREE.Mesh {
  mesh.scale.set(rx, ry, rz);
  mesh.position.set(0, y, cz);
  return mesh;
}

/** A closed ring: from `inner` to `outer` (shares of the radii), `thick` deep, its outer edge dropped by `drop`. */
export function ringProfile(inner: number, outer: number, thick: number, drop = 0): [number, number][] {
  return [
    [inner, 0],
    [outer, -drop],
    [outer, -drop - thick],
    [inner, -thick],
    [inner, 0],
  ];
}

/** A closed half-ellipsoid of unit radius and height, `rows` bands from its rim to its top. */
export function domeProfile(rows: number, squash = 1): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  for (let i = 0; i <= rows; i++) {
    const a = (i / rows) * (Math.PI / 2);
    out.push([Math.cos(a), Math.sin(a) ** squash]);
  }
  out[out.length - 1]![0] = 0;
  return out;
}

/**
 * A flat piece cut to the outline `points` (x, y, counter-clockwise),
 * `depth` thick along Z and centred on z = 0: a flag, a board, a wing.
 */
export function slab(points: readonly (readonly [number, number])[], depth: number, color: number): THREE.Mesh {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -depth / 2);
  const flat = geometry.index === null ? geometry : geometry.toNonIndexed();
  const p = Array.from(flat.getAttribute('position').array as Float32Array);
  geometry.dispose();
  if (flat !== geometry) flat.dispose();
  return faceted(p, color);
}

/** A disc `rx` across and `ry` high, `depth` thick along Z from z = 0 forward: a case's bout, a lens, a cap's end. */
export function disc(rx: number, ry: number, depth: number, color: number, sides = 12): THREE.Object3D {
  const mesh = craftContext().column(1, depth, color, sides);
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.set(rx, 1, ry);
  const holder = new THREE.Group();
  holder.add(mesh);
  return holder;
}

/** A small ball: an octahedron's eight faces at `radius`, for a bobble, a gem, a flower. */
export function ball(radius: number, color: number): THREE.Mesh {
  const geometry = new THREE.OctahedronGeometry(radius, 0);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, craftContext().toon(color));
}

/** One buffer from groups of pieces, each group with its finish; the pieces' own geometries are freed. */
export function piecesGeometry(parts: readonly (readonly [THREE.Object3D, Finish])[]): THREE.BufferGeometry {
  const soups = parts.map(([group, finish]) => ({ soup: soupOf(group), finish }));
  let count = 0;
  for (const { soup } of soups) count += soup.position.length / 3;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const role = new Uint8Array(count);
  let cursor = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const { soup, finish } of soups) {
    for (let i = 0; i < soup.position.length; i += 9) {
      a.fromArray(soup.position, i);
      b.fromArray(soup.position, i + 3).sub(a);
      c.fromArray(soup.position, i + 6).sub(a);
      // A triangle with no area has no normal, and a NaN normal blacks out the mesh.
      if (b.cross(c).lengthSq() < 1e-14) continue;
      position.set(soup.position.subarray(i, i + 9), cursor * 3);
      normal.set(soup.normal.subarray(i, i + 9), cursor * 3);
      color.set(soup.color.subarray(i, i + 9), cursor * 3);
      role.fill(finish, cursor, cursor + 3);
      cursor += 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position.slice(0, cursor * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal.slice(0, cursor * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color.slice(0, cursor * 3), 3));
  geometry.setAttribute('atlasRole', new THREE.BufferAttribute(role.slice(0, cursor), 1));
  geometry.setAttribute('outlineNormal', weldedNormals(geometry));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  for (const [group] of parts) {
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }
  return geometry;
}
