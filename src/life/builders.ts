/** Builds the pooled buffers for vehicles (with their riders and drivers) and code-built walkers. */
import * as THREE from 'three';
import { DRIVE_SHIN, DRIVE_THIGH } from '../avatar.ts';
import { glazeTraffic } from '../craft/cars.ts';
import type { Folk } from '../folk.ts';
import { mergeMeshes } from '../merge.ts';
import { findSceneryModel } from '../scenery/contract.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { lookFor } from '../scenery/dress.ts';
import { buildPerson } from '../scenery/people.ts';
import type { Look } from '../scenery/people.ts';
import { rngFrom } from '../scenery/random.ts';
import { RIDER_HEIGHT, placedScale, variantRng } from '../traffic/contract.ts';
import type { Mount, TrafficContext, TrafficStyle, Vehicle } from '../traffic/contract.ts';
import { disposeBuilt, geometryOf } from './pool.ts';
import type { Pooled } from './pool.ts';
import { RIDER_SHIN, RIDER_THIGH_ASTRIDE, RIDER_THIGH_SIT, TAU, WALK_PHASES } from './tuning.ts';
import { poseAt, rigOf } from './walk-rig.ts';
import type { Rig } from './walk-rig.ts';

export interface Builders {
  /**
   * A vehicle and its rider merged into one buffer, `placedScale` baked into
   * the vertices (a non-uniform mesh scale would skew the normals the ink is
   * built from). `inside` builds the glazed near version with a driver.
   * 'pending' while the cast it needs is still loading.
   */
  buildVehicle(key: string, id: string, style: TrafficStyle, region: string, variant: number, inside?: boolean, rightHand?: boolean): Pooled | null | 'pending';
  /**
   * One code-built walking body as `WALK_PHASES` merged buffers, one per phase
   * of the cycle: a walker is one mesh whose geometry is swapped per phase.
   */
  buildWalker(key: string, region: string, body: number): Pooled[] | null;
}

interface BuilderDeps {
  ctx: SceneryContext;
  traffic: TrafficContext;
  registry: ReadonlyMap<string, Vehicle>;
  folk: Folk | undefined;
}

export function createBuilders({ ctx, traffic, registry, folk }: BuilderDeps): Builders {
  function buildVehicle(key: string, id: string, style: TrafficStyle, region: string, variant: number, inside = false, rightHand = false): Pooled | null | 'pending' {
    const entry = registry.get(id);
    if (entry === undefined) return null;
    // Riders and near drivers come from the cast once it is loaded; wait for it
    // rather than pooling a code-built body for the session.
    if ((entry.mounts.length > 0 || inside) && folk !== undefined && !folk.ready) return 'pending';
    const built = entry.build(traffic, variantRng(entry, style, variant), style);

    // Near, a closed vehicle is glazed with a cabin and a driver (`CABIN_REACH`).
    // One with nothing to glaze is refused, and the far build stands in.
    if (inside) {
      const drivers = glazeTraffic(built, findSceneryModel, rightHand);
      if (drivers.length === 0) {
        disposeBuilt(built);
        return null;
      }
      for (const [n, seat] of drivers.entries()) {
        // Hands on the wheel's rim, elbows bent, as the hero drives (`holdWheel`).
        const driver = folk?.seated(`${key}|driver|${n}`, region, seat.height, { thigh: DRIVE_THIGH, shin: DRIVE_SHIN, wheel: seat.wheel }) ?? null;
        if (driver === null) continue;
        driver.position.copy(seat.hip);
        built.add(driver);
      }
    }

    for (const mount of entry.mounts) {
      const rider = folk !== undefined ? castRider(key, region, mount) : codeRider(key, region, mount);
      if (rider === null) continue;
      rider.position.set(mount.x, mount.y, mount.z);
      rider.rotation.y = mount.yaw;
      built.add(rider);
    }

    // The glass apart: it is drawn in its own see-through material.
    const panes: THREE.Object3D[] = [];
    built.traverse((object) => {
      if (object.name === 'glass' && (object as THREE.Mesh).isMesh) panes.push(object);
    });
    for (const pane of panes) pane.removeFromParent();
    const scale = placedScale(entry);
    built.scale.set(scale[0], scale[1], scale[2]);
    const merged = mergeMeshes(built);
    const geometry = geometryOf(merged);
    disposeBuilt(built);
    let glass: THREE.BufferGeometry | undefined;
    let glassBytes = 0;
    if (panes.length > 0) {
      const holder = new THREE.Group();
      holder.scale.copy(built.scale);
      holder.add(...panes);
      const pane = mergeMeshes(holder);
      glass = geometryOf(pane);
      glassBytes = pane.position.byteLength * 4;
      disposeBuilt(holder);
    }
    return { geometry, glass, triangles: merged.triangles, bytes: merged.position.byteLength * 4 + glassBytes };
  }

  /**
   * A rider from the cast, held seated (`Folk.seated`). `astride` (a bicycle,
   * a scooter) drops the thigh towards the pedals; `sit` is a bench.
   */
  function castRider(key: string, region: string, mount: Mount): THREE.Object3D | null {
    const astride = mount.pose === 'astride';
    return folk!.seated(`${key}|rider|${mount.x}|${mount.z}`, region, RIDER_HEIGHT, {
      thigh: astride ? RIDER_THIGH_ASTRIDE : RIDER_THIGH_SIT,
      shin: RIDER_SHIN,
      grip: mount.grip === undefined ? undefined : new THREE.Vector3(mount.grip[0] - mount.x, mount.grip[1] - mount.y, mount.grip[2] - mount.z),
    });
  }

  /** The code-built rider, for when there is no cast. `buildPerson` solves its legs and arms to the mount by IK. */
  function codeRider(key: string, region: string, mount: Mount): THREE.Object3D {
    const rng = rngFrom(key, 'rider', mount.x, mount.z);
    const look: Look = {
      ...lookFor(rng, region, { pose: mount.pose }),
      height: RIDER_HEIGHT,
      footrest: mount.footrest,
      grip: mount.grip,
    };
    return buildPerson(ctx, look);
  }

  function buildWalker(key: string, region: string, body: number): Pooled[] | null {
    const rng = rngFrom(key, 'walker', body);
    const person = buildPerson(ctx, lookFor(rng, region, { pose: 'walk' }));
    let rig: Rig;
    try {
      rig = rigOf(person);
    } catch (error) {
      console.warn(`life: could not find the joints of a crowd body — ${String(error)}`);
      disposeBuilt(person);
      return null;
    }
    // A seeded forward lean, so the bodies walk differently.
    const lean = rng.range(-0.02, 0.06);
    const out: Pooled[] = [];
    for (let phase = 0; phase < WALK_PHASES; phase++) {
      poseAt(rig, (phase / WALK_PHASES) * TAU, lean);
      const merged = mergeMeshes(person);
      out.push({
        geometry: geometryOf(merged),
        triangles: merged.triangles,
        bytes: merged.position.byteLength * 3,
      });
    }
    disposeBuilt(person);
    return out;
  }

  return { buildVehicle, buildWalker };
}
