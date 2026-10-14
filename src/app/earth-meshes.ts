/**
 * The planet's fixed meshes, built once under the loading screen: the sea,
 * the land, the frontiers, and the cloud deck with the weather it carries.
 */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { buildLand } from '../globe.ts';
import { drawnRadius, landProbeOf } from '../land-probe.ts';
import type { LandProbe } from '../land-probe.ts';
import { createOcean } from '../ocean.ts';
import type { Ocean, OceanLight } from '../ocean.ts';
import { createBorders } from '../borders.ts';
import type { Borders } from '../borders.ts';
import { createClouds } from '../clouds.ts';
import type { Clouds } from '../clouds.ts';
import { createWeatherView } from '../weather-view.ts';
import type { WeatherView } from '../weather-view.ts';
import type { Sky } from '../sun.ts';
import { stage } from './boot.ts';

/** The sun and moon as the sea's glint sees them, rewritten in place each frame. */
export interface OceanLights {
  sun: THREE.Vector3;
  moon: THREE.Vector3;
  lights: [OceanLight, OceanLight];
}

export interface EarthMeshes {
  ocean: Ocean;
  /** Kept: the flag layer adds an attribute to this mesh and drives its material. */
  land: THREE.Mesh;
  /** The drawn land round the player, gathered by the loop while he is near the ground. */
  landProbe: LandProbe;
  /** The ground radius under a point: the drawn mesh nearby, the relief past the probe's reach. */
  groundAt(point: THREE.Vector3): number;
  borders: Borders;
  clouds: Clouds;
  weather: WeatherView;
  oceanLights: OceanLights;
}

export async function buildEarthMeshes(world: World, scene: THREE.Scene, sky: Sky): Promise<EarthMeshes> {
  await stage('filling the ocean');
  const ocean = createOcean(world);
  scene.add(ocean.group);

  await stage('raising the land');
  const land = buildLand(world);
  scene.add(land);
  const landProbe = landProbeOf(land);
  const groundAt = (point: THREE.Vector3): number => drawnRadius(world, landProbe, point);

  await stage('drawing the frontiers');
  const borders = createBorders(world);
  scene.add(borders.mesh);

  await stage('setting the weather');
  const clouds = createClouds();
  scene.add(clouds.group);
  // Rain, snow and lightning round the camera; a pure function of place and time.
  const weather = createWeatherView(sky, clouds);
  scene.add(weather.group);

  const sun = new THREE.Vector3();
  const moon = new THREE.Vector3();
  const oceanLights: OceanLights = {
    sun,
    moon,
    lights: [
      { direction: sun, color: sky.sun.color, intensity: 0 },
      { direction: moon, color: sky.moon.color, intensity: 0 },
    ],
  };
  return { ocean, land, landProbe, groundAt, borders, clouds, weather, oceanLights };
}
