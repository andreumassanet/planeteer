// The sea floor round the player, and the clear water over it.
//
// The floor `sea-floor.ts` defines is drawn as a mesh on the cube sphere's tiles
// near the player, with the coral, kelp, seagrass, rocks and starfish standing on
// it, and a water surface over both that is exactly as clear as the water under
// it is shallow. Under the surface it is the underwater look: a blue haze, the
// light moving on the floor, and the surface seen from below.
//
// The sea (`ocean.ts`) is an opaque sphere with an opaque ribbon over it along
// every coast, and has to stay opaque: the sphere is inked, and a see-through
// fill shows its hull through itself. So round the player the two step aside
// inside a window (`seaWindow`) and this module draws the water there instead:
// the same colour, surf, height and glitter, but transparent and writing depth.
// At the window's edge the two hand over by the screen door, over water that is
// already opaque by then. It is built a slice at a time under `view.ts`'s frame
// allowance, and the window only opens over tiles that are ready.

import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS } from './globe.ts';
import { seaWindow } from './ocean.ts';
import { TILE_QUADS, prepareSeaFloor, seaDepthAt } from './sea-floor.ts';
import type { TileLife } from './sea-floor.ts';
import { proxyOf } from './warm.ts';
import { createBackdrop } from './seabed/backdrop.ts';
import {
  BAND,
  CAUSTIC_HIGH_FROM,
  CAUSTIC_HIGH_TO,
  CLEAR_FROM,
  CLEAR_HIGH_FROM,
  CLEAR_HIGH_TO,
  CLEAR_TO,
} from './seabed/constants.ts';
import { floorUniforms, waterUniforms } from './seabed/materials.ts';
import { createSlotBuffers } from './seabed/slots.ts';
import { createTileStreamer } from './seabed/streamer.ts';
import { createTileBuilder } from './seabed/tiles.ts';

export { DECOR_CAP } from './seabed/constants.ts';
export { decorFrame } from './seabed/slots.ts';

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface SeaFrame {
  /** The player: the window is centred here. */
  player: THREE.Vector3;
  /** The camera, world position. */
  camera: THREE.Vector3;
  /** `sky.state.daylight`, 0 to 1. */
  daylight: number;
  /** The scene's fog, which under the surface is the water's. */
  fog: THREE.Fog;
}

export interface SeaStats {
  enabled: boolean;
  active: boolean;
  underwater: boolean;
  /** The window's radius now, units: 0 is the opaque sea. */
  window: number;
  tiles: number;
  building: number;
  skipped: number;
  decor: number;
  triangles: number;
  /** Units under the surface the camera is, 0 above it. */
  cameraDepth: number;
  buildMs: number;
  updateMs: number;
}

export interface Sea {
  group: THREE.Group;
  /** Off leaves the sea as it was: opaque, no floor, no window. */
  enabled: boolean;
  /** Whether the camera is under the surface; the audio and the effects read it. */
  readonly underwater: boolean;
  /** How far under the surface the camera is, units. */
  readonly cameraDepth: number;
  readonly stats: SeaStats;
  update(dt: number, frame: SeaFrame): void;
  /** The radius of the floor under a point: what a diver, a submarine and an underwater camera stop on. */
  floorAt(point: THREE.Vector3): number;
  /** The life of the tiles standing now: what `sea-life.ts` swims. */
  eachLife(visit: (life: TileLife) => void): void;
  proxies(): THREE.Object3D[];
}

export function createSea(world: World): Sea {
  const group = new THREE.Group();
  group.name = 'sea floor';

  const slots = createSlotBuffers();
  const { floorMesh, decorMesh, waterMesh } = slots;
  group.add(floorMesh, decorMesh, waterMesh);
  const backdrop = createBackdrop();
  group.add(backdrop.mesh);
  const builder = createTileBuilder();

  const streamer = createTileStreamer(slots, builder);
  const { tiles } = streamer;
  let underwater = false;
  let cameraDepth = 0;
  // The coast index now, while the world is still loading, rather than in the
  // first frame that asks for it.
  prepareSeaFloor(world);
  let prepared = true;

  const unit = new THREE.Vector3();
  const playerPoint = new THREE.Vector3();

  const stats: SeaStats = {
    enabled: true,
    active: false,
    underwater: false,
    window: 0,
    tiles: 0,
    building: 0,
    skipped: 0,
    decor: 0,
    triangles: 0,
    cameraDepth: 0,
    buildMs: 0,
    updateMs: 0,
  };

  /** Whether the water surface is over this point rather than land. */
  function isWaterUnder(point: THREE.Vector3): boolean {
    unit.copy(point).normalize();
    return world.elevationAt(unit.multiplyScalar(PLANET_RADIUS)) <= 0.5;
  }

  /** Hands the window and the water's clearness the streamer's radius. */
  function applyWindow(frame: SeaFrame): void {
    const windowRadius = streamer.windowRadius;
    playerPoint.copy(frame.player).setLength(PLANET_RADIUS);
    seaWindow.uSeaCentre.value.copy(playerPoint);
    seaWindow.uSeaRadius.value = windowRadius;
    seaWindow.uSeaBand.value = BAND;
    waterUniforms.uClearFrom.value = windowRadius * CLEAR_FROM;
    waterUniforms.uClearTo.value = windowRadius * CLEAR_TO;
  }

  function updateStats(updateBegan: number): void {
    let standing = 0;
    let building = 0;
    let skipped = 0;
    let decor = 0;
    for (const tile of tiles.values()) {
      if (tile.state === 'ready') {
        standing++;
        decor += tile.lived?.decor.length ?? 0;
      } else if (tile.state === 'building') building++;
      else skipped++;
    }
    stats.underwater = underwater;
    stats.window = Math.round(streamer.windowRadius);
    stats.tiles = standing;
    stats.building = building;
    stats.skipped = skipped;
    stats.decor = decor;
    stats.triangles = standing * TILE_QUADS * TILE_QUADS * 4 + Math.round(decor * 24);
    stats.cameraDepth = Number(cameraDepth.toFixed(2));
    stats.buildMs = Number(streamer.buildMs.toFixed(2));
    stats.updateMs = performance.now() - updateBegan;
  }

  const sea: Sea = {
    group,
    enabled: true,
    get underwater() {
      return underwater;
    },
    get cameraDepth() {
      return cameraDepth;
    },
    stats,
    update(dt, frame) {
      const began = performance.now();
      stats.enabled = sea.enabled;
      if (!sea.enabled) {
        seaWindow.uSeaRadius.value = 0;
        group.visible = false;
        underwater = false;
        cameraDepth = 0;
        stats.updateMs = performance.now() - began;
        return;
      }
      group.visible = true;
      if (!prepared) {
        prepareSeaFloor(world);
        prepared = true;
      }
      floorUniforms.uFloorTime.value = (floorUniforms.uFloorTime.value + dt) % 6283.19;

      // Under the surface is a question about the camera, not the player: a
      // diver's camera a body behind him can still be above the water.
      const cameraRadius = frame.camera.length();
      cameraDepth = Math.max(0, PLANET_RADIUS + 0.3 - cameraRadius);
      underwater = cameraDepth > 0 && seaDepthAt(frame.camera) > 0 && isWaterUnder(frame.camera);
      if (!underwater) cameraDepth = 0;

      streamer.refreshActive(dt, frame.player, cameraRadius, underwater);
      stats.active = streamer.active;
      streamer.refreshTiles(dt, frame.player);
      streamer.build();
      streamer.updateWindow(dt, frame.player);
      applyWindow(frame);
      const windowRadius = streamer.windowRadius;

      const over = Math.max(0, cameraRadius - PLANET_RADIUS);
      waterUniforms.uClarity.value = 1 - smoothstep(CLEAR_HIGH_FROM, CLEAR_HIGH_TO, over);
      const shown = windowRadius > 0 || underwater;
      floorMesh.visible = shown;
      decorMesh.visible = shown;
      waterMesh.visible = windowRadius > 0;
      // From above the caustics fade with height: a swimmer sees the light on the
      // sand, the plane going over does not see a net over the whole reef.
      floorUniforms.uCaustic.value = clamp(frame.daylight, 0, 1) * (underwater ? 1.2 : 1 - 0.85 * smoothstep(CAUSTIC_HIGH_FROM, CAUSTIC_HIGH_TO, over));
      floorUniforms.uAbove.value = underwater ? 0 : 1;

      backdrop.mesh.visible = underwater;
      if (underwater) backdrop.paint(frame.camera, frame.daylight, cameraDepth, frame.fog, waterUniforms.uUnder.value);
      updateStats(began);
    },
    floorAt(point) {
      if (!prepared) {
        prepareSeaFloor(world);
        prepared = true;
      }
      return PLANET_RADIUS - seaDepthAt(point);
    },
    eachLife(visit) {
      for (const tile of tiles.values()) if (tile.state === 'ready' && tile.lived !== null) visit(tile.lived);
    },
    proxies() {
      return [
        proxyOf(floorMesh.material as THREE.Material),
        proxyOf(decorMesh.material as THREE.Material),
        proxyOf(waterMesh.material as THREE.Material),
        // The haze's backdrop, drawn only under the surface: the first dive's.
        proxyOf(backdrop.mesh.material),
      ];
    },
  };

  return sea;
}
