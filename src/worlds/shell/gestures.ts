/** A wave or a dance, and the photo (`P`): what the keys and the chat ask of the traveller. */

import type { Hud } from '../../hud.ts';
import type { Peers } from '../../peers.ts';
import type { WorldHost } from '../../world-host.ts';
import type { Places } from '../../places.ts';
import type { WorldPlayer } from '../player.ts';
import { EMOTE_INTERVAL_MS } from '../../../server/src/limits.ts';
import type { Emote } from '../../../server/src/limits.ts';

/** Performs a gesture and tells the others; false when the traveller cannot (not on the ground). */
export function createGesture(player: WorldPlayer, peers: Peers | null): (name: Emote) => boolean {
  let gesturedAt = -Infinity;
  return (name) => {
    if (!player.emote(name)) return false;
    const now = performance.now();
    if (now - gesturedAt >= EMOTE_INTERVAL_MS && peers?.send({ t: 'emote', e: name }) === true) gesturedAt = now;
    return true;
  };
}

export interface Photo {
  /** Asks for a photo at the end of the frame. */
  request(): void;
  /** Takes it if one was asked for; a photo of the world, not of the map. */
  flush(mapOpen: boolean): void;
}

export function createPhoto(deps: { host: WorldHost; hud: Hud; places: Places; player: WorldPlayer; world: string }): Photo {
  const { host, hud, places, player, world } = deps;
  let wanted = false;
  function save(canvas: HTMLCanvasElement): void {
    const place = places.nearest(player.position).place.name;
    const slug = `${world}-${place}`.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    canvas.toBlob((blob) => {
      if (blob === null) {
        hud.toast('The photo could not be saved', 'camera');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `atlas-${slug}-${stamp}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      hud.toast('Photo saved', 'camera');
    }, 'image/png');
  }
  return {
    request() {
      wanted = true;
    },
    flush(mapOpen) {
      if (!wanted) return;
      wanted = false;
      if (mapOpen) hud.toast('Close the map to take a photo', 'camera');
      else save(host.renderer.domElement);
    },
  };
}
