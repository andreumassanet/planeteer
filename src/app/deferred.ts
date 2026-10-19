/**
 * The code Earth needs after the data has loaded, as separate chunks.
 *
 * Everything here is kept out of the initial bundle so the data files are
 * requested sooner, and is fired only after `loadWorld`, when the network is
 * idle and the main thread is busy building the land. Each chunk is awaited
 * in order by a later stage, so a slow link holds the loading screen on a
 * stage rather than starting the world without a part.
 */
import type { Model } from '../models.ts';

export function loadDeferred() {
  const deferred = {
    menu: import('../menu.ts'),
    fauna: import('../fauna/index.ts'),
    /** The monument registry: every model file. The largest chunk. */
    monuments: import('../monuments/index.ts'),
    /** With it, the scenery and traffic kits. */
    settlements: import('../settlements.ts'),
    vegetation: import('../vegetation.ts'),
    grass: import('../grass.ts'),
    effects: import('../effects.ts'),
    ambient: import('../ambient.ts'),
    sea: import('../seabed.ts'),
    seaLife: import('../sea-life.ts'),
    passport: import('../passport.ts'),
    passportCard: import('../passport-card.ts'),
    countryMotion: import('../countryside-motion.ts'),
    life: import('../life.ts'),
    folk: import('../folk.ts'),
    /** The phrases themselves are fetched on the first conversation. */
    talk: import('../talk.ts'),
    chat: import('../chat.ts'),
    traffic: import('../traffic/index.ts'),
    /** For the kit's model registry. */
    scenery: import('../scenery/contract.ts'),
    /** The baked CC0 models' loader (`scripts/build-kit.ts`). */
    kit: import('../kit.ts'),
    minimap: import('../minimap.ts'),
    /** Already inside the maps' chunk; imported statically it would bring the maps into the first load. */
    cartography: import('../cartography.ts'),
    hud: import('../hud.ts'),
    settings: import('../settings.ts'),
    map: import('../map.ts'),
    mapTiles: import('../map-tiles.ts'),
    mapFeatures: import('../map-features.ts'),
    navigation: import('../navigation.ts'),
    playerList: import('../player-list.ts'),
    names: import('../names.ts'),
    peers: import('../peers.ts'),
    /** Stars and planets at night, with the orbits the menu shares. */
    nightSky: import('../night-sky.ts'),
    traveller: import('../traveller.ts'),
    menuSound: import('../menu-sound.ts'),
    title: import('../title.ts'),
    craft: import('../craft/index.ts'),
    airTraffic: import('../air-traffic.ts'),
    railway: import('../railway.ts'),
    passingSound: import('../passing-sound.ts'),
    fleet: import('../fleet.ts'),
    fleetSync: import('../fleet-sync.ts'),
    /** The rockets' pads, and `rocket.ts` with them. */
    launchPads: import('../launch-pads.ts'),
  };
  // A chunk that fails now would otherwise be reported as an unhandled
  // rejection long before its stage awaits it; the await still throws.
  for (const chunk of Object.values(deferred) as Promise<unknown>[]) chunk.catch(() => {});
  return deferred;
}

export type Deferred = ReturnType<typeof loadDeferred>;

/**
 * The vehicle, flora and building models, downloading while the land is
 * built. Without them towns have no parked cars and roads no traffic, so a
 * failure is a warning, not fatal.
 */
export function loadVehicleKit(deferred: Deferred): Promise<Model[]> {
  return deferred.kit
    .then(async ({ loadModels }) => {
      // Each file on its own: a cancelled download is tried again, and one
      // that still fails costs its own models, not the other files'.
      const files = await Promise.all(KIT_FILES.map((file) => withRetries(() => loadModels(file))));
      return files.flatMap((models, i) => {
        if (models instanceof Error) console.warn(`the model kit ${KIT_FILES[i]} did not load`, models);
        return models instanceof Error ? [] : models;
      });
    })
    .catch((error: unknown) => {
      console.warn('the model kit did not load', error);
      return [];
    });
}

const KIT_FILES = ['traffic/kit.bin', 'nature/kit.bin', 'buildings/kit.bin'] as const;
const KIT_ATTEMPTS = 4;
const KIT_RETRY_MS = 400;

/** The load, tried again after a growing pause while it throws; its last error if it never succeeds. */
async function withRetries<T>(load: () => Promise<T>): Promise<T | Error> {
  let last: unknown = null;
  for (let attempt = 0; attempt < KIT_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, KIT_RETRY_MS * attempt));
    try {
      return await load();
    } catch (error) {
      last = error;
    }
  }
  return last instanceof Error ? last : new Error(String(last));
}
