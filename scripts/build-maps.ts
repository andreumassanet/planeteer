/**
 * Pre-paints the maps' planet-scale levels: `public/maps/<world>/z<k>.png`.
 *
 * The map paper (`src/map-tiles.ts`) paints tiles at runtime; its first levels
 * (1, 2 and 12 tiles for the whole planet) are the dearest and identical for
 * every player, so they are painted here with the same painter, ground only
 * (`BAKED_LEVELS`).
 *
 * One PNG a level, tiles side by side, quantised to 256 colours (`png.ts`),
 * and a `stamp.txt` beside them: the painter's ground stamp (`MAP_STYLE`, the
 * body, its outlines), which the browser compares with its own before it
 * trusts the images.
 *
 * `pnpm maps` (`node scripts/build-maps.ts`, or `-- mars` for one world).
 * Re-run after `pnpm data`, after a world's outlines or ground change, and
 * whenever `MAP_STYLE` is bumped.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAKED_LEVELS, TILE, createTilePainter, rowsAt } from '../src/map-tiles.ts';
import type { TilePainter } from '../src/map-tiles.ts';
import { encodePng, quantise } from './png.ts';
import { loadEarth } from './map-node.ts';

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
let total = 0;

function bake(id: string, painter: TilePainter): void {
  const dir = resolve(here, `../public/maps/${id}`);
  mkdirSync(dir, { recursive: true });
  let bytes = 0;
  const began = performance.now();
  for (let z = 0; z < BAKED_LEVELS; z++) {
    const columns = 2 ** z;
    const rows = rowsAt(z);
    const width = columns * TILE;
    const height = rows * TILE;
    const image = new Uint8Array(width * height * 4);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < columns; i++) {
        const { raster } = painter.paintNow(z, i, j, false);
        for (let y = 0; y < TILE; y++) image.set(raster.data.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((j * TILE + y) * width + i * TILE) * 4);
      }
    }
    const png = encodePng(image, width, height, quantise(image));
    writeFileSync(resolve(dir, `z${z}.png`), png);
    bytes += png.length;
  }
  writeFileSync(resolve(dir, 'stamp.txt'), `${painter.groundStamp}\n`);
  total += bytes;
  console.log(`  ${id.padEnd(8)} ${(bytes / 1024).toFixed(0).padStart(5)} KB in ${((performance.now() - began) / 1000).toFixed(1)} s   ${painter.groundStamp}`);
}

console.log(`the maps' first ${BAKED_LEVELS} levels:`);
if (only === undefined || only === 'earth') {
  const { world } = await loadEarth();
  bake('earth', createTilePainter({ world }));
}
const { WORLD_IDS, loadWorldSpec } = await import('../src/worlds/registry.ts');
const { createTerrain } = await import('../src/worlds/terrain.ts');
const { surfaceOf } = await import('../src/worlds/surface.ts');
const { geographyOf } = await import('../src/system/geography.ts');
for (const id of WORLD_IDS) {
  if (only !== undefined && only !== id) continue;
  const spec = await loadWorldSpec(id);
  const terrain = createTerrain(spec);
  const geography = geographyOf(spec.body);
  bake(id, createTilePainter({ world: geography.world, surface: surfaceOf(terrain, geography) }));
}
console.log(`  ${(total / 1024).toFixed(0)} KB in all`);
