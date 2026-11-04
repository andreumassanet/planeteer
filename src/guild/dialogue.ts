/**
 * The guild's conversation card, bottom centre: who is speaking (their name,
 * their role and where), what they say, typed out in step with their voice,
 * anything they show (a quest, a list, a board), and what you can answer.
 *
 * It holds the keyboard while it is up (`registerModal`), so the world does
 * not walk off under it: a digit picks an answer, `E`, `Enter` or `Space`
 * finishes the line being typed or takes the first answer, the arrows walk
 * the answers and `Esc` leaves. The pointer is let go while it is up, so an
 * answer can be clicked, and asked back for when it closes.
 *
 * A line is plain text with `{action}` where a key goes, drawn as the
 * player's own key cap (`labelOf`), and blank lines between paragraphs.
 */
import { actionOf, labelOf, registerModal } from '../controls.ts';
import type { Action } from '../controls/types.ts';
import { ensureStyle, h, icon, installUi, kbd } from '../ui.ts';
import type { IconName } from '../ui.ts';
import { planSpeech, revealed, speak, SPEECH_LEAD } from '../voice.ts';
import type { Speech, Utterance, Voice } from '../voice.ts';

export interface Speaker {
  name: string;
  /** "Guide", "Course marshal". */
  role: string;
  icon: IconName;
  /** "Explorers' Guild · Madrid". */
  where: string;
  /** Who they sound like, or null to type the lines without a voice. */
  voice: Voice | null;
}

export interface DialogueOption {
  label: string;
  icon?: IconName;
  /** A mark beside it: a quest to take, one to hand in, or something not seen yet. */
  badge?: 'quest' | 'ready' | 'new' | null;
  /** Greyed and not taken, with why. */
  disabled?: string | null;
  /** The answer's own colour: the way out is quiet, a quest's acceptance gold. */
  tone?: 'primary' | 'quiet' | null;
  /** Closes the card the way `Esc` does, handing the pointer back; an answer that opens another card closes without it. */
  leaves?: boolean;
  /** What it leads to: the next node, null to close, or undefined to stay on this one (it changed something shown). */
  run(): DialogueNode | null | undefined;
}

export interface DialogueNode {
  text: string;
  /** Shown under the line, once it is typed: a quest card, a list, a board. */
  extra?: HTMLElement | null;
  options: readonly DialogueOption[];
}

export interface DialogueOptions {
  /** The context and node a voice joins, or null while the voices are off. */
  voice?: () => { context: BaseAudioContext; node: AudioNode } | null;
  /** Where to hand the pointer back to on closing, if it was locked on opening. */
  lockTarget?: HTMLElement | null;
  cue?(name: 'ui-click' | 'ui-open' | 'ui-close'): void;
  onClose?(): void;
}

export interface Dialogue {
  readonly open: boolean;
  /** Who is speaking, or null. */
  readonly speaker: Speaker | null;
  start(speaker: Speaker, node: DialogueNode): void;
  /** Goes on to another node with the same speaker. */
  show(node: DialogueNode): void;
  /** Redraws the current node's answers (a state behind them changed). */
  refresh(): void;
  close(): void;
  /** Once a frame, for the typing. */
  update(): void;
  dispose(): void;
}

/** Characters a second typed when there is no voice to keep step with. */
const TYPE_RATE = 70;
/** The most answers shown; the rest would not fit a phone held upright. */
const MAX_OPTIONS = 9;

const STYLE = `
.atlas-dialogue {
  position: fixed; inset: auto 0 0 0;
  display: flex; justify-content: center;
  padding: 0 12px calc(max(14px, env(safe-area-inset-bottom)) + 70px);
  pointer-events: none;
  z-index: 40;
}
.atlas-dialogue[hidden] { display: none; }
.atlas-dialogue-card {
  pointer-events: auto;
  width: min(760px, 100%);
  max-height: min(72vh, 640px);
  display: flex; flex-direction: column;
  padding: 14px 18px 14px;
  animation: atlas-dialogue-in 0.32s var(--ui-spring);
}
@keyframes atlas-dialogue-in { from { opacity: 0; transform: translateY(18px) scale(0.97); } to { opacity: 1; transform: none; } }
.atlas-dialogue-head { display: flex; align-items: center; gap: 12px; }
.atlas-dialogue-badge {
  flex: none; display: grid; place-items: center;
  width: 42px; height: 42px; border-radius: 50%;
  background: var(--ui-gold); color: #1e0603;
  box-shadow: 0 0 0 3px rgba(255, 242, 232, 0.14);
}
.atlas-dialogue-badge svg { width: 23px; height: 23px; }
.atlas-dialogue-who { flex: 1; min-width: 0; }
.atlas-dialogue-name { font-size: 18px; font-weight: 900; letter-spacing: -0.01em; }
.atlas-dialogue-role { font-size: 12.5px; font-weight: 800; color: var(--ui-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.atlas-dialogue-close { flex: none; }
.atlas-dialogue-body { overflow-y: auto; margin-top: 10px; padding-right: 4px; scrollbar-width: thin; }
.atlas-dialogue-text { font-size: 16px; font-weight: 700; line-height: 1.45; min-height: 2.9em; }
.atlas-dialogue-text p { margin: 0 0 8px; }
.atlas-dialogue-text p:last-child { margin-bottom: 0; }
.atlas-dialogue-text .ui-kbd { font-size: 12.5px; vertical-align: 1px; margin: 0 1px; }
.atlas-dialogue-extra:empty { display: none; }
.atlas-dialogue-extra { margin-top: 10px; }
.atlas-dialogue-options { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.atlas-dialogue-options[hidden] { display: none; }
.atlas-dialogue-option {
  display: flex; align-items: center; gap: 10px;
  width: 100%; text-align: left;
  padding: 8px 12px; border-radius: 11px;
  font: inherit; font-size: 15px; font-weight: 800; color: inherit;
  background: rgba(255, 242, 232, 0.07);
  border: 1.5px solid var(--ui-glass-edge, rgba(255, 242, 232, 0.16));
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
}
.atlas-dialogue-option:hover, .atlas-dialogue-option:focus-visible { background: rgba(255, 242, 232, 0.16); border-color: rgba(255, 242, 232, 0.34); outline: none; transform: translateX(3px); }
.atlas-dialogue-option:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.atlas-dialogue-option.primary { background: var(--ui-gold); border-color: var(--ui-gold); color: #1e0603; }
.atlas-dialogue-option.quiet { background: transparent; color: var(--ui-muted); }
.atlas-dialogue-option:disabled { opacity: 0.45; cursor: default; transform: none; }
.atlas-dialogue-option .ui-kbd { flex: none; min-width: 22px; text-align: center; }
.atlas-dialogue-option svg { flex: none; width: 18px; height: 18px; }
.atlas-dialogue-option span.label { flex: 1; min-width: 0; }
.atlas-dialogue-option small { display: block; font-size: 12px; font-weight: 700; opacity: 0.65; margin-top: 1px; }
.atlas-dialogue-mark {
  flex: none; display: grid; place-items: center;
  min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px;
  font-size: 13px; font-weight: 900; color: #1e0603; background: var(--ui-gold);
}
.atlas-dialogue-mark.new { background: var(--ui-sky); font-size: 10.5px; letter-spacing: 0.06em; }
.atlas-dialogue-more { margin-top: 10px; font-size: 12.5px; font-weight: 800; color: var(--ui-muted); text-align: right; }
.atlas-dialogue-more[hidden] { display: none; }
html.touch-ui .atlas-dialogue { padding-bottom: calc(max(10px, env(safe-area-inset-bottom)) + 10px); }
html.touch-ui .atlas-dialogue-option { padding: 11px 12px; }
html.touch-ui .atlas-dialogue-option .ui-kbd { display: none; }
`;

/** The key caps a line names, resolved now: `{use}` is whatever `E` is bound to. */
function segmentsOf(text: string): { text: string; key: Action | null }[][] {
  return text.split(/\n\s*\n/).map((paragraph) => {
    const out: { text: string; key: Action | null }[] = [];
    let last = 0;
    for (const match of paragraph.matchAll(/\{([a-zA-Z]+)\}/g)) {
      if (match.index > last) out.push({ text: paragraph.slice(last, match.index), key: null });
      out.push({ text: '', key: match[1] as Action });
      last = match.index + match[0].length;
    }
    if (last < paragraph.length) out.push({ text: paragraph.slice(last), key: null });
    return out;
  });
}

/** How many characters a line is, a key cap counting as one. */
function lengthOf(paragraphs: { text: string; key: Action | null }[][]): number {
  let n = 0;
  for (const paragraph of paragraphs) for (const piece of paragraph) n += piece.key === null ? piece.text.length : 1;
  return n;
}

/** The speech's words: what is said aloud, with a key read as its name. */
function spokenOf(paragraphs: { text: string; key: Action | null }[][]): string {
  return paragraphs.map((paragraph) => paragraph.map((piece) => (piece.key === null ? piece.text : labelOf(piece.key))).join('')).join(' ');
}

export function createDialogue(options: DialogueOptions = {}): Dialogue {
  installUi();
  ensureStyle('atlas-dialogue', STYLE);
  const events = new AbortController();
  const { signal } = events;

  const badge = h('span', { class: 'atlas-dialogue-badge' });
  const name = h('div', { class: 'atlas-dialogue-name' });
  const role = h('div', { class: 'atlas-dialogue-role' });
  const closeButton = h('button', { class: 'ui-btn icon small atlas-dialogue-close', type: 'button', 'aria-label': 'Leave' }, icon('close'));
  const text = h('div', { class: 'atlas-dialogue-text', 'aria-live': 'polite' });
  const extra = h('div', { class: 'atlas-dialogue-extra' });
  const list = h('div', { class: 'atlas-dialogue-options', role: 'menu' });
  const more = h('div', { class: 'atlas-dialogue-more' });
  const body = h('div', { class: 'atlas-dialogue-body' }, text, extra, list);
  const card = h(
    'div',
    { class: 'atlas-dialogue-card ui-card' },
    h('div', { class: 'atlas-dialogue-head' }, badge, h('div', { class: 'atlas-dialogue-who' }, name, role), closeButton),
    body,
    more,
  );
  const root = h('div', { class: 'atlas-dialogue ui-glass', role: 'dialog', 'aria-modal': 'true', hidden: true }, card);
  document.body.append(root);

  let speaker: Speaker | null = null;
  let node: DialogueNode | null = null;
  let paragraphs: { text: string; key: Action | null }[][] = [];
  let total = 0;
  let shown = -1;
  let typedFrom = 0;
  let speech: Speech | null = null;
  let utterance: Utterance | null = null;
  let spokenAt = 0;
  let relock = false;
  let buttons: HTMLButtonElement[] = [];

  const unregister = registerModal(() => speaker !== null);

  function hush(): void {
    utterance?.stop();
    utterance = null;
    speech = null;
  }

  /** The line, up to `count` characters of it. */
  function draw(count: number): void {
    if (count === shown) return;
    shown = count;
    let left = count;
    const out: HTMLElement[] = [];
    for (const paragraph of paragraphs) {
      if (left <= 0) break;
      const p = h('p');
      for (const piece of paragraph) {
        if (left <= 0) break;
        if (piece.key !== null) {
          p.append(kbd(labelOf(piece.key)));
          left--;
        } else {
          p.append(piece.text.slice(0, left));
          left -= piece.text.length;
        }
      }
      out.push(p);
    }
    text.replaceChildren(...out);
    const done = count >= total;
    list.hidden = !done;
    extra.hidden = !done;
    more.hidden = done;
  }

  function typed(): boolean {
    return shown >= total;
  }

  function finish(): void {
    hush();
    draw(total);
    buttons.find((button) => !button.disabled)?.focus({ preventScroll: true });
  }

  function choose(option: DialogueOption): void {
    if (option.disabled) return;
    options.cue?.('ui-click');
    const next = option.run();
    if (next === undefined) {
      if (node !== null) answers(node);
      return;
    }
    if (next === null) close(option.leaves === true);
    else show(next);
  }

  function answers(of: DialogueNode): void {
    buttons = of.options.slice(0, MAX_OPTIONS).map((option, index) => {
      const mark =
        option.badge === 'quest'
          ? h('span', { class: 'atlas-dialogue-mark', text: '!', 'aria-label': 'a quest' })
          : option.badge === 'ready'
            ? h('span', { class: 'atlas-dialogue-mark', text: '?', 'aria-label': 'ready to hand in' })
            : option.badge === 'new'
              ? h('span', { class: 'atlas-dialogue-mark new', text: 'NEW' })
              : null;
      const button = h(
        'button',
        {
          class: `atlas-dialogue-option${option.tone ? ` ${option.tone}` : ''}`,
          type: 'button',
          role: 'menuitem',
          disabled: option.disabled ? true : undefined,
          title: option.disabled ?? undefined,
        },
        kbd(String(index + 1)),
        option.icon ? icon(option.icon, 18) : null,
        h('span', { class: 'label' }, option.label, option.disabled ? h('small', { text: option.disabled }) : null),
        mark,
      );
      button.addEventListener('click', () => choose(option), { signal });
      return button;
    });
    list.replaceChildren(...buttons);
  }

  function show(next: DialogueNode): void {
    if (speaker === null) return;
    node = next;
    hush();
    paragraphs = segmentsOf(next.text);
    total = lengthOf(paragraphs);
    shown = -1;
    extra.replaceChildren(...(next.extra ? [next.extra] : []));
    answers(next);
    body.scrollTop = 0;
    const out = speaker.voice === null ? null : options.voice?.() ?? null;
    if (out !== null && speaker.voice !== null && total > 0) {
      speech = planSpeech(spokenOf(paragraphs), speaker.voice, `${speaker.name}:${next.text.length}`);
      utterance = speak(out.context, out.node, speech, speaker.voice, 0.8);
      spokenAt = performance.now() + SPEECH_LEAD * 1000;
    }
    typedFrom = performance.now();
    draw(0);
    if (total === 0) finish();
  }

  function close(handBack = true): void {
    if (speaker === null) return;
    hush();
    speaker = null;
    node = null;
    root.hidden = true;
    options.cue?.('ui-close');
    if (handBack && relock && options.lockTarget && document.pointerLockElement !== options.lockTarget) {
      try {
        void options.lockTarget.requestPointerLock()?.catch?.(() => undefined);
      } catch {
        // Refused without a gesture: the next click takes it.
      }
    }
    relock = false;
    options.onClose?.();
  }

  closeButton.addEventListener('click', () => close(true), { signal });

  addEventListener(
    'keydown',
    (event) => {
      if (speaker === null || event.ctrlKey || event.metaKey || event.altKey) return;
      // A held key types nothing more: one press, one answer.
      const code = event.code;
      if (event.repeat) {
        if (code !== 'Escape') event.preventDefault();
        return;
      }
      if (code === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (!typed() && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || actionOf(code) === 'use' || code.startsWith('Digit'))) {
        event.preventDefault();
        finish();
        return;
      }
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (digit !== null) {
        event.preventDefault();
        const option = node?.options[Number(digit[1]) - 1];
        if (option !== undefined) choose(option);
        return;
      }
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (code === 'ArrowDown' || code === 'ArrowUp' || (code === 'Tab' && !event.repeat)) {
        event.preventDefault();
        const step = code === 'ArrowUp' || (code === 'Tab' && event.shiftKey) ? -1 : 1;
        const usable = buttons.filter((button) => !button.disabled);
        if (usable.length === 0) return;
        const from = usable.indexOf(buttons[at]!);
        usable[(from + step + usable.length) % usable.length]!.focus();
        return;
      }
      if (actionOf(code) === 'use' || ((code === 'Enter' || code === 'Space') && at < 0)) {
        event.preventDefault();
        const option = at >= 0 ? node?.options[at] : node?.options.find((o) => !o.disabled);
        if (option !== undefined) choose(option);
      }
    },
    { signal, capture: true },
  );

  return {
    get open() {
      return speaker !== null;
    },
    get speaker() {
      return speaker;
    },
    start(who, first) {
      const opening = speaker === null;
      speaker = who;
      badge.replaceChildren(icon(who.icon, 23));
      name.textContent = who.name;
      role.textContent = `${who.role} · ${who.where}`;
      root.setAttribute('aria-label', `${who.name}, ${who.role}`);
      root.hidden = false;
      if (opening) {
        options.cue?.('ui-open');
        relock = options.lockTarget != null && document.pointerLockElement === options.lockTarget;
        if (document.pointerLockElement !== null) document.exitPointerLock();
      }
      show(first);
    },
    show,
    refresh() {
      if (node !== null) answers(node);
    },
    close,
    update() {
      if (speaker === null || typed()) return;
      const count =
        speech !== null
          ? Math.round((revealed(speech, (performance.now() - spokenAt) / 1000) / Math.max(1, speech.length)) * total)
          : Math.floor(((performance.now() - typedFrom) / 1000) * TYPE_RATE);
      if (count >= total) finish();
      else draw(Math.max(shown, count));
    },
    dispose() {
      close();
      unregister();
      events.abort();
      root.remove();
    },
  };
}
