/**
 * Alien architecture: seven buildings in code, and a town is a draw from them
 * at a style's weights and colours.
 *
 * The scenery kit's rule holds here unchanged: **every building is built from
 * the context's primitives, in palette colours, standing on `y = 0`**, and a
 * town is merged into one mesh (`settlements.ts`), so a building is priced in
 * triangles and never in draw calls. What differs from Earth's kit is that
 * nothing here imitates a building anyone has seen — the forms are chosen to
 * read as *made by someone else*: domes on drums, needles ringed in bands,
 * pods on stilts, stacked drums, gates with nothing behind them, onion bulbs
 * on stalks, and walled rings.
 *
 * A planet that wants its own adds a `BuildingBuilder` to
 * `ArchitectureStyle.extra` and names it in `forms`; `buildForm` looks there
 * first. Every builder returns the **footprint radius** with the group, which
 * is the wall the player is pushed out of and the room the layout leaves
 * round it.
 */

import * as THREE from 'three';
import type { ArchitectureStyle } from './contract.ts';
import type { Group, SceneryContext } from '../scenery/contract.ts';
import type { Rng } from '../scenery/random.ts';
import { PALETTE } from '../theme.ts';

export interface Built {
  group: Group;
  radius: number;
}

/** A hemisphere standing on `y = 0`, in a palette colour. The context has no dome. */
export function dome(ctx: SceneryContext, radius: number, color: number, squash = 1, sides = 12): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, sides, Math.max(3, Math.round(sides / 2)), 0, Math.PI * 2, 0, Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, ctx.toon(color));
  mesh.scale.y = squash;
  return mesh;
}

/** A whole sphere, centred at its origin. */
export function ball(ctx: SceneryContext, radius: number, color: number, sides = 12): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, sides, Math.max(4, Math.round(sides * 0.6)));
  return new THREE.Mesh(geometry, ctx.toon(color));
}

const DOOR = PALETTE.bark;

function door(ctx: SceneryContext, z: number, scale: number): THREE.Mesh {
  const mesh = ctx.box(1.7 * scale, 2.7 * scale, 0.7, DOOR);
  mesh.position.z = z;
  return mesh;
}

type Builder = (ctx: SceneryContext, rng: Rng, style: ArchitectureStyle, scale: number) => Built;

const FORMS: Record<string, Builder> = {
  dome(ctx, rng, style, scale) {
    const group = new THREE.Group();
    const r = rng.range(3.6, 6.4) * scale;
    const drum = r * rng.range(0.3, 0.6) * style.height;
    const wall = rng.pick(style.walls);
    group.add(ctx.column(r, drum, wall, 12));
    const cap = dome(ctx, r, rng.pick(style.roofs), rng.range(0.7, 1.1) * style.height);
    cap.position.y = drum;
    group.add(cap);
    const band = ctx.ringWall(r * 0.99, r * 1.05, 0.5, rng.pick(style.accents), 12);
    band.position.y = Math.max(0, drum - 0.5);
    group.add(band);
    group.add(door(ctx, r - 0.15, 1));
    if (rng.chance(0.6)) {
      const spike = ctx.taper(r * 0.12, 0.05, r * 0.6, rng.pick(style.accents), 5);
      spike.position.y = drum + r * 0.95 * style.height;
      group.add(spike);
    }
    return { group, radius: r * 1.06 };
  },

  spire(ctx, rng, style, scale) {
    const group = new THREE.Group();
    const r = rng.range(2.2, 3.6) * scale;
    const h = rng.range(14, 26) * scale * style.height;
    const sides = rng.pick([5, 6, 8]);
    const plinth = ctx.taper(r * 1.45, r * 1.15, 1.2, rng.pick(style.roofs), sides);
    group.add(plinth);
    const shaft = ctx.taper(r, r * 0.16, h, rng.pick(style.walls), sides);
    shaft.position.y = 1.2;
    group.add(shaft);
    const rings = rng.between(2, 3);
    const accent = rng.pick(style.accents);
    for (let k = 1; k <= rings; k++) {
      const t = k / (rings + 1);
      const half = r * (1 - t * 0.84);
      const ring = ctx.ringWall(half * 0.95, half * 1.3, 0.6, accent, sides * 2);
      ring.position.y = 1.2 + h * t;
      group.add(ring);
    }
    const tip = ctx.column(r * 0.13, h * 0.12, accent, 6);
    tip.position.y = 1.2 + h;
    group.add(tip);
    return { group, radius: r * 1.45 };
  },

  pod(ctx, rng, style, scale) {
    const group = new THREE.Group();
    const r = rng.range(3, 4.8) * scale;
    const lift = rng.range(3, 5.5) * scale * style.height;
    const squash = rng.range(0.55, 0.75);
    const legs = rng.between(3, 4);
    const trim = rng.pick(style.roofs);
    const turn = rng.range(0, Math.PI);
    for (let k = 0; k < legs; k++) {
      const a = turn + (k / legs) * Math.PI * 2;
      const foot = new THREE.Vector3(Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.95);
      const knee = new THREE.Vector3(Math.cos(a) * r * 0.45, lift + 0.4, Math.sin(a) * r * 0.45);
      group.add(ctx.strut(foot, knee, 0.45 * scale, trim));
      const pad = ctx.column(0.7 * scale, 0.3, trim, 6);
      pad.position.copy(foot);
      group.add(pad);
    }
    const body = ball(ctx, r, rng.pick(style.walls), 12);
    body.scale.y = squash;
    body.position.y = lift + r * squash;
    group.add(body);
    const band = ctx.ringWall(r * 0.92, r * 1.02, 0.7, rng.pick(style.accents), 12);
    band.position.y = lift + r * squash - 0.35;
    group.add(band);
    const ladder = ctx.strut(new THREE.Vector3(0, 0, r * 1.15), new THREE.Vector3(0, lift + 0.3, r * 0.75), 0.3, trim);
    group.add(ladder);
    return { group, radius: r * 1.05 };
  },

  stack(ctx, rng, style, scale) {
    const group = new THREE.Group();
    const tiers = rng.between(2, 4);
    let r = rng.range(3.4, 5.6) * scale;
    const sides = rng.pick([6, 8, 10]);
    let y = 0;
    const walls = rng.pick(style.walls);
    const roof = rng.pick(style.roofs);
    const base = r;
    for (let k = 0; k < tiers; k++) {
      const h = rng.range(2.6, 4) * scale * style.height;
      const tier = ctx.column(r, h, k % 2 === 0 ? walls : ctx.tone(walls, 0.88), sides);
      tier.position.y = y;
      group.add(tier);
      const eave = ctx.taper(r * 1.18, r * 0.82, 0.8, roof, sides);
      eave.position.y = y + h;
      group.add(eave);
      y += h + 0.8;
      r *= rng.range(0.62, 0.78);
    }
    const cap = dome(ctx, r * 1.1, rng.pick(style.accents), 0.8, sides);
    cap.position.y = y;
    group.add(cap);
    group.add(door(ctx, base - 0.15, 1));
    return { group, radius: base * 1.05 };
  },

  arch(ctx, rng, style, scale) {
    const group = new THREE.Group();
    const span = rng.range(3.5, 5) * scale;
    const h = rng.range(6, 10) * scale * style.height;
    const leg = rng.range(0.9, 1.5) * scale;
    const wall = rng.pick(style.walls);
    for (const side of [-1, 1]) {
      const pillar = ctx.taper(leg * 1.3, leg, h, wall, 4);
      pillar.position.x = side * span;
      group.add(pillar);
    }
    // The curve as short blocks round a half circle, joined end to end.
    const segments = 7;
    const accent = rng.pick(style.accents);
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI;
      const a1 = ((k + 1) / segments) * Math.PI;
      const from = new THREE.Vector3(Math.cos(a0) * span, h + Math.sin(a0) * span * 0.7, 0);
      const to = new THREE.Vector3(Math.cos(a1) * span, h + Math.sin(a1) * span * 0.7, 0);
      group.add(ctx.strut(from, to, leg * 1.1, k % 2 === 0 ? rng.pick(style.roofs) : accent));
    }
    return { group, radius: span + leg * 1.4 };
  },

  bulb(ctx, rng, style, scale) {
    const group = new THREE.Group();
    const r = rng.range(2.8, 4.4) * scale;
    const stem = rng.range(5, 10) * scale * style.height;
    const base = ctx.column(r * 0.9, 1.4, rng.pick(style.roofs), 8);
    group.add(base);
    const stalk = ctx.taper(r * 0.45, r * 0.3, stem, rng.pick(style.walls), 8);
    stalk.position.y = 1.4;
    group.add(stalk);
    const head = ball(ctx, r, rng.pick(style.walls), 10);
    head.scale.y = 1.15;
    head.position.y = 1.4 + stem + r * 0.9;
    group.add(head);
    const tip = ctx.taper(r * 0.3, 0.05, r * 1.2, rng.pick(style.accents), 6);
    tip.position.y = 1.4 + stem + r * 1.9;
    group.add(tip);
    return { group, radius: r * 1.02 };
  },

  ring(ctx, rng, style, scale) {
    const group = new THREE.Group();
    const r = rng.range(5.5, 7.2) * scale;
    const h = rng.range(2.4, 3.4) * scale * style.height;
    group.add(ctx.ringWall(r - 1.1, r, h, rng.pick(style.walls), 16));
    const coping = ctx.ringWall(r - 1.3, r + 0.2, 0.5, rng.pick(style.accents), 16);
    coping.position.y = h;
    group.add(coping);
    const inner = dome(ctx, r * 0.45, rng.pick(style.roofs), 1.2, 10);
    group.add(inner);
    return { group, radius: r };
  },
};

/** The built-in form names, for the check. */
export const BUILT_IN_FORMS: readonly string[] = Object.keys(FORMS);

/** One building of a named form. Custom forms in `style.extra` win over the built-ins. */
export function buildForm(ctx: SceneryContext, rng: Rng, style: ArchitectureStyle, form: string, scale = 1): Built {
  const custom = style.extra[form];
  if (custom !== undefined) {
    const built = custom(ctx, rng, style);
    if (scale !== 1) {
      built.group.scale.multiplyScalar(scale);
      built.radius *= scale;
    }
    return built;
  }
  const builder = FORMS[form] ?? FORMS.dome!;
  return builder(ctx, rng, style, scale);
}
