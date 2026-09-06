import type { Mesh, ScenicPart, Vector3 } from '../contract.ts';

/**
 * Palm.
 *
 * **The trunk has to bend, and it bends in two browns.** A straight palm is a
 * broom, and no amount of crown fixes it. The bend is the reference's: the
 * trunk follows `x = lean * t^2` up the height, cut into four tapered segments
 * each placed by its two ends, so it is an arc rather than a dogleg and the
 * three joints read as a curve — `OutlineEffect` inks every joint, and twelve
 * of them are a ladder, which is what happened to the Space Needle's legs. The
 * segments **alternate two tones of one brown**, and that is what turns four
 * frusta into a trunk: the joints stop being lines drawn across one colour and
 * become the rings a palm's trunk actually has.
 *
 * Seven or eight fronds, each a three-sided cone flattened into a blade,
 * fanned by `around` in **three tones of one green** and drooping unevenly:
 * every third frond stands nearly level, the rest hang, so the crown has a top
 * and a skirt instead of being a wheel. Seven is a count chosen for the ink:
 * with more the blades overlap into a disc and the gaps between them — which
 * are the whole silhouette of a palm — close up. One cluster of coconuts hangs
 * under the crown in a darker tone of the bark.
 *
 * Six triangles a frond, twenty a trunk segment, twenty for the nuts: 148 of
 * the tree's 150. The blade is a cone with a *zero* top radius on purpose —
 * `CylinderGeometry` skips the top cap and the degenerate side triangle when
 * the top radius is exactly 0, so a three-sided spike is six triangles, half
 * what a near-point costs.
 */

const SEGMENTS = 4;
const FOOTPRINT = 7.4;

export const palmTree: ScenicPart = {
  id: 'palm-tree',
  name: 'Palm',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: 'A curved trunk in two alternating browns under seven or eight drooping fronds in three greens, and coconuts.',

  build(ctx, rng, style) {
    const { THREE, palette, tone, taper, blob, around } = ctx;
    const group = new THREE.Group();

    const bark = rng.pick([palette.brown, palette.tan, palette.bark]);
    const rings = [bark, tone(bark, rng.chance(0.5) ? 0.8 : 1.22)];
    const leaf = rng.pick(style.foliage);
    const greens = [tone(leaf, 0.82), leaf, tone(leaf, 1.15)];

    const height = rng.range(10, 15);
    const lean = height * rng.range(0.08, 0.16);
    const root = rng.range(0.42, 0.6);

    // The bend runs along +X; the pivot's yaw points it anywhere.
    const tree = new THREE.Group();
    tree.rotation.y = rng.range(0, Math.PI * 2);
    group.add(tree);

    const at = (t: number): Vector3 => new THREE.Vector3(lean * t * t, height * t, 0);
    const radiusAt = (t: number): number => root * (1 - 0.48 * t);

    for (let i = 0; i < SEGMENTS; i++) {
      const a = i / SEGMENTS;
      const b = (i + 1) / SEGMENTS;
      const from = at(a);
      const direction = at(b).sub(from);
      const length = direction.length();
      // Each segment runs a little past its joint so the outside of the bend
      // shows no daylight between two frusta.
      const segment: Mesh = taper(radiusAt(a), radiusAt(b), length * 1.06, rings[i % 2]!, 5);
      segment.position.copy(from);
      // A pure rotation from +Y onto the segment's own direction: determinant
      // +1, so the ink hull stays outside.
      segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      tree.add(segment);
    }

    const hub = new THREE.Group();
    hub.position.copy(at(1));
    tree.add(hub);

    const nuts = blob(0.5, 0.65, tone(bark, 0.7));
    nuts.position.set(rng.jitter() * 0.3, -0.55, rng.jitter() * 0.3);
    nuts.rotation.y = rng.range(0, Math.PI);
    hub.add(nuts);

    const fronds = rng.between(7, 8);
    // The crown stands `lean` off the axis, so a frond on the lean side may
    // reach only what is left of the footprint past it.
    const room = FOOTPRINT - lean - 0.45;
    hub.add(
      around(fronds, (index) => {
        const arm = new THREE.Group();
        // Straight out is PI/2; the extra is the droop. Young fronds stand
        // nearly level and the older ones under them hang.
        const droop = index % 3 === 0 ? rng.range(0.1, 0.3) : rng.range(0.45, 0.8);
        arm.rotation.x = Math.PI / 2 + droop;
        arm.rotation.y = rng.jitter() * 0.2;
        arm.rotation.z = rng.jitter() * 0.15;
        const length = Math.min(rng.range(4.4, 5.6), room / Math.cos(droop));
        const blade: Mesh = taper(rng.range(0.24, 0.32), 0, length, greens[index % 3]!, 3);
        // A three-sided cone is a spike; squashed across its depth it is a
        // blade, broad in X and thin in Z, which the rotation above lays flat.
        // Baked into the geometry, because a scale on a rotated mesh lands on
        // the wrong axes (T * R * S).
        blade.geometry.scale(1, 1, 0.35);
        arm.add(blade);
        return arm;
      }),
    );

    return group;
  },
};
