/** The Guide's topics on everything with wheels, hooves or a hull, and the railway. */
import type { LoreTopic } from './types.ts';

export const VEHICLES: readonly LoreTopic[] = [
  {
    id: 'vehicles',
    title: 'Taking a vehicle',
    icon: 'car',
    role: 'guide',
    summary: 'Where vehicles wait, how to take one and where it stays.',
    pages: [
      {
        heading: 'Nobody owns them',
        text:
          'Vehicles stand all over the world, and nobody owns any of them. Walk up to one and a label appears over it: Drive, Ride, Fly or Sail. Press {use} to take it, and {use} again to get out.\n\n' +
          'The keys a new kind needs show for a moment as you take it.',
        touch:
          'Vehicles stand all over the world, and nobody owns any of them. Walk up to one and a button appears: Drive, Ride, Fly or Sail. Tap it to take the vehicle, and Get out when you are done.\n\n' +
          'Only the buttons a vehicle needs are shown.',
      },
      {
        heading: 'Where to look',
        text:
          'Cars and vans wait just outside the roads into every town. Bicycles, motorbikes and scooters stand on the verge nearby, more of them where people ride them. Buses, jeeps and tuk-tuks wait a little further out, and most coastal towns keep a launch just off the shore.',
      },
      {
        heading: 'Further afield',
        text:
          'Big cities and capitals keep a light plane at the end of an airstrip, and the largest a helicopter in a field. A few towns keep a hot-air balloon, and farm country has horses and tractors. Jet skis and sailboats moor off the warmer or busier shores, and a few great harbours hide a submarine.',
      },
      {
        heading: 'Parked in town',
        text:
          'Most of the cars, vans, buses, bicycles, scooters and tuk-tuks parked in a town’s streets can be taken too. The traffic on the move cannot: those drivers are going somewhere.',
      },
      {
        heading: 'Where you leave it',
        text:
          'Where you leave a vehicle is where it stays, for everybody. Online, somebody else may come along and drive off in the car you left, so park it somewhere sensible.',
      },
    ],
  },
  {
    id: 'passengers',
    title: 'Seats, passengers and the horn',
    icon: 'seat',
    role: 'guide',
    summary: 'Riding along with somebody, the horn, and jumping out under way.',
    pages: [
      {
        heading: 'Seats',
        text:
          'The first seat in a vehicle is the driver’s. If somebody is already at the wheel, walk up and press {use} to get in beside them and enjoy the ride. Press {use} again to get out.',
        touch:
          'The first seat in a vehicle is the driver’s. If somebody is already at the wheel, walk up and tap Get in to ride beside them. Tap Get out when you want to leave.',
      },
      {
        heading: 'The horn',
        text:
          'At the controls, hold {horn} to sound the horn for as long as you like, and everybody near you hears it. A bicycle rings a bell, a horse snorts and boats have a ship’s horn. Aircraft have none.',
        touch:
          'At the controls, hold the Horn button to sound it for as long as you like, and everybody near you hears it. A bicycle rings a Bell, a horse gives a Snort and boats have a ship’s horn. Aircraft have none.',
      },
      {
        heading: 'Jumping out',
        text:
          'Press {use} while going fast and you jump out: you roll clear, and the vehicle rolls on without you until it stops, and stays there. Leave an aircraft in the air and you fall, with a parachute to bring you down.',
        touch:
          'Tap Get out while going fast and you jump out: you roll clear, and the vehicle rolls on without you until it stops, and stays there. Leave an aircraft in the air and you fall, with a parachute to bring you down.',
      },
      {
        heading: 'Left at the controls',
        text: 'If the pilot jumps out while you are riding along in the air, the controls are yours: press {use} to take them and fly yourself down.',
        touch: 'If the pilot jumps out while you are riding along in the air, the controls are yours: tap Take the controls and fly yourself down.',
      },
      {
        heading: 'After dark',
        text: 'At night, cars, bikes, buses and the rest light their headlights by themselves, and so does whatever the other players are driving.',
      },
    ],
  },
  {
    id: 'driving',
    title: 'Cars, bikes and everything on wheels',
    icon: 'moto',
    role: 'guide',
    summary: 'Driving, boosting and drifting, and what happens when you hit things.',
    pages: [
      {
        heading: 'Driving',
        text:
          'Drive with {forward} and {back}, and steer with {left} and {right}. Hold {run} for a boost, and use {jump} as the handbrake to drift round a corner.\n\n' +
          'Cars, vans, jeeps, buses, tractors and tuk-tuks all drive like this, each with its own feel.',
        touch:
          'Push the stick to drive and steer, and past its rim for a boost. Tap Drift for the handbrake, to slide round a corner.\n\n' +
          'Cars, vans, jeeps, buses, tractors and tuk-tuks all drive like this, each with its own feel.',
      },
      {
        heading: 'Bicycles',
        text: 'Pedal with {forward} and steer with {left} and {right}. Hold {run} to stand up out of the saddle and go faster, press {jump} to skid, and {horn} rings the bell.',
        touch: 'Push the stick to pedal and steer, and past its rim to stand up out of the saddle and go faster. Tap Skid to skid, and Bell to ring the bell.',
      },
      {
        heading: 'Motorbikes and scooters',
        text:
          'Ride with the same keys, hold {run} for full throttle and use {jump} to drift. Scooters are everywhere in Asia and round the Mediterranean; motorbikes turn up wherever it is warm.',
        touch:
          'Push the stick to ride, and past its rim for full throttle. Tap Drift to drift. Scooters are everywhere in Asia and round the Mediterranean; motorbikes turn up wherever it is warm.',
      },
      {
        heading: 'Bumps and knocks',
        text:
          'Lamp posts, bins, signs and the other small things beside a road go flying if you drive into them, and are back a little later. Buildings are solid: drive into a wall and you bounce off it. The traffic gives way to you, so be kind and give way to it.',
      },
      {
        heading: 'Not a boat',
        text: 'Anything that is not a boat sinks. Drive off a quay and the car floats for a moment, then goes down and leaves you swimming. It goes back to where it was parked, so no harm done.',
      },
    ],
  },
  {
    id: 'horses',
    title: 'Riding a horse',
    icon: 'horse',
    role: 'guide',
    summary: 'Galloping, jumping and why a horse will not swim.',
    pages: [
      {
        heading: 'In the saddle',
        text: 'Horses wait in paddocks outside towns in open grassland and steppe. Walk up and press {use} to ride. Steer with the movement keys and hold {run} to gallop.',
        touch: 'Horses wait in paddocks outside towns in open grassland and steppe. Walk up and tap Ride. Steer with the stick, and push it past its rim to gallop.',
      },
      {
        heading: 'Jumps and snorts',
        text: 'Press {jump} to leap a fence or a ditch, and {horn} makes your horse snort. Press {use} to dismount.',
        touch: 'Tap Jump to leap a fence or a ditch, and Snort to make your horse snort. Tap Dismount to get off.',
      },
      {
        heading: 'Horse sense',
        text: 'A horse will not go into the sea: it stops at the water’s edge, however hard you ask. Leave it wherever you like and it waits there for the next rider.',
      },
    ],
  },
  {
    id: 'boats',
    title: 'Boats and jet skis',
    icon: 'boat',
    role: 'guide',
    summary: 'Launches, jet skis and sailboats, and getting back ashore.',
    pages: [
      {
        heading: 'Launches',
        text:
          'Most coastal towns keep a launch moored just off the shore, and harbours have more boats tied up at their piers. Steer with the movement keys, hold {run} for a boost and sound the ship’s horn with {horn}.',
        touch:
          'Most coastal towns keep a launch moored just off the shore, and harbours have more boats tied up at their piers. Steer with the stick, push it past its rim for a boost, and tap Horn for the ship’s horn.',
      },
      {
        heading: 'Jet skis',
        text: 'Jet skis wait off towns on warmer seas. Hold {run} for a boost, press {jump} to leap off the water, and hold {back} while you turn to powerslide.',
        touch: 'Jet skis wait off towns on warmer seas. Push the stick past its rim for a boost, tap Leap to jump off the water, and pull the stick back while you turn to powerslide.',
      },
      {
        heading: 'Sailboats',
        text:
          'Sailboats moor off the busier towns. A sailboat goes fastest across the wind, not straight with it or into it, so try a few headings and feel the speed change. Hold {run} to haul the sail in tight.',
        touch:
          'Sailboats moor off the busier towns. A sailboat goes fastest across the wind, not straight with it or into it, so try a few headings and feel the speed change. Push the stick past its rim to haul the sail in tight.',
      },
      {
        heading: 'Back ashore',
        text: 'Press {use} to get off. Close to the shore you step out onto dry land; out at sea you go over the side and swim, so bring the boat in first.',
        touch: 'Tap Get out to get off. Close to the shore you step out onto dry land; out at sea you go over the side and swim, so bring the boat in first.',
      },
    ],
  },
  {
    id: 'submarine',
    title: 'The submarine',
    icon: 'sub',
    role: 'guide',
    summary: 'Where the yellow submarine is moored and how to dive in it.',
    pages: [
      {
        heading: 'The yellow submarine',
        text:
          'A few big harbour cities, on seas with a reef or a kelp forest to see, keep a yellow submarine moored offshore. Swim out to it, or take a boat, and press {use} to climb in.',
        touch:
          'A few big harbour cities, on seas with a reef or a kelp forest to see, keep a yellow submarine moored offshore. Swim out to it, or take a boat, and tap the button to climb in.',
      },
      {
        heading: 'Diving',
        text: 'Steer with the movement keys. Hold {descend} to dive and {jump} to rise. Down there are reefs and kelp, rays, turtles and, if you are lucky, a whale.',
        touch: 'Steer with the stick. Hold Dive to go down and Rise to come up. Down there are reefs and kelp, rays, turtles and, if you are lucky, a whale.',
      },
      {
        heading: 'Getting out',
        text: 'You can only climb out at the surface: rise all the way up first, then press {use}.',
        touch: 'You can only climb out at the surface: rise all the way up first, then tap Get out.',
      },
    ],
  },
  {
    id: 'railway',
    title: 'Riding the train',
    icon: 'clock',
    role: 'guide',
    summary: 'Stations, the timetable and riding from city to city.',
    pages: [
      {
        heading: 'Stations',
        text:
          'A railway joins many of the big cities, with a station and its platforms in each. Trains keep to a timetable: stand on a platform and the prompt says where the next train goes and how long until it comes.',
      },
      {
        heading: 'All aboard',
        text:
          'When a train is in, press {use} to board and take a seat. Riding along, the prompt shows the next stop and when you will get there. Press {use} at a stop to get off onto its platform.',
        touch:
          'When a train is in, tap the button to board and take a seat. Riding along, it shows the next stop and when you will get there. Tap Get off at a stop to step onto its platform.',
      },
      {
        heading: 'Goods lines',
        text: 'Some lines carry only goods, and their trains take no passengers: the platform says so. Every platform has benches, for waiting in comfort.',
      },
    ],
  },
];
