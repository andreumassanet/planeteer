/**
 * The review sheet for `src/menu.ts`, at `/sheets/menu.html`.
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
 * `pnpm dev` only, like every sheet in this directory: none of them is in
 * `vite.config.ts`'s build inputs, and that file carries the measurement — an
 * extra entry splits the shared chunk and the world's own first load pays for a
 * page nobody opens in production.
 */

import * as THREE from 'three';
import { OutlineEffect } from '../outline.ts';
import { loadLakes, loadWorld } from '../geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, buildLand } from '../globe.ts';
import { loadPlaces, terrainSiteOf } from '../places.ts';
import { loadPlacements } from '../placement.ts';
import { setDetailSites, setFlattenSites } from '../terrain.ts';
import { createSky } from '../sun.ts';
import { loadStars } from '../celestial.ts';
import { createNightSky } from '../night-sky.ts';
import { createOcean } from '../ocean.ts';
import { createClouds } from '../clouds.ts';
import { setSunDirection } from '../lights.ts';
import { FOG_COLOR } from '../theme.ts';
import { fogFar } from '../view.ts';
import { createMenu, earthBody } from '../menu.ts';
import type { MenuBodyModule } from '../menu.ts';

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
  setDetailSites(places.all.map(terrainSiteOf));
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
  // The orrery's back cloth is the world's own catalogue since 2026-09-30,
  // not a field of its own, so the sheet asks for it as `main.ts` does — and
  // as there, a sheet without it is a black sky and otherwise whole.
  loadStars()
    .then((catalogue) => {
      const night = createNightSky(catalogue, sky);
      night.menu = true;
      scene.add(night.points);
      sky.attach(night.update);
    })
    .catch((error: unknown) => console.warn('the stars did not load', error));

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
    bodies: [earthBody(world, places.all, places.aliases())],
    scene,
    renderer,
    draw: (target, camera) => outline.render(target, camera),
    fallback: START,
    time: () => sky.state.time,
    sunDirection: () => sky.state.sun,
    // Every other walkable body's globe, as `main.ts` makes it.
    loadBody: async (id, centre, drawnRadius) => {
      const load = import.meta.glob<MenuBodyModule>('../system/menu-body.ts')['../system/menu-body.ts'];
      if (load === undefined) return null;
      const module = await load();
      module.installBanners();
      return module.menuBodyOf(id, centre, drawnRadius);
    },
    // No worlds here: a spawn on another body is printed, and the menu given back.
    exploreBody: (id, name, spawn) => {
      const panel = document.getElementById('spawned')!;
      panel.hidden = false;
      panel.innerHTML = '';
      const what = document.createElement('b');
      what.textContent = spawn === undefined ? name : `${spawn.name}, ${name}`;
      const where = document.createElement('small');
      where.textContent = spawn === undefined ? id : `${spawn.region} · ${spawn.site ?? 'no site'} · ${spawn.lat.toFixed(3)}, ${spawn.lon.toFixed(3)}`;
      panel.append('would land at ', what, where);
      console.log('menu chose', id, spawn);
    },
  });
  document.body.appendChild(menu.root);
  // The menu no longer takes the loading card over; the world's own loading
  // screen is `main.ts`'s to dismiss, and this sheet's is this sheet's.
  document.getElementById('loading')?.remove();
  // As `main.ts`: the orrery draws the Sun, so the sky's own disc goes, and
  // behind the orrery is the dome's own space colour.
  const sunDisc = scene.getObjectByName('sun');
  if (sunDisc !== undefined) sunDisc.visible = false;
  scene.background = new THREE.Color().setRGB(0.016, 0.024, 0.055, THREE.SRGBColorSpace);
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
    // As `main.ts`, without its fade: the deck is off at the country and town
    // stages, where it stands between the camera and the map you are choosing
    // on, and the dome goes once the camera is outside it.
    clouds.setVeil(menu.stage === 'region' || menu.stage === 'site' ? 0 : 1);
    const inside = camera.position.length() < PLANET_RADIUS * 5.5 && menu.body === 'earth';
    for (const name of ['sky', 'moon']) {
      const object = scene.getObjectByName(name);
      if (object !== undefined) object.visible = inside;
    }
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
  clouds.setVeil(1);
  menu.dispose();
  const panel = document.getElementById('spawned')!;
  panel.hidden = false;
  panel.innerHTML = `spawning at <b>${spawn.name}</b><small>${spawn.region} · ${spawn.lat.toFixed(3)}, ${spawn.lon.toFixed(3)}</small>`;
  console.log('menu chose', spawn);
}

main().catch((error: unknown) => {
  document.getElementById('loading')!.textContent = `Error: ${String(error)}`;
});
