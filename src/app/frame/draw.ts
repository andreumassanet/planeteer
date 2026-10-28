/**
 * The draw: light shafts at a low sun, the scene through the post chain, a
 * photo if one was asked for, and the frame's cost handed to the automatic
 * detail knob and the stats.
 */
import { chosenQuality, surfaceQuality } from '../../graphics-quality.ts';
import { shaftLight, shaftStrength } from '../../shafts.ts';
import { sampleFrame, skipFrame } from '../../view.ts';
import type { App } from '../context.ts';
import { savePhoto } from '../photo.ts';
import type { Tick } from './tick.ts';

/** From an aircraft aloft the far blur focuses this many times the lens's height over the ground away. */
const AIR_FOCUS = 1.5;

export function createDraw(app: App): (tick: Tick) => void {
  const { post, sky, rig, player, sea, renderer, scene, map, hud, frameStats } = app;
  return (tick) => {
    const { now, interval, idle, frameStart } = tick;
    // The hero is the nearest thing to the camera, so nothing nearer casts a ray.
    surfaceQuality.value = chosenQuality.value;
    post.shafts.direction.copy(sky.state.sun);
    post.shafts.subject = rig.camera.position.distanceTo(player.position);
    // Focused on the body near the ground; from an aircraft aloft, on the land under the lens.
    post.focused = true;
    post.focusAt = player.ride !== null && player.airborne ? Math.max(post.shafts.subject, tick.eyeOverGround * AIR_FOCUS) : null;
    shaftLight(sky.sun, post.shafts.color);
    post.shafts.strength = shaftStrength({
      elevation: sky.state.elevation,
      overcast: sky.weather.overcast,
      mist: sky.weather.mist,
      space: sky.state.space,
      underwater: sea.underwater,
    });

    // The map behind `M` is opaque, so the world under it is not drawn.
    const underMap = map.open;
    const drawStart = performance.now();
    if (!underMap) post.render(scene, rig.camera);
    const drawEnd = performance.now();
    if (app.photoWanted) {
      app.photoWanted = false;
      if (underMap) app.announce('Close the map to take a photo', 'camera');
      else savePhoto(app, renderer.domElement);
    }
    // Not before the curtain is up, under the map (no draw would read as
    // headroom), or while idling at half rate on purpose.
    if (app.curtain === null && !underMap && !idle) sampleFrame(interval, drawEnd - frameStart);
    else if (app.curtain === null) skipFrame();
    const sampled = frameStats.sample(now, drawStart - frameStart, drawEnd - drawStart, renderer);
    if (sampled && app.performanceOn) hud.showPerformance(frameStats.stats);
  };
}
