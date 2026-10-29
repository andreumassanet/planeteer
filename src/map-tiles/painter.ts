import * as THREE from 'three';
import { PLANET_RADIUS, groundColorAt, lushOf, patchesOf } from '../globe.ts';
import { reliefAt } from '../terrain.ts';
import { OCEAN_COLOR, PALETTE } from '../theme.ts';
import type { SheetRing } from '../map-outline.ts';
import { Raster } from '../raster.ts';
import { type GroundEnv, PAD, ground } from './ground.ts';
import { DEG, MAP_STYLE, TILE } from './projection.ts';
import { outlineStamp, sheetRingSteps, sheetRingsOf } from './rings.ts';
import type { TilePainter, TilePainterOptions } from './types.ts';
import { tileView } from './view.ts';

/**
 * The pure, canvas-free painter: the same key gives the same bytes in any
 * browser and in Node, which is what lets the planet-scale levels be baked
 * and a tile be checked against its own repaint.
 */
export function createTilePainter(options: TilePainterOptions): TilePainter {
  const { world, surface, features } = options;
  const RADIUS = surface?.radius ?? PLANET_RADIUS;
  const dry = surface !== undefined && !surface.sea;
  const unitScratch = new THREE.Vector3();
  const colourOf = (point: THREE.Vector3, out: THREE.Color): THREE.Color => {
    if (surface !== undefined) return surface.colorAt(unitScratch.copy(point).normalize(), out);
    groundColorAt(world, point, out);
    // As the land's shader draws it: lushed, then blotted (`globe.ts`).
    lushOf(out);
    return patchesOf(out, point.x, point.y, point.z);
  };
  const groundStamp = `${MAP_STYLE}:${surface?.id ?? 'earth'}:${outlineStamp(world)}`;
  const stamp = `${groundStamp}:${features?.stamp ?? '-'}`;

  let sheetRings: SheetRing[] | null = null;
  const rings = (): SheetRing[] => (sheetRings ??= sheetRingsOf(world, surface));
  /** The rings built a slice at a time by whichever tile asks first; the rest wait on it. */
  let ringJob: Generator<undefined, SheetRing[], void> | null = null;
  function* ringsReady(): Generator<undefined, void, void> {
    while (sheetRings === null) {
      ringJob ??= sheetRingSteps(world, surface);
      const step = ringJob.next();
      if (step.done === true) {
        sheetRings = step.value;
        ringJob = null;
      } else yield;
    }
  }

  const M = TILE + 2 * PAD;
  const env: GroundEnv = {
    dry,
    RADIUS,
    UNITS_PER_DEG: RADIUS * DEG,
    colourOf,
    reliefOf: surface === undefined ? reliefAt : surface.reliefAt,
    rings,
    ringsReady,
    maskRaster: new Raster(M, M),
    nationRaster: dry ? new Raster(M, M) : null,
    colourScratch: new THREE.Color(),
    pointScratch: new THREE.Vector3(),
    oceanAbyss: new THREE.Color(OCEAN_COLOR).multiplyScalar(0.7),
    oceanDeep: new THREE.Color(OCEAN_COLOR),
    oceanShallow: new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.62),
    oceanSurf: new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.85).lerp(new THREE.Color(PALETTE.white), 0.15),
    oceanSwell: new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.white), 0.55),
    oceanWet: new THREE.Color(OCEAN_COLOR).multiplyScalar(0.55),
    upland: new THREE.Color(PALETTE.tan),
    snow: new THREE.Color(PALETTE.white),
    fallbackLand: new THREE.Color(PALETTE.green),
    nationColour: new THREE.Color(),
  };

  function* paint(
    z: number,
    i: number,
    j: number,
    raster: Raster,
    state: { hurry: boolean; incomplete: boolean } = { hurry: true, incomplete: false },
    withFeatures = true,
  ): Generator<'wait' | undefined, void, void> {
    yield* ground(env, z, i, j, raster);
    if (!withFeatures || features === undefined || z < features.fromLevel) return;
    const view = tileView(z, i, j, RADIUS);
    Object.defineProperty(view, 'hurry', { get: () => state.hurry });
    yield* features.paint(view, raster);
    if (view.incomplete) state.incomplete = true;
  }

  return {
    rings,
    groundStamp,
    stamp,
    fromLevel: features?.fromLevel ?? Infinity,
    paint,
    paintNow(z, i, j, withFeatures = true) {
      const raster = new Raster(TILE, TILE);
      const state = { hurry: true, incomplete: false };
      const steps = paint(z, i, j, raster, state, withFeatures);
      while (steps.next().done !== true) {
        // To its end: a painter asked to hurry never waits.
      }
      return { raster, incomplete: state.incomplete };
    },
  };
}
