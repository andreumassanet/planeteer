import { Vector3 } from 'three';
import type { World } from '../../src/geo.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import type { FieldIndex, FieldKeepout } from '../../src/fleet.ts';
import { RAIL_LIFT, STATION_BOX } from '../../src/rails/line.ts';
import { stationLevel } from '../../src/rails/crown.ts';
import { stationPoint } from '../../src/rails/stations.ts';
import type { StationFrame } from '../../src/rails/stations.ts';
import { flattenWeightAt } from '../../src/terrain.ts';
import { latOf, lonOf } from '../../src/sphere.ts';
import type { LaidGrid } from './grids.ts';
import { FOOT_HALF, FOOT_MIDDLE, STATION_EMBANK } from './types.ts';
import type { RailRefusal } from './types.ts';

export interface StationTestSource {
  world: World;
  fields: Pick<FieldIndex, 'fieldsNear'>;
  inTown(point: Vector3, clear: number): boolean;
  /** The nearest road's edge to a point, in units past its drawn half-width, or Infinity past `reach`. */
  roadGapAt(point: Vector3, reach: number): number;
  laid: LaidGrid;
}

/**
 * Whether a station can stand: on dry land, off every town, road, landmark
 * and field, level enough that its floor is no embankment, and off every line
 * already laid. The ground's verdict is kept by the station's key, since no
 * line laid later can change it.
 */
export function createStationTest(source: StationTestSource): (frame: StationFrame, key?: string) => RailRefusal | null {
  const { world } = source;
  const probe = new Vector3();
  const fieldHits: FieldKeepout[] = [];
  const grounds = new Map<string, RailRefusal | null>();

  function stationGround(frame: StationFrame): RailRefusal | null {
    // Down its middle first: a road, a town or a field refuses most stations.
    for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += 8) {
      stationPoint(frame, FOOT_MIDDLE, z, probe);
      if (source.inTown(probe, FOOT_HALF + 2)) return 'station-town';
      if (source.roadGapAt(probe, FOOT_HALF + 4) < FOOT_HALF + 1.5) return 'station-road';
      fieldHits.length = 0;
      if (source.fields.fieldsNear(probe, FOOT_HALF + 3, fieldHits).length > 0) return 'station-field';
    }
    // Then the ground over the whole footprint.
    let lowest = Infinity;
    for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += 8) {
      for (let x = STATION_BOX.x0; x <= STATION_BOX.x1 + 1e-6; x += 6) {
        stationPoint(frame, x, z, probe);
        if (world.countryAt(latOf(probe.y), lonOf(probe.x, probe.z)) === 0) return 'station-wet';
        lowest = Math.min(lowest, world.elevationAt(probe));
        if (flattenWeightAt(probe.x, probe.y, probe.z) > 0) return 'station-landmark';
      }
    }
    const floor = stationLevel(world, frame) - PLANET_RADIUS - RAIL_LIFT;
    if (floor - lowest > STATION_EMBANK) return 'station-steep';
    return null;
  }

  return (frame, key) => {
    let ground: RailRefusal | null;
    if (key !== undefined && grounds.has(key)) ground = grounds.get(key)!;
    else {
      ground = stationGround(frame);
      if (key !== undefined) grounds.set(key, ground);
    }
    if (ground !== null) return ground;
    for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += 8) {
      if (source.laid.near(stationPoint(frame, FOOT_MIDDLE, z, probe), FOOT_HALF + 2)) return 'station-rail';
    }
    return null;
  };
}
