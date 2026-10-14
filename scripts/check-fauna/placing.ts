import './gait.ts';
import { type Pose, buildAnimal, hooves } from '../../src/fauna/body.ts';
import { ANIMALS, ctx, n, check } from './setup.ts';
import { FAUNA_STYLES, BY_BIOME, type RegionId, nativeHere, RANGE } from '../../src/fauna/regions.ts';
import { variantRng, m } from '../../src/fauna/contract.ts';
import * as THREE from 'three';
import { BODY_SCALE } from '../../src/stature.ts';
import { rows } from './basics.ts';

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
