/** What stands on a grid town's pavements: lamps, benches, bins, vending machines, signposts and planters. */

import * as THREE from 'three';
import type { GridTown } from '../town-grid.ts';
import { CARRIAGE_TOP } from '../roads.ts';
import type { WorldKit } from '../kit.ts';
import { rngFrom } from '../../scenery/random.ts';
import { PALETTE } from '../../theme.ts';
import type { TownContext } from './context.ts';
import { LAMP_HEIGHT } from './lamp-lights.ts';
import { placeScatter } from './placing.ts';
import { KERB_TOP } from './street-plan.ts';
import type { Footprint, Site } from './types.ts';

/** A street lamp: a slim post, an arm over the kerb and a lantern in the accent colour that glows after dark. */
export function gridLamp(t: TownContext, accent: number): THREE.Group {
  const { ctx } = t;
  const lamp = new THREE.Group();
  const steel = ctx.tone(PALETTE.steel, 1.1);
  const foot = ctx.column(0.32, 0.35, steel, 6);
  lamp.add(foot);
  const post = ctx.column(0.13, LAMP_HEIGHT - 0.3, steel, 5);
  lamp.add(post);
  const arm = ctx.box(0.18, 0.18, 1.3, steel);
  arm.position.set(0, LAMP_HEIGHT - 0.4, 0.6);
  lamp.add(arm);
  const lantern = ctx.lit(ctx.taper(0.42, 0.22, 0.42, accent, 6));
  lantern.rotation.x = Math.PI;
  lantern.position.set(0, LAMP_HEIGHT - 0.22, 1.15);
  lamp.add(lantern);
  return lamp;
}

/** A bench looking along +Z: a seat on two feet, a back behind it. */
export function bench(t: TownContext, x: number, y: number, z: number, yaw: number, color: number): THREE.Group {
  const { ctx } = t;
  const g = new THREE.Group();
  const steel = ctx.tone(PALETTE.steel, 0.95);
  for (const side of [-1, 1]) {
    const foot = ctx.box(0.16, 0.7, 0.6, steel);
    foot.position.set(side * 1.05, 0, 0);
    g.add(foot);
  }
  const seat = ctx.box(2.5, 0.16, 0.75, color);
  seat.position.y = 0.7;
  g.add(seat);
  const back = ctx.box(2.5, 0.6, 0.14, ctx.tone(color, 0.9));
  back.position.set(0, 0.95, -0.38);
  g.add(back);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return g;
}

/** The lamps along the carriageway's edge, one footprint each. */
export function placeLamps(t: TownContext, site: Site, town: GridTown, accent: number, draft: THREE.Group, footprints: Footprint[]): void {
  const floor = site.floor;
  for (const lamp of town.lamps) {
    const post = gridLamp(t, accent);
    // On the carriageway's edge, against the kerb.
    post.position.set(lamp.x, floor + CARRIAGE_TOP, lamp.z);
    post.rotation.y = lamp.yaw;
    draft.add(post);
    footprints.push({ x: lamp.x, z: lamp.z, radius: 0.35, height: LAMP_HEIGHT });
  }
}

/** Between the lamps: benches, bins, vending machines and signposts. */
export function placeFurniture(t: TownContext, site: Site, town: GridTown, accent: number, draft: THREE.Group, footprints: Footprint[]): void {
  const { ctx, style } = t;
  const floor = site.floor;
  for (const one of town.furniture) {
    const y = floor + KERB_TOP;
    let piece: THREE.Object3D;
    let radius = 0.4;
    let height = 1;
    switch (one.kind) {
      case 'bench':
        piece = bench(t, 0, 0, 0, 0, style.walls[1] ?? style.walls[0] ?? PALETTE.cream);
        radius = 0.9;
        break;
      case 'bin': {
        const g = new THREE.Group();
        g.add(ctx.column(0.32, 0.95, ctx.tone(PALETTE.steel, 1.1), 7));
        const lid = ctx.taper(0.38, 0.22, 0.18, accent, 7);
        lid.position.y = 0.95;
        g.add(lid);
        piece = g;
        radius = 0.35;
        break;
      }
      case 'vending': {
        const g = new THREE.Group();
        g.add(ctx.box(1.05, 2.1, 0.75, accent));
        const panel = ctx.lit(ctx.box(0.75, 1.3, 0.1, PALETTE.skyBlue), 0.7);
        panel.position.set(-0.08, 0.55, 0.36);
        g.add(panel);
        const slot = ctx.box(0.16, 0.5, 0.1, ctx.tone(PALETTE.steel, 0.8));
        slot.position.set(0.38, 0.8, 0.36);
        g.add(slot);
        piece = g;
        radius = 0.65;
        height = 2.1;
        break;
      }
      case 'sign': {
        const g = new THREE.Group();
        g.add(ctx.column(0.08, 3, ctx.tone(PALETTE.steel, 1.15), 5));
        for (const [k, colour] of [[0, accent], [1, style.walls[0] ?? PALETTE.cream]] as const) {
          const arrow = ctx.box(1.5, 0.32, 0.08, colour);
          arrow.position.set((k === 0 ? 1 : -1) * 0.6, 2.5 - k * 0.45, 0);
          arrow.rotation.y = k * 0.5;
          g.add(arrow);
        }
        piece = g;
        radius = 0.2;
        height = 3;
        break;
      }
    }
    piece.position.set(one.x, y, one.z);
    piece.rotation.y = one.yaw;
    draft.add(piece);
    footprints.push({ x: one.x, z: one.z, radius, height });
  }
}

/** Planters on the pavements, with a small plant in each where the kit is loaded. */
export function placePlanters(t: TownContext, kit: WorldKit | null, site: Site, town: GridTown, draft: THREE.Group, footprints: Footprint[]): void {
  const { spec, ctx, style, smallPlants } = t;
  const floor = site.floor;
  const gardens = smallPlants;
  town.planters.forEach((spot, k) => {
    const rng = rngFrom('worlds', spec.id, 'planter', site.id, k);
    const box = ctx.box(1.5, 0.75, 1.5, ctx.tone(style.walls[0] ?? PALETTE.cream, 0.92));
    box.position.set(spot.x, floor + KERB_TOP, spot.z);
    draft.add(box);
    let grown = 0;
    if (kit !== null && gardens.length > 0) grown = placeScatter(kit, draft, rng.pick(gardens), null, rng.range(0.32, 0.45), spot.x, floor + KERB_TOP + 0.75, spot.z, rng.range(0, Math.PI * 2));
    footprints.push({ x: spot.x, z: spot.z, radius: 0.95, height: 0.75 + grown });
  });
}
