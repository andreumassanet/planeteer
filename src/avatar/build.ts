import * as THREE from 'three';
import { DEFAULT_APPEARANCE, coloursOf, fitAppearance, outfitsOf, wardrobeOf, type Appearance } from '../appearance.ts';
import { handHold, limbsOf, paintWith } from '../cast.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import type { Avatar, Rig } from './avatar-type.ts';
import type { BodyKit } from './body-kit.ts';
import { chosen, heroCast, heroes } from './hero.ts';
import { smoothstep } from './maths.ts';
import { SWIM_LIFT, SWIM_RIDE, SWIM_ROLL, SWIM_STROKE } from './motion-config.ts';
import type { MotionCues } from './motion-types.ts';
import { createMotion } from './motion.ts';
import { createSeated } from './seated.ts';
import { createSkydive } from './skydive.ts';

/**
 * Builds the body and returns the rig that poses it. Needs `prepareAvatar`
 * first. Without an appearance it is the hero, wearing what the player chose
 * and changing with `dressHero`; with one it wears that and nothing else.
 */
export function buildAvatar(appearance?: Appearance): Avatar {
  if (heroCast === null) throw new Error('avatar: call prepareAvatar() before buildAvatar()');
  const cast = heroCast;
  const hero = appearance === undefined;

  const group = new THREE.Group();
  group.name = 'avatar';
  /** Carries the seated offset, so `group` stays where `player.ts` puts it. */
  const body = new THREE.Group();
  group.add(body);

  function dress(wanted: Appearance): Rig {
    const person = cast.make(wardrobeOf(wanted), paintWith(coloursOf(wanted)), AVATAR_HEIGHT);
    // Measured in the bind pose, which `limbsOf` puts the skeleton in.
    const limbs = limbsOf(person);
    body.add(person.root);
    return { person, appearance: wanted, limbs, hold: handHold(limbs) };
  }

  const wanted = fitAppearance(appearance ?? chosen);
  const loaded = outfitsOf(wanted).every((outfit) => cast.has(outfit));
  // A choice whose outfits have not arrived is worn when they have; the
  // default is always loaded (`prepareAvatar`).
  let rig = dress(loaded ? wanted : DEFAULT_APPEARANCE);
  const motion = createMotion(rig.person);
  let asked = 0;

  /**
   * A pose written by hand is taken off again before the clips run
   * (`handHold` in `cast.ts`): `handsOn` just before a seated, astride or
   * hanging pose is written, `handsOff` at the top of every frame, whatever
   * that frame does — or a rider got off with his arms still up at the bars.
   */
  let handPosed: Rig | null = null;
  function handsOn(): void {
    rig.hold.on();
    handPosed = rig;
  }
  function handsOff(): void {
    handPosed?.hold.off();
    handPosed = null;
  }

  const kit: BodyKit = { group, body, motion, rig: () => rig, handsOn, handsOff, foldHead };
  const { sit, ride } = createSeated(kit);
  const skydive = createSkydive(kit);

  function stride(dt: number, speed: number, airborne: boolean, cues?: MotionCues): void {
    handsOff();
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    motion.foot(dt, speed, airborne, cues);
    if (headless) foldHead();
  }

  function swim(dt: number, speed: number, sink: number, under = 0): void {
    handsOff();
    motion.swim(dt, speed, under);
    // The body rolls with the stroke, towards the arm that is pulling — a
    // crawl breathes on the roll — and rides a little up on each pull; both
    // by how much of the crawl is showing, and less under the surface, where
    // the stroke is a glide.
    const crawl = smoothstep(speed, 0.2, SWIM_STROKE * 0.25) * (1 - 0.5 * under);
    const turn = motion.stroke * Math.PI * 2;
    body.position.set(0, sink + (SWIM_LIFT + Math.abs(Math.sin(turn)) * SWIM_RIDE) * crawl * (1 - under), 0);
    body.rotation.set(0, 0, Math.sin(turn) * SWIM_ROLL * crawl);
  }

  /** The head bone's own scale, kept while it is folded away; see `setHeadless`. */
  let headless = false;
  function foldHead(): void {
    const head = rig.person.bones.get('Head');
    if (head === undefined) return;
    if (headless) head.scale.setScalar(1e-3);
    else head.scale.setScalar(1);
  }

  /**
   * At the helm: standing in the relaxed idle, giving back two thirds of the
   * deck's roll so the sea reads as moving under him.
   */
  function steer(dt: number, heel: number): void {
    handsOff();
    body.position.set(0, 0, 0);
    motion.still(dt);
    body.rotation.set(0, 0, -heel * 0.65);
    foldHead();
  }

  function reset(): void {
    handsOff();
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    motion.reset();
  }

  async function wear(next: Appearance): Promise<void> {
    const ask = ++asked;
    const fitted = fitAppearance(next);
    await cast.ensure(outfitsOf(fitted));
    if (ask !== asked) return;
    handsOff();
    const old = rig;
    // Whatever the old body was doing, the new one takes up mid-step: the
    // motion's weights and phase, and every clocked clip where it was.
    rig = dress(fitted);
    body.remove(old.person.root);
    motion.rebind(rig.person);
    old.person.bones.get('Head')?.scale.setScalar(1);
    cast.release(old.person);
    foldHead();
  }

  if (hero) heroes.add(wear);
  if (!loaded) void wear(wanted);
  return {
    group,
    stride,
    swim,
    land: (hardness) => motion.land(hardness),
    steer,
    skydive,
    sit,
    ride,
    reset,
    setHeadless(on) {
      if (on === headless) return;
      headless = on;
      foldHead();
    },
    wear,
    emote: (name) => motion.emote(name),
    get emoting() {
      return motion.emoting;
    },
    get phase() {
      return motion.phase;
    },
    get appearance() {
      return { ...rig.appearance };
    },
    dispose() {
      asked++;
      heroes.delete(wear);
      handsOff();
      motion.unlay();
      group.removeFromParent();
      body.remove(rig.person.root);
      rig.person.bones.get('Head')?.scale.setScalar(1);
      cast.release(rig.person);
    },
  };
}
