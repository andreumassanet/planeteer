import type { Vehicle } from '../contract.ts';

/**
 * Tractor.
 *
 * **The one vehicle in the kit whose wheels are not all the same size, and that
 * single asymmetry is the whole silhouette.** Rear 0.86, front 0.44 — nearly
 * two to one — so the profile rises from front to back in one step and reads as
 * a tractor at any distance where the wheels resolve at all, which is further
 * out than you would think because the rear wheel is the largest single mark on
 * anything here except a bus.
 *
 * It also carries the highest seat in the kit, at 1.78, in the open. That is
 * what a tractor is: a person sitting on top of an engine with nothing round
 * him, and it is the easiest mount in the file to satisfy because `headroom` is
 * the sky.
 */

export const farmTractor: Vehicle = {
  id: 'farm-tractor',
  name: 'Tractor',
  kind: 'utility',
  size: [3.86, 2.16, 2.76],
  note: 'Rear wheels twice the front. The only vehicle here that is not level on its axles.',

  mounts: [
    {
      x: 0,
      y: 1.78,
      z: -0.5,
      yaw: 0,
      pose: 'sit',
      driver: true,
      headroom: Infinity,
      legroom: 0.72,
      beam: Infinity,
      hats: true,
      footrest: [0.26, 1.06, 0.1],
      grip: [0, 2.2, 0.24],
    },
  ],

  build(ctx, rng, style) {
    const { THREE, box, column, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);

    const rear = rng.range(0.82, 0.9);
    const fore = rng.range(0.42, 0.48);
    const length = rng.range(3.5, 3.7);
    const half = length / 2;

    for (const x of [-0.86, 0.86]) {
      const tyre = wheel(rear, 0.38, rubber);
      tyre.position.set(x, rear, -half + 0.72);
      group.add(tyre);
    }
    for (const x of [-0.62, 0.62]) {
      const tyre = wheel(fore, 0.24, rubber);
      tyre.position.set(x, fore, half - 0.5);
      group.add(tyre);
    }

    // The bonnet: long, narrow and low, so the driver sits above and behind it
    // rather than inside anything. A tractor has no cabin here on purpose —
    // a glazed cab makes it a small lorry.
    const bonnet = solid({
      color: paint,
      width: 0.94,
      foreWidth: 0.86,
      topWidth: 0.8,
      depth: length * 0.62,
      height: 0.72,
    });
    bonnet.position.set(0, 0.86, half - length * 0.31);
    group.add(bonnet);

    const belly = solid({ color: metal, width: 1.06, depth: length * 0.8, height: 0.5 });
    belly.position.set(0, 0.5, 0.06);
    group.add(belly);

    // The mudguards over the rear wheels. Two meshes, and they are the mark
    // that stops the back of the tractor being two bare tyres and a gap.
    for (const x of [-0.86, 0.86]) {
      const guard = solid({
        color: paint,
        width: 0.44,
        depth: rear * 1.7,
        height: 0.22,
        topAft: -rear * 0.6,
        topFore: rear * 0.6,
      });
      guard.position.set(x, rear + 0.34, -half + 0.72);
      group.add(guard);
    }

    const seat = box(0.6, 0.18, 0.56, rubber);
    seat.position.set(0, 1.6, -0.5);
    group.add(seat);
    const backrest = box(0.6, 0.5, 0.14, rubber);
    backrest.position.set(0, 1.78, -0.82);
    group.add(backrest);

    // The exhaust stack. Thin, tall, and entirely ink at any real distance —
    // which is exactly why it earns its twelve triangles: it is the one
    // vertical line above the bonnet.
    const stack = column(0.09, rng.range(0.9, 1.16), metal, 6);
    stack.position.set(0.32, 1.58, half - length * 0.52);
    group.add(stack);

    const wheelRim = box(0.5, 0.08, 0.08, metal);
    wheelRim.position.set(0, 2.2, 0.24);
    group.add(wheelRim);

    return group;
  },
};
