/**
 * The last stages under the loading screen: compiling every streamer's
 * shaders, loading the takeable vehicles and the sky's traffic, then waiting
 * for the warm-up, the other worlds' globes and a few smooth frames.
 */
import * as THREE from 'three';
import { groundRadius, landFlagProxy, PLANET_RADIUS } from '../globe.ts';
import { reliefAt } from '../terrain.ts';
import { unitAt } from '../sphere.ts';
import { weatherAt, weatherSample } from '../weather.ts';
import { proxyOf, warmShaders } from '../warm.ts';
import { isTouch } from '../touch.ts';
import type { CraftModel } from '../craft/contract.ts';
import type { AirTraffic } from '../air-traffic.ts';
import type { PassingSound } from '../passing-sound.ts';
import type { App } from './context.ts';
import { dismissLoading, stage, whenSettled } from './boot.ts';

export interface Vehicles {
  craftModels: ReadonlyMap<string, CraftModel>;
  airTraffic: AirTraffic;
  passingSound: PassingSound;
}

/**
 * Starts compiling every streamer's programs under the loading screen, so
 * nothing links mid-game. `warmed` settles when it is done.
 */
export async function warmUp(app: App): Promise<{ warmed: Promise<void> }> {
  const { renderer, outline, scene, inkSource } = app;
  await stage('packing your bag');
  const { fleetMaterials } = await app.deferred.fleet;
  const warmed = warmShaders(
    renderer,
    outline,
    scene,
    [
      app.settlements, app.monuments, app.roads, app.vegetation, app.grass, app.life, app.effects, app.ambient,
      app.sea, app.seaLife, app.countryMotion, app.weather,
      { proxies: () => [proxyOf(inkSource), landFlagProxy(), ...fleetMaterials().map((material) => proxyOf(material))] },
    ],
    app.rigMaterial(),
  )
    .then((ms) => console.log(`shaders warmed in ${Math.round(ms)} ms`))
    .catch((error: unknown) => console.warn('the shader warm-up failed:', error));
  return { warmed };
}

/**
 * Loaded before the world takes the sky back from the menu: the menu draws
 * while anything here is awaited, and hides the dome when its camera is
 * outside it.
 */
export async function fuelVehicles(app: App): Promise<Vehicles> {
  const { deferred, world, places, scene, fleetSites, railway } = app;
  await stage('fuelling the vehicles');
  // Not used until the player exists; awaited here so a missing chunk fails under the loading screen.
  await deferred.fleet;
  await deferred.fleetSync;
  const craftModels = await deferred.craft
    .then(({ loadCraft }) => loadCraft())
    .catch((error: unknown) => {
      console.warn('the vehicles did not load', error);
      return new Map<string, CraftModel>();
    });
  // The sky's traffic borrows the takeable light plane, helicopter and balloon.
  const { createAirTraffic } = await deferred.airTraffic;
  const { keepsBalloon } = await deferred.fleet;
  const airWeather = weatherSample();
  const airProbe = new THREE.Vector3();
  const airTraffic = createAirTraffic({
    craft: craftModels,
    source: {
      places: places.all,
      ground: (direction) => groundRadius(world, airProbe.copy(direction).multiplyScalar(PLANET_RADIUS)),
      strips: fleetSites,
      keepsBalloon,
      wind(lat, lon, timeMs) {
        unitAt(lat, lon, airProbe);
        weatherAt(lat, lon, Math.max(0, reliefAt(airProbe.x, airProbe.y, airProbe.z)), timeMs, airWeather);
        const calm = (airWeather.kind === 'clear' || airWeather.kind === 'cloudy') && airWeather.windSpeed < 8;
        return { east: airWeather.windEast, north: airWeather.windNorth, speed: airWeather.windSpeed, calm };
      },
    },
  });
  scene.add(airTraffic.group);
  const passingSound = (await deferred.passingSound).createPassingSound();
  if (railway !== null) railway.onHorn = (near) => passingSound.horn(app.sound.audio.bus, near);
  return { craftModels, airTraffic, passingSound };
}

/**
 * Waits for the shaders and, except on touch devices (where it can take
 * minutes), every other world's globe; gathers every world's towns for the
 * search; then lifts the loading screen once frames run smooth.
 */
export async function finishLoading(app: App, warmed: Promise<void>): Promise<void> {
  await stage('warming up');
  await Promise.all(isTouch() ? [warmed] : [warmed, app.prepared]);
  app.everyWorld = await import('../system/gazetteer.ts')
    .then(({ allWorlds }) => allWorlds({ places: app.places.all, aliases: app.places.aliases(), countries: app.world.countries }))
    .catch((error: unknown) => {
      console.warn('the other worlds are not in the search', error);
      return null;
    });
  await whenSettled(() => app.heroStage.settled);
  dismissLoading();
}
