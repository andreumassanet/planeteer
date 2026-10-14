import './worlds.ts';
import { createSceneryContext } from '../../src/scenery/contract.ts';
import { bodies, speciesById } from './scale.ts';
import { ALIEN_VARIANTS, BUDGETS } from '../../src/system/contract.ts';
import { alienFor, buildAlien } from '../../src/system/alien.ts';
import { rngFrom } from '../../src/scenery/random.ts';
import { measure } from '../../src/monuments/contract.ts';
import { fail } from './setup.ts';

// ===========================================================================
// 4. The species
// ===========================================================================

console.log('\n\n=== the species ===\n');

export const ctx = createSceneryContext();

/** Every vertex of a built group, in group space, and what it is drawn in. */
export function fingerprint(group: import('three').Group): string {
  group.updateMatrixWorld(true);
  const parts: string[] = [];
  group.traverse((object) => {
    const mesh = object as unknown as {
      isMesh?: boolean;
      material?: { userData: Record<string, unknown> };
      geometry?: import('three').BufferGeometry;
      matrixWorld: { elements: number[] };
    };
    if (mesh.isMesh !== true || mesh.geometry === undefined) return;
    parts.push(`#${String(mesh.material?.userData.atlasToon ?? 'none')}`);
    parts.push(mesh.matrixWorld.elements.map((n) => n.toFixed(4)).join(','));
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      parts.push(`${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`);
    }
  });
  return parts.join('|');
}

/** The lowest world-space vertex of a built group. */
function lowest(group: import('three').Group): number {
  group.updateMatrixWorld(true);
  let low = 0;
  group.traverse((object) => {
    const mesh = object as unknown as { isMesh?: boolean; geometry?: import('three').BufferGeometry; matrixWorld: { elements: number[] } };
    if (mesh.isMesh !== true || mesh.geometry === undefined) return;
    const e = mesh.matrixWorld.elements;
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = e[1]! * p.getX(i) + e[5]! * p.getY(i) + e[9]! * p.getZ(i) + e[13]!;
      if (y < low) low = y;
    }
  });
  return low;
}

export const dispose = (group: import('three').Group): void => {
  group.traverse((o) => {
    const mesh = o as unknown as { isMesh?: boolean; geometry?: { dispose(): void } };
    if (mesh.isMesh === true) mesh.geometry?.dispose();
  });
};

interface Row {
  triangles: number;
  meshes: number;
  colors: number;
  height: number;
  radius: number;
}

console.log('  every species, built in every country of its own world, over every pose:\n');
console.log('    species     builds   tris (worst/median)   meshes   colours   height    radius   worst dip');

/**
 * How many distinct people the variety sweep draws.
 *
 * Not `ALIEN_VARIANTS`: the budget sweep walks 24 variants across every country
 * and pose, which suits a contract check but not a variety check, because the
 * country reaches only the wardrobe and the pose is forced, so those 1,440
 * builds hold 24 distinct bodies. `check-people.ts` draws 840 separate seeds
 * and this draws 240.
 */
const VARIETY_SEEDS = 240;
for (const body of bodies) {
  const species = body.species === null ? undefined : speciesById.get(body.species);
  if (species === undefined) continue;
  const rows: Row[] = [];
  let dip = 0;
  let builds = 0;
  const nations = body.nations.length > 0 ? body.nations : [undefined];
  for (let variant = 0; variant < ALIEN_VARIANTS; variant++) {
    for (const nation of nations) {
      for (const pose of ['stand', 'walk', 'work', 'watch'] as const) {
        const alien = alienFor(rngFrom('system', body.id, species.id, variant), species, {
          nation,
          warmth: (variant % 10) / 10,
          pose,
        });
        const group = buildAlien(ctx, species.morph, alien);
        builds++;
        const m = measure(group);
        rows.push({ triangles: m.triangles, meshes: m.meshes, colors: m.colors.length, height: m.height, radius: m.radius });
        dip = Math.min(dip, lowest(group));
        dispose(group);
      }
    }
  }
  const tris = rows.map((r) => r.triangles).sort((a, b) => a - b);
  const worst = {
    triangles: tris[tris.length - 1]!,
    median: tris[Math.floor(tris.length / 2)]!,
    meshes: Math.max(...rows.map((r) => r.meshes)),
    colors: Math.max(...rows.map((r) => r.colors)),
    height: Math.max(...rows.map((r) => r.height)),
    radius: Math.max(...rows.map((r) => r.radius)),
  };
  console.log(
    `    ${species.id.padEnd(11)} ${String(builds).padStart(5)}      ${String(worst.triangles).padStart(4)} / ${String(worst.median).padEnd(4)}` +
      `        ${String(worst.meshes).padStart(3)}       ${worst.colors}      ${worst.height.toFixed(2).padStart(6)}   ${worst.radius.toFixed(2).padStart(6)}    ${dip.toFixed(4)}`,
  );
  if (worst.triangles > BUDGETS.alien.triangles) fail(`${species.id} is ${worst.triangles} triangles against a budget of ${BUDGETS.alien.triangles}`);
  if (worst.meshes > BUDGETS.alien.meshes) fail(`${species.id} is ${worst.meshes} meshes against a budget of ${BUDGETS.alien.meshes}`);
  if (worst.colors > BUDGETS.alien.colors) fail(`${species.id} uses ${worst.colors} colours against a budget of ${BUDGETS.alien.colors}`);
  // The crowd's own number: a foot a hundredth of a unit under the floor is a
  // figure standing on nothing, and it is invisible in every thumbnail.
  if (dip < -0.01) fail(`${species.id} puts a vertex ${dip.toFixed(4)} under the floor`);
}

// --- determinism ----------------------------------------------------------

{
  let checked = 0;
  for (const body of bodies) {
    const species = body.species === null ? undefined : speciesById.get(body.species);
    if (species === undefined) continue;
    for (let variant = 0; variant < 6; variant++) {
      const alien = alienFor(rngFrom('system', body.id, species.id, variant), species, { nation: body.nations[0] });
      const once = fingerprint(buildAlien(ctx, species.morph, alien));
      const twice = fingerprint(buildAlien(ctx, species.morph, alien));
      checked++;
      if (once !== twice) fail(`${species.id}/${variant} is not deterministic — same Look, two different bodies`);
    }
  }
  console.log(`\n  determinism: ${checked} bodies built twice and fingerprinted vertex by vertex`);
}

// --- who somebody is, against what they wear ------------------------------

/**
 * The measurement `dress.ts` makes, on an invented species.
 *
 * *Clothing is regional; appearance is not.* On Earth that measured 600 of 600
 * identical people across fourteen regions, dressed 200 of 200 differently. The
 * reason it matters more here is that an alien is the one place where "everyone
 * from Hellas looks like this" is the easiest thing to write and the hardest to
 * take back — a planet whose population is a monoculture is the uniform band
 * `biome.ts` exists to prevent, arriving through a different door.
 */
console.log('\n  the same seed in every country of its own world:');
for (const body of bodies) {
  const species = body.species === null ? undefined : speciesById.get(body.species);
  if (species === undefined || body.nations.length < 2) continue;
  let sameBody = 0;
  let differentDress = 0;
  const seeds = 200;
  for (let seed = 0; seed < seeds; seed++) {
    const drawn = body.nations.map((nation) => alienFor(rngFrom('who', seed), species, { nation }));
    const first = drawn[0]!;
    if (drawn.every((a) => a.height === first.height && a.girth === first.girth && a.hide === first.hide && a.sway === first.sway)) {
      sameBody++;
    }
    if (drawn.some((a) => a.wear !== first.wear || a.accent !== first.accent || a.carry !== first.carry)) {
      differentDress++;
    }
  }
  console.log(`    ${species.id.padEnd(11)} ${sameBody}/${seeds} are the identical person · ${differentDress}/${seeds} are dressed differently somewhere`);
  if (sameBody !== seeds) fail(`${species.id}: the country reaches the body — ${seeds - sameBody} of ${seeds} seeds change who somebody is`);
  if (differentDress < seeds * 0.9) fail(`${species.id}: the country barely reaches the wardrobe — only ${differentDress} of ${seeds}`);
}

// --- how many of them are actually different ------------------------------

/**
 * Rasterise the front view at the pixel size the figure really is, and count
 * how many are distinguishable.
 *
 * `check-people.ts`'s measurement, unchanged, including the part of it that is
 * a warning: `exact` is nearly useless and is printed to say so. Height is
 * a continuous draw, so of 840 human figures 840 differed by a pixel somewhere
 * and the number meant nothing. What means something is a threshold on the
 * inked area, and the honest summary on Earth was that at 40 units about 780 of
 * 840 are visibly different people and at 300 units about 330 still are.
 */
function silhouette(group: import('three').Group, distance: number, height: number): Uint8Array {
  group.updateMatrixWorld(true);
  const pxPerUnit = 937 / distance;
  const halfWidth = height * 0.45;
  const top = height * 1.35;
  const w = Math.max(4, Math.round(halfWidth * 2 * pxPerUnit));
  const h = Math.max(4, Math.round(top * pxPerUnit));
  const bits = new Uint8Array(w * h);
  group.traverse((object) => {
    const mesh = object as unknown as { isMesh?: boolean; geometry?: import('three').BufferGeometry; matrixWorld: { elements: number[] } };
    if (mesh.isMesh !== true || mesh.geometry === undefined) return;
    const e = mesh.matrixWorld.elements;
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const px: number[] = [];
      const py: number[] = [];
      for (let c = 0; c < 3; c++) {
        const i = index ? index.getX(t + c) : t + c;
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const wx = e[0]! * vx + e[4]! * vy + e[8]! * vz + e[12]!;
        const wy = e[1]! * vx + e[5]! * vy + e[9]! * vz + e[13]!;
        px.push((wx + halfWidth) * pxPerUnit);
        py.push((top - wy) * pxPerUnit);
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
          if (a >= -0.002 && b >= -0.002 && 1 - a - b >= -0.002) bits[yy * w + xx] = 1;
        }
      }
    }
  });
  return bits;
}

const hashOf = (bits: Uint8Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bits.length; i++) if (bits[i] !== 0) h = Math.imul(h ^ i, 0x01000193);
  return String(h >>> 0);
};
const differs = (a: Uint8Array, b: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

console.log('\n  silhouette variety — the front view at the size the figure really is:');
console.log('    (`exact` is printed to say it is worthless: height is a continuous draw)\n');
console.log('    species      distance    px    exact    >2%    >5%   >10%');
for (const body of bodies) {
  const species = body.species === null ? undefined : speciesById.get(body.species);
  if (species === undefined) continue;
  const nations = body.nations.length > 0 ? body.nations : [undefined];
  const looks = Array.from({ length: VARIETY_SEEDS }, (_, seed) =>
    alienFor(rngFrom('variety', body.id, seed), species, {
      nation: nations[seed % nations.length],
      warmth: ((seed * 7) % 11) / 10,
    }),
  );
  for (const distance of [40, 120, 300]) {
    const bits: Uint8Array[] = [];
    const seen = new Set<string>();
    let ink = 0;
    for (const look of looks) {
      const group = buildAlien(ctx, species.morph, look);
      const raster = silhouette(group, distance, species.morph.height);
      dispose(group);
      seen.add(hashOf(raster));
      let filled = 0;
      for (let i = 0; i < raster.length; i++) filled += raster[i]!;
      ink += filled;
      bits.push(raster);
    }
    const mean = ink / bits.length;
    const counts = [0.02, 0.05, 0.1].map((share) => {
      const reps: Uint8Array[] = [];
      for (const raster of bits) {
        if (reps.every((rep) => differs(rep, raster) > mean * share)) reps.push(raster);
      }
      return reps.length;
    });
    console.log(
      `    ${species.id.padEnd(12)} ${String(distance).padStart(5)} u  ${((937 * species.morph.height) / distance).toFixed(0).padStart(4)}` +
        `   ${String(seen.size).padStart(5)}  ${String(counts[0]).padStart(5)}  ${String(counts[1]).padStart(5)}  ${String(counts[2]).padStart(5)}   of ${bits.length}`,
    );
    // At conversational range a crowd that is one figure is a crowd nobody
    // believes. Half is the floor, and Earth's is 93% at 5%.
    if (distance === 40 && counts[1]! < bits.length * 0.5) {
      fail(`${species.id}: only ${counts[1]} of ${bits.length} are distinguishable at 40 units`);
    }
  }
}
