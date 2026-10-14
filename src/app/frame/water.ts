/**
 * The cloud deck, the sea's surface and the sea floor with what swims there.
 * The deck turns on the sun's clock, so scrubbing the time scrubs the sky.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../../avatar.ts';
import type { TileLife } from '../../sea-floor.ts';
import type { Sea } from '../../seabed.ts';
import type { App } from '../context.ts';
import type { Tick } from './tick.ts';

export function createWater(app: App): (tick: Tick) => void {
  const { guard, player, rig, sky, fog, clouds, ocean, oceanLights, sea, seaLife, weather } = app;
  const seaFrame: Parameters<Sea['update']>[1] = { player: new THREE.Vector3(), camera: new THREE.Vector3(), daylight: 1, fog };
  const seaLifeFrame = {
    camera: new THREE.Vector3(),
    seconds: 0,
    diver: null as THREE.Vector3 | null,
    screw: null as THREE.Vector3 | null,
    screwSpeed: 0,
  };
  let oceanHidden = false;
  const diverHead = new THREE.Vector3();
  const subScrew = new THREE.Vector3();
  const eachSeaLife = (visit: (life: TileLife) => void): void => sea.eachLife(visit);

  return ({ dt }) => {
    guard('clouds', () => clouds.update(sky.state.time, rig.camera.position, fog));
    // The sea takes whichever body is lighting it: the sun's path by day, the moon's at night.
    oceanLights.sun.copy(sky.state.sun);
    oceanLights.moon.copy(sky.moon.position).normalize();
    oceanLights.lights[0].color = sky.sun.color;
    oceanLights.lights[0].intensity = sky.sun.intensity;
    oceanLights.lights[1].color = sky.moon.color;
    oceanLights.lights[1].intensity = sky.moon.intensity;
    guard('ocean', () => ocean.update(rig.camera.position, oceanLights.lights));
    // After the fog, which it takes over under the surface, and the ocean, whose window it opens.
    guard('sea', () => {
      seaFrame.player = player.position;
      seaFrame.camera = rig.camera.position;
      seaFrame.daylight = sky.state.daylight;
      sea.update(dt, seaFrame);
      // Seen from below, the sea's ink would draw a black ceiling and the rain
      // box would fall round a diver, so both are hidden while underwater.
      if (sea.underwater !== oceanHidden) {
        oceanHidden = sea.underwater;
        ocean.group.visible = !oceanHidden;
        weather.group.visible = !oceanHidden;
      }
    });
    guard('sea life', () => {
      seaLifeFrame.camera.copy(rig.camera.position);
      seaLifeFrame.seconds = sky.state.time.getTime() / 1000;
      const diving = player.state === 'swim' && player.depth > 0.6;
      seaLifeFrame.diver = diving
        ? diverHead.copy(player.position).addScaledVector(player.forward, AVATAR_HEIGHT * 0.3).addScaledVector(player.up, -player.sink * 0.5)
        : null;
      const sub = player.ride?.model.kind === 'submarine' && player.depth > 1.2 ? player.ride.model : null;
      seaLifeFrame.screw = sub !== null ? subScrew.copy(player.position).addScaledVector(player.forward, -sub.size[0] * 0.5) : null;
      seaLifeFrame.screwSpeed = sub !== null ? player.velocity : 0;
      seaLife.update(dt, seaLifeFrame, eachSeaLife);
    });
  };
}
