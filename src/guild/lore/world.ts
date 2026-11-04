/** The Guide's topics on the world round you and the game round the world: weather, photos, the chat, others, settings, fingers. */
import type { LoreTopic } from './types.ts';

export const WORLD: readonly LoreTopic[] = [
  {
    id: 'weather',
    title: 'Weather, day and night',
    icon: 'cloud',
    role: 'guide',
    summary: 'Rain and snow by the climate, the real sun, and dark nights.',
    pages: [
      {
        heading: 'Weather by the climate',
        text:
          'The weather follows each place’s climate: rain falls under the clouds, snow in the cold, storms bring lightning and thunder, and fog rolls in. It is the same for every player, so if it is pouring for you, it is pouring for everybody beside you.',
      },
      {
        heading: 'Snow and umbrellas',
        text: 'In winter, snow lies wherever it is cold enough, and the high mountains keep theirs all year round. When it rains, the people in the towns put up their umbrellas.',
      },
      {
        heading: 'The real sun',
        text:
          'The sun stands where the real one is right now, wherever you are. Fly east into the evening and you can watch the night come. The clock in the corner is the local time where you stand, with a little picture of the weather.',
      },
      {
        heading: 'Night',
        text: 'Nights are dark here. Towns light their street lamps and windows, vehicles turn on their headlights, the stars come out, and on a summer evening so do the fireflies.',
      },
      {
        heading: 'Changing it',
        text:
          'Settings, under Graphics, lets you choose another hour, run the day as a time-lapse or turn the weather off. In the chat, /time night or /weather snow changes things at once, and /time real or /weather auto puts them back. Only your own screen changes.',
      },
    ],
  },
  {
    id: 'photos',
    title: 'Photos and photo mode',
    icon: 'camera',
    role: 'guide',
    summary: 'Saving a picture, and the free camera for a better one.',
    pages: [
      {
        heading: 'Taking a photo',
        text:
          'Press {photo} to save a picture of the world, named after the nearest town. The buttons and cards on screen are left out of it. Press {hud} first to hide the place names too.',
        touch: 'Tap the menu button (≡) and choose Photo to save a picture of the world, named after the nearest town. The buttons and cards on screen are left out of it.',
      },
      {
        heading: 'Photo mode',
        text:
          'Press {photoMode} for photo mode. You stand still and the camera flies free: the movement keys fly it, the mouse looks, {run} goes faster, {use} takes it up and {horn} brings it down. It stays within reach of you.',
        touch: 'Photo mode needs a keyboard. On a touch screen, frame your shot with the camera, then tap the menu button (≡) and choose Photo.',
      },
      {
        heading: 'The lens and the look',
        text:
          'In photo mode a small card sets the focus and its blur, the exposure, a filter (warm, cool, black and white or vintage), the vignette and the hour. Freeze time to hold a moment still. Press {photo} to take the picture and {photoMode} to leave.',
      },
      {
        heading: 'Postcards',
        text: 'A photo with a landmark well in the middle of it, near enough to fill some of the frame, is a postcard for your collection: one for each landmark in the world. The Postcards milestone counts them, and a title waits at silver.',
        touch: 'A photo with a landmark well in the middle of it, near enough to fill some of the frame, is a postcard for your collection: one for each landmark in the world. The Postcards milestone counts them.',
      },
      {
        heading: 'A clear view',
        text: 'Press {hud} to hide everything on the screen and see only the world. Press it again to bring it all back.',
      },
    ],
  },
  {
    id: 'chat',
    title: 'The chat',
    icon: 'talk',
    role: 'guide',
    summary: 'Saying something to everybody, and the commands you can type.',
    pages: [
      {
        heading: 'Saying something',
        text:
          'Press {chat} to open the chat, type your line and send it. Everybody online sees it, on every world, with the flag of the country you are standing in. Press {release} to close the chat without sending.',
        touch:
          'Tap the menu button (≡) and choose Chat, type your line and send it. Everybody online sees it, on every world, with the flag of the country you are standing in.',
      },
      {
        heading: 'Commands',
        text:
          'A line that starts with / is a command, and the chat suggests them as you type. /help lists them all. /goto and a town, a country or a latitude and longitude sends you straight there, /home takes you back where you started and /where says exactly where you are.',
      },
      {
        heading: 'More commands',
        text:
          '/who lists who is online and where, and /tp and a name takes you to that player. /time and /weather change the sky on your screen, /photo saves a picture and /clear empties the chat. /mute hides somebody’s lines until you reload, and /unmute brings them back.',
      },
      {
        heading: 'Being kind',
        text: 'Lines are short and paced, so nobody can flood the chat. Be friendly: everybody here is a traveller a long way from home.',
      },
    ],
  },
  {
    id: 'together',
    title: 'Playing with others',
    icon: 'globe',
    role: 'guide',
    summary: 'Who else is here, meeting up and what you share.',
    pages: [
      {
        heading: 'Who is here',
        text:
          'Hold {players} to see who is playing: you first, then everybody on your world, then everybody on the others, each with the flag of where they are. Other travellers wear their names over their heads.',
        touch: 'Type /who in the chat to see who is playing and where. Other travellers wear their names over their heads.',
      },
      {
        heading: 'Meeting up',
        text:
          'To find a friend, type /tp and their name in the chat, or open the world map with {map} and click them. If they are driving, hop in beside them and let them show you round.',
        touch: 'To find a friend, type /tp and their name in the chat, or tap the minimap for the world map and tap them. If they are driving, hop in beside them and let them show you round.',
      },
      {
        heading: 'A shared world',
        text:
          'Vehicles are shared: where anybody leaves one is where it stays. Horns, waves, dances and benches are seen and heard by everybody near. The jobs, rings and courses are the same for every player, but what you collect is your own.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: 'gear',
    role: 'guide',
    summary: 'Graphics, render distance, units, sound and your own keys.',
    pages: [
      {
        heading: 'Opening Settings',
        text: 'Press {settings}, or click the gear, to open Settings. It has pages for Graphics, Sound, Controls, your Account and the Credits, and everything there is saved on this device.',
        touch: 'Tap the menu button (≡) and choose Settings. It has pages for Graphics, Sound, Controls, your Account and the Credits, and everything there is saved on this device.',
      },
      {
        heading: 'Graphics',
        text:
          'Ultra draws brick, stone, tiles and paving with their relief, rooms behind windows and waves on the water. Standard is plainer and lighter. Resolution trades sharpness for speed, and switches turn the effects, the weather, camera shake, flags and borders, and rings and courses on or off.',
      },
      {
        heading: 'Render distance',
        text:
          'Render distance is how far towns, trees, traffic and animals are built round you. Automatic distance turns it up while your computer keeps up and down when it struggles. Move the slider, or press {nearer} and {farther}, to choose it yourself.',
        touch:
          'Render distance is how far towns, trees, traffic and animals are built round you. Automatic distance turns it up while your device keeps up and down when it struggles. Move the slider to choose it yourself.',
      },
      {
        heading: 'Units and sound',
        text: 'Choose km/h, mph or knots for the speedometer, and knots on water and in the air if you like. The Sound page sets the volume, the music, the townsfolk’s voices and a soft blip for the chat.',
      },
      {
        heading: 'Your own keys',
        text:
          'On the Controls page, click a key, then press the one you want instead. A key taken from another action swaps over, so nothing is left without one, and Reset to defaults puts everything back. Mouse sensitivity and the key hints are there too.',
      },
    ],
  },
  {
    id: 'touch',
    title: 'Playing on a touch screen',
    icon: 'expand',
    role: 'guide',
    summary: 'The stick, the look, the buttons and the menu, for fingers.',
    pages: [
      {
        heading: 'Moving and looking',
        text:
          'Drag on the left of the screen to move: a stick appears under your thumb. Push it a little to stroll, further to walk and past its rim to run. Drag on the right to look around, and pinch to bring the camera nearer or further.',
      },
      {
        heading: 'The buttons',
        text:
          'A few round buttons sit under your right thumb, only the ones that do something right now: Jump on foot, Dive and Up in the water, Drift and Horn in a car, Climb and Descend in a plane.',
      },
      {
        heading: 'The use button',
        text: 'When there is something to use beside you, a button says what: Drive, Talk, Sit, Get out. Tap it to do it.',
      },
      {
        heading: 'Everything else',
        text:
          'Tap the menu button (≡) for the world map, your passport, the chat, photos, first person, borders, a wave, a dance, the main menu and Settings. Tap the minimap to open the world map.',
      },
    ],
  },
];
