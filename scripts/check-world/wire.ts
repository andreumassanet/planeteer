import { check, here } from './harness.ts';
import { monumentsPath } from './context.ts';
import type { WorldContext } from './context.ts';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import {
  decodeCountries,
  decodePlaces,
  decodeRoads,
  encodeCountries,
  encodePlaces,
  encodeRoads,
  inflate,
} from '../../src/pack.ts';

/**
 * The baked binary files (`src/pack.ts`), checked three ways: re-encoding
 * what was decoded reproduces the file byte for byte (so it is not stale),
 * every number survives its own `toFixed` (nothing was quantised away), and
 * the shipped sizes and decode times are printed. The comparison is on the
 * uncompressed encoding, since gzip output depends on the zlib version.
 */
export async function checkWire(ctx: WorldContext): Promise<void> {
  const { world, placesRaw } = ctx;
  console.log('the wire');
  const files: [string, number][] = [];
  const shipped = (name: string): Uint8Array => {
    const bytes = readFileSync(resolve(here, '../public/data', name));
    files.push([name, bytes.length]);
    return bytes;
  };

  const countryBytes = await inflate(shipped('countries.bin'));
  const placeBytes = await inflate(shipped('places.bin'));
  const roadBytes = await inflate(shipped('roads.bin'));
  // The `.bin` files are gzipped by the bake; `monuments.json` is compressed by the CDN.
  files.push(['monuments.json', gzipSync(readFileSync(monumentsPath), { level: 9 }).length]);

  // Decoded rings carry no `digits`, so recover the bake's choice: the
  // coarsest precision (3, else 4) at which every coordinate is exact.
  const repacked = encodeCountries(
    world.countries.map((country) => ({
      ...country,
      rings: country.rings.map((points) => ({
        digits:
          [3, 4].find((d) =>
            points.every((p) => Number(p[0]!.toFixed(d)) === p[0]! && Number(p[1]!.toFixed(d)) === p[1]!),
          ) ?? 5,
        points,
      })),
    })),
  );
  check(
    Buffer.compare(Buffer.from(repacked), countryBytes) === 0,
    'countries.bin is what this encoder bakes',
    `${repacked.length} against ${countryBytes.length} bytes`,
  );
  const placesAgain = encodePlaces(placesRaw);
  check(
    Buffer.compare(Buffer.from(placesAgain), placeBytes) === 0,
    'places.bin is what this encoder bakes',
    `${placesAgain.length} against ${placeBytes.length} bytes`,
  );
  const bakedRoads = decodeRoads(roadBytes);
  const roadsAgain = encodeRoads(bakedRoads.places, bakedRoads.graph, bakedRoads.roads);
  check(
    Buffer.compare(Buffer.from(roadsAgain), roadBytes) === 0,
    'roads.bin is what this encoder bakes',
    `${roadsAgain.length} against ${roadBytes.length} bytes`,
  );

  // A value that did not survive the round trip reproduces no decimal string.
  // 4 is the bake's `PRECISION_FINEST`.
  let coarse = 0;
  for (const country of world.countries) {
    for (const ring of country.rings) {
      for (const point of ring) {
        if (Number(point[0]!.toFixed(4)) !== point[0]! || Number(point[1]!.toFixed(4)) !== point[1]!) coarse++;
      }
    }
  }
  const outlinePoints = world.rings.reduce((n, r) => n + r.points.length, 0);
  check(coarse === 0, `all ${outlinePoints.toLocaleString()} outline points are exact at their own precision`, `${coarse} moved`);

  let placeDrift = 0;
  for (const place of placesRaw) {
    if (Number(place.lat.toFixed(3)) !== place.lat || Number(place.lon.toFixed(3)) !== place.lon) placeDrift++;
    if (!Number.isInteger(place.pop)) placeDrift++;
    if (place.snappedKm !== undefined && Number(place.snappedKm.toFixed(1)) !== place.snappedKm) placeDrift++;
  }
  check(placeDrift === 0, `all ${placesRaw.length.toLocaleString()} places are exact at their own precision`, `${placeDrift} moved`);

  let bendDrift = 0;
  for (const road of bakedRoads.roads) {
    if (Number(road.bend.toFixed(4)) !== road.bend) bendDrift++;
  }
  check(bendDrift === 0, `all ${bakedRoads.roads.length.toLocaleString()} bows are exact at four decimals`, `${bendDrift} moved`);

  const total = files.reduce((n, [, bytes]) => n + bytes, 0);
  console.log(
    `  first load: ${files.map(([name, bytes]) => `${name.replace(/\..*/, '')} ${Math.round(bytes / 1000)}`).join(' · ')}` +
    ` = ${Math.round(total / 1000)} KB gzipped`,
  );

  // Decode cost, timed warm (the first passes are JIT and buffers).
  const time = async (label: string, run: () => Promise<unknown> | unknown): Promise<string> => {
    for (let k = 0; k < 2; k++) await run();
    const began = performance.now();
    for (let k = 0; k < 3; k++) await run();
    return `${label} ${((performance.now() - began) / 3).toFixed(1)}`;
  };
  const raw = [readFileSync(resolve(here, '../public/data/countries.bin')),
               readFileSync(resolve(here, '../public/data/places.bin')),
               readFileSync(resolve(here, '../public/data/roads.bin'))];
  console.log(
    `  decode: ${[
      await time('countries', async () => decodeCountries(await inflate(raw[0]!))),
      await time('places', async () => decodePlaces(await inflate(raw[1]!))),
      await time('roads', async () => decodeRoads(await inflate(raw[2]!))),
    ].join(' · ')} ms`,
  );
}
