/** The keys shown on taking a craft of these worlds, and in a rocket. */

import type { VehicleKind } from '../contract.ts';
import { MOVE } from '../../controls.ts';
import type { HintSet } from '../../controls.ts';

/** The keys in a rocket on its pad. */
export const ROCKET_KEYS: HintSet = {
  id: 'rocket',
  once: false,
  sticky: true,
  hints: [
    { keys: ['jump'], label: 'Hold to launch' },
    { keys: ['use'], label: 'Get out' },
  ],
};

/** The keys on taking a craft of these worlds: Earth's, less the horn. */
export function craftHints(kind: VehicleKind, airborne: boolean): HintSet {
  // Out of a craft aloft is out with a parachute, as on Earth (`controls.ts`).
  const out = { keys: ['use' as const], label: airborne ? 'Jump out, with a parachute' : 'Get out' };
  switch (kind) {
    case 'rover':
      return { id: 'world-rover', once: false, sticky: false, hints: [{ keys: MOVE, label: 'Drive' }, out] };
    case 'aerostat':
      return {
        id: airborne ? 'world-aerostat-air' : 'world-aerostat',
        once: false,
        sticky: false,
        hints: [{ keys: MOVE, label: 'Steer' }, { keys: ['jump'], label: 'Rise' }, { keys: ['run', 'descend'], label: 'Sink' }, out],
      };
    case 'lander':
      return airborne
        ? {
            id: 'world-lander-air',
            once: true,
            sticky: false,
            hints: [
              { keys: ['jump'], label: 'Climb' },
              { keys: ['descend'], label: 'Descend · land' },
              { keys: ['run'], label: 'Afterburner' },
              { keys: MOVE, label: 'Fly' },
              out,
            ],
          }
        : { id: 'world-lander', once: false, sticky: false, hints: [{ keys: ['jump'], label: 'Hold to lift off' }, { keys: MOVE, label: 'Steer' }, out] };
    case 'ufo':
      return airborne
        ? {
            id: 'world-ufo-air',
            once: true,
            sticky: false,
            hints: [
              { keys: ['jump'], label: 'Rise' },
              { keys: ['descend'], label: 'Sink · land' },
              { keys: ['run'], label: 'Boost' },
              { keys: MOVE, label: 'Fly' },
              out,
            ],
          }
        : { id: 'world-ufo', once: false, sticky: false, hints: [{ keys: ['jump'], label: 'Lift off' }, { keys: MOVE, label: 'Turn' }, out] };
  }
}
