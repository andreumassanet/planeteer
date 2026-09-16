import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { PALETTE, SKY_TOP } from '../theme.ts';
import { createSceneryContext } from '../scenery/contract.ts';
import { ROAD_CLASSES } from '../roads.ts';
import {
  AVATAR_HEIGHT,
  KINDS,
  MISSING_REGIONS,
  REGISTRY_PROBLEMS,
  RIDER_HEIGHT,
  SAME_SHAPE,
  SKIPPED,
  STOREY,
  TRAFFIC_SCALE,
  TRAFFIC_STYLES,
  TRAFFIC_REGION_IDS,
  VARIANTS,
  VEHICLES,
  createTrafficContext,
  distinctness,
  extentOf,
  fitsOn,
  namedByRegions,
  paletteName,
  passesOn,
  reviewVehicle,
  seatedDrift,
  variantRng,
} from '../traffic/index.ts';
import type { RegionId, TrafficContext, TrafficStyle, Vehicle, VehicleReview } from '../traffic/index.ts';
import { loadModels } from '../kit.ts';
import { registerSceneryModels as registerKit } from '../scenery/contract.ts';

// The vehicles are baked CC0 models (`scripts/build-kit.ts`); nothing builds before they arrive.
registerKit(await loadModels('traffic/kit.bin'));

/**
 * The traffic sheet.
 *
 * The scenery sheet's two jobs carry over — **size is the subject** and **the
 * failure mode is repetition, which one thumbnail cannot show** — and this page
 * adds two the scenery sheet has no equivalent of, because the traffic kit is
 * answering a different brief.
 *
 * **1. "Several distinct car models rather than one car recoloured" is a claim
 * that has to be measured.** So there is a table of every pair's side-elevation
 * overlap, in world units, and anything over `SAME_SHAPE` is red. A kit whose
 * grid is all cool is a kit of eighteen shapes; one with hot cells is a kit of
 * fewer than eighteen with some names.
 *
 * **2. A vehicle that does not fit its lane cannot be placed.** The kit declares
 * `[length, width, height]` and the road network declares its carriageways;
 * neither knows about the other, so the sheet joins them and prints which
 * vehicles pass, which squeeze by one at a time, and which cannot use a
 * Maghrebi alley at all.
 *
 * Everything is drawn into one WebGL context, scissored cell by cell, for the
 * same reason as the other two sheets: browsers cap contexts at about sixteen
 * and this page wants forty.
 */

/** The world's lens, from `main.ts`. Cell fields of view are cut from it. */
const WORLD_FOV = 55;
const VIEW = new THREE.Vector3(0.78, 0.34, 1).normalize();
const SPIN_RATE = 0.3;
const STREET_LENGTH = 46;

const sceneryCtx = createSceneryContext();
const ctx: TrafficContext = createTrafficContext(sceneryCtx);

/**
 * The scenery kit, if it will load.
 *
 * A house beside a car is the only honest test of the scale decision, so the
 * sheet wants one — but `src/scenery/` is being edited by two other agents and a
 * static import takes this page down every time one of their files is mid-move.
 * Dynamic and guarded: the street scene gets a real gabled house when the kit is
 * healthy and a plain block when it is not, and the banner says which.
 */
let houseOf: ((style: unknown, variant: number) => THREE.Group) | null = null;
let sceneryStyles: Record<string, unknown> | null = null;
let personOf: ((height: number, pose: string, seed: number) => THREE.Group) | null = null;
let crowdBody: Record<string, number> | null = null;
let sceneryNote = '';

try {
  const kit = await import('../scenery/index.ts');
  const build = kit.buildVariant as (id: string, c: unknown, s: unknown, v: number) => THREE.Group;
  sceneryStyles = kit.REGIONS as unknown as Record<string, unknown>;
  houseOf = (style, variant) => build('gabled-house', sceneryCtx, style, variant);
  if (typeof kit.buildPerson === 'function' && kit.BODY) {
    crowdBody = kit.BODY as unknown as Record<string, number>;
    const lookFor = kit.lookFor as ((options: unknown) => unknown) | undefined;
    personOf = (height, pose, seed) => {
      const look = lookFor
        ? { ...(lookFor({ seed, region: 'atlantic-europe' }) as object), height, pose }
        : { height, pose };
      return (kit.buildPerson as (c: unknown, l: unknown) => THREE.Group)(sceneryCtx, look);
    };
  }
} catch (error) {
  sceneryNote = `the scenery kit would not load, so the street scene has a plain block for a house and boxes for people: ${String(error)}`;
}

// ---------------------------------------------------------------------------
// Variants are built once and cloned
// ---------------------------------------------------------------------------

const built = new Map<string, THREE.Group>();

function variantOf(vehicle: Vehicle, style: TrafficStyle, index: number): THREE.Group | null {
  const key = `${vehicle.id}:${style.id}:${index}`;
  const cached = built.get(key);
  if (cached) return cached;
  try {
    const group = vehicle.build(ctx, variantRng(vehicle, style, index), style);
    built.set(key, group);
    return group;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reference figures
// ---------------------------------------------------------------------------

/** A blocked-out person at a given height, for when the crowd kit will not load. */
function blockFigure(height: number, color: number): THREE.Group {
  const k = height / AVATAR_HEIGHT;
  const figure = new THREE.Group();
  for (const side of [1, -1]) {
    const leg = ctx.box(0.95 * k, 3 * k, 0.9 * k, PALETTE.steel);
    leg.position.x = side * 0.62 * k;
    figure.add(leg);
  }
  const torso = ctx.box(2.5 * k, 2.7 * k, 1.35 * k, color);
  torso.position.y = 3 * k;
  figure.add(torso);
  const head = ctx.box(1.4 * k, 1.4 * k, 1.4 * k, PALETTE.blush);
  head.position.y = 5.4 * k;
  figure.add(head);
  return figure;
}

function figure(height: number, color: number, seed: number): THREE.Group {
  if (personOf) {
    try {
      return personOf(height, 'stand', seed);
    } catch {
      /* fall through */
    }
  }
  return blockFigure(height, color);
}

// ---------------------------------------------------------------------------
// The shared bits of every cell
// ---------------------------------------------------------------------------

function stage(ground: number, reach: number): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_TOP);
  // The same rig as `main.ts` minus the sun's travel, and deliberately little
  // ambient: flatten it and the cel ramp has no range to step across.
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-0.8, 1.25, 0.75);
  scene.add(sun, sun.target);

  const disc = ctx.column(reach, 0.8, ground, 44);
  disc.position.y = -0.8;
  scene.add(disc);
  return scene;
}

interface Cell {
  element: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
  /** How far the camera stands off, or 0 to fit the contents. */
  distance: number;
  radius: number;
  height: number;
}

const cells: Cell[] = [];

function frame(cell: Cell, viewport: number): void {
  const { camera, radius, height } = cell;
  const focus = height * 0.42;
  if (cell.distance > 0) {
    // A literal crop of the world view from that distance: the cell's field of
    // view is the world's, scaled by how much of the window the cell is. At
    // "360 u" a hatchback really is 13 pixels, and it should be.
    camera.fov = WORLD_FOV * (viewport / window.innerHeight);
    camera.position.copy(VIEW).multiplyScalar(cell.distance).add(new THREE.Vector3(0, focus, 0));
  } else {
    camera.fov = 34;
    const need = Math.max(radius, height * 0.6) / Math.tan((camera.fov * Math.PI) / 360);
    camera.position.copy(VIEW).multiplyScalar(need * 1.5).add(new THREE.Vector3(0, focus, 0));
  }
  camera.lookAt(0, focus, 0);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Cell contents
// ---------------------------------------------------------------------------

function laneRule(vehicle: Vehicle): string {
  const bits: string[] = [];
  for (const road of ROAD_CLASSES) {
    if (passesOn(vehicle, road.width)) bits.push(`${road.name} two abreast`);
    else if (fitsOn(vehicle, road.width)) bits.push(`${road.name} one at a time`);
    else bits.push(`${road.name} NO`);
  }
  return bits.join(' · ');
}

function vehicleCell(review: VehicleReview, showAll: boolean): HTMLElement {
  const { vehicle, groups, measurements, extents, variety, problems } = review;
  const kind = KINDS[vehicle.kind];

  const element = document.createElement('article');
  element.className = `cell${problems.length > 0 ? ' broken' : ''}`;
  element.dataset.search = `${vehicle.name} ${vehicle.id} ${vehicle.kind}`.toLowerCase();

  const stageEl = document.createElement('div');
  stageEl.className = 'stage';
  element.append(stageEl);

  // A craft's y = 0 is its waterline, so its cell stands on water rather than on
  // grass — otherwise the model is shown with its keel out, which is not the
  // thing that gets placed. One disc, not two: a second one laid at the same
  // height z-fights with the first and draws a dark wedge across the sea.
  const scene = stage(KINDS[vehicle.kind].medium === 'water' ? PALETTE.skyBlue : PALETTE.green, 60);
  const pivot = new THREE.Group();
  scene.add(pivot);

  const shown = showAll ? groups : groups.slice(0, 1);
  const pitch = Math.max(...extents.map((e) => e.width)) + 1.4;
  shown.forEach((group, index) => {
    const clone = group.clone();
    clone.position.x = (index - (shown.length - 1) / 2) * pitch;
    pivot.add(clone);
  });

  const span = Math.max(...extents.map((e) => e.length)) / 2 + (pitch * (shown.length - 1)) / 2;
  const tall = Math.max(...extents.map((e) => e.height));
  cells.push({
    element: stageEl,
    scene,
    camera: new THREE.PerspectiveCamera(WORLD_FOV, 1, 0.5, 4000),
    pivot,
    distance: 0,
    radius: span + 2,
    height: tall,
  });

  const caption = document.createElement('div');
  caption.className = 'caption';
  const size = vehicle.size;
  const worst = extents.reduce((a, b) => (b.length > a.length ? b : a), extents[0]!);
  const tris = Math.max(...measurements.map((m) => m.triangles));
  const meshes = Math.max(...measurements.map((m) => m.meshes));
  const colours = measurements[0]?.colors ?? [];
  const over = (value: number, cap: number) => (value > cap ? ' class="over"' : '');

  caption.innerHTML =
    `<div class="title"><span class="name">${vehicle.name}</span>` +
    `<span class="kind ${vehicle.kind}">${vehicle.kind}</span></div>` +
    `<div class="meta">${vehicle.note ?? ''}</div>` +
    `<div class="meta">declared ${size[0]} x ${size[1]} x ${size[2]} · built ` +
    `${worst.length.toFixed(2)} x ${worst.width.toFixed(2)} x ${worst.height.toFixed(2)}` +
    (kind.draft > 0 ? ` · draft ${(-worst.base).toFixed(2)}` : '') +
    `</div>` +
    `<div class="meta">${laneRule(vehicle)}</div>` +
    `<div class="meta">${
      vehicle.mounts.length === 0
        ? 'no mount — nobody rides this'
        : vehicle.mounts.map((m) => `${m.pose} at y ${m.y}`).join(', ')
    }</div>` +
    `<div class="stats">` +
    `<span${over(tris, kind.triangles)}><i>tris</i> ${tris}/${kind.triangles}</span>` +
    `<span${over(meshes, kind.meshes)}><i>meshes</i> ${meshes}/${kind.meshes}</span>` +
    `<span${over(colours.length, kind.colors)}><i>colours</i> ${colours.length}/${kind.colors}</span>` +
    `<span><i>shapes</i> ${variety.shapes}/${variety.samples}</span>` +
    `<span><i>palettes</i> ${variety.palettes}/${variety.samples}</span>` +
    `</div>` +
    `<div class="swatches">${colours
      .map((c) => `<span class="swatch" style="background:#${c.toString(16).padStart(6, '0')}" title="${paletteName(c)}"></span>`)
      .join('')}</div>` +
    (problems.length > 0
      ? `<ul class="problems">${problems.map((p) => `<li>${p}</li>`).join('')}</ul>`
      : '');
  element.append(caption);
  return element;
}

/**
 * A street: a house, a person on the kerb, and the region's own traffic mix
 * drawn from its weights.
 *
 * **This is the review and the turntable is not.** A vehicle alone in a cell is
 * a model; a vehicle at a kerb beside a two-storey house and a 6.8-unit person
 * is the thing that will actually be shipped, and it is the only view in which
 * the scale decision — the one real decision in this kit — can be judged at all.
 */
function regionCell(id: RegionId, style: TrafficStyle, distance: number): HTMLElement {
  const element = document.createElement('article');
  element.className = 'cell';
  element.dataset.search = `${style.name} ${style.id} region`.toLowerCase();

  const stageEl = document.createElement('div');
  stageEl.className = 'stage';
  element.append(stageEl);

  const scene = stage(PALETTE.tan, STREET_LENGTH);
  const pivot = new THREE.Group();
  scene.add(pivot);

  // The carriageway, at the width the road network actually uses.
  const road = ctx.box(ROAD_CLASSES[1]!.width, 0.14, STREET_LENGTH * 1.9, PALETTE.bone);
  road.position.y = -0.06;
  pivot.add(road);

  const rng = (seed: number) => variantRng({ id: `street-${id}` } as Vehicle, style, seed);
  const draw = rng(0);

  let x = -STREET_LENGTH * 0.72;
  let placed = 0;
  let tall = 6;
  while (x < STREET_LENGTH * 0.72 && placed < 8) {
    const pick = draw.weighted(style.road);
    const entry = VEHICLES.find((v) => v.id === pick);
    if (!entry) break;
    const group = variantOf(entry, style, draw.int(VARIANTS));
    if (!group) break;
    const clone = group.clone();
    const half = entry.size[0] / 2;
    x += half;
    const side = draw.chance(0.5) ? 1 : -1;
    clone.position.set(side * (ROAD_CLASSES[1]!.width / 2 - entry.size[1] / 2 - 0.2), 0, x);
    clone.rotation.y = side > 0 ? 0 : Math.PI;
    pivot.add(clone);
    tall = Math.max(tall, entry.size[2]);
    x += half + draw.range(1.4, 4.5);
    placed++;
  }

  // A house on each side, and a person on the near kerb. The person is the
  // scale figure and is deliberately the one thing here at avatar scale.
  const sceneryStyle = sceneryStyles?.[id];
  for (const [side, z] of [
    [-1, -8],
    [1, 9],
  ] as const) {
    let house: THREE.Group;
    if (houseOf && sceneryStyle) {
      try {
        house = houseOf(sceneryStyle, side > 0 ? 1 : 3);
      } catch {
        house = plainHouse();
      }
    } else {
      house = plainHouse();
    }
    house.position.set(side * 10.5, 0, z);
    house.rotation.y = side > 0 ? Math.PI : 0;
    pivot.add(house);
    tall = Math.max(tall, 11);
  }

  // Two figures, and the pair of them *is* the argument. The pedestrian is the
  // world's own person at 6.80; the rider is the same person built to
  // `RIDER_HEIGHT` so he fits the vehicles. A street with both in it shows the
  // cost of the scale decision honestly instead of hiding it.
  if (scaleBox.checked) {
    const pedestrian = figure(AVATAR_HEIGHT, PALETTE.skyBlue, 7);
    pedestrian.position.set(-5.4, 0, -2);
    pedestrian.rotation.y = 1.3;
    pivot.add(pedestrian);

    const rider = figure(RIDER_HEIGHT, PALETTE.crimson, 11);
    rider.position.set(5.2, 0, 3.5);
    rider.rotation.y = -1.1;
    pivot.add(rider);
  }

  cells.push({
    element: stageEl,
    scene,
    camera: new THREE.PerspectiveCamera(WORLD_FOV, 1, 0.5, 4000),
    pivot,
    distance: distance > 0 ? distance * 1.6 : 0,
    radius: STREET_LENGTH * 0.8,
    height: tall,
  });

  const mix = [...style.road]
    .sort((a, b) => b.weight - a.weight)
    .map((e) => `${e.item} ${e.weight}`)
    .join(' · ');

  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.innerHTML =
    `<div class="title"><span class="name">${style.name}</span><span class="kind region">region</span></div>` +
    `<div class="meta">${style.note}</div>` +
    `<div class="meta">road: ${mix}</div>` +
    `<div class="meta">water: ${style.water.map((e) => `${e.item} ${e.weight}`).join(' · ') || 'none'}` +
    ` · air: ${style.air.map((e) => `${e.item} ${e.weight}`).join(' · ') || 'none'}</div>` +
    `<div class="stats"><span><i>density</i> ${style.density}</span>` +
    `<span><i>paint</i> ${style.paint.length}</span></div>` +
    `<div class="swatches">${style.paint
      .map((c) => `<span class="swatch" style="background:#${c.toString(16).padStart(6, '0')}" title="${paletteName(c)}"></span>`)
      .join('')}</div>`;
  element.append(caption);
  return element;
}

/** What stands in for a gabled house when the scenery kit will not load. */
function plainHouse(): THREE.Group {
  const group = new THREE.Group();
  const eaves = STOREY * 2;
  group.add(ctx.box(7, eaves, 7, PALETTE.cream));
  const cap = ctx.roof(8, 8, 3, 8, PALETTE.clay);
  cap.position.y = eaves;
  group.add(cap);
  return group;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function distinctTable(style: TrafficStyle): void {
  const host = document.getElementById('distinct')!;
  const { ids, overlap, clashes } = distinctness(ctx, style);
  const head = `<tr><th class="row"></th>${ids.map((id) => `<th>${id.slice(0, 4)}</th>`).join('')}</tr>`;
  const rows = ids
    .map((id, i) => {
      const cellsHtml = ids
        .map((_, j) => {
          const value = overlap[i]![j]!;
          if (i === j) return `<td class="self">—</td>`;
          const cls = value > SAME_SHAPE ? 'hot' : value > 0.75 ? 'warm' : '';
          return `<td class="${cls}">${value.toFixed(2)}</td>`;
        })
        .join('');
      return `<tr><th class="row">${id}</th>${cellsHtml}</tr>`;
    })
    .join('');
  host.innerHTML = `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;

  const flat = overlap.flatMap((row, i) => row.filter((_, j) => j > i));
  flat.sort((a, b) => a - b);
  const median = flat[Math.floor(flat.length / 2)] ?? 0;
  document.getElementById('distinct-note')!.textContent =
    `Side elevation, rasterised in world units at 0.2 to a cell — not normalised, because scaling each into its own box ` +
    `called a bicycle and a four-wheel-drive 0.89 alike. ${flat.length} pairs, median ${median.toFixed(2)}, ` +
    `worst ${clashes.length > 0 ? `${clashes[0]![2].toFixed(2)} (${clashes[0]![0]} / ${clashes[0]![1]})` : (flat.at(-1) ?? 0).toFixed(2)}. ` +
    `Anything over ${SAME_SHAPE} is two names for one shape.`;
}

function fitTable(): void {
  const host = document.getElementById('fit')!;
  const widths: [string, number][] = ROAD_CLASSES.map((r) => [r.name, r.width] as [string, number]);
  widths.unshift(['alley 4.0', 4.0], ['street 6.5', 6.5]);
  const head = `<tr><th class="row">vehicle</th><th>width</th>${widths.map(([n, w]) => `<th>${n} (${w})</th>`).join('')}</tr>`;
  const rows = VEHICLES.filter((v) => KINDS[v.kind].medium === 'road')
    .map((v) => {
      const bits = widths
        .map(([, w]) => {
          if (passesOn(v, w)) return `<td>two</td>`;
          if (fitsOn(v, w)) return `<td class="warm">one</td>`;
          return `<td class="hot">no</td>`;
        })
        .join('');
      return `<tr><th class="row">${v.id}</th><td>${v.size[1].toFixed(2)}</td>${bits}</tr>`;
    })
    .join('');
  host.innerHTML = `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  document.getElementById('fit-note')!.textContent =
    `Carriageways from ROAD_CLASSES in src/roads.ts and GroundStyle.street in src/scenery/ground.ts. ` +
    `"two" is two of the same vehicle passing with 0.6 to spare; "one" is one with 0.4. ` +
    `On a 4.0 Maghrebi alley only the bicycle, the scooter and the hand-cart can pass — which is the region whose table weights the cart at 4.`;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setScissorTest(true);
const outline = new OutlineEffect(renderer, { defaultThickness: 0.005, defaultColor: [0.11, 0.02, 0.01] });

const styleSelect = document.getElementById('style') as HTMLSelectElement;
for (const id of TRAFFIC_REGION_IDS) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = TRAFFIC_STYLES[id]!.name;
  styleSelect.append(option);
}
styleSelect.value = 'atlantic-europe';

const distanceSelect = document.getElementById('distance') as HTMLSelectElement;
const filterInput = document.getElementById('filter') as HTMLInputElement;
const variantsBox = document.getElementById('variants') as HTMLInputElement;
const scaleBox = document.getElementById('scale') as HTMLInputElement;
const spinBox = document.getElementById('spin') as HTMLInputElement;

function notice(text: string, calm = false): void {
  const el = document.createElement('div');
  el.className = `notice${calm ? ' calm' : ''}`;
  el.textContent = text;
  document.getElementById('notices')!.append(el);
}

function rebuild(): void {
  cells.length = 0;
  const style = TRAFFIC_STYLES[styleSelect.value as RegionId]!;
  const distance = Number(distanceSelect.value);
  const showAll = variantsBox.checked;

  const notices = document.getElementById('notices')!;
  notices.replaceChildren();
  if (sceneryNote) notice(sceneryNote);
  for (const problem of REGISTRY_PROBLEMS) notice(problem);
  for (const path of SKIPPED) notice(`${path} exports no vehicle — a typo in an export?`);
  for (const id of MISSING_REGIONS) notice(`region '${id}' has houses and no traffic table`);
  const { known, unknown } = namedByRegions();
  for (const id of unknown) notice(`a region table names '${id}' and no such vehicle exists`);
  const orphans = VEHICLES.filter((v) => !known.has(v.id));
  if (orphans.length > 0) {
    notice(`nothing will ever build ${orphans.map((v) => v.id).join(', ')} — no region names them`, true);
  }
  if (crowdBody) {
    const drift = seatedDrift(crowdBody as never);
    for (const line of drift) notice(`${line} — every seat in the kit was sized against the old number`);
    if (drift.length === 0) notice('the seated pose still agrees with src/scenery/people.ts', true);
  } else {
    notice('could not read BODY from the crowd kit, so the seated pose is unchecked', true);
  }

  const regionsHost = document.getElementById('regions')!;
  regionsHost.replaceChildren();
  for (const id of TRAFFIC_REGION_IDS) {
    regionsHost.append(regionCell(id, TRAFFIC_STYLES[id]!, distance));
  }

  const vehiclesHost = document.getElementById('vehicles')!;
  vehiclesHost.replaceChildren();
  let broken = 0;
  let triangles = 0;
  for (const vehicle of VEHICLES) {
    const review = reviewVehicle(vehicle, ctx, style);
    if (review.problems.length > 0) broken++;
    triangles += Math.max(0, ...review.measurements.map((m) => m.triangles));
    vehiclesHost.append(vehicleCell(review, showAll));
  }

  // The distance selector applies to the vehicle cells only; a street is framed
  // to hold a street.
  for (const cell of cells) {
    if (cell.distance === 0 && distance > 0 && cell.radius < STREET_LENGTH * 0.5) cell.distance = distance;
  }

  document.getElementById('totals')!.innerHTML =
    `<b>${VEHICLES.length}</b> vehicles · <b>${TRAFFIC_REGION_IDS.length}</b> regions · ` +
    `<b>${VARIANTS}</b> variants each · <b>${triangles}</b> triangles across the kit · ` +
    (broken > 0 ? `<b style="color:#c30e3a">${broken} broken</b>` : 'all within budget');

  document.getElementById('regions-note')!.textContent =
    `A house, a person at ${AVATAR_HEIGHT}, a rider at ${RIDER_HEIGHT.toFixed(2)}, and the region's own mix ` +
    `on an ${ROAD_CLASSES[1]!.width}-unit carriageway. One unit is ${(1 / TRAFFIC_SCALE).toFixed(2)} m here.`;
  document.getElementById('vehicles-note')!.textContent =
    `Every variant side by side. The seed is doing nothing if they are one shape in one set of colours.`;

  distinctTable(style);
  fitTable();
  applyFilter();
}

function applyFilter(): void {
  const term = filterInput.value.trim().toLowerCase();
  let shown = 0;
  for (const host of ['regions', 'vehicles']) {
    for (const child of Array.from(document.getElementById(host)!.children)) {
      const element = child as HTMLElement;
      const match = term === '' || (element.dataset.search ?? '').includes(term);
      element.style.display = match ? '' : 'none';
      if (match) shown++;
    }
  }
  (document.getElementById('empty') as HTMLElement).hidden = shown > 0;
}

for (const control of [distanceSelect, styleSelect, variantsBox, scaleBox]) {
  control.addEventListener('change', rebuild);
}
filterInput.addEventListener('input', applyFilter);

let spin = 0;
function render(time: number): void {
  requestAnimationFrame(render);
  const width = innerWidth;
  const height = innerHeight;
  if (canvas.width !== width * renderer.getPixelRatio()) renderer.setSize(width, height, false);

  spin = spinBox.checked ? (time / 1000) * SPIN_RATE : 0;

  for (const cell of cells) {
    const rect = cell.element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > height || rect.width === 0) continue;
    const bottom = height - rect.bottom;
    renderer.setViewport(rect.left, bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, bottom, rect.width, rect.height);
    cell.camera.aspect = rect.width / rect.height;
    frame(cell, rect.height);
    cell.pivot.rotation.y = spin;
    outline.render(cell.scene, cell.camera);
  }
}

rebuild();
requestAnimationFrame(render);

// The console handle the other sheets have, and for the same reason: the table
// is the review and sometimes you want it as numbers rather than as colour.
(window as unknown as Record<string, unknown>).traffic = {
  VEHICLES,
  KINDS,
  TRAFFIC_STYLES,
  ctx,
  extentOf,
  distinctness: () => distinctness(ctx, TRAFFIC_STYLES[styleSelect.value as RegionId]!),
  review: (id: string) =>
    reviewVehicle(VEHICLES.find((v) => v.id === id)!, ctx, TRAFFIC_STYLES[styleSelect.value as RegionId]!),
};
