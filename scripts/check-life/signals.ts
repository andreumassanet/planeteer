import { radiusOf } from '../../src/places.ts';
import { gatesOf, mainStreetHalf, townGrid } from '../../src/scenery/grid.ts';
import {
  AMBER, GREEN, RED, SIGNAL_CYCLE, cycleAt, mayWalk, signalLeft, signalLight, signalPace, signalStopOf, stopLineOf,
} from '../../src/signals.ts';
import type { SignalAxis } from '../../src/signals.ts';
import { type StreetPose, driveThrough, streetCost, streetPose } from '../../src/through.ts';
import { check, places, roads } from './setup.ts';

// --- the traffic lights ----------------------------------------------------
//
// A city's lights are a pure function of the clock and the town (`signals.ts`):
// asked twice they answer the same, the two streets never have right of way
// together, a zebra is walked only while the traffic across it is held at red,
// and a car driven through the crossing by `signalPace` never puts its front
// over the stop line while its light is red.

console.log('the traffic lights:');
{
  let disagree = 0;
  let together = 0;
  let walkOnGo = 0;
  let badLeft = 0;
  const seen = [0, 0, 0];
  for (let town = 0; town < 400; town++) {
    for (let t = 0; t < SIGNAL_CYCLE * 2; t += 0.37) {
      const clock = 1.7e9 + town * 13.1 + t;
      const a = signalLight(town, clock, 0);
      const b = signalLight(town, clock, 1);
      const later = cycleAt(town, clock + SIGNAL_CYCLE * 1000);
      if (a !== signalLight(town, clock, 0) || Math.min(Math.abs(cycleAt(town, clock) - later), SIGNAL_CYCLE - Math.abs(cycleAt(town, clock) - later)) > 1e-3) disagree++;
      if (a !== RED && b !== RED) together++;
      seen[a]!++;
      for (const axis of [0, 1] as SignalAxis[]) {
        if (mayWalk(town, clock, axis) && signalLight(town, clock, axis) !== RED) walkOnGo++;
        const left = signalLeft(town, clock, axis);
        const now = signalLight(town, clock, axis);
        if (!(left > 0 && left <= SIGNAL_CYCLE) || signalLight(town, clock + left - 0.01, axis) !== now) badLeft++;
      }
    }
  }
  check(disagree === 0, 'the same town and clock show the same light, cycle after cycle', `${disagree} disagreements`);
  check(seen[GREEN]! > 0 && seen[AMBER]! > 0 && seen[RED]! > 0, 'green, amber and red all come round', seen.join(' / '));
  check(together === 0, 'the two streets never both have right of way', `${together} instants`);
  check(walkOnGo === 0, 'a zebra is walked only while the traffic across it is at red', `${walkOnGo} instants`);
  check(badLeft === 0, "a light's time left runs out where it changes", `${badLeft} wrong`);

  // Driven: every drive through a sample of squares, at a road car's route
  // speed, frames of 1/60 to 1/10 of a second, over several cycles.
  const pose: StreetPose = { x: 0, z: 0, fx: 0, fz: 1, mx: 0, mz: 1 };
  const LANE = 7.2 * 0.26;
  const HALF_LENGTH = 2.2;
  let drives = 0;
  let stops = 0;
  let held = 0;
  let crossedRed = 0;
  let stuck = 0;
  let worstStop = 0;
  const radii = new Set<number>();
  for (let i = 0; i < roads.length && radii.size < 30; i += 97) {
    const radius = radiusOf(places[roads[i]!.a]!);
    if (radii.has(radius)) continue;
    radii.add(radius);
    const grid = townGrid(radius);
    if (grid.cells % 2 === 0 || grid.cells < 3) continue;
    const gates = gatesOf(grid);
    const half = mainStreetHalf(grid, 9.75);
    const line = stopLineOf(grid);
    for (let from = 0; from < gates.length; from++) {
      for (let to = 0; to < gates.length; to++) {
        const legs = driveThrough(grid, gates, from, to, half, LANE, 1);
        if (legs === null) continue;
        drives++;
        const cost = streetCost(legs);
        for (const back of from === to ? [false] : [false, true]) {
          const stop = signalStopOf(legs, back, HALF_LENGTH, line);
          if (stop === null) continue;
          stops++;
          // The front on the line at the stop found.
          streetPose(legs, stop.q, back, pose);
          worstStop = Math.max(worstStop, Math.abs(Math.max(Math.abs(pose.x + pose.mx * HALF_LENGTH), Math.abs(pose.z + pose.mz * HALF_LENGTH)) - line));
          for (let run = 0; run < 6; run++) {
            const town = run * 31 + from * 7 + to;
            const speed = 28 + run * 4;
            let clock = 1.7e9 + run * 11.3;
            let q = 0;
            let pace = 1;
            let steps = 0;
            while (q < cost && steps < 20000) {
              const step = 1 / 60 + ((steps * 7919) % 100) / 100 * (1 / 10 - 1 / 60);
              const light = signalLight(town, clock, stop.axis);
              const left = signalLeft(town, clock, stop.axis);
              const hold = q <= stop.q ? stop.q - q : -1;
              const target = Math.min(1, signalPace(hold, light, left, pace, speed, step));
              if (target < 0.1 && light !== GREEN) held++;
              pace = target < pace ? target : Math.min(target, pace + (8 * step) / speed);
              const next = q + speed * pace * step;
              clock += step;
              // Over the line during this step, at a red seen at its end.
              if (q <= stop.q && next > stop.q + 1e-6 && signalLight(town, clock, stop.axis) === RED && light === RED) crossedRed++;
              q = next;
              steps++;
            }
            if (q < cost) stuck++;
          }
        }
      }
    }
  }
  check(drives > 0 && stops > 0, 'drives through a city meet its stop lines', `${drives} drives, ${stops} approaches`);
  check(worstStop < 0.01, "a stop is found with the vehicle's front on its line", `worst ${worstStop.toFixed(4)} units off`);
  check(held > 0, 'and the traffic is held there at red', `${held} frames held`);
  check(crossedRed === 0, 'a car never puts its front over a red line', `${crossedRed} crossings`);
  check(stuck === 0, 'and every car held there gets through in the end', `${stuck} stuck`);
}
