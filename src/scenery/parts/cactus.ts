import type { Group, Mesh, ScenicPart } from '../contract.ts';

/**
 * Saguaro.
 *
 * A `tree` and not a `scatter`, which is a decision about *distance* rather than
 * about botany: `vegetation.ts` drops any plant whose own height is not worth
 * `LEGIBLE_AT` at the tile it stands in, and a scatter part is culled a couple
 * of hundred units out. A desert has nothing else in it, so the one thing
 * standing up in it has to survive to the horizon or the desert is empty — which
 * it very nearly is anyway at `cover` 0.03.
 *
 * That rarity is the whole design brief. **A desert evenly speckled with cacti
 * is worse than a bare one**: it reads as a texture, and a texture says the
 * ground is made of cactus. One every few hundred units reads as a landmark.
 *
 * So it is built to be looked at when it finally turns up: a fluted column, a
 * rounded crown, and one or two arms that elbow outward and then turn straight
 * up. The elbow is the shape — an arm that curves is a branch, and an arm that
 * goes out and then vertically up is a saguaro and nothing else.
 *
 * **The fluting is one pale rib.** A saguaro's ribs are the thing you would
 * draw if you drew one, and modelling them is a twelve-sided column the ink
 * would turn into a tube. One narrow three-sided column in a lighter tone
 * standing proud of the front face gets its own ink line and its own band of
 * the ramp, and that one lit ridge says *ribbed* for twelve triangles. The
 * arms are a second green — a darker tone of the flesh on half the variants,
 * the style's other foliage entry on the rest — because two arms in the exact
 * colour of the trunk merge into it at any distance, and the tips and crown
 * are a lighter tone, the sun on the top of a column.
 *
 * **Not native to the Old World, and the table that places it does not know
 * that.** `BIOMES.desert.plants` is per biome, so left alone it would stand one
 * of these in the Sahara. `NATIVE_TO` in `scenery/regions.ts` is where that is
 * answered — biome says what grows, region says whose it is.
 */

const SIDES = 5;

export const cactus: ScenicPart = {
  id: 'cactus',
  name: 'Saguaro',
  kind: 'tree',
  footprint: 2.9,
  note: 'A column with one pale rib and one or two elbowed arms in a second green. Rare on purpose: desert cover is 0.03.',

  build(ctx, rng, style) {
    const { THREE, tone, taper, column, strut, blob } = ctx;
    const group = new THREE.Group();

    const flesh = rng.pick(style.foliage);
    const others = style.foliage.filter((color) => color !== flesh);
    const armGreen = others.length > 0 && rng.chance(0.5) ? rng.pick(others) : tone(flesh, 0.86);
    const lit = tone(flesh, 1.1);
    const rib = tone(flesh, 1.22);

    const height = rng.range(5, 8.5);
    const girth = rng.range(0.44, 0.62);

    const trunk: Group = new THREE.Group();
    trunk.rotation.y = rng.range(0, Math.PI * 2);
    trunk.rotation.z = rng.jitter() * 0.05;
    group.add(trunk);

    trunk.add(taper(girth, girth * 0.86, height, flesh, SIDES));
    // The rib stands on the front face, a little proud at the foot and more so
    // at the top where the column has tapered away from it.
    const ridge = column(0.12, height - girth * 0.6, rib, 3);
    ridge.position.z = girth * 0.93;
    trunk.add(ridge);
    const cap = blob(girth * 0.9, girth * 1.5, lit);
    cap.position.y = height - girth * 0.5;
    trunk.add(cap);

    /** One arm: out along a beam, then a shorter column standing on its end, with a lit tip. */
    const arm = (angle: number, elbowAt: number, reach: number, rise: number): void => {
      const x = Math.sin(angle) * reach;
      const z = Math.cos(angle) * reach;
      const thickness = girth * rng.range(0.62, 0.8);
      trunk.add(
        strut(
          new THREE.Vector3(0, elbowAt, 0),
          new THREE.Vector3(x, elbowAt + rise * 0.28, z),
          thickness,
          armGreen,
        ),
      );
      const limb: Mesh = taper(thickness * 0.62, thickness * 0.55, rise, armGreen, SIDES);
      limb.position.set(x, elbowAt + rise * 0.28, z);
      limb.rotation.x = rng.jitter() * 0.06;
      limb.rotation.z = rng.jitter() * 0.06;
      trunk.add(limb);
      // A five-sided cone, ten triangles, where a blob would be twenty: at the
      // size of an arm's tip the difference between the two is one ink line.
      const tip: Mesh = taper(thickness * 0.58, 0, thickness * 0.9, lit, SIDES);
      tip.position.set(x, elbowAt + rise * 0.28 + rise - 0.02, z);
      trunk.add(tip);
    };

    const arms = rng.between(1, 2);
    const first = rng.range(0, Math.PI * 2);
    for (let i = 0; i < arms; i++) {
      // The two arms are never at the same height and never opposite: a saguaro
      // with symmetric arms is a signpost.
      const angle = first + (i === 0 ? 0 : rng.range(1.6, 2.6) * rng.sign());
      arm(
        angle,
        height * rng.range(0.3, 0.5),
        girth * rng.range(2.2, 3.4),
        height * rng.range(0.24, 0.42),
      );
    }

    return group;
  },
};
