import type { TimeOfDay } from '../settings.ts';
import type { App } from './context.ts';

/** The time-lapse's rate: an hour of sky a minute. */
const TIME_LAPSE = 60;

/**
 * The settings' time of day: live, or a chosen hour that keeps running. The
 * hour is read off the HUD's clock (the local zone, or solar time at sea),
 * so a chosen hour is applied as the difference from the hour shown. Nothing
 * here is kept across a reload.
 */
export function createTimeOfDay(app: App): TimeOfDay {
  const { sky, clock, hud } = app;
  const shownMinutes = (): number | null => {
    const [hours, minutes] = hud.clock.split(':').map(Number);
    return hours === undefined || minutes === undefined || !Number.isFinite(hours + minutes) ? null : hours * 60 + minutes;
  };
  return {
    hour: () => (shownMinutes() ?? 720) / 60,
    live: () => clock.live,
    setHour(hour) {
      const now = shownMinutes();
      if (now === null) return hour;
      const wanted = Math.round(hour * 60) % 1440;
      if (sky.setTime(sky.state.time.getTime() + (wanted - now) * 60_000)) clock.live = false;
      return hour;
    },
    setLive() {
      sky.setRate(1);
      sky.setTime(null);
      clock.live = true;
      clock.fast = false;
    },
    fast: {
      get: () => clock.fast,
      set(on) {
        clock.fast = on;
        sky.setRate(on ? TIME_LAPSE : 1);
        if (on) clock.live = false;
        return on;
      },
    },
  };
}
