/**
 * A town laid out as Earth's are (`town-grid.ts`), built: the street plan on
 * the floor, one building a plot facing its street with its yard behind it,
 * the hub, the landing pad, lamps and planters on the pavements, and a gate
 * where each main street leaves the square. Craft parked on the main streets
 * are not part of the mesh (`craft-spots.ts`).
 */

import * as THREE from 'three';
import { buildForm } from '../architecture.ts';
import { PIECES, isKitBuilding, liveryOf } from '../kit.ts';
import type { WorldKit } from '../kit.ts';
import { rngFrom } from '../../scenery/random.ts';
import { CARRIAGE_TOP } from '../roads.ts';
import type { GridPlot, GridTown } from '../town-grid.ts';
import { PALETTE } from '../../theme.ts';
import { buildPad } from './colony-build.ts';
import type { TownContext } from './context.ts';
import { circlesOf } from './layout.ts';
import { placeFurniture, placeLamps, placePlanters } from './street-furniture.ts';
import { placeModel, placePiece, placeScatter } from './placing.ts';
import { buildingPaint } from '../kit.ts';
import { drawStreets, endStreets } from './street-plan.ts';
import type { Footprint, Site } from './types.ts';

/** Whether a grid town keeps the kit's gates where its main streets leave it. Off: the pack's arch is twice a person's height and stands in front of the lens. */
const GRID_GATES = false;

export function buildGridTown(t: TownContext, kit: WorldKit | null, site: Site, town: GridTown, draft: THREE.Group, footprints: Footprint[]): void {
  const { ctx, style, deck } = t;
  const floor = site.floor;
  const half = town.grid.half;
  const accent = style.accents[0] ?? PALETTE.gold;
  // The carriageway is a cool grey that reads against any ground, the pavement pale.
  const carriage = ctx.tone(PALETTE.steel, 1.25);
  const pavement = ctx.tone(PALETTE.bone, 1.04);
  // A cloud deck's platform keeps its own floor.
  if (deck) {
    const yard = ctx.box(half * 2 + 1.2, 0.8, half * 2 + 1.2, ctx.tone(style.ground, 1.08));
    yard.position.set(0, floor - 0.8, 0);
    draft.add(yard);
  }
  drawStreets(t, site, town, draft, carriage, pavement, accent);
  endStreets(t, site, town, draft, pavement);
  placePlots(t, kit, site, town, draft, footprints);
  placeLamps(t, site, town, accent, draft, footprints);
  placeFurniture(t, site, town, accent, draft, footprints);
  placePlanters(t, kit, site, town, draft, footprints);
  if (GRID_GATES && kit !== null && town.grid.cells >= 5) placeGridGates(t, kit, site, town, draft, footprints);
}

/** One building (or pad, lot, garden) a plot. */
export function placePlots(t: TownContext, kit: WorldKit | null, site: Site, town: GridTown, draft: THREE.Group, footprints: Footprint[]): void {
  let part = 0;
  for (const plot of town.plots) {
    part++;
    if (plot.kind === 'pad') {
      buildPad(t, kit, site, { form: 'pad', x: plot.x, z: plot.z, yaw: plot.yaw, scale: 1, seed: plot.seed, room: plot.scale }, draft, footprints);
      continue;
    }
    if (plot.kind === 'lot') {
      if (kit !== null) dressLot(t, kit, site, plot, draft, footprints, part);
      continue;
    }
    if (plot.kind !== 'garden') {
      if (kit !== null && isKitBuilding(plot.form)) placeGridBuilding(t, kit, site, plot, draft, footprints, part);
      else placeGridForm(t, site, plot, draft, footprints);
    }
    if (plot.yard !== null && kit !== null) dressYard(t, kit, site, plot, draft, footprints, part);
  }
}

/** A gate where each main street leaves the square. */
export function placeGridGates(t: TownContext, kit: WorldKit, site: Site, town: GridTown, draft: THREE.Group, footprints: Footprint[]): void {
  const { spec, style } = t;
  const floor = site.floor;
  const half = town.grid.half;
    const info = PIECES.gate!;
    for (const street of town.streets) {
      if (!street.main) continue;
      const span = Math.max((street.half - street.walk) * 2 + 1.4, (spec.civilisation?.species.morph.height ?? 0) * 1.35);
      for (const end of [-1, 1]) {
        const t = end * (half - 1.2);
        const x = street.axis === 'x' ? t : street.at;
        const z = street.axis === 'x' ? street.at : t;
        const yaw = street.axis === 'x' ? Math.PI / 2 : 0;
        const livery = liveryOf(style, rngFrom('worlds', spec.id, 'gate', site.id, street.axis, end));
        const height = placePiece(kit, draft, 'gate', livery, span / (info.size[0] * info.scale), x, floor + CARRIAGE_TOP, z, yaw);
        if (height === 0) continue;
        for (const side of [-1, 1]) {
          const off = (span / 2) * 0.86 * side;
          footprints.push({ x: x + (street.axis === 'x' ? 0 : off), z: z + (street.axis === 'x' ? off : 0), radius: 0.9, height });
        }
      }
    }
}

/** A kit building on its grid plot: the module, its cradle and roof, its circles. */
export function placeGridBuilding(t: TownContext, kit: WorldKit, site: Site, plot: GridPlot, draft: THREE.Group, footprints: Footprint[], part: number): void {
  const { spec, style } = t;
  const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
  const livery = liveryOf(style, rng);
  const extra: string[] = [];
  if (plot.form === 'house-single' || plot.form === 'house-open' || plot.form === 'house-open-back') extra.push('house-single-support');
  if (plot.roof !== undefined) extra.push(plot.roof);
  const height = placePiece(kit, draft, plot.form, livery, plot.scale, plot.x, site.floor, plot.z, plot.yaw, extra);
  if (plot.kind === 'hub' && plot.form === 'base-large') {
    const info = PIECES[plot.form]!;
    const lift = (info.size[1] - 0.3) * info.scale * plot.scale;
    placeModel(kit, draft, 'roof-radar', (one, glass) => buildingPaint(one, livery, glass), PIECES['roof-radar']!.scale * plot.scale * 1.3, plot.x, site.floor + lift, plot.z, plot.yaw);
  }
  const cos = Math.cos(plot.yaw);
  const sin = Math.sin(plot.yaw);
  for (const c of circlesOf(plot.form, plot.scale, 0)) {
    footprints.push({ x: plot.x + c.x * cos + c.z * sin, z: plot.z - c.x * sin + c.z * cos, radius: c.r, height, part });
  }
}

/** A form built in code on a grid plot, while the kit is not here: fitted to the plot. */
export function placeGridForm(t: TownContext, site: Site, plot: GridPlot, draft: THREE.Group, footprints: Footprint[]): void {
  const { spec, ctx, style } = t;
  const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
  // The form the layout chose and counted; a kit module's plot drawn while
  // the kit is not here takes one of the forms instead.
  const form = style.forms.some((one) => one.item === plot.form) ? plot.form : rng.weighted(style.forms);
  const [x0, z0, x1, z1] = plot.rect;
  const room = Math.min(x1 - x0, z1 - z0) / 2 - 1;
  if (room < 2) return;
  const built = buildForm(ctx, rng, style, form, 1);
  if (built.radius > room) {
    built.group.scale.multiplyScalar(room / built.radius);
    built.radius = room;
  }
  const x = (x0 + x1) / 2;
  const z = (z0 + z1) / 2;
  built.group.position.set(x, site.floor, z);
  built.group.rotation.y = plot.yaw;
  draft.add(built.group);
  const box = new THREE.Box3().setFromObject(built.group);
  footprints.push({ x, z, radius: built.radius, height: box.max.y - site.floor });
}

/** An empty lot at the town's edge: the planet's own ground, and now and then a crate, a barrel or a tank on it. */
export function dressLot(t: TownContext, kit: WorldKit, site: Site, plot: GridPlot, draft: THREE.Group, footprints: Footprint[], part: number): void {
  const { spec, style } = t;
  const rng = rngFrom('worlds', spec.id, 'lot', plot.seed);
  if (!rng.chance(0.35)) return;
  const [x0, z0, x1, z1] = plot.rect;
  const x = x0 + (x1 - x0) * rng.range(0.25, 0.75);
  const z = z0 + (z1 - z0) * rng.range(0.25, 0.75);
  const livery = liveryOf(style, rng);
  const prop = rng.pick(['barrels', 'tank', 'generator']);
  const made = PIECES[prop] !== undefined
    ? placePiece(kit, draft, prop, livery, 0.7, x, site.floor, z, rng.range(0, Math.PI * 2))
    : placeScatter(kit, draft, prop, livery, 0.8, x, site.floor, z, rng.range(0, Math.PI * 2));
  if (made > 0) footprints.push({ x, z, radius: 1.2, height: made, part });
}

/** A yard: what a household keeps behind its house, set out in a row across it, never touching. */
export function dressYard(t: TownContext, kit: WorldKit, site: Site, plot: GridPlot, draft: THREE.Group, footprints: Footprint[], part: number): void {
  const { spec, style, smallPlants } = t;
  const [x0, z0, x1, z1] = plot.yard!;
  const rng = rngFrom('worlds', spec.id, 'yard', plot.seed);
  const livery = liveryOf(style, rng);
  const wide = x1 - x0 > z1 - z0;
  const length = wide ? x1 - x0 : z1 - z0;
  const depth = wide ? z1 - z0 : x1 - x0;
  if (depth < 2.2 || length < 2.5) return;
  const count = Math.max(1, Math.min(plot.kind === 'garden' ? 3 : 2, Math.floor(length / 3.2)));
  const gardens = smallPlants;
  for (let k = 0; k < count; k++) {
    const t = (k + 0.5) / count;
    const x = wide ? x0 + (x1 - x0) * t : (x0 + x1) / 2 + rng.range(-0.3, 0.3) * (depth - 2);
    const z = wide ? (z0 + z1) / 2 + rng.range(-0.3, 0.3) * (depth - 2) : z0 + (z1 - z0) * t;
    const roll = rng.unit();
    let made = 0;
    if (gardens.length > 0 && (roll < 0.38 || plot.kind === 'garden')) {
      made = placeScatter(kit, draft, rng.pick(gardens), null, rng.range(0.5, 0.75), x, site.floor, z, rng.range(0, Math.PI * 2));
    } else if (roll < 0.66) {
      made = placePiece(kit, draft, 'solar-ground', livery, 1, x, site.floor, z, plot.yaw + Math.PI);
    } else {
      const prop = rng.pick(['barrels', 'tank', 'generator', 'crate', 'jar']);
      made = PIECES[prop] !== undefined
        ? placePiece(kit, draft, prop, livery, 0.7, x, site.floor, z, plot.yaw + rng.range(-0.5, 0.5))
        : placeScatter(kit, draft, prop, livery, 0.8, x, site.floor, z, rng.range(0, Math.PI * 2));
    }
    if (made > 0) footprints.push({ x, z, radius: 1.2, height: made, part });
  }
}
