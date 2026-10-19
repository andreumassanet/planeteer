import * as THREE from 'three';
import type { World } from '../../geo.ts';
import type { LandProbe } from '../../land-probe.ts';
import type { Place } from '../../places.ts';
import type { TownGrid } from '../../scenery/grid.ts';
import type { TownFrame } from '../frame.ts';
import type { LitPlot, Slot } from '../types.ts';
import { collectEmitters, gateMouths, markLawns, placeLamps, placeSignals } from './fixtures.ts';
import { flightSteps } from './flights.ts';
import { createGroundColours, openGround } from './job.ts';
import type { Ground, GroundScratch } from './job.ts';
import { pavingSteps } from './paving.ts';
import { streetLifeSteps } from './street-life.ts';
import { apronSteps, wallSteps } from './walls.ts';
import { NO_EMITTERS, createGroundWriter } from './writer.ts';

export type { Ground } from './job.ts';

/** Builds a town's floor, a step at a time. */
export type GroundBuilder = (
  slot: Slot,
  grid: TownGrid,
  band: number,
  urbanity: number,
  litPlots: readonly LitPlot[],
  pavedCells: ReadonlySet<number>,
) => Generator<void, Ground, void>;

/**
 * The floor of one settlement: its square, every cell the terraces allow, in
 * the same buffer as what stands on it.
 *
 * The paving is a street plan drawn flush on each terrace; the edge slope ends
 * it (a quay's face where the sea does); a street crossing a riser climbs a
 * ramp or a flight; a road's street flares at its gate. All of it is drawn out
 * of the field `buildFloor` makes, which is what `floorLiftAt` reads, so the
 * surface a foot finds is this one. Lamps, benches, signals, people and parked
 * vehicles are placed here as positions, since only the floor knows where the
 * streets are.
 */
export function createGroundBuilder(
  world: World,
  frame: TownFrame,
  landProbe: LandProbe | null,
  roadGates: ReadonlyMap<Place, number[]>,
): GroundBuilder {
  const scratch: GroundScratch = {
    colours: createGroundColours(),
    writer: createGroundWriter(),
    dir: new THREE.Vector3(),
    local: new THREE.Vector3(),
    slopeDir: new THREE.Vector3(),
  };
  return function* buildGroundSteps(slot, grid, band, urbanity, litPlots, pavedCells) {
    const roads = roadGates.get(slot.place) ?? [];
    const { job, out } = yield* openGround(world, frame, scratch, landProbe, roads, slot, grid, band);
    if (job === null) return out;
    gateMouths(job);
    markLawns(job, pavedCells);
    placeLamps(job, urbanity);
    placeSignals(job);
    collectEmitters(job, litPlots);
    yield* pavingSteps(job, pavedCells);
    yield* wallSteps(job);
    yield* apronSteps(job);
    yield* flightSteps(job);
    yield* streetLifeSteps(job, urbanity);
    scratch.writer.lit = NO_EMITTERS;
    return out;
  };
}
