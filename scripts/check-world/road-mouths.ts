/**
 * Where a road meets its town's street, across the whole section: the
 * ribbon's end on the kerb with no gap and no overlap in the plane, and the
 * town's edge slope under the ribbon from the kerb out, so no band of land
 * shows across a road's mouth.
 */
import { check } from './harness.ts';
import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import type { Place } from '../../src/places.ts';
import type { World } from '../../src/geo.ts';
import {
  ROAD_CLASSES,
  courseOf,
  createRoads,
  emptyCourse,
  emptyRamp,
  rampOf,
  ribbonHalf,
  townOf,
  coursePath,
} from '../../src/roads.ts';
import type { Road, RoadData } from '../../src/roads.ts';
import { cornerOffset, offsetDirection } from '../../src/scenery/grid.ts';
import { GROUND_LIFT, cellKey } from '../../src/scenery/ground.ts';
import { buildFloor, floorLiftAt } from '../../src/scenery/floor.ts';

/** How far the slope must stay under the ribbon, a unit out from the kerb, up to `SEPARATION_MOST`: clear of the depth buffer's reach. */
const SEPARATION_GRADE = 0.05;
const SEPARATION_MOST = 0.25;
/** Out from the kerb before the separation is asked: at the kerb the two meet by construction. */
const SEPARATION_FROM = 0.5;
/** Every how many roads one is sampled; each costs a network of its own. */
const EVERY = 20;

/**
 * Every `EVERY`th road of the network, each end into a built town: the
 * ribbon's end against the street it enters, and the town's edge slope
 * (`buildFloor`, over the gate's cells at their level and the relief at the
 * lattice's corners) against the ribbon over the first cell out.
 */
export function checkRoadMouths(bakedNetwork: RoadData, roads: readonly Road[], placesRaw: Place[], world: World): void {
  const course = emptyCourse();
  const ramp = emptyRamp();
  const p = new Vector3();
  let ends = 0;
  let gapProbes = 0;
  let gaps = 0;
  let overlaps = 0;
  const gapAt: string[] = [];
  let slopeProbes = 0;
  let over = 0;
  let worstOver = -Infinity;
  const overAt: string[] = [];

  for (let r = 0; r < roads.length; r += EVERY) {
    const road = roads[r]!;
    courseOf(road, placesRaw, course);
    rampOf(road, course, placesRaw, world, ramp);
    const path = coursePath(course);
    if (ramp.kerbA <= 0 && ramp.kerbB <= 0) continue;
    const alone = createRoads(world, placesRaw, { ...bakedNetwork, roads: [road] });
    const half = ROAD_CLASSES[road.cls]!.width * 0.5;
    for (const end of [0, 1] as const) {
      const kerb = end === 0 ? ramp.kerbA : ramp.kerbB;
      if (kerb <= 0) continue;
      const place = placesRaw[end === 0 ? road.a : road.b]!;
      const town = townOf(place);
      const gate = town.gates[end === 0 ? road.gateA : road.gateB]!;
      const { grid } = town;
      const edge = end === 0 ? ramp.walkA + ramp.carriageA : ramp.walkB + ramp.carriageB;
      if (edge <= 0) continue;
      ends++;
      const name = `${place.name} gate ${end === 0 ? road.gateA : road.gateB}`;
      // Along the kerb, and out of the town.
      const ax = -gate.outZ;
      const az = gate.outX;
      const at = (s: number, t: number): Vector3 =>
        offsetDirection(town.up, town.across, town.north, gate.x + gate.outX * s + ax * t, gate.z + gate.outZ * s + az * t, p);

      // In the plane: a hair outside the kerb the ribbon is there across the
      // street's whole width, and a hair inside it the ribbon is not.
      for (let k = 0; k <= 20; k++) {
        const t = -edge + 0.02 + ((2 * edge - 0.04) * k) / 20;
        gapProbes++;
        if (alone.ribbonHeightAt(at(0.02, t)) === 0) {
          gaps++;
          if (gapAt.length < 3) gapAt.push(`${name} ${t.toFixed(2)} across`);
        }
        if (alone.ribbonHeightAt(at(-0.02, t)) !== 0) {
          overlaps++;
          if (gapAt.length < 3) gapAt.push(`${name} ${t.toFixed(2)} across, inside the kerb`);
        }
      }

      // The floor round the gate's cells, at the level the ribbon climbs to.
      const level = kerb - PLANET_RADIUS - GROUND_LIFT;
      const terraces = new Map<number, number>();
      for (const [col, row] of gate.cells) terraces.set(cellKey(col, row), level);
      const sideOf = [[1, 0], [0, 1], [-1, 0], [0, -1]].findIndex(([x, z]) => x === gate.outX && z === gate.outZ);
      const field = buildFloor({
        grid,
        band: 0,
        terraces,
        mouths: new Set(gate.cells.map(([col, row]) => cellKey(col, row) * 4 + sideOf)),
        cornerGround: (i, j) => {
          const e = world.elevationAt(offsetDirection(town.up, town.across, town.north, cornerOffset(grid, i), cornerOffset(grid, j), p));
          return e <= 0 ? null : e;
        },
      });
      const length = path.length;
      for (let s = 0.25; s <= grid.pitch - 0.25; s += 0.25) {
        const sA = end === 0 ? s : length - s;
        const width = Math.min(edge, ribbonHalf(ramp, half, sA, length - sA)) - 0.05;
        for (let k = 0; k <= 8; k++) {
          const t = -width + (2 * width * k) / 8;
          const x = gate.x + gate.outX * s + ax * t;
          const z = gate.z + gate.outZ * s + az * t;
          const lift = floorLiftAt(field, x, z, 0);
          if (lift === 0) continue;
          const ribbon = alone.ribbonHeightAt(at(s, t));
          if (ribbon === 0) continue;
          slopeProbes++;
          const need = s < SEPARATION_FROM ? -1e-3 : Math.min(SEPARATION_MOST, SEPARATION_GRADE * s);
          const above = PLANET_RADIUS + lift - (ribbon - need);
          if (above > worstOver) worstOver = above;
          if (above > 0) {
            over++;
            if (overAt.length < 3) overAt.push(`${name} ${s.toFixed(2)} out, ${t.toFixed(2)} across: ${(PLANET_RADIUS + lift - ribbon).toFixed(3)} from the ribbon`);
          }
        }
      }
    }
  }
  check(
    gaps === 0 && overlaps === 0,
    'a road’s end meets its gate’s street across its whole width: no gap, no overlap',
    `${ends} ends, ${gapProbes} probes a fiftieth of a unit either side of the kerb, ${gaps} gaps, ${overlaps} overlaps${gapAt.length > 0 ? `; ${gapAt.join('; ')}` : ''}`,
  );
  check(
    over === 0,
    'the town’s edge slope stays under the ribbon across a road’s mouth',
    `${slopeProbes} probes over the first cell out, ${over} too near or over it, closest ${worstOver.toFixed(3)}${overAt.length > 0 ? `; ${overAt.join('; ')}` : ''}`,
  );
}
