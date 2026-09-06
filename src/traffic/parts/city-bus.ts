import type { Vehicle } from '../contract.ts';

/**
 * City bus.
 *
 * **The longest thing in the kit at 14.6 units, and the number is the point:
 * that is 0.46 of a median settlement's whole radius.** A bus is not a big car,
 * it is a piece of infrastructure the size of two houses, and a placer has to
 * know that before it puts one on a bend — which is exactly why `size` carries a
 * length and not a bounding radius.
 *
 * One continuous roof line from nose to tail, which is what tells it from the
 * box truck of the same kind: the truck's profile steps up at the bulkhead and
 * the bus's never steps at all. What breaks up fourteen units of flank is the
 * **glazing band**, two meshes, running nearly the whole length at head height,
 * plus a door recess cut as its own mass.
 *
 * Colours are the binding budget here rather than triangles: paint, glass, tyre,
 * a band and the metal of the door is five, which is the `heavy` cap exactly.
 */

export const cityBus: Vehicle = {
  id: 'city-bus',
  name: 'City bus',
  kind: 'heavy',
  size: [14.76, 3.3, 3.58],
  note: 'One unbroken roof line for fourteen units. Two houses long, and a placer needs to know.',

  mounts: [
    // The only cab wide enough that the driver could sit off-centre — 2.82 of
    // clear width against a 1.46 elbow span — and he does not, because every
    // other one in the kit cannot and a placer should not have to care which.
    { x: 0, y: 1.86, z: 6.3, yaw: 0, pose: 'sit', driver: true, headroom: 1.6, legroom: 0.66, beam: 2.82 },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);
    const band = rng.pick(style.metal);

    const radius = 0.62;
    const track = 1.32;
    const length = rng.range(14.0, 14.5);
    const half = length / 2;
    const floor = 0.5;
    const roof = rng.range(2.9, 3.06);

    for (const x of [-track, track]) {
      const front = wheel(radius, 0.36, rubber);
      front.position.set(x, radius, half - 2.1);
      group.add(front);
      for (const z of [-half + 3.4, -half + 2.5]) {
        const back = wheel(radius, 0.36, rubber);
        back.position.set(x, radius, z);
        group.add(back);
      }
    }

    // One mass, both ends slightly drawn in. A bus with square ends reads as a
    // shipping container; 0.2 of taper at each end is enough to say vehicle.
    const body = solid({
      color: paint,
      width: 3.14,
      foreWidth: 3.0,
      topWidth: 3.06,
      topForeWidth: 2.92,
      depth: length,
      height: roof,
    });
    body.position.y = floor;
    group.add(body);

    // The glazing. Proud of the flank by 0.06, for the coplanar reason, and it
    // is the only thing standing between this and a fourteen-unit blank.
    for (const side of [-1, 1]) {
      const strip = box(0.12, 1.06, length - 1.3, glass);
      strip.position.set(side * 1.57, floor + roof - 1.26, 0);
      group.add(strip);
    }
    const screen = box(2.7, 1.2, 0.16, glass);
    screen.position.set(0, floor + roof - 1.42, half - 0.02);
    group.add(screen);
    const rear = box(2.7, 1.0, 0.16, glass);
    rear.position.set(0, floor + roof - 1.22, -half + 0.02);
    group.add(rear);

    // A livery band at waist height. One mesh a side, and it is what makes two
    // buses of different regions look like two different fleets.
    for (const side of [-1, 1]) {
      const stripe = box(0.14, rng.range(0.3, 0.5), length - 0.8, band);
      stripe.position.set(side * 1.58, floor + roof * 0.32, 0);
      group.add(stripe);
    }

    // The door, cut in as a recessed mass rather than painted on: a dark panel
    // flush with the flank is the trap, a panel set 0.1 *into* it has a line.
    const door = box(0.18, roof - 0.7, 1.1, glass);
    door.position.set(1.5, floor, half - 3.4);
    group.add(door);

    const bumper = box(2.94, 0.4, 0.24, rubber);
    bumper.position.set(0, 0.3, half + 0.06);
    group.add(bumper);

    return group;
  },
};
