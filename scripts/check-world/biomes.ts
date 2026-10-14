import { at, check } from './harness.ts';
import type { WorldContext } from './context.ts';
import { reliefAt } from '../../src/terrain.ts';
import { biomeAt, biomeSample } from '../../src/biome.ts';

/**
 * The biome model, against places whose biome is not in dispute.
 *
 * `biome.ts` decides what the ground is made of from three lines of arithmetic
 * and no data file, which is a thing you can get badly wrong while every
 * internal check agrees with itself. So the check is external: 25 named
 * coordinates and what any atlas says is there. The four it is allowed to miss
 * are listed in `biome.ts` under `Known misses`, each with the term it would
 * take to fix — they are the cases a model with no mountains and no continents
 * cannot reach, not tuning that was never done.
 */
export function checkBiomes(ctx: WorldContext): void {
  const { world } = ctx;
  console.log('\nbiomes');
  const sample = biomeSample();
  const biomeOf = (lat: number, lon: number): string => {
    const p = at(lat, lon).normalize();
    biomeAt(p.x, p.y, p.z, lat, lon, reliefAt(p.x, p.y, p.z), sample);
    return sample.id;
  };
  const cases: [string, number, number, string][] = [
    ['Sahara', 25.0, 14.0, 'desert'],
    ['Australian interior', -24.0, 132.0, 'desert'],
    ['Kalahari', -23.0, 22.0, 'desert'],
    ['Amazon', -3.0, -62.0, 'tropical'],
    ['Congo', 0.5, 22.0, 'tropical'],
    ['Borneo', 1.0, 114.0, 'tropical'],
    ['central Siberia', 62.0, 95.0, 'boreal'],
    ['Canadian shield', 58.0, -100.0, 'boreal'],
    ['Finland', 63.0, 26.0, 'boreal'],
    ['northern Siberia', 73.0, 100.0, 'tundra'],
    ['Greenland', 74.0, -40.0, 'ice'],
    ['Antarctica', -80.0, 30.0, 'ice'],
    ['France', 47.0, 2.0, 'temperate'],
    ['Germany', 51.0, 10.0, 'temperate'],
    ['New Zealand', -43.0, 171.0, 'temperate'],
    ['Scotland', 57.0, -4.0, 'temperate'],
    ['Japan', 35.7, 139.7, 'temperate'],
    ['Mallorca', 39.6, 3.0, 'temperate'],
    ['Iowa', 42.0, -94.0, 'grassland'],
    ['Sahel', 14.0, 5.0, 'savanna'],
    ['Himalaya', 28.0, 86.9, 'ice'],
  ];
  let wrong = 0;
  const examples: string[] = [];
  for (const [name, lat, lon, want] of cases) {
    const got = biomeOf(lat, lon);
    if (got !== want) {
      wrong++;
      if (examples.length < 5) examples.push(`${name} ${got} not ${want}`);
    }
  }
  check(wrong === 0, `all ${cases.length} named places land in their biome`, examples.join(', '));

  /**
   * The known misses: places where the model disagrees with the ground (the
   * Empty Quarter, the Atacama, the Serengeti, the Kazakh steppe). `biome.ts`
   * writes down why each is missed; here they are what the ground really is,
   * printed rather than failed, and a line says so when one comes right.
   */
  const misses: [string, number, number, string][] = [
    ['Empty Quarter', 20.0, 50.0, 'desert'],
    ['Atacama', -23.5, -69.0, 'desert'],
    ['Serengeti', -2.5, 34.8, 'savanna'],
    ['Kazakhstan', 48.0, 68.0, 'steppe'],
  ];
  const known = misses.map(([name, lat, lon, real]) => {
    const got = biomeOf(lat, lon);
    return got === real ? `${name} is ${real} now — move it up` : `${name} ${got}, is ${real}`;
  });
  console.log(`  --   known misses (biome.ts): ${known.join(' · ')}`);

  // A spread, not a boolean: a model that classifies the whole planet as one
  // thing passes every point test above if that thing happens to be temperate.
  const tally = new Map<string, number>();
  for (let i = 0; i < 4000; i++) {
    const lat = (((i * 37) % 1600) / 1600) * 180 - 90;
    const lon = (((i * 91) % 1600) / 1600) * 360 - 180;
    if (world.countryAt(lat, lon) === 0) continue;
    const id = biomeOf(lat, lon);
    tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  const spread = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  --   ' + spread.map(([k, n]) => `${k} ${((n / total) * 100).toFixed(0)}%`).join(' · '));
  check(spread.length >= 6, 'at least six biomes appear on land', `${spread.length} of ${10}`);
}
