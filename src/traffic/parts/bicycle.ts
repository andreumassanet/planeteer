import type { Vehicle } from '../contract.ts';

/**
 * Bicycle.
 *
 * The smallest thing in the kit and the one that argues hardest for the whole
 * approach: **a bicycle has almost no volume, so it is entirely ink.** Six tubes
 * of 0.08 units are half a pixel wide at 120 units and would render as nothing
 * at all if `OutlineEffect` were not drawing a two-pixel pen down each of them.
 * That is why it is built out of struts rather than out of a flat plate with a
 * bike painted on it: the pen only follows a silhouette, and a plate has one
 * silhouette where a frame has seven.
 *
 * The wheels are 64 of its 160 triangles — 40% of the model in the two parts
 * that are 6 pixels across at the distance most bicycles are seen from. That
 * ratio is the wheel trap in `CLAUDE.md` and it is worse here than on any car,
 * because a bicycle *is* two wheels and cannot be given fewer.
 *
 * What varies between variants: the frame colour, whether the top tube is level
 * (a diamond frame) or dropped (a step-through), the saddle height inside the
 * range a rider can still reach the crank from, and a basket. What is left to
 * the instance: position, yaw, and the lean against a wall, which is a rotation
 * the placer owns.
 */

const WHEEL = 0.42;
const REAR = -0.82;
const FRONT = 0.82;

export const bicycle: Vehicle = {
  id: 'bicycle',
  name: 'Bicycle',
  kind: 'cycle',
  size: [2.5, 0.55, 1.35],
  note: 'Six tubes and two wheels. Almost entirely outline, which is why it works at all.',

  mounts: [
    {
      x: 0,
      y: 1.12,
      z: -0.5,
      yaw: 0,
      pose: 'astride',
      driver: true,
      // Nothing under a saddle but the road, so the shins have the whole of it.
      headroom: Infinity,
      legroom: 1.12,
      // Nothing either side of a saddle, so the elbows are the sky's problem.
      beam: Infinity,
      // The crank. Published because the crowd agent asked for the pedal
      // position rather than guessing the two joint angles of an astride pose.
      footrest: [0.16, 0.32, -0.08],
      grip: [0, 1.2, 0.6],
    },
  ],

  build(ctx, rng, style) {
    const { THREE, box, wheel, strut } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);

    for (const z of [REAR, FRONT]) {
      const tyre = wheel(WHEEL, 0.09, rubber);
      tyre.position.set(0, WHEEL, z);
      group.add(tyre);
    }

    const crank = new V(0, 0.32, -0.08);
    const rearHub = new V(0, WHEEL, REAR);
    const frontHub = new V(0, WHEEL, FRONT);
    // A step-through is not a smaller diamond: the top tube runs from the head
    // down to the seat tube's foot instead of to its top, and the gap it leaves
    // is the whole silhouette difference. Both are one strut either way.
    const stepThrough = rng.chance(0.4);
    const saddleY = rng.range(1.06, 1.2);
    const saddle = new V(0, saddleY, -0.5);
    const head = new V(0, 1.2, 0.6);

    const tube = 0.085;
    group.add(strut(crank, saddle, tube, paint)); // seat tube
    group.add(strut(crank, head, tube, paint)); // down tube
    group.add(strut(stepThrough ? crank : saddle, head, tube * 0.9, paint)); // top tube
    group.add(strut(crank, rearHub, tube * 0.8, paint)); // chainstay
    group.add(strut(saddle, rearHub, tube * 0.75, paint)); // seat stay
    group.add(strut(head, frontHub, tube * 0.8, metal)); // fork

    const seat = box(0.28, 0.11, 0.5, rubber);
    seat.position.set(0, saddleY, -0.5);
    group.add(seat);

    const bars = box(0.52, 0.09, 0.09, metal);
    bars.position.set(0, 1.26, 0.6);
    group.add(bars);

    // A basket is the one piece of volume a bicycle has, and it is worth its
    // twelve triangles for exactly that: it gives the front of the silhouette
    // something to be at the distance the tubes have stopped resolving.
    if (rng.chance(0.45)) {
      const basket = box(0.36, 0.26, 0.3, metal);
      basket.position.set(0, 1.05, 0.72);
      group.add(basket);
    }

    return group;
  },
};
