import * as THREE from 'three';
import { AVATAR_HEIGHT, buildAvatar, prepareAvatar } from '../avatar.ts';
import type { Avatar } from '../avatar.ts';
import { createContext } from '../monuments/contract.ts';
import { OutlineEffect } from '../outline.ts';
import { PALETTE, SKY_TOP } from '../theme.ts';
import { SETS } from './lab-sets.ts';
import type { LabCell, LabShared } from './lab-sets.ts';

/**
 * The lab: what the world draws today beside the CC0 candidates that might
 * replace it, in the world's own light and pen, at the world's own scale.
 *
 * A review tool and never in the production build, like every sheet. The sets
 * that load raw pack models need them at `/lab-assets/`, which
 * `scripts/lab.vite.mjs` serves from `../.cache/assets`. `?set=`
 * picks a comparison (see `lab-sets.ts`), `?az=` the bearing, `?el=` the
 * elevation in degrees, `?hero=0` leaves the scale figure out, `?row=` keeps
 * the rows whose heading contains it.
 */

const params = new URLSearchParams(location.search);
const setName = params.get('set') ?? Object.keys(SETS)[0]!;
const azimuth = (Number(params.get('az') ?? 35) * Math.PI) / 180;
const elevation = (Number(params.get('el') ?? 22) * Math.PI) / 180;
const withHero = params.get('hero') !== '0';
if (params.has('wide')) document.body.classList.add('wide');
const ink: [number, number, number] = [0.11, 0.02, 0.01];

const ctx = createContext();
const source = ctx.toon(PALETTE.ink);
const shared: LabShared = {
  ctx,
  gradientMap: source.gradientMap!,
  ink: source.userData.outlineParameters as { thickness: number; color: [number, number, number] },
};

interface Built {
  spec: LabCell;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  frame: HTMLElement;
  target: THREE.Vector3;
  distance: number;
  mixers: THREE.AnimationMixer[];
  hero?: Avatar;
  stats: string;
}

function stage(radius: number): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const hemisphere = new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35);
  hemisphere.position.set(0, 1, 0);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-0.8, 1.25, 0.75);
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1.6, 48), ctx.toon(PALETTE.green));
  ground.position.y = -0.8;
  scene.add(ground);
  return scene;
}

function cellFrame(spec: LabCell): { frame: HTMLElement; bar: HTMLElement } {
  const cell = document.createElement('div');
  cell.className = `cell ${spec.current ? 'current' : ''}`;
  const frame = document.createElement('div');
  frame.className = 'frame';
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = '<b></b><span></span>';
  bar.querySelector('b')!.textContent = spec.label;
  bar.querySelector('span')!.textContent = spec.note ?? '';
  cell.append(frame, bar);
  document.getElementById('grid')!.append(cell);
  return { frame, bar };
}

function countTriangles(object: THREE.Object3D): { triangles: number; meshes: number } {
  let triangles = 0;
  let meshes = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !child.visible) return;
    meshes++;
    const geometry = mesh.geometry;
    triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  });
  return { triangles: Math.round(triangles), meshes };
}

async function build(): Promise<Built[]> {
  await prepareAvatar();
  const set = SETS[setName];
  if (set === undefined) throw new Error(`lab: no set '${setName}' (have ${Object.keys(SETS).join(', ')})`);
  document.getElementById('title')!.textContent = `lab · ${setName}`;
  document.getElementById('note')!.textContent = set.note;
  const all = await set.cells(shared);
  // `?row=boats` keeps only the rows whose heading contains that text.
  const row = params.get('row');
  let current = '';
  const specs = all.filter((spec) => {
    if (spec.heading !== undefined) current = spec.heading;
    return row === null || current.includes(row);
  });
  const built: Built[] = [];
  for (const spec of specs) {
    if (spec.heading !== undefined) {
      const h = document.createElement('h2');
      h.textContent = spec.heading;
      document.getElementById('grid')!.append(h);
    }
    const { frame, bar } = cellFrame(spec);
    let object: THREE.Object3D;
    const mixers: THREE.AnimationMixer[] = [];
    let madeStats = '';
    try {
      const made = await spec.build(shared);
      object = made.object;
      madeStats = made.stats ?? '';
      if (made.mixer) mixers.push(made.mixer);
    } catch (error) {
      bar.querySelector('span')!.textContent = `failed: ${String(error)}`;
      console.error(spec.label, error);
      continue;
    }
    const { triangles, meshes } = countTriangles(object);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object, true);
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, size.y * 1.2, AVATAR_HEIGHT * 1.4);
    const scene = stage(span * 2.2);
    scene.add(object);
    let hero: Avatar | undefined;
    if (withHero && spec.hero !== false) {
      hero = buildAvatar();
      if (spec.heroFront) {
        hero.group.position.set((box.min.x + box.max.x) / 2, 0, box.max.z + 3);
        hero.group.rotation.y = Math.PI * 0.8;
      } else {
        hero.group.position.set(box.max.x + 2.5, 0, (box.min.z + box.max.z) / 2);
        hero.group.rotation.y = -Math.PI / 2;
        box.expandByPoint(new THREE.Vector3(box.max.x + 4.5, AVATAR_HEIGHT, 0));
      }
      scene.add(hero.group);
    }
    const target = box.getCenter(new THREE.Vector3());
    target.y = Math.min(target.y, size.y * 0.45);
    const radius = box.getSize(new THREE.Vector3()).length() * 0.5;
    const distance = (radius / Math.tan((25 * Math.PI) / 180)) * (spec.zoom ?? 1);
    const extra = [spec.stats, madeStats].filter(Boolean).join(' · ');
    const note = `${spec.note ?? ''} · ${triangles.toLocaleString()} tris · ${meshes} mesh${meshes === 1 ? '' : 'es'} · ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)}u${extra ? ` · ${extra}` : ''}`;
    bar.querySelector('span')!.textContent = note;
    built.push({
      spec,
      scene,
      camera: new THREE.PerspectiveCamera(params.has('wide') ? 30 : 50, 4 / 3, 0.2, distance * 8),
      frame,
      target,
      distance,
      mixers,
      hero,
      stats: note,
    });
  }
  return built;
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const outline = new OutlineEffect(renderer, { defaultThickness: 0.005, defaultColor: ink });
const freezeInput = document.getElementById('freeze') as HTMLInputElement;
const turnInput = document.getElementById('turn') as HTMLInputElement;

let cells: Built[] = [];
build()
  .then((made) => {
    cells = made;
    (window as unknown as { labReady: boolean; labStats: string[] }).labStats = made.map((cell) => `${cell.spec.label}: ${cell.stats}`);
    (window as unknown as { labReady: boolean }).labReady = true;
  })
  .catch((error) => {
    console.error(error);
    (window as unknown as { labError: string }).labError = String(error);
  });

let spin = 0;
let last = performance.now();
function render(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const running = !freezeInput.checked;
  if (running && turnInput.checked) spin += dt * 0.5;
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setClearColor(SKY_TOP, 1);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const cell of cells) {
    const rect = cell.frame.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.width < 4) continue;
    if (running) {
      cell.hero?.stride(dt, 0, false);
      for (const mixer of cell.mixers) mixer.update(dt);
    }
    const turn = azimuth + (cell.spec.az ?? 0) + (turnInput.checked ? spin : 0);
    cell.camera.position.set(
      cell.target.x + Math.sin(turn) * Math.cos(elevation) * cell.distance,
      cell.target.y + Math.sin(elevation) * cell.distance,
      cell.target.z + Math.cos(turn) * Math.cos(elevation) * cell.distance,
    );
    cell.camera.lookAt(cell.target);
    cell.camera.aspect = rect.width / rect.height;
    cell.camera.updateProjectionMatrix();
    const bottom = innerHeight - rect.bottom;
    renderer.setViewport(rect.left, bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, bottom, rect.width, rect.height);
    outline.render(cell.scene, cell.camera);
  }
  renderer.setScissorTest(false);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
