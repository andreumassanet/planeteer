import * as THREE from 'three';
import { createFader } from '../fade.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { createCrowns, retireMesh } from './meshes.ts';
import type { LeafCard } from './meshes.ts';
import type { Slot, TownSeat } from './types.ts';

/**
 * What stands: the towns with a floor, people, lamps, takeable vehicles,
 * benches and racks, each a set a point query walks instead of every slot;
 * the fader; and the log of floors raised and dropped.
 */
export interface Registry {
  readonly group: THREE.Group;
  /** Towns arriving and leaving by dissolving; see `fade.ts`. */
  readonly fader: ReturnType<typeof createFader>;
  /** Every town with a floor standing, which is what a point query walks. `raise` adds and `drop` removes. */
  readonly floors: Set<Slot>;
  /** Every standing town with people in it, for `folkNear`. */
  readonly inhabited: Set<Slot>;
  /** Every standing town with street lamps, for `lampsNear`. */
  readonly lit: Set<Slot>;
  /** The standing towns with a vehicle in them that can be taken. */
  readonly parkedTowns: Set<Slot>;
  /** The standing towns with a bench, for `benchesNear`. */
  readonly benchTowns: Set<Slot>;
  /** The standing towns with a bicycle rack, for `bikeSlotsNear`. */
  readonly rackTowns: Set<Slot>;
  /** The near towns whose trees shed; see `createCrowns`. */
  readonly crowned: Set<THREE.Mesh>;
  townCrowns(mesh: THREE.Mesh, cards: readonly LeafCard[]): void;
  /** Where each tree and bush round a town's edge went, while `recordSeats` is asking. */
  seatLog: TownSeat[] | null;
  /** Whether a parked vehicle has been taken, and so is the fleet's to draw. */
  parkedTaken: (id: string) => boolean;
  /** Records a floor about to be raised or dropped, for `floorChanges`. Reads the floor, so call it before clearing one. */
  noteFloor(slot: Slot): void;
  floorChanges(since: number, into: number[]): number;
  /** Takes a town mesh out of the world; see `retireMesh`. */
  retire(mesh: THREE.Mesh, instant: boolean): void;
}

/**
 * The floor log is a ring: the grass re-bakes round a town whose lawns have
 * arrived or gone, and nothing reads further back than the frame before.
 */
const FLOOR_CHANGES = 256;

export function createRegistry(): Registry {
  const group = new THREE.Group();
  group.name = 'settlements';
  const fader = createFader();
  const { crowned, townCrowns } = createCrowns();
  const changedUp = new Float64Array(FLOOR_CHANGES * 3);
  const changedReach = new Float64Array(FLOOR_CHANGES);
  let floorVersion = 0;
  return {
    group,
    fader,
    floors: new Set(),
    inhabited: new Set(),
    lit: new Set(),
    parkedTowns: new Set(),
    benchTowns: new Set(),
    rackTowns: new Set(),
    crowned,
    townCrowns,
    seatLog: null,
    parkedTaken: () => false,
    noteFloor(slot) {
      const floor = slot.floor;
      if (floor === null) return;
      const at = floorVersion % FLOOR_CHANGES;
      changedUp[at * 3] = floor.up.x;
      changedUp[at * 3 + 1] = floor.up.y;
      changedUp[at * 3 + 2] = floor.up.z;
      changedReach[at] = Math.acos(Math.min(1, floor.cosBound)) * PLANET_RADIUS;
      floorVersion++;
    },
    floorChanges(since, into) {
      into.length = 0;
      if (floorVersion - since > FLOOR_CHANGES) {
        into.push(-1);
        return floorVersion;
      }
      for (let version = since; version < floorVersion; version++) {
        const at = version % FLOOR_CHANGES;
        into.push(changedUp[at * 3]!, changedUp[at * 3 + 1]!, changedUp[at * 3 + 2]!, changedReach[at]!);
      }
      return floorVersion;
    },
    retire(mesh, instant) {
      retireMesh(group, fader, crowned, mesh, instant);
    },
  };
}
