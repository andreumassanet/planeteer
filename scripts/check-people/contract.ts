import { type ScenicPart, validatePart, measure, KINDS } from '../../src/scenery/contract.ts';
import { REGION_IDS, REGIONS } from '../../src/scenery/regions.ts';
import { SAMPLES, ctx, fail } from './setup.ts';
import { rngFrom } from '../../src/scenery/random.ts';
import { villager } from '../../src/scenery/parts/villager.ts';
import { child } from '../../src/scenery/parts/child.ts';

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
