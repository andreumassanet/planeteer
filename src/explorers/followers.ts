/** What follows a traveller: the trail they wear and the companion at their heel, theirs and the others' near. */
import * as THREE from 'three';
import { decodeAppearance } from '../appearance.ts';
import type { CompanionTraveller, Companions, TrailEmitter, Trails } from '../cosmetics.ts';
import type { ExplorersHost } from './types.ts';

/** How near the eye another traveller's trail and companion are worked out, units. */
const PEER_REACH = 500;

export interface Followers {
  update(dt: number): void;
  readonly trails: Trails;
  readonly companions: Companions;
  dispose(): void;
}

export function createFollowers(host: ExplorersHost, cosmetics: typeof import('../cosmetics.ts')): Followers {
  const trails = cosmetics.createTrails(host.scene);
  const companions = cosmetics.createCompanions();
  companions.setRigs(host.rigs);
  host.scene.add(companions.group);
  const emitters: TrailEmitter[] = [];
  const followers: CompanionTraveller[] = [];
  const lastAt = new Map<string, THREE.Vector3>();
  const heroVelocity = new THREE.Vector3();
  const heroLast = new THREE.Vector3().copy(host.traveller().position);
  const pool: { up: THREE.Vector3; velocity: THREE.Vector3; forward: THREE.Vector3 }[] = [];

  function others(dt: number, viewer: THREE.Vector3): void {
    const peers = host.peers();
    if (peers === null) return;
    let used = 0;
    for (const mark of peers.marks) {
      const at = peers.positionOf(mark.id);
      if (at === null || at.distanceTo(viewer) > PEER_REACH) continue;
      const look = decodeAppearance(peers.lookOf(mark.id));
      if (look === null || (look.trail === 0 && look.pet === 0)) continue;
      const slot = pool[used] ?? (pool[used] = { up: new THREE.Vector3(), velocity: new THREE.Vector3(), forward: new THREE.Vector3() });
      used++;
      const key = `peer:${mark.id}`;
      let last = lastAt.get(key);
      if (last === undefined) {
        last = at.clone();
        lastAt.set(key, last);
      }
      slot.up.copy(at).normalize();
      slot.velocity.copy(at).sub(last).divideScalar(Math.max(dt, 1e-3));
      if (slot.velocity.lengthSq() > 1e-4) slot.forward.copy(slot.velocity).projectOnPlane(slot.up).normalize();
      else if (slot.forward.lengthSq() < 0.5) slot.forward.set(1, 0, 0).projectOnPlane(slot.up).normalize();
      last.copy(at);
      emitters.push({ key, position: at, up: slot.up, velocity: slot.velocity, trail: look.trail, inVehicle: mark.state === 'seated' });
      followers.push({ key, position: at, up: slot.up, forward: slot.forward, pet: look.pet, onFoot: mark.state === 'foot' });
    }
    if (lastAt.size > 64) lastAt.clear();
  }

  return {
    trails,
    companions,
    update(dt) {
      emitters.length = 0;
      followers.length = 0;
      const hero = host.traveller();
      const look = host.appearance();
      heroVelocity.copy(hero.position).sub(heroLast).divideScalar(Math.max(dt, 1e-3));
      heroLast.copy(hero.position);
      emitters.push({ key: 'hero', position: hero.position, up: hero.up, velocity: heroVelocity, trail: look.trail, inVehicle: hero.inVehicle });
      followers.push({ key: 'hero', position: hero.position, up: hero.up, forward: hero.forward, pet: look.pet, onFoot: hero.onFoot });
      const viewer = host.camera().position;
      others(dt, viewer);
      trails.update(dt, emitters, viewer);
      companions.update(dt, followers, viewer, host.groundAt);
    },
    dispose() {
      trails.dispose();
      companions.dispose();
      companions.group.removeFromParent();
    },
  };
}
