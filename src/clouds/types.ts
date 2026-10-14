import * as THREE from 'three';
import type { CloudShadeSample } from './bake.ts';

export interface CloudStats {
  /** Cells of the lattice that came out cloudy, and the fraction they are. */
  cells: number;
  cover: number;
  /** Puffs in the deck, and how many of them are a heap's bottom tier (the far level's). */
  puffs: number;
  bottom: number;
  /** Puffs in the far set (`FAR_LEAST`). */
  farPuffs: number;
  /** Triangles if every puff were drawn at the near level, and the whole far set. */
  triangles: number;
  farTriangles: number;
  /** Triangles in the chunks the last update left on, before the frustum. */
  drawn: number;
  /** Instanced meshes in the deck, and how many the last update left on. */
  chunks: number;
  shown: number;
  megabytes: number;
  buildMs: number;
  /** Puffs whose matrix came out mirrored (determinant <= 0). Must be 0. */
  mirrored: number;
}

/**
 * Where the deck sits in the opaque list. The frontiers in `borders.ts` are
 * drawn with no depth test, so only the order decides what covers them: they
 * take `CLOUD_ORDER - 1` and the deck takes this, so the weather is drawn over
 * the line, depth-tested. It stays well under the sky dome's 1000, which is
 * drawn last so that only the sky left over is shaded.
 */
export const CLOUD_ORDER = 5;

export interface Clouds {
  group: THREE.Group;
  /**
   * Turns the deck into the wind, re-reaches its haze and picks each chunk's
   * level. Call once a frame, after `sky.update` has set the fog's colour and
   * `main.ts` its distances.
   */
  update(time: Date, cameraPosition: THREE.Vector3, fog: THREE.Fog): void;
  /**
   * How much of the deck you can see: 1 is the world's own solid deck, less is a
   * veil, and under a hundredth the group is not drawn at all. For the start menu
   * only, which fades the deck out while you choose a country and a town (a cloud
   * over the coast hides the pin) and back in from space. It is a material
   * switch (transparent and one-sided), so the first call recompiles once.
   */
  setVeil(opacity: number): void;
  /**
   * How much a bank's deep middle darkens, 0 to 1: the weather's say in how the
   * deck looks (`weather-view.ts`). 0 is the white deck; 1 is a storm's,
   * `GREY_DEPTH` darker at a bank's heart.
   */
  setGrey(value: number): void;
  /**
   * The deck's shade on the ground, 0 to 1: `atlas.clouds.shadows = 0` turns the
   * shade off (the whole world's sun is then cut under a bank) and 1 is the shade.
   * For A/B, not a setting.
   */
  shadows: number;
  /** The shade's state: the bake's progress and cost, and the strength the shaders were handed. */
  readonly shade: { ready: boolean; rows: number; bakeMs: number; strength: number; share: number; weather: number };
  /**
   * The deck's shade at a world point, at the instant of the last `update`
   * and under its sun: `cloudShadeAt`, on the exact field and without the
   * strength. For the console and `pnpm graphics`' probe.
   */
  shadeAt(point: THREE.Vector3): CloudShadeSample;
  stats: CloudStats;
}
