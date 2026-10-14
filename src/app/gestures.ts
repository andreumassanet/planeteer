/**
 * Waves, dances and benches. A gesture shows on the hero at once and is
 * sent to the others at most once per `EMOTE_INTERVAL_MS` (the relay's pace).
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { BENCH_REACH } from '../bench.ts';
import type { Bench } from '../bench.ts';
import { EMOTE_INTERVAL_MS } from '../../server/src/limits.ts';
import type { Emote } from '../../server/src/limits.ts';
import type { App } from './context.ts';

/**
 * Ms after sitting down before the others are told: the step onto the seat
 * must reach them first, or their copy sees the body moving and stands it up.
 */
const SIT_ANNOUNCE_MS = 700;

export interface Gestures {
  /** The bench `E` would sit you on this frame. */
  benchOffer: Bench | null;
  /** Plays a gesture and tells the others; false when the hero cannot (not standing on the ground). */
  gesture(name: Emote): boolean;
  /** The nearest sitter's spot within `BENCH_REACH`: towns', the countryside's and stations'. */
  nearestBench(): { bench: Bench; distance: number } | null;
  sitDown(bench: Bench): void;
}

export function createGestures(app: App): Gestures {
  const { player, settlements, vegetation, railway } = app;
  let gesturedAt = -Infinity;
  function tellGesture(name: Emote): void {
    const now = performance.now();
    if (now - gesturedAt >= EMOTE_INTERVAL_MS && app.peers?.send({ t: 'emote', e: name }) === true) gesturedAt = now;
  }

  const benchesHere: Bench[] = [];
  const benchUp = new THREE.Vector3();
  let sitTimer = 0;

  return {
    benchOffer: null,
    gesture(name) {
      if (!player.emote(name)) return false;
      tellGesture(name);
      return true;
    },
    nearestBench() {
      benchesHere.length = 0;
      settlements.benchesNear(player.position, BENCH_REACH + 2, benchesHere);
      vegetation.countryside?.benchesNear(benchUp.copy(player.position).normalize(), BENCH_REACH + 2, benchesHere);
      railway?.benchesNear(player.position, BENCH_REACH + 2, benchesHere);
      let best: Bench | null = null;
      let bestDistance = BENCH_REACH;
      for (const bench of benchesHere) {
        const distance = bench.position.angleTo(player.position) * PLANET_RADIUS;
        if (distance < bestDistance) [best, bestDistance] = [bench, distance];
      }
      return best === null ? null : { bench: best, distance: bestDistance };
    },
    sitDown(bench) {
      if (!player.sitOn(bench.position, bench.facing, bench.sink)) return;
      app.sound.audio.cue('ui-toggle');
      window.clearTimeout(sitTimer);
      // Sitting goes on the wire as the `sit` gesture, once the body has settled.
      sitTimer = window.setTimeout(() => {
        if (player.sitting) tellGesture('sit');
      }, SIT_ANNOUNCE_MS);
    },
  };
}
