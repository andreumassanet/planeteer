import type { Bone } from 'three';
import type { SceneryContext } from '../../scenery/contract.ts';
import type { Alien, Morph } from '../contract.ts';
import { frameOf } from './frame.ts';
import { ALIEN_POSES, poseAlien } from './poses.ts';
import { addArms, addHead, addLegs, addTrunk, createBuild } from './rig-parts.ts';
import { addCarry, addCrown, addEyes, addTail, addWear } from './rig-extras.ts';
import type { AlienRig } from './types.ts';

/**
 * The rig of one alien, its sections on their joints, unposed: every joint at
 * rest, the arms straight down, the root at the hip's height over `y = 0`.
 * `poseAlien` turns the joints and `standAlien` puts the soles on the ground.
 * Nothing here touches an `Rng`: two calls with the same arguments are the
 * same geometry, byte for byte.
 */
export function rigAlien(ctx: SceneryContext, morph: Morph, alien: Alien): AlienRig {
  const T = ctx.THREE;
  const group = new T.Group();
  const f = frameOf(morph, alien.height, alien.girth);
  const pose = ALIEN_POSES[alien.pose];
  const b = createBuild(ctx, morph, alien, f);
  const root = b.joint(group, 'root', 0, 0, 0);

  // Bones are created in this order, which is the order the skeleton lists them.
  const legs = addLegs(b, root);
  const { upper, run, trunkTop } = addTrunk(b, root);
  const arms = addArms(b, upper, run);
  const { head, wx, wz, forward } = addHead(b, upper, run);
  addEyes(b, head, wx, wz, forward);
  addCrown(b, head, wx, wz, forward);
  const tail = addTail(b, root);
  addWear(b, upper, run, trunkTop);
  const staff = addCarry(b, root, upper, head, run);

  const bones: Bone[] = [];
  root.traverse((object) => {
    if ((object as Bone).isBone === true) bones.push(object as Bone);
  });

  const float = morph.locomotion === 'float';
  const rig: AlienRig = {
    group,
    root,
    bones,
    legs,
    arms,
    upper,
    head,
    tail,
    staff,
    height: f.height,
    hip: f.hip,
    // A cycle is two steps, and a step is what the swing reaches either side
    // of the hip: 2 sin(0.42) of a leg on two legs, 2 sin(0.32) on four
    // (`worlds/aliens.ts`'s amplitudes), so the feet do not slide.
    stride: f.hip * (float ? 1.1 : morph.legPairs === 1 ? 1.63 : 1.26),
    hover: float ? f.height * 0.12 : 0,
  };
  // Every joint at rest, then the pose the alien was drawn in.
  poseAlien(rig, pose, alien.sway, alien.stoop);
  return rig;
}
