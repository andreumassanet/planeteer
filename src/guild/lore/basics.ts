/** The Guide's first topics: the guild itself, the Field Guide, the path, and getting about on foot. */
import type { LoreTopic } from './types.ts';

export const BASICS: readonly LoreTopic[] = [
  {
    id: 'guild',
    title: 'The Explorers’ Guild',
    icon: 'compass',
    role: 'guide',
    summary: 'What the guild is, who its six people are and what the marks over them mean.',
    pages: [
      {
        heading: 'What the guild is',
        text:
          'The Explorers’ Guild keeps a square in big cities all over the world, near the middle of town: a hall, a fountain with a globe on it, stalls, banners and benches.\n\n' +
          'It is where travellers learn the ropes, pick up work and see how they measure up. Anyone can walk in, any time, and it costs nothing.',
      },
      {
        heading: 'Its six people',
        text:
          'Six people stand round every square. The Guide knows how everything works. The Dispatcher hands out jobs and today’s commissions. The Course marshal runs the ring courses. ' +
          'The Outfitter looks after what you can wear. The Archivist keeps your level, your milestones and the Hall of Fame. The Cartographer helps you choose where to go next.',
      },
      {
        heading: 'Talking to them',
        text:
          'Walk up to any of them and press {use} to talk. Their name and role float over their head.\n\n' +
          'A gold ! means they have something new for you. A gold ? means they are waiting for you to come back with something done. A blue ! over the Dispatcher means today’s commissions are open.',
        touch:
          'Walk up to any of them and tap the button that appears to talk. Their name and role float over their head.\n\n' +
          'A gold ! means they have something new for you. A gold ? means they are waiting for you to come back with something done. A blue ! over the Dispatcher means today’s commissions are open.',
      },
      {
        heading: 'One guild, many squares',
        text:
          'Every square belongs to the same guild, so what you start in one city you can finish in another. Every guild is a gold star on the world map, the nearest one is a gold star on your compass and minimap, and your Field Guide can lead you there from anywhere.',
      },
    ],
  },
  {
    id: 'field-guide',
    title: 'The Field Guide',
    icon: 'book',
    role: 'guide',
    summary: 'Your own book of quests, commissions, advice, milestones and rewards.',
    pages: [
      {
        heading: 'Your Field Guide',
        text:
          'Press {journal} to open your Field Guide, anywhere in the world. It has four parts: the Journal, the Guide, Milestones and Rewards.\n\n' +
          'You never need to find a guild to read it, but the guild’s people are always happy to explain anything in it face to face.',
        touch:
          'Tap the menu button (≡) and choose the Field Guide, anywhere in the world. It has four parts: the Journal, the Guide, Milestones and Rewards.\n\n' +
          'You never need to find a guild to read it, but the guild’s people are always happy to explain anything in it face to face.',
      },
      {
        heading: 'The Journal',
        text:
          'The Journal shows what you are doing right now: the step of the Explorer’s Path you are on, and today’s commissions with how far along each one is. When something is ready to hand in, it says who to go back to.',
      },
      {
        heading: 'The Guide',
        text:
          'The Guide holds every topic the guild’s people can explain: moving about, every vehicle, jobs, rings, the maps, your passport and more. It is the same advice they give in person, so read it whenever you are stuck.',
      },
      {
        heading: 'Milestones and Rewards',
        text:
          'Milestones tracks your long goals, each with a bronze, a silver and a gold step. Rewards shows everything you can wear: what you have unlocked already, and what it takes to unlock the rest.',
      },
    ],
  },
  {
    id: 'explorers-path',
    title: 'The Explorer’s Path',
    icon: 'scroll',
    role: 'guide',
    summary: 'A short chain of quests that shows a new traveller the whole world.',
    pages: [
      {
        heading: 'A path for new explorers',
        text:
          'The Explorer’s Path is a short chain of quests for new travellers, handed out by the guild’s people. Each step teaches you one thing, and each one finished earns experience and sometimes something to wear.\n\n' +
          'It starts with a word with the Guide.',
      },
      {
        heading: 'How a quest works',
        text:
          'When somebody offers you a quest, they say what it needs and you can take it on. Its steps show in the Journal of your Field Guide and tick along as you do them.\n\n' +
          'When everything is done, a gold ? appears over whoever gave it. Go back and talk to them to hand it in.',
      },
      {
        heading: 'What the path covers',
        text:
          'The steps take you round the whole guild: moving about, talking to people, taking a vehicle, doing a job, running a ring course, collecting a landmark ring, changing your look, earning a passport stamp and setting off somewhere new on the map. ' +
          'Finish them all and the Guide has one last word for you.',
      },
      {
        heading: 'No hurry',
        text: 'There is no timer on the path. Wander off for a week and come back whenever you like: the world will still be here, and so will your quests.',
      },
    ],
  },
  {
    id: 'starting',
    title: 'Choosing where to start',
    icon: 'play',
    role: 'guide',
    summary: 'The title screen, the solar system and picking the town you wake up in.',
    pages: [
      {
        heading: 'Online or offline',
        text:
          'On the title screen, choose Play online to travel with everyone else on the same planet, or Play offline to explore alone, with nothing sent anywhere. The world is exactly the same either way.',
      },
      {
        heading: 'Down to Earth',
        text:
          'You start out among the planets. Choose Earth, then click a country on the globe or search for a place by name. Pick one of its towns and choose Start here. Can’t decide? Surprise me picks somewhere for you.',
        touch:
          'You start out among the planets. Choose Earth, then tap a country on the globe or search for a place by name. Pick one of its towns and choose Start here. Can’t decide? Surprise me picks somewhere for you.',
      },
      {
        heading: 'Back where you left off',
        text:
          'Next time, the menu offers to put you back where you left off. Every country is real, so you can just as well start somewhere new: your passport and your progress come with you.',
      },
    ],
  },
  {
    id: 'walking',
    title: 'Walking, running and jumping',
    icon: 'walk',
    role: 'guide',
    summary: 'Getting about on your own two feet.',
    pages: [
      {
        heading: 'Walking',
        text:
          'Walk with {forward}, {left}, {back} and {right}. You walk the way the camera faces, so move the mouse to choose a direction and walk into it.\n\n' +
          'The whole planet is yours to walk, from the beaches to the mountains. It is very big, which is why there are vehicles.',
        touch:
          'Put your left thumb anywhere on the left of the screen and drag: a stick appears under it. Push a little to stroll and further to walk. You walk the way the camera faces.\n\n' +
          'The whole planet is yours to walk. It is very big, which is why there are vehicles.',
      },
      {
        heading: 'Running',
        text:
          'Hold {run} to run. There is nothing to run out of, so run as much as you like.\n\n' +
          'People, buildings and parked vehicles are solid: you go round them, not through them. Hill towns are built in terraces, with ramps and steps between them.',
        touch:
          'Push the stick past its rim to run. There is nothing to run out of, so run as much as you like.\n\n' +
          'People, buildings and parked vehicles are solid: you go round them, not through them. Hill towns are built in terraces, with ramps and steps between them.',
      },
      {
        heading: 'Jumping',
        text: 'Press {jump} to jump: onto a low wall, over a fence, or just for the joy of it. Nobody gets hurt in this world, however far they fall.',
        touch: 'Tap the Jump button on the right to jump: onto a low wall, over a fence, or just for the joy of it. Nobody gets hurt in this world, however far they fall.',
      },
      {
        heading: 'The mouse',
        text: 'The game holds on to the mouse so you can look around freely. Press {release} to get it back, for a card or another window, and click the world to look around again.',
      },
    ],
  },
  {
    id: 'swimming',
    title: 'Swimming and diving',
    icon: 'swim',
    role: 'guide',
    summary: 'Into the sea, down to the floor and back up again.',
    pages: [
      {
        heading: 'Into the water',
        text:
          'Walk into the sea or a lake and you swim. Swim with the keys you walk with, and hold {run} to swim faster.\n\n' +
          'You never run out of breath and never get tired, so swim as far as you dare.',
        touch:
          'Walk into the sea or a lake and you swim. Steer with the stick, and push it past its rim to swim faster.\n\n' +
          'You never run out of breath and never get tired, so swim as far as you dare.',
      },
      {
        heading: 'Diving',
        text:
          'Hold {descend} to dive, all the way down to the sea floor if you like. Let go and you drift slowly back up, or hold {jump} to rise quickly.\n\n' +
          'The sea is shallow near the coast and deep further out, so a dive close to shore is the gentle way to start.',
        touch:
          'Hold the Dive button to go down, all the way to the sea floor if you like. Let go and you drift slowly back up, or hold Up to rise quickly.\n\n' +
          'The sea is shallow near the coast and deep further out, so a dive close to shore is the gentle way to start.',
      },
      {
        heading: 'What lives down there',
        text:
          'Warm seas grow coral reefs, and cooler ones kelp forests swaying over the rocks. Look for schools of fish, sharks, rays and turtles, dolphins leaping past and, far out, the odd whale. Nothing down there will hurt you.',
      },
      {
        heading: 'Fell in?',
        text:
          'Drive a car off a quay, or bring a plane down on the sea, and it floats for a moment, then sinks and leaves you swimming. No harm done: the vehicle goes back to where it was parked.',
      },
    ],
  },
  {
    id: 'camera',
    title: 'The camera and first person',
    icon: 'eye',
    role: 'guide',
    summary: 'Looking around, zooming and seeing through your own eyes.',
    pages: [
      {
        heading: 'Looking around',
        text:
          'Move the mouse to look around. The camera rides over your shoulder and turns with you as you go.\n\n' +
          'Whatever stands between the camera and you fades out of the way, so a wall or a tree never hides you.',
        touch:
          'Drag on the right half of the screen to look around. The camera rides over your shoulder and turns with you as you go.\n\n' +
          'Whatever stands between the camera and you fades out of the way, so a wall or a tree never hides you.',
      },
      {
        heading: 'Nearer or further',
        text: 'On foot, roll the mouse wheel to bring the camera in close or pull it back for a wider view of the street.',
        touch: 'On foot, pinch with two fingers to bring the camera in close or pull it back for a wider view of the street.',
      },
      {
        heading: 'First person',
        text:
          'Press {view} to see through your own eyes. It works on foot and in any seat: at the wheel, in a cockpit, in the saddle. Look down and you see your own feet and hands. Press {view} again to step back out.',
        touch:
          'Tap the menu button (≡) and choose First person to see through your own eyes. It works on foot and in any seat: at the wheel, in a cockpit, in the saddle. Choose it again to step back out.',
      },
    ],
  },
  {
    id: 'talking',
    title: 'Talking to people',
    icon: 'talk',
    role: 'guide',
    summary: 'Saying hello to the townsfolk, in their own language.',
    pages: [
      {
        heading: 'Say hello',
        text:
          'Walk up to somebody in a town and press {use} to talk. They stop, turn to you and speak in their country’s own language, with the English underneath.\n\n' +
          'Press {use} again to hear what they say next. Walk away and the conversation ends.',
        touch:
          'Walk up to somebody in a town and tap Talk. They stop, turn to you and speak in their country’s own language, with the English underneath.\n\n' +
          'Tap again to hear what they say next. Walk away and the conversation ends.',
      },
      {
        heading: 'What people talk about',
        text:
          'People talk about their town and their country: the food, the drink, a festival, a sport, something they are proud of, an old saying. Children, grumps, elders and chatterboxes each talk in their own way, and the second time you meet somebody they say something new.',
      },
      {
        heading: 'Useful gossip',
        text:
          'Townsfolk notice things. Some will tell you where the nearest plane, balloon or boat is waiting, which is handy when you need a ride.\n\n' +
          'With voices on in Settings, everybody says their lines aloud, each in a voice of their own.',
      },
      {
        heading: 'Errands',
        text:
          'Now and then somebody has an errand for you, and a tag over their head says so. Walk up close and press {use} to take it on instead of chatting. The Dispatcher can tell you all about jobs.',
        touch:
          'Now and then somebody has an errand for you, and a tag over their head says so. Walk up close and tap the button to take it on instead of chatting. The Dispatcher can tell you all about jobs.',
      },
    ],
  },
  {
    id: 'emotes',
    title: 'Waves, dances and benches',
    icon: 'hand',
    role: 'guide',
    summary: 'Saying hello without words, and taking a seat.',
    pages: [
      {
        heading: 'Wave and dance',
        text: 'Press {wave} to wave and {dance} to dance. Everybody near you sees it. A dance goes on until you move.',
        touch: 'Tap the menu button (≡) and choose Wave or Dance. Everybody near you sees it. A dance goes on until you move.',
      },
      {
        heading: 'Sit on a bench',
        text:
          'Benches stand on town pavements, by country roads and on station platforms. Walk up to one and press {use} to sit down, and {use} again to stand up. Other players see you sitting there.',
        touch:
          'Benches stand on town pavements, by country roads and on station platforms. Walk up to one and tap Sit, then Stand up when you are rested. Other players see you sitting there.',
      },
      {
        heading: 'In the chat',
        text: 'You can also type /wave or /dance in the chat, or /me and anything you like, as in /me waves hello, to tell everybody what you are up to.',
      },
    ],
  },
];
