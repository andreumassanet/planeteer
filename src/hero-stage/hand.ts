/** The hand on the figure: drag to turn, the wheel to zoom, and the pointer the head follows. */
import * as THREE from 'three';
import type { HeroCtx } from './ctx.ts';
import { DRAG_TURN, LOOK_TURN } from './shots.ts';

export function bindHand(ctx: HeroCtx): void {
  const { pointer, view } = ctx;
  view.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    ctx.dragging = { x: event.clientX, from: ctx.behaviour === 'title' ? ctx.turn + ctx.look : ctx.handTurn, id: event.pointerId };
    if (ctx.behaviour === 'title') {
      ctx.look = 0;
      ctx.turn = ctx.dragging.from;
    }
    view.setPointerCapture(event.pointerId);
    view.classList.add('dragging');
  });
  view.addEventListener('pointermove', (event) => {
    if (ctx.dragging === null) return;
    const turned = ctx.dragging.from + (event.clientX - ctx.dragging.x) * DRAG_TURN;
    if (ctx.behaviour === 'title') ctx.turn = turned;
    else ctx.handTurn = turned;
  });
  const endDrag = (): void => {
    if (ctx.dragging === null) return;
    if (ctx.behaviour === 'title') {
      // Carried on from where the hand left it, easing back to face the pointer.
      ctx.look = (pointer.x - 0.5) * 2 * LOOK_TURN;
      ctx.turn -= ctx.look;
    }
    ctx.dragging = null;
    view.classList.remove('dragging');
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  view.addEventListener(
    'wheel',
    (event) => {
      if (ctx.behaviour !== 'creator') return;
      event.preventDefault();
      const notches = event.deltaMode === 1 ? event.deltaY / 3 : event.deltaY / 100;
      ctx.zoom = THREE.MathUtils.clamp(ctx.zoom - notches * 0.18, -1, 1);
    },
    { passive: false },
  );
  addEventListener('pointermove', (event) => {
    if (ctx.stage === null) return;
    pointer.x = Math.min(1, Math.max(0, event.clientX / Math.max(1, innerWidth)));
    pointer.y = Math.min(1, Math.max(0, event.clientY / Math.max(1, innerHeight)));
    pointer.inside = true;
  });
  // Off the page altogether: the head comes back to the camera.
  addEventListener('mouseout', (event) => {
    if (event.relatedTarget === null) pointer.inside = false;
  });
}
