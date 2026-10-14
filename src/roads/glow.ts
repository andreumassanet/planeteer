import * as THREE from 'three';
import type { World } from '../geo.ts';
import { LAMP_POOL, poolAt } from '../lights.ts';
import type { Place } from '../places.ts';
import { gateGlow, offsetDirection } from '../scenery/grid.ts';
import type { RoadRamp } from './crown.ts';
import { bandOf, townOf } from './town.ts';
import type { Road } from './types.ts';

/**
 * The light a ribbon vertex carries after dark, as the byte a town's floor
 * would carry there: the gate lights at its two ends (`gateGlow`, read by the
 * floor too, so the kerb shows no seam) and, near the eye, its own lamps.
 */

/** A gate's light: the point it hangs at on the paving and the town frame its distances are measured in. */
export interface GateLight {
  at: THREE.Vector3;
  across: THREE.Vector3;
  north: THREE.Vector3;
  inner: number;
  reach: number;
}

export const NO_LIGHTS: readonly GateLight[] = [];

/** The lights at a road's two gates; a gate the town could not cut (kerb 0) has none. */
export function gateLightsOf(road: Road, ramp: RoadRamp, places: readonly Place[], world: World): readonly GateLight[] {
  const list: GateLight[] = [];
  for (const [end, which, kerb] of [[road.a, road.gateA, ramp.kerbA], [road.b, road.gateB, ramp.kerbB]] as const) {
    if (kerb === 0) continue;
    const place = places[end]!;
    const town = townOf(place);
    const gate = town.gates[which];
    if (gate === undefined) continue;
    const glow = gateGlow(town.grid, gate, bandOf(place, town, world));
    const at = offsetDirection(town.up, town.across, town.north, glow.x, glow.z, new THREE.Vector3())
      .multiplyScalar(kerb);
    list.push({ at, across: town.across, north: town.north, inner: glow.inner, reach: glow.reach });
  }
  return list.length > 0 ? list : NO_LIGHTS;
}

const glowOffset = new THREE.Vector3();

/** The brighter of a road's gate lights at a point, by `poolAt` over the distance in that town's frame. */
export function ribbonGlow(lights: readonly GateLight[], point: THREE.Vector3): number {
  let best = 0;
  for (const light of lights) {
    glowOffset.subVectors(point, light.at);
    const distance = Math.hypot(glowOffset.dot(light.across), glowOffset.dot(light.north));
    best = Math.max(best, poolAt(1, distance, light.inner, light.reach));
  }
  return best;
}

const lampOffset = new THREE.Vector3();
const lampUp = new THREE.Vector3();

/**
 * The light a road's own lamps throw on its ribbon: `poolAt` over the ground
 * distance from each lamp's foot, `LAMP_POOL` out, as a town's lamps lay theirs.
 */
export function lampGlow(heads: readonly number[], point: THREE.Vector3): number {
  let best = 0;
  for (let i = 0; i + 2 < heads.length; i += 3) {
    lampOffset.set(heads[i]! - point.x, heads[i + 1]! - point.y, heads[i + 2]! - point.z);
    const far = lampOffset.lengthSq();
    if (far > (LAMP_POOL + 8) * (LAMP_POOL + 8)) continue;
    lampUp.set(heads[i]!, heads[i + 1]!, heads[i + 2]!).normalize();
    const rise = lampOffset.dot(lampUp);
    best = Math.max(best, poolAt(1, Math.sqrt(Math.max(0, far - rise * rise)), 0, LAMP_POOL));
  }
  return best;
}
