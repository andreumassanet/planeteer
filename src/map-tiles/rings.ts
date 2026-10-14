import type { World } from '../geo.ts';
import type { PlanetSurface } from '../planet.ts';
import { coastEdges } from '../globe.ts';
import type { SheetRing } from '../map-outline.ts';
import { uOf, vOf } from './projection.ts';

/** The data's stamp: a body, its rings and their points, cheap enough to take at load. */
export function outlineStamp(world: World): string {
  let points = 0;
  for (const ring of world.rings ?? []) points += ring.points.length;
  return `${(world.rings ?? []).length}r${points}p`;
}

/**
 * The world's rings on the sheet, once: what the tiles' land mask is filled
 * from and what `map.ts` inks its coast and frontiers with.
 */
export function sheetRingsOf(world: World, surface?: PlanetSurface): SheetRing[] {
  const steps = sheetRingSteps(world, surface);
  for (;;) {
    const step = steps.next();
    if (step.done === true) return step.value;
  }
}

/** Rings handed out per step. */
const RING_STEP = 240;

/**
 * The same in steps, `RING_STEP` rings at a time, so a tile's first step is
 * not the whole conversion. (`coastEdges` is the world's own, cached, and
 * worked out at load.)
 */
export function* sheetRingSteps(world: World, surface?: PlanetSurface): Generator<undefined, SheetRing[], void> {
  const source = world.rings ?? [];
  const dry = surface !== undefined && !surface.sea;
  const coast = source.length > 0 ? (surface === undefined ? coastEdges : surface.coastEdges)(world) : [];
  yield;
  const out: SheetRing[] = [];
  for (let r = 0; r < source.length; r++) {
    if (r > 0 && r % RING_STEP === 0) yield;
    out.push(sheetRing(world, source[r]!, coast[r], dry));
  }
  return out;
}

function sheetRing(world: World, ring: World['rings'][number], flags: Uint8Array | undefined, dry: boolean): SheetRing {
  const n = ring.points.length;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const edge = new Uint8Array(n);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (let k = 0; k < n; k++) {
    const [lon, lat] = ring.points[k]!;
    u[k] = uOf(lon!);
    v[k] = vOf(lat!);
    if (u[k]! < u0) u0 = u[k]!;
    if (u[k]! > u1) u1 = u[k]!;
    if (v[k]! < v0) v0 = v[k]!;
    if (v[k]! > v1) v1 = v[k]!;
  }
  for (let k = 0; k < n; k++) {
    const [lonA, latA] = ring.points[k]!;
    const [lonB, latB] = ring.points[(k + 1) % n]!;
    // Not an edge of anything: a ring's run along a pole, or the seam
    // where Natural Earth cut a country at the antimeridian. Drawn, both
    // are a line across the ice or down the Bering Strait.
    const seam =
      (Math.abs(latA!) > 89.9 && Math.abs(latB!) > 89.9) ||
      (Math.abs(lonA!) > 179.99 && Math.abs(lonB!) > 179.99);
    // A surface's `coastEdges` may say 2 itself: on a walked world, the
    // straight cut between two rings of one nation (`worlds/surface.ts`).
    edge[k] = seam || flags?.[k] === 2 ? 2 : ring.water || (flags?.[k] ?? 0) === 1 ? 1 : 0;
  }
  const color = dry ? world.countries[ring.country - 1]?.color : undefined;
  return {
    u, v, edge, u0, u1, v0, v1, water: ring.water, levels: [],
    ...(color === undefined ? {} : { fill: `#${color.toString(16).padStart(6, '0')}`, fillHex: color }),
  };
}
