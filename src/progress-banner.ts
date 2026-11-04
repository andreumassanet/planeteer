/**
 * The big moments, in the middle of the screen for a few seconds each: a
 * level reached (and what it unlocks to wear), a milestone's medal, a quest
 * of the Explorer's Path done, all of today's commissions done. One at a
 * time, queued, in the HUD's root so `H` hides them; the small ones are the
 * HUD's toast's.
 */
import { ensureStyle, h, icon } from './ui.ts';
import type { IconName } from './ui.ts';

export interface Moment {
  kind: 'level' | 'milestone' | 'quest' | 'daily' | 'unlock';
  /** "Level 7", "Globetrotter · Silver". */
  title: string;
  /** "+250 XP", or what it was for. */
  detail: string;
  /** What it unlocked to wear, by name. */
  unlocks?: readonly string[];
  /** For a level, its number on the badge; for a medal, its tier 1 to 3. */
  value?: number;
  icon?: IconName;
}

/** How long one stays up, ms, and the gap before the next. */
const HOLD_MS = 3400;
const GAP_MS = 350;
const MAX_QUEUE = 6;

const STYLE = `
.atlas-moment {
  position: absolute; left: 50%; top: 22%;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  min-width: 280px; max-width: min(460px, calc(100vw - 32px));
  padding: 16px 26px 16px;
  text-align: center;
  pointer-events: none;
  opacity: 0; transform: translate(-50%, 16px) scale(0.92);
  transition: opacity 0.25s ease, transform 0.45s var(--ui-spring);
}
.atlas-moment.on { opacity: 1; transform: translate(-50%, 0) scale(1); }
.atlas-moment-badge {
  display: grid; place-items: center;
  width: 72px; height: 72px; margin-top: -48px;
  border-radius: 50%; border: 3px solid var(--ui-ink);
  background: var(--ui-gold); color: var(--ui-ink);
  box-shadow: 0 4px 0 var(--ui-ink), 0 0 0 7px rgba(255, 214, 120, 0.35);
  font-size: 30px; font-weight: 900; font-variant-numeric: tabular-nums;
}
.atlas-moment-badge svg { width: 34px; height: 34px; }
.atlas-moment.tier1 .atlas-moment-badge { background: #c98a52; }
.atlas-moment.tier2 .atlas-moment-badge { background: #cfd4dc; }
.atlas-moment-kicker { font-size: 11.5px; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.65; }
.atlas-moment-title { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; line-height: 1.1; }
.atlas-moment-detail { font-size: 14px; font-weight: 800; opacity: 0.75; }
.atlas-moment-unlocks { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 4px; }
.atlas-moment-unlocks span { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; border: 2px solid var(--ui-ink); background: var(--ui-cream); font-size: 12.5px; font-weight: 900; }
.atlas-moment-unlocks svg { width: 13px; height: 13px; }
.atlas-moment-burst { position: absolute; inset: -30px; pointer-events: none; }
.atlas-moment-burst i { position: absolute; left: 50%; top: 18px; width: 9px; height: 9px; border-radius: 2px; background: var(--ui-gold); opacity: 0; }
.atlas-moment.on .atlas-moment-burst i { animation: atlas-moment-burst 1.1s ease-out forwards; }
@keyframes atlas-moment-burst {
  0% { opacity: 1; transform: translate(-50%, 0) rotate(0deg); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), var(--dy)) rotate(var(--spin)); }
}
html.touch-ui .atlas-moment { top: 26%; }
`;

const KICKER: Readonly<Record<Moment['kind'], string>> = {
  level: 'Level up',
  milestone: 'Milestone',
  quest: 'Quest complete',
  daily: 'Commissions done',
  unlock: 'Unlocked',
};

export interface Banner {
  show(moment: Moment): void;
  dispose(): void;
}

export function createBanner(parent: HTMLElement, sound?: (moment: Moment) => void): Banner {
  ensureStyle('atlas-moment', STYLE);
  const card = h('div', { class: 'atlas-moment ui-card', role: 'status', 'aria-live': 'polite' });
  parent.append(card);
  const queue: Moment[] = [];
  let timer = 0;
  let busy = false;

  function confetti(): HTMLElement {
    const burst = h('div', { class: 'atlas-moment-burst', 'aria-hidden': 'true' });
    const colours = ['var(--ui-gold)', 'var(--ui-crimson)', 'var(--ui-sky)', 'var(--ui-green)', 'var(--ui-apricot)'];
    for (let i = 0; i < 18; i++) {
      const bit = h('i');
      const angle = (i / 18) * Math.PI * 2 + (i % 3) * 0.2;
      const reach = 90 + (i % 4) * 28;
      bit.style.setProperty('--dx', `${Math.round(Math.cos(angle) * reach)}px`);
      bit.style.setProperty('--dy', `${Math.round(Math.sin(angle) * reach * 0.7 - 20)}px`);
      bit.style.setProperty('--spin', `${(i % 2 === 0 ? 1 : -1) * (180 + i * 20)}deg`);
      bit.style.background = colours[i % colours.length]!;
      bit.style.animationDelay = `${(i % 5) * 0.03}s`;
      burst.append(bit);
    }
    return burst;
  }

  function next(): void {
    const moment = queue.shift();
    if (moment === undefined) {
      busy = false;
      return;
    }
    busy = true;
    const badge = h('div', { class: 'atlas-moment-badge' });
    if (moment.kind === 'level' && moment.value !== undefined) badge.textContent = String(moment.value);
    else badge.append(icon(moment.icon ?? (moment.kind === 'quest' ? 'scroll' : moment.kind === 'daily' ? 'calendar' : moment.kind === 'unlock' ? 'sparkle' : 'trophy'), 34));
    card.className = `atlas-moment ui-card${moment.kind === 'milestone' && moment.value !== undefined ? ` tier${moment.value}` : ''}`;
    const children: (HTMLElement | null)[] = [
      confetti(),
      badge,
      h('div', { class: 'atlas-moment-kicker', text: KICKER[moment.kind] }),
      h('div', { class: 'atlas-moment-title', text: moment.title }),
      moment.detail === '' ? null : h('div', { class: 'atlas-moment-detail', text: moment.detail }),
      (moment.unlocks?.length ?? 0) === 0
        ? null
        : h('div', { class: 'atlas-moment-unlocks' }, ...moment.unlocks!.slice(0, 4).map((name) => h('span', {}, icon('sparkle', 13), name))),
    ];
    card.replaceChildren(...children.filter((child): child is HTMLElement => child !== null));
    // A frame for the class to take, so the entrance runs.
    requestAnimationFrame(() => card.classList.add('on'));
    sound?.(moment);
    timer = window.setTimeout(() => {
      card.classList.remove('on');
      timer = window.setTimeout(next, GAP_MS + 250);
    }, HOLD_MS);
  }

  return {
    show(moment) {
      if (queue.length >= MAX_QUEUE) queue.shift();
      queue.push(moment);
      if (!busy) next();
    },
    dispose() {
      clearTimeout(timer);
      queue.length = 0;
      card.remove();
    },
  };
}
