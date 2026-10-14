import './shell.ts';
import { type WorldSpec } from '../../src/worlds/contract.ts';
import * as THREE from 'three';
import { isGlassMaterial } from '../../src/craft/cabin.ts';
import { craftMaterial } from '../../src/craft/build.ts';
import { createEffects } from '../../src/effects.ts';
import { createSceneryContext } from '../../src/scenery/contract.ts';
import { createToonRamp, PALETTE } from '../../src/theme.ts';
import { createCraft, disposeCraft } from '../../src/worlds/craft.ts';
import { fail, only } from './setup.ts';
import { loadWorldSpec } from '../../src/worlds/registry.ts';

// ===========================================================================
// 4b. Leaving a world
// ===========================================================================

/**
 * What a visit makes that `leave` must free (`worlds/index.ts`): every
 * geometry, material, texture and instanced buffer reachable from what it
 * built, each listened to for its `dispose` event, then taken down the way
 * `leave` takes it down — the effects' pools, and a scenery context of the
 * visit's own with the craft drawn from it — and counted. A resource Earth
 * shares (the craft kit's material, the glass, anything marked `shared`) is
 * Earth's to keep and is left out.
 */
function checkLeave(spec: WorldSpec): void {
  console.log('\n=== leaving a world ===\n');
  const watched = new Map<THREE.EventDispatcher<{ dispose: object }>, string>();
  const freed = new Set<unknown>();
  const watch = (one: THREE.EventDispatcher<{ dispose: object }> | null | undefined, what: string): void => {
    if (one === null || one === undefined || watched.has(one)) return;
    watched.set(one, what);
    one.addEventListener('dispose', () => freed.add(one));
  };
  const shared = (material: THREE.Material): boolean => material.userData.shared === true || isGlassMaterial(material) || material === craftMaterial();
  const collect = (root: THREE.Object3D, label: string): void => {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry === undefined) return;
      watch(mesh.geometry, `${label}: a geometry`);
      if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh === true) watch(mesh as unknown as THREE.InstancedMesh, `${label}: an instanced mesh's buffers`);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (shared(material)) continue;
        watch(material, `${label}: material ${material.type}`);
        for (const value of Object.values(material)) if ((value as THREE.Texture | null)?.isTexture === true) watch(value as THREE.Texture, `${label}: a ${material.type}'s texture`);
      }
    });
  };
  const effects = createEffects();
  collect(effects.group, 'the effects');
  // The visit's own context and ramp, as `buildWorld` makes them.
  const visit = createSceneryContext();
  const ramp = createToonRamp(4);
  const crafts = spec.vehicles.map((vehicle, k) => {
    const craft = createCraft(vehicle, visit, ramp, new THREE.Vector3(0, 1000, 0), new THREE.Vector3(1, 0, 0), spec.wind);
    collect(craft.object, `craft ${k}`);
    return craft;
  });
  // A few of the context's own colours, as the towns and the people draw
  // with; their geometry is the builder's, merged and let go as it builds.
  for (const colour of [PALETTE.white, PALETTE.ink, PALETTE.bark]) {
    const box = visit.box(1, 1, 1, colour);
    collect(box, 'the scenery context');
    box.geometry.dispose();
  }
  effects.dispose();
  for (const craft of crafts) disposeCraft(craft);
  visit.dispose();
  ramp.dispose();
  const kept = new Map<string, number>();
  for (const [one, what] of watched) if (!freed.has(one)) kept.set(what, (kept.get(what) ?? 0) + 1);
  for (const [what, count] of kept) fail(`${spec.id}: leaving keeps ${count} of ${what}`);
  console.log(`  ${watched.size} resources made by the effects, ${crafts.length} craft and a scenery context: ${watched.size - [...kept.values()].reduce((a, b) => a + b, 0)} freed`);
}

if (only === undefined || only === 'mars') checkLeave(await loadWorldSpec('mars'));
