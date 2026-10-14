/** The place remembered: written every few seconds and when the page is hidden, for the next visit's menu. */

import type * as THREE from 'three';
import type { Places } from '../../places.ts';
import type { WorldPlayer } from '../player.ts';
import { latLonOf } from '../../sphere.ts';
import { LAST_PLACE_KEY, writeSetting } from './storage.ts';

/** How often the remembered place is written, as on Earth. */
const LAST_PLACE_MS = 10_000;

export interface LastPlace {
  save(): void;
  stop(): void;
}

export function rememberPlace(deps: { world: string; player: WorldPlayer; places: Places; isoAt: (point: THREE.Vector3) => string | null; signal: AbortSignal }): LastPlace {
  const { world, player, places, isoAt, signal } = deps;
  function save(): void {
    const { lat, lon } = latLonOf(player.position);
    writeSetting(
      LAST_PLACE_KEY,
      JSON.stringify({
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
        name: places.nearest(player.position).place.name,
        iso: isoAt(player.position) ?? '',
        body: world,
        savedAt: Date.now(),
      }),
    );
  }
  const timer = window.setInterval(save, LAST_PLACE_MS);
  addEventListener('pagehide', save, { signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') save();
    },
    { signal },
  );
  return { save, stop: () => window.clearInterval(timer) };
}
