import * as THREE from 'three';
import { measure } from '../../monuments/contract.ts';
import { KINDS } from './kinds.ts';
import { RIDER } from './scale.ts';
import type { Vehicle } from './types.ts';

const round = (value: number): string => value.toFixed(2);

/** The measured extent of a built vehicle, which `measure` does not give in this shape. */
export interface Extent {
  length: number;
  width: number;
  height: number;
  base: number;
  /** Horizontal offset of the box centre from the origin. */
  offset: number;
}

export function extentOf(group: THREE.Group): Extent {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return { length: 0, width: 0, height: 0, base: 0, offset: 0 };
  return {
    length: box.max.z - box.min.z,
    width: box.max.x - box.min.x,
    height: box.max.y,
    base: box.min.y,
    offset: Math.hypot((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2),
  };
}

/** Everything wrong with one built variant, in plain English. Empty means it is fine. */
export function validateVehicle(vehicle: Vehicle, group: THREE.Group): string[] {
  const kind = KINDS[vehicle.kind];
  if (!kind) return [`kind '${vehicle.kind}' is not one of ${Object.keys(KINDS).join(', ')}`];
  const problems = structureProblems(vehicle, group);

  const { triangles, meshes, colors } = measure(group);
  if (meshes === 0) {
    problems.push('the variant is empty');
    return problems;
  }

  const [declaredLength, declaredWidth, declaredHeight] = vehicle.size;
  const built = extentOf(group);

  // Pose.
  if (built.base < -kind.draft - 0.06) {
    problems.push(
      kind.draft > 0
        ? `draws ${round(-built.base)} below the waterline, past the '${vehicle.kind}' draft of ${kind.draft}`
        : `sinks ${round(-built.base)} below y = 0`,
    );
  }
  if (built.base > 0.06) problems.push(`floats ${round(built.base)} above y = 0`);
  if (built.offset > Math.max(0.25, declaredLength * 0.08)) {
    problems.push(`is ${round(built.offset)} off-centre — a vehicle must straddle its own origin`);
  }

  // The declared size, which is the contract with the placer.
  const owed: [string, number, number, number][] = [
    ['length', built.length, declaredLength, kind.length],
    ['width', built.width, declaredWidth, kind.width],
    ['height', built.height, declaredHeight, kind.height],
  ];
  for (const [name, actual, declared, cap] of owed) {
    if (declared > cap + 1e-6) {
      problems.push(`declared ${name} ${declared} is over the '${vehicle.kind}' cap of ${cap}`);
    }
    if (actual > declared + 0.06) {
      problems.push(`is ${round(actual)} ${name}, past its declared ${declared}`);
    }
    // An oversized declaration makes the placer reserve road it does not need
    // and refuse lanes the vehicle fits. 12% is the drift variants may have.
    if (actual < declared * 0.88) {
      problems.push(`only ${round(actual)} ${name} against a declared ${declared} — declare a tighter box`);
    }
  }
  if (declaredLength < kind.minLength) {
    problems.push(`declared length ${declaredLength} is under the '${vehicle.kind}' floor of ${kind.minLength}`);
  }

  // Budget.
  if (triangles > kind.triangles) {
    problems.push(`${triangles} triangles, over the '${vehicle.kind}' budget of ${kind.triangles}`);
  }
  if (meshes > kind.meshes) {
    problems.push(`${meshes} meshes, over the '${vehicle.kind}' budget of ${kind.meshes}`);
  }
  if (colors.length > kind.colors) {
    problems.push(
      `${colors.length} palette colours, over the '${vehicle.kind}' budget of ${kind.colors} — ` +
        `colours are draw calls here, see KindSpec.colors`,
    );
  }

  problems.push(...mountProblems(vehicle, built));
  return problems;
}

/** The id, the group's own transform and what kinds of object and material it holds. */
function structureProblems(vehicle: Vehicle, group: THREE.Group): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(vehicle.id)) problems.push(`id '${vehicle.id}' is not kebab-case`);

  if (group.position.lengthSq() > 1e-6) problems.push('group.position must be the origin');
  if (group.rotation.x !== 0 || group.rotation.y !== 0 || group.rotation.z !== 0) {
    problems.push('group.rotation must be identity — bake the rotation into the children');
  }
  if (Math.abs(group.scale.x - 1) > 1e-6 || Math.abs(group.scale.y - 1) > 1e-6) {
    problems.push('group.scale must be 1 — the instance carries the scale, not the variant');
  }

  group.traverse((object) => {
    if (object === group) return;
    const kinds = object as unknown as Record<string, boolean>;
    if (kinds.isPoints || kinds.isLine || kinds.isSprite) {
      problems.push(`${object.type} is not allowed: OutlineEffect only inks meshes`);
      return;
    }
    if (kinds.isLight || kinds.isCamera) {
      problems.push(`${object.type} is not allowed: the scene owns the lights and the camera`);
      return;
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material.userData.atlasToon === undefined) {
        problems.push(`a ${material.type} escaped ctx.toon — every material must come from it`);
      }
      if (material.side !== THREE.FrontSide) {
        problems.push('materials must stay FrontSide — the outline is an inverted back-face hull');
      }
    }
  });
  return problems;
}

/**
 * Whether a rider fits the seats this vehicle declares. Exported separately
 * because it depends on `RIDER`, a number owned by the crowd.
 */
export function mountProblems(vehicle: Vehicle, built: Extent): string[] {
  const problems: string[] = [];
  const kind = KINDS[vehicle.kind];
  for (const [index, mount] of vehicle.mounts.entries()) {
    const where = vehicle.mounts.length > 1 ? `mount ${index}` : 'the mount';
    if (mount.y < 0) problems.push(`${where} is below the ground`);
    if (Math.abs(mount.x) > built.width / 2 + 0.05 || Math.abs(mount.z) > built.length / 2 + 0.05) {
      problems.push(`${where} is outside the vehicle`);
    }
    const needsHead =
      mount.pose === 'stand'
        ? RIDER.standing
        : mount.hats
          ? RIDER.headroomHatted
          : RIDER.headroomBare;
    if (mount.headroom < needsHead - 1e-6) {
      problems.push(
        `${where} has ${round(mount.headroom)} of headroom and a ${mount.pose === 'stand' ? 'standing' : 'seated'} ` +
          `rider needs ${round(needsHead)} — the head goes through the roof`,
      );
    }
    if (mount.beam < RIDER.beam - 1e-6) {
      problems.push(
        `${where} is ${round(mount.beam)} across and a rider's elbows span ${round(RIDER.beam)} — ` +
          'sized off the shoulders rather than the elbows?',
      );
    }
    if (mount.beam !== Infinity && Math.abs(mount.x) + RIDER.beam / 2 > mount.beam / 2 + 1e-6) {
      problems.push(`${where} sits ${round(Math.abs(mount.x))} off the centreline and its elbows leave the ${round(mount.beam)} it has`);
    }
    if (mount.pose !== 'stand' && mount.legroom < RIDER.sole - 1e-6) {
      problems.push(
        `${where} has ${round(mount.legroom)} of legroom and a rider needs ${round(RIDER.sole)} — ` +
          'the boot goes through the floor',
      );
    }
    // A covered seat's headroom must also fit under the vehicle's own roof.
    if (mount.headroom !== Infinity && mount.y + mount.headroom > built.height + 0.06) {
      problems.push(`${where} claims ${round(mount.headroom)} of headroom the vehicle does not have`);
    }
    if (mount.pose !== 'stand' && mount.y - mount.legroom < -kind.draft - 0.06) {
      problems.push(`${where} claims ${round(mount.legroom)} of legroom that reaches below the vehicle`);
    }
  }
  return problems;
}
