import { PLANET_RADIUS } from '../../globe.ts';
import { floorReach } from '../../scenery/floor.ts';
import { streetBand } from '../../scenery/grid.ts';
import { solidField } from '../../scenery/solids.ts';
import type { TownGrid } from '../../scenery/grid.ts';
import type { Ground } from '../ground/build.ts';
import { urbanityOf } from '../rules.ts';
import type { Slot } from '../types.ts';
import { standBenches, standLamps, standParked, standPeople, standRackBikes, standSignals } from './furniture.ts';
import type { RaiseJob, RaiseKit } from './job.ts';
import { mergeSteps, placeTown, swapNearTrees } from './merge.ts';
import { standLone, standPlotsSteps } from './stand.ts';
import { dressStreets, hangOver } from './street.ts';

/**
 * A town raised in steps: it yields between the cells it plans, the plots it
 * stands, the courses of floor it lays and the parts it merges, so a caller
 * can stop between any two and come back next frame. Everything it touches
 * between two steps is its own (the slot, the town frame and the terraces),
 * which is why only one runs at a time.
 */
export function* raiseSteps(kit: RaiseKit, slot: Slot): Generator<void, void, void> {
  if (slot.mesh !== null || slot.failed) return;
  slot.builtPeopled = slot.peopled;
  slot.stale = false;

  const grid = yield* kit.squareSteps(slot);
  if (grid === null) return;
  yield;
  const placed = (yield* kit.planTownSteps(slot, grid)).placed;
  const job = openRaise(kit, slot, grid, placed);

  yield* standPlotsSteps(kit, job);
  standLone(kit, job);
  // What stood near is what the map draws.
  if (slot.builtPeopled) kit.plans.keepPlan(slot.index, kit.plans.slotPlan(slot, grid, job.solids, job.solidFlats, job.solidKinds, job.treesAt, job.pavedCells));

  slot.planned = placed.length;
  slot.drowned = job.drowned;
  slot.buried = job.buried;
  slot.onRelief = job.onRelief;
  slot.buildings = job.built.size;
  if (job.standing.length === 0) {
    // Nothing would stand, not even the centre building: marked failed so the streamer stops asking.
    slot.failed = true;
    return;
  }

  // The floor goes into the same buffer as the houses on it: one mesh, one draw call.
  const band = streetBand(grid, slot.ground.street);
  const ground = yield* kit.buildGroundSteps(slot, grid, band, urbanityOf(slot.place.pop), job.litPlots, job.pavedCells);
  slot.paved = ground.paved;
  publishFloor(kit, slot, grid, band, ground);

  standLamps(kit, job, ground);
  standSignals(kit, job, ground);
  standBenches(kit, job, ground);
  slot.folk = [];
  slot.parked = [];
  if (slot.peopled) {
    standPeople(kit, job, ground);
    standParked(kit, job, ground);
  }
  hangOver(kit, job, ground, band);
  dressStreets(kit, job, ground, band);
  standRackBikes(kit, job);
  if (slot.floor !== null) slot.floor.solids = job.solids.length > 0 ? solidField(job.solids) : null;

  const { cards, leafVertices } = swapNearTrees(kit, job);
  const buffer = yield* mergeSteps(job, ground);
  placeTown(kit, job, ground, buffer, cards, leafVertices);
}

function openRaise(kit: RaiseKit, slot: Slot, grid: TownGrid, placed: RaiseJob['placed']): RaiseJob {
  return {
    slot,
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
function publishFloor(kit: RaiseKit, slot: Slot, grid: TownGrid, band: number, ground: Ground): void {
  if (ground.terraces.size === 0) return;
  const { frame, registry } = kit;
  const span = grid.half * Math.SQRT2;
  slot.floor = {
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
  registry.floors.add(slot);
  registry.noteFloor(slot);
}
