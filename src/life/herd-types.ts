/** The shapes a herd takes: its site, its merged heads, and its animals when stood up near. */
import type * as THREE from 'three';
import type { Pose as AnimalPose } from '../fauna/body.ts';
import type { RegionId } from '../fauna/regions.ts';
import type { Rigged } from '../models.ts';

/**
 * What an animal of a near herd is doing: grazing or standing, walking or
 * trotting somewhere, getting away from you, going back to the spot the far
 * herd shows it at, or standing there.
 */
export type GrazeMode = 'graze' | 'idle' | 'walk' | 'trot' | 'flee' | 'home' | 'settled';

/**
 * One animal of a near herd. Positions are in the herd's own plane: x across,
 * z along, y up from the ground at the herd's centre (the frame `buildHerd`
 * seats it in).
 */
export interface Grazer {
  rigged: Rigged;
  rig: string;
  /** The group its place in the herd is written to. */
  place: THREE.Group;
  /** The clip the far herd holds it in, its grazing and standing clips, and its walk if its rig has one. */
  rest: THREE.AnimationAction | undefined;
  graze: THREE.AnimationAction | undefined;
  idle: THREE.AnimationAction | undefined;
  walk: THREE.AnimationAction | undefined;
  current: THREE.AnimationAction | undefined;
  halfLength: number;
  halfWidth: number;
  height: number;
  /** Half the diagonal of the box it stands in: `gradeAt`'s reach under its hooves. */
  stance: number;
  /** Its walking speed, units a second: the pace its `Walk` clip plays at 1. */
  pace: number;
  homeX: number;
  homeZ: number;
  homeY: number;
  homeYaw: number;
  x: number;
  z: number;
  y: number;
  /** About +y, facing +z at 0. */
  yaw: number;
  fromY: number;
  toX: number;
  toZ: number;
  toY: number;
  leg: number;
  speed: number;
  /** Where to face while it stands, or NaN. */
  face: number;
  mode: GrazeMode;
  timer: number;
  /** Decisions taken, which seeds the next one. */
  draws: number;
  /** Seconds left of bolting after something ran into it. */
  bolt: number;
  /** Seconds it has stood blocked by a neighbour on its way. */
  stuck: number;
  /** The stride phase of a rig with no walk of its own, for its bob. */
  bob: number;
  /** Where it is in the world this frame, for `collide`. */
  world: THREE.Vector3;
  facing: THREE.Vector3;
  /** Knocked over by a vehicle (`breakables/knock.ts`): seconds since, -1 while not; from where, which way in the herd's plane, how far. */
  knocked: number;
  knockX: number;
  knockZ: number;
  knockDx: number;
  knockDz: number;
  knockFling: number;
}

/** The ground a herd was admitted on, as much of `HerdSite` as a near herd reads. */
export interface HerdGround {
  centre: THREE.Vector3;
  right: THREE.Vector3;
  forward: THREE.Vector3;
  relief: number;
  /** The origin's distance from the planet's centre. */
  base: number;
  spread: number;
}

/**
 * Where one herd stands and the frame it is drawn in. The scan works this out
 * from its seeded draws and `buildHerd` reads it, so the draw order is never
 * repeated in a second place.
 */
export interface HerdSite extends HerdGround {
  species: string;
  region: RegionId;
  heads: number;
  /** Unit vector at the herd's origin, which is where its mesh is placed. */
  centre: THREE.Vector3;
  /** The mesh's local X and Z, as `update` builds them from the route. */
  right: THREE.Vector3;
  forward: THREE.Vector3;
  /** `reliefAt` at the centre: a seat on the relief is measured against it. */
  relief: number;
}

/** A herd stood up as its animals. */
export interface Herding {
  holder: THREE.Group;
  heads: Grazer[];
  site: HerdGround;
  /** How far from the herd's centre its animals may go; see `roomOf`. */
  room: number;
  /** The nearest built town, which no animal walks into: its centre and radius. */
  town: THREE.Vector3 | null;
  townRadius: number;
  /** The herd's frame in the world this frame: its mesh's X, Y and Z. */
  axisX: THREE.Vector3;
  axisY: THREE.Vector3;
  axisZ: THREE.Vector3;
  /** Whether the viewer has gone far enough that its animals are walking home. */
  homing: boolean;
}

/** One head of a merged herd, kept so the herd can be stood up as rigs. */
export interface HerdHead {
  species: string;
  region: string;
  variant: number;
  pose: AnimalPose['kind'];
  matrix: THREE.Matrix4;
}
