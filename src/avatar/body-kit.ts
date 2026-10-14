import type * as THREE from 'three';
import type { Rig } from './avatar-type.ts';
import type { Motion } from './motion-types.ts';

/** What the pose builders of one avatar share: its two groups, its motion and the body now worn. */
export interface BodyKit {
  readonly group: THREE.Group;
  /** Carries the seated offset, so `group` stays where `player.ts` puts it. */
  readonly body: THREE.Group;
  readonly motion: Motion;
  /** The body now worn; swapped by `wear`. */
  rig(): Rig;
  /** Puts the hands' hand-written poses on, and off again before the clips run: see `handHold` in `cast.ts`. */
  handsOn(): void;
  handsOff(): void;
  /** Folds the head away (or back) according to `setHeadless`. */
  foldHead(): void;
}
