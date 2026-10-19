/**
 * The streamers' phase, before the draw so what comes into range is drawn
 * this frame. They share one build allowance (`beginFrameBuild` to
 * `endFrameBuild` in `view.ts`), served in this order: the town underfoot
 * matters more than the road, the road more than the wood beside it. The
 * player says how far anything is; the camera says whether it is on screen.
 */
import * as THREE from 'three';
import { beginFrameBuild, endFrameBuild } from '../../view.ts';
import type { App } from '../context.ts';
import type { Tick } from './tick.ts';

/** Ms of the frame's build allowance the map tiles may take. */
const MAP_TILES_MS = 4;

export function createStreaming(app: App): (tick: Tick) => void {
  const { guard, player, rig, sky, fog, settlements, monuments, roads, vegetation, grass, countryMotion, life, airTraffic, railway, mapTiles, weather, sea, harbours } = app;
  /** What the player parts the grass with, rewritten each frame (`pressOf`). */
  const grassPress = { forward: new THREE.Vector3(), length: 0, width: 0 };
  const countryEye = new THREE.Vector3();
  return ({ dt, altitude, eyeOverGround }) => {
    beginFrameBuild();
    guard('settlements', () => settlements.update(player.position, altitude, rig.camera));
    // After the settlements: a landmark stands on its town's floor, re-seated the frame the floor is raised.
    guard('monuments', () => monuments.update(player.position, altitude, rig.camera, sky.state.time));
    guard('roads', () => roads.update(player.position, altitude, rig.camera));
    guard('harbours', () => harbours.update(dt, player.position, altitude));
    // Last, and the first to give ground when a frame is short.
    guard('vegetation', () => vegetation.update(player.position, altitude, rig.camera));
    // After the vegetation, whose keepouts it asks; hidden under the sea.
    guard('grass', () =>
      grass.update({
        camera: rig.camera,
        player: player.position,
        press: app.pressOf(player, grassPress),
        height: eyeOverGround,
        wind: weather.here().wind,
        hidden: sea.underwater,
      }),
    );
    guard('country', () => countryMotion.update(dt, rig.camera.getWorldPosition(countryEye), vegetation));
    // Movers run on the world's clock, not the machine's, so `atlas.sky.setRate` runs the traffic with the sun.
    guard('life', () => life.update(player.position, altitude, rig.camera, sky.state.time.getTime() / 1000));
    guard('air', () =>
      airTraffic.update({
        dt,
        seconds: sky.state.time.getTime() / 1000,
        camera: rig.camera,
        player: player.position,
        altitude,
        fogFar: fog.far,
        daylight: sky.state.daylight,
      }),
    );
    if (railway !== null) {
      guard('railway', () =>
        // A rider's train is drawn at the clock the rider was seated by.
        railway.update({ dt, seconds: app.trainRide.clock ?? sky.state.time.getTime() / 1000, camera: rig.camera, player: player.position, fogFar: fog.far }),
      );
    }
    // The disc's tiles out of the near allowance, the rest out of the far share's turn.
    guard('maptiles', () => mapTiles.pump(MAP_TILES_MS, true));
    // What this frame's building cost is charged to the next frame's far work.
    endFrameBuild();
  };
}
