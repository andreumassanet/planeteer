/** The per-frame mix: the loops follow the state of the world, and the birds and crickets come and go. */
import { HOOF_LEVEL, MOTORS, PLANE_LEVEL, RAIN_LEVEL, ROTOR_LEVEL, SAUCER_LEVEL, SEA_LEVEL, TICK_LEVEL, VARIANTS, WIND_LEVEL, MUFFLED, OPEN_AIR, between, clamp01, follow } from './levels.ts';
import type { createSamples } from './samples.ts';
import type { createSynth } from './synth.ts';
import type { Runtime } from './runtime.ts';
import type { Soundscape } from './types.ts';

export function createMix(rt: Runtime, synth: ReturnType<typeof createSynth>, samples: ReturnType<typeof createSamples>) {
  const { tick, birds, cricket } = synth;
  const { play } = samples;
  /** Seconds to a bicycle's next freewheel tick, and a horse's next hoof. */
  let nextTick = 0;
  let nextHoof = 0;
  let hoof = 0;

  // Slow random walks that keep the loops from sounding like a test tone.
  let gust = 0.5;
  let gustTarget = 0.5;
  let gustClock = 0;
  let swell = 0;
  let swellPeriod = 7;
  let nextBirds = 3;
  let nextCricket = 0.5;

  /** Moves every loop towards what the state of the world asks for. */
  function update(dt: number, state: Soundscape): void {
    const ctx = rt.context;
    const loops = rt.loops;
    if (ctx === null || loops === null) return;
    const { wind, sea, boat, plane, rotor, saucer, nature, rain } = loops;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (rt.muffle !== null) {
      const under = clamp01(state.underwater ?? 0);
      follow(rt.muffle.frequency, OPEN_AIR * Math.pow(MUFFLED / OPEN_AIR, under), now, 0.12);
    }
    const flying = state.mode === 'plane';
    const sailing = state.mode === 'boat' || state.mode === 'jetski' || state.mode === 'sail';
    const drifting = state.mode === 'balloon' || state.mode === 'helicopter' || state.mode === 'saucer';
    // Open to the air and quiet: birds and crickets are heard on a bicycle
    // or a horse as they are on foot; under sail it is the sea that is heard.
    const walking = state.mode === 'foot' || state.mode === 'bicycle' || state.mode === 'horse';
    const menu = state.mode === 'menu';
    const throttle = clamp01(state.throttle);

    // Gusts: a new target every few seconds, approached slowly.
    gustClock -= dt;
    if (gustClock <= 0) {
      gustTarget = between(0.25, 1);
      gustClock = between(2.5, 6);
    }
    gust += (gustTarget - gust) * clamp01(dt * 0.6);
    const gale = menu ? 0 : clamp01(state.gale ?? 0);
    const wet = menu ? 0 : clamp01(state.rain ?? 0);

    const high = clamp01(state.height / 400);
    const windLevel = menu
      ? 0
      : flying
        ? WIND_LEVEL * (1.1 + 1.4 * throttle + 0.6 * high)
        : sailing || drifting
          ? WIND_LEVEL * (0.8 + 0.6 * throttle + 0.6 * (drifting ? high : 0))
          : WIND_LEVEL * (0.45 + 0.9 * clamp01(state.height / 60));
    follow(wind.gain.gain, windLevel * clamp01(state.air ?? 1) * (0.55 + 0.45 * gust) * (1 + 1.6 * gale), now);
    follow(wind.band.frequency, (flying ? 600 + 900 * throttle : 320) * (0.75 + 0.5 * gust), now, 0.8);

    // The swell: a slow rise and a slower fall, one every six to nine seconds.
    swell += dt / swellPeriod;
    if (swell >= 1) {
      swell -= 1;
      swellPeriod = between(6, 9);
    }
    const crest = swell < 0.35 ? swell / 0.35 : 1 - (swell - 0.35) / 0.65;
    const shaped = crest * crest * (3 - 2 * crest);
    const seaNear = menu ? 0 : clamp01(state.sea) * (flying ? 0.25 * (1 - high) : 1);
    follow(sea.gain.gain, SEA_LEVEL * seaNear * (0.4 + 0.6 * shaped), now, 0.2);
    // Heard less in the plane, whose engine and wind are most of the ear.
    const rainHeard = wet * (flying ? 0.35 : 1);
    follow(rain.hiss.gain, RAIN_LEVEL * rainHeard * (0.6 + 0.4 * gust), now, 0.6);
    follow(rain.drum.gain, RAIN_LEVEL * 0.8 * rainHeard * rainHeard, now, 0.6);
    follow(sea.foam.gain, SEA_LEVEL * 0.18 * seaNear * shaped * shaped, now, 0.15);

    // One loop for every motor on the ground and the water: the launch's outboard,
    // and a car's engine, which is the same square an octave under a sawtooth
    // pitched up and let through a wider filter; a diesel and a single are the same
    // again, lower and closed or higher and open.
    const voice = MOTORS[state.mode];
    const motor = voice === undefined ? 0 : voice.level * (0.32 + 0.68 * throttle);
    follow(boat.gain.gain, motor, now);
    const putt = voice === undefined ? 30 : voice.putt + voice.rise * throttle;
    follow(boat.low.frequency, putt, now);
    follow(boat.high.frequency, putt * 2, now);
    follow(boat.filter.frequency, voice === undefined ? 220 : voice.filter + voice.open * throttle, now);

    // The rotor, whenever somebody is at a helicopter's controls or in it.
    const chopping = state.mode === 'helicopter';
    follow(rotor.gain.gain, chopping ? ROTOR_LEVEL * (0.6 + 0.4 * throttle) : 0, now);
    follow(rotor.chop.frequency, 10 + 3 * throttle, now, 0.8);

    // The saucer's hum, whenever somebody is at its controls.
    if (saucer !== null) {
      const humming = state.mode === 'saucer';
      follow(saucer.gain.gain, humming ? SAUCER_LEVEL * (0.55 + 0.45 * throttle) : 0, now, 0.4);
      const pitch = 96 + 150 * throttle;
      follow(saucer.low.frequency, pitch, now, 0.5);
      follow(saucer.high.frequency, pitch * 1.5 * 1.006, now, 0.5);
      follow(saucer.warble.frequency, 3.5 + 6 * throttle, now, 0.5);
      follow(saucer.depth.gain, pitch * (0.025 + 0.03 * throttle), now, 0.5);
      follow(saucer.filter.frequency, 700 + 1400 * throttle, now, 0.5);
    }

    // A bicycle's freewheel ticks as it coasts, faster the faster it goes;
    // pedalled, the pawl is carried round and says nothing.
    if (state.mode === 'bicycle' && state.speed > 2 && throttle < 0.05) {
      nextTick -= dt;
      if (nextTick <= 0) {
        tick(ctx, nature, now + 0.01, TICK_LEVEL);
        nextTick = 1 / Math.min(30, state.speed * 0.9);
      }
    }
    // A horse's hooves: the walk's four-beat, the gallop's three and a
    // pause, on the recorded footfalls played low and slow.
    if (state.mode === 'horse' && state.speed > 0.5) {
      nextHoof -= dt;
      if (nextHoof <= 0) {
        const galloping = state.speed > 10;
        const beat = galloping ? hoof % 4 : 0;
        const count = VARIANTS.dirt;
        play(`step-dirt-${Math.floor(Math.random() * count)}`, HOOF_LEVEL * (beat === 3 ? 0 : 1), between(0.62, 0.72));
        hoof++;
        const cycle = galloping ? Math.max(0.36, 9 / state.speed) : Math.max(0.5, 4.5 / state.speed);
        nextHoof = cycle / 4;
      }
    }

    const engine = flying ? PLANE_LEVEL * (0.45 + 0.55 * throttle) : 0;
    follow(plane.gain.gain, engine, now);
    const hum = 68 + 70 * throttle;
    follow(plane.a.frequency, hum, now, 0.6);
    follow(plane.b.frequency, hum * 1.012, now, 0.6);
    follow(plane.filter.frequency, 500 + 1300 * throttle, now, 0.6);

    // Birds by day and crickets by night, on foot in open country only: from
    // the plane or on a town's paving they would be a decoration.
    // And not in the rain, which is when birds shelter.
    const alive = walking && !state.cold ? clamp01(state.wild) * (1 - wet) : 0;
    follow(nature.gain, alive, now, 0.8);
    if (alive > 0.05) {
      nextBirds -= dt;
      if (nextBirds <= 0) {
        if (state.daylight > 0.45) birds(ctx, nature, now + 0.05);
        nextBirds = between(3, 11);
      }
      nextCricket -= dt;
      if (nextCricket <= 0) {
        if (state.daylight < 0.2) cricket(ctx, nature, now + 0.02);
        nextCricket = between(0.25, 0.9);
      }
    }
  }

  return { update };
}
