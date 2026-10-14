/**
 * Everything drawn over the world while you play: where you are, which keys
 * do what, and the way into the settings and the map.
 *
 * - The bar, top left: the gear, the map and the passport with the key each
 *   answers to, the clock (with the weather's icon) and the place badge.
 * - The place badge debounces the data, not the animation: a country must hold
 *   for a second (the sea for three) before it counts as where you are, since
 *   a border is exactly where the answer flaps. A settled country is an arrival
 *   (`onArrival`, which the passport stamps from).
 * - No keys along the bottom: a prompt (`E  Drive`) while a vehicle is in reach,
 *   and the keys of a vehicle for a moment as you take it (`boardingHints`).
 *   `H` hides the whole overlay.
 * - The pause card, a toast under the bar, the frame counter and the welcome
 *   card shown once per device.
 * - The marker's panel and waypoint, and a landmark's card, in one column under
 *   the minimap (`.atlas-side`). `navigation.ts` decides where the marker is.
 *
 * The modules live in `hud/`; each is a set of functions over the shared
 * context built in `hud/ctx.ts`.
 */
import type { World } from './geo.ts';
import { createHudApi } from './hud/api.ts';
import { createHudCtx } from './hud/ctx.ts';
import { bindHints } from './hud/hints.ts';
import { bindSheet } from './hud/sheet.ts';
import type { Hud, HudOptions } from './hud/types.ts';
import { bindWelcome } from './hud/welcome.ts';

export { capsOf, yearText } from './hud/format.ts';
export type { DestinationEntry, FrameStats, Hud, HudOptions, LandmarkArrival } from './hud/types.ts';

export function createHud(world: World, options: HudOptions = {}): Hud {
  const ctx = createHudCtx(world, options);
  bindSheet(ctx);
  bindHints(ctx);
  bindWelcome(ctx);
  return createHudApi(ctx);
}
