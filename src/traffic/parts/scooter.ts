import type { Vehicle } from '../contract.ts';

/**
 * Scooter.
 *
 * **The most common vehicle on Earth and the one this kit would be wrong
 * without.** Three of the fourteen region tables weight it above every car put
 * together, and that one column does more for a Southeast Asian street than any
 * amount of modelling would: same geometry, same palette, a road that is
 * obviously not in Norway.
 *
 * A step-through, not a motorbike, and the difference is the whole silhouette:
 * the frame dives to a **flat floor between the wheels** and the mass is a
 * single blister behind the rider instead of a tank in front of him. That gap of
 * daylight under the handlebars is what tells it from a bicycle at 120 units,
 * where neither has any resolvable detail left.
 *
 * Smaller wheels than the bicycle — 0.34 against 0.42 — and they still cost 64
 * of its 148 triangles.
 */

const WHEEL = 0.34;

export const scooter: Vehicle = {
  id: 'scooter',
  name: 'Scooter',
  kind: 'cycle',
  size: [2.55, 0.75, 1.36],
  note: 'A step-through with a flat floor. Weighted above every car in three regions.',

  mounts: [
    {
      x: 0,
      y: 1.05,
      z: -0.36,
      yaw: 0,
      pose: 'astride',
      driver: true,
      headroom: Infinity,
      // The floorboard, not the ground: a scooter's rider has somewhere to put
      // his feet and it is 0.34 up.
      legroom: 0.65,
      beam: Infinity,
      footrest: [0.2, 0.4, 0.28],
      grip: [0, 1.16, 0.78],
    },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel, strut } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);

    const rear = -0.86;
    const front = rng.range(0.84, 0.92);

    for (const z of [rear, front]) {
      const tyre = wheel(WHEEL, 0.16, rubber);
      tyre.position.set(0, WHEEL, z);
      group.add(tyre);
    }

    // The floor. Low, flat and the length of the gap between the wheels — this
    // is the mark that says step-through rather than motorbike.
    const floor = solid({ color: paint, width: 0.56, depth: 1.05, height: 0.12 });
    floor.position.set(0, 0.28, 0.16);
    group.add(floor);

    // The body behind the rider, tapering down to the tail. `solid` rather than
    // a box so the tail falls away: a scooter read from behind is a wedge.
    const body = solid({
      color: paint,
      width: 0.62,
      foreWidth: 0.7,
      topWidth: 0.5,
      topForeWidth: 0.62,
      depth: 1.1,
      height: 0.62,
      aftRise: 0.1,
    });
    body.position.set(0, 0.36, -0.5);
    group.add(body);

    // The legshield, and it leans back rather than standing up — a vertical
    // plate reads as a sign on a post.
    const shield = solid({
      color: paint,
      width: 0.62,
      topWidth: 0.5,
      depth: 0.22,
      height: 0.78,
      topAft: 0.02,
      topFore: 0.2,
    });
    shield.position.set(0, 0.3, 0.64);
    group.add(shield);

    const seat = box(0.4, 0.14, 0.66, rubber);
    seat.position.set(0, 0.98, -0.36);
    group.add(seat);

    const bars = box(0.62, 0.09, 0.09, metal);
    bars.position.set(0, 1.16, 0.78);
    group.add(bars);
    group.add(strut(new V(0, 1.16, 0.78), new V(0, WHEEL, front), 0.1, metal));

    // A top box on half of them. It is the only thing that changes the
    // silhouette's tail, and half a region's scooters carrying one is what a
    // delivery street looks like.
    if (rng.chance(0.5)) {
      const boxTop = box(0.44, rng.range(0.3, 0.38), 0.4, rng.pick(style.cargo));
      boxTop.position.set(0, 0.96, -0.82);
      group.add(boxTop);
    }

    return group;
  },
};
