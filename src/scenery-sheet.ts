import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { PALETTE, SKY_TOP } from './theme.ts';
import {
  AVATAR_HEIGHT,
  KINDS,
  LEGIBLE_AT,
  PARTS,
  REGIONS,
  REGION_IDS,
  REGISTRY_PROBLEMS,
  SKIPPED,
  STOREY,
  VARIANTS,
  createSceneryContext,
  hamlet,
  measure,
  paletteName,
  plots,
  reviewPart,
  rngFrom,
  variantRng,
} from './scenery/index.ts';
import { loadCountries } from './geo.ts';
import { CONTINENT_REGIONS, ISO_REGIONS } from './scenery/regions.ts';
import { POSES, buildPerson, crowd, heroLook } from './scenery/people.ts';
import type { Carry, Garment, Headwear, Look, Pose } from './scenery/people.ts';
import {
  CROWD_MIX,
  DRESS_IDS,
  PEOPLE_PART_IDS,
  SKIN_TONES,
  dressFor,
  lookFor,
} from './scenery/dress.ts';
import { BIOMES, BIOME_IDS } from './biome.ts';
import type {
  Measurements,
  PartReview,
  RegionStyle,
  SceneryContext,
  ScenicPart,
} from './scenery/index.ts';

/**
 * The scenery sheet.
 *
 * The monument contact sheet's job is "can I name this thing from its
 * thumbnail". This one has two jobs the contact sheet does not, and the whole
 * page is shaped by them.
 *
 * **1. Size is the subject, not a framing problem.** The contact sheet fits its
 * camera to each monument, which is right there — the question is what the model
 * *is*. Do that here and every part fills its cell, a shrub looks like a
 * cathedral, and the one decision the kit actually rests on becomes invisible.
 * So the default framing is a **fixed viewing distance** with the game's own
 * lens: the cell's field of view is `55 * cellHeight / windowHeight`, which
 * makes the cell a literal crop of the world view from that distance. At
 * "360 u" a house really is 26 pixels, and it should be — that is what it will
 * be. `fit` is there for inspecting geometry and is not the review.
 *
 * **2. The failure mode is repetition, and one thumbnail cannot show it.** So
 * every part cell can draw a *cluster* of its variants laid out by `layout.ts`,
 * and there is a second grid of whole villages, one per region — because "does
 * Japan look like Morocco" is a question about a place, not about a part.
 *
 * Everything is drawn into one WebGL context, scissored cell by cell, for the
 * same reason as the contact sheet: browsers cap contexts at about sixteen.
 */

/** The world's lens, from `main.ts`. Cell fields of view are cut from it. */
const WORLD_FOV = 55;

const VIEW = new THREE.Vector3(0.68, 0.3, 1).normalize();
const SPIN_RATE = 0.3;
const VILLAGE_RADIUS = 62;

const ctx: SceneryContext = createSceneryContext();

// ---------------------------------------------------------------------------
// Variants are built once and cloned
// ---------------------------------------------------------------------------

/**
 * The instancing model, in the only form this page needs it.
 *
 * A variant is built once per (part, style, variant) and every instance is a
 * `clone()`, which shares the geometry and the material. That is not an
 * optimisation for the sheet — it is the kit's central claim made executable: if
 * a part's `build` produced per-instance geometry this cache would be useless
 * and so would every draw strategy anyone might later choose.
 */
const variants = new Map<string, THREE.Group>();

function variantOf(part: ScenicPart, style: RegionStyle, index: number): THREE.Group | null {
  const key = `${part.id}:${style.id}:${index}`;
  const cached = variants.get(key);
  if (cached) return cached;
  try {
    const group = part.build(ctx, variantRng(part, style, index), style);
    variants.set(key, group);
    return group;
  } catch {
    return null;
  }
}

function place(object: THREE.Object3D, x: number, z: number, yaw: number, scale: number): THREE.Object3D {
  object.position.set(x, 0, z);
  object.rotation.y = yaw;
  object.scale.setScalar(scale);
  return object;
}

// ---------------------------------------------------------------------------
// The shared bits of every cell
// ---------------------------------------------------------------------------

/** The avatar, at exactly `player.ts`'s height. The most useful object on the page. */
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

function stage(ground: number, reach: number, figureOf: () => THREE.Object3D = scaleFigure): THREE.Scene {
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

  const figure = figureOf();
  figure.position.set(reach * 0.62, 0, reach * 0.6);
  scene.add(figure);
  return scene;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

interface Cell {
  element: HTMLElement;
  stage: HTMLElement;
  scene: THREE.Scene;
  spinner: THREE.Group;
  camera: THREE.PerspectiveCamera;
  /** What the camera aims at, and the sphere `fit` frames. */
  focus: THREE.Vector3;
  radius: number;
  /**
   * Multiplies the chosen viewing distance.
   *
   * 1 for a part, because "how far away is a house" is the question the sheet
   * exists to answer honestly. More for a village, because a village is not a
   * part: you meet one from outside it, and standing in the middle of a
   * 62-unit town at 120 units shows you two houses and a fence.
   */
  distanceScale: number;
  haystack: string;
}

const cells: Cell[] = [];
/**
 * How many cells belong to a band that is built once and never rebuilt.
 *
 * `rebuildParts` tears down and re-adds every parts cell when the style
 * selector changes, and it does that by index — so it needs to know where the
 * fixed bands end. It used to be `villages.length`, which was true while
 * regions were the only fixed band; the people band is a second one.
 */
let staticCells = 0;
const regionGrid = document.getElementById('regions')!;
const peopleGrid = document.getElementById('people')!;
const partGrid = document.getElementById('parts')!;

const number = (value: number): string => value.toLocaleString('en-GB');

function statLine(label: string, value: string, over = false): string {
  return `<span class="${over ? 'over' : ''}"><i>${label}</i> ${value}</span>`;
}

function swatchRow(colors: readonly number[]): string {
  return colors
    .map(
      (color) =>
        `<span class="swatch" title="${paletteName(color)}" style="background:#${color
          .toString(16)
          .padStart(6, '0')}"></span>`,
    )
    .join('');
}

function addCell(
  grid: HTMLElement,
  options: {
    scene: THREE.Scene;
    spinner: THREE.Group;
    focus: THREE.Vector3;
    radius: number;
    distanceScale?: number;
    haystack: string;
    broken: boolean;
    caption: string;
  },
): void {
  const element = document.createElement('article');
  element.className = options.broken ? 'cell broken' : 'cell';

  const stageElement = document.createElement('div');
  stageElement.className = 'stage';
  element.appendChild(stageElement);

  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.innerHTML = options.caption;
  element.appendChild(caption);
  grid.appendChild(element);

  cells.push({
    element,
    stage: stageElement,
    scene: options.scene,
    spinner: options.spinner,
    camera: new THREE.PerspectiveCamera(30, 1, 0.5, 6000),
    focus: options.focus,
    radius: options.radius,
    distanceScale: options.distanceScale ?? 1,
    haystack: options.haystack,
  });
}

// ---------------------------------------------------------------------------
// The regions grid: one village each
// ---------------------------------------------------------------------------

interface Village {
  style: RegionStyle;
  parts: number;
  triangles: number;
  meshes: number;
  variants: number;
  missing: string[];
  /** False if two builds of the same seed disagreed. See `signature`. */
  repeatable: boolean;
}

/**
 * Everything a village *is*, as one string.
 *
 * Determinism has two halves here and the monument loader only ever needed the
 * first. `reviewPart` covers geometry: same seed, same variant. This covers the
 * layout: same seed, same village — which parts, which variants, in which plots,
 * at which angles. A village that reshuffles on reload is a worse bug than a
 * house that does, because nobody would notice it as a bug; the world would just
 * feel untrustworthy.
 */
function signature(placed: readonly { partId: string; variant: number; scale: number; plot: { x: number; z: number; yaw: number } }[]): string {
  return placed
    .map((entry) => `${entry.partId}:${entry.variant}:${entry.plot.x.toFixed(4)}:${entry.plot.z.toFixed(4)}:${entry.plot.yaw.toFixed(4)}:${entry.scale.toFixed(4)}`)
    .join('|');
}

/** Plot fitting needs this, and `layout.ts` deliberately does not import the registry. */
const footprintOf = (id: string): number => PARTS.find((part) => part.id === id)?.footprint ?? 0;

function buildVillage(style: RegionStyle): { group: THREE.Group; stats: Village } {
  const group = new THREE.Group();
  const placed = hamlet(style.id, style, { radius: VILLAGE_RADIUS, footprintOf });
  const used = new Set<string>();
  const missing: string[] = [];
  let triangles = 0;
  let meshes = 0;

  for (const entry of placed) {
    const part = PARTS.find((candidate) => candidate.id === entry.partId);
    if (!part) {
      if (!missing.includes(entry.partId)) missing.push(entry.partId);
      continue;
    }
    const variant = variantOf(part, style, entry.variant);
    if (!variant) continue;
    used.add(`${part.id}:${entry.variant}`);
    const size = measure(variant);
    triangles += size.triangles;
    meshes += size.meshes;
    group.add(place(variant.clone(), entry.plot.x, entry.plot.z, entry.plot.yaw, entry.scale));
  }

  const again = hamlet(style.id, style, { radius: VILLAGE_RADIUS, footprintOf });
  return {
    group,
    stats: {
      style,
      parts: placed.length,
      triangles,
      meshes,
      variants: used.size,
      missing,
      repeatable: signature(placed) === signature(again),
    },
  };
}

const villages: Village[] = [];

for (const id of REGION_IDS) {
  const style = REGIONS[id];
  try {
    const { group, stats } = buildVillage(style);
    villages.push(stats);

    const scene = stage(style.ground, VILLAGE_RADIUS * 1.25);
    const spinner = new THREE.Group();
    spinner.add(group);
    scene.add(spinner);

    // Instanced, a village costs one mesh per (variant, colour) pair; merged, one
    // per colour. Both numbers are worth having on the card because the choice
    // between them is not made yet — see the note in `layout.ts`.
    const drawCalls = stats.variants * 4;
    addCell(regionGrid, {
      scene,
      spinner,
      focus: new THREE.Vector3(0, 9, 0),
      radius: VILLAGE_RADIUS * 1.15,
      distanceScale: 3.4,
      haystack: `${style.id} ${style.name} region village`.toLowerCase(),
      broken: stats.missing.length > 0 || !stats.repeatable,
      caption: `
        <div class="title">
          <span class="name">${style.name}</span>
          <span class="kind region">region</span>
        </div>
        <div class="meta">${style.note}</div>
        <div class="stats">
          ${statLine('parts', String(stats.parts))}
          ${statLine('tris', number(stats.triangles))}
          ${statLine('meshes', number(stats.meshes))}
          ${statLine('variants', String(stats.variants))}
          ${statLine('~draws', `${drawCalls * 2} inked`)}
          ${statLine('pitch', style.pitch.toFixed(2))}
        </div>
        <div class="swatches">${swatchRow([...style.walls, ...style.roofs, ...style.foliage])}</div>
        ${stats.missing.length > 0 ? `<ul class="problems"><li>names parts that do not exist: ${stats.missing.join(', ')}</li></ul>` : ''}
        ${stats.repeatable ? '' : '<ul class="problems"><li>two builds of this seed laid out different villages</li></ul>'}
      `,
    });
  } catch (error) {
    const element = document.createElement('article');
    element.className = 'cell broken';
    element.innerHTML = `<div class="caption"><div class="title"><span class="name">${id}</span></div><ul class="problems"><li>${String(error)}</li></ul></div>`;
    regionGrid.appendChild(element);
  }
}

// ---------------------------------------------------------------------------
// The people band
// ---------------------------------------------------------------------------

/**
 * The crowd, and it is a separate band from the parts grid for the reason the
 * whole kit is arranged around: **a person's failure mode is only visible in a
 * crowd.** A part card shows six variants, which is right for a house and
 * useless for a population — six people is a number you can memorise, and the
 * question is whether thirty of them read as thirty people.
 *
 * So the band asks five questions the parts grid cannot:
 *
 * 1. **Does a street read as a street?** One crowd per region, laid out by
 *    `crowd`, with the hero standing in it at his real height.
 * 2. **Is appearance really independent of the region?** The same eight seeds
 *    dressed for two places, in two rows. If a single face or height differs
 *    between the rows, the fork in `dress.ts` has leaked.
 * 3. **What does one pose buy?** One body, seven poses.
 * 4. **What does one garment buy?** One body, every garment; and one body,
 *    every hat.
 * 5. **What is the ramp of skin tones actually made of?** All eight in a row,
 *    on one body, so the near-duplicates in luminance are visible as such.
 */
const PERSON_ROW = 4.3;
const CROWD_RADIUS = 20;

function personAt(look: Look, x: number, z: number, yaw: number): THREE.Group {
  const group = buildPerson(ctx, look);
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  return group;
}

/**
 * A block of figures, centred, each built from one edited `Look`.
 *
 * **Wrapped at four and not laid out in one line**, and the reason is the
 * sheet's own honesty rule. The "read at" control puts the camera exactly that
 * far away, so a nine-wide row spanning 34 units seen from 40 shows three
 * figures and two crops — true, and useless for a study whose entire job is
 * comparison. Four columns spans 13, which fits at every distance the control
 * offers.
 */
const ROW_WRAP = 4;
const ROW_DEPTH = 5.4;

function row(base: Look, edits: readonly Partial<Look>[]): { group: THREE.Group; radius: number; triangles: number } {
  const group = new THREE.Group();
  const columns = Math.min(ROW_WRAP, edits.length);
  const rows = Math.ceil(edits.length / columns);
  const span = (columns - 1) * PERSON_ROW;
  const depth = (rows - 1) * ROW_DEPTH;
  let triangles = 0;
  edits.forEach((edit, index) => {
    const look = { ...base, ...edit };
    const column = index % columns;
    const line = Math.floor(index / columns);
    const figure = personAt(
      look,
      column * PERSON_ROW - span / 2,
      // Back rows first, so the front row is the start of the list and reads
      // left to right the way the caption does.
      depth / 2 - line * ROW_DEPTH,
      0.28,
    );
    triangles += measure(figure).triangles;
    group.add(figure);
  });
  return { group, radius: Math.max(Math.hypot(span, depth) / 2 + 2.9, 6), triangles };
}

function addPeopleCell(options: {
  title: string;
  note: string;
  group: THREE.Group;
  radius: number;
  ground: number;
  focusY: number;
  distanceScale: number;
  stats: string;
  swatches?: readonly number[];
  problems?: readonly string[];
  hero?: boolean;
}): void {
  const scene = stage(
    options.ground,
    options.radius * 1.2,
    options.hero ? () => buildPerson(ctx, heroLook(ctx.palette)) : scaleFigure,
  );
  const spinner = new THREE.Group();
  spinner.add(options.group);
  scene.add(spinner);
  addCell(peopleGrid, {
    scene,
    spinner,
    focus: new THREE.Vector3(0, options.focusY, 0),
    radius: options.radius,
    distanceScale: options.distanceScale,
    haystack: `${options.title} people crowd person`.toLowerCase(),
    broken: (options.problems?.length ?? 0) > 0,
    caption: `
      <div class="title">
        <span class="name">${options.title}</span>
        <span class="kind person">people</span>
      </div>
      <div class="meta">${options.note}</div>
      <div class="stats">${options.stats}</div>
      ${options.swatches ? `<div class="swatches">${swatchRow(options.swatches)}</div>` : ''}
      ${options.problems && options.problems.length > 0 ? `<ul class="problems">${options.problems.map((problem) => `<li>${problem}</li>`).join('')}</ul>` : ''}
    `,
  });
}

/** One person out of the crowd mix: a villager or a child, dressed for here. */
function bystanderLook(region: string, seed: number): Look {
  const who = rngFrom(seed, 'mix');
  const part = who.weighted(CROWD_MIX);
  return lookFor(rngFrom(seed, 'person'), region, part === 'child' ? { age: 'child' } : {});
}

for (const id of DRESS_IDS) {
  const style = REGIONS[id];
  const dress = dressFor(id);
  const group = new THREE.Group();
  const people = crowd(`crowd-${id}`, { radius: CROWD_RADIUS, pitch: 5.4, fill: 0.62 });
  let triangles = 0;
  let children = 0;
  const heights: number[] = [];
  const shapes = new Set<string>();
  for (const spot of people) {
    const look = bystanderLook(id, spot.seed);
    if (look.age === 'child') children++;
    heights.push(look.height);
    shapes.add(`${look.garment}|${look.headwear}|${look.hair}|${look.carry}|${look.pose}`);
    const figure = personAt(look, spot.x, spot.z, spot.yaw);
    triangles += measure(figure).triangles;
    group.add(figure);
  }
  const median = [...heights].sort((a, b) => a - b)[heights.length >> 1] ?? 0;
  addPeopleCell({
    title: style.name,
    note: dress.note,
    group,
    radius: CROWD_RADIUS + 3,
    ground: style.ground,
    focusY: 3.2,
    distanceScale: 1.7,
    hero: true,
    stats: [
      statLine('people', String(people.length)),
      statLine('children', String(children)),
      statLine('tris', number(triangles)),
      statLine('each', String(Math.round(triangles / Math.max(1, people.length)))),
      statLine('combinations', `${shapes.size}/${people.length}`, shapes.size * 2 <= people.length),
      statLine('median height', `${median.toFixed(1)} u`),
      statLine('warmth', dress.warmth.toFixed(2)),
    ].join(''),
    swatches: [...dress.cloth, ...dress.accent],
    problems: shapes.size * 2 <= people.length ? ['half the crowd shares a silhouette recipe'] : [],
  });
}

// --- appearance against dress ------------------------------------------------
{
  const front = 'nordic';
  const back = 'sub-saharan';
  const group = new THREE.Group();
  const seeds = [0, 1, 2, 3, 4, 5];
  const mismatches: string[] = [];
  const span = (seeds.length - 1) * PERSON_ROW;
  for (const [index, seed] of seeds.entries()) {
    const a = lookFor(rngFrom('twins', seed), front);
    const b = lookFor(rngFrom('twins', seed), back);
    const key = (look: Look) =>
      [look.height.toFixed(6), look.girth.toFixed(6), look.age, look.skin, look.hairColor, look.hair, look.beard].join('|');
    if (key(a) !== key(b)) mismatches.push(`seed ${seed} is a different person in the two regions`);
    group.add(personAt({ ...a, pose: 'stand' }, index * PERSON_ROW - span / 2, 3.4, 0.2));
    group.add(personAt({ ...b, pose: 'stand' }, index * PERSON_ROW - span / 2, -3.4, 0.2));
  }
  addPeopleCell({
    title: 'The same six people, twice',
    note:
      'Front row dressed Nordic, back row Sub-Saharan, from the identical six seeds. ' +
      'Same heights, same builds, same faces, same hair — different clothes. ' +
      'If a row differs in anything but cloth, the two forks in dress.ts have leaked into each other.',
    group,
    radius: Math.hypot(span, 6.8) / 2 + 3,
    ground: PALETTE.green,
    focusY: 3.4,
    distanceScale: 1.25,
    stats: [
      statLine('seeds', String(seeds.length)),
      statLine('regions', String(DRESS_IDS.length)),
      statLine('appearance', mismatches.length === 0 ? 'identical' : 'LEAKED', mismatches.length > 0),
    ].join(''),
    problems: mismatches,
  });
}

// --- one body, every pose ----------------------------------------------------
{
  const base: Look = {
    ...lookFor(rngFrom('study'), 'atlantic-europe'),
    height: AVATAR_HEIGHT,
    girth: 1,
    age: 'adult',
    garment: 'shirt',
    headwear: 'none',
    carry: 'none',
    hair: 'crop',
    beard: false,
    stoop: 0,
    sway: 0,
  };
  const poses = (Object.keys(POSES) as Pose[]).filter((pose) => pose !== 'sit');
  const built = row(base, poses.map((pose) => ({ pose })));
  addPeopleCell({
    title: 'One body, every pose',
    note:
      `${poses.join(', ')}. Identical `+
      'geometry otherwise, so every difference here is free: a pose costs no triangles at all, ' +
      'and it is the cheapest variety in the file.',
    group: built.group,
    radius: built.radius,
    ground: PALETTE.green,
    focusY: 3.4,
    distanceScale: 1.15,
    stats: [statLine('poses', String(poses.length)), statLine('tris', number(built.triangles))].join(''),
  });
}

// --- one body, every garment -------------------------------------------------
{
  const base: Look = {
    ...lookFor(rngFrom('study'), 'atlantic-europe'),
    height: AVATAR_HEIGHT,
    girth: 1,
    age: 'adult',
    headwear: 'none',
    carry: 'none',
    hair: 'crop',
    beard: false,
    pose: 'stand',
    stoop: 0,
    sway: 0,
  };
  const garments: Garment[] = ['shirt', 'tunic', 'robe', 'dress', 'coat', 'apron', 'poncho'];
  const built = row(base, garments.map((garment) => ({ garment })));
  addPeopleCell({
    title: 'One body, every garment',
    note:
      `${garments.join(', ')}. The robe is the only one that deletes the legs, which is why it is ` +
      'the cheapest and also the most different at distance: two vertical strokes become one triangle.',
    group: built.group,
    radius: built.radius,
    ground: PALETTE.green,
    focusY: 3.4,
    distanceScale: 1.15,
    stats: [statLine('garments', String(garments.length)), statLine('tris', number(built.triangles))].join(''),
  });
}

// --- one body, every hat -----------------------------------------------------
{
  const base: Look = {
    ...lookFor(rngFrom('study'), 'maghreb'),
    height: AVATAR_HEIGHT,
    girth: 1,
    age: 'adult',
    garment: 'shirt',
    carry: 'none',
    hair: 'crop',
    beard: false,
    pose: 'stand',
    stoop: 0,
    sway: 0,
  };
  const hats: Headwear[] = ['none', 'cap', 'brim', 'conical', 'beanie', 'hood', 'scarf', 'turban', 'helmet'];
  const built = row(base, hats.map((headwear) => ({ headwear })));
  addPeopleCell({
    title: 'One body, every hat',
    note:
      `${hats.join(', ')}. Five of them replace the hair rather than sitting over it — two flush ` +
      'surfaces get no ink between them, so a beanie built outside a haircut would draw nothing.',
    group: built.group,
    radius: built.radius,
    ground: PALETTE.sand,
    focusY: 3.6,
    distanceScale: 1.2,
    stats: [statLine('hats', String(hats.length)), statLine('tris', number(built.triangles))].join(''),
  });
}

// --- one body, every load ----------------------------------------------------
{
  const base: Look = {
    ...lookFor(rngFrom('study'), 'sub-saharan'),
    height: AVATAR_HEIGHT,
    girth: 1,
    age: 'adult',
    garment: 'tunic',
    headwear: 'none',
    hair: 'crop',
    beard: false,
    stoop: 0,
    sway: 0,
  };
  const loads: Carry[] = ['none', 'pack', 'satchel', 'basket', 'headload', 'staff', 'jug', 'parasol', 'bundle'];
  const built = row(
    base,
    loads.map((carry) => ({
      carry,
      pose: carry === 'headload' ? ('lift' as Pose) : carry === 'basket' ? ('carry' as Pose) : ('stand' as Pose),
    })),
  );
  addPeopleCell({
    title: 'One body, every load',
    note:
      `${loads.join(', ')}. Each is parented to the trunk and never to a hand — a hand's frame turns ` +
      'with the elbow, so a basket hung off one lies flat the moment the forearm comes up. The pose ' +
      'is what makes it read as carried.',
    group: built.group,
    radius: built.radius,
    ground: PALETTE.gold,
    focusY: 3.6,
    distanceScale: 1.2,
    stats: [statLine('loads', String(loads.length)), statLine('tris', number(built.triangles))].join(''),
  });
}

// --- the skin ramp -----------------------------------------------------------
{
  const base: Look = {
    ...lookFor(rngFrom('study'), 'atlantic-europe'),
    height: AVATAR_HEIGHT,
    girth: 1,
    age: 'adult',
    garment: 'shirt',
    headwear: 'none',
    carry: 'none',
    hair: 'crop',
    beard: false,
    pose: 'stand',
    stoop: 0,
    sway: 0,
    hairColor: PALETTE.ink,
    top: PALETTE.white,
    bottom: PALETTE.steel,
  };
  const built = row(base, SKIN_TONES.map((skin) => ({ skin })));
  addPeopleCell({
    title: 'The skin ramp, all of it',
    note:
      'Eight tones, drawn uniformly from the seed everywhere on the planet and from no region table. ' +
      'sand and blush are six points apart in luminance and tell apart by hue only; the widest step ' +
      'is clay to bark, and there is no palette entry inside it.',
    group: built.group,
    radius: built.radius,
    ground: PALETTE.green,
    focusY: 3.4,
    distanceScale: 1.15,
    stats: [statLine('tones', String(SKIN_TONES.length))].join(''),
    swatches: SKIN_TONES,
  });
}

// --- seated ------------------------------------------------------------------
{
  const group = new THREE.Group();
  const seatY = 3.2;
  const span = 4 * (PERSON_ROW + 1.6);
  for (let index = 0; index < 5; index++) {
    const astride = index >= 3;
    const look: Look = {
      ...lookFor(rngFrom('seated', index), DRESS_IDS[index % DRESS_IDS.length]!),
      pose: astride ? 'astride' : 'sit',
      // The last two ride something that publishes where its pedals and its
      // bars are, which is what `Mount.footrest` and `Mount.grip` are for. The
      // four joints are solved from those two points, so a rider fits the
      // vehicle rather than a vehicle being built around a fixed pose.
      footrest: astride ? [0.55, -1.75, 1.15] : undefined,
      grip: astride ? [0.72, 1.15, 2.0] : undefined,
    };
    const x = index * (PERSON_ROW + 1.6) - span / 2;
    if (astride) {
      // A stand-in frame, and its saddle, pedal and bar are at exactly the three
      // points the rider was given — so anything that does not line up is the
      // solver and not the drawing.
      const saddle = ctx.box(0.9, 0.4, 1.6, PALETTE.steel);
      saddle.position.set(x, seatY - 0.4, 0);
      const frame = ctx.box(0.3, 0.3, 3.6, PALETTE.steel);
      frame.position.set(x, seatY - 1.5, 0.8);
      const pedal = ctx.box(1.9, 0.24, 0.8, PALETTE.bark);
      pedal.position.set(x, seatY - 1.75 - 0.12, 1.15);
      const bars = ctx.box(1.9, 0.22, 0.22, PALETTE.bark);
      bars.position.set(x, seatY + 1.15, 2.0);
      const stem = ctx.box(0.26, seatY + 1.15 - (seatY - 1.6), 0.26, PALETTE.steel);
      stem.position.set(x, seatY - 1.6, 2.0);
      group.add(saddle, frame, pedal, bars, stem);
    } else {
      const bench = ctx.box(4.4, seatY, 3.4, PALETTE.bark);
      bench.position.set(x, 0, 0.6);
      group.add(bench);
    }
    const figure = buildPerson(ctx, look);
    // The published convention: the origin is the seat surface and the hip
    // joint sits on it. A bench of height `seatY` therefore places a person at
    // exactly `seatY`, with no leg length in the arithmetic.
    figure.position.set(x, seatY, 0);
    group.add(figure);
  }
  addPeopleCell({
    title: 'Seated, at the seat surface',
    note:
      'The two poses whose origin is not the sole. Hip at y = 0, +Z the way they face, so a bench of ' +
      'height h places a person at exactly h — the seat height is the only number a vehicle needs. ' +
      'Sitting: sole -1.66, crown +3.84, knees +1.34, elbows out to 3.91 and to 4.27 over every body. The last two are astride, ' +
      'with their four leg and arm joints solved from the pedal and the bar you can see under them.',
    group,
    radius: span / 2 + 5,
    ground: PALETTE.tan,
    focusY: 3.6,
    distanceScale: 1.4,
    stats: [
      statLine('seat', `${seatY.toFixed(1)} u`),
      statLine('footwell', '1.75 u'),
      statLine('headroom', '4.8 u'),
      statLine('width', '4.3 u'),
      statLine('solved', 'footrest + grip'),
    ].join(''),
  });
}

staticCells = cells.length;

// ---------------------------------------------------------------------------
// The parts grid
// ---------------------------------------------------------------------------

/**
 * The style a part is reviewed in.
 *
 * The first region whose tables name it, so a machiya is shown East Asian and a
 * round hut Sub-Saharan without either declaring a home.
 */
function homeStyle(part: ScenicPart): RegionStyle | null {
  for (const id of REGION_IDS) {
    const style = REGIONS[id];
    const named = [...style.buildings, ...style.civic, ...style.trees, ...style.scatter];
    if (named.some((entry) => entry.item === part.id)) return style;
  }
  return null;
}

/**
 * Parts placed by the crowd mix rather than by a region's four lists.
 *
 * The orphan banner below has been wrong twice now for the same reason: it
 * knows about the tables that existed when it was written. It was `regions.ts`
 * only, and declared the entire wild flora unbuildable; `biome.ts` fixed that;
 * `CROWD_MIX` in `dress.ts` is the third table and would have made the whole
 * population an orphan.
 */
const peopleParts = new Set(PEOPLE_PART_IDS);

/**
 * And the fourth table, which is not a table at all: `settlements.ts` places the
 * street lamp itself, on the street lattice it has already cut.
 *
 * A region's four lists hand parts to *plots* and a lamp belongs to a
 * *carriageway*, so no entry in `regions.ts` could ever name it — which is
 * precisely the shape of the two mistakes this banner has already made. Written
 * as a set of one rather than as a special case, because the next thing placed
 * off a street (a bench, a hydrant, a parked car) joins it here.
 */
const streetFurniture = new Set(['street-lamp']);

/**
 * A part nothing will ever build, and there are **two** tables that can build
 * one now.
 *
 * `regions.ts` places what a *settlement* is made of and `biome.ts` places what
 * the ground between settlements grows, and the two do not overlap: an umbrella
 * acacia is in no region's `trees` list and never will be — a village does not
 * plant one — but `BIOMES.savanna.plants` puts it across Africa. This banner
 * asked only the region tables and therefore called the entire flora orphaned,
 * which is the review sheet telling you that a part you can see working in the
 * world will never be built.
 */
const wildPlants = new Set(BIOME_IDS.flatMap((id) => [...BIOMES[id].plants]));

const orphans = PARTS.filter(
  (part) =>
    homeStyle(part) === null &&
    !wildPlants.has(part.id) &&
    !peopleParts.has(part.id) &&
    !streetFurniture.has(part.id),
).map((part) => part.id);

/** Named by a biome and by no region: correct, and worth saying which. */
const wildOnly = PARTS.filter(
  (part) => homeStyle(part) === null && wildPlants.has(part.id),
).map((part) => part.id);

/** And the other way round: a biome names an id the registry has no file for. */
const unbuilt = [...wildPlants].filter((id) => !PARTS.some((part) => part.id === id));

/** Same question of the crowd mix, which names its parts by id like everything else. */
const unbuiltPeople = PEOPLE_PART_IDS.filter((id) => !PARTS.some((part) => part.id === id));

interface PartCell {
  part: ScenicPart;
  review: PartReview;
  single: THREE.Group;
  cluster: THREE.Group;
  clusterRadius: number;
  clusterTriangles: number;
  spinner: THREE.Group;
}

const styleSelect = document.getElementById('style') as HTMLSelectElement;
styleSelect.innerHTML =
  `<option value="">each part's own region</option>` +
  REGION_IDS.map((id) => `<option value="${id}">${REGIONS[id].name}</option>`).join('');

const partCells: PartCell[] = [];

/** A cluster of one part's variants, laid out the way a settlement would. */
function buildCluster(part: ScenicPart, style: RegionStyle): { group: THREE.Group; radius: number; triangles: number } {
  const group = new THREE.Group();
  // A person is placed closer than their own declared footprint on purpose: 2.9
  // is the reach of one arm mid-sentence, and a crowd spaced by it stands four
  // avatars apart and reads as a car park.
  const pitch = part.kind === 'person' ? 5.2 : Math.max(part.footprint * 2.4, 6);
  // A wider disc for people, because the question a person's cluster answers is
  // "do thirty of these read as thirty people" and ten cannot answer it.
  const radius = pitch * (part.kind === 'person' ? 3.4 : 2.1);
  // Six is the kit's variant count and it is not a crowd — the whole point of
  // `PEOPLE_VARIANTS`. The cluster is the one view where that shows, so it is
  // the one view that must not be capped at six.
  const spread = part.kind === 'person' ? 48 : VARIANTS;
  let triangles = 0;
  for (const plot of plots(`${part.id}-cluster`, { radius, pitch, fill: 0.85, alignment: 0.5 })) {
    const index = Math.floor((plot.seed / 0x7fffffff) * spread) % spread;
    const variant = variantOf(part, style, index);
    if (!variant) continue;
    triangles += measure(variant).triangles;
    group.add(place(variant.clone(), plot.x, plot.z, plot.yaw, 1 + (plot.seed % 17) / 100 - 0.08));
  }
  return { group, radius, triangles };
}

function addPartCell(part: ScenicPart, style: RegionStyle): void {
  const kind = KINDS[part.kind];
  const review = reviewPart(part, ctx, style);

  // The single view is variant 0, so what you see in `single` is the first thing
  // the cluster puts down — no separate build to disagree with it.
  const single = new THREE.Group();
  const first = variantOf(part, style, 0);
  if (first) single.add(first.clone());

  const cluster = buildCluster(part, style);
  const tallest = review.measurements.reduce((most, entry) => Math.max(most, entry.height), 0);
  const widest = review.measurements.reduce((most, entry) => Math.max(most, entry.radius), 0);
  const triangles = review.measurements.reduce((most, entry) => Math.max(most, entry.triangles), 0);
  const meshes = review.measurements.reduce((most, entry) => Math.max(most, entry.meshes), 0);
  const colors = review.measurements.reduce<number[]>((all, entry) => {
    for (const color of entry.colors) if (!all.includes(color)) all.push(color);
    return all;
  }, []);
  const perVariant = review.measurements.map((entry) => entry.colors.length);
  const worstColors = perVariant.length > 0 ? Math.max(...perVariant) : 0;

  const scene = stage(style.ground, Math.max(cluster.radius * 1.25, part.footprint * 2.6));
  const spinner = new THREE.Group();
  spinner.add(single, cluster.group);
  scene.add(spinner);

  const storeys = (tallest / STOREY).toFixed(1);
  addCell(partGrid, {
    scene,
    spinner,
    focus: new THREE.Vector3(0, tallest * 0.45, 0),
    radius: Math.hypot(part.footprint, tallest / 2) * 1.05,
    haystack: `${part.id} ${part.name} ${part.kind}`.toLowerCase(),
    broken: review.problems.length > 0,
    caption: `
      <div class="title">
        <span class="name">${part.name}</span>
        <span class="kind ${part.kind}">${part.kind}</span>
      </div>
      <div class="meta">${part.note ?? ''}<br />${style.name} · ${storeys} storeys tall · ${(tallest / AVATAR_HEIGHT).toFixed(1)} avatars</div>
      <div class="stats">
        ${statLine('tris', `${triangles}/${kind.triangles}`, triangles > kind.triangles)}
        ${statLine('meshes', `${meshes}/${kind.meshes}`, meshes > kind.meshes)}
        ${statLine('colours', `${worstColors}/${kind.colors}`, worstColors > kind.colors)}
        ${statLine('height', `${tallest.toFixed(1)}/${kind.height}`, tallest > kind.height + 0.05)}
        ${statLine('radius', `${widest.toFixed(1)}/${part.footprint}`, widest > part.footprint + 0.05)}
        ${statLine('shapes', `${review.variety.shapes}/${review.variety.samples}`, review.variety.shapes * 2 <= review.variety.samples)}
        ${statLine('cluster', `${number(cluster.triangles)} tris`)}
      </div>
      <div class="swatches">${swatchRow(colors)}</div>
      ${review.problems.length > 0 ? `<ul class="problems">${review.problems.map((problem) => `<li>${problem}</li>`).join('')}</ul>` : ''}
    `,
  });

  partCells.push({
    part,
    review,
    single,
    cluster: cluster.group,
    clusterRadius: cluster.radius,
    clusterTriangles: cluster.triangles,
    spinner,
  });
}

function rebuildParts(): void {
  for (const cell of cells.slice(staticCells)) cell.element.remove();
  cells.length = staticCells;
  partCells.length = 0;
  partGrid.innerHTML = '';

  const forced = styleSelect.value === '' ? null : REGIONS[styleSelect.value as keyof typeof REGIONS];
  for (const part of PARTS) {
    const style = forced ?? homeStyle(part) ?? REGIONS['atlantic-europe'];
    try {
      addPartCell(part, style);
    } catch (error) {
      const element = document.createElement('article');
      element.className = 'cell broken';
      element.innerHTML = `<div class="caption"><div class="title"><span class="name">${part.id}</span></div><ul class="problems"><li>the sheet could not draw this card: ${String(error)}</li></ul></div>`;
      partGrid.appendChild(element);
    }
  }
  applyFilter();
}

// ---------------------------------------------------------------------------
// Header and notices
// ---------------------------------------------------------------------------

const notices = document.getElementById('notices')!;

function notice(text: string, calm = false): void {
  const line = document.createElement('div');
  line.className = calm ? 'notice calm' : 'notice';
  line.textContent = text;
  notices.appendChild(line);
}

for (const problem of REGISTRY_PROBLEMS) notice(problem);
if (SKIPPED.length > 0) notice(`${SKIPPED.length} file(s) in src/scenery/parts export no ScenicPart: ${SKIPPED.join(', ')}`);
if (orphans.length > 0) notice(`no region and no biome names these parts, so nothing will ever build them: ${orphans.join(', ')}`);
if (unbuilt.length > 0) notice(`biome.ts names plants with no file in parts/: ${unbuilt.join(', ')}`);
if (unbuiltPeople.length > 0) notice(`dress.ts's CROWD_MIX names people with no file in parts/: ${unbuiltPeople.join(', ')}`);
if (wildOnly.length > 0) {
  notice(
    `wild only: biome.ts plants these outside settlements and no region builds them — ${wildOnly.join(', ')}`,
    true,
  );
}

/**
 * The region table against the baked data.
 *
 * Every error this project has actually shipped was a data error, invisible in a
 * screenshot and obvious in a table, so the sheet checks the one table this kit
 * adds: an ISO code that no country has is a typo that silently does nothing,
 * and a continent with no fallback is a country with no style.
 */
async function checkRegionTable(): Promise<void> {
  let countries: { iso: string; continent: string }[];
  try {
    countries = await loadCountries();
  } catch {
    notice('could not load /data/countries.bin — the region table was not checked', true);
    return;
  }

  const known = new Set(countries.map((country) => country.iso));
  const unknown = Object.keys(ISO_REGIONS).filter((iso) => !known.has(iso));
  if (unknown.length > 0) notice(`region table names codes no country has: ${unknown.join(', ')}`);

  const byContinent = new Set(countries.map((country) => country.continent));
  const uncovered = [...byContinent].filter((continent) => CONTINENT_REGIONS[continent] === undefined);
  if (uncovered.length > 0) notice(`continents with no fallback style: ${uncovered.join(', ')}`);

  const named = countries.filter((country) => ISO_REGIONS[country.iso] !== undefined).length;
  notice(
    `${named} of ${countries.length} countries are named in the table; the other ${countries.length - named} ` +
      `resolve by continent. Every country resolves to a style.`,
    true,
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// The same pen as the planet, the monuments and the coastline. Without it these
// are boxes.
const outline = new OutlineEffect(renderer, {
  defaultThickness: 0.003,
  defaultColor: [0.11, 0.02, 0.01],
});

const filterInput = document.getElementById('filter') as HTMLInputElement;
const clusterInput = document.getElementById('cluster') as HTMLInputElement;
const spinInput = document.getElementById('spin') as HTMLInputElement;
const distanceSelect = document.getElementById('distance') as HTMLSelectElement;
const empty = document.getElementById('empty')!;

let dirty = true;
const invalidate = (): void => {
  dirty = true;
};

function applyFilter(): void {
  const needle = filterInput.value.trim().toLowerCase();
  let shown = 0;
  for (const cell of cells) {
    const visible = needle === '' || cell.haystack.includes(needle);
    cell.element.style.display = visible ? '' : 'none';
    if (visible) shown++;
  }
  empty.hidden = shown > 0;
  invalidate();
}

function applyCluster(): void {
  const clustered = clusterInput.checked;
  for (const cell of partCells) {
    cell.single.visible = !clustered;
    cell.cluster.visible = clustered;
  }
  // The two modes answer different questions and cannot share a frame.
  //
  // **Single is the honest one**: distance scale 1, so at "120 u" the part is
  // exactly the size it will be at 120 units, which is the whole reason the
  // sheet frames by distance instead of fitting.
  //
  // **Cluster steps back**, because a dozen houses spread over sixty units seen
  // from 120 is four houses and a crop — true, and useless for the one thing the
  // mode exists to show. The step is proportional to the cluster's own spread,
  // so every cluster arrives at about the same size in the cell and the "read
  // at" control still moves them all together.
  cells.slice(staticCells).forEach((cell, index) => {
    const part = partCells[index];
    if (!part) return;
    const tallest = part.review.measurements.reduce((most, entry) => Math.max(most, entry.height), 0);
    const reach = part.clusterRadius + part.part.footprint;
    cell.radius = clustered ? Math.hypot(reach, tallest / 2) : Math.hypot(part.part.footprint, tallest / 2) * 1.05;
    cell.distanceScale = clustered ? THREE.MathUtils.clamp(reach / 13, 1, 4) : 1;
  });
  invalidate();
}

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  invalidate();
}

addEventListener('resize', resize);
addEventListener('scroll', invalidate, { passive: true });
filterInput.addEventListener('input', applyFilter);
clusterInput.addEventListener('change', applyCluster);
spinInput.addEventListener('change', invalidate);
distanceSelect.addEventListener('change', () => {
  updateNotes();
  invalidate();
});
styleSelect.addEventListener('change', () => {
  rebuildParts();
  applyCluster();
});

/**
 * Frames one cell.
 *
 * Two modes and they answer different questions. **`fit`** puts the whole
 * subject in the cell, which is the contact sheet's framing and is for looking
 * at geometry. **A distance** puts the camera exactly that far away and cuts the
 * cell's field of view out of the world's 55 degrees in proportion to the cell's
 * share of the window height — so the part appears at the same angular size it
 * would if you were standing there, and a cell that looks empty is telling you
 * the truth.
 */
function frame(camera: THREE.PerspectiveCamera, cell: Cell, aspect: number, heightPx: number): void {
  const distance = Number(distanceSelect.value);
  camera.aspect = aspect;

  if (distance > 0) {
    camera.fov = THREE.MathUtils.clamp((WORLD_FOV * heightPx) / innerHeight, 4, 80);
    camera.position.copy(cell.focus).addScaledVector(VIEW, distance * cell.distanceScale);
  } else {
    camera.fov = 30;
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    const fitted = (cell.radius * 1.15) / Math.sin(Math.min(vertical, horizontal) / 2);
    camera.position.copy(cell.focus).addScaledVector(VIEW, fitted);
  }

  camera.lookAt(cell.focus);
  const range = camera.position.distanceTo(cell.focus);
  camera.near = Math.max(0.5, range - cell.radius * 4);
  camera.far = range + cell.radius * 6 + 400;
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

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setClearColor(SKY_TOP, 1);
  renderer.clear();

  renderer.setScissorTest(true);
  for (const cell of cells) {
    if (spinning) cell.spinner.rotation.y += dt * SPIN_RATE;
    else if (cell.spinner.rotation.y !== 0) cell.spinner.rotation.y = 0;

    const rect = cell.stage.getBoundingClientRect();
    // Only what is on screen: with thirty cells and a village in half of them,
    // this is the difference between a tool and a slideshow.
    if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > innerHeight) continue;

    const bottom = innerHeight - rect.bottom;
    renderer.setViewport(rect.left, bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, bottom, rect.width, rect.height);
    frame(cell.camera, cell, rect.width / rect.height, rect.height);
    outline.render(cell.scene, cell.camera);
  }
  renderer.setScissorTest(false);
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

function updateNotes(): void {
  const distance = Number(distanceSelect.value);
  const legible = distance > 0 ? LEGIBLE_AT(distance) : 0;
  document.getElementById('parts-note')!.textContent =
    distance > 0
      ? `at ${distance} units nothing under ${legible.toFixed(2)} units reads — a storey is ${STOREY.toFixed(2)}. ` +
        `A single part is drawn at exactly that distance; a cluster steps back until it fits.`
      : 'fitted to each part: for geometry, not for the review';
  document.getElementById('regions-note')!.textContent =
    distance > 0
      ? `one village per style, ${VILLAGE_RADIUS * 2} units across, seen from ${distance * 3.4} units`
      : `one village per style, ${VILLAGE_RADIUS * 2} units across`;
  document.getElementById('people-note')!.textContent =
    `one crowd per wardrobe on a ${CROWD_RADIUS * 2}-unit patch, the player standing in each at his real ` +
    `${AVATAR_HEIGHT} units, then the studies. Repetition is invisible in one figure and obvious in thirty.`;
}

rebuildParts();
applyCluster();
updateNotes();
resize();
void checkRegionTable();

document.getElementById('totals')!.innerHTML = [
  `<b>${PARTS.length}</b> parts`,
  `<b>${REGION_IDS.length}</b> regions`,
  `<b>${variants.size}</b> variants built`,
  `<b>${number(villages.reduce((sum, village) => sum + village.triangles, 0))}</b> triangles in ${villages.length} villages`,
  villages.every((village) => village.repeatable) ? 'villages repeat exactly' : 'a village is not repeatable',
  partCells.some((cell) => cell.review.problems.length > 0)
    ? `<b>${partCells.filter((cell) => cell.review.problems.length > 0).length}</b> with problems`
    : 'all parts pass',
].join(' · ');

requestAnimationFrame(loop);

// The sheet is also the fastest console for this.
Object.assign(globalThis, { sheet: { PARTS, REGIONS, cells, partCells, villages, ctx, variants, measure } });
