/**
 * Riding the railway: on a platform `E` boards the train standing there, or
 * waits for the next one (the prompt is the platform's board: where it goes
 * and how long until it comes); aboard, the traveller sits on a carriage seat
 * that the train carries, and `E` at a stop gets off onto that platform.
 *
 * The train is the timetable's (`trainAt`), so a rider is placed every frame
 * from the same clock and the same pure functions the railway draws the car
 * with (`carFrame`, `seatRoot`), and the trains are drawn at the rider's clock
 * while there is one (`clock`). On the wire a rider is a traveller sitting
 * (the bench's `sit`) whose pose moves: nothing new is sent.
 */
import * as THREE from 'three';
import type { Bench } from '../bench.ts';
import { PLATFORM_FROM, PLATFORM_INNER, PLATFORM_LENGTH } from '../rails/line.ts';
import { CAR_BODY, carFrame, carMiddle, carriagesOf, emptyCarFrame, inCar, passengerOn, seatRoot, SEATS_PER_CAR } from '../rails/ride.ts';
import { emptyStation, lineStation, stationPoint } from '../rails/stations.ts';
import { CAR_WIDTH, callAt, phaseOf, trainAt } from '../rails/trains.ts';
import type { Call, TrainState } from '../rails/trains.ts';
import { regionFor } from '../scenery/regions.ts';
import { SEAT_SHIN, SEAT_THIGH } from '../avatar.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import type { CameraSubject } from '../camera/types.ts';
import type { IconName } from '../ui.ts';
import type { App } from './context.ts';

/** How far past a platform's edges a traveller still counts as on it. */
const PLATFORM_MARGIN = 1.5;
/** Where a traveller getting off stands: this far out from the platform's edge. */
const ALIGHT_X = PLATFORM_INNER + 0.9;

export interface TrainOffer {
  label: string;
  icon: IconName;
}

export interface TrainRide {
  /** Riding a train now. */
  readonly riding: boolean;
  /** The sky's clock, in seconds, the rider and the trains are placed at while riding; null otherwise. */
  readonly clock: number | null;
  /** What the railway shows and `E` does this frame, or null; worked out by `offer`. */
  readonly prompt: TrainOffer | null;
  /** Whether `E` acts on the railway this frame (`prompt` may only inform). */
  readonly acts: boolean;
  /** `E`: board, wait, or get off. */
  use(): void;
  /** Before the player moves: a rider back on the seat at the clock `seconds`. */
  carry(seconds: number): void;
  /** What the camera chases: the traveller, framed as a train while riding. */
  subject(): CameraSubject;
  /** After the frame's movement: the platform's board, and a waiting traveller boarded when the train stands. */
  offer(seconds: number): void;
}

interface Ride {
  line: number;
  car: number;
  seat: number;
}

export function createTrainRide(app: App): TrainRide {
  const { player, railway, gestures } = app;
  const places = app.places.all;
  const network = app.railNetwork;
  let ride: Ride | null = null;
  let clock: number | null = null;
  let waiting: { line: number; end: 0 | 1 } | null = null;
  let prompt: TrainOffer | null = null;
  let acts = false;
  let action: (() => void) | null = null;
  const state: TrainState = { head: 0, direction: 1, speed: 0, standing: true };
  const call: Call = { standing: false, arrives: 0, departs: 0 };
  const frame = emptyCarFrame();
  const local = new THREE.Vector3();
  const root = new THREE.Vector3();
  const station = emptyStation();
  const spot = new THREE.Vector3();
  const continentOf = new Map<string, string>(app.world.countries.map((country) => [country.iso, country.continent]));

  // Who rides with you: the cast seated, dressed as the line's first town dresses.
  railway?.setSitter((key, place) => {
    const style = regionFor(place.iso ?? '', continentOf.get(place.iso ?? '') ?? '', place.lat);
    return app.folk.seated(key, style.id, AVATAR_HEIGHT, { thigh: SEAT_THIGH, shin: SEAT_SHIN });
  });

  const lengthOf = (line: number): number => network!.path(line).length;
  const carsOf = (line: number): number => railway!.consist(line).cars.length;
  const trainOf = (line: number, seconds: number): TrainState =>
    trainAt(lengthOf(line), carsOf(line), phaseOf(network!.lines[line]!), seconds, state);
  const callOf = (line: number, end: 0 | 1, seconds: number): Call =>
    callAt(lengthOf(line), carsOf(line), phaseOf(network!.lines[line]!), seconds, end, call);
  const townAt = (line: number, end: 0 | 1): string => {
    const l = network!.lines[line]!;
    return places[end === 0 ? l.a : l.b]!.name;
  };
  /** The terminus a standing train stands at: A at the start of its run out, B at the start of its run back. */
  const standingEnd = (s: TrainState): 0 | 1 => (s.direction > 0 ? 0 : 1);
  const clockText = (seconds: number): string => {
    const whole = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  };

  /** Where a car's middle is along a platform at `end`, as the platform's `z`. */
  const platformZ = (line: number, end: 0 | 1, s: number): number => (end === 0 ? s : lengthOf(line) - s);

  /** Sits the traveller in the standing train, in the carriage nearest along the platform and the free seat nearest them. */
  function board(line: number, end: 0 | 1, seconds: number, z: number): void {
    const consist = railway!.consist(line);
    const cars = consist.cars.length;
    const carriages = carriagesOf(consist.kind, cars);
    const s = trainOf(line, seconds);
    if (carriages.length === 0 || !s.standing || standingEnd(s) !== end) return;
    const car = carriages.reduce((best, k) =>
      Math.abs(platformZ(line, end, carMiddle(s, cars, k)) - z) < Math.abs(platformZ(line, end, carMiddle(s, cars, best)) - z) ? k : best,
    );
    carFrame(network!, line, s, cars, car, frame);
    let seat = -1;
    let nearest = Infinity;
    for (let n = 0; n < SEATS_PER_CAR; n++) {
      if (passengerOn(line, car, n)) continue;
      const d = inCar(frame, seatRoot(n, local), root).distanceTo(player.position);
      if (d < nearest) [seat, nearest] = [n, d];
    }
    if (seat < 0) return;
    inCar(frame, seatRoot(seat, local), root);
    const bench: Bench = { position: root.clone(), facing: frame.z.clone(), sink: 0, key: `rail:${line}:${car}:${seat}` };
    gestures.sitDown(bench);
    if (!player.sitting) return;
    ride = { line, car, seat };
    clock = seconds;
    waiting = null;
    railway!.setRider(ride);
    app.sound.audio.cue('ui-click');
  }

  /** Off the train onto the platform beside the carriage, facing away from the track. */
  function alight(seconds: number): void {
    if (ride === null) return;
    const { line, car } = ride;
    const s = trainOf(line, seconds);
    const end = standingEnd(s);
    const z = Math.min(PLATFORM_FROM + PLATFORM_LENGTH - 2, Math.max(PLATFORM_FROM + 2, platformZ(line, end, carMiddle(s, carsOf(line), car))));
    lineStation(network!.lines[line]!, end, places, station);
    stationPoint(station, ALIGHT_X, z, spot);
    leave();
    player.stand();
    if (player.sitOn(spot, station.side, 0)) player.stand();
    app.sound.audio.cue('ui-close');
  }

  function leave(): void {
    ride = null;
    clock = null;
    railway?.setRider(null);
  }

  /** The traveller framed as a train: the chase pulls back to a car and a half. */
  const trainFraming = { model: { kind: 'train', size: [CAR_BODY * 1.5, CAR_WIDTH, 7] as const } };
  const framed = Object.create(player, { ride: { get: () => (ride === null ? player.ride : trainFraming) } }) as CameraSubject;

  return {
    get riding() {
      return ride !== null;
    },
    get clock() {
      return clock;
    },
    get prompt() {
      return prompt;
    },
    get acts() {
      return acts;
    },
    use() {
      if (acts && action !== null) action();
    },
    carry(seconds) {
      if (ride === null) return;
      // Stood up some other way (a jump across the map, a menu): the ride is over.
      if (!player.sitting || railway === null || network === null) {
        leave();
        return;
      }
      clock = seconds;
      const s = trainOf(ride.line, seconds);
      carFrame(network, ride.line, s, carsOf(ride.line), ride.car, frame);
      player.position.copy(inCar(frame, seatRoot(ride.seat, local), root));
      player.forward.copy(frame.z);
    },
    subject: () => framed,
    offer(seconds) {
      prompt = null;
      acts = false;
      action = null;
      if (railway === null || network === null || !railway.running) return;
      if (ride !== null) {
        const s = trainOf(ride.line, seconds);
        if (s.standing) {
          const end = standingEnd(s);
          prompt = { label: `Get off at ${townAt(ride.line, end)}`, icon: 'walk' };
          acts = true;
          action = () => alight(seconds);
        } else {
          const next: 0 | 1 = s.direction > 0 ? 1 : 0;
          prompt = { label: `Next stop ${townAt(ride.line, next)} · ${clockText(callOf(ride.line, next, seconds).arrives)}`, icon: 'clock' };
        }
        return;
      }
      if (player.mode !== 'foot' || player.airborne || (player.sitting && waiting === null)) {
        waiting = null;
        return;
      }
      const hit = railway.platformAt(player.position, PLATFORM_MARGIN);
      if (hit === null) {
        waiting = null;
        return;
      }
      const { line, end, z } = hit;
      const there = townAt(line, end === 0 ? 1 : 0);
      if (carriagesOf(railway.consist(line).kind, carsOf(line)).length === 0) {
        // A goods line still answers on its platform, so it is not mistaken for a broken one.
        waiting = null;
        prompt = { label: `Goods line to ${there} · no passengers`, icon: 'clock' };
        return;
      }
      const here = callOf(line, end, seconds);
      if (waiting !== null && (waiting.line !== line || waiting.end !== end)) waiting = null;
      if (here.standing) {
        if (waiting !== null) {
          board(line, end, seconds, z);
          return;
        }
        prompt = { label: `Board the train to ${there} · leaves in ${clockText(here.departs)}`, icon: 'seat' };
        acts = true;
        action = () => board(line, end, seconds, z);
      } else if (waiting !== null) {
        prompt = { label: `Waiting · the train to ${there} comes in ${clockText(here.arrives)}`, icon: 'clock' };
        acts = true;
        action = () => (waiting = null);
      } else {
        prompt = { label: `Train to ${there} in ${clockText(here.arrives)} · wait`, icon: 'clock' };
        acts = true;
        action = () => (waiting = { line, end });
      }
    },
  };
}

