import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { inflate } from './pack.ts';
import { modelFromBaked, rigFromBaked } from './models.ts';
import type { Model, Rig, RigSource } from './models.ts';

/**
 * The kit's CC0 models at runtime: what `scripts/build-kit.ts` wrote, read back.
 *
 * Two shapes of file. `models/traffic/kit.bin` is every vehicle in one GLB, one
 * node a model, and `models/nature/kit.bin` every plant and rock; each is loaded
 * whole, because a region's traffic is most of the kit and the flora is 96 KB
 * (2026-09-21). `models/fauna/<id>.bin` is one animal a file with its skeleton
 * and clips, loaded the first time a herd of it is near, because a region
 * grazes a few of the eight rigs and never all of them.
 *
 * Every file is a gzipped GLB, like `public/data/*.bin`, and nothing in it
 * needs work on arrival: the slots, the creased normals and the ink's normals
 * were all written by the bake. This module is only ever reached through
 * `main.ts`'s deferred imports, so none of it is in the first load.
 */

const BASE = `${import.meta.env?.BASE_URL ?? '/'}models/`;

const loader = new GLTFLoader();

/** A gzipped GLB, parsed. Works in Node too, given the bytes. */
export async function parseKit(bytes: ArrayBuffer | Uint8Array): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const raw = await inflate(bytes);
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) =>
    loader.parse(buffer, '', resolve as never, reject),
  );
  return gltf;
}

/** Every model in a static kit file (vehicles, flora), by the ids the bake gave them. */
export async function modelsFrom(bytes: ArrayBuffer | Uint8Array): Promise<Model[]> {
  const { scene } = await parseKit(bytes);
  const models: Model[] = [];
  scene.updateMatrixWorld(true);
  for (const child of [...scene.children]) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) continue;
    models.push(modelFromBaked(mesh, mesh.name));
  }
  return models;
}

/** A static kit file under `models/`: `traffic/kit.bin`, `nature/kit.bin`. */
export async function loadModels(file: string): Promise<Model[]> {
  const url = `${BASE}${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`kit: ${url} answered ${response.status}`);
  return modelsFrom(await response.arrayBuffer());
}

/** An animal's rig from its file's bytes. */
export async function rigFrom(bytes: ArrayBuffer | Uint8Array, id: string, material: THREE.Material): Promise<Rig> {
  const { scene, animations } = await parseKit(bytes);
  return rigFromBaked(scene, animations, id, material);
}

const rigs = new Map<string, Promise<Rig>>();

/** Fetched once and shared; a failed load is retried the next time it is asked for. */
export function loadRig(id: string, material: THREE.Material): Promise<Rig> {
  let pending = rigs.get(id);
  if (pending === undefined) {
    pending = fetch(`${BASE}fauna/${id}.bin`)
      .then((response) => {
        if (!response.ok) throw new Error(`kit: fauna/${id}.bin answered ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => rigFrom(bytes, id, material));
    pending.catch(() => rigs.delete(id));
    rigs.set(id, pending);
  }
  return pending;
}

/**
 * The animals' rigs as `life.ts` asks for them: a rig that has arrived, or
 * `null` while its file is on its way (the first ask starts the fetch). A rig
 * that failed to load is asked for again on a later scan.
 */
export function createRigLibrary(material: THREE.Material): RigSource {
  const ready = new Map<string, Rig>();
  const asked = new Set<string>();
  return {
    get(id) {
      const rig = ready.get(id);
      if (rig !== undefined) return rig;
      if (!asked.has(id)) {
        asked.add(id);
        loadRig(id, material)
          .then((loaded) => ready.set(id, loaded))
          .catch((error: unknown) => {
            console.warn(`kit: the ${id} rig did not load`, error);
            asked.delete(id);
          });
      }
      return null;
    },
  };
}
