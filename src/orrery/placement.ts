/** Placing the system for an instant: each planet on its ring, and the ecliptic frame in the world. */
import { centuriesSince2000, eclipticBasis, PRECESSION } from '../celestial.ts';
import { heliocentric, moonPosition } from '../system/index.ts';
import { DEG } from './constants.ts';
import type { OrreryCtx } from './ctx.ts';

/** Where every planet is on its ring now, in the ecliptic frame. */
function layOut(ctx: OrreryCtx, time: Date): void {
  const { built, planetsBuilt } = ctx;
  const t = centuriesSince2000(time);
  for (const b of planetsBuilt) {
    const h = heliocentric(b.entry.body.orbit!, time);
    const angle = (h.lon + PRECESSION * t) * DEG;
    b.local.set(Math.cos(angle) * b.entry.ring, Math.sin(angle) * b.entry.ring, 0);
    b.pivot?.position.copy(b.local);
  }
  // The Moon's ecliptic longitude and latitude (lambda, beta) are already of
  // date, so no precession; the frame is the ecliptic's, not `sphere.ts`'s.
  for (const b of built) {
    if (b.around === null) continue;
    const lunar = moonPosition(time);
    const lambda = lunar.lon * DEG;
    const beta = lunar.lat * DEG;
    b.local
      .set(Math.cos(beta) * Math.cos(lambda), Math.cos(beta) * Math.sin(lambda), Math.sin(beta))
      .multiplyScalar(b.entry.ring)
      .add(b.around.local);
    b.pivot?.position.copy(b.local);
    b.ring.position.copy(b.around.local);
  }
}

export function place(ctx: OrreryCtx, time: Date): void {
  const { basis, built, earth, earthBuilt, ex, ey, ez, group, north, sunEntry, sunUniform, sunWorld } = ctx;
  layOut(ctx, time);
  eclipticBasis(time, ex, ey, ez);
  // Earth sits on its ring at the origin of the world, so the Sun is the
  // origin minus Earth's own offset along the ring, turned into the world.
  const e = earthBuilt!.local;
  sunWorld.set(0, 0, 0).addScaledVector(ex, -e.x).addScaledVector(ey, -e.y);
  basis.makeBasis(ex, ey, ez).setPosition(sunWorld);
  group.matrix.copy(basis);
  group.matrixWorldNeedsUpdate = true;
  north.copy(ez);
  sunUniform.value.copy(sunWorld);
  sunEntry.position.copy(sunWorld);
  for (const b of built) b.entry.position.copy(b.local).applyMatrix4(basis);
  // Earth to the float, rather than to a rounding error of the sum above.
  earth.position.set(0, 0, 0);
}
