import { type Decoration, DECORATION_VARIANTS, decorationRng, BUDGETS } from '../../src/system/contract.ts';
import { readdirSync } from 'node:fs';
import { PART_DIR, bodies } from './scale.ts';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { fail } from './setup.ts';
import { ctx, fingerprint, dispose } from './species.ts';
import { measure } from '../../src/monuments/contract.ts';

// ===========================================================================
// 5. The decoration
// ===========================================================================

console.log('\n\n=== the decoration ===\n');

const decorations: Decoration[] = [];
for (const file of readdirSync(PART_DIR).filter((n) => n.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(PART_DIR, file)).href)) as Record<string, unknown>;
  let found = 0;
  for (const value of Object.values(module)) {
    if (typeof value === 'object' && value !== null && typeof (value as Decoration).build === 'function') {
      const part = value as Decoration;
      if (file !== `${part.id}.ts`) fail(`${file} holds '${part.id}' — the file should be ${part.id}.ts`);
      decorations.push(part);
      found++;
    }
  }
  if (found === 0) fail(`${file} exports no Decoration`);
}

console.log('    part          builds   tris (worst)   meshes   colours   height   radius / declared');
for (const part of decorations) {
  let worstT = 0;
  let worstM = 0;
  let worstC = 0;
  let worstH = 0;
  let worstR = 0;
  let builds = 0;
  let dip = 0;
  for (const body of bodies) {
    if (part.bodies.length > 0 && !part.bodies.includes(body.id)) continue;
    // A decoration stands on ground, and a body with no ground model will never
    // place one: building it there measures seeds nothing will ever draw (the
    // Sun and the giants have no ground).
    if (body.ground === null) continue;
    for (let variant = 0; variant < DECORATION_VARIANTS; variant++) {
      let group;
      try {
        group = part.build(ctx, decorationRng(part, body.id, variant), body.look);
      } catch (error) {
        fail(`${part.id} threw on ${body.id}/${variant}: ${String(error)}`);
        continue;
      }
      builds++;
      const m = measure(group);
      worstT = Math.max(worstT, m.triangles);
      worstM = Math.max(worstM, m.meshes);
      worstC = Math.max(worstC, m.colors.length);
      worstH = Math.max(worstH, m.height);
      worstR = Math.max(worstR, m.radius);
      dip = Math.min(dip, m.base);
      const once = fingerprint(group);
      const twice = fingerprint(part.build(ctx, decorationRng(part, body.id, variant), body.look));
      if (once !== twice) fail(`${part.id} (${body.id}/${variant}) is not deterministic`);
      dispose(group);
    }
  }
  console.log(
    `    ${part.id.padEnd(13)} ${String(builds).padStart(5)}      ${String(worstT).padStart(6)}      ${String(worstM).padStart(3)}       ${worstC}` +
      `     ${worstH.toFixed(2).padStart(6)}   ${worstR.toFixed(2)} / ${part.footprint.toFixed(2)}`,
  );
  if (worstT > BUDGETS.decoration.triangles) fail(`${part.id} is ${worstT} triangles against a budget of ${BUDGETS.decoration.triangles}`);
  if (worstM > BUDGETS.decoration.meshes) fail(`${part.id} is ${worstM} meshes against a budget of ${BUDGETS.decoration.meshes}`);
  if (worstC > BUDGETS.decoration.colors) fail(`${part.id} uses ${worstC} colours against a budget of ${BUDGETS.decoration.colors}`);
  // A declared footprint that is smaller than the built one is a placer
  // reserving less ground than the thing needs, which is how two of them end up
  // inside each other. Larger by more than a fifth is ground nobody uses.
  if (worstR > part.footprint * 1.02) fail(`${part.id} builds out to ${worstR.toFixed(2)} against a declared footprint of ${part.footprint}`);
  if (worstR < part.footprint * 0.7) fail(`${part.id} declares ${part.footprint} and never exceeds ${worstR.toFixed(2)} — it is reserving ground nothing uses`);
  if (dip < -0.01) fail(`${part.id} sinks ${dip.toFixed(3)} into the ground`);
}

// Every part must be reachable from some biome, and every biome's named parts
// must exist. It had to ask *both* tables the day `biome.ts` became a second placer.
{
  const claimed = new Set<string>();
  const known = new Set(decorations.map((p) => p.id));
  for (const body of bodies) {
    if (body.ground === null) continue;
    for (const biome of Object.values(body.ground.biomes)) {
      for (const id of biome.parts) {
        claimed.add(id);
        if (!known.has(id)) fail(`${body.id}'s '${biome.id}' names decoration '${id}' and no such part exists`);
      }
    }
  }
  for (const part of decorations) {
    if (!claimed.has(part.id)) fail(`nothing will ever build '${part.id}' — no biome on any world names it`);
  }
}
