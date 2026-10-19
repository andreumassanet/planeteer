/**
 * The trains: one per line, placed every frame from the sky's clock
 * (`trainAt`), each car one of the Train Kit's baked models stood on the rail
 * head. Cars are pooled by model and only the nearest `MAX_TRAINS` run.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import type { Model } from '../models.ts';
import { paintModel } from '../models.ts';
import { carFrame, emptyCarFrame, railHeadAt } from '../rails/ride.ts';
import { CAR_GAP, CAR_PITCH, CAR_WIDTH, consistOf, phaseOf, TRAIN_SPEED, trainAt } from '../rails/trains.ts';
import type { RailNetwork } from '../rails/network.ts';
import type { TrainState } from '../rails/trains.ts';
import type { PassingSource } from '../passing-sound.ts';
import { MAX_TRAINS } from './constants.ts';
import type { Crossing } from './crossings.ts';

export interface Car {
  holder: THREE.Group;
  /** The baked model under the holder: hidden while the eye is inside its carriage. */
  body: THREE.Mesh;
  model: string;
  half: number;
  height: number;
}

export interface Train {
  line: number;
  cars: Car[];
  state: TrainState;
  seen: number;
  /** The crossings this train has sounded its horn for on its current run. */
  sounded: Set<number>;
  direction: number;
}

export interface TrainStats {
  trains: number;
  cars: number;
  nearestMoving: number;
}

export interface TrainSource {
  group: THREE.Group;
  network: RailNetwork;
  places: readonly Place[];
  material: THREE.Material;
  kit: ReadonlyMap<string, Model>;
  crossings(line: number): Crossing[];
  stats: TrainStats;
}

export interface TrainRunner {
  readonly trains: ReadonlyMap<number, Train>;
  /** The nearest moving train this frame, for the ear, or null. */
  readonly passing: PassingSource | null;
  /** Places the trains on `lines` within `reach` of `eye` at `seconds` of the sky's clock. */
  run(seconds: number, reach: number, lines: readonly number[], eye: THREE.Vector3, player: THREE.Vector3, onHorn: ((near: number) => void) | null): void;
  /** Swaps in the kit's models; every running train is returned to the pool. */
  setKit(kit: ReadonlyMap<string, Model>): void;
}

export function createTrainRunner(source: TrainSource): TrainRunner {
  const { group, network, places, stats } = source;
  let kit = source.kit;
  const trains = new Map<number, Train>();
  const consists = new Map<number, { cars: string[] }>();
  const carPool = new Map<string, Car[]>();
  const carPoint = new THREE.Vector3();
  const carAhead = new THREE.Vector3();
  const carBehind = new THREE.Vector3();
  const hornAt = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const frame = emptyCarFrame();
  const by = new THREE.Vector3();
  const bz = new THREE.Vector3();
  const passingOut: PassingSource = { distance: 0, closing: 0, effort: 0 };
  let passing: PassingSource | null = null;
  const probeState: TrainState = { head: 0, direction: 1, speed: 0, standing: true };

  const consistFor = (line: number): { cars: string[] } => {
    let known = consists.get(line);
    if (known === undefined) consists.set(line, (known = consistOf(network.lines[line]!, places, network.path(line).length)));
    return known;
  };

  /** A car: its model scaled to the traffic's section and one pitch, under a holder the pose moves. */
  function buildCar(id: string): Car | null {
    const model = kit.get(id);
    if (model === undefined) return null;
    const size = model.box.getSize(new THREE.Vector3());
    const mesh = new THREE.Mesh(paintModel(model), source.material);
    const across = CAR_WIDTH / Math.max(0.1, size.x);
    const along = (CAR_PITCH - CAR_GAP) / Math.max(0.1, size.z);
    // Three composes T * R * S: the scale is on the mesh in the model's own
    // axes, the rotation on the holder.
    mesh.scale.set(across, across, along);
    mesh.position.set(-((model.box.min.x + model.box.max.x) / 2) * across, -model.box.min.y * across, -((model.box.min.z + model.box.max.z) / 2) * along);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const holder = new THREE.Group();
    holder.add(mesh);
    return { holder, body: mesh, model: id, half: (CAR_PITCH - CAR_GAP) / 2, height: size.y * across };
  }
  function takeCar(id: string): Car | null {
    const free = carPool.get(id);
    const car = free?.pop() ?? buildCar(id);
    if (car !== null) {
      car.holder.visible = true;
      if (car.holder.parent !== group) group.add(car.holder);
    }
    return car;
  }
  function giveCar(car: Car): void {
    car.holder.visible = false;
    let free = carPool.get(car.model);
    if (free === undefined) carPool.set(car.model, (free = []));
    free.push(car);
  }

  /** A point `s` along a line at the rail head, over the planet's centre. */
  const railHead = (line: number, s: number, out: THREE.Vector3): THREE.Vector3 => railHeadAt(network, line, s, out);

  /** The lines whose train is near enough to draw, nearest first, capped at `MAX_TRAINS`. */
  function nearestTrains(seconds: number, reach: number, lines: readonly number[], eye: THREE.Vector3): Set<number> {
    const want: { line: number; distance: number }[] = [];
    for (const line of lines) {
      const path = network.path(line);
      const consist = consistFor(line);
      const state = trainAt(path.length, consist.cars.length, phaseOf(network.lines[line]!), seconds, probeState);
      const middle = state.head - (state.direction * consist.cars.length * CAR_PITCH) / 2;
      const distance = railHead(line, middle, carPoint).distanceTo(eye);
      if (distance < reach) want.push({ line, distance });
    }
    want.sort((a, b) => a.distance - b.distance);
    return new Set(want.slice(0, MAX_TRAINS).map((w) => w.line));
  }

  /** A train for `line`, taking its cars from the pool, or null if a model is missing. */
  function trainFor(line: number): Train | null {
    let train = trains.get(line);
    if (train !== undefined) return train;
    const consist = consistFor(line);
    const cars: Car[] = [];
    for (const id of consist.cars) {
      const car = takeCar(id);
      if (car !== null) cars.push(car);
    }
    if (cars.length !== consist.cars.length) {
      for (const car of cars) giveCar(car);
      return null;
    }
    train = { line, cars, state: { head: 0, direction: 1, speed: 0, standing: true }, seen: 0, sounded: new Set(), direction: 0 };
    trains.set(line, train);
    return train;
  }

  /** Poses every car of a train along its line (`carFrame`): in their order from A, the cab at A's end facing A. */
  function poseCars(line: number, train: Train, state: TrainState): void {
    train.cars.forEach((car, k) => {
      carFrame(network, line, state, train.cars.length, k, frame);
      basis.makeBasis(frame.x, frame.y, frame.z);
      car.holder.position.copy(frame.position);
      car.holder.quaternion.setFromRotationMatrix(basis);
    });
  }

  /** Sounds the horn once a run as the train comes up on each crossing. */
  function soundHorn(line: number, train: Train, state: TrainState, eye: THREE.Vector3, onHorn: (near: number) => void): void {
    for (const [k, crossing] of source.crossings(line).entries()) {
      const before = (crossing.s - state.head) * state.direction;
      // A crossing behind the train may sound again if the clock is scrubbed back.
      if (before < 0) train.sounded.delete(k);
      else if (before > 0 && before < 90 && !train.sounded.has(k)) {
        train.sounded.add(k);
        const near = Math.max(0, 1 - hornAt.copy(crossing.point).multiplyScalar(PLANET_RADIUS).distanceTo(eye) / 700);
        if (near > 0) onHorn(near);
      }
    }
  }

  return {
    trains,
    get passing() {
      return passing;
    },
    run(seconds, reach, lines, eye, player, onHorn) {
      const keep = nearestTrains(seconds, reach, lines, eye);
      for (const [line, train] of trains) {
        if (keep.has(line)) continue;
        for (const car of train.cars) giveCar(car);
        trains.delete(line);
      }
      passing = null;
      let nearest = Infinity;
      stats.nearestMoving = Infinity;
      for (const line of keep) {
        const path = network.path(line);
        const train = trainFor(line);
        if (train === null) continue;
        const state = trainAt(path.length, train.cars.length, phaseOf(network.lines[line]!), seconds, train.state);
        if (state.direction !== train.direction) {
          train.sounded.clear();
          train.direction = state.direction;
        }
        poseCars(line, train, state);
        // The ear: the leading car of the nearest moving train, and how fast it closes.
        const head = railHead(line, state.head, carAhead);
        const distance = head.distanceTo(eye);
        if (!state.standing) stats.nearestMoving = Math.min(stats.nearestMoving, head.distanceTo(player) - train.cars.length * CAR_PITCH);
        if (distance < nearest && !state.standing) {
          nearest = distance;
          const behind = railHead(line, state.head - state.direction * 2, carBehind);
          bz.subVectors(head, behind).normalize();
          by.subVectors(eye, head).normalize();
          passingOut.distance = distance;
          passingOut.closing = bz.dot(by) * state.speed;
          passingOut.effort = state.speed / TRAIN_SPEED;
          passing = passingOut;
        }
        if (!state.standing && onHorn !== null) soundHorn(line, train, state, eye, onHorn);
      }
      stats.trains = trains.size;
      stats.cars = [...trains.values()].reduce((n, train) => n + train.cars.length, 0);
    },
    setKit(models) {
      kit = models;
      for (const [line, train] of trains) {
        for (const car of train.cars) giveCar(car);
        trains.delete(line);
      }
    },
  };
}
