/**
 * How the Bathyd build: low, heavy and round-shouldered, for ninety-two
 * atmospheres pressing on every wall from outside and nothing much pressing
 * back. (Invented, like the Bathyd; the physics it answers to is not.)
 *
 * Where Mars's towns are domes on drums and needles — the shapes of a thin,
 * cold atmosphere, where height is cheap — nothing here stands higher than
 * it must. The three house forms are:
 *
 * - **pancake** — a drum under a dome squashed to a third of its width,
 *   buttressed on four sides, entered by a tunnel: the house built *like* the
 *   lava domes, and in the oldest towns built *into* one.
 * - **kiln** — a stepped octagonal mound with a stack on top, where sulphur
 *   is burned for light. It is the commonest workshop.
 * - **vault** — a barrel-vaulted hall on a plinth, ribbed, the meeting house:
 *   an arch is the shape that carries a load the way this air loads a roof.
 *
 * And every town keeps a **hearth** in its square: a stepped base, a short
 * heavy pillar and a ball of burning sulphur in a cage — the light a town is
 * found by under a sky that is the same dim gold at every hour.
 *
 * Every builder stands on `y = 0` and keeps its footprint under eight units,
 * which is the room `layoutOf` guesses a building needs.
 */

import * as THREE from 'three';
import type { BuildingBuilder } from '../../contract.ts';
import type { SceneryContext } from '../../../scenery/contract.ts';
import { PALETTE } from '../../../theme.ts';
import { ball, dome } from '../../architecture.ts';

/** A sulphur lamp on a stub post: the Bathyd's one ornament, on everything. */
export function lamp(ctx: SceneryContext, x: number, z: number, height: number, accent: number, post: number): THREE.Group {
  const group = new THREE.Group();
  const stem = ctx.column(0.28, height, post, 5);
  group.add(stem);
  const light = ctx.lit(ball(ctx, 0.62, accent, 8));
  light.position.y = height + 0.5;
  group.add(light);
  group.position.set(x, 0, z);
  return group;
}

/** Half a cylinder lying along x with its flat face on `y = 0`: a barrel vault. */
function vaultShell(ctx: SceneryContext, radius: number, length: number, color: number): THREE.Mesh {
  // A cylinder's θ runs round y from +z toward +x; the half from 0 to π is
  // the +x half, and turned a quarter about z that half is the upper one.
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 9, 1, false, 0, Math.PI);
  const mesh = new THREE.Mesh(geometry, ctx.toon(color));
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

const pancake: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(4.2, 5.6);
  const drum = rng.range(1.2, 1.9) * style.height;
  const wall = rng.pick(style.walls);
  group.add(ctx.column(r, drum, wall, 12));
  const cap = dome(ctx, r * 1.04, rng.pick(style.roofs), rng.range(0.32, 0.46), 12);
  cap.position.y = drum;
  group.add(cap);
  // Buttresses, leaning in: the wall pushed back against the air.
  const turn = rng.range(0, Math.PI / 4);
  for (let k = 0; k < 4; k++) {
    const a = turn + (k / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = new THREE.Vector3(Math.cos(a) * r * 1.2, 0.3, Math.sin(a) * r * 1.2);
    const head = new THREE.Vector3(Math.cos(a) * r * 0.9, drum + 0.3, Math.sin(a) * r * 0.9);
    group.add(ctx.strut(foot, head, 0.85, ctx.tone(wall, 0.85)));
  }
  // The entrance tunnel, on +z, and the doorway's dark at its mouth.
  const tunnel = ctx.box(2.4, 2.5, 2.2, wall);
  tunnel.position.z = r + 0.5;
  group.add(tunnel);
  const hood = ctx.box(2.8, 0.45, 2.5, rng.pick(style.roofs));
  hood.position.set(0, 2.5, r + 0.5);
  group.add(hood);
  const doorway = ctx.box(1.4, 1.9, 0.3, PALETTE.ink);
  doorway.position.z = r + 1.56;
  group.add(doorway);
  group.add(lamp(ctx, 1.8, r + 1.4, 1.6, rng.pick(style.accents), PALETTE.bark));
  return { group, radius: r * 1.22 };
};

const kiln: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const tiers = rng.between(2, 3);
  const base = rng.range(4.8, 6.2);
  let r = base;
  let y = 0;
  const wall = rng.pick(style.walls);
  for (let k = 0; k < tiers; k++) {
    const h = rng.range(1.5, 2.2) * style.height;
    const next = r * rng.range(0.66, 0.78);
    const tier = ctx.taper(r, next * 1.08, h, k % 2 === 0 ? wall : ctx.tone(wall, 0.86), 8);
    tier.position.y = y;
    tier.rotation.y = Math.PI / 8;
    group.add(tier);
    y += h;
    r = next;
  }
  // The stack, and the sulphur burning in its mouth.
  const stack = ctx.taper(r * 0.55, r * 0.42, 2.6 * style.height, rng.pick(style.roofs), 6);
  stack.position.y = y;
  group.add(stack);
  const flame = ball(ctx, r * 0.42, rng.pick(style.accents), 8);
  flame.scale.y = 0.7;
  flame.position.y = y + 2.6 * style.height + r * 0.15;
  group.add(flame);
  const doorway = ctx.box(1.5, 1.9, 0.6, PALETTE.ink);
  doorway.position.z = base * 0.93;
  group.add(doorway);
  return { group, radius: base * 1.02 };
};

const vault: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(2.8, 3.5) * Math.min(1, style.height + 0.15);
  const length = rng.range(7.5, 10);
  const plinth = ctx.box(length + 1.4, 0.7, r * 2 + 1.2, ctx.tone(rng.pick(style.walls), 0.9));
  group.add(plinth);
  const shell = vaultShell(ctx, r, length, rng.pick(style.roofs));
  shell.position.y = 0.7;
  group.add(shell);
  // Ribs over the shell, as short struts round the half circle.
  const rib = rng.pick(style.walls);
  for (const x of [-length * 0.42, 0, length * 0.42]) {
    const segments = 5;
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI;
      const a1 = ((k + 1) / segments) * Math.PI;
      const from = new THREE.Vector3(x, 0.7 + Math.sin(a0) * (r + 0.15), Math.cos(a0) * (r + 0.15));
      const to = new THREE.Vector3(x, 0.7 + Math.sin(a1) * (r + 0.15), Math.cos(a1) * (r + 0.15));
      group.add(ctx.strut(from, to, 0.5, rib));
    }
  }
  const accent = rng.pick(style.accents);
  for (const side of [-1, 1]) group.add(lamp(ctx, side * (length / 2 + 0.2), r * 0.8 + 0.6, 1.4, accent, PALETTE.bark));
  const doorway = ctx.box(0.3, 1.9, 1.4, PALETTE.ink);
  doorway.position.set(length / 2 + 0.05, 0.7, 0);
  group.add(doorway);
  return { group, radius: Math.hypot(length / 2 + 0.8, r + 0.7) };
};

const hearth: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const wall = rng.pick(style.walls);
  const step1 = ctx.taper(7, 6.2, 1.1, ctx.tone(wall, 0.88), 8);
  group.add(step1);
  const step2 = ctx.taper(5.2, 4.6, 1.1, wall, 8);
  step2.position.y = 1.1;
  group.add(step2);
  const pillar = ctx.taper(2.2, 1.8, 3.4 * style.height, rng.pick(style.roofs), 8);
  pillar.position.y = 2.2;
  group.add(pillar);
  const top = 2.2 + 3.4 * style.height;
  const bowl = ctx.taper(1.6, 2.6, 0.9, ctx.tone(wall, 0.8), 8);
  bowl.position.y = top;
  group.add(bowl);
  const accent = style.accents[0] ?? PALETTE.gold;
  const fire = ball(ctx, 1.7, accent, 10);
  fire.position.y = top + 2.2;
  group.add(fire);
  // The cage: six bars from the bowl's lip to a crown ring.
  const crown = top + 4.4;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(a) * 2.4, top + 0.9, Math.sin(a) * 2.4);
    const to = new THREE.Vector3(Math.cos(a) * 1.0, crown, Math.sin(a) * 1.0);
    group.add(ctx.strut(from, to, 0.24, PALETTE.bark));
  }
  const ring = ctx.ringWall(0.7, 1.3, 0.4, PALETTE.bark, 8);
  ring.position.y = crown;
  group.add(ring);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 8;
    group.add(lamp(ctx, Math.cos(a) * 6.5, Math.sin(a) * 6.5, 1.3, rng.pick(style.accents), PALETTE.bark));
  }
  return { group, radius: 7.1 };
};

export const BATHYD_BUILDINGS: Readonly<Record<string, BuildingBuilder>> = { pancake, kiln, vault, hearth };

