/**
 * When the sun's shadow map is redrawn: every frame while anything in the
 * shadow box moves (the player, a vehicle, a walker, a herd, a gesture, the
 * wood in the wind), every `SHADOW_STILL_MS` otherwise, and at once when a
 * streamer changes what stands. Skipped while the fades have the shadow at
 * zero (night, or high up).
 */
import { SHADOW_COVER } from '../../sun.ts';
import type { App } from '../context.ts';

/** How often the shadow map is redrawn while nothing in the box moves, ms. */
const SHADOW_STILL_MS = 180;

export function createShadows(app: App): (now: number) => void {
  const { renderer, sky, player, monuments, settlements, vegetation, life, launchPads, railway, townsfolk, peers } = app;
  let drawnAt = -Infinity;
  let standingThen = -1;
  return (now) => {
    // One integer compare per group: a town arriving this frame should not stand shadowless.
    const standing =
      monuments.group.children.length +
      settlements.group.children.length +
      vegetation.group.children.length +
      life.group.children.length +
      launchPads.group.children.length +
      (railway?.group.children.length ?? 0);
    const moving =
      player.velocity > 0 ||
      player.emoting !== null ||
      life.stats.nearestMoving < SHADOW_COVER ||
      townsfolk.stats.nearestMoving < SHADOW_COVER ||
      (railway !== null && railway.stats.nearestMoving < SHADOW_COVER) ||
      (peers !== null && peers.nearestMoving < SHADOW_COVER) ||
      launchPads.stats.nearestMoving < SHADOW_COVER ||
      vegetation.stats.swaying;
    const cadence = moving ? 0 : SHADOW_STILL_MS;
    if (sky.state.shadow > 0 && (now - drawnAt >= cadence || standing !== standingThen)) {
      // The light moves only in a frame whose map is redrawn (`Sky.placeShadow`).
      sky.placeShadow();
      renderer.shadowMap.needsUpdate = true;
      drawnAt = now;
      standingThen = standing;
    }
  };
}
