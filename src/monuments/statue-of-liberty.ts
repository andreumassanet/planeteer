import type { Monument } from './contract.ts';

/**
 * Statue of Liberty.
 *
 * A figure again, like Christ the Redeemer, and the same warning applies — the
 * validator measures a bounding box, so mass has to be put in on purpose. But
 * where Christ is a symmetric T, **Liberty is entirely asymmetric, and that
 * asymmetry is the read**: one arm goes up and away on its own, the other is
 * folded down behind a slab. Mirroring Christ's method would give a figure that
 * reads as a shrug.
 *
 * Four things carry the silhouette, in this order:
 *
 * 1. **The raised right arm.** Twelve units of tapered arm at 19 degrees off
 *    vertical. The angle is the most reworked number in the file: at 13 degrees
 *    the arm ran up flush against the head and the crown, and the whole thing
 *    read as one green column with a gold dot on it. What makes an arm an arm is
 *    the sky between it and the head.
 * 2. **The crown.** Seven rays, all seven countable from the front — see
 *    `CROWN_RAYS`.
 * 3. **The tablet**, a slab leaning out of her left side on a long diagonal. It
 *    fills the half of the silhouette the raised arm leaves empty.
 * 4. **The robe's hem**, which needs somewhere to be seen. An earlier pedestal
 *    had a balcony parapet around its top, historically right and fatal: the
 *    parapet stood exactly in front of the flare and the figure came out of the
 *    stone as a straight column. The pedestal now ends in a plain lip a unit
 *    wider than the hem, and the flare reads.
 *
 * `tower` rather than `landmark`: it is the landmark of New York, not of the
 * planet, and at 70 units it stops competing with the Eiffel Tower for
 * attention across the Atlantic.
 *
 * **Her right hand is at -X.** For a group facing +Z with +Y up, right is
 * `forward x up`, which is -X — so the torch lands on the *viewer's* left,
 * where every photograph taken from the front puts it.
 *
 * Traded away, all of it for mesh budget rather than triangles (`OutlineEffect`
 * draws every mesh twice, so 80 meshes is the real ceiling): the broken chain at
 * her feet, the folds on the three rearmost faces of the robe, and the
 * pedestal's true proportion — plinth and fort are 34% of the height here
 * against 51% in life, because accurate leaves the figure a third of the frame
 * and the figure is what is being named.
 */

// --- the vertical stack; the top of one course is the base of the next ---
const FORT_TOP = 6;
/** Top of the pedestal, and so the statue's own feet. */
const FEET = 24;
const TORCH_TIP = 69.9;

/**
 * Half-width of the robe at each height. The 8.6 hem against a 4.8 waist is a
 * 1.8:1 flare, and unlike Christ's it has a ceiling at the other end: the hem
 * has to stay inside the pedestal's top lip, or the statue reads as standing on
 * a plate too small for her.
 */
const ROBE = [
  { y: FEET, r: 8.2 }, // hem, proud of the course above so the ink catches it
  { y: 25.8, r: 7.55 },
  { y: 30.8, r: 6.7 },
  { y: 36.2, r: 5.85 },
  { y: 41.6, r: 5.1 },
  { y: 46.2, r: 4.65 }, // waist
  { y: 50.0, r: 5.25 }, // chest
];

const SIDES = 8;
/** Front-to-back squash. Softer than Christ's 0.68: she is a robe, not a slab. */
const DEPTH = 0.8;

const SHOULDER_Y = 51.6;
const SHOULDER_X = 5;
const ARM_LENGTH = 12;
/** Off vertical, leaning outward. See the note at the top — this one is load-bearing. */
const ARM_TILT = 0.37;
/** Where the wrist lands, and therefore where the torch has to stand. */
const TORCH_X = -(SHOULDER_X + ARM_LENGTH * Math.sin(ARM_TILT));

/**
 * Seven, and they have to still be seven at thumbnail size.
 *
 * Spread over the full circle, one ray points straight down the camera and
 * projects onto the face as a lump. Half a step of offset removes it and, more
 * usefully, spreads the seven tips over seven distinct screen positions: the
 * pair at the sides at full length, two pairs foreshortened, and the rear one
 * standing up dead centre above the head.
 *
 * They are also about a third longer than life against the head. The real
 * proportion vanishes at this size and the crown is not negotiable.
 */
const CROWN_RAYS = 7;
const CROWN_Y = 58.1;
const RAY_LENGTH = 4.6;
/** From vertical. Enough that the tips crest the skull instead of hiding behind it. */
const RAY_SPLAY = 0.85;

/** Points of Fort Wood, the star the pedestal actually stands in. */
const BASTIONS = 11;

function radiusAt(y: number): number {
  const first = ROBE[0]!;
  if (y <= first.y) return first.r;
  for (let i = 1; i < ROBE.length; i++) {
    const a = ROBE[i - 1]!;
    const b = ROBE[i]!;
    if (y <= b.y) return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
  }
  return ROBE[ROBE.length - 1]!.r;
}

export const statueOfLiberty: Monument = {
  id: 'statue-of-liberty',
  name: 'Statue of Liberty',
  iso: 'USA',
  lat: 40.689,
  lon: -74.045,
  realHeight: 93,
  tier: 'tower',
  footprint: 24,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, ringWall, around } = ctx;
    const copper = palette.green; // the patina, and the only colour above the stone
    const granite = palette.slate;
    const trim = palette.bone;
    const rampart = palette.steel;
    const gold = palette.gold;
    const group = new THREE.Group();

    // --- Fort Wood: one low dark mass, eleven points ---
    // Two rewrites, both of them about the points reading as loose boulders
    // dropped round the pedestal rather than as a star. Drum and points share a
    // height and a colour so the outline draws one body; the points are wide
    // enough to overlap each other where they meet the drum, so the notches
    // between them stop short instead of cutting all the way in; and the coping
    // above is **inset**, because an overhanging one hid exactly the ring of
    // drum that ties the eleven points together.
    group.add(taper(15.6, 14.6, 5, rampart, BASTIONS));
    group.add(
      around(BASTIONS, () => {
        const bastion = taper(4.3, 3.7, 5, rampart, 4);
        bastion.position.z = 17.85;
        // Corner outward, not face outward: a square leaves a scalloped ring,
        // a diamond leaves points.
        bastion.rotation.y = Math.PI / 4;
        return bastion;
      }),
    );

    const coping = ringWall(12, 14.2, 1, trim, BASTIONS);
    coping.position.y = 5;
    // `ringWall` is lathed and starts on a vertex; the prism helpers start on a
    // flat. Half a segment lines the two up.
    coping.rotation.y = Math.PI / BASTIONS;
    group.add(coping);

    // --- the pedestal, square on the star ---
    const plinth = taper(10, 9.6, 2.6, granite, 4);
    plinth.position.y = FORT_TOP;
    group.add(plinth);

    const shaft = taper(9.2, 8, 12, granite, 4);
    shaft.position.y = 8.6;
    group.add(shaft);

    // The loggia. It costs twelve of eighty meshes and earns them twice: without
    // it the pedestal is twelve blank units of granite in the middle of the
    // frame, and the cornice above overhangs the battered shaft by a unit and a
    // half with visibly nothing holding it up.
    group.add(
      around(4, () => {
        const face = new THREE.Group();
        for (const x of [-5.2, 0, 5.2]) {
          const pillar = column(0.78, 5.6, trim, 6);
          pillar.position.set(x, 13.4, 8.5);
          face.add(pillar);
        }
        return face;
      }),
    );

    const cornice = box(18.4, 1.7, 18.4, trim);
    cornice.position.y = 20.6;
    group.add(cornice);

    // The lip the statue stands on: wider than the hem all round, which is the
    // whole reason the flare is visible at all.
    const dais = taper(9, 8.6, 1.7, granite, 4);
    dais.position.y = 22.3;
    group.add(dais);

    // --- the robe ---
    const body = new THREE.Group();
    body.scale.z = DEPTH;
    group.add(body);

    for (let i = 0; i + 1 < ROBE.length; i++) {
      const a = ROBE[i]!;
      const b = ROBE[i + 1]!;
      const course = taper(a.r, b.r, b.y - a.y, copper, SIDES);
      course.position.y = a.y;
      body.add(course);
    }

    // Folds. Christ the Redeemer's trick — they carry no colour, they exist so
    // the outline has something to draw down the robe — but only on the five
    // faces that can be seen. The rear three would be six draw calls for
    // nothing, and here that is a tenth of the whole mesh budget.
    const folds = (bottom: number, top: number, thickness: number) =>
      around(SIDES, (index) =>
        index >= 3 && index <= 5
          ? null
          : strut(
              new THREE.Vector3(0, bottom, radiusAt(bottom) + 0.45),
              new THREE.Vector3(0, top, radiusAt(top) + 0.35),
              thickness,
              copper,
            ),
      );
    body.add(folds(25.9, 39.5, 1.8));
    body.add(folds(40.3, 49.6, 1.4));

    // Her right foot steps out from under the hem — the reason the hem is a lip
    // and not a skirt to the floor. Outside `body`, so the squash does not pull
    // it back under.
    const foot = box(2.9, 1.7, 4.8, copper);
    foot.position.set(-1.9, FEET, 6);
    group.add(foot);

    // --- shoulders, head, crown ---
    // Outside `body` for Christ's reason: this horizontal mass is what turns two
    // limbs into arms rather than sticks pushed into a torso.
    const shoulders = box(11.8, 3.6, 7.2, copper);
    shoulders.position.y = 48.6;
    group.add(shoulders);

    for (const side of [1, -1]) {
      const deltoid = box(4.4, 3.3, 5.4, copper);
      deltoid.position.set(side * 5.2, 48.9, 0);
      group.add(deltoid);
    }

    const neck = taper(2, 1.7, 2.6, copper, 6);
    neck.position.y = 51.8;
    group.add(neck);

    // Two units of neck showing under it, because with the shoulders any higher
    // the head stopped being a head and became the top course of the torso.
    const head = box(5.6, 6.2, 5, copper);
    head.position.y = 54;
    group.add(head);

    // The band sits low enough to leave skull above it. Level with the crown of
    // the head it swallowed the whole face and the figure lost its head.
    const diadem = column(3.05, 1.3, copper, SIDES);
    diadem.position.y = 57.4;
    group.add(diadem);

    const crown = around(CROWN_RAYS, () => {
      const ray = new THREE.Group();
      ray.position.set(0, CROWN_Y, 2.95);
      ray.rotation.x = RAY_SPLAY;
      ray.add(taper(0.7, 0, RAY_LENGTH, copper, 4));
      return ray;
    });
    crown.rotation.y = Math.PI / CROWN_RAYS;
    group.add(crown);

    // --- the raised right arm ---
    const arm = new THREE.Group();
    arm.position.set(-SHOULDER_X, SHOULDER_Y, 0.2);
    // A `taper` stands on +Y, so the rotation is the tilt off vertical and
    // nothing else. A positive Z rotation leans +Y toward -X: outward, her side.
    arm.rotation.z = ARM_TILT;
    arm.add(taper(2.2, 1.6, ARM_LENGTH, copper, 6));

    const fist = box(2.9, 2.7, 2.9, copper);
    fist.position.y = ARM_LENGTH - 0.5;
    arm.add(fist);
    group.add(arm);

    // --- the torch, standing plumb rather than following the arm ---
    const handle = column(0.85, 5.9, copper, SIDES);
    handle.position.set(TORCH_X, 59.5, 0.2);
    group.add(handle);

    const bowl = taper(1.25, 2.45, 1.6, gold, SIDES);
    bowl.position.set(TORCH_X, 65.4, 0.2);
    group.add(bowl);

    const gallery = ringWall(2.4, 3.1, 0.7, copper, SIDES);
    gallery.position.set(TORCH_X, 66.3, 0.2);
    gallery.rotation.y = Math.PI / SIDES;
    group.add(gallery);

    // Two pieces, because one cone reads as a spike. The bulge is what makes it
    // a flame, and gold is the only warm note in the whole model.
    const flame = taper(1.7, 2.35, 1.3, gold, 6);
    flame.position.set(TORCH_X, 67, 0.2);
    group.add(flame);

    const tip = taper(2.35, 0, TORCH_TIP - 68.3, gold, 6);
    tip.position.set(TORCH_X, 68.3, 0.2);
    group.add(tip);

    // --- the left arm, folded down and forward under the tablet ---
    const upperArm = new THREE.Group();
    upperArm.position.set(SHOULDER_X, 51.4, 0.4);
    upperArm.rotation.z = -2.79; // just past straight down, so the elbow swings out
    upperArm.add(taper(2.3, 1.7, 7.4, copper, 6));
    group.add(upperArm);

    group.add(
      strut(new THREE.Vector3(7.5, 44.3, 0.9), new THREE.Vector3(5, 42.4, 3.4), 1.9, copper),
    );

    const palm = box(2.3, 2, 2.4, copper);
    palm.position.set(4.9, 41.6, 3.4);
    group.add(palm);

    // --- the tablet ---
    // Tilted so its top corner rides up to the shoulder and its bottom corner
    // sits in the hand: a long diagonal, the only shape that fills the side of
    // the silhouette the raised arm left empty. Turned off the frontal plane as
    // well, so its face takes a different cel band from the robe behind it and
    // does not merge into the body at distance.
    const tablet = new THREE.Group();
    tablet.position.set(7.9, 44.4, 1.7);
    tablet.rotation.set(0, 0.3, -0.34);

    const slab = box(5, 7.8, 1.4, copper);
    slab.position.y = -3.9;
    tablet.add(slab);

    // The inscription, as two bars. Illegible on purpose: at this size a date is
    // two dark strokes, and two dark strokes are what say "there is writing on
    // it", which is all the tablet has to communicate.
    for (const y of [-0.7, 1]) {
      const line = box(3.3, 0.5, 0.35, rampart);
      line.position.set(0, y, 0.75);
      tablet.add(line);
    }
    group.add(tablet);

    return group;
  },
};
