import * as THREE from 'three';
import { BENCH_SIT_AHEAD } from '../../bench.ts';
import { biomeAt, biomeSample } from '../../biome.ts';
import { PARKED_CRAFT, PARKED_SLOT } from '../../craft/contract.ts';
import { PLANET_RADIUS } from '../../globe.ts';
import { GROUND_LIFT } from '../../scenery/ground.ts';
import { VARIANTS, rngFrom } from '../../scenery/index.ts';
import { placedSize, trafficFor } from '../../traffic/index.ts';
import type { Ground } from '../ground/build.ts';
import { solidOf } from '../plots.ts';
import { BENCH_PART, FOLK_STRIDE, LAMP_PART, RACK_FILL, SIGNAL_PART, TOWN_PARKED, TOWN_PEOPLE, urbanityOf } from '../rules.ts';
import type { Bay } from '../types.ts';
import { AXIS_Y, compose } from './job.ts';
import type { RaiseJob, RaiseKit } from './job.ts';

/**
 * What stands on the floor once it is laid: the street lamps, a city's
 * traffic lights, the benches, the town's people, its parked vehicles and the
 * bicycles in its racks. Placed after the floor because that is where the
 * streets are decided, and before the buffer is sized.
 */

/** The lamps: parts with a lit head, nearly all of them bright and never off. */
export function standLamps(kit: RaiseKit, job: RaiseJob, ground: Ground): void {
  const { slot } = job;
  const at = kit.scratch.at;
  for (let i = 0; i + 2 < ground.lamps.length; i += 3) {
    const rng = rngFrom(slot.seed, 'lamppost', i);
    const flat = kit.variants.variantOf(LAMP_PART, slot.style, rng.int(VARIANTS));
    if (flat === null) break;
    at.set(ground.lamps[i]!, ground.lamps[i + 1]!, ground.lamps[i + 2]!);
    const matrix = compose(kit.scratch, at, ground.lampYaws[i / 3] ?? 0, rng.range(0.94, 1.06));
    job.standing.push({ flat, matrix: matrix.clone(), glow: rng.range(0.82, 1) });
    job.vertices += flat.position.length / 3;
  }
}

export function standSignals(kit: RaiseKit, job: RaiseJob, ground: Ground): void {
  const { slot } = job;
  const at = kit.scratch.at;
  for (let i = 0; i + 3 < ground.signals.length; i += 4) {
    const rng = rngFrom(slot.seed, 'signal', i);
    const flat = kit.variants.variantOf(SIGNAL_PART, slot.style, rng.int(VARIANTS));
    if (flat === null) break;
    at.set(ground.signals[i]!, ground.signals[i + 1]!, ground.signals[i + 2]!);
    const matrix = compose(kit.scratch, at, ground.signals[i + 3]!, 1);
    job.standing.push({ flat, matrix: matrix.clone(), glow: 1 });
    job.vertices += flat.position.length / 3;
  }
}

/**
 * The benches, at their own size (the seat is the sitting clip's), each a
 * wall from the paving it stands on, published in the town's frame with the
 * spot a sitter takes.
 */
export function standBenches(kit: RaiseKit, job: RaiseJob, ground: Ground): void {
  const { slot } = job;
  const { frame } = kit;
  const at = kit.scratch.at;
  slot.benches = [];
  for (let i = 0; i + 3 < ground.benches.length; i += 4) {
    const rng = rngFrom(slot.seed, 'bench', i);
    const flat = kit.variants.variantOf(BENCH_PART, slot.style, rng.int(VARIANTS));
    if (flat === null) break;
    at.set(ground.benches[i]!, ground.benches[i + 1]!, ground.benches[i + 2]!);
    const yaw = ground.benches[i + 3]!;
    const matrix = compose(kit.scratch, at, yaw, 1);
    job.standing.push({ flat, matrix: matrix.clone(), glow: 0 });
    job.vertices += flat.position.length / 3;
    job.solids.push(solidOf(flat, at.x, at.z, yaw, 1, frame.origin.length() - PLANET_RADIUS + at.y - GROUND_LIFT));
    slot.benches.push({
      position: new THREE.Vector3(Math.sin(yaw) * BENCH_SIT_AHEAD, 0, Math.cos(yaw) * BENCH_SIT_AHEAD).add(at),
      facing: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      sink: 0,
      key: `bench:${slot.index}:${i / 4}`,
    });
  }
}

/** Where a vehicle that can be taken stands, for `pnpm seated`: on the floor a foot finds. */
export function logParked(kit: RaiseKit, craft: string, at: THREE.Vector3): void {
  const log = kit.registry.seatLog;
  if (log === null) return;
  const parkedAt = kit.scratch.parkedAt;
  parkedAt.copy(at).applyMatrix4(kit.frame.basis).add(kit.frame.origin);
  const radius = parkedAt.length();
  parkedAt.normalize();
  log.push({ id: `parked:${craft}`, x: parkedAt.x, y: parkedAt.y, z: parkedAt.z, radius, reach: 0, drawn: true });
}

/**
 * The town's own people, published for `folk.ts` rather than merged (a person
 * is a skinned character). The stride spreads a village's few people over its
 * streets rather than the square, and a pair is taken whole.
 */
export function standPeople(kit: RaiseKit, job: RaiseJob, ground: Ground): void {
  const { slot } = job;
  const { world, frame } = kit;
  const up = frame.up;
  const urbanity = urbanityOf(slot.place.pop);
  const warmth = biomeAt(
    up.x, up.y, up.z, slot.place.lat, slot.place.lon,
    Math.max(0, world.elevationAt(up)), biomeSample(),
  ).warmth;
  const regionId = slot.style.id;
  const wantFolk = TOWN_PEOPLE(urbanity);
  const spots = ground.folk.length / FOLK_STRIDE;
  const stride = Math.max(1, Math.floor(spots / Math.max(1, wantFolk)));
  let placedFolk = 0;
  let taken = -1;
  const f = ground.folk;
  for (let i = 0; i < spots && placedFolk < wantFolk; i += stride) {
    const tag = f[i * FOLK_STRIDE + 10]!;
    const first = tag === -1 ? i - 1 : i;
    for (let j = Math.max(first, taken + 1); j < first + (tag === 0 ? 1 : 2); j++) {
      const at = j * FOLK_STRIDE;
      const rng = rngFrom(slot.seed, 'person', j);
      const yaw = f[at + 9]!;
      // In the town's frame here; into the world's once the mesh is placed.
      slot.folk.push({
        key: `${slot.seed}|${j}`,
        position: new THREE.Vector3(f[at]!, f[at + 1]!, f[at + 2]!),
        quaternion: new THREE.Quaternion().setFromAxisAngle(AXIS_Y, Number.isNaN(yaw) ? rng.range(0, Math.PI * 2) : yaw),
        from: new THREE.Vector3(f[at + 3]!, f[at + 4]!, f[at + 5]!),
        to: new THREE.Vector3(f[at + 6]!, f[at + 7]!, f[at + 8]!),
        chatting: f[at + 10] !== 0,
        town: new THREE.Quaternion(),
        region: regionId,
        warmth,
        distance: 0,
      });
      placedFolk++;
      taken = j;
    }
  }
}

/**
 * What is parked at the kerbs, merged into the buffer at no draw call. A
 * vehicle must fit the town (its placed length against the town's radius).
 * What can be taken is parked as the craft that takes it, named before it is
 * built; one already taken leaves its bay laid out (`parkedLayout`) and its
 * wall as a ghost, so the town and its names are the same whoever drove off.
 * Every vehicle is a wall, its roof measured from the kerb it stands on.
 */
export function standParked(kit: RaiseKit, job: RaiseJob, ground: Ground): void {
  const { slot } = job;
  const { frame, variants, scratch, registry } = kit;
  const urbanity = urbanityOf(slot.place.pop);
  const style = trafficFor(slot.place.iso, kit.continentOf.get(slot.place.iso) ?? '', slot.place.lat);
  const longest = Math.max(8, slot.radius * 0.45);
  const mix = style.road.filter((entry) => {
    const found = variants.vehicleById.get(entry.item);
    return found !== undefined && placedSize(found)[0] <= longest;
  });
  const bays = ground.kerbs.length / 4;
  const wantParked = mix.length === 0 ? 0 : Math.min(bays, TOWN_PARKED(urbanity, style.density));
  const bayStride = Math.max(1, Math.floor(bays / Math.max(1, wantParked)));
  let placedCars = 0;
  for (let i = 0; i < bays && placedCars < wantParked; i += bayStride) {
    const rng = rngFrom(slot.seed, 'parked', i);
    const kind = rng.weighted(mix);
    const look = rng.int(VARIANTS);
    const craft = PARKED_CRAFT[kind];
    const id = craft === undefined || placedCars + PARKED_SLOT > 99 ? null : `${craft}:${slot.index}:${placedCars + PARKED_SLOT}`;
    const flat = id === null ? variants.parkedVariant(style, kind, look) : variants.machineVariant(id, kind);
    if (flat === null) break;
    const x = ground.kerbs[i * 4]!;
    const y = ground.kerbs[i * 4 + 1]!;
    const z = ground.kerbs[i * 4 + 2]!;
    const yaw = ground.kerbs[i * 4 + 3]!;
    const solid = solidOf(flat, x, z, yaw, 1, frame.origin.length() - PLANET_RADIUS + y - GROUND_LIFT);
    placedCars++;
    job.parkedLayout.push(x, z, Math.hypot(flat.box.maxX - flat.box.minX, flat.box.maxZ - flat.box.minZ) * 0.5, flat.height);
    if (id !== null && registry.parkedTaken(id)) {
      job.parkedGhosts.push(solid);
      job.takenVertices += flat.position.length / 3;
      continue;
    }
    job.solids.push(solid);
    scratch.local.set(x, y, z);
    const matrix = compose(scratch, scratch.local, yaw, 1);
    let bay: Bay | undefined;
    if (id !== null) {
      // In the town's frame here; into the world's once the mesh is placed.
      bay = {
        id,
        model: craft!,
        position: scratch.local.clone(),
        forward: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
        paint: flat.paint ?? null,
        start: 0,
        count: 0,
        glassStart: 0,
        glassCount: 0,
        solid,
        hidden: false,
      };
      slot.parked.push(bay);
      logParked(kit, craft!, scratch.local);
    }
    job.standing.push({ flat, matrix: matrix.clone(), glow: 0, bay });
    job.vertices += flat.position.length / 3;
  }
}

/**
 * The bicycles in the racks: a share of the slots (`RACK_FILL`), each drawn
 * off the town's seed, holds one that can be taken, named after the kerb's
 * cars and counting every car placed and bicycle stood. Each is a wall.
 */
export function standRackBikes(kit: RaiseKit, job: RaiseJob): void {
  const { slot } = job;
  const { frame, variants, scratch, registry } = kit;
  if (slot.bikeSlots.length === 0) return;
  let stood = 0;
  const first = PARKED_SLOT + job.parkedLayout.length / 4;
  for (let k = 0; k < slot.bikeSlots.length && first + stood <= 99; k++) {
    if (!rngFrom(slot.seed, 'rack-bike', k).chance(RACK_FILL)) continue;
    const rack = slot.bikeSlots[k]!;
    const id = `bicycle:${slot.index}:${first + stood++}`;
    const flat = variants.machineVariant(id, 'bicycle');
    if (flat === null) break;
    if (registry.parkedTaken(id)) continue;
    const yaw = Math.atan2(rack.forward.x, rack.forward.z);
    const solid = solidOf(flat, rack.position.x, rack.position.z, yaw, 1, frame.origin.length() - PLANET_RADIUS + rack.position.y - GROUND_LIFT);
    job.solids.push(solid);
    scratch.local.copy(rack.position);
    const matrix = compose(scratch, scratch.local, yaw, 1);
    const bay: Bay = {
      id,
      model: 'bicycle',
      position: scratch.local.clone(),
      forward: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      paint: null,
      start: 0,
      count: 0,
      glassStart: 0,
      glassCount: 0,
      solid,
      hidden: false,
    };
    slot.parked.push(bay);
    job.standing.push({ flat, matrix: matrix.clone(), glow: 0, bay });
    job.vertices += flat.position.length / 3;
    logParked(kit, 'bicycle', rack.position);
  }
}
