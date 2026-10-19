import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../avatar.ts';
import { m, rigBack } from '../fauna/contract.ts';
import { makeRigged } from '../models.ts';
import type { RigSource, Rigged } from '../models.ts';
import type { Rig } from '../models.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Standing, TownsfolkState } from './standing.ts';

const hash = (key: string, salt: string): number => rngFrom(key, salt).unit();

/**
 * A town's dogs: some of the people strolling its streets walk one on a lead.
 * The dog is the pack's Shiba Inu (CC0, baked by `pnpm kit` as `dog`), a
 * skinned rig at the world's stature, trotting beside and a little ahead of
 * its walker, and stopping when they stop; the lead is one inked line from the
 * walker's wrist to its neck. Who has one is the walker's key's to say.
 */

/** The share of strollers who walk a dog. */
export const DOG_SHARE = 0.15;
/** A Shiba's height at the withers, in metres. */
const DOG_BACK = 0.4;
/** Where the dog trots, in its walker's frame: to the side, and ahead. */
const DOG_SIDE = AVATAR_HEIGHT * 0.22;
const DOG_AHEAD = AVATAR_HEIGHT * 0.3;
/** How quickly the dog closes on where it wants to be, a second. */
const DOG_FOLLOW = 3.5;
/** The walk clip's pace at a time scale of one, in world units a second. */
const DOG_STRIDE = AVATAR_HEIGHT * 0.55;

export interface Dog {
  rigged: Rigged;
  walk: THREE.AnimationAction;
  idle: THREE.AnimationAction;
  lead: THREE.Line;
  at: THREE.Vector3;
  yaw: number;
  walking: number;
}

export interface Dogs {
  setRigs(rigs: RigSource): void;
  /** Leads a dog beside a stroller who has one, once the rig has loaded; moves it and its lead. */
  step(st: TownsfolkState, entry: Standing, dt: number): void;
  release(st: TownsfolkState, entry: Standing): void;
  readonly stats: { dogs: number };
}

/** The scale a dog rig is drawn at: `DOG_BACK` at the withers, at the world's stature. */
export function dogScale(rig: Rig): number {
  return m(DOG_BACK) / rigBack(rig);
}

export function wantsDog(entry: Standing): boolean {
  return entry.mode === 'stroll' && hash(entry.anchor.key, 'dog') < DOG_SHARE;
}

export function createDogs(): Dogs {
  let rigs: RigSource | null = null;
  const pool: Rigged[] = [];
  const leadMaterial = new THREE.LineBasicMaterial({ color: 0x2b211b });
  leadMaterial.userData.outlineParameters = { visible: false };
  const want = new THREE.Vector3();
  const local = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const inverse = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const wrist = new THREE.Vector3();
  const neck = new THREE.Vector3();
  const stats = { dogs: 0 };

  function leash(st: TownsfolkState, entry: Standing): Dog | null {
    const rig = rigs?.get('dog') ?? null;
    if (rig === null) return null;
    const rigged = pool.pop() ?? makeRigged(rig);
    rigged.root.scale.setScalar(dogScale(rig));
    const walk = rigged.actions.get('Walk')!;
    const idle = rigged.actions.get('Idle')!;
    walk.play();
    idle.play();
    walk.time = hash(entry.anchor.key, 'dog-walk') * walk.getClip().duration;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const lead = new THREE.Line(geometry, leadMaterial);
    lead.frustumCulled = false;
    lead.castShadow = false;
    st.group.add(rigged.root, lead);
    stats.dogs++;
    return { rigged, walk, idle, lead, at: entry.position.clone(), yaw: entry.yaw, walking: 0 };
  }

  return {
    stats,
    setRigs(source) {
      rigs = source;
    },
    step(st, entry, dt) {
      if (entry.dog === null) {
        if (!wantsDog(entry)) return;
        entry.dog = leash(st, entry);
        if (entry.dog === null) return;
      }
      const dog = entry.dog;
      // Beside its walker and a little ahead, in the walker's own frame.
      want.set(DOG_SIDE * (hash(entry.anchor.key, 'dog-side') < 0.5 ? 1 : -1), 0, DOG_AHEAD)
        .applyQuaternion(entry.holder.quaternion)
        .add(entry.holder.position);
      prev.copy(dog.at);
      const k = 1 - Math.exp(-DOG_FOLLOW * Math.max(0, dt));
      dog.at.lerp(want, k);
      inverse.copy(entry.anchor.town).invert();
      local.subVectors(dog.at, prev).applyQuaternion(inverse);
      const moved = Math.hypot(local.x, local.z);
      const speed = dt > 0 ? moved / dt : 0;
      if (moved > 1e-3) dog.yaw = Math.atan2(local.x, local.z);
      const walking = THREE.MathUtils.clamp(speed / (DOG_STRIDE * 0.4), 0, 1);
      dog.walking += (walking - dog.walking) * Math.min(1, dt * 6);
      dog.walk.setEffectiveWeight(dog.walking);
      dog.idle.setEffectiveWeight(1 - dog.walking);
      dog.walk.timeScale = THREE.MathUtils.clamp(speed / DOG_STRIDE, 0.5, 2.2);
      dog.rigged.mixer.update(dt);
      const root = dog.rigged.root;
      root.position.copy(dog.at);
      turn.setFromAxisAngle(up, dog.yaw);
      root.quaternion.copy(entry.anchor.town).multiply(turn);
      // The lead: the walker's wrist to the dog's neck.
      entry.holder.updateMatrixWorld(true);
      root.updateMatrixWorld(true);
      const hand = entry.person.bones.get('Wrist.R') ?? entry.person.bones.get('Head');
      const collar = dog.rigged.root.getObjectByName('Neck1') ?? root;
      if (hand !== undefined) hand.getWorldPosition(wrist);
      else wrist.copy(entry.holder.position);
      collar.getWorldPosition(neck);
      const position = dog.lead.geometry.getAttribute('position') as THREE.BufferAttribute;
      position.setXYZ(0, wrist.x, wrist.y, wrist.z);
      position.setXYZ(1, neck.x, neck.y, neck.z);
      position.needsUpdate = true;
    },
    release(st, entry) {
      const dog = entry.dog;
      if (dog === null) return;
      st.group.remove(dog.rigged.root, dog.lead);
      dog.lead.geometry.dispose();
      dog.walk.stop();
      dog.idle.stop();
      pool.push(dog.rigged);
      entry.dog = null;
      stats.dogs--;
    },
  };
}
