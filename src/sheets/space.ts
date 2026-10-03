/**
 * `/sheets/space.html` — every model `scripts/build-space.ts` baked, under the
 * world's light, ramp and pen: the creatures playing their clips in turn, the
 * colony's buildings, the craft, the props, the alien flora, the planets and
 * the pieces of a ship's bridge, with a sketch of one bridge put together.
 *
 * It reads the baked files through `src/space-kit.ts`, the loader the worlds
 * and the title screen use, so what is drawn here is what they get.
 * `?paint=pack` shows the packs' own colours instead of the world's palette;
 * `?only=<group>` keeps one band; `?clip=<role>` holds every creature in one
 * role (`idle`, `walk`, `run`, `greet`, `yes`, `no`, `jump`, `dance`, `hover`,
 * `fly`) instead of cycling.
 *
 * Dev-only, like every sheet: not in `vite.config.ts`'s `input`.
 */
import * as THREE from 'three';
import { createContext } from '../monuments/contract.ts';
import { modelMaterial } from '../models.ts';
import { OutlineEffect } from '../outline.ts';
import { PALETTE, SKY_TOP } from '../theme.ts';
import { SPACE_GROUPS, loadSpaceGroup, loadSpaceKit, loadSpaceManifest, paintSpacePiece, spawnCreature } from '../space-kit.ts';
import type { ClipRole, SpaceCreature, SpaceEntry, SpaceGroup, SpacePaintMode, SpacePiece } from '../space-kit.ts';

const params = new URLSearchParams(location.search);
const paintMode: SpacePaintMode = params.get('paint') === 'pack' ? 'pack' : 'palette';
const only = params.get('only') ?? '';
const heldRole = params.get('clip') as ClipRole | null;

const ink: [number, number, number] = [0.11, 0.02, 0.01];
const ctx = createContext();
const source = ctx.toon(PALETTE.ink);
const material = modelMaterial(source.gradientMap!, source.userData.outlineParameters as { thickness: number; color: [number, number, number] });

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const outline = new OutlineEffect(renderer, { defaultThickness: 0.005, defaultColor: ink });

interface Cell {
  element: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  distance: number;
  elevation: number;
  bearing: number;
  spin: boolean;
  tick?: (dt: number) => void;
}
const cells: Cell[] = [];

function stage(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-38, 60, 42);
  scene.add(sun);
  return scene;
}

function ground(scene: THREE.Scene, radius: number, y: number, color: number = PALETTE.sand): void {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40).rotateX(-Math.PI / 2).toNonIndexed(), ctx.toon(color));
  disc.position.y = y - 0.002 * radius;
  disc.material.userData.outlineParameters = { visible: false };
  scene.add(disc);
}

function band(title: string, note: string, cls = ''): HTMLElement {
  const sheet = document.getElementById('sheet')!;
  const head = document.createElement('div');
  head.className = 'band';
  head.innerHTML = `<h2>${title}</h2><p>${note}</p>`;
  const grid = document.createElement('div');
  grid.className = `grid ${cls}`;
  sheet.append(head, grid);
  return grid;
}

function card(parent: HTMLElement, title: string, note: string, tall = false): { cell: Cell; caption: HTMLElement } {
  const element = document.createElement('div');
  element.className = 'cell';
  const stageEl = document.createElement('div');
  stageEl.className = tall ? 'stage tall' : 'stage';
  const caption = document.createElement('div');
  caption.className = 'caption';
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.innerHTML = note;
  caption.append(h, p);
  element.append(stageEl, caption);
  parent.append(element);
  const cell: Cell = {
    element: stageEl,
    scene: stage(),
    camera: new THREE.PerspectiveCamera(35, 4 / 3, 0.01, 2000),
    target: new THREE.Vector3(),
    distance: 1,
    elevation: 18,
    bearing: 0.7,
    spin: false,
  };
  cells.push(cell);
  return { cell, caption: p };
}

function notice(text: string): void {
  const el = document.createElement('div');
  el.className = 'notice';
  el.textContent = text;
  document.getElementById('notices')!.append(el);
}

/** Frames a box: the camera far enough that its bounding sphere fills most of the cell. */
function frameBox(cell: Cell, box: THREE.Box3, lift = 0.45): void {
  const size = box.getSize(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  cell.target.set(sphere.center.x, box.min.y + size.y * lift, sphere.center.z);
  cell.distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(35) / 2)) * 0.95;
}

const fmt = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(2));
const sizeOf = (entry: SpaceEntry) => entry.size.map(fmt).join(' &times; ');

function pieceCell(grid: HTMLElement, piece: SpacePiece, floor: boolean): void {
  const { entry, model } = piece;
  const { cell } = card(grid, entry.id, `<b>${entry.triangles}</b> tris · ${entry.slots} colours · ${sizeOf(entry)}<br>${entry.pack}${entry.tags.length ? ` · ${entry.tags.join(', ')}` : ''}`);
  const mesh = new THREE.Mesh(paintSpacePiece(piece, paintMode), material);
  cell.scene.add(mesh);
  if (floor) ground(cell.scene, model.box.getSize(new THREE.Vector3()).length() * 0.8, model.box.min.y);
  frameBox(cell, model.box);
  cell.spin = true;
}

const ROLES: readonly ClipRole[] = ['idle', 'walk', 'run', 'greet', 'yes', 'no', 'jump', 'dance', 'hover', 'fly'];

function creatureCell(grid: HTMLElement, creature: SpaceCreature): void {
  const { entry } = creature;
  const clips = entry.clips ?? [];
  const { cell, caption } = card(
    grid,
    `${entry.id} · ${entry.kind}`,
    `<b>${entry.triangles}</b> tris · ${entry.bones} bones · ${entry.slots} colours · ${((entry.bytes ?? 0) / 1024).toFixed(0)} KB<br>` +
      `${clips.map((c) => `${c.name} ${c.seconds}s`).join(' · ')}<br>${entry.pack} · now: <b class="now"></b>`,
    true,
  );
  const rigged = spawnCreature(creature, paintMode);
  cell.scene.add(rigged.root);
  const box = creature.rig.box.clone();
  ground(cell.scene, Math.max(box.max.x - box.min.x, creature.height) * 0.8, 0);
  // Framed on its standing height, not its bind-pose span: the arms are out in the bind pose.
  frameBox(cell, new THREE.Box3(new THREE.Vector3(-creature.height * 0.45, Math.min(0, box.min.y), -creature.height * 0.45), new THREE.Vector3(creature.height * 0.45, box.max.y, creature.height * 0.45)));
  cell.bearing = 0.5;
  const now = caption.querySelector('.now') as HTMLElement;
  const order = (heldRole !== null ? [heldRole] : ROLES)
    .map((role) => ({ role, clip: creature.clipFor(role) }))
    .filter((pair, i, all) => pair.clip !== null && all.findIndex((other) => other.clip === pair.clip) === i);
  let index = -1;
  let left = 0;
  let current: THREE.AnimationAction | null = null;
  cell.tick = (dt) => {
    left -= dt;
    if (left <= 0 && order.length > 0) {
      index = (index + 1) % order.length;
      const { role, clip } = order[index]!;
      const next = rigged.actions.get(clip!.name)!;
      next.reset().play();
      if (current !== null && current !== next) next.crossFadeFrom(current, 0.25, false);
      current = next;
      left = Math.max(2.5, clip!.duration * (clip!.duration < 1.5 ? 3 : 1));
      now.textContent = `${role} (${clip!.name})`;
    }
    rigged.mixer.update(dt);
  };
}

/**
 * A bridge out of the Space Station Kit, put together by the pieces' own
 * boxes: a floor, a window wall ahead, consoles under it, seats facing them,
 * and planets beyond the glass. A sketch of what the title screen could stand
 * in, not a layout anybody has to keep.
 */
function bridgeCell(grid: HTMLElement, interior: Map<string, SpacePiece>, planets: Map<string, SpacePiece>): void {
  const { cell } = card(grid, 'a bridge, sketched', 'floor-panel, wall-window, wall, computer-screen, chair-armrest-headrest, table-display-planet; planets past the glass', true);
  const group = new THREE.Group();
  const place = (id: string, x: number, z: number, yaw = 0, from: Map<string, SpacePiece> = interior): THREE.Mesh | null => {
    const piece = from.get(id);
    if (piece === undefined) return null;
    const mesh = new THREE.Mesh(paintSpacePiece(piece, paintMode), material);
    const box = piece.model.box;
    const centre = box.getCenter(new THREE.Vector3());
    const inner = new THREE.Group();
    mesh.position.set(-centre.x, -box.min.y, -centre.z);
    inner.add(mesh);
    inner.rotation.y = yaw;
    inner.position.set(x, 0, z);
    group.add(inner);
    return mesh;
  };
  const floorTop = interior.get('floor-panel')?.model.box.max.y ?? 0;
  const W = 5;
  const D = 4;
  for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) place(i === 0 || i === W - 1 || j === 0 ? 'floor' : 'floor-panel', i - (W - 1) / 2, j - D + 0.5);
  const raise = (mesh: THREE.Mesh | null) => mesh?.parent?.position.setY(floorTop);
  for (let i = 0; i < W; i++) raise(place(i === 0 || i === W - 1 ? 'wall' : 'wall-window', i - (W - 1) / 2, -D + 0.05));
  for (let j = 0; j < D; j++) {
    raise(place('wall', -W / 2 - 0.05, j - D + 0.5, Math.PI / 2));
    raise(place('wall', W / 2 + 0.05, j - D + 0.5, -Math.PI / 2));
  }
  for (const x of [-1, 0, 1]) {
    raise(place('computer-screen', x, -D + 0.75, 0));
    raise(place('chair-armrest-headrest', x, -D + 1.6, Math.PI));
  }
  raise(place('table-display-planet', 0, -1.2));
  for (const [id, x, y, z, scale] of [['planet-3', -3, 2.4, -14, 0.9], ['planet-10', 2.5, 1.2, -18, 1.4], ['planet-6', 6, 3.5, -24, 0.7]] as const) {
    const mesh = place(id, x, z, 0, planets);
    if (mesh !== null) {
      mesh.parent!.position.y = y;
      mesh.parent!.scale.setScalar(scale);
    }
  }
  cell.scene.add(group);
  cell.target.set(0, 0.6, -2);
  cell.distance = 6.5;
  cell.elevation = 22;
  cell.bearing = 0.35;
}

const BANDS: Record<SpaceGroup, { title: string; note: string; floor: boolean }> = {
  buildings: { title: 'The colony', note: 'Modules, domes, hangars, masts and power: Quaternius&rsquo;s Ultimate Space Kit and Kenney&rsquo;s Space Kit.', floor: true },
  craft: { title: 'Craft', note: 'Rovers for the ground, ships for the sky. Facing as authored; the bake turns none of them.', floor: true },
  props: { title: 'Rocks, crystals, clutter', note: 'Scattered by the worlds&rsquo; decor.', floor: true },
  flora: { title: 'Alien flora', note: 'The space kit&rsquo;s trees, bushes, plants and grass.', floor: true },
  planets: { title: 'Planets', note: 'Eleven little worlds, for the title screen&rsquo;s window.', floor: false },
  interior: { title: 'A ship&rsquo;s bridge, in pieces', note: 'Kenney&rsquo;s Space Station Kit on its one-unit grid, and the Space Kit&rsquo;s desk seats.', floor: false },
};

async function build(): Promise<void> {
  const manifest = await loadSpaceManifest();
  const select = document.getElementById('only') as HTMLSelectElement;
  for (const value of ['creatures', ...SPACE_GROUPS]) select.add(new Option(value, value, false, value === only));
  select.onchange = () => {
    params.set('only', select.value);
    location.search = params.toString();
  };
  const paintSelect = document.getElementById('paint') as HTMLSelectElement;
  paintSelect.value = paintMode === 'pack' ? 'pack' : 'palette';
  paintSelect.onchange = () => {
    params.set('paint', paintSelect.value);
    location.search = params.toString();
  };
  const creatures = manifest.filter((entry) => entry.group === 'creatures');
  const statics = manifest.filter((entry) => entry.group !== 'creatures');
  document.getElementById('totals')!.innerHTML =
    `<b>${creatures.length}</b> creatures · <b>${statics.length}</b> static models · ` +
    `<b>${manifest.reduce((sum, entry) => sum + entry.triangles, 0).toLocaleString()}</b> tris in all`;

  if (only === '' || only === 'creatures') {
    const kit = await loadSpaceKit({ creatures: creatures.map((entry) => entry.id) }, material);
    for (const kind of ['crew', 'walker', 'blob', 'flyer'] as const) {
      const grid = band(
        { crew: 'The crew', walker: 'Aliens that walk', blob: 'Aliens that hop', flyer: 'Aliens that float' }[kind],
        { crew: 'The space kit&rsquo;s four astronauts, pistols left out.', walker: 'Humanoid rigs, 43 bones: idle, walk, run, wave, yes, no, jump.', blob: 'Four-bone blobs: idle, walk, dance, yes, no, jump.', flyer: 'They hover where a walker stands; flying_idle and fast_flying.' }[kind],
      );
      for (const entry of creatures.filter((row) => row.kind === kind)) creatureCell(grid, kit.creatures.get(entry.id)!);
    }
  }
  for (const group of SPACE_GROUPS) {
    if (only !== '' && only !== group) continue;
    const pieces = await loadSpaceGroup(group);
    const spec = BANDS[group];
    const grid = band(spec.title, spec.note, 'tight');
    if (group === 'interior') bridgeCell(band('A bridge', 'The pieces above, assembled by their boxes.', 'wide'), pieces, await loadSpaceGroup('planets'));
    for (const piece of pieces.values()) pieceCell(grid, piece, spec.floor);
  }
}

build()
  .then(() => ((window as unknown as { spaceReady: boolean }).spaceReady = true))
  .catch((error: unknown) => {
    console.error(error);
    notice(`The space kit did not load: ${String(error)}. Run \`pnpm space-kit\`.`);
    (window as unknown as { spaceError: string }).spaceError = String(error);
  });

let last = performance.now();
let spin = 0;
function render(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  spin += dt * 0.35;
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setClearColor(SKY_TOP, 1);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const cell of cells) {
    const rect = cell.element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.width < 4) continue;
    cell.tick?.(dt);
    const bearing = cell.bearing + (cell.spin ? spin : 0);
    const elevation = THREE.MathUtils.degToRad(cell.elevation);
    cell.camera.position.set(
      cell.target.x + Math.sin(bearing) * Math.cos(elevation) * cell.distance,
      cell.target.y + Math.sin(elevation) * cell.distance,
      cell.target.z + Math.cos(bearing) * Math.cos(elevation) * cell.distance,
    );
    cell.camera.lookAt(cell.target);
    cell.camera.aspect = rect.width / rect.height;
    cell.camera.near = cell.distance / 200;
    cell.camera.far = cell.distance * 20;
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
