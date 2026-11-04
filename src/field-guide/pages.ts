/** The Field Guide's four pages: the journal, the guide's topics, the milestones and the rewards. */
import { bar, commissionsCard, questCard, tierDots } from '../guild/cards.ts';
import { ROLE_INFO } from '../guild/roles.ts';
import type { LoreTopicView, MilestoneView, QuestView } from '../guild/services.ts';
import { paragraphsOf } from '../guild/text.ts';
import { h, icon } from '../ui.ts';
import type { IconName } from '../ui.ts';
import type { FieldGuideServices } from './types.ts';

function section(title: string, glyph: IconName, ...children: (Node | null)[]): HTMLElement {
  return h('section', { class: 'atlas-fg-section' }, h('h3', {}, icon(glyph, 16), title), ...children);
}

/** Where a quest not yet taken is taken: "Talk to the dispatcher at any Explorers' Guild". */
function waiting(quest: QuestView): string {
  return `Talk to the ${ROLE_INFO[quest.giver].title.toLowerCase()} at any Explorers’ Guild`;
}

/** A quest taken, or on offer with where to take it. */
function questCards(quests: readonly QuestView[]): HTMLElement[] {
  return [
    ...quests.filter((quest) => quest.state === 'active' || quest.state === 'ready').map((quest) => questCard(quest)),
    ...quests.filter((quest) => quest.state === 'offered').map((quest) => {
      const card = questCard(quest);
      card.classList.add('dim');
      card.append(h('div', { class: 'atlas-fg-tile-text', text: waiting(quest) }));
      return card;
    }),
  ];
}

export function journalPage(services: FieldGuideServices, signal: AbortSignal): HTMLElement[] {
  const quests = services.quests();
  const path = quests.filter((quest) => quest.chain === 'path');
  const contracts = quests.filter((quest) => quest.chain === 'contract');
  const done = quests.filter((quest) => quest.state === 'done');
  const out: HTMLElement[] = [];
  const guild = services.nearestGuild();
  const guildLine =
    guild === null
      ? null
      : h(
          'div',
          { class: 'atlas-fg-actions' },
          (() => {
            const button = h('button', { class: 'ui-btn primary', type: 'button' }, icon('compass'), `Lead me to the guild in ${guild}`);
            button.addEventListener('click', () => services.headToGuild(), { signal });
            return button;
          })(),
        );
  const pathDone = path.filter((quest) => quest.state === 'done').length;
  out.push(
    section(
      'The Explorer’s Path',
      'scroll',
      h('p', { text: `${pathDone} of ${path.length} done. The guild’s people hand out each step: a gold ! over somebody means they have one for you, a ? that they are waiting for you to come back.` }),
      ...questCards(path),
      guildLine,
    ),
  );
  const contractCards = questCards(contracts);
  const contractsDone = contracts.filter((quest) => quest.state === 'done').length;
  if (contractCards.length > 0 || contractsDone > 0) {
    out.push(
      section(
        'Guild contracts',
        'hand',
        h('p', { text: `${contractsDone} of ${contracts.length} done. After their step of the path, each of the guild’s people has a chain of contracts, one after another.` }),
        ...contractCards,
      ),
    );
  }
  const { list, bonus, streak } = services.commissions();
  out.push(
    section(
      'Today’s commissions',
      'calendar',
      h('p', { text: 'Three a day, the same for every traveller in the world, new at midnight UTC. Do them anywhere; the dispatcher at a guild keeps the list too.' }),
      commissionsCard(list, bonus, streak),
    ),
  );
  if (done.length > 0) {
    out.push(
      section(
        'Done',
        'star',
        h('div', { class: 'atlas-fg-grid' }, ...done.map((quest) => h('div', { class: 'atlas-fg-tile' }, h('div', { class: 'atlas-fg-tile-head' }, icon('star', 20), h('span', { class: 'atlas-fg-tile-name', text: quest.title })), h('div', { class: 'atlas-fg-tile-foot' }, h('span', { text: ROLE_INFO[quest.giver].title }), h('span', { text: `${quest.xp} XP` }))))),
      ),
    );
  }
  return out;
}

function topicButton(topic: LoreTopicView, read: boolean, open: (topic: LoreTopicView) => void, signal: AbortSignal): HTMLElement {
  const button = h('button', { class: `atlas-fg-topic${read ? ' read' : ''}`, type: 'button' }, icon(topic.icon, 18), h('span', {}, topic.title, h('small', { text: topic.summary })));
  button.addEventListener('click', () => open(topic), { signal });
  return button;
}

export function guidePage(services: FieldGuideServices, open: (topic: LoreTopicView) => void, signal: AbortSignal): HTMLElement[] {
  const topics = services.topics();
  const roles = [...new Set(topics.map((topic) => topic.role))];
  return roles.map((role) =>
    section(
      role === 'guide' ? 'Getting started' : ROLE_INFO[role].title,
      ROLE_INFO[role].icon,
      h('div', { class: 'atlas-fg-topics' }, ...topics.filter((topic) => topic.role === role).map((topic) => topicButton(topic, services.isRead(topic.id), open, signal))),
    ),
  );
}

export function topicReader(services: FieldGuideServices, topic: LoreTopicView, back: () => void, open: (topic: LoreTopicView) => void, signal: AbortSignal): HTMLElement[] {
  const topics = services.topics();
  const at = topics.findIndex((candidate) => candidate.id === topic.id);
  const next = topics[at + 1];
  const backButton = h('button', { class: 'ui-btn small quiet', type: 'button' }, icon('back'), 'All topics');
  backButton.addEventListener('click', back, { signal });
  const actions = h('div', { class: 'atlas-fg-actions' }, backButton);
  if (next !== undefined) {
    const nextButton = h('button', { class: 'ui-btn small primary', type: 'button' }, `Next: ${next.title}`, icon('next'));
    nextButton.addEventListener('click', () => open(next), { signal });
    actions.append(nextButton);
  }
  return [
    h(
      'article',
      { class: 'atlas-fg-reader' },
      h('h2', {}, icon(topic.icon, 24), topic.title),
      h('p', { class: 'atlas-fg-summary', text: topic.summary }),
      ...topic.pages.flatMap((page) => [h('h4', { text: page.heading }), ...paragraphsOf(page.text)]),
      actions,
    ),
  ];
}

const TIER_WORD = ['Not yet', 'Bronze', 'Silver', 'Gold'];

function milestoneTile(milestone: MilestoneView): HTMLElement {
  const target = milestone.next;
  const fraction = target === null ? 1 : Math.min(1, milestone.value / Math.max(1, target));
  return h(
    'div',
    { class: `atlas-fg-tile${milestone.tier === 0 ? ' dim' : ''}` },
    h('div', { class: 'atlas-fg-tile-head' }, icon(milestone.icon, 20), h('span', { class: 'atlas-fg-tile-name', text: milestone.title }), tierDots(milestone.tier)),
    h('div', { class: 'atlas-fg-tile-text', text: milestone.description }),
    bar(fraction),
    h(
      'div',
      { class: 'atlas-fg-tile-foot' },
      h('span', { text: TIER_WORD[milestone.tier] ?? '' }),
      h('span', { text: target === null ? `${Math.floor(milestone.value)} ${milestone.unit}` : `${Math.floor(milestone.value)} / ${target} ${milestone.unit}` }),
    ),
  );
}

export function milestonesPage(services: FieldGuideServices): HTMLElement[] {
  const milestones = services.milestones();
  const medals = milestones.reduce((sum, milestone) => sum + milestone.tier, 0);
  return [
    section(
      'Milestones',
      'trophy',
      h('p', { text: `${medals} of ${milestones.length * 3} medals. Each milestone has a bronze, a silver and a gold; each medal adds to your level, and some unlock something to wear.` }),
      h('div', { class: 'atlas-fg-grid' }, ...milestones.map(milestoneTile)),
    ),
  ];
}

export function rewardsPage(services: FieldGuideServices, signal: AbortSignal): HTMLElement[] {
  const level = services.level().level;
  const wardrobe = h('button', { class: 'ui-btn primary', type: 'button' }, icon('sparkle'), 'Open my wardrobe');
  wardrobe.addEventListener('click', () => services.openWardrobe(), { signal });
  const track = services.rewards().map((row) =>
    h(
      'div',
      { class: `atlas-fg-level${row.level <= level ? ' reached' : ''}${row.level === level ? ' current' : ''}` },
      h('b', { text: `Lv ${row.level}` }),
      h(
        'div',
        { class: 'atlas-fg-chips' },
        ...row.items.map((item) => h('span', { class: `atlas-fg-chip${item.unlocked ? ' gold' : ''}` }, icon(item.unlocked ? 'sparkle' : 'lock', 13), `${item.name} · ${item.slot}`)),
      ),
    ),
  );
  const others = services.others();
  return [
    section('By level', 'rise', h('p', { text: 'Every level or two brings something new to wear. Everybody you meet sees it.' }), h('div', { class: 'atlas-fg-track' }, ...track), h('div', { class: 'atlas-fg-actions' }, wardrobe)),
    section(
      'Earned on the way',
      'trophy',
      h('div', { class: 'atlas-fg-grid' }, ...others.map((item) => h('div', { class: `atlas-fg-tile${item.unlocked ? '' : ' dim'}` }, h('div', { class: 'atlas-fg-tile-head' }, icon(item.unlocked ? 'sparkle' : 'lock', 20), h('span', { class: 'atlas-fg-tile-name', text: item.name })), h('div', { class: 'atlas-fg-tile-text', text: `${item.slot} · ${item.condition}` })))),
    ),
  ];
}
