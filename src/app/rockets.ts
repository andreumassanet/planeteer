/**
 * Riding a rocket from its pad: boarding, getting out, holding `Space` to
 * launch, and the cream curtain at the end of the climb, under which the
 * page goes to the solar system.
 */
import * as THREE from 'three';
import { toLatLon } from '../geo.ts';
import type { HintSet } from '../controls.ts';
import type { Rocket, RocketSound } from '../rocket.ts';
import type { App } from './context.ts';

/** The keys in a rocket on its pad, as on the other worlds (`ROCKET_KEYS` in `worlds/shell.ts`). */
const ROCKET_KEYS: HintSet = {
  id: 'rocket',
  once: false,
  sticky: true,
  hints: [
    { keys: ['jump'], label: 'Hold to launch' },
    { keys: ['use'], label: 'Get out' },
  ],
};

export interface Rockets {
  /** The rocket `E` would board this frame, decided with the prompt. */
  offer: Rocket | null;
  /** `Space` held for the player from the console (`atlas.rockets.ignite`), until he is out. */
  held: boolean;
  board(rocket: Rocket): void;
  /** Out of the rocket on its pad, beside its door; nothing once it has lifted. */
  leave(): void;
  /** The pads' frame: the launch, the keys leaving with the clamps, and the curtain. */
  update(dt: number): void;
}

export function createRockets(app: App): Rockets {
  const { launchPads, player, rig, groundAt, hud } = app;
  const { audio } = app.sound;
  const out = new THREE.Vector3();
  let curtain: HTMLDivElement | null = null;
  let gone = false;
  let keysUp = false;
  let sound: RocketSound | null = null;
  const soundOf = (): RocketSound | null => {
    if (sound === null && audio.output !== null && audio.bus !== null) sound = { context: audio.output.context, node: audio.bus };
    return sound;
  };

  const rockets: Rockets = {
    offer: null,
    held: false,
    board(rocket) {
      launchPads.board(rocket, player.object);
      if (launchPads.riding === null) return;
      hud.showKeys(ROCKET_KEYS);
      keysUp = true;
      audio.cue('ui-confirm');
    },
    leave() {
      if (!launchPads.leave(out)) return;
      const at = toLatLon(out);
      player.goTo(at.lat, at.lon);
      rig.snap(player, groundAt);
      hud.showKeys(null);
      keysUp = false;
      audio.cue('ui-click');
      rockets.held = false;
    },
    update(dt) {
      launchPads.update({
        dt,
        player: player.position,
        listener: rig.camera.position,
        hold: app.input.state.climb || rockets.held,
        effects: app.effects,
        sound: soundOf(),
      });
      const ride = launchPads.riding;
      // Off the pad `E` gets nobody out, so its keys go with the clamps.
      if (keysUp && ride !== null && ride.state !== 'boarded') {
        keysUp = false;
        hud.showKeys(null);
      }
      if (ride === null || ride.curtain <= 0) return;
      if (curtain === null) {
        curtain = document.createElement('div');
        curtain.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;background:radial-gradient(circle at 50% 42%,#fff2e8 0 35%,#fde6e1 100%)';
        document.body.appendChild(curtain);
      }
      curtain.style.opacity = ride.curtain.toFixed(3);
      if (ride.curtain >= 1 && !gone) {
        gone = true;
        app.toSolarSystem();
      }
    },
  };
  return rockets;
}
