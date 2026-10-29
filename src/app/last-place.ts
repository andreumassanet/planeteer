/** Remembering where the player was, for the menu's "Continue in …", and leaving for the solar system. */
import { toLatLon } from '../geo.ts';
import type { App } from './context.ts';
import { reloadToSystem, reloadToTitle } from './journey.ts';
import { LAST_PLACE_KEY, writeSetting } from './storage.ts';

const LAST_PLACE_MS = 10_000;

/** Saved every `LAST_PLACE_MS`, on `pagehide` (the last event a closing tab is sure to get) and when hidden. */
export function keepLastPlace(app: App): { save(): void; toSolarSystem(): void; toTitle(): void } {
  const { world, places, player } = app;
  function save(): void {
    const { lat, lon } = toLatLon(player.position);
    const id = world.countryAtPoint(player.position);
    writeSetting(
      LAST_PLACE_KEY,
      JSON.stringify({
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
        name: places.nearest(player.position).place.name,
        iso: id > 0 ? world.countries[id - 1]!.iso : '',
        savedAt: Date.now(),
      }),
    );
  }
  setInterval(save, LAST_PLACE_MS);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  return {
    save,
    toSolarSystem() {
      save();
      reloadToSystem();
    },
    toTitle() {
      save();
      reloadToTitle();
    },
  };
}
