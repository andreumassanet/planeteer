/**
 * The Explorers' Guild's square in a grid town of another world, built on
 * Earth's layout (`guildLayout`, through `town-grid/guild.ts`) out of the
 * world's own things: the hall is the colony's hub module from the space kit
 * under a porch in the civilisation's walls, the lamps and benches are the
 * town's, the planters grow its gardens, and the fountain, the stalls, the
 * boards, the poles and the map table are drawn in its colours. Its walls go
 * among the town's footprints, measured off Earth's own (`guildSolids`), so a
 * body meets the same square it sees.
 */

import * as THREE from 'three';
import { PLANET_RADIUS } from '../../globe.ts';
import { BOARD_DEPTH, PLANTER_RADIUS, POLE_HEIGHT, PORCH_HEIGHT, COLUMN_RADIUS, STALL_DEPTH, STALL_HALF, columnsOf, guildSolids } from '../../guild/square.ts';
import type { GuildLayout } from '../../guild/square.ts';
import { GROUND_LIFT } from '../../scenery/ground.ts';
import { rngFrom } from '../../scenery/random.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { PALETTE } from '../../theme.ts';
import { PIECES, liveryOf } from '../kit.ts';
import type { WorldKit } from '../kit.ts';
import type { WorldGuild } from '../town-grid.ts';
import type { TownContext } from './context.ts';
import { placePiece, placeScatter } from './placing.ts';
import { LAMP_HEIGHT } from './lamp-lights.ts';
import { bench, gridLamp } from './street-furniture.ts';
import type { Footprint, Site } from './types.ts';

/** A body-metre, as the layout counts them. */
const M = AVATAR_HEIGHT / 1.75;
/** How far the square's paving stands proud of the town's floor: a landmark plaza's slab. */
export const GUILD_PAVE = 0.05;
/** The hall's body when the kit is not here: how tall it is drawn in code. */
const STAND_IN_HEIGHT = 3.2 * M;
/** A stall's counter, over the paving. */
const COUNTER = 0.9 * M;
/** The wings either side of the kit's hub. */
const WING_HEIGHT = 2.4 * M;

/** The square's walls as the town's footprints: a disc as one circle, a box as a row of them down its long side. */
function footprintsOf(layout: GuildLayout, hallHeight: number): Footprint[] {
  const floor = PLANET_RADIUS + layout.parcel.level + GROUND_LIFT;
  const out: Footprint[] = [];
  let part = 9000;
  for (const { solid } of guildSolids(layout, { hall: hallHeight })) {
    const height = Math.max(0.3, solid.top - floor);
    part++;
    if (solid.round) {
      out.push({ x: solid.x, z: solid.z, radius: solid.hx, height });
      continue;
    }
    const long = Math.max(solid.hx, solid.hz);
    const short = Math.max(0.12, Math.min(solid.hx, solid.hz));
    // As many as fit end to end without one standing inside the next, as `circlesOf` lays a building's.
    const n = Math.max(1, Math.min(12, Math.floor(long / short)));
    // The long axis: the first when `hx` is the longer, else the second.
    const [ax, az] = solid.hx >= solid.hz ? [solid.cos, solid.sin] : [-solid.sin, solid.cos];
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * (long - short);
      out.push({ x: solid.x + ax * t, z: solid.z + az * t, radius: short, height, part });
    }
  }
  return out;
}

/** The hall: the colony's hub from the kit, fitted to the layout's body, or a block in the walls' colour while the kit is away. */
function buildHall(t: TownContext, kit: WorldKit | null, layout: GuildLayout, top: number, draft: THREE.Group, wall: number, accent: number): number {
  const { ctx, style, spec } = t;
  const { hall } = layout;
  const fx = Math.sin(hall.yaw);
  const fz = Math.cos(hall.yaw);
  const bx = hall.x - fx * hall.depth / 2;
  const bz = hall.z - fz * hall.depth / 2;
  const id = t.colony?.centre ?? 'geodesic-dome';
  const info = PIECES[id];
  let height = 0;
  if (kit !== null && info !== undefined) {
    const fit = Math.min(hall.width / (info.size[0] * info.scale), hall.depth / (info.size[2] * info.scale));
    height = placePiece(kit, draft, id, liveryOf(style, rngFrom('worlds', spec.id, 'guild-hall', layout.parcel.c0, layout.parcel.r0)), fit, bx, top, bz, hall.yaw);
    // Where the hub is narrower than the hall, a wing in the walls' colour either side of it.
    const wing = (hall.width - info.size[0] * info.scale * fit) / 2;
    if (height > 0 && wing > 1) {
      const wings = new THREE.Group();
      for (const side of [-1, 1]) {
        const block = ctx.box(wing + 0.4, WING_HEIGHT, hall.depth * 0.8, ctx.tone(wall, 0.96));
        block.position.set(side * (hall.width / 2 - (wing + 0.4) / 2), 0, -hall.depth * 0.1);
        wings.add(block);
        const eave = ctx.box(wing + 0.7, 0.3, hall.depth * 0.8 + 0.3, ctx.tone(wall, 0.8));
        eave.position.set(side * (hall.width / 2 - (wing + 0.4) / 2), WING_HEIGHT, -hall.depth * 0.1);
        wings.add(eave);
        const pane = ctx.lit(ctx.box(Math.max(0.6, wing * 0.55), 1.1, 0.1, ctx.tone(PALETTE.slate, 1.3)), 0.6);
        pane.position.set(side * (hall.width / 2 - (wing + 0.4) / 2), WING_HEIGHT * 0.45, hall.depth * 0.3 + 0.05 + 0.04);
        wings.add(pane);
      }
      wings.position.set(bx, top, bz);
      wings.rotation.y = hall.yaw;
      draft.add(wings);
    }
  }
  if (height === 0) {
    const block = new THREE.Group();
    block.add(ctx.box(hall.width, STAND_IN_HEIGHT, hall.depth, wall));
    const band = ctx.box(hall.width + 0.3, 0.45, hall.depth + 0.3, ctx.tone(wall, 0.82));
    band.position.y = STAND_IN_HEIGHT;
    block.add(band);
    block.position.set(bx, top, bz);
    block.rotation.y = hall.yaw;
    draft.add(block);
    height = STAND_IN_HEIGHT + 0.45;
  }
  // The porch before its door: columns, a roof, and the guild's sign over the way in.
  for (const [x, z] of columnsOf(layout)) {
    const column = ctx.column(COLUMN_RADIUS, PORCH_HEIGHT, ctx.tone(wall, 1.08), 8);
    column.position.set(x, top, z);
    draft.add(column);
  }
  const porch = new THREE.Group();
  const roof = ctx.box(hall.width, 0.35, hall.porch + 0.2, ctx.tone(wall, 0.9));
  roof.position.set(0, PORCH_HEIGHT, hall.porch / 2 - 0.1);
  porch.add(roof);
  const sign = ctx.lit(ctx.box(Math.min(hall.width * 0.5, 7), 0.75, 0.14, accent), 0.7);
  sign.position.set(0, PORCH_HEIGHT + 0.35, hall.porch + 0.02);
  porch.add(sign);
  porch.position.set(hall.x, top, hall.z);
  porch.rotation.y = hall.yaw;
  draft.add(porch);
  return Math.max(height, PORCH_HEIGHT + 1.1);
}

/** The fountain on the hall's axis, and the compass rose laid round it. */
function buildFountain(t: TownContext, layout: GuildLayout, top: number, draft: THREE.Group, wall: number, accent: number): void {
  const { ctx } = t;
  const { x, z, radius, rose } = layout.fountain;
  const ring = ctx.ringWall(radius + 0.7, rose, 0.12, ctx.tone(accent, 0.75), 32);
  ring.position.set(x, top - 0.04, z);
  draft.add(ring);
  const basin = ctx.ringWall(radius - 0.4, radius, 0.85, ctx.tone(wall, 0.95), 24);
  basin.position.set(x, top, z);
  draft.add(basin);
  const water = ctx.lit(ctx.column(radius - 0.4, 0.6, PALETTE.skyBlue, 24), 0.25);
  water.position.set(x, top, z);
  draft.add(water);
  const spout = ctx.column(0.4, 2.4, ctx.tone(wall, 1.1), 8);
  spout.position.set(x, top, z);
  draft.add(spout);
  const crown = ctx.lit(ctx.taper(0.75, 0.2, 0.6, accent, 8), 0.6);
  crown.position.set(x, top + 2.4, z);
  draft.add(crown);
}

/** The stalls: a counter, four posts and an awning in the accent; something of the kit on the counter. */
function buildStalls(t: TownContext, kit: WorldKit | null, layout: GuildLayout, top: number, draft: THREE.Group, wall: number, accent: number): void {
  const { ctx, spec, style } = t;
  const steel = ctx.tone(PALETTE.steel, 1.05);
  layout.stalls.forEach((stall, k) => {
    const g = new THREE.Group();
    g.add(ctx.box(STALL_HALF * 2, COUNTER, STALL_DEPTH * 2, ctx.tone(wall, 0.85)));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const post = ctx.column(0.07, 2.2 * M, steel, 5);
      post.position.set(sx * (STALL_HALF - 0.12), 0, sz * (STALL_DEPTH - 0.1));
      g.add(post);
    }
    const awning = ctx.box(STALL_HALF * 2 + 0.3, 0.14, STALL_DEPTH * 2 + 0.6, k % 2 === 0 ? accent : ctx.tone(wall, 1.1));
    awning.position.set(0, 2.2 * M, 0.15);
    g.add(awning);
    g.position.set(stall.x, top, stall.z);
    g.rotation.y = stall.yaw;
    draft.add(g);
    if (kit === null) return;
    const rng = rngFrom('worlds', spec.id, 'guild-stall', stall.x.toFixed(1), stall.z.toFixed(1));
    const prop = rng.pick(['crate', 'jar', 'barrels']);
    const y = top + COUNTER;
    if (PIECES[prop] !== undefined) placePiece(kit, draft, prop, liveryOf(style, rng), 0.35, stall.x, y, stall.z, stall.yaw);
    else placeScatter(kit, draft, prop, liveryOf(style, rng), 0.45, stall.x, y, stall.z, stall.yaw);
  });
}

/** The noticeboard and the Hall of Fame: a frame on two posts, the notices' face lit; the Hall's face is painted near (`explorers/fame-boards.ts`). */
function buildBoards(t: TownContext, layout: GuildLayout, top: number, draft: THREE.Group, wall: number): void {
  const { ctx } = t;
  const frameColour = ctx.tone(wall, 0.7);
  for (const board of layout.boards) {
    const g = new THREE.Group();
    const bottom = board.lift - board.height / 2 - 0.15;
    for (const side of [-1, 1]) {
      const post = ctx.box(0.16, bottom + 0.05, 0.16, frameColour);
      post.position.set(side * (board.width / 2 + 0.05), 0, 0);
      g.add(post);
    }
    const frame = ctx.box(board.width + 0.3, board.height + 0.3, BOARD_DEPTH, frameColour);
    frame.position.set(0, bottom, 0);
    g.add(frame);
    if (board.kind === 'jobs') {
      // Proud of the frame by `PROUD`, so the pen draws its edge.
      const face = ctx.lit(ctx.box(board.width, board.height, 0.16, PALETTE.cream), 0.35);
      face.position.set(0, bottom + 0.15, BOARD_DEPTH / 2);
      g.add(face);
    }
    g.position.set(board.x, top, board.z);
    g.rotation.y = board.yaw;
    draft.add(g);
  }
}

/** The two poles at the front, each with a banner: the guild's gold, and the town's accent. */
function buildPoles(t: TownContext, layout: GuildLayout, top: number, draft: THREE.Group, accent: number): void {
  const { ctx } = t;
  layout.flags.forEach((pole, k) => {
    const g = new THREE.Group();
    g.add(ctx.column(0.1, POLE_HEIGHT, ctx.tone(PALETTE.steel, 1.15), 6));
    const banner = ctx.box(1.3, 2.2, 0.08, k === 1 ? PALETTE.gold : accent);
    banner.position.set(0.75, POLE_HEIGHT - 2.5, 0);
    g.add(banner);
    const finial = ctx.lit(ctx.column(0.18, 0.3, accent, 6), 0.8);
    finial.position.y = POLE_HEIGHT;
    g.add(finial);
    g.position.set(pole.x, top, pole.z);
    g.rotation.y = pole.yaw;
    draft.add(g);
  });
}

/** The lamps, benches, planters, signpost and map table. */
function buildFurniture(t: TownContext, kit: WorldKit | null, layout: GuildLayout, top: number, draft: THREE.Group, wall: number, accent: number): void {
  const { ctx, spec, smallPlants } = t;
  // Earth's lamp reaches in along its -Z; this lamp's arm is its +Z.
  for (const lamp of layout.lamps) {
    const post = gridLamp(t, accent);
    post.position.set(lamp.x, top, lamp.z);
    post.rotation.y = lamp.yaw + Math.PI;
    draft.add(post);
  }
  for (const seat of layout.benches) draft.add(bench(t, seat.x, top, seat.z, seat.yaw, wall));
  layout.planters.forEach((planter, k) => {
    const bed = ctx.ringWall(PLANTER_RADIUS - 0.18, PLANTER_RADIUS, 0.5 * M, ctx.tone(wall, 0.9), 16);
    bed.position.set(planter.x, top, planter.z);
    draft.add(bed);
    const soil = ctx.column(PLANTER_RADIUS - 0.18, 0.4 * M, ctx.tone(PALETTE.brown, 0.8), 16);
    soil.position.set(planter.x, top, planter.z);
    draft.add(soil);
    if (kit !== null && smallPlants.length > 0) {
      const rng = rngFrom('worlds', spec.id, 'guild-planter', k);
      placeScatter(kit, draft, rng.pick(smallPlants), null, rng.range(0.45, 0.6), planter.x, top + 0.4 * M, planter.z, rng.range(0, Math.PI * 2));
    }
  });
  if (layout.signpost !== null) {
    const g = new THREE.Group();
    g.add(ctx.column(0.09, 1.4 * M, ctx.tone(PALETTE.steel, 1.15), 5));
    for (const [k, colour] of [[0, accent], [1, PALETTE.gold]] as const) {
      const arrow = ctx.box(1.4, 0.3, 0.08, colour);
      arrow.position.set((k === 0 ? 1 : -1) * 0.55, 1.4 * M - 0.35 - k * 0.42, 0);
      arrow.rotation.y = k * 0.6;
      g.add(arrow);
    }
    g.position.set(layout.signpost.x, top, layout.signpost.z);
    g.rotation.y = layout.signpost.yaw;
    draft.add(g);
  }
  if (layout.table !== null) {
    const g = new THREE.Group();
    g.add(ctx.box(STALL_HALF * 1.5, 0.5 * M - 0.1, STALL_DEPTH * 1.6, ctx.tone(wall, 0.8)));
    const map = ctx.lit(ctx.box(STALL_HALF * 1.35, 0.1, STALL_DEPTH * 1.4, PALETTE.skyBlue), 0.5);
    map.position.y = 0.5 * M - 0.1;
    g.add(map);
    g.position.set(layout.table.x, top, layout.table.z);
    g.rotation.y = layout.table.yaw;
    draft.add(g);
  }
}

/** The square, into the town's draft and its footprints. */
export function buildWorldGuild(t: TownContext, kit: WorldKit | null, site: Site, guild: WorldGuild, draft: THREE.Group, footprints: Footprint[]): void {
  const { ctx, style } = t;
  const { layout } = guild;
  const top = site.floor + GUILD_PAVE;
  const wall = style.walls[0] ?? PALETTE.cream;
  const accent = style.accents[0] ?? PALETTE.gold;
  const [x0, z0, x1, z1] = guild.paving;
  const paving = ctx.box(x1 - x0, 0.35, z1 - z0, ctx.tone(PALETTE.bone, 0.9));
  paving.position.set((x0 + x1) / 2, top - 0.35, (z0 + z1) / 2);
  draft.add(paving);
  const hallHeight = buildHall(t, kit, layout, top, draft, wall, accent);
  buildFountain(t, layout, top, draft, wall, accent);
  buildStalls(t, kit, layout, top, draft, wall, accent);
  buildBoards(t, layout, top, draft, wall);
  buildPoles(t, layout, top, draft, accent);
  buildFurniture(t, kit, layout, top, draft, wall, accent);
  footprints.push(...footprintsOf(layout, hallHeight));
  // The benches and the lamps are the town's own, and carry their own.
  for (const seat of layout.benches) {
    for (const side of [-1, 1]) footprints.push({ x: seat.x + Math.cos(seat.yaw) * side * 0.75, z: seat.z - Math.sin(seat.yaw) * side * 0.75, radius: 0.55, height: 1.3 });
  }
  for (const lamp of layout.lamps) footprints.push({ x: lamp.x, z: lamp.z, radius: 0.35, height: LAMP_HEIGHT });
}
