import type { Mesh, ScenicPart } from '../contract.ts';

/**
 * Grass tuft.
 *
 * **The cheapest possible answer to "the ground is bare", and the one there will
 * be more of than anything else in the world.** Four biomes out of ten name it —
 * tundra, temperate, grassland and steppe — and between them they are most of
 * the land you can walk on, so every triangle here is multiplied by a number
 * with four digits in it. Five to seven blades, six triangles each.
 *
 * A blade is a three-sided cone with a **zero** top radius: `CylinderGeometry`
 * skips the top cap and the degenerate side triangle when the top is exactly 0,
 * so a spike is three sides and a three-triangle floor, half what the old
 * near-point cost — and no zero-area face reaches `computeVertexNormals`,
 * which `scripts/check-scenery.ts` reads every normal to prove.
 *
 * **Two greens, and the tall blades take the light.** The blades used to be one
 * green with a shaded second; now the tallest are the leaf at 1.15 and the
 * short outer ones the leaf at 0.82, so a tuft has a lit heart and a shaded
 * skirt under the ramp instead of seven identical strokes. It costs nothing:
 * tones fold onto their base for the colour budget.
 *
 * **The lean is baked into the geometry and the tuft is then dropped back onto
 * the ground**, the way `boulder` does it and for the same reason: rotating a
 * mesh about its own base swings the far corner of that base *below* y = 0.
 *
 * What it must not become is a shrub. `shrub` is already the two-lobed lump; the
 * only thing this part has to say that the lump cannot is **vertical strokes**,
 * which is what grass is under a pen. So the blades lean out and stay thin, and
 * the tuft is wider than it is tall by only a little.
 */

export const grassTuft: ScenicPart = {
  id: 'grass-tuft',
  name: 'Grass tuft',
  kind: 'scatter',
  footprint: 1.6,
  note: 'Five to seven leaning blades in two greens. Vertical strokes, which is the one thing a shrub cannot say.',

  build(ctx, rng, style) {
    const { THREE, tone, taper } = ctx;
    const group = new THREE.Group();

    const leaf = rng.pick(style.foliage);
    const lit = tone(leaf, 1.15);
    const shade = tone(leaf, 0.82);

    const tall = rng.range(1.3, 2.6);
    const blades = rng.between(5, 7);
    const spin = rng.range(0, Math.PI * 2);

    /** One blade, leaned in place and seated on y = 0. */
    const blade = (height: number, lean: number, yaw: number, color: number): Mesh => {
      const base = rng.range(0.13, 0.2);
      const mesh = taper(base, 0, height, color, 3);
      const geometry = mesh.geometry;
      geometry.rotateX(lean);
      geometry.rotateY(yaw);
      geometry.computeBoundingBox();
      geometry.translate(0, -geometry.boundingBox!.min.y, 0);
      return mesh;
    };

    for (let i = 0; i < blades; i++) {
      // Spread round the tuft, but not evenly: blades on an exact fraction of
      // a turn are a starfish, which is the same failure as Mont-Saint-Michel's
      // identical gables on a circle, at a fiftieth of the size.
      const yaw = spin + (i / blades) * Math.PI * 2 + rng.jitter() * 0.5;
      const share = rng.range(0.55, 1);
      const height = tall * share;
      // The tall blades stand nearer the middle and take the light; the short
      // ones lean out further and take the shade.
      const color = share > 0.85 ? lit : share < 0.68 ? shade : leaf;
      const mesh = blade(height, rng.range(0.16, 0.55) * (1.3 - share * 0.5), yaw, color);
      const away = rng.range(0, 0.3);
      mesh.position.set(Math.sin(yaw) * away, 0, Math.cos(yaw) * away);
      group.add(mesh);
    }

    return group;
  },
};
