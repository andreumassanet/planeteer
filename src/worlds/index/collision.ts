/** The walls a body meets: the towns' buildings, the outposts, parked craft and rockets. */

import * as THREE from 'three';
import type { Craft } from '../craft.ts';
import type { Outposts } from '../outposts.ts';
import type { Settlements } from '../settlements.ts';
import type { Rocket } from '../../rocket.ts';
import { ROCKET_WALL } from '../../rocket.ts';

/** Pushes `position` out of a sphere of `min` round `centre`, keeping its distance from the planet's centre. */
function pushOut(position: THREE.Vector3, centre: THREE.Vector3, min: number): boolean {
  const d = position.distanceTo(centre);
  if (d >= min || d <= 1e-6) return false;
  const keep = position.length();
  position.sub(centre).setLength(min).add(centre).setLength(keep);
  return true;
}

export function createCollide(deps: {
  settlements: Settlements;
  outposts: Outposts;
  crafts: readonly Craft[];
  rockets: ReadonlyMap<string, Rocket>;
  /** The craft being driven, which is no wall to its own driver. */
  driven: () => Craft | null;
}): (position: THREE.Vector3, radius: number) => boolean {
  const { settlements, outposts, crafts, rockets, driven } = deps;
  return (position, radius) => {
    let moved = settlements.collide(position, radius);
    if (outposts.collide(position, radius)) moved = true;
    for (const craft of crafts) {
      if (craft === driven()) continue;
      if (pushOut(position, craft.position, craft.radius + radius)) moved = true;
    }
    // A rocket and its tower are a wall, as a parked craft is.
    for (const rocket of rockets.values()) {
      if (pushOut(position, rocket.position, ROCKET_WALL + radius)) moved = true;
    }
    return moved;
  };
}
