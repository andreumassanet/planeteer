import type { Vehicle } from '../contract.ts';

/**
 * Sailing dinghy.
 *
 * **The tallest-to-longest thing in the kit — 6.8 up against 5.0 along — and
 * the only vehicle whose silhouette is mostly empty air.** A mast and a sail are
 * two thin marks over a small hull, so at any distance past about 120 units what
 * is left of it is a triangle with a line up one side, which is exactly what a
 * boat under sail looks like from a shore. Nothing else here reads at that
 * distance on so little geometry.
 *
 * The sail is one `solid` with its top face collapsed onto the mast: give
 * `topAft` and `topFore` the same z and the eight-cornered box becomes a wedge,
 * which in profile is the triangle. Twelve triangles minus the two that go
 * degenerate, one mesh, one ink line round the whole sail.
 *
 * The hull is the rowing boat's construction — planks with thickness, for the
 * reason written down there — with the beam pulled in and the freeboard raised.
 */

export const sailingDinghy: Vehicle = {
  id: 'sailing-dinghy',
  name: 'Sailing dinghy',
  kind: 'craft',
  size: [4.62, 1.79, 6.75],
  note: 'A small hull under a big triangle. Mostly empty air, and it reads further than anything.',

  mounts: [
    { x: -0.3, y: 0.34, z: -0.7, yaw: 0, pose: 'sit', headroom: Infinity, legroom: 0.6, beam: Infinity, hats: true },
  ],

  build(ctx, rng, style) {
    const { THREE, box, column, solid } = ctx;
    const group = new THREE.Group();

    const timber = rng.pick(style.paint);
    const canvas = rng.pick(style.metal);
    const inside = rng.pick(style.cargo);
    const trim = rng.pick(style.trim);

    const length = rng.range(4.3, 4.6);
    const half = length / 2;
    const beam = rng.range(1.42, 1.6);
    const draft = rng.range(0.4, 0.5);
    const freeboard = rng.range(0.6, 0.68);

    const bottom = solid({
      color: timber,
      width: beam * 0.6,
      foreWidth: 0.12,
      topWidth: beam * 0.72,
      topForeWidth: 0.2,
      depth: length,
      height: 0.2,
      foreRise: draft * 0.75,
    });
    bottom.position.y = -draft;
    group.add(bottom);

    const sweep = Math.atan2(beam / 2, length * 0.9);
    for (const side of [-1, 1]) {
      const plank = box(0.13, draft + freeboard, length * 0.97, timber);
      plank.position.set((side * beam) / 4, -draft, -0.05);
      plank.rotation.y = -side * sweep;
      group.add(plank);
    }

    const transom = box(beam * 0.72, draft + freeboard, 0.14, timber);
    transom.position.set(0, -draft, -half + 0.07);
    group.add(transom);

    const sole = box(beam * 0.58, 0.1, length * 0.7, inside);
    sole.position.set(0, -draft + 0.06, -0.1);
    group.add(sole);

    const thwart = box(beam * 0.8, 0.12, 0.3, inside);
    thwart.position.set(0, 0.22, -0.7);
    group.add(thwart);

    // Mast and sail. The mast is stepped forward of the middle and the sail
    // hangs aft of it, so the whole rig leans away from the bow the way a real
    // one does — a sail centred on the mast reads as a flag.
    const mastZ = length * 0.16;
    const luff = rng.range(5.5, 6.1);
    const mast = column(0.08, luff, trim, 6);
    mast.position.set(0, freeboard, mastZ);
    group.add(mast);

    const foot = rng.range(2.1, 2.5);
    const sail = solid({
      color: canvas,
      width: 0.1,
      depth: foot,
      height: luff * 0.86,
      // Both top edges on the mast: the box collapses to a wedge, which in
      // profile is the triangle. The two zero-area faces are dropped by `solid`.
      topAft: foot / 2 - 0.02,
      topFore: foot / 2 - 0.02,
    });
    sail.position.set(0, freeboard + 0.34, mastZ - foot / 2 - 0.04);
    group.add(sail);

    return group;
  },
};
