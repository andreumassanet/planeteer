/** The map layer (`B`): the nations' colour over the land, their frontiers and names, kept across visits. */

import { OVERLAY_KEY, readSetting, writeSetting } from './storage.ts';

export interface Overlay {
  readonly on: boolean;
  set(on: boolean): boolean;
}

export function createOverlay(): Overlay {
  let on = readSetting(OVERLAY_KEY) !== '0';
  return {
    get on() {
      return on;
    },
    set(next) {
      on = next;
      writeSetting(OVERLAY_KEY, next ? '1' : '0');
      return next;
    },
  };
}
