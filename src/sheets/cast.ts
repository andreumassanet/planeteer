import * as THREE from 'three';
import { AVATAR_HEIGHT, RUN_SPEED, SWIM_STROKE, WALK_SPEED, buildAvatar, prepareAvatar, wardrobeCast } from '../avatar.ts';
import type { Avatar } from '../avatar.ts';
import { DEFAULT_APPEARANCE, SLOTS, WARDROBE, coloursOf, encodeAppearance, randomAppearance, wardrobeOf } from '../appearance.ts';
import type { Appearance } from '../appearance.ts';
import { OUTFITS, paintWith } from '../cast.ts';
import type { ClipName, Person } from '../cast.ts';
import { createFolk } from '../folk.ts';
import { createContext } from '../monuments/contract.ts';
import { OutlineEffect } from '../outline.ts';
import { rngFrom } from '../scenery/random.ts';
import { PALETTE, SKY_TOP } from '../theme.ts';

/**
 * The cast sheet: the hero, every choice on the traveller's card, and every
 * outfit the crowd wears, playing one clip, in the world's own light and pen.
 *
 * `?show=` picks what: `wardrobe` (the default) is the hero as he ships and
 * as this browser has dressed him, then every head, top, bottom and pair of
 * shoes of each body, each on the default traveller of that body so one part
 * changes a cell; `random` is travellers from the card's Randomise
 * (`?seed=` for others); `crowd` is every outfit dressed the way one region
 * dresses them (`?region=east-asia`). `?clip=Walk` the clip, `?close=0.3` the
 * distance as a share of the game's own framing, `?az=160` the bearing (0 is
 * astern, where the game camera lives). Each wardrobe cell is labelled with
 * its code, which `atlas.traveller.wear(code)` puts on the hero in the world.
 */

const params = new URLSearchParams(location.search);
const show = params.get('show') ?? 'wardrobe';
const seed = params.get('seed') ?? 'sheet';
const region = params.get('region') ?? 'atlantic-europe';
const clip = (params.get('clip') ?? 'Idle_Neutral') as ClipName;
const azimuth = Number(params.get('az') ?? 160);
const ctx = createContext();
const folk = createFolk(ctx);
const ink: [number, number, number] = [0.11, 0.02, 0.01];

interface Cell {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  frame: HTMLElement;
  mixer?: THREE.AnimationMixer;
  hero?: Avatar;
}

function cellFrame(label: string, note: string): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'cell';
  const box = document.createElement('div');
  box.className = 'frame';
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = '<b></b><span></span>';
  bar.querySelector('b')!.textContent = label;
  bar.querySelector('span')!.textContent = note;
  frame.append(box, bar);
  document.getElementById('grid')!.append(frame);
  return box;
}

function stage(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-0.8, 1.25, 0.75);
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 1.6, 48), ctx.toon(PALETTE.green));
  ground.position.y = -0.8;
  scene.add(ground);
  return scene;
}

/** The outfit `folk.dress` picks for a key, restated so the sheet can find a key for each. */
const outfitOf = (key: string) => OUTFITS[rngFrom(key, 'outfit').int(OUTFITS.length)];

function cellFor(label: string, note: string, object: THREE.Object3D, mixer?: THREE.AnimationMixer, hero?: Avatar): Cell {
  const scene = stage();
  scene.add(object);
  return { scene, camera: new THREE.PerspectiveCamera(55, 0.8, 0.5, 400), frame: cellFrame(label, note), ...(mixer ? { mixer } : {}), ...(hero ? { hero } : {}) };
}

const SLOT_TITLE = { head: 'hair', top: 'top', bottom: 'bottom', feet: 'shoes' } as const;

async function build(): Promise<Cell[]> {
  await prepareAvatar();
  const cells: Cell[] = [];
  if (show === 'crowd') {
    while (!folk.ready) await new Promise((resolve) => setTimeout(resolve, 50));
    for (const outfit of OUTFITS) {
      let key: string | null = null;
      for (let attempt = 0; attempt < 2000 && key === null; attempt++) {
        if (outfitOf(`sheet|${outfit}|${attempt}`) === outfit) key = `sheet|${outfit}|${attempt}`;
      }
      const person: Person | null = key === null ? null : folk.dress(key, region);
      if (person === null) continue;
      (person.actions.get(clip) ?? person.actions.get('Idle_Neutral')!).play();
      cells.push(cellFor(outfit, region, person.root, person.mixer));
    }
    return cells;
  }
  const hero = buildAvatar(DEFAULT_APPEARANCE);
  cells.push(cellFor('hero', 'as he ships', hero.group, undefined, hero));
  const yours = buildAvatar();
  cells.push(cellFor('yours', encodeAppearance(yours.appearance), yours.group, undefined, yours));
  const cast = await wardrobeCast();
  const dressed = (appearance: Appearance, label: string, note: string): void => {
    const person = cast.make(wardrobeOf(appearance), paintWith(coloursOf(appearance)), AVATAR_HEIGHT);
    (person.actions.get(clip) ?? person.actions.get('Idle_Neutral')!).play();
    cells.push(cellFor(label, note, person.root, person.mixer));
  };
  if (show === 'random') {
    for (let i = 0; i < 24; i++) {
      const appearance = randomAppearance(rngFrom(seed, i));
      dressed(appearance, `random ${i + 1}`, encodeAppearance(appearance));
    }
    return cells;
  }
  for (const body of ['man', 'woman'] as const) {
    const base: Appearance = { ...DEFAULT_APPEARANCE, body, head: 0, top: 0, bottom: 0, feet: 0 };
    for (const slot of SLOTS) {
      WARDROBE[body][slot].forEach((choice, i) => {
        const appearance = { ...base, [slot]: i };
        dressed(appearance, `${body} · ${SLOT_TITLE[slot]} · ${choice.label}`, encodeAppearance(appearance));
      });
    }
    const bare = { ...base, pack: false };
    dressed(bare, `${body} · no rucksack`, encodeAppearance(bare));
  }
  return cells;
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const outline = new OutlineEffect(renderer, { defaultThickness: 0.005, defaultColor: ink });
const closeInput = document.getElementById('close') as HTMLInputElement;
const freezeInput = document.getElementById('freeze') as HTMLInputElement;
const turnInput = document.getElementById('turn') as HTMLInputElement;
const CLOSE = Number(params.get('close') ?? 0.3);
closeInput.checked = true;

let cells: Cell[] = [];
build().then((built) => {
  cells = built;
  (window as unknown as { castReady: boolean }).castReady = true;
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
      // The hero is played by its motion, which picks its own clip from a
      // speed: a swim clip asked for swims him, the rest walk or stand him.
      if (clip === 'Swim' || clip === 'Swim_Idle') cell.hero?.swim(dt, clip === 'Swim' ? SWIM_STROKE * 0.7 : 0, 0);
      else cell.hero?.stride(dt, clip === 'Walk' ? WALK_SPEED : clip === 'Run' ? RUN_SPEED : 0, false);
      cell.mixer?.update(dt);
    }
    const near = closeInput.checked ? CLOSE : 1;
    const elevation = Math.atan2(15, 30);
    const orbit = Math.hypot(30, 15) * near;
    const turn = (azimuth * Math.PI) / 180 + (turnInput.checked ? spin : 0);
    const pivot = new THREE.Vector3(0, AVATAR_HEIGHT * 0.6, 0);
    cell.camera.position.set(
      Math.sin(turn) * Math.cos(elevation) * orbit,
      pivot.y + Math.sin(elevation) * orbit,
      -Math.cos(turn) * Math.cos(elevation) * orbit,
    );
    cell.camera.lookAt(pivot);
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
