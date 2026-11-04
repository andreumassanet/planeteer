/**
 * The Field Guide, behind `Y` (the `journal` action) and the HUD's book: the
 * traveller's level over four pages — the journal (the Explorer's Path and
 * today's commissions), the guide (every topic the guild's people teach,
 * readable anywhere), the milestones, and the rewards each level and
 * milestone unlocks to wear. It holds the keyboard while it is up, like the
 * settings: `Y` or `Esc` closes it, and it hands the pointer back.
 */
import { actionOf, holdFocus, labelOf, onKeyLabels, registerModal } from './controls.ts';
import { journalPage, guidePage, milestonesPage, rewardsPage, topicReader } from './field-guide/pages.ts';
import { STYLE } from './field-guide/style.ts';
import type { FieldGuidePage, FieldGuideServices } from './field-guide/types.ts';
import { bar } from './guild/cards.ts';
import type { LoreTopicView } from './guild/services.ts';
import { ensureStyle, h, icon, installUi } from './ui.ts';
import type { IconName } from './ui.ts';

export type { FieldGuidePage, FieldGuideServices, RewardItem } from './field-guide/types.ts';

export interface FieldGuideOptions {
  services: FieldGuideServices;
  lockTarget?: HTMLElement | null;
  onOpen?(): void;
  onClose?(): void;
}

export interface FieldGuide {
  readonly open: boolean;
  show(page?: FieldGuidePage, topic?: string): void;
  hide(): void;
  toggle(): void;
  /** Redraws what is shown: the progress behind it moved. */
  refresh(): void;
  dispose(): void;
}

const PAGES: readonly { id: FieldGuidePage; label: string; icon: IconName }[] = [
  { id: 'journal', label: 'Journal', icon: 'scroll' },
  { id: 'guide', label: 'Guide', icon: 'book' },
  { id: 'milestones', label: 'Milestones', icon: 'trophy' },
  { id: 'rewards', label: 'Rewards', icon: 'sparkle' },
];

export function createFieldGuide(options: FieldGuideOptions): FieldGuide {
  installUi();
  ensureStyle('atlas-field-guide', STYLE);
  const { services } = options;
  const events = new AbortController();
  const { signal } = events;
  /** Every listener a page adds goes when it is redrawn. */
  let pageEvents = new AbortController();

  const badge = h('span', { class: 'atlas-fg-badge' });
  const title = h('div', { class: 'atlas-fg-title' });
  const sub = h('div', { class: 'atlas-fg-sub' });
  const xp = h('div', { class: 'atlas-fg-xp' });
  const close = h('button', { class: 'ui-btn icon atlas-fg-close', type: 'button', 'aria-label': 'Close' }, icon('close'));
  const rail = h('div', { class: 'atlas-fg-rail', role: 'tablist', 'aria-orientation': 'vertical' });
  const content = h('div', { class: 'atlas-fg-content', role: 'tabpanel' });
  const panel = h(
    'div',
    { class: 'atlas-fg-panel ui-card' },
    h('div', { class: 'atlas-fg-head' }, badge, h('div', { class: 'atlas-fg-who' }, title, sub, xp), close),
    h('div', { class: 'atlas-fg-body' }, rail, content),
  );
  const root = h('div', { class: 'atlas-fg ui-glass', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Field Guide' }, panel);
  document.body.append(root);

  const tabs = new Map<FieldGuidePage, HTMLButtonElement>();
  const dots = new Map<FieldGuidePage, HTMLElement>();
  for (const page of PAGES) {
    const dot = h('span', { class: 'atlas-fg-dot', hidden: true });
    const tab = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false' }, icon(page.icon), page.label, dot);
    tab.addEventListener('click', () => turnTo(page.id), { signal });
    rail.append(tab);
    tabs.set(page.id, tab);
    dots.set(page.id, dot);
  }

  let showing = false;
  let current: FieldGuidePage = 'journal';
  let reading: LoreTopicView | null = null;
  let relock = false;
  let redrawing = false;

  function head(): void {
    const level = services.level();
    const span = Math.max(1, level.to - level.from);
    badge.textContent = String(level.level);
    title.textContent = services.name() || 'Traveller';
    sub.textContent = `Level ${level.level} · ${level.xp - level.from} / ${span} XP to the next`;
    xp.replaceChildren(bar((level.xp - level.from) / span));
    const quests = services.quests();
    const ready = quests.filter((quest) => quest.state === 'ready').length;
    const journalDot = dots.get('journal')!;
    journalDot.hidden = ready === 0;
    journalDot.textContent = String(ready);
  }

  function open(topic: LoreTopicView): void {
    reading = topic;
    if (!services.isRead(topic.id)) services.read(topic.id);
    draw();
    content.scrollTop = 0;
  }

  function draw(): void {
    pageEvents.abort();
    pageEvents = new AbortController();
    const pageSignal = pageEvents.signal;
    head();
    for (const [id, tab] of tabs) tab.setAttribute('aria-selected', String(id === current));
    let children: HTMLElement[];
    switch (current) {
      case 'journal':
        children = journalPage(services, pageSignal);
        break;
      case 'guide':
        children =
          reading === null
            ? guidePage(services, open, pageSignal)
            : topicReader(services, reading, () => {
                reading = null;
                draw();
              }, open, pageSignal);
        break;
      case 'milestones':
        children = milestonesPage(services);
        break;
      case 'rewards':
        children = rewardsPage(services, pageSignal);
        break;
    }
    content.replaceChildren(...children);
  }

  function turnTo(page: FieldGuidePage): void {
    if (page !== current) reading = null;
    current = page;
    draw();
    content.scrollTop = 0;
  }

  function relabel(): void {
    close.title = `Close (${labelOf('journal')} or ${labelOf('release')})`;
  }
  relabel();
  const unlabel = onKeyLabels(relabel);
  const unregister = registerModal(() => showing);

  function show(page?: FieldGuidePage, topic?: string): void {
    if (page !== undefined) current = page;
    reading = topic === undefined ? (page === undefined ? reading : null) : services.topics().find((candidate) => candidate.id === topic) ?? null;
    draw();
    if (showing) return;
    showing = true;
    relock = options.lockTarget != null && document.pointerLockElement === options.lockTarget;
    if (document.pointerLockElement !== null) document.exitPointerLock();
    root.classList.add('on');
    options.onOpen?.();
    tabs.get(current)?.focus({ preventScroll: true });
  }

  function hide(): void {
    if (!showing) return;
    showing = false;
    root.classList.remove('on');
    pageEvents.abort();
    if (relock && options.lockTarget && document.pointerLockElement !== options.lockTarget) {
      try {
        void options.lockTarget.requestPointerLock()?.catch?.(() => undefined);
      } catch {
        // Refused without a gesture: the next click takes it.
      }
    }
    relock = false;
    options.onClose?.();
  }

  close.addEventListener('click', hide, { signal });
  root.addEventListener('pointerdown', (event) => {
    if (event.target === root) hide();
  }, { signal });
  addEventListener(
    'keydown',
    (event) => {
      if (!showing || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.code === 'Escape' || (actionOf(event.code) === 'journal' && !(event.target instanceof HTMLInputElement))) {
        event.preventDefault();
        hide();
        return;
      }
      if (holdFocus(event, panel)) return;
      const at = PAGES.findIndex((page) => page.id === current);
      if (document.activeElement?.getAttribute('role') === 'tab' && (event.code === 'ArrowDown' || event.code === 'ArrowUp')) {
        event.preventDefault();
        const next = PAGES[(at + (event.code === 'ArrowDown' ? 1 : -1) + PAGES.length) % PAGES.length]!;
        turnTo(next.id);
        tabs.get(next.id)?.focus();
      }
    },
    { signal },
  );

  return {
    get open() {
      return showing;
    },
    show,
    hide,
    toggle() {
      if (showing) hide();
      else show();
    },
    refresh() {
      // Coalesced: a redraw that tells the progress something must not redraw again inside itself.
      if (!showing || redrawing) return;
      redrawing = true;
      requestAnimationFrame(() => {
        redrawing = false;
        if (showing) draw();
      });
    },
    dispose() {
      hide();
      unlabel();
      unregister();
      events.abort();
      pageEvents.abort();
      root.remove();
    },
  };
}
