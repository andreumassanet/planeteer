/**
 * What the guild's people say, as nodes of the dialogue card (`dialogue.ts`):
 * a greeting, then the quests they have for you (a gold `!` to take, a `?` to
 * hand in), what their role is for, the topics they can teach, and goodbye.
 * Every node is built when it is shown, from the services' views, so an
 * answer always reflects what is true now.
 */
import type { DialogueNode, DialogueOption } from './dialogue.ts';
import { commissionsCard, levelCard, questCard, rewardCard, rowsCard } from './cards.ts';
import { ROLE_INFO } from './roles.ts';
import type { GuildRole } from './roles.ts';
import type { GuildServices, LoreTopicView, QuestView } from './services.ts';

const KIND_ICON = { errand: 'hand', taxi: 'car', cargo: 'plane', rescue: 'swim' } as const;
const COURSE_ICON = { air: 'plane', land: 'car', sea: 'boat' } as const;
const SUGGESTION_ICON = { landmark: 'pin', country: 'flag', town: 'walk', guild: 'star' } as const;
const MEDAL_WORD = ['', 'bronze', 'silver', 'gold'];

export interface ConversationContext {
  services: GuildServices;
  role: GuildRole;
  /** The speaker's key, which seeds what they say. */
  key: string;
  square: number;
  /** Whether this is the first time they meet. */
  first: boolean;
}

function goodbye(c: ConversationContext): DialogueOption {
  return {
    label: 'Goodbye',
    icon: 'exit',
    tone: 'quiet',
    run: () => ({ text: c.services.farewell(c.role, c.key), options: [{ label: 'Leave', icon: 'exit', tone: 'quiet', leaves: true, run: () => null }] }),
  };
}

function back(c: ConversationContext, label = 'Something else'): DialogueOption {
  return { label, icon: 'back', tone: 'quiet', run: () => root(c, false) };
}

function questOffer(c: ConversationContext, quest: QuestView): DialogueNode {
  return {
    text: quest.offer,
    extra: questCard(quest),
    options: [
      {
        label: 'I’ll do it',
        icon: 'star',
        tone: 'primary',
        run: () => {
          c.services.accept(quest.id);
          return { text: 'Wonderful. Come back to me when it is done — your Field Guide ({journal}) keeps track of it meanwhile.', options: [back(c, 'Thanks'), goodbye(c)] };
        },
      },
      back(c, 'Not now'),
    ],
  };
}

function questTurnIn(c: ConversationContext, quest: QuestView): DialogueNode {
  const reward = c.services.turnIn(quest.id);
  if (reward === null) return { text: 'Hm, not quite yet. Have another look at what is left.', extra: questCard(quest), options: [back(c), goodbye(c)] };
  return {
    text: quest.thanks,
    extra: rewardCard(quest.title, reward.xp, reward.unlocks, reward.levelUp),
    options: [back(c, 'Thank you'), goodbye(c)],
  };
}

function questProgress(c: ConversationContext, quest: QuestView): DialogueNode {
  return { text: 'Here is where you are with it.', extra: questCard(quest), options: [back(c), goodbye(c)] };
}

/** A topic's page, with the way on, back and out. */
function topicPage(c: ConversationContext, topic: LoreTopicView, page: number): DialogueNode {
  const at = topic.pages[page]!;
  if (page === 0) c.services.read(topic.id);
  const options: DialogueOption[] = [];
  if (page + 1 < topic.pages.length) options.push({ label: `Go on: ${topic.pages[page + 1]!.heading}`, icon: 'next', tone: 'primary', run: () => topicPage(c, topic, page + 1) });
  if (page > 0) options.push({ label: 'Back a page', icon: 'back', run: () => topicPage(c, topic, page - 1) });
  options.push({ label: 'Another topic', icon: 'book', run: () => topicList(c, c.role) });
  options.push(goodbye(c));
  return { text: `${at.heading}\n\n${at.text}`, options };
}

function topicList(c: ConversationContext, role: GuildRole | null): DialogueNode {
  const topics = c.services.topics(role);
  const options: DialogueOption[] = topics.slice(0, 7).map((topic) => ({ label: topic.title, icon: topic.icon, run: () => topicPage(c, topic, 0) }));
  if (role !== null && c.services.topics(null).length > topics.length) {
    options.push({ label: 'Everything else, in the Field Guide', icon: 'book', run: () => {
      c.services.openJournal('guide');
      return null;
    } });
  }
  options.push(back(c));
  return { text: role === 'guide' ? 'Ask me anything. Which would you like?' : 'I can tell you about these.', options };
}

/** What every role offers first: the quests they hold, ready ones first. */
function questOptions(c: ConversationContext): DialogueOption[] {
  const out: DialogueOption[] = [];
  for (const quest of c.services.quests(c.role)) {
    if (quest.state === 'ready') out.push({ label: `Hand in: ${quest.title}`, icon: 'scroll', badge: 'ready', tone: 'primary', run: () => questTurnIn(c, quest) });
  }
  for (const quest of c.services.quests(c.role)) {
    if (quest.state === 'offered') out.push({ label: `New quest: ${quest.title}`, icon: 'scroll', badge: 'quest', run: () => questOffer(c, quest) });
    else if (quest.state === 'active') out.push({ label: `How is “${quest.title}” going?`, icon: 'scroll', run: () => questProgress(c, quest) });
  }
  return out;
}

function guideOptions(c: ConversationContext): DialogueOption[] {
  return [
    {
      label: 'What should I do next?',
      icon: 'compass',
      run: () => {
        const next = c.services.quests(null).find((quest) => quest.state === 'offered' || quest.state === 'ready' || quest.state === 'active');
        if (next === undefined) return { text: 'You have walked the whole Explorer’s Path. Now the world is yours: try today’s commissions with the dispatcher, a course with the marshal, or ask the cartographer where nobody has been yet.', options: [back(c), goodbye(c)] };
        const who = ROLE_INFO[next.giver].title.toLowerCase();
        const doing = next.state === 'active' ? `You are on “${next.title}”.` : next.state === 'ready' ? `“${next.title}” is done: hand it in to the ${who}.` : `The ${who} has “${next.title}” for you.`;
        return { text: `${doing} Every quest is in your Field Guide ({journal}), with how far you have come.`, extra: questCard(next), options: [back(c), goodbye(c)] };
      },
    },
    { label: 'Teach me how things work', icon: 'book', run: () => topicList(c, 'guide') },
    { label: 'Open the Field Guide', icon: 'book', run: () => {
      c.services.openJournal('guide');
      return null;
    } },
  ];
}

function dispatcherOptions(c: ConversationContext): DialogueOption[] {
  return [
    {
      label: 'Today’s commissions',
      icon: 'calendar',
      run: () => {
        const { list, bonus, streak } = c.services.commissions();
        return { text: 'Three a day, the same for every traveller in the world. Do them anywhere, in any order; each pays, and all three pay a bonus.', extra: commissionsCard(list, bonus, streak), options: [back(c), goodbye(c)] };
      },
    },
    {
      label: 'Any jobs round here?',
      icon: 'hand',
      run: () => jobsNode(c),
    },
    { label: 'How do jobs work?', icon: 'book', run: () => topicList(c, 'dispatcher') },
  ];
}

function jobsNode(c: ConversationContext): DialogueNode {
  const jobs = c.services.jobs().slice(0, 6);
  if (jobs.length === 0) return { text: 'Nothing on the board near here just now. The board turns over every day; out in the streets people still ask for help — press {jobs} to head for the nearest.', options: [back(c), goodbye(c)] };
  return {
    text: 'Here is what is on the board. Pick one and I will point you to where it starts; press {jobs} any time to head for another.',
    options: [
      ...jobs.map<DialogueOption>((job) => ({
        label: `${job.title} · ${job.distance}`,
        icon: KIND_ICON[job.kind],
        badge: job.tracked ? 'new' : null,
        run: () => {
          const ok = c.services.track(job.id);
          return ok
            ? { text: `${job.detail}. Follow the chevrons to where it starts, and press {use} there.`, options: [back(c, 'Thanks'), goodbye(c)] }
            : { text: 'Ah, somebody has just taken that one. Have a look at the rest.', options: [{ label: 'Show me again', icon: 'hand', run: () => jobsNode(c) }, back(c)] };
        },
      })),
      back(c),
    ],
  };
}

function marshalOptions(c: ConversationContext): DialogueOption[] {
  return [
    { label: 'Which courses are near?', icon: 'flag', run: () => coursesNode(c) },
    { label: 'How do the rings work?', icon: 'book', run: () => topicList(c, 'marshal') },
  ];
}

function coursesNode(c: ConversationContext): DialogueNode {
  const courses = c.services.courses().slice(0, 6);
  if (courses.length === 0) return { text: 'No course starts near here. Every big country has an air course round its capital, a rally out along its roads, and every sea a race off a port: ask the cartographer, or look for the green start rings.', options: [back(c), goodbye(c)] };
  return {
    text: 'These start near here. A course shows itself only to the right kind of vehicle: a plane for the air, a car for the rally, a boat for the sea.',
    options: [
      ...courses.map<DialogueOption>((course) => ({
        label: `${course.name} · ${course.distance}`,
        icon: COURSE_ICON[course.kind],
        badge: course.best === null ? 'new' : null,
        run: () => courseNode(c, course.id),
      })),
      back(c),
    ],
  };
}

function courseNode(c: ConversationContext, id: string): DialogueNode {
  const course = c.services.courses().find((candidate) => candidate.id === id);
  if (course === undefined) return coursesNode(c);
  const best = course.best === null ? 'You have not run it yet.' : `Your best is ${course.best.time}, ${MEDAL_WORD[course.best.medal] ?? 'a medal'}.`;
  return {
    text: `${course.name}. ${best} Here are the fastest anybody has gone.`,
    extra: c.services.courseBoard(course.id),
    options: [
      { label: 'Lead me to the start', icon: 'compass', tone: 'primary', run: () => {
        c.services.lead(course.id);
        return { text: 'Follow the chevrons. Through the green ring and the clock starts; through the middle of a ring is a perfect and takes time off.', options: [back(c, 'Thanks'), goodbye(c)] };
      } },
      { label: 'Other courses', icon: 'flag', run: () => coursesNode(c) },
      back(c),
    ],
  };
}

function outfitterOptions(c: ConversationContext): DialogueOption[] {
  return [
    {
      label: 'What can I wear?',
      icon: 'hat',
      run: () => {
        const wardrobe = c.services.wardrobe();
        const rows = [
          ...wardrobe.fresh.slice(0, 4).map((name) => ({ icon: 'sparkle' as const, text: name, note: 'New for you' })),
          ...wardrobe.next.slice(0, 4).map((item) => ({ icon: 'lock' as const, text: item.name, note: item.condition })),
        ];
        return {
          text: `You have ${wardrobe.unlocked} of ${wardrobe.total} things to wear. Levels, milestones and quests unlock the rest — everybody you meet sees what you have on.`,
          extra: rows.length === 0 ? null : rowsCard('Your wardrobe', 'hat', rows),
          options: [
            { label: 'Open my wardrobe', icon: 'sparkle', tone: 'primary', run: () => {
              c.services.openWardrobe();
              return null;
            } },
            back(c),
          ],
        };
      },
    },
    { label: 'Tell me about looks', icon: 'book', run: () => topicList(c, 'outfitter') },
  ];
}

function archivistOptions(c: ConversationContext): DialogueOption[] {
  const account = c.services.account();
  const options: DialogueOption[] = [
    {
      label: 'How am I doing?',
      icon: 'trophy',
      run: () => ({
        text: 'Everything you do adds to your experience: towns walked into, countries stamped, rings, courses, jobs, quests and commissions, and the milestones on the way.',
        extra: levelCard(c.services.level(), c.services.milestones()),
        options: [
          { label: 'See my milestones', icon: 'trophy', run: () => {
            c.services.openJournal('milestones');
            return null;
          } },
          back(c),
        ],
      }),
    },
    { label: 'Show me the Hall of Fame', icon: 'star', run: () => {
      c.services.hallOfFame();
      return null;
    } },
  ];
  if (account.available) {
    options.push(
      account.signedIn
        ? { label: `My account (${account.name ?? 'signed in'})`, icon: 'link', run: () => ({ text: 'Your progress is kept with your account, so it follows you to any device you sign in on. You can hide from the Hall of Fame or delete the account in Settings.', options: [back(c), goodbye(c)] }) }
        : {
            label: 'Keep my progress safe',
            icon: 'link',
            badge: 'new',
            run: () => ({
              text: 'Sign in with Discord and everything you have done is kept with your account: on any device, and on the Hall of Fame. Nothing is lost on this one meanwhile.',
              options: [
                { label: 'Sign in with Discord', icon: 'link', tone: 'primary', run: () => {
                  c.services.signIn();
                  return null;
                } },
                back(c, 'Maybe later'),
              ],
            }),
          },
    );
  }
  options.push({ label: 'Open my passport', icon: 'passport', run: () => {
    c.services.openPassport();
    return null;
  } });
  return options;
}

function cartographerOptions(c: ConversationContext): DialogueOption[] {
  return [
    { label: 'Where should I go?', icon: 'compass', run: () => suggestionsNode(c) },
    { label: 'Open the map', icon: 'map', run: () => {
      c.services.openMap();
      return null;
    } },
    { label: 'Tell me about the map', icon: 'book', run: () => topicList(c, 'cartographer') },
  ];
}

function suggestionsNode(c: ConversationContext): DialogueNode {
  const list = c.services.suggestions().slice(0, 6);
  if (list.length === 0) return { text: 'You have seen more than my maps show! Try the other worlds — a rocket waits beside many airstrips.', options: [back(c), goodbye(c)] };
  return {
    text: 'Here is what I would see next. Choose one and the compass, the minimap and the guide all point at it.',
    options: [
      ...list.map<DialogueOption>((item) => ({
        label: item.name,
        icon: SUGGESTION_ICON[item.kind],
        disabled: null,
        run: () => {
          c.services.head(item.id);
          return { text: `${item.name}, ${item.detail}. Safe travels!`, options: [back(c, 'Thanks'), goodbye(c)] };
        },
      })),
      back(c),
    ],
  };
}

const ROLE_OPTIONS: Readonly<Record<GuildRole, (c: ConversationContext) => DialogueOption[]>> = {
  guide: guideOptions,
  dispatcher: dispatcherOptions,
  marshal: marshalOptions,
  outfitter: outfitterOptions,
  archivist: archivistOptions,
  cartographer: cartographerOptions,
};

/** The first node: their greeting, then what they have for you. */
export function root(c: ConversationContext, greeting: boolean): DialogueNode {
  const text = greeting ? c.services.greeting(c.role, c.first, c.key) : 'What else can I do for you?';
  return { text, options: [...questOptions(c), ...ROLE_OPTIONS[c.role](c), goodbye(c)] };
}

/** The mark a guild person wears for this player now: something to hand in, something new, or today's commissions open. */
export function markOf(services: GuildServices, role: GuildRole): 'ready' | 'quest' | 'daily' | null {
  if (services.mark !== undefined) return services.mark(role);
  const quests = services.quests(role);
  if (quests.some((quest) => quest.state === 'ready')) return 'ready';
  if (quests.some((quest) => quest.state === 'offered')) return 'quest';
  if (role === 'dispatcher' && services.commissions().list.some((commission) => !commission.complete)) return 'daily';
  return null;
}
