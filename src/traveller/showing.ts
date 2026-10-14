/** Opening and closing the creator, and the window's keys while it is up. */
import { fitAppearance } from '../appearance.ts';
import { holdFocus, registerModal } from '../controls.ts';
import { CATEGORIES } from './categories.ts';
import type { TravellerCtx } from './ctx.ts';
import { undo } from './state.ts';
import { measure, select } from './view.ts';

export function show(ctx: TravellerCtx, opening: { relock?: boolean } = {}): void {
  const { history, options, root, stage, tabs } = ctx;
  if (ctx.showing) return;
  ctx.showing = true;
  ctx.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const target = options.lockTarget ?? null;
  ctx.relock = opening.relock ?? (target !== null && document.pointerLockElement === target);
  if (document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
  // Before the stage is touched: the title, if it is up, steps aside on this.
  options.onOpen?.();
  ctx.look = fitAppearance(options.appearance.get());
  history.length = 0;
  if (!root.isConnected) document.body.append(root);
  root.classList.add('on');
  measure(ctx);
  const category = CATEGORIES.find((entry) => entry.id === ctx.current)!;
  ctx.ownsStage = !stage.open;
  stage.mode('creator');
  stage.shot(category.shot, { instant: ctx.ownsStage });
  if (ctx.ownsStage) stage.show('dim');
  stage.adoptPlate(root);
  select(ctx, ctx.current);
  tabs.get(ctx.current)!.focus({ preventScroll: true });
  if (!ctx.ownsStage) window.setTimeout(() => stage.wave(), 500);
}

export function hide(ctx: TravellerCtx): void {
  const { options, root, stage } = ctx;
  if (!ctx.showing) return;
  ctx.showing = false;
  root.classList.remove('on');
  if (ctx.ownsStage) stage.hide();
  // The title, if it was under this, takes the stage back on this.
  options.onClose?.();
  const target = options.lockTarget ?? null;
  if (ctx.relock && target !== null && typeof target.requestPointerLock === 'function') {
    // Chrome refuses a lock asked for too soon after one was released; that
    // rejection is noise, the same rule `settings.ts` follows.
    try {
      const request: unknown = target.requestPointerLock();
      if (request instanceof Promise) request.catch(() => {});
    } catch {
      // The creator is closed either way.
    }
  }
  (document.activeElement as HTMLElement | null)?.blur?.();
  if (!ctx.relock && ctx.previousFocus?.isConnected) ctx.previousFocus.focus({ preventScroll: true });
  ctx.previousFocus = null;
}

export function bindTraveller(ctx: TravellerCtx): void {
  const { rail, root } = ctx;
  addEventListener('resize', () => {
    if (ctx.showing) measure(ctx);
  });

  registerModal(() => ctx.showing);

  // A lock granted while the creator is up — asked for by whatever closed as it
  // opened — is handed straight back, as the settings card does.
  document.addEventListener('pointerlockchange', () => {
    if (ctx.showing && document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
  });

  addEventListener('keydown', (event) => {
    if (!ctx.showing) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      // Not the menu's Escape as well, which would go back a stage behind the creator.
      event.stopImmediatePropagation();
      hide(ctx);
      return;
    }
    const typing = event.target instanceof HTMLInputElement;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyZ' && !typing) {
      event.preventDefault();
      undo(ctx);
      return;
    }
    const along = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.code];
    if (along !== undefined && event.target instanceof Element && rail.contains(event.target)) {
      event.preventDefault();
      const at = CATEGORIES.findIndex((entry) => entry.id === ctx.current);
      select(ctx, CATEGORIES[(at + along + CATEGORIES.length) % CATEGORIES.length]!.id, true);
      return;
    }
    holdFocus(event, root);
  });
}
