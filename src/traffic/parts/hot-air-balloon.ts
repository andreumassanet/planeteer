import type { Vehicle } from '../contract.ts';

/**
 * Hot-air balloon.
 *
 * The one thing in the kit that is not on the ground, and by a long way the
 * largest: **20 units across against a two-storey house's 7.** That is not an
 * exaggeration, it is what a balloon is — a 16 m envelope beside a 6 m house —
 * and it is the clearest evidence that the kit's scale decision is the right one,
 * because at `SCENERY_SCALE` the balloon comes out enormous *and correct*
 * against the village under it without a single number being nudged.
 *
 * **The envelope is one lathe and the segment count is a deliberate reversal of
 * the usual answer.** The joint-count rule: few joints say natural, many say
 * manufactured. A balloon is the most manufactured object here — it is a sewn
 * assembly of panels — so it gets *twelve* sides where a boulder gets an
 * icosahedron, and the four profile rings read as panel courses rather than as
 * facets on a rock. The gores would be better still and cannot be had: a gore is
 * a mesh, and twelve alternating meshes is twelve draw calls for something there
 * will only ever be one of in the sky at a time, which is a trade worth making
 * for a monument and not for a kit part.
 *
 * The skirt is a second, cooler colour at the throat. It is doing the work a
 * gore pattern would: one horizontal ink line across the envelope, in a place
 * where the eye expects the balloon to change.
 *
 * The basket carries the only `stand` mount besides the pickup's bed, and it is
 * the easy case — nothing above the rider but sky.
 */

export const hotAirBalloon: Vehicle = {
  id: 'hot-air-balloon',
  name: 'Hot-air balloon',
  kind: 'air',
  size: [20.6, 20.6, 22.6],
  note: 'Twelve sides on purpose: a balloon is sewn, and few joints would read as rock.',

  mounts: [
    // The basket is 1.50 across at its narrowest variant and a standing rider's
    // elbows span 1.46. It fits by four hundredths of a unit, which is the
    // tightest clearance anywhere in the kit and is why the basket has a floor
    // on its width rather than a free range.
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
    // `box` already stands on y = 0 — the monument context's convention. Lifting
    // it by half its height is what made the first balloon float clear of the
    // ground by 0.63.
    group.add(box(basketWidth, basketHeight, basketWidth * 0.86, wicker));

    const mouth = rng.range(2.4, 2.9);
    const radius = rng.range(9.6, 10.3);
    const tall = rng.range(17.0, 18.6);
    const mouthY = rng.range(3.4, 3.9);
    const skirtH = tall * 0.34;
    const crownH = tall - skirtH;

    // Two closed lathes stacked, and the joint between them is the point. A
    // single lathe would be one blank curve twenty units across — the largest
    // flat area anything in this project has, and a flat area with no joint in
    // it renders as a blank patch, as Niagara's curtain did. The crown's foot
    // is pulled in to 0.94 of the skirt's shoulder so the two are not flush:
    // flush, `OutlineEffect` gives the joint no line at all and the second
    // colour is a painted band rather than a course.
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

    // Four ropes from the basket to the mouth ring. Thin enough to be pure ink,
    // and they are what turns two stacked shapes into one object.
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
