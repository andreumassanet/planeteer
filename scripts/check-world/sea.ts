/**
 * The shore and the sea: the lowest ground, the shallows ribbon, which ring
 * edges are coasts, the water's colour, and the ramp rising inland.
 */
import { DEG, at, check } from './harness.ts';
import type { WorldContext } from './context.ts';
import type { LandMesh } from './mesh.ts';
import { Color, Vector3 } from 'three';
import type { Mesh } from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE, coastEdges, groundRadius } from '../../src/globe.ts';
import { oceanLimits } from '../../src/ocean.ts';
import { OCEAN_COLOR } from '../../src/theme.ts';
import { SHORE_LIP, flattenWeightAt } from '../../src/terrain.ts';

/**
 * The lowest ground on the planet is `SHORE_LIP`, measured off the mesh
 * (wall bases excluded). `OCEAN_SAG`, the boat's `SEA_LEVEL_EPSILON` and
 * `RELIEF_SAG` all sit under it; a shore that dipped below any of them would
 * be a coast the world cannot tell from water.
 */
export function checkShore(ctx: WorldContext, mesh: LandMesh): void {
  const { world } = ctx;
  const { sea, position } = mesh;
  const v = new Vector3();
  const oceanSag = sea.stats.sag;
  let lowestGround = Infinity;
  for (let i = 0; i < position.count; i++) {
    const radius = v.fromBufferAttribute(position, i).length() - PLANET_RADIUS;
    if (radius > -1 && radius < lowestGround) lowestGround = radius;
  }
  check(
    Math.abs(lowestGround - SHORE_LIP) < 0.01 && oceanSag < SHORE_LIP * 0.5,
    'the shore comes down to the lip and no further',
    `lowest ground ${lowestGround.toFixed(2)} vs lip ${SHORE_LIP}, ocean sag ${oceanSag.toFixed(2)}`,
  );

  // The shallows ribbon stays at or above sea level (it must not displace the
  // water), below the beach lip (the sea must not lie on walkable land), and
  // lifted enough over the sphere that a quad's sag does not let water poke
  // through.
  let shallowLow = Infinity;
  let shallowHigh = -Infinity;
  let shallowVertices = 0;
  for (const object of sea.group.children) {
    if ((object as Mesh).name !== 'shallows') continue;
    const positions = (object as Mesh).geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const radius = v.fromBufferAttribute(positions, i).length() - PLANET_RADIUS;
      if (radius < shallowLow) shallowLow = radius;
      if (radius > shallowHigh) shallowHigh = radius;
      shallowVertices++;
    }
  }
  const seaLimits = oceanLimits(sea.stats.rows);
  check(
    shallowLow >= 0 && shallowHigh < SHORE_LIP && seaLimits.liftShelf > seaLimits.quadSag * 1.4,
    'the shallows float over the water and under the beach',
    `${shallowLow.toFixed(2)} to ${shallowHigh.toFixed(2)} against lip ${SHORE_LIP}, ` +
    `quad sag ${seaLimits.quadSag.toFixed(2)} against outer lift ${seaLimits.liftShelf}, ` +
    `built at detail ${sea.stats.builtAt} — reach ${sea.stats.shelfReach}, ` +
    `rows [${sea.stats.rows.join(', ')}], tolerance ${sea.stats.tolerance}`,
  );

  // The rings are country outlines, so many of their edges are land frontiers;
  // `coastEdges` is the one answer to which are coast, and the surf is built
  // only on those.
  const seaFacing = coastEdges(world);
  let coastalEdges = 0;
  let frontierEdges = 0;
  for (const flags of seaFacing) {
    for (const flag of flags) {
      if (flag === 1) coastalEdges++;
      else frontierEdges++;
    }
  }
  check(
    coastalEdges > frontierEdges && coastalEdges > 50000,
    'the shallows are built on the coasts and not on the frontiers',
    `${coastalEdges.toLocaleString()} coastal edges, ${frontierEdges.toLocaleString()} frontier, ` +
    `${sea.stats.spans.toLocaleString()} spans, ${sea.stats.chunks} chunks, ` +
    `${sea.stats.mb} MB, built in ${sea.stats.buildMs} ms`,
  );

  // The maps paint the ocean as flat `OCEAN_COLOR`; the sphere's vertex
  // colours are derived from it and must average close to it.
  const mean = sea.stats.meanWater;
  const flat = new Color(OCEAN_COLOR);
  const drift = Math.max(
    Math.abs(mean[0]! - flat.r),
    Math.abs(mean[1]! - flat.g),
    Math.abs(mean[2]! - flat.b),
  );
  check(
    drift < 0.06,
    'the sea on the planet is the sea on the map',
    `mean water (${mean.map((c) => c.toFixed(3)).join(', ')}) against ` +
    `OCEAN_COLOR (${[flat.r, flat.g, flat.b].map((c) => c.toFixed(3)).join(', ')}), worst channel ${drift.toFixed(3)}; ` +
    `${sea.stats.openVertices.toLocaleString()} open vertices, median ${sea.stats.medianDepth} units from land, ` +
    `furthest ${sea.stats.furthestFromLand.toLocaleString()}`,
  );
}

/**
 * The shore ramp falls toward the sea.
 *
 * `terrain.ts` picks the sea side of a ring edge with `cross(up, b - a)`;
 * backwards, every frontier grows a trench and every coast becomes a wall,
 * yet the index would still agree with itself. So walk in from the water at
 * real coasts and require the ground to rise. Samples held level by a
 * monument's pad (`flattenWeightAt`, the mesh's own weight) are skipped.
 */
export function checkShoreRamp(ctx: WorldContext): void {
  const { world } = ctx;
  const step = (lat: number, lon: number, bearing: number, distance: number): [number, number] => {
    const degrees = distance / UNITS_PER_DEGREE;
    return [
      lat + degrees * Math.cos(bearing),
      lon + (degrees * Math.sin(bearing)) / Math.max(0.02, Math.cos(lat * DEG)),
    ];
  };
  // The first twenty are coastal cities, the second twenty coasts with no
  // monument (and so no pad) on them.
  const coasts: [number, number][] = [
    [36.79, -2.13], [43.35, -8.40], [20.60, -16.60], [27.00, -80.40], [-33.90, 151.25],
    [1.30, 103.85], [55.70, 12.60], [-23.00, -43.20], [35.60, 139.80], [9.90, 76.20],
    [-34.00, 18.40], [21.90, 89.50], [40.60, -73.90], [-12.05, -77.05], [37.95, 23.65],
    [30.05, 31.25], [4.05, 9.70], [-6.20, 106.85], [22.30, 114.17], [41.90, 12.50],
    [59.33, 18.07], [-38.00, -57.55], [13.10, 80.30], [45.40, 12.33], [-8.65, 115.22],
    [59.91, 10.75], [38.72, -9.14], [36.72, -4.42], [43.30, 5.37], [-34.60, -58.37],
    [-12.97, -38.50], [6.45, 3.40], [33.59, -7.62], [14.58, 120.98], [-36.85, 174.76],
    [49.28, -123.12], [31.23, 121.49], [64.15, -21.94], [-23.65, -70.40], [60.17, 24.94],
  ];
  let asked = 0;
  let rose = 0;
  let paved = 0;
  const flat: string[] = [];
  for (const [lat, lon] of coasts) {
    if (world.countryAt(lat, lon) === 0) continue;
    // The bearing of the nearest water, in ten-unit steps out to 200 units.
    let edge = Infinity;
    let bearing = 0;
    for (let k = 0; k < 36; k++) {
      const angle = (k / 36) * Math.PI * 2;
      for (let d = 10; d <= 200; d += 10) {
        const [y, x] = step(lat, lon, angle, d);
        if (world.countryAt(y, x) !== 0) continue;
        if (d < edge) { edge = d; bearing = angle; }
        break;
      }
    }
    if (edge === Infinity) continue;
    // The last land before the water and 130 units back (the widest ramp, so
    // the second sample is on the shelf). The whole walk must stay ashore, or
    // it has crossed a peninsula and says nothing about this shore.
    const wet = step(lat, lon, bearing, edge - 10);
    const dry = step(lat, lon, bearing, edge - 130);
    let ashore = true;
    for (let back = 0; back <= 120 && ashore; back += 10) {
      const [y, x] = step(lat, lon, bearing, edge - 10 - back);
      if (world.countryAt(y, x) === 0) ashore = false;
    }
    if (!ashore) continue;
    const held = [wet, dry].some(([y, x]) => {
      const p = at(y, x).normalize();
      return flattenWeightAt(p.x, p.y, p.z) > 0;
    });
    if (held) { paved++; continue; }
    asked++;
    const low = world.elevationAt(at(wet[0], wet[1]));
    const high = world.elevationAt(at(dry[0], dry[1]));
    if (high > low + 1) rose++;
    else flat.push(`${lat.toFixed(1)},${lon.toFixed(1)} ${low.toFixed(1)}->${high.toFixed(1)}`);
  }
  check(
    asked >= 8 && rose === asked,
    'the ground rises as you walk in from the water',
    `${rose} of ${asked}${paved > 0 ? `, ${paved} under a monument's pad` : ''}` +
    `${flat.length > 0 ? ` — ${flat.slice(0, 3).join(', ')}` : ''}`,
  );
}

export function printElevations(ctx: WorldContext): void {
  const { world } = ctx;
  console.log('\nelevation');
  for (const [name, lat, lon] of [
    ['Madrid', 40.42, -3.70], ['Mallorca', 39.62, 2.99], ['Menorca', 39.95, 4.10],
    ['mid Atlantic', 30.0, -40.0],
  ] as [string, number, number][]) {
    const e = groundRadius(world, at(lat, lon)) - PLANET_RADIUS;
    console.log(`  ${name.padEnd(16)} ${e.toFixed(1)} units`);
  }
}
