import type { Mesh, ScenicPart } from '../contract.ts';

/**
 * Boulder.
 *
 * Two or three faceted lumps sitting together, **in two greys of one stone.**
 * The only part in the kit that is pure `scatter`, and its whole job is to stop
 * bare ground from being bare: `polar` weights it at 9 against 1 for anything
 * green, so on a high-latitude coast this is most of what is on the ground.
 *
 * **The tilt is baked into the geometry, not set on the mesh, and that is the
 * one thing worth reading here.** An upright icosahedron reads as an egg, so a
 * rock has to lean; but leaning a mesh drops its lowest vertex below y = 0 and
 * the contract's base check refuses it — correctly, because the ground is where
 * the ground is and a floating rock is worse than a dull one. Rotating the
 * *geometry* lets the bounding box be measured afterwards and the whole thing
 * dropped back onto the ground, which is four lines and the difference between
 * a rock and a boiled egg.
 *
 * **One of the lumps is sunk.** The reference buries its rocks; the contract
 * will not let a vertex go under the ground, and it is right not to — the ground
 * is where the ground is. What reads as *sunk* is not depth, it is proportion:
 * a wide lump half as tall as it is broad, seated on y = 0 against the main
 * one, is a rock the ground has taken most of. It takes the darker tone,
 * because a half-buried stone is in the shadow of the one beside it; the small
 * third lump takes the lighter one.
 */

export const boulder: ScenicPart = {
  id: 'boulder',
  name: 'Boulder',
  kind: 'scatter',
  footprint: 3.4,
  note: 'Two or three tilted lumps in two greys, one of them sunk, seated on the ground by their own bounding box.',

  build(ctx, rng, style) {
    const { THREE, tone, blob } = ctx;
    const group = new THREE.Group();

    const rock = rng.pick(style.stone);
    // Half the variants take their second grey from the style — a granite
    // against a slate — and half from a tone of the first.
    const others = style.stone.filter((color) => color !== rock);
    const sunkGrey = others.length > 0 && rng.chance(0.5) ? rng.pick(others) : tone(rock, 0.78);
    const lit = tone(rock, 1.12);

    /** A lump, tilted and then dropped back onto y = 0. */
    const lump = (radius: number, height: number, color: number): Mesh => {
      const mesh = blob(radius, height, color);
      const geometry = mesh.geometry;
      geometry.rotateY(rng.range(0, Math.PI * 2));
      geometry.rotateX(rng.jitter() * 0.5);
      geometry.rotateZ(rng.jitter() * 0.5);
      geometry.computeBoundingBox();
      geometry.translate(0, -geometry.boundingBox!.min.y, 0);
      return mesh;
    };

    const radius = rng.range(1, 1.85);
    group.add(lump(radius, radius * rng.range(0.9, 1.5), rock));

    // The sunk one: as wide as the main lump or nearly, and a third to a half
    // as tall, tucked against it. Tucked is also the footprint: a tilted lump
    // reaches about 0.9 of its radius sideways, so at 0.85 of the main radius
    // out the pair spans 3.2 on the largest seed against a footprint of 3.4.
    {
      const wide = radius * rng.range(0.7, 0.95);
      const mesh = lump(wide, wide * rng.range(0.3, 0.5), sunkGrey);
      const angle = rng.range(0, Math.PI * 2);
      const away = radius * rng.range(0.6, 0.85);
      mesh.position.set(Math.sin(angle) * away, 0, Math.cos(angle) * away);
      group.add(mesh);
    }

    if (rng.chance(0.6)) {
      const small = radius * rng.range(0.3, 0.5);
      const mesh = lump(small, small * rng.range(1, 1.5), lit);
      const angle = rng.range(0, Math.PI * 2);
      const away = radius * rng.range(0.7, 1.0);
      mesh.position.set(Math.sin(angle) * away, 0, Math.cos(angle) * away);
      group.add(mesh);
    }

    return group;
  },
};
