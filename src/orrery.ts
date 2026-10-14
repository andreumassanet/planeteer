/**
 * The solar system the front door opens on, built around the real Earth.
 *
 * Earth in this orrery is the planet itself, not a model of it: the menu draws
 * the world's own scene, so the land, the sea, the weather and the city lights
 * are already standing at the origin under the real sun. Everything here is laid
 * out around that (the Sun where it is seen from here, the other planets where
 * they are seen from the Sun), so the flight from the whole system down to a
 * country is one camera move over one scene.
 *
 * The directions are the sky's. Each planet's heliocentric longitude comes from
 * `system/orbits.ts`; the ecliptic of date is turned into this Earth-fixed world
 * by Greenwich sidereal time and the obliquity (`celestial.ts`). `verify()`
 * compares the Sun placed here with the one `sun.ts` lights the land with, which
 * is computed by a different route, so a mirror or a swapped axis shows.
 *
 * The distances and sizes are a diagram. At the world's scale Neptune is eleven
 * billion units away, so the planets stand on evenly spaced rings, each as far
 * from the last as the two planets on it need to clear each other (`ringsFor`),
 * and every planet but Earth is drawn on a gentle power of its real radius
 * (`drawnRadius`). The rings are one plane: inclinations are dropped.
 *
 * Eight meshes, a sprite and eight thin ribbons. The planets are geodesic
 * spheres painted once from their own `GroundModel` where they have one, drawn
 * by the same `outline.render` as everything else.
 *
 * Near Earth the rest steps back: everything but Earth fades on the approach
 * (the Sun and its glow too), except the body the camera was sent to (`focus`).
 * The fill turns transparent and keeps writing depth, which hides the inside of
 * its ink hull, and the hull takes the fill's opacity on its own.
 *
 * The modules live in `orrery/`.
 */

import { createOrreryCtx } from './orrery/ctx.ts';
import { cover, holdUpright } from './orrery/hold.ts';
import { extentOf } from './orrery/layout.ts';
import { updateOrrery, verifyOrrery } from './orrery/update.ts';
import type { Orrery } from './orrery/types.ts';

export { drawnRadius } from './orrery/layout.ts';
export type { HeldRegion, Orrery, OrreryBody } from './orrery/types.ts';

export function createOrrery(): Orrery {
  const ctx = createOrreryCtx();
  const { built, group, planetsBuilt, sunEntry } = ctx;
  return {
    group,
    bodies: [sunEntry, ...planetsBuilt.flatMap((p) => [p, ...built.filter((b) => b.around === p)]).map((b) => b.entry)],
    sun: sunEntry,
    earth: ctx.earth,
    north: ctx.north,
    axes: { x: ctx.ex, y: ctx.ey, z: ctx.ez },
    extent: (() => {
      const outer = planetsBuilt[planetsBuilt.length - 1]!;
      return outer.entry.ring + extentOf(outer.entry.body);
    })(),
    update: (time, camera, screenHeight, dt) => updateOrrery(ctx, time, camera, screenHeight, dt),
    highlight(id) {
      ctx.highlighted = id;
    },
    focus(id) {
      ctx.focused = id;
    },
    holdUpright: (id, regions) => holdUpright(ctx, id, regions),
    cover: (id) => cover(ctx, id),
    verify: (sunDirection) => verifyOrrery(ctx, sunDirection),
    dispose() {
      group.removeFromParent();
      ctx.heldTint?.dispose();
      for (const item of ctx.disposables) item.dispose();
    },
  };
}
