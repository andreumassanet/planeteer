import type { BufferGeometry } from 'three';
import type { SceneryContext } from '../../scenery/contract.ts';

export type Three = SceneryContext['THREE'];

const TAU = Math.PI * 2;

/** A profile point: radius out from the axis, then height. */
export type Ring = readonly [number, number];

/**
 * A surface of revolution about Y, from a profile and a number of sides, with
 * a single vertex wherever the radius is 0 (a pole) and **smooth normals**.
 *
 * The winding follows the profile: a profile read **upward on the outside** —
 * or, for a closed shell, counter-clockwise in the radius-height plane — faces
 * outward. The angle starts at +Z, the way the figure faces, and runs toward
 * +X; `arc` short of a full turn leaves the surface open at both ends of it.
 */
export function lathe(T: Three, profile: readonly Ring[], sides: number, arc = TAU, start = 0): BufferGeometry {
  const full = arc >= TAU - 1e-6;
  const around = full ? sides : sides + 1;
  const positions: number[] = [];
  const index: number[] = [];
  const rows: { first: number; pole: boolean }[] = [];
  for (const [r, y] of profile) {
    const first = positions.length / 3;
    if (r <= 1e-9) {
      positions.push(0, y, 0);
      rows.push({ first, pole: true });
      continue;
    }
    for (let k = 0; k < around; k++) {
      const a = start + (k / sides) * arc;
      positions.push(Math.sin(a) * r, y, Math.cos(a) * r);
    }
    rows.push({ first, pole: false });
  }
  const at = (row: { first: number; pole: boolean }, k: number): number => (row.pole ? row.first : row.first + (full ? k % sides : k));
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (a.pole && b.pole) continue;
    for (let k = 0; k < sides; k++) {
      const a0 = at(a, k);
      const a1 = at(a, k + 1);
      const b0 = at(b, k);
      const b1 = at(b, k + 1);
      if (a.pole) index.push(a0, b1, b0);
      else if (b.pole) index.push(a0, a1, b0);
      else index.push(a0, a1, b1, a0, b1, b0);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Scales a section and works its normals out again for the new shape. */
export function scaled(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  geometry.scale(x, y, z);
  geometry.computeVertexNormals();
  return geometry;
}

/** An ellipsoid centred on its origin: `rings` rows between the poles. */
export function blob(T: Three, rx: number, ry: number, rz: number, sides: number, rings: number): BufferGeometry {
  const profile: Ring[] = [[0, -1]];
  for (let k = 1; k <= rings; k++) {
    const p = (k / (rings + 1)) * Math.PI;
    profile.push([Math.sin(p), -Math.cos(p)]);
  }
  profile.push([0, 1]);
  return scaled(lathe(T, profile, sides), rx, ry, rz);
}

/**
 * A limb section hanging from its joint at `y = 0` down to `-length`, `r0`
 * wide at the joint and `r1` at the far end, **with a ball over the joint**:
 * the cap above `y = 0` is what fills the elbow when the forearm folds, so a
 * bent limb has no notch in it. Four bands of `sides`: 4 x sides triangles.
 */
export function limb(T: Three, r0: number, r1: number, length: number, sides: number): BufferGeometry {
  return lathe(T, [[0, -length - r1 * 0.7], [r1, -length + r1 * 0.15], [r0, -r0 * 0.15], [0, r0 * 0.75]], sides);
}

/** Several sections as one geometry, which is one mesh against the mesh budget. */
export function joined(T: Three, parts: readonly BufferGeometry[]): BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  for (const part of parts) {
    const base = positions.length / 3;
    const p = part.getAttribute('position');
    for (let i = 0; i < p.count; i++) positions.push(p.getX(i), p.getY(i), p.getZ(i));
    const own = part.index!;
    for (let i = 0; i < own.count; i++) index.push(base + own.getX(i));
    part.dispose();
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
