/**
 * What the guild's people say round the topics: each role's greetings, the
 * names they go by, and the tips said while the world loads or a guild person
 * idles. Greetings and tips are lines like a page's text, `{action}` and all.
 */
import type { GuildRole } from '../roles.ts';
import type { Greetings } from './types.ts';

export const GREETINGS: Readonly<Record<GuildRole, Greetings>> = {
  guide: {
    first: [
      'Welcome to the Explorers’ Guild! I’m the Guide. Anything about how the world works, from walking to flying, just ask me.',
      'A new face! Hello, traveller. I’m the Guide here: I answer questions, all of them, even the silly ones. Especially the silly ones.',
      'Ah, you found us. I’m the guild’s Guide. If you are wondering how to do something, I have probably been asked it before.',
      'Hello and welcome! I’m the Guide. New travellers start with me, and I have a little path of quests to set you on.',
      'Come in, come in. I’m the Guide. The whole planet is out there waiting, and I can tell you how to get about it.',
    ],
    again: [
      'Back again! What would you like to know?',
      'Hello, traveller. Lost, curious, or both?',
      'Good to see you. Ask away.',
      'You look like somebody with a question.',
      'Welcome back to the guild. How are your travels going?',
      'Ah, it’s you! Stuck on something?',
      'There you are. Anything I can explain?',
    ],
    farewell: [
      'Off you go, then. The world is big, but you are bigger.',
      'Safe travels!',
      'Come back any time. I’m always here.',
      'Remember, your Field Guide has all my advice: {journal}.',
    ],
  },
  dispatcher: {
    first: [
      'Hello! I’m the Dispatcher. Errands, fares, loads, rescues: if somebody needs a hand, I know about it.',
      'A fresh pair of hands! I’m the Dispatcher. I find work for travellers, and every town has some going.',
      'Welcome to the guild. I’m the Dispatcher: jobs and today’s commissions come through me.',
      'You look like somebody who can drive. I’m the Dispatcher, and I have work if you want it.',
    ],
    again: [
      'Back for more work? Good, there is plenty.',
      'Hello again. Looking for a job?',
      'There you are! People have been asking for help.',
      'Welcome back. Today’s commissions are on the board.',
      'Ah, my favourite helper. What can I find you?',
      'Busy day out there. Fancy a job?',
    ],
    farewell: [
      'Off to work, then. Mind the par!',
      'Thanks for the help. Come back tomorrow for new commissions.',
      'Good luck out there!',
      'Remember, {jobs} finds you the nearest job.',
    ],
  },
  marshal: {
    first: [
      'Hello there! I’m the Course marshal. Rings in the sky, on the roads and on the sea, and a clock on all of them.',
      'Welcome! I run the ring courses round here. Fast is good. Through the middle is better.',
      'A new racer? I’m the Course marshal. Ask me about rings, courses, medals or records.',
      'Hello! I’m the Course marshal. There is a gold ring over every landmark in the world, and somebody has to collect them.',
    ],
    again: [
      'Back for another run?',
      'Hello again! Feeling fast today?',
      'There’s a record out there with your name on it. Maybe.',
      'Welcome back. Ready, set…',
      'Good to see you. How are the medals coming along?',
      'Ah, a familiar face. The rings are waiting.',
    ],
    farewell: [
      'Go on, then. Through the middle!',
      'Good luck, and watch for the green ring.',
      'Fly fast, drive faster.',
      'See you at the finish!',
    ],
  },
  outfitter: {
    first: [
      'Oh, hello! I’m the Outfitter. Hats, trails, titles, a canopy in your colours: let’s make you look like an explorer.',
      'Welcome! I’m the Outfitter. Everything you earn on your travels, you can wear, and I’ll show you how.',
      'A new traveller! I’m the Outfitter. Not bad, not bad. We can do better, though.',
      'Hello there. I’m the guild’s Outfitter: what you can wear, what you have unlocked and what comes next.',
    ],
    again: [
      'Back already? Let me look at you.',
      'Hello again! Anything new to try on?',
      'Ooh, you have been busy. Have you seen what you unlocked?',
      'Welcome back. Looking sharp!',
      'There you are! I was just thinking about hats.',
      'Hello, hello. Fancy a new look?',
    ],
    farewell: [
      'Off you go, and look good doing it.',
      'Come back when you have unlocked something!',
      'Bye for now. Wear it well.',
      'Remember: a good hat is half the journey.',
    ],
  },
  archivist: {
    first: [
      'Welcome. I’m the Archivist. I keep the records: your level, your milestones and the Hall of Fame.',
      'Hello, traveller. I’m the Archivist. Every step you take, someone ought to write down. That someone is me.',
      'A new name for the records! I’m the Archivist. Ask me about your progress, your passport or your account.',
      'Good day. I’m the Archivist. If you want to know how far you have come, I have the numbers.',
    ],
    again: [
      'Ah, back again. Let me find your file.',
      'Hello. Your records are looking healthier every day.',
      'Welcome back. Shall we see how you are doing?',
      'Here again? Splendid. More to write down, I hope.',
      'Hello, traveller. The Hall of Fame has been busy.',
      'Good to see you. Your passport is filling up nicely.',
    ],
    farewell: [
      'Go and make some history. I’ll write it down.',
      'Until next time.',
      'Off you go. The records will be here.',
      'Safe travels. Do come back with stamps.',
    ],
  },
  cartographer: {
    first: [
      'Hello! I’m the Cartographer. If you are wondering where to go next, I have a few ideas. Well, a whole planet of them.',
      'Welcome, traveller. I’m the Cartographer: maps, landmarks, countries and towns not yet seen.',
      'A new explorer! I’m the guild’s Cartographer. Every country out there is real, and I know them all.',
      'Hello there. I’m the Cartographer. Ask me about the maps, or about the worlds past this one.',
    ],
    again: [
      'Back from your travels? Where did you get to?',
      'Hello again! Fancy somewhere new?',
      'Welcome back. The map has a few blank spots left for you.',
      'There you are. I’ve been looking at the map again.',
      'Hello, traveller. North is that way, by the way.',
      'Good to see you. Have you been to the other worlds yet?',
    ],
    farewell: [
      'Off you go. Somewhere new, I hope!',
      'Safe travels, and keep an eye on the horizon.',
      'Remember, {map} shows you the whole planet.',
      'Happy wandering!',
    ],
  },
};

/** Given names from many places, for the guild's people. */
export const NAMES: readonly string[] = [
  'Amara', 'Kenji', 'Sofia', 'Mateo', 'Aiyana', 'Ravi', 'Leilani', 'Olusegun', 'Ingrid', 'Tariq',
  'Mei', 'Diego', 'Anouk', 'Kwame', 'Yuki', 'Esperanza', 'Farida', 'Lars', 'Priya', 'Tomás',
  'Nia', 'Arjun', 'Zainab', 'Siosaia', 'Marisol', 'Aleksander', 'Chloé', 'Bao', 'Ngozi', 'Rafael',
  'Oksana', 'Tenzin', 'Lucía', 'Emeka', 'Hana', 'Kofi', 'Ayşe', 'Mihail', 'Rania', 'Thandiwe',
  'Joaquín', 'Freya', 'Kai', 'Laila', 'Wiremu', 'Dawit', 'Elif', 'Noor', 'Matteo', 'Saoirse',
  'Malia', 'Yusuf', 'Astrid', 'Kalani', 'Imani', 'Haruto', 'Zofia', 'Omar', 'Linh', 'Ciarán',
  'Inti', 'Shirin', 'Pita', 'Valentina',
];

/** One line each, for the loading screen and a guild person with nothing else to say. */
export const TIPS: readonly string[] = [
  'Press {journal} to open your Field Guide: your quests, today’s commissions and every topic the guild explains.',
  'Press {map} for the whole planet, and click anywhere on it to put your marker there.',
  'Press {use} beside almost anything: a car, a boat, a bench, a person, a rocket.',
  'Press {view} to see through your own eyes, on foot or in any seat.',
  'Hold {run} to run. There is nothing to run out of.',
  'Walk into the sea and you swim. Hold {descend} to dive to the sea floor.',
  'Coral grows in warm seas and kelp in cool ones. Go and have a look.',
  'Planes wait at airstrips outside the big cities. Climb high to cross an ocean.',
  'The higher a plane flies, the faster it goes.',
  'Press {flightMode} in a plane for Aerobatics, and loop the loop.',
  'Jump out of an aircraft and a parachute opens by itself before the ground.',
  'Townsfolk sometimes know where the nearest plane, balloon or boat is waiting.',
  'Everybody you meet speaks their own language, with the English underneath.',
  'A gold ring hangs over every landmark in the world. Fly through to collect it.',
  'Go through the very middle of a course ring for a perfect: half a second off.',
  'Air courses loop round capitals, land rallies run out of them, and every sea has a course off a port.',
  'Press {jobs} to head for the nearest job, and again for the next.',
  'Rescues are worth the most reputation. A helicopter is the best rescuer there is.',
  'New jobs arrive every day at midnight, UTC, the same for everybody.',
  'Your passport stamps a country only once you come down in it. Flying over does not count.',
  'Press {passport} to open your passport.',
  'A town counts in your passport once you walk in among its buildings.',
  'Climb high and every country fades into its own colour. Press {flags} to turn it off.',
  'Rockets stand on pads beside some airstrips. They go to the rest of the solar system.',
  'Mars, the Moon and six more worlds can all be walked, each with a people of its own.',
  'Online, where you leave a vehicle is where everybody finds it.',
  'Hold {horn} at the controls. A bicycle rings a bell and a horse snorts.',
  'Use {jump} as the handbrake in a car and drift round the corner.',
  'A sailboat goes fastest across the wind.',
  'Horses stop at the water’s edge. They are sensible like that.',
  'Most cars parked in a town’s streets can be taken. Just press {use}.',
  'Press {photo} for a picture, or {photoMode} for a free camera and filters.',
  'Press {hud} to hide everything on screen and just look.',
  'Type /help in the chat for every command, and /goto to go anywhere at once.',
  'Hold {players} to see who is playing, and where.',
  'Press {wave} to wave and {dance} to dance. Everybody near you sees it.',
  'Sit on a bench with {use}. Every station platform has a few.',
  'The sun is where the real one is, wherever you stand. Fly east to meet the night.',
  'Lamp posts and bins knocked over by a car are back a little later.',
  'Sign in with an account to keep your progress on every device.',
  'Finish all of today’s commissions, day after day, to build a streak.',
  'Your render distance can go up and down by itself. Settings has the switch.',
];
