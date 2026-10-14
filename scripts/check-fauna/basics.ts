import { check, registryProblems, ANIMALS, STYLES, n, rigs, ctx, fingerprint } from './setup.ts';
import { MISSING_REGIONS, BY_BIOME, RANGE, FAUNA_STYLES } from '../../src/fauna/regions.ts';
import { FAUNA_SCALE, m, rigScale, rigBack, type Animal, VARIANTS, variantRng, extentOf, measure, validateAnimal } from '../../src/fauna/contract.ts';
import { AVATAR_HEIGHT } from '../../src/scenery/contract.ts';
import { PERSON_METRES, STATURE } from '../../src/stature.ts';
import { SCENERY_SCALE } from '../../src/traffic/contract.ts';
import * as THREE from 'three';
import { WITHERS } from '../../src/fauna/parts/horse.ts';

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


// A baked rig is fitted by its back (`rigScale`), not by the declared box,
// which is the code-built body's: fitted end to end the rigs stand 1.2 to 1.5
// times too tall. Every rig's back lands where its choice says, and the
// herds' horse is the ridden one's size.
{
  const rows: string[] = [];
  let off = 0;
  let tall = 0;
  let horseBack = NaN;
  for (const animal of ANIMALS) {
    for (const choice of animal.rigs ?? []) {
      const rig = rigs.get(choice.id);
      if (rig === null) continue;
      const k = rigScale(choice, rig);
      const back = rigBack(rig) * k;
      const size = rig.box.getSize(new THREE.Vector3()).multiplyScalar(k);
      if (Math.abs(back / m(choice.back) - 1) > 0.01) off++;
      if (back > 1.2 * AVATAR_HEIGHT || back < 0.45 * AVATAR_HEIGHT) tall++;
      if (choice.id === 'horse') horseBack = back / AVATAR_HEIGHT;
      rows.push(`${choice.id} ${n(back / AVATAR_HEIGHT, 2)}/${n(size.y / AVATAR_HEIGHT, 2)}`);
    }
  }
  console.log(`  back/top, in bodies: ${rows.join(', ')}`);
  check(off === 0, 'every rig stands with its back at its declared height', `${off} off by more than 1%`);
  check(tall === 0, 'and every back is between a person\'s knee and a head over him', `${tall} outside 0.45-1.2 bodies`);
  check(Math.abs(horseBack - WITHERS) < 0.01, 'the herds\' horse is the ridden horse\'s size', `${n(horseBack, 3)} against WITHERS ${WITHERS}`);
}

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

export const rows: Row[] = [];
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
