/**
 * `/sheets/fauna.html` — every animal, its variants, its poses, a herd of them,
 * and the walk cycle laid out as phases.
 *
 * **The gait band is the reason this page exists.** `pnpm fauna` can say that no
 * hoof goes below the floor and that every fold is a fold that lifts, and those
 * are the assertions that matter; what it cannot say is whether the thing *reads
 * as an animal walking*. The cycle is drawn here at eight phases side by side,
 * from the quarter view the world actually shows a herd from, so a leg that is
 * technically correct and looks like a hinge is visible.
 *
 * The scale band is the second reason. The kit's whole scale argument is a
 * relation to a person — *a 1.4 m cow is 78% of a 6.8-unit avatar where at
 * scenery scale she would be 26%* — and a claim about a relation is worth
 * nothing until the two things are in the same frame. So the last band stands
 * one of each beside a villager out of `people.ts`.
 *
 * Dev-only, like every sheet in this directory: none of them is in
 * `vite.config.ts`'s `input`, and that file carries the measurement saying why.
 */
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { PALETTE, SKY_TOP } from '../theme.ts';
import { createSceneryContext } from '../scenery/contract.ts';
import { buildPerson } from '../scenery/people.ts';
import { lookFor } from '../scenery/dress.ts';
import { rngFrom } from '../scenery/random.ts';
import {
  ANIMALS,
  FAUNA_STYLES,
  KINDS,
  MISSING_REGIONS,
  REGISTRY_PROBLEMS,
  SKIPPED,
  VARIANTS,
  buildAnimal,
  createFaunaContext,
  extentOf,
  measure,
  namedByTables,
  reviewAnimal,
  variantRng,
} from '../fauna/index.ts';
import type { FaunaContext, FaunaStyle, RegionId } from '../fauna/index.ts';
import type { Pose } from '../fauna/body.ts';

const sceneryCtx = createSceneryContext();
const ctx: FaunaContext = createFaunaContext(sceneryCtx);

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setScissorTest(true);
const outline = new OutlineEffect(renderer, { defaultThickness: 0.005, defaultColor: [0.11, 0.02, 0.01] });

interface Cell {
  element: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}
const cells: Cell[] = [];

/** One stage, lit the way the world is lit. */
function stage(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-38, 60, 42);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(55, 4 / 3, 0.4, 2000);
  return { scene, camera };
}

/** A disc of ground, so an animal is standing on something. */
function ground(scene: THREE.Scene, radius: number, color = PALETTE.green): void {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 40).rotateX(-Math.PI / 2).toNonIndexed(),
    sceneryCtx.toon(color),
  );
  disc.position.y = -0.02;
  disc.material.userData.outlineParameters = { visible: false };
  scene.add(disc);
}

/**
 * Frames a subject at the distance and elevation the world actually shows it.
 *
 * 18 degrees up and a quarter view, which is where the third-person camera sits
 * over a herd on foot — and it is the one framing the shallow-camera trap says
 * to build for: *on a shallow camera a near mass hides far more than its own
 * height*, so a herd reviewed from overhead is a herd nobody will see.
 */
function frame(camera: THREE.PerspectiveCamera, target: THREE.Vector3, distance: number, bearing = 0.85): void {
  const elevation = 18 * (Math.PI / 180);
  camera.position.set(
    target.x + Math.sin(bearing) * Math.cos(elevation) * distance,
    target.y + Math.sin(elevation) * distance,
    target.z + Math.cos(bearing) * Math.cos(elevation) * distance,
  );
  camera.lookAt(target);
}

function card(parent: HTMLElement, title: string, note: string, tall = false): Cell {
  const element = document.createElement('div');
  element.className = 'cell';
  const stageEl = document.createElement('div');
  stageEl.className = tall ? 'stage tall' : 'stage';
  element.append(stageEl);
  const caption = document.createElement('div');
  caption.className = 'caption';
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.innerHTML = note;
  caption.append(h, p);
  element.append(caption);
  parent.append(element);
  const { scene, camera } = stage();
  const cell: Cell = { element: stageEl, scene, camera };
  cells.push(cell);
  return cell;
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

function notice(text: string, calm = false): void {
  const el = document.createElement('div');
  el.className = `notice${calm ? ' calm' : ''}`;
  el.textContent = text;
  document.getElementById('notices')!.append(el);
}

// ---------------------------------------------------------------------------

const regionSelect = document.getElementById('region') as HTMLSelectElement;
for (const id of Object.keys(FAUNA_STYLES) as RegionId[]) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = FAUNA_STYLES[id].name;
  regionSelect.append(option);
}
regionSelect.value = 'atlantic-europe';
regionSelect.addEventListener('change', rebuild);

function rebuild(): void {
  cells.length = 0;
  document.getElementById('sheet')!.replaceChildren();
  document.getElementById('notices')!.replaceChildren();

  const style: FaunaStyle = FAUNA_STYLES[regionSelect.value as RegionId];

  for (const problem of REGISTRY_PROBLEMS) notice(problem);
  for (const path of SKIPPED) notice(`${path} exports no animal — a typo in an export?`);
  for (const id of MISSING_REGIONS) notice(`region '${id}' has houses and no fauna table`);
  const { unknown, orphans } = namedByTables();
  for (const id of unknown) notice(`a table names '${id}' and no such animal exists`);
  for (const id of orphans) notice(`nothing will ever build '${id}' — no biome and no region names it`);

  let triangles = 0;
  for (const animal of ANIMALS) triangles += measure(animal.build(ctx, variantRng(animal, style, 0), style)).triangles;
  document.getElementById('totals')!.innerHTML =
    `<b>${ANIMALS.length}</b> animals · <b>${triangles}</b> triangles for one of each · ` +
    `<b>${Object.keys(FAUNA_STYLES).length}</b> regions`;

  // --- band 1: every animal, standing, at the distance a herd is seen -------
  {
    const grid = band(
      'Standing, at 40 units',
      'Where the player meets one. Read the <b>silhouette</b> first: the horn, the hump, the ear and the ' +
      'neck are the whole of what tells these six apart at any distance at all, and the coat is the last of it.',
    );
    for (const animal of ANIMALS) {
      const review = reviewAnimal(animal, ctx, style, 1);
      const built = review.groups[0]!;
      const extent = extentOf(built);
      const measured = review.measurements[0]!;
      const kind = KINDS[animal.kind];
      const bad = review.problems.length > 0;
      const cell = card(
        grid,
        animal.name,
        `${extent.length.toFixed(1)} &times; ${extent.width.toFixed(1)} &times; ${extent.height.toFixed(1)} · ` +
        `<b>${measured.triangles}</b>/${kind.triangles} tris · ${measured.meshes} meshes · ` +
        `${measured.colors.length} colours · ${animal.gait}` +
        (bad ? `<span class="warn"><br>${review.problems.join('<br>')}</span>` : `<br>${animal.note ?? ''}`),
      );
      ground(cell.scene, extent.length);
      cell.scene.add(built);
      frame(cell.camera, new THREE.Vector3(0, extent.height * 0.45, 0), 40);
    }
  }

  // --- band 2: the poses ---------------------------------------------------
  {
    const grid = band(
      'The three static poses',
      'A merged herd is <b>frozen</b>, so a pose that floats is a pose that is wrong for ever. ' +
      '<code>graze</code> is solved rather than tabulated: the crouch and the neck angle are computed so the ' +
      'muzzle lands on the grass, because a cow&rsquo;s neck is 0.17 m too short to reach it by bending alone.',
      'tight',
    );
    const poses: Pose[] = [{ kind: 'graze' }, { kind: 'stand' }, { kind: 'alert' }];
    for (const animal of ANIMALS.slice(0, 3)) {
      for (const pose of poses) {
        const shape = animal.shape(variantRng(animal, style, 1), style);
        const body = buildAnimal(ctx, shape, pose);
        const extent = extentOf(body.group);
        const cell = card(grid, `${animal.name} · ${pose.kind}`, `${extent.height.toFixed(2)} tall`);
        ground(cell.scene, extent.length);
        cell.scene.add(body.group);
        frame(cell.camera, new THREE.Vector3(0, extent.height * 0.45, 0), 34, 1.25);
      }
    }
  }

  // --- band 3: the gait ----------------------------------------------------
  {
    const grid = band(
      'The walk, eight phases of the cycle',
      'The band <b>this page exists for</b>. A fore leg folds backwards at the carpus and a hind leg folds ' +
      'forwards at the hock, and the two therefore need opposite gates &mdash; the arithmetic is in ' +
      '<code>foldLifts</code> and the sweep is in <code>pnpm fauna</code>. What no number can say is whether ' +
      'it reads as a walk. Cattle is four-beat; the camel below it is a <b>pace</b> and moves one whole side at a time.',
      'tight',
    );
    for (const id of ['cattle', 'camel']) {
      const animal = ANIMALS.find((entry) => entry.id === id);
      if (animal === undefined) continue;
      const shape = animal.shape(variantRng(animal, style, 0), style);
      for (let phase = 0; phase < 8; phase++) {
        const body = buildAnimal(ctx, shape, { kind: 'walk', gait: animal.gait, phase: phase / 8 });
        const extent = extentOf(body.group);
        const cell = card(grid, `${animal.name} ${phase}/8`, `${animal.gait}`);
        ground(cell.scene, extent.length);
        cell.scene.add(body.group);
        // Broadside, because that is where a leg swing is not foreshortened —
        // the avatar's own trap: everything an animator reaches for first is
        // invisible from directly behind.
        frame(cell.camera, new THREE.Vector3(0, extent.height * 0.45, 0), 30, Math.PI / 2);
      }
    }
  }

  // --- band 4: a herd ------------------------------------------------------
  {
    const grid = band(
      'A herd, which is one draw call',
      'Five animals in one merged buffer. <code>settlements.ts</code> measured merging a town at ' +
      '<b>one draw call against 218</b>, and grazing is the one activity in this world that is honestly ' +
      'motionless &mdash; so a herd gets the cheap answer and the right picture at the same time. ' +
      'Measured in the world at Ulm, detail 1: <b>8 herds, 41 animals, 9 meshes</b>.',
      'wide',
    );
    for (const animal of ANIMALS) {
      const group = new THREE.Group();
      const kind = KINDS[animal.kind];
      const heads = Math.round((kind.group[0] + kind.group[1]) / 2);
      const spread = Math.max(13, animal.size[0] * 0.55 * Math.sqrt(heads));
      const poses: Pose['kind'][] = ['graze', 'graze', 'stand', 'graze', 'alert', 'stand', 'graze', 'stand', 'graze'];
      for (let i = 0; i < heads; i++) {
        const rng = rngFrom('sheet', animal.id, i);
        const body = buildAnimal(
          ctx,
          animal.shape(variantRng(animal, style, rng.int(VARIANTS)), style),
          { kind: poses[i % poses.length]! } as Pose,
        );
        const angle = rng.unit() * Math.PI * 2;
        const radius = Math.sqrt(rng.unit()) * spread;
        body.group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        body.group.rotation.y = rng.unit() * Math.PI * 2;
        const scale = rng.spread(1, 0.07);
        body.group.scale.setScalar(scale);
        group.add(body.group);
      }
      const cell = card(
        grid,
        `${heads} ${animal.name.toLowerCase()}`,
        `spread ${spread.toFixed(0)} units · one mesh in the world`,
      );
      ground(cell.scene, spread * 1.9, PALETTE.green);
      cell.scene.add(group);
      frame(cell.camera, new THREE.Vector3(0, animal.size[2] * 0.4, 0), spread * 3.4, 0.9);
    }
  }

  // --- band 5: the scale claim, with the person in the frame ---------------
  {
    const grid = band(
      'Beside a person, which is the whole scale argument',
      'The kit is at <b>avatar scale</b>, 3.78 units per metre, and not at <code>SCENERY_SCALE</code>&rsquo;s ' +
      '1.267. At scenery scale a 1.4 m cow is 1.77 units against a 6.8-unit person &mdash; <b>26% of him, ' +
      'where life gives 80%</b>, which is the roof-at-the-knee reading the traffic kit calls <i>broken</i>. ' +
      'A vehicle could not have this, because it also has to fit a road; an animal has no road to fit.',
      'wide',
    );
    for (const animal of ANIMALS) {
      const group = new THREE.Group();
      const body = buildAnimal(ctx, animal.shape(variantRng(animal, style, 0), style), { kind: 'stand' });
      body.group.position.x = 4;
      group.add(body.group);
      const person = buildPerson(sceneryCtx, lookFor(rngFrom('sheet', 'person', animal.id), 'atlantic-europe', {}));
      person.position.x = -4;
      person.rotation.y = 0.4;
      group.add(person);
      const extent = extentOf(body.group);
      const cell = card(
        grid,
        `${animal.name} and a villager`,
        `${extent.height.toFixed(2)} against the avatar's 6.80 &mdash; ` +
        `<b>${((100 * extent.height) / 6.8).toFixed(0)}%</b> of him`,
      );
      ground(cell.scene, 16);
      cell.scene.add(group);
      frame(cell.camera, new THREE.Vector3(0, 3.4, 0), 42, 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
// One context, scissored per cell.
// ---------------------------------------------------------------------------

function draw(): void {
  const width = innerWidth;
  const height = innerHeight;
  if (canvas.width !== width * renderer.getPixelRatio() || canvas.height !== height * renderer.getPixelRatio()) {
    renderer.setSize(width, height, false);
  }
  renderer.setScissor(0, 0, width, height);
  renderer.setViewport(0, 0, width, height);
  renderer.clear();
  for (const cell of cells) {
    const rect = cell.element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > height || rect.width < 2) continue;
    const bottom = height - rect.bottom;
    renderer.setScissor(rect.left, bottom, rect.width, rect.height);
    renderer.setViewport(rect.left, bottom, rect.width, rect.height);
    cell.camera.aspect = rect.width / rect.height;
    cell.camera.updateProjectionMatrix();
    outline.render(cell.scene, cell.camera);
  }
  requestAnimationFrame(draw);
}

rebuild();
draw();
addEventListener('resize', () => {});

/** For the console, and for a screenshot script that wants to know it is ready. */
(window as unknown as { fauna: unknown }).fauna = { ANIMALS, cells, rebuild };
