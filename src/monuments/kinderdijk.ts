import { PROUD } from './contract.ts';
import type { Group, Monument } from './contract.ts';

/**
 * Kinderdijk Windmills.
 *
 * **The monument is the line, not the mill.** One windmill is a windmill;
 * nineteen of them standing in two rows along parallel canals, all alike and all
 * facing one way, is Kinderdijk. So the budget goes on composition rather than
 * on any one mill, and five things have to survive at thumbnail size:
 *
 * - **The four-sailed lattice cross**, and it has to read as a *frame with gaps*
 *   rather than a solid X. It is the only element that says windmill at all.
 * - **The squat octagonal thatched tower**, tapering upward, dark brown, on a
 *   low brick foot. 8.9 units across the flats against 13.8 of thatch, or 0.65,
 *   which is roughly what a Kinderdijk grondzeiler really is. A tower mill is
 *   half that. Squatness is the difference between this and a lighthouse.
 * - **Every mill facing the same way**, because they do: the caps are turned to
 *   one wind, so seven identical noses point at the viewer.
 * - **The flat green polder with the straight canals through it.**
 * - **The polder sitting *below* the water in the canals**, which is the whole
 *   reason the mills exist. Field 1.2, canal surface 4.3, dike crown 5.4: the
 *   water is held three units above the land it drains, and the front of the
 *   model is the low field with a drainage ditch running out of it.
 *
 * ## Seven mills, and why not five or nine
 *
 * The `building` tier's 110 meshes is the wall this model hits; triangles never
 * come close (1,680 of 2,600). A mill is 13 meshes — foot, tower, cap, and a
 * ten-piece cross — so seven of them are 91, and the ground and its props are
 * 14. Five mills would have bought a second rib in every sail bay and lost the
 * thing the rib was for: at two pixels to the unit, one 11-by-3-unit hole reads
 * and four 3-by-1 holes are a smear. Nine would not fit at any pitch that leaves
 * the crosses clear of each other.
 *
 * The rows are four on the near dike and three on the high dike behind, which is
 * also why the far row is *raised*: Kinderdijk drains in two stages, a low
 * boezem and a high one, and putting the second row three units up on the high
 * dike is both true and the only thing that reliably lifts it clear of the first.
 *
 * ## How still water reads
 *
 * The Golden Temple settled this and the answer is reused: **`steel`, not
 * `skyBlue`**, because water has to supply the dark. It does more work here than
 * in Amritsar, because there is no gold to be bright against — the card is a
 * green field under a cyan sky, and the canals are the only dark in it.
 * `skyBlue` would lay a second sky on the ground.
 *
 * Four things state the water, in order of how much they carry:
 *
 * 1. **A light towpath laid against the water's far edge.** Two units of `tan`
 *    on each dike's lip. This is the one element of the ground plan that exists
 *    for the camera rather than for the place, and it is worth more than the
 *    other three together. The camera looks down at 14 degrees, so a canal — a
 *    horizontal surface — keeps a quarter of its width, and a 16-unit channel
 *    comes back four units tall. The towpath puts the model's lightest and
 *    darkest values in contact along the canal's whole length, and it is that
 *    seam, not the area of water, that survives to 260 pixels.
 * 2. **The temperature split.** The hemisphere light's sky colour is the scene's
 *    blue, so a horizontal neutral goes cool while the vertical faces beside it
 *    stay warm. `steel` lying flat against green banks standing up, with an ink
 *    line between, is what says water — there is no blue pigment anywhere.
 * 3. **It is a slot, cut and edged twice.** The land is one green mass at the
 *    dike crown, the canals are cut 1.1 into it, and the low field beyond the
 *    near bank drops another 3.2. A plate flush with the ground is a stain; a
 *    channel with a lip on both sides is something you are looking into.
 * 4. **Things behave as though it were there.** A barge sits in the near canal
 *    with 1.2 of hull under the surface — pale `brown`, so it reads against the
 *    dark rather than dissolving into it — and a plank footbridge crosses on the
 *    two dike crowns with its deck 0.57 clear of the water.
 *
 * ## What is distorted, and by how much
 *
 * **No crop and no stretch.** At 108.9 units wide and 36.6 tall the model is
 * `halfDiagonal / height = 54.45 / 36.58 = 1.49`, well inside the 2.0 cap, so
 * unlike the Great Wall nothing here is a section stretched vertically to fit.
 * What is distorted is the **plan**, in one consistent direction:
 *
 * - **The line is compressed about 3.6x.** Real mills stand 100 to 150 m apart
 *   along the boezem with a 28 m sail span: a pitch of roughly 4.3 spans. Here
 *   the pitch is 26.6 against a 22.4-unit span, or 1.19. At the true spacing
 *   seven mills would need 700 units of canal, six times the footprint, and the
 *   row would have to be three mills long — which is not a row.
 * - **The canals are narrowed by about half** for the same reason: the near one
 *   is 16.6 units on a 22.4-unit span where life gives about 40 m on 28.
 * - **The sails are 2.5x too wide**, and this is the debt the compression is
 *   paid for with. A bay is 3.9 units deep on an 11.2-unit arm (0.35) where a
 *   real sail is about 2 m on 14 (0.14). At the true width the frame is two
 *   hairlines and the gap closes under the ink, and the gap is the whole point.
 *
 * The proportion that had to survive all of that is the **tower's**, and it is
 * untouched at 0.65.
 *
 * ## The sails
 *
 * Two stocks cross at the hub, offset 0.55 in depth so the ink draws the
 * crossing instead of one fused blob. Each of the four arms carries its bay on
 * the leading side only, which is what a real sail does and what gives the cross
 * a direction of rotation rather than a mirror symmetry. A bay is three pieces —
 * the stock under it, a rail over it, a rib closing the tip — and its fourth
 * side is the *other stock*, which passes right there anyway. One frame, one
 * hole 10.8 by 3.05, two meshes an arm.
 *
 * **The roll differs on every mill and the yaw does not.** That split is the
 * subject: the caps all face one wind, but no two sails are stopped at the same
 * clock position, and seven identical crosses would read as wallpaper rather
 * than as machines. The angles come off a golden-ratio sequence over the cross's
 * own 90 degrees of symmetry — 3, 59, 25, 80, 46, 12 and 67 degrees — which
 * spreads them with no two neighbours close and includes both the upright `+`
 * and the `X`. `Math.random()` is out: the loader builds twice and compares.
 *
 * The windshaft tilts back 0.12 rad, as it does in life. It costs one line and
 * it is the difference between a cross bolted to a wall and a cross on a shaft.
 */

// ---------------------------------------------------------------------------
// The polder. Everything on the ground is a band running across the model.
// ---------------------------------------------------------------------------

const HALF_X = 47;
const Z_FRONT = 26;
const Z_BACK = -27.5;

/** The drained land, the water held above it, and the high dike behind. */
const FIELD_TOP = 1.2;
const WATER_TOP = 4.3;
const DIKE_TOP = 5.4;
/** The far row stands on the high boezem's dike, three units over the near one. */
const HIGH_TOP = 8.6;
/**
 * Bands start buried in the polder slab. The water and the towpaths start
 * `PROUD` and twice that higher than the grass, because a buried floor still
 * flickers where two of different colours overlap in one plane.
 */
const BAND_BASE = 0.6;
const WATER_BASE = BAND_BASE + PROUD;
const PATH_BASE = BAND_BASE + PROUD * 2;

/**
 * `[front, back, top, water?]`, front to back. The water bands overlap their
 * dikes by 0.3 rather than meeting them: a shared plane flickers, and the
 * surface should stop exactly under the ink line, not a hair short of it. For
 * the same reason a canal stops `PROUD` short of the dikes' ends at either side.
 */
const BANDS: Array<[number, number, number, boolean]> = [
  [21.0, 19.5, DIKE_TOP, false], //     the bank you stand on to look across
  [19.8, 3.2, WATER_TOP, true], //      the near boezem canal
  [3.4, -6.4, DIKE_TOP, false], //      the near dike: four mills stand here
  [-6.4, -7.9, DIKE_TOP - 0.2, false], // the far canal's near bank
  [-8.2, -17.6, WATER_TOP, true], //    the far boezem, one level up the system
  [-17.4, -27.5, HIGH_TOP, false], //   the high dike: three mills, three up
];

/**
 * A towpath along the far bank of each canal: two units of `tan` laid on the
 * dike's own edge, a tenth of a unit proud on top, stepped `PROUD` back from
 * the dike's face and run `PROUD` past its ends so nothing is coplanar.
 *
 * It is the one thing in the ground plan that is not there for the plan's sake.
 * To the camera a canal is a horizontal surface seen at 14 degrees, so
 * it loses three quarters of its width to foreshortening and a wide dark band
 * comes back as a thin one. A light strip laid directly against the water's far
 * edge puts the model's brightest and darkest values in contact along the whole
 * length of the canal, and it is that seam, not the area of water, that carries
 * the canal at 260 pixels. `[front, back, top]`.
 */
const PATHS: Array<[number, number, number]> = [
  [3.4 - PROUD, 1.4, DIKE_TOP + 0.1],
  [-17.4 - PROUD, -19.4, HIGH_TOP + 0.1],
];

/**
 * A drainage ditch, crossing the foreground field into the near canal. It stops
 * `PROUD` inside the field's front face, which it would otherwise share.
 */
const DITCH = { x: -25, width: 1.8, from: Z_FRONT - PROUD, to: 20.2, top: 1.45 };

// ---------------------------------------------------------------------------
// The two rows
// ---------------------------------------------------------------------------

/** Centre to centre. A cross is 23.7 across its frames' corners, so they clear by 2.9. */
const PITCH = 26.6;
const NEAR_Z = -1.5;
const FAR_Z = -22.45;
const NEAR_X = [-1.5 * PITCH, -0.5 * PITCH, 0.5 * PITCH, 1.5 * PITCH];
/**
 * The far row, and these are measured numbers rather than a stagger.
 *
 * A half-pitch offset is the obvious answer and it is wrong twice over, because
 * the two cameras hide different things. The quarter view sits out at x = +114,
 * so a row 21 units further back is *sheared* on screen and not merely shrunk: a
 * far mill vanishes behind a near one at `1.115 * near - 13.1`, which is
 * x = -28.0, 1.7 and 31.4. The flat front view shears not at all and hides at
 * `1.115 * near`, which is x = ±14.8. An earlier draft of this file put mills at
 * -27.6, 1.5 and 30.0 — within half a unit of three quarter-view collisions —
 * and rendered seven mills as four silhouettes.
 *
 * These three sit in the gaps of the *union* of both hidden sets, 8.3 units
 * clear of the nearest one in either camera, which is about a tower's width: far
 * enough that a far mill always shows a shoulder past the near one, and it is
 * three units higher besides. Their 30-unit spacing against the near row's 26.6
 * is the same correction, and it is what makes two rows spaced equally in the
 * world *look* equally spaced.
 */
const FAR_X = [-37.0, -6.6, 23.1];

// ---------------------------------------------------------------------------
// One mill. Local origin is the dike crown it stands on.
// ---------------------------------------------------------------------------

/**
 * Brick foot. Half-widths are across the flats: 9.2 wide, on a 9.8-deep dike.
 * Its top stands 0.1 out from the tower's foot: at 4.4 against the tower's
 * 4.45 the two flanks lay a hair apart at one lean and flickered.
 */
const FOOT = { bottom: 4.6, top: 4.55, height: 1.4 };
/** The thatched octagon: 8.9 across against 13.8 of height. That ratio is the mill. */
const TOWER = { bottom: 4.45, top: 2.45, height: 13.8 };
/** The cap overhangs the tower top by 0.8. That shoulder is what stops the mill being a cone. */
const CAP = { bottom: 3.25, top: 1.5, height: 3.0 };

const HUB_Y = FOOT.height + TOWER.height + 1.0;
/** Far enough in front of the cap that the lowest sail clears the tower's flank. */
const HUB_Z = 2.95;
const TILT = -0.12;

// --- the cross ---
const REACH = 11.2;
const STOCK = 0.85;
const STOCK_DEPTH = 0.5;
/** Depth between the two stocks, so the crossing reads as two beams and not one. */
const PLANE_GAP = 0.55;
const BAR_DEPTH = 0.45;
/** The bay starts a hair off the hub — the other stock closes that end for free. */
const RAIL_INNER = 0.35;
const RAIL_WIDTH = 0.5;
const RIB_WIDTH = 0.5;
/** Underside of the rail. The hole is 10.3 by 3.0, which is 21 by 6 pixels in a thumbnail. */
const BAY_TOP = 3.4;

/**
 * Sail roll, in radians, for mill `index`.
 *
 * A golden-ratio sequence over the cross's own quarter turn: low-discrepancy, so
 * seven values spread evenly with no two neighbours near each other, and
 * completely deterministic. The 0.06 offset keeps the first mill just off true
 * vertical, because a perfectly upright cross reads as drawn rather than stopped.
 */
const rollAt = (index: number): number =>
  0.06 + ((index * 0.618033988749895) % 1) * (Math.PI / 2);

export const kinderdijk: Monument = {
  id: 'kinderdijk',
  name: 'Kinderdijk Windmills',
  iso: 'NLD',
  lat: 51.884,
  lon: 4.64,
  // No `realHeight`, matching the source list. Nineteen mills stand here and no
  // height belongs to all of them; and the number that would matter is not a
  // height at all but the depth of the polder below the water.
  tier: 'building',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const grass = palette.green; //     the drained polder
    const water = palette.steel; //     the canals. See the note at the top.
    const brick = palette.clay; //      the mills' feet, and the barge's cabin
    const thatch = palette.bark; //     the tower: the darkest thing standing up
    const oak = palette.brown; //       the cap, the barge's hull, the bridge deck
    const wood = palette.tan; //        towpaths and sails: the light against the dark

    const group = new THREE.Group();

    // --- the polder, and the water held above it ------------------------------

    const field = box(HALF_X * 2, FIELD_TOP, Z_FRONT - Z_BACK, grass);
    field.position.z = (Z_FRONT + Z_BACK) / 2;
    group.add(field);

    for (const [front, back, top, wet] of BANDS) {
      const base = wet ? WATER_BASE : BAND_BASE;
      const long = wet ? (HALF_X - PROUD) * 2 : HALF_X * 2;
      const band = box(long, top - base, front - back, wet ? water : grass);
      band.position.set(0, base, (front + back) / 2);
      group.add(band);
    }

    for (const [front, back, top] of PATHS) {
      const path = box((HALF_X + PROUD) * 2, top - PATH_BASE, front - back, wood);
      path.position.set(0, PATH_BASE, (front + back) / 2);
      group.add(path);
    }

    const ditch = box(DITCH.width, DITCH.top - WATER_BASE, DITCH.from - DITCH.to, water);
    ditch.position.set(DITCH.x, WATER_BASE, (DITCH.from + DITCH.to) / 2);
    group.add(ditch);

    // --- things that behave as though the canal held water ---------------------

    // A barge, 1.2 of its hull under the surface and 0.6 of it above.
    const hull = box(9, 1.8, 2.6, oak);
    hull.position.set(18, WATER_TOP - 1.2, 11.5);
    hull.rotation.y = 0.06;
    group.add(hull);

    const cabin = box(2.6, 1.3, 2, brick);
    cabin.position.set(20.2, WATER_TOP + 0.6, 11.5);
    cabin.rotation.y = 0.06;
    group.add(cabin);

    // A plank footbridge from one dike crown to the other, its deck 0.57 clear
    // of the water. It lands in the gap between two mills, never in front of one.
    // It is let `PROUD` down into the dike crowns and stops `PROUD` inside the
    // bank's face at each end, rail and all: level and flush, its top and its
    // ends shared their planes with the grass and flickered.
    const span = 20 - PROUD * 2;
    const deck = box(2.4, 0.45, span, oak);
    deck.position.set(-30, DIKE_TOP - 0.45 - PROUD, 11.0);
    group.add(deck);

    const handrail = box(0.3, 1, span, wood);
    handrail.position.set(-31, DIKE_TOP - PROUD, 11.0);
    group.add(handrail);

    // --- one mill --------------------------------------------------------------

    const mill = (roll: number): Group => {
      const body = new THREE.Group();

      body.add(taper(FOOT.bottom, FOOT.top, FOOT.height, brick, 8));

      const tower = taper(TOWER.bottom, TOWER.top, TOWER.height, thatch, 8);
      tower.position.y = FOOT.height;
      body.add(tower);

      const cap = taper(CAP.bottom, CAP.top, CAP.height, oak, 8);
      cap.position.y = FOOT.height + TOWER.height;
      body.add(cap);

      // The windshaft's tilt lives on its own group, so the roll below can be
      // written in the honest plane of the sails.
      const head = new THREE.Group();
      head.position.set(0, HUB_Y, HUB_Z);
      head.rotation.x = TILT;
      body.add(head);

      const cross = new THREE.Group();
      cross.rotation.z = roll;
      head.add(cross);

      // The two stocks, offset in depth so the ink finds the crossing.
      const alongX = box(REACH * 2, STOCK, STOCK_DEPTH, wood);
      alongX.position.y = -STOCK / 2;
      cross.add(alongX);

      const alongY = box(STOCK, REACH * 2, STOCK_DEPTH, wood);
      alongY.position.set(0, -REACH, PLANE_GAP);
      cross.add(alongY);

      // Four bays, each on the leading side of its own arm. Rotating by a
      // quarter turn carries the bay to the far side of the opposite arm, which
      // is exactly the rotational symmetry a real cross has.
      for (let arm = 0; arm < 4; arm++) {
        const sail = new THREE.Group();
        sail.rotation.z = (arm * Math.PI) / 2;
        // Arms 0 and 2 belong to the first stock, 1 and 3 to the second, so each
        // bay sits in the plane of the beam that carries it.
        sail.position.z = arm % 2 === 0 ? 0 : PLANE_GAP;

        const rail = box(REACH - RAIL_INNER, RAIL_WIDTH, BAR_DEPTH, wood);
        rail.position.set((RAIL_INNER + REACH) / 2, BAY_TOP, 0);
        sail.add(rail);

        const rib = box(RIB_WIDTH, BAY_TOP + RAIL_WIDTH + STOCK / 2, BAR_DEPTH, wood);
        rib.position.set(REACH - RIB_WIDTH / 2, -STOCK / 2, 0);
        sail.add(rib);

        cross.add(sail);
      }

      return body;
    };

    // --- the two rows ----------------------------------------------------------

    let index = 0;
    for (const [z, offsets] of [
      [NEAR_Z, NEAR_X],
      [FAR_Z, FAR_X],
    ] as Array<[number, number[]]>) {
      for (const x of offsets) {
        const one = mill(rollAt(index));
        one.position.set(x, z === FAR_Z ? HIGH_TOP : DIKE_TOP, z);
        group.add(one);
        index++;
      }
    }

    return group;
  },
};
