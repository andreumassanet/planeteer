/**
 * What stands round a landmark in the country: a ring of lamps on the grass.
 *
 * A landmark in a town stands in a parcel of the town's own cells, which the
 * town paves, keeps its streets round and plants (`landmarkParcel` in
 * `scenery/grid.ts`, `settlements.ts`); nothing here is built for one. A
 * landmark out of every town stands on the ground, with the grass up to its
 * walls and the wood a few strides off.
 *
 * The landmarks the source lists in `plazas` that stand in the country
 * (`setting: 'plaza'` in `monuments.json`) get only the lamps: posts round the
 * plan, `LAMP_OFFSET` past its edge and at most `SPACING` apart, each standing
 * from `POST_FOOT` under the ground so a post meets the land wherever it is
 * drawn. They are lit after dark like a town's street lamps
 * (`landmark-lights.ts` finds them by the `atlasLit` mark on each head), built
 * from the monument context's primitives and merged into the monument's mesh
 * (`placement.ts`), so they cost no draw call and stand and fall with it.
 */
import * as THREE from 'three';
import type { MonumentContext } from './monuments/contract.ts';
import { planShape } from './landmark-ground.ts';
import type { Plan } from './landmark-ground.ts';
import { SCENERY_SCALE } from './stature.ts';

/** How far past the plan the lamps stand, in world units: a stride or two off the walls. */
export const LAMP_OFFSET = 3;
/** Lamps along an edge, at most this far apart. */
const SPACING = 16;
/** How far under the ground a post starts, so the drawn land never leaves it standing on air. */
const POST_FOOT = 2;

/** What the lamps need to know about where they are. */
export interface SettingSite {
  footprint?: number;
  plan?: Plan;
}

/**
 * Builds a landmark's lamps as one group in the model's frame, or null for a
 * site with no plan to set them round. Deterministic: nothing is drawn at
 * random, so the monument's cached geometry and the walls measured off it hold.
 */
export function buildSetting(ctx: MonumentContext, site: SettingSite, region: string): THREE.Group | null {
  if (site.plan === undefined || region === 'polar') return null;
  const shape = planShape(site);
  const group = new THREE.Group();
  const metre = SCENERY_SCALE;
  const edgeX = shape.hx + LAMP_OFFSET;
  const edgeZ = shape.hz + LAMP_OFFSET;
  const height = 4.2 * metre;

  const lamp = (x: number, z: number): void => {
    const item = new THREE.Group();
    const post = ctx.column(0.08 * metre, height + POST_FOOT, ctx.palette.steel, 6);
    post.position.y = -POST_FOOT;
    const head = ctx.box(0.36 * metre, 0.22 * metre, 0.36 * metre, ctx.palette.cream);
    head.position.y = height;
    // Lit after dark: the scenery's `lit` mark, which the monument context
    // has no helper for. `bakeNight` (`landmark-lights.ts`) finds it in the
    // merge, burns the head till dawn and hangs a lamp's light under it.
    head.userData.atlasLit = 1;
    item.add(post, head);
    item.position.set(x, 0, z);
    group.add(item);
  };
  const along = (fromX: number, fromZ: number, toX: number, toZ: number): void => {
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    const count = Math.max(1, Math.round(length / SPACING));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const x = fromX + (toX - fromX) * t;
      const z = fromZ + (toZ - fromZ) * t;
      // The footprint's disc cuts a round model's box: keep to the ground both hold.
      if (Math.hypot(x, z) > shape.radius + LAMP_OFFSET * 2) continue;
      lamp(x, z);
    }
  };
  along(shape.cx - edgeX, shape.cz + edgeZ, shape.cx + edgeX, shape.cz + edgeZ);
  along(shape.cx + edgeX, shape.cz + edgeZ, shape.cx + edgeX, shape.cz - edgeZ);
  along(shape.cx + edgeX, shape.cz - edgeZ, shape.cx - edgeX, shape.cz - edgeZ);
  along(shape.cx - edgeX, shape.cz - edgeZ, shape.cx - edgeX, shape.cz + edgeZ);
  return group.children.length > 0 ? group : null;
}
