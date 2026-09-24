/**
 * Headless assertions over the traffic kit.
 *
 * `scripts/check-world.ts` is the model and the reason this is a second file
 * rather than a section of that one: `check-world.ts` is about **data** — the
 * bake, the mesh, where the monuments landed — and this is about a *kit*, which
 * has no baked artefact to check. It builds every vehicle in every region in
 * every variant and holds the result to the contract. 18 x 14 x 4 is 1,008
 * builds and it takes about a second.
 *
 * The one trick, and it is the same one `build-monuments.ts` needs: **the
 * registry cannot be used here.** `import.meta.glob` is a Vite transform and
 * does not exist in Node, so the parts are read off disk and imported by path.
 * The consequence is that a part which the registry would reject — a duplicate
 * id, a file named after the wrong vehicle — is caught by the review sheet and
 * not by this. Both checks are needed and neither subsumes the other.
 *
 * `node scripts/check-traffic.ts`, or `pnpm traffic`.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  KINDS,
  RIDER,
  RIDER_HEIGHT,
  SAME_SHAPE,
  VARIANTS,
  createTrafficContext,
  fitsOn,
  measure,
  passesOn,
  silhouetteOf,
  silhouetteOverlap,
  placedSize,
  validateVehicle,
  variantRng,
} from '../src/traffic/contract.ts';
import type { Vehicle } from '../src/traffic/contract.ts';
import { TRAFFIC_STYLES } from '../src/traffic/regions.ts';
import { ROAD_CLASSES } from '../src/roads.ts';
import { registerModelsFromDisk } from './kit-node.ts';

// The vehicles are baked CC0 models now (scripts/build-kit.ts): register them as main.ts does.
await registerModelsFromDisk();

const PARTS = resolve(import.meta.dirname, '../src/traffic/parts');

let failures = 0;
const fail = (message: string): void => {
  failures++;
  console.log(`  FAIL  ${message}`);
};

// --- load ---------------------------------------------------------------

const vehicles: Vehicle[] = [];
const ids = new Map<string, string>();
for (const file of readdirSync(PARTS).filter((name) => name.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(PARTS, file)).href)) as Record<string, unknown>;
  const found = Object.values(module).filter(
    (value): value is Vehicle =>
      typeof value === 'object' && value !== null && typeof (value as Vehicle).build === 'function',
  );
  if (found.length === 0) fail(`${file} exports no vehicle`);
  for (const vehicle of found) {
    const previous = ids.get(vehicle.id);
    if (previous !== undefined) fail(`duplicate id '${vehicle.id}' in ${previous} and ${file}`);
    ids.set(vehicle.id, file);
    if (file !== `${vehicle.id}.ts`) fail(`${file} holds '${vehicle.id}' — the file should be ${vehicle.id}.ts`);
    vehicles.push(vehicle);
  }
}

const ctx = createTrafficContext();
const styles = Object.values(TRAFFIC_STYLES);

console.log(`traffic kit: ${vehicles.length} vehicles x ${styles.length} regions x ${VARIANTS} variants`);
console.log(`a rider is built at ${RIDER_HEIGHT.toFixed(2)} — crown ${RIDER.crown.toFixed(2)} above the seat, sole ${RIDER.sole.toFixed(2)} below\n`);

// --- every variant against the contract ---------------------------------

let builds = 0;
let triangles = 0;
for (const vehicle of vehicles) {
  const kind = KINDS[vehicle.kind];
  if (!kind) {
    fail(`'${vehicle.id}' has kind '${vehicle.kind}', which is not in KINDS`);
    continue;
  }
  const seen = new Set<string>();
  let worst = 0;
  for (const style of styles) {
    for (let variant = 0; variant < VARIANTS; variant++) {
      let group;
      try {
        group = vehicle.build(ctx, variantRng(vehicle, style, variant), style);
      } catch (error) {
        fail(`${vehicle.id} threw on ${style.id}/${variant}: ${String(error)}`);
        continue;
      }
      builds++;
      for (const problem of validateVehicle(vehicle, group)) {
        if (seen.has(problem)) continue;
        seen.add(problem);
        fail(`${vehicle.id} (${style.id}/${variant}): ${problem}`);
      }
      worst = Math.max(worst, measure(group).triangles);
      group.traverse((object) => {
        const mesh = object as { isMesh?: boolean; geometry?: { dispose(): void } };
        if (mesh.isMesh) mesh.geometry?.dispose();
      });
    }
  }
  triangles += worst;
  const [l, w, h] = vehicle.size;
  console.log(
    `  ${vehicle.id.padEnd(17)} ${vehicle.kind.padEnd(8)} ${l.toFixed(2).padStart(6)} x ${w.toFixed(2)} x ${h.toFixed(2)}` +
      `   ${String(worst).padStart(3)}/${kind.triangles} tris   ${vehicle.mounts.length} mount(s)`,
  );
}
console.log(`\n  ${builds} builds, ${triangles} triangles across the kit`);

// --- determinism, byte for byte ------------------------------------------

/**
 * Every vertex of a built group, in group space, and the colour it is drawn in.
 *
 * **Not the silhouette raster**, which is what this check used first and which is
 * the wrong tool: at 0.2 units to a cell it cannot see a wheel moved by a tenth
 * of a unit or a colour shuffled, and those are exactly the shapes a stray
 * `Math.random()` takes. The order is deliberately not sorted — two builds that
 * place the same meshes in a different order are a different model to anything
 * that draws them.
 */
function fingerprint(group: { updateMatrixWorld(deep: boolean): void; traverse(fn: (o: never) => void): void }): string {
  group.updateMatrixWorld(true);
  const parts: string[] = [];
  group.traverse(((object: {
    isMesh?: boolean;
    material?: { userData: Record<string, unknown> };
    geometry?: { getAttribute(name: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } };
    matrixWorld: { elements: number[] };
  }) => {
    if (!object.isMesh || !object.geometry) return;
    parts.push(`#${String(object.material?.userData.atlasToon ?? 'none')}`);
    parts.push(object.matrixWorld.elements.map((n) => n.toFixed(4)).join(','));
    const position = object.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      parts.push(`${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`);
    }
  }) as never);
  return parts.join('|');
}

for (const vehicle of vehicles) {
  for (const entry of styles) {
    for (let variant = 0; variant < VARIANTS; variant++) {
      const once = fingerprint(vehicle.build(ctx, variantRng(vehicle, entry, variant), entry) as never);
      const twice = fingerprint(vehicle.build(ctx, variantRng(vehicle, entry, variant), entry) as never);
      if (once !== twice) {
        fail(`${vehicle.id} (${entry.id}/${variant}) is not deterministic — same seed, two different models`);
      }
    }
  }
}

// --- distinctness ---------------------------------------------------------

const style = TRAFFIC_STYLES['atlantic-europe'];
const signatures = vehicles.map((vehicle) => ({
  id: vehicle.id,
  bits: silhouetteOf(vehicle.build(ctx, variantRng(vehicle, style, 0), style)),
}));
const pairs: [string, string, number][] = [];
for (let i = 0; i < signatures.length; i++) {
  for (let j = i + 1; j < signatures.length; j++) {
    pairs.push([signatures[i]!.id, signatures[j]!.id, silhouetteOverlap(signatures[i]!.bits, signatures[j]!.bits)]);
  }
}
pairs.sort((a, b) => b[2] - a[2]);
const median = [...pairs].sort((a, b) => a[2] - b[2])[Math.floor(pairs.length / 2)]![2];
console.log(`\n  side-elevation overlap over ${pairs.length} pairs: median ${median.toFixed(3)}, worst ${pairs[0]![2].toFixed(3)} (${pairs[0]![0]} / ${pairs[0]![1]})`);
for (const [a, b, value] of pairs) {
  if (value > SAME_SHAPE) fail(`${a} and ${b} are the same silhouette (${value.toFixed(3)} > ${SAME_SHAPE})`);
}

// --- the join with the road network ---------------------------------------

console.log('\n  what fits what, at the placed scale:');
/**
 * **This table is now about the vehicle as *placed*, not as authored, and the
 * assertion at the bottom moved with it.**
 *
 * `src/life.ts` and `src/settlements.ts` put a vehicle down at `placedScale`,
 * cropped in length, so the widths that meet a carriageway are the placed ones.
 * Until 2026-09-24 that was twice the section, because a car at the authored
 * scale had its roof at the 6.8-unit avatar's knee, and `ROAD_CLASSES` and
 * `GroundStyle.street` were both widened by 1.5 to take it; since a person came
 * down to 3.77 units the section is placed at 1.35 (`PLACED_SECTION`).
 *
 * The old assertion was *every road vehicle fits the narrowest street on the
 * planet*, which was the 4.0-unit Maghrebi alley. That alley became 6.0 and a
 * city bus placed at twice its section was 6.60 wide, so it failed — **and it
 * should have**: a bus does not go down a medina alley, and the Maghrebi mix
 * weights the hand-cart at 4 for exactly that reason. What has to be true
 * instead is that every road vehicle fits the narrowest *road class*, because a
 * vehicle that cannot use a lane is a vehicle nothing can place anywhere; the
 * alley column is printed and not asserted.
 */
const alley = 6.0;
const lane = ROAD_CLASSES[0]!.width;
for (const vehicle of vehicles) {
  if (KINDS[vehicle.kind].medium !== 'road') continue;
  const width = placedSize(vehicle)[1];
  const wide = { ...vehicle, size: placedSize(vehicle) } as Vehicle;
  const bits = ROAD_CLASSES.map((road) =>
    passesOn(wide, road.width) ? `${road.name} two` : fitsOn(wide, road.width) ? `${road.name} one` : `${road.name} NO`,
  );
  bits.unshift(passesOn(wide, alley) ? 'alley two' : fitsOn(wide, alley) ? 'alley one' : 'alley NO');
  console.log(`  ${vehicle.id.padEnd(17)} ${width.toFixed(2)} wide placed   ${bits.join(' · ')}`);
  if (!fitsOn(wide, lane)) fail(`${vehicle.id} is ${width.toFixed(2)} wide placed and cannot use a ${lane}-unit lane`);
}

// --- the region tables ----------------------------------------------------

const known = new Set(vehicles.map((vehicle) => vehicle.id));
const named = new Set<string>();
for (const entry of styles) {
  for (const list of [entry.road, entry.water, entry.air]) {
    for (const item of list) {
      named.add(item.item);
      if (!known.has(item.item)) fail(`region '${entry.id}' names '${item.item}' and no such vehicle exists`);
    }
  }
  if (entry.road.length === 0) fail(`region '${entry.id}' has no road traffic at all`);
}
for (const vehicle of vehicles) {
  if (!named.has(vehicle.id)) fail(`nothing will ever build '${vehicle.id}' — no region names it`);
}

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
