/**
 * The sky dome, sun, moon and fill light (`sun.ts`), the clock it runs on,
 * and the night sky, attached whenever its code and star catalogue arrive.
 */
import * as THREE from 'three';
import { createSky } from '../sun.ts';
import type { Sky } from '../sun.ts';
import type { NightSky } from '../night-sky.ts';
import type { loadStars } from '../celestial.ts';
import type { Deferred } from './deferred.ts';
import type { Graphics } from './graphics.ts';

type StarCatalogue = Awaited<ReturnType<typeof loadStars>>;

/** Whether the sun follows the real clock, and whether the time-lapse runs. */
export interface Clock {
  live: boolean;
  fast: boolean;
}

export interface Night {
  /** The stars and planets, or null until they have arrived. */
  readonly sky: NightSky | null;
  /** The menu's sky: calmer stars, and the planets left to the orrery. */
  setMenu(on: boolean): void;
}

export interface WorldSky {
  sky: Sky;
  clock: Clock;
  night: Night;
}

/**
 * `?time=ISO` freezes the sun at that instant (the clock keeps running from
 * there). It is applied before the menu, so a screenshot of the menu shows
 * the chosen hour.
 */
export function createWorldSky(
  gfx: Graphics,
  query: URLSearchParams,
  deferred: Deferred,
  starsLoad: Promise<StarCatalogue | null>,
): WorldSky {
  const { renderer, scene, fog } = gfx;
  const sky = createSky(scene, fog);
  const wantedTime = query.get('time');
  const timeTaken = wantedTime !== null && wantedTime !== '' && sky.setTime(wantedTime);
  if (wantedTime && !timeTaken) console.warn(`atlas: ?time=${wantedTime} is not a date; the sky keeps the real clock`);
  const clock: Clock = { live: !timeTaken, fast: false };

  let nightSky: NightSky | null = null;
  let menuSky = true;
  const night: Night = {
    get sky() {
      return nightSky;
    },
    setMenu(on) {
      menuSky = on;
      if (nightSky !== null) nightSky.menu = on;
    },
  };
  // Nothing waits for this. The program is compiled before the points join
  // the scene, so neither the menu's first frame nor the first dusk stalls.
  Promise.all([deferred.nightSky, starsLoad])
    .then(async ([{ createNightSky }, catalogue]) => {
      if (catalogue === null) return;
      const created = createNightSky(catalogue, sky);
      created.menu = menuSky;
      await renderer.compileAsync(created.points, new THREE.PerspectiveCamera(), scene);
      scene.add(created.points);
      sky.attach(created.update);
      nightSky = created;
    })
    .catch((error: unknown) => console.warn('the night sky did not start', error));

  return { sky, clock, night };
}
