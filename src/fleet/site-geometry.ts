/** Points and headings round a town, and the sites built from them. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { biomeAt, biomeSample } from '../biome.ts';
import type { Slope } from '../terrain.ts';
import { KIND_OF } from './models.ts';
import { SITE_ROOM } from './site-rules.ts';
import type { FleetSite } from './site-types.ts';
import type { SiteTowns } from './site-towns.ts';

export interface SiteGeometry {
  /** Scratch the searches write their answers into and their callers read straight away. */
  readonly corner: THREE.Vector3;
  readonly across: THREE.Vector3;
  readonly north: THREE.Vector3;
  readonly at: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly side: THREE.Vector3;
  readonly slope: Slope;
  /** The point `distance` units from a town's centre on a bearing. */
  around(place: number, bearing: number, distance: number, out: THREE.Vector3): THREE.Vector3;
  /** The point `distance` units from `up` on a bearing from its north. */
  aroundPoint(up: THREE.Vector3, bearing: number, distance: number, out: THREE.Vector3): THREE.Vector3;
  /** The tangent at `at` pointing away from a town's centre. */
  outward(place: number, at: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  site(model: string, place: number, n: number, at: THREE.Vector3, forward: THREE.Vector3, road?: number): FleetSite;
  /** The biome at a town's centre. */
  biomeOf(p: number): string;
  /** Whether a spot is within its room and another's of anything this town already keeps. */
  crowded(p: number, spot: THREE.Vector3, room: number, out: readonly FleetSite[]): boolean;
}

export function createSiteGeometry(towns: SiteTowns): SiteGeometry {
  const { world, places, centres, probe } = towns;
  const corner = new THREE.Vector3();
  const across = new THREE.Vector3();
  const north = new THREE.Vector3();
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };

  function around(place: number, bearing: number, distance: number, out: THREE.Vector3): THREE.Vector3 {
    return aroundPoint(centres[place]!, bearing, distance, out);
  }

  function aroundPoint(up: THREE.Vector3, bearing: number, distance: number, out: THREE.Vector3): THREE.Vector3 {
    north.set(0, 1, 0).projectOnPlane(up);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
    north.normalize();
    across.crossVectors(up, north).normalize();
    return out
      .copy(up)
      .addScaledVector(across, (Math.sin(bearing) * distance) / PLANET_RADIUS)
      .addScaledVector(north, (Math.cos(bearing) * distance) / PLANET_RADIUS)
      .normalize();
  }

  function outward(place: number, at: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(at).sub(centres[place]!).projectOnPlane(at);
    if (out.lengthSq() < 1e-14) out.set(0, 1, 0).projectOnPlane(at);
    return out.normalize();
  }

  const site = (model: string, place: number, n: number, at: THREE.Vector3, forward: THREE.Vector3, road = -1): FleetSite => ({
    id: `${model}:${place}:${n}`,
    model,
    kind: KIND_OF[model]!,
    place,
    at: at.clone(),
    forward: forward.clone(),
    road,
  });

  const at = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();

  const townBiome = biomeSample();
  const biomeOf = (p: number): string => {
    const at = centres[p]!;
    const place = places[p]!;
    biomeAt(at.x, at.y, at.z, place.lat, place.lon, world.elevationAt(probe.copy(at).multiplyScalar(PLANET_RADIUS)), townBiome);
    return townBiome.id;
  };

  const crowded = (p: number, spot: THREE.Vector3, room: number, out: readonly FleetSite[]): boolean =>
    out.some((other) => other.place === p && other.at.angleTo(spot) * PLANET_RADIUS < room + SITE_ROOM[other.kind]);

  return { corner, across, north, at, forward, side, slope, around, aroundPoint, outward, site, biomeOf, crowded };
}
