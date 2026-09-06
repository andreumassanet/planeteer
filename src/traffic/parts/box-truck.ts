import type { Vehicle } from '../contract.ts';

/**
 * Box truck.
 *
 * Two masses with a **step between them**, and the step is the model: a cab
 * about a fifth of the length, then a box body that is taller and wider than
 * the cab is, so the profile jumps up at the bulkhead and stays there. Every
 * other long vehicle in the kit — the bus — is one continuous roof line, which
 * is why the two do not collide on the silhouette table despite being the same
 * kind and nearly the same size.
 *
 * The body is a **single flat flank six units long**, and that is the largest
 * uninterrupted bright area anything in this kit has. `CLAUDE.md` records what
 * happens to those: Niagara's American curtain was four coplanar slabs and read
 * as one blank rectangle. So the flank gets a horizontal rail proud of it by
 * 0.08 — one mesh, one ink line down the whole side, and the box stops being a
 * painted brick.
 *
 * A driver, because the cab is tall enough. See `boxy-suv` for the arithmetic;
 * everything above about 2.4 units of roof seats a rider and everything below
 * it does not.
 */

export const boxTruck: Vehicle = {
  id: 'box-truck',
  name: 'Box truck',
  kind: 'heavy',
  size: [9.72, 3.04, 3.75],
  note: 'A short cab and a tall box, with a hard step between them. One rail down the flank.',

  mounts: [
    { x: 0, y: 1.62, z: 3.4, yaw: 0, pose: 'sit', driver: true, headroom: 1.4, legroom: 0.62, beam: 2.18 },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);
    const shell = rng.pick(style.metal);

    const radius = 0.56;
    const track = 1.2;
    const length = rng.range(9.1, 9.5);
    const half = length / 2;
    const frame = 0.78;

    // Six wheels: one front axle and a twinned rear. The doubled rear pair is
    // 64 triangles for a detail nobody will name, and it is worth it for the
    // one thing it does say — this is a lorry and not a very long van.
    for (const x of [-track, track]) {
      const front = wheel(radius, 0.34, rubber);
      front.position.set(x, radius, half - 1.5);
      group.add(front);
      for (const z of [-half + 2.5, -half + 1.6]) {
        const back = wheel(radius, 0.34, rubber);
        back.position.set(x, radius, z);
        group.add(back);
      }
    }

    const chassis = solid({ color: rubber, width: 2.3, depth: length, height: 0.24 });
    chassis.position.y = frame - 0.24;
    group.add(chassis);

    const cabLength = rng.range(2.0, 2.2);
    const cabHeight = rng.range(1.9, 2.06);
    const cab = solid({
      color: paint,
      width: 2.5,
      foreWidth: 2.34,
      topWidth: 2.36,
      topForeWidth: 2.14,
      depth: cabLength,
      height: cabHeight,
      topFore: cabLength / 2 - 0.34,
    });
    cab.position.set(0, frame, half - cabLength / 2);
    group.add(cab);

    const screen = box(2.16, 0.86, 0.16, glass);
    screen.position.set(0, frame + cabHeight - 1.1, half - 0.08);
    group.add(screen);

    // The box. Taller and wider than the cab: the step is what the whole model
    // is for and making it flush would give a very long van.
    const bodyLength = length - cabLength - 0.2;
    const bodyHeight = rng.range(2.7, 2.94);
    const body = solid({ color: shell, width: 2.86, depth: bodyLength, height: bodyHeight });
    body.position.set(0, frame, -half + bodyLength / 2 + 0.1);
    group.add(body);

    // The rail. See the note above — this is the coplanar trap paid off for
    // twelve triangles.
    for (const side of [-1, 1]) {
      const rail = box(0.16, 0.24, bodyLength * 0.94, paint);
      rail.position.set(side * 1.43, frame + bodyHeight * 0.6, -half + bodyLength / 2 + 0.1);
      group.add(rail);
    }

    const bumper = box(2.4, 0.44, 0.26, rubber);
    bumper.position.set(0, frame - 0.5, half + 0.06);
    group.add(bumper);

    return group;
  },
};
