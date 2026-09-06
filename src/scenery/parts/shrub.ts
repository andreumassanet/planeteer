import type { Mesh, ScenicPart } from '../contract.ts';

/**
 * Shrub.
 *
 * The smallest thing in the kit and the one there will be most of. It is a
 * `scatter` part rather than a `tree` because of the budget line that matters:
 * three colours, ninety triangles, and no wish for more. At 120 units a shrub is
 * two pixels — it is not a plant, it is texture on the ground, and the moment it
 * costs as much as a tree it should have been a tree.
 *
 * Two or three squashed lobes at slightly different heights, **in two or three
 * tones of one green** — the main lobe in the leaf, the one beside it in the
 * leaf at 0.82, a small one on top at 1.12. Squashed rather than round, because
 * a sphere on the ground reads as a ball and a flattened one reads as a bush;
 * and toned rather than flat, because two lobes in one colour read as one lump
 * with a crack in it, and two in two tones read as a bush with a lit side. Each
 * lobe is tilted a little, the way the reference tilts everything it puts on
 * the ground.
 *
 * **The tilt is baked into the geometry and the lobe is then dropped back onto
 * y = 0**, the way `boulder` does it and for the same reason: an icosahedron's
 * origin is its base, so tilting the *mesh* swings the far rim below the ground
 * by `radius * sin(tilt)`, which on a 1.5-unit lobe at 0.12 rad is 0.18 against
 * the contract's 0.06.
 *
 * About one variant in four flowers: three or four small three-sided cones in a
 * palette accent, planted on the top of the main lobe. Six triangles each, and
 * at any distance a dot of colour — which is all a flower is at this scale.
 */

export const shrub: ScenicPart = {
  id: 'shrub',
  name: 'Shrub',
  kind: 'scatter',
  footprint: 2.5,
  note: 'Two or three tilted lobes in two tones, some in flower. Texture on the ground, not a plant.',

  build(ctx, rng, style) {
    const { THREE, palette, tone, blob, taper } = ctx;
    const group = new THREE.Group();

    const leaf = rng.pick(style.foliage);
    const shade = tone(leaf, 0.82);
    const lit = tone(leaf, 1.12);
    const flowers = [palette.pink, palette.white, palette.gold, palette.red];

    const radius = rng.range(0.85, 1.5);
    const lobes = rng.between(2, 3);
    const flowering = rng.chance(0.25);

    /** A lobe, tilted in its geometry and dropped back onto y = 0. */
    const lump = (size: number, height: number, color: number): Mesh => {
      const mesh = blob(size, height, color);
      const geometry = mesh.geometry;
      geometry.rotateY(rng.range(0, Math.PI * 2));
      geometry.rotateX(rng.jitter() * 0.12);
      geometry.rotateZ(rng.jitter() * 0.12);
      geometry.computeBoundingBox();
      geometry.translate(0, -geometry.boundingBox!.min.y, 0);
      return mesh;
    };

    const mainHeight = radius * rng.range(0.75, 1.15);
    group.add(lump(radius, mainHeight, leaf));

    for (let lobe = 1; lobe < lobes; lobe++) {
      const size = radius * rng.range(0.5, 0.8);
      const mesh = lump(size, size * rng.range(0.75, 1.15), lobe === 1 ? shade : lit);
      const angle = rng.range(0, Math.PI * 2);
      const away = radius * rng.range(0.5, 0.85);
      mesh.position.set(Math.sin(angle) * away, 0, Math.cos(angle) * away);
      group.add(mesh);
    }
    if (lobes === 2 && rng.chance(0.5)) {
      // A small lit lobe riding on the main one, so a two-lobe shrub still has
      // a top that is not the same colour as its side.
      const size = radius * rng.range(0.35, 0.5);
      const mesh = lump(size, size * 0.8, lit);
      mesh.position.set(rng.jitter() * radius * 0.3, mainHeight * 0.62, rng.jitter() * radius * 0.3);
      group.add(mesh);
    }

    if (flowering) {
      const color = rng.pick(flowers);
      const count = rng.between(3, 4);
      for (let i = 0; i < count; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const away = radius * rng.range(0.15, 0.5);
        // The upper surface of an ellipsoid `radius` by `mainHeight`, sunk a
        // little so the bud is planted rather than perched.
        const y = mainHeight * Math.sqrt(Math.max(0, 1 - (away / radius) ** 2)) - 0.12;
        const bud = taper(0.14, 0, 0.32, color, 3);
        bud.position.set(Math.sin(angle) * away, y, Math.cos(angle) * away);
        bud.rotation.y = rng.range(0, Math.PI * 2);
        group.add(bud);
      }
    }

    return group;
  },
};
