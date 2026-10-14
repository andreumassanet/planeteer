/**
 * The street plan of a grid town drawn on its floor: carriageways, pavements a
 * kerb over them, a lit line down the main streets, and where the streets end.
 *
 * The yards are the planet's own ground (the terrain levels a town's pad to
 * its plane), so only the streets are drawn on it, each a little proud of the
 * ground and of each other.
 */

import * as THREE from 'three';
import type { GridTown } from '../town-grid.ts';
import { CARRIAGE_TOP } from '../roads.ts';
import type { Gate } from '../roads.ts';
import { newSample } from '../terrain.ts';
import { PALETTE } from '../../theme.ts';
import type { TownContext } from './context.ts';
import { siteToWorld } from './layout.ts';
import type { Site } from './types.ts';

/** The kerb's height over the carriageway, units. */
export const KERB_TOP = 0.28;
/** How far past the square a main street's track runs at most, units, and the length of one of its pieces. */
const TRACK_LENGTH = 70;
const TRACK_STEP = 7;

/** The palette entry nearest a linear colour, and the tone that brings it to that colour's brightness. */
function paletteToneOf(r: number, g: number, b: number): { base: number; factor: number } {
  const want = new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const probe = new THREE.Color();
  let base: number = PALETTE.tan;
  let best = Infinity;
  for (const hex of Object.values(PALETTE)) {
    if (hex === PALETTE.ink) continue;
    probe.setHex(hex);
    // By hue and saturation more than brightness: the tone takes care of that.
    const scale = lum(want) / Math.max(1e-4, lum(probe));
    const d = (probe.r * scale - want.r) ** 2 + (probe.g * scale - want.g) ** 2 + (probe.b * scale - want.b) ** 2;
    if (d < best) [best, base] = [d, hex];
  }
  probe.setHex(base);
  return { base, factor: Math.min(1.6, Math.max(0.4, Math.sqrt(lum(want) / Math.max(1e-4, lum(probe))))) };
}

/** Carriageways, their pavements (cut at every crossing) and the lit dashes of the main streets. */
export function drawStreets(t: TownContext, site: Site, town: GridTown, draft: THREE.Group, carriage: number, pavement: number, accent: number): void {
  const { ctx } = t;
  const floor = site.floor;
  const half = town.grid.half;
  for (const street of town.streets) {
    const along = street.axis === 'x';
    const width = (street.half - street.walk) * 2;
    // The carriageways one way a hair over the other, where they cross.
    const lift = along ? 0.012 : 0;
    const road = ctx.box(along ? half * 2 : width, 0.3, along ? width : half * 2, carriage);
    road.position.set(along ? 0 : street.at, floor + CARRIAGE_TOP + lift - 0.3, along ? street.at : 0);
    draft.add(road);
    // The pavements, cut at every crossing, a kerb's height over the road.
    const crossings = town.streets
      .filter((other) => other.axis !== street.axis)
      .map((other) => [other.at - other.half + other.walk, other.at + other.half - other.walk] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const runs: [number, number][] = [];
    let from = -half;
    for (const [lo, hi] of crossings) {
      if (lo > from) runs.push([from, lo]);
      from = Math.max(from, hi);
    }
    if (from < half) runs.push([from, half]);
    for (const side of [-1, 1]) {
      const centre = street.at + side * (street.half - street.walk / 2);
      for (const [a, b] of runs) {
        const length = b - a;
        if (length < 0.5) continue;
        const walk = ctx.box(along ? length : street.walk, KERB_TOP + 0.3, along ? street.walk : length, pavement);
        walk.position.set(along ? (a + b) / 2 : centre, floor - 0.3, along ? centre : (a + b) / 2);
        draft.add(walk);
      }
    }
    // A lit line down the middle of a main street: the civilisation's
    // accent, dashed, glowing after dark.
    if (street.main && width > 4) {
      for (let t = -half + 2; t < half - 2; t += 5.5) {
        const dash = ctx.lit(ctx.box(along ? 2.6 : 0.32, 0.04, along ? 0.32 : 2.6, accent), 0.8);
        dash.position.set(along ? t + 1.3 : street.at, floor + CARRIAGE_TOP + lift, along ? street.at : t + 1.3);
        draft.add(dash);
      }
    }
  }
}

/**
 * Where the streets end. A main street goes on past the square as a track of
 * trodden ground, narrowing and taking the ground's colour, unless a road
 * carries it on; any other street is closed by its pavement turning across.
 */
export function endStreets(t: TownContext, site: Site, town: GridTown, draft: THREE.Group, pavement: number): void {
  const { ctx, deck, network } = t;
  const floor = site.floor;
  const half = town.grid.half;
  for (const street of town.streets) {
    const along = street.axis === 'x';
    for (const end of [-1, 1]) {
      if (street.main && !deck) {
        // A road leaves by this end: it carries the street on (`roads.ts`).
        const gate: Gate = along ? (end > 0 ? 'w' : 'e') : end > 0 ? 'n' : 's';
        if (network.ends.get(site.id)?.has(gate) !== true) layTrack(t, site, street.at, along, end, half, (street.half - street.walk) * 2, draft);
        continue;
      }
      const cap = ctx.box(along ? street.walk : street.half * 2, KERB_TOP + 0.3, along ? street.half * 2 : street.walk, pavement);
      const offset = end * (half - street.walk / 2);
      cap.position.set(along ? offset : street.at, floor - 0.3, along ? street.at : offset);
      draft.add(cap);
    }
  }
}

/**
 * A main street's track past the square's edge: segments out to the levelled
 * pad's rim, each narrower and nearer the ground's own colour than the last
 * (sampled off the terrain there), flat on the pad's plane.
 */
export function layTrack(t: TownContext, site: Site, at: number, along: boolean, end: number, half: number, width: number, draft: THREE.Group): void {
  const { ctx, terrain } = t;
  const reach = Math.max(8, Math.min(site.radius * 0.97, half + TRACK_LENGTH) - half);
  const steps = Math.max(3, Math.ceil(reach / TRACK_STEP));
  const local = new THREE.Vector3();
  const sample = newSample();
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps;
    const t1 = (k + 1) / steps;
    const mid = half + reach * (t0 + t1) / 2;
    // The ground's colour where the segment lies, as the palette entry
    // nearest it and the tone that matches its brightness (`ctx` draws in
    // the palette only): trodden darker near the town, its own at the end.
    siteToWorld(site, along ? end * mid : at, 0, along ? at : end * mid, local).normalize();
    terrain.sample(local.x, local.y, local.z, sample);
    const ground = paletteToneOf(sample.r, sample.g, sample.b);
    const colour = t0 < 0.15 ? ctx.tone(PALETTE.steel, 1.1) : ctx.tone(ground.base, Math.min(1.5, Math.max(0.5, ground.factor * (0.8 + 0.2 * Math.min(1, (t0 - 0.15) / 0.6)))));
    const w = width * (1 - t0 * 0.62);
    const length = reach / steps + 0.05;
    const piece = ctx.box(along ? length : w, 0.3, along ? w : length, colour);
    piece.position.set(along ? end * mid : at, site.floor + 0.1 - 0.3 - k * 0.004, along ? at : end * mid);
    draft.add(piece);
  }
}
