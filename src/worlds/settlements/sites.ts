/** The sites of a world: every settlement and landmark placed on the sphere, in its own frame, with its plan. */

import * as THREE from 'three';
import type { ArchitectureStyle, ColonyStyle, WorldSpec } from '../contract.ts';
import { townRadii } from '../../system/contract.ts';
import type { Terrain } from '../terrain.ts';
import { buildForm } from '../architecture.ts';
import type { SceneryContext } from '../../scenery/contract.ts';
import { rngFrom } from '../../scenery/random.ts';
import { toUnit } from '../../sphere.ts';
import { gridTownOf } from '../town-grid.ts';
import { frameAt, layoutOf } from './layout.ts';
import { PLATFORM_LIFT } from './types.ts';
import type { Site } from './types.ts';

/** What each of the civilisation's own forms costs, triangles: the grid towns' budget spends it. */
function formCostsOf(spec: WorldSpec, ctx: SceneryContext, style: ArchitectureStyle): Map<string, number> {
  const formCost = new Map<string, number>();
  for (const { item } of style.forms) {
    const built = buildForm(ctx, rngFrom('worlds', spec.id, 'cost', item), style, item, 1);
    let triangles = 0;
    built.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
      mesh.geometry.dispose();
    });
    formCost.set(item, Math.round(triangles));
  }
  return formCost;
}

export function createSites(deps: {
  spec: WorldSpec;
  terrain: Terrain;
  ctx: SceneryContext;
  style: ArchitectureStyle;
  colony: ColonyStyle | undefined;
  deck: boolean;
  avenueHalf: number;
}): Site[] {
  const { spec, terrain, ctx, style, colony, deck, avenueHalf } = deps;
  const body = spec.body;
  const R = terrain.radius;
  const padOf = new Map(terrain.pads.map((pad) => [pad.id, pad]));
  const formCost = formCostsOf(spec, ctx, style);
  const unit = [0, 0, 0];
  const sites: Site[] = [];
  const addSite = (id: string, name: string, nation: string, population: number, lat: number, lon: number, radius: number, landmark: boolean): void => {
    toUnit(lat, lon, unit);
    const dir = new THREE.Vector3(unit[0], unit[1], unit[2]);
    const pad = padOf.get(id);
    const height = pad?.height ?? terrain.heightAt(dir.x, dir.y, dir.z);
    const town = !landmark && colony !== undefined ? gridTownOf(spec, id, radius, population, formCost) : null;
    const laid = town === null ? layoutOf(spec, id, radius, landmark) : null;
    // A grid town's streets run the four ways from its middle, and its
    // "square" is the crossing there.
    const plaza = town === null ? laid!.plaza : town.grid.pitch * 0.5;
    const avenues = town === null ? laid!.avenues : [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    const paving = town === null ? laid!.paving : radius * 0.96;
    sites.push({
      id,
      name,
      nation,
      population,
      radius,
      paving,
      plaza,
      avenues,
      avenueHalf,
      dir,
      origin: dir.clone().multiplyScalar(R + height),
      quaternion: frameAt(dir, new THREE.Quaternion()),
      floor: deck ? PLATFORM_LIFT : 0,
      landmark,
      footprints: [],
      port: null,
      mesh: null,
      kit: false,
      town,
    });
  };
  for (const place of body.settlements) {
    addSite(place.id, place.name, place.nation, place.population, place.lat, place.lon, townRadii(body, spec.landmarks).get(place.id)!, false);
  }
  for (const mark of spec.landmarks) addSite(mark.id, mark.name, '', 0, mark.lat, mark.lon, mark.radius, true);
  return sites;
}
