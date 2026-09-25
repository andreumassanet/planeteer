import type { Vehicle } from '../contract.ts';

/**
 * Hand-cart.
 *
 * A tray on two large wheels with shafts running forward, and it stands where
 * it was left: **tipped down onto its shafts**, which is what a parked cart
 * does and what makes its profile a wedge instead of a rectangle. Level, it
 * would be a low box on wheels and indistinguishable from a trailer.
 *
 * The cheapest vehicle in the kit and the one carrying the most weight in five
 * region tables. There is no engine anywhere in it, which is the point: a road
 * whose traffic is all motorised is a road in one part of the world, and the
 * Maghreb, the Sahel, South Asia, Eastern Europe and Latin America all put a
 * hand-cart on the same street as a pickup.
 *
 * **No mount.** A cart is pulled, not ridden, and a person *pulling* something
 * is a standing pose with the hands at the shaft ends — a `grip` without a
 * seat, which the mount contract has no shape for and which belongs to whoever
 * poses the crowd rather than here. The shaft ends are at `(+-0.34, 0.62, +L/2)`
 * if anyone wants them.
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
    // Everything goes in an inner frame so the whole cart can be slid back onto
    // its own origin at the end. The shafts reach a unit and a half past the
    // tray and nothing else does, so a cart built about its axle sits half a
    // unit off-centre — which a placer would read as a cart parked in the ditch.
    const cart = new THREE.Group();
    group.add(cart);

    const timber = rng.pick(style.cargo);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);
    const load = rng.pick(style.cargo);

    const radius = rng.range(0.48, 0.54);
    const bed = rng.range(1.5, 1.7);
    const wide = rng.range(1.1, 1.3);

    // Two cart wheels, and they are spoked: an iron band round a felloe, six
    // spokes and a hub. A solid disc on a cart reads as a coin at any
    // distance, and the spokes are the one mark that says *hand-built*.
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

    // The tray, tipped nose-down. `aftRise` lifts the back edge, which is the
    // tip — done in the geometry rather than as a rotation on the mesh, because
    // a rotated mesh that also wanted a scale is the T*R*S trap and this file
    // would rather not have the option.
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

    // The shafts. Long, thin, and they reach the ground — which is what makes
    // the cart read as *parked* rather than as floating in mid-haul.
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

    // Always loaded. An empty cart and a full one differ by 0.24 of height,
    // which is most of the drift a declared box is allowed — and a cart with
    // nothing on it is a cart nobody has a reason to have left there.
    // The load as sacks, three lumps in two tones of one colour, lying with
    // the tray's tip.
    const sackHeight = rng.range(0.44, 0.52);
    const sackRun = bed * rng.range(0.5, 0.8);
    for (let i = 0; i < 3; i++) {
      const across = i === 2 ? 0 : (i === 0 ? -1 : 1) * wide * 0.2;
      const along = i === 2 ? -sackRun * 0.25 : sackRun * 0.15;
      const sack = blob(wide * 0.24, sackHeight * (i === 2 ? 1 : 0.85), i === 1 ? tone(load, 0.85) : load, 0);
      sack.position.set(across, radius + 0.34 + tip * (0.5 - along / bed), along - 0.06);
      cart.add(sack);
    }

    // Slide the frame so the model straddles its own origin, measured rather
    // than guessed: the shaft length, the tray length and the wheel radius all
    // vary between variants and so does the offset they produce.
    const box3 = new THREE.Box3().setFromObject(cart);
    cart.position.z = -(box3.min.z + box3.max.z) / 2;

    return group;
  },
};
