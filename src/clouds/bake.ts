/** The coverage field baked into a map in the deck's own frame, for the shade clouds throw on the ground. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { unitAt } from '../sphere.ts';
import { CLOUD_MAP_HEIGHT, CLOUD_MAP_WIDTH, cloudMapByte, rayToDeck, shadeCover, shadeDarkness, shadeGate } from '../cloud-shade.ts';
import { CLOUD_BASE, DEPTH_SPAN, THRESHOLD, coverageAt, deckTurn } from './field.ts';

/**
 * Milliseconds of a frame the bake may take: `FLAG_BUILD_MS`'s four, for the
 * same reason (`main.ts`). The whole bake is 0.6 s of `coverageAt` (2 M texels
 * at 0.3 us), a stutter in one piece and 150 unnoticed frames at four
 * milliseconds. The deck is built at 'setting the weather' and the menu opens
 * right after, so the shade is there by the time anybody lands.
 */
export const BAKE_MS = 4;
/** The frame the budget is a share of, and the most one call may take however late it was called. */
const BAKE_FRAME_MS = 1000 / 60;
const BAKE_CATCH_UP_CAP = 2 * BAKE_FRAME_MS;

export interface CloudBake {
  /**
   * Bakes rows for about `budgetMs`, and true once every row is done. The budget
   * is a share of a frame, not a sum: called late (a slow machine, a throttled
   * tab) it takes the share of the gap since the last call, up to two frames, as
   * the flag layer's build does (`land-flags.ts`, `CATCH_UP_CAP`), or a bake that
   * needs 150 calls would take minutes. `Infinity` bakes the rest at once.
   */
  step(budgetMs: number): boolean;
  readonly done: boolean;
  /** Rows written, of `CLOUD_MAP_HEIGHT`, and the milliseconds they took. */
  readonly rows: number;
  readonly ms: number;
  /** The map: a byte a texel (`cloudMapByte`), row 0 at the south pole. */
  readonly data: Uint8Array;
}

/**
 * The field written into a texture in the deck's own frame: longitude across,
 * latitude up, a texel's centre each (`cloudMapUV` is the lookup). Never
 * stale: the deck is a rigid turn of it, which the shader undoes.
 */
export function createCloudBake(): CloudBake {
  const data = new Uint8Array(CLOUD_MAP_WIDTH * CLOUD_MAP_HEIGHT);
  // Each column's longitude as the unit vector on the equator, and each row's
  // latitude as its ring's radius and height: a texel is then two multiplies
  // and the field, and the conversion is `sphere.ts`'s.
  const columns = new Float64Array(CLOUD_MAP_WIDTH * 2);
  const unit = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < CLOUD_MAP_WIDTH; i++) {
    unitAt(0, -180 + ((i + 0.5) * 360) / CLOUD_MAP_WIDTH, unit);
    columns[i * 2] = unit.x;
    columns[i * 2 + 1] = unit.z;
  }
  let rows = 0;
  let ms = 0;
  let handedBack = 0;
  const row = (j: number): void => {
    unitAt(-90 + ((j + 0.5) * 180) / CLOUD_MAP_HEIGHT, 0, unit);
    const ring = unit.x;
    const y = unit.y;
    const at = j * CLOUD_MAP_WIDTH;
    for (let i = 0; i < CLOUD_MAP_WIDTH; i++) {
      data[at + i] = cloudMapByte(coverageAt(ring * columns[i * 2]!, y, ring * columns[i * 2 + 1]!));
    }
  };
  return {
    data,
    get done() {
      return rows >= CLOUD_MAP_HEIGHT;
    },
    get rows() {
      return rows;
    },
    get ms() {
      return ms;
    },
    step(budgetMs: number): boolean {
      if (rows >= CLOUD_MAP_HEIGHT) return true;
      const began = performance.now();
      const gap = handedBack === 0 ? BAKE_FRAME_MS : began - handedBack;
      const allowance = budgetMs === Infinity
        ? Infinity
        : Math.min(BAKE_CATCH_UP_CAP, Math.max(budgetMs, (budgetMs * gap) / BAKE_FRAME_MS));
      // Checked after each row, so a call may pass its allowance by one row:
      // 2,048 texels, about 0.6 ms.
      while (rows < CLOUD_MAP_HEIGHT) {
        row(rows++);
        if (performance.now() - began >= allowance) break;
      }
      ms += performance.now() - began;
      handedBack = performance.now();
      return rows >= CLOUD_MAP_HEIGHT;
    },
  };
}

/** The whole map at once, for the checks: `createCloudBake` run to the end. */
export function bakeCloudMap(): Uint8Array {
  const bake = createCloudBake();
  bake.step(Infinity);
  return bake.data;
}

/** The shade at a point, as `cloudShadeAt` reports it. */
export interface CloudShadeSample {
  /** How much of a bank is between the point and the sun, 0 to 1, the gates included. */
  cover: number;
  /** How deep into that bank, 0 at its edge to 1 at its heart. */
  depth: number;
  /** The share of the sun's term the cloud takes there: `cover` times the darkness at `depth`. */
  shade: number;
}

const shadeHit = new THREE.Vector3();
const shadeTurn = new THREE.Quaternion();

/**
 * The shade the shaders draw, on the exact field rather than the bake: the ray
 * from `point` to the sun (`sun`, a unit vector) as far as the deck's sphere,
 * turned back through the deck's turn at `timeMs` (`weatherAt`'s convention),
 * and the field there through the soft edge. The strength the shaders are
 * handed (the switch, the fade, the veil) is not in it.
 */
export function cloudShadeAt(
  point: THREE.Vector3,
  sun: THREE.Vector3,
  timeMs: number,
  out: CloudShadeSample = { cover: 0, depth: 0, shade: 0 },
): CloudShadeSample {
  out.cover = 0;
  out.depth = 0;
  out.shade = 0;
  const r = point.length();
  const gate = r > 0 ? shadeGate(r, point.dot(sun) / r, PLANET_RADIUS) : 0;
  if (gate <= 0) return out;
  const t = rayToDeck(point, sun, PLANET_RADIUS + CLOUD_BASE);
  shadeHit.copy(point).addScaledVector(sun, t).normalize().applyQuaternion(deckTurn(timeMs, shadeTurn).invert());
  const field = coverageAt(shadeHit.x, shadeHit.y, shadeHit.z);
  out.cover = shadeCover(field, THRESHOLD) * gate;
  out.depth = Math.min(1, Math.max(0, (field - THRESHOLD) / DEPTH_SPAN));
  out.shade = out.cover * shadeDarkness(out.depth);
  return out;
}
