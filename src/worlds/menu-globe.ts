/**
 * A walked world as the menu draws it: **its own ground**, the very tiles the
 * world is walked on (`tiles.ts` over `terrain.ts`), drawn at the orrery's
 * size — so the planet you pick on the menu is the planet you land on, as
 * Earth's is, and not a painted ball standing in for it.
 *
 * Still and upright, as Earth's land is in the menu: the pole on +Y and
 * longitude 0 on +X, which is the frame the regions' rings, the frontiers and
 * a click on the globe are all in. No decorations: from the menu's distance
 * the quadtree never splits past its six faces, and nothing lying about on
 * the ground would show.
 */

import * as THREE from 'three';
import { WORLDS } from './registry.ts';
import { createTerrain } from './terrain.ts';
import { createGround } from './tiles.ts';
import { createToonRamp } from '../theme.ts';

/** How much finer than the walking rule the globe splits: see `Ground.detail`. */
const MENU_DETAIL = 4;
/** How long a frame of the menu may spend building tiles, ms. */
const BUILD_MS = 3;

export interface MenuGlobe {
  /** The ground, scaled to `drawnRadius`; the menu puts it at the body's centre. */
  object: THREE.Object3D;
  /** The ground's height at a direction, scaled to the drawn radius: what the frontiers and the ribbon ride on. */
  relief(x: number, y: number, z: number): number;
  /** Every frame: the eye, in the world, and the body's centre, for the tiles' choice. */
  update(eye: THREE.Vector3, centre: THREE.Vector3): void;
  dispose(): void;
}

export async function menuGlobeOf(id: string, drawnRadius: number): Promise<MenuGlobe | null> {
  const loader = WORLDS[id];
  if (loader === undefined) return null;
  const { WORLD } = await loader();
  const terrain = createTerrain(WORLD);
  const scale = drawnRadius / terrain.radius;
  const gradientMap = createToonRamp(4);
  const ground = createGround(terrain, { gradientMap });
  // The menu's fog is Earth's, set for Earth's distance; a planet a solar
  // system away would be the fog's colour.
  ground.material.fog = false;
  // Split further than the walking rule would from this far: the globe fills
  // the screen, and at the six faces' own detail its colours are steps.
  ground.detail = MENU_DETAIL;
  ground.material.needsUpdate = true;
  const object = new THREE.Group();
  object.name = `menu-globe-${id}`;
  object.scale.setScalar(scale);
  object.add(ground.group);
  const local = new THREE.Vector3();
  let primed = false;
  return {
    object,
    relief: (x, y, z) => terrain.heightAt(x, y, z) * scale,
    update(eye, centre) {
      local.copy(eye).sub(centre).divideScalar(scale);
      if (!primed) {
        ground.prime(local);
        primed = true;
      } else ground.update(local, BUILD_MS);
    },
    dispose() {
      object.removeFromParent();
      ground.dispose();
      gradientMap.dispose();
    },
  };
}
