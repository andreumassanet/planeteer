import type { ScenicPart } from '../contract.ts';

/**
 * Conifer.
 *
 * A stub of trunk and three stacked cones — four on about a third of the
 * variants — **in three tones of one green, darkest at the foot and lightest at
 * the top.** That sentence is the whole redesign. The previous conifer was four
 * cones in one green, and a stack of cones in one flat colour reads as a stack
 * of cones however carefully the ledges are placed: under the four-step ramp
 * every tier takes the same band on the same side, and the eye sees one object
 * with three horizontal lines drawn on it. Give each tier its own tone and the
 * same geometry reads as foliage in layers, because that is how a real tree
 * shades — the crown catches the sun and the skirt sits in its own shadow. It
 * costs nothing: `ctx.tone` folds onto its base colour for the budget and the
 * merged tile carries it as vertex bytes.
 *
 * The proportions are the reference's, scaled so the tip is at `height`: the
 * trunk shows for the bottom eighth, the skirt cone reaches 0.28 of the height
 * in radius, and each cone up is 0.55 of the last. Five sides, not six: at the
 * size a tree is actually seen the facets are a pixel each, and five puts the
 * *joints* — which are the only lines the ink draws on a cone — a fifth of a
 * turn apart, where six leaves the tree looking machined. Each tier is turned
 * half a segment against the one below so no two share a facet plane, and each
 * has a small tilt of its own, so the tree is a stack of things and not one
 * lathed spike.
 */

const SIDES = 5;
/** Circumradius over apothem for a five-sided cone: the rim reaches this much past the number it was sized by. */
const K5 = 1 / Math.cos(Math.PI / SIDES);
const FOOTPRINT = 5.3;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const coniferTree: ScenicPart = {
  id: 'conifer-tree',
  name: 'Conifer',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: 'A trunk and three or four stacked cones in three tones of one green, lightest at the top. Cold and temperate.',

  build(ctx, rng, style) {
    const { THREE, palette, tone, column, taper } = ctx;
    const group = new THREE.Group();

    const bark = rng.pick([palette.bark, palette.brown]);
    const needles = rng.pick(style.foliage);

    const height = rng.range(9, 17);
    const tiers = rng.chance(0.35) ? 4 : 3;
    // Broad or slender is a variant's decision; the skirt is held inside the
    // footprint whatever the height, which slims the tallest broad ones a
    // little rather than letting them out.
    const broad = rng.range(0.82, 1.05);
    const skirt = Math.min(0.283 * height * broad, (FOOTPRINT - 0.35) / K5);

    // One pivot at the foot carries a small lean, so the tree tips without
    // lifting off the ground. The trunk is under 0.7 across, so 0.05 rad dips
    // its far edge by 0.03 — inside the contract's 0.06.
    const tree = new THREE.Group();
    tree.rotation.y = rng.range(0, Math.PI * 2);
    tree.rotation.x = rng.jitter() * 0.05;
    tree.rotation.z = rng.jitter() * 0.05;
    group.add(tree);

    const girth = Math.min(0.7, Math.max(0.32, 0.041 * height));
    tree.add(column(girth, height * 0.36, bark, SIDES));

    for (let tier = 0; tier < tiers; tier++) {
      // 0 at the skirt, 1 at the crown. The reference's three cones are the
      // ends and the midpoint of these ramps; a fourth tier interpolates.
      const up = tier / (tiers - 1);
      const radius = skirt * lerp(1, 0.55, up) * rng.range(0.94, 1.06);
      const tall = height * lerp(0.52, 0.41, up) * rng.range(0.95, 1.05);
      const base = height * lerp(0.123, 0.589, up);
      // Rounded to two places: a tone is a named colour on the sheet and a
      // material in its cache, and a fourth tier at 0.9066... is neither.
      const cone = taper(radius, 0, tall, tone(needles, Math.round(lerp(0.8, 1.12, up) * 100) / 100), SIDES);
      cone.position.y = base;
      cone.rotation.y = (tier * Math.PI) / SIDES + rng.jitter() * 0.2;
      // Tilted about its own base, so the rim moves up on one side and not
      // out: a cone's reach is its base radius whatever its apex does. The
      // skirt's base is 0.12 of the height up, which is four times what its
      // far rim can dip.
      cone.rotation.x = rng.jitter() * 0.07;
      cone.rotation.z = rng.jitter() * 0.07;
      tree.add(cone);
    }

    return group;
  },
};
