import * as THREE from 'three';
import { OutlineEffect } from '../outline.ts';
import { PALETTE, SKY_TOP } from '../theme.ts';
import {
  MONUMENTS,
  REGISTRY_PROBLEMS,
  SKIPPED,
  TIERS,
  createContext,
  paletteName,
  reviewMonument,
  validate,
} from '../monuments/index.ts';
import type { MonumentContext, Review } from '../monuments/index.ts';

/**
 * `/sheets/monuments.html` — the contact sheet.
 *
 * A hundred monuments cannot be reviewed by opening a hundred files, and they
 * cannot be reviewed in the world either — you would have to walk to each one.
 * This is the tool that makes the whole set reviewable: every registered
 * monument on one page, under identical light, against the same ground and the
 * same 6.8-unit figure, with the validator's complaints printed underneath.
 *
 * Everything on it is drawn into a **single** WebGL context, scissored cell by
 * cell. A canvas each is the obvious implementation and it dies at about sixteen
 * cells, which is a limit you discover at monument seventeen.
 */

/** The one thing the validator cannot check is which way the front is. So: fixed views. */
const VIEWS = {
  quarter: new THREE.Vector3(0.62, 0.28, 1).normalize(),
  front: new THREE.Vector3(0, 0.12, 1).normalize(),
};

const SPIN_RATE = 0.35;

const ctx: MonumentContext = createContext();
const reviews: Review[] = MONUMENTS.map((monument) => reviewMonument(monument, ctx));

// ---------------------------------------------------------------------------
// The shared bits of every cell: light, ground, and something 6.8 units tall
// ---------------------------------------------------------------------------

/**
 * A stand-in for the player, at exactly the avatar's height.
 *
 * This is the most useful thing on the sheet. "Is the Colosseum too big?" is
 * unanswerable looking at a Colosseum on its own and obvious the moment there is
 * a person beside it. Same palette as `player.ts` so it reads as *the* avatar.
 */
function scaleFigure(): THREE.Group {
  const figure = new THREE.Group();
  for (const side of [1, -1]) {
    const leg = ctx.box(0.95, 3, 0.9, PALETTE.steel);
    leg.position.x = side * 0.62;
    figure.add(leg);
  }
  const torso = ctx.box(2.5, 2.7, 1.35, PALETTE.skyBlue);
  torso.position.y = 3;
  figure.add(torso);
  const head = ctx.box(1.4, 1.4, 1.4, PALETTE.blush);
  head.position.y = 5.4;
  figure.add(head);
  return figure;
}

function buildScene(review: Review): { scene: THREE.Scene; spinner: THREE.Group } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_TOP);

  // The same light as `main.ts`, minus the sun's travel. Deliberately little
  // ambient: flatten it and the cel ramp has no range to step across.
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-0.8, 1.25, 0.75);
  scene.add(sun, sun.target);

  const reach = Math.max(review.monument.footprint, 8);
  const ground = ctx.column(reach * 1.55, 0.8, PALETTE.green, 40);
  ground.position.y = -0.8;
  scene.add(ground);

  // A bar on the +Z edge of the ground. The contract says a monument faces +Z
  // and nothing in the geometry can prove it, so the sheet marks the direction
  // and leaves the judging to the one pair of eyes that has to do it.
  const front = ctx.box(reach * 0.5, 0.45, 1.8, PALETTE.crimson);
  front.position.z = reach * 1.35;
  scene.add(front);

  const figure = scaleFigure();
  figure.position.set(reach * 0.95, 0, reach * 0.75);
  scene.add(figure);

  // The contract forbids the monument's own group from carrying a transform, so
  // the turntable lives in a wrapper — exactly as placement on the planet will.
  const spinner = new THREE.Group();
  spinner.add(review.group);
  scene.add(spinner);

  return { scene, spinner };
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

interface Cell {
  review: Review;
  element: HTMLElement;
  stage: HTMLElement;
  scene: THREE.Scene;
  spinner: THREE.Group;
  camera: THREE.PerspectiveCamera;
  centre: THREE.Vector3;
  radius: number;
  haystack: string;
}

const grid = document.getElementById('grid')!;
const cells: Cell[] = [];

const number = (value: number): string => value.toLocaleString('en-GB');

function statLine(label: string, value: string, over: boolean): string {
  return `<span class="${over ? 'over' : ''}"><i>${label}</i> ${value}</span>`;
}

/**
 * One cell.
 *
 * Every line of it is wrapped, and that is not defensive habit. The captions
 * are built in a top-level loop, so a single monument that throws while its
 * card is being written takes down the whole module and blanks the sheet for
 * *everyone* — which is exactly what one missing `realHeight` did, at the
 * moment the sheet was most needed. A broken monument may cost its own cell and
 * nothing more.
 */
function addCell(review: Review): void {
  const { monument, measurements, problems, flaws } = review;
  const tier = TIERS[monument.tier];

  const element = document.createElement('article');
  // Amber, not crimson: a flaw is something to look at, a problem is something
  // that would stop the monument reaching the planet. Never the same colour.
  element.className = problems.length > 0 ? 'cell broken' : flaws.length > 0 ? 'cell flawed' : 'cell';

  const stage = document.createElement('div');
  stage.className = 'stage';
  element.appendChild(stage);

  const swatches = measurements.colors
    .map(
      (color) =>
        `<span class="swatch" title="${paletteName(color)}" style="background:#${color
          .toString(16)
          .padStart(6, '0')}"></span>`,
    )
    .join('');

  // `realHeight` is optional: plenty of landmarks have no single, agreed or
  // meaningful one. The clause is dropped rather than printed as "undefined m".
  const meta = [monument.id, monument.iso, `${monument.lat.toFixed(2)}, ${monument.lon.toFixed(2)}`];
  if (monument.realHeight !== undefined) meta.push(`${number(monument.realHeight)} m in life`);

  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.innerHTML = `
    <div class="title">
      <span class="name">${monument.name}</span>
      <span class="tier ${monument.tier}">${monument.tier}</span>
    </div>
    <div class="meta">${meta.join(' · ')}</div>
    <div class="stats">
      ${statLine('tris', `${number(measurements.triangles)}/${number(tier.triangles)}`, measurements.triangles > tier.triangles)}
      ${statLine('meshes', `${measurements.meshes}/${tier.meshes}`, measurements.meshes > tier.meshes)}
      ${statLine('height', `${measurements.height.toFixed(1)}/${tier.height}`, measurements.height > tier.height + 0.05)}
      ${statLine('radius', `${measurements.radius.toFixed(1)}/${monument.footprint}`, measurements.radius > monument.footprint + 0.05)}
    </div>
    <div class="swatches">${swatches}</div>
    ${problems.length > 0 ? `<ul class="problems">${problems.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
    ${flaws.length > 0 ? `<ul class="flaws">${flaws.map((f) => `<li><b>${f.kind}</b> · ${f.triangles} tris · ${f.what} — ${f.detail}</li>`).join('')}</ul>` : ''}
  `;
  element.appendChild(caption);
  grid.appendChild(element);

  const { scene, spinner } = buildScene(review);
  const height = Math.max(measurements.height, 1);
  const centre = new THREE.Vector3(0, height / 2, 0);

  cells.push({
    review,
    element,
    stage,
    scene,
    spinner,
    camera: new THREE.PerspectiveCamera(38, 1, 0.5, 4000),
    centre,
    // Enough to hold the model, its ground disc and the figure beside it.
    radius: Math.hypot(Math.max(measurements.radius, monument.footprint) * 1.15, height / 2),
    haystack: `${monument.id} ${monument.name} ${monument.iso} ${monument.tier}`.toLowerCase(),
  });
}

for (const review of reviews) {
  try {
    addCell(review);
  } catch (error) {
    const element = document.createElement('article');
    element.className = 'cell broken';
    element.innerHTML =
      `<div class="caption"><div class="title"><span class="name">${review.monument.id}</span></div>` +
      `<ul class="problems"><li>the contact sheet could not draw this card: ${String(error)}</li></ul></div>`;
    grid.appendChild(element);
  }
}

// ---------------------------------------------------------------------------
// Header, notices
// ---------------------------------------------------------------------------

const broken = reviews.filter((review) => review.problems.length > 0).length;
const flawed = reviews.filter((review) => review.flaws.length > 0).length;
document.getElementById('totals')!.innerHTML = [
  `<b>${reviews.length}</b> monuments`,
  `<b>${number(reviews.reduce((sum, r) => sum + r.measurements.triangles, 0))}</b> triangles`,
  `<b>${number(reviews.reduce((sum, r) => sum + r.measurements.meshes, 0))}</b> meshes`,
  broken > 0 ? `<b>${broken}</b> with problems` : 'all pass',
  ...(flawed > 0 ? [`<b>${flawed}</b> to look at`] : []),
].join(' · ');

const notices = document.getElementById('notices')!;
for (const problem of REGISTRY_PROBLEMS) {
  const line = document.createElement('div');
  line.className = 'notice';
  line.textContent = problem;
  notices.appendChild(line);
}
if (SKIPPED.length > 0) {
  const line = document.createElement('div');
  line.className = 'notice';
  line.textContent = `${SKIPPED.length} file(s) in src/monuments export no Monument and are not on this sheet: ${SKIPPED.join(', ')}`;
  notices.appendChild(line);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// Same pen as the planet and the avatar. Without it these are just boxes.
const outline = new OutlineEffect(renderer, {
  defaultThickness: 0.003,
  defaultColor: [0.11, 0.02, 0.01],
});

const filterInput = document.getElementById('filter') as HTMLInputElement;
const brokenInput = document.getElementById('broken') as HTMLInputElement;
const frontInput = document.getElementById('front') as HTMLInputElement;
const spinInput = document.getElementById('spin') as HTMLInputElement;
const flawedInput = document.getElementById('flawed') as HTMLInputElement;
const empty = document.getElementById('empty')!;

let dirty = true;
const invalidate = () => {
  dirty = true;
};

function applyFilter(): void {
  const needle = filterInput.value.trim().toLowerCase();
  const onlyBroken = brokenInput.checked;
  const onlyFlawed = flawedInput.checked;
  let shown = 0;
  for (const cell of cells) {
    const visible =
      (needle === '' || cell.haystack.includes(needle)) &&
      (!onlyBroken || cell.review.problems.length > 0) &&
      (!onlyFlawed || cell.review.flaws.length > 0);
    cell.element.style.display = visible ? '' : 'none';
    if (visible) shown++;
  }
  empty.hidden = shown > 0;
  invalidate();
}

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  invalidate();
}

/**
 * Remember the controls across a reload.
 *
 * While files are landing the dev server reloads constantly, and a review that
 * loses its filter and its front view every few seconds is a review nobody does
 * twice. `sessionStorage` and not `localStorage` on purpose: it is per tab, so
 * a reload keeps your state and a fresh tab still opens on the whole sheet with
 * nothing hidden. Same idiom as the flag sheet's scroll memory.
 *
 * Wrapped, because a browser with site data disabled throws on the *getter*, and
 * this module builds the page at top level — an unguarded throw here would blank
 * the sheet for the sake of remembering a checkbox.
 */
const CONTROLS = [filterInput, brokenInput, flawedInput, frontInput, spinInput];

function recall(): void {
  try {
    for (const input of CONTROLS) {
      const saved = sessionStorage.getItem(`sheet-${input.id}`);
      if (saved === null) continue;
      if (input.type === 'checkbox') input.checked = saved === '1';
      else input.value = saved;
    }
    const at = sessionStorage.getItem('sheet-scroll');
    if (at) scrollTo(0, Number(at));
  } catch {
    // No storage, no memory. The sheet works either way.
  }
}

function store(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // As above.
  }
}

const remember = (input: HTMLInputElement) =>
  store(`sheet-${input.id}`, input.type === 'checkbox' ? (input.checked ? '1' : '0') : input.value);

addEventListener('resize', resize);
addEventListener('scroll', () => {
  invalidate();
  store('sheet-scroll', String(scrollY));
}, { passive: true });
filterInput.addEventListener('input', applyFilter);
brokenInput.addEventListener('change', applyFilter);
flawedInput.addEventListener('change', applyFilter);
frontInput.addEventListener('change', invalidate);
spinInput.addEventListener('change', invalidate);
for (const input of CONTROLS) {
  input.addEventListener('input', () => remember(input));
  input.addEventListener('change', () => remember(input));
}

recall();
resize();
// The restored filter has to be applied, not just typed back into the box.
applyFilter();

/** Fits the camera to a bounding sphere, on whichever of the two axes is tighter. */
function frame(camera: THREE.PerspectiveCamera, centre: THREE.Vector3, radius: number): void {
  const direction = frontInput.checked ? VIEWS.front : VIEWS.quarter;
  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  const distance = (radius * 1.12) / Math.sin(Math.min(vertical, horizontal) / 2);
  camera.position.copy(centre).addScaledVector(direction, distance);
  camera.lookAt(centre);
  camera.near = Math.max(0.5, distance - radius * 3);
  camera.far = distance + radius * 4;
  camera.updateProjectionMatrix();
}

let previous = performance.now();

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min((now - previous) / 1000, 0.1);
  previous = now;

  const spinning = spinInput.checked;
  if (!dirty && !spinning) return;
  dirty = false;

  // Wipe the whole canvas first. The per-cell passes only clear inside their own
  // scissor, so without this the page's margins and grid gaps keep whatever the
  // last layout left there.
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setClearColor(SKY_TOP, 1);
  renderer.clear();

  renderer.setScissorTest(true);
  for (const cell of cells) {
    if (spinning) cell.spinner.rotation.y += dt * SPIN_RATE;
    else if (cell.spinner.rotation.y !== 0) cell.spinner.rotation.y = 0;

    const rect = cell.stage.getBoundingClientRect();
    // Only what is on screen. With a hundred cells this is the difference
    // between a tool and a slideshow.
    if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > innerHeight) continue;

    const bottom = innerHeight - rect.bottom;
    renderer.setViewport(rect.left, bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, bottom, rect.width, rect.height);

    cell.camera.aspect = rect.width / rect.height;
    frame(cell.camera, cell.centre, cell.radius);
    outline.render(cell.scene, cell.camera);
  }
  renderer.setScissorTest(false);
}

requestAnimationFrame(loop);

// The sheet is also the fastest console for this: `sheet.reviews[0].problems`.
Object.assign(globalThis, { sheet: { reviews, cells, ctx, TIERS, validate, reviewMonument } });
