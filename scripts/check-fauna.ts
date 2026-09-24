/**
 * Headless assertions over `src/fauna/` — the land animals and how they walk.
 *
 * **A gait bug is a number, not a picture**, and it is the number the biped rig
 * already taught this project to take: `avatar.ts` swept a whole cycle and
 * asserted that the lowest point of the rig never ends up below the floor, which
 * found a *swinging* foot 0.31 units under the ground that no still frame could
 * have shown. A quadruped has four of those and two kinds of joint, so the sweep
 * is the same shape and asks three more things:
 *
 * - **nothing digs** — the biped's own assertion, four times over;
 * - **something is standing on it** — a quadruped's version of double support,
 *   and it is what makes a frozen frame of the cycle safe to merge into a herd;
 * - **every fold is lifting** — the contract's `foldLifts`, checked at every
 *   phase of every leg, which is the one thing that does not transfer from the
 *   biped because a hock bends the other way.
 *
 * It also prints a **silhouette**, because an animal that measures correctly and
 * does not look like itself is the failure the whole kit exists to avoid and it
 * is the one no table can see.
 *
 *   node scripts/check-fauna.ts     (or `pnpm fauna`)
 */
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import {
  FAUNA_SCALE,
  GAITS,
  LEG_ORDER,
  VARIANTS,
  createFaunaContext,
  extentOf,
  foldLifts,
  legAt,
  m,
  measure,
  validateAnimal,
  variantRng,
} from '../src/fauna/contract.ts';
import { BODY_SCALE, PERSON_METRES, STATURE } from '../src/stature.ts';
import type { Animal, FaunaStyle, GaitName } from '../src/fauna/contract.ts';
import { buildAnimal, hooves, legsOf, poseBody, strideOf } from '../src/fauna/body.ts';
import type { Pose } from '../src/fauna/body.ts';
import { BY_BIOME, FAUNA_STYLES, MISSING_REGIONS, RANGE, nativeHere } from '../src/fauna/regions.ts';
import type { RegionId } from '../src/fauna/regions.ts';
import { AVATAR_HEIGHT } from '../src/scenery/contract.ts';
import { SCENERY_SCALE } from '../src/traffic/contract.ts';
import { MeshBasicMaterial } from 'three';
import { rigFromDisk } from './kit-node.ts';

// The herds are drawn from baked CC0 rigs (scripts/build-kit.ts), read off disk
// the way the world fetches them. Every rig an animal names is loaded up front,
// so no herd in these checks waits on one.
const RIG_IDS = ['cow', 'bull', 'horse', 'donkey', 'sheep', 'alpaca', 'stag', 'camel'];
const RIGS = new Map(await Promise.all(RIG_IDS.map(async (id) => [id, await rigFromDisk(id, new MeshBasicMaterial())] as const)));
const rigs = { get: (id: string) => RIGS.get(id) ?? null };

const here = dirname(fileURLToPath(import.meta.url));
const PARTS = resolve(here, '../src/fauna/parts');

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};
const n = (value: number, places = 3): string => value.toFixed(places);

// --- the registry, read off disk -------------------------------------------
//
// `src/fauna/index.ts` is built on `import.meta.glob`, which is a Vite
// transform and does not exist in Node. The same trick `check-traffic.ts` and
// `build-monuments.ts` use: walk `parts/` and import each file.

const ANIMALS: Animal[] = [];
const registryProblems: string[] = [];
for (const file of readdirSync(PARTS).filter((name) => name.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(PARTS, file)).href)) as Record<string, unknown>;
  const found = Object.values(module).filter(
    (value): value is Animal =>
      typeof value === 'object' && value !== null &&
      typeof (value as Animal).id === 'string' &&
      typeof (value as Animal).build === 'function' &&
      typeof (value as Animal).shape === 'function',
  );
  if (found.length === 0) registryProblems.push(`${file} exports no animal`);
  for (const entry of found) {
    if (file !== `${entry.id}.ts`) registryProblems.push(`${file} holds '${entry.id}'`);
    ANIMALS.push(entry);
  }
}
ANIMALS.sort((a, b) => a.id.localeCompare(b.id));

const ctx = createFaunaContext();
const STYLES = Object.values(FAUNA_STYLES);

console.log(`\natlas fauna — ${ANIMALS.length} animals x ${STYLES.length} regions x ${VARIANTS} variants`);

// ---------------------------------------------------------------------------
console.log('\nthe registry');
// ---------------------------------------------------------------------------

check(registryProblems.length === 0, 'every file in parts/ exports one animal named after it',
  registryProblems.join('; '));
check(ANIMALS.length > 0, 'the kit is not empty', `${ANIMALS.length} animals`);
check(MISSING_REGIONS.length === 0, 'every scenery region has a fauna style', MISSING_REGIONS.join(', '));

const known = new Set<string>();
const unknown: string[] = [];
for (const list of Object.values(BY_BIOME)) {
  for (const entry of list) {
    if (ANIMALS.some((a) => a.id === entry.item)) known.add(entry.item);
    else if (!unknown.includes(entry.item)) unknown.push(entry.item);
  }
}
for (const style of STYLES) {
  for (const entry of style.stock) {
    if (ANIMALS.some((a) => a.id === entry.item)) known.add(entry.item);
    else if (!unknown.includes(entry.item)) unknown.push(entry.item);
  }
}
check(unknown.length === 0, 'both tables name only animals the kit has', unknown.join(', '));
const orphans = ANIMALS.filter((a) => !known.has(a.id)).map((a) => a.id);
check(orphans.length === 0, 'no animal is unreachable from either table', orphans.join(', '));
for (const id of Object.keys(RANGE)) {
  check(ANIMALS.some((a) => a.id === id), `RANGE names a real animal: ${id}`);
}

// ---------------------------------------------------------------------------
console.log('\nscale — an animal is at the world\'s scale, with the person beside her');
// ---------------------------------------------------------------------------

check(Math.abs(FAUNA_SCALE - AVATAR_HEIGHT / PERSON_METRES) < 1e-9,
  'FAUNA_SCALE is derived from AVATAR_HEIGHT', `${n(FAUNA_SCALE, 4)} units/m`);
check(Math.abs(FAUNA_SCALE - SCENERY_SCALE * STATURE) < 1e-9,
  'and it is the world\'s scale drawn at the stature people are', `${n(FAUNA_SCALE, 4)} against ${n(SCENERY_SCALE, 4)} x ${STATURE}`);
// The relation the traffic kit says is the one to be right about.
const cowMetres = 1.4;
check(m(cowMetres) / AVATAR_HEIGHT > 0.7 && m(cowMetres) / AVATAR_HEIGHT < 0.85,
  'a 1.4 m cow stands at four fifths of the person beside her',
  `${n(m(cowMetres), 2)} of ${AVATAR_HEIGHT} = ${n((100 * m(cowMetres)) / AVATAR_HEIGHT, 1)}%, against ${n((100 * cowMetres * SCENERY_SCALE) / AVATAR_HEIGHT, 1)}% at scenery scale`);

// ---------------------------------------------------------------------------
console.log('\nthe contract — every animal, every region, every variant');
// ---------------------------------------------------------------------------

interface Row {
  animal: Animal;
  triangles: number;
  meshes: number;
  colors: number;
  length: [number, number];
  width: [number, number];
  height: [number, number];
  floor: number;
  offCentre: number;
  problems: string[];
  builds: number;
}

const rows: Row[] = [];
const started = performance.now();
for (const animal of ANIMALS) {
  const row: Row = {
    animal, triangles: 0, meshes: 0, colors: 0,
    length: [Infinity, 0], width: [Infinity, 0], height: [Infinity, 0],
    floor: 0, offCentre: 0, problems: [], builds: 0,
  };
  for (const style of STYLES) {
    for (let variant = 0; variant < VARIANTS; variant++) {
      const group = animal.build(ctx, variantRng(animal, style, variant), style);
      const extent = extentOf(group);
      const measured = measure(group);
      row.builds++;
      row.triangles = Math.max(row.triangles, measured.triangles);
      row.meshes = Math.max(row.meshes, measured.meshes);
      row.colors = Math.max(row.colors, measured.colors.length);
      row.length = [Math.min(row.length[0], extent.length), Math.max(row.length[1], extent.length)];
      row.width = [Math.min(row.width[0], extent.width), Math.max(row.width[1], extent.width)];
      row.height = [Math.min(row.height[0], extent.height), Math.max(row.height[1], extent.height)];
      row.floor = Math.min(row.floor, extent.floor);
      row.offCentre = Math.max(row.offCentre, Math.abs(extent.centreX), Math.abs(extent.centreZ));
      for (const problem of validateAnimal(animal, group)) {
        const text = `${style.id} v${variant}: ${problem}`;
        if (row.problems.length < 4) row.problems.push(text);
      }
    }
  }
  rows.push(row);
}
const buildMs = performance.now() - started;
const totalBuilds = rows.reduce((sum, row) => sum + row.builds, 0);

console.log('\n  id          kind    tris  mesh  col   length         width          height        floor');
for (const row of rows) {
  const band = (pair: [number, number]): string => `${n(pair[0], 2)}-${n(pair[1], 2)}`.padEnd(13);
  console.log(
    `  ${row.animal.id.padEnd(11)} ${row.animal.kind.padEnd(6)} ${String(row.triangles).padStart(4)}` +
    `  ${String(row.meshes).padStart(3)}   ${row.colors}    ${band(row.length)}  ${band(row.width)}  ${band(row.height)}  ${n(row.floor, 4)}`,
  );
}
console.log(`  ${totalBuilds} builds in ${n(buildMs, 0)} ms — ${n(buildMs / totalBuilds, 3)} ms each`);

for (const row of rows) {
  check(row.problems.length === 0, `${row.animal.id} holds the contract in all ${row.builds} builds`,
    row.problems.join(' | '));
}
check(rows.every((row) => row.floor > -0.02), 'no variant of anything stands below y = 0',
  `worst ${n(Math.min(...rows.map((row) => row.floor)), 4)}`);
check(rows.every((row) => row.offCentre < 0.9), 'every animal is centred on its own origin',
  `worst ${n(Math.max(...rows.map((row) => row.offCentre)), 3)}`);

// Determinism. Byte for byte over the position buffers, not a triangle count:
// the weaker test misses a build that shuffles a colour or moves a leg.
let indeterminate = 0;
for (const animal of ANIMALS) {
  const style = FAUNA_STYLES['east-europe'];
  const a = fingerprint(animal.build(ctx, variantRng(animal, style, 0), style));
  const b = fingerprint(animal.build(ctx, variantRng(animal, style, 0), style));
  if (a !== b) indeterminate++;
}
check(indeterminate === 0, 'the same seed builds the same animal twice', `${indeterminate} drifted`);

// ---------------------------------------------------------------------------
console.log('\nthe gait — the sweep the biped taught, with two joints instead of one');
// ---------------------------------------------------------------------------

/**
 * The whole argument, as a table.
 *
 * `foldLifts` says a fold lifts the foot only while it is taking the lower
 * segment further from vertical. For a knee that means the lower segment must
 * already be trailing; for a hock, already reaching. The fore leg is nearly
 * straight at rest and needs the gate; the hind leg is a `Z` at rest and does
 * not.
 */
const PHASES = 128;
interface Sweep {
  worstDip: number;
  /** Max, over phases, of the second-lowest hoof. Small means double support. */
  support2: number;
  /** Ditto the third-lowest. Small means a walk; large means a pace. */
  support3: number;
  /** How far the crown travels over a cycle. */
  bob: number;
  /** Phases at which a fold was applied while it would have pushed the foot down. */
  wrongWay: number;
  /** Phases at which a hind fold was outside its lifting half-plane at all. */
  hindOutside: number;
  /** Deepest a cannon's corner reaches below its own axis endpoint. */
  cornerDig: number;
  /** How high the swinging foot gets. The scale `support2` has to be read against. */
  maxFoot: number;
  stride: number;
}

function sweep(animal: Animal, gait: GaitName): Sweep {
  const style = FAUNA_STYLES['atlantic-europe'];
  const shape = animal.shape(variantRng(animal, style, 0), style);
  const legs = legsOf(shape, gait);
  const body = buildAnimal(ctx, shape, { kind: 'walk', gait, phase: 0 });
  const out: Sweep = {
    worstDip: 0, support2: 0, support3: 0, bob: 0,
    wrongWay: 0, hindOutside: 0, cornerDig: 0, maxFoot: 0, stride: strideOf(shape, gait),
  };
  let lowCrown = Infinity;
  let highCrown = -Infinity;
  const box = new THREE.Box3();
  for (let i = 0; i < PHASES; i++) {
    const phase = i / PHASES;
    const dip = poseBody(body, { kind: 'walk', gait, phase });
    if (dip < out.worstDip) out.worstDip = dip;

    // The arithmetic, per leg, independent of the built mesh.
    for (const leg of legs) {
      const at = legAt(leg, phase);
      const folding = at.fold > leg.restFold + 1e-9;
      if (folding && !foldLifts(at.lower, leg.kind)) out.wrongWay++;
      if (leg.kind === 'hock' && !foldLifts(at.lower, leg.kind)) out.hindOutside++;
    }

    // And the built mesh, which is the thing on the screen.
    const feet = hooves(body).map((point) => point.y).sort((a, b) => a - b);
    out.support2 = Math.max(out.support2, feet[1]!);
    out.support3 = Math.max(out.support3, feet[2]!);
    out.maxFoot = Math.max(out.maxFoot, feet[3]!);
    // The lowest hoof *axis* point sits above the mesh floor by exactly how far
    // the cannon's bottom corner has swung under it.
    out.cornerDig = Math.max(out.cornerDig, feet[0]!);
    box.setFromObject(body.root);
    lowCrown = Math.min(lowCrown, box.max.y);
    highCrown = Math.max(highCrown, box.max.y);
  }
  out.bob = highCrown - lowCrown;
  return out;
}

console.log('\n  id          gait   worst dip   2nd foot   3rd foot   top foot   corner dig    bob   stride');
const sweeps = new Map<string, Sweep>();
for (const animal of ANIMALS) {
  const result = sweep(animal, animal.gait);
  sweeps.set(animal.id, result);
  console.log(
    `  ${animal.id.padEnd(11)} ${animal.gait.padEnd(6)} ${n(result.worstDip, 4).padStart(9)}` +
    `  ${n(result.support2, 3).padStart(9)}  ${n(result.support3, 3).padStart(9)}  ${n(result.maxFoot, 3).padStart(8)}` +
    `  ${n(result.cornerDig, 4).padStart(10)}  ${n(result.bob, 3).padStart(5)}  ${n(result.stride, 2).padStart(6)}`,
  );
}

const worstDip = Math.min(...[...sweeps.values()].map((s) => s.worstDip));
check(worstDip > -0.01, 'no hoof of any animal ever ends up below the floor',
  `worst ${n(worstDip, 4)} over ${PHASES} phases x 4 legs x ${ANIMALS.length} animals`);

const wrongWay = [...sweeps.values()].reduce((sum, s) => sum + s.wrongWay, 0);
check(wrongWay === 0, 'every fold applied is a fold that lifts', `${wrongWay} phases folded the wrong way`);

const hindOutside = [...sweeps.values()].reduce((sum, s) => sum + s.hindOutside, 0);
check(hindOutside === 0,
  'the hind leg never leaves its lifting half-plane, so the hock needs no gate at all',
  `${hindOutside} of ${PHASES * 2 * ANIMALS.length} hind-leg phases outside it`);

/**
 * **Support is a ratio and not a distance**, and the first version of this
 * assertion was a distance and failed on the camel for a reason that was not a
 * fault. A foot rises at *both* extremes of its swing whether or not the joint
 * is folding — the leg is pivoting about the hip, so `L cos(h)` shortens at
 * either end of the arc — which means "how high is the second-lowest foot" has
 * a floor set by the swing amplitude and by nothing else. On a camel that is
 * 0.43 units, and the animal is not floating: it is a tall animal taking a long
 * stride. What says there is a planted pair is that the second foot stays well
 * under the *swinging* one, which is scale-free and is the same number for a
 * sheep and for a camel.
 */
const worstRatio = Math.max(...[...sweeps.values()].map((s) => s.support2 / s.maxFoot));
check(worstRatio < 0.55,
  'a planted pair is always clear of the swinging pair, so a frozen frame does not float',
  `worst second foot at ${n(100 * worstRatio, 0)}% of the swinging foot's own lift`);

/**
 * **What actually separates a pace from a walk is which pair moves together,
 * and it is not how many feet are down.** The obvious discriminator — a pacer
 * stands on two feet where a walker stands on three — measured as *no
 * difference at all*: the lift window is a quarter of a cycle either way, so
 * both gaits have about one foot up at a time and the camel's third foot sits
 * at 30% of the swing against cattle's 34%. The number that does separate them
 * is the gap between the two legs on **one side** against the gap across the
 * **diagonal**, straight out of the offsets.
 */
const gapOf = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
};
console.log('\n  gait   lateral pair   diagonal pair   what it is');
for (const [name, offsets] of Object.entries(GAITS)) {
  const lateral = gapOf(offsets[LEG_ORDER.indexOf('left-hind')]!, offsets[LEG_ORDER.indexOf('left-fore')]!);
  const diagonal = gapOf(offsets[LEG_ORDER.indexOf('left-hind')]!, offsets[LEG_ORDER.indexOf('right-fore')]!);
  const reads = lateral < diagonal * 0.5 ? 'a pace: one side moves as a unit'
    : Math.abs(lateral - diagonal) < 0.02 ? 'a walk: neither pair is favoured'
      : 'a trot';
  console.log(`  ${name.padEnd(6)} ${n(lateral, 3).padStart(12)}  ${n(diagonal, 3).padStart(14)}   ${reads}`);
}
{
  const lateral = gapOf(GAITS.pace[0], GAITS.pace[1]);
  const diagonal = gapOf(GAITS.pace[0], GAITS.pace[3]);
  check(lateral < diagonal * 0.35, 'the pace really does move one side as a unit',
    `${n(lateral, 3)} of a cycle laterally against ${n(diagonal, 3)} diagonally`);
  const wl = gapOf(GAITS.walk[0], GAITS.walk[1]);
  const wd = gapOf(GAITS.walk[0], GAITS.walk[3]);
  check(Math.abs(wl - wd) < 1e-9, 'and the walk favours neither pair', `${n(wl, 3)} against ${n(wd, 3)}`);
}

const dig = Math.max(...[...sweeps.values()].map((s) => s.cornerDig));
console.log(
  `  note  the cannon has no ankle joint: its bottom corner reaches ${n(dig, 3)} under its own axis,\n` +
  `        against the 0.42 that made \`avatar.ts\` give a rigid boot one.`,
);

// Contralateral, which is the one thing a gait cannot get wrong, and which the
// crowd shipped backwards for months.
for (const [name, offsets] of Object.entries(GAITS)) {
  const gap = (a: number, b: number): number => {
    const d = Math.abs(a - b) % 1;
    return Math.min(d, 1 - d);
  };
  const hind = gap(offsets[LEG_ORDER.indexOf('left-hind')]!, offsets[LEG_ORDER.indexOf('right-hind')]!);
  const fore = gap(offsets[LEG_ORDER.indexOf('left-fore')]!, offsets[LEG_ORDER.indexOf('right-fore')]!);
  check(Math.abs(hind - 0.5) < 1e-9 && Math.abs(fore - 0.5) < 1e-9,
    `${name}: the two hinds and the two fores are half a cycle apart`,
    `hind ${n(hind, 3)}, fore ${n(fore, 3)}`);
}
// A walk is four beats and a pace is two: the number of *distinct* footfall
// times is what separates them, and it is the whole of `GAITS`.
check(new Set(GAITS.walk).size === 4, 'the walk is four-beat');
check(new Set(GAITS.pace.map((o) => Math.round(o * 2) / 2)).size === 2, 'the pace is two-beat');

// ---------------------------------------------------------------------------
console.log('\nthe static poses — a merged herd is frozen, so nothing may float');
// ---------------------------------------------------------------------------

const POSES: Pose[] = [{ kind: 'stand' }, { kind: 'alert' }, { kind: 'graze' }];
console.log('\n  id          pose    floor    highest hoof   head height');
let floatedStanding = 0;
for (const animal of ANIMALS) {
  const style = FAUNA_STYLES.mediterranean;
  for (const pose of POSES) {
    const shape = animal.shape(variantRng(animal, style, 1), style);
    const body = buildAnimal(ctx, shape, pose);
    const box = new THREE.Box3().setFromObject(body.root);
    const feet = hooves(body).map((point) => point.y).sort((a, b) => a - b);
    const highest = feet[3]!;
    if (highest > 0.30) floatedStanding++;
    console.log(
      `  ${animal.id.padEnd(11)} ${pose.kind.padEnd(6)} ${n(box.min.y, 4).padStart(7)}` +
      `  ${n(highest, 3).padStart(12)}   ${n(box.max.y, 2).padStart(11)}`,
    );
  }
}
check(floatedStanding === 0, 'all four feet are down in every static pose', `${floatedStanding} floated`);

// A grazing animal has to get its muzzle to the ground, and the whole reason
// `graze` exists is that a herd of heads-up animals reads as a herd of statues.
let tooHigh = 0;
const grazeHeights: string[] = [];
for (const animal of ANIMALS) {
  const style = FAUNA_STYLES.mediterranean;
  const shape = animal.shape(variantRng(animal, style, 1), style);
  const withers = m(shape.withers);
  for (const pose of [{ kind: 'graze' } as Pose, { kind: 'stand' } as Pose]) {
    const built = buildAnimal(ctx, shape, pose);
    built.root.updateMatrixWorld(true);
    const nose = new THREE.Vector3(0, 0, built.noseReach).applyMatrix4(built.head.matrixWorld);
    grazeHeights.push(`${animal.id} ${pose.kind} nose ${n(nose.y, 2)} of a ${n(withers, 2)} withers`);
    // A grazing animal has to get its muzzle to the grass, and a standing one
    // has to not: both halves, or `graze` is a pose that does nothing.
    if (pose.kind === 'graze' && nose.y > withers * 0.30) tooHigh++;
    if (pose.kind === 'stand' && nose.y < withers * 0.55) tooHigh++;
  }
}
for (const line of grazeHeights) console.log(`  ${line}`);
check(tooHigh === 0, 'a grazing animal gets its muzzle to the grass and a standing one does not',
  `${tooHigh} of ${grazeHeights.length} wrong`);

// ---------------------------------------------------------------------------
console.log('\nwhere they stand — the biome says what, the region says whose');
// ---------------------------------------------------------------------------

const biomes = (Object.keys(BY_BIOME) as (keyof typeof BY_BIOME)[]).filter((id) => BY_BIOME[id].length > 0);
const regionIds = Object.keys(FAUNA_STYLES) as RegionId[];
let empty = 0;
const emptyPairs: string[] = [];
for (const biome of biomes) {
  for (const region of regionIds) {
    const available = BY_BIOME[biome].filter((entry) => nativeHere(entry.item, region));
    if (available.length === 0) {
      empty++;
      if (emptyPairs.length < 6) emptyPairs.push(`${biome}/${region}`);
    }
  }
}
check(empty === 0, 'every climate that carries anything carries something in every region',
  emptyPairs.join(', ') || `${biomes.length} biomes x ${regionIds.length} regions`);
check(BY_BIOME.ice.length === 0, 'nothing grazes an ice cap');

console.log('\n  what a climate carries, once the range map has had its say');
for (const biome of biomes) {
  const everywhere = BY_BIOME[biome].filter((entry) => RANGE[entry.item] === undefined).map((e) => e.item);
  const gated = BY_BIOME[biome].filter((entry) => RANGE[entry.item] !== undefined).map((e) => e.item);
  console.log(`  ${biome.padEnd(11)} ${everywhere.join(' ')}${gated.length ? `   [ranged: ${gated.join(' ')}]` : ''}`);
}

// The two mechanisms compose, and this is the case that shows it: a camel's
// range includes `east-europe` because that row holds Kazakhstan and Mongolia,
// and there is still no camel on Serbian pasture, because Serbian ground is
// `temperate` and `BY_BIOME.temperate` has no camel in it.
check(nativeHere('camel', 'east-europe'), "a camel's range reaches the Kazakh steppe");
check(!BY_BIOME.temperate.some((entry) => entry.item === 'camel'),
  'and no climate that Serbia has puts one there');
check(!nativeHere('camel', 'north-america') && !nativeHere('camel', 'latin-america'),
  'no camel in the Americas');
check(!nativeHere('llama', 'east-asia') && nativeHere('llama', 'latin-america'),
  'the llama is Andean and nothing else');
check(nativeHere('sheep', 'polar') && nativeHere('cattle', 'oceania'),
  'sheep and cattle are unlisted, so they live anywhere');

// ---------------------------------------------------------------------------
console.log('\nlegibility — what an animal is on the screen, in pixels');
// ---------------------------------------------------------------------------

/** The project's own lens: `937 * size / distance`. */
const px = (size: number, distance: number): number => (937 * size) / distance;
const BIRD_SPAN = 4.2 * BODY_SCALE;
console.log('\n  id          length   at 300u   at 120u   at 40u');
for (const row of rows) {
  const length = row.length[1];
  console.log(
    `  ${row.animal.id.padEnd(11)} ${n(length, 2).padStart(6)}` +
    `  ${n(px(length, 300), 1).padStart(7)}   ${n(px(length, 120), 1).padStart(7)}   ${n(px(length, 40), 1).padStart(6)}`,
  );
}
const smallest = Math.min(...rows.map((row) => row.length[1]));
check(px(smallest, 300) >= px(BIRD_SPAN, 300),
  'the smallest animal is at least as legible at 300 units as a bird is',
  `${n(px(smallest, 300), 1)} px against the gull's ${n(px(BIRD_SPAN, 300), 1)}`);


// ---------------------------------------------------------------------------
console.log('\nin the world — what a herd costs, against what a mover would');
// ---------------------------------------------------------------------------

/**
 * Drives `src/life.ts` over the real planet, the way `check-life.ts` does.
 *
 * **The number this section exists for is the ratio**, not the milliseconds: a
 * herd is one mesh however many head it has, so five animals cost one draw call
 * where five movers would cost five. That is the same trade `settlements.ts`
 * measured at one draw call against 218, arriving at the one thing in this world
 * that is honestly motionless.
 */
{
  const { loadLakes, loadWorld } = await import('../src/geo.ts');
  const { PLANET_RADIUS, UNITS_PER_DEGREE } = await import('../src/globe.ts');
  const { unitAt } = await import('../src/sphere.ts');
  const { setDetailSites, setFlattenSites } = await import('../src/terrain.ts');
  const { terrainSiteOf } = await import('../src/places.ts');
  const { decodePlaces, inflate } = await import('../src/pack.ts');
  const { createLife } = await import('../src/life.ts');
  const { setDetail } = await import('../src/view.ts');
  const { readFileSync, existsSync } = await import('node:fs');

  const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
  const lakesPath = resolve(here, '../public/data/lakes.bin');
  const lakes = existsSync(lakesPath) ? readFileSync(lakesPath) : outlines;
  globalThis.fetch = (async (url: string) => ({
    ok: true, status: 200,
    arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
  })) as unknown as typeof fetch;

  const monumentsPath = resolve(here, '../public/data/monuments.json');
  const monuments = existsSync(monumentsPath)
    ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: unknown[] }).monuments
    : [];
  setFlattenSites(monuments as never);
  const raw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
  setDetailSites(raw.map(terrainSiteOf));
  const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());

  const life = createLife(world, raw, { animals: ANIMALS, rigs });
  const at = (lat: number, lon: number, up: number): THREE.Vector3 => {
    const direction = unitAt(lat, lon, new THREE.Vector3());
    return direction.clone().multiplyScalar(PLANET_RADIUS + world.elevationAt(direction) + up);
  };

  const PLACES: [string, number, number][] = [
    ['Ulm, temperate', 48.40, 9.99],
    ['the Sahara', 23.0, 12.0],
    ['the Mongolian steppe', 46.5, 103.0],
    ['the Altiplano', -16.5, -68.2],
    ['Finnmark, tundra', 70.0, 25.0],
    ['the Serengeti', -2.3, 34.8],
    ['Cornwall', 50.3, -5.0],
    ['open ocean', 30.0, -40.0],
  ];

  console.log('\n  where                    detail  herds  animals   meshes  triangles   scan ms  cold   build ms');
  for (const detail of [0.5, 1, 3]) {
    setDetail(detail);
    for (const [name, lat, lon] of PLACES) {
      if (detail !== 1 && name !== 'Ulm, temperate' && name !== 'the Sahara') continue;
      const viewer = at(lat, lon, 8);
      // Forty frames: the scan admits, then `serve` builds one herd a frame
      // under `BUILD_BUDGET_MS`, exactly as it does in the browser.
      //
      // **The median and not the worst, and that is not the softer test.** On a
      // loaded machine a process descheduled mid-scan reads as a
      // ten-millisecond scan; `check-life.ts` says the same thing about the
      // same file. The first scan is separately worth having, because it is the
      // only cold one — every cache in the herd path is filled by it.
      const scans: number[] = [];
      const builds: number[] = [];
      for (let frame = 0; frame < 40; frame++) {
        life.update(viewer, 8, undefined, frame * 0.05);
        if (life.stats.lastScanMs > 0) scans.push(life.stats.lastScanMs);
        if (life.stats.lastBuildMs > 0) builds.push(life.stats.lastBuildMs);
      }
      const cold = scans[0] ?? 0;
      const mid = (list: number[]): number =>
        list.length === 0 ? 0 : [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]!;
      const scanMs = mid(scans);
      const buildMs = mid(builds);
      const s = life.stats;
      console.log(
        `  ${name.padEnd(24)} ${String(detail).padStart(5)}  ${String(s.herd).padStart(5)}` +
        `  ${String(s.animals).padStart(7)}   ${String(s.meshes).padStart(6)}  ${String(s.triangles).padStart(9)}` +
        `   ${n(scanMs, 2).padStart(7)}  ${n(cold, 1).padStart(4)}   ${n(buildMs, 2).padStart(8)}`,
      );
    }
  }
  setDetail(1);

  // The claim, measured rather than asserted.
  const viewer = at(48.40, 9.99, 8);
  for (let frame = 0; frame < 40; frame++) life.update(viewer, 8, undefined, frame * 0.05);
  const s = life.stats;
  check(s.herd > 0, 'a herd stands in temperate farmland', `${s.herd} herds, ${s.animals} animals`);
  check(s.animals > s.herd, 'and a herd is more than one animal for one draw call',
    `${n(s.animals / Math.max(1, s.herd), 1)} animals a mesh — as movers they would be ${s.animals} meshes`);

  // The desert, which is the row the camel is for.
  const sahara = at(23.0, 12.0, 8);
  for (let frame = 0; frame < 40; frame++) life.update(sahara, 8, undefined, frame * 0.05);
  check(life.stats.herd > 0, 'and there are camels in the Sahara',
    `${life.stats.herd} herds, ${life.stats.animals} animals, cover 0.03`);

  // **How many frames a cold arrival takes**, which is the number that says
  // whether "no herd appeared" is a bug or a stale reading. Birds need no pool
  // at all — one mesh, vertices rewritten every frame — where a herd has to be
  // served out of `BUILD_BUDGET_MS`, so if the two ever diverged badly the herd
  // would be the one that looked broken.
  {
    const cold = createLife(world, raw, { animals: ANIMALS, rigs });
    const spot = at(-1.29, 36.82, 8);
    let firstBird = 0;
    let firstHerd = 0;
    for (let f = 1; f <= 60; f++) {
      cold.update(spot, 8, undefined, f * 0.05);
      if (firstBird === 0 && cold.stats.birds > 0) firstBird = f;
      if (firstHerd === 0 && cold.stats.herd > 0) firstHerd = f;
    }
    console.log(`\n  cold arrival at Nairobi: first bird on frame ${firstBird}, first herd on frame ${firstHerd}`);
    check(firstHerd > 0 && firstHerd <= 6, 'a herd is standing within a few frames of arriving',
      `frame ${firstHerd} against the birds' ${firstBird}`);
    check(cold.herds.frame === 60, 'the probe counts frames, so a stale reading is visible',
      `${cold.herds.frame} frames`);
  }

  // At altitude a mover is a near-field feature and a herd is more so.
  const high = at(48.40, 9.99, 1400);
  for (let frame = 0; frame < 20; frame++) life.update(high, 1400, undefined, frame * 0.05);
  check(life.stats.herd === 0, 'and nothing at 1,400 units up, where an animal is 8 pixels',
    `${life.stats.herd} herds`);

  // Nothing grazes the sea.
  const sea = at(30.0, -40.0, 8);
  for (let frame = 0; frame < 20; frame++) life.update(sea, 8, undefined, frame * 0.05);
  check(life.stats.herd === 0, 'and nothing grazes the open ocean', `${life.stats.herd} herds`);

  // -------------------------------------------------------------------------
  console.log('\n  and nothing grazes a mountain face');
  // -------------------------------------------------------------------------
  //
  // **The gate has to bite where the ground is steep and nowhere else**, and
  // both halves of that are the check: a slope rule that refuses everywhere is
  // the 40-unit town margin that emptied Europe, and one that refuses nowhere
  // is not installed. `life.herds` counts every gate in the order the scan
  // applies them, so the pair to read is `clearOfTown` — everything that
  // reached the slope — against `clearOfSlope`.

  const gateAt = (lat: number, lon: number): { reached: number; kept: number } => {
    const spot = at(lat, lon, 8);
    const fresh = createLife(world, raw, { animals: ANIMALS, rigs });
    for (let frame = 0; frame < 40; frame++) fresh.update(spot, 8, undefined, frame * 0.05);
    return { reached: fresh.herds.clearOfTown, kept: fresh.herds.clearOfSlope };
  };
  // The herd scan reaches `HERD_REACH`, six to thirteen cells since it came
  // down with the animals (2026-09-24), so a steep place is one whose nearest
  // cells are steep: the fjord is Geiranger, where the first six are.
  const STEEP: [string, number, number][] = [
    ['the Alps', 46.5, 8.0],
    ['Geirangerfjord', 62.1, 7.2],
  ];
  const GENTLE: [string, number, number][] = [
    ['the Sahara', 23.0, 12.0],
    ['the Mongolian steppe', 46.5, 103.0],
    ['Cornwall', 50.3, -5.0],
  ];
  let bit = 0;
  let spared = 0;
  for (const [name, lat, lon] of STEEP) {
    const { reached, kept } = gateAt(lat, lon);
    const lost = reached === 0 ? 0 : (1 - kept / reached) * 100;
    console.log(`  ${name.padEnd(24)} ${kept} of ${reached} cells kept — the slope refused ${n(lost, 0)}%`);
    if (reached > 0 && kept < reached) bit++;
  }
  for (const [name, lat, lon] of GENTLE) {
    const { reached, kept } = gateAt(lat, lon);
    console.log(`  ${name.padEnd(24)} ${kept} of ${reached} cells kept`);
    if (kept === reached) spared++;
  }
  check(bit === STEEP.length, 'the slope gate empties the steep places', `${bit} of ${STEEP.length}`);
  check(spared === GENTLE.length, 'and takes nothing at all where the ground is flat',
    `${spared} of ${GENTLE.length}`);

  // -------------------------------------------------------------------------
  //
  // **And each animal is seated on its own ground inside the herd it belongs
  // to**, which is a property of the *buffer* rather than of the scan: every
  // animal used to sit at `y = 0` in the herd's tangent plane, so the whole
  // slab floated on one side of a hill and sank on the other. The witness is
  // that the seats now differ — and that they differ by an amount the site gate
  // bounds, because a seat computed against the wrong frame is the one failure
  // here that no still frame would show.
  //
  // `MAX_SLOPE` (0.577) over the widest spread a herd takes puts a ceiling on
  // it; 30 units is that with room, and the worst actually seen is printed.

  const seatsAt = (lat: number, lon: number): { herds: number; worst: number; tilted: number } => {
    const spot = at(lat, lon, 8);
    const fresh = createLife(world, raw, { animals: ANIMALS, rigs });
    for (let frame = 0; frame < 60; frame++) fresh.update(spot, 8, undefined, frame * 0.05);
    let herdCount = 0;
    let worst = 0;
    let tilted = 0;
    for (const child of fresh.group.children) {
      if (!child.visible || !child.name.startsWith('herd:')) continue;
      const mesh = child as THREE.Mesh;
      const box = new THREE.Box3().setFromBufferAttribute(
        mesh.geometry.getAttribute('position') as THREE.BufferAttribute,
      );
      herdCount++;
      worst = Math.max(worst, Math.abs(box.min.y));
      // A herd whose lowest animal is a tenth of a unit under the origin is a
      // herd whose animals were not all put on one plane.
      if (box.min.y < -0.1) tilted++;
    }
    return { herds: herdCount, worst, tilted };
  };
  const hilly = seatsAt(-16.5, -68.2);
  const flat = seatsAt(46.5, 103.0);
  console.log(
    `\n  the Altiplano: ${hilly.tilted} of ${hilly.herds} herds are seated below their own origin, ` +
    `deepest ${n(hilly.worst, 2)} units`,
  );
  console.log(
    `  the Mongolian steppe: ${flat.tilted} of ${flat.herds}, deepest ${n(flat.worst, 2)} units`,
  );
  check(hilly.tilted > 0, 'an animal on a hillside is seated on its own ground, not on the herd\'s plane',
    `${hilly.tilted} of ${hilly.herds} herds`);
  check(hilly.worst < 30 && flat.worst < 30, 'and no seat runs away with itself',
    `worst ${n(Math.max(hilly.worst, flat.worst), 2)} units against the 30 the site gate allows`);

  // -------------------------------------------------------------------------
  //
  // **Determinism, with the terrain in it.** A herd's buffer is keyed on its
  // site now and seated on `reliefAt`, so it is a pure function of a
  // coordinate, a seed and nothing else — and `check-life.ts` cannot say so,
  // because it runs `createLife` without an animal registry. Two worlds at one
  // instant, compared on the vertices themselves rather than on a count.

  const hashHerds = (lat: number, lon: number): string => {
    const spot = at(lat, lon, 8);
    const fresh = createLife(world, raw, { animals: ANIMALS, rigs });
    for (let frame = 0; frame < 60; frame++) fresh.update(spot, 8, undefined, frame * 0.05);
    const rows: string[] = [];
    for (const child of fresh.group.children) {
      if (!child.visible || !child.name.startsWith('herd:')) continue;
      const array = (child as THREE.Mesh).geometry.getAttribute('position').array as Float32Array;
      let sum = 0;
      for (let i = 0; i < array.length; i++) sum = (sum * 31 + Math.round(array[i]! * 64)) % 1e12;
      rows.push(`${child.name}@${array.length}:${sum}:${child.position.toArray().map((v) => v.toFixed(3)).join(',')}`);
    }
    rows.sort();
    return rows.join('|');
  };
  let identical = 0;
  const WHERE: [number, number][] = [[48.40, 9.99], [-16.5, -68.2], [46.5, 103.0]];
  for (const [lat, lon] of WHERE) {
    const a = hashHerds(lat, lon);
    if (a.length > 0 && a === hashHerds(lat, lon)) identical++;
  }
  check(identical === WHERE.length, 'two worlds build the same herds, vertex for vertex',
    `${identical} of ${WHERE.length} places identical`);

  // -------------------------------------------------------------------------
  console.log('\n  a near herd, alive — it wanders, gets out of your way, and goes home');
  // -------------------------------------------------------------------------
  //
  // **Where an animal of a near herd goes is the herd's own admission asked
  // again**, and this is the assertion that it is: walked up to, run past,
  // stood beside and left, every animal of every near herd, every frame, is
  // inside its herd's room, on land, off a landmark's pad, on ground no
  // steeper than `MAX_SLOPE` under its own stance, clear of every road by the
  // road's own clearance and outside every built town's disc. Then that it
  // moved at all, that it moved off when approached, that the herd went back
  // to its merged buffer only with every animal at its own spot, and that
  // walking into one is a wall.
  {
    const { decodeRoads } = await import('../src/pack.ts');
    const { indexPlaces, isShown, radiusOf } = await import('../src/places.ts');
    const { roadClearance, roadGeometryFor, roadIndexFor } = await import('../src/roads.ts');
    const { MAX_SLOPE, flattenWeightAt, gradeAt } = await import('../src/terrain.ts');
    const { WALK_SPEED, RUN_SPEED } = await import('../src/avatar.ts');
    const placed = indexPlaces(raw, 0).all;
    const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
    const network = roadsRaw.places === placed.length ? roadsRaw.roads : [];
    const geometry = roadGeometryFor(network, placed);
    const index = roadIndexFor(network, placed);
    const hits: number[] = [];
    const segment = new THREE.Vector3();
    const toward = new THREE.Vector3();
    const foot = new THREE.Vector3();
    const last = new THREE.Vector3();
    const here3 = new THREE.Vector3();
    /** How far inside a road's clearance a spot is, or 0 where it is clear of every road. */
    const intoRoad = (direction: THREE.Vector3): number => {
      let worst = 0;
      toward.copy(direction).multiplyScalar(PLANET_RADIUS);
      for (const hit of index.near(direction, 40, hits)) {
        const path = geometry.path(hit);
        const clear = roadClearance(network[hit]!.cls);
        for (let step = 0; step < path.count; step++) {
          here3.set(path.xyz[step * 3]!, path.xyz[step * 3 + 1]!, path.xyz[step * 3 + 2]!).multiplyScalar(PLANET_RADIUS);
          if (step > 0) {
            segment.subVectors(here3, last);
            const lengthSq = segment.lengthSq();
            const t = lengthSq > 1e-6 ? Math.max(0, Math.min(1, foot.subVectors(toward, last).dot(segment) / lengthSq)) : 0;
            foot.copy(last).addScaledVector(segment, t);
            worst = Math.max(worst, clear - foot.distanceTo(toward));
          }
          last.copy(here3);
        }
      }
      return worst;
    };
    const townDirs = placed.filter((place) => isShown(place)).map((place) => ({
      dir: unitAt(place.lat, place.lon, new THREE.Vector3()), radius: radiusOf(place),
    }));
    const intoTown = (direction: THREE.Vector3): number => {
      let worst = 0;
      for (const town of townDirs) {
        if (town.dir.dot(direction) < 0.999) continue;
        worst = Math.max(worst, town.radius - town.dir.angleTo(direction) * PLANET_RADIUS);
      }
      return worst;
    };

    const slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
    const dir = new THREE.Vector3();
    let frames = 0;
    let samples = 0;
    let outOfRoom = 0;
    let wet = 0;
    let onPad = 0;
    let worstGrade = 0;
    let worstRoad = 0;
    let worstTown = 0;
    let furthest = 0;
    let fled = 0;
    let herdsLived = 0;
    let homeAtRelease = true;
    let walls = 0;
    let wallTries = 0;

    const spots: [string, number, number][] = [
      ['Ulm', 48.40, 9.99],
      ['Cornwall', 50.3, -5.0],
      ['the Mongolian steppe', 46.5, 103.0],
      ['the Serengeti', -2.3, 34.8],
    ];
    for (const [name, lat, lon] of spots) {
      const lively = createLife(world, placed, { animals: ANIMALS, rigs, roads: network });
      const start = at(lat, lon, 2);
      for (let frame = 0; frame < 40; frame++) lively.update(start, 2, undefined, frame * 0.05, 0.05);
      // The nearest herd standing, and a walk up to it from 45 units off.
      let target: THREE.Vector3 | null = null;
      for (const child of lively.group.children) {
        if (!child.visible || !child.name.startsWith('herd:')) continue;
        if (target === null || child.position.distanceTo(start) < target.distanceTo(start)) target = child.position.clone();
      }
      if (target === null) {
        console.log(`  ${name.padEnd(24)} no herd near enough to walk to`);
        continue;
      }
      const up = target.clone().normalize();
      const side = new THREE.Vector3(0, 1, 0).projectOnPlane(up).normalize();
      const walkTo = (offset: number): THREE.Vector3 => {
        const d = up.clone().addScaledVector(side, offset / PLANET_RADIUS).normalize();
        return d.multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(d)) + 2);
      };
      // Out, in at a walk, through at a run, standing among them, and away.
      const legs: [number, number, number][] = [
        [45, 45, 2], [45, 4, WALK_SPEED], [4, 4, 6], [4, -30, RUN_SPEED], [-30, -30, 4], [-30, 160, WALK_SPEED * 2],
      ];
      let offset = 45;
      let clock = 10;
      let lived = false;
      let snappedBefore = lively.stats.snapped;
      const homes = new Map<string, number>();
      for (const [from, to, pace] of legs) {
        offset = from;
        const seconds = to === from ? pace : Math.abs(to - from) / pace;
        const step = 0.05;
        for (let t = 0; t < seconds; t += step) {
          if (to !== from) offset += Math.sign(to - from) * pace * step;
          const viewer = walkTo(offset);
          lively.update(viewer, 2, undefined, (clock += step), step);
          frames++;
          const standing = lively.grazers();
          if (standing.length > 0) lived = true;
          for (const herd of standing) {
            for (const head of herd.heads) {
              samples++;
              if (Math.hypot(head.x, head.z) > herd.room + 1e-3) outOfRoom++;
              dir.copy(herd.centre).addScaledVector(herd.right, head.x / PLANET_RADIUS)
                .addScaledVector(herd.forward, head.z / PLANET_RADIUS).normalize();
              if (world.elevationAt(dir) <= 0) wet++;
              if (flattenWeightAt(dir.x, dir.y, dir.z) > 0) onPad++;
              worstGrade = Math.max(worstGrade, gradeAt(dir, herd.right, herd.forward, head.stance, slope).grade);
              if (samples % 7 === 0) worstRoad = Math.max(worstRoad, intoRoad(dir));
              if (samples % 7 === 0) worstTown = Math.max(worstTown, intoTown(dir));
              furthest = Math.max(furthest, Math.hypot(head.x - head.homeX, head.z - head.homeZ));
              if (head.mode === 'flee') fled++;
              homes.set(herd.key, Math.max(homes.get(herd.key) ?? 0, Math.hypot(head.x - head.homeX, head.z - head.homeZ)));
            }
          }
          // Walk into the nearest animal: the body is pushed back out of it.
          if (to === from && pace === 6 && standing.length > 0 && t < step) {
            for (const herd of standing) {
              for (const head of herd.heads) {
                wallTries++;
                const push = new THREE.Vector3();
                const into = head.world.clone().addScaledVector(herd.right, 0.3);
                if (lively.collide(into, 0.7, 0.7, push) && push.length() > 0) walls++;
              }
            }
          }
        }
      }
      if (lived) herdsLived++;
      if (lively.stats.snapped !== snappedBefore) homeAtRelease = false;
      snappedBefore = lively.stats.snapped;
      console.log(
        `  ${name.padEnd(24)} ${lively.grazers().length === 0 ? 'handed back' : 'still standing'}` +
        `, furthest from its spot ${n(Math.max(0, ...homes.values()), 1)} units, snapped ${lively.stats.snapped}`,
      );
    }
    console.log(
      `  ${frames} frames, ${samples} animal-frames: worst grade ${n(worstGrade, 3)} against ${n(MAX_SLOPE, 3)}, ` +
      `deepest into a road's clearance ${n(worstRoad, 2)}, into a town ${n(worstTown, 2)}`,
    );
    check(herdsLived >= 3, 'a near herd stands up as its animals where you walk to one', `${herdsLived} of ${spots.length} places`);
    check(furthest > 2, 'and its animals move: nothing near is a statue', `furthest ${n(furthest, 1)} units from its spot`);
    check(fled > 0, 'they move off when you come close', `${fled} animal-frames running from you`);
    check(outOfRoom === 0, 'every animal stays inside its herd\'s room', `${outOfRoom} of ${samples}`);
    check(wet === 0 && onPad === 0, 'and on land, off every landmark\'s pad', `${wet} wet, ${onPad} on a pad`);
    check(worstGrade <= MAX_SLOPE, 'and never on ground steeper than MAX_SLOPE', `worst ${n(worstGrade, 3)}`);
    check(worstRoad <= 0, 'and never inside a road\'s clearance', `deepest ${n(worstRoad, 2)} units`);
    check(worstTown <= 0, 'and never inside a built town\'s disc', `deepest ${n(worstTown, 2)} units`);
    check(homeAtRelease, 'walked away from, a herd goes back to its merged frames only with every animal home');
    check(wallTries > 0 && walls === wallTries, 'and an animal is a wall to whoever walks into it', `${walls} of ${wallTries}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\nthe silhouettes — the one thing no table can check');
// ---------------------------------------------------------------------------

/**
 * A side elevation, rasterised in world units and drawn in characters.
 *
 * In world units and not normalised into its own box, which is the traffic
 * sheet's finding: *scaled into its own box a bicycle and a four-wheel-drive
 * came out 0.889 alike.* Here the point is different — this is for a person to
 * look at, not for a number — but the reason is the same. A sheep should print
 * smaller than a camel.
 */
function elevation(group: THREE.Group, axis: 'side' | 'front', cell: number, rows: number): string[] {
  group.updateMatrixWorld(true);
  const tris: [number, number][][] = [];
  const vertex = new THREE.Vector3();
  let maxY = 0;
  let minU = Infinity;
  let maxU = -Infinity;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 3) {
      const tri: [number, number][] = [];
      for (let k = 0; k < 3; k++) {
        vertex.fromBufferAttribute(position, i + k).applyMatrix4(mesh.matrixWorld);
        const u = axis === 'side' ? vertex.z : vertex.x;
        tri.push([u, vertex.y]);
        maxY = Math.max(maxY, vertex.y);
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
      }
      tris.push(tri);
    }
  });
  const cols = Math.ceil((maxU - minU) / cell) + 1;
  const height = Math.min(rows, Math.ceil(maxY / cell) + 1);
  const grid: string[] = [];
  for (let r = 0; r < height; r++) {
    let line = '';
    const y = maxY - (r + 0.5) * (maxY / height);
    for (let c = 0; c < cols; c++) {
      const u = minU + (c + 0.5) * cell;
      line += inside(tris, u, y) ? '#' : ' ';
    }
    grid.push(line.replace(/\s+$/, ''));
  }
  return grid;
}

function inside(tris: [number, number][][], u: number, y: number): boolean {
  for (const tri of tris) {
    const [a, b, c] = tri as [[number, number], [number, number], [number, number]];
    const d1 = (u - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
    const d2 = (u - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1]);
    const d3 = (u - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

const sheetStyle: FaunaStyle = FAUNA_STYLES['atlantic-europe'];
for (const animal of ANIMALS) {
  const shape = animal.shape(variantRng(animal, sheetStyle, 0), sheetStyle);
  for (const pose of [{ kind: 'stand' } as Pose, { kind: 'graze' } as Pose]) {
    const body = buildAnimal(ctx, shape, pose);
    const art = elevation(body.group, 'side', 0.30, 40);
    console.log(`\n  ${animal.name} — ${pose.kind}, side, one character is 0.30 units`);
    for (const line of art) console.log(`    ${line}`);
  }
}

// One front elevation, because the ears and the width only exist there.
{
  const animal = ANIMALS.find((a) => a.id === 'cattle') ?? ANIMALS[0]!;
  const shape = animal.shape(variantRng(animal, sheetStyle, 0), sheetStyle);
  const body = buildAnimal(ctx, shape, { kind: 'stand' });
  console.log(`\n  ${animal.name} — front, one character is 0.18 units`);
  for (const line of elevation(body.group, 'front', 0.18, 40)) console.log(`    ${line}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);

function fingerprint(group: THREE.Group): string {
  group.updateMatrixWorld(true);
  const parts: string[] = [];
  const vertex = new THREE.Vector3();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    parts.push(`#${material?.userData.atlasToon ?? 'none'}`);
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      parts.push(`${vertex.x.toFixed(4)},${vertex.y.toFixed(4)},${vertex.z.toFixed(4)}`);
    }
  });
  return parts.join('|');
}
