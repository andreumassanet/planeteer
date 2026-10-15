import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import type { LandProbe } from '../land-probe.ts';
import { isShown, prominenceVersion } from '../places.ts';
import { countryReach } from '../scenery/grid.ts';
import { NEAR_BUILD, createViewCone, detailBuild, detailVersion, mayBuild } from '../view.ts';
import type { ViewCone } from '../view.ts';
import {
  BUILD_BUDGET_MS,
  FAR_WANTING,
  NEAR_ALLOWANCE,
  PEOPLED_RANK,
  PEOPLED_REACH,
  PIXELS_PER_RADIAN,
  RESCAN_MOVE,
  RESCAN_SHARE,
  RESCAN_TURN,
  UNPEOPLE_RANK,
  UNPEOPLE_REACH,
  estimateTriangles,
  keepAllWithin,
  maxResident,
  minPixels,
  rangeFor,
  reachFor,
  triangleBudget,
} from './budget.ts';
import type { Lifecycle } from './lifecycle.ts';
import type { MapPlans } from './map-plans.ts';
import type { Registry } from './registry.ts';
import type { SettlementStats, Slot } from './types.ts';

/**
 * The near/far streamer: which towns should stand, judged by distance, pixels
 * on screen, the view cone, a triangle budget and a count; and the build queue
 * served a step at a time against the frame's allowance.
 */
export interface Streamer {
  readonly stats: SettlementStats;
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
  /** Queues a standing town to be built again. */
  requeue(index: number): void;
}

/** One town the scan found, and how far it is. */
interface Candidate {
  index: number;
  distance: number;
}

/** The streamer's state between frames. */
interface StreamState {
  readonly slots: readonly Slot[];
  readonly anchors: Float32Array;
  readonly lifecycle: Lifecycle;
  readonly landProbe: LandProbe | null;
  readonly stats: SettlementStats;
  readonly cone: ViewCone;
  /** Indices of what should be standing, nearest first. Rebuilt on movement. */
  wanted: number[];
  queue: number[];
  /** The standing towns the last scan found out of the frame. */
  readonly behindSet: Set<number>;
  /** Whether the last scan left far towns unwanted for `FAR_WANTING` alone. */
  moreFar: boolean;
  readonly anchor: THREE.Vector3;
  readonly reliefDir: THREE.Vector3;
}

export function createStreamer(
  slots: readonly Slot[],
  anchors: Float32Array,
  registry: Registry,
  lifecycle: Lifecycle,
  plans: MapPlans,
  landProbe: LandProbe | null,
): Streamer {
  const state: StreamState = {
    slots,
    anchors,
    lifecycle,
    landProbe,
    stats: { resident: 0, pending: 0, triangles: 0, parts: 0, megabytes: 0, built: 0, lastBuildMs: 0, range: 0, reach: 0 },
    cone: createViewCone(keepAllWithin),
    wanted: [],
    queue: [],
    behindSet: new Set(),
    moreFar: false,
    anchor: new THREE.Vector3(),
    reliefDir: new THREE.Vector3(),
  };
  const { stats, cone } = state;
  const scannedAt = new THREE.Vector3(Infinity, Infinity, Infinity);
  const scannedAxis = new THREE.Vector3(0, 0, 1);
  let scannedRange = -1;
  /** Turning either knob forces a rescan; nothing else can see that it moved. */
  let scannedDetail = -1;
  let scannedProminence = -1;

  return {
    stats,
    update(viewer, altitude, camera) {
      registry.fader.update();
      const range = rangeFor(altitude);
      stats.range = Math.round(range);
      stats.reach = Math.round(reachFor(altitude));
      cone.aim(camera);
      if (
        viewer.distanceToSquared(scannedAt) > (RESCAN_MOVE + scannedRange * RESCAN_SHARE) ** 2 ||
        Math.abs(range - scannedRange) > scannedRange * 0.1 ||
        cone.turnFrom(scannedAxis) > RESCAN_TURN ||
        scannedDetail !== detailVersion() ||
        scannedProminence !== prominenceVersion() ||
        (state.moreFar && state.queue.length === 0)
      ) {
        scan(state, viewer, range);
        scannedAt.copy(viewer);
        scannedAxis.copy(cone.axis);
        scannedRange = range;
        scannedDetail = detailVersion();
        scannedProminence = prominenceVersion();
      }
      requeueOnRelief(state);
      build(state, viewer);
      // The map's plans, in what the towns left of the frame, and only while no town is half built.
      if (lifecycle.jobSlot() === null && plans.pending) plans.stepPlans(performance.now());
      count(state);
    },
    requeue(index) {
      if (!state.queue.includes(index)) state.queue.push(index);
    },
  };
}

/**
 * The towns in range, worth their pixels, and inside the view cone: a town
 * already standing is judged by the wider keeping cone, so turning past the
 * frame's edge does not dispose and rebuild it; a standing one out of the
 * frame is kept behind while there is room.
 */
function candidatesOf(state: StreamState, viewer: THREE.Vector3, range: number): { candidates: Candidate[]; behind: Candidate[] } {
  const { slots, anchors, anchor, cone } = state;
  const keep = range * 1.25;
  const pixelFloor = minPixels();
  const candidates: Candidate[] = [];
  const behind: Candidate[] = [];
  for (let i = 0; i < slots.length; i++) {
    const dx = anchors[i * 3]! - viewer.x;
    const dy = anchors[i * 3 + 1]! - viewer.y;
    const dz = anchors[i * 3 + 2]! - viewer.z;
    const squared = dx * dx + dy * dy + dz * dz;
    if (squared > keep * keep) continue;
    const distance = Math.sqrt(squared);
    const slot = slots[i]!;
    if (slot.failed) continue;
    // Most slots are hidden places kept for `roads.bin`'s indices; asked after the distance test.
    if (!isShown(slot.place)) continue;
    if (PIXELS_PER_RADIAN * (2 * slot.radius) < pixelFloor * Math.max(1, distance)) continue;
    anchor.set(anchors[i * 3]!, anchors[i * 3 + 1]!, anchors[i * 3 + 2]!);
    // The pad covers what stands past the square's own radius: a tall block, the edge slope.
    const bound = slot.radius + 40;
    // A town half built is judged as a standing one, so it is finished rather than thrown away.
    const standingNow = slot.mesh !== null || state.lifecycle.jobSlot() === slot;
    const admitted = standingNow ? cone.keeps(anchor, bound) : cone.admits(anchor, bound);
    if (admitted) candidates.push({ index: i, distance });
    else if (standingNow) behind.push({ index: i, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  behind.sort((a, b) => a.distance - b.distance);
  return { candidates, behind };
}

/**
 * Who is peopled is a rank and a reach, applied where the sort exists, with
 * hysteresis on both so a town on the line is not rebuilt every scan.
 */
function rankPeople(state: StreamState, candidates: readonly Candidate[]): void {
  for (let rank = 0; rank < candidates.length; rank++) {
    const slot = state.slots[candidates[rank]!.index]!;
    const distance = candidates[rank]!.distance;
    const want = slot.peopled
      ? rank < UNPEOPLE_RANK && distance < PEOPLED_REACH * UNPEOPLE_REACH
      : rank < PEOPLED_RANK && distance < PEOPLED_REACH;
    if (want !== slot.peopled) {
      slot.peopled = want;
      // Baked into the buffer, so the town is built again; drawn as it was until then.
      slot.stale = state.lifecycle.needsRebuild(slot);
    }
  }
}

/**
 * What is on screen first, then what stands behind it, while the budget and
 * the count have room: a town on screen always outranks one behind, and one
 * within `NEAR_BUILD` is chosen even over the budget. A near
 * town's cost over a far one comes out of `NEAR_ALLOWANCE` first; and only
 * `FAR_WANTING` unbuilt far towns are wanted at once, so their estimates do
 * not evict towns already standing.
 */
function choose(state: StreamState, candidates: readonly Candidate[], behind: readonly Candidate[]): number[] {
  const budget = triangleBudget();
  const residentCap = maxResident();
  const chosen: number[] = [];
  let triangles = 0;
  let nearExtra = 0;
  const onScreen = candidates.length;
  let farWanting = 0;
  state.moreFar = false;
  for (let n = 0; n < onScreen + behind.length; n++) {
    if (chosen.length >= residentCap) break;
    const candidate = n < onScreen ? candidates[n]! : behind[n - onScreen]!;
    const slot = state.slots[candidate.index]!;
    let cost = slot.triangles > 0 ? slot.triangles : estimateTriangles(slot);
    if (slot.peopled && slot.triangles > 0) {
      const extra = Math.max(0, Math.min(cost - estimateTriangles(slot), NEAR_ALLOWANCE - nearExtra));
      nearExtra += extra;
      cost -= extra;
    }
    // The ground the viewer is in or about to be is built whatever it costs; the knob's automatic mode answers for the frames.
    const near = candidate.distance - slot.radius < NEAR_BUILD;
    if (triangles + cost > budget && chosen.length > 0 && !near) continue;
    if (slot.mesh === null && state.lifecycle.jobSlot() !== slot && !near) {
      if (farWanting >= FAR_WANTING) {
        state.moreFar = true;
        continue;
      }
      farWanting++;
    }
    triangles += cost;
    chosen.push(candidate.index);
  }
  return chosen;
}

function scan(state: StreamState, viewer: THREE.Vector3, range: number): void {
  const { slots, lifecycle, behindSet } = state;
  const { candidates, behind } = candidatesOf(state, viewer, range);
  behindSet.clear();
  for (const entry of behind) behindSet.add(entry.index);
  rankPeople(state, candidates);
  state.wanted = choose(state, candidates, behind);
  const set = new Set(state.wanted);
  const building = lifecycle.jobSlot();
  if (building !== null && !set.has(building.index)) lifecycle.endJob();
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]!.mesh !== null && !set.has(i)) lifecycle.drop(slots[i]!);
  }
  // Only what is on screen is built or built again; a town behind keeps its build, and one half built is finished.
  const under = lifecycle.jobSlot();
  state.queue = state.wanted.filter(
    (index) => slots[index]!.mesh === null || slots[index] === under || (slots[index]!.stale && !behindSet.has(index)),
  );
}

/**
 * A town whose edge was seated on the relief is built again once the land
 * probe covers the four corners of its country, and drawn as it was meanwhile.
 */
function requeueOnRelief(state: StreamState): void {
  const { landProbe, slots, reliefDir } = state;
  if (landProbe === null) return;
  for (const index of state.wanted) {
    const slot = slots[index]!;
    const floor = slot.floor;
    if (!slot.onRelief || slot.mesh === null || slot.stale || floor === null) continue;
    const reach = countryReach(slot.radius) / PLANET_RADIUS;
    let covered = true;
    for (let k = 0; k < 4 && covered; k++) {
      reliefDir
        .copy(floor.up)
        .addScaledVector(floor.across, (k & 1 ? 1 : -1) * reach)
        .addScaledVector(floor.north, (k & 2 ? 1 : -1) * reach)
        .normalize();
      covered = landProbe.covers(reliefDir);
    }
    if (!covered) continue;
    slot.onRelief = false;
    slot.stale = true;
    state.queue.push(index);
  }
}

/**
 * Serves the queue a step at a time out of the frame's allowance, near towns
 * before far ones: a build under way is finished before another is begun,
 * except that a near town waiting abandons a far build (whose old town goes
 * on standing). Every town stays drawn and stood on as it was until its
 * replacement stands. The one exception to the allowance is a near town with
 * nothing standing under the viewer, which is built whole: the ground under a
 * foot is worth the frame, and that is an arrival.
 */
function build(state: StreamState, viewer: THREE.Vector3): void {
  const { queue, slots, lifecycle, stats } = state;
  if (queue.length === 0) return;
  const began = performance.now();
  const allowance = detailBuild(BUILD_BUDGET_MS);
  let built = 0;
  let stepped = false;
  while (queue.length > 0) {
    const head = slots[queue[0]!]!;
    const headNear = isNear(head, viewer);
    const under = lifecycle.jobSlot();
    const resume = under !== null && queue.includes(under.index) && (lifecycle.jobNear() || !headNear);
    const slot = resume ? under : head;
    const near = resume ? lifecycle.jobNear() : headNear;
    if (!mayBuild(began, allowance, near, 'towns')) break;
    if (slot.mesh !== null && !slot.stale && under !== slot) {
      queue.splice(queue.indexOf(slot.index), 1);
      continue;
    }
    stepped = true;
    const whole = near && slot.mesh === null && slot.anchor.distanceTo(viewer) < slot.radius * Math.SQRT2;
    if (!lifecycle.step(slot, near, () => whole || mayBuild(began, allowance, near, 'towns'))) break;
    queue.splice(queue.indexOf(slot.index), 1);
    built++;
  }
  if (built > 0 || stepped) stats.lastBuildMs = Number((performance.now() - began).toFixed(2));
  stats.built += built;
}

/** Whether a town is near the viewer: the ground they stand in, or the next step of it (`NEAR_BUILD`). */
function isNear(slot: Slot, viewer: THREE.Vector3): boolean {
  return slot.anchor.distanceTo(viewer) - slot.radius < NEAR_BUILD;
}

function count(state: StreamState): void {
  const { slots, stats } = state;
  let resident = 0;
  let triangles = 0;
  let parts = 0;
  let bytes = 0;
  for (const index of state.wanted) {
    const slot = slots[index]!;
    if (slot.mesh === null) continue;
    resident++;
    triangles += slot.triangles;
    parts += slot.parts;
    bytes += slot.bytes;
  }
  stats.resident = resident;
  stats.pending = state.queue.length;
  stats.triangles = triangles;
  stats.parts = parts;
  stats.megabytes = Number((bytes / 1048576).toFixed(1));
}
