/**
 * The towns that are not grid towns: a colony's rows of kit modules with their
 * yards, tubes, hub, landing pad and gates, or the disc of code-built forms
 * for a civilisation without a kit colony. Also a town's base floor.
 */

import * as THREE from 'three';
import { buildForm } from '../architecture.ts';
import { PIECES, buildingPaint, isKitBuilding, liveryOf } from '../kit.ts';
import type { WorldKit } from '../kit.ts';
import { rngFrom } from '../../scenery/random.ts';
import type { TownContext } from './context.ts';
import { GUESS, HAMLET, PAD_RADIUS, YARD, circlesOf, layoutOf, pieceRadius } from './layout.ts';
import { pieceMesh, placeModel, placePiece, placeScatter } from './placing.ts';
import { PLATFORM_LIFT } from './types.ts';
import type { Footprint, Plot, Site } from './types.ts';

/** The floor under a town: a platform on a cloud deck, else paving flush with the levelled ground. */
export function layBase(t: TownContext, site: Site, draft: THREE.Group): void {
  const { ctx, style, colony, deck } = t;
  const floor = site.floor;
  if (deck) {
    const platform = ctx.column(site.paving + 2, PLATFORM_LIFT + 1.2, style.ground, 28);
    platform.position.y = -1.2;
    draft.add(platform);
    const keel = ctx.taper(site.paving * 0.2, site.paving * 0.9, 5, ctx.tone(style.ground, 0.8), 14);
    keel.rotation.x = Math.PI;
    keel.position.y = -1.2;
    draft.add(keel);
  } else if (site.town === null) {
    const paving = ctx.column(site.paving, 0.45, style.ground, 28);
    paving.position.y = -0.4;
    draft.add(paving);
    if (!site.landmark) {
      const square = ctx.column(site.plaza, 0.45, ctx.tone(style.ground, 1.12), 20);
      square.position.y = -0.38;
      draft.add(square);
    }
  }
  if (!site.landmark && colony !== undefined && site.town === null) {
    // The avenues paved a shade darker, so the street plan reads from above.
    for (const a of site.avenues) {
      const length = site.paving - site.plaza;
      const lane = ctx.box(site.avenueHalf * 2, 0.45, length, ctx.tone(style.ground, 0.88));
      lane.position.set(Math.sin(a) * (site.plaza + length / 2), floor - 0.36, Math.cos(a) * (site.plaza + length / 2));
      lane.rotation.y = a;
      draft.add(lane);
    }
  }
}

/** A town that is not a grid town: its plots by the layout, each built from the kit or in code. */
export function buildDisc(t: TownContext, kit: WorldKit | null, site: Site, draft: THREE.Group, footprints: Footprint[]): void {
  const { spec } = t;
  const { plots } = layoutOf(spec, site.id, site.radius, false);
  plots.forEach((plot, k) => {
    if (k === 0 && kit !== null && isKitBuilding(plot.form)) {
      buildHub(t, kit, site, plot, draft, footprints);
      return;
    }
    if (plot.form === 'pad') {
      buildPad(t, kit, site, plot, draft, footprints);
      return;
    }
    if (kit !== null && isKitBuilding(plot.form)) {
      buildKitPlot(t, kit, site, plot, draft, footprints, k);
      return;
    }
    buildStandIn(t, site, plot, k, draft, footprints);
  });
  if (kit !== null) {
    buildTubes(t, kit, site, plots, draft, footprints);
    buildGates(t, kit, site, draft, footprints);
  }
}

/**
 * A form of the civilisation's own built in code, or the stand-in for a kit
 * module while the kit is not here. Dropped when it turns out to reach into an
 * avenue or a building already standing: the streets are the walkers' only
 * routes.
 */
export function buildStandIn(t: TownContext, site: Site, plot: Plot, k: number, draft: THREE.Group, footprints: Footprint[]): void {
  const { spec, ctx, style } = t;
  const floor = site.floor;
  const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
  const standIn = isKitBuilding(plot.form);
  const form = standIn ? (k === 0 ? style.landmark : rng.weighted(style.forms)) : plot.form;
  const scale = standIn ? (k === 0 ? (site.radius < HAMLET ? 0.8 : 1.5) : Math.min(1.1, (plot.room ?? GUESS) / GUESS)) : plot.scale;
  const built = buildForm(ctx, rng, style, form, scale);
  // The centrepiece fits its square with a walk round it, so the way in
  // from every avenue sees across the square: one that comes out wider
  // is built smaller.
  const fit = site.plaza * 0.82 - 1;
  if (k === 0 && built.radius > fit && fit > 1) {
    built.group.scale.multiplyScalar(fit / built.radius);
    built.radius = fit;
  }
  // The layout guessed every radius; the true one is known here. A
  // building that turns out to reach into an avenue or into a building
  // already standing is let go — the streets are the walkers' only
  // routes and a wall in one is a walker walking through it.
  const reaches =
    k > 0 &&
    (footprints.some((f) => Math.hypot(f.x - plot.x, f.z - plot.z) < (f.radius + built.radius) * 0.95) ||
      site.avenues.some((avenue) => {
        const along = plot.x * Math.sin(avenue) + plot.z * Math.cos(avenue);
        return along > 0 && Math.abs(plot.x * Math.cos(avenue) - plot.z * Math.sin(avenue)) < site.avenueHalf + built.radius * 0.97;
      }));
  if (reaches) {
    built.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh === true) mesh.geometry.dispose();
    });
    return;
  }
  built.group.position.set(plot.x, floor, plot.z);
  built.group.rotation.y = plot.yaw;
  draft.add(built.group);
  const box = new THREE.Box3().setFromObject(built.group);
  footprints.push({ x: plot.x, z: plot.z, radius: built.radius, height: box.max.y - floor });
}

/** A plot built from the kit: the module, its cradle and roof, its yard; its circles into `footprints`. */
export function buildKitPlot(t: TownContext, kit: WorldKit, site: Site, plot: Plot, draft: THREE.Group, footprints: Footprint[], part: number): void {
  const { spec, style, colony } = t;
  const floor = site.floor;
  const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
  const livery = liveryOf(style, rng);
  const cos = Math.cos(plot.yaw);
  const sin = Math.sin(plot.yaw);
  /** A point of the plot's frame (+Z its front) in the town's. */
  const at = (lx: number, lz: number): { x: number; z: number } => ({ x: plot.x + lx * cos + lz * sin, z: plot.z - lx * sin + lz * cos });
  const r = pieceRadius(plot.form, plot.scale);
  // With a yard the building stands forward in its plot, the yard behind it.
  const forward = plot.yard === true ? YARD / 2 : 0;
  const centre = at(0, forward);
  const extra: string[] = [];
  if (plot.form === 'house-single' || plot.form === 'house-open' || plot.form === 'house-open-back') extra.push('house-single-support');
  if (plot.roof !== undefined) extra.push(plot.roof);
  const height = placePiece(kit, draft, plot.form, livery, plot.scale, centre.x, floor, centre.z, plot.yaw, extra);
  for (const c of circlesOf(plot.form, plot.scale, forward)) {
    const p = at(c.x, c.z);
    footprints.push({ x: p.x, z: p.z, radius: c.r, height, part });
  }
  if (plot.yard !== true) return;
  // The yard: panels in a row, or a tank, a generator, a dish, a plant.
  const across = Math.min(r * 0.6, 3.6);
  const depth = forward - r - 2.3;
  const things = rng.between(2, 3);
  const gardens = colony?.gardens ?? [];
  for (let k = 0; k < things; k++) {
    const lx = -across + (2 * across * k) / (things - 1);
    const p = at(lx, depth);
    const roll = rng.unit();
    let made = 0;
    if (gardens.length > 0 && roll < 0.3) {
      made = placeScatter(kit, draft, rng.pick(gardens), null, rng.range(0.7, 0.95), p.x, floor, p.z, rng.range(0, Math.PI * 2));
    } else if (roll < 0.62) {
      made = placePiece(kit, draft, 'solar-ground', livery, 1, p.x, floor, p.z, plot.yaw + Math.PI);
    } else {
      const prop = rng.pick(['barrels', 'tank', 'generator', 'dish', 'jar']);
      made = PIECES[prop] !== undefined
        ? placePiece(kit, draft, prop, livery, 0.8, p.x, floor, p.z, plot.yaw + rng.range(-0.5, 0.5))
        : placeScatter(kit, draft, prop, livery, 1, p.x, floor, p.z, rng.range(0, Math.PI * 2));
    }
    // The yard is the module's: its things may stand close together.
    if (made > 0) footprints.push({ x: p.x, z: p.z, radius: 1.4, height: made, part });
  }
}

/** The hub in the square: the kit's centrepiece, a radar on its crown, dishes round it between the avenues. */
export function buildHub(t: TownContext, kit: WorldKit, site: Site, plot: Plot, draft: THREE.Group, footprints: Footprint[]): void {
  const { spec, style, colony } = t;
  const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
  const livery = liveryOf(style, rng);
  const id = plot.form;
  const height = placePiece(kit, draft, id, livery, plot.scale, 0, site.floor, 0, plot.yaw);
  const r = pieceRadius(id, plot.scale);
  footprints.push({ x: 0, z: 0, radius: r, height });
  if (id === 'base-large') {
    // The radar sits in the hub's open crown: authored for a pod's roof, so
    // set on the hub's own top instead.
    const info = PIECES[id]!;
    const lift = (info.size[1] - 0.3) * info.scale * plot.scale;
    placeModel(kit, draft, 'roof-radar', (one, glass) => buildingPaint(one, livery, glass), PIECES['roof-radar']!.scale * plot.scale * 1.3, 0, site.floor + lift, 0, plot.yaw);
  }
  // Dishes and beacons round it, midway between the avenues, outside the walk round the square.
  const ring = r + 6.5;
  if (ring + 2 > site.plaza) return;
  const gardens = colony?.gardens ?? [];
  site.avenues.forEach((a, k) => {
    const next = site.avenues[(k + 1) % site.avenues.length]! + (k === site.avenues.length - 1 ? Math.PI * 2 : 0);
    const mid = (a + next) / 2;
    const x = Math.sin(mid) * ring;
    const z = Math.cos(mid) * ring;
    const what = k % 2 === 0 ? 'dish-large' : 'beacon';
    const made = placePiece(kit, draft, what, livery, 1, x, site.floor, z, mid + Math.PI);
    if (made > 0) footprints.push({ x, z, radius: 1.6, height: made });
    if (gardens.length > 0 && k % 2 === 1 && site.plaza - 2.5 > ring + 3) {
      const px = Math.sin(mid) * (site.plaza - 2.5);
      const pz = Math.cos(mid) * (site.plaza - 2.5);
      const grown = placeScatter(kit, draft, rng.pick(gardens), null, 1, px, site.floor, pz, rng.range(0, Math.PI * 2));
      if (grown > 0) footprints.push({ x: px, z: pz, radius: 1.2, height: grown });
    }
  });
}

/** The landing pad: a marked disc, beacons round it, a ship parked on it (a craft to take, `craft-spots.ts`). */
export function buildPad(t: TownContext, kit: WorldKit | null, site: Site, plot: Plot, draft: THREE.Group, footprints: Footprint[]): void {
  const { spec, ctx, style } = t;
  const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
  const livery = liveryOf(style, rng);
  const PAD = plot.room ?? PAD_RADIUS;
  const disc = ctx.column(PAD, 0.5, ctx.tone(style.ground, 0.78), 24);
  disc.position.set(plot.x, site.floor - 0.3, plot.z);
  draft.add(disc);
  const ring = ctx.ringWall(PAD * 0.62, PAD * 0.7, 0.55, livery.accent, 24);
  ring.position.set(plot.x, site.floor - 0.3, plot.z);
  draft.add(ring);
  for (let k = 0; k < 4; k++) {
    const a = plot.yaw + Math.PI / 4 + (k / 4) * Math.PI * 2;
    const x = plot.x + Math.sin(a) * (PAD - 1.2);
    const z = plot.z + Math.cos(a) * (PAD - 1.2);
    if (kit !== null) {
      const made = placePiece(kit, draft, 'beacon', livery, 0.55, x, site.floor, z, a);
      if (made > 0) footprints.push({ x, z, radius: 1, height: made });
    } else {
      const post = ctx.lit(ctx.column(0.35, 2.4, livery.accent, 6));
      post.position.set(x, site.floor, z);
      draft.add(post);
    }
  }
  site.port = { x: plot.x, z: plot.z, r: PAD, yaw: plot.yaw };
  // Its ship is a craft to take (`craftAt`), standing on the disc.
}

/** The tubes between neighbours in a row: a connector stretched from hull to hull, at the doors' height. */
export function buildTubes(t: TownContext, kit: WorldKit, site: Site, plots: readonly Plot[], draft: THREE.Group, footprints: Footprint[]): void {
  const { spec, style, colony } = t;
  if (colony?.tubes !== true) return;
  const tube = kit.pieces.get('connector');
  if (tube === undefined) return;
  const rows = new Map<number, Plot[]>();
  for (const plot of plots) {
    if (plot.row === undefined || PIECES[plot.form]?.joins !== true) continue;
    const row = rows.get(plot.row) ?? [];
    row.push(plot);
    rows.set(plot.row, row);
  }
  let part = 10000;
  const centreOf = (p: Plot): { x: number; z: number } => {
    const f = p.yard === true ? YARD / 2 : 0;
    return { x: p.x + Math.sin(p.yaw) * f, z: p.z + Math.cos(p.yaw) * f };
  };
  for (const row of rows.values()) {
    row.sort((a, b) => a.place! - b.place!);
    for (let k = 0; k + 1 < row.length; k++) {
      const a = row[k]!;
      const b = row[k + 1]!;
      if (b.place !== a.place! + 1) continue;
      const ca = centreOf(a);
      const cb = centreOf(b);
      const ra = pieceRadius(a.form, a.scale);
      const rb = pieceRadius(b.form, b.scale);
      const dx = cb.x - ca.x;
      const dz = cb.z - ca.z;
      const d = Math.hypot(dx, dz);
      const gap = d - ra - rb;
      if (gap < 1.5 || gap > 16) continue;
      const ux = dx / d;
      const uz = dz / d;
      const from = { x: ca.x + ux * ra * 0.72, z: ca.z + uz * ra * 0.72 };
      const to = { x: cb.x - ux * rb * 0.72, z: cb.z - uz * rb * 0.72 };
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      const s = PIECES.connector!.scale * (colony.scale ?? 1);
      const livery = liveryOf(style, rngFrom('worlds', spec.id, 'tube', a.seed));
      const holder = new THREE.Group();
      const mesh = pieceMesh(tube.model, buildingPaint('connector', livery), null);
      const box = tube.model.box;
      // Along +X from its start, the tube's own height kept: it is authored at a door's.
      mesh.position.set(-box.min.x, 0, -(box.min.z + box.max.z) / 2);
      holder.add(mesh);
      holder.scale.set(length / (box.max.x - box.min.x), s, s);
      holder.rotation.y = Math.atan2(-uz, ux);
      holder.position.set(from.x, site.floor, from.z);
      draft.add(holder);
      const radius = ((box.max.z - box.min.z) / 2) * s;
      const top = box.max.y * s;
      const beads = Math.max(2, Math.ceil(length / (radius * 1.2)));
      for (let n = 0; n <= beads; n++) {
        const t = n / beads;
        footprints.push({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, radius, height: top, part });
      }
      part++;
    }
  }
}

/** A gate over each avenue where it leaves the paving, in a town past a hamlet: its two posts are the walls. */
export function buildGates(t: TownContext, kit: WorldKit, site: Site, draft: THREE.Group, footprints: Footprint[]): void {
  const { spec, style } = t;
  if (site.radius < HAMLET) return;
  const info = PIECES.gate!;
  // As wide as the street and its kerbs, and tall enough for its people to walk under.
  const span = Math.max((site.avenueHalf + 1.6) * 2, (spec.civilisation?.species.morph.height ?? 0) * 1.35);
  for (const a of site.avenues) {
    const livery = liveryOf(style, rngFrom('worlds', spec.id, 'gate', site.id, a.toFixed(3)));
    const d = site.paving - 2.5;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const height = placePiece(kit, draft, 'gate', livery, span / (info.size[0] * info.scale), x, site.floor, z, a);
    if (height === 0) return;
    for (const side of [-1, 1]) {
      const off = (span / 2) * 0.86;
      footprints.push({ x: x + Math.cos(a) * off * side, z: z - Math.sin(a) * off * side, radius: 0.9, height });
    }
  }
}
