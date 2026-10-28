/**
 * What sliding tyres leave: smoke off the rear wheels, two skid marks laid on
 * the ground under them, a drift's sparks in the colour of the boost it has
 * earned, and the boost's flame out of the exhaust when it is paid.
 */
import type * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import type { EffectsSubject } from './types.ts';
import { BOOST_FLAME, FALL, H, MARK_LIFE, MARK_LIFT, MARK_ON_EARTH, MARK_ON_GRASS, MARK_ON_ROAD, MARK_SPACING, SKID_SLIP, SPARKS } from './constants.ts';
import { E_BOOST, E_MARK, E_SKID, E_SPARK } from './layout.ts';
import { clamp, rand } from './helpers.ts';
import type { Pools } from './pools.ts';
import { createSpawners } from './spawn.ts';

/** How hard a turn has to be, as lateral pull, to count as a slide for a subject that does not say its slip. */
const PULL_SLIDE = 24;

export function createTyres(fx: Pools) {
  const { MARKS, ribbonActive, mine, at, vel, fwdAt } = fx;
  const { spawnPuff, pushPoint, local, addAcross, owed, spaced, shareOf } = createSpawners(fx);

  /** The speed across the bow the subject says, or a hard turn's guess at it. */
  function slipOf(s: EffectsSubject, speed: number): number {
    if (s.slip !== undefined) return Math.abs(s.slip);
    return speed > 20 && Math.abs(fx.turnRate) * speed > PULL_SLIDE ? SKID_SLIP * 3 : 0;
  }

  /**
   * The rear tyres, for `dt`: smoke and marks while they slide, sparks while a
   * drift charges. `track` is the gap between the rear wheels (0 for a single
   * track), `back` how far behind the origin they are.
   */
  function tyres(
    s: EffectsSubject, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3, motion: THREE.Vector3,
    speed: number, run: number, track: number, back: number, width: number, dt: number,
  ): void {
    const across = slipOf(s, speed);
    if (across <= SKID_SLIP || speed < 6) return;
    const hard = clamp((across - SKID_SLIP) / 20, 0, 1);
    const hands = track > 0 ? 2 : 1;
    // Smoke: white off a road, the ground's own dust off bare earth.
    const smoke = fx.paved || fx.dust === null ? PALETTE.bone : fx.dust;
    for (let j = 0, n = owed(mine, E_SKID, 12 + 40 * hard, dt); j < n; j++) {
      const hand = hands === 2 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      local(origin, fwd, up, side, hand * track * 0.5, 0.15, -back, at, (j + 0.5) / n);
      vel.copy(motion).multiplyScalar(0.2).addScaledVector(up, rand(1, 2.5));
      addAcross(up, rand(0.5, 2), vel);
      spawnPuff(at, vel, up, rand(1, 1.5), H * 0.08, H * (0.26 + 0.14 * hard), 0.45, smoke, 0, 1.4, 0.7);
    }
    // The marks, a point every so far run, the two joined frame to frame.
    const hex = fx.paved ? MARK_ON_ROAD : fx.dust !== null ? MARK_ON_EARTH : MARK_ON_GRASS;
    const half = Math.max(0.12, width * 0.07);
    for (let j = 0, n = spaced(mine, E_MARK, run, Math.max(MARK_SPACING, speed * 0.035)); j < n; j++) {
      const share = shareOf(j);
      for (let k = 0; k < hands; k++) {
        const hand = hands === 2 ? (k === 0 ? -1 : 1) : 0;
        local(origin, fwd, up, side, hand * track * 0.5, MARK_LIFT, -back, at, share);
        pushPoint(MARKS[k]!, at, fwdAt.set(0, 0, 0), side, MARK_LIFE, half, half, 0, 0, hex);
      }
    }
    for (let k = 0; k < hands; k++) ribbonActive[MARKS[k]!] = fx.frame;
    // A drift's sparks, once it has earned a boost: blue, then orange.
    const tier = s.driftTier ?? -1;
    if (tier >= 1) {
      const color = SPARKS[Math.min(tier, SPARKS.length - 1)]!;
      for (let j = 0, n = owed(mine, E_SPARK, tier === 1 ? 26 : 40, dt); j < n; j++) {
        const hand = hands === 2 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        local(origin, fwd, up, side, hand * track * 0.5, 0.1, -back, at, (j + 0.5) / n);
        vel.copy(motion).multiplyScalar(0.6).addScaledVector(fwd, -rand(2, 6)).addScaledVector(up, rand(3, 7));
        addAcross(up, rand(1, 3), vel);
        spawnPuff(at, vel, up, rand(0.18, 0.32), H * 0.035, H * 0.02, 0.2, color, 1, 1, -FALL);
      }
    }
  }

  /**
   * A boost: a burst of flame and smoke out of the exhaust the frame it is
   * paid, and a stream of flame while it lasts.
   */
  function boostFlame(s: EffectsSubject, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3, motion: THREE.Vector3, length: number, width: number, height: number, dt: number): void {
    const boost = s.boost ?? 0;
    const burst = boost > fx.lastBoost + 0.05;
    fx.lastBoost = boost;
    if (boost <= 0) return;
    const count = owed(mine, E_BOOST, 45, dt) + (burst ? 14 : 0);
    for (let j = 0; j < count; j++) {
      local(origin, fwd, up, side, width * 0.28, height * 0.16, -length * 0.5, at);
      vel.copy(motion).multiplyScalar(0.5).addScaledVector(fwd, -rand(6, burst ? 16 : 10)).addScaledVector(up, rand(0, 1.5));
      addAcross(up, rand(0.3, 1.5), vel);
      spawnPuff(at, vel, up, rand(0.15, 0.3), H * 0.06, H * rand(0.1, 0.16), 0.3, BOOST_FLAME[j % BOOST_FLAME.length]!, 1, 2, 1);
    }
    if (burst) {
      for (let j = 0; j < 8; j++) {
        local(origin, fwd, up, side, width * 0.28, height * 0.16, -length * 0.5, at);
        vel.copy(motion).multiplyScalar(0.3).addScaledVector(fwd, -rand(3, 6)).addScaledVector(up, rand(1, 2.5));
        addAcross(up, rand(1, 3), vel);
        spawnPuff(at, vel, up, rand(0.8, 1.2), H * 0.08, H * 0.3, 0.4, PALETTE.bone, 0, 1.6, 0.8);
      }
    }
  }

  return { tyres, boostFlame };
}
