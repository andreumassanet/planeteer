/**
 * The land mesh: built once here, then held to its own bounds, its winding,
 * the coastline it was cut from and the lakes cut out of it.
 */
import { DEG, check } from './harness.ts';
import type { WorldContext } from './context.ts';
import { Vector3 } from 'three';
import type { BufferAttribute, InterleavedBufferAttribute, Mesh } from 'three';
import { insideRing, toLatLon } from '../../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, LAND_HEIGHT, buildLand } from '../../src/globe.ts';
import { createOcean } from '../../src/ocean.ts';
import type { Ocean } from '../../src/ocean.ts';
import { MAX_RELIEF } from '../../src/terrain.ts';
import { checkGroundColour, checkTownSeams } from './mesh-ground.ts';

/** The built land and sea, with the accessors the mesh suites share. */
export interface LandMesh {
  readonly land: Mesh;
  readonly sea: Ocean;
  readonly position: BufferAttribute | InterleavedBufferAttribute;
  readonly triangles: number;
  /**
   * A triangle's own normal, from its corners. The normal attribute is smooth
   * (each vertex averages its faces), so which way a face points is asked of
   * its geometry.
   */
  faceNormalOf(t: number, into: Vector3): Vector3;
}

export function checkMesh(ctx: WorldContext): LandMesh {
  const { world } = ctx;
  console.log('\nmesh');
  const buildStart = Date.now();
  const land = buildLand(world, ctx.tight);
  const buildMs = Date.now() - buildStart;
  const sea = createOcean(world);

  const position = land.geometry.getAttribute('position');
  const normal = land.geometry.getAttribute('normal');
  const triangles = position.count / 3;
  const bytes = position.array.byteLength + normal.array.byteLength +
    land.geometry.getAttribute('color').array.byteLength;
  console.log(
    `  ${triangles.toLocaleString()} land triangles + ` +
    `${sea.stats.sphereFaces.toLocaleString()} water + ` +
    `${(sea.stats.triangles - sea.stats.sphereFaces).toLocaleString()} shallows, ` +
    // MiB, like `atlas.stats` and `ocean.stats`.
    `${(bytes / 1048576).toFixed(1)} MB, built in ${buildMs} ms`,
  );

  const faceA = new Vector3();
  const faceB = new Vector3();
  const faceC = new Vector3();
  const faceNormalOf = (t: number, into: Vector3): Vector3 => {
    faceA.fromBufferAttribute(position, t * 3);
    faceB.fromBufferAttribute(position, t * 3 + 1).sub(faceA);
    faceC.fromBufferAttribute(position, t * 3 + 2).sub(faceA);
    return into.crossVectors(faceB, faceC).normalize();
  };
  const mesh: LandMesh = { land, sea, position, triangles, faceNormalOf };

  checkVertices(mesh);
  checkCliffs(ctx, mesh);
  checkLakeTops(ctx, mesh);
  checkGroundColour(ctx, mesh);
  checkTownSeams(ctx, mesh);
  return mesh;
}

/** Every vertex lies between the sea floor and the highest possible peak, and no face points inward. */
function checkVertices(mesh: LandMesh): void {
  const { position, triangles, faceNormalOf } = mesh;
  let radiusMin = Infinity;
  let radiusMax = -Infinity;
  let notFinite = 0;
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const r = v.length();
    if (!Number.isFinite(r)) notFinite++;
    else {
      radiusMin = Math.min(radiusMin, r);
      radiusMax = Math.max(radiusMax, r);
    }
  }
  check(notFinite === 0, 'all vertices finite', notFinite ? `${notFinite} NaN` : '');
  // `reliefAt` clamps to MAX_RELIEF, so the ceiling is the tallest shelf plus that.
  check(
    radiusMin > PLANET_RADIUS - 60 &&
      radiusMax <= PLANET_RADIUS + LAND_HEIGHT + MAX_RELIEF + 0.5,
    'vertices within sea floor and the highest possible peak',
    `${radiusMin.toFixed(1)} .. ${radiusMax.toFixed(1)} (ceiling ${(PLANET_RADIUS + LAND_HEIGHT + MAX_RELIEF + 0.5).toFixed(1)})`,
  );

  // A face pointing into the planet is a ring wound the wrong way.
  let inward = 0;
  const n = new Vector3();
  for (let t = 0; t < triangles; t++) {
    v.fromBufferAttribute(position, t * 3);
    faceNormalOf(t, n);
    if (n.dot(v.normalize()) < -0.35) inward++;
  }
  check(inward === 0, 'no triangle faces inward', inward ? `${inward} of ${triangles}` : '');
}

/**
 * The coastal walls face the sea.
 *
 * A wall's normal is perpendicular to the radius whichever way it points, so
 * the inward test cannot see it. Instead, step off each wall along its normal
 * and ask the outlines (point-in-polygon, independent of winding) which side
 * is water. A wall is a triangle that crosses sea level: only the coastal
 * skirt does that, since the ground never goes below `SHORE_LIP`.
 */
function checkCliffs(ctx: WorldContext, mesh: LandMesh): void {
  const { world } = ctx;
  const { position, triangles, faceNormalOf } = mesh;
  /**
   * How far off a wall to step, in units. Small enough not to step over the
   * 1:10m outlines' point spacing, large enough to clear the numerical gap
   * between a wall's centroid and its outline.
   */
  const CLIFF_STEP = 2;
  const centroid = new Vector3();
  const probe = new Vector3();
  const v = new Vector3();
  const n = new Vector3();
  const cb = new Vector3();
  const cc = new Vector3();
  let walls = 0;
  let seaward = 0;
  let inland = 0;
  for (let t = 0; t < triangles; t++) {
    faceNormalOf(t, n);
    v.fromBufferAttribute(position, t * 3);
    cb.fromBufferAttribute(position, t * 3 + 1);
    cc.fromBufferAttribute(position, t * 3 + 2);
    const high = Math.max(v.length(), cb.length(), cc.length());
    const low = Math.min(v.length(), cb.length(), cc.length());
    if (high <= PLANET_RADIUS || low >= PLANET_RADIUS) continue;
    centroid.copy(v).add(cb).add(cc).divideScalar(3);
    walls++;
    const ahead = toLatLon(probe.copy(centroid).addScaledVector(n, CLIFF_STEP));
    const behind = toLatLon(probe.copy(centroid).addScaledVector(n, -CLIFF_STEP));
    const wet = world.countryAt(ahead.lat, ahead.lon) === 0;
    const dry = world.countryAt(behind.lat, behind.lon) !== 0;
    // Land on both sides (a strait narrower than the step) or water on both
    // (a spit) says nothing either way.
    if (wet && dry) seaward++;
    else if (!wet && !dry) inland++;
  }
  // Where land or channel is thinner than the probe (fjords, archipelagos)
  // both steps land wrong, about 0.1% of walls. A ring wound backwards fails
  // by orders of magnitude, so the ratio is what is asserted.
  check(
    seaward > inland * 1000,
    'the coastal cliffs face the sea',
    `${seaward.toLocaleString()} seaward, ${inland.toLocaleString()} inland, of ${walls.toLocaleString()} walls`,
  );
}

/**
 * How much land the mesh draws over lake water, and how far in.
 *
 * `globe.ts` cuts a lake as a hole, a splice, or (for a border drawn along a
 * shore) by dropping the faces on the water. The residue is a shore ramp's
 * width at most; the bound is a ceiling just above it.
 */
function checkLakeTops(ctx: WorldContext, mesh: LandMesh): void {
  const { world } = ctx;
  const { land, position, triangles } = mesh;
  const centroid = new Vector3();
  const v = new Vector3();
  const cb = new Vector3();
  const cc = new Vector3();
  const lakesAt = world.rings.filter((ring) => ring.water).map((ring) => {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of ring.points) {
      minLon = Math.min(minLon, lon!); maxLon = Math.max(maxLon, lon!);
      minLat = Math.min(minLat, lat!); maxLat = Math.max(maxLat, lat!);
    }
    return { points: ring.points, box: [minLon, minLat, maxLon, maxLat] as const };
  });
  const shoreDistance = (points: number[][], lon: number, lat: number): number => {
    let best = Infinity;
    const k = Math.cos(lat * DEG);
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const ax = points[j]![0]! * k, ay = points[j]![1]!;
      const dx = points[i]![0]! * k - ax, dy = points[i]![1]! - ay;
      const length = dx * dx + dy * dy;
      const t = length > 0 ? Math.max(0, Math.min(1, ((lon * k - ax) * dx + (lat - ay) * dy) / length)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx - lon * k, ay + t * dy - lat));
    }
    return best * UNITS_PER_DEGREE;
  };
  let overWater = 0;
  let deepest = 0;
  let deepestAt = '';
  for (let t = 0; t < triangles; t++) {
    v.fromBufferAttribute(position, t * 3);
    cb.fromBufferAttribute(position, t * 3 + 1);
    cc.fromBufferAttribute(position, t * 3 + 2);
    // Tops only: walls and shore skirts reach the water on purpose.
    if (Math.min(v.length(), cb.length(), cc.length()) < PLANET_RADIUS + 1) continue;
    const { lat, lon } = toLatLon(centroid.copy(v).add(cb).add(cc));
    for (const lake of lakesAt) {
      const [minLon, minLat, maxLon, maxLat] = lake.box;
      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
      if (!insideRing(lake.points, lon, lat) || world.countryAt(lat, lon) !== 0) continue;
      overWater++;
      const depth = shoreDistance(lake.points, lon, lat);
      if (depth > deepest) {
        deepest = depth;
        deepestAt = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      }
    }
  }
  const cut = land.userData['lakes'] as { holes: number; splices: number; unpaired: number; droppedFaces: number; strayFaces: number };
  check(
    overWater <= 400 && deepest <= 30,
    'land drawn over a lake stays within what was measured',
    `${overWater.toLocaleString()} land tops over lake water, deepest ${deepest.toFixed(1)} units in at ${deepestAt}; ` +
      `${cut.holes} holes (${cut.strayFaces} stray faces taken out), ${cut.splices} splices, ${cut.unpaired} unpaired dropping ${cut.droppedFaces} faces`,
  );
}
