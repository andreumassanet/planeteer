import * as THREE from 'three';
import { BENCH_DEPTH, BENCH_LONGEST, BENCH_SIT_AHEAD } from '../../bench.ts';
import { biomeAt, biomeSample } from '../../biome.ts';
import { PARKED_CRAFT, PARKED_SLOT } from '../../craft/contract.ts';
import { PLANET_RADIUS } from '../../globe.ts';
import { flightAt } from '../../scenery/floor.ts';
import { cellIndex, cornerOffset } from '../../scenery/grid.ts';
import { GROUND_LIFT, cellKey } from '../../scenery/ground.ts';
import type { Solid } from '../../scenery/solids.ts';
import { VARIANTS, rngFrom } from '../../scenery/index.ts';
import { placedSize, trafficFor } from '../../traffic/index.ts';
import type { Ground } from '../ground/build.ts';
import { solidOf } from '../plots.ts';
import { BENCH_PART, FOLK_STRIDE, LAMP_PART, RACK_FILL, SIGNAL_PART, TOWN_PARKED, TOWN_PEOPLE, urbanityOf } from '../rules.ts';
import type { Bay, FlatVariant } from '../types.ts';
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

/**
 * A city's traffic lights, their lamps dark in the merged town: which one is
 * lit is the clock's (`signals.ts`), drawn over them by `signal-lamps.ts`
 * from the heads published here.
 */
export function standSignals(kit: RaiseKit, job: RaiseJob, ground: Ground): void {
  const { slot } = job;
  const at = kit.scratch.at;
  for (let i = 0; i + 3 < ground.signals.length; i += 4) {
    const rng = rngFrom(slot.seed, 'signal', i);
    const lit = kit.variants.variantOf(SIGNAL_PART, slot.style, rng.int(VARIANTS));
    if (lit === null) break;
    const { flat, heads } = darkSignal(lit);
    at.set(ground.signals[i]!, ground.signals[i + 1]!, ground.signals[i + 2]!);
    const yaw = ground.signals[i + 3]!;
    const matrix = compose(kit.scratch, at, yaw, 1);
    job.standing.push({ flat, matrix: matrix.clone(), glow: 0 });
    job.vertices += flat.position.length / 3;
    // The lamps face the model's -x: the traffic that sees them drives along that axis.
    if (heads[9]! <= 0) continue;
    const facing = kit.scratch.local.set(-1, 0, 0).applyAxisAngle(AXIS_Y, yaw);
    const axis = Math.abs(facing.x) >= Math.abs(facing.z) ? 0 : 1;
    for (let k = 0; k < 3; k++) {
      at.set(heads[k * 3]!, heads[k * 3 + 1]!, heads[k * 3 + 2]!).applyMatrix4(matrix);
      job.signalHeads.push(at.x, at.y, at.z);
    }
    job.signalHeads.push(axis, heads[9]!, facing.x, facing.y, facing.z);
  }
}

/** How far behind a bench a building's wall must keep: room to walk past its back, and its doors and windows left in sight. */
const BENCH_WALL_GAP = 1.6;
/** How far beyond its ends a bench keeps off a wall behind it. */
const BENCH_END_GAP = 0.8;
/** The steps a bench is slid along its pavement, away from its lamp's crossing, to find a free stretch. */
const BENCH_SLIDE = [0, 1.2, 2.4, 3.6, 4.8] as const;

const inside = (solid: Solid, x: number, z: number): boolean => {
  const dx = x - solid.x;
  const dz = z - solid.z;
  if (solid.round) return dx * dx + dz * dz <= solid.hx * solid.hx;
  return Math.abs(dx * solid.cos + dz * solid.sin) <= solid.hx && Math.abs(-dx * solid.sin + dz * solid.cos) <= solid.hz;
};

/**
 * Where along its pavement a bench may stand: the first of `BENCH_SLIDE` away
 * from its crossing where no wall stands behind it within `BENCH_WALL_GAP`
 * (so it never sits against a door or a window), nothing stands where it
 * would, and the paving is the same terrace, clear of a flight, a lamp, a
 * gate's mouth and the water. Null where none is.
 */
function benchSpot(kit: RaiseKit, job: RaiseJob, ground: Ground, x: number, z: number, yaw: number): [number, number] | null {
  const { grid } = job;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // Along the bench, and which way along is away from the crossing it was set beside.
  const ax = fz;
  const az = -fx;
  const along = Math.abs(ax) > 0.5 ? x : z;
  const line = Math.round(along / grid.pitch + 0.5 + grid.shift);
  const away = Math.sign(along - cornerOffset(grid, line)) || 1;
  const level = ground.terraces.get(cellKey(cellIndex(grid, x), cellIndex(grid, z)));
  const walls = job.solidFlats.length;
  const half = BENCH_LONGEST / 2;
  for (const step of BENCH_SLIDE) {
    const bx = x + ax * away * step;
    const bz = z + az * away * step;
    if (ground.terraces.get(cellKey(cellIndex(grid, bx), cellIndex(grid, bz))) !== level) continue;
    if (kit.frame.blocked(bx, bz) || kit.frame.wetAt(bx, bz) || flightAt(ground.field, bx, bz, half + 0.3) !== null) continue;
    if (ground.mouths.some(([x0, x1, z0, z1]) => bx > x0 - half && bx < x1 + half && bz > z0 - half && bz < z1 + half)) continue;
    let clear = true;
    for (let l = 0; l + 2 < ground.lamps.length && clear; l += 3) {
      if (Math.hypot(ground.lamps[l]! - bx, ground.lamps[l + 2]! - bz) < half + 0.5) clear = false;
    }
    // The bench's own ground and the strip behind it, sampled: its ends and middle, from its front back past its gap.
    for (const u of [-half - BENCH_END_GAP, -half, 0, half, half + BENCH_END_GAP]) {
      for (const v of [BENCH_DEPTH / 2, 0, -BENCH_DEPTH / 2, -BENCH_DEPTH / 2 - BENCH_WALL_GAP * 0.5, -BENCH_DEPTH / 2 - BENCH_WALL_GAP]) {
        if (!clear) break;
        const px = bx + ax * u + fx * v;
        const pz = bz + az * u + fz * v;
        const own = Math.abs(u) <= half && v >= -BENCH_DEPTH / 2;
        // Behind it, only the buildings' walls; where it stands, anything already standing.
        const count = own ? job.solids.length : walls;
        for (let s = 0; s < count; s++) {
          if (inside(job.solids[s]!, px, pz)) {
            clear = false;
            break;
          }
        }
      }
    }
    if (clear) return [bx, bz];
  }
  return null;
}

/**
 * The benches, at their own size (the seat is the sitting clip's), each a
 * wall from the paving it stands on, published in the town's frame with the
 * spot a sitter takes. One that would stand against a building's front is
 * slid along its pavement clear of it, or left out (`benchSpot`).
 */
export function standBenches(kit: RaiseKit, job: RaiseJob, ground: Ground): void {
  const { slot } = job;
  const { frame } = kit;
  const at = kit.scratch.at;
  for (let i = 0; i + 3 < ground.benches.length; i += 4) {
    const rng = rngFrom(slot.seed, 'bench', i);
    const flat = kit.variants.variantOf(BENCH_PART, slot.style, rng.int(VARIANTS));
    if (flat === null) break;
    const yaw = ground.benches[i + 3]!;
    const spot = benchSpot(kit, job, ground, ground.benches[i]!, ground.benches[i + 2]!, yaw);
    if (spot === null) continue;
    at.set(spot[0], ground.benches[i + 1]!, spot[1]);
    const matrix = compose(kit.scratch, at, yaw, 1);
    job.standing.push({ flat, matrix: matrix.clone(), glow: 0 });
    job.vertices += flat.position.length / 3;
    job.solids.push(solidOf(flat, at.x, at.z, yaw, 1, frame.origin.length() - PLANET_RADIUS + at.y - GROUND_LIFT));
    job.benches.push({
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
      job.folk.push({
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
 * Every vehicle is a wall, its roof measured from the kerb it stands on. A
 * step a vehicle, since the first of a kind and paint builds its buffer.
 */
export function* standParkedSteps(kit: RaiseKit, job: RaiseJob, ground: Ground): Generator<void, void, void> {
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
    if (placedCars > 0) yield;
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
      job.parked.push(bay);
      logParked(kit, craft!, scratch.local);
    }
    job.standing.push({ flat, matrix: matrix.clone(), glow: 0, bay });
    job.vertices += flat.position.length / 3;
  }
}

/**
 * The bicycles in the racks: a share of the slots (`RACK_FILL`), each drawn
 * off the town's seed, holds one that can be taken, named after the kerb's
 * cars and counting every car placed and bicycle stood. Each is a wall. A
 * step a bicycle.
 */
export function* standRackBikesSteps(kit: RaiseKit, job: RaiseJob): Generator<void, void, void> {
  const { slot } = job;
  const { frame, variants, scratch, registry } = kit;
  if (job.bikeSlots.length === 0) return;
  let stood = 0;
  const first = PARKED_SLOT + job.parkedLayout.length / 4;
  for (let k = 0; k < job.bikeSlots.length && first + stood <= 99; k++) {
    if (!rngFrom(slot.seed, 'rack-bike', k).chance(RACK_FILL)) continue;
    if (stood > 0) yield;
    const rack = job.bikeSlots[k]!;
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
    job.parked.push(bay);
    job.standing.push({ flat, matrix: matrix.clone(), glow: 0, bay });
    job.vertices += flat.position.length / 3;
    logParked(kit, 'bicycle', rack.position);
  }
}

/**
 * Numbers a traffic light publishes: its red, amber and green lamps' centres, the axis its traffic
 * drives along, a lamp's radius, and the way its lamps face.
 */
export const SIGNAL_HEAD = 14;
/** Where the lamps sit up the lit housing, as shares of its height: Kenney's red, amber and green. */
const LAMP_AT = [0.787, 0.5, 0.213] as const;
/** A lamp's radius as a share of the housing's height. */
const LAMP_RADIUS = 0.11;
/** How bright an unlit lamp's glass stays. */
const LAMP_DARK = 0.35;

const darkSignals = new WeakMap<FlatVariant, { flat: FlatVariant; heads: Float32Array }>();

/**
 * A traffic light's variant with its lamps put out — no glow, the glass
 * dimmed — and where its three lamps are in the part's own frame, read off
 * the lit housing: the lamps are on its -x face, one above another.
 */
function darkSignal(lit: FlatVariant): { flat: FlatVariant; heads: Float32Array } {
  const known = darkSignals.get(lit);
  if (known !== undefined) return known;
  const p = lit.position;
  let x0 = Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let v = 0; v < p.length / 3; v++) {
    if (lit.glow[v * 2]! === 0) continue;
    x0 = Math.min(x0, p[v * 3]!);
    y0 = Math.min(y0, p[v * 3 + 1]!);
    y1 = Math.max(y1, p[v * 3 + 1]!);
    z0 = Math.min(z0, p[v * 3 + 2]!);
    z1 = Math.max(z1, p[v * 3 + 2]!);
  }
  const tall = Number.isFinite(y0) ? y1 - y0 : 0;
  const radius = tall * LAMP_RADIUS;
  const zc = (z0 + z1) / 2;
  const heads = new Float32Array(10);
  for (let k = 0; k < 3; k++) {
    heads[k * 3] = x0 - radius * 0.2;
    heads[k * 3 + 1] = y0 + tall * LAMP_AT[k]!;
    heads[k * 3 + 2] = zc;
  }
  heads[9] = radius;
  const color = lit.color.slice();
  const glow = lit.glow.slice();
  for (let v = 0; v < p.length / 3; v++) {
    if (glow[v * 2]! === 0) continue;
    glow[v * 2] = 0;
    glow[v * 2 + 1] = 0;
    // The lamp's glass, not the housing round it: on the face, near the middle.
    if (p[v * 3]! - x0 < radius * 0.5 && Math.abs(p[v * 3 + 2]! - zc) < radius * 1.5) {
      for (let c = 0; c < 3; c++) color[v * 3 + c]! *= LAMP_DARK;
    }
  }
  const made = { flat: { ...lit, color, glow, emits: false }, heads };
  darkSignals.set(lit, made);
  return made;
}
