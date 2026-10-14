import type { Vehicle } from '../contract.ts';

/**
 * Hot-air balloon: the only part off the ground, and by far the largest, at
 * true scale against the houses below.
 *
 * The envelope is two stacked lathes of twelve sides: a skirt in a second,
 * cooler colour at the throat and the crown above it, offset so the joint gets
 * an ink line. The basket carries a `stand` mount.
 */

export const hotAirBalloon: Vehicle = {
  id: 'hot-air-balloon',
  name: 'Hot-air balloon',
  kind: 'air',
  size: [20.6, 20.6, 22.6],
  note: 'Twelve sides on purpose: a balloon is sewn, and few joints would read as rock.',

  mounts: [
    // The narrowest basket (1.50) only just clears a standing rider's elbows (1.46).
    { x: 0, y: 0.28, z: 0, yaw: 0, pose: 'stand', headroom: Infinity, legroom: 0, beam: 1.5, hats: true },
  ],

  build(ctx, rng, style) {
    const { THREE, box, lathe, strut } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();

    const skin = rng.pick(style.paint);
    const skirtColor = rng.pick(style.metal);
    const wicker = rng.pick(style.cargo);
    const rope = rng.pick(style.trim);

    const basketWidth = rng.range(1.5, 1.8);
    const basketHeight = rng.range(1.2, 1.4);
    // `box` already stands on y = 0.
    group.add(box(basketWidth, basketHeight, basketWidth * 0.86, wicker));

    const mouth = rng.range(2.4, 2.9);
    const radius = rng.range(9.6, 10.3);
    const tall = rng.range(17.0, 18.6);
    const mouthY = rng.range(3.4, 3.9);
    const skirtH = tall * 0.34;
    const crownH = tall - skirtH;

    // Two closed lathes stacked; one would be a blank curve twenty units
    // across. The crown's foot is pulled in to 0.94 of the skirt's shoulder so
    // the two are not flush and the outline draws the joint.
    const skirt = lathe(
      [
        [0, 0],
        [mouth, 0],
        [radius * 0.74, skirtH * 0.55],
        [radius * 0.97, skirtH],
        [0, skirtH],
      ],
      skirtColor,
      12,
    );
    skirt.position.y = mouthY;
    group.add(skirt);

    const crown = lathe(
      [
        [0, 0],
        [radius * 0.94, 0],
        [radius, crownH * 0.22],
        [radius * 0.82, crownH * 0.55],
        [radius * 0.36, crownH * 0.85],
        [0, crownH],
      ],
      skin,
      12,
    );
    crown.position.y = mouthY + skirtH - 0.06;
    group.add(crown);

    // Four ropes from the basket to the mouth ring.
    for (const [dx, dz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      group.add(
        strut(
          new V((dx * basketWidth) / 2.2, basketHeight, (dz * basketWidth) / 2.6),
          new V(dx * mouth * 0.62, mouthY + 0.15, dz * mouth * 0.62),
          0.1,
          rope,
        ),
      );
    }

    const burner = box(0.5, 0.6, 0.5, rope);
    burner.position.set(0, basketHeight + 0.6, 0);
    group.add(burner);

    return group;
  },
};
