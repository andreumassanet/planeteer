import type { Vehicle } from '../contract.ts';

/**
 * Hand-cart: a tray on two large wheels with shafts running forward, tipped
 * down onto its shafts as a parked cart stands, so its profile is a wedge.
 *
 * No mount: a cart is pulled, not ridden. The shaft ends are at
 * `(+-0.34, 0.62, +L/2)`.
 */

export const handCart: Vehicle = {
  id: 'hand-cart',
  name: 'Hand-cart',
  kind: 'utility',
  size: [2.74, 1.76, 1.58],
  note: 'A tray on two wheels, tipped onto its shafts. No engine, and five regions want one.',
  mounts: [],

  build(ctx, rng, style) {
    const { THREE, solid, strut, ringWall, column, blob, tone } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();
    // Built in an inner frame that is slid back onto the origin at the end: the
    // shafts reach well past the tray, so a cart built about its axle is off-centre.
    const cart = new THREE.Group();
    group.add(cart);

    const timber = rng.pick(style.cargo);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);
    const load = rng.pick(style.cargo);

    const radius = rng.range(0.48, 0.54);
    const bed = rng.range(1.5, 1.7);
    const wide = rng.range(1.1, 1.3);

    // Two spoked wheels: an iron band, six spokes and a hub.
    for (const x of [-0.78, 0.78]) {
      const rim = ringWall(radius - 0.08, radius, 0.12, rubber, 12);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x + 0.06, radius, -0.1);
      cart.add(rim);
      const hub = column(0.09, 0.2, timber, 8);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x + 0.1, radius, -0.1);
      cart.add(hub);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.26;
        const reach = radius - 0.06;
        cart.add(strut(new V(x, radius, -0.1), new V(x, radius + Math.cos(a) * reach, -0.1 + Math.sin(a) * reach), 0.05, timber));
      }
    }
    cart.add(strut(new V(-0.78, radius, -0.1), new V(0.78, radius, -0.1), 0.1, metal));

    // The tray, tipped nose-down by `aftRise` in the geometry rather than by a
    // mesh rotation.
    const tip = rng.range(0.26, 0.34);
    const tray = solid({
      color: timber,
      width: wide,
      depth: bed,
      height: 0.16,
      aftRise: tip,
    });
    tray.position.y = radius + 0.18;
    cart.add(tray);

    // Sides, two planks, tipped with the tray.
    for (const side of [-1, 1]) {
      const plank = solid({
        color: timber,
        width: 0.1,
        depth: bed,
        height: rng.range(0.3, 0.46),
        aftRise: tip,
      });
      plank.position.set(side * (wide / 2 - 0.05), radius + 0.34, 0);
      cart.add(plank);
    }

    // The shafts, reaching the ground.
    for (const side of [-1, 1]) {
      cart.add(
        strut(
          new V(side * 0.34, radius + 0.24, bed / 2 - 0.1),
          new V(side * 0.34, 0.06, bed / 2 + 1.0),
          0.09,
          timber,
        ),
      );
    }

    // Always loaded (an empty cart would fall outside its declared height):
    // three sacks in two tones of one colour, lying with the tray's tip.
    const sackHeight = rng.range(0.44, 0.52);
    const sackRun = bed * rng.range(0.5, 0.8);
    for (let i = 0; i < 3; i++) {
      const across = i === 2 ? 0 : (i === 0 ? -1 : 1) * wide * 0.2;
      const along = i === 2 ? -sackRun * 0.25 : sackRun * 0.15;
      const sack = blob(wide * 0.24, sackHeight * (i === 2 ? 1 : 0.85), i === 1 ? tone(load, 0.85) : load, 0);
      sack.position.set(across, radius + 0.34 + tip * (0.5 - along / bed), along - 0.06);
      cart.add(sack);
    }

    // Centre the frame on the origin, measured since every dimension varies.
    const box3 = new THREE.Box3().setFromObject(cart);
    cart.position.z = -(box3.min.z + box3.max.z) / 2;

    return group;
  },
};
