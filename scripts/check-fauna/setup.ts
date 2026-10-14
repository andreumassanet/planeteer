import { rigFromDisk } from '../kit-node.ts';
import * as THREE from 'three';
import { MeshBasicMaterial } from 'three';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Animal, createFaunaContext, VARIANTS } from '../../src/fauna/contract.ts';
import { readdirSync } from 'node:fs';
import { FAUNA_STYLES } from '../../src/fauna/regions.ts';

// The herds are drawn from baked CC0 rigs (scripts/build-kit.ts), read off disk
// the way the world fetches them. Every rig an animal names is loaded up front,
// so no herd in these checks waits on one.
const RIG_IDS = ['cow', 'bull', 'horse', 'donkey', 'sheep', 'alpaca', 'stag', 'camel'];
const RIGS = new Map(await Promise.all(RIG_IDS.map(async (id) => [id, await rigFromDisk(id, new MeshBasicMaterial())] as const)));
export const rigs = { get: (id: string) => RIGS.get(id) ?? null };

export function fingerprint(group: THREE.Group): string {
  group.updateMatrixWorld(true);
  const parts: string[] = [];
  const vertex = new THREE.Vector3();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    parts.push(`#${material?.userData.atlasToon ?? 'none'}`);
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      parts.push(`${vertex.x.toFixed(4)},${vertex.y.toFixed(4)},${vertex.z.toFixed(4)}`);
    }
  });
  return parts.join('|');
}

export const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PARTS = resolve(here, '../src/fauna/parts');

export let failures = 0;
export const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};
export const n = (value: number, places = 3): string => value.toFixed(places);

// --- the registry, read off disk -------------------------------------------
//
// `src/fauna/index.ts` is built on `import.meta.glob`, which is a Vite
// transform and does not exist in Node. The same trick `check-traffic.ts` and
// `build-monuments.ts` use: walk `parts/` and import each file.

export const ANIMALS: Animal[] = [];
export const registryProblems: string[] = [];
for (const file of readdirSync(PARTS).filter((name) => name.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(PARTS, file)).href)) as Record<string, unknown>;
  const found = Object.values(module).filter(
    (value): value is Animal =>
      typeof value === 'object' && value !== null &&
      typeof (value as Animal).id === 'string' &&
      typeof (value as Animal).build === 'function' &&
      typeof (value as Animal).shape === 'function',
  );
  if (found.length === 0) registryProblems.push(`${file} exports no animal`);
  for (const entry of found) {
    if (file !== `${entry.id}.ts`) registryProblems.push(`${file} holds '${entry.id}'`);
    ANIMALS.push(entry);
  }
}
ANIMALS.sort((a, b) => a.id.localeCompare(b.id));

export const ctx = createFaunaContext();
export const STYLES = Object.values(FAUNA_STYLES);

console.log(`\natlas fauna — ${ANIMALS.length} animals x ${STYLES.length} regions x ${VARIANTS} variants`);
