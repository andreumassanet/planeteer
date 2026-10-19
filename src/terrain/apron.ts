// The apron: the beach carried on under the water, in section.

import { APRON_FOOT, SHORE_APRON, SHORE_LIP } from './constants.ts';

/**
 * How far under the sea's radius the apron is `distance` units out from the
 * coastline, negative above it: `-SHORE_LIP` at the coastline, `APRON_FOOT` at
 * `SHORE_APRON`, and the same straight line past it.
 */
export function apronDepth(distance: number): number {
  return -SHORE_LIP + ((SHORE_LIP + APRON_FOOT) * distance) / SHORE_APRON;
}

/** How far out from the coastline the apron stands `height` units over the sea. */
export function apronReachAt(height: number): number {
  return (SHORE_APRON * (SHORE_LIP - height)) / (SHORE_LIP + APRON_FOOT);
}

/** Where the apron goes under the sea's radius: the waterline, units out from the coastline. */
export const SHORE_WATERLINE = apronReachAt(0);
