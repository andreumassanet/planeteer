/** Earth's ear for a walked world: the wind, the engine of what you drive and the music, through the same mix and the same voices. */

import type { Places } from '../../places.ts';
import type { Soundscape } from '../../audio.ts';
import type { MusicMoment } from '../../music.ts';
import { MUSIC_OF, MUSIC_STYLE, SOUND_OF } from './tables.ts';
import type { ShellWorld } from './types.ts';

/** How often the music is told where you are, ms: twice a second, as on Earth. */
const MUSIC_MS = 500;

/**
 * Returns `ear(dt, here, nearby)`, called every frame. No birds and no
 * crickets: nothing on these worlds sings (`wild` 0, `cold`).
 */
export function createEar(world: ShellWorld): (dt: number, here: { lat: number; lon: number }, nearby: ReturnType<Places['nearest']>) => void {
  const { host, spec, player, rig, sky } = world;
  /** What the music is told, and when it was last told it. */
  const musicMoment: MusicMoment = {
    mode: 'foot', height: 0, iso: '', continent: '', lat: 0, lon: 0, daylight: 1, town: false, place: 0, hour: 12,
    style: MUSIC_STYLE[spec.id] ?? 'sky',
  };
  let musicAt = -Infinity;
  const scape: Soundscape = { mode: 'foot', speed: 0, throttle: 0, height: 0, sea: 0, daylight: 1, wild: 0, cold: true, air: spec.sky.air };
  return (dt, here, nearby) => {
    const riding = player.craft;
    scape.mode = riding === null ? 'foot' : SOUND_OF[riding.kind];
    scape.speed = riding === null ? player.velocity.length() : Math.abs(riding.speed);
    scape.throttle = riding === null ? 0 : Math.abs(riding.speed) / Math.max(1, riding.top);
    scape.height = rig.altitude;
    scape.daylight = sky.state.day;
    host.soundscape?.(dt, scape);
    const nowMs = performance.now();
    if (nowMs - musicAt >= MUSIC_MS) {
      musicAt = nowMs;
      musicMoment.mode = riding === null ? 'foot' : MUSIC_OF[riding.kind];
      musicMoment.height = rig.altitude;
      musicMoment.lat = here.lat;
      musicMoment.lon = here.lon;
      musicMoment.daylight = sky.state.day;
      musicMoment.town = nearby.inside;
      musicMoment.place = nearby.index;
      musicMoment.hour = sky.state.hour;
      host.music?.(musicMoment);
    } else host.music?.(null);
  };
}
