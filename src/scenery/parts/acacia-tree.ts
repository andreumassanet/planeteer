import type { Group, ScenicPart } from '../contract.ts';

/**
 * Umbrella acacia.
 *
 * The savanna's whole silhouette in one part, and the silhouette is the point:
 * **a flat canopy far wider than it is deep, held up on a bare forked trunk with
 * daylight under it.** Every other tree in the kit is a mass on a stick; this
 * one is a *line* on a stick, and that is the only reason a savanna stops
 * looking like a thin temperate wood.
 *
 * Three decisions, in the order they matter:
 *
 * - **The canopy is wide and thin.** Roughly 11 units across and 2 deep, on a
 *   tree 10 tall. `broadleaf-tree` puts its crown at 2.4 times the trunk's
 *   height and half as wide again as it is deep; invert both and the tree reads
 *   as African before anything else about it registers.
 * - **The fork is visible, so the trunk is two struts and not one.** At 400
 *   units a tree is mostly its own outline, and the gap between two leaning
 *   limbs is a shape the ink can draw. A single column under a flat top is a
 *   mushroom. The limbs are a lighter tone of the trunk's bark, so the fork is
 *   a change of colour as well as a change of direction.
 * - **Three or four lobes, at three depths, in three tones.** Two coplanar
 *   meshes get no ink between them (see Niagara's American curtain in
 *   `CLAUDE.md`), so a canopy built as one wide blob is a blank rectangle with
 *   a line round it. Overlapping lobes at different heights give the canopy
 *   internal edges for nothing — and the tones are what make those edges read
 *   as layers rather than as cracks: the lowest lobe at 0.82 of the leaf, the
 *   top one at 1.14, which is the sun on the top of a flat crown and the shade
 *   under it. Each lobe tilts a few hundredths, the way the layers of a real
 *   umbrella crown never quite sit level.
 */

const FOOTPRINT = 6.4;

export const acaciaTree: ScenicPart = {
  id: 'acacia-tree',
  name: 'Umbrella acacia',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: 'A flat wide canopy in three tones on a forked two-tone trunk, with daylight under it. The savanna in one shape.',

  build(ctx, rng, style) {
    const { THREE, palette, tone, taper, strut, blob } = ctx;
    const group = new THREE.Group();

    const bark = rng.pick([palette.bark, palette.brown, palette.darkOlive]);
    const limb = tone(bark, 1.3);
    const leaf = rng.pick(style.foliage);
    const shade = tone(leaf, 0.82);
    const crown = tone(leaf, 1.14);

    const height = rng.range(8.5, 13);
    // Over half the tree is bare trunk, which is the other half of the read: a
    // canopy that starts at knee height is a bush however flat it is.
    const forkAt = height * rng.range(0.44, 0.56);
    const spread = rng.range(4.2, 5.2);
    const lobes = rng.between(3, 4);

    // One pivot at the foot carries the lean, so the tree tips without lifting
    // off the ground — the same construction `broadleaf-tree` uses.
    const tree: Group = new THREE.Group();
    tree.rotation.y = rng.range(0, Math.PI * 2);
    tree.rotation.z = rng.jitter() * 0.07;
    group.add(tree);

    const butt = rng.range(0.34, 0.46);
    tree.add(taper(butt, butt * 0.72, forkAt * 1.02, bark, 5));

    // Two or three limbs out of the fork, leaning opposite ways and reaching
    // different distances, so the crown is held off-centre and the tree is not
    // symmetric about its own trunk.
    const swing = rng.range(0, Math.PI * 2);
    const limbs = rng.between(2, 3);
    const canopyAt = height - rng.range(0.9, 1.5);
    for (let i = 0; i < limbs; i++) {
      const angle = swing + (i / limbs) * Math.PI * 2 + rng.jitter() * 0.4;
      const reach = spread * rng.range(0.3, 0.52);
      tree.add(
        strut(
          new THREE.Vector3(0, forkAt * 0.92, 0),
          new THREE.Vector3(Math.sin(angle) * reach, canopyAt - 0.4, Math.cos(angle) * reach),
          butt * rng.range(0.5, 0.72),
          limb,
        ),
      );
    }

    for (let lobe = 0; lobe < lobes; lobe++) {
      const up = lobe / (lobes - 1);
      const radius = spread * rng.range(0.58, 0.78);
      // A quarter to a half of its own width. Flatter than that and the near
      // view is a hexagonal plate on a stick rather than a canopy; thicker and
      // it is a broadleaf crown, which is the tree this one exists not to be.
      const thickness = radius * rng.range(0.4, 0.58);
      const angle = rng.range(0, Math.PI * 2);
      const away = (spread - radius) * rng.range(0, 0.85);
      // Lobes are placed top down, so the last one is the lowest and takes the
      // shade; the first is the crown and takes the light.
      const color = lobe === 0 ? crown : lobe === lobes - 1 ? shade : leaf;
      const mass = blob(radius, thickness, color);
      // Stepped in height as well as in plan. Lobes at one height are one slab
      // with no ink between the pieces; a third of the thickness apart is
      // enough to give each its own line and costs no triangle.
      mass.position.set(
        Math.sin(angle) * away,
        canopyAt - thickness * (1 + up * 0.7),
        Math.cos(angle) * away,
      );
      mass.rotation.y = rng.range(0, Math.PI);
      // A flat lobe swings its rim by `thickness * sin(tilt)`, which at 0.06
      // rad on a lobe 2 thick is a tenth of a unit: inside the footprint, and
      // enough that the layers do not sit dead level.
      mass.rotation.x = rng.jitter() * 0.06;
      mass.rotation.z = rng.jitter() * 0.06;
      tree.add(mass);
    }

    return group;
  },
};
