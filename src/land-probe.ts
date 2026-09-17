import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';

/**
 * The drawn land, as something to stand a blade of grass on.
 *
 * **`elevationAt` is the relief and the mesh is not quite the relief.** The
 * land is triangles laid between points of `reliefAt`, refined until a midpoint
 * misses by `RELIEF_SAG`, so between its corners a triangle is a plane the
 * relief bulges above and sags below. Measured 2026-09-17 over 400 points
 * round each of four towns, the mesh sits a mean 0.4 to 0.8 units off the
 * relief, and at Madison a tenth of the ground is more than 1.5 units *under*
 * it, the worst 3.8. A tree 20 units tall does not care. A clump of grass one
 * and a half units tall stood on the relief is a clump floating in the air, in
 * patches as wide as a triangle — so the sward stands on what is drawn.
 *
 * The mesh has no index to ask, and 2.18 million triangles are too many to
 * test. So this keeps a **local** one: the triangles within `REACH` of a centre,
 * bucketed in that centre's tangent plane at `BUCKET` units. Choosing them is
 * one pass over the whole buffer, which is done a slice of `SLICE` triangles a
 * call so no frame pays for all of it, and is started again when the centre has
 * moved `MOVE` — well inside `REACH`, so the old index still covers everything
 * asked of it while the new one is gathered.
 *
 * Only the surface is kept: a coastal wall is vertical, and a ray from the
 * planet's centre meets it edge on.
 */
export interface LandProbe {
  /**
   * Readies the index round `centre` (any point; its direction is what
   * counts). A slice of the work a call; true when the index answers there.
   */
  prepare(centre: THREE.Vector3): boolean;
  /**
   * The distance from the planet's centre to the drawn land along `direction`
   * (a unit vector), or `null` over water or outside the index. `normal`, when
   * given, is filled with the face's own.
   */
  radiusAt(direction: THREE.Vector3, normal?: THREE.Vector3): number | null;
}

export function createLandProbe(land: THREE.Mesh): LandProbe {
  // The sward's last band at its widest is 768 units from the camera and a
  // coarse tile's half-diagonal more, so the index must answer 1,200 round the
  // player however far it has moved since it was gathered.
  const REACH = 1600;
  const MOVE = 400;
  const BUCKET = 48;
  const SLICE = 300_000;
  const SIDE = Math.ceil((2 * REACH) / BUCKET);
  /** How far a vertex may stand from the centre and its face still reach `REACH`. */
  const GATHER = REACH + 300;
  const position = land.geometry.getAttribute('position').array as Float32Array;
  const faces = position.length / 9;

  interface Index {
    centre: THREE.Vector3;
    east: THREE.Vector3;
    north: THREE.Vector3;
    /** Where bucket `b`'s faces start in `faces`; `SIDE * SIDE + 1` long. */
    start: Uint32Array;
    faces: Uint32Array;
  }
  let ready: Index | null = null;
  let gathering: { centre: THREE.Vector3; next: number; found: number[] } | null = null;

  const unit = new THREE.Vector3();

  function build(centre: THREE.Vector3, found: number[]): Index {
    const east = new THREE.Vector3();
    const north = new THREE.Vector3(0, 1, 0).projectOnPlane(centre);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(centre);
    north.normalize();
    east.crossVectors(centre, north).normalize();
    const count = new Uint32Array(SIDE * SIDE + 1);
    const spans: number[] = [];
    const kept: number[] = [];
    for (const face of found) {
      const o = face * 9;
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (let k = 0; k < 9; k += 3) {
        unit.set(position[o + k]!, position[o + k + 1]!, position[o + k + 2]!);
        const scale = PLANET_RADIUS / unit.length();
        const x = unit.dot(east) * scale;
        const z = unit.dot(north) * scale;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      const i0 = Math.max(0, Math.floor((x0 + REACH) / BUCKET));
      const i1 = Math.min(SIDE - 1, Math.floor((x1 + REACH) / BUCKET));
      const j0 = Math.max(0, Math.floor((z0 + REACH) / BUCKET));
      const j1 = Math.min(SIDE - 1, Math.floor((z1 + REACH) / BUCKET));
      if (i0 > i1 || j0 > j1) continue;
      kept.push(face);
      spans.push(i0, i1, j0, j1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) count[j * SIDE + i + 1]!++;
    }
    for (let b = 1; b < count.length; b++) count[b]! += count[b - 1]!;
    const into = new Uint32Array(count[count.length - 1]!);
    const cursor = count.slice(0, SIDE * SIDE);
    kept.forEach((face, n) => {
      const i0 = spans[n * 4]!;
      const i1 = spans[n * 4 + 1]!;
      const j0 = spans[n * 4 + 2]!;
      const j1 = spans[n * 4 + 3]!;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) into[cursor[j * SIDE + i]!++] = face;
    });
    return { centre: centre.clone(), east, north, start: count, faces: into };
  }

  return {
    prepare(centre) {
      const direction = unit.copy(centre).normalize();
      if (gathering === null && (ready === null || ready.centre.distanceTo(direction) * PLANET_RADIUS > MOVE)) {
        gathering = { centre: direction.clone(), next: 0, found: [] };
      }
      if (gathering !== null) {
        const at = gathering.centre;
        const found = gathering.found;
        const cx = at.x * PLANET_RADIUS;
        const cy = at.y * PLANET_RADIUS;
        const cz = at.z * PLANET_RADIUS;
        const limit = GATHER * GATHER;
        const end = Math.min(faces, gathering.next + SLICE);
        for (let face = gathering.next; face < end; face++) {
          const o = face * 9;
          const dx = position[o]! - cx;
          const dy = position[o + 1]! - cy;
          const dz = position[o + 2]! - cz;
          if (dx * dx + dy * dy + dz * dz > limit) continue;
          // The surface only: a wall's normal is square to the radius.
          const ax = position[o + 3]! - position[o]!;
          const ay = position[o + 4]! - position[o + 1]!;
          const az = position[o + 5]! - position[o + 2]!;
          const bx = position[o + 6]! - position[o]!;
          const by = position[o + 7]! - position[o + 1]!;
          const bz = position[o + 8]! - position[o + 2]!;
          const nx = ay * bz - az * by;
          const ny = az * bx - ax * bz;
          const nz = ax * by - ay * bx;
          const radial = (nx * at.x + ny * at.y + nz * at.z) / (Math.hypot(nx, ny, nz) || 1);
          if (Math.abs(radial) < 0.3) continue;
          found.push(face);
        }
        gathering.next = end;
        if (end === faces) {
          ready = build(at, found);
          gathering = null;
        }
      }
      unit.copy(centre).normalize();
      return ready !== null && ready.centre.distanceTo(unit) * PLANET_RADIUS < REACH - MOVE;
    },

    radiusAt(direction, normal) {
      if (ready === null) return null;
      if (direction.dot(ready.centre) < 0) return null;
      const i = Math.floor((direction.dot(ready.east) * PLANET_RADIUS + REACH) / BUCKET);
      const j = Math.floor((direction.dot(ready.north) * PLANET_RADIUS + REACH) / BUCKET);
      if (i < 0 || j < 0 || i >= SIDE || j >= SIDE) return null;
      const b = j * SIDE + i;
      const dx = direction.x;
      const dy = direction.y;
      const dz = direction.z;
      for (let n = ready.start[b]!; n < ready.start[b + 1]!; n++) {
        // Moller-Trumbore, on the ray from the planet's centre.
        const o = ready.faces[n]! * 9;
        const ax = position[o]!;
        const ay = position[o + 1]!;
        const az = position[o + 2]!;
        const e1x = position[o + 3]! - ax;
        const e1y = position[o + 4]! - ay;
        const e1z = position[o + 5]! - az;
        const e2x = position[o + 6]! - ax;
        const e2y = position[o + 7]! - ay;
        const e2z = position[o + 8]! - az;
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-9) continue;
        const inverse = 1 / det;
        const u = (-ax * px - ay * py - az * pz) * inverse;
        if (u < 0 || u > 1) continue;
        const qx = -ay * e1z + az * e1y;
        const qy = -az * e1x + ax * e1z;
        const qz = -ax * e1y + ay * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inverse;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inverse;
        if (t <= 0) continue;
        if (normal !== undefined) {
          normal.set(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x).normalize();
          if (normal.dot(direction) < 0) normal.negate();
        }
        return t;
      }
      return null;
    },
  };
}
