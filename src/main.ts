/**
 * Entry point. A `?world=<id>` link hands the page to another world;
 * otherwise Earth is built under the loading screen, the title and the
 * planet menu open over it, and once a place is chosen the game is wired up
 * and the loop starts (`src/app/session.ts`).
 *
 * Everything not needed for the first frame arrives as separate chunks
 * (`src/app/deferred.ts`); `src/worlds/` and `src/system/` are only ever
 * imported dynamically (`scripts/check-worlds.ts`).
 */
import { dismissLoading, fail, hasWebGL2, reload, stage } from './app/boot.ts';
import type { App } from './app/context.ts';
import { loadData } from './app/data.ts';
import { loadDeferred, loadVehicleKit } from './app/deferred.ts';
import { buildEarthMeshes } from './app/earth-meshes.ts';
import { openFrontDoor } from './app/front-door.ts';
import { createGraphics } from './app/graphics.ts';
import { createGuard } from './app/guard.ts';
import { installMenuSky, installMenuStreamers, restoreWorldSky } from './app/menu-frame.ts';
import { buildMovers } from './app/movers.ts';
import { plantCountry } from './app/nature.ts';
import { startSession } from './app/session.ts';
import { createWorldSky } from './app/sky.ts';
import { createSound } from './app/sound.ts';
import { buildTowns } from './app/towns.ts';
import { arrive } from './app/arrival.ts';
import { finishLoading, fuelVehicles, warmUp } from './app/vehicles.ts';
import { prepareAvatar } from './avatar.ts';
import { notice } from './notice.ts';

async function start(): Promise<void> {
  const began = performance.now();
  // A browser that cannot draw the world is told so before downloading it.
  if (!hasWebGL2()) {
    notice(
      'planeteer needs WebGL 2',
      'This browser cannot draw it: WebGL 2 is off or unsupported here. A current Chrome, Edge, Firefox or Safari with hardware acceleration will run it.',
      [reload],
    );
    return;
  }
  // Another world straight away, with none of Earth loaded; leaving reloads without the parameter.
  const otherWorld = new URLSearchParams(location.search).get('world');
  if (otherWorld !== null && otherWorld !== '' && otherWorld !== 'earth') {
    try {
      const { standalone } = await import('./worlds/index.ts');
      await standalone(otherWorld, dismissLoading);
    } catch (error) {
      fail(error);
    }
    return;
  }

  await stage('reading the outlines');
  const app = { began, ...createGuard() } as App;
  Object.assign(app, await loadData());
  app.deferred = loadDeferred();
  app.vehicleKit = loadVehicleKit(app.deferred);
  Object.assign(app, createGraphics());
  app.query = new URLSearchParams(location.search);
  Object.assign(app, createWorldSky(app, app.query, app.deferred, app.starsLoad));
  // The hero's model downloads alongside the world; without it there is no player.
  app.avatarReady = prepareAvatar();
  app.avatarReady.catch(fail);
  Object.assign(app, await buildEarthMeshes(app.world, app.scene, app.sky));

  // The front door opens on a finished sky; the rest builds underneath it.
  await stage('opening the sky');
  app.peersUrl = import.meta.env.VITE_PEERS_URL ?? (import.meta.env.DEV ? 'ws://localhost:8787/ws' : '');
  app.peersModule = await app.deferred.peers;
  app.sound = createSound(app.weather);
  app.peersLink = null;
  Object.assign(app, await openFrontDoor(app));
  app.everyWorld = null;
  app.skyDiscs = installMenuSky(app);

  Object.assign(app, await buildTowns(app));
  Object.assign(app, await buildMovers(app));
  Object.assign(app, await plantCountry(app));
  const { warmed } = await warmUp(app);
  Object.assign(app, await fuelVehicles(app));
  await finishLoading(app, warmed);
  installMenuStreamers(app);

  Object.assign(app, await arrive(app));
  restoreWorldSky(app);
  await startSession(app);
}

start().catch(fail);
