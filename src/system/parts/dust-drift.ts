/**
 * A drift: dust piled against nothing, in the lee of itself.
 *
 * The cheapest thing that says a planet has weather, and the only decoration
 * here with no vertical feature at all — which is deliberate. A field of these
 * is what makes the *ground* read as loose rather than as painted, and the
 * argument is the outermost vegetation ring's: past some range the colour
 * carries the thing and the geometry is noise, so a drift is drawn as a change
 * of *value* on the surface rather than as an object standing on it.
 *
 * Its crest is asymmetric — the windward face long and the slip face short —
 * because a symmetric dune is a hill and the asymmetry is the only thing in it
 * that names a direction.
 */
import type { Decoration } from '../contract.ts';

export const DUST_DRIFT: Decoration = {
  id: 'dust-drift',
  footprint: 6.5,
  bodies: [],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const span = rng.range(4.0, 9.0);
    const rise = rng.range(0.34, 0.95);
    const yaw = rng.range(0, Math.PI * 2);

    // A wedge, not a dome: the slip face is one plane and it is the one the
    // pen draws. `roof` gives it a ridge offset from the centre, which is the
    // asymmetry.
    const ridge = ctx.roof(span, span * rng.range(0.3, 0.5), rise, span * 0.22, look.cap);
    ridge.rotation.y = yaw;
    group.add(ridge);

    const apron = ctx.taper(span * 0.62, span * 0.5, rise * 0.22, look.cap, 6);
    apron.rotation.y = yaw + 0.4;
    group.add(apron);

    if (rng.chance(0.55)) {
      const tail = ctx.roof(span * 0.5, span * 0.22, rise * 0.5, span * 0.12, look.cap);
      tail.rotation.y = yaw + rng.jitter() * 0.3;
      tail.position.set(Math.sin(yaw) * span * 0.5, 0, Math.cos(yaw) * span * 0.5);
      group.add(tail);
    }
    return group;
  },
};
