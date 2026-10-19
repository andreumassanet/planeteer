/**
 * The ear's phase, after the sky: what the foot is on, how near the sea is,
 * town or wild, and what the vehicle sounds like, handed to `audio.update`
 * every frame. The slow questions (biome, coast, town) are asked twice a
 * second; the music hears them when they change.
 */
import * as THREE from 'three';
import { toLatLon } from '../../geo.ts';
import { PLANET_RADIUS } from '../../globe.ts';
import { biomeAt } from '../../biome.ts';
import { shoreDistance } from '../../terrain.ts';
import { clockAt } from '../../timezone.ts';
import { PLANE_CRUISE_HIGH, PLANE_CRUISE_LOW, topSpeedOf } from '../../vehicles.ts';
import type { Soundscape } from '../../audio.ts';
import type { App } from '../context.ts';
import { MUSIC_OF, SOUND_OF } from '../craft-kinds.ts';
import type { Tick } from './tick.ts';

/** How far off the water the sea is heard, degrees of `shoreDistance`: 0.4 is a few streets back from a harbour. */
const SEA_EARSHOT = 0.4;

export function createSoundPhase(app: App): (tick: Tick) => void {
  const { player, settlements, weather, effects, world, places, sky, sea, map, guard } = app;
  const sound = app.sound;
  const { audio, musicMoment } = sound;
  const biome = app.biomeHere;
  const point = new THREE.Vector3();
  let clock = 0;
  /** The slow questions were asked again and the music has not heard them yet. */
  let musicDue = false;
  let cold = false;
  let seaNear = 0;
  let wild = 1;
  let wildTarget = 1;
  let mapWasOpen = false;
  const soundscape: Soundscape = { mode: 'foot', speed: 0, throttle: 0, height: 0, sea: 0, daylight: 1, wild: 0, cold: false, rain: 0, gale: 0, underwater: 0 };

  function askSlowQuestions(ground: number): void {
    const at = toLatLon(player.position);
    const inTown = settlements.madeHeightAt(player.position) > 0;
    const unit = point.copy(player.position).normalize();
    biomeAt(unit.x, unit.y, unit.z, at.lat, at.lon, ground - PLANET_RADIUS, biome);
    // Snow on the ground is snow underfoot, the season's or a fresh fall's.
    cold = biome.id === 'ice' || biome.id === 'tundra' || weather.here().lying > 0.5;
    app.footing = inTown ? 'paving' : cold ? 'snow' : biome.id === 'desert' || biome.id === 'rock' ? 'dirt' : 'grass';
    seaNear = player.state === 'swim' || player.ride?.model.medium === 'water'
      ? 1
      : Math.max(0, 1 - shoreDistance(at.lat, at.lon) / SEA_EARSHOT);
    wildTarget = inTown ? 0 : 1;
    // A road is paved, as a town is, for the dust off a wheel.
    effects.setGround(inTown || app.walls.madeHeightAt(player.position) > 0, biome.id);
    if (sound.music !== null) {
      // The country (0 at sea), the town, the hour a raga keeps to, and the nearest place, which seeds it.
      const index = world.countryAtPoint(player.position);
      const country = index > 0 ? world.countries[index - 1]! : null;
      const nearby = places.nearest(player.position);
      musicMoment.iso = country?.iso ?? '';
      musicMoment.continent = country?.continent ?? '';
      musicMoment.lat = at.lat;
      musicMoment.lon = at.lon;
      musicMoment.town = inTown;
      musicMoment.place = nearby.index;
      musicMoment.hour = Number.parseInt(clockAt(sky.state.time, musicMoment.iso, at.lon, at.lat, nearby.place), 10);
      musicDue = true;
    }
  }

  return ({ dt, ground, eyeOverGround }) => {
    clock -= dt;
    if (clock <= 0) {
      clock = 0.5;
      askSlowQuestions(ground);
    }
    wild += (wildTarget - wild) * Math.min(1, dt * 0.8);
    const speedNow = player.velocity;
    // A passenger hears the engine too.
    const kind = player.ride?.model.kind ?? null;
    const mode = kind === null ? (player.state === 'swim' ? 'swim' : 'foot') : SOUND_OF[kind];
    if (sound.music !== null) {
      const tune = sound.music;
      if (musicDue) {
        musicDue = false;
        musicMoment.mode = kind === null ? (player.state === 'swim' ? 'swim' : 'foot') : MUSIC_OF[kind];
        musicMoment.height = eyeOverGround;
        musicMoment.daylight = sky.state.daylight;
        // As `weatherCueOf` in `music-score/atmosphere.ts` reads it, without loading the music.
        const overhead = weather.here().kind;
        musicMoment.weather = overhead === 'storm' || overhead === 'snow' ? overhead : overhead === 'rain' || overhead === 'drizzle' ? 'rain' : 'clear';
        guard('music', () => tune.observe(musicMoment));
      }
      guard('music', () => tune.update());
    }
    soundscape.mode = mode;
    soundscape.speed = speedNow;
    soundscape.throttle =
      mode === 'plane'
        ? player.airborne
          ? (speedNow - PLANE_CRUISE_LOW * 0.55) / (PLANE_CRUISE_HIGH - PLANE_CRUISE_LOW * 0.55)
          : speedNow / PLANE_CRUISE_LOW
        : kind !== null
          ? speedNow / topSpeedOf(kind)
          : 0;
    soundscape.height = eyeOverGround;
    soundscape.sea = seaNear;
    soundscape.daylight = sky.state.daylight;
    soundscape.wild = wild;
    soundscape.cold = cold;
    // The rain's drum is on the surface, not under it.
    soundscape.rain = sea.underwater ? 0 : weather.sound.rain;
    soundscape.gale = weather.sound.gale;
    soundscape.underwater = sea.underwater ? 1 : 0;
    guard('audio', () => audio.update(dt, soundscape));
    if (map.open !== mapWasOpen) {
      mapWasOpen = map.open;
      audio.cue(map.open ? 'ui-open' : 'ui-close');
    }
  };
}
