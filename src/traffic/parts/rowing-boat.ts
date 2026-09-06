import type { Vehicle } from '../contract.ts';

/**
 * Rowing boat — a skiff pulled up at a quay.
 *
 * **`y = 0` is the waterline, not the keel, and that is a contract rather than a
 * detail.** A placer drops a craft on the sea surface and the draft is what is
 * under it; the alternative — base at the keel — leaves every hull sitting on
 * top of the water like a bath toy and leaves the placer computing a sink depth
 * it has no way to know. `KINDS.craft.draft` is 1.2 and `validateVehicle` allows
 * exactly that much below zero and no more.
 *
 * **Built from five closed boxes rather than from an open shell**, and that is
 * the whole difficulty of an open boat in this renderer. `src/vehicles.ts`'s
 * launch solves it by being `DoubleSide`; this kit cannot, because the ink is an
 * inverted back-face hull and a double-sided material has no back faces to
 * invert. Looking down into an open shell made of single-sided planks, the far
 * plank's inner face is culled and you see the sea through the boat. Planks with
 * *thickness* have a real front-facing inner surface, cost twelve triangles each
 * instead of six, and are watertight from every angle.
 *
 * The oars are two struts and they are the mark that says rowing boat rather
 * than dinghy at the distance where the thwarts have stopped resolving.
 */

export const rowingBoat: Vehicle = {
  id: 'rowing-boat',
  name: 'Rowing boat',
  kind: 'craft',
  size: [4.52, 1.87, 0.71],
  note: 'Two tapered planks, a transom and a bottom. Waterline at y = 0, keel below it.',

  mounts: [
    // Open: the gunwale is 0.63 above the water and a seated rider's elbows are
    // half a unit above the thwart, so they are over the side rather than in it.
    { x: 0, y: 0.34, z: -0.3, yaw: 0, pose: 'sit', headroom: Infinity, legroom: 0.6, beam: Infinity, hats: true },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, strut } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();

    const timber = rng.pick(style.paint);
    const inside = rng.pick(style.cargo);
    const trim = rng.pick(style.trim);

    const length = rng.range(4.2, 4.5);
    const half = length / 2;
    const beam = rng.range(1.5, 1.68);
    const draft = rng.range(0.42, 0.52);
    // **Higher than the real thing, deliberately.** A 4 m dinghy has 0.35 m of
    // freeboard, which is 0.44 here — and at 40 units that is a ten-pixel band
    // carrying a two-pixel pen, so the boat rendered as a flat slab with a line
    // round it. At 0.66 there is something above the water to be a boat with.
    const freeboard = rng.range(0.63, 0.7);

    // The bottom, tapering in plan to a stem. One `solid`, and its `foreRise`
    // is the rocker that lifts the bow clear of the water.
    const bottom = solid({
      color: timber,
      width: beam * 0.62,
      foreWidth: 0.12,
      topWidth: beam * 0.72,
      topForeWidth: 0.2,
      depth: length,
      height: 0.2,
      foreRise: draft * 0.7,
    });
    bottom.position.y = -draft;
    group.add(bottom);

    // The two sides, straight planks converging on the stem. Rotated about Y and
    // never scaled — a mesh that carries both is the T*R*S trap.
    const sweep = Math.atan2(beam / 2, length * 0.92);
    for (const side of [-1, 1]) {
      const plank = box(0.14, draft + freeboard, length * 0.98, timber);
      plank.position.set((side * beam) / 4, -draft, -0.04);
      plank.rotation.y = -side * sweep;
      group.add(plank);
    }

    const transom = box(beam * 0.74, draft + freeboard, 0.14, timber);
    transom.position.set(0, -draft, -half + 0.07);
    group.add(transom);

    // The sole: a dark floor between the planks, which is what an open boat
    // reads as from above and stops the inside being a bright slot.
    const sole = box(beam * 0.6, 0.1, length * 0.72, inside);
    // On the bottom, not floating in the middle of the hull: the sole is what
    // a rider's feet reach, and the 0.58 of shin under the thwart is measured
    // from here.
    sole.position.set(0, -draft + 0.06, -0.1);
    group.add(sole);

    const thwarts = rng.between(1, 2);
    for (let i = 0; i < thwarts; i++) {
      const thwart = box(beam * 0.82, 0.12, 0.3, inside);
      thwart.position.set(0, 0.22, -0.3 + i * 0.9);
      group.add(thwart);
    }

    // Oars stowed inboard rather than shipped out, and that is a declaration
    // decision as much as a picture of a moored boat: blades out, the measured
    // width went from 1.68 to 2.75 and the declared box would have reserved
    // nearly three units of quay for a boat 1.7 across.
    for (const side of [-1, 1]) {
      group.add(
        strut(
          new V(side * 0.34, 0.2, -half + 0.4),
          new V(side * 0.18, 0.24, half - 0.9),
          0.09,
          trim,
        ),
      );
    }

    return group;
  },
};
