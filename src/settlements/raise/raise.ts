import { PLANET_RADIUS } from '../../globe.ts';
import { floorReach } from '../../scenery/floor.ts';
import { streetBand } from '../../scenery/grid.ts';
import { solidField } from '../../scenery/solids.ts';
import type { TownGrid } from '../../scenery/grid.ts';
import type { Ground } from '../ground/build.ts';
import { urbanityOf } from '../rules.ts';
import type { Slot, SlotFloor } from '../types.ts';
import { standStreetFolk } from './street-folk.ts';
import { standBenches, standLamps, standParkedSteps, standPeople, standRackBikesSteps, standSignals } from './furniture.ts';
import type { RaiseJob, RaiseKit } from './job.ts';
import { commitTown, mergeSteps, swapNearTrees, townMeshSteps } from './merge.ts';
import { standLone, standPlotsSteps } from './stand.ts';
import { dressStreetsSteps, hangOverSteps } from './street.ts';

/**
 * A town raised in steps: it yields between the cells it plans, the plots it
 * stands, the courses of floor it lays and the parts it merges, so a caller
 * can stop between any two and come back next frame. Everything it touches
 * between two steps is its own (the job, the town frame and the terraces),
 * which is why only one runs at a time. Nothing is published until the last
 * step, which trades whatever the slot had standing for the new town at once
 * (`commitTown`): a town built again goes on answering a foot, a wall and the
 * people's queries as it was until then, and one abandoned half way leaves
 * nothing behind. The old mesh is the caller's to retire.
 */
export function* raiseSteps(kit: RaiseKit, slot: Slot): Generator<void, void, void> {
  if (slot.failed) return;
  slot.stale = false;

  const grid = yield* kit.squareSteps(slot);
  if (grid === null) return;
  yield;
  const placed = (yield* kit.planTownSteps(slot, grid)).placed;
  const job = openRaise(kit, slot, grid, placed);

  yield* standPlotsSteps(kit, job);
  standLone(kit, job);
  // What stood near is what the map draws.
  if (job.peopled) kit.plans.keepPlan(slot.index, kit.plans.slotPlan(slot, grid, job.solids, job.solidFlats, job.solidKinds, job.treesAt, job.pavedCells));
  if (job.standing.length === 0) {
    slot.planned = placed.length;
    slot.drowned = job.drowned;
    slot.buried = job.buried;
    slot.buildings = 0;
    // Nothing would stand, not even the centre building: marked failed so the streamer stops asking.
    slot.failed = true;
    return;
  }
  yield;

  // The floor goes into the same buffer as the houses on it: one mesh, one draw call.
  const band = streetBand(grid, slot.ground.street);
  const ground = yield* kit.buildGroundSteps(slot, grid, band, urbanityOf(slot.place.pop), job.litPlots, job.pavedCells);
  job.floor = floorOf(kit, grid, band, ground);
  yield;

  standLamps(kit, job, ground);
  standSignals(kit, job, ground);
  yield;
  standBenches(kit, job, ground);
  if (job.peopled) {
    yield;
    standPeople(kit, job, ground);
    yield;
    yield* standParkedSteps(kit, job, ground);
  }
  yield* hangOverSteps(kit, job, ground, band);
  yield* dressStreetsSteps(kit, job, ground, band);
  if (job.peopled) standStreetFolk(kit, job, ground, job.shopDoors);
  yield* standRackBikesSteps(kit, job);
  yield;
  if (job.floor !== null) job.floor.solids = job.solids.length > 0 ? solidField(job.solids) : null;

  const { cards, leafVertices } = swapNearTrees(kit, job);
  yield;
  const buffer = yield* mergeSteps(job, ground);
  const town = yield* townMeshSteps(kit, job, buffer, cards, leafVertices);
  commitTown(kit, job, ground, town);
}

function openRaise(kit: RaiseKit, slot: Slot, grid: TownGrid, placed: RaiseJob['placed']): RaiseJob {
  return {
    slot,
    peopled: slot.peopled,
    floor: null,
    folk: [],
    parked: [],
    benches: [],
    bikeSlots: [],
    signalHeads: [],
    shopDoors: [],
    grid,
    placed,
    standing: [],
    vertices: 0,
    drowned: 0,
    buried: 0,
    onRelief: false,
    built: new Set(),
    pavedCells: new Set(),
    litPlots: [],
    solids: [],
    solidFlats: [],
    solidKinds: [],
    treesAt: [],
    overheadHosts: [],
    dressFronts: [],
    bakedParts: new Set(Object.values(kit.styleFor(slot).assets ?? {})),
    parkedLayout: [],
    parkedGhosts: [],
    takenVertices: 0,
    overheadSpots: [],
  };
}

/**
 * The floor, in the frame it was laid in, so a foot can find it: bounded by
 * the square's half-diagonal plus one course of edge slope. Its walls are
 * filled in once everything with a wall has been placed.
 */
function floorOf(kit: RaiseKit, grid: TownGrid, band: number, ground: Ground): SlotFloor | null {
  if (ground.terraces.size === 0) return null;
  const { frame } = kit;
  const span = grid.half * Math.SQRT2;
  return {
    up: frame.up.clone(),
    across: frame.across.clone(),
    north: frame.north.clone(),
    field: ground.field,
    cosBound: Math.cos((span + floorReach(ground.field)) / PLANET_RADIUS),
    solids: null,
    grid,
    band,
    lawn: ground.lawn,
    mouths: ground.mouths,
  };
}
