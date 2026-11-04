/**
 * What the guild's people show you under their line: a quest and what it is
 * worth, a reward being handed over, today's commissions, how far you have
 * come, a list to choose from. Small pieces of the dialogue card's glass,
 * text only through `textContent`.
 */
import { ensureStyle, h, icon } from '../ui.ts';
import type { IconName } from '../ui.ts';
import type { CommissionView, LevelView, MilestoneView, QuestView } from './services.ts';

const STYLE = `
.gd-card { border-radius: 13px; padding: 10px 12px; background: rgba(255, 242, 232, 0.06); border: 1.5px solid var(--ui-glass-edge, rgba(255, 242, 232, 0.16)); }
.gd-card + .gd-card { margin-top: 8px; }
.gd-card.dim { opacity: 0.62; }
.gd-kicker { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ui-gold); }
.gd-kicker svg { width: 14px; height: 14px; }
.gd-title { font-size: 16px; font-weight: 900; margin-top: 3px; }
.gd-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.gd-row { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 800; }
.gd-row svg { flex: none; width: 17px; height: 17px; opacity: 0.85; }
.gd-row .gd-grow { flex: 1; min-width: 0; }
.gd-row small { display: block; font-size: 12px; font-weight: 700; color: var(--ui-muted); }
.gd-count { flex: none; font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 900; color: var(--ui-muted); }
.gd-row.done .gd-count { color: var(--ui-green); }
.gd-row.done .gd-grow { text-decoration: line-through; text-decoration-thickness: 2px; opacity: 0.7; }
.gd-bar { height: 7px; border-radius: 99px; background: rgba(255, 242, 232, 0.12); overflow: hidden; margin-top: 4px; }
.gd-bar i { display: block; height: 100%; border-radius: inherit; background: var(--ui-gold); transform-origin: left; }
.gd-reward { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.gd-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px; font-size: 12.5px; font-weight: 900; background: rgba(255, 242, 232, 0.1); }
.gd-chip.gold { background: var(--ui-gold); color: #1e0603; }
.gd-chip svg { width: 13px; height: 13px; }
.gd-level { display: flex; align-items: center; gap: 12px; }
.gd-level-badge { flex: none; display: grid; place-items: center; width: 54px; height: 54px; border-radius: 50%; background: var(--ui-gold); color: #1e0603; font-size: 22px; font-weight: 900; box-shadow: 0 0 0 4px rgba(255, 242, 232, 0.12); }
.gd-tiers { display: flex; gap: 3px; }
.gd-tiers i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255, 242, 232, 0.16); }
.gd-tiers i.t1 { background: #c98a52; } .gd-tiers i.t2 { background: #cfd4dc; } .gd-tiers i.t3 { background: var(--ui-gold); }
`;

function style(): void {
  ensureStyle('atlas-guild-cards', STYLE);
}

/** A bar `fraction` full. */
export function bar(fraction: number): HTMLElement {
  const fill = h('i');
  fill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction)).toFixed(3)})`;
  return h('div', { class: 'gd-bar' }, fill);
}

function kicker(name: IconName, text: string): HTMLElement {
  return h('div', { class: 'gd-kicker' }, icon(name, 14), text);
}

function rewardChips(xp: number, unlocks: readonly string[]): HTMLElement {
  return h(
    'div',
    { class: 'gd-reward' },
    h('span', { class: 'gd-chip gold' }, icon('star', 13), `${xp} XP`),
    ...unlocks.map((name) => h('span', { class: 'gd-chip' }, icon('sparkle', 13), name)),
  );
}

/** A quest as offered, or under way: its objectives with how far each has come, and its reward. */
export function questCard(quest: QuestView): HTMLElement {
  style();
  const rows = quest.objectives.map((objective) => {
    const done = objective.done >= objective.count;
    return h(
      'div',
      { class: `gd-row${done ? ' done' : ''}` },
      icon(done ? 'star' : 'chevron', 17),
      h('span', { class: 'gd-grow', text: objective.label }),
      objective.count > 1 ? h('span', { class: 'gd-count', text: `${Math.min(objective.done, objective.count)} / ${objective.count}` }) : null,
    );
  });
  const word = quest.state === 'ready' ? 'Ready to hand in' : quest.state === 'active' ? 'Under way' : 'Quest';
  return h(
    'div',
    { class: 'gd-card' },
    kicker('scroll', `The Explorer’s Path · ${word}`),
    h('div', { class: 'gd-title', text: quest.title }),
    h('div', { class: 'gd-rows' }, ...rows),
    rewardChips(quest.xp, quest.unlocks),
  );
}

/** A reward handed over: the XP, anything to wear, and a level reached. */
export function rewardCard(title: string, xp: number, unlocks: readonly string[], levelUp: number | null): HTMLElement {
  style();
  return h(
    'div',
    { class: 'gd-card' },
    kicker('trophy', 'Quest complete'),
    h('div', { class: 'gd-title', text: title }),
    rewardChips(xp, unlocks),
    levelUp === null ? null : h('div', { class: 'gd-rows' }, h('div', { class: 'gd-row' }, icon('rise', 17), h('span', { class: 'gd-grow', text: `Level ${levelUp} reached` }))),
  );
}

/** Today's three commissions, each with its progress, and the bonus for all three. */
export function commissionsCard(list: readonly CommissionView[], bonus: number, streak: number): HTMLElement {
  style();
  const all = list.length > 0 && list.every((commission) => commission.complete);
  return h(
    'div',
    { class: 'gd-card' },
    kicker('calendar', all ? 'Today’s commissions · all done' : 'Today’s commissions'),
    h(
      'div',
      { class: 'gd-rows' },
      ...list.map((commission) =>
        h(
          'div',
          { class: `gd-row${commission.complete ? ' done' : ''}` },
          icon(commission.complete ? 'star' : 'chevron', 17),
          h('span', { class: 'gd-grow' }, commission.title, bar(commission.done / Math.max(1, commission.count))),
          h('span', { class: 'gd-count', text: `${Math.min(commission.done, commission.count)} / ${commission.count}` }),
          h('span', { class: 'gd-chip', text: `${commission.xp} XP` }),
        ),
      ),
    ),
    h(
      'div',
      { class: 'gd-reward' },
      h('span', { class: all ? 'gd-chip gold' : 'gd-chip' }, icon('trophy', 13), `All three: +${bonus} XP`),
      streak > 0 ? h('span', { class: 'gd-chip' }, icon('calendar', 13), `${streak}-day streak`) : null,
    ),
  );
}

/** The level, its bar, and the milestones' tiers in a row. */
export function levelCard(level: LevelView, milestones: readonly MilestoneView[]): HTMLElement {
  style();
  const span = Math.max(1, level.to - level.from);
  const tiers = milestones.reduce((sum, milestone) => sum + milestone.tier, 0);
  return h(
    'div',
    { class: 'gd-card' },
    h(
      'div',
      { class: 'gd-level' },
      h('span', { class: 'gd-level-badge', text: String(level.level) }),
      h(
        'div',
        { class: 'gd-grow', style: 'flex:1;min-width:0' },
        h('div', { class: 'gd-title', text: `Level ${level.level}` }),
        bar((level.xp - level.from) / span),
        h('div', { class: 'gd-count', style: 'margin-top:4px', text: `${level.xp - level.from} / ${span} XP to level ${level.level + 1}` }),
      ),
    ),
    h(
      'div',
      { class: 'gd-rows' },
      h('div', { class: 'gd-row' }, icon('trophy', 17), h('span', { class: 'gd-grow', text: `${tiers} of ${milestones.length * 3} milestone medals` })),
    ),
  );
}

/** A plain list of lines, each with an icon and a note. */
export function rowsCard(title: string, glyph: IconName, rows: readonly { icon: IconName; text: string; note?: string; count?: string }[]): HTMLElement {
  style();
  return h(
    'div',
    { class: 'gd-card' },
    kicker(glyph, title),
    h(
      'div',
      { class: 'gd-rows' },
      ...rows.map((row) =>
        h(
          'div',
          { class: 'gd-row' },
          icon(row.icon, 17),
          h('span', { class: 'gd-grow' }, row.text, row.note ? h('small', { text: row.note }) : null),
          row.count ? h('span', { class: 'gd-count', text: row.count }) : null,
        ),
      ),
    ),
  );
}

/** A milestone's three tiers as dots. */
export function tierDots(tier: number): HTMLElement {
  style();
  return h('span', { class: 'gd-tiers' }, ...[1, 2, 3].map((t) => h('i', { class: t <= tier ? `t${t}` : '' })));
}
