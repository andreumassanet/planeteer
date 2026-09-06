import type { Vehicle } from '../contract.ts';

/**
 * Saloon — three boxes instead of two.
 *
 * The whole difference from the hatchback is one number: the cabin stops short
 * of the rear axle and a **boot deck** carries on behind it at shoulder height.
 * In plan and in mass the two cars are nearly the same object — which is exactly
 * why the kit measures distinctness on the **side elevation** rather than on the
 * bounding box, and the two come out at 0.83 overlap rather than the 0.94 two
 * variants of one model share. A box check would have called them the same car.
 *
 * Longer than the hatchback by most of that boot, and lower, because a saloon
 * that is as tall as it is long is a hatchback with a bustle.
 *
 * No mount: see the note in `hatchback.ts`. The arithmetic is the same and so is
 * the answer.
 */

export const saloonCar: Vehicle = {
  id: 'saloon-car',
  name: 'Saloon',
  kind: 'car',
  size: [5.9, 2.3, 1.99],
  note: 'Three boxes. The boot deck behind the cabin is the entire difference from a hatchback.',
  mounts: [],

  build(ctx, rng, style) {
    const { THREE, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);

    const radius = 0.44;
    const track = 1.01;
    const base = rng.range(1.66, 1.78);
    const length = rng.range(5.44, 5.6);
    const sill = 0.33;
    const shoulder = rng.range(1.24, 1.3);

    for (const z of [-base, base]) {
      for (const x of [-track, track]) {
        const tyre = wheel(radius, 0.28, rubber);
        tyre.position.set(x, radius, z);
        group.add(tyre);
      }
    }

    const body = solid({
      color: paint,
      width: 2.28,
      foreWidth: 2.16,
      topWidth: 2.14,
      topForeWidth: 2.04,
      depth: length,
      height: shoulder - sill,
    });
    body.position.y = sill;
    group.add(body);

    // The cabin is short and central. Both ends of the roof are pulled well
    // inboard, which is the rake at the front and the backlight at the rear —
    // and it is the pair of them that makes the boot a separate mass rather
    // than a step in one.
    const cabin = rng.range(2.14, 2.3);
    const roof = rng.range(0.6, 0.68);
    const house = solid({
      color: glass,
      width: 1.98,
      topWidth: 1.62,
      topForeWidth: 1.54,
      depth: cabin,
      height: roof,
      topAft: -cabin / 2 + 0.5,
      topFore: cabin / 2 - 0.62,
    });
    house.position.set(0, shoulder, -length * 0.04);
    group.add(house);

    // The boot lid, a low deck stepped 0.05 up from the body's top so the two
    // are not coplanar and the joint gets its line. Without the step this is a
    // painted rectangle on a flat deck and the car loses its third box.
    const boot = solid({
      color: paint,
      width: 2.02,
      topWidth: 1.9,
      depth: length * 0.3,
      height: 0.16,
    });
    boot.position.set(0, shoulder, -length / 2 + length * 0.15 - 0.02);
    group.add(boot);

    for (const sign of [-1, 1]) {
      const bumper = solid({
        color: rubber,
        width: 2.1,
        foreWidth: 1.96,
        topWidth: 2.16,
        depth: 0.2,
        height: 0.4,
      });
      bumper.position.set(0, sill - 0.07, sign * (length / 2 + 0.04));
      if (sign < 0) bumper.rotation.y = Math.PI;
      group.add(bumper);
    }

    return group;
  },
};
