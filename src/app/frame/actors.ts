/**
 * The frame's people and vehicles, after the streamers they stand on: the
 * sound of what passes, the townsfolk and any conversation, the fleet, the
 * rockets, the other players, the horns, the effects and the small life.
 */
import type { PassingSound } from '../../passing-sound.ts';
import type { App } from '../context.ts';
import type { Tick } from './tick.ts';

export function createActors(app: App): (tick: Tick) => void {
  const { guard, player, rig, sky, airTraffic, railway, passingSound, townsfolk, signalLamps, conversation, fleet, rockets, peers, horns, effects, ambient, weather } = app;
  const passingVoices: Parameters<PassingSound['update']>[1] = {};
  // The townsfolk keep their own clock: breathing does not speed up with `setRate`.
  let townsfolkClock = 0;
  let townsfolkFrame = 0;
  const ambientFrame = {
    player: player.position, cameraHeight: 0, time: sky.state.time, daylight: 1, afloat: false,
  };
  const ambientWeather = () => weather.here();
  return ({ dt, eyeOverGround }) => {
    passingVoices.prop = airTraffic.passing.prop;
    passingVoices.rotor = airTraffic.passing.rotor;
    passingVoices.jet = airTraffic.passing.jet;
    passingVoices.rail = railway?.passing ?? null;
    guard('passing', () => passingSound.update(app.sound.audio.bus, passingVoices));
    townsfolkClock += dt;
    const worldClock = sky.state.time.getTime() / 1000;
    guard('townsfolk', () => townsfolk.update(player.position, dt, townsfolkClock, ++townsfolkFrame, worldClock));
    guard('signals', () => signalLamps.update(player.position, worldClock));
    // After whoever is in it has moved.
    guard('talk', () => conversation.update());
    // After everything they stand on, and before the other players, who may sit in them.
    guard('fleet', () => fleet.update(dt, rig.camera));
    guard('rockets', () => rockets.update(dt));
    if (peers !== null) guard('peers', () => peers.update(dt, player));
    // A held horn is let go with the seat or the keyboard; others' follow their players.
    guard('horns', () => {
      const now = performance.now();
      horns.key.update(now, horns.inHand());
      horns.chorus.update(now, horns.near);
    });
    // After everything that moves, so a wake starts where the boat now is.
    guard('effects', () => effects.update(dt, player, rig.camera));
    ambientFrame.cameraHeight = eyeOverGround;
    ambientFrame.time = sky.state.time;
    ambientFrame.daylight = sky.state.daylight;
    ambientFrame.afloat = player.state === 'swim' || player.ride?.model.medium === 'water';
    guard('ambient', () => ambient.update(dt, ambientFrame, ambientWeather));
  };
}
