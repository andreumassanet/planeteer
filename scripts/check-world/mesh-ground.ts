/**
 * The land mesh against the two things laid on it: the ground colour law and
 * the towns' paving.
 */
import { check } from './harness.ts';
import type { WorldContext } from './context.ts';
import type { LandMesh } from './mesh.ts';
import { Color, Vector3 } from 'three';
import { PLANET_RADIUS, groundColorAt } from '../../src/globe.ts';
import { indexPlaces } from '../../src/places.ts';
import { GROUND_LIFT } from '../../src/scenery/ground.ts';
import { EDGE_FOOT } from '../../src/scenery/floor.ts';

/**
 * `groundColorAt` and the colour the mesh painted are the same law.
 *
 * The mesh knows its ring and paints without a point-in-polygon query; a
 * caller laying paving asks `groundColorAt`. The residue that differs is
 * coastal centroids outside their ring, biome boundaries and moisture noise
 * sampled a hair apart; dropping the country tint moves every triangle by
 * about 0.41, which fails this many times over.
 */
export function checkGroundColour(ctx: WorldContext, mesh: LandMesh): void {
  const { world } = ctx;
  const { land, position, triangles, faceNormalOf } = mesh;
  const meshColor = new Color();
  const askedColor = new Color();
  const centre = new Vector3();
  const v = new Vector3();
  const n = new Vector3();
  const cb = new Vector3();
  const cc = new Vector3();
  const color = land.geometry.getAttribute('color');
  let compared = 0;
  let apart = 0;
  let worst = 0;
  for (let t = 0; t < triangles; t += 37) {
    faceNormalOf(t, n);
    v.fromBufferAttribute(position, t * 3);
    cb.fromBufferAttribute(position, t * 3 + 1);
    cc.fromBufferAttribute(position, t * 3 + 2);
    // Tops only: a wall's colour is the top's times 0.72.
    if (Math.abs(n.dot(centre.copy(v).normalize())) < 0.5) continue;
    // The mesh paints per vertex, so ask at the first corner; a corner the
    // outlines call sea has no country to tint with.
    if (world.countryAtPoint(v) === 0) continue;
    meshColor.fromBufferAttribute(color, t * 3);
    groundColorAt(world, v, askedColor);
    const off =
      Math.abs(meshColor.r - askedColor.r) +
      Math.abs(meshColor.g - askedColor.g) +
      Math.abs(meshColor.b - askedColor.b);
    compared++;
    if (off > 0.15) apart++;
    if (off > worst) worst = off;
  }
  check(
    apart < compared * 0.005,
    'groundColorAt agrees with the colour the mesh painted',
    `${apart} of ${compared.toLocaleString()} apart, worst ${worst.toFixed(3)}`,
  );
}

/**
 * The mesh under a settlement meets the paving laid on it.
 *
 * A town's floor follows the exact relief (`elevationAt`); the mesh carries
 * up to `RELIEF_SAG` of error, and where it stands over the floor's lift a
 * triangle edge draws a line across the paving. `setDetailSites` refines the
 * mesh under towns to keep that rare. The error is measured at the centre of
 * every land top inside a settlement.
 */
export function checkTownSeams(ctx: WorldContext, mesh: LandMesh): void {
  const { world, placesRaw } = ctx;
  const { position, triangles, faceNormalOf } = mesh;
  const townIndex = indexPlaces(placesRaw as never, PLANET_RADIUS);
  const centre = new Vector3();
  const v = new Vector3();
  const n = new Vector3();
  const tb = new Vector3();
  const tc = new Vector3();
  const unit = new Vector3();
  let inTown = 0;
  let over = 0;
  let under = 0;
  let worstError = 0;
  let where = '';
  for (let t = 0; t < triangles; t++) {
    faceNormalOf(t, n);
    v.fromBufferAttribute(position, t * 3);
    tb.fromBufferAttribute(position, t * 3 + 1);
    tc.fromBufferAttribute(position, t * 3 + 2);
    if (Math.abs(n.dot(unit.copy(v).normalize())) < 0.5) continue;
    centre.copy(v).add(tb).add(tc).divideScalar(3);
    const near = townIndex.nearest(centre);
    if (!near.inside) continue;
    // A coastal triangle whose centroid falls outside its ring has a shelf the
    // lookup cannot see; the difference there is `LAND_HEIGHT`, not mesh error.
    if (world.countryAtPoint(centre) === 0) continue;
    inTown++;
    unit.copy(centre).normalize().multiplyScalar(PLANET_RADIUS);
    const meshHeight = (v.length() + tb.length() + tc.length()) / 3 - PLANET_RADIUS;
    // Signed: mesh over the relief is a seam the lift must clear; mesh under
    // it is what the edge slope's foot (`EDGE_FOOT` under the relief) must reach.
    const error = meshHeight - world.elevationAt(unit);
    if (error > GROUND_LIFT) over++;
    if (-error > EDGE_FOOT) under++;
    if (Math.abs(error) > worstError) {
      worstError = Math.abs(error);
      where = near.place.name;
    }
  }
  check(
    over < inTown * 0.0004,
    'the mesh under a settlement meets the paving on it',
    `${over} of ${inTown.toLocaleString()} triangles over the ${GROUND_LIFT} lift ` +
      `(${((over / inTown) * 100).toFixed(2)}%), worst |error| ${worstError.toFixed(2)} at ${where}`,
  );
  // Every place's whole disc is sampled, not just the course outside a built
  // square where the foot is, hence the tolerance.
  check(
    under < inTown * 0.006,
    'the edge slope’s foot reaches the mesh under a settlement',
    `${under} of ${inTown.toLocaleString()} triangles more than ${EDGE_FOOT} under the relief ` +
      `(${((under / inTown) * 100).toFixed(2)}%)`,
  );
}
