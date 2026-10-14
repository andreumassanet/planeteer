/**
 * The traveller's creator: how you look and what you are called, chosen with the
 * camera walked up to you, and worn at once by the hero and seen by everyone
 * else.
 *
 * The hero stands on the stage (`hero-stage.ts`) on the right, large, and the
 * creator is a column on the left: a rail of categories (you, skin, hair, top,
 * bottom, shoes and rucksack) and the open one, its choices as pictures of the
 * hero wearing each (`stage.portrait`) and its colours as swatches. Opening a
 * category moves the camera to it. The name floats over the hero's head with a
 * pencil (the stage's plate), and that is the one place it is changed.
 *
 * Opened from the title screen, the stage is already up: the title's column goes,
 * this one comes, and the camera dollies in; *Done* is the same move back. Opened
 * from the world or the planet menu, the stage comes up over a dimmed, blurred
 * version of what was there, and goes with the creator.
 *
 * It is a modal like the settings card: it holds the keyboard (`registerModal`)
 * and the mouse while it is up. It owns no state: the appearance is `avatar.ts`'s
 * (`dressHero`), handed in as a getter and a setter by `main.ts`, which also
 * tells the other players. Every click is applied at once, and *Undo* walks them
 * back.
 *
 * The modules live in `traveller/`.
 */
import { fillColumn } from './traveller/column.ts';
import { createTravellerCtx } from './traveller/ctx.ts';
import { bindTraveller, hide, show } from './traveller/showing.ts';
import type { Traveller, TravellerOptions } from './traveller/types.ts';

export { createHeroStage } from './hero-stage.ts';
export type { HeroStage } from './hero-stage.ts';
export type { Traveller, TravellerOptions } from './traveller/types.ts';

export function createTraveller(options: TravellerOptions): Traveller {
  const ctx = createTravellerCtx(options);
  fillColumn(ctx);
  bindTraveller(ctx);
  return {
    root: ctx.root,
    get open() {
      return ctx.showing;
    },
    show: (opening) => show(ctx, opening),
    hide: () => hide(ctx),
  };
}
