/** The stamp that lands on the screen when a new country is stamped. */
import { PALETTE } from '../theme.ts';
import { worldOf } from '../passport.ts';
import type { Stamp } from '../passport.ts';
import { DROP_HIT, DROP_HOLD } from './constants.ts';
import type { BookDom } from './dom.ts';
import { stampElement } from './seal-svg.ts';
import type { BookModel } from './model.ts';

export interface StampDrop {
  celebrate(stamp: Stamp): void;
  /** Cancels the timers. */
  dispose(): void;
}

export interface StampDropOptions {
  model: BookModel;
  dom: BookDom;
  onThud?(): void;
  /** Called before the stamp drops, so the chapters its nation belongs to are on their way. */
  askChapters(): void;
  /** Called once the stamp is down, to bring an open book up to date. */
  refresh(): void;
  isDisposed(): boolean;
}

export function createStampDrop(options: StampDropOptions): StampDrop {
  const { model, dom } = options;
  const { drop, dropStamp, root } = dom;
  let dropTimer = 0;
  let thudTimer = 0;

  function celebrate(stamp: Stamp): void {
    if (options.isDisposed()) return;
    options.askChapters();
    clearTimeout(dropTimer);
    clearTimeout(thudTimer);
    if (!root.isConnected) document.body.append(root);
    // A nation whose chapter has not arrived yet is sealed in crimson until it does.
    const nation =
      worldOf(stamp.iso) === 'earth'
        ? null
        : model.nationOf.get(stamp.iso) ?? { iso: stamp.iso, name: stamp.name, color: PALETTE.crimson, world: worldOf(stamp.iso).replace(/^./, (c) => c.toUpperCase()) };
    dropStamp.replaceChildren(stampElement(stamp, nation));
    // The stamp prints the country; a reader of the screen is told in words.
    drop.setAttribute('aria-label', `Passport stamped: ${stamp.name}`);
    drop.classList.remove('in', 'out');
    void drop.offsetWidth;
    drop.classList.add('in');
    thudTimer = window.setTimeout(() => options.onThud?.(), DROP_HIT);
    dropTimer = window.setTimeout(() => {
      drop.classList.remove('in');
      drop.classList.add('out');
      dropTimer = window.setTimeout(() => drop.classList.remove('out'), 520);
    }, DROP_HOLD);
    options.refresh();
  }

  return {
    celebrate,
    dispose() {
      clearTimeout(dropTimer);
      clearTimeout(thudTimer);
    },
  };
}
