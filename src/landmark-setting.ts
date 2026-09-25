/**
 * The square a landmark stands in: paving shaped to its plan, a kerb, trees in
 * planters, lamps and benches round the edge, and a path out towards its town.
 *
 * **A landmark stood on a level disc of whatever the ground was, and nothing
 * else**, so a cathedral in a city and a cathedral in a field looked the same:
 * a model on a platform. A building people visit stands in a made place —
 * the Sagrada Familia's squares, the Eiffel Tower's Champ de Mars, the lawns
 * and walks round the Taj Mahal — and that place is what tells the eye the
 * thing is part of the world rather than set down on it.
 *
 * So the landmarks the source lists in `plazas` get one, built here from the
 * monument context's own primitives and merged into the monument's mesh
 * (`placement.ts`), where it costs no draw call and stands and falls with the
 * model. Everything is in the model's frame and on its ground, `y = 0`:
 *
 * - **the paving** is the plan (`landmark-ground.ts`) grown by `APRON`, in the
 *   region's plaza stone, on a kerb course a `PROUD` step lower in its
 *   pavement stone, so the pen draws the edge of the paving and the edge of
 *   the kerb. Its top is `PAVING_RISE`, under the lowest floor any listed
 *   model builds (0.3, the Colosseum's arena, measured 2026-09-25), so the
 *   paving runs under the model and never over a floor of its own;
 * - **the path** leaves the side facing the nearest town (`toward`, baked) and
 *   runs to the rim of the level pad `terrain.ts` cuts, which is as far as the
 *   ground is known to be flat;
 * - **trees in planters, lamps and benches** stand round the edge, inside the
 *   paving and outside the plan, so none of them can meet the model.
 *
 * The regions' own palette decides the stones (`groundStyleFor`), so the square
 * in Seville is lime-washed like the town round it and the one in Kyoto is
 * pale stone; the trees are dark and narrow where the country is dry.
 */
import * as THREE from 'three';
import type { MonumentContext } from './monuments/contract.ts';
import { planShape } from './landmark-ground.ts';
import type { Plan } from './landmark-ground.ts';
import type { GroundStyle } from './scenery/ground.ts';
import { PROUD } from './scenery/contract.ts';
import { SCENERY_SCALE } from './stature.ts';
import { PAD_MARGIN } from './terrain.ts';

/** How far the paving runs past the plan, in world units: room for a row of trees and a walk. */
export const APRON = 5;
/** The paving's top over the ground; see the note above on the floors under it. */
const PAVING_RISE = 0.2;
/** How wide the kerb course is round the paving. */
const KERB_WIDTH = 0.8;
/** The path's width: a walk two people wide and a little. */
const PATH_WIDTH = 4;
/** Trees and lamps along an edge, at most this far apart. */
const SPACING = 11;

/** What a square needs to know about where it is. */
export interface SettingSite {
  footprint?: number;
  plan?: Plan;
  /** `atan2(x, z)` in degrees in the model's frame: which way its path leaves. */
  toward?: number;
}

/** Whether a region's trees are the dark, narrow ones of a dry country. */
const DRY = new Set(['mediterranean', 'maghreb', 'middle-east', 'sub-saharan']);

/**
 * Builds a landmark's square as one group in the model's frame, or null for a
 * site with no plan to shape it to. Deterministic: nothing is drawn at random,
 * so the monument's cached geometry and the walls measured off it hold.
 */
export function buildSetting(ctx: MonumentContext, site: SettingSite, ground: GroundStyle, region: string): THREE.Group | null {
  if (site.plan === undefined) return null;
  const shape = planShape(site);
  const group = new THREE.Group();
  const halfX = shape.hx + APRON;
  const halfZ = shape.hz + APRON;
  const metre = SCENERY_SCALE;

  // The kerb course, and the paving a `PROUD` step over it.
  const kerb = ctx.box(halfX * 2, PAVING_RISE - PROUD, halfZ * 2, ground.walk);
  kerb.position.set(shape.cx, 0, shape.cz);
  group.add(kerb);
  const paving = ctx.box((halfX - KERB_WIDTH) * 2, PAVING_RISE, (halfZ - KERB_WIDTH) * 2, ground.plaza);
  paving.position.set(shape.cx, 0, shape.cz);
  group.add(paving);

  // The path, out of the side the ray towards the town leaves by, to the pad's rim.
  const angle = ((site.toward ?? 0) * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);
  const alongX = Math.abs(dx) * halfZ > Math.abs(dz) * halfX;
  const run = PAD_MARGIN - APRON - 2;
  let gap = { x: 0, z: 0, along: alongX };
  if (run > 0) {
    const path = ctx.box(alongX ? run : PATH_WIDTH, PAVING_RISE - PROUD, alongX ? PATH_WIDTH : run, ground.walk);
    if (alongX) {
      const side = Math.sign(dx) || 1;
      const z = THREE.MathUtils.clamp(shape.cz + (dz / Math.abs(dx)) * halfX, shape.cz - halfZ + PATH_WIDTH, shape.cz + halfZ - PATH_WIDTH);
      path.position.set(shape.cx + side * (halfX + run / 2), 0, z);
      gap = { x: shape.cx + side * halfX, z, along: true };
    } else {
      const side = Math.sign(dz) || 1;
      const x = THREE.MathUtils.clamp(shape.cx + (dx / Math.abs(dz)) * halfZ, shape.cx - halfX + PATH_WIDTH, shape.cx + halfX - PATH_WIDTH);
      path.position.set(x, 0, shape.cz + side * (halfZ + run / 2));
      gap = { x, z: shape.cz + side * halfZ, along: false };
    }
    group.add(path);
  }

  // Round the edge, halfway across the band between the plan and the kerb:
  // a tree in a planter, then a lamp, then a tree, and a bench facing in
  // beside every other tree. Not in the path's mouth, and not in the disc
  // of the footprint where it cuts the box's corner, which the model may use.
  const inset = APRON / 2 + KERB_WIDTH / 2;
  const edgeX = halfX - inset;
  const edgeZ = halfZ - inset;
  const crown = DRY.has(region) ? ctx.palette.darkOlive : ctx.palette.green;
  let n = 0;
  const place = (x: number, z: number, faceX: number, faceZ: number): void => {
    const mouth = gap.along ? Math.abs(x - gap.x) < APRON && Math.abs(z - gap.z) < PATH_WIDTH : Math.abs(z - gap.z) < APRON && Math.abs(x - gap.x) < PATH_WIDTH;
    if (mouth || region === 'polar') return;
    const item = new THREE.Group();
    if (n % 2 === 0) {
      const planter = ctx.box(1.1 * metre, 0.5 * metre, 1.1 * metre, ground.walk);
      const trunk = ctx.column(0.13 * metre, 2.4 * metre, ctx.palette.bark, 5);
      trunk.position.y = 0.5 * metre;
      const leaves = DRY.has(region)
        ? ctx.taper(0.75 * metre, 0.12 * metre, 4.6 * metre, crown, 6)
        : ctx.taper(1.25 * metre, 0.35 * metre, 3.4 * metre, crown, 6);
      leaves.position.y = 2 * metre;
      item.add(planter, trunk, leaves);
      if (n % 4 === 0) {
        const bench = ctx.box(1.6 * metre, 0.45 * metre, 0.5 * metre, ctx.palette.brown);
        // Beside the planter, along the edge, its long side to it.
        bench.position.set(faceZ !== 0 ? 1.6 * metre : 0, 0, faceX !== 0 ? 1.6 * metre : 0);
        if (faceX !== 0) bench.rotation.y = Math.PI / 2;
        item.add(bench);
      }
    } else {
      const post = ctx.column(0.08 * metre, 4.2 * metre, ctx.palette.steel, 6);
      const head = ctx.box(0.36 * metre, 0.22 * metre, 0.36 * metre, ctx.palette.cream);
      head.position.y = 4.2 * metre;
      item.add(post, head);
    }
    item.position.set(x, PAVING_RISE, z);
    group.add(item);
    n++;
  };
  const along = (fromX: number, fromZ: number, toX: number, toZ: number, faceX: number, faceZ: number): void => {
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    const count = Math.max(1, Math.round(length / SPACING));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const x = fromX + (toX - fromX) * t;
      const z = fromZ + (toZ - fromZ) * t;
      // The footprint's disc cuts a round model's box: keep to the ground both hold.
      if (Math.hypot(x, z) > shape.radius + APRON) continue;
      place(x, z, faceX, faceZ);
    }
  };
  along(shape.cx - edgeX, shape.cz + edgeZ, shape.cx + edgeX, shape.cz + edgeZ, 0, -1);
  along(shape.cx + edgeX, shape.cz + edgeZ, shape.cx + edgeX, shape.cz - edgeZ, -1, 0);
  along(shape.cx + edgeX, shape.cz - edgeZ, shape.cx - edgeX, shape.cz - edgeZ, 0, 1);
  along(shape.cx - edgeX, shape.cz - edgeZ, shape.cx - edgeX, shape.cz + edgeZ, 1, 0);
  return group;
}
