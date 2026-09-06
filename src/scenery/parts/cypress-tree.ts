import type { ScenicPart } from '../contract.ts';

/**
 * Cypress — the Mediterranean's vertical.
 *
 * Four meshes and seventy-six triangles, and a row of them along a ridge says
 * *Tuscany, Provence, Andalusia* on its own. It earns its place because every
 * other tree here is round, and one narrow vertical among them is worth more
 * than a fourth kind of canopy.
 *
 * Built as two tapers rather than one cone because a cypress is a *flame*: it
 * swells low and comes to a point, and a single cone comes to a point from the
 * ground. **The two are in two tones and the joint between them is where the
 * tone changes**, which is the same line — the widest part of the flame, where
 * the sunlit crown meets the shaded skirt. Under one green the joint was an ink
 * line across a flat colour and read as two cones stacked; under two it reads
 * as light on a shape. Beneath both runs a darker core, a fifth-tone column
 * that shows as the dark neck between the trunk and the skirt's hem and wherever
 * the tilted skirt lifts its hem off it: the foot of a cypress is a shaded stem,
 * and that is what stops the flame reading as a sock on a stick.
 *
 * **Sized by the circumradius, not the apothem.** `taper`'s radius is across
 * the flats and a six-sided rim reaches 1.155 times that, which is how the last
 * version reached 3.1 out of a 2.9-unit footprint in Norway and nobody noticed
 * until the kit was measured.
 *
 * Also used, deliberately, by `maghreb` and `middle-east` — the tall dark
 * vertical in a courtyard is as much a Persian garden as an Italian one.
 */

const FOOTPRINT = 3.1;
const K6 = 1 / Math.cos(Math.PI / 6);

export const cypressTree: ScenicPart = {
  id: 'cypress-tree',
  name: 'Cypress',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: 'A narrow flame in two tapers and two tones over a darker core. Four meshes, and a whole region.',

  build(ctx, rng, style) {
    const { THREE, palette, tone, column, taper } = ctx;
    const group = new THREE.Group();

    const bark = rng.pick([palette.bark, palette.brown]);
    const leaf = rng.pick(style.foliage);
    const core = tone(leaf, 0.66);
    const shade = tone(leaf, 0.85);
    const light = tone(leaf, 1.08);

    const height = rng.range(9, 16);
    // Held so the rim plus the two small leans stays inside the footprint:
    // 2.2 across the flats is 2.54 at the corners, and the leans add 0.45.
    const width = Math.min(height * rng.range(0.12, 0.17), (FOOTPRINT - 0.55) / K6);
    // Where the swell is. Low is a cypress, high is a poplar, and both are true
    // of the regions that use this.
    const waist = rng.range(0.28, 0.42);

    const tree = new THREE.Group();
    tree.rotation.y = rng.range(0, Math.PI * 2);
    tree.rotation.z = rng.jitter() * 0.03;
    group.add(tree);

    tree.add(column(width * 0.24, height * 0.1, bark, 5));

    const heart = column(width * 0.44, height * 0.62, core, 5);
    heart.position.y = height * 0.05;
    tree.add(heart);

    const lower = taper(width * 0.58, width, height * waist, shade, 6);
    lower.position.y = height * 0.12;
    lower.rotation.y = rng.jitter() * 0.3;
    lower.rotation.x = rng.jitter() * 0.04;
    tree.add(lower);

    const upper = taper(width, 0, height * (1 - waist - 0.12), light, 6);
    upper.position.y = height * (0.12 + waist);
    upper.rotation.y = Math.PI / 6 + rng.jitter() * 0.3;
    upper.rotation.x = rng.jitter() * 0.04;
    upper.rotation.z = rng.jitter() * 0.04;
    tree.add(upper);

    return group;
  },
};
