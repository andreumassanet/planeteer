/**
 * The front door: the solar system, then a planet, then a country, then the
 * town you wake up in. The title screen (`title.ts`) stands in front of it and
 * holds it (`hold`) until the player has chosen how to play.
 *
 * The menu draws the world's own scene with the world's own `outline.render`;
 * `orrery.ts` lays the other planets out around the real Earth, so choosing a
 * town is one continuous camera flight from the whole system down into it.
 *
 * Stages: `system` (the orrery and a dock of every body), `planet` (one body
 * up close), `region` (the globe, a country ribbon under the pointer) and
 * `site` (the chosen country's towns as pins and a list).
 *
 * Every mark is `Vector3.project(camera)` and every click `unproject`, so there
 * is no map basis to mirror; `verify()` asks the gazetteer, a third party,
 * whether east is to the right. The weather is not the menu's: `main.ts` fades
 * the cloud deck out for the country and town stages by reading `stage`.
 *
 * The modules live in `menu/`; each is a set of functions over the shared
 * context built in `menu/context.ts`.
 */

import { createApi } from './menu/api.ts';
import { bindBodies } from './menu/labels.ts';
import { bindInput, bindViewport } from './menu/input.ts';
import { bindPins } from './menu/pins.ts';
import { bindSearch } from './menu/search.ts';
import { bindStages } from './menu/stages.ts';
import { catalogueOf } from './menu/catalogue.ts';
import { createContext } from './menu/context.ts';
import { frame } from './menu/loop.ts';
import { lastOf } from './menu/memory.ts';
import { openingShot } from './menu/flight.ts';
import { refreshChrome, refreshContinue } from './menu/chrome.ts';
import type { Menu, MenuDeps } from './menu/types.ts';

export { earthBody } from './menu/earth-body.ts';
export { EARTH_WORDS } from './menu/types.ts';
export type {
  Curtain,
  Menu,
  MenuBody,
  MenuBodyModule,
  MenuDeps,
  MenuRegion,
  MenuRing,
  MenuSite,
  MenuSound,
  MenuSoundName,
  MenuSpawn,
  MenuWords,
  Stage,
} from './menu/types.ts';

export function createMenu(deps: MenuDeps): Menu {
  const ctx = createContext(deps);
  ({ regionIndexOf: ctx.regionIndexOf, sitesOf: ctx.sitesOf } = catalogueOf(ctx, ctx.body));
  ctx.last = lastOf(ctx);
  ctx.tick = (now) => frame(ctx, now);

  bindBodies(ctx);
  bindPins(ctx);
  refreshContinue(ctx);
  bindStages(ctx);
  bindSearch(ctx);
  bindInput(ctx);
  bindViewport(ctx);
  openingShot(ctx);

  const api = createApi(ctx);
  refreshChrome(ctx);
  Object.assign(globalThis, { atlasMenu: api });
  requestAnimationFrame(ctx.tick);
  return api;
}
