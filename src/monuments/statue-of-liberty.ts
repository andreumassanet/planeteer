import type { Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Statue of Liberty.
 *
 * A figure like Christ the Redeemer, but asymmetric: one arm goes up and away
 * on its own, the other is folded down behind a tablet. Four things carry the
 * silhouette: the raised right arm (12 units, 19 degrees off vertical, so there
 * is sky between it and the head), the crown with seven countable rays
 * (`CROWN_RAYS`), the tablet leaning out of her left side, and the robe's hem,
 * which ends the pedestal in a plain lip a unit wider so the flare reads.
 *
 * Tier `tower`: the landmark of New York, not of the planet.
 *
 * Her right hand is at -X: for a group facing +Z with +Y up, right is
 * `forward x up`, so the torch lands on the viewer's left.
 *
 * Left out: the broken chain at her feet and the folds on the three rearmost
 * faces of the robe. The pedestal is 34% of the height against 51% in life, so
 * the figure keeps more of the frame.
 */

// --- the vertical stack; the top of one course is the base of the next ---
const FORT_TOP = 6;
/** Top of the pedestal, and so the statue's own feet. */
const FEET = 24;
const TORCH_TIP = 69.9;

/**
 * Half-width of the robe at each height. The 8.6 hem against a 4.8 waist is a
 * 1.8:1 flare; the hem has to stay inside the pedestal's top lip.
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
/** Off vertical, leaning outward. */
const ARM_TILT = 0.37;
/** Where the wrist lands, and therefore where the torch has to stand. */
const TORCH_X = -(SHOULDER_X + ARM_LENGTH * Math.sin(ARM_TILT));

/**
 * Seven rays, still countable at thumbnail size. Half a step of offset keeps one
 * from pointing straight down the camera and spreads the tips over seven screen
 * positions. They are about a third longer than life against the head.
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
    // Drum and points share a height and a colour so the outline draws one body;
    // the points overlap where they meet the drum, and the coping is inset so it
    // does not hide the ring of drum that ties them together.
    group.add(taper(15.6, 14.6, 5, rampart, BASTIONS));
    group.add(
      around(BASTIONS, () => {
        const bastion = taper(4.3, 3.7, 5, rampart, 4);
        bastion.position.z = 17.85;
        // Corner outward, not face outward: a diamond leaves points.
        bastion.rotation.y = Math.PI / 4;
        return bastion;
      }),
    );

    const coping = ringWall(12, 14.2, 1, trim, BASTIONS);
    coping.position.y = 5;
    // `ringWall` is lathed and starts on a vertex; the prism helpers start on a flat. Half a segment lines them up.
    coping.rotation.y = Math.PI / BASTIONS;
    group.add(coping);

    // --- the pedestal, square on the star ---
    const plinth = taper(10, 9.6, 2.6, granite, 4);
    plinth.position.y = FORT_TOP;
    group.add(plinth);

    const shaft = taper(9.2, 8, 12, granite, 4);
    shaft.position.y = 8.6;
    group.add(shaft);

    // The loggia: without it the pedestal is blank granite and the cornice
    // overhangs the battered shaft with nothing holding it up.
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

    // The lip the statue stands on, wider than the hem all round so the flare is visible.
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

    // Folds carry no colour; they give the outline something to draw down the
    // robe, on the five faces that can be seen.
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

    // Her right foot steps out from under the hem. Outside `body`, so the squash does not pull it back under.
    const foot = box(2.9, 1.7, 4.8, copper);
    foot.position.set(-1.9, FEET, 6);
    group.add(foot);

    // --- shoulders, head, crown ---
    // Outside `body`: this horizontal mass turns two limbs into arms.
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

    // Two units of neck show under the head.
    const head = box(5.6, 6.2, 5, copper);
    head.position.y = 54;
    group.add(head);

    // The band sits low enough to leave skull above it.
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
    // A `taper` stands on +Y, so the rotation is the tilt off vertical. A positive Z rotation leans +Y toward -X.
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

    // Its top stops `PROUD` under the bowl's rim.
    const gallery = ringWall(2.4, 3.1, 0.7 - PROUD, copper, SIDES);
    gallery.position.set(TORCH_X, 66.3, 0.2);
    gallery.rotation.y = Math.PI / SIDES;
    group.add(gallery);

    // Two pieces, because one cone reads as a spike; gold is the model's only warm note.
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
    // Tilted so its top corner rides up to the shoulder and its bottom corner sits
    // in the hand, and turned off the frontal plane so its face takes a different
    // cel band from the robe.
    const tablet = new THREE.Group();
    tablet.position.set(7.9, 44.4, 1.7);
    tablet.rotation.set(0, 0.3, -0.34);

    const slab = box(5, 7.8, 1.4, copper);
    slab.position.y = -3.9;
    tablet.add(slab);

    // The inscription, as two dark bars.
    for (const y of [-0.7, 1]) {
      const line = box(3.3, 0.5, 0.35, rampart);
      line.position.set(0, y, 0.75);
      tablet.add(line);
    }
    group.add(tablet);

    return group;
  },
};
