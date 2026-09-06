/**
 * The review sheet for `src/menu.ts`, at `/menu-sheet.html`.
 *
 * **It is not the game's load order and it must not become a second copy of
 * one.** `main.ts` owns the sequence — the monuments before the terrain, the
 * places before the mesh, `Promise.all` over the four data files — and this
 * sheet boots the *smallest* world the menu is allowed to be reviewed against:
 * the outlines, the sea, the land, the sky and the weather. Everything after
 * that in `main.ts` is streamers and kits that build nothing until a player
 * exists, and none of it is on the screen from 2.47 radii out.
 *
 * What it is for is the same thing every other sheet in this project is for:
 * looking at one thing without the rest of the world in the way, and printing
 * the numbers underneath it. Here those are the two that matter —
 * **time to the globe being draggable** against **time to the whole world** —
 * and `atlasMenu.verify()`, which is the handedness check.
 *
 * `pnpm dev` only. It is deliberately not in `vite.config.ts`'s build inputs,
 * for the reason written beside `flags.html` there: an extra entry splits the
 * Three chunk and the world's first load pays for a page nobody opens.
 */

import * as THREE from 'three';
import { OutlineEffect } from './outline.ts';
import { loadLakes, loadWorld } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, buildLand } from './globe.ts';
import { loadPlaces, radiusFor } from './places.ts';
import { loadPlacements } from './placement.ts';
import { setDetailSites, setFlattenSites } from './terrain.ts';
import { createSky } from './sun.ts';
import { createOcean } from './ocean.ts';
import { createClouds } from './clouds.ts';
import { setSunDirection } from './lights.ts';
import { FOG_COLOR } from './theme.ts';
import { fogFar } from './view.ts';
import { createMenu, earthBody } from './menu.ts';

/** `main.ts`'s own start, so the sheet's fallback is the world's fallback. */
const START = { lat: 39.62, lon: 2.99, name: 'Palma' };

async function stage(label: string): Promise<void> {
  document.getElementById('loading-stage')!.textContent = label;
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function main(): Promise<void> {
  const began = performance.now();
  const marks: Record<string, number> = {};
  const mark = (name: string): void => {
    marks[name] = Math.round(performance.now() - began);
  };

  await stage('reading the outlines');
  const [placements, places, lakes] = await Promise.all([loadPlacements(), loadPlaces(PLANET_RADIUS), loadLakes()]);
  setFlattenSites(placements);
  setDetailSites(places.all.map((place) => ({ lat: place.lat, lon: place.lon, radius: radiusFor(place.pop) })));
  const world = await loadWorld(UNITS_PER_DEGREE, lakes);
  mark('outlines');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);
  const outline = new OutlineEffect(renderer, { defaultThickness: 0.003, defaultColor: [0.11, 0.02, 0.01] });

  const scene = new THREE.Scene();
  const fog = new THREE.Fog(FOG_COLOR, 1, 2);
  scene.fog = fog;
  const sky = createSky(scene, fog);

  await stage('filling the ocean');
  const ocean = createOcean(world);
  scene.add(ocean.group);
  mark('ocean');

  await stage('raising the land');
  scene.add(buildLand(world));
  mark('land');

  // The one number this sheet exists to print: the menu is up and turning
  // *here*, before the weather and before every kit `main.ts` builds after it.
  const menu = createMenu({
    bodies: [earthBody(world, places.all)],
    scene,
    renderer,
    draw: (target, camera) => outline.render(target, camera),
    fallback: START,
  });
  document.body.appendChild(menu.root);
  mark('menu interactive');

  const oceanSun = new THREE.Vector3();
  const oceanMoon = new THREE.Vector3();
  const oceanLights = [
    { direction: oceanSun, color: sky.sun.color, intensity: 0 },
    { direction: oceanMoon, color: sky.moon.color, intensity: 0 },
  ];

  await stage('setting the weather');
  const clouds = createClouds();
  scene.add(clouds.group);
  mark('weather');

  // Assigned once the objects exist rather than passed in, which is what lets
  // the menu be created four lines earlier than the things it draws.
  menu.beforeRender = (camera) => {
    const altitude = Math.max(1, camera.position.length() - PLANET_RADIUS);
    fog.near = Math.sqrt(2 * PLANET_RADIUS * altitude) * 0.2;
    fog.far = fogFar(altitude, PLANET_RADIUS);
    sky.update(camera.position.clone().setLength(PLANET_RADIUS), camera.position, altitude);
    setSunDirection(sky.state.sun, sky.state.solar.subsolarLon);
    clouds.update(sky.state.time, camera.position, fog);
    // As `main.ts`: the deck comes off for the town stage, where it stands
    // between the camera and the country you are picking a town in.
    clouds.group.visible = menu.stage !== 'site';
    // The direction, not the position: the sun sits on the shadow box now.
    oceanSun.copy(sky.state.sun);
    oceanMoon.copy(sky.moon.position).normalize();
    oceanLights[0]!.color = sky.sun.color;
    oceanLights[0]!.intensity = sky.sun.intensity;
    oceanLights[1]!.color = sky.moon.color;
    oceanLights[1]!.intensity = sky.moon.intensity;
    ocean.update(camera.position, oceanLights);
  };

  menu.ready();
  mark('world ready');
  console.log('menu sheet timeline (ms from start):', marks);
  Object.assign(globalThis, { sheet: { marks, world, places, menu, sky, scene, renderer, outline } });

  const spawn = await menu.choose();
  clouds.group.visible = true;
  menu.dispose();
  const panel = document.getElementById('spawned')!;
  panel.hidden = false;
  panel.innerHTML = `spawning at <b>${spawn.name}</b><small>${spawn.region} · ${spawn.lat.toFixed(3)}, ${spawn.lon.toFixed(3)}</small>`;
  console.log('menu chose', spawn);
}

main().catch((error: unknown) => {
  document.getElementById('loading')!.textContent = `Error: ${String(error)}`;
});
