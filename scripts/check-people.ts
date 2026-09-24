/**
 * Headless measurement of the crowd kit.
 *
 * Cannot go through `src/scenery/index.ts` because that registry is built on
 * `import.meta.glob`, which does not exist in Node, so the two parts are
 * imported by hand.
 */
import { Box3, Vector3 } from 'three';
import { BODY_SCALE } from '../src/stature.ts';
import { createSceneryContext, KINDS, measure, validatePart } from '../src/scenery/contract.ts';
import type { ScenicPart } from '../src/scenery/contract.ts';
import { REGIONS, REGION_IDS } from '../src/scenery/regions.ts';
import { buildPerson, BODY, CHILD_BODY, POSES } from '../src/scenery/people.ts';
import type { Look, Pose } from '../src/scenery/people.ts';
import { lookFor, DRESS_IDS, SKIN_TONES } from '../src/scenery/dress.ts';
import { rngFrom } from '../src/scenery/random.ts';
import { villager } from '../src/scenery/parts/villager.ts';
import { child } from '../src/scenery/parts/child.ts';

const ctx = createSceneryContext();
const SAMPLES = Number(process.argv[2] ?? 150);

/**
 * What fails the run. It printed its findings and exited 0 whatever they were,
 * so `pnpm people` could not fail: a contract violation or a rebuild that
 * disagreed with itself was a line in the scroll and nothing else. The other
 * checks count and exit non-zero, and so does this one now.
 */
let failures = 0;
const fail = (what: string): void => {
  failures++;
  console.log(`  FAIL ${what}`);
};

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

interface Row {
  triangles: number;
  meshes: number;
  colors: number;
  height: number;
  radius: number;
  base: number;
}

function sweep(part: ScenicPart): { rows: Row[]; problems: Map<string, number> } {
  const rows: Row[] = [];
  const problems = new Map<string, number>();
  for (const id of REGION_IDS) {
    const style = REGIONS[id];
    for (let i = 0; i < SAMPLES; i++) {
      const group = part.build(ctx, rngFrom(part.id, style.id, i), style);
      for (const problem of validatePart(part, group)) {
        // Strip the numbers so a family of failures collapses to one line.
        const key = problem.replace(/[0-9.]+/g, '#');
        problems.set(key, (problems.get(key) ?? 0) + 1);
      }
      const m = measure(group);
      rows.push({
        triangles: m.triangles,
        meshes: m.meshes,
        colors: m.colors.length,
        height: m.height,
        radius: m.radius,
        base: m.base,
      });
      group.traverse((o) => {
        const mesh = o as { isMesh?: boolean; geometry?: { dispose(): void } };
        if (mesh.isMesh) mesh.geometry!.dispose();
      });
    }
  }
  return { rows, problems };
}

const stat = (values: number[]): string => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `min ${sorted[0]!.toFixed(2)}  median ${at(0.5).toFixed(2)}  mean ${mean.toFixed(2)}  p99 ${at(0.99).toFixed(2)}  max ${sorted[sorted.length - 1]!.toFixed(2)}`;
};

console.log(`=== contract, ${SAMPLES} seeds x ${REGION_IDS.length} regions ===`);
for (const part of [villager, child]) {
  const { rows, problems } = sweep(part);
  const kind = KINDS[part.kind]!;
  console.log(`\n${part.id}  (${rows.length} builds, kind '${part.kind}')`);
  console.log(`  triangles  ${stat(rows.map((r) => r.triangles))}   cap ${kind.triangles}`);
  console.log(`  meshes     ${stat(rows.map((r) => r.meshes))}   cap ${kind.meshes}`);
  console.log(`  colours    ${stat(rows.map((r) => r.colors))}   cap ${kind.colors}`);
  console.log(`  height     ${stat(rows.map((r) => r.height))}   cap ${kind.height} floor ${kind.minHeight}`);
  console.log(`  radius     ${stat(rows.map((r) => r.radius))}   declared ${part.footprint}`);
  console.log(`  base       ${stat(rows.map((r) => r.base))}   must be |base| <= 0.06`);
  if (problems.size === 0) console.log('  no contract violations');
  else for (const [key, count] of problems) fail(`${count} x ${key}`);
}

// ---------------------------------------------------------------------------
// Silhouette variety
// ---------------------------------------------------------------------------

/**
 * Rasterise the front view of a group into a bitmap, at the pixel size the
 * figure would actually occupy at `distance` units.
 *
 * The camera model is the one the whole project uses: `937 * size / distance`
 * pixels on a 900 px viewport with a 55 degree lens.
 */
function silhouette(group: import('three').Group, distance: number): Uint8Array {
  group.updateMatrixWorld(true);
  const pxPerUnit = 937 / distance;
  const halfWidth = 3.0 * BODY_SCALE;
  const top = 9.0 * BODY_SCALE;
  const w = Math.max(4, Math.round(halfWidth * 2 * pxPerUnit));
  const h = Math.max(4, Math.round(top * pxPerUnit));
  const bits = new Uint8Array(w * h);
  const v = new Vector3();

  group.traverse((object) => {
    const mesh = object as unknown as {
      isMesh?: boolean;
      geometry: import('three').BufferGeometry;
      matrixWorld: import('three').Matrix4;
    };
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const px: number[] = [];
      const py: number[] = [];
      for (let c = 0; c < 3; c++) {
        const i = index ? index.getX(t + c) : t + c;
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        px.push((v.x + halfWidth) * pxPerUnit);
        py.push((top - v.y) * pxPerUnit);
      }
      const minX = Math.max(0, Math.floor(Math.min(px[0]!, px[1]!, px[2]!)));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(px[0]!, px[1]!, px[2]!)));
      const minY = Math.max(0, Math.floor(Math.min(py[0]!, py[1]!, py[2]!)));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(py[0]!, py[1]!, py[2]!)));
      const d = (px[1]! - px[0]!) * (py[2]! - py[0]!) - (px[2]! - px[0]!) * (py[1]! - py[0]!);
      if (Math.abs(d) < 1e-9) continue;
      for (let yy = minY; yy <= maxY; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const sx = xx + 0.5;
          const sy = yy + 0.5;
          const a = ((px[1]! - sx) * (py[2]! - sy) - (px[2]! - sx) * (py[1]! - sy)) / d;
          const b = ((px[2]! - sx) * (py[0]! - sy) - (px[0]! - sx) * (py[2]! - sy)) / d;
          const c = 1 - a - b;
          if (a >= -0.002 && b >= -0.002 && c >= -0.002) bits[yy * w + xx] = 1;
        }
      }
    }
  });
  return bits;
}

const hashOf = (bits: Uint8Array): string => {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 0) continue;
    h1 = Math.imul(h1 ^ i, 0x01000193);
    h2 = Math.imul(h2 ^ (i * 2654435761), 0x85ebca6b);
  }
  return `${h1 >>> 0}:${h2 >>> 0}`;
};

const differs = (a: Uint8Array, b: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

interface Variety {
  samples: number;
  exact: number;
  visible: number;
  ink: number;
}

function varietyAt(looks: Look[], distance: number, threshold: number): Variety {
  const seen = new Set<string>();
  const reps: Uint8Array[] = [];
  let ink = 0;
  for (const look of looks) {
    const group = buildPerson(ctx, look);
    const bits = silhouette(group, distance);
    seen.add(hashOf(bits));
    let filled = 0;
    for (let i = 0; i < bits.length; i++) filled += bits[i]!;
    ink += filled;
    let novel = true;
    for (const rep of reps) {
      if (differs(rep, bits) <= threshold) {
        novel = false;
        break;
      }
    }
    if (novel) reps.push(bits);
    group.traverse((o) => {
      const mesh = o as { isMesh?: boolean; geometry?: { dispose(): void } };
      if (mesh.isMesh) mesh.geometry!.dispose();
    });
  }
  return {
    samples: looks.length,
    exact: seen.size,
    visible: reps.length,
    ink: Math.round(ink / looks.length),
  };
}

console.log('\n=== silhouette variety ===');
console.log(
  'Front view, rasterised at the size the figure really is at that distance\n' +
    '(937 * height / distance px), then counted as distinct when two bitmaps\n' +
    'differ by more than a share of the average inked area. Exact is the count\n' +
    'of bitmaps that differ at all, and it is nearly useless: height is\n' +
    'continuous, so almost every pair differs by one pixel somewhere.',
);
const looksFor = (region: string, n: number, age?: 'child'): Look[] => {
  const out: Look[] = [];
  for (let i = 0; i < n; i++) {
    out.push(lookFor(rngFrom('crowd', region, i), region, age ? { age } : {}));
  }
  return out;
};

const SHARES = [0.02, 0.05, 0.1];

function report(label: string, looks: Look[]): void {
  for (const [distance, tall] of [
    [Math.round(40 * BODY_SCALE), '159 px tall'],
    [Math.round(120 * BODY_SCALE), '53 px'],
    [Math.round(300 * BODY_SCALE), '21 px'],
  ] as const) {
    const ink = varietyAt(looks.slice(0, 40), distance, 0).ink;
    const counts = SHARES.map((share) => {
      const v = varietyAt(looks, distance, Math.max(1, Math.round(ink * share)));
      return `${String(v.visible).padStart(4)} at ${(share * 100).toFixed(0)}%`;
    });
    const exact = varietyAt(looks, distance, 0).exact;
    console.log(
      `  ${label.padEnd(16)} ${String(distance).padStart(3)} u (${tall.padEnd(11)}) ` +
        `${String(looks.length).padStart(4)} seeds -> ${String(exact).padStart(4)} exact | ${counts.join(' | ')}`,
    );
  }
}

for (const region of ['atlantic-europe', 'sub-saharan', 'east-asia'] as const) {
  report(region, looksFor(region, 400));
}

// Mixed across every region, which is what a continent looks like.
const worldwide: Look[] = [];
for (const region of DRESS_IDS) worldwide.push(...looksFor(region, 60));
report('all regions', worldwide);
report('children', looksFor('atlantic-europe', 200, 'child'));

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

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
