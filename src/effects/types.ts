import type * as THREE from 'three';
import type { CraftKind, CraftModel, PlayerState } from '../craft/contract.ts';
import type { BiomeId } from '../biome.ts';

/** The part of the player the effects read: `Player` is one. */
export interface EffectsSubject {
  readonly position: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly state: PlayerState;
  readonly airborne: boolean;
  readonly grounded: boolean;
  readonly ride: { readonly model: CraftModel } | null;
  /** In a helicopter: how high over the surface under it, water or ground, and whether it is water. */
  readonly clearance?: number;
  readonly overWater?: boolean;
  /** How far under the surface a diver or a submarine is, units (`Player.depth`). */
  readonly depth?: number;
}

/** Somebody else's vehicle, or a boat of the traffic: its object (posed in the world), what it is, and its model if known. */
export type OtherVisitor = (object: THREE.Object3D, kind: CraftKind, model: CraftModel | null) => void;

/**
 * Something that smokes where it stands — a campfire in the country
 * (`countryside-motion.ts`) — called once a frame for each one near: its
 * mouth and the up it rises along.
 */
export type SmokeVisitor = (at: THREE.Vector3, up: THREE.Vector3) => void;

/** What the player just did that leaves a mark: `player.ts`'s `PlayerEvent`s, and the two foot callbacks. */
export type EffectsEvent = 'swim' | 'ashore' | 'took-off' | 'landed' | 'water-refused' | 'steep-refused' | 'crashed' | 'foundered';

export interface EffectsStats {
  enabled: boolean;
  puffs: number;
  /** Splash and ripple discs. */
  discs: number;
  /** Wake points held across every ribbon, and the ribbons holding any. */
  ribbonPoints: number;
  ribbons: number;
  /** Foam vertices written this frame. */
  foamVertices: number;
  debris: number;
  /** Particles refused by a full pool since the page loaded. */
  dropped: number;
  /** Moves thrown away as jumps since the page loaded: boarding, teleports, late poses. */
  jumps: number;
  /** Other vehicles followed this frame. */
  tracked: number;
  /** Draw calls this frame: a pool with nothing alive is hidden. */
  calls: number;
  updateMs: number;
}

/** What `probe` reads off the wakes: for the headless check. */
export interface WakeProbe {
  points: number;
  /** The longest joined segment in any ribbon, in units. */
  maxGap: number;
  /** Joined segments. */
  segments: number;
}

export interface Effects {
  group: THREE.Group;
  /** Off clears every pool and makes nothing; the Settings card's *Effects*. */
  enabled: boolean;
  readonly stats: EffectsStats;
  /** Every frame, after everything that moves has moved. */
  update(dt: number, subject: EffectsSubject, camera: THREE.Camera): void;
  /** The ground under the player, as the slow sampling in the loop sees it: paved (a town, a road), and the biome. */
  setGround(paved: boolean, biome: BiomeId): void;
  /** Who else is moving: called by `update` with the visitor, once a frame. */
  setOthers(others: ((visit: OtherVisitor) => void) | null): void;
  /** What smokes where it stands: called by `update` with the visitor, once a frame. */
  setSmokers(smokers: ((visit: SmokeVisitor) => void) | null): void;
  /** A `PlayerEvent`, with its strength. */
  event(event: EffectsEvent, strength: number): void;
  /** On foot, down again after a jump or a fall, at `speed`. */
  touchdown(speed: number): void;
  /** On foot, a heel strike at `weight` times a walk. */
  step(weight: number): void;
  /** For the console: a crash, a splash, a landing's dust or a ripple where the player is. */
  burst(kind: 'crash' | 'splash' | 'dust' | 'ripple'): void;
  /**
   * A splash on the water at `point`, `reach` units across: a fish going in
   * or coming out (`ambient.ts`). Nothing while the effects are off.
   */
  splashAt(point: THREE.Vector3, reach: number): void;
  /**
   * A crash's burst and debris at `point`, the wreck facing `facing`: a
   * vehicle nobody is in coming down, or into a wall (`fleet.ts`). Nothing
   * while the effects are off.
   */
  crashAt(point: THREE.Vector3, facing: THREE.Vector3, strength: number): void;
  /**
   * Dust kicked up off the ground at `point`, spread over `reach` units, in
   * `count` puffs of the ground's dust (`setDust`, else the bone of Earth's
   * land): a craft's thrust on the ground under it, a rover's wheels. Nothing
   * while the effects are off.
   */
  dustAt(point: THREE.Vector3, reach: number, count: number): void;
  /**
   * A rocket's exhaust for `dt` (`rocket.ts`): flame out of the bell at
   * `mouth` along `-up`, and smoke billowing off it — spread along the ground
   * when the ground is within `clearance` units under the bell, a column
   * when it is not. `power` 0 is nothing, 1 full thrust; `carry` is the
   * caller's own two counters, so two rockets owe their puffs apart.
   */
  plume(carry: Float64Array, mouth: THREE.Vector3, up: THREE.Vector3, power: number, clearance: number, dt: number): void;
  /**
   * A dust devil for `dt`: dust thrown up and round a column `height` tall
   * standing at `base`, in `hex`. `carry` is the devil's own counter.
   */
  whirl(carry: Float64Array, base: THREE.Vector3, up: THREE.Vector3, height: number, hex: number, dt: number): void;
  /**
   * The colour a foot or a landing raises on a world whose ground no Earth
   * biome names (`setGround`'s `dustOf`): null is Earth's own.
   */
  setDust(hex: number | null): void;
  /** The wakes' points and their longest joined segment. */
  probe(): WakeProbe;
  /** One mesh per program, for `warm.ts`. */
  proxies(): THREE.Object3D[];
  /**
   * Every buffer, material and ramp the pools made, freed: a world's visit
   * makes a set of its own and lets it go on leaving (`worlds/index.ts`).
   */
  dispose(): void;
}
