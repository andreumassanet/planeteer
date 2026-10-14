/**
 * The hero on a stage: the traveller drawn large, with the name over their head,
 * behind whatever card is showing them off. The title screen stands them on the
 * right on the bridge of a small ship with the solar system outside its window;
 * the traveller's creator walks the camera up to them and frames whatever is
 * being chosen.
 *
 * The title and the creator share this object, so the camera is the transition:
 * pressing *Customise* dollies from the title's framing to the creator's (`shot`)
 * while the hero stays where they were, idling. Opened from the world, where
 * there is no title, the stage comes up on its own over the dimmed world
 * (`show('dim')`).
 *
 * Where the hero stands on the screen is the caller's: `insets` says how much of
 * each edge a card covers, and the camera centres the figure in what is left by
 * shifting its lens (`setViewOffset`) rather than turning it.
 *
 * The canvas is transparent and sits on one element (`.hs-backdrop`) whose look
 * is a class: `dim` blurs and darkens the world and stands the hero on a disc of
 * grass, `clear` is the disc over whatever is behind, and `bridge` builds a room
 * round the hero (`bridge.ts`) that covers the whole canvas but its window, so
 * the planet menu's orrery is seen through the glass. The bridge arrives by a
 * dynamic import the first time it is asked for; the canvas fades in only once
 * the hero and the room both stand. `leave` flies the camera out through the
 * bay of the window nearest the middle of the screen.
 *
 * The figure has a renderer of its own, made when the stage shows and its
 * context lost on purpose when it goes. The same renderer draws the creator's
 * tiles (`portrait`): one small picture a frame, drawn into a corner of the
 * canvas and copied out before the stage is drawn over it.
 *
 * The modules live in `hero-stage/`; each is a set of functions over the shared
 * context built in `hero-stage/ctx.ts`.
 */
import { draw } from './hero-stage/draw.ts';
import { createHeroCtx } from './hero-stage/ctx.ts';
import { wave } from './hero-stage/figure.ts';
import { bindHand } from './hero-stage/hand.ts';
import { bindPlate, editName, refreshName } from './hero-stage/plate.ts';
import { portrait } from './hero-stage/portraits.ts';
import { SHOTS } from './hero-stage/shots.ts';
import { hide, leave, show } from './hero-stage/showing.ts';
import { target } from './hero-stage/camera.ts';
import type { HeroStage, HeroStageOptions } from './hero-stage/types.ts';

export type { HeroStage, HeroStageOptions, PortraitFrame, StageBackdrop, StageInsets, StageMode, StageShot } from './hero-stage/types.ts';

export function createHeroStage(options: HeroStageOptions): HeroStage {
  const ctx = createHeroCtx(options);
  ctx.tick = (now) => draw(ctx, now);
  bindPlate(ctx);
  bindHand(ctx);

  return {
    root: ctx.root,
    plate: ctx.plate,
    get open() {
      return ctx.showing;
    },
    get ready() {
      return (ctx.stage?.person ?? null) !== null;
    },
    get settled() {
      return !ctx.showing || ctx.view.classList.contains('drawn');
    },
    get shotName() {
      return ctx.current;
    },
    show: (kind) => show(ctx, kind),
    hide: () => hide(ctx),
    leave: () => leave(ctx),
    mode(next) {
      if (ctx.behaviour === next) return;
      // The hero keeps the way they face; only who turns them changes.
      if (next === 'creator') {
        ctx.handTurn = ctx.turn + ctx.look - SHOTS[ctx.current].yaw;
        ctx.turn += ctx.look;
        ctx.look = 0;
      } else {
        ctx.turn += ctx.look - SHOTS.title.yaw;
        ctx.look = 0;
        ctx.zoom = 0;
      }
      ctx.behaviour = next;
      ctx.dragging = null;
    },
    shot(next, opening = {}) {
      if (next !== ctx.current) {
        ctx.current = next;
        ctx.zoom = 0;
        // A new framing brings its own way of facing; the hand's turn is let go.
        ctx.handTurn = 0;
      }
      if (opening.instant === true || ctx.stage === null) {
        Object.assign(ctx.drawnShot, target(ctx));
        if (opening.instant === true) ctx.intro = 1;
      }
    },
    insets(next) {
      Object.assign(ctx.wantedInsets, next);
      if (ctx.stage === null) Object.assign(ctx.drawnInsets, ctx.wantedInsets);
    },
    adoptPlate(container) {
      if (ctx.plate.parentElement !== container) container.append(ctx.plate);
    },
    wave: () => wave(ctx),
    editName: () => editName(ctx),
    refreshName: () => refreshName(ctx),
    onName(listener) {
      ctx.nameListeners.add(listener);
      return () => ctx.nameListeners.delete(listener);
    },
    portrait: (look, frame, canvas) => portrait(ctx, look, frame, canvas),
  };
}
