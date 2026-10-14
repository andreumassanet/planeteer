/** What a landmark stands in: a paved plaza with a ring of lamps, benches, an information post, flags and planters. */

import * as THREE from 'three';
import type { WorldKit } from '../kit.ts';
import { rngFrom } from '../../scenery/random.ts';
import { PALETTE } from '../../theme.ts';
import type { TownContext } from './context.ts';
import { placeScatter } from './placing.ts';
import { bench, gridLamp } from './street-furniture.ts';
import type { Site } from './types.ts';

/**
 * Builds the plaza round a landmark, as Earth's `plazas` landmarks stand in a
 * paved square of their own: a kerb round the paving and a lighter walk inside
 * it, a ring of lamps facing in, benches between them, an information post and
 * two flags at the way in, and planters where the civilisation keeps gardens.
 * Everything stands in the outer fifth of the paving, clear of the landmark's
 * own `radius * 0.6`. Returns the lamps, in the site's frame.
 */
export function buildSetting(t: TownContext, kit: WorldKit | null, site: Site, draft: THREE.Group): { x: number; z: number; yaw: number }[] {
  const { spec, ctx, style } = t;
  const rng = rngFrom('worlds', spec.id, 'setting', site.id);
  const floor = site.floor;
  const edge = site.paving;
  const ground = style.ground;
  const accent = rng.pick(style.accents);
  const wall = rng.pick(style.walls);
  // The slab under a landmark is laid 0.05 proud of the floor.
  const top = floor + 0.05;
  const kerb = ctx.ringWall(edge - 0.7, edge, 0.75, ctx.tone(ground, 0.78), 48);
  kerb.position.y = top - 0.6;
  draft.add(kerb);
  const walk = ctx.ringWall(edge * 0.7, edge * 0.7 + Math.max(2.4, edge * 0.08), 0.5, ctx.tone(ground, 1.16), 48);
  walk.position.y = top - 0.5 + 0.08;
  draft.add(walk);
  const lampsAt: { x: number; z: number; yaw: number }[] = [];
  const ring = edge * 0.9;
  const count = Math.max(6, Math.min(16, Math.round((ring * Math.PI * 2) / 16)));
  const turn = rng.range(0, Math.PI * 2);
  const way = turn + Math.PI / count;
  for (let k = 0; k < count; k++) {
    const a = turn + (k / count) * Math.PI * 2;
    const x = Math.sin(a) * ring;
    const z = Math.cos(a) * ring;
    // The arm over the walk, towards the landmark.
    const yaw = a + Math.PI;
    const lamp = gridLamp(t, accent);
    lamp.position.set(x, top, z);
    lamp.rotation.y = yaw;
    draft.add(lamp);
    lampsAt.push({ x, z, yaw });
    // A bench in every other gap, looking in; the gap at the way in is kept clear.
    if (k % 2 === 1 && k !== 0) {
      const b = a + Math.PI / count;
      draft.add(bench(t, Math.sin(b) * edge * 0.82, top, Math.cos(b) * edge * 0.82, b + Math.PI, wall));
    }
  }
  // The way in: an information post between two flags.
  const ix = Math.sin(way) * edge * 0.86;
  const iz = Math.cos(way) * edge * 0.86;
  const post = new THREE.Group();
  const stand = ctx.box(0.5, 1.5, 0.5, ctx.tone(PALETTE.steel, 1.05));
  post.add(stand);
  const board = ctx.box(1.9, 1.2, 0.22, wall);
  board.position.set(0, 1.4, 0);
  board.rotation.x = -0.35;
  post.add(board);
  const face = ctx.lit(ctx.box(1.6, 0.9, 0.1, accent), 0.6);
  face.position.set(0, 1.55, -0.13);
  face.rotation.x = -0.35;
  post.add(face);
  post.position.set(ix, top, iz);
  post.rotation.y = way + Math.PI;
  draft.add(post);
  for (const side of [-1, 1]) {
    const fx = ix + Math.cos(way) * side * 4.5;
    const fz = iz - Math.sin(way) * side * 4.5;
    const pole = ctx.column(0.1, 7.5, ctx.tone(PALETTE.steel, 1.15), 5);
    pole.position.set(fx, top, fz);
    draft.add(pole);
    // Flying outwards along the kerb from its pole.
    const banner = ctx.box(0.08, 1.4, 2.3, side < 0 ? accent : wall);
    banner.position.set(fx + Math.cos(way) * side * 1.2, top + 6.4, fz - Math.sin(way) * side * 1.2);
    banner.rotation.y = way + Math.PI / 2;
    draft.add(banner);
    const finial = ctx.lit(ctx.column(0.2, 0.3, accent, 6), 0.8);
    finial.position.set(fx, top + 7.5, fz);
    draft.add(finial);
  }
  // Planters of the civilisation's gardens, opposite the way in.
  const gardens = style.colony?.gardens ?? [];
  if (kit !== null && gardens.length > 0) {
    for (let k = 0; k < 4; k++) {
      const a = way + Math.PI + (k - 1.5) * (Math.PI / count) * 1.1;
      const x = Math.sin(a) * edge * 0.78;
      const z = Math.cos(a) * edge * 0.78;
      const box = ctx.ringWall(0.9, 1.25, 0.8, ctx.tone(wall, 0.9), 8);
      box.position.set(x, top, z);
      draft.add(box);
      placeScatter(kit, draft, rng.pick(gardens), null, rng.range(0.45, 0.6), x, top + 0.5, z, rng.range(0, Math.PI * 2));
    }
  }
  return lampsAt;
}
