import type { Monument } from './contract.ts';

/**
 * Christ the Redeemer.
 *
 * The third exemplar on purpose: neither a tower nor a ring, and the one that
 * pushes back hardest on the contract. It is a *figure*, so what matters is
 * proportion rather than repetition, and its widest point is not its base — the
 * arms reach 47 units out from a trunk 19 wide, which is what makes `footprint`
 * an enclosing radius rather than a base radius.
 *
 * It also settles the argument about tiers. The Eiffel Tower is 330 m and this
 * is 38 m, and both are `landmark`, both 120 units. Ninefold wrong in metres,
 * and right in the world: both are things you are supposed to see from far off
 * and walk towards.
 *
 * **The silhouette is a T over a trapezoid, and it took two attempts.** The
 * first version was a post with a crossbar: it passed every check in `validate`
 * — base at zero, inside its footprint, filling its tier, well under budget —
 * and read as a scarecrow. Four things fixed it, and all four are about mass
 * rather than detail:
 *
 * - the robe **flares** from a pinched waist to a hem as wide as the plinth, so
 *   the lower half is a trapezoid and not a stick;
 * - the body is **flattened front to back** (`DEPTH`), because seen from the
 *   side the statue is a slab, and round prisms read as a totem pole;
 * - the shoulders are a **separate horizontal mass** wider than the chest, which
 *   is what makes the arms read as arms and not as a crossbar through a post;
 * - the arms **taper** from shoulder to wrist and end in hands.
 *
 * That is the lesson for anyone writing the next one: the validator measures the
 * bounding box, and a cross fills a bounding box perfectly.
 */

const PLINTH = 16;
const CROWN = 120;

/**
 * Half-width of the body at each height, and the whole shape of the figure.
 * The hem is 16.5 against a 7.4 waist, and wider than the 11 of the shoulders:
 * that 2.2:1 flare *is* the robe, and it is the whole difference between this
 * silhouette and a crucifix.
 */
const ROBE = [
  { y: PLINTH, r: 16.5 }, // hem, a lip proud of the section above so the ink catches it
  { y: 20, r: 15.2 },
  { y: 32, r: 12.2 },
  { y: 45, r: 9.9 },
  { y: 58, r: 8.3 },
  { y: 70, r: 7.4 }, // waist
  { y: 83, r: 8.4 },
  { y: 95, r: 9.6 }, // chest
];

/** Faces of the body prism. Drapery folds are laid one per face, so they sit flat on it. */
const SIDES = 8;

/** How much narrower the statue is front to back than side to side. */
const DEPTH = 0.68;

const SHOULDER_Y = 97;
const SHOULDER_X = 8;
const ARM_LENGTH = 33;
const HAND_LENGTH = 6;
/** A few degrees below horizontal. Enough to be a gesture, not enough to lose the line. */
const DROOP = 0.09;

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

export const christTheRedeemer: Monument = {
  id: 'christ-the-redeemer',
  name: 'Christ the Redeemer',
  iso: 'BRA',
  lat: -22.9519,
  lon: -43.2105,
  realHeight: 38,
  tier: 'landmark',
  footprint: 48,

  build(ctx) {
    const { THREE, palette, box, taper, strut, around } = ctx;
    const stone = palette.bone;
    const dark = palette.steel;
    const plinth = palette.slate;
    const group = new THREE.Group();

    // --- plinth: 13% of the height, and wider than the hem it carries ---
    group.add(box(36, 2.5, 28, plinth));
    const block = taper(17.6, 17, PLINTH - 2.5, plinth, 4);
    block.position.y = 2.5;
    group.add(block);

    // --- body ---
    const body = new THREE.Group();
    body.scale.z = DEPTH;
    group.add(body);

    for (let i = 0; i + 1 < ROBE.length; i++) {
      const a = ROBE[i]!;
      const b = ROBE[i + 1]!;
      const section = taper(a.r, b.r, b.y - a.y, stone, SIDES);
      section.position.y = a.y;
      body.add(section);
    }

    // Drapery. The folds carry no colour of their own — they exist so the
    // outline has something to draw down the robe, which is the cheapest cloth
    // there is. One per face of the prism, standing 1.4 units proud of it.
    const folds = (bottom: number, top: number, thickness: number) =>
      around(SIDES, () =>
        strut(
          new THREE.Vector3(0, bottom, radiusAt(bottom) + 0.5),
          new THREE.Vector3(0, top, radiusAt(top) + 0.4),
          thickness,
          stone,
        ),
      );
    body.add(folds(20, 68, 1.9));
    body.add(folds(73, 93, 1.4));

    // Outside `body`, so it keeps its depth: this mass is the difference
    // between outstretched arms and a crossbar.
    const shoulders = box(22, 7, 13, stone);
    shoulders.position.y = 94;
    group.add(shoulders);

    // --- arms ---
    for (const side of [1, -1]) {
      const arm = new THREE.Group();
      arm.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
      // A `taper` stands on +Y, so a quarter turn about Z lays it out sideways;
      // the extra `DROOP` past the quarter turn is what tips the hand downward.
      arm.rotation.z = -side * (Math.PI / 2 + DROOP);

      arm.add(taper(5, 3, ARM_LENGTH, stone, 6));

      const hand = box(6.2, HAND_LENGTH, 7, stone);
      hand.position.y = ARM_LENGTH;
      arm.add(hand);

      group.add(arm);
    }

    // --- head ---
    const neck = taper(3.8, 3.2, 6, stone, 6);
    neck.position.y = 101;
    group.add(neck);

    const head = box(11.2, 11.5, 10, stone);
    head.position.y = 106.5;
    group.add(head);

    // Hair and beard are kept deliberately shallow. An earlier pass had 4.4 of
    // hair over 4.6 of beard on an 11-unit head, which left three units of face
    // between them: at thumbnail size the head went solid dark and stopped
    // reading as a head at all.
    const hair = box(11.7, 3.6, 10.6, dark);
    hair.position.y = CROWN - 3.6;
    group.add(hair);

    // Hair down the back. Cheap, and it stops the profile view ending in a flat
    // wall behind the ears.
    const mane = box(9.6, 7, 3.2, dark);
    mane.position.set(0, 109, -4.8);
    group.add(mane);

    const beard = box(3.8, 3.2, 1.8, dark);
    beard.position.set(0, 108.3, 4.8);
    group.add(beard);

    return group;
  },
};
