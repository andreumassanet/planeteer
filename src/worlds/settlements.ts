/**
 * The towns of another world: laid out, built from the space kit (or in code
 * where it is not loaded), merged one mesh a town, streamed by distance, and
 * solid.
 *
 * - A town stands on its own pad, which the terrain levels to a plane, so
 *   everything in it is built in one flat frame.
 * - One town, one draw call: the kit's modules are painted in the
 *   civilisation's colours as vertex colours and merged; a window's vertices
 *   carry a glow the loop turns up after dark.
 * - A building is a wall: it keeps its footprint as circles and `collide`
 *   pushes a body out of them.
 * - On a cloud deck a town is a platform floating `PLATFORM_LIFT` over the
 *   levelled deck, and `floorAt` is what the foot stands on inside it.
 *
 * Layout and building live in `settlements/`; this file composes them into
 * the `Settlements` streamer.
 */

import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import { DEFAULT_ARCHITECTURE } from './contract.ts';
import type { Terrain } from './terrain.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { rngFrom } from '../scenery/random.ts';
import { NEAR_BUILD, frameOpenFor } from '../view.ts';
import { SCATTER, onWorldKit, worldKit } from './kit.ts';
import { roadNetwork } from './roads.ts';
import { createBeacons } from './settlements/beacons.ts';
import { buildDisc, layBase } from './settlements/colony-build.ts';
import type { TownContext } from './settlements/context.ts';
import { craftSpotsOf } from './settlements/craft-spots.ts';
import { createDeckFloor } from './settlements/deck-floor.ts';
import { buildGridTown } from './settlements/grid-build.ts';
import { createTownLamps } from './settlements/lamp-lights.ts';
import { createSites } from './settlements/sites.ts';
import { buildSetting } from './settlements/landmark-plaza.ts';
import { avenueHalfOf, siteToWorld } from './settlements/layout.ts';
import { bakeTown } from './settlements/site-mesh.ts';
import { createTownMaterial } from './settlements/town-material.ts';
import type { CraftSpot, Footprint, Settlements, Site } from './settlements/types.ts';
import { createTownWalls } from './settlements/walls.ts';

export { PARKED_KITS, PLATFORM_LIFT } from './settlements/types.ts';
export type { CraftSpot, Footprint, Plot, Port, Settlements, Site } from './settlements/types.ts';
export { arrivalOf, avenueHalfOf, circlesOf, colonyBudget, frameAt, layoutOf, pieceRadius, upwindYaw } from './settlements/layout.ts';

/** Built inside this many units of the eye past a town's own radius; dropped past the second. */
const BUILD_REACH = 3200;
const DROP_REACH = 4200;
/** The most triangles a plant in a grid town's planter or yard may cost. */
const SMALL_PLANT = 800;

export function createSettlements(spec: WorldSpec, terrain: Terrain, ctx: SceneryContext, gradientMap: THREE.Texture): Settlements {
  const R = terrain.radius;
  const deck = spec.ground === 'cloud-deck';
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  const colony = style.colony;
  const { material, glowUniform } = createTownMaterial(gradientMap);
  const glowColors = new Set<number>(style.glow ?? []);
  // A tree of the pack is two thousand triangles and a town has hundreds of planters.
  const smallPlants = (colony?.gardens ?? []).filter((id) => (SCATTER[id]?.triangles ?? 0) <= SMALL_PLANT);
  const avenueHalf = avenueHalfOf(spec);
  const group = new THREE.Group();
  group.name = 'world-towns';

  const sites = createSites({ spec, terrain, ctx, style, colony, deck, avenueHalf });

  const stats = { built: 0, triangles: 0, buildMs: 0, kit: 0 };
  const lamps = createTownLamps();
  const walls = createTownWalls(sites);
  const deckFloorAt = createDeckFloor(sites, R);
  const spots = new Map<string, CraftSpot[]>();
  // The roads, a function of the towns: which main street ends lead somewhere.
  const network = roadNetwork(spec, sites, terrain);
  const town: TownContext = { spec, ctx, style, colony, deck, terrain, network, smallPlants };

  function build(site: Site): void {
    const began = performance.now();
    const kit = colony !== undefined ? worldKit() : null;
    const draft = new THREE.Group();
    layBase(town, site, draft);
    const footprints: Footprint[] = [];
    site.port = null;
    if (site.landmark) {
      const mark = spec.landmarks.find((one) => one.id === site.id)!;
      const made = mark.build(ctx, rngFrom('worlds', spec.id, 'landmark', mark.id));
      made.position.y = site.floor;
      draft.add(made);
      footprints.push({ x: 0, z: 0, radius: mark.radius * 0.6, height: 40 });
      lamps.setPlazaLamps(site.id, buildSetting(town, kit, site, draft));
    } else if (site.town !== null) {
      buildGridTown(town, kit, site, site.town, draft, footprints);
    } else {
      buildDisc(town, kit, site, draft, footprints);
    }
    const baked = bakeTown(draft, site, material, glowColors);
    group.add(baked.mesh);
    site.mesh = baked.mesh;
    site.footprints = footprints;
    site.kit = kit !== null;
    stats.built++;
    if (site.kit) stats.kit++;
    stats.triangles += baked.triangles;
    stats.buildMs = performance.now() - began;
  }

  function drop(site: Site): void {
    if (site.mesh === null) return;
    group.remove(site.mesh);
    stats.triangles -= site.mesh.geometry.getAttribute('position').count / 3;
    site.mesh.geometry.dispose();
    site.mesh = null;
    site.footprints = [];
    site.port = null;
    if (site.kit) stats.kit--;
    site.kit = false;
    stats.built--;
  }

  // When the kit arrives, the towns built from the stand-ins go, and the
  // stream builds them again from it.
  const unsubscribe =
    colony === undefined
      ? () => true
      : onWorldKit(() => {
          for (const site of sites) if (site.mesh !== null && !site.kit && !site.landmark) drop(site);
        });

  const beacons = createBeacons(sites, style);
  group.add(beacons);

  const api: Settlements = {
    group,
    sites,
    stats,
    network,
    reach: 1,
    update(eye) {
      let wanted: Site | null = null;
      let best = Infinity;
      for (const site of sites) {
        const d = eye.distanceTo(site.origin);
        if (site.mesh !== null) {
          if (d > site.radius + DROP_REACH * api.reach) drop(site);
        } else if (d < site.radius + BUILD_REACH * api.reach && d < best) {
          best = d;
          wanted = site;
        }
      }
      // Earth's frame allowance (`view.ts`): a town near the traveller is
      // built whatever the frame has spent, a far one only while the frame
      // has room.
      if (wanted !== null && frameOpenFor(0, best - wanted.radius < NEAR_BUILD)) build(wanted);
    },
    prime(eye) {
      for (const site of sites) {
        if (site.mesh === null && eye.distanceTo(site.origin) < site.radius + BUILD_REACH * api.reach) build(site);
      }
    },
    collide: walls.collide,
    blocks: walls.blocks,
    craftAt(site) {
      const known = spots.get(site.id);
      if (known !== undefined) return known;
      const out = craftSpotsOf(town, site);
      spots.set(site.id, out);
      return out;
    },
    lampsNear(point, out, max) {
      return lamps.near(sites, point, out, max);
    },
    floorAt(x, y, z) {
      return deck ? deckFloorAt(x, y, z) : null;
    },
    nearest(dir, filter) {
      let found: Site | null = null;
      let best = -2;
      for (const site of sites) {
        if (filter !== undefined && !filter(site)) continue;
        const dot = dir.dot(site.dir);
        if (dot > best) {
          best = dot;
          found = site;
        }
      }
      return found === null ? null : { site: found, angle: Math.acos(Math.min(1, Math.max(-1, best))) };
    },
    toWorld: siteToWorld,
    get glow() {
      return glowUniform.value;
    },
    set glow(value: number) {
      glowUniform.value = value;
    },
    dispose() {
      unsubscribe();
      for (const site of sites) drop(site);
      material.dispose();
      beacons.geometry.dispose();
      (beacons.material as THREE.Material).dispose();
    },
  };
  return api;
}
