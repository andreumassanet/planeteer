/**
 * The frame loop, in phases whose order matters: movement and the camera,
 * the sky and weather, the ear, the haze, the streamers, the people and
 * vehicles, the water, the HUD's offers, the maps and the map layer, the
 * shadow map, the near lights, the draw, and last the badge and passport.
 * Each subsystem's update runs inside `app.guard`.
 */
import { setSunDirection } from '../lights.ts';
import type { App } from './context.ts';
import { createActors } from './frame/actors.ts';
import { createDraw } from './frame/draw.ts';
import { updateHaze } from './frame/haze.ts';
import { createMovement } from './frame/movement.ts';
import { createNearLights } from './frame/near-lights.ts';
import { createPrompts } from './frame/prompts.ts';
import { createShadows } from './frame/shadows.ts';
import { createSoundPhase } from './frame/soundscape.ts';
import { createStreaming } from './frame/streaming.ts';
import { createFrameStats } from './frame/stats.ts';
import type { Tick } from './frame/tick.ts';
import { createWater } from './frame/water.ts';
import { createBadgePhase, createMapsPhase } from './frame/whereabouts.ts';

/**
 * With nobody at the keyboard or mouse for this long, the loop draws at
 * about 30 fps; any input restores the full rate on the next frame.
 * `IDLE_FRAME_MS` sits just under 33.3 so a 60 Hz display draws every other frame.
 */
const IDLE_AFTER_MS = 60_000;
const IDLE_FRAME_MS = 30;

/** Builds every phase and fills `app.frameStats`; call the returned function to start the loop. */
export function createLoop(app: App): () => void {
  const { renderer, rig, player, sky, input, guard } = app;
  let previous = performance.now();
  app.frameStats = createFrameStats(previous);
  const tick: Tick = {
    now: 0, dt: 0, interval: 0, idle: false, frameStart: 0, ground: 0, eyeOverGround: 0, altitude: 0,
    standingIn: 0, nearbyPlace: app.places.nearest(player.position), here: { lat: 0, lon: 0 },
  };
  const movement = createMovement(app);
  const soundPhase = createSoundPhase(app);
  const streaming = createStreaming(app);
  const actors = createActors(app);
  const water = createWater(app);
  const prompts = createPrompts(app);
  const mapsPhase = createMapsPhase(app);
  const shadows = createShadows(app);
  const nearLights = createNearLights(app);
  const draw = createDraw(app);
  const badge = createBadgePhase(app);

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const idle = !input.looking && now - input.lastActive > IDLE_AFTER_MS;
    if (idle && now - previous < IDLE_FRAME_MS) return;
    tick.frameStart = performance.now();
    renderer.info.reset();
    // The first rAF timestamp can precede the `performance.now()` taken before
    // it was requested; a negative `dt` would run every chase backwards.
    tick.interval = Math.max(0, now - previous);
    tick.dt = Math.min(tick.interval / 1000, 0.1);
    tick.now = now;
    tick.idle = idle;
    app.frameStats.interval(now, previous);
    previous = now;

    movement(tick);
    // The sky needs where the player stands (the hour) and the camera's height over that ground (the shadow fade).
    tick.ground = app.groundAt(player.position);
    tick.eyeOverGround = rig.camera.position.length() - tick.ground;
    sky.update(player.position, rig.camera.position, tick.eyeOverGround);
    // Every light asks the sun's elevation at its own position, in the shaders.
    setSunDirection(sky.state.sun, sky.state.solar.subsolarLon);
    guard('city lights', () => app.cityLights.update(renderer));
    // Before the haze, which it closes in rain and fog (`setWeatherHaze`).
    guard('weather', () => app.weather.update(tick.dt, sky.state.time, player.position, tick.ground, rig.camera, sky.state.daylight));
    soundPhase(tick);
    tick.altitude = updateHaze(app, tick);
    streaming(tick);
    actors(tick);
    water(tick);
    prompts(tick);
    mapsPhase(tick);
    app.overlay.update(tick);
    shadows(now);
    nearLights(now);
    draw(tick);
    badge(tick);
  }

  return () => {
    console.log(`atlas ready in ${Math.round(performance.now() - app.began)} ms`);
    app.loopStarted = performance.now();
    requestAnimationFrame(frame);
  };
}
