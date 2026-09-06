import type { ScenicPart } from '../contract.ts';

/**
 * Broadleaf tree.
 *
 * **The lollipop is the failure mode**: a cylinder with a ball on it. Everything
 * in this file is aimed at not being one, and there are two moves that work.
 *
 * The first is the old one — the canopy is **three to five overlapping lobes at
 * different heights and offsets**, never one. A single blob has one silhouette
 * from every angle, which is the same thing as having none, and a wood full of
 * them is a bag of marbles.
 *
 * The second is what the reference taught: **tones.** The lobes used to be one
 * green with the lowest in the style's darker entry, and under the ramp that is
 * a canopy with three bands of one hue and no depth. Now the skirt lobe is the
 * leaf at 0.8, the body is the leaf, and the crown lobe is the leaf at 1.12 —
 * three tones of one colour, so the canopy has a lit top and a shaded underside
 * *as a colour*, before the ramp does anything. Each lobe also tilts a little,
 * which is what breaks the "beads on a stick" read that three upright
 * icosahedra keep whatever their offsets. The trunk gets the same treatment: a
 * flared foot in the bark and a straighter upper trunk in a lighter tone of it,
 * meeting at one ink line where a trunk's bark actually thins, with a bough in
 * the lighter tone reaching out under the crown on some variants.
 *
 * **The trunk leans and the crown leans with it.** A vertical trunk under an
 * offset crown reads as a mistake; leaning both reads as a tree that grew
 * towards the light. It costs one rotation on a wrapper group, and the base
 * stays on y = 0 because the wrapper is pivoted there.
 *
 * The trunk colour is not regional and does not come from the style: bark is
 * brown in Kyoto and in Bergen, and a `style.bark` list would be fourteen copies
 * of the same three entries.
 */

const FOOTPRINT = 7.4;

export const broadleafTree: ScenicPart = {
  id: 'broadleaf-tree',
  name: 'Broadleaf tree',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: 'Three to five tilted lobes in three tones on a two-tone leaning trunk. Anything but a lollipop.',

  build(ctx, rng, style) {
    const { THREE, palette, tone, column, taper, strut, blob } = ctx;
    const group = new THREE.Group();

    const bark = rng.pick([palette.bark, palette.brown, palette.darkOlive]);
    const barkLight = tone(bark, 1.28);
    const leaf = rng.pick(style.foliage);
    const shade = tone(leaf, 0.8);
    const crown = tone(leaf, 1.12);
    // One variant in three borrows a second green from the style for one body
    // lobe: a wood is not one species.
    const others = style.foliage.filter((color) => color !== leaf);
    const accent = others.length > 0 && rng.chance(0.3) ? rng.pick(others) : undefined;

    const height = rng.range(9, 16);
    const trunkHeight = height * rng.range(0.3, 0.4);
    const spread = height * rng.range(0.21, 0.27);
    const lobes = rng.between(3, 5);
    // Five lobes and a bough is 152 triangles; the bough is for the smaller crowns.
    const bough = lobes <= 4 && rng.chance(0.6);

    const tree = new THREE.Group();
    tree.rotation.y = rng.range(0, Math.PI * 2);
    tree.rotation.z = rng.jitter() * 0.06;
    tree.rotation.x = rng.jitter() * 0.05;
    group.add(tree);

    const girth = rng.range(0.32, 0.48);
    tree.add(taper(girth * 1.15, girth * 0.9, trunkHeight * 0.62, bark, 5));
    const upperTrunk = column(girth * 0.78, trunkHeight * 0.62, barkLight, 5);
    upperTrunk.position.y = trunkHeight * 0.58;
    upperTrunk.rotation.x = rng.jitter() * 0.05;
    upperTrunk.rotation.z = rng.jitter() * 0.05;
    tree.add(upperTrunk);

    if (bough) {
      const angle = rng.range(0, Math.PI * 2);
      const reach = spread * rng.range(0.35, 0.55);
      tree.add(
        strut(
          new THREE.Vector3(0, trunkHeight * 0.85, 0),
          new THREE.Vector3(Math.sin(angle) * reach, trunkHeight + (height - trunkHeight) * 0.45, Math.cos(angle) * reach),
          girth * 0.5,
          barkLight,
        ),
      );
    }

    for (let lobe = 0; lobe < lobes; lobe++) {
      // 0 at the bottom of the crown, 1 at the top. The lower lobes are wider,
      // which is the difference between a crown and a stack of beads.
      const up = lobe / (lobes - 1);
      const radius = spread * (1 - up * rng.range(0.14, 0.3));
      const thickness = radius * rng.range(1, 1.4);
      const angle = rng.range(0, Math.PI * 2);
      const off = spread * rng.range(0.05, 0.28);
      const color =
        lobe === 0 ? shade : lobe === lobes - 1 ? crown : accent !== undefined && lobe === 1 ? accent : leaf;

      const mass = blob(radius, thickness, color);
      // The top lobe finishes exactly at `height`, so the crown has a decided
      // top rather than whatever the last random number left.
      const crownAt = trunkHeight + (height - trunkHeight) * (0.42 + 0.58 * up);
      mass.position.set(Math.sin(angle) * off, crownAt - thickness, Math.cos(angle) * off);
      mass.rotation.y = rng.range(0, Math.PI);
      // An icosahedron's origin is its base, so tilting one swings its top out
      // by `thickness * sin(tilt)`: 0.12 rad on a lobe 6 thick is 0.7, and the
      // footprint has room for it. Larger and the tree is out past its
      // declaration, which is what stopped the last version tilting at all.
      mass.rotation.x = rng.jitter() * 0.12;
      mass.rotation.z = rng.jitter() * 0.12;
      tree.add(mass);
    }

    return group;
  },
};
