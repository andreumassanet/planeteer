/** The lists that teach the keys: the settings' controls page, and the few keys shown as a new way of travelling is taken up. */
import type { Action, ControlRow, HintSet, KeyHint, TravelMode } from './types.ts';

/** The four movement keys in the order a player reads them: W A S D. */
export const MOVE: readonly Action[] = ['forward', 'left', 'back', 'right'];

/**
 * Every binding in the world, in the order a player meets them: the settings'
 * controls page, which is the one place the whole table is shown. The world shows
 * a key only where it is the answer to something (`boardingHints`, the prompt).
 */
export const CONTROL_SECTIONS: readonly { title: string; rows: readonly ControlRow[] }[] = [
  {
    title: 'Moving',
    rows: [
      { action: 'forward', label: 'Forward · throttle up' },
      { action: 'back', label: 'Back · throttle down' },
      { action: 'left', label: 'Left · bank left' },
      { action: 'right', label: 'Right · bank right' },
      { action: 'run', label: 'Run · swim faster · boost · gallop · descend in the air' },
      { action: 'jump', label: 'Jump · climb · rise in a balloon or a helicopter · open or stow a parachute' },
      { action: 'descend', label: 'Descend and land · dive · sink' },
      { action: 'use', label: 'Get in or out · jump out under way · take the wheel · talk' },
      { action: 'horn', label: 'Horn · bell · snort, at the controls' },
    ],
  },
  {
    title: 'Camera',
    rows: [
      { fixed: 'mouse', label: 'Look around' },
      { fixed: 'wheel', label: 'Nearer or further, on foot' },
      { action: 'view', label: 'First person, on foot or in any seat' },
      { action: 'photo', label: 'Save a photo' },
      { action: 'hud', label: 'Hide or show everything on screen' },
    ],
  },
  {
    title: 'Finding your way',
    rows: [
      { action: 'map', label: 'World map' },
      { action: 'mapIn', label: 'Zoom the map in' },
      { action: 'mapOut', label: 'Zoom the map out' },
      { action: 'passport', label: 'Passport: a stamp for every country' },
      { action: 'flags', label: 'Flags and borders from the air' },
    ],
  },
  {
    title: 'Everyone else',
    rows: [
      { action: 'players', label: 'Who is playing (hold)' },
      { action: 'chat', label: 'Chat · type / for commands' },
      { action: 'wave', label: 'Wave' },
      { action: 'dance', label: 'Dance, until you move' },
    ],
  },
  {
    title: 'The game',
    rows: [
      { action: 'settings', label: 'Settings' },
      { action: 'nearer', label: 'Render distance nearer' },
      { action: 'farther', label: 'Render distance further' },
      { fixed: 'release', label: 'Free the mouse · close a card' },
    ],
  },
];

/**
 * The keys a way of travelling needs, or null for none. On foot there is nothing:
 * the welcome card has said it. A plane aloft is the one that matters: the climb
 * and the descent are not keys anyone guesses, and a player who has never found
 * them cannot land.
 */
export function boardingHints(mode: TravelMode, airborne = false, stranded = false): HintSet | null {
  const out: KeyHint = { keys: ['use'], label: 'Get out' };
  const horn: KeyHint = { keys: ['horn'], label: 'Horn' };
  const bail: KeyHint = { keys: ['use'], label: 'Jump out' };
  const set = (id: string, hints: KeyHint[], once = false, sticky = false): HintSet => ({ id, once, sticky, hints });
  switch (mode) {
    case 'swim':
      return set('swim', [
        { keys: MOVE, label: 'Swim' },
        { keys: ['run'], label: 'Faster' },
        { keys: ['descend'], label: 'Dive' },
        { keys: ['jump'], label: 'Up to the surface' },
      ], true);
    case 'submarine':
      return set('submarine', [
        { keys: MOVE, label: 'Steer' },
        { keys: ['descend'], label: 'Dive' },
        { keys: ['jump'], label: 'Rise · surface to get out' },
        out,
      ], true);
    case 'car':
      return set('car', [{ keys: MOVE, label: 'Drive' }, { keys: ['run'], label: 'Boost' }, horn, out]);
    case 'boat':
      return set('boat', [{ keys: MOVE, label: 'Steer' }, { keys: ['run'], label: 'Boost' }, horn, out]);
    case 'jetski':
      return set('jetski', [{ keys: MOVE, label: 'Steer' }, { keys: ['run'], label: 'Boost' }, horn, out]);
    case 'sailboat':
      return set('sailboat', [{ keys: MOVE, label: 'Steer' }, { keys: ['run'], label: 'Haul the sheet in' }, horn, out]);
    case 'bicycle':
      return set('bicycle', [{ keys: MOVE, label: 'Pedal and steer' }, { keys: ['run'], label: 'Out of the saddle' }, { ...horn, label: 'Bell' }, out]);
    case 'motorbike':
      return set('motorbike', [{ keys: MOVE, label: 'Ride' }, { keys: ['run'], label: 'Full throttle' }, horn, out]);
    case 'horse':
      return set('horse', [
        { keys: MOVE, label: 'Ride' },
        { keys: ['run'], label: 'Gallop' },
        { keys: ['jump'], label: 'Jump' },
        { ...horn, label: 'Snort' },
        { ...out, label: 'Dismount' },
      ]);
    case 'helicopter':
      // Aloft, the rise and the fall are said until used; on the ground, how to lift off, every time.
      return airborne
        ? set(
            'helicopter-air-2',
            [
              { keys: ['jump'], label: 'Rise' },
              { keys: ['run', 'descend'], label: 'Descend · land on flat ground' },
              { keys: ['forward', 'back'], label: 'Fly forward · back' },
              { keys: ['left', 'right'], label: 'Turn' },
              { ...bail, label: 'Jump out, with a parachute' },
            ],
            true,
          )
        : set('helicopter', [{ keys: ['jump'], label: 'Hold to lift off' }, { keys: ['left', 'right'], label: 'Turn' }, out]);
    case 'plane':
      return airborne
        ? set(
            'plane-air-2',
            [
              { keys: ['jump'], label: 'Climb' },
              { keys: ['run', 'descend'], label: 'Descend · land on flat ground' },
              { keys: ['left', 'right'], label: 'Bank' },
              { ...bail, label: 'Jump out, with a parachute' },
            ],
            true,
          )
        : set('plane', [{ keys: ['forward'], label: 'Hold to take off' }, { keys: ['left', 'right'], label: 'Steer' }, { keys: ['back'], label: 'Brake' }, out]);
    case 'balloon':
      return set(airborne ? 'balloon-air' : 'balloon', [
        { keys: MOVE, label: 'Steer' },
        { keys: ['jump'], label: 'Rise' },
        { keys: ['run', 'descend'], label: 'Sink' },
        airborne ? { ...bail, label: 'Jump out, with a parachute' } : out,
      ]);
    case 'passenger':
      if (airborne && stranded) return set('stranded', [{ keys: ['use'], label: 'Take the controls' }], false, true);
      return airborne ? set('passenger-air', [{ ...bail, label: 'Jump out, with a parachute' }], true) : set('passenger', [out]);
    default:
      return null;
  }
}
