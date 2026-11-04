/**
 * The jobs' HUD, mounted in the HUD's root so `H` hides it with the rest:
 *
 * - the job card, top centre (under a ring course's when both are up): what
 *   it is, where it goes and how far is left, the clock against the par; or,
 *   before one is taken, the one being headed for;
 * - the tags: a small inked badge over each pickup on screen nearby, its
 *   kind and how far;
 * - the result: the medal, the time, the reputation it earned and the
 *   standing in that country, a moment in the middle of the screen.
 *
 * It borrows the rings' result card and medal (`rings/panel.ts`), whose
 * styles are on the page whenever the world is.
 */
import { MEDAL_NAMES, medalSvg } from '../rings/panel.ts';
import { icon } from '../ui.ts';
import type { IconName } from '../ui.ts';
import type { JobKind } from './types.ts';

export interface JobView {
  kind: JobKind;
  title: string;
  /** "To Sóller · 2.4 km", or how to start it. */
  detail: string;
  /** The clock, `m:ss.s`, and the par, or '' before it is taken. */
  clock: string;
  par: string;
  /** Under way, or only headed for. */
  running: boolean;
  /** What the one who asked said, for a moment after it is taken, or ''. */
  quote: string;
}

export interface JobTag {
  kind: JobKind;
  x: number;
  y: number;
  /** "320 m". */
  distance: string;
  /** Faded with distance, 0 to 1. */
  fade: number;
  /** The one being headed for. */
  tracked: boolean;
}

export interface JobResult {
  title: string;
  time: string;
  /** 3 gold, 2 silver, 1 bronze. */
  medal: number;
  par: string;
  points: number;
  /** "Regular in Spain". */
  standing: string;
  /** A standing reached by this job, or null. */
  promoted: string | null;
}

export interface JobPanel {
  card(view: JobView | null): void;
  tags(tags: readonly JobTag[]): void;
  result(result: JobResult): void;
  dispose(): void;
}

/** Each kind's badge: its icon, its colour and its name. */
export const KIND_BADGE: Readonly<Record<JobKind, { icon: IconName; colour: string; name: string }>> = {
  errand: { icon: 'hand', colour: 'var(--ui-gold)', name: 'Errand' },
  taxi: { icon: 'car', colour: 'var(--ui-gold)', name: 'Fare' },
  cargo: { icon: 'plane', colour: '#f8a658', name: 'Cargo' },
  rescue: { icon: 'swim', colour: 'var(--ui-crimson)', name: 'Rescue' },
};

/** How long the result stays up, ms. */
const RESULT_MS = 4200;
const MAX_TAGS = 8;

const STYLE = `
.atlas-job {
  position: absolute;
  left: 50%;
  top: var(--hud-top);
  min-width: 250px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 8px 16px 9px;
  text-align: center;
  opacity: 0;
  transform: translate(-50%, -14px) scale(0.96);
  transition: opacity 0.22s ease, transform 0.35s var(--ui-spring), top 0.3s ease;
  pointer-events: none;
}
.atlas-job.on { opacity: 1; transform: translate(-50%, 0) scale(1); }
.atlas-rings-hud:has(.atlas-course.on) ~ .atlas-jobs-hud .atlas-job { top: calc(var(--hud-top) + 92px); }
.atlas-job-kicker {
  display: flex; justify-content: center; align-items: center; gap: 6px;
  font-size: 11.5px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.65;
}
.atlas-job-title { font-size: 17px; font-weight: 900; margin-top: 3px; }
.atlas-job-detail { font-size: 13.5px; font-weight: 800; opacity: 0.75; margin-top: 2px; }
.atlas-job-quote { font-size: 13px; font-weight: 700; font-style: italic; margin-top: 5px; opacity: 0.9; }
.atlas-job-quote:empty { display: none; }
.atlas-job-quote::before { content: '“'; }
.atlas-job-quote::after { content: '”'; }
.atlas-job-line { display: flex; justify-content: center; align-items: baseline; gap: 12px; margin-top: 4px; font-variant-numeric: tabular-nums; }
.atlas-job-line:empty, .atlas-job-clock:empty, .atlas-job-par:empty { display: none; }
.atlas-job-clock { font-size: 22px; font-weight: 900; line-height: 1.1; }
.atlas-job-par { font-size: 13px; font-weight: 800; opacity: 0.65; }
.atlas-job-tag {
  position: absolute; left: 0; top: 0;
  display: flex; align-items: center; gap: 5px;
  padding: 3px 9px 3px 5px;
  border-radius: 999px;
  border: 2.5px solid var(--ui-ink);
  background: var(--ui-paper);
  box-shadow: 0 3px 0 var(--ui-ink);
  font-size: 12.5px; font-weight: 900; white-space: nowrap;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  will-change: transform;
}
.atlas-job-tag.tracked { background: var(--ui-gold); }
.atlas-job-tag-glyph {
  display: grid; place-items: center;
  width: 21px; height: 21px; border-radius: 50%;
  border: 2px solid var(--ui-ink);
  color: var(--ui-ink);
}
.atlas-job-kicker svg { width: 15px; height: 15px; }
.atlas-job-tag::after {
  content: '';
  position: absolute; left: 50%; bottom: -9px;
  width: 0; height: 0;
  border: 6px solid transparent; border-top: 7px solid var(--ui-ink);
  transform: translateX(-50%);
}
.atlas-job-result .atlas-result-facts { flex-wrap: wrap; row-gap: 4px; }
.atlas-job-result-standing { margin-top: 10px; font-size: 14px; font-weight: 900; }
.atlas-job-result-standing.up { color: var(--ui-crimson); }
html.touch-ui .atlas-job { top: calc(max(10px, env(safe-area-inset-top)) + 96px); }
`;

let styled = false;

function el(tag: string, className: string, parent?: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

export function createJobPanel(parent: HTMLElement): JobPanel {
  if (!styled) {
    styled = true;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
  }
  const element = el('div', 'atlas-jobs-hud');
  parent.append(element);

  const card = el('div', 'atlas-job ui-card', element);
  card.setAttribute('role', 'status');
  const kicker = el('div', 'atlas-job-kicker', card);
  const title = el('div', 'atlas-job-title', card);
  const detail = el('div', 'atlas-job-detail', card);
  const quote = el('div', 'atlas-job-quote', card);
  const line = el('div', 'atlas-job-line', card);
  const clock = el('span', 'atlas-job-clock', line);
  const par = el('span', 'atlas-job-par', line);
  let shown = '';

  const tags: HTMLElement[] = [];
  for (let i = 0; i < MAX_TAGS; i++) {
    const tag = el('div', 'atlas-job-tag', element);
    tag.style.display = 'none';
    el('span', 'atlas-job-tag-glyph', tag);
    el('span', 'atlas-job-tag-text', tag);
    tags.push(tag);
  }

  const result = el('div', 'atlas-result atlas-job-result ui-card', element);
  result.setAttribute('role', 'status');
  let resultTimer = 0;

  return {
    card(view) {
      if (view === null) {
        card.classList.remove('on');
        shown = '';
        return;
      }
      const badge = KIND_BADGE[view.kind];
      const key = `${view.kind}|${view.title}|${view.running}`;
      if (key !== shown) {
        shown = key;
        kicker.replaceChildren(icon(badge.icon, 15), document.createTextNode(view.running ? badge.name : `${badge.name} nearby`));
        title.textContent = view.title;
      }
      if (detail.textContent !== view.detail) detail.textContent = view.detail;
      if (quote.textContent !== view.quote) quote.textContent = view.quote;
      if (clock.textContent !== view.clock) clock.textContent = view.clock;
      const parText = view.par === '' ? '' : `par ${view.par}`;
      if (par.textContent !== parText) par.textContent = parText;
      card.classList.add('on');
    },
    tags(list) {
      for (let i = 0; i < MAX_TAGS; i++) {
        const tag = tags[i]!;
        const item = list[i];
        if (item === undefined) {
          if (tag.style.display !== 'none') tag.style.display = 'none';
          continue;
        }
        const badge = KIND_BADGE[item.kind];
        const glyph = tag.firstElementChild as HTMLElement;
        const text = tag.lastElementChild as HTMLElement;
        if (glyph.dataset.kind !== item.kind) {
          glyph.dataset.kind = item.kind;
          glyph.replaceChildren(icon(badge.icon, 13));
          glyph.style.background = badge.colour;
        }
        if (text.textContent !== item.distance) text.textContent = item.distance;
        tag.classList.toggle('tracked', item.tracked);
        tag.style.display = '';
        tag.style.opacity = item.fade.toFixed(2);
        tag.style.transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px) translate(-50%, -100%)`;
      }
    },
    result(done) {
      result.replaceChildren();
      const medal = el('div', 'atlas-result-medal', result);
      // The medal is markup this file writes, never anything from the job.
      medal.innerHTML = medalSvg(done.medal);
      el('div', 'atlas-result-kicker', result).textContent = 'Job done';
      el('div', 'atlas-result-medal-name', result).textContent = `${MEDAL_NAMES[done.medal] ?? 'No'} · ${done.title}`;
      el('div', 'atlas-result-time', result).textContent = done.time;
      const facts = el('div', 'atlas-result-facts', result);
      el('span', '', facts).textContent = `par ${done.par}`;
      el('span', '', facts).textContent = `+${done.points} reputation`;
      const standing = el('div', `atlas-job-result-standing${done.promoted !== null ? ' up' : ''}`, result);
      standing.textContent = done.promoted !== null ? `Now: ${done.promoted}` : done.standing;
      result.classList.add('on');
      clearTimeout(resultTimer);
      resultTimer = window.setTimeout(() => result.classList.remove('on'), RESULT_MS);
    },
    dispose() {
      clearTimeout(resultTimer);
      element.remove();
    },
  };
}
