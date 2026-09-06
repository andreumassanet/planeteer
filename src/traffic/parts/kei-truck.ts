import type { Vehicle } from '../contract.ts';

/**
 * Kei truck — the cab-over microtruck.
 *
 * **The one silhouette in the kit with no bonnet at all**: the windscreen sits
 * over the front axle, so the profile starts vertical and the whole vehicle is
 * a tall thin cab with a flat deck behind it. That is 4.3 units long against a
 * hatchback's 5.0 while standing *taller* than it, which is a relation nothing
 * else here has, and it is why a Japanese street reads as a Japanese street with
 * one weight in the table.
 *
 * It seats a driver where the hatchback cannot, and the reason is the same
 * arithmetic run the other way: a cab-over puts the floor high and the roof
 * higher, so a seat at 1.12 has 1.30 of headroom under a 2.42 roof. The tallest
 * cars in this kit are the ones that fit people. Small is not the same as low.
 */

export const keiTruck: Vehicle = {
  id: 'kei-truck',
  name: 'Kei truck',
  kind: 'utility',
  size: [4.3, 1.88, 2.61],
  note: 'Cab over the front axle, flat deck behind. Short and tall, which nothing else here is.',

  mounts: [
    // 1.55 of clear width against a 1.46 elbow span: the narrowest cab in the
    // kit still holds exactly one rider, and holds him dead centre.
    { x: 0, y: 1.12, z: 0.86, yaw: 0, pose: 'sit', driver: true, headroom: 1.33, legroom: 0.6, beam: 1.55 },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);
    const load = rng.pick(style.cargo);

    const radius = 0.36;
    const track = 0.78;
    const length = rng.range(4.06, 4.24);
    const half = length / 2;
    const floor = 0.55;

    for (const z of [-half + 0.72, half - 0.78]) {
      for (const x of [-track, track]) {
        const tyre = wheel(radius, 0.26, rubber);
        tyre.position.set(x, radius, z);
        group.add(tyre);
      }
    }

    const chassis = solid({ color: rubber, width: 1.7, depth: length, height: 0.2 });
    chassis.position.y = floor - 0.2;
    group.add(chassis);

    // The cab. Vertical at the front — the whole point — and it stops dead where
    // the deck begins, so the step down is a hard ink line at mid-length.
    const cabHeight = rng.range(1.92, 2.04);
    const cab = solid({
      color: paint,
      width: 1.82,
      topWidth: 1.7,
      topForeWidth: 1.66,
      depth: 1.5,
      height: cabHeight,
      topFore: 0.62,
      topAft: -0.75,
    });
    cab.position.set(0, floor, half - 0.78);
    group.add(cab);

    // Glass as a band inset into the cab's own face rather than a plate on it:
    // proud by 0.05 so it has a shadow line, which is the coplanar rule.
    const screen = box(1.6, 0.68, 0.16, glass);
    screen.position.set(0, floor + cabHeight - 0.86, half - 0.05);
    group.add(screen);

    // The deck, and its dropsides. Three planks, and they are what make the
    // profile a *tray* rather than a second box.
    const deckLength = length - 1.6;
    const deckZ = -half + deckLength / 2 + 0.05;
    const wall = rng.range(0.36, 0.5);
    for (const side of [-1, 1]) {
      const plank = box(0.12, wall, deckLength, paint);
      plank.position.set(side * 0.88, floor, deckZ);
      group.add(plank);
    }
    const tail = box(1.76, wall, 0.12, paint);
    tail.position.set(0, floor, deckZ - deckLength / 2);
    group.add(tail);

    if (rng.chance(0.6)) {
      const crate = box(rng.range(1.0, 1.5), rng.range(0.4, 0.7), deckLength * rng.range(0.4, 0.7), load);
      crate.position.set(rng.jitter() * 0.14, floor + 0.02, deckZ + rng.jitter() * 0.25);
      group.add(crate);
    }

    return group;
  },
};
