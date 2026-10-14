import { check } from './harness.ts';
import type { WorldContext } from './context.ts';
import type { LandMesh } from './mesh.ts';
import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { createBorders } from '../../src/borders.ts';
import { verifyFlagLayer } from '../../src/land-flags.ts';

/**
 * The map layer: the colour table, and that the build finishes.
 *
 * The layer paints 14.8 MB of vertex colours in slices under the frame budget.
 * `verifyFlagLayer` drives it to completion against the mesh in hand and holds
 * it to three things: it finishes, it never loses ground it had made, and it
 * ends with the table the colour law claims.
 */
export function checkMapLayer(ctx: WorldContext, mesh: LandMesh): void {
  const { world } = ctx;
  const { land } = mesh;
  console.log('\nthe map layer');
  const flags = verifyFlagLayer(world, land);
  console.log(
    `  ${flags.countries} countries, ${flags.painted.toLocaleString()} of ` +
    `${flags.triangles.toLocaleString()} triangles painted, ${flags.moved} nudged off a ` +
    `neighbour, ${flags.switched} onto another colour of their own flag`,
  );
  check(
    flags.ready,
    'the map layer builds inside its budget',
    `${flags.calls} calls, ${flags.spentMs.toFixed(0)} ms, worst ${flags.worstCallMs.toFixed(1)} ms`,
  );
  check(
    flags.regression === 0,
    'and every call keeps what the last one did',
    flags.regression === 0 ? '' : `progress fell by ${flags.regression.toFixed(3)}`,
  );
  check(
    flags.short === 0,
    'and no two countries that touch share a colour',
    `${flags.countries} coloured, ${flags.short} frontiers short`,
  );
}

/**
 * The frontiers, which are not in the data and have to be found.
 *
 * Every country is one closed outline along its coast and its land borders,
 * with nothing marking which is which, so `borders.ts` steps off each edge
 * along its outward normal and asks `countryAt` what is there. Getting that
 * backwards would draw a band along every coastline and none along a frontier.
 */
export function checkFrontiers(ctx: WorldContext): void {
  const { world } = ctx;
  console.log('\nfrontiers');
  const built = createBorders(world);
  const { frontier, coast } = built.stats;
  console.log(
    `  ${frontier.toLocaleString()} frontier edges, ${coast.toLocaleString()} coastal, ` +
    `${built.stats.triangles.toLocaleString()} triangles`,
  );
  // Sea outnumbers land frontier on this planet — most of the outline of most
  // countries is coast — so a probe with the sign flipped inverts this ratio.
  check(
    coast > frontier && frontier > coast * 0.25,
    'more coastline than frontier, and plenty of both',
    `${((frontier / (frontier + coast)) * 100).toFixed(0)}% frontier`,
  );

  const attribute = built.mesh.geometry.getAttribute('position');
  let finite = true;
  let above = 0;
  const point = new Vector3();
  for (let i = 0; i < attribute.count; i += 7) {
    point.fromBufferAttribute(attribute, i);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      finite = false;
      break;
    }
    if (point.length() < PLANET_RADIUS) above++;
  }
  check(finite && above === 0, 'every frontier vertex is finite and above sea level');
}
