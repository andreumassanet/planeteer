import type { Vehicle } from '../contract.ts';

/**
 * Hatchback — the small city car, and the reference the other two cars are
 * different *from*.
 *
 * Two boxes: a body and a greenhouse. That is the whole model, and the three
 * things that make it a hatchback rather than a saloon are all in where the
 * second box sits — **the cabin is set back, the tail is short, and the roof
 * runs all the way to it**, so the profile behind the rear wheel is one steep
 * fall from roof to bumper instead of a step down onto a boot.
 *
 * **The greenhouse is a separate, narrower mass and that is not a style choice,
 * it is the coplanar trap in `CLAUDE.md`.** Glass modelled as a thin panel flush
 * with the body side is two coplanar faces: `OutlineEffect` hulls each mesh on
 * its own, the expanded hull loses the depth test against its neighbour, and the
 * window renders as a flat colour patch with no line round it — the largest
 * bright area on the model, saying nothing. Inset the glass as its own mass and
 * the window band gets an ink line the whole way round for no extra mesh at all.
 * It is also, conveniently, what a car looks like.
 *
 * **No mount, and the reason is arithmetic rather than laziness.** A seated
 * rider at `RIDER_SCALE` needs 0.56 below the seat and 1.29 above it; a cabin
 * floor sits at 0.36 (the ground clearance), so the seat is at 0.92 and the roof
 * would have to be at 2.21 — which is 1.75 m, a crossover. Every low car in the
 * kit would have to become one. `boxy-suv` is tall enough and carries a driver;
 * this is not and does not, and at 40 units the difference is a windscreen you
 * cannot see into either way.
 */

export const hatchback: Vehicle = {
  id: 'hatchback',
  name: 'Hatchback',
  kind: 'car',
  size: [5.16, 2.22, 2.13],
  note: 'Cabin set back, roof to the tail, no boot. The small car eight regions run on.',
  mounts: [],

  build(ctx, rng, style) {
    const { THREE, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);

    const radius = 0.42;
    const track = 0.98;
    const base = rng.range(1.4, 1.5);
    const length = rng.range(4.68, 4.86);
    const sill = 0.34;
    const shoulder = rng.range(1.28, 1.36);

    for (const z of [-base, base]) {
      for (const x of [-track, track]) {
        const tyre = wheel(radius, 0.26, rubber);
        tyre.position.set(x, radius, z);
        group.add(tyre);
      }
    }

    const body = solid({
      color: paint,
      width: 2.22,
      foreWidth: 2.1,
      topWidth: 2.06,
      topForeWidth: 1.98,
      depth: length,
      height: shoulder - sill,
    });
    body.position.y = sill;
    group.add(body);

    // The cabin. Set back by a fifth of its own length, which is what makes the
    // bonnet read and the tail read as short.
    const cabin = rng.range(2.34, 2.5);
    const roof = rng.range(0.66, 0.76);
    const house = solid({
      color: glass,
      width: 1.94,
      topWidth: 1.6,
      topForeWidth: 1.52,
      depth: cabin,
      height: roof,
      // A steep tailgate and a raked windscreen: the aft edge of the roof is
      // barely inboard, the fore edge is a long way back.
      topAft: -cabin / 2 + 0.18,
      topFore: cabin / 2 - 0.72,
    });
    house.position.set(0, shoulder, -length * 0.11);
    group.add(house);

    // Bumpers, proud of the body by 0.06 so they are not coplanar with its ends
    // and get their own line. Two meshes for the same reason the glass is one.
    for (const sign of [-1, 1]) {
      const bumper = solid({
        color: rubber,
        width: 2.04,
        foreWidth: 1.9,
        topWidth: 2.1,
        depth: 0.2,
        height: 0.42,
      });
      bumper.position.set(0, sill - 0.08, sign * (length / 2 + 0.04));
      if (sign < 0) bumper.rotation.y = Math.PI;
      group.add(bumper);
    }

    return group;
  },
};
