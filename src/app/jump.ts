/** Jumps across Earth: from the console, the chat's `/goto` and `/tp`, and the map's *join*. */
import * as THREE from 'three';
import { toLatLon } from '../geo.ts';
import { UNITS_PER_DEGREE } from '../globe.ts';
import { AVATAR_HEIGHT } from '../avatar.ts';
import { unitAt } from '../sphere.ts';
import type { App } from './context.ts';

/** How far from another player *join* puts you: two bodies to their north, in sight but not in the way. */
const JOIN_OFFSET = AVATAR_HEIGHT * 2;

export interface Jumps {
  /** To a point, carried out of any landmark; a town raised later pushes the body clear on its first frame. */
  jumpTo(lat: number, lon: number): void;
  /** Beside another player, `JOIN_OFFSET` to their north; false when they are not known. */
  joinPeer(id: string): boolean;
}

export function createJumps(app: App): Jumps {
  const { player, rig, landProbe, groundAt, arrivalAt } = app;
  const point = new THREE.Vector3();
  function jumpTo(wantedLat: number, wantedLon: number): void {
    const { lat, lon } = arrivalAt(wantedLat, wantedLon);
    // Gathered now, or a foot that lands on the relief rises onto the drawn land a few frames later.
    landProbe.prime(unitAt(lat, lon, point));
    player.goTo(lat, lon);
    rig.snap(player, groundAt);
    // The badge debounces coast crossings; without this it names the place left for a second.
    app.hud.jump();
  }
  function joinPeer(id: string): boolean {
    const at = app.peers?.positionOf(id) ?? null;
    if (at === null) return false;
    const { lat, lon } = toLatLon(at);
    jumpTo(Math.min(89.9, lat + JOIN_OFFSET / UNITS_PER_DEGREE), lon);
    return true;
  }
  return { jumpTo, joinPeer };
}
