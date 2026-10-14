import { PLANET_RADIUS } from '../../globe.ts';
import { PLANT_SEATING, drawnFootprint } from '../../land-probe.ts';
import { planGap } from '../../landmark-ground.ts';
import { cellCentre, cellIndex } from '../../scenery/grid.ts';
import { GROUND_LIFT, cellKey } from '../../scenery/ground.ts';
import { VARIANTS, rngFrom } from '../../scenery/index.ts';
import type { Placed } from '../../scenery/index.ts';
import { MAX_SLOPE, gradeAt, reliefAt } from '../../terrain.ts';
import { INSTANCE_BED, INSTANCE_DIM } from '../flatten.ts';
import { pavedUnder, solidOf } from '../plots.ts';
import { KIND_OF, footprintOf } from '../rules.ts';
import type { FlatVariant } from '../types.ts';
import { compose } from './job.ts';
import type { RaiseJob, RaiseKit } from './job.ts';

/**
 * The first pass of a raise: the ground under every planned plot, keeping
 * what stands and refusing what is in the sea or too steep, before the buffer
 * is sized (a headland can lose half its plots to the sea).
 */
export function* standPlotsSteps(kit: RaiseKit, job: RaiseJob): Generator<void, void, void> {
  for (const entry of job.placed) {
    yield;
    const flat = kit.variants.variantOf(entry.partId, job.slot.style, entry.variant);
    if (flat === null) continue;
    standPlot(kit, job, entry, flat);
  }
}

/**
 * Where a plot of the country round the town is seated: bedded as the wood
 * is, to the lowest of the drawn land under its footprint (or of the relief
 * where the probe has not gathered yet), out of the sea and off a cliff.
 */
function countryLevel(kit: RaiseKit, job: RaiseJob, entry: Placed, flat: FlatVariant, footprint: number, elevation: number): number | 'drowned' | 'buried' {
  const { frame, landProbe, scratch, registry } = kit;
  const { direction, slope, drawnSeat } = scratch;
  gradeAt(direction, frame.across, frame.north, Math.max(1, footprint), slope);
  if (slope.grade > MAX_SLOPE) return 'buried';
  const reach = Math.max(1, footprint * 0.6);
  const seat = landProbe === null ? 'unknown' : drawnFootprint(landProbe, direction, frame.across, frame.north, reach, drawnSeat);
  if (seat === 'water') return 'drowned';
  let level: number;
  if (seat === 'drawn') level = drawnSeat.lowest - PLANET_RADIUS;
  else {
    const relief = reliefAt(direction.x, direction.y, direction.z);
    level = elevation - relief + Math.min(relief, slope.lowest);
    if (landProbe !== null) job.onRelief = true;
  }
  level -= flat.height * entry.scale * PLANT_SEATING + GROUND_LIFT;
  registry.seatLog?.push({ id: entry.partId, x: direction.x, y: direction.y, z: direction.z, radius: PLANET_RADIUS + level + GROUND_LIFT, reach, drawn: seat === 'drawn' });
  return level;
}

/**
 * One planned plot. Everything in the square stands on its cell's terrace,
 * refused where the cell has none (`MAX_CUT`); the country round the town
 * stands on the land. Only the built kinds claim their cell, get a wall and
 * pave under a block.
 */
function standPlot(kit: RaiseKit, job: RaiseJob, entry: Placed, flat: FlatVariant): void {
  const { frame, world, scratch } = kit;
  const { slot } = job;
  const footprint = footprintOf(entry.partId) * entry.scale;
  frame.directionAt(entry.plot.x, entry.plot.z, scratch.direction);
  const elevation = world.elevationAt(scratch.direction);
  // Elevation 0 is the sea, and the shoreline is where a settlement stops.
  if (elevation <= 0) {
    job.drowned++;
    return;
  }
  const country = kit.inTheCountry.has(entry);
  let level: number | null;
  if (country) {
    const seated = countryLevel(kit, job, entry, flat, footprint, elevation);
    if (seated === 'drowned') {
      job.drowned++;
      return;
    }
    if (seated === 'buried') {
      job.buried++;
      return;
    }
    level = seated;
  } else {
    level = frame.terraceAt(entry.plot.col, entry.plot.row);
  }
  if (level === null) {
    job.buried++;
    return;
  }

  const kind = KIND_OF.get(entry.partId);
  const standsOnFloor = kind === 'dwelling' || kind === 'block' || kind === 'civic';
  frame.directionAt(entry.plot.x, entry.plot.z, scratch.direction);
  const seat = level + GROUND_LIFT;
  scratch.local
    .copy(scratch.direction)
    .multiplyScalar(PLANET_RADIUS + seat)
    .sub(frame.origin)
    .applyMatrix4(frame.inverse);
  compose(scratch, scratch.local, entry.plot.yaw, entry.scale);
  // Seeded on the plot, and drawn only where there is a window to dim.
  const lit = rngFrom(slot.seed, 'lit', entry.plot.col, entry.plot.row);
  const shine = flat.emits ? lit.range(INSTANCE_DIM, 1) : 0;
  const bedShift = flat.emits ? Math.round(lit.jitter() * INSTANCE_BED) : 0;
  job.standing.push({ flat, matrix: scratch.transform.clone(), glow: shine, bed: bedShift });
  job.vertices += flat.position.length / 3;
  if (kind === 'tree') job.treesAt.push(entry.plot.x, entry.plot.z, footprint);
  if (shine > 0) {
    job.litPlots.push({
      // The frame the floor's vertices are in, which is `local`'s, not the tangent-plane coordinate.
      x: scratch.local.x,
      z: scratch.local.z,
      radius: footprint,
      strength: shine,
      // The building's own hour, clamped short of `BED_ALWAYS`.
      bed: Math.max(0, Math.min(254, flat.litBed + bedShift)),
    });
  }
  if (!standsOnFloor) return;
  job.built.add(cellKey(entry.plot.col, entry.plot.row));
  const solid = solidOf(flat, entry.plot.x, entry.plot.z, entry.plot.yaw, entry.scale, level);
  const matrix = job.standing[job.standing.length - 1]!.matrix;
  job.solids.push(solid);
  job.solidFlats.push(flat);
  job.solidKinds.push(kind === 'block' ? 1 : kind === 'civic' ? 2 : 0);
  if (!country) job.overheadHosts.push({ position: flat.position, matrix });
  if (!country) job.dressFronts.push({ flat, matrix, solid, kind: kind ?? 'dwelling', baked: job.bakedParts.has(entry.partId) });
  // A block and a civic building stand on paving, a house in its yard.
  if (kind !== 'dwelling') pavedUnder(solid, job.grid, job.pavedCells);
}

/**
 * The last building, at the exact centre, when nothing else would stand: a
 * place that builds nothing reads as a streamer bug. The region's smallest
 * house, with no fit test, on the terrace the centre cell would have had if
 * its cut were allowed. Only a landmark on the spot refuses it.
 */
export function standLone(kit: RaiseKit, job: RaiseJob): void {
  const { frame, scratch } = kit;
  const { slot, grid } = job;
  const centreClear = !frame.parcelAt(0, 0) && frame.keepouts.every((keepout) => planGap(keepout.shape, -keepout.x, -keepout.z) > keepout.radius);
  if (job.built.size !== 0 || !centreClear) return;
  const mix = kit.styleFor(slot).buildings;
  const lone = cellIndex(grid, 0);
  const loneAt = cellCentre(grid, lone);
  let smallest: string | null = null;
  for (const entry of mix) {
    if (smallest === null || footprintOf(entry.item) < footprintOf(smallest)) smallest = entry.item;
  }
  const rng = rngFrom(slot.seed, 'lone-building');
  const flat = smallest === null ? null : kit.variants.variantOf(smallest, slot.style, rng.int(VARIANTS));
  if (flat === null) return;
  frame.terraces.set(cellKey(lone, lone), frame.base);
  frame.directionAt(loneAt, loneAt, scratch.direction);
  scratch.local
    .copy(scratch.direction)
    .multiplyScalar(PLANET_RADIUS + frame.base + GROUND_LIFT)
    .sub(frame.origin)
    .applyMatrix4(frame.inverse);
  const loneYaw = Math.floor(rng.unit() * 4) * (Math.PI / 2);
  compose(scratch, scratch.local, loneYaw, 1);
  const shine = flat.emits ? rng.range(INSTANCE_DIM, 1) : 0;
  const bedShift = flat.emits ? Math.round(rng.jitter() * INSTANCE_BED) : 0;
  job.standing.push({ flat, matrix: scratch.transform.clone(), glow: shine, bed: bedShift });
  job.vertices += flat.position.length / 3;
  if (shine > 0) {
    job.litPlots.push({
      x: scratch.local.x,
      z: scratch.local.z,
      radius: footprintOf(smallest!),
      strength: shine,
      bed: Math.max(0, Math.min(254, flat.litBed + bedShift)),
    });
  }
  job.built.add(cellKey(lone, lone));
  job.solids.push(solidOf(flat, loneAt, loneAt, loneYaw, 1, frame.base));
  job.solidFlats.push(flat);
  job.solidKinds.push(0);
}
