import * as THREE from 'three';
import { shadeByClouds } from '../cloud-shade.ts';
import type { CraftModel } from '../craft/contract.ts';
import { AIRSHIP_LENGTH, AIRSHIP_PAINTS_COUNT, buildAirliner, buildAirship } from '../craft/airliner.ts';
import type { FlyerKind } from './flight.ts';

/** The drawn flyers' models, pooled by kind and variant so a returning flight reuses its group. */

const CRAFT_OF: Partial<Record<FlyerKind, string>> = { plane: 'light-plane', helicopter: 'helicopter', balloon: 'balloon' };

export interface Taken {
  object: THREE.Group;
  model: CraftModel | null;
  key: string;
}

export interface FlyerPool {
  /** A hidden group of the kind and variant, shown; null when its craft model is missing. */
  take(kind: FlyerKind, variant: number): Taken | null;
  give(object: THREE.Group, key: string): void;
}

export function createFlyerPool(group: THREE.Group, craft: ReadonlyMap<string, CraftModel>): FlyerPool {
  // The airship is nobody's craft; a stand-in model gives its propellers the motion's discs.
  const airshipModel: CraftModel = {
    id: 'airship',
    kind: 'plane',
    medium: 'air',
    size: [AIRSHIP_LENGTH, AIRSHIP_LENGTH * 0.25, AIRSHIP_LENGTH * 0.3],
    seats: [],
    draft: 0,
    variants: AIRSHIP_PAINTS_COUNT,
    build: buildAirship,
  };
  // The airliner is drawn in its own haze, not the land's fog.
  let airlinerMaterial: THREE.Material | null = null;
  const pools = new Map<string, THREE.Group[]>();

  function hazed(mesh: THREE.Mesh): THREE.Material {
    if (airlinerMaterial === null) {
      const clone = (mesh.material as THREE.MeshToonMaterial).clone();
      clone.fog = false;
      // A clone drops the compile hooks, so the cloud shade is reapplied.
      airlinerMaterial = shadeByClouds(clone);
      airlinerMaterial.userData = { ...(mesh.material as THREE.Material).userData };
    }
    return airlinerMaterial;
  }

  function take(kind: FlyerKind, variant: number): Taken | null {
    const key = `${kind}:${variant}`;
    const free = pools.get(key);
    const model = kind === 'airship' ? airshipModel : CRAFT_OF[kind] !== undefined ? (craft.get(CRAFT_OF[kind]!) ?? null) : null;
    if (kind !== 'airliner' && kind !== 'airship' && model === null) return null;
    let object = free?.pop();
    if (object === undefined) {
      object = kind === 'airliner' ? buildAirliner(variant) : model!.build(variant % Math.max(1, model!.variants));
      object.traverse((part) => {
        part.castShadow = false;
        part.receiveShadow = false;
        if (kind === 'airliner' && (part as THREE.Mesh).isMesh) {
          const mesh = part as THREE.Mesh;
          mesh.material = hazed(mesh);
        }
      });
      object.matrixAutoUpdate = true;
      group.add(object);
    }
    object.visible = true;
    return { object, model: kind === 'airliner' ? null : model, key };
  }

  function give(object: THREE.Group, key: string): void {
    object.visible = false;
    let free = pools.get(key);
    if (free === undefined) pools.set(key, (free = []));
    free.push(object);
  }

  return { take, give };
}
