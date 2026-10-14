/** `E` beside an alien: the bubble, the line written in their script and said in their voice. */

import * as THREE from 'three';
import type { WorldHost } from '../../world-host.ts';
import type { WorldSpec } from '../contract.ts';
import type { Crowd, Walker } from '../aliens.ts';
import type { WorldPlayer } from '../player.ts';
import type { WorldRig } from '../camera.ts';
import type { Settlements, Site } from '../settlements.ts';
import { scriptOf, svgOf } from '../glyphs.ts';
import { lineOf, voiceFor } from '../speech.ts';
import type { Line } from '../speech.ts';
import { createBubble } from '../../talk.ts';
import { planSpeech, revealed, speak } from '../../voice.ts';
import type { Speech, Utterance } from '../../voice.ts';
import type { Cue } from '../../audio.ts';
import { svgNode } from './text.ts';

/** How far you may walk off from an alien before it stops talking. */
const TALK_LEAVE = 14;
/** A line stays this long after it has been said, s. */
const LINE_HOLD = 6;
/** The phrasebook's round: greet, world, visitor, farewell; after the fourth the conversation is over. */
export const ROUND = 4;

export interface Talking {
  /** Who the traveller is talking to, if anyone. */
  readonly current: Walker | null;
  say(walker: Walker): void;
  stop(): void;
  /** `E` while talking: the rest of the line at once, else the next one, and after the farewell, nothing. */
  talkOn(walker: Walker): void;
  /** What `E` would do now: `Goodbye` after the last line has been said, else `Next`. */
  prompt(): 'Goodbye' | 'Next';
  /** Types the line out in step with the voice, places the bubble over the speaker, ends it when it is held long enough. */
  update(dt: number): void;
  dispose(): void;
}

export function createTalking(deps: {
  host: WorldHost;
  spec: WorldSpec;
  radius: number;
  settlements: Settlements;
  crowd: Crowd;
  player: WorldPlayer;
  rig: WorldRig;
  cue: (name: Cue) => void;
}): Talking {
  const { host, spec, radius: R, settlements, crowd, player, rig, cue } = deps;
  const body = spec.body;
  const civ = spec.civilisation;
  const script = civ === null ? null : scriptOf(civ.script);
  const bubble = createBubble();
  let talking: Walker | null = null;
  let line: Line | null = null;
  let lineTime = 0;
  let speech: Speech | null = null;
  let utterance: Utterance | null = null;
  let lastShown = -1;
  const head = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const nationName = (id: string): string => body.nations.find((one) => one.id === id)?.name ?? body.name;
  const speakerOf = (walker: Walker): string => `${civ?.species.name ?? ''} · ${walker.site.name}`;

  function nearestOther(site: Site): string {
    let best = Infinity;
    for (const other of settlements.sites) {
      if (other === site || other.landmark) continue;
      best = Math.min(best, Math.acos(Math.min(1, site.dir.dot(other.dir))) * R);
    }
    const km = (best / R) * body.radiusKm;
    return Number.isFinite(km) ? `${Math.round(km).toLocaleString('en')} km` : 'very far';
  }

  function say(walker: Walker): void {
    if (civ === null || script === null) return;
    utterance?.stop();
    if (talking !== null && talking !== walker) talking.facing = null;
    talking = walker;
    walker.facing = player.position;
    line = lineOf(civ, script, walker.key, walker.turn, {
      place: walker.site.name,
      nation: nationName(walker.site.nation),
      body: body.name,
      species: civ.species.name,
      distance: nearestOther(walker.site),
    });
    walker.turn++;
    lineTime = 0;
    lastShown = -1;
    const voice = voiceFor(civ.voice, walker.key);
    speech = planSpeech(line.written.said, voice, `${walker.key}:${walker.turn}`);
    const out = host.settings?.sound?.voices?.get() === false ? null : host.sound();
    utterance = out === null ? null : speak(out.context, out.node, speech, voice, 0.9);
    // And the traveller turns to them, as they turn to the traveller.
    crowd.headOf(walker, head).sub(player.position);
    const up = player.position.clone().normalize();
    head.addScaledVector(up, -head.dot(up));
    if (head.lengthSq() > 1e-4) player.facing.copy(head.normalize());
    cue('ui-open');
  }

  function stop(): void {
    utterance?.stop();
    utterance = null;
    if (talking !== null) talking.facing = null;
    if (talking !== null) cue('ui-close');
    talking = null;
    line = null;
    speech = null;
    bubble.hide();
  }

  return {
    get current() {
      return talking;
    },
    say,
    stop,
    talkOn(walker) {
      if (line !== null && speech !== null && lineTime < speech.duration) {
        lineTime = speech.duration;
        return;
      }
      if (walker.turn % ROUND === 0) {
        stop();
        return;
      }
      say(walker);
    },
    prompt() {
      return talking !== null && talking.turn % ROUND === 0 && lineTime >= (speech?.duration ?? 0) ? 'Goodbye' : 'Next';
    },
    update(dt) {
      if (talking === null || line === null || speech === null || script === null) return;
      lineTime += dt;
      const fraction = speech.length === 0 ? 1 : revealed(speech, lineTime) / speech.length;
      const shown = Math.round(fraction * line.written.length) + (fraction >= 1 ? 1 : 0);
      if (shown !== lastShown) {
        lastShown = shown;
        bubble.show(speakerOf(talking), svgNode(svgOf(script, line.written, { shown })), fraction >= 1 ? `≈ ${line.english}` : '', {
          action: talking.turn % ROUND === 0 ? 'Goodbye' : 'Next',
        });
      }
      crowd.headOf(talking, head);
      projected.copy(head).project(rig.camera);
      bubble.place((projected.x * 0.5 + 0.5) * innerWidth, (-projected.y * 0.5 + 0.5) * innerHeight, projected.z < 1);
      if (lineTime > speech.duration + LINE_HOLD || talking.mesh.position.distanceTo(player.position) > TALK_LEAVE) stop();
    },
    dispose() {
      bubble.dispose();
    },
  };
}
