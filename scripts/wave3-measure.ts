/**
 * Throwaway: measure and validate one or more monument files headlessly.
 *   node scripts/wave3-measure.ts src/monuments/stari-most.ts ...
 * Deleted before the night is out; the real review tool is /contact-sheet.html.
 */
import { resolve } from 'node:path';
import { createContext, measure, validate, findFlaws, findUnsupported, TIERS, paletteName } from '../src/monuments/contract.ts';
import type { Monument } from '../src/monuments/contract.ts';

const ctx = createContext();
for (const arg of process.argv.slice(2)) {
  const mod = await import(resolve(process.cwd(), arg));
  const found = Object.values(mod).filter(
    (v: any) => v && typeof v === 'object' && typeof v.build === 'function',
  ) as Monument[];
  if (found.length === 0) { console.log(`${arg}: NO MONUMENT EXPORTED`); continue; }
  for (const m of found) {
    const group = m.build(ctx);
    const s = measure(group);
    const problems = validate(m, group);
    const tier = TIERS[m.tier];
    console.log(`\n=== ${m.id} (${m.iso}) ${m.tier} ===`);
    console.log(
      `  tris ${s.triangles}/${tier.triangles}  meshes ${s.meshes}/${tier.meshes}  ` +
      `height ${s.height.toFixed(1)}/${tier.height}  radius ${s.radius.toFixed(1)}/${m.footprint}  ` +
      `base ${s.base.toFixed(2)}  offset ${s.offset.toFixed(2)}  aspect ${((s.radius*2)/s.height).toFixed(2)}/4`,
    );
    console.log('  colours: ' + s.colors.map(paletteName).join(', '));
    if (problems.length) console.log('  PROBLEMS:\n' + problems.map((p) => '    - ' + p).join('\n'));
    else console.log('  validate: clean');
    const flaws = findFlaws(group);
    if (flaws.length) console.log('  FLAWS:\n' + flaws.map((f) => `    - ${f.kind} ${f.triangles}t ${f.what} — ${f.detail}`).join('\n'));
    if (process.env.UNSUPPORTED) {
      const un = findUnsupported(group);
      if (un.length) console.log('  unsupported (author judgement):\n' + un.map((f) => `    - ${f.what} — ${f.detail}`).join('\n'));
    }
  }
}
