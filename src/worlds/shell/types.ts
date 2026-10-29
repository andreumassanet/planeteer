/** The shell's contract with the world that builds it. */

import type * as THREE from 'three';
import type { WorldHost } from '../../world-host.ts';
import type { WorldSpec } from '../contract.ts';
import type { Geography } from '../../system/geography.ts';
import type { PlanetSurface } from '../../planet.ts';
import type { Terrain } from '../terrain.ts';
import type { Ground } from '../tiles.ts';
import type { Sky } from '../sky.ts';
import type { Settlements } from '../settlements.ts';
import type { Crowd } from '../aliens.ts';
import type { Craft } from '../craft.ts';
import type { WorldPlayer } from '../player.ts';
import type { WorldRig } from '../camera.ts';
import type { Input } from '../../input.ts';
import type { Frontiers } from '../frontiers.ts';
import type { Hud } from '../../hud.ts';
import type { WorldMap } from '../../map.ts';
import type { MapTiles } from '../../map-tiles.ts';
import type { SceneryContext } from '../../scenery/contract.ts';
import type { Rocket } from '../../rocket.ts';

/** Everything of the world the shell reads, as `index.ts` builds it. */
export interface ShellWorld {
  host: WorldHost;
  spec: WorldSpec;
  geography: Geography;
  surface: PlanetSurface;
  terrain: Terrain;
  scene: THREE.Scene;
  ctx: SceneryContext;
  player: WorldPlayer;
  rig: WorldRig;
  sky: Sky;
  ground: Ground;
  frontiers: Frontiers;
  settlements: Settlements;
  crowd: Crowd;
  crafts: readonly Craft[];
  /** The roads between the towns, as the map draws them (`Roads.lines`). */
  roadLines(): readonly { cls: number; points: readonly (readonly [number, number])[] }[];
  /** And at their carriageways' half-widths, for the maps' tiles (`Roads.halfOf`). */
  roadRibbons(): readonly { half: number; points: readonly (readonly [number, number])[] }[];
  /**
   * Every rocket's pad, one a town (`padOf`), and every saucer parked off a
   * town's corner (`ufoParkingOf`), as points on the sphere: what both maps
   * mark them at, as Earth's mark its pads.
   */
  pads: readonly { id: string; at: THREE.Vector3 }[];
  saucers: readonly { id: string; at: THREE.Vector3 }[];
  input: Input;
  /** Ground height over the radius under a point of any length. */
  groundAt(point: THREE.Vector3): number;
  /** The nearest craft in reach to board, or null. */
  craftInReach(): Craft | null;
  /** Stands the traveller at a place (a town's own arrival when it is in one) and builds the ground there. */
  jumpTo(lat: number, lon: number): void;
  /** Where this visit began. */
  home: { lat: number; lon: number; name: string };
  /** The world's own teardown, which ends in `host.exit`: back to the solar system, or on to the title. */
  leave(to?: 'system' | 'title'): void;
  /** The parked rocket near enough to get into, or null (`rocket.ts`). */
  rocketInReach(): Rocket | null;
  /** The rocket the traveller is in, or null. */
  riding(): Rocket | null;
  boardRocket(rocket: Rocket): void;
  /** Out of the rocket, if it has not left the pad. */
  leaveRocket(): void;
}

export interface Shell {
  /** The world's clock: the host's real one, turned by the settings, `/time` and the time lapse. */
  date(): Date;
  /** Every frame, after the world has moved and before it is drawn. */
  update(dt: number): void;
  /** Every frame, straight after the draw: the photo, the frame counter. */
  drawn(updateMs: number, drawMs: number): void;
  readonly hud: Hud;
  /** The maps' paper (`map-tiles.ts`), `atlasWorld.mapTiles` on the console. */
  readonly mapTiles: MapTiles;
  /** The sheet behind `M`, `atlasWorld.map` on the console. */
  readonly map: WorldMap;
  /** Paints the maps' tiles out of the frame's allowance: called inside the frame's building, before `endFrameBuild`. */
  pumpTiles(): void;
  dispose(): void;
}
