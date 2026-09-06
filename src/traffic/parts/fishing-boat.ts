import type { Vehicle } from '../contract.ts';

/**
 * Fishing boat.
 *
 * Decked rather than open, so the hull is **one closed `solid`** — a narrow keel,
 * a wide sheer, a stem at the bow and a raised deck line — and the whole
 * eighteen-triangle body of the boat is that plus a transom. The rowing boat has
 * to be built plank by plank because you look into it; this you look *at*.
 *
 * The wheelhouse is set aft of centre and is the tallest mass, so the profile
 * rises from a long low bow to a block near the stern. Every other craft in the
 * kit is symmetric about its own middle; this is the one that is not, and that
 * asymmetry is what reads at 300 units from the air, where a moored fleet is
 * half a dozen marks in a harbour.
 *
 * The mast is a single `column` at six sides, thin enough that it is pure ink at
 * any distance — and it is the tallest thing in the water half of this kit, so
 * it is what puts a harbour on the skyline.
 */

export const fishingBoat: Vehicle = {
  id: 'fishing-boat',
  name: 'Fishing boat',
  kind: 'craft',
  size: [9.1, 2.9, 5.56],
  note: 'A closed hull with the wheelhouse aft. The one craft that is not symmetric.',
  mounts: [],

  build(ctx, rng, style) {
    const { THREE, box, column, solid, strut } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const deck = rng.pick(style.cargo);
    const trim = rng.pick(style.trim);
    const metal = rng.pick(style.metal);

    const length = rng.range(8.6, 9.1);
    const half = length / 2;
    const beam = rng.range(2.5, 2.76);
    const draft = rng.range(0.7, 0.86);
    const sheer = rng.range(0.86, 1.02);

    const hull = solid({
      color: paint,
      width: beam * 0.5,
      foreWidth: 0.16,
      topWidth: beam,
      topForeWidth: beam * 0.42,
      depth: length,
      height: draft + sheer,
      foreRise: draft * 0.55,
      topFore: half,
    });
    hull.position.y = -draft;
    group.add(hull);

    // A rubbing strake along the sheer. One mesh a side, proud by 0.08, and it
    // is the ink line that separates the hull's flank from its deck — flush,
    // the two are coplanar and the boat is one blank curve.
    for (const side of [-1, 1]) {
      const strake = box(0.16, 0.2, length * 0.8, trim);
      strake.position.set(side * (beam / 2 - 0.02), sheer - 0.18, -0.6);
      group.add(strake);
    }

    // The wheelhouse, aft of centre. This is the asymmetry the whole model is
    // built round, so it is deliberately not on the middle.
    const houseHeight = rng.range(1.4, 1.62);
    const house = solid({
      color: deck,
      width: beam * 0.66,
      topWidth: beam * 0.58,
      depth: length * 0.26,
      height: houseHeight,
      topFore: length * 0.1,
    });
    house.position.set(0, sheer, -half + length * 0.3);
    group.add(house);

    const screen = box(beam * 0.5, 0.46, 0.16, rng.pick(style.glass));
    screen.position.set(0, sheer + houseHeight - 0.54, -half + length * 0.3 + length * 0.13);
    group.add(screen);

    const mast = column(0.1, rng.range(2.6, 3.0), metal, 6);
    mast.position.set(0, sheer + houseHeight, -half + length * 0.3);
    group.add(mast);

    // A boom or a derrick off the mast, on most of them. It breaks the vertical
    // and turns one line into a mark.
    if (rng.chance(0.75)) {
      group.add(
        strut(
          new V(0, sheer + houseHeight + 1.6, -half + length * 0.3),
          new V(0, sheer + 0.6, half - length * 0.22),
          0.09,
          metal,
        ),
      );
    }

    if (rng.chance(0.6)) {
      // `deck` again rather than a second `cargo` pick: five colours is the
      // `craft` cap and paint, deck, trim, metal and glass have taken all five.
      const crate = box(beam * 0.5, 0.4, length * 0.14, deck);
      crate.position.set(rng.jitter() * 0.3, sheer, -half + length * 0.12);
      group.add(crate);
    }

    return group;
  },
};
