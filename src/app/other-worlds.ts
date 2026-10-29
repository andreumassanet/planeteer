/**
 * The planet menu's way onto other bodies. `src/system/` and `src/worlds/`
 * are imported only when asked, so neither is in Earth's first load
 * (`scripts/check-worlds.ts`); `world-host.ts` is the contract.
 */
import type * as THREE from 'three';
import { heroAppearance, wardrobeCast } from '../avatar.ts';
import { suspendCloudShade } from '../cloud-shade.ts';
import { notice } from '../notice.ts';
import type { MenuBody, MenuBodyModule, MenuSpawn } from '../menu.ts';
import type { WorldsModule } from '../world-host.ts';
import type { App } from './context.ts';
import { pixelRatioFor } from './graphics.ts';
import { travelTo } from './journey.ts';

/**
 * A walkable body's menu globe from `src/system/menu-body.ts`, its nations'
 * banners registered with the flags first. Null when there is no such module
 * or body, and *Explore* then goes straight to the world.
 */
export async function loadMenuBody(id: string, centre: THREE.Vector3, drawnRadius: number): Promise<MenuBody | null> {
  const load = import.meta.glob<MenuBodyModule>('../system/menu-body.ts')['../system/menu-body.ts'];
  if (load === undefined) return null;
  const module = await load();
  module.installBanners();
  return module.menuWorldOf(id, centre, drawnRadius);
}

/**
 * *Explore* on any body but Earth and the Sun: `enterWorld` from
 * `src/worlds/index.ts`, with the menu suspended until the world hands the
 * screen back. `spawn` is the settlement chosen on the body's globe, or the
 * place remembered from the last visit.
 */
export async function exploreWorld(app: App, id: string, name: string, spawn?: MenuSpawn): Promise<void> {
  const { menu, sky, launch } = app;
  const { audio } = app.sound;
  menu.suspend(true);
  let left = false;
  const back = (to?: 'system'): void => {
    if (left) return;
    left = true;
    // The world's engine and wind stop; the menu's ear is quiet.
    audio.update(0, { mode: 'menu', speed: 0, throttle: 0, height: 0, sea: 0, daylight: 1, wild: 0, cold: true });
    menu.suspend(false);
    if (to === 'system') menu.toSystem();
  };
  try {
    const load = import.meta.glob<WorldsModule>('../worlds/index.ts')['../worlds/index.ts'];
    if (load === undefined) throw new Error('there is no src/worlds/index.ts');
    const worlds = await load();
    if (typeof worlds.enterWorld !== 'function') throw new Error('src/worlds/index.ts has no enterWorld');
    // The menu's frame restores the cloud shade on the way out (`clouds.update`).
    suspendCloudShade();
    await worlds.enterWorld(id, {
      renderer: app.renderer,
      draw: (target, camera) => app.post.render(target, camera),
      pixelRatio: () => pixelRatioFor(app.resolution),
      sound: () => audio.output,
      appearance: heroAppearance,
      cast: wardrobeCast,
      name: () => app.peersModule.storedName(),
      mode: launch.journey?.mode ?? app.title?.mode ?? launch.linkedMode,
      time: () => sky.state.time,
      exit: back,
      arrival: spawn === undefined
        ? null
        : { settlement: spawn.site ?? null, lat: spawn.lat, lon: spawn.lon, name: spawn.name, region: spawn.region },
      peersUrl: app.peersUrl,
      settings: app.sharedSettings,
      cue: (cue) => audio.cue(cue),
      boom: (loudness) => audio.boom(loudness),
      traveller: app.traveller,
      step: (weight) => audio.step('dirt', weight),
      countries: app.world.countries,
      travel: (to, lat, lon, place) => travelTo(to, lat, lon, place, app.title?.mode ?? launch.linkedMode),
      gazetteer: () => app.everyWorld,
      soundscape: (dt, scape) => audio.update(dt, scape),
      music: (moment) => {
        const music = app.sound.music;
        if (music === null) {
          app.sound.loadMusic();
          return;
        }
        if (moment !== null) music.observe(moment);
        music.update();
      },
    });
  } catch (error) {
    console.warn(`atlas: ${name} cannot be explored yet`, error);
    back();
    notice('Coming soon', `${name} cannot be walked on yet. Earth can, and the rest of the solar system is on its way.`, [
      { label: 'Back to the planets', primary: true, escape: true, run: () => {} },
    ]);
  }
}
