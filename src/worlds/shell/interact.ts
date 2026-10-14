/** `E`: getting out, talking, boarding a craft or a rocket, and the prompt saying which; the keys shown in a rocket. */

import type { Hud } from '../../hud.ts';
import type { Input } from '../../input.ts';
import type { Cue } from '../../audio.ts';
import type { Rocket } from '../../rocket.ts';
import { ROCKET_KEYS } from './craft-hints.ts';
import { ICON_OF } from './tables.ts';
import type { Talking } from './talking.ts';
import type { ShellWorld } from './types.ts';

/** How near an alien has to be to be spoken to. */
const TALK_REACH = 7.5;

/** Returns `interact(state, inRocket)`, called every frame. */
export function createInteraction(deps: { world: ShellWorld; hud: Hud; talking: Talking; cue: (name: Cue) => void }): (state: Input['state'], inRocket: Rocket | null) => void {
  const { world, hud, talking, cue } = deps;
  const { spec, player, crowd } = world;
  const civ = spec.civilisation;
  /** Whether the rocket's keys are up. */
  let wasInRocket = false;
  /** Whether those keys are on the strip still: until out, or until it leaves the pad. */
  let rocketKeysUp = false;

  /** In a rocket: `E` gets out until it leaves the pad, `Space` held lights it. */
  function rocketKeys(state: Input['state'], inRocket: Rocket | null): void {
    if (inRocket !== null) {
      if (!wasInRocket) {
        wasInRocket = true;
        hud.showKeys(ROCKET_KEYS);
        rocketKeysUp = true;
      }
      // Off the pad `E` gets nobody out: the keys go with the clamps.
      if (inRocket.state !== 'boarded' && rocketKeysUp) {
        rocketKeysUp = false;
        hud.showKeys(null);
      }
      if (state.use && inRocket.state === 'boarded') {
        world.leaveRocket();
        cue('ui-click');
      }
      hud.setPrompt(inRocket.state === 'boarded' ? 'Get out' : null, 'walk');
    } else if (wasInRocket) {
      wasInRocket = false;
      if (rocketKeysUp) hud.showKeys(null);
      rocketKeysUp = false;
    }
  }

  /** `E`: get out; else whoever is nearer, somebody to talk to, a seat or a rocket; and the prompt saying which. */
  function interact(state: Input['state'], inRocket: Rocket | null): void {
    const afoot = player.craft === null && !player.airborne && inRocket === null;
    const walker = civ === null || !afoot ? null : crowd.nearest(player.position, TALK_REACH);
    // Never in mid-fall: out of an aircraft is out until the ground.
    const craft = player.craft === null && inRocket === null && !player.parachute ? world.craftInReach() : null;
    const rocket = afoot ? world.rocketInReach() : null;
    const rocketAway = rocket === null ? Infinity : rocket.position.distanceTo(player.position) - 4;
    const craftAway = craft === null ? Infinity : craft.position.distanceTo(player.position);
    const talkFirst = walker !== null && walker.mesh.position.distanceTo(player.position) < Math.min(craftAway, rocketAway);
    const rocketFirst = rocket !== null && !talkFirst && rocketAway < craftAway;
    const talkingTo = talking.current;
    if (inRocket !== null) {
      // The keys above handle it.
    } else if (state.use) {
      if (player.craft !== null) {
        player.leave();
        cue('ui-click');
      } else if (talkingTo !== null && (walker === null || walker === talkingTo)) talking.talkOn(talkingTo);
      else if (talkFirst) talking.say(walker!);
      else if (rocketFirst) {
        talking.stop();
        world.boardRocket(rocket!);
        cue('ui-confirm');
      } else if (craft !== null) {
        talking.stop();
        player.board(craft);
        cue('ui-confirm');
      }
    }

    // The prompt: what `E` would do here.
    if (inRocket !== null) {
      // Set above.
    } else if (player.craft !== null) hud.setPrompt('Get out', 'walk');
    else if (talking.current !== null) hud.setPrompt(talking.prompt(), 'talk');
    else if (talkFirst) hud.setPrompt('Talk', 'talk');
    else if (rocketFirst) hud.setPrompt('Board the rocket', 'sparkle');
    else if (craft !== null) hud.setPrompt('Drive', ICON_OF[craft.kind]);
    else hud.setPrompt(null);
  }

  return (state, inRocket) => {
    rocketKeys(state, inRocket);
    interact(state, inRocket);
  };
}
