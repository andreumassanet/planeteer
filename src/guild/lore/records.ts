/** The Outfitter's and the Archivist's topics: what you wear, your level, milestones, the Hall of Fame, your account and your passport. */
import type { LoreTopic } from './types.ts';

export const RECORDS: readonly LoreTopic[] = [
  {
    id: 'wardrobe',
    title: 'Rewards to wear',
    icon: 'hat',
    role: 'outfitter',
    summary: 'Hats, things for your back, trails, titles and canopies, and how to unlock them.',
    pages: [
      {
        heading: 'Something to show off',
        text:
          'As well as your clothes, a traveller can wear rewards: hats, something carried on the back, a trail that follows you as you move, a title shown with your name and colours for your parachute. Other players see everything you wear.',
      },
      {
        heading: 'Unlocking them',
        text:
          'Rewards unlock as you play: by reaching a new level, by earning milestones, by finishing steps of the Explorer’s Path and by keeping up a streak of daily commissions. The Rewards page of your Field Guide shows what each one takes.',
      },
      {
        heading: 'Wearing them',
        text: 'Choose what to wear on the traveller’s card, the same place you change your clothes. Anything still locked says what it needs, so you always know what to aim for next.',
      },
    ],
  },
  {
    id: 'traveller-card',
    title: 'Your look and your name',
    icon: 'sparkle',
    role: 'outfitter',
    summary: 'The traveller’s card: your body, your clothes and your name.',
    pages: [
      {
        heading: 'The traveller’s card',
        text:
          'Choose Customise on the title screen to open the traveller’s card. Pick your body, skin, hair, top, bottom, shoes and rucksack, each with colours of its own. Every change shows at once, and Undo walks it back.',
      },
      {
        heading: 'Your name',
        text:
          'Your name floats over your head for the other players to read. Change it with the pencil beside it on the traveller’s card. With an account, your name is yours, and nobody else can take it.',
      },
      {
        heading: 'From the world',
        text: 'The Main menu button takes you back to the title screen, where Customise is. The menu remembers where you were, so you can carry on from the same spot afterwards.',
      },
    ],
  },
  {
    id: 'level',
    title: 'Level and experience',
    icon: 'star',
    role: 'archivist',
    summary: 'What earns experience, and what a new level brings.',
    pages: [
      {
        heading: 'Experience',
        text:
          'Almost everything you do earns experience: new countries and towns, landmarks and rings, jobs and courses, quests, milestones and daily commissions. The bigger the deed, the more it earns.',
      },
      {
        heading: 'Levels',
        text:
          'Fill the experience bar and you reach the next level; each level takes a little more than the one before. Your level shows on screen as you play and on the title screen, and new levels unlock rewards to wear.',
      },
      {
        heading: 'Ask the Archivist',
        text: 'The Archivist in any guild square can tell you your level, how far it is to the next one and everything you have achieved so far.',
      },
    ],
  },
  {
    id: 'milestones',
    title: 'Milestones',
    icon: 'trophy',
    role: 'archivist',
    summary: 'Long goals in three steps, counted across all your travels.',
    pages: [
      {
        heading: 'Long goals',
        text:
          'Milestones are long goals that grow with you, each with a bronze, a silver and a gold step. They count what you have done across all your travels, and every step you reach earns experience.',
      },
      {
        heading: 'What they count',
        text:
          'Countries stamped and towns walked into, landmark rings and course golds, jobs and rescues, distance on foot, on the road, in the air and at sea, your deepest dive, kinds of vehicle taken, people talked to, rockets launched, worlds stood on, photos taken and days played.',
      },
      {
        heading: 'Keeping track',
        text: 'The Milestones page of your Field Guide shows every one, the step you have reached and how far it is to the next. Some rewards to wear unlock with milestones.',
      },
    ],
  },
  {
    id: 'hall-of-fame',
    title: 'The Hall of Fame',
    icon: 'trophy',
    role: 'archivist',
    summary: 'The world’s top travellers, and the fastest times on every course.',
    pages: [
      {
        heading: 'The best travellers',
        text:
          'The Hall of Fame lists the world’s top travellers: by experience, by countries stamped, by landmarks, by course golds, by reputation and by towns. Read it on the board in any guild square, or ask the Archivist.',
      },
      {
        heading: 'Course records',
        text: 'Every ring course keeps its fastest times, so you can see the time to beat before you start. The Course marshal can show you the records for the courses nearby.',
      },
      {
        heading: 'Being on it',
        text: 'To appear in the Hall of Fame, sign in with an account. If you would rather not be listed, you can take yourself off it in Settings, on the Account page.',
      },
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts and saving',
    icon: 'lock',
    role: 'archivist',
    summary: 'What is saved where, and keeping it on every device.',
    pages: [
      {
        heading: 'Saved as you go',
        text: 'Your progress is saved on this device as you play: your passport, rings, best times, jobs, level and everything else. You do not need an account to keep it.',
      },
      {
        heading: 'An account',
        text:
          'An account is optional. Sign in with Discord, on the title screen or in Settings, and your name, your look, your passport and all your progress follow you to any device. Without one you play under a guest name.',
      },
      {
        heading: 'Two devices',
        text: 'Play on two devices and nothing is lost: when they meet, your progress is put together, keeping the best of both.',
      },
      {
        heading: 'Starting again',
        text:
          'In Settings, on the Account page, Reset progress empties every stamp, town, ring and best time, here and on your account; your name and your look stay. Delete account removes the account and what it kept, for good.',
      },
    ],
  },
  {
    id: 'passport',
    title: 'Your passport',
    icon: 'passport',
    role: 'archivist',
    summary: 'A stamp for every country you come down in, and every town you walk into.',
    pages: [
      {
        heading: 'Stamps',
        text:
          'Press {passport} to open your passport. Every country you come down in gets a stamp, dated, with the town you came in by. Flying over does not count: you have to be down on the ground or the water, walking, driving, swimming or sailing.',
        touch:
          'Tap the menu button (≡) and choose Passport. Every country you come down in gets a stamp, dated, with the town you came in by. Flying over does not count: you have to be down on the ground or the water, walking, driving, swimming or sailing.',
      },
      {
        heading: 'Its pages',
        text:
          'The stamps are grouped by continent, each with its own tab. After them come your Rings, your Courses and your Work, and every other world you visit gets a chapter of its own.',
      },
      {
        heading: 'Towns',
        text: 'The passport counts every town you have walked into, too. A town counts once you are in among its buildings, down on the ground.',
      },
    ],
  },
];
