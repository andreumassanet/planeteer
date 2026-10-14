import type * as THREE from 'three';
import type { TownGrid } from '../scenery/grid.ts';
import type { Placed } from '../scenery/index.ts';
import { drain } from './budget.ts';
import type { Registry } from './registry.ts';
import type { Slot } from './types.ts';

/**
 * A town's life in the streamer: raised whole or a step at a time, built again
 * with its old mesh drawn until the new one stands, and dropped.
 */
export interface Lifecycle {
  /** Raises a town whole, ending or finishing any far town under way first. */
  raise(slot: Slot): void;
  /** Plans a town's plots whole, for `compare`. */
  planTown(slot: Slot, grid: TownGrid): { placed: Placed[] };
  /** Takes a town out: dissolved, or at once when `instant`. */
  drop(slot: Slot, instant?: boolean): void;
  /** Builds a standing town again and trades the old mesh for the new one in the same frame, as a cross-dissolve. */
  rebuild(slot: Slot): void;
  /** Whether a town whose rank moved has to be built again to show it. */
  needsRebuild(slot: Slot): boolean;
  /** Steps a far town while `more` allows; true once it stands. */
  stepFar(slot: Slot, more: () => boolean): boolean;
  /** Makes way for another build: a far town begun from nothing is abandoned, one being rebuilt is finished. */
  yieldFarJob(): void;
  /** Abandons the far town under way and takes back what its steps published. */
  endFarJob(): void;
  /** The town a far job is building, or null. */
  farSlot(): Slot | null;
}

export function createLifecycle(
  registry: Registry,
  raiseSteps: (slot: Slot) => Generator<void, void, void>,
  warmSteps: (slot: Slot) => Generator<void, void, void>,
  planTownSteps: (slot: Slot, grid: TownGrid) => Generator<void, { placed: Placed[] }, void>,
  endPlanJob: () => void,
): Lifecycle {
  /**
   * A far town built a step at a time over as many frames as it takes, asking
   * the frame's allowance between steps, so a big city arriving from the plane
   * is not one long frame. A town built again keeps its old mesh drawn until
   * the last step. A near town is still built whole: the ground under a foot is
   * worth the frame.
   */
  let farJob: { slot: Slot; steps: Generator<void, void, void>; old: THREE.Mesh | null } | null = null;

  /** A far town's steps: its region's variants first, then the town. */
  function* farSteps(slot: Slot): Generator<void, void, void> {
    yield* warmSteps(slot);
    yield* raiseSteps(slot);
  }

  function endFarJob(): void {
    if (farJob === null) return;
    const slot = farJob.slot;
    const old = farJob.old;
    farJob.steps.return(undefined);
    farJob = null;
    if (slot.mesh !== null) return;
    // A town being built again goes out as the town it was.
    if (old !== null) registry.retire(old, false);
    slot.stale = false;
    if (slot.floor !== null) registry.noteFloor(slot);
    slot.floor = null;
    registry.floors.delete(slot);
    slot.folk = [];
    slot.parked = [];
    slot.benches = [];
    slot.bikeSlots = [];
    slot.paved = 0;
  }

  function stepFar(slot: Slot, more: () => boolean): boolean {
    // The steps share the town frame and the terraces with any other build.
    if (farJob !== null && farJob.slot !== slot) endFarJob();
    endPlanJob();
    if (farJob === null) {
      const old = slot.mesh;
      if (old !== null) letGoOf(registry, slot);
      farJob = { slot, steps: farSteps(slot), old };
    }
    const job = farJob;
    do {
      if (job.steps.next().done === true) {
        farJob = null;
        if (job.old !== null) {
          registry.retire(job.old, false);
          settleRebuilt(slot);
        }
        return true;
      }
    } while (more());
    return false;
  }

  function yieldFarJob(): void {
    endPlanJob();
    if (farJob === null) return;
    if (farJob.old === null) endFarJob();
    else stepFar(farJob.slot, () => true);
  }

  function raise(slot: Slot): void {
    yieldFarJob();
    drain(raiseSteps(slot));
  }

  return {
    raise,
    planTown(slot, grid) {
      yieldFarJob();
      return drain(planTownSteps(slot, grid));
    },
    drop: (slot, instant) => drop(registry, slot, instant),
    rebuild(slot) {
      const old = slot.mesh;
      if (old === null) {
        raise(slot);
        return;
      }
      letGoOf(registry, slot);
      raise(slot);
      registry.retire(old, false);
      settleRebuilt(slot);
    },
    needsRebuild(slot) {
      // A far town built near keeps its parked cars and stops publishing people,
      // so only kit assets, or a far build now near, need a rebuild.
      if (slot.mesh === null || slot.builtPeopled === slot.peopled) return false;
      return slot.style.assets !== undefined || slot.peopled;
    },
    stepFar,
    yieldFarJob,
    endFarJob,
    farSlot: () => farJob?.slot ?? null,
  };
}

/** Takes a town out: dissolved, or at once when `instant`. */
function drop(registry: Registry, slot: Slot, instant = false): void {
  if (slot.mesh === null) return;
  slot.stale = false;
  slot.folk = [];
  registry.inhabited.delete(slot);
  registry.lit.delete(slot);
  slot.lampHeads = null;
  slot.parked = [];
  registry.parkedTowns.delete(slot);
  slot.benches = [];
  registry.benchTowns.delete(slot);
  slot.bikeSlots = [];
  registry.rackTowns.delete(slot);
  registry.retire(slot.mesh, instant);
  slot.mesh = null;
  slot.triangles = 0;
  slot.parts = 0;
  slot.paved = 0;
  // The floor goes with the mesh, or it is a plinth a player walks on over open ground.
  if (slot.floor !== null) registry.noteFloor(slot);
  slot.floor = null;
  registry.floors.delete(slot);
  slot.bytes = 0;
}

/**
 * What a standing town published goes ahead of building it again; its mesh
 * is left to the caller. `noteFloor` first, because it reads the floor.
 */
function letGoOf(registry: Registry, slot: Slot): void {
  if (slot.floor !== null) registry.noteFloor(slot);
  slot.floor = null;
  registry.floors.delete(slot);
  registry.inhabited.delete(slot);
  registry.lit.delete(slot);
  slot.lampHeads = null;
  slot.folk = [];
  registry.parkedTowns.delete(slot);
  slot.parked = [];
  slot.benches = [];
  registry.benchTowns.delete(slot);
  slot.bikeSlots = [];
  registry.rackTowns.delete(slot);
  slot.mesh = null;
}

/** After a town was built again: if it would not build, nothing stands here, as after `drop`. */
function settleRebuilt(slot: Slot): void {
  if (slot.mesh === null) {
    slot.triangles = 0;
    slot.parts = 0;
    slot.paved = 0;
    slot.bytes = 0;
    slot.stale = false;
  }
}
