import type { Vehicle } from '../contract.ts';

/**
 * Panel van.
 *
 * One box from the windscreen to the back doors and no window in any of it —
 * which is exactly what makes it read at distance: **a van is the only road
 * vehicle in the kit whose glass is confined to the front sixth of its length.**
 * Every car has a band of dark running most of the way along it; a van has a
 * dark patch at one end and a blank flank. That single fact separates it from a
 * minibus of nearly identical size, and the pair land 0.79 apart on the
 * side-elevation overlap because the profile is the same and the *glazing* is
 * not — which is the one difference the silhouette measure cannot see, and the
 * reason it is not the only thing this kit is judged on.
 *
 * The roof is high enough to seat a driver, which by now is the pattern: the
 * tall vehicles carry people and the low ones do not.
 */

export const panelVan: Vehicle = {
  id: 'panel-van',
  name: 'Panel van',
  kind: 'utility',
  size: [6.35, 2.58, 3.02],
  note: 'One blank box with a windscreen at one end. No side glass at all, which is the read.',

  mounts: [
    { x: 0, y: 1.32, z: 2.1, yaw: 0, pose: 'sit', driver: true, headroom: 1.4, legroom: 0.6, beam: 2.1 },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);

    const radius = 0.44;
    const track = 1.02;
    const length = rng.range(5.94, 6.16);
    const half = length / 2;
    const sill = 0.5;
    const roof = rng.range(2.36, 2.5);

    for (const z of [-half + 1.0, half - 1.3]) {
      for (const x of [-track, track]) {
        const tyre = wheel(radius, 0.3, rubber);
        tyre.position.set(x, radius, z);
        group.add(tyre);
      }
    }

    // The body. The nose falls away below the screen — a short snout, not a
    // cab-over — and the roof is flat to the tail.
    const body = solid({
      color: paint,
      width: 2.42,
      foreWidth: 2.22,
      topWidth: 2.3,
      topForeWidth: 1.98,
      depth: length,
      height: roof,
      topFore: half - 1.0,
    });
    body.position.y = sill;
    group.add(body);

    const snout = solid({
      color: paint,
      width: 2.2,
      foreWidth: 2.06,
      topWidth: 2.06,
      depth: 1.1,
      height: 0.72,
    });
    snout.position.set(0, sill, half - 0.5);
    group.add(snout);

    const screen = solid({
      color: glass,
      width: 2.0,
      topWidth: 1.9,
      depth: 0.24,
      height: 0.94,
      topFore: -0.28,
    });
    screen.position.set(0, sill + 0.72, half - 1.02);
    group.add(screen);

    const bumper = box(2.22, 0.4, 0.24, rubber);
    bumper.position.set(0, 0.34, half + 0.06);
    group.add(bumper);

    // A stripe along the flank, because a blank van side is the largest flat
    // area in the kit and at 40 units it is a cream rectangle saying nothing.
    // One `pick` outside the loop, not one inside it. Drawing per side gave the
    // two flanks *different* colours — invisible from either side, and a fifth
    // palette entry that quietly broke the colour budget.
    const flash = rng.pick(style.metal);
    for (const side of [-1, 1]) {
      const stripe = box(0.1, 0.34, length * 0.62, flash);
      stripe.position.set(side * 1.24, sill + roof * 0.52, -0.3);
      group.add(stripe);
    }

    return group;
  },
};
