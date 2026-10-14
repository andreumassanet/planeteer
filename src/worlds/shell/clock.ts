/** The world's clock: the host's real one, carried forward faster under the time lapse. */

import type { WorldHost } from '../../world-host.ts';
import type { Body } from '../../system/contract.ts';
import { localHour } from '../../system/geography.ts';
import type { TimeOfDay } from '../../settings.ts';
import type { Sky } from '../sky.ts';
import type { WorldPlayer } from '../player.ts';
import { latLonOf } from '../../sphere.ts';

/** The day at an hour a minute, as Earth's time lapse. */
const TIME_LAPSE = 60;

export interface Clock {
  date(): Date;
  /** The settings' and `/time`'s view of the clock. */
  readonly time: TimeOfDay;
  /** Carries the clock on by a frame, faster under the lapse. */
  advance(dt: number): void;
}

export function createClock(deps: { host: WorldHost; body: Body; sky: Sky; player: WorldPlayer }): Clock {
  const { host, body, sky, player } = deps;
  // The hour itself is the sky's (`Sky.setHour` turns the body, or the date on a locked world).
  let extraMs = 0;
  let rate = 1;
  let live = true;
  const date = (): Date => new Date(host.time().getTime() + extraMs);
  const time: TimeOfDay = {
    hour: () => sky.state.hour,
    live: () => live,
    setHour(hour) {
      sky.setHour(hour, date(), player.position);
      live = false;
      return hour;
    },
    setLive() {
      rate = 1;
      extraMs = 0;
      live = true;
      // The real hour where you stand, which is the clock with no offset.
      const { lon } = latLonOf(player.position);
      sky.setHour(localHour(body, lon, date()), date(), player.position);
    },
    fast: {
      get: () => rate !== 1,
      set(on) {
        rate = on ? TIME_LAPSE : 1;
        if (on) live = false;
        return on;
      },
    },
  };
  return {
    date,
    time,
    advance(dt) {
      extraMs += dt * 1000 * (rate - 1);
    },
  };
}
