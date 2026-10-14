/** A placed monument's runtime record: where it stands, its mesh while built, its walls while near. */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { groundRadius } from '../globe.ts';
import { unitAt } from '../sphere.ts';
import type { SolidField } from '../scenery/solids.ts';
import type { Occupancy } from '../scenery/occupancy.ts';
import type { Placement } from '../placement.ts';

/** A standing monument's solids, in its own frame: `x` along `right`, `z` along `facing`. */
export interface Walls {
  field: SolidField;
  floor: Occupancy['floor'];
  right: THREE.Vector3;
  facing: THREE.Vector3;
  /** The model's base, as a radius: its `y = 0`. */
  base: number;
  cosBound: number;
}

export interface Slot {
  placement: Placement;
  /** Unit vector at its position, so the distance test costs no trigonometry. */
  direction: THREE.Vector3;
  anchor: THREE.Vector3;
  /** Seated on the drawn land, rather than on the relief's pad while the probe had not gathered under it. */
  onDrawn: boolean;
  /** The monument, merged into one mesh, while it stands. */
  object: THREE.Mesh | null;
  failed: boolean;
  /** Its walls, while it stands and once it is near. */
  walls: Walls | null;
}

/** One slot per placement that has a model. */
export function createSlots(world: World, placements: readonly Placement[], known: ReadonlySet<string>): Slot[] {
  return placements
    .filter((p) => known.has(p.id))
    .map((placement) => {
      const direction = unitAt(placement.lat, placement.lon, new THREE.Vector3());
      // The ground is asked once, here: the relief does not move, and asking per
      // frame would put a point-in-polygon query behind every monument.
      const anchor = direction.clone().multiplyScalar(groundRadius(world, direction));
      return { placement, direction, anchor, onDrawn: false, object: null, failed: false, walls: null };
    });
}
