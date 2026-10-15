import * as THREE from 'three';
import { BENCH_LONGEST } from '../../bench.ts';
import { PLANET_RADIUS } from '../../globe.ts';
import { floorLiftAt } from '../../scenery/floor.ts';
import { GROUND_LIFT } from '../../scenery/ground.ts';
import { hangOverheadSteps } from '../../scenery/overhead.ts';
import { dressTownSteps, streetDressingEnabled } from '../../scenery/street-dressing.ts';
import { crownOf } from '../../scenery/tree-forms.ts';
import type { Ground } from '../ground/build.ts';
import { timedSteps } from '../budget.ts';
import { rectOf } from '../plots.ts';
import { CLEAR_FOLK, CLEAR_LAMP, DRESS_LEAST, DRESS_MOST, DRESS_SHARE, KIND_OF, footprintOf, urbanityOf } from '../rules.ts';
import type { FlatVariant } from '../types.ts';
import type { RaiseJob, RaiseKit } from './job.ts';

/**
 * A near town's street level: what hangs over its streets (bunting, lanterns,
 * washing, wires) and what dresses its fronts and pavements, each one run of
 * vertices in the town's frame, laid after everything it keeps off.
 */

/** A code-built run of vertices as a standing variant: its ink is its own normal. */
function runOf(run: { position: Float32Array; normal: Float32Array; color: Float32Array; glow: Uint8Array; emits: boolean; triangles: number }, count: number): FlatVariant {
  return {
    position: run.position,
    normal: run.normal,
    color: run.color,
    outline: run.normal,
    glow: run.glow,
    emits: run.emits,
    litBed: 0,
    triangles: run.triangles,
    height: 0,
    box: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    pieceVertices: [count],
  };
}

/**
 * What hangs over the streets (`scenery/overhead.ts`), keeping its poles off
 * every lamp, bench, bay and person laid out before it, and its lines out of
 * the near trees' crowns. In steps, a street at a time.
 */
export function* hangOverSteps(kit: RaiseKit, job: RaiseJob, ground: Ground, band: number): Generator<void, void, void> {
  const { slot, grid } = job;
  const { frame, world } = kit;
  slot.overhead = null;
  if (!job.peopled || job.floor === null) return;
  let ms = 0;
  const began = performance.now();
  const field = job.floor.field;
  const overheadDir = new THREE.Vector3();
  const overheadAt = new THREE.Vector3();
  const keep: number[] = [];
  for (let i = 0; i + 2 < ground.lamps.length; i += 3) keep.push(ground.lamps[i]!, ground.lamps[i + 2]!, 1.2);
  for (let i = 0; i + 3 < ground.signals.length; i += 4) keep.push(ground.signals[i]!, ground.signals[i + 2]!, 1.2);
  for (let i = 0; i + 3 < ground.benches.length; i += 4) keep.push(ground.benches[i]!, ground.benches[i + 2]!, BENCH_LONGEST * 0.5 + 0.6);
  // The cars actually parked and the people actually standing, with each one's stroll a pace apart.
  for (let i = 0; i < job.parkedLayout.length; i += 4) keep.push(job.parkedLayout[i]!, job.parkedLayout[i + 1]!, job.parkedLayout[i + 2]! + 0.4);
  for (const person of job.folk) {
    const paces = Math.max(1, Math.ceil(person.from.distanceTo(person.to)));
    for (let n = 0; n <= paces; n++) {
      const t = n / paces;
      keep.push(person.from.x + (person.to.x - person.from.x) * t, person.from.z + (person.to.z - person.from.z) * t, CLEAR_FOLK * 0.5 + 0.3);
    }
    keep.push(person.position.x, person.position.z, CLEAR_FOLK + 0.3);
  }
  // The near trees' crowns, which no line is strung through, and their trunks, which no pole stands in.
  const crowns: number[] = [];
  for (const item of job.standing) {
    const near = kit.variants.nearTrees.get(item.flat);
    const crown = near === undefined ? null : crownOf(near.leaves);
    if (crown === null) continue;
    const e = item.matrix.elements;
    const scale = Math.hypot(e[0]!, e[1]!, e[2]!);
    overheadAt.set(crown.x, crown.y, crown.z).applyMatrix4(item.matrix);
    crowns.push(overheadAt.x, overheadAt.y, overheadAt.z, crown.radius * scale, crown.half * scale);
    keep.push(e[12]!, e[14]!, 1.2);
  }
  ms += performance.now() - began;
  const hung = yield* timedSteps(hangOverheadSteps({
    region: slot.style.id,
    seed: slot.seed,
    urbanity: urbanityOf(slot.place.pop),
    grid,
    band,
    hosts: job.overheadHosts,
    keep,
    parked: job.parkedLayout,
    crowns,
    floorAt(x, z) {
      frame.directionAt(x, z, overheadDir);
      const elevation = Math.max(0, world.elevationAt(overheadDir));
      const lift = floorLiftAt(field, x, z, elevation);
      if (!(lift > 0)) return null;
      return overheadAt.copy(overheadDir).multiplyScalar(PLANET_RADIUS + elevation + lift).sub(frame.origin).applyMatrix4(frame.inverse).y;
    },
  }), (spent) => (ms += spent));
  if (hung === null) return;
  const count = hung.position.length / 3;
  job.standing.push({ flat: runOf(hung, count), matrix: new THREE.Matrix4(), glow: 1 });
  job.vertices += count;
  slot.overhead = { triangles: hung.triangles, spans: hung.spans, poles: hung.poles, masts: hung.masts, wires: hung.wires, cells: hung.cells, ms };
  job.overheadSpots.push(...hung.spots);
}

/**
 * The street level (`scenery/street-dressing.ts`): awnings, signs, café
 * tables, racks and the paint, keeping off every wall and spot laid before,
 * within a budget that is a share of what already stands. Its walls join the
 * town's; its chairs are benches and its rack slots the fleet's bicycles'.
 * In steps, a front, a strip or a cell at a time.
 */
export function* dressStreetsSteps(kit: RaiseKit, job: RaiseJob, ground: Ground, band: number): Generator<void, void, void> {
  const { slot, grid } = job;
  const { frame, registry } = kit;
  slot.dressing = null;
  if (!job.peopled || job.floor === null || !streetDressingEnabled()) return;
  let ms = 0;
  const began = performance.now();
  const dressDir = new THREE.Vector3();
  const dressAt = new THREE.Vector3();
  const discs: number[] = [...job.overheadSpots];
  for (let i = 0; i + 2 < ground.lamps.length; i += 3) discs.push(ground.lamps[i]!, ground.lamps[i + 2]!, CLEAR_LAMP);
  for (let i = 0; i + 3 < ground.signals.length; i += 4) discs.push(ground.signals[i]!, ground.signals[i + 2]!, 1);
  for (const entry of job.placed) {
    const kind = KIND_OF.get(entry.partId);
    if (kit.inTheCountry.has(entry) || (kind !== 'tree' && kind !== 'scatter')) continue;
    discs.push(entry.plot.x, entry.plot.z, Math.min(1.5, Math.max(0.6, footprintOf(entry.partId) * entry.scale * 0.35)));
  }
  const standingTriangles = (job.vertices + job.takenVertices) / 3 + ground.position.length / 9;
  ms += performance.now() - began;
  const dressed = yield* timedSteps(dressTownSteps({
    seed: slot.seed,
    region: slot.style.id,
    iso: slot.place.iso,
    urbanity: urbanityOf(slot.place.pop),
    grid,
    band,
    levels: ground.terraces,
    field: ground.field,
    mouths: ground.mouths,
    fronts: job.dressFronts,
    solids: job.parkedGhosts.length > 0 ? [...job.solids, ...job.parkedGhosts] : job.solids,
    discs,
    blocked: (x, z) => frame.blocked(x, z),
    plotRect: (col, row) => rectOf(grid, band, col, col, row, row),
    seat(x, z, level, into) {
      frame.directionAt(x, z, dressDir);
      dressAt.copy(dressDir).multiplyScalar(PLANET_RADIUS + level + GROUND_LIFT).sub(frame.origin).applyMatrix4(frame.inverse);
      into[0] = dressAt.x;
      into[1] = dressAt.y;
      into[2] = dressAt.z;
    },
    floorRadius: (level) => PLANET_RADIUS + level + GROUND_LIFT,
    models: kit.variants.dressModels,
    road: slot.ground.road,
    budget: Math.round(Math.min(DRESS_MOST, Math.max(DRESS_LEAST, standingTriangles * DRESS_SHARE))),
  }), (spent) => (ms += spent));
  const closing = performance.now();
  if (dressed.triangles > 0) {
    const count = dressed.triangles * 3;
    job.standing.push({ flat: runOf(dressed, count), matrix: new THREE.Matrix4(), glow: 1 });
    job.vertices += count;
    job.solids.push(...dressed.solids);
    // In the town's frame here; into the world's with the benches once the mesh is placed.
    let chairs = 0;
    for (const anchor of dressed.anchors) {
      const position = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
      const facing = new THREE.Vector3(anchor.fx, 0, anchor.fz);
      if (anchor.kind === 'seat') job.benches.push({ position, facing, sink: 0, key: `chair:${slot.index}:${chairs++}` });
      else job.bikeSlots.push({ id: `rack:${slot.index}:${job.bikeSlots.length}`, place: slot.index, position, forward: facing });
    }
    const log = registry.seatLog;
    if (log !== null) {
      for (const seat of dressed.seats) {
        dressAt.set(seat.x, seat.y + seat.lift, seat.z).applyMatrix4(frame.basis).add(frame.origin);
        const radius = dressAt.length();
        dressAt.normalize();
        log.push({ id: `dress:${seat.kind}`, x: dressAt.x, y: dressAt.y, z: dressAt.z, radius, reach: 0, drawn: true });
      }
    }
  }
  slot.dressing = { triangles: dressed.triangles, solids: dressed.solids.length, counts: dressed.counts, ms: ms + performance.now() - closing };
}
