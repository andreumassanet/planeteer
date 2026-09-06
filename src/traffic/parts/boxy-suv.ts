import type { Vehicle } from '../contract.ts';

/**
 * Boxy four-wheel-drive.
 *
 * The third car, and the one that is different in **height** rather than in
 * where its masses sit. Everything about it is the same two boxes as the
 * hatchback with four numbers changed: the body is deeper, the greenhouse is
 * upright instead of raked, the wheels are larger and there is daylight between
 * the tyre and the arch. Squared off at both ends, so the profile is a rectangle
 * with a notch cut for the bonnet where the hatchback's is a wedge.
 *
 * **The only car in the kit that carries a driver**, and that is arithmetic
 * rather than a choice about which one deserves one. A seated rider at
 * `RIDER_SCALE` needs 0.56 below the seat and 1.29 above it. On a floor at 0.55
 * the seat is at 1.12 and the roof has to clear 2.41; this is 2.55 tall and the
 * hatchback is 2.05. Tall vehicles seat people and low ones do not, and no
 * amount of modelling moves that.
 *
 * The roof rack is the cheapest thing in the file and does the most: twelve
 * triangles that break the roof line, which at 120 units is the one edge of the
 * silhouette a car has nothing else on.
 */

export const boxySuv: Vehicle = {
  id: 'boxy-suv',
  name: 'Four-wheel-drive',
  kind: 'car',
  size: [5.7, 2.44, 2.78],
  note: 'Upright glass, big wheels, a rack on the roof. The only car with room for a driver.',

  mounts: [
    // **On the centreline, and that is arithmetic.** A seated rider's elbows
    // span 1.46 and this cabin has about 1.90 of clear width, so one person
    // fits and one person offset to a real driving position does not: at
    // x = -0.42 the near elbow is 1.15 out against a 0.95 half-width. Every
    // enclosed seat in the kit is central for the same reason.
    { x: 0, y: 1.14, z: 0.3, yaw: 0, pose: 'sit', driver: true, headroom: 1.36, legroom: 0.6, beam: 1.9 },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);

    const radius = 0.52;
    const track = 1.06;
    const base = rng.range(1.58, 1.68);
    const length = rng.range(5.16, 5.34);
    const sill = 0.55;
    const shoulder = rng.range(1.42, 1.5);
    const roof = rng.range(0.94, 1.02);

    for (const z of [-base, base]) {
      for (const x of [-track, track]) {
        const tyre = wheel(radius, 0.32, rubber);
        tyre.position.set(x, radius, z);
        group.add(tyre);
      }
    }

    const body = solid({
      color: paint,
      width: 2.44,
      foreWidth: 2.36,
      topWidth: 2.36,
      topForeWidth: 2.28,
      depth: length,
      height: shoulder - sill,
    });
    body.position.y = sill;
    group.add(body);

    // Upright, and only just tapered. A raked greenhouse on this body reads as
    // an estate car; the flat glass is most of what says four-wheel-drive.
    const cabin = length - 1.24;
    const house = solid({
      color: glass,
      width: 2.2,
      topWidth: 2.02,
      topForeWidth: 1.96,
      depth: cabin,
      height: roof,
      topAft: -cabin / 2 + 0.06,
      topFore: cabin / 2 - 0.3,
    });
    house.position.set(0, shoulder, -0.6);
    group.add(house);

    // The bonnet: a low deck forward of the cabin, stepped down from the
    // shoulder so it is its own mass and the windscreen's foot has a line.
    const bonnet = solid({
      color: paint,
      width: 2.3,
      foreWidth: 2.2,
      topWidth: 2.2,
      depth: 1.3,
      height: 0.18,
    });
    bonnet.position.set(0, shoulder, length / 2 - 0.62);
    group.add(bonnet);

    // The rack is on every one of them, and that is a declaration decision
    // rather than a styling one: at a 30% chance it moved the built height by
    // 0.21 between variants, which is wider than the 12% drift a declared box
    // is allowed. A feature that changes the bounding box has to be either
    // always there or small.
    const rack = box(2.0, rng.range(0.1, 0.16), cabin * 0.7, metal);
    rack.position.set(0, shoulder + roof + rng.range(0.04, 0.08), -0.6);
    group.add(rack);

    for (const sign of [-1, 1]) {
      const bumper = solid({
        color: rubber,
        width: 2.3,
        topWidth: 2.36,
        depth: 0.22,
        height: 0.6,
      });
      bumper.position.set(0, sill - 0.22, sign * (length / 2 + 0.05));
      group.add(bumper);
    }

    return group;
  },
};
