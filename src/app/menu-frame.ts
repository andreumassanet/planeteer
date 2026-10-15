/**
 * What the world does while the menu draws it. The menu's camera is anywhere
 * from a few thousand units to a million away, so the fog, sky, clouds and
 * sea are re-aimed at it every frame; at the country and town stages the
 * world's streamers also build round it. When the player arrives, the world
 * gets its sky back.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { surfaceQuality } from '../graphics-quality.ts';
import { setSunDirection } from '../lights.ts';
import { beginFrameBuild, endFrameBuild, fogFar } from '../view.ts';
import type { App } from './context.ts';
import { STREAM_FLOOR } from './frame/haze.ts';

/** Time constant, s, of the cloud deck fading out at the country and town stages and back. */
const VEIL_LAG = 0.3;
/** Camera distance, in planet radii, past which the sky dome (six radii) is hidden. */
const DOME_EXIT = 5.5;

/** The sky dome's own `SPACE` colour (written without colour-space conversion), so leaving the dome is seamless. */
const SPACE_BACKGROUND = new THREE.Color().setRGB(0.016, 0.024, 0.055, THREE.SRGBColorSpace);

/** The sky dome and its sun and moon discs, which the menu hides as its camera leaves them. */
export interface SkyDiscs {
  dome: THREE.Object3D | undefined;
  sun: THREE.Object3D | undefined;
  moon: THREE.Object3D | undefined;
}

/**
 * Aims the world at the menu's camera each frame: fog, sky, clouds, sea.
 * The orrery draws the real Sun, so the sky's sun disc is hidden for the menu.
 */
export function installMenuSky(app: App): SkyDiscs {
  const { scene, fog, sky, clouds, ocean, menu, post, oceanLights } = app;
  const discs: SkyDiscs = {
    dome: scene.getObjectByName('sky'),
    sun: scene.getObjectByName('sun'),
    moon: scene.getObjectByName('moon'),
  };
  if (discs.sun !== undefined) discs.sun.visible = false;
  scene.background = SPACE_BACKGROUND;

  let veil = 1;
  let veiledAt = performance.now();
  menu.beforeRender = (camera) => {
    // The globe from the menu is far: none of the surfaces' detail would show, and all of it would cost.
    surfaceQuality.value = 0;
    const distance = camera.position.length();
    const altitude = Math.max(1, distance - PLANET_RADIUS);
    fog.near = Math.sqrt(2 * PLANET_RADIUS * altitude) * 0.2;
    fog.far = fogFar(altitude, PLANET_RADIUS);
    sky.update(camera.position.clone().setLength(PLANET_RADIUS), camera.position, altitude);
    setSunDirection(sky.state.sun, sky.state.solar.subsolarLon);
    clouds.update(sky.state.time, camera.position, fog);
    // No local weather over the whole globe.
    sky.weather.overcast = sky.weather.sunCut = sky.weather.flash = sky.weather.mist = 0;
    clouds.setGrey(0);
    // The orrery's space is depth 1 everywhere, which the shafts' mask would read as open sky.
    post.shafts.strength = 0;
    // The deck fades out while a country or town is being picked: it hides the map.
    const now = performance.now();
    const step = Math.min(0.1, (now - veiledAt) / 1000);
    veiledAt = now;
    const wanted = menu.stage === 'region' || menu.stage === 'site' ? 0 : 1;
    veil += (wanted - veil) * (1 - Math.exp(-step / VEIL_LAG));
    if (Math.abs(wanted - veil) < 0.01) veil = wanted;
    clouds.setVeil(veil);
    // Over another body's globe, Earth's sky is not the sky.
    const inside = distance < PLANET_RADIUS * DOME_EXIT && menu.body === 'earth';
    if (discs.dome !== undefined) discs.dome.visible = inside;
    if (discs.moon !== undefined) discs.moon.visible = inside && menu.stage !== 'region' && menu.stage !== 'site';
    // The sun's direction, not the light's position (which sits on the shadow box).
    oceanLights.sun.copy(sky.state.sun);
    oceanLights.moon.copy(sky.moon.position).normalize();
    oceanLights.lights[0].intensity = sky.sun.intensity;
    oceanLights.lights[1].intensity = sky.moon.intensity;
    ocean.update(camera.position, oceanLights.lights, sky.mood);
  };
  return discs;
}

/**
 * At the country and town stages, runs the world's streamers round the
 * menu's camera under the frame's build allowance, so the dive lands on the
 * towns, landmarks, roads and wood the menu showed. The camera never comes
 * below `STREAM_FLOOR`, so no town is built at near detail.
 */
export function installMenuStreamers(app: App): void {
  const { menu, settlements, monuments, roads, vegetation, cityLights, renderer, sky } = app;
  let failed = false;
  const skyFrame = menu.beforeRender;
  menu.beforeRender = (camera) => {
    skyFrame?.(camera);
    if (menu.body !== 'earth' || (menu.stage !== 'site' && menu.stage !== 'region')) return;
    const altitude = Math.max(STREAM_FLOOR, camera.position.length() - PLANET_RADIUS);
    const viewer = camera.position;
    beginFrameBuild();
    try {
      settlements.update(viewer, altitude, camera);
      monuments.update(viewer, altitude, camera, sky.state.time);
      roads.update(viewer, altitude, camera);
      vegetation.update(viewer, altitude, camera);
      cityLights.update(renderer);
    } catch (error) {
      // The menu goes on drawing the bare land.
      if (!failed) console.error('atlas: the menu\'s streamers failed', error);
      failed = true;
    }
    endFrameBuild();
  };
}

/** Undoes what the menu did to the sky. */
export function restoreWorldSky(app: App): void {
  const { skyDiscs } = app;
  app.clouds.setVeil(1);
  app.night.setMenu(false);
  if (skyDiscs.dome !== undefined) skyDiscs.dome.visible = true;
  if (skyDiscs.sun !== undefined) skyDiscs.sun.visible = true;
  if (skyDiscs.moon !== undefined) skyDiscs.moon.visible = true;
  app.scene.background = null;
}
