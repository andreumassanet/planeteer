/**
 * The companion a traveller has earned, trotting after them on foot: the
 * towns' own dog (`folk/dogs.ts`, the pack's Shiba Inu at the world's
 * stature), a little behind and to one side, stopping when they stop and
 * catching up when they run. In a vehicle, or past `COMPANION_REACH` of the
 * viewer, it is not drawn; it comes back at its traveller's heel.
 *
 * Pooled skinned rigs, one draw call a dog, and no more than
 * `MAX_COMPANIONS`: the nearest travellers first.
 */
import * as THREE from 'three';
import { dogScale } from '../folk/dogs.ts';
import { makeRigged, type RigSource, type Rigged } from '../models.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PETS, cosmeticAt } from './catalogue.ts';

/** How near the viewer a companion is drawn, units, and how many at once. */
export const COMPANION_REACH = 300;
export const MAX_COMPANIONS = 6;
/** Where it trots, in its traveller's frame: to the side, and behind. */
const SIDE = AVATAR_HEIGHT * 0.3;
const BEHIND = AVATAR_HEIGHT * 0.35;
/** How quickly it closes on that place, a second, and how far behind it may fall before it is put there. */
const FOLLOW = 3.2;
const LEASH = AVATAR_HEIGHT * 8;
/** The walk clip's pace at a time scale of one, units a second (`DOG_STRIDE` in `folk/dogs.ts`). */
const STRIDE = AVATAR_HEIGHT * 0.55;

export interface CompanionTraveller {
  /** Stable for one traveller: `'hero'`, `'peer:<id>'`. */
  key: string;
  /** Between the feet, world space. */
  position: THREE.Vector3;
  /** Away from the planet, unit. */
  up: THREE.Vector3;
  /** The way they face, across `up`. */
  forward: THREE.Vector3;
  /** The look's `pet`; 0 is none. */
  pet: number;
  /** On their own feet: not in a seat, not swimming. */
  onFoot: boolean;
}

export interface Companions {
  readonly group: THREE.Group;
  readonly stats: { drawn: number };
  /** The kit's rigs, once loaded (`setRigs` as the townsfolk's dogs get them). */
  setRigs(rigs: RigSource): void;
  /** Each frame: who might have a companion, and the viewer for the reach. Optional `groundAt` is the ground's radius under a direction. */
  update(dt: number, travellers: readonly CompanionTraveller[], viewer: THREE.Vector3, groundAt?: (direction: THREE.Vector3) => number): void;
  dispose(): void;
}

interface Dog {
  rigged: Rigged;
  walk: THREE.AnimationAction;
  idle: THREE.AnimationAction;
  at: THREE.Vector3;
  facing: THREE.Vector3;
  walking: number;
  seen: boolean;
}

export function createCompanions(): Companions {
  const group = new THREE.Group();
  group.name = 'companions';
  let rigs: RigSource | null = null;
  const pool: Rigged[] = [];
  const dogs = new Map<string, Dog>();
  const stats = { drawn: 0 };
  const want = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const moved = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const direction = new THREE.Vector3();

  function leash(t: CompanionTraveller): Dog | null {
    const rig = rigs?.get('dog') ?? null;
    if (rig === null) return null;
    const rigged = pool.pop() ?? makeRigged(rig);
    rigged.root.scale.setScalar(dogScale(rig));
    rigged.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) object.castShadow = true;
    });
    const walk = rigged.actions.get('Walk')!;
    const idle = rigged.actions.get('Idle')!;
    walk.play();
    idle.play();
    group.add(rigged.root);
    return { rigged, walk, idle, at: heel(t, new THREE.Vector3()), facing: t.forward.clone(), walking: 0, seen: true };
  }

  /** Where the dog wants to be: beside and behind its traveller. */
  function heel(t: CompanionTraveller, out: THREE.Vector3): THREE.Vector3 {
    up.copy(t.up).normalize();
    ahead.copy(t.forward).addScaledVector(up, -t.forward.dot(up)).normalize();
    side.crossVectors(up, ahead);
    return out.copy(t.position).addScaledVector(side, SIDE).addScaledVector(ahead, -BEHIND);
  }

  function release(key: string, dog: Dog): void {
    group.remove(dog.rigged.root);
    dog.walk.stop();
    dog.idle.stop();
    pool.push(dog.rigged);
    dogs.delete(key);
  }

  function step(t: CompanionTraveller, dog: Dog, dt: number, groundAt?: (direction: THREE.Vector3) => number): void {
    heel(t, want);
    if (dog.at.distanceTo(want) > LEASH) dog.at.copy(want);
    const before = moved.copy(dog.at);
    dog.at.lerp(want, 1 - Math.exp(-FOLLOW * Math.max(0, dt)));
    // On the ground under it, or at its traveller's height.
    direction.copy(dog.at).normalize();
    const radius = groundAt?.(direction) ?? t.position.length();
    dog.at.copy(direction).multiplyScalar(radius);
    moved.subVectors(dog.at, before);
    up.copy(direction);
    moved.addScaledVector(up, -moved.dot(up));
    const speed = dt > 0 ? moved.length() / dt : 0;
    if (moved.lengthSq() > 1e-8) dog.facing.copy(moved).normalize();
    else dog.facing.addScaledVector(up, -dog.facing.dot(up)).normalize();
    const walking = THREE.MathUtils.clamp(speed / (STRIDE * 0.4), 0, 1);
    dog.walking += (walking - dog.walking) * Math.min(1, dt * 6);
    dog.walk.setEffectiveWeight(dog.walking);
    dog.idle.setEffectiveWeight(1 - dog.walking);
    dog.walk.timeScale = THREE.MathUtils.clamp(speed / STRIDE, 0.5, 2.6);
    dog.rigged.mixer.update(dt);
    // Facing its way, standing on its ground: +Z ahead and +Y up, a proper turn.
    side.crossVectors(up, dog.facing);
    basis.makeBasis(side, up, dog.facing);
    if (!(basis.determinant() > 0)) return;
    dog.rigged.root.quaternion.setFromRotationMatrix(basis);
    dog.rigged.root.position.copy(dog.at);
  }

  return {
    group,
    stats,
    setRigs(source) {
      rigs = source;
    },
    update(dt, travellers, viewer, groundAt) {
      for (const dog of dogs.values()) dog.seen = false;
      const near = travellers
        .filter((t) => t.onFoot && cosmeticAt('pet', t.pet) !== null && t.position.distanceToSquared(viewer) < COMPANION_REACH * COMPANION_REACH)
        .sort((a, b) => a.position.distanceToSquared(viewer) - b.position.distanceToSquared(viewer))
        .slice(0, MAX_COMPANIONS);
      for (const t of near) {
        let dog = dogs.get(t.key);
        if (dog === undefined) {
          const made = leash(t);
          if (made === null) continue;
          dog = made;
          dogs.set(t.key, dog);
        }
        dog.seen = true;
        step(t, dog, dt, groundAt);
      }
      for (const [key, dog] of dogs) if (!dog.seen) release(key, dog);
      stats.drawn = dogs.size;
    },
    dispose() {
      for (const [key, dog] of dogs) release(key, dog);
      pool.length = 0;
      group.removeFromParent();
    },
  };
}

/** Whether every companion in the catalogue is the dog this file draws. */
export const COMPANIONED = PETS.every((item) => item.id === 'pet-dog');
