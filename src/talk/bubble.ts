/** The speech bubble over a speaker's head: the card, the line typed out, its English and the key hint. */
import { labelOf } from '../controls.ts';
import { isTouch, tap } from '../touch.ts';
import { ensureStyle, h, installUi, kbd } from '../ui.ts';
import { STYLE } from './style.ts';

/** How a line is shown: the rest of `Bubble.show`'s arguments. */
export interface BubbleLine {
  /** The word on the foot's key: *Next*, *Close*. No key is shown without one. */
  action?: string;
  /** The line's language tag and direction, for a text line. */
  lang?: string;
  rtl?: boolean;
  /** A text line starts with nothing showing, for `reveal` to type it out. */
  typed?: boolean;
}

/**
 * The bubble over a speaker's head, alone: the card, the line, the English
 * under it and the foot that says who speaks and what `E` does. Earth's
 * conversations drive one (`createTalk`); another world's, whose line is a
 * row of glyphs rather than text, drive their own through the same element.
 */
export interface Bubble {
  root: HTMLElement;
  /**
   * Shows a line: `who` on the foot (the language, the speaker), `line` as
   * text — typed out by `reveal` when `typed` — or as a node, and `meant`
   * under it unless it says the same.
   */
  show(who: string, line: Node | string, meant: string, how?: BubbleLine): void;
  /** Shows the first `count` characters of a text line and keeps the room of the rest. */
  reveal(count: number): void;
  /** How many characters of the text line are showing, and how many it has; 0 and 0 for a node. */
  readonly shown: number;
  readonly length: number;
  /** Puts the bubble's point at `x`, `y` in CSS pixels, or hides it where the speaker is out of sight. */
  place(x: number, y: number, visible: boolean): void;
  hide(): void;
  /** Takes it off the page. */
  dispose(): void;
}

export function createBubble(): Bubble {
  installUi();
  ensureStyle('atlas-talk', STYLE);
  const saidText = h('span');
  const unsaid = h('span', { class: 'unsaid', 'aria-hidden': 'true' });
  const said = h('div', { class: 'said' }, saidText, unsaid);
  const meant = h('div', { class: 'meant' });
  const speaks = h('span');
  const action = h('span');
  const foot = h('div', { class: 'foot' }, speaks, action);
  const root = h('div', { class: 'atlas-bubble ui-card', role: 'status', 'aria-live': 'polite' }, said, meant, foot);
  document.body.append(root);
  root.addEventListener('pointerdown', (event) => {
    if (!isTouch()) return;
    event.preventDefault();
    event.stopPropagation();
    tap('use');
  });

  /** The line's characters, and how many of them are showing. */
  let characters: string[] = [];
  let shown = 0;

  function reveal(count: number): void {
    if (count === shown) return;
    shown = count;
    saidText.textContent = characters.slice(0, count).join('');
    unsaid.textContent = characters.slice(count).join('');
  }

  return {
    root,
    show(who, line, meantText, how = {}) {
      speaks.textContent = who;
      if (typeof line === 'string') {
        characters = Array.from(line);
        shown = -1;
        said.replaceChildren(saidText, unsaid);
        reveal(how.typed === true ? 0 : characters.length);
        // The whole line for a screen reader at once; the typing is for the eye.
        said.setAttribute('aria-label', line);
      } else {
        characters = [];
        shown = 0;
        said.replaceChildren(line);
        said.setAttribute('aria-label', meantText);
      }
      if (how.lang !== undefined) said.lang = how.lang;
      else said.removeAttribute('lang');
      said.dir = how.rtl === true ? 'rtl' : 'ltr';
      const same = typeof line === 'string' && meantText === line;
      meant.textContent = same ? '' : meantText;
      meant.hidden = same || meantText === '';
      action.replaceChildren(...(how.action === undefined ? [] : [isTouch() ? 'Tap · ' : kbd(labelOf('use')), how.action]));
      root.classList.add('on');
    },
    reveal,
    get shown() {
      return Math.max(0, shown);
    },
    get length() {
      return characters.length;
    },
    place(x, y, visible) {
      root.style.visibility = visible ? '' : 'hidden';
      if (!visible) return;
      root.style.setProperty('--x', `${x.toFixed(1)}px`);
      root.style.setProperty('--y', `${y.toFixed(1)}px`);
    },
    hide() {
      root.classList.remove('on');
    },
    dispose() {
      root.remove();
    },
  };
}
