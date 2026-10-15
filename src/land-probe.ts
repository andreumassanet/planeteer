import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, groundRadius } from './globe.ts';
import type { LandFlagData } from './land-flags.ts';
import { BUCKET, buildFaceIndex, highestHit } from './land-probe/faces.ts';
import type { FaceIndex } from './land-probe/faces.ts';

/**
 * The drawn land, as something to stand a blade of grass on.
 *
 * `elevationAt` is the relief and the mesh is not quite the relief. The land
 * is triangles laid between points of `reliefAt`, refined until a midpoint
 * misses by `RELIEF_SAG`, so between its corners a triangle is a plane the
 * relief bulges above and sags below: the mesh sits a mean 0.4 to 0.8 units
 * off the relief and in places more than 1.5 units under it. A tree does not
 * care, but a blade of grass stood on the relief floats in the air in patches
 * as wide as a triangle, so the grass stands on what is drawn.
 *
 * The mesh has no index to ask and over a million triangles are too many to
 * test. So this keeps a local one: the triangles within `REACH` of a centre,
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
 * It is also the ground a foot stands on (`drawnRadius`): the player, the
 * camera's floor and a vehicle set down by the fleet all ask it, through the
 * one probe a mesh has (`landProbeOf`), and fall back on the relief only where
 * the index does not reach. Over the land the relief and the mesh differ by a
 * mean half a unit and up to seven near a town, and at the lakes' shores by a
 * whole shelf where the outline and the cut disagree.
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
   * given, is filled with the face's own; `shading`, with the normal the land
   * is drawn with there (its corners' laid between).
   */
  radiusAt(direction: THREE.Vector3, normal?: THREE.Vector3, shading?: THREE.Vector3): number | null;
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
 * The one probe of a mesh. The grass, the fleet and the foot all read the
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
 * The ground under a foot: the drawn land's radius under `point` — the
 * sea's own radius where the index reaches and no land is drawn — or the
 * relief's, `groundRadius`, where it does not reach or there is no probe.
 *
 * Only the direction of `point` is read. The relief stays the one definition of
 * the terrain; this is what the mesh made of it, which is what a body can see
 * and so what it has to stand on: the mesh is up to seven units off the
 * relief, and on a lake's shore a foot on the relief walks into water over
 * drawn land.
 */
export function drawnRadius(world: World, probe: LandProbe | null, point: THREE.Vector3): number {
  if (probe !== null) {
    asked.copy(point).normalize();
    if (probe.covers(asked)) return probe.radiusAt(asked) ?? PLANET_RADIUS;
  }
  return groundRadius(world, point);
}

/**
 * How far a plant is seated into the ground, as a share of its own height,
 * under what `drawnFootprint` (or the relief) says is the lowest of its
 * footprint: the wood's (`vegetation.ts`) and the trees round a town's edge
 * (`settlements.ts`). A ring of probes still misses the true low point
 * between two of them on a slope, and a twentieth of the height closes it for
 * nothing — burying a trunk is invisible where floating one is the first
 * thing anybody notices.
 */
export const PLANT_SEATING = 0.05;

/** What `drawnFootprint` finds under a footprint: radii from the planet's centre. */
export interface DrawnFootprint {
  /** The drawn land under the footprint's middle. */
  centre: number;
  /** The lowest and the highest of the middle and the ring round it. */
  lowest: number;
  highest: number;
}

const footprintAt = new THREE.Vector3();

/**
 * What a thing standing on the drawn land is seated on: the drawn land
 * under `up` (a unit vector) and under a ring of eight points `reach` units
 * out along `across` and `north` (unit vectors along the ground there), into
 * `out`. `'drawn'` when it answered; `'water'` when the middle is over water,
 * where nothing is drawn to stand on (a point of the ring over water is left
 * out: the land there has gone under the sea's shelf); `'unknown'` when the
 * probe has not gathered all nine, and the caller falls back on the relief
 * knowing it did.
 *
 * Eight and not `gradeAt`'s four, because the drawn land is flat triangles
 * and not a smooth field: the low corner of a footprint on a crease is as
 * often on a diagonal as on an axis.
 */
export function drawnFootprint(
  probe: LandProbe,
  up: THREE.Vector3,
  across: THREE.Vector3,
  north: THREE.Vector3,
  reach: number,
  out: DrawnFootprint,
): 'drawn' | 'water' | 'unknown' {
  if (!probe.covers(up)) return 'unknown';
  const centre = probe.radiusAt(up);
  if (centre === null) return 'water';
  let lowest = centre;
  let highest = centre;
  const k = reach / PLANET_RADIUS;
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    footprintAt
      .copy(up)
      .addScaledVector(across, Math.cos(angle) * k)
      .addScaledVector(north, Math.sin(angle) * k)
      .normalize();
    if (!probe.covers(footprintAt)) return 'unknown';
    const radius = probe.radiusAt(footprintAt);
    if (radius === null) continue;
    if (radius < lowest) lowest = radius;
    if (radius > highest) highest = radius;
  }
  out.centre = centre;
  out.lowest = lowest;
  out.highest = highest;
  return 'drawn';
}

/**
 * How far round the player the probe always answers, however far they have
 * moved since it was gathered: its reach less the walk that gathers it again.
 * The grass's coarse field reaches 320 each way round the camera (`grass.ts`),
 * and the wood asks whether a tile built on the relief is inside it, and so
 * worth building again.
 */
export const PROBE_SURE = 1200;

export function createLandProbe(land: THREE.Mesh): LandProbe {
  const MOVE = 400;
  const REACH = PROBE_SURE + MOVE;
  const SLICE = 300_000;
  /**
   * Milliseconds between two slices. The probe is shared, and the vegetation
   * (for the grass) and the foot both prepare it every frame: without a gap a
   * frame would pay a slice for each caller.
   */
  const SLICE_GAP = 4;
  let sliced = -Infinity;
  const SIDE = Math.ceil((2 * REACH) / BUCKET);
  /** How far a vertex may stand from the centre and its face still reach `REACH`. */
  const GATHER = REACH + 300;
  const position = land.geometry.getAttribute('position').array as Float32Array;
  /** The drawn normals, when the mesh carries them as bytes (the land does). */
  const normalArray = land.geometry.getAttribute('normal')?.array;
  const normals = normalArray instanceof Int8Array ? normalArray : undefined;
  const faces = position.length / 9;
  /**
   * The surface's triangles as `[from, to)` pairs: every ring's own surface,
   * without the wall under its boundary. A mesh without the spans (a test's)
   * is all surface, and the lean test below keeps its walls out.
   */
  const ringSpans = (land.userData['landFlags'] as LandFlagData | undefined)?.spans;
  const ranges: number[] = ringSpans === undefined ? [0, faces] : ringSpans.flatMap((span) => [span.surface[0], span.surface[1]]);
  const COS_REACH = Math.cos(REACH / PLANET_RADIUS);

  let ready: FaceIndex | null = null;
  let gathering: { centre: THREE.Vector3; range: number; next: number; found: number[] } | null = null;

  const unit = new THREE.Vector3();

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
          ready = buildFaceIndex(position, at, found, REACH, SIDE);
          gathering = null;
        }
      }
      unit.copy(centre).normalize();
      return ready !== null && ready.centre.distanceTo(unit) * PLANET_RADIUS < REACH - MOVE;
    },

    radiusAt(direction, normal, shading) {
      if (ready === null) return null;
      if (shading !== undefined && normals === undefined) shading.set(0, 0, 0);
      return highestHit(position, ready, direction, normal, REACH, SIDE, normals, shading);
    },

    covers(direction) {
      return ready !== null && direction.dot(ready.centre) >= COS_REACH;
    },
  };
  return probe;
}
