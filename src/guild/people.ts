/**
 * The guild's people, standing in their square near the player: dressed in
 * their role's uniform (`uniforms.ts`), played by the hero's own motion,
 * turning to whoever walks up and waving at them the first time, and facing
 * into the square otherwise. Only the squares within `PEOPLE_REACH` are
 * peopled; the rest of the world's guilds are only marks on the map.
 */
import * as THREE from 'three';
import { createMotion } from '../avatar.ts';
import type { Motion } from '../avatar/motion-types.ts';
import type { Person } from '../cast/types.ts';
import { PERSON_RADIUS } from '../folk.ts';
import type { Folk } from '../folk.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import type { GuildRole } from './roles.ts';
import { uniformOf } from './uniforms.ts';

/** How near a square has to be for its people to stand, units. */
export const PEOPLE_REACH = 260;
/** Inside this a guild person turns to the player, units; and greets them on the way in. */
const TURN_REACH = AVATAR_HEIGHT * 3.2;
const GREET_REACH = AVATAR_HEIGHT * 4.5;
/** How fast a body turns towards where it faces, radians a second. */
const TURN_RATE = 3.2;

/** A square as the people read it: where each role stands. */
export interface GuildSquareLike {
  index: number;
  spots: readonly { role: GuildRole; at: THREE.Vector3; facing: THREE.Vector3 }[];
}

export interface GuildPerson {
  key: string;
  role: GuildRole;
  square: number;
  /** Where their feet are, in the world. */
  position: THREE.Vector3;
  /** Over their head, for a tag and a mark. */
  crown: THREE.Vector3;
}

interface Standing extends GuildPerson {
  person: Person;
  motion: Motion;
  /** Which way they face now, a unit tangent, eased towards `want`. */
  ahead: THREE.Vector3;
  rest: THREE.Vector3;
  greeted: boolean;
  root: THREE.Group;
}

export interface GuildPeople {
  readonly group: THREE.Group;
  /** Each frame, with the squares raised near and the viewer; `engaged` is who is being talked to, held facing them. */
  update(dt: number, squares: readonly GuildSquareLike[], viewer: THREE.Vector3, engaged: string | null): void;
  /** The guild person nearest a point within `reach`, or null. */
  nearest(point: THREE.Vector3, reach: number): (GuildPerson & { distance: number }) | null;
  /** Everyone standing now. */
  readonly standing: readonly GuildPerson[];
  /** Pushes a body of `radius` at `point` out of every guild person; true if it moved. */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  readonly stats: { squares: number; people: number };
  dispose(): void;
}

export const guildKey = (square: number, role: GuildRole): string => `guild:${square}:${role}`;

export function createGuildPeople(folk: Folk): GuildPeople {
  const group = new THREE.Group();
  group.name = 'guild:people';
  const people = new Map<string, Standing>();
  const list: Standing[] = [];
  const wanted = new Set<string>();
  const stats = { squares: 0, people: 0 };
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const want = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const toward = new THREE.Vector3();

  function release(key: string, standing: Standing): void {
    standing.motion.unlay();
    standing.root.remove(standing.person.root);
    standing.root.removeFromParent();
    folk.release(standing.person);
    people.delete(key);
  }

  function build(key: string, role: GuildRole, square: number, at: THREE.Vector3, facing: THREE.Vector3): Standing | null {
    const person = folk.wear(uniformOf(role, key), AVATAR_HEIGHT);
    if (person === null) return null;
    person.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    const root = new THREE.Group();
    root.name = key;
    root.add(person.root);
    group.add(root);
    const standing: Standing = {
      key,
      role,
      square,
      position: at.clone(),
      crown: new THREE.Vector3(),
      person,
      motion: createMotion(person),
      ahead: facing.clone(),
      rest: facing.clone(),
      greeted: false,
      root,
    };
    return standing;
  }

  /** Stands the body on its spot facing `ahead`, as a proper rotation. */
  function pose(standing: Standing): void {
    up.copy(standing.position).normalize();
    standing.ahead.projectOnPlane(up);
    if (standing.ahead.lengthSq() < 1e-8) standing.ahead.copy(standing.rest).projectOnPlane(up);
    standing.ahead.normalize();
    // X = Y x Z.
    side.crossVectors(up, standing.ahead).normalize();
    basis.makeBasis(side, up, standing.ahead);
    if (basis.determinant() <= 0) throw new Error('guild: a person would stand mirrored');
    standing.root.quaternion.setFromRotationMatrix(basis);
    standing.root.position.copy(standing.position);
    standing.crown.copy(standing.position).addScaledVector(up, AVATAR_HEIGHT * 1.02);
  }

  /** Eases `ahead` towards `target` about the up, by at most `TURN_RATE * dt`. */
  function turn(standing: Standing, target: THREE.Vector3, dt: number): void {
    up.copy(standing.position).normalize();
    want.copy(target).projectOnPlane(up);
    if (want.lengthSq() < 1e-8) return;
    want.normalize();
    const angle = standing.ahead.angleTo(want);
    if (angle < 1e-3) return;
    const step = Math.min(1, (TURN_RATE * dt) / angle);
    standing.ahead.lerp(want, step).normalize();
  }

  return {
    group,
    stats,
    get standing() {
      return list;
    },
    update(dt, squares, viewer, engaged) {
      wanted.clear();
      stats.squares = 0;
      for (const square of squares) {
        if (square.spots.length === 0) continue;
        if (square.spots[0]!.at.distanceTo(viewer) > PEOPLE_REACH) continue;
        stats.squares++;
        for (const spot of square.spots) {
          const key = guildKey(square.index, spot.role);
          wanted.add(key);
          let standing = people.get(key);
          if (standing === undefined) {
            const made = build(key, spot.role, square.index, spot.at, spot.facing);
            if (made === null) continue;
            people.set(key, made);
            standing = made;
          }
          standing.position.copy(spot.at);
          standing.rest.copy(spot.facing);
          const gap = standing.position.distanceTo(viewer);
          if (engaged === key || gap < TURN_REACH) turn(standing, toward.copy(viewer).sub(standing.position), dt);
          else turn(standing, standing.rest, dt * 0.5);
          if (!standing.greeted && gap < GREET_REACH) {
            standing.greeted = true;
            standing.motion.emote('wave');
          } else if (gap > GREET_REACH * 3) standing.greeted = false;
          pose(standing);
          if (standing.motion.emoting === null) standing.motion.foot(dt, 0, false);
          else standing.motion.still(dt);
        }
      }
      for (const [key, standing] of people) if (!wanted.has(key)) release(key, standing);
      list.length = 0;
      for (const standing of people.values()) list.push(standing);
      stats.people = list.length;
    },
    nearest(point, reach) {
      let best: Standing | null = null;
      let bestGap = reach;
      for (const standing of list) {
        const gap = standing.position.distanceTo(point);
        if (gap < bestGap) {
          best = standing;
          bestGap = gap;
        }
      }
      return best === null ? null : { key: best.key, role: best.role, square: best.square, position: best.position, crown: best.crown, distance: bestGap };
    },
    collide(point, radius, push) {
      let moved = false;
      const reach = radius + PERSON_RADIUS;
      for (const standing of list) {
        up.copy(standing.position).normalize();
        toward.copy(point).sub(standing.position);
        // Over their heads, or on a terrace below: no touch.
        const rise = toward.dot(up);
        if (rise > AVATAR_HEIGHT || rise < -AVATAR_HEIGHT) continue;
        toward.addScaledVector(up, -rise);
        const gap = toward.length();
        if (gap >= reach || gap < 1e-6) continue;
        push.addScaledVector(toward, (reach - gap) / gap);
        moved = true;
      }
      return moved;
    },
    dispose() {
      for (const [key, standing] of people) release(key, standing);
      list.length = 0;
      group.removeFromParent();
    },
  };
}
