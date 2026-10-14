import { DRESS_IDS, lookFor, SKIN_TONES } from '../../src/scenery/dress.ts';
import { rngFrom } from '../../src/scenery/random.ts';
import { fail, ctx } from './setup.ts';
import { buildPerson, BODY, type Pose, POSES, CHILD_BODY } from '../../src/scenery/people.ts';
import { Box3 } from 'three';
import { measure } from '../../src/scenery/contract.ts';
import { looksFor } from './silhouettes.ts';

// ---------------------------------------------------------------------------
// Appearance is independent of region
// ---------------------------------------------------------------------------

console.log('\n=== appearance is independent of region ===');
let identical = 0;
let total = 0;
const toneCounts = new Map<string, number[]>();
for (let i = 0; i < 600; i++) {
  const bodies = new Set<string>();
  for (const region of DRESS_IDS) {
    const look = lookFor(rngFrom('who', i), region);
    bodies.add(
      [look.height.toFixed(9), look.girth.toFixed(9), look.age, look.skin, look.hairColor, look.hair, look.beard].join('|'),
    );
    const counts = toneCounts.get(region) ?? new Array(SKIN_TONES.length).fill(0);
    counts[SKIN_TONES.indexOf(look.skin)]!++;
    toneCounts.set(region, counts);
  }
  total++;
  if (bodies.size === 1) identical++;
}
console.log(`${identical} of ${total} seeds produce the identical person in all ${DRESS_IDS.length} regions`);
if (identical !== total) fail(`${total - identical} seeds change who they are with the region`);
const first = toneCounts.get(DRESS_IDS[0]!)!;
const sameHistogram = DRESS_IDS.every((id) => toneCounts.get(id)!.every((n, k) => n === first[k]));
console.log(`skin-tone histogram identical in every region: ${sameHistogram}  (${first.join(', ')})`);
if (!sameHistogram) fail('the skin-tone histogram depends on the region');

// And that the clothes did move.
let clothesMoved = 0;
for (let i = 0; i < 200; i++) {
  const worn = new Set<string>();
  for (const region of DRESS_IDS) {
    const look = lookFor(rngFrom('who', i), region);
    worn.add([look.garment, look.headwear, look.top, look.bottom, look.carry].join('|'));
  }
  if (worn.size > 1) clothesMoved++;
}
console.log(`${clothesMoved} of 200 seeds are dressed differently somewhere on the planet`);
if (clothesMoved === 0) fail('nobody is dressed by where they live');

// ---------------------------------------------------------------------------
// The seated pose, which is the vehicle contract
// ---------------------------------------------------------------------------

console.log('\n=== seated pose, origin at the seat surface ===');
const seated = buildPerson(ctx, {
  ...lookFor(rngFrom('seat', 1), 'atlantic-europe'),
  height: BODY.height,
  girth: 1,
  age: 'adult',
  garment: 'shirt',
  headwear: 'none',
  carry: 'none',
  stoop: 0,
  sway: 0,
  pose: 'sit' as Pose,
});
const seatBox = new Box3().setFromObject(seated, true);
console.log(`  sole  y = ${seatBox.min.y.toFixed(2)}   crown y = ${seatBox.max.y.toFixed(2)}`);
console.log(`  front z = ${seatBox.max.z.toFixed(2)}   back  z = ${seatBox.min.z.toFixed(2)}`);
console.log(`  width   = ${(seatBox.max.x - seatBox.min.x).toFixed(2)} over everything, ${(BODY.shoulderHalf * 2).toFixed(2)} at the shoulders alone`);

// The envelope over every body the draw can make, which is what a cab has to
// clear rather than the one canonical figure above.
for (const loaded of [false, true]) {
  let wide = 0;
  let high = 0;
  let deep = 0;
  let low = 0;
  for (let i = 0; i < 400; i++) {
    const drawn = lookFor(rngFrom('seat', i), DRESS_IDS[i % DRESS_IDS.length]!);
    const look = { ...drawn, pose: 'sit' as Pose, carry: loaded ? drawn.carry : ('none' as const) };
    const b = new Box3().setFromObject(buildPerson(ctx, look), true);
    wide = Math.max(wide, b.max.x - b.min.x);
    high = Math.max(high, b.max.y);
    deep = Math.max(deep, b.max.z);
    low = Math.min(low, b.min.y);
  }
  console.log(
    `  400 seated bodies, ${loaded ? 'carrying what they were given' : 'empty-handed'}: ` +
      `width <= ${wide.toFixed(2)}, crown <= ${high.toFixed(2)}, reach <= ${deep.toFixed(2)}, lowest ${low.toFixed(2)}`,
  );
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

console.log('\n=== determinism ===');
let mismatches = 0;
for (let i = 0; i < 300; i++) {
  const region = DRESS_IDS[i % DRESS_IDS.length]!;
  const a = measure(buildPerson(ctx, lookFor(rngFrom('det', i), region)));
  const b = measure(buildPerson(ctx, lookFor(rngFrom('det', i), region)));
  if (a.triangles !== b.triangles || Math.abs(a.height - b.height) > 1e-12 || Math.abs(a.radius - b.radius) > 1e-12) {
    mismatches++;
  }
}
console.log(`${mismatches} of 300 rebuilds disagreed with themselves`);
if (mismatches > 0) fail(`${mismatches} rebuilds are not deterministic`);

// ---------------------------------------------------------------------------
// Build cost
// ---------------------------------------------------------------------------

const warm = looksFor('atlantic-europe', 200);
for (const look of warm.slice(0, 20)) buildPerson(ctx, look);
const t0 = performance.now();
for (const look of warm) buildPerson(ctx, look);
const t1 = performance.now();
console.log(
  `\nbuild cost: ${((t1 - t0) / warm.length).toFixed(3)} ms a person, ` +
    `so a 24-body pool is ${(((t1 - t0) / warm.length) * 24).toFixed(1)} ms`,
);

console.log(`\nposes: ${Object.keys(POSES).length}   adult 4 heads, child ${(CHILD_BODY.height / CHILD_BODY.head).toFixed(2)} heads`);
