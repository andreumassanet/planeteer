/**
 * The player: created once the avatar's model has arrived, standing on the
 * drawn land, the made surfaces and the sea floor, and kept out of the walls.
 */
import * as THREE from 'three';
import { createPlayer } from '../player.ts';
import type { Player, PlayerEvent } from '../player.ts';
import { unitAt } from '../sphere.ts';
import { BREAKABLE } from '../breakables.ts';
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
    windAt: () => app.weather.here().wind,
    onSplash: (point, reach) => effects.splashAt(point, reach),
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
    strike: (from, to, radius, velocity, punch) => walls.strike(from, to, radius, velocity, punch),
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
      // Something small knocked over: a knock of the camera by how hard it was; the prop's own sound comes with it.
      else if (event === 'broke') app.rig.shake(Math.min(0.45, strength * 1.5));
      // A drift's boost paid: a kick of the camera by its tier.
      else if (event === 'boosted') app.rig.shake(0.1 + 0.08 * strength);
    },
  });
  // What a knocked-over prop sounds and looks like, and its landing.
  app.onBreak = (knock) => {
    const rule = BREAKABLE[knock.kind];
    audio.knock(rule.voice, 1);
    effects.dustAt(knock.point, Math.max(1, knock.height * 0.3), 6);
    if (rule.burst === 'leaves') effects.leavesAt(knock.point, knock.hex, knock.height, Math.round(8 + knock.height * 2));
    else if (rule.burst === 'sparks') effects.sparksAt(knock.point, knock.facing, 8);
    else if (rule.burst === 'splinters') effects.leavesAt(knock.point, knock.hex, knock.height * 0.5, 6);
  };
  app.onLand = (point, kind, weight) => {
    audio.knock(BREAKABLE[kind].voice === 'metal' ? 'metal' : 'soft', weight * 0.5);
    effects.dustAt(point, 1 + weight * 2, Math.round(3 + weight * 5));
  };
  app.scene.add(player.object);
  return player;
}
