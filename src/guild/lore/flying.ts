/** The Guide's topics on flying: the light plane, the helicopter and the balloon, and coming down without them. */
import type { LoreTopic } from './types.ts';

export const FLYING: readonly LoreTopic[] = [
  {
    id: 'plane',
    title: 'Flying the light plane',
    icon: 'plane',
    role: 'guide',
    summary: 'Take-off, Travel and Aerobatics, the ceiling and landing.',
    pages: [
      {
        heading: 'Finding a plane',
        text: 'Light planes stand at the end of mown airstrips outside big cities and capitals, with a windsock beside them. Walk up and press {use} to climb into the cockpit.',
        touch: 'Light planes stand at the end of mown airstrips outside big cities and capitals, with a windsock beside them. Walk up and tap Fly to climb into the cockpit.',
      },
      {
        heading: 'Take-off',
        text:
          'Hold {forward} to open the throttle and run down the strip. Once it is going fast enough the plane lifts off by itself and climbs away. On the ground, {left} and {right} steer and {back} brakes.',
        touch:
          'Push the stick forward to open the throttle and run down the strip. Once it is going fast enough the plane lifts off by itself and climbs away. On the ground, the stick steers, and pulling it back brakes.',
      },
      {
        heading: 'Travel',
        text:
          'Planes start in Travel, made for getting places. Hold {jump} to climb and {descend} to come down; let go and the plane levels off. {left} and {right} bank it into a turn, and {forward} and {back} work the throttle.\n\n' +
          'The higher you fly, the faster you go, so climb high to cross an ocean.',
        touch:
          'Aloft, hold Climb to go up and Descend to come down; let go and the plane levels off. The stick banks it into a turn and works the throttle.\n\n' +
          'The higher you fly, the faster you go, so climb high to cross an ocean.',
      },
      {
        heading: 'Aerobatics',
        text:
          'Press {flightMode} for Aerobatics. Now {pitchUp} pulls the nose up, {pitchDown} pushes it down, {rollLeft} and {rollRight} roll, and a bank turns you. Loop, roll, dive! Fly too slowly and the plane stalls and drops its nose. Press {flightMode} again and Travel levels you out.',
        touch: 'Aerobatics needs a keyboard. On a touch screen the plane always flies in Travel, which is the easy way to get anywhere.',
      },
      {
        heading: 'The ceiling',
        text:
          'There is a ceiling high above the clouds, and up there the plane is at its fastest. From that high the world turns into a map of itself, every country in its own colour, so it is a fine place to decide where to come down.',
      },
      {
        heading: 'Landing',
        text:
          'Line up with flat, open ground and hold {descend}. Near the ground the plane slows to land and settles onto its wheels. Hillsides are too steep, and the sea is no runway: a plane let down on the water sinks. Fly into a building, or the ground nose first, and it is a wreck.',
        touch:
          'Line up with flat, open ground and hold Descend. Near the ground the plane slows to land and settles onto its wheels. Hillsides are too steep, and the sea is no runway: a plane let down on the water sinks. Fly into a building, or the ground nose first, and it is a wreck.',
      },
    ],
  },
  {
    id: 'helicopter-balloon',
    title: 'Helicopters and balloons',
    icon: 'heli',
    role: 'guide',
    summary: 'Hovering, rising and sinking, and coming down gently.',
    pages: [
      {
        heading: 'The helicopter',
        text:
          'The biggest cities keep a helicopter in a field outside town. Hold {jump} to lift off. In the air, {jump} rises, {descend} or {run} sinks, {forward} and {back} fly forwards and backwards, and {left} and {right} turn.',
        touch:
          'The biggest cities keep a helicopter in a field outside town. Hold Lift off to go up. In the air, Rise and Descend take you up and down, and the stick flies you forwards, backwards and round.',
      },
      {
        heading: 'Hovering',
        text:
          'A helicopter can hover, which makes it the best rescuer there is: stop low and still over somebody to pick them up. To land, come down gently on flat ground, then press {use} to step out.',
        touch:
          'A helicopter can hover, which makes it the best rescuer there is: stop low and still over somebody to pick them up. To land, come down gently on flat ground, then tap Get out.',
      },
      {
        heading: 'The balloon',
        text:
          'A few towns keep a hot-air balloon in a field nearby. It is slow on purpose: steer with the movement keys, hold {jump} to fire the burner and rise, and {descend} or {run} to let it sink. It comes down wherever the basket touches.',
        touch:
          'A few towns keep a hot-air balloon in a field nearby. It is slow on purpose: steer with the stick, hold Rise to fire the burner and Sink to let it down. It comes down wherever the basket touches.',
      },
      {
        heading: 'Stepping off high up',
        text: 'Press {use} high in the air to jump out of either one, and a parachute brings you down. The empty aircraft glides down by itself and waits where it lands.',
        touch: 'Tap Jump out high in the air to leave either one, and a parachute brings you down. The empty aircraft glides down by itself and waits where it lands.',
      },
    ],
  },
  {
    id: 'parachute',
    title: 'Parachutes and crashes',
    icon: 'sink',
    role: 'guide',
    summary: 'Jumping out of an aircraft, flying the canopy and what a crash does.',
    pages: [
      {
        heading: 'Jumping out',
        text: 'Press {use} while flying to jump out of any aircraft. At first you fall freely: steer with the movement keys, and hold {forward} to dive faster.',
        touch: 'Tap Jump out while flying to leave any aircraft. At first you fall freely: steer with the stick, and push it forward to dive faster.',
      },
      {
        heading: 'The canopy',
        text:
          'Press {jump} to open your canopy, and again to stow it and fall further. Whatever you do, it opens by itself before you get close to the ground. Under it, {left} and {right} turn you and {forward} flies faster.',
        touch:
          'Tap Jump to open your canopy, and again to stow it and fall further. Whatever you do, it opens by itself before you get close to the ground. Under it, the stick turns you and pushing it forward flies faster.',
      },
      {
        heading: 'Touching down',
        text: 'Come down on land and you are straight back on your feet. Come down on water and you swim. Nobody gets hurt in this world.',
      },
      {
        heading: 'Crashes',
        text:
          'Fly a plane into a building, a cliff or the ground and it explodes. You are thrown clear under a parachute, the wreck burns where it lies and everything round it is knocked flat for a while. An aircraft that comes down hard on the sea sinks, and you swim.',
      },
    ],
  },
];
