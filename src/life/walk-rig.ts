/**
 * The walk cycle for a code-built crowd body (`scenery/people.ts`): finding
 * its joints and posing it at a phase.
 */
import * as THREE from 'three';
import { swingLift } from '../avatar.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { lookFor } from '../scenery/dress.ts';
import { POSES, buildPerson } from '../scenery/people.ts';
import { rngFrom } from '../scenery/random.ts';
import { disposeBuilt } from './pool.ts';
import { TAU, WALK_BODIES } from './tuning.ts';

/**
 * Walk amplitudes read off `POSES.walk`, so the crowd's stills and its walkers
 * swing the same amount. Only the magnitudes are taken: `POSES.walk` swings
 * an arm and the leg on the same side together, so the signs follow
 * `avatar.ts`'s stride instead (hips opposite, shoulders against the hips).
 */
const WALK = {
  hip: (Math.abs(POSES.walk.hipX[0]) + Math.abs(POSES.walk.hipX[1])) / 2,
  knee: Math.max(POSES.walk.kneeX[0], POSES.walk.kneeX[1]),
  shoulder: (Math.abs(POSES.walk.shoulderX[0]) + Math.abs(POSES.walk.shoulderX[1])) / 2,
  elbow: (POSES.walk.elbow[0] + POSES.walk.elbow[1]) / 2,
} as const;

/**
 * The four joint pairs of a `buildPerson` group. `people.ts` names none of
 * them, so they are found by structure: the hips are the two groups under the
 * root with a lateral offset, the trunk the one without, the shoulders the two
 * offset groups under the trunk, and each of those has exactly one group
 * child, its second joint. Carried loads are meshes, so they never match.
 */
export interface Rig {
  root: THREE.Object3D;
  hips: [THREE.Object3D, THREE.Object3D];
  knees: [THREE.Object3D, THREE.Object3D];
  shoulders: [THREE.Object3D, THREE.Object3D];
  elbows: [THREE.Object3D, THREE.Object3D];
}

const groupsUnder = (node: THREE.Object3D): THREE.Object3D[] =>
  node.children.filter((child) => (child as THREE.Mesh).isMesh !== true);

/** Finds a crowd body's joints. Throws if the structure does not match: a wrong pivot is not a degraded walker. */
export function rigOf(person: THREE.Object3D): Rig {
  const root = person.children[0];
  if (root === undefined) throw new Error('life: a person with no root');
  const under = groupsUnder(root);
  const hips = under.filter((node) => Math.abs(node.position.x) > 1e-6);
  const trunk = under.find((node) => Math.abs(node.position.x) <= 1e-6);
  if (hips.length !== 2 || trunk === undefined) {
    throw new Error(`life: expected two hips and a trunk under the root, found ${under.length} groups`);
  }
  const arms = groupsUnder(trunk).filter((node) => Math.abs(node.position.x) > 1e-6);
  if (arms.length !== 2) throw new Error(`life: expected two shoulders under the trunk, found ${arms.length}`);
  // Left first, matching `POSES`, whose pairs are `[left, right]` with left at +x.
  hips.sort((a, b) => b.position.x - a.position.x);
  arms.sort((a, b) => b.position.x - a.position.x);
  const second = (node: THREE.Object3D, what: string): THREE.Object3D => {
    const found = groupsUnder(node);
    if (found.length !== 1) throw new Error(`life: expected one ${what}, found ${found.length}`);
    return found[0]!;
  };
  return {
    root,
    hips: [hips[0]!, hips[1]!],
    knees: [second(hips[0]!, 'knee'), second(hips[1]!, 'knee')],
    shoulders: [arms[0]!, arms[1]!],
    elbows: [second(arms[0]!, 'elbow'), second(arms[1]!, 'elbow')],
  };
}

const poseBounds = new THREE.Box3();

/**
 * Poses a rig at one phase of the cycle and re-seats it on the floor. The
 * re-seat is also the bob: the hips rise and fall by what keeps the planted
 * foot on the ground. Returns how far the rig's lowest point ended up below
 * the floor, which should be zero.
 */
export function poseAt(rig: Rig, phase: number, lean: number): number {
  const swing = Math.sin(phase) * WALK.hip;
  const lifts = [swingLift(phase), swingLift(phase + Math.PI)];
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? 1 : -1;
    rig.hips[i]!.rotation.x = swing * sign;
    rig.knees[i]!.rotation.x = lifts[i]! * WALK.knee;
    // Against the leg of the same side, at 0.85 of it (`avatar.ts`'s `ARM_SWING`).
    rig.shoulders[i]!.rotation.x = -swing * sign * (WALK.shoulder / WALK.hip) * 0.85;
    // More fold on the forward swing than the back.
    rig.elbows[i]!.rotation.x = WALK.elbow * (1 - swing * sign * 0.5);
  }
  rig.root.position.y = 0;
  rig.root.rotation.x = lean;
  // `precise`: the loose box of a rotated ellipsoid reaches below its surface.
  poseBounds.setFromObject(rig.root, true);
  rig.root.position.y = -poseBounds.min.y;
  poseBounds.setFromObject(rig.root, true);
  return poseBounds.min.y;
}

/**
 * Sweeps the walk cycle over every body of three regions and reports the
 * worst distance any part of a rig ends up below the floor.
 */
export function verifyWalk(ctx: SceneryContext): { bodies: number; phases: number; worstDip: number } {
  let worst = 0;
  let bodies = 0;
  const phases = 64;
  for (const region of ['atlantic-europe', 'east-asia', 'sub-saharan']) {
    for (let body = 0; body < WALK_BODIES; body++) {
      const rng = rngFrom('verify', region, body);
      const person = buildPerson(ctx, lookFor(rng, region, { pose: 'walk' }));
      const rig = rigOf(person);
      for (let phase = 0; phase < phases; phase++) {
        const dip = poseAt(rig, (phase / phases) * TAU, 0);
        if (dip < worst) worst = dip;
      }
      bodies++;
      disposeBuilt(person);
    }
  }
  return { bodies, phases, worstDip: worst };
}
