/** The figure's own renderer and the scene drawn with it, all of it gone when the stage goes. */
import * as THREE from 'three';
import type { Person } from '../cast.ts';
import { OutlineEffect } from '../outline.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE, SKY_TOP } from '../theme.ts';
import type { HeroCtx } from './ctx.ts';
import { LENS } from './shots.ts';

/** The renderer and everything drawn with it, all of it gone when the stage goes. */
export interface Scene {
  renderer: THREE.WebGLRenderer;
  outline: OutlineEffect;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  turntable: THREE.Group;
  plinth: THREE.Mesh[];
  person: Person | null;
  worn: string;
  /** The portraits': a scene of their own with the same light, and a square lens. */
  portraitScene: THREE.Scene;
  portraitTable: THREE.Group;
  portraitCamera: THREE.PerspectiveCamera;
  frame: number;
  last: number;
}

/** The light the world has by day, which the traveller's card always had. */
function light(scene: THREE.Scene, shadows: boolean): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
  sun.position.set(-3, 6, 4);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
    sun.shadow.camera.right = sun.shadow.camera.top = 4;
  }
  // A warm rim from behind on the other side, so the silhouette lifts off a dark backdrop.
  const rim = new THREE.DirectionalLight(0xffd9b0, 0.9);
  rim.position.set(4, 3, -5);
  scene.add(sun, sun.target, rim, rim.target);
}

export function buildScene(ctx: HeroCtx): Scene {
  const { view } = ctx;
  const canvas = document.createElement('canvas');
  view.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  const outline = new OutlineEffect(renderer, { defaultThickness: 0.0035, defaultColor: [0.11, 0.02, 0.01] });
  const scene = new THREE.Scene();
  light(scene, true);
  const turntable = new THREE.Group();
  scene.add(turntable);
  // A little world to stand on: a disc of grass on a bank of earth, round
  // and thick enough to read as one, under the same pen as the figure.
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(AVATAR_HEIGHT * 0.5, AVATAR_HEIGHT * 0.49, AVATAR_HEIGHT * 0.05, 56),
    new THREE.MeshToonMaterial({ color: PALETTE.green }),
  );
  top.position.y = -AVATAR_HEIGHT * 0.025;
  top.receiveShadow = true;
  const bank = new THREE.Mesh(
    new THREE.CylinderGeometry(AVATAR_HEIGHT * 0.47, AVATAR_HEIGHT * 0.38, AVATAR_HEIGHT * 0.1, 56),
    new THREE.MeshToonMaterial({ color: PALETTE.brown }),
  );
  bank.position.y = -AVATAR_HEIGHT * 0.1;
  scene.add(top, bank);
  const camera = new THREE.PerspectiveCamera(LENS, 1, 0.1, 200);
  const portraitScene = new THREE.Scene();
  light(portraitScene, false);
  const portraitTable = new THREE.Group();
  portraitScene.add(portraitTable);
  const portraitCamera = new THREE.PerspectiveCamera(LENS, 1, 0.1, 200);
  return {
    renderer,
    outline,
    scene,
    camera,
    turntable,
    plinth: [top, bank],
    person: null,
    worn: '',
    portraitScene,
    portraitTable,
    portraitCamera,
    frame: 0,
    last: performance.now(),
  };
}
