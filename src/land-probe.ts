import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, groundRadius } from './globe.ts';
import type { LandFlagData } from './land-flags.ts';

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
 * The mesh has no index to ask, and 1.31 million triangles (2026-09-24) are
 * too many to test. So this keeps a **local** one: the triangles within `REACH` of a centre,
 * bucketed in that centre's tangent plane at `BUCKET` units. Choosing them is
 * one pass over the whole buffer, which is done a slice of `SLICE` triangles a
 * call so no frame pays for all of it, and is started again when the centre has
 * moved `MOVE` — well inside `REACH`, so the old index still covers everything
 * asked of it while the new one is gathered.
 *
 * Only the surface is kept: a coastal wall is vertical, and a ray from the
 * planet's centre meets it edge on. Which triangles are surface is read off the
 * spans `buildLand` leaves on the mesh rather than off each face's lean, because
 * a steep hillside leans too and a face dropped for it is a hole a foot falls
 * through.
 *
 * **It is also the ground a foot stands on** (`drawnRadius`): the player, the
 * camera's floor and a vehicle set down by the fleet all ask it, through the
 * one probe a mesh has (`landProbeOf`), and fall back on the relief only where
 * the index does not reach. Over the land the relief and the mesh differ by a
 * mean half a unit and up to seven near a town (2026-09-25, 3,000 points), and
 * the lakes' shores by a whole shelf where the outline and the cut disagree.
 */
export interface LandProbe {
  /**
   * Readies the index round `centre` (any point; its direction is what
   * counts). A slice of the work a call; true when the index answers there.
   */
  prepare(centre: THREE.Vector3): boolean;
  /**
   * The distance from the planet's centre to the drawn land along `direction`
   * (a unit vector) — the highest face, where two are drawn — or `null` over
   * water or outside the index. `normal`, when
   * given, is filled with the face's own.
   */
  radiusAt(direction: THREE.Vector3, normal?: THREE.Vector3): number | null;
  /**
   * Whether the index knows the answer along `direction`: whether a `null`
   * from `radiusAt` there means water rather than "not gathered".
   */
  covers(direction: THREE.Vector3): boolean;
  /**
   * `prepare` all at once, however long it takes: about 5 to 15 ms. For a
   * jump across the planet, where the next frame is a new place anyway, and
   * for a headless check.
   */
  prime(centre: THREE.Vector3): void;
}

const probes = new WeakMap<THREE.Mesh, LandProbe>();

/**
 * The one probe of a mesh. The sward, the fleet and the foot all read the
 * same land round the same player, and a probe each was a gather each: three
 * passes over the whole buffer every 400 units walked instead of one.
 */
export function landProbeOf(land: THREE.Mesh): LandProbe {
  let probe = probes.get(land);
  if (probe === undefined) {
    probe = createLandProbe(land);
    probes.set(land, probe);
  }
  return probe;
}

const asked = new THREE.Vector3();

/**
 * **The ground under a foot**: the drawn land's radius under `point` — the
 * sea's own radius where the index reaches and no land is drawn — or the
 * relief's, `groundRadius`, where it does not reach or there is no probe.
 *
 * Only the direction of `point` is read. The relief stays the one definition of
 * the terrain; this is what the mesh made of it, which is what a body can see
 * and so what it has to stand on — a foot on the relief was up to seven units
 * inside a hill or over a dip, and on a lake's shore where the cut and the
 * outline part it walked into water over drawn land.
 */
export function drawnRadius(world: World, probe: LandProbe | null, point: THREE.Vector3): number {
  if (probe !== null) {
    asked.copy(point).normalize();
    if (probe.covers(asked)) return probe.radiusAt(asked) ?? PLANET_RADIUS;
  }
  return groundRadius(world, point);
}

export function createLandProbe(land: THREE.Mesh): LandProbe {
  // The sward's last band at its widest is 768 units from the camera and a
  // coarse tile's half-diagonal more, so the index must answer 1,200 round the
  // player however far it has moved since it was gathered.
  const REACH = 1600;
  const MOVE = 400;
  const BUCKET = 48;
  const SLICE = 300_000;
  /**
   * Milliseconds between two slices. The probe is shared, and the sward and
   * the foot both prepare it every frame: without this a frame paid a slice a
   * caller, about 1.7 ms each (2026-09-25, Node).
   */
  const SLICE_GAP = 4;
  let sliced = -Infinity;
  const SIDE = Math.ceil((2 * REACH) / BUCKET);
  /** How far a vertex may stand from the centre and its face still reach `REACH`. */
  const GATHER = REACH + 300;
  /**
   * A face's box is grown by this in the index. The box is taken off the
   * corners projected onto the tangent plane, and the face between them is a
   * chord the projection bends: by hundredths of a unit at the index's edge,
   * which is a point on a shared edge answered by neither face.
   */
  const PAD = 0.5;
  /** Slack on the barycentric test, for the same seam: a ray down an edge hits both faces rather than neither. */
  const SEAM = 1e-7;
  const position = land.geometry.getAttribute('position').array as Float32Array;
  const faces = position.length / 9;
  /**
   * The surface's triangles as `[from, to)` pairs: every ring's own surface,
   * without the wall under its boundary. A mesh without the spans (a test's)
   * is all surface, and the lean test below keeps its walls out.
   */
  const ringSpans = (land.userData['landFlags'] as LandFlagData | undefined)?.spans;
  const ranges: number[] = ringSpans === undefined ? [0, faces] : ringSpans.flatMap((span) => [span.surface[0], span.surface[1]]);
  const COS_REACH = Math.cos(REACH / PLANET_RADIUS);

  interface Index {
    centre: THREE.Vector3;
    east: THREE.Vector3;
    north: THREE.Vector3;
    /** Where bucket `b`'s faces start in `faces`; `SIDE * SIDE + 1` long. */
    start: Uint32Array;
    faces: Uint32Array;
  }
  let ready: Index | null = null;
  let gathering: { centre: THREE.Vector3; range: number; next: number; found: number[] } | null = null;

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
        x0 = Math.min(x0, x - PAD);
        x1 = Math.max(x1, x + PAD);
        z0 = Math.min(z0, z - PAD);
        z1 = Math.max(z1, z + PAD);
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

  const probe: LandProbe = {
    prime(centre) {
      // Until the index is gathered round `centre` itself: `prepare` is
      // content with an old one still in reach, and a jump wants all of
      // `REACH` round where it lands.
      unit.copy(centre).normalize();
      const at = unit.clone();
      while (gathering !== null || ready === null || ready.centre.distanceTo(at) * PLANET_RADIUS > MOVE) {
        sliced = -Infinity;
        probe.prepare(at);
      }
    },

    prepare(centre) {
      const direction = unit.copy(centre).normalize();
      if (gathering === null && (ready === null || ready.centre.distanceTo(direction) * PLANET_RADIUS > MOVE)) {
        gathering = { centre: direction.clone(), range: 0, next: ranges[0] ?? 0, found: [] };
      }
      const now = performance.now();
      if (gathering !== null && now - sliced >= SLICE_GAP) {
        sliced = now;
        const at = gathering.centre;
        const found = gathering.found;
        const cx = at.x * PLANET_RADIUS;
        const cy = at.y * PLANET_RADIUS;
        const cz = at.z * PLANET_RADIUS;
        const limit = GATHER * GATHER;
        let budget = SLICE;
        while (budget > 0 && gathering.range < ranges.length) {
          const to = ranges[gathering.range + 1]!;
          const end = Math.min(to, gathering.next + budget);
          budget -= end - gathering.next;
          for (let face = gathering.next; face < end; face++) {
            const o = face * 9;
            const dx = position[o]! - cx;
            const dy = position[o + 1]! - cy;
            const dz = position[o + 2]! - cz;
            if (dx * dx + dy * dy + dz * dz > limit) continue;
            if (ringSpans === undefined) {
              // No spans to say which faces are walls: a wall's normal is square to the radius.
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
            }
            found.push(face);
          }
          gathering.next = end;
          if (end === to) {
            gathering.range += 2;
            gathering.next = ranges[gathering.range] ?? 0;
          }
        }
        if (gathering.range >= ranges.length) {
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
      // The highest face the ray meets, not the first. An enclave is drawn
      // twice — its own ring, and the outer ring of the country round it, the
      // bake keeping outer rings only — by two triangulations of one relief,
      // so over Lesotho the two surfaces are a unit or two apart and the
      // higher is the one seen.
      let best = 0;
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
        if (u < -SEAM || u > 1 + SEAM) continue;
        const qx = -ay * e1z + az * e1y;
        const qy = -az * e1x + ax * e1z;
        const qz = -ax * e1y + ay * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inverse;
        if (v < -SEAM || u + v > 1 + SEAM) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inverse;
        if (t <= best) continue;
        best = t;
        if (normal !== undefined) {
          normal.set(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x).normalize();
          if (normal.dot(direction) < 0) normal.negate();
        }
      }
      return best > 0 ? best : null;
    },

    covers(direction) {
      return ready !== null && direction.dot(ready.centre) >= COS_REACH;
    },
  };
  return probe;
}
