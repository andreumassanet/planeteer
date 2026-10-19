/**
 * The player: created once the avatar's model has arrived, standing on the
 * drawn land, the made surfaces and the sea floor, and kept out of the walls.
 */
import * as THREE from 'three';
import { createPlayer } from '../player.ts';
import type { Player, PlayerEvent } from '../player.ts';
import { unitAt } from '../sphere.ts';
import type { App } from './context.ts';

export async function createHero(app: App): Promise<Player> {
  const { world, start, groundAt, walls, sea, effects } = app;
  const { audio } = app.sound;
  await app.avatarReady;
  app.landProbe.prime(unitAt(start.lat, start.lon, new THREE.Vector3()));
  const player = createPlayer(world, start.lat, start.lon, {
    groundAt,
    madeHeightAt: (point) => walls.madeHeightAt(point),
    seaFloorAt: (point) => sea.floorAt(point),
    onStep: (weight) => {
      audio.step(app.footing, weight);
      effects.step(weight);
    },
    // A jump lands at about its take-off speed; stepping off a kerb does not.
    onTouchdown: (speed) => {
      if (speed > 12) audio.cue('land');
      effects.touchdown(speed);
    },
    collide: walls.collide,
    collideAloft: walls.collideAloft,
    freeSpotNear: (point, radius, out) => walls.freeSpotNear(point, radius, out),
    // Only what the HUD does not already say: a landing refused, and why.
    onEvent: (event: PlayerEvent, strength: number) => {
      effects.event(event, strength);
      const rotor = player.ride?.model.kind === 'helicopter';
      if (event === 'water-refused') {
        app.announce(rotor ? 'A helicopter cannot set down on water — find land' : 'A plane cannot land on water — find a field', rotor ? 'heli' : 'plane');
        audio.cue('ui-error');
      } else if (event === 'steep-refused') {
        app.announce('Too steep to land here — find flatter ground', rotor ? 'heli' : 'plane');
        audio.cue('ui-error');
      } else if (event === 'travel' || event === 'aerobatics') {
        app.announce(event === 'travel' ? 'Travel flight — climb to see the map' : 'Aerobatics — I K pitch, J L roll', 'plane');
      } else if (event === 'landed' || event === 'foundered') audio.cue('land');
      // A car into a wall: the landing's thud, and the camera knocked.
      else if (event === 'crashed') {
        audio.cue('land');
        app.rig.shake(app.crashStrength(strength));
      }
    },
  });
  app.scene.add(player.object);
  return player;
}
