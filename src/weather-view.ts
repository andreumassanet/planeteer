/**
 * The weather, drawn: what `weather.ts` says, made into rain and snow round the
 * camera, lightning and thunder, a wet or white ground, a grey sky and a closer
 * haze.
 *
 * At most three draw calls. The precipitation is one mesh of quads that never
 * moves on the CPU: every drop is a fixed seed in a box, and the vertex shader
 * wraps the box round the camera, drops it with the fall and slants it with the
 * wind. Rain is streaks along the fall, snow is flakes facing you that sway; the
 * same mesh draws either, and the count is a draw range. The bolt is the second
 * mesh and its ink hull the third, drawn only while a strike is showing.
 *
 * The model is sampled four times a second and eased between answers, so a
 * front arrives over seconds; a jump across the map (`goTo`, a join) snaps
 * instead.
 *
 * Lightning is the model's too: `strikeCandidate` rolls each cell of the sky
 * once a slot of the clock, and a roll under the storm at the point it names is
 * a strike at that point and instant for every client. What is local is how a
 * strike looks and sounds from where you are: the flash dims with distance and
 * the thunder arrives at the speed of sound over the real metres between
 * (`SCENERY_SCALE`).
 */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundWeather } from './globe.ts';
import { LAND_HEIGHT } from './geo.ts';
import { CLOUD_BASE, cloudShadeAt } from './clouds.ts';
import type { CloudShadeSample, Clouds } from './clouds.ts';
import { cloudShade, sunCutOf } from './cloud-shade.ts';
import type { Sky } from './sun.ts';
import { reliefAt } from './terrain.ts';
import { latLonOf, unitAt } from './sphere.ts';
import { setWeatherHaze } from './view.ts';
import { SCENERY_SCALE } from './stature.ts';
import { proxyOf } from './warm.ts';
import { STRIKE_CELL, STRIKE_ODDS, STRIKE_SLOT_MS, classify, seasonOf, seasonTurn, strikeCandidate, weatherAt, weatherSample, wetnessAt } from './weather.ts';
import type { Strike, WeatherKind } from './weather.ts';
import type { WeatherView } from './weather-view/types.ts';
import { BOLT_TOP, DRYING, FLAKE, FLASH_DISTANT, FLASH_FAR, FLASH_NEAR, JUMP, LAYER_SPEED, MAX_DROPS, MELTING, PRESETS, RAIN_BOX, RAIN_DRIFT, RAIN_FALL, REBASE, SAMPLE_EVERY, SETTLING, SNOW_BOX, SNOW_DRIFT, SNOW_FALL, SNOW_SHARE, SOUND_SPEED, STREAK, STREAK_WIDTH, STRIKE_GAP_MS, STRIKE_REACH, WET_EASE, WET_SAMPLE_EVERY, WETTING, clamp01, easeState, follow, mod, overcastOf, smoothstep } from './weather-view/constants.ts';
import { Y, createBoltMesh, writeBolt } from './weather-view/bolt.ts';
import { createDropLayer } from './weather-view/drops.ts';
import { continentalTexture } from './weather-view/ground.ts';

export type { WeatherHere, WeatherView } from './weather-view/types.ts';
export { MAX_DROPS, RAIN_BOX, SNOW_BOX, PRESETS, overcastOf } from './weather-view/constants.ts';
export { dropGeometry, dropOffset } from './weather-view/drops.ts';
export { writeBolt, BOLT_VERTICES } from './weather-view/bolt.ts';

export function createWeatherView(sky: Sky, clouds: Clouds): WeatherView {
  const group = new THREE.Group();
  group.name = 'weather';

  groundWeather.atlasContinental.value = continentalTexture();

  const { uniforms, dropMaterial, drops } = createDropLayer();
  group.add(drops);

  const { bolt, boltPositions, boltAttribute, boltGeometry, boltMaterial } = createBoltMesh();
  group.add(bolt);

  // The eased state, the model's latest answer and the forced one.
  const state = weatherSample();
  const target = weatherSample();
  let wetGround = 0;
  /** The model's wetness at the last read (`wetnessAt`), or null while the weather is forced or off. */
  let wetModel: number | null = null;
  /** Seconds to the next wetness read, and the rings' clock. */
  let wetClock = 0;
  let rainClock = 0;
  let freshSnow = 0;
  let lying = 0;
  let sampleClock = 0;
  let sampled = false;
  const lastSample = new THREE.Vector3();
  let forced: WeatherKind | null = null;
  let enabled = true;
  let sampleMs = 0;

  // The box's frame and its integrated fall, in double precision.
  const anchor = new THREE.Vector3();
  let anchored = false;
  const offset = [0, 0, 0];
  let layer = 0;
  let clock = 0;
  const relative = new THREE.Vector3();

  // Lightning.
  let slot = Number.NaN;
  const pending: Strike[] = [];
  const candidate: Strike = { lat: 0, lon: 0, at: 0, seed: 0 };
  let strikes = 0;
  let flashAge = Infinity;
  /**
   * When the last strike was seen, on the machine's clock. Strikes are the sky
   * clock's, and under the time-lapse a slot of them goes by in a frame or two,
   * so one strike in `STRIKE_GAP_MS` is seen and heard however fast the sky runs;
   * the rest pass unseen, as strikes past the haze do.
   */
  let struckAt = -Infinity;
  let flashStrength = 0;
  const strikePoint = new THREE.Vector3();
  const strikeUp = new THREE.Vector3();
  const probe = weatherSample();
  const here = { lat: 0, lon: 0 };
  /** The deck's shade at the player, on the exact field, a sample at a time. */
  const shadeHere: CloudShadeSample = { cover: 0, depth: 0, shade: 0 };

  const sound = { rain: 0, gale: 0 };

  function rebase(camera: THREE.Vector3): void {
    anchor.copy(camera);
    anchored = true;
    const up = uniforms.uUp.value.copy(camera).normalize();
    const east = uniforms.uEast.value.crossVectors(Y, up);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    uniforms.uNorth.value.crossVectors(up, east);
  }

  function sample(time: number, player: THREE.Vector3, ground: number): void {
    const began = performance.now();
    latLonOf(player, here);
    const elevation = Math.max(0, ground - PLANET_RADIUS - LAND_HEIGHT);
    weatherAt(here.lat, here.lon, elevation, time, target);
    cloudShadeAt(player, sky.state.sun, time, shadeHere);
    lying = target.lying;
    wetClock -= SAMPLE_EVERY;
    if (forced === null && enabled && (wetClock <= 0 || wetModel === null)) {
      wetClock = WET_SAMPLE_EVERY;
      wetModel = wetnessAt(here.lat, here.lon, elevation, time);
    } else if (forced !== null || !enabled) wetModel = null;
    if (forced !== null) {
      Object.assign(target, PRESETS[forced]);
      if (forced === 'snow') target.temperatureC = Math.min(target.temperatureC, -3);
      else if (forced === 'rain' || forced === 'storm' || forced === 'drizzle') target.temperatureC = Math.max(target.temperatureC, 6);
      classify(target);
    } else if (!enabled) {
      Object.assign(target, PRESETS.clear);
      classify(target);
    }
    sampleMs = performance.now() - began;
  }

  function strikeStorm(lat: number, lon: number, when: number, player: THREE.Vector3): number {
    if (!enabled) return 0;
    if (forced !== null) {
      // A forced storm has no cells of its own: it is a storm round you.
      if (forced !== 'storm') return 0;
      unitAt(lat, lon, strikePoint).multiplyScalar(PLANET_RADIUS);
      return 0.5 * (1 - smoothstep(600, 1400, strikePoint.distanceTo(player)));
    }
    unitAt(lat, lon, strikeUp);
    weatherAt(lat, lon, Math.max(0, reliefAt(strikeUp.x, strikeUp.y, strikeUp.z)), when, probe);
    return probe.storm;
  }

  /** The strikes due in a slot of the clock, within reach of the player. */
  function schedule(nextSlot: number, now: number, player: THREE.Vector3): void {
    pending.length = 0;
    latLonOf(player, here);
    const reachDegrees = STRIKE_REACH / UNITS_PER_DEGREE;
    const rows = Math.ceil(reachDegrees / STRIKE_CELL);
    const cos = Math.max(0.2, Math.cos((here.lat * Math.PI) / 180));
    const cols = Math.min(Math.ceil(360 / STRIKE_CELL / 2), Math.ceil(reachDegrees / cos / STRIKE_CELL));
    const row0 = Math.floor(here.lat / STRIKE_CELL);
    const col0 = Math.floor(here.lon / STRIKE_CELL);
    for (let r = row0 - rows; r <= row0 + rows; r++) {
      for (let c = col0 - cols; c <= col0 + cols; c++) {
        const roll = strikeCandidate(r, c, nextSlot, candidate);
        if (roll >= STRIKE_ODDS || candidate.at < now || candidate.lat > 90 || candidate.lat < -90) continue;
        const storm = strikeStorm(candidate.lat, candidate.lon, candidate.at, player);
        if (roll < STRIKE_ODDS * storm && pending.length < 8) pending.push({ ...candidate });
      }
    }
  }

  function fire(strike: Strike, camera: THREE.Vector3): void {
    unitAt(strike.lat, strike.lon, strikeUp);
    const ground = PLANET_RADIUS + LAND_HEIGHT + Math.max(0, reliefAt(strikeUp.x, strikeUp.y, strikeUp.z));
    strikePoint.copy(strikeUp).multiplyScalar(ground);
    const distance = strikePoint.distanceTo(camera);
    if (distance > STRIKE_REACH) return;
    const wall = performance.now();
    if (wall - struckAt < STRIKE_GAP_MS) return;
    struckAt = wall;
    strikes++;
    writeBolt(boltPositions, strikePoint, strikeUp, BOLT_TOP, 3 + distance * 0.0012, strike.seed);
    boltAttribute.needsUpdate = true;
    boltGeometry.computeVertexNormals();
    flashAge = 0;
    // A strike lights the whole scene only when it is close enough to be seen: past
    // the haze it would be a white-out from a clear sky. Out there it is a faint
    // flicker, and only when the storm is over the player too (`state.storm`).
    const near = 1 - smoothstep(FLASH_NEAR, FLASH_FAR, distance);
    flashStrength = Math.max(near, FLASH_DISTANT * state.storm * (1 - smoothstep(FLASH_FAR, STRIKE_REACH, distance)));
    const metres = distance / SCENERY_SCALE;
    view.onThunder?.(metres / SOUND_SPEED, 1 / (1 + metres / 1400));
  }

  /** The flash's envelope, real seconds after a strike: a blink, a gap, a longer second stroke. */
  function flashAt(age: number): number {
    if (age < 0.07) return 1;
    if (age < 0.13) return 0.12;
    if (age < 0.3) return 0.85 * (1 - (age - 0.13) / 0.17);
    return 0;
  }

  const view: WeatherView = {
    group,
    sound,
    onThunder: null,
    proxies: () => [proxyOf(dropMaterial), proxyOf(boltMaterial)],
    get enabled() {
      return enabled;
    },
    set enabled(on: boolean) {
      enabled = on;
      sampleClock = 0;
    },
    force(kind) {
      forced = kind === null || !(kind in PRESETS) ? null : kind;
      sampleClock = 0;
      sampled = false;
      return forced;
    },
    at(lat, lon, when) {
      const out = weatherSample();
      unitAt(lat, lon, strikeUp);
      const time = when === undefined ? sky.state.time.getTime() : typeof when === 'number' ? when : when.getTime();
      return weatherAt(lat, lon, Math.max(0, reliefAt(strikeUp.x, strikeUp.y, strikeUp.z)), time, out);
    },
    here() {
      const bearing = (Math.atan2(state.windEast, state.windNorth) * 180) / Math.PI;
      return {
        kind: state.kind,
        intensity: Number(state.intensity.toFixed(2)),
        temperatureC: Number(state.temperatureC.toFixed(1)),
        wind: { speed: Number(state.windSpeed.toFixed(1)), from: Math.round(mod(bearing + 180, 360)) },
        cover: Number(state.cover.toFixed(2)),
        precipitation: Number(state.precipitation.toFixed(2)),
        snow: Number(state.snow.toFixed(2)),
        storm: Number(state.storm.toFixed(2)),
        fog: Number(state.fog.toFixed(2)),
        lying: Number(Math.max(lying, freshSnow).toFixed(2)),
        wet: Number(wetGround.toFixed(2)),
        shade: Number((shadeHere.shade * cloudShade.strength).toFixed(2)),
        forced,
        enabled,
      };
    },
    get stats() {
      return {
        kind: state.kind,
        drops: drops.visible ? drops.geometry.drawRange.count / 6 : 0,
        snowing: uniforms.uSnow.value > 0.5,
        strikes,
        pending: pending.length,
        bolt: bolt.visible,
        sampleMs: Number(sampleMs.toFixed(3)),
      };
    },
    update(dt, time, player, ground, camera, daylight) {
      const now = time.getTime();
      const cameraPosition = camera.position;

      // The model, a few times a second; a jump snaps.
      sampleClock -= dt;
      if (sampleClock <= 0) {
        sampleClock = SAMPLE_EVERY;
        const jumped = !sampled || lastSample.distanceTo(player) > JUMP;
        lastSample.copy(player);
        sample(now, player, ground);
        if (jumped) {
          Object.assign(state, target);
          wetGround = wetModel ?? (target.precipitation > 0.1 && target.snow < 0.5 ? 1 : 0);
          freshSnow = target.precipitation > 0.1 && target.snow >= 0.5 ? 0.8 : 0;
          sampled = true;
        }
      }
      // Ease every frame, so the rain thins smoothly between two samples.
      easeState(state, target, dt);
      classify(state);

      const raining = state.precipitation > 0.05 && state.snow < 0.5;
      const snowing = state.precipitation > 0.05 && state.snow >= 0.5;
      // The model's wetness, eased between reads; a forced sky wets and dries on the wall clock.
      if (wetModel !== null) wetGround += (wetModel - wetGround) * follow(dt, WET_EASE);
      else wetGround += ((raining ? 1 : 0) - wetGround) * follow(dt, raining ? WETTING : DRYING);
      rainClock = (rainClock + dt) % 600;
      const melt = state.temperatureC > 1;
      const settle = snowing ? Math.min(1, state.precipitation * 1.5) : melt ? 0 : freshSnow;
      freshSnow += (settle - freshSnow) * follow(dt, snowing ? SETTLING : MELTING);

      // Above the deck the weather is below you: the rain, the grey and the
      // haze let go on the way through it.
      const altitude = cameraPosition.length() - ground;
      const above = smoothstep(CLOUD_BASE * 0.7, CLOUD_BASE * 1.35, altitude);
      const orbit = smoothstep(2000, 9000, altitude);

      // The sky and the haze, and the sun. A bank's own darkening is the deck's
      // shade's wherever there is a real deck behind the weather (`cloudShade.share`);
      // a forced sky and the weather off have none, and use the cut of the whole
      // world's sun (`sunCutOf`).
      cloudShade.weather = enabled && forced === null ? 1 : 0;
      const overcast = overcastOf(state, above);
      sky.weather.overcast = overcast;
      sky.weather.sunCut = sunCutOf(overcast, state.precipitation, state.storm, above, cloudShade.share);
      sky.weather.mist = clamp01(state.fog * 1.2) * (1 - above);
      clouds.setGrey(clamp01(state.precipitation * 0.9 + state.storm * 0.6 + state.cover * state.wet * 0.15) * (1 - orbit));
      setWeatherHaze(enabled || forced !== null ? (1 - 0.1 * state.wet) * (1 - 0.72 * state.fog) : 1);

      // The ground.
      groundWeather.atlasWet.value = wetGround;
      groundWeather.atlasRain.value = raining ? clamp01(state.precipitation * 1.4) * (1 - above) : 0;
      groundWeather.atlasRainClock.value = rainClock;
      groundWeather.atlasFresh.value = freshSnow;
      groundWeather.atlasSeason.value = seasonOf(now);
      groundWeather.atlasSeasonTurn.value = seasonTurn(now);
      groundWeather.atlasWeatherAt.value.copy(player);

      // The drops.
      const falling = state.precipitation * (1 - above);
      drops.visible = falling > 0.02;
      if (drops.visible) {
        if (!anchored || anchor.distanceTo(cameraPosition) > REBASE) rebase(cameraPosition);
        const snowy = state.snow >= 0.5 ? 1 : 0;
        const box = snowy ? SNOW_BOX : RAIN_BOX;
        const fall = (snowy ? SNOW_FALL : RAIN_FALL) * SCENERY_SCALE;
        const drift = state.windSpeed * SCENERY_SCALE * (snowy ? SNOW_DRIFT : RAIN_DRIFT);
        const east = uniforms.uEast.value;
        const north = uniforms.uNorth.value;
        const up = uniforms.uUp.value;
        const ve = state.windEast * drift;
        const vn = state.windNorth * drift;
        offset[0] = mod(offset[0]! + ve * dt, box);
        offset[1] = mod(offset[1]! - fall * dt, box);
        offset[2] = mod(offset[2]! + vn * dt, box);
        layer = mod(layer + fall * LAYER_SPEED * dt, box);
        clock = (clock + dt) % 3600;
        relative.subVectors(cameraPosition, anchor);
        uniforms.uShift.value.set(
          mod(offset[0]! - relative.dot(east), box),
          mod(offset[1]! - relative.dot(up), box),
          mod(offset[2]! - relative.dot(north), box),
        );
        uniforms.uCamera.value.copy(cameraPosition);
        uniforms.uLayer.value = layer;
        uniforms.uBox.value = box;
        uniforms.uFall.value.set(ve, -fall, vn);
        uniforms.uSnow.value = snowy;
        uniforms.uLength.value = snowy ? FLAKE : STREAK * (1 + 0.5 * state.storm);
        uniforms.uWidth.value = snowy ? FLAKE : STREAK_WIDTH;
        uniforms.uClock.value = clock;
        const light = 0.16 + 0.84 * daylight + 1.6 * sky.weather.flash;
        if (snowy) uniforms.uColor.value.setRGB(0.95 * light, 0.96 * light, 1 * light);
        else uniforms.uColor.value.setRGB(0.7 * light, 0.75 * light, 0.84 * light);
        uniforms.uOpacity.value = snowy ? 0.95 : 0.3 + 0.3 * state.precipitation;
        const count = Math.round(MAX_DROPS * (snowy ? SNOW_SHARE : 1) * Math.min(1, falling * 1.15));
        drops.geometry.setDrawRange(0, count * 6);
      }

      // Lightning: the slot's strikes, then any that are due.
      const nextSlot = Math.floor(now / STRIKE_SLOT_MS);
      if (nextSlot !== slot) {
        slot = nextSlot;
        schedule(nextSlot, now, player);
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i]!.at <= now) {
          fire(pending[i]!, cameraPosition);
          pending.splice(i, 1);
        }
      }
      flashAge += dt;
      const flash = flashAt(flashAge);
      bolt.visible = flash > 0.1;
      sky.weather.flash = flash * flashStrength * (1 - 0.6 * orbit);

      sound.rain = falling * (1 - state.snow);
      sound.gale = clamp01((state.windSpeed - 6) / 14);
    },
  };
  return view;
}

