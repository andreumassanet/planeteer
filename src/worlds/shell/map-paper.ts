/** The maps' paper and the minimap drawn on it: the world's ground as its tiles draw it, with its towns, roads, pads and saucers over it. */

import * as THREE from 'three';
import type { WorldSpec } from '../contract.ts';
import type { Geography } from '../../system/geography.ts';
import type { PlanetSurface } from '../../planet.ts';
import type { Settlements } from '../settlements.ts';
import { outlinesOf } from '../surface.ts';
import { createWorldFeatures } from '../map-features.ts';
import { createMinimap } from '../../minimap.ts';
import type { Minimap } from '../../minimap.ts';
import { createMapTiles } from '../../map-tiles.ts';
import type { MapTiles } from '../../map-tiles.ts';
import { toUnit } from '../../sphere.ts';
import type { ShellWorld } from './types.ts';

type PadSink = { push(pad: { id: string; at: THREE.Vector3 }): unknown };

export interface MapPaper {
  mapTiles: MapTiles;
  minimap: Minimap;
  /** The pads within `radius` of `direction`: a few hundred a world, all known at once. */
  padsNear(direction: THREE.Vector3, radius: number, out: PadSink): boolean;
  /** Takes the disc's canvas off the page, and its holder if the shell made it. */
  release(): void;
}

export function createMapPaper(world: ShellWorld, deps: { spec: WorldSpec; geography: Geography; surface: PlanetSurface; settlements: Settlements; political: Geography['world']; radius: number }): MapPaper {
  const { spec, geography, surface, settlements, political, radius: R } = deps;
  const mapTiles = createMapTiles({
    world: political,
    surface,
    features: createWorldFeatures({
      spec,
      settlements,
      roads: () => world.roadRibbons(),
      pads: () => world.pads,
      saucers: () => world.saucers,
    }),
    // Headless (`check-worlds.ts`) there is no `import.meta.env`, and nothing to fetch.
    ...(import.meta.env === undefined ? {} : { baked: `${import.meta.env.BASE_URL}maps/${spec.id}/` }),
  });
  const padsNear = (direction: THREE.Vector3, radius: number, out: PadSink): boolean => {
    const cos = Math.cos(radius / R);
    for (const pad of world.pads) if (pad.at.dot(direction) >= cos) out.push(pad);
    return true;
  };
  // Over the nations' outlines joined back along their cuts (`outlinesOf`):
  // the disc inks the outline of the nation you stand in.
  const minimap = createMinimap(outlinesOf(geography), {
    surface,
    tiles: mapTiles,
    pads: padsNear,
    places: geography.places,
    // The roads between the towns, as the disc traces them: unit vectors.
    roads: () =>
      world.roadLines().map((line) => {
        const out = new Float32Array(line.points.length * 3);
        line.points.forEach(([lat, lon], k) => toUnit(lat, lon, out, k * 3));
        return out;
      }),
  });
  let holder = document.getElementById('minimap');
  const ownHolder = holder === null;
  if (holder === null) {
    holder = document.createElement('div');
    holder.id = 'minimap';
    document.body.appendChild(holder);
  }
  holder.appendChild(minimap.canvas);
  return {
    mapTiles,
    minimap,
    padsNear,
    release() {
      minimap.canvas.remove();
      if (ownHolder) holder.remove();
    },
  };
}
