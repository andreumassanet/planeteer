import type * as THREE from 'three';
import type { TownGrid } from '../scenery/grid.ts';
import type { Placed } from '../scenery/index.ts';
import { parkedModelsSteps } from '../craft/parked.ts';
import { drain } from './budget.ts';
import { foldBay } from './near.ts';
import { unpublish } from './registry.ts';
import type { Registry } from './registry.ts';
import type { Slot } from './types.ts';

/**
 * A town's life in the streamer: raised a step at a time, built again with
 * its old mesh drawn and its old floor stood on until the new one stands, and
 * dropped.
 */
export interface Lifecycle {
  /** Raises a town whole, abandoning any build under way first. */
  raise(slot: Slot): void;
  /** Plans a town's plots whole, for `compare`. */
  planTown(slot: Slot, grid: TownGrid): { placed: Placed[] };
  /** Takes a town out: dissolved, or at once when `instant`. */
  drop(slot: Slot, instant?: boolean): void;
  /** Whether a town whose rank moved has to be built again to show it. */
  needsRebuild(slot: Slot): boolean;
  /**
   * Steps a town's build while `more` allows, beginning it if it is not the
   * one under way (which abandons that one); true once it stands, or once it
   * turned out to build nothing.
   */
  step(slot: Slot, near: boolean, more: () => boolean): boolean;
  /** Abandons the build under way: what stood stays standing, and is built again later. */
  endJob(): void;
  /** The town being built, or null. */
  jobSlot(): Slot | null;
  /** Whether the build under way is a near one. */
  jobNear(): boolean;
}

export function createLifecycle(
  registry: Registry,
  raiseSteps: (slot: Slot) => Generator<void, void, void>,
  warmSteps: (slot: Slot) => Generator<void, void, void>,
  planTownSteps: (slot: Slot, grid: TownGrid) => Generator<void, { placed: Placed[] }, void>,
  endPlanJob: () => void,
): Lifecycle {
  /**
   * One town built a step at a time over as many frames as it takes, near or
   * far, asking the frame's allowance between steps, so neither a city arriving
   * from the plane nor one walked into is one long frame. The raise publishes
   * nothing until its last step, so the town it replaces (`old`) stands, is
   * drawn and is stood on until then, and an abandoned build costs nothing but
   * the work.
   */
  let job: { slot: Slot; steps: Generator<void, void, void>; old: THREE.Mesh | null; near: boolean } | null = null;

  /** A town's steps: its region's variants first (and the parked craft for a peopled one), then the town. */
  function* townSteps(slot: Slot): Generator<void, void, void> {
    yield* warmSteps(slot);
    if (slot.peopled) yield* parkedModelsSteps();
    yield* raiseSteps(slot);
  }

  function endJob(): void {
    if (job === null) return;
    const { slot, old } = job;
    job.steps.return(undefined);
    job = null;
    // What stood goes on standing, and is built again when it is next served.
    if (old !== null && slot.mesh === old) slot.stale = true;
  }

  /** A build run to its end: the old mesh retired, or the slot emptied when nothing would stand. */
  function finish(slot: Slot, old: THREE.Mesh | null): void {
    if (old === null) return;
    if (slot.mesh === old) {
      // It would not build: nothing stands here, as after `drop`.
      unpublish(registry, slot);
      emptied(slot);
    }
    registry.retire(old, false);
    // A vehicle taken from the old town while the new one was built leaves its bay empty in this one too.
    for (const bay of slot.parked) if (!bay.hidden && registry.parkedTaken(bay.id)) foldBay(slot, bay);
  }

  function needsRebuild(slot: Slot): boolean {
    // A far town built near keeps its parked cars and stops publishing people,
    // so only kit assets, or a far build now near, need a rebuild.
    if (slot.mesh === null || slot.builtPeopled === slot.peopled) return false;
    return slot.style.assets !== undefined || slot.peopled;
  }

  function step(slot: Slot, near: boolean, more: () => boolean): boolean {
    // The steps share the town frame and the terraces with any other build.
    if (job !== null && job.slot !== slot) endJob();
    endPlanJob();
    job ??= { slot, steps: townSteps(slot), old: slot.mesh, near };
    const current = job;
    do {
      if (current.steps.next().done === true) {
        job = null;
        finish(slot, current.old);
        // Its rank may have moved while it was built.
        if (needsRebuild(slot)) slot.stale = true;
        return true;
      }
    } while (more());
    return false;
  }

  return {
    raise(slot) {
      endJob();
      endPlanJob();
      const old = slot.mesh;
      drain(townSteps(slot));
      finish(slot, old);
    },
    planTown(slot, grid) {
      endJob();
      endPlanJob();
      return drain(planTownSteps(slot, grid));
    },
    drop(slot, instant) {
      if (job?.slot === slot) endJob();
      drop(registry, slot, instant);
    },
    needsRebuild,
    step,
    endJob,
    jobSlot: () => job?.slot ?? null,
    jobNear: () => job?.near ?? false,
  };
}

/** Takes a town out: dissolved, or at once when `instant`. */
function drop(registry: Registry, slot: Slot, instant = false): void {
  const mesh = slot.mesh;
  if (mesh === null) return;
  // The floor goes with the mesh, or it is a plinth a player walks on over open ground.
  unpublish(registry, slot);
  registry.retire(mesh, instant);
  emptied(slot);
}

/** A slot with nothing standing counts nothing. */
function emptied(slot: Slot): void {
  slot.triangles = 0;
  slot.parts = 0;
  slot.paved = 0;
  slot.bytes = 0;
  slot.stale = false;
}
