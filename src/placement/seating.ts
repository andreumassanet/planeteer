/** Seating a standing monument: on the drawn land, or a town's floor when it is higher. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { planShape } from '../landmark-ground.ts';
import { drawnFootprint, landProbeOf } from '../land-probe.ts';
import type { DrawnFootprint, LandProbe } from '../land-probe.ts';
import type { Slot } from './slots.ts';

/**
 * How far a landmark on the drawn land is bedded under the lowest of its
 * plan's nine points: the land between two of them can dip lower still.
 */
const LANDMARK_BURY = 0.25;

export interface SeatingDeps {
  slots: readonly Slot[];
  /** How high the ground people made stands here, or 0 (`settlements.ts`'s `madeHeightAt`). */
  madeHeightAt?: (point: THREE.Vector3) => number;
  /** `settlements.ts`'s `floorChanges`: floors raised or dropped since a version, as sphere caps. */
  floorChanges?: (since: number, into: number[]) => number;
  /** The drawn land. */
  land?: THREE.Mesh;
  /** Called after a model is moved, to drop its walls. */
  unwall(slot: Slot): void;
  /** Called after a standing model is moved, to place its lamps and lights. */
  standNight(slot: Slot, model: THREE.Mesh): void;
}

export interface Seating {
  /** The land probe, or null with no land. */
  readonly landProbe: LandProbe | null;
  /** On the town's floor where there is one, else on the ground. Asked at raise and when a floor changes. */
  seat(slot: Slot, model: THREE.Object3D): void;
  /** The lowest drawn land under a landmark's plan, or null where the probe has not gathered all of it. */
  drawnUnder(slot: Slot): number | null;
  /** Re-seats every standing monument a changed floor reaches. */
  reseat(): void;
}

export function createSeating(deps: SeatingDeps): Seating {
  const { slots, madeHeightAt, floorChanges, land } = deps;
  const landProbe = land === undefined ? null : landProbeOf(land);
  const north = new THREE.Vector3(0, 1, 0);
  const seatFacing = new THREE.Vector3();
  const seatRight = new THREE.Vector3();
  const seatPoint = new THREE.Vector3();
  const seatDrawn: DrawnFootprint = { centre: 0, lowest: 0, highest: 0 };
  /** What `floorChanges` last answered, and where it writes. */
  let floorsSeen = 0;
  const changed: number[] = [];

  /**
   * The lowest of the drawn land under a landmark's plan (its corners, side
   * middles and middle, in the frame `raise` stands it in). A landmark with no
   * plan asks a ring at seven tenths of its footprint, as a tree does.
   */
  function drawnUnder(slot: Slot): number | null {
    if (landProbe === null) return null;
    const up = slot.direction;
    seatFacing.copy(north).projectOnPlane(up);
    if (seatFacing.lengthSq() < 1e-8) seatFacing.set(1, 0, 0).projectOnPlane(up);
    seatFacing.normalize();
    seatRight.crossVectors(up, seatFacing).normalize();
    const shape = planShape(slot.placement);
    if (!Number.isFinite(shape.hx)) {
      return drawnFootprint(landProbe, up, seatRight, seatFacing, shape.radius * 0.7, seatDrawn) === 'drawn' ? seatDrawn.lowest : null;
    }
    let lowest = Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        seatPoint
          .copy(up)
          .addScaledVector(seatRight, (shape.cx + i * shape.hx) / PLANET_RADIUS)
          .addScaledVector(seatFacing, (shape.cz + j * shape.hz) / PLANET_RADIUS)
          .normalize();
        if (!landProbe.covers(seatPoint)) return null;
        const radius = landProbe.radiusAt(seatPoint);
        // Over the water at a shore landmark's edge: the land there has gone under the shelf.
        if (radius !== null && radius < lowest) lowest = radius;
      }
    }
    return Number.isFinite(lowest) ? lowest : null;
  }

  function seat(slot: Slot, model: THREE.Object3D): void {
    const drawn = drawnUnder(slot);
    slot.onDrawn = drawn !== null;
    // `slot.anchor` is the ground point and the floor is a radius, so the lift
    // is the difference of the two along the same direction.
    const ground = drawn === null ? slot.anchor.length() : drawn - LANDMARK_BURY;
    const made = madeHeightAt?.(slot.direction) ?? 0;
    model.position.copy(slot.direction).multiplyScalar(Math.max(ground, made));
    // The walls carry their roofs as radii, so a monument that moved is measured again.
    deps.unwall(slot);
    // And its lamps and red lights go with it; `raise` places them once it has turned it.
    if (slot.object !== null && slot.object === model) deps.standNight(slot, slot.object);
  }

  function reseat(): void {
    if (floorChanges === undefined) return;
    const version = floorChanges(floorsSeen, changed);
    if (version === floorsSeen) return;
    floorsSeen = version;
    // A reader that fell behind the ring (`-1`) re-seats them all.
    const all = changed[0] === -1;
    for (const slot of slots) {
      if (slot.object === null) continue;
      let touched = all;
      for (let c = 0; !touched && c + 3 < changed.length; c += 4) {
        const dot = slot.direction.x * changed[c]! + slot.direction.y * changed[c + 1]! + slot.direction.z * changed[c + 2]!;
        touched = dot >= Math.cos(changed[c + 3]! / PLANET_RADIUS);
      }
      if (touched) seat(slot, slot.object);
    }
  }

  return { landProbe, seat, drawnUnder, reseat };
}
