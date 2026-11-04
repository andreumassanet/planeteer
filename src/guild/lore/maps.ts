/** The Cartographer's topics: the maps, finding your way, landmarks, and the worlds past this one. */
import type { LoreTopic } from './types.ts';

export const MAPS: readonly LoreTopic[] = [
  {
    id: 'minimap',
    title: 'The minimap and the compass',
    icon: 'compass',
    role: 'cartographer',
    summary: 'The disc in the corner, the compass along the top and the place badge.',
    pages: [
      {
        heading: 'The minimap',
        text:
          'The disc in the corner is a map of where you are, and it turns with you: what is ahead on the screen is up on the disc, and an N rides round its rim to show where north is. Roads, towns, landmarks and rocket pads are all drawn on it.',
      },
      {
        heading: 'Its scale',
        text: 'The minimap zooms by itself: close in inside a town, wider out in the open, wider still as you speed up, and out to the horizon when you fly.',
        touch: 'The minimap zooms by itself: close in inside a town, wider out in the open, wider still as you speed up, and out to the horizon when you fly. Tap it to open the world map.',
      },
      {
        heading: 'The compass',
        text: 'The compass along the top shows which way you are facing. Your marker, the next ring of a course and the other players ride along it at their bearings, with how far away they are.',
      },
      {
        heading: 'Where you are',
        text:
          'The badge in the corner names the place you are in or near, with its country’s flag. Come somewhere new and for a moment it says how big the town is, how far, and which way. At sea it names the coast you are off, or says Open water.',
      },
    ],
  },
  {
    id: 'world-map',
    title: 'The world map and destinations',
    icon: 'map',
    role: 'cartographer',
    summary: 'The whole planet on one sheet, and a marker to head for.',
    pages: [
      {
        heading: 'The whole planet',
        text:
          'Press {map} to open the whole planet on one sheet. Drag to move around, zoom with the wheel or with {mapIn} and {mapOut}, and double-click to zoom in. The button with the walker on it centres the map on you.',
        touch:
          'Tap the minimap to open the whole planet on one sheet. Drag to move around and pinch to zoom. The button with the walker on it centres the map on you.',
      },
      {
        heading: 'Setting a destination',
        text: 'Click anywhere on the map to put your marker there: a town, a landmark, a stretch of coast, anywhere at all. Click the marker again to clear it. You have one marker at a time.',
        touch: 'Tap anywhere on the map to put your marker there: a town, a landmark, a stretch of coast, anywhere at all. Tap the marker again to clear it. You have one marker at a time.',
      },
      {
        heading: 'Getting there',
        text:
          'With a marker set, a line of violet chevrons leads the way, a beam of light stands over the place, and the minimap and the compass point to it. Arrive on the ground and the marker clears itself. Nothing flies you there: that part is yours.',
      },
      {
        heading: 'What else is on it',
        text:
          'Landmarks are pins: cream until you have visited them, gold once you have. The map also shows the towns, other players, rocket pads and ring courses. Click another player to go and join them.',
        touch:
          'Landmarks are pins: cream until you have visited them, gold once you have. The map also shows the towns, other players, rocket pads and ring courses. Tap another player to go and join them.',
      },
    ],
  },
  {
    id: 'landmarks',
    title: 'Landmarks',
    icon: 'pin',
    role: 'cartographer',
    summary: 'The world’s famous places, their cards and their visits.',
    pages: [
      {
        heading: 'Famous places',
        text:
          'Over a hundred of the world’s famous landmarks stand in their real places, from towers and temples to bridges and ruins. Some stand in a square of their own in their town; others out in the open country nearby.',
      },
      {
        heading: 'Their cards',
        text: 'Walk up to a landmark and a card tells you its name, its country, how tall it is, when it was built and something worth knowing about it.',
      },
      {
        heading: 'Visiting',
        text: 'A landmark counts as visited when you reach it on foot, and its pin on the map turns gold. Flying over does not count. Ask the Cartographer for landmarks you have not seen yet.',
      },
      {
        heading: 'And their rings',
        text: 'Every landmark has a gold ring high above it, too. The Course marshal can tell you how to collect them.',
      },
    ],
  },
  {
    id: 'map-layer',
    title: 'Country colours, borders and names',
    icon: 'layers',
    role: 'cartographer',
    summary: 'How the world turns into a map of itself as you climb.',
    pages: [
      {
        heading: 'A map from the air',
        text:
          'Climb high and the world turns into a map of itself: each country fades into its own colour, the frontiers come up as dashed lines, and the countries’ names appear over the land. None of it shows on foot.',
      },
      {
        heading: 'Off and on',
        text: 'Press {flags} to turn the colours, the borders and the names off, and again to bring them back. Settings has the same switch, under Graphics.',
        touch: 'Tap the menu button (≡) and choose Borders to turn the colours, the borders and the names off, and again to bring them back. Settings has the same switch, under Graphics.',
      },
      {
        heading: 'Whose colour',
        text: 'Each country’s colour is taken from its own flag, then nudged so that no two neighbours look alike.',
      },
    ],
  },
  {
    id: 'rockets',
    title: 'Rockets',
    icon: 'orbit',
    role: 'cartographer',
    summary: 'Rocket pads, lift-off and the way to the solar system.',
    pages: [
      {
        heading: 'Rocket pads',
        text: 'Rockets stand on pads beside some of the world’s airstrips, and the map marks every pad. Walk up to one and press {use} to climb in.',
        touch: 'Rockets stand on pads beside some of the world’s airstrips, and the map marks every pad. Walk up to one and tap Board the rocket.',
      },
      {
        heading: 'Lift-off',
        text:
          'Hold {jump} to light the engine. Let go too soon and it dies down again; keep holding and the clamps let go, and the rocket climbs away with you to the solar system. Press {use} to climb out any time before it leaves the pad.',
        touch:
          'Hold the Jump button to light the engine. Let go too soon and it dies down again; keep holding and the clamps let go, and the rocket climbs away with you to the solar system. Tap Get out any time before it leaves the pad.',
      },
      {
        heading: 'Among the planets',
        text: 'Up there, every planet is laid out in its real place round the Sun. Pick one and choose Explore to land on it, or choose Earth to come home.',
      },
      {
        heading: 'Watch the sky',
        text: 'Rockets with nobody aboard take off on their own now and then, so near a pad, keep an eye on the sky. The one that left is back on its pad next time you pass.',
      },
    ],
  },
  {
    id: 'other-worlds',
    title: 'The other worlds',
    icon: 'globe',
    role: 'cartographer',
    summary: 'Eight more worlds to walk, their people and their craft.',
    pages: [
      {
        heading: 'Eight more worlds',
        text:
          'Mercury, Venus, the Moon, Mars, Jupiter, Saturn, Uranus and Neptune can all be explored. On the giant planets you walk on the tops of the clouds. Each world has its own sky and ground, its own nations and towns, and a people of its own.',
      },
      {
        heading: 'Their people',
        text: 'Every world’s people walk the streets of their towns. Walk up and press {use} to talk: they answer in their own writing, with the English underneath.',
        touch: 'Every world’s people walk the streets of their towns. Walk up and tap Talk: they answer in their own writing, with the English underneath.',
      },
      {
        heading: 'Getting about',
        text:
          'Each world has vehicles of its own: rovers on the ground, landers that fly, aerostats that float, and in some towns a flying saucer, parked and waiting for somebody bold. You drive them with the same keys as on Earth.',
      },
      {
        heading: 'Stamps and the way home',
        text:
          'Your passport stamps the nations of the other worlds in chapters of their own. To leave, find a rocket pad and launch again, or choose Main menu. The chat reaches every world, so friends on Earth still hear you.',
      },
    ],
  },
];
