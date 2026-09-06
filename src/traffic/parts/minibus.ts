import type { Vehicle } from '../contract.ts';

/**
 * Minibus — the matatu, the marshrutka, the louage, the colectivo.
 *
 * **Weighted top in four of the fourteen regions and it is the same vehicle in
 * all of them**, which is the argument for a region table made as plainly as
 * the kit can make it: sub-Saharan Africa, Latin America, the Maghreb and
 * Eastern Europe all run their public transport on a van with windows cut in
 * it, and putting one on the road there does more for the place than any
 * amount of local architecture.
 *
 * Geometrically it is the panel van with two changes and they are the only two
 * that matter: **a band of glass down the whole flank**, and a roof rack that
 * is nearly always carrying something. The first is what tells it from the van
 * at any distance where colour still resolves; the second is what tells it at
 * the distance where colour does not, because the load breaks the roof line.
 */

export const minibus: Vehicle = {
  id: 'minibus',
  name: 'Minibus',
  kind: 'utility',
  size: [6.85, 2.6, 3.84],
  note: 'A van with the flank glazed and something tied to the roof. Four regions run on it.',

  mounts: [
    { x: 0, y: 1.36, z: 2.3, yaw: 0, pose: 'sit', driver: true, headroom: 1.45, legroom: 0.6, beam: 2.16 },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel } = ctx;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);
    const load = rng.pick(style.cargo);

    const radius = 0.46;
    const track = 1.04;
    const length = rng.range(6.42, 6.66);
    const half = length / 2;
    const sill = 0.52;
    const roof = rng.range(2.4, 2.56);

    for (const z of [-half + 1.1, half - 1.4]) {
      for (const x of [-track, track]) {
        const tyre = wheel(radius, 0.32, rubber);
        tyre.position.set(x, radius, z);
        group.add(tyre);
      }
    }

    const body = solid({
      color: paint,
      width: 2.48,
      foreWidth: 2.3,
      topWidth: 2.38,
      topForeWidth: 2.06,
      depth: length,
      height: roof,
      topFore: half - 0.9,
    });
    body.position.y = sill;
    group.add(body);

    // The glazing band. One mesh a side, proud of the flank by 0.06 so it is
    // not coplanar with it — flush, `OutlineEffect` would give this no line at
    // all and a minibus would render as a plain van in two colours.
    const bandLength = length - 1.6;
    for (const side of [-1, 1]) {
      const band = box(0.12, 0.86, bandLength, glass);
      band.position.set(side * 1.24, sill + roof - 1.02, -0.42);
      group.add(band);
    }
    const screen = box(2.02, 0.9, 0.16, glass);
    screen.position.set(0, sill + roof - 1.06, half - 0.92);
    group.add(screen);

    // The rack, and something on it four times out of five. This is the mark
    // that survives to 300 units, where the glass has stopped resolving.
    const rack = box(2.1, 0.14, length * 0.6, rng.pick(style.metal));
    rack.position.set(0, sill + roof + 0.07, -0.4);
    group.add(rack);
    // Always something up there. The load is the mark that survives to 300
    // units and it is also the tallest thing on the vehicle, so leaving it to
    // a chance moved the built height by 0.41 between variants — wider than
    // the drift a declared box is allowed.
    const bundle = box(rng.range(1.5, 1.9), rng.range(0.36, 0.58), length * rng.range(0.3, 0.5), load);
    bundle.position.set(rng.jitter() * 0.12, sill + roof + 0.14, -0.4 + rng.jitter() * 0.5);
    group.add(bundle);

    const bumper = box(2.28, 0.4, 0.24, rubber);
    bumper.position.set(0, 0.34, half + 0.06);
    group.add(bumper);

    return group;
  },
};
