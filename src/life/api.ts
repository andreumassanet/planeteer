/** The public shapes of the life streamer: its options, its stats and its handle. */
import type * as THREE from 'three';
import type { Folk } from '../folk.ts';
import type { FieldIndex } from '../fleet.ts';
import type { Animal } from '../fauna/contract.ts';
import type { RigSource } from '../models.ts';
import type { MonumentContext } from '../monuments/contract.ts';
import type { Road } from '../roads.ts';
import type { Vehicle } from '../traffic/contract.ts';
import type { InTheWay } from './mover.ts';

export interface LifeStats {
  road: number;
  water: number;
  foot: number;
  /** Herds standing, which is also the draw calls they cost. */
  herd: number;
  /** Animals in them, which is not: a herd is one mesh however many head it has. */
  animals: number;
  /** Of those, how many are standing up as animated rigs near the player. */
  animated: number;
  /**
   * Near-herd animals by what they are doing this frame: standing, walking or
   * trotting, fleeing; and near herds walking home (`HERD_HOME_REACH`).
   */
  grazing: number;
  wandering: number;
  fleeing: number;
  homing: number;
  /** Near herds handed back to their merged buffer before every animal was home, in total. */
  snapped: number;
  /** Road vehicles drawn on a town's streets this frame, and turning round in a town or on the road (`through.ts`). */
  inTown: number;
  turning: number;
  /**
   * Road vehicles slowed by something ahead this frame, those standing, those
   * pulled out to pass, and the largest delay behind schedule in seconds.
   */
  yielding: number;
  waiting: number;
  passing: number;
  delayed: number;
  /** Road vehicles held at a city's red light this frame. */
  atLights: number;
  birds: number;
  /** Draw calls added, before `OutlineEffect` doubles them. */
  meshes: number;
  triangles: number;
  /** Pooled geometries held, and the megabytes in them. */
  pooled: number;
  megabytes: number;
  lastBuildMs: number;
  /** What the last re-derivation of the cast cost. See `RESCAN_MS`. */
  lastScanMs: number;
  /** Ground reach of the road family, which is the widest that matters on foot. */
  reach: number;
  /**
   * Distance to the nearest moving shadow caster drawn this frame (vehicle,
   * boat, walker, animated herd), or Infinity. `main.ts` redraws the shadow
   * map every frame while it is inside `SHADOW_COVER`. Merged herds do not count.
   */
  nearestMoving: number;
}

/**
 * Why the herd scan admitted what it did: a counter per gate, in the order the
 * scan applies them, so a missing herd can be traced to the gate that refused it.
 */
export interface HerdProbe {
  /**
   * Frames `update` has run. If it does not advance between two reads the loop
   * is frozen (a hidden tab in an automated browser) and the rest is stale.
   */
  frame: number;
  /** Animals handed to `createLife`. Zero means the option never arrived. */
  registry: number;
  /** The altitude the last scan was given, and the ceiling it is tested against. */
  altitude: number;
  ceiling: number;
  /** Slant range the last scan used. Zero means the family is switched off. */
  range: number;
  /** Cells `forEachCell` visited. */
  cells: number;
  /** ...that passed the cheap seeded draw. */
  chanced: number;
  /** ...that were inside the reach. */
  inRange: number;
  /** ...that were on land. */
  land: number;
  /** ...whose biome and region left at least one animal standing. */
  stocked: number;
  /** ...that passed the `cover` density draw. */
  dense: number;
  /** ...that were not inside a settlement's keep-out. */
  clearOfTown: number;
  /** ...whose ground is gentle enough to graze, over the herd's own spread. */
  clearOfSlope: number;
  /** ...that were not standing in a carriageway or inside a monument. */
  clearOfMade: number;
  /** ...that reached `consider`, and what it kept. */
  offered: number;
  admitted: number;
}

/** Where an animal of a merged herd was seated, for `pnpm seated`: direction, hooves' radius, and stance reach. */
export interface HerdSeat {
  x: number;
  y: number;
  z: number;
  radius: number;
  reach: number;
}

export interface Life {
  /** Collects where the animals of every herd built from now stand, into `into`; null stops. */
  recordSeats(into: HerdSeat[] | null): void;
  group: THREE.Group;
  stats: LifeStats;
  /** See `HerdProbe`. Rewritten by every scan. */
  herds: HerdProbe;
  /**
   * Call each frame, after the streamers. `clock` is the world's time in
   * seconds (`sky.state.time`), so traffic follows `setRate` and `setTime`.
   * `dt` is real seconds since the last call, which the near herds live by;
   * measured when left out.
   */
  update(viewer: THREE.Vector3, altitude: number, camera: THREE.Camera | undefined, clock: number, dt?: number): void;
  /**
   * Sweeps the walk cycle over every body of three regions and reports the
   * worst distance any part of a rig ends up below the floor.
   */
  verify(): { bodies: number; phases: number; worstDip: number };
  /** One mesh per program this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Object3D[];
  /**
   * Adds to `push` the ground displacement that takes a body of `radius` at
   * `point` out of every walker (`personRadius` wide) and near animal drawn
   * this frame; true if it touched one. Walkers keep to their routes; an
   * animal that is touched bolts.
   */
  collide(point: THREE.Vector3, radius: number, personRadius: number, push: THREE.Vector3): boolean;
  /** Every boat drawn by the last `update`, for `effects.ts`'s wakes. Allocates nothing. */
  eachBoat(visit: (mesh: THREE.Object3D) => void): void;
  /**
   * Every road vehicle drawn, with its half length (+Z) and half width (X),
   * its kit id, and its model's bottom below the origin: for `lights.ts`'s
   * headlights. Allocates nothing.
   */
  eachRoadVehicle(visit: (mesh: THREE.Object3D, halfLength: number, halfWidth: number, vehicle: string, bottom: number) => void): void;
  /** The near herds' animals, current and home positions, with their site: for `pnpm fauna`. Allocates. */
  grazers(): {
    key: string;
    centre: THREE.Vector3;
    right: THREE.Vector3;
    forward: THREE.Vector3;
    room: number;
    heads: { x: number; z: number; y: number; homeX: number; homeZ: number; stance: number; mode: string; world: THREE.Vector3 }[];
  }[];
  /**
   * The countryside's farms and fields (`countryside.ts`), which herds keep
   * off. Sited herds are sited again.
   */
  setCountry(country: { occupied(direction: THREE.Vector3, radius: number): boolean } | null): void;
  /** What the traffic gives way to and the herds keep off besides the movers: see `InTheWay`. */
  setInTheWay(way: InTheWay | null): void;
}

export interface LifeOptions {
  /** Share the monument context, so one material cache serves the whole world. */
  context?: MonumentContext;
  /** The baked network. Without it there is no road traffic and no walker. */
  roads?: readonly Road[];
  /**
   * The vehicle registry. Handed in because `traffic/index.ts` uses
   * `import.meta.glob`, which does not load in the headless checks.
   */
  vehicles?: readonly Vehicle[];
  /** The animal registry, handed in for the same reason as `vehicles`. */
  animals?: readonly Animal[];
  /**
   * The cast, for walkers and riders (`folk.ts`). It loads glTF, which the
   * headless checks cannot; without it a walker is the code-built crowd body
   * baked at `WALK_PHASES`.
   */
  folk?: Folk;
  /**
   * Where the animals' baked rigs come from. A herd whose rig has not arrived
   * waits for it; without a source every animal is `fauna/body.ts`'s quadruped.
   */
  rigs?: RigSource;
  /** The fields a light plane or balloon stands in (`fleet.ts`), which herds keep off. */
  fields?: FieldIndex;
  /**
   * The drawn land (`buildLand`), which herd animals stand on where the land
   * probe covers it; otherwise they stand on the relief, which can be several
   * units off what is drawn.
   */
  land?: THREE.Mesh;
  /**
   * The standing towns, for a vehicle driving through one (`through.ts`):
   * `floorAt` is a town floor's radius under a direction, or 0 off every
   * standing floor (`madeHeightAt`), and `blocked` whether a body would stand
   * in a wall. Without them a car is hidden while it crosses a town.
   */
  streets?: {
    floorAt(direction: THREE.Vector3): number;
    blocked(point: THREE.Vector3, radius: number): boolean;
  };
}

/** The countryside's occupancy, as `Life.setCountry` hands it over. */
export interface CountryOccupancy {
  occupied(direction: THREE.Vector3, radius: number): boolean;
}

/** State set from outside after creation, read by the parts at call time. */
export interface LifeShared {
  inTheWay: InTheWay | null;
  country: CountryOccupancy | null;
  /** Where the seats of every herd built from now are collected, or null. */
  seatLog: HerdSeat[] | null;
}
