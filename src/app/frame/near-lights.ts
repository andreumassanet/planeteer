/**
 * The per-pixel lights near the camera after dark (`lights.ts`): up to
 * `NEAR_HEADLIGHTS` headlamps (the player's own vehicle first, then the
 * nearest traffic and other players' vehicles), the campfires, and the
 * street and plaza lamps. In view space, so after the camera has settled.
 */
import * as THREE from 'three';
import {
  FIRE_GLOW_REACH, FIRE_STRIDE, LAMPS_OFF_ABOVE, LAMP_FIELD, MAX_FIRE_GLOWS, NEAR_HEADLIGHTS, NEAR_LAMPS,
  setFires, setHeadlights, setNearLamps,
} from '../../lights.ts';
import { HEADLIGHTS_OF, LAMPS_LIKE } from '../../craft/contract.ts';
import type { CraftModel, Lamp } from '../../craft/contract.ts';
import type { App } from '../context.ts';

/** Floats per headlight in the buffer `setHeadlights` reads: position, direction, strength. */
const HEADLIGHT_STRIDE = 7;

/**
 * A vehicle whose headlamps may be lit this frame: its model's origin and
 * axes, its lamps, how they scale onto it (`across` in X, `along` up and
 * ahead; 1 for a craft), how bright, and its distance from the camera.
 */
interface LampSource {
  origin: THREE.Vector3;
  side: THREE.Vector3;
  up: THREE.Vector3;
  ahead: THREE.Vector3;
  lamps: readonly Lamp[];
  across: number;
  along: number;
  strength: number;
  distance: number;
}

/** How bright a model's headlamps are, or 0 where it has none. */
const headlampsOf = (model: CraftModel): number =>
  model.lamps === undefined || model.lamps.length === 0 ? 0 : HEADLIGHTS_OF[model.kind].strength;

const byLampDistance = (a: LampSource, b: LampSource): number => a.distance - b.distance;

/** A source's axes off a posed object's world matrix, without its scale. */
function lampFrame(source: LampSource, matrix: THREE.Matrix4): void {
  const e = matrix.elements;
  source.origin.setFromMatrixPosition(matrix);
  source.side.set(e[0]!, e[1]!, e[2]!).normalize();
  source.up.set(e[4]!, e[5]!, e[6]!).normalize();
  source.ahead.set(e[8]!, e[9]!, e[10]!).normalize();
}

export function createNearLights(app: App): (now: number) => void {
  const { guard, rig, sky, player, life, fleet, countryMotion, settlements, roads, monuments, craftModels } = app;
  const nearLamps = new Float32Array(NEAR_LAMPS * 4);
  const headlights = new Float32Array(NEAR_HEADLIGHTS * HEADLIGHT_STRIDE);
  const fires = new Float32Array(MAX_FIRE_GLOWS * FIRE_STRIDE);
  let headlightCount = 0;
  const headAt = new THREE.Vector3();
  const headDown = new THREE.Vector3();
  const lampPool: LampSource[] = Array.from({ length: 64 }, () => ({
    origin: new THREE.Vector3(),
    side: new THREE.Vector3(),
    up: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
    lamps: [],
    across: 1,
    along: 1,
    strength: 0,
    distance: 0,
  }));
  /** This frame's sources: the player's own first, then by distance. */
  const lampSources: LampSource[] = [];
  const lampSource = (distance: number): LampSource | null => {
    if (distance > LAMP_FIELD || lampSources.length >= lampPool.length) return null;
    const source = lampPool[lampSources.length]!;
    source.distance = distance;
    lampSources.push(source);
    return source;
  };
  const pushHeadlight = (at: THREE.Vector3, dir: THREE.Vector3, strength: number): void => {
    if (headlightCount >= NEAR_HEADLIGHTS) return;
    const o = headlightCount * HEADLIGHT_STRIDE;
    headlights[o] = at.x; headlights[o + 1] = at.y; headlights[o + 2] = at.z;
    headlights[o + 3] = dir.x; headlights[o + 4] = dir.y; headlights[o + 5] = dir.z;
    headlights[o + 6] = strength;
    headlightCount++;
  };
  /** Every lamp of one vehicle, or none if they do not all fit. */
  const pushLamps = (source: LampSource): void => {
    if (headlightCount + source.lamps.length > NEAR_HEADLIGHTS) return;
    headDown.copy(source.ahead).addScaledVector(source.up, -0.12).normalize();
    for (const [x, y, z] of source.lamps) {
      headAt.copy(source.origin)
        .addScaledVector(source.side, x * source.across)
        .addScaledVector(source.up, y * source.along)
        .addScaledVector(source.ahead, z * source.along);
      pushHeadlight(headAt, headDown, source.strength);
    }
  };
  /**
   * A traffic vehicle, lit with the lamps of the craft that stands in for it
   * (`LAMPS_LIKE`), scaled onto its own box from the bottom of its model, and
   * a little dimmer than a player's.
   */
  const visitTraffic = (mesh: THREE.Object3D, halfLength: number, halfWidth: number, vehicle: string, bottom: number): void => {
    const like = LAMPS_LIKE[vehicle];
    const model = like === undefined ? undefined : craftModels.get(like);
    if (model === undefined) return;
    const strength = headlampsOf(model);
    if (strength === 0) return;
    const source = lampSource(mesh.position.distanceTo(rig.camera.position));
    if (source === null) return;
    lampFrame(source, mesh.matrixWorld);
    source.origin.addScaledVector(source.up, bottom);
    source.lamps = model.lamps!;
    source.across = halfWidth / (model.size[1] / 2);
    source.along = halfLength / (model.size[0] / 2);
    source.strength = strength * 0.8;
  };
  /** A vehicle another player drives, lit as its driver sees it. */
  const visitDriven = (group: THREE.Object3D, model: CraftModel): void => {
    const strength = headlampsOf(model);
    if (strength === 0) return;
    group.updateWorldMatrix(true, false);
    headAt.setFromMatrixPosition(group.matrixWorld);
    const source = lampSource(headAt.distanceTo(rig.camera.position));
    if (source === null) return;
    lampFrame(source, group.matrixWorld);
    source.lamps = model.lamps!;
    source.across = 1;
    source.along = 1;
    source.strength = strength;
  };
  function gatherHeadlights(): void {
    lampSources.length = 0;
    const ride = player.ride;
    const own = ride !== null && ride.seat === 0 ? headlampsOf(ride.model) : 0;
    if (own > 0) {
      const source = lampSource(-1)!;
      source.origin.copy(player.position);
      source.up.copy(player.up);
      source.ahead.copy(player.forward);
      source.side.crossVectors(player.up, player.forward).normalize();
      source.lamps = ride!.model.lamps!;
      source.across = 1;
      source.along = 1;
      source.strength = own;
    }
    life.eachRoadVehicle(visitTraffic);
    fleet.eachDriven(visitDriven);
    lampSources.sort(byLampDistance);
    // A vehicle whose lamps do not all fit is passed over; a bicycle's one lamp may still fit.
    for (const source of lampSources) pushLamps(source);
  }

  return (now) => {
    guard('near lamps', () => {
      rig.camera.updateMatrixWorld();
      headlightCount = 0;
      if (sky.state.daylight < 0.6) gatherHeadlights();
      setHeadlights(rig.camera, headlights, headlightCount);
      const fireCount = sky.state.elevation > LAMPS_OFF_ABOVE ? 0 : countryMotion.fires(fires, MAX_FIRE_GLOWS, FIRE_GLOW_REACH);
      setFires(rig.camera, fires, fireCount, now / 1000);
      // By day no lamp is lit, so none is looked for.
      if (sky.state.elevation > LAMPS_OFF_ABOVE) setNearLamps(rig.camera, nearLamps, 0);
      else {
        const townLamps = settlements.lampsNear(rig.camera.position, LAMP_FIELD, nearLamps);
        const roadLamps = roads.lampsNear(rig.camera.position, LAMP_FIELD, nearLamps, townLamps);
        // And the lamps round a landmark, which light its paving.
        setNearLamps(rig.camera, nearLamps, monuments.lampsNear(rig.camera.position, LAMP_FIELD, nearLamps, roadLamps));
      }
    });
  };
}
