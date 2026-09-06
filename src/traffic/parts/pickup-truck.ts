import type { Vehicle } from '../contract.ts';

/**
 * Pickup.
 *
 * **The most distinct silhouette in the kit, and it costs nothing to get**: a
 * cab at the front and an open bed behind it, so the profile has a *hole* in the
 * middle where every car has mass. That hole is why the kit measures
 * distinctness by rasterising the side elevation rather than by sampling a
 * height along the length — a height field would fill the bed in and call this a
 * short estate car.
 *
 * Four region tables weight it top: North America, Oceania, the Maghreb and the
 * Middle East, and it is the same white pickup in all four. The regional signal
 * is entirely in what is *in* the bed and in the `paint` list, which is why the
 * load is a variant decision and not a detail.
 *
 * The bed also carries the one **standing** mount in the road half of the kit.
 * People riding in the back of a pickup is what a Sahelian road actually looks
 * like, and a standing rider needs no headroom argument at all: there is nothing
 * over him.
 */

export const pickupTruck: Vehicle = {
  id: 'pickup-truck',
  name: 'Pickup',
  kind: 'utility',
  size: [6.78, 2.5, 2.46],
  note: 'A cab and an open bed. The hole in the middle of the profile is the whole model.',

  mounts: [
    {
      x: 0,
      y: 1.16,
      z: -1.5,
      yaw: Math.PI,
      pose: 'stand',
      headroom: Infinity,
      legroom: 0,
      beam: Infinity,
      // Standing in an open bed: a hat and a headload both clear.
      hats: true,
    },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);
    const load = rng.pick(style.cargo);

    const radius = 0.52;
    const track = 1.08;
    const length = rng.range(6.34, 6.6);
    const half = length / 2;
    const sill = 0.56;
    const shoulder = 1.16;

    for (const z of [-half + 1.1, half - 1.35]) {
      for (const x of [-track, track]) {
        const tyre = wheel(radius, 0.34, rubber);
        tyre.position.set(x, radius, z);
        group.add(tyre);
      }
    }

    // The chassis: one mass the whole length, and everything else stands on it.
    const chassis = solid({
      color: paint,
      width: 2.44,
      foreWidth: 2.36,
      topWidth: 2.4,
      depth: length,
      height: shoulder - sill,
    });
    chassis.position.y = sill;
    group.add(chassis);

    // The bed walls, as a rim rather than a filled box, so the bed is open and
    // the profile keeps its hole. Three planks — two sides and a tailgate —
    // because a `rim` here would need a fourth against the cab and there is
    // already a cab there.
    const bedLength = length * 0.46;
    const bedZ = -half + bedLength / 2 + 0.1;
    const wall = 0.62;
    for (const side of [-1, 1]) {
      const plank = box(0.16, wall, bedLength, paint);
      plank.position.set(side * 1.16, shoulder, bedZ);
      group.add(plank);
    }
    const tailgate = box(2.4, wall, 0.16, paint);
    tailgate.position.set(0, shoulder, bedZ - bedLength / 2);
    group.add(tailgate);

    // The cab. Upright glass and a short bonnet ahead of it.
    const cabLength = length * 0.34;
    const cabZ = half - cabLength / 2 - 1.16;
    const cabHeight = rng.range(1.16, 1.28);
    const cab = solid({
      color: glass,
      width: 2.32,
      topWidth: 2.12,
      topForeWidth: 2.04,
      depth: cabLength,
      height: cabHeight,
      topAft: -cabLength / 2 + 0.05,
      topFore: cabLength / 2 - 0.5,
    });
    cab.position.set(0, shoulder, cabZ);
    group.add(cab);

    const bonnet = solid({
      color: paint,
      width: 2.36,
      foreWidth: 2.26,
      topWidth: 2.24,
      depth: 1.2,
      height: 0.2,
    });
    bonnet.position.set(0, shoulder, half - 0.62);
    group.add(bonnet);

    const bumper = solid({ color: rubber, width: 2.34, topWidth: 2.4, depth: 0.22, height: 0.56 });
    bumper.position.set(0, sill - 0.22, half + 0.06);
    group.add(bumper);

    // Something in the bed on most of them. Two thirds of the point of a pickup
    // is that it is carrying something, and at 120 units the load is the only
    // part of it that is not the same shape every time.
    if (rng.chance(0.66)) {
      const crate = box(rng.range(1.4, 1.9), rng.range(0.5, 0.86), bedLength * rng.range(0.5, 0.8), load);
      crate.position.set(rng.jitter() * 0.2, shoulder + 0.02, bedZ + rng.jitter() * 0.3);
      group.add(crate);
    }

    return group;
  },
};
