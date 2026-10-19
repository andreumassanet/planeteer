/**
 * The railway, drawn and run: the track laid near the eye, the stations, the
 * level crossings and the trains.
 *
 * The track is a ribbon on each line's course (`rails.ts`), streamed round
 * the camera in chunks (`railway/bed.ts`). Stations and trains are inked,
 * solid things; trains are placed from the clock (`trainAt`), so nothing here
 * integrates.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS } from './globe.ts';
import type { Place } from './places.ts';
import type { Model } from './models.ts';
import { coursePoint } from './roads/course.ts';
import { parameterAt } from './roads/path.ts';
import type { Road } from './roads/types.ts';
import { frameOpenFor } from './view.ts';
import { crownAt } from './rails/crown.ts';
import { HALL_DEPTH, PLATFORM_FROM, PLATFORM_INNER, PLATFORM_LENGTH, PLATFORM_WIDTH } from './rails/line.ts';
import { emptyStation, lineStation, stationPoint } from './rails/stations.ts';
import type { RailNetwork } from './rails/network.ts';
import type { PassingSource } from './passing-sound.ts';
import type { Bench } from './bench.ts';
import {
  BUILDS_PER_FRAME, CHUNK, DETAIL_REACH, DRAW_REACH, RESCAN_MOVE, RESCAN_S, STATION_REACH, TRAIN_REACH,
} from './railway/constants.ts';
import { createCrossingFinder } from './railway/crossings.ts';
import { crossingProps } from './railway/crossing-props.ts';
import type { CrossingLamp } from './railway/crossing-props.ts';
import { buildBed, createBedMaterial } from './railway/bed.ts';
import type { BedSource } from './railway/bed.ts';
import { createStationBuilder } from './railway/station.ts';
import { createTrainRunner } from './railway/trains.ts';
import type { Car } from './railway/trains.ts';
import { bedHeightAt, collideRailway, platformAt, platformPoint, stationBenchesNear } from './railway/contact.ts';
import type { DrawnStation, PlatformHit } from './railway/contact.ts';
import { buildCarriage } from './railway/carriage.ts';
import type { Carriage } from './railway/carriage.ts';
import { consistOf } from './rails/trains.ts';
import type { ConsistKind } from './rails/trains.ts';
import { CARRIAGE, insideCarriage, passengerOn } from './rails/ride.ts';
import { createCrossingLamps } from './railway/lamps.ts';
import { disposeGroup, standAt } from './railway/stand.ts';

export { BED_COLOURS } from './railway/constants.ts';
export type { PlatformHit } from './railway/contact.ts';

/** Who rides a train: the line, the car (counted from terminus A's end) and the seat (`rails/ride.ts`). */
export interface RailRider {
  line: number;
  car: number;
  seat: number;
}

/** A seated townsperson for a carriage, as `Folk.seated` makes one, of the region of `place`; null until the cast has loaded. */
export type RailSitter = (key: string, place: Place) => THREE.Object3D | null;

export interface RailwayFrame {
  dt: number;
  seconds: number;
  camera: THREE.Camera;
  player: THREE.Vector3;
  fogFar: number;
}

export interface Railway {
  readonly group: THREE.Group;
  update(frame: RailwayFrame): void;
  /** How high the ballast or a platform stands here, as a radius, or 0 off them. */
  bedHeightAt(point: THREE.Vector3): number;
  /** The trains' cars and the station halls as walls: true if a body of `radius` at `point` overlaps one, and `push` the way out. */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** The standing stations' benches whose sitter's spot is inside `radius` of `point`, pushed onto `out`. */
  benchesNear(point: THREE.Vector3, radius: number, out: Bench[]): void;
  /** Every drawn car, as a point and a radius, for what the road traffic stops for. */
  eachCar(visit: (point: THREE.Vector3, radius: number, moving: boolean) => void): void;
  /** The nearest train this frame, for the ear, or null. */
  readonly passing: PassingSource | null;
  /** Told when a train sounds its horn at a crossing, with how near it is: 1 beside it. */
  onHorn: ((near: number) => void) | null;
  /** The Train Kit's models, once they arrive: until then the track and the stations stand and no train runs. */
  setKit(kit: ReadonlyMap<string, Model>): void;
  /** Whether the trains run: the kit has arrived. */
  readonly running: boolean;
  /** Which train a line runs and its cars, front to back from terminus A: pure in the line. */
  consist(line: number): { kind: ConsistKind; cars: readonly string[] };
  /** The standing station whose platform `point` is on, within `margin` of its edges, or null. */
  platformAt(point: THREE.Vector3, margin?: number): PlatformHit | null;
  /** A point of a platform's deck, `x` out from the track and `z` along it. */
  platformPoint(hit: PlatformHit, x: number, z: number, out: THREE.Vector3): THREE.Vector3;
  /** The car the player rides, whose carriage is drawn inside it while the eye is in it; null for none. */
  setRider(rider: RailRider | null): void;
  /** Who sits in a carriage beside the player. */
  setSitter(sitter: RailSitter | null): void;
  /** Whether the eye was inside the ridden carriage last frame. */
  readonly eyeInside: boolean;
  enabled: boolean;
  readonly stats: { lines: number; chunks: number; stations: number; trains: number; cars: number; nearestMoving: number; ms: number };
}

export interface RailwayOptions {
  world: World;
  places: readonly Place[];
  roads: readonly Road[];
  network: RailNetwork;
  /** The Train Kit's baked models, by id, or empty until they arrive (`setKit`). */
  kit?: ReadonlyMap<string, Model>;
  /** The material the kit's models are drawn with (`modelMaterial`). */
  material: THREE.Material;
  /**
   * The drawn land's radius under a point (`drawnRadius`). The bed's shoulders
   * and a station's slabs reach down to the lower of it and the relief. The
   * relief alone when absent.
   */
  drawnGround?: (point: THREE.Vector3) => number;
}

interface Chunk {
  key: string;
  line: number;
  index: number;
  near: boolean;
  bed: THREE.Mesh;
  props: THREE.Group | null;
  seen: number;
}


export function createRailway(options: RailwayOptions): Railway {
  const { world, places, roads, network } = options;
  const group = new THREE.Group();
  group.name = 'railway';
  const crossings = createCrossingFinder(network, roads, places);
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const lampPoints: CrossingLamp[] = [];

  /** The ground's radius at a direction: the lower of the relief and the drawn land. */
  const drawnGround = options.drawnGround;
  const groundAt = (direction: THREE.Vector3): number => {
    const relief = PLANET_RADIUS + world.elevationAt(direction);
    if (drawnGround === undefined) return relief;
    // Over the water the probe answers the sea's radius: use the relief there.
    const drawn = drawnGround(direction);
    return drawn > PLANET_RADIUS + 0.5 ? Math.min(relief, drawn) : relief;
  };

  const bedSource: BedSource = {
    network,
    material: createBedMaterial(),
    crossings,
    groundAt,
    crossingProps: (line, here) => crossingProps(network, line, here, lampPoints),
  };
  const buildStation = createStationBuilder(continentOf);

  const stats = { lines: network.lines.length, chunks: 0, stations: 0, trains: 0, cars: 0, nearestMoving: Infinity, ms: 0 };
  let kitReady = (options.kit?.size ?? 0) > 0;
  const platformHit = { station: null as unknown as DrawnStation, line: 0, end: 0 as 0 | 1, x: 0, z: 0 };
  const runner = createTrainRunner({ group, network, places, material: options.material, kit: options.kit ?? new Map(), crossings, stats });

  const chunks = new Map<string, Chunk>();
  const stations = new Map<string, DrawnStation>();
  const lineHits: number[] = [];
  let wanted: { line: number; index: number; near: boolean; distance: number }[] = [];
  const eye = new THREE.Vector3();
  const player = new THREE.Vector3();
  const eyeDir = new THREE.Vector3();
  const scanFrom = new THREE.Vector3(Infinity, 0, 0);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  /** Wall seconds since the last scan. */
  let sinceScan = Infinity;
  let scanCount = 0;
  let nearLines: number[] = [];
  const frame0 = emptyStation();

  /** Keeps or builds a line's station at `end` if it is within reach of the eye. */
  function wantStation(line: number, end: 0 | 1, reach: number): void {
    const key = `${line}:${end}`;
    lineStation(network.lines[line]!, end, places, frame0);
    const crown = network.crown(line);
    const level = end === 0 ? crown.levelA : crown.levelB;
    const distance = frame0.at.clone().multiplyScalar(level).distanceTo(eye);
    const known = stations.get(key);
    if (distance > Math.min(STATION_REACH, reach)) return;
    if (known !== undefined) {
      known.seen = scanCount;
      return;
    }
    // The floor sits at the station's level; its slabs reach down to the lowest ground under it.
    const frame = lineStation(network.lines[line]!, end, places, emptyStation());
    let lowest = level;
    for (let z = -8; z <= PLATFORM_FROM + PLATFORM_LENGTH + 4; z += 10) {
      for (const xs of [PLATFORM_INNER, PLATFORM_INNER + PLATFORM_WIDTH + HALL_DEPTH]) lowest = Math.min(lowest, groundAt(stationPoint(frame, xs, z, q)));
    }
    const drop = Math.max(1, level - lowest + 1);
    // The model's +X is `up x out` and the platform's side is `side`: they agree when the hand is -1.
    const built = buildStation(frame.hand > 0 ? -1 : 1, drop, places[end === 0 ? network.lines[line]!.a : network.lines[line]!.b]!, key);
    standAt(built, frame.at, level, frame.out);
    group.add(built);
    stations.set(key, { key, group: built, frame, level, seen: scanCount });
  }

  /** Works out the chunks and stations wanted near the eye, and drops stations out of reach. */
  function scan(fogFar: number): void {
    scanCount++;
    eyeDir.copy(eye).normalize();
    const reach = Math.min(DRAW_REACH, fogFar * 1.05);
    nearLines = [...network.near(eyeDir, reach, lineHits)];
    wanted = [];
    for (const line of nearLines) {
      const path = network.path(line);
      const count = Math.ceil(path.length / CHUNK);
      for (let index = 0; index < count; index++) {
        const s = Math.min(path.length, (index + 0.5) * CHUNK);
        coursePoint(network.course(line), parameterAt(path, s), p);
        const distance = p.multiplyScalar(crownAt(network.crown(line), s)).distanceTo(eye) - CHUNK / 2;
        if (distance > reach) continue;
        wanted.push({ line, index, near: distance < DETAIL_REACH, distance });
      }
      for (const end of [0, 1] as const) wantStation(line, end, reach);
    }
    wanted.sort((a, b) => a.distance - b.distance);
    for (const [key, station] of stations) {
      if (station.seen === scanCount) continue;
      group.remove(station.group);
      disposeGroup(station.group);
      stations.delete(key);
    }
  }

  /** Builds wanted chunks within the frame's allowance and drops the rest once their replacement stands. */
  function serveChunks(): void {
    const want = new Set<string>();
    let built = 0;
    for (const w of wanted) {
      const key = `${w.line}:${w.index}:${w.near ? 1 : 0}`;
      want.add(key);
      const known = chunks.get(key);
      if (known !== undefined) {
        known.seen = scanCount;
        continue;
      }
      if (built >= BUILDS_PER_FRAME || !frameOpenFor(built, w.distance < 600, 'railway')) continue;
      const { bed, props } = buildBed(bedSource, w.line, w.index, w.near);
      group.add(bed);
      if (props !== null) group.add(props);
      chunks.set(key, { key, line: w.line, index: w.index, near: w.near, bed, props, seen: scanCount });
      built++;
    }
    for (const [key, chunk] of chunks) {
      if (want.has(key)) continue;
      const other = `${chunk.line}:${chunk.index}:${chunk.near ? 0 : 1}`;
      if (want.has(other) && !chunks.has(other)) continue;
      group.remove(chunk.bed);
      chunk.bed.geometry.dispose();
      if (chunk.props !== null) {
        group.remove(chunk.props);
        disposeGroup(chunk.props);
        for (let i = lampPoints.length - 1; i >= 0; i--) {
          const lamp = lampPoints[i]!;
          if (lamp.line === chunk.line && lamp.s >= chunk.index * CHUNK && lamp.s < (chunk.index + 1) * CHUNK) lampPoints.splice(i, 1);
        }
      }
      chunks.delete(key);
    }
  }

  // The ridden carriage: built on the car's holder while someone rides it.
  let rider: RailRider | null = null;
  let sitter: RailSitter | null = null;
  let carriage: Carriage | null = null;
  let carriageOn: Car | null = null;
  let eyeInside = false;
  const eyeLocal = new THREE.Vector3();
  const consists = new Map<number, { kind: ConsistKind; cars: string[] }>();
  const consistFor = (line: number): { kind: ConsistKind; cars: string[] } => {
    let known = consists.get(line);
    if (known === undefined) consists.set(line, (known = consistOf(network.lines[line]!, places, network.path(line).length)));
    return known;
  };

  function dropCarriage(): void {
    if (carriage !== null) carriage.dispose();
    if (carriageOn !== null) carriageOn.body.visible = true;
    carriage = null;
    carriageOn = null;
    eyeInside = false;
  }

  /** The ridden car's inside, drawn in place of its shell while the eye is in it. */
  function serveCarriage(): void {
    const car = rider === null ? undefined : runner.trains.get(rider.line)?.cars[rider.car];
    if (rider === null || car === undefined) {
      dropCarriage();
      return;
    }
    if (carriageOn !== car) {
      dropCarriage();
      const ride = rider;
      const line = network.lines[ride.line]!;
      const home = places[line.a]!;
      const roll = ((line.a * 31 + line.b * 17) % 97) / 97;
      // A shell lower than the carriage's own height gets a carriage of its own height.
      const height = Math.min(CARRIAGE.height, car.height * 0.86 - CARRIAGE.floor);
      carriage = buildCarriage(height, roll, (seat) =>
        seat !== ride.seat && passengerOn(ride.line, ride.car, seat) && sitter !== null ? sitter(`rail|${ride.line}|${ride.car}|${seat}`, home) : null,
      );
      car.holder.add(carriage.group);
      carriageOn = car;
    }
    car.holder.updateMatrixWorld(true);
    eyeLocal.copy(eye);
    car.holder.worldToLocal(eyeLocal);
    eyeInside = insideCarriage(eyeLocal, carriage!.height);
    carriage!.group.visible = eyeInside;
    car.body.visible = !eyeInside;
  }

  const lamps = createCrossingLamps();
  group.add(lamps.points);

  const railway: Railway = {
    group,
    enabled: true,
    onHorn: null,
    get passing() {
      return runner.passing;
    },
    stats,
    update(frame) {
      const began = performance.now();
      group.visible = railway.enabled;
      if (!railway.enabled) return;
      frame.camera.getWorldPosition(eye);
      player.copy(frame.player);
      sinceScan += frame.dt;
      if (sinceScan > RESCAN_S || scanFrom.distanceTo(eye) > RESCAN_MOVE) {
        sinceScan = 0;
        scanFrom.copy(eye);
        scan(frame.fogFar);
      }
      serveChunks();
      runner.run(frame.seconds, Math.min(TRAIN_REACH, frame.fogFar * 1.05), nearLines, eye, player, railway.onHorn);
      serveCarriage();
      lamps.light(frame.seconds, lampPoints, runner.trains);
      stats.chunks = chunks.size;
      stats.stations = stations.size;
      stats.ms = stats.ms * 0.9 + (performance.now() - began) * 0.1;
    },
    bedHeightAt: (point) => bedHeightAt(network, stations.values(), point),
    collide: (point, radius, push) => collideRailway(runner.trains.values(), stations.values(), point, radius, push),
    benchesNear: (point, radius, out) => stationBenchesNear(stations.values(), point, radius, out),
    setKit(models) {
      dropCarriage();
      runner.setKit(models);
      kitReady = models.size > 0;
    },
    get running() {
      return kitReady;
    },
    consist: consistFor,
    platformAt: (point, margin = 0.5) => platformAt(stations.values(), point, margin, platformHit),
    platformPoint: (hit, x, z, out) => platformPoint(hit.station, x, z, out),
    setRider(next) {
      if (next?.line !== rider?.line || next?.car !== rider?.car || next?.seat !== rider?.seat) dropCarriage();
      rider = next === null ? null : { ...next };
    },
    setSitter(next) {
      sitter = next;
    },
    get eyeInside() {
      return eyeInside;
    },
    eachCar(visit) {
      for (const train of runner.trains.values()) {
        for (const car of train.cars) visit(car.holder.position, car.half, !train.state.standing);
      }
    },
  };
  return railway;
}
